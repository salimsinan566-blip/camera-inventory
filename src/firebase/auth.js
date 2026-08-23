import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { app } from './config';

export const auth = getAuth(app);

/** تسجيل الدخول بالإيميل وكلمة المرور */
export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** تسجيل الدخول بحساب Google مع تحويل تلقائي لـ Redirect عند حظر النوافذ المنبثقة */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/cancelled-popup-request' ||
      err.message?.includes('popup')
    ) {
      console.warn('Popup blocked, executing signInWithRedirect...');
      return await signInWithRedirect(auth, provider);
    }
    throw err;
  }
}

/** تسجيل الدخول عبر التحويل المباشر signInWithRedirect */
export function loginWithGoogleRedirect() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithRedirect(auth, provider);
}

/** قراءة نتيجة إعادة التوجيه getRedirectResult عند عودة الصفحة */
export function checkRedirectResult() {
  return getRedirectResult(auth);
}

/** إرسال بريد إعادة تعيين كلمة المرور */
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** تسجيل الخروج */
export function logout() {
  return signOut(auth);
}

/** الاستماع لتغيّر حالة تسجيل الدخول. يرجع دالة لإلغاء الاشتراك. */
export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback);
}
