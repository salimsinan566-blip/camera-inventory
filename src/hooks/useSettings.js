import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BACKUP_KEYS, loadLocalBackup, saveLocalBackup } from '../services/offlineDbHelper';

const defaultSettings = {
  storeName: '',
  address: '',
  description: '',
  logoUrl: null,
  qrCodeUrl: null,
  categories: [],
  telegramBotToken: '',
  telegramChatId: '',
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.SETTINGS, null);
    return cached && typeof cached === 'object' ? { ...defaultSettings, ...cached } : defaultSettings;
  });
  const [loading, setLoading] = useState(() => {
    const cached = loadLocalBackup(BACKUP_KEYS.SETTINGS, null);
    return !cached;
  });

  useEffect(() => {
    const docRef = doc(db, 'settings', 'store_info');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(data);
          saveLocalBackup(BACKUP_KEYS.SETTINGS, data);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('useSettings onSnapshot note (fallback to cache):', err?.message);
        const cached = loadLocalBackup(BACKUP_KEYS.SETTINGS, null);
        if (cached && typeof cached === 'object') {
          setSettings({ ...defaultSettings, ...cached });
        }
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  return { settings, loading };
}

