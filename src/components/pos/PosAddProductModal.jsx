import React, { useState } from 'react';
import { createCustomCartItem, createSitePurchaseCartItem } from '../../models/sale';

export default function PosAddProductModal({
  isOpen,
  onClose,
  onAddItemToCart,
}) {
  const [activeTab, setActiveTab] = useState('custom'); // 'custom' | 'site_purchase'

  // Custom Item Form
  const [customForm, setCustomForm] = useState({
    name: '',
    unitPrice: '',
    quantity: '1',
    wholesalePrice: '',
    notes: '',
  });

  // Site Purchase Form
  const [siteForm, setSiteForm] = useState({
    name: '',
    purchaseCost: '',
    sellingPrice: '',
    quantity: '1',
    paymentSource: 'cash_drawer', // 'cash_drawer' | 'mastercard'
    notes: '',
  });

  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddCustom = (e) => {
    e.preventDefault();
    setError('');
    if (!customForm.name.trim()) {
      setError('يرجى إدخال اسم المنتج أو الخدمة');
      return;
    }
    const price = Math.max(0, Number(customForm.unitPrice) || 0);
    const qty = Math.max(1, Number(customForm.quantity) || 1);
    const cost = Math.max(0, Number(customForm.wholesalePrice) || 0);

    const item = createCustomCartItem({
      name: customForm.name.trim(),
      unitPrice: price,
      quantity: qty,
      wholesalePrice: cost,
      notes: customForm.notes.trim(),
    });

    onAddItemToCart(item);
    setCustomForm({ name: '', unitPrice: '', quantity: '1', wholesalePrice: '', notes: '' });
    onClose();
  };

  const handleAddSitePurchase = (e) => {
    e.preventDefault();
    setError('');
    if (!siteForm.name.trim()) {
      setError('يرجى إدخال اسم المادة المشتراة');
      return;
    }
    const cost = Math.max(0, Number(siteForm.purchaseCost) || 0);
    const price = Math.max(0, Number(siteForm.sellingPrice) || 0);
    const qty = Math.max(1, Number(siteForm.quantity) || 1);

    if (cost <= 0) {
      setError('يرجى تحديد تكلفة الشراء الفعلية');
      return;
    }

    const item = createSitePurchaseCartItem({
      name: siteForm.name.trim(),
      purchaseCost: cost,
      sellingPrice: price || cost,
      quantity: qty,
      paymentSource: siteForm.paymentSource,
      notes: siteForm.notes.trim(),
    });

    onAddItemToCart(item);
    setSiteForm({ name: '', purchaseCost: '', sellingPrice: '', quantity: '1', paymentSource: 'cash_drawer', notes: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs select-none" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">➕</span>
            <div>
              <h3 className="font-bold text-slate-800 text-base">إضافة بند إلى السلة</h3>
              <p className="text-xs text-slate-400">اختر نوع البند المطلوب إدراجه في الفاتورة الحالية</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector (2 Options) */}
        <div className="p-4 border-b border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('custom'); setError(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            منتج / خدمة مخصصة
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('site_purchase'); setError(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'site_purchase'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            شراء موقعي خارجي
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl p-3 mb-4">
              {error}
            </div>
          )}

          {activeTab === 'custom' ? (
            <form onSubmit={handleAddCustom} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنتج أو الخدمة *</label>
                <input
                  type="text"
                  autoFocus
                  value={customForm.name}
                  onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                  placeholder="مثال: صيانة جهاز، كابل إضافي، أجور تركيب..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر البيع (د.ع) *</label>
                  <input
                    type="number"
                    value={customForm.unitPrice}
                    onChange={(e) => setCustomForm({ ...customForm, unitPrice: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية</label>
                  <input
                    type="number"
                    min="1"
                    value={customForm.quantity}
                    onChange={(e) => setCustomForm({ ...customForm, quantity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سعر التكلفة (اختياري لحساب الربح)</label>
                <input
                  type="number"
                  value={customForm.wholesalePrice}
                  onChange={(e) => setCustomForm({ ...customForm, wholesalePrice: e.target.value })}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-indigo-500 outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  إضافة إلى السلة الفعّالة
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddSitePurchase} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المادة المشتراة موقعياً *</label>
                <input
                  type="text"
                  autoFocus
                  value={siteForm.name}
                  onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}
                  placeholder="مثال: هارد ديسك مشتراه من السوق، مفتاح كهرباء..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تكلفة الشراء (د.ع) *</label>
                  <input
                    type="number"
                    value={siteForm.purchaseCost}
                    onChange={(e) => setSiteForm({ ...siteForm, purchaseCost: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر البيع للزبون (د.ع)</label>
                  <input
                    type="number"
                    value={siteForm.sellingPrice}
                    onChange={(e) => setSiteForm({ ...siteForm, sellingPrice: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية</label>
                  <input
                    type="number"
                    min="1"
                    value={siteForm.quantity}
                    onChange={(e) => setSiteForm({ ...siteForm, quantity: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مصدر دفع التكلفة</label>
                  <select
                    value={siteForm.paymentSource}
                    onChange={(e) => setSiteForm({ ...siteForm, paymentSource: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:border-amber-500 outline-none cursor-pointer"
                  >
                    <option value="cash_drawer">صندوق المحل (القاصة)</option>
                    <option value="mastercard">بطاقة ماستر كارد</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  إضافة شراء موقعي إلى السلة
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
