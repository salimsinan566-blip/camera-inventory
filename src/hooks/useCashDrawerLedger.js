import { useMemo } from 'react';
import { useSales } from './useSales';
import { useExpenses } from './useExpenses';
import { usePurchases } from './usePurchases';
import { useIncomes } from './useIncomes';
import { useEmployeeAdvances } from './useEmployeeAdvances';
import { useEmployeeReimbursements } from './useEmployeeReimbursements';
import { useCashReconciliation } from './useCashReconciliation';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate();
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? null : d;
}

function getIsoDateStr(d) {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  return dateObj.toISOString().slice(0, 10);
}

function formatTimeOnly(d) {
  if (!d) return '—';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '—';
  return dateObj.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Hook متكامل لحساب وتتبع حركات وأرصدة نقد الصندوق اليومية والتاريخية
 * متطابق 100% مع رصيد الصندوق الحي في لوحة التحكم وتاريخ التسويات المعتمدة.
 */
export function useCashDrawerLedger(selectedDateStr) {
  const { sales, loading: salesLoading } = useSales();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { purchases, debtPayments: supplierDebtPayments } = usePurchases();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { advances } = useEmployeeAdvances();
  const { reimbursements } = useEmployeeReimbursements();
  const { latestReconciliation, reconciliations } = useCashReconciliation();

  const loading = salesLoading || expensesLoading || incomesLoading;

  const todayStr = new Date().toISOString().slice(0, 10);
  const targetDateStr = selectedDateStr || todayStr;

  // 1. حساب النقد الفعلي الحي المعتمد بالصندوق الآن (مطابق تماماً للوحة التحكم HomeDashboard)
  const currentLiveOfficeCash = useMemo(() => {
    if (latestReconciliation && latestReconciliation.date) {
      const recDate = new Date(latestReconciliation.date);
      const baseAmount = Number(latestReconciliation.actualCashAmount) || 0;

      let inflowSince = 0;
      (sales || []).forEach((s) => {
        const sDate = toDateSafe(s.createdAt || s.confirmedAt);
        if (sDate && sDate > recDate) {
          const isCard = s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard';
          if (s.invoiceType === 'cash' || !s.invoiceType) {
            if (!isCard) inflowSince += Number(s.total || 0);
          } else if (s.invoiceType === 'debt') {
            if (s.payments && Array.isArray(s.payments) && s.payments.length > 0) {
              s.payments.forEach((p) => {
                const isPCard = p.paymentMethod === 'mastercard' || String(p.paymentMethod || '').includes('ماستر') || String(p.paymentMethod || '').includes('مصرف');
                if (!isPCard) inflowSince += Number(p.amount || 0);
              });
            } else {
              inflowSince += Number(s.paidAmount || 0);
            }
          }
        }
      });

      // دفعات الديون اللاحقة لفواتير مسجلة قبل تاريخ التسوية
      (sales || []).forEach((s) => {
        const sDate = toDateSafe(s.createdAt || s.confirmedAt);
        if (s.invoiceType === 'debt' && sDate && sDate <= recDate) {
          if (s.payments && Array.isArray(s.payments)) {
            s.payments.forEach((p) => {
              const pDate = p.date ? new Date(p.date) : null;
              if (pDate && pDate > recDate) {
                const isPCard = p.paymentMethod === 'mastercard' || String(p.paymentMethod || '').includes('ماستر') || String(p.paymentMethod || '').includes('مصرف');
                if (!isPCard) inflowSince += Number(p.amount || 0);
              }
            });
          }
        }
      });

      (incomes || []).forEach((inc) => {
        const isCard = inc.paymentMethod === 'mastercard' || inc.paymentMethod === 'card' || String(inc.paymentMethod || '').includes('ماستر');
        if (!isCard) {
          const createdDate = inc.createdAt ? new Date(inc.createdAt) : null;
          const docDate = inc.date ? new Date(inc.date) : null;
          if ((createdDate && createdDate > recDate) || (docDate && docDate > recDate)) {
            inflowSince += Number(inc.amount || 0);
          }
        }
      });

      // استرجاع سلف الموظفين للقاصة
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
      (expenses || []).forEach((e) => {
        if (e.paymentSource !== 'management') {
          const eDate = e.createdAt ? new Date(e.createdAt) : (e.date ? new Date(e.date) : null);
          if (eDate && eDate > recDate) {
            outflowSince += Number(e.amount || 0);
          }
        }
      });

      (purchases || []).forEach((p) => {
        const pDate = p.createdAt ? new Date(p.createdAt) : (p.date ? new Date(p.date) : null);
        if (pDate && pDate > recDate) {
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

      (advances || []).forEach((a) => {
        const aDate = new Date(a.date || a.createdAt);
        if (aDate > recDate) {
          outflowSince += Number(a.amount || 0);
        }
      });

      return baseAmount + inflowSince - outflowSince;
    }

    // إذا لم تكن هناك تسوية سابقة: حساب تراكمي كامل
    const allDirectCashSales = (sales || [])
      .filter((s) => (s.invoiceType === 'cash' || !s.invoiceType) && s.paymentMethod !== 'mastercard')
      .reduce((sum, s) => sum + Number(s.total || 0), 0);

    const allDebtPayments = (sales || [])
      .filter((s) => s.invoiceType === 'debt')
      .reduce((sum, s) => {
        if (s.payments && Array.isArray(s.payments) && s.payments.length > 0) {
          return sum + s.payments
            .filter((p) => p.paymentMethod !== 'mastercard' && !String(p.paymentMethod || '').includes('ماستر') && !String(p.paymentMethod || '').includes('مصرف'))
            .reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
        }
        return sum + Number(s.paidAmount || 0);
      }, 0);

    const allManualIncomes = (incomes || [])
      .filter((inc) => inc.paymentMethod !== 'mastercard' && inc.paymentMethod !== 'card' && !String(inc.paymentMethod || '').includes('ماستر'))
      .reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);

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

    const allDrawerExpenses = (expenses || [])
      .filter((e) => e.paymentSource !== 'management')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const allCashPurchases = (purchases || []).reduce((sum, p) => {
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

  // 2. تجميع وتوحيد كل الحركات النقدية اليومية
  const allRawCashEvents = useMemo(() => {
    const events = [];

    // أ) المبيعات النقدية المباشرة (Confirmed Cash Sales)
    (sales || []).forEach((s) => {
      if (s.status !== 'confirmed') return;
      const isCard = s.invoiceType === 'mastercard' || s.paymentMethod === 'mastercard';
      if (isCard) return;

      const sDate = toDateSafe(s.createdAt || s.confirmedAt || s.date);
      if (!sDate) return;

      if (s.invoiceType === 'cash' || !s.invoiceType) {
        const totalAmt = Number(s.total || 0);
        if (totalAmt > 0) {
          events.push({
            id: `sale_${s.id || s.invoiceNumber}`,
            date: sDate,
            dateStr: getIsoDateStr(sDate),
            type: 'cash_sale',
            typeLabel: 'فاتورة بيع نقدية',
            direction: 'in',
            amount: totalAmt,
            title: `فاتورة مبيعات نقدية #${s.invoiceNumber || s.id?.slice(-4)}`,
            subtitle: s.customerName ? `الزبون: ${s.customerName}` : 'زبون نقدي عام',
            user: s.cashierEmail || 'الكاشير',
            raw: s
          });
        }
      } else if (s.invoiceType === 'debt') {
        const initialPaid = Number(s.paidAmount || 0);
        const hasPaymentArray = Array.isArray(s.payments) && s.payments.length > 0;
        
        if (!hasPaymentArray && initialPaid > 0) {
          events.push({
            id: `debt_init_${s.id || s.invoiceNumber}`,
            date: sDate,
            dateStr: getIsoDateStr(sDate),
            type: 'customer_debt_repayment',
            typeLabel: 'دفعة نقدية مع فاتورة آجل',
            direction: 'in',
            amount: initialPaid,
            title: `دفعة أولية فاتورة #${s.invoiceNumber || s.id?.slice(-4)}`,
            subtitle: s.customerName ? `الزبون: ${s.customerName}` : 'زبون آجل',
            user: s.cashierEmail || 'الكاشير',
            raw: s
          });
        }
      }
    });

    // ب) دفعات تسديد ديون العملاء اللاحقة (Customer Debt Repayments)
    (sales || []).forEach((s) => {
      if (s.invoiceType === 'debt' && Array.isArray(s.payments)) {
        s.payments.forEach((pay, idx) => {
          const isCard = pay.paymentMethod === 'mastercard' || String(pay.paymentMethod || '').includes('ماستر') || String(pay.paymentMethod || '').includes('مصرف');
          if (isCard) return;

          const pDate = toDateSafe(pay.date || pay.createdAt);
          const pAmount = Number(pay.amount || 0);
          if (pDate && pAmount > 0) {
            events.push({
              id: `debt_pay_${s.id}_${idx}`,
              date: pDate,
              dateStr: getIsoDateStr(pDate),
              type: 'customer_debt_repayment',
              typeLabel: 'تسديد دين عميل',
              direction: 'in',
              amount: pAmount,
              title: `تسديد دين - فاتورة #${s.invoiceNumber || s.id?.slice(-4)}`,
              subtitle: s.customerName ? `العميل: ${s.customerName} ${pay.notes ? `(${pay.notes})` : ''}` : (pay.notes || 'تسديد دين'),
              user: pay.receivedBy || s.cashierEmail || 'المسؤول',
              raw: { sale: s, payment: pay }
            });
          }
        });
      }
    });

    // ج) الإيداعات ومبالغ الدخل الإضافية للقاصة (Office Incomes / Deposits)
    (incomes || []).forEach((inc) => {
      const isCard = inc.paymentMethod === 'mastercard' || inc.paymentMethod === 'card' || String(inc.paymentMethod || '').includes('ماستر');
      if (isCard) return;

      const incDate = toDateSafe(inc.date || inc.createdAt);
      const incAmount = Number(inc.amount || 0);
      if (incDate && incAmount > 0) {
        events.push({
          id: `income_${inc.id}`,
          date: incDate,
          dateStr: getIsoDateStr(incDate),
          type: 'manual_income',
          typeLabel: 'إيداع / إيراد نقدي',
          direction: 'in',
          amount: incAmount,
          title: inc.title || 'إيداع نقدي في القاصة',
          subtitle: `${inc.category || 'دخل إضافي'}${inc.customerName ? ` • من: ${inc.customerName}` : ''}${inc.notes ? ` (${inc.notes})` : ''}`,
          user: inc.createdBy || 'المسؤول',
          raw: inc
        });
      }
    });

    // د) تسديدات سلف الموظفين المستردة نقداً للصندوق (Employee Advance Repayments)
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

      paymentsList.forEach((pay, idx) => {
        if (pay.repaymentMethod === 'cash_drawer' || !pay.repaymentMethod) {
          const payDate = toDateSafe(pay.date || a.lastRepaymentDate || a.updatedAt || a.date);
          const payAmt = Number(pay.amount || 0);
          if (payDate && payAmt > 0) {
            events.push({
              id: `adv_repay_${a.id}_${idx}`,
              date: payDate,
              dateStr: getIsoDateStr(payDate),
              type: 'advance_repayment',
              typeLabel: 'استرجاع سلفة موظف',
              direction: 'in',
              amount: payAmt,
              title: `تسديد سلفة نقدية للقاصة`,
              subtitle: `الموظف: ${a.employeeName}${pay.notes ? ` (${pay.notes})` : ''}`,
              user: a.createdBy || 'المسؤول',
              raw: { advance: a, payment: pay }
            });
          }
        }
      });
    });

    // هـ) المصاريف والنثريات اليومية والتشغيلية (Expenses)
    (expenses || []).forEach((e) => {
      if (e.paymentSource === 'management') return;
      const eDate = toDateSafe(e.date || e.createdAt);
      const eAmount = Number(e.amount || 0);
      if (eDate && eAmount > 0) {
        events.push({
          id: `exp_${e.id}`,
          date: eDate,
          dateStr: getIsoDateStr(eDate),
          type: 'expense',
          typeLabel: 'مصروف ونثريات',
          direction: 'out',
          amount: eAmount,
          title: e.title || 'مصروف نقدي',
          subtitle: `${e.category || 'نثريات'}${e.buyerName ? ` • المنفذ: ${e.buyerName}` : ''}${e.notes ? ` (${e.notes})` : ''}`,
          user: e.createdBy || 'المسؤول',
          raw: e
        });
      }
    });

    // و) المشتريات المسددة نقداً من القاصة (Cash Purchases)
    (purchases || []).forEach((p) => {
      const pDate = toDateSafe(p.date || p.createdAt);
      const actualDrawerPaid = p.paidFromCashDrawerAmount !== undefined && p.paidFromCashDrawerAmount !== null
        ? Number(p.paidFromCashDrawerAmount)
        : Number(p.paidAmount || 0);

      if (pDate && actualDrawerPaid > 0) {
        events.push({
          id: `purch_${p.id}`,
          date: pDate,
          dateStr: getIsoDateStr(pDate),
          type: 'purchase',
          typeLabel: 'سداد مشتريات بضاعة',
          direction: 'out',
          amount: actualDrawerPaid,
          title: `شراء بضاعة فاتورة #${p.invoiceNumber || p.id?.slice(-4)}`,
          subtitle: `المورد: ${p.supplierName || 'مورد عام'}${p.notes ? ` (${p.notes})` : ''}`,
          user: p.createdBy || 'المسؤول',
          raw: p
        });
      }
    });

    // ز) تسديدات ديون الموردين من القاصة (Supplier Debt Payments)
    (supplierDebtPayments || []).forEach((sp, idx) => {
      const spDate = toDateSafe(sp.date || sp.createdAt);
      const spAmt = Number(sp.amount || 0);
      if (spDate && spAmt > 0) {
        events.push({
          id: `sup_pay_${sp.id || idx}`,
          date: spDate,
          dateStr: getIsoDateStr(spDate),
          type: 'supplier_payment',
          typeLabel: 'تسديد دين مورد',
          direction: 'out',
          amount: spAmt,
          title: `تسديد دفعة حساب لمورد`,
          subtitle: `المورد: ${sp.supplierName || 'مورد'}${sp.notes ? ` (${sp.notes})` : ''}`,
          user: sp.createdBy || 'المسؤول',
          raw: sp
        });
      }
    });

    // ح) السلف النقدية المصروفة للموظفين من القاصة (Employee Advances Given)
    (advances || []).forEach((a) => {
      const aDate = toDateSafe(a.date || a.createdAt);
      const aAmt = Number(a.amount || 0);
      if (aDate && aAmt > 0) {
        events.push({
          id: `adv_given_${a.id}`,
          date: aDate,
          dateStr: getIsoDateStr(aDate),
          type: 'advance_give',
          typeLabel: 'صرف سلفة موظف',
          direction: 'out',
          amount: aAmt,
          title: `صرف سلفة نقدية من القاصة`,
          subtitle: `الموظف: ${a.employeeName} • ${a.reason || 'سلفة'}${a.notes ? ` (${a.notes})` : ''}`,
          user: a.createdBy || 'المسؤول',
          raw: a
        });
      }
    });

    // ط) تعويضات مشتريات الموظفين المسددة من القاصة (Employee Reimbursements)
    (reimbursements || []).forEach((r) => {
      if (r.status === 'reimbursed' && r.reimbursementSource === 'cash_drawer') {
        const rDate = toDateSafe(r.reimbursedAt || r.updatedAt || r.createdAt);
        const rAmt = Number(r.reimbursedAmount || r.amount || 0);
        if (rDate && rAmt > 0) {
          events.push({
            id: `reimb_${r.id}`,
            date: rDate,
            dateStr: getIsoDateStr(rDate),
            type: 'reimbursement',
            typeLabel: 'تعويض مشتريات موظف',
            direction: 'out',
            amount: rAmt,
            title: `تعويض نفقات من القاصة`,
            subtitle: `الموظف: ${r.employeeName} • ${r.title || 'مشتريات للمحل'}`,
            user: r.reimbursedBy || 'المسؤول',
            raw: r
          });
        }
      }
    });

    // فرز جميع الحركات تصاعدياً حسب التوقيت الزمني الدقيق (من الأقدم للأحدث)
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sales, expenses, purchases, supplierDebtPayments, incomes, advances, reimbursements]);

  // 3. تجميع الحركات اليومية بحسب التواريخ (Daily Net Deltas)
  const dailyMetricsMap = useMemo(() => {
    const map = new Map();

    allRawCashEvents.forEach((evt) => {
      const d = evt.dateStr;
      if (!map.has(d)) {
        map.set(d, {
          inflows: 0,
          outflows: 0,
          net: 0,
          events: []
        });
      }
      const entry = map.get(d);
      entry.events.push(evt);
      if (evt.direction === 'in') {
        entry.inflows += evt.amount;
        entry.net += evt.amount;
      } else if (evt.direction === 'out') {
        entry.outflows += evt.amount;
        entry.net -= evt.amount;
      }
    });

    return map;
  }, [allRawCashEvents]);

  // 4. استخراج تفاصيل وإحصائيات اليوم المختار وتحديد رصيد الافتتاح والإغلاق
  const daySummary = useMemo(() => {
    const dayEntry = dailyMetricsMap.get(targetDateStr) || { inflows: 0, outflows: 0, net: 0, events: [] };
    const dayEvents = [...dayEntry.events].sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalInflowAmount = dayEntry.inflows;
    const totalOutflowAmount = dayEntry.outflows;
    const netChange = dayEntry.net;

    // حساب الرصيد المتسلسل رجوعاً من الرصيد الحي الحالي (currentLiveOfficeCash)
    let closingBalance = 0;
    let openingBalance = 0;

    if (targetDateStr === todayStr) {
      // اليوم الحالي: رصيد الإغلاق هو النقد الفعلي الحي المتاح بالصندوق الآن
      closingBalance = currentLiveOfficeCash;
      openingBalance = closingBalance - netChange;
    } else if (targetDateStr > todayStr) {
      // تاريخ مستقبلي
      openingBalance = currentLiveOfficeCash;
      closingBalance = openingBalance + netChange;
    } else {
      // تاريخ في الماضي: نرجع للخلف من اليوم الحالي بطرح صافي تغير الأيام التي بينهما
      // نجمع كل صافي الأيام اللاحقة لليوم المختار وحتى اليوم الحالي
      let deltaSinceTarget = 0;
      
      // صافي اليوم الحالي
      const todayEntry = dailyMetricsMap.get(todayStr);
      if (todayEntry) {
        deltaSinceTarget += todayEntry.net;
      }

      // صافي الأيام التي بين اليوم المختار واليوم الحالي
      dailyMetricsMap.forEach((entry, dStr) => {
        if (dStr > targetDateStr && dStr < todayStr) {
          deltaSinceTarget += entry.net;
        }
      });

      // رصيد إغلاق ذلك اليوم في الماضي = الرصيد الحي الحالي - كل التغيرات التي حدثت بعد ذلك اليوم
      closingBalance = currentLiveOfficeCash - deltaSinceTarget;
      openingBalance = closingBalance - netChange;
    }

    // بناء جدول الحركات لليوم المختار مع الرصيد التراكمي بعد كل حركة
    let running = openingBalance;
    const transactionsWithRunningBalance = dayEvents.map((evt) => {
      const balanceBefore = running;
      if (evt.direction === 'in') {
        running += evt.amount;
      } else if (evt.direction === 'out') {
        running -= evt.amount;
      }
      const balanceAfter = running;

      return {
        ...evt,
        timeFormatted: formatTimeOnly(evt.date),
        balanceBefore,
        runningBalance: balanceAfter
      };
    });

    const dayInflows = dayEvents.filter((e) => e.direction === 'in');
    const dayOutflows = dayEvents.filter((e) => e.direction === 'out');

    return {
      targetDateStr,
      openingBalance,
      totalInflowAmount,
      totalOutflowAmount,
      netChange,
      closingBalance,
      inflowsCount: dayInflows.length,
      outflowsCount: dayOutflows.length,
      auditsCount: 0,
      transactions: [...transactionsWithRunningBalance].reverse(), // الأحدث أولاً في العرض
      transactionsChronological: transactionsWithRunningBalance // الزمني للطباعة
    };
  }, [dailyMetricsMap, targetDateStr, todayStr, currentLiveOfficeCash]);

  // قائمة بأيام سريعة للاختيار
  const quickDateOptions = useMemo(() => {
    const options = [];
    const now = new Date();

    const labels = [
      { daysAgo: 0, label: 'اليوم' },
      { daysAgo: 1, label: 'أمس' },
      { daysAgo: 2, label: 'قبل يومين' },
      { daysAgo: 3, label: 'قبل 3 أيام' },
      { daysAgo: 4, label: 'قبل 4 أيام' },
      { daysAgo: 7, label: 'قبل أسبوع' },
      { daysAgo: 30, label: 'قبل شهر' }
    ];

    labels.forEach(({ daysAgo, label }) => {
      const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      options.push({
        label,
        dateStr: d.toISOString().slice(0, 10),
        displayDate: d.toLocaleDateString('ar-IQ', { weekday: 'short', month: 'short', day: 'numeric' })
      });
    });

    return options;
  }, []);

  return {
    loading,
    targetDateStr,
    currentLiveOfficeCash,
    daySummary,
    quickDateOptions,
    totalHistoricalEvents: allRawCashEvents.length
  };
}
