import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProducts } from '../../hooks/useProducts';
import { usePurchases } from '../../hooks/usePurchases';
import { useSales } from '../../hooks/useSales';
import { useDraftSales } from '../../hooks/useDraftSales';
import PrintableReportDocument from './PrintableReportDocument';

function formatIQD(num) {
  if (num === undefined || num === null) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function parseDateSafe(val) {
  if (!val) return new Date();
  if (typeof val?.toDate === 'function') return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  if (val?.toMillis) return new Date(val.toMillis());
  if (typeof val === 'number') return new Date(val);
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateSafe(val) {
  if (!val) return '—';
  if (typeof val === 'string' && val.length >= 10 && val.includes('-')) {
    return val.slice(0, 10);
  }
  const d = parseDateSafe(val);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * دالة مطابقة دقيقة ومضبوطة للمنتج عبر المعرف ID، كود الـ SKU، الباركود، أو الاسم المتطابق تماماً
 */
function isItemMatchingProduct(item, targetProduct) {
  if (!item || !targetProduct) return false;

  const targetId = String(targetProduct.id || '').trim();
  const targetSku = String(targetProduct.sku || '').trim().toLowerCase();
  const targetBarcode = String(targetProduct.barcode || '').trim().toLowerCase();
  const targetName = String(targetProduct.name || '').trim().toLowerCase();

  const itemId = String(item.productId || item.id || '').trim();
  const itemSku = String(item.sku || '').trim().toLowerCase();
  const itemBarcode = String(item.barcode || '').trim().toLowerCase();
  const itemName = String(item.name || item.productName || '').trim().toLowerCase();

  if (targetId && itemId && targetId === itemId) return true;
  if (targetSku && itemSku && targetSku === itemSku) return true;
  if (targetBarcode && itemBarcode && targetBarcode === itemBarcode) return true;
  if (targetName && itemName && targetName === itemName) return true;

  return false;
}

export default function InventoryReportsTab({
  storeSettings = {},
  userName = 'المحاسب المسؤول',
  onBackToDepartments = null,
  selectedReport: propSelectedReport,
  onSelectReport,
  setReportMeta,
}) {
  const { products = [], loading: productsLoading } = useProducts();
  const { purchases = [], loading: purchasesLoading } = usePurchases();
  const { sales = [], loading: salesLoading } = useSales();
  const { drafts: draftSales = [] } = useDraftSales();

  // Active Report: null (cards view) | 'stock_audit' | 'item_movement'
  const [internalSelectedReport, setInternalSelectedReport] = useState(null);
  const selectedReport = propSelectedReport !== undefined ? propSelectedReport : internalSelectedReport;
  const setSelectedReport = onSelectReport || setInternalSelectedReport;

  // --- State for Report 1: تقرير جرد المخزن ---
  const [auditViewMode, setAuditViewMode] = useState('category'); // 'category' | 'list'
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [showAuditPrintModal, setShowAuditPrintModal] = useState(false);

  // --- State for Report 2: كشف حركة مادة ---
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [movementSearchQuery, setMovementSearchQuery] = useState('');
  const [activeMovementTab, setActiveMovementTab] = useState('sales'); // 'sales' | 'purchases' | 'all'
  const [printMovementModalProps, setPrintMovementModalProps] = useState(null);

  // Product Map for Fast Lookup
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Total Pending Units Calculation for Draft Sales
  const getProductPendingBreakdown = (productId) => {
    if (!draftSales || draftSales.length === 0) return [];
    const map = new Map();
    const prod = productMap.get(productId);

    draftSales
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

  const formatTotalUnits = (productsList, qtyKey) => {
    let pieces = 0;
    let rolls = 0;
    let meters = 0;

    productsList.forEach((p) => {
      const qty = Number(p[qtyKey]) || 0;
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

    return parts.length > 0 ? parts.join(' + ') : '0';
  };

  // Formatted Total Pending Units for Top Bar
  const formattedTotalPendingUnits = useMemo(() => {
    let pieces = 0, rolls = 0, meters = 0;
    draftSales
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
  }, [draftSales, productMap]);

  // Filtered products for Audit Report
  const filteredAuditProducts = useMemo(() => {
    if (!auditSearchTerm.trim()) return products;
    const term = auditSearchTerm.toLowerCase().trim();
    return products.filter((p) =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.cameraType || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term)
    );
  }, [products, auditSearchTerm]);

  // Sorted Products for Audit Report
  const displayAuditProducts = useMemo(() => {
    return [...filteredAuditProducts].sort((a, b) => {
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
  }, [filteredAuditProducts]);

  // Overall Financial KPIs for Audit
  const auditStoreCapital = useMemo(() => {
    return displayAuditProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  }, [displayAuditProducts]);

  const auditWarehouseCapital = useMemo(() => {
    return displayAuditProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
  }, [displayAuditProducts]);

  const auditStoreUnitsText = useMemo(() => formatTotalUnits(displayAuditProducts, 'storeQty'), [displayAuditProducts]);
  const auditWarehouseUnitsText = useMemo(() => formatTotalUnits(displayAuditProducts, 'warehouseQty'), [displayAuditProducts]);

  // Grouped products by Category for Audit
  const groupedAuditProducts = useMemo(() => {
    return displayAuditProducts.reduce((acc, product) => {
      const cat = product.cameraType || 'أخرى';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {});
  }, [displayAuditProducts]);

  const sortedCategoryKeys = useMemo(() => {
    return Object.keys(groupedAuditProducts).sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
  }, [groupedAuditProducts]);

  // Total system capital overview for main cards
  const totalCapitalAll = useMemo(() => {
    return products.reduce((sum, p) => {
      const totalUnits = (Number(p.storeQty) || 0) + (Number(p.warehouseQty) || 0);
      return sum + (totalUnits * (Number(p.wholesalePrice) || 0));
    }, 0);
  }, [products]);

  // --- Movements Data for Report 2: كشف حركة مادة ---
  // 1. Matching candidate products for search selector
  const productSearchResults = useMemo(() => {
    if (!movementSearchQuery.trim()) {
      return products.slice(0, 15);
    }
    const term = movementSearchQuery.toLowerCase().trim();
    return products.filter((p) =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term) ||
      (p.cameraType || '').toLowerCase().includes(term)
    ).slice(0, 25);
  }, [products, movementSearchQuery]);

  // 2. Purchases movements for selectedProduct
  const productPurchasesMovements = useMemo(() => {
    if (!selectedProduct) return [];
    const list = [];
    purchases.forEach((p) => {
      (p.items || []).forEach((item, idx) => {
        if (isItemMatchingProduct(item, selectedProduct)) {
          const qty = Number(item.quantity) || 1;
          const unitCost = Number(item.costPrice || item.effectiveCostPrice || item.baseCostPrice || item.price || 0);
          const totalCost = qty * unitCost;
          const dateVal = p.date || p.createdAt;
          const dateStr = formatDateSafe(dateVal);
          const timestamp = parseDateSafe(dateVal).getTime();

          list.push({
            id: `pur_${p.id}_${idx}`,
            timestamp,
            date: dateStr,
            invoiceNumber: p.invoiceNumber || p.id?.slice(0, 8),
            supplierName: p.supplierName || 'مورد عام',
            supplierPhone: p.supplierPhone || '',
            quantity: qty,
            unitCost,
            totalCost,
            location: item.location === 'warehouse' ? 'المخزن' : 'المحل',
            paymentMethod: p.paymentMethod === 'debt' ? 'آجل' : 'نقدي',
            notes: p.notes || '',
          });
        }
      });
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [purchases, selectedProduct]);

  // 3. Sales movements for selectedProduct (بيش نباعت ولأي زبون)
  const productSalesMovements = useMemo(() => {
    if (!selectedProduct) return [];
    const list = [];
    sales.forEach((s) => {
      if (s.status === 'deleted' || s.status === 'draft') return;
      (s.items || []).forEach((item, idx) => {
        if (item.isService) return;
        if (isItemMatchingProduct(item, selectedProduct)) {
          const qty = Number(item.quantity) || 1;
          const unitPrice = Number(item.unitPrice || item.price || 0);
          const totalPrice = qty * unitPrice;
          const dateVal = s.confirmedAt || s.createdAt || s.date;
          const dateStr = formatDateSafe(dateVal);
          const timestamp = parseDateSafe(dateVal).getTime();
          const sourceLoc = item.source === 'warehouse' ? 'المخزن' : (item.source === 'custody' ? 'عهدة سيارة' : 'المحل');

          list.push({
            id: `sal_${s.id}_${idx}`,
            timestamp,
            date: dateStr,
            invoiceNumber: s.invoiceNumber || s.id?.slice(0, 8),
            customerName: s.customerName || s.clientName || 'عميل نقدي',
            customerPhone: s.customerPhone || '',
            quantity: qty,
            unitPrice,
            totalPrice,
            source: sourceLoc,
            paymentMethod: s.paymentMethod === 'debt' ? 'آجل' : 'نقدي',
            cashier: s.cashierEmail || 'الكاشير',
            notes: s.notes || '',
          });
        }
      });
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [sales, selectedProduct]);

  // 4. Combined Chronological Movements
  const unifiedMovements = useMemo(() => {
    if (!selectedProduct) return [];
    const combined = [
      ...productPurchasesMovements.map((pm) => ({
        ...pm,
        movementType: 'purchase',
        typeLabel: 'شراء وتوريد',
        partyName: pm.supplierName,
        price: pm.unitCost,
        total: pm.totalCost,
        locationLabel: pm.location,
      })),
      ...productSalesMovements.map((sm) => ({
        ...sm,
        movementType: 'sale',
        typeLabel: 'حركة بيع',
        partyName: sm.customerName,
        price: sm.unitPrice,
        total: sm.totalPrice,
        locationLabel: sm.source,
      })),
    ];

    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [productPurchasesMovements, productSalesMovements, selectedProduct]);

  // Item Movement Totals
  const totalPurchasedQty = useMemo(() => {
    return productPurchasesMovements.reduce((sum, p) => sum + p.quantity, 0);
  }, [productPurchasesMovements]);

  const totalPurchasedAmount = useMemo(() => {
    return productPurchasesMovements.reduce((sum, p) => sum + p.totalCost, 0);
  }, [productPurchasesMovements]);

  const totalSoldQty = useMemo(() => {
    return productSalesMovements.reduce((sum, s) => sum + s.quantity, 0);
  }, [productSalesMovements]);

  const totalSoldAmount = useMemo(() => {
    return productSalesMovements.reduce((sum, s) => sum + s.totalPrice, 0);
  }, [productSalesMovements]);

  // Prepare Print Modal for Selected Product Movements
  const handleOpenPrintMovement = () => {
    if (!selectedProduct) return;

    const currentStore = Number(selectedProduct.storeQty) || 0;
    const currentWh = Number(selectedProduct.warehouseQty) || 0;

    let movementDataRows = [];
    if (activeMovementTab === 'sales') {
      movementDataRows = productSalesMovements.map((m, idx) => ({
        index: idx + 1,
        date: m.date,
        invoiceNumber: m.invoiceNumber,
        customerName: m.customerName,
        quantity: `${m.quantity} ${selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}`,
        unitPrice: `${formatIQD(m.unitPrice)} د.ع`,
        totalPrice: `${formatIQD(m.totalPrice)} د.ع`,
        source: m.source,
        paymentMethod: m.paymentMethod,
      }));
    } else if (activeMovementTab === 'purchases') {
      movementDataRows = productPurchasesMovements.map((m, idx) => ({
        index: idx + 1,
        date: m.date,
        invoiceNumber: m.invoiceNumber,
        supplierName: m.supplierName,
        quantity: `${m.quantity} ${selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}`,
        unitCost: `${formatIQD(m.unitCost)} د.ع`,
        totalCost: `${formatIQD(m.totalCost)} د.ع`,
        location: m.location,
        paymentMethod: m.paymentMethod,
      }));
    } else {
      movementDataRows = unifiedMovements.map((m, idx) => ({
        index: idx + 1,
        movementType: m.movementType === 'purchase' ? '📥 توريد شراء' : '🛒 حركة بيع',
        date: m.date,
        invoiceNumber: m.invoiceNumber,
        partyName: m.partyName,
        quantity: `${m.quantity} ${selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}`,
        price: `${formatIQD(m.price)} د.ع`,
        total: `${formatIQD(m.total)} د.ع`,
        locationLabel: m.locationLabel,
      }));
    }

    const unitLabel = selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة';

    setPrintMovementModalProps({
      title: `كشف حركة مادة: ${selectedProduct.name}`,
      subtitle: `كود المادة: ${selectedProduct.sku || '—'} • القسم: ${selectedProduct.cameraType || 'عام'}`,
      reportCode: `REP-INV-MOV-${Date.now().toString().slice(-6)}`,
      filterDescription: `متوفر في المحل: ${currentStore} ${unitLabel} • متوفر في المخزن: ${currentWh} ${unitLabel} • إجمالي المتوفر: ${currentStore + currentWh} ${unitLabel}`,
      kpis: [
        { label: 'متوفر في المحل', value: currentStore, currency: unitLabel },
        { label: 'متوفر في المخزن', value: currentWh, currency: unitLabel },
        { label: 'إجمالي المتوفر حالياً', value: currentStore + currentWh, currency: unitLabel },
        { label: 'إجمالي المبيعات', value: totalSoldQty, currency: unitLabel },
      ],
      columns: activeMovementTab === 'sales' ? [
        { header: '#', key: 'index', align: 'center' },
        { header: 'تاريخ البيع', key: 'date', isMono: true },
        { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
        { header: 'اسم الزبون', key: 'customerName', isBold: true },
        { header: 'الكمية المباعة', key: 'quantity', isMono: true, align: 'center' },
        { header: 'سعر البيع الفعلي', key: 'unitPrice', isMono: true, isBold: true },
        { header: 'إجمالي القيمة', key: 'totalPrice', isMono: true, isBold: true },
        { header: 'المصدر', key: 'source', align: 'center' },
        { header: 'الدفع', key: 'paymentMethod', align: 'center' },
      ] : (activeMovementTab === 'purchases' ? [
        { header: '#', key: 'index', align: 'center' },
        { header: 'تاريخ الشراء', key: 'date', isMono: true },
        { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
        { header: 'اسم المورد', key: 'supplierName', isBold: true },
        { header: 'الكمية المشتراة', key: 'quantity', isMono: true, align: 'center' },
        { header: 'سعر الشراء / التكلفة', key: 'unitCost', isMono: true, isBold: true },
        { header: 'إجمالي القيمة', key: 'totalCost', isMono: true, isBold: true },
        { header: 'الموقع', key: 'location', align: 'center' },
      ] : [
        { header: '#', key: 'index', align: 'center' },
        { header: 'نوع الحركة', key: 'movementType', isBold: true, align: 'center' },
        { header: 'التاريخ', key: 'date', isMono: true },
        { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
        { header: 'الطرف (الزبون / المورد)', key: 'partyName', isBold: true },
        { header: 'الكمية', key: 'quantity', isMono: true, align: 'center' },
        { header: 'السعر الفعلي للوحدة', key: 'price', isMono: true, isBold: true },
        { header: 'إجمالي الحركة', key: 'total', isMono: true, isBold: true },
        { header: 'الموقع', key: 'locationLabel', align: 'center' },
      ]),
      data: movementDataRows,
      totals: {
        customerName: `إجمالي الحركات: ${movementDataRows.length}`,
        quantity: activeMovementTab === 'sales' ? `${totalSoldQty}` : `${totalPurchasedQty}`,
        totalPrice: activeMovementTab === 'sales' ? `${formatIQD(totalSoldAmount)} د.ع` : undefined,
        totalCost: activeMovementTab === 'purchases' ? `${formatIQD(totalPurchasedAmount)} د.ع` : undefined,
      },
    });
  };

  // المزامنة التلقائية لبيانات التقرير الحالي ودالة الطباعة مع شريط الرأس العلوي الموحد
  const printHandlerRef = useRef(null);
  useEffect(() => {
    if (selectedReport === 'stock_audit') {
      printHandlerRef.current = () => setShowAuditPrintModal(true);
    } else if (selectedReport === 'item_movement') {
      printHandlerRef.current = selectedProduct ? handleOpenPrintMovement : null;
    } else {
      printHandlerRef.current = null;
    }
  });

  useEffect(() => {
    if (!setReportMeta) return;
    if (!selectedReport) {
      setReportMeta(null);
      return;
    }
    const metaMap = {
      stock_audit: { 
        code: 'REP-INV-01', 
        title: 'تقرير جرد المخزون العام',
        onPrint: () => {
          if (printHandlerRef.current) printHandlerRef.current();
        }
      },
      item_movement: { 
        code: 'REP-INV-02', 
        title: selectedProduct ? `كشف حركة مادة: ${selectedProduct.name}` : 'كشف حركة مادة',
        onPrint: selectedProduct ? () => {
          if (printHandlerRef.current) printHandlerRef.current();
        } : null
      },
    };
    const meta = metaMap[selectedReport];
    if (meta) {
      setReportMeta({
        code: meta.code,
        title: meta.title,
        onPrint: meta.onPrint,
      });
    } else {
      setReportMeta(null);
    }
  }, [selectedReport, selectedProduct, setReportMeta]);

  return (
    <div className="space-y-4">
      {/* 2. المستوى الثاني: عرض الكارتين (تقرير جرد المخزن + كشف حركة مادة) */}
      {!selectedReport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
          {/* كارت 1: تقرير جرد المخزن */}
          <div
            onClick={() => setSelectedReport('stock_audit')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-INV-01
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                تقرير جرد المخزن
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black">
              <span className="text-slate-700 group-hover:text-slate-900 font-bold">
                فتح الكشف
              </span>
              <span className="text-slate-900 group-hover:translate-x-[-4px] transition-transform">
                ➔
              </span>
            </div>
          </div>

          {/* كارت 2: كشف حركة مادة */}
          <div
            onClick={() => {
              setSelectedReport('item_movement');
              setSelectedProduct(null);
              setMovementSearchQuery('');
            }}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-INV-02
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                كشف حركة مادة
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black">
              <span className="text-slate-700 group-hover:text-slate-900 font-bold">
                فتح الكشف
              </span>
              <span className="text-slate-900 group-hover:translate-x-[-4px] transition-transform">
                ➔
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. المستوى الثالث: الخيار الأول - تقرير جرد المخزن (نفس نظام إدارة المخزون المعتمد) */}
      {selectedReport === 'stock_audit' && (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs p-4 sm:p-6 space-y-5 animate-fade-in">
          {/* شريط التحكم والبحث وتبديل نمط العرض */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            {/* البحث السريع */}
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
                placeholder="بحث باسم المنتج أو SKU..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
              />
              {auditSearchTerm && (
                <button
                  onClick={() => setAuditSearchTerm('')}
                  className="absolute left-2 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* أزرار نمط العرض (مجمع بالأقسام / تسلسل المخزون) */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setAuditViewMode('category')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  auditViewMode === 'category'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📁 مجمع بالأقسام
              </button>
              <button
                type="button"
                onClick={() => setAuditViewMode('list')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  auditViewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 تسلسل المخزون
              </button>
            </div>
          </div>

          {/* بطاقات المؤشرات المالية المتطابقة (3 كروت) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* كارت 1: إجمالي المواد والأصناف ورأس المال */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-300 text-center shadow-2xs">
              <p className="text-xs font-bold text-slate-600 mb-1">إجمالي المواد والأصناف</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono leading-tight">
                {displayAuditProducts.length} <span className="text-xs font-bold text-slate-500">صنف</span>
              </p>
              <div className="mt-2 pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-800 font-mono">
                  إجمالي رأس المال: <strong>{formatIQD(auditStoreCapital + auditWarehouseCapital)}</strong> د.ع
                </span>
              </div>
              {formattedTotalPendingUnits !== '0' && (
                <span className="inline-block mt-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  ⏳ معلق: {formattedTotalPendingUnits}
                </span>
              )}
            </div>

            {/* كارت 2: مخزون ورأس مال المحل */}
            <div className="bg-sky-50/50 p-3.5 rounded-xl border border-sky-200 text-center shadow-2xs">
              <p className="text-xs font-bold text-sky-900 mb-1">🏪 مخزون ورأس مال المحل</p>
              <p className="text-lg sm:text-xl font-black text-sky-800 font-mono leading-snug">
                {auditStoreUnitsText}
              </p>
              <div className="mt-2 pt-2 border-t border-sky-200">
                <span className="text-xs font-bold text-emerald-800 font-mono">
                  رأس المال: <strong>{formatIQD(auditStoreCapital)}</strong> د.ع
                </span>
              </div>
            </div>

            {/* كارت 3: مخزون ورأس مال المخزن */}
            <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-200 text-center shadow-2xs">
              <p className="text-xs font-bold text-indigo-900 mb-1">🏢 مخزون ورأس مال المخزن</p>
              <p className="text-lg sm:text-xl font-black text-indigo-800 font-mono leading-snug">
                {auditWarehouseUnitsText}
              </p>
              <div className="mt-2 pt-2 border-t border-indigo-200">
                <span className="text-xs font-bold text-teal-800 font-mono">
                  رأس المال: <strong>{formatIQD(auditWarehouseCapital)}</strong> د.ع
                </span>
              </div>
            </div>
          </div>

          {/* الجداول: النمط 1 - مجمع بالأقسام */}
          {auditViewMode === 'category' && (
            <div className="space-y-6">
              {sortedCategoryKeys.map((category) => {
                const catProducts = groupedAuditProducts[category];
                const catStoreCapital = catProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                const catWarehouseCapital = catProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                const catStoreUnits = formatTotalUnits(catProducts, 'storeQty');
                const catWarehouseUnits = formatTotalUnits(catProducts, 'warehouseQty');

                return (
                  <div key={category} className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-slate-900">
                        قسم: {category} ({catProducts.length} صنف)
                      </h4>
                      <div className="text-xs font-bold flex flex-wrap gap-2">
                        <span className="text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-mono">
                          المحل: {catStoreUnits} | {formatIQD(catStoreCapital)} د.ع
                        </span>
                        <span className="text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-300 font-mono">
                          المخزن: {catWarehouseUnits} | {formatIQD(catWarehouseCapital)} د.ع
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                            <th className="py-2.5 px-3 text-center w-12">#</th>
                            <th className="py-2.5 px-3">اسم المنتج / SKU</th>
                            <th className="py-2.5 px-3 text-center text-sky-800">المحل (قطع / رأس مال)</th>
                            <th className="py-2.5 px-3 text-center text-indigo-800">المخزن (قطع / رأس مال)</th>
                            <th className="py-2.5 px-3 text-center">التكلفة (جملة)</th>
                            <th className="py-2.5 px-3 text-center text-emerald-800">البيع (مفرد)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {catProducts.map((product, idx) => {
                            const pendingBreakdown = getProductPendingBreakdown(product.id);
                            const storeCapitalVal = (Number(product.storeQty) || 0) * (Number(product.wholesalePrice) || 0);
                            const whCapitalVal = (Number(product.warehouseQty) || 0) * (Number(product.wholesalePrice) || 0);

                            return (
                              <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                                <td className="py-2 px-3">
                                  <div className="font-bold text-slate-900">{product.name}</div>
                                  <div className="text-[11px] text-slate-500 font-mono">{product.sku}</div>
                                  {pendingBreakdown.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1 items-center">
                                      {pendingBreakdown.map((pb, pidx) => (
                                        <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          <span>⏳ معلق لـ {pb.name}:</span>
                                          <strong className="font-mono">({pb.formattedText})</strong>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center font-mono">
                                  <span className="font-black text-sky-800 text-sm block">
                                    {Number(product.storeQty || 0).toLocaleString()}
                                  </span>
                                  <span className="text-[10px] font-bold text-emerald-700 block">
                                    {formatIQD(storeCapitalVal)} د.ع
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-center font-mono">
                                  <span className="font-black text-indigo-800 text-sm block">
                                    {Number(product.warehouseQty || 0).toLocaleString()}
                                  </span>
                                  <span className="text-[10px] font-bold text-teal-700 block">
                                    {formatIQD(whCapitalVal)} د.ع
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-center font-mono text-slate-800 font-bold">
                                  {formatIQD(product.wholesalePrice)}
                                </td>
                                <td className="py-2 px-3 text-center font-black font-mono text-emerald-800">
                                  {formatIQD(product.retailPrice)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* الجداول: النمط 2 - تسلسل المخزون العام */}
          {auditViewMode === 'list' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800">
                      <th className="py-2.5 px-3 text-center w-12">#</th>
                      <th className="py-2.5 px-3">اسم المنتج / SKU</th>
                      <th className="py-2.5 px-3">القسم</th>
                      <th className="py-2.5 px-3 text-center text-sky-800">المحل (قطع / رأس مال)</th>
                      <th className="py-2.5 px-3 text-center text-indigo-800">المخزن (قطع / رأس مال)</th>
                      <th className="py-2.5 px-3 text-center">التكلفة</th>
                      <th className="py-2.5 px-3 text-center text-emerald-800">المفرد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayAuditProducts.map((product, idx) => {
                      const pendingBreakdown = getProductPendingBreakdown(product.id);
                      const storeCapitalVal = (Number(product.storeQty) || 0) * (Number(product.wholesalePrice) || 0);
                      const whCapitalVal = (Number(product.warehouseQty) || 0) * (Number(product.wholesalePrice) || 0);

                      return (
                        <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-900">{product.name}</span>
                            <span className="text-[11px] text-slate-500 font-mono mr-1">({product.sku})</span>
                            {pendingBreakdown.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1 items-center">
                                {pendingBreakdown.map((pb, pidx) => (
                                  <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    <span>⏳ معلق لـ {pb.name}:</span>
                                    <strong className="font-mono">({pb.formattedText})</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate">{product.cameraType || '—'}</td>
                          <td className="py-2 px-3 text-center font-mono">
                            <span className="font-black text-sky-800 text-sm block">
                              {Number(product.storeQty || 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 block">
                              {formatIQD(storeCapitalVal)} د.ع
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            <span className="font-black text-indigo-800 text-sm block">
                              {Number(product.warehouseQty || 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold text-teal-700 block">
                              {formatIQD(whCapitalVal)} د.ع
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-800 font-bold">{formatIQD(product.wholesalePrice)}</td>
                          <td className="py-2 px-3 text-center font-black font-mono text-emerald-800">{formatIQD(product.retailPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* مودال الطباعة الشامل لجرد المخزون بتقنية Portal المتوافقة */}
          {showAuditPrintModal && createPortal(
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
                  body > :not(#print-inventory-reports-portal) {
                    display: none !important;
                  }
                  #print-inventory-reports-portal {
                    position: static !important;
                    display: block !important;
                    width: 100% !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    background: white !important;
                  }
                  #print-inventory-reports-portal > div {
                    width: 100% !important;
                    max-width: 100% !important;
                    box-shadow: none !important;
                    border: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                  .print-hide { display: none !important; }
                  table {
                    page-break-inside: auto !important;
                    break-inside: auto !important;
                    width: 100% !important;
                    margin-bottom: 6px !important;
                  }
                  tr {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
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
              <div id="print-inventory-reports-portal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs print:bg-white print:p-0 print:relative print:inset-auto print:block" dir="rtl">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col print:shadow-none print:w-full print:max-w-full">
                  {/* رأس المودال على الشاشة */}
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between print-hide flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      </div>
                      <div>
                        <h2 className="text-sm sm:text-base font-bold text-slate-900">تقرير المخزون المطبوع A4</h2>
                        <p className="text-xs text-slate-500 font-bold">يشمل المحل والمخزن والمعلقات بالتفصيل</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.print()}
                        className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        <span>طباعة / حفظ PDF</span>
                      </button>
                      <button
                        onClick={() => setShowAuditPrintModal(false)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>
                  </div>

                  {/* جسم التقرير المطبوع */}
                  <div className="p-6 overflow-y-auto print:overflow-visible print:p-0">
                    <div className="hidden print:block text-center mb-4 border-b-2 border-slate-900 pb-3">
                      <div className="flex justify-between items-center">
                        <div className="text-right">
                          <h1 className="text-lg font-black text-slate-900">تقرير جرد المخزون العام</h1>
                          <p className="text-slate-500 text-xs font-mono font-bold">REP-INV-01 • {storeSettings?.storeName || 'المتجر'}</p>
                        </div>
                        <p className="text-slate-700 text-xs font-bold font-mono">تاريخ التقرير: {new Date().toLocaleDateString('ar-IQ')}</p>
                      </div>
                    </div>

                    {/* الكروت الثلاثة */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 print:mb-3 print:gap-2">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-300 text-center print:border-slate-500 print:bg-white print:p-2">
                        <p className="text-xs font-bold text-slate-700 mb-1 print:text-[11px]">إجمالي المواد والأصناف</p>
                        <p className="text-xl font-black text-slate-900 font-mono print:text-base leading-tight">
                          {displayAuditProducts.length} <span className="text-xs font-bold text-slate-600">صنف</span>
                        </p>
                        <div className="mt-1.5 pt-1.5 border-t border-slate-200">
                          <span className="text-xs font-bold text-slate-800 font-mono print:text-[11px]">
                            إجمالي رأس المال: <strong>{formatIQD(auditStoreCapital + auditWarehouseCapital)}</strong> د.ع
                          </span>
                        </div>
                      </div>

                      <div className="bg-sky-50/50 p-3 rounded-xl border border-sky-200 text-center print:border-slate-500 print:bg-white print:p-2">
                        <p className="text-xs font-bold text-sky-900 mb-1 print:text-[11px]">🏪 مخزون ورأس مال المحل</p>
                        <p className="text-lg font-black text-sky-800 font-mono print:text-base leading-snug">
                          {auditStoreUnitsText}
                        </p>
                        <div className="mt-1.5 pt-1.5 border-t border-sky-200">
                          <span className="text-xs font-bold text-emerald-800 font-mono print:text-[11px]">
                            رأس المال: <strong className="font-black">{formatIQD(auditStoreCapital)}</strong> د.ع
                          </span>
                        </div>
                      </div>

                      <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-200 text-center print:border-slate-500 print:bg-white print:p-2">
                        <p className="text-xs font-bold text-indigo-900 mb-1 print:text-[11px]">🏢 مخزون ورأس مال المخزن</p>
                        <p className="text-lg font-black text-indigo-800 font-mono print:text-base leading-snug">
                          {auditWarehouseUnitsText}
                        </p>
                        <div className="mt-1.5 pt-1.5 border-t border-indigo-200">
                          <span className="text-xs font-bold text-teal-800 font-mono print:text-[11px]">
                            رأس المال: <strong className="font-black">{formatIQD(auditWarehouseCapital)}</strong> د.ع
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* جداول الطباعة حسب الوضع المختار */}
                    {auditViewMode === 'category' ? (
                      sortedCategoryKeys.map((category) => {
                        const catProducts = groupedAuditProducts[category];
                        const catStoreCapital = catProducts.reduce((sum, p) => sum + ((Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                        const catWarehouseCapital = catProducts.reduce((sum, p) => sum + ((Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0)), 0);
                        const catStoreUnits = formatTotalUnits(catProducts, 'storeQty');
                        const catWarehouseUnits = formatTotalUnits(catProducts, 'warehouseQty');

                        return (
                          <div key={category} className="mb-5 print:mb-4 category-section-wrap">
                            <div className="category-header-wrap pb-1.5 mb-2 border-b-2 border-slate-400 flex justify-between items-center flex-wrap gap-2 print:py-1">
                              <h3 className="text-sm font-extrabold text-slate-900 print:text-[13px]">
                                قسم: {category} ({catProducts.length} صنف)
                              </h3>
                              <div className="text-xs font-bold flex flex-wrap gap-2 print:text-[11px]">
                                <span className="text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-mono">
                                  المحل: {catStoreUnits} | {formatIQD(catStoreCapital)} د.ع
                                </span>
                                <span className="text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-300 font-mono">
                                  المخزن: {catWarehouseUnits} | {formatIQD(catWarehouseCapital)} د.ع
                                </span>
                              </div>
                            </div>

                            <table className="w-full text-xs text-right border-collapse table-fixed print:text-[12px]">
                              <thead>
                                <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold text-slate-900">
                                  <th style={{ width: '4%' }} className="py-2 px-1 text-center font-bold print:py-1">#</th>
                                  <th style={{ width: '38%' }} className="py-2 px-2.5 font-bold print:py-1">اسم المنتج / SKU</th>
                                  <th style={{ width: '15%' }} className="py-2 px-1.5 text-center font-bold text-sky-800 print:py-1">المحل (قطع / رأس مال)</th>
                                  <th style={{ width: '15%' }} className="py-2 px-1.5 text-center font-bold text-indigo-800 print:py-1">المخزن (قطع / رأس مال)</th>
                                  <th style={{ width: '14%' }} className="py-2 px-1.5 text-center font-bold print:py-1">التكلفة (جملة)</th>
                                  <th style={{ width: '14%' }} className="py-2 px-1.5 text-center font-bold text-emerald-800 print:py-1">البيع (مفرد)</th>
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
                                        <div className="font-bold text-slate-900 leading-snug print:text-[12px]">{product.name}</div>
                                        <div className="text-[11px] text-slate-500 font-mono leading-none mt-0.5 print:text-[9.5px]">{product.sku}</div>
                                        {pendingBreakdown.length > 0 && (
                                          <div className="mt-1 flex flex-wrap gap-1 items-center">
                                            {pendingBreakdown.map((pb, pidx) => (
                                              <span key={pidx} className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                                <span>⏳ معلق لـ {pb.name}:</span>
                                                <strong className="font-mono">({pb.formattedText})</strong>
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2 px-1.5 text-center font-mono print:py-1">
                                        <span className="font-black text-sky-800 text-sm block">
                                          {Number(product.storeQty || 0).toLocaleString()}
                                        </span>
                                        <span className="text-[10px] font-bold text-emerald-800 block print:text-[9px]">
                                          {formatIQD(storeCapitalVal)} د.ع
                                        </span>
                                      </td>
                                      <td className="py-2 px-1.5 text-center font-mono print:py-1">
                                        <span className="font-black text-indigo-800 text-sm block">
                                          {Number(product.warehouseQty || 0).toLocaleString()}
                                        </span>
                                        <span className="text-[10px] font-bold text-teal-800 block print:text-[9px]">
                                          {formatIQD(whCapitalVal)} د.ع
                                        </span>
                                      </td>
                                      <td className="py-2 px-1.5 text-center font-mono text-slate-800 font-bold print:py-1">
                                        {formatIQD(product.wholesalePrice)}
                                      </td>
                                      <td className="py-2 px-1.5 text-center font-black font-mono text-emerald-800 print:py-1">
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
                    ) : (
                      <table className="w-full text-xs text-right border-collapse table-fixed print:text-[12px]">
                        <thead>
                          <tr className="bg-slate-100 border-b-2 border-slate-300 font-bold text-slate-900">
                            <th style={{ width: '4%' }} className="py-2 px-1 text-center font-bold print:py-1">#</th>
                            <th style={{ width: '32%' }} className="py-2 px-2.5 font-bold print:py-1">اسم المنتج</th>
                            <th style={{ width: '14%' }} className="py-2 px-1 font-bold print:py-1">القسم</th>
                            <th style={{ width: '13%' }} className="py-2 px-1.5 text-center font-bold text-sky-800 print:py-1">المحل</th>
                            <th style={{ width: '13%' }} className="py-2 px-1.5 text-center font-bold text-indigo-800 print:py-1">المخزن</th>
                            <th style={{ width: '12%' }} className="py-2 px-1.5 text-center font-bold print:py-1">التكلفة</th>
                            <th style={{ width: '12%' }} className="py-2 px-1.5 text-center font-bold text-emerald-800 print:py-1">المفرد</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {displayAuditProducts.map((product, idx) => (
                            <tr key={product.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                              <td className="py-2 px-1 text-center font-mono font-bold text-slate-500 print:py-1">{idx + 1}</td>
                              <td className="py-2 px-2.5 print:py-1">
                                <span className="font-bold text-slate-900">{product.name}</span>
                                <span className="text-[10.5px] text-slate-500 font-mono mr-1">({product.sku})</span>
                              </td>
                              <td className="py-2 px-1 text-slate-600 truncate">{product.cameraType || '—'}</td>
                              <td className="py-2 px-1.5 text-center font-mono font-black text-sky-800 print:py-1">{Number(product.storeQty || 0).toLocaleString()}</td>
                              <td className="py-2 px-1.5 text-center font-mono font-black text-indigo-800 print:py-1">{Number(product.warehouseQty || 0).toLocaleString()}</td>
                              <td className="py-2 px-1.5 text-center font-mono font-bold print:py-1">{formatIQD(product.wholesalePrice)}</td>
                              <td className="py-2 px-1.5 text-center font-mono font-black text-emerald-800 print:py-1">{formatIQD(product.retailPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      )}

      {/* 4. المستوى الثالث: الخيار الثاني - كشف حركة مادة (البحث باسم المادة، كشف الشراء، كشف البيع وبيش نباعت ولأي زبون) */}
      {selectedReport === 'item_movement' && (
        <div className="space-y-4 animate-fade-in">
          {/* محرك البحث واختيار المادة */}
          <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  البحث عن المادة للتدقيق
                </h3>
                <p className="text-xs text-slate-500 font-bold">
                  ابحث باسم المادة أو كود SKU لاظهار سجل حركات البيع والشراء والزبائن
                </p>
              </div>

              {selectedProduct && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setMovementSearchQuery('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer border border-slate-300"
                  >
                    اختيار مادة أخرى
                  </button>
                </div>
              )}
            </div>

            {/* حقل البحث الفوري */}
            <div className="relative">
              <input
                type="text"
                value={movementSearchQuery}
                onChange={(e) => setMovementSearchQuery(e.target.value)}
                placeholder="اكتب اسم المادة، كود SKU، أو الباركود..."
                className="w-full bg-slate-50 border-2 border-slate-200 hover:border-slate-400 focus:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-hidden transition-colors"
              />
              {movementSearchQuery && (
                <button
                  onClick={() => setMovementSearchQuery('')}
                  className="absolute left-3 top-3 text-slate-400 hover:text-slate-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* قائمة نتائج البحث السريع إذا لم يتم اختيار مادة بعد */}
            {!selectedProduct && (
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 mb-2">
                  {movementSearchQuery ? `نتائج البحث المطابقة (${productSearchResults.length}):` : 'اختر مادة من القائمة للبدء:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1">
                  {productSearchResults.map((prod) => {
                    const totalQty = (Number(prod.storeQty) || 0) + (Number(prod.warehouseQty) || 0);
                    return (
                      <div
                        key={prod.id}
                        onClick={() => setSelectedProduct(prod)}
                        className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-800 rounded-xl transition-all cursor-pointer flex flex-col justify-between gap-2 active:scale-98"
                      >
                        <div>
                          <div className="font-black text-slate-900 text-xs leading-snug line-clamp-1">{prod.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between mt-1">
                            <span>{prod.sku || 'بدون SKU'}</span>
                            <span className="text-slate-700 font-bold">{prod.cameraType || 'عام'}</span>
                          </div>
                        </div>

                        {/* كمية المحل وكمية المخزن والإجمالي */}
                        <div className="pt-2 border-t border-slate-200 flex flex-col gap-1 text-[11px] font-bold">
                          <div className="flex items-center justify-between text-slate-700 font-mono text-[11px]">
                            <span className="text-sky-900 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                              🏪 المحل: <strong className="font-black text-slate-900">{Number(prod.storeQty || 0).toLocaleString()}</strong> {prod.sellMode === 'meter' ? 'م' : 'ق'}
                            </span>
                            <span className="text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              🏢 المخزن: <strong className="font-black text-slate-900">{Number(prod.warehouseQty || 0).toLocaleString()}</strong> {prod.sellMode === 'meter' ? 'م' : 'ق'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-600 font-mono text-[10.5px]">
                              الإجمالي: <strong className="text-slate-900">{totalQty.toLocaleString()}</strong> {prod.sellMode === 'meter' ? 'م' : 'ق'}
                            </span>
                            <span className="text-emerald-800 font-mono text-xs">
                              {formatIQD(prod.retailPrice)} د.ع
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {productSearchResults.length === 0 && (
                    <div className="col-span-full py-8 text-center text-xs font-bold text-slate-400">
                      لم يتم العثور على أي مادة مطابقة لمعايير البحث
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* تفاصيل المادة المختارة وسجل حركاتها الكامل */}
          {selectedProduct && (
            <div className="space-y-4">
              {/* شريط تعريف المادة المختارة ورصيدها وأسعارها */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px] px-2.5 py-0.5 rounded font-bold">
                      {selectedProduct.sku || 'NO-SKU'}
                    </span>
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[11px] px-2.5 py-0.5 rounded font-bold">
                      {selectedProduct.cameraType || 'القسم العام'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                    {selectedProduct.name}
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-slate-400 block text-[10px] font-bold">🏪 متوفر في المحل</span>
                    <span className="text-base font-black text-sky-400 font-mono">
                      {Number(selectedProduct.storeQty || 0).toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-slate-400 block text-[10px] font-bold">🏢 متوفر في المخزن</span>
                    <span className="text-base font-black text-indigo-400 font-mono">
                      {Number(selectedProduct.warehouseQty || 0).toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-slate-400 block text-[10px] font-bold">📦 إجمالي المحل + المخزن</span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      {((Number(selectedProduct.storeQty) || 0) + (Number(selectedProduct.warehouseQty) || 0)).toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-slate-400 block text-[10px] font-bold">سعر البيع (المفرد)</span>
                    <span className="text-sm font-black text-white font-mono">
                      {formatIQD(selectedProduct.retailPrice)} د.ع
                    </span>
                  </div>
                </div>
              </div>

              {/* شريط تأكيد رصيد القطع في المحل والمخزن */}
              <div className="bg-white rounded-xl p-3 border-2 border-slate-300 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-black">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-700 font-bold">توزيع الرصيد الحالي للمادة:</span>
                  <span className="bg-sky-50 text-sky-900 border border-sky-300 px-3 py-1 rounded-lg font-mono text-xs flex items-center gap-1.5">
                    <span>🏪 في المحل:</span>
                    <strong className="text-slate-950 text-sm">{Number(selectedProduct.storeQty || 0).toLocaleString()}</strong>
                    <span>{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                  </span>
                  <span className="bg-indigo-50 text-indigo-900 border border-indigo-300 px-3 py-1 rounded-lg font-mono text-xs flex items-center gap-1.5">
                    <span>🏢 في المخزن:</span>
                    <strong className="text-slate-950 text-sm">{Number(selectedProduct.warehouseQty || 0).toLocaleString()}</strong>
                    <span>{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                  </span>
                </div>
                <div className="bg-slate-900 text-white px-3 py-1 rounded-lg font-mono text-xs flex items-center gap-1.5 self-start sm:self-auto">
                  <span>إجمالي المتوفر:</span>
                  <strong className="text-emerald-400 text-sm">
                    {((Number(selectedProduct.storeQty) || 0) + (Number(selectedProduct.warehouseQty) || 0)).toLocaleString()}
                  </strong>
                  <span>{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                </div>
              </div>

              {/* بطاقات ملخص الحركة (إجمالي الشراء، إجمالي البيع، صافي الرصيد) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                    <span>إجمالي المشتريات</span>
                    <span className="font-mono text-emerald-800">{productPurchasesMovements.length} فاتورة</span>
                  </div>
                  <div className="text-xl font-black text-slate-900 font-mono">
                    {totalPurchasedQty.toLocaleString()} <span className="text-xs font-bold text-slate-500">{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-100 text-xs font-bold text-slate-700 font-mono">
                    التكلفة الإجمالية: {formatIQD(totalPurchasedAmount)} د.ع
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                    <span>إجمالي المبيعات</span>
                    <span className="font-mono text-sky-800">{productSalesMovements.length} حركة بيع</span>
                  </div>
                  <div className="text-xl font-black text-slate-900 font-mono">
                    {totalSoldQty.toLocaleString()} <span className="text-xs font-bold text-slate-500">{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-100 text-xs font-bold text-emerald-800 font-mono">
                    قيمة المبيعات: {formatIQD(totalSoldAmount)} د.ع
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                    <span>الرصيد الفعلي المتوفر</span>
                    <span className="text-slate-600 font-bold">المحل + المخزن</span>
                  </div>
                  <div className="text-xl font-black text-slate-900 font-mono">
                    {((Number(selectedProduct.storeQty) || 0) + (Number(selectedProduct.warehouseQty) || 0)).toLocaleString()} <span className="text-xs font-bold text-slate-500">{selectedProduct.sellMode === 'meter' ? 'متر' : 'قطعة'}</span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 font-mono">
                    <span className="text-sky-900 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      🏪 المحل: <strong>{Number(selectedProduct.storeQty || 0).toLocaleString()}</strong> {selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}
                    </span>
                    <span className="text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      🏢 المخزن: <strong>{Number(selectedProduct.warehouseQty || 0).toLocaleString()}</strong> {selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}
                    </span>
                  </div>
                </div>
              </div>

              {/* تبويبات وجداول الحركات: البيع (الزبائن والأسعار) / الشراء / الكل */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveMovementTab('sales')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMovementTab === 'sales'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🛒 حركات البيع والزبائن ({productSalesMovements.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMovementTab('purchases')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMovementTab === 'purchases'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📥 حركات الشراء والتوريد ({productPurchasesMovements.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMovementTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMovementTab === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🔄 سجل الحركات الزمني ({unifiedMovements.length})
                    </button>
                  </div>

                  <span className="text-xs font-bold text-slate-500 font-mono">
                    {activeMovementTab === 'sales' && 'يوضح: بيش نباعت ولأي زبون ورقم الفاتورة'}
                    {activeMovementTab === 'purchases' && 'يوضح: سعر وتاريخ وتفاصيل التوريد من المورد'}
                    {activeMovementTab === 'all' && 'تسلسل زمني شامل لكافة حركات الدخول والخروج'}
                  </span>
                </div>

                {/* 1. جدول حركات البيع (بيش نباعت ولأي زبون) */}
                {activeMovementTab === 'sales' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800">
                            <th className="py-2.5 px-3 text-center w-12">#</th>
                            <th className="py-2.5 px-3">تاريخ البيع</th>
                            <th className="py-2.5 px-3">رقم الفاتورة</th>
                            <th className="py-2.5 px-3">اسم الزبون</th>
                            <th className="py-2.5 px-3 text-center">الكمية المباعة</th>
                            <th className="py-2.5 px-3 text-center text-slate-900 font-black">سعر البيع الفعلي (بيش نباعت)</th>
                            <th className="py-2.5 px-3 text-center text-emerald-800">إجمالي المبلغ</th>
                            <th className="py-2.5 px-3 text-center">المصدر</th>
                            <th className="py-2.5 px-3 text-center">طريقة الدفع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {productSalesMovements.map((move, idx) => (
                            <tr key={move.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{move.date || '—'}</td>
                              <td className="py-2.5 px-3 font-mono font-black text-slate-900">#{move.invoiceNumber}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-slate-900 block">{move.customerName}</span>
                                {move.customerPhone && (
                                  <span className="text-[10px] text-slate-500 font-mono block">{move.customerPhone}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                                {move.quantity.toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-900 text-sm">
                                {formatIQD(move.unitPrice)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-800">
                                {formatIQD(move.totalPrice)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  move.source === 'المخزن'
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : (move.source === 'عهدة سيارة' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-sky-50 text-sky-800 border-sky-200')
                                }`}>
                                  {move.source === 'المخزن' ? '🏢 صُرفت من المخزن' : (move.source === 'عهدة سيارة' ? '🚚 صُرفت من سيارة فني' : '🏪 صُرفت من المحل')}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                  move.paymentMethod === 'آجل' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {move.paymentMethod}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {productSalesMovements.length === 0 && (
                            <tr>
                              <td colSpan="9" className="py-8 text-center text-xs font-bold text-slate-400">
                                لا توجد حركات بيع مسجلة لهذه المادة بعد
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. جدول حركات الشراء والتوريد */}
                {activeMovementTab === 'purchases' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800">
                            <th className="py-2.5 px-3 text-center w-12">#</th>
                            <th className="py-2.5 px-3">تاريخ الشراء</th>
                            <th className="py-2.5 px-3">رقم الفاتورة</th>
                            <th className="py-2.5 px-3">اسم المورد</th>
                            <th className="py-2.5 px-3 text-center">الكمية المشتراة</th>
                            <th className="py-2.5 px-3 text-center text-slate-900 font-black">سعر الشراء / التكلفة</th>
                            <th className="py-2.5 px-3 text-center text-emerald-800">إجمالي الشراء</th>
                            <th className="py-2.5 px-3 text-center">موقع الإيداع</th>
                            <th className="py-2.5 px-3 text-center">طريقة الدفع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {productPurchasesMovements.map((move, idx) => (
                            <tr key={move.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{move.date || '—'}</td>
                              <td className="py-2.5 px-3 font-mono font-black text-slate-900">#{move.invoiceNumber}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{move.supplierName}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                                {move.quantity.toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-amber-900 text-sm">
                                {formatIQD(move.unitCost)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-800">
                                {formatIQD(move.totalCost)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  move.location === 'المخزن'
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : 'bg-sky-50 text-sky-800 border-sky-200'
                                }`}>
                                  {move.location === 'المخزن' ? '🏢 أُودعت بالمخزن' : '🏪 أُودعت بالمحل'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                  move.paymentMethod === 'آجل' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {move.paymentMethod}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {productPurchasesMovements.length === 0 && (
                            <tr>
                              <td colSpan="9" className="py-8 text-center text-xs font-bold text-slate-400">
                                لا توجد فواتير شراء وتوريد مسجلة لهذه المادة
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. سجل الحركات الزمني الشامل */}
                {activeMovementTab === 'all' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-800">
                            <th className="py-2.5 px-3 text-center w-12">#</th>
                            <th className="py-2.5 px-3 text-center">نوع الحركة</th>
                            <th className="py-2.5 px-3">التاريخ</th>
                            <th className="py-2.5 px-3">رقم الفاتورة</th>
                            <th className="py-2.5 px-3">الطرف المقابل (الزبون / المورد)</th>
                            <th className="py-2.5 px-3 text-center">الكمية</th>
                            <th className="py-2.5 px-3 text-center">السعر الفعلي للوحدة</th>
                            <th className="py-2.5 px-3 text-center">إجمالي القيمة</th>
                            <th className="py-2.5 px-3 text-center">الموقع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unifiedMovements.map((move, idx) => (
                            <tr key={move.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  move.movementType === 'purchase'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-sky-50 text-sky-800 border-sky-300'
                                }`}>
                                  {move.movementType === 'purchase' ? '📥 توريد شراء' : '🛒 حركة بيع'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{move.date || '—'}</td>
                              <td className="py-2.5 px-3 font-mono font-black text-slate-900">#{move.invoiceNumber}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{move.partyName}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                                {move.quantity.toLocaleString()} {selectedProduct.sellMode === 'meter' ? 'م' : 'ق'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">
                                {formatIQD(move.price)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-800">
                                {formatIQD(move.total)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                  {move.locationLabel}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {unifiedMovements.length === 0 && (
                            <tr>
                              <td colSpan="9" className="py-8 text-center text-xs font-bold text-slate-400">
                                لا توجد أي حركات شراء أو بيع مسجلة لهذه المادة
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* مودال الطباعة A4 لكشف حركة المادة باستخدام PrintableReportDocument المعتمد */}
      {printMovementModalProps && (
        <PrintableReportDocument
          title={printMovementModalProps.title}
          subtitle={printMovementModalProps.subtitle}
          reportCode={printMovementModalProps.reportCode}
          filterDescription={printMovementModalProps.filterDescription}
          kpis={printMovementModalProps.kpis}
          columns={printMovementModalProps.columns}
          data={printMovementModalProps.data}
          totals={printMovementModalProps.totals}
          storeSettings={storeSettings}
          userName={userName}
          onClose={() => setPrintMovementModalProps(null)}
        />
      )}
    </div>
  );
}
