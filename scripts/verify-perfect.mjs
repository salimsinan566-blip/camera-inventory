import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify() {
  console.log('🔍 VERIFYING SUPABASE STATE AFTER 100% FAITHFUL MIGRATION:');

  const { data: sales } = await supabase.from('sales').select('*');
  const debtSales = sales.filter(s => s.remaining_debt > 0 && !s.is_settled);
  console.log(`- Sales: Total ${sales.length}, Unpaid Debt Invoices: ${debtSales.length}`);
  
  const debtsByCustomer = {};
  debtSales.forEach(s => {
    debtsByCustomer[s.customer_name] = (debtsByCustomer[s.customer_name] || 0) + Number(s.remaining_debt);
  });
  console.log('\n- CUSTOMER DEBTS IN SUPABASE:');
  Object.entries(debtsByCustomer).forEach(([c, amt]) => {
    console.log(`  • ${c}: ${amt.toLocaleString()} IQD`);
  });

  const { data: prods } = await supabase.from('products').select('*');
  const outOfStock = prods.filter(p => (Number(p.store_qty) + Number(p.warehouse_qty)) <= 0);
  const lowStock = prods.filter(p => {
    const total = Number(p.store_qty) + Number(p.warehouse_qty);
    const storeT = Number(p.store_min_threshold) || 0;
    const whT = Number(p.warehouse_min_threshold) || 0;
    const totalT = storeT + whT;
    return total > 0 && totalT > 0 && total <= totalT;
  });
  console.log(`\n- Products: Total ${prods.length}, Out of Stock: ${outOfStock.length}, Low Stock: ${lowStock.length}`);

  const { data: incs } = await supabase.from('incomes').select('*');
  const totalIncome = incs.reduce((sum, i) => sum + Number(i.amount), 0);
  console.log(`\n- Incomes: Total ${incs.length} records, Total Amount: ${totalIncome.toLocaleString()} IQD`);
  incs.forEach(i => console.log(`  • ${i.title} (${i.customer_name}): ${Number(i.amount).toLocaleString()} IQD [${i.date?.slice(0, 10)}]`));

  const { data: exps } = await supabase.from('expenses').select('*');
  console.log(`\n- Expenses: Total ${exps.length} records`);

  const { data: purs } = await supabase.from('purchases').select('*');
  console.log(`\n- Purchases: Total ${purs.length} records, Invoice #${purs[0]?.invoice_number}, Supplier: ${purs[0]?.supplier_name}`);
}

verify();
