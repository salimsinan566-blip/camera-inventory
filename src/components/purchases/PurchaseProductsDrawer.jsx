import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORIES } from '../../models/product';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function PurchaseProductsDrawer({
  isOpen,
  onClose,
  products = [],
  onSelectProduct,
  onOpenNewProductModal,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [displayLimit, setDisplayLimit] = useState(200); // Allow showing all products (e.g. 197+)
  const [lastAddedId, setLastAddedId] = useState(null);

  // Filter products by category and search term
  const allFilteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.cameraType === selectedCategory);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((p) => {
        const nameMatch = p.name?.toLowerCase().includes(q);
        const skuMatch = p.sku?.toLowerCase().includes(q);
        const barcodeMatch = p.barcode?.toLowerCase().includes(q);
        const modelMatch = p.model?.toLowerCase().includes(q);
        return nameMatch || skuMatch || barcodeMatch || modelMatch;
      });
    }

    return result;
  }, [products, searchTerm, selectedCategory]);

  const visibleProducts = useMemo(() => {
    return allFilteredProducts.slice(0, displayLimit);
  }, [allFilteredProducts, displayLimit]);

  if (!isOpen) return null;

  const handleProductClick = (product) => {
    onSelectProduct(product);
    setLastAddedId(product.id);
    setTimeout(() => {
      setLastAddedId(null);
    }, 600);
  };

  const drawerContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-slate-900/60 backdrop-blur-xs select-none"
      dir="rtl"
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer content (Aligned to Left side in RTL, full height) */}
      <div
        className="absolute inset-y-0 left-0 w-full max-w-2xl bg-white shadow-2xl flex flex-col z-10 border-r border-slate-200 animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header - يظهر في أعلى الشاشة 100% بدون أي قص */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📦</span>
            <div>
              <h3 className="text-xs sm:text-sm font-black">قائمة منتجات المخزن</h3>
              <p className="text-[11px] text-slate-400">
                انقر على أي منتج لإضافته فوراً لسلة المشتريات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewProductModal?.();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-slate-700"
            >
              <span>+</span>
              <span>صنف جديد</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 2. Search Bar & Categories */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2.5">
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم المادة، الباركود، أو الرمز..."
              className="w-full pr-8 pl-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips with Counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              الكل ({products.length})
            </button>
            {CATEGORIES.map((cat) => {
              const catCount = (products || []).filter((p) => p.cameraType === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat} ({catCount})
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Products Grid - يظهر جميع المنتجات بدون حرمان أي مادة */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="text-xs font-bold text-slate-600">لم يتم العثور على أي منتج مطابق</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewProductModal?.();
                }}
                className="mt-3 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1"
              >
                <span>+</span>
                <span>إضافة كصنف جديد</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {visibleProducts.map((p) => {
                  const cost = Number(p.wholesalePrice || p.costPrice) || 0;
                  const storeQty = Number(p.storeQty !== undefined ? p.storeQty : p.quantity) || 0;
                  const warehouseQty = Number(p.warehouseQty !== undefined ? p.warehouseQty : p.warehouseQuantity) || 0;
                  const totalStock = storeQty + warehouseQty;
                  const isJustAdded = lastAddedId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProductClick(p)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group relative ${
                        isJustAdded
                          ? 'bg-emerald-50 border-emerald-400 shadow-xs ring-2 ring-emerald-300'
                          : 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-2xs active:scale-98'
                      }`}
                    >
                      {/* Added Toast Badge */}
                      {isJustAdded && (
                        <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded shadow-xs animate-fade-in">
                          تمت الإضافة ✓
                        </span>
                      )}

                      <div>
                        <h4 className="text-xs font-black text-slate-900 group-hover:text-slate-700 line-clamp-2">
                          {p.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                          {p.cameraType && <span>{p.cameraType}</span>}
                          {p.barcode && <span className="font-mono">#{p.barcode}</span>}
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block">سعر التكلفة:</span>
                          <span className="font-black font-mono text-slate-900">
                            {formatIQD(cost)} د.ع
                          </span>
                        </div>

                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block">المتوفر بالمخزن:</span>
                          <span
                            className={`font-black font-mono text-[11px] ${
                              totalStock <= 0 ? 'text-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {totalStock} قطعة
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More button if more products exist */}
              {allFilteredProducts.length > visibleProducts.length && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => prev + 100)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    عرض المزيد ({allFilteredProducts.length - visibleProducts.length} منتج متبقي)...
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 4. Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 text-xs text-slate-600 font-bold">
          <span>
            المعروض: {visibleProducts.length} من أصل {allFilteredProducts.length} مادة
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
