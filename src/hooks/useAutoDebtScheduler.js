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
    // إذا كان سيرفر AWS السحابي أو الـ Cron السحابي هو المشغل، نترك الإرسال التلقائي للسيرفر 24/7 لمنع التكرار
    const isServerHandled = Boolean(settings?.whatsappApiUrl || settings?.whatsappProvider === 'evolution');
    if (isServerHandled) return; // السيرفر هو المسؤول الحصري عن الإرسال التلقائي

    if (settings?.whatsappAutoReminders === false) return;
    if (!customers.length) return;

    // فحص دوري في خلفية المتصفح فقط في حال عدم وجود سيرفر سحابي
    const timer = setInterval(() => {
      processAutomatedDebtReminders({ customers, sales, incomes, settings }).catch(() => {});
    }, 60000);

    return () => clearInterval(timer);
  }, [customers, sales, incomes, settings]);
}
