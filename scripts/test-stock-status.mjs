import { createClient } from '@supabase/supabase-js';
import { normalizeProduct, getStockStatus, STOCK_STATUS } from '../src/models/product.js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testStock() {
  const { data: rawProds } = await supabase.from('products').select('*');
  const prods = rawProds.map(normalizeProduct);

  const lowStock = prods.filter(p => getStockStatus(p) === STOCK_STATUS.LOW_STOCK);
  const outOfStock = prods.filter(p => getStockStatus(p) === STOCK_STATUS.OUT_OF_STOCK);
  const inStock = prods.filter(p => getStockStatus(p) === STOCK_STATUS.IN_STOCK);

  console.log(`Total Products: ${prods.length}`);
  console.log(`Out of Stock: ${outOfStock.length}`);
  console.log(`Low Stock: ${lowStock.length}`);
  console.log(`In Stock: ${inStock.length}`);

  console.log('\n--- ALL LOW STOCK PRODUCTS (count: ' + lowStock.length + ') ---');
  lowStock.forEach(p => {
    const total = (Number(p.storeQty) || 0) + (Number(p.warehouseQty) || 0);
    const storeT = Number(p.storeMinThreshold) || 0;
    const whT = Number(p.warehouseMinThreshold) || 0;
    console.log(`- ${p.name}: Total=${total} (Store=${p.storeQty}, WH=${p.warehouseQty}) | Threshold: StoreMin=${storeT}, WHMin=${whT}`);
  });
}

testStock();
