import React, { useState, useMemo } from 'react';
import { isExcludedCable } from '../utils/cableFilter';

function formatIQD(num) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(val) {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d?.getTime()) ? null : d;
    } catch (e) {
      return null;
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function TopSellingProductsChart({
  sales = [],
  products = [],
  salesLoading = false,
  title = 'المنتجات والقطع الأكثر مبيعاً',
  defaultLimit = 10,
  onSelectProduct = null,
}) {
  const [period, setPeriod] = useState('year'); // 'year' | 'month' | 'all'
  const [excludeCables, setExcludeCables] = useState(true);
  const [sortBy, setSortBy] = useState('quantity'); // 'quantity' | 'revenue' | 'profit'
  const [displayCount, setDisplayCount] = useState(defaultLimit);

  // Products lookup map
  const productsMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
    });
    return map;
  }, [products]);

  // Current date markers
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Filter sales by period
  const filteredSales = useMemo(() => {
    if (!sales || sales.length === 0) return [];
    return sales.filter((sale) => {
      const d = toDateSafe(sale.createdAt || sale.confirmedAt);
      if (!d) return true;
      if (period === 'year') {
        return d.getFullYear() === currentYear;
      }
      if (period === 'month') {
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      }
      return true; // 'all'
    });
  }, [sales, period, currentYear, currentMonth]);

  // Aggregate top sold pieces
  const { topProducts, totalPiecesSold, excludedCablesCount } = useMemo(() => {
    const map = new Map();
    let totalPieces = 0;
    let excludedCount = 0;

    for (const sale of filteredSales) {
      for (const item of sale.items || []) {
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const isCable = isExcludedCable(item, prodLookup);

        if (excludeCables && isCable) {
          excludedCount += Number(item.quantity || 0);
          continue; // استثناء كيبل الكات 6 والكوكسيل والكيبلات
        }

        const skuKey = item.sku || item.productId || item.name;
        const qty = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || item.price || 0);
        const wholesaleCost = Number(item.wholesalePrice || prodLookup?.wholesalePrice || 0);
        const revenue = Number(item.lineTotal || (qty * unitPrice) || 0);
        const cost = qty * wholesaleCost;
        const profit = revenue - cost;

        totalPieces += qty;

        const existing = map.get(skuKey) || {
          sku: item.sku || prodLookup?.sku || '—',
          name: item.name || prodLookup?.name || 'صنف غير محدد',
          category: prodLookup?.category || prodLookup?.cameraType || 'أصناف عامة',
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          unitPrice,
          wholesaleCost,
          isCable,
        };

        existing.quantity += qty;
        existing.revenue += revenue;
        existing.cost += cost;
        existing.profit += profit;

        map.set(skuKey, existing);
      }
    }

    const list = Array.from(map.values());

    // فرز النتائج
    list.sort((a, b) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      if (sortBy === 'profit') return b.profit - a.profit;
      return b.quantity - a.quantity; // default: quantity
    });

    return {
      topProducts: list,
      totalPiecesSold: totalPieces,
      excludedCablesCount: excludedCount,
    };
  }, [filteredSales, productsMap, excludeCables, sortBy]);

  const displayedList = topProducts.slice(0, displayCount);
  const maxMetricValue = displayedList.length > 0
    ? (sortBy === 'revenue'
        ? displayedList[0].revenue
        : sortBy === 'profit'
          ? Math.max(...displayedList.map(p => Math.max(p.profit, 1)))
          : displayedList[0].quantity)
    : 1;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/70 to-white">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center font-bold text-lg shadow-2xs">
            🏆
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-slate-900 tracking-tight text-base sm:text-lg">{title}</h3>
              <span className="text-xs bg-violet-100 text-violet-800 font-bold px-2 py-0.5 rounded-full">
                {displayedList.length} مواد
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ترتيب القطع والمعدات الأكثر طلباً بناءً على حركة المبيعات الفعلية
            </p>
          </div>
        </div>

        {/* Controls: Periods & Sort */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'year' ? 'bg-white text-violet-700 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              هذا العام ({currentYear})
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'month' ? 'bg-white text-violet-700 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              هذا الشهر
            </button>
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'all' ? 'bg-white text-violet-700 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              الكل
            </button>
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-2.5 py-1.5 outline-none focus:border-violet-500"
          >
            <option value="quantity">ترتيب حسب: الكمية المباعة</option>
            <option value="revenue">ترتيب حسب: إجمالي الإيراد</option>
            <option value="profit">ترتيب حسب: صافي الربح</option>
          </select>
        </div>
      </div>

      {/* Exclusion Banner & Options */}
      <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-100/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-amber-900">
          <span className="text-base">🛡️</span>
          <span className="font-medium">
            {excludeCables ? (
              <>
                <strong className="font-bold text-amber-950">مستثنى تلقائياً:</strong> كابلات الشبكة <strong>(Cat6)</strong> وكابلات الكاميرات <strong>(Coaxial)</strong> والأسلاك ومبيعات الأمتار واللفات.
              </>
            ) : (
              <span className="text-slate-600">يتم عرض جميع المواد شاملاً الكابلات والأسلاك.</span>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExcludeCables(!excludeCables)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] ${
            excludeCables
              ? 'bg-amber-200/80 hover:bg-amber-300 text-amber-950 shadow-2xs'
              : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
          }`}
          title="تفعيل أو تعطيل استثناء كابلات Cat6 والكوكسيل"
        >
          <span>{excludeCables ? '✓ استثناء الكابلات مفعّل' : 'تفعيل استثناء الكابلات'}</span>
        </button>
      </div>

      {/* Content Area */}
      {salesLoading ? (
        <div className="p-8 text-center text-slate-500">
          <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-medium">جارٍ تحليل المبيعات وحساب الأكثر طلباً...</p>
        </div>
      ) : displayedList.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <p className="text-sm font-medium">لا توجد مبيعات مسجلة في هذه الفترة</p>
        </div>
      ) : (
        <div className="p-4 sm:p-5 space-y-3">
          {displayedList.map((item, index) => {
            const currentVal = sortBy === 'revenue' ? item.revenue : (sortBy === 'profit' ? Math.max(item.profit, 0) : item.quantity);
            const percentage = Math.min(100, Math.max(8, Math.round((currentVal / maxMetricValue) * 100)));

            // Rank styling
            let rankBadge = (
              <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-mono font-black text-xs flex items-center justify-center">
                #{index + 1}
              </span>
            );
            if (index === 0) {
              rankBadge = (
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  🥇
                </span>
              );
            } else if (index === 1) {
              rankBadge = (
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-300 to-slate-500 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  🥈
                </span>
              );
            } else if (index === 2) {
              rankBadge = (
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-700 to-orange-800 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  🥉
                </span>
              );
            }

            return (
              <div
                key={item.sku + index}
                onClick={() => onSelectProduct && onSelectProduct(item)}
                className={`group relative p-3 rounded-xl border border-slate-100 hover:border-violet-300 hover:bg-violet-50/30 transition-all bg-white ${
                  onSelectProduct ? 'cursor-pointer active:scale-[0.99]' : ''
                }`}
                title={onSelectProduct ? `انقر لفتح كشف حركة وتفاصيل: ${item.name}` : undefined}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Left (Product info + Rank) */}
                  <div className="flex items-center gap-3 min-w-0">
                    {rankBadge}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-violet-900 transition-colors">
                          {item.name}
                        </p>
                        {item.category && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        SKU: {item.sku}
                      </p>
                    </div>
                  </div>

                  {/* Right (Metrics: Quantity, Revenue, Profit) */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 justify-end">
                    <div className="text-center sm:text-left">
                      <span className="inline-block px-2.5 py-1 bg-violet-50 border border-violet-100 text-violet-800 text-xs font-black rounded-lg shadow-2xs font-mono">
                        {item.quantity.toLocaleString()} قطعة
                      </span>
                    </div>

                    <div className="text-left min-w-[90px]">
                      <p className="text-xs font-mono font-bold text-slate-800">
                        {formatIQD(item.revenue)} <span className="text-[10px] text-slate-400">د.ع</span>
                      </p>
                      <p className="text-[10px] font-mono text-emerald-600 font-bold">
                        ربح: +{formatIQD(item.profit)} د.ع
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress bar visualizer */}
                <div className="mt-2.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      index === 0
                        ? 'bg-gradient-to-r from-amber-500 to-violet-600'
                        : index === 1
                          ? 'bg-gradient-to-r from-violet-500 to-indigo-600'
                          : 'bg-violet-400'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}

          {/* Expand / Collapse items count */}
          {topProducts.length > defaultLimit && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setDisplayCount(displayCount > defaultLimit ? defaultLimit : Math.min(topProducts.length, 25))}
                className="text-xs text-violet-700 hover:text-violet-800 font-bold bg-violet-50 hover:bg-violet-100 border border-violet-200 px-4 py-1.5 rounded-xl transition-all shadow-2xs"
              >
                {displayCount > defaultLimit
                  ? `عرض أقل (أفضل ${defaultLimit} فقط)`
                  : `عرض المزيد من القطع الأكثر مبيعاً (${topProducts.length - defaultLimit} متبقية)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
