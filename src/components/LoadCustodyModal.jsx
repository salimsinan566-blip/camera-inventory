import React, { useState, useMemo } from 'react';
import { loadItemsToCustody } from '../services/custodyService';
import { useUI } from '../contexts/UIContext';
import { formatProductQty } from '../models/product';

export default function LoadCustodyModal({ technician, products = [], isOpen, onClose, userName = '' }) {
  const { toast } = useUI();
  const [sourceLocation, setSourceLocation] = useState('store'); // 'store' | 'warehouse'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // [ { product, quantity: 1 } ]
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Filter products by search term and available stock
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const nameMatch = p.name?.toLowerCase().includes(term);
      const skuMatch = p.sku?.toLowerCase().includes(term);
      const barcodeMatch = p.barcode?.toLowerCase().includes(term);
      const catMatch = p.cameraType?.toLowerCase().includes(term);
      return nameMatch || skuMatch || barcodeMatch || catMatch;
    }).slice(0, 20);
  }, [products, searchTerm]);

  const handleAddItem = (prod) => {
    const existing = selectedItems.find(i => i.product.id === prod.id);
    if (existing) {
      handleQtyChange(prod.id, existing.quantity + 1);
      setSearchTerm('');
      return;
    }
    const avail = sourceLocation === 'warehouse' ? (Number(prod.warehouseQty) || 0) : (Number(prod.storeQty) || 0);
    if (avail <= 0) {
      toast(`المادة غير متوفرة في ${sourceLocation === 'warehouse' ? 'المخزن' : 'المحل'}!`, 'error');
      return;
    }
    setSelectedItems(prev => [...prev, { product: prod, quantity: 1 }]);
    setSearchTerm('');
  };

  const handleRemoveItem = (id) => {
    setSelectedItems(prev => prev.filter(i => i.product.id !== id));
  };

  const handleQtyChange = (id, newQty) => {
    const qty = Math.max(1, Number(newQty) || 1);
    setSelectedItems(prev => prev.map(i => {
      if (i.product.id === id) {
        const avail = sourceLocation === 'warehouse' ? (Number(i.product.warehouseQty) || 0) : (Number(i.product.storeQty) || 0);
        if (qty > avail) {
          toast(`الكمية المتاحة في ${sourceLocation === 'warehouse' ? 'المخزن' : 'المحل'} هي (${avail}) فقط`, 'warn');
          return { ...i, quantity: avail };
        }
        return { ...i, quantity: qty };
      }
      return i;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast('يرجى اختيار مادة واحدة على الأقل لتحميلها', 'error');
      return;
    }

    setLoading(true);
    try {
      await loadItemsToCustody({
        technicianId: technician.id,
        technicianName: technician.name,
        sourceLocation,
        items: selectedItems.map(i => ({
          productId: i.product.id,
          quantity: i.quantity
        })),
        notes,
        performedBy: userName
      });

      toast(`تم تحميل (${selectedItems.reduce((s, i) => s + i.quantity, 0)}) قطعة بنجاح إلى سيارة الفني (${technician.name})! 🚚📦`, 'success');
      setSelectedItems([]);
      setNotes('');
      onClose();
    } catch (err) {
      console.error(err);
      toast(`فشل التحميل: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !technician) return null;

  const totalLoadedQty = selectedItems.reduce((s, i) => s + Number(i.quantity), 0);
  const totalCost = selectedItems.reduce((s, i) => s + (Number(i.product.costPrice) || 0) * Number(i.quantity), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner">
              🚚
            </div>
            <div>
              <h3 className="text-base font-bold">تحميل مواد إلى عهدة الفني / السيارة</h3>
              <p className="text-xs text-indigo-200">
                الفني: <strong className="text-white">{technician.name}</strong> {technician.vehicleNumber ? `| رقم السيارة: ${technician.vehicleNumber}` : ''}
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
          {/* Source Location */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setSourceLocation('store'); setSelectedItems([]); }}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                sourceLocation === 'store'
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>🏪</span>
              <span>الصرف من المحل</span>
            </button>

            <button
              type="button"
              onClick={() => { setSourceLocation('warehouse'); setSelectedItems([]); }}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                sourceLocation === 'warehouse'
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>🏢</span>
              <span>الصرف من المخزن</span>
            </button>
          </div>

          {/* Product Search Box */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ابحث عن المواد لإضافتها إلى السيارة:
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="اكتب اسم الكاميرا، الموديل، SKU، أو امسح الباركود..."
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <span className="absolute right-3 top-2.5 text-slate-400">🔍</span>
            </div>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-56 overflow-y-auto z-20 divide-y divide-slate-100">
                {searchResults.map(p => {
                  const avail = sourceLocation === 'warehouse' ? (Number(p.warehouseQty) || 0) : (Number(p.storeQty) || 0);
                  const isAvailable = avail > 0;
                  return (
                    <div
                      key={p.id}
                      onClick={() => isAvailable && handleAddItem(p)}
                      className={`p-3 flex items-center justify-between hover:bg-indigo-50 transition-colors cursor-pointer ${
                        !isAvailable ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1 pl-2">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {p.sku || p.barcode || '—'} | {p.cameraType || ''}
                        </p>
                      </div>
                      <div className="text-left shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}>
                          متوفر: {formatProductQty(p, avail)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Items List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-700">
                المواد المختارة للتحميل ({selectedItems.length}):
              </h4>
              {selectedItems.length > 0 && (
                <span className="text-xs font-black text-indigo-600">
                  الإجمالي: {totalLoadedQty} قطعة
                </span>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
                <span className="text-3xl block mb-2">📦</span>
                <p className="text-xs">لم تختر أي مواد بعد. استخدم مربع البحث أعلاه لاختيار المواد المراد وضعها في السيارة.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {selectedItems.map(({ product: p, quantity }) => {
                  const avail = sourceLocation === 'warehouse' ? (Number(p.warehouseQty) || 0) : (Number(p.storeQty) || 0);
                  return (
                    <div key={p.id} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">
                          المتوفر بالمصدر: {formatProductQty(p, avail)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, quantity - 1)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={avail}
                            value={quantity}
                            onChange={(e) => handleQtyChange(p.id, e.target.value)}
                            className="w-14 text-center text-xs font-bold py-1 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, quantity + 1)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(p.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / سبب الخروج (اختياري):</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تجهيز مشروع شركة الرافدين، أعمال صيانة دورية..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
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
              disabled={loading || selectedItems.length === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  <span>جاري تسجيل التحميل ونقل المخزون...</span>
                </>
              ) : (
                <>
                  <span>🚚 تأكيد التحميل إلى السيارة ({totalLoadedQty} قطعة)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
