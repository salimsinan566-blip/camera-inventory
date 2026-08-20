import React, { useState, useMemo } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import { useCashReconciliation } from '../hooks/useCashReconciliation';
import { useIncomes } from '../hooks/useIncomes';
import { deleteIncome } from '../services/incomesService';
import { useUI } from '../contexts/UIContext';
import CashReconciliationModal from './CashReconciliationModal';
import AddIncomeModal from './AddIncomeModal';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

export default function IncomeReportTab({ sales = [], expenses = [], onViewSale }) {
  const { purchases, debtPayments: supplierDebtPayments } = usePurchases();
  const { latestReconciliation } = useCashReconciliation();
  const { incomes } = useIncomes();
  const { toast, confirm } = useUI();

  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'sales' | 'debt_payments' | 'incomes' | 'expenses' | 'purchases' | 'gifts'
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [editingIncomeItem, setEditingIncomeItem] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Filter Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const date = toDateSafe(s.createdAt);
      if (!date) return true;
      const dateStr = date.toISOString().slice(0, 10);
      const monthStr = date.toISOString().slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return date >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [sales, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dateStr = (e.date || e.createdAt || '').slice(0, 10);
      const monthStr = (e.date || e.createdAt || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const eDate = new Date(dateStr);
        return eDate >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [expenses, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Purchases (Cash paid)
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const dateStr = (p.date || '').slice(0, 10);
      const monthStr = (p.date || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const pDate = new Date(dateStr);
        return pDate >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true;
    });
  }, [purchases, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Supplier Debt Payments
  const filteredSupplierPayments = useMemo(() => {
    return supplierDebtPayments.filter((p) => {
      const dateStr = (p.date || '').slice(0, 10);
      const monthStr = (p.date || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const pDate = new Date(dateStr);
        return pDate >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true;
    });
  }, [supplierDebtPayments, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Manual Incomes (Old invoices, manual cash deposits, external services)
  const filteredIncomes = useMemo(() => {
    return incomes.filter((inc) => {
      const dateStr = (inc.date || inc.createdAt || '').slice(0, 10);
      const monthStr = (inc.date || inc.createdAt || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const incDate = new Date(dateStr);
        return incDate >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [incomes, period, customFrom, customTo, todayStr, currentMonthStr]);

  const totalManualIncomesAmount = useMemo(() => {
    return filteredIncomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
  }, [filteredIncomes]);

  // Sales Revenue
  const totalSalesRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Cash directly paid on cash sales
  const directCashSales = useMemo(() => {
    return filteredSales
      .filter((s) => s.invoiceType === 'cash' || !s.invoiceType)
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Customer debt repayments collected
  const customerDebtRepayments = useMemo(() => {
    let sum = 0;
    filteredSales.forEach((s) => {
      if (s.invoiceType === 'debt') {
        sum += Number(s.paidAmount || 0);
      }
    });
    return sum;
  }, [filteredSales]);

  // Total Inflow (Direct cash sales + debt collections + manual direct incomes/old invoices)
  const totalCashCollected = directCashSales + customerDebtRepayments + totalManualIncomesAmount;

  // Remaining Customer Debts
  const totalRemainingCustomerDebt = useMemo(() => {
    return filteredSales
      .filter((s) => s.invoiceType === 'debt' && !s.isSettled)
      .reduce((sum, s) => sum + (Number(s.remainingDebt ?? (Number(s.total || 0) - Number(s.paidAmount || 0))) || 0), 0);
  }, [filteredSales]);

  // Expenses Outflow
  const totalExpensesAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  // Cash Purchases Outflow (Cash paid upon purchase + supplier debt payments)
  const totalCashPurchasesAmount = useMemo(() => {
    const directPurchasesCash = filteredPurchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
    const supplierDebtsPaid = filteredSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return directPurchasesCash + supplierDebtsPaid;
  }, [filteredPurchases, filteredSupplierPayments]);

  // Free Promotional Gifts Cost
  const totalGiftsCost = useMemo(() => {
    let cost = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          cost += wholesale * qty;
        }
      });
    });
    return cost;
  }, [filteredSales]);

  // Total Outflows (Expenses + Purchases Paid in Cash + Free Gifts Cost)
  const totalCashOutflows = totalExpensesAmount + totalCashPurchasesAmount + totalGiftsCost;

  // Net Cash Flow for the Selected Period
  const netCashFlowForPeriod = totalCashCollected - totalCashOutflows;

  // Live Drawer Cash (حساب الرصيد الفعلي التراكمي في الصندوق بناءً على آخر تسوية)
  const liveDrawerCash = useMemo(() => {
    if (latestReconciliation && latestReconciliation.date) {
      const recDate = new Date(latestReconciliation.date);
      const baseAmount = Number(latestReconciliation.actualCashAmount) || 0;

      // Inflow since reconciliation
      let inflowSince = 0;
      sales.forEach((s) => {
        const sDate = toDateSafe(s.createdAt);
        if (sDate && sDate > recDate) {
          if (s.invoiceType === 'cash' || !s.invoiceType) {
            inflowSince += Number(s.total || 0);
          } else if (s.invoiceType === 'debt') {
            inflowSince += Number(s.paidAmount || 0);
          }
        }
      });

      incomes.forEach((inc) => {
        const createdDate = inc.createdAt ? new Date(inc.createdAt) : null;
        const docDate = inc.date ? new Date(inc.date) : null;
        if ((createdDate && createdDate > recDate) || (docDate && docDate > recDate)) {
          inflowSince += Number(inc.amount || 0);
        }
      });

      // Outflows since reconciliation (Expenses + Cash Purchases)
      let outflowSince = 0;
      expenses.forEach((e) => {
        const eDate = new Date(e.date || e.createdAt);
        if (eDate > recDate) {
          outflowSince += Number(e.amount || 0);
        }
      });

      purchases.forEach((p) => {
        const pDate = new Date(p.date || p.createdAt);
        if (pDate > recDate) {
          outflowSince += Number(p.paidAmount || 0);
        }
      });

      supplierDebtPayments.forEach((p) => {
        const pDate = new Date(p.date);
        if (pDate > recDate) {
          outflowSince += Number(p.amount || 0);
        }
      });

      return baseAmount + inflowSince - outflowSince;
    }

    // If no reconciliation exists, calculate total cumulative cash
    const allDirectCashSales = sales
      .filter((s) => s.invoiceType === 'cash' || !s.invoiceType)
      .reduce((sum, s) => sum + Number(s.total || 0), 0);

    const allDebtPayments = sales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);

    const allManualIncomes = incomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
    const allExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const allCashPurchases = purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
    const allSupplierDebtPayments = supplierDebtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return (allDirectCashSales + allDebtPayments + allManualIncomes) - (allExpenses + allCashPurchases + allSupplierDebtPayments);
  }, [sales, expenses, purchases, supplierDebtPayments, incomes, latestReconciliation]);

  // Unified Income Ledger Transactions List
  const unifiedTransactions = useMemo(() => {
    const list = [];

    // 1. Sales Invoices
    filteredSales.forEach((s) => {
      const date = toDateSafe(s.createdAt);
      const isCash = s.invoiceType === 'cash' || !s.invoiceType;

      list.push({
        id: `sale-${s.id}`,
        type: isCash ? 'sale_cash' : 'sale_debt',
        typeLabel: isCash ? 'بيع نقدي' : 'بيع آجل (دين)',
        date: date,
        dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
        refNumber: `#${s.invoiceNumber}`,
        title: s.customerName ? `فاتورة مبيعات (${s.customerName})` : 'فاتورة مبيعات نقدية',
        category: isCash ? 'مبيعات نقدية' : 'مبيعات ذمم',
        inflow: Number(s.total || 0),
        outflow: 0,
        paidNow: isCash ? Number(s.total || 0) : Number(s.paidAmount || 0),
        remaining: isCash ? 0 : Number(s.remainingDebt || (Number(s.total || 0) - Number(s.paidAmount || 0))),
        saleObj: s
      });

      // Free gift items given in this sale
      (s.items || []).forEach((item) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          const giftCost = wholesale * qty;
          list.push({
            id: `gift-${s.id}-${item.productId || item.sku}-${Math.random()}`,
            type: 'gift_cost',
            typeLabel: 'هدية مجانية (ترويج)',
            date: date,
            dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
            refNumber: `#${s.invoiceNumber}`,
            title: `مادة مجانية (${item.name}) للعميل ${s.customerName || 'نقدي'}`,
            category: 'هدايا وعروض ترويجية',
            inflow: 0,
            outflow: giftCost,
            paidNow: giftCost,
            remaining: 0,
            saleObj: s
          });
        }
      });
    });

    // 2. Manual Incomes & Old Invoices (Direct Inflow)
    filteredIncomes.forEach((inc) => {
      const incDate = inc.date ? new Date(inc.date) : new Date();
      list.push({
        id: `inc-${inc.id}`,
        type: 'manual_income',
        typeLabel: 'إيراد / فاتورة قديمة',
        date: incDate,
        dateFormatted: inc.date ? inc.date.slice(0, 10) : '—',
        refNumber: 'إيراد مكتب',
        title: `${inc.title}${inc.payerName ? ` (${inc.payerName})` : ''}`,
        category: inc.category || 'فواتير قديمة سابقة',
        inflow: Number(inc.amount || 0),
        outflow: 0,
        paidNow: Number(inc.amount || 0),
        remaining: 0,
        incomeObj: inc
      });
    });

    // 3. Expenses
    filteredExpenses.forEach((e) => {
      const eDate = e.date ? new Date(e.date) : new Date();
      list.push({
        id: `exp-${e.id}`,
        type: 'expense',
        typeLabel: 'سند صرف',
        date: eDate,
        dateFormatted: e.date || '—',
        refNumber: 'صرف',
        title: `${e.title} (${e.buyerName || 'المحل'})`,
        category: e.category || 'مصاريف عامة',
        inflow: 0,
        outflow: Number(e.amount || 0),
        paidNow: Number(e.amount || 0),
        remaining: 0,
        expenseObj: e
      });
    });

    // 4. Purchases Cash Outflows
    filteredPurchases.forEach((p) => {
      const pDate = p.date ? new Date(p.date) : new Date();
      const numPaid = Number(p.paidAmount || 0);
      if (numPaid > 0) {
        list.push({
          id: `pur-${p.id}`,
          type: 'purchase_cash',
          typeLabel: 'شراء بضاعة (نقدي)',
          date: pDate,
          dateFormatted: p.date ? p.date.slice(0, 10) : '—',
          refNumber: p.invoiceNumber ? `شراء #${p.invoiceNumber}` : 'شراء بضاعة',
          title: `فاتورة شراء من المورد (${p.supplierName})`,
          category: 'مشتريات مخزون',
          inflow: 0,
          outflow: numPaid,
          paidNow: numPaid,
          remaining: Number(p.remainingDebt || 0),
          purchaseObj: p
        });
      }
    });

    // 5. Supplier Debt Payments
    filteredSupplierPayments.forEach((sp) => {
      const spDate = sp.date ? new Date(sp.date) : new Date();
      list.push({
        id: `sup-pay-${sp.id}`,
        type: 'supplier_payment',
        typeLabel: 'تسديد دين مورد',
        date: spDate,
        dateFormatted: sp.date ? sp.date.slice(0, 10) : '—',
        refNumber: 'تسديد مورد',
        title: `دفعة دين للمورد (${sp.supplierName})`,
        category: 'تسديد ديون موردين',
        inflow: 0,
        outflow: Number(sp.amount || 0),
        paidNow: Number(sp.amount || 0),
        remaining: 0
      });
    });

    // Sort newest first
    return list.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [filteredSales, filteredIncomes, filteredExpenses, filteredPurchases, filteredSupplierPayments]);

  // Filtered Ledger Transactions
  const displayedTransactions = useMemo(() => {
    return unifiedTransactions.filter((tx) => {
      if (filterType === 'sales' && !tx.type.startsWith('sale_')) return false;
      if (filterType === 'debt_payments' && tx.type !== 'debt_payment') return false;
      if (filterType === 'incomes' && tx.type !== 'manual_income') return false;
      if (filterType === 'expenses' && tx.type !== 'expense') return false;
      if (filterType === 'purchases' && tx.type !== 'purchase_cash' && tx.type !== 'supplier_payment') return false;
      if (filterType === 'gifts' && tx.type !== 'gift_cost') return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = tx.title.toLowerCase().includes(q);
        const refMatch = String(tx.refNumber).toLowerCase().includes(q);
        const catMatch = tx.category.toLowerCase().includes(q);
        if (!titleMatch && !refMatch && !catMatch) return false;
      }
      return true;
    });
  }, [unifiedTransactions, filterType, searchQuery]);

  const getPeriodLabel = () => {
    if (period === 'today') return 'اليوم';
    if (period === 'week') return 'آخر 7 أيام';
    if (period === 'month') return 'الشهر الحالي';
    if (period === 'all') return 'السجل الكامل';
    return `من ${customFrom || 'البداية'} إلى ${customTo || 'الآن'}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">كشف المقبوضات والتدفق المالي</span>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">صفحة تقرير الدخل والصندوق</h2>
        </div>

        {/* Action Buttons & Period Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Add Manual Income / Old Invoice Button */}
          <button
            onClick={() => setShowAddIncomeModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden"
            title="إضافة مبلغ نقدي مباشر لدخل وصندوق المكتب (فاتورة قديمة، إيداع، إيراد صيانة...)"
          >
            <span>📥</span>
            <span>إضافة مبلغ للدخل / فاتورة قديمة</span>
          </button>

          {/* Cash Reconciliation Trigger Button */}
          <button
            onClick={() => setShowReconciliationModal(true)}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs print:hidden"
            title="مطابقة وتثبيت النقد الفعلي الموجود بالقاصة كنقطة بداية"
          >
            <span>⚖️</span>
            <span>تسوية رصيد القاصة</span>
          </button>

          <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'today' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الأسبوع
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الشهر الحالي
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              مخصص
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-3 text-xs font-bold text-slate-700">
          <span>من تاريخ:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
          />
          <span>إلى تاريخ:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
          />
        </div>
      )}

      {/* 4 Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Sales Invoiced */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي قيمة المبيعات</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
              💰
            </span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-950 block">
              {formatIQD(totalSalesRevenue)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {filteredSales.length} فاتورة بيع مسجلة
            </span>
          </div>
        </div>

        {/* Card 2: Cash Inflow Collected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">المقبوضات النقدية الداخلة</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
              📥
            </span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-700 block">
              +{formatIQD(totalCashCollected)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              مبيعات نقدية + تسديدات ديون
            </span>
          </div>
        </div>

        {/* Card 3: Total Expenses, Cash Purchases & Gifts Outflows */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800">المصاريف والمشتريات والهدايا</span>
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center text-sm font-bold">
              📤
            </span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-rose-700 block">
              -{formatIQD(totalCashOutflows)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-mono flex-wrap">
              <span>مصاريف: {formatIQD(totalExpensesAmount)}</span>
              <span>•</span>
              <span>مشتريات: {formatIQD(totalCashPurchasesAmount)}</span>
              <span>•</span>
              <span className="text-purple-700 font-bold">هدايا: {formatIQD(totalGiftsCost)}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Live Cash in Drawer (Current Physical Register) */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900 block">النقد الفعلي بالقاصة (الصندوق)</span>
              <span className="text-[10px] text-indigo-700 font-bold block">
                {latestReconciliation ? `آخر تسوية: ${formatIQD(latestReconciliation.actualCashAmount)} د.ع` : 'رصيد تراكمي'}
              </span>
            </div>
            <button
              onClick={() => setShowReconciliationModal(true)}
              className="w-8 h-8 rounded-lg bg-slate-900 text-white hover:bg-indigo-700 flex items-center justify-center text-xs transition-colors cursor-pointer"
              title="تعديل وتسوية رصيد القاصة"
            >
              ⚖️
            </button>
          </div>
          <div>
            <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block ${liveDrawerCash >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>
              {liveDrawerCash < 0 ? `-${formatIQD(Math.abs(liveDrawerCash))}` : formatIQD(liveDrawerCash)}{' '}
              <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {totalRemainingCustomerDebt > 0 ? `(ديون عملاء معلقة: ${formatIQD(totalRemainingCustomerDebt)} د.ع)` : 'لا توجد ديون معلقة'}
            </span>
          </div>
        </div>

      </div>

      {/* Transactions Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Filters & Search Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              كافة الحركات ({unifiedTransactions.length})
            </button>
            <button
              onClick={() => setFilterType('sales')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'sales' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              المبيعات
            </button>
            <button
              onClick={() => setFilterType('incomes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'incomes' ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              📥 الإيرادات والفواتير القديمة ({incomes.length})
            </button>
            <button
              onClick={() => setFilterType('purchases')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'purchases' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              المشتريات النقدية
            </button>
            <button
              onClick={() => setFilterType('expenses')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'expenses' ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              المصاريف
            </button>
            <button
              onClick={() => setFilterType('gifts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'gifts' ? 'bg-purple-800 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              🎁 الهدايا والمجانيات
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الحركات أو الأسماء..."
              className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* Ledger Table */}
        {displayedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-sm font-bold">لا توجد حركات مالية مسجلة في هذا النطاق</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">المرجع</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">البيان / الوصف</th>
                  <th className="p-3.5">نوع الحركة</th>
                  <th className="p-3.5">المقبوض (داخل +)</th>
                  <th className="p-3.5">المصروف (خارج -)</th>
                  <th className="p-3.5">المتبقي كدين</th>
                  <th className="p-3.5 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {displayedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-900">{tx.refNumber}</td>
                    <td className="p-3.5 text-slate-500 font-mono">{tx.dateFormatted}</td>
                    <td className="p-3.5 font-bold text-slate-800">{tx.title}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        tx.type === 'sale_cash' ? 'bg-emerald-100 text-emerald-800' :
                        tx.type === 'sale_debt' ? 'bg-amber-100 text-amber-800' :
                        tx.type === 'manual_income' ? 'bg-teal-100 text-teal-900 border border-teal-300 font-bold' :
                        tx.type === 'purchase_cash' ? 'bg-indigo-100 text-indigo-800' :
                        tx.type === 'supplier_payment' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {tx.typeLabel}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold font-mono text-emerald-800 text-sm">
                      {tx.inflow > 0 ? `+${formatIQD(tx.inflow)}` : '—'}
                    </td>
                    <td className="p-3.5 font-bold font-mono text-rose-800 text-sm">
                      {tx.outflow > 0 ? `-${formatIQD(tx.outflow)}` : '—'}
                    </td>
                    <td className="p-3.5 font-bold font-mono text-slate-600">
                      {tx.remaining > 0 ? `${formatIQD(tx.remaining)} د.ع` : '—'}
                    </td>
                    <td className="p-3.5 text-center">
                      {tx.saleObj && (
                        <button
                          onClick={() => onViewSale(tx.saleObj)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          عرض الفاتورة
                        </button>
                      )}
                      {tx.incomeObj && (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIncomeItem(tx.incomeObj);
                              setShowAddIncomeModal(true);
                            }}
                            className="p-1 px-2 text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold text-[11px] transition-colors cursor-pointer border border-indigo-200"
                            title="تعديل الإيراد"
                          >
                            ✏️ تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              confirm(
                                'حذف الإيراد المسجل',
                                `هل تريد بالتأكيد حذف الإيراد "${tx.incomeObj.title}" بمبلغ ${formatIQD(tx.incomeObj.amount)} د.ع؟ سيتم حذفه من الصندوق فوراً.`,
                                async () => {
                                  try {
                                    await deleteIncome(tx.incomeObj.id);
                                    toast('تم حذف الإيراد بنجاح ✓', 'success');
                                  } catch (err) {
                                    toast(`فشل الحذف: ${err.message}`, 'error');
                                  }
                                }
                              );
                            }}
                            className="p-1 px-2 text-rose-700 hover:bg-rose-50 rounded-lg font-bold text-[11px] transition-colors cursor-pointer border border-rose-200"
                            title="حذف الإيراد"
                          >
                            🗑️ حذف
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Cash Reconciliation Modal */}
      {showReconciliationModal && (
        <CashReconciliationModal
          currentCalculatedCash={liveDrawerCash}
          onClose={() => setShowReconciliationModal(false)}
        />
      )}

      {/* Manual Income / Old Invoice Modal */}
      {showAddIncomeModal && (
        <AddIncomeModal
          initialIncome={editingIncomeItem}
          onClose={() => {
            setShowAddIncomeModal(false);
            setEditingIncomeItem(null);
          }}
        />
      )}

    </div>
  );
}
