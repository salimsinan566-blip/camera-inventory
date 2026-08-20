import { useState, useEffect } from 'react';
import {
  subscribeToCashReconciliations,
  subscribeToLatestReconciliation
} from '../services/cashReconciliationService';

export function useCashReconciliation() {
  const [latestReconciliation, setLatestReconciliation] = useState(null);
  const [reconciliations, setReconciliations] = useState([]);
  const [loading, setLoading] = useState(true);

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
