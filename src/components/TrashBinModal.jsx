import React, { useState, useMemo } from 'react';
import { useTrashBin } from '../hooks/useTrashBin';
import { useUI } from '../contexts/UIContext';

export default function TrashBinModal({ isOpen, onClose, currentUser }) {
  const { toast } = useUI();
  const { items, loading, restoreItem, deleteItemPermanently, clearAll } = useTrashBin();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const currentUserEmail = currentUser?.email || currentUser?.displayName || 'سالم سنان';

  // تصفية العناصر بحسب التبويب والبحث
  const filteredItems = useMemo(() => {
    let list = [...items];

    if (activeTab === 'draft_sale') {
      list = list.filter((i) => i.itemType === 'draft_sale');
    } else if (activeTab === 'confirmed_sale') {
      list = list.filter((i) => i.itemType === 'confirmed_sale');
    } else if (activeTab === 'offer') {
      list = list.filter((i) => i.itemType === 'offer');
    } else if (activeTab === 'product') {
      list = list.filter((i) => i.itemType === 'product');
    } else if (activeTab === 'customer') {
      list = list.filter((i) => i.itemType === 'customer');
    } else if (activeTab === 'others') {
      list = list.filter((i) => !['draft_sale', 'confirmed_sale', 'offer', 'product', 'customer'].includes(i.itemType));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(q) ||
          (i.subtitle || '').toLowerCase().includes(q) ||
          (i.deletedBy || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [items, activeTab, searchQuery]);

  // إحصائيات الأقسام
  const counts = useMemo(() => {
    return {
      all: items.length,
      draft_sale: items.filter((i) => i.itemType === 'draft_sale').length,
      confirmed_sale: items.filter((i) => i.itemType === 'confirmed_sale').length,
      offer: items.filter((i) => i.itemType === 'offer').length,
      product: items.filter((i) => i.itemType === 'product').length,
      customer: items.filter((i) => i.itemType === 'customer').length,
      others: items.filter((i) => !['draft_sale', 'confirmed_sale', 'offer', 'product', 'customer'].includes(i.itemType)).length,
    };
  }, [items]);

  if (!isOpen) return null;

  // معالجة الاسترجاع
  const handleRestore = async (item, mode = 'original') => {
    setProcessingId(item.id);
    try {
      await restoreItem(item, mode, currentUserEmail);
      if (mode === 'to_draft' || item.itemType === 'draft_sale') {
        toast('تم إرجاع الفاتورة إلى قائمة الفواتير المعلقة بنجاح! ⏳✨', 'success');
      } else {
        toast(`تم استرجاع "${item.title}" إلى مكانه الأصلي بنجاح! 🔄🎉`, 'success');
      }
    } catch (err) {
      console.error('Failed to restore item:', err);
      toast(`فشل الاسترجاع: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // معالجة الحذف النهائي
  const handleDeletePermanently = async (item) => {
    if (!window.confirm(`هل أنت متأكد من الحذف النهائي لـ "${item.title}"؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }
    setProcessingId(item.id);
    try {
      await deleteItemPermanently(item.id);
      toast('تم الحذف النهائي للعنصر بنجاح.', 'info');
    } catch (err) {
      console.error('Failed to permanently delete:', err);
      toast(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // معالجة تفريغ السلة
  const handleClearAll = async () => {
    setProcessingId('all');
    try {
      await clearAll();
      setConfirmClearAll(false);
      toast('تم تفريغ سلة المحذوفات بالكامل! 🧹', 'success');
    } catch (err) {
      console.error('Failed to clear trash:', err);
      toast(`فشل تفريغ السلة: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const getItemBadge = (itemType) => {
    switch (itemType) {
      case 'draft_sale':
        return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-md">⏳ فاتورة معلقة</span>;
      case 'confirmed_sale':
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-md">🧾 فاتورة مبيعات</span>;
      case 'offer':
        return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">🏷️ عرض سعر</span>;
      case 'product':
        return <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-md">📦 منتج</span>;
      case 'customer':
        return <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-md">👤 عميل</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md">📄 سجل مالي</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" dir="rtl">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-xl shadow-xs">
              🗑️
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                سلة المحذوفات المركزية
                <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                  الاحتفاظ لمدة 90 يوماً
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                يمكنك استرجاع أي فاتورة معلقة، مبيعات، عروض أسعار، منتجات أو عملاء بنقرة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                disabled={processingId !== null}
                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>🧹 تفريغ السلة</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs & Search Filter */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === 'all' ? 'bg-brand-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({counts.all})
            </button>
            <button
              onClick={() => setActiveTab('draft_sale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === 'draft_sale' ? 'bg-amber-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>⏳ المعلقة</span>
              <span className="bg-amber-200/50 text-current px-1.5 py-0.2 rounded-full text-[10px]">{counts.draft_sale}</span>
            </button>
            <button
              onClick={() => setActiveTab('confirmed_sale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === 'confirmed_sale' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🧾 المبيعات</span>
              <span className="bg-emerald-200/50 text-current px-1.5 py-0.2 rounded-full text-[10px]">{counts.confirmed_sale}</span>
            </button>
            <button
              onClick={() => setActiveTab('offer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === 'offer' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🏷️ العروض</span>
              <span className="bg-blue-200/50 text-current px-1.5 py-0.2 rounded-full text-[10px]">{counts.offer}</span>
            </button>
            <button
              onClick={() => setActiveTab('product')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === 'product' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>📦 المنتجات</span>
              <span className="bg-purple-200/50 text-current px-1.5 py-0.2 rounded-full text-[10px]">{counts.product}</span>
            </button>
            <button
              onClick={() => setActiveTab('customer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === 'customer' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>👤 العملاء</span>
              <span className="bg-indigo-200/50 text-current px-1.5 py-0.2 rounded-full text-[10px]">{counts.customer}</span>
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 بحث في المحذوفات..."
              className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <div className="animate-spin w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-medium">جاري تحميل عناصر سلة المحذوفات...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <div className="text-5xl mb-3">✨</div>
              <h3 className="text-base font-bold text-slate-700 mb-1">سلة المحذوفات نظيفة تماماً</h3>
              <p className="text-xs text-slate-500">لا توجد أي عناصر محذوفة مطابقة حالياً</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isProcessing = processingId === item.id;
              const isSaleOrDraft = item.itemType === 'draft_sale' || item.itemType === 'confirmed_sale';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="mt-0.5">{getItemBadge(item.itemType)}</div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 mb-0.5">{item.title}</h4>
                      {item.subtitle && <p className="text-xs text-slate-600 font-medium">{item.subtitle}</p>}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 mt-1.5">
                        <span>👤 حذفها: <strong className="text-slate-600">{item.deletedBy}</strong></span>
                        <span>📅 تاريخ الحذف: {item.deletedDateFormatted} ({item.deletedTimeFormatted})</span>
                        <span className="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-sm">
                          ⏳ متبقي {item.daysRemaining} يوماً
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* زر الاسترجاع كـ فاتورة معلقة */}
                    {isSaleOrDraft && (
                      <button
                        onClick={() => handleRestore(item, 'to_draft')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                        title="إرجاع الفاتورة إلى قائمة الفواتير المعلقة في نقطة البيع"
                      >
                        <span>⏳ إرجاع للمعلق</span>
                      </button>
                    )}

                    {/* زر الاسترجاع المباشر */}
                    <button
                      onClick={() => handleRestore(item, 'original')}
                      disabled={isProcessing}
                      className="px-3.5 py-1.5 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                      title="استرجاع العنصر لمكانه السابق"
                    >
                      <span>🔄 استرجاع</span>
                    </button>

                    {/* زر الحذف النهائي */}
                    <button
                      onClick={() => handleDeletePermanently(item)}
                      disabled={isProcessing}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="حذف نهائي لا يمكن التراجع عنه"
                    >
                      <span className="text-base">❌</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي العناصر المحذوفة: <strong>{items.length}</strong></span>
          <span>يتم حذف العناصر تلقائياً بعد مرور 90 يوماً من تاريخ الحذف</span>
        </div>
      </div>

      {/* مودال تأكيد تفريغ السلة */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center animate-scale-up">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-base font-bold text-slate-900 mb-2">تفريغ سلة المحذوفات بالكامل؟</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              سيتم حذف جميع العناصر الموجودة في السلة بشكل نهائي ولا يمكن استرجاعها أبداً. هل أنت متأكد؟
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleClearAll}
                disabled={processingId === 'all'}
                className="flex-1 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                نعم، تفريغ السلة
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
