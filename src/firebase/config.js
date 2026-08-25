// إعداد الاتصال بـ Firebase
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA8J5GjYyrtf-YrMzi5bHrrWtY5myaevhU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'safe-zone-inv.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'safe-zone-inv',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'safe-zone-inv.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '121093072046',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:121093072046:web:f22510081336eb7341393f',
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// تفعيل قاعدة البيانات المحلية (Offline Persistence) للحماية من نفاذ الكوتا وتسريع النظام
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('تفعيل الذاكرة المحلية فشل: الموقع مفتوح في عدة تبويبات غير متوافقة.');
  } else if (err.code === 'unimplemented') {
    console.warn('المتصفح الحالي لا يدعم ميزة الذاكرة المحلية لـ Firebase.');
  }
});
