import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useLaborCharges() {
  const [laborCharges, setLaborCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = collection(db, 'labor_charges');
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const charges = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // ترتيب على جهة العميل لتجنب مشاكل الـ Index في الفايربيس
        charges.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tA - tB;
        });
        setLaborCharges(charges);
        setLoading(false);
      },
      (err) => {
        console.error("Labor charges error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    
    return unsubscribe;
  }, []);

  return { laborCharges, loading, error };
}
