import React, { useState, useRef, useEffect } from 'react';
import { getDisplayName } from '../utils/userUtils';
import { updateProfile } from 'firebase/auth';
import { useUI } from '../contexts/UIContext';

export default function UserAccountCard({ user, onLogout, onNavigate, trashCount = 0, canAccessTab }) {
  const [isOpen, setIsOpen] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  const cardRef = useRef(null);
  const { toast, confirm } = useUI();

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const displayName = getDisplayName(user) || 'مستخدم النظام';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  const handleChangeName = async () => {
    if (!user) return;
    const currentName = getDisplayName(user);
    const newName = window.prompt('أدخل اسم المستخدم / البائع الجديد:', currentName);
    
    if (newName && newName.trim() !== '' && newName !== currentName) {
      try {
        setUpdatingName(true);
        await updateProfile(user, { displayName: newName.trim() });
        toast('تم تحديث الاسم بنجاح!', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast('حدث خطأ أثناء تحديث الاسم: ' + err.message, 'error');
      } finally {
        setUpdatingName(false);
      }
    }
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    confirm('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج من النظام؟', onLogout);
  };

  return (
    <div ref={cardRef} className="fixed bottom-4 left-4 z-40 select-none flex items-center gap-2">
      {/* القائمة المنبثقة للأعلى */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-3.5 animate-slide-up text-right">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold flex items-center justify-center text-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 truncate" title={user?.email || ''}>
                {user?.email || 'لا يوجد بريد مسجل'}
              </p>
            </div>
          </div>

          <div className="py-2 space-y-1">
            <button
              onClick={handleChangeName}
              disabled={updatingName}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-xl transition-colors cursor-pointer"
            >
              <span>تعديل الاسم المعروض</span>
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            {onNavigate && (
              <>
                {(!canAccessTab || canAccessTab('settings')) && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onNavigate('settings');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>الإعدادات والنسخ</span>
                    </span>
                    <span className="text-[10px] text-slate-400">⚙️</span>
                  </button>
                )}

                {(!canAccessTab || canAccessTab('trash')) && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onNavigate('trash');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>سلة المحذوفات</span>
                    </span>
                    {trashCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                        {trashCount}
                      </span>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={handleLogoutClick}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      )}

      {/* الزر الرئيسي المصغر للبطاقة (الاسم والصورة) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg hover:border-indigo-200 transition-all duration-200 cursor-pointer active:scale-95 group"
        title="حساب المستخدم"
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0 group-hover:scale-105 transition-transform">
          {initial}
        </div>
        <div className="text-right pr-0.5">
          <span className="text-xs font-bold text-slate-800 block truncate max-w-[110px]">
            {displayName}
          </span>
        </div>
        <svg 
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* علامة سلة المحذوفات جنب الاسم */}
      {(!canAccessTab || canAccessTab('trash')) && (
        <button
          type="button"
          onClick={() => onNavigate && onNavigate('trash')}
          className="relative w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg hover:border-red-300 hover:text-red-600 text-slate-700 transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center group"
          title="سلة المحذوفات"
        >
          <svg 
            className="w-5 h-5 group-hover:scale-110 transition-transform" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {trashCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse shadow-xs">
              {trashCount}
            </span>
          )}
        </button>
      )}

      {/* علامة الإعدادات جنب الاسم */}
      {(!canAccessTab || canAccessTab('settings')) && (
        <button
          type="button"
          onClick={() => onNavigate && onNavigate('settings')}
          className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg hover:border-indigo-300 hover:text-indigo-600 text-slate-700 transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center group"
          title="الإعدادات والنسخ"
        >
          <svg 
            className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  );
}
