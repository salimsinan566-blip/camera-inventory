import React, { useEffect, useState } from 'react';
import { getProductInventoryLogs, LOG_TYPE_LABELS_AR, LOG_TYPES } from '../services/inventoryLogsService';

export default function ProductHistoryModal({ product, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      if (!product?.id) return;
      setLoading(true);
      try {
        const data = await getProductInventoryLogs(product.id, 50);
        setLogs(data);
      } catch (err) {
        console.error('Error loading product history:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [product]);

  const formatQty = (qty) => {
    const num = Number(qty || 0);
    if (product.sellMode === 'meter') {
      const mpr = Number(product.metersPerRoll) || 305;
      if (mpr <= 0) return `${num} م`;
      const rolls = Math.floor(num / mpr);
      const meters = num % mpr;
      if (rolls > 0 && meters > 0) return `${rolls} لفة و ${meters} م`;
      if (rolls > 0) return `${rolls} لفة`;
      return `${meters} م`;
    }
    return `${num} ق`;
  };

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case LOG_TYPES.MANUAL_EDIT:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case LOG_TYPES.TRANSFER:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case LOG_TYPES.SALE:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case LOG_TYPES.SALE_RETURN:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case LOG_TYPES.INVENTORY_AUDIT:
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case LOG_TYPES.CREATED:
        return 'bg-green-100 text-green-800 border-green-200';
      case LOG_TYPES.DELETED:
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-ink-100 text-ink-800 border-ink-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-brand-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-900 text-white flex justify-between items-center relative">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-white/10 rounded-lg text-brand-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <h3 className="font-black text-lg text-white">سجل حركات وتغييرات المخزون</h3>
            </div>
            <p className="text-xs text-brand-200 mt-1 font-medium">
              {product.name} {product.sku ? `(SKU: ${product.sku})` : ''}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Balance Overview */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-brand-50/70 border-b border-brand-100 text-center">
          <div className="bg-white p-2.5 rounded-xl border border-brand-200/60 shadow-2xs">
            <span className="text-xs text-ink-500 font-medium block">الرصيد الحالي بالمحل</span>
            <span className="text-base font-black text-brand-700">{formatQty(product.storeQty)}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-brand-200/60 shadow-2xs">
            <span className="text-xs text-ink-500 font-medium block">الرصيد الحالي بالمخزن</span>
            <span className="text-base font-black text-indigo-700">{formatQty(product.warehouseQty)}</span>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center text-ink-500">
              <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm font-medium">جارٍ تحميل سجل الحركات...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-ink-500">
              <div className="w-12 h-12 bg-brand-50 text-brand-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-ink-700">لا توجد حركات مسجلة لهذا المنتج بعد</p>
              <p className="text-xs text-ink-400 mt-1">سيتم توثيق أي تعديل جديد على الكميات تلقائياً هنا</p>
            </div>
          ) : (
            <div className="relative border-r-2 border-brand-200 pr-6 space-y-6 mr-3">
              {logs.map((log) => {
                const date = log.createdAt?.toDate ? log.createdAt.toDate() : new Date();
                const typeLabel = LOG_TYPE_LABELS_AR[log.type] || log.type;

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Point */}
                    <div className="absolute -right-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-600 border-2 border-white shadow-xs group-hover:scale-125 transition-transform"></div>

                    <div className="bg-white border border-brand-100 rounded-xl p-3.5 shadow-xs hover:border-brand-300 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getTypeBadgeStyle(log.type)}`}>
                            {typeLabel}
                          </span>
                          {log.reason && (
                            <span className="text-xs text-ink-700 font-medium bg-ink-50 px-2 py-0.5 rounded border border-ink-100">
                              السبب: {log.reason}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-ink-400">
                          {date.toLocaleString('ar-IQ')}
                        </span>
                      </div>

                      {/* Quantity Changes details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mt-2.5 pt-2.5 border-t border-brand-50">
                        {log.previousStoreQty !== null && log.newStoreQty !== null && (
                          <div className="bg-brand-50/50 p-2 rounded-lg flex items-center justify-between">
                            <span className="text-ink-600 font-medium">المحل:</span>
                            <div className="flex items-center gap-1.5 font-mono font-bold" dir="ltr">
                              <span className="text-ink-500">{formatQty(log.previousStoreQty)}</span>
                              <span className="text-ink-400">➔</span>
                              <span className="text-brand-700">{formatQty(log.newStoreQty)}</span>
                              {log.storeQtyDiff !== 0 && (
                                <span className={`text-[10px] px-1 rounded ${log.storeQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  ({log.storeQtyDiff > 0 ? `+${log.storeQtyDiff}` : log.storeQtyDiff})
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {log.previousWarehouseQty !== null && log.newWarehouseQty !== null && (
                          <div className="bg-indigo-50/50 p-2 rounded-lg flex items-center justify-between">
                            <span className="text-ink-600 font-medium">المخزن:</span>
                            <div className="flex items-center gap-1.5 font-mono font-bold" dir="ltr">
                              <span className="text-ink-500">{formatQty(log.previousWarehouseQty)}</span>
                              <span className="text-ink-400">➔</span>
                              <span className="text-indigo-700">{formatQty(log.newWarehouseQty)}</span>
                              {log.warehouseQtyDiff !== 0 && (
                                <span className={`text-[10px] px-1 rounded ${log.warehouseQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  ({log.warehouseQtyDiff > 0 ? `+${log.warehouseQtyDiff}` : log.warehouseQtyDiff})
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* User Footnote */}
                      <div className="mt-2 text-[11px] text-ink-400 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>بواسطة: {log.userEmail || 'المستخدم'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-ink-50 border-t border-brand-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white border border-brand-200 text-ink-800 font-bold text-sm hover:bg-brand-50 transition-colors shadow-2xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
