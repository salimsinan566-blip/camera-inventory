import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export function useSettings() {
  const [settings, setSettings] = useState({
    storeName: '',
    address: '',
    description: '',
    logoUrl: null,
    qrCodeUrl: null,
    categories: [],
    telegramBotToken: '',
    telegramChatId: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'store_info');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
        setLoading(false);
      },
      (err) => {
        console.warn('useSettings onSnapshot note (e.g. unauthenticated portal):', err?.message);
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  return { settings, loading };
}
