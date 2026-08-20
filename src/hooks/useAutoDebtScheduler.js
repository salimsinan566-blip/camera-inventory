import { useEffect, useRef } from 'react';
import { useCustomers } from './useCustomers';
import { useSales } from './useSales';
import { useIncomes } from './useIncomes';
import { useSettings } from './useSettings';
import { useUI } from '../contexts/UIContext';
import { processAutomatedDebtReminders } from '../services/debtReminderScheduler';

export function useAutoDebtScheduler() {
  const { customers } = useCustomers();
  const { sales } = useSales();
  const { incomes } = useIncomes();
  const { settings } = useSettings();
  const { toast } = useUI();
  const isRunningRef = useRef(false);
  const lastRunTimestampRef = useRef(0);

  useEffect(() => {
    if (!settings || settings.whatsappAutoReminders === false) return;
    if (!customers || customers.length === 0) return;

    async function checkReminders() {
      // Prevent overlapping runs or rapid executions within 10 seconds
      if (isRunningRef.current || Date.now() - lastRunTimestampRef.current < 10000) return;
      isRunningRef.current = true;
      lastRunTimestampRef.current = Date.now();

      try {
        await processAutomatedDebtReminders({
          customers,
          sales,
          incomes,
          settings,
          onNotification: (cust, debt) => {
            if (toast) {
              toast(
                `🔔 [تذكير تلقائي] تم إرسال تذكير بالدين (${Number(debt).toLocaleString()} د.ع) إلى «${cust.name}» بنجاح!`,
                'info'
              );
            }
          }
        });
      } catch (err) {
        console.error('AutoDebtScheduler error:', err);
      } finally {
        isRunningRef.current = false;
      }
    }

    // Debounce first check by 2 seconds
    const timeout = setTimeout(checkReminders, 2000);

    // Repeat check every 15 seconds (15,000 ms) for timely dispatch
    const interval = setInterval(checkReminders, 15000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [customers, sales, incomes, settings]);
}
