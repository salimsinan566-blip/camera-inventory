import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkDebts() {
  const { data: sales } = await supabase.from('sales').select('*');
  console.log('Total sales in Supabase:', sales?.length);
  
  const debtSales = (sales || []).filter(s => s.invoice_type === 'debt' || s.remaining_debt > 0 || !s.is_settled);
  console.log('Debt sales count:', debtSales.length);
  debtSales.slice(0, 5).forEach(s => {
    console.log(`Invoice #${s.invoice_number} | Type: ${s.invoice_type} | Cust: ${s.customer_name} | Total: ${s.total} | Paid: ${s.paid_amount} | Rem: ${s.remaining_debt} | Settled: ${s.is_settled}`);
  });

  const { data: cust } = await supabase.from('customers').select('*');
  console.log('Total customers:', cust?.length);
}

checkDebts();
