import React, { useState, useEffect } from 'react';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function DebtPaymentModal({
  isOpen,
  onClose,
  supplier,
  onSubmitPayment,
  submitting = false,
}) {
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [paymentSource, setPaymentSource] = useState('cash_drawer'); // 'cash_drawer' | 'management'
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    if (supplier) {
      setPaymentAmount(supplier.remainingDebt ? String(supplier.remainingDebt) : '');
      setPaymentMethod('نقدي');
      setPaymentSource('cash_drawer');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setPaymentNotes('');
    }
  }, [supplier, isOpen]);

  if (!isOpen || !supplier) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return;
    onSubmitPayment({
      supplierName: supplier.supplierName,
      amount,
      paymentMethod,
      paymentSource,
      date: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString(),
      notes: paymentNotes,
    });
  };

  const remainingAfter = Math.max(
    0,
    (Number(supplier.remainingDebt) || 0) - (Number(paymentAmount) || 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header - رسمي ومختصر */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-black">تسديد دفعة للمورد</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto max-h-[80vh] text-xs">
          {/* Supplier Info Banner */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">المورد:</span>
              <span className="text-xs font-black text-slate-900">{supplier.supplierName}</span>
              {supplier.supplierPhone && (
                <span className="text-[11px] text-slate-500 font-mono block mt-0.5" dir="ltr">
                  {supplier.supplierPhone}
                </span>
              )}
            </div>

            <div className="text-left">
              <span className="text-[10px] text-slate-500 font-bold block">الدين المتبقي:</span>
              <span className="text-sm font-black font-mono text-rose-700">
                {formatIQD(supplier.remainingDebt)} د.ع
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              المبلغ المسدد (د.ع) *
            </label>
            <div className="relative">
              <input
                type="number"
                required
                min="1"
                max={supplier.remainingDebt || undefined}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="أدخل المبلغ..."
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
              />
              <span className="absolute left-3 top-2 text-[11px] text-slate-400 font-bold">د.ع</span>
            </div>

            {/* Quick buttons */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setPaymentAmount(String(supplier.remainingDebt))}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
              >
                كامل المبلغ ({formatIQD(supplier.remainingDebt)})
              </button>
              {Number(supplier.remainingDebt) > 100000 && (
                <button
                  type="button"
                  onClick={() =>
                    setPaymentAmount(String(Math.round(supplier.remainingDebt / 2)))
                  }
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                >
                  النصف ({formatIQD(Math.round(supplier.remainingDebt / 2))})
                </button>
              )}
            </div>

            {/* Remaining after payment preview */}
            <div className="mt-2 text-xs flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span>المتبقي بعد التسديد:</span>
              <span className={`font-black font-mono ${remainingAfter === 0 ? 'text-slate-900 font-bold' : 'text-rose-700'}`}>
                {formatIQD(remainingAfter)} د.ع {remainingAfter === 0 && '✓ (خالص)'}
              </span>
            </div>
          </div>

          {/* Payment Method & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  const m = e.target.value;
                  setPaymentMethod(m);
                  if (m === 'ماستر كارد') {
                    setPaymentSource('mastercard');
                  } else if (paymentSource === 'mastercard') {
                    setPaymentSource('cash_drawer');
                  }
                }}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="نقدي">نقدي</option>
                <option value="ماستر كارد">ماستر كارد</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مصدر السحب</label>
              <select
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="cash_drawer">القاصة اليومية (خصم من الصندوق)</option>
                <option value="mastercard">بطاقة الماستركارد (خصم من رصيد الماستر)</option>
                <option value="management">حساب الإدارة (خارج الصندوق)</option>
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسديد</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات (اختياري)
            </label>
            <textarea
              rows="2"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="ملاحظات التسديد..."
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || !Number(paymentAmount)}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
            >
              {submitting ? 'جاري التسجيل...' : 'تأكيد التسديد'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
