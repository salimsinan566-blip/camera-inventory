import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

console.log('--- PRODUCTS SAMPLE (first 5) ---');
dump.products.slice(0, 5).forEach(p => {
  console.log(`Name: ${p.name} | SKU: ${p.sku} | cameraType: ${p.cameraType} | storeQty: ${p.storeQty} | warehouseQty: ${p.warehouseQty} | minThreshold: ${p.minThreshold} | storeMinThreshold: ${p.storeMinThreshold}`);
});

console.log('\n--- SALES WITH DEBT ---');
const debtSales = dump.sales.filter(s => s.invoiceType === 'debt' || (s.remainingDebt !== undefined && s.remainingDebt > 0));
console.log(`Found ${debtSales.length} debt sales in Firebase dump:`);
debtSales.forEach(s => {
  console.log(`Inv #${s.invoiceNumber} | Cust: ${s.customerName} | Type: ${s.invoiceType} | Total: ${s.total} | Paid: ${s.paidAmount} | Rem: ${s.remainingDebt} | Settled: ${s.isSettled} | PaymentsCount: ${s.payments?.length || 0}`);
});

console.log('\n--- PURCHASES ---');
console.log(JSON.stringify(dump.purchases, null, 2));

console.log('\n--- OFFICE INCOMES ---');
console.log(JSON.stringify(dump.office_incomes, null, 2));

console.log('\n--- SETTINGS DOCS ---');
dump.settings.forEach(s => console.log(s._id, Object.keys(s)));

console.log('\n--- COUNTERS ---');
console.log(JSON.stringify(dump.counters, null, 2));
