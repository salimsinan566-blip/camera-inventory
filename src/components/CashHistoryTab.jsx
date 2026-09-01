import React, { useState, useMemo } from 'react';
import { useCashDrawerLedger } from '../hooks/useCashDrawerLedger';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function CashHistoryTab({ initialDateStr }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(initialDateStr || todayStr);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'in' | 'out' | 'audit'
  const [searchQuery, setSearchQuery] = useState('');

  const {
    loading,
    daySummary,
    quickDateOptions,
    totalHistoricalEvents
  } = useCashDrawerLedger(selectedDate);

  const {
    targetDateStr,
    openingBalance,
    totalInflowAmount,
    totalOutflowAmount,
    netChange,
    closingBalance,
    transactions,
    transactionsChronological,
    inflowsCount,
    outflowsCount,
    auditsCount
  } = daySummary;

  // فلترة المعاملات حسب البحث ونوع الحركة
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    if (filterType === 'in') {
      list = list.filter((t) => t.direction === 'in');
    } else if (filterType === 'out') {
      list = list.filter((t) => t.direction === 'out');
    } else if (filterType === 'audit') {
      list = list.filter((t) => t.direction === 'audit');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.subtitle || '').toLowerCase().includes(q) ||
          (t.typeLabel || '').toLowerCase().includes(q) ||
          (t.user || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [transactions, filterType, searchQuery]);

  // طباعة كشف حساب اليوم
  const handlePrintDailySheet = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    const dateFormatted = new Date(selectedDate).toLocaleDateString('ar-IQ', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const rowsHtml = transactionsChronological.map((t, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 8px 4px; text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="padding: 8px 6px; font-family: monospace;">${t.timeFormatted}</td>
        <td style="padding: 8px 6px; font-weight: bold;">${t.typeLabel}</td>
        <td style="padding: 8px 6px;">
          <div>${t.title}</div>
          <div style="font-size: 10px; color: #64748b;">${t.subtitle || ''}</div>
        </td>
        <td style="padding: 8px 6px; text-align: right; font-weight: bold; font-family: monospace; color: ${t.direction === 'in' ? '#059669' : (t.direction === 'out' ? '#dc2626' : '#4f46e5')};">
          ${t.direction === 'in' ? `+${formatIQD(t.amount)}` : (t.direction === 'out' ? `-${formatIQD(t.amount)}` : `تسوية: ${formatIQD(t.amount)}`)}
        </td>
        <td style="padding: 8px 6px; text-align: right; font-weight: 800; font-family: monospace; color: #0f172a; background-color: #f8fafc;">
          ${formatIQD(t.runningBalance)} د.ع
        </td>
        <td style="padding: 8px 6px; text-align: center; color: #64748b; font-size: 10px;">${t.user || '—'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>كشف حركة نقد الصندوق - ${selectedDate}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; color: #0f172a; margin: 0; }
          .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; }
          .title { font-size: 20px; font-weight: bold; margin: 0 0 6px 0; }
          .subtitle { font-size: 13px; color: #475569; margin: 0; }
          .cards { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
          .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #f8fafc; text-align: right; }
          .card-label { font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 4px; }
          .card-value { font-size: 15px; font-weight: 900; font-family: monospace; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #0f172a; color: white; padding: 8px 6px; font-size: 11px; text-align: right; }
          th:first-child { text-align: center; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">كشف حركة ورصيد صندوق الدخل (القاصة)</h1>
          <p class="subtitle">${dateFormatted} (${selectedDate})</p>
        </div>

        <div class="cards">
          <div class="card" style="border-right: 4px solid #3b82f6;">
            <div class="card-label">☀️ رصيد افتتاح الصندوق (صباحاً):</div>
            <div class="card-value">${formatIQD(openingBalance)} د.ع</div>
          </div>
          <div class="card" style="border-right: 4px solid #10b981;">
            <div class="card-label">📥 إجمالي المقبوضات النقدية (+):</div>
            <div class="card-value" style="color: #059669;">+ ${formatIQD(totalInflowAmount)} د.ع</div>
          </div>
          <div class="card" style="border-right: 4px solid #ef4444;">
            <div class="card-label">📤 إجمالي المصروفات النقدية (-):</div>
            <div class="card-value" style="color: #dc2626;">- ${formatIQD(totalOutflowAmount)} د.ع</div>
          </div>
          <div class="card" style="border-right: 4px solid #0f172a; background: #f1f5f9;">
            <div class="card-label">🏁 رصيد إغلاق الصندوق (ليلاً):</div>
            <div class="card-value" style="font-size: 16px;">${formatIQD(closingBalance)} د.ع</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="width: 70px;">الوقت</th>
              <th style="width: 120px;">نوع الحركة</th>
              <th>البيان والتفاصيل</th>
              <th style="width: 110px;">المبلغ</th>
              <th style="width: 120px;">رصيد القاصة بعد الحركة</th>
              <th style="width: 80px; text-align: center;">المسؤول</th>
            </tr>
          </thead>
          <tbody>
            ${transactionsChronological.length > 0 ? rowsHtml : `
              <tr>
                <td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8; font-size: 12px;">
                  لا توجد حركات نقدية مسجلة في هذا اليوم. الرصيد ظل ثابتاً عند (${formatIQD(openingBalance)} د.ع).
                </td>
              </tr>
            `}
          </tbody>
        </table>

        <div class="footer">
          تم استخراج هذا التقرير بتاريخ: ${new Date().toLocaleString('ar-IQ')} • نظام إدارة المخزون والمبيعات
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getBadgeForType = (type, direction) => {
    switch (type) {
      case 'cash_sale':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 بيع نقدي</span>;
      case 'customer_debt_repayment':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-200">💵 تسديد دين عميل</span>;
      case 'manual_income':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">📥 إيداع / إيراد</span>;
      case 'advance_repayment':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">💼 استرجاع سلفة</span>;
      case 'expense':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">🔴 مصروف ونثريات</span>;
      case 'purchase':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200">📦 شراء بضاعة</span>;
      case 'supplier_payment':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">💳 تسديد مورد</span>;
      case 'advance_give':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">💸 صرف سلفة</span>;
      case 'reimbursement':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">🧾 تعويض مشتريات</span>;
      case 'reconciliation':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-800 text-white border border-slate-900">⚖️ تسوية وجرد</span>;
      default:
        return direction === 'in' 
          ? <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800">📥 قبض</span>
          : <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800">📤 صرف</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Date Selection Controls */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📜</span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">كشف حركة وتاريخ نقد الصندوق (القاصة)</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              اختر أي يوم لمعرفة كم كان رصيد الصندوق صباحاً وليلاً، ومتابعة كشف الحركات والرصيد اللحظي بعد كل عملية.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintDailySheet}
              className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="طباعة كشف حساب الصندوق لهذا اليوم"
            >
              <span>🖨️</span>
              <span>طباعة كشف اليوم</span>
            </button>
          </div>
        </div>

        {/* Quick Date Pills & Custom Date Picker */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
          <span className="text-xs font-bold text-slate-700 ml-1">تحديد التاريخ:</span>
          
          <div className="flex flex-wrap items-center gap-1.5">
            {quickDateOptions.map((opt) => {
              const isSelected = selectedDate === opt.dateStr;
              return (
                <button
                  key={opt.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(opt.dateStr)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs scale-102'
                      : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[10px] font-normal ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                    ({opt.displayDate})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Date Picker Input */}
          <div className="flex items-center gap-1.5 mr-auto">
            <span className="text-[11px] font-bold text-slate-500">أو تاريخ مخصص:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="px-3 py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Cards for the Selected Day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Card 1: Opening Balance */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-900">☀️ رصيد افتتاح الصندوق</span>
            <span className="text-xs px-2 py-0.5 bg-blue-200/60 text-blue-900 rounded-full font-bold">بداية اليوم</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">الرصيد المالي في الصندوق عند بداية هذا اليوم</p>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-blue-950 font-mono tracking-tight">
              {formatIQD(openingBalance)}
            </span>
            <span className="text-xs font-bold text-blue-800">د.ع</span>
          </div>
        </div>

        {/* Card 2: Total Inflows */}
        <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-900">📥 إجمالي المقبوضات (+)</span>
            <span className="text-xs px-2 py-0.5 bg-emerald-200/60 text-emerald-900 rounded-full font-bold">
              {inflowsCount} عمليات
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">مبيعات نقدية، تسديد ديون، إيداعات واسترجاع سلف</p>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-700 font-mono tracking-tight">
              +{formatIQD(totalInflowAmount)}
            </span>
            <span className="text-xs font-bold text-emerald-800">د.ع</span>
          </div>
        </div>

        {/* Card 3: Total Outflows */}
        <div className="p-4 bg-gradient-to-br from-rose-50 to-red-50 border border-rose-200/80 rounded-2xl shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-900">📤 إجمالي المصروفات (-)</span>
            <span className="text-xs px-2 py-0.5 bg-rose-200/60 text-rose-900 rounded-full font-bold">
              {outflowsCount} عمليات
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">مصاريف يومية، شراء بضاعة، سلف وتعويضات</p>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-rose-700 font-mono tracking-tight">
              -{formatIQD(totalOutflowAmount)}
            </span>
            <span className="text-xs font-bold text-rose-800">د.ع</span>
          </div>
        </div>

        {/* Card 4: Closing Balance */}
        <div className="p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-2xl shadow-sm border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300">🏁 رصيد إغلاق الصندوق</span>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold">
              {netChange >= 0 ? `+${formatIQD(netChange)}` : `-${formatIQD(Math.abs(netChange))}`}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">الرصيد النهائي المتبقي بالقاصة في نهاية هذا اليوم</p>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${closingBalance >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
              {formatIQD(closingBalance)}
            </span>
            <span className="text-xs font-bold text-emerald-400/80">د.ع</span>
          </div>
        </div>

      </div>

      {/* 3. Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-600 ml-1">تصفية الحركات:</span>
          
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            الكل ({transactions.length})
          </button>
          
          <button
            type="button"
            onClick={() => setFilterType('in')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterType === 'in' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            🟢 مقبوضات فقط ({inflowsCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('out')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterType === 'out' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            🔴 مصروفات فقط ({outflowsCount})
          </button>

          {auditsCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterType('audit')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === 'audit' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              ⚖️ تسويات ({auditsCount})
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="بحث بالرقم، الاسم، أو البيان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-60 px-3 py-1.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none"
          />
          <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 4. Transactions Statement Table with Running Balance */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <span className="text-4xl block mb-2">🏖️</span>
            <p className="text-sm font-bold text-slate-700">لا توجد حركات مسجلة في هذا اليوم بحسب شروط التصفية.</p>
            <p className="text-xs text-slate-400">
              رصيد الصندوق في هذا اليوم استقر عند ({formatIQD(openingBalance)} د.ع).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-bold">
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-24">الوقت</th>
                  <th className="p-3 w-36">نوع الحركة</th>
                  <th className="p-3">البيان والتفاصيل</th>
                  <th className="p-3 w-36 text-left">المبلغ</th>
                  <th className="p-3 w-44 text-left bg-slate-800 text-emerald-300">
                    رصيد القاصة بعد الحركة
                  </th>
                  <th className="p-3 w-28 text-center">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((t, idx) => {
                  const isPositive = t.direction === 'in';
                  const isAudit = t.direction === 'audit';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-3 font-mono font-bold text-slate-600">{t.timeFormatted}</td>
                      <td className="p-3">{getBadgeForType(t.type, t.direction)}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{t.title}</div>
                        {t.subtitle && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{t.subtitle}</div>
                        )}
                      </td>
                      <td className="p-3 text-left">
                        {isAudit ? (
                          <span className="font-black font-mono text-indigo-700">
                            تسوية: {formatIQD(t.amount)} د.ع
                          </span>
                        ) : (
                          <span className={`font-black font-mono text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isPositive ? `+${formatIQD(t.amount)}` : `-${formatIQD(t.amount)}`} <span className="text-[10px] font-normal text-slate-500">د.ع</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-left bg-slate-50 font-black font-mono text-sm text-slate-900">
                        <span className={t.runningBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                          {formatIQD(t.runningBalance)}
                        </span>
                        <span className="text-[10px] font-normal text-slate-500 mr-1">د.ع</span>
                      </td>
                      <td className="p-3 text-center text-slate-500 text-[11px]">{t.user || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
