import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = {
  apiKey: 'AIzaSyA8J5GjYyrtf-YrMzi5bHrrWtY5myaevhU',
  authDomain: 'safe-zone-inv.firebaseapp.com',
  projectId: 'safe-zone-inv',
  storageBucket: 'safe-zone-inv.firebasestorage.app',
  messagingSenderId: '121093072046',
  appId: '1:121093072046:web:f22510081336eb7341393f',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS = [
  'products',
  'customers',
  'sales',
  'purchases',
  'expenses',
  'office_incomes',
  'incomes',
  'custody_inventory',
  'custody_logs',
  'employee_advances',
  'employee_reimbursements',
  'labor_charges',
  'offers',
  'settings',
  'counters',
  'cash_reconciliations',
  'inventory_logs',
  'technicians',
  'suppliers',
  'supplier_debts',
  'debt_payments',
  'draft_purchases'
];

async function dumpAll() {
  console.log('📦 Starting Full Raw Firebase Firestore Dump...');
  const fullDump = {};

  for (const colName of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      fullDump[colName] = snap.docs.map(d => ({
        _id: d.id,
        ...d.data()
      }));
      console.log(`  ✓ ${colName}: ${fullDump[colName].length} docs`);
    } catch (err) {
      console.warn(`  ⚠️ ${colName}: ${err.message}`);
      fullDump[colName] = [];
    }
  }

  const outDir = path.resolve('scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  
  const outFile = path.join(outDir, 'firebase_complete_raw_dump.json');
  fs.writeFileSync(outFile, JSON.stringify(fullDump, null, 2), 'utf-8');
  console.log(`\n🎉 Dump completed and saved to: ${outFile}`);
}

dumpAll();
