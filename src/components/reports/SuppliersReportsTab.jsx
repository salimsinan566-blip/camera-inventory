import React, { useState, useMemo, useRef, useEffect } from 'react';
import { usePurchases } from '../../hooks/usePurchases';
import { findSupplierDebtRecord, reconcileSupplierInvoices } from '../../utils/supplierDebtReconciliation';
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

export default function SuppliersReportsTab({ 
  storeSettings = {}, 
  userName = 'المحاسب المسؤول',
  onBackToDepartments = null,
  selectedReport: propSelectedReport,
  onSelectReport,
  setReportMeta,
}) {
  const {
    purchases = [],
    supplierDebts = [],
    suppliers = [],
  } = usePurchases();

  // Active Report: null (shows the 4 cards) | 'all_purchases' | 'paid_only' | 'debts_only' | 'suppliers_directory'
  const [internalSelectedReport, setInternalSelectedReport] = useState(null);
  const selectedReport = propSelectedReport !== undefined ? propSelectedReport : internalSelectedReport;
  const setSelectedReport = onSelectReport || setInternalSelectedReport;

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState('all');

  // On-screen Item Details Expansion State
  const [expandedInvoices, setExpandedInvoices] = useState(() => new Set());
  const [showAllItems, setShowAllItems] = useState(false);

  // Modal State for PDF Printable View
  const [printDocumentProps, setPrintDocumentProps] = useState(null);

  // Quick Date Helpers
  const handleSetDatePreset = (preset) => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      const s = toStr(today);
      setDateFrom(s);
      setDateTo(s);
    } else if (preset === 'week') {
      const past = new Date(today);
      past.setDate(today.getDate() - 7);
      setDateFrom(toStr(past));
      setDateTo(toStr(today));
    } else if (preset === 'month') {
      const past = new Date(today);
      past.setDate(today.getDate() - 30);
      setDateFrom(toStr(past));
      setDateTo(toStr(today));
    } else if (preset === 'year') {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      setDateFrom(toStr(startOfYear));
      setDateTo(toStr(today));
    }
  };

  // Reconciled Invoices calculation
  const reconciledPurchasesList = useMemo(() => {
    const grouped = {};
    purchases.forEach((p) => {
      const supKey = (p.supplierName || 'غير محدد').trim();
      if (!grouped[supKey]) grouped[supKey] = [];
      grouped[supKey].push(p);
    });

    const result = [];
    Object.entries(grouped).forEach(([supName, invs]) => {
      const debtDoc = findSupplierDebtRecord(supName, supplierDebts);
      const reconciled = reconcileSupplierInvoices(invs, debtDoc);
      result.push(...reconciled);
    });

    return result.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [purchases, supplierDebts]);

  // Unique suppliers list for filter dropdown
  const allSupplierNames = useMemo(() => {
    const set = new Set();
    purchases.forEach((p) => {
      if (p.supplierName) set.add(p.supplierName.trim());
    });
    supplierDebts.forEach((d) => {
      if (d.supplierName) set.add(d.supplierName.trim());
    });
    suppliers.forEach((s) => {
      if (s.name) set.add(s.name.trim());
    });
    return Array.from(set).sort();
  }, [purchases, supplierDebts, suppliers]);

  // Combined Suppliers Directory Data
  const suppliersDirectoryData = useMemo(() => {
    const map = new Map();

    suppliers.forEach((s) => {
      const key = (s.name || '').trim();
      if (!key) return;
      map.set(key, {
        id: s.id,
        name: key,
        phone: s.phone || '',
        phone2: s.phone2 || '',
        address: s.address || '',
        notes: s.notes || '',
        totalPurchases: 0,
        remainingDebt: 0,
        invoicesCount: 0,
      });
    });

    supplierDebts.forEach((d) => {
      const key = (d.supplierName || '').trim();
      if (!key) return;
      const existing = map.get(key) || {
        id: d.id,
        name: key,
        phone: d.phone || '',
        phone2: '',
        address: '',
        notes: '',
        totalPurchases: 0,
        remainingDebt: 0,
        invoicesCount: 0,
      };
      existing.phone = existing.phone || d.phone || '';
      existing.totalPurchases = Math.max(existing.totalPurchases, Number(d.totalPurchases || 0));
      existing.remainingDebt = Math.max(0, Number(d.remainingDebt || 0));
      map.set(key, existing);
    });

    purchases.forEach((p) => {
      const key = (p.supplierName || '').trim();
      if (!key) return;
      const existing = map.get(key) || {
        id: `purch_${key}`,
        name: key,
        phone: '',
        phone2: '',
        address: '',
        notes: '',
        totalPurchases: 0,
        remainingDebt: 0,
        invoicesCount: 0,
      };
      existing.invoicesCount += 1;
      map.set(key, existing);
    });

    let list = Array.from(map.values());

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((s) => {
        return (
          s.name.toLowerCase().includes(q) ||
          s.phone.includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.notes.toLowerCase().includes(q)
        );
      });
    }

    if (directoryStatusFilter === 'debts') {
      list = list.filter((s) => s.remainingDebt > 0);
    } else if (directoryStatusFilter === 'settled') {
      list = list.filter((s) => s.remainingDebt <= 0);
    }

    return list.sort((a, b) => b.remainingDebt - a.remainingDebt || a.name.localeCompare(b.name));
  }, [suppliers, supplierDebts, purchases, searchTerm, directoryStatusFilter]);

  // Common filter for Invoices
  const filterInvoices = (type) => {
    return reconciledPurchasesList.filter((inv) => {
      if (type === 'paid_only') {
        const isPaid = inv.isFullyPaid || Number(inv.computedRemaining || 0) <= 0;
        if (!isPaid) return false;
      } else if (type === 'debts_only') {
        const hasDebt = Number(inv.computedRemaining || 0) > 0;
        if (!hasDebt) return false;
      }

      if (selectedSupplier !== 'all') {
        if ((inv.supplierName || '').trim() !== selectedSupplier.trim()) return false;
      }

      const invDate = toIsoDateStr(inv.date) || toIsoDateStr(inv.createdAt) || '';
      if (dateFrom && invDate && invDate < dateFrom) return false;
      if (dateTo && invDate && invDate > dateTo) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const supMatch = (inv.supplierName || '').toLowerCase().includes(q);
        const numMatch = String(inv.invoiceNumber || '').toLowerCase().includes(q);
        const notesMatch = (inv.notes || '').toLowerCase().includes(q);
        if (!supMatch && !numMatch && !notesMatch) return false;
      }

      return true;
    });
  };

  const allPurchasesData = useMemo(() => filterInvoices('all_purchases'), [reconciledPurchasesList, selectedSupplier, dateFrom, dateTo, searchTerm]);
  const paidOnlyData = useMemo(() => filterInvoices('paid_only'), [reconciledPurchasesList, selectedSupplier, dateFrom, dateTo, searchTerm]);
  const debtsOnlyData = useMemo(() => filterInvoices('debts_only'), [reconciledPurchasesList, selectedSupplier, dateFrom, dateTo, searchTerm]);

  // Overall statistics
  const statsOverview = useMemo(() => {
    const totalPurchasesAmount = purchases.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
    const paidCount = reconciledPurchasesList.filter((p) => Number(p.computedRemaining || 0) <= 0).length;
    const paidAmount = reconciledPurchasesList.filter((p) => Number(p.computedRemaining || 0) <= 0).reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
    const debtsCount = reconciledPurchasesList.filter((p) => Number(p.computedRemaining || 0) > 0).length;
    const totalRemainingDebt = supplierDebts.reduce((s, d) => s + (Number(d.remainingDebt) || 0), 0);

    return {
      totalPurchasesAmount,
      totalPurchasesCount: purchases.length,
      paidCount,
      paidAmount,
      debtsCount,
      totalRemainingDebt,
      suppliersCount: allSupplierNames.length,
    };
  }, [purchases, reconciledPurchasesList, supplierDebts, allSupplierNames]);

  const currentFilterLabel = useMemo(() => {
    const parts = [];
    if (selectedSupplier !== 'all') {
      parts.push(`المورد: ${selectedSupplier}`);
    } else {
      parts.push('كافة الموردين');
    }

    if (dateFrom && dateTo) {
      parts.push(`من ${dateFrom} إلى ${dateTo}`);
    } else if (dateFrom) {
      parts.push(`من ${dateFrom}`);
    } else if (dateTo) {
      parts.push(`إلى ${dateTo}`);
    }

    return parts.join(' | ');
  }, [selectedSupplier, dateFrom, dateTo]);

  // Toggle single invoice expansion on screen
  const toggleInvoiceExpanded = (id) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle all invoices expansion on screen
  const handleToggleAllItems = () => {
    if (showAllItems) {
      setExpandedInvoices(new Set());
      setShowAllItems(false);
    } else {
      const activeList = selectedReport === 'all_purchases' ? allPurchasesData : selectedReport === 'paid_only' ? paidOnlyData : debtsOnlyData;
      const allIds = new Set(activeList.map((p, idx) => p.id || idx));
      setExpandedInvoices(allIds);
      setShowAllItems(true);
    }
  };

  // Handler to Open Printable View
  const handleOpenPrintView = () => {
    if (selectedReport === 'all_purchases') {
      const totalAmount = allPurchasesData.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
      const totalPaid = allPurchasesData.reduce((s, p) => s + (Number(p.computedPaid) || 0), 0);
      const totalRemaining = allPurchasesData.reduce((s, p) => s + (Number(p.computedRemaining) || 0), 0);

      setPrintDocumentProps({
        title: 'تقرير فواتير الشراء الإجمالية',
        reportCode: `REP-PUR-01-${Date.now().toString().slice(-6)}`,
        filterDescription: currentFilterLabel,
        detailedInvoices: allPurchasesData,
        kpis: [
          { label: 'إجمالي مبالغ الشراء', value: totalAmount, currency: 'د.ع' },
          { label: 'إجمالي المسدد', value: totalPaid, currency: 'د.ع' },
          { label: 'المتبقي (الذمم)', value: totalRemaining, currency: 'د.ع', highlight: totalRemaining > 0 },
          { label: 'عدد الفواتير', value: allPurchasesData.length },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isBold: true, isMono: true },
          { header: 'تاريخ الشراء', key: 'date', isMono: true },
          { header: 'اسم المورد / الشركة', key: 'supplierName', isBold: true },
          { 
            header: 'إجمالي الفاتورة', 
            key: 'totalAmount', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المسدد', 
            key: 'computedPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المتبقي (الذمة)', 
            key: 'computedRemaining', 
            isMono: true, 
            render: (v) => Number(v) > 0 ? (
              <span className="font-bold text-slate-900">{formatIQD(v)} د.ع</span>
            ) : (
              <span className="text-slate-400">0 د.ع</span>
            )
          },
          { 
            header: 'موقف السداد', 
            key: 'status', 
            align: 'center',
            render: (_, row) => (
              Number(row.computedRemaining || 0) <= 0 
                ? 'مسددة بالكامل' 
                : `متبقي (${formatIQD(row.computedRemaining)})`
            )
          },
        ],
        data: allPurchasesData,
        totals: {
          totalAmount: `${formatIQD(totalAmount)} د.ع`,
          computedPaid: `${formatIQD(totalPaid)} د.ع`,
          computedRemaining: `${formatIQD(totalRemaining)} د.ع`,
          status: `${allPurchasesData.length} فاتورة`,
        },
      });
    } else if (selectedReport === 'paid_only') {
      const totalPaid = paidOnlyData.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);

      setPrintDocumentProps({
        title: 'كشف فواتير الشراء المسددة بالكامل',
        reportCode: `REP-PUR-02-${Date.now().toString().slice(-6)}`,
        filterDescription: currentFilterLabel,
        detailedInvoices: [],
        kpis: [
          { label: 'إجمالي المسدد', value: totalPaid, currency: 'د.ع' },
          { label: 'عدد الفواتير المسددة', value: paidOnlyData.length },
          { label: 'المتبقي بذمة المكتب', value: '0', currency: 'د.ع' },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isBold: true, isMono: true },
          { header: 'تاريخ الشراء', key: 'date', isMono: true },
          { header: 'اسم المورد', key: 'supplierName', isBold: true },
          { 
            header: 'المبلغ المسدد بالكامل', 
            key: 'totalAmount', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'طريقة الدفع / الملاحظات', 
            key: 'notes',
            render: (v, row) => v || row.paymentMethod || 'مسددة بالكامل'
          },
          { 
            header: 'الحالة', 
            key: 'status', 
            align: 'center',
            render: () => 'مسددة 100%'
          },
        ],
        data: paidOnlyData,
        totals: {
          totalAmount: `${formatIQD(totalPaid)} د.ع`,
          status: `${paidOnlyData.length} فاتورة مسددة`,
        },
      });
    } else if (selectedReport === 'debts_only') {
      const totalInvoiceValue = debtsOnlyData.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0);
      const totalPaid = debtsOnlyData.reduce((s, p) => s + (Number(p.computedPaid) || 0), 0);
      const totalDebt = debtsOnlyData.reduce((s, p) => s + (Number(p.computedRemaining) || 0), 0);

      setPrintDocumentProps({
        title: 'كشف فواتير الذمم والديون المتبقية',
        reportCode: `REP-PUR-03-${Date.now().toString().slice(-6)}`,
        filterDescription: currentFilterLabel,
        detailedInvoices: [],
        kpis: [
          { label: 'إجمالي الذمم الدائنة', value: totalDebt, currency: 'د.ع', highlight: true },
          { label: 'عدد الفواتير الآجلة', value: debtsOnlyData.length },
          { label: 'إجمالي قيمة الفواتير', value: totalInvoiceValue, currency: 'د.ع' },
          { label: 'المسدد منها', value: totalPaid, currency: 'د.ع' },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isBold: true, isMono: true },
          { header: 'تاريخ الشراء', key: 'date', isMono: true },
          { header: 'اسم المورد / الدائن', key: 'supplierName', isBold: true },
          { 
            header: 'إجمالي الفاتورة', 
            key: 'totalAmount', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المسدد منها', 
            key: 'computedPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'الرصيد المتبقي (المستحق)', 
            key: 'computedRemaining', 
            isMono: true, 
            isBold: true,
            render: (v) => (
              <span className="font-black text-slate-900">{formatIQD(v)} د.ع</span>
            )
          },
          { 
            header: 'البيان', 
            key: 'notes',
            render: (v) => v || 'آجل - قيد السداد'
          },
        ],
        data: debtsOnlyData,
        totals: {
          totalAmount: `${formatIQD(totalInvoiceValue)} د.ع`,
          computedPaid: `${formatIQD(totalPaid)} د.ع`,
          computedRemaining: `${formatIQD(totalDebt)} د.ع`,
          notes: `${debtsOnlyData.length} فاتورة آجلة`,
        },
      });
    } else if (selectedReport === 'suppliers_directory') {
      const totalRemainingDebt = suppliersDirectoryData.reduce((s, sup) => s + (Number(sup.remainingDebt) || 0), 0);
      const suppliersWithDebtCount = suppliersDirectoryData.filter((sup) => sup.remainingDebt > 0).length;

      setPrintDocumentProps({
        title: 'دليل بيانات وأرصدة الموردين',
        reportCode: `REP-PUR-04-${Date.now().toString().slice(-6)}`,
        filterDescription: directoryStatusFilter === 'debts' ? 'الموردين أصحاب الذمم الدائنة' : 'كافة الموردين المسجلين',
        detailedInvoices: [],
        kpis: [
          { label: 'إجمالي الموردين والشركات', value: suppliersDirectoryData.length },
          { label: 'أصحاب الذمم الدائنة', value: suppliersWithDebtCount, highlight: suppliersWithDebtCount > 0 },
          { label: 'إجمالي الذمم الدائنة', value: totalRemainingDebt, currency: 'د.ع', highlight: totalRemainingDebt > 0 },
        ],
        columns: [
          { header: 'اسم المورد / الشركة', key: 'name', isBold: true },
          { header: 'الهاتف المعتمد', key: 'phone', isMono: true },
          { header: 'هاتف إضافي', key: 'phone2', isMono: true },
          { 
            header: 'الرصيد القائم (الدين)', 
            key: 'remainingDebt', 
            isMono: true, 
            isBold: true,
            render: (v) => Number(v) > 0 ? (
              <span className="font-black text-slate-900">{formatIQD(v)} د.ع</span>
            ) : (
              <span className="text-slate-400">0 د.ع (خالص)</span>
            )
          },
          { 
            header: 'عدد الفواتير', 
            key: 'invoicesCount', 
            align: 'center', 
            isMono: true 
          },
          { header: 'ملاحظات', key: 'notes' },
        ],
        data: suppliersDirectoryData,
        totals: {
          remainingDebt: `${formatIQD(totalRemainingDebt)} د.ع`,
          invoicesCount: `${suppliersDirectoryData.reduce((s, sup) => s + sup.invoicesCount, 0)} فاتورة`,
          notes: `${suppliersDirectoryData.length} مورد`,
        },
      });
    }
  };

  // المزامنة التلقائية لبيانات التقرير الحالي ودالة الطباعة مع شريط الرأس العلوي الموحد
  const printHandlerRef = useRef(handleOpenPrintView);
  useEffect(() => {
    printHandlerRef.current = handleOpenPrintView;
  });

  useEffect(() => {
    if (!setReportMeta) return;
    if (!selectedReport) {
      setReportMeta(null);
      return;
    }
    const metaMap = {
      all_purchases: { code: 'REP-PUR-01', title: 'تقرير فواتير الشراء الإجمالية' },
      paid_only: { code: 'REP-PUR-02', title: 'كشف فواتير الشراء المسددة بالكامل' },
      debts_only: { code: 'REP-PUR-03', title: 'كشف فواتير الذمم والديون المتبقية' },
      suppliers_directory: { code: 'REP-PUR-04', title: 'دليل بيانات الموردين وأرصدة الحسابات' },
    };
    const meta = metaMap[selectedReport];
    if (meta) {
      setReportMeta({
        code: meta.code,
        title: meta.title,
        onPrint: () => {
          if (printHandlerRef.current) printHandlerRef.current();
        },
      });
    } else {
      setReportMeta(null);
    }
  }, [selectedReport, setReportMeta]);

  // ========================================================
  // LEVEL 2: الواجهة عند عدم اختيار كشف معين (الكارتات الـ 4 الرسمية بدون شروحات زائدة)
  // ========================================================
  if (!selectedReport) {
    return (
      <div className="space-y-4 select-none" dir="rtl">
        {/* الكارتات الأربعة الرسمية بدون نصوص شروحات تحتها */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* الكارت 1: تقرير فواتير الشراء الإجمالية */}
          <div
            onClick={() => {
              setSelectedReport('all_purchases');
              setSearchTerm('');
            }}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-PUR-01
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                تقرير فواتير الشراء الإجمالية
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 font-mono">
                {statsOverview.totalPurchasesCount} فاتورة • {formatIQD(statsOverview.totalPurchasesAmount)} د.ع
              </span>
              <span className="text-slate-800 group-hover:translate-x-[-3px] transition-transform flex items-center gap-1 font-black">
                فتح الكشف ➔
              </span>
            </div>
          </div>

          {/* الكارت 2: كشف الفواتير المسددة بالكامل */}
          <div
            onClick={() => {
              setSelectedReport('paid_only');
              setSearchTerm('');
            }}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-PUR-02
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                كشف فواتير الشراء المسددة بالكامل
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 font-mono">
                {statsOverview.paidCount} فاتورة مسددة • {formatIQD(statsOverview.paidAmount)} د.ع
              </span>
              <span className="text-slate-800 group-hover:translate-x-[-3px] transition-transform flex items-center gap-1 font-black">
                فتح الكشف ➔
              </span>
            </div>
          </div>

          {/* الكارت 3: كشف الذمم الدائنة والديون المتبقية */}
          <div
            onClick={() => {
              setSelectedReport('debts_only');
              setSearchTerm('');
            }}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-PUR-03
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                كشف الذمم الدائنة وفواتير الديون المتبقية
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-900 font-mono font-black">
                {statsOverview.debtsCount} فاتورة آجلة • {formatIQD(statsOverview.totalRemainingDebt)} د.ع
              </span>
              <span className="text-slate-800 group-hover:translate-x-[-3px] transition-transform flex items-center gap-1 font-black">
                فتح الكشف ➔
              </span>
            </div>
          </div>

          {/* الكارت 4: دليل بيانات الموردين وأرصدة الحسابات */}
          <div
            onClick={() => {
              setSelectedReport('suppliers_directory');
              setSearchTerm('');
            }}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                REP-PUR-04
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                دليل بيانات الموردين وأرصدة الحسابات
              </h3>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600 font-mono">
                {statsOverview.suppliersCount} مورد مسجل
              </span>
              <span className="text-slate-800 group-hover:translate-x-[-3px] transition-transform flex items-center gap-1 font-black">
                فتح الكشف ➔
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // LEVEL 3: الواجهة عند استعراض أحد الكشوفات المحددة
  // ========================================================
  return (
    <div className="space-y-4 select-none" dir="rtl">
      {/* شريط الفلاتر والبحث الرسمي */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-300 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                selectedReport === 'suppliers_directory'
                  ? 'بحث باسم المورد أو الهاتف...'
                  : 'بحث برقم الفاتورة أو المورد...'
              }
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-slate-800 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {selectedReport !== 'suppliers_directory' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:border-slate-400"
              >
                <option value="all">كافة الموردين ({allSupplierNames.length})</option>
                {allSupplierNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-600">
                <span className="text-[11px] text-slate-400">من:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-mono"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-600">
                <span className="text-[11px] text-slate-400">إلى:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">التصنيف:</span>
              <button
                type="button"
                onClick={() => setDirectoryStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  directoryStatusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                الكل ({suppliersDirectoryData.length})
              </button>
              <button
                type="button"
                onClick={() => setDirectoryStatusFilter('debts')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  directoryStatusFilter === 'debts'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                ذمم دائنة
              </button>
              <button
                type="button"
                onClick={() => setDirectoryStatusFilter('settled')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  directoryStatusFilter === 'settled'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                خالصة
              </button>
            </div>
          )}
        </div>

        {selectedReport !== 'suppliers_directory' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100 text-[11px] font-bold text-slate-500">
            <span>الفترات:</span>
            <button
              type="button"
              onClick={() => handleSetDatePreset('all')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('today')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('week')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              آخر 7 أيام
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('month')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              آخر 30 يوم
            </button>
            <button
              type="button"
              onClick={() => handleSetDatePreset('year')}
              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              هذا العام
            </button>

            {(dateFrom || dateTo || selectedSupplier !== 'all' || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSelectedSupplier('all');
                  setSearchTerm('');
                }}
                className="mr-auto text-slate-700 hover:underline cursor-pointer font-bold"
              >
                إعادة ضبط ↺
              </button>
            )}
          </div>
        )}
      </div>

      {/* بطاقات الإجماليات الرسمية */}
      {selectedReport === 'all_purchases' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-300">
            <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي الشراء</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono block">
              {formatIQD(allPurchasesData.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0))} د.ع
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-300">
            <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي المسدد</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono block">
              {formatIQD(allPurchasesData.reduce((s, p) => s + (Number(p.computedPaid) || 0), 0))} د.ع
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-300">
            <span className="text-xs font-bold text-slate-500 block mb-1">المتبقي (الذمم)</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono block">
              {formatIQD(allPurchasesData.reduce((s, p) => s + (Number(p.computedRemaining) || 0), 0))} د.ع
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-300">
            <span className="text-xs font-bold text-slate-500 block mb-1">عدد الفواتير</span>
            <span className="text-base sm:text-lg font-black text-slate-900 font-mono block">
              {allPurchasesData.length}
            </span>
          </div>
        </div>
      )}

      {selectedReport === 'paid_only' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">المبالغ المسددة بالكامل</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {formatIQD(paidOnlyData.reduce((s, p) => s + (Number(p.totalAmount) || 0), 0))} د.ع
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">عدد الفواتير المسددة</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {paidOnlyData.length} فاتورة
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">نسبة السداد التام</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {purchases.length > 0 ? Math.round((paidOnlyData.length / purchases.length) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {selectedReport === 'debts_only' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">الذمم الدائنة المتبقية للموردين</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {formatIQD(debtsOnlyData.reduce((s, p) => s + (Number(p.computedRemaining) || 0), 0))} د.ع
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">عدد الفواتير الآجلة</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {debtsOnlyData.length} فاتورة
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">المسدد من هذه الفواتير</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {formatIQD(debtsOnlyData.reduce((s, p) => s + (Number(p.computedPaid) || 0), 0))} د.ع
            </span>
          </div>
        </div>
      )}

      {selectedReport === 'suppliers_directory' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي الموردين</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {suppliersDirectoryData.length} مورد
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">موردين بديون قائمة</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {suppliersDirectoryData.filter((s) => s.remainingDebt > 0).length} مورد
            </span>
          </div>

          <div className="bg-white border border-slate-300 p-3.5 rounded-xl">
            <span className="text-xs font-bold text-slate-500 block mb-1">مجموع الذمم الدائنة</span>
            <span className="text-lg sm:text-xl font-black text-slate-900 font-mono block">
              {formatIQD(suppliersDirectoryData.reduce((s, sup) => s + sup.remainingDebt, 0))} د.ع
            </span>
          </div>
        </div>
      )}

      {/* جدول البيانات المحاسبي مع إمكانية عرض تفاصيل المواد المشتراة */}
      <div className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-2xs">
        <div className="p-3 bg-slate-50 border-b border-slate-300 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-xs">
            سجلات الكشف ({selectedReport === 'suppliers_directory' ? suppliersDirectoryData.length : (selectedReport === 'all_purchases' ? allPurchasesData.length : selectedReport === 'paid_only' ? paidOnlyData.length : debtsOnlyData.length)} قيد)
          </span>

          {selectedReport !== 'suppliers_directory' && (
            <button
              type="button"
              onClick={handleToggleAllItems}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition-colors cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>{showAllItems ? 'إخفاء تفاصيل المواد' : 'عرض تفاصيل المواد لجميع الفواتير'}</span>
              <span className="font-mono text-[10px] text-slate-500">{showAllItems ? '▲' : '▼'}</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {selectedReport === 'suppliers_directory' ? (
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                  <th className="py-2.5 px-3 font-bold">اسم المورد / الشركة</th>
                  <th className="py-2.5 px-3 font-bold">الهاتف</th>
                  <th className="py-2.5 px-3 font-bold text-left">الرصيد القائم (الدين)</th>
                  <th className="py-2.5 px-3 font-bold text-center">العمليات</th>
                  <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {suppliersDirectoryData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 font-bold">
                      لا توجد قيود مسجلة
                    </td>
                  </tr>
                ) : (
                  suppliersDirectoryData.map((sup, idx) => (
                    <tr key={sup.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-black text-slate-900">{sup.name}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700" dir="ltr">
                        {sup.phone || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-black">
                        {sup.remainingDebt > 0 ? (
                          <span className="text-slate-900 font-bold">
                            {formatIQD(sup.remainingDebt)} د.ع
                          </span>
                        ) : (
                          <span className="text-slate-400">0 د.ع</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        {sup.invoicesCount}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{sup.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                  <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                  <th className="py-2.5 px-3 font-bold">تاريخ الشراء</th>
                  <th className="py-2.5 px-3 font-bold">المورد / الدائن</th>
                  <th className="py-2.5 px-3 font-bold text-left">إجمالي القيمة</th>
                  <th className="py-2.5 px-3 font-bold text-left">المسدد</th>
                  <th className="py-2.5 px-3 font-bold text-left">المتبقي (الذمة)</th>
                  <th className="py-2.5 px-3 font-bold text-center">الموقف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(selectedReport === 'all_purchases' ? allPurchasesData : selectedReport === 'paid_only' ? paidOnlyData : debtsOnlyData).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                      لا توجد فواتير مسجلة
                    </td>
                  </tr>
                ) : (
                  (selectedReport === 'all_purchases' ? allPurchasesData : selectedReport === 'paid_only' ? paidOnlyData : debtsOnlyData).map((inv, idx) => {
                    const invId = inv.id || idx;
                    const isPaid = Number(inv.computedRemaining || 0) <= 0;
                    const isExpanded = expandedInvoices.has(invId);
                    const items = inv.items || [];

                    return (
                      <React.Fragment key={invId}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            <button
                              type="button"
                              onClick={() => toggleInvoiceExpanded(invId)}
                              className="text-slate-900 hover:text-indigo-600 flex items-center gap-1.5 cursor-pointer"
                              title="عرض تفاصيل المواد المشتراة"
                            >
                              <span>#{inv.invoiceNumber || '—'}</span>
                              {items.length > 0 && (
                                <span className="text-[10px] text-slate-400 font-sans">
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 font-bold">
                            {inv.date || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-black text-slate-900">
                            {inv.supplierName || 'غير محدد'}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">
                            {formatIQD(inv.totalAmount)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-700">
                            {formatIQD(inv.computedPaid)} د.ع
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono font-black">
                            {!isPaid ? (
                              <span className="text-slate-900 font-black">
                                {formatIQD(inv.computedRemaining)} د.ع
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">0 د.ع</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isPaid ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                مسددة
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-900 border border-slate-400">
                                متبقي ذمة
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* تفاصيل المواد المشتراة عند التوسيع على الشاشة */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80 border-b-2 border-slate-300">
                            <td colSpan={8} className="p-3">
                              <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-2 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="font-black text-slate-900">
                                    المواد المشتراة في فاتورة #{inv.invoiceNumber} — {inv.supplierName} ({items.length} أصناف)
                                  </span>
                                  <span className="font-mono text-slate-500 font-bold text-[11px]">
                                    إجمالي القطع: {items.reduce((s, it) => s + (Number(it.quantity) || 1), 0)} قطعة
                                  </span>
                                </div>

                                {items.length === 0 ? (
                                  <p className="text-slate-400 italic text-[11px] py-1">
                                    {inv.isOpeningDebt ? 'سند رصيد افتتاحي سابق (بدون تفاصيل مواد)' : 'لا توجد تفاصيل مواد مدخلة لهذه الفاتورة'}
                                  </p>
                                ) : (
                                  <table className="w-full text-right border-collapse text-[11px]">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                                        <th className="py-1 px-2 text-center w-8">ت</th>
                                        <th className="py-1 px-2">اسم المادة</th>
                                        <th className="py-1 px-2 text-center w-16">الكمية</th>
                                        <th className="py-1 px-2 text-left w-28">السعر المفرد</th>
                                        <th className="py-1 px-2 text-left w-32">الإجمالي</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {items.map((it, iIdx) => {
                                        const qty = Number(it.quantity) || 1;
                                        const price = Number(it.costPrice || it.baseCostPrice) || 0;
                                        const lineTotal = qty * price;
                                        return (
                                          <tr key={iIdx} className="hover:bg-slate-50">
                                            <td className="py-1 px-2 text-center font-mono text-slate-400">{iIdx + 1}</td>
                                            <td className="py-1 px-2 font-bold text-slate-900">
                                              {it.name || it.productName || 'مادة'}
                                            </td>
                                            <td className="py-1 px-2 text-center font-mono font-bold text-slate-800">{qty}</td>
                                            <td className="py-1 px-2 text-left font-mono text-slate-700">{formatIQD(price)} د.ع</td>
                                            <td className="py-1 px-2 text-left font-mono font-bold text-slate-900">{formatIQD(lineTotal)} د.ع</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* نافذة المعاينة والطباعة الرسمية المحاسبية A4 / PDF */}
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
