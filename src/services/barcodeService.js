import { doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  runOfflineSafeTransaction,
  loadLocalBackup,
  saveLocalBackup,
  BACKUP_KEYS
} from './offlineDbHelper';

const COUNTER_REF_PATH = ['counters', 'barcode'];
const STARTING_NUMBER = 200001; // نبدأ من رقم بادئ حتى يكون الباركود 6 خانات فأكثر

export function getNextOfflineBarcodeNumber() {
  const current = Number(loadLocalBackup(BACKUP_KEYS.LAST_BARCODE_NUM || 'offline_last_barcode_number', STARTING_NUMBER));
  const next = current + 1;
  saveLocalBackup(BACKUP_KEYS.LAST_BARCODE_NUM || 'offline_last_barcode_number', next);
  return next;
}

/** يولّد رقم باركود تسلسلي جديد وفريد (كنص) بأمان تام حتى دون اتصال */
export async function generateNextBarcode() {
  const counterRef = doc(db, ...COUNTER_REF_PATH);

  try {
    const newNumber = await runOfflineSafeTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let current = STARTING_NUMBER;
      if (counterSnap.exists()) {
        current = Number(counterSnap.data().next) || STARTING_NUMBER;
      } else {
        current = Number(loadLocalBackup(BACKUP_KEYS.LAST_BARCODE_NUM || 'offline_last_barcode_number', STARTING_NUMBER));
      }
      const next = current + 1;
      transaction.set(counterRef, { next: next }, { merge: true });
      saveLocalBackup(BACKUP_KEYS.LAST_BARCODE_NUM || 'offline_last_barcode_number', next);
      return current;
    });

    return String(newNumber);
  } catch (err) {
    console.warn('generateNextBarcode fallback to local generator:', err?.message);
    return String(getNextOfflineBarcodeNumber());
  }
}

/** يولّد باركود لمنتج معيّن ويحفظه مباشرة على مستند المنتج بالـ Firestore */
export async function generateBarcodeForProduct(productId) {
  const barcode = await generateNextBarcode();
  const { updateProduct } = await import('./productsService');
  await updateProduct(productId, { barcode });
  return barcode;
}

