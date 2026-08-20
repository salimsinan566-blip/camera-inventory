import React, { useMemo, useState } from 'react';
import { useSales } from '../hooks/useSales';
import { useIncomes } from '../hooks/useIncomes';
import { useCustomers } from '../hooks/useCustomers';
import CustomerSelect from './CustomerSelect';
import InvoiceReceipt from './InvoiceReceipt';
import CustomerPaymentModal from './CustomerPaymentModal';

function toDateSafe(timestamp) {
  if (!timestamp) return null;
  return timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
}

export default function CustomerStatementModal({ initialCustomerName = '', onClose }) {
  const { sales, loading: salesLoading } = useSales();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { customers } = useCustomers();
  const [customerName, setCustomerName] = useState(initialCustomerName || '');
  const [viewingSale, setViewingSale] = useState(null);
  const [payingSale, setPayingSale] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  React.useEffect(() => {
    if (initialCustomerName) {
      setCustomerName(initialCustomerName);
    }
  }, [initialCustomerName]);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const customerSales = useMemo(() => {
    if (!customerName.trim()) return [];
    return sales
      .filter((s) => s.customerName && s.customerName.toLowerCase() === customerName.trim().toLowerCase())
      .sort((a, b) => {
        const d1 = toDateSafe(a.createdAt) || new Date(0);
        const d2 = toDateSafe(b.createdAt) || new Date(0);
        return d1 - d2; // أقدم للأحدث
      });
  }, [sales, customerName]);

  const customerIncomes = useMemo(() => {
    if (!customerName.trim()) return [];
    const targetName = customerName.trim().toLowerCase();
    return incomes
      .filter((inc) => {
        const name = (inc.customerName || inc.payerName || '').trim().toLowerCase();
        return name === targetName || (name && targetName && (name.includes(targetName) || targetName.includes(name)));
      })
      .sort((a, b) => {
        const d1 = new Date(a.date || a.createdAt || 0);
        const d2 = new Date(b.date || b.createdAt || 0);
        return d1 - d2;
      });
  }, [incomes, customerName]);

  const summary = useMemo(() => {
    let totalPurchases = 0;
    let totalDebt = 0;
    let cashPaid = 0;
    let oldInvoicesAmount = 0;

    for (const s of customerSales) {
      const type = s.invoiceType || 'cash';
      const amt = Number(s.total) || 0;
      totalPurchases += amt;
      
      if (type === 'debt') {
        const paid = Number(s.paidAmount) || 0;
        const remaining = s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, amt - paid)) : Math.max(0, amt - paid);
        totalDebt += remaining;
        cashPaid += paid;
      } else {
        cashPaid += amt;
      }
    }

    for (const inc of customerIncomes) {
      const amt = Number(inc.amount) || 0;
      oldInvoicesAmount += amt;
      cashPaid += amt;
    }

    return { totalPurchases, totalDebt, cashPaid, oldInvoicesAmount };
  }, [customerSales, customerIncomes]);

  const matchedCustomer = useMemo(() => {
    if (!customerName.trim()) return null;
    const target = customerName.trim().toLowerCase();
    return (customers || []).find(
      (c) => (c.name || '').trim().toLowerCase() === target
    ) || null;
  }, [customers, customerName]);

  const customerPhone = matchedCustomer?.phone1 || customerSales.find(s => s.customerPhone || s.phone)?.customerPhone || '';
  const customerPin = matchedCustomer?.pinCode || (customerPhone ? customerPhone.slice(-4) : 'آخر 4 أرقام');
  const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&name=${encodeURIComponent(customerName)}`;

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  function handleSendWhatsApp() {
    const rawPhone = String(customerPhone).replace(/[\s\-\+\(\)]/g, '');
    const cleanPhone = rawPhone.startsWith('0') ? '964' + rawPhone.slice(1) : (rawPhone.startsWith('964') ? rawPhone : '964' + rawPhone);
    const msg = encodeURIComponent(
      `مرحباً ${customerName}،\nيمكنك الآن متابعة كشف حسابك، فواتيرك، والمبالغ المسددة عبر بوابة عملاء Safe Zone الرسمية:\n🔗 رابط البوابة: ${portalUrl}\n👤 اسم الدخول: ${customerName}\n🔑 رمز المرور (الباسورد): ${customerPin}\n\nشكراً لتعاملكم معنا.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  }

  const statementRows = useMemo(() => {
    const rows = [];

    customerSales.forEach((sale) => {
      const date = toDateSafe(sale.createdAt);
      const isDebt = (sale.invoiceType || 'cash') === 'debt';
      const totalAmt = Number(sale.total) || 0;
      const paidAmt = Number(sale.paidAmount) || 0;
      const remainingAmt = sale.remainingDebt !== undefined 
        ? Math.min(Number(sale.remainingDebt), Math.max(0, totalAmt - paidAmt))
        : Math.max(0, totalAmt - paidAmt);
      const isSettled = isDebt && remainingAmt <= 0;

      rows.push({
        id: `sale-${sale.id}`,
        type: 'sale',
        date: date,
        dateFormatted: date ? date.toLocaleString('ar-IQ') : '—',
        refNumber: `#${sale.invoiceNumber}`,
        badgeLabel: isDebt ? (isSettled ? 'مسدد بالكامل ✓' : paidAmt > 0 ? 'مسدد جزئياً' : 'دين غير مسدد') : 'نقدي',
        badgeClass: isDebt ? (isSettled ? 'text-emerald-700 bg-emerald-100 border border-emerald-200' : paidAmt > 0 ? 'text-amber-800 bg-amber-100 border border-amber-200' : 'text-rose-700 bg-rose-100 border border-rose-200') : 'text-emerald-700 bg-emerald-100',
        itemsDescription: (sale.items || []).map(i => i.name).slice(0, 3).join('، ') + ((sale.items?.length || 0) > 3 ? '...' : ''),
        itemsCount: `${sale.items?.length || 0} مادة`,
        totalAmt,
        paidAmt: isDebt ? paidAmt : totalAmt,
        remainingAmt: isDebt ? remainingAmt : 0,
        saleObj: sale
      });
    });

    customerIncomes.forEach((inc) => {
      const date = inc.date ? new Date(inc.date) : new Date(inc.createdAt || 0);
      const amt = Number(inc.amount) || 0;

      rows.push({
        id: `inc-${inc.id}`,
        type: 'old_invoice',
        date: date,
        dateFormatted: inc.date ? new Date(inc.date).toLocaleDateString('ar-IQ') : (date ? date.toLocaleDateString('ar-IQ') : '—'),
        refNumber: 'سند إيراد سابق',
        badgeLabel: '📑 فاتورة قديمة قبل النظام',
        badgeClass: 'text-indigo-800 bg-indigo-100 border border-indigo-300 font-bold',
        itemsDescription: `${inc.title}${inc.notes ? ` (${inc.notes})` : ''}`,
        itemsCount: 'سند قبض',
        totalAmt: amt,
        paidAmt: amt,
        remainingAmt: 0,
        incomeObj: inc
      });
    });

    return rows.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  }, [customerSales, customerIncomes]);

  const loading = salesLoading || incomesLoading;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-ink-900/60 backdrop-blur-sm print:p-0 print:bg-white" dir="rtl">
      <div id="statement-print" className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden print:block print:max-h-none print:shadow-none print:w-full">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-ink-100 bg-ink-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-ink-900">كشف حساب عميل: {customerName || 'اختر عميل'}</h2>
            <p className="text-sm text-ink-500 mt-1 print:hidden">عرض حركة المشتريات، الديون، ومبالغ الفواتير القديمة قبل النظام</p>
            <p className="text-sm text-ink-500 mt-1 hidden print:block">تاريخ الطباعة: {new Date().toLocaleString('ar-IQ')}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button 
              onClick={() => {
                const originalTitle = document.title;
                document.title = `كشف_حساب_${customerName}`;
                window.print();
                setTimeout(() => { document.title = originalTitle; }, 500);
              }} 
              className="p-2 px-4 text-ink-600 hover:text-brand-600 bg-white rounded-xl shadow-sm border border-ink-200 flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              <span className="font-bold text-sm">طباعة</span>
            </button>
            <button onClick={onClose} className="p-2 text-ink-400 hover:text-ink-700 bg-white rounded-xl shadow-sm border border-ink-200 cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto min-h-0 bg-ink-50/30 space-y-5 print:block print:overflow-visible print:bg-white print:p-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-sm max-w-sm w-full">
              <CustomerSelect value={customerName} onChange={setCustomerName} />
            </div>

            {customerName.trim() && (
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3.5 px-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm border border-slate-700 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-base shrink-0">
                    📱
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 block uppercase">بوابة كشف حساب العميل</span>
                    <div className="text-xs text-slate-200 flex items-center gap-2 mt-0.5">
                      <span>الهاتف: <strong className="text-white font-mono">{customerPhone || 'غير مسجل'}</strong></span>
                      <span className="text-slate-500">•</span>
                      <span>رمز المرور PIN: <strong className="text-emerald-300 font-mono">{customerPin}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPortalLink}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      copiedLink 
                        ? 'bg-emerald-600 text-white border-emerald-500' 
                        : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                    }`}
                  >
                    <span>{copiedLink ? '✓' : '🔗'}</span>
                    <span>{copiedLink ? 'تم نسخ الرابط!' : 'نسخ رابط البوابة'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="إرسال رابط البوابة وبيانات الدخول للعميل عبر واتساب"
                  >
                    <span>💬</span>
                    <span>إرسال واتساب للعميل</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {customerName.trim() && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-brand-100 text-center">
                  <p className="text-xl font-black text-ink-900 font-mono">{summary.totalPurchases.toLocaleString()} د.ع</p>
                  <p className="text-xs text-ink-500 mt-1 font-bold">إجمالي مشتريات النظام (الفواتير)</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                  <p className="text-xl font-black text-emerald-600 font-mono">{summary.cashPaid.toLocaleString()} د.ع</p>
                  <p className="text-xs text-emerald-600 mt-1 font-bold">إجمالي المدفوع نقداً</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-xl shadow-sm border border-indigo-200 text-center">
                  <p className="text-xl font-black text-indigo-800 font-mono">{summary.oldInvoicesAmount.toLocaleString()} د.ع</p>
                  <p className="text-xs text-indigo-700 mt-1 font-bold">فواتير قديمة قبل النظام</p>
                </div>
                <div className="bg-warn-50 p-4 rounded-xl shadow-sm border border-warn-200 text-center">
                  <p className="text-xl font-black text-warn-800 font-mono">{summary.totalDebt.toLocaleString()} د.ع</p>
                  <p className="text-xs text-warn-800 mt-1 font-bold">الديون المتبقية (الآجل)</p>
                </div>
              </div>

              {/* Transactions Table Card */}
              <div className="bg-white rounded-2xl border border-ink-200 shadow-sm overflow-hidden mb-6 print:block print:border-none print:shadow-none">
                <h3 className="p-4 font-bold text-ink-900 border-b border-ink-100 bg-ink-50/50 print:bg-white print:border-ink-200 print:px-0 flex items-center justify-between">
                  <span>سجل الفواتير وسندات القبض السابقة</span>
                  <span className="text-xs font-bold text-slate-500">
                    ({statementRows.length} حركة)
                  </span>
                </h3>
                {loading ? (
                  <p className="p-8 text-center text-ink-400">جارٍ التحميل...</p>
                ) : statementRows.length === 0 ? (
                  <p className="p-8 text-center text-ink-400">لا توجد أي فواتير أو حركات مسجلة باسم "{customerName}"</p>
                ) : (
                  <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-sm text-right whitespace-nowrap">
                      <thead className="bg-ink-50 text-ink-700 border-b border-ink-100 text-xs sticky top-0 z-10 shadow-2xs">
                        <tr>
                          <th className="p-3">التاريخ</th>
                          <th className="p-3">رقم المرجع / الفاتورة</th>
                          <th className="p-3">نوع الحركة</th>
                          <th className="p-3">البيان / الأصناف</th>
                          <th className="p-3">المبلغ الكلي</th>
                          <th className="p-3">المدفوع</th>
                          <th className="p-3">المتبقي (الدين)</th>
                          <th className="p-3 print:hidden text-center">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statementRows.map((row) => {
                          const isOldInvoice = row.type === 'old_invoice';

                          return (
                            <tr 
                              key={row.id} 
                              className={`hover:bg-slate-50 transition-colors ${
                                isOldInvoice 
                                  ? 'bg-indigo-50/30' 
                                  : row.remainingAmt > 0 
                                  ? 'bg-rose-50/20' 
                                  : 'bg-emerald-50/10'
                              }`}
                            >
                              <td className="p-3 text-ink-600 font-mono text-xs">{row.dateFormatted}</td>
                              <td className="p-3 font-bold font-mono text-slate-900">{row.refNumber}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.badgeClass}`}>
                                  {row.badgeLabel}
                                </span>
                              </td>
                              <td className="p-3 text-slate-700 max-w-xs truncate" title={row.itemsDescription}>
                                {row.itemsDescription}
                              </td>
                              <td className="p-3 font-bold text-ink-900 font-mono">{row.totalAmt.toLocaleString()} د.ع</td>
                              <td className="p-3 font-bold text-emerald-700 font-mono">
                                {row.paidAmt.toLocaleString()} د.ع
                              </td>
                              <td className="p-3 font-bold font-mono">
                                {row.remainingAmt > 0 ? (
                                  <span className="text-rose-700 font-black">
                                    {row.remainingAmt.toLocaleString()} د.ع
                                  </span>
                                ) : (
                                  <span className="text-emerald-700">0 د.ع</span>
                                )}
                              </td>
                              <td className="p-3 print:hidden text-left">
                                <div className="flex items-center justify-end gap-2">
                                  {row.saleObj && (
                                    <>
                                      {(row.saleObj.invoiceType === 'debt') && (
                                        <button
                                          onClick={() => setPayingSale(row.saleObj)}
                                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                                            row.remainingAmt <= 0
                                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          }`}
                                        >
                                          <span>💵</span>
                                          <span>{row.remainingAmt <= 0 ? 'سجل الدفعات' : 'تسديد دين'}</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setViewingSale(row.saleObj)}
                                        className="text-brand-600 hover:text-brand-800 text-xs font-bold underline cursor-pointer"
                                      >
                                        عرض الفاتورة
                                      </button>
                                    </>
                                  )}
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
            </>
          )}
        </div>

        {/* Invoices appended to the statement for printing ONLY */}
        <div className="hidden print:block print:w-full">
          {customerSales.map(sale => (
            <div key={sale.id} className="print:break-before-page">
              <InvoiceReceipt sale={sale} inlinePrintMode={true} />
            </div>
          ))}
        </div>
      </div>

      {viewingSale && <InvoiceReceipt sale={viewingSale} onClose={() => setViewingSale(null)} />}
      
      {payingSale && (
        <CustomerPaymentModal
          sale={payingSale}
          onClose={() => setPayingSale(null)}
        />
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #statement-print, #statement-print * { visibility: visible; }
          #statement-print { position: absolute; top: 0; left: 0; width: 100%; height: auto; margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }
          
          /* Force page break behavior */
          .print\\:break-before-page { page-break-before: always; break-before: page; }
          .print\\:break-after-page { page-break-after: always; break-after: page; }
          .print\\:break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
