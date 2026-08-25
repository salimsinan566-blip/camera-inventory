import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  console.log('--- PURCHASES ---');
  const { data: purchases, error: purErr } = await supabase.from('purchases').select('*');
  console.log('Purchases count:', purchases?.length, purchases);

  console.log('\n--- PRODUCTS SAMPLE ---');
  const { data: prods } = await supabase.from('products').select('*').limit(3);
  console.log('Products sample:', prods);

  console.log('\n--- SALES SAMPLE ---');
  const { data: sales } = await supabase.from('sales').select('*').limit(3);
  console.log('Sales sample:', sales);

  console.log('\n--- INCOMES ---');
  const { data: incomes } = await supabase.from('incomes').select('*');
  console.log('Incomes count:', incomes?.length, incomes);

  console.log('\n--- SETTINGS ---');
  const { data: settings } = await supabase.from('settings').select('*');
  console.log('Settings:', settings);
}

inspect();
