import React, { useState, useMemo, useRef } from 'react';
import PurchasesArchiveTab from './PurchasesArchiveTab';

export default function SupplierCardsGrid({
  supplierDebts = [],
  purchases = [],
  debtPayments = [],
  draftPurchases = [],
  stats = {},
  onSelectSupplier,
  onOpenRegisterScreen,
  onOpenOpeningDebtModal,
  onSelectInvoice,
  onEditInvoice,
  onDeleteInvoice,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDebtOnly, setFilterDebtOnly] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const archiveRef = useRef(null);

  // Group and compute comprehensive supplier records
  const suppliersList = useMemo(() => {
    const map = new Map();

    // 1. From supplier_debts collection (primary financial records)
    supplierDebts.forEach((s) => {
      if (!s.supplierName) return;
      const key = s.supplierName.trim().toLowerCase();
      map.set(key, {
        id: s.id,
        supplierName: s.supplierName.trim(),
        supplierPhone: s.supplierPhone || '',
        totalPurchases: Number(s.totalPurchases) || 0,
        totalPaid: Number(s.totalPaid) || 0,
        remainingDebt: Math.max(0, Number(s.remainingDebt) || 0),
        invoicesCount: Number(s.invoicesCount) || 0,
        hasOpeningDebt: Boolean(s.hasOpeningDebt),
        rawDebtDoc: s,
      });
    });

    // 2. Supplement from purchases if any supplier is not in debts
    purchases.forEach((p) => {
      if (!p.supplierName) return;
      const key = p.supplierName.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: key.replace(/[\/\\]/g, '_'),
          supplierName: p.supplierName.trim(),
          supplierPhone: p.supplierPhone || '',
          totalPurchases: 0,
          totalPaid: 0,
          remainingDebt: 0,
          invoicesCount: 0,
          hasOpeningDebt: false,
          rawDebtDoc: null,
        });
      }
    });

    const list = Array.from(map.values());

    // Sort: Suppliers with remaining debt first, then by name
    return list.sort((a, b) => {
      if (b.remainingDebt !== a.remainingDebt) {
        return b.remainingDebt - a.remainingDebt;
      }
      return a.supplierName.localeCompare(b.supplierName, 'ar');
    });
  }, [supplierDebts, purchases]);

  // Filtered by search & debt filter
  const filteredSuppliers = useMemo(() => {
    let result = suppliersList;
    if (filterDebtOnly) {
      result = result.filter((s) => s.remainingDebt > 0);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.supplierName.toLowerCase().includes(q) ||
          (s.supplierPhone && s.supplierPhone.includes(q))
      );
    }
    return result;
  }, [suppliersList, searchTerm, filterDebtOnly]);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* شريط الأدوات العلوي - خاص بالموردين حصراً */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* حقل البحث باسم أو هاتف المورد */}
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم أو هاتف المورد..."
            className="w-full pr-8 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white placeholder:text-slate-400"
          />
          <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* أزرار الفلترة والإجراءات */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* فلتر الديون فقط */}
          <button
            type="button"
            onClick={() => setFilterDebtOnly(!filterDebtOnly)}
            className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              filterDebtOnly
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filterDebtOnly ? 'bg-rose-400' : 'bg-slate-400'}`} />
            <span>عليهم دين فقط</span>
            {filterDebtOnly && (
              <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.2 rounded font-mono">
                {filteredSuppliers.length}
              </span>
            )}
          </button>

          {/* زر رصيد افتتاحي */}
          <button
            type="button"
            onClick={onOpenOpeningDebtModal}
            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            title="تسجيل رصيد افتتاحي أو دين سابق لمورد"
          >
            <span>رصيد افتتاحي</span>
          </button>

          {/* زر فاتورة شراء جديدة */}
          <button
            type="button"
            onClick={onOpenRegisterScreen}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95"
            title="تسجيل وتوريد فاتورة شراء جديدة"
          >
            <span>+</span>
            <span>فاتورة شراء</span>
          </button>
        </div>
      </div>

      {/* شبكة كروت الموردين - كروت طولية واضحة ورسمية */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <p className="text-sm font-bold text-slate-600">
            {searchTerm ? `لا توجد نتائج مطابقة لـ "${searchTerm}"` : 'لا يوجد موردون مسجلون'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
          {filteredSuppliers.map((supplier) => {
            const hasDebt = supplier.remainingDebt > 0;
            const firstLetter = supplier.supplierName.charAt(0);

            return (
              <div
                key={supplier.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-slate-400 transition-all duration-150 flex flex-col justify-between overflow-hidden shadow-2xs"
              >
                {/* 1. رأس الكارت: اسم المورد، الهاتف، وحالة الحساب */}
                <div className="p-3.5 border-b border-slate-100 bg-slate-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* الأيقونة الرمزية للمورد */}
                      <div className="w-9 h-9 rounded-lg bg-slate-800 text-white flex items-center justify-center text-sm font-black shrink-0">
                        {firstLetter || '🏢'}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-xs font-black text-slate-900 truncate">
                          {supplier.supplierName}
                        </h3>
                        {supplier.supplierPhone ? (
                          <a
                            href={`tel:${supplier.supplierPhone}`}
                            className="text-[11px] font-mono text-slate-500 hover:text-slate-900 block truncate"
                            dir="ltr"
                          >
                            {supplier.supplierPhone}
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 block">—</span>
                        )}
                      </div>
                    </div>

                    {/* شارة الحالة المختصرة */}
                    <div className="shrink-0">
                      {hasDebt ? (
                        <span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">
                          مطلوب دين
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded">
                          خالص ✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. الخانات الثلاث بشكل طولي (أسطر كاملة مكدسة عمودياً) */}
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-center">
                  {/* السطر الأول: الديون */}
                  <button
                    type="button"
                    onClick={() => onSelectSupplier(supplier, 'debts')}
                    className={`w-full p-2.5 rounded-lg border text-right transition-all cursor-pointer flex items-center justify-between text-xs font-bold ${
                      hasDebt
                        ? 'bg-rose-50/40 hover:bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${hasDebt ? 'bg-rose-600' : 'bg-emerald-600'}`} />
                      <span>الديون</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <span>{hasDebt ? 'عرض الفواتير' : 'مسدد'}</span>
                      <span>←</span>
                    </span>
                  </button>

                  {/* السطر الثاني: المدفوعات */}
                  <button
                    type="button"
                    onClick={() => onSelectSupplier(supplier, 'payments')}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-all cursor-pointer flex items-center justify-between text-xs font-bold"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-600" />
                      <span>المدفوعات</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <span>السجل</span>
                      <span>←</span>
                    </span>
                  </button>

                  {/* السطر الثالث: كشف الحساب / الإجمالي */}
                  <button
                    type="button"
                    onClick={() => onSelectSupplier(supplier, 'all')}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-all cursor-pointer flex items-center justify-between text-xs font-bold"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400" />
                      <span>كشف الحساب</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <span>العمليات</span>
                      <span>←</span>
                    </span>
                  </button>
                </div>

                {/* 3. أسفل الكارت: إجراء سريع رسمي ومباشر */}
                <div className="p-2.5 border-t border-slate-100 bg-white">
                  {hasDebt ? (
                    <button
                      type="button"
                      onClick={() => onSelectSupplier(supplier, 'debts', true)}
                      className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer text-center"
                    >
                      تسديد دفعة
                    </button>
                  ) : (
                    <div className="w-full py-1.5 text-center text-[11px] font-bold text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
                      الحساب مسدد بالكامل
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* في نهاية الصفحة: زر فتح أرشيف جميع الفواتير (يفتح فقط عند الضغط) */}
      {/* ---------------------------------------------------- */}
      <div className="pt-4 border-t border-slate-200/80">
        {!showArchive ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <button
              type="button"
              onClick={() => {
                setShowArchive(true);
                setTimeout(() => {
                  archiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-xs hover:shadow-md flex items-center gap-2.5 active:scale-98"
            >
              <span className="text-base">📁</span>
              <span>عرض أرشيف جميع فواتير الشراء</span>
              <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-md font-mono font-bold">
                {purchases.length}
              </span>
            </button>
            <p className="text-[11px] text-slate-400">
              اضغط لفتح أرشيف الفواتير الشامل مع إمكانية البحث والفلترة
            </p>
          </div>
        ) : (
          <div ref={archiveRef} className="space-y-3 pt-2 animate-fade-in">
            <div className="flex items-center justify-between bg-slate-900 text-white p-3 rounded-xl shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">📁</span>
                <h3 className="text-xs sm:text-sm font-black">
                  أرشيف جميع فواتير الشراء ({purchases.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowArchive(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>✕</span>
                <span>إغلاق الأرشيف</span>
              </button>
            </div>

            {/* مكوّن الأرشيف الشامل مع شريط البحث والفلاتر وجدول الفواتير */}
            <PurchasesArchiveTab
              purchases={purchases}
              supplierDebts={supplierDebts}
              onSelectInvoice={onSelectInvoice}
              onEditInvoice={onEditInvoice}
              onDeleteInvoice={onDeleteInvoice}
              onNewInvoice={onOpenRegisterScreen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
