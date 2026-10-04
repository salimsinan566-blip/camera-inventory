import React, { useState, useMemo } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import {
  addExpense,
  updateExpense,
  deleteExpense,
  DAILY_EXPENSE_PRESETS,
  SHOP_EXPENSE_PRESETS
} from '../services/expensesService';
import { useUI } from '../contexts/UIContext';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function ExpensesScreen({ user }) {
  const { expenses, stats, loading } = useExpenses();
  const { toast, confirm } = useUI();

  // Main Active Tab: 'daily' | 'shop' | 'all'
  const [activeTab, setActiveTab] = useState('daily');

  // Form State
  const defaultDaily = DAILY_EXPENSE_PRESETS[0];
  const [selectedPresetId, setSelectedPresetId] = useState(defaultDaily.id);
  const [title, setTitle] = useState(defaultDaily.title);
  const [category, setCategory] = useState(defaultDaily.category);
  const [expenseType, setExpenseType] = useState('daily'); // 'daily' | 'shop'
  const [amount, setAmount] = useState(defaultDaily.defaultAmount || '');
  const [periodCovered, setPeriodCovered] = useState('');
  const [buyerName, setBuyerName] = useState(user?.displayName || user?.email?.split('@')[0] || '');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Edit State
  const [editingExpense, setEditingExpense] = useState(null);

  // Filter State (Default is 'today' so table always defaults to today's expenses)
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today'); // Default: 'today'

  // When switching top tabs, update form's expenseType and default category
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'daily') {
      setExpenseType('daily');
      const firstDaily = DAILY_EXPENSE_PRESETS[0];
      setSelectedPresetId(firstDaily.id);
      setTitle(firstDaily.title);
      setCategory(firstDaily.category);
      if (!amount || Number(amount) === 0) setAmount(firstDaily.defaultAmount || '');
    } else if (tab === 'shop') {
      setExpenseType('shop');
      const firstShop = SHOP_EXPENSE_PRESETS[0];
      setSelectedPresetId(firstShop.id);
      setTitle(firstShop.title);
      setCategory(firstShop.category);
      if (!amount || Number(amount) === 0) setAmount(firstShop.defaultAmount || '');
    }
  };

  // Toggle handler: Fixed Monthly Expenses vs Today's Expenses
  const handleToggleShopFixed = () => {
    if (dateFilter === 'month' && activeTab === 'shop') {
      // Toggle OFF: Revert back to today's expenses
      setDateFilter('today');
      handleTabChange('daily');
    } else {
      // Toggle ON: Show monthly fixed obligations
      setDateFilter('month');
      handleTabChange('shop');
    }
  };

  // Toggle handler: Variable Monthly Expenses vs Today's Expenses
  const handleToggleMonthlyVariable = () => {
    if (dateFilter === 'month' && activeTab === 'daily') {
      // Toggle OFF: Revert back to today's expenses
      setDateFilter('today');
      handleTabChange('daily');
    } else {
      // Toggle ON: Show monthly variable sundries
      setDateFilter('month');
      handleTabChange('daily');
    }
  };

  // Select Today's expenses directly
  const handleSelectToday = () => {
    setDateFilter('today');
    handleTabChange('daily');
  };

  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id);
    if (preset.id === 'daily_other' || preset.id === 'shop_other') {
      setTitle('');
      setCategory(preset.category);
    } else {
      setTitle(preset.title);
      setCategory(preset.category);
    }
    if (preset.defaultAmount > 0) {
      setAmount(preset.defaultAmount);
    }
  };

  const handleResetForm = () => {
    const defaultPreset = expenseType === 'shop' ? SHOP_EXPENSE_PRESETS[0] : DAILY_EXPENSE_PRESETS[0];
    setSelectedPresetId(defaultPreset.id);
    setTitle(defaultPreset.title);
    setCategory(defaultPreset.category);
    setAmount(defaultPreset.defaultAmount || '');
    setPeriodCovered('');
    setBuyerName('');
    setNotes('');
    setEditingExpense(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim()) {
      toast('يرجى كتابة أو اختيار نوع المصروف', 'error');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      toast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'error');
      return;
    }
    if (numAmount % 250 !== 0) {
      toast('يرجى إدخال المبلغ بمضاعفات الـ 250 دينار (مثل: 250، 500، 1000، 2000...)', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          title: title.trim(),
          category: category.trim(),
          expenseType: expenseType || 'daily',
          paymentSource: 'cash_drawer',
          amount: numAmount,
          periodCovered: (periodCovered || '').trim(),
          buyerName: buyerName.trim() || 'المحل',
          notes: notes.trim(),
          date: expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString()
        });
        toast('تم تحديث المصروف بنجاح!', 'success');
      } else {
        await addExpense({
          title: title.trim(),
          category: category.trim(),
          expenseType: expenseType || 'daily',
          paymentSource: 'cash_drawer',
          amount: numAmount,
          periodCovered: (periodCovered || '').trim(),
          buyerName: buyerName.trim() || 'المحل',
          notes: notes.trim(),
          date: expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString(),
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
        });
        toast(`تم تسجيل مصروف "${title}" بمبلغ ${formatIQD(numAmount)} د.ع (من قاصة المحل) بنجاح! 💸`, 'success');
      }
      handleResetForm();
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (exp) => {
    setEditingExpense(exp);
    const expType = exp.expenseType || (SHOP_EXPENSE_PRESETS.some(p => p.category === exp.category) ? 'shop' : 'daily');
    setExpenseType(expType);
    setTitle(exp.title || '');
    setCategory(exp.category || (expType === 'shop' ? 'مصاريف تشغيلية' : 'نثريات عامة'));
    const presets = expType === 'shop' ? SHOP_EXPENSE_PRESETS : DAILY_EXPENSE_PRESETS;
    const otherId = expType === 'shop' ? 'shop_other' : 'daily_other';
    const matchedPreset = presets.find(p => p.title === exp.title && p.id !== otherId);
    setSelectedPresetId(matchedPreset ? matchedPreset.id : otherId);
    setAmount(exp.amount || '');
    setPeriodCovered(exp.periodCovered || '');
    setBuyerName(exp.buyerName || '');
    setNotes(exp.notes || '');
    setExpenseDate((exp.date || exp.createdAt || '').slice(0, 10));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (exp) => {
    confirm(
      'حذف المصروف',
      `هل أنت متأكد من حذف مصروف "${exp.title}" بمبلغ ${formatIQD(exp.amount)} د.ع؟`,
      async () => {
        try {
          await deleteExpense(exp.id);
          toast('تم حذف المصروف بنجاح', 'success');
          if (editingExpense?.id === exp.id) handleResetForm();
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    return expenses.filter(exp => {
      const expDate = (exp.date || exp.createdAt || '').slice(0, 10);
      const expMonth = (exp.date || exp.createdAt || '').slice(0, 7);
      const expType = exp.expenseType || (SHOP_EXPENSE_PRESETS.some(p => p.category === exp.category) ? 'shop' : 'daily');

      // Tab Filter
      if (activeTab === 'daily' && expType !== 'daily') return false;
      if (activeTab === 'shop' && expType !== 'shop') return false;

      // Date Filter
      if (dateFilter === 'today' && expDate !== todayStr) return false;
      if (dateFilter === 'month' && expMonth !== monthStr) return false;

      // Category Filter
      if (categoryFilter !== 'all' && exp.category !== categoryFilter) return false;

      // Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const titleMatch = exp.title?.toLowerCase().includes(term);
        const buyerMatch = exp.buyerName?.toLowerCase().includes(term);
        const notesMatch = exp.notes?.toLowerCase().includes(term);
        const periodMatch = exp.periodCovered?.toLowerCase().includes(term);
        return titleMatch || buyerMatch || notesMatch || periodMatch;
      }

      return true;
    });
  }, [expenses, activeTab, searchTerm, categoryFilter, dateFilter]);

  const filteredTotalAmount = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [filteredExpenses]);

  // Totals & Breakdown: Today (Variable Sundries Only) & Current Month (Fixed commitments vs Variable sundries)
  const {
    todayVarTotal,
    todayVarCount,
    monthTotal,
    monthCount,
    monthFixedTotal,
    monthVariableTotal
  } = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    let tVarTotal = 0;
    let tVarCount = 0;
    let tVarDrawer = 0;
    let tVarMgmt = 0;

    let mTotal = 0;
    let mCount = 0;
    let mFixed = 0;
    let mVar = 0;
    let mDrawer = 0;
    let mMgmt = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      const dateStr = (e.date || e.createdAt || '').slice(0, 10);
      const monthStr = (e.date || e.createdAt || '').slice(0, 7);
      const source = e.paymentSource || 'cash_drawer';
      const isFixed =
        e.expenseType === 'shop' ||
        SHOP_EXPENSE_PRESETS.some((p) => p.category === e.category) ||
        ['إيجار عقار', 'كهرباء ومولد', 'خدمات وإنترنت', 'بلدية ورسوم', 'رسوم حكومية', 'صيانة وتجهيزات'].includes(e.category);

      // Today: ONLY variable sundries (نثريات فقط - لا تجمع معها الثابتة)
      if (dateStr === todayStr && !isFixed) {
        tVarTotal += amt;
        tVarCount += 1;
        if (source === 'management' || source === 'mastercard') {
          tVarMgmt += amt;
        } else {
          tVarDrawer += amt;
        }
      }

      // Current Month
      if (monthStr === currentMonthStr) {
        mTotal += amt;
        mCount += 1;
        if (isFixed) {
          mFixed += amt;
        } else {
          mVar += amt;
        }

        if (source === 'management' || source === 'mastercard') {
          mMgmt += amt;
        } else {
          mDrawer += amt;
        }
      }
    });

    return {
      todayVarTotal: tVarTotal,
      todayVarCount: tVarCount,
      monthTotal: mTotal,
      monthCount: mCount,
      monthFixedTotal: mFixed,
      monthVariableTotal: mVar
    };
  }, [expenses]);

  return (
    <div className="space-y-4 animate-fade-in p-2 md:p-5" dir="rtl">
      {/* Stats Cards: Compact & Streamlined 2 Cards */}
      {/* Stats Cards: Compact & Streamlined 2 Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Card 1: مصاريف اليوم */}
        <div
          onClick={handleSelectToday}
          className={`lg:col-span-5 p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden bg-white ${
            dateFilter === 'today'
              ? 'border-slate-800 shadow-sm ring-1 ring-slate-800/15'
              : 'border-slate-200 hover:border-slate-300 shadow-2xs'
          }`}
          title="اضغط لعرض مصاريف اليوم فقط في الجدول"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                dateFilter === 'today' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                ☕
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>مصاريف اليوم (نثريات)</span>
                </h3>
              </div>
            </div>
            <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-bold border border-slate-200">
              {todayVarCount} حركات
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
              {formatIQD(todayVarTotal)}
            </span>
            <span className="text-xs font-bold text-slate-500">د.ع</span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-600">
            <span>تُخصم من قاصة المحل</span>
            <span className="font-mono font-bold text-slate-800">{todayVarCount} بنود مسجلة</span>
          </div>
          <div className={`absolute top-0 right-0 w-1 h-full ${dateFilter === 'today' ? 'bg-slate-900' : 'bg-transparent'}`} />
        </div>

        {/* Card 2: كارت مصاريف شهرية */}
        <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden">
          {/* Card Header with Month Total and "All" Button */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-sm">
                📊
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  المصاريف الشهرية ({new Date().toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' })})
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  إجمالي الشهر: <b className="font-mono text-slate-900 font-bold">{formatIQD(monthTotal)} د.ع</b>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all');
                  handleTabChange('all');
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                  dateFilter === 'all' && activeTab === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                عرض كل التواريخ
              </button>
            </div>
          </div>

          {/* Interactive Toggle Buttons for Fixed vs Variable */}
          <div className="grid grid-cols-2 gap-2 my-1">
            {/* زر المصاريف الثابتة */}
            <button
              type="button"
              onClick={handleToggleShopFixed}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                dateFilter === 'month' && activeTab === 'shop'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-1 ring-slate-800'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              }`}
              title="اضغط لعرض مصاريف الشهر الثابتة في الجدول"
            >
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="flex items-center gap-1">
                  <span>🏢</span>
                  <span>مصاريف ثابتة (الالتزامات)</span>
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  dateFilter === 'month' && activeTab === 'shop'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {dateFilter === 'month' && activeTab === 'shop' ? 'مفعل ✓' : (monthTotal > 0 ? `${((monthFixedTotal / monthTotal) * 100).toFixed(0)}%` : '0%')}
                </span>
              </div>
              <div className="mt-1 font-mono font-bold text-lg sm:text-xl">
                {formatIQD(monthFixedTotal)} <span className="text-[10px] font-normal">د.ع</span>
              </div>
            </button>

            {/* زر المصاريف المتغيرة */}
            <button
              type="button"
              onClick={handleToggleMonthlyVariable}
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                dateFilter === 'month' && activeTab === 'daily'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-1 ring-slate-800'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              }`}
              title="اضغط لعرض مصاريف الشهر المتغيرة في الجدول"
            >
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="flex items-center gap-1">
                  <span>☕</span>
                  <span>مصاريف متغيرة (النثريات)</span>
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                  dateFilter === 'month' && activeTab === 'daily'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}>
                  {dateFilter === 'month' && activeTab === 'daily' ? 'مفعل ✓' : (monthTotal > 0 ? `${((monthVariableTotal / monthTotal) * 100).toFixed(0)}%` : '0%')}
                </span>
              </div>
              <div className="mt-1 font-mono font-bold text-lg sm:text-xl">
                {formatIQD(monthVariableTotal)} <span className="text-[10px] font-normal">د.ع</span>
              </div>
            </button>
          </div>

          {/* Footer note */}
          <div className="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span>تُصرف من قاصة المحل</span>
            <span className="font-mono">إجمالي البنود: {monthCount}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form on the Right / Table on the Left */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col h-fit">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>{editingExpense ? '✏️' : '➕'}</span>
              <span>
                {editingExpense
                  ? 'تعديل بيانات المصروف'
                  : expenseType === 'shop'
                  ? 'تسجيل مصروف محل أو التزام تشغيلي'
                  : 'تسجيل مصروف يومي ونثريات'}
              </span>
            </h3>
            {editingExpense && (
              <button
                type="button"
                onClick={handleResetForm}
                className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          <form onSubmit={handleSaveExpense} className="space-y-3.5">
            {/* Expense Type Selector (Daily vs Shop) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">نطاق المصروف</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('daily');
                    const p = DAILY_EXPENSE_PRESETS[0];
                    setSelectedPresetId(p.id);
                    setTitle(p.title);
                    setCategory(p.category);
                    if (!amount || Number(amount) === 0) setAmount(p.defaultAmount || '');
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    expenseType === 'daily'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>☕</span>
                  <span>مصروف يومي / نثريات</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('shop');
                    const p = SHOP_EXPENSE_PRESETS[0];
                    setSelectedPresetId(p.id);
                    setTitle(p.title);
                    setCategory(p.category);
                    if (!amount || Number(amount) === 0) setAmount(p.defaultAmount || '');
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    expenseType === 'shop'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>🏢</span>
                  <span>مصروف محل / التزام</span>
                </button>
              </div>
            </div>

            {/* Daily Expense Mode: Preset Options */}
            {expenseType === 'daily' ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  نوع المصروف:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {DAILY_EXPENSE_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id || (preset.id !== 'daily_other' && title === preset.title);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium'
                        }`}
                      >
                        <span className="text-lg">{preset.icon}</span>
                        <span className="text-[11px] leading-tight truncate w-full">{preset.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* When selecting "+" (daily_other): Custom Title Input */}
                {selectedPresetId === 'daily_other' && (
                  <div className="pt-1 space-y-1 animate-fade-in">
                    <label className="block text-xs font-bold text-slate-700">
                      اسم المصروف *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="اكتب نوع المصروف..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* Shop Expense Mode: Preset Options */
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  نوع الالتزام:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {SHOP_EXPENSE_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id || (preset.id !== 'shop_other' && title === preset.title);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium'
                        }`}
                      >
                        <span className="text-lg">{preset.icon}</span>
                        <span className="text-[11px] leading-tight truncate w-full">{preset.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* When selecting "+" (shop_other): Custom Title Input */}
                {selectedPresetId === 'shop_other' && (
                  <div className="pt-1 space-y-1 animate-fade-in">
                    <label className="block text-xs font-bold text-slate-700">
                      اسم الالتزام التشغيلي *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="اكتب نوع الالتزام (مثال: تأمين، اشتراك سنوي...)"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                    />
                  </div>
                )}

                {/* Period Covered */}
                <div className="pt-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الفترة المغطاة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={periodCovered}
                    onChange={(e) => setPeriodCovered(e.target.value)}
                    placeholder="مثال: شهر آب 2026"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                  />
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (د.ع) *</label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
              />
            </div>

            {/* Buyer Name & Date */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الشخص الصارف</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="الاسم..."
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات..."
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-800 focus:bg-white"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <span>{editingExpense ? '💾 حفظ التعديلات' : '➕ تسجيل المصروف'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Expenses List & Audit Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Filters Bar */}
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="بحث باسم المصروف، الصارف، الفترة، أو الملاحظة..."
                  className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-800"
                />
                <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
              >
                <option value="today">مصاريف اليوم</option>
                <option value="month">مصاريف هذا الشهر</option>
                <option value="all">كافة التواريخ</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
              >
                <option value="all">جميع التصنيفات</option>
                <option value="طعام وغداء">طعام وغداء</option>
                <option value="مشروبات ومياه">مشروبات ومياه</option>
                <option value="مستلزمات ونظافة">مستلزمات ونظافة</option>
                <option value="نقل ومواصلات">نقل ومواصلات</option>
                <option value="إيجار عقار">إيجار عقار</option>
                <option value="بلدية ورسوم">بلدية ورسوم</option>
                <option value="خدمات وإنترنت">خدمات وإنترنت</option>
                <option value="كهرباء ومولد">كهرباء ومولد</option>
                <option value="صيانة وتجهيزات">صيانة وتجهيزات</option>
                <option value="رسوم حكومية">رسوم حكومية</option>
                <option value="مصاريف تشغيلية">مصاريف تشغيلية</option>
                <option value="نثريات عامة">نثريات عامة</option>
              </select>

              {/* Quick return button to today's expenses */}
              {dateFilter !== 'today' && (
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 px-3 py-2 rounded-xl border border-slate-300 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  title="الرجوع السريع لعرض مصاريف اليوم فقط"
                >
                  <span>↩️</span>
                  <span>مصاريف اليوم</span>
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center my-auto">
              <span className="text-4xl block mb-2">💸</span>
              <p className="text-xs font-bold text-slate-600">لا توجد مصاريف مطابقة للبحث أو التصفية.</p>
              {dateFilter !== 'today' && (
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="mt-3 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-300 transition-all"
                >
                  عرض مصاريف اليوم
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-800 text-xs font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">التاريخ</th>
                      <th className="py-3.5 px-4">المصروف والبيان</th>
                      <th className="py-3.5 px-4">النوع / التصنيف</th>
                      <th className="py-3.5 px-4">الصارف</th>
                      <th className="py-3.5 px-4">المبلغ</th>
                      <th className="py-3.5 px-4">الملاحظات</th>
                      <th className="py-3.5 px-4 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((exp) => {
                      const isShop = exp.expenseType === 'shop';

                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                            {exp.date ? new Date(exp.date).toLocaleDateString('ar-IQ') : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-slate-900">{exp.title}</span>
                              {exp.periodCovered && (
                                <span className="text-[10px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {exp.periodCovered}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isShop ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'
                              }`}>
                                {isShop ? '🏢 محل' : '☕ يومي'}
                              </span>
                              <span className="text-slate-700 text-xs font-medium">
                                {exp.category}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium whitespace-nowrap">
                            {exp.buyerName || 'المحل'}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-black text-slate-900 text-sm sm:text-base whitespace-nowrap">
                            {formatIQD(exp.amount)} <span className="text-[10px] font-bold text-slate-500">د.ع</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-xs max-w-[160px] truncate" title={exp.notes}>
                            {exp.notes || '—'}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditClick(exp)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="تعديل"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClick(exp)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="حذف"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Summary */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">عدد المصاريف المعروضة:</span>
                  <span className="font-mono font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                    {filteredExpenses.length} بند
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">إجمالي المبلغ:</span>
                  <span className="font-mono font-black text-slate-900 text-sm bg-white px-3 py-1 rounded-lg border border-slate-300 shadow-2xs">
                    {formatIQD(filteredTotalAmount)} د.ع
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
