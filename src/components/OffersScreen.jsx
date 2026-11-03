import React, { useState, useMemo } from 'react';
import { useOffers } from '../hooks/useOffers';
import { deleteOffer, markOfferAsConverted, updateOfferItemsOrder } from '../services/offersService';
import { useUI } from '../contexts/UIContext';
import InvoiceReceipt from './InvoiceReceipt';

const normalizeArabic = (text) => {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
    .trim();
};

export default function OffersScreen({ onEditOffer, onCreateOffer, onConvertOfferToSale }) {
  const { offers, loading, error } = useOffers();
  const { toast, confirm } = useUI();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'converted'
  const [printingOffer, setPrintingOffer] = useState(null);
  const [reorderingOffer, setReorderingOffer] = useState(null);

  const formatOfferDate = (dateVal) => {
    if (!dateVal) return '-';
    try {
      const d = dateVal?.toDate ? dateVal.toDate() : (dateVal instanceof Date ? dateVal : new Date(dateVal));
      if (isNaN(d.getTime())) return String(dateVal).slice(0, 10) || '-';
      return d.toLocaleDateString('en-GB');
    } catch {
      return '-';
    }
  };

  const handleDelete = (offer) => {
    confirm(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف عرض السعر "${offer.offerName}"؟`,
      async () => {
        try {
          await deleteOffer(offer.id);
          toast('تم حذف العرض بنجاح', 'success');
        } catch (err) {
          toast('حدث خطأ أثناء الحذف: ' + err.message, 'error');
        }
      }
    );
  };

  const handlePrint = (offer) => {
    // To print, we create a pseudo-sale object
    const pseudoSale = {
      ...offer,
      invoiceNumber: offer.offerNumber,
      isOffer: true
    };
    setPrintingOffer(pseudoSale);
  };

  // Smart Search & Filtering Logic
  const { filteredOffers, stats } = useMemo(() => {
    const normSearch = normalizeArabic(searchTerm);
    const tokens = normSearch ? normSearch.split(/\s+/).filter(Boolean) : [];

    let activeCount = 0;
    let convertedCount = 0;

    offers.forEach((o) => {
      if (o.status === 'converted') convertedCount++;
      else activeCount++;
    });

    const filtered = [];

    offers.forEach((offer) => {
      // 1. Status Filter
      if (statusFilter === 'active' && offer.status === 'converted') return;
      if (statusFilter === 'converted' && offer.status !== 'converted') return;

      // 2. Search Filter
      if (tokens.length === 0) {
        filtered.push({ offer, matchedItemSummary: null, totalMatchedItems: 0 });
        return;
      }

      const offerNum = String(offer.offerNumber || '');
      const offerName = normalizeArabic(offer.offerName || '');
      const custName = normalizeArabic(offer.customerName || '');
      const notes = normalizeArabic(offer.notes || '');
      const totalStr = String(offer.total || '');

      // Check items inside this offer
      const matchedItems = [];
      let itemsSearchableText = '';

      (offer.items || []).forEach((item) => {
        const itemNameNorm = normalizeArabic(item.name || '');
        const skuNorm = normalizeArabic(item.sku || '');
        const itemNotesNorm = normalizeArabic(item.notes || '');
        const itemFull = `${itemNameNorm} ${skuNorm} ${itemNotesNorm}`;
        itemsSearchableText += ' ' + itemFull;

        const isItemMatched = tokens.some((t) => itemFull.includes(t));
        if (isItemMatched && item.name) {
          matchedItems.push(item.name);
        }
      });

      const fullCombinedText = `${offerNum} #${offerNum} ${offerName} ${custName} ${notes} ${totalStr} ${itemsSearchableText}`;

      // Every search token must match somewhere in the offer or its items
      const isMatch = tokens.every((token) => fullCombinedText.includes(token));

      if (isMatch) {
        filtered.push({
          offer,
          matchedItemSummary: matchedItems.length > 0 ? matchedItems[0] : null,
          totalMatchedItems: matchedItems.length
        });
      }
    });

    return {
      filteredOffers: filtered,
      stats: {
        total: offers.length,
        active: activeCount,
        converted: convertedCount
      }
    };
  }, [offers, searchTerm, statusFilter]);

  if (loading) {
    return <div className="p-8 text-center text-ink-500">جاري تحميل العروض...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-danger-500">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-100">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">عروض الأسعار</h1>
          <p className="text-ink-500 text-sm mt-1">إدارة وإنشاء عروض أسعار للعملاء (لا تؤثر على المخزون)</p>
        </div>
        <button
          onClick={onCreateOffer}
          className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          إنشاء عرض جديد
        </button>
      </div>

      {/* Smart Search Bar & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-ink-200 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-ink-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 بحث ذكي: رقم العرض، اسم العميل، اسم العرض، أو أي مادة داخل العرض (مثل: 5 ميكا، كيبل، هارد)..."
              className="w-full pl-10 pr-10 py-2.5 bg-ink-50/70 border border-ink-200 focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 rounded-xl text-sm font-medium text-ink-900 placeholder:text-ink-400 transition-all outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-ink-400 hover:text-ink-700 transition-colors"
                title="مسح البحث"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 shrink-0 bg-ink-50 p-1 rounded-xl border border-ink-200/60 select-none overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-brand-700 shadow-xs border border-ink-200/50'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              الكل ({stats.total})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === 'active'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              النشطة ({stats.active})
            </button>
            <button
              onClick={() => setStatusFilter('converted')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === 'converted'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              المحولة لفواتير ({stats.converted})
            </button>
          </div>
        </div>

        {/* Search Results Summary */}
        <div className="flex items-center justify-between text-xs text-ink-500 pt-1 px-1 border-t border-ink-100">
          <span>
            عرض <strong className="text-ink-800 font-bold">{filteredOffers.length}</strong> من أصل <strong className="text-ink-800 font-bold">{stats.total}</strong> عرض سعر
          </span>
          {searchTerm && (
            <span className="text-brand-600 flex items-center gap-1">
              <span>نتائج البحث عن:</span>
              <span className="font-bold bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md text-brand-700">"{searchTerm}"</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Table / Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-ink-200 overflow-hidden">
        {offers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-brand-50 text-brand-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-ink-900">لا توجد عروض أسعار</h3>
            <p className="text-ink-500 mt-2">انقر على الزر أعلاه لإنشاء أول عرض سعر.</p>
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-ink-100 text-ink-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              🔍
            </div>
            <h3 className="text-lg font-bold text-ink-900">لا توجد نتائج مطابقة</h3>
            <p className="text-ink-500 mt-1 text-sm">
              لم نعثر على أي عرض سعر يحتوي على كلمة <span className="font-bold text-ink-700">"{searchTerm}"</span> في اسمه أو عميله أو مواده.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="mt-4 px-4 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-xl text-xs transition-colors"
            >
              إلغاء البحث وإظهار كل العروض
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-ink-50 text-ink-600 font-bold border-b border-ink-200">
                <tr>
                  <th className="px-6 py-4">رقم العرض</th>
                  <th className="px-6 py-4">اسم العرض والمواد</th>
                  <th className="px-6 py-4">اسم العميل</th>
                  <th className="px-6 py-4">عدد المواد</th>
                  <th className="px-6 py-4">تاريخ الإنشاء</th>
                  <th className="px-6 py-4">الإجمالي</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredOffers.map(({ offer, matchedItemSummary, totalMatchedItems }) => (
                  <tr key={offer.id} className="hover:bg-brand-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-ink-900">#{offer.offerNumber || '---'}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-brand-700">{offer.offerName}</div>
                      {matchedItemSummary && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                            <span className="text-brand-500">🔍 تطابق في المواد:</span>
                            <span className="font-bold text-ink-800">{matchedItemSummary}</span>
                            {totalMatchedItems > 1 && (
                              <span className="text-ink-400 text-[10px]">(+{totalMatchedItems - 1} مواد أخرى)</span>
                            )}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-ink-700 font-medium">{offer.customerName || '-'}</td>
                    <td className="px-6 py-4 text-ink-500 font-mono text-xs">
                      <span className="bg-ink-100 text-ink-700 px-2 py-0.5 rounded-full font-bold">
                        {offer.items?.length || 0} مواد
                      </span>
                    </td>
                    <td className="px-6 py-4 text-ink-500 font-mono" dir="ltr">{formatOfferDate(offer.createdAt)}</td>
                    <td className="px-6 py-4 font-bold text-ink-900">{Number(offer.total).toLocaleString()} د.ع</td>
                    <td className="px-6 py-4">
                      {offer.status === 'converted' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">مُحوّل لمبيعات</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-800 border border-brand-200">نشط</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handlePrint(offer)}
                          className="p-2 text-ink-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                          title="طباعة عرض السعر"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </button>

                        <button
                          onClick={() => setReorderingOffer(offer)}
                          className="p-2 text-ink-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="ترتيب بنود العرض وتحديد العنصر الأول"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => onEditOffer(offer)}
                          className="p-2 text-ink-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="تعديل العرض"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        <button
                          onClick={() => handleDelete(offer)}
                          className="p-2 text-ink-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف العرض"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        <button
                          onClick={() => onConvertOfferToSale(offer)}
                          className="px-3 py-1.5 ml-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                          title="تحويل العرض إلى نقطة البيع للمحاسبة وخصم المخزون"
                        >
                          تحويل لفاتورة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {printingOffer && (
        <InvoiceReceipt 
          sale={printingOffer} 
          onClose={() => setPrintingOffer(null)} 
        />
      )}

      {reorderingOffer && (
        <ReorderOfferModal
          offer={reorderingOffer}
          onClose={() => setReorderingOffer(null)}
          onFullEdit={(o) => onEditOffer(o)}
          onSave={async (offerId, newItems) => {
            try {
              await updateOfferItemsOrder(offerId, newItems);
              toast('تم حفظ ترتيب عناصر العرض بنجاح', 'success');
            } catch (err) {
              toast('حدث خطأ أثناء حفظ الترتيب: ' + err.message, 'error');
              throw err;
            }
          }}
        />
      )}
    </div>
  );
}

function ReorderOfferModal({ offer, onClose, onSave, onFullEdit }) {
  const [items, setItems] = useState(() => [...(offer.items || [])]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [saving, setSaving] = useState(false);

  const moveItem = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    setItems((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const moveItemToTop = (fromIndex) => {
    moveItem(fromIndex, 0);
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {}
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e, index) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      moveItem(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      await onSave(offer.id, items);
      onClose();
    } catch (err) {
      // toast shown by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-brand-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-ink-100 flex items-center justify-between bg-gradient-to-r from-brand-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center text-lg">
              ↕️
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-ink-900 leading-tight">
                ترتيب بنود عرض السعر #{offer.offerNumber || ''}
              </h2>
              <p className="text-xs text-brand-700 font-bold mt-0.5 truncate max-w-[280px] sm:max-w-md">
                {offer.offerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tip Box */}
        <div className="px-4 py-2.5 bg-amber-50/90 border-b border-amber-200/80 flex items-start gap-2 text-xs text-amber-950">
          <span className="text-base shrink-0">💡</span>
          <div>
            <strong className="block font-black text-amber-900">تحديد أول عنصر وترتيب الفاتورة:</strong>
            <span>
              اضغط على زر <strong className="text-amber-800 bg-amber-200/70 px-1 py-0.2 rounded font-mono">🔝 الأول</strong> لجعل أي مادة أول عنصر مباشرة، أو استخدم الأسهم والسحب لتحديد الترتيب الدقيق للطباعة.
            </span>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-ink-50/30">
          {items.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-xs">لا توجد بنود في هذا العرض</div>
          ) : (
            items.map((item, index) => {
              const isFirst = index === 0;
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={`${item.productId || item.name}-${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={(e) => handleDragLeave(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-2 sm:p-2.5 bg-white rounded-xl border transition-all gap-2 ${
                    isDragging ? 'opacity-30 border-dashed border-brand-400 bg-brand-50/30' : ''
                  } ${
                    isDragOver ? 'border-brand-500 ring-2 ring-brand-300 bg-brand-50/50 scale-[1.01]' : 'border-ink-200 shadow-2xs hover:border-brand-300'
                  } ${
                    isFirst ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200' : ''
                  }`}
                >
                  {/* رقم الترتيب */}
                  <div className="shrink-0 select-none">
                    <select
                      value={index + 1}
                      onChange={(e) => moveItem(index, Number(e.target.value) - 1)}
                      className={`w-7 h-7 text-xs font-mono font-black rounded-lg border text-center cursor-pointer appearance-none transition-all flex items-center justify-center p-0 ${
                        isFirst
                          ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                          : 'bg-ink-100 hover:bg-brand-50 text-ink-700 hover:text-brand-700 border-ink-200 hover:border-brand-300'
                      }`}
                      title={`ترتيب العنصر: ${index + 1} (اضغط لاختيار 1 أو أي رقم آخر)`}
                    >
                      {items.map((_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="font-bold text-ink-900 text-xs sm:text-sm leading-tight truncate" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-500 font-mono">
                      <span>الكمية: <strong className="text-ink-800 font-bold">{item.quantity}</strong></span>
                      <span>•</span>
                      <span>السعر: <strong className="text-brand-700 font-bold">{Number(item.unitPrice || 0).toLocaleString()} د.ع</strong></span>
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="text-left shrink-0 pl-1">
                    <span className="text-xs sm:text-sm font-black text-ink-900 font-mono block leading-tight">
                      {Number((item.quantity || 1) * (item.unitPrice || 0)).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-ink-400 font-mono block leading-none">د.ع</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-ink-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onFullEdit(offer);
            }}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-ink-600 hover:text-ink-900 bg-ink-100 hover:bg-ink-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            title="فتح العرض كاملاً في شاشة الكاشير للتعديل على الكميات والأسعار"
          >
            <span>✏️</span>
            <span>فتح في نقطة البيع للتعديل الكامل</span>
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-ink-600 hover:text-ink-800 hover:bg-ink-100 rounded-xl transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveOrder}
              className="flex-1 sm:flex-none bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'جارٍ الحفظ...' : 'حفظ الترتيب الجديد ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
