import React, { useState } from 'react';
import { addCustomer, updateCustomer } from '../services/customersService';
import { useUI } from '../contexts/UIContext';
import { useSettings } from '../hooks/useSettings';
import AppleSchedulePicker from './AppleSchedulePicker';
import { renderWhatsAppTemplate, DEFAULT_WHATSAPP_TEMPLATES } from '../services/whatsappService';

export default function AddCustomerModal({ customer = null, onClose, onSaved }) {
  const { settings } = useSettings();
  const isEditing = Boolean(customer?.id);
  const [name, setName] = useState(customer?.name || '');
  const [phone1, setPhone1] = useState(customer?.phone1 || '');
  const [phone2, setPhone2] = useState(customer?.phone2 || '');
  const [pinCode, setPinCode] = useState(customer?.pinCode || '');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [customerType, setCustomerType] = useState(customer?.customerType || 'client'); // 'client' | 'customer'
  const [reminderSchedule, setReminderSchedule] = useState(customer?.reminderSchedule || 'default');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useUI();

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast('يرجى إدخال اسم العميل', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let savedCustId = customer?.id;
      if (isEditing) {
        await updateCustomer(customer.id, {
          name: trimmedName,
          phone1: phone1.trim(),
          phone2: phone2.trim(),
          pinCode: pinCode.trim(),
          notes: notes.trim(),
          customerType,
          reminderSchedule,
        });
        toast('تم تحديث بيانات العميل وتفعيل الموعد بنجاح 💾', 'success');
      } else {
        savedCustId = await addCustomer({
          name: trimmedName,
          phone1: phone1.trim(),
          phone2: phone2.trim(),
          pinCode: pinCode.trim(),
          notes: notes.trim(),
          customerType,
          reminderSchedule,
        });
        toast('تمت إضافة العميل وتفعيل الموعد بنجاح 💾', 'success');
      }

      // Sync immediately with background server scheduler queue
      if (phone1.trim() && reminderSchedule !== 'disabled') {
        try {
          const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&name=${encodeURIComponent(trimmedName)}`;
          const template = settings?.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder;
          const totalDebt = customer?.totalDebt || 0;
          const msg = renderWhatsAppTemplate(template, {
            customerName: trimmedName,
            storeName: settings?.storeName || 'المحل',
            totalDebt: Number(totalDebt).toLocaleString('en-US'),
            unpaidInvoicesCount: customer?.unpaidInvoicesCount || 1,
            statementLink: portalUrl
          });

          await fetch('http://localhost:3005/reminders/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customers: [{
                id: savedCustId || 'cust_temp',
                name: trimmedName,
                phone1: phone1.trim(),
                reminderSchedule,
                totalDebt: totalDebt || 1,
                renderedMessage: msg
              }],
              settings
            })
          });
        } catch (syncErr) {
          console.warn('Background sync error:', syncErr);
        }
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      toast(`خطأ أثناء الحفظ: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {isEditing ? `تعديل بيانات: ${customer.name}` : 'إضافة عميل / زبون جديد'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEditing ? 'تعديل التصنيف، أرقام الهواتف، ومواعيد تذكير الواتساب' : 'تسجيل عميل جديد وتحديد صنف المعاملة وجدولة الرسائل'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          
          {/* تصنيف العميل: عميل مقابل زبون */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              صنف المعاملة / نوع الحساب *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label 
                className={`flex flex-col p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  customerType === 'client' 
                    ? 'border-brand-600 bg-brand-50/50 shadow-sm ring-2 ring-brand-600/10' 
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    🏢 عميل (Client)
                  </span>
                  <input 
                    type="radio" 
                    name="customerType" 
                    value="client" 
                    checked={customerType === 'client'} 
                    onChange={() => setCustomerType('client')} 
                    className="accent-brand-600 w-4 h-4"
                  />
                </div>
                <span className="text-[11px] text-slate-500 leading-tight">
                  حساب دائم، فواتير دورية، ديون، وتذكير منتظم عبر الواتساب.
                </span>
              </label>

              <label 
                className={`flex flex-col p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                  customerType === 'customer' 
                    ? 'border-emerald-600 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-600/10' 
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    🛍️ زبون (Customer)
                  </span>
                  <input 
                    type="radio" 
                    name="customerType" 
                    value="customer" 
                    checked={customerType === 'customer'} 
                    onChange={() => setCustomerType('customer')} 
                    className="accent-emerald-600 w-4 h-4"
                  />
                </div>
                <span className="text-[11px] text-slate-500 leading-tight">
                  مشتري عابر أو مفرد، إرسال الفاتورة فقط عند الشراء.
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الاسم الكامل *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all"
              placeholder="مثال: شركة النور / علي الحسيني"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رقم الواتساب الأساسي (WhatsApp) *
              </label>
              <input
                type="tel"
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all text-left"
                placeholder="0770..."
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رقم هاتف إضافي (اختياري)
              </label>
              <input
                type="tel"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all text-left"
                placeholder="0780..."
                dir="ltr"
              />
            </div>
          </div>

          {/* جدول تذكير الديون عبر الواتساب بتصميم آبل المرن */}
          <div className="p-4 bg-slate-50/70 rounded-3xl border border-slate-200/90 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>📱 جدول تذكير الديون عبر الواتساب:</span>
              </label>
              <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-2xs">
                تخصيص مرن ⚙️
              </span>
            </div>

            <AppleSchedulePicker
              value={reminderSchedule}
              onChange={setReminderSchedule}
              defaultStoreDay={settings?.whatsappDefaultDay || 'thursday'}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                رمز المرور لبوابة العملاء (PIN)
              </label>
              <span className="text-[10px] text-slate-500">
                (تلقائياً آخر 4 أرقام من الهاتف)
              </span>
            </div>
            <input
              type="text"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all text-left"
              placeholder={phone1 && phone1.length >= 4 ? `تلقائي: ${phone1.slice(-4)}` : 'رمز مخصص (مثال: 1234)...'}
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ملاحظات أو عنوان العميل
            </label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-all resize-none"
              placeholder="العنوان، النشاط التجاري، أو أي ملاحظات أخرى..."
            />
          </div>

          {/* Sticky Footer Actions */}
          <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm -mx-6 -mb-6 p-4 border-t border-slate-200 flex items-center justify-end gap-3 z-10 shadow-lg">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-sm transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>جارٍ الحفظ...</span>
                </>
              ) : (
                <span>{isEditing ? 'حفظ التعديلات وتفعيل الجدولة 💾' : 'إضافة وتفعيل 💾'}</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
