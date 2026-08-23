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

  const dataRef = useRef({ customers, sales, incomes, settings, toast });
  dataRef.current = { customers, sales, incomes, settings, toast };

  useEffect(() => {
    async function checkReminders() {
      const { customers, sales, incomes, settings, toast } = dataRef.current;
      if (!settings || settings.whatsappAutoReminders === false) return;
      if (!customers || customers.length === 0) return;

      // Prevent overlapping runs or rapid executions within 60 seconds
      if (isRunningRef.current || Date.now() - lastRunTimestampRef.current < 60000) return;
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

    // First check after 10 seconds of mounting
    const timeout = setTimeout(checkReminders, 10000);

    // Repeat check every 2 minutes (120,000 ms) instead of rapid 15s polling
    const interval = setInterval(checkReminders, 120000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
}
