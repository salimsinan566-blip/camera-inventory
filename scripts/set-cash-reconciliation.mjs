import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, addDoc, collection } from 'firebase/firestore';

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

async function setCashDrawer() {
  const targetAmount = 1050000;
  const now = new Date();

  console.log(`Setting latest cash drawer reconciliation to ${targetAmount.toLocaleString()} IQD...`);

  // Add reconciliation record
  const recRef = await addDoc(collection(db, 'cash_reconciliations'), {
    actualCashAmount: targetAmount,
    calculatedAmount: targetAmount,
    difference: 0,
    notes: 'تسوية رصيد القاصة الفعلي',
    date: now.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
    createdBy: 'salim sinan'
  });

  // Update cash_drawer setting
  await setDoc(doc(db, 'settings', 'cash_drawer'), {
    updatedAt: now.toISOString(),
    latestReconciliation: {
      id: recRef.id,
      actualCashAmount: targetAmount,
      date: now.toISOString(),
      notes: 'تسوية رصيد القاصة الفعلي',
      createdBy: 'salim sinan'
    }
  }, { merge: true });

  console.log('✓ Successfully updated cash drawer reconciliation in Firebase!');
}

setCashDrawer();
