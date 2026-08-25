import React, { useState, useMemo } from 'react';
import { useSalaries, getDaysRemaining, getDueStatus } from '../hooks/useSalaries';
import {
  addEmployee,
  updateEmployee,
  deleteEmployee,
  payEmployeeSalary,
  getEmployeePaymentHistory
} from '../services/salariesService';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../hooks/useAuth';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

const WEEK_DAYS = [
  { val: 6, label: 'السبت' },
  { val: 0, label: 'الأحد' },
  { val: 1, label: 'الإثنين' },
  { val: 2, label: 'الثلاثاء' },
  { val: 3, label: 'الأربعاء' },
  { val: 4, label: 'الخميس' },
  { val: 5, label: 'الجمعة' },
];

export default function SalariesScreen() {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const { employees, stats, loading } = useSalaries();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'monthly' | 'weekly' | 'daily'
  const [dueFilter, setDueFilter] = useState('all'); // 'all' | 'due_today' | 'overdue' | 'upcoming'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  // Modals state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);

  const [payingEmployee, setPayingEmployee] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);

  const [historyEmployee, setHistoryEmployee] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form: Add/Edit Employee
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('موظف');
  const [formSalaryAmount, setFormSalaryAmount] = useState('');
  const [formSalaryType, setFormSalaryType] = useState('monthly');
  const [formPayCycleDay, setFormPayCycleDay] = useState(1);
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formStatus, setFormStatus] = useState('active');
  const [formNotes, setFormNotes] = useState('');
  const [savingEmployee, setSavingEmployee] = useState(false);

  // Form: Pay Salary / Advance
  const [payAmount, setPayAmount] = useState('');
  const [paySource, setPaySource] = useState('cash_drawer'); // 'cash_drawer' | 'management'
  const [payType, setPayType] = useState('full_salary'); // 'full_salary' | 'advance' | 'bonus'
  const [payAdvanceDeduction, setPayAdvanceDeduction] = useState(0);
  const [payPeriod, setPayPeriod] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  // Handle open add modal
  const handleOpenAddEmployee = () => {
    setEditingEmployee(null);
    setFormName('');
    setFormPhone('');
    setFormJobTitle('فني كاميرات ومبيعات');
    setFormSalaryAmount('');
    setFormSalaryType('monthly');
    setFormPayCycleDay(1);
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormStatus('active');
    setFormNotes('');
    setShowEmployeeModal(true);
  };

  // Handle open edit modal
  const handleOpenEditEmployee = (emp) => {
    setEditingEmployee(emp);
    setFormName(emp.name || '');
    setFormPhone(emp.phone || '');
    setFormJobTitle(emp.jobTitle || 'موظف');
    setFormSalaryAmount(emp.salaryAmount || '');
    setFormSalaryType(emp.salaryType || 'monthly');
    setFormPayCycleDay(emp.payCycleDay || 1);
    setFormStartDate(emp.startDate || new Date().toISOString().slice(0, 10));
    setFormStatus(emp.status || 'active');
    setFormNotes(emp.notes || '');
    setShowEmployeeModal(true);
  };

  // Save employee (Add or Edit)
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    const cleanName = formName.trim();
    const numSalary = Number(formSalaryAmount);

    if (!cleanName) {
      toast('يرجى إدخال اسم الموظف', 'error');
      return;
    }
    if (isNaN(numSalary) || numSalary <= 0) {
      toast('يرجى إدخال راتب صحيح أكبر من الصفر', 'error');
      return;
    }

    setSavingEmployee(true);
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, {
          name: cleanName,
          phone: formPhone.trim(),
          jobTitle: formJobTitle.trim(),
          salaryAmount: numSalary,
          salaryType: formSalaryType,
          payCycleDay: Number(formPayCycleDay) || 1,
          startDate: formStartDate,
          status: formStatus,
          notes: formNotes.trim()
        });
        toast('تم تحديث بيانات الموظف بنجاح!', 'success');
      } else {
        await addEmployee({
          name: cleanName,
          phone: formPhone.trim(),
          jobTitle: formJobTitle.trim(),
          salaryAmount: numSalary,
          salaryType: formSalaryType,
          payCycleDay: Number(formPayCycleDay) || 1,
          startDate: formStartDate,
          notes: formNotes.trim(),
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
        });
        toast(`تمت إضافة الموظف "${cleanName}" بنجاح! 👤`, 'success');
      }
      setShowEmployeeModal(false);
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSavingEmployee(false);
    }
  };

  // Delete employee
  const handleDeleteEmployee = (emp) => {
    confirm(
      'حذف الموظف',
      `هل أنت متأكد من حذف الموظف "${emp.name}"؟ سيتم حذف بياناته من النظام.`,
      async () => {
        try {
          await deleteEmployee(emp.id);
          toast('تم حذف الموظف بنجاح', 'success');
        } catch (err) {
          toast(`فشل الحذف: ${err.message}`, 'error');
        }
      }
    );
  };

  // Open Pay Modal
  const handleOpenPayModal = (emp) => {
    setPayingEmployee(emp);
    setPayType('full_salary');
    setPayAmount(emp.salaryAmount || '');
    setPaySource('cash_drawer');
    setPayAdvanceDeduction(0);
    setPayDate(new Date().toISOString().slice(0, 10));

    // Default period label
    const now = new Date();
    if (emp.salaryType === 'monthly') {
      const monthNames = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
      setPayPeriod(`راتب شهر ${monthNames[now.getMonth()]} ${now.getFullYear()}`);
    } else if (emp.salaryType === 'weekly') {
      setPayPeriod(`راتب الأسبوع الحالي (${now.toLocaleDateString('ar-IQ')})`);
    } else {
      setPayPeriod(`أجر يوم ${now.toLocaleDateString('ar-IQ')}`);
    }

    setPayNotes('');
    setShowPayModal(true);
  };

  // Execute Salary / Advance Payment
  const handleExecutePayment = async (e) => {
    e.preventDefault();
    if (!payingEmployee) return;

    const numAmount = Number(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast('يرجى إدخال مبلغ صحيح للصرف', 'error');
      return;
    }

    setProcessingPay(true);
    try {
      await payEmployeeSalary({
        employeeId: payingEmployee.id,
        employeeName: payingEmployee.name,
        amount: numAmount,
        paymentSource: paySource,
        paymentType: payType,
        advanceDeduction: Number(payAdvanceDeduction) || 0,
        salaryType: payingEmployee.salaryType,
        payCycleDay: payingEmployee.payCycleDay,
        currentDueDate: payingEmployee.nextDueDate,
        periodCovered: payPeriod,
        notes: payNotes,
        paymentDate: payDate ? new Date(payDate).toISOString() : new Date().toISOString(),
        paidBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      const sourceText = paySource === 'cash_drawer' ? 'من القاصة 💵' : 'من المدير 🏦';
      toast(`تم صرف ${formatIQD(numAmount)} د.ع للموظف "${payingEmployee.name}" (${sourceText}) بنجاح!`, 'success');
      setShowPayModal(false);
    } catch (err) {
      toast(`فشل تسجيل الصرف: ${err.message}`, 'error');
    } finally {
      setProcessingPay(false);
    }
  };

  // Open Payment History (Lazy Loaded to save quota)
  const handleOpenHistory = async (emp) => {
    setHistoryEmployee(emp);
    setHistoryLoading(true);
    setHistoryList([]);
    try {
      const records = await getEmployeePaymentHistory(emp.id, 30);
      setHistoryList(records);
    } catch (err) {
      toast('فشل جلب سجل المدفوعات: ' + err.message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const nameMatch = emp.name?.toLowerCase().includes(term);
        const phoneMatch = emp.phone?.includes(term);
        const jobMatch = emp.jobTitle?.toLowerCase().includes(term);
        if (!nameMatch && !phoneMatch && !jobMatch) return false;
      }

      // Salary Type
      if (typeFilter !== 'all' && emp.salaryType !== typeFilter) return false;

      // Due Filter
      if (dueFilter !== 'all') {
        const days = getDaysRemaining(emp.nextDueDate);
        if (dueFilter === 'due_today' && days !== 0) return false;
        if (dueFilter === 'overdue' && (days === null || days >= 0)) return false;
        if (dueFilter === 'upcoming' && (days === null || days <= 0)) return false;
        if (dueFilter === 'inactive' && emp.status !== 'inactive') return false;
      }

      return true;
    });
  }, [employees, searchTerm, typeFilter, dueFilter]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6" dir="rtl">
      {/* Header & Quick Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <span>👥💵</span>
            <span>قسم رواتب ومستحقات الموظفين</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            إدارة موظفي المحل، متابعة الأيام المتبقية لموعد الرواتب، والصرف من القاصة أو المدير
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddEmployee}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-sm font-bold py-2.5 px-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>➕</span>
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estimated Payroll */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 p-5 rounded-2xl border border-indigo-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900">إجمالي الرواتب الدورية</span>
            <span className="p-2 bg-indigo-500/10 text-indigo-700 rounded-xl text-lg">💼</span>
          </div>
          <p className="text-2xl font-black text-indigo-950 mt-2 font-mono">
            {formatIQD(stats.totalPayrollEstimated)} <span className="text-xs font-normal text-indigo-800">د.ع / شهر</span>
          </p>
          <p className="text-[11px] text-indigo-700 mt-1">{stats.activeCount} موظف على رأس العمل</p>
        </div>

        {/* Due Today & Overdue Alerts */}
        <div className={`p-5 rounded-2xl border shadow-2xs transition-all ${
          stats.dueTodayCount > 0 || stats.overdueCount > 0
            ? 'bg-gradient-to-br from-amber-50 to-rose-50 border-amber-300'
            : 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">الرواتب المستحقة والمتأخرة</span>
            <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl text-lg">🔔</span>
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-2xl font-black text-amber-950 font-mono">
              {stats.dueTodayCount} <span className="text-xs font-bold text-amber-700">اليوم</span>
            </p>
            {stats.overdueCount > 0 && (
              <span className="text-xs font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-200 animate-pulse">
                {stats.overdueCount} متأخر ⚠️
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 mt-1">تنبيهات فورية لمواعيد الصرف</p>
        </div>

        {/* Total Paid This Month */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">المدفوع هذا الشهر</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl text-lg">💸</span>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-2 font-mono">
            {formatIQD(stats.totalPaidThisMonth)} <span className="text-xs font-normal text-emerald-800">د.ع</span>
          </p>
          <p className="text-[11px] text-emerald-700 mt-1">رواتب وسلف مسددة خلال الشهر</p>
        </div>

        {/* Active Advance Debts */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 rounded-2xl border border-purple-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-900">سلف وذمم الموظفين القائمة</span>
            <span className="p-2 bg-purple-500/10 text-purple-700 rounded-xl text-lg">📑</span>
          </div>
          <p className="text-2xl font-black text-purple-950 mt-2 font-mono">
            {formatIQD(stats.totalAdvanceDebt)} <span className="text-xs font-normal text-purple-800">د.ع</span>
          </p>
          <p className="text-[11px] text-purple-700 mt-1">تستقطع تلقائياً من الراتب القادم</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم الموظف، المسمى الوظيفي، أو الهاتف..."
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by Salary Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">كل الدورات (شهري / أسبوعي / يومي)</option>
            <option value="monthly">📅 رواتب شهرية</option>
            <option value="weekly">🗓️ رواتب أسبوعية</option>
            <option value="daily">☀️ رواتب يومية</option>
          </select>

          {/* Filter by Due Status */}
          <select
            value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">كافة الحالات</option>
            <option value="due_today">🔔 مستحق اليوم</option>
            <option value="overdue">⚠️ متأخر عن موعده</option>
            <option value="upcoming">🟢 قادم لاحقاً</option>
            <option value="inactive">⏸️ موظفون متوقفون</option>
          </select>

          {/* Toggle View Mode */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500'
              }`}
              title="عرض الشبكة (بطاقات)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500'
              }`}
              title="عرض الجدول"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <svg className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          <p className="text-xs font-bold">جارٍ تحميل بيانات الموظفين والرواتب...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <span className="text-5xl block mb-3">👥</span>
          <h3 className="text-base font-bold text-slate-700">لا يوجد موظفون مطابقون</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            لم يتم العثور على موظفين في هذا التصنيف. يمكنك إضافة موظف جديد وتحديد نوع الراتب وتاريخ الاستحقاق.
          </p>
          <button
            type="button"
            onClick={handleOpenAddEmployee}
            className="mt-4 bg-indigo-600 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow hover:bg-indigo-700 cursor-pointer"
          >
            + إضافة موظف جديد الآن
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEmployees.map((emp) => {
            const daysRemaining = getDaysRemaining(emp.nextDueDate);
            const dueStatus = getDueStatus(daysRemaining);
            const isInactive = emp.status === 'inactive';
            const advanceDebt = Number(emp.currentAdvanceDebt) || 0;

            const typeLabel = emp.salaryType === 'monthly'
              ? `شهري (يوم ${emp.payCycleDay || 1})`
              : emp.salaryType === 'weekly'
              ? `أسبوعي (${WEEK_DAYS.find(w => w.val === Number(emp.payCycleDay))?.label || 'الخميس'})`
              : 'يومي (كل يوم)';

            return (
              <div
                key={emp.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                  daysRemaining !== null && daysRemaining < 0
                    ? 'border-red-300 ring-1 ring-red-200'
                    : daysRemaining === 0
                    ? 'border-amber-400 ring-2 ring-amber-300/60'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div>
                  {/* Top Header: Avatar, Name, Job Title & Status */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-black text-base shrink-0 shadow-sm">
                        {emp.name?.charAt(0) || '👤'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-slate-900 truncate">
                            {emp.name}
                          </h3>
                          {isInactive && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold border border-slate-200">
                              متوقف
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5 flex items-center gap-1">
                          <span>💼 {emp.jobTitle || 'موظف'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Salary Cycle Pill */}
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 shrink-0 whitespace-nowrap">
                      {typeLabel}
                    </span>
                  </div>

                  {/* Highlighted Remaining Days Banner */}
                  <div className={`p-3 rounded-xl border mb-3.5 flex items-center justify-between gap-2 ${
                    daysRemaining !== null && daysRemaining < 0
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : daysRemaining === 0
                      ? 'bg-amber-50 border-amber-300 text-amber-950 animate-pulse'
                      : daysRemaining !== null && daysRemaining <= 3
                      ? 'bg-orange-50 border-orange-200 text-orange-950'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">
                        {daysRemaining !== null && daysRemaining < 0 ? '⚠️' : daysRemaining === 0 ? '🔔' : '⏳'}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-black block truncate">
                          {dueStatus.label}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          موعد الاستحقاق: {emp.nextDueDate || 'غير محدد'}
                        </span>
                      </div>
                    </div>

                    {emp.phone && (
                      <a
                        href={`https://wa.me/${emp.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-white text-emerald-600 hover:bg-emerald-100 rounded-lg border border-emerald-200 shadow-2xs transition-colors shrink-0"
                        title="مراسلة عبر واتساب"
                      >
                        💬
                      </a>
                    )}
                  </div>

                  {/* Financial & Cycle Details */}
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 mb-3 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-bold">الراتب الأساسي:</span>
                      <span className="text-sm font-black font-mono text-slate-900">
                        {formatIQD(emp.salaryAmount)} <span className="text-[10px] font-normal text-slate-500">د.ع</span>
                      </span>
                    </div>

                    {advanceDebt > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-dashed border-amber-300 text-amber-900 bg-amber-100/50 p-2 rounded-lg font-bold">
                        <span>ذمة سلف قائمة:</span>
                        <span className="font-mono font-black text-rose-700">
                          {formatIQD(advanceDebt)} د.ع
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-slate-500 text-[11px]">
                      <span>آخر صرف:</span>
                      <span className="font-mono font-medium text-slate-700">
                        {emp.lastPaymentDate ? new Date(emp.lastPaymentDate).toLocaleDateString('ar-IQ') : 'لا يوجد صرف سابق'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions: Pay Button & Quick Icons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenPayModal(emp)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>💸</span>
                    <span>صرف راتب / سلفة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenHistory(emp)}
                    className="p-2.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="كشف حساب وسجل المدفوعات"
                  >
                    📑
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditEmployee(emp)}
                    className="p-2.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="تعديل بيانات الموظف"
                  >
                    ✏️
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteEmployee(emp)}
                    className="p-2.5 text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="حذف الموظف"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5">الموظف</th>
                  <th className="p-3.5">المسمى الوظيفي</th>
                  <th className="p-3.5">الراتب الأساسي</th>
                  <th className="p-3.5">الدورة</th>
                  <th className="p-3.5">الاستحقاق القادم</th>
                  <th className="p-3.5">الحالة والمتبقي</th>
                  <th className="p-3.5">السلف القائمة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const daysRemaining = getDaysRemaining(emp.nextDueDate);
                  const dueStatus = getDueStatus(daysRemaining);
                  const advanceDebt = Number(emp.currentAdvanceDebt) || 0;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs">
                            {emp.name?.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block">{emp.name}</span>
                            {emp.phone && <span className="text-[10px] font-mono text-slate-500">{emp.phone}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-600">{emp.jobTitle || 'موظف'}</td>
                      <td className="p-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatIQD(emp.salaryAmount)} د.ع
                      </td>
                      <td className="p-3.5 text-slate-700">
                        {emp.salaryType === 'monthly' ? 'شهري' : emp.salaryType === 'weekly' ? 'أسبوعي' : 'يومي'}
                      </td>
                      <td className="p-3.5 font-mono text-slate-700">{emp.nextDueDate || '—'}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] border ${dueStatus.badgeBg}`}>
                          {dueStatus.label}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-bold text-rose-700 whitespace-nowrap">
                        {advanceDebt > 0 ? `${formatIQD(advanceDebt)} د.ع` : '—'}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPayModal(emp)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                          >
                            صرف 💸
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenHistory(emp)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="سجل العمليات"
                          >
                            📑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditEmployee(emp)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT EMPLOYEE */}
      {/* ========================================================================= */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{editingEmployee ? '✏️' : '➕'}</span>
                <span>{editingEmployee ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد للنظام'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-4 md:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم الموظف الكامل *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: أحمد علي، سيف كريم..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs"
                />
              </div>

              {/* Phone & Job Title */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف / واتساب</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0770xxxxxxx"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                  <input
                    type="text"
                    value={formJobTitle}
                    onChange={(e) => setFormJobTitle(e.target.value)}
                    placeholder="فني كاميرات، كاشير، مسؤول مبيعات..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs"
                  />
                </div>
              </div>

              {/* Salary Amount & Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">قيمة الراتب (د.ع) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={formSalaryAmount}
                    onChange={(e) => setFormSalaryAmount(e.target.value)}
                    placeholder="500,000"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">نظام دورة الراتب</label>
                  <select
                    value={formSalaryType}
                    onChange={(e) => setFormSalaryType(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-bold"
                  >
                    <option value="monthly">📅 شهري (Monthly)</option>
                    <option value="weekly">🗓️ أسبوعي (Weekly)</option>
                    <option value="daily">☀️ يومي (Daily)</option>
                  </select>
                </div>
              </div>

              {/* Due Cycle Day Picker */}
              {formSalaryType === 'monthly' && (
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">يوم الاستحقاق من كل شهر</label>
                  <select
                    value={formPayCycleDay}
                    onChange={(e) => setFormPayCycleDay(e.target.value)}
                    className="w-full p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-bold text-indigo-950"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        يوم {day} من كل شهر
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formSalaryType === 'weekly' && (
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">يوم الاستحقاق من كل أسبوع</label>
                  <select
                    value={formPayCycleDay}
                    onChange={(e) => setFormPayCycleDay(e.target.value)}
                    className="w-full p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-bold text-indigo-950"
                  >
                    {WEEK_DAYS.map((wd) => (
                      <option key={wd.val} value={wd.val}>
                        كل يوم {wd.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start Date & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ المباشرة</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">حالة الموظف</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="active">🟢 على رأس العمل (نشط)</option>
                    <option value="inactive">⏸️ متوقف / إجازة</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
                <textarea
                  rows="2"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="أي تفاصيل أخرى تخص الموظف أو الاتفاق..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmployeeModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEmployee}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow disabled:opacity-50 cursor-pointer"
                >
                  {savingEmployee ? 'جاري الحفظ...' : editingEmployee ? 'حفظ التعديلات' : 'إضافة الموظف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PAY SALARY / ADVANCE (WITH SAFE OR MANAGEMENT SOURCE) */}
      {/* ========================================================================= */}
      {showPayModal && payingEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div>
                <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                  <span>💸</span>
                  <span>صرف مستحقات / راتب الموظف: {payingEmployee.name}</span>
                </h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  الراتب الأساسي: <span className="font-mono font-bold">{formatIQD(payingEmployee.salaryAmount)} د.ع</span>
                  {payingEmployee.currentAdvanceDebt > 0 && (
                    <span className="mr-2 text-rose-700 font-bold">
                      (سلف سابقة: {formatIQD(payingEmployee.currentAdvanceDebt)} د.ع)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-4 md:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Payment Type: Full vs Advance vs Bonus */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع عملية الصرف</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPayType('full_salary');
                      setPayAmount(payingEmployee.salaryAmount || '');
                    }}
                    className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      payType === 'full_salary'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm">💼</span>
                    <span className="text-[11px] block mt-0.5">راتب دوري كامل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayType('advance');
                      setPayAmount('');
                    }}
                    className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      payType === 'advance'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm">💵</span>
                    <span className="text-[11px] block mt-0.5">سلفة / دفعة مقدمة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPayType('bonus');
                      setPayAmount('');
                    }}
                    className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                      payType === 'bonus'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm">🎁</span>
                    <span className="text-[11px] block mt-0.5">مكافأة إضافية</span>
                  </button>
                </div>
              </div>

              {/* PAYMENT SOURCE (CRITICAL: FROM CASH DRAWER OR MANAGEMENT) */}
              <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-slate-900">
                  💳 من أين يتم سحب هذا المبلغ؟ (مصدر الصرف):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    paySource === 'cash_drawer'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold shadow-2xs'
                      : 'border-slate-200 hover:bg-white text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="paySource"
                      value="cash_drawer"
                      checked={paySource === 'cash_drawer'}
                      onChange={(e) => setPaySource(e.target.value)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold block">💵 من القاصة (كاش)</span>
                      <span className="text-[10px] text-slate-500 block">يُخصم من نقد اليومية ومطابقة الصندوق</span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    paySource === 'management'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-2xs'
                      : 'border-slate-200 hover:bg-white text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="paySource"
                      value="management"
                      checked={paySource === 'management'}
                      onChange={(e) => setPaySource(e.target.value)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-bold block">🏦 دفعها المدير</span>
                      <span className="text-[10px] text-slate-500 block">لا يمس كاش القاصة اليومي</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ المصروف فعلياً (د.ع) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white text-sm font-mono font-black text-emerald-950"
                />
              </div>

              {/* Advance deduction when paying full salary */}
              {payType === 'full_salary' && payingEmployee.currentAdvanceDebt > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span>استقطاع سلفة سابقة من هذا الراتب:</span>
                    <span>الرصيد القائم: {formatIQD(payingEmployee.currentAdvanceDebt)} د.ع</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={payingEmployee.currentAdvanceDebt}
                    value={payAdvanceDeduction}
                    onChange={(e) => setPayAdvanceDeduction(e.target.value)}
                    placeholder="أدخل المبلغ المستقطع إن وجد..."
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-mono font-bold text-amber-900"
                  />
                  <p className="text-[10px] text-amber-700">
                    سيتم تسوية هذا المبلغ وتخفيض ذمة السلفة في حساب الموظف.
                  </p>
                </div>
              )}

              {/* Period Covered & Payment Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفترة / الشهر المغطى</label>
                  <input
                    type="text"
                    value={payPeriod}
                    onChange={(e) => setPayPeriod(e.target.value)}
                    placeholder="راتب شهر آب 2026..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">تاريخ الصرف</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الصرف (اختياري)</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="أي تفاصيل تخص الدفعة..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={processingPay}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {processingPay ? (
                    <span>جاري التنفيذ...</span>
                  ) : (
                    <>
                      <span>💸</span>
                      <span>تأكيد وتسجيل الصرف</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EMPLOYEE PAYMENT HISTORY & STATEMENT */}
      {/* ========================================================================= */}
      {historyEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>📑</span>
                  <span>كشف حساب وسجل مدفوعات: {historyEmployee.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الراتب الأساسي: <span className="font-mono font-bold text-slate-800">{formatIQD(historyEmployee.salaryAmount)} د.ع</span>
                  {historyEmployee.currentAdvanceDebt > 0 && (
                    <span className="mr-3 text-rose-700 font-bold">
                      • ذمة سلف حالية: {formatIQD(historyEmployee.currentAdvanceDebt)} د.ع
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryEmployee(null)}
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="p-8 text-center text-slate-500">
                  <svg className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  <p className="text-xs">جاري تحميل سجل العمليات...</p>
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <span className="text-4xl block mb-2">💸</span>
                  <p className="text-xs font-bold">لا توجد عمليات صرف مسجلة لهذا الموظف حتى الآن.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">نوع الحركة</th>
                        <th className="p-2.5">الفترة المغطاة</th>
                        <th className="p-2.5">المصدر</th>
                        <th className="p-2.5">المبلغ</th>
                        <th className="p-2.5">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyList.map((rec) => {
                        const isMgmt = rec.paymentSource === 'management';
                        const isAdvance = rec.paymentType === 'advance';

                        return (
                          <tr key={rec.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                              {rec.date ? new Date(rec.date).toLocaleDateString('ar-IQ') : '—'}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isAdvance ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                              }`}>
                                {isAdvance ? '💵 سلفة' : rec.paymentType === 'bonus' ? '🎁 مكافأة' : '💼 راتب'}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-700 font-medium">
                              {rec.periodCovered || '—'}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isMgmt ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isMgmt ? '🏦 المدير' : '💵 القاصة'}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono font-black text-slate-900 whitespace-nowrap">
                              {formatIQD(rec.amount)} د.ع
                            </td>
                            <td className="p-2.5 text-slate-500 max-w-[120px] truncate" title={rec.notes}>
                              {rec.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold">
                إجمالي العمليات: {historyList.length}
              </span>
              <button
                type="button"
                onClick={() => setHistoryEmployee(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
