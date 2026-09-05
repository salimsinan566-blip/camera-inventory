import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit,
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
  actualMastercardAmount = 0,
  calculatedMastercardAmount = 0,
  mastercardDifference = 0,
  notes = '',
  createdBy = ''
}) {
  const numActual = Number(actualCashAmount) || 0;
  const numCalculated = Number(calculatedAmount) || 0;
  const numDiff = numActual - numCalculated;

  const numActualMastercard = Number(actualMastercardAmount) || 0;
  const numCalculatedMastercard = Number(calculatedMastercardAmount) || 0;
  const numMastercardDiff = numActualMastercard - numCalculatedMastercard;

  const nowIso = new Date().toISOString();

  // 1) إضافة سجل التسوية إلى السجل التاريخي
  const recRef = await addDoc(collection(db, RECONCILIATIONS_COLLECTION), {
    actualCashAmount: numActual,
    calculatedAmount: numCalculated,
    difference: numDiff,
    actualMastercardAmount: numActualMastercard,
    calculatedMastercardAmount: numCalculatedMastercard,
    mastercardDifference: numMastercardDiff,
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
      actualMastercardAmount: numActualMastercard,
      date: nowIso,
      notes: (notes || '').trim(),
      createdBy: createdBy || 'المدير'
    },
    updatedAt: nowIso
  }, { merge: true });

  return recRef.id;
}

import {
  BACKUP_KEYS,
  saveLocalBackup,
  loadLocalBackup
} from './offlineDbHelper';

/**
 * الاشتراك بسجل التسويات المالية التاريخية (الأحدث أولاً)
 */
export function subscribeToCashReconciliations(callback) {
  const cached = loadLocalBackup(BACKUP_KEYS.RECONCILIATIONS || 'offline_backup_reconciliations', []);
  if (Array.isArray(cached) && cached.length > 0) {
    callback(cached);
  }

  const q = query(
    collection(db, RECONCILIATIONS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      saveLocalBackup(BACKUP_KEYS.RECONCILIATIONS || 'offline_backup_reconciliations', list);
      callback(list);
    },
    (err) => {
      console.warn('Subscribe to cash reconciliations offline fallback:', err?.message);
      const fallback = loadLocalBackup(BACKUP_KEYS.RECONCILIATIONS || 'offline_backup_reconciliations', []);
      if (Array.isArray(fallback) && fallback.length > 0) {
        callback(fallback);
      }
    }
  );
}

/**
 * الاشتراك بآخر تسوية معتمدة للصندوق
 */
export function subscribeToLatestReconciliation(callback) {
  const cachedLatest = loadLocalBackup(BACKUP_KEYS.LATEST_RECONCILIATION || 'offline_backup_latest_reconciliation', null);
  if (cachedLatest) {
    callback(cachedLatest);
  }

  const ref = doc(db, SETTINGS_COLLECTION, CASH_DRAWER_DOC);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists() && snap.data().latestReconciliation) {
        const latest = snap.data().latestReconciliation;
        saveLocalBackup(BACKUP_KEYS.LATEST_RECONCILIATION || 'offline_backup_latest_reconciliation', latest);
        callback(latest);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn('Subscribe to latest reconciliation offline fallback:', err?.message);
      const fallback = loadLocalBackup(BACKUP_KEYS.LATEST_RECONCILIATION || 'offline_backup_latest_reconciliation', null);
      if (fallback) {
        callback(fallback);
      }
    }
  );
}
