import React, { useState, useEffect } from 'react';

export default function NetworkStatusIndicator({ className = '' }) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <div 
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition-all select-none ${className}`}
        title="النظام متصل بالسحابة وقاعدة البيانات في الوقت الفعلي"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>متصل بالسحابة</span>
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 transition-all select-none shadow-xs ${className}`}
      title="أنت تعمل الآن بوضع عدم الاتصال. تُحفظ المبيعات والعمليات محلياً ومؤمّنة 100%، وستتم مزامنتها تلقائياً عند عودة الإنترنت."
    >
      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
      <span>وضع بدون إنترنت (محلي)</span>
    </div>
  );
}
