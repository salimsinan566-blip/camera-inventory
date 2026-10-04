import React from 'react';

export default function PosBottomBar({
  activeCart,
  onUpdateDiscount,
  onCheckout,
  onSaveOffer,
  onPrintOffer,
  onPrintDraft,
  processing = false,
  isOfferMode: isOfferModeProp,
}) {
  const items = activeCart.items || [];
  
  // عدد المنتجات (الأسطر الفريدة)
  const productsCount = items.length;
  
  // عدد القطع الكلي
  const totalUnitsCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  
  // الإجمالي الكلي
  const subtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
  const discount = Number(activeCart.discount) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  const isOfferMode = isOfferModeProp !== undefined
    ? Boolean(isOfferModeProp)
    : (activeCart.customerType === 'offer');
  const isCartEmpty = items.length === 0;

  return (
    <footer className="bg-white border-t border-slate-200 px-4 md:px-6 py-2 shadow-md shrink-0 select-none z-20">
      <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        {/* الجهة اليمنى: ملخص الأصناف والقطع وحقل الخصم والمجموع الإجمالي */}
        <div className="flex items-center gap-2.5 sm:gap-5 flex-wrap">
          {/* عدادات الأصناف والقطع */}
          <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
            <div className="bg-slate-100 px-2.5 py-1 rounded-lg">
              <span>الأصناف: </span>
              <span className="font-mono text-slate-800 font-black">{productsCount}</span>
            </div>
            <div className="bg-slate-100 px-2.5 py-1 rounded-lg">
              <span>القطع: </span>
              <span className="font-mono text-slate-800 font-black">{totalUnitsCount}</span>
            </div>
          </div>

          {/* حقل الخصم المباشر للفاتورة */}
          <div className="flex items-center gap-1.5 bg-rose-50/60 hover:bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1 transition-colors">
            <span className="text-xs font-bold text-rose-700 shrink-0">الخصم:</span>
            <input
              type="number"
              min="0"
              step="500"
              value={activeCart.discount > 0 ? activeCart.discount : ''}
              onChange={(e) => onUpdateDiscount?.(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="w-16 sm:w-20 text-xs md:text-sm font-bold font-mono text-rose-700 bg-transparent outline-none text-left"
              title="أدخل مبلغ الخصم بالدينار العراقي"
            />
            <span className="text-[10px] text-rose-400 font-bold shrink-0">د.ع</span>
          </div>

          {/* المجموع الإجمالي */}
          <div className="flex items-baseline gap-1.5 border-r border-slate-200 pr-3 sm:pr-5">
            {discount > 0 ? (
              <div className="flex items-center gap-2">
                <div className="text-right hidden md:block">
                  <span className="text-[10px] text-slate-400 font-bold block leading-none">قبل الخصم</span>
                  <span className="text-xs text-slate-400 line-through font-mono">
                    {subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black text-indigo-700 font-mono">
                    {grandTotal.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-slate-500">د.ع</span>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-400 font-bold hidden sm:inline">المجموع:</span>
                <span className="text-xl md:text-2xl font-black text-indigo-700 font-mono">
                  {grandTotal.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-slate-500">د.ع</span>
              </div>
            )}
          </div>
        </div>

        {/* الجهة اليسرى: أزرار العمليات */}
        <div className="flex items-center gap-2 shrink-0">
          {isOfferMode ? (
            <>
              {/* زر حفظ العرض */}
              <button
                type="button"
                disabled={isCartEmpty || processing}
                onClick={onSaveOffer}
                className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-black text-xs sm:text-sm md:text-base rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                title="حفظ عرض السعر"
              >
                <span>💾</span>
                <span>{processing ? 'جاري الحفظ...' : 'حفظ العرض'}</span>
              </button>

              {/* زر طباعة العرض */}
              <button
                type="button"
                disabled={isCartEmpty || processing}
                onClick={onPrintOffer}
                className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-xs sm:text-sm md:text-base rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                title="حفظ وطباعة عرض السعر"
              >
                <span>🖨️</span>
                <span>{processing ? 'جاري الحفظ والطباعة...' : 'طباعة العرض'}</span>
              </button>
            </>
          ) : (
            <>
              {/* زر طباعة فاتورة غير مؤكدة */}
              <button
                type="button"
                disabled={isCartEmpty || processing}
                onClick={onPrintDraft}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 font-bold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed"
                title="معاينة وطباعة الفاتورة الحالية كمسودة غير مؤكدة بدون خصم من المخزون أو إتمام البيع"
              >
                <span>📄</span>
                <span>طباعة فاتورة غير مؤكدة</span>
              </button>

              {/* زر حاسب */}
              <button
                type="button"
                disabled={isCartEmpty || processing}
                onClick={onCheckout}
                className="flex items-center gap-2 px-6 sm:px-8 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-sm md:text-base rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed"
              >
                <span>💳</span>
                <span>{processing ? 'جاري المعالجة...' : 'حاسب'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
