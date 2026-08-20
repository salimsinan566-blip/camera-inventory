import React, { useState } from 'react';
import { returnItemsFromCustody } from '../services/custodyService';
import { useUI } from '../contexts/UIContext';
import { formatProductQty } from '../models/product';

export default function ReturnCustodyModal({ technician, custodyDoc, isOpen, onClose, userName = '' }) {
  const { toast } = useUI();
  const [targetLocation, setTargetLocation] = useState('store'); // 'store' | 'warehouse'
  const [returnQtys, setReturnQtys] = useState({}); // productId -> quantity
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const items = custodyDoc?.items || [];

  const handleQtyChange = (productId, val, maxQty) => {
    const qty = Math.max(0, Math.min(Number(val) || 0, maxQty));
    setReturnQtys(prev => ({ ...prev, [productId]: qty }));
  };

  const handleReturnAll = () => {
    const all = {};
    items.forEach(i => {
      all[i.productId] = Number(i.quantity) || 0;
    });
    setReturnQtys(all);
  };

  const handleClearAll = () => {
    setReturnQtys({});
  };

  const totalReturnCount = Object.values(returnQtys).reduce((sum, q) => sum + (Number(q) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const itemsToReturn = [];
    for (const [pId, q] of Object.entries(returnQtys)) {
      if (Number(q) > 0) {
        itemsToReturn.push({ productId: pId, quantity: Number(q) });
      }
    }

    if (itemsToReturn.length === 0) {
      toast('يرجى تحديد كمية مادة واحدة على الأقل لاسترجاعها', 'error');
      return;
    }

    setLoading(true);
    try {
      await returnItemsFromCustody({
        technicianId: technician.id,
        technicianName: technician.name,
        targetLocation,
        items: itemsToReturn,
        notes,
        performedBy: userName
      });

      toast(`تم استرجاع (${totalReturnCount}) قطعة بنجاح إلى ${targetLocation === 'warehouse' ? 'المخزن' : 'المحل'}! 🔄📦`, 'success');
      setReturnQtys({});
      setNotes('');
      onClose();
    } catch (err) {
      console.error(err);
      toast(`فشل الاسترجاع: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !technician) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner">
              🔄
            </div>
            <div>
              <h3 className="text-base font-bold">استرجاع مواد من السيارة إلى المحل / المخزن</h3>
              <p className="text-xs text-amber-200">
                الفني: <strong className="text-white">{technician.name}</strong> {technician.vehicleNumber ? `| السيارة: ${technician.vehicleNumber}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Target Location */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTargetLocation('store')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                targetLocation === 'store'
                  ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>🏪</span>
              <span>إرجاع إلى المحل</span>
            </button>

            <button
              type="button"
              onClick={() => setTargetLocation('warehouse')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                targetLocation === 'warehouse'
                  ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>🏢</span>
              <span>إرجاع إلى المخزن</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700">
              المواد الموجودة في سيارة الفني حالياً ({items.length}):
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReturnAll}
                className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-lg transition-colors cursor-pointer"
              >
                استرجاع كل المواد
              </button>
              {totalReturnCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  تصفير
                </button>
              )}
            </div>
          </div>

          {/* Custody Items List */}
          {items.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
              <span className="text-3xl block mb-2">🚚💨</span>
              <p className="text-xs">سيارة الفني فارغة حالياً، لا توجد أي مواد في عهدته لاسترجاعها.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {items.map(item => {
                const currentQty = Number(item.quantity) || 0;
                const retQty = returnQtys[item.productId] || 0;
                return (
                  <div key={item.productId} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-500">
                        في السيارة: <strong className="text-indigo-700 font-bold">{formatProductQty(item, currentQty)}</strong>
                        {item.sku ? ` | SKU: ${item.sku}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-500">الكمية المرجعة:</span>
                      <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.productId, retQty - 1, currentQty)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={currentQty}
                          value={retQty}
                          onChange={(e) => handleQtyChange(item.productId, e.target.value, currentQty)}
                          className="w-14 text-center text-xs font-bold py-1 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.productId, retQty + 1, currentQty)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleQtyChange(item.productId, currentQty, currentQty)}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md font-bold"
                        title="إرجاع الكل"
                      >
                        الكل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الاسترجاع (اختياري):</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: فائص بعد انتهاء الموقع، صيانة مؤجلة..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={loading || totalReturnCount === 0}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  <span>جاري تسجيل الاسترجاع وتحديث المخزون...</span>
                </>
              ) : (
                <>
                  <span>🔄 تأكيد استرجاع ({totalReturnCount} قطعة) إلى {targetLocation === 'warehouse' ? 'المخزن' : 'المحل'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
