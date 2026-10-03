import React, { useState, useMemo } from 'react';
import { CATEGORIES } from '../../models/product';

export default function PosProductsDrawer({
  isOpen,
  onClose,
  products = [],
  customerType = 'retail',
  onAddProduct,
}) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastAddedId, setLastAddedId] = useState(null);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return (products || []).filter((product) => {
      const matchCat = selectedCategory === 'ALL' || product.cameraType === selectedCategory;
      if (!matchCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const name = (product.name || '').toLowerCase();
      const sku = (product.sku || '').toLowerCase();
      const barcode = (product.barcode || '').toLowerCase();
      const model = (product.model || '').toLowerCase();
      return name.includes(q) || sku.includes(q) || barcode.includes(q) || model.includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleProductClick = (product) => {
    onAddProduct(product);
    setLastAddedId(product.id);
    setTimeout(() => {
      setLastAddedId(null);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs select-none" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Panel */}
      <div 
        className="absolute inset-y-0 left-0 max-w-xl w-full bg-white shadow-2xl flex flex-col z-10 animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <div>
              <h3 className="font-bold text-slate-800 text-base">دليل المنتجات والمخزون</h3>
              <p className="text-xs text-slate-400">انقر على أي منتج لإضافته فوراً للسلة الحالية</p>
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

        {/* Search & Categories Bar */}
        <div className="p-3 border-b border-slate-100 space-y-2 shrink-0 bg-slate-50/30">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم، الموديل، الكود..."
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />

          {/* Categories Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-lg shrink-0 transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              الكل ({products.length})
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg shrink-0 transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-medium">
              لا توجد منتجات مطابقة في هذا التصنيف
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredProducts.map((product) => {
                const isJustAdded = lastAddedId === product.id;
                const price = customerType === 'client' 
                  ? (Number(product.wholesalePrice) || Number(product.retailPrice) || 0)
                  : (Number(product.retailPrice) || 0);
                const availableQty = Number(product.storeQty) || 0;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductClick(product)}
                    className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between cursor-pointer relative active:scale-95 group ${
                      isJustAdded
                        ? 'bg-emerald-50 border-emerald-400 shadow-md ring-2 ring-emerald-500/30'
                        : 'bg-white hover:bg-indigo-50/30 border-slate-200/80 hover:border-indigo-300 shadow-2xs'
                    }`}
                  >
                    {isJustAdded && (
                      <span className="absolute top-2 left-2 text-[10px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded-full animate-bounce">
                        تمت الإضافة ✓
                      </span>
                    )}

                    <div>
                      <span className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                        {product.name}
                      </span>
                      {product.sku && (
                        <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                          {product.sku}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="font-black text-xs text-indigo-700 font-mono">
                        {price.toLocaleString()} د.ع
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        availableQty > 0 ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'
                      }`}>
                        المحل: {availableQty}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
