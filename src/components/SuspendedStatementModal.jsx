import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useDraftSales } from '../hooks/useDraftSales';
import { useCustomers } from '../hooks/useCustomers';
import { useSettings } from '../hooks/useSettings';
import CustomerSelect from './CustomerSelect';
import InvoiceReceipt from './InvoiceReceipt';
import InvoiceDocument from './InvoiceDocument';
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

function formatDateShort(timestamp) {
  if (!timestamp) return '—';
  const date = toDateSafe(timestamp);
  return date ? date.toLocaleDateString('ar-IQ') : '—';
}

function getItemUnitPrice(item) {
  if (!item) return 0;
  return Number(item.unitPrice !== undefined ? item.unitPrice : (item.price !== undefined ? item.price : item.retailPrice)) || 0;
}

function getItemLineTotal(item) {
  if (!item) return 0;
  if (item.lineTotal !== undefined && item.lineTotal !== null && Number(item.lineTotal) > 0) {
    return Number(item.lineTotal);
  }
  const unitPrice = getItemUnitPrice(item);
  const qty = Number(item.quantity) || 1;
  return unitPrice * qty;
}

export default function SuspendedStatementModal({
  initialCustomerName = '',
  onClose,
  onOpenDraft,
}) {
  const { drafts, loading: draftsLoading } = useDraftSales();
  const { customers } = useCustomers();
  const { settings } = useSettings();

  const [customerName, setCustomerName] = useState(initialCustomerName || '');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'suspended' | 'draft'
  const [filterInvoiceType, setFilterInvoiceType] = useState('all'); // 'all' | 'cash' | 'debt'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [viewingDraftReceipt, setViewingDraftReceipt] = useState(null);
  const [detailedDraftModal, setDetailedDraftModal] = useState(null);
  const [printOption, setPrintOption] = useState('all'); // 'all' | 'statement_only' | 'invoices_only'
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  useEffect(() => {
    if (initialCustomerName) {
      setCustomerName(initialCustomerName);
    }
  }, [initialCustomerName]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Find matched customer object if a specific customer is picked
  const matchedCustomer = useMemo(() => {
    if (!customerName.trim()) return null;
    const target = customerName.trim().toLowerCase();
    return (customers || []).find(
      (c) => (c.name || '').trim().toLowerCase() === target
    ) || null;
  }, [customers, customerName]);

  const customerPhone = matchedCustomer?.phone1 || 
    (drafts.find(d => (d.customerName || '').trim().toLowerCase() === customerName.trim().toLowerCase())?.customerPhone) || '';

  // Filter drafts based on customer, status, invoiceType, date range, and search
  const filteredDrafts = useMemo(() => {
    return drafts.filter((draft) => {
      // 1. Customer Filter
      if (customerName.trim()) {
        const target = customerName.trim().toLowerCase();
        const dName = (draft.customerName || '').trim().toLowerCase();
        const matchesName = dName === target;
        const matchesId = matchedCustomer?.id && draft.customerId === matchedCustomer.id;
        if (!matchesName && !matchesId) return false;
      }

      // 2. Status Filter
      if (filterStatus !== 'all') {
        const s = draft.status || 'draft';
        if (s !== filterStatus) return false;
      }

      // 3. Invoice Type Filter
      if (filterInvoiceType !== 'all') {
        const type = draft.invoiceType || 'cash';
        if (type !== filterInvoiceType) return false;
      }

      // 4. Date Filter
      const dDate = toDateSafe(draft.createdAt || draft.updatedAt);
      if (dDate) {
        if (dateFrom && dDate < new Date(dateFrom)) return false;
        if (dateTo && dDate > new Date(dateTo + 'T23:59:59')) return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = (draft.customerName || '').toLowerCase().includes(q);
        const phoneMatch = String(draft.customerPhone || draft.phone || '').includes(q);
        const idMatch = String(draft.id || '').toLowerCase().includes(q);
        const invNumMatch = String(draft.invoiceNumber || '').toLowerCase().includes(q);
        const notesMatch = String(draft.notes || '').toLowerCase().includes(q);
        const itemsMatch = (draft.items || []).some(item => (item.name || '').toLowerCase().includes(q));

        if (!nameMatch && !phoneMatch && !idMatch && !invNumMatch && !notesMatch && !itemsMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const d1 = toDateSafe(a.createdAt || a.updatedAt) || new Date(0);
      const d2 = toDateSafe(b.createdAt || b.updatedAt) || new Date(0);
      return d2 - d1; // الأحدث أولاً
    });
  }, [drafts, customerName, matchedCustomer, filterStatus, filterInvoiceType, dateFrom, dateTo, searchQuery]);

  // Summary statistics
  const summary = useMemo(() => {
    let totalValue = 0;
    let totalItemsCount = 0;
    let totalDebtValue = 0;
    let totalCashValue = 0;
    let suspendedCount = 0;
    let draftCount = 0;

    const uniqueCustomerNames = new Set();

    filteredDrafts.forEach((d) => {
      const val = Number(d.total) || 0;
      totalValue += val;

      const items = d.items || [];
      const qty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
      totalItemsCount += qty;

      if ((d.invoiceType || 'cash') === 'debt') {
        totalDebtValue += val;
      } else {
        totalCashValue += val;
      }

      if (d.status === 'suspended') {
        suspendedCount++;
      } else {
        draftCount++;
      }

      if (d.customerName && d.customerName.trim()) {
        uniqueCustomerNames.add(d.customerName.trim());
      }
    });

    return {
      totalInvoices: filteredDrafts.length,
      totalValue,
      totalItemsCount,
      totalDebtValue,
      totalCashValue,
      suspendedCount,
      draftCount,
      uniqueCustomersCount: uniqueCustomerNames.size,
    };
  }, [filteredDrafts]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredDrafts.length === 0) return;

    const exportRows = filteredDrafts.map((d, index) => {
      const date = toDateSafe(d.createdAt || d.updatedAt);
      const itemsList = (d.items || []).map(i => `${i.name} (x${i.quantity})`).join('، ');
      const isDebt = (d.invoiceType || 'cash') === 'debt';
      const isSuspended = d.status === 'suspended';

      return {
        'ت': index + 1,
        'تاريخ التعليق': date ? date.toLocaleString('ar-IQ') : '—',
        'اسم العميل': d.customerName || 'بدون اسم (عام)',
        'رقم الهاتف': d.customerPhone || d.phone || '—',
        'رقم المسودة': d.invoiceNumber ? `#${d.invoiceNumber}` : `#معلقة-${d.id.slice(-6)}`,
        'نوع الفاتورة': isDebt ? 'دين آجل' : 'نقدي',
        'الحالة': isSuspended ? 'محجوزة' : 'مسودة معلقة',
        'الأصناف المحجوزة': itemsList,
        'عدد القطع': (d.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0),
        'المبلغ الإجمالي (د.ع)': Number(d.total) || 0,
        'الملاحظات': d.notes || '—',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الفواتير المعلقة');

    const fileName = customerName.trim()
      ? `كشف_معلقات_${customerName}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `كشف_الفواتير_المعلقة_الشامل_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  // WhatsApp share
  const handleSendWhatsApp = () => {
    if (!customerPhone) return;
    const rawPhone = String(customerPhone).replace(/[\s\-\+\(\)]/g, '');
    const cleanPhone = rawPhone.startsWith('0') ? '964' + rawPhone.slice(1) : (rawPhone.startsWith('964') ? rawPhone : '964' + rawPhone);

    const lines = [
      `مرحباً ${customerName || 'عميلنا العزيز'}،`,
      `نود إعلامكم بوجود فواتير ومواد معلقة / محجوزة لكم لدى ${settings?.storeName || 'Safe Zone'} كالتالي:`,
      `📊 عدد الفواتير المعلقة: ${summary.totalInvoices}`,
      `📦 إجمالي القطع المحجوزة: ${summary.totalItemsCount} قطعة`,
      `💰 إجمالي القيمة: ${summary.totalValue.toLocaleString()} د.ع`,
      '',
      'يرجى التواصل معنا لتأكيد استلام الطلب أو إتمام الفاتورة.',
      'شكراً لثقتكم بنا.'
    ];

    const msg = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  // Print handler
  const handlePrint = (mode = printOption) => {
    setShowPrintMenu(false);
    setPrintOption(mode);
    const originalTitle = document.title;
    const typeLabel = mode === 'statement_only' 
      ? 'كشف_الفواتير_المعلقة' 
      : mode === 'invoices_only' 
      ? 'فواتير_معلقة_تفصيلية' 
      : 'كشف_معلقات_وفواتير';
    
    document.title = `${typeLabel}_${customerName || 'شامل'}`;

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }, 150);
  };

  const scrollToDraft = (draftId) => {
    const el = document.getElementById(`suspended-card-${draftId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-indigo-500', 'transition-all');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-indigo-500');
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:p-0 print:bg-white" dir="rtl">
      {/* Container On Screen */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden print:hidden border border-slate-200">
        
        {/* Modal Top Header */}
        <div className="flex flex-wrap items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xl text-indigo-300 shadow-inner">
              📑
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <span>كشف حساب الفواتير المعلقة والمحجوزة</span>
                {customerName.trim() ? (
                  <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2.5 py-1 rounded-full border border-indigo-400/30">
                    العميل: {customerName}
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-400/30">
                    كشف عام شامل لكافة العملاء
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                جرد ومطابقة المواد المحجوزة، المبالغ المعلقة، وتفاصيل الفواتير غير المكتملة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 sm:mt-0 relative">
            {/* Excel Export Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredDrafts.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="تصدير بيانات الكشف إلى ملف Excel"
            >
              <span>📊</span>
              <span>تصدير Excel</span>
            </button>

            {/* Print Options Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => handlePrint('all')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="طباعة كشف الحساب والفواتير التفصيلية"
              >
                <span>🖨️</span>
                <span>طباعة الكشف</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                className="px-2 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-l-xl text-xs font-bold border-r border-indigo-500 transition-all cursor-pointer"
                title="خيارات إضافية للطباعة"
              >
                ▼
              </button>

              {showPrintMenu && (
                <div className="absolute left-0 mt-2 w-56 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-xs font-bold animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => handlePrint('all')}
                    className="w-full text-right px-4 py-2.5 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                  >
                    <span>📑</span>
                    <span>كشف الحساب + الفواتير التفصيلية</span>
                  </button>
                  <button
                    onClick={() => handlePrint('statement_only')}
                    className="w-full text-right px-4 py-2.5 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                  >
                    <span>📋</span>
                    <span>كشف الحساب التلخيصي فقط</span>
                  </button>
                  <button
                    onClick={() => handlePrint('invoices_only')}
                    className="w-full text-right px-4 py-2.5 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
                  >
                    <span>🧾</span>
                    <span>الفواتير التفصيلية المرفقة فقط</span>
                  </button>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="إغلاق (Esc)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters & Control Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
            {/* Customer Selector */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">تصفية حسب العميل</label>
                {customerName && (
                  <button
                    type="button"
                    onClick={() => setCustomerName('')}
                    className="text-[11px] text-indigo-600 hover:underline font-bold"
                  >
                    عرض كافة العملاء
                  </button>
                )}
              </div>
              <CustomerSelect
                value={customerName}
                onChange={setCustomerName}
                placeholder="اختر عميلاً أو اتركه فارغاً لكافة العملاء..."
                compact={true}
                label=""
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حالة الفاتورة</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">كافة الحالات (معلقة ومحجوزة)</option>
                <option value="suspended">محجوزة بالكامل (Suspended)</option>
                <option value="draft">مسودة عادية (Draft)</option>
              </select>
            </div>

            {/* Invoice Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع العملية</label>
              <select
                value={filterInvoiceType}
                onChange={(e) => setFilterInvoiceType(e.target.value)}
                className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">الكل (نقدي وديون)</option>
                <option value="cash">نقدي فقط</option>
                <option value="debt">ديون فقط</option>
              </select>
            </div>

            {/* Quick Search */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">بحث سريع</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="اسم، هاتف، صنف..."
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/60 text-xs">
            <span className="text-slate-500 font-bold">الفترة الزمنية:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">من:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">إلى:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs outline-none font-mono"
              />
            </div>
            {(dateFrom || dateTo || searchQuery || filterStatus !== 'all' || filterInvoiceType !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSearchQuery('');
                  setFilterStatus('all');
                  setFilterInvoiceType('all');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold mr-auto cursor-pointer"
              >
                إعادة ضبط الفلاتر ↺
              </button>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6 bg-slate-100/50">
          
          {/* Customer Highlight Card (if single customer selected) */}
          {customerName.trim() && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-indigo-100 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl text-indigo-600">
                  👤
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>{customerName}</span>
                    {customerPhone && (
                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        📞 {customerPhone}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {matchedCustomer?.address ? `العنوان: ${matchedCustomer.address}` : 'عميل مسجل في النظام'}
                  </p>
                </div>
              </div>

              {customerPhone && (
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="إرسال ملخص المعلقات للعميل عبر واتساب"
                >
                  <span>💬</span>
                  <span>إرسال ملخص المعلقات واتساب</span>
                </button>
              )}
            </div>
          )}

          {/* 4 Summary Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Count */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 text-center">
              <p className="text-2xl font-black text-slate-900 font-mono">
                {summary.totalInvoices}
              </p>
              <p className="text-xs text-slate-500 font-bold mt-1">عدد الفواتير المعلقة</p>
              <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-slate-500">
                <span className="text-indigo-600 font-bold">{summary.suspendedCount} محجوزة</span>
                <span>•</span>
                <span className="text-amber-600 font-bold">{summary.draftCount} مسودة</span>
              </div>
            </div>

            {/* Card 2: Total Value */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-indigo-200 text-center bg-gradient-to-b from-white to-indigo-50/20">
              <p className="text-2xl font-black text-indigo-700 font-mono">
                {summary.totalValue.toLocaleString()} <span className="text-xs font-normal">د.ع</span>
              </p>
              <p className="text-xs text-indigo-900 font-bold mt-1">إجمالي المبالغ المعلقة</p>
              <div className="mt-2 text-[10px] text-indigo-600 font-bold">
                {summary.uniqueCustomersCount} عملاء لديهم معلقات
              </div>
            </div>

            {/* Card 3: Items Quantity */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 text-center">
              <p className="text-2xl font-black text-amber-600 font-mono">
                {summary.totalItemsCount} <span className="text-xs font-normal">قطعة</span>
              </p>
              <p className="text-xs text-slate-500 font-bold mt-1">المواد والقطع المحجوزة</p>
              <div className="mt-2 text-[10px] text-slate-400">
                محجوزة بالمخزن ومخصومة من المتاح
              </div>
            </div>

            {/* Card 4: Debt Value */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-rose-200 text-center bg-gradient-to-b from-white to-rose-50/20">
              <p className="text-2xl font-black text-rose-600 font-mono">
                {summary.totalDebtValue.toLocaleString()} <span className="text-xs font-normal">د.ع</span>
              </p>
              <p className="text-xs text-rose-900 font-bold mt-1">المعلقات الآجلة (بالدين)</p>
              <div className="mt-2 text-[10px] text-rose-600 font-bold">
                {summary.totalCashValue.toLocaleString()} د.ع معلقات نقدية
              </div>
            </div>
          </div>

          {/* Table of Suspended Invoices */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 font-bold text-slate-900 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span>📋 جدول الفواتير المعلقة والمحجوزة</span>
                <span className="text-xs px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-extrabold">
                  {filteredDrafts.length} فاتورة
                </span>
              </div>
              <span className="text-xs text-slate-500">
                💡 يمكنك معاينة تفاصيل المواد، أو طباعة الوصل، أو فتح الفاتورة في الكاشير
              </span>
            </div>

            {draftsLoading ? (
              <div className="p-12 text-center text-slate-400">جارٍ تحميل الفواتير المعلقة...</div>
            ) : filteredDrafts.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm font-bold">لا توجد أي فواتير معلقة تطابق معايير البحث والفلترة</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[42vh] overflow-y-auto">
                <table className="w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 text-xs sticky top-0 z-10 shadow-2xs">
                    <tr>
                      <th className="p-3 text-center w-10 font-black">#</th>
                      <th className="p-3">تاريخ ووقت التعليق</th>
                      <th className="p-3">اسم العميل</th>
                      <th className="p-3">رقم المرجع</th>
                      <th className="p-3">الحالة والنوع</th>
                      <th className="p-3">الأصناف المحجوزة</th>
                      <th className="p-3 text-left">إجمالي القيمة</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDrafts.map((draft, idx) => {
                      const isSuspended = draft.status === 'suspended';
                      const isDebt = (draft.invoiceType || 'cash') === 'debt';
                      const totalAmt = Number(draft.total) || 0;
                      const items = draft.items || [];
                      const itemsDesc = items.map(i => `${i.name} (x${i.quantity || 1})`).slice(0, 3).join('، ') + (items.length > 3 ? '...' : '');
                      const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);

                      return (
                        <tr 
                          key={draft.id} 
                          className={`hover:bg-slate-50 transition-colors ${isSuspended ? 'bg-indigo-50/20' : ''}`}
                        >
                          <td className="p-3 text-center font-mono font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {formatDateSafe(draft.createdAt || draft.updatedAt)}
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            {draft.customerName || 'عميل عام'}
                            {draft.customerPhone && (
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {draft.customerPhone}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold text-indigo-700">
                            {draft.invoiceNumber ? `#${draft.invoiceNumber}` : `#معلقة-${draft.id.slice(-6)}`}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isSuspended 
                                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}>
                                {isSuspended ? '🔒 محجوزة بالكامل' : '⏳ مسودة معلقة'}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isDebt 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isDebt ? '💳 بيع بالدين' : '💵 نقدي'}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 max-w-xs truncate text-slate-700" title={itemsDesc}>
                            <span className="font-bold text-slate-900 ml-1">({totalQty} قطعة):</span>
                            <span>{itemsDesc || 'لا توجد أصناف'}</span>
                          </td>
                          <td className="p-3 text-left font-black font-mono text-slate-900 text-sm">
                            {totalAmt.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">د.ع</span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* View items popup */}
                              <button
                                type="button"
                                onClick={() => setDetailedDraftModal(draft)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                title="استعراض المواد والأسعار بالتفصيل"
                              >
                                <span>🔍</span>
                                <span>المواد</span>
                              </button>

                              {/* Print Thermal Receipt */}
                              <button
                                type="button"
                                onClick={() => setViewingDraftReceipt({
                                  ...draft,
                                  invoiceNumber: draft.invoiceNumber || `معلقة-${draft.id.slice(-6)}`,
                                  isDraft: true,
                                })}
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="طباعة وصل المسودة"
                              >
                                🖨️
                              </button>

                              {/* Resume in POS */}
                              {onOpenDraft && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenDraft(draft);
                                  }}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="فتح الفاتورة في نقطة البيع لمتابعة الدفع"
                                >
                                  <span>🛒</span>
                                  <span>متابعة البيع</span>
                                </button>
                              )}

                              {/* Scroll down button */}
                              <button
                                type="button"
                                onClick={() => scrollToDraft(draft.id)}
                                className="text-indigo-600 hover:text-indigo-800 text-xs font-bold underline cursor-pointer"
                                title="الانتقال للفاتورة التفصيلية بالأسفل"
                              >
                                ↓
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300 text-xs text-slate-900">
                    <tr>
                      <td colSpan={5} className="p-3 text-right">
                        المجموع الإجمالي للفواتير المعلقة المعروضة:
                      </td>
                      <td className="p-3 text-amber-700 font-mono">
                        {summary.totalItemsCount} قطعة محجوزة
                      </td>
                      <td className="p-3 text-left font-mono text-sm text-indigo-700">
                        {summary.totalValue.toLocaleString()} د.ع
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Detailed Invoices Cards Section (صفحة تحت صفحة) */}
          <div className="pt-4 border-t-2 border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>📑 تفاصيل الفواتير المعلقة صفحة تحت صفحة</span>
                  <span className="text-xs px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-extrabold">
                    {filteredDrafts.length} فاتورة
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  معروضة بقوائم موادها التفصيلية وأسعارها وكمياتها
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {filteredDrafts.map((draft, index) => {
                const isSuspended = draft.status === 'suspended';
                const isDebt = (draft.invoiceType || 'cash') === 'debt';
                const items = draft.items || [];
                const totalAmt = Number(draft.total) || 0;

                return (
                  <div
                    key={draft.id}
                    id={`suspended-card-${draft.id}`}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition-all"
                  >
                    {/* Draft Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center font-mono">
                          #{index + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">
                              فاتورة معلقة: {draft.invoiceNumber ? `#${draft.invoiceNumber}` : `#معلقة-${draft.id.slice(-6)}`}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isSuspended ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isSuspended ? '🔒 محجوزة' : '⏳ مسودة'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isDebt ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isDebt ? 'دين' : 'نقدي'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            العميل: <strong className="text-slate-800">{draft.customerName || 'عميل عام'}</strong>
                            {draft.customerPhone && <span className="mr-2 font-mono">({draft.customerPhone})</span>}
                            <span className="mr-3 font-mono text-slate-400">
                              تاريخ الإدخال: {formatDateSafe(draft.createdAt || draft.updatedAt)}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onOpenDraft && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenDraft(draft);
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <span>🛒</span>
                            <span>فتح في نقطة البيع</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewingDraftReceipt({
                            ...draft,
                            invoiceNumber: draft.invoiceNumber || `معلقة-${draft.id.slice(-6)}`,
                            isDraft: true,
                          })}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
                        >
                          <span>🖨️</span>
                          <span>طباعة إيصال</span>
                        </button>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-100 mb-3">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 text-center w-8">#</th>
                            <th className="p-2.5">اسم المادة / الصنف</th>
                            <th className="p-2.5 text-center w-16">الكمية</th>
                            <th className="p-2.5 text-left w-24">سعر المفرد</th>
                            <th className="p-2.5 text-left w-28">المجموع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item, itemIdx) => (
                            <tr key={itemIdx} className="hover:bg-slate-50/50">
                              <td className="p-2.5 text-center text-slate-400 font-mono">{itemIdx + 1}</td>
                              <td className="p-2.5 font-bold text-slate-800">
                                {item.name}
                                {item.notes && <span className="block text-[10px] text-slate-400 font-normal">{item.notes}</span>}
                              </td>
                              <td className="p-2.5 text-center font-bold font-mono text-slate-900 bg-slate-50/40">
                                {item.quantity || 1}
                              </td>
                              <td className="p-2.5 text-left font-mono text-slate-700">
                                {item.originalPrice && Number(item.originalPrice) > getItemUnitPrice(item) ? (
                                  <div className="flex flex-col items-start">
                                    <span className="text-[10px] text-slate-400 line-through leading-none">
                                      {Number(item.originalPrice).toLocaleString()}
                                    </span>
                                    <span className="text-rose-600 font-bold leading-none mt-0.5">
                                      {getItemUnitPrice(item).toLocaleString()} د.ع
                                    </span>
                                  </div>
                                ) : (
                                  <span>{getItemUnitPrice(item).toLocaleString()} د.ع</span>
                                )}
                              </td>
                              <td className="p-2.5 text-left font-bold font-mono text-slate-900">
                                {getItemLineTotal(item).toLocaleString()} د.ع
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                          <tr>
                            <td colSpan={3} className="p-2.5 text-right font-black">
                              المجموع الكلي للفاتورة:
                            </td>
                            <td colSpan={2} className="p-2.5 text-left font-black font-mono text-sm text-indigo-700">
                              {totalAmt.toLocaleString()} د.ع
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {draft.notes && (
                      <p className="text-xs text-slate-600 bg-amber-50/60 border border-amber-200/60 rounded-xl p-2.5 font-medium">
                        📝 <strong>ملاحظات:</strong> {draft.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Quick Item Breakdown */}
      {detailedDraftModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h4 className="font-black text-slate-900 text-base">
                  تفاصيل مواد الفاتورة: {detailedDraftModal.invoiceNumber ? `#${detailedDraftModal.invoiceNumber}` : `#معلقة-${detailedDraftModal.id.slice(-6)}`}
                </h4>
                <p className="text-xs text-slate-500">
                  العميل: {detailedDraftModal.customerName || 'عام'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailedDraftModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 mb-4">
              {(detailedDraftModal.items || []).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{item.name}</p>
                    <p className="text-slate-500 text-[10px] font-mono">
                      السعر: {getItemUnitPrice(item).toLocaleString()} د.ع × {item.quantity || 1}
                    </p>
                  </div>
                  <p className="font-black font-mono text-slate-900">
                    {getItemLineTotal(item).toLocaleString()} د.ع
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-500 font-bold">المجموع: </span>
                <span className="text-base font-black font-mono text-indigo-700">
                  {Number(detailedDraftModal.total || 0).toLocaleString()} د.ع
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailedDraftModal(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Thermal / Individual Receipt */}
      {viewingDraftReceipt && (
        <InvoiceReceipt
          sale={viewingDraftReceipt}
          onClose={() => setViewingDraftReceipt(null)}
        />
      )}

      {/* PRINT PORTAL (Strictly for Browser Printing) */}
      {createPortal(
        <div id="suspended-statement-print-portal" className="hidden print:block w-full p-6 bg-white text-slate-900 font-sans" dir="rtl">
          {(printOption === 'all' || printOption === 'statement_only') && (
            <div className="print-statement-summary w-full min-h-[280mm] flex flex-col justify-between mb-8 print:break-after-page">
              <div>
                {/* Official Store Header */}
                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-4">
                  <div className="text-right">
                    <h1 className="text-xl font-black text-slate-900 mb-1">
                      {settings?.storeName || 'Safe Zone لأنظمة المراقبة الذكية'}
                    </h1>
                    {settings?.tagline && (
                      <p className="text-xs text-slate-600 font-medium mb-1">
                        {settings.tagline}
                      </p>
                    )}
                    {settings?.address && (
                      <p className="text-xs text-slate-500 font-medium">
                        📍 {settings.address}
                      </p>
                    )}
                    {settings?.phone && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        📞 {settings.phone}
                      </p>
                    )}
                  </div>

                  <div className="h-20 flex items-center justify-start relative">
                    <img
                      src={settings?.logoUrl || defaultLogo}
                      alt="Logo"
                      className="h-20 w-auto object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                </div>

                {/* Statement Title & Meta Box */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-xl p-3.5 mb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      كشف حساب الفواتير المعلقة والمحجوزة
                    </h2>
                    <p className="text-xs text-slate-700 mt-1">
                      الجهة / العميل: <strong className="text-slate-900 text-sm font-extrabold">{customerName || 'كافة العملاء (كشف عام شامل)'}</strong>
                      {customerPhone && <span className="mr-3 text-slate-600">الهاتف: <strong className="font-mono">{customerPhone}</strong></span>}
                    </p>
                  </div>
                  <div className="text-left text-xs text-slate-600 font-medium">
                    <p>تاريخ الكشف: <strong className="text-slate-900">{new Date().toLocaleDateString('ar-IQ')}</strong></p>
                    <p className="mt-0.5">عدد الفواتير: <strong className="text-slate-900 font-mono">{summary.totalInvoices}</strong> معلقة</p>
                  </div>
                </div>

                {/* 4 Summary Stat Boxes in Print */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="border border-slate-300 rounded-xl p-3 text-center bg-slate-50">
                    <p className="text-xs text-slate-600 font-bold">عدد الفواتير المعلقة</p>
                    <p className="text-base font-black text-slate-900 font-mono mt-1">{summary.totalInvoices}</p>
                  </div>
                  <div className="border border-indigo-300 rounded-xl p-3 text-center bg-indigo-50/50">
                    <p className="text-xs text-indigo-900 font-bold">المواد والقطع المحجوزة</p>
                    <p className="text-base font-black text-indigo-800 font-mono mt-1">{summary.totalItemsCount} قطعة</p>
                  </div>
                  <div className="border border-rose-300 rounded-xl p-3 text-center bg-rose-50/50">
                    <p className="text-xs text-rose-900 font-bold">المعلقات الآجلة (بالدين)</p>
                    <p className="text-base font-black text-rose-700 font-mono mt-1">{summary.totalDebtValue.toLocaleString()} د.ع</p>
                  </div>
                  <div className="border-2 border-indigo-600 rounded-xl p-3 text-center bg-indigo-50/70">
                    <p className="text-xs text-indigo-950 font-black">إجمالي المبالغ المعلقة</p>
                    <p className="text-lg font-black text-indigo-900 font-mono mt-0.5">{summary.totalValue.toLocaleString()} د.ع</p>
                  </div>
                </div>

                {/* Main Table in Print */}
                <table className="w-full border-collapse text-right text-xs">
                  <thead className="bg-slate-100 text-slate-800 border-b-2 border-slate-300">
                    <tr>
                      <th className="p-2 font-bold w-8 text-center">#</th>
                      <th className="p-2 font-bold">التاريخ</th>
                      <th className="p-2 font-bold">العميل</th>
                      <th className="p-2 font-bold">رقم المرجع</th>
                      <th className="p-2 font-bold">الحالة والنوع</th>
                      <th className="p-2 font-bold">الأصناف المحجوزة</th>
                      <th className="p-2 font-bold text-center">الكمية</th>
                      <th className="p-2 font-bold text-left">المبلغ (د.ع)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredDrafts.map((draft, idx) => {
                      const items = draft.items || [];
                      const itemsDesc = items.map(i => `${i.name} (x${i.quantity || 1})`).slice(0, 4).join('، ');
                      const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
                      const isDebt = (draft.invoiceType || 'cash') === 'debt';
                      const isSuspended = draft.status === 'suspended';

                      return (
                        <tr key={draft.id}>
                          <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2 font-mono text-[11px] text-slate-700">
                            {formatDateShort(draft.createdAt || draft.updatedAt)}
                          </td>
                          <td className="p-2 font-bold text-slate-900">{draft.customerName || 'عميل عام'}</td>
                          <td className="p-2 font-bold font-mono text-indigo-900">
                            {draft.invoiceNumber ? `#${draft.invoiceNumber}` : `#معلقة-${draft.id.slice(-6)}`}
                          </td>
                          <td className="p-2">
                            <span className="font-bold text-[10px]">
                              {isSuspended ? 'محجوزة' : 'مسودة'} / {isDebt ? 'دين' : 'نقدي'}
                            </span>
                          </td>
                          <td className="p-2 text-slate-800 max-w-[220px] truncate">{itemsDesc}</td>
                          <td className="p-2 text-center font-bold font-mono">{totalQty}</td>
                          <td className="p-2 font-black font-mono text-left text-slate-900">
                            {Number(draft.total || 0).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                    <tr>
                      <td colSpan={6} className="p-2.5 text-right font-black text-slate-900">المجموع الكلي:</td>
                      <td className="p-2.5 font-black font-mono text-center text-slate-900">{summary.totalItemsCount}</td>
                      <td className="p-2.5 font-black font-mono text-left text-indigo-900">{summary.totalValue.toLocaleString()} د.ع</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Print Signatures Block */}
              <div className="mt-8 pt-4 border-t border-slate-300">
                <div className="grid grid-cols-2 gap-8 text-center text-xs">
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <p className="font-bold text-slate-800 mb-8">توقيع وختم الإدارة / الحسابات</p>
                    <p className="text-slate-400">................................................</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <p className="font-bold text-slate-800 mb-8">توقيع واستلام العميل / المندوب</p>
                    <p className="text-slate-400">................................................</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-3">
                  وثيقة كشف حساب فواتير معلقة معتمدة صادرة من نظام Safe Zone المحاسبي - تم الاستخراج بتاريخ {new Date().toLocaleString('ar-IQ')}
                </p>
              </div>
            </div>
          )}

          {/* Attached Detailed Invoices in Print (Each starts on fresh A4 page) */}
          {(printOption === 'all' || printOption === 'invoices_only') && (
            <div className="print-attached-invoices w-full">
              {filteredDrafts.map((draft) => (
                <div key={draft.id} className="print:break-before-page w-full">
                  <InvoiceDocument
                    sale={{
                      ...draft,
                      invoiceNumber: draft.invoiceNumber || `معلقة-${draft.id.slice(-6)}`,
                    }}
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

      {/* Strict Print CSS for Suspended Statement */}
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > :not(#suspended-statement-print-portal) {
            display: none !important;
          }
          #suspended-statement-print-portal {
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
        }
      `}</style>
    </div>
  );
}
