import React, { useState, useMemo } from 'react';
import { findSupplierDebtRecord } from '../../utils/supplierDebtReconciliation';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function isPdfAttachment(url, fileType) {
  if (fileType === 'pdf') return true;
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');
}

export default function PurchasesArchiveTab({
  purchases = [],
  supplierDebts = [],
  onSelectInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onNewInvoice,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      // Reconcile status with supplier's debt
      const debtDoc = findSupplierDebtRecord(p.supplierName, supplierDebts);
      const isSupplierSettled = debtDoc && Number(debtDoc.remainingDebt) <= 0;
      const effectiveStatus = isSupplierSettled ? 'paid' : p.paymentStatus;

      if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const supMatch = p.supplierName?.toLowerCase().includes(q);
        const invMatch = p.invoiceNumber?.toLowerCase().includes(q);
        const notesMatch = p.notes?.toLowerCase().includes(q);
        return supMatch || invMatch || notesMatch;
      }
      return true;
    });
  }, [purchases, supplierDebts, searchTerm, statusFilter]);

  return (
    <div className="space-y-3.5 animate-fade-in" dir="rtl">
      {/* Top Header & Search Bar - رسمي ومختصر */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs sm:text-sm font-black text-slate-900">
            أرشيف فواتير الشراء
          </h2>
          <span className="text-xs text-slate-400 font-bold">({purchases.length})</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:w-56">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالمورد أو الفاتورة..."
              className="w-full pr-7 pl-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
            />
            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="all">جميع الحالات</option>
            <option value="paid">مدفوعة</option>
            <option value="debt">دين مطلوب</option>
            <option value="partial">دفعة جزئية</option>
          </select>

          <button
            type="button"
            onClick={onNewInvoice}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
          >
            <span>+</span>
            <span>فاتورة جديدة</span>
          </button>
        </div>
      </div>

      {/* Archive Table */}
      {filteredPurchases.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <p className="text-xs font-bold text-slate-600">لا توجد فواتير مطابقة للبحث</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5">رقم الفاتورة</th>
                  <th className="p-2.5">المورد</th>
                  <th className="p-2.5">المواد</th>
                  <th className="p-2.5">الشحن</th>
                  <th className="p-2.5">الإجمالي</th>
                  <th className="p-2.5 text-center">الحالة</th>
                  <th className="p-2.5 text-center">المرفق</th>
                  <th className="p-2.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((p) => {
                  const debtDoc = findSupplierDebtRecord(p.supplierName, supplierDebts);
                  const isSupplierSettled = debtDoc && Number(debtDoc.remainingDebt) <= 0;

                  const isPaid = isSupplierSettled || p.paymentStatus === 'paid';
                  const isDebt = !isSupplierSettled && p.paymentStatus === 'debt';
                  const isOpening = Boolean(p.isOpeningDebt) || (!p.items || p.items.length === 0);
                  const hasPdf = isPdfAttachment(p.invoiceImageUrl, p.invoiceFileType);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectInvoice?.(p)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="p-2.5 text-slate-500 font-mono whitespace-nowrap">
                        {p.date ? new Date(p.date).toLocaleDateString('ar-IQ') : '—'}
                      </td>
                      <td className="p-2.5 font-bold font-mono text-slate-900">
                        #{p.invoiceNumber || '—'}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">
                        {p.supplierName}
                      </td>
                      <td className="p-2.5 max-w-xs text-slate-600 truncate">
                        {isOpening ? (
                          <span className="inline-block bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[10px] font-bold">
                            رصيد سابق
                          </span>
                        ) : (
                          (p.items || []).map((i) => `${i.name} (${i.quantity})`).join(', ') || '—'
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-slate-600">
                        {Number(p.shippingCost) > 0 ? `+${formatIQD(p.shippingCost)}` : '—'}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 font-mono">
                        {formatIQD(p.totalAmount)} د.ع
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isPaid
                              ? 'bg-slate-100 text-slate-700'
                              : isDebt
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isPaid ? 'خالص ✓' : isDebt ? 'مطلوب دين' : 'جزئي'}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        {p.invoiceImageUrl ? (
                          <span className="text-xs" title="يوجد مرفق">
                            {hasPdf ? '📑' : '📷'}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectInvoice?.(p)}
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer text-xs"
                            title="عرض"
                          >
                            👁️
                          </button>
                          {!isOpening && onEditInvoice && (
                            <button
                              type="button"
                              onClick={() => onEditInvoice(p)}
                              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer text-xs"
                              title="تعديل"
                            >
                              ✏️
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteInvoice?.(p)}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer text-xs"
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
        </div>
      )}
    </div>
  );
}
