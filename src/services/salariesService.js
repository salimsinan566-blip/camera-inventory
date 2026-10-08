import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { addExpense } from './expensesService';
import {
  safeGetDoc,
  safeGetDocs,
  saveLocalBackup,
  loadLocalBackup,
  BACKUP_KEYS
} from './offlineDbHelper';

export const EMPLOYEES_COLLECTION = 'employees';
export const SALARY_PAYMENTS_COLLECTION = 'salary_payments';

/**
 * حساب تاريخ الاستحقاق القادم بناءً على نوع الدورة ويوم الاستحقاق
 */
export function calculateInitialNextDueDate(salaryType, payCycleDay, startDate = new Date()) {
  const base = new Date(startDate);
  const now = new Date();
  
  if (salaryType === 'daily') {
    // يستحق غداً في نفس الوقت
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  if (salaryType === 'weekly') {
    // payCycleDay: 0 = الأحد، 1 = الإثنين ... 6 = السبت (أو 4 = الخميس)
    const targetDay = Number(payCycleDay) || 4; // الافتراضي: الخميس (4)
    const d = new Date(now);
    const currentDay = d.getDay();
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    if (daysToAdd === 0) daysToAdd = 7; // إذا كان اليوم هو نفس اليوم، الاستحقاق القادم بعد أسبوع
    d.setDate(d.getDate() + daysToAdd);
    return d.toISOString().slice(0, 10);
  }

  // Monthly: يوم محدد من الشهر (مثلاً يوم 1 أو 25)
  const targetDateNum = Math.min(31, Math.max(1, Number(payCycleDay) || 1));
  let d = new Date(now.getFullYear(), now.getMonth(), targetDateNum);
  
  // إذا كان هذا اليوم من الشهر الحالي قد مضى بالفعل، نحسب للشهر القادم
  if (d <= now) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, targetDateNum);
  }
  
  return d.toISOString().slice(0, 10);
}

/**
 * ترحيل تاريخ الاستحقاق إلى الدورة التالية بعد صرف الراتب
 */
export function calculateNextCycleDueDate(currentDueDateStr, salaryType, payCycleDay) {
  const base = currentDueDateStr ? new Date(currentDueDateStr) : new Date();
  
  if (salaryType === 'daily') {
    base.setDate(base.getDate() + 1);
    return base.toISOString().slice(0, 10);
  }

  if (salaryType === 'weekly') {
    base.setDate(base.getDate() + 7);
    return base.toISOString().slice(0, 10);
  }

  // Monthly: الانتقال للشهر القادم في نفس يوم الاستحقاق
  const targetDay = Math.min(31, Math.max(1, Number(payCycleDay) || base.getDate() || 1));
  const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, targetDay);
  return nextMonth.toISOString().slice(0, 10);
}

/**
 * إضافة موظف جديد مع دعم الأوفلاين التام
 */
export async function addEmployee({
  name,
  phone = '',
  jobTitle = 'موظف',
  salaryAmount = 0,
  salaryType = 'monthly', // 'monthly' | 'weekly' | 'daily'
  payCycleDay = 1,
  startDate = new Date().toISOString().slice(0, 10),
  notes = '',
  createdBy = ''
}) {
  const cleanName = (name || '').trim();
  const numSalary = Math.max(0, Number(salaryAmount) || 0);

  if (!cleanName) throw new Error('يرجى كتابة اسم الموظف');
  if (numSalary <= 0) throw new Error('يرجى تحديد راتب صحيح أكبر من الصفر');

  const nowIso = new Date().toISOString();
  const nextDueDate = calculateInitialNextDueDate(salaryType, payCycleDay, startDate);

  const newEmpData = {
    name: cleanName,
    phone: (phone || '').trim(),
    jobTitle: (jobTitle || 'موظف').trim(),
    salaryAmount: numSalary,
    salaryType: salaryType || 'monthly',
    payCycleDay: Number(payCycleDay) || 1,
    startDate: startDate || nowIso.slice(0, 10),
    nextDueDate: nextDueDate,
    lastPaymentDate: null,
    lastPaymentAmount: 0,
    currentAdvanceDebt: 0,
    totalPaidThisMonth: 0,
    lastMonthReset: nowIso.slice(0, 7),
    status: 'active', // 'active' | 'inactive'
    notes: (notes || '').trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: createdBy || 'المسؤول'
  };

  let docId = 'offline_emp_' + Date.now();
  try {
    const docRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), newEmpData);
    docId = docRef.id;
  } catch (err) {
    console.warn('addEmployee offline write queued:', err?.message);
  }

  // تحديث النسخة الاحتياطية محلياً فوراً
  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
    const updated = [{ id: docId, ...newEmpData }, ...(Array.isArray(cached) ? cached : [])];
    saveLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', updated);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline_employees_updated', { detail: updated }));
    }
  } catch (cErr) {
    console.warn('Could not save local employee backup:', cErr?.message);
  }

  return docId;
}

/**
 * تعديل بيانات الموظف مع دعم الأوفلاين
 */
export async function updateEmployee(id, data) {
  if (!id) throw new Error('معرف الموظف مفقود');
  const ref = doc(db, EMPLOYEES_COLLECTION, id);
  const nowIso = new Date().toISOString();
  
  const updatePayload = {
    ...data,
    updatedAt: nowIso
  };

  try {
    await updateDoc(ref, updatePayload);
  } catch (err) {
    console.warn('updateEmployee offline write queued:', err?.message);
  }

  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
    if (Array.isArray(cached)) {
      const updated = cached.map(e => e.id === id ? { ...e, ...updatePayload } : e);
      saveLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline_employees_updated', { detail: updated }));
      }
    }
  } catch (cErr) {
    console.warn('Could not update local employee backup:', cErr?.message);
  }
}

/**
 * حذف موظف مع دعم الأوفلاين
 */
export async function deleteEmployee(id) {
  if (!id) return;
  const ref = doc(db, EMPLOYEES_COLLECTION, id);
  try {
    await deleteDoc(ref);
  } catch (err) {
    console.warn('deleteEmployee offline delete queued:', err?.message);
  }

  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
    if (Array.isArray(cached)) {
      const updated = cached.filter(e => e.id !== id);
      saveLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline_employees_updated', { detail: updated }));
      }
    }
  } catch (cErr) {
    console.warn('Could not delete local employee backup:', cErr?.message);
  }
}

/**
 * صرف راتب أو سلفة لموظف (يعمل أوفلاين 100% مع مزامنة محلية فورية)
 */
export async function payEmployeeSalary({
  employeeId,
  employeeName,
  amount,
  paymentSource = 'cash_drawer', // 'cash_drawer' (من القاصة) | 'management' (من المدير)
  paymentType = 'full_salary', // 'full_salary' | 'advance' | 'bonus' | 'deduction'
  advanceDeduction = 0, // استقطاع سلفة سابقة من الراتب
  salaryType = 'monthly',
  payCycleDay = 1,
  currentDueDate = '',
  periodCovered = '',
  notes = '',
  paymentDate = new Date().toISOString(),
  paidBy = 'المسؤول',
  customExpenseTitle = ''
}) {
  if (!employeeId) throw new Error('معرف الموظف مفقود');
  const numAmount = Math.max(0, Number(amount) || 0);
  const numAdvanceDeduct = Math.max(0, Number(advanceDeduction) || 0);

  if (numAmount <= 0) throw new Error('يرجى إدخال مبلغ صحيح للصرف');

  const nowIso = new Date().toISOString();
  const empRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
  
  let empData = {};
  try {
    const empSnap = await safeGetDoc(empRef);
    if (empSnap && empSnap.exists && empSnap.exists()) {
      empData = empSnap.data();
    }
  } catch (e) {
    console.warn('safeGetDoc fallback in payEmployeeSalary:', e?.message);
  }

  // دعم الأوفلاين: إذا لم يتوفر المستند من السيرفر، نجلب بيانات الموظف من النسخة المحلية
  if (!empData || Object.keys(empData).length === 0) {
    const localEmployees = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
    const foundLocal = Array.isArray(localEmployees) ? localEmployees.find(e => e.id === employeeId) : null;
    if (foundLocal) {
      empData = foundLocal;
    }
  }

  // 1. تسجيل حركة الدفع في مجموعة salary_payments
  const paymentRecord = {
    employeeId,
    employeeName: employeeName || empData.name || 'موظف',
    amount: numAmount,
    advanceDeduction: numAdvanceDeduct,
    netPaid: numAmount,
    paymentSource: paymentSource || 'cash_drawer',
    paymentType: paymentType || 'full_salary',
    salaryType: salaryType || empData.salaryType || 'monthly',
    periodCovered: (periodCovered || '').trim(),
    notes: (notes || '').trim(),
    date: paymentDate || nowIso,
    paidBy: paidBy || 'المسؤول',
    createdAt: nowIso
  };

  let paymentDocId = 'offline_pay_' + Date.now();
  try {
    const paymentDocRef = await addDoc(collection(db, SALARY_PAYMENTS_COLLECTION), paymentRecord);
    paymentDocId = paymentDocRef.id;
  } catch (payErr) {
    console.warn('payEmployeeSalary offline payment record queued:', payErr?.message);
  }

  // حفظ سجل الدفع في النسخة المحلية
  try {
    const payHistory = loadLocalBackup(BACKUP_KEYS.SALARY_PAYMENTS || 'offline_backup_salary_payments', []);
    const updatedPay = [{ id: paymentDocId, ...paymentRecord }, ...(Array.isArray(payHistory) ? payHistory : [])];
    saveLocalBackup(BACKUP_KEYS.SALARY_PAYMENTS || 'offline_backup_salary_payments', updatedPay.slice(0, 150));
  } catch (payHistErr) {
    console.warn('Could not update local salary payments backup:', payHistErr?.message);
  }

  // 2. تحديث مستند الموظف بحسابات موفرة للكوتا (Denormalized)
  const currentMonthStr = nowIso.slice(0, 7);
  const isNewMonth = empData.lastMonthReset !== currentMonthStr;
  const currentMonthTotal = isNewMonth ? 0 : (Number(empData.totalPaidThisMonth) || 0);
  const currentDebt = Math.max(0, Number(empData.currentAdvanceDebt) || 0);

  let newAdvanceDebt = currentDebt;
  if (paymentType === 'advance') {
    newAdvanceDebt += numAmount;
  } else if (numAdvanceDeduct > 0) {
    newAdvanceDebt = Math.max(0, newAdvanceDebt - numAdvanceDeduct);
  }

  let newNextDueDate = empData.nextDueDate || currentDueDate;
  if (paymentType === 'full_salary') {
    newNextDueDate = calculateNextCycleDueDate(
      newNextDueDate,
      salaryType || empData.salaryType,
      payCycleDay || empData.payCycleDay
    );
  }

  const empUpdatePayload = {
    lastPaymentDate: paymentDate || nowIso,
    lastPaymentAmount: numAmount,
    totalPaidThisMonth: currentMonthTotal + numAmount,
    lastMonthReset: currentMonthStr,
    currentAdvanceDebt: newAdvanceDebt,
    nextDueDate: newNextDueDate,
    updatedAt: nowIso
  };

  try {
    await updateDoc(empRef, empUpdatePayload);
  } catch (syncErr) {
    console.warn('Offline employee salary update sync note:', syncErr?.message);
  }

  // تحديث بيانات الموظف في النسخة المحلية فوراً
  try {
    const localEmployees = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
    if (Array.isArray(localEmployees)) {
      const updatedList = localEmployees.map(e => e.id === employeeId ? { ...e, ...empUpdatePayload } : e);
      saveLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', updatedList);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline_employees_updated', { detail: updatedList }));
      }
    }
  } catch (empBackupErr) {
    console.warn('Could not update local employee backup:', empBackupErr?.message);
  }

  // 3. إذا كان الصرف من القاصة (cash_drawer)، نسجل مصروفاً تلقائياً لضبط مطابقة الصندوق
  if (paymentSource === 'cash_drawer') {
    const expenseTitle = (customExpenseTitle || '').trim() || (paymentType === 'advance' 
      ? `سلفة موظف: ${employeeName || empData.name}`
      : `راتب موظف: ${employeeName || empData.name} (${periodCovered || 'دورة راتب'})`);

    try {
      await addExpense({
        title: expenseTitle,
        category: 'رواتب وأجور',
        expenseType: 'shop',
        paymentSource: 'cash_drawer',
        amount: numAmount,
        periodCovered: periodCovered || '',
        buyerName: paidBy || 'المسؤول',
        notes: (notes || '').trim() || 'مسجل من قسم الرواتب',
        date: paymentDate || nowIso,
        createdBy: paidBy || 'المسؤول'
      });
    } catch (expErr) {
      console.warn('Could not auto-create expense record for salary drawer payout:', expErr);
    }
  }

  return paymentDocId;
}

/**
 * الاشتراك اللحظي الخفيف بقائمة الموظفين فقط (موفر جداً للكوتا ومع أمان محلي)
 */
export function subscribeToEmployees(callback) {
  const cached = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
  if (Array.isArray(cached) && cached.length > 0) {
    callback(cached);
  }

  const q = query(
    collection(db, EMPLOYEES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      saveLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', list);
      callback(list);
    },
    (err) => {
      console.warn('Subscribe to employees offline fallback:', err?.message);
      const fallback = loadLocalBackup(BACKUP_KEYS.EMPLOYEES || 'offline_backup_employees', []);
      if (Array.isArray(fallback) && fallback.length > 0) {
        callback(fallback);
      }
    }
  );
}

/**
 * جلب سجل مدفوعات موظف معين عند الطلب فقط (Lazy Loading with in-memory sorting - لا يتطلب فهرس مركب في فايربيس)
 */
export async function getEmployeePaymentHistory(employeeId, limitCount = 50) {
  if (!employeeId) return [];
  try {
    const q = query(
      collection(db, SALARY_PAYMENTS_COLLECTION),
      where('employeeId', '==', employeeId)
    );

    const snap = await safeGetDocs(q);
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // دعم الأوفلاين: إذا لم توجد نتائج من الكاش أو كان غير متصل، قراءة الدفعات من النسخة المحلية
    if (list.length === 0) {
      const localPayments = loadLocalBackup(BACKUP_KEYS.SALARY_PAYMENTS || 'offline_backup_salary_payments', []);
      if (Array.isArray(localPayments)) {
        list = localPayments.filter((p) => p.employeeId === employeeId);
      }
    }

    // الترتيب في الذاكرة لتجنب خطأ الفهرس المركب (Composite Index) تماماً
    list.sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return list.slice(0, limitCount);
  } catch (err) {
    console.error('Error fetching employee payment history:', err);
    const localPayments = loadLocalBackup(BACKUP_KEYS.SALARY_PAYMENTS || 'offline_backup_salary_payments', []);
    if (Array.isArray(localPayments)) {
      return localPayments.filter((p) => p.employeeId === employeeId).slice(0, limitCount);
    }
    return [];
  }
}
