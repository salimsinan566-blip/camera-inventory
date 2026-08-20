import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import {
  CATEGORIES,
  createEmptyProduct,
  validateProduct,
  calculateRetailPrice,
} from '../models/product';
import { createProduct, updateProduct, isSkuTaken } from '../services/productsService';
import { uploadProductImage } from '../services/storageService';

export default function ProductForm({ product, products = [], onClose }) {
  const { user } = useAuth();
  const isEditing = Boolean(product && product.id);
  const [form, setForm] = useState(product ? { 
    ...product, 
    sellMode: product.sellMode || (product.cameraType === 'Cables & Connectors' ? 'meter' : 'unit'), 
    metersPerRoll: product.metersPerRoll || 305 
  } : createEmptyProduct());
  const [changeReason, setChangeReason] = useState('');
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  // حاسبة الكيبلات
  const [storeCalcRolls, setStoreCalcRolls] = useState('');
  const [storeCalcMeters, setStoreCalcMeters] = useState('');
  const [warehouseCalcRolls, setWarehouseCalcRolls] = useState('');
  const [warehouseCalcMeters, setWarehouseCalcMeters] = useState('');

  const updateStoreFromCalc = (rolls, meters) => {
    setStoreCalcRolls(rolls);
    setStoreCalcMeters(meters);
    const r = Number(rolls) || 0;
    const m = Number(meters) || 0;
    handleChange('storeQty', (r * (form.metersPerRoll || 305)) + m);
  };

  const updateWarehouseFromCalc = (rolls, meters) => {
    setWarehouseCalcRolls(rolls);
    setWarehouseCalcMeters(meters);
    const r = Number(rolls) || 0;
    const m = Number(meters) || 0;
    handleChange('warehouseQty', (r * (form.metersPerRoll || 305)) + m);
  };
  const [currency, setCurrency] = useState('IQD');
  const [exchangeRate, setExchangeRate] = useState(1500);

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    setErrors([]);
    try {
      const url = await uploadProductImage(file);
      handleChange('imageUrl', url);
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setUploading(false);
    }
  }
  const { settings } = useSettings();

  const dynamicCategories = React.useMemo(() => {
    const deletedList = settings?.deletedCategories || [];
    const set = new Set([
      ...CATEGORIES,
      ...(settings?.categories || []),
      ...products.map(p => p.cameraType || p.category).filter(Boolean)
    ]);
    deletedList.forEach(delCat => {
      if (!products.some(p => (p.cameraType === delCat || p.category === delCat))) {
        set.delete(delCat);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
  }, [settings?.categories, settings?.deletedCategories, products]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePricingChange(field, value, isRetail = false) {
    setForm((prev) => {
      const updated = { ...prev };
      
      // حفظ القيمة الأصلية المكتوبة كما هي لتجنب مشاكل كتابة الكسور والصفر
      if (currency === 'USD') {
        updated[`${field}USD`] = value;
        const numVal = parseFloat(value);
        updated[field] = isNaN(numVal) ? '' : numVal * exchangeRate;
      } else {
        updated[field] = value;
      }

      // إذا تم تغيير سعر الجملة أو نسبة الربح، نحسب سعر المفرد
      if (field === 'wholesalePrice' || field === 'profitMargin') {
        const wp = Number(updated.wholesalePrice) || 0;
        const pm = Number(updated.profitMargin) || 0;
        updated.retailPrice = calculateRetailPrice(wp, pm);
        if (currency === 'USD') {
          updated.retailPriceUSD = (updated.retailPrice / exchangeRate).toString();
        }
      }
      
      // إذا تم تغيير سعر المفرد يدوياً، نحسب نسبة الربح
      if (field === 'retailPrice') {
        const wp = Number(updated.wholesalePrice) || 0;
        const rp = Number(updated.retailPrice) || 0;
        if (wp > 0) {
          updated.profitMargin = Number((((rp - wp) / wp) * 100).toFixed(2));
        } else {
          updated.profitMargin = 0;
        }
      }

      return updated;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);

    const validationErrors = validateProduct(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      const skuTaken = await isSkuTaken(form.sku.trim(), isEditing ? product.id : null);
      if (skuTaken) {
        setErrors(['رقم SKU هذا مستخدم من قبل منتج آخر — يرجى استخدام رقم فريد']);
        setSaving(false);
        return;
      }

      if (isEditing) {
        await updateProduct(product.id, form, user?.email || '', changeReason);
      } else {
        await createProduct(form, user?.email || '');
      }
      onClose();
    } catch (err) {
      setErrors([`حدث خطأ أثناء الحفظ: ${err.message}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-ink-100">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-ink-900 tracking-tight">
              {isEditing ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-50 text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {errors.length > 0 && (
            <div className="bg-danger-50 border border-danger-200 text-danger-800 text-sm rounded-xl p-4 mb-6 shadow-sm">
              <ul className="list-disc pr-5 space-y-1 font-medium">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-ink-200 rounded-xl bg-ink-50/50 hover:bg-ink-50 transition-colors relative group">
              {form.imageUrl ? (
                <div className="relative w-32 h-32 mb-3 group-hover:scale-105 transition-transform">
                  <img src={form.imageUrl} alt="Product preview" className="w-full h-full object-cover rounded-xl shadow-md border border-ink-200" />
                  <button
                    type="button"
                    onClick={() => handleChange('imageUrl', null)}
                    className="absolute -top-3 -right-3 bg-danger-500 hover:bg-danger-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                    title="حذف الصورة"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-brand-500 border border-ink-100 group-hover:shadow-md transition-shadow">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
              )}
              
              <label className="cursor-pointer text-sm font-bold text-brand-600 hover:text-brand-700 transition-colors">
                {uploading ? 'جارٍ الرفع...' : (form.imageUrl ? 'تغيير صورة المنتج' : 'إضافة صورة للمنتج (اختياري)')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
              {!form.imageUrl && !uploading && (
                <p className="text-xs text-ink-400 mt-1">يُفضل استخدام صور بخلفية بيضاء (1:1)</p>
              )}
            </div>

            <Field label="اسم المنتج *">
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input"
                placeholder="أدخل اسم المنتج بدقة..."
              />
            </Field>

            <Field label="رقم SKU *">
              <input
                type="text"
                value={form.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
                className="input font-mono text-left"
                disabled={isEditing}
                placeholder="مثال: CAM-001"
                dir="ltr"
              />
              {isEditing && (
                <p className="text-xs text-ink-500 mt-1.5 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                  لا يمكن تعديل SKU بعد الإنشاء لضمان تسلسل المخزون
                </p>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="الشركة المصنعة / العلامة التجارية">
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => handleChange('company', e.target.value)}
                  className="input"
                  placeholder="مثال: Hikvision, Dahua..."
                />
              </Field>

              <Field label="الموديل">
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  className="input font-mono text-left"
                  dir="ltr"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Field label="نوع المنتج (القسم)">
                <div className="flex gap-3">
                  <select
                    value={dynamicCategories.includes(form.cameraType) ? form.cameraType : 'OTHER'}
                    onChange={(e) => {
                      const newType = e.target.value !== 'OTHER' ? e.target.value : '';
                      handleChange('cameraType', newType);
                      if (newType === 'Cables & Connectors') {
                        handleChange('sellMode', form.sellMode === 'unit' ? 'meter' : form.sellMode);
                      } else {
                        handleChange('sellMode', 'unit');
                      }
                    }}
                    className={`input ${!dynamicCategories.includes(form.cameraType) ? 'w-1/3' : 'w-full'}`}
                  >
                    {dynamicCategories.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                    <option value="OTHER">+ إضافة قسم جديد...</option>
                  </select>
                  
                  {!dynamicCategories.includes(form.cameraType) && (
                    <input
                      type="text"
                      value={form.cameraType}
                      onChange={(e) => handleChange('cameraType', e.target.value)}
                      className="input w-2/3 border-brand-300 focus:border-brand-500 ring-2 ring-brand-100"
                      placeholder="اكتب اسم القسم أو النوع الجديد هنا..."
                      autoFocus
                    />
                  )}
                </div>
              </Field>
            </div>

            <div className="bg-ink-50/50 rounded-xl p-4 border border-ink-100 space-y-4">
              <h3 className="text-xs font-bold text-ink-500 uppercase tracking-wider">المخزون</h3>

              {form.cameraType === 'Cables & Connectors' && (
                <div className="bg-brand-50/50 rounded-xl p-4 border border-brand-100 space-y-4 mb-4">
                  <h3 className="text-sm font-bold text-brand-800">إعدادات الكيبل والقياس</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="طريقة البيع (للكيبلات أو الملحقات)">
                      <select 
                        value={form.sellMode || 'meter'}
                        onChange={e => handleChange('sellMode', e.target.value)}
                        className="input font-bold"
                      >
                        <option value="meter">يباع بالمتر (ويحسب من اللفات)</option>
                        <option value="roll">يباع باللفة كاملة فقط</option>
                        <option value="unit">يباع بالقطعة (للفيش والوصلات)</option>
                      </select>
                    </Field>
                    {(form.sellMode === 'meter' || form.sellMode === 'roll') && (
                      <Field label="طول اللفة (بالمتر) *">
                        <input 
                          type="number" 
                          min="1" 
                          value={form.metersPerRoll || 305}
                          onChange={e => handleChange('metersPerRoll', Number(e.target.value) || 0)}
                          className="input"
                        />
                      </Field>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label={`كمية المحل (${form.sellMode === 'meter' ? 'بالمتر' : form.sellMode === 'roll' ? 'باللفة' : 'قطعة'}) *`}>
                  <input
                    type="number"
                    min="0"
                    value={form.storeQty}
                    onChange={(e) => handleChange('storeQty', e.target.value)}
                    className="input font-medium"
                  />
                </Field>

                <Field label={`كمية المخزن (${form.sellMode === 'meter' ? 'بالمتر' : form.sellMode === 'roll' ? 'باللفة' : 'قطعة'}) *`}>
                  <input
                    type="number"
                    min="0"
                    value={form.warehouseQty}
                    onChange={(e) => handleChange('warehouseQty', e.target.value)}
                    className="input font-medium"
                  />
                </Field>
              </div>

              {form.cameraType === 'Cables & Connectors' && form.sellMode === 'meter' && (
                <div className="text-xs text-brand-600 p-3 bg-brand-50 rounded-lg border border-brand-100 mt-4">
                  <label className="font-bold mb-3 block flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    حاسبة الإدخال السريع (لفة + متر) للمخزون:
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-16 font-bold text-ink-700">المحل:</span>
                      <input type="number" placeholder="كم لفة؟" className="input py-1.5 text-sm" value={storeCalcRolls} onChange={e => updateStoreFromCalc(e.target.value, storeCalcMeters)} />
                      <span className="font-bold">+</span>
                      <input type="number" placeholder="كم متر؟" className="input py-1.5 text-sm" value={storeCalcMeters} onChange={e => updateStoreFromCalc(storeCalcRolls, e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 font-bold text-ink-700">المخزن:</span>
                      <input type="number" placeholder="كم لفة؟" className="input py-1.5 text-sm" value={warehouseCalcRolls} onChange={e => updateWarehouseFromCalc(e.target.value, warehouseCalcMeters)} />
                      <span className="font-bold">+</span>
                      <input type="number" placeholder="كم متر؟" className="input py-1.5 text-sm" value={warehouseCalcMeters} onChange={e => updateWarehouseFromCalc(warehouseCalcRolls, e.target.value)} />
                    </div>
                  </div>
                  <p className="mt-3 text-ink-500">الكمية ستُضاف تلقائياً في خانات كمية المحل والمخزن بالأعلى كمجموع أمتار.</p>
                </div>
              )}
              
              <div className="flex items-center justify-between bg-white border border-ink-200 rounded-lg p-3 shadow-sm mt-4">
                <span className="text-sm font-medium text-ink-600">إجمالي القطع المتوفرة</span>
                <span className="font-bold text-brand-600 text-lg">
                  {(Number(form.storeQty) || 0) + (Number(form.warehouseQty) || 0)}
                </span>
              </div>
            </div>

            <div className="bg-ink-50/50 rounded-xl p-4 border border-ink-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-ink-500 uppercase tracking-wider">التسعير</h3>
                <div className="flex flex-wrap items-center gap-3">
                  {currency === 'USD' && (
                    <div className="flex items-center gap-2 text-xs">
                      <label className="text-ink-600 font-medium">سعر الصرف:</label>
                      <input 
                        type="number" 
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(Number(e.target.value) || 1500)}
                        className="border border-ink-200 rounded px-2 py-1 w-20 text-center font-bold"
                        title="سعر صرف الدولار مقابل الدينار"
                      />
                    </div>
                  )}
                  <div className="bg-white border border-ink-200 rounded-lg p-1 flex text-xs font-medium shadow-sm">
                    <button
                      type="button"
                      onClick={() => setCurrency('IQD')}
                      className={`px-3 py-1 rounded-md transition-colors ${currency === 'IQD' ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`}
                    >
                      دينار (IQD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`px-3 py-1 rounded-md transition-colors ${currency === 'USD' ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`}
                    >
                      دولار (USD)
                    </button>
                  </div>
                </div>
              </div>
              
              {form.cameraType === 'Cables & Connectors' && form.sellMode === 'meter' && (
                <div className="col-span-2 mb-2 p-3 bg-brand-50 rounded-lg border border-brand-100">
                  <label className="font-bold mb-2 block flex items-center gap-1 text-xs text-brand-700">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    حاسبة أسعار اللفات التلقائية:
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      type="number" 
                      onChange={e => {
                        const rollPrice = Number(e.target.value) || 0;
                        const meterPrice = rollPrice / (form.metersPerRoll || 305);
                        handlePricingChange('wholesalePrice', meterPrice);
                      }}
                      className="input py-2 text-sm border-brand-200"
                      placeholder={`سعر لفة الجملة (${currency})...`}
                    />
                    <input 
                      type="number" 
                      onChange={e => {
                        const rollPrice = Number(e.target.value) || 0;
                        const meterPrice = rollPrice / (form.metersPerRoll || 305);
                        handlePricingChange('retailPrice', meterPrice);
                      }}
                      className="input py-2 text-sm border-brand-200"
                      placeholder={`سعر لفة المفرد (${currency})...`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">أدخل سعر اللفة وسيتم تقسيمها على {form.metersPerRoll || 305} ووضع سعر المتر تلقائياً أدناه.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label={`سعر الجملة ${form.sellMode === 'meter' ? '(للمتر الواحد)' : form.sellMode === 'roll' ? '(للفة الواحدة)' : ''} (${currency === 'USD' ? '$' : 'د.ع'}) *`}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={currency === 'USD' ? (form.wholesalePriceUSD !== undefined ? form.wholesalePriceUSD : (form.wholesalePrice ? form.wholesalePrice / exchangeRate : '')) : form.wholesalePrice}
                    onChange={(e) => handlePricingChange('wholesalePrice', e.target.value)}
                    className="input font-medium"
                  />
                </Field>

                <Field label="نسبة الربح %">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.profitMargin}
                    onChange={(e) => handlePricingChange('profitMargin', e.target.value)}
                    className="input font-medium"
                  />
                </Field>
              </div>

              <Field label={`سعر المفرد النهائي ${form.sellMode === 'meter' ? '(للمتر الواحد)' : form.sellMode === 'roll' ? '(للفة الواحدة)' : ''} (${currency === 'USD' ? '$' : 'د.ع'}) *`}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={currency === 'USD' ? (form.retailPriceUSD !== undefined ? form.retailPriceUSD : (form.retailPrice ? form.retailPrice / exchangeRate : '')) : form.retailPrice}
                  onChange={(e) => handlePricingChange('retailPrice', e.target.value)}
                  className="input font-bold text-brand-700 bg-brand-50/30"
                />
                <p className="text-xs text-ink-500 mt-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  يُحسب تلقائياً من سعر الجملة ونسبة الربح، ويمكن تعديله يدوياً
                </p>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <Field label="الحد الأدنى للمحل">
                <input
                  type="number"
                  min="0"
                  value={form.storeMinThreshold}
                  onChange={(e) => handleChange('storeMinThreshold', e.target.value)}
                  className="input"
                />
              </Field>

              <Field label="الحد الأدنى للمخزن">
                <input
                  type="number"
                  min="0"
                  value={form.warehouseMinThreshold}
                  onChange={(e) => handleChange('warehouseMinThreshold', e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            {isEditing && (
              <div className="bg-brand-50/70 p-3.5 rounded-xl border border-brand-200">
                <Field label="سبب تعديل المخزون / ملاحظة (اختياري)">
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="مثال: بضاعة جديدة واردة، تصحيح خطأ عد، تالف..."
                    className="input bg-white text-sm"
                  />
                </Field>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t border-ink-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-ink-600 hover:text-ink-900 bg-ink-50 hover:bg-ink-100 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="px-6 py-2.5 text-sm bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-md shadow-brand-500/30 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    جارٍ الحفظ...
                  </>
                ) : (
                  'حفظ المنتج'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-ink-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
