import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSales } from '../hooks/useSales';
import { useIncomes } from '../hooks/useIncomes';
import { useCustomers } from '../hooks/useCustomers';
import { useSettings } from '../hooks/useSettings';
import { useDraftSales } from '../hooks/useDraftSales';
import CustomerSelect from './CustomerSelect';
import InvoiceReceipt from './InvoiceReceipt';
import CustomerPaymentModal from './CustomerPaymentModal';
import InvoiceDocument from './InvoiceDocument';
import SuspendedStatementModal from './SuspendedStatementModal';
import defaultLogo from '../assets/logo.png';
import { getDisplayName } from '../utils/userUtils';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

function formatDateSafe(timestamp) {
  if (!timestamp) return '—';
  const date = toDateSafe(timestamp);
  return date ? date.toLocaleString('ar-IQ') : '—';
}

export default function CustomerStatementModal({ initialCustomerName = '', onClose }) {
  const { sales, loading: salesLoading } = useSales();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { customers } = useCustomers();
  const { settings } = useSettings();
  const { drafts } = useDraftSales();

  const [customerName, setCustomerName] = useState(initialCustomerName || '');
  const [viewingSale, setViewingSale] = useState(null);
  const [payingSale, setPayingSale] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [printOption, setPrintOption] = useState('all'); // 'all' | 'statement_only' | 'invoices_only'
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showCustomerSuspendedStatement, setShowCustomerSuspendedStatement] = useState(false);

  React.useEffect(() => {
    if (initialCustomerName) {
      setCustomerName(initialCustomerName);
    }
  }, [initialCustomerName]);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const matchedCustomer = useMemo(() => {
    if (!customerName.trim()) return null;
    const target = customerName.trim().toLowerCase();
    return (customers || []).find(
      (c) => (c.name || '').trim().toLowerCase() === target
    ) || null;
  }, [customers, customerName]);

  const customerSales = useMemo(() => {
    if (!customerName.trim()) return [];
    const targetName = customerName.trim().toLowerCase();
    return sales
      .filter((s) => {
        const sName = (s.customerName || '').trim().toLowerCase();
        const matchesName = sName === targetName;
        const matchesId = matchedCustomer?.id && s.customerId === matchedCustomer.id;
        return matchesName || matchesId;
      })
      .sort((a, b) => {
        const d1 = toDateSafe(a.createdAt) || new Date(0);
        const d2 = toDateSafe(b.createdAt) || new Date(0);
        return d1 - d2; // أقدم للأحدث
      });
  }, [sales, customerName, matchedCustomer]);

  const customerIncomes = useMemo(() => {
    if (!customerName.trim()) return [];
    const targetName = customerName.trim().toLowerCase();
    return incomes
      .filter((inc) => {
        const name = (inc.customerName || inc.payerName || '').trim().toLowerCase();
        return name === targetName || (name && targetName && (name.includes(targetName) || targetName.includes(name)));
      })
      .sort((a, b) => {
        const d1 = new Date(inc.date || inc.createdAt || 0);
        const d2 = new Date(b.date || b.createdAt || 0);
        return d1 - d2;
      });
  }, [incomes, customerName]);

  const customerDrafts = useMemo(() => {
    if (!customerName.trim()) return [];
    const targetName = customerName.trim().toLowerCase();
    return (drafts || []).filter((d) => {
      const dName = (d.customerName || '').trim().toLowerCase();
      const matchesName = dName === targetName;
      const matchesId = matchedCustomer?.id && d.customerId === matchedCustomer.id;
      return matchesName || matchesId;
    });
  }, [drafts, customerName, matchedCustomer]);

  const customerDraftsTotal = useMemo(() => {
    return customerDrafts.reduce((sum, d) => sum + (Number(d.total) || 0), 0);
  }, [customerDrafts]);

  const summary = useMemo(() => {
    let totalPurchases = 0;
    let totalDebt = 0;
    let cashPaid = 0;
    let oldInvoicesAmount = 0;

    for (const s of customerSales) {
      const type = s.invoiceType || 'cash';
      const amt = Number(s.total) || 0;
      totalPurchases += amt;
      
      if (type === 'debt') {
        const paid = Number(s.paidAmount) || 0;
        const remaining = s.remainingDebt !== undefined 
          ? Math.min(Number(s.remainingDebt), Math.max(0, amt - paid)) 
          : Math.max(0, amt - paid);
        totalDebt += remaining;
        cashPaid += paid;
      } else {
        cashPaid += amt;
      }
    }

    for (const inc of customerIncomes) {
      const amt = Number(inc.amount) || 0;
      oldInvoicesAmount += amt;
      cashPaid += amt;
    }

    return { totalPurchases, totalDebt, cashPaid, oldInvoicesAmount };
  }, [customerSales, customerIncomes]);

  const customerPhone = matchedCustomer?.phone1 || customerSales.find(s => s.customerPhone || s.phone)?.customerPhone || '';
  const customerPin = matchedCustomer?.pinCode || (customerPhone ? customerPhone.slice(-4) : 'آخر 4 أرقام');
  const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&name=${encodeURIComponent(customerName)}`;

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  function handleSendWhatsApp() {
    const rawPhone = String(customerPhone).replace(/[\s\-\+\(\)]/g, '');
    const cleanPhone = rawPhone.startsWith('0') ? '964' + rawPhone.slice(1) : (rawPhone.startsWith('964') ? rawPhone : '964' + rawPhone);
    const msg = encodeURIComponent(
      `مرحباً ${customerName}،\nيمكنك الآن متابعة كشف حسابك، فواتيرك، والمبالغ المسددة عبر بوابة عملاء Safe Zone الرسمية:\n🔗 رابط البوابة: ${portalUrl}\n👤 اسم الدخول: ${customerName}\n🔑 رمز المرور (الباسورد): ${customerPin}\n\nشكراً لتعاملكم معنا.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  }

  function handlePrint(mode = printOption) {
    setShowPrintMenu(false);
    setPrintOption(mode);
    const originalTitle = document.title;
    const typeLabel = mode === 'statement_only' ? 'كشف_حساب' : mode === 'invoices_only' ? 'فواتير' : 'كشف_حساب_وفواتير';
    document.title = `${typeLabel}_${customerName || 'عميل'}`;
    
    // تأخير طفيف لضمان تحديث الـ DOM للـ Portal قبل فتح نافذة الطباعة
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = originalTitle; }, 1000);
    }, 150);
  }

  function scrollToInvoice(saleId) {
    const el = document.getElementById(`invoice-screen-card-${saleId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-brand-500', 'transition-all');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-brand-500');
      }, 2000);
    }
  }

  const statementRows = useMemo(() => {
    const rows = [];

    customerSales.forEach((sale) => {
      const date = toDateSafe(sale.createdAt);
      const isDebt = (sale.invoiceType || 'cash') === 'debt';
      const totalAmt = Number(sale.total) || 0;
      const paidAmt = Number(sale.paidAmount) || 0;
      const remainingAmt = sale.remainingDebt !== undefined 
        ? Math.min(Number(sale.remainingDebt), Math.max(0, totalAmt - paidAmt))
        : Math.max(0, totalAmt - paidAmt);
      const isSettled = isDebt && remainingAmt <= 0;

      rows.push({
        id: `sale-${sale.id}`,
        rawId: sale.id,
        type: 'sale',
        date: date,
        dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
        refNumber: `#${sale.invoiceNumber}`,
        badgeLabel: isDebt ? (isSettled ? 'مسدد بالكامل ✓' : paidAmt > 0 ? 'مسدد جزئياً' : 'دين غير مسدد') : 'نقدي',
        badgeClass: isDebt ? (isSettled ? 'text-emerald-700 bg-emerald-100 border border-emerald-200' : paidAmt > 0 ? 'text-amber-800 bg-amber-100 border border-amber-200' : 'text-rose-700 bg-rose-100 border border-rose-200') : 'text-emerald-700 bg-emerald-100',
        itemsDescription: (sale.items || []).map(i => i.name).slice(0, 3).join('، ') + ((sale.items?.length || 0) > 3 ? '...' : ''),
        itemsCount: `${sale.items?.length || 0} مادة`,
        totalAmt,
        paidAmt: isDebt ? paidAmt : totalAmt,
        remainingAmt: isDebt ? remainingAmt : 0,
        saleObj: sale
      });
    });

    customerIncomes.forEach((inc) => {
      const date = inc.date ? new Date(inc.date) : new Date(inc.createdAt || 0);
      const amt = Number(inc.amount) || 0;

      rows.push({
        id: `inc-${inc.id}`,
        rawId: inc.id,
        type: 'old_invoice',
        date: date,
        dateFormatted: inc.date ? new Date(inc.date).toLocaleDateString('ar-IQ') : (date ? date.toLocaleDateString('ar-IQ') : '—'),
        refNumber: 'سند إيراد سابق',
        badgeLabel: '📑 فاتورة قديمة قبل النظام',
        badgeClass: 'text-indigo-800 bg-indigo-100 border border-indigo-300 font-bold',
        itemsDescription: `${inc.title}${inc.notes ? ` (${inc.notes})` : ''}`,
        itemsCount: 'سند قبض',
        totalAmt: amt,
        paidAmt: amt,
        remainingAmt: 0,
        incomeObj: inc
      });
    });

    return rows.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  }, [customerSales, customerIncomes]);

  const displayedSales = useMemo(() => {
    if (!invoiceSearch.trim()) return customerSales;
    const q = invoiceSearch.trim().toLowerCase();
    return customerSales.filter(sale => {
      const invNum = String(sale.invoiceNumber || '').toLowerCase();
      const itemsMatch = (sale.items || []).some(item => (item.name || '').toLowerCase().includes(q));
      return invNum.includes(q) || itemsMatch;
    });
  }, [customerSales, invoiceSearch]);

  const loading = salesLoading || incomesLoading;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-ink-900/60 backdrop-blur-sm print:p-0 print:bg-white" dir="rtl">
      {/* نافذة العرض على الشاشة */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden print:hidden">
        
        {/* Header الشريط العلوي */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-ink-100 bg-ink-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
              <span>كشف حساب عميل:</span>
              <span className="text-brand-600 underline decoration-brand-300">{customerName || 'اختر عميل'}</span>
            </h2>
            <p className="text-xs sm:text-sm text-ink-500 mt-1">
              عرض تفصيلي لحركة الحساب وكافة فواتير المشتريات صفحة تحت صفحة
            </p>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* زر خيارات الطباعة */}
            <div className="relative">
              <button 
                onClick={() => handlePrint('all')}
                className="p-2 px-3.5 sm:px-4 text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-all active:scale-95 font-bold text-sm"
                title="طباعة كشف الحساب وكافة الفواتير التفصيلية"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                <span>طباعة كاملة 🖨️</span>
              </button>
              <button
                onClick={() => setShowPrintMenu(prev => !prev)}
                className="p-2 px-2 text-white bg-brand-700 hover:bg-brand-800 rounded-l-xl -mr-1 border-r border-brand-500 cursor-pointer"
                title="خيارات طباعة إضافية"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>

              {showPrintMenu && (
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-right text-xs">
                  <button
                    onClick={() => handlePrint('all')}
                    className="w-full text-right px-4 py-2 hover:bg-brand-50 flex items-center gap-2 font-bold text-slate-800"
                  >
                    <span>📄</span>
                    <span>كشف الحساب + كافة الفواتير (الكل)</span>
                  </button>
                  <button
                    onClick={() => handlePrint('statement_only')}
                    className="w-full text-right px-4 py-2 hover:bg-brand-50 flex items-center gap-2 font-bold text-slate-700"
                  >
                    <span>📋</span>
                    <span>كشف الحساب المالي فقط</span>
                  </button>
                  <button
                    onClick={() => handlePrint('invoices_only')}
                    className="w-full text-right px-4 py-2 hover:bg-brand-50 flex items-center gap-2 font-bold text-slate-700"
                  >
                    <span>📑</span>
                    <span>الفواتير التفصيلية فقط</span>
                  </button>
                </div>
              )}
            </div>

            {/* زر الإغلاق */}
            <button 
              onClick={onClose} 
              className="p-2 text-ink-400 hover:text-ink-700 bg-white rounded-xl shadow-sm border border-ink-200 cursor-pointer"
              title="إغلاق"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>

        {/* جسم النافذة القابل للتمرير */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto min-h-0 bg-slate-50/50 space-y-6">
          
          {/* شريط اختيار العميل وبوابة الواتساب */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-ink-200 shadow-sm max-w-sm w-full">
              <CustomerSelect value={customerName} onChange={setCustomerName} />
            </div>

            {customerName.trim() && (
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3.5 px-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm border border-slate-700 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-base shrink-0">
                    📱
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 block uppercase">بوابة كشف حساب العميل</span>
                    <div className="text-xs text-slate-200 flex items-center gap-2 mt-0.5">
                      <span>الهاتف: <strong className="text-white font-mono">{customerPhone || 'غير مسجل'}</strong></span>
                      <span className="text-slate-500">•</span>
                      <span>رمز المرور PIN: <strong className="text-emerald-300 font-mono">{customerPin}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPortalLink}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      copiedLink 
                        ? 'bg-emerald-600 text-white border-emerald-500' 
                        : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                    }`}
                  >
                    <span>{copiedLink ? '✓' : '🔗'}</span>
                    <span>{copiedLink ? 'تم نسخ الرابط!' : 'نسخ رابط البوابة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="إرسال رابط البوابة وبيانات الدخول للعميل عبر واتساب"
                  >
                    <span>💬</span>
                    <span>إرسال واتساب</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {customerName.trim() && (
            <>
              {/* شارة تنبيه إذا كان لدى العميل فواتير معلقة */}
              {customerDrafts.length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-indigo-950 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">⏳</span>
                    <div>
                      <p className="text-xs font-black">
                        يوجد لهذا العميل {customerDrafts.length} فواتير معلقة / محجوزة بإجمالي {customerDraftsTotal.toLocaleString()} د.ع
                      </p>
                      <p className="text-[11px] text-indigo-700">
                        هذه الفواتير لم تُؤكد بعد كبيع نهائي وتعتبر موادها محجوزة بالمخزن.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomerSuspendedStatement(true)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>📑</span>
                    <span>فتح كشف المعلقات لهذا العميل</span>
                  </button>
                </div>
              )}

              {/* بطاقات الإحصائيات الأربعة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-brand-100 text-center">
                  <p className="text-xl font-black text-ink-900 font-mono">{summary.totalPurchases.toLocaleString()} د.ع</p>
                  <p className="text-xs text-ink-500 mt-1 font-bold">إجمالي مشتريات النظام (الفواتير)</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                  <p className="text-xl font-black text-emerald-600 font-mono">{summary.cashPaid.toLocaleString()} د.ع</p>
                  <p className="text-xs text-emerald-600 mt-1 font-bold">إجمالي المدفوع نقداً</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-xl shadow-sm border border-indigo-200 text-center">
                  <p className="text-xl font-black text-indigo-800 font-mono">{summary.oldInvoicesAmount.toLocaleString()} د.ع</p>
                  <p className="text-xs text-indigo-700 mt-1 font-bold">فواتير قديمة قبل النظام</p>
                </div>
                <div className="bg-warn-50 p-4 rounded-xl shadow-sm border-2 border-warn-400 text-center">
                  <p className="text-xl font-black text-warn-900 font-mono">{summary.totalDebt.toLocaleString()} د.ع</p>
                  <p className="text-xs text-warn-800 mt-1 font-bold">الديون المتبقية بذمة العميل</p>
                </div>
              </div>

              {/* بطاقة جدول ملخص الحركات المالية */}
              <div className="bg-white rounded-2xl border border-ink-200 shadow-sm overflow-hidden">
                <div className="p-4 font-bold text-ink-900 border-b border-ink-100 bg-ink-50/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>📊 سجل الحركات والفواتير الملخص</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-bold">
                      {statementRows.length} حركة
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    💡 انقر على "عرض الفاتورة بالأسفل" للانتقال السريع للفاتورة التفصيلية
                  </div>
                </div>

                {loading ? (
                  <p className="p-8 text-center text-ink-400">جارٍ التحميل...</p>
                ) : statementRows.length === 0 ? (
                  <p className="p-8 text-center text-ink-400">لا توجد أي فواتير أو حركات مسجلة باسم "{customerName}"</p>
                ) : (
                  <div className="overflow-x-auto max-h-[36vh] overflow-y-auto">
                    <table className="w-full text-sm text-right whitespace-nowrap">
                      <thead className="bg-ink-50 text-ink-700 border-b border-ink-100 text-xs sticky top-0 z-10 shadow-2xs">
                        <tr>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">رقم المرجع / الفاتورة</th>
                          <th className="p-3">نوع الحركة</th>
                          <th className="p-3">البيان / الأصناف</th>
                          <th className="p-3">المبلغ الكلي</th>
                          <th className="p-3">المدفوع</th>
                          <th className="p-3">المتبقي (الدين)</th>
                          <th className="p-3 text-center">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statementRows.map((row) => {
                          const isOldInvoice = row.type === 'old_invoice';

                          return (
                            <tr 
                              key={row.id} 
                              className={`hover:bg-slate-50 transition-colors ${
                                isOldInvoice 
                                  ? 'bg-indigo-50/30' 
                                  : row.remainingAmt > 0 
                                  ? 'bg-rose-50/20' 
                                  : 'bg-emerald-50/10'
                              }`}
                            >
                              <td className="p-3 text-ink-600 font-mono text-xs">{row.dateFormatted}</td>
                              <td className="p-3 font-bold font-mono text-slate-900">{row.refNumber}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.badgeClass}`}>
                                  {row.badgeLabel}
                                </span>
                              </td>
                              <td className="p-3 text-slate-700 max-w-xs truncate" title={row.itemsDescription}>
                                {row.itemsDescription}
                              </td>
                              <td className="p-3 font-bold text-ink-900 font-mono">{row.totalAmt.toLocaleString()} د.ع</td>
                              <td className="p-3 font-bold text-emerald-700 font-mono">
                                {row.paidAmt.toLocaleString()} د.ع
                              </td>
                              <td className="p-3 font-bold font-mono">
                                {row.remainingAmt > 0 ? (
                                  <span className="text-rose-700 font-black">
                                    {row.remainingAmt.toLocaleString()} د.ع
                                  </span>
                                ) : (
                                  <span className="text-emerald-700">0 د.ع</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {row.saleObj && (
                                    <>
                                      {(row.saleObj.invoiceType === 'debt') && (
                                        <button
                                          onClick={() => setPayingSale(row.saleObj)}
                                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                                            row.remainingAmt <= 0
                                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          }`}
                                        >
                                          <span>💵</span>
                                          <span>{row.remainingAmt <= 0 ? 'سجل الدفعات' : 'تسديد دين'}</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => scrollToInvoice(row.rawId)}
                                        className="text-brand-600 hover:text-brand-800 text-xs font-bold underline cursor-pointer flex items-center gap-1"
                                      >
                                        <span>عرض الفاتورة بالأسفل ↓</span>
                                      </button>
                                    </>
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

              {/* قسم الفواتير التفصيلية المرفقة صفحة تحت صفحة */}
              <div className="pt-4 border-t-2 border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>📑 الفواتير التفصيلية المرفقة بكشف الحساب</span>
                      <span className="text-xs px-2.5 py-1 bg-brand-100 text-brand-800 rounded-full font-extrabold">
                        {customerSales.length} فاتورة
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      معروضة بالكامل بأصنافها وأسعارها وإجمالياتها الرسمية صفحة تحت صفحة
                    </p>
                  </div>

                  {/* خانة بحث سريعة داخل الفواتير */}
                  {customerSales.length > 1 && (
                    <div className="w-full sm:w-64">
                      <input
                        type="text"
                        placeholder="🔍 بحث برقم الفاتورة أو اسم الصنف..."
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                      />
                    </div>
                  )}
                </div>

                {customerSales.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                    لا توجد فواتير تفصيلية مسجلة باسم هذا العميل في النظام.
                  </div>
                ) : displayedSales.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                    لا توجد فواتير تطابق نص البحث: "{invoiceSearch}"
                  </div>
                ) : (
                  <div className="space-y-8">
                    {displayedSales.map((sale, index) => {
                      const isDebt = sale.invoiceType === 'debt';
                      const totalAmt = Number(sale.total) || 0;
                      const paidAmt = Number(sale.paidAmount) || 0;
                      const remainingAmt = sale.remainingDebt !== undefined 
                        ? Math.min(Number(sale.remainingDebt), Math.max(0, totalAmt - paidAmt))
                        : Math.max(0, totalAmt - paidAmt);

                      return (
                        <div 
                          key={sale.id}
                          id={`invoice-screen-card-${sale.id}`}
                          className="bg-slate-100/70 p-4 sm:p-6 rounded-2xl border border-slate-200 transition-all duration-300"
                        >
                          {/* شريط عنوان الفاتورة وأزرارها السريعة */}
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs">
                            <div className="flex items-center gap-3">
                              <span className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 text-brand-700 font-bold text-xs flex items-center justify-center font-mono">
                                #{index + 1}
                              </span>
                              <div>
                                <span className="font-mono font-extrabold text-slate-900 text-sm">
                                  فاتورة رقم #{sale.invoiceNumber}
                                </span>
                                <span className="text-xs text-slate-500 mr-2 font-mono">
                                  ({formatDateSafe(sale.createdAt)})
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* شارة حالة الدفع */}
                              {isDebt ? (
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  remainingAmt <= 0 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}>
                                  {remainingAmt <= 0 ? 'دين مسدد بالكامل ✓' : `متبقي دين: ${remainingAmt.toLocaleString()} د.ع`}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  نقدي ✓
                                </span>
                              )}

                              {/* تسديد دين */}
                              {isDebt && (
                                <button
                                  type="button"
                                  onClick={() => setPayingSale(sale)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <span>💵</span>
                                  <span>{remainingAmt <= 0 ? 'سجل الدفعات' : 'تسديد'}</span>
                                </button>
                              )}

                              {/* عرض منفصل وواتساب */}
                              <button
                                type="button"
                                onClick={() => setViewingSale(sale)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
                                title="فتح نافذة الفاتورة الفردية لمشاركتها عبر واتساب أو تيليجرام"
                              >
                                <span>🔍</span>
                                <span>مشاركة / تفاصيل</span>
                              </button>
                            </div>
                          </div>

                          {/* مكون الفاتورة الكاملة صفحة تحت صفحة */}
                          <InvoiceDocument 
                            sale={sale} 
                            settings={settings} 
                            isPrintOnly={false}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- المنفذ المخصص للطباعة (Portal خارج حدود التطبيق لضمان طباعة دقيقة 100% بدون أي قص) --- */}
      {createPortal(
        <div id="statement-print-portal" className="hidden print:block w-full relative m-0 p-0 bg-white" dir="rtl">
          {/* 1. صفحة كشف الحساب المالي المعتمد (الصفحة الأولى) */}
          {(printOption === 'all' || printOption === 'statement_only') && (
            <div className="statement-a4-page relative bg-white w-full max-w-[210mm] mx-auto min-h-[280mm] p-8 flex flex-col justify-between print:break-after-page box-border">
              {/* العلامة المائية للطباعة */}
              {settings?.logoUrl && (
                <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-15 overflow-hidden">
                  <img 
                    src={settings.logoUrl} 
                    alt="" 
                    className="w-[75%] max-w-[500px] h-auto object-contain filter grayscale" 
                    crossOrigin="anonymous" 
                  />
                </div>
              )}

              <div className="relative z-10 flex-grow flex flex-col justify-between">
                <div>
                  {/* ترويسة المتجر الرسمية */}
                  <div className="flex items-center justify-between border-b-2 border-[#C89B3C] pb-3 mb-4">
                    <div className="flex flex-col items-start text-right">
                      <h1 className="text-3xl font-black text-slate-900 mb-1" style={{ letterSpacing: '0px' }}>
                        {(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}
                      </h1>
                      <p className="text-xs text-slate-600 font-bold mt-0.5">أنظمة المراقبة الذكية والحماية الإلكترونية</p>
                      {settings?.address && (
                        <p className="text-xs text-slate-500 font-bold mt-1" style={{ direction: 'rtl' }}>
                          <span style={{ color: '#C89B3C', marginLeft: '6px' }}>📍</span>
                          <span>{settings.address}</span>
                        </p>
                      )}
                      {settings?.phone && (
                        <p className="text-xs text-slate-500 font-bold mt-0.5" style={{ direction: 'rtl' }}>
                          <span style={{ color: '#C89B3C', marginLeft: '6px' }}>📞</span>
                          <span className="font-mono">{settings.phone}</span>
                        </p>
                      )}
                    </div>

                    <div className="h-24 flex items-center justify-start relative pr-2">
                      <img 
                        src={settings?.logoUrl || defaultLogo} 
                        alt="الشعار" 
                        className="h-24 w-auto object-contain scale-[2] origin-left" 
                        crossOrigin="anonymous"
                      />
                    </div>
                  </div>

                  {/* عنوان المستند وبيانات العميل */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-xl p-3.5 mb-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-900">كشف حساب عميل مالي وتفصيلي</h2>
                      <p className="text-xs text-slate-700 mt-1">
                        العميل: <strong className="text-slate-900 text-sm font-extrabold">{customerName}</strong>
                        {customerPhone && <span className="mr-3 text-slate-600">الهاتف: <strong className="font-mono text-slate-900">{customerPhone}</strong></span>}
                      </p>
                    </div>
                    <div className="text-left text-xs text-slate-600 font-medium">
                      <p>تاريخ الكشف: <strong className="text-slate-900">{new Date().toLocaleDateString('ar-IQ')}</strong></p>
                      <p className="mt-0.5">عدد الفواتير: <strong className="text-slate-900 font-mono">{customerSales.length}</strong> فاتورة</p>
                    </div>
                  </div>

                  {/* ملخص الأرصدة المالية في بطاقات مطبوعة */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="border border-slate-300 rounded-xl p-3 text-center bg-slate-50">
                      <p className="text-xs text-slate-600 font-bold">إجمالي المشتريات</p>
                      <p className="text-base font-black text-slate-900 font-mono mt-1">{summary.totalPurchases.toLocaleString()} د.ع</p>
                    </div>
                    <div className="border border-emerald-300 rounded-xl p-3 text-center bg-emerald-50/50">
                      <p className="text-xs text-emerald-800 font-bold">إجمالي المدفوع نقداً</p>
                      <p className="text-base font-black text-emerald-700 font-mono mt-1">{summary.cashPaid.toLocaleString()} د.ع</p>
                    </div>
                    <div className="border border-indigo-300 rounded-xl p-3 text-center bg-indigo-50/50">
                      <p className="text-xs text-indigo-800 font-bold">فواتير قديمة سابقة</p>
                      <p className="text-base font-black text-indigo-800 font-mono mt-1">{summary.oldInvoicesAmount.toLocaleString()} د.ع</p>
                    </div>
                    <div className="border-2 border-rose-500 rounded-xl p-3 text-center bg-rose-50/70">
                      <p className="text-xs text-rose-800 font-black">الرصيد المتبقي (الدين)</p>
                      <p className="text-lg font-black text-rose-700 font-mono mt-0.5">{summary.totalDebt.toLocaleString()} د.ع</p>
                    </div>
                  </div>

                  {/* جدول الحركات المالية المطبوع */}
                  <table className="w-full border-collapse text-right text-xs">
                    <thead className="bg-slate-100 text-slate-800 border-b-2 border-slate-300">
                      <tr>
                        <th className="p-2.5 font-bold w-8 text-center">#</th>
                        <th className="p-2.5 font-bold">التاريخ</th>
                        <th className="p-2.5 font-bold">رقم المرجع/الفاتورة</th>
                        <th className="p-2.5 font-bold">النوع</th>
                        <th className="p-2.5 font-bold">البيان والأصناف</th>
                        <th className="p-2.5 font-bold text-left">المبلغ</th>
                        <th className="p-2.5 font-bold text-left">المدفوع</th>
                        <th className="p-2.5 font-bold text-left">المتبقي (الدين)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {statementRows.map((row, idx) => (
                        <tr key={row.id} className={row.remainingAmt > 0 ? 'bg-rose-50/20' : ''}>
                          <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2 font-mono text-[11px] text-slate-700">{row.dateFormatted}</td>
                          <td className="p-2 font-bold font-mono text-slate-900">{row.refNumber}</td>
                          <td className="p-2">
                            <span className="font-bold text-[11px] text-slate-700">{row.badgeLabel}</span>
                          </td>
                          <td className="p-2 text-slate-800 max-w-[200px] truncate">{row.itemsDescription}</td>
                          <td className="p-2 font-bold font-mono text-slate-900 text-left">{row.totalAmt.toLocaleString()}</td>
                          <td className="p-2 font-bold font-mono text-emerald-700 text-left">{row.paidAmt.toLocaleString()}</td>
                          <td className="p-2 font-bold font-mono text-left">
                            {row.remainingAmt > 0 ? (
                              <span className="text-rose-700 font-black">{row.remainingAmt.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                      <tr>
                        <td colSpan={5} className="p-2.5 text-right font-black text-slate-900">المجموع العام:</td>
                        <td className="p-2.5 font-black font-mono text-left text-slate-900">{summary.totalPurchases.toLocaleString()} د.ع</td>
                        <td className="p-2.5 font-black font-mono text-left text-emerald-700">{summary.cashPaid.toLocaleString()} د.ع</td>
                        <td className="p-2.5 font-black font-mono text-left text-rose-700">{summary.totalDebt.toLocaleString()} د.ع</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* قسم التواقيع والختم في أسفل صفحة الكشف */}
                <div className="mt-8 pt-4 border-t border-slate-300">
                  <div className="grid grid-cols-2 gap-8 text-center text-xs">
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <p className="font-bold text-slate-800 mb-8">توقيع وختم الحسابات / الإدارة</p>
                      <p className="text-slate-400">................................................</p>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <p className="font-bold text-slate-800 mb-8">توقيع واستلام العميل</p>
                      <p className="text-slate-400">................................................</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 text-center mt-3">
                    وثيقة كشف حساب معتمدة صادرة من نظام Safe Zone المحاسبي - تم الاستخراج بتاريخ {new Date().toLocaleString('ar-IQ')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. الفواتير التفصيلية المرفقة (تبدأ كل فاتورة في صفحة A4 مستقلة) */}
          {(printOption === 'all' || printOption === 'invoices_only') && (
            <div className="print-attached-invoices w-full">
              {customerSales.map((sale) => (
                <div key={sale.id} className="print:break-before-page w-full">
                  <InvoiceDocument 
                    sale={sale} 
                    settings={settings} 
                    isPrintOnly={true}
                  />
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* نوافذ فرعية منبثقة */}
      {viewingSale && (
        <InvoiceReceipt 
          sale={viewingSale} 
          onClose={() => setViewingSale(null)} 
        />
      )}
      
      {payingSale && (
        <CustomerPaymentModal
          sale={payingSale}
          onClose={() => setPayingSale(null)}
        />
      )}

      {showCustomerSuspendedStatement && (
        <SuspendedStatementModal
          initialCustomerName={customerName}
          onClose={() => setShowCustomerSuspendedStatement(false)}
        />
      )}

      {/* قواعد الطباعة الصارمة الموحدة لكشف الحساب والفواتير */}
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > :not(#statement-print-portal) {
            display: none !important;
          }
          #statement-print-portal {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print\\:break-before-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .print\\:break-after-page {
            page-break-after: always !important;
            break-after: page !important;
          }
          .print\\:break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          bdi, [dir="auto"] {
            unicode-bidi: plaintext !important;
          }
        }
      `}</style>
    </div>
  );
}
