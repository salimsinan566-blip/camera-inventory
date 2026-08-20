import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getStockStatus, STOCK_STATUS } from '../models/product';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/**
 * بطاقات إحصائيات سريعة أعلى لوحة التحكم مع تقرير جرد متكامل يشمل المحل والمخزن وعُهدة السيارات والمعلقات بتفصيل دقيق.
 */
export default function StatsDashboard({ 
  products = [], 
  filteredProducts = [], 
  sortBy = 'custom', 
  draftSales = [],
  productCustodyMap = {},
  custodies = {},
  technicians = []
}) {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reportViewMode, setReportViewMode] = useState('category'); // 'category' | 'list' | 'custody'
  const [scope, setScope] = useState('all'); // 'all' (كافة الأقسام والمخزون) | 'filtered' (المفلتر)
  const [suspendedDrafts, setSuspendedDrafts] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'sales'),
      where('status', 'in', ['draft', 'suspended'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSuspendedDrafts(data);
    });
    return unsubscribe;
  }, []);

  // Merge drafts passed from props or real-time Firestore listener
  const allDrafts = useMemo(() => {
    if (draftSales && draftSales.length > 0) return draftSales;
    return suspendedDrafts;
  }, [draftSales, suspendedDrafts]);

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
  const custodyUnitsText = formatTotalUnits(products, null, true);

  const storeCapital = products.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  const warehouseCapital = products.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  const custodyCapital = products.reduce((sum, p) => sum + ((Number(productCustodyMap[p.id]?.totalQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  const totalCapital = storeCapital + warehouseCapital + custodyCapital;
  
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
  const reportCustodyCapital = useMemo(() => displayProducts.reduce((sum, p) => sum + ((Number(productCustodyMap[p.id]?.totalQty) || 0) * (Number(p.wholesalePrice) || 0)), 0), [displayProducts, productCustodyMap]);

  const reportStoreUnitsText = useMemo(() => formatTotalUnits(displayProducts, 'storeQty'), [displayProducts]);
  const reportWarehouseUnitsText = useMemo(() => formatTotalUnits(displayProducts, 'warehouseQty'), [displayProducts]);
  const reportCustodyUnitsText = useMemo(() => formatTotalUnits(displayProducts, null, true), [displayProducts, productCustodyMap]);

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

  // Active Custody breakdown by Technician / Vehicle
  const activeCustodiesList = useMemo(() => {
    return Object.entries(custodies || {})
      .map(([techId, cDoc]) => {
        const tech = technicians.find(t => t.id === techId) || {};
        const items = (cDoc.items || []).filter(it => (Number(it.quantity) || 0) > 0);
        const totalItems = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        const totalCostVal = items.reduce((sum, it) => {
          const prod = productMap.get(it.productId);
          const price = prod?.wholesalePrice !== undefined ? Number(prod.wholesalePrice) : (Number(it.wholesalePrice) || 0);
          return sum + ((Number(it.quantity) || 0) * price);
        }, 0);

        return {
          techId,
          techName: cDoc.technicianName || tech.name || 'فني',
          vehicleNumber: tech.vehicleNumber || cDoc.vehicleNumber || '—',
          phone: tech.phone || cDoc.phone || '—',
          items,
          totalItems,
          totalCostVal
        };
      })
      .filter(c => c.items.length > 0);
  }, [custodies, technicians, productMap]);

  const cards = [
    { id: 'total', label: 'إجمالي المنتجات', value: total, className: 'text-ink-900', interactive: false },
    { id: 'low', label: 'منخفضة المخزون', value: lowCount, className: 'text-warn-700', interactive: false },
    { id: 'out', label: 'نافذة المخزون', value: outCount, className: 'text-danger-700', interactive: false },
    {
      id: 'inventory',
      label: 'المحل / المخزن / السيارات',
      value: (
        <div className="flex flex-col text-xs font-bold gap-1 mt-1" dir="rtl">
          <span className="text-brand-700">محل: {storeUnitsText}</span>
          <span className="text-indigo-700">مخزن: {warehouseUnitsText}</span>
          {custodyUnitsText && custodyUnitsText !== '0 ق' && (
            <span className="text-amber-800">سيارات 🚚: {custodyUnitsText}</span>
          )}
        </div>
      ),
      className: '',
      interactive: true,
      onClick: () => {
        setScope('all');
        setShowPrintModal(true);
      }
    },
    {
      id: 'capital',
      label: 'إجمالي رأس المال',
      value: (
        <div className="flex flex-col text-sm font-bold gap-1 mt-1" dir="rtl">
          <span className="text-base text-ink-900">{formatIQD(totalCapital)} د.ع</span>
          <div className="flex flex-wrap gap-2 text-[11px] mt-1 border-t border-ink-100 pt-1">
            <span className="text-emerald-700">محل: {formatIQD(storeCapital)}</span>
            <span className="text-teal-700">مخزن: {formatIQD(warehouseCapital)}</span>
            {custodyCapital > 0 && (
              <span className="text-amber-800">سيارات: {formatIQD(custodyCapital)}</span>
            )}
          </div>
        </div>
      ),
      className: '',
      interactive: false
    }
  ];

  const hasFilterActive = filteredProducts && filteredProducts.length > 0 && filteredProducts.length < products.length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {cards.map((card) => {
          const CardContent = (
            <>
              <p className="text-xs text-ink-500 font-medium">{card.label}</p>
              {typeof card.value === 'object' ? (
                card.value
              ) : (
                <p className={`text-2xl font-bold mt-1 ${card.className}`}>{card.value}</p>
              )}
            </>
          );

          if (card.interactive) {
            return (
              <button
                key={card.id}
                onClick={card.onClick}
                className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center hover:bg-brand-50 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer ring-2 ring-transparent focus:ring-brand-500 focus:outline-none"
                title="اضغط لعرض تفاصيل المخزون وطباعتها بنفس الترتيب الحالي"
              >
                {CardContent}
                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-bold text-brand-600 bg-brand-100/50 py-1 px-2 rounded-md">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  طباعة التقرير
                </div>
              </button>
            );
          }

          const isLast = card.id === 'capital';
          return (
            <div key={card.id} className={`bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center ${isLast ? 'col-span-2 lg:col-span-1' : ''}`}>
              {CardContent}
            </div>
          );
        })}
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
                font-size: 10px !important;
                line-height: 1.2 !important;
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
                    <p className="text-xs text-brand-600 font-medium">يشمل المحل والمخزن وعُهدة السيارات والمعلقات بالتفصيل</p>
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
                    <button
                      onClick={() => setReportViewMode('custody')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        reportViewMode === 'custody' ? 'bg-amber-600 text-white shadow-2xs' : 'text-amber-800 bg-amber-50'
                      }`}
                    >
                      🚚 عهدة السيارات ({activeCustodiesList.length})
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
                      {reportViewMode === 'custody' ? 'كشف عهدة سيارات الفنيين' : 'تقرير جرد المخزون العام'}
                    </h1>
                    <p className="text-ink-700 text-xs font-bold font-mono">تاريخ التقرير: {new Date().toLocaleDateString('ar-IQ')}</p>
                  </div>
                </div>
                
                {/* Prominent, Large Summary Cards (6 Cards grid including Cars) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5 print:mb-3 print:gap-1.5 print:page-break-after-auto">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5">
                    <p className="text-xs font-bold text-ink-600 mb-0.5 print:text-[10px]">إجمالي المواد</p>
                    <p className="text-lg font-black text-ink-900 font-mono print:text-sm">{displayProducts.length}</p>
                    {formattedTotalPendingUnits !== '0' && (
                      <span className="inline-block mt-0.5 text-[9.5px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                        ⏳ معلق: {formattedTotalPendingUnits}
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5" dir="rtl">
                    <p className="text-xs font-bold text-brand-800 mb-0.5 print:text-[10px]">قطع المحل</p>
                    <p className="text-xs font-black text-brand-700 font-mono print:text-[11px] leading-snug">{reportStoreUnitsText}</p>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5" dir="rtl">
                    <p className="text-xs font-bold text-indigo-800 mb-0.5 print:text-[10px]">قطع المخزن</p>
                    <p className="text-xs font-black text-indigo-700 font-mono print:text-[11px] leading-snug">{reportWarehouseUnitsText}</p>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5" dir="rtl">
                    <p className="text-xs font-bold text-amber-900 mb-0.5 print:text-[10px]">السيارات 🚚</p>
                    <p className="text-xs font-black text-amber-800 font-mono print:text-[11px] leading-snug">{reportCustodyUnitsText || '0 ق'}</p>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5" dir="rtl">
                    <p className="text-xs font-bold text-emerald-800 mb-0.5 print:text-[10px]">رأس مال المحل</p>
                    <p className="text-xs font-black text-emerald-700 font-mono print:text-[11px]">{formatIQD(reportStoreCapital)} د.ع</p>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 shadow-2xs text-center print:border-ink-500 print:bg-white print:p-1.5" dir="rtl">
                    <p className="text-xs font-bold text-teal-800 mb-0.5 print:text-[10px]">رأس مال المخزن</p>
                    <p className="text-xs font-black text-teal-700 font-mono print:text-[11px]">{formatIQD(reportWarehouseCapital)} د.ع</p>
                  </div>
                </div>

                {/* VIEW 1: Grouped by Category (Sorted Alphabetically & Continuously Filling Pages) */}
                {reportViewMode === 'category' && (
                  sortedCategoryKeys.map((category) => {
                    const catProducts = groupedProducts[category];
                    const catStoreCapital = catProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                    const catWarehouseCapital = catProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                    const catCustodyCapital = catProducts.reduce((sum, p) => sum + ((Number(productCustodyMap[p.id]?.totalQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                    
                    return (
                      <div key={category} className="mb-4 print:mb-3 category-section-wrap">
                        <div className="category-header-wrap pb-1 mb-1 border-b border-brand-400 flex justify-between items-center flex-wrap gap-1 print:py-0.5">
                          <h3 className="text-xs font-bold text-ink-900 print:text-[11px]">
                            قسم: {category} ({catProducts.length} صنف)
                          </h3>
                          <div className="text-[10px] font-bold flex flex-wrap gap-1.5 print:text-[9px]" dir="rtl">
                            <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">محل: {formatIQD(catStoreCapital)} د.ع</span>
                            <span className="text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 font-mono">مخزن: {formatIQD(catWarehouseCapital)} د.ع</span>
                            {catCustodyCapital > 0 && (
                              <span className="text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-mono">سيارات 🚚: {formatIQD(catCustodyCapital)} د.ع</span>
                            )}
                          </div>
                        </div>

                        <table className="w-full text-[11px] text-right border-collapse table-fixed">
                          <thead>
                            <tr className="bg-ink-100 border-b border-ink-300 font-bold text-ink-900 print:bg-slate-100">
                              <th style={{ width: '4%' }} className="py-1 px-1 text-center print:py-0.5">#</th>
                              <th style={{ width: '38%' }} className="py-1 px-2 print:py-0.5">اسم المنتج / SKU</th>
                              <th style={{ width: '11%' }} className="py-1 px-1 text-center text-brand-700 print:py-0.5">المحل</th>
                              <th style={{ width: '11%' }} className="py-1 px-1 text-center text-indigo-700 print:py-0.5">المخزن</th>
                              <th style={{ width: '12%' }} className="py-1 px-1 text-center text-amber-800 print:py-0.5">السيارات 🚚</th>
                              <th style={{ width: '12%' }} className="py-1 px-1 text-center print:py-0.5">التكلفة (جملة)</th>
                              <th style={{ width: '12%' }} className="py-1 px-1 text-center text-brand-700 print:py-0.5">البيع (مفرد)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {catProducts.map((product, idx) => {
                              const pendingBreakdown = getProductPendingBreakdown(product.id);
                              const custodyInfo = productCustodyMap[product.id];
                              const custodyQty = Number(custodyInfo?.totalQty) || 0;

                              return (
                                <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                                  <td className="py-1 px-1 text-center font-mono font-bold text-ink-400 print:py-0.5">{idx + 1}</td>
                                  <td className="py-1 px-2 print:py-0.5">
                                    <div className="font-bold text-ink-900 leading-tight">{product.name}</div>
                                    <div className="text-[9px] text-ink-400 font-mono leading-none mt-0.5">{product.sku}</div>
                                    
                                    {/* Prominent Pending Breakdown with Customer Name & Formatted Pieces / Meters */}
                                    {pendingBreakdown.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1 items-center">
                                        {pendingBreakdown.map((pb, pidx) => (
                                          <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[9.5px] font-bold">
                                            <span>⏳ معلق لـ {pb.name}:</span>
                                            <strong className="text-amber-950 font-mono">({pb.formattedText})</strong>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1 px-1 text-center font-bold font-mono text-brand-700 print:py-0.5">{Number(product.storeQty || 0).toLocaleString()}</td>
                                  <td className="py-1 px-1 text-center font-bold font-mono text-indigo-700 print:py-0.5">{Number(product.warehouseQty || 0).toLocaleString()}</td>
                                  <td className="py-1 px-1 text-center font-bold font-mono text-amber-800 print:py-0.5">
                                    {custodyQty > 0 ? (
                                      <div>
                                        <span>{custodyQty.toLocaleString()}</span>
                                        {custodyInfo?.breakdown?.length > 0 && (
                                          <div className="text-[8.5px] font-normal text-amber-900 leading-none mt-0.5">
                                            {custodyInfo.breakdown.map(b => `${b.techName} (${b.qty})`).join('، ')}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-ink-300">—</span>
                                    )}
                                  </td>
                                  <td className="py-1 px-1 text-center font-mono text-ink-700 print:py-0.5">{formatIQD(product.wholesalePrice)}</td>
                                  <td className="py-1 px-1 text-center font-bold font-mono text-brand-700 print:py-0.5">{formatIQD(product.retailPrice)}</td>
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
                  <table className="w-full text-[11px] text-right border-collapse table-fixed">
                    <thead>
                      <tr className="bg-ink-100 border-b-2 border-ink-400 font-bold text-ink-900 print:bg-slate-100">
                        <th style={{ width: '4%' }} className="py-1.5 px-1 text-center print:py-0.5">#</th>
                        <th style={{ width: '35%' }} className="py-1.5 px-2 print:py-0.5">اسم المنتج</th>
                        <th style={{ width: '15%' }} className="py-1.5 px-1 print:py-0.5">القسم</th>
                        <th style={{ width: '9%' }} className="py-1.5 px-1 text-center text-brand-700 print:py-0.5">المحل</th>
                        <th style={{ width: '9%' }} className="py-1.5 px-1 text-center text-indigo-700 print:py-0.5">المخزن</th>
                        <th style={{ width: '10%' }} className="py-1.5 px-1 text-center text-amber-800 print:py-0.5">السيارات 🚚</th>
                        <th style={{ width: '9%' }} className="py-1.5 px-1 text-center print:py-0.5">التكلفة</th>
                        <th style={{ width: '9%' }} className="py-1.5 px-1 text-center text-brand-700 print:py-0.5">المفرد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {displayProducts.map((product, idx) => {
                        const pendingBreakdown = getProductPendingBreakdown(product.id);
                        const custodyInfo = productCustodyMap[product.id];
                        const custodyQty = Number(custodyInfo?.totalQty) || 0;

                        return (
                          <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                            <td className="py-1 px-1 text-center font-mono font-bold text-ink-500 print:py-0.5">{idx + 1}</td>
                            <td className="py-1 px-2 print:py-0.5">
                              <span className="font-bold text-ink-900">{product.name}</span>
                              <span className="text-[9px] text-ink-400 font-mono mr-1">({product.sku})</span>

                              {/* Prominent Pending Breakdown with Customer Name & Pieces / Meters */}
                              {pendingBreakdown.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1 items-center">
                                  {pendingBreakdown.map((pb, pidx) => (
                                    <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[9.5px] font-bold">
                                      <span>⏳ معلق لـ {pb.name}:</span>
                                      <strong className="text-amber-950 font-mono">({pb.formattedText})</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-1 px-1 text-ink-600 truncate print:py-0.5">{product.cameraType || '—'}</td>
                            <td className="py-1 px-1 text-center font-bold font-mono text-brand-700 print:py-0.5">{Number(product.storeQty || 0).toLocaleString()}</td>
                            <td className="py-1 px-1 text-center font-bold font-mono text-indigo-700 print:py-0.5">{Number(product.warehouseQty || 0).toLocaleString()}</td>
                            <td className="py-1 px-1 text-center font-bold font-mono text-amber-800 print:py-0.5">
                              {custodyQty > 0 ? (
                                <div>
                                  <span>{custodyQty.toLocaleString()}</span>
                                  {custodyInfo?.breakdown?.length > 0 && (
                                    <div className="text-[8.5px] font-normal text-amber-900 leading-none mt-0.5">
                                      {custodyInfo.breakdown.map(b => `${b.techName} (${b.qty})`).join('، ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-ink-300">—</span>
                              )}
                            </td>
                            <td className="py-1 px-1 text-center font-mono text-ink-700 print:py-0.5">{formatIQD(product.wholesalePrice)}</td>
                            <td className="py-1 px-1 text-center font-bold font-mono text-brand-700 print:py-0.5">{formatIQD(product.retailPrice)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* VIEW 3: Dedicated Vehicle Custody Sheet per Technician (كشف عهدة السيارات التفصيلي) */}
                {(reportViewMode === 'custody' || (reportViewMode !== 'custody' && activeCustodiesList.length > 0)) && (
                  <div className="mt-8 pt-4 border-t-2 border-dashed border-slate-300 print:mt-6 print:pt-4">
                    <div className="mb-4 bg-amber-50/80 p-2.5 rounded-xl border border-amber-300 flex justify-between items-center print:bg-white print:border-ink-600">
                      <div>
                        <h2 className="text-sm font-black text-amber-950 flex items-center gap-1.5 print:text-ink-900">
                          <span>🚚</span>
                          <span>كشف المواد الموجودة في عهدة سيارات الفنيين ({activeCustodiesList.length} سيارة)</span>
                        </h2>
                        <p className="text-[10px] text-amber-850 print:text-ink-600">تفصيل المواد والكميات المحملة حالياً في كل مركبة</p>
                      </div>
                      <div className="text-xs font-bold text-amber-950 font-mono print:text-ink-900" dir="rtl">
                        إجمالي رأس مال السيارات: {formatIQD(reportCustodyCapital)} د.ع
                      </div>
                    </div>

                    {activeCustodiesList.length === 0 ? (
                      <p className="text-center text-xs text-ink-500 py-4">لا توجد مواد محملة بالسيارات حالياً.</p>
                    ) : (
                      activeCustodiesList.map((c) => (
                        <div key={c.techId} className="mb-6 print:mb-4 category-section-wrap bg-white rounded-xl border border-slate-200 p-3 print:p-0 print:border-none">
                          <div className="pb-1.5 mb-2 border-b border-slate-300 flex justify-between items-center flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-amber-100 text-amber-950 font-bold px-2 py-0.5 rounded text-xs">
                                🚗 {c.techName}
                              </span>
                              <span className="text-[11px] text-slate-600 font-mono">
                                مركبة: {c.vehicleNumber}
                              </span>
                              {c.phone && c.phone !== '—' && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  📞 {c.phone}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold flex gap-2" dir="rtl">
                              <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">
                                {c.items.length} صنف ({c.totalItems.toLocaleString()} مادة)
                              </span>
                              <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                                القيمة: {formatIQD(c.totalCostVal)} د.ع
                              </span>
                            </div>
                          </div>

                          <table className="w-full text-[11px] text-right border-collapse table-fixed">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-900 print:bg-slate-100">
                                <th style={{ width: '6%' }} className="py-1 px-1 text-center">#</th>
                                <th style={{ width: '46%' }} className="py-1 px-2">اسم المادة / SKU</th>
                                <th style={{ width: '16%' }} className="py-1 px-1 text-center text-amber-900">الكمية المحملة</th>
                                <th style={{ width: '16%' }} className="py-1 px-1 text-center">سعر التكلفة</th>
                                <th style={{ width: '16%' }} className="py-1 px-1 text-center text-emerald-800">إجمالي القيمة</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {c.items.map((it, iIdx) => {
                                const prod = productMap.get(it.productId);
                                const qty = Number(it.quantity) || 0;
                                const unitCost = prod?.wholesalePrice !== undefined ? Number(prod.wholesalePrice) : (Number(it.wholesalePrice) || 0);
                                const itemTotal = qty * unitCost;

                                let formattedQty = `${qty} ق`;
                                if (prod && prod.sellMode === 'meter') {
                                  const mpr = Number(prod.metersPerRoll) || 305;
                                  if (mpr > 0 && qty >= mpr) {
                                    const rolls = Math.floor(qty / mpr);
                                    const meters = qty % mpr;
                                    formattedQty = `${rolls} لفة${meters > 0 ? ` + ${meters} م` : ''}`;
                                  } else {
                                    formattedQty = `${qty} م`;
                                  }
                                }

                                return (
                                  <tr key={iIdx} className={iIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                    <td className="py-1 px-1 text-center font-mono font-bold text-slate-400">{iIdx + 1}</td>
                                    <td className="py-1 px-2">
                                      <div className="font-bold text-slate-900 leading-tight">{it.productName || prod?.name || 'مادة'}</div>
                                      <div className="text-[9px] text-slate-400 font-mono">{it.sku || prod?.sku || '—'}</div>
                                    </td>
                                    <td className="py-1 px-1 text-center font-bold font-mono text-amber-900">{formattedQty}</td>
                                    <td className="py-1 px-1 text-center font-mono text-slate-700">{formatIQD(unitCost)}</td>
                                    <td className="py-1 px-1 text-center font-bold font-mono text-emerald-700">{formatIQD(itemTotal)} د.ع</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))
                    )}
                  </div>
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
