import { useState, useEffect } from 'react';
import {
  subscribeToCashReconciliations,
  subscribeToLatestReconciliation
} from '../services/cashReconciliationService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

export function useCashReconciliation() {
  const [latestReconciliation, setLatestReconciliation] = useState(() => loadLocalBackup(BACKUP_KEYS.LATEST_RECONCILIATION || 'offline_backup_latest_reconciliation', null));
  const [reconciliations, setReconciliations] = useState(() => loadLocalBackup(BACKUP_KEYS.RECONCILIATIONS || 'offline_backup_reconciliations', []));
  const [loading, setLoading] = useState(() => !(latestReconciliation || (Array.isArray(reconciliations) && reconciliations.length > 0)));

  useEffect(() => {
    let loadedCount = 0;
    const checkDone = () => {
      loadedCount++;
      if (loadedCount >= 2) setLoading(false);
    };

    const unsubLatest = subscribeToLatestReconciliation((latest) => {
      setLatestReconciliation(latest);
      checkDone();
    });

    const unsubList = subscribeToCashReconciliations((list) => {
      setReconciliations(list);
      checkDone();
    });

    return () => {
      unsubLatest && unsubLatest();
      unsubList && unsubList();
    };
  }, []);

  return {
    latestReconciliation,
    reconciliations,
    loading
  };
}
