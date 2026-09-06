import React, { useState, useEffect } from 'react';
import {
  transferFunds,
  deleteFundTransfer,
  ACCOUNT_TYPES,
  ACCOUNT_LABELS
} from '../services/fundTransfersService';
import { useFundTransfers } from '../hooks/useFundTransfers';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../contexts/UIContext';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function TransferFundsModal({
  currentMastercardBalance = 0,
  currentCashBalance = 0,
  onClose,
  onTransferSuccess
}) {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const { transfers, loading: transfersLoading } = useFundTransfers();

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [fromAccount, setFromAccount] = useState(ACCOUNT_TYPES.MASTERCARD);
  const [toAccount, setToAccount] = useState(ACCOUNT_TYPES.CASH_DRAWER);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // تبديل اتجاه التحويل
  const handleSwapDirection = () => {
    const temp = fromAccount;
    setFromAccount(toAccount);
    setToAccount(temp);
  };

  const numAmount = Number(amount) || 0;
  const sourceBalance = fromAccount === ACCOUNT_TYPES.MASTERCARD ? currentMastercardBalance : currentCashBalance;
  const targetBalance = toAccount === ACCOUNT_TYPES.MASTERCARD ? currentMastercardBalance : currentCashBalance;

  const remainingSource = sourceBalance - numAmount;
  const newTarget = targetBalance + numAmount;

  const handleQuickAmount = (val) => {
    setAmount(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!numAmount || numAmount <= 0) {
      toast('يرجى إدخال مبلغ تحويل صحيح أكبر من الصفر', 'warn');
      return;
    }

    if (numAmount > sourceBalance && sourceBalance > 0) {
      const sourceName = ACCOUNT_LABELS[fromAccount];
      confirm(
        'المبلغ يتجاوز الرصيد الحالي',
        `المبلغ المراد تحويله (${formatIQD(numAmount)} د.ع) أكبر من الرصيد المتوفر في ${sourceName} (${formatIQD(sourceBalance)} د.ع). هل ترغب في المتابعة على أية حال؟`,
        () => executeTransfer()
      );
      return;
    }

    await executeTransfer();
  };

  const executeTransfer = async () => {
    setIsSubmitting(true);
    try {
      const defaultNote = fromAccount === ACCOUNT_TYPES.MASTERCARD
        ? 'سحب نقدي من الماستر كارد وإيداع في القاصة'
        : 'إيداع نقدي من القاصة في حساب الماستر كارد';

      await transferFunds({
        fromAccount,
        toAccount,
        amount: numAmount,
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        notes: (notes || defaultNote).trim(),
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      toast(`تم تحويل مبلغ (${formatIQD(numAmount)} د.ع) بنجاح وإيداعه في ${ACCOUNT_LABELS[toAccount]}! 💸✨`, 'success');
      if (onTransferSuccess) onTransferSuccess();
      onClose();
    } catch (err) {
      toast(`فشل التحويل: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransfer = (transferItem) => {
    confirm(
      'إلغاء وحذف حركة التحويل',
      `هل أنت متأكد من حذف حركة تحويل مبلغ (${formatIQD(transferItem.amount)} د.ع)؟ سيتم عكس تأثيرها على الأرصدة فوراً.`,
      async () => {
        try {
          await deleteFundTransfer(transferItem.id);
          toast('تم حذف حركة التحويل واستعادة الأرصدة بنجاح ✓', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92dvh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-900/80 border border-indigo-700/60 flex items-center justify-center text-xl shrink-0 shadow-xs">
              🔄
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">إدارة السيولة النقدية والإلكترونية</span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">تحويل مالي بين الحسابات</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-slate-100 p-2 flex items-center gap-2 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'new'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>💸</span>
            <span>تحويل جديد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>📜</span>
            <span>سجل التحويلات السابقة</span>
            {(transfers || []).length > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold">
                {transfers.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {activeTab === 'new' ? (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Accounts Direction Visual Selector */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>مسار التحويل المالي:</span>
                  <button
                    type="button"
                    onClick={handleSwapDirection}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
                    title="عكس اتجاه التحويل"
                  >
                    <span>⇄</span>
                    <span>عكس الاتجاه</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  
                  {/* From Account Card */}
                  <div className={`p-3 rounded-xl border-2 transition-all ${
                    fromAccount === ACCOUNT_TYPES.MASTERCARD
                      ? 'bg-indigo-950 text-white border-indigo-600 shadow-xs'
                      : 'bg-emerald-950 text-white border-emerald-600 shadow-xs'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-300 block">من حساب (المصدر)</span>
                    <div className="flex items-center gap-1.5 mt-1 font-bold text-sm">
                      <span>{fromAccount === ACCOUNT_TYPES.MASTERCARD ? '💳' : '💵'}</span>
                      <span>{ACCOUNT_LABELS[fromAccount]}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-200 flex justify-between items-baseline">
                      <span>الرصيد المتاح:</span>
                      <strong className="font-mono text-xs text-amber-300">{formatIQD(sourceBalance)} د.ع</strong>
                    </div>
                  </div>

                  {/* To Account Card */}
                  <div className={`p-3 rounded-xl border-2 transition-all ${
                    toAccount === ACCOUNT_TYPES.CASH_DRAWER
                      ? 'bg-emerald-900/90 text-white border-emerald-500 shadow-xs'
                      : 'bg-indigo-900/90 text-white border-indigo-500 shadow-xs'
                  }`}>
                    <span className="text-[10px] uppercase font-bold text-slate-300 block">إلى حساب (المستلم)</span>
                    <div className="flex items-center gap-1.5 mt-1 font-bold text-sm">
                      <span>{toAccount === ACCOUNT_TYPES.CASH_DRAWER ? '💵' : '💳'}</span>
                      <span>{ACCOUNT_LABELS[toAccount]}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-200 flex justify-between items-baseline">
                      <span>الرصيد الحالي:</span>
                      <strong className="font-mono text-xs text-emerald-300">{formatIQD(targetBalance)} د.ع</strong>
                    </div>
                  </div>

                </div>
              </div>

              {/* Amount Input & Quick Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  المبلغ المراد تحويله (د.ع) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="أدخل المبلغ هنا..."
                    className="w-full pl-12 pr-4 py-3 bg-white border-2 border-indigo-400 focus:border-indigo-600 focus:outline-none rounded-xl text-lg font-black font-mono text-slate-900 placeholder:text-slate-300"
                    autoFocus
                  />
                  <span className="absolute left-3 top-3.5 text-xs font-bold text-slate-500">د.ع</span>
                </div>

                {/* Quick Selection Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] font-bold text-slate-500 ml-1">مبالغ سريعة:</span>
                  {sourceBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(sourceBalance)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-bold border border-amber-300 transition-colors cursor-pointer"
                    >
                      كامل الرصيد ({formatIQD(sourceBalance)})
                    </button>
                  )}
                  {[10000, 25000, 50000, 100000, 250000].map((quickVal) => (
                    <button
                      key={quickVal}
                      type="button"
                      onClick={() => handleQuickAmount(quickVal)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      {formatIQD(quickVal)}
                    </button>
                  ))}
                </div>
              </div>

              {/* After Transfer Preview */}
              {numAmount > 0 && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs space-y-1.5">
                  <span className="font-bold text-indigo-950 block">معاينة الأرصدة بعد التحويل:</span>
                  <div className="flex items-center justify-between text-slate-700">
                    <span>رصيد {fromAccount === ACCOUNT_TYPES.MASTERCARD ? 'الماستر كارد' : 'القاصة'} سيصبح:</span>
                    <span className={`font-mono font-bold ${remainingSource >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
                      {formatIQD(remainingSource)} د.ع
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700">
                    <span>رصيد {toAccount === ACCOUNT_TYPES.CASH_DRAWER ? 'القاصة (النقد)' : 'الماستر كارد'} سيصبح:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatIQD(newTarget)} د.ع
                    </span>
                  </div>
                </div>
              )}

              {/* Date Field */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  تاريخ التحويل
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Notes / Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  البيان والملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    fromAccount === ACCOUNT_TYPES.MASTERCARD
                      ? 'مثال: سحب نقدي من الصراف الآلي وإيداع في القاصة'
                      : 'مثال: إيداع نقدي من القاصة في الحساب البنكي'
                  }
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !numAmount || numAmount <= 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>جاري تسجيل التحويل...</span>
                    </>
                  ) : (
                    <>
                      <span>💸</span>
                      <span>تأكيد التحويل وإيداع المبلغ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Tab 2: History of Transfers */
            <div className="space-y-3">
              {transfersLoading ? (
                <div className="text-center py-8 text-slate-400 text-xs">جاري تحميل سجل التحويلات...</div>
              ) : (transfers || []).length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <span className="text-3xl block">🔄</span>
                  <p className="text-xs font-bold text-slate-600">لا توجد حركات تحويل مسجلة بعد.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {transfers.map((item) => {
                    const isFromMaster = item.fromAccount === ACCOUNT_TYPES.MASTERCARD;
                    const dateStr = (item.date || item.createdAt || '').slice(0, 10);

                    return (
                      <div key={item.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <span className={isFromMaster ? 'text-indigo-600' : 'text-emerald-600'}>
                              {isFromMaster ? '💳 ➔ 💵' : '💵 ➔ 💳'}
                            </span>
                            <span>
                              {isFromMaster ? 'تحويل من الماستر إلى القاصة' : 'تحويل من القاصة إلى الماستر'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {item.notes || 'تحويل مالي بين الحسابات'}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>📅 {dateStr}</span>
                            <span>•</span>
                            <span>👤 {item.createdBy || 'المسؤول'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-sm text-indigo-900">
                            {formatIQD(item.amount)} د.ع
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransfer(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف حركة التحويل"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
