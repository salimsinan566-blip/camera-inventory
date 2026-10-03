import React, { useState, useRef, useEffect } from 'react';
import { getDisplayName } from '../utils/userUtils';
import { updateProfile } from 'firebase/auth';
import { useUI } from '../contexts/UIContext';

export default function UserAccountCard({ user, onLogout }) {
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
    <div ref={cardRef} className="fixed bottom-4 left-4 z-40 select-none">
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

      {/* الزر الرئيسي المصغر للبطاقة */}
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
    </div>
  );
}
