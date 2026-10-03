import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getStockStatus, STOCK_STATUS } from '../models/product';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/**
 * بطاقات إحصائيات سريعة أعلى لوحة التحكم مع تقرير جرد متكامل يشمل المحل والمخزن والمعلقات بتفصيل دقيق.
 */
export default function StatsDashboard({ 
  products = [], 
  filteredProducts = [], 
  sortBy = 'custom', 
  draftSales = [],
  productCustodyMap = {},
  custodies = {},
  technicians = [],
  onFilterByStatus,
  activeStockStatus = 'all',
}) {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reportViewMode, setReportViewMode] = useState('category'); // 'category' | 'list'
  const [scope, setScope] = useState('all'); // 'all' (كافة الأقسام والمخزون) | 'filtered' (المفلتر)

  // Use drafts passed from props
  const allDrafts = useMemo(() => {
    return draftSales || [];
  }, [draftSales]);

  // Product map for quick lookup
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  // Helper to extract breakdown of who suspended a specific product and how many pieces / meters
  const getProductPendingBreakdown = (productId) => {
    if (!allDrafts || allDrafts.length === 0) return [];
    const map = new Map();
    const prod = productMap.get(productId);

    allDrafts
      .filter((d) => d.status === 'suspended' || d.isSuspended || d.status === 'draft')
      .forEach((draft) => {
        const item = draft.items?.find((i) => (i.productId === productId || i.id === productId));
        if (item && Number(item.quantity) > 0) {
          const name = (draft.customerName || draft.clientName || 'عميل نقدي').trim();
          map.set(name, (map.get(name) || 0) + Number(item.quantity));
        }
      });

    const list = [];
    map.forEach((qty, name) => {
      let formattedText = `${qty} ق`;
      if (prod && prod.sellMode === 'meter') {
        const mpr = Number(prod.metersPerRoll) || 305;
        if (mpr > 0 && qty >= mpr) {
          const rolls = Math.floor(qty / mpr);
          const meters = qty % mpr;
          formattedText = `${rolls} لفة${meters > 0 ? ` + ${meters} م` : ''}`;
        } else {
          formattedText = `${qty} م`;
        }
      }
      list.push({ name, qty, formattedText });
    });
    return list;
  };

  const total = products.length;
  const lowCount = products.filter((p) => getStockStatus(p) === STOCK_STATUS.LOW_STOCK).length;
  const outCount = products.filter((p) => getStockStatus(p) === STOCK_STATUS.OUT_OF_STOCK).length;

  const formatTotalUnits = (productsList, qtyKey, isCustody = false) => {
    let pieces = 0;
    let rolls = 0;
    let meters = 0;

    productsList.forEach(p => {
      let qty = 0;
      if (isCustody) {
        qty = Number(productCustodyMap[p.id]?.totalQty) || 0;
      } else {
        qty = Number(p[qtyKey]) || 0;
      }

      if (p.sellMode === 'meter') {
        const mpr = Number(p.metersPerRoll) || 305;
        if (mpr > 0) {
          rolls += Math.floor(qty / mpr);
          meters += qty % mpr;
        } else {
          meters += qty;
        }
      } else {
        pieces += qty;
      }
    });

    let parts = [];
    if (pieces > 0 || (rolls === 0 && meters === 0)) parts.push(`${pieces.toLocaleString()} ق`);
    if (rolls > 0) parts.push(`${rolls.toLocaleString()} لفة`);
    if (meters > 0) parts.push(`${meters.toLocaleString()} م`);
    
    return parts.join(' + ');
  };

  const storeUnitsText = formatTotalUnits(products, 'storeQty');
  const warehouseUnitsText = formatTotalUnits(products, 'warehouseQty');

  const storeCapital = products.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  const warehouseCapital = products.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  const totalCapital = storeCapital + warehouseCapital;
  
  const formatIQD = (num) => Math.round(num).toLocaleString('en-US');

  // Sorted products for the report (Defaults to ALL products unless user explicitly chooses 'filtered')
  const displayProducts = useMemo(() => {
    const baseList = (scope === 'filtered' && filteredProducts && filteredProducts.length > 0)
      ? filteredProducts
      : products;

    return [...baseList].sort((a, b) => {
      const orderA = a.customOrder !== undefined && a.customOrder !== null ? Number(a.customOrder) : null;
      const orderB = b.customOrder !== undefined && b.customOrder !== null ? Number(b.customOrder) : null;
      if (orderA !== null && orderB !== null) return orderA - orderB;
      if (orderA !== null) return -1;
      if (orderB !== null) return 1;

      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return (a.id || '').localeCompare(b.id || '');
    });
  }, [products, filteredProducts, scope]);

  // Total pending units formatted properly (pieces + rolls + meters)
  const formattedTotalPendingUnits = useMemo(() => {
    let pieces = 0, rolls = 0, meters = 0;
    allDrafts
      .filter((d) => d.status === 'suspended' || d.isSuspended || d.status === 'draft')
      .forEach((draft) => {
        draft.items?.forEach((item) => {
          const qty = Number(item.quantity) || 0;
          const prod = productMap.get(item.productId || item.id);
          if (prod && prod.sellMode === 'meter') {
            const mpr = Number(prod.metersPerRoll) || 305;
            if (mpr > 0) {
              rolls += Math.floor(qty / mpr);
              meters += qty % mpr;
            } else {
              meters += qty;
            }
          } else {
            pieces += qty;
          }
        });
      });

    let parts = [];
    if (pieces > 0) parts.push(`${pieces.toLocaleString()} ق`);
    if (rolls > 0) parts.push(`${rolls.toLocaleString()} لفة`);
    if (meters > 0) parts.push(`${meters.toLocaleString()} م`);
    return parts.length > 0 ? parts.join(' + ') : '0';
  }, [allDrafts, productMap]);

  // Report specific metrics matching the active displayProducts
  const reportStoreCapital = useMemo(() => displayProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0), [displayProducts]);
  const reportWarehouseCapital = useMemo(() => displayProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0), [displayProducts]);

  const reportStoreUnitsText = useMemo(() => formatTotalUnits(displayProducts, 'storeQty'), [displayProducts]);
  const reportWarehouseUnitsText = useMemo(() => formatTotalUnits(displayProducts, 'warehouseQty'), [displayProducts]);

  // Grouped products preserving the custom order within each category
  const groupedProducts = useMemo(() => {
    return displayProducts.reduce((acc, product) => {
      const cat = product.cameraType || 'أخرى';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {});
  }, [displayProducts]);

  // Alphabetically sorted category list
  const sortedCategoryKeys = useMemo(() => {
    return Object.keys(groupedProducts).sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
  }, [groupedProducts]);

  const hasFilterActive = filteredProducts && filteredProducts.length > 0 && filteredProducts.length < products.length;

  return (
    <>
      {/* أزرار التنبيهات المدمجة وطباعة التقرير مدمجة بدون أي فراغات ميتة */}
      <div className="flex items-center gap-1.5 select-none" dir="rtl">
        {/* زر طباعة تقرير المخزون */}
        <button
          type="button"
          onClick={() => {
            setScope('all');
            setShowPrintModal(true);
          }}
          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
          title="طباعة تقرير جرد المخزون الشامل"
        >
          <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span className="hidden lg:inline">تقرير المخزون</span>
        </button>

        {/* كارت التنبيهات المدمج: رقمين بمستطيلين (برتقالي للمنخفض، أحمر للنافذ) بدون أي نص وزر قابل للضغط */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
          {/* المستطيل البرتقالي للمنخفض */}
          <button
            type="button"
            onClick={() => onFilterByStatus?.(activeStockStatus === STOCK_STATUS.LOW_STOCK ? 'all' : STOCK_STATUS.LOW_STOCK)}
            className={`min-w-[40px] sm:min-w-[46px] h-7 sm:h-8 px-2 rounded-md flex items-center justify-center font-black font-mono text-xs sm:text-sm transition-all cursor-pointer shadow-2xs ${
              activeStockStatus === STOCK_STATUS.LOW_STOCK
                ? 'bg-amber-600 text-white ring-2 ring-amber-400 ring-offset-1 scale-105'
                : 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95'
            }`}
            title={`منخفض: ${lowCount}`}
          >
            {lowCount}
          </button>

          {/* المستطيل الأحمر للنافذ */}
          <button
            type="button"
            onClick={() => onFilterByStatus?.(activeStockStatus === STOCK_STATUS.OUT_OF_STOCK ? 'all' : STOCK_STATUS.OUT_OF_STOCK)}
            className={`min-w-[40px] sm:min-w-[46px] h-7 sm:h-8 px-2 rounded-md flex items-center justify-center font-black font-mono text-xs sm:text-sm transition-all cursor-pointer shadow-2xs ${
              activeStockStatus === STOCK_STATUS.OUT_OF_STOCK
                ? 'bg-rose-700 text-white ring-2 ring-rose-400 ring-offset-1 scale-105'
                : 'bg-rose-600 hover:bg-rose-700 text-white active:scale-95'
            }`}
            title={`نافذ: ${outCount}`}
          >
            {outCount}
          </button>
        </div>
      </div>

      {showPrintModal && createPortal(
        <>
          <style>{`
            @page {
              size: A4 portrait;
              margin: 6mm 6mm 8mm 6mm;
            }
            @media print {
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box !important;
              }
              html, body {
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                font-size: 12px !important;
                line-height: 1.35 !important;
              }
              body > :not(#print-inventory-portal) {
                display: none !important;
              }
              #print-inventory-portal {
                position: static !important;
                display: block !important;
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
              }
              #print-inventory-portal > div {
                width: 100% !important;
                max-width: 100% !important;
                box-shadow: none !important;
                border: none !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .print-hide { display: none !important; }
              
              /* Dense table layout filling the entire page without blank gaps */
              table {
                page-break-inside: auto !important;
                break-inside: auto !important;
                width: 100% !important;
                margin-bottom: 6px !important;
              }
              tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                page-break-after: auto !important;
                break-after: auto !important;
              }
              thead {
                display: table-header-group !important;
              }
              tfoot {
                display: table-footer-group !important;
              }
              .category-section-wrap {
                page-break-inside: auto !important;
                break-inside: auto !important;
                margin-bottom: 6px !important;
              }
              .category-header-wrap {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            }
          `}</style>
          <div id="print-inventory-portal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm print:bg-white print:p-0 print:relative print:inset-auto print:block">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col print:shadow-none print:w-full print:max-w-full">
              
              {/* Header (Hidden when printing) */}
              <div className="p-4 border-b border-ink-100 flex items-center justify-between print-hide flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-ink-900">تقرير المخزون المطبوع</h2>
                    <p className="text-xs text-brand-600 font-medium">يشمل المحل والمخزن والمعلقات بالتفصيل</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  
                  {/* Scope Selector: All vs Filtered (if filter is active in main table) */}
                  {hasFilterActive && (
                    <div className="inline-flex bg-slate-100 p-1 rounded-lg gap-1">
                      <button
                        onClick={() => setScope('all')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                          scope === 'all' ? 'bg-brand-600 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        📁 كافة الأقسام ({products.length})
                      </button>
                      <button
                        onClick={() => setScope('filtered')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                          scope === 'filtered' ? 'bg-brand-600 text-white shadow-2xs' : 'text-slate-600'
                        }`}
                      >
                        🔍 المفلتر ({filteredProducts.length})
                      </button>
                    </div>
                  )}

                  {/* View Mode Toggle */}
                  <div className="inline-flex bg-slate-100 p-1 rounded-lg gap-1">
                    <button
                      onClick={() => setReportViewMode('category')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        reportViewMode === 'category' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      📁 مجمع بالأقسام
                    </button>
                    <button
                      onClick={() => setReportViewMode('list')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        reportViewMode === 'list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      📋 تسلسل المخزون
                    </button>
                  </div>

                  <button 
                    onClick={() => window.print()}
                    className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold shadow-xs cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                    <span>طباعة / PDF</span>
                  </button>
                  <button onClick={() => setShowPrintModal(false)} className="p-1.5 text-ink-500 hover:text-ink-700 hover:bg-ink-100 rounded-lg transition-colors cursor-pointer">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
              
              {/* Document Body */}
              <div className="p-6 overflow-y-auto print:overflow-visible print:p-0">
                <div className="hidden print:block text-center mb-4 border-b-2 border-ink-900 pb-3">
                  <div className="flex justify-between items-center">
                    <h1 className="text-xl font-black text-ink-900 tracking-wide">
                      تقرير جرد المخزون العام
                    </h1>
                    <p className="text-ink-700 text-xs font-bold font-mono">تاريخ التقرير: {new Date().toLocaleDateString('ar-IQ')}</p>
                  </div>
                </div>
                
                {/* بطاقات الإحصائيات المدمجة: المحل (قطع ورأس مال) والمخزن (قطع ورأس مال) وإجمالي المواد ورأس المال */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 print:mb-3 print:gap-2">
                  {/* كارت 1: إجمالي المواد ورأس المال الكلي */}
                  <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-2">
                    <p className="text-xs sm:text-sm font-bold text-ink-700 mb-1 print:text-[11px]">إجمالي المواد والأصناف</p>
                    <p className="text-xl sm:text-2xl font-black text-ink-900 font-mono print:text-base leading-tight">
                      {displayProducts.length} <span className="text-xs font-bold text-ink-600">صنف</span>
                    </p>
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200">
                      <span className="text-xs sm:text-sm font-bold text-brand-800 font-mono print:text-[11px]">
                        إجمالي رأس المال: <strong>{formatIQD(reportStoreCapital + reportWarehouseCapital)}</strong> د.ع
                      </span>
                    </div>
                    {formattedTotalPendingUnits !== '0' && (
                      <span className="inline-block mt-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        ⏳ معلق: {formattedTotalPendingUnits}
                      </span>
                    )}
                  </div>

                  {/* كارت 2: المحل (دمج قطع المحل مع رأس مال المحل) */}
                  <div className="bg-brand-50/50 p-3 sm:p-3.5 rounded-xl border border-brand-200 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-2" dir="rtl">
                    <p className="text-xs sm:text-sm font-bold text-brand-900 mb-1 print:text-[11px]">🏪 مخزون ورأس مال المحل</p>
                    <p className="text-lg sm:text-xl font-black text-brand-700 font-mono print:text-base leading-snug">
                      {reportStoreUnitsText}
                    </p>
                    <div className="mt-1.5 pt-1.5 border-t border-brand-200/80">
                      <span className="text-xs sm:text-sm font-bold text-emerald-800 font-mono print:text-[11px]">
                        رأس المال: <strong className="font-black">{formatIQD(reportStoreCapital)}</strong> د.ع
                      </span>
                    </div>
                  </div>

                  {/* كارت 3: المخزن (دمج قطع المخزن مع رأس مال المخزن) */}
                  <div className="bg-indigo-50/50 p-3 sm:p-3.5 rounded-xl border border-indigo-200 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-2" dir="rtl">
                    <p className="text-xs sm:text-sm font-bold text-indigo-900 mb-1 print:text-[11px]">🏢 مخزون ورأس مال المخزن</p>
                    <p className="text-lg sm:text-xl font-black text-indigo-700 font-mono print:text-base leading-snug">
                      {reportWarehouseUnitsText}
                    </p>
                    <div className="mt-1.5 pt-1.5 border-t border-indigo-200/80">
                      <span className="text-xs sm:text-sm font-bold text-teal-800 font-mono print:text-[11px]">
                        رأس المال: <strong className="font-black">{formatIQD(reportWarehouseCapital)}</strong> د.ع
                      </span>
                    </div>
                  </div>
                </div>

                {/* VIEW 1: Grouped by Category (Sorted Alphabetically & Continuously Filling Pages) */}
                {reportViewMode === 'category' && (
                  sortedCategoryKeys.map((category) => {
                    const catProducts = groupedProducts[category];
                    const catStoreCapital = catProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                    const catWarehouseCapital = catProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                    const catStoreUnits = formatTotalUnits(catProducts, 'storeQty');
                    const catWarehouseUnits = formatTotalUnits(catProducts, 'warehouseQty');
                    
                    return (
                      <div key={category} className="mb-5 print:mb-4 category-section-wrap">
                        <div className="category-header-wrap pb-1.5 mb-2 border-b-2 border-brand-400 flex justify-between items-center flex-wrap gap-2 print:py-1">
                          <h3 className="text-sm sm:text-base font-extrabold text-ink-900 print:text-[13px]">
                            قسم: {category} ({catProducts.length} صنف)
                          </h3>
                          <div className="text-xs sm:text-sm font-bold flex flex-wrap gap-2 print:text-[11px]" dir="rtl">
                            <span className="text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-mono">
                              المحل: {catStoreUnits} | {formatIQD(catStoreCapital)} د.ع
                            </span>
                            <span className="text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-300 font-mono">
                              المخزن: {catWarehouseUnits} | {formatIQD(catWarehouseCapital)} د.ع
                            </span>
                          </div>
                        </div>

                        <table className="w-full text-xs sm:text-sm text-right border-collapse table-fixed print:text-[12.5px]">
                          <thead>
                            <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold text-slate-900 print:bg-slate-100">
                              <th style={{ width: '4%' }} className="py-2 px-1 text-center font-bold print:py-1">#</th>
                              <th style={{ width: '38%' }} className="py-2 px-2.5 font-bold print:py-1">اسم المنتج / SKU</th>
                              <th style={{ width: '15%' }} className="py-2 px-1.5 text-center font-bold text-brand-800 print:py-1">المحل (قطع / رأس مال)</th>
                              <th style={{ width: '15%' }} className="py-2 px-1.5 text-center font-bold text-indigo-800 print:py-1">المخزن (قطع / رأس مال)</th>
                              <th style={{ width: '14%' }} className="py-2 px-1.5 text-center font-bold print:py-1">التكلفة (جملة)</th>
                              <th style={{ width: '14%' }} className="py-2 px-1.5 text-center font-bold text-brand-700 print:py-1">البيع (مفرد)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {catProducts.map((product, idx) => {
                              const pendingBreakdown = getProductPendingBreakdown(product.id);
                              const storeCapitalVal = (Number(product.storeQty) || 0) * (Number(product.wholesalePrice) || 0);
                              const whCapitalVal = (Number(product.warehouseQty) || 0) * (Number(product.wholesalePrice) || 0);

                              return (
                                <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                  <td className="py-2 px-1 text-center font-mono font-bold text-slate-500 print:py-1">{idx + 1}</td>
                                  <td className="py-2 px-2.5 print:py-1">
                                    <div className="font-bold text-slate-900 text-xs sm:text-sm leading-snug print:text-[12px]">{product.name}</div>
                                    <div className="text-[11px] text-slate-500 font-mono leading-none mt-0.5 print:text-[9.5px]">{product.sku}</div>
                                    
                                    {/* Prominent Pending Breakdown with Customer Name & Formatted Pieces / Meters */}
                                    {pendingBreakdown.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1 items-center">
                                        {pendingBreakdown.map((pb, pidx) => (
                                          <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                            <span>⏳ معلق لـ {pb.name}:</span>
                                            <strong className="text-amber-950 font-mono">({pb.formattedText})</strong>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-mono print:py-1">
                                    <span className="font-black text-brand-700 text-sm sm:text-base block">
                                      {Number(product.storeQty || 0).toLocaleString()}
                                    </span>
                                    <span className="text-[10.5px] font-bold text-emerald-800 block leading-tight print:text-[9.5px]">
                                      {formatIQD(storeCapitalVal)} د.ع
                                    </span>
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-mono print:py-1">
                                    <span className="font-black text-indigo-700 text-sm sm:text-base block">
                                      {Number(product.warehouseQty || 0).toLocaleString()}
                                    </span>
                                    <span className="text-[10.5px] font-bold text-teal-800 block leading-tight print:text-[9.5px]">
                                      {formatIQD(whCapitalVal)} د.ع
                                    </span>
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-mono text-slate-800 font-bold text-xs sm:text-sm print:py-1">
                                    {formatIQD(product.wholesalePrice)}
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-black font-mono text-brand-700 text-xs sm:text-sm print:py-1">
                                    {formatIQD(product.retailPrice)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })
                )}

                {/* VIEW 2: Full Unified Ordered List (1 to N strictly matching table sequence) */}
                {reportViewMode === 'list' && (
                  <table className="w-full text-xs sm:text-sm text-right border-collapse table-fixed print:text-[12.5px]">
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold text-slate-900 print:bg-slate-100">
                        <th style={{ width: '4%' }} className="py-2 px-1 text-center font-bold print:py-1">#</th>
                        <th style={{ width: '32%' }} className="py-2 px-2.5 font-bold print:py-1">اسم المنتج</th>
                        <th style={{ width: '14%' }} className="py-2 px-1 font-bold print:py-1">القسم</th>
                        <th style={{ width: '13%' }} className="py-2 px-1.5 text-center font-bold text-brand-800 print:py-1">المحل (قطع / رأس مال)</th>
                        <th style={{ width: '13%' }} className="py-2 px-1.5 text-center font-bold text-indigo-800 print:py-1">المخزن (قطع / رأس مال)</th>
                        <th style={{ width: '12%' }} className="py-2 px-1.5 text-center font-bold print:py-1">التكلفة</th>
                        <th style={{ width: '12%' }} className="py-2 px-1.5 text-center font-bold text-brand-700 print:py-1">المفرد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {displayProducts.map((product, idx) => {
                        const pendingBreakdown = getProductPendingBreakdown(product.id);
                        const storeCapitalVal = (Number(product.storeQty) || 0) * (Number(product.wholesalePrice) || 0);
                        const whCapitalVal = (Number(product.warehouseQty) || 0) * (Number(product.wholesalePrice) || 0);

                        return (
                          <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                            <td className="py-2 px-1 text-center font-mono font-bold text-slate-500 print:py-1">{idx + 1}</td>
                            <td className="py-2 px-2.5 print:py-1">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">{product.name}</span>
                              <span className="text-[10.5px] text-slate-500 font-mono mr-1 print:text-[9.5px]">({product.sku})</span>

                              {/* Prominent Pending Breakdown with Customer Name & Pieces / Meters */}
                              {pendingBreakdown.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1 items-center">
                                  {pendingBreakdown.map((pb, pidx) => (
                                    <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                      <span>⏳ معلق لـ {pb.name}:</span>
                                      <strong className="text-amber-950 font-mono">({pb.formattedText})</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-1 text-slate-600 truncate text-xs sm:text-sm print:py-1">{product.cameraType || '—'}</td>
                            <td className="py-2 px-1.5 text-center font-mono print:py-1">
                              <span className="font-black text-brand-700 text-sm sm:text-base block">
                                {Number(product.storeQty || 0).toLocaleString()}
                              </span>
                              <span className="text-[10.5px] font-bold text-emerald-800 block leading-tight print:text-[9.5px]">
                                {formatIQD(storeCapitalVal)} د.ع
                              </span>
                            </td>
                            <td className="py-2 px-1.5 text-center font-mono print:py-1">
                              <span className="font-black text-indigo-700 text-sm sm:text-base block">
                                {Number(product.warehouseQty || 0).toLocaleString()}
                              </span>
                              <span className="text-[10.5px] font-bold text-teal-800 block leading-tight print:text-[9.5px]">
                                {formatIQD(whCapitalVal)} د.ع
                              </span>
                            </td>
                            <td className="py-2 px-1.5 text-center font-mono text-slate-800 font-bold text-xs sm:text-sm print:py-1">{formatIQD(product.wholesalePrice)}</td>
                            <td className="py-2 px-1.5 text-center font-black font-mono text-brand-700 text-xs sm:text-sm print:py-1">{formatIQD(product.retailPrice)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

              </div>

            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
