import React, { useState, useMemo } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useSales } from '../hooks/useSales';
import { useIncomes } from '../hooks/useIncomes';
import { useSettings } from '../hooks/useSettings';
import { deleteCustomer, updateCustomer, findOrCreateCustomer } from '../services/customersService';
import { updateStoreSettings } from '../services/settingsService';
import { 
  getWhatsAppDirectUrl, 
  renderWhatsAppTemplate, 
  DEFAULT_WHATSAPP_TEMPLATES,
  sendWhatsAppMessageViaGateway 
} from '../services/whatsappService';
import { useUI } from '../contexts/UIContext';
import AddCustomerModal from './AddCustomerModal';
import CustomerStatementModal from './CustomerStatementModal';
import { formatAppleScheduleLabel } from './AppleSchedulePicker';
import { processAutomatedDebtReminders, clearDebtorSessionLock } from '../services/debtReminderScheduler';
import ScheduledMessagesModal from './ScheduledMessagesModal';

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

function cleanPhoneNumber(p) {
  if (!p) return '';
  return String(p).replace(/[^\d]/g, '').replace(/^00964|^964|^0/, '');
}

function getSaleRemainingDebt(s) {
  if (!s) return 0;
  if (s.isSettled === true || s.paymentStatus === 'paid') {
    return 0;
  }

  const total = Number(s.total || 0);
  const paid = Number(s.paidAmount || 0);

  if (s.invoiceType === 'debt') {
    const remaining = s.remainingDebt !== undefined 
      ? Math.min(Number(s.remainingDebt), Math.max(0, total - paid)) 
      : Math.max(0, total - paid);
    return Math.max(0, remaining);
  }

  return 0;
}

function isSaleMatchedToCustomer(sale, customer) {
  if (!sale || !customer) return false;

  // Direct ID match
  if (sale.customerId && customer.id && String(sale.customerId) === String(customer.id)) {
    return true;
  }

  const sName = (sale.customerName || '').trim().toLowerCase();
  const cName = (customer.name || '').trim().toLowerCase();

  // Exact Name Match (matching CustomerStatementModal exactly)
  if (sName && cName && sName === cName) {
    return true;
  }

  return false;
}

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function CustomersScreen() {
  const { customers, loading: customersLoading } = useCustomers();
  const { sales } = useSales();
  const { incomes } = useIncomes();
  const { settings } = useSettings();
  const { toast, confirm } = useUI();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'client' | 'customer' | 'debt' | 'settled' | 'no-phone'
  const [editingCustomer, setEditingCustomer] = useState(null); // null = closed, {} = add, customerObj = edit
  const [statementCustomerName, setStatementCustomerName] = useState(null);
  const [sendingBulkReminders, setSendingBulkReminders] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { current, total }

  const isGlobalAutoDisabled = settings?.whatsappAutoReminders === false;

  // Merge registered customers with any customers discovered in sales & compute accurate financial aggregates (100% matched with Statement)
  const allMergedCustomers = useMemo(() => {
    const list = [...customers];
    const registeredNames = new Set(customers.map(c => (c.name || '').trim().toLowerCase()));

    (sales || []).forEach((sale) => {
      const name = (sale.customerName || '').trim();
      const norm = name.toLowerCase();
      if (name && !registeredNames.has(norm)) {
        const alreadyMatched = list.some(c => isSaleMatchedToCustomer(sale, c));
        if (!alreadyMatched) {
          registeredNames.add(norm);
          list.push({
            id: `discovered-${sale.id}`,
            name: name,
            phone1: sale.customerPhone || sale.phone || '',
            customerType: 'customer',
            reminderSchedule: 'disabled',
            isDiscovered: true
          });
        }
      }
    });

    return list.map(c => {
      let totalPurchases = 0;
      let totalPaid = 0;
      let totalDebt = 0;
      let invoicesCount = 0;
      let unpaidInvoicesCount = 0;

      const cName = (c.name || '').trim().toLowerCase();

      (sales || []).forEach(sale => {
        const sName = (sale.customerName || '').trim().toLowerCase();
        const matchesId = sale.customerId && c.id && String(sale.customerId) === String(c.id);
        const nameMatches = sName && cName && sName === cName;

        if (matchesId || nameMatches) {
          const total = Number(sale.total || 0);
          const isDebt = sale.invoiceType === 'debt';
          totalPurchases += total;
          invoicesCount += 1;

          if (isDebt) {
            const paid = Number(sale.paidAmount || 0);
            const remaining = sale.remainingDebt !== undefined 
              ? Math.min(Number(sale.remainingDebt), Math.max(0, total - paid)) 
              : Math.max(0, total - paid);
            totalPaid += paid;
            totalDebt += Math.max(0, remaining);
            if (remaining > 0 && !sale.isSettled) {
              unpaidInvoicesCount += 1;
            }
          } else {
            totalPaid += total;
          }
        }
      });

      return {
        ...c,
        customerType: c.customerType || 'client',
        reminderSchedule: c.reminderSchedule || 'disabled',
        totalPurchases,
        totalPaid,
        totalDebt,
        invoicesCount,
        unpaidInvoicesCount
      };
    });
  }, [customers, sales]);

  const allCustomersDisabled = useMemo(() => {
    if (allMergedCustomers.length === 0) return false;
    return allMergedCustomers.every(c => c.reminderSchedule === 'disabled');
  }, [allMergedCustomers]);

  // Filter and search
  const filteredCustomers = useMemo(() => {
    return allMergedCustomers.filter((c) => {
      if (filterType === 'client' && c.customerType !== 'client') return false;
      if (filterType === 'customer' && c.customerType !== 'customer') return false;
      if (filterType === 'debt' && (c.totalDebt || 0) <= 0) return false;
      if (filterType === 'settled' && (c.totalDebt || 0) > 0) return false;
      if (filterType === 'no-phone' && (c.phone1 || '').trim()) return false;

      if (searchTerm.trim()) {
        const q = normalizeArabic(searchTerm);
        const nameNorm = normalizeArabic(c.name);
        const p1 = (c.phone1 || '').replace(/[\s\-]/g, '');
        const p2 = (c.phone2 || '').replace(/[\s\-]/g, '');
        return (
          nameNorm.includes(q) ||
          p1.includes(searchTerm.trim()) ||
          p2.includes(searchTerm.trim())
        );
      }
      return true;
    }).sort((a, b) => {
      if ((b.totalDebt || 0) !== (a.totalDebt || 0)) {
        return (b.totalDebt || 0) - (a.totalDebt || 0);
      }
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [allMergedCustomers, filterType, searchTerm]);

  // KPIs
  const totalStats = useMemo(() => {
    let totalDebtAll = 0;
    let totalPurchasesAll = 0;
    let withPhoneCount = 0;
    let withDebtCount = 0;
    let clientsCount = 0;
    let customersCount = 0;

    allMergedCustomers.forEach(c => {
      totalDebtAll += Number(c.totalDebt || 0);
      totalPurchasesAll += Number(c.totalPurchases || 0);
      if ((c.phone1 || '').trim()) withPhoneCount++;
      if ((c.totalDebt || 0) > 0) withDebtCount++;
      if (c.customerType === 'client') clientsCount++;
      else customersCount++;
    });

    return {
      totalCustomers: allMergedCustomers.length,
      totalDebtAll,
      totalPurchasesAll,
      withPhoneCount,
      withDebtCount,
      clientsCount,
      customersCount
    };
  }, [allMergedCustomers]);

  async function handleDelete(customer) {
    if (!customer?.id || customer.isDiscovered) {
      toast('لا يمكن حذف هذا السجل لأنه غير محفوظ بعد كعميل دائم', 'warning');
      return;
    }

    confirm(
      'حذف العميل',
      `هل أنت متأكد من حذف بيانات العميل «${customer.name}»؟ لن يتم حذف فواتيره السابقة.`,
      async () => {
        try {
          await deleteCustomer(customer.id);
          toast('تم حذف بيانات العميل بنجاح', 'success');
        } catch (err) {
          toast(`فشل الحذف: ${err.message}`, 'error');
        }
      }
    );
  }

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedDebtorIds, setSelectedDebtorIds] = useState([]);
  const [sendIntervalSec, setSendIntervalSec] = useState(5);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState({ current: 0, total: 0, currentName: '', countdown: 0 });
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [sendingIndividualId, setSendingIndividualId] = useState(null);
  const [checkingReminders, setCheckingReminders] = useState(false);
  const [showScheduledModal, setShowScheduledModal] = useState(false);

  const debtorsList = useMemo(() => {
    return allMergedCustomers.filter(c => (c.totalDebt || 0) > 0 && (c.phone1 || '').trim());
  }, [allMergedCustomers]);

  // فحص وتشغيل التذكيرات المستحقة الآن تلقائياً
  async function handleCheckDueReminders() {
    setCheckingReminders(true);
    try {
      const dispatched = await processAutomatedDebtReminders({
        customers,
        sales,
        incomes,
        settings,
        onNotification: (cust, debt) => {
          toast(`تم إرسال تذكير الديون بنجاح إلى «${cust.name}» (${Number(debt).toLocaleString()} د.ع) 🚀`, 'success');
        }
      });

      if (dispatched.length === 0) {
        toast('لا توجد أي رسائل تذكير مستحقة في هذه اللحظة حسب جدول وساعات العملاء المحددة.', 'info');
      } else {
        toast(`تم إرسال التذكيرات المستحقة تلقائياً لـ ${dispatched.length} عميل! 🎉`, 'success');
      }
    } catch (err) {
      toast(`خطأ أثناء الفحص: ${err.message}`, 'error');
    } finally {
      setCheckingReminders(false);
    }
  }

  // تفعيل / تعطيل إرسال الواتساب السريع لعميل محدد بنقرة واحدة
  async function handleToggleWhatsApp(cust) {
    let targetId = cust.id;
    if (cust.isDiscovered) {
      targetId = await findOrCreateCustomer(cust.name, cust.phone1 || '', '', cust.customerType || 'customer');
    }
    
    const currentSched = cust.reminderSchedule || 'disabled';
    const isCurrentlyDisabled = currentSched === 'disabled';
    const newSched = isCurrentlyDisabled ? (cust.previousSchedule && cust.previousSchedule !== 'disabled' ? cust.previousSchedule : 'default') : 'disabled';
    
    try {
      await updateCustomer(targetId, {
        reminderSchedule: newSched,
        previousSchedule: isCurrentlyDisabled ? (cust.previousSchedule || 'default') : currentSched,
        lastDebtReminderSent: null,
        scheduleUpdatedAt: new Date().toISOString()
      });
      clearDebtorSessionLock(targetId);

      if (isCurrentlyDisabled && settings?.whatsappAutoReminders === false) {
        await updateStoreSettings({ whatsappAutoReminders: true });
      }

      if (isCurrentlyDisabled) {
        toast(`تم تفعيل إرسال الواتساب للعميل «${cust.name}» بنجاح 🔔`, 'success');
      } else {
        toast(`تم إيقاف وتعطيل إرسال الواتساب عن «${cust.name}» 🔕`, 'info');
      }
    } catch (err) {
      toast(`فشل تحديث إعدادات الواتساب: ${err.message}`, 'error');
    }
  }

  // إيقاف إرسال الواتساب عن جميع العملاء دفعة واحدة (لوضع التجربة بأمان)
  async function handleDisableAllWhatsApp() {
    confirm({
      title: 'إيقاف إرسال الواتساب عن جميع العملاء؟',
      message: 'سيتم تحويل حالة جميع العملاء إلى (معطل 🚫) وإيقاف الجدولة التلقائية لتتمكن من تفعيل وتجربة رقمك الخاص فقط بأمان تام ودون إرسال لأي زبون بالخطأ.',
      confirmText: 'نعم، عطل الإرسال عن الجميع',
      confirmButtonClass: 'btn-danger',
      onConfirm: async () => {
        try {
          const promises = customers.map(c => {
            if (c.reminderSchedule !== 'disabled') {
              return updateCustomer(c.id, {
                reminderSchedule: 'disabled',
                previousSchedule: c.reminderSchedule || 'default'
              });
            }
            return Promise.resolve();
          });
          await Promise.all(promises);
          await updateStoreSettings({ whatsappAutoReminders: false });
          toast('تم إيقاف تذكيرات الواتساب عن جميع العملاء والجدولة العامة بنجاح! 🛡️', 'success');
        } catch (err) {
          toast(`فشل العملية: ${err.message}`, 'error');
        }
      }
    });
  }

  // إعادة تفعيل الجدولة لجميع العملاء
  async function handleEnableAllWhatsApp() {
    confirm({
      title: 'إعادة تفعيل الجدولة لجميع العملاء؟',
      message: 'سيتم إعادة تفعيل جدولة الواتساب لجميع العملاء حسب مواعيدهم السابقة وتشغيل الجدولة العامة.',
      confirmText: 'نعم، أعد تفعيل الجميع',
      confirmButtonClass: 'btn-primary',
      onConfirm: async () => {
        try {
          const promises = customers.map(c => {
            const prev = c.previousSchedule || 'default';
            return updateCustomer(c.id, {
              reminderSchedule: prev === 'disabled' ? 'default' : prev
            });
          });
          await Promise.all(promises);
          await updateStoreSettings({ whatsappAutoReminders: true });
          toast('تم إعادة تفعيل تذكيرات الواتساب لجميع العملاء بنجاح! 🟢', 'success');
        } catch (err) {
          toast(`فشل العملية: ${err.message}`, 'error');
        }
      }
    });
  }

  // إرسال تذكير بالدين لعميل محدد عبر الواتساب (تلقائياً في الخلفية مع توفير رابط يدوي كبديل)
  async function handleSendDebtReminder(cust) {
    if (!cust.phone1) {
      toast('لا يوجد رقم هاتف مسجل لهذا العميل', 'warning');
      return;
    }

    setSendingIndividualId(cust.id);
    const rawPhone = String(cust.phone1 || '').replace(/[^\d]/g, '');
    const last4 = rawPhone.length >= 4 ? rawPhone.slice(-4) : rawPhone;
    const password = cust.pinCode || cust.passcode || last4 || 'آخر 4 أرقام من هاتفك';
    const pinParam = (password && password !== 'آخر 4 أرقام من هاتفك') ? `&pin=${password}` : '';
    const idParam = rawPhone ? `phone=${rawPhone}` : `name=${encodeURIComponent(cust.name)}`;
    const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&${idParam}${pinParam}`;
    const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;

    const message = renderWhatsAppTemplate(template, {
      customerName: cust.name,
      username: cust.name,
      password: password,
      pin: password,
      phone: cust.phone1,
      storeName: settings?.storeName || 'المحل',
      totalDebt: formatIQD(cust.totalDebt),
      unpaidInvoicesCount: cust.unpaidInvoicesCount || 1,
      statementLink: portalUrl
    });

    try {
      await sendWhatsAppMessageViaGateway({
        phone: cust.phone1,
        message,
        settings
      });

      if (cust.id && !cust.isDiscovered) {
        await updateCustomer(cust.id, {
          lastDebtReminderSent: new Date().toISOString()
        }).catch(console.error);
      }
      toast(`تم إرسال رسالة التذكير إلى «${cust.name}» عبر الواتساب بنجاح! 🚀`, 'success');
    } catch (err) {
      console.warn('Direct gateway send failed, falling back to manual wa.me:', err);
      const url = getWhatsAppDirectUrl(cust.phone1, message);
      window.open(url, '_blank');
      toast(`تعذر الإرسال التلقائي (تأكد من تشغيل السيرفر). تم فتح الواتساب يدوياً للعميل «${cust.name}»`, 'info');
    } finally {
      setSendingIndividualId(null);
    }
  }

  // مشاركة بيانات البوابة عبر الواتساب
  function handleSharePortalInfo(cust) {
    if (!cust.phone1) {
      toast('لا يوجد رقم هاتف مسجل لهذا العميل', 'warning');
      return;
    }
    const pin = cust.pinCode || (cust.phone1.length >= 4 ? cust.phone1.slice(-4) : '—');
    const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&name=${encodeURIComponent(cust.name)}`;
    const msg = `مرحباً ${cust.name} 🌸\nيمكنك متابعة كشف حسابك وفواتيرك ومشترياتك عبر بوابة العملاء الخاصة بنا:\n🔗 الرابط: ${portalUrl}\n👤 اسم الدخول: ${cust.name}\n🔑 رمز المرور: ${pin}`;
    const url = getWhatsAppDirectUrl(cust.phone1, msg);
    window.open(url, '_blank');
  }

  function handleOpenBulkModal() {
    if (debtorsList.length === 0) {
      toast('لا يوجد أي عملاء مدينين لديهم أرقام هواتف مسجلة', 'warning');
      return;
    }
    setSelectedDebtorIds(debtorsList.map(c => c.id));
    setCampaignLogs([]);
    setCampaignRunning(false);
    setShowBulkModal(true);
  }

  async function startBulkCampaign() {
    const targets = debtorsList.filter(c => selectedDebtorIds.includes(c.id));
    if (targets.length === 0) {
      toast('يرجى تحديد عميل واحد على الأقل', 'warning');
      return;
    }

    setCampaignRunning(true);
    const initialLogs = targets.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone1,
      totalDebt: c.totalDebt,
      status: 'pending',
      error: null
    }));
    setCampaignLogs(initialLogs);

    let sentSuccess = 0;

    for (let i = 0; i < targets.length; i++) {
      const cust = targets[i];
      setCampaignProgress({
        current: i + 1,
        total: targets.length,
        currentName: cust.name,
        countdown: 0
      });

      setCampaignLogs(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'sending' } : l));

      try {
        const rawPhone = String(cust.phone1 || '').replace(/[^\d]/g, '');
        const last4 = rawPhone.length >= 4 ? rawPhone.slice(-4) : rawPhone;
        const password = cust.pinCode || cust.passcode || last4 || 'آخر 4 أرقام من هاتفك';
        const pinParam = (password && password !== 'آخر 4 أرقام من هاتفك') ? `&pin=${password}` : '';
        const idParam = rawPhone ? `phone=${rawPhone}` : `name=${encodeURIComponent(cust.name)}`;
        const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&${idParam}${pinParam}`;
        const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;

        const message = renderWhatsAppTemplate(template, {
          customerName: cust.name,
          username: cust.name,
          password: password,
          pin: password,
          phone: cust.phone1,
          storeName: settings?.storeName || 'المحل',
          totalDebt: formatIQD(cust.totalDebt),
          unpaidInvoicesCount: cust.unpaidInvoicesCount || 1,
          statementLink: portalUrl
        });

        await sendWhatsAppMessageViaGateway({
          phone: cust.phone1,
          message,
          settings
        });

        if (cust.id && !cust.isDiscovered) {
          await updateCustomer(cust.id, {
            lastDebtReminderSent: new Date().toISOString()
          }).catch(console.error);
        }

        sentSuccess++;
        setCampaignLogs(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'success' } : l));
      } catch (err) {
        console.error(`Error sending reminder to ${cust.name}:`, err);
        setCampaignLogs(prev => prev.map((l, idx) => idx === i ? { ...l, status: 'failed', error: err.message } : l));
      }

      // Interval countdown between sends if not last item
      if (i < targets.length - 1 && sendIntervalSec > 0) {
        for (let sec = sendIntervalSec; sec > 0; sec--) {
          setCampaignProgress(prev => ({ ...prev, countdown: sec }));
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    setCampaignRunning(false);
    toast(`اكتملت الحملة! تم إرسال التذكيرات بنجاح لـ ${sentSuccess} من أصل ${targets.length} عميل 🚀`, 'success');
  }

  function getScheduleLabel(schedule) {
    return formatAppleScheduleLabel(schedule, settings?.whatsappDefaultDay || 'thursday');
  }

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
            <span>👥</span>
            <span>دليل وإدارة العملاء والزبائن</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تصنيف العملاء (عميل / زبون)، أتمتة الفواتير، وجدولة تذكيرات الديون عبر الواتساب
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScheduledModal(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5"
            title="فتح لوحة طابور المواعيد المجدولة مع عداد تنازلي حي بالثواني"
          >
            <span>⏰</span>
            <span>طابور المواعيد والعداد الحي ⏳</span>
          </button>

          <button
            type="button"
            onClick={handleCheckDueReminders}
            disabled={checkingReminders}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="فحص فوري للعملاء المستحقة تذكيراتهم حسب أوقاتهم وساعاتهم المحددة وإرسالها"
          >
            <span>⚡</span>
            <span>{checkingReminders ? 'جارٍ الفحص والتجربة...' : 'فحص وتجربة الإرسال الآن'}</span>
          </button>

          <button
            type="button"
            onClick={isGlobalAutoDisabled || allCustomersDisabled ? handleEnableAllWhatsApp : handleDisableAllWhatsApp}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
              isGlobalAutoDisabled || allCustomersDisabled
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 ring-2 ring-rose-200'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}
            title={
              isGlobalAutoDisabled || allCustomersDisabled
                ? 'الجدولة متوقفة حالياً عن الجميع - انقر لإعادة تفعيل الجميع'
                : 'الجدولة نشطة - انقر لإيقافها عن جميع العملاء دفعة واحدة'
            }
          >
            <span>{isGlobalAutoDisabled || allCustomersDisabled ? '🔴' : '🟢'}</span>
            <span>
              {isGlobalAutoDisabled || allCustomersDisabled
                ? 'الجدولة التلقائية متوقفة 🔕 (انقر للتشغيل)'
                : 'الجدولة التلقائية نشطة 🔔 (إيقاف الجميع)'}
            </span>
          </button>

          {debtorsList.length > 0 && (
            <button
              type="button"
              onClick={handleOpenBulkModal}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="إرسال تذكير بالديون لجميع المدينين عبر الواتساب"
            >
              <span>📢</span>
              <span>إرسال تذكير الديون للجميع ({debtorsList.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setEditingCustomer({})}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>➕</span>
            <span>إضافة عميل / زبون</span>
          </button>
        </div>
      </div>

      {/* Scheduler Paused Safety Banner */}
      {(isGlobalAutoDisabled || allCustomersDisabled) && (
        <div className="bg-gradient-to-r from-rose-50 to-amber-50 border-2 border-rose-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 text-lg shrink-0">
              🔕
            </div>
            <div>
              <strong className="text-xs sm:text-sm font-black text-rose-950 block">
                الجدولة التلقائية لتذكيرات الواتساب متوقفة حالياً (وضع التجربة الآمن)
              </strong>
              <p className="text-[11px] text-rose-800/80 mt-0.5">
                لن يتم إرسال أي رسائل تلقائية للزبائن بالخطأ. يمكنك تفعيل زر الواتساب لأي عميل ترغب بتجربته فقط، أو إعادة تفعيل الجميع.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleEnableAllWhatsApp}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              إعادة تفعيل الجدولة للجميع 🟢
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-bold block mb-1">إجمالي العملاء والزبائن</span>
          <span className="text-2xl font-black text-slate-900">{totalStats.totalCustomers}</span>
          <div className="text-[11px] text-slate-400 mt-1 flex gap-2">
            <span>🏢 {totalStats.clientsCount} عميل</span>
            <span>•</span>
            <span>🛍️ {totalStats.customersCount} زبون</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-rose-600 font-bold block mb-1">إجمالي الديون المطلوبة</span>
          <span className="text-2xl font-black text-rose-600 font-mono">{formatIQD(totalStats.totalDebtAll)}</span>
          <div className="text-[11px] text-rose-500 font-bold mt-1">
            {totalStats.withDebtCount} عميل بذمتهم ديون
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-emerald-600 font-bold block mb-1">العملاء خالصي الحساب</span>
          <span className="text-2xl font-black text-emerald-700">
            {totalStats.totalCustomers - totalStats.withDebtCount}
          </span>
          <div className="text-[11px] text-emerald-600 mt-1 font-bold">
            رصيدهم: 0 د.ع ✅
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-bold block mb-1">أرقام الهواتف المسجلة</span>
          <span className="text-2xl font-black text-slate-900">{totalStats.withPhoneCount}</span>
          <div className="text-[11px] text-slate-400 mt-1">
            جاهزون لتلقي رسائل الواتساب 📱
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-bold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              الكل ({allMergedCustomers.length})
            </button>
            <button
              onClick={() => setFilterType('client')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'client' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              🏢 العملاء ({totalStats.clientsCount})
            </button>
            <button
              onClick={() => setFilterType('customer')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'customer' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              🛍️ الزبائن ({totalStats.customersCount})
            </button>
            <button
              onClick={() => setFilterType('debt')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'debt' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              عليهم ديون ({totalStats.withDebtCount})
            </button>
            <button
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'settled' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              خالصي الحساب ({totalStats.totalCustomers - totalStats.withDebtCount})
            </button>
            <button
              onClick={() => setFilterType('no-phone')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${filterType === 'no-phone' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              بدون هاتف ({totalStats.totalCustomers - totalStats.withPhoneCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-brand-500 font-bold"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Customer Table */}
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            لا يوجد عملاء مطابقين لخيارات البحث
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">التصنيف</th>
                  <th className="p-3.5">رقم الهاتف</th>
                  <th className="p-3.5">موعد التذكير والواتساب 💬</th>
                  <th className="p-3.5">الرصيد المتبقي (الدين)</th>
                  <th className="p-3.5">إجمالي المشتريات</th>
                  <th className="p-3.5 text-center">إجراءات وتذكير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const hasDebt = (cust.totalDebt || 0) > 0;
                  const isClient = cust.customerType === 'client';

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                      
                      {/* Name */}
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => setStatementCustomerName(cust.name)}
                          className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors text-right cursor-pointer flex items-center gap-1.5"
                          title="انقر لعرض كشف حساب وفواتير العميل"
                        >
                          <span>{cust.name}</span>
                          <span className="text-xs opacity-0 hover:opacity-100 text-indigo-500">📄</span>
                        </button>
                        {cust.notes && <div className="text-[11px] text-slate-400 mt-0.5">{cust.notes}</div>}
                      </td>

                      {/* Customer Type Badge */}
                      <td className="p-3.5">
                        {isClient ? (
                          <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                            <span>🏢</span>
                            <span>عميل</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                            <span>🛍️</span>
                            <span>زبون</span>
                          </span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="p-3.5 font-mono text-slate-700">
                        {cust.phone1 ? (
                          <div className="flex items-center gap-1.5">
                            <span>{cust.phone1}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">غير مسجل</span>
                        )}
                      </td>

                      {/* Reminder Schedule & WhatsApp Quick Toggle */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleWhatsApp(cust)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
                              isGlobalAutoDisabled || cust.reminderSchedule === 'disabled'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            }`}
                            title={
                              isGlobalAutoDisabled
                                ? 'الجدولة العامة معطلة - انقر لتفعيل العميل وتشغيل الجدولة'
                                : cust.reminderSchedule === 'disabled'
                                ? 'التذكير معطل لهذا العميل - انقر لتفعيله'
                                : 'التذكير مفعل لهذا العميل - انقر لإيقافه فوراً'
                            }
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isGlobalAutoDisabled || cust.reminderSchedule === 'disabled'
                                  ? 'bg-rose-500'
                                  : 'bg-emerald-500 animate-pulse'
                              }`}
                            ></span>
                            <span>
                              {isGlobalAutoDisabled || cust.reminderSchedule === 'disabled'
                                ? 'معطل 🔕'
                                : 'مفعل 🔔'}
                            </span>
                          </button>

                          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 font-mono">
                            {getScheduleLabel(isGlobalAutoDisabled ? 'disabled' : cust.reminderSchedule)}
                          </span>
                        </div>
                      </td>

                      {/* Total Debt */}
                      <td className="p-3.5 font-mono font-bold">
                        {hasDebt ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 text-xs inline-block font-black">
                              {formatIQD(cust.totalDebt)} د.ع
                            </span>
                            {cust.unpaidInvoicesCount > 0 && (
                              <span className="text-[10px] text-rose-600 bg-rose-100/60 px-1.5 py-0.5 rounded font-mono">
                                {cust.unpaidInvoicesCount} فاتورة
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs inline-block font-bold">
                            خالص ✓
                          </span>
                        )}
                      </td>

                      {/* Total Purchases */}
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        {formatIQD(cust.totalPurchases)} د.ع
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* Statement Button */}
                          <button
                            onClick={() => setStatementCustomerName(cust.name)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs transition-colors cursor-pointer border border-indigo-200 flex items-center gap-1"
                            title="عرض كشف حساب العميل بالكامل"
                          >
                            <span>📄</span>
                            <span>كشف حساب</span>
                          </button>

                          {/* Send WhatsApp Debt Reminder Button */}
                          {hasDebt && cust.phone1 && (
                            <button
                              onClick={() => handleSendDebtReminder(cust)}
                              disabled={sendingIndividualId === cust.id}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 rounded-lg font-bold text-xs transition-colors cursor-pointer border border-rose-200 flex items-center gap-1"
                              title="إرسال رسالة تذكير بالدين عبر الواتساب فوراً"
                            >
                              <span>{sendingIndividualId === cust.id ? '⏳' : '🔔'}</span>
                              <span>{sendingIndividualId === cust.id ? 'جارٍ الإرسال...' : 'تذكير واتساب'}</span>
                            </button>
                          )}

                          {/* Edit Button */}
                          <button
                            onClick={() => setEditingCustomer(cust)}
                            className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg font-bold text-xs transition-colors cursor-pointer border border-brand-200 flex items-center gap-1"
                            title="تعديل"
                          >
                            <span>✏️</span>
                          </button>

                          {/* Delete Button */}
                          {!cust.isDiscovered && (
                            <button
                              onClick={() => handleDelete(cust)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف"
                            >
                              🗑️
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Campaign Reminder Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📢</span>
                <div>
                  <h3 className="font-black text-slate-900 text-base">حملة تذكير الديون التلقائية عبر الواتساب</h3>
                  <p className="text-xs text-slate-500">إرسال رسائل تذكير بالمبالغ المتبقية وكشف الحساب تلقائياً</p>
                </div>
              </div>
              {!campaignRunning && (
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Campaign Config & Stats */}
            {!campaignRunning && campaignLogs.length === 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 shrink-0">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                    <span className="text-xs text-emerald-700 font-bold block">العملاء المستهدفين</span>
                    <span className="text-xl font-black text-emerald-900">{selectedDebtorIds.length} من {debtorsList.length}</span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-center">
                    <span className="text-xs text-rose-700 font-bold block">إجمالي مبالغ الديون</span>
                    <span className="text-xl font-black text-rose-900 font-mono">
                      {formatIQD(debtorsList.filter(c => selectedDebtorIds.includes(c.id)).reduce((acc, c) => acc + (c.totalDebt || 0), 0))} د.ع
                    </span>
                  </div>
                </div>

                {/* Interval Selection */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 shrink-0">
                  <label className="block text-xs font-bold text-slate-800">
                    ⏱️ الفاصل الزمني بين كل رسالة (لحماية رقمك من الحظر):
                  </label>
                  <select
                    value={sendIntervalSec}
                    onChange={(e) => setSendIntervalSec(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value={3}>⚡ سريع (فاصل 3 ثوانٍ بين كل رسالة)</option>
                    <option value={5}>⏱️ متزن - موصى به (فاصل 5 ثوانٍ)</option>
                    <option value={10}>🛡️ آمن (فاصل 10 ثوانٍ)</option>
                    <option value={30}>🔒 فائق الأمان (فاصل 30 ثانية)</option>
                    <option value={60}>⏳ دقيقة واحدة بين كل رسالة</option>
                    <option value={3600}>🕐 ساعة كاملة بين كل رسالة</option>
                  </select>
                </div>

                {/* Debtors List with Checkboxes */}
                <div className="flex-1 overflow-y-auto min-h-[160px] border border-slate-200 rounded-2xl divide-y divide-slate-100">
                  <div className="p-2.5 bg-slate-100/70 flex items-center justify-between text-xs font-bold text-slate-700 sticky top-0">
                    <span>قائمة العملاء المدينين:</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDebtorIds.length === debtorsList.length) {
                          setSelectedDebtorIds([]);
                        } else {
                          setSelectedDebtorIds(debtorsList.map(c => c.id));
                        }
                      }}
                      className="text-brand-600 hover:underline cursor-pointer"
                    >
                      {selectedDebtorIds.length === debtorsList.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  {debtorsList.map((cust) => {
                    const isChecked = selectedDebtorIds.includes(cust.id);
                    return (
                      <label
                        key={cust.id}
                        className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDebtorIds([...selectedDebtorIds, cust.id]);
                              } else {
                                setSelectedDebtorIds(selectedDebtorIds.filter(id => id !== cust.id));
                              }
                            }}
                            className="w-4 h-4 text-emerald-600 rounded"
                          />
                          <div>
                            <strong className="text-slate-900 block font-bold">{cust.name}</strong>
                            <span className="text-slate-500 font-mono text-[11px]">{cust.phone1}</span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {formatIQD(cust.totalDebt)} د.ع
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={startBulkCampaign}
                    disabled={selectedDebtorIds.length === 0}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🚀</span>
                    <span>بدء إرسال التذكيرات الآن ({selectedDebtorIds.length})</span>
                  </button>
                </div>
              </>
            ) : (
              /* Active Sending View / Progress Logs */
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>
                      {campaignRunning ? `جارٍ الإرسال إلى (${campaignProgress.currentName})...` : 'تم اكتمال إرسال الحملة! 🎉'}
                    </span>
                    <span className="font-mono">{campaignProgress.current} / {campaignProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${Math.round((campaignProgress.current / Math.max(1, campaignProgress.total)) * 100)}%` }}
                    ></div>
                  </div>
                  {campaignRunning && campaignProgress.countdown > 0 && (
                    <div className="text-[11px] text-amber-800 font-bold bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 flex items-center justify-between">
                      <span>⏳ فاصل زمني لحماية الواتساب:</span>
                      <span>الرسالة التالية بعد {campaignProgress.countdown} ثوانٍ...</span>
                    </div>
                  )}
                </div>

                {/* Progress Logs */}
                <div className="flex-1 overflow-y-auto max-h-[260px] border border-slate-200 rounded-2xl divide-y divide-slate-100">
                  {campaignLogs.map((log, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900 block font-bold">{log.name}</strong>
                        <span className="text-slate-500 font-mono text-[11px]">{log.phone}</span>
                      </div>
                      <div>
                        {log.status === 'pending' && <span className="text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg font-bold">بانتظار الدور ⏳</span>}
                        {log.status === 'sending' && <span className="text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-lg font-bold animate-pulse">جارٍ الإرسال... 📤</span>}
                        {log.status === 'success' && <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold">تم الإرسال بنجاح ✅</span>}
                        {log.status === 'failed' && <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg font-bold" title={log.error}>فشل الإرسال ❌</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {!campaignRunning && (
                  <div className="pt-2 flex justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {editingCustomer && (
        <AddCustomerModal
          customer={editingCustomer.id ? editingCustomer : null}
          onClose={() => setEditingCustomer(null)}
        />
      )}

      {/* Customer Statement Modal */}
      {statementCustomerName && (
        <CustomerStatementModal
          initialCustomerName={statementCustomerName}
          onClose={() => setStatementCustomerName(null)}
        />
      )}

      {/* Live Scheduled Messages & Reminders Queue Modal */}
      <ScheduledMessagesModal
        isOpen={showScheduledModal}
        onClose={() => setShowScheduledModal(false)}
      />

    </div>
  );
}
