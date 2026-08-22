import React, { useState, useMemo } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import { useCashReconciliation } from '../hooks/useCashReconciliation';
import { useIncomes } from '../hooks/useIncomes';
import { deleteIncome } from '../services/incomesService';
import { useUI } from '../contexts/UIContext';
import CashReconciliationModal from './CashReconciliationModal';
import AddIncomeModal from './AddIncomeModal';
import InvoiceReceipt from './InvoiceReceipt';

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
  const [filterType, setFilterType] = useState('all'); // 'all' | 'sales' | 'inflows' | 'drawers' | 'expenses' | 'purchases' | 'gifts' | 'incomes'
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [editingIncomeItem, setEditingIncomeItem] = useState(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState(null);

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

  // Filter Purchases
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

  // Filter Manual Incomes
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

  // Sales Revenue Breakdown
  const totalSalesRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Direct Cash Sales
  const directCashSales = useMemo(() => {
    return filteredSales
      .filter((s) => (s.invoiceType === 'cash' || !s.invoiceType) && s.paymentMethod !== 'mastercard')
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Direct Mastercard Sales
  const mastercardSales = useMemo(() => {
    return filteredSales
      .filter((s) => s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard')
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Debt Sales
  const debtSales = useMemo(() => {
    return filteredSales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
  }, [filteredSales]);

  // Customer debt repayments collected
  const { customerDebtRepaymentsCash, customerDebtRepaymentsMastercard, totalCustomerDebtRepayments } = useMemo(() => {
    let cashSum = 0;
    let cardSum = 0;
    filteredSales.forEach((s) => {
      if (s.invoiceType === 'debt') {
        if (s.payments && Array.isArray(s.payments) && s.payments.length > 0) {
          s.payments.forEach(p => {
            const isCard = p.paymentMethod === 'mastercard' || String(p.paymentMethod || '').includes('ماستر') || String(p.paymentMethod || '').includes('مصرف');
            const amt = Number(p.amount || 0);
            if (isCard) cardSum += amt;
            else cashSum += amt;
          });
        } else {
          cashSum += Number(s.paidAmount || 0);
        }
      }
    });
    return {
      customerDebtRepaymentsCash: cashSum,
      customerDebtRepaymentsMastercard: cardSum,
      totalCustomerDebtRepayments: cashSum + cardSum
    };
  }, [filteredSales]);

  // Manual Incomes Breakdown
  const { manualIncomesCash, manualIncomesMastercard, totalManualIncomesAmount } = useMemo(() => {
    let cash = 0;
    let card = 0;
    filteredIncomes.forEach(inc => {
      const isCard = inc.paymentMethod === 'mastercard' || String(inc.paymentMethod || '').includes('ماستر');
      const amt = Number(inc.amount || 0);
      if (isCard) card += amt;
      else cash += amt;
    });
    return {
      manualIncomesCash: cash,
      manualIncomesMastercard: card,
      totalManualIncomesAmount: cash + card
    };
  }, [filteredIncomes]);

  // Total Inflow
  const totalCashInflow = directCashSales + customerDebtRepaymentsCash + manualIncomesCash;
  const totalMastercardInflow = mastercardSales + customerDebtRepaymentsMastercard + manualIncomesMastercard;
  const totalCashCollected = totalCashInflow + totalMastercardInflow;

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

  // Cash Purchases Outflow
  const directPurchasesCash = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  }, [filteredPurchases]);

  const supplierDebtsPaid = useMemo(() => {
    return filteredSupplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [filteredSupplierPayments]);

  const totalCashPurchasesAmount = directPurchasesCash + supplierDebtsPaid;

  // Free Promotional Gifts
  const { totalGiftsCost, totalGiftsItemsCount } = useMemo(() => {
    let cost = 0;
    let itemsCount = 0;
    filteredSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          cost += wholesale * qty;
          itemsCount += qty;
        }
      });
    });
    return { totalGiftsCost: cost, totalGiftsItemsCount: itemsCount };
  }, [filteredSales]);

  // Total Outflows
  const totalCashOutflows = totalExpensesAmount + totalCashPurchasesAmount + totalGiftsCost;

  // Net Cash Flow
  const netCashFlowForPeriod = totalCashCollected - totalCashOutflows;

  // Live Drawer Cash & Mastercard
  const { liveDrawerCash, liveDrawerMastercard } = useMemo(() => {
    if (latestReconciliation && latestReconciliation.date) {
      const recDate = new Date(latestReconciliation.date);
      const baseCash = Number(latestReconciliation.actualCashAmount) || 0;
      const baseMastercard = Number(latestReconciliation.actualMastercardAmount) || 0;

      let cashInflowSince = 0;
      let cardInflowSince = 0;

      sales.forEach((s) => {
        const sDate = toDateSafe(s.createdAt);
        if (sDate && sDate > recDate) {
          const isCard = s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard';
          if (s.invoiceType === 'cash' || !s.invoiceType) {
            if (isCard) cardInflowSince += Number(s.total || 0);
            else cashInflowSince += Number(s.total || 0);
          } else if (s.invoiceType === 'mastercard') {
            cardInflowSince += Number(s.total || 0);
          } else if (s.invoiceType === 'debt') {
            if (s.payments && Array.isArray(s.payments)) {
              s.payments.forEach(p => {
                const pDate = p.date ? new Date(p.date) : null;
                if (pDate && pDate > recDate) {
                  const isPCard = p.paymentMethod === 'mastercard' || String(p.paymentMethod || '').includes('ماستر');
                  if (isPCard) cardInflowSince += Number(p.amount || 0);
                  else cashInflowSince += Number(p.amount || 0);
                }
              });
            } else {
              cashInflowSince += Number(s.paidAmount || 0);
            }
          }
        }
      });

      incomes.forEach((inc) => {
        const createdDate = inc.createdAt ? new Date(inc.createdAt) : null;
        const docDate = inc.date ? new Date(inc.date) : null;
        if ((createdDate && createdDate > recDate) || (docDate && docDate > recDate)) {
          const isCard = inc.paymentMethod === 'mastercard' || String(inc.paymentMethod || '').includes('ماستر');
          if (isCard) cardInflowSince += Number(inc.amount || 0);
          else cashInflowSince += Number(inc.amount || 0);
        }
      });

      let cashOutflowSince = 0;
      expenses.forEach((e) => {
        const eDate = new Date(e.date || e.createdAt);
        if (eDate > recDate) {
          cashOutflowSince += Number(e.amount || 0);
        }
      });

      purchases.forEach((p) => {
        const pDate = new Date(p.date || p.createdAt);
        if (pDate > recDate) {
          cashOutflowSince += Number(p.paidAmount || 0);
        }
      });

      supplierDebtPayments.forEach((p) => {
        const pDate = new Date(p.date);
        if (pDate > recDate) {
          cashOutflowSince += Number(p.amount || 0);
        }
      });

      return {
        liveDrawerCash: baseCash + cashInflowSince - cashOutflowSince,
        liveDrawerMastercard: baseMastercard + cardInflowSince
      };
    }

    let allDirectCash = 0;
    let allMastercard = 0;

    sales.forEach(s => {
      const isCard = s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard';
      if (s.invoiceType === 'cash' || !s.invoiceType) {
        if (isCard) allMastercard += Number(s.total || 0);
        else allDirectCash += Number(s.total || 0);
      } else if (s.invoiceType === 'mastercard') {
        allMastercard += Number(s.total || 0);
      } else if (s.invoiceType === 'debt') {
        if (s.payments && Array.isArray(s.payments)) {
          s.payments.forEach(p => {
            const isPCard = p.paymentMethod === 'mastercard' || String(p.paymentMethod || '').includes('ماستر');
            if (isPCard) allMastercard += Number(p.amount || 0);
            else allDirectCash += Number(p.amount || 0);
          });
        } else {
          allDirectCash += Number(s.paidAmount || 0);
        }
      }
    });

    incomes.forEach(inc => {
      const isCard = inc.paymentMethod === 'mastercard' || String(inc.paymentMethod || '').includes('ماستر');
      if (isCard) allMastercard += Number(inc.amount || 0);
      else allDirectCash += Number(inc.amount || 0);
    });

    const allExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const allCashPurchases = purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
    const allSupplierDebtPayments = supplierDebtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      liveDrawerCash: allDirectCash - (allExpenses + allCashPurchases + allSupplierDebtPayments),
      liveDrawerMastercard: allMastercard
    };
  }, [sales, expenses, purchases, supplierDebtPayments, incomes, latestReconciliation]);

  // Unified Income Ledger Transactions List
  const unifiedTransactions = useMemo(() => {
    const list = [];

    filteredSales.forEach((s) => {
      const date = toDateSafe(s.createdAt);
      const isMastercard = s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard';
      const isCash = !isMastercard && (s.invoiceType === 'cash' || !s.invoiceType);
      const isDebt = s.invoiceType === 'debt';

      let typeKey = 'sale_cash';
      let typeLabel = 'بيع نقدي 💵';
      if (isMastercard) {
        typeKey = 'sale_mastercard';
        typeLabel = 'بيع ماستركارد 💳';
      } else if (isDebt) {
        typeKey = 'sale_debt';
        typeLabel = 'بيع دين / آجل ⏳';
      }

      list.push({
        id: `sale-${s.id}`,
        type: typeKey,
        typeLabel,
        date: date,
        dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
        refNumber: `#${s.invoiceNumber}`,
        title: s.customerName ? `فاتورة مبيعات (${s.customerName})` : 'فاتورة مبيعات عامة',
        category: isMastercard ? 'مبيعات ماستركارد' : isCash ? 'مبيعات نقدية' : 'مبيعات ذمم',
        inflow: Number(s.total || 0),
        outflow: 0,
        paidNow: isDebt ? Number(s.paidAmount || 0) : Number(s.total || 0),
        remaining: isDebt ? Number(s.remainingDebt || (Number(s.total || 0) - Number(s.paidAmount || 0))) : 0,
        saleObj: s
      });

      (s.items || []).forEach((item, itemIdx) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          const totalCost = wholesale * qty;
          list.push({
            id: `sale-${s.id}-gift-${itemIdx}`,
            type: 'gift_item',
            typeLabel: 'هدية مجانية 🎁',
            date: date,
            dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
            refNumber: `#${s.invoiceNumber}`,
            title: `هدية مجانية: ${item.name} (${qty} ${item.sellMode === 'meter' ? 'متر' : 'قطع'})`,
            category: 'هدايا ومجانيات',
            inflow: 0,
            outflow: totalCost,
            paidNow: 0,
            remaining: 0,
            saleObj: s
          });
        }
      });
    });

    filteredIncomes.forEach((inc) => {
      const date = inc.date ? new Date(inc.date) : toDateSafe(inc.createdAt);
      const isCard = inc.paymentMethod === 'mastercard' || String(inc.paymentMethod || '').includes('ماستر');
      list.push({
        id: `income-${inc.id}`,
        type: 'manual_income',
        typeLabel: isCard ? 'إيراد ماستركارد 💳' : 'إيراد نقدي 💵',
        date: date,
        dateFormatted: date ? date.toLocaleDateString('ar-IQ') : '—',
        refNumber: inc.category?.includes('فاتورة') ? 'إيراد قديم' : 'إيراد مكتب',
        title: inc.title || inc.notes || 'دخل إضافي',
        category: inc.category || 'دخل إضافي',
        inflow: Number(inc.amount || 0),
        outflow: 0,
        paidNow: Number(inc.amount || 0),
        remaining: 0,
        incomeObj: inc
      });
    });

    filteredExpenses.forEach((e) => {
      const date = e.date ? new Date(e.date) : toDateSafe(e.createdAt);
      list.push({
        id: `expense-${e.id}`,
        type: 'expense',
        typeLabel: 'مصروف تشغيلي 📤',
        date: date,
        dateFormatted: date ? date.toLocaleDateString('ar-IQ') : '—',
        refNumber: e.invoiceNumber ? `#${e.invoiceNumber}` : 'سند صرف',
        title: e.title || e.description || e.name || 'مصروف إداري',
        category: e.category || 'مصاريف عامة',
        inflow: 0,
        outflow: Number(e.amount || 0),
        paidNow: Number(e.amount || 0),
        remaining: 0,
        expenseObj: e
      });
    });

    filteredPurchases.forEach((p) => {
      const date = p.date ? new Date(p.date) : toDateSafe(p.createdAt);
      const paid = Number(p.paidAmount || 0);
      const total = Number(p.total || 0);
      const isCash = p.paymentMethod === 'نقدي' || p.paymentMethod === 'cash';
      if (paid > 0) {
        list.push({
          id: `purchase-${p.id}`,
          type: 'purchase_cash',
          typeLabel: isCash ? 'شراء نقدي 🛍️' : 'شراء بضاعة 🛍️',
          date: date,
          dateFormatted: date ? date.toLocaleDateString('ar-IQ') : '—',
          refNumber: p.invoiceNumber ? `#${p.invoiceNumber}` : 'فاتورة شراء',
          title: p.supplierName ? `شراء بضاعة (المورد: ${p.supplierName})` : 'فاتورة شراء مخزن',
          category: 'مشتريات بضاعة',
          inflow: 0,
          outflow: paid,
          paidNow: paid,
          remaining: Math.max(0, total - paid),
          purchaseObj: p
        });
      }
    });

    filteredSupplierPayments.forEach((p) => {
      const date = p.date ? new Date(p.date) : toDateSafe(p.createdAt);
      list.push({
        id: `supplier-pay-${p.id}`,
        type: 'supplier_payment',
        typeLabel: 'سداد مورد 💼',
        date: date,
        dateFormatted: date ? date.toLocaleDateString('ar-IQ') : '—',
        refNumber: 'سند سداد',
        title: `سداد دفعة للمورد (${p.supplierName || 'مورد'})`,
        category: 'سداد ديون موردين',
        inflow: 0,
        outflow: Number(p.amount || 0),
        paidNow: Number(p.amount || 0),
        remaining: 0,
        paymentObj: p
      });
    });

    return list.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [filteredSales, filteredIncomes, filteredExpenses, filteredPurchases, filteredSupplierPayments]);

  const displayedTransactions = useMemo(() => {
    return unifiedTransactions.filter((tx) => {
      if (filterType === 'sales') {
        if (!tx.type.startsWith('sale_')) return false;
      } else if (filterType === 'inflows') {
        if (tx.inflow <= 0) return false;
      } else if (filterType === 'expenses') {
        if (tx.type !== 'expense') return false;
      } else if (filterType === 'purchases') {
        if (tx.type !== 'purchase_cash' && tx.type !== 'supplier_payment') return false;
      } else if (filterType === 'gifts') {
        if (tx.type !== 'gift_item') return false;
      } else if (filterType === 'incomes') {
        if (tx.type !== 'manual_income') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (tx.title || '').toLowerCase().includes(q) || (tx.refNumber || '').toLowerCase().includes(q) || (tx.category || '').toLowerCase().includes(q) || (tx.typeLabel || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [unifiedTransactions, filterType, searchQuery]);

  const handleCardClick = (typeKey) => {
    setFilterType(prev => prev === typeKey ? 'all' : typeKey);
    const tableEl = document.getElementById('transactions-ledger-section');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">كشف المقبوضات والتدفق المالي</span>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">صفحة تقرير الدخل والصندوق</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAddIncomeModal(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden">
            <span>📥</span>
            <span>إضافة مبلغ للدخل</span>
          </button>
          <button onClick={() => setShowReconciliationModal(true)} className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs print:hidden">
            <span>⚖️</span>
            <span>تسوية رصيد القاصة والماستركارد</span>
          </button>
          <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
            {[
              { id: 'today', label: 'اليوم' },
              { id: 'week', label: 'الأسبوع' },
              { id: 'month', label: 'الشهر الحالي' },
              { id: 'all', label: 'الكل' },
              { id: 'custom', label: 'مخصص' }
            ].map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${period === p.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => window.print()} className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-3 text-xs font-bold text-slate-700">
          <span>من تاريخ:</span>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"/>
          <span>إلى تاريخ:</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"/>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div onClick={() => handleCardClick('sales')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'sales' ? 'bg-emerald-50/40 border-emerald-500 shadow-md ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-700 flex items-center gap-1.5"><span>🛒</span><span>إجمالي قيمة المبيعات</span></span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">{filteredSales.length} فاتورة</span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-950 block">{formatIQD(totalSalesRevenue)} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="grid grid-cols-3 gap-1 mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] font-bold">
              <div className="text-emerald-700 bg-emerald-50/70 p-1.5 rounded-lg text-center"><span className="text-[9px] block text-emerald-600/80 font-normal">💵 نقدي</span><span className="font-mono">{formatIQD(directCashSales)}</span></div>
              <div className="text-indigo-700 bg-indigo-50/70 p-1.5 rounded-lg text-center"><span className="text-[9px] block text-indigo-600/80 font-normal">💳 ماستر</span><span className="font-mono">{formatIQD(mastercardSales)}</span></div>
              <div className="text-amber-700 bg-amber-50/70 p-1.5 rounded-lg text-center"><span className="text-[9px] block text-amber-600/80 font-normal">⏳ ديون</span><span className="font-mono">{formatIQD(debtSales)}</span></div>
            </div>
          </div>
        </div>

        <div onClick={() => handleCardClick('inflows')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'inflows' ? 'bg-teal-50/40 border-teal-500 shadow-md ring-2 ring-teal-500/20' : 'bg-white border-slate-200 hover:border-teal-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-teal-900 flex items-center gap-1.5"><span>📥</span><span>المقبوضات النقدية الداخلة</span></span>
            <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-bold">+</span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-teal-700 block">+{formatIQD(totalCashCollected)} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] font-bold">
              <div className="bg-slate-50 p-1.5 rounded-lg"><span className="text-[9px] block text-slate-500 font-normal">💵 كاش مقبوض</span><span className="font-mono text-emerald-800">+{formatIQD(totalCashInflow)}</span></div>
              <div className="bg-slate-50 p-1.5 rounded-lg"><span className="text-[9px] block text-slate-500 font-normal">💳 ماستركارد</span><span className="font-mono text-indigo-800">+{formatIQD(totalMastercardInflow)}</span></div>
            </div>
          </div>
        </div>

        <div onClick={() => handleCardClick('drawers')} className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 relative group md:col-span-2 xl:col-span-2 ${filterType === 'drawers' ? 'bg-slate-900 text-white border-indigo-400 shadow-lg ring-2 ring-indigo-500/20' : 'bg-slate-950 text-white border-slate-800 hover:border-slate-700 shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span>🏦</span><div><span className="text-xs font-black text-white block">قاصة الصندوق والماستركارد (الرصيد الفعلي)</span><span className="text-[10px] text-slate-400 block font-mono">{latestReconciliation ? `آخر تسوية: ${formatIQD(latestReconciliation.actualCashAmount)} د.ع` : 'رصيد تراكمي مستمر'}</span></div></div>
            <button onClick={(e) => { e.stopPropagation(); setShowReconciliationModal(true); }} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 transition-colors border border-white/10 cursor-pointer"><span>⚖️</span><span>تسوية القاصة</span></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="bg-white/5 border border-white/10 p-3 rounded-xl"><div className="flex items-center justify-between text-xs text-slate-300 font-bold mb-1"><span>💵 النقد الفعلي (الكاش)</span></div><span className={`text-xl sm:text-2xl font-black font-mono tracking-tight block ${liveDrawerCash >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{liveDrawerCash < 0 ? `-${formatIQD(Math.abs(liveDrawerCash))}` : formatIQD(liveDrawerCash)} <span className="text-xs font-normal text-slate-400">د.ع</span></span><span className="text-[10px] text-slate-400 mt-1 block">{totalRemainingCustomerDebt > 0 ? `(ديون معلقة: ${formatIQD(totalRemainingCustomerDebt)} د.ع)` : 'لا توجد ديون'}</span></div>
            <div className="bg-white/5 border border-white/10 p-3 rounded-xl"><div className="flex items-center justify-between text-xs text-slate-300 font-bold mb-1"><span>💳 رصيد الماستركارد</span></div><span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-indigo-300 block">{formatIQD(liveDrawerMastercard)} <span className="text-xs font-normal text-slate-400">د.ع</span></span></div>
          </div>
        </div>

        <div onClick={() => handleCardClick('expenses')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'expenses' ? 'bg-rose-50/40 border-rose-500 shadow-md ring-2 ring-rose-500/20' : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-900 flex items-center gap-1.5"><span>📤</span><span>المصاريف والنثريات</span></span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700">{filteredExpenses.length} بنود</span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-rose-700 block">-{formatIQD(totalExpensesAmount)} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 font-medium">مصاريف تشغيلية، إيجار، رواتب، ووقود</div>
          </div>
        </div>

        <div onClick={() => handleCardClick('purchases')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'purchases' ? 'bg-indigo-50/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5"><span>🛍️</span><span>المشتريات وسداد الموردين</span></span>
            <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-bold">-</span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-indigo-800 block">-{formatIQD(totalCashPurchasesAmount)} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] font-bold">
              <div className="bg-slate-50 p-1.5 rounded-lg"><span className="text-[9px] block text-slate-500 font-normal">شراء كاش</span><span className="font-mono text-indigo-900">{formatIQD(directPurchasesCash)}</span></div>
              <div className="bg-slate-50 p-1.5 rounded-lg"><span className="text-[9px] block text-slate-500 font-normal">سداد موردين</span><span className="font-mono text-indigo-900">{formatIQD(supplierDebtsPaid)}</span></div>
            </div>
          </div>
        </div>

        <div onClick={() => handleCardClick('gifts')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'gifts' ? 'bg-purple-50/40 border-purple-500 shadow-md ring-2 ring-purple-500/20' : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-purple-900 flex items-center gap-1.5"><span>🎁</span><span>الهدايا والمجانيات</span></span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800 font-mono">{totalGiftsItemsCount} قطعة</span>
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-purple-800 block">{formatIQD(totalGiftsCost)} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] text-purple-900 font-medium">محسوبة بسعر الجملة والتكلفة الأصلية</div>
          </div>
        </div>

        <div onClick={() => handleCardClick('all')} className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 relative group ${filterType === 'all' ? 'bg-slate-100 border-slate-400 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5"><span>📊</span><span>صافي التدفق المالي</span></span>
            <span className="text-xs font-mono font-bold text-slate-500">(الداخل - الخارج)</span>
          </div>
          <div>
            <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block ${netCashFlowForPeriod >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{netCashFlowForPeriod >= 0 ? `+${formatIQD(netCashFlowForPeriod)}` : `-${formatIQD(Math.abs(netCashFlowForPeriod))}`} <span className="text-xs font-normal text-slate-500">د.ع</span></span>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-mono">المقبوضات (+{formatIQD(totalCashCollected)}) - المدفوعات (-{formatIQD(totalCashOutflows)})</div>
          </div>
        </div>
      </div>

      <div id="transactions-ledger-section" className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
            <button onClick={() => setFilterType('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>كافة الحركات ({unifiedTransactions.length})</button>
            <button onClick={() => setFilterType('sales')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'sales' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>🛒 المبيعات ({filteredSales.length})</button>
            <button onClick={() => setFilterType('incomes')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'incomes' ? 'bg-teal-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>📥 الإيرادات والفواتير ({filteredIncomes.length})</button>
            <button onClick={() => setFilterType('purchases')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'purchases' ? 'bg-indigo-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>🛍️ المشتريات والموردين</button>
            <button onClick={() => setFilterType('expenses')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'expenses' ? 'bg-rose-700 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>📤 المصاريف ({filteredExpenses.length})</button>
            <button onClick={() => setFilterType('gifts')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterType === 'gifts' ? 'bg-purple-800 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>🎁 الهدايا والمجانيات</button>
          </div>
          <div className="relative w-full sm:w-64">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث في الحركات..." className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"/>
            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {filterType !== 'all' && (
          <div className="bg-indigo-50/70 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-xs">
            <span className="text-indigo-950 font-bold flex items-center gap-1.5"><span>🎯</span><span>تصفية مخصصة ({displayedTransactions.length} حركة مطابقة)</span></span>
            <button onClick={() => setFilterType('all')} className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer">إلغاء التصفية</button>
          </div>
        )}

        {displayedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400"><p className="text-sm font-bold">لا توجد حركات مالية مسجلة في هذا النطاق</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr><th className="p-3.5">المرجع</th><th className="p-3.5">التاريخ</th><th className="p-3.5">الوصف</th><th className="p-3.5">نوع الحركة</th><th className="p-3.5">المقبوض</th><th className="p-3.5">المصروف</th><th className="p-3.5">المتبقي دين</th><th className="p-3.5 text-center">الإجراء</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {displayedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-slate-900">{tx.refNumber}</td>
                    <td className="p-3.5 text-slate-500 font-mono">{tx.dateFormatted}</td>
                    <td className="p-3.5 font-bold text-slate-800">{tx.title}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${tx.type === 'sale_cash' ? 'bg-emerald-100 text-emerald-800' : tx.type === 'sale_mastercard' ? 'bg-indigo-100 text-indigo-800 font-black' : tx.type === 'sale_debt' ? 'bg-amber-100 text-amber-800 font-black' : tx.type === 'gift_item' ? 'bg-purple-100 text-purple-900 font-black' : tx.type === 'manual_income' ? 'bg-teal-100 text-teal-900 border border-teal-300 font-bold' : tx.type === 'purchase_cash' ? 'bg-indigo-100 text-indigo-800' : tx.type === 'supplier_payment' ? 'bg-indigo-100 text-indigo-800' : 'bg-rose-100 text-rose-800'}`}>{tx.typeLabel}</span>
                    </td>
                    <td className="p-3.5 font-bold font-mono text-emerald-800 text-sm">{tx.inflow > 0 ? `+${formatIQD(tx.inflow)}` : '—'}</td>
                    <td className="p-3.5 font-bold font-mono text-rose-800 text-sm">{tx.outflow > 0 ? `-${formatIQD(tx.outflow)}` : '—'}</td>
                    <td className="p-3.5 font-bold font-mono text-slate-600">{tx.remaining > 0 ? `${formatIQD(tx.remaining)} د.ع` : '—'}</td>
                    <td className="p-3.5 text-center">
                      {tx.saleObj && (
                        <button onClick={() => { if (onViewSale) onViewSale(tx.saleObj); else setSelectedSaleForReceipt(tx.saleObj); }} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer">عرض الفاتورة</button>
                      )}
                      {tx.incomeObj && (
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => { setEditingIncomeItem(tx.incomeObj); setShowAddIncomeModal(true); }} className="p-1 px-2 text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold text-[11px] transition-colors cursor-pointer border border-indigo-200">✏️</button>
                          <button onClick={() => confirm('حذف الإيراد', `حذف "${tx.incomeObj.title}"؟`, async () => { try { await deleteIncome(tx.incomeObj.id); toast('تم الحذف ✓', 'success'); } catch (err) { toast(`فشل: ${err.message}`, 'error'); } })} className="p-1 px-2 text-rose-700 hover:bg-rose-50 rounded-lg font-bold text-[11px] transition-colors cursor-pointer border border-rose-200">🗑️</button>
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

      {showReconciliationModal && (
        <CashReconciliationModal
          currentCalculatedCash={liveDrawerCash}
          currentCalculatedMastercard={liveDrawerMastercard}
          onClose={() => setShowReconciliationModal(false)}
        />
      )}

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
