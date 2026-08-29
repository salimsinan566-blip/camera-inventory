import { useEffect } from 'react';
import { useCustomers } from './useCustomers';
import { useSales } from './useSales';
import { useIncomes } from './useIncomes';
import { useSettings } from './useSettings';
import { processAutomatedDebtReminders } from '../services/debtReminderScheduler';

export function useAutoDebtScheduler() {
  const { customers = [] } = useCustomers();
  const { sales = [] } = useSales();
  const { incomes = [] } = useIncomes();
  const { settings = {} } = useSettings();

  useEffect(() => {
    if (settings?.whatsappAutoReminders === false) return;
    if (!customers.length) return;

    // Background interval check every 30 seconds for timely dispatch
    const timer = setInterval(() => {
      processAutomatedDebtReminders({ customers, sales, incomes, settings }).catch(() => {});
    }, 30000);

    // Immediate check
    processAutomatedDebtReminders({ customers, sales, incomes, settings }).catch(() => {});

    return () => clearInterval(timer);
  }, [customers, sales, incomes, settings]);
}
