import React, { useState, useMemo } from 'react';

function formatIQD(num) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

const MONTH_NAMES_AR = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

const MONTH_SHORT_AR = [
  'ك2',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'ت1',
  'ت2',
  'ك1',
];

export default function ProductMonthlyMovementChart({
  product = null,
  salesMovements = [],
  purchasesMovements = [],
  defaultYear = new Date().getFullYear(),
}) {
  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState(null);

  // Available years from movements
  const availableYears = useMemo(() => {
    const set = new Set([currentRealYear, defaultYear]);
    [...salesMovements, ...purchasesMovements].forEach((m) => {
      if (m.timestamp) {
        const d = new Date(m.timestamp);
        if (!isNaN(d.getTime())) set.add(d.getFullYear());
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [salesMovements, purchasesMovements, currentRealYear, defaultYear]);

  // Aggregate monthly movements
  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      monthName: MONTH_NAMES_AR[i],
      monthShort: MONTH_SHORT_AR[i],
      soldQty: 0,
      soldRevenue: 0,
      purchasedQty: 0,
      purchasedCost: 0,
      trend: { status: 'neutral', diff: 0 },
    }));

    // Aggregate Sales
    salesMovements.forEach((s) => {
      if (!s.timestamp) return;
      const d = new Date(s.timestamp);
      if (d.getFullYear() !== selectedYear) return;
      const mIdx = d.getMonth();
      months[mIdx].soldQty += Number(s.quantity || 0);
      months[mIdx].soldRevenue += Number(s.totalPrice || 0);
    });

    // Aggregate Purchases
    purchasesMovements.forEach((p) => {
      if (!p.timestamp) return;
      const d = new Date(p.timestamp);
      if (d.getFullYear() !== selectedYear) return;
      const mIdx = d.getMonth();
      months[mIdx].purchasedQty += Number(p.quantity || 0);
      months[mIdx].purchasedCost += Number(p.totalCost || 0);
    });

    // Trend calculation (Sold Qty)
    months.forEach((m, idx) => {
      if (idx > 0) {
        const prev = months[idx - 1];
        const diff = m.soldQty - prev.soldQty;
        if (diff > 0) {
          m.trend = { status: 'up', diff };
        } else if (diff < 0) {
          m.trend = { status: 'down', diff };
        }
      }
    });

    return months;
  }, [salesMovements, purchasesMovements, selectedYear]);

  // Summary totals
  const totals = useMemo(() => {
    let totalSold = 0;
    let totalPurchased = 0;
    let totalRevenue = 0;

    monthlyData.forEach((m) => {
      totalSold += m.soldQty;
      totalPurchased += m.purchasedQty;
      totalRevenue += m.soldRevenue;
    });

    // Overall demand trajectory
    const activeMonths = monthlyData.filter(m => m.soldQty > 0);
    let trendDirection = 'neutral';
    if (activeMonths.length >= 2) {
      const recent = activeMonths[activeMonths.length - 1];
      const prev = activeMonths[activeMonths.length - 2];
      if (recent.soldQty > prev.soldQty) trendDirection = 'up';
      else if (recent.soldQty < prev.soldQty) trendDirection = 'down';
    } else if (totalSold > 0) {
      trendDirection = 'up';
    }

    return { totalSold, totalPurchased, totalRevenue, trendDirection };
  }, [monthlyData]);

  // Max value for SVG scale
  const maxQty = useMemo(() => {
    let peak = 10;
    monthlyData.forEach((m) => {
      peak = Math.max(peak, m.soldQty, m.purchasedQty);
    });
    return Math.ceil(peak * 1.2);
  }, [monthlyData]);

  // SVG dimensions
  const chartHeight = 180;
  const chartWidth = 640;
  const paddingX = 35;
  const paddingY = 25;
  const innerWidth = chartWidth - (paddingX * 2);
  const innerHeight = chartHeight - (paddingY * 2);
  const colWidth = innerWidth / 12;

  const hoveredMonth = hoveredMonthIndex !== null ? monthlyData[hoveredMonthIndex] : null;
  const unitLabel = product?.sellMode === 'meter' ? 'متر' : 'قطعة';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-sky-50/50 to-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-base shadow-2xs">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-slate-900 text-sm sm:text-base">
                الرسم البياني لمسار حركة المادة ({selectedYear})
              </h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                totals.trendDirection === 'up'
                  ? 'bg-emerald-100 text-emerald-800'
                  : totals.trendDirection === 'down'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
              }`}>
                {totals.trendDirection === 'up' && '↗️ إقبال متصاعد'}
                {totals.trendDirection === 'down' && '↘️ إقبال متراجع'}
                {totals.trendDirection === 'neutral' && '↔️ حركة متوازنة'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              تتبع كميات البيع والشراء الشهرية ومؤشر تصاعد الطلب على هذه المادة
            </p>
          </div>
        </div>

        {/* Year Select & Legend */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block"></span> مبيعات
            </span>
            <span className="flex items-center gap-1 font-bold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span> توريد/شراء
            </span>
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="text-xs font-black bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1 outline-none"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[580px]">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none" style={{ maxHeight: '200px' }}>
            {/* Grid lines */}
            {[0.33, 0.66, 1.0].map((ratio) => {
              const y = chartHeight - paddingY - (ratio * innerHeight);
              const labelVal = Math.round(maxQty * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={chartWidth - paddingX}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={chartWidth - paddingX + 5}
                    y={y + 3}
                    fontSize="9"
                    fill="#94a3b8"
                    textAnchor="start"
                    fontFamily="monospace"
                  >
                    {labelVal} {unitLabel}
                  </text>
                </g>
              );
            })}

            {/* Base line */}
            <line
              x1={paddingX}
              y1={chartHeight - paddingY}
              x2={chartWidth - paddingX}
              y2={chartHeight - paddingY}
              stroke="#cbd5e1"
              strokeWidth="1.5"
            />

            {/* Bars for each month */}
            {monthlyData.map((m, i) => {
              const xCenter = paddingX + (i * colWidth) + (colWidth / 2);
              const isHovered = hoveredMonthIndex === i;
              const isCurrent = selectedYear === currentRealYear && i === currentRealMonth;

              const soldH = maxQty > 0 ? (m.soldQty / maxQty) * innerHeight : 0;
              const soldY = chartHeight - paddingY - soldH;

              const purH = maxQty > 0 ? (m.purchasedQty / maxQty) * innerHeight : 0;
              const purY = chartHeight - paddingY - purH;

              return (
                <g
                  key={m.monthIndex}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredMonthIndex(i)}
                  onMouseLeave={() => setHoveredMonthIndex(null)}
                >
                  {isHovered && (
                    <rect
                      x={paddingX + (i * colWidth)}
                      y={paddingY}
                      width={colWidth}
                      height={innerHeight}
                      fill="#f8fafc"
                      rx="4"
                    />
                  )}

                  {/* Sold Bar (Sky) */}
                  {m.soldQty > 0 && (
                    <rect
                      x={xCenter - 11}
                      y={soldY}
                      width={10}
                      height={soldH}
                      fill="#0284c7"
                      rx="3"
                    />
                  )}

                  {/* Purchased Bar (Amber) */}
                  {m.purchasedQty > 0 && (
                    <rect
                      x={xCenter + 1}
                      y={purY}
                      width={10}
                      height={purH}
                      fill="#f59e0b"
                      rx="3"
                    />
                  )}

                  {/* Trend Indicator */}
                  {m.soldQty > 0 && (
                    <text
                      x={xCenter - 6}
                      y={Math.max(soldY - 4, paddingY - 2)}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill={m.trend.status === 'up' ? '#16a34a' : m.trend.status === 'down' ? '#e11d48' : '#64748b'}
                    >
                      {m.trend.status === 'up' ? '↗' : m.trend.status === 'down' ? '↘' : ''}
                    </text>
                  )}

                  {/* Month Label */}
                  <text
                    x={xCenter}
                    y={chartHeight - paddingY + 14}
                    textAnchor="middle"
                    fontSize={isHovered ? '10' : '9'}
                    fontWeight={isHovered || isCurrent ? 'bold' : 'normal'}
                    fill={isCurrent ? '#0284c7' : isHovered ? '#0f172a' : '#64748b'}
                  >
                    {m.monthShort}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hover Tooltip */}
        {hoveredMonth && (
          <div className="mt-2 p-2.5 bg-slate-900 text-white rounded-xl shadow text-xs flex flex-wrap items-center justify-between gap-3 font-mono">
            <span className="font-sans font-bold text-amber-300">
              شهر {hoveredMonth.monthName}:
            </span>
            <span>
              المبيعات: <strong className="text-sky-300">{hoveredMonth.soldQty.toLocaleString()} {unitLabel}</strong> ({formatIQD(hoveredMonth.soldRevenue)} د.ع)
            </span>
            <span>
              الشراء/التوريد: <strong className="text-amber-300">{hoveredMonth.purchasedQty.toLocaleString()} {unitLabel}</strong> ({formatIQD(hoveredMonth.purchasedCost)} د.ع)
            </span>
            {hoveredMonth.trend.status !== 'neutral' && (
              <span className={hoveredMonth.trend.status === 'up' ? 'text-emerald-400 font-sans font-bold' : 'text-rose-400 font-sans font-bold'}>
                {hoveredMonth.trend.status === 'up' ? `↗️ صعود (+${hoveredMonth.trend.diff})` : `↘️ تراجع (${hoveredMonth.trend.diff})`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
