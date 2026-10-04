import React, { useState, useMemo, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../contexts/UIContext';
import defaultLogo from '../assets/logo.png';
import html2pdf from 'html2pdf.js';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val?.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateArabic(date) {
  if (!date) return '—';
  const d = toDateSafe(date);
  if (!d) return '—';
  return d.toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatDateTimeArabic(date) {
  if (!date) return '—';
  const d = toDateSafe(date);
  if (!d) return '—';
  return `${d.toLocaleDateString('ar-IQ', { year: 'numeric', month: '2-digit', day: '2-digit' })} • ${d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
}

function getCategoryIcon(category = '') {
  const cat = String(category || '').trim().toLowerCase();
  if (cat.includes('طعام') || cat.includes('غداء') || cat.includes('أكل') || cat.includes('وجبة')) return '🍲';
  if (cat.includes('نقل') || cat.includes('شحن') || cat.includes('توصيل') || cat.includes('مواصلات') || cat.includes('بنزين')) return '🚗';
  if (cat.includes('مشروب') || cat.includes('ماء') || cat.includes('شاي') || cat.includes('قهوة') || cat.includes('ضيافة')) return '☕';
  if (cat.includes('نظاف') || cat.includes('كلينس') || cat.includes('مستلزمات')) return '🧻';
  if (cat.includes('إيجار') || cat.includes('عقار')) return '🏢';
  if (cat.includes('مولد') || cat.includes('كهربا')) return '⚡';
  if (cat.includes('نت') || cat.includes('إنترنت') || cat.includes('اتصالات')) return '🌐';
  if (cat.includes('صيان') || cat.includes('ديكور') || cat.includes('تجهيز')) return '🛠️';
  if (cat.includes('بلدي') || cat.includes('رسم') || cat.includes('ضريب') || cat.includes('حكوم')) return '🏛️';
  if (cat.includes('موقع') || cat.includes('شراء موقعي')) return '🛒';
  return '📦';
}

export default function ComprehensiveFinancialReport({
  sales = [],
  products = [],
  expenses = [],
  onViewSale
}) {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { toast } = useUI();

  // Period filtering state
  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // UI Interactive view states
  const [activeSection, setActiveSection] = useState('all'); // 'all' | 'sales' | 'expenses' | 'debts'
  const [salesSearch, setSalesSearch] = useState('');
  const [salesTypeFilter, setSalesTypeFilter] = useState('all'); // 'all' | 'cash' | 'mastercard' | 'debt'
  const [expensesCategoryFilter, setExpensesCategoryFilter] = useState('all');
  const [expensesSearch, setExpensesSearch] = useState('');

  // Print & PDF modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const printDocumentRef = useRef(null);

  // Products map for wholesale price fallback
  const productsMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
    });
    return map;
  }, [products]);

  // Determine current active date range
  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end, label: `اليوم (${now.toLocaleDateString('ar-IQ')})` };
    }
    if (period === 'week') {
      const start = new Date();
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return {
        start,
        end,
        label: `آخر 7 أيام (من ${start.toLocaleDateString('ar-IQ')} إلى ${end.toLocaleDateString('ar-IQ')})`
      };
    }
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthName = start.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' });
      return { start, end, label: `شهر ${monthName}` };
    }
    if (period === 'custom') {
      const start = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      const end = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
      const label = customFrom && customTo
        ? `من ${customFrom} إلى ${customTo}`
        : customFrom
        ? `من ${customFrom} حتى الآن`
        : customTo
        ? `حتى تاريخ ${customTo}`
        : 'كافة الفترات';
      return { start, end, label };
    }
    return { start: null, end: null, label: 'كافة الفترات' };
  }, [period, customFrom, customTo]);

  // Helper date checker
  const isDateInRange = (dateVal) => {
    if (!dateVal) return false;
    const d = toDateSafe(dateVal);
    if (!d) return false;
    if (dateRange.start && d < dateRange.start) return false;
    if (dateRange.end && d > dateRange.end) return false;
    return true;
  };

  // 1. Process Sales of the selected period
  const processedSales = useMemo(() => {
    return sales
      .filter((s) => s.status === 'confirmed' && !s.isOffer && isDateInRange(s.createdAt))
      .map((s) => {
        const date = toDateSafe(s.createdAt);
        const total = Number(s.total || 0);

        // Calculate Cost of Goods Sold (COGS)
        let cost = 0;
        (s.items || []).forEach((item) => {
          const prod = productsMap.get(item.productId) || productsMap.get(item.sku);
          const wholesale = Number(item.wholesalePrice) || Number(prod?.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 0;
          cost += wholesale * qty;
        });

        const profit = total - cost;
        const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0.0';

        // Payment distribution for this invoice
        const type = s.invoiceType || 'cash';
        let cashAmount = 0;
        let mastercardAmount = 0;
        let remainingDebtAmount = 0;

        if (type === 'cash' || (type !== 'debt' && s.paymentMethod !== 'mastercard')) {
          cashAmount = total;
        } else if (type === 'mastercard' || s.paymentMethod === 'mastercard') {
          mastercardAmount = total;
        } else if (type === 'debt') {
          // If invoice is debt, examine any payments recorded
          if (Array.isArray(s.payments) && s.payments.length > 0) {
            let pCash = 0;
            let pCard = 0;
            s.payments.forEach((p) => {
              const isCard =
                p.paymentMethod === 'mastercard' ||
                String(p.paymentMethod || '').includes('ماستر') ||
                String(p.paymentMethod || '').includes('مصرف');
              const amt = Number(p.amount || 0);
              if (isCard) pCard += amt;
              else pCash += amt;
            });
            cashAmount = pCash;
            mastercardAmount = pCard;
            remainingDebtAmount = Math.max(0, total - (pCash + pCard));
          } else {
            const paid = Number(s.paidAmount || 0);
            const isCard =
              s.paymentMethod === 'mastercard' ||
              String(s.paymentMethod || '').includes('ماستر');
            if (isCard) mastercardAmount = paid;
            else cashAmount = paid;
            remainingDebtAmount =
              s.remainingDebt !== undefined
                ? Number(s.remainingDebt)
                : Math.max(0, total - paid);
          }
        }

        return {
          ...s,
          dateObj: date,
          dateFormatted: formatDateTimeArabic(date),
          totalRevenue: total,
          totalCost: cost,
          grossProfit: profit,
          profitMargin: Number(margin),
          cashReceived: cashAmount,
          mastercardReceived: mastercardAmount,
          remainingDebt: remainingDebtAmount
        };
      })
      .sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));
  }, [sales, dateRange, productsMap]);

  // 2. Process Customer Debt Repayments Collected within the period
  const debtRepaymentsInPeriod = useMemo(() => {
    let cashSum = 0;
    let cardSum = 0;
    const items = [];

    sales.forEach((s) => {
      if (s.status !== 'confirmed') return;
      const payments = Array.isArray(s.payments) ? s.payments : [];
      payments.forEach((p) => {
        const pDate = toDateSafe(p.date || p.createdAt);
        if (pDate && isDateInRange(pDate)) {
          const amt = Number(p.amount || 0);
          const isCard =
            p.paymentMethod === 'mastercard' ||
            String(p.paymentMethod || '').includes('ماستر') ||
            String(p.paymentMethod || '').includes('مصرف');

          if (isCard) cardSum += amt;
          else cashSum += amt;

          items.push({
            paymentId: p.id || `${s.id}-${Math.random()}`,
            saleId: s.id,
            invoiceNumber: s.invoiceNumber,
            customerName: s.customerName || 'زبون عام',
            amount: amt,
            paymentMethod: isCard ? 'ماستر كارد' : 'نقدي',
            isCard,
            date: pDate,
            dateFormatted: formatDateTimeArabic(pDate),
            notes: p.notes || '',
            receivedBy: p.receivedBy || 'المسؤول'
          });
        }
      });
    });

    return {
      cashCollected: cashSum,
      cardCollected: cardSum,
      totalCollected: cashSum + cardSum,
      items: items.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
    };
  }, [sales, dateRange]);

  // 3. Process Expenses of the selected period & group by category
  const processedExpenses = useMemo(() => {
    const list = expenses
      .filter((e) => isDateInRange(e.date || e.createdAt))
      .map((e) => {
        const d = toDateSafe(e.date || e.createdAt);
        const amount = Number(e.amount || 0);
        const category = (e.category || 'نثريات عامة').trim();
        return {
          ...e,
          dateObj: d,
          dateFormatted: formatDateArabic(d),
          numAmount: amount,
          cleanCategory: category
        };
      })
      .sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));

    // Grouping by category
    const categoryMap = new Map();
    list.forEach((exp) => {
      const cat = exp.cleanCategory;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, {
          categoryName: cat,
          icon: getCategoryIcon(cat),
          total: 0,
          items: []
        });
      }
      const group = categoryMap.get(cat);
      group.total += exp.numAmount;
      group.items.push(exp);
    });

    const grouped = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
    const totalExpenses = list.reduce((sum, e) => sum + e.numAmount, 0);

    // Split by payment source
    const fromDrawer = list
      .filter((e) => e.paymentSource === 'cash_drawer' || !e.paymentSource)
      .reduce((sum, e) => sum + e.numAmount, 0);

    const fromManagement = list
      .filter((e) => e.paymentSource === 'management' || e.paymentSource === 'mastercard')
      .reduce((sum, e) => sum + e.numAmount, 0);

    return {
      all: list,
      grouped,
      totalExpenses,
      fromDrawer,
      fromManagement
    };
  }, [expenses, dateRange]);

  // 4. Executive Totals & Liquidity Metrics
  const summaryMetrics = useMemo(() => {
    const totalRevenue = processedSales.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalCost = processedSales.reduce((sum, s) => sum + s.totalCost, 0);
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    const totalExpenses = processedExpenses.totalExpenses;
    const netProfit = grossProfit - totalExpenses;
    const netMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    // Direct collections from sales made in this period
    const directCashSales = processedSales
      .filter((s) => s.invoiceType === 'cash' || (!s.invoiceType && s.paymentMethod !== 'mastercard'))
      .reduce((sum, s) => sum + s.totalRevenue, 0);

    const directMastercardSales = processedSales
      .filter((s) => s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard')
      .reduce((sum, s) => sum + s.totalRevenue, 0);

    // Debt invoices created in this period
    const totalNewDebt = processedSales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + s.remainingDebt, 0);

    // Initial down payments on debt invoices created in this period (if any)
    const initialDebtDownCash = processedSales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + s.cashReceived, 0);

    const initialDebtDownMastercard = processedSales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + s.mastercardReceived, 0);

    // Total actual cash collections during this period:
    // (Direct cash sales) + (Debt repayments received in cash during this period)
    const actualCashCollected = directCashSales + debtRepaymentsInPeriod.cashCollected + initialDebtDownCash;

    // Total actual mastercard collections during this period:
    const actualMastercardCollected = directMastercardSales + debtRepaymentsInPeriod.cardCollected + initialDebtDownMastercard;

    // Total overall liquidity received
    const totalActualLiquidity = actualCashCollected + actualMastercardCollected;

    // Net Cash Flow for the Cash Drawer (كاش داخل - كاش خارج كمصاريف من القاصة)
    const netCashDrawerFlow = actualCashCollected - processedExpenses.fromDrawer;

    return {
      invoicesCount: processedSales.length,
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin,
      totalExpenses,
      netProfit,
      netMargin,
      directCashSales,
      directMastercardSales,
      debtCashCollected: debtRepaymentsInPeriod.cashCollected,
      debtCardCollected: debtRepaymentsInPeriod.cardCollected,
      totalNewDebt,
      actualCashCollected,
      actualMastercardCollected,
      totalActualLiquidity,
      expensesFromDrawer: processedExpenses.fromDrawer,
      expensesFromManagement: processedExpenses.fromManagement,
      netCashDrawerFlow
    };
  }, [processedSales, processedExpenses, debtRepaymentsInPeriod]);

  // Filtered views for screen display
  const filteredSalesDisplay = useMemo(() => {
    return processedSales.filter((s) => {
      if (salesTypeFilter !== 'all') {
        const type = s.invoiceType || 'cash';
        if (type !== salesTypeFilter) return false;
      }
      if (salesSearch) {
        const q = salesSearch.toLowerCase().trim();
        const numMatch = String(s.invoiceNumber || '').includes(q);
        const nameMatch = String(s.customerName || '').toLowerCase().includes(q);
        if (!numMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [processedSales, salesTypeFilter, salesSearch]);

  const filteredExpensesDisplay = useMemo(() => {
    return processedExpenses.grouped.filter((group) => {
      if (expensesCategoryFilter !== 'all' && group.categoryName !== expensesCategoryFilter) {
        return false;
      }
      return true;
    });
  }, [processedExpenses.grouped, expensesCategoryFilter]);

  // Print Handlers
  const handleNativePrint = () => {
    const originalTitle = document.title;
    document.title = `التقرير_المالي_الشامل_${dateRange.label}_${new Date().toISOString().slice(0, 10)}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 600);
  };

  const handleDownloadPdf = async () => {
    if (!printDocumentRef.current) return;
    setIsExportingPdf(true);
    toast('جارٍ إنشاء ملف الـ PDF عالي الدقة، يرجى الانتظار لحظات... ⏳', 'info');

    try {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `التقرير_المالي_الشامل_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], before: '.print-page-break', avoid: '.print-avoid-break' }
      };

      await html2pdf().set(opt).from(printDocumentRef.current).save();
      toast('تم تنزيل ملف التقرير المالي الشامل PDF بنجاح! 📑✨', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      toast(`فشل تصدير الـ PDF: ${err.message}`, 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* 1. Header Toolbar & Quick Filters */}
      <div className="bg-white border border-brand-100 rounded-2xl shadow-xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Right: Title & Period Description */}
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-brand-50 text-brand-700 rounded-xl text-2xl">📊</span>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-ink-900">
                  التقرير المالي الشامل للمبيعات والأرباح والمصاريف
                </h2>
                <p className="text-xs sm:text-sm text-ink-500 mt-0.5 font-medium">
                  كشف تفصيلي لمطابقة حركة النقد (كاش وماستر وديون)، وتكلفة البضاعة، والمصاريف المقسمة حسب النوع
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-ink-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                الفترة المحددة: <b className="text-brand-800">{dateRange.label}</b>
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {summaryMetrics.invoicesCount} فاتورة مبيعات
              </span>
              <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
                {processedExpenses.all.length} بند مصروف
              </span>
            </div>
          </div>

          {/* Left: Quick Date Range Buttons & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Period Selectors */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'today' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => setPeriod('week')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'week' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                هذا الأسبوع
              </button>
              <button
                type="button"
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'month' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                هذا الشهر
              </button>
              <button
                type="button"
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'custom' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                فترة مخصصة
              </button>
            </div>

            {/* Print & PDF Buttons */}
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              معاينة وطباعة التقرير (A4 PDF)
            </button>
          </div>
        </div>

        {/* Custom Date Range Pickers (shown when period === 'custom') */}
        {period === 'custom' && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-xl">
            <span className="text-xs font-bold text-slate-700">تحديد الفترة من - إلى:</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium">من:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-brand-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium">إلى:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-brand-600"
              />
            </div>
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => {
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 cursor-pointer"
              >
                مسح التحديد
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Executive KPI Cards (Financial Summary) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* إجمالي المبيعات */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 flex items-center justify-between mb-1.5">
            <span>إجمالي المبيعات</span>
            <span className="text-base">🏷️</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
            {formatIQD(summaryMetrics.totalRevenue)}
          </p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            {summaryMetrics.invoicesCount} فاتورة معتمدة
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-brand-500" />
        </div>

        {/* تكلفة المواد المباعة */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 flex items-center justify-between mb-1.5">
            <span>تكلفة المواد (COGS)</span>
            <span className="text-base">📦</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-700 font-mono">
            {formatIQD(summaryMetrics.totalCost)}
          </p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">
            تكلفة شراء المواد الخارجة
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-slate-400" />
        </div>

        {/* مجمل الربح */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 flex items-center justify-between mb-1.5">
            <span>مجمل الربح</span>
            <span className="text-base">📈</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-indigo-700 font-mono">
            {formatIQD(summaryMetrics.grossProfit)}
          </p>
          <p className="text-[11px] font-bold text-indigo-500 mt-1">
            هامش الربح: {summaryMetrics.grossMargin}%
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500" />
        </div>

        {/* إجمالي المصاريف */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
          <div className="text-xs font-bold text-slate-500 flex items-center justify-between mb-1.5">
            <span>إجمالي المصاريف</span>
            <span className="text-base">💸</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-600 font-mono">
            {formatIQD(summaryMetrics.totalExpenses)}
          </p>
          <p className="text-[11px] font-bold text-rose-400 mt-1">
            {processedExpenses.all.length} بند مصروف مقسم
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500" />
        </div>

        {/* صافي الربح الفعلي */}
        <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 shadow-2xs relative overflow-hidden lg:col-span-2">
          <div className="text-xs font-black text-emerald-800 flex items-center justify-between mb-1.5">
            <span>صافي الربح الفعلي النهائي</span>
            <span className="text-base">💰</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-black text-emerald-900 font-mono">
              {formatIQD(summaryMetrics.netProfit)}
            </p>
            <span className="text-xs font-black text-emerald-700">د.ع</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] font-bold text-emerald-700">
            <span>(مجمل الربح - إجمالي المصاريف)</span>
            <span className="bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md">
              صافي الهامش: {summaryMetrics.netMargin}%
            </span>
          </div>
          <div className="absolute top-0 right-0 w-2 h-full bg-emerald-600" />
        </div>
      </div>

      {/* 3. Cash Liquidity & Real Collections Breakdown (مفتاح القاصة والماستر والديون) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-xl">
              🏦
            </span>
            <div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                حركة السيولة النقدية والمقبوضات الفعلية
              </h3>
              <p className="text-xs text-slate-300">
                المبالغ التي دخلت الصندوق وحساب المصرف فعلياً خلال الفترة شاملة تسديدات الديون
              </p>
            </div>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-right">
            <span className="text-[11px] text-slate-300 block font-bold">إجمالي كل النقد المستلم (كاش + ماستر):</span>
            <span className="text-xl font-mono font-black text-emerald-400">
              {formatIQD(summaryMetrics.totalActualLiquidity)} د.ع
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* كاش في القاصة */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-300 mb-2">
              <span>💵 النقد الفعلي كاش (في القاصة)</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px]">
                نقد مباشر + تسديدات
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-emerald-400">
              {formatIQD(summaryMetrics.actualCashCollected)} <span className="text-xs">د.ع</span>
            </p>
            <div className="mt-2 text-[11px] text-slate-300 space-y-0.5 border-t border-white/10 pt-2 font-medium">
              <div className="flex justify-between">
                <span>مبيعات نقدية مباشرة:</span>
                <span className="font-mono">{formatIQD(summaryMetrics.directCashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>تسديدات ديون كاش:</span>
                <span className="font-mono text-emerald-300">+{formatIQD(summaryMetrics.debtCashCollected)}</span>
              </div>
            </div>
          </div>

          {/* ماستر كارد */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-300 mb-2">
              <span>💳 المستلم ماستر كارد (في الحساب)</span>
              <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px]">
                نقاط البيع + تحويلات
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-indigo-300">
              {formatIQD(summaryMetrics.actualMastercardCollected)} <span className="text-xs">د.ع</span>
            </p>
            <div className="mt-2 text-[11px] text-slate-300 space-y-0.5 border-t border-white/10 pt-2 font-medium">
              <div className="flex justify-between">
                <span>مبيعات ماستر مباشرة:</span>
                <span className="font-mono">{formatIQD(summaryMetrics.directMastercardSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>تسديدات ديون ماستر:</span>
                <span className="font-mono text-indigo-300">+{formatIQD(summaryMetrics.debtCardCollected)}</span>
              </div>
            </div>
          </div>

          {/* ديون جديدة معلقة */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs font-bold text-amber-300 mb-2">
              <span>⏳ المتبقي كدين / آجل على العملاء</span>
              <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                فواتير الفترة
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-amber-400">
              {formatIQD(summaryMetrics.totalNewDebt)} <span className="text-xs">د.ع</span>
            </p>
            <div className="mt-2 text-[11px] text-slate-300 border-t border-white/10 pt-2 font-medium">
              <p>مبالغ فواتير آجل صادرة خلال الفترة ولم تُحصّل بعد بالكامل.</p>
            </div>
          </div>

          {/* صافي رصيد القاصة */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs font-bold text-sky-300 mb-2">
              <span>⚖️ صافي حركة القاصة (كاش فقط)</span>
              <span className="bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded text-[10px]">
                نقد داخل - مصاريف
              </span>
            </div>
            <p className="text-2xl font-black font-mono text-sky-300">
              {formatIQD(summaryMetrics.netCashDrawerFlow)} <span className="text-xs">د.ع</span>
            </p>
            <div className="mt-2 text-[11px] text-slate-300 space-y-0.5 border-t border-white/10 pt-2 font-medium">
              <div className="flex justify-between">
                <span>إجمالي الكاش المستلم:</span>
                <span className="font-mono text-emerald-400">{formatIQD(summaryMetrics.actualCashCollected)}</span>
              </div>
              <div className="flex justify-between">
                <span>مصاريف مدفوعة من القاصة:</span>
                <span className="font-mono text-rose-400">-{formatIQD(summaryMetrics.expensesFromDrawer)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Section Selector Navigation (Tabs within Report) */}
      <div className="flex border-b border-slate-200 gap-2 bg-white px-4 pt-3 rounded-2xl shadow-xs overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveSection('all')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'all'
              ? 'border-brand-600 text-brand-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>📑</span>
          <span>عرض الكشف المتكامل (مبيعات + مصاريف)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'sales'
              ? 'border-brand-600 text-brand-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>📄</span>
          <span>فواتير المبيعات وتحصيلاتها ({processedSales.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('expenses')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'expenses'
              ? 'border-brand-600 text-brand-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>🍲</span>
          <span>المصاريف المقسمة حسب النوع ({processedExpenses.grouped.length} فئات)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('debts')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSection === 'debts'
              ? 'border-brand-600 text-brand-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <span>💵</span>
          <span>تسديدات ديون العملاء المحصلة ({debtRepaymentsInPeriod.items.length})</span>
        </button>
      </div>

      {/* 5. Sales Invoices Breakdown Section */}
      {(activeSection === 'all' || activeSection === 'sales') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <span>📄</span>
                <span>جدول فواتير المبيعات وتحصيلاتها التفصيلية</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                يوضح شكد راح من كل فاتورة (التكلفة والربح) وشكد استلمت فعلياً كاش أو ماستر أو دين
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="بحث برقم الفاتورة أو العميل..."
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-brand-600 w-48"
              />
              <select
                value={salesTypeFilter}
                onChange={(e) => setSalesTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-brand-600"
              >
                <option value="all">كافة أنواع الدفع</option>
                <option value="cash">نقدي (كاش)</option>
                <option value="mastercard">ماستر كارد</option>
                <option value="debt">دين (آجل)</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3"># الفاتورة</th>
                  <th className="py-3 px-3">التاريخ والوقت</th>
                  <th className="py-3 px-3">العميل</th>
                  <th className="py-3 px-2 text-center">نوع الدفع</th>
                  <th className="py-3 px-3 text-left">إجمالي الفاتورة</th>
                  <th className="py-3 px-3 text-left">تكلفة المواد</th>
                  <th className="py-3 px-3 text-left">الربح المحقق</th>
                  <th className="py-3 px-3 text-left bg-emerald-50/50">المستلم كاش</th>
                  <th className="py-3 px-3 text-left bg-indigo-50/50">المستلم ماستر</th>
                  <th className="py-3 px-3 text-left bg-amber-50/50">المتبقي كدين</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSalesDisplay.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-slate-400 font-bold">
                      لا توجد فواتير مبيعات مطابقة لمعايير البحث في هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  filteredSalesDisplay.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => onViewSale && onViewSale(s)}
                          className="text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
                        >
                          #{s.invoiceNumber || s.id}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {s.dateFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {s.customerName || 'زبون عام'}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {s.invoiceType === 'debt' ? (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            دين (آجل)
                          </span>
                        ) : s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard' ? (
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            ماستر كارد
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            نقدي
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">
                        {formatIQD(s.totalRevenue)}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono text-slate-600">
                        {formatIQD(s.totalCost)}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700">
                        {formatIQD(s.grossProfit)}
                        <span className="text-[10px] text-emerald-500 mr-1 font-normal">
                          ({s.profitMargin}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-800 bg-emerald-50/30">
                        {formatIQD(s.cashReceived)}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-indigo-800 bg-indigo-50/30">
                        {formatIQD(s.mastercardReceived)}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-700 bg-amber-50/30">
                        {formatIQD(s.remainingDebt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Grand Totals Footer */}
              {filteredSalesDisplay.length > 0 && (
                <tfoot className="bg-slate-100/90 text-slate-900 font-black border-t-2 border-slate-300">
                  <tr>
                    <td colSpan="4" className="py-3 px-3 text-right">
                      المجموع الإجمالي للفواتير المعروضة:
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-slate-900">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-slate-700">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.totalCost, 0))} د.ع
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-emerald-800">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.grossProfit, 0))} د.ع
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-emerald-900 bg-emerald-100/50">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.cashReceived, 0))} د.ع
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-indigo-900 bg-indigo-100/50">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.mastercardReceived, 0))} د.ع
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-amber-900 bg-amber-100/50">
                      {formatIQD(filteredSalesDisplay.reduce((s, x) => s + x.remainingDebt, 0))} د.ع
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* 6. Categorized Expenses Breakdown Section */}
      {(activeSection === 'all' || activeSection === 'expenses') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <span>🍲</span>
                <span>كشف المصاريف التشغيلية المقسم حسب التصنيف</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                مصاريف مفصلة ومقسمة بين طعام وغداء، نقل وشحن، مستلزمات، كهرباء، إيجار، ونثريات أخرى
              </p>
            </div>

            {/* Filter by Category */}
            <div className="flex items-center gap-2">
              <select
                value={expensesCategoryFilter}
                onChange={(e) => setExpensesCategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-brand-600"
              >
                <option value="all">كافة التصنيفات ({processedExpenses.grouped.length})</option>
                {processedExpenses.grouped.map((g) => (
                  <option key={g.categoryName} value={g.categoryName}>
                    {g.icon} {g.categoryName} ({formatIQD(g.total)} د.ع)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Grouped Category Tables */}
          {filteredExpensesDisplay.length === 0 ? (
            <div className="py-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">
              لا توجد مصاريف مسجلة في هذه الفترة.
            </div>
          ) : (
            <div className="space-y-5">
              {filteredExpensesDisplay.map((group) => (
                <div
                  key={group.categoryName}
                  className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs"
                >
                  {/* Category Header Bar */}
                  <div className="bg-slate-100/80 px-4 py-3 flex items-center justify-between border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{group.icon}</span>
                      <h4 className="font-black text-slate-800 text-sm">{group.categoryName}</h4>
                      <span className="bg-white text-slate-600 text-xs px-2.5 py-0.5 rounded-full font-bold border border-slate-200">
                        {group.items.length} بنود
                      </span>
                    </div>
                    <div className="text-left font-mono font-black text-rose-700 text-base">
                      {formatIQD(group.total)} د.ع
                    </div>
                  </div>

                  {/* Items Table for this Category */}
                  <table className="w-full text-right text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">البيان / العنوان</th>
                        <th className="py-2.5 px-3">المنفذ / المشتري</th>
                        <th className="py-2.5 px-3 text-center">مصدر الدفع</th>
                        <th className="py-2.5 px-3">ملاحظات</th>
                        <th className="py-2.5 px-3 text-left">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {group.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                            {item.dateFormatted}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-800">
                            {item.title}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {item.buyerName || item.createdBy || 'المحل'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {item.paymentSource === 'management' ? (
                              <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                إدارة (خارج القاصة)
                              </span>
                            ) : item.paymentSource === 'mastercard' ? (
                              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                ماستر كارد
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                قاصة المحل
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            {item.notes || '—'}
                          </td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-rose-600">
                            {formatIQD(item.numAmount)} د.ع
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 text-slate-800 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan="5" className="py-2 px-3 text-right">
                          المجموع الفرعي لقسم {group.categoryName}:
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-black text-rose-700">
                          {formatIQD(group.total)} د.ع
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}

              {/* Total Expenses Summary Box */}
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-rose-900 text-base">
                    إجمالي كافة المصاريف التشغيلية للفترة
                  </h4>
                  <p className="text-xs text-rose-700 mt-0.5">
                    المدفوع من قاصة المحل: <b>{formatIQD(processedExpenses.fromDrawer)} د.ع</b> • المدفوع من الإدارة/الماستر: <b>{formatIQD(processedExpenses.fromManagement)} د.ع</b>
                  </p>
                </div>
                <div className="text-2xl font-black font-mono text-rose-900">
                  {formatIQD(processedExpenses.totalExpenses)} د.ع
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. Debt Repayments Collected Section */}
      {(activeSection === 'all' || activeSection === 'debts') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <span>💵</span>
                <span>تسديدات ديون العملاء المحصلة خلال الفترة</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                دفعات ديون تم استلامها نقدياً أو عبر الماستر كارد خلال الفترة وتدخل ضمن النقد الفعلي المحصل
              </p>
            </div>
            <div className="text-sm font-black font-mono text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              إجمالي التسديدات: {formatIQD(debtRepaymentsInPeriod.totalCollected)} د.ع
            </div>
          </div>

          {debtRepaymentsInPeriod.items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">
              لا توجد دفعات تسديد ديون مسجلة في هذه الفترة.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">التاريخ والوقت</th>
                    <th className="py-3 px-3"># الفاتورة</th>
                    <th className="py-3 px-3">اسم العميل</th>
                    <th className="py-3 px-3 text-center">طريقة الاستلام</th>
                    <th className="py-3 px-3">المستلم</th>
                    <th className="py-3 px-3">ملاحظات</th>
                    <th className="py-3 px-3 text-left">المبلغ المسدد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {debtRepaymentsInPeriod.items.map((pay) => (
                    <tr key={pay.paymentId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {pay.dateFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-brand-600">
                        #{pay.invoiceNumber || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {pay.customerName}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {pay.isCard ? (
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            💳 ماستر كارد
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            💵 كاش نقدي
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {pay.receivedBy}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {pay.notes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700">
                        {formatIQD(pay.amount)} د.ع
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. PRINT & EXPORT PDF MODAL (OFFICIAL MULTI-PAGE A4 DOCUMENT)             */}
      {/* ========================================================================= */}
      {showPrintModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-xs select-none"
          dir="rtl"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🖨️</span>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">
                    معاينة التقرير المالي الرسمي للطباعة وتصدير PDF (A4)
                  </h3>
                  <p className="text-xs text-slate-300">
                    مستند رسمي متعدد الصفحات منظم بفواصل طباعة قياسية A4
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNativePrint}
                  className="bg-brand-500 hover:bg-brand-600 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  طباعة الآن
                </button>

                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleDownloadPdf}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isExportingPdf ? 'جارٍ التصدير...' : 'تنزيل PDF'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors cursor-pointer mr-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Scrollable Document Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 flex justify-center">
              {/* Printable Document A4 Container */}
              <div
                id="printable-comprehensive-report"
                ref={printDocumentRef}
                className="bg-white text-slate-900 w-full max-w-[210mm] p-8 sm:p-10 shadow-lg rounded-xl print:shadow-none print:p-0 print:m-0 print:max-w-none"
                style={{ minHeight: '297mm', boxSizing: 'border-box' }}
              >
                {/* ========================================================= */}
                {/* PAGE 1: EXECUTIVE SUMMARY & LIQUIDITY RECONCILIATION     */}
                {/* ========================================================= */}
                <div className="document-page page-1 print-avoid-break mb-8">
                  {/* Store Header */}
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-5">
                    <div className="flex items-center gap-3">
                      <img
                        src={settings?.logoUrl || defaultLogo}
                        alt="Store Logo"
                        className="h-16 w-auto object-contain max-w-[90px]"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <div>
                        <h1 className="text-2xl font-black text-slate-950">
                          {settings?.storeName || 'المنطقة الآمنة'}
                        </h1>
                        <p className="text-xs text-slate-600 font-medium">
                          {settings?.subtitle || 'أنظمة المراقبة الأمنية والشبكات وحلول الحماية'}
                        </p>
                        {settings?.phone1 && (
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                            {settings.phone1} {settings.phone2 ? `• ${settings.phone2}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-left text-xs text-slate-500 space-y-1">
                      <div className="bg-slate-100 border border-slate-300 px-3 py-1 rounded-lg text-slate-900 font-bold text-center">
                        وثيقة مالية رسمية
                      </div>
                      <p>تاريخ الاستخراج: <span className="font-mono font-bold text-slate-800">{new Date().toLocaleDateString('ar-IQ')}</span></p>
                      <p>المسؤول: <span className="font-bold text-slate-800">{user?.displayName || user?.email || 'المسؤول'}</span></p>
                    </div>
                  </div>

                  {/* Document Title Banner */}
                  <div className="bg-slate-900 text-white p-4 rounded-xl text-center mb-5">
                    <h2 className="text-xl font-black tracking-wide">
                      التقرير المالي الشامل للأرباح والمبيعات والمصاريف
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 font-bold">
                      الفترة المحاسبية: <span className="text-amber-400">{dateRange.label}</span>
                    </p>
                  </div>

                  {/* Section 1: Executive KPI Cards */}
                  <h3 className="text-xs font-black text-slate-800 mb-2 border-r-4 border-slate-800 pr-2">
                    أولاً: الملخص التنفيذي ومؤشرات الأداء المالي
                  </h3>
                  <div className="grid grid-cols-3 gap-2.5 mb-5">
                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50/50">
                      <span className="text-[10px] text-slate-500 font-bold block">إجمالي المبيعات</span>
                      <span className="text-base font-black font-mono text-slate-900 block">
                        {formatIQD(summaryMetrics.totalRevenue)} د.ع
                      </span>
                      <span className="text-[9px] text-slate-400">{summaryMetrics.invoicesCount} فاتورة مبيعات</span>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50/50">
                      <span className="text-[10px] text-slate-500 font-bold block">تكلفة البضاعة المباعة</span>
                      <span className="text-base font-black font-mono text-slate-700 block">
                        {formatIQD(summaryMetrics.totalCost)} د.ع
                      </span>
                      <span className="text-[9px] text-slate-400">تكلفة شراء المواد</span>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-indigo-50/50">
                      <span className="text-[10px] text-indigo-700 font-bold block">مجمل الربح التجاري</span>
                      <span className="text-base font-black font-mono text-indigo-900 block">
                        {formatIQD(summaryMetrics.grossProfit)} د.ع
                      </span>
                      <span className="text-[9px] text-indigo-600 font-bold">هامش الربح: {summaryMetrics.grossMargin}%</span>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-rose-50/50">
                      <span className="text-[10px] text-rose-700 font-bold block">إجمالي المصاريف التشغيلية</span>
                      <span className="text-base font-black font-mono text-rose-800 block">
                        {formatIQD(summaryMetrics.totalExpenses)} د.ع
                      </span>
                      <span className="text-[9px] text-rose-600">{processedExpenses.all.length} بند مصروف</span>
                    </div>

                    <div className="border-2 border-emerald-600 p-2.5 rounded-lg bg-emerald-50 col-span-2">
                      <span className="text-[10px] text-emerald-800 font-bold block">صافي الربح الفعلي النهائي</span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-black font-mono text-emerald-950">
                          {formatIQD(summaryMetrics.netProfit)} د.ع
                        </span>
                        <span className="text-[10px] bg-emerald-200 text-emerald-900 font-black px-2 py-0.5 rounded">
                          صافي الهامش: {summaryMetrics.netMargin}%
                        </span>
                      </div>
                      <span className="text-[9px] text-emerald-700 font-medium">(مجمل الربح - إجمالي المصاريف)</span>
                    </div>
                  </div>

                  {/* Section 2: Cash & Collections Flow Reconciliation */}
                  <h3 className="text-xs font-black text-slate-800 mb-2 border-r-4 border-slate-800 pr-2">
                    ثانياً: مطابقة حركة السيولة النقدية والمقبوضات الفعلية
                  </h3>
                  <div className="border border-slate-300 rounded-lg overflow-hidden mb-5">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                        <tr>
                          <th className="p-2">بند السيولة النقدية</th>
                          <th className="p-2">البيان والتفصيل</th>
                          <th className="p-2 text-left">المبلغ الفعلي (د.ع)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        <tr>
                          <td className="p-2 font-bold text-slate-900">💵 النقد الفعلي كاش (في القاصة)</td>
                          <td className="p-2 text-slate-600 text-[11px]">
                            مبيعات مباشرة ({formatIQD(summaryMetrics.directCashSales)}) + تسديدات ديون كاش ({formatIQD(summaryMetrics.debtCashCollected)})
                          </td>
                          <td className="p-2 text-left font-mono font-bold text-emerald-800">
                            {formatIQD(summaryMetrics.actualCashCollected)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 font-bold text-slate-900">💳 المستلم ماستر كارد (في الحساب)</td>
                          <td className="p-2 text-slate-600 text-[11px]">
                            مبيعات ماستر ({formatIQD(summaryMetrics.directMastercardSales)}) + تسديدات ماستر ({formatIQD(summaryMetrics.debtCardCollected)})
                          </td>
                          <td className="p-2 text-left font-mono font-bold text-indigo-800">
                            {formatIQD(summaryMetrics.actualMastercardCollected)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50 font-bold">
                          <td className="p-2 text-slate-900">💰 إجمالي كل المقبوضات الفعلية</td>
                          <td className="p-2 text-slate-600 text-[11px]">كاش فعلي + ماستر كارد فعلي</td>
                          <td className="p-2 text-left font-mono text-emerald-900 font-black">
                            {formatIQD(summaryMetrics.totalActualLiquidity)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 font-bold text-amber-800">⏳ ديون مؤجلة جديدة على العملاء</td>
                          <td className="p-2 text-slate-600 text-[11px]">المتبقي كآجل من فواتير مبيعات هذه الفترة</td>
                          <td className="p-2 text-left font-mono font-bold text-amber-700">
                            {formatIQD(summaryMetrics.totalNewDebt)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2 font-bold text-rose-800">🔻 مصاريف نقدية مدفوعة من القاصة</td>
                          <td className="p-2 text-slate-600 text-[11px]">مصاريف تشغيلية ونثريات تم صرفها من الصندوق</td>
                          <td className="p-2 text-left font-mono font-bold text-rose-700">
                            -{formatIQD(summaryMetrics.expensesFromDrawer)}
                          </td>
                        </tr>
                        <tr className="bg-emerald-50/80 font-black border-t-2 border-slate-300">
                          <td className="p-2 text-emerald-950">⚖️ صافي التدفق النقدي للقاصة</td>
                          <td className="p-2 text-emerald-800 text-[11px]">(النقد الكاش الداخل - مصاريف القاصة الخارجة)</td>
                          <td className="p-2 text-left font-mono text-emerald-950 text-sm">
                            {formatIQD(summaryMetrics.netCashDrawerFlow)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section 3: Expenses Categories Summary */}
                  <h3 className="text-xs font-black text-slate-800 mb-2 border-r-4 border-slate-800 pr-2">
                    ثالثاً: ملخص المصاريف حسب التصنيفات الأساسية
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {processedExpenses.grouped.slice(0, 8).map((g) => (
                      <div key={g.categoryName} className="border border-slate-200 p-2 rounded-lg bg-slate-50 text-center">
                        <span className="text-base block mb-0.5">{g.icon}</span>
                        <span className="text-[10px] font-bold text-slate-700 block truncate">{g.categoryName}</span>
                        <span className="text-xs font-mono font-black text-rose-700 block mt-0.5">
                          {formatIQD(g.total)} د.ع
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-500 text-center border-t border-slate-200 pt-3">
                    الصفحة 1 من وثيقة التقرير المالي الشامل • يتبع في الصفحات التالية سجل فواتير المبيعات وكشف المصاريف المفصل
                  </p>
                </div>

                {/* ========================================================= */}
                {/* PAGE 2+: DETAILED SALES INVOICES (WITH PAGE BREAK)        */}
                {/* ========================================================= */}
                <div className="document-page page-sales print-page-break mb-8">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                    <div>
                      <h2 className="text-base font-black text-slate-900">
                        سجل فواتير المبيعات وتحصيلاتها المالية التفصيلية
                      </h2>
                      <p className="text-[11px] text-slate-500 font-medium">
                        الفترة: {dateRange.label} • إجمالي عدد الفواتير: {processedSales.length}
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-slate-100 text-slate-800 px-3 py-1 rounded-full border border-slate-300">
                      مبيعات وأرباح
                    </span>
                  </div>

                  <table className="w-full text-right text-[11px] border-collapse border border-slate-300 mb-4">
                    <thead className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                      <tr>
                        <th className="p-2 border-r border-slate-300"># الفاتورة</th>
                        <th className="p-2 border-r border-slate-300">التاريخ</th>
                        <th className="p-2 border-r border-slate-300">العميل</th>
                        <th className="p-2 border-r border-slate-300 text-center">النوع</th>
                        <th className="p-2 border-r border-slate-300 text-left">إجمالي الفاتورة</th>
                        <th className="p-2 border-r border-slate-300 text-left">التكلفة</th>
                        <th className="p-2 border-r border-slate-300 text-left">الربح</th>
                        <th className="p-2 border-r border-slate-300 text-left">المستلم كاش</th>
                        <th className="p-2 border-r border-slate-300 text-left">المستلم ماستر</th>
                        <th className="p-2 text-left">المتبقي دين</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {processedSales.map((s) => (
                        <tr key={s.id} className="print-avoid-break">
                          <td className="p-1.5 border-r border-slate-200 font-mono font-bold">
                            #{s.invoiceNumber || s.id}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-slate-500 font-mono text-[10px]">
                            {s.dateFormatted}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800">
                            {s.customerName || 'زبون عام'}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-center text-[10px] font-bold">
                            {s.invoiceType === 'debt' ? 'دين' : s.invoiceType === 'mastercard' ? 'ماستر' : 'نقدي'}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-left font-mono font-bold">
                            {formatIQD(s.totalRevenue)}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-left font-mono text-slate-600">
                            {formatIQD(s.totalCost)}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-left font-mono font-bold text-emerald-800">
                            {formatIQD(s.grossProfit)}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-left font-mono text-emerald-700">
                            {formatIQD(s.cashReceived)}
                          </td>
                          <td className="p-1.5 border-r border-slate-200 text-left font-mono text-indigo-700">
                            {formatIQD(s.mastercardReceived)}
                          </td>
                          <td className="p-1.5 text-left font-mono text-amber-700">
                            {formatIQD(s.remainingDebt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan="4" className="p-2 border-r border-slate-300 text-right">
                          المجموع الإجمالي لكافة الفواتير:
                        </td>
                        <td className="p-2 border-r border-slate-300 text-left font-mono">
                          {formatIQD(summaryMetrics.totalRevenue)}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-left font-mono">
                          {formatIQD(summaryMetrics.totalCost)}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-left font-mono text-emerald-800">
                          {formatIQD(summaryMetrics.grossProfit)}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-left font-mono text-emerald-800">
                          {formatIQD(processedSales.reduce((sum, s) => sum + s.cashReceived, 0))}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-left font-mono text-indigo-800">
                          {formatIQD(processedSales.reduce((sum, s) => sum + s.mastercardReceived, 0))}
                        </td>
                        <td className="p-2 text-left font-mono text-amber-800">
                          {formatIQD(summaryMetrics.totalNewDebt)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ========================================================= */}
                {/* FINAL PAGES: CATEGORIZED EXPENSES (PAGE BREAK BEFORE)     */}
                {/* ========================================================= */}
                <div className="document-page page-expenses print-page-break">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                    <div>
                      <h2 className="text-base font-black text-slate-900">
                        كشف المصاريف التشغيلية المفصل والمقسم حسب التصنيف
                      </h2>
                      <p className="text-[11px] text-slate-500 font-medium">
                        الفترة: {dateRange.label} • إجمالي المصاريف: {formatIQD(summaryMetrics.totalExpenses)} د.ع
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-rose-100 text-rose-800 px-3 py-1 rounded-full border border-rose-300">
                      مصاريف تشغيلية
                    </span>
                  </div>

                  <div className="space-y-4">
                    {processedExpenses.grouped.map((group) => (
                      <div
                        key={group.categoryName}
                        className="border border-slate-300 rounded-lg overflow-hidden print-avoid-break mb-3"
                      >
                        <div className="bg-slate-100 px-3 py-1.5 flex items-center justify-between border-b border-slate-300 text-xs">
                          <span className="font-black text-slate-900 flex items-center gap-1.5">
                            <span>{group.icon}</span>
                            <span>قسم: {group.categoryName}</span>
                            <span className="text-[10px] font-normal text-slate-500">({group.items.length} بنود)</span>
                          </span>
                          <span className="font-mono font-black text-rose-700">
                            المجموع الفرعي: {formatIQD(group.total)} د.ع
                          </span>
                        </div>

                        <table className="w-full text-right text-[10px] border-collapse">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-1.5">التاريخ</th>
                              <th className="p-1.5">البيان</th>
                              <th className="p-1.5">المنفذ</th>
                              <th className="p-1.5 text-center">مصدر الصرف</th>
                              <th className="p-1.5">ملاحظات</th>
                              <th className="p-1.5 text-left">المبلغ (د.ع)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.items.map((item) => (
                              <tr key={item.id}>
                                <td className="p-1.5 font-mono text-slate-500">{item.dateFormatted}</td>
                                <td className="p-1.5 font-bold text-slate-800">{item.title}</td>
                                <td className="p-1.5 text-slate-600">{item.buyerName || item.createdBy || 'المحل'}</td>
                                <td className="p-1.5 text-center">
                                  {item.paymentSource === 'management' ? 'إدارة' : item.paymentSource === 'mastercard' ? 'ماستر' : 'قاصة'}
                                </td>
                                <td className="p-1.5 text-slate-400">{item.notes || '—'}</td>
                                <td className="p-1.5 text-left font-mono font-bold text-rose-700">
                                  {formatIQD(item.numAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>

                  {/* Grand Total Expenses Bar */}
                  <div className="mt-4 p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between text-xs print-avoid-break">
                    <div>
                      <span className="font-black text-sm block">المجموع العام لكافة المصاريف التشغيلية:</span>
                      <span className="text-[10px] text-slate-300">
                        من القاصة: {formatIQD(processedExpenses.fromDrawer)} د.ع • من الإدارة: {formatIQD(processedExpenses.fromManagement)} د.ع
                      </span>
                    </div>
                    <div className="text-lg font-mono font-black text-rose-300">
                      {formatIQD(summaryMetrics.totalExpenses)} د.ع
                    </div>
                  </div>

                  {/* Document Footer Signatures */}
                  <div className="mt-8 pt-6 border-t-2 border-slate-300 flex items-center justify-between text-xs text-slate-600 print-avoid-break">
                    <div className="text-center w-40">
                      <p className="font-bold mb-8">إعداد وتدقيق المحاسب</p>
                      <p className="border-t border-slate-400 pt-1 font-mono">........................</p>
                    </div>
                    <div className="text-center w-40">
                      <p className="font-bold mb-8">اعتماد الإدارة العامة</p>
                      <p className="border-t border-slate-400 pt-1 font-mono">........................</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
