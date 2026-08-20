import { useEffect, useState } from 'react';
import { subscribeToAuthChanges } from '../firebase/auth';

/**
 * Hook بسيط يتتبع حالة تسجيل الدخول الحالية.
 * يرجع { user, loading }:
 * - loading: true أثناء التحقق الأولي من الجلسة
 * - user: كائن المستخدم أو null إذا لم يسجّل الدخول
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}
