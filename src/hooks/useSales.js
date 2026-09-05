import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BACKUP_KEYS, loadLocalBackup, saveLocalBackup, recordLastKnownInvoiceNumber } from '../services/offlineDbHelper';

/** Hook يشترك بشكل حي بسجل المبيعات المؤكدة مع دعم كامل للعمل أوفلاين */
export function useSales() {
  const [sales, setSales] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.SALES, []);
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.SALES, []);
    return !(Array.isArray(cached) && cached.length > 0);
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'sales'),
      where('status', '==', 'confirmed'),
      orderBy('invoiceNumber', 'desc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSales(items);
        saveLocalBackup(BACKUP_KEYS.SALES, items);
        if (items.length > 0 && items[0].invoiceNumber) {
          recordLastKnownInvoiceNumber(items[0].invoiceNumber);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('useSales snapshot offline/quota fallback:', err?.message);
        const cached = loadLocalBackup(BACKUP_KEYS.SALES, []);
        if (Array.isArray(cached) && cached.length > 0) {
          setSales(cached);
        }
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { sales, loading, error };
}

