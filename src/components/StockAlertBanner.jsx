import React from 'react';
import { getStockStatus, STOCK_STATUS } from '../models/product';

/**
 * شريط تنبيه أعلى الصفحة يظهر فقط لو فيه منتجات منخفضة أو نافذة.
 * الضغط على أي رقم يطبّق فلتر حالة المخزون المطابق مباشرة.
 * props: products, onFilterByStatus(status)
 */
export default function StockAlertBanner({ products, onFilterByStatus }) {
  const lowCount = products.filter((p) => getStockStatus(p) === STOCK_STATUS.LOW_STOCK).length;
  const outCount = products.filter((p) => getStockStatus(p) === STOCK_STATUS.OUT_OF_STOCK).length;

  if (lowCount === 0 && outCount === 0) return null;

  return (
    <div className="bg-warn-50 border border-warn-500 rounded-lg p-3 mb-4 flex items-center gap-4 text-sm">
      <span className="font-medium text-warn-700">⚠️ تنبيه المخزون:</span>
      {outCount > 0 && (
        <button
          onClick={() => onFilterByStatus(STOCK_STATUS.OUT_OF_STOCK)}
          className="text-danger-700 hover:underline font-medium"
        >
          {outCount} منتج نافذ
        </button>
      )}
      {lowCount > 0 && (
        <button
          onClick={() => onFilterByStatus(STOCK_STATUS.LOW_STOCK)}
          className="text-warn-700 hover:underline font-medium"
        >
          {lowCount} منتج منخفض الكمية
        </button>
      )}
    </div>
  );
}
