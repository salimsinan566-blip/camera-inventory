import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { normalizeProduct } from '../models/product';

/**
 * Hook يشترك بشكل حي (real-time) بقائمة المنتجات من Firestore.
 * يرجع { products, loading, error }.
 */
export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => normalizeProduct({ id: d.id, ...d.data() }));
        setProducts(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { products, loading, error };
}
