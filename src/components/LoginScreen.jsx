import React, { useState } from 'react';
import { login, loginWithGoogle, resetPassword } from '../firebase/auth';
import logo from '../assets/logo.png';
import { useSettings } from '../hooks/useSettings';

export default function LoginScreen({ onSwitchToCustomerPortal, unauthorizedEmail, onClearUnauthorized }) {
  const { settings } = useSettings();
  const activeLogo = settings?.logoUrl || logo;
  const storeName = settings?.storeName || 'Safe Zone';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Clear unauthorized state on input
  function handleInputFocus() {
    if (unauthorizedEmail && onClearUnauthorized) {
      onClearUnauthorized();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      console.error('Login Error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('كلمة المرور غير صحيحة أو تم ربط الحساب بـ Google');
      } else if (err.code === 'auth/user-not-found') {
        setError('البريد الإلكتروني غير مسجل');
      } else {
        setError(err.message || 'بيانات الدخول غير صحيحة');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setSuccessMsg('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google Sign In Error:', err);
      setError(`فشل تسجيل الدخول بجوجل: ${err.message}`);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setError('يرجى كتابة بريدك الإلكتروني في الحقل أولاً لإرسال رابط التعيين');
      return;
    }
    setError('');
    setSuccessMsg('');
    setResetLoading(true);
    try {
      await resetPassword(email);
      setSuccessMsg('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك! (يرجى فحص صندوق الوارد ومجلد Spam/الرسائل غير المرغوبة)');
    } catch (err) {
      console.error('Reset Error:', err);
      setError(`فشل إرسال الرابط: ${err.message}`);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center p-6" dir="rtl">
      <div className="max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <img src={activeLogo} alt={storeName} className="h-24 w-auto object-contain max-w-[220px]" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-brand-100 p-8">
          <h1 className="text-lg font-bold text-ink-900 mb-1 text-center">
            تسجيل دخول موظفي الشركة
          </h1>
          <p className="text-xs text-ink-500 mb-6 text-center">
            نظام إدارة مخزون ومبيعات كامرات المراقبة
          </p>

          {unauthorizedEmail && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 mb-5 space-y-1 text-right shadow-2xs">
              <div className="flex items-center gap-1.5 font-black text-rose-700 text-sm">
                <span>⛔</span>
                <span>الحساب غير مصرح له بالدخول</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                البريد الإلكتروني <strong className="font-mono text-rose-900">{unauthorizedEmail}</strong> غير موجود في قائمة الموظفين المعتمدين.
              </p>
              <p className="text-[10px] text-rose-600 font-medium">
                يرجى التواصل مع مسؤول النظام لإضافة بريدك إلى القائمة المصرح لها.
              </p>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || submitting}
            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-300 rounded-xl py-2.5 px-4 mb-4 flex items-center justify-center gap-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-60 text-sm"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span>{googleLoading ? 'جاري تسجيل الدخول...' : 'الدخول السريع بحساب Google'}</span>
          </button>

          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-xs text-slate-400">أو بالبريد وكلمة المرور</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-ink-700 mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-brand-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              placeholder="name@example.com"
              dir="ltr"
            />

            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-ink-700">كلمة المرور</label>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="text-xs text-brand-700 hover:text-brand-900 underline font-bold cursor-pointer"
              >
                {resetLoading ? 'جاري الإرسال...' : 'نسيت كلمة المرور؟'}
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-brand-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 text-danger-700 text-xs rounded-lg p-2.5 mb-4">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg p-2.5 mb-4">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-ink-900 font-bold rounded-lg py-2.5 disabled:opacity-60 transition-colors cursor-pointer text-sm shadow-xs"
            >
              {submitting ? 'جارٍ الدخول...' : 'دخول الموظف'}
            </button>
          </form>

          {/* Switch to Customer Portal Link */}
          {onSwitchToCustomerPortal && (
            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500 mb-2">أنت عميل وتريد متابعة حسابك؟</p>
              <button
                type="button"
                onClick={onSwitchToCustomerPortal}
                className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <span>👤</span>
                <span>بوابة كشف حساب العملاء (دخول الزبائن)</span>
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-500 mt-6">
          SAFE ZONE — CCTV &amp; Smart Technologies
        </p>
      </div>
    </div>
  );
}
