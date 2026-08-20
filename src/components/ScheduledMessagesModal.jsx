import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../hooks/useSettings';
import { useCustomers } from '../hooks/useCustomers';
import { useSales } from '../hooks/useSales';
import { useIncomes } from '../hooks/useIncomes';
import { calculateNextCustomerReminderTimestamp } from '../services/debtReminderScheduler';
import { sendWhatsAppMessageViaGateway, renderWhatsAppTemplate, DEFAULT_WHATSAPP_TEMPLATES } from '../services/whatsappService';
import { updateCustomer } from '../services/customersService';

export default function ScheduledMessagesModal({ isOpen, onClose }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const { toast } = useUI();
  const { settings } = useSettings();
  const { customers = [] } = useCustomers();
  const { sales = [] } = useSales();
  const { incomes = [] } = useIncomes();
  const [, setTick] = useState(0);

  const defaultBase = 'https://commander-air-olympus-commission.trycloudflare.com';
  const apiUrl = settings?.whatsappApiUrl || `${defaultBase}/messages/chat`;
  let baseUrl = defaultBase;
  if (apiUrl.startsWith('http') && !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
    baseUrl = apiUrl.replace(/\/messages\/(chat|document).*/, '');
  }

  // Live timer tick every second for smooth countdown
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Fetch server scheduled queue
  async function fetchQueue() {
    try {
      const res = await fetch(`${baseUrl}/scheduled`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.warn('Failed to fetch scheduled queue:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [isOpen, baseUrl]);

  // Calculate upcoming customer debt reminders from settings & customer profiles
  const upcomingDebtorReminders = useMemo(() => {
    if (settings?.whatsappAutoReminders === false) return [];

    const debtMap = {};
    sales.forEach((sale) => {
      const name = (sale.customerName || '').trim().toLowerCase();
      if (!name) return;
      if (!debtMap[name]) debtMap[name] = { totalDebt: 0, unpaidInvoicesCount: 0 };
      if (sale.invoiceType === 'debt') {
        const total = Number(sale.total || 0);
        const paid = Number(sale.paidAmount || 0);
        const remaining = sale.remainingDebt !== undefined 
          ? Math.min(Number(sale.remainingDebt), Math.max(0, total - paid)) 
          : Math.max(0, total - paid);
        debtMap[name].totalDebt += remaining;
        if (remaining > 0 && !sale.isSettled) debtMap[name].unpaidInvoicesCount += 1;
      }
    });

    incomes.forEach((inc) => {
      const name = (inc.customerName || inc.payerName || '').trim().toLowerCase();
      if (!name) return;
      if (!debtMap[name]) debtMap[name] = { totalDebt: 0, unpaidInvoicesCount: 0 };
      debtMap[name].totalDebt = Math.max(0, debtMap[name].totalDebt - Number(inc.amount || 0));
    });

    const now = new Date();
    const reminders = [];

    customers.forEach((cust) => {
      const schedule = cust?.reminderSchedule || 'disabled';
      if (!cust?.phone1?.trim() || schedule === 'disabled') return;
      const key = (cust.name || '').trim().toLowerCase();
      const fin = debtMap[key] || { totalDebt: 0, unpaidInvoicesCount: 0 };
      if (fin.totalDebt <= 0) return;

      const targetTimestamp = calculateNextCustomerReminderTimestamp(cust, settings, now);
      if (!targetTimestamp) return;

      let cleanPhone = String(cust.phone1).replace(/[^\d]/g, '').trim();
      if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
        cleanPhone = '964' + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
        cleanPhone = '964' + cleanPhone;
      }

      reminders.push({
        id: `debt_sched_${cust.id}`,
        type: 'chat',
        isDebtReminder: true,
        customerId: cust.id,
        customerName: cust.name,
        cleanPhone,
        totalDebt: fin.totalDebt,
        unpaidInvoicesCount: fin.unpaidInvoicesCount || 1,
        targetTimestamp,
        scheduledAt: new Date(targetTimestamp).toISOString(),
        status: 'pending',
        customer: cust,
      });
    });

    return reminders;
  }, [customers, sales, incomes, settings]);

  // Combined pending list sorted by time
  const allPending = useMemo(() => {
    const serverPending = jobs.filter(j => j.status === 'pending');
    const combined = [...serverPending, ...upcomingDebtorReminders];
    return combined.sort((a, b) => (a.targetTimestamp || 0) - (b.targetTimestamp || 0));
  }, [jobs, upcomingDebtorReminders]);

  const completedJobs = useMemo(() => {
    return jobs.filter(j => j.status !== 'pending');
  }, [jobs]);

  // Immediate send
  async function handleSendNow(job) {
    const jobId = job.id;
    setActionLoadingId(jobId);
    try {
      if (job.isDebtReminder) {
        const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&name=${encodeURIComponent(job.customerName)}`;
        const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;
        const message = renderWhatsAppTemplate(template, {
          customerName: job.customerName,
          storeName: settings?.storeName || 'المحل',
          totalDebt: Number(job.totalDebt).toLocaleString('en-US'),
          unpaidInvoicesCount: job.unpaidInvoicesCount || 1,
          statementLink: portalUrl
        });

        await sendWhatsAppMessageViaGateway({
          phone: job.cleanPhone,
          message,
          settings
        });

        await updateCustomer(job.customerId, {
          lastDebtReminderSent: new Date().toISOString()
        });

        toast(`تم إرسال تذكير الديون لـ «${job.customerName}» فوراً بنجاح! 🚀`, 'success');
      } else {
        const res = await fetch(`${baseUrl}/scheduled/${jobId}/send-now`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast('تم إرسال الرسالة للعميل فوراً بنجاح! 🚀', 'success');
        fetchQueue();
      }
    } catch (err) {
      toast(`فشل الإرسال الفوري: ${err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  }

  // Cancel job
  async function handleCancel(job) {
    if (job.isDebtReminder) {
      if (job.customerId) {
        try {
          await updateCustomer(job.customerId, { reminderSchedule: 'disabled' });
          toast(`تم إيقاف تذكير «${job.customerName}» وإزالته من الطابور بنجاح 🔕`, 'info');
        } catch (e) {
          toast(`فشل الإلغاء: ${e.message}`, 'error');
        }
      }
      return;
    }
    try {
      await fetch(`${baseUrl}/scheduled/${job.id}`, {
        method: 'DELETE'
      });
      toast('تم إلغاء الموعد المجدول بنجاح', 'info');
      fetchQueue();
    } catch (err) {
      toast(`فشل الإلغاء: ${err.message}`, 'error');
    }
  }

  // Clear all pending jobs from server and disable all pending debtor reminders
  async function handleClearAllQueue() {
    try {
      const serverJobs = jobs.filter(j => j.status === 'pending');
      for (const j of serverJobs) {
        await fetch(`${baseUrl}/scheduled/${j.id}`, { method: 'DELETE' }).catch(() => {});
      }
      const debtorPromises = upcomingDebtorReminders.map(d => {
        if (d.customerId) {
          return updateCustomer(d.customerId, { reminderSchedule: 'disabled' });
        }
        return Promise.resolve();
      });
      await Promise.all(debtorPromises);
      toast('تم إفراغ وإلغاء جميع المواعيد من الطابور بالكامل بنجاح 🗑️', 'success');
      fetchQueue();
    } catch (err) {
      toast(`فشل إفراغ الطابور: ${err.message}`, 'error');
    }
  }

  // Calculate live remaining time text
  function getRemainingText(targetTimestamp) {
    if (!targetTimestamp) return '';
    const diffMs = targetTimestamp - Date.now();
    if (diffMs <= 0) return 'حان الموعد الآن (جاهز للإرسال) ⚡';
    
    const diffSec = Math.floor(diffMs / 1000);
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) {
      return `متبقي: ${days} يوم و ${remainingHours} ساعة ⏳`;
    }
    if (hours > 0) {
      return `متبقي: ${hours} ساعة و ${remainingMins} دقيقة ⏳`;
    }
    if (mins > 0) {
      return `متبقي: ${mins} دقيقة و ${secs < 10 ? '0' + secs : secs} ثانية ⏳`;
    }
    return `متبقي: ${secs} ثانية فقط ⏱️`;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-l from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/10 text-brand-600 flex items-center justify-center text-xl shadow-inner font-bold">
              ⏰
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>طابور الرسائل والتذكيرات المجدولة</span>
                <span className="bg-brand-600 text-white text-[11px] font-mono px-2 py-0.5 rounded-full">
                  {allPending.length} قيد الانتظار
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة حية بالثواني للمواعيد المجدولة وإمكانية إطلاقها فوراً
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allPending.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllQueue}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                title="إلغاء وإفراغ جميع المواعيد المتبقية في الطابور"
              >
                <span>🗑️</span>
                <span>إفراغ الطابور</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {settings?.whatsappAutoReminders === false && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold p-3 rounded-2xl flex items-center gap-2 shadow-2xs">
              <span className="text-base">🔕</span>
              <span>الجدولة الآلية العامة لتذكيرات الواتساب متوقفة حالياً. لن ترسل أي رسائل تلقائية للزبائن.</span>
            </div>
          )}
          {loading && allPending.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              جارٍ قراءة طابور المواعيد...
            </div>
          ) : allPending.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-8 space-y-2">
              <span className="text-3xl block">🏖️</span>
              <span className="text-sm font-bold text-slate-800 block">لا توجد رسائل مجدولة قيد الانتظار حالياً</span>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                عند تحديد وقت لإرسال فاتورة أو تذكير عميل، ستظهر هنا مباشرة مع عداد تنازلي حي بالثواني.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 block">
                📋 الرسائل والتذكيرات المنتظرة ({allPending.length}):
              </span>
              {allPending.map((job) => {
                const isDoc = job.type === 'document';
                const isDebt = job.isDebtReminder;
                return (
                  <div
                    key={job.id}
                    className="p-4 bg-white border-2 border-brand-100 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative overflow-hidden"
                  >
                    {/* Pulsing indicator line */}
                    <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-brand-500 to-amber-500 animate-pulse" />

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{isDebt ? '🔔' : isDoc ? '📄' : '💬'}</span>
                        <span className="text-sm font-black text-slate-900">
                          {job.customerName || (isDoc ? job.filename : 'رسالة تذكير')}
                        </span>
                        {isDebt && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                            تذكير دين ({Number(job.totalDebt || 0).toLocaleString()} د.ع)
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          +{job.cleanPhone}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg font-mono">
                          {getRemainingText(job.targetTimestamp)}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-500">
                          الموعد: {new Date(job.targetTimestamp).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleSendNow(job)}
                        disabled={actionLoadingId === job.id}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="إرسال هذه الرسالة الآن فوراً بدون انتظار انتهاء الوقت"
                      >
                        <span>⚡</span>
                        <span>{actionLoadingId === job.id ? 'جارٍ الإرسال...' : 'إرسال الآن'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCancel(job)}
                        className="px-2.5 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        title={isDebt ? 'إيقاف هذا التذكير وإزالته من الطابور' : 'إلغاء الموعد المجدول'}
                      >
                        <span>{isDebt ? '🔕 إيقاف' : '✕ إلغاء'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed Jobs History */}
          {completedJobs.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <span className="text-xs font-bold text-slate-500 block">
                ✅ تم إرسالها مؤخراً ({completedJobs.length}):
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {completedJobs.map((cj) => (
                  <div key={cj.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>✅</span>
                      <span className="font-bold text-slate-800">{cj.customerName || cj.cleanPhone}</span>
                      <span className="text-slate-400 font-mono">+{cj.cleanPhone}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {cj.sentAt ? new Date(cj.sentAt).toLocaleTimeString('ar-IQ') : 'تم'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-bold text-slate-700">تحديث حي كل ثانية ⚡</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
