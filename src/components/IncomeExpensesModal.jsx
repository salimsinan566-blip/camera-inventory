import React, { useState, useMemo } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import { useCashReconciliation } from '../hooks/useCashReconciliation';
import { useIncomes } from '../hooks/useIncomes';
import CashReconciliationModal from './CashReconciliationModal';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

export default function IncomeExpensesModal({ sales = [], expenses = [], onClose }) {
  const { purchases, debtPayments: supplierDebtPayments } = usePurchases();
  const { latestReconciliation } = useCashReconciliation();
  const { incomes } = useIncomes();

  const [period, setPeriod] = useState('today'); // 'today' | 'month' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'sales' | 'expenses'
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Filter Sales according to selected period
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const date = toDateSafe(s.createdAt);
      if (!date) return false;
      const dateStr = date.toISOString().slice(0, 10);
      const monthStr = date.toISOString().slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [sales, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Expenses according to selected period
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dateStr = (e.date || e.createdAt || '').slice(0, 10);
      const monthStr = (e.date || e.createdAt || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [expenses, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Manual Incomes according to selected period
  const filteredIncomes = useMemo(() => {
    return incomes.filter((inc) => {
      const dateStr = (inc.date || inc.createdAt || '').slice(0, 10);
      const monthStr = (inc.date || inc.createdAt || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [incomes, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Totals
  const totalIncome = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  const totalExpense = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  const totalGiftsCost = useMemo(() => {
    let cost = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          cost += wholesale * qty;
        }
      });
    });
    return cost;
  }, [filteredSales]);

  const totalOutflows = totalExpense + totalGiftsCost;
  const netIncome = totalIncome - totalOutflows;
  const expenseRatio = totalIncome > 0 ? ((totalOutflows / totalIncome) * 100).toFixed(1) : '0.0';

  const getPeriodLabel = () => {
    if (period === 'today') return 'اليوم';
    if (period === 'month') return 'الشهر الحالي';
    if (period === 'all') return 'السجل الكامل';
    return `من ${customFrom || 'البداية'} إلى ${customTo || 'الآن'}`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div id="reconciliation-print" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Formal Corporate Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">التقرير المالي</span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">كشف التسوية المالية (الإيرادات والمصاريف)</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReconciliationModal(true)}
              className="px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 hover:text-white rounded-lg text-xs font-bold border border-indigo-700/50 transition-colors flex items-center gap-1.5 cursor-pointer print:hidden"
              title="تسوية وتثبيت رصيد القاصة الفعلي"
            >
              <span>⚖️</span>
              <span>تسوية رصيد القاصة</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer print:hidden"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-bold print:hidden"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Formal Period Selection Bar */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">النطاق الزمني:</span>
            <div className="inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
              <button
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === 'today'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم
              </button>

              <button
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === 'month'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الشهر الحالي
              </button>

              <button
                onClick={() => setPeriod('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                السجل الكامل
              </button>

              <button
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === 'custom'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                نطاق مخصص
              </button>
            </div>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span>من:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
              />
              <span>إلى:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900"
              />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Formal Financial Reconciliation Statement Banner - Open Layout Without Cramped Boxes */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-bold text-slate-800">
                  معادلة التسوية المالية للفترة: <strong className="text-indigo-950 text-sm font-black">({getPeriodLabel()})</strong>
                </span>
                <p className="text-xs text-slate-500 mt-0.5">حساب صافي الفائض المالي بعد استقطاع كافة المصروفات وتكلفة الهدايا</p>
              </div>
              <span className="self-start sm:self-auto text-xs font-bold font-mono bg-white text-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                نسبة الاستقطاع: {expenseRatio}%
              </span>
            </div>

            {/* Open, Wide Equation Layout - Left to Right (LTR) Mathematical Order */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4 text-center" dir="ltr">
              
              {/* 1. Gross Revenue (Left) */}
              <div className="flex-1 w-full text-center md:text-left">
                <span className="text-xs font-bold text-slate-500 block mb-1">
                  إجمالي الإيرادات (المبيعات)
                </span>
                <div className="flex items-baseline justify-center md:justify-start gap-1.5 flex-wrap">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-emerald-700">
                    +{formatIQD(totalIncome)}
                  </span>
                  <span className="text-sm font-bold text-slate-600">د.ع</span>
                </div>
                <span className="text-xs text-slate-400 font-mono mt-1 block">
                  {filteredSales.length} فاتورة مسجلة
                </span>
              </div>

              {/* Operator: Minus */}
              <div className="shrink-0 flex items-center justify-center px-2">
                <span className="text-4xl sm:text-5xl font-light text-slate-400 select-none">
                  −
                </span>
              </div>

              {/* 2. Total Expenses & Free Gifts Cost (Middle) */}
              <div className="flex-1 w-full text-center">
                <span className="text-xs font-bold text-slate-500 block mb-1">
                  النفقات وتكلفة الهدايا
                </span>
                <div className="flex items-baseline justify-center gap-1.5 flex-wrap">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-rose-700">
                    {formatIQD(totalOutflows)}
                  </span>
                  <span className="text-sm font-bold text-slate-600">د.ع</span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center justify-center gap-2">
                  <span>مصاريف: {formatIQD(totalExpense)}</span>
                  <span>•</span>
                  <span className="text-purple-700 font-bold">هدايا: {formatIQD(totalGiftsCost)}</span>
                </div>
              </div>

              {/* Operator: Equals */}
              <div className="shrink-0 flex items-center justify-center px-2">
                <span className="text-4xl sm:text-5xl font-light text-slate-400 select-none">
                  =
                </span>
              </div>

              {/* 3. Net Balance (Right) */}
              <div className="flex-1 w-full text-center md:text-right md:pl-4 md:border-l md:border-slate-300">
                <span className="text-xs font-bold text-slate-700 block mb-1">
                  صافي الفائض المالي (الدخل)
                </span>
                <div className="flex items-baseline justify-center md:justify-end gap-1.5 flex-wrap">
                  <span className={`text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight ${netIncome >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>
                    {netIncome < 0 ? `-${formatIQD(Math.abs(netIncome))}` : formatIQD(netIncome)}
                  </span>
                  <span className="text-sm font-bold text-slate-600">د.ع</span>
                </div>
                <span className={`text-xs font-bold mt-1 block ${netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {netIncome >= 0 ? '✓ فائض مالي إيجابي' : '⚠️ عجز بالموازنة'}
                </span>
              </div>

            </div>
          </div>

          {/* Sub-tabs Navigation */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 print:hidden">
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'summary'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-300'
                }`}
              >
                ملخص المقارنة السريعة
              </button>

              <button
                onClick={() => setActiveTab('sales')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'sales'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-300'
                }`}
              >
                سجل فواتير المبيعات ({filteredSales.length})
              </button>

              <button
                onClick={() => setActiveTab('expenses')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-300'
                }`}
              >
                سجل سندات الصرف ({filteredExpenses.length})
              </button>
            </div>

            {/* TAB 1: Summary Table Columns */}
            {activeTab === 'summary' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Top Sales */}
                <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-900">
                      أحدث فواتير الإيرادات:
                    </span>
                    <button
                      onClick={() => setActiveTab('sales')}
                      className="text-xs text-indigo-700 hover:underline font-bold print:hidden"
                    >
                      عرض السجل بالكامل ({filteredSales.length})
                    </button>
                  </div>
                  {filteredSales.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">لا توجد مبيعات في هذه الفترة</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {filteredSales.slice(0, 5).map((s) => (
                        <div key={s.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900 font-mono">#{s.invoiceNumber}</span>
                            <span className="text-slate-600 mr-2 text-xs">({s.customerName || 'عميل نقدي'})</span>
                          </div>
                          <span className="font-bold text-emerald-800 font-mono text-sm">+{formatIQD(s.total)} د.ع</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Expenses */}
                <div className="bg-white rounded-xl border border-slate-300 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-900">
                      أحدث سندات المصروفات:
                    </span>
                    <button
                      onClick={() => setActiveTab('expenses')}
                      className="text-xs text-indigo-700 hover:underline font-bold print:hidden"
                    >
                      عرض السجل بالكامل ({filteredExpenses.length})
                    </button>
                  </div>
                  {filteredExpenses.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">لا توجد مصاريف في هذه الفترة</p>
                  ) : (
                    <div className="divide-y divide-slate-100 text-xs">
                      {filteredExpenses.slice(0, 5).map((e) => (
                        <div key={e.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900">{e.title}</span>
                            <span className="text-slate-500 mr-2 text-xs">({e.category || 'عام'})</span>
                          </div>
                          <span className="font-bold text-rose-800 font-mono text-sm">-{formatIQD(e.amount)} د.ع</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 2: Full Sales Table */}
            {activeTab === 'sales' && (
              <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-xs">
                {filteredSales.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">لا توجد فواتير مبيعات مسجلة في هذا النطاق</p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-right whitespace-nowrap">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 sticky top-0">
                        <tr>
                          <th className="p-3">رقم الفاتورة</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">العميل</th>
                          <th className="p-3">طريقة الدفع</th>
                          <th className="p-3">المبلغ الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {filteredSales.map((s) => {
                          const date = toDateSafe(s.createdAt);
                          return (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 font-bold font-mono text-slate-950">#{s.invoiceNumber}</td>
                              <td className="p-3 text-slate-600 font-mono">{date ? date.toLocaleString('ar-IQ') : '—'}</td>
                              <td className="p-3 font-bold text-slate-800">{s.customerName || 'عميل نقدي'}</td>
                              <td className="p-3">
                                {s.invoiceType === 'debt' ? (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded font-bold text-[10px]">آجل / دين</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded font-bold text-[10px]">نقدي</span>
                                )}
                              </td>
                              <td className="p-3 font-bold text-emerald-800 font-mono text-sm">+{formatIQD(s.total)} د.ع</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Full Expenses Table */}
            {activeTab === 'expenses' && (
              <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-xs">
                {filteredExpenses.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">لا توجد مصاريف مسجلة في هذا النطاق</p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-right whitespace-nowrap">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 sticky top-0">
                        <tr>
                          <th className="p-3">بند المصروف</th>
                          <th className="p-3">التصنيف</th>
                          <th className="p-3">مصدر السداد</th>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">المسؤول / المشتري</th>
                          <th className="p-3">المبلغ المستقطع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {filteredExpenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-bold text-slate-950">
                              <div className="flex items-center gap-1.5">
                                <span>{e.title}</span>
                                {e.periodCovered && (
                                  <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100">
                                    {e.periodCovered}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-slate-700">{e.category || 'نثريات عامة'}</td>
                            <td className="p-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                e.paymentSource === 'management'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {e.paymentSource === 'management' ? '🏦 من المدير' : '💵 من القاصة'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 font-mono">{e.date ? new Date(e.date).toLocaleDateString('ar-IQ') : '—'}</td>
                            <td className="p-3 text-slate-800 font-medium">{e.buyerName || 'المحل'}</td>
                            <td className="p-3 font-bold text-rose-800 font-mono text-sm">-{formatIQD(e.amount)} د.ع</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

        {/* Formal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 print:hidden">
          <div className="text-xs text-slate-600">
            <span>الفترة المعتمدة: </span>
            <strong className="text-slate-950 font-bold">{getPeriodLabel()}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>

      {showReconciliationModal && (
        <CashReconciliationModal
          currentCalculatedCash={netIncome}
          onClose={() => setShowReconciliationModal(false)}
        />
      )}
    </div>
  );
}
