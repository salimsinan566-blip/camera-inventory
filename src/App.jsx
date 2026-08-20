import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import CustomerPortal from './components/CustomerPortal';

export default function App() {
  const { user, loading } = useAuth();
  const [isCustomerPortal, setIsCustomerPortal] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('portal') === 'customer' ||
      params.get('portal') === 'client' ||
      params.has('customer') ||
      window.location.hash.includes('portal')
    );
  });

  // Listen to popstate or hashchange
  useEffect(() => {
    function checkUrl() {
      const params = new URLSearchParams(window.location.search);
      if (
        params.get('portal') === 'customer' ||
        params.get('portal') === 'client' ||
        params.has('customer') ||
        window.location.hash.includes('portal')
      ) {
        setIsCustomerPortal(true);
      }
    }
    window.addEventListener('popstate', checkUrl);
    return () => window.removeEventListener('popstate', checkUrl);
  }, []);

  function handleSwitchToStaff() {
    setIsCustomerPortal(false);
    const url = new URL(window.location);
    url.searchParams.delete('portal');
    url.searchParams.delete('customer');
    url.searchParams.delete('phone');
    url.searchParams.delete('pin');
    window.history.pushState({}, '', url.pathname);
  }

  function handleSwitchToCustomerPortal() {
    setIsCustomerPortal(true);
    const url = new URL(window.location);
    url.searchParams.set('portal', 'customer');
    window.history.pushState({}, '', url.toString());
  }

  // If customer portal is active, display it immediately
  if (isCustomerPortal) {
    return <CustomerPortal onSwitchToStaffLogin={handleSwitchToStaff} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center" dir="rtl">
        <p className="text-ink-700">جارٍ التحقق من الجلسة...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSwitchToCustomerPortal={handleSwitchToCustomerPortal} />;
  }

  return <Dashboard user={user} />;
}
