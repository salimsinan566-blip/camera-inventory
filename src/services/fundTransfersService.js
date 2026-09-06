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

const TRANSFERS_COLLECTION = 'fund_transfers';

export const ACCOUNT_TYPES = {
  MASTERCARD: 'mastercard',
  CASH_DRAWER: 'cash_drawer'
};

export const ACCOUNT_LABELS = {
  [ACCOUNT_TYPES.MASTERCARD]: 'الماستر كارد (الدفع الإلكتروني)',
  [ACCOUNT_TYPES.CASH_DRAWER]: 'الصندوق والقاصة (النقد الفعلي)'
};

/**
 * تسجيل تحويل مالي بين الحسابات (مثلاً من الماستر إلى القاصة أو العكس)
 */
export async function transferFunds({
  fromAccount = ACCOUNT_TYPES.MASTERCARD,
  toAccount = ACCOUNT_TYPES.CASH_DRAWER,
  amount,
  date = new Date().toISOString(),
  notes = '',
  createdBy = ''
}) {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('يرجى إدخال مبلغ تحويل صحيح أكبر من الصفر');
  }

  if (fromAccount === toAccount) {
    throw new Error('لا يمكن التحويل لنفس الحساب');
  }

  const defaultNotes = fromAccount === ACCOUNT_TYPES.MASTERCARD
    ? 'سحب نقدي من الماستر كارد وإيداع في القاصة'
    : 'إيداع نقدي من القاصة في حساب الماستر كارد';

  const docRef = await addDoc(collection(db, TRANSFERS_COLLECTION), {
    fromAccount,
    toAccount,
    amount: numAmount,
    date: date || new Date().toISOString(),
    notes: (notes || defaultNotes).trim(),
    createdBy: createdBy || 'المسؤول',
    createdAt: new Date().toISOString()
  });

  return docRef.id;
}

/**
 * تعديل حركة تحويل مسجلة
 */
export async function updateFundTransfer(id, data) {
  const ref = doc(db, TRANSFERS_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    amount: data.amount !== undefined ? Number(data.amount) || 0 : undefined,
    updatedAt: new Date().toISOString()
  });
}

/**
 * حذف حركة تحويل مسجلة
 */
export async function deleteFundTransfer(id) {
  await deleteDoc(doc(db, TRANSFERS_COLLECTION, id));
}

/**
 * الاشتراك بحركات التحويل المالي في الوقت الفعلي
 */
export function subscribeToFundTransfers(callback) {
  const cached = loadLocalBackup(BACKUP_KEYS.TRANSFERS || 'offline_backup_fund_transfers', []);
  if (Array.isArray(cached) && cached.length > 0) {
    callback(cached);
  }

  const q = query(
    collection(db, TRANSFERS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      saveLocalBackup(BACKUP_KEYS.TRANSFERS || 'offline_backup_fund_transfers', list);
      callback(list);
    },
    (err) => {
      console.warn('Subscribe to fund transfers offline fallback:', err?.message);
      const fallback = loadLocalBackup(BACKUP_KEYS.TRANSFERS || 'offline_backup_fund_transfers', []);
      if (Array.isArray(fallback) && fallback.length > 0) {
        callback(fallback);
      }
    }
  );
}
