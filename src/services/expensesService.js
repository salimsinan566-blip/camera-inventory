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
import {
  BACKUP_KEYS,
  saveLocalBackup,
  loadLocalBackup
} from './offlineDbHelper';

const EXPENSES_COLLECTION = 'expenses';

// اختصارات المصاريف اليومية والنثريات
export const DAILY_EXPENSE_PRESETS = [
  { id: 'lunch', title: 'وجبة غداء', icon: '🍲', defaultAmount: 10000, category: 'طعام وغداء' },
  { id: 'water', title: 'ربطة ماء', icon: '💧', defaultAmount: 2500, category: 'مشروبات ومياه' },
  { id: 'tea', title: 'شاي وضيافة', icon: '☕', defaultAmount: 3000, category: 'مشروبات ومياه' },
  { id: 'tissue', title: 'كلينس ومستلزمات', icon: '🧻', defaultAmount: 1500, category: 'مستلزمات ونظافة' },
  { id: 'cleaning', title: 'مواد تنظيف', icon: '🧹', defaultAmount: 5000, category: 'مستلزمات ونظافة' },
  { id: 'transport', title: 'نقل وتوصيل', icon: '🚗', defaultAmount: 5000, category: 'نقل ومواصلات' },
  { id: 'daily_other', title: 'نوع آخر', icon: '➕', defaultAmount: 0, category: 'نثريات عامة' }
];

// اختصارات مصاريف والتزامات المحل التشغيلية والثابتة
export const SHOP_EXPENSE_PRESETS = [
  { id: 'rent', title: 'إيجار المحل', icon: '🏢', defaultAmount: 0, category: 'إيجار عقار' },
  { id: 'salaries', title: 'رواتب الموظفين', icon: '👥', defaultAmount: 0, category: 'رواتب وأجور' },
  { id: 'generator', title: 'مولد وكهرباء', icon: '⚡', defaultAmount: 0, category: 'كهرباء ومولد' },
  { id: 'internet', title: 'اشتراك الإنترنت', icon: '🌐', defaultAmount: 40000, category: 'خدمات وإنترنت' },
  { id: 'municipality', title: 'بلدية ونفايات', icon: '🏛️', defaultAmount: 0, category: 'بلدية ورسوم' },
  { id: 'shop_maintenance', title: 'صيانة وتجهيزات', icon: '🛠️', defaultAmount: 0, category: 'صيانة وتجهيزات' },
  { id: 'fees', title: 'رسوم وتراخيص', icon: '📜', defaultAmount: 0, category: 'رسوم حكومية' },
  { id: 'shop_other', title: 'نوع آخر', icon: '➕', defaultAmount: 0, category: 'مصاريف تشغيلية' }
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

  const newDocData = {
    title: title.trim(),
    category: category.trim(),
    expenseType: expenseType || 'daily',
    paymentSource: paymentSource || 'cash_drawer',
    amount: numAmount,
    periodCovered: (expenseType === 'daily' ? '' : (periodCovered || '').trim()),
    buyerName: (buyerName || '').trim() || 'المحل',
    notes: (notes || '').trim(),
    date: date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: createdBy || 'المسؤول'
  };

  let docId = 'offline_exp_' + Date.now();
  try {
    const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), newDocData);
    docId = docRef.id;
  } catch (err) {
    console.warn('addExpense offline write queued:', err?.message);
  }

  // تحديث النسخة الاحتياطية محلياً فوراً لدعم الأوفلاين السريع
  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EXPENSES, []);
    const updated = [{ id: docId, ...newDocData }, ...(Array.isArray(cached) ? cached : [])];
    saveLocalBackup(BACKUP_KEYS.EXPENSES, updated);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline_expenses_updated', { detail: updated }));
    }
  } catch (cErr) {
    console.warn('Could not save local backup for expense:', cErr?.message);
  }

  return docId;
}

export async function updateExpense(id, data) {
  const ref = doc(db, EXPENSES_COLLECTION, id);
  const payload = {
    ...data,
    ...(data.amount !== undefined ? { amount: Number(data.amount) || 0 } : {}),
    ...(data.expenseType === 'daily' ? { periodCovered: '' } : {}),
    updatedAt: new Date().toISOString()
  };

  try {
    await updateDoc(ref, payload);
  } catch (err) {
    console.warn('updateExpense offline write queued:', err?.message);
  }

  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EXPENSES, []);
    if (Array.isArray(cached)) {
      const updated = cached.map((e) => (e.id === id ? { ...e, ...payload } : e));
      saveLocalBackup(BACKUP_KEYS.EXPENSES, updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline_expenses_updated', { detail: updated }));
      }
    }
  } catch (cErr) {
    console.warn('Could not update local backup for expense:', cErr?.message);
  }
}

export async function deleteExpense(id) {
  try {
    await deleteDoc(doc(db, EXPENSES_COLLECTION, id));
  } catch (err) {
    console.warn('deleteExpense offline delete queued:', err?.message);
  }

  try {
    const cached = loadLocalBackup(BACKUP_KEYS.EXPENSES, []);
    if (Array.isArray(cached)) {
      const updated = cached.filter((e) => e.id !== id);
      saveLocalBackup(BACKUP_KEYS.EXPENSES, updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline_expenses_updated', { detail: updated }));
      }
    }
  } catch (cErr) {
    console.warn('Could not remove from local backup for expense:', cErr?.message);
  }
}

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
