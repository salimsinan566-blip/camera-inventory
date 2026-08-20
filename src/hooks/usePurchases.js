import { useState, useEffect } from 'react';
import {
  subscribeToPurchases,
  subscribeToSupplierDebts,
  subscribeToDebtPayments,
  subscribeToSuppliers,
  subscribeToDraftPurchases
} from '../services/purchasesService';

export function usePurchases() {
  const [purchases, setPurchases] = useState([]);
  const [draftPurchases, setDraftPurchases] = useState([]);
  const [supplierDebts, setSupplierDebts] = useState([]);
  const [debtPayments, setDebtPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

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
