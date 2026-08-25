import { useEffect } from 'react';
import { useCustomers } from './useCustomers';
import { useSales } from './useSales';
import { useIncomes } from './useIncomes';
import { useSettings } from './useSettings';

export function useAutoDebtScheduler() {
  // Restore global hooks to keep Firebase listeners alive and cache populated
  // This prevents the app from being slow when navigating between tabs
  useCustomers();
  useSales();
  useIncomes();
  useSettings();

  // تم تعطيل الإرسال من المتصفح والاعتماد كلياً على سيرفر EC2 لضمان العمل 24/7
  // هذا يمنع مشكلة توقف الإرسال عند إغلاق المتصفح أو التبويب
  return;
}
