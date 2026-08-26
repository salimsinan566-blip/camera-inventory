import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, getApps as getClientApps } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  collection as clientCol, 
  doc as clientDoc, 
  getDoc as clientGetDoc, 
  getDocs as clientGetDocs, 
  updateDoc as clientUpdateDoc,
  setDoc as clientSetDoc
} from 'firebase/firestore';

const DEFAULT_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'safe-zone-inv';

const firebaseClientConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyA8J5GjYyrtf-YrMzi5bHrrWtY5myaevhU',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'safe-zone-inv.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'safe-zone-inv',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'safe-zone-inv.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '121093072046',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:121093072046:web:f22510081336eb7341393f',
};

let _adminDb = null;
let _clientDb = null;

if (getAdminApps().length === 0) {
  try {
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
    if (rawSa) {
      const sa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
      initAdminApp({
        credential: cert(sa),
        projectId: sa.project_id || DEFAULT_PROJECT_ID
      });
      _adminDb = getAdminFirestore();
    }
  } catch (error) {
    console.warn('Firebase Admin init skipped:', error.message);
  }
} else {
  try {
    _adminDb = getAdminFirestore();
  } catch (e) {}
}

import { getAuth, signInAnonymously } from 'firebase/auth';

async function getClientDb() {
  if (!_clientDb) {
    const app = getClientApps().length > 0 ? getClientApps()[0] : initClientApp(firebaseClientConfig);
    _clientDb = getClientFirestore(app);
  }
  try {
    const app = getClientApps()[0];
    const auth = getAuth(app);
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (authErr) {
    console.warn('Anonymous auth note:', authErr.message);
  }
  return _clientDb;
}

export const db = {
  collection: (colName) => {
    if (global._testDb) {
      return global._testDb.collection(colName);
    }
    if (_adminDb) {
      try {
        return _adminDb.collection(colName);
      } catch (e) {}
    }

    return {
      get: async () => {
        const cDb = await getClientDb();
        const cCollection = clientCol(cDb, colName);
        const snap = await clientGetDocs(cCollection);
        const docs = snap.docs.map(d => ({
          id: d.id,
          exists: d.exists(),
          data: () => d.data()
        }));
        return {
          docs,
          empty: snap.empty,
          size: snap.size,
          forEach: (cb) => docs.forEach(cb)
        };
      },
      doc: (docId) => {
        return {
          get: async () => {
            const cDb = await getClientDb();
            const dRef = clientDoc(cDb, colName, docId);
            const dSnap = await clientGetDoc(dRef);
            return {
              id: dSnap.id,
              exists: dSnap.exists(),
              data: () => (dSnap.exists() ? dSnap.data() : undefined)
            };
          },
          update: async (data) => {
            const cDb = await getClientDb();
            const dRef = clientDoc(cDb, colName, docId);
            return clientUpdateDoc(dRef, data);
          },
          set: async (data, options = {}) => {
            const cDb = await getClientDb();
            const dRef = clientDoc(cDb, colName, docId);
            return clientSetDoc(dRef, data, options);
          }
        };
      }
    };
  }
};
