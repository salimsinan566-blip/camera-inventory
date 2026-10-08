import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import html2pdf from 'html2pdf.js';
import defaultLogo from '../../assets/logo.png';

function formatIQD(num) {
  if (num === undefined || num === null) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

/**
 * وثيقة التقرير المالي الرسمي A4
 * تستخدم Portal إلى document.body لضمان ظهور وثيقة الطباعة 100% بدون أي صفحات بيضاء
 * الصفحة الأولى: جدول ملخص سجلات الكشف المالي والإجماليات والتواقيع
 * الصفحات التالية: ملحق تفصيلي لكل فاتورة بصفحات منفصلة واضحة وسهلة للقراءة
 */
export default function PrintableReportDocument({
  title = 'كشف حساب رسمي',
  subtitle = '',
  reportCode = '',
  filterDescription = '',
  kpis = [],
  columns = [],
  data = [],
  totals = null,
  storeSettings = {},
  userName = 'المحاسب المسؤول',
  onClose = null,
  detailedInvoices = [],
}) {
  const documentRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [includeDetailedPages, setIncludeDetailedPages] = useState(true);

  const logoUrl = storeSettings?.logoUrl || defaultLogo;
  const rawStoreName = storeSettings?.storeName || 'المنطقة الآمنة';
  const storeName = (!rawStoreName || rawStoreName.trim().toUpperCase() === 'SAFE ZONE')
    ? 'المنطقة الآمنة'
    : rawStoreName.replace(/safe\s*zone/gi, 'المنطقة الآمنة');
  const currentDate = new Date().toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const currentTime = new Date().toLocaleTimeString('ar-IQ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    try {
      setDownloading(true);
      const cleanFileName = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      
      const opt = {
        margin: [6, 6, 6, 6],
        filename: cleanFileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          scrollY: 0,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { 
          mode: ['css', 'legacy'], 
          avoid: ['.break-inside-avoid', 'tr', '.invoice-card-compact', 'footer']
        }
      };

      await html2pdf().set(opt).from(documentRef.current).save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  const renderSignaturesFooter = () => (
    <footer className="mt-5 pt-4 border-t-2 border-slate-800 break-inside-avoid">
      <div className="grid grid-cols-3 gap-6 text-center text-xs">
        {/* المحاسب */}
        <div className="space-y-1">
          <span className="font-bold text-slate-600 block">إعداد الكشف</span>
          <span className="font-black text-slate-900 block text-xs">{userName}</span>
          <div className="pt-5">
            <div className="w-28 mx-auto border-b border-slate-400 border-dotted"></div>
            <span className="text-[10px] text-slate-400 font-mono block mt-1">توقيع المحاسب</span>
          </div>
        </div>

        {/* التدقيق */}
        <div className="space-y-1">
          <span className="font-bold text-slate-600 block">تدقيق الحسابات</span>
          <span className="font-black text-slate-900 block text-xs">التدقيق المالي</span>
          <div className="pt-5">
            <div className="w-28 mx-auto border-b border-slate-400 border-dotted"></div>
            <span className="text-[10px] text-slate-400 font-mono block mt-1">توقيع المدقق</span>
          </div>
        </div>

        {/* المصادقة والختم */}
        <div className="space-y-1">
          <span className="font-bold text-slate-600 block">المصادقة الإدارية</span>
          <span className="font-black text-slate-900 block text-xs">الإدارة</span>
          <div className="pt-5">
            <div className="w-28 mx-auto border-b border-slate-400 border-dotted"></div>
            <span className="text-[10px] text-slate-400 font-mono block mt-1">الختم والمصادقة</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-[10px] text-slate-400 font-mono border-t border-slate-200 pt-2">
        تاريخ واستخراج الكشف: {currentDate} {currentTime}
      </div>
    </footer>
  );

  const portalContent = (
    <div id="printable-report-portal" dir="rtl">
      {/* إطار المودال العام */}
      <div className="report-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start p-3 sm:p-6 select-none print:static print:p-0 print:m-0 print:bg-white print:overflow-visible">
        
        {/* شريط التحكم والعمليات (مخفي كلياً في الطباعة والـ PDF) */}
        <div className="w-full max-w-4xl bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 px-5 py-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base tracking-wide text-white">{title}</h3>
              <span className="text-[11px] text-slate-400 font-mono">{reportCode || 'A4 Report'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {detailedInvoices && detailedInvoices.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-300 font-bold cursor-pointer select-none bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-750 transition-colors">
                <input
                  type="checkbox"
                  checked={includeDetailedPages}
                  onChange={(e) => setIncludeDetailedPages(e.target.checked)}
                  className="rounded accent-indigo-600 cursor-pointer"
                />
                <span>تضمين صفحات الفواتير ({detailedInvoices.length})</span>
              </label>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="تحميل ملف PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>{downloading ? 'جارٍ التصدير...' : 'تنزيل PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              title="طباعة الكشف A4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>طباعة (A4)</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                title="إغلاق"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* مساحة وثيقة الكشف الرسمية A4 */}
        <div 
          ref={documentRef}
          id="report-printable-area"
          className="w-full max-w-4xl bg-white text-slate-900 rounded-none shadow-2xl p-5 sm:p-8 border-2 border-slate-300 print:border-none print:shadow-none print:p-0 print:max-w-none print:w-full space-y-4"
        >
          {/* ======================================================== */}
          {/* الترويسة + المؤشرات + جدول سجلات الكشف + الملحق التفصيلي */}
          {/* ======================================================== */}
          <div className="space-y-4">
            {/* الترويسة الرسمية المعتمدة */}
            <header className="border-b-2 border-slate-900 pb-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                {/* اسم المنشأة والقسم */}
                <div className="text-right space-y-1 w-1/3">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                    {storeName}
                  </h1>
                  <p className="text-xs font-bold text-slate-600">
                    قسم الحسابات والمالية
                  </p>
                </div>

                {/* الشعار الوسطي الكبير */}
                <div className="flex flex-col items-center justify-center text-center w-1/3">
                  <div className="h-24 w-44 sm:h-28 sm:w-52 flex items-center justify-center">
                    <img 
                      src={logoUrl} 
                      alt={storeName} 
                      className="max-h-24 sm:max-h-28 w-auto max-w-full object-contain" 
                    />
                  </div>
                </div>

                {/* بيانات الوثيقة والتاريخ */}
                <div className="text-left font-mono text-xs space-y-1 w-1/3">
                  <div className="bg-slate-900 text-white font-bold px-2 py-0.5 rounded text-[10px] inline-block mb-0.5">
                    تقرير رسمي
                  </div>
                  <p className="text-slate-700 font-bold">
                    الكود: <span className="text-slate-900">{reportCode || 'REF-OFFICIAL'}</span>
                  </p>
                  <p className="text-slate-600">
                    التاريخ: <span className="text-slate-900 font-bold">{currentDate}</span>
                  </p>
                  <p className="text-slate-600">
                    الوقت: <span className="text-slate-900">{currentTime}</span>
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    العملة: دينار عراقي (IQD)
                  </p>
                </div>
              </div>
            </header>

            {/* شريط عنوان الكشف ونطاق التصفية */}
            <div className="border border-slate-300 bg-slate-50/70 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{subtitle}</p>
                )}
              </div>

              {filterDescription && (
                <div className="text-left sm:text-right border-r sm:border-r border-slate-300 pr-3">
                  <span className="text-xs font-bold text-slate-800">
                    {filterDescription}
                  </span>
                </div>
              )}
            </div>

            {/* المؤشرات والإجماليات الرئيسية */}
            {kpis.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {kpis.map((kpi, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 border rounded-lg ${
                      kpi.highlight 
                        ? 'border-slate-400 bg-slate-100 text-slate-900' 
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                  >
                    <span className="text-[10px] font-bold text-slate-500 block leading-tight mb-1">
                      {kpi.label}
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono block leading-none text-slate-900">
                      {typeof kpi.value === 'number' ? formatIQD(kpi.value) : kpi.value}
                      {kpi.currency && <span className="text-[10px] font-bold text-slate-500 mr-1">{kpi.currency}</span>}
                    </span>
                    {kpi.subtext && (
                      <span className="text-[9px] text-slate-500 block mt-1 font-semibold leading-tight">
                        {kpi.subtext}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* جدول سجلات الكشف الرسمي (الصفحة الأولى) */}
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white border border-slate-900">
                    <th className="py-2 px-2.5 font-bold text-center w-10 border border-slate-800 text-[11px]">ت</th>
                    {columns.map((col, idx) => (
                      <th 
                        key={idx} 
                        className={`py-2 px-2.5 font-bold border border-slate-800 text-[11px] ${
                          col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                        }`}
                        style={col.width ? { width: col.width } : {}}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-8 text-center text-slate-500 font-bold border border-slate-300">
                        لا توجد بيانات مسجلة
                      </td>
                    </tr>
                  ) : (
                    data.map((row, rowIdx) => (
                      <tr 
                        key={rowIdx} 
                        className={`border border-slate-300 ${
                          rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        }`}
                      >
                        <td className="py-2 px-2.5 text-center font-bold text-slate-500 font-mono border border-slate-300 text-[11px]">
                          {rowIdx + 1}
                        </td>
                        {columns.map((col, colIdx) => {
                          const val = row[col.key];
                          const rendered = col.render ? col.render(val, row, rowIdx) : val;

                          return (
                            <td 
                              key={colIdx} 
                              className={`py-2 px-2.5 border border-slate-300 text-[11px] ${
                                col.isMono ? 'font-mono' : ''
                              } ${
                                col.isBold ? 'font-black text-slate-900' : 'font-medium text-slate-800'
                              } ${
                                col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                              }`}
                            >
                              {rendered !== undefined && rendered !== null ? rendered : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>

                {/* سطر الإجمالي المحاسبي المزدوج */}
                {totals && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-800 border-b-4 border-double border-slate-800 font-black text-slate-900">
                      <td className="py-2 px-2.5 text-center border border-slate-300 font-bold text-xs">الإجمالي</td>
                      {columns.map((col, colIdx) => {
                        const totalVal = totals[col.key];
                        return (
                          <td 
                            key={colIdx} 
                            className={`py-2 px-2.5 border border-slate-300 font-black text-xs ${
                              col.isMono ? 'font-mono' : ''
                            } ${
                              col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                            }`}
                          >
                            {totalVal !== undefined ? totalVal : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* خانات الاعتماد تظهر هنا إذا لم تكن هناك صفحات تفصيلية تابعة */}
            {!(includeDetailedPages && detailedInvoices && detailedInvoices.length > 0) && renderSignaturesFooter()}
          </div>

          {/* ======================================================== */}
          {/* الملحق التفصيلي للفواتير (تتابع مضغوط بدون فراغات بيضاء) */}
          {/* ======================================================== */}
          {includeDetailedPages && detailedInvoices && detailedInvoices.length > 0 && (
            <div className="mt-4 pt-3 border-t-2 border-slate-300 space-y-3">
              <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-lg border border-slate-200 break-inside-avoid">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 text-white text-xs font-bold px-2 py-0.5 rounded">
                    الملحق التفصيلي
                  </span>
                  <h3 className="font-black text-xs sm:text-sm text-slate-900">
                    قوائم وتفاصيل الفواتير ({detailedInvoices.length} فاتورة)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  مرفق بكشف: {title}
                </span>
              </div>

              {detailedInvoices.map((inv, invIdx) => {
                const items = inv.items || [];
                const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
                const shipping = Number(inv.shippingCost) || 0;

                const invTotal = Number(
                  inv.numericTotal !== undefined 
                    ? inv.numericTotal 
                    : (inv.total !== undefined ? inv.total : (inv.totalAmount || 0))
                ) || 0;

                const isDebt = inv.invoiceType === 'debt' || 
                               inv.paymentMethod === 'debt' || 
                               (inv.remainingDebt !== undefined && Number(inv.remainingDebt) > 0) ||
                               (inv.numericRemaining !== undefined && Number(inv.numericRemaining) > 0) ||
                               (inv.computedRemaining !== undefined && Number(inv.computedRemaining) > 0) ||
                               inv.paymentStatus === 'unpaid' ||
                               inv.paymentStatus === 'partial';

                const paymentsSum = Array.isArray(inv.payments) 
                  ? inv.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) 
                  : 0;

                let invPaid = 0;
                if (inv.numericPaid !== undefined && inv.numericPaid !== null) {
                  invPaid = Number(inv.numericPaid);
                } else if (inv.computedPaid !== undefined && inv.computedPaid !== null) {
                  invPaid = Number(inv.computedPaid);
                } else if (inv.paidAmount !== undefined && inv.paidAmount !== null) {
                  invPaid = Number(inv.paidAmount);
                }
                if (paymentsSum > invPaid) {
                  invPaid = paymentsSum;
                }
                if (!isDebt) {
                  invPaid = invTotal;
                } else {
                  invPaid = Math.min(invTotal, Math.max(0, invPaid));
                }

                let invRemaining = 0;
                if (isDebt) {
                  if (inv.numericRemaining !== undefined && inv.numericRemaining !== null) {
                    invRemaining = Number(inv.numericRemaining);
                  } else if (inv.computedRemaining !== undefined && inv.computedRemaining !== null) {
                    invRemaining = Number(inv.computedRemaining);
                  } else if (inv.remainingDebt !== undefined && inv.remainingDebt !== null) {
                    invRemaining = Number(inv.remainingDebt);
                  } else {
                    invRemaining = Math.max(0, invTotal - invPaid);
                  }
                  if (invTotal > 0 && invPaid > 0 && invRemaining === invTotal) {
                    invRemaining = Math.max(0, invTotal - invPaid);
                  }
                  if (invPaid >= invTotal && invTotal > 0) {
                    invRemaining = 0;
                  }
                } else {
                  invRemaining = 0;
                }

                const isSettled = !isDebt || invRemaining <= 0 || inv.isSettled === true || inv.paymentStatus === 'paid';
                const isPartial = isDebt && !isSettled && invPaid > 0;
                const isUnpaid = isDebt && !isSettled && invPaid === 0;

                return (
                  <div 
                    key={inv.id || invIdx}
                    className="invoice-card-compact break-inside-avoid bg-white border border-slate-300 rounded-lg p-3 shadow-2xs space-y-2 mb-3"
                  >
                    {/* ترويسة بطاقة الفاتورة */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black bg-slate-900 text-white px-2 py-0.5 rounded">
                          #{inv.invoiceNumber || '—'}
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {inv.customerName ? `فاتورة مبيعات: ${inv.customerName}` : (inv.supplierName ? `فاتورة شراء: ${inv.supplierName}` : 'فاتورة')}
                        </span>
                        {(inv.customerPhone || inv.supplierPhone || inv.phone) && (
                          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline" dir="ltr">
                            ({inv.customerPhone || inv.supplierPhone || inv.phone})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-mono text-[11px]">{inv.date || currentDate}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSettled 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : isPartial 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isSettled 
                            ? 'مسددة بالكامل ✓' 
                            : isPartial 
                              ? `مسددة جزئياً (متبقي: ${formatIQD(invRemaining)} د.ع)` 
                              : `غير مسددة (دين: ${formatIQD(invRemaining)} د.ع)`}
                        </span>
                      </div>
                    </div>

                    {/* بطاقة ملخص المبالغ والبيانات السريعة */}
                    <div className="bg-slate-50 border border-slate-200 rounded p-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">إجمالي الفاتورة:</span>
                        <span className="font-black font-mono text-slate-900 text-xs">
                          {formatIQD(invTotal)} د.ع
                        </span>
                        {shipping > 0 && (
                          <span className="text-[9px] text-slate-400 block">يشمل {formatIQD(shipping)} شحن</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">المبلغ المسدد:</span>
                        <span className="font-bold font-mono text-emerald-700 text-xs">
                          {formatIQD(invPaid)} د.ع
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">الرصيد المتبقي (الذمة):</span>
                        <span className={`font-black font-mono text-xs ${invRemaining > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                          {invRemaining > 0 ? `${formatIQD(invRemaining)} د.ع` : '0 د.ع (خالص)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">عدد المواد:</span>
                        <span className="font-bold font-mono text-slate-800 text-xs">
                          {items.length} صنف ({totalQty} قطعة)
                        </span>
                      </div>
                    </div>

                    {/* جدول تفاصيل المواد المضغوط */}
                    {items.length === 0 ? (
                      <div className="border border-slate-200 p-2 text-center text-slate-500 rounded text-[11px]">
                        {inv.isOpeningDebt ? 'سند رصيد افتتاحي سابق (لا توجد تفاصيل مواد)' : 'لا توجد تفاصيل مواد مدخلة لهذه الفاتورة'}
                      </div>
                    ) : (
                      <table className="w-full text-right border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="py-1 px-2 text-center w-8 border border-slate-700 text-[10px]">ت</th>
                            <th className="py-1 px-2 border border-slate-700 text-[10px]">اسم المادة / الصنف</th>
                            <th className="py-1 px-2 text-center w-16 border border-slate-700 text-[10px]">الكمية</th>
                            <th className="py-1 px-2 text-left w-24 border border-slate-700 text-[10px]">سعر المفرد</th>
                            {shipping > 0 && (
                              <th className="py-1 px-2 text-left w-20 border border-slate-700 text-[10px]">الشحن/قطعة</th>
                            )}
                            <th className="py-1 px-2 text-left w-24 border border-slate-700 text-[10px]">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {items.map((it, itIdx) => {
                            const qty = Number(it.quantity) || 1;
                            const price = Number(it.unitPrice !== undefined ? it.unitPrice : (it.costPrice || it.baseCostPrice)) || 0;
                            const lineTotal = it.lineTotal !== undefined ? Number(it.lineTotal) : qty * price;
                            const unitShip = Number(it.unitShippingCost) || 0;

                            return (
                              <tr 
                                key={itIdx} 
                                className={`border border-slate-200 ${itIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                              >
                                <td className="py-1 px-2 text-center font-bold text-slate-500 font-mono border border-slate-200 text-[10px]">
                                  {itIdx + 1}
                                </td>
                                <td className="py-1 px-2 font-bold text-slate-900 border border-slate-200 text-[11px]">
                                  {it.name || it.productName || 'مادة'}
                                  {it.cameraType && (
                                    <span className="text-[10px] text-slate-400 font-normal mr-1.5">({it.cameraType})</span>
                                  )}
                                </td>
                                <td className="py-1 px-2 text-center font-mono font-bold text-slate-800 border border-slate-200 text-[11px]">
                                  {qty}
                                </td>
                                <td className="py-1 px-2 text-left font-mono font-medium text-slate-700 border border-slate-200 text-[11px]">
                                  {formatIQD(price)} د.ع
                                </td>
                                {shipping > 0 && (
                                  <td className="py-1 px-2 text-left font-mono text-slate-600 border border-slate-200 text-[10px]">
                                    {unitShip > 0 ? `+${formatIQD(unitShip)}` : '—'}
                                  </td>
                                )}
                                <td className="py-1 px-2 text-left font-mono font-bold text-slate-900 border border-slate-200 text-[11px]">
                                  {formatIQD(lineTotal)} د.ع
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold text-slate-900 text-[11px]">
                            <td colSpan={2} className="py-1 px-2 text-right border border-slate-200">
                              مجموع: {items.length} صنف ({totalQty} قطعة)
                            </td>
                            <td colSpan={shipping > 0 ? 3 : 2} className="py-1 px-2 text-left font-mono border border-slate-200 text-[10px]">
                              {shipping > 0 ? `شحن: ${formatIQD(shipping)} د.ع | إجمالي:` : 'إجمالي الفاتورة:'}
                            </td>
                            <td className="py-1 px-2 text-left font-mono font-black text-slate-900 border border-slate-200 text-[11px]">
                              {formatIQD(inv.total !== undefined ? inv.total : inv.totalAmount)} د.ع
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* ملاحظات الفاتورة وتوقيع الاستلام */}
                    {(inv.notes || inv.paymentMethod) && (
                      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                        <div>
                          {inv.notes && <span>ملاحظات: {inv.notes} </span>}
                          {inv.paymentMethod && <span className="mr-2">طريقة السداد: {inv.paymentMethod}</span>}
                        </div>
                        <span className="font-mono">تدقيق: {userName}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* خانات الاعتماد الرسمية في نهاية الملحق التفصيلي */}
              {renderSignaturesFooter()}
            </div>
          )}
        </div>
      </div>

      {/* قواعد الطباعة الصارمة الموحدة عبر Portal المستقل */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 6mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* إخفاء التطبيق الأساسي تماماً حتى يظهر الـ Portal فقط */
          body > :not(#printable-report-portal) {
            display: none !important;
          }
          #root {
            display: none !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
          }
          #printable-report-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            height: auto !important;
          }
          .report-modal-overlay {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          #report-printable-area {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            height: auto !important;
          }
          .print-page-break-before {
            page-break-before: auto !important;
            break-before: auto !important;
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
          tr, .break-inside-avoid, .invoice-card-compact, footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(portalContent, document.body) : portalContent;
}
