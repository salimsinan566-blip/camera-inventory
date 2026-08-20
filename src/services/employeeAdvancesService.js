import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const ADVANCES_COLLECTION = 'employee_advances';

/**
 * صرف سلفة نقدية جديدة لأحد الموظفين من القاصة
 */
export async function giveEmployeeAdvance({
  employeeName,
  amount,
  reason = 'سلفة نقدية',
  notes = '',
  date = new Date().toISOString(),
  createdBy = ''
}) {
  const cleanName = (employeeName || '').trim();
  const numAmount = Math.max(0, Number(amount) || 0);

  if (!cleanName) throw new Error('يرجى كتابة اسم الموظف المستلف');
  if (numAmount <= 0) throw new Error('يرجى إدخال مبلغ سلفة صحيح أكبر من الصفر');

  const nowIso = new Date().toISOString();
  const docRef = await addDoc(collection(db, ADVANCES_COLLECTION), {
    employeeName: cleanName,
    amount: numAmount,
    remainingDebt: numAmount,
    repaidAmount: 0,
    status: 'active', // 'active' | 'settled'
    reason: (reason || 'سلفة نقدية').trim(),
    notes: (notes || '').trim(),
    payments: [],
    date: date || nowIso,
    createdAt: nowIso,
    createdBy: createdBy || 'المسؤول'
  });

  return docRef.id;
}

/**
 * تسديد دفعة أو كامل السلفة من الموظف (نقداً في القاصة أو استقطاع راتب)
 */
export async function repayEmployeeAdvance({
  advanceId,
  amount,
  currentRemainingDebt,
  repaymentMethod = 'cash_drawer', // 'cash_drawer' | 'salary_deduction'
  notes = '',
  receivedBy = ''
}) {
  if (!advanceId) throw new Error('معرف السلفة مفقود');
  const numAmount = Math.max(0, Number(amount) || 0);
  if (numAmount <= 0) throw new Error('يرجى إدخال مبلغ تسديد صحيح');

  const ref = doc(db, ADVANCES_COLLECTION, advanceId);
  const nowIso = new Date().toISOString();

  const snap = await getDoc(ref);
  const existingData = snap.exists() ? snap.data() : {};
  const currentPayments = Array.isArray(existingData.payments) ? existingData.payments : [];
  const currentRepaid = Number(existingData.repaidAmount) || 0;
  const currentDebt = Number(currentRemainingDebt !== undefined ? currentRemainingDebt : existingData.remainingDebt) || 0;

  const newRemaining = Math.max(0, currentDebt - numAmount);
  const isFullyRepaid = newRemaining <= 0;

  const paymentRecord = {
    amount: numAmount,
    repaymentMethod: repaymentMethod || 'cash_drawer',
    date: nowIso,
    notes: (notes || '').trim(),
    receivedBy: receivedBy || 'المسؤول'
  };

  await updateDoc(ref, {
    remainingDebt: newRemaining,
    repaidAmount: currentRepaid + numAmount,
    status: isFullyRepaid ? 'settled' : 'active',
    payments: [...currentPayments, paymentRecord],
    lastRepaymentDate: nowIso,
    updatedAt: nowIso
  });

  return advanceId;
}

/**
 * حذف سجل سلفة الموظف
 */
export async function deleteEmployeeAdvance(id) {
  if (!id) return;
  const ref = doc(db, ADVANCES_COLLECTION, id);
  await deleteDoc(ref);
}

/**
 * الاشتراك اللحظي بسجلات سلف الموظفين
 */
export function subscribeToEmployeeAdvances(callback) {
  const q = query(
    collection(db, ADVANCES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to employee advances:', err);
    }
  );
}
