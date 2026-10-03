import React, { useRef, useMemo } from 'react';
import { reconcileSingleInvoice } from '../../utils/supplierDebtReconciliation';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function isPdfAttachment(url, fileType) {
  if (fileType === 'pdf') return true;
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');
}

export default function PurchaseInvoiceDetailsModal({
  isOpen,
  onClose,
  invoice,
  supplierDebts = [],
  allPurchases = [],
  onEditInvoice,
  onDeleteInvoice,
  onPayDebt,
  onViewAttachment,
  onSyncPricesToInventory,
}) {
  const printableAreaRef = useRef(null);
  const [syncingPrices, setSyncingPrices] = React.useState(false);

  const reconciled = useMemo(() => {
    if (!invoice) return null;
    return reconcileSingleInvoice(invoice, supplierDebts, allPurchases);
  }, [invoice, supplierDebts, allPurchases]);

  if (!isOpen || !invoice) return null;

  const isOpening = Boolean(invoice.isOpeningDebt) || (!invoice.items || invoice.items.length === 0);
  const items = invoice.items || [];
  const itemsTotal =
    invoice.itemsTotalAmount ||
    items.reduce((s, it) => s + (Number(it.quantity) || 1) * (Number(it.costPrice || it.baseCostPrice) || 0), 0);
  const shipping = Number(invoice.shippingCost) || 0;
  const grandTotal = reconciled?.computedTotal || invoice.totalAmount || (itemsTotal + shipping);
  const paid = reconciled ? Number(reconciled.computedPaid) : Number(invoice.paidAmount) || 0;
  const remaining = reconciled ? Number(reconciled.computedRemaining) : Math.max(0, grandTotal - paid);

  const isPaid = remaining <= 0;
  const isPartial = remaining > 0 && paid > 0;

  const hasAttachment = Boolean(invoice.invoiceImageUrl);
  const hasPdf = isPdfAttachment(invoice.invoiceImageUrl, invoice.invoiceFileType);

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - رسمي ومختصر */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-base">{isOpening ? '📝' : '📦'}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black">
                  {isOpening ? 'سند دين سابق (رصيد افتتاحي)' : 'تفاصيل فاتورة الشراء'}
                </h3>
                <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                  #{invoice.invoiceNumber || '—'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {invoice.supplierName} • {invoice.date ? new Date(invoice.date).toLocaleDateString('ar-IQ') : '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer transition-colors border border-slate-700"
              title="طباعة"
            >
              طباعة
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable / Viewable Body */}
        <div ref={printableAreaRef} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Top Info Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Supplier */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">المورد:</span>
              <span className="text-xs font-black text-slate-900 block truncate mt-0.5">
                {invoice.supplierName}
              </span>
              {invoice.supplierPhone && (
                <span className="text-[11px] font-mono text-slate-500 block truncate" dir="ltr">
                  {invoice.supplierPhone}
                </span>
              )}
            </div>

            {/* Date */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">التاريخ:</span>
              <span className="text-xs font-bold font-mono text-slate-800 block mt-0.5">
                {invoice.date ? new Date(invoice.date).toLocaleDateString('ar-IQ') : '—'}
              </span>
              {invoice.createdBy && (
                <span className="text-[10px] text-slate-400 block truncate">
                  بواسطة: {invoice.createdBy}
                </span>
              )}
            </div>

            {/* Total */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] font-bold text-slate-400 block">الإجمالي الكلي:</span>
              <span className="text-xs font-black font-mono text-slate-900 block mt-0.5">
                {formatIQD(grandTotal)} د.ع
              </span>
              {shipping > 0 && (
                <span className="text-[10px] text-slate-500 block">
                  (يشمل {formatIQD(shipping)} شحن)
                </span>
              )}
            </div>

            {/* Status & Debt */}
            <div
              className={`rounded-xl p-2.5 border ${
                remaining > 0
                  ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <span className="text-[10px] font-bold block flex items-center justify-between">
                <span>الحالة:</span>
                <span className="text-[10px]">
                  {isPaid ? 'خالص ✓' : isPartial ? 'مسدد جزئياً' : 'مطلوب دين'}
                </span>
              </span>
              <span className="text-xs font-black font-mono block mt-0.5">
                {remaining > 0 ? `متبقي: ${formatIQD(remaining)} د.ع` : 'مسدد بالكامل'}
              </span>
              {paid > 0 && remaining > 0 && (
                <span className="text-[10px] text-slate-500 block">
                  مسدد: {formatIQD(paid)} د.ع
                </span>
              )}
            </div>
          </div>

          {/* Out of Pocket Notice if applicable */}
          {invoice.paidOutOfPocket && Number(invoice.outOfPocketAmount) > 0 && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center justify-between">
              <span>
                دفع الموظف ({invoice.outOfPocketEmployeeName || 'الموظف'}) مبلغ{' '}
                <strong>{formatIQD(invoice.outOfPocketAmount)} د.ع</strong> من جيبه الخاص.
              </span>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                من الجيب الخاص
              </span>
            </div>
          )}

          {/* Items Table (if purchase invoice) */}
          {!isOpening && items.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <h4 className="font-bold text-slate-800">
                  المواد الموردة ({items.length} أصناف)
                </h4>
                <span className="text-slate-500 font-mono">
                  {items.reduce((s, i) => s + (Number(i.quantity) || 1), 0)} قطعة
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2 text-center w-8">#</th>
                      <th className="p-2">المادة</th>
                      <th className="p-2 text-center">الكمية</th>
                      <th className="p-2">السعر</th>
                      {shipping > 0 && <th className="p-2">الشحن/قطعة</th>}
                      {shipping > 0 && <th className="p-2">التكلفة</th>}
                      <th className="p-2 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const qty = Number(it.quantity) || 1;
                      const cost = Number(it.costPrice || it.baseCostPrice) || 0;
                      const lineTotal = qty * cost;
                      const unitShip = Number(it.unitShippingCost) || 0;
                      const effective = Number(it.effectiveCostPrice) || (cost + unitShip);

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2">
                            <span className="font-bold text-slate-900 block">{it.name}</span>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                              {it.cameraType && <span>{it.cameraType}</span>}
                              {it.location && (
                                <span className="bg-slate-100 px-1 rounded">
                                  {it.location === 'store' ? 'المحل' : 'المخزن'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center font-bold font-mono text-slate-800">
                            {qty}
                          </td>
                          <td className="p-2 font-mono text-slate-700">
                            {formatIQD(cost)} د.ع
                          </td>
                          {shipping > 0 && (
                            <td className="p-2 font-mono text-slate-600">
                              +{formatIQD(unitShip)}
                            </td>
                          )}
                          {shipping > 0 && (
                            <td className="p-2 font-mono font-bold text-slate-900">
                              {formatIQD(effective)} د.ع
                            </td>
                          )}
                          <td className="p-2 text-left font-bold font-mono text-slate-900">
                            {formatIQD(lineTotal)} د.ع
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes & Attachments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {invoice.notes && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-400 block">الملاحظات:</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {hasAttachment && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">المرفقات:</span>
                  <span className="font-bold text-slate-800 text-xs block mt-0.5">
                    {invoice.invoiceFileName || (hasPdf ? 'ملف PDF' : 'صورة الفاتورة')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onViewAttachment?.({
                      url: invoice.invoiceImageUrl,
                      type: hasPdf ? 'pdf' : 'image',
                      title: `مرفق فاتورة #${invoice.invoiceNumber || ''}`,
                    })
                  }
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  معاينة المرفق
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Delete */}
          <button
            type="button"
            onClick={() => onDeleteInvoice(invoice)}
            className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
            title="حذف الفاتورة واسترجاع المخزون"
          >
            حذف الفاتورة
          </button>

          <div className="flex items-center gap-2">
            {/* Pay Debt Button ONLY if remaining > 0 */}
            {remaining > 0 && onPayDebt && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPayDebt({
                    supplierName: invoice.supplierName,
                    remainingDebt: remaining,
                    supplierPhone: invoice.supplierPhone || '',
                  });
                }}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
              >
                تسديد المتبقي ({formatIQD(remaining)} د.ع)
              </button>
            )}

            {/* Sync Wholesale Prices Button */}
            {!isOpening && items.length > 0 && onSyncPricesToInventory && (
              <button
                type="button"
                disabled={syncingPrices}
                onClick={async () => {
                  setSyncingPrices(true);
                  try {
                    await onSyncPricesToInventory(invoice);
                  } finally {
                    setSyncingPrices(false);
                  }
                }}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="تحديث أسعار الجملة (التكلفة) للمواد في المخزون وفقاً لأسعار هذه الفاتورة"
              >
                <span>{syncingPrices ? '⏳' : '🏷️'}</span>
                <span>{syncingPrices ? 'جاري التحديث...' : 'تطبيق أسعار الجملة بالمخزون'}</span>
              </button>
            )}

            {/* Edit Invoice (if not opening debt) */}
            {!isOpening && onEditInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditInvoice(invoice);
                }}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                تعديل الفاتورة
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
