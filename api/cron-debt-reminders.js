import { db } from './firebase-admin.js';

// Helper to normalize Arabic
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0640]/g, '');
}

// Convert Iraqi / international phone to standard format
function formatInternationalPhone(phone) {
  if (!phone) return '';
  let clean = String(phone).replace(/[^\d]/g, '').trim();

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

// Concurrency FIFO queue for in-flight cron requests within the runtime
let executionQueue = Promise.resolve();
function runSerialized(task) {
  const run = executionQueue.then(task, task);
  executionQueue = run.catch(() => {});
  return run;
}

// In-flight claimed debtor IDs cache (prevents duplicate dispatch across concurrent triggers)
const inFlightDebtorClaims = new Map(); // customerId -> timestamp

async function executeCronDebtReminders(req, res) {
  // 1. جلب إعدادات المتجر والواتساب
  const settingsDoc = await db.collection('settings').doc('store_info').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};

  // فحص ما إذا كان التذكير التلقائي مفعلاً
  const isAutoEnabled = settings.whatsappAutoReminders !== false;
  const instanceId = settings.whatsappInstanceId?.trim();
  const defaultBase = 'https://offerings-maybe-dem-representative.trycloudflare.com';

  let apiUrl = settings.whatsappApiUrl?.trim();
  if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    apiUrl = `${defaultBase}/messages/chat`;
  } else if (instanceId && !apiUrl.startsWith('http')) {
    apiUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
  }

  const force = req.query?.force === 'true';

  if (!force && !isAutoEnabled) {
    return res.status(200).json({ 
      status: 'skipped', 
      reason: 'WhatsApp auto-reminders disabled in settings.' 
    });
  }

  // 2. فحص اليوم والتاريخ والوقت بتوقيت العراق (Asia/Baghdad) بدقة كاملة
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(now); // 'YYYY-MM-DD'
  
  const iraqParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baghdad',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    weekday: 'long',
    day: 'numeric'
  }).formatToParts(now);

  const currentHour = parseInt(iraqParts.find(p => p.type === 'hour')?.value || '0', 10);
  const currentMinute = parseInt(iraqParts.find(p => p.type === 'minute')?.value || '0', 10);
  const currentDayName = (iraqParts.find(p => p.type === 'weekday')?.value || '').toLowerCase(); // e.g. 'thursday'
  const dayOfMonth = parseInt(todayStr.split('-')[2] || iraqParts.find(p => p.type === 'day')?.value || '1', 10);
  const defaultReminderDay = (settings.whatsappDefaultDay || 'thursday').toLowerCase();

  // 3. جلب وتجميع حسابات العملاء الدقيقة من المبيعات وسندات القبض بشكل طازج
  const [salesSnap, incomesSnap, custSnap] = await Promise.all([
    db.collection('sales').get(),
    db.collection('office_incomes').get(),
    db.collection('customers').get()
  ]);

  const customerFinancials = {};

  salesSnap.forEach(doc => {
    const s = doc.data();
    if (s.status === 'draft' || s.status === 'suspended' || s.status === 'cancelled') return;
    
    const rawName = (s.customerName || '').trim();
    const key = rawName ? normalizeArabic(rawName) : null;
    const cId = s.customerId ? String(s.customerId) : null;

    const total = Number(s.total || 0);
    const paid = Number(s.paidAmount || 0);
    const remaining = s.isSettled ? 0 : (s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, total - paid)) : Math.max(0, total - paid));

    const updateFin = (idKey) => {
      if (!idKey) return;
      if (!customerFinancials[idKey]) customerFinancials[idKey] = { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0 };
      customerFinancials[idKey].totalPurchases += total;
      if (s.invoiceType === 'debt') {
        customerFinancials[idKey].totalPaid += paid;
        customerFinancials[idKey].totalDebt += remaining;
        if (remaining > 0) customerFinancials[idKey].unpaidInvoicesCount += 1;
      } else {
        customerFinancials[idKey].totalPaid += total;
      }
    };

    if (cId) {
      updateFin(`id_${cId}`);
    } else if (key) {
      updateFin(`legacy_name_${key}`);
    }
  });

  incomesSnap.forEach(doc => {
    const inc = doc.data();
    const rawName = (inc.customerName || inc.payerName || '').trim();
    const key = rawName ? normalizeArabic(rawName) : null;
    const cId = inc.customerId ? String(inc.customerId) : null;

    const amt = Number(inc.amount || 0);

    const updateFin = (idKey) => {
      if (!idKey || !customerFinancials[idKey]) return;
      customerFinancials[idKey].totalPaid += amt;
      customerFinancials[idKey].totalDebt = Math.max(0, customerFinancials[idKey].totalDebt - amt);
    };

    if (cId) {
      updateFin(`id_${cId}`);
    } else if (key) {
      updateFin(`legacy_name_${key}`);
    }
  });

  // 4. مطابقة العملاء المستحقين للتذكير اليوم
  const targetCustomers = [];
  const nowTs = now.getTime();

  custSnap.forEach(doc => {
    const c = doc.data();
    const rawName = (c.name || '').trim();
    const norm = rawName ? normalizeArabic(rawName) : null;
    const cId = String(doc.id);

    // فحص القفل السريع للطلبات المتزامنة (In-flight memory claim guard)
    const inFlightClaimTime = inFlightDebtorClaims.get(cId);
    if (inFlightClaimTime && (nowTs - inFlightClaimTime < 60 * 1000)) {
      return; // تم حجز أو إرسال تذكير لهذا العميل خلال آخر 60 ثانية
    }
    
    const finById = customerFinancials[`id_${cId}`] || { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0 };
    const finByLegacyName = (norm && customerFinancials[`legacy_name_${norm}`]) || { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0 };
    
    const totalDebt = Math.max(0, finById.totalDebt + finByLegacyName.totalDebt);
    const unpaidInvoicesCount = finById.unpaidInvoicesCount + finByLegacyName.unpaidInvoicesCount;

    if (totalDebt <= 0) return; // لا يوجد عليه دين

    const phone = c.phone1 || c.phone;
    if (!phone) return; // لا يوجد هاتف

    const schedule = c.reminderSchedule || 'disabled';
    if (!schedule || schedule === 'disabled') return; // معطل تماماً

    const isHourly = schedule.startsWith('hourly_') || (schedule.startsWith('custom_') && schedule.includes('_hours'));
    const isMinutely = schedule.startsWith('minutely_') || (schedule.startsWith('custom_') && (schedule.includes('_mins') || schedule.includes('_min')));

    // فحص نافذة الوقت بالساعات والدقائق للمواعيد الأسبوعية واليومية والشهرية
    let targetTimeStr = settings.whatsappReminderTime || '20:00';
    if (schedule.includes('@')) {
      const parts = schedule.split('@');
      if (parts[1] && parts[1].includes(':')) targetTimeStr = parts[1];
    }
    const [targetHourStr, targetMinStr] = targetTimeStr.split(':');
    const targetHour = parseInt(targetHourStr || '20', 10);
    const targetMinute = parseInt(targetMinStr || '0', 10);

    const targetTotalMins = targetHour * 60 + targetMinute;
    const currentTotalMins = currentHour * 60 + currentMinute;

    // نافذة الوقت: يبدأ من الدقيقة المحددة وحتى +10 دقائق فقط (لمنع التكرار المتعدد ضمن نفس الساعة)
    const isTimeWindow = currentTotalMins >= targetTotalMins && currentTotalMins <= targetTotalMins + 10;

    let isDueToday = false;

    if (force) {
      isDueToday = true;
    } else if (isMinutely) {
      const intervalMinutes = parseInt(schedule.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
      if (!c.lastDebtReminderSent) {
        isDueToday = true;
      } else {
        const lastDate = new Date(c.lastDebtReminderSent);
        const diffMinutes = Math.abs(now.getTime() - lastDate.getTime()) / (1000 * 60);
        if (diffMinutes >= (intervalMinutes - 0.1)) {
          isDueToday = true;
        }
      }
    } else if (isHourly) {
      const intervalHours = parseInt(schedule.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2;
      if (!c.lastDebtReminderSent) {
        isDueToday = true;
      } else {
        const lastDate = new Date(c.lastDebtReminderSent);
        const diffTime = Math.abs(now.getTime() - lastDate.getTime());
        const diffHours = diffTime / (1000 * 60 * 60);
        if (diffHours >= (intervalHours - 0.1)) {
          isDueToday = true;
        }
      }
    } else if (isTimeWindow) {
      const schedCode = schedule.split('@')[0];
      if (schedCode === 'default' && currentDayName === defaultReminderDay) {
        isDueToday = true;
      } else if (schedCode === 'daily' || schedCode === 'every_day' || schedCode === 'custom_1_days' || schedCode === 'custom_1_day') {
        isDueToday = true;
      } else if (schedCode === currentDayName) {
        isDueToday = true;
      } else if (schedCode.startsWith('monthly_')) {
        const targetDay = parseInt(schedCode.replace('monthly_', ''), 10) || 1;
        const [yearStr, monthStr] = todayStr.split('-');
        const curYear = parseInt(yearStr, 10);
        const curMonth = parseInt(monthStr, 10); // 1-12
        const maxDaysInMonth = new Date(curYear, curMonth, 0).getDate();
        const safeTargetDay = Math.min(targetDay, maxDaysInMonth);
        if (dayOfMonth === safeTargetDay) {
          isDueToday = true;
        }
      } else if (schedCode.startsWith('custom_')) {
        const intervalDays = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 7;
        if (intervalDays <= 1) {
          isDueToday = true;
        } else if (!c.lastDebtReminderSent) {
          isDueToday = true;
        } else {
          try {
            const lastSentDateObj = new Date(c.lastDebtReminderSent);
            const lastDateBaghdadStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(lastSentDateObj);
            const dNow = new Date(todayStr + 'T00:00:00Z');
            const dLast = new Date(lastDateBaghdadStr + 'T00:00:00Z');
            const calendarDiffDays = Math.round((dNow.getTime() - dLast.getTime()) / (1000 * 60 * 60 * 24));
            if (calendarDiffDays >= intervalDays) {
              isDueToday = true;
            }
          } catch (e) {
            const diffTime = Math.abs(now.getTime() - new Date(c.lastDebtReminderSent).getTime());
            if (diffTime / (1000 * 60 * 60 * 24) >= (intervalDays - 0.05)) {
              isDueToday = true;
            }
          }
        }
      }
    }

    // فحص عدم تكرار الإرسال في نفس اليوم للأنماط اليومية/الأسبوعية والشهرية
    let lastSentDateStr = null;
    let diffSecondsSinceLastSent = Infinity;
    if (c.lastDebtReminderSent) {
      try {
        const lastSentDateObj = new Date(c.lastDebtReminderSent);
        lastSentDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(lastSentDateObj);
        diffSecondsSinceLastSent = (now.getTime() - lastSentDateObj.getTime()) / 1000;
      } catch (e) {
        lastSentDateStr = c.lastDebtReminderSent.slice(0, 10);
      }
    }

    // منع تكرار الإرسال إذا تم إرساله اليوم (أو خلال آخر 30 ثانية في حالة الـ force لمنع سباق التكرار)
    const isAlreadySentToday = lastSentDateStr === todayStr;
    const isRecentForceDuplicate = force && diffSecondsSinceLastSent < 30;
    const canDispatch = isDueToday && !isRecentForceDuplicate && (isMinutely || isHourly || force || !isAlreadySentToday);

    if (canDispatch) {
      targetCustomers.push({
        id: doc.id,
        name: rawName,
        phone: phone,
        totalDebt: totalDebt,
        unpaidInvoicesCount: unpaidInvoicesCount || 1,
        customerType: c.customerType || 'client'
      });
    }
  });

  if (targetCustomers.length === 0) {
    return res.status(200).json({ 
      status: 'completed', 
      message: 'No due debtors to remind right now.', 
      currentDay: currentDayName,
      sentCount: 0,
      results: []
    });
  }

  // 5. إقفال ذري وتحديث حالة العملاء المستحقين في Firestore وكاش الذاكرة لمنع تكرار الإرسال نهائياً عبر الطلبات المتزامنة
  const nowIso = now.toISOString();
  for (const cust of targetCustomers) {
    inFlightDebtorClaims.set(cust.id, Date.now());
  }

  await Promise.all(
    targetCustomers.map(cust => 
      db.collection('customers').doc(cust.id).set({
        lastDebtReminderSent: nowIso,
        lastDebtReminderClaimedAt: nowIso
      }, { merge: true }).catch(err => {
        console.error(`Failed to claim customer ${cust.id}:`, err.message);
      })
    )
  );

  // تنظيف الكاش القديم للحجوزات التي تجاوزت 5 دقائق
  for (const [id, timestamp] of inFlightDebtorClaims.entries()) {
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      inFlightDebtorClaims.delete(id);
    }
  }

  // إعادة ضبط الكاش المالي لضمان اتساق البيانات
  global.cachedFinancials = null;

  // 6. تجهيز رسائل التذكير
  const baseUrl = settings.customerPortalUrl || 'https://camera-inventory-1qfh.vercel.app';
  const storeName = settings.storeName || 'المحل';

  let successCount = 0;
  const results = [];

  for (const cust of targetCustomers) {
    const intPhone = formatInternationalPhone(cust.phone);
    if (!intPhone) continue;

    const portalUrl = `${baseUrl}?portal=customer&name=${encodeURIComponent(cust.name)}`;
    
    let message = settings.whatsappDebtReminderTemplate || 
`السلام عليكم أخي الكريم {customerName} 🌸
تحية طيبة من {storeName}.

نود تذكيركم بلطف بالمبلغ المستحق بذمتكم للمحل:
🔴 المبلغ المتبقي: {totalDebt} د.ع
📋 عدد الفواتير غير المسددة: {unpaidInvoicesCount} فاتورة

🔗 للاطلاع على كشف حسابك وفواتيرك بالتفصيل:
{statementLink}

شاكرين لكم حسن تعاونكم الدائم 🙏✨`;

    message = message
      .replace(/\{customerName\}/g, cust.name)
      .replace(/\{storeName\}/g, storeName)
      .replace(/\{totalDebt\}/g, Math.round(cust.totalDebt).toLocaleString())
      .replace(/\{unpaidInvoicesCount\}/g, cust.unpaidInvoicesCount)
      .replace(/\{statementLink\}/g, portalUrl);

    results.push({ id: cust.id, name: cust.name, phone: intPhone, message: message });
    successCount++;
  }

  return res.status(200).json({
    status: 'success',
    sentCount: successCount,
    totalDue: targetCustomers.length,
    results
  });
}

export default async function handler(req, res) {
  // CORS Headers for external triggers / webhooks
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 0. Handle mark as sent
    if (req.method === 'POST' && req.body?.markSent) {
      const custIds = Array.isArray(req.body.markSent) ? req.body.markSent : [req.body.markSent];
      const nowIso = new Date().toISOString();
      for (const id of custIds) {
        inFlightDebtorClaims.set(id, Date.now());
      }
      const promises = custIds.map(id => 
        db.collection('customers').doc(id).set({
          lastDebtReminderSent: nowIso
        }, { merge: true }).catch(err => {
          console.error(`Failed to update customer ${id}:`, err);
        })
      );
      await Promise.all(promises);
      global.cachedFinancials = null;
      return res.status(200).json({ status: 'success', marked: custIds.length });
    }

    // تسلسل التنفيذ الذري عبر طابور المهام لمنع أي سباق بين الطلبات المتزامنة في نفس اللحظة
    return await runSerialized(() => executeCronDebtReminders(req, res));

  } catch (error) {
    console.error('Cron Debt Reminders Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

