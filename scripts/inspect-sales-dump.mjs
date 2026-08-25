import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

console.log('Total sales:', dump.sales.length);

let totalSalesAmount = 0;
let totalPaidAmount = 0;
let totalDebtAmount = 0;

dump.sales.forEach(s => {
  const total = Number(s.total) || 0;
  const invType = s.invoiceType || 'cash';
  const paid = Number(s.paidAmount) || 0;
  const rem = Number(s.remainingDebt !== undefined ? s.remainingDebt : (invType === 'debt' ? total - paid : 0));
  
  totalSalesAmount += total;
  totalPaidAmount += (invType === 'cash' || invType === 'mastercard') ? total : paid;
  totalDebtAmount += rem;
});

console.log('Total Sales Amount:', totalSalesAmount.toLocaleString(), 'IQD');
console.log('Total Paid Amount:', totalPaidAmount.toLocaleString(), 'IQD');
console.log('Total Debt Amount:', totalDebtAmount.toLocaleString(), 'IQD');

console.log('\n--- CUSTOMER DEBTS BREAKDOWN IN FIREBASE ---');
const customerDebts = {};
dump.sales.forEach(s => {
  const invType = s.invoiceType || 'cash';
  const total = Number(s.total) || 0;
  const paid = Number(s.paidAmount) || 0;
  const rem = Number(s.remainingDebt !== undefined ? s.remainingDebt : (invType === 'debt' ? total - paid : 0));
  
  if (rem > 0 && !s.isSettled) {
    const cName = s.customerName || 'بدون اسم';
    if (!customerDebts[cName]) customerDebts[cName] = { count: 0, debt: 0 };
    customerDebts[cName].count++;
    customerDebts[cName].debt += rem;
  }
});

Object.entries(customerDebts).forEach(([cName, data]) => {
  console.log(`- ${cName}: ${data.debt.toLocaleString()} IQD (${data.count} unpaid invoices)`);
});
