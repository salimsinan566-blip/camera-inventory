import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeProduct } from '../models/product';
import { BACKUP_KEYS, loadLocalBackup, saveLocalBackup } from '../services/offlineDbHelper';

/**
 * Hook يشترك بشكل حي (real-time) بقائمة المنتجات مع دعم كامل للعمل أوفلاين وللحماية عند نفاذ الكوتا.
 */
export function useProducts() {
  const [products, setProducts] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.PRODUCTS, []);
    return Array.isArray(cached) ? cached.map(normalizeProduct) : [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.PRODUCTS, []);
    return !(Array.isArray(cached) && cached.length > 0);
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => normalizeProduct({ id: d.id, ...d.data() }));
        setProducts(items);
        saveLocalBackup(BACKUP_KEYS.PRODUCTS, items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('useProducts snapshot offline/quota fallback:', err?.message);
        const cached = loadLocalBackup(BACKUP_KEYS.PRODUCTS, []);
        if (Array.isArray(cached) && cached.length > 0) {
          setProducts(cached.map(normalizeProduct));
        }
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { products, loading, error };
}

