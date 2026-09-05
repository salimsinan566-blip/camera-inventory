import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';

const EXPENSES_COLLECTION = 'expenses';

// اختصارات المصاريف اليومية والنثريات
export const DAILY_EXPENSE_PRESETS = [
  { id: 'water', title: 'ربطة ماء', icon: '💧', defaultAmount: 2500, category: 'مشروبات ومياه' },
  { id: 'tissue', title: 'كلينس ومستلزمات', icon: '🧻', defaultAmount: 1500, category: 'مستلزمات ونظافة' },
  { id: 'tea', title: 'شاي ومشروبات', icon: '☕', defaultAmount: 3000, category: 'مشروبات ومياه' },
  { id: 'lunch', title: 'وجبة غداء', icon: '🍲', defaultAmount: 10000, category: 'طعام وغداء' },
  { id: 'cleaning', title: 'مواد تنظيف', icon: '🧹', defaultAmount: 5000, category: 'مستلزمات ونظافة' },
  { id: 'daily_other', title: 'نثريات أخرى', icon: '➕', defaultAmount: 0, category: 'نثريات عامة' }
];

// اختصارات مصاريف والتزامات المحل التشغيلية والثابتة
export const SHOP_EXPENSE_PRESETS = [
  { id: 'rent', title: 'إيجار المحل', icon: '🏢', defaultAmount: 0, category: 'إيجار عقار' },
  { id: 'municipality', title: 'رسوم بلدية ونفايات', icon: '🏛️', defaultAmount: 0, category: 'بلدية ورسوم' },
  { id: 'internet', title: 'اشتراك الإنترنت', icon: '🌐', defaultAmount: 40000, category: 'خدمات وإنترنت' },
  { id: 'generator', title: 'اشتراك المولد / كهرباء', icon: '⚡', defaultAmount: 0, category: 'كهرباء ومولد' },
  { id: 'shop_maintenance', title: 'صيانة وديكور المحل', icon: '🛠️', defaultAmount: 0, category: 'صيانة وتجهيزات' },
  { id: 'fees', title: 'تراخيص ورسوم رسمية', icon: '📜', defaultAmount: 0, category: 'رسوم حكومية' },
  { id: 'shop_other', title: 'مصروف تشغيلي آخر', icon: '➕', defaultAmount: 0, category: 'مصاريف تشغيلية' }
];

// للتوافق الرجعي
export const EXPENSE_PRESETS = [...DAILY_EXPENSE_PRESETS, ...SHOP_EXPENSE_PRESETS];

export async function addExpense({
  title,
  category = 'نثريات عامة',
  expenseType = 'daily', // 'daily' | 'shop'
  paymentSource = 'cash_drawer', // 'cash_drawer' | 'management'
  amount,
  periodCovered = '',
  buyerName = '',
  notes = '',
  date = new Date().toISOString(),
  createdBy = ''
}) {
  const numAmount = Number(amount);
  if (!title || !title.trim()) throw new Error('يرجى كتابة عنوان المصروف');
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('يرجى إدخال مبلغ صحيح أكبر من الصفر');

  const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), {
    title: title.trim(),
    category: category.trim(),
    expenseType: expenseType || 'daily',
    paymentSource: paymentSource || 'cash_drawer',
    amount: numAmount,
    periodCovered: (periodCovered || '').trim(),
    buyerName: (buyerName || '').trim() || 'المحل',
    notes: (notes || '').trim(),
    date: date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: createdBy || 'المسؤول'
  });

  return docRef.id;
}

export async function updateExpense(id, data) {
  const ref = doc(db, EXPENSES_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    amount: Number(data.amount) || 0,
    updatedAt: new Date().toISOString()
  });
}

export async function deleteExpense(id) {
  await deleteDoc(doc(db, EXPENSES_COLLECTION, id));
}

import {
  BACKUP_KEYS,
  saveLocalBackup,
  loadLocalBackup
} from './offlineDbHelper';

export function subscribeToExpenses(callback, maxLimit = 150) {
  const cached = loadLocalBackup(BACKUP_KEYS.EXPENSES, []);
  if (Array.isArray(cached) && cached.length > 0) {
    callback(cached);
  }

  const q = query(
    collection(db, EXPENSES_COLLECTION),
    orderBy('date', 'desc'),
    limit(maxLimit)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveLocalBackup(BACKUP_KEYS.EXPENSES, list);
    callback(list);
  }, (err) => {
    console.warn('Subscribe to expenses offline fallback:', err?.message);
    const fallback = loadLocalBackup(BACKUP_KEYS.EXPENSES, []);
    if (Array.isArray(fallback) && fallback.length > 0) {
      callback(fallback);
    }
  });
}
