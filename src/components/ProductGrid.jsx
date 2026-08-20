import React, { useMemo, useState, useCallback } from 'react';
import { searchProducts } from '../utils/search';
import { getStoreStatus, STOCK_STATUS } from '../models/product';

const ProductCard = React.memo(({ product, onSelect, allowOutOfStock = false }) => {
  const outOfStock = (Number(product.storeQty) || 0) <= 0;
  const isClickable = allowOutOfStock || !outOfStock;

  return (
    <button
      onClick={() => isClickable && onSelect(product)}
      disabled={!isClickable}
      className={`bg-white border rounded-xl shadow-xs p-2 text-right transition-all cursor-pointer ${
        product.isCustodyItem
          ? 'border-indigo-200 hover:border-indigo-500 hover:shadow-md'
          : product.isWarehouseStock
          ? 'border-amber-200 hover:border-amber-500 hover:shadow-md'
          : outOfStock && allowOutOfStock
          ? 'border-purple-300 bg-purple-50/20 hover:border-purple-500 hover:shadow-md ring-1 ring-purple-400/30'
          : 'border-brand-100 hover:border-brand-500'
      } ${
        !isClickable ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md'
      }`}
    >
      <div className="aspect-square bg-brand-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden group relative">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) {
                e.target.nextSibling.style.display = 'flex';
              }
            }}
          />
        ) : null}
        <span 
          className="text-2xl font-bold text-brand-300 w-full h-full flex items-center justify-center"
          style={{ display: product.imageUrl ? 'none' : 'flex' }}
        >
          {product.name?.charAt(0) || '?'}
        </span>
        
        <div className="absolute top-0 inset-x-0 bg-black/60 backdrop-blur-sm p-2 border-b border-white/10">
          <p 
            className="text-xs font-bold text-white text-right leading-tight line-clamp-2" 
            dir="auto" 
            title={product.name}
          >
            {product.name}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mb-1 gap-1">
        <span className="text-sm font-bold text-ink-900 font-mono">{Number(product.retailPrice).toLocaleString()} د.ع</span>
      </div>
      {product.isCustodyItem ? (
        <p className="text-xs text-indigo-700 font-bold bg-indigo-50 inline-block px-2 py-0.5 rounded border border-indigo-200">
          🚚 بالسيارة: {product.custodyQty} قطعة
        </p>
      ) : product.isWarehouseStock ? (
        <p className="text-xs text-amber-800 font-bold bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200">
          🏢 بالمخزن: {product.storeQty}
        </p>
      ) : outOfStock ? (
        <p className={`text-xs font-bold inline-block px-2 py-0.5 rounded ${
          allowOutOfStock 
            ? 'text-purple-700 bg-purple-50 border border-purple-200' 
            : 'text-danger-700 bg-danger-50'
        }`}>
          {allowOutOfStock ? 'غير متوفر (متاح للعرض)' : 'نافذ في المحل'}
        </p>
      ) : (
        <p className="text-xs text-ink-500 font-medium bg-ink-50 inline-block px-2 py-0.5 rounded">
          المحل: {product.storeQty} {Number(product.pendingQty) > 0 ? `(${product.pendingQty} معلق)` : ''}
        </p>
      )}
    </button>
  );
});

/**
 * شبكة منتجات مرئية بجانب شاشة نقطة البيع مع فلاتر للأقسام
 */
const ProductGrid = React.memo(function ProductGrid({ products = [], onSelect, allowOutOfStock = false, emptyMessage = 'لا توجد نتائج' }) {
  const [gridSearch, setGridSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Extract all unique categories / departments dynamically
  const categoriesList = useMemo(() => {
    const counts = {};
    let total = 0;

    (products || []).forEach((p) => {
      total++;
      const cat = (p.category || p.cameraType || p.type || '').trim();
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });

    const list = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return [{ name: 'all', label: 'الكل', count: total }, ...list];
  }, [products]);

  const visibleProducts = useMemo(() => {
    let filtered = products || [];

    // Filter by selected category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => {
        const cat = (p.category || p.cameraType || p.type || '').trim();
        return cat.toLowerCase() === selectedCategory.toLowerCase();
      });
    }

    // Filter by search text
    if (gridSearch.trim()) {
      filtered = searchProducts(filtered, gridSearch);
    }

    return filtered.slice(0, 60);
  }, [products, selectedCategory, gridSearch]);

  return (
    <div className="flex flex-col h-full gap-2.5">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={gridSearch}
          onChange={(e) => setGridSearch(e.target.value)}
          placeholder="ابحث بالاسم، الموديل، أو الباركود..."
          className="input pl-8 pr-3 py-2 text-xs shadow-2xs rounded-xl w-full font-bold bg-white"
        />
        {gridSearch && (
          <button
            onClick={() => setGridSearch('')}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Pills / فلاتر الأقسام */}
      {categoriesList.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin no-scrollbar shrink-0">
          {categoriesList.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-brand-600 text-white border-brand-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>{cat.label || cat.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Product Cards Grid */}
      <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 flex-1 min-h-0 pb-3">
        {visibleProducts.map((product) => (
          <ProductCard 
            key={product.id} 
            product={product} 
            onSelect={onSelect} 
            allowOutOfStock={allowOutOfStock} 
          />
        ))}

        {visibleProducts.length === 0 && (
          <div className="col-span-full text-center text-ink-500 text-xs py-12 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-200">
            <span className="text-3xl mb-2">📦</span>
            <p className="font-bold text-slate-700">{emptyMessage}</p>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => { setSelectedCategory('all'); setGridSearch(''); }}
                className="mt-2 text-brand-600 font-bold text-xs hover:underline cursor-pointer"
              >
                عرض كل الأقسام
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ProductGrid;
