// إعداد الاتصال بـ Firebase
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || (typeof process !== 'undefined' && process.env) || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyA8J5GjYyrtf-YrMzi5bHrrWtY5myaevhU',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'safe-zone-inv.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'safe-zone-inv',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'safe-zone-inv.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '121093072046',
  appId: env.VITE_FIREBASE_APP_ID || '1:121093072046:web:f22510081336eb7341393f',
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// تفعيل قاعدة البيانات المحلية (Offline Persistence) للحماية من نفاذ الكوتا وتسريع النظام
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('تفعيل الذاكرة المحلية فشل: الموقع مفتوح في عدة تبويبات غير متوافقة.');
    } else if (err.code === 'unimplemented') {
      console.warn('المتصفح الحالي لا يدعم ميزة الذاكرة المحلية لـ Firebase.');
    }
  });
}
