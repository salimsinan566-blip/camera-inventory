import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Hook يشترك بشكل حي بالفواتير المؤقتة (status == 'draft') فقط */
export function useDraftSales() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // بدون orderBy هنا عمداً (فرز محلي بدل ما نحتاج فهرس Firestore مركّب)
    const q = query(collection(db, 'sales'), where('status', 'in', ['draft', 'suspended']));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDrafts(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { drafts, loading, error };
}
