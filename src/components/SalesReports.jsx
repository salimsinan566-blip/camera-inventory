import React, { useMemo, useState } from 'react';
import { useSales } from '../hooks/useSales';
import { useProducts } from '../hooks/useProducts';
import { useExpenses } from '../hooks/useExpenses';
import InvoiceReceipt from './InvoiceReceipt';
import ReturnExchangeModal from './ReturnExchangeModal';
import CustomerStatementModal from './CustomerStatementModal';
import AddCustomerModal from './AddCustomerModal';
import CustomerPaymentModal from './CustomerPaymentModal';
import IncomeReportTab from './IncomeReportTab';
import ProfitsReportTab from './ProfitsReportTab';
import { useAuth } from '../hooks/useAuth';
import { useUI } from '../contexts/UIContext';
import { deleteConfirmedSale, revertSaleToSuspended } from '../services/salesService';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

export default function SalesReports() {
  const { sales, loading, error } = useSales();
  const { products } = useProducts();
  const { expenses } = useExpenses();
  const [activeSubTab, setActiveSubTab] = useState('invoices'); // 'invoices' | 'sold-items' | 'income' | 'profits'
  
  // Invoices tab filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterInvoiceType, setFilterInvoiceType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sold Items tab filters
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemDateFrom, setItemDateFrom] = useState('');
  const [itemDateTo, setItemDateTo] = useState('');
  const [itemInvoiceType, setItemInvoiceType] = useState('all');

  const [viewingSale, setViewingSale] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [payingSale, setPayingSale] = useState(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const { user } = useAuth();
  const { confirm, toast } = useUI();

  async function handleDelete(sale) {
    confirm(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف الفاتورة رقم #${sale.invoiceNumber} بشكل نهائي؟ سيتم إرجاع كافة أصنافها إلى المحل.`,
      async () => {
        setIsDeleting(true);
        try {
          await deleteConfirmedSale(sale.id);
          toast('تم حذف الفاتورة وإرجاع الكميات للمحل بنجاح.', 'success');
        } catch (err) {
          toast(`فشل الحذف: ${err.message}`, 'error');
        } finally {
          setIsDeleting(false);
        }
      }
    );
  }

  async function handleRevert(sale) {
    confirm(
      'إرجاع كفاتورة معلقة',
      `هل تريد إرجاع الفاتورة #${sale.invoiceNumber} إلى قائمة المعلقات؟ لن يتم احتسابها في الأرباح وستحجز عناصرها في المخزون.`,
      async () => {
        setIsReverting(true);
        try {
          await revertSaleToSuspended(sale.id);
          toast('تم إرجاع الفاتورة إلى قائمة المعلقات بنجاح.', 'success');
        } catch (err) {
          toast(`فشل الإرجاع: ${err.message}`, 'error');
        } finally {
          setIsReverting(false);
        }
      }
    );
  }

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const date = toDateSafe(sale.createdAt);
      if (!date) return true; // فاتورة حديثة جداً ولسا ما وصلها الـ timestamp من السيرفر
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo && date > new Date(dateTo + 'T23:59:59')) return false;
      if (filterInvoiceType !== 'all') {
        const type = sale.invoiceType || 'cash';
        if (type !== filterInvoiceType) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (sale.customerName || '').toLowerCase().includes(q);
        const invoiceMatch = String(sale.invoiceNumber).includes(q);
        if (!nameMatch && !invoiceMatch) return false;
      }
      return true;
    });
  }, [sales, dateFrom, dateTo, filterInvoiceType, searchQuery]);

  const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);

  const topProducts = useMemo(() => {
    const map = new Map();
    for (const sale of filteredSales) {
      for (const item of sale.items || []) {
        const existing = map.get(item.sku) || { name: item.name, sku: item.sku, quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.lineTotal;
        map.set(item.sku, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [filteredSales]);

  // Flattened sold items across all sales
  const allSoldItems = useMemo(() => {
    const list = [];
    for (const sale of sales) {
      const date = toDateSafe(sale.createdAt);
      for (const item of sale.items || []) {
        list.push({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          customerName: sale.customerName || 'عميل نقدي',
          invoiceType: sale.invoiceType || 'cash',
          date: date,
          sale: sale,
          productId: item.productId,
          name: item.name || 'بدون اسم',
          sku: item.sku || '',
          barcode: item.barcode || '',
          cameraType: item.cameraType || item.category || '',
          sellMode: item.sellMode || (item.metersPerRoll ? 'meter' : 'piece'),
          metersPerRoll: Number(item.metersPerRoll) || 305,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice || item.price || 0),
          lineTotal: Number(item.lineTotal || (Number(item.quantity || 0) * Number(item.unitPrice || item.price || 0)) || 0),
        });
      }
    }
    // Sort by newest date first
    return list.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [sales]);

  // Filtered sold items
  const filteredSoldItems = useMemo(() => {
    return allSoldItems.filter((item) => {
      if (itemDateFrom && item.date && item.date < new Date(itemDateFrom)) return false;
      if (itemDateTo && item.date && item.date > new Date(itemDateTo + 'T23:59:59')) return false;
      if (itemInvoiceType !== 'all') {
        if (item.invoiceType !== itemInvoiceType) return false;
      }
      if (itemSearchQuery) {
        const q = itemSearchQuery.toLowerCase().trim();
        const nameMatch = item.name.toLowerCase().includes(q);
        const skuMatch = item.sku.toLowerCase().includes(q);
        const barcodeMatch = String(item.barcode || '').toLowerCase().includes(q);
        const customerMatch = item.customerName.toLowerCase().includes(q);
        const invoiceMatch = String(item.invoiceNumber).includes(q);
        const catMatch = item.cameraType.toLowerCase().includes(q);

        if (!nameMatch && !skuMatch && !barcodeMatch && !customerMatch && !invoiceMatch && !catMatch) {
          return false;
        }
      }
      return true;
    });
  }, [allSoldItems, itemDateFrom, itemDateTo, itemInvoiceType, itemSearchQuery]);

  // Smart formatting for individual sold item quantity
  const formatSoldQuantity = (item) => {
    const qty = Number(item.quantity) || 0;
    if (item.sellMode === 'meter') {
      const mpr = Number(item.metersPerRoll) || 305;
      if (mpr <= 0) return `${qty.toLocaleString()} متر`;
      const rolls = Math.floor(qty / mpr);
      const meters = qty % mpr;
      if (rolls > 0 && meters > 0) return `${rolls} لفة و ${meters} م`;
      if (rolls > 0) return `${rolls} لفة`;
      return `${meters} م`;
    }
    return `${qty.toLocaleString()} ق`;
  };

  // Smart total units calculation for cables and pieces
  const formatTotalSoldUnits = (itemsList) => {
    let pieces = 0;
    let rolls = 0;
    let meters = 0;

    itemsList.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      if (item.sellMode === 'meter') {
        const mpr = Number(item.metersPerRoll) || 305;
        if (mpr > 0) {
          rolls += Math.floor(qty / mpr);
          meters += qty % mpr;
        } else {
          meters += qty;
        }
      } else {
        pieces += qty;
      }
    });

    if (meters >= 305) {
      rolls += Math.floor(meters / 305);
      meters = meters % 305;
    }

    const parts = [];
    if (pieces > 0) parts.push(`${pieces.toLocaleString()} ق`);
    if (rolls > 0) parts.push(`${rolls.toLocaleString()} لفة`);
    if (meters > 0) parts.push(`${meters.toLocaleString()} م`);

    if (parts.length === 0) return '0 ق';
    return parts.join(' + ');
  };

  // Matched products breakdown for item search query
  const matchedProductsBreakdown = useMemo(() => {
    const map = new Map();
    for (const item of filteredSoldItems) {
      const key = item.productId || item.sku || item.name;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: item.name,
          sku: item.sku,
          cameraType: item.cameraType,
          sellMode: item.sellMode,
          metersPerRoll: item.metersPerRoll,
          totalQty: 0,
          totalAmount: 0,
          salesCount: 0,
          rawItems: []
        });
      }
      const entry = map.get(key);
      entry.totalQty += Number(item.quantity || 0);
      entry.totalAmount += Number(item.lineTotal || 0);
      entry.salesCount += 1;
      entry.rawItems.push(item);
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredSoldItems]);

  // Format single product total quantity
  const formatProductTotalQty = (prod) => {
    const qty = prod.totalQty;
    if (prod.sellMode === 'meter') {
      const mpr = Number(prod.metersPerRoll) || 305;
      if (mpr <= 0) return `${qty.toLocaleString()} م`;
      const rolls = Math.floor(qty / mpr);
      const meters = qty % mpr;
      if (rolls > 0 && meters > 0) return `${rolls} لفة و ${meters} م`;
      if (rolls > 0) return `${rolls} لفة`;
      return `${meters} م`;
    }
    return `${qty.toLocaleString()} قطعة`;
  };

  const totalSoldRevenue = filteredSoldItems.reduce((sum, item) => sum + item.lineTotal, 0);

  if (loading) return <p className="text-ink-500 text-center py-16">جارٍ تحميل سجل المبيعات...</p>;
  if (error) return <p className="text-danger-700 text-center py-16">فشل التحميل: {error}</p>;

  return (
    <div>
      {/* Upper Navigation Tabs */}
      <div className="flex border-b border-brand-200 mb-6 gap-2 bg-white px-4 pt-3 rounded-t-xl shadow-xs overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'invoices'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          سجل الفواتير العام
          <span className="bg-brand-100 text-brand-800 text-xs px-2 py-0.5 rounded-full font-semibold">
            {sales.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('sold-items')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'sold-items'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:text-ink-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          تتبع القطع المباعة
          <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold">
            {allSoldItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('income')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'income'
              ? 'border-emerald-600 text-emerald-700 font-black'
              : 'border-transparent text-ink-500 hover:text-ink-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          كشف الدخل والمقبوضات
        </button>

        <button
          onClick={() => setActiveSubTab('profits')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'profits'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-ink-500 hover:text-ink-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          تقرير الأرباح الصافية
        </button>
      </div>

      {/* TAB 1: General Invoices Ledger */}
      {activeSubTab === 'invoices' && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-ink-900">{filteredSales.length}</p>
              <p className="text-xs text-ink-500 mt-1">عدد الفواتير</p>
            </div>
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-ink-900">{totalRevenue.toLocaleString()} د.ع</p>
              <p className="text-xs text-ink-500 mt-1">إجمالي المبيعات</p>
            </div>
            <button 
              onClick={() => setShowAddCustomer(true)}
              className="col-span-2 md:col-span-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-center hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 font-bold shadow-xs cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
              إضافة عميل جديد
            </button>
            <button 
              onClick={() => setShowStatement(true)}
              className="col-span-2 md:col-span-1 bg-brand-50 border border-brand-200 text-brand-700 rounded-xl p-4 text-center hover:bg-brand-100 transition-colors flex items-center justify-center gap-2 font-bold shadow-xs cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              فتح كشف حساب عميل
            </button>
          </div>

          <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-ink-500 mb-1">من تاريخ</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">نوع الفاتورة</label>
              <select
                value={filterInvoiceType}
                onChange={(e) => setFilterInvoiceType(e.target.value)}
                className="input py-2"
              >
                <option value="all">الكل</option>
                <option value="cash">نقدي</option>
                <option value="debt">ديون (آجل)</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-ink-500 mb-1">بحث</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="اسم العميل أو رقم الفاتورة..."
                className="input py-2 w-full"
              />
            </div>
            {(dateFrom || dateTo || filterInvoiceType !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setFilterInvoiceType('all');
                  setSearchQuery('');
                }}
                className="text-xs text-ink-500 hover:text-ink-900 underline mb-2 cursor-pointer"
              >
                مسح الفلتر
              </button>
            )}
          </div>

          <div className="bg-white border border-brand-100 rounded-xl shadow-sm overflow-hidden mb-6">
            <h3 className="p-4 font-bold text-ink-900 border-b border-brand-100">سجل الفواتير</h3>
            {filteredSales.length === 0 ? (
              <p className="text-center text-ink-500 py-12">لا توجد فواتير بهذا النطاق</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-brand-50 text-ink-900">
                    <tr>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">النوع</th>
                      <th className="p-3">العميل</th>
                      <th className="p-3">عدد الأصناف</th>
                      <th className="p-3">المجموع</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale) => {
                      const date = toDateSafe(sale.createdAt);
                      const isDebt = (sale.invoiceType || 'cash') === 'debt';
                      const totalAmt = Number(sale.total) || 0;
                      const paidAmt = Number(sale.paidAmount) || 0;
                      const remainingAmt = sale.remainingDebt !== undefined ? Number(sale.remainingDebt) : Math.max(0, totalAmt - paidAmt);
                      const isSettled = isDebt && remainingAmt <= 0;

                      return (
                        <tr key={sale.id} className="border-t border-brand-100 hover:bg-brand-50/40 transition-colors">
                          <td className="p-3 font-medium text-ink-900">#{sale.invoiceNumber}</td>
                          <td className="p-3">{date ? date.toLocaleString('ar-IQ') : '—'}</td>
                          <td className="p-3">
                            {isDebt ? (
                              <div className="flex flex-col gap-0.5">
                                {isSettled ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    دين مسدد بالكامل ✓
                                  </span>
                                ) : paidAmt > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title={`مسدد: ${paidAmt.toLocaleString()} د.ع | متبقي: ${remainingAmt.toLocaleString()} د.ع`}>
                                    مسدد جزئياً ({remainingAmt.toLocaleString()} د.ع)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    دين غير مسدد
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                نقدي
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-medium">{sale.customerName || 'عميل نقدي'}</td>
                          <td className="p-3">{sale.items?.length || 0}</td>
                          <td className="p-3">
                            <span className="font-bold text-brand-700 block font-mono">{totalAmt.toLocaleString()} د.ع</span>
                            {isDebt && !isSettled && (
                              <span className="text-[10px] text-rose-600 font-bold block font-mono">
                                (متبقي: {remainingAmt.toLocaleString()} د.ع)
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-2">
                              {isDebt && (
                                <button
                                  onClick={() => setPayingSale(sale)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs ${
                                    isSettled
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  }`}
                                  title={isSettled ? 'عرض سجل الدفعات' : 'تسديد دفعة من هذا الدين'}
                                >
                                  <span>💵</span>
                                  <span>{isSettled ? 'سجل الدفعات' : 'تسديد دين'}</span>
                                </button>
                              )}
                              <button
                                onClick={() => setViewingSale(sale)}
                                className="text-brand-600 hover:text-brand-800 text-xs font-bold underline cursor-pointer"
                              >
                                عرض/طباعة
                              </button>
                              <button
                                onClick={() => setEditingSale(sale)}
                                className="text-warn-600 hover:text-warn-800 text-xs font-bold underline cursor-pointer"
                              >
                                إرجاع/تعديل
                              </button>
                              <button
                                onClick={() => handleRevert(sale)}
                                disabled={isReverting}
                                className="text-indigo-600 hover:text-indigo-800 text-xs font-bold underline disabled:opacity-50 cursor-pointer"
                              >
                                إرجاع للمعلقات
                              </button>
                              <button
                                onClick={() => handleDelete(sale)}
                                disabled={isDeleting}
                                className="text-danger-600 hover:text-danger-800 text-xs font-bold underline disabled:opacity-50 cursor-pointer"
                              >
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
            )}
          </div>

          {topProducts.length > 0 && (
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm overflow-hidden mb-6">
              <h3 className="p-4 font-bold text-ink-900 border-b border-brand-100">
                الأكثر مبيعاً
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-brand-50 text-ink-900">
                    <tr>
                      <th className="p-3">المنتج</th>
                      <th className="p-3">الكمية المباعة</th>
                      <th className="p-3">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.sku} className="border-t border-brand-100">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 font-bold text-brand-700">{p.quantity}</td>
                        <td className="p-3 font-bold">{p.revenue.toLocaleString()} د.ع</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Sold Items Search & Ledger */}
      {activeSubTab === 'sold-items' && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center">
              <p className="text-2xl font-black text-ink-900">{filteredSoldItems.length}</p>
              <p className="text-xs text-ink-500 mt-1 font-medium">عدد عمليات البيع المطابقة</p>
            </div>
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center" dir="rtl">
              <p className="text-xl font-black text-brand-700">{formatTotalSoldUnits(filteredSoldItems)}</p>
              <p className="text-xs text-ink-500 mt-1 font-medium">إجمالي الكميات المباعة</p>
            </div>
            <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 text-center" dir="rtl">
              <p className="text-2xl font-black text-emerald-700">{Math.round(totalSoldRevenue).toLocaleString()} د.ع</p>
              <p className="text-xs text-ink-500 mt-1 font-medium">إجمالي مبالغ المبيعات</p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white border border-brand-100 rounded-xl shadow-sm p-4 mb-5 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs font-bold text-ink-700 mb-1">
                بحث في المواد المباعة (الاسم، الباركود، أو SKU)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder="اكتب اسم القطعة (مثلاً: كامرة 5 ميكا)، الباركود، أو SKU..."
                  className="input py-2.5 w-full pr-10 border-brand-300 focus:border-brand-600 font-medium text-ink-900"
                  autoFocus
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-brand-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1">من تاريخ</label>
              <input
                type="date"
                value={itemDateFrom}
                onChange={(e) => setItemDateFrom(e.target.value)}
                className="input py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={itemDateTo}
                onChange={(e) => setItemDateTo(e.target.value)}
                className="input py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1">نوع الفاتورة</label>
              <select
                value={itemInvoiceType}
                onChange={(e) => setItemInvoiceType(e.target.value)}
                className="input py-2"
              >
                <option value="all">الكل</option>
                <option value="cash">نقدي</option>
                <option value="debt">ديون (آجل)</option>
              </select>
            </div>

            {(itemDateFrom || itemDateTo || itemInvoiceType !== 'all' || itemSearchQuery) && (
              <button
                onClick={() => {
                  setItemDateFrom('');
                  setItemDateTo('');
                  setItemInvoiceType('all');
                  setItemSearchQuery('');
                }}
                className="text-xs text-ink-500 hover:text-ink-900 underline mb-2 cursor-pointer font-bold"
              >
                مسح الفلتر
              </button>
            )}
          </div>

          {/* Prominent Search Summary Banner */}
          {itemSearchQuery.trim() && (
            <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-950 text-white rounded-2xl p-5 mb-5 shadow-lg border border-brand-700/40 relative overflow-hidden" dir="rtl">
              <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-brand-500/10 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-400/30 flex items-center justify-center text-brand-300 shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs text-brand-200 block font-medium">ملخص نتائج البحث عن:</span>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                      "{itemSearchQuery}"
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 font-mono">
                  <div className="bg-white/10 backdrop-blur-xs px-3.5 py-1.5 rounded-xl border border-white/10 text-center">
                    <span className="text-[11px] text-brand-200 block font-sans">إجمالي القطع المباعة</span>
                    <span className="text-lg font-black text-amber-300">
                      {formatTotalSoldUnits(filteredSoldItems)}
                    </span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xs px-3.5 py-1.5 rounded-xl border border-white/10 text-center">
                    <span className="text-[11px] text-brand-200 block font-sans">عدد الفواتير</span>
                    <span className="text-lg font-black text-white">
                      {new Set(filteredSoldItems.map(i => i.saleId)).size} فاتورة
                    </span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xs px-3.5 py-1.5 rounded-xl border border-white/10 text-center">
                    <span className="text-[11px] text-brand-200 block font-sans">المبلغ الإجمالي</span>
                    <span className="text-lg font-black text-emerald-300">
                      {Math.round(totalSoldRevenue).toLocaleString()} د.ع
                    </span>
                  </div>
                </div>
              </div>

              {/* Breakdown badges if multiple products matched */}
              {matchedProductsBreakdown.length > 0 && (
                <div>
                  <p className="text-xs text-brand-200 mb-2 font-bold flex items-center gap-1.5">
                    <span>تفصيل مبيعات الأصناف المطابقة ({matchedProductsBreakdown.length} صنف):</span>
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                    {matchedProductsBreakdown.map((prod) => {
                      const isCurrentlyFiltered = itemSearchQuery.trim().toLowerCase() === prod.name.toLowerCase();
                      return (
                        <button
                          key={prod.id}
                          onClick={() => setItemSearchQuery(prod.name)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                            isCurrentlyFiltered
                              ? 'bg-brand-500 text-white border-brand-300 shadow-sm ring-2 ring-brand-300/40'
                              : 'bg-white/10 hover:bg-white/20 text-white border-white/15 hover:border-white/30'
                          }`}
                          title="اضغط لحصر البحث على هذا الصنف فقط"
                        >
                          <span>{prod.name}</span>
                          <span className="bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded text-[11px] border border-amber-400/30">
                            {formatProductTotalQty(prod)}
                          </span>
                          <span className="text-white/70 text-[11px]">
                            ({Math.round(prod.totalAmount).toLocaleString()} د.ع)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sold Items Table */}
          <div className="bg-white border border-brand-100 rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b border-brand-100 flex justify-between items-center bg-brand-50/50">
              <h3 className="font-bold text-ink-900 flex items-center gap-2">
                <span>سجل تفاصيل القطع المباعة</span>
                {itemSearchQuery && (
                  <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-md font-normal">
                    نتائج البحث عن: "{itemSearchQuery}"
                  </span>
                )}
              </h3>
              <span className="text-xs font-medium text-ink-500">
                {filteredSoldItems.length} عملية بيع
              </span>
            </div>

            {filteredSoldItems.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 bg-brand-50 text-brand-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-base font-bold text-ink-700">لا توجد قطع مباعة مطابقة لمعايير البحث</p>
                <p className="text-xs text-ink-500 mt-1">جرّب تغيير كلمات البحث أو مسح الفلاتر</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-brand-50 text-ink-900">
                    <tr>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">العميل</th>
                      <th className="p-3">اسم المادة المباعة</th>
                      <th className="p-3 text-center">الكمية المباعة</th>
                      <th className="p-3 text-center">سعر البيع</th>
                      <th className="p-3 text-center">إجمالي البند</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSoldItems.map((item, idx) => {
                      return (
                        <tr key={`${item.saleId}-${item.productId || item.sku}-${idx}`} className="border-t border-brand-100 hover:bg-brand-50/40 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-ink-900">#{item.invoiceNumber}</span>
                            {item.invoiceType === 'debt' ? (
                              <span className="mr-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-warn-100 text-warn-800 border border-warn-200">
                                آجل
                              </span>
                            ) : (
                              <span className="mr-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                نقدي
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-ink-600 font-mono">
                            {item.date ? item.date.toLocaleString('ar-IQ') : '—'}
                          </td>
                          <td className="p-3 font-medium text-ink-900">
                            {item.customerName}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-ink-900">{item.name}</div>
                            <div className="flex gap-2 text-[11px] text-ink-500 mt-0.5">
                              {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                              {item.cameraType && <span className="text-brand-600 bg-brand-50 px-1.5 py-0.2 rounded font-sans">قسم: {item.cameraType}</span>}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-brand-700" dir="rtl">
                            {formatSoldQuantity(item)}
                          </td>
                          <td className="p-3 text-center font-mono font-medium text-ink-800">
                            {Math.round(item.unitPrice).toLocaleString()} د.ع
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">
                            {Math.round(item.lineTotal).toLocaleString()} د.ع
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setViewingSale(item.sale)}
                              className="bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 px-3 py-1 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="عرض تفاصيل الفاتورة وطباعتها"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              عرض الفاتورة
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredSoldItems.length > 0 && (
                    <tfoot className="bg-brand-50/90 border-t-2 border-brand-200 font-bold text-ink-900">
                      <tr>
                        <td colSpan="4" className="p-3 text-right">
                          المجموع الكلي ({filteredSoldItems.length} عملية بيع)
                        </td>
                        <td className="p-3 text-center text-brand-700" dir="rtl">
                          {formatTotalSoldUnits(filteredSoldItems)}
                        </td>
                        <td className="p-3 text-center text-ink-400">—</td>
                        <td className="p-3 text-center font-mono text-emerald-700">
                          {Math.round(totalSoldRevenue).toLocaleString()} د.ع
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Income & Cash Flow Report */}
      {activeSubTab === 'income' && (
        <IncomeReportTab
          sales={sales}
          expenses={expenses}
          onViewSale={setViewingSale}
        />
      )}

      {/* TAB 4: Net Profits & Margin Analysis Report */}
      {activeSubTab === 'profits' && (
        <ProfitsReportTab
          sales={sales}
          products={products}
          expenses={expenses}
          onViewSale={setViewingSale}
        />
      )}

      {/* Shared Modals */}
      {viewingSale && <InvoiceReceipt sale={viewingSale} onClose={() => setViewingSale(null)} />}
      
      {editingSale && (
        <ReturnExchangeModal
          sale={editingSale}
          cashierEmail={user?.email || 'Unknown'}
          onClose={() => setEditingSale(null)}
          onSaveSuccess={(updatedSale) => {
            setEditingSale(null);
          }}
        />
      )}

      {showStatement && (
        <CustomerStatementModal onClose={() => setShowStatement(false)} />
      )}

      {showAddCustomer && (
        <AddCustomerModal onClose={() => setShowAddCustomer(false)} />
      )}

      {payingSale && (
        <CustomerPaymentModal
          sale={payingSale}
          onClose={() => setPayingSale(null)}
        />
      )}
    </div>
  );
}
