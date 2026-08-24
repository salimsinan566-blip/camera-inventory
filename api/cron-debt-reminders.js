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
      const batch = db.batch();
      for (const id of custIds) {
        batch.update(db.collection('customers').doc(id), {
          lastDebtReminderSent: new Date().toISOString()
        });
      }
      await batch.commit();
      return res.status(200).json({ status: 'success', marked: custIds.length });
    }

    // 1. جلب إعدادات المتجر والواتساب
    const settingsDoc = await db.collection('settings').doc('store_info').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};

    // فحص ما إذا كان التذكير التلقائي مفعلاً
    const isAutoEnabled = settings.whatsappAutoReminders !== false;
    const instanceId = settings.whatsappInstanceId?.trim();
    const token = settings.whatsappToken?.trim() || 'SafeZone2026';
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

    // 2. فحص اليوم والتاريخ بتوقيت العراق (Asia/Baghdad)
    const iraqTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
    const iraqDate = new Date(iraqTimeStr);
    const dayOfWeekIndex = iraqDate.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
    const dayOfMonth = iraqDate.getDate(); // 1 - 31
    const todayStr = iraqDate.toISOString().slice(0, 10);

    const DAYS_MAP = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday'
    };

    const currentDayName = DAYS_MAP[dayOfWeekIndex]; // e.g. 'thursday'
    const defaultReminderDay = settings.whatsappDefaultDay || 'thursday';

    // 3. جلب وتجميع حسابات العملاء الدقيقة من المبيعات وسندات القبض
    const [custSnap, salesSnap, incomesSnap] = await Promise.all([
      db.collection('customers').get(),
      db.collection('sales').get(),
      db.collection('office_incomes').get()
    ]);

    const customerFinancials = {};

    salesSnap.forEach(doc => {
      const s = doc.data();
      if (s.status === 'draft' || s.status === 'suspended' || s.status === 'cancelled') return;
      const rawName = (s.customerName || '').trim();
      if (!rawName) return;
      const key = normalizeArabic(rawName);

      if (!customerFinancials[key]) {
        customerFinancials[key] = { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0 };
      }

      const total = Number(s.total || 0);
      customerFinancials[key].totalPurchases += total;

      if (s.invoiceType === 'debt') {
        const paid = Number(s.paidAmount || 0);
        const remaining = s.isSettled ? 0 : (s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, total - paid)) : Math.max(0, total - paid));
        customerFinancials[key].totalPaid += paid;
        customerFinancials[key].totalDebt += remaining;
        if (remaining > 0) {
          customerFinancials[key].unpaidInvoicesCount += 1;
        }
      } else {
        customerFinancials[key].totalPaid += total;
      }
    });

    incomesSnap.forEach(doc => {
      const inc = doc.data();
      const rawName = (inc.customerName || inc.payerName || '').trim();
      if (!rawName) return;
      const key = normalizeArabic(rawName);

      if (!customerFinancials[key]) {
        customerFinancials[key] = { totalPurchases: 0, totalPaid: 0, totalDebt: 0, unpaidInvoicesCount: 0 };
      }

      const amt = Number(inc.amount || 0);
      customerFinancials[key].totalPaid += amt;
      customerFinancials[key].totalDebt = Math.max(0, customerFinancials[key].totalDebt - amt);
    });

    // 4. مطابقة العملاء المستحقين للتذكير اليوم
    const targetCustomers = [];

    custSnap.forEach(doc => {
      const c = doc.data();
      const rawName = (c.name || '').trim();
      if (!rawName) return;
      const norm = normalizeArabic(rawName);
      const fin = customerFinancials[norm] || { totalDebt: 0, unpaidInvoicesCount: 0 };

      const totalDebt = fin.totalDebt;
      if (totalDebt <= 0) return; // لا يوجد عليه دين

      const phone = c.phone1 || c.phone;
      if (!phone) return; // لا يوجد هاتف

      const schedule = c.reminderSchedule || 'disabled';
      if (!schedule || schedule === 'disabled') return; // معطل تماماً لأمان التجربة، لا ترسل إلا لمن فعّلته بيدك

      const isHourly = schedule.startsWith('hourly_') || (schedule.startsWith('custom_') && schedule.includes('_hours'));

      // فحص نافذة الوقت بالساعات والدقائق للمواعيد الأسبوعية واليومية والشهرية
      let targetTimeStr = settings.whatsappReminderTime || '20:00';
      if (schedule.includes('@')) {
        const parts = schedule.split('@');
        if (parts[1] && parts[1].includes(':')) targetTimeStr = parts[1];
      }
      const [targetHourStr, targetMinStr] = targetTimeStr.split(':');
      const targetHour = parseInt(targetHourStr || '20', 10);
      const targetMinute = parseInt(targetMinStr || '0', 10);

      const currentHour = iraqDate.getHours();
      const currentMinute = iraqDate.getMinutes();
      const currentTotalMins = currentHour * 60 + currentMinute;
      const targetTotalMins = targetHour * 60 + targetMinute;

      // نافذة الوقت: يبدأ من الدقيقة المحددة وحتى +59 دقيقة ضمن نفس الساعة
      const isTimeWindow = currentTotalMins >= targetTotalMins && currentTotalMins <= targetTotalMins + 59;

      // فحص هل الموعد مستحق لهذا العميل
      let isDueToday = false;

      const isMinutely = schedule.startsWith('minutely_') || (schedule.startsWith('custom_') && (schedule.includes('_mins') || schedule.includes('_min')));

      if (force) {
        isDueToday = true;
      } else if (isMinutely) {
        const intervalMinutes = parseInt(schedule.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
        if (!c.lastDebtReminderSent) {
          isDueToday = true;
        } else {
          const lastDate = new Date(c.lastDebtReminderSent);
          const diffMinutes = Math.abs(iraqDate - lastDate) / (1000 * 60);
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
          const diffTime = Math.abs(iraqDate - lastDate);
          const diffHours = diffTime / (1000 * 60 * 60);
          if (diffHours >= (intervalHours - 0.1)) {
            isDueToday = true;
          }
        }
      } else if (isTimeWindow) {
        const schedCode = schedule.split('@')[0];
        if (schedCode === 'default' && currentDayName === defaultReminderDay) {
          isDueToday = true;
        } else if (schedCode === currentDayName) {
          isDueToday = true;
        } else if (schedCode.startsWith('monthly_')) {
          const targetDay = parseInt(schedCode.replace('monthly_', ''), 10);
          if (dayOfMonth === targetDay) {
            isDueToday = true;
          }
        } else if (schedCode.startsWith('custom_')) {
          const intervalDays = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 7;
          if (!c.lastDebtReminderSent) {
            isDueToday = true;
          } else {
            const lastDate = new Date(c.lastDebtReminderSent);
            const diffTime = Math.abs(iraqDate - lastDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= intervalDays) {
              isDueToday = true;
            }
          }
        }
      }

      // فحص عدم تكرار الإرسال في نفس اليوم للأنماط اليومية/الأسبوعية، أما أنماط الدقائق والساعات فتعمل بتكرارها
      const lastSentDateStr = c.lastDebtReminderSent ? c.lastDebtReminderSent.slice(0, 10) : null;
      const canDispatch = isDueToday && (isMinutely || isHourly || force || lastSentDateStr !== todayStr);

      if (canDispatch) {
        targetCustomers.push({
          id: doc.id,
          name: rawName,
          phone: phone,
          totalDebt: totalDebt,
          unpaidInvoicesCount: fin.unpaidInvoicesCount || 1,
          customerType: c.customerType || 'client'
        });
      }
    });

    if (targetCustomers.length === 0) {
      return res.status(200).json({ 
        status: 'completed', 
        message: 'No due debtors to remind right now.', 
        currentDay: currentDayName 
      });
    }

    // 5. إرسال رسائل التذكير عبر WhatsApp Gateway
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

      try {
        if (req.query?.returnOnly === 'true') {
          results.push({ id: cust.id, name: cust.name, phone: intPhone, message: message });
          successCount++;
          // Not updating lastDebtReminderSent here, the caller must update it or we update it in a separate call
        } else {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: token,
              to: intPhone,
              body: message,
              message: message
            })
          });

          const resData = await response.json().catch(() => ({}));
          if (!resData.error && resData.sent !== 'false') {
            successCount++;
            // تسجيل تاريخ الإرسال
            await db.collection('customers').doc(cust.id).update({
              lastDebtReminderSent: new Date().toISOString()
            });
            results.push({ name: cust.name, phone: intPhone, status: 'sent' });
          } else {
            results.push({ name: cust.name, phone: intPhone, status: 'failed', error: resData.error || resData.message });
          }

          // مهلة 1 ثانية بين كل رسالة لحماية الحساب
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch (err) {
        results.push({ name: cust.name, phone: intPhone, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({
      status: 'success',
      sentCount: successCount,
      totalDue: targetCustomers.length,
      results
    });

  } catch (error) {
    console.error('Cron Debt Reminders Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
