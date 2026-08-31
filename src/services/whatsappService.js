/**
 * خدمة الواتساب (WhatsApp Gateway & Evolution API v2 Integration)
 * تدعم:
 * 1. Evolution API v2 (الرسمي الموصى به - محلي أو سحابي على AWS)
 * 2. طابور إرسال تسلسلي متتابع (FIFO Queue) مع تأخير ذكي ضد الحظر (Anti-Ban Rate Limiter)
 * 3. فحص الاتصال وتوليد رمز الـ QR Code مباشرة من النظام
 * 4. إرسال المستندات وفواتير الـ PDF والنصوص التلقائية
 * 5. الإرسال المباشر المجاني (wa.me)
 * 6. التوافقية العكسية مع الخوادم المخصصة القديمة و UltraMsg
 */

/**
 * تحويل أرقام الهواتف العراقية والدولية إلى الصيغة الدولية القياسية بدون رموز
 * مثال: 07701234567 -> 9647701234567
 */
export function formatInternationalPhone(phone) {
  if (!phone) return '';
  let clean = String(phone).replace(/[^\d]/g, '').trim();

  // معالجة الأرقام العراقية المحلية
  if (clean.startsWith('07') && clean.length === 11) {
    clean = '964' + clean.substring(1);
  } else if (clean.startsWith('7') && clean.length === 10) {
    clean = '964' + clean;
  } else if (clean.startsWith('00')) {
    clean = clean.substring(2);
  } else if (!clean.startsWith('964') && clean.length === 10 && clean.startsWith('7')) {
    clean = '964' + clean;
  }

  return clean;
}

/**
 * توليد رابط محادثة واتساب مباشر بنقرة واحدة (1-Click wa.me)
 */
export function getWhatsAppDirectUrl(phone, text) {
  const intPhone = formatInternationalPhone(phone);
  const encodedText = encodeURIComponent(text || '');
  if (intPhone) {
    return `https://wa.me/${intPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * القوالب الافتراضية لرسائل الواتساب
 */
export const DEFAULT_WHATSAPP_TEMPLATES = {
  invoice: 
`مرحباً بك عزيزي {customerName} 🌸
شكراً لتعاملك مع {storeName}.

📄 تفاصيل فاتورتك رقم: #{invoiceNumber}
📅 التاريخ: {invoiceDate}
💰 الإجمالي: {total} د.ع
💵 الواصل: {paidAmount} د.ع
{debtSection}
🌐 للاطلاع على الفاتورة وتفاصيل كشف الحساب عبر بوابة العملاء:
🔗 الرابط: {statementLink}
👤 اسم المستخدم: {username}
🔑 رمز المرور (الباسورد): {password}

نتشرف بخدمتكم دائماً ✨`,

  debtReminder:
`السلام عليكم أخي الكريم {customerName} 🌸
تحية طيبة من {storeName}.

نود تذكيركم بلطف بالمبلغ المستحق بذمتكم للمحل:
🔴 المبلغ المتبقي: {totalDebt} د.ع
📋 عدد الفواتير غير المسددة: {unpaidInvoicesCount} فاتورة

🌐 للاطلاع على كشف حسابك وفواتيرك بالتفصيل عبر بوابة العملاء:
🔗 الرابط: {statementLink}
👤 اسم المستخدم: {username}
🔑 رمز المرور (الباسورد): {password}

شاكرين لكم حسن تعاونكم الدائم 🙏✨`
};

/**
 * استبدال المتغيرات الذكية داخل قالب الرسالة
 */
export function renderWhatsAppTemplate(templateStr, variables = {}) {
  let result = templateStr || '';

  const username = variables.username || variables.customerName || '';
  const rawPhone = String(variables.phone || variables.phone1 || '').replace(/[^\d]/g, '');
  const last4 = rawPhone.length >= 4 ? rawPhone.slice(-4) : rawPhone;
  const password = variables.password || variables.pin || variables.pinCode || last4 || 'آخر 4 أرقام من هاتفك';

  const mergedVars = {
    ...variables,
    username: variables.username || username,
    password: variables.password || password,
    pin: variables.pin || password,
    pinCode: variables.pinCode || password,
    portalLink: variables.portalLink || variables.statementLink || ''
  };

  Object.keys(mergedVars).forEach((key) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, mergedVars[key] !== undefined ? String(mergedVars[key]) : '');
  });
  return result;
}

/* ==========================================================================
   🚀 طابور الإرسال التسلسلي الذكي (FIFO Dispatch Queue & Anti-Ban Rate Limiter)
   ========================================================================== */

let queuePromise = Promise.resolve();
let lastDispatchTimestamp = 0;

/**
 * تنفيذ مهمة إرسال داخل الطابور التسلسلي مع فاصل زمني ضد حظر واتساب
 * @param {Function} taskFn الدالة البرمجية للإرسال
 * @param {number} minDelayMs الحد الأدنى للتأخير بين كل رسالة وأخرى (افتراضياً 2500 مللي ثانية)
 */
export function enqueueWhatsAppTask(taskFn, minDelayMs = 2500) {
  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastDispatchTimestamp;
    if (elapsed < minDelayMs && lastDispatchTimestamp > 0) {
      const waitTime = minDelayMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    try {
      const result = await taskFn();
      lastDispatchTimestamp = Date.now();
      return result;
    } catch (err) {
      lastDispatchTimestamp = Date.now();
      throw err;
    }
  };

  const nextPromise = queuePromise.then(runTask, runTask);
  queuePromise = nextPromise.catch(() => {});
  return nextPromise;
}

/* ==========================================================================
   ⚡ أدوات الربط مع Evolution API v2 (Session, QR, Connection State)
   ========================================================================== */

/**
 * تنظيف رابط الخادم وحذف الشُرط المائلة الزائدة
 */
export function normalizeServerBaseUrl(url) {
  if (!url) return '';
  let clean = String(url).trim().replace(/[,;\s]+$/, '');
  // إذا كان الرابط يحتوي على مسار رسائل قديم نقوم باقتصاصه للحصول على Base URL
  clean = clean.replace(/\/messages\/(chat|document).*/, '');
  clean = clean.replace(/\/message\/(sendText|sendMedia).*/, '');
  clean = clean.replace(/\/instance\/.*/, '');
  return clean.replace(/\/+$/, '');
}

/**
 * فحص حالة اتصال جلسة Evolution API
 */
export async function checkEvolutionConnectionState({ baseUrl, instanceName, apiKey }) {
  const base = normalizeServerBaseUrl(baseUrl);
  const instance = (instanceName || 'SafeZone').trim();
  const token = (apiKey || 'SafeZone2026').trim();

  if (!base) {
    throw new Error('يرجى تحديد رابط خادم Evolution API');
  }

  const endpoint = `${base}/instance/connectionState/${encodeURIComponent(instance)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': token,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      return { exists: false, connected: false, state: 'not_found' };
    }

    const data = await res.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || (data?.connected ? 'open' : 'close');
    const isConnected = state === 'open' || state === 'connected';

    return {
      exists: true,
      connected: isConnected,
      state: state,
      phone: data?.instance?.owner || data?.phone || '',
      name: data?.instance?.profileName || data?.name || instance
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بخادم Evolution API (Timeout)');
    }
    throw err;
  }
}

/**
 * إنشاء الجلسة أو طلب رمز الـ QR Code من Evolution API
 */
export async function getEvolutionQRCode({ baseUrl, instanceName, apiKey }) {
  const base = normalizeServerBaseUrl(baseUrl);
  const instance = (instanceName || 'SafeZone').trim();
  const token = (apiKey || 'SafeZone2026').trim();

  if (!base) {
    throw new Error('يرجى إدخال رابط خادم Evolution API');
  }

  // 1. محاولة طلب الاتصال ورمز QR مباشرة
  const connectEndpoint = `${base}/instance/connect/${encodeURIComponent(instance)}`;
  
  try {
    const res = await fetch(connectEndpoint, {
      method: 'GET',
      headers: {
        'apikey': token,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      // Evolution API v2 قد تعيد base64 أو code أو pairingCode
      const qrBase64 = data?.base64 || data?.qrcode?.base64 || (data?.code && data.code.startsWith('data:') ? data.code : null);
      const pairingCode = data?.pairingCode || null;
      return {
        success: true,
        base64: qrBase64,
        code: data?.code || null,
        pairingCode: pairingCode,
        count: data?.count || 1
      };
    }

    // إذا كانت الجلسة غير موجودة (404)، نقوم بإنشائها أولاً
    if (res.status === 404) {
      const createEndpoint = `${base}/instance/create`;
      const createRes = await fetch(createEndpoint, {
        method: 'POST',
        headers: {
          'apikey': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceName: instance,
          token: token,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      });

      const createData = await createRes.json().catch(() => ({}));
      const qrBase64 = createData?.qrcode?.base64 || createData?.base64 || null;
      return {
        success: true,
        base64: qrBase64,
        code: createData?.code || null,
        pairingCode: createData?.pairingCode || null,
        created: true
      };
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.message || `فشل جلب رمز QR (كود: ${res.status})`);

  } catch (err) {
    console.error('getEvolutionQRCode error:', err);
    throw err;
  }
}

/**
 * تسجيل الخروج وفصل الجلسة من Evolution API
 */
export async function logoutEvolutionInstance({ baseUrl, instanceName, apiKey }) {
  const base = normalizeServerBaseUrl(baseUrl);
  const instance = (instanceName || 'SafeZone').trim();
  const token = (apiKey || 'SafeZone2026').trim();

  const endpoint = `${base}/instance/logout/${encodeURIComponent(instance)}`;
  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      'apikey': token,
      'Content-Type': 'application/json'
    }
  });

  return await res.json().catch(() => ({ success: res.ok }));
}

/* ==========================================================================
   📤 دوال الإرسال الموحدة (Universal Message & Document Senders)
   ========================================================================== */

/**
 * إرسال رسالة نصية عبر بوابة الواتساب (Evolution API v2 / Custom Server)
 * مزودة بـ FIFO Queue وتأخير ذكي ضد الحظر
 */
export async function sendWhatsAppMessageViaGateway({ 
  phone, 
  message, 
  delayMinutes = 0,
  delaySeconds = 0,
  sendAt = null,
  settings,
  skipQueue = false
}) {
  const intPhone = formatInternationalPhone(phone);
  if (!intPhone) {
    throw new Error('رقم الهاتف غير صالح للإرسال');
  }

  const doSend = async () => {
    const rawApiUrl = (settings?.whatsappApiUrl || '').trim();
    const instanceId = (settings?.whatsappInstanceId || 'SafeZone').trim();
    const token = (settings?.whatsappToken || 'SafeZone2026').trim();
    const provider = settings?.whatsappProvider || 'evolution'; // 'evolution' | 'custom' | 'ultramsg'

    const base = normalizeServerBaseUrl(rawApiUrl);

    // 1. الوضع الأول: Evolution API v2 (الرسمي والموصى به)
    const isEvolution = provider === 'evolution' || 
      (!rawApiUrl.includes('/messages/chat') && !rawApiUrl.includes('ultramsg.com'));

    if (isEvolution && base) {
      const endpoint = `${base}/message/sendText/${encodeURIComponent(instanceId)}`;
      
      const payload = {
        number: intPhone,
        text: message,
        delay: Math.max(1200, (delaySeconds || 0) * 1000),
        linkPreview: true
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': token
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error || data.status === 'ERROR') {
        throw new Error(data.message || data.error || `فشل الإرسال عبر Evolution API (رمز: ${response.status})`);
      }
      return data;
    }

    // 2. الوضع الثاني: التوافقية العكسية مع الخوادم المخصصة السابقة أو UltraMsg
    const defaultBase = 'http://13.61.182.143:3005';
    let apiUrl = rawApiUrl;
    if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      apiUrl = `${defaultBase}/messages/chat`;
    } else if (instanceId && !apiUrl.startsWith('http')) {
      apiUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    }

    const endpoint = apiUrl.includes('{instance_id}')
      ? apiUrl.replace('{instance_id}', instanceId || 'local')
      : (apiUrl.startsWith('http') ? apiUrl : `${defaultBase}/messages/chat`);

    const payload = {
      token: token,
      to: intPhone,
      body: message,
      message: message,
    };

    if (sendAt) payload.sendAt = sendAt;
    if (delayMinutes > 0) payload.delayMinutes = delayMinutes;
    if (delaySeconds > 0) payload.delaySeconds = delaySeconds;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (data.error || data.sent === 'false' || data.status === 'error') {
      throw new Error(data.error || data.message || 'فشل إرسال الرسالة عبر بوابة الواتساب');
    }

    return data;
  };

  if (skipQueue) {
    return await doSend();
  }
  return await enqueueWhatsAppTask(doSend);
}

/**
 * إرسال مستند / فاتورة PDF عبر بوابة الواتساب (Evolution API v2 / Custom Server)
 */
export async function sendWhatsAppDocumentViaGateway({ 
  phone, 
  documentBase64, 
  html, 
  filename = 'invoice.pdf', 
  caption = '', 
  delayMinutes = 0,
  delaySeconds = 0,
  sendAt = null,
  settings,
  skipQueue = false
}) {
  const intPhone = formatInternationalPhone(phone);
  if (!intPhone) {
    throw new Error('رقم الهاتف غير صالح للإرسال');
  }

  const doSendDoc = async () => {
    const rawApiUrl = (settings?.whatsappApiUrl || '').trim();
    const instanceId = (settings?.whatsappInstanceId || 'SafeZone').trim();
    const token = (settings?.whatsappToken || 'SafeZone2026').trim();
    const provider = settings?.whatsappProvider || 'evolution';

    const base = normalizeServerBaseUrl(rawApiUrl);
    const isEvolution = provider === 'evolution' || 
      (!rawApiUrl.includes('/messages/chat') && !rawApiUrl.includes('ultramsg.com'));

    // 1. الوضع الأول: Evolution API v2 sendMedia
    if (isEvolution && base) {
      const endpoint = `${base}/message/sendMedia/${encodeURIComponent(instanceId)}`;
      
      // تنظيف صيغة الـ Base64
      let cleanMedia = documentBase64;
      if (cleanMedia && !cleanMedia.startsWith('http') && !cleanMedia.startsWith('data:')) {
        cleanMedia = `data:application/pdf;base64,${cleanMedia}`;
      }

      const payload = {
        number: intPhone,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: caption || '',
        media: cleanMedia,
        fileName: filename || 'invoice.pdf',
        delay: Math.max(1200, (delaySeconds || 0) * 1000)
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': token
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error || data.status === 'ERROR') {
        throw new Error(data.message || data.error || `فشل إرسال ملف PDF عبر Evolution API (رمز: ${response.status})`);
      }
      return data;
    }

    // 2. الوضع الثاني: التوافقية مع الخادم المخصص القديم
    const defaultBase = 'http://13.61.182.143:3005';
    let endpoint = `${defaultBase}/messages/document`;
    if (rawApiUrl && rawApiUrl.includes('ultramsg.com')) {
      endpoint = rawApiUrl.replace('/messages/chat', '/messages/document');
    } else if (rawApiUrl && rawApiUrl.includes('/messages/chat')) {
      endpoint = rawApiUrl.replace('/messages/chat', '/messages/document');
    }

    const payload = {
      token: token,
      to: intPhone,
      document: documentBase64,
      html: html,
      filename: filename,
      caption: caption,
      mimetype: 'application/pdf',
    };

    if (sendAt) payload.sendAt = sendAt;
    if (delayMinutes > 0) payload.delayMinutes = delayMinutes;
    if (delaySeconds > 0) payload.delaySeconds = delaySeconds;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (data.error || data.sent === 'false' || data.status === 'error') {
      throw new Error(data.error || data.message || 'فشل إرسال ملف الـ PDF عبر بوابة الواتساب');
    }

    return data;
  };

  if (skipQueue) {
    return await doSendDoc();
  }
  return await enqueueWhatsAppTask(doSendDoc, 3000);
}

/**
 * اختبار الاتصال بالبوابة وإرسال رسالة تجريبية
 */
export async function testWhatsAppGatewayConnection(testPhone, settings) {
  const testMsg = `🧪 *رسالة اختبار ربط الواتساب (Evolution API)*\n\nتم ربط واتساب متجر *${settings?.storeName || 'المنطقة الآمنة'}* بنجاح عبر سيرفر AWS! 🚀✨\nالتاريخ: ${new Date().toLocaleString('ar-IQ')}`;
  return await sendWhatsAppMessageViaGateway({
    phone: testPhone,
    message: testMsg,
    settings,
    skipQueue: true
  });
}
