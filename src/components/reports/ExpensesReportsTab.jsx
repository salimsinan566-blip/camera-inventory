import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useExpenses } from '../../hooks/useExpenses';
import PrintableReportDocument from './PrintableReportDocument';
import { DAILY_EXPENSE_PRESETS, SHOP_EXPENSE_PRESETS } from '../../services/expensesService';

function formatIQD(num) {
  if (num === undefined || num === null) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch (e) {
      return null;
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIsoDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10);
  }
  const d = toDateSafe(val);
  if (!d) return '';
  try {
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return '';
  }
}

function getLastDayOfMonth(yearMonth) {
  if (!yearMonth) return '';
  const parts = yearMonth.split('-').map(Number);
  if (parts.length < 2 || !parts[0] || !parts[1]) return '';
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

// دالة التحقق الدقيقة: هل المصروف ثابت/تشغيلي أم نثرية يومية؟
export function isFixedExpense(e) {
  if (e.expenseType === 'shop') return true;
  if (e.expenseType === 'daily') return false;

  const fixedCategories = [
    'إيجار عقار',
    'رواتب وأجور',
    'كهرباء ومولد',
    'خدمات وإنترنت',
    'بلدية ورسوم',
    'صيانة وتجهيزات',
    'رسوم حكومية',
    'مصاريف تشغيلية'
  ];
  if (fixedCategories.includes(e.category)) return true;

  return SHOP_EXPENSE_PRESETS.some(
    p => p.title === e.title || p.category === e.category
  );
}

// أيقونة البند أو التصنيف
function getExpenseIcon(item) {
  const allPresets = [...SHOP_EXPENSE_PRESETS, ...DAILY_EXPENSE_PRESETS];
  const matched = allPresets.find(p => p.title === item.title || p.category === item.category);
  if (matched?.icon) return matched.icon;
  if (isFixedExpense(item)) return '🏢';
  return '☕';
}

export default function ExpensesReportsTab({
  storeSettings = {},
  userName = 'المحاسب المسؤول',
  onBackToDepartments = null,
  setReportMeta = null,
}) {
  const { expenses = [], loading: expensesLoading } = useExpenses();

  // Period Filter: 'today' | 'month' | 'custom' (مثل تقرير الأرباح تماماً)
  const [period, setPeriod] = useState('month');
  const [customSubMode, setCustomSubMode] = useState('months'); // 'months' | 'days'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customMonthFrom, setCustomMonthFrom] = useState('');
  const [customMonthTo, setCustomMonthTo] = useState('');
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [monthSelectionType, setMonthSelectionType] = useState('single'); // 'single' | 'range'

  // Separation Tab: 'all' | 'fixed' | 'sundries'
  const [activeTab, setActiveTab] = useState('all');

  // Search, Category, and Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

  // Print Document State
  const [printDocumentProps, setPrintDocumentProps] = useState(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Compute effective date bounds for custom range
  const effectiveCustomFrom = useMemo(() => {
    if (customSubMode === 'months') {
      if (!customMonthFrom) return '';
      if (customMonthTo && customMonthFrom > customMonthTo) {
        return `${customMonthTo}-01`;
      }
      return `${customMonthFrom}-01`;
    }
    if (customFrom && customTo && customFrom > customTo) {
      return customTo;
    }
    return customFrom;
  }, [customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  const effectiveCustomTo = useMemo(() => {
    if (customSubMode === 'months') {
      if (!customMonthTo) return customMonthFrom ? getLastDayOfMonth(customMonthFrom) : '';
      if (customMonthFrom && customMonthTo && customMonthFrom > customMonthTo) {
        return getLastDayOfMonth(customMonthFrom);
      }
      return getLastDayOfMonth(customMonthTo);
    }
    if (customFrom && customTo && customFrom > customTo) {
      return customFrom;
    }
    return customTo;
  }, [customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  // Label for Selected Period
  const periodLabel = useMemo(() => {
    if (period === 'today') return 'اليوم';
    if (period === 'month') return 'هذا الشهر';
    if (period === 'custom') {
      if (customSubMode === 'months') {
        if (customMonthFrom && customMonthTo) {
          const [y1, m1] = customMonthFrom.split('-');
          const [y2, m2] = customMonthTo.split('-');
          const n1 = parseInt(m1, 10);
          const n2 = parseInt(m2, 10);
          if (customMonthFrom === customMonthTo) {
            return `شهر ${n1} / ${y1}`;
          }
          const minM = Math.min(n1, n2);
          const maxM = Math.max(n1, n2);
          return y1 === y2
            ? `أشهر (${minM} - ${maxM}) / ${y1}`
            : `من (${n1}/${y1}) إلى (${n2}/${y2})`;
        }
        if (customMonthFrom) {
          const [y, m] = customMonthFrom.split('-');
          return `شهر ${parseInt(m, 10)} / ${y}`;
        }
        if (customMonthTo) {
          const [y, m] = customMonthTo.split('-');
          return `حتى شهر ${parseInt(m, 10)} / ${y}`;
        }
        return 'أشهر مخصصة';
      }
      if (customFrom && customTo) {
        return customFrom === customTo ? customFrom : `${customFrom} ↔ ${customTo}`;
      }
      if (customFrom) return `من ${customFrom}`;
      if (customTo) return `حتى ${customTo}`;
      return 'فترة مخصصة';
    }
    return 'هذا الشهر';
  }, [period, customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  // 1. Filter Expenses by Period
  const periodFilteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dateStr = toIsoDateStr(e.date || e.createdAt);
      const monthStr = dateStr.slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (effectiveCustomFrom && dateStr < effectiveCustomFrom) return false;
        if (effectiveCustomTo && dateStr > effectiveCustomTo) return false;
        return true;
      }
      return true;
    });
  }, [expenses, period, effectiveCustomFrom, effectiveCustomTo, todayStr, currentMonthStr]);

  // 2. Classify into Fixed and Sundries & Enrich
  const analyzedExpenses = useMemo(() => {
    return periodFilteredExpenses.map((e) => {
      const isFixed = isFixedExpense(e);
      const numAmount = Number(e.amount) || 0;
      const dateStr = toIsoDateStr(e.date || e.createdAt);
      const dateObj = toDateSafe(e.date || e.createdAt);
      const dayName = dateObj ? dateObj.toLocaleDateString('ar-IQ', { weekday: 'long' }) : '';
      const icon = getExpenseIcon(e);

      return {
        ...e,
        isFixed,
        typeLabel: isFixed ? 'مصاريف ثابتة' : 'نثريات',
        typeBadgeColor: isFixed
          ? 'bg-purple-100 text-purple-900 border-purple-300'
          : 'bg-amber-100 text-amber-900 border-amber-300',
        typeIcon: icon,
        numAmount,
        dateStr,
        dayName,
      };
    });
  }, [periodFilteredExpenses]);

  // Fixed and Sundries Lists
  const fixedExpenses = useMemo(() => {
    return analyzedExpenses.filter((e) => e.isFixed);
  }, [analyzedExpenses]);

  const sundryExpenses = useMemo(() => {
    return analyzedExpenses.filter((e) => !e.isFixed);
  }, [analyzedExpenses]);

  // Summary Totals
  const totalExpensesAmount = useMemo(() => {
    return analyzedExpenses.reduce((sum, e) => sum + e.numAmount, 0);
  }, [analyzedExpenses]);

  const totalFixedAmount = useMemo(() => {
    return fixedExpenses.reduce((sum, e) => sum + e.numAmount, 0);
  }, [fixedExpenses]);

  const totalSundryAmount = useMemo(() => {
    return sundryExpenses.reduce((sum, e) => sum + e.numAmount, 0);
  }, [sundryExpenses]);

  const fixedPercentage = useMemo(() => {
    return totalExpensesAmount > 0
      ? Math.round((totalFixedAmount / totalExpensesAmount) * 100)
      : 0;
  }, [totalFixedAmount, totalExpensesAmount]);

  const sundryPercentage = useMemo(() => {
    return totalExpensesAmount > 0
      ? Math.max(0, 100 - fixedPercentage)
      : 0;
  }, [totalExpensesAmount, fixedPercentage]);

  // Categories available for currently active separation tab
  const availableCategories = useMemo(() => {
    const list =
      activeTab === 'fixed'
        ? fixedExpenses
        : activeTab === 'sundries'
        ? sundryExpenses
        : analyzedExpenses;

    const set = new Set();
    list.forEach((e) => {
      if (e.category) set.add(e.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [activeTab, fixedExpenses, sundryExpenses, analyzedExpenses]);

  // Filtered & Sorted list for the table
  const displayedExpenses = useMemo(() => {
    let list =
      activeTab === 'fixed'
        ? fixedExpenses
        : activeTab === 'sundries'
        ? sundryExpenses
        : analyzedExpenses;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((e) => {
        const titleMatch = (e.title || '').toLowerCase().includes(q);
        const catMatch = (e.category || '').toLowerCase().includes(q);
        const buyerMatch = (e.buyerName || '').toLowerCase().includes(q);
        const notesMatch = (e.notes || '').toLowerCase().includes(q);
        const periodMatch = (e.periodCovered || '').toLowerCase().includes(q);
        return titleMatch || catMatch || buyerMatch || notesMatch || periodMatch;
      });
    }

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((e) => e.category === selectedCategory);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'amount_desc') return b.numAmount - a.numAmount;
      if (sortBy === 'amount_asc') return a.numAmount - b.numAmount;
      if (sortBy === 'date_asc') {
        const d1 = new Date(a.date || a.createdAt || 0).getTime();
        const d2 = new Date(b.date || b.createdAt || 0).getTime();
        return d1 - d2;
      }
      // default: date_desc
      const d1 = new Date(b.date || b.createdAt || 0).getTime();
      const d2 = new Date(a.date || a.createdAt || 0).getTime();
      return d1 - d2;
    });
  }, [activeTab, fixedExpenses, sundryExpenses, analyzedExpenses, searchTerm, selectedCategory, sortBy]);

  // Category Breakdown for the Active Tab
  const categoryBreakdown = useMemo(() => {
    const map = new Map();
    const sourceList =
      activeTab === 'fixed'
        ? fixedExpenses
        : activeTab === 'sundries'
        ? sundryExpenses
        : analyzedExpenses;

    const currentTotal =
      activeTab === 'fixed'
        ? totalFixedAmount
        : activeTab === 'sundries'
        ? totalSundryAmount
        : totalExpensesAmount;

    sourceList.forEach((e) => {
      const cat = (e.category || 'عام').trim();
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          totalAmount: 0,
          count: 0,
          isFixed: e.isFixed,
          icon: getExpenseIcon(e),
        });
      }
      const entry = map.get(cat);
      entry.totalAmount += e.numAmount;
      entry.count += 1;
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        percentage: currentTotal > 0 ? Math.round((entry.totalAmount / currentTotal) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [activeTab, fixedExpenses, sundryExpenses, analyzedExpenses, totalFixedAmount, totalSundryAmount, totalExpensesAmount]);

  // Date Popover handlers
  const handleToggleCustomPopover = () => {
    if (!showCalendarPopover) {
      if (!customMonthFrom) {
        const ym = new Date().toISOString().slice(0, 7);
        setCustomMonthFrom(ym);
        setCustomMonthTo(ym);
        setCalendarYear(new Date().getFullYear());
      }
      if (!customFrom) {
        setCustomFrom(todayStr);
        setCustomTo(todayStr);
      }
    }
    setShowCalendarPopover((prev) => !prev);
  };

  const handleMonthNumberClick = (num) => {
    const ym = `${calendarYear}-${String(num).padStart(2, '0')}`;
    if (monthSelectionType === 'single') {
      setCustomMonthFrom(ym);
      setCustomMonthTo(ym);
    } else {
      if (!customMonthFrom || (customMonthFrom && customMonthTo && customMonthFrom !== customMonthTo)) {
        setCustomMonthFrom(ym);
        setCustomMonthTo(ym);
      } else {
        if (ym < customMonthFrom) {
          setCustomMonthTo(customMonthFrom);
          setCustomMonthFrom(ym);
        } else {
          setCustomMonthTo(ym);
        }
      }
    }
  };

  // Sync TopNav
  useEffect(() => {
    if (!setReportMeta) return;
    setReportMeta({
      code: 'SEC-EXP-01',
      title: 'تقارير المصاريف',
      onPrint: () => handlePrintReport(activeTab),
    });
  }, [setReportMeta, activeTab]);

  // Print Handler
  const handlePrintReport = useCallback(
    (tab = activeTab) => {
      let printTitle = 'تقرير المصاريف الشامل';
      let printSub = `كشف المصاريف الثابتة والنثريات - ${periodLabel}`;
      let reportCode = `REP-EXP-ALL-${Date.now().toString().slice(-6)}`;
      let kpis = [
        { label: 'إجمالي كافة المصاريف', value: totalExpensesAmount, currency: 'د.ع', highlight: true },
        { label: 'المصاريف الثابتة', value: totalFixedAmount, currency: 'د.ع' },
        { label: 'النثريات والمصاريف اليومية', value: totalSundryAmount, currency: 'د.ع' },
        { label: 'إجمالي عدد القيود', value: analyzedExpenses.length },
      ];

      if (tab === 'fixed') {
        printTitle = 'تقرير المصاريف الثابتة والتشغيلية';
        printSub = `كشف الالتزامات الدورية والمصاريف الثابتة - ${periodLabel}`;
        reportCode = `REP-EXP-FIX-${Date.now().toString().slice(-6)}`;
        kpis = [
          { label: 'إجمالي المصاريف الثابتة', value: totalFixedAmount, currency: 'د.ع', highlight: true },
          { label: 'نسبة من إجمالي المصاريف', value: `${fixedPercentage}%` },
          { label: 'عدد القيود', value: fixedExpenses.length },
        ];
      } else if (tab === 'sundries') {
        printTitle = 'تقرير النثريات والمصاريف اليومية';
        printSub = `كشف النثريات والمنصرفات اليومية - ${periodLabel}`;
        reportCode = `REP-EXP-SUN-${Date.now().toString().slice(-6)}`;
        kpis = [
          { label: 'إجمالي النثريات', value: totalSundryAmount, currency: 'د.ع', highlight: true },
          { label: 'نسبة من إجمالي المصاريف', value: `${sundryPercentage}%` },
          { label: 'عدد القيود', value: sundryExpenses.length },
        ];
      }

      const activeList =
        tab === 'fixed'
          ? fixedExpenses
          : tab === 'sundries'
          ? sundryExpenses
          : analyzedExpenses;

      const subTotal = activeList.reduce((s, x) => s + x.numAmount, 0);

      setPrintDocumentProps({
        title: printTitle,
        subtitle: printSub,
        reportCode,
        filterDescription: `الفترة الزمنية: ${periodLabel} | التصنيف المعروض: ${
          tab === 'fixed'
            ? 'المصاريف الثابتة فقط'
            : tab === 'sundries'
            ? 'النثريات فقط'
            : 'كافة المصاريف (مفصولة ومقسمة)'
        }`,
        kpis,
        columns: [
          {
            header: 'ت',
            key: 'index',
            align: 'center',
            render: (_, __, idx) => idx + 1,
            isMono: true,
          },
          {
            header: 'التاريخ واليوم',
            key: 'dateStr',
            isMono: true,
            render: (_, row) => (
              <div>
                <span style={{ fontWeight: 'bold' }}>{row.dateStr || '—'}</span>
                {row.dayName && (
                  <span style={{ fontSize: '10px', color: '#64748b', marginRight: '4px' }}>
                    ({row.dayName})
                  </span>
                )}
              </div>
            ),
          },
          {
            header: 'عنوان وبند المصروف',
            key: 'title',
            isBold: true,
            render: (val, row) => (
              <div>
                <span>{row.typeIcon} </span>
                <span style={{ fontWeight: 'bold' }}>{val}</span>
                {row.periodCovered && (
                  <div style={{ fontSize: '10px', color: '#4338ca', fontWeight: 'bold', marginTop: '2px' }}>
                    🗓️ {row.periodCovered}
                  </div>
                )}
              </div>
            ),
          },
          {
            header: 'النوع',
            key: 'typeLabel',
            render: (_, row) => (
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: row.isFixed ? '#f3e8ff' : '#fef3c7',
                  color: row.isFixed ? '#6b21a8' : '#92400e',
                  border: `1px solid ${row.isFixed ? '#d8b4fe' : '#fcd34d'}`,
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                }}
              >
                {row.isFixed ? '🏢 ثابتة' : '☕ نثريات'}
              </span>
            ),
          },
          { header: 'التصنيف', key: 'category' },
          { header: 'المنفذ / المشتري', key: 'buyerName' },
          { header: 'ملاحظات', key: 'notes' },
          {
            header: 'المبلغ',
            key: 'numAmount',
            isMono: true,
            isBold: true,
            align: 'left',
            render: (v) => `${formatIQD(v)} د.ع`,
          },
        ],
        data: activeList,
        totals: {
          title: 'المجموع الإجمالي',
          numAmount: `${formatIQD(subTotal)} د.ع`,
        },
      });
    },
    [
      activeTab,
      periodLabel,
      totalExpensesAmount,
      totalFixedAmount,
      totalSundryAmount,
      analyzedExpenses,
      fixedExpenses,
      sundryExpenses,
      fixedPercentage,
      sundryPercentage,
    ]
  );

  return (
    <div className="w-full space-y-4 text-slate-800" dir="rtl">
      {/* 1. Header & Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* عنوان القسم وأزرار الرجوع والطباعة */}
          <div className="flex items-center gap-3">
            {onBackToDepartments && (
              <button
                type="button"
                onClick={onBackToDepartments}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                title="رجوع لأقسام التقارير"
              >
                ➔
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
                <h1 className="text-lg md:text-xl font-black text-slate-900">
                  تقارير المصاريف
                </h1>
                <span className="text-[10px] font-mono font-bold bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                  SEC-EXP-01
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                كشف تحليلي للمصاريف مع فصل المصاريف الثابتة والتشغيلية عن النثريات اليومية
              </p>
            </div>
          </div>

          {/* الأزرار الثلاثة المحددة بدقة مثل تقرير الأرباح: اليوم | هذا الشهر | مخصص */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setPeriod('today');
                  setShowCalendarPopover(false);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'today'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => {
                  setPeriod('month');
                  setShowCalendarPopover(false);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === 'month'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                هذا الشهر
              </button>

              {/* زر مخصص مع القائمة المنبثقة ملتصقة به مباشرة */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleToggleCustomPopover}
                  className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    period === 'custom'
                      ? 'bg-white text-indigo-900 shadow-2xs border border-indigo-200 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>📅</span>
                  <span>مخصص</span>
                  {period === 'custom' && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded-full font-mono font-bold">
                      {periodLabel}
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCalendarPopover ? 'rotate-180 text-indigo-600' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* النافذة المنبثقة الملتصقة بالزر مباشرة */}
                {showCalendarPopover && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/10 sm:bg-transparent"
                      onClick={() => setShowCalendarPopover(false)}
                    />

                    <div
                      className="fixed sm:absolute top-20 sm:top-full start-2 sm:start-auto sm:end-0 mt-0 sm:mt-2 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3.5 text-right font-sans"
                      dir="rtl"
                    >
                      {/* التبويب الداخلي: أشهر vs أيام */}
                      <div className="flex bg-slate-100 p-0.5 rounded-xl mb-3 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setCustomSubMode('months')}
                          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                            customSubMode === 'months'
                              ? 'bg-white text-indigo-900 shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📅 بالأشهر
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomSubMode('days')}
                          className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                            customSubMode === 'days'
                              ? 'bg-white text-indigo-900 shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📆 بالأيام
                        </button>
                      </div>

                      {/* تبويب الأشهر */}
                      {customSubMode === 'months' ? (
                        <div>
                          {/* شريط تبديل السنة */}
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl mb-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const newY = calendarYear - 1;
                                setCalendarYear(newY);
                                if (customMonthFrom) {
                                  const m = customMonthFrom.split('-')[1];
                                  setCustomMonthFrom(`${newY}-${m}`);
                                }
                                if (customMonthTo) {
                                  const m = customMonthTo.split('-')[1];
                                  setCustomMonthTo(`${newY}-${m}`);
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-lg text-slate-700 font-bold transition-colors cursor-pointer text-xs"
                              title="السنة السابقة"
                            >
                              ◀
                            </button>
                            <span className="font-mono font-black text-slate-900 text-sm">
                              {calendarYear}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newY = calendarYear + 1;
                                setCalendarYear(newY);
                                if (customMonthFrom) {
                                  const m = customMonthFrom.split('-')[1];
                                  setCustomMonthFrom(`${newY}-${m}`);
                                }
                                if (customMonthTo) {
                                  const m = customMonthTo.split('-')[1];
                                  setCustomMonthTo(`${newY}-${m}`);
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-lg text-slate-700 font-bold transition-colors cursor-pointer text-xs"
                              title="السنة التالية"
                            >
                              ▶
                            </button>
                          </div>

                          {/* نوع الاختيار: شهر واحد أم عدة أشهر */}
                          <div className="flex items-center gap-1 mb-2 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => {
                                setMonthSelectionType('single');
                                if (customMonthFrom) setCustomMonthTo(customMonthFrom);
                              }}
                              className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
                                monthSelectionType === 'single'
                                  ? 'bg-white text-indigo-900 shadow-2xs font-black'
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              شهر واحد
                            </button>
                            <button
                              type="button"
                              onClick={() => setMonthSelectionType('range')}
                              className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
                                monthSelectionType === 'range'
                                  ? 'bg-white text-indigo-900 shadow-2xs font-black'
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              فترة عدة أشهر
                            </button>
                          </div>

                          {/* اختصارات سريعة */}
                          <div className="flex flex-wrap gap-1 mb-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                const ym = d.toISOString().slice(0, 7);
                                setCalendarYear(d.getFullYear());
                                setMonthSelectionType('single');
                                setCustomMonthFrom(ym);
                                setCustomMonthTo(ym);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              الشهر الحالي
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                d.setMonth(d.getMonth() - 1);
                                const ym = d.toISOString().slice(0, 7);
                                setCalendarYear(d.getFullYear());
                                setMonthSelectionType('single');
                                setCustomMonthFrom(ym);
                                setCustomMonthTo(ym);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              الشهر السابق
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const y = calendarYear;
                                setMonthSelectionType('range');
                                setCustomMonthFrom(`${y}-01`);
                                setCustomMonthTo(`${y}-03`);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                            >
                              أشهر (1 - 3)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const y = calendarYear;
                                setMonthSelectionType('range');
                                setCustomMonthFrom(`${y}-01`);
                                setCustomMonthTo(`${y}-06`);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                            >
                              أشهر (1 - 6)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const y = calendarYear;
                                setMonthSelectionType('range');
                                setCustomMonthFrom(`${y}-01`);
                                setCustomMonthTo(`${y}-12`);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                            >
                              كامل السنة
                            </button>
                          </div>

                          {/* شبكة الأرقام فقط (1 إلى 12) - أرقام بدون أسماء */}
                          <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                              const ym = `${calendarYear}-${String(num).padStart(2, '0')}`;
                              const isFrom = customMonthFrom === ym;
                              const isTo = customMonthTo === ym;
                              const isExactSingle = isFrom && isTo;
                              const [minYm, maxYm] =
                                customMonthFrom && customMonthTo && customMonthFrom > customMonthTo
                                  ? [customMonthTo, customMonthFrom]
                                  : [customMonthFrom, customMonthTo];
                              const inRange = minYm && maxYm && ym >= minYm && ym <= maxYm;

                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => handleMonthNumberClick(num)}
                                  className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer font-mono font-black ${
                                    isExactSingle
                                      ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400'
                                      : isFrom || isTo
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : inRange
                                      ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  <span className="text-[10px] font-sans font-medium text-slate-400 block -mb-0.5">
                                    شهر
                                  </span>
                                  <span className="text-base">{num}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* محتوى اختيار الأيام */
                        <div className="space-y-2.5 mb-3">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomFrom(todayStr);
                                setCustomTo(todayStr);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              اليوم
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 1);
                                const yest = d.toISOString().slice(0, 10);
                                setCustomFrom(yest);
                                setCustomTo(yest);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              أمس
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                const end = d.toISOString().slice(0, 10);
                                d.setDate(d.getDate() - 7);
                                const start = d.toISOString().slice(0, 10);
                                setCustomFrom(start);
                                setCustomTo(end);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              آخر 7 أيام
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                const end = d.toISOString().slice(0, 10);
                                d.setDate(d.getDate() - 30);
                                const start = d.toISOString().slice(0, 10);
                                setCustomFrom(start);
                                setCustomTo(end);
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                            >
                              آخر 30 يوماً
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                              <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                              <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ملخص الفترة المحددة */}
                      <div className="bg-slate-100 px-3 py-1.5 rounded-xl mb-3 text-xs flex items-center justify-between text-slate-700 font-bold">
                        <span className="text-[11px] text-slate-500">المحدد:</span>
                        <span className="font-mono text-indigo-950 font-black text-[11px] truncate max-w-[200px]">
                          {customSubMode === 'months' ? (
                            customMonthFrom === customMonthTo ? (
                              `شهر ${parseInt(customMonthFrom?.split('-')[1] || '1', 10)} / ${calendarYear}`
                            ) : (
                              `أشهر (${parseInt(customMonthFrom?.split('-')[1] || '1', 10)} - ${parseInt(customMonthTo?.split('-')[1] || '12', 10)}) / ${calendarYear}`
                            )
                          ) : (
                            customFrom && customTo ? `${customFrom} ↔ ${customTo}` : 'يرجى تحديد التاريخ'
                          )}
                        </span>
                      </div>

                      {/* أزرار الإجراءات */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowCalendarPopover(false)}
                          className="flex-1 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (customSubMode === 'months') {
                              if (!customMonthFrom) {
                                const ym = `${calendarYear}-01`;
                                setCustomMonthFrom(ym);
                                setCustomMonthTo(ym);
                              } else if (!customMonthTo) {
                                setCustomMonthTo(customMonthFrom);
                              }
                            } else {
                              if (!customFrom) setCustomFrom(todayStr);
                              if (!customTo) setCustomTo(todayStr);
                            }
                            setPeriod('custom');
                            setShowCalendarPopover(false);
                          }}
                          className="flex-1 py-1.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-2xs cursor-pointer text-center"
                        >
                          تطبيق الاختيار
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* زر طباعة الكشف بصيغة PDF مباشرة */}
            <button
              type="button"
              onClick={() => handlePrintReport(activeTab)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>🖨️</span>
              <span>طباعة الكشف (PDF)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Cards: فصل المصاريف الثابتة عن النثريات بصرياً وبالأرقام */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* الكارت 1: إجمالي كافة المصاريف */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">إجمالي كافة المصاريف</span>
            <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center text-sm font-bold">
              💰
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-slate-900 font-mono">
            {formatIQD(totalExpensesAmount)} <span className="text-xs font-sans text-slate-500">د.ع</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>عدد العمليات:</span>
            <span className="font-mono text-slate-800 font-black">{analyzedExpenses.length} قيد</span>
          </div>
        </div>

        {/* الكارت 2: المصاريف الثابتة (إيجار، رواتب، كهرباء، إنترنت...) */}
        <div
          onClick={() => setActiveTab('fixed')}
          className={`bg-white rounded-2xl border-2 p-4 shadow-2xs cursor-pointer transition-all ${
            activeTab === 'fixed'
              ? 'border-purple-600 ring-2 ring-purple-100'
              : 'border-purple-200 hover:border-purple-400'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-purple-900 flex items-center gap-1">
              <span>🏢</span> المصاريف الثابتة والتشغيلية
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {fixedPercentage}%
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-purple-950 font-mono">
            {formatIQD(totalFixedAmount)} <span className="text-xs font-sans text-purple-700">د.ع</span>
          </div>
          <div className="mt-2 pt-2 border-t border-purple-50 flex items-center justify-between text-xs text-purple-700 font-bold">
            <span>الالتزامات الدورية:</span>
            <span className="font-mono text-purple-900 font-black">{fixedExpenses.length} بند</span>
          </div>
        </div>

        {/* الكارت 3: النثريات (غداء، شاي، مستلزمات، نظافة، نقل...) */}
        <div
          onClick={() => setActiveTab('sundries')}
          className={`bg-white rounded-2xl border-2 p-4 shadow-2xs cursor-pointer transition-all ${
            activeTab === 'sundries'
              ? 'border-amber-600 ring-2 ring-amber-100'
              : 'border-amber-200 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-amber-900 flex items-center gap-1">
              <span>☕</span> النثريات والمصاريف اليومية
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {sundryPercentage}%
            </span>
          </div>
          <div className="text-xl lg:text-2xl font-black text-amber-950 font-mono">
            {formatIQD(totalSundryAmount)} <span className="text-xs font-sans text-amber-700">د.ع</span>
          </div>
          <div className="mt-2 pt-2 border-t border-amber-50 flex items-center justify-between text-xs text-amber-700 font-bold">
            <span>المصاريف اليومية:</span>
            <span className="font-mono text-amber-900 font-black">{sundryExpenses.length} بند</span>
          </div>
        </div>

        {/* الكارت 4: نسبة التوزيع البصري والمقارنة */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-500">نسبة توزيع المصاريف</span>
              <span className="text-[10px] font-mono font-bold text-slate-400">{periodLabel}</span>
            </div>
            {/* شريط المقارنة ثنائي اللون */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex my-2 border border-slate-200">
              <div
                style={{ width: `${fixedPercentage}%` }}
                className="bg-purple-600 h-full transition-all duration-500"
                title={`ثابتة: ${fixedPercentage}%`}
              />
              <div
                style={{ width: `${sundryPercentage}%` }}
                className="bg-amber-500 h-full transition-all duration-500"
                title={`نثريات: ${sundryPercentage}%`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold pt-2 border-t border-slate-100">
            <span className="flex items-center gap-1 text-purple-900">
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              <span>ثابتة ({fixedPercentage}%)</span>
            </span>
            <span className="flex items-center gap-1 text-amber-900">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>نثريات ({sundryPercentage}%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. تبويبات الفصل: المصاريف الثابتة | النثريات | الكل */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setSelectedCategory('all');
            }}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>📑</span>
            <span>كافة المصاريف (مفصلة ومقسمة)</span>
            <span className="font-mono text-[11px] bg-white/20 px-1.5 py-0.5 rounded">
              {analyzedExpenses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('fixed');
              setSelectedCategory('all');
            }}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'fixed'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-900'
            }`}
          >
            <span>🏢</span>
            <span>المصاريف الثابتة فقط</span>
            <span className="font-mono text-[11px] bg-white/20 px-1.5 py-0.5 rounded">
              {fixedExpenses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('sundries');
              setSelectedCategory('all');
            }}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'sundries'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900'
            }`}
          >
            <span>☕</span>
            <span>النثريات فقط</span>
            <span className="font-mono text-[11px] bg-white/20 px-1.5 py-0.5 rounded">
              {sundryExpenses.length}
            </span>
          </button>
        </div>
      </div>

      {/* 4. كروت توزيع المصاريف حسب التصنيف (Category Breakdown) */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <span>📊</span>
              <span>
                توزيع المصاريف حسب البنود والتصنيفات (
                {activeTab === 'fixed'
                  ? 'المصاريف الثابتة'
                  : activeTab === 'sundries'
                  ? 'النثريات'
                  : 'كافة التصنيفات'}
                )
              </span>
            </h3>
            <span className="text-[11px] text-slate-500 font-bold font-mono">
              {categoryBreakdown.length} تصنيف
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {categoryBreakdown.map((catItem) => {
              const isSelected = selectedCategory === catItem.category;
              return (
                <div
                  key={catItem.category}
                  onClick={() => setSelectedCategory(isSelected ? 'all' : catItem.category)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-200'
                      : catItem.isFixed
                      ? 'border-purple-200 bg-purple-50/40 hover:bg-purple-50'
                      : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="truncate flex items-center gap-1" title={catItem.category}>
                      <span>{catItem.icon}</span>
                      <span className="text-slate-800">{catItem.category}</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      {catItem.percentage}%
                    </span>
                  </div>

                  <div className="text-xs font-black font-mono text-slate-900">
                    {formatIQD(catItem.totalAmount)}{' '}
                    <span className="text-[9px] font-sans font-bold text-slate-500">د.ع</span>
                  </div>

                  {/* شريط نسبة التصنيف */}
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${catItem.percentage}%` }}
                      className={`h-full ${catItem.isFixed ? 'bg-purple-600' : 'bg-amber-500'}`}
                    />
                  </div>

                  <div className="text-[10px] font-bold text-slate-500 flex items-center justify-between">
                    <span>العمليات:</span>
                    <span className="font-mono text-slate-800">{catItem.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. شريط الفلترة والبحث والترتيب للجدول */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* البحث */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              البحث في المصاريف:
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث بالبند، التصنيف، المشتري، الملاحظات..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* فلتر التصنيف */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              تصفية حسب التصنيف:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
            >
              <option value="all">كافة التصنيفات ({availableCategories.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* ترتيب القائمة */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              ترتيب القائمة حسب:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
            >
              <option value="date_desc">📅 الأحدث تاريخاً أولاً</option>
              <option value="date_asc">📆 الأقدم تاريخاً أولاً</option>
              <option value="amount_desc">💰 الأعلى مبلغاً أولاً</option>
              <option value="amount_asc">📉 الأقل مبلغاً أولاً</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6. جدول قيود وسجلات المصاريف المفصلة */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
        {/* شريط الإجماليات أعلى الجدول */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700">
              عدد القيود المعروضة:{' '}
              <strong className="font-mono text-slate-900">{displayedExpenses.length}</strong>
            </span>
            {selectedCategory !== 'all' && (
              <span className="text-[11px] bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                تصفية: {selectedCategory}
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="text-indigo-600 hover:text-indigo-950 font-black"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <span className="font-bold text-slate-700">
            إجمالي المبلغ المعروض:{' '}
            <strong className="font-mono text-rose-700 font-black text-sm">
              {formatIQD(displayedExpenses.reduce((s, e) => s + e.numAmount, 0))} د.ع
            </strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                <th className="py-2.5 px-3 font-bold">التاريخ واليوم</th>
                <th className="py-2.5 px-3 font-bold">عنوان وبند المصروف</th>
                <th className="py-2.5 px-3 font-bold text-center">نوع المصروف</th>
                <th className="py-2.5 px-3 font-bold">التصنيف</th>
                <th className="py-2.5 px-3 font-bold">الفترة المغطاة / ملاحظات</th>
                <th className="py-2.5 px-3 font-bold">المنفذ / المشتري</th>
                <th className="py-2.5 px-3 font-bold text-left">المبلغ المنصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    {expensesLoading ? 'جاري تحميل سجلات المصاريف...' : '🎉 لا توجد مصاريف مسجلة تطابق هذه الفترة والخيارات!'}
                  </td>
                </tr>
              ) : (
                displayedExpenses.map((e, idx) => (
                  <tr
                    key={e.id || idx}
                    className={`transition-colors ${
                      idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-slate-800">{e.dateStr || '—'}</div>
                      {e.dayName && (
                        <div className="text-[10px] text-slate-400 font-sans">{e.dayName}</div>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm shrink-0">{e.typeIcon}</span>
                        <div>
                          <div className="font-black text-slate-900 text-xs sm:text-sm">
                            {e.title}
                          </div>
                          {e.periodCovered && (
                            <span className="inline-block text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.2 rounded font-bold mt-0.5">
                              🗓️ {e.periodCovered}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block text-[11px] font-black px-2 py-0.5 rounded-full border ${e.typeBadgeColor}`}
                      >
                        {e.isFixed ? '🏢 ثابتة' : '☕ نثريات'}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-bold text-slate-700">
                      {e.category || 'عام'}
                    </td>

                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                      {e.notes || (e.periodCovered ? `تغطية ${e.periodCovered}` : '—')}
                    </td>

                    <td className="py-2.5 px-3 font-medium text-slate-700">
                      {e.buyerName || 'قاصة المحل'}
                    </td>

                    <td className="py-2.5 px-3 text-left font-mono font-black text-rose-700 text-xs sm:text-sm">
                      {formatIQD(e.numAmount)} د.ع
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {displayedExpenses.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-xs">
                  <td colSpan={7} className="py-3 px-3 text-right text-slate-900">
                    المجموع الإجمالي للمصاريف المعروضة:
                  </td>
                  <td className="py-3 px-3 text-left font-mono text-rose-800 text-sm">
                    {formatIQD(displayedExpenses.reduce((s, e) => s + e.numAmount, 0))} د.ع
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 7. وثيقة التقرير المطبوع بصيغة PDF الرسمية */}
      {printDocumentProps && (
        <PrintableReportDocument
          {...printDocumentProps}
          storeSettings={storeSettings}
          userName={userName}
          onClose={() => setPrintDocumentProps(null)}
        />
      )}
    </div>
  );
}
