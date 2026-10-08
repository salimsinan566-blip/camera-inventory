import React from 'react';
import NetworkStatusIndicator from './NetworkStatusIndicator';
import logoFallback from '../assets/logo.png';

export default function TopNav({ 
  activeSection, 
  onBack, 
  storeName, 
  logoUrl,
  customTitle,
  customBadge,
  leftActions,
}) {
  const currentLogo = logoUrl || logoFallback;
  const currentTitle = (!storeName || storeName.toUpperCase() === 'SAFE ZONE') ? 'Safe Zone' : storeName;

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-3 md:px-6 py-2.5 shadow-2xs shrink-0 safe-top">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* الجهة اليمنى: زر الرجوع وعنوان القسم الحالي */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all duration-200 border border-slate-300 active:scale-95 cursor-pointer shadow-2xs shrink-0"
            title="الرجوع"
          >
            {/* سهم يشير لليمين في واجهة RTL ليعبر عن الرجوع */}
            <svg 
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span>رجوع</span>
          </button>

          {(customBadge || customTitle || activeSection) && (
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200 min-w-0">
              {customBadge && (
                <span className="bg-slate-100 border border-slate-300 text-slate-800 font-mono font-bold text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded shrink-0">
                  {customBadge}
                </span>
              )}
              <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                {customTitle || activeSection?.label}
              </span>
            </div>
          )}
        </div>

        {/* المنتصف: الشعار بحجم صغير ونظيف */}
        <div className="hidden sm:flex items-center justify-center shrink-0">
          <div 
            onClick={onBack}
            className="cursor-pointer transition-transform hover:scale-105 flex items-center justify-center h-8 max-w-[130px]"
            title="الرجوع"
          >
            <img 
              src={currentLogo} 
              alt={currentTitle} 
              className="h-7 w-auto max-h-7 object-contain"
            />
          </div>
        </div>

        {/* الجهة اليسرى: أزرار مخصصة (مثل زر الطباعة) ومؤشر الاتصال بالسحابة */}
        <div className="flex items-center gap-2 shrink-0">
          {leftActions}
          <NetworkStatusIndicator className="text-[11px] px-2.5 py-1" />
        </div>
      </div>
    </header>
  );
}
