import React, { useState, useMemo } from 'react';

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

export default function YearlyProfitsChart({
  sales = [],
  expenses = [],
  products = [],
  incomes = [],
  defaultYear = new Date().getFullYear(),
}) {
  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [chartMode, setChartMode] = useState('profits'); // 'profits' | 'comparison'
  const [showTable, setShowTable] = useState(false);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState(null);

  // Available years from sales data
  const availableYears = useMemo(() => {
    const set = new Set([currentRealYear, defaultYear]);
    (sales || []).forEach((s) => {
      const d = toDateSafe(s.createdAt || s.confirmedAt);
      if (d) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [sales, currentRealYear, defaultYear]);

  // Product lookup map for wholesale cost
  const productsMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
    });
    return map;
  }, [products]);

  // Current Stock Capital (المحل والمخزن)
  const currentStockCapital = useMemo(() => {
    return (products || []).reduce((sum, p) => {
      const cost = Number(p.wholesalePrice) || 0;
      const storeQty = Number(p.storeQty) || 0;
      const whQty = Number(p.warehouseQty) || 0;
      return sum + ((storeQty + whQty) * cost);
    }, 0);
  }, [products]);

  // Monthly breakdown for selected year
  const monthlyData = useMemo(() => {
    // 12 months initialized
    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      monthName: MONTH_NAMES_AR[i],
      monthShort: MONTH_SHORT_AR[i],
      revenue: 0,
      cost: 0, // رأس المال المباع
      expenses: 0,
      incomes: 0,
      salesCount: 0,
      netProfit: 0,
      profitMargin: 0,
      trend: { status: 'neutral', diff: 0, percent: 0 },
      hasData: false,
    }));

    // Aggregate Sales
    (sales || []).forEach((sale) => {
      const d = toDateSafe(sale.createdAt || sale.confirmedAt);
      if (!d || d.getFullYear() !== selectedYear) return;
      const mIdx = d.getMonth();
      const m = months[mIdx];

      const saleTotal = Number(sale.total || 0);
      m.revenue += saleTotal;
      m.salesCount += 1;
      m.hasData = true;

      // Calculate wholesale cost (Capital recovered)
      (sale.items || []).forEach((item) => {
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const unitCost = Number(item.wholesalePrice) || Number(prodLookup?.wholesalePrice) || 0;
        const qty = Number(item.quantity) || 0;
        m.cost += (qty * unitCost);
      });
    });

    // Aggregate Expenses
    (expenses || []).forEach((exp) => {
      const d = toDateSafe(exp.date || exp.createdAt);
      if (!d || d.getFullYear() !== selectedYear) return;
      const mIdx = d.getMonth();
      const m = months[mIdx];
      m.expenses += Number(exp.amount || 0);
      m.hasData = true;
    });

    // Aggregate Incomes
    (incomes || []).forEach((inc) => {
      const d = toDateSafe(inc.date || inc.createdAt);
      if (!d || d.getFullYear() !== selectedYear) return;
      const mIdx = d.getMonth();
      const m = months[mIdx];
      m.incomes += Number(inc.amount || 0);
    });

    // Calculate Net Profits, Margins, and Trend vs Previous Month
    let lastActiveMonthProfit = null;

    months.forEach((m, idx) => {
      const grossProfit = m.revenue - m.cost;
      m.netProfit = grossProfit - m.expenses + m.incomes;
      m.profitMargin = m.revenue > 0 ? Math.round((m.netProfit / m.revenue) * 100) : 0;

      // Trend calculation
      if (idx > 0) {
        const prev = months[idx - 1];
        // Calculate diff with previous month if previous had data or if current has data
        if (prev.hasData || m.hasData) {
          const diff = m.netProfit - prev.netProfit;
          const base = Math.abs(prev.netProfit) || 1;
          const percent = Math.round((diff / base) * 100);

          if (diff > 500) {
            m.trend = { status: 'up', diff, percent: Math.min(percent, 999) };
          } else if (diff < -500) {
            m.trend = { status: 'down', diff, percent: Math.max(percent, -999) };
          } else {
            m.trend = { status: 'neutral', diff: 0, percent: 0 };
          }
        }
      }

      if (m.hasData) {
        lastActiveMonthProfit = m.netProfit;
      }
    });

    return months;
  }, [sales, expenses, incomes, selectedYear, productsMap]);

  // Annual Totals & Metrics
  const yearTotals = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalExpenses = 0;
    let totalIncomes = 0;
    let totalSalesCount = 0;
    let activeMonthsCount = 0;

    monthlyData.forEach((m) => {
      totalRevenue += m.revenue;
      totalCost += m.cost;
      totalExpenses += m.expenses;
      totalIncomes += m.incomes;
      totalSalesCount += m.salesCount;
      if (m.hasData) activeMonthsCount += 1;
    });

    const grossProfit = totalRevenue - totalCost;
    const netProfit = grossProfit - totalExpenses + totalIncomes;
    const avgProfitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

    // Return on sold capital (العائد على رأس المال المباع)
    const returnOnCapital = totalCost > 0 ? Math.round((netProfit / totalCost) * 100) : 0;

    // Overall Annual Direction (صاعد أو نازل)
    // Compare second half vs first half or recent active months
    const firstHalfProfit = monthlyData.slice(0, 6).reduce((s, m) => s + m.netProfit, 0);
    const secondHalfProfit = monthlyData.slice(6, 12).reduce((s, m) => s + m.netProfit, 0);

    let annualTrend = 'neutral';
    let annualTrendText = 'المسار متوازن ومستقر';
    let annualTrendDiff = 0;

    // If we're in the current year, compare recent months with earlier
    const activeMonths = monthlyData.filter(m => m.hasData);
    if (activeMonths.length >= 2) {
      const recent = activeMonths[activeMonths.length - 1];
      const previous = activeMonths[activeMonths.length - 2];
      annualTrendDiff = recent.netProfit - previous.netProfit;
      if (annualTrendDiff > 0) {
        annualTrend = 'up';
        annualTrendText = `أرباحك في مسار صاعد ومستمر ↗️ (+${formatIQD(annualTrendDiff)} د.ع مقارنة بالشهر السابق)`;
      } else if (annualTrendDiff < 0) {
        annualTrend = 'down';
        annualTrendText = `أرباحك في مسار نازل ↘️ (${formatIQD(annualTrendDiff)} د.ع مقارنة بالشهر السابق)`;
      }
    } else if (netProfit > 0) {
      annualTrend = 'up';
      annualTrendText = 'أرباحك في مسار إيجابي صاعد ↗️';
    }

    return {
      totalRevenue,
      totalCost,
      totalExpenses,
      netProfit,
      avgProfitMargin,
      returnOnCapital,
      totalSalesCount,
      activeMonthsCount,
      annualTrend,
      annualTrendText,
    };
  }, [monthlyData]);

  // Scaled max value for SVG rendering
  const maxVal = useMemo(() => {
    let peak = 100000;
    monthlyData.forEach((m) => {
      peak = Math.max(peak, m.revenue, m.cost, m.netProfit, Math.abs(m.netProfit));
    });
    return peak * 1.15; // 15% padding at top
  }, [monthlyData]);

  // SVG Chart Dimensions
  const chartHeight = 240;
  const chartWidth = 720;
  const paddingX = 40;
  const paddingY = 30;
  const innerWidth = chartWidth - (paddingX * 2);
  const innerHeight = chartHeight - (paddingY * 2);
  const colWidth = innerWidth / 12;

  // Active month hover data
  const hoveredMonth = hoveredMonthIndex !== null ? monthlyData[hoveredMonthIndex] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl shadow-2xs">
            📈
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                المسار السنوي للأرباح ورأس المال
              </h2>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                yearTotals.annualTrend === 'up'
                  ? 'bg-emerald-100 text-emerald-800'
                  : yearTotals.annualTrend === 'down'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
              }`}>
                {yearTotals.annualTrend === 'up' && '↗️ صاعد'}
                {yearTotals.annualTrend === 'down' && '↘️ نازل'}
                {yearTotals.annualTrend === 'neutral' && '↔️ مستقر'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              متابعة صعود ونزول الأرباح الشهرية، رأس المال المسترد، ومقارنة التكاليف على مدار السنة
            </p>
          </div>
        </div>

        {/* Year Selector & Chart Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Year select */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <span className="text-xs font-bold text-slate-500 px-2">السنة:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white text-xs font-black text-slate-800 rounded-lg px-3 py-1 border border-slate-200 shadow-2xs outline-none cursor-pointer"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y} {y === currentRealYear ? '(الحالية)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Mode switch */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setChartMode('profits')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMode === 'profits' ? 'bg-white text-emerald-700 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              مسار الأرباح
            </button>
            <button
              type="button"
              onClick={() => setChartMode('comparison')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMode === 'comparison' ? 'bg-white text-emerald-700 shadow-2xs' : 'hover:text-slate-900'
              }`}
            >
              مقارنة مع رأس المال
            </button>
          </div>

          {/* Table toggle */}
          <button
            type="button"
            onClick={() => setShowTable(!showTable)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
              showTable
                ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {showTable ? 'إخفاء الجدول' : 'تفاصيل الأشهر'}
          </button>
        </div>
      </div>

      {/* KPI Cards: 4 Core Metrics */}
      <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-3 border-b border-slate-100 bg-slate-50/30">
        {/* Card 1: Net Profit with Trend */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">صافي أرباح {selectedYear}</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
              yearTotals.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {yearTotals.netProfit >= 0 ? '↗️ نمو إيجابي' : '↘️ عجز'}
            </span>
          </div>
          <p className="text-lg sm:text-xl font-black font-mono mt-1 text-emerald-600">
            {formatIQD(yearTotals.netProfit)} <span className="text-xs font-normal text-slate-400">د.ع</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            هامش الربح: <strong className="text-slate-700 font-bold">{yearTotals.avgProfitMargin}%</strong>
          </p>
        </div>

        {/* Card 2: Total Revenue */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500">إجمالي المبيعات (الإيرادات)</span>
          <p className="text-lg sm:text-xl font-black font-mono mt-1 text-slate-900">
            {formatIQD(yearTotals.totalRevenue)} <span className="text-xs font-normal text-slate-400">د.ع</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            عدد الفواتير: <strong className="text-slate-700 font-bold">{yearTotals.totalSalesCount}</strong>
          </p>
        </div>

        {/* Card 3: Sold Capital (Cost of goods sold) */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">رأس المال المباع المسترد</span>
            <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded">
              التكلفة
            </span>
          </div>
          <p className="text-lg sm:text-xl font-black font-mono mt-1 text-amber-700">
            {formatIQD(yearTotals.totalCost)} <span className="text-xs font-normal text-slate-400">د.ع</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            العائد على رأس المال: <strong className="text-amber-800 font-bold">+{yearTotals.returnOnCapital}%</strong>
          </p>
        </div>

        {/* Card 4: Current Capital in Stock */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">رأس مال المخزون الحالي</span>
            <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-1.5 py-0.5 rounded">
              المحل + المخزن
            </span>
          </div>
          <p className="text-lg sm:text-xl font-black font-mono mt-1 text-blue-700">
            {formatIQD(currentStockCapital)} <span className="text-xs font-normal text-slate-400">د.ع</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            قيمة البضاعة المخزنة الحالية بالتكلفة
          </p>
        </div>
      </div>

      {/* Trajectory Status Bar */}
      <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-emerald-50/70 via-slate-50 to-emerald-50/70 border-b border-slate-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <span className="font-bold text-slate-700">تقييم المسار المالي:</span>
          <span className="text-slate-600 font-medium">{yearTotals.annualTrendText}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 font-medium">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            أرباح صاعدة ↗️
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            أرباح نازلة ↘️
          </span>
          {chartMode === 'comparison' && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                المبيعات
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                رأس المال المباع
              </span>
            </>
          )}
        </div>
      </div>

      {/* SVG Interactive Chart Area */}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto select-none"
            style={{ maxHeight: '280px' }}
          >
            <defs>
              <linearGradient id="profitGradUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="profitGradDown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
              const y = chartHeight - paddingY - (ratio * innerHeight);
              const labelVal = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={chartWidth - paddingX}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeDasharray="4 4"
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
                    {labelVal >= 1000000 ? `${(labelVal / 1000000).toFixed(1)}M` : `${Math.round(labelVal / 1000)}k`}
                  </text>
                </g>
              );
            })}

            {/* Zero Base Line */}
            <line
              x1={paddingX}
              y1={chartHeight - paddingY}
              x2={chartWidth - paddingX}
              y2={chartHeight - paddingY}
              stroke="#cbd5e1"
              strokeWidth="1.5"
            />

            {/* Monthly Columns */}
            {monthlyData.map((m, i) => {
              const xCenter = paddingX + (i * colWidth) + (colWidth / 2);
              const isHovered = hoveredMonthIndex === i;
              const isCurrentMonth = selectedYear === currentRealYear && i === currentRealMonth;

              // Height calculations
              const profitH = maxVal > 0 ? (Math.abs(m.netProfit) / maxVal) * innerHeight : 0;
              const profitY = chartHeight - paddingY - profitH;

              const revenueH = maxVal > 0 ? (m.revenue / maxVal) * innerHeight : 0;
              const revenueY = chartHeight - paddingY - revenueH;

              const costH = maxVal > 0 ? (m.cost / maxVal) * innerHeight : 0;
              const costY = chartHeight - paddingY - costH;

              const isUp = m.trend.status === 'up';
              const isDown = m.trend.status === 'down';

              return (
                <g
                  key={m.monthIndex}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredMonthIndex(i)}
                  onMouseLeave={() => setHoveredMonthIndex(null)}
                >
                  {/* Hover background column indicator */}
                  {isHovered && (
                    <rect
                      x={paddingX + (i * colWidth)}
                      y={paddingY}
                      width={colWidth}
                      height={innerHeight}
                      fill="#f8fafc"
                      rx="6"
                    />
                  )}

                  {/* Current month indicator border */}
                  {isCurrentMonth && (
                    <rect
                      x={paddingX + (i * colWidth) + 2}
                      y={paddingY}
                      width={colWidth - 4}
                      height={innerHeight}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      rx="6"
                    />
                  )}

                  {/* Mode 1: Profit Focus */}
                  {chartMode === 'profits' ? (
                    <>
                      {/* Main Profit Bar */}
                      {m.hasData && profitH > 0 && (
                        <rect
                          x={xCenter - 14}
                          y={profitY}
                          width={28}
                          height={profitH}
                          fill={m.netProfit >= 0 ? 'url(#profitGradUp)' : 'url(#profitGradDown)'}
                          rx="5"
                          filter={isHovered ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' : undefined}
                          className="transition-all duration-200"
                        />
                      )}

                      {/* Trend Badge / Indicator on top of bar */}
                      {m.hasData && (
                        <g>
                          <circle
                            cx={xCenter}
                            cy={Math.max(profitY - 12, paddingY - 10)}
                            r="8"
                            fill={isUp ? '#dcfce7' : isDown ? '#ffe4e6' : '#f1f5f9'}
                            stroke={isUp ? '#10b981' : isDown ? '#f43f5e' : '#94a3b8'}
                            strokeWidth="1"
                          />
                          <text
                            x={xCenter}
                            y={Math.max(profitY - 9, paddingY - 7)}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="bold"
                            fill={isUp ? '#065f46' : isDown ? '#9f1239' : '#475569'}
                          >
                            {isUp ? '↗' : isDown ? '↘' : '•'}
                          </text>
                        </g>
                      )}
                    </>
                  ) : (
                    /* Mode 2: Triple Comparison: Revenue, Cost, Profit */
                    <>
                      {/* Revenue Bar */}
                      {m.revenue > 0 && (
                        <rect
                          x={xCenter - 16}
                          y={revenueY}
                          width={10}
                          height={revenueH}
                          fill="url(#revenueGrad)"
                          rx="3"
                        />
                      )}

                      {/* Cost (Capital) Bar */}
                      {m.cost > 0 && (
                        <rect
                          x={xCenter - 5}
                          y={costY}
                          width={10}
                          height={costH}
                          fill="url(#costGrad)"
                          rx="3"
                        />
                      )}

                      {/* Profit Bar */}
                      {m.hasData && profitH > 0 && (
                        <rect
                          x={xCenter + 6}
                          y={profitY}
                          width={10}
                          height={profitH}
                          fill={m.netProfit >= 0 ? 'url(#profitGradUp)' : 'url(#profitGradDown)'}
                          rx="3"
                        />
                      )}
                    </>
                  )}

                  {/* Month Label on X-Axis */}
                  <text
                    x={xCenter}
                    y={chartHeight - paddingY + 16}
                    textAnchor="middle"
                    fontSize={isHovered ? '11' : '10'}
                    fontWeight={isHovered || isCurrentMonth ? 'bold' : 'normal'}
                    fill={isCurrentMonth ? '#4f46e5' : isHovered ? '#0f172a' : '#64748b'}
                  >
                    {m.monthShort}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hover Floating Details Card */}
        {hoveredMonth && (
          <div className="mt-3 p-3 bg-slate-900 text-white rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-amber-300">
                📅 شهر {hoveredMonth.monthName} ({selectedYear})
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                hoveredMonth.trend.status === 'up'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : hoveredMonth.trend.status === 'down'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-700 text-slate-300'
              }`}>
                {hoveredMonth.trend.status === 'up' && `صاعد ↗️ (+${hoveredMonth.trend.percent}%)`}
                {hoveredMonth.trend.status === 'down' && `نازل ↘️ (${hoveredMonth.trend.percent}%)`}
                {hoveredMonth.trend.status === 'neutral' && 'مستقر ↔️'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400">صافي الربح: </span>
                <strong className={hoveredMonth.netProfit >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                  {formatIQD(hoveredMonth.netProfit)} د.ع
                </strong>
              </div>

              <div>
                <span className="text-slate-400">المبيعات: </span>
                <strong className="text-blue-300">{formatIQD(hoveredMonth.revenue)} د.ع</strong>
              </div>

              <div>
                <span className="text-slate-400">رأس المال المباع: </span>
                <strong className="text-amber-300">{formatIQD(hoveredMonth.cost)} د.ع</strong>
              </div>

              <div>
                <span className="text-slate-400">المصاريف: </span>
                <strong className="text-rose-300">{formatIQD(hoveredMonth.expenses)} د.ع</strong>
              </div>

              <div>
                <span className="text-slate-400">الهامش: </span>
                <strong className="text-purple-300">{hoveredMonth.profitMargin}%</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Detailed Months Table */}
      {showTable && (
        <div className="border-t border-slate-200 overflow-x-auto bg-slate-50/50">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-black">
              <tr>
                <th className="p-3">الشهر</th>
                <th className="p-3">المبيعات (الإيراد)</th>
                <th className="p-3">رأس المال المباع (التكلفة)</th>
                <th className="p-3">المصاريف التشغيلية</th>
                <th className="p-3">صافي الربح</th>
                <th className="p-3">هامش الربح %</th>
                <th className="p-3">مؤشر المسار (صعود/نزول)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {monthlyData.map((m) => (
                <tr key={m.monthIndex} className="hover:bg-white transition-colors">
                  <td className="p-3 font-sans font-bold text-slate-900">
                    {m.monthName}
                  </td>
                  <td className="p-3 font-bold text-slate-800">
                    {formatIQD(m.revenue)} د.ع
                  </td>
                  <td className="p-3 font-bold text-amber-700">
                    {formatIQD(m.cost)} د.ع
                  </td>
                  <td className="p-3 font-medium text-rose-600">
                    {formatIQD(m.expenses)} د.ع
                  </td>
                  <td className={`p-3 font-black ${m.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatIQD(m.netProfit)} د.ع
                  </td>
                  <td className="p-3 font-bold text-slate-700">
                    {m.profitMargin}%
                  </td>
                  <td className="p-3 font-sans">
                    {m.trend.status === 'up' && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                        ↗️ صاعد (+{m.trend.percent}%)
                      </span>
                    )}
                    {m.trend.status === 'down' && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full text-[11px]">
                        ↘️ نازل ({m.trend.percent}%)
                      </span>
                    )}
                    {m.trend.status === 'neutral' && (
                      <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px]">
                        ↔️ مستقر
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-200/70 font-black text-slate-900 border-t-2 border-slate-300 font-mono">
              <tr>
                <td className="p-3 font-sans">الإجمالي السنوي</td>
                <td className="p-3">{formatIQD(yearTotals.totalRevenue)} د.ع</td>
                <td className="p-3 text-amber-800">{formatIQD(yearTotals.totalCost)} د.ع</td>
                <td className="p-3 text-rose-700">{formatIQD(yearTotals.totalExpenses)} د.ع</td>
                <td className="p-3 text-emerald-700">{formatIQD(yearTotals.netProfit)} د.ع</td>
                <td className="p-3">{yearTotals.avgProfitMargin}%</td>
                <td className="p-3 font-sans text-xs">
                  {yearTotals.annualTrend === 'up' ? '↗️ مسار سنوي صاعد' : yearTotals.annualTrend === 'down' ? '↘️ مسار سنوي متراجع' : '↔️ مسار متوازن'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
