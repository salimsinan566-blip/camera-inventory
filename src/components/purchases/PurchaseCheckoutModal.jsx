import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToEmployees } from '../../services/salariesService';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function PurchaseCheckoutModal({
  isOpen,
  onClose,
  totalAmount = 0,
  itemsCount = 0,
  totalPieces = 0,
  shippingCost = 0,
  supplierName = '',
  invoiceNumber = '',
  user,
  initialPaymentStatus = 'paid',
  initialPaidAmount = '',
  initialPaymentMethod = 'نقدي',
  initialOutOfPocket = false,
  initialOutOfPocketAmount = '',
  initialOutOfPocketEmployee = '',
  initialNotes = '',
  onConfirmCheckout,
  submitting = false,
  isEditing = false,
  newlyAddedItems = [],
  quantityIncreasedItems = [],
}) {
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus); // 'paid' | 'debt' | 'partial'
  const [paidAmount, setPaidAmount] = useState(initialPaidAmount ? String(initialPaidAmount) : '');
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod || 'نقدي'); // 'نقدي' | 'ماستر كارد'
  const [paidOutOfPocket, setPaidOutOfPocket] = useState(initialOutOfPocket);
  const [outOfPocketAmount, setOutOfPocketAmount] = useState(
    initialOutOfPocketAmount ? String(initialOutOfPocketAmount) : ''
  );
  const [outOfPocketEmployee, setOutOfPocketEmployee] = useState(
    initialOutOfPocketEmployee || user?.displayName || user?.email?.split('@')[0] || ''
  );
  const [notes, setNotes] = useState(initialNotes || '');
  const [employeesList, setEmployeesList] = useState([]);

  // Load registered employees for quick autocomplete
  useEffect(() => {
    const unsub = subscribeToEmployees((list) => {
      setEmployeesList(list || []);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPaymentStatus(initialPaymentStatus || 'paid');
      setPaidAmount(
        initialPaidAmount
          ? String(initialPaidAmount)
          : initialPaymentStatus === 'paid'
          ? String(totalAmount)
          : ''
      );
      setPaymentMethod(initialPaymentMethod || 'نقدي');
      setPaidOutOfPocket(Boolean(initialOutOfPocket));
      setOutOfPocketAmount(initialOutOfPocketAmount ? String(initialOutOfPocketAmount) : '');
      setOutOfPocketEmployee(
        initialOutOfPocketEmployee || user?.displayName || user?.email?.split('@')[0] || ''
      );
      setNotes(initialNotes || '');
    }
  }, [
    isOpen,
    initialPaymentStatus,
    initialPaidAmount,
    initialPaymentMethod,
    initialOutOfPocket,
    initialOutOfPocketAmount,
    initialOutOfPocketEmployee,
    initialNotes,
    totalAmount,
    user,
  ]);

  if (!isOpen) return null;

  const calculatedPaid =
    paymentStatus === 'paid'
      ? totalAmount
      : paymentStatus === 'debt'
      ? 0
      : Number(paidAmount) || 0;

  const remainingDebt = Math.max(0, totalAmount - calculatedPaid);

  const isMastercard = paymentMethod === 'ماستر كارد' || paymentMethod === 'mastercard';
  const numOOP = paidOutOfPocket ? Math.max(0, Math.min(calculatedPaid, Number(outOfPocketAmount) || 0)) : 0;
  const netPaidAfterOOP = Math.max(0, calculatedPaid - numOOP);
  const cashDrawerDeduction = isMastercard ? 0 : netPaidAfterOOP;
  const mastercardDeduction = isMastercard ? netPaidAfterOOP : 0;

  const handleConfirm = (e) => {
    e.preventDefault();
    onConfirmCheckout({
      paymentStatus,
      paidAmount: calculatedPaid,
      paymentMethod,
      remainingDebt,
      paidOutOfPocket: Boolean(paidOutOfPocket && numOOP > 0),
      outOfPocketAmount: numOOP,
      outOfPocketEmployeeName: outOfPocketEmployee.trim(),
      paidFromCashDrawerAmount: cashDrawerDeduction,
      paidFromMastercardAmount: mastercardDeduction,
      notes: notes.trim(),
    });
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - رسمي ومختصر */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-black">إتمام وتوريد فاتورة الشراء</h3>
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
        <form onSubmit={handleConfirm} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto text-xs">
          {/* Invoice Summary Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold">المورد:</span>
              <span className="font-black text-slate-900">{supplierName || '—'}</span>
            </div>
            {invoiceNumber && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold">رقم الفاتورة:</span>
                <span className="font-mono font-bold text-slate-800">#{invoiceNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold">المواد والقطع:</span>
              <span className="text-slate-700 font-mono font-bold">
                {itemsCount} أصناف ({totalPieces} قطعة)
              </span>
            </div>
            {shippingCost > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold">أجور الشحن:</span>
                <span className="font-mono font-bold text-slate-800">
                  +{formatIQD(shippingCost)} د.ع
                </span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 text-xs sm:text-sm">
              <span className="font-black text-slate-900">الإجمالي الكلي النهائي:</span>
              <span className="font-black font-mono text-slate-950 text-base">
                {formatIQD(totalAmount)} د.ع
              </span>
            </div>
          </div>

          {/* Payment Status Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">طريقة وحالة السداد *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentStatus('paid')}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  paymentStatus === 'paid'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs block font-bold">مدفوعة نقداً</span>
                <span className="text-[10px] opacity-75 block mt-0.5">كامل المبلغ</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus('partial')}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  paymentStatus === 'partial'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs block font-bold">دفعة جزئية</span>
                <span className="text-[10px] opacity-75 block mt-0.5">تسديد جزء</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus('debt')}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                  paymentStatus === 'debt'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs block font-bold">دين بالكامل</span>
                <span className="text-[10px] opacity-75 block mt-0.5">آجل على المكتب</span>
              </button>
            </div>
          </div>

          {/* Partial Payment Amount Input */}
          {paymentStatus === 'partial' && (
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                المبلغ المسدد للمورد الآن (د.ع) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="1"
                  max={totalAmount}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="أدخل المبلغ المسدد..."
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                <span className="absolute left-3 top-2 text-[11px] text-slate-400 font-bold">د.ع</span>
              </div>
            </div>
          )}

          {/* Payment Method & Debt Preview */}
          {paymentStatus !== 'debt' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="نقدي">نقدي</option>
                  <option value="ماستر كارد">ماستر كارد</option>
                </select>
                {isMastercard && calculatedPaid > 0 && (
                  <p className="text-[10px] text-indigo-700 font-bold mt-1 bg-indigo-50 border border-indigo-200 rounded p-1 flex items-center gap-1">
                    <span>💳</span>
                    <span>خصم من الماستركارد ({formatIQD(mastercardDeduction)} د.ع) بدون المساس بالقاصة</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المتبقي كدين على المحل
                </label>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black font-mono text-rose-700">
                  {formatIQD(remainingDebt)} د.ع
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* زر وقسم دفع الموظف جزء من المبلغ (من جيبه الخاص) */}
          {/* ---------------------------------------------------- */}
          {paymentStatus !== 'debt' && (
            <div className="space-y-2 pt-1">
              {/* الزر الرئيسي البارز للتبديل */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !paidOutOfPocket;
                  setPaidOutOfPocket(nextState);
                  if (nextState && !outOfPocketAmount) {
                    setOutOfPocketAmount(String(Math.round(calculatedPaid / 2)));
                  }
                }}
                className={`w-full p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                  paidOutOfPocket
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>💼</span>
                  <span>دفع موظف جزءاً من المبلغ (من جيبه الخاص)</span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    paidOutOfPocket ? 'bg-slate-800 text-white border border-slate-700' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {paidOutOfPocket ? 'مفعل ✓' : '+ تفعيل'}
                </span>
              </button>

              {/* تفاصيل مساهمة الموظف عند التفعيل */}
              {paidOutOfPocket && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-fade-in text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* المبلغ المدفوع من الموظف */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          المبلغ الذي دفعه الموظف (د.ع) *
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setOutOfPocketAmount(String(calculatedPaid))}
                            className="text-[10px] text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-1.5 py-0.2 rounded cursor-pointer font-bold"
                          >
                            الكل
                          </button>
                          <button
                            type="button"
                            onClick={() => setOutOfPocketAmount(String(Math.round(calculatedPaid / 2)))}
                            className="text-[10px] text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-1.5 py-0.2 rounded cursor-pointer font-bold"
                          >
                            النصف
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={calculatedPaid}
                        value={outOfPocketAmount}
                        onChange={(e) => setOutOfPocketAmount(e.target.value)}
                        placeholder="المبلغ المدفوع..."
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>

                    {/* اسم الموظف مع قائمة بالموظفين */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        اسم الموظف / الدافع *
                      </label>
                      <input
                        type="text"
                        list="employees-datalist"
                        required={paidOutOfPocket}
                        value={outOfPocketEmployee}
                        onChange={(e) => setOutOfPocketEmployee(e.target.value)}
                        placeholder="اسم الموظف..."
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                      <datalist id="employees-datalist">
                        {employeesList.map((emp) => (
                          <option key={emp.id} value={emp.name || emp.employeeName} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* تفصيل فوري لحركة الصندوق والسلفة */}
                  <div className="pt-2 border-t border-slate-200 flex flex-col gap-1 text-[11px] text-slate-600 font-mono">
                    <div className="flex items-center justify-between">
                      <span>إجمالي المسدد للمورد:</span>
                      <span className="font-bold text-slate-900">{formatIQD(calculatedPaid)} د.ع</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>دفع الموظف ({outOfPocketEmployee || 'الموظف'}):</span>
                      <span className="font-bold text-slate-900">
                        {formatIQD(numOOP)} د.ع (سلفة مستحقة له)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 font-bold">
                      <span className={isMastercard ? 'text-indigo-800' : 'text-slate-800'}>
                        {isMastercard ? 'الصافي المخصوم من رصيد الماستركارد:' : 'الصافي المخصوم من القاصة اليومية:'}
                      </span>
                      <span className={`font-black font-mono ${isMastercard ? 'text-indigo-950' : 'text-slate-950'}`}>
                        {formatIQD(isMastercard ? mastercardDeduction : cashDrawerDeduction)} د.ع
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات الفاتورة (اختياري)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* تنبيه بالمواد المضافة عند التعديل */}
          {isEditing && (newlyAddedItems.length > 0 || quantityIncreasedItems.length > 0) && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1.5 shadow-2xs">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <span>📦</span>
                <span>تم رصد مواد / كميات جديدة مضافة في هذا التعديل:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] pr-2 font-medium">
                {newlyAddedItems.map((item, idx) => (
                  <li key={`new-${idx}`}>
                    مادة جديدة: <strong className="font-bold text-emerald-900">{item.name}</strong> ({item.quantity} قطعة)
                  </li>
                ))}
                {quantityIncreasedItems.map((item, idx) => (
                  <li key={`inc-${idx}`}>
                    زيادة كمية: <strong className="font-bold text-emerald-900">{item.name}</strong> (+{item.diff} قطعة إضافية)
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-emerald-700 font-bold pt-1 border-t border-emerald-200/60">
                ✓ سيتم توريد هذه المواد تلقائياً وتحديث المخزون فور تأكيد التعديل.
              </p>
            </div>
          )}

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
              disabled={submitting}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <span>{isEditing ? '💾' : '📦'}</span>
              <span>
                {submitting 
                  ? (isEditing ? 'جاري تأكيد التعديل...' : 'جاري التوريد...') 
                  : (isEditing ? 'تأكيد التعديل 💾' : 'تأكيد وحفظ الفاتورة')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
