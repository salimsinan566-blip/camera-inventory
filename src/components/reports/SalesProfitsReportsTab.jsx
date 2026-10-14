import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSales } from '../../hooks/useSales';
import { useProducts } from '../../hooks/useProducts';
import { useExpenses } from '../../hooks/useExpenses';
import PrintableReportDocument from './PrintableReportDocument';

function formatIQD(num) {
  if (num === undefined || num === null) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(val) {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d?.getTime()) ? null : d;
    } catch (e) {
      return null;
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toIsoDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10);
  }
  const d = toDateSafe(val);
  if (!d) return '';
  try {
    return d.toISOString().slice(0, 10);
  } catch (e) {
    return '';
  }
}

function getLastDayOfMonth(yearMonth) {
  if (!yearMonth) return '';
  const parts = yearMonth.split('-').map(Number);
  if (parts.length < 2 || !parts[0] || !parts[1]) return '';
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

export default function SalesProfitsReportsTab({
  storeSettings = {},
  userName = 'المحاسب المسؤول',
  onBackToDepartments = null,
  setReportMeta = null,
}) {
  const { sales = [], loading: salesLoading } = useSales();
  const { products = [], loading: productsLoading } = useProducts();
  const { expenses = [], loading: expensesLoading } = useExpenses();

  // Period Filter: 'today' | 'month' | 'custom'
  const [period, setPeriod] = useState('month');
  const [customSubMode, setCustomSubMode] = useState('months'); // 'months' | 'days'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customMonthFrom, setCustomMonthFrom] = useState('');
  const [customMonthTo, setCustomMonthTo] = useState('');
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [monthSelectionType, setMonthSelectionType] = useState('single'); // 'single' | 'range'

  // Active Modal: null | 'sales' | 'cost' | 'expenses' | 'profits'
  const [activeModal, setActiveModal] = useState(null);

  // Expanded Invoices in Sales Modal
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);

  // Sub-tabs inside Modals
  const [costModalTab, setCostModalTab] = useState('products'); // 'products' | 'invoices'
  const [profitsModalTab, setProfitsModalTab] = useState('invoices'); // 'invoices' | 'products'

  // Search queries inside Modals
  const [salesSearch, setSalesSearch] = useState('');
  const [salesTypeFilter, setSalesTypeFilter] = useState('all'); // 'all' | 'cash' | 'credit'

  const [costSearch, setCostSearch] = useState('');
  const [expensesSearch, setExpensesSearch] = useState('');
  const [expensesCategoryFilter, setExpensesCategoryFilter] = useState('all');
  const [profitsSearch, setProfitsSearch] = useState('');

  // Print Document state
  const [printDocumentProps, setPrintDocumentProps] = useState(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const lastMonthStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, []);

  // Compute effective date bounds for custom range (days or months)
  const effectiveCustomFrom = useMemo(() => {
    if (customSubMode === 'months') {
      if (!customMonthFrom) return '';
      if (customMonthTo && customMonthFrom > customMonthTo) {
        return `${customMonthTo}-01`;
      }
      return `${customMonthFrom}-01`;
    }
    if (customFrom && customTo && customFrom > customTo) {
      return customTo;
    }
    return customFrom;
  }, [customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  const effectiveCustomTo = useMemo(() => {
    if (customSubMode === 'months') {
      if (!customMonthTo) return customMonthFrom ? getLastDayOfMonth(customMonthFrom) : '';
      if (customMonthFrom && customMonthFrom > customMonthTo) {
        return getLastDayOfMonth(customMonthFrom);
      }
      return getLastDayOfMonth(customMonthTo);
    }
    if (customFrom && customTo && customFrom > customTo) {
      return customFrom;
    }
    return customTo;
  }, [customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  // Products lookup map for wholesale (cost) prices
  const productsMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
    });
    return map;
  }, [products]);

  // 1. Filter Sales by Selected Period
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const date = toDateSafe(s.createdAt);
      if (!date) return true;
      const dateStr = date.toISOString().slice(0, 10);
      const monthStr = date.toISOString().slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (effectiveCustomFrom && dateStr < effectiveCustomFrom) return false;
        if (effectiveCustomTo && dateStr > effectiveCustomTo) return false;
        return true;
      }
      return true;
    });
  }, [sales, period, effectiveCustomFrom, effectiveCustomTo, todayStr, currentMonthStr]);

  // 2. Filter Expenses by Selected Period
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dateStr = toIsoDateStr(e.date || e.createdAt);
      const monthStr = dateStr.slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'custom') {
        if (effectiveCustomFrom && dateStr < effectiveCustomFrom) return false;
        if (effectiveCustomTo && dateStr > effectiveCustomTo) return false;
        return true;
      }
      return true;
    });
  }, [expenses, period, effectiveCustomFrom, effectiveCustomTo, todayStr, currentMonthStr]);

  // 3. Detailed Invoices & Cost Calculations
  const analyzedSales = useMemo(() => {
    return filteredSales.map((sale) => {
      const date = toDateSafe(sale.createdAt);
      let saleTotalCost = 0;
      let totalItemsCount = 0;

      const itemsWithCost = (sale.items || []).map((item) => {
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const unitCost = Number(item.wholesalePrice) || Number(prodLookup?.wholesalePrice) || 0;
        const qty = Number(item.quantity) || 0;
        const lineTotal = Number(item.lineTotal || (qty * Number(item.unitPrice || item.price || 0)) || 0);
        const lineCost = qty * unitCost;
        const lineProfit = lineTotal - lineCost;

        saleTotalCost += lineCost;
        totalItemsCount += qty;

        return {
          ...item,
          unitCost,
          lineCost,
          lineTotal,
          lineProfit,
        };
      });

      const totalRevenue = Number(sale.total || 0);
      const grossProfit = totalRevenue - saleTotalCost;
      const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
      const paidAmount = Number(sale.paidAmount !== undefined ? sale.paidAmount : (sale.invoiceType === 'credit' ? 0 : totalRevenue));
      const remainingAmount = Number(sale.remainingAmount !== undefined ? sale.remainingAmount : (sale.invoiceType === 'credit' ? totalRevenue : 0));

      return {
        ...sale,
        dateObj: date,
        dateFormatted: date ? date.toLocaleDateString('ar-IQ') : '—',
        timeFormatted: date ? date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '',
        totalRevenue,
        totalCost: saleTotalCost,
        grossProfit,
        profitMargin,
        paidAmount,
        remainingAmount,
        totalItemsCount,
        itemsWithCost,
      };
    });
  }, [filteredSales, productsMap]);

  // 4. Aggregated Products Cost Breakdown
  const aggregatedProductsCost = useMemo(() => {
    const map = new Map();

    analyzedSales.forEach((sale) => {
      sale.itemsWithCost.forEach((item) => {
        const key = item.productId || item.sku || item.name;
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const unitCost = item.unitCost || 0;
        const qty = Number(item.quantity) || 0;
        const lineRevenue = item.lineTotal || 0;
        const lineCost = item.lineCost || 0;
        const lineProfit = item.lineProfit || 0;

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name: item.name || 'بدون اسم',
            sku: item.sku || '—',
            category: item.cameraType || prodLookup?.cameraType || 'عام',
            unitCost,
            totalQty: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            salesCount: 0,
          });
        }

        const entry = map.get(key);
        entry.totalQty += qty;
        entry.totalRevenue += lineRevenue;
        entry.totalCost += lineCost;
        entry.totalProfit += lineProfit;
        entry.salesCount += 1;
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [analyzedSales, productsMap]);

  // 5. High-level Totals for the 4 Cards
  const totalSalesRevenue = useMemo(() => {
    return analyzedSales.reduce((sum, s) => sum + s.totalRevenue, 0);
  }, [analyzedSales]);

  const totalSalesCost = useMemo(() => {
    return analyzedSales.reduce((sum, s) => sum + s.totalCost, 0);
  }, [analyzedSales]);

  const totalSoldUnits = useMemo(() => {
    return analyzedSales.reduce((sum, s) => sum + s.totalItemsCount, 0);
  }, [analyzedSales]);

  const totalExpensesAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  const grossProfit = totalSalesRevenue - totalSalesCost;
  const netProfit = grossProfit - totalExpensesAmount;

  const costPercentage = totalSalesRevenue > 0 ? ((totalSalesCost / totalSalesRevenue) * 100).toFixed(1) : '0.0';
  const grossMargin = totalSalesRevenue > 0 ? ((grossProfit / totalSalesRevenue) * 100).toFixed(1) : '0.0';
  const netMargin = totalSalesRevenue > 0 ? ((netProfit / totalSalesRevenue) * 100).toFixed(1) : '0.0';

  // Period label for headers & print
  const periodLabel = useMemo(() => {
    if (period === 'today') return 'اليوم';
    if (period === 'month') return 'هذا الشهر';
    if (period === 'custom') {
      if (customSubMode === 'months') {
        if (customMonthFrom && customMonthTo) {
          const [y1, m1] = customMonthFrom.split('-');
          const [y2, m2] = customMonthTo.split('-');
          const n1 = parseInt(m1, 10);
          const n2 = parseInt(m2, 10);
          if (customMonthFrom === customMonthTo) {
            return `شهر ${n1} / ${y1}`;
          }
          const minM = Math.min(n1, n2);
          const maxM = Math.max(n1, n2);
          return y1 === y2
            ? `أشهر (${minM} - ${maxM}) / ${y1}`
            : `من (${n1}/${y1}) إلى (${n2}/${y2})`;
        }
        if (customMonthFrom) {
          const [y, m] = customMonthFrom.split('-');
          return `شهر ${parseInt(m, 10)} / ${y}`;
        }
        if (customMonthTo) {
          const [y, m] = customMonthTo.split('-');
          return `حتى شهر ${parseInt(m, 10)} / ${y}`;
        }
        return 'أشهر مخصصة';
      }
      if (customFrom && customTo) {
        return customFrom === customTo ? customFrom : `${customFrom} ↔ ${customTo}`;
      }
      if (customFrom) return `من ${customFrom}`;
      if (customTo) return `حتى ${customTo}`;
      return 'فترة مخصصة';
    }
    return 'هذا الشهر';
  }, [period, customSubMode, customMonthFrom, customMonthTo, customFrom, customTo]);

  // Categories list for Expenses Modal
  const expenseCategories = useMemo(() => {
    const set = new Set();
    filteredExpenses.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [filteredExpenses]);

  // 6. Expenses Breakdown by Category (توضيح وتوزيع المصاريف)
  const expensesByCategory = useMemo(() => {
    const map = new Map();
    filteredExpenses.forEach((e) => {
      const cat = e.category || 'عام';
      const amt = Number(e.amount) || 0;
      if (!map.has(cat)) {
        map.set(cat, { category: cat, totalAmount: 0, count: 0 });
      }
      const entry = map.get(cat);
      entry.totalAmount += amt;
      entry.count += 1;
    });
    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        percentage: totalExpensesAmount > 0 ? Math.round((entry.totalAmount / totalExpensesAmount) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredExpenses, totalExpensesAmount]);

  // Modal 1 Filtered Sales
  const modalFilteredSales = useMemo(() => {
    return analyzedSales.filter((s) => {
      if (salesTypeFilter !== 'all') {
        const type = s.invoiceType || 'cash';
        if (type !== salesTypeFilter) return false;
      }
      if (salesSearch) {
        const q = salesSearch.toLowerCase().trim();
        const numMatch = String(s.invoiceNumber || '').includes(q);
        const nameMatch = (s.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (s.customerPhone || '').includes(q);
        const itemMatch = (s.items || []).some((it) => (it.name || '').toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q));
        if (!numMatch && !nameMatch && !phoneMatch && !itemMatch) return false;
      }
      return true;
    });
  }, [analyzedSales, salesSearch, salesTypeFilter]);

  // Modal 2 Filtered Costs (by products or per invoice line)
  const modalFilteredProductsCost = useMemo(() => {
    return aggregatedProductsCost.filter((p) => {
      if (costSearch) {
        const q = costSearch.toLowerCase().trim();
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku.toLowerCase().includes(q);
        const catMatch = (p.category || '').toLowerCase().includes(q);
        if (!nameMatch && !skuMatch && !catMatch) return false;
      }
      return true;
    });
  }, [aggregatedProductsCost, costSearch]);

  const modalFilteredCostInvoices = useMemo(() => {
    return analyzedSales.filter((s) => {
      if (costSearch) {
        const q = costSearch.toLowerCase().trim();
        const numMatch = String(s.invoiceNumber || '').includes(q);
        const nameMatch = (s.customerName || '').toLowerCase().includes(q);
        const itemMatch = (s.itemsWithCost || []).some((it) => (it.name || '').toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q));
        if (!numMatch && !nameMatch && !itemMatch) return false;
      }
      return true;
    });
  }, [analyzedSales, costSearch]);

  // Modal 3 Filtered Expenses
  const modalFilteredExpenses = useMemo(() => {
    return filteredExpenses.filter((e) => {
      if (expensesCategoryFilter !== 'all') {
        if (e.category !== expensesCategoryFilter) return false;
      }
      if (expensesSearch) {
        const q = expensesSearch.toLowerCase().trim();
        const titleMatch = (e.title || '').toLowerCase().includes(q);
        const catMatch = (e.category || '').toLowerCase().includes(q);
        const notesMatch = (e.notes || '').toLowerCase().includes(q);
        const buyerMatch = (e.buyerName || '').toLowerCase().includes(q);
        if (!titleMatch && !catMatch && !notesMatch && !buyerMatch) return false;
      }
      return true;
    });
  }, [filteredExpenses, expensesSearch, expensesCategoryFilter]);

  // Modal 4 Filtered Profits
  const modalFilteredProfitsInvoices = useMemo(() => {
    return analyzedSales.filter((s) => {
      if (profitsSearch) {
        const q = profitsSearch.toLowerCase().trim();
        const numMatch = String(s.invoiceNumber || '').includes(q);
        const nameMatch = (s.customerName || '').toLowerCase().includes(q);
        if (!numMatch && !nameMatch) return false;
      }
      return true;
    }).sort((a, b) => b.grossProfit - a.grossProfit);
  }, [analyzedSales, profitsSearch]);

  const modalFilteredProfitsProducts = useMemo(() => {
    return aggregatedProductsCost.filter((p) => {
      if (profitsSearch) {
        const q = profitsSearch.toLowerCase().trim();
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku.toLowerCase().includes(q);
        if (!nameMatch && !skuMatch) return false;
      }
      return true;
    }).sort((a, b) => b.totalProfit - a.totalProfit);
  }, [aggregatedProductsCost, profitsSearch]);

  // Handle Printing for Specific Modals
  const handlePrintReport = (reportType) => {
    if (reportType === 'sales') {
      setPrintDocumentProps({
        title: 'تقرير فواتير المبيعات ولمن بيعت',
        subtitle: `كشف حركة المبيعات التفصيلي - ${periodLabel}`,
        reportCode: `REP-SAL-01-${Date.now().toString().slice(-6)}`,
        filterDescription: `المبيعات خلال: ${periodLabel} | ${includeInvoicesInPrint ? 'مرفق صفحات الفواتير' : 'ملخص مالي فقط'}`,
        kpis: [
          { label: 'إجمالي المبيعات', value: totalSalesRevenue, currency: 'د.ع', highlight: true },
          { label: 'عدد الفواتير', value: analyzedSales.length },
          { label: 'إجمالي القطع المباعة', value: totalSoldUnits },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
          { header: 'التاريخ', key: 'dateFormatted', isMono: true },
          { header: 'اسم الزبون / العميل', key: 'customerName', isBold: true },
          { header: 'طريقة الدفع', key: 'invoiceType', render: (v) => v === 'credit' ? 'آجل' : 'نقدي' },
          { header: 'عدد المواد', key: 'totalItemsCount', isMono: true, align: 'center' },
          { header: 'قيمة الفاتورة', key: 'totalRevenue', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'المسدد', key: 'paidAmount', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'المتبقي', key: 'remainingAmount', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
        ],
        data: modalFilteredSales,
        detailedInvoices: includeInvoicesInPrint ? modalFilteredSales : [],
        totals: {
          invoiceNumber: 'الإجمالي العام',
          totalRevenue: `${formatIQD(totalSalesRevenue)} د.ع`,
          paidAmount: `${formatIQD(modalFilteredSales.reduce((s, x) => s + x.paidAmount, 0))} د.ع`,
          remainingAmount: `${formatIQD(modalFilteredSales.reduce((s, x) => s + x.remainingAmount, 0))} د.ع`,
        },
      });
    } else if (reportType === 'cost') {
      setPrintDocumentProps({
        title: 'تقرير رأس مال وتكلفة القطع المباعة',
        subtitle: `كشف تكلفة المبيعات وسعر الجملة - ${periodLabel}`,
        reportCode: `REP-CST-01-${Date.now().toString().slice(-6)}`,
        filterDescription: `تكلفة القطع المباعة خلال: ${periodLabel}`,
        kpis: [
          { label: 'إجمالي رأس المال المباع', value: totalSalesCost, currency: 'د.ع', highlight: true },
          { label: 'نسبة التكلفة من البيع', value: `${costPercentage}%` },
          { label: 'عدد القطع المباعة', value: totalSoldUnits },
        ],
        columns: [
          { header: 'اسم المادة', key: 'name', isBold: true },
          { header: 'الباركود / SKU', key: 'sku', isMono: true },
          { header: 'التصنيف', key: 'category' },
          { header: 'الكمية المباعة', key: 'totalQty', isMono: true, align: 'center' },
          { header: 'تكلفة الوحدة', key: 'unitCost', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'إجمالي رأس المال المباع', key: 'totalCost', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'إجمالي المبيعات', key: 'totalRevenue', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'مجمل الربح', key: 'totalProfit', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
        ],
        data: modalFilteredProductsCost,
        totals: {
          name: 'المجموع الإجمالي',
          totalQty: modalFilteredProductsCost.reduce((s, x) => s + x.totalQty, 0),
          totalCost: `${formatIQD(totalSalesCost)} د.ع`,
          totalRevenue: `${formatIQD(totalSalesRevenue)} د.ع`,
          totalProfit: `${formatIQD(grossProfit)} د.ع`,
        },
      });
    } else if (reportType === 'expenses') {
      setPrintDocumentProps({
        title: 'تقرير المصاريف التشغيلية والمنصرفات',
        subtitle: `كشف القيود والمصاريف - ${periodLabel}`,
        reportCode: `REP-EXP-01-${Date.now().toString().slice(-6)}`,
        filterDescription: `المصاريف المسجلة خلال: ${periodLabel}`,
        kpis: [
          { label: 'إجمالي المصاريف', value: totalExpensesAmount, currency: 'د.ع', highlight: true },
          { label: 'عدد القيود', value: filteredExpenses.length },
        ],
        columns: [
          { header: 'التاريخ', key: 'date', isMono: true, render: (v) => toIsoDateStr(v) || '—' },
          { header: 'عنوان وبند المصروف', key: 'title', isBold: true },
          { header: 'التصنيف', key: 'category' },
          { header: 'المبلغ', key: 'amount', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'المسؤول / المشتري', key: 'buyerName' },
          { header: 'ملاحظات', key: 'notes' },
        ],
        data: modalFilteredExpenses,
        totals: {
          title: 'إجمالي المصاريف',
          amount: `${formatIQD(totalExpensesAmount)} د.ع`,
        },
      });
    } else if (reportType === 'profits') {
      setPrintDocumentProps({
        title: 'تقرير الأرباح والتحليل المالي النهائي',
        subtitle: `كشف الأرباح ومقارنة الإيرادات والتكاليف - ${periodLabel}`,
        reportCode: `REP-PRF-01-${Date.now().toString().slice(-6)}`,
        filterDescription: `الأرباح خلال: ${periodLabel} | ${includeInvoicesInPrint ? 'مرفق صفحات الفواتير' : 'ملخص مالي فقط'}`,
        kpis: [
          { label: 'إجمالي المبيعات', value: totalSalesRevenue, currency: 'د.ع' },
          { label: 'رأس مال القطع المباعة', value: totalSalesCost, currency: 'د.ع' },
          { label: 'إجمالي المصاريف', value: totalExpensesAmount, currency: 'د.ع' },
          { label: 'صافي الربح الفعلي', value: netProfit, currency: 'د.ع', highlight: true },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
          { header: 'التاريخ', key: 'dateFormatted', isMono: true },
          { header: 'اسم الزبون / العميل', key: 'customerName', isBold: true },
          { header: 'إجمالي البيع', key: 'totalRevenue', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'تكلفة المواد (رأس المال)', key: 'totalCost', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'الربح المحقق', key: 'grossProfit', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
          { header: 'نسبة الربح', key: 'profitMargin', isMono: true, align: 'center', render: (v) => `${v}%` },
        ],
        data: modalFilteredProfitsInvoices,
        detailedInvoices: includeInvoicesInPrint ? modalFilteredProfitsInvoices : [],
        totals: {
          invoiceNumber: 'المجموع الإجمالي',
          totalRevenue: `${formatIQD(totalSalesRevenue)} د.ع`,
          totalCost: `${formatIQD(totalSalesCost)} د.ع`,
          grossProfit: `${formatIQD(grossProfit)} د.ع`,
        },
      });
    }
  };

  // Handle Comprehensive Full Report Print (A4)
  const handlePrintFullReport = useCallback(() => {
    setPrintDocumentProps({
      title: 'تقرير الأرباح',
      subtitle: `كشف الحسابات والحركات المالية الشامل - ${periodLabel}`,
      reportCode: `REP-SAL-FIN-${Date.now().toString().slice(-6)}`,
      filterDescription: `الفترة المالية: ${periodLabel}`,
      kpis: [
        { label: 'إجمالي المبيعات', value: totalSalesRevenue, currency: 'د.ع', highlight: true },
        { label: 'رأس مال القطع المباعة', value: totalSalesCost, currency: 'د.ع' },
        { label: 'المصاريف التشغيلية', value: totalExpensesAmount, currency: 'د.ع' },
        { label: 'صافي الربح الفعلي', value: netProfit, currency: 'د.ع', highlight: true },
        { label: 'نسبة هامش الربح', value: `${netMargin}%` },
        { label: 'عدد الفواتير', value: analyzedSales.length },
      ],
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNumber', isMono: true, isBold: true },
        { header: 'التاريخ', key: 'dateFormatted', isMono: true },
        { header: 'اسم الزبون / العميل', key: 'customerName', isBold: true },
        { header: 'طريقة الدفع', key: 'invoiceType', render: (v) => v === 'credit' ? 'آجل' : 'نقدي' },
        { header: 'قيمة الفاتورة', key: 'totalRevenue', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
        { header: 'تكلفة المواد', key: 'totalCost', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
        { header: 'مجمل الربح', key: 'grossProfit', isMono: true, isBold: true, render: (v) => `${formatIQD(v)} د.ع` },
        { header: 'المسدد', key: 'paidAmount', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
        { header: 'المتبقي', key: 'remainingAmount', isMono: true, render: (v) => `${formatIQD(v)} د.ع` },
      ],
      data: analyzedSales,
      totals: {
        invoiceNumber: 'المجموع الإجمالي',
        totalRevenue: `${formatIQD(totalSalesRevenue)} د.ع`,
        totalCost: `${formatIQD(totalSalesCost)} د.ع`,
        grossProfit: `${formatIQD(grossProfit)} د.ع`,
        paidAmount: `${formatIQD(analyzedSales.reduce((s, x) => s + x.paidAmount, 0))} د.ع`,
        remainingAmount: `${formatIQD(analyzedSales.reduce((s, x) => s + x.remainingAmount, 0))} د.ع`,
      },
      detailedInvoices: analyzedSales,
      expensesBreakdown: expensesByCategory,
      detailedExpenses: filteredExpenses,
    });
  }, [
    periodLabel,
    totalSalesRevenue,
    totalSalesCost,
    totalExpensesAmount,
    netProfit,
    netMargin,
    analyzedSales,
    grossProfit,
    expensesByCategory,
    filteredExpenses,
  ]);

  // Sync print action with TopNav
  useEffect(() => {
    if (!setReportMeta) return;
    setReportMeta({
      title: 'تقرير الأرباح',
      code: 'SEC-SAL-01',
      onPrint: handlePrintFullReport,
    });
  }, [setReportMeta, handlePrintFullReport]);

  // Handlers for Custom Date/Month Popover
  const handleToggleCustomPopover = () => {
    if (!showCalendarPopover) {
      if (!customMonthFrom) {
        const ym = new Date().toISOString().slice(0, 7);
        setCustomMonthFrom(ym);
        setCustomMonthTo(ym);
        setCalendarYear(new Date().getFullYear());
      }
      if (!customFrom) {
        setCustomFrom(todayStr);
        setCustomTo(todayStr);
      }
    }
    setShowCalendarPopover((prev) => !prev);
  };

  const handleMonthNumberClick = (num) => {
    const ym = `${calendarYear}-${String(num).padStart(2, '0')}`;
    if (monthSelectionType === 'single') {
      setCustomMonthFrom(ym);
      setCustomMonthTo(ym);
    } else {
      // Range mode
      if (!customMonthFrom || (customMonthFrom && customMonthTo && customMonthFrom !== customMonthTo)) {
        setCustomMonthFrom(ym);
        setCustomMonthTo(ym);
      } else {
        if (ym < customMonthFrom) {
          setCustomMonthTo(customMonthFrom);
          setCustomMonthFrom(ym);
        } else {
          setCustomMonthTo(ym);
        }
      }
    }
  };

  return (
    <div className="w-full space-y-4 text-slate-800" dir="rtl">
      {/* 1. Header & Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* العنوان */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-lg md:text-xl font-black text-slate-900">
              تقرير الأرباح
            </h1>
          </div>

          {/* الأزرار الثلاثة المحددة: اليوم | هذا الشهر | مخصص */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setPeriod('today');
                setShowCalendarPopover(false);
              }}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === 'today'
                  ? 'bg-white text-slate-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod('month');
                setShowCalendarPopover(false);
              }}
              className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                period === 'month'
                  ? 'bg-white text-slate-900 shadow-2xs font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              هذا الشهر
            </button>

            {/* زر مخصص مع القائمة المنبثقة ملتصقة به مباشرة */}
            <div className="relative">
              <button
                type="button"
                onClick={handleToggleCustomPopover}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  period === 'custom'
                    ? 'bg-white text-indigo-900 shadow-2xs border border-indigo-200 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📅</span>
                <span>مخصص</span>
                {period === 'custom' && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded-full font-mono font-bold">
                    {periodLabel}
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCalendarPopover ? 'rotate-180 text-indigo-600' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* النافذة المنبثقة الملتصقة بالزر مباشرة */}
              {showCalendarPopover && (
                <>
                  {/* خلفية للإغلاق عند النقر خارج القائمة */}
                  <div
                    className="fixed inset-0 z-40 bg-black/10 sm:bg-transparent"
                    onClick={() => setShowCalendarPopover(false)}
                  />

                  {/* بطاقة القائمة المنبثقة */}
                  <div
                    className="fixed sm:absolute top-20 sm:top-full start-2 sm:start-auto sm:end-0 mt-0 sm:mt-2 w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 p-3.5 text-right font-sans"
                    dir="rtl"
                  >
                    {/* التبويب الداخلي: أشهر vs أيام */}
                    <div className="flex bg-slate-100 p-0.5 rounded-xl mb-3 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setCustomSubMode('months')}
                        className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                          customSubMode === 'months'
                            ? 'bg-white text-indigo-900 shadow-2xs font-black'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📅 بالأشهر
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomSubMode('days')}
                        className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                          customSubMode === 'days'
                            ? 'bg-white text-indigo-900 shadow-2xs font-black'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📆 بالأيام
                      </button>
                    </div>

                    {/* تبويب الأشهر */}
                    {customSubMode === 'months' ? (
                      <div>
                        {/* شريط تبديل السنة */}
                        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl mb-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              const newY = calendarYear - 1;
                              setCalendarYear(newY);
                              if (customMonthFrom) {
                                const m = customMonthFrom.split('-')[1];
                                setCustomMonthFrom(`${newY}-${m}`);
                              }
                              if (customMonthTo) {
                                const m = customMonthTo.split('-')[1];
                                setCustomMonthTo(`${newY}-${m}`);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-lg text-slate-700 font-bold transition-colors cursor-pointer text-xs"
                            title="السنة السابقة"
                          >
                            ◀
                          </button>
                          <span className="font-mono font-black text-slate-900 text-sm">
                            {calendarYear}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const newY = calendarYear + 1;
                              setCalendarYear(newY);
                              if (customMonthFrom) {
                                const m = customMonthFrom.split('-')[1];
                                setCustomMonthFrom(`${newY}-${m}`);
                              }
                              if (customMonthTo) {
                                const m = customMonthTo.split('-')[1];
                                setCustomMonthTo(`${newY}-${m}`);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-lg text-slate-700 font-bold transition-colors cursor-pointer text-xs"
                            title="السنة التالية"
                          >
                            ▶
                          </button>
                        </div>

                        {/* نوع الاختيار: شهر واحد أم عدة أشهر */}
                        <div className="flex items-center gap-1 mb-2 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              setMonthSelectionType('single');
                              if (customMonthFrom) setCustomMonthTo(customMonthFrom);
                            }}
                            className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
                              monthSelectionType === 'single'
                                ? 'bg-white text-indigo-900 shadow-2xs font-black'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            شهر واحد
                          </button>
                          <button
                            type="button"
                            onClick={() => setMonthSelectionType('range')}
                            className={`flex-1 py-1 rounded-md transition-all cursor-pointer text-center ${
                              monthSelectionType === 'range'
                                ? 'bg-white text-indigo-900 shadow-2xs font-black'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            فترة عدة أشهر
                          </button>
                        </div>

                        {/* اختصارات سريعة */}
                        <div className="flex flex-wrap gap-1 mb-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const ym = d.toISOString().slice(0, 7);
                              setCalendarYear(d.getFullYear());
                              setMonthSelectionType('single');
                              setCustomMonthFrom(ym);
                              setCustomMonthTo(ym);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            الشهر الحالي
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setMonth(d.getMonth() - 1);
                              const ym = d.toISOString().slice(0, 7);
                              setCalendarYear(d.getFullYear());
                              setMonthSelectionType('single');
                              setCustomMonthFrom(ym);
                              setCustomMonthTo(ym);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            الشهر السابق
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const y = calendarYear;
                              setMonthSelectionType('range');
                              setCustomMonthFrom(`${y}-01`);
                              setCustomMonthTo(`${y}-03`);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                          >
                            أشهر (1 - 3)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const y = calendarYear;
                              setMonthSelectionType('range');
                              setCustomMonthFrom(`${y}-01`);
                              setCustomMonthTo(`${y}-06`);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                          >
                            أشهر (1 - 6)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const y = calendarYear;
                              setMonthSelectionType('range');
                              setCustomMonthFrom(`${y}-01`);
                              setCustomMonthTo(`${y}-12`);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors cursor-pointer"
                          >
                            كامل السنة
                          </button>
                        </div>

                        {/* شبكة الأرقام فقط (1 إلى 12) - بدون أسماء للأشهر إطلاقاً */}
                        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                            const ym = `${calendarYear}-${String(num).padStart(2, '0')}`;
                            const isFrom = customMonthFrom === ym;
                            const isTo = customMonthTo === ym;
                            const isExactSingle = isFrom && isTo;
                            const [minYm, maxYm] =
                              customMonthFrom && customMonthTo && customMonthFrom > customMonthTo
                                ? [customMonthTo, customMonthFrom]
                                : [customMonthFrom, customMonthTo];
                            const inRange = minYm && maxYm && ym >= minYm && ym <= maxYm;

                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => handleMonthNumberClick(num)}
                                className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer font-mono font-black ${
                                  isExactSingle
                                    ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400'
                                    : isFrom || isTo
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : inRange
                                    ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                <span className="text-[10px] font-sans font-medium text-slate-400 block -mb-0.5">
                                  شهر
                                </span>
                                <span className="text-base">{num}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* محتوى اختيار الأيام */
                      <div className="space-y-2.5 mb-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomFrom(todayStr);
                              setCustomTo(todayStr);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            اليوم
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() - 1);
                              const yest = d.toISOString().slice(0, 10);
                              setCustomFrom(yest);
                              setCustomTo(yest);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            أمس
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const end = d.toISOString().slice(0, 10);
                              d.setDate(d.getDate() - 7);
                              const start = d.toISOString().slice(0, 10);
                              setCustomFrom(start);
                              setCustomTo(end);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            آخر 7 أيام
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const end = d.toISOString().slice(0, 10);
                              d.setDate(d.getDate() - 30);
                              const start = d.toISOString().slice(0, 10);
                              setCustomFrom(start);
                              setCustomTo(end);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            آخر 30 يوماً
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                            <input
                              type="date"
                              value={customFrom}
                              onChange={(e) => setCustomFrom(e.target.value)}
                              className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                            <input
                              type="date"
                              value={customTo}
                              onChange={(e) => setCustomTo(e.target.value)}
                              className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ملخص الفترة المحددة */}
                    <div className="bg-slate-100 px-3 py-1.5 rounded-xl mb-3 text-xs flex items-center justify-between text-slate-700 font-bold">
                      <span className="text-[11px] text-slate-500">المحدد:</span>
                      <span className="font-mono text-indigo-950 font-black text-[11px] truncate max-w-[200px]">
                        {customSubMode === 'months' ? (
                          customMonthFrom === customMonthTo ? (
                            `شهر ${parseInt(customMonthFrom?.split('-')[1] || '1', 10)} / ${calendarYear}`
                          ) : (
                            `أشهر (${parseInt(customMonthFrom?.split('-')[1] || '1', 10)} - ${parseInt(customMonthTo?.split('-')[1] || '12', 10)}) / ${calendarYear}`
                          )
                        ) : (
                          customFrom && customTo ? `${customFrom} ↔ ${customTo}` : 'يرجى تحديد التاريخ'
                        )}
                      </span>
                    </div>

                    {/* أزرار الإجراءات: تطبيق وإلغاء */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setShowCalendarPopover(false)}
                        className="flex-1 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (customSubMode === 'months') {
                            if (!customMonthFrom) {
                              const ym = `${calendarYear}-01`;
                              setCustomMonthFrom(ym);
                              setCustomMonthTo(ym);
                            } else if (!customMonthTo) {
                              setCustomMonthTo(customMonthFrom);
                            }
                          } else {
                            if (!customFrom) setCustomFrom(todayStr);
                            if (!customTo) setCustomTo(todayStr);
                          }
                          setPeriod('custom');
                          setShowCalendarPopover(false);
                        }}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer text-center"
                      >
                        تطبيق الفلتر
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* زر طباعة التقرير الشامل */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrintFullReport}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>طباعة التقرير الشامل (A4)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. THE 4 MAIN INTERACTIVE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: المبيعات (Sales) */}
        <div
          onClick={() => setActiveModal('sales')}
          className="group relative bg-white hover:bg-sky-50/40 rounded-2xl border-2 border-sky-200 hover:border-sky-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-800 border border-sky-300 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
              {analyzedSales.length} فاتورة
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">إجمالي المبيعات</h2>
            <div className="text-xl sm:text-2xl font-black text-sky-950 font-mono tracking-tight">
              {formatIQD(totalSalesRevenue)} <span className="text-xs font-bold font-sans text-sky-700">د.ع</span>
            </div>
          </div>
        </div>

        {/* CARD 2: رأس مال المبيعات (تكلفة القطع) (Sales Cost) */}
        <div
          onClick={() => setActiveModal('cost')}
          className="group relative bg-white hover:bg-amber-50/40 rounded-2xl border-2 border-amber-200 hover:border-amber-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {costPercentage}% من البيع
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">رأس مال المبيعات (تكلفة القطع)</h2>
            <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono tracking-tight">
              {formatIQD(totalSalesCost)} <span className="text-xs font-bold font-sans text-amber-700">د.ع</span>
            </div>
          </div>
        </div>

        {/* CARD 3: المصاريف التشغيلية (Expenses) */}
        <div
          onClick={() => setActiveModal('expenses')}
          className="group relative bg-white hover:bg-rose-50/40 rounded-2xl border-2 border-rose-200 hover:border-rose-500 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors shadow-2xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="font-mono text-[11px] font-black text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              {filteredExpenses.length} قيد
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">المصاريف التشغيلية</h2>
            <div className="text-xl sm:text-2xl font-black text-rose-950 font-mono tracking-tight">
              {formatIQD(totalExpensesAmount)} <span className="text-xs font-bold font-sans text-rose-700">د.ع</span>
            </div>
          </div>
        </div>

        {/* CARD 4: الأرباح الصافية (Profits) */}
        <div
          onClick={() => setActiveModal('profits')}
          className={`group relative bg-white rounded-2xl border-2 p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 select-none active:scale-[0.99] ${
            netProfit >= 0
              ? 'hover:bg-emerald-50/40 border-emerald-300 hover:border-emerald-600'
              : 'hover:bg-red-50/40 border-red-300 hover:border-red-600'
          }`}
        >
          <div className="flex items-start justify-between">
            <div
              className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors shadow-2xs ${
                netProfit >= 0
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 group-hover:bg-emerald-600 group-hover:text-white'
                  : 'bg-red-100 text-red-800 border-red-300 group-hover:bg-red-600 group-hover:text-white'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span
              className={`font-mono text-[11px] font-black px-2 py-0.5 rounded-full border ${
                netProfit >= 0
                  ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                  : 'text-red-800 bg-red-50 border-red-200'
              }`}
            >
              هامش: {netMargin}%
            </span>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 mb-1">صافي الأرباح الفعلية</h2>
            <div
              className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                netProfit >= 0 ? 'text-emerald-950' : 'text-red-950'
              }`}
            >
              {formatIQD(netProfit)} <span className="text-xs font-bold font-sans text-slate-600">د.ع</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. MODAL 1: تفاصيل المبيعات (SALES MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'sales' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-sky-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-800 text-sky-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل فواتير المبيعات ولمن بيعت</h2>
                  <p className="text-xs text-sky-200 font-medium">
                    كشف حركات البيع الصادرة وقائمة الزبائن خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReport('sales')}
                  className="px-3 py-1.5 bg-sky-800 hover:bg-sky-700 text-white text-xs font-bold rounded-lg border border-sky-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-sky-800 hover:bg-sky-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Controls / Search */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة، اسم العميل، الهاتف، أو المادة..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {salesSearch && (
                  <button
                    type="button"
                    onClick={() => setSalesSearch('')}
                    className="text-slate-400 hover:text-slate-600 font-bold px-1"
                  >
                    مسح
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">نوع الدفع:</span>
                <select
                  value={salesTypeFilter}
                  onChange={(e) => setSalesTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                >
                  <option value="all">كافة الفواتير</option>
                  <option value="cash">نقدي فقط</option>
                  <option value="credit">آجل فقط</option>
                </select>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                    <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                    <th className="py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="py-2.5 px-3 font-bold">لمن بيعت (اسم العميل)</th>
                    <th className="py-2.5 px-3 font-bold text-center">نوع الفاتورة</th>
                    <th className="py-2.5 px-3 font-bold text-center">عدد المواد</th>
                    <th className="py-2.5 px-3 font-bold text-left">قيمة الفاتورة</th>
                    <th className="py-2.5 px-3 font-bold text-left">المسدد</th>
                    <th className="py-2.5 px-3 font-bold text-left">المتبقي</th>
                    <th className="py-2.5 px-3 font-bold text-center">تفاصيل المواد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد فواتير مبيعات مطابقة لمعايير البحث في هذه الفترة.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredSales.map((s, idx) => {
                      const isExpanded = expandedInvoiceId === s.id;
                      return (
                        <React.Fragment key={s.id || idx}>
                          <tr className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-sky-900">
                              #{s.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {s.dateFormatted} <span className="text-[10px] text-slate-400">{s.timeFormatted}</span>
                            </td>
                            <td className="py-2.5 px-3 font-black text-slate-900 text-sm">
                              {s.customerName || 'عميل نقدي 👤'}
                              {s.customerPhone && (
                                <span className="block text-[10px] font-mono font-normal text-slate-500" dir="ltr">
                                  {s.customerPhone}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {s.invoiceType === 'credit' ? (
                                <span className="bg-amber-50 border border-amber-300 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                  آجل ⏳
                                </span>
                              ) : (
                                <span className="bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                  نقدي 💵
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {s.totalItemsCount}
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-900">
                              {formatIQD(s.totalRevenue)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                              {formatIQD(s.paidAmount)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-black text-rose-700">
                              {formatIQD(s.remainingAmount)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedInvoiceId(isExpanded ? null : s.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                  isExpanded
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200'
                                }`}
                              >
                                <span>{isExpanded ? 'إخفاء المواد' : 'عرض المواد'}</span>
                                <span className="font-mono">{isExpanded ? '▲' : '▼'}</span>
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Items Drawer */}
                          {isExpanded && (
                            <tr className="bg-sky-50/50">
                              <td colSpan={10} className="p-3 border-y border-sky-200">
                                <div className="bg-white rounded-xl border border-sky-200 p-3 shadow-2xs">
                                  <h4 className="text-xs font-black text-sky-950 mb-2 flex items-center gap-1.5">
                                    <span>📦 المواد المباعة في الفاتورة #{s.invoiceNumber}:</span>
                                  </h4>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse text-xs">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                          <th className="py-1.5 px-2">اسم المادة</th>
                                          <th className="py-1.5 px-2">الباركود / SKU</th>
                                          <th className="py-1.5 px-2 text-center">الكمية</th>
                                          <th className="py-1.5 px-2 text-left">سعر البيع</th>
                                          <th className="py-1.5 px-2 text-left">الإجمالي</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {(s.itemsWithCost || []).map((item, iIdx) => (
                                          <tr key={iIdx} className="hover:bg-slate-50">
                                            <td className="py-1.5 px-2 font-bold text-slate-900">{item.name}</td>
                                            <td className="py-1.5 px-2 font-mono text-slate-500">{item.sku || '—'}</td>
                                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-800">{item.quantity}</td>
                                            <td className="py-1.5 px-2 text-left font-mono">{formatIQD(item.unitPrice || item.price)} د.ع</td>
                                            <td className="py-1.5 px-2 text-left font-mono font-bold text-sky-900">{formatIQD(item.lineTotal)} د.ع</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
                {modalFilteredSales.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                      <td colSpan={5} className="py-3 px-3 text-right">
                        الإجمالي ({modalFilteredSales.length} فاتورة)
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        {modalFilteredSales.reduce((s, x) => s + x.totalItemsCount, 0)}
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-sky-900">
                        {formatIQD(modalFilteredSales.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-emerald-700">
                        {formatIQD(modalFilteredSales.reduce((s, x) => s + x.paidAmount, 0))} د.ع
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-rose-700">
                        {formatIQD(modalFilteredSales.reduce((s, x) => s + x.remainingAmount, 0))} د.ع
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>عدد الفواتير: {modalFilteredSales.length}</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL 2: تفاصيل رأس المال وتكلفة القطع (COST MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'cost' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-amber-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-800 text-amber-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل رأس مال المبيعات (تكلفة القطع المباعة)</h2>
                  <p className="text-xs text-amber-200 font-medium">
                    تحليل أسعار الشراء والجملة للبضائع المباعة خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReport('cost')}
                  className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-xs font-bold rounded-lg border border-amber-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-amber-800 hover:bg-amber-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Subtabs & Search */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCostModalTab('products')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                    costModalTab === 'products'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  📊 تجميع حسب المواد والمنتجات
                </button>
                <button
                  type="button"
                  onClick={() => setCostModalTab('invoices')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                    costModalTab === 'invoices'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  🧾 كشف تفصيلي حسب الفواتير والزبائن
                </button>
              </div>

              <div className="flex-1 max-w-xs">
                <input
                  type="text"
                  value={costSearch}
                  onChange={(e) => setCostSearch(e.target.value)}
                  placeholder="ابحث عن مادة، كود، أو زبون..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {costModalTab === 'products' ? (
                /* Tab 1: Products Summary */
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                      <th className="py-2.5 px-3 font-bold">اسم المادة / المنتج</th>
                      <th className="py-2.5 px-3 font-bold">الباركود / SKU</th>
                      <th className="py-2.5 px-3 font-bold">التصنيف</th>
                      <th className="py-2.5 px-3 font-bold text-center">الكمية المباعة</th>
                      <th className="py-2.5 px-3 font-bold text-left">تكلفة الوحدة (الجملة)</th>
                      <th className="py-2.5 px-3 font-bold text-left">إجمالي رأس المال المباع</th>
                      <th className="py-2.5 px-3 font-bold text-left">إجمالي قيمة البيع</th>
                      <th className="py-2.5 px-3 font-bold text-left">مجمل الربح المحقق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalFilteredProductsCost.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                          لا توجد مواد مباعة مطابقة في هذه الفترة.
                        </td>
                      </tr>
                    ) : (
                      modalFilteredProductsCost.map((p, idx) => (
                        <tr key={p.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                            {p.name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {p.sku || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">
                            {p.category}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-amber-900">
                            {p.totalQty}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-700">
                            {formatIQD(p.unitCost)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black text-amber-900">
                            {formatIQD(p.totalCost)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                            {formatIQD(p.totalRevenue)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700">
                            {formatIQD(p.totalProfit)} د.ع
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {modalFilteredProductsCost.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                        <td colSpan={4} className="py-3 px-3 text-right">
                          المجموع الإجمالي ({modalFilteredProductsCost.length} مادة)
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {modalFilteredProductsCost.reduce((s, x) => s + x.totalQty, 0)}
                        </td>
                        <td></td>
                        <td className="py-3 px-3 text-left font-mono text-amber-900">
                          {formatIQD(modalFilteredProductsCost.reduce((s, x) => s + x.totalCost, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-slate-900">
                          {formatIQD(modalFilteredProductsCost.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-emerald-700">
                          {formatIQD(modalFilteredProductsCost.reduce((s, x) => s + x.totalProfit, 0))} د.ع
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                /* Tab 2: Per Invoice Breakdown */
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                      <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                      <th className="py-2.5 px-3 font-bold">التاريخ</th>
                      <th className="py-2.5 px-3 font-bold">لمن بيعت (الزبون)</th>
                      <th className="py-2.5 px-3 font-bold text-center">عدد الأصناف</th>
                      <th className="py-2.5 px-3 font-bold text-left">قيمة البيع</th>
                      <th className="py-2.5 px-3 font-bold text-left">رأس مال الفاتورة (التكلفة)</th>
                      <th className="py-2.5 px-3 font-bold text-left">مجمل الربح</th>
                      <th className="py-2.5 px-3 font-bold text-center">نسبة التكلفة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalFilteredCostInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                          لا توجد سجلات مطابقة في هذه الفترة.
                        </td>
                      </tr>
                    ) : (
                      modalFilteredCostInvoices.map((s, idx) => {
                        const invCostPct = s.totalRevenue > 0 ? Math.round((s.totalCost / s.totalRevenue) * 100) : 0;
                        return (
                          <tr key={s.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-amber-900">
                              #{s.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {s.dateFormatted}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {s.customerName || 'عميل نقدي 👤'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {s.totalItemsCount}
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                              {formatIQD(s.totalRevenue)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-black text-amber-900">
                              {formatIQD(s.totalCost)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700">
                              {formatIQD(s.grossProfit)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                              {invCostPct}%
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {modalFilteredCostInvoices.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                        <td colSpan={5} className="py-3 px-3 text-right">
                          المجموع الإجمالي ({modalFilteredCostInvoices.length} فاتورة)
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-slate-900">
                          {formatIQD(modalFilteredCostInvoices.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-amber-900">
                          {formatIQD(modalFilteredCostInvoices.reduce((s, x) => s + x.totalCost, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-emerald-700">
                          {formatIQD(modalFilteredCostInvoices.reduce((s, x) => s + x.grossProfit, 0))} د.ع
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>إجمالي رأس المال المباع: {formatIQD(totalSalesCost)} د.ع</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MODAL 3: تفاصيل المصاريف (EXPENSES MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'expenses' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-800 text-rose-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">تفاصيل وسجل المصاريف التشغيلية</h2>
                  <p className="text-xs text-rose-200 font-medium">
                    كشف المصاريف والنفقات المسجلة خلال ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReport('expenses')}
                  className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white text-xs font-bold rounded-lg border border-rose-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-rose-800 hover:bg-rose-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Filters */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={expensesSearch}
                  onChange={(e) => setExpensesSearch(e.target.value)}
                  placeholder="ابحث بالبند، الملاحظات، أو اسم المسؤول..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                {expensesSearch && (
                  <button
                    type="button"
                    onClick={() => setExpensesSearch('')}
                    className="text-slate-400 hover:text-slate-600 font-bold px-1"
                  >
                    مسح
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">التصنيف:</span>
                <select
                  value={expensesCategoryFilter}
                  onChange={(e) => setExpensesCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-700"
                >
                  <option value="all">كافة التصنيفات</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                    <th className="py-2.5 px-3 font-bold">التاريخ</th>
                    <th className="py-2.5 px-3 font-bold">عنوان وبند المصروف</th>
                    <th className="py-2.5 px-3 font-bold text-center">التصنيف</th>
                    <th className="py-2.5 px-3 font-bold text-left">المبلغ</th>
                    <th className="py-2.5 px-3 font-bold">المسؤول / المشتري</th>
                    <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalFilteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد مصاريف مسجلة في هذه الفترة مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredExpenses.map((e, idx) => (
                      <tr key={e.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {toIsoDateStr(e.date || e.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                          {e.title}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-rose-50 border border-rose-200 text-rose-900 font-bold px-2 py-0.5 rounded text-[10px]">
                            {e.category || 'عام'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-rose-700 text-xs sm:text-sm">
                          {formatIQD(e.amount)} د.ع
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {e.buyerName || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {e.notes || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {modalFilteredExpenses.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                      <td colSpan={4} className="py-3 px-3 text-right">
                        إجمالي المصاريف ({modalFilteredExpenses.length} قيد)
                      </td>
                      <td className="py-3 px-3 text-left font-mono text-rose-700 text-sm">
                        {formatIQD(modalFilteredExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0))} د.ع
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>إجمالي المصاريف: {formatIQD(totalExpensesAmount)} د.ع</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL 4: تفاصيل وتحليل الأرباح (PROFITS MODAL) */}
      {/* ======================================================== */}
      {activeModal === 'profits' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-emerald-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-800 text-emerald-200 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black">التحليل المالي وتفاصيل الأرباح ومصادرها</h2>
                  <p className="text-xs text-emerald-300 font-medium">
                    كشف صافي الأرباح، مجمل الربح التجاري، وربحية الفواتير والمواد ({periodLabel})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintReport('profits')}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg border border-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>طباعة (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Financial Equation Bar inside Modal */}
            <div className="p-4 bg-emerald-50 border-b border-emerald-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block mb-0.5">إجمالي المبيعات</span>
                  <span className="text-base font-black font-mono text-sky-900">{formatIQD(totalSalesRevenue)} د.ع</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block mb-0.5">رأس مال القطع المباعة</span>
                  <span className="text-base font-black font-mono text-amber-900">{formatIQD(totalSalesCost)} د.ع</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block mb-0.5">مجمل الربح التجاري</span>
                  <span className="text-base font-black font-mono text-indigo-900">{formatIQD(grossProfit)} د.ع</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 block mb-0.5">المصاريف التشغيلية</span>
                  <span className="text-base font-black font-mono text-rose-700">{formatIQD(totalExpensesAmount)} د.ع</span>
                </div>
              </div>
            </div>

            {/* Modal Subtabs & Search */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfitsModalTab('invoices')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                    profitsModalTab === 'invoices'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  🧾 أرباح الفواتير (كشف الفواتير)
                </button>
                <button
                  type="button"
                  onClick={() => setProfitsModalTab('products')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                    profitsModalTab === 'products'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  🏆 المواد الأكثر تحقيقاً للأرباح
                </button>
              </div>

              <div className="flex-1 max-w-xs">
                <input
                  type="text"
                  value={profitsSearch}
                  onChange={(e) => setProfitsSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة، اسم العميل، أو المادة..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {profitsModalTab === 'invoices' ? (
                /* Tab 1: Invoices Profitability */
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                      <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                      <th className="py-2.5 px-3 font-bold">التاريخ</th>
                      <th className="py-2.5 px-3 font-bold">لمن بيعت (الزبون)</th>
                      <th className="py-2.5 px-3 font-bold text-left">قيمة البيع</th>
                      <th className="py-2.5 px-3 font-bold text-left">رأس مال الفاتورة</th>
                      <th className="py-2.5 px-3 font-bold text-left">الربح المحقق</th>
                      <th className="py-2.5 px-3 font-bold text-center">هامش الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalFilteredProfitsInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                          لا توجد فواتير مطابقة لمعايير البحث في هذه الفترة.
                        </td>
                      </tr>
                    ) : (
                      modalFilteredProfitsInvoices.map((s, idx) => (
                        <tr key={s.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-sky-900">
                            #{s.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {s.dateFormatted}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {s.customerName || 'عميل نقدي 👤'}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                            {formatIQD(s.totalRevenue)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-900">
                            {formatIQD(s.totalCost)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700 text-xs sm:text-sm">
                            {formatIQD(s.grossProfit)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="font-mono font-black text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {s.profitMargin}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {modalFilteredProfitsInvoices.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                        <td colSpan={4} className="py-3 px-3 text-right">
                          المجموع الإجمالي ({modalFilteredProfitsInvoices.length} فاتورة)
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-sky-900">
                          {formatIQD(modalFilteredProfitsInvoices.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-amber-900">
                          {formatIQD(modalFilteredProfitsInvoices.reduce((s, x) => s + x.totalCost, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-emerald-700 text-sm">
                          {formatIQD(modalFilteredProfitsInvoices.reduce((s, x) => s + x.grossProfit, 0))} د.ع
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                /* Tab 2: Top Profitable Products */
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                      <th className="py-2.5 px-3 font-bold">اسم المادة / المنتج</th>
                      <th className="py-2.5 px-3 font-bold">الباركود / SKU</th>
                      <th className="py-2.5 px-3 font-bold text-center">الكمية المباعة</th>
                      <th className="py-2.5 px-3 font-bold text-left">إجمالي المبيعات</th>
                      <th className="py-2.5 px-3 font-bold text-left">إجمالي التكلفة</th>
                      <th className="py-2.5 px-3 font-bold text-left">صافي الربح المحقق</th>
                      <th className="py-2.5 px-3 font-bold text-center">نسبة الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {modalFilteredProfitsProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                          لا توجد مواد مطابقة في هذه الفترة.
                        </td>
                      </tr>
                    ) : (
                      modalFilteredProfitsProducts.map((p, idx) => {
                        const margin = p.totalRevenue > 0 ? Math.round((p.totalProfit / p.totalRevenue) * 100) : 0;
                        return (
                          <tr key={p.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                              {p.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {p.sku || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {p.totalQty}
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                              {formatIQD(p.totalRevenue)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-900">
                              {formatIQD(p.totalCost)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700 text-xs sm:text-sm">
                              {formatIQD(p.totalProfit)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono font-black text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {margin}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {modalFilteredProfitsProducts.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                        <td colSpan={3} className="py-3 px-3 text-right">
                          المجموع الإجمالي ({modalFilteredProfitsProducts.length} صنف)
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {modalFilteredProfitsProducts.reduce((s, x) => s + x.totalQty, 0)}
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-slate-900">
                          {formatIQD(modalFilteredProfitsProducts.reduce((s, x) => s + x.totalRevenue, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-amber-900">
                          {formatIQD(modalFilteredProfitsProducts.reduce((s, x) => s + x.totalCost, 0))} د.ع
                        </td>
                        <td className="py-3 px-3 text-left font-mono text-emerald-700 text-sm">
                          {formatIQD(modalFilteredProfitsProducts.reduce((s, x) => s + x.totalProfit, 0))} د.ع
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>صافي الربح الفعلي: {formatIQD(netProfit)} د.ع</span>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* 8. PRINT DOCUMENT MODAL (A4) */}
      {/* ======================================================== */}
      {printDocumentProps && (
        <PrintableReportDocument
          {...printDocumentProps}
          storeSettings={storeSettings}
          userName={userName}
          onClose={() => setPrintDocumentProps(null)}
        />
      )}
    </div>
  );
}
