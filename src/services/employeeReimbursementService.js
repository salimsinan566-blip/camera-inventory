import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const REIMBURSEMENTS_COLLECTION = 'employee_reimbursements';

/**
 * تسجيل مستحق سلفة جديد للموظف (دفع من الجيب الخاص)
 */
export async function createReimbursementRecord({
  sourceType = 'purchase', // 'purchase' | 'expense' | 'manual'
  sourceId = null,
  sourceInvoiceNumber = '',
  employeeName,
  amount,
  notes = '',
  date = new Date().toISOString(),
  createdBy = ''
}) {
  const cleanName = (employeeName || '').trim();
  const numAmount = Math.max(0, Number(amount) || 0);

  if (!cleanName) throw new Error('يرجى كتابة اسم الموظف الذي دفع من جيبه');
  if (numAmount <= 0) throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر');

  const nowIso = new Date().toISOString();
  const docRef = await addDoc(collection(db, REIMBURSEMENTS_COLLECTION), {
    sourceType,
    sourceId: sourceId || null,
    sourceInvoiceNumber: sourceInvoiceNumber || '',
    employeeName: cleanName,
    amount: numAmount,
    status: 'pending', // 'pending' | 'reimbursed'
    reimbursedAmount: 0,
    reimbursementSource: null, // 'cash_drawer' | 'management'
    reimbursedAt: null,
    reimbursedBy: null,
    notes: (notes || '').trim(),
    date: date || nowIso,
    createdAt: nowIso,
    createdBy: createdBy || 'المسؤول'
  });

  return docRef.id;
}

/**
 * تسوية واسترداد المبلغ للموظف (سواء من القاصة أو تحويل من الإدارة)
 */
export async function reimburseEmployee({
  id,
  reimbursementSource = 'cash_drawer', // 'cash_drawer' | 'management'
  reimbursedAmount = null,
  notes = '',
  reimbursedBy = ''
}) {
  if (!id) throw new Error('معرف السجل مفقود');

  const ref = doc(db, REIMBURSEMENTS_COLLECTION, id);
  const nowIso = new Date().toISOString();

  const payload = {
    status: 'reimbursed',
    reimbursementSource: reimbursementSource || 'cash_drawer',
    reimbursedAt: nowIso,
    reimbursedBy: reimbursedBy || 'المسؤول',
    settlementNotes: (notes || '').trim(),
    updatedAt: nowIso
  };

  if (reimbursedAmount !== null && Number(reimbursedAmount) > 0) {
    payload.reimbursedAmount = Number(reimbursedAmount);
  }

  await updateDoc(ref, payload);
  return id;
}

/**
 * حذف سجل مستحق الموظف
 */
export async function deleteReimbursementRecord(id) {
  if (!id) return;
  const ref = doc(db, REIMBURSEMENTS_COLLECTION, id);
  await deleteDoc(ref);
}

/**
 * الاشتراك اللحظي بسجلات مستحقات الموظفين
 */
export function subscribeToEmployeeReimbursements(callback) {
  const q = query(
    collection(db, REIMBURSEMENTS_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to employee reimbursements:', err);
    }
  );
}
