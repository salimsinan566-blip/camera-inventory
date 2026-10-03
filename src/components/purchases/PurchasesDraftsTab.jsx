import React from 'react';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function PurchasesDraftsTab({
  draftPurchases = [],
  onLoadDraft,
  onDeleteDraft,
  onNewInvoice,
}) {
  return (
    <div className="space-y-3.5 animate-fade-in" dir="rtl">
      {/* Header - رسمي ومختصر */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs sm:text-sm font-black text-slate-900">
            مسودات فواتير الشراء
          </h2>
          <span className="text-xs text-slate-400 font-bold">({draftPurchases.length})</span>
        </div>

        <button
          type="button"
          onClick={onNewInvoice}
          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>+</span>
          <span>فاتورة جديدة</span>
        </button>
      </div>

      {/* Grid */}
      {draftPurchases.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <p className="text-xs font-bold text-slate-600">لا توجد مسودات معلقة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {draftPurchases.map((draft) => {
            const items = draft.items || [];
            const total = Number(draft.totalAmount) || 0;
            const pieces = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);

            return (
              <div
                key={draft.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-400 transition-all p-3.5 flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                        مسودة
                      </span>
                      <h3 className="text-xs font-black text-slate-900 mt-1 truncate">
                        {draft.supplierName || 'بدون اسم مورد'}
                      </h3>
                      {draft.invoiceNumber && (
                        <span className="text-[11px] font-mono text-slate-400 block">
                          #{draft.invoiceNumber}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {draft.date || draft.createdAt
                        ? new Date(draft.date || draft.createdAt).toLocaleDateString('ar-IQ')
                        : '—'}
                    </span>
                  </div>

                  {/* Items summary */}
                  <div className="mt-2.5 py-1.5 border-y border-slate-100 text-xs text-slate-600 flex items-center justify-between">
                    <span>
                      {items.length} أصناف ({pieces} قطعة)
                    </span>
                    <span className="font-black font-mono text-slate-900">
                      {formatIQD(total)} د.ع
                    </span>
                  </div>

                  {items.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
                      {items.map((i) => i.name).join('، ')}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onDeleteDraft(draft.id, draft.supplierName)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded text-xs font-bold transition-colors cursor-pointer"
                    title="حذف المسودة"
                  >
                    حذف
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadDraft(draft)}
                    className="flex-1 py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    استئناف الفاتورة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
