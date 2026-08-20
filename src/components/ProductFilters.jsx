import React from 'react';
import { CATEGORIES, LOCATIONS, LOCATION_LABELS_AR, STOCK_STATUS } from '../models/product';
import { useSettings } from '../hooks/useSettings';
import { searchProducts } from '../utils/search';

const STOCK_STATUS_LABELS_AR = {
  [STOCK_STATUS.IN_STOCK]: 'متوفر',
  [STOCK_STATUS.LOW_STOCK]: 'منخفض',
  [STOCK_STATUS.OUT_OF_STOCK]: 'نافذ',
};

export const SORT_OPTIONS = [
  { value: 'custom', label: '📌 ترتيب يدوي مخصص (تحريك القطع يدوياً)' },
  { value: 'name_asc', label: '🔤 اسم المنتج (أ - ي / A - Z)' },
  { value: 'category_asc', label: '📁 حسب القسم / الصنف' },
  { value: 'storeQty_desc', label: '🏪 الأكثر توفراً في المحل' },
  { value: 'totalQty_desc', label: '📦 الأكثر كمية إجمالية' },
  { value: 'retailPrice_desc', label: '💰 سعر المفرد (الأعلى أولاً)' },
  { value: 'retailPrice_asc', label: '💰 سعر المفرد (الأقل أولاً)' },
  { value: 'createdAt_desc', label: '📅 الأحدث إضافة' },
  { value: 'createdAt_asc', label: '📅 الأقدم إضافة' },
];

export const DEFAULT_FILTERS = {
  search: '',
  category: 'all',
  location: 'all',
  stockStatus: 'all',
  priceMin: '',
  priceMax: '',
  sortBy: localStorage.getItem('inventory_sort_by') || 'custom',
};

/**
 * شريط الفلاتر والترتيب المخصص للمخزون - تصميم أنيق ومبسط
 */
export default function ProductFilters({ filters, onChange, products = [] }) {
  function update(field, value) {
    if (field === 'sortBy') {
      try {
        localStorage.setItem('inventory_sort_by', value);
      } catch (e) {}
    }
    onChange({ ...filters, [field]: value });
  }

  const currentSort = filters.sortBy || localStorage.getItem('inventory_sort_by') || 'custom';

  const hasActiveFilters =
    filters.search !== '' ||
    filters.category !== 'all' ||
    filters.location !== 'all' ||
    filters.stockStatus !== 'all' ||
    (currentSort && currentSort !== 'custom');

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

  return (
    <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 mb-4">
      
      {/* 4 Compact Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* 1. Search */}
        <div>
          <label className="block text-xs font-bold text-ink-700 mb-1">بحث في المخزون</label>
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث بالاسم، SKU، أو الباركود..."
              value={filters.search}
              onChange={(e) => update('search', e.target.value)}
              className="input pl-7 text-xs"
            />
            {filters.search && (
              <button
                onClick={() => update('search', '')}
                className="absolute left-2 top-2 text-xs text-ink-400 hover:text-ink-700"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 2. Custom Sort */}
        <div>
          <label className="block text-xs font-bold text-ink-700 mb-1 flex items-center justify-between">
            <span>ترتيب / تصفيط المواد:</span>
            {currentSort === 'custom' && (
              <span className="text-[10px] text-brand-700 font-bold bg-brand-50 px-1.5 py-0.2 rounded">ترتيب مخصص</span>
            )}
          </label>
          <select
            value={currentSort}
            onChange={(e) => update('sortBy', e.target.value)}
            className="input font-bold text-xs bg-slate-50 border-brand-300 focus:ring-brand-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Category Filter */}
        <div>
          <label className="block text-xs font-bold text-ink-700 mb-1">نوع المنتج (القسم)</label>
          <select
            value={filters.category}
            onChange={(e) => update('category', e.target.value)}
            className="input text-xs"
          >
            <option value="all">كافة الأقسام</option>
            {dynamicCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Stock Status Filter */}
        <div>
          <label className="block text-xs font-bold text-ink-700 mb-1">حالة المخزون</label>
          <select
            value={filters.stockStatus}
            onChange={(e) => update('stockStatus', e.target.value)}
            className="input text-xs"
          >
            <option value="all">كافة الحالات (الكل)</option>
            {Object.values(STOCK_STATUS).map((status) => (
              <option key={status} value={status}>
                {STOCK_STATUS_LABELS_AR[status]}
              </option>
            ))}
          </select>
        </div>

      </div>

      {hasActiveFilters && (
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-ink-100 text-xs">
          <span className="text-ink-500">
            الترتيب المعتمد: <strong className="text-ink-900">{SORT_OPTIONS.find(o => o.value === currentSort)?.label}</strong>
          </span>
          <button
            onClick={() => {
              const defaultSort = 'custom';
              try { localStorage.setItem('inventory_sort_by', defaultSort); } catch (e) {}
              onChange({ ...DEFAULT_FILTERS, sortBy: defaultSort });
            }}
            className="text-xs text-brand-600 hover:text-brand-800 font-bold hover:underline"
          >
            إعادة تعيين الفلاتر
          </button>
        </div>
      )}
    </div>
  );
}

/** يطبّق الفلاتر والتصفيط المستقر على قائمة المنتجات */
export function applyFilters(products, filters, getStockStatusFn, productCustodyMap = {}) {
  const afterSearch = searchProducts(products, filters.search);
  
  const filtered = afterSearch.filter((p) => {
    if (filters.category !== 'all' && p.cameraType !== filters.category) return false;
    if (filters.location === LOCATIONS.STORE && (Number(p.storeQty) || 0) <= 0) return false;
    if (filters.location === LOCATIONS.WAREHOUSE && (Number(p.warehouseQty) || 0) <= 0) return false;
    if (filters.location === 'custody' && (Number(productCustodyMap?.[p.id]?.totalQty) || 0) <= 0) return false;
    if (filters.stockStatus !== 'all' && getStockStatusFn(p) !== filters.stockStatus) return false;
    if (filters.priceMin !== '' && Number(p.retailPrice) < Number(filters.priceMin)) return false;
    if (filters.priceMax !== '' && Number(p.retailPrice) > Number(filters.priceMax)) return false;
    return true;
  });

  const sortBy = filters.sortBy || localStorage.getItem('inventory_sort_by') || 'custom';

  return filtered.sort((a, b) => {
    // 1. Custom Manual Order (الترتيب المخصص يدوياً بالأسهم)
    if (sortBy === 'custom') {
      const orderA = a.customOrder !== undefined && a.customOrder !== null ? Number(a.customOrder) : null;
      const orderB = b.customOrder !== undefined && b.customOrder !== null ? Number(b.customOrder) : null;
      
      if (orderA !== null && orderB !== null) {
        return orderA - orderB;
      }
      if (orderA !== null) return -1;
      if (orderB !== null) return 1;

      // If no customOrder, fall back to createdAt (oldest first or stable id)
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    }

    if (sortBy === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '', 'ar', { sensitivity: 'base' });
    }
    if (sortBy === 'category_asc') {
      const catCompare = (a.cameraType || '').localeCompare(b.cameraType || '', 'ar');
      if (catCompare !== 0) return catCompare;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    }
    if (sortBy === 'storeQty_desc') {
      return (Number(b.storeQty) || 0) - (Number(a.storeQty) || 0);
    }
    if (sortBy === 'totalQty_desc') {
      const totalA = (Number(a.storeQty) || 0) + (Number(a.warehouseQty) || 0) + (Number(productCustodyMap?.[a.id]?.totalQty) || 0);
      const totalB = (Number(b.storeQty) || 0) + (Number(b.warehouseQty) || 0) + (Number(productCustodyMap?.[b.id]?.totalQty) || 0);
      return totalB - totalA;
    }
    if (sortBy === 'retailPrice_desc') {
      return (Number(b.retailPrice) || 0) - (Number(a.retailPrice) || 0);
    }
    if (sortBy === 'retailPrice_asc') {
      return (Number(a.retailPrice) || 0) - (Number(b.retailPrice) || 0);
    }
    if (sortBy === 'createdAt_desc') {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    }
    if (sortBy === 'createdAt_asc') {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    }

    return 0;
  });
}
