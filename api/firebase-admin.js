import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'safe-zone-inv';

if (getApps().length === 0) {
  try {
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
    if (rawSa) {
      const sa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
      initializeApp({
        credential: cert(sa),
        projectId: sa.project_id || DEFAULT_PROJECT_ID
      });
    }
  } catch (error) {
    console.warn('Firebase Admin Service Account initialization skipped (local dev):', error.message);
  }
}

let _dbInstance = null;

export const db = {
  collection: (name) => {
    try {
      if (!_dbInstance) {
        if (getApps().length === 0) return null;
        _dbInstance = getFirestore();
      }
      return _dbInstance ? _dbInstance.collection(name) : null;
    } catch (err) {
      console.warn('Firebase Admin Firestore not available in local dev:', err.message);
      return null;
    }
  }
};
