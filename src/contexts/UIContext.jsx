import React, { createContext, useContext, useState, useCallback } from 'react';
import { generateFullBackupBundle, downloadBackupZip, uploadBackupToGoogleDrive } from '../services/googleDriveService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const UIContext = createContext(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};

export const UIProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // Background Backup Task State
  const [backupTask, setBackupTask] = useState({
    isRunning: false,
    step: '',
    message: '',
    percent: 0,
    type: 'drive', // 'drive' | 'local'
    error: null
  });

  // Add a toast message
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto remove after 3.5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Show a confirmation modal (supports both async/await and callback patterns)
  const confirm = useCallback((arg1, arg2, arg3) => {
    return new Promise((resolve) => {
      let title = 'تأكيد الإجراء';
      let message = '';
      let callback = null;

      if (typeof arg1 === 'string' && typeof arg2 === 'function') {
        message = arg1;
        callback = arg2;
      } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        title = arg1;
        message = arg2;
        callback = typeof arg3 === 'function' ? arg3 : null;
      } else if (typeof arg1 === 'string') {
        message = arg1;
      }

      setConfirmState({
        isOpen: true,
        title,
        message,
        onConfirm: async () => {
          try {
            if (callback) await callback();
            resolve(true);
          } catch (err) {
            resolve(false);
          }
        },
        onCancel: () => {
          resolve(false);
        }
      });
    });
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirmState.onCancel) confirmState.onCancel();
    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
  }, [confirmState]);

  const handleConfirm = useCallback(async () => {
    const fn = confirmState.onConfirm;
    setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
    if (fn) await fn();
  }, [confirmState]);

  // Non-blocking background backup runner
  const startBackgroundBackup = useCallback(async (type = 'drive') => {
    if (backupTask.isRunning) {
      toast('هناك عملية نسخ احتياطي قيد التشغيل حالياً في الخلفية...', 'warn');
      return;
    }

    setBackupTask({
      isRunning: true,
      step: 'start',
      message: 'جاري بدء النسخ في الخلفية...',
      percent: 5,
      type,
      error: null
    });

    try {
      if (type === 'local') {
        const bundle = await generateFullBackupBundle((progress) => {
          setBackupTask(prev => ({
            ...prev,
            step: progress.step,
            message: progress.message,
            percent: progress.percent
          }));
        });
        downloadBackupZip(bundle.zipBlob, bundle.filename);
        toast('تم تجهيز وتحميل حزمة النسخة الاحتياطية بنجاح! 📦🎉', 'success');
      } else {
        // Cloud Drive Backup
        const bundle = await generateFullBackupBundle((progress) => {
          setBackupTask(prev => ({
            ...prev,
            step: progress.step,
            message: progress.message,
            percent: Math.round(progress.percent * 0.7)
          }));
        });

        setBackupTask(prev => ({
          ...prev,
          step: 'upload',
          message: 'جاري الرفع إلى Google Drive...',
          percent: 80
        }));

        await uploadBackupToGoogleDrive(bundle, (progress) => {
          setBackupTask(prev => ({
            ...prev,
            step: progress.step,
            message: progress.message,
            percent: progress.percent
          }));
        });

        toast('تم اكتمال النسخ الاحتياطي على Google Drive بنجاح في الخلفية! ☁️🚀', 'success');
      }

      setBackupTask({
        isRunning: false,
        step: 'done',
        message: 'اكتملت العملية',
        percent: 100,
        type,
        error: null
      });
    } catch (err) {
      console.error('Background Backup Error:', err);
      toast(`فشل النسخ الاحتياطي: ${err.message}`, 'error');
      setBackupTask({
        isRunning: false,
        step: 'error',
        message: 'فشلت العملية',
        percent: 0,
        type,
        error: err.message
      });
    }
  }, [backupTask.isRunning, toast]);

  // Automated Daily Scheduled Backup Runner
  React.useEffect(() => {
    let isChecking = false;

    const checkDailyAutoBackup = async () => {
      if (isChecking || backupTask.isRunning) return;

      try {
        isChecking = true;
        const docSnap = await getDoc(doc(db, 'settings', 'google_drive_config'));
        if (!docSnap.exists()) return;

        const config = docSnap.data();
        if (!config.autoDailyBackup) return;

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const targetHour = Number(config.backupHour ?? 23);
        const targetMinute = Number(config.backupMinute ?? 0);

        // Has today's automated backup already run?
        if (config.lastAutoBackupDate === todayStr) {
          return;
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = targetHour * 60 + targetMinute;

        // If time reached or passed
        if (currentMinutes >= targetMinutes) {
          const savedToken = sessionStorage.getItem('gdrive_access_token') || localStorage.getItem('gdrive_access_token');
          if (savedToken || config.serviceAccountJson) {
            console.log('[Auto-Backup] Executing scheduled daily backup at:', now.toLocaleTimeString('ar-IQ'));
            toast('⏰ حان موعد النسخ السحابي اليومي المجدول! جاري الرفع في الخلفية...', 'info');

            await setDoc(doc(db, 'settings', 'google_drive_config'), {
              lastAutoBackupDate: todayStr,
              lastAutoBackupAt: new Date().toISOString()
            }, { merge: true });

            startBackgroundBackup('drive');
          }
        }
      } catch (err) {
        console.warn('[Auto-Backup Scheduler Error]:', err);
      } finally {
        isChecking = false;
      }
    };

    // Initial check on load
    checkDailyAutoBackup();

    // Check periodically every 60 seconds
    const timer = setInterval(checkDailyAutoBackup, 60000);
    return () => clearInterval(timer);
  }, [backupTask.isRunning, startBackgroundBackup, toast]);

  return (
    <UIContext.Provider value={{ toast, confirm, backupTask, startBackgroundBackup }}>
      {children}

      {/* Floating Background Backup Widget (Non-blocking) */}
      {backupTask.isRunning && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
          <div className="bg-slate-900/95 backdrop-blur-md text-white border border-slate-700 shadow-2xl rounded-2xl p-4 w-80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <span className="text-xs font-black text-amber-400">
                  {backupTask.type === 'drive' ? 'نسخ سحابي (Google Drive)' : 'تجهيز حزمة ZIP'}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-slate-300">{backupTask.percent}%</span>
            </div>

            <p className="text-[11px] text-slate-300 mb-2 truncate" title={backupTask.message}>
              {backupTask.message}
            </p>

            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${backupTask.percent}%` }}
              ></div>
            </div>

            <div className="mt-2 text-[9px] text-slate-400 text-left">
              يعمل في الخلفية — يمكنك استخدام الموقع بحرية ✨
            </div>
          </div>
        </div>
      )}

      {/* Toasts Container */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-slide-up ${
              t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
              t.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {t.type === 'error' ? (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            ) : t.type === 'warn' ? (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            ) : (
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            )}
            <p className="text-sm font-bold">{t.message}</p>
            <button onClick={() => removeToast(t.id)} className="ml-2 text-current opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <h3 className="text-lg font-bold text-center text-slate-900 mb-2">{confirmState.title}</h3>
              <p className="text-sm text-center text-slate-500 mb-6">{confirmState.message}</p>
              <div className="flex items-center gap-3">
                <button onClick={closeConfirm} className="flex-1 btn btn-secondary">
                  إلغاء
                </button>
                <button onClick={handleConfirm} className="flex-1 btn btn-danger">
                  تأكيد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
};
