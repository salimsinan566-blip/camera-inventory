import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * نافذة عرض ملصق الباركود لمنتج واحد، مع زر طباعة.
 * الطباعة تستخدم CSS خاص بحيث ما تطبع إلا الملصق نفسه (مو باقي الصفحة).
 * props: product, onClose
 */
export default function BarcodeLabel({ product, onClose }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128',
        width: 2,
        height: 60,
        fontSize: 14,
        margin: 8,
        displayValue: true,
      });
    }
  }, [product.barcode]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 print:shadow-none print:p-0">
        <div id="barcode-label-print" className="text-center border border-brand-100 rounded p-4">
          <p className="text-sm font-medium text-ink-900 mb-1 truncate">{product.name}</p>
          <p className="text-xs text-ink-500 mb-2">{product.sku}</p>
          <svg ref={svgRef}></svg>
          <p className="text-sm font-bold text-ink-900 mt-1">
            {Number(product.retailPrice).toLocaleString()}
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4 print:hidden">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-700 hover:text-ink-900">
            إغلاق
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-ink-900 font-bold rounded-lg"
          >
            طباعة
          </button>
        </div>
      </div>

      {/* عند الطباعة: إخفاء كل شي إلا الملصق نفسه */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #barcode-label-print, #barcode-label-print * { visibility: visible; }
          #barcode-label-print {
            position: fixed;
            top: 0;
            left: 0;
            border: none !important;
          }
        }
      `}</style>
    </div>
  );
}
