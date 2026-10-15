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
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
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

// فحص دقيق: هل المصروف ثابت/تشغيلي أم متغير/نثريات؟
function isFixedExpense(e) {
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
    'مصاريف تشغيلية',
  ];
  if (fixedCategories.includes(e.category)) return true;

  return SHOP_EXPENSE_PRESETS.some(
    (p) => p.title === e.title || p.category === e.category
  );
}

// الحصول على أيقونة مناسبة للبند
function getExpenseIcon(item) {
  const allPresets = [...SHOP_EXPENSE_PRESETS, ...DAILY_EXPENSE_PRESETS];
  const matched = allPresets.find((p) => p.title === item.title || p.category === item.category);
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

  // 1. تحديد الفترة: اليوم | هذا الشهر | مخصص (مطابقة 100% لتقرير الأرباح)
  const [period, setPeriod] = useState('month');
  const [customSubMode, setCustomSubMode] = useState('months'); // 'months' | 'days'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customMonthFrom, setCustomMonthFrom] = useState('');
  const [customMonthTo, setCustomMonthTo] = useState('');
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [monthSelectionType, setMonthSelectionType] = useState('single'); // 'single' | 'range'

  // 2. النافذة المنبثقة النشطة: null | 'all' | 'fixed' | 'variable' | 'categories'
  const [activeModal, setActiveModal] = useState(null);

  // فلاتر داخل النوافذ المنبثقة
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategoryFilter, setModalCategoryFilter] = useState('all');
  const [modalTypeFilter, setModalTypeFilter] = useState('all'); // for 'all' modal: 'all' | 'fixed' | 'variable'

  // وثيقة الطباعة
  const [printDocumentProps, setPrintDocumentProps] = useState(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // حساب النطاق الزمني الفعلي للتصفية المخصصة
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

  // نص الفترة المختارة
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

  // 1. تصفية المصاريف حسب الفترة الزمنية المحددة
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

  // 2. تحليل وتصنيف المصاريف إلى ثابتة ومتغيرة مع إثراء البيانات
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
        typeLabel: isFixed ? 'مصاريف ثابتة' : 'مصاريف متغيرة',
        typeBadgeColor: isFixed
          ? 'bg-amber-100 text-amber-900 border-amber-300'
          : 'bg-rose-100 text-rose-900 border-rose-300',
        typeIcon: icon,
        numAmount,
        dateStr,
        dayName,
      };
    });
  }, [periodFilteredExpenses]);

  // قوائم المفصولين
  const fixedExpenses = useMemo(() => {
    return analyzedExpenses.filter((e) => e.isFixed);
  }, [analyzedExpenses]);

  const sundryExpenses = useMemo(() => {
    return analyzedExpenses.filter((e) => !e.isFixed);
  }, [analyzedExpenses]);

  // الإجماليات المالية
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

  // تصنيفات وبنود المصاريف الثابتة
  const fixedCategoryBreakdown = useMemo(() => {
    const map = new Map();
    fixedExpenses.forEach((e) => {
      const cat = (e.category || 'عام').trim();
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          totalAmount: 0,
          count: 0,
          isFixed: true,
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
        percentage: totalFixedAmount > 0 ? Math.round((entry.totalAmount / totalFixedAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [fixedExpenses, totalFixedAmount]);

  // تصنيفات وبنود المصاريف المتغيرة
  const sundryCategoryBreakdown = useMemo(() => {
    const map = new Map();
    sundryExpenses.forEach((e) => {
      const cat = (e.category || 'عام').trim();
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          totalAmount: 0,
          count: 0,
          isFixed: false,
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
        percentage: totalSundryAmount > 0 ? Math.round((entry.totalAmount / totalSundryAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [sundryExpenses, totalSundryAmount]);

  // كافة التصنيفات والبنود مجتمعة للبطاقة الرابعة
  const allCategoryBreakdown = useMemo(() => {
    const map = new Map();
    analyzedExpenses.forEach((e) => {
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
        percentage: totalExpensesAmount > 0 ? Math.round((entry.totalAmount / totalExpensesAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [analyzedExpenses, totalExpensesAmount]);

  // أعلى بند صرف
  const topCategory = useMemo(() => {
    return allCategoryBreakdown.length > 0 ? allCategoryBreakdown[0] : null;
  }, [allCategoryBreakdown]);

  // تصفية السجلات داخل النوافذ المنبثقة
  const modalFilteredExpenses = useMemo(() => {
    let list = [];
    if (activeModal === 'fixed') {
      list = fixedExpenses;
    } else if (activeModal === 'variable') {
      list = sundryExpenses;
    } else {
      list = analyzedExpenses;
    }

    // Type filter for 'all' modal
    if (activeModal === 'all' && modalTypeFilter !== 'all') {
      list = list.filter((e) => (modalTypeFilter === 'fixed' ? e.isFixed : !e.isFixed));
    }

    // Category filter
    if (modalCategoryFilter !== 'all') {
      list = list.filter((e) => e.category === modalCategoryFilter);
    }

    // Search query
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter((e) => {
        const titleMatch = (e.title || '').toLowerCase().includes(q);
        const catMatch = (e.category || '').toLowerCase().includes(q);
        const notesMatch = (e.notes || '').toLowerCase().includes(q);
        const buyerMatch = (e.buyerName || '').toLowerCase().includes(q);
        const periodMatch = (e.periodCovered || '').toLowerCase().includes(q);
        return titleMatch || catMatch || notesMatch || buyerMatch || periodMatch;
      });
    }

    return list;
  }, [
    activeModal,
    fixedExpenses,
    sundryExpenses,
    analyzedExpenses,
    modalTypeFilter,
    modalCategoryFilter,
    modalSearch,
  ]);

  // إعادة ضبط فلاتر النافذة عند فتح نافذة جديدة
  const handleOpenModal = (modalName) => {
    setModalSearch('');
    setModalCategoryFilter('all');
    setModalTypeFilter('all');
    setActiveModal(modalName);
  };

  // معالجات النافذة المنبثقة للتقويم المخصص
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

  // طباعة التقرير الشامل
  const handlePrintFullReport = useCallback(() => {
    setPrintDocumentProps({
      title: 'تقرير المصاريف والمنصرفات الشامل',
      subtitle: `كشف حركة المصاريف الثابتة والمتغيرة - ${periodLabel}`,
      reportCode: `REP-EXP-ALL-${Date.now().toString().slice(-6)}`,
      filterDescription: `كافة المصاريف المسجلة خلال: ${periodLabel}`,
      kpis: [
        { label: 'إجمالي كافة المصاريف', value: totalExpensesAmount, currency: 'د.ع', highlight: true },
        { label: 'المصاريف الثابتة', value: totalFixedAmount, currency: 'د.ع' },
        { label: 'المصاريف المتغيرة (النثريات)', value: totalSundryAmount, currency: 'د.ع' },
        { label: 'عدد القيود المسجلة', value: analyzedExpenses.length },
      ],
      columns: [
        { header: 'ت', key: 'index', align: 'center', render: (_, __, idx) => idx + 1, isMono: true },
        { header: 'التاريخ', key: 'dateStr', isMono: true, render: (v, r) => `${v || '—'} ${r.dayName ? `(${r.dayName})` : ''}` },
        { header: 'عنوان وبند المصروف', key: 'title', isBold: true },
        {
          header: 'النوع',
          key: 'typeLabel',
          render: (_, r) => (r.isFixed ? '🏢 ثابتة' : '☕ متغيرة'),
        },
        { header: 'التصنيف', key: 'category' },
        { header: 'المبلغ', key: 'numAmount', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
        { header: 'المسؤول / المشتري', key: 'buyerName' },
        { header: 'ملاحظات', key: 'notes' },
      ],
      data: analyzedExpenses,
      totals: {
        title: 'المجموع الإجمالي لكافة المصاريف',
        numAmount: `${formatIQD(totalExpensesAmount)} د.ع`,
      },
      expensesBreakdown: allCategoryBreakdown,
      detailedExpenses: analyzedExpenses,
    });
  }, [
    periodLabel,
    totalExpensesAmount,
    totalFixedAmount,
    totalSundryAmount,
    analyzedExpenses,
    allCategoryBreakdown,
  ]);

  // طباعة تقرير مخصص لكل نافذة
  const handlePrintModalReport = (modalName) => {
    if (modalName === 'fixed') {
      setPrintDocumentProps({
        title: 'تقرير المصاريف الثابتة والتشغيلية',
        subtitle: `كشف الالتزامات الدورية والمصاريف الثابتة - ${periodLabel}`,
        reportCode: `REP-EXP-FIX-${Date.now().toString().slice(-6)}`,
        filterDescription: `المصاريف الثابتة خلال: ${periodLabel}${modalCategoryFilter !== 'all' ? ` | البند: ${modalCategoryFilter}` : ''}`,
        kpis: [
          { label: 'إجمالي المصاريف الثابتة', value: totalFixedAmount, currency: 'د.ع', highlight: true },
          { label: 'النسبة من الإجمالي', value: `${fixedPercentage}%` },
          { label: 'عدد القيود', value: modalFilteredExpenses.length },
        ],
        columns: [
          { header: 'ت', key: 'index', align: 'center', render: (_, __, idx) => idx + 1, isMono: true },
          { header: 'التاريخ', key: 'dateStr', isMono: true, render: (v, r) => `${v || '—'} ${r.dayName ? `(${r.dayName})` : ''}` },
          { header: 'عنوان وبند المصروف', key: 'title', isBold: true },
          { header: 'التصنيف', key: 'category' },
          { header: 'المبلغ', key: 'numAmount', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'المسؤول / المشتري', key: 'buyerName' },
          { header: 'ملاحظات', key: 'notes' },
        ],
        data: modalFilteredExpenses,
        totals: {
          title: 'إجمالي المصاريف الثابتة',
          numAmount: `${formatIQD(modalFilteredExpenses.reduce((s, x) => s + x.numAmount, 0))} د.ع`,
        },
      });
    } else if (modalName === 'variable') {
      setPrintDocumentProps({
        title: 'تقرير المصاريف المتغيرة (النثريات)',
        subtitle: `كشف النثريات والمنصرفات اليومية - ${periodLabel}`,
        reportCode: `REP-EXP-VAR-${Date.now().toString().slice(-6)}`,
        filterDescription: `المصاريف المتغيرة خلال: ${periodLabel}${modalCategoryFilter !== 'all' ? ` | البند: ${modalCategoryFilter}` : ''}`,
        kpis: [
          { label: 'إجمالي المصاريف المتغيرة', value: totalSundryAmount, currency: 'د.ع', highlight: true },
          { label: 'النسبة من الإجمالي', value: `${sundryPercentage}%` },
          { label: 'عدد القيود', value: modalFilteredExpenses.length },
        ],
        columns: [
          { header: 'ت', key: 'index', align: 'center', render: (_, __, idx) => idx + 1, isMono: true },
          { header: 'التاريخ', key: 'dateStr', isMono: true, render: (v, r) => `${v || '—'} ${r.dayName ? `(${r.dayName})` : ''}` },
          { header: 'عنوان وبند المصروف', key: 'title', isBold: true },
          { header: 'التصنيف', key: 'category' },
          { header: 'المبلغ', key: 'numAmount', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'المسؤول / المشتري', key: 'buyerName' },
          { header: 'ملاحظات', key: 'notes' },
        ],
        data: modalFilteredExpenses,
        totals: {
          title: 'إجمالي المصاريف المتغيرة',
          numAmount: `${formatIQD(modalFilteredExpenses.reduce((s, x) => s + x.numAmount, 0))} د.ع`,
        },
      });
    } else {
      handlePrintFullReport();
    }
  };

  // المزامنة مع الشريط العلوي
  useEffect(() => {
    if (!setReportMeta) return;
    setReportMeta({
      title: 'تقرير المصاريف',
      code: 'SEC-EXP-01',
      onPrint: handlePrintFullReport,
    });
  }, [setReportMeta, handlePrintFullReport]);

  return (
    <div className="w-full space-y-4 text-slate-800" dir="rtl">
      {/* 1. الشريط العلوي الرئيسي (مطابق 100% للرسم والتقرير المرفق) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* عنوان التقرير */}
          <div className="flex items-center gap-2.5">
            {onBackToDepartments && (
              <button
                type="button"
                onClick={onBackToDepartments}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                title="رجوع لأقسام التقارير"
              >
                ➔
              </button>
            )}
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-lg md:text-xl font-black text-slate-900">
              تقرير المصاريف
            </h1>
          </div>

          {/* محدد المدة: اليوم | هذا الشهر | مخصص */}
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

            {/* زر مخصص مع القائمة المنبثقة للتقويم */}
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

              {/* النافذة المنبثقة الملتصقة بالزر */}
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
                    {/* التبويب الداخلي: بالأشهر vs بالأيام */}
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

                        {/* مفتاح نمط الاختيار: شهر واحد vs فترة */}
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

                        {/* شبكة أرقام الأشهر (1 إلى 12) */}
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
                      /* تبويب الأيام */
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

                    {/* ملخص الفترة المختارة */}
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

                    {/* أزرار الإجراء */}
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
                        تطبيق الفلتر
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* زر طباعة التقرير الشامل (مطابق تماماً للزر الأسود مع الأيقونة الخضراء بالصورة) */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrintFullReport}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>طباعة التقرير الشامل (A4)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. البطاقات الثلاث الرئيسية (إجمالي المصاريف، المصاريف الثابتة، المصاريف المتغيرة) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* البطاقة 1: إجمالي كافة المصاريف */}
        <div
          onClick={() => handleOpenModal('all')}
          className="group relative bg-white hover:bg-sky-50/40 rounded-2xl border-2 border-sky-300 hover:border-sky-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-800 border border-sky-300 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
              {analyzedExpenses.length} قيد مسجل
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">إجمالي كافة المصاريف</h2>
            <div className="text-xl sm:text-2xl font-black text-sky-950 font-mono tracking-tight">
              {formatIQD(totalExpensesAmount)} <span className="text-xs font-bold font-sans text-sky-700">د.ع</span>
            </div>
          </div>
        </div>

        {/* البطاقة 2: المصاريف الثابتة والتشغيلية */}
        <div
          onClick={() => handleOpenModal('fixed')}
          className="group relative bg-white hover:bg-amber-50/40 rounded-2xl border-2 border-amber-300 hover:border-amber-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {fixedPercentage}% من الإجمالي
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">المصاريف الثابتة والتشغيلية</h2>
            <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono tracking-tight">
              {formatIQD(totalFixedAmount)} <span className="text-xs font-bold font-sans text-amber-700">د.ع</span>
            </div>
          </div>
        </div>

        {/* البطاقة 3: المصاريف المتغيرة (النثريات) */}
        <div
          onClick={() => handleOpenModal('variable')}
          className="group relative bg-white hover:bg-rose-50/40 rounded-2xl border-2 border-rose-300 hover:border-rose-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              {sundryPercentage}% من الإجمالي
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">المصاريف المتغيرة (النثريات)</h2>
            <div className="text-xl sm:text-2xl font-black text-rose-950 font-mono tracking-tight">
              {formatIQD(totalSundryAmount)} <span className="text-xs font-bold font-sans text-rose-700">د.ع</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MODAL 1: تفاصيل كافة المصاريف (ALL EXPENSES MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'all' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* رأس النافذة */}
            <div className="p-4 bg-sky-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-800 text-sky-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل وسجل كافة المصاريف</h2>
                  <p className="text-xs text-sky-200 font-medium">
                    كشف شامل لجميع القيود المسجلة خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintModalReport('all')}
                  className="px-3 py-1.5 bg-sky-800 hover:bg-sky-700 text-white text-xs font-bold rounded-lg border border-sky-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-sky-800 hover:bg-sky-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* شريط الفلاتر والبحث */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="ابحث بالبند، التصنيف، المسؤول، أو الملاحظات..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => setModalSearch('')}
                    className="text-slate-400 hover:text-slate-600 font-bold px-1"
                  >
                    مسح
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">النوع:</span>
                  <select
                    value={modalTypeFilter}
                    onChange={(e) => setModalTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                  >
                    <option value="all">كافة الأنواع</option>
                    <option value="fixed">🏢 ثابتة فقط</option>
                    <option value="variable">☕ متغيرة فقط</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">التصنيف:</span>
                  <select
                    value={modalCategoryFilter}
                    onChange={(e) => setModalCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                  >
                    <option value="all">كافة التصنيفات</option>
                    {allCategoryBreakdown.map((c) => (
                      <option key={c.category} value={c.category}>
                        {c.category} ({c.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* جدول السجلات */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                    <th className="py-2.5 px-3 font-bold">التاريخ واليوم</th>
                    <th className="py-2.5 px-3 font-bold">عنوان وبند المصروف</th>
                    <th className="py-2.5 px-3 font-bold text-center">نوع المصروف</th>
                    <th className="py-2.5 px-3 font-bold">التصنيف</th>
                    <th className="py-2.5 px-3 font-bold text-left">المبلغ المنصرف</th>
                    <th className="py-2.5 px-3 font-bold">المسؤول / المشتري</th>
                    <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد مصاريف مطابقة لمعايير البحث في هذه الفترة.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredExpenses.map((e, idx) => (
                      <tr key={e.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          <span className="font-bold">{e.dateStr || '—'}</span>
                          {e.dayName && <span className="text-[10px] text-slate-400 block">{e.dayName}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span>{e.typeIcon}</span>
                            <span className="font-black text-slate-900">{e.title}</span>
                          </div>
                          {e.periodCovered && (
                            <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-bold mt-0.5 inline-block">
                              🗓️ {e.periodCovered}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${e.typeBadgeColor}`}>
                            {e.isFixed ? '🏢 ثابتة' : '☕ متغيرة'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">
                          {e.category || 'عام'}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900 text-sm">
                          {formatIQD(e.numAmount)} د.ع
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {e.buyerName || 'قاصة المحل'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                          {e.notes || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {modalFilteredExpenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                      <td colSpan={5} className="py-3 px-3 text-right">
                        المجموع الإجمالي ({modalFilteredExpenses.length} قيد)
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-slate-950 text-sm">
                        {formatIQD(modalFilteredExpenses.reduce((s, x) => s + x.numAmount, 0))} د.ع
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* أسفل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>إجمالي كافة المصاريف في هذه الفترة: {formatIQD(totalExpensesAmount)} د.ع</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MODAL 2: تفاصيل وبنود المصاريف الثابتة (FIXED MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'fixed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* رأس النافذة */}
            <div className="p-4 bg-amber-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-800 text-amber-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل وبنود المصاريف الثابتة والتشغيلية</h2>
                  <p className="text-xs text-amber-200 font-medium">
                    كشف الالتزامات الدورية (رواتب، إيجار، كهرباء، إنترنت، تشغيل...) خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintModalReport('fixed')}
                  className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-xs font-bold rounded-lg border border-amber-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-amber-800 hover:bg-amber-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* بنود المصاريف الثابتة فقط (أزرار سريعة لتصفية البنود) */}
            <div className="p-3 bg-amber-50/50 border-b border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>بنود وتصنيفات المصاريف الثابتة:</span>
                  <span className="text-[10px] font-mono bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                    {fixedCategoryBreakdown.length} بنود
                  </span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-900">
                  إجمالي الثابتة: <strong>{formatIQD(totalFixedAmount)} د.ع</strong>
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    modalCategoryFilter === 'all'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  كافة البنود الثابتة ({fixedExpenses.length})
                </button>
                {fixedCategoryBreakdown.map((cat) => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => setModalCategoryFilter(modalCategoryFilter === cat.category ? 'all' : cat.category)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      modalCategoryFilter === cat.category
                        ? 'bg-amber-700 text-white shadow-xs ring-2 ring-amber-400'
                        : 'bg-white text-slate-700 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.category}</span>
                    <span className="font-mono text-[10px] opacity-80">({formatIQD(cat.totalAmount)} د.ع)</span>
                  </button>
                ))}
              </div>
            </div>

            {/* شريط البحث */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs">
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="ابحث في قيود المصاريف الثابتة (البند، الملاحظات، المسؤول...)"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch('')}
                  className="text-slate-400 hover:text-slate-600 font-bold px-1"
                >
                  مسح
                </button>
              )}
            </div>

            {/* جدول سجلات المصاريف الثابتة */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                    <th className="py-2.5 px-3 font-bold">التاريخ واليوم</th>
                    <th className="py-2.5 px-3 font-bold">عنوان وبند المصروف</th>
                    <th className="py-2.5 px-3 font-bold">التصنيف</th>
                    <th className="py-2.5 px-3 font-bold text-left">المبلغ المنصرف</th>
                    <th className="py-2.5 px-3 font-bold">المسؤول / المشتري</th>
                    <th className="py-2.5 px-3 font-bold">الفترة المغطاة / ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد مصاريف ثابتة مسجلة تطابق البحث في هذه الفترة.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredExpenses.map((e, idx) => (
                      <tr key={e.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          <span className="font-bold">{e.dateStr || '—'}</span>
                          {e.dayName && <span className="text-[10px] text-slate-400 block">{e.dayName}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span>{e.typeIcon}</span>
                            <span className="font-black text-slate-900">{e.title}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">
                          <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[10px]">
                            {e.category || 'عام'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-amber-950 text-sm">
                          {formatIQD(e.numAmount)} د.ع
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {e.buyerName || 'قاصة المحل'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                          {e.notes || (e.periodCovered ? `تغطية ${e.periodCovered}` : '—')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {modalFilteredExpenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-amber-50 border-t-2 border-slate-800 font-black text-slate-900">
                      <td colSpan={4} className="py-3 px-3 text-right">
                        المجموع الإجمالي للمصاريف الثابتة ({modalFilteredExpenses.length} قيد)
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-amber-950 text-sm">
                        {formatIQD(modalFilteredExpenses.reduce((s, x) => s + x.numAmount, 0))} د.ع
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* أسفل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>إجمالي المصاريف الثابتة: {formatIQD(totalFixedAmount)} د.ع ({fixedPercentage}% من الإجمالي)</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL 3: تفاصيل وبنود المصاريف المتغيرة (VARIABLE MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'variable' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* رأس النافذة */}
            <div className="p-4 bg-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-800 text-rose-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل وبنود المصاريف المتغيرة (النثريات اليومية)</h2>
                  <p className="text-xs text-rose-200 font-medium">
                    كشف نثريات المحل والضيافة والغداء والمشتريات الموقعية خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintModalReport('variable')}
                  className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg border border-rose-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-rose-800 hover:bg-rose-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* بنود المصاريف المتغيرة فقط (أزرار سريعة لتصفية البنود) */}
            <div className="p-3 bg-rose-50/50 border-b border-rose-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                  <span>☕</span>
                  <span>بنود وتصنيفات المصاريف المتغيرة (النثريات):</span>
                  <span className="text-[10px] font-mono bg-rose-200/70 text-rose-900 px-2 py-0.5 rounded-full font-bold">
                    {sundryCategoryBreakdown.length} بنود
                  </span>
                </span>
                <span className="text-xs font-mono font-bold text-rose-900">
                  إجمالي النثريات: <strong>{formatIQD(totalSundryAmount)} د.ع</strong>
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    modalCategoryFilter === 'all'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  كافة بنود النثريات ({sundryExpenses.length})
                </button>
                {sundryCategoryBreakdown.map((cat) => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => setModalCategoryFilter(modalCategoryFilter === cat.category ? 'all' : cat.category)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      modalCategoryFilter === cat.category
                        ? 'bg-rose-700 text-white shadow-xs ring-2 ring-rose-400'
                        : 'bg-white text-slate-700 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.category}</span>
                    <span className="font-mono text-[10px] opacity-80">({formatIQD(cat.totalAmount)} د.ع)</span>
                  </button>
                ))}
              </div>
            </div>

            {/* شريط البحث */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs">
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="ابحث في نثريات المحل (البند، الملاحظات، المسؤول...)"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              {modalSearch && (
                <button
                  type="button"
                  onClick={() => setModalSearch('')}
                  className="text-slate-400 hover:text-slate-600 font-bold px-1"
                >
                  مسح
                </button>
              )}
            </div>

            {/* جدول سجلات المصاريف المتغيرة */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                    <th className="py-2.5 px-3 font-bold">التاريخ واليوم</th>
                    <th className="py-2.5 px-3 font-bold">عنوان وبند المصروف</th>
                    <th className="py-2.5 px-3 font-bold">التصنيف</th>
                    <th className="py-2.5 px-3 font-bold text-left">المبلغ المنصرف</th>
                    <th className="py-2.5 px-3 font-bold">المسؤول / المشتري</th>
                    <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد نثريات مسجلة تطابق البحث في هذه الفترة.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredExpenses.map((e, idx) => (
                      <tr key={e.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          <span className="font-bold">{e.dateStr || '—'}</span>
                          {e.dayName && <span className="text-[10px] text-slate-400 block">{e.dayName}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span>{e.typeIcon}</span>
                            <span className="font-black text-slate-900">{e.title}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-700">
                          <span className="bg-rose-50 text-rose-900 border border-rose-200 px-2 py-0.5 rounded text-[10px]">
                            {e.category || 'عام'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-rose-950 text-sm">
                          {formatIQD(e.numAmount)} د.ع
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {e.buyerName || 'قاصة المحل'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                          {e.notes || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {modalFilteredExpenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-rose-50 border-t-2 border-slate-800 font-black text-slate-900">
                      <td colSpan={4} className="py-3 px-3 text-right">
                        المجموع الإجمالي للنثريات ({modalFilteredExpenses.length} قيد)
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-rose-950 text-sm">
                        {formatIQD(modalFilteredExpenses.reduce((s, x) => s + x.numAmount, 0))} د.ع
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* أسفل النافذة */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>إجمالي المصاريف المتغيرة: {formatIQD(totalSundryAmount)} د.ع ({sundryPercentage}% من الإجمالي)</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 7. وثيقة الطباعة الرسمية بصيغة PDF الرسمية A4 */}
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
