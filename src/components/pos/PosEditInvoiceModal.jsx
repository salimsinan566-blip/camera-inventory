import React, { useState, useMemo } from 'react';
import { useSales } from '../../hooks/useSales';
import { useDraftSales } from '../../hooks/useDraftSales';

export default function PosEditInvoiceModal({
  isOpen,
  onClose,
  onLoadInvoiceIntoCart,
}) {
  const { sales, loading: salesLoading } = useSales();
  const { drafts, loading: draftsLoading } = useDraftSales();
  const [searchTerm, setSearchTerm] = useState('');

  // Combine confirmed sales and drafts
  const allInvoices = useMemo(() => {
    const combined = [
      ...(drafts || []).map((d) => ({ ...d, isDraft: true })),
      ...(sales || []).map((s) => ({ ...s, isDraft: false })),
    ];
    return combined.sort((a, b) => {
      const timeA = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeB - timeA;
    });
  }, [sales, drafts]);

  // Instant filter by invoice number or customer name
  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) {
      return allInvoices.slice(0, 30); // show top 30 by default
    }
    const term = searchTerm.trim().toLowerCase();
    return allInvoices.filter((inv) => {
      const invNum = String(inv.invoiceNumber || '');
      const custName = String(inv.customerName || '').toLowerCase();
      const phone = String(inv.phone1 || inv.customerPhone || '');
      return invNum.includes(term) || custName.includes(term) || phone.includes(term);
    }).slice(0, 50);
  }, [allInvoices, searchTerm]);

  if (!isOpen) return null;

  const handleSelect = (inv) => {
    onLoadInvoiceIntoCart(inv);
    onClose();
  };

  const formatDate = (val) => {
    if (!val) return '—';
    try {
      const d = val.toDate ? val.toDate() : new Date(val);
      return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs select-none" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <div>
              <h3 className="font-bold text-slate-800 text-base">تعديل فاتورة</h3>
              <p className="text-xs text-slate-400">ابحث باسم العميل أو رقم الفاتورة لتحميلها للسلة الفعّالة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اكتب رقم الفاتورة أو اسم العميل للبحث اللحظي..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Invoices List */}
        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {salesLoading || draftsLoading ? (
            <p className="text-center py-8 text-xs text-slate-400">جارٍ تحميل الفواتير...</p>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">
              لا توجد فواتير مطابقة لبحثك
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const isDraft = inv.isDraft;
              const itemsCount = (inv.items || []).length;
              const totalAmount = Number(inv.total || inv.grandTotal || 0);

              return (
                <div
                  key={inv.id}
                  onClick={() => handleSelect(inv)}
                  className="p-3.5 rounded-2xl border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isDraft ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {isDraft ? 'مسودة' : `#${inv.invoiceNumber || '—'}`}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 truncate">
                          {inv.customerName || 'زبون عام'}
                        </span>
                        {isDraft && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                            غير مؤكدة
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-medium">
                        <span>{formatDate(inv.createdAt)}</span>
                        <span>•</span>
                        <span>{itemsCount} عناصر</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="font-black text-sm text-indigo-700 font-mono block">
                      {totalAmount.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-indigo-500 font-bold group-hover:underline">
                      تحميل للسلة ➔
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
