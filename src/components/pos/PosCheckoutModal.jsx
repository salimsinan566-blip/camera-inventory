import React, { useState, useEffect } from 'react';

export default function PosCheckoutModal({
  isOpen,
  onClose,
  activeCart,
  onConfirmCheckout,
  processing = false,
}) {
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'mastercard' | 'debt'
  const [error, setError] = useState('');

  // Reset payment method and errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('cash');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Active customer details from the cart
  const customerName = (activeCart?.customerName || '').trim() || 'زبون نقدي عام';
  const customerType = activeCart?.customerType || 'retail';
  const isGenericCustomer = !activeCart?.customerName || customerName === 'زبون نقدي عام' || customerName === 'زبون نقدي' || customerName === 'زبون عام';

  // Calculations
  const items = activeCart?.items || [];
  const subtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
  const discount = Number(activeCart?.discount) || 0;
  const grandTotal = Math.max(0, subtotal - discount);
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // التحقق من اسم العميل في حالة الدين
    if (paymentMethod === 'debt' && isGenericCustomer) {
      setError('⚠️ لا يمكن تسجيل فاتورة بالدين على "زبون عام". يرجى إغلاق النافذة وتحديد اسم العميل من الشريط العلوي أولاً.');
      return;
    }

    onConfirmCheckout({
      invoiceType: paymentMethod,
      paymentMethod,
      customerName: customerName,
      phone1: (activeCart?.phone1 || '').trim(),
      notes: (activeCart?.notes || '').trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💳</span>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">إتمام الحساب والدفع</h3>
              <p className="text-xs text-slate-400">اختر طريقة الدفع لإنهاء الفاتورة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl p-3.5">
              {error}
            </div>
          )}

          {/* 1. أزرار طريقة الدفع الـ 3 الكبيرة */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">طريقة الدفع *</label>
            <div className="grid grid-cols-3 gap-3">
              {/* نقدي */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('cash'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">💵</span>
                <span>نقدي</span>
              </button>

              {/* ماستر كارد */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('mastercard'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'mastercard'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">💳</span>
                <span>ماستر كارد</span>
              </button>

              {/* دين */}
              <button
                type="button"
                onClick={() => { setPaymentMethod('debt'); setError(''); }}
                className={`p-3.5 rounded-2xl border-2 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'debt'
                    ? 'border-red-500 bg-red-50 text-red-700 shadow-xs ring-2 ring-red-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-xl">📝</span>
                <span>دين (آجل)</span>
              </button>
            </div>
          </div>

          {/* 2. بطاقة توضيح حساب العميل (للقراءة فقط - لا يمكن تعديلها من هنا) */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg text-indigo-700 shrink-0">
                👤
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-400 block">
                  الحساب المسجل عليه الفاتورة
                </span>
                <span className="font-black text-base text-slate-800 truncate block">
                  {customerName}
                </span>
              </div>
            </div>

            <span
              className={`text-xs font-bold px-3 py-1 rounded-xl shrink-0 ${
                customerType === 'client'
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : customerType === 'offer'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {customerType === 'client'
                ? 'عميل (جملة)'
                : customerType === 'offer'
                ? 'عرض سعر'
                : 'زبون (مفرد)'}
            </span>
          </div>

          {/* 3. بطاقة ملخص الإجمالي */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 block font-medium">المبلغ المطلوب سداده</span>
              <span className="text-xs text-slate-400 font-mono">
                {items.length} أصناف • {totalUnits} قطعة
              </span>
            </div>
            <div className="text-left">
              <span className="text-2xl font-black text-indigo-700 font-mono">
                {grandTotal.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-500 mr-1">د.ع</span>
            </div>
          </div>

          {/* 4. أزرار الإجراءات: إتمام الدفع أو إلغاء */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={processing}
              className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-base rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <span>{processing ? '⏳' : '✓'}</span>
              <span>{processing ? 'جاري تسجيل الدفع...' : 'إتمام الدفع وتأكيد البيع'}</span>
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={onClose}
              className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
