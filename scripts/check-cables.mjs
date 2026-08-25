import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

console.log('=== CABLES IN FIREBASE DUMP ===');
dump.products.filter(p => {
  const n = (p.name || '').toLowerCase();
  const c = (p.cameraType || p.category || '').toLowerCase();
  return n.includes('cable') || n.includes('كبل') || n.includes('كيبل') || c.includes('cable') || p.sellMode === 'meter' || p.sellMode === 'roll';
}).forEach(p => {
  console.log(`- Name: ${p.name} | Category: ${p.cameraType || p.category} | SellMode: ${p.sellMode} | MetersPerRoll: ${p.metersPerRoll} | Store: ${p.storeQty} | WH: ${p.warehouseQty}`);
});
