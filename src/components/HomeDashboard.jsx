import React, { useMemo, useState } from 'react';
import { useDraftSales } from '../hooks/useDraftSales';
import { useSales } from '../hooks/useSales';
import { useExpenses } from '../hooks/useExpenses';
import { usePurchases } from '../hooks/usePurchases';
import { useCashReconciliation } from '../hooks/useCashReconciliation';
import { useIncomes } from '../hooks/useIncomes';
import { useEmployeeReimbursements } from '../hooks/useEmployeeReimbursements';
import { useEmployeeAdvances } from '../hooks/useEmployeeAdvances';
import { getStockStatus, STOCK_STATUS } from '../models/product';
import { useUI } from '../contexts/UIContext';
import IncomeExpensesModal from './IncomeExpensesModal';
import CashReconciliationModal from './CashReconciliationModal';
import AddIncomeModal from './AddIncomeModal';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatDraftDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ar-IQ', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HomeDashboard({ onGoToInventory, onOpenDraft, products, productsLoading }) {
  const { drafts, loading: draftsLoading } = useDraftSales();
  const { sales, loading: salesLoading } = useSales();
  const { expenses, stats: expensesStats, loading: expensesLoading } = useExpenses();
  const { purchases, debtPayments: supplierDebtPayments } = usePurchases();
  const { latestReconciliation } = useCashReconciliation();
  const { incomes, stats: incomesStats, loading: incomesLoading } = useIncomes();
  const { reimbursements } = useEmployeeReimbursements();
  const { advances } = useEmployeeAdvances();

  const [showIncomeExpensesModal, setShowIncomeExpensesModal] = useState(false);
  const [showCashReconciliationModal, setShowCashReconciliationModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const { toast } = useUI();

  const lowStock = products.filter((p) => getStockStatus(p) === STOCK_STATUS.LOW_STOCK);
  const outOfStock = products.filter((p) => getStockStatus(p) === STOCK_STATUS.OUT_OF_STOCK);
  const alertsCount = lowStock.length + outOfStock.length;

  const recentDrafts = [...drafts]
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
    .slice(0, 5);

  const todaysSales = useMemo(
    () => sales.filter((s) => isToday(toDateSafe(s.createdAt))),
    [sales]
  );
  const todaysRevenue = todaysSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const todaysExpense = expensesStats?.todayTotal || 0;
  
  const todayStr = new Date().toISOString().slice(0, 10);

  const todaysManualIncome = useMemo(() => {
    return (incomes || [])
      .filter((inc) => (inc.date || inc.createdAt || '').slice(0, 10) === todayStr)
      .reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
  }, [incomes, todayStr]);

  const todaysAdvanceRepayments = useMemo(() => {
    let sum = 0;
    (advances || []).forEach((a) => {
      const paymentsList = Array.isArray(a.payments) && a.payments.length > 0
        ? a.payments
        : (Number(a.repaidAmount || 0) > 0 || (Number(a.amount || 0) > Number(a.remainingDebt || 0)))
          ? [{
              amount: Number(a.repaidAmount) || Math.max(0, (Number(a.amount) || 0) - (Number(a.remainingDebt) || 0)),
              repaymentMethod: 'cash_drawer',
              date: a.lastRepaymentDate || a.updatedAt || a.date
            }]
          : [];

      paymentsList.forEach((pay) => {
        const payDateStr = (pay.date || a.lastRepaymentDate || a.updatedAt || a.date || '').slice(0, 10);
        if ((pay.repaymentMethod === 'cash_drawer' || !pay.repaymentMethod) && payDateStr === todayStr) {
          sum += Number(pay.amount || 0);
        }
      });
    });
    return sum;
  }, [advances, todayStr]);

  const todaysDrawerExpense = useMemo(() => {
    return expenses
      .filter((e) => (e.date || e.createdAt || '').slice(0, 10) === todayStr && e.paymentSource !== 'management')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, todayStr]);

  const todaysPurchasesCash = useMemo(() => {
    const pCash = purchases
      .filter((p) => (p.date || '').slice(0, 10) === todayStr)
      .reduce((sum, p) => {
        const actualFromDrawer = p.paidFromCashDrawerAmount !== undefined && p.paidFromCashDrawerAmount !== null
          ? Number(p.paidFromCashDrawerAmount)
          : Number(p.paidAmount || 0);
        return sum + actualFromDrawer;
      }, 0);
    const spCash = (supplierDebtPayments || [])
      .filter((sp) => (sp.date || '').slice(0, 10) === todayStr)
      .reduce((sum, sp) => sum + (Number(sp.amount) || 0), 0);
    
    // Employee reimbursements settled from drawer today
    const reimbCash = (reimbursements || [])
      .filter((r) => r.status === 'reimbursed' && r.reimbursementSource === 'cash_drawer' && (r.reimbursedAt || '').slice(0, 10) === todayStr)
      .reduce((sum, r) => sum + (Number(r.reimbursedAmount || r.amount) || 0), 0);

    // Employee advances disbursed from drawer today
    const advancesGivenToday = (advances || [])
      .filter((a) => (a.date || a.createdAt || '').slice(0, 10) === todayStr)
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    return pCash + spCash + reimbCash + advancesGivenToday;
  }, [purchases, supplierDebtPayments, reimbursements, advances, todayStr]);

  const todaysGiftsCost = useMemo(() => {
    let cost = 0;
    todaysSales.forEach((s) => {
      (s.items || []).forEach((item) => {
        if (Number(item.unitPrice || 0) === 0) {
          const wholesale = Number(item.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          cost += wholesale * qty;
        }
      });
    });
    return cost;
  }, [todaysSales]);

  const todaysInflow = todaysRevenue + todaysManualIncome + todaysAdvanceRepayments;
  const todaysOutflows = todaysDrawerExpense + todaysPurchasesCash + todaysGiftsCost;
  const todaysNet = todaysInflow - todaysOutflows;

  // Live Actual Cash in the Office / Drawer (حساب النقد الفعلي الدقيق في المكتب بناءً على آخر تسوية أو تراكمياً)
  const actualOfficeCash = useMemo(() => {
    if (latestReconciliation && latestReconciliation.date) {
      const recDate = new Date(latestReconciliation.date);
      const baseAmount = Number(latestReconciliation.actualCashAmount) || 0;

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

      // Repayments of employee advances into cash drawer
      (advances || []).forEach((a) => {
        const paymentsList = Array.isArray(a.payments) && a.payments.length > 0
          ? a.payments
          : (Number(a.repaidAmount || 0) > 0 || (Number(a.amount || 0) > Number(a.remainingDebt || 0)))
            ? [{
                amount: Number(a.repaidAmount) || Math.max(0, (Number(a.amount) || 0) - (Number(a.remainingDebt) || 0)),
                repaymentMethod: 'cash_drawer',
                date: a.lastRepaymentDate || a.updatedAt || a.date
              }]
            : [];

        paymentsList.forEach((pay) => {
          if (pay.repaymentMethod === 'cash_drawer' || !pay.repaymentMethod) {
            const pDate = new Date(pay.date || a.lastRepaymentDate || a.updatedAt || a.date);
            if (pDate > recDate) {
              inflowSince += Number(pay.amount || 0);
            }
          }
        });
      });

      let outflowSince = 0;
      expenses.forEach((e) => {
        if (e.paymentSource !== 'management') {
          const eDate = new Date(e.date || e.createdAt);
          if (eDate > recDate) {
            outflowSince += Number(e.amount || 0);
          }
        }
      });

      purchases.forEach((p) => {
        const pDate = new Date(p.date || p.createdAt);
        if (pDate > recDate) {
          const actualDrawerPaid = p.paidFromCashDrawerAmount !== undefined && p.paidFromCashDrawerAmount !== null
            ? Number(p.paidFromCashDrawerAmount)
            : Number(p.paidAmount || 0);
          outflowSince += actualDrawerPaid;
        }
      });

      (supplierDebtPayments || []).forEach((p) => {
        const pDate = new Date(p.date);
        if (pDate > recDate) {
          outflowSince += Number(p.amount || 0);
        }
      });

      (reimbursements || []).forEach((r) => {
        if (r.status === 'reimbursed' && r.reimbursementSource === 'cash_drawer') {
          const rDate = new Date(r.reimbursedAt || r.updatedAt || r.createdAt);
          if (rDate > recDate) {
            outflowSince += Number(r.reimbursedAmount || r.amount || 0);
          }
        }
      });

      // Employee advances disbursed from cash drawer
      (advances || []).forEach((a) => {
        const aDate = new Date(a.date || a.createdAt);
        if (aDate > recDate) {
          outflowSince += Number(a.amount || 0);
        }
      });

      return baseAmount + inflowSince - outflowSince;
    }

    // If no reconciliation exists, calculate cumulative cash
    const allDirectCashSales = sales
      .filter((s) => s.invoiceType === 'cash' || !s.invoiceType)
      .reduce((sum, s) => sum + Number(s.total || 0), 0);

    const allDebtPayments = sales
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);

    const allManualIncomes = incomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
    
    // Repayments of employee advances into cash drawer
    let allAdvanceRepaymentsInCash = 0;
    (advances || []).forEach((a) => {
      const paymentsList = Array.isArray(a.payments) && a.payments.length > 0
        ? a.payments
        : (Number(a.repaidAmount || 0) > 0 || (Number(a.amount || 0) > Number(a.remainingDebt || 0)))
          ? [{
              amount: Number(a.repaidAmount) || Math.max(0, (Number(a.amount) || 0) - (Number(a.remainingDebt) || 0)),
              repaymentMethod: 'cash_drawer'
            }]
          : [];

      paymentsList.forEach((pay) => {
        if (pay.repaymentMethod === 'cash_drawer' || !pay.repaymentMethod) {
          allAdvanceRepaymentsInCash += Number(pay.amount || 0);
        }
      });
    });

    const allDrawerExpenses = expenses
      .filter((e) => e.paymentSource !== 'management')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const allCashPurchases = purchases.reduce((sum, p) => {
      const actualDrawerPaid = p.paidFromCashDrawerAmount !== undefined && p.paidFromCashDrawerAmount !== null
        ? Number(p.paidFromCashDrawerAmount)
        : Number(p.paidAmount || 0);
      return sum + actualDrawerPaid;
    }, 0);
    const allSupplierDebtPayments = (supplierDebtPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const allReimbursementsFromDrawer = (reimbursements || [])
      .filter((r) => r.status === 'reimbursed' && r.reimbursementSource === 'cash_drawer')
      .reduce((sum, r) => sum + Number(r.reimbursedAmount || r.amount || 0), 0);
    
    const allAdvancesGiven = (advances || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    return (allDirectCashSales + allDebtPayments + allManualIncomes + allAdvanceRepaymentsInCash) - (allDrawerExpenses + allCashPurchases + allSupplierDebtPayments + allReimbursementsFromDrawer + allAdvancesGiven);
  }, [sales, expenses, purchases, supplierDebtPayments, incomes, reimbursements, advances, latestReconciliation]);

  const topProducts = useMemo(() => {
    const map = new Map();
    for (const sale of sales) {
      for (const item of sale.items || []) {
        const existing = map.get(item.sku) || { name: item.name, sku: item.sku, quantity: 0 };
        existing.quantity += item.quantity;
        map.set(item.sku, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [sales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-ink-900 tracking-tight">لوحة التحكم ونظرة عامة</h2>
          <p className="text-xs text-slate-500 mt-0.5">مؤشرات النشاط اليومي، النقد الفعلي بالمكتب، وتدفق الصندوق</p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <a
            href={`${window.location.origin}${window.location.pathname}?portal=customer`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="فتح وتجربة بوابة كشف حساب العملاء في نافذة جديدة"
          >
            <span className="text-sm">🌐</span>
            <span>بوابة كشف حساب العملاء</span>
          </a>

          <button
            type="button"
            onClick={() => setShowAddIncomeModal(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="إضافة مبلغ نقدي مباشر للدخل أو الصندوق (فاتورة قديمة قبل النظام، إيداع، إيراد صيانة...)"
          >
            <span className="text-sm">📥</span>
            <span>إضافة مبلغ للدخل / فاتورة قديمة</span>
          </button>
        </div>
      </div>

      {/* إحصائيات سريعة - بطاقات بنمط SaaS تشمل النقد الفعلي بالمكتب */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 sm:gap-4">
        
        {/* Card 1: Live Actual Cash in Office (الصندوق والقاصة) */}
        <div 
          onClick={() => setShowCashReconciliationModal(true)}
          className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-900 text-white rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-500/80 transition-all duration-200 cursor-pointer group border border-emerald-700/50 relative overflow-hidden"
          title="انقر لجرد وتسوية رصيد القاصة الفعلي"
        >
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500"></div>
          
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">الصندوق والقاصة</span>
              <h3 className="text-xs font-bold text-white mt-0.5 flex items-center gap-1">
                <span>💵</span>
                <span>النقد الفعلي بالمكتب</span>
              </h3>
            </div>
            <div className="w-8 h-8 rounded-xl bg-emerald-800/70 border border-emerald-600/50 flex items-center justify-center text-emerald-200 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${actualOfficeCash >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                {salesLoading || expensesLoading || incomesLoading ? '...' : actualOfficeCash.toLocaleString()}
              </span>
              <span className="text-[11px] font-bold text-emerald-200/70">د.ع</span>
            </div>
            <span className="text-[10px] text-emerald-200/60 block mt-0.5 font-medium truncate">
              {latestReconciliation 
                ? `مطابق لتسوية: ${new Date(latestReconciliation.date).toLocaleDateString('ar-IQ')}`
                : 'رصيد الصندوق المتاح حالياً'}
            </span>
          </div>

          <div className="text-[10px] font-bold text-emerald-300 group-hover:text-white flex items-center justify-between pt-1.5 border-t border-dashed border-emerald-700/50">
            <span className="flex items-center gap-1">
              <span>⚖️</span>
              <span>تسوية وجرد القاصة</span>
            </span>
            <span className="text-emerald-400 group-hover:translate-x-[-2px] transition-transform">←</span>
          </div>
        </div>

        {/* Card 2: Today's Expenses (المصاريف اليومية) */}
        <div 
          onClick={() => setShowIncomeExpensesModal(true)}
          className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:shadow-md hover:border-rose-300 transition-all duration-200 cursor-pointer group"
          title="انقر لفتح كشف المصاريف والنفقات"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">النفقات والتشغيل</span>
              <h3 className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                <span>☕</span>
                <span>المصاريف (اليوم)</span>
              </h3>
            </div>
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-rose-600">
                {expensesLoading ? '...' : todaysExpense.toLocaleString()}
              </span>
              <span className="text-[11px] font-medium text-slate-500">د.ع</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-medium truncate">
              {expensesStats?.todayCount ? `${expensesStats.todayCount} حركة مسجلة اليوم` : 'إجمالي مصاريف ونفقات اليوم'}
            </span>
          </div>

          <div className="text-[10px] font-bold text-rose-700 group-hover:text-rose-900 flex items-center justify-between pt-1.5 border-t border-dashed border-rose-100">
            <span>كشف وتفاصيل المصاريف</span>
            <span className="text-rose-400 group-hover:text-rose-700 transition-colors">←</span>
          </div>
        </div>

        {/* Card 3: Today's Revenue */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-ink-500">إجمالي المبيعات (اليوم)</h3>
            <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-ink-900 font-mono">{salesLoading ? '...' : todaysRevenue.toLocaleString()} <span className="text-[11px] font-normal text-slate-500">د.ع</span></p>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            إجمالي فواتير بيع اليوم
          </div>
        </div>

        {/* Card 4: Operations Count */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-ink-500">العمليات (اليوم)</h3>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-ink-900 font-mono">{salesLoading ? '...' : todaysSales.length} <span className="text-[11px] font-normal text-slate-500">عملية</span></p>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            عدد فواتير البيع المؤكدة
          </div>
        </div>

        {/* Card 5: Total Products */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-ink-500">إجمالي الأصناف</h3>
            <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-bold text-ink-900 font-mono">{productsLoading ? '...' : products.length} <span className="text-[11px] font-normal text-slate-500">صنف</span></p>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            أصناف مسجلة بالمخزون
          </div>
        </div>

        {/* Card 6: Inventory Alerts */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-ink-500">تنبيهات المخزون</h3>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${alertsCount > 0 ? 'bg-danger-50 text-danger-600' : 'bg-ink-50 text-ink-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
          </div>
          <div>
            <p className={`text-xl sm:text-2xl font-bold font-mono ${alertsCount > 0 ? 'text-danger-600' : 'text-ink-900'}`}>{productsLoading ? '...' : alertsCount} <span className="text-[11px] font-normal text-slate-500">مادة</span></p>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            مواد نافذة أو منخفضة
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* الفواتير المعلقة */}
          <div className="card">
            <div className="p-5 border-b border-ink-100 flex items-center justify-between">
              <h3 className="font-bold text-ink-900 tracking-tight">الفواتير المعلقة</h3>
              <span className="bg-ink-100 text-ink-600 text-xs font-medium px-2.5 py-1 rounded-full">{drafts.length} فواتير</span>
            </div>
            
            {draftsLoading ? (
              <p className="text-center text-ink-500 py-8 text-sm">جارٍ التحميل...</p>
            ) : recentDrafts.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-ink-400">
                <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="text-sm">لا توجد فواتير معلقة</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-ink-50/50 text-ink-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-4 font-medium rounded-tr-lg">اسم الزبون</th>
                      <th className="p-4 font-medium">التاريخ</th>
                      <th className="p-4 font-medium">القيمة</th>
                      <th className="p-4 font-medium rounded-tl-lg"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {recentDrafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-ink-50/50 transition-colors">
                        <td className="p-4 font-medium text-ink-900">
                          {draft.customerName || 'زبون عام'}
                        </td>
                        <td className="p-4 text-ink-500">
                          {formatDraftDate(draft.updatedAt || draft.createdAt)}
                        </td>
                        <td className="p-4 font-medium text-ink-900">
                          {Number(draft.total).toLocaleString()} د.ع
                        </td>
                        <td className="p-4 text-left">
                          <button
                            onClick={() => onOpenDraft(draft)}
                            className="text-brand-600 hover:text-brand-700 font-medium text-xs bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            متابعة الدفع
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* الأكثر مبيعاً */}
          <div className="card">
            <div className="p-5 border-b border-ink-100">
              <h3 className="font-bold text-ink-900 tracking-tight">المنتجات الأكثر مبيعاً</h3>
            </div>
            {salesLoading ? (
              <p className="text-center text-ink-500 py-8 text-sm">جارٍ التحميل...</p>
            ) : topProducts.length === 0 ? (
              <p className="text-center text-ink-400 py-8 text-sm">لا توجد مبيعات مؤكدة بعد</p>
            ) : (
              <div className="p-2">
                {topProducts.map((p, i) => (
                  <div key={p.sku} className="flex items-center justify-between p-3 hover:bg-ink-50 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-ink-100 flex items-center justify-center font-bold text-ink-500 text-xs">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-ink-900 text-sm">{p.name}</p>
                        <p className="text-xs text-ink-500">SKU: {p.sku}</p>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-ink-900 bg-white border border-ink-200 px-2.5 py-1 rounded-md shadow-sm">
                      {p.quantity} قطعة
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* تنبيهات المخزون الجانبية */}
          <div className="card">
            <div className="p-5 border-b border-ink-100">
              <h3 className="font-bold text-ink-900 tracking-tight">حالة المخزون</h3>
            </div>

            {productsLoading ? (
              <p className="text-center text-ink-500 py-8 text-sm">جارٍ التحميل...</p>
            ) : alertsCount === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-emerald-500">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <p className="text-sm font-medium">جميع المنتجات متوفرة</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <button
                  onClick={() => onGoToInventory(STOCK_STATUS.OUT_OF_STOCK)}
                  disabled={outOfStock.length === 0}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    outOfStock.length > 0 
                      ? 'bg-danger-50 border-danger-100 hover:border-danger-200 hover:shadow-sm' 
                      : 'bg-ink-50 border-transparent opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${outOfStock.length > 0 ? 'bg-danger-500' : 'bg-ink-300'}`}></div>
                    <span className={`font-medium ${outOfStock.length > 0 ? 'text-danger-900' : 'text-ink-500'}`}>منتجات نافذة</span>
                  </div>
                  <span className={`text-xl font-bold ${outOfStock.length > 0 ? 'text-danger-700' : 'text-ink-400'}`}>{outOfStock.length}</span>
                </button>

                <button
                  onClick={() => onGoToInventory(STOCK_STATUS.LOW_STOCK)}
                  disabled={lowStock.length === 0}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    lowStock.length > 0 
                      ? 'bg-warn-50 border-warn-100 hover:border-warn-200 hover:shadow-sm' 
                      : 'bg-ink-50 border-transparent opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${lowStock.length > 0 ? 'bg-warn-500' : 'bg-ink-300'}`}></div>
                    <span className={`font-medium ${lowStock.length > 0 ? 'text-warn-900' : 'text-ink-500'}`}>مخزون منخفض</span>
                  </div>
                  <span className={`text-xl font-bold ${lowStock.length > 0 ? 'text-warn-700' : 'text-ink-400'}`}>{lowStock.length}</span>
                </button>
                
                <button
                  onClick={async () => {
                     const { generateAndSendShortagesPDF } = await import('../utils/pdfHelper.js');
                     generateAndSendShortagesPDF(products, toast);
                  }}
                  className="w-full mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  إرسال النواقص كـ PDF للتليجرام
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showIncomeExpensesModal && (
        <IncomeExpensesModal
          sales={sales}
          expenses={expenses}
          onClose={() => setShowIncomeExpensesModal(false)}
        />
      )}

      {showCashReconciliationModal && (
        <CashReconciliationModal
          currentCalculatedCash={actualOfficeCash}
          onClose={() => setShowCashReconciliationModal(false)}
        />
      )}

      {showAddIncomeModal && (
        <AddIncomeModal
          onClose={() => setShowAddIncomeModal(false)}
        />
      )}
    </div>
  );
}
