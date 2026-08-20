import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useOffers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'offers'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const results = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        }));
        setOffers(results);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching offers:', err);
        setError('تعذر تحميل عروض الأسعار');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { offers, loading, error };
}
