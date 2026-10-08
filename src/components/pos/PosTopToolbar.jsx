import React, { useRef, useState, useMemo, useEffect } from 'react';
import PosCustomerSelector from './PosCustomerSelector';

export default function PosTopToolbar({
  activeCart,
  onUpdateActiveCart,
  onChangeCustomerType,
  openCartsCount,
  onOpenCartsModal,
  onOpenEditInvoiceModal,
  onOpenAddProductModal,
  onOpenLaborModal,
  onOpenProductsDrawer,
  onBarcodeScan,
  products = [],
  onAddProduct,
  customers = [],
  onSelectCustomer,
  onSetNewCustomer,
  onClearCustomer,
  isOfferMode = false,
  onCloseOfferMode,
  onCancelEditInvoice,
}) {
  const [searchInput, setSearchInput] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  // إغلاق قائمة البحث عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // البحث اللحظي الذكي عن المنتجات
  const matchingProducts = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return [];
    return (products || []).filter((p) => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const model = (p.model || '').toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q) || model.includes(q);
    }).slice(0, 8);
  }, [products, searchInput]);

  const handleSelectProduct = (product) => {
    onAddProduct(product);
    setSearchInput('');
    setShowResults(false);
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingProducts.length > 0) {
        handleSelectProduct(matchingProducts[0]);
      } else {
        const query = searchInput.trim();
        if (query) {
          onBarcodeScan(query);
          setSearchInput('');
          setShowResults(false);
        }
      }
    }
    if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const invoiceLabel = useMemo(() => {
    if (isOfferMode) {
      return activeCart.offerName || 'عرض سعر جديد';
    }
    if (activeCart.invoiceNumber) {
      return `فاتورة #${activeCart.invoiceNumber}`;
    }
    if (activeCart.name && !activeCart.name.includes('عرض')) {
      return activeCart.name;
    }
    return 'سلة 1';
  }, [isOfferMode, activeCart.offerName, activeCart.invoiceNumber, activeCart.name]);

  return (
    <header className="bg-white border-b border-slate-200 px-3 md:px-5 py-2.5 shadow-xs shrink-0 select-none safe-top z-30 flex flex-col gap-2">
      {/* السطر الأول: أدوات الفاتورة السريعة، الإضافات، السلات، وعرض المنتجات (ارتفاع موحد h-9) */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 flex-wrap sm:flex-nowrap">
        {/* المجموعة اليمنى: أدوات الفاتورة */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
          {/* 1. رقم الفاتورة أو شارة وضع عرض السعر */}
          {isOfferMode ? (
            <div 
              className="h-9 flex items-center gap-1.5 px-3 bg-amber-500 text-white font-black text-xs rounded-xl shadow-xs shrink-0 animate-fade-in"
              title="أنت الآن في وضع إعداد عرض سعر"
            >
              <span>📑</span>
              <span>وضع عرض السعر</span>
              {onCloseOfferMode && (
                <button
                  type="button"
                  onClick={onCloseOfferMode}
                  className="mr-1 bg-amber-600/90 hover:bg-amber-700 px-2 py-0.5 rounded-lg text-[11px] font-bold text-white transition-colors cursor-pointer"
                  title="الرجوع لقائمة عروض الأسعار"
                >
                  ✕ خروج
                </button>
              )}
            </div>
          ) : (
            <div 
              className={`h-9 flex items-center gap-1.5 px-3 border rounded-xl font-black text-xs shrink-0 shadow-2xs ${
                activeCart.editingSaleId
                  ? 'bg-amber-50 border-amber-300 text-amber-900 ring-1 ring-amber-400/40'
                  : 'bg-slate-100 border border-slate-200 text-slate-800'
              }`}
              title="رقم السلة / الفاتورة الحالية"
            >
              <span className="text-slate-400">#</span>
              <span className="truncate max-w-[120px]">{invoiceLabel}</span>
              {activeCart.editingSaleId && (
                <div className="flex items-center gap-1 mr-1">
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                    ✏️ تعديل
                  </span>
                  {onCancelEditInvoice && (
                    <button
                      type="button"
                      onClick={onCancelEditInvoice}
                      className="text-amber-700 hover:text-rose-600 font-bold px-1 text-xs cursor-pointer"
                      title="إلغاء تعديل الفاتورة وإفراغ السلة"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. تعديل فاتورة سابقة (تظهر في وضع البيع العادي) */}
          {!isOfferMode && (
            <button
              type="button"
              onClick={onOpenEditInvoiceModal}
              className="h-9 flex items-center gap-1 px-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
              title="تعديل فاتورة سابقة"
            >
              <span>🔍</span>
              <span>تعديل فاتورة</span>
            </button>
          )}

          {/* 3. تاريخ الفاتورة */}
          <div className="h-9 flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 shrink-0 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="text-slate-400 text-xs">📅</span>
            <input
              type="date"
              value={activeCart.invoiceDate || new Date().toISOString().slice(0, 10)}
              onChange={(e) => onUpdateActiveCart({ invoiceDate: e.target.value })}
              className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer"
              title="تاريخ الفاتورة"
            />
          </div>

          {/* 4. إضافة منتج مخصص / شراء موقعي */}
          <button
            type="button"
            onClick={onOpenAddProductModal}
            className="h-9 flex items-center gap-1 px-2.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
            title="إضافة بند مخصص أو شراء موقعي"
          >
            <span>➕</span>
            <span>إضافة مادة / خدمة</span>
          </button>

          {/* 5. أجور العمل والخدمات */}
          <button
            type="button"
            onClick={onOpenLaborModal}
            className="h-9 flex items-center gap-1 px-2.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
            title="أجور العمل والتركيب والصيانة"
          >
            <span>🛠️</span>
            <span>أجور العمل</span>
          </button>
        </div>

        {/* المجموعة اليسرى: عرض المنتجات وعلامة السلة فقط مع العداد */}
        <div className="flex items-center gap-2 shrink-0">
          {/* عرض المنتجات (لوحة جانبية) */}
          <button
            type="button"
            onClick={onOpenProductsDrawer}
            className="h-9 flex items-center gap-1.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
            title="عرض قائمة المنتجات"
          >
            <span>📦</span>
            <span>قائمة المنتجات</span>
          </button>

          {/* زر السلات: فقط علامة السلة مع عداد السلات المفتوحة */}
          <button
            type="button"
            onClick={onOpenCartsModal}
            className="h-9 w-9 relative flex items-center justify-center bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-xl text-slate-800 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
            title="السلات المفتوحة"
          >
            <span className="text-base leading-none">🛒</span>
            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
              {openCartsCount}
            </span>
          </button>
        </div>
      </div>

      {/* السطر الثاني: شريط تسجيل اسم العميل، اسم العرض، فئة السعر، وشريط بحث المواد والباركود (ارتفاع موحد h-10) */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* 1. شريط تسجيل اسم الزبون / العميل (حقل إدخال مباشر h-10) */}
        <PosCustomerSelector
          customerName={activeCart.customerName || ''}
          customerPhone={activeCart.phone1 || ''}
          customerType={activeCart.customerType || (isOfferMode ? 'offer' : 'retail')}
          customers={customers}
          onSelectCustomer={onSelectCustomer}
          onSetNewCustomer={onSetNewCustomer}
          onClearCustomer={onClearCustomer}
        />

        {/* 2. حقل اسم أو عنوان عرض السعر */}
        {isOfferMode && (
          <div className="relative shrink-0 w-44 sm:w-56 md:w-64">
            <div className="relative flex items-center">
              <span className="absolute right-3 text-amber-500 text-xs pointer-events-none font-bold">🏷️</span>
              <input
                type="text"
                value={activeCart.offerName !== undefined ? activeCart.offerName : (activeCart.name && !activeCart.name.startsWith('سلة') ? activeCart.name : '')}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateActiveCart({ offerName: val, name: val || 'عرض سعر جديد' });
                }}
                placeholder="اسم العرض (مثال: كاميرات المجمع)..."
                className="w-full h-10 bg-amber-50/80 hover:bg-white focus:bg-white border border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl pr-8 pl-3 text-xs md:text-sm font-bold text-amber-950 placeholder-amber-400 outline-none transition-all shadow-2xs"
                title="اسم أو عنوان عرض السعر"
              />
            </div>
          </div>
        )}

        {/* 3. فئة السعر (قائمة منسدلة h-10) */}
        <div className="relative shrink-0">
          <select
            value={activeCart.customerType || 'retail'}
            onChange={(e) => onChangeCustomerType(e.target.value)}
            className="h-10 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl px-3 text-xs md:text-sm font-bold text-slate-800 outline-none cursor-pointer transition-colors shadow-2xs"
            title="تحديد فئة السعر"
          >
            <option value="retail">زبون (مفرد)</option>
            <option value="client">عميل (سعر خاص)</option>
            <option value="vip">⭐ عميل مميز (VIP)</option>
            <option value="offer">عرض سعر</option>
          </select>
        </div>

        {/* 3. شريط البحث الأكبر والذكي والمميز (يمتد على كامل العرض المتبقي h-10) */}
        <div ref={searchContainerRef} className="flex-1 relative z-40 min-w-0">
          <div className="relative flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onFocus={() => setShowResults(true)}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowResults(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="ابحث بالاسم، الموديل، الكود، أو امسح الباركود..."
              className="w-full h-10 bg-slate-100 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 rounded-xl px-4 text-xs md:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setShowResults(false);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm px-1.5 cursor-pointer font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* القائمة الذكية للمنتجات المطابقة عند البدء بالبحث */}
          {showResults && searchInput.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-slate-100 max-h-80 overflow-y-auto animate-scale-in">
              {matchingProducts.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 font-medium">
                  لا توجد نتائج مطابقة، اضغط Enter للبحث العام بالباركود
                </div>
              ) : (
                matchingProducts.map((prod) => {
                  const price = activeCart.customerType === 'vip'
                    ? (Number(prod.vipPrice) > 0 ? Number(prod.vipPrice) : (Number(prod.clientPrice) > 0 ? Number(prod.clientPrice) : Number(prod.retailPrice) || 0))
                    : activeCart.customerType === 'client'
                    ? (Number(prod.clientPrice) > 0 ? Number(prod.clientPrice) : Number(prod.retailPrice) || 0)
                    : (Number(prod.retailPrice) || 0);

                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleSelectProduct(prod)}
                      className="p-2.5 hover:bg-indigo-50/70 transition-colors cursor-pointer flex items-center justify-between gap-3 text-right group"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs md:text-sm text-slate-800 group-hover:text-indigo-600 block leading-snug whitespace-normal break-words">
                          {prod.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          {prod.sku && <span className="font-mono bg-slate-100 px-1 rounded">{prod.sku}</span>}
                          {prod.model && <span>{prod.model}</span>}
                          <span>المحل: {prod.storeQty || 0}</span>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="font-black text-xs md:text-sm text-indigo-700 font-mono block">
                          {price.toLocaleString()} د.ع
                        </span>
                        <span className="text-[10px] text-indigo-500 font-bold group-hover:underline">
                          + إضافة
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
