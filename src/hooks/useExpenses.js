import { useState, useEffect } from 'react';
import { subscribeToExpenses } from '../services/expensesService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

export function useExpenses() {
  const [expenses, setExpenses] = useState(() => loadLocalBackup(BACKUP_KEYS.EXPENSES, []));
  const [loading, setLoading] = useState(() => !(Array.isArray(expenses) && expenses.length > 0));

  useEffect(() => {
    const unsub = subscribeToExpenses((list) => {
      setExpenses(list);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  const stats = {
    todayTotal: expenses
      .filter(e => (e.date || e.createdAt || '').slice(0, 10) === todayStr)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    monthTotal: expenses
      .filter(e => (e.date || e.createdAt || '').slice(0, 7) === currentMonthStr)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    allTotal: expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    count: expenses.length
  };

  return {
    expenses,
    stats,
    loading
  };
}
