import React, { useState } from 'react';
import { getStockStatus, getTotalQuantity, STOCK_STATUS } from '../models/product';
import { moveProductPosition } from '../services/productsService';

const STATUS_BADGE = {
  [STOCK_STATUS.IN_STOCK]: { label: 'متوفر', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  [STOCK_STATUS.LOW_STOCK]: { label: 'منخفض', className: 'bg-warn-50 text-warn-700 border border-warn-100' },
  [STOCK_STATUS.OUT_OF_STOCK]: { label: 'نافذ', className: 'bg-danger-50 text-danger-700 border border-danger-100' },
};

/**
 * جدول عرض المنتجات بأسلوب SaaS.
 * props: products, onEdit, onDelete, onGenerateBarcode, onPrintBarcode, onTransfer, generatingId
 */
export default function ProductList({
  products,
  draftSales = [],
  productCustodyMap = {},
  sortBy = 'custom',
  onSortChange,
  onEdit,
  onDuplicate,
  onDelete,
  onGenerateBarcode,
  onPrintBarcode,
  onTransfer,
  onHistory,
  generatingId,
}) {
  const [reorderingId, setReorderingId] = useState(null);

  const getProductPendingBreakdown = (productId) => {
    if (!draftSales || draftSales.length === 0) return [];
    const map = new Map();
    draftSales
      .filter((d) => d.status === 'suspended' || d.isSuspended)
      .forEach((draft) => {
        const item = draft.items?.find((i) => i.productId === productId);
        if (item && Number(item.quantity) > 0) {
          const name = (draft.customerName || 'عميل نقدي').trim();
          map.set(name, (map.get(name) || 0) + Number(item.quantity));
        }
      });

    const list = [];
    map.forEach((qty, name) => {
      list.push({ name, qty });
    });
    return list;
  };

  const handleHeaderSort = (field) => {
    if (!onSortChange) return;
    let nextSort = field;
    if (field === 'name') {
      nextSort = sortBy === 'name_asc' ? 'custom' : 'name_asc';
    } else if (field === 'storeQty') {
      nextSort = sortBy === 'storeQty_desc' ? 'custom' : 'storeQty_desc';
    } else if (field === 'totalQty') {
      nextSort = sortBy === 'totalQty_desc' ? 'custom' : 'totalQty_desc';
    } else if (field === 'retailPrice') {
      nextSort = sortBy === 'retailPrice_desc' ? 'retailPrice_asc' : 'retailPrice_desc';
    } else if (field === 'wholesalePrice') {
      nextSort = sortBy === 'wholesalePrice_desc' ? 'custom' : 'wholesalePrice_desc';
    } else if (field === 'category') {
      nextSort = sortBy === 'category_asc' ? 'custom' : 'category_asc';
    } else if (field === 'warehouseQty') {
      nextSort = sortBy === 'warehouseQty_desc' ? 'custom' : 'warehouseQty_desc';
    }
    try { localStorage.setItem('inventory_sort_by', nextSort); } catch (e) {}
    onSortChange(nextSort);
  };

  const handleMove = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= products.length) return;
    
    // Switch to custom sort if not already in custom sort
    if (sortBy !== 'custom' && onSortChange) {
      try { localStorage.setItem('inventory_sort_by', 'custom'); } catch (e) {}
      onSortChange('custom');
    }

    const prod = products[index];
    setReorderingId(prod.id);
    try {
      await moveProductPosition(prod.id, targetIndex, products);
    } catch (err) {
      console.error('Error reordering product:', err);
    } finally {
      setReorderingId(null);
    }
  };

  if (products.length === 0) {
    return (
      <div className="card py-16 flex flex-col items-center justify-center text-ink-400">
        <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
        <p className="text-sm font-medium">لا توجد منتجات بعد</p>
        <p className="text-xs mt-1">اضغط "إضافة منتج" للبدء.</p>
      </div>
    );
  }

  const renderSortIndicator = (ascKey, descKey) => {
    if (sortBy === ascKey) return <span className="text-brand-600 font-bold mr-1">▲</span>;
    if (sortBy === descKey) return <span className="text-brand-600 font-bold mr-1">▼</span>;
    return <span className="text-ink-300 opacity-0 group-hover/th:opacity-100 transition-opacity mr-1">↕</span>;
  };

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right whitespace-nowrap">
          <thead className="bg-ink-50/50 text-ink-500 text-xs uppercase tracking-wider select-none">
            <tr>
              <th className="p-3 text-center font-medium rounded-tr-xl w-16" title="ترتيب وتسلسل المادة">
                ترتيب
              </th>
              <th 
                onClick={() => handleHeaderSort('name')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب اسم المنتج"
              >
                <span>المنتج</span>
                {renderSortIndicator('name_asc', 'name_desc')}
              </th>
              <th 
                onClick={() => handleHeaderSort('category')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب القسم"
              >
                <span>النوع</span>
                {renderSortIndicator('category_asc', '')}
              </th>
              <th 
                onClick={() => handleHeaderSort('storeQty')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب كمية المحل"
              >
                <span>المحل</span>
                {renderSortIndicator('storeQty_asc', 'storeQty_desc')}
              </th>
              <th 
                onClick={() => handleHeaderSort('warehouseQty')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب كمية المخزن"
              >
                <span>المخزن</span>
                {renderSortIndicator('', 'warehouseQty_desc')}
              </th>
              <th className="p-4 font-medium">السيارات 🚚</th>
              <th 
                onClick={() => handleHeaderSort('totalQty')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب المجموع الكلي"
              >
                <span>المجموع الكلي</span>
                {renderSortIndicator('totalQty_asc', 'totalQty_desc')}
              </th>
              <th 
                onClick={() => handleHeaderSort('wholesalePrice')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب سعر الجملة"
              >
                <span>الجملة</span>
                {renderSortIndicator('wholesalePrice_asc', 'wholesalePrice_desc')}
              </th>
              <th 
                onClick={() => handleHeaderSort('retailPrice')}
                className="p-4 font-medium cursor-pointer hover:bg-brand-50 hover:text-brand-800 transition-colors group/th"
                title="ترتيب حسب سعر المفرد"
              >
                <span>المفرد</span>
                {renderSortIndicator('retailPrice_asc', 'retailPrice_desc')}
              </th>
              <th className="p-4 font-medium">الحالة</th>
              <th className="p-4 font-medium">الباركود</th>
              <th className="p-4 font-medium rounded-tl-xl text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {products.slice(0, 100).map((product, idx) => {
              const status = getStockStatus(product);
              const badge = STATUS_BADGE[status];
              const pendingBreakdown = Number(product.pendingQty) > 0 ? getProductPendingBreakdown(product.id) : [];
              const custodyInfo = productCustodyMap[product.id];
              const vanQty = Number(custodyInfo?.totalQty) || 0;
              const storeQty = Number(product.storeQty) || 0;
              const warehouseQty = Number(product.warehouseQty) || 0;
              const grandTotal = storeQty + warehouseQty + vanQty;
              const isMoving = reorderingId === product.id;

              return (
                <tr key={product.id} className={`hover:bg-ink-50/50 transition-colors group ${isMoving ? 'opacity-50 bg-brand-50' : ''}`}>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="font-mono text-xs text-ink-400 font-bold ml-1">{idx + 1}</span>
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0 || isMoving}
                          onClick={() => handleMove(idx, 'up')}
                          className="w-5 h-4 bg-slate-100 hover:bg-brand-500 hover:text-white disabled:opacity-20 text-slate-700 rounded text-[9px] flex items-center justify-center transition-colors cursor-pointer"
                          title="تحريك القطعة للأعلى ⬆️"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === products.length - 1 || isMoving}
                          onClick={() => handleMove(idx, 'down')}
                          className="w-5 h-4 bg-slate-100 hover:bg-brand-500 hover:text-white disabled:opacity-20 text-slate-700 rounded text-[9px] flex items-center justify-center transition-colors cursor-pointer"
                          title="تحريك القطعة للأسفل ⬇️"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-start gap-3">
                      {product.imageUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-ink-100 bg-ink-50 mt-0.5">
                           <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <span className="hidden w-full h-full items-center justify-center text-ink-300 font-bold text-sm">
                            {product.name?.charAt(0) || '?'}
                          </span>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg shrink-0 border border-ink-100 bg-ink-50 flex items-center justify-center text-ink-300 font-bold text-sm mt-0.5">
                          {product.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-ink-900 truncate max-w-[240px] text-right" dir="ltr" title={product.name}>{product.name}</p>
                        <p className="text-xs text-ink-500 font-mono mt-0.5 text-right" dir="ltr">{product.sku}</p>
                        {pendingBreakdown.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 max-w-[240px]">
                            {pendingBreakdown.map((cust, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-2xs"
                                title={`معلق لصالح ${cust.name}: ${cust.qty} قطع`}
                              >
                                <span className="text-[9px]">🏷️</span>
                                <span>{cust.name}:</span>
                                <span className="text-amber-700 font-black">{cust.qty} ق</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-ink-600">{product.cameraType}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-ink-50 text-ink-700 px-2.5 py-1 rounded-md font-medium text-xs border border-ink-100">
                        {product.storeQty}
                      </span>
                      {Number(product.pendingQty) > 0 && (
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-bold text-[11px] border border-amber-200" title="معلق في فواتير محجوزة">
                          ({product.pendingQty} معلق)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-ink-50 text-ink-700 px-2.5 py-1 rounded-md font-medium text-xs border border-ink-100">
                      {product.warehouseQty}
                    </span>
                  </td>
                  <td className="p-4">
                    {vanQty > 0 ? (
                      <div
                        className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md font-bold text-xs shadow-2xs cursor-help"
                        title={custodyInfo.breakdown?.map(b => `${b.techName}: ${b.qty} قطع`).join(' | ')}
                      >
                        <span>🚚</span>
                        <span className="font-mono">{vanQty}</span>
                      </div>
                    ) : (
                      <span className="text-ink-400 font-mono text-xs">0</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-ink-900 font-mono text-sm block">
                      {grandTotal}
                    </span>
                    {vanQty > 0 && (
                      <span className="text-[10px] text-indigo-600 font-medium block">
                        (محل: {storeQty} | مخزن: {warehouseQty} | سيارة: {vanQty})
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-ink-600 font-medium font-mono">{Number(product.wholesalePrice).toLocaleString()}</td>
                  <td className="p-4 text-ink-600 font-medium font-mono">{Number(product.retailPrice).toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="p-4">
                    {product.barcode ? (
                      <button
                        onClick={() => onPrintBarcode(product)}
                        className="text-brand-600 hover:text-brand-700 font-medium text-xs flex items-center gap-1 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        {product.barcode}
                      </button>
                    ) : (
                      <button
                        onClick={() => onGenerateBarcode(product)}
                        disabled={generatingId === product.id}
                        className="text-ink-500 hover:text-ink-700 font-medium text-xs bg-ink-50 hover:bg-ink-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {generatingId === product.id ? 'جارٍ التوليد...' : 'توليد باركود'}
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-left">
                    <div className="flex items-center justify-end gap-1">
                      {onHistory && (
                        <button
                          onClick={() => onHistory(product)}
                          className="px-2.5 py-1 flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                          title="كشف حركة وتاريخ هذه المادة الشامل (تحميل سيارات، بيع، شراء، نقل)"
                        >
                          <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>كشف الحركة</span>
                        </button>
                      )}
                      <button
                        onClick={() => onTransfer(product)}
                        className="px-2 py-1.5 flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        نقل
                      </button>
                      <button
                        onClick={() => onEdit(product)}
                        className="px-2 py-1.5 flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        تعديل
                      </button>
                      <button
                        onClick={() => onDuplicate(product)}
                        className="px-2 py-1.5 flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-brand-700 hover:bg-brand-50 rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        تكرار
                      </button>
                      <button
                        onClick={() => onDelete(product)}
                        className="px-2 py-1.5 flex items-center gap-1 text-xs font-medium text-danger-600 hover:text-danger-700 hover:bg-danger-50 rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
