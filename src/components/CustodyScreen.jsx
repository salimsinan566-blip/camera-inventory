import React, { useState, useMemo } from 'react';
import { useCustody } from '../hooks/useCustody';
import { addTechnician, updateTechnician, deleteTechnician } from '../services/custodyService';
import { generateCustodyManifestPDF, generateCustodyMovementReportPDF } from '../utils/backupPdfGenerator';
import LoadCustodyModal from './LoadCustodyModal';
import ReturnCustodyModal from './ReturnCustodyModal';
import { useUI } from '../contexts/UIContext';
import { formatProductQty } from '../models/product';
import { useSettings } from '../hooks/useSettings';

function formatIQD(val) {
  return Number(Math.round(val || 0)).toLocaleString('en-US');
}

function formatArabicDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
    return d.toLocaleDateString('ar-IQ', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

function formatLogTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function getRelativeDateLabel(dateKey) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return 'اليوم 🟢';
  if (dateKey === yesterday) return 'أمس ⏱️';
  return null;
}

export default function CustodyScreen({ products = [], user, onOpenPOSWithCustody }) {
  const { technicians, custodies, logs, stats, loading } = useCustody();
  const { settings } = useSettings();
  const { toast, confirm } = useUI();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'vans' | 'logs'
  const [selectedTech, setSelectedTech] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAddTechModal, setShowAddTechModal] = useState(false);
  const [editingTech, setEditingTech] = useState(null);

  // New/Edit Tech Form State
  const [techForm, setTechForm] = useState({ name: '', phone: '', vehicleNumber: '', notes: '' });
  const [savingTech, setSavingTech] = useState(false);

  // Filter tech search in Vans tab
  const [techSearch, setTechSearch] = useState('');

  // Daily & Audit Filters State
  const [filterTech, setFilterTech] = useState('all');
  const [filterDateMode, setFilterDateMode] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'
  const [filterDateFrom, setFilterDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [filterDateTo, setFilterDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [filterType, setFilterType] = useState('all'); // 'all' | 'load' | 'sale_deduct' | 'return'
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [printingReport, setPrintingReport] = useState(false);

  // Collapsed state for day accordion
  const [collapsedDays, setCollapsedDays] = useState({});

  const toggleDayCollapse = (dateKey) => {
    setCollapsedDays(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const filteredTechs = useMemo(() => {
    if (!techSearch.trim()) return technicians;
    const term = techSearch.toLowerCase().trim();
    return technicians.filter(t => 
      t.name?.toLowerCase().includes(term) ||
      t.phone?.includes(term) ||
      t.vehicleNumber?.toLowerCase().includes(term)
    );
  }, [technicians, techSearch]);

  // Comprehensive filter for logs (used by Daily & Audit tabs)
  const filteredLogs = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const currentMonthPrefix = todayStr.slice(0, 7); // 'YYYY-MM'

    return logs.filter(log => {
      // Tech filter
      if (filterTech !== 'all' && log.technicianId !== filterTech) {
        return false;
      }

      // Type filter
      if (filterType !== 'all' && log.type !== filterType) {
        return false;
      }

      // Date filter
      const logDate = log.date || (log.createdAt ? log.createdAt.slice(0, 10) : '');
      if (filterDateMode === 'today' && logDate !== todayStr) return false;
      if (filterDateMode === 'yesterday' && logDate !== yesterdayStr) return false;
      if (filterDateMode === 'week' && logDate < sevenDaysAgo) return false;
      if (filterDateMode === 'month' && !logDate.startsWith(currentMonthPrefix)) return false;
      if (filterDateMode === 'custom') {
        if (filterDateFrom && logDate < filterDateFrom) return false;
        if (filterDateTo && logDate > filterDateTo) return false;
      }

      // Search term filter
      if (filterSearchTerm.trim()) {
        const term = filterSearchTerm.toLowerCase().trim();
        const matchesTech = (log.technicianName || '').toLowerCase().includes(term);
        const matchesInvoice = (log.invoiceNumber || '').toString().toLowerCase().includes(term);
        const matchesCustomer = (log.customerName || '').toLowerCase().includes(term);
        const matchesNotes = (log.notes || '').toLowerCase().includes(term);
        const matchesItems = (log.items || []).some(i => 
          (i.name || '').toLowerCase().includes(term) || 
          (i.sku || '').toLowerCase().includes(term)
        );

        if (!matchesTech && !matchesInvoice && !matchesCustomer && !matchesNotes && !matchesItems) {
          return false;
        }
      }

      return true;
    });
  }, [logs, filterTech, filterType, filterDateMode, filterDateFrom, filterDateTo, filterSearchTerm]);

  // Group filtered logs by day (dateKey)
  const groupedLogsByDay = useMemo(() => {
    const groups = {};
    filteredLogs.forEach(log => {
      const dateKey = log.date || (log.createdAt ? log.createdAt.slice(0, 10) : 'غير محدد');
      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          logs: [],
          totalLoads: 0,
          totalSales: 0,
          totalReturns: 0,
          totalQty: 0
        };
      }
      groups[dateKey].logs.push(log);
      const qty = Number(log.totalQuantity) || 0;
      if (log.type === 'load') groups[dateKey].totalLoads += qty;
      else if (log.type === 'sale_deduct') groups[dateKey].totalSales += qty;
      else if (log.type === 'return') groups[dateKey].totalReturns += qty;
      groups[dateKey].totalQty += qty;
    });

    // Sort days descending
    return Object.values(groups).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredLogs]);

  // Overall summary for current filtered view
  const filteredStats = useMemo(() => {
    const loads = filteredLogs.filter(l => l.type === 'load').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
    const sales = filteredLogs.filter(l => l.type === 'sale_deduct').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
    const returns = filteredLogs.filter(l => l.type === 'return').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
    const net = loads - sales - returns;
    return { loads, sales, returns, net, totalCount: filteredLogs.length };
  }, [filteredLogs]);

  const handleOpenAddTech = () => {
    setEditingTech(null);
    setTechForm({ name: '', phone: '', vehicleNumber: '', notes: '' });
    setShowAddTechModal(true);
  };

  const handleOpenEditTech = (tech) => {
    setEditingTech(tech);
    setTechForm({
      name: tech.name || '',
      phone: tech.phone || '',
      vehicleNumber: tech.vehicleNumber || '',
      notes: tech.notes || ''
    });
    setShowAddTechModal(true);
  };

  const handleSaveTech = async (e) => {
    e.preventDefault();
    if (!techForm.name.trim()) {
      toast('اسم الفني مطلوب', 'error');
      return;
    }
    setSavingTech(true);
    try {
      if (editingTech) {
        await updateTechnician(editingTech.id, techForm);
        toast('تم تحديث بيانات الفني بنجاح!', 'success');
      } else {
        await addTechnician(techForm);
        toast('تمت إضافة الفني والسيارة بنجاح!', 'success');
      }
      setShowAddTechModal(false);
      setTechForm({ name: '', phone: '', vehicleNumber: '', notes: '' });
    } catch (err) {
      toast(`خطأ: ${err.message}`, 'error');
    } finally {
      setSavingTech(false);
    }
  };

  const handleDeleteTech = (tech) => {
    confirm(
      'حذف الفني / السيارة',
      `هل أنت متأكد من حذف الفني "${tech.name}"؟`,
      async () => {
        try {
          await deleteTechnician(tech.id);
          toast('تم حذف الفني بنجاح', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  const handlePrintManifest = async (tech) => {
    const custody = custodies[tech.id] || { items: [] };
    if (!custody.items || custody.items.length === 0) {
      toast('لا توجد مواد في عهدة الفني لطباعة كشف بها', 'warn');
      return;
    }
    try {
      toast('جاري تجهيز كشف عهدة الفني بصيغة PDF عالية الدقة...', 'info');
      const blob = await generateCustodyManifestPDF(tech, custody, settings, `كشف عهدة سيارة - ${tech.name}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_عهدة_${tech.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('تم تحميل كشف العهدة بنجاح! 📄✨', 'success');
    } catch (err) {
      console.error(err);
      toast(`فشل إنشاء التقرير: ${err.message}`, 'error');
    }
  };

  const handlePrintMovementReport = async () => {
    if (filteredLogs.length === 0) {
      toast('لا توجد حركات مسجلة للطباعة ضمن الفترة المحددة', 'warn');
      return;
    }

    try {
      setPrintingReport(true);
      toast('جاري تجهيز تقرير حركة العهد اليومي بصيغة PDF...', 'info');

      let dateRangeText = 'جميع الحركات المسجلة';
      if (filterDateMode === 'today') dateRangeText = `حركات اليوم (${new Date().toLocaleDateString('ar-IQ')})`;
      else if (filterDateMode === 'yesterday') dateRangeText = `حركات يوم أمس`;
      else if (filterDateMode === 'week') dateRangeText = `آخر 7 أيام`;
      else if (filterDateMode === 'month') dateRangeText = `حركات هذا الشهر`;
      else if (filterDateMode === 'custom') dateRangeText = `من ${filterDateFrom} إلى ${filterDateTo}`;

      const matchedTech = filterTech !== 'all' ? technicians.find(t => t.id === filterTech) : null;

      const blob = await generateCustodyMovementReportPDF({
        technician: matchedTech,
        logs: filteredLogs,
        filterTitle: matchedTech ? `تقرير حركة عهدة الفني: ${matchedTech.name}` : 'تقرير حركة عهد الفنيين وسيارات العمل',
        dateRangeText,
        storeSettings: settings
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_حركة_العهد_${matchedTech ? matchedTech.name.replace(/\s+/g, '_') : 'شامل'}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('تم تنزيل تقرير حركة العهد بنجاح! 📄✨', 'success');
    } catch (err) {
      console.error(err);
      toast(`فشل إنشاء التقرير: ${err.message}`, 'error');
    } finally {
      setPrintingReport(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚚</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                عهد الفنيين وسيارات الصيانة
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة حركة المواد المحملة بالسيارات، الصرف الميداني للزبائن، وتتبع مسار خروج البضاعة يومياً.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handlePrintMovementReport}
            disabled={printingReport || filteredLogs.length === 0}
            className="flex items-center gap-2 text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-xs cursor-pointer disabled:opacity-40"
            title="طباعة كشف الحركات اليومية PDF"
          >
            <span>📄</span>
            <span>{printingReport ? 'جاري التجهيز...' : 'طباعة كشف الحركات PDF'}</span>
          </button>

          <button
            onClick={handleOpenAddTech}
            className="btn btn-primary flex items-center gap-2 text-xs font-bold py-2.5 px-4 rounded-xl shadow-md cursor-pointer"
          >
            <span>➕</span>
            <span>إضافة فني / سيارة صيانة</span>
          </button>
        </div>
      </div>

      {/* Global Overview Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-5 rounded-2xl border border-indigo-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700">بضاعة الميدان / بالسيارات</span>
            <span className="p-2 bg-indigo-500/10 text-indigo-700 rounded-xl text-lg">📦</span>
          </div>
          <p className="text-2xl font-black text-indigo-900 mt-2 font-mono">
            {stats.totalVanItems} <span className="text-xs font-normal text-indigo-700">قطعة</span>
          </p>
          <p className="text-[11px] text-indigo-600 mt-1">موزعة على عهد سيارات العمل</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 rounded-2xl border border-emerald-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">قيمة العهد (سعر المفرد)</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl text-lg">🏷️</span>
          </div>
          <p className="text-2xl font-black text-emerald-900 mt-2 font-mono">
            {formatIQD(stats.totalVanRetailValue)} <span className="text-xs font-normal text-emerald-700">د.ع</span>
          </p>
          <p className="text-[11px] text-emerald-600 mt-1">إجمالي قيمة البيع بالسيارات</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700">قيمة العهد (سعر التكلفة)</span>
            <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl text-lg">💰</span>
          </div>
          <p className="text-2xl font-black text-amber-900 mt-2 font-mono">
            {formatIQD(stats.totalVanCostValue)} <span className="text-xs font-normal text-amber-700">د.ع</span>
          </p>
          <p className="text-[11px] text-amber-600 mt-1">رأس المال المحمل بالسيارات</p>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">الفنيين النشطين</span>
            <span className="p-2 bg-slate-500/10 text-slate-700 rounded-xl text-lg">👤</span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
            {stats.activeTechnicians} <span className="text-xs font-normal text-slate-600">فني / سيارة</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">مسجلين بالنظام</p>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === 'daily'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>📅</span>
            <span>السجل اليومي وحركة المواد</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'daily' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-700'
            }`}>
              {filteredLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vans')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === 'vans'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>🚚</span>
            <span>بطاقات الفنيين والسيارات ({filteredTechs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>📋</span>
            <span>كل العمليات والتدقيق ({logs.length})</span>
          </button>
        </div>

        {activeTab === 'vans' && (
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              placeholder="بحث عن فني أو رقم سيارة..."
              className="w-full pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* SHARED FILTER BAR FOR DAILY & AUDIT TABS */}
      {/* ---------------------------------------------------- */}
      {(activeTab === 'daily' || activeTab === 'logs') && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Tech Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">الفني / السيارة:</span>
              <select
                value={filterTech}
                onChange={(e) => setFilterTech(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">🚚 جميع الفنيين وسيارات العمل</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.vehicleNumber || 'بدون رقم سيارة'})</option>
                ))}
              </select>
            </div>

            {/* Movement Type Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">نوع الحركة:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setFilterType('load')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'load' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🚚 تحميل
                </button>
                <button
                  onClick={() => setFilterType('sale_deduct')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'sale_deduct' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🧾 مبيعات وصرف
                </button>
                <button
                  onClick={() => setFilterType('return')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'return' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🔄 استرجاع
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={filterSearchTerm}
                onChange={(e) => setFilterSearchTerm(e.target.value)}
                placeholder="بحث بالمادة، الزبون، الفاتورة..."
                className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>
          </div>

          {/* Date Filter Pills & Range */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700 ml-1">الفترة الزمنية:</span>
              {[
                { id: 'today', label: 'اليوم' },
                { id: 'yesterday', label: 'أمس' },
                { id: 'week', label: 'آخر 7 أيام' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'all', label: 'كل التواريخ' },
                { id: 'custom', label: 'تاريخ مخصص 📅' }
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => setFilterDateMode(btn.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterDateMode === btn.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs */}
            {filterDateMode === 'custom' && (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-bold">من:</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono"
                />
                <span className="text-[11px] text-slate-500 font-bold">إلى:</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono"
                />
              </div>
            )}
          </div>

          {/* Period Summary Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="bg-indigo-50/70 border border-indigo-200/80 p-2.5 rounded-xl flex items-center justify-between">
              <span className="text-indigo-700 font-medium">🚚 المحمّل للفترة:</span>
              <strong className="text-indigo-900 font-bold font-mono">{filteredStats.loads} قطعة</strong>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200/80 p-2.5 rounded-xl flex items-center justify-between">
              <span className="text-emerald-700 font-medium">🧾 المباع / المصروف:</span>
              <strong className="text-emerald-900 font-bold font-mono">{filteredStats.sales} قطعة</strong>
            </div>
            <div className="bg-amber-50/70 border border-amber-200/80 p-2.5 rounded-xl flex items-center justify-between">
              <span className="text-amber-700 font-medium">🔄 المسترجع للمحل:</span>
              <strong className="text-amber-900 font-bold font-mono">{filteredStats.returns} قطعة</strong>
            </div>
            <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between">
              <span className="text-slate-700 font-medium">📊 صافي التغير:</span>
              <strong className={`font-bold font-mono ${filteredStats.net >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                {filteredStats.net > 0 ? `+${filteredStats.net}` : filteredStats.net} قطعة
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 1: DAILY GROUPED TIMELINE (WHERE ITEMS WENT) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'daily' && (
        <div className="space-y-5">
          {groupedLogsByDay.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <span className="text-5xl block mb-3">📅✨</span>
              <h3 className="text-base font-bold text-slate-800 mb-1">لا توجد حركات مسجلة لهذه الفترة</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                لم يتم تسجيل أي عمليات تحميل أو صرف بيع أو استرجاع للفنيين ضمن خيارات الفلترة المحددة.
              </p>
              <button
                onClick={() => { setFilterDateMode('all'); setFilterTech('all'); setFilterType('all'); setFilterSearchTerm(''); }}
                className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                🔄 إعادة تعيين الفلاتر وعرض كل الحركات
              </button>
            </div>
          ) : (
            groupedLogsByDay.map(dayGroup => {
              const relativeLabel = getRelativeDateLabel(dayGroup.dateKey);
              const isCollapsed = collapsedDays[dayGroup.dateKey];

              return (
                <div
                  key={dayGroup.dateKey}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Day Header Bar */}
                  <div
                    onClick={() => toggleDayCollapse(dayGroup.dateKey)}
                    className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:from-slate-800 hover:to-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">
                            {formatArabicDate(dayGroup.dateKey)}
                          </h3>
                          {relativeLabel && (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              {relativeLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          التاريخ: {dayGroup.dateKey} | {dayGroup.logs.length} حركة مسجلة
                        </p>
                      </div>
                    </div>

                    {/* Day Quick Summary Stats */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        {dayGroup.totalLoads > 0 && (
                          <span className="bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 px-2.5 py-1 rounded-lg font-bold">
                            🚚 تحميل: {dayGroup.totalLoads}
                          </span>
                        )}
                        {dayGroup.totalSales > 0 && (
                          <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 px-2.5 py-1 rounded-lg font-bold">
                            🧾 بيع: {dayGroup.totalSales}
                          </span>
                        )}
                        {dayGroup.totalReturns > 0 && (
                          <span className="bg-amber-500/20 border border-amber-400/30 text-amber-200 px-2.5 py-1 rounded-lg font-bold">
                            🔄 استرجاع: {dayGroup.totalReturns}
                          </span>
                        )}
                      </div>

                      <span className="text-slate-400 text-sm mr-2">
                        {isCollapsed ? '➕' : '➖'}
                      </span>
                    </div>
                  </div>

                  {/* Day Movements List */}
                  {!isCollapsed && (
                    <div className="p-4 space-y-4 bg-slate-50/50">
                      {dayGroup.logs.map(log => {
                        const isLoad = log.type === 'load';
                        const isReturn = log.type === 'return';
                        const isSale = log.type === 'sale_deduct';

                        const badgeBg = isLoad ? 'bg-indigo-100 text-indigo-900 border-indigo-300' :
                          isReturn ? 'bg-amber-100 text-amber-900 border-amber-300' :
                          'bg-emerald-100 text-emerald-900 border-emerald-300';

                        const icon = isLoad ? '🚚' : isReturn ? '🔄' : '🧾';
                        const title = isLoad ? 'تحميل بضاعة لسيارة الفني' :
                          isReturn ? 'استرجاع بضاعة من السيارة للمحل' :
                          'صرف بيع مباشر من عهدة السيارة للزبون';

                        return (
                          <div
                            key={log.id}
                            className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition-shadow p-4 space-y-3"
                          >
                            {/* Movement Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className={`p-1.5 rounded-xl border text-sm font-bold flex items-center gap-1.5 ${badgeBg}`}>
                                  <span>{icon}</span>
                                  <span>{title}</span>
                                </span>

                                <div className="text-xs">
                                  <span className="text-slate-500">الفني: </span>
                                  <strong className="text-slate-900 font-bold">{log.technicianName || 'غير محدد'}</strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                <span>⏰ {formatLogTime(log.createdAt)}</span>
                                <span className="bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-sans text-slate-600">
                                  بواسطة: {log.performedBy || 'المسؤول'}
                                </span>
                              </div>
                            </div>

                            {/* Movement Destination & Context Card (Where did the items go?) */}
                            <div className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                              isLoad ? 'bg-indigo-50/50 border-indigo-100 text-indigo-950' :
                              isReturn ? 'bg-amber-50/50 border-amber-100 text-amber-950' :
                              'bg-emerald-50/50 border-emerald-100 text-emerald-950'
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className="text-base">
                                  {isLoad ? '📦⬅️🏢' : isReturn ? '🚘➡️🏢' : '🚘➡️👤'}
                                </span>
                                <div>
                                  {isLoad && (
                                    <span>
                                      <strong>مسار الحركة:</strong> تم سحب المواد من{' '}
                                      <strong className="text-indigo-700">{log.sourceLocation === 'warehouse' ? 'المخزن الرئيسي' : 'المحل'}</strong>{' '}
                                      وتحميلها إلى سيارة الفني (<strong>{log.technicianName}</strong>).
                                    </span>
                                  )}

                                  {isReturn && (
                                    <span>
                                      <strong>مسار الحركة:</strong> تم إرجاع المواد من سيارة الفني (<strong>{log.technicianName}</strong>) وتنزيلها في{' '}
                                      <strong className="text-amber-700">{log.targetLocation === 'warehouse' ? 'المخزن الرئيسي' : 'المحل'}</strong>.
                                    </span>
                                  )}

                                  {isSale && (
                                    <span>
                                      <strong>صرف مباشر للزبون:</strong> تم بيع وصرف المواد للزبون{' '}
                                      <strong className="text-emerald-800 underline font-bold">{log.customerName || 'زبون نقدي'}</strong>
                                      {log.invoiceNumber && (
                                        <span className="mr-1 bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-md font-mono font-bold">
                                          فاتورة رقم #{log.invoiceNumber}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 text-left">
                                <span className="text-xs font-bold bg-white/80 border border-slate-200 px-3 py-1 rounded-lg font-mono">
                                  إجمالي القطع: {log.totalQuantity || 0}
                                </span>
                              </div>
                            </div>

                            {/* Items Breakdown Table */}
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                                  <tr>
                                    <th className="p-2.5 width-5 text-center">#</th>
                                    <th className="p-2.5">اسم المادة / الصنف</th>
                                    <th className="p-2.5">الرمز / SKU</th>
                                    <th className="p-2.5 text-center">الكمية المنقولة</th>
                                    {isSale && <th className="p-2.5 text-center">سعر البيع</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(log.items || []).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                      <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                                      <td className="p-2 font-bold text-slate-900">
                                        {item.name}
                                        {item.cameraType && (
                                          <span className="text-[10px] text-slate-500 font-normal mr-2">
                                            ({item.cameraType})
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2 font-mono text-slate-500 text-[11px]">
                                        {item.sku || '—'}
                                      </td>
                                      <td className="p-2 text-center">
                                        <span className={`inline-block px-2.5 py-0.5 rounded-md font-bold font-mono text-xs ${
                                          isLoad ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                          isReturn ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                          'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        }`}>
                                          {item.quantity} {item.sellMode === 'meter' ? 'متر' : 'قطعة'}
                                        </span>
                                      </td>
                                      {isSale && (
                                        <td className="p-2 text-center font-bold text-emerald-700 font-mono">
                                          {item.price ? `${formatIQD(item.price)} د.ع` : '—'}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Notes if any */}
                            {log.notes && (
                              <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex items-center gap-1.5">
                                <span className="text-slate-400">📝 ملاحظات:</span>
                                <span>{log.notes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: VANS & TECHNICIAN CARDS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'vans' && (
        <>
          {filteredTechs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
              <span className="text-5xl block mb-3">🚚</span>
              <h3 className="text-base font-bold text-slate-800 mb-1">لا يوجد فنيين مسجلين بعد</h3>
              <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">
                أضف فنيي الصيانة وسيارات العمل لبدء تحميل المواد وتتبع مبيعات الميدان والجرد بكل سهولة.
              </p>
              <button
                onClick={handleOpenAddTech}
                className="btn btn-primary text-xs font-bold py-2.5 px-6 rounded-xl cursor-pointer"
              >
                ➕ إضافة أول فني الآن
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredTechs.map((tech) => {
                const custody = custodies[tech.id] || { items: [], totalItemsCount: 0, totalCost: 0, totalRetail: 0 };
                const items = custody.items || [];
                const itemCount = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

                return (
                  <div
                    key={tech.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col"
                  >
                    {/* Card Header */}
                    <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-2xl">
                          🚚
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white">{tech.name}</h3>
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              نشط
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                            {tech.vehicleNumber && (
                              <span className="flex items-center gap-1">
                                <span>🚘</span> {tech.vehicleNumber}
                              </span>
                            )}
                            {tech.phone && (
                              <span className="flex items-center gap-1">
                                <span>📞</span> {tech.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Edit / Delete menu */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditTech(tech)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
                          title="تعديل بيانات الفني"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteTech(tech)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                          title="حذف الفني"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Summary Bar */}
                    <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200 px-5 py-3 text-xs">
                      <div>
                        <span className="text-slate-500">القطع في السيارة: </span>
                        <strong className="text-indigo-900 font-bold font-mono text-sm">
                          {itemCount} قطعة ({items.length} صنف)
                        </strong>
                      </div>
                      <div className="text-left">
                        <span className="text-slate-500">قيمة العهدة: </span>
                        <strong className="text-emerald-700 font-bold font-mono text-sm">
                          {formatIQD(custody.totalRetail)} د.ع
                        </strong>
                      </div>
                    </div>

                    {/* Current Items in Van */}
                    <div className="p-5 flex-1 flex flex-col">
                      <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                        <span>المواد الموجودة في السيارة حالياً:</span>
                        {items.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            آخر تحديث: {custody.lastUpdated ? new Date(custody.lastUpdated).toLocaleDateString('ar-IQ') : '—'}
                          </span>
                        )}
                      </h4>

                      {items.length === 0 ? (
                        <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200 my-auto">
                          <span className="text-2xl block mb-1">📦💨</span>
                          <p className="text-xs text-slate-500">السيارة فارغة حالياً، لا توجد مواد محملة في عهدة الفني.</p>
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto mb-4">
                          {items.map((item) => (
                            <div key={item.productId} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                              <div className="min-w-0 flex-1 pl-2">
                                <p className="font-bold text-slate-800 truncate">{item.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {item.cameraType || ''} {item.sku ? `| SKU: ${item.sku}` : ''}
                                </p>
                              </div>
                              <div className="text-left shrink-0">
                                <span className="inline-block bg-indigo-50 border border-indigo-200 text-indigo-900 px-2.5 py-0.5 rounded-lg font-bold font-mono">
                                  {formatProductQty(item, item.quantity)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100 mt-auto">
                        <button
                          onClick={() => { setSelectedTech(tech); setShowLoadModal(true); }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>🚚</span>
                          <span>تحميل مواد</span>
                        </button>

                        <button
                          onClick={() => { setSelectedTech(tech); setShowReturnModal(true); }}
                          disabled={items.length === 0}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <span>🔄</span>
                          <span>استرجاع للمحل</span>
                        </button>

                        {onOpenPOSWithCustody && (
                          <button
                            onClick={() => onOpenPOSWithCustody(tech)}
                            disabled={items.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                          >
                            <span>🧾</span>
                            <span>بيع من السيارة</span>
                          </button>
                        )}

                        <button
                          onClick={() => handlePrintManifest(tech)}
                          disabled={items.length === 0}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <span>📄</span>
                          <span>كشف PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: AUDIT RAW LOGS TABLE */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-slate-700">سجل العمليات الخام (Audit Logs)</span>
            <span className="text-xs text-slate-500 font-bold">{filteredLogs.length} حركة مطابقة</span>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-xs">لا توجد حركات عهد مسجلة تطابق الفلاتر المحددة.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الفني / السيارة</th>
                    <th className="p-3 text-center">نوع الحركة</th>
                    <th className="p-3">المسار / الوجهة</th>
                    <th className="p-3">المواد المنقولة</th>
                    <th className="p-3 text-center">إجمالي القطع</th>
                    <th className="p-3">المسؤول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(log => {
                    const isLoad = log.type === 'load';
                    const isReturn = log.type === 'return';
                    const isSale = log.type === 'sale_deduct';

                    let pathText = '';
                    if (isLoad) pathText = `من: ${log.sourceLocation === 'warehouse' ? 'المخزن' : 'المحل'} ⬅️ إلى السيارة`;
                    else if (isReturn) pathText = `من السيارة ⬅️ إلى: ${log.targetLocation === 'warehouse' ? 'المخزن' : 'المحل'}`;
                    else if (isSale) pathText = `صرف للزبون: ${log.customerName || 'زبون نقدي'} ${log.invoiceNumber ? `(#${log.invoiceNumber})` : ''}`;

                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-500 font-mono whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('ar-IQ') : '—'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {log.technicianName || '—'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isLoad ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                            isReturn ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {isLoad ? '🚚 تحميل للسيارة' : isReturn ? '🔄 استرجاع للمحل' : '🧾 صرف بيع مباشر'}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium">
                          {pathText}
                        </td>
                        <td className="p-3 max-w-xs truncate text-slate-700">
                          {(log.items || []).map(i => `${i.name} (${i.quantity})`).join(', ')}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-900 font-mono">
                          {log.totalQuantity || 0}
                        </td>
                        <td className="p-3 text-slate-400 font-medium whitespace-nowrap">
                          {log.performedBy || 'المسؤول'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* ADD / EDIT TECHNICIAN MODAL */}
      {/* ---------------------------------------------------- */}
      {showAddTechModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingTech ? 'تعديل بيانات الفني / السيارة' : 'إضافة فني وسيارة صيانة جديدة'}
              </h3>
              <button onClick={() => setShowAddTechModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTech} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفني *</label>
                <input
                  type="text"
                  required
                  value={techForm.name}
                  onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
                  placeholder="مثال: أحمد عبد الله"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم السيارة / نوع المركبة (اختياري)</label>
                <input
                  type="text"
                  value={techForm.vehicleNumber}
                  onChange={(e) => setTechForm({ ...techForm, vehicleNumber: e.target.value })}
                  placeholder="مثال: بغداد 12345 / بيك آب تويوتا"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
                <input
                  type="text"
                  value={techForm.phone}
                  onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
                  placeholder="0770XXXXXXX"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={techForm.notes}
                  onChange={(e) => setTechForm({ ...techForm, notes: e.target.value })}
                  placeholder="ملاحظات حول الفني أو منطقة العمل..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTechModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingTech}
                  className="btn btn-primary text-xs font-bold py-2 px-5 rounded-xl cursor-pointer"
                >
                  {savingTech ? 'جاري الحفظ...' : editingTech ? 'تحديث البيانات' : 'حفظ الفني'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOAD CUSTODY MODAL */}
      {showLoadModal && selectedTech && (
        <LoadCustodyModal
          technician={selectedTech}
          products={products}
          isOpen={showLoadModal}
          onClose={() => { setShowLoadModal(false); setSelectedTech(null); }}
          userName={user?.displayName || user?.email?.split('@')[0] || 'المسؤول'}
        />
      )}

      {/* RETURN CUSTODY MODAL */}
      {showReturnModal && selectedTech && (
        <ReturnCustodyModal
          technician={selectedTech}
          custodyDoc={custodies[selectedTech.id]}
          isOpen={showReturnModal}
          onClose={() => { setShowReturnModal(false); setSelectedTech(null); }}
          userName={user?.displayName || user?.email?.split('@')[0] || 'المسؤول'}
        />
      )}
    </div>
  );
}

