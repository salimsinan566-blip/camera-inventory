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

// ⚡ In-Memory Financial Cache (Reduces Firestore free quota consumption by >80%)
let cachedFinancialState = null;
let lastFinancialCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateFinancialCache() {
  cachedFinancialState = null;
  lastFinancialCacheTime = 0;
}

// Calculate next scheduled occurrence timestamp
function calculateNextScheduledTimestamp(rawSchedCode, timeStr = '20:00', now = new Date(), isRenewal = false) {
  let schedCode = rawSchedCode || 'default';
  if (schedCode.includes('@')) {
    const parts = schedCode.split('@');
    schedCode = parts[0];
    if (parts[1] && parts[1].includes(':')) {
      timeStr = parts[1];
    }
  }

  // 0. Minute Schedules (e.g. minutely_15, minutely_30)
  if (schedCode.startsWith('minutely_') || (schedCode.startsWith('custom_') && (schedCode.includes('_mins') || schedCode.includes('_min')))) {
    const intervalMinutes = parseInt(schedCode.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
    return now.getTime() + intervalMinutes * 60 * 1000;
  }

  // 0.1 Hourly Schedules (e.g. hourly_1, hourly_2)
  if (schedCode.startsWith('hourly_') || (schedCode.startsWith('custom_') && schedCode.includes('_hours'))) {
    const intervalHours = parseInt(schedCode.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2;
    return now.getTime() + intervalHours * 60 * 60 * 1000;
  }

  const [hStr, mStr] = String(timeStr).split(':');
  const targetH = parseInt(hStr || '20', 10);
  const targetM = parseInt(mStr || '0', 10);

  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH, targetM, 0, 0);
  const diffFromCandidate = now.getTime() - candidate.getTime();

  // If NOT a renewal, and inside active window (current minute up to 10 minutes past), fire right now!
  if (!isRenewal && diffFromCandidate >= 0 && diffFromCandidate <= 10 * 60 * 1000) {
    return now.getTime();
  }

  // 1. Daily / Custom 1 Days
  if (schedCode === 'custom_1_days' || schedCode === 'daily' || schedCode.startsWith('custom_1_') || schedCode === 'every_day') {
    if (!isRenewal && candidate.getTime() > now.getTime()) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  // 2. Day of week
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (DAYS.includes(schedCode) || schedCode === 'default') {
    const targetDayIndex = DAYS.indexOf(schedCode === 'default' ? 'thursday' : schedCode);
    let daysAhead = (targetDayIndex - now.getDay() + 7) % 7;
    if (daysAhead === 0 && (isRenewal || candidate.getTime() <= now.getTime())) {
      daysAhead = 7;
    }
    candidate.setDate(now.getDate() + daysAhead);
    return candidate.getTime();
  }

  // 3. Monthly (e.g. monthly_8, monthly_31)
  if (schedCode.startsWith('monthly_')) {
    const targetDay = parseInt(schedCode.replace('monthly_', ''), 10) || 1;
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();
    
    if (isRenewal || (now.getDate() > targetDay) || (now.getDate() === targetDay && (now.getHours() > targetH || (now.getHours() === targetH && now.getMinutes() >= targetM)))) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }
    
    // Clamp to valid max days in target month (e.g. Day 31 clamped to 30 in April)
    const maxDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const safeDay = Math.min(targetDay, maxDaysInMonth);
    const monthlyCandidate = new Date(targetYear, targetMonth, safeDay, targetH, targetM, 0, 0);
    return monthlyCandidate.getTime();
  }

  // 4. Custom N days
  if (schedCode.startsWith('custom_')) {
    const n = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 7;
    if (!isRenewal && candidate.getTime() > now.getTime()) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + n);
    return candidate.getTime();
  }

  // 5. Fallback
  if (isRenewal || candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

async function getOrFetchFinancialData(force = false) {
  const nowTs = Date.now();
  if (!global._testDb && !force && cachedFinancialState && (nowTs - lastFinancialCacheTime < CACHE_TTL_MS)) {
    return cachedFinancialState;
  }

  // 1. جلب إعدادات المتجر أولاً لتوفير الكوتا إذا كانت التذكيرات معطلة
  const settingsDoc = await db.collection('settings').doc('store_info').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};

  if (!global._testDb && !force && settings.whatsappAutoReminders === false) {
    cachedFinancialState = { settings, customerFinancials: {}, customers: [] };
    lastFinancialCacheTime = nowTs;
    return cachedFinancialState;
  }

  // 2. جلب المبيعات وسندات القبض وقائمة الزبائن
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
      customerFinancials[idKey].oldInvoicesAmount = (customerFinancials[idKey].oldInvoicesAmount || 0) + amt;
    };

    if (cId) {
      updateFin(`id_${cId}`);
    } else if (key) {
      updateFin(`legacy_name_${key}`);
    }
  });

  const customers = [];
  custSnap.forEach(doc => {
    customers.push({ id: doc.id, ...doc.data() });
  });

  cachedFinancialState = {
    settings,
    customerFinancials,
    customers
  };
  lastFinancialCacheTime = nowTs;

  return cachedFinancialState;
}

async function executeCronDebtReminders(req, res) {
  const force = req.query?.force === 'true';
  const returnOnly = req.query?.returnOnly === 'true';

  // 1. جلب البيانات المالية (مع استخدام الكاش لتوفير كوتا فايربيس)
  const { settings, customerFinancials, customers } = await getOrFetchFinancialData(force);

  // فحص ما إذا كان التذكير التلقائي مفعلاً
  const isAutoEnabled = settings.whatsappAutoReminders !== false;
  const instanceId = (settings.whatsappInstanceId || 'SafeZone').trim();
  const token = (settings.whatsappToken || 'SafeZone2026').trim();
  const rawApiUrl = (settings.whatsappApiUrl || '').trim();
  const provider = settings.whatsappProvider || 'evolution';

  if (!force && !isAutoEnabled) {
    return res.status(200).json({ 
      status: 'skipped', 
      reason: 'WhatsApp auto-reminders disabled in settings.' 
    });
  }

  // 2. فحص اليوم والتاريخ والوقت بتوقيت العراق (Asia/Baghdad)
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

  // 3. مطابقة العملاء المستحقين للتذكير اليوم
  const targetCustomers = [];
  const nowTs = now.getTime();

  for (const c of customers) {
    const rawName = (c.name || '').trim();
    const norm = rawName ? normalizeArabic(rawName) : null;
    const cId = String(c.id);

    // فحص القفل السريع للطلبات المتزامنة (In-flight memory claim guard)
    const inFlightClaimTime = inFlightDebtorClaims.get(cId);
    if (inFlightClaimTime && (nowTs - inFlightClaimTime < 60 * 1000)) {
      continue; // تم حجز تذكير لهذا العميل خلال آخر 60 ثانية
    }
    
    const finById = customerFinancials[`id_${cId}`] || { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0, oldInvoicesAmount: 0 };
    const finByLegacyName = (norm && customerFinancials[`legacy_name_${norm}`]) || { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0, oldInvoicesAmount: 0 };
    
    const grossDebt = finById.totalDebt + finByLegacyName.totalDebt;
    const totalReceipts = (finById.oldInvoicesAmount || 0) + (finByLegacyName.oldInvoicesAmount || 0);
    const totalDebt = Math.max(0, grossDebt - totalReceipts);
    const unpaidInvoicesCount = finById.unpaidInvoicesCount + finByLegacyName.unpaidInvoicesCount;

    if (totalDebt <= 0) continue; // لا يوجد عليه دين إطلاقاً -> تخطي فوري

    let cleanPhone = String(c.phone1 || c.phone || '').replace(/[^\d]/g, '').trim();
    if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
      cleanPhone = '964' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
      cleanPhone = '964' + cleanPhone;
    } else if (cleanPhone.startsWith('00964')) {
      cleanPhone = cleanPhone.substring(2);
    }
    if (!cleanPhone) continue; // لا يوجد هاتف صحيح
    const phone = cleanPhone;

    const schedule = c.reminderSchedule || 'disabled';
    if (!schedule || schedule === 'disabled') continue; // معطل تماماً

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

    // يبدأ الاستحقاق بمجرد وصول الدقيقة المحددة (وحتى نهاية اليوم ما لم يُرسل بعد)
    const isPastOrAtTargetTime = currentTotalMins >= targetTotalMins;

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
    } else if (isPastOrAtTargetTime) {
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

    // فحص عدم تكرار الإرسال لموعد اليوم المحدد للأنماط اليومية/الأسبوعية والشهرية
    let alreadySentForTodaySlot = false;
    let diffSecondsSinceLastSent = Infinity;
    if (c.lastDebtReminderSent) {
      try {
        const lastSentDateObj = new Date(c.lastDebtReminderSent);
        const lastSentDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(lastSentDateObj);
        diffSecondsSinceLastSent = (now.getTime() - lastSentDateObj.getTime()) / 1000;
        
        const isSameCalendarDay = lastSentDateStr === todayStr;
        
        // يعتبر مرسلاً لموعد اليوم بشكل قطعي إذا كان قد أرسل في نفس اليوم (بتوقيت بغداد) أو خلال آخر 18 ساعة
        if (isSameCalendarDay || diffSecondsSinceLastSent < 18 * 3600) {
          alreadySentForTodaySlot = true;
        }
      } catch (e) {
        alreadySentForTodaySlot = c.lastDebtReminderSent.slice(0, 10) === todayStr;
      }
    }

    // منع تكرار الإرسال إذا تم إرساله لهذا الموعد اليوم
    const isRecentForceDuplicate = force && diffSecondsSinceLastSent < 60;
    const canDispatch = isDueToday && !isRecentForceDuplicate && (isMinutely || isHourly ? !alreadySentForTodaySlot : (!alreadySentForTodaySlot && !isRecentForceDuplicate));

    if (canDispatch) {
      const nextTimestamp = calculateNextScheduledTimestamp(schedule, targetTimeStr, now, true);
      const nextFormatted = new Date(nextTimestamp).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });

      targetCustomers.push({
        id: c.id,
        name: rawName,
        phone: phone,
        totalDebt: totalDebt,
        unpaidInvoicesCount: unpaidInvoicesCount || 1,
        customerType: c.customerType || 'client',
        pinCode: c.pinCode || c.passcode || '',
        schedule,
        nextScheduledTimestamp: nextTimestamp,
        nextScheduledFormatted: nextFormatted
      });
    }
  }

  if (targetCustomers.length === 0) {
    return res.status(200).json({ 
      status: 'completed', 
      message: 'No due debtors to remind right now.', 
      currentDay: currentDayName,
      sentCount: 0,
      results: []
    });
  }

  // 4. حجز العملاء في الذاكرة لمنع أي سباق متزامن
  for (const cust of targetCustomers) {
    inFlightDebtorClaims.set(cust.id, Date.now());
  }

  // 5. تجهيز رسائل التذكير
  const baseUrl = settings.customerPortalUrl || 'https://camera-inventory-1qfh.vercel.app';
  const storeName = settings.storeName || 'المحل';
  const results = [];

  for (const cust of targetCustomers) {
    const intPhone = formatInternationalPhone(cust.phone);
    if (!intPhone) continue;

    const rawPhoneDigits = String(cust.phone || '').replace(/[^\d]/g, '');
    const last4 = rawPhoneDigits.length >= 4 ? rawPhoneDigits.slice(-4) : rawPhoneDigits;
    const password = cust.pinCode || last4 || 'آخر 4 أرقام من هاتفك';
    const pinParam = (password && password !== 'آخر 4 أرقام من هاتفك') ? `&pin=${password}` : '';
    const idParam = rawPhoneDigits ? `phone=${rawPhoneDigits}` : `name=${encodeURIComponent(cust.name)}`;
    const portalUrl = `${baseUrl}?portal=customer&${idParam}${pinParam}`;
    
    let message = settings.whatsappDebtReminderTemplate || 
`السلام عليكم أخي الكريم {customerName} 🌸
تحية طيبة من {storeName}.

نود تذكيركم بلطف بالمبلغ المستحق بذمتكم للمحل:
🔴 المبلغ المتبقي: {totalDebt} د.ع
📋 عدد الفواتير غير المسددة: {unpaidInvoicesCount} فاتورة

🌐 للاطلاع على كشف حسابك وفواتيرك بالتفصيل عبر بوابة العملاء:
🔗 الرابط: {statementLink}
👤 اسم المستخدم: {username}
🔑 رمز المرور (الباسورد): {password}

شاكرين لكم حسن تعاونكم الدائم 🙏✨`;

    message = message
      .replace(/\{customerName\}/g, cust.name)
      .replace(/\{username\}/g, cust.name)
      .replace(/\{storeName\}/g, storeName)
      .replace(/\{totalDebt\}/g, Math.round(cust.totalDebt).toLocaleString())
      .replace(/\{unpaidInvoicesCount\}/g, cust.unpaidInvoicesCount)
      .replace(/\{statementLink\}/g, portalUrl)
      .replace(/\{password\}/g, password)
      .replace(/\{pin\}/g, password)
      .replace(/\{phone\}/g, cust.phone);

    results.push({ 
      id: cust.id, 
      name: cust.name, 
      phone: intPhone, 
      message: message,
      nextScheduledTimestamp: cust.nextScheduledTimestamp,
      nextScheduledFormatted: cust.nextScheduledFormatted
    });
  }

  // 6. إذا كان الطلب من خادم الواتساب (returnOnly=true)، أرجع القائمة وسيقوم السيرفر بالإرسال ثم التأكيد
  if (returnOnly) {
    return res.status(200).json({
      status: 'success',
      sentCount: results.length,
      totalDue: targetCustomers.length,
      results
    });
  }

  // 7. إذا كان الطلب من Vercel Cron أو Trigger خارجي مباشر، قم بالإرسال الفعلي عبر الـ HTTP
  let dispatchedCount = 0;
  const successfullySentIds = [];
  const cleanBaseUrl = rawApiUrl.replace(/\/messages\/(chat|document).*/, '').replace(/\/message\/(sendText|sendMedia).*/, '').replace(/\/instance\/.*/, '').replace(/\/+$/, '');
  const isEvolution = provider === 'evolution' || (!rawApiUrl.includes('/messages/chat') && !rawApiUrl.includes('ultramsg.com'));

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    
    // فاصل زمني تسلسلي (Anti-ban rate limiter) بين كل رسالة وأخرى لحماية الرقم من الحظر
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

    try {
      let resp;
      if (isEvolution && cleanBaseUrl) {
        const endpoint = `${cleanBaseUrl}/message/sendText/${encodeURIComponent(instanceId)}`;
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': token
          },
          body: JSON.stringify({
            number: item.phone,
            text: item.message,
            delay: 1500,
            linkPreview: true
          })
        });
      } else {
        const legacyEndpoint = rawApiUrl || 'http://13.61.182.143:3005/messages/chat';
        resp = await fetch(legacyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            to: item.phone,
            body: item.message,
            message: item.message
          })
        });
      }

      const resData = await resp.json().catch(() => ({}));
      if (resp.ok && !resData.error && resData.status !== 'ERROR' && resData.sent !== 'false') {
        dispatchedCount++;
        successfullySentIds.push(item.id);
        console.log(`✅ [Cron WhatsApp] Sent debt reminder to customer ${item.name} (${item.phone})`);
      } else {
        console.warn(`⚠️ [Cron WhatsApp] Gateway returned non-success for ${item.phone}:`, resData);
      }
    } catch (sendErr) {
      console.error(`❌ [Cron WhatsApp] Failed to send to ${item.phone}:`, sendErr.message);
    }
  }

  // 8. تحديث Firestore فقط للعملاء الذين تم إرسال رسالتهم بنجاح
  if (successfullySentIds.length > 0) {
    const nowIso = now.toISOString();
    await Promise.all(
      successfullySentIds.map(id => {
        const cObj = targetCustomers.find(t => t.id === id);
        const nextIso = cObj?.nextScheduledTimestamp ? new Date(cObj.nextScheduledTimestamp).toISOString() : null;
        return db.collection('customers').doc(id).set({
          lastDebtReminderSent: nowIso,
          nextDebtReminderDate: nextIso,
          lastDebtReminderClaimedAt: nowIso
        }, { merge: true }).catch(() => {});
      })
    );
    invalidateFinancialCache();
  }

  return res.status(200).json({
    status: 'success',
    sentCount: dispatchedCount,
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
    // 0. Handle mark as sent (From WhatsApp Server after confirmed socket dispatch)
    if (req.method === 'POST' && req.body?.markSent) {
      const custIds = Array.isArray(req.body.markSent) ? req.body.markSent : [req.body.markSent];
      const nextDates = req.body.nextDates || {};
      const nowIso = new Date().toISOString();
      
      for (const id of custIds) {
        inFlightDebtorClaims.set(id, Date.now());
      }

      const promises = custIds.map(id => {
        const updateData = {
          lastDebtReminderSent: nowIso,
          lastDebtReminderClaimedAt: nowIso
        };
        if (nextDates[id]) {
          updateData.nextDebtReminderDate = typeof nextDates[id] === 'number' ? new Date(nextDates[id]).toISOString() : nextDates[id];
        }
        return db.collection('customers').doc(id).set(updateData, { merge: true }).catch(err => {
          console.error(`Failed to update customer ${id}:`, err);
        });
      });

      await Promise.all(promises);
      invalidateFinancialCache();
      return res.status(200).json({ status: 'success', marked: custIds.length });
    }

    // تسلسل التنفيذ الذري عبر طابور المهام لمنع أي سباق بين الطلبات المتزامنة في نفس اللحظة
    return await runSerialized(() => executeCronDebtReminders(req, res));

  } catch (error) {
    console.error('Cron Debt Reminders Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

