import React, { useState } from 'react';
import { saveCashReconciliation } from '../services/cashReconciliationService';
import { reimburseEmployee, deleteReimbursementRecord } from '../services/employeeReimbursementService';
import { giveEmployeeAdvance, repayEmployeeAdvance, deleteEmployeeAdvance } from '../services/employeeAdvancesService';
import { useEmployeeReimbursements } from '../hooks/useEmployeeReimbursements';
import { useEmployeeAdvances } from '../hooks/useEmployeeAdvances';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../contexts/UIContext';
import { useCashReconciliation } from '../hooks/useCashReconciliation';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function CashReconciliationModal({ currentCalculatedCash = 0, currentCalculatedMastercard = 0, onClose, onReconciliationSaved }) {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const { reconciliations } = useCashReconciliation();
  const {
    pendingReimbursements,
    settledReimbursements,
    totalPendingAmount
  } = useEmployeeReimbursements();
  const {
    advances,
    activeAdvances,
    settledAdvances,
    totalActiveAdvancesDebt
  } = useEmployeeAdvances();

  const [activeTab, setActiveTab] = useState('reconcile'); // 'reconcile' | 'advances' | 'reimbursements'

  // 1. Reconciliation Form State (Cash & Mastercard)
  const [actualAmount, setActualAmount] = useState('');
  const [actualMastercardAmount, setActualMastercardAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewHistory, setViewHistory] = useState(false);

  // 2. Employee Advances Modal State
  const [showGiveAdvanceModal, setShowGiveAdvanceModal] = useState(false);
  const [advanceEmployeeName, setAdvanceEmployeeName] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('سلفة نقدية');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [givingAdvance, setGivingAdvance] = useState(false);

  // Repayment of Advance Modal State
  const [selectedAdvanceForRepay, setSelectedAdvanceForRepay] = useState(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState('cash_drawer'); // 'cash_drawer' | 'salary_deduction'
  const [repayNotes, setRepayNotes] = useState('');
  const [repaying, setRepaying] = useState(false);
  const [viewSettledAdvancesHistory, setViewSettledAdvancesHistory] = useState(false);

  // 3. Reimbursement Settlement Modal State
  const [selectedForSettlement, setSelectedForSettlement] = useState(null);
  const [settlementSource, setSettlementSource] = useState('cash_drawer'); // 'cash_drawer' | 'management'
  const [settlementNotes, setSettlementNotes] = useState('');
  const [settling, setSettling] = useState(false);
  const [viewSettledHistory, setViewSettledHistory] = useState(false);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showGiveAdvanceModal) {
          setShowGiveAdvanceModal(false);
        } else if (selectedAdvanceForRepay) {
          setSelectedAdvanceForRepay(null);
        } else if (selectedForSettlement) {
          setSelectedForSettlement(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showGiveAdvanceModal, selectedAdvanceForRepay, selectedForSettlement]);

  const numActual = Number(actualAmount) || 0;
  const numCalculated = Number(currentCalculatedCash) || 0;
  const difference = numActual - numCalculated;

  const numActualMastercard = Number(actualMastercardAmount) || 0;
  const numCalculatedMastercard = Number(currentCalculatedMastercard) || 0;
  const mastercardDifference = numActualMastercard - numCalculatedMastercard;

  // Handle Cash & Mastercard Reconciliation Save
  const handleSaveReconciliation = async (e) => {
    e.preventDefault();
    if (!actualAmount && actualAmount !== 0) {
      toast('يرجى إدخال المبلغ الفعلي الموجود في القاصة', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveCashReconciliation({
        actualCashAmount: numActual,
        calculatedAmount: numCalculated,
        difference: difference,
        actualMastercardAmount: actualMastercardAmount !== '' ? numActualMastercard : numCalculatedMastercard,
        calculatedMastercardAmount: numCalculatedMastercard,
        mastercardDifference: actualMastercardAmount !== '' ? mastercardDifference : 0,
        notes: notes || 'تسوية وتثبيت رصيد القاصة والماستركارد الفعلي',
        createdBy: user?.displayName || user?.email || 'المدير'
      });

      toast('تم تثبيت وتسوية رصيد القاصة والماستركارد بنجاح!', 'success');
      if (onReconciliationSaved) onReconciliationSaved(numActual, numActualMastercard);
      onClose();
    } catch (err) {
      toast(`فشل حفظ التسوية: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle Give New Advance from Cash Drawer
  const handleGiveAdvance = async (e) => {
    e.preventDefault();
    const numAmt = Number(advanceAmount);
    if (!advanceEmployeeName.trim()) {
      toast('يرجى إدخال اسم الموظف', 'error');
      return;
    }
    if (!numAmt || numAmt <= 0) {
      toast('يرجى إدخال مبلغ سلفة صحيح', 'error');
      return;
    }

    setGivingAdvance(true);
    try {
      await giveEmployeeAdvance({
        employeeName: advanceEmployeeName.trim(),
        amount: numAmt,
        reason: advanceReason,
        notes: advanceNotes,
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      toast(`تم تسجيل صرف سلفة بمبلغ (${formatIQD(numAmt)} د.ع) للموظف (${advanceEmployeeName}) بنجاح! 💸`, 'success');
      setShowGiveAdvanceModal(false);
      setAdvanceEmployeeName('');
      setAdvanceAmount('');
      setAdvanceReason('سلفة نقدية');
      setAdvanceNotes('');
    } catch (err) {
      toast(`فشل صرف السلفة: ${err.message}`, 'error');
    } finally {
      setGivingAdvance(false);
    }
  };

  // Handle Repay Advance
  const handleRepayAdvance = async (e) => {
    e.preventDefault();
    const numAmt = Number(repayAmount);
    if (!selectedAdvanceForRepay) return;
    if (!numAmt || numAmt <= 0) {
      toast('يرجى إدخال مبلغ تسديد صحيح', 'error');
      return;
    }

    setRepaying(true);
    try {
      await repayEmployeeAdvance({
        advanceId: selectedAdvanceForRepay.id,
        amount: numAmt,
        currentRemainingDebt: selectedAdvanceForRepay.remainingDebt !== undefined ? selectedAdvanceForRepay.remainingDebt : selectedAdvanceForRepay.amount,
        repaymentMethod: repayMethod,
        notes: repayNotes,
        receivedBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      const methodLabel = repayMethod === 'cash_drawer' ? 'إيداع نقدي في القاصة' : 'استقطاع راتب / تسوية إدارية';
      toast(`تم تسديد (${formatIQD(numAmt)} د.ع) من سلفة الموظف (${selectedAdvanceForRepay.employeeName}) بنجاح عبر (${methodLabel})! 💵✓`, 'success');
      setSelectedAdvanceForRepay(null);
      setRepayAmount('');
      setRepayNotes('');
    } catch (err) {
      toast(`فشل تسديد السلفة: ${err.message}`, 'error');
    } finally {
      setRepaying(false);
    }
  };

  // Handle Delete Advance
  const handleDeleteAdvance = (adv) => {
    confirm(
      'حذف سجل السلفة',
      `هل أنت متأكد من حذف سلفة الموظف "${adv.employeeName}" بمبلغ (${formatIQD(adv.amount)} د.ع)؟`,
      async () => {
        try {
          await deleteEmployeeAdvance(adv.id);
          toast('تم حذف سجل السلفة بنجاح', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  // Handle Settle Reimbursement (Out-of-Pocket)
  const handleConfirmSettlement = async (e) => {
    e.preventDefault();
    if (!selectedForSettlement) return;

    setSettling(true);
    try {
      await reimburseEmployee({
        id: selectedForSettlement.id,
        reimbursementSource: settlementSource,
        reimbursedAmount: selectedForSettlement.amount,
        notes: settlementNotes,
        reimbursedBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      const sourceLabel = settlementSource === 'cash_drawer' ? 'نقداً من القاصة' : 'تحويل مباشر من الإدارة';
      toast(`تم استرداد وإرجاع مبلغ (${formatIQD(selectedForSettlement.amount)} د.ع) للموظف (${selectedForSettlement.employeeName}) بنجاح عبر (${sourceLabel})! 💵✨`, 'success');
      setSelectedForSettlement(null);
      setSettlementNotes('');
    } catch (err) {
      toast(`فشل الاسترداد: ${err.message}`, 'error');
    } finally {
      setSettling(false);
    }
  };

  // Handle Delete Reimbursement
  const handleDeleteReimbursement = (reimb) => {
    confirm(
      'حذف سجل المستحق',
      `هل أنت متأكد من حذف سجل المستحق للموظف "${reimb.employeeName}" بمبلغ (${formatIQD(reimb.amount)} د.ع)؟`,
      async () => {
        try {
          await deleteReimbursementRecord(reimb.id);
          toast('تم حذف السجل بنجاح', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl shrink-0">
              ⚖️
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">إدارة الصندوق ومطابقة القاصة</h2>
              <p className="text-xs text-slate-300">تسوية النقد الفعلي، سلف الموظفين من القاصة، ومستحقات الدفع من الجيب</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 p-2 flex items-center gap-2 border-b border-slate-200 shrink-0 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('reconcile')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 ${
              activeTab === 'reconcile'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>⚖️</span>
            <span>تسوية وجرد القاصة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advances')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 ${
              activeTab === 'advances'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>💸</span>
            <span>سلف الموظفين من القاصة</span>
            {activeAdvances.length > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-black">
                {activeAdvances.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reimbursements')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 ${
              activeTab === 'reimbursements'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>👤</span>
            <span>مستحقات دفع الموظف من جيبه</span>
            {pendingReimbursements.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-black">
                {pendingReimbursements.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Form */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* TAB 1: RECONCILIATION */}
          {activeTab === 'reconcile' && (
            <div className="space-y-5">
              {/* Information Banner */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-slate-700 leading-relaxed">
                💡 <strong>تنبيه محاسبي:</strong> تتيح لك هذه العملية مطابقة رصيد القاصة المسجل بالنظام مع النقد الفعلي الموجود بيدك الآن (دون حذف أو تعديل الفواتير القديمة)، ويبدأ النظام باحتساب حركات الصندوق القادمة فوراً من هذا الرصيد.
              </div>

              <form onSubmit={handleSaveReconciliation} className="space-y-4">
                
                {/* 1. Cash Drawer Section */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>💵</span>
                      <span>قاصة النقد (الكاش الفعلي)</span>
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      المحسوب: <strong>{formatIQD(numCalculated)}</strong> د.ع
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      النقد الفعلي في القاصة الآن (د.ع) <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={actualAmount}
                        onChange={(e) => setActualAmount(e.target.value)}
                        placeholder="مثال: 900000"
                        className="w-full pl-12 pr-4 py-2.5 bg-white border-2 border-emerald-400 focus:border-emerald-600 focus:outline-none rounded-xl text-base font-bold font-mono text-slate-900"
                        autoFocus
                      />
                      <span className="absolute left-3 top-3 text-xs font-bold text-slate-500">د.ع</span>
                    </div>
                  </div>

                  {actualAmount !== '' && (
                    <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      difference === 0 
                        ? 'bg-white border-slate-200 text-slate-700' 
                        : difference > 0 
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900' 
                        : 'bg-rose-100 border-rose-300 text-rose-900'
                    }`}>
                      <span className="font-bold">فارق قاصة النقد:</span>
                      <span className="font-mono font-black">
                        {difference > 0 ? `+${formatIQD(difference)}` : formatIQD(difference)} د.ع
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Mastercard Drawer Section */}
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <span>💳</span>
                      <span>قاصة الماستركارد (الدفع الإلكتروني)</span>
                    </span>
                    <span className="text-xs text-indigo-600 font-mono">
                      المحسوب: <strong>{formatIQD(numCalculatedMastercard)}</strong> د.ع
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رصيد الماستركارد الفعلي الآن (د.ع) <span className="text-xs font-normal text-slate-500">(اختياري للمطابقة)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={actualMastercardAmount}
                        onChange={(e) => setActualMastercardAmount(e.target.value)}
                        placeholder={`الافتراضي: ${numCalculatedMastercard}`}
                        className="w-full pl-12 pr-4 py-2.5 bg-white border-2 border-indigo-300 focus:border-indigo-600 focus:outline-none rounded-xl text-base font-bold font-mono text-slate-900"
                      />
                      <span className="absolute left-3 top-3 text-xs font-bold text-slate-500">د.ع</span>
                    </div>
                  </div>

                  {actualMastercardAmount !== '' && (
                    <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      mastercardDifference === 0 
                        ? 'bg-white border-indigo-200 text-indigo-900' 
                        : mastercardDifference > 0 
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-950' 
                        : 'bg-rose-100 border-rose-300 text-rose-900'
                    }`}>
                      <span className="font-bold">فارق قاصة الماستركارد:</span>
                      <span className="font-mono font-black">
                        {mastercardDifference > 0 ? `+${formatIQD(mastercardDifference)}` : formatIQD(mastercardDifference)} د.ع
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes / Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    ملاحظات أو سبب التسوية (اختياري)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="مثال: جرد القاصة وتثبيت الرصيد بعد تصفية حسابات الفنيين"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-700"
                  />
                </div>

                {/* Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={saving || actualAmount === ''}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    {saving ? 'جارٍ الحفظ...' : 'تثبيت الرصيد الفعلي للمحل'}
                  </button>
                </div>

              </form>

              {/* History Section Toggle */}
              <div className="pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewHistory(!viewHistory)}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>{viewHistory ? '▼ إخفاء سجل التسويات السابقة' : '◀ عرض سجل التسويات المالية السابقة (' + reconciliations.length + ')'}</span>
                </button>

                {viewHistory && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                    {reconciliations.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">لا توجد تسويات سابقة مسجلة</p>
                    ) : (
                      <div className="divide-y divide-slate-200 text-xs">
                        {reconciliations.map((rec) => (
                          <div key={rec.id} className="py-2 flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-900 font-mono">{formatIQD(rec.actualCashAmount)} د.ع</span>
                              <span className="text-slate-500 text-[11px] mr-2">({rec.notes || 'تسوية'})</span>
                            </div>
                            <div className="text-left font-mono text-slate-400 text-[11px]">
                              <span>{rec.createdAt ? new Date(rec.createdAt).toLocaleDateString('ar-IQ') : rec.date}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EMPLOYEE ADVANCES (سلف الموظفين من القاصة) */}
          {activeTab === 'advances' && (
            <div className="space-y-4">
              {/* Summary Banner & New Advance Button */}
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">إجمالي السلف القائمة بذمة الموظفين:</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">مبالغ مسحوبة نقداً من القاصة ومقيدة على ذمم الموظفين</p>
                  <span className="text-xl font-black text-amber-950 font-mono block mt-1">
                    {formatIQD(totalActiveAdvancesDebt)} <span className="text-xs font-normal text-amber-800">د.ع</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGiveAdvanceModal(true)}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>➕</span>
                  <span>صرف سلفة جديدة من القاصة</span>
                </button>
              </div>

              {/* Active Advances List */}
              {activeAdvances.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-xl">
                  <span className="text-4xl block mb-2">🏖️</span>
                  <p className="text-xs font-bold text-slate-700">لا توجد أي سلف قائمة بذمة الموظفين حالياً.</p>
                  <p className="text-[11px] text-slate-400">يمكنك صرف سلفة نقدية جديدة من القاصة في أي وقت.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">السلف النشطة القائمة ({activeAdvances.length}):</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {activeAdvances.map((adv) => {
                      const remaining = adv.remainingDebt !== undefined ? adv.remainingDebt : adv.amount;
                      return (
                        <div key={adv.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">💸</span>
                              <span className="text-xs font-black text-slate-900">{adv.employeeName}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-mono">
                                بذمته: {formatIQD(remaining)} د.ع
                              </span>
                              {adv.reason && (
                                <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {adv.reason}
                                </span>
                              )}
                            </div>
                            {adv.notes && (
                              <p className="text-[11px] text-slate-500">{adv.notes}</p>
                            )}
                            <p className="text-[10px] text-slate-400 font-mono">
                              تاريخ الصرف: {adv.date ? new Date(adv.date).toLocaleDateString('ar-IQ') : '—'} | المسجل: {adv.createdBy || 'المسؤول'}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <div className="text-left">
                              <span className="text-[10px] text-slate-400 block">إجمالي السلفة:</span>
                              <span className="text-sm font-black text-slate-900 font-mono">
                                {formatIQD(adv.amount)} د.ع
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAdvanceForRepay(adv);
                                setRepayAmount(String(remaining));
                                setRepayMethod('cash_drawer');
                                setRepayNotes('');
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <span>💵</span>
                              <span>تسديد السلفة</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAdvance(adv)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Settled Advances History Toggle */}
              {settledAdvances.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewSettledAdvancesHistory(!viewSettledAdvancesHistory)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{viewSettledAdvancesHistory ? '▼ إخفاء سجل السلف المسددة' : `◀ عرض سجل السلف المسددة بالكامل (${settledAdvances.length})`}</span>
                  </button>

                  {viewSettledAdvancesHistory && (
                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto divide-y divide-slate-200 text-xs">
                      {settledAdvances.map((adv) => (
                        <div key={adv.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">{adv.employeeName}</span>
                            <span className="text-slate-500 text-[11px] mr-2 font-mono">
                              ({formatIQD(adv.amount)} د.ع - {adv.reason || 'سلفة'})
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                            مسددة بالكامل ✓
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EMPLOYEE REIMBURSEMENTS (مستحقات دفع الموظف من جيبه) */}
          {activeTab === 'reimbursements' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-950 block">إجمالي مستحقات وسلف الموظفين المعلقة:</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">مبالغ دفعها الموظفون من جيوبهم الخاصة لتجهيز بضائع أو مصاريف</p>
                </div>
                <span className="text-xl font-black text-rose-700 font-mono">
                  {formatIQD(totalPendingAmount)} <span className="text-xs font-normal">د.ع</span>
                </span>
              </div>

              {/* Pending Reimbursements List */}
              {pendingReimbursements.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-xl">
                  <span className="text-4xl block mb-2">🎉</span>
                  <p className="text-xs font-bold text-slate-700">لا توجد أي مبالغ معلقة للموظفين حالياً.</p>
                  <p className="text-[11px] text-slate-400">جميع المستحقات مسددة ومطابقة.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">السجلات المعلقة بانتظار الاسترداد ({pendingReimbursements.length}):</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    {pendingReimbursements.map((r) => (
                      <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">👤</span>
                            <span className="text-xs font-black text-slate-900">{r.employeeName}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md font-mono">
                              معلق
                            </span>
                            {r.sourceInvoiceNumber && (
                              <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                فاتورة: {r.sourceInvoiceNumber}
                              </span>
                            )}
                          </div>
                          {r.notes && (
                            <p className="text-[11px] text-slate-500">{r.notes}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono">
                            التاريخ: {r.date ? new Date(r.date).toLocaleDateString('ar-IQ') : '—'} | بواسطة: {r.createdBy || 'المسؤول'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="text-base font-black text-slate-900 font-mono">
                            {formatIQD(r.amount)} د.ع
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedForSettlement(r);
                              setSettlementSource('cash_drawer');
                              setSettlementNotes('');
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>💵</span>
                            <span>استرداد للموظف</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteReimbursement(r)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settled History Toggle */}
              {settledReimbursements.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewSettledHistory(!viewSettledHistory)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{viewSettledHistory ? '▼ إخفاء سجل المستردات السابقة' : `◀ عرض سجل المستردات المسددة سابقاً (${settledReimbursements.length})`}</span>
                  </button>

                  {viewSettledHistory && (
                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto divide-y divide-slate-200 text-xs">
                      {settledReimbursements.map((r) => (
                        <div key={r.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">{r.employeeName}</span>
                            <span className="text-slate-500 text-[11px] mr-2 font-mono">
                              ({formatIQD(r.reimbursedAmount || r.amount)} د.ع - {r.reimbursementSource === 'cash_drawer' ? 'من القاصة' : 'تحويل من الإدارة'})
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                            تم الاسترداد ✓
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* GIVE ADVANCE MODAL (صرف سلفة جديدة من القاصة) */}
      {/* ---------------------------------------------------- */}
      {showGiveAdvanceModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💸</span>
                <div>
                  <h3 className="text-sm font-bold">صرف سلفة نقدية من القاصة</h3>
                  <p className="text-[11px] text-amber-100">تخصم مباشرة من رصيد الصندوق وتقيد بذمة الموظف</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGiveAdvanceModal(false)}
                className="text-amber-100 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGiveAdvance} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">اسم الموظف المستلف *</label>
                <input
                  type="text"
                  required
                  value={advanceEmployeeName}
                  onChange={(e) => setAdvanceEmployeeName(e.target.value)}
                  placeholder="مثال: أحمد، مصطفى..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">مبلغ السلفة (د.ع) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="مثال: 50000"
                  className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-sm font-black font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">سبب / تصنيف السلفة</label>
                <select
                  value={advanceReason}
                  onChange={(e) => setAdvanceReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="سلفة نقدية">سلفة نقدية عامة</option>
                  <option value="سلفة على الراتب">سلفة على الراتب</option>
                  <option value="مصروف طارئ">مصروف طارئ</option>
                  <option value="ظرف عائلي">ظرف عائلي</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGiveAdvanceModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={givingAdvance}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {givingAdvance ? 'جاري الصرف...' : 'تأكيد صرف السلفة 💸'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* REPAY ADVANCE MODAL (تسديد السلفة من الموظف) */}
      {/* ---------------------------------------------------- */}
      {selectedAdvanceForRepay && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💵</span>
                <div>
                  <h3 className="text-sm font-bold">تسديد سلفة من الموظف</h3>
                  <p className="text-[11px] text-emerald-200">{selectedAdvanceForRepay.employeeName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAdvanceForRepay(null)}
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRepayAdvance} className="p-5 space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">المتبقي بذمة الموظف:</span>
                <span className="text-base font-black text-amber-700 font-mono">
                  {formatIQD(selectedAdvanceForRepay.remainingDebt !== undefined ? selectedAdvanceForRepay.remainingDebt : selectedAdvanceForRepay.amount)} د.ع
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">مبلغ السداد (د.ع) *</label>
                  <button
                    type="button"
                    onClick={() => setRepayAmount(String(selectedAdvanceForRepay.remainingDebt !== undefined ? selectedAdvanceForRepay.remainingDebt : selectedAdvanceForRepay.amount))}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  >
                    تسديد كامل السلفة
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={selectedAdvanceForRepay.remainingDebt !== undefined ? selectedAdvanceForRepay.remainingDebt : selectedAdvanceForRepay.amount}
                  required
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full p-2.5 bg-white border border-emerald-300 rounded-xl text-sm font-black font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  طريقة التسديد:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    repayMethod === 'cash_drawer'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="repayMethod"
                        value="cash_drawer"
                        checked={repayMethod === 'cash_drawer'}
                        onChange={(e) => setRepayMethod(e.target.value)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-bold block">💵 إيداع نقدي في القاصة</span>
                        <span className="text-[10px] text-slate-500 block">يزيد رصيد الصندوق النقدي فوراً للمطابقة</span>
                      </div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    repayMethod === 'salary_deduction'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="repayMethod"
                        value="salary_deduction"
                        checked={repayMethod === 'salary_deduction'}
                        onChange={(e) => setRepayMethod(e.target.value)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-bold block">📑 استقطاع من الراتب / تسوية إدارية</span>
                        <span className="text-[10px] text-slate-500 block">لا يمس رصيد القاصة النقدية اليومية</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  placeholder="مثال: تسديد نقدي باليد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAdvanceForRepay(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={repaying}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {repaying ? 'جاري السداد...' : 'تأكيد التسديد ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* SETTLEMENT CONFIRMATION MODAL (REIMBURSEMENT) */}
      {/* ---------------------------------------------------- */}
      {selectedForSettlement && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💵</span>
                <div>
                  <h3 className="text-sm font-bold">استرداد وإرجاع المبلغ للموظف</h3>
                  <p className="text-[11px] text-emerald-200">{selectedForSettlement.employeeName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedForSettlement(null)}
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmSettlement} className="p-5 space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">المبلغ المستحق للإرجاع:</span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  {formatIQD(selectedForSettlement.amount)} د.ع
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  مصدر استرداد المبلغ:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    settlementSource === 'cash_drawer'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="settlementSource"
                        value="cash_drawer"
                        checked={settlementSource === 'cash_drawer'}
                        onChange={(e) => setSettlementSource(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold block">💵 نقداً من القاصة / الدخل</span>
                        <span className="text-[10px] text-slate-500 block">يُخصم من رصيد الصندوق النقدي الآن لضبط الجرد</span>
                      </div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    settlementSource === 'management'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="settlementSource"
                        value="management"
                        checked={settlementSource === 'management'}
                        onChange={(e) => setSettlementSource(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold block">🏦 تحويل مباشر من الإدارة / المدير</span>
                        <span className="text-[10px] text-slate-500 block">لا يمس رصيد القاصة النقدية في المحل</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">ملاحظات الاسترداد (اختياري)</label>
                <input
                  type="text"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="مثال: تم تسليم الكاش للموظف..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedForSettlement(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {settling ? 'جاري التسوية...' : 'تأكيد إرجاع المبلغ ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

