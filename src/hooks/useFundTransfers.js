import { useState, useEffect, useMemo } from 'react';
import { subscribeToFundTransfers, ACCOUNT_TYPES } from '../services/fundTransfersService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

export function useFundTransfers() {
  const [transfers, setTransfers] = useState(() => loadLocalBackup(BACKUP_KEYS.TRANSFERS || 'offline_backup_fund_transfers', []));
  const [loading, setLoading] = useState(() => !(Array.isArray(transfers) && transfers.length > 0));

  useEffect(() => {
    const unsubscribe = subscribeToFundTransfers((list) => {
      setTransfers(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    let totalMasterToCash = 0;
    let totalCashToMaster = 0;
    let todayMasterToCash = 0;
    let todayCashToMaster = 0;

    (transfers || []).forEach((t) => {
      const amt = Number(t.amount) || 0;
      const tDate = (t.date || t.createdAt || '').slice(0, 10);

      if (t.fromAccount === ACCOUNT_TYPES.MASTERCARD && t.toAccount === ACCOUNT_TYPES.CASH_DRAWER) {
        totalMasterToCash += amt;
        if (tDate === todayStr) todayMasterToCash += amt;
      } else if (t.fromAccount === ACCOUNT_TYPES.CASH_DRAWER && t.toAccount === ACCOUNT_TYPES.MASTERCARD) {
        totalCashToMaster += amt;
        if (tDate === todayStr) todayCashToMaster += amt;
      }
    });

    return {
      totalMasterToCash,
      totalCashToMaster,
      todayMasterToCash,
      todayCashToMaster,
      netToCash: totalMasterToCash - totalCashToMaster,
      count: (transfers || []).length
    };
  }, [transfers]);

  return { transfers, stats, loading };
}
