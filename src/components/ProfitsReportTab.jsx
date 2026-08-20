import React, { useState, useMemo } from 'react';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

export default function ProfitsReportTab({ sales = [], products = [], expenses = [], onViewSale }) {
  const [period, setPeriod] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [subView, setSubView] = useState('invoices'); // 'invoices' | 'products' | 'gifts'
  const [searchQuery, setSearchQuery] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Products lookup map for fallback wholesale/cost prices
  const productsMap = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
    });
    return map;
  }, [products]);

  // Filter Sales according to selected period
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const date = toDateSafe(s.createdAt);
      if (!date) return true;
      const dateStr = date.toISOString().slice(0, 10);
      const monthStr = date.toISOString().slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return date >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [sales, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Filter Expenses according to selected period
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const dateStr = (e.date || e.createdAt || '').slice(0, 10);
      const monthStr = (e.date || e.createdAt || '').slice(0, 7);

      if (period === 'today') return dateStr === todayStr;
      if (period === 'month') return monthStr === currentMonthStr;
      if (period === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const eDate = new Date(dateStr);
        return eDate >= d;
      }
      if (period === 'custom') {
        if (customFrom && dateStr < customFrom) return false;
        if (customTo && dateStr > customTo) return false;
        return true;
      }
      return true; // 'all'
    });
  }, [expenses, period, customFrom, customTo, todayStr, currentMonthStr]);

  // Extract all complimentary gift items (given at 0 IQD)
  const giftItemsList = useMemo(() => {
    const list = [];
    filteredSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const unitPrice = Number(item.unitPrice || 0);
        if (unitPrice === 0) {
          const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
          const costPrice = Number(item.wholesalePrice) || Number(prodLookup?.wholesalePrice) || 0;
          const qty = Number(item.quantity) || 1;
          const totalGiftCost = qty * costPrice;
          const date = toDateSafe(sale.createdAt);

          list.push({
            id: `gift-${sale.id}-${item.productId || item.sku}-${Math.random()}`,
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            customerName: sale.customerName || 'عميل نقدي',
            date: date,
            dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
            name: item.name,
            sku: item.sku || '—',
            quantity: qty,
            costPrice,
            totalGiftCost,
            saleObj: sale
          });
        }
      });
    });
    return list;
  }, [filteredSales, productsMap]);

  // Total cost of all free gifts in this period
  const totalGiftsCost = useMemo(() => {
    return giftItemsList.reduce((sum, g) => sum + g.totalGiftCost, 0);
  }, [giftItemsList]);

  // Invoice Profit Calculations
  const invoicesProfitList = useMemo(() => {
    return filteredSales.map((sale) => {
      let saleTotalCost = 0;
      const date = toDateSafe(sale.createdAt);

      (sale.items || []).forEach((item) => {
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const costPrice = Number(item.wholesalePrice) || Number(prodLookup?.wholesalePrice) || 0;
        const qty = Number(item.quantity) || 0;
        saleTotalCost += costPrice * qty;
      });

      const totalRevenue = Number(sale.total || 0);
      const grossProfit = totalRevenue - saleTotalCost;
      const profitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

      return {
        ...sale,
        dateObj: date,
        dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
        totalRevenue,
        totalCost: saleTotalCost,
        grossProfit,
        profitMargin: Number(profitMargin)
      };
    });
  }, [filteredSales, productsMap]);

  // Totals for the period
  const totalRevenue = useMemo(() => {
    return invoicesProfitList.reduce((sum, s) => sum + s.totalRevenue, 0);
  }, [invoicesProfitList]);

  const totalCost = useMemo(() => {
    return invoicesProfitList.reduce((sum, s) => sum + s.totalCost, 0);
  }, [invoicesProfitList]);

  const grossProfit = totalRevenue - totalCost;
  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredExpenses]);

  // Total Operating Deductions = General Expenses + Free Gifts Cost (promotional expense)
  const totalOperatingDeductions = totalExpenses + totalGiftsCost;
  const netProfit = grossProfit - totalOperatingDeductions;
  const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const netMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Products Profitability Breakdown (Excluding pure gifts of 0 price to keep ranking clean)
  const productsProfitList = useMemo(() => {
    const map = new Map();

    invoicesProfitList.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const sellingPrice = Number(item.unitPrice || item.price || 0);
        // Exclude free gifts (0 price) from commercial sales profitability ranking
        if (sellingPrice === 0) return;

        const key = item.productId || item.sku || item.name;
        const prodLookup = productsMap.get(item.productId) || productsMap.get(item.sku);
        const costPrice = Number(item.wholesalePrice) || Number(prodLookup?.wholesalePrice) || 0;
        const qty = Number(item.quantity || 0);
        const lineRevenue = Number(item.lineTotal || (qty * sellingPrice) || 0);
        const lineCost = qty * costPrice;
        const lineProfit = lineRevenue - lineCost;

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name: item.name,
            sku: item.sku || '—',
            cameraType: item.cameraType || prodLookup?.cameraType || 'عام',
            costPrice,
            avgSellingPrice: sellingPrice,
            totalQty: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            salesCount: 0
          });
        }

        const entry = map.get(key);
        entry.totalQty += qty;
        entry.totalRevenue += lineRevenue;
        entry.totalCost += lineCost;
        entry.totalProfit += lineProfit;
        entry.salesCount += 1;
      });
    });

    return Array.from(map.values())
      .filter((p) => p.totalRevenue > 0)
      .map((p) => ({
        ...p,
        profitMargin: p.totalRevenue > 0 ? ((p.totalProfit / p.totalRevenue) * 100).toFixed(1) : '0.0',
        profitShare: grossProfit > 0 ? ((p.totalProfit / grossProfit) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit);
  }, [invoicesProfitList, productsMap, grossProfit]);

  // Filtered lists by search
  const displayedInvoices = useMemo(() => {
    if (!searchQuery) return invoicesProfitList;
    const q = searchQuery.toLowerCase().trim();
    return invoicesProfitList.filter((s) => {
      const nameMatch = (s.customerName || '').toLowerCase().includes(q);
      const numMatch = String(s.invoiceNumber).includes(q);
      return nameMatch || numMatch;
    });
  }, [invoicesProfitList, searchQuery]);

  const displayedProducts = useMemo(() => {
    if (!searchQuery) return productsProfitList;
    const q = searchQuery.toLowerCase().trim();
    return productsProfitList.filter((p) => {
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const skuMatch = (p.sku || '').toLowerCase().includes(q);
      return nameMatch || skuMatch;
    });
  }, [productsProfitList, searchQuery]);

  const displayedGifts = useMemo(() => {
    if (!searchQuery) return giftItemsList;
    const q = searchQuery.toLowerCase().trim();
    return giftItemsList.filter((g) => {
      const nameMatch = (g.name || '').toLowerCase().includes(q);
      const customerMatch = (g.customerName || '').toLowerCase().includes(q);
      const numMatch = String(g.invoiceNumber).includes(q);
      return nameMatch || customerMatch || numMatch;
    });
  }, [giftItemsList, searchQuery]);

  const getPeriodLabel = () => {
    if (period === 'today') return 'اليوم';
    if (period === 'week') return 'آخر 7 أيام';
    if (period === 'month') return 'الشهر الحالي';
    if (period === 'all') return 'السجل الكامل';
    return `من ${customFrom || 'البداية'} إلى ${customTo || 'الآن'}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">تحليل الأرباح وهوامش الربحية</span>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">صفحة تقرير الأرباح الصافية</h2>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'today' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الأسبوع
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الشهر الحالي
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setPeriod('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'custom' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              مخصص
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs print:hidden"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center gap-3 text-xs font-bold text-slate-700">
          <span>من تاريخ:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
          />
          <span>إلى تاريخ:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="p-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
          />
        </div>
      )}

      {/* 5 Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Total Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي المبيعات</span>
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-bold">
              💳
            </span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-900 block">
              {formatIQD(totalRevenue)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              قيمة الفواتير المباعة
            </span>
          </div>
        </div>

        {/* Card 2: Cost of Goods Sold (COGS) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">تكلفة البضاعة المباعة</span>
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-bold">
              📦
            </span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-700 block">
              {formatIQD(totalCost)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              سعر شراء الأصناف المباعة
            </span>
          </div>
        </div>

        {/* Card 3: Gross Profit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">إجمالي ربح البضاعة</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
              📈
            </span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono tracking-tight text-emerald-700 block">
              +{formatIQD(grossProfit)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className="text-[11px] text-emerald-600 font-bold mt-1 block">
              هامش إجمالي: {grossMargin}%
            </span>
          </div>
        </div>

        {/* Card 4: Operating Expenses + Promotional Gifts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800">المصاريف وتكلفة الهدايا</span>
            <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center text-sm font-bold">
              ☕
            </span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono tracking-tight text-rose-700 block">
              -{formatIQD(totalOperatingDeductions)} <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-mono">
              <span>مصاريف: {formatIQD(totalExpenses)}</span>
              <span>•</span>
              <span className="text-purple-700 font-bold">هدايا: {formatIQD(totalGiftsCost)}</span>
            </div>
          </div>
        </div>

        {/* Card 5: Net Profit Balance */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-900 shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">صافي الربح النهائي</span>
            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
              🏆
            </span>
          </div>
          <div>
            <span className={`text-2xl font-black font-mono tracking-tight block ${netProfit >= 0 ? 'text-slate-950' : 'text-rose-700'}`}>
              {netProfit < 0 ? `-${formatIQD(Math.abs(netProfit))}` : formatIQD(netProfit)}{' '}
              <span className="text-xs font-normal text-slate-500">د.ع</span>
            </span>
            <span className={`text-[11px] font-bold mt-1 block ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              صافي الهامش: {netMargin}%
            </span>
          </div>
        </div>

      </div>

      {/* Sub-view Switcher & Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Filter Tabs */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none">
            <button
              onClick={() => setSubView('invoices')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                subView === 'invoices' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              📑 أرباح الفواتير ({invoicesProfitList.length})
            </button>
            <button
              onClick={() => setSubView('products')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                subView === 'products' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ⭐ المنتجات الأكثر ربحية ({productsProfitList.length})
            </button>
            <button
              onClick={() => setSubView('gifts')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                subView === 'gifts' ? 'bg-purple-900 text-white shadow-xs' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              <span>🎁</span>
              <span>سجل الهدايا والمجانيات ({giftItemsList.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                subView === 'invoices' ? 'بحث برقم الفاتورة أو العميل...' :
                subView === 'products' ? 'بحث باسم الصنف أو SKU...' :
                'بحث في الهدايا أو العميل...'
              }
              className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* SUB-VIEW 1: Invoices Profitability Table */}
        {subView === 'invoices' && (
          displayedInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm font-bold">لا توجد فواتير مسجلة في هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">رقم الفاتورة</th>
                    <th className="p-3.5">التاريخ والوقت</th>
                    <th className="p-3.5">اسم العميل</th>
                    <th className="p-3.5">نوع الفاتورة</th>
                    <th className="p-3.5">قيمة البيع</th>
                    <th className="p-3.5">سعر التكلفة</th>
                    <th className="p-3.5">الربح المحقق</th>
                    <th className="p-3.5">نسبة الهامش</th>
                    <th className="p-3.5 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {displayedInvoices.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-slate-900">#{s.invoiceNumber}</td>
                      <td className="p-3.5 text-slate-500 font-mono">{s.dateFormatted}</td>
                      <td className="p-3.5 font-bold text-slate-800">{s.customerName || 'عميل نقدي'}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          s.invoiceType === 'debt' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {s.invoiceType === 'debt' ? 'آجل' : 'نقدي'}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold font-mono text-slate-900 text-sm">{formatIQD(s.totalRevenue)} د.ع</td>
                      <td className="p-3.5 text-slate-600 font-mono">{formatIQD(s.totalCost)} د.ع</td>
                      <td className="p-3.5 font-bold font-mono text-emerald-700 text-sm">
                        +{formatIQD(s.grossProfit)} د.ع
                      </td>
                      <td className="p-3.5 font-bold font-mono text-slate-700">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          s.profitMargin >= 20 ? 'bg-emerald-50 text-emerald-800 font-bold' :
                          s.profitMargin >= 10 ? 'bg-indigo-50 text-indigo-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {s.profitMargin}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onViewSale(s)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          عرض الفاتورة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* SUB-VIEW 2: Products Profitability Table */}
        {subView === 'products' && (
          displayedProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm font-bold">لا توجد منتجات مسجلة في هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 text-center w-12">#</th>
                    <th className="p-3.5">اسم المنتج / الصنف</th>
                    <th className="p-3.5 text-center">الكمية المباعة</th>
                    <th className="p-3.5">سعر التكلفة</th>
                    <th className="p-3.5">إجمالي المبيعات</th>
                    <th className="p-3.5">إجمالي الربح</th>
                    <th className="p-3.5 text-center">هامش الربح</th>
                    <th className="p-3.5 text-center">حصة الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {displayedProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 text-center font-bold font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          {p.sku && p.sku !== '—' && (
                            <span className="text-slate-500 font-mono">SKU: {p.sku}</span>
                          )}
                          {p.cameraType && p.cameraType !== 'عام' && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-sans">
                              {p.cameraType}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-bold font-mono text-slate-800">{p.totalQty.toLocaleString()}</td>
                      <td className="p-3.5 text-slate-600 font-mono">{formatIQD(p.costPrice)} د.ع</td>
                      <td className="p-3.5 font-bold font-mono text-slate-900 text-sm">{formatIQD(p.totalRevenue)} د.ع</td>
                      <td className={`p-3.5 font-black font-mono text-sm ${p.totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {p.totalProfit < 0 ? `-${formatIQD(Math.abs(p.totalProfit))}` : `+${formatIQD(p.totalProfit)}`} د.ع
                      </td>
                      <td className="p-3.5 text-center font-bold font-mono text-slate-700">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-xs">
                          {p.profitMargin}%
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-600 font-bold text-xs">
                        {p.profitShare}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* SUB-VIEW 3: Free Gift Items Log */}
        {subView === 'gifts' && (
          displayedGifts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm font-bold">لا توجد مواد ممنوحة كهدية أو مجانية في هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right whitespace-nowrap">
                <thead className="bg-purple-50 text-purple-900 font-bold border-b border-purple-200">
                  <tr>
                    <th className="p-3.5">الفاتورة</th>
                    <th className="p-3.5">التاريخ</th>
                    <th className="p-3.5">العميل المستلم</th>
                    <th className="p-3.5">المادة الممنوحة</th>
                    <th className="p-3.5 text-center">الكمية</th>
                    <th className="p-3.5">سعر تكلفة الشراء</th>
                    <th className="p-3.5">إجمالي تكلفة الهدية (مصروف)</th>
                    <th className="p-3.5 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-100">
                  {displayedGifts.map((g) => (
                    <tr key={g.id} className="hover:bg-purple-50/50 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-slate-900">#{g.invoiceNumber}</td>
                      <td className="p-3.5 text-slate-500 font-mono">{g.dateFormatted}</td>
                      <td className="p-3.5 font-bold text-slate-800">{g.customerName}</td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-900">{g.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono mr-1.5">({g.sku})</span>
                      </td>
                      <td className="p-3.5 text-center font-bold font-mono text-purple-900">{g.quantity}</td>
                      <td className="p-3.5 text-slate-600 font-mono">{formatIQD(g.costPrice)} د.ع</td>
                      <td className="p-3.5 font-black font-mono text-purple-800 text-sm">
                        -{formatIQD(g.totalGiftCost)} د.ع
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onViewSale(g.saleObj)}
                          className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          عرض الفاتورة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>

    </div>
  );
}
