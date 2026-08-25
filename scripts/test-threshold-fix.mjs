import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

function normalizeProductClean(raw) {
  const p = { ...raw };
  p.storeQty = Number(p.storeQty) || 0;
  p.warehouseQty = Number(p.warehouseQty) || 0;
  
  // Keep exact storeMinThreshold or minThreshold, do not force 5 if 0 or undefined
  if (p.storeMinThreshold !== undefined) {
    p.storeMinThreshold = Number(p.storeMinThreshold);
  } else if (p.minThreshold !== undefined) {
    p.storeMinThreshold = Number(p.minThreshold);
  } else {
    p.storeMinThreshold = 0;
  }

  p.warehouseMinThreshold = p.warehouseMinThreshold !== undefined ? Number(p.warehouseMinThreshold) : 0;
  return p;
}

function getStockStatusClean(product) {
  const total = (Number(product.storeQty) || 0) + (Number(product.warehouseQty) || 0);
  if (total <= 0) return 'out_of_stock';

  const storeT = Number(product.storeMinThreshold) || 0;
  const whT = Number(product.warehouseMinThreshold) || 0;
  const totalT = storeT + whT;

  if (totalT > 0 && total <= totalT) return 'low_stock';

  return 'in_stock';
}

const prods = dump.products.map(normalizeProductClean);
const outOfStock = prods.filter(p => getStockStatusClean(p) === 'out_of_stock');
const lowStock = prods.filter(p => getStockStatusClean(p) === 'low_stock');
const inStock = prods.filter(p => getStockStatusClean(p) === 'in_stock');

console.log('--- REFINED STOCK STATUS COUNTS ---');
console.log(`Total: ${prods.length}`);
console.log(`Out of Stock (نافذة): ${outOfStock.length}`);
console.log(`Low Stock (منخفضة): ${lowStock.length}`);
console.log(`In Stock (متوفرة): ${inStock.length}`);

console.log('\n--- LOW STOCK ITEMS (count: ' + lowStock.length + ') ---');
lowStock.forEach(p => {
  const total = p.storeQty + p.warehouseQty;
  console.log(`• ${p.name}: Quantity = ${total} (Store=${p.storeQty}, WH=${p.warehouseQty}) | Threshold = StoreMin:${p.storeMinThreshold}, WHMin:${p.warehouseMinThreshold}`);
});

console.log('\n--- OUT OF STOCK ITEMS (count: ' + outOfStock.length + ') ---');
outOfStock.forEach(p => {
  console.log(`• ${p.name} (SKU: ${p.sku})`);
});
