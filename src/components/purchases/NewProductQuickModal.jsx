import React, { useState } from 'react';
import { CATEGORIES } from '../../models/product';

export default function NewProductQuickModal({
  isOpen,
  onClose,
  onAddProduct,
}) {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    cameraType: CATEGORIES[0] || 'أخرى',
    quantity: 1,
    costPrice: '',
    retailPrice: '',
    location: 'store',
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const cost = Number(formData.costPrice) || 0;
    const retail = Number(formData.retailPrice) || cost;
    const qty = Number(formData.quantity) || 1;

    onAddProduct({
      productId: `new_${Date.now()}`,
      name: formData.name.trim(),
      sku: formData.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
      cameraType: formData.cameraType,
      quantity: qty,
      costPrice: cost,
      oldCostPrice: 0,
      retailPrice: retail,
      oldRetailPrice: 0,
      location: formData.location || 'store',
      isNewProduct: true,
    });

    setFormData({
      name: '',
      sku: '',
      cameraType: CATEGORIES[0] || 'أخرى',
      quantity: 1,
      costPrice: '',
      retailPrice: '',
      location: 'store',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">➕</span>
            <div>
              <h3 className="text-sm font-bold">إضافة صنف جديد كلياً للمخزن</h3>
              <p className="text-[11px] text-slate-400">إدراج مادة غير مسجلة مسبقاً وتوريدها مباشرة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto max-h-[80vh]">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم المادة / الكاميرا *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: كاميرا داهوا 5MP خارجية..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">القسم / التصنيف</label>
              <select
                value={formData.cameraType}
                onChange={(e) => setFormData({ ...formData, cameraType: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مكان الإيداع</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="store">المحل (المعرض)</option>
                <option value="warehouse">المخزن الرئيسي</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المشتراة</label>
              <input
                type="number"
                min="1"
                required
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-indigo-950 mb-1">سعر الشراء (د.ع)</label>
              <input
                type="number"
                min="0"
                required
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                placeholder="25000"
                className="w-full p-2 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-800 mb-1">سعر البيع المقترح</label>
              <input
                type="number"
                min="0"
                value={formData.retailPrice}
                onChange={(e) => setFormData({ ...formData, retailPrice: e.target.value })}
                placeholder="30000"
                className="w-full p-2 bg-white border border-emerald-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الباركود / الرمز (اختياري)
            </label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              placeholder="اتركه فارغاً للتوليد التلقائي"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-xs hover:shadow-md transition-all disabled:opacity-50"
            >
              إضافة الصنف للسلة ✓
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
