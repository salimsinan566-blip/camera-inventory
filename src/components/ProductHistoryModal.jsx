import React, { useEffect, useState, useMemo } from 'react';
import { getComprehensiveProductHistory, LOG_TYPE_LABELS_AR, LOG_TYPES } from '../services/inventoryLogsService';

export default function ProductHistoryModal({ product, onClose }) {
  const [logs, setLogs] = useState([]);
  const [activeCustodies, setActiveCustodies] = useState([]);
  const [totalInCustody, setTotalInCustody] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'sales' | 'custody' | 'inflow' | 'audits'
  const [searchTerm, setSearchTerm] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      if (!product?.id) return;
      setLoading(true);
      try {
        const result = await getComprehensiveProductHistory(product, 150);
        setLogs(result.logs || []);
        setActiveCustodies(result.activeCustodies || []);
        setTotalInCustody(result.totalInCustody || 0);
      } catch (err) {
        console.error('Error loading comprehensive product history:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [product]);

  const formatQty = (qty) => {
    const num = Number(qty || 0);
    if (product.sellMode === 'meter') {
      const mpr = Number(product.metersPerRoll) || 305;
      if (mpr <= 0) return `${num} م`;
      const rolls = Math.floor(num / mpr);
      const meters = num % mpr;
      if (rolls > 0 && meters > 0) return `${rolls} لفة و ${meters} م`;
      if (rolls > 0) return `${rolls} لفة`;
      return `${meters} م`;
    }
    return `${num} ق`;
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let list = logs;

    // Filter category
    if (activeFilter === 'sales') {
      list = list.filter(l => [LOG_TYPES.SALE, LOG_TYPES.CUSTODY_SALE, LOG_TYPES.SALE_RETURN].includes(l.type));
    } else if (activeFilter === 'custody') {
      list = list.filter(l => [LOG_TYPES.CUSTODY_LOAD, LOG_TYPES.CUSTODY_RETURN, LOG_TYPES.CUSTODY_SALE].includes(l.type) || l.source === 'custody');
    } else if (activeFilter === 'inflow') {
      list = list.filter(l => [LOG_TYPES.PURCHASE, LOG_TYPES.TRANSFER, LOG_TYPES.EXCEL_IMPORT, LOG_TYPES.CREATED].includes(l.type));
    } else if (activeFilter === 'audits') {
      list = list.filter(l => [LOG_TYPES.INVENTORY_AUDIT, LOG_TYPES.MANUAL_EDIT].includes(l.type));
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(l => 
        (l.typeLabel || '').toLowerCase().includes(term) ||
        (l.technicianName || '').toLowerCase().includes(term) ||
        (l.customerName || '').toLowerCase().includes(term) ||
        (l.referenceNumber || '').toLowerCase().includes(term) ||
        (l.reason || '').toLowerCase().includes(term) ||
        (l.userEmail || '').toLowerCase().includes(term)
      );
    }

    return list;
  }, [logs, activeFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let sold = 0;
    let loadedToVans = 0;
    let returnedFromVans = 0;
    let purchased = 0;

    logs.forEach(l => {
      const q = Math.abs(Number(l.quantity) || 0);
      if (l.type === LOG_TYPES.SALE || l.type === LOG_TYPES.CUSTODY_SALE) sold += q;
      if (l.type === LOG_TYPES.CUSTODY_LOAD) loadedToVans += q;
      if (l.type === LOG_TYPES.CUSTODY_RETURN) returnedFromVans += q;
      if (l.type === LOG_TYPES.PURCHASE || l.type === LOG_TYPES.CREATED) purchased += q;
    });

    return { sold, loadedToVans, returnedFromVans, purchased };
  }, [logs]);

  const getTypeVisuals = (type, source) => {
    switch (type) {
      case LOG_TYPES.CUSTODY_LOAD:
        return {
          icon: '📦➡️🚚',
          label: 'تحميل لسيارة الفني',
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dotClass: 'bg-indigo-600',
        };
      case LOG_TYPES.CUSTODY_RETURN:
        return {
          icon: '🚚➡️🏢',
          label: 'إرجاع من سيارة الفني',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          dotClass: 'bg-amber-600',
        };
      case LOG_TYPES.CUSTODY_SALE:
        return {
          icon: '🚘➡️👤',
          label: 'بيع من سيارة الفني',
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
          dotClass: 'bg-purple-600',
        };
      case LOG_TYPES.SALE:
        return {
          icon: '🛒➡️👤',
          label: 'حركة بيع (محل/مخزن)',
          badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
          dotClass: 'bg-sky-600',
        };
      case LOG_TYPES.SALE_RETURN:
        return {
          icon: '🔄',
          label: 'إرجاع مبيعات',
          badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
          dotClass: 'bg-teal-600',
        };
      case LOG_TYPES.PURCHASE:
        return {
          icon: '📥',
          label: 'شراء وتوريد',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dotClass: 'bg-emerald-600',
        };
      case LOG_TYPES.TRANSFER:
        return {
          icon: '🔄🏢🏪',
          label: 'نقل داخلي',
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
          dotClass: 'bg-blue-600',
        };
      case LOG_TYPES.INVENTORY_AUDIT:
        return {
          icon: '⚖️',
          label: 'تسوية جرد',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
          dotClass: 'bg-rose-600',
        };
      case LOG_TYPES.MANUAL_EDIT:
        return {
          icon: '✏️',
          label: 'تعديل يدوي',
          badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
          dotClass: 'bg-orange-600',
        };
      case LOG_TYPES.CREATED:
        return {
          icon: '✨',
          label: 'إنشاء منتج',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dotClass: 'bg-emerald-600',
        };
      default:
        return {
          icon: '📋',
          label: LOG_TYPE_LABELS_AR[type] || 'حركة',
          badgeClass: 'bg-slate-50 text-slate-800 border-slate-200',
          dotClass: 'bg-slate-600',
        };
    }
  };

  const totalAllLocations = (Number(product.storeQty) || 0) + (Number(product.warehouseQty) || 0) + totalInCustody;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-900/60 backdrop-blur-xs" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-brand-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-brand-900 to-indigo-950 text-white flex justify-between items-start relative shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-white/10 rounded-lg text-brand-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div>
                <h3 className="font-black text-base sm:text-lg text-white leading-tight">
                  سجل حركة وتاريخ القطعة الشامل
                </h3>
                <p className="text-xs text-brand-200 mt-0.5 font-bold flex items-center gap-2 flex-wrap">
                  <span>{product.name}</span>
                  {product.sku && (
                    <span className="bg-white/15 px-1.5 py-0.2 rounded font-mono text-[11px] text-white">
                      SKU: {product.sku}
                    </span>
                  )}
                  {product.category && (
                    <span className="bg-indigo-500/25 px-1.5 py-0.2 rounded text-[11px] text-indigo-200">
                      {product.category}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Stock Distribution Banner */}
        <div className="bg-slate-50/90 border-b border-slate-200 p-3 sm:p-3.5 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {/* Store */}
            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-bold block">🏪 المحل</span>
              <span className="text-sm sm:text-base font-black text-brand-700 font-mono">
                {formatQty(product.storeQty)}
              </span>
            </div>

            {/* Warehouse */}
            <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-bold block">🏢 المخزن</span>
              <span className="text-sm sm:text-base font-black text-indigo-700 font-mono">
                {formatQty(product.warehouseQty)}
              </span>
            </div>

            {/* Technicians Custody (Clickable for breakdown) */}
            <div 
              onClick={() => activeCustodies.length > 0 && setShowTechDetails(!showTechDetails)}
              className={`p-2 rounded-xl border shadow-2xs transition-all ${
                activeCustodies.length > 0 ? 'bg-amber-50/80 border-amber-300 cursor-pointer hover:bg-amber-100/80' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-[11px] text-amber-900 font-bold">🚚 سيارات الفنيين</span>
                {activeCustodies.length > 0 && (
                  <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded-full font-bold">
                    {activeCustodies.length}
                  </span>
                )}
              </div>
              <span className="text-sm sm:text-base font-black text-amber-700 font-mono block">
                {formatQty(totalInCustody)}
              </span>
            </div>

            {/* Total Overall */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-2 rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[11px] text-emerald-800 font-bold block">📦 الإجمالي الكلي</span>
              <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">
                {formatQty(totalAllLocations)}
              </span>
            </div>
          </div>

          {/* Active Technicians Custody Accordion */}
          {showTechDetails && activeCustodies.length > 0 && (
            <div className="mt-2.5 p-2.5 bg-amber-50/90 rounded-xl border border-amber-200 animate-in fade-in slide-in-from-top-1 duration-150">
              <p className="text-[11px] font-bold text-amber-900 mb-1.5 flex items-center gap-1">
                <span>🚘</span>
                <span>تفصيل القطع الموجودة حالياً في سيارات الفنيين:</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeCustodies.map((tech) => (
                  <span 
                    key={tech.technicianId} 
                    className="inline-flex items-center gap-1 bg-white border border-amber-300 px-2 py-1 rounded-lg text-xs font-bold text-amber-900 shadow-2xs"
                  >
                    <span>👤 {tech.technicianName}</span>
                    {tech.vehicleNumber && <span className="text-[10px] text-amber-600 font-mono">({tech.vehicleNumber})</span>}
                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-mono font-black">
                      {formatQty(tech.quantity)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filter Chips & Search Bar */}
        <div className="p-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          {/* Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-thin no-scrollbar pb-0.5">
            {[
              { id: 'all', label: `الكل (${logs.length})`, icon: '📋' },
              { id: 'sales', label: `المبيعات (${stats.sold})`, icon: '🛒' },
              { id: 'custody', label: `حركة الفنيين (${stats.loadedToVans})`, icon: '🚚' },
              { id: 'inflow', label: `التوريد والتحويل`, icon: '📥' },
              { id: 'audits', label: `الجرد والتعديل`, icon: '⚙️' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs scale-102'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-60 shrink-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث في الحركات (فني، زبون، فاتورة)..."
              className="w-full pl-7 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-brand-500 focus:outline-hidden bg-slate-50/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Timeline Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2.5"></div>
              <p className="text-sm font-bold text-slate-700">جارٍ تجميع وتوحيد سجل حركة القطعة من كافة المصادر...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700">لا توجد حركات مسجلة مطابقة للبحث/الفلتر</p>
              <p className="text-xs text-slate-400 mt-1">يتم توثيق كل حركة تحميل، بيع، استرجاع أو جرد تلقائياً هنا</p>
            </div>
          ) : (
            <div className="relative border-r-2 border-slate-200 pr-5 sm:pr-6 space-y-4 mr-2">
              {filteredLogs.map((log) => {
                const date = log.date instanceof Date ? log.date : new Date(log.timestamp || Date.now());
                const visuals = getTypeVisuals(log.type, log.source);

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Bullet */}
                    <div className={`absolute -right-[27px] sm:-right-[31px] top-3.5 w-3.5 h-3.5 rounded-full ${visuals.dotClass} border-2 border-white shadow-xs group-hover:scale-125 transition-transform`}></div>

                    <div className="bg-white border border-slate-200/80 rounded-xl p-3 sm:p-3.5 shadow-2xs hover:border-brand-300 hover:shadow-xs transition-all">
                      {/* Top Header: Badge, Direction, Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${visuals.badgeClass}`}>
                            <span>{visuals.icon}</span>
                            <span>{visuals.label}</span>
                          </span>

                          {/* Reference Number / Invoice */}
                          {log.referenceNumber && (
                            <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                              #{log.referenceNumber}
                            </span>
                          )}

                          {/* Technician Tag */}
                          {log.technicianName && (
                            <span className="text-[11px] font-bold bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200">
                              🚚 فني: {log.technicianName}
                            </span>
                          )}

                          {/* Customer Tag */}
                          {log.customerName && (
                            <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                              👤 زبون: {log.customerName}
                            </span>
                          )}
                        </div>

                        {/* Date & Time */}
                        <span className="text-[11px] font-mono font-medium text-slate-400">
                          {date.toLocaleString('ar-IQ')}
                        </span>
                      </div>

                      {/* Movement Details & Quantities & Stock Balance Flow */}
                      <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/90 text-xs space-y-2 mt-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {/* Quantity Impact */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 font-bold">الكمية:</span>
                              <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-md shadow-2xs ${
                                log.quantity > 0 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}>
                                {log.quantity > 0 ? `+${formatQty(Math.abs(log.quantity))}` : `-${formatQty(Math.abs(log.quantity))}`}
                              </span>
                            </div>

                            {/* Stock Balance Before ➔ After Badge */}
                            {log.balanceBefore !== null && log.balanceAfter !== null && (
                              <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-mono text-xs">
                                <span className="text-[11px] font-sans font-bold text-slate-500">
                                  {log.balanceScope === 'warehouse' ? '🏢 رصيد المخزن:' : (log.balanceScope === 'total' ? '📦 الرصيد الإجمالي:' : '🏪 رصيد المحل:')}
                                </span>
                                <span className="text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" title="الرصيد قبل الحركة">
                                  كان {formatQty(log.balanceBefore)}
                                </span>
                                <span className="text-brand-600 font-black text-sm">➔</span>
                                <span className={`font-black px-1.5 py-0.5 rounded border ${
                                  log.balanceAfter < log.balanceBefore 
                                    ? 'bg-amber-50 text-amber-900 border-amber-300' 
                                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                }`} title="الرصيد بعد الحركة">
                                  صار {formatQty(log.balanceAfter)}
                                </span>
                              </div>
                            )}

                            {/* Internal transfer dual flow if both changed */}
                            {log.type === LOG_TYPES.TRANSFER && log.storeBalanceBefore !== null && log.warehouseBalanceBefore !== null && (
                              <div className="text-[11px] text-blue-800 font-mono bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-2">
                                <span>المحل: {formatQty(log.storeBalanceBefore)} ➔ {formatQty(log.storeBalanceAfter)}</span>
                                <span>|</span>
                                <span>المخزن: {formatQty(log.warehouseBalanceBefore)} ➔ {formatQty(log.warehouseBalanceAfter)}</span>
                              </div>
                            )}
                          </div>

                          {/* Reason / Notes */}
                          {log.reason && (
                            <div className="text-[11px] text-slate-600 font-medium bg-white/70 px-2 py-0.5 rounded-md border border-slate-200/60 max-w-full truncate">
                              <span className="text-slate-400">ملاحظة:</span> {log.reason}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer: User / Performer */}
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>بواسطة: {log.userEmail || 'المستخدم'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            عرض {filteredLogs.length} حركة من أصل {logs.length}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer mr-auto"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

