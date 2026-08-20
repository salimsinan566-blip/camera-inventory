import { useState, useEffect, useMemo } from 'react';
import { subscribeToEmployeeAdvances } from '../services/employeeAdvancesService';

export function useEmployeeAdvances() {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToEmployeeAdvances((list) => {
      setAdvances(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const activeAdvances = useMemo(() => {
    return advances.filter((a) => a.status === 'active' || (Number(a.remainingDebt) > 0));
  }, [advances]);

  const settledAdvances = useMemo(() => {
    return advances.filter((a) => a.status === 'settled' && Number(a.remainingDebt || 0) <= 0);
  }, [advances]);

  const totalActiveAdvancesDebt = useMemo(() => {
    return activeAdvances.reduce((sum, a) => sum + (Number(a.remainingDebt !== undefined ? a.remainingDebt : a.amount) || 0), 0);
  }, [activeAdvances]);

  const totalIssuedAdvances = useMemo(() => {
    return advances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [advances]);

  return {
    advances,
    activeAdvances,
    settledAdvances,
    totalActiveAdvancesDebt,
    totalIssuedAdvances,
    loading
  };
}
