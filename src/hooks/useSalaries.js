import { useState, useEffect, useMemo } from 'react';
import { subscribeToEmployees } from '../services/salariesService';

/**
 * حساب فارق الأيام التقويمية بين اليوم وتاريخ الاستحقاق
 */
export function getDaysRemaining(nextDueDateStr) {
  if (!nextDueDateStr) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(nextDueDateStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * استخراج حالة الاستحقاق والتنسيق اللوني
 */
export function getDueStatus(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) {
    return { label: 'غير محدد', status: 'unknown', color: 'slate', badgeBg: 'bg-slate-100 text-slate-800 border-slate-200' };
  }

  if (daysRemaining < 0) {
    const days = Math.abs(daysRemaining);
    return {
      label: `متأخر منذ ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : `${days} أيام`} ⚠️`,
      status: 'overdue',
      color: 'red',
      badgeBg: 'bg-red-50 text-red-700 border-red-200 font-bold',
      cardBorder: 'border-red-400 bg-red-50/20'
    };
  }

  if (daysRemaining === 0) {
    return {
      label: 'مستحق اليوم! 🔔',
      status: 'due_today',
      color: 'amber',
      badgeBg: 'bg-amber-100 text-amber-900 border-amber-300 font-black animate-pulse',
      cardBorder: 'border-amber-400 bg-amber-50/30'
    };
  }

  if (daysRemaining <= 3) {
    return {
      label: `قريب: متبقي ${daysRemaining === 1 ? 'يوم واحد' : daysRemaining === 2 ? 'يومان' : `${daysRemaining} أيام`}`,
      status: 'soon',
      color: 'orange',
      badgeBg: 'bg-orange-50 text-orange-800 border-orange-200 font-bold',
      cardBorder: 'border-orange-200 bg-orange-50/10'
    };
  }

  return {
    label: `متبقي ${daysRemaining} يوم`,
    status: 'upcoming',
    color: 'emerald',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    cardBorder: 'border-slate-200 hover:border-indigo-300'
  };
}

export function useSalaries() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToEmployees((list) => {
      setEmployees(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // حساب الإحصائيات والأرقام التجميعية
  const stats = useMemo(() => {
    let totalPayrollEstimated = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    let activeCount = 0;
    let totalPaidThisMonth = 0;
    let totalAdvanceDebt = 0;

    const currentMonthStr = new Date().toISOString().slice(0, 7);

    employees.forEach((emp) => {
      const isActive = emp.status !== 'inactive';
      if (isActive) activeCount++;

      const salaryAmt = Number(emp.salaryAmount) || 0;
      if (isActive) {
        if (emp.salaryType === 'monthly') totalPayrollEstimated += salaryAmt;
        else if (emp.salaryType === 'weekly') totalPayrollEstimated += salaryAmt * 4.33;
        else if (emp.salaryType === 'daily') totalPayrollEstimated += salaryAmt * 30;
      }

      // الإحصائيات الشهرية والديون
      const isCurrentMonth = emp.lastMonthReset === currentMonthStr;
      if (isCurrentMonth) {
        totalPaidThisMonth += Number(emp.totalPaidThisMonth) || 0;
      }
      totalAdvanceDebt += Number(emp.currentAdvanceDebt) || 0;

      // فحص الأيام المتبقية
      if (isActive) {
        const days = getDaysRemaining(emp.nextDueDate);
        if (days !== null) {
          if (days < 0) overdueCount++;
          else if (days === 0) dueTodayCount++;
          else upcomingCount++;
        }
      }
    });

    return {
      totalPayrollEstimated: Math.round(totalPayrollEstimated),
      dueTodayCount,
      overdueCount,
      upcomingCount,
      activeCount,
      totalPaidThisMonth,
      totalAdvanceDebt,
      totalEmployees: employees.length
    };
  }, [employees]);

  return {
    employees,
    stats,
    loading
  };
}
