import React, { useState, useMemo } from 'react';
import { useLaborCharges } from '../../hooks/useLaborCharges';
import { addLaborCharge } from '../../services/laborChargesService';
import { createLaborCartItem } from '../../models/sale';

const DEFAULT_TEMPLATES = [
  { name: 'أجور تركيب كاميرا داخلية', price: 10000 },
  { name: 'أجور تركيب كاميرا خارجية', price: 15000 },
  { name: 'برمجة جهاز تسجيل DVR / NVR وربط الهاتف', price: 15000 },
  { name: 'تمديد وتسليك كابلات (لكل نقطة)', price: 10000 },
  { name: 'كشف وصيانة موقعية', price: 25000 },
  { name: 'أجور تركيب شاشة وقاعدة', price: 10000 },
];

export default function PosLaborModal({
  isOpen,
  onClose,
  activeCartItems = [],
  onAddLaborItem,
}) {
  const { laborCharges = [], loading: loadingCharges } = useLaborCharges();
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'custom'
  const [searchQuery, setSearchQuery] = useState('');

  // Custom labor form state
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [submittingCustom, setSubmittingCustom] = useState(false);
  const [error, setError] = useState('');

  // Filter predefined charges by search query
  const filteredCharges = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return laborCharges;
    return laborCharges.filter((c) =>
      (c.name || '').toLowerCase().includes(q)
    );
  }, [laborCharges, searchQuery]);

  if (!isOpen) return null;

  // Add existing labor charge to cart
  const handleSelectPredefined = (charge) => {
    const item = createLaborCartItem(charge);
    onAddLaborItem(item);
  };

  // Add quick template to Firestore and cart
  const handleQuickTemplateAdd = async (tmpl) => {
    try {
      const docRef = await addLaborCharge({
        name: tmpl.name,
        price: Number(tmpl.price) || 0,
      });
      const item = createLaborCartItem({
        id: docRef.id,
        name: tmpl.name,
        price: Number(tmpl.price) || 0,
      });
      onAddLaborItem(item);
    } catch {
      // Fallback: add directly to cart even if saving to db fails
      const item = createLaborCartItem({
        id: `local_${Date.now()}`,
        name: tmpl.name,
        price: Number(tmpl.price) || 0,
      });
      onAddLaborItem(item);
    }
  };

  // Handle adding custom labor charge
  const handleAddCustomLabor = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = customName.trim();
    if (!trimmedName) {
      setError('يرجى إدخال اسم الخدمة أو أجور العمل');
      return;
    }

    const price = Math.max(0, Number(customPrice) || 0);
    const qty = Math.max(1, Number(customQty) || 1);

    setSubmittingCustom(true);
    try {
      let laborId = `custom_${Date.now()}`;

      if (saveAsTemplate) {
        try {
          const docRef = await addLaborCharge({
            name: trimmedName,
            price: price,
          });
          laborId = docRef.id;
        } catch (dbErr) {
          console.error('Failed to save labor charge to DB:', dbErr);
        }
      }

      const item = {
        cartItemId: `labor_${laborId}_${Date.now()}`,
        productId: `labor_${laborId}`,
        sku: '-',
        name: trimmedName,
        quantity: qty,
        unitPrice: price,
        originalPrice: price,
        wholesalePrice: 0,
        availableQuantity: 999999,
        sellMode: 'unit',
        isService: true,
        isCustom: false,
        source: 'service',
        technicianId: null,
        technicianName: '',
        isCustody: false,
      };

      onAddLaborItem(item);

      // Reset form
      setCustomName('');
      setCustomPrice('');
      setCustomQty('1');
      setSaveAsTemplate(false);
      onClose();
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء الإضافة');
    } finally {
      setSubmittingCustom(false);
    }
  };

  // Calculate if item is currently in cart
  const getItemCountInCart = (laborId, laborName) => {
    const targetId = `labor_${laborId}`;
    const found = activeCartItems.find(
      (it) => it.productId === targetId || (it.isService && it.name === laborName)
    );
    return found ? (Number(found.quantity) || 1) : 0;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs select-none"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100/80 border border-amber-200 text-amber-800 flex items-center justify-center text-xl shadow-2xs">
              🛠️
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base leading-tight">
                أجور العمل والخدمات
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                إضافة أجور تركيب أو صيانة أو خدمات إلى السلة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* التبويبات (أجور جاهزة / أجور مخصصة) */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📋</span>
            <span>الخدمات والأجور المسجلة</span>
            {laborCharges.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-black">
                {laborCharges.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>➕</span>
            <span>أجور عمل مخصصة (يدوي)</span>
          </button>
        </div>

        {/* المحتوى */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* تبويب 1: الخدمات المسجلة */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* شريط البحث */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في قائمة أجور العمل..."
                  className="w-full bg-slate-100 hover:bg-white focus:bg-white border border-slate-200 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* قائمة الخدمات */}
              {loadingCharges ? (
                <div className="py-8 text-center text-xs text-slate-400 font-bold">
                  جارٍ تحميل أجور العمل...
                </div>
              ) : filteredCharges.length > 0 ? (
                <div className="grid grid-cols-1 gap-2">
                  {filteredCharges.map((charge) => {
                    const countInCart = getItemCountInCart(charge.id, charge.name);
                    const price = Number(charge.price) || 0;

                    return (
                      <div
                        key={charge.id}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200/90 hover:border-amber-300 hover:bg-amber-50/30 rounded-2xl transition-all shadow-2xs group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs md:text-sm text-slate-800 group-hover:text-amber-900 truncate">
                              {charge.name}
                            </span>
                            {countInCart > 0 && (
                              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 shadow-2xs">
                                في السلة ({countInCart})
                              </span>
                            )}
                          </div>
                          <span className="text-amber-700 font-black text-xs font-mono block mt-0.5">
                            {price.toLocaleString()} د.ع
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectPredefined(charge)}
                          className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>➕</span>
                          <span>إضافة</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : laborCharges.length === 0 ? (
                /* في حالة عدم وجود أجور مسجلة مسبقاً، عرض نماذج جاهزة للإضافة بضغطة واحدة */
                <div className="text-center py-4">
                  <div className="text-3xl mb-2">⚡</div>
                  <h4 className="font-bold text-slate-700 text-xs">
                    لم يتم تسجيل أجور عمل مسبقاً
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 mb-4">
                    يمكنك اختيار أحد النماذج الشائعة بالأسفل لإضافتها فوراً:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-right">
                    {DEFAULT_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuickTemplateAdd(tmpl)}
                        className="p-2.5 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-xl transition-all cursor-pointer flex items-center justify-between group active:scale-95"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-slate-700 group-hover:text-amber-800 block truncate">
                            {tmpl.name}
                          </span>
                          <span className="text-[10px] font-bold font-mono text-amber-600">
                            {tmpl.price.toLocaleString()} د.ع
                          </span>
                        </div>
                        <span className="text-amber-600 font-bold text-xs shrink-0 mr-2">
                          + إضافة
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  لا توجد نتائج تطابق: "{searchQuery}"
                </div>
              )}
            </div>
          )}

          {/* تبويب 2: أجور مخصصة يدوية */}
          {activeTab === 'custom' && (
            <form onSubmit={handleAddCustomLabor} className="space-y-3.5">
              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الخدمة أو أجور العمل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أجور تسليك وتثبيت 4 كاميرات..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    السعر الإفرادي (د.ع) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    required
                    placeholder="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    العدد / الكمية
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-amber-500 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 hover:bg-amber-50/50 rounded-xl border border-slate-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    حفظ هذه الخدمة دائماً في قائمة أجور العمل للنظام
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submittingCustom}
                className="w-full mt-2 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>➕</span>
                <span>{submittingCustom ? 'جارٍ الحفظ...' : 'إضافة إلى السلة الفعّالة'}</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs font-bold text-slate-500">
          <span>* أجور العمل لا تستهلك أي رصيد مخزني</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
