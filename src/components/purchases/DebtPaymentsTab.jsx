import React, { useState, useMemo } from 'react';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function DebtPaymentsTab({
  debtPayments = [],
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPayments = useMemo(() => {
    if (!searchTerm.trim()) return debtPayments;
    const q = searchTerm.toLowerCase().trim();
    return debtPayments.filter(
      (pay) =>
        pay.supplierName?.toLowerCase().includes(q) ||
        pay.notes?.toLowerCase().includes(q) ||
        pay.paymentMethod?.toLowerCase().includes(q)
    );
  }, [debtPayments, searchTerm]);

  const totalFilteredPaid = useMemo(() => {
    return filteredPayments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0);
  }, [filteredPayments]);

  return (
    <div className="space-y-3.5 animate-fade-in" dir="rtl">
      {/* Header - رسمي ومختصر */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs sm:text-sm font-black text-slate-900">
            سجل دفعات التسديد
          </h2>
          <span className="text-xs text-slate-400 font-bold">({debtPayments.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالمورد أو البيان..."
              className="w-56 pr-7 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
            />
            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>

          <div className="bg-slate-100 text-slate-900 border border-slate-200 px-3 py-1 rounded-lg text-xs font-black font-mono">
            المجموع: {formatIQD(totalFilteredPaid)} د.ع
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredPayments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <p className="text-xs font-bold text-slate-600">لا توجد دفعات تسديد مسجلة</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5">المورد</th>
                  <th className="p-2.5">المبلغ</th>
                  <th className="p-2.5">طريقة الدفع</th>
                  <th className="p-2.5">مصدر السحب</th>
                  <th className="p-2.5">البيان</th>
                  <th className="p-2.5">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 text-slate-500 font-mono whitespace-nowrap">
                      {pay.paymentDate || pay.date
                        ? new Date(pay.paymentDate || pay.date).toLocaleDateString('ar-IQ')
                        : '—'}
                    </td>
                    <td className="p-2.5 font-bold text-slate-900">{pay.supplierName}</td>
                    <td className="p-2.5 font-bold text-slate-900 font-mono">
                      {formatIQD(pay.amount)} د.ع
                    </td>
                    <td className="p-2.5 text-slate-700">
                      <span className="bg-slate-100 px-1.5 py-0.2 rounded text-[11px]">
                        {pay.paymentMethod || 'نقدي'}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-600 text-[11px]">
                      {pay.paymentSource === 'cash_drawer' ? 'القاصة اليومية' : 'حساب الإدارة'}
                    </td>
                    <td className="p-2.5 text-slate-500 max-w-xs truncate">
                      {pay.notes || '—'}
                    </td>
                    <td className="p-2.5 text-slate-400 font-mono">{pay.createdBy || 'المسؤول'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
