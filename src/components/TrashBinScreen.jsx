import React, { useState, useMemo } from 'react';
import { useTrashBin } from '../hooks/useTrashBin';
import { useUI } from '../contexts/UIContext';

export default function TrashBinScreen({ currentUser }) {
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
    <div className="h-full flex flex-col p-4 md:p-6 bg-slate-100 overflow-y-auto" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-2xl shadow-xs shrink-0">
            🗑️
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              سلة المحذوفات المركزية
              <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                الاحتفاظ التلقائي لمدة 90 يوماً
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              جميع الفواتير المعلقة، المبيعات، عروض الأسعار، المنتجات، والعملاء المحذوفة يتم حفظها هنا ويمكنك استرجاعها فوراً.
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <button
            onClick={() => setConfirmClearAll(true)}
            disabled={processingId !== null}
            className="px-4 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <span>🧹 تفريغ السلة بالكامل</span>
          </button>
        )}
      </div>

      {/* Main Content Container */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        
        {/* Tabs & Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-thin">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              الكل ({counts.all})
            </button>
            <button
              onClick={() => setActiveTab('draft_sale')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'draft_sale' ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>⏳ الفواتير المعلقة</span>
              <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full text-[11px] font-mono">{counts.draft_sale}</span>
            </button>
            <button
              onClick={() => setActiveTab('confirmed_sale')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'confirmed_sale' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>🧾 فواتير المبيعات</span>
              <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full text-[11px] font-mono">{counts.confirmed_sale}</span>
            </button>
            <button
              onClick={() => setActiveTab('offer')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'offer' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>🏷️ عروض الأسعار</span>
              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full text-[11px] font-mono">{counts.offer}</span>
            </button>
            <button
              onClick={() => setActiveTab('product')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'product' ? 'bg-purple-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>📦 المنتجات</span>
              <span className="bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full text-[11px] font-mono">{counts.product}</span>
            </button>
            <button
              onClick={() => setActiveTab('customer')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'customer' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>👤 العملاء</span>
              <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-full text-[11px] font-mono">{counts.customer}</span>
            </button>
          </div>

          <div className="relative min-w-[280px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 بحث في سلة المحذوفات..."
              className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
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

        {/* List of Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {loading ? (
            <div className="py-24 text-center text-slate-400">
              <div className="animate-spin w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-medium">جاري تحميل عناصر سلة المحذوفات...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-24 text-center text-slate-400">
              <div className="text-6xl mb-3">✨</div>
              <h3 className="text-lg font-bold text-slate-700 mb-1">سلة المحذوفات نظيفة تماماً</h3>
              <p className="text-xs text-slate-500">لا توجد أي عناصر محذوفة مطابقة حالياً</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isProcessing = processingId === item.id;
              const isSaleOrDraft = item.itemType === 'draft_sale' || item.itemType === 'confirmed_sale';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-4 md:p-5 border border-slate-200 shadow-2xs hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{getItemBadge(item.itemType)}</div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 mb-1">{item.title}</h4>
                      {item.subtitle && <p className="text-xs text-slate-600 font-medium">{item.subtitle}</p>}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-400 mt-2">
                        <span>👤 حذفها: <strong className="text-slate-700">{item.deletedBy}</strong></span>
                        <span>📅 تاريخ الحذف: {item.deletedDateFormatted} ({item.deletedTimeFormatted})</span>
                        <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">
                          ⏳ متبقي {item.daysRemaining} يوماً
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* زر الاسترجاع إلى الفواتير المعلقة */}
                    {isSaleOrDraft && (
                      <button
                        onClick={() => handleRestore(item, 'to_draft')}
                        disabled={isProcessing}
                        className="px-3.5 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                        title="إرجاع الفاتورة إلى قائمة الفواتير المعلقة في نقطة البيع"
                      >
                        <span>⏳ إرجاع للمعلق</span>
                      </button>
                    )}

                    {/* زر الاسترجاع المباشر */}
                    <button
                      onClick={() => handleRestore(item, 'original')}
                      disabled={isProcessing}
                      className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      title="استرجاع العنصر لمكانه السابق"
                    >
                      <span>🔄 استرجاع</span>
                    </button>

                    {/* زر الحذف النهائي */}
                    <button
                      onClick={() => handleDeletePermanently(item)}
                      disabled={isProcessing}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                      title="حذف نهائي"
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
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي العناصر في السلة: <strong className="text-slate-800">{items.length}</strong></span>
          <span>يتم الحذف النهائي التلقائي بعد مرور 90 يوماً من تاريخ الحذف</span>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center animate-scale-up">
            <div className="text-5xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">تفريغ سلة المحذوفات بالكامل؟</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              سيتم حذف جميع العناصر الموجودة في السلة بشكل نهائي من قاعدة البيانات ولا يمكن استرجاعها أبداً. هل أنت متأكد؟
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={handleClearAll}
                disabled={processingId === 'all'}
                className="flex-1 py-2.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                نعم، تفريغ السلة
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 py-2.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
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
