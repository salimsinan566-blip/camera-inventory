/**
 * Utility for reconciling supplier debts, invoice remaining balances, and payment statuses.
 * Solves the bug where already-paid invoices still display debt repayment buttons or false remaining debt.
 */

export function cleanSupplierNameKey(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Finds the corresponding supplier debt record from the supplierDebts list.
 */
export function findSupplierDebtRecord(supplierName, supplierDebts = []) {
  if (!supplierName) return null;
  const key = cleanSupplierNameKey(supplierName);
  return (supplierDebts || []).find((d) => cleanSupplierNameKey(d.supplierName) === key) || null;
}

/**
 * Reconciles an array of purchase invoices for a given supplier using chronological FIFO settlement.
 * 
 * If supplier.remainingDebt <= 0:
 *   All invoices are treated as 100% settled (computedRemaining = 0, computedPaid = invoice.totalAmount, isFullyPaid = true).
 * 
 * If supplier.remainingDebt > 0:
 *   Settles invoices chronologically (FIFO, oldest first).
 *   Only the newest invoices that make up the actual remaining debt will have computedRemaining > 0.
 *   Sum of computedRemaining across all invoices matches supplier.remainingDebt exactly.
 */
export function reconcileSupplierInvoices(invoices = [], supplierDebtRecord = null) {
  if (!invoices || invoices.length === 0) return [];

  const remainingDebt = Math.max(0, Number(supplierDebtRecord?.remainingDebt) || 0);

  // If the supplier has zero remaining debt, EVERY invoice is fully paid!
  if (remainingDebt === 0) {
    return invoices.map((inv) => {
      const total = Number(inv.totalAmount) || 0;
      return {
        ...inv,
        computedTotal: total,
        computedPaid: total,
        computedRemaining: 0,
        isFullyPaid: true,
        reconciledStatus: 'paid',
      };
    });
  }

  // If supplier has remaining debt:
  // Sort invoices chronologically (oldest first) to settle them in FIFO order
  const indexed = invoices.map((inv, originalIndex) => ({
    inv,
    originalIndex,
    time: new Date(inv.date || inv.createdAt || 0).getTime(),
  }));

  indexed.sort((a, b) => a.time - b.time);

  // Total invoice amounts
  const totalInvoicesSum = indexed.reduce(
    (sum, item) => sum + (Number(item.inv.totalAmount) || 0),
    0
  );

  // Available paid funds to allocate across invoices:
  // Either from supplierDebtRecord.totalPaid or (totalInvoicesSum - remainingDebt)
  const recordedPaid = Number(supplierDebtRecord?.totalPaid) || 0;
  let paidPool = Math.max(
    0,
    Math.min(
      recordedPaid > 0 ? recordedPaid : (totalInvoicesSum - remainingDebt),
      totalInvoicesSum
    )
  );

  const reconciledIndexed = [];

  for (const item of indexed) {
    const inv = item.inv;
    const total = Number(inv.totalAmount) || 0;

    let computedPaid = 0;
    let computedRemaining = total;
    let reconciledStatus = 'debt';

    if (paidPool >= total) {
      computedPaid = total;
      computedRemaining = 0;
      reconciledStatus = 'paid';
      paidPool -= total;
    } else if (paidPool > 0) {
      computedPaid = paidPool;
      computedRemaining = Math.max(0, total - paidPool);
      reconciledStatus = 'partial';
      paidPool = 0;
    } else {
      computedPaid = 0;
      computedRemaining = total;
      reconciledStatus = total === 0 ? 'paid' : 'debt';
    }

    reconciledIndexed.push({
      originalIndex: item.originalIndex,
      reconciled: {
        ...inv,
        computedTotal: total,
        computedPaid,
        computedRemaining,
        isFullyPaid: computedRemaining <= 0,
        reconciledStatus,
      },
    });
  }

  // Restore original ordering
  reconciledIndexed.sort((a, b) => a.originalIndex - b.originalIndex);
  return reconciledIndexed.map((item) => item.reconciled);
}

/**
 * Reconciles a single invoice by looking up its supplier in supplierDebts.
 */
export function reconcileSingleInvoice(invoice, supplierDebts = [], allPurchases = []) {
  if (!invoice) return null;

  const debtDoc = findSupplierDebtRecord(invoice.supplierName, supplierDebts);
  const remainingDebt = Math.max(0, Number(debtDoc?.remainingDebt) || 0);

  // If debt is 0, invoice is definitely paid!
  if (remainingDebt === 0) {
    const total = Number(invoice.totalAmount) || 0;
    return {
      ...invoice,
      computedTotal: total,
      computedPaid: total,
      computedRemaining: 0,
      isFullyPaid: true,
      reconciledStatus: 'paid',
      supplierRemainingDebt: 0,
    };
  }

  // If we have access to all purchases, filter for this supplier's invoices and perform FIFO
  if (allPurchases && allPurchases.length > 0) {
    const key = cleanSupplierNameKey(invoice.supplierName);
    const supplierInvoices = allPurchases.filter(
      (p) => cleanSupplierNameKey(p.supplierName) === key
    );
    if (supplierInvoices.length > 0) {
      const reconciledList = reconcileSupplierInvoices(supplierInvoices, debtDoc);
      const matched = reconciledList.find((i) => i.id === invoice.id);
      if (matched) {
        return {
          ...matched,
          supplierRemainingDebt: remainingDebt,
        };
      }
    }
  }

  // Fallback: an invoice's remaining balance cannot exceed the supplier's remainingDebt
  const total = Number(invoice.totalAmount) || 0;
  const initialPaid = Number(invoice.paidAmount) || 0;
  const rawRemaining = Math.max(0, total - initialPaid);
  const effectiveRemaining = Math.min(rawRemaining, remainingDebt);
  const effectivePaid = Math.max(initialPaid, total - effectiveRemaining);

  return {
    ...invoice,
    computedTotal: total,
    computedPaid: effectivePaid,
    computedRemaining: effectiveRemaining,
    isFullyPaid: effectiveRemaining <= 0,
    reconciledStatus: effectiveRemaining <= 0 ? 'paid' : (effectivePaid > 0 ? 'partial' : 'debt'),
    supplierRemainingDebt: remainingDebt,
  };
}
