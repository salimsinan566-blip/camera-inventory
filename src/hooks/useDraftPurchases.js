import { useEffect, useState } from 'react';
import { subscribeToDraftPurchases } from '../services/purchasesService';

export function useDraftPurchases() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToDraftPurchases((list) => {
      setDrafts(list);
      setLoading(false);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  return { drafts, loading };
}

