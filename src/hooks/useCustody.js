import { useState, useEffect } from 'react';
import {
  subscribeToTechnicians,
  subscribeToAllCustodies,
  subscribeToCustodyLogs
} from '../services/custodyService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

export function useCustody() {
  const [technicians, setTechnicians] = useState(() => loadLocalBackup(BACKUP_KEYS.TECHNICIANS, []));
  const [custodies, setCustodies] = useState(() => loadLocalBackup(BACKUP_KEYS.CUSTODIES, {}));
  const [logs, setLogs] = useState(() => loadLocalBackup(BACKUP_KEYS.CUSTODY_LOGS || 'offline_backup_custody_logs', []));
  const [loading, setLoading] = useState(() => !(Array.isArray(technicians) && technicians.length > 0));

  useEffect(() => {
    let unsubs = [];
    let count = 0;

    const checkLoading = () => {
      count++;
      if (count >= 2) setLoading(false);
    };

    const unsubTechs = subscribeToTechnicians((list) => {
      setTechnicians(list);
      checkLoading();
    });

    const unsubCustodies = subscribeToAllCustodies((map) => {
      setCustodies(map);
      checkLoading();
    });

    const unsubLogs = subscribeToCustodyLogs((list) => {
      setLogs(list);
    });

    unsubs = [unsubTechs, unsubCustodies, unsubLogs];

    return () => {
      unsubs.forEach(fn => fn && fn());
    };
  }, []);

  // Compute aggregate statistics
  const stats = {
    totalTechnicians: technicians.length,
    activeTechnicians: technicians.filter(t => t.active !== false).length,
    totalVanItems: Object.values(custodies).reduce((sum, c) => sum + (Number(c.totalItemsCount) || 0), 0),
    totalVanCostValue: Object.values(custodies).reduce((sum, c) => sum + (Number(c.totalCost) || 0), 0),
    totalVanRetailValue: Object.values(custodies).reduce((sum, c) => sum + (Number(c.totalRetail) || 0), 0),
  };

  return {
    technicians,
    custodies,
    logs,
    stats,
    loading
  };
}
