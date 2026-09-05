import { useEffect, useState } from 'react';
import { subscribeToCustomers } from '../services/customersService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

/** Hook يشترك بشكل حي بقائمة العملاء مع تحميل مسبق فوري أوفلاين */
export function useCustomers() {
  const [customers, setCustomers] = useState(() => loadLocalBackup(BACKUP_KEYS.CUSTOMERS, []));
  const [loading, setLoading] = useState(() => !(Array.isArray(customers) && customers.length > 0));

  useEffect(() => {
    const unsubscribe = subscribeToCustomers((list) => {
      setCustomers(list);
      setLoading(false);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  return { customers, loading };
}

