import { useState, useEffect, useMemo } from 'react';
import { subscribeToIncomes } from '../services/incomesService';

export function useIncomes() {
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToIncomes((list) => {
      setIncomes(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    let total = 0;
    let today = 0;
    let month = 0;

    incomes.forEach((item) => {
      const amt = Number(item.amount) || 0;
      total += amt;

      const itemDate = (item.date || item.createdAt || '').slice(0, 10);
      const itemMonth = (item.date || item.createdAt || '').slice(0, 7);

      if (itemDate === todayStr) today += amt;
      if (itemMonth === monthStr) month += amt;
    });

    return {
      totalIncomes: total,
      todayIncomes: today,
      monthIncomes: month,
      count: incomes.length
    };
  }, [incomes]);

  return { incomes, stats, loading };
}
