import React, { useState, useEffect, useMemo } from 'react';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function PurchaseShippingModal({
  isOpen,
  onClose,
  items = [],
  currentShippingCost = 0,
  currentDistribute = true,
  currentRemainderTargetIndex = 0,
  currentManualMap = {},
  onApplyShipping,
}) {
  const [shippingCost, setShippingCost] = useState(currentShippingCost ? String(currentShippingCost) : '');
  const [distributeToCost, setDistributeToCost] = useState(currentDistribute !== false);
  const [distributionMode, setDistributionMode] = useState('equal'); // 'equal' | 'proportional' | 'manual'
  const [targetIndex, setTargetIndex] = useState(currentRemainderTargetIndex || 0);
  const [manualMap, setManualMap] = useState({ ...currentManualMap });

  useEffect(() => {
    setShippingCost(currentShippingCost ? String(currentShippingCost) : '');
    setDistributeToCost(currentDistribute !== false);
    setTargetIndex(currentRemainderTargetIndex || 0);
    setManualMap({ ...currentManualMap });
  }, [isOpen, currentShippingCost, currentDistribute, currentRemainderTargetIndex, currentManualMap]);

  const numShipping = Math.max(0, Number(shippingCost) || 0);
  const totalPieces = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const totalItemsCost = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.costPrice) || 0),
    0
  );

  // Computations for preview
  const previewData = useMemo(() => {
    if (numShipping <= 0 || items.length === 0 || totalPieces <= 0) {
      return items.map((it) => ({
        unitShip: 0,
        effectiveCost: Number(it.costPrice) || 0,
      }));
    }

    if (distributionMode === 'proportional' && totalItemsCost > 0) {
      // Proportional to cost
      return items.map((it) => {
        const cost = Number(it.costPrice) || 0;
        const ratio = cost / totalItemsCost;
        const totalItemShipping = ratio * numShipping;
        const qty = Number(it.quantity) || 1;
        const unitShip = Math.round((totalItemShipping / qty) / 250) * 250;
        return {
          unitShip,
          effectiveCost: cost + (distributeToCost ? unitShip : 0),
        };
      });
    }

    if (distributionMode === 'manual') {
      return items.map((it, idx) => {
        const cost = Number(it.costPrice) || 0;
        const unitShip = Number(manualMap[idx]) || 0;
        return {
          unitShip,
          effectiveCost: cost + (distributeToCost ? unitShip : 0),
        };
      });
    }

    // Default: 'equal' per piece with 250 IQD rounding and remainder on target item
    let manualTotal = 0;
    let unoverriddenPieces = 0;
    items.forEach((it, i) => {
      const qty = Number(it.quantity) || 1;
      if (manualMap[i] !== undefined && manualMap[i] !== null && manualMap[i] !== '') {
        manualTotal += (Number(manualMap[i]) || 0) * qty;
      } else {
        unoverriddenPieces += qty;
      }
    });

    let baseEqualPerPiece = 0;
    let totalRemainder = 0;

    if (unoverriddenPieces > 0) {
      const remainingToDistribute = Math.max(0, numShipping - manualTotal);
      const raw = remainingToDistribute / unoverriddenPieces;
      baseEqualPerPiece = Math.floor(raw / 250) * 250;
      const totalBase = baseEqualPerPiece * unoverriddenPieces;
      totalRemainder = Math.max(0, remainingToDistribute - totalBase);
    }

    return items.map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const baseCost = Number(item.costPrice) || 0;
      const isTarget = idx === targetIndex;
      const hasOverride =
        manualMap[idx] !== undefined && manualMap[idx] !== null && manualMap[idx] !== '';

      let unitShip = 0;
      if (hasOverride) {
        unitShip = Number(manualMap[idx]) || 0;
      } else {
        const extra = isTarget && unoverriddenPieces > 0 ? Math.round(totalRemainder / qty) : 0;
        unitShip = baseEqualPerPiece + extra;
      }

      return {
        unitShip,
        effectiveCost: baseCost + (distributeToCost ? unitShip : 0),
      };
    });
  }, [
    items,
    numShipping,
    totalPieces,
    totalItemsCost,
    distributionMode,
    distributeToCost,
    targetIndex,
    manualMap,
  ]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplyShipping({
      shippingCost: numShipping,
      distributeShippingToCost: distributeToCost,
      remainderTargetIndex: targetIndex,
      manualShippingMap: manualMap,
      allocations: previewData,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚚</span>
            <div>
              <h3 className="text-sm md:text-base font-black">
                مصاريف النقل والشحن واحتساب التكلفة الفعلية
              </h3>
              <p className="text-[11px] text-indigo-100">
                توزيع كلفة الشحن على المواد لضبط سعر التكلفة بالمخزن
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-indigo-800 hover:bg-indigo-900 text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Shipping Amount Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200">
            <div>
              <label className="block text-xs font-black text-indigo-950 mb-1">
                إجمالي أجور النقل والشحن (د.ع) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="مثال: 25000"
                  className="w-full p-2.5 bg-white border border-indigo-300 rounded-xl text-base font-black font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">د.ع</span>
              </div>
            </div>

            {/* Distribute checkbox */}
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={distributeToCost}
                  onChange={(e) => setDistributeToCost(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>تضمين أجور الشحن في كلفة المواد بالمخزن (Landed Cost)</span>
              </label>
              <span className="text-[10px] text-slate-500 mt-1">
                عند التفعيل، سيتم حفظ تكلفة القطعة في المخزن بعد إضافة حصتها من الشحن لضمان حساب أرباح دقيق.
              </span>
            </div>
          </div>

          {/* Distribution Mode Options */}
          {numShipping > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">طريقة توزيع الشحن:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDistributionMode('equal')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    distributionMode === 'equal'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  بالتساوي على القطع ⚖️
                </button>

                <button
                  type="button"
                  onClick={() => setDistributionMode('proportional')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    distributionMode === 'proportional'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  حسب نسبة القيمة 📊
                </button>

                <button
                  type="button"
                  onClick={() => setDistributionMode('manual')}
                  className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                    distributionMode === 'manual'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  تخصيص يدوي ✍️
                </button>
              </div>
            </div>
          )}

          {/* Items Preview Table */}
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
              لم تتم إضافة أي مواد إلى الفاتورة بعد.
            </div>
          ) : (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700 block">
                معاينة احتساب تكلفة المواد بعد توزيع الشحن:
              </span>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2 w-8 text-center">#</th>
                      <th className="p-2">المادة</th>
                      <th className="p-2 text-center">الكمية</th>
                      <th className="p-2">سعر الشراء</th>
                      <th className="p-2">حصة الشحن/قطعة</th>
                      <th className="p-2 text-left">التكلفة الفعلية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const qty = Number(it.quantity) || 1;
                      const cost = Number(it.costPrice) || 0;
                      const alloc = previewData[idx] || { unitShip: 0, effectiveCost: cost };

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-2 font-bold text-slate-800">{it.name}</td>
                          <td className="p-2 text-center font-mono font-bold">{qty}</td>
                          <td className="p-2 font-mono text-slate-600">{formatIQD(cost)} د.ع</td>
                          <td className="p-2 font-mono text-blue-700 font-bold">
                            {distributionMode === 'manual' ? (
                              <input
                                type="number"
                                min="0"
                                value={manualMap[idx] || ''}
                                onChange={(e) =>
                                  setManualMap({ ...manualMap, [idx]: e.target.value })
                                }
                                placeholder="0"
                                className="w-20 p-1 border border-slate-300 rounded text-xs font-mono font-bold"
                              />
                            ) : (
                              `+${formatIQD(alloc.unitShip)} د.ع`
                            )}
                          </td>
                          <td className="p-2 text-left font-mono font-black text-indigo-900">
                            {formatIQD(alloc.effectiveCost)} د.ع
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-bold">
            إجمالي الشحن المضاف: {formatIQD(numShipping)} د.ع
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-xs hover:shadow-md transition-all"
            >
              تطبيق أجور النقل ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
