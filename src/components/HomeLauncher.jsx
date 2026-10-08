import React from 'react';
import { NAVIGATION_SECTIONS } from '../config/navigation';
import logoFallback from '../assets/logo.png';
import NetworkStatusIndicator from './NetworkStatusIndicator';

export default function HomeLauncher({ onSelectTab, settings, trashCount = 0, canAccessTab }) {
  const logoUrl = settings?.logoUrl || logoFallback;
  const storeName = (!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') 
    ? 'Safe Zone' 
    : settings.storeName;

  return (
    <div 
      className="min-h-screen lg:h-screen lg:max-h-screen flex flex-col overflow-y-auto lg:overflow-hidden bg-[var(--bg-app,#f8fafc)] text-slate-800 select-none px-4 md:px-8 pt-2 pb-6 relative" 
      dir="rtl"
    >
      {/* مؤشر الاتصال بالسحابة عائم بأقصى اليسار في الأعلى لتوفير المساحة بالكامل */}
      <div className="absolute top-3 left-4 md:left-8 z-20">
        <NetworkStatusIndicator className="text-xs px-3 py-1 shadow-2xs bg-white/95 backdrop-blur-sm" />
      </div>

      {/* اللوكو في أعلى الشاشة مباشرة بدون أي فراغات ميتة */}
      <div className="flex flex-col items-center justify-center shrink-0 pt-0 pb-1 mb-2">
        <div className="h-28 sm:h-32 md:h-36 lg:h-40 max-w-[360px] md:max-w-[460px] flex items-center justify-center transition-transform duration-300 hover:scale-[1.02]">
          <img 
            src={logoUrl} 
            alt={storeName} 
            className="max-h-full max-w-full object-contain filter drop-shadow-sm" 
          />
        </div>
      </div>

      {/* شبكة الأقسام مرفوعة للأعلى مباشرة تحت اللوكو وبخط كبير وواضح */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col justify-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          {NAVIGATION_SECTIONS.map((section) => {
            const isTrash = section.id === 'trash';
            const badgeValue = isTrash ? trashCount : null;
            const isLocked = canAccessTab && !canAccessTab(section.id);

            return (
              <button
                key={section.id}
                onClick={() => onSelectTab(section.id)}
                className={`group bg-white rounded-2xl border p-3 sm:p-3.5 md:p-4 text-right shadow-2xs transition-all duration-150 flex items-center gap-3.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:scale-[0.98] ${
                  isLocked 
                    ? 'border-slate-200/60 opacity-80 hover:border-slate-300 bg-slate-50/50' 
                    : 'border-slate-200/90 hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-400'
                }`}
              >
                {/* أيقونة كبيرة وواضحة */}
                <div className={`w-11 h-11 md:w-12 md:h-12 rounded-xl border flex items-center justify-center transition-all duration-150 shadow-2xs shrink-0 ${
                  isLocked
                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                    : 'bg-slate-50 border-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:border-indigo-600 group-hover:text-white'
                }`}>
                  <svg 
                    className="w-6 h-6 md:w-7 md:h-7" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d={section.icon} />
                  </svg>
                </div>

                {/* عنوان القسم بخط عريض وكبير */}
                <div className="flex-1 min-w-0">
                  <h2 className={`text-base sm:text-lg md:text-xl font-black transition-colors truncate ${
                    isLocked ? 'text-slate-500' : 'text-slate-800 group-hover:text-indigo-600'
                  }`}>
                    {section.label}
                  </h2>
                </div>

                {/* الشارة إذا وجدت أو سهم الدخول أو قفل */}
                <div className="flex items-center gap-2 shrink-0">
                  {badgeValue > 0 && (
                    <span className="bg-red-500 text-white text-xs font-black px-2.5 py-0.5 rounded-full animate-pulse">
                      {badgeValue}
                    </span>
                  )}
                  {isLocked ? (
                    <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/80">
                      🔒 مقفل
                    </span>
                  ) : (
                    <div className="text-slate-300 group-hover:text-indigo-600 group-hover:-translate-x-1 transition-all duration-150 pr-0.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
