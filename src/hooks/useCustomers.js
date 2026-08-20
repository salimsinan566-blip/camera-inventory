import { useEffect, useState } from 'react';
import { subscribeToCustomers } from '../services/customersService';

/** Hook يشترك بشكل حي بقائمة العملاء */
export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

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
