import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

console.log('Total products in Firebase dump:', dump.products.length);

const categoriesSet = new Set();
const thresholdsMap = {};

dump.products.forEach(p => {
  const cat = p.cameraType || p.category || 'أخرى';
  categoriesSet.add(cat);

  const t = `${p.storeMinThreshold ?? 'undef'}_${p.warehouseMinThreshold ?? 'undef'}_${p.minThreshold ?? 'undef'}`;
  thresholdsMap[t] = (thresholdsMap[t] || 0) + 1;
});

console.log('\nCategories in products:', Array.from(categoriesSet));
console.log('\nThreshold variations in products:', thresholdsMap);

console.log('\nSample products with custom thresholds:');
dump.products.filter(p => p.storeMinThreshold !== undefined || p.minThreshold !== undefined).slice(0, 10).forEach(p => {
  console.log(`- ${p.name}: store=${p.storeQty}, wh=${p.warehouseQty}, storeMin=${p.storeMinThreshold}, whMin=${p.warehouseMinThreshold}, min=${p.minThreshold}`);
});
