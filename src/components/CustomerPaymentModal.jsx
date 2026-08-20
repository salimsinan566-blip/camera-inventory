import React, { useState } from 'react';
import { recordCustomerDebtPayment, deleteCustomerDebtPayment, resetCustomerDebtPayments } from '../services/salesService';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../hooks/useAuth';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function CustomerPaymentModal({ sale, onClose, onSuccess }) {
  const { toast, confirm } = useUI();
  const { user } = useAuth();

  const total = Number(sale?.total) || 0;
  const currentPaid = Number(sale?.paidAmount) || 0;
  const remainingDebt = sale?.remainingDebt !== undefined ? Number(sale.remainingDebt) : Math.max(0, total - currentPaid);

  const [paymentAmount, setPaymentAmount] = useState(remainingDebt > 0 ? remainingDebt : '');
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmt = Number(paymentAmount);

    if (!numAmt || numAmt <= 0) {
      toast('يرجى إدخال مبلغ تسديد أكبر من الصفر', 'warn');
      return;
    }

    if (numAmt > remainingDebt) {
      toast(`المبلغ المدخل (${formatIQD(numAmt)} د.ع) أكبر من الدين المتبقي (${formatIQD(remainingDebt)} د.ع)`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordCustomerDebtPayment(sale.id, numAmt, {
        paymentMethod,
        notes: paymentNotes,
        date: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
        receivedBy: user?.email || 'المسؤول'
      });
      toast(`تم تسجيل تسديد دفعة بمبلغ ${formatIQD(numAmt)} د.ع بنجاح ✓`, 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePayment = (payment) => {
    confirm(
      'حذف دفعة التسديد',
      `هل أنت متأكد من حذف دفعة ${formatIQD(payment.amount)} د.ع المسددة بتاريخ (${payment.date ? new Date(payment.date).toLocaleDateString('ar-IQ') : '—'})؟ سيتم خصمها من المدفوع وإعادة احتساب الدين المتبقي.`,
      async () => {
        setActionLoading(true);
        try {
          await deleteCustomerDebtPayment(sale.id, payment.id);
          toast(`تم حذف الدفعة بمبلغ ${formatIQD(payment.amount)} د.ع بنجاح`, 'success');
          if (onSuccess) onSuccess();
          onClose();
        } catch (err) {
          toast(`فشل حذف الدفعة: ${err.message}`, 'error');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleResetAllPayments = () => {
    confirm(
      'تصفير كافة الدفعات المسددة',
      `هل أنت متأكد من إلغاء وتصفير كافة دفعات الفاتورة رقم #${sale.invoiceNumber} بالكامل؟ سيتم إرجاع الفاتورة كأن العميل لم يدفع أي مبلغ (0 د.ع) والدين المتبقي سيعود كاملاً إلى ${formatIQD(total)} د.ع.`,
      async () => {
        setActionLoading(true);
        try {
          await resetCustomerDebtPayments(sale.id);
          toast('تم تصفير كافة دفعات الفاتورة وإرجاعها كغير مدفوعة (0 د.ع) بنجاح ✓', 'success');
          if (onSuccess) onSuccess();
          onClose();
        } catch (err) {
          toast(`فشل التصفير: ${err.message}`, 'error');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const payments = Array.isArray(sale?.payments) ? sale.payments : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 bg-linear-to-r from-indigo-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💵</span>
            <div>
              <h3 className="font-bold text-base">تسديد دين فاتورة عميل</h3>
              <p className="text-xs text-indigo-200">فاتورة رقم #{sale?.invoiceNumber} • {sale?.customerName || 'عميل نقدي'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          {/* Summary Banner */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
            <div>
              <span className="text-[11px] text-slate-500 block">إجمالي الفاتورة</span>
              <span className="text-xs font-bold text-slate-800 font-mono">{formatIQD(total)} د.ع</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">المدفوع سابقاً</span>
              <span className="text-xs font-bold text-emerald-700 font-mono">{formatIQD(currentPaid)} د.ع</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">الدين المتبقي</span>
              <span className="text-xs font-black text-rose-700 font-mono">{formatIQD(remainingDebt)} د.ع</span>
            </div>
          </div>

          {remainingDebt <= 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-center font-bold text-sm">
              ✓ تم تسديد كامل قيمة هذه الفاتورة بالكامل!
            </div>
          ) : (
            <>
              {/* Payment Amount Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">المبلغ المسدد (د.ع) *</label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(remainingDebt)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    تسديد كامل المبلغ ({formatIQD(remainingDebt)})
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={remainingDebt}
                  step="any"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="أدخل المبلغ المسدد..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                />
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="نقدي">نقدي (كاش) 💵</option>
                    <option value="زين كاش">زين كاش 📱</option>
                    <option value="ماستر كارد / مصرفي">ماستر كارد / مصرفي 💳</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الدفعة</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الدفعة (اختياري)</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="مثال: تحويل مع المندوب، وصل استلام رقم..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || actionLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد تسجيل الدفعة'}</span>
                  <span>✓</span>
                </button>
              </div>
            </>
          )}

          {/* Previous Payments History & Reset Options */}
          {payments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>📋</span>
                  <span>سجل الدفعات السابقة ({payments.length}):</span>
                </h4>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleResetAllPayments}
                  className="text-[11px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="إلغاء وتصفير كل الدفعات السابقة وإرجاع الفاتورة كأن العميل لم يدفع شيئاً"
                >
                  <span>🔄</span>
                  <span>تصفير الدفعات (لم يدفع شيئاً)</span>
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs bg-slate-50/30">
                {payments.map((p, idx) => (
                  <div key={p.id || idx} className="p-2.5 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 font-mono text-xs">{formatIQD(p.amount)} د.ع</span>
                        <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 text-[10px] font-bold px-1.5 py-0.2 rounded">
                          {p.paymentMethod || 'نقدي'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span>بتاريخ: {p.date ? new Date(p.date).toLocaleDateString('ar-IQ') : '—'}</span>
                        {p.receivedBy && <span>• المستلم: {p.receivedBy}</span>}
                      </div>
                      {p.notes && <p className="text-[10px] text-slate-500 mt-0.5 italic truncate">{p.notes}</p>}
                    </div>

                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleDeletePayment(p)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0 border border-transparent hover:border-rose-200"
                      title="حذف هذه الدفعة وإرجاع قيمتها للدين المتبقي"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
