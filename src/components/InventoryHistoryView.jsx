import React, { useEffect, useState, useMemo } from 'react';
import { getRecentInventoryLogs, LOG_TYPE_LABELS_AR, LOG_TYPES } from '../services/inventoryLogsService';
import ProductHistoryModal from './ProductHistoryModal';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return isNaN(timestamp.getTime()) ? null : timestamp;
  if (typeof timestamp?.toDate === 'function') {
    try {
      const d = timestamp.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {}
  }
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? null : d;
}

export default function InventoryHistoryView({ onOpenProductHistory }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedProductForModal, setSelectedProductForModal] = useState(null);

  const loadLogs = async () => {
    try {
      const data = await getRecentInventoryLogs(1000);
      setLogs(data);
    } catch (err) {
      console.error('Error fetching inventory history logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadLogs();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const date = toDateSafe(log.createdAt);
      if (dateFrom && date && date < new Date(dateFrom)) return false;
      if (dateTo && date && date > new Date(dateTo + 'T23:59:59')) return false;
      if (selectedType !== 'all' && log.type !== selectedType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (log.productName || '').toLowerCase().includes(q);
        const skuMatch = (log.sku || '').toLowerCase().includes(q);
        const barcodeMatch = (log.barcode || '').toLowerCase().includes(q);
        const reasonMatch = (log.reason || log.notes || '').toLowerCase().includes(q);
        const userMatch = (log.userEmail || log.performedBy || '').toLowerCase().includes(q);
        const customerMatch = (log.customerName || '').toLowerCase().includes(q);
        const techMatch = (log.technicianName || '').toLowerCase().includes(q);
        const supplierMatch = (log.supplierName || '').toLowerCase().includes(q);
        if (!nameMatch && !skuMatch && !barcodeMatch && !reasonMatch && !userMatch && !customerMatch && !techMatch && !supplierMatch) {
          return false;
        }
      }
      return true;
    });
  }, [logs, dateFrom, dateTo, selectedType, searchQuery]);

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case LOG_TYPES.MANUAL_EDIT:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case LOG_TYPES.TRANSFER:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case LOG_TYPES.SALE:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case LOG_TYPES.SALE_RETURN:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case LOG_TYPES.INVENTORY_AUDIT:
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case LOG_TYPES.CREATED:
        return 'bg-green-100 text-green-800 border-green-200';
      case LOG_TYPES.DELETED:
        return 'bg-red-100 text-red-800 border-red-200';
      case LOG_TYPES.PURCHASE:
      case 'purchase_inward':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case LOG_TYPES.CUSTODY_LOAD:
      case LOG_TYPES.CUSTODY_RETURN:
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case LOG_TYPES.CUSTODY_SALE:
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-ink-100 text-ink-800 border-ink-200';
    }
  };

  const formatQtyDisplay = (qty, item) => {
    if (qty === null || qty === undefined) return '—';
    const num = Number(qty || 0);
    if (item?.sellMode === 'meter') {
      const mpr = Number(item.metersPerRoll) || 305;
      if (mpr <= 0) return `${num} م`;
      const rolls = Math.floor(num / mpr);
      const meters = num % mpr;
      if (rolls > 0 && meters > 0) return `${rolls} لفة و ${meters} م`;
      if (rolls > 0) return `${rolls} لفة`;
      return `${meters} م`;
    }
    return `${num} ق`;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-brand-100 rounded-xl shadow-xs p-4 text-center">
          <p className="text-2xl font-black text-ink-900">{filteredLogs.length}</p>
          <p className="text-xs text-ink-500 mt-1 font-medium">عدد الحركات والتعديلات</p>
        </div>
        <div className="bg-white border border-brand-100 rounded-xl shadow-xs p-4 text-center">
          <p className="text-2xl font-black text-amber-700">
            {filteredLogs.filter(l => l.type === LOG_TYPES.MANUAL_EDIT).length}
          </p>
          <p className="text-xs text-ink-500 mt-1 font-medium">عمليات تعديل يدوي</p>
        </div>
        <div className="bg-white border border-brand-100 rounded-xl shadow-xs p-4 text-center">
          <p className="text-2xl font-black text-blue-700">
            {filteredLogs.filter(l => l.type === LOG_TYPES.TRANSFER).length}
          </p>
          <p className="text-xs text-ink-500 mt-1 font-medium">عمليات نقل بين المحل والمخزن</p>
        </div>
        <div className="bg-white border border-brand-100 rounded-xl shadow-xs p-4 text-center">
          <p className="text-2xl font-black text-purple-700">
            {filteredLogs.filter(l => [LOG_TYPES.SALE, LOG_TYPES.CUSTODY_SALE].includes(l.type)).length}
          </p>
          <p className="text-xs text-ink-500 mt-1 font-medium">عمليات بيع وصرف</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-brand-100 rounded-xl shadow-xs p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs font-bold text-ink-700 mb-1">
            بحث بالمنتج، الكود، أو الزبون
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المنتج، الكود، أو اسم الزبون..."
              className="input py-2 w-full pr-10 border-brand-300 focus:border-brand-600 font-medium"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-brand-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-500 mb-1">نوع الحركة</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input py-2 font-medium"
          >
            <option value="all">كل الحركات</option>
            <option value={LOG_TYPES.MANUAL_EDIT}>تعديل يدوي</option>
            <option value={LOG_TYPES.TRANSFER}>نقل بين المحل والمخزن</option>
            <option value={LOG_TYPES.SALE}>حركات بيع (محل/مخزن)</option>
            <option value={LOG_TYPES.CUSTODY_SALE}>بيع من سيارة الفني</option>
            <option value={LOG_TYPES.PURCHASE}>شراء وتوريد</option>
            <option value={LOG_TYPES.CUSTODY_LOAD}>تحميل سيارة فني</option>
            <option value={LOG_TYPES.CUSTODY_RETURN}>إرجاع من سيارة فني</option>
            <option value={LOG_TYPES.INVENTORY_AUDIT}>تسوية جرد</option>
            <option value={LOG_TYPES.CREATED}>إضافة منتج جديد</option>
            <option value={LOG_TYPES.DELETED}>حذف منتج</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-ink-500 mb-1">من تاريخ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input py-2"
          />
        </div>

        <div>
          <label className="block text-xs text-ink-500 mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input py-2"
          />
        </div>

        {(dateFrom || dateTo || selectedType !== 'all' || searchQuery) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setSelectedType('all');
              setSearchQuery('');
            }}
            className="text-xs text-ink-500 hover:text-ink-900 underline mb-2 cursor-pointer font-bold"
          >
            مسح الفلتر
          </button>
        )}
      </div>

      {/* Table Section */}
      <div className="bg-white border border-brand-100 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-brand-100 flex justify-between items-center bg-brand-50/50">
          <h3 className="font-bold text-ink-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>سجل وتاريخ حركات المخزون الشامل</span>
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-ink-600 bg-white px-2.5 py-1 rounded-lg border border-brand-200">
              {filteredLogs.length} حركة مسجلة
            </span>
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors cursor-pointer"
              title="تحديث البيانات"
            >
              <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>تحديث السجل</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-ink-500">
            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm font-medium">جارٍ تحميل سجل الحركات...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-ink-500">
            <div className="w-14 h-14 bg-brand-50 text-brand-400 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-bold text-ink-700">لا توجد حركات مسجلة مطابقة لمعايير البحث</p>
            <p className="text-xs text-ink-400 mt-1">سيتم توثيق أي تعديلات أو حركات جديدة على المخزون هنا تلقائياً</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-brand-50 text-ink-900">
                <tr>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3 text-center">نوع الحركة</th>
                  <th className="p-3 text-center">تعديل المحل (قبل ➔ بعد)</th>
                  <th className="p-3 text-center">تعديل المخزن (قبل ➔ بعد)</th>
                  <th className="p-3 text-center">سعر البيع / القيمة</th>
                  <th className="p-3">الزبون / الجهة</th>
                  <th className="p-3 text-center">سجل المنتج</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const date = toDateSafe(log.createdAt) || new Date();
                  const typeLabel = LOG_TYPE_LABELS_AR[log.type] || log.type;

                  return (
                    <tr key={log.id} className="border-t border-brand-100 hover:bg-brand-50/40 transition-colors">
                      <td className="p-3 text-xs text-ink-600 font-mono">
                        {date.toLocaleString('ar-IQ')}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-ink-900">{log.productName || '—'}</div>
                        <div className="flex gap-2 text-[11px] text-ink-400 font-mono mt-0.5">
                          {log.sku && <span>SKU: {log.sku}</span>}
                          {log.category && <span className="font-sans text-brand-600 bg-brand-50 px-1 rounded">{log.category}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getTypeBadgeStyle(log.type)}`}>
                          {typeLabel}
                        </span>
                      </td>
                      
                      {/* Store change */}
                      <td className="p-3 text-center" dir="ltr">
                        {log.previousStoreQty !== null && log.newStoreQty !== null ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                            <span className="text-ink-500">{formatQtyDisplay(log.previousStoreQty, log)}</span>
                            <span className="text-ink-400">➔</span>
                            <span className="text-brand-700">{formatQtyDisplay(log.newStoreQty, log)}</span>
                            {log.storeQtyDiff !== 0 && (
                              <span className={`text-[10px] px-1 rounded ${log.storeQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                ({log.storeQtyDiff > 0 ? `+${log.storeQtyDiff}` : log.storeQtyDiff})
                              </span>
                            )}
                          </div>
                        ) : log.storeQtyDiff !== null && log.storeQtyDiff !== 0 && !isNaN(log.storeQtyDiff) ? (
                          <span className={`inline-block text-xs font-bold font-mono px-2 py-0.5 rounded ${log.storeQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {log.storeQtyDiff > 0 ? `+${log.storeQtyDiff}` : log.storeQtyDiff} ق
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>

                      {/* Warehouse change */}
                      <td className="p-3 text-center" dir="ltr">
                        {log.previousWarehouseQty !== null && log.newWarehouseQty !== null ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                            <span className="text-ink-500">{formatQtyDisplay(log.previousWarehouseQty, log)}</span>
                            <span className="text-ink-400">➔</span>
                            <span className="text-indigo-700">{formatQtyDisplay(log.newWarehouseQty, log)}</span>
                            {log.warehouseQtyDiff !== 0 && (
                              <span className={`text-[10px] px-1 rounded ${log.warehouseQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                ({log.warehouseQtyDiff > 0 ? `+${log.warehouseQtyDiff}` : log.warehouseQtyDiff})
                              </span>
                            )}
                          </div>
                        ) : log.warehouseQtyDiff !== null && log.warehouseQtyDiff !== 0 && !isNaN(log.warehouseQtyDiff) ? (
                          <span className={`inline-block text-xs font-bold font-mono px-2 py-0.5 rounded ${log.warehouseQtyDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {log.warehouseQtyDiff > 0 ? `+${log.warehouseQtyDiff}` : log.warehouseQtyDiff} ق
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>

                      {/* Selling Price / Value */}
                      <td className="p-3 text-center" dir="ltr">
                        {log.unitPrice > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="font-mono font-black text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                              {Number(log.unitPrice).toLocaleString()} د.ع
                            </span>
                            {Math.abs(log.quantity || 1) > 1 && log.totalPrice > 0 && (
                              <span className="text-[10px] text-ink-400 font-mono mt-0.5">
                                إجمالي: {Number(log.totalPrice).toLocaleString()} د.ع
                              </span>
                            )}
                          </div>
                        ) : log.totalCost > 0 ? (
                          <span className="font-mono font-bold text-xs text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                            {Number(log.totalCost).toLocaleString()} د.ع
                          </span>
                        ) : (
                          <span className="text-ink-300 font-mono">—</span>
                        )}
                      </td>

                      {/* Customer / Party */}
                      <td className="p-3">
                        {log.customerName ? (
                          <div className="inline-flex items-center gap-1.5 font-bold text-ink-900 bg-emerald-50/60 border border-emerald-200/80 px-2.5 py-1 rounded-lg text-xs">
                            <span className="text-emerald-700">👤</span>
                            <span className="text-emerald-950 font-black">{log.customerName}</span>
                          </div>
                        ) : log.technicianName ? (
                          <div className="inline-flex items-center gap-1.5 font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs">
                            <span>🚚</span>
                            <span>الفني: {log.technicianName}</span>
                          </div>
                        ) : log.supplierName ? (
                          <div className="inline-flex items-center gap-1.5 font-bold text-cyan-900 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded-lg text-xs">
                            <span>🏢</span>
                            <span>المورد: {log.supplierName}</span>
                          </div>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedProductForModal({
                            id: log.productId,
                            name: log.productName,
                            sku: log.sku,
                            sellMode: log.sellMode,
                            metersPerRoll: log.metersPerRoll,
                            storeQty: log.newStoreQty ?? log.previousStoreQty ?? 0,
                            warehouseQty: log.newWarehouseQty ?? log.previousWarehouseQty ?? 0,
                          })}
                          className="p-1.5 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                          title="عرض الخط الزمني الكامل لهذا المنتج"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedProductForModal && (
        <ProductHistoryModal
          product={selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}
    </div>
  );
}
