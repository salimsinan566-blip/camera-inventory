import React, { useEffect, useRef, useState, useCallback, startTransition } from 'react';
import { findProductByBarcode } from '../services/salesService'; // Reuse barcode search
import { bulkUpdateInventory } from '../services/productsService';
import ProductGrid from './ProductGrid';
import { useUI } from '../contexts/UIContext';

export default function InventoryCheckScreen({ products }) {
  const { toast, confirm } = useUI();
  
  const [targetLocation, setTargetLocation] = useState('store'); // 'store' or 'warehouse'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [countedItems, setCountedItems] = useState([]); // { id, name, originalStoreQty, originalWarehouseQty, countedQty }
  const [scanError, setScanError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleScanSubmit(e) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeInput('');
    setScanError('');

    try {
      const product = await findProductByBarcode(code);
      if (!product) {
        setScanError(`لم يتم العثور على منتج بهذا الباركود: ${code}`);
        return;
      }
      addCountedItem(product);
    } catch (err) {
      setScanError(`خطأ أثناء البحث: ${err.message}`);
    } finally {
      inputRef.current?.focus();
    }
  }

  const addCountedItem = useCallback((product) => {
    startTransition(() => {
      setCountedItems((prev) => {
        const existing = prev.find((item) => item.id === product.id);
        if (existing) {
          // If already in list, increment count by 1
          return prev.map((item) =>
            item.id === product.id ? { ...item, countedQty: item.countedQty + 1 } : item
          );
        }
        // If new to list, start with count 1
        return [
          {
            id: product.id,
            name: product.name,
            originalStoreQty: product.storeQty || 0,
            originalWarehouseQty: product.warehouseQty || 0,
            countedQty: 1,
          },
          ...prev,
        ];
      });
    });
  }, []);

  function updateCountedQuantity(id, newQty) {
    // Allow empty string to let user clear input and type manually
    const qty = newQty === '' ? '' : Math.max(0, Number(newQty) || 0);
    setCountedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, countedQty: qty } : item))
    );
  }

  function removeCountedItem(id) {
    startTransition(() => {
      setCountedItems((prev) => prev.filter((item) => item.id !== id));
    });
  }

  async function handleSaveInventory() {
    if (countedItems.length === 0) return;

    // Ensure no empty strings
    const validItems = countedItems.map(item => ({
      ...item,
      countedQty: item.countedQty === '' ? 0 : Number(item.countedQty)
    }));

    confirm(
      'تأكيد تحديث الجرد',
      `سيتم تحديث كميات ${validItems.length} منتج في قاعدة البيانات لموقع (${targetLocation === 'store' ? 'المحل' : 'المخزن'}). هل أنت متأكد؟`,
      async () => {
        setIsSaving(true);
        try {
          const updates = validItems.map(item => {
            if (targetLocation === 'store') {
              return { id: item.id, storeQty: item.countedQty };
            } else {
              return { id: item.id, warehouseQty: item.countedQty };
            }
          });

          await bulkUpdateInventory(updates);
          toast('تم تحديث أعداد الجرد بنجاح!', 'success');
          setCountedItems([]); // Clear list after successful save
        } catch (error) {
          toast(`فشل تحديث الجرد: ${error.message}`, 'error');
        } finally {
          setIsSaving(false);
          inputRef.current?.focus();
        }
      }
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full" dir="rtl">
      {/* Top Header / Mode Selection */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-ink-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
            </svg>
            جرد المخزون الفعلي
          </h2>
          <p className="text-sm text-ink-500 mt-1">تحديث الأعداد الفعلية المتوفرة في النظام</p>
        </div>

        <div className="flex gap-2 bg-ink-50 p-1.5 rounded-lg border border-ink-200 shadow-inner">
          <button
            onClick={() => setTargetLocation('store')}
            className={`px-6 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${
              targetLocation === 'store'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
            جرد المحل
          </button>
          <button
            onClick={() => setTargetLocation('warehouse')}
            className={`px-6 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${
              targetLocation === 'warehouse'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
            </svg>
            جرد المخزن
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* القسم الأيمن: المنتجات */}
        <div className="lg:w-3/5 xl:w-2/3 flex flex-col h-full gap-4">
          <form onSubmit={handleScanSubmit} className="relative">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-ink-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="input pl-4 pr-12 py-3.5 text-lg shadow-sm border-ink-200 w-full focus:ring-brand-500 focus:border-brand-500"
              placeholder="امسح الباركود لإضافة القطعة للجرد..."
              autoFocus
            />
          </form>

          {scanError && (
            <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded-lg p-3">
              {scanError}
            </div>
          )}

          <div className="flex-1 overflow-auto bg-white rounded-xl border border-ink-200 p-4 shadow-sm">
            <ProductGrid products={products} onSelect={addCountedItem} />
          </div>
        </div>

        {/* القسم الأيسر: القائمة المجردة */}
        <div className="lg:w-2/5 xl:w-1/3 flex flex-col gap-4">
          <div className="card flex-1 flex flex-col shadow-md border-ink-200">
            <div className="p-4 border-b border-ink-100 bg-ink-50/50">
              <h3 className="font-bold text-ink-900 flex justify-between items-center gap-2">
                <span className="leading-tight text-sm sm:text-base">قائمة الجرد ({targetLocation === 'store' ? 'للمحل' : 'للمخزن'})</span>
                <span className="bg-brand-100 text-brand-800 text-xs px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                  {countedItems.length} عناصر
                </span>
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
              {countedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-400">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                  <p className="text-sm">لم يتم إضافة منتجات للجرد</p>
                  <p className="text-xs mt-1">ابحث عن منتج أو امسح الباركود للبدء</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {countedItems.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 bg-white border border-ink-100 p-3 rounded-lg shadow-sm group">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-bold text-ink-900 leading-tight" title={item.name}>{item.name}</p>
                        <button
                          onClick={() => removeCountedItem(item.id)}
                          className="p-1 text-ink-300 hover:text-danger-500 hover:bg-danger-50 rounded-md transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-ink-500">
                          الكمية الحالية ({targetLocation === 'store' ? 'المحل' : 'المخزن'}): 
                          <span className="font-bold text-ink-700 mr-1">
                            {targetLocation === 'store' ? item.originalStoreQty : item.originalWarehouseQty}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-brand-700">العدد الفعلي:</label>
                          <input
                            type="number"
                            min="0"
                            value={item.countedQty}
                            onChange={(e) => updateCountedQuantity(item.id, e.target.value)}
                            className="w-20 border border-brand-300 bg-brand-50 rounded-md px-2 py-1.5 text-center text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-inner"
                            onFocus={(e) => e.target.select()}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-ink-100 bg-white">
              <button
                onClick={handleSaveInventory}
                disabled={isSaving || countedItems.length === 0}
                className={`w-full text-white font-bold text-base py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  targetLocation === 'warehouse' 
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30' 
                    : 'bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-500/30'
                }`}
              >
                {isSaving ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    <span>اعتماد وحفظ الجرد</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
