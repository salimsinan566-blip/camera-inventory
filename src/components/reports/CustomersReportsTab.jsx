import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useCustomers } from '../../hooks/useCustomers';
import { useSales } from '../../hooks/useSales';
import { useIncomes } from '../../hooks/useIncomes';
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

function toTimestampNumber(val) {
  const d = toDateSafe(val);
  return d ? d.getTime() : 0;
}

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '');
}

function isSaleMatchedToCustomer(sale, customer) {
  if (!sale || !customer) return false;
  if (sale.customerId && customer.id && String(sale.customerId) === String(customer.id)) {
    return true;
  }
  const sName = (sale.customerName || '').trim().toLowerCase();
  const cName = (customer.name || '').trim().toLowerCase();
  if (sName && cName && (sName === cName || normalizeArabic(sName) === normalizeArabic(cName))) {
    return true;
  }
  return false;
}

function getSaleRemainingDebt(s) {
  if (!s) return 0;
  const isDebt = s.invoiceType === 'debt' || 
                 s.paymentMethod === 'debt' || 
                 (s.remainingDebt !== undefined && Number(s.remainingDebt) > 0) ||
                 s.paymentStatus === 'unpaid' ||
                 s.paymentStatus === 'partial';
  if (!isDebt) return 0;

  if (s.isSettled === true || s.paymentStatus === 'paid') {
    return 0;
  }

  const total = Number(s.total || 0);
  const paymentsSum = Array.isArray(s.payments) 
    ? s.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) 
    : 0;
  const paid = Math.max(Number(s.paidAmount || 0), paymentsSum);

  let remaining = 0;
  if (s.remainingDebt !== undefined && s.remainingDebt !== null) {
    remaining = Number(s.remainingDebt);
  } else {
    remaining = Math.max(0, total - paid);
  }

  if (total > 0 && paid > 0 && remaining === total) {
    remaining = Math.max(0, total - paid);
  }
  if (paid >= total && total > 0) {
    remaining = 0;
  }
  return Math.max(0, remaining);
}

export default function CustomersReportsTab({
  storeSettings = {},
  userName = 'المحاسب المسؤول',
  onBackToDepartments = null,
  selectedReport: propSelectedReport,
  onSelectReport,
  setReportMeta,
}) {
  const { customers = [] } = useCustomers();
  const { sales = [] } = useSales();
  const { incomes = [] } = useIncomes();

  // Active Report: null (Cards Overview) | 'directory' | 'statement' | 'debts' | 'purchases' | 'payments'
  const [internalSelectedReport, setInternalSelectedReport] = useState(null);
  const selectedReport = propSelectedReport !== undefined ? propSelectedReport : internalSelectedReport;
  const setSelectedReport = onSelectReport || setInternalSelectedReport;

  // General Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [purchasesTypeFilter, setPurchasesTypeFilter] = useState('all'); // 'all' | 'debt' | 'cash'
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');

  // Customer Account Statement Specific State (REP-CUS-02)
  const [statementCustomerName, setStatementCustomerName] = useState('');
  const [statementSearchQuery, setStatementSearchQuery] = useState('');

  // Items Accordion / Expansion State for Invoices
  const [expandedInvoices, setExpandedInvoices] = useState(() => new Set());
  const [showAllItems, setShowAllItems] = useState(false);

  // Modal State for Printable View
  const [printDocumentProps, setPrintDocumentProps] = useState(null);

  // Quick Date Presets
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

  // 1. Unified Customers with Financial Aggregates
  const allMergedCustomers = useMemo(() => {
    const list = [...customers];
    const registeredNames = new Set(customers.map((c) => (c.name || '').trim().toLowerCase()));

    (sales || []).forEach((sale) => {
      const name = (sale.customerName || '').trim();
      const norm = name.toLowerCase();
      if (name && !registeredNames.has(norm)) {
        const alreadyMatched = list.some((c) => isSaleMatchedToCustomer(sale, c));
        if (!alreadyMatched) {
          registeredNames.add(norm);
          list.push({
            id: `discovered-${sale.id}`,
            name: name,
            phone1: sale.customerPhone || sale.phone || '',
            phone2: '',
            notes: '',
            customerType: 'customer',
            isDiscovered: true,
          });
        }
      }
    });

    return list.map((c) => {
      let totalPurchases = 0;
      let totalPaid = 0;
      let totalDebt = 0;
      let invoicesCount = 0;
      let unpaidInvoicesCount = 0;

      (sales || []).forEach((sale) => {
        if (isSaleMatchedToCustomer(sale, c)) {
          const total = Number(sale.total !== undefined ? sale.total : (sale.totalAmount || 0));
          const isDebt = sale.invoiceType === 'debt' || 
                         sale.paymentMethod === 'debt' || 
                         (sale.remainingDebt !== undefined && Number(sale.remainingDebt) > 0) ||
                         (sale.numericRemaining !== undefined && Number(sale.numericRemaining) > 0) ||
                         sale.paymentStatus === 'unpaid' ||
                         sale.paymentStatus === 'partial';
          totalPurchases += total;
          invoicesCount += 1;

          if (isDebt) {
            const paymentsSum = Array.isArray(sale.payments) 
              ? sale.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) 
              : 0;
            let paid = Math.max(Number(sale.paidAmount || 0), paymentsSum);
            let remaining = getSaleRemainingDebt(sale);
            if (sale.isSettled === true || sale.paymentStatus === 'paid' || remaining <= 0) {
              remaining = 0;
              paid = total;
            }
            totalPaid += paid;
            totalDebt += remaining;
            if (remaining > 0) {
              unpaidInvoicesCount += 1;
            }
          } else {
            totalPaid += total;
          }
        }
      });

      return {
        ...c,
        phone1: c.phone1 || c.phone || '',
        phone2: c.phone2 || '',
        notes: c.notes || '',
        customerType: c.customerType || 'customer',
        totalPurchases,
        totalPaid,
        totalDebt,
        invoicesCount,
        unpaidInvoicesCount,
      };
    });
  }, [customers, sales]);

  // Unique Customer Names for Dropdowns
  const allCustomerNames = useMemo(() => {
    const set = new Set();
    allMergedCustomers.forEach((c) => {
      if (c.name) set.add(c.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allMergedCustomers]);

  // 2. Confirmed Sales with Item Details
  const salesList = useMemo(() => {
    return (sales || [])
      .filter((s) => s.status !== 'deleted' && s.status !== 'draft')
      .map((s) => {
        const total = Number(s.total !== undefined ? s.total : (s.totalAmount || 0));
        const isDebt = s.invoiceType === 'debt' || 
                       s.paymentMethod === 'debt' || 
                       (s.remainingDebt !== undefined && Number(s.remainingDebt) > 0) ||
                       (s.numericRemaining !== undefined && Number(s.numericRemaining) > 0) ||
                       s.paymentStatus === 'unpaid' ||
                       s.paymentStatus === 'partial';

        const paymentsSum = Array.isArray(s.payments)
          ? s.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
          : 0;

        let paid = 0;
        if (s.numericPaid !== undefined && s.numericPaid !== null) {
          paid = Number(s.numericPaid);
        } else if (s.paidAmount !== undefined && s.paidAmount !== null) {
          paid = Number(s.paidAmount);
        }
        if (paymentsSum > paid) {
          paid = paymentsSum;
        }

        let remaining = 0;
        if (isDebt) {
          remaining = getSaleRemainingDebt(s);
          paid = Math.min(total, Math.max(0, paid));
        } else {
          paid = total;
          remaining = 0;
        }

        const isSettled = !isDebt || remaining <= 0 || s.isSettled === true || s.paymentStatus === 'paid';
        if (isSettled) {
          remaining = 0;
          if (!isDebt || paid < total) {
            paid = total;
          }
        }
        const isPartial = isDebt && !isSettled && paid > 0;
        const isUnpaid = isDebt && !isSettled && paid === 0;

        const dateStr = toIsoDateStr(s.date) || toIsoDateStr(s.createdAt) || '';

        return {
          ...s,
          numericTotal: total,
          numericPaid: paid,
          numericRemaining: remaining,
          isSettled,
          isPartial,
          isUnpaid,
          isDebtInvoice: isDebt,
          dateStr,
          customerName: (s.customerName || 'زبون نقدي').trim(),
          customerPhone: s.customerPhone || s.phone || '',
          items: Array.isArray(s.items) ? s.items : [],
        };
      })
      .sort((a, b) => {
        const d1 = toTimestampNumber(b.date || b.createdAt);
        const d2 = toTimestampNumber(a.date || a.createdAt);
        return d1 - d2;
      });
  }, [sales]);

  // 3. Consolidated Customer Payments & Receipts
  const paymentsList = useMemo(() => {
    const list = [];

    // A) Debt invoice payments from `sale.payments`
    sales.forEach((s) => {
      if (s.status === 'deleted' || s.status === 'draft') return;
      const cName = (s.customerName || 'زبون نقدي').trim();
      const cPhone = s.customerPhone || s.phone || '';
      const invNum = s.invoiceNumber || '—';

      if (Array.isArray(s.payments) && s.payments.length > 0) {
        s.payments.forEach((p) => {
          const pAmt = Number(p.amount) || 0;
          if (pAmt <= 0) return;
          const pDate = toIsoDateStr(p.date) || toIsoDateStr(s.date) || toIsoDateStr(s.createdAt) || '';
          list.push({
            id: p.id || `pay_${s.id}_${Math.random()}`,
            amount: pAmt,
            date: pDate,
            customerName: cName,
            customerPhone: cPhone,
            invoiceNumber: `#${invNum}`,
            paymentType: 'debt_payment',
            typeLabel: 'تسديد دين فاتورة',
            paymentMethod: p.paymentMethod || 'نقدي',
            receivedBy: p.receivedBy || 'المسؤول',
            notes: p.notes || `تسديد دفعة للفاتورة #${invNum}`,
          });
        });
      }

      // Initial down payment on debt sale
      if (s.invoiceType === 'debt' && Number(s.paidAmount || 0) > 0) {
        const hasPaymentRecorded = Array.isArray(s.payments) && s.payments.length > 0;
        if (!hasPaymentRecorded) {
          const dateStr = toIsoDateStr(s.date) || toIsoDateStr(s.createdAt) || '';
          list.push({
            id: `down_${s.id}`,
            amount: Number(s.paidAmount),
            date: dateStr,
            customerName: cName,
            customerPhone: cPhone,
            invoiceNumber: `#${invNum}`,
            paymentType: 'down_payment',
            typeLabel: 'دفعة مقدمة عند البيع',
            paymentMethod: s.paymentMethod || 'نقدي',
            receivedBy: s.cashierName || 'المسؤول',
            notes: 'دفعة نقدية مسددة عند تثبيت الفاتورة',
          });
        }
      }

      // Cash sales
      if (s.invoiceType === 'cash' || !s.invoiceType) {
        const total = Number(s.total || 0);
        if (total > 0) {
          const dateStr = toIsoDateStr(s.date) || toIsoDateStr(s.createdAt) || '';
          list.push({
            id: `cash_${s.id}`,
            amount: total,
            date: dateStr,
            customerName: cName,
            customerPhone: cPhone,
            invoiceNumber: `#${invNum}`,
            paymentType: 'cash_sale',
            typeLabel: 'سداد نقدي مباشر',
            paymentMethod: s.paymentMethod || 'نقدي',
            receivedBy: s.cashierName || 'المسؤول',
            notes: 'مبيعات نقدية مسددة بالكامل',
          });
        }
      }
    });

    // B) Customer receipts from `incomes`
    (incomes || []).forEach((inc) => {
      const name = (inc.customerName || inc.payerName || '').trim();
      if (!name) return;
      const amt = Number(inc.amount) || 0;
      if (amt <= 0) return;
      const dateStr = toIsoDateStr(inc.date) || toIsoDateStr(inc.createdAt) || '';

      list.push({
        id: `inc_${inc.id}`,
        amount: amt,
        date: dateStr,
        customerName: name,
        customerPhone: '',
        invoiceNumber: inc.invoiceNumber ? `#${inc.invoiceNumber}` : 'سند إيراد',
        paymentType: 'income_receipt',
        typeLabel: 'سند قبض / إيراد',
        paymentMethod: inc.paymentMethod || 'نقدي',
        receivedBy: inc.receivedBy || 'المسؤول',
        notes: inc.title + (inc.notes ? ` - ${inc.notes}` : ''),
      });
    });

    return list.sort((a, b) => {
      const d1 = toTimestampNumber(b.date);
      const d2 = toTimestampNumber(a.date);
      return d1 - d2;
    });
  }, [sales, incomes]);

  // 4. Debtor Customers List (جميع من يترتب عليه دين سواء عميل أو زبون)
  const debtorCustomersList = useMemo(() => {
    return allMergedCustomers
      .filter((c) => (c.totalDebt || 0) > 0)
      .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0));
  }, [allMergedCustomers]);

  // ----------------------------------------------------------------------
  // Filtered Datasets for Each Report
  // ----------------------------------------------------------------------

  // Report 1: Directory (REP-CUS-01: أسماء العملاء المعتمدين فقط - بدون الزبائن العاديين وبدون المكتشفين تلقائياً)
  const filteredDirectoryData = useMemo(() => {
    return allMergedCustomers
      .filter((c) => {
        // استبعاد أي زبون غير مسجل رسمياً أو مسجل كـ "زبون" فقط
        if (c.isDiscovered) return false;
        const isClient = c.customerType === 'client' || c.customerType === 'vip';
        if (!isClient) return false;

        if (searchTerm.trim()) {
          const q = normalizeArabic(searchTerm);
          const nameNorm = normalizeArabic(c.name);
          const phoneClean = (c.phone1 || '').replace(/[\s\-]/g, '');
          return nameNorm.includes(q) || phoneClean.includes(searchTerm.trim());
        }
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  }, [allMergedCustomers, searchTerm]);

  // Report 2: Customer Account Statement Data (REP-CUS-02)
  const statementSelectedCustomer = useMemo(() => {
    if (!statementCustomerName.trim()) return null;
    const targetNorm = normalizeArabic(statementCustomerName);
    return (
      allMergedCustomers.find((c) => normalizeArabic(c.name) === targetNorm) ||
      allMergedCustomers.find((c) => normalizeArabic(c.name).includes(targetNorm)) ||
      null
    );
  }, [allMergedCustomers, statementCustomerName]);

  const statementSales = useMemo(() => {
    if (!statementCustomerName.trim() && !statementSelectedCustomer) return [];
    const custRef = statementSelectedCustomer || { name: statementCustomerName };
    return salesList.filter((s) => isSaleMatchedToCustomer(s, custRef));
  }, [salesList, statementCustomerName, statementSelectedCustomer]);

  const statementPayments = useMemo(() => {
    if (!statementCustomerName.trim() && !statementSelectedCustomer) return [];
    const targetNorm = normalizeArabic(statementSelectedCustomer?.name || statementCustomerName);
    return paymentsList.filter((p) => {
      const pNorm = normalizeArabic(p.customerName);
      return pNorm === targetNorm || pNorm.includes(targetNorm);
    });
  }, [paymentsList, statementCustomerName, statementSelectedCustomer]);

  const statementSummary = useMemo(() => {
    const totalPurchases = statementSales.reduce((s, p) => s + (p.numericTotal || 0), 0);
    const salesPaidSum = statementSales.reduce((s, p) => s + (p.numericPaid || 0), 0);
    const salesRemaining = statementSales.reduce((s, p) => s + (p.numericRemaining || 0), 0);
    const paymentsSum = statementPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalPaid = Math.max(salesPaidSum, paymentsSum);
    const totalDebt = statementSelectedCustomer?.totalDebt !== undefined
      ? statementSelectedCustomer.totalDebt
      : salesRemaining;

    return {
      totalPurchases,
      totalPaid,
      totalDebt,
      invoicesCount: statementSales.length,
      paymentsCount: statementPayments.length,
    };
  }, [statementSales, statementPayments, statementSelectedCustomer]);

  // Quick list of customers for statement picker
  const filteredStatementPickerCustomers = useMemo(() => {
    if (!statementSearchQuery.trim()) {
      return allMergedCustomers
        .filter((c) => (c.totalDebt || 0) > 0 || c.customerType === 'vip' || c.customerType === 'client')
        .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0))
        .slice(0, 15);
    }
    const q = normalizeArabic(statementSearchQuery);
    return allMergedCustomers.filter((c) => {
      const nameNorm = normalizeArabic(c.name);
      const phone1 = (c.phone1 || '').replace(/[\s\-]/g, '');
      const phone2 = (c.phone2 || '').replace(/[\s\-]/g, '');
      return nameNorm.includes(q) || phone1.includes(statementSearchQuery.trim()) || phone2.includes(statementSearchQuery.trim());
    });
  }, [allMergedCustomers, statementSearchQuery]);

  // Report 3: Debts (REP-CUS-03: ديون الزبائن والعملاء - كل من عليه فلوس)
  const filteredDebtsData = useMemo(() => {
    return debtorCustomersList.filter((c) => {
      if (selectedCustomer !== 'all') {
        if (c.name.toLowerCase() !== selectedCustomer.toLowerCase().trim()) return false;
      }

      if (searchTerm.trim()) {
        const q = normalizeArabic(searchTerm);
        const nameNorm = normalizeArabic(c.name);
        const p1 = (c.phone1 || '').replace(/[\s\-]/g, '');
        const p2 = (c.phone2 || '').replace(/[\s\-]/g, '');

        if (!nameNorm.includes(q) && !p1.includes(searchTerm.trim()) && !p2.includes(searchTerm.trim())) {
          return false;
        }
      }
      return true;
    });
  }, [debtorCustomersList, selectedCustomer, searchTerm]);

  // Report 4: Purchases / Sales Invoices (REP-CUS-04)
  const filteredPurchasesData = useMemo(() => {
    return salesList.filter((s) => {
      if (selectedCustomer !== 'all') {
        if (s.customerName.toLowerCase() !== selectedCustomer.toLowerCase().trim()) return false;
      }

      if (purchasesTypeFilter === 'debt' && s.invoiceType !== 'debt') return false;
      if (purchasesTypeFilter === 'cash' && s.invoiceType === 'debt') return false;

      if (dateFrom && s.dateStr && s.dateStr < dateFrom) return false;
      if (dateTo && s.dateStr && s.dateStr > dateTo) return false;

      if (searchTerm.trim()) {
        const q = normalizeArabic(searchTerm);
        const nameNorm = normalizeArabic(s.customerName);
        const phoneClean = (s.customerPhone || '').replace(/[\s\-]/g, '');
        const invNum = String(s.invoiceNumber || '').toLowerCase();
        const itemsMatch = s.items.some((it) => normalizeArabic(it.name).includes(q));

        if (!nameNorm.includes(q) && !phoneClean.includes(searchTerm.trim()) && !invNum.includes(q) && !itemsMatch) {
          return false;
        }
      }
      return true;
    });
  }, [salesList, selectedCustomer, purchasesTypeFilter, dateFrom, dateTo, searchTerm]);

  // Report 5: Payments (REP-CUS-05)
  const filteredPaymentsData = useMemo(() => {
    return paymentsList.filter((p) => {
      if (selectedCustomer !== 'all') {
        if (p.customerName.toLowerCase() !== selectedCustomer.toLowerCase().trim()) return false;
      }

      if (paymentTypeFilter !== 'all' && p.paymentType !== paymentTypeFilter) return false;

      if (dateFrom && p.date && p.date < dateFrom) return false;
      if (dateTo && p.date && p.date > dateTo) return false;

      if (searchTerm.trim()) {
        const q = normalizeArabic(searchTerm);
        const nameNorm = normalizeArabic(p.customerName);
        const phoneClean = (p.customerPhone || '').replace(/[\s\-]/g, '');
        const invNum = String(p.invoiceNumber || '').toLowerCase();
        const notesNorm = normalizeArabic(p.notes);

        if (!nameNorm.includes(q) && !phoneClean.includes(searchTerm.trim()) && !invNum.includes(q) && !notesNorm.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [paymentsList, selectedCustomer, paymentTypeFilter, dateFrom, dateTo, searchTerm]);

  // ----------------------------------------------------------------------
  // Handlers for Items Expansion
  // ----------------------------------------------------------------------
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

  const handleToggleAllItems = () => {
    const activeList = selectedReport === 'statement' ? statementSales : filteredPurchasesData;
    if (showAllItems) {
      setExpandedInvoices(new Set());
      setShowAllItems(false);
    } else {
      const allIds = new Set(activeList.map((s) => s.id));
      setExpandedInvoices(allIds);
      setShowAllItems(true);
    }
  };

  const handleOpenCustomerStatement = (customerNameTarget) => {
    setStatementCustomerName(customerNameTarget);
    setSelectedReport('statement');
  };

  // ----------------------------------------------------------------------
  // Printable Report Triggers
  // ----------------------------------------------------------------------
  const handleOpenPrintView = () => {
    const filterDesc = [
      selectedCustomer !== 'all' ? `الزبون: ${selectedCustomer}` : 'كافة الزبائن والعملاء',
      dateFrom && dateTo ? `من ${dateFrom} إلى ${dateTo}` : dateFrom ? `من ${dateFrom}` : dateTo ? `إلى ${dateTo}` : '',
    ].filter(Boolean).join(' | ');

    if (selectedReport === 'directory') {
      setPrintDocumentProps({
        title: 'دليل العملاء المعتمدين',
        subtitle: 'قائمة العملاء المعتمدين والمميزين في النظام',
        reportCode: `REP-CUS-01-${Date.now().toString().slice(-6)}`,
        filterDescription: searchTerm.trim() ? `بحث: ${searchTerm.trim()}` : 'كافة العملاء المعتمدين والمميزين',
        kpis: [
          { label: 'إجمالي عدد العملاء المعتمدين', value: filteredDirectoryData.length },
          { label: 'إجمالي مشترياتهم', value: filteredDirectoryData.reduce((s, c) => s + (c.totalPurchases || 0), 0), currency: 'د.ع' },
          { label: 'إجمالي ديونهم القائمة', value: filteredDirectoryData.reduce((s, c) => s + (c.totalDebt || 0), 0), currency: 'د.ع', highlight: true },
        ],
        columns: [
          { header: 'ت', key: 'idx', render: (_, __, i) => i + 1, isMono: true, align: 'center' },
          { header: 'اسم العميل', key: 'name', isBold: true },
          { 
            header: 'التصنيف', 
            key: 'customerType', 
            align: 'center', 
            render: (v) => v === 'vip' ? 'عميل مميز (VIP)' : 'عميل معتمد' 
          },
          { header: 'رقم الهاتف', key: 'phone1', isMono: true },
          { 
            header: 'إجمالي المشتريات', 
            key: 'totalPurchases', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'إجمالي المسدد', 
            key: 'totalPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'صافي الدين المتبقي', 
            key: 'totalDebt', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
        ],
        data: filteredDirectoryData,
        totals: {
          name: `المجموع: ${filteredDirectoryData.length} عميل`,
          totalPurchases: `${formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalPurchases || 0), 0))} د.ع`,
          totalPaid: `${formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalPaid || 0), 0))} د.ع`,
          totalDebt: `${formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalDebt || 0), 0))} د.ع`,
        },
      });
    } else if (selectedReport === 'statement') {
      const cust = statementSelectedCustomer || { name: statementCustomerName };
      const custLabel = cust.customerType === 'vip' ? 'عميل مميز (VIP)' : cust.customerType === 'client' ? 'عميل معتمد' : 'زبون';
      
      setPrintDocumentProps({
        title: `كشف حساب: ${cust.name || 'عميل'}`,
        subtitle: `${custLabel} • رقم الهاتف: ${cust.phone1 || '—'}`,
        reportCode: `REP-CUS-02-${Date.now().toString().slice(-6)}`,
        filterDescription: `كشف حساب مالي تفصيلي شامل لكافة الفواتير والمشتريات والمقبوضات والديون`,
        detailedInvoices: statementSales,
        kpis: [
          { label: 'إجمالي المشتريات', value: statementSummary.totalPurchases, currency: 'د.ع' },
          { label: 'إجمالي المسدد', value: statementSummary.totalPaid, currency: 'د.ع' },
          { label: 'صافي الرصيد المتبقي (الدين)', value: statementSummary.totalDebt, currency: 'د.ع', highlight: statementSummary.totalDebt > 0 },
          { label: 'عدد الفواتير', value: statementSales.length },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isBold: true, isMono: true, render: (v) => `#${v}` },
          { header: 'التاريخ', key: 'dateStr', isMono: true },
          { 
            header: 'نوع الفاتورة', 
            key: 'invoiceType', 
            align: 'center',
            render: (v, row) => (row.isDebtInvoice || v === 'debt' ? 'آجل (ذمة)' : 'نقدي') 
          },
          { 
            header: 'إجمالي الفاتورة', 
            key: 'numericTotal', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المسدد', 
            key: 'numericPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المتبقي', 
            key: 'numericRemaining', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'حالة السداد', 
            key: 'isSettled', 
            align: 'center',
            render: (v, row) => {
              if (!row.isDebtInvoice && row.invoiceType !== 'debt') return 'نقدي (مسدد)';
              if (row.isSettled || Number(row.numericRemaining || 0) <= 0) return 'مسدد بالكامل ✓';
              if (Number(row.numericPaid || 0) > 0) return 'مسدد جزئياً';
              return 'غير مسدد (دين)';
            }
          },
        ],
        data: statementSales,
        totals: {
          invoiceNumber: 'المجموع الإجمالي',
          numericTotal: `${formatIQD(statementSummary.totalPurchases)} د.ع`,
          numericPaid: `${formatIQD(statementSummary.totalPaid)} د.ع`,
          numericRemaining: `${formatIQD(statementSummary.totalDebt)} د.ع`,
        },
      });
    } else if (selectedReport === 'debts') {
      const totalPurchases = filteredDebtsData.reduce((s, c) => s + (c.totalPurchases || 0), 0);
      const totalPaid = filteredDebtsData.reduce((s, c) => s + (c.totalPaid || 0), 0);
      const totalDebt = filteredDebtsData.reduce((s, c) => s + (c.totalDebt || 0), 0);

      setPrintDocumentProps({
        title: 'تقرير ديون الزبائن والعملاء',
        subtitle: 'كشف الذمم المدينة القائمة وغير المسددة',
        reportCode: `REP-CUS-03-${Date.now().toString().slice(-6)}`,
        filterDescription: filterDesc || 'كافة الزبائن والعملاء المترتب عليهم ذمم مدينة معلقة',
        kpis: [
          { label: 'إجمالي الديون القائمة', value: totalDebt, currency: 'د.ع', highlight: true },
          { label: 'عدد المدينين', value: filteredDebtsData.length, highlight: true },
          { label: 'إجمالي مشترياتهم', value: totalPurchases, currency: 'د.ع' },
          { label: 'إجمالي المسدد منهم', value: totalPaid, currency: 'د.ع' },
        ],
        columns: [
          { header: 'اسم الزبون / العميل', key: 'name', isBold: true },
          { 
            header: 'التصنيف', 
            key: 'customerType', 
            align: 'center',
            render: (v) => v === 'vip' ? 'عميل مميز' : v === 'client' ? 'عميل' : 'زبون'
          },
          { header: 'رقم الهاتف', key: 'phone1', isMono: true },
          { header: 'الفواتير المعلقة', key: 'unpaidInvoicesCount', isMono: true, align: 'center' },
          { 
            header: 'إجمالي المشتريات', 
            key: 'totalPurchases', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'إجمالي المسدد', 
            key: 'totalPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'صافي الدين المتبقي', 
            key: 'totalDebt', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'نسبة السداد', 
            key: 'totalDebt', 
            align: 'center',
            isMono: true,
            render: (v, row) => {
              const tot = Number(row.totalPurchases || 0);
              const pd = Number(row.totalPaid || 0);
              if (tot <= 0) return '0%';
              return `${Math.round((pd / tot) * 100)}%`;
            } 
          },
        ],
        data: filteredDebtsData,
        totals: {
          name: 'المجموع الإجمالي',
          unpaidInvoicesCount: filteredDebtsData.reduce((s, c) => s + (c.unpaidInvoicesCount || 0), 0),
          totalPurchases: `${formatIQD(totalPurchases)} د.ع`,
          totalPaid: `${formatIQD(totalPaid)} د.ع`,
          totalDebt: `${formatIQD(totalDebt)} د.ع`,
        },
      });
    } else if (selectedReport === 'purchases') {
      const totalAmount = filteredPurchasesData.reduce((s, p) => s + p.numericTotal, 0);
      const totalPaid = filteredPurchasesData.reduce((s, p) => s + p.numericPaid, 0);
      const totalRemaining = filteredPurchasesData.reduce((s, p) => s + p.numericRemaining, 0);

      setPrintDocumentProps({
        title: 'تقرير قوائم شراء الزبائن والعملاء',
        subtitle: 'كشف فواتير المبيعات وتفاصيل المواد المباعة',
        reportCode: `REP-CUS-04-${Date.now().toString().slice(-6)}`,
        filterDescription: filterDesc || 'كافة فواتير مبيعات الزبائن والعملاء',
        detailedInvoices: filteredPurchasesData,
        kpis: [
          { label: 'إجمالي قيمة المبيعات', value: totalAmount, currency: 'د.ع' },
          { label: 'إجمالي المسدد', value: totalPaid, currency: 'د.ع' },
          { label: 'المتبقي (الذمم)', value: totalRemaining, currency: 'د.ع', highlight: totalRemaining > 0 },
          { label: 'عدد الفواتير', value: filteredPurchasesData.length },
        ],
        columns: [
          { header: 'رقم الفاتورة', key: 'invoiceNumber', isBold: true, isMono: true, render: (v) => `#${v}` },
          { header: 'التاريخ', key: 'dateStr', isMono: true },
          { header: 'اسم الزبون / العميل', key: 'customerName', isBold: true },
          { header: 'رقم الهاتف', key: 'customerPhone', isMono: true },
          { 
            header: 'نوع الفاتورة', 
            key: 'invoiceType', 
            align: 'center',
            render: (v, row) => (row.isDebtInvoice || v === 'debt' ? 'آجل (ذمة)' : 'نقدي') 
          },
          { 
            header: 'إجمالي الفاتورة', 
            key: 'numericTotal', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المسدد', 
            key: 'numericPaid', 
            isMono: true, 
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'المتبقي', 
            key: 'numericRemaining', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { 
            header: 'حالة السداد', 
            key: 'isSettled', 
            align: 'center',
            render: (v, row) => {
              if (!row.isDebtInvoice && row.invoiceType !== 'debt') return 'نقدي (مسدد)';
              if (row.isSettled || Number(row.numericRemaining || 0) <= 0) return 'مسدد بالكامل ✓';
              if (Number(row.numericPaid || 0) > 0) return 'مسدد جزئياً';
              return 'غير مسدد (دين)';
            }
          },
        ],
        data: filteredPurchasesData,
        totals: {
          invoiceNumber: 'المجموع الإجمالي',
          numericTotal: `${formatIQD(totalAmount)} د.ع`,
          numericPaid: `${formatIQD(totalPaid)} د.ع`,
          numericRemaining: `${formatIQD(totalRemaining)} د.ع`,
        },
      });
    } else if (selectedReport === 'payments') {
      const totalPayments = filteredPaymentsData.reduce((s, p) => s + p.amount, 0);

      setPrintDocumentProps({
        title: 'تقرير قوائم تسديد الزبائن والعملاء',
        subtitle: 'كشف المقبوضات والدفعات وسندات القبض المسجلة',
        reportCode: `REP-CUS-05-${Date.now().toString().slice(-6)}`,
        filterDescription: filterDesc || 'كافة دفعات السداد المسجلة للزبائن والعملاء',
        kpis: [
          { label: 'إجمالي المبالغ المسددة', value: totalPayments, currency: 'د.ع' },
          { label: 'عدد الدفعات', value: filteredPaymentsData.length },
          { label: 'متوسط الدفعة', value: filteredPaymentsData.length > 0 ? Math.round(totalPayments / filteredPaymentsData.length) : 0, currency: 'د.ع' },
        ],
        columns: [
          { header: 'تاريخ الدفعة', key: 'date', isMono: true },
          { header: 'اسم الزبون / العميل', key: 'customerName', isBold: true },
          { header: 'رقم الفاتورة / السند', key: 'invoiceNumber', isMono: true },
          { header: 'نوع الحركة', key: 'typeLabel', align: 'center' },
          { 
            header: 'المبلغ المسدد', 
            key: 'amount', 
            isMono: true, 
            isBold: true,
            render: (v) => `${formatIQD(v)} د.ع` 
          },
          { header: 'طريقة الدفع', key: 'paymentMethod', align: 'center' },
          { header: 'المستلم', key: 'receivedBy' },
          { header: 'ملاحظات', key: 'notes' },
        ],
        data: filteredPaymentsData,
        totals: {
          date: 'المجموع الإجمالي',
          amount: `${formatIQD(totalPayments)} د.ع`,
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
      directory: { code: 'REP-CUS-01', title: 'دليل العملاء المعتمدين' },
      statement: { 
        code: 'REP-CUS-02', 
        title: statementSelectedCustomer?.name 
          ? `كشف حساب: ${statementSelectedCustomer.name}` 
          : 'كشف حساب عميل تفصيلي' 
      },
      debts: { code: 'REP-CUS-03', title: 'ديون الزبائن والعملاء' },
      purchases: { code: 'REP-CUS-04', title: 'قوائم شراء الزبائن والعملاء' },
      payments: { code: 'REP-CUS-05', title: 'قوائم تسديد الزبائن والعملاء' },
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
  }, [selectedReport, statementSelectedCustomer, setReportMeta]);

  return (
    <div className="space-y-4">
      {/* 2. المستوى الثاني: عرض كروت تقارير قسم الزبائن والعملاء الخمسة */}
      {!selectedReport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 animate-fade-in">
          {/* كارت 1: دليل العملاء المعتمدين (REP-CUS-01) */}
          <div
            onClick={() => setSelectedReport('directory')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                REP-CUS-01
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                دليل العملاء المعتمدين
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                العملاء المعتمدون والمميزون المسجلون بالنظام
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-slate-700 group-hover:text-slate-900">
              <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">
                {filteredDirectoryData.length} عميل
              </span>
              <span className="group-hover:translate-x-[-4px] transition-transform">➔</span>
            </div>
          </div>

          {/* كارت 2: كشف حساب عميل تفصيلي (REP-CUS-02) */}
          <div
            onClick={() => setSelectedReport('statement')}
            className="group bg-white rounded-2xl border-2 border-indigo-200 hover:border-indigo-600 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99] bg-gradient-to-br from-white to-indigo-50/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-100/70 border border-indigo-200 px-2 py-0.5 rounded">
                REP-CUS-02
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                كشف حساب عميل
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                بحث بالاسم لعرض كافة الفواتير، الديون والمشتريات
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-indigo-700 group-hover:text-indigo-900">
              <span>كشف تفصيلي كامل</span>
              <span className="group-hover:translate-x-[-4px] transition-transform">➔</span>
            </div>
          </div>

          {/* كارت 3: ديون الزبائن والعملاء (REP-CUS-03) */}
          <div
            onClick={() => setSelectedReport('debts')}
            className="group bg-white rounded-2xl border-2 border-rose-200 hover:border-rose-600 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99] bg-gradient-to-br from-white to-rose-50/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-600 bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded">
                REP-CUS-03
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-rose-900 transition-colors">
                ديون الزبائن والعملاء
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                جميع الأشخاص المترتب بذمتهم ديون ومبالغ معلقة
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-rose-700 group-hover:text-rose-900">
              <span className="font-mono text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-bold">
                {filteredDebtsData.length} مدين مطلوب
              </span>
              <span className="group-hover:translate-x-[-4px] transition-transform">➔</span>
            </div>
          </div>

          {/* كارت 4: قوائم شراء الزبائن والعملاء (REP-CUS-04) */}
          <div
            onClick={() => setSelectedReport('purchases')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                REP-CUS-04
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                قوائم شراء الزبائن والعملاء
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                سجل المبيعات وتفاصيل المواد المباعة
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-slate-700 group-hover:text-slate-900">
              <span>عرض الفواتير والمواد</span>
              <span className="group-hover:translate-x-[-4px] transition-transform">➔</span>
            </div>
          </div>

          {/* كارت 5: قوائم تسديد الزبائن والعملاء (REP-CUS-05) */}
          <div
            onClick={() => setSelectedReport('payments')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-800 p-5 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                REP-CUS-05
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900 group-hover:text-indigo-900 transition-colors">
                قوائم تسديد الزبائن والعملاء
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                سندات القبض والدفعات النقدية المسددة
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black text-slate-700 group-hover:text-slate-900">
              <span>عرض المقبوضات</span>
              <span className="group-hover:translate-x-[-4px] transition-transform">➔</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. المستوى الثالث: عرض تفاصيل وجداول التقرير المختار */}
      {selectedReport && (
        <div className="space-y-4 animate-fade-in">

          {/* ======================================================== */}
          {/* تقرير 1: دليل العملاء المعتمدين فقط (REP-CUS-01) */}
          {/* ======================================================== */}
          {selectedReport === 'directory' && (
            <div className="space-y-4">
              {/* شريط البحث المباشر */}
              <div className="bg-white rounded-2xl p-4 border border-slate-300 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:max-w-md">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ابحث باسم العميل أو رقم هاتفه..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-bold">المصنفين كعملاء:</span>
                  <span className="font-mono font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                    {filteredDirectoryData.length} عميل
                  </span>
                </div>
              </div>

              {/* جدول العملاء المعتمدين */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2.5 px-3 font-bold text-center w-12">ت</th>
                        <th className="py-2.5 px-4 font-bold">اسم العميل</th>
                        <th className="py-2.5 px-3 font-bold text-center">التصنيف</th>
                        <th className="py-2.5 px-3 font-bold">رقم الهاتف</th>
                        <th className="py-2.5 px-3 font-bold text-left">إجمالي المشتريات</th>
                        <th className="py-2.5 px-3 font-bold text-left">إجمالي المسدد</th>
                        <th className="py-2.5 px-3 font-bold text-left">صافي الدين المتبقي</th>
                        <th className="py-2.5 px-3 font-bold text-center">كشف الحساب</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredDirectoryData.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                            لا توجد أسماء عملاء مطابقة للبحث
                          </td>
                        </tr>
                      ) : (
                        filteredDirectoryData.map((c, idx) => (
                          <tr key={c.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-4 font-black text-slate-900 text-xs sm:text-sm">
                              {c.name}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {c.customerType === 'vip' ? (
                                <span className="bg-amber-50 border border-amber-300 text-amber-900 font-black px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1">
                                  <span>⭐</span>
                                  <span>عميل مميز (VIP)</span>
                                </span>
                              ) : (
                                <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1">
                                  <span>🏢</span>
                                  <span>عميل معتمد</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700" dir="ltr">
                              {c.phone1 || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                              {formatIQD(c.totalPurchases)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                              {formatIQD(c.totalPaid)} د.ع
                            </td>
                            <td className={`py-2.5 px-3 text-left font-mono font-black ${
                              (c.totalDebt || 0) > 0 ? 'text-rose-700' : 'text-slate-400'
                            }`}>
                              {formatIQD(c.totalDebt)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenCustomerStatement(c.name)}
                                className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <span>كشف الحساب</span>
                                <span>➔</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredDirectoryData.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                          <td colSpan={4} className="py-3 px-4 text-right">
                            المجموع الإجمالي ({filteredDirectoryData.length} عميل)
                          </td>
                          <td className="py-3 px-3 text-left font-mono">
                            {formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalPurchases || 0), 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-emerald-700">
                            {formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalPaid || 0), 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-rose-700">
                            {formatIQD(filteredDirectoryData.reduce((s, c) => s + (c.totalDebt || 0), 0))} د.ع
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* تقرير 2: كشف حساب عميل تفصيلي (REP-CUS-02) */}
          {/* ======================================================== */}
          {selectedReport === 'statement' && (
            <div className="space-y-4">
              {/* 1. حالة عدم اختيار عميل: شريط بحث متطور ومنظم تظهر بعده بطاقات العملاء بدقة */}
              {!statementCustomerName ? (
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-300 shadow-2xs space-y-5 animate-fade-in">
                  {/* شريط البحث المباشر في المنتصف */}
                  <div className="max-w-2xl mx-auto space-y-2 text-center">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto text-lg font-black">
                      🔍
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      البحث في كشف حساب العملاء والزبائن
                    </h3>
                    <p className="text-xs text-slate-500">
                      اكتب اسم العميل أو جزءاً منه أو رقم الهاتف لإظهار كشف حسابه وفواتيره وديونه
                    </p>

                    <div className="relative mt-3">
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                        🔍
                      </span>
                      <input
                        type="text"
                        value={statementSearchQuery}
                        onChange={(e) => setStatementSearchQuery(e.target.value)}
                        placeholder="ابحث باسم العميل أو رقم هاتفه..."
                        autoFocus
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-600 focus:bg-white rounded-2xl pr-11 pl-10 py-3 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none shadow-2xs transition-all"
                      />
                      {statementSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setStatementSearchQuery('')}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ظهور بطاقات العملاء بشكل منظم ومرتب بعد البحث */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-black text-slate-800">
                        {statementSearchQuery.trim() 
                          ? `نتائج البحث عن "${statementSearchQuery}" (${filteredStatementPickerCustomers.length} نتيجة):` 
                          : `العملاء الأكثر طلباً والمدينون (${filteredStatementPickerCustomers.length} عميل):`}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        انقر على أي بطاقة لعرض كشف الحساب فوراً
                      </span>
                    </div>

                    {filteredStatementPickerCustomers.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        لا توجد نتائج مطابقة لـ "{statementSearchQuery}"
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredStatementPickerCustomers.map((c) => {
                          const isVip = c.customerType === 'vip';
                          const isClient = c.customerType === 'client';
                          const hasDebt = (c.totalDebt || 0) > 0;

                          return (
                            <div
                              key={c.id || c.name}
                              onClick={() => {
                                setStatementCustomerName(c.name);
                                setStatementSearchQuery('');
                              }}
                              className="group bg-white hover:bg-indigo-50/50 rounded-2xl border-2 border-slate-200 hover:border-indigo-600 p-4 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between gap-3 active:scale-[0.99]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 border ${
                                    isVip 
                                      ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                      : isClient 
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                      : 'bg-slate-100 border-slate-200 text-slate-700'
                                  }`}>
                                    {isVip ? '⭐' : isClient ? '🏢' : '👤'}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-indigo-900 truncate">
                                      {c.name}
                                    </h4>
                                    <span className="text-[11px] text-slate-500 font-mono block" dir="ltr">
                                      {c.phone1 || 'بدون هاتف'}
                                    </span>
                                  </div>
                                </div>

                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border shrink-0 ${
                                  isVip 
                                    ? 'bg-amber-50 border-amber-300 text-amber-900' 
                                    : isClient 
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>
                                  {isVip ? 'VIP' : isClient ? 'عميل' : 'زبون'}
                                </span>
                              </div>

                              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-400 font-bold">الرصيد / الدين:</span>
                                  {hasDebt ? (
                                    <span className="font-mono font-black text-rose-700 text-xs">
                                      مطلوب {formatIQD(c.totalDebt)} د.ع
                                    </span>
                                  ) : (
                                    <span className="font-bold text-emerald-700 text-xs">
                                      مسدد بالكامل ✓
                                    </span>
                                  )}
                                </div>

                                <div className="px-2.5 py-1 rounded-lg bg-slate-100 group-hover:bg-indigo-600 text-slate-700 group-hover:text-white text-[11px] font-black transition-colors flex items-center gap-1">
                                  <span>كشف الحساب</span>
                                  <span>➔</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 2. شريط رأس أنيق وسريع عند اختيار العميل */
                <div className="bg-white rounded-2xl p-4 border border-slate-300 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-lg font-black shrink-0">
                      {statementSelectedCustomer?.customerType === 'vip' ? '⭐' : '🏢'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-bold">كشف حساب العميل:</span>
                        <h3 className="text-sm sm:text-base font-black text-slate-900">
                          {statementSelectedCustomer?.name || statementCustomerName}
                        </h3>
                        {statementSelectedCustomer?.customerType === 'vip' ? (
                          <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded border border-amber-300">
                            VIP
                          </span>
                        ) : statementSelectedCustomer?.customerType === 'client' ? (
                          <span className="bg-indigo-100 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-200">
                            عميل معتمد
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                        {statementSelectedCustomer?.phone1 ? `رقم الهاتف: ${statementSelectedCustomer.phone1}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStatementCustomerName('');
                        setStatementSearchQuery('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 border border-slate-300 active:scale-95"
                    >
                      <span>🔍</span>
                      <span>بحث عن عميل آخر</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleAllItems}
                      className="px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                    >
                      <span>{showAllItems ? 'طي كافة المواد ⤡' : 'عرض مواد كل الفواتير 🛒'}</span>
                    </button>
                  </div>
                </div>
              )}


              {/* إذا تم اختيار العميل: عرض تفاصيل كشف الحساب المتكامل */}
              {statementCustomerName && (
                <div className="space-y-4">
                  {/* بطاقة العميل التعريفية + 4 مؤشرات مالية */}
                  <div className="bg-white rounded-2xl border border-slate-300 p-4 sm:p-5 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-lg font-black shrink-0">
                          {statementSelectedCustomer?.customerType === 'vip' ? '⭐' : '🏢'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-black text-slate-900">
                              {statementSelectedCustomer?.name || statementCustomerName}
                            </h3>
                            {statementSelectedCustomer?.customerType === 'vip' ? (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded border border-amber-300">
                                عميل مميز (VIP)
                              </span>
                            ) : statementSelectedCustomer?.customerType === 'client' ? (
                              <span className="bg-indigo-100 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-200">
                                عميل معتمد
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                                زبون
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 font-mono">
                            <span>الهاتف: {statementSelectedCustomer?.phone1 || '—'}</span>
                            {statementSelectedCustomer?.phone2 && <span>• {statementSelectedCustomer.phone2}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {statementSummary.totalDebt > 0 ? (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5 text-right">
                            <span className="text-[10px] font-bold text-rose-600 block">صافي الرصيد المطلوب:</span>
                            <span className="text-sm font-black font-mono text-rose-700">
                              {formatIQD(statementSummary.totalDebt)} د.ع
                            </span>
                          </div>
                        ) : (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 text-right">
                            <span className="text-[10px] font-bold text-emerald-700 block">حالة الحساب:</span>
                            <span className="text-xs font-black text-emerald-800">
                              مسدد بالكامل ولا توجد ديون ✓
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4 بطاقات مؤشرات مالية */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">إجمالي المشتريات:</span>
                        <span className="text-sm sm:text-base font-black font-mono text-slate-900">
                          {formatIQD(statementSummary.totalPurchases)} د.ع
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                          {statementSummary.invoicesCount} فاتورة
                        </span>
                      </div>

                      <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-700 block mb-0.5">إجمالي المسدد:</span>
                        <span className="text-sm sm:text-base font-black font-mono text-emerald-700">
                          {formatIQD(statementSummary.totalPaid)} د.ع
                        </span>
                        <span className="text-[10px] text-emerald-600/80 block mt-0.5 font-mono">
                          {statementSummary.paymentsCount} دفعة
                        </span>
                      </div>

                      <div className={`rounded-xl p-3 border ${
                        statementSummary.totalDebt > 0 
                          ? 'bg-rose-50/60 border-rose-200' 
                          : 'bg-slate-50 border-slate-200'
                      }`}>
                        <span className={`text-[10px] font-bold block mb-0.5 ${
                          statementSummary.totalDebt > 0 ? 'text-rose-700' : 'text-slate-500'
                        }`}>
                          صافي الدين المتبقي:
                        </span>
                        <span className={`text-sm sm:text-base font-black font-mono ${
                          statementSummary.totalDebt > 0 ? 'text-rose-700' : 'text-slate-700'
                        }`}>
                          {formatIQD(statementSummary.totalDebt)} د.ع
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          {statementSummary.totalDebt > 0 ? 'ذمة قائمة معلقة' : 'لا توجد ذمم'}
                        </span>
                      </div>

                      <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-200">
                        <span className="text-[10px] font-bold text-indigo-700 block mb-0.5">نسبة سداد الحساب:</span>
                        <span className="text-sm sm:text-base font-black font-mono text-indigo-900">
                          {statementSummary.totalPurchases > 0 
                            ? `${Math.round((statementSummary.totalPaid / statementSummary.totalPurchases) * 100)}%` 
                            : '100%'}
                        </span>
                        <div className="w-full bg-indigo-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-600 h-1.5 rounded-full"
                            style={{ 
                              width: `${Math.min(100, statementSummary.totalPurchases > 0 ? (statementSummary.totalPaid / statementSummary.totalPurchases) * 100 : 100)}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* القسم 1: جدول فواتير ومشتريات العميل والمواد المباعة */}
                  <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">🛒 سجل فواتير المشتريات</span>
                        <span className="font-mono text-xs font-bold text-slate-500">
                          ({statementSales.length} فاتورة)
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                            <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                            <th className="py-2.5 px-3 font-bold">التاريخ</th>
                            <th className="py-2.5 px-3 font-bold text-center">نوع الفاتورة</th>
                            <th className="py-2.5 px-3 font-bold text-left">إجمالي الفاتورة</th>
                            <th className="py-2.5 px-3 font-bold text-left">المسدد</th>
                            <th className="py-2.5 px-3 font-bold text-left">المتبقي</th>
                            <th className="py-2.5 px-3 font-bold text-center">حالة السداد</th>
                            <th className="py-2.5 px-3 font-bold text-center">المواد المشتراة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {statementSales.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                                لا توجد فواتير مبيعات مسجلة لهذا العميل
                              </td>
                            </tr>
                          ) : (
                            statementSales.map((s, idx) => {
                              const isExpanded = expandedInvoices.has(s.id);
                              const itemsCount = s.items.length;

                              return (
                                <React.Fragment key={s.id || idx}>
                                  <tr className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                                      {idx + 1}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                                      #{s.invoiceNumber}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-slate-600">
                                      {s.dateStr || '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {s.isDebtInvoice || s.invoiceType === 'debt' ? (
                                        <span className="bg-amber-50 border border-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                          آجل (ذمة)
                                        </span>
                                      ) : (
                                        <span className="bg-blue-50 border border-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                          نقدي
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">
                                      {formatIQD(s.numericTotal)} د.ع
                                    </td>
                                    <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                                      {formatIQD(s.numericPaid)} د.ع
                                    </td>
                                    <td className={`py-2.5 px-3 text-left font-mono font-black ${
                                      s.numericRemaining > 0 ? 'text-rose-700' : 'text-slate-400'
                                    }`}>
                                      {formatIQD(s.numericRemaining)} د.ع
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {!s.isDebtInvoice && s.invoiceType !== 'debt' ? (
                                        <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                          نقدي مباشر ✓
                                        </span>
                                      ) : s.isSettled || s.numericRemaining <= 0 ? (
                                        <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                          مسدد بالكامل ✓
                                        </span>
                                      ) : s.isPartial || s.numericPaid > 0 ? (
                                        <span className="bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                          مسدد جزئياً
                                        </span>
                                      ) : (
                                        <span className="bg-rose-50 border border-rose-200 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                          غير مسدد (دين)
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => toggleInvoiceExpanded(s.id)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto ${
                                          isExpanded 
                                            ? 'bg-slate-900 text-white shadow-xs' 
                                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                                        }`}
                                      >
                                        <span>{itemsCount} مواد</span>
                                        <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                                      </button>
                                    </td>
                                  </tr>

                                  {/* الصف الموسع: تفاصيل المواد المشتراة داخل الفاتورة */}
                                  {isExpanded && (
                                    <tr className="bg-indigo-50/40 border-y-2 border-indigo-200">
                                      <td colSpan={9} className="p-3 sm:p-4">
                                        <div className="bg-white rounded-xl border border-indigo-200 p-3 sm:p-4 shadow-xs space-y-2">
                                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-base">📦</span>
                                              <h4 className="font-black text-xs sm:text-sm text-slate-900">
                                                المواد المباعة في الفاتورة #{s.invoiceNumber}
                                              </h4>
                                            </div>
                                            <span className="font-mono text-xs font-bold text-slate-500">
                                              {itemsCount} أصناف • إجمالي: {s.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)} قطعة/متر
                                            </span>
                                          </div>

                                          {s.items.length === 0 ? (
                                            <p className="text-center text-slate-400 py-3 text-xs">
                                              لا توجد تفاصيل مواد مسجلة في هذه الفاتورة
                                            </p>
                                          ) : (
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-right border-collapse text-xs">
                                                <thead>
                                                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                                    <th className="py-1.5 px-2.5 font-bold text-center w-8">ت</th>
                                                    <th className="py-1.5 px-2.5 font-bold">اسم المادة / الصنف</th>
                                                    <th className="py-1.5 px-2.5 font-bold">الباركود / الكود</th>
                                                    <th className="py-1.5 px-2.5 font-bold text-center">الكمية</th>
                                                    <th className="py-1.5 px-2.5 font-bold text-left">سعر المفرد</th>
                                                    <th className="py-1.5 px-2.5 font-bold text-left">الإجمالي</th>
                                                    <th className="py-1.5 px-2.5 font-bold text-center">المصدر</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {s.items.map((it, itIdx) => {
                                                    const qty = Number(it.quantity) || 1;
                                                    const unitP = Number(it.unitPrice) || 0;
                                                    const lineTot = it.lineTotal !== undefined ? Number(it.lineTotal) : qty * unitP;
                                                    const unitLabel = it.sellMode === 'meter' ? 'متر' : 'قطعة';

                                                    return (
                                                      <tr key={itIdx} className="hover:bg-slate-50">
                                                        <td className="py-1.5 px-2.5 text-center font-bold text-slate-400 font-mono">
                                                          {itIdx + 1}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 font-black text-slate-900">
                                                          {it.name || 'مادة بدون اسم'}
                                                          {it.cameraType && (
                                                            <span className="text-[10px] text-slate-500 font-normal mr-2">({it.cameraType})</span>
                                                          )}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 font-mono text-slate-500 text-[11px]">
                                                          {it.sku || '—'}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-center font-mono font-black text-slate-800">
                                                          {qty} {unitLabel}
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-left font-mono font-bold text-slate-700">
                                                          {formatIQD(unitP)} د.ع
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-left font-mono font-black text-slate-900">
                                                          {formatIQD(lineTot)} د.ع
                                                        </td>
                                                        <td className="py-1.5 px-2.5 text-center text-[10px] text-slate-500">
                                                          {it.source === 'warehouse' ? 'المخزن' : it.source === 'custody' ? 'عهدة فني' : 'المحل'}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
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
                        {statementSales.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                              <td colSpan={4} className="py-3 px-3 text-right">
                                المجموع ({statementSales.length} فاتورة)
                              </td>
                              <td className="py-3 px-3 text-left font-mono">
                                {formatIQD(statementSummary.totalPurchases)} د.ع
                              </td>
                              <td className="py-3 px-3 text-left font-mono text-emerald-700">
                                {formatIQD(statementSales.reduce((s, p) => s + p.numericPaid, 0))} د.ع
                              </td>
                              <td className="py-3 px-3 text-left font-mono text-rose-700">
                                {formatIQD(statementSummary.totalDebt)} د.ع
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* القسم 2: جدول سندات وتسديدات العميل */}
                  <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">💵 سجل الدفعات والمقبوضات المسددة</span>
                        <span className="font-mono text-xs font-bold text-slate-500">
                          ({statementPayments.length} حركة سداد)
                        </span>
                      </div>
                      <span className="text-xs font-black text-emerald-700 font-mono">
                        إجمالي المسدد: {formatIQD(statementSummary.totalPaid)} د.ع
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                            <th className="py-2.5 px-3 font-bold">تاريخ السداد</th>
                            <th className="py-2.5 px-3 font-bold">رقم الفاتورة / السند</th>
                            <th className="py-2.5 px-3 font-bold text-center">نوع الحركة</th>
                            <th className="py-2.5 px-3 font-bold text-left">المبلغ المسدد</th>
                            <th className="py-2.5 px-3 font-bold text-center">طريقة الدفع</th>
                            <th className="py-2.5 px-3 font-bold">المستلم</th>
                            <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {statementPayments.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                                لا توجد حركات تسديد مسجلة لهذا العميل حتى الآن
                              </td>
                            </tr>
                          ) : (
                            statementPayments.map((p, idx) => (
                              <tr key={p.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-700">
                                  {p.date || '—'}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                                  {p.invoiceNumber}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    p.paymentType === 'debt_payment'
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                      : p.paymentType === 'cash_sale'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                      : 'bg-amber-50 border-amber-200 text-amber-900'
                                  }`}>
                                    {p.typeLabel}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700 text-xs sm:text-sm">
                                  {formatIQD(p.amount)} د.ع
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                                  {p.paymentMethod || 'نقدي'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-medium">
                                  {p.receivedBy || 'المسؤول'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                                  {p.notes || '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {statementPayments.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                              <td colSpan={4} className="py-3 px-3 text-right">
                                المجموع ({statementPayments.length} حركة تسديد)
                              </td>
                              <td className="py-3 px-3 text-left font-mono text-emerald-700">
                                {formatIQD(statementSummary.totalPaid)} د.ع
                              </td>
                              <td colSpan={3}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* تقرير 3: ديون الزبائن والعملاء (REP-CUS-03) */}
          {/* ======================================================== */}
          {selectedReport === 'debts' && (
            <div className="space-y-4">
              {/* شريط الفلتر والبحث السريع */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-300 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">بحث باسم المدين أو هاتفه:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ابحث بالاسم أو رقم الهاتف..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">تحديد شخص معين:</label>
                    <select
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    >
                      <option value="all">كافة المدينين المطلوبة منهم ديون ({filteredDebtsData.length})</option>
                      {debtorCustomersList.map((c) => (
                        <option key={c.name} value={c.name}>{c.name} ({formatIQD(c.totalDebt)} د.ع)</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 self-end">
                    <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-left">
                      <span className="text-[10px] font-bold text-rose-600 block">إجمالي الديون المطلوبة:</span>
                      <span className="text-sm font-black font-mono text-rose-700">
                        {formatIQD(filteredDebtsData.reduce((s, c) => s + (c.totalDebt || 0), 0))} د.ع
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* جدول ديون الزبائن والعملاء */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    عدد الأشخاص المدينين: <strong className="font-mono text-slate-900">{filteredDebtsData.length}</strong>
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    إجمالي الديون القائمة: <strong className="font-mono text-rose-700 font-black">{formatIQD(filteredDebtsData.reduce((s, c) => s + (c.totalDebt || 0), 0))} د.ع</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                        <th className="py-2.5 px-3 font-bold">اسم الزبون / العميل</th>
                        <th className="py-2.5 px-3 font-bold text-center">نوع الحساب</th>
                        <th className="py-2.5 px-3 font-bold">رقم الهاتف</th>
                        <th className="py-2.5 px-3 font-bold text-center">الفواتير المعلقة</th>
                        <th className="py-2.5 px-3 font-bold text-left">إجمالي المشتريات</th>
                        <th className="py-2.5 px-3 font-bold text-left">إجمالي المسدد</th>
                        <th className="py-2.5 px-3 font-bold text-left">صافي الدين المتبقي</th>
                        <th className="py-2.5 px-3 font-bold text-center">نسبة السداد</th>
                        <th className="py-2.5 px-3 font-bold text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredDebtsData.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                            🎉 لا توجد ديون معلقة بذمة أي زبون أو عميل! كافة الحسابات مسددة بالكامل.
                          </td>
                        </tr>
                      ) : (
                        filteredDebtsData.map((c, idx) => {
                          const tot = Number(c.totalPurchases || 0);
                          const pd = Number(c.totalPaid || 0);
                          const pct = tot > 0 ? Math.round((pd / tot) * 100) : 0;

                          return (
                            <tr key={c.id || idx} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                                {c.name}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {c.customerType === 'vip' ? (
                                  <span className="bg-amber-50 border border-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                    عميل مميز ⭐
                                  </span>
                                ) : c.customerType === 'client' ? (
                                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                    عميل 🏢
                                  </span>
                                ) : (
                                  <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px]">
                                    زبون 👤
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700" dir="ltr">
                                {c.phone1 || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-rose-700">
                                {c.unpaidInvoicesCount || 1}
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-800">
                                {formatIQD(c.totalPurchases)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                                {formatIQD(c.totalPaid)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-black text-rose-700 text-xs sm:text-sm">
                                {formatIQD(c.totalDebt)} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="font-mono text-[11px] font-bold text-slate-600">{pct}%</span>
                                  <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="bg-emerald-500 h-1.5 rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCustomerStatement(c.name)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                                >
                                  <span>كشف الحساب</span>
                                  <span>➔</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredDebtsData.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                          <td colSpan={4} className="py-3 px-3 text-right">
                            الإجمالي ({filteredDebtsData.length} شخص مدين)
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-rose-700">
                            {filteredDebtsData.reduce((s, c) => s + (c.unpaidInvoicesCount || 0), 0)}
                          </td>
                          <td className="py-3 px-3 text-left font-mono">
                            {formatIQD(filteredDebtsData.reduce((s, c) => s + (c.totalPurchases || 0), 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-emerald-700">
                            {formatIQD(filteredDebtsData.reduce((s, c) => s + (c.totalPaid || 0), 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-rose-700">
                            {formatIQD(filteredDebtsData.reduce((s, c) => s + (c.totalDebt || 0), 0))} د.ع
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* تقرير 4: قوائم شراء الزبائن والعملاء (REP-CUS-04) */}
          {/* ======================================================== */}
          {selectedReport === 'purchases' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-300 shadow-2xs space-y-4">
                <div className="flex items-center justify-end pb-2 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={handleToggleAllItems}
                    className="px-3 py-1.5 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs"
                  >
                    <span>{showAllItems ? 'طي كافة المواد ⤡' : 'عرض ما تم شراؤه للكل 🛒'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">بحث سريع:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="بحث بالاسم، الفاتورة أو المادة..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">الزبون / العميل:</label>
                    <select
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    >
                      <option value="all">كافة الزبائن والعملاء</option>
                      {allCustomerNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">نوع الفاتورة:</label>
                    <select
                      value={purchasesTypeFilter}
                      onChange={(e) => setPurchasesTypeFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    >
                      <option value="all">كافة الفواتير (نقدي وآجل)</option>
                      <option value="debt">فواتير آجلة (ذمم)</option>
                      <option value="cash">فواتير نقدية</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500">فترة:</span>
                      <button type="button" onClick={() => handleSetDatePreset('today')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">اليوم</button>
                      <button type="button" onClick={() => handleSetDatePreset('week')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">أسبوع</button>
                      <button type="button" onClick={() => handleSetDatePreset('month')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">شهر</button>
                      <button type="button" onClick={() => handleSetDatePreset('all')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">الكل</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-1 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-1 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-slate-700">
                    عدد الفواتير: <strong className="font-mono text-slate-900">{filteredPurchasesData.length}</strong>
                  </span>
                  <span className="font-bold text-slate-700">
                    إجمالي المبيعات: <strong className="font-mono text-slate-900 font-black">{formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericTotal, 0))} د.ع</strong>
                  </span>
                  <span className="font-bold text-slate-700">
                    المسدد: <strong className="font-mono text-emerald-700 font-black">{formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericPaid, 0))} د.ع</strong>
                  </span>
                  <span className="font-bold text-slate-700">
                    المتبقي: <strong className="font-mono text-rose-700 font-black">{formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericRemaining, 0))} د.ع</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                        <th className="py-2.5 px-3 font-bold">رقم الفاتورة</th>
                        <th className="py-2.5 px-3 font-bold">التاريخ</th>
                        <th className="py-2.5 px-3 font-bold">اسم الزبون / العميل</th>
                        <th className="py-2.5 px-3 font-bold">الهاتف</th>
                        <th className="py-2.5 px-3 font-bold text-center">النوع</th>
                        <th className="py-2.5 px-3 font-bold text-left">إجمالي الفاتورة</th>
                        <th className="py-2.5 px-3 font-bold text-left">المسدد</th>
                        <th className="py-2.5 px-3 font-bold text-left">المتبقي</th>
                        <th className="py-2.5 px-3 font-bold text-center">حالة السداد</th>
                        <th className="py-2.5 px-3 font-bold text-center">المواد المشتراة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredPurchasesData.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-10 text-center text-slate-400 font-medium">
                            لا توجد فواتير مبيعات مطابقة لمعايير البحث
                          </td>
                        </tr>
                      ) : (
                        filteredPurchasesData.map((s, idx) => {
                          const isExpanded = expandedInvoices.has(s.id);
                          const itemsCount = s.items.length;

                          return (
                            <React.Fragment key={s.id || idx}>
                              <tr className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                                  #{s.invoiceNumber}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-600">
                                  {s.dateStr || '—'}
                                </td>
                                <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                                  {s.customerName}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-slate-600" dir="ltr">
                                  {s.customerPhone || '—'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {s.isDebtInvoice || s.invoiceType === 'debt' ? (
                                    <span className="bg-amber-50 border border-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                      آجل (ذمة)
                                    </span>
                                  ) : (
                                    <span className="bg-blue-50 border border-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded text-[10px]">
                                      نقدي
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-left font-mono font-black text-slate-900">
                                  {formatIQD(s.numericTotal)} د.ع
                                </td>
                                <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700">
                                  {formatIQD(s.numericPaid)} د.ع
                                </td>
                                <td className={`py-2.5 px-3 text-left font-mono font-black ${
                                  s.numericRemaining > 0 ? 'text-rose-700' : 'text-slate-400'
                                }`}>
                                  {formatIQD(s.numericRemaining)} د.ع
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {!s.isDebtInvoice && s.invoiceType !== 'debt' ? (
                                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                      نقدي مباشر ✓
                                    </span>
                                  ) : s.isSettled || s.numericRemaining <= 0 ? (
                                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                      مسدد بالكامل ✓
                                    </span>
                                  ) : s.isPartial || s.numericPaid > 0 ? (
                                    <span className="bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                      مسدد جزئياً
                                    </span>
                                  ) : (
                                    <span className="bg-rose-50 border border-rose-200 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                      غير مسدد (دين)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleInvoiceExpanded(s.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto ${
                                      isExpanded 
                                        ? 'bg-slate-900 text-white shadow-xs' 
                                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                                    }`}
                                  >
                                    <span>{itemsCount} مواد</span>
                                    <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-indigo-50/40 border-y-2 border-indigo-200">
                                  <td colSpan={11} className="p-3 sm:p-4">
                                    <div className="bg-white rounded-xl border border-indigo-200 p-3 sm:p-4 shadow-xs space-y-2">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-base">🛒</span>
                                          <h4 className="font-black text-xs sm:text-sm text-slate-900">
                                            المواد المباعة في الفاتورة #{s.invoiceNumber}
                                          </h4>
                                        </div>
                                        <span className="font-mono text-xs font-bold text-slate-500">
                                          {itemsCount} أصناف • إجمالي: {s.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)} قطعة/متر
                                        </span>
                                      </div>

                                      {s.items.length === 0 ? (
                                        <p className="text-center text-slate-400 py-3 text-xs">
                                          لا توجد تفاصيل مواد مسجلة في هذه الفاتورة
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-right border-collapse text-xs">
                                            <thead>
                                              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                                <th className="py-1.5 px-2.5 font-bold text-center w-8">ت</th>
                                                <th className="py-1.5 px-2.5 font-bold">اسم المادة / الصنف</th>
                                                <th className="py-1.5 px-2.5 font-bold">الباركود / الكود</th>
                                                <th className="py-1.5 px-2.5 font-bold text-center">الكمية</th>
                                                <th className="py-1.5 px-2.5 font-bold text-left">سعر المفرد</th>
                                                <th className="py-1.5 px-2.5 font-bold text-left">الإجمالي</th>
                                                <th className="py-1.5 px-2.5 font-bold text-center">المصدر</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {s.items.map((it, itIdx) => {
                                                const qty = Number(it.quantity) || 1;
                                                const unitP = Number(it.unitPrice) || 0;
                                                const lineTot = it.lineTotal !== undefined ? Number(it.lineTotal) : qty * unitP;
                                                const unitLabel = it.sellMode === 'meter' ? 'متر' : 'قطعة';

                                                return (
                                                  <tr key={itIdx} className="hover:bg-slate-50">
                                                    <td className="py-1.5 px-2.5 text-center font-bold text-slate-400 font-mono">
                                                      {itIdx + 1}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 font-black text-slate-900">
                                                      {it.name || 'مادة بدون اسم'}
                                                      {it.cameraType && (
                                                        <span className="text-[10px] text-slate-500 font-normal mr-2">({it.cameraType})</span>
                                                      )}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 font-mono text-slate-500 text-[11px]">
                                                      {it.sku || '—'}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-center font-mono font-black text-slate-800">
                                                      {qty} {unitLabel}
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-left font-mono font-bold text-slate-700">
                                                      {formatIQD(unitP)} د.ع
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-left font-mono font-black text-slate-900">
                                                      {formatIQD(lineTot)} د.ع
                                                    </td>
                                                    <td className="py-1.5 px-2.5 text-center text-[10px] text-slate-500">
                                                      {it.source === 'warehouse' ? 'المخزن' : it.source === 'custody' ? 'عهدة فني' : 'المحل'}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
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
                    {filteredPurchasesData.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                          <td colSpan={6} className="py-3 px-3 text-right">
                            الإجمالي ({filteredPurchasesData.length} فاتورة)
                          </td>
                          <td className="py-3 px-3 text-left font-mono">
                            {formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericTotal, 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-emerald-700">
                            {formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericPaid, 0))} د.ع
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-rose-700">
                            {formatIQD(filteredPurchasesData.reduce((s, p) => s + p.numericRemaining, 0))} د.ع
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* تقرير 5: قوائم تسديد الزبائن والعملاء (REP-CUS-05) */}
          {/* ======================================================== */}
          {selectedReport === 'payments' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-300 shadow-2xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">بحث سريع:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="بحث بالاسم أو رقم السند..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">الزبون / العميل:</label>
                    <select
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    >
                      <option value="all">كافة الزبائن والعملاء</option>
                      {allCustomerNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">نوع السداد:</label>
                    <select
                      value={paymentTypeFilter}
                      onChange={(e) => setPaymentTypeFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800"
                    >
                      <option value="all">كافة المقبوضات</option>
                      <option value="debt_payment">تسديد ديون فواتير</option>
                      <option value="down_payment">دفعات نقدية مقدمة</option>
                      <option value="cash_sale">سداد نقدي مباشر</option>
                      <option value="income_receipt">سندات قبض وإيراد</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500">فترة:</span>
                      <button type="button" onClick={() => handleSetDatePreset('today')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">اليوم</button>
                      <button type="button" onClick={() => handleSetDatePreset('week')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">أسبوع</button>
                      <button type="button" onClick={() => handleSetDatePreset('month')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">شهر</button>
                      <button type="button" onClick={() => handleSetDatePreset('all')} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300">الكل</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-1 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-slate-50 border border-slate-300 rounded-xl px-2 py-1 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-300 shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    عدد حركات السداد: <strong className="font-mono text-slate-900">{filteredPaymentsData.length}</strong>
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    إجمالي المبالغ المسددة: <strong className="font-mono text-emerald-700 font-black">{formatIQD(filteredPaymentsData.reduce((s, p) => s + p.amount, 0))} د.ع</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2.5 px-3 font-bold text-center w-10">ت</th>
                        <th className="py-2.5 px-3 font-bold">تاريخ السداد</th>
                        <th className="py-2.5 px-3 font-bold">اسم الزبون / العميل</th>
                        <th className="py-2.5 px-3 font-bold">رقم الفاتورة / السند</th>
                        <th className="py-2.5 px-3 font-bold text-center">نوع الحركة</th>
                        <th className="py-2.5 px-3 font-bold text-left">المبلغ المسدد</th>
                        <th className="py-2.5 px-3 font-bold text-center">طريقة الدفع</th>
                        <th className="py-2.5 px-3 font-bold">المستلم</th>
                        <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredPaymentsData.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-slate-400 font-medium">
                            لا توجد حركات تسديد مطابقة لمعايير البحث
                          </td>
                        </tr>
                      ) : (
                        filteredPaymentsData.map((p, idx) => (
                          <tr key={p.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {p.date || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-black text-slate-900 text-xs sm:text-sm">
                              {p.customerName}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {p.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                p.paymentType === 'debt_payment'
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                  : p.paymentType === 'cash_sale'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}>
                                {p.typeLabel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-700 text-xs sm:text-sm">
                              {formatIQD(p.amount)} د.ع
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                              {p.paymentMethod || 'نقدي'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                              {p.receivedBy || 'المسؤول'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                              {p.notes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredPaymentsData.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-800 font-black text-slate-900">
                          <td colSpan={5} className="py-3 px-3 text-right">
                            الإجمالي ({filteredPaymentsData.length} حركة تسديد)
                          </td>
                          <td className="py-3 px-3 text-left font-mono text-emerald-700">
                            {formatIQD(filteredPaymentsData.reduce((s, p) => s + p.amount, 0))} د.ع
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* المودال الشامل للطباعة والتصدير A4 عبر PrintableReportDocument */}
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
