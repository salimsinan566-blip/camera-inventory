import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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

async function checkLatestExpenses() {
  const snap = await getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(5)));
  console.log(`Latest 5 expenses in Firebase:`);
  snap.docs.forEach(d => {
    console.log(d.id, d.data());
  });
}

checkLatestExpenses();
