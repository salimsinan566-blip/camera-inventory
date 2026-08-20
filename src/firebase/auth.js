import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
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

/** تسجيل الدخول بحساب Google بضغطة زر */
export function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
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
