import { updateCustomer } from './customersService.js';
import { 
  renderWhatsAppTemplate, 
  DEFAULT_WHATSAPP_TEMPLATES, 
  sendWhatsAppMessageViaGateway 
} from './whatsappService.js';

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '');
}

// In-flight mutex to prevent duplicate dispatches during network transmission
const inFlightDebtorIds = new Set();
// In-memory cache to prevent duplicate dispatches within the same session
const sessionSentDebtors = new Map();

/**
 * Clears in-memory session lock for a debtor (e.g. when updating schedule/testing)
 */
export function clearDebtorSessionLock(customerId) {
  if (customerId) {
    sessionSentDebtors.delete(customerId);
    inFlightDebtorIds.delete(customerId);
  }
}

/**
 * Evaluates whether a customer is due for an automated WhatsApp debt reminder right now.
 */
export function isCustomerDebtReminderDue(customer, totalDebt, settings, now = new Date()) {
  if (!totalDebt || totalDebt <= 0) return false;
  if (!customer?.phone1?.trim()) return false;
  if (settings?.whatsappAutoReminders === false) return false;

  const schedule = customer?.reminderSchedule || 'default';
  if (schedule === 'disabled') return false;

  if (customer.id && inFlightDebtorIds.has(customer.id)) {
    return false;
  }

  let schedCode = schedule;
  let targetTimeStr = settings?.whatsappReminderTime || '20:00';

  if (schedCode.includes('@')) {
    const parts = schedCode.split('@');
    schedCode = parts[0];
    if (parts[1] && parts[1].includes(':')) {
      targetTimeStr = parts[1];
    }
  }

  const isMinutely = schedCode.startsWith('minutely_') || (schedCode.startsWith('custom_') && (schedCode.includes('_mins') || schedCode.includes('_min')));
  const intervalMinutes = isMinutely
    ? (parseInt(schedCode.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15)
    : 0;

  const isHourly = schedCode.startsWith('hourly_') || (schedCode.startsWith('custom_') && schedCode.includes('_hours'));
  const intervalHours = isHourly 
    ? (parseInt(schedCode.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2)
    : 0;

  const cId = String(customer.id || customer.phone1 || customer.name || '');

  // 1. In-memory session duplicate guard (prevents duplicate triggers within the active window)
  if (cId && (sessionSentDebtors.has(cId) || (customer.phone1 && sessionSentDebtors.has(customer.phone1)))) {
    const lastSessionSent = sessionSentDebtors.get(cId) || (customer.phone1 && sessionSentDebtors.get(customer.phone1)) || 0;
    const minSessionGap = isMinutely
      ? (intervalMinutes * 60 * 1000 - 5000)
      : isHourly 
        ? (intervalHours * 60 * 60 * 1000 - 60000) 
        : (10 * 60 * 1000); // قفل 10 دقائق
    if (Date.now() - lastSessionSent < minSessionGap) {
      return false;
    }
  }

  // 2. Persistent duplicate guard for Minutely / Hourly:
  if (isMinutely) {
    if (!customer.lastDebtReminderSent) return true;
    const lastSentDate = new Date(customer.lastDebtReminderSent);
    const diffMinutes = (now.getTime() - lastSentDate.getTime()) / (1000 * 60);
    return diffMinutes >= (intervalMinutes - 0.05); // Allow slight clock variance
  }

  if (isHourly) {
    if (!customer.lastDebtReminderSent) return true;
    const lastSentDate = new Date(customer.lastDebtReminderSent);
    const diffHours = (now.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60);
    return diffHours >= (intervalHours - 0.05); // Allow slight clock variance
  }

  const [targetHourStr, targetMinStr] = targetTimeStr.split(':');
  const targetHour = parseInt(targetHourStr || '20', 10);
  const targetMinute = parseInt(targetMinStr || '0', 10);

  // Parse hours and minutes (Iraq Time)
  const iraqParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baghdad',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(now);

  const currentHour = parseInt(iraqParts.find(p => p.type === 'hour')?.value || '0', 10);
  const currentMinute = parseInt(iraqParts.find(p => p.type === 'minute')?.value || '0', 10);

  const currentTotalMins = currentHour * 60 + currentMinute;
  const targetTotalMins = targetHour * 60 + targetMinute;

  // Active time window: allow dispatch starting from target minute up to +59 minutes
  const isTimeWindow = currentTotalMins >= targetTotalMins && currentTotalMins <= targetTotalMins + 59;
  if (!isTimeWindow) {
    return false;
  }

  // Persistent duplicate guard:
  // إذا أرسلت رسالة خلال آخر 10 دقائق، لا ترسل مرة أخرى
  if (customer.lastDebtReminderSent) {
    const lastSentDate = new Date(customer.lastDebtReminderSent);
    const diffMs = now.getTime() - lastSentDate.getTime();
    
    if (diffMs < 10 * 60 * 1000) {
      return false;
    }
  }

  // Check day condition
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayOfWeek = DAYS[now.getDay()];
  const currentDayOfMonth = now.getDate();

  if (schedCode === 'default') {
    const storeDay = settings?.whatsappDefaultDay || 'thursday';
    return currentDayOfWeek === storeDay;
  }

  if (DAYS.includes(schedCode)) {
    return currentDayOfWeek === schedCode;
  }

  if (schedCode.startsWith('monthly_')) {
    const targetDayOfMonth = parseInt(schedCode.replace('monthly_', ''), 10) || 1;
    const maxDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const safeTargetDay = Math.min(targetDayOfMonth, maxDaysInMonth);
    return currentDayOfMonth === safeTargetDay;
  }

  if (schedCode.startsWith('custom_')) {
    const intervalDays = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 1;
    if (intervalDays <= 1) {
      // 'كل يوم': Runs once per day at the scheduled time!
      return true;
    }
    if (!customer.lastDebtReminderSent) return true;
    const lastSent = new Date(customer.lastDebtReminderSent);
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dLast = new Date(lastSent.getFullYear(), lastSent.getMonth(), lastSent.getDate());
    const diffDays = Math.round((dNow.getTime() - dLast.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= intervalDays;
  }

  return false;
}

/**
 * Calculates the exact next scheduled timestamp for a customer's reminder.
 */
export function calculateNextCustomerReminderTimestamp(customer, settings, now = new Date()) {
  const schedule = customer?.reminderSchedule || 'default';
  if (schedule === 'disabled') return null;

  let schedCode = schedule;
  let targetTimeStr = settings?.whatsappReminderTime || '20:00';

  if (schedCode.includes('@')) {
    const parts = schedCode.split('@');
    schedCode = parts[0];
    if (parts[1] && parts[1].includes(':')) {
      targetTimeStr = parts[1];
    }
  }

  if (schedCode.startsWith('minutely_') || (schedCode.startsWith('custom_') && (schedCode.includes('_mins') || schedCode.includes('_min')))) {
    const intervalMinutes = parseInt(schedCode.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
    if (customer?.lastDebtReminderSent) {
      const lastSent = new Date(customer.lastDebtReminderSent);
      const nextDate = new Date(lastSent.getTime() + intervalMinutes * 60 * 1000);
      if (nextDate.getTime() > now.getTime()) {
        return nextDate.getTime();
      }
    }
    return now.getTime() + intervalMinutes * 60 * 1000;
  }

  if (schedCode.startsWith('hourly_') || (schedCode.startsWith('custom_') && schedCode.includes('_hours'))) {
    const intervalHours = parseInt(schedCode.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2;
    if (customer?.lastDebtReminderSent) {
      const lastSent = new Date(customer.lastDebtReminderSent);
      const nextDate = new Date(lastSent.getTime() + intervalHours * 60 * 60 * 1000);
      if (nextDate.getTime() > now.getTime()) {
        return nextDate.getTime();
      }
    }
    return now.getTime() + intervalHours * 60 * 60 * 1000;
  }

  const [targetHourStr, targetMinStr] = targetTimeStr.split(':');
  const targetHour = parseInt(targetHourStr || '20', 10);
  const targetMinute = parseInt(targetMinStr || '0', 10);

  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0, 0);

  // فحص ما إذا كان قد تم الإرسال بالفعل لهذا الموعد اليوم (عند أو بعد الوقت المحدد)
  let alreadySentForTodaySlot = false;
  if (customer?.lastDebtReminderSent) {
    const lastSentDate = new Date(customer.lastDebtReminderSent);
    const isSameCalendarDay = 
      lastSentDate.getFullYear() === now.getFullYear() &&
      lastSentDate.getMonth() === now.getMonth() &&
      lastSentDate.getDate() === now.getDate();
    
    if (isSameCalendarDay && lastSentDate.getTime() >= candidate.getTime()) {
      alreadySentForTodaySlot = true;
    }
  }

  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  const targetTotalMins = targetHour * 60 + targetMinute;
  const isPastActiveWindow = currentTotalMins > targetTotalMins + 59;

  // 1. Daily / Custom 1 Days
  if (schedCode === 'custom_1_days' || schedCode === 'daily' || schedCode.startsWith('custom_1_')) {
    if (!alreadySentForTodaySlot && !isPastActiveWindow) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  // 2. Day of week
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (DAYS.includes(schedCode) || schedCode === 'default') {
    const targetDayIndex = DAYS.indexOf(schedCode === 'default' ? (settings?.whatsappDefaultDay || 'thursday') : schedCode);
    let daysAhead = (targetDayIndex - now.getDay() + 7) % 7;
    if (daysAhead === 0) {
      // نفس اليوم: إذا تم الإرسال لموعد اليوم بالفعل أو إذا تجاوزت نافذة وقت اليوم بالكامل
      if (alreadySentForTodaySlot || isPastActiveWindow) {
        daysAhead = 7;
      }
    }
    candidate.setDate(now.getDate() + daysAhead);
    return candidate.getTime();
  }

  // 3. Monthly (e.g. monthly_26)
  if (schedCode.startsWith('monthly_')) {
    const targetDay = parseInt(schedCode.replace('monthly_', ''), 10) || 1;
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();

    if (now.getDate() > targetDay || (now.getDate() === targetDay && (alreadySentForTodaySlot || isPastActiveWindow))) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    const maxDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const safeDay = Math.min(targetDay, maxDaysInMonth);
    const monthlyCandidate = new Date(targetYear, targetMonth, safeDay, targetHour, targetMinute, 0, 0);
    return monthlyCandidate.getTime();
  }

  // 4. Custom N days
  if (schedCode.startsWith('custom_')) {
    const n = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 7;
    if (customer.lastDebtReminderSent) {
      const lastSent = new Date(customer.lastDebtReminderSent);
      const nextDate = new Date(lastSent.getTime() + n * 24 * 60 * 60 * 1000);
      nextDate.setHours(targetHour, targetMinute, 0, 0);
      if (nextDate.getTime() > now.getTime()) {
        return nextDate.getTime();
      }
    }
    if (!alreadySentForTodaySlot && !isPastActiveWindow) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + n);
    return candidate.getTime();
  }

  return candidate.getTime();
}

/**
 * Executes automatic dispatch for all due debtor customers
 */
export async function processAutomatedDebtReminders({
  customers = [],
  sales = [],
  incomes = [],
  settings = {},
  onNotification
}) {
  if (settings?.whatsappAutoReminders === false) return [];

  const now = new Date();
  const dispatched = [];

  // Build debtors payload for background server scheduler synchronization
  const debtorPayload = [];

  for (const cust of customers) {
    if (!cust.id || cust.isDiscovered) continue;

    let totalDebt = 0;
    let unpaidInvoicesCount = 0;

    (sales || []).forEach((sale) => {
      const matchesId = sale.customerId && cust.id && String(sale.customerId) === String(cust.id);
      const sName = (sale.customerName || '').trim().toLowerCase();
      const cName = (cust.name || '').trim().toLowerCase();
      const nameMatches = sName && cName && sName === cName;

      if (matchesId || nameMatches) {
        const isDebt = sale.invoiceType === 'debt';
        if (isDebt && sale.isSettled !== true && sale.paymentStatus !== 'paid') {
          const total = Number(sale.total || 0);
          const paid = Number(sale.paidAmount || 0);
          const remaining = sale.remainingDebt !== undefined 
            ? Math.min(Number(sale.remainingDebt), Math.max(0, total - paid)) 
            : Math.max(0, total - paid);
          if (remaining > 0) {
            totalDebt += remaining;
            unpaidInvoicesCount += 1;
          }
        }
      }
    });

    if (totalDebt > 0 && cust.phone1) {
      const portalBaseUrl = settings.customerPortalUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://camera-inventory-1qfh.vercel.app');
      const rawPhone = String(cust.phone1 || '').replace(/[^\d]/g, '');
      const last4 = rawPhone.length >= 4 ? rawPhone.slice(-4) : rawPhone;
      const password = cust.pinCode || cust.passcode || last4 || 'آخر 4 أرقام من هاتفك';
      const pinParam = (password && password !== 'آخر 4 أرقام من هاتفك') ? `&pin=${password}` : '';
      const idParam = rawPhone ? `phone=${rawPhone}` : `name=${encodeURIComponent(cust.name)}`;
      const portalUrl = `${portalBaseUrl}?portal=customer&${idParam}${pinParam}`;
      const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;

      const message = renderWhatsAppTemplate(template, {
        customerName: cust.name,
        username: cust.name,
        password: password,
        pin: password,
        phone: cust.phone1,
        storeName: settings?.storeName || 'المحل',
        totalDebt: Number(totalDebt).toLocaleString('en-US'),
        unpaidInvoicesCount: unpaidInvoicesCount || 1,
        statementLink: portalUrl
      });

      debtorPayload.push({
        id: cust.id,
        name: cust.name,
        phone1: cust.phone1,
        reminderSchedule: cust.reminderSchedule || 'default',
        totalDebt: totalDebt,
        lastDebtReminderSent: cust.lastDebtReminderSent || null,
        renderedMessage: message
      });
    }

    if (isCustomerDebtReminderDue(cust, totalDebt, settings, now)) {
      if (inFlightDebtorIds.has(cust.id)) continue;
      inFlightDebtorIds.add(cust.id);

      try {
        const portalBaseUrl = settings.customerPortalUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://camera-inventory-1qfh.vercel.app');
        let cleanPhone = String(cust.phone1 || '').replace(/[^\d]/g, '').trim();
        if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
          cleanPhone = '964' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
          cleanPhone = '964' + cleanPhone;
        } else if (cleanPhone.startsWith('00964')) {
          cleanPhone = cleanPhone.substring(2);
        }

        const last4 = cleanPhone.length >= 4 ? cleanPhone.slice(-4) : cleanPhone;
        const password = cust.pinCode || cust.passcode || last4 || 'آخر 4 أرقام من هاتفك';
        const pinParam = (password && password !== 'آخر 4 أرقام من هاتفك') ? `&pin=${password}` : '';
        const idParam = cleanPhone ? `phone=${cleanPhone}` : `name=${encodeURIComponent(cust.name)}`;
        const portalUrl = `${portalBaseUrl}?portal=customer&${idParam}${pinParam}`;
        const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;

        const message = renderWhatsAppTemplate(template, {
          customerName: cust.name,
          username: cust.name,
          password: password,
          pin: password,
          phone: cleanPhone,
          storeName: settings?.storeName || 'المحل',
          totalDebt: Number(totalDebt).toLocaleString('en-US'),
          unpaidInvoicesCount: unpaidInvoicesCount || 1,
          statementLink: portalUrl
        });

        await sendWhatsAppMessageViaGateway({
          phone: cleanPhone,
          message,
          settings
        });

        const sentIso = new Date().toISOString();
        if (cust.id) sessionSentDebtors.set(String(cust.id), Date.now());
        if (cust.phone1) sessionSentDebtors.set(String(cust.phone1), Date.now());
        if (cleanPhone) sessionSentDebtors.set(cleanPhone, Date.now());
        cust.lastDebtReminderSent = sentIso;

        await updateCustomer(cust.id, {
          lastDebtReminderSent: sentIso
        });

        dispatched.push(cust);
        if (onNotification) {
          onNotification(cust, totalDebt);
        }
        console.log(`⏰ [AutoDebtReminder] تم إرسال تذكير الديون بنجاح وبشكل مؤكد للعميل «${cust.name}» (هاتف: +${cleanPhone})`);
      } catch (err) {
        console.warn(`⚠️ [AutoDebtReminder] تعذر إرسال تذكير تلقائي للعميل ${cust.name}:`, err.message);
      } finally {
        inFlightDebtorIds.delete(cust.id);
      }
    }
  }

  // 24/7 Autonomous Background Sync to AWS Gateway:
  if (debtorPayload.length > 0) {
    try {
      const defaultBase = 'https://offerings-maybe-dem-representative.trycloudflare.com';
      let apiUrl = settings.whatsappApiUrl || `${defaultBase}/messages/chat`;
      let baseUrl = defaultBase;
      if (apiUrl.startsWith('http') && !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
        baseUrl = apiUrl.replace(/\/messages\/(chat|document).*/, '').replace(/[,;\/\s]+$/, '');
      }

      const syncCustomers = debtorPayload.map(d => ({
        id: d.id,
        name: d.name,
        phone1: d.phone1,
        totalDebt: d.totalDebt,
        reminderSchedule: d.reminderSchedule,
        lastDebtReminderSent: d.lastDebtReminderSent,
        renderedMessage: d.renderedMessage
      }));

      fetch(`${baseUrl}/reminders/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.whatsappToken || 'SafeZone2026',
          customers: syncCustomers,
          settings
        })
      }).catch(() => {});
    } catch (e) {
      // Ignore background sync errors
    }
  }

  return dispatched;
}

/**
 * Explicitly synchronize scheduled debtors directly to AWS Gateway queue
 */
export async function syncScheduledDebtorsToGateway({ customers = [], sales = [], incomes = [], settings = {} }) {
  return processAutomatedDebtReminders({ customers, sales, incomes, settings });
}
