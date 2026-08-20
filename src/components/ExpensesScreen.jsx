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
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('نثريات عامة');
  const [expenseType, setExpenseType] = useState('daily'); // 'daily' | 'shop'
  const [paymentSource, setPaymentSource] = useState('cash_drawer'); // 'cash_drawer' | 'management'
  const [amount, setAmount] = useState('');
  const [periodCovered, setPeriodCovered] = useState('');
  const [buyerName, setBuyerName] = useState(user?.displayName || user?.email?.split('@')[0] || '');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(null);

  // Edit State
  const [editingExpense, setEditingExpense] = useState(null);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentSourceFilter, setPaymentSourceFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'month'

  // When switching top tabs, update form's expenseType and default category
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'daily') {
      setExpenseType('daily');
      setCategory('نثريات عامة');
      setSelectedPresetId(null);
    } else if (tab === 'shop') {
      setExpenseType('shop');
      setCategory('إيجار عقار');
      setSelectedPresetId(null);
    }
  };

  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setCategory(preset.category);
    if (preset.defaultAmount > 0 && (!amount || Number(amount) === 0)) {
      setAmount(preset.defaultAmount);
    }
  };

  const handleResetForm = () => {
    setTitle('');
    setCategory(expenseType === 'shop' ? 'إيجار عقار' : 'نثريات عامة');
    setAmount('');
    setPeriodCovered('');
    setPaymentSource('cash_drawer');
    setNotes('');
    setSelectedPresetId(null);
    setEditingExpense(null);
    setExpenseDate(new Date().toISOString().slice(0, 10));
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim()) {
      toast('يرجى كتابة عنوان أو نوع المصروف', 'error');
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
          paymentSource: paymentSource || 'cash_drawer',
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
          paymentSource: paymentSource || 'cash_drawer',
          amount: numAmount,
          periodCovered: (periodCovered || '').trim(),
          buyerName: buyerName.trim() || 'المحل',
          notes: notes.trim(),
          date: expenseDate ? new Date(expenseDate).toISOString() : new Date().toISOString(),
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
        });
        const sourceLabel = paymentSource === 'management' ? 'من المدير' : 'من القاصة';
        toast(`تم تسجيل مصروف "${title}" بمبلغ ${formatIQD(numAmount)} د.ع (${sourceLabel}) بنجاح! 💸`, 'success');
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
    setTitle(exp.title || '');
    setExpenseType(exp.expenseType || (SHOP_EXPENSE_PRESETS.some(p => p.category === exp.category) ? 'shop' : 'daily'));
    setPaymentSource(exp.paymentSource || 'cash_drawer');
    setCategory(exp.category || 'نثريات عامة');
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

      // Payment Source Filter
      if (paymentSourceFilter !== 'all') {
        const pSource = exp.paymentSource || 'cash_drawer';
        if (pSource !== paymentSourceFilter) return false;
      }

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
  }, [expenses, activeTab, searchTerm, categoryFilter, paymentSourceFilter, dateFilter]);

  // Tab Totals Breakdown
  const { dailyTotal, shopTotal, drawerPaidTotal, managementPaidTotal } = useMemo(() => {
    let dTotal = 0;
    let sTotal = 0;
    let drTotal = 0;
    let mgTotal = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      const type = e.expenseType || (SHOP_EXPENSE_PRESETS.some(p => p.category === e.category) ? 'shop' : 'daily');
      const source = e.paymentSource || 'cash_drawer';

      if (type === 'shop') {
        sTotal += amt;
      } else {
        dTotal += amt;
      }

      if (source === 'management') {
        mgTotal += amt;
      } else {
        drTotal += amt;
      }
    });

    return {
      dailyTotal: dTotal,
      shopTotal: sTotal,
      drawerPaidTotal: drTotal,
      managementPaidTotal: mgTotal
    };
  }, [expenses]);

  const activePresets = expenseType === 'shop' ? SHOP_EXPENSE_PRESETS : DAILY_EXPENSE_PRESETS;

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6" dir="rtl">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Expenses Total */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">المصاريف اليومية والنثريات</span>
            <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl text-lg">☕</span>
          </div>
          <p className="text-2xl font-black text-amber-950 mt-2 font-mono">
            {formatIQD(dailyTotal)} <span className="text-xs font-normal text-amber-800">د.ع</span>
          </p>
          <p className="text-[11px] text-amber-700 mt-1">مياه، وجبات، مواد تنظيف، نثريات</p>
        </div>

        {/* Shop Fixed Expenses Total */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-5 rounded-2xl border border-indigo-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-800">مصاريف والتزامات المحل</span>
            <span className="p-2 bg-indigo-500/10 text-indigo-700 rounded-xl text-lg">🏢</span>
          </div>
          <p className="text-2xl font-black text-indigo-950 mt-2 font-mono">
            {formatIQD(shopTotal)} <span className="text-xs font-normal text-indigo-800">د.ع</span>
          </p>
          <p className="text-[11px] text-indigo-700 mt-1">إيجار، بلدية، إنترنت، مولد، صيانة</p>
        </div>

        {/* Cash Drawer vs Management Outflow */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 rounded-2xl border border-emerald-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">المسحوب من القاصة (كاش)</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl text-lg">💵</span>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-2 font-mono">
            {formatIQD(drawerPaidTotal)} <span className="text-xs font-normal text-emerald-800">د.ع</span>
          </p>
          <p className="text-[11px] text-emerald-700 mt-1">
            دفع المدير: <span className="font-bold font-mono">{formatIQD(managementPaidTotal)} د.ع</span>
          </p>
        </div>

        {/* Total Expenses Overall */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">المجموع الكلي للنفقات</span>
            <span className="p-2 bg-slate-500/10 text-slate-700 rounded-xl text-lg">💰</span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {formatIQD(stats.allTotal)} <span className="text-xs font-normal text-slate-600">د.ع</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{stats.count} عملية مسجلة</p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <button
          type="button"
          onClick={() => handleTabChange('daily')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'daily'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-base">☕</span>
          <span>المصاريف اليومية والنثريات</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-mono">
            {expenses.filter(e => (e.expenseType || 'daily') === 'daily').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('shop')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'shop'
              ? 'bg-indigo-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span className="text-base">🏢</span>
          <span>مصاريف والتزامات المحل (إيجار، بلدية، إنترنت...)</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-mono">
            {expenses.filter(e => e.expenseType === 'shop').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📑</span>
          <span>كافة المصاريف</span>
        </button>
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

          {/* Quick Preset Buttons */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-700">
                اختيار سريع بضغطة زر:
              </label>
              <span className="text-[10px] font-bold text-slate-400">
                {expenseType === 'shop' ? 'مصاريف المحل 🏢' : 'مصاريف يومية ☕'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activePresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id || title === preset.title;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? expenseType === 'shop'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-xs'
                          : 'bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="text-lg">{preset.icon}</span>
                    <span className="text-[11px] leading-tight truncate w-full">{preset.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSaveExpense} className="space-y-3.5">
            {/* Expense Type Selector (Daily vs Shop) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع ونطاق المصروف</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('daily');
                    setCategory('نثريات عامة');
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    expenseType === 'daily'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>☕</span>
                  <span>مصروف يومي / نثريات</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpenseType('shop');
                    setCategory('إيجار عقار');
                  }}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    expenseType === 'shop'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-2xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🏢</span>
                  <span>مصروف محل / تشغيلي</span>
                </button>
              </div>
            </div>

            {/* Title Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم / عنوان المصروف *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => { setTitle(e.target.value); setSelectedPresetId(null); }}
                placeholder={expenseType === 'shop' ? 'مثال: إيجار المحل لشهر 8، اشتراك الإنترنت...' : 'مثال: ربطة ماء، كارت رصيد، شاي...'}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>

            {/* Amount & Category */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (د.ع) *</label>
                <input
                  type="number"
                  required
                  min="250"
                  step="250"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="250"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف</label>
                {expenseType === 'shop' ? (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-bold"
                  >
                    <option value="إيجار عقار">إيجار عقار</option>
                    <option value="بلدية ورسوم">بلدية ورسوم</option>
                    <option value="خدمات وإنترنت">خدمات وإنترنت</option>
                    <option value="كهرباء ومولد">كهرباء ومولد</option>
                    <option value="صيانة وتجهيزات">صيانة وتجهيزات</option>
                    <option value="رسوم حكومية">رسوم حكومية</option>
                    <option value="مصاريف تشغيلية">مصاريف تشغيلية</option>
                  </select>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-bold"
                  >
                    <option value="طعام وغداء">طعام وغداء</option>
                    <option value="مشروبات ومياه">مشروبات ومياه</option>
                    <option value="مستلزمات ونظافة">مستلزمات ونظافة</option>
                    <option value="صيانة ومحروقات">صيانة ومحروقات</option>
                    <option value="نثريات عامة">نثريات عامة</option>
                  </select>
                )}
              </div>
            </div>

            {/* Payment Source Selection (من القاصة أو من المدير) */}
            <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                💳 مصدر سداد هذا المصروف:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                  paymentSource === 'cash_drawer'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="paymentSource"
                    value="cash_drawer"
                    checked={paymentSource === 'cash_drawer'}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">💵 من القاصة</span>
                    <span className="text-[10px] text-slate-500 block">يُخصم من نقد الصندوق</span>
                  </div>
                </label>

                <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                  paymentSource === 'management'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-white text-slate-700'
                }`}>
                  <input
                    type="radio"
                    name="paymentSource"
                    value="management"
                    checked={paymentSource === 'management'}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">🏦 دفعها المدير</span>
                    <span className="text-[10px] text-slate-500 block">لا يمس كاش القاصة</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Period Covered (For Shop / Fixed Expenses) */}
            {expenseType === 'shop' && (
              <div className="animate-fade-in">
                <label className="block text-xs font-bold text-indigo-900 mb-1">
                  الفترة / الشهر المغطى (اختياري)
                </label>
                <input
                  type="text"
                  value={periodCovered}
                  onChange={(e) => setPeriodCovered(e.target.value)}
                  placeholder="مثال: شهر آب 2026 / الربع الثالث"
                  className="w-full p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            )}

            {/* Buyer Name & Date */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الشخص المشتري / الصارف</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="اسم الشخص..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الصرف</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي تفاصيل أخرى..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className={`w-full text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
                  expenseType === 'shop' ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {saving ? (
                  <span>جاري الحفظ...</span>
                ) : (
                  <>
                    <span>💸</span>
                    <span>{editingExpense ? 'حفظ التعديلات' : 'حفظ وتسجيل المصروف'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Expenses List & Audit Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="بحث باسم المصروف، المشتري، الفترة، أو الملاحظة..."
                  className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Payment Source Filter */}
              <select
                value={paymentSourceFilter}
                onChange={(e) => setPaymentSourceFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">كافة مصادر السداد</option>
                <option value="cash_drawer">💵 من القاصة (كاش)</option>
                <option value="management">🏦 دفعها المدير</option>
              </select>

              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">كل التواريخ</option>
                <option value="today">مصاريف اليوم</option>
                <option value="month">مصاريف هذا الشهر</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">جميع التصنيفات</option>
                <option value="طعام وغداء">طعام وغداء</option>
                <option value="مشروبات ومياه">مشروبات ومياه</option>
                <option value="مستلزمات ونظافة">مستلزمات ونظافة</option>
                <option value="إيجار عقار">إيجار عقار</option>
                <option value="بلدية ورسوم">بلدية ورسوم</option>
                <option value="خدمات وإنترنت">خدمات وإنترنت</option>
                <option value="كهرباء ومولد">كهرباء ومولد</option>
                <option value="صيانة وتجهيزات">صيانة وتجهيزات</option>
                <option value="رسوم حكومية">رسوم حكومية</option>
                <option value="مصاريف تشغيلية">مصاريف تشغيلية</option>
                <option value="نثريات عامة">نثريات عامة</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center my-auto">
              <span className="text-4xl block mb-2">💸</span>
              <p className="text-xs font-bold">لا توجد مصاريف مطابقة للبحث أو التصفية في هذا القسم.</p>
            </div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">المصروف</th>
                    <th className="p-3">النوع / التصنيف</th>
                    <th className="p-3">مصدر السداد</th>
                    <th className="p-3">المشتري</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3">الملاحظات</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((exp) => {
                    const isShop = exp.expenseType === 'shop';
                    const isMgmt = exp.paymentSource === 'management';

                    return (
                      <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-500 font-mono whitespace-nowrap">
                          {exp.date ? new Date(exp.date).toLocaleDateString('ar-IQ') : '—'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{exp.title}</span>
                            {exp.periodCovered && (
                              <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                {exp.periodCovered}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              isShop ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isShop ? '🏢 محل' : '☕ يومي'}
                            </span>
                            <span className="text-slate-600 text-[11px]">
                              {exp.category}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${
                            isMgmt
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            <span>{isMgmt ? '🏦' : '💵'}</span>
                            <span>{isMgmt ? 'من المدير' : 'من القاصة'}</span>
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          {exp.buyerName || 'المحل'}
                        </td>
                        <td className="p-3 font-mono font-black text-rose-700 text-sm whitespace-nowrap">
                          {formatIQD(exp.amount)} د.ع
                        </td>
                        <td className="p-3 text-slate-500 max-w-[150px] truncate" title={exp.notes}>
                          {exp.notes || '—'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
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
          )}
        </div>
      </div>
    </div>
  );
}
