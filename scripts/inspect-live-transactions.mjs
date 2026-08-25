import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

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

async function inspectDrawerTransactions() {
  const cdSnap = await getDoc(doc(db, 'settings', 'cash_drawer'));
  console.log('=== LATEST RECONCILIATION IN FIREBASE ===');
  console.log(cdSnap.data());

  const recDate = new Date(cdSnap.data()?.latestReconciliation?.date);
  const baseAmount = Number(cdSnap.data()?.latestReconciliation?.actualCashAmount) || 0;

  console.log(`\nBase Amount: ${baseAmount.toLocaleString()} IQD on ${recDate.toISOString()}`);

  const salesSnap = await getDocs(collection(db, 'sales'));
  const sales = salesSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

  const expensesSnap = await getDocs(collection(db, 'expenses'));
  const expenses = expensesSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

  const incomesSnap = await getDocs(collection(db, 'office_incomes'));
  const incomes = incomesSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

  console.log('\n=== TRANSACTIONS SINCE RECONCILIATION ===');
  let totalInflow = 0;
  sales.forEach(s => {
    const sDate = s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000) : (s.createdAt ? new Date(s.createdAt) : null);
    if (sDate && sDate > recDate) {
      const invType = s.invoiceType || 'cash';
      const paid = invType === 'cash' ? Number(s.total || 0) : (invType === 'debt' ? Number(s.paidAmount || 0) : 0);
      if (paid > 0) {
        totalInflow += paid;
        console.log(`+ Sale #${s.invoiceNumber || s._id} (${s.customerName}) [${invType}]: +${paid.toLocaleString()} IQD [${sDate.toISOString()}]`);
      }
    }
  });

  incomes.forEach(inc => {
    const iDate = inc.createdAt?.seconds ? new Date(inc.createdAt.seconds * 1000) : (inc.createdAt ? new Date(inc.createdAt) : null);
    if (iDate && iDate > recDate) {
      totalInflow += Number(inc.amount || 0);
      console.log(`+ Income "${inc.title}" (${inc.customerName}): +${Number(inc.amount).toLocaleString()} IQD [${iDate.toISOString()}]`);
    }
  });

  let totalOutflow = 0;
  expenses.forEach(e => {
    const eDate = e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000) : (e.createdAt ? new Date(e.createdAt) : null);
    if (eDate && eDate > recDate) {
      if (e.paymentSource !== 'management') {
        totalOutflow += Number(e.amount || 0);
        console.log(`- Expense "${e.title}" (${e.amount}): -${Number(e.amount).toLocaleString()} IQD [${eDate.toISOString()}] (paymentSource: ${e.paymentSource})`);
      }
    }
  });

  console.log('\n=== CALCULATION SUMMARY ===');
  console.log(`Base: ${baseAmount.toLocaleString()} IQD`);
  console.log(`+ Total Inflow: +${totalInflow.toLocaleString()} IQD`);
  console.log(`- Total Outflow: -${totalOutflow.toLocaleString()} IQD`);
  console.log(`= Current Live Drawer Cash: ${(baseAmount + totalInflow - totalOutflow).toLocaleString()} IQD`);
}

inspectDrawerTransactions();
