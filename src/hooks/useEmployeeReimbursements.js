import { useState, useEffect, useMemo } from 'react';
import { subscribeToEmployeeReimbursements } from '../services/employeeReimbursementService';

export function useEmployeeReimbursements() {
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToEmployeeReimbursements((list) => {
      setReimbursements(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const pendingReimbursements = useMemo(() => {
    return reimbursements.filter((r) => r.status === 'pending');
  }, [reimbursements]);

  const settledReimbursements = useMemo(() => {
    return reimbursements.filter((r) => r.status === 'reimbursed');
  }, [reimbursements]);

  const totalPendingAmount = useMemo(() => {
    return pendingReimbursements.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [pendingReimbursements]);

  const totalReimbursedAmount = useMemo(() => {
    return settledReimbursements.reduce((sum, r) => sum + (Number(r.reimbursedAmount || r.amount) || 0), 0);
  }, [settledReimbursements]);

  return {
    reimbursements,
    pendingReimbursements,
    settledReimbursements,
    totalPendingAmount,
    totalReimbursedAmount,
    loading
  };
}
