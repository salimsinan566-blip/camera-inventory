import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectDetail() {
  const { data: pur } = await supabase.from('purchases').select('*');
  console.log('PURCHASES:', JSON.stringify(pur, null, 2));

  const { data: sales } = await supabase.from('sales').select('*').limit(3);
  console.log('SALES SAMPLE (keys):', sales && sales.length ? Object.keys(sales[0]) : 'no sales');
  console.log('SALES SAMPLE (0):', JSON.stringify(sales?.[0], null, 2));

  const { data: prods } = await supabase.from('products').select('*').limit(3);
  console.log('PRODUCTS SAMPLE (keys):', prods && prods.length ? Object.keys(prods[0]) : 'no prods');
  console.log('PRODUCTS SAMPLE (0):', JSON.stringify(prods?.[0], null, 2));
}

inspectDetail();
