import { useState, useEffect } from 'react';
import {
  subscribeToPurchases,
  subscribeToSupplierDebts,
  subscribeToDebtPayments,
  subscribeToSuppliers,
  subscribeToDraftPurchases
} from '../services/purchasesService';
import { BACKUP_KEYS, loadLocalBackup } from '../services/offlineDbHelper';

export function usePurchases() {
  const [purchases, setPurchases] = useState(() => loadLocalBackup(BACKUP_KEYS.PURCHASES, []));
  const [draftPurchases, setDraftPurchases] = useState(() => loadLocalBackup(BACKUP_KEYS.DRAFT_PURCHASES || 'offline_backup_draft_purchases', []));
  const [supplierDebts, setSupplierDebts] = useState(() => loadLocalBackup(BACKUP_KEYS.SUPPLIER_DEBTS || 'offline_backup_supplier_debts', []));
  const [debtPayments, setDebtPayments] = useState(() => loadLocalBackup(BACKUP_KEYS.DEBT_PAYMENTS || 'offline_backup_debt_payments', []));
  const [suppliers, setSuppliers] = useState(() => loadLocalBackup(BACKUP_KEYS.SUPPLIERS || 'offline_backup_suppliers', []));
  const [loading, setLoading] = useState(() => !(Array.isArray(purchases) && purchases.length > 0));

  useEffect(() => {
    let count = 0;
    const checkLoading = () => {
      count++;
      if (count >= 2) setLoading(false);
    };

    const unsubP = subscribeToPurchases((list) => {
      setPurchases(list);
      checkLoading();
    });

    const unsubDraft = subscribeToDraftPurchases((list) => {
      setDraftPurchases(list);
    });

    const unsubD = subscribeToSupplierDebts((list) => {
      setSupplierDebts(list);
      checkLoading();
    });

    const unsubPay = subscribeToDebtPayments((list) => {
      setDebtPayments(list);
    });

    const unsubSup = subscribeToSuppliers((list) => {
      setSuppliers(list);
    });

    return () => {
      unsubP && unsubP();
      unsubDraft && unsubDraft();
      unsubD && unsubD();
      unsubPay && unsubPay();
      unsubSup && unsubSup();
    };
  }, []);

  const totalRemainingDebt = supplierDebts.reduce((sum, d) => sum + (Number(d.remainingDebt) || 0), 0);
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
  const totalPaidToSuppliers = purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);

  const stats = {
    totalRemainingDebt,
    totalPurchasesAmount,
    totalPaidToSuppliers,
    suppliersCount: supplierDebts.length,
    invoicesCount: purchases.length,
    draftsCount: draftPurchases.length
  };

  return {
    purchases,
    draftPurchases,
    supplierDebts,
    debtPayments,
    suppliers,
    stats,
    loading
  };
}
