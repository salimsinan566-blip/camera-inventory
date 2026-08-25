import fs from 'fs';
import path from 'path';

const dump = JSON.parse(fs.readFileSync(path.resolve('scratch/firebase_complete_raw_dump.json'), 'utf-8'));

console.log('=== CASH RECONCILIATIONS IN FIREBASE ===');
console.log(JSON.stringify(dump.cash_reconciliations, null, 2));

console.log('\n=== CASH DRAWER SETTING IN FIREBASE ===');
const cd = dump.settings.find(s => s._id === 'cash_drawer');
console.log(JSON.stringify(cd, null, 2));
