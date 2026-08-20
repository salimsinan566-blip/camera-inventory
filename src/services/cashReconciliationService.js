import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';

const RECONCILIATIONS_COLLECTION = 'cash_reconciliations';
const SETTINGS_COLLECTION = 'settings';
const CASH_DRAWER_DOC = 'cash_drawer';

/**
 * حفظ تسوية مالية جديدة وتعيين الرصيد الافتتاحي المعتمد للصندوق
 */
export async function saveCashReconciliation({
  actualCashAmount,
  calculatedAmount = 0,
  difference = 0,
  notes = '',
  createdBy = ''
}) {
  const numActual = Number(actualCashAmount) || 0;
  const numCalculated = Number(calculatedAmount) || 0;
  const numDiff = numActual - numCalculated;
  const nowIso = new Date().toISOString();

  // 1) إضافة سجل التسوية إلى السجل التاريخي
  const recRef = await addDoc(collection(db, RECONCILIATIONS_COLLECTION), {
    actualCashAmount: numActual,
    calculatedAmount: numCalculated,
    difference: numDiff,
    notes: (notes || '').trim(),
    createdBy: createdBy || 'المدير',
    createdAt: nowIso,
    date: nowIso.slice(0, 10)
  });

  // 2) تحديث الرصيد الأساسي المعتمد في الإعدادات
  const settingsRef = doc(db, SETTINGS_COLLECTION, CASH_DRAWER_DOC);
  await setDoc(settingsRef, {
    latestReconciliation: {
      id: recRef.id,
      actualCashAmount: numActual,
      date: nowIso,
      notes: (notes || '').trim(),
      createdBy: createdBy || 'المدير'
    },
    updatedAt: nowIso
  }, { merge: true });

  return recRef.id;
}

/**
 * الاشتراك بسجل التسويات المالية التاريخية (الأحدث أولاً)
 */
export function subscribeToCashReconciliations(callback) {
  const q = query(
    collection(db, RECONCILIATIONS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to cash reconciliations:', err);
    }
  );
}

/**
 * الاشتراك بآخر تسوية معتمدة للصندوق
 */
export function subscribeToLatestReconciliation(callback) {
  const ref = doc(db, SETTINGS_COLLECTION, CASH_DRAWER_DOC);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists() && snap.data().latestReconciliation) {
        callback(snap.data().latestReconciliation);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('Error subscribing to latest reconciliation:', err);
    }
  );
}
