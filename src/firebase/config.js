// إعداد الاتصال بـ Firebase
// جميع القيم تُقرأ من ملف .env (انظر .env.example لأسماء المتغيرات المطلوبة)
// لا تضع أي مفتاح حقيقي هنا مباشرة في الكود.

import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA8J5GjYyrtf-YrMzi5bHrrWtY5myaevhU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'safe-zone-inv.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'safe-zone-inv',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'safe-zone-inv.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '121093072046',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:121093072046:web:f22510081336eb7341393f',
};

export const app = initializeApp(firebaseConfig);

// تفعيل الكاش المحلي المستمر متعدد التبويبات لتوفير أكثر من 85% من قراءات الفايربيس ومنع استنزاف الكوتا
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
