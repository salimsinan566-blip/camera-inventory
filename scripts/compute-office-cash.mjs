import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

const recDate = new Date("2026-08-16T15:41:39.686Z");
const baseAmount = 698750;

console.log(`Base reconciliation cash on 2026-08-16: ${baseAmount.toLocaleString()} IQD\n`);

let cashSalesInflow = 0;
let debtSalesInflow = 0;
let manualIncomesInflow = 0;
let advanceRepaymentsInflow = 0;

dump.sales.forEach(s => {
  const sDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : new Date(s.createdAt);
  if (sDate > recDate) {
    if (s.invoiceType === 'cash' || !s.invoiceType) {
      cashSalesInflow += Number(s.total || 0);
      console.log(`+ Cash Sale #${s.invoiceNumber} (${s.customerName}): +${Number(s.total).toLocaleString()} IQD [${sDate.toISOString().slice(0, 16)}]`);
    } else if (s.invoiceType === 'debt') {
      const paid = Number(s.paidAmount || 0);
      if (paid > 0) {
        debtSalesInflow += paid;
        console.log(`+ Debt Sale Paid #${s.invoiceNumber} (${s.customerName}): +${paid.toLocaleString()} IQD [${sDate.toISOString().slice(0, 16)}]`);
      }
    }
  }
});

dump.office_incomes.forEach(inc => {
  const iDate = inc.createdAt?.seconds ? new Date(inc.createdAt.seconds * 1000) : new Date(inc.createdAt || inc.date);
  if (iDate > recDate) {
    manualIncomesInflow += Number(inc.amount || 0);
    console.log(`+ Manual Income "${inc.title}" (${inc.customerName}): +${Number(inc.amount).toLocaleString()} IQD [${iDate.toISOString().slice(0, 16)}]`);
  }
});

let expensesOutflow = 0;
dump.expenses.forEach(e => {
  const eDate = e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000) : new Date(e.createdAt || e.date);
  if (eDate > recDate && e.paymentSource !== 'management') {
    expensesOutflow += Number(e.amount || 0);
    console.log(`- Expense "${e.title}": -${Number(e.amount).toLocaleString()} IQD [${eDate.toISOString().slice(0, 16)}]`);
  }
});

let purchasesOutflow = 0;
dump.purchases.forEach(p => {
  const pDate = p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt || p.date);
  if (pDate > recDate) {
    const amt = Number(p.paidFromCashDrawerAmount !== undefined ? p.paidFromCashDrawerAmount : p.paidAmount) || 0;
    purchasesOutflow += amt;
    console.log(`- Purchase from "${p.supplierName}": -${amt.toLocaleString()} IQD [${pDate.toISOString().slice(0, 16)}]`);
  }
});

const totalInflow = cashSalesInflow + debtSalesInflow + manualIncomesInflow + advanceRepaymentsInflow;
const totalOutflow = expensesOutflow + purchasesOutflow;
const actualCashInOffice = baseAmount + totalInflow - totalOutflow;

console.log('\n======================================');
console.log(`Total Inflows since 16-Aug: +${totalInflow.toLocaleString()} IQD`);
console.log(`Total Outflows since 16-Aug: -${totalOutflow.toLocaleString()} IQD`);
console.log(`>>> ACTUAL CASH IN OFFICE (النقد الفعلي في المكتب): ${actualCashInOffice.toLocaleString()} IQD <<<`);
console.log('======================================');
