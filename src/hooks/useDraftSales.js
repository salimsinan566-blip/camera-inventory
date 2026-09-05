import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BACKUP_KEYS, saveLocalBackup, loadLocalBackup } from '../services/offlineDbHelper';

/** Hook يشترك بشكل حي بالفواتير المؤقتة (status == 'draft') مع حماية أوفلاين كاملة */
export function useDraftSales() {
  const [drafts, setDrafts] = useState(() => loadLocalBackup(BACKUP_KEYS.DRAFT_SALES || 'offline_backup_draft_sales', []));
  const [loading, setLoading] = useState(() => !(Array.isArray(drafts) && drafts.length > 0));
  const [error, setError] = useState(null);

  useEffect(() => {
    // بدون orderBy هنا عمداً (فرز محلي بدل ما نحتاج فهرس Firestore مركّب)
    const q = query(collection(db, 'sales'), where('status', 'in', ['draft', 'suspended']));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        saveLocalBackup(BACKUP_KEYS.DRAFT_SALES || 'offline_backup_draft_sales', items);
        setDrafts(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Subscribe to draft sales offline fallback:', err?.message);
        const fallback = loadLocalBackup(BACKUP_KEYS.DRAFT_SALES || 'offline_backup_draft_sales', []);
        if (Array.isArray(fallback) && fallback.length > 0) {
          setDrafts(fallback);
        }
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  return { drafts, loading, error };
}
