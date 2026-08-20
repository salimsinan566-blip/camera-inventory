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
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { settings, loading };
}
