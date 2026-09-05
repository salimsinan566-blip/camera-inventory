import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';

const INCOMES_COLLECTION = 'office_incomes';

export const INCOME_PRESETS = [
  { id: 'old_invoice', title: 'فاتورة قديمة قبل النظام', icon: '📑', category: 'فواتير قديمة سابقة' },
  { id: 'old_debt', title: 'تسديد دين قديم سابق', icon: '💼', category: 'تسديد ديون قديمة' },
  { id: 'cash_deposit', title: 'إيداع نقدي في الصندوق / القاصة', icon: '💵', category: 'إيداع نقدي إضافي' },
  { id: 'maintenance', title: 'أجور صيانة وتركيب خارج النظام', icon: '🛠️', category: 'خدمات وصيانة' },
  { id: 'other_income', title: 'دخل أو إيراد إضافي آخر', icon: '➕', category: 'دخل إضافي عام' },
];

/**
 * إضافة مبلغ دخل أو إيراد للمكتب (فاتورة قديمة، إيداع، إلخ)
 */
export async function addIncome({
  title,
  category = 'دخل إضافي عام',
  amount,
  payerName = '',
  customerName = '',
  notes = '',
  date = new Date().toISOString(),
  createdBy = ''
}) {
  const numAmount = Number(amount);
  if (!title || !title.trim()) throw new Error('يرجى كتابة عنوان أو تفاصيل الإيراد');
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر');

  const finalCustomerName = (customerName || payerName || '').trim();

  const docRef = await addDoc(collection(db, INCOMES_COLLECTION), {
    title: title.trim(),
    category: category.trim(),
    amount: numAmount,
    payerName: finalCustomerName,
    customerName: finalCustomerName,
    notes: (notes || '').trim(),
    date: date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: createdBy || 'المسؤول'
  });

  return docRef.id;
}

/**
 * تعديل دخل مسجل مسبقاً
 */
export async function updateIncome(id, data) {
  const ref = doc(db, INCOMES_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    amount: Number(data.amount) || 0,
    updatedAt: new Date().toISOString()
  });
}

/**
 * حذف دخل مسجل
 */
export async function deleteIncome(id) {
  await deleteDoc(doc(db, INCOMES_COLLECTION, id));
}

import {
  BACKUP_KEYS,
  saveLocalBackup,
  loadLocalBackup
} from './offlineDbHelper';

/**
 * الاشتراك بالدخل والمقبوضات الإضافية في الوقت الفعلي
 */
export function subscribeToIncomes(callback) {
  const cached = loadLocalBackup(BACKUP_KEYS.INCOMES, []);
  if (Array.isArray(cached) && cached.length > 0) {
    callback(cached);
  }

  const q = query(
    collection(db, INCOMES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveLocalBackup(BACKUP_KEYS.INCOMES, list);
    callback(list);
  }, (err) => {
    console.warn('Subscribe to incomes offline fallback:', err?.message);
    const fallback = loadLocalBackup(BACKUP_KEYS.INCOMES, []);
    if (Array.isArray(fallback) && fallback.length > 0) {
      callback(fallback);
    }
  });
}
