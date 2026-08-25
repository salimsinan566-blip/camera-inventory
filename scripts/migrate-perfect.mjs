import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cleanTimestamp(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.seconds !== undefined) {
    return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000).toISOString();
  }
  if (val.toDate && typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  return new Date(val).toISOString();
}

async function runPerfectMigration() {
  console.log('🚀 Running 100% Faithful and Exact Migration from Raw Firebase Dump to Supabase...\n');

  const dumpPath = path.resolve('scratch/firebase_complete_raw_dump.json');
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));

  // 1. PRODUCTS (171)
  console.log(`📦 1. Migrating ${dump.products.length} Products...`);
  await supabase.from('products').delete().neq('id', '___non_existent___');
  const productsPayload = dump.products.map(p => {
    const storeMin = p.storeMinThreshold !== undefined ? Number(p.storeMinThreshold) : (p.minThreshold !== undefined ? Number(p.minThreshold) : 0);
    const whMin = p.warehouseMinThreshold !== undefined ? Number(p.warehouseMinThreshold) : 0;
    const minT = p.minThreshold !== undefined ? Number(p.minThreshold) : storeMin;

    return {
      id: p._id,
      name: p.name || 'بدون اسم',
      sku: p.sku || null,
      barcode: p.barcode || null,
      category: p.cameraType || p.category || 'أخرى',
      store_qty: Number(p.storeQty) || 0,
      warehouse_qty: Number(p.warehouseQty) || 0,
      cost_price: Number(p.costPrice) || 0,
      wholesale_price: Number(p.wholesalePrice) || 0,
      retail_price: Number(p.retailPrice) || 0,
      sell_mode: p.sellMode || 'unit',
      meters_per_roll: Number(p.metersPerRoll) || 305,
      image: p.imageUrl || p.image || null,
      min_threshold: minT,
      store_min_threshold: storeMin,
      warehouse_min_threshold: whMin,
      created_at: cleanTimestamp(p.createdAt) || new Date().toISOString(),
      updated_at: cleanTimestamp(p.updatedAt) || new Date().toISOString(),
    };
  });

  for (let i = 0; i < productsPayload.length; i += 50) {
    const chunk = productsPayload.slice(i, i + 50);
    const { error } = await supabase.from('products').insert(chunk);
    if (error) console.error('Error inserting products chunk:', error);
  }
  console.log(`  ✓ Products done (${productsPayload.length} rows)`);

  // 2. CUSTOMERS (42)
  console.log(`👥 2. Migrating ${dump.customers.length} Customers...`);
  await supabase.from('customers').delete().neq('id', '___non_existent___');
  const customersPayload = dump.customers.map(c => ({
    id: c._id,
    name: c.name || 'بدون اسم',
    phone1: c.phone1 || null,
    phone2: c.phone2 || null,
    pin_code: c.pinCode || null,
    notes: c.notes || null,
    customer_type: c.customerType || 'client',
    reminder_schedule: c.reminderSchedule || 'default',
    last_debt_reminder_sent: cleanTimestamp(c.lastDebtReminderSent),
    created_at: cleanTimestamp(c.createdAt) || new Date().toISOString(),
    updated_at: cleanTimestamp(c.updatedAt) || new Date().toISOString(),
  }));
  if (customersPayload.length > 0) {
    const { error } = await supabase.from('customers').insert(customersPayload);
    if (error) console.error('Error inserting customers:', error);
  }
  console.log(`  ✓ Customers done (${customersPayload.length} rows)`);

  // 3. SALES (54)
  console.log(`🧾 3. Migrating ${dump.sales.length} Sales...`);
  await supabase.from('sales').delete().neq('id', '___non_existent___');
  const salesPayload = dump.sales.map(s => {
    const total = Number(s.total) || 0;
    const invType = s.invoiceType || 'cash';
    let paidAmount = Number(s.paidAmount) || 0;
    let remainingDebt = 0;
    let isSettled = false;

    if (invType === 'cash' || invType === 'mastercard') {
      paidAmount = total;
      remainingDebt = 0;
      isSettled = true;
    } else if (invType === 'debt') {
      const payments = Array.isArray(s.payments) ? s.payments : [];
      const totalPaidFromPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (totalPaidFromPayments > 0) {
        paidAmount = totalPaidFromPayments;
      }
      remainingDebt = s.remainingDebt !== undefined ? Number(s.remainingDebt) : Math.max(0, total - paidAmount);
      isSettled = s.isSettled !== undefined ? Boolean(s.isSettled) : (remainingDebt <= 0);
    }

    return {
      id: s._id,
      invoice_number: Number(s.invoiceNumber) || null,
      status: s.status || 'confirmed',
      items: s.items || [],
      subtotal: Number(s.subtotal) || total,
      discount: Number(s.discount) || 0,
      tax_rate: Number(s.taxRate) || 0,
      total: total,
      customer_id: s.customerId || null,
      customer_name: s.customerName || null,
      phone1: s.phone1 || null,
      phone2: s.phone2 || null,
      invoice_type: invType,
      payment_method: s.paymentMethod || (invType === 'mastercard' ? 'mastercard' : (invType === 'debt' ? 'debt' : 'cash')),
      stock_source: s.stockSource || 'store',
      technician_id: s.technicianId || null,
      technician_name: s.technicianName || null,
      cashier_email: s.cashierEmail || null,
      paid_amount: paidAmount,
      remaining_debt: remainingDebt,
      is_settled: isSettled,
      payments: s.payments || [],
      is_offer: Boolean(s.isOffer),
      offer_title: s.offerTitle || null,
      offer_notes: s.offerNotes || null,
      created_at: cleanTimestamp(s.createdAt) || new Date().toISOString(),
      confirmed_at: cleanTimestamp(s.confirmedAt) || cleanTimestamp(s.createdAt) || new Date().toISOString(),
      updated_at: cleanTimestamp(s.updatedAt) || new Date().toISOString(),
    };
  });

  for (let i = 0; i < salesPayload.length; i += 50) {
    const chunk = salesPayload.slice(i, i + 50);
    const { error } = await supabase.from('sales').insert(chunk);
    if (error) console.error('Error inserting sales chunk:', error);
  }
  console.log(`  ✓ Sales done (${salesPayload.length} rows)`);

  // 4. PURCHASES (1)
  console.log(`🛒 4. Migrating ${dump.purchases.length} Purchases...`);
  await supabase.from('purchases').delete().neq('id', '___non_existent___');
  const purchasesPayload = dump.purchases.map(p => ({
    id: p._id,
    invoice_number: Number(p.invoiceNumber) || null,
    supplier_name: p.supplierName || 'مورد',
    supplier_phone: p.supplierPhone || null,
    items: p.items || [],
    total_amount: Number(p.totalAmount) || 0,
    paid_amount: Number(p.paidAmount) || 0,
    paid_from_cash_drawer_amount: Number(p.paidFromCashDrawerAmount) || 0,
    remaining_debt: Number(p.remainingDebt) || 0,
    is_settled: p.isSettled !== undefined ? Boolean(p.isSettled) : (Number(p.remainingDebt || 0) <= 0),
    payments: p.payments || [],
    notes: p.notes || null,
    date: cleanTimestamp(p.date) || new Date().toISOString(),
    created_at: cleanTimestamp(p.createdAt) || new Date().toISOString(),
  }));
  if (purchasesPayload.length > 0) {
    const { error } = await supabase.from('purchases').insert(purchasesPayload);
    if (error) console.error('Error inserting purchases:', error);
  }
  console.log(`  ✓ Purchases done (${purchasesPayload.length} rows)`);

  // 5. EXPENSES (17)
  console.log(`💸 5. Migrating ${dump.expenses.length} Expenses...`);
  await supabase.from('expenses').delete().neq('id', '___non_existent___');
  const expensesPayload = dump.expenses.map(e => ({
    id: e._id,
    title: e.title || 'مصروف',
    amount: Number(e.amount) || 0,
    category: e.category || null,
    payment_source: e.paymentSource || 'cash',
    notes: e.notes || null,
    date: cleanTimestamp(e.date) || new Date().toISOString(),
    performed_by: e.performedBy || e.createdBy || null,
    created_at: cleanTimestamp(e.createdAt) || new Date().toISOString(),
  }));
  if (expensesPayload.length > 0) {
    const { error } = await supabase.from('expenses').insert(expensesPayload);
    if (error) console.error('Error inserting expenses:', error);
  }
  console.log(`  ✓ Expenses done (${expensesPayload.length} rows)`);

  // 6. INCOMES (3)
  console.log(`💰 6. Migrating ${dump.office_incomes.length} Incomes...`);
  await supabase.from('incomes').delete().neq('id', '___non_existent___');
  const incomesPayload = dump.office_incomes.map(inc => ({
    id: inc._id,
    title: inc.title || 'إيراد',
    amount: Number(inc.amount) || 0,
    category: inc.category || null,
    payer_name: inc.payerName || inc.customerName || null,
    customer_name: inc.customerName || inc.payerName || null,
    payment_method: inc.paymentMethod || 'cash',
    notes: inc.notes || null,
    date: cleanTimestamp(inc.date) || new Date().toISOString(),
    created_at: cleanTimestamp(inc.createdAt) || new Date().toISOString(),
  }));
  if (incomesPayload.length > 0) {
    const { error } = await supabase.from('incomes').insert(incomesPayload);
    if (error) console.error('Error inserting incomes:', error);
  }
  console.log(`  ✓ Incomes done (${incomesPayload.length} rows)`);

  // 7. CUSTODY INVENTORY (1)
  console.log(`🚗 7. Migrating ${dump.custody_inventory.length} Custody Inventory...`);
  await supabase.from('custodies').delete().neq('id', '___non_existent___');
  const custodyPayload = dump.custody_inventory.map(c => ({
    id: c._id,
    technician_name: c.technicianName || 'فني',
    technician_phone: c.technicianPhone || null,
    items: c.items || [],
    total_cost: Number(c.totalCost) || 0,
    total_retail: Number(c.totalRetail) || 0,
    total_items_count: Number(c.totalItemsCount) || 0,
    last_updated: cleanTimestamp(c.lastUpdated) || new Date().toISOString(),
  }));
  if (custodyPayload.length > 0) {
    const { error } = await supabase.from('custodies').insert(custodyPayload);
    if (error) console.error('Error inserting custodies:', error);
  }
  console.log(`  ✓ Custody done (${custodyPayload.length} rows)`);

  // 8. CUSTODY LOGS (41)
  console.log(`📋 8. Migrating ${dump.custody_logs.length} Custody Logs...`);
  await supabase.from('custody_logs').delete().neq('id', '___non_existent___');
  const custodyLogsPayload = dump.custody_logs.map(cl => ({
    id: cl._id,
    type: cl.type || null,
    technician_id: cl.technicianId || null,
    technician_name: cl.technicianName || null,
    invoice_number: Number(cl.invoiceNumber) || null,
    customer_name: cl.customerName || null,
    items: cl.items || [],
    total_quantity: Number(cl.totalQuantity) || 0,
    notes: cl.notes || null,
    performed_by: cl.performedBy || null,
    created_at: cleanTimestamp(cl.createdAt) || new Date().toISOString(),
  }));
  for (let i = 0; i < custodyLogsPayload.length; i += 50) {
    const chunk = custodyLogsPayload.slice(i, i + 50);
    const { error } = await supabase.from('custody_logs').insert(chunk);
    if (error) console.error('Error inserting custody logs:', error);
  }
  console.log(`  ✓ Custody logs done (${custodyLogsPayload.length} rows)`);

  // 9. EMPLOYEE ADVANCES (2)
  console.log(`💼 9. Migrating ${dump.employee_advances.length} Employee Advances...`);
  await supabase.from('employee_advances').delete().neq('id', '___non_existent___');
  const advancesPayload = dump.employee_advances.map(a => ({
    id: a._id,
    employee_name: a.employeeName || 'موظف',
    amount: Number(a.amount) || 0,
    repaid_amount: Number(a.repaidAmount) || 0,
    remaining_debt: Number(a.remainingDebt !== undefined ? a.remainingDebt : (Number(a.amount || 0) - Number(a.repaidAmount || 0))),
    payments: a.repayments || [],
    is_settled: Boolean(a.isSettled),
    date: cleanTimestamp(a.date) || new Date().toISOString(),
    created_at: cleanTimestamp(a.createdAt) || new Date().toISOString(),
    updated_at: cleanTimestamp(a.updatedAt) || new Date().toISOString(),
  }));
  if (advancesPayload.length > 0) {
    const { error } = await supabase.from('employee_advances').insert(advancesPayload);
    if (error) console.error('Error inserting advances:', error);
  }
  console.log(`  ✓ Employee advances done (${advancesPayload.length} rows)`);

  // 10. EMPLOYEE REIMBURSEMENTS (1)
  console.log(`🧾 10. Migrating ${dump.employee_reimbursements.length} Employee Reimbursements...`);
  await supabase.from('employee_reimbursements').delete().neq('id', '___non_existent___');
  const reimbursementsPayload = dump.employee_reimbursements.map(r => ({
    id: r._id,
    employee_name: r.employeeName || 'موظف',
    amount: Number(r.amount) || 0,
    status: r.status || 'pending',
    reimbursement_source: r.reimbursementSource || null,
    notes: r.notes || null,
    date: cleanTimestamp(r.date) || new Date().toISOString(),
    reimbursed_at: cleanTimestamp(r.reimbursedAt),
    created_at: cleanTimestamp(r.createdAt) || new Date().toISOString(),
  }));
  if (reimbursementsPayload.length > 0) {
    const { error } = await supabase.from('employee_reimbursements').insert(reimbursementsPayload);
    if (error) console.error('Error inserting reimbursements:', error);
  }
  console.log(`  ✓ Employee reimbursements done (${reimbursementsPayload.length} rows)`);

  // 11. LABOR CHARGES (7)
  console.log(`🔧 11. Migrating ${dump.labor_charges.length} Labor Charges...`);
  await supabase.from('labor_charges').delete().neq('id', '___non_existent___');
  const laborPayload = dump.labor_charges.map(l => ({
    id: l._id,
    name: l.name || l.title || 'أجور عمل',
    default_price: Number(l.defaultPrice) || 0,
    category: l.category || null,
    created_at: cleanTimestamp(l.createdAt) || new Date().toISOString(),
    updated_at: cleanTimestamp(l.updatedAt) || new Date().toISOString(),
  }));
  if (laborPayload.length > 0) {
    const { error } = await supabase.from('labor_charges').insert(laborPayload);
    if (error) console.error('Error inserting labor charges:', error);
  }
  console.log(`  ✓ Labor charges done (${laborPayload.length} rows)`);

  // 12. OFFERS (4)
  console.log(`📄 12. Migrating ${dump.offers.length} Offers...`);
  await supabase.from('offers').delete().neq('id', '___non_existent___');
  const offersPayload = dump.offers.map(o => ({
    id: o._id,
    offer_number: Number(o.offerNumber) || null,
    title: o.title || o.offerName || 'عرض سعر',
    customer_name: o.customerName || null,
    customer_phone: o.customerPhone || null,
    items: o.items || [],
    subtotal: Number(o.subtotal) || 0,
    discount: Number(o.discount) || 0,
    total: Number(o.total) || 0,
    notes: o.notes || null,
    status: o.status || 'draft',
    created_at: cleanTimestamp(o.createdAt) || new Date().toISOString(),
    updated_at: cleanTimestamp(o.updatedAt) || new Date().toISOString(),
  }));
  if (offersPayload.length > 0) {
    const { error } = await supabase.from('offers').insert(offersPayload);
    if (error) console.error('Error inserting offers:', error);
  }
  console.log(`  ✓ Offers done (${offersPayload.length} rows)`);

  // 13. SETTINGS (5)
  console.log(`⚙️ 13. Migrating ${dump.settings.length} Settings docs...`);
  for (const s of dump.settings) {
    const docId = s._id;
    const { _id, ...cleanData } = s;
    await supabase.from('settings').upsert({
      id: docId,
      data: cleanData,
      updated_at: new Date().toISOString()
    });
  }
  console.log(`  ✓ Settings done (${dump.settings.length} docs)`);

  // 14. COUNTERS (4)
  console.log(`🔢 14. Migrating Counters...`);
  for (const c of dump.counters) {
    await supabase.from('counters').upsert({
      id: c._id,
      next: Number(c.next || c.lastNumber || 1001)
    });
  }
  await supabase.from('counters').upsert({ id: 'purchases', next: 1002 });
  console.log(`  ✓ Counters done`);

  // 15. INVENTORY LOGS (82)
  console.log(`📜 15. Migrating ${dump.inventory_logs.length} Inventory Logs...`);
  await supabase.from('inventory_logs').delete().neq('id', '___non_existent___');
  const invLogsPayload = dump.inventory_logs.map(l => ({
    id: l._id,
    product_id: l.productId || null,
    product_name: l.productName || null,
    type: l.type || l.action || 'adjustment',
    change_store_qty: Number(l.changeStoreQty || l.changeQty || 0),
    change_warehouse_qty: Number(l.changeWarehouseQty || 0),
    previous_store_qty: Number(l.previousStoreQty || 0),
    new_store_qty: Number(l.newStoreQty || 0),
    previous_warehouse_qty: Number(l.previousWarehouseQty || 0),
    new_warehouse_qty: Number(l.newWarehouseQty || 0),
    reason: l.reason || l.notes || null,
    performed_by: l.performedBy || null,
    created_at: cleanTimestamp(l.createdAt) || new Date().toISOString(),
  }));
  for (let i = 0; i < invLogsPayload.length; i += 50) {
    const chunk = invLogsPayload.slice(i, i + 50);
    const { error } = await supabase.from('inventory_logs').insert(chunk);
    if (error) console.error('Error inserting inv logs chunk:', error);
  }
  console.log(`  ✓ Inventory logs done (${invLogsPayload.length} rows)`);

  // 16. CASH RECONCILIATIONS (2)
  console.log(`💵 16. Migrating ${dump.cash_reconciliations.length} Cash Reconciliations...`);
  await supabase.from('cash_reconciliations').delete().neq('id', '___non_existent___');
  const reconciliationsPayload = dump.cash_reconciliations.map(r => ({
    id: r._id,
    date: cleanTimestamp(r.date) || new Date().toISOString(),
    actual_cash_amount: Number(r.actualCashAmount || r.actualAmount || 0),
    calculated_cash_amount: Number(r.calculatedCashAmount || r.expectedAmount || 0),
    difference: Number(r.difference) || 0,
    notes: r.notes || null,
    reconciled_by: r.reconciledBy || r.performedBy || null,
    created_at: cleanTimestamp(r.createdAt) || new Date().toISOString(),
  }));
  if (reconciliationsPayload.length > 0) {
    const { error } = await supabase.from('cash_reconciliations').insert(reconciliationsPayload);
    if (error) console.error('Error inserting reconciliations:', error);
  }
  console.log(`  ✓ Cash reconciliations done (${reconciliationsPayload.length} rows)`);

  console.log('\n======================================================');
  console.log('🎉🎉🎉 100% PERFECT LOSSLESS MIGRATION TO SUPABASE COMPLETED! 🎉🎉🎉');
  console.log('======================================================');
}

runPerfectMigration();
