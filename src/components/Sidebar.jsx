import React, { useState } from 'react';
import logo from '../assets/logo.png';
import { exportAllData } from '../utils/backup';
import { useUI } from '../contexts/UIContext';
import { getDisplayName } from '../utils/userUtils';
import { updateProfile } from 'firebase/auth';
import { useSettings } from '../hooks/useSettings';
import { auth } from '../firebase/auth';
import TrashBinModal from './TrashBinModal';
import { useTrashBin } from '../hooks/useTrashBin';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, onCloseMobile }) {
  const { toast, confirm } = useUI();
  const { settings } = useSettings();
  const { count: trashCount } = useTrashBin();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);

  const handleChangeName = async () => {
    if (!user) return;
    const currentName = getDisplayName(user);
    const newName = window.prompt('أدخل اسم البائع الجديد:', currentName);
    
    if (newName && newName.trim() !== '' && newName !== currentName) {
      try {
        setUpdatingName(true);
        await updateProfile(user, { displayName: newName.trim() });
        toast('تم تحديث الاسم بنجاح!', 'success');
        // Refresh to propagate the new name everywhere
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast('حدث خطأ أثناء تحديث الاسم: ' + err.message, 'error');
      } finally {
        setUpdatingName(false);
      }
    }
  };

  const tabs = [
    { id: 'home', label: 'لوحة القيادة', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'pos', label: 'نقطة البيع', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'custody', label: 'عهد الفنيين والسيارات', icon: 'M8 17a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM4 5h11v9H4V5zm11 3h3.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V14h-7V8z' },
    { id: 'purchases', label: 'المشتريات والديون', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
    { id: 'expenses', label: 'المصاريف', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'salaries', label: 'رواتب الموظفين', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'offers', label: 'عروض الأسعار', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'inventory', label: 'المخزون', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'reports', label: 'الفواتير والتقارير', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'customers', label: 'دليل العملاء', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'settings', label: 'الإعدادات', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async (format) => {
    try {
      setBackingUp(format);
      await exportAllData(format);
      toast('تم تحميل النسخة الاحتياطية بنجاح!', 'success');
    } catch (err) {
      toast('حدث خطأ أثناء تحميل النسخة الاحتياطية.', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleLogout = () => {
    confirm('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج من النظام؟', onLogout);
  };

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col h-screen shrink-0 transition-all duration-300 shadow-2xl z-20 relative`}>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -left-3 top-8 bg-indigo-600 text-white p-1 rounded-full shadow-lg z-30 hover:bg-indigo-500 transition-colors"
      >
        <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
      </button>

      <div className={`p-4 md:p-6 border-b border-slate-800 flex items-center justify-between transition-all ${isCollapsed ? 'px-3' : ''}`}>
        <div className={`bg-white p-2 rounded-xl shadow-sm flex items-center justify-center overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-10 h-10' : 'w-full h-20 md:h-24'}`}>
          <img 
            src={settings?.logoUrl || logo} 
            alt={settings?.storeName || "Safe Zone"} 
            className="max-h-full max-w-full object-contain" 
          />
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-2 text-slate-400 hover:text-white mr-2 bg-slate-800 rounded-xl"
            title="إغلاق القائمة"
          >
            ✕
          </button>
        )}
      </div>

      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto overflow-x-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={isCollapsed ? tab.label : ''}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3.5 rounded-xl transition-all duration-200 text-sm font-bold ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <svg className="w-5 h-5 opacity-90 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path>
            </svg>
            {!isCollapsed && <span className="whitespace-nowrap animate-fade-in">{tab.label}</span>}
          </button>
        ))}

        {/* زر سلة المحذوفات المركزية */}
        <button
          onClick={() => setShowTrashModal(true)}
          title={isCollapsed ? `سلة المحذوفات (${trashCount})` : ''}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white group border border-slate-800/80 bg-slate-800/20`}
        >
          <div className="flex items-center gap-3">
            <span className="text-base">🗑️</span>
            {!isCollapsed && <span className="whitespace-nowrap animate-fade-in">سلة المحذوفات</span>}
          </div>
          {!isCollapsed && trashCount > 0 && (
            <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs animate-pulse">
              {trashCount}
            </span>
          )}
        </button>
        
        <div className={`pt-4 mt-4 border-t border-slate-800 space-y-2 ${isCollapsed ? 'hidden' : 'block'}`}>
          <a
            href={`${window.location.origin}${window.location.pathname}?portal=customer`}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-bold text-teal-300 hover:bg-teal-900/30 hover:text-teal-100 bg-teal-950/40 border border-teal-800/40"
            title="فتح بوابة العملاء في نافذة جديدة"
          >
            <span className="text-base">🌐</span>
            <span className="whitespace-nowrap">بوابة كشف حساب العملاء</span>
          </a>

          <button
            onClick={() => handleBackup('excel')}
            disabled={backingUp}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium text-indigo-300 hover:bg-indigo-900/30 hover:text-indigo-100 disabled:opacity-50"
          >
            {backingUp === 'excel' ? (
              <svg className="w-5 h-5 animate-spin shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            )}
            <span className="whitespace-nowrap animate-fade-in">{backingUp === 'excel' ? 'جاري التحميل...' : 'نسخة احتياطية (Excel)'}</span>
          </button>
          
          <button
            onClick={() => handleBackup('json')}
            disabled={backingUp}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30 hover:text-emerald-100 disabled:opacity-50"
          >
            {backingUp === 'json' ? (
              <svg className="w-5 h-5 animate-spin shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
            )}
            <span className="whitespace-nowrap animate-fade-in">{backingUp === 'json' ? 'جاري التحميل...' : 'نسخة احتياطية (JSON)'}</span>
          </button>
        </div>
      </nav>

      <div className={`p-4 border-t border-slate-800 transition-all ${isCollapsed ? 'hidden' : 'block'}`}>
        <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col gap-3">
          <div 
            className="flex items-center gap-3 overflow-hidden cursor-pointer hover:bg-slate-800 p-2 -mx-2 rounded-lg transition-colors group"
            onClick={handleChangeName}
            title="انقر لتغيير الاسم"
          >
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 shrink-0 group-hover:bg-brand-600 group-hover:text-white transition-colors">
              {updatingName ? (
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{getDisplayName(user)}</p>
              <p className="text-[10px] text-slate-400 truncate" title={user?.email}>
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-1 py-2 flex items-center justify-center gap-2 text-xs font-medium text-red-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            تسجيل الخروج
          </button>
        </div>
      </div>
      
      {/* Logout button for collapsed state */}
      {isCollapsed && (
        <div className="p-4 border-t border-slate-800 flex justify-center">
          <button
            onClick={handleLogout}
            title="تسجيل الخروج"
            className="w-10 h-10 flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      )}

      {/* نافذة سلة المحذوفات الشاملة */}
      <TrashBinModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        currentUser={user}
      />
    </aside>
  );
}
