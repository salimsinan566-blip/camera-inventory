import React, { useState, useEffect, useRef, useMemo } from 'react';
import { subscribeToSuppliers, saveDraftPurchase, saveOrUpdateSupplier } from '../../services/purchasesService';
import { useUI } from '../../contexts/UIContext';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function PosSupplyRequestModal({
  isOpen,
  onClose,
  activeCart,
  cashierEmail,
  onSuccess,
}) {
  const { toast } = useUI();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [notes, setNotes] = useState('طلب توريد محول من نقطة البيع');
  const [targetLocation, setTargetLocation] = useState('store'); // 'store' | 'warehouse'
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);

  const supplierInputRef = useRef(null);

  // Subscribe to existing suppliers
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeToSuppliers((list) => {
      setSuppliers(list || []);
    });
    return () => unsubscribe && unsubscribe();
  }, [isOpen]);

  // Focus supplier input when modal opens & reset state
  useEffect(() => {
    if (isOpen) {
      setSupplierName('');
      setSupplierPhone('');
      setNotes('طلب توريد محول من نقطة البيع');
      setTargetLocation('store');
      setShowSupplierDropdown(false);
      setShowItemsList(false);
      setTimeout(() => {
        supplierInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const items = activeCart?.items || [];
  const totalUnits = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  }, [items]);

  const totalWholesaleAmount = useMemo(() => {
    return items.reduce((sum, it) => {
      const cost = Number(it.wholesalePrice || it.costPrice || 0);
      const qty = Number(it.quantity) || 1;
      return sum + (cost * qty);
    }, 0);
  }, [items]);

  // Filter suppliers based on input
  const filteredSuppliers = useMemo(() => {
    const q = supplierName.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 8);
    return suppliers.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    ).slice(0, 8);
  }, [suppliers, supplierName]);

  if (!isOpen) return null;

  const handleSubmit = async (e, shouldPrint = true) => {
    if (e && e.preventDefault) e.preventDefault();

    const cleanSupplier = supplierName.trim();
    if (!cleanSupplier) {
      toast('يرجى تحديد أو إدخال اسم المورد المطلوب أولاً', 'warning');
      supplierInputRef.current?.focus();
      return;
    }

    if (items.length === 0) {
      toast('السلة فارغة! لا توجد مواد لتحويلها', 'warning');
      onClose();
      return;
    }

    setSaving(true);
    try {
      // 1. Map items to purchase draft schema
      const draftItems = items.map((item) => {
        const costPrice = Number(item.wholesalePrice || item.costPrice || 0);
        return {
          productId: item.productId || '',
          name: item.name || '',
          sku: item.sku || '',
          barcode: item.barcode || '',
          cameraType: item.cameraType || '',
          quantity: Math.max(1, Number(item.quantity) || 1),
          costPrice: costPrice,
          oldCostPrice: costPrice,
          retailPrice: Number(item.retailPrice || item.unitPrice || 0),
          location: targetLocation,
          unitShippingCost: 0,
          effectiveCostPrice: costPrice,
          isNewProduct: false,
        };
      });

      const totalAmount = draftItems.reduce(
        (sum, it) => sum + (it.quantity * it.costPrice),
        0
      );

      // 2. Save draft to draft_purchases collection
      const savedDraftId = await saveDraftPurchase({
        supplierName: cleanSupplier,
        supplierPhone: supplierPhone.trim(),
        invoiceNumber: '',
        items: draftItems,
        paymentStatus: 'unpaid',
        paymentMethod: 'نقدي',
        totalAmount: totalAmount,
        paidAmount: 0,
        shippingCost: 0,
        distributeShippingToCost: true,
        notes: notes.trim(),
        date: new Date().toISOString(),
        createdBy: cashierEmail || 'المسؤول',
      });

      // 3. Save or update supplier in known suppliers list if not already saved
      try {
        await saveOrUpdateSupplier(cleanSupplier, supplierPhone.trim());
      } catch (suppErr) {
        console.warn('Could not auto-save supplier:', suppErr);
      }

      toast(`تم حفظ فاتورة طلب التوريد للمورد "${cleanSupplier}" في مسودات الشراء بنجاح! 📋📦`, 'success');

      const receiptDraftData = {
        id: savedDraftId,
        invoiceNumber: 'طلب توريد',
        isSupplyRequest: true,
        supplierName: cleanSupplier,
        supplierPhone: supplierPhone.trim(),
        customerName: cleanSupplier,
        customerPhone: supplierPhone.trim(),
        items: draftItems.map((it) => ({
          ...it,
          unitPrice: it.costPrice,
          lineTotal: it.quantity * it.costPrice,
        })),
        total: totalAmount,
        subtotal: totalAmount,
        discount: 0,
        notes: notes.trim(),
        cashierEmail: cashierEmail || 'المسؤول',
        createdAt: new Date(),
      };

      onSuccess?.(receiptDraftData, { shouldPrint });
      onClose();
    } catch (err) {
      console.error('Failed to create supply request draft:', err);
      toast(`فشل حفظ طلب التوريد: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-fade-in"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-l from-slate-50 via-white to-sky-50/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 flex items-center justify-center text-xl shadow-2xs shrink-0">
              📦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 text-base leading-tight">
                  تحويل إلى فاتورة طلب توريد
                </h3>
                <span className="text-[10px] font-black bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-mono">
                  Ctrl + I
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                حفظ مواد السلة كمسودة شراء وتوريد لدى المورد المحدد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-sm transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4.5 flex-1">
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold">ملخص مواد الفاتورة:</span>
              <button
                type="button"
                onClick={() => setShowItemsList(!showItemsList)}
                className="text-[11px] text-sky-600 hover:text-sky-800 font-black cursor-pointer flex items-center gap-1"
              >
                <span>{showItemsList ? 'إخفاء المواد ▲' : 'معاينة المواد ▼'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs">
                <span>الأصناف:</span>
                <span className="font-mono font-black text-slate-900">{items.length}</span>
              </div>
              <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs">
                <span>القطع:</span>
                <span className="font-mono font-black text-slate-900">{totalUnits}</span>
              </div>
              <div className="bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-xl font-bold text-sky-900 flex items-center gap-1.5 shadow-2xs mr-auto">
                <span>إجمالي التكلفة التقريبي:</span>
                <span className="font-mono font-black text-sky-700">{formatIQD(totalWholesaleAmount)} د.ع</span>
              </div>
            </div>

            {/* Expandable items preview */}
            {showItemsList && (
              <div className="mt-2 pt-2 border-t border-slate-200/80 max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200/60"
                  >
                    <span className="font-bold text-slate-800 truncate max-w-[220px]">
                      {it.name || 'مادة بدون اسم'}
                    </span>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-slate-600">
                      <span>{it.quantity} قطعة</span>
                      <span className="font-bold text-slate-900">
                        {formatIQD(Number(it.wholesalePrice || it.costPrice || 0) * (Number(it.quantity) || 1))} د.ع
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supplier Input with Autocomplete */}
          <div className="relative">
            <label className="block text-xs font-black text-slate-800 mb-1.5">
              المورد المطلوب <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={supplierInputRef}
                type="text"
                required
                value={supplierName}
                onFocus={() => setShowSupplierDropdown(true)}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  setShowSupplierDropdown(true);
                }}
                placeholder="اكتب أو اختر اسم المورد المطلوب..."
                className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all placeholder:text-slate-400"
                autoComplete="off"
              />
              <span className="absolute right-3 top-3 text-slate-400 text-sm">🏢</span>
            </div>

            {/* Autocomplete Dropdown */}
            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto z-50 divide-y divide-slate-100 animate-fade-in">
                {filteredSuppliers.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSupplierName(s.name);
                      if (s.phone) setSupplierPhone(s.phone);
                      setShowSupplierDropdown(false);
                    }}
                    className="p-2.5 flex items-center justify-between hover:bg-sky-50/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sky-600 text-xs">🏢</span>
                      <span className="text-xs font-bold text-slate-900">{s.name}</span>
                    </div>
                    {s.phone && (
                      <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                        {s.phone}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Supplier Phone Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              رقم هاتف المورد (اختياري)
            </label>
            <div className="relative">
              <input
                type="text"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="07xxxxxxxx"
                className="w-full pr-10 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all placeholder:text-slate-400"
                dir="ltr"
              />
              <span className="absolute right-3 top-2.5 text-slate-400 text-xs">📞</span>
            </div>
          </div>

          {/* Destination Location */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                موقع التوريد المستهدف
              </label>
              <select
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="store">المحل</option>
                <option value="warehouse">المخزن</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                حالة الفاتورة بالمسودة
              </label>
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 text-center">
                مسودة شراء (طلب توريد)
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              ملاحظات طلب التوريد
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي ملاحظات للطلب هنا..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white resize-none transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              إلغاء (Esc)
            </button>

            <button
              type="button"
              onClick={(e) => handleSubmit(e, false)}
              disabled={saving || !supplierName.trim()}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-xs transition-all border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              title="حفظ المسودة بدون طباعة"
            >
              <span>💾</span>
              <span>حفظ كمسودة فقط</span>
            </button>

            <button
              type="submit"
              disabled={saving || !supplierName.trim()}
              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-black text-xs transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              title="حفظ المسودة وفتح الفاتورة للطباعة فوراً"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>جارٍ الحفظ والطباعة...</span>
                </>
              ) : (
                <>
                  <span>🖨️</span>
                  <span>حفظ وطباعة الفاتورة</span>
                  <span className="text-[10px] bg-sky-700 px-1.5 py-0.5 rounded font-mono">↵ Enter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
