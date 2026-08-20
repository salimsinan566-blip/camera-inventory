/**
 * خدمة الواتساب (WhatsApp Gateway & 1-Click Messaging)
 * تدعم الإرسال المباشر المجاني (wa.me) والإرسال التلقائي السحابي (UltraMsg / Evolution API / Gateway)
 */

/**
 * تحويل أرقام الهواتف العراقية والدولية إلى الصيغة الدولية القياسية بدون رموز
 * مثال: 07701234567 -> 9647701234567
 */
export function formatInternationalPhone(phone) {
  if (!phone) return '';
  let clean = String(phone).replace(/[^\d]/g, '').trim();

  // إذا كان يبدأ بـ 07 (رقم عراقي محلي)
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
🔗 يمكنك استعراض وتحميل فاتورتك رسمياً من خلال الرابط:
{statementLink}

نتشرف بخدمتكم دائماً ✨`,

  debtReminder:
`السلام عليكم أخي الكريم {customerName} 🌸
تحية طيبة من {storeName}.

نود تذكيركم بلطف بالمبلغ المستحق بذمتكم للمحل:
🔴 المبلغ المتبقي: {totalDebt} د.ع
📋 عدد الفواتير غير المسددة: {unpaidInvoicesCount} فاتورة

🔗 للاطلاع على كشف حسابك وفواتيرك بالتفصيل:
{statementLink}

شاكرين لكم حسن تعاونكم الدائم 🙏✨`
};

/**
 * استبدال المتغيرات الذكية داخل قالب الرسالة
 */
export function renderWhatsAppTemplate(templateStr, variables = {}) {
  let result = templateStr || '';
  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, variables[key] !== undefined ? String(variables[key]) : '');
  });
  return result;
}

/**
 * إرسال رسالة واتساب عبر البوابة السحابية (مع دعم الجدولة وتحديد وقت الإرسال)
 */
export async function sendWhatsAppMessageViaGateway({ 
  phone, 
  message, 
  delayMinutes = 0,
  delaySeconds = 0,
  sendAt = null,
  settings 
}) {
  const intPhone = formatInternationalPhone(phone);
  if (!intPhone) {
    throw new Error('رقم الهاتف غير صالح للإرسال');
  }

  const instanceId = settings?.whatsappInstanceId?.trim();
  const token = settings?.whatsappToken?.trim() || 'SafeZone2026';
  const defaultBase = 'https://dress-plus-outcomes-somerset.trycloudflare.com';
  
  let apiUrl = settings?.whatsappApiUrl?.trim();
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
}

/**
 * إرسال مستند / ملف PDF عبر بوابة الواتساب (مع دعم الجدولة وتحديد وقت الإرسال)
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
  settings 
}) {
  const intPhone = formatInternationalPhone(phone);
  if (!intPhone) {
    throw new Error('رقم الهاتف غير صالح للإرسال');
  }

  const instanceId = settings?.whatsappInstanceId?.trim();
  const token = settings?.whatsappToken?.trim() || 'SafeZone2026';
  const defaultBase = 'https://fence-centuries-arrow-freebsd.trycloudflare.com';
  
  // Document endpoint (local server or ultramsg document)
  let apiUrl = settings?.whatsappApiUrl?.trim();
  if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    apiUrl = `${defaultBase}/messages/chat`;
  }
  let endpoint = `${defaultBase}/messages/document`;
  
  if (apiUrl && apiUrl.includes('ultramsg.com')) {
    endpoint = apiUrl.replace('/messages/chat', '/messages/document');
  } else if (apiUrl && apiUrl.includes('/messages/chat')) {
    endpoint = apiUrl.replace('/messages/chat', '/messages/document');
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
}

/**
 * اختبار الاتصال بالبوابة وإرسال رسالة تجريبية
 */
export async function testWhatsAppGatewayConnection(testPhone, settings) {
  const testMsg = `🧪 *رسالة اختبار ربط الواتساب*\n\nتم ربط واتساب متجر ${settings?.storeName || 'المحل'} بالنظام بنجاح! 🚀✨\nالتاريخ: ${new Date().toLocaleString('ar-IQ')}`;
  return await sendWhatsAppMessageViaGateway({
    phone: testPhone,
    message: testMsg,
    settings,
  });
}
