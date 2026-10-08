import React, { useState, useEffect } from 'react';

export default function PosCheckoutModal({
  isOpen,
  onClose,
  activeCart,
  onConfirmCheckout,
  processing = false,
}) {
  const isEditingInvoice = Boolean(activeCart?.editingSaleId);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'mastercard' | 'debt'
  const [saveClientPrices, setSaveClientPrices] = useState(true);
  const [saveVipPrices, setSaveVipPrices] = useState(true);
  const [showPriceChangedItems, setShowPriceChangedItems] = useState(false);
  const [error, setError] = useState('');

  // Active customer details from the cart
  const customerName = (activeCart?.customerName || '').trim() || 'زبون نقدي عام';
  const customerType = activeCart?.customerType || 'retail';
  const isGenericCustomer = !activeCart?.customerName || customerName === 'زبون نقدي عام' || customerName === 'زبون نقدي' || customerName === 'زبون عام';

  // Calculations
  const items = activeCart?.items || [];
  const subtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
  const discount = Number(activeCart?.discount) || 0;
  const grandTotal = Math.max(0, subtotal - discount);
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // كشف المواد التي تم تعديل أسعارها في السلة مقارنة بسعر المخزون للعملاء
  const priceChangedClientItems = customerType === 'client' ? items.filter((it) => {
    if (!it.productId || it.isCustom || it.isService || it.isSitePurchase) return false;
    const currentPrice = Number(it.unitPrice) || 0;
    const catalogClientPrice = Number(it.clientPrice) > 0 
      ? Number(it.clientPrice) 
      : (Number(it.retailPrice) || Number(it.originalPrice) || 0);
    return currentPrice !== catalogClientPrice;
  }) : [];

  // كشف المواد التي تم تعديل أسعارها في السلة مقارنة بسعر المخزون للعملاء المميزين
  const priceChangedVipItems = customerType === 'vip' ? items.filter((it) => {
    if (!it.productId || it.isCustom || it.isService || it.isSitePurchase) return false;
    const currentPrice = Number(it.unitPrice) || 0;
    const catalogVipPrice = Number(it.vipPrice) > 0 
      ? Number(it.vipPrice) 
      : (Number(it.clientPrice) > 0 ? Number(it.clientPrice) : (Number(it.retailPrice) || Number(it.originalPrice) || 0));
    return currentPrice !== catalogVipPrice;
  }) : [];

  // Reset payment method, client price toggle and errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(activeCart?.paymentMethod || activeCart?.invoiceType || 'cash');
      setSaveClientPrices(true);
      setSaveVipPrices(true);
      setShowPriceChangedItems(false);
      setError('');
    }
  }, [isOpen, activeCart]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // التحقق من اسم العميل في حالة الدين
    if (paymentMethod === 'debt' && isGenericCustomer) {
      setError('⚠️ لا يمكن تسجيل فاتورة بالدين على "زبون عام". يرجى إغلاق النافذة وتحديد اسم العميل من الشريط العلوي أولاً.');
      return;
    }

    onConfirmCheckout({
      invoiceType: paymentMethod,
      paymentMethod,
      customerName: customerName,
      phone1: (activeCart?.phone1 || '').trim(),
      notes: (activeCart?.notes || '').trim(),
      saveClientPrices: customerType === 'client' && saveClientPrices && priceChangedClientItems.length > 0,
      clientPriceUpdates: priceChangedClientItems.map((it) => ({
        productId: it.productId,
        newClientPrice: Number(it.unitPrice) || 0,
        name: it.name,
      })),
      saveVipPrices: customerType === 'vip' && saveVipPrices && priceChangedVipItems.length > 0,
      vipPriceUpdates: priceChangedVipItems.map((it) => ({
        productId: it.productId,
        newVipPrice: Number(it.unitPrice) || 0,
        name: it.name,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{isEditingInvoice ? '💾' : '💳'}</span>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">
                {isEditingInvoice 
                  ? `حفظ تعديل الفاتورة ${activeCart?.invoiceNumber ? `#${activeCart.invoiceNumber}` : ''}` 
                  : 'إتمام الحساب والدفع'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditingInvoice 
                  ? 'تأكيد طريقة الدفع وحفظ التعديلات على الفاتورة' 
                  : 'اختر طريقة الدفع لإنهاء الفاتورة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl p-3.5">
              {error}
            </div>
          )}

          {/* 1. أزرار طريقة الدفع الـ 3 الكبيرة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">طريقة الدفع *</label>
            <div className="grid grid-cols-3 gap-3">
              {/* نقدي */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('cash'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">💵</span>
                <span>نقدي</span>
              </button>

              {/* ماستر كارد */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('mastercard'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'mastercard'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">💳</span>
                <span>ماستر كارد</span>
              </button>

              {/* دين */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('debt'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'debt'
                    ? 'border-red-500 bg-red-50 text-red-700 shadow-xs ring-2 ring-red-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">📝</span>
                <span>دين (آجل)</span>
              </button>
            </div>
          </div>

          {/* 2. بطاقة توضيح حساب العميل */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg text-indigo-700 shrink-0">
                👤
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-400 block">
                  الحساب
                </span>
                <span className="font-black text-base text-slate-800 truncate block">
                  {customerName}
                </span>
              </div>
            </div>

            <span
              className={`text-xs font-bold px-3 py-1 rounded-xl shrink-0 ${
                customerType === 'vip'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : customerType === 'client'
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : customerType === 'offer'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {customerType === 'vip'
                ? '⭐ عميل مميز (VIP)'
                : customerType === 'client'
                ? 'عميل (سعر خاص)'
                : customerType === 'offer'
                ? 'عرض سعر'
                : 'زبون (مفرد)'}
            </span>
          </div>

          {/* خيار حفظ السعر الجديد للعملاء في المخزون */}
          {customerType === 'client' && priceChangedClientItems.length > 0 && (
            <div className="bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl p-3.5 space-y-2 animate-scale-in">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveClientPrices}
                    onChange={(e) => setSaveClientPrices(e.target.checked)}
                    className="w-5 h-5 text-emerald-600 rounded-lg border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-black text-emerald-950">
                    حفظ السعر الجديد
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowPriceChangedItems((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 bg-emerald-200/70 hover:bg-emerald-200 px-2.5 py-1 rounded-xl border border-emerald-300 transition-colors cursor-pointer"
                  title="عرض/إخفاء المواد"
                >
                  <span>{priceChangedClientItems.length} مواد</span>
                  <span className={`text-[10px] transform transition-transform duration-200 ${showPriceChangedItems ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
              </div>

              {showPriceChangedItems && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1 animate-scale-in">
                  {priceChangedClientItems.map((it) => {
                    const oldPrice = Number(it.clientPrice) > 0 
                      ? Number(it.clientPrice) 
                      : (Number(it.retailPrice) || Number(it.originalPrice) || 0);
                    return (
                      <div key={it.id || it.cartItemId || it.productId} className="text-xs flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
                        <span className="font-bold text-slate-800 truncate max-w-[200px]" title={it.name}>{it.name}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400 line-through text-[10px]">{oldPrice.toLocaleString()}</span>
                          <span className="text-emerald-700 font-black text-xs">⬅️ {Number(it.unitPrice).toLocaleString()} د.ع</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* خيار حفظ السعر الجديد للعملاء المميزين (VIP) في المخزون */}
          {customerType === 'vip' && priceChangedVipItems.length > 0 && (
            <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2 animate-scale-in">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveVipPrices}
                    onChange={(e) => setSaveVipPrices(e.target.checked)}
                    className="w-5 h-5 text-amber-600 rounded-lg border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-black text-amber-950">
                    حفظ السعر الجديد
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowPriceChangedItems((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-2.5 py-1 rounded-xl border border-amber-300 transition-colors cursor-pointer"
                  title="عرض/إخفاء المواد"
                >
                  <span>{priceChangedVipItems.length} مواد</span>
                  <span className={`text-[10px] transform transition-transform duration-200 ${showPriceChangedItems ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
              </div>

              {showPriceChangedItems && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1 animate-scale-in">
                  {priceChangedVipItems.map((it) => {
                    const oldPrice = Number(it.vipPrice) > 0 
                      ? Number(it.vipPrice) 
                      : (Number(it.clientPrice) > 0 ? Number(it.clientPrice) : (Number(it.retailPrice) || Number(it.originalPrice) || 0));
                    return (
                      <div key={it.id || it.cartItemId || it.productId} className="text-xs flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                        <span className="font-bold text-slate-800 truncate max-w-[200px]" title={it.name}>{it.name}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400 line-through text-[10px]">{oldPrice.toLocaleString()}</span>
                          <span className="text-amber-700 font-black text-xs">⬅️ {Number(it.unitPrice).toLocaleString()} د.ع</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. بطاقة ملخص الإجمالي */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block font-medium">المبلغ المطلوب سداده</span>
              <span className="text-xs text-slate-400 font-mono">
                {items.length} أصناف • {totalUnits} قطعة
              </span>
            </div>
            <div className="text-left">
              <span className="text-2xl font-black text-indigo-700 font-mono">
                {grandTotal.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-500 mr-1">د.ع</span>
            </div>
          </div>

          {/* 4. أزرار الإجراءات: إتمام الدفع أو حفظ الفاتورة */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={processing}
              className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-base rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <span>{processing ? '⏳' : (isEditingInvoice ? '💾' : '✓')}</span>
              <span>
                {processing
                  ? (isEditingInvoice ? 'جاري حفظ الفاتورة...' : 'جاري تسجيل الدفع...')
                  : (isEditingInvoice ? 'حفظ الفاتورة' : 'إتمام الدفع وتأكيد البيع')}
              </span>
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={onClose}
              className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
