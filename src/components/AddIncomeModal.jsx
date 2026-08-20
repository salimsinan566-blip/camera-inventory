import React, { useState, useEffect, useMemo } from 'react';
import { addIncome, updateIncome, deleteIncome, INCOME_PRESETS } from '../services/incomesService';
import { useIncomes } from '../hooks/useIncomes';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../hooks/useAuth';
import CustomerSelect from './CustomerSelect';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function AddIncomeModal({ initialIncome = null, onClose, onSuccess }) {
  const { incomes } = useIncomes();
  const { toast, confirm } = useUI();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState(initialIncome ? 'form' : 'form'); // 'form' | 'history'
  const [title, setTitle] = useState(initialIncome?.title || '');
  const [category, setCategory] = useState(initialIncome?.category || 'فواتير قديمة سابقة');
  const [amount, setAmount] = useState(initialIncome?.amount || '');
  const [payerName, setPayerName] = useState(initialIncome?.payerName || initialIncome?.customerName || '');
  const [notes, setNotes] = useState(initialIncome?.notes || '');
  const [incomeDate, setIncomeDate] = useState((initialIncome?.date || initialIncome?.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [selectedPresetId, setSelectedPresetId] = useState(initialIncome ? null : 'old_invoice');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingIncome, setEditingIncome] = useState(initialIncome);
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    if (initialIncome) {
      setEditingIncome(initialIncome);
      setTitle(initialIncome.title || '');
      setCategory(initialIncome.category || 'فواتير قديمة سابقة');
      setAmount(initialIncome.amount || '');
      setPayerName(initialIncome.payerName || initialIncome.customerName || '');
      setNotes(initialIncome.notes || '');
      setIncomeDate((initialIncome.date || initialIncome.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      setActiveTab('form');
    }
  }, [initialIncome]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setCategory(preset.category);
  };

  const handleResetForm = () => {
    setTitle('');
    setCategory('فواتير قديمة سابقة');
    setAmount('');
    setPayerName('');
    setNotes('');
    setSelectedPresetId(null);
    setEditingIncome(null);
    setIncomeDate(new Date().toISOString().slice(0, 10));
  };

  const handleQuickAddAmount = (addVal) => {
    const current = Number(amount) || 0;
    setAmount(current + addVal);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);

    if (!title.trim()) {
      toast('يرجى كتابة عنوان أو بيان الإيراد (مثال: فاتورة قديمة لمحمد)', 'warn');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      toast('يرجى إدخال مبلغ صحيح أكبر من الصفر', 'warn');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingIncome) {
        await updateIncome(editingIncome.id, {
          title: title.trim(),
          category: category.trim(),
          amount: numAmount,
          payerName: (payerName || '').trim(),
          customerName: (payerName || '').trim(),
          notes: (notes || '').trim(),
          date: incomeDate ? new Date(incomeDate).toISOString() : new Date().toISOString()
        });
        toast('تم تحديث الإيراد بنجاح ✓', 'success');
      } else {
        await addIncome({
          title: title.trim(),
          category: category.trim(),
          amount: numAmount,
          payerName: (payerName || '').trim(),
          customerName: (payerName || '').trim(),
          notes: (notes || '').trim(),
          date: incomeDate ? new Date(incomeDate).toISOString() : new Date().toISOString(),
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
        });
        toast(`تمت إضافة ${formatIQD(numAmount)} د.ع إلى النقد الفعلي وصندوق المكتب بنجاح ✓ 💵`, 'success');
      }

      handleResetForm();
      if (onSuccess) onSuccess();
      if (!editingIncome) onClose();
    } catch (err) {
      toast(`خطأ: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (inc) => {
    setEditingIncome(inc);
    setTitle(inc.title || '');
    setCategory(inc.category || 'دخل إضافي عام');
    setAmount(inc.amount || '');
    setPayerName(inc.payerName || inc.customerName || '');
    setNotes(inc.notes || '');
    setIncomeDate((inc.date || inc.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setSelectedPresetId(null);
    setActiveTab('form');
  };

  const handleDeleteClick = (inc) => {
    confirm(
      'حذف الإيراد من الصندوق',
      `هل أنت متأكد من حذف الإيراد "${inc.title}" بمبلغ ${formatIQD(inc.amount)} د.ع؟ سيتم خصمه وإلغاؤه من النقد الفعلي فوراً.`,
      async () => {
        try {
          await deleteIncome(inc.id);
          toast('تم حذف الإيراد من الصندوق بنجاح ✓', 'success');
          if (editingIncome?.id === inc.id) {
            handleResetForm();
          }
        } catch (err) {
          toast(`فشل الحذف: ${err.message}`, 'error');
        }
      }
    );
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return incomes;
    const q = historySearch.toLowerCase().trim();
    return incomes.filter(i => 
      (i.title || '').toLowerCase().includes(q) ||
      (i.payerName || '').toLowerCase().includes(q) ||
      (i.customerName || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q) ||
      (i.notes || '').toLowerCase().includes(q)
    );
  }, [incomes, historySearch]);

  const totalIncomesSum = incomes.reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl p-2 bg-white/10 rounded-xl">📥</span>
            <div>
              <h3 className="font-black text-lg">
                {editingIncome ? 'تعديل إيراد / دخل مسجل' : 'إضافة مبلغ للنقد الفعلي وصندوق المكتب'}
              </h3>
              <p className="text-xs text-emerald-200">
                تسجيل إيرادات نقدية وفواتير قديمة قبل النظام وإضافتها للصندوق وكشف الحساب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-colors cursor-pointer text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'form'
                ? 'bg-white text-emerald-900 border-t-2 border-r border-l border-emerald-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>{editingIncome ? '✏️' : '➕'}</span>
            <span>{editingIncome ? 'تعديل الإيراد الحالي' : 'إضافة مبلغ جديد'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white text-emerald-900 border-t-2 border-r border-l border-emerald-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📋</span>
            <span>سجل المبالغ المدخلة السابقة ({incomes.length})</span>
            {totalIncomesSum > 0 && (
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full mr-1">
                {formatIQD(totalIncomesSum)} د.ع
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          
          {activeTab === 'form' ? (
            <>
              {/* Quick Presets */}
              {!editingIncome && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">نوع الإيراد السريع (اختر للتعبئة التلقائية):</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {INCOME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 cursor-pointer ${
                          selectedPresetId === preset.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold shadow-2xs'
                            : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="text-lg">{preset.icon}</span>
                        <span className="text-xs font-bold truncate">{preset.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Title & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      بيان / عنوان الإيراد *
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="مثال: فاتورة قديمة للعميل علي، إيداع نقدي..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      التصنيف
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="فواتير قديمة سابقة">📑 فواتير قديمة سابقة</option>
                      <option value="تسديد ديون قديمة">💼 تسديد ديون قديمة</option>
                      <option value="إيداع نقدي إضافي">💵 إيداع نقدي في القاصة</option>
                      <option value="خدمات وصيانة">🛠️ خدمات وأجور صيانة</option>
                      <option value="دخل إضافي عام">➕ دخل إضافي عام</option>
                    </select>
                  </div>
                </div>

                {/* Amount & Quick Buttons */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      المبلغ المضاف للنقد الفعلي (د.ع) *
                    </label>
                    {Number(amount) > 0 && (
                      <span className="text-xs font-bold text-emerald-700 font-mono">
                        {formatIQD(amount)} د.ع
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    min="1"
                    step="250"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="مثال: 50000"
                    className="w-full p-3 bg-slate-50 border-2 border-emerald-500 rounded-xl text-lg font-black font-mono text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-left"
                    dir="ltr"
                  />

                  {/* Quick Amount Chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 self-center">زيادة سريعة:</span>
                    {[25000, 50000, 100000, 250000, 500000, 1000000].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleQuickAddAmount(chip)}
                        className="px-2 py-1 text-[11px] font-bold font-mono bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        +{formatIQD(chip)}
                      </button>
                    ))}
                    {Number(amount) > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmount('')}
                        className="px-2 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                      >
                        مسح
                      </button>
                    )}
                  </div>
                </div>

                {/* Payer/Customer Name & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <CustomerSelect
                      value={payerName}
                      onChange={setPayerName}
                      onSelect={(c) => setPayerName(c.name)}
                      label="اسم العميل / صاحب الحساب (لإدراجه بكشف حسابه)"
                      placeholder="اختر أو اكتب اسم العميل..."
                    />
                    <span className="text-[10px] text-emerald-700 font-bold mt-1 block">
                      💡 سيتم إدراج هذا المبلغ تلقائياً في كشف حساب العميل.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      تاريخ الإيراد (يمكن تحديد تاريخ سابق)
                    </label>
                    <input
                      type="date"
                      value={incomeDate}
                      onChange={(e) => setIncomeDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ملاحظات إضافية (اختياري)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="رقم الوصل اليدوي القديم، تفاصيل المواد المسددة، أو ملاحظات أخرى..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  {editingIncome ? (
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                    >
                      إلغاء التعديل
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      إغلاق
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>{isSubmitting ? 'جارٍ الحفظ...' : editingIncome ? 'حفظ تعديلات الإيراد' : 'تأكيد إضافة المبلغ للنقد الفعلي'}</span>
                    <span>✓</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* History & Management Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="بحث في سجل الإيرادات بالاسم أو البيان..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {filteredHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm font-bold">لا توجد إيرادات مسجلة مسبقاً</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredHistory.map((inc) => (
                    <div 
                      key={inc.id} 
                      className="p-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{inc.title}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {inc.category || 'إيراد'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium flex-wrap">
                          <span>📅 {inc.date ? new Date(inc.date).toLocaleDateString('ar-IQ') : '—'}</span>
                          {(inc.payerName || inc.customerName) && (
                            <span className="text-emerald-700 font-bold">
                              👤 العميل: {inc.payerName || inc.customerName}
                            </span>
                          )}
                          {inc.createdBy && <span>✍️ المستلم: {inc.createdBy}</span>}
                        </div>

                        {inc.notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-1.5 rounded-lg italic">
                            📝 {inc.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-right sm:text-left">
                          <span className="font-black font-mono text-emerald-700 text-base block">
                            +{formatIQD(inc.amount)} د.ع
                          </span>
                          <span className="text-[10px] text-slate-400">نقد فعلي</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditClick(inc)}
                            className="p-2 text-indigo-700 hover:bg-indigo-50 rounded-xl border border-indigo-200 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1"
                            title="تعديل"
                          >
                            <span>✏️</span>
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(inc)}
                            className="p-2 text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1"
                            title="حذف من الصندوق"
                          >
                            <span>🗑️</span>
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
