import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function testRead() {
  try {
    console.log('Testing Firestore read...');
    const snap = await getDocs(collection(db, 'sales'));
    console.log('Successfully read sales count:', snap.docs.length);
    if (snap.docs.length > 0) {
      console.log('Sample sale:', JSON.stringify(snap.docs[0].data(), null, 2));
    }
  } catch (err) {
    console.error('Firestore read error:', err.message);
  }
}

testRead();
