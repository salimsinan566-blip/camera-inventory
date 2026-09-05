// =========================================================================
// محرك العمليات الآمنة أوفلاين وللحماية عند نفاذ الكوتا (Offline DB Helper)
// =========================================================================

import {
  writeBatch,
  doc,
  getDoc,
  getDocs,
  getDocFromCache,
  getDocsFromCache,
  runTransaction
} from 'firebase/firestore';

export const BACKUP_KEYS = {
  PRODUCTS: 'offline_backup_products',
  SALES: 'offline_backup_sales',
  CUSTOMERS: 'offline_backup_customers',
  SETTINGS: 'offline_backup_settings',
  TECHNICIANS: 'offline_backup_technicians',
  CUSTODIES: 'offline_backup_custodies',
  PURCHASES: 'offline_backup_purchases',
  EXPENSES: 'offline_backup_expenses',
  INCOMES: 'offline_backup_incomes',
  SALARIES: 'offline_backup_salaries',
  LAST_INVOICE_NUM: 'offline_last_invoice_number',
};

export function saveLocalBackup(key, data) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && data !== undefined) {
      window.localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (e) {
    console.warn('Could not save local backup for ' + key + ':', e?.message);
  }
}

export function loadLocalBackup(key, defaultValue = null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const item = window.localStorage.getItem(key);
      if (item) return JSON.parse(item);
    }
  } catch (e) {
    console.warn('Could not load local backup for ' + key + ':', e?.message);
  }
  return defaultValue;
}

export function getNextOfflineInvoiceNumber(currentCounterFromDoc = null) {
  const STARTING_INVOICE_NUMBER = 1001;
  let lastKnown = Number(loadLocalBackup(BACKUP_KEYS.LAST_INVOICE_NUM, STARTING_INVOICE_NUMBER));
  
  if (currentCounterFromDoc && Number(currentCounterFromDoc) > lastKnown) {
    lastKnown = Number(currentCounterFromDoc);
  }

  const nextNumber = lastKnown + 1;
  saveLocalBackup(BACKUP_KEYS.LAST_INVOICE_NUM, nextNumber);
  return nextNumber;
}

export function recordLastKnownInvoiceNumber(num) {
  const n = Number(num);
  if (!n || isNaN(n)) return;
  const current = Number(loadLocalBackup(BACKUP_KEYS.LAST_INVOICE_NUM, 0));
  if (n > current) {
    saveLocalBackup(BACKUP_KEYS.LAST_INVOICE_NUM, n);
  }
}

export async function runOfflineSafeTransaction(dbInstance, callback) {
  try {
    return await runTransaction(dbInstance, callback);
  } catch (err) {
    const msg = err.message ? err.message.toLowerCase() : '';
    const code = err.code || '';

    const isOfflineOrQuota = 
      msg.includes('connection') ||
      msg.includes('offline') ||
      msg.includes('network') ||
      msg.includes('failed to get document') ||
      msg.includes('quota') ||
      msg.includes('resource') ||
      msg.includes('unavailable') ||
      msg.includes('timeout') ||
      code === 'unavailable' ||
      code === 'resource-exhausted' ||
      code === 'failed-precondition' ||
      code === 'deadline-exceeded';

    if (isOfflineOrQuota) {
      console.warn('⚠️ Network or Quota limit hit, switching transaction to Offline Local Batch...', err?.message);
      const batch = writeBatch(dbInstance);

      const fakeTransaction = {
        get: async (ref) => {
          try {
            return await getDoc(ref);
          } catch (e) {
            try {
              return await getDocFromCache(ref);
            } catch (cacheErr) {
              console.warn('Offline cache miss for ref:', ref.path);
              if (ref.path.includes('counters')) {
                const nextSeq = getNextOfflineInvoiceNumber();
                return {
                  exists: () => true,
                  data: () => ({ next: nextSeq }),
                  id: ref.id,
                  ref,
                };
              }
              return { exists: () => false, data: () => ({}), id: ref.id, ref };
            }
          }
        },
        set: (ref, data, opts) => {
          if (ref.path.includes('counters') && data?.next) {
            recordLastKnownInvoiceNumber(data.next);
          }
          batch.set(ref, data, opts);
          return fakeTransaction;
        },
        update: (ref, data) => {
          batch.update(ref, data);
          return fakeTransaction;
        },
        delete: (ref) => {
          batch.delete(ref);
          return fakeTransaction;
        }
      };

      const result = await callback(fakeTransaction);

      batch.commit().catch((commitErr) => {
        console.warn('Offline batch background sync note:', commitErr?.message);
      });

      return result;
    }

    throw err;
  }
}

export async function safeGetDoc(docRef) {
  try {
    return await getDoc(docRef);
  } catch (err) {
    try {
      return await getDocFromCache(docRef);
    } catch (cacheErr) {
      console.warn('safeGetDoc cache fallback for:', docRef.path, cacheErr?.message);
      return { exists: () => false, data: () => ({}) };
    }
  }
}

export async function safeGetDocs(queryRef) {
  try {
    return await getDocs(queryRef);
  } catch (err) {
    try {
      return await getDocsFromCache(queryRef);
    } catch (cacheErr) {
      console.warn('safeGetDocs cache fallback for query:', cacheErr?.message);
      return { empty: true, docs: [], size: 0 };
    }
  }
}
