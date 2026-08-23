import { useEffect, useState } from 'react';
import { subscribeToAuthChanges, logout } from '../firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Hook يتتبع حالة تسجيل الدخول والتحقق من القائمة البيضاء للإيميلات المصرح لها (Whitelist)
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const email = (currentUser.email || '').trim().toLowerCase();

      try {
        // التحقق من إعدادات المتجر وقائمة الإيميلات المصرح لها
        const settingsRef = doc(db, 'settings', 'store_info');
        const snap = await getDoc(settingsRef);
        const data = snap.exists() ? snap.data() : {};
        const allowedEmails = Array.isArray(data?.allowedEmails)
          ? data.allowedEmails.map(e => String(e).trim().toLowerCase()).filter(Boolean)
          : [];
        const enforce = data?.enforceEmailWhitelist !== false && allowedEmails.length > 0;

        if (enforce && email && !allowedEmails.includes(email)) {
          console.warn(`[Security] Unauthorized login attempt by: ${email}`);
          setUnauthorizedEmail(currentUser.email);
          await logout();
          setUser(null);
          setLoading(false);
          return;
        }

        setUnauthorizedEmail(null);
        setUser(currentUser);
        setLoading(false);
      } catch (err) {
        console.warn('Could not verify email whitelist, fallback to user session:', err?.message);
        setUser(currentUser);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return { user, loading, unauthorizedEmail, setUnauthorizedEmail };
}
