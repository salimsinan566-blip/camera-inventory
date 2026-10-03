import React, { useState, useMemo, useEffect } from 'react';
import { reconcileSupplierInvoices } from '../../utils/supplierDebtReconciliation';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

const MONTH_NAMES_AR = [
  'كانون الثاني (يناير)',
  'شباط (فبراير)',
  'آذار (مارس)',
  'نيسان (أبريل)',
  'أيار (مايو)',
  'حزيران (يونيو)',
  'تموز (يوليو)',
  'آب (أغسطس)',
  'أيلول (سبتمبر)',
  'تشرين الأول (أكتوبر)',
  'تشرين الثاني (نوفمبر)',
  'كانون الأول (ديسمبر)',
];

function getMonthKey(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthTitle(monthKey) {
  if (!monthKey || monthKey === 'unknown') return 'فواتير بدون تاريخ';
  const parts = monthKey.split('-');
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const name = MONTH_NAMES_AR[month - 1] || parts[1];
  return `${name} ${year}`;
}

export default function SupplierDetailsDrawer({
  isOpen,
  onClose,
  supplier,
  initialTab = 'debts',
  purchases = [],
  debtPayments = [],
  onSelectInvoice,
  onOpenPayment,
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'debts' | 'payments' | 'all'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sync initial tab when supplier or initialTab changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, supplier]);

  const supplierKey = supplier?.supplierName?.trim().toLowerCase() || '';

  // 1. Raw purchases for this supplier
  const supplierPurchases = useMemo(() => {
    if (!supplierKey) return [];
    return purchases.filter(
      (p) => (p.supplierName || '').trim().toLowerCase() === supplierKey
    );
  }, [purchases, supplierKey]);

  // Reconcile invoices with actual debt record (solves false debt bug)
  const reconciledPurchases = useMemo(() => {
    return reconcileSupplierInvoices(supplierPurchases, supplier?.rawDebtDoc || supplier);
  }, [supplierPurchases, supplier]);

  // 2. Raw payments for this supplier
  const supplierPayments = useMemo(() => {
    if (!supplierKey) return [];
    return debtPayments.filter(
      (p) => (p.supplierName || '').trim().toLowerCase() === supplierKey
    );
  }, [debtPayments, supplierKey]);

  // Quick Date Filter Handlers
  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const handleSetLastMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const handleSetThisYear = () => {
    const now = new Date();
    setStartDate(`${now.getFullYear()}-01-01`);
    setEndDate(`${now.getFullYear()}-12-31`);
  };

  const handleClearDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  // --------------------------------------------------------------------------
  // Tab 1: DEBTS (Truly Unpaid Invoices, computedRemaining > 0) Grouped by Month
  // --------------------------------------------------------------------------
  const unpaidInvoicesGroups = useMemo(() => {
    let list = reconciledPurchases.filter((p) => (Number(p.computedRemaining) || 0) > 0);

    // Date filtering
    if (startDate) {
      list = list.filter((p) => (p.date || p.createdAt || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      list = list.filter((p) => (p.date || p.createdAt || '').slice(0, 10) <= endDate);
    }

    // Grouping by Month
    const groupsMap = new Map();
    list.forEach((inv) => {
      const total = Number(inv.computedTotal || inv.totalAmount) || 0;
      const paid = Number(inv.computedPaid) || 0;
      const rem = Number(inv.computedRemaining) || 0;
      const mKey = getMonthKey(inv.date || inv.createdAt);

      if (!groupsMap.has(mKey)) {
        groupsMap.set(mKey, {
          monthKey: mKey,
          title: getMonthTitle(mKey),
          invoices: [],
          monthTotalDebt: 0,
          monthTotalPaid: 0,
          monthTotalAmount: 0,
        });
      }

      const g = groupsMap.get(mKey);
      g.invoices.push(inv);
      g.monthTotalDebt += rem;
      g.monthTotalPaid += paid;
      g.monthTotalAmount += total;
    });

    // Sort Month Groups
    const groupsArray = Array.from(groupsMap.values());
    groupsArray.sort((a, b) => {
      return sortOrder === 'desc'
        ? b.monthKey.localeCompare(a.monthKey)
        : a.monthKey.localeCompare(b.monthKey);
    });

    // Sort invoices inside each group
    groupsArray.forEach((g) => {
      g.invoices.sort((a, b) => {
        const timeA = new Date(a.date || a.createdAt || 0).getTime();
        const timeB = new Date(b.date || b.createdAt || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    });

    return groupsArray;
  }, [reconciledPurchases, startDate, endDate, sortOrder]);

  // --------------------------------------------------------------------------
  // Tab 2: PAYMENTS (Recorded Payments) Grouped by Month
  // --------------------------------------------------------------------------
  const paymentsGroups = useMemo(() => {
    let list = supplierPayments;

    if (startDate) {
      list = list.filter(
        (pay) => (pay.paymentDate || pay.date || pay.createdAt || '').slice(0, 10) >= startDate
      );
    }
    if (endDate) {
      list = list.filter(
        (pay) => (pay.paymentDate || pay.date || pay.createdAt || '').slice(0, 10) <= endDate
      );
    }

    const groupsMap = new Map();
    list.forEach((pay) => {
      const amt = Number(pay.amount) || 0;
      const mKey = getMonthKey(pay.paymentDate || pay.date || pay.createdAt);

      if (!groupsMap.has(mKey)) {
        groupsMap.set(mKey, {
          monthKey: mKey,
          title: getMonthTitle(mKey),
          payments: [],
          monthTotalPaid: 0,
        });
      }

      const g = groupsMap.get(mKey);
      g.payments.push(pay);
      g.monthTotalPaid += amt;
    });

    const groupsArray = Array.from(groupsMap.values());
    groupsArray.sort((a, b) => {
      return sortOrder === 'desc'
        ? b.monthKey.localeCompare(a.monthKey)
        : a.monthKey.localeCompare(b.monthKey);
    });

    groupsArray.forEach((g) => {
      g.payments.sort((a, b) => {
        const timeA = new Date(a.paymentDate || a.date || 0).getTime();
        const timeB = new Date(b.paymentDate || b.date || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    });

    return groupsArray;
  }, [supplierPayments, startDate, endDate, sortOrder]);

  // --------------------------------------------------------------------------
  // Tab 3: UNIFIED STATEMENT Grouped by Month
  // --------------------------------------------------------------------------
  const unifiedGroups = useMemo(() => {
    const list = [];

    // Reconciled Purchases & Opening debts
    reconciledPurchases.forEach((p) => {
      const isOpening = Boolean(p.isOpeningDebt) || (!p.items || p.items.length === 0);
      const total = Number(p.computedTotal || p.totalAmount) || 0;
      const paid = Number(p.computedPaid) || 0;
      const rem = Number(p.computedRemaining) || 0;

      list.push({
        id: p.id,
        kind: isOpening ? 'opening' : 'purchase',
        date: p.date || p.createdAt || '',
        reference: p.invoiceNumber || '—',
        amount: total,
        paid,
        remaining: rem,
        notes: p.notes || '',
        rawInvoice: p,
      });
    });

    // Payments
    supplierPayments.forEach((pay) => {
      list.push({
        id: pay.id,
        kind: 'payment',
        date: pay.paymentDate || pay.date || pay.createdAt || '',
        reference: pay.invoiceNumber || 'دفعة نقدية',
        amount: Number(pay.amount) || 0,
        paid: Number(pay.amount) || 0,
        remaining: 0,
        notes: pay.notes || '',
        rawPayment: pay,
      });
    });

    // Filter by dates
    let filtered = list;
    if (startDate) {
      filtered = filtered.filter((item) => (item.date || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((item) => (item.date || '').slice(0, 10) <= endDate);
    }

    const groupsMap = new Map();
    filtered.forEach((item) => {
      const mKey = getMonthKey(item.date);
      if (!groupsMap.has(mKey)) {
        groupsMap.set(mKey, {
          monthKey: mKey,
          title: getMonthTitle(mKey),
          operations: [],
          totalPurchases: 0,
          totalPaid: 0,
          totalRemainingDebt: 0,
        });
      }

      const g = groupsMap.get(mKey);
      g.operations.push(item);
      if (item.kind === 'payment') {
        g.totalPaid += item.amount;
      } else {
        g.totalPurchases += item.amount;
        g.totalRemainingDebt += item.remaining;
      }
    });

    const groupsArray = Array.from(groupsMap.values());
    groupsArray.sort((a, b) => {
      return sortOrder === 'desc'
        ? b.monthKey.localeCompare(a.monthKey)
        : a.monthKey.localeCompare(b.monthKey);
    });

    groupsArray.forEach((g) => {
      g.operations.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
    });

    return groupsArray;
  }, [reconciledPurchases, supplierPayments, startDate, endDate, sortOrder]);

  const totalFilteredUnpaidCount = unpaidInvoicesGroups.reduce(
    (sum, g) => sum + g.invoices.length,
    0
  );

  if (!isOpen || !supplier) return null;

  const currentRemainingDebt = Math.max(0, Number(supplier.remainingDebt) || 0);
  const currentTotalPaid = Number(supplier.totalPaid) || 0;
  const currentTotalPurchases = Number(supplier.totalPurchases) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Main Centered Modal Window */}
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl z-10 flex flex-col max-h-[92vh] border border-slate-200 overflow-hidden">
        {/* 1. Modal Top Bar - تصميم رسمي ورصين */}
        <div className="p-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-black text-white shrink-0">
                {supplier.supplierName.charAt(0) || '🏢'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black truncate">
                    {supplier.supplierName}
                  </h2>
                  {supplier.hasOpeningDebt && (
                    <span className="text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded">
                      رصيد سابق
                    </span>
                  )}
                </div>
                {supplier.supplierPhone ? (
                  <span className="text-xs font-mono text-slate-400 block mt-0.5" dir="ltr">
                    {supplier.supplierPhone}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 block mt-0.5">—</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentRemainingDebt > 0 && onOpenPayment && (
                <button
                  type="button"
                  onClick={() => onOpenPayment(supplier)}
                  className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  تسديد دفعة
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
                title="إغلاق"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 2. شريط الأرقام المالية المختصر في الأعلى */}
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">الديون المتبقية</span>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className={`text-base sm:text-lg font-black font-mono ${currentRemainingDebt > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {formatIQD(currentRemainingDebt)}
                </span>
                <span className="text-[10px] text-slate-500 font-bold">د.ع</span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">إجمالي المدفوعات</span>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-base sm:text-lg font-black font-mono text-slate-200">
                  {formatIQD(currentTotalPaid)}
                </span>
                <span className="text-[10px] text-slate-500 font-bold">د.ع</span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">إجمالي المشتريات</span>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-base sm:text-lg font-black font-mono text-slate-200">
                  {formatIQD(currentTotalPurchases)}
                </span>
                <span className="text-[10px] text-slate-500 font-bold">د.ع</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. شريط التبويبات الثلاثة */}
        <div className="flex items-center gap-1 p-1.5 bg-slate-100 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('debts')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'debts'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>فواتير الدين</span>
            <span className="text-[10px] text-slate-400">({totalFilteredUnpaidCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>سجل المدفوعات</span>
            <span className="text-[10px] text-slate-400">({supplierPayments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>كشف الحساب الموحد</span>
          </button>
        </div>

        {/* 4. شريط الفلترة بالتواريخ (مختصر) */}
        <div className="p-2.5 bg-slate-50 border-b border-slate-200 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          {/* أزرار سريعة */}
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 md:pb-0">
            <button
              type="button"
              onClick={handleClearDateFilter}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                !startDate && !endDate
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={handleSetThisMonth}
              className="px-2.5 py-1 rounded-lg font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-xs"
            >
              هذا الشهر
            </button>
            <button
              type="button"
              onClick={handleSetLastMonth}
              className="px-2.5 py-1 rounded-lg font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-xs"
            >
              الشهر السابق
            </button>
            <button
              type="button"
              onClick={handleSetThisYear}
              className="px-2.5 py-1 rounded-lg font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-xs"
            >
              هذه السنة
            </button>
          </div>

          {/* محدد التواريخ وزر الترتيب */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">من:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-1 bg-white border border-slate-200 rounded-md text-xs font-mono font-bold"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">إلى:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-1 bg-white border border-slate-200 rounded-md text-xs font-mono font-bold"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>{sortOrder === 'desc' ? 'الأحدث أولاً' : 'الأقدم أولاً'}</span>
            </button>
          </div>
        </div>

        {/* 5. محتوى الفواتير والعمليات مقسّمة شهرياً */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {/* TAB 1: فواتير الديون مقسّمة حسب الأشهر */}
          {activeTab === 'debts' && (
            <>
              {unpaidInvoicesGroups.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-600">
                    لا توجد فواتير ديون مستحقة على هذا المورد
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {unpaidInvoicesGroups.map((group) => (
                    <div
                      key={group.monthKey}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                    >
                      {/* فاصل الشهر الرسمي */}
                      <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900">{group.title}</span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            ({group.invoices.length} فواتير)
                          </span>
                        </div>

                        <div className="flex items-center gap-1 font-mono font-bold text-rose-700">
                          <span className="text-[10px] text-slate-500">مجموع الدين:</span>
                          <span>{formatIQD(group.monthTotalDebt)} د.ع</span>
                        </div>
                      </div>

                      {/* قائمة فواتير هذا الشهر */}
                      <div className="divide-y divide-slate-100">
                        {group.invoices.map((inv) => {
                          const isOpening =
                            Boolean(inv.isOpeningDebt) || (!inv.items || inv.items.length === 0);

                          return (
                            <div
                              key={inv.id}
                              onClick={() => onSelectInvoice?.(inv)}
                              className="p-3 hover:bg-slate-50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-black text-slate-900">
                                    #{inv.invoiceNumber || '—'}
                                  </span>
                                  {isOpening && (
                                    <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                                      رصيد سابق
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-400 font-mono">
                                    {inv.date
                                      ? new Date(inv.date).toLocaleDateString('ar-IQ')
                                      : '—'}
                                  </span>
                                </div>

                                {!isOpening && inv.items && inv.items.length > 0 && (
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {inv.items
                                      .map((i) => `${i.name} (${i.quantity})`)
                                      .join('، ')}
                                  </p>
                                )}
                              </div>

                              {/* المبالغ المالية وزر التفاصيل */}
                              <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">الإجمالي:</span>
                                  <span className="font-bold font-mono text-slate-700">
                                    {formatIQD(inv.computedTotal || inv.totalAmount)}
                                  </span>
                                </div>

                                <div>
                                  <span className="text-[10px] text-slate-400 block">المسدد:</span>
                                  <span className="font-bold font-mono text-slate-700">
                                    {formatIQD(inv.computedPaid)}
                                  </span>
                                </div>

                                <div>
                                  <span className="text-[10px] text-rose-600 font-bold block">
                                    المتبقي:
                                  </span>
                                  <span className="font-black font-mono text-rose-700">
                                    {formatIQD(inv.computedRemaining)}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectInvoice?.(inv);
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  عرض
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 2: سجل المدفوعات مقسّمة حسب الأشهر */}
          {activeTab === 'payments' && (
            <>
              {paymentsGroups.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-600">لا توجد مدفوعات مسجلة في هذه الفترة</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paymentsGroups.map((group) => (
                    <div
                      key={group.monthKey}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                    >
                      <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900">{group.title}</span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            ({group.payments.length} عمليات)
                          </span>
                        </div>

                        <div className="font-mono font-bold text-slate-900">
                          <span className="text-[10px] text-slate-500 ml-1">مجموع المسدد:</span>
                          <span>{formatIQD(group.monthTotalPaid)} د.ع</span>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {group.payments.map((pay) => (
                          <div
                            key={pay.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-black font-mono text-slate-900">
                                  {formatIQD(pay.amount)} د.ع
                                </span>
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                                  {pay.paymentMethod || 'نقدي'}
                                </span>
                                <span className="text-slate-400 font-mono">
                                  {pay.paymentDate || pay.date
                                    ? new Date(pay.paymentDate || pay.date).toLocaleDateString(
                                        'ar-IQ'
                                      )
                                    : '—'}
                                </span>
                              </div>

                              {pay.notes && (
                                <p className="text-[11px] text-slate-500 mt-1">
                                  {pay.notes}
                                </p>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-400 shrink-0">
                              <span>
                                {pay.paymentSource === 'cash_drawer'
                                  ? 'من القاصة'
                                  : 'حساب الإدارة'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 3: كشف الحساب الموحد مقسّم حسب الأشهر */}
          {activeTab === 'all' && (
            <>
              {unifiedGroups.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-600">لا توجد حركات مسجلة في هذه الفترة</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {unifiedGroups.map((group) => (
                    <div
                      key={group.monthKey}
                      className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                    >
                      <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900">{group.title}</span>
                          <span className="text-[10px] text-slate-500 font-bold">
                            ({group.operations.length} حركات)
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 text-[10px] ml-1">مشتريات:</span>
                            <span className="font-bold font-mono text-slate-900">
                              {formatIQD(group.totalPurchases)} د.ع
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[10px] ml-1">مسدد:</span>
                            <span className="font-bold font-mono text-slate-900">
                              {formatIQD(group.totalPaid)} د.ع
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {group.operations.map((item) => {
                          const isPayment = item.kind === 'payment';
                          const isOpening = item.kind === 'opening';

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                if (item.rawInvoice) onSelectInvoice?.(item.rawInvoice);
                              }}
                              className={`p-3 transition-all ${
                                item.rawInvoice ? 'cursor-pointer hover:bg-slate-50' : ''
                              } flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      isPayment
                                        ? 'bg-slate-200 text-slate-800'
                                        : isOpening
                                        ? 'bg-slate-100 text-slate-700'
                                        : 'bg-slate-100 text-slate-800'
                                    }`}
                                  >
                                    {isPayment
                                      ? 'تسديد'
                                      : isOpening
                                      ? 'رصيد سابق'
                                      : 'شراء'}
                                  </span>

                                  <span className="font-bold font-mono text-slate-700">
                                    #{item.reference}
                                  </span>

                                  <span className="text-slate-400 font-mono">
                                    {item.date
                                      ? new Date(item.date).toLocaleDateString('ar-IQ')
                                      : '—'}
                                  </span>
                                </div>

                                {item.notes && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    {item.notes}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                                <span className="font-black font-mono text-slate-900">
                                  {isPayment ? '-' : '+'} {formatIQD(item.amount)} د.ع
                                </span>

                                {item.rawInvoice && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectInvoice?.(item.rawInvoice);
                                    }}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                                  >
                                    عرض
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 6. أسفل النافذة */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 text-xs">
          <div className="text-slate-500 font-bold">
            {supplier.supplierName}
          </div>

          <div className="flex items-center gap-2">
            {currentRemainingDebt > 0 && onOpenPayment && (
              <button
                type="button"
                onClick={() => onOpenPayment(supplier)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                تسديد دفعة
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
