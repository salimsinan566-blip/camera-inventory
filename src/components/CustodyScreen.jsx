import React, { useState, useMemo } from 'react';
import { useCustody } from '../hooks/useCustody';
import { addTechnician, updateTechnician, deleteTechnician } from '../services/custodyService';
import { generateCustodyManifestPDF } from '../utils/backupPdfGenerator';
import LoadCustodyModal from './LoadCustodyModal';
import ReturnCustodyModal from './ReturnCustodyModal';
import { useUI } from '../contexts/UIContext';
import { formatProductQty } from '../models/product';
import { useSettings } from '../hooks/useSettings';

function formatIQD(val) {
  return Number(Math.round(val || 0)).toLocaleString('en-US');
}

export default function CustodyScreen({ products = [], user, onOpenPOSWithCustody }) {
  const { technicians, custodies, logs, stats, loading } = useCustody();
  const { settings } = useSettings();
  const { toast, confirm } = useUI();

  const [activeTab, setActiveTab] = useState('vans'); // 'vans' | 'logs'
  const [selectedTech, setSelectedTech] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAddTechModal, setShowAddTechModal] = useState(false);
  const [editingTech, setEditingTech] = useState(null);

  // New/Edit Tech Form State
  const [techForm, setTechForm] = useState({ name: '', phone: '', vehicleNumber: '', notes: '' });
  const [savingTech, setSavingTech] = useState(false);

  // Filter tech search
  const [techSearch, setTechSearch] = useState('');
  const [logFilterTech, setLogFilterTech] = useState('all');

  const filteredTechs = useMemo(() => {
    if (!techSearch.trim()) return technicians;
    const term = techSearch.toLowerCase().trim();
    return technicians.filter(t => 
      t.name?.toLowerCase().includes(term) ||
      t.phone?.includes(term) ||
      t.vehicleNumber?.toLowerCase().includes(term)
    );
  }, [technicians, techSearch]);

  const filteredLogs = useMemo(() => {
    if (logFilterTech === 'all') return logs;
    return logs.filter(l => l.technicianId === logFilterTech);
  }, [logs, logFilterTech]);

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
      toast('تم تحميل كشف العهدة الرسمي بنجاح! 📄✨', 'success');
    } catch (err) {
      console.error(err);
      toast(`فشل إنشاء التقرير: ${err.message}`, 'error');
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
                متابعة حركة المواد المحملة بالسيارات، الصرف الميداني، وضبط جرد الفنيين بدقة تامة.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAddTech}
            className="btn btn-primary flex items-center gap-2 text-xs font-bold py-2.5 px-4 rounded-xl shadow-md cursor-pointer"
          >
            <span>➕</span>
            <span>إضافة فني / سيارة صيانة</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
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

      {/* Tabs Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('vans')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === 'vans'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🚚 بطاقات الفنيين والسيارات ({filteredTechs.length})
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              activeTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📋 سجل الحركات والتحميل ({logs.length})
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
      {/* TAB 1: VANS & TECHNICIAN CARDS */}
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
      {/* TAB 2: AUDIT LOGS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Logs Filter Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">تصفية حسب الفني:</span>
              <select
                value={logFilterTech}
                onChange={(e) => setLogFilterTech(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">جميع الفنيين والسيارات</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.vehicleNumber || 'بدون سيارة'})</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-slate-500 font-bold">{filteredLogs.length} حركة مسجلة</span>
          </div>

          {/* Table */}
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <span className="text-3xl block mb-2">📋</span>
              <p className="text-xs">لا توجد حركات عهد مسجلة بعد.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الفني / السيارة</th>
                    <th className="p-3 text-center">نوع الحركة</th>
                    <th className="p-3">المواد المنقولة</th>
                    <th className="p-3 text-center">إجمالي القطع</th>
                    <th className="p-3">الملاحظات</th>
                    <th className="p-3">المسؤول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(log => {
                    const isLoad = log.type === 'load';
                    const isReturn = log.type === 'return';
                    const isSale = log.type === 'sale_deduct';

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
                        <td className="p-3 max-w-xs truncate text-slate-700">
                          {(log.items || []).map(i => `${i.name} (${i.quantity})`).join(', ')}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-900 font-mono">
                          {log.totalQuantity || 0}
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">
                          {log.notes || '—'}
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
