// إعداد الاتصال بـ Firebase
// جميع القيم تُقرأ من ملف .env (انظر .env.example لأسماء المتغيرات المطلوبة)
// لا تضع أي مفتاح حقيقي هنا مباشرة في الكود.

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// تحقق مبكر: لو نسي المستخدم إعداد .env، نطبع تحذيراً واضحاً بدل فشل صامت
if (!firebaseConfig.projectId) {
  // eslint-disable-next-line no-console
  console.error(
    '⚠️ إعدادات Firebase غير مكتملة. تأكد من إنشاء ملف .env بناءً على .env.example'
  );
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
