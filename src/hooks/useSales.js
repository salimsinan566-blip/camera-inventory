import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Hook يشترك بشكل حي بسجل المبيعات المؤكدة فقط (الأحدث أولاً) — الفواتير المؤقتة مستبعدة */
export function useSales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
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
        setSales(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { sales, loading, error };
}
