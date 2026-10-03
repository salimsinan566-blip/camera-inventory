import React, { useState, useEffect } from 'react';

function PriceInputCell({ item, index, onUpdateItem }) {
  const cost = Number(item.wholesalePrice || item.purchaseCost || item.costPrice || 0);
  const [localVal, setLocalVal] = useState(item.unitPrice ?? 0);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setLocalVal(item.unitPrice ?? 0);
    }
  }, [item.unitPrice, isEditing]);

  const commitPrice = (valToCommit) => {
    setIsEditing(false);
    const num = Math.max(0, Number(valToCommit) || 0);

    // قاعدة: السعر يقبل 0 فقط (هدية). إذا كان أكبر من 0 ولديه تكلفة، لا يقبل أن يقل عن التكلفة
    if (num > 0 && cost > 0 && num < cost) {
      // يعود للسعر السابق ولا يقبل النزول تحت التكلفة
      const fallback = (item.unitPrice !== undefined && Number(item.unitPrice) >= cost) 
        ? Number(item.unitPrice) 
        : (item.originalPrice && Number(item.originalPrice) >= cost ? Number(item.originalPrice) : cost);
      setLocalVal(fallback);
      onUpdateItem(index, { unitPrice: fallback, attemptedUnderCost: true });
    } else {
      setLocalVal(num);
      onUpdateItem(index, { unitPrice: num });
    }
  };

  const isZero = Number(localVal) === 0;

  return (
    <td className="py-2.5 px-3 min-w-[130px]">
      <div className="relative">
        <input
          type="number"
          min="0"
          step="250"
          value={localVal}
          onFocus={() => setIsEditing(true)}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={(e) => commitPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={`w-full border rounded-xl px-2.5 py-1 text-sm font-bold font-mono outline-none transition-all ${
            isZero
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 focus:ring-2 focus:ring-emerald-500/20'
              : 'bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus:border-indigo-500'
          }`}
          placeholder="0"
        />

        <div className="flex items-center justify-between text-[10px] mt-0.5 px-1 font-mono">
          {isZero && (
            <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] mr-auto">
              🎁 هدية (0 د.ع)
            </span>
          )}
        </div>
      </div>
    </td>
  );
}

export default function PosCartTable({
  items = [],
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onOpenProductsDrawer,
}) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 select-none">
        <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl mb-4 shadow-sm">
          🛒
        </div>
        <h3 className="text-lg font-bold text-slate-700">السلة فارغة</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm font-medium">
          امسح باركود أو ابحث عن منتج في الأعلى للبدء، أو تصفح قائمة المنتجات.
        </p>
        <button
          type="button"
          onClick={onOpenProductsDrawer}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 active:scale-95"
        >
          <span>📦</span>
          <span>تصفح قائمة المنتجات</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <table className="w-full text-right border-collapse select-none">
        {/* ترويسة الجدول */}
        <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-md border-b border-slate-200 text-slate-600 text-xs font-bold">
          <tr>
            <th className="py-2.5 px-3 w-16 text-center"># والترتيب</th>
            <th className="py-2.5 px-3">المنتج / البند</th>
            <th className="py-2.5 px-3 w-32">السعر (د.ع)</th>
            <th className="py-2.5 px-3 w-40 text-center">الكمية</th>
            <th className="py-2.5 px-3 w-36">الإجمالي (د.ع)</th>
            <th className="py-2.5 px-3 w-14 text-center">حذف</th>
          </tr>
        </thead>

        {/* عناصر السلة */}
        <tbody className="divide-y divide-slate-100 text-sm font-medium">
          {items.map((item, index) => {
            const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
            const isFirst = index === 0;
            const isLast = index === items.length - 1;

            return (
              <tr 
                key={item.cartItemId || `${item.productId}_${index}`}
                className="hover:bg-slate-50/80 transition-colors group"
              >
                {/* 1. الرقم والترتيب (أزرار تقديم وتأخير الصف) */}
                <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="font-bold w-4 text-center">{index + 1}</span>
                    <div className="flex flex-col opacity-40 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => onMoveItem(index, index - 1)}
                        className="text-[10px] text-slate-500 hover:text-indigo-600 disabled:opacity-20 cursor-pointer"
                        title="تحريك لأعلى"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => onMoveItem(index, index + 1)}
                        className="text-[10px] text-slate-500 hover:text-indigo-600 disabled:opacity-20 cursor-pointer"
                        title="تحريك لأسفل"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </td>

                {/* 2. اسم المنتج والملاحظات */}
                <td className="py-2.5 px-3 min-w-[200px]">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm leading-tight">
                        {item.name}
                      </span>
                      {Number(item.unitPrice || 0) === 0 && (
                        <span className="text-emerald-700 font-black bg-emerald-50 border border-emerald-300 px-1.5 py-0.2 rounded text-[10px]">
                          🎁 هدية
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      {item.sku && item.sku !== '-' && (
                        <span className="font-mono bg-slate-100 px-1 rounded text-[11px]">
                          {item.sku}
                        </span>
                      )}
                      {item.cameraType && (
                        <span>{item.cameraType}</span>
                      )}
                      {item.isSitePurchase && (
                        <span className="text-amber-600 font-bold bg-amber-50 px-1.5 rounded text-[10px]">
                          شراء موقعي
                        </span>
                      )}
                      {item.isService && (
                        <span className="text-teal-600 font-bold bg-teal-50 px-1.5 rounded text-[10px]">
                          خدمة / أجور
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* 3. السعر (قابل للتعديل مباشرة في الخلية مع قفل التكلفة والسماح بالصفر) */}
                <PriceInputCell item={item} index={index} onUpdateItem={onUpdateItem} />

                {/* 4. الكمية (أزرار + و − مع إدخال رقمي مباشر) */}
                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1 max-w-[130px] mx-auto">
                    <button
                      type="button"
                      onClick={() => onUpdateItem(index, { quantity: Math.max(1, (Number(item.quantity) || 1) - 1) })}
                      className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 border border-slate-200/80 text-slate-700 font-bold text-sm flex items-center justify-center transition-all cursor-pointer active:scale-90"
                      title="إنقاص الكمية"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-12 text-center bg-transparent font-bold font-mono text-sm text-slate-800 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateItem(index, { quantity: (Number(item.quantity) || 1) + 1 })}
                      className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 border border-slate-200/80 text-slate-700 font-bold text-sm flex items-center justify-center transition-all cursor-pointer active:scale-90"
                      title="زيادة الكمية"
                    >
                      +
                    </button>
                  </div>
                </td>

                {/* 5. الإجمالي للبند */}
                <td className="py-2.5 px-3">
                  <span className="font-black text-slate-900 font-mono text-sm">
                    {Number(item.unitPrice || 0) === 0 ? '0' : lineTotal.toLocaleString()}
                  </span>
                </td>

                {/* 6. زر حذف الصف */}
                <td className="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                    title="حذف البند من السلة"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
