import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BACKUP_KEYS, saveLocalBackup, loadLocalBackup } from '../services/offlineDbHelper';

export function useOffers() {
  const [offers, setOffers] = useState(() => loadLocalBackup(BACKUP_KEYS.OFFERS || 'offline_backup_offers', []));
  const [loading, setLoading] = useState(() => !(Array.isArray(offers) && offers.length > 0));
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
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : (doc.data().createdAt ? new Date(doc.data().createdAt) : new Date()),
          updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : (doc.data().updatedAt ? new Date(doc.data().updatedAt) : new Date()),
        }));
        saveLocalBackup(BACKUP_KEYS.OFFERS || 'offline_backup_offers', results);
        setOffers(results);
        setLoading(false);
      },
      (err) => {
        console.warn('Subscribe to offers offline fallback:', err?.message);
        const fallback = loadLocalBackup(BACKUP_KEYS.OFFERS || 'offline_backup_offers', []);
        if (Array.isArray(fallback) && fallback.length > 0) {
          setOffers(fallback);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { offers, loading, error };
}
