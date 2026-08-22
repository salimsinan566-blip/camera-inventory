import React, { useState, useEffect, useMemo } from 'react';
import logo from '../assets/logo.png';
import { useSettings } from '../hooks/useSettings';
import InvoiceReceipt from './InvoiceReceipt';
import { 
  getSavedCustomerSession, 
  authenticateCustomer, 
  clearCustomerSession 
} from '../services/customerPortalService';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

export default function CustomerPortal({ onSwitchToStaffLogin }) {
  const { settings } = useSettings();
  const activeLogo = settings?.logoUrl || logo;
  const storeName = settings?.storeName || 'Safe Zone';

  const [session, setSession] = useState(() => getSavedCustomerSession());
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'debt' | 'settled' | 'incomes'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Auto-fill from URL params if present (e.g. ?name=علي_الحسيني or ?customer=علي)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const prefillName = urlParams.get('name') || urlParams.get('customer') || urlParams.get('phone') || '';
    if (prefillName && !identifier) {
      setIdentifier(prefillName.trim());
    }
  }, []);

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const newSession = await authenticateCustomer(identifier, pin, remember);
      setSession(newSession);
    } catch (err) {
      setError(err.message || 'بيانات الدخول غير صحيحة، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearCustomerSession();
    setSession(null);
    setPin('');
    setError('');
  }

  async function handleRefresh() {
    if (!session) return;
    setLoading(true);
    try {
      const refreshed = await authenticateCustomer(session.identifier || session.customer?.name, session.pin, true);
      setSession(refreshed);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Unified Transaction Ledger (Sales + Pre-system Incomes)
  const unifiedTransactions = useMemo(() => {
    if (!session) return [];

    const list = [];
    const sales = session.sales || [];
    const incomes = session.incomes || [];

    sales.forEach((s) => {
      const isDebt = s.invoiceType === 'debt';
      const totalAmt = Number(s.total) || 0;
      const paidAmt = Number(s.paidAmount) || 0;
      const remainingAmt = s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, totalAmt - paidAmt)) : Math.max(0, totalAmt - paidAmt);
      const isSettled = isDebt ? remainingAmt <= 0 : true;

      const itemsDesc = (s.items || []).map(i => `${i.name}${i.quantity > 1 ? ` (${i.quantity})` : ''}`).join('، ');

      list.push({
        id: s.id,
        rawDate: new Date(s.createdAt || 0),
        dateFormatted: s.createdAt ? new Date(s.createdAt).toLocaleDateString('ar-IQ') : '—',
        refNumber: `#${s.invoiceNumber || s.id.slice(0, 6)}`,
        type: isDebt ? (isSettled ? 'debt_settled' : 'debt_active') : 'cash',
        typeLabel: isDebt ? (isSettled ? 'آجل (مسدد بالكامل)' : 'آجل غير مسدد') : 'نقدي (خالص)',
        badgeLabel: isDebt ? (isSettled ? 'آجل مسدد' : 'دين غير مسدد') : 'نقدي (خالص)',
        badgeClass: isDebt 
          ? (isSettled ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200')
          : 'bg-emerald-50 text-emerald-800 border-emerald-200',
        title: itemsDesc ? `فاتورة مبيعات (${itemsDesc})` : 'فاتورة مبيعات',
        totalAmt,
        paidAmt,
        remainingAmt,
        isSettled,
        saleObj: s
      });
    });

    incomes.forEach((inc) => {
      const amt = Number(inc.amount) || 0;
      list.push({
        id: inc.id,
        rawDate: new Date(inc.date || 0),
        dateFormatted: inc.date ? new Date(inc.date).toLocaleDateString('ar-IQ') : '—',
        refNumber: 'سند إيراد سابق',
        type: 'income_presystem',
        typeLabel: 'دفعة سابقة موثقة',
        badgeLabel: 'فاتورة قديمة (مسدد)',
        badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        title: inc.title || 'فاتورة قديمة سابقة قبل النظام',
        totalAmt: amt,
        paidAmt: amt,
        remainingAmt: 0,
        isSettled: true,
        saleObj: null
      });
    });

    // Sort newest first
    return list.sort((a, b) => b.rawDate - a.rawDate);
  }, [session]);

  // Filter & Search
  const displayedTransactions = useMemo(() => {
    return unifiedTransactions.filter((tx) => {
      if (activeFilter === 'debt' && (tx.type !== 'debt_active' || tx.remainingAmt <= 0)) return false;
      if (activeFilter === 'settled' && tx.remainingAmt > 0) return false;
      if (activeFilter === 'incomes' && tx.type !== 'income_presystem') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        return (
          tx.title.toLowerCase().includes(q) ||
          tx.refNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedTransactions, activeFilter, searchTerm]);

  // -------------------------------------------------------------------------
  // 1. LOGIN SCREEN (If customer not authenticated)
  // -------------------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white flex flex-col justify-between p-4 sm:p-6" dir="rtl">
        
        {/* Top Minimal Bar */}
        <div className="max-w-md mx-auto w-full flex items-center justify-center py-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-300">بوابة عملاء Safe Zone الرسمية</span>
          </div>
        </div>

        {/* Center Login Card */}
        <div className="max-w-md mx-auto w-full my-auto py-6">
          <div className="text-center mb-6">
            <div className="inline-block p-4 bg-white rounded-3xl shadow-xl mb-3 border border-white/20">
              <img src={activeLogo} alt={storeName} className="h-20 sm:h-24 max-h-32 w-auto max-w-[260px] object-contain mx-auto" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">بوابة كشف حساب العملاء</h1>
            <p className="text-xs text-slate-300 mt-1">
              استعلم عن فواتيرك، المبالغ المسددة، والديون المتبقية بسهولة وأمان
            </p>
          </div>

          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-start gap-2 animate-shake">
                  <span className="text-base shrink-0">⚠️</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {/* Customer Name Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم العميل المسجل *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="مثال: علي الحسيني (أو رقم هاتفك)"
                    className="w-full p-3 pl-10 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all text-right"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                    👤
                  </span>
                </div>
              </div>

              {/* Password (Last 4 Digits) Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    رمز المرور (الباسورد) *
                  </label>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                    آخر 4 أرقام من رقم هاتفك
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="أدخل آخر 4 أرقام من هاتفك..."
                    className="w-full p-3 pl-16 pr-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold font-mono text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all text-left"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    {showPin ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>تذكرني على هذا الجهاز</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 min-h-[46px]"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>جارٍ التحقق وفتح الحساب...</span>
                  </>
                ) : (
                  <>
                    <span>عرض كشف الحساب</span>
                    <span>←</span>
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="max-w-md mx-auto w-full text-center text-slate-400 text-xs py-4">
          © {new Date().getFullYear()} Safe Zone Systems. جميع الحقوق محفوظة لخدمة العملاء.
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 2. AUTHENTICATED CUSTOMER STATEMENT DASHBOARD
  // -------------------------------------------------------------------------
  const cust = session.customer || {};
  const summ = session.summary || {};
  const isDebtFree = (summ.totalDebt || 0) <= 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between" dir="rtl">
      
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo & Client Greeting */}
          <div className="flex items-center gap-3 min-w-0">
            <img src={activeLogo} alt={storeName} className="h-12 sm:h-14 w-auto max-w-[190px] object-contain shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">بوابة العميل</span>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight truncate">
                {cust.name}
              </h2>
            </div>
          </div>

          {/* Actions: Print, Refresh, Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer border border-slate-200"
              title="طباعة كشف الحساب أو حفظه كـ PDF"
            >
              <span>🖨️</span>
              <span className="hidden sm:inline">طباعة الكشف</span>
            </button>

            <button
              onClick={handleRefresh}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs cursor-pointer border border-slate-200"
              title="تحديث البيانات"
            >
              🔄
            </button>

            <button
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 border border-rose-200 cursor-pointer"
            >
              <span>🚪</span>
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Statement Content */}
      <main className="max-w-6xl mx-auto w-full px-3.5 sm:px-4 py-5 sm:py-6 space-y-5 sm:space-y-6 flex-1">
        
        {/* Customer Profile Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl p-5 sm:p-8 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500"></div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-emerald-400 block mb-1">ملف الحساب والذمة المالية</span>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight">{cust.name}</h1>
              <p className="text-xs text-slate-300 mt-1 font-mono">
                📱 {cust.phone1 || session.identifier} {cust.phone2 ? `• ${cust.phone2}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isDebtFree ? (
                <div className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <span className="text-xl">✓</span>
                  <div>
                    <span className="text-xs font-bold block">حسابك مسدد بالكامل</span>
                    <span className="text-[10px] text-emerald-300/80">لا توجد ديون بذمتكم، شكراً لتعاملكم</span>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-500/20 border border-rose-400/40 text-rose-300 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <span className="text-xl">⏳</span>
                  <div>
                    <span className="text-xs font-bold block">متبقي بذمتكم (دين آجل)</span>
                    <span className="text-base sm:text-lg font-black font-mono text-rose-200">
                      {formatIQD(summ.totalDebt)} د.ع
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4 Financial Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Total Purchases */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold text-slate-500">إجمالي المشتريات</span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-xs sm:text-sm font-bold">🛒</span>
            </div>
            <div>
              <span className="text-lg sm:text-2xl font-black font-mono text-slate-900 block">
                {formatIQD(summ.totalPurchases)}
              </span>
              <span className="text-[11px] text-slate-500">د.ع</span>
            </div>
            <span className="text-[10px] text-slate-400">قيمة كافة المواد المشتراة</span>
          </div>

          {/* Card 2: Total Cash Paid */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-200 shadow-xs flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold text-emerald-800">المبالغ المسددة</span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs sm:text-sm font-bold">💵</span>
            </div>
            <div>
              <span className="text-lg sm:text-2xl font-black font-mono text-emerald-700 block">
                {formatIQD(summ.cashPaid)}
              </span>
              <span className="text-[11px] text-emerald-600">د.ع</span>
            </div>
            <span className="text-[10px] text-emerald-600">مدفوعات نقدية موثقة</span>
          </div>

          {/* Card 3: Pre-system Incomes */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold text-indigo-700">فواتير قديمة سابقة</span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs sm:text-sm font-bold">📑</span>
            </div>
            <div>
              <span className="text-lg sm:text-2xl font-black font-mono text-indigo-800 block">
                {formatIQD(summ.oldInvoicesAmount)}
              </span>
              <span className="text-[11px] text-indigo-600">د.ع</span>
            </div>
            <span className="text-[10px] text-indigo-600">دفعات سابقة موثقة</span>
          </div>

          {/* Card 4: Remaining Debt */}
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-xs flex flex-col justify-between gap-2 ${
            isDebtFree ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] sm:text-xs font-bold ${isDebtFree ? 'text-emerald-800' : 'text-rose-800'}`}>
                الرصيد المتبقي (الدين)
              </span>
              <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold ${
                isDebtFree ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {isDebtFree ? '✓' : '⚠️'}
              </span>
            </div>
            <div>
              <span className={`text-lg sm:text-2xl font-black font-mono block ${isDebtFree ? 'text-emerald-800' : 'text-rose-700'}`}>
                {formatIQD(summ.totalDebt)}
              </span>
              <span className="text-[11px] text-slate-500">د.ع</span>
            </div>
            <span className={`text-[10px] font-bold ${isDebtFree ? 'text-emerald-700' : 'text-rose-600'}`}>
              {isDebtFree ? 'خالص الذمة تماماً' : 'المبلغ المطلوب تسديده'}
            </span>
          </div>

        </div>

        {/* Transactions Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none">
          
          {/* Table Header & Search */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 sm:pb-0">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                كافة الحركات ({unifiedTransactions.length})
              </button>

              <button
                onClick={() => setActiveFilter('debt')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'debt' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                الفواتير الآجلة
              </button>

              <button
                onClick={() => setActiveFilter('settled')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'settled' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                المسددة
              </button>

              <button
                onClick={() => setActiveFilter('incomes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeFilter === 'incomes' ? 'bg-indigo-700 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                }`}
              >
                فواتير قديمة
              </button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث في أرقام الفواتير والمواد..."
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>
          </div>

          {/* Printable Header for A4 Print */}
          <div className="hidden print:block p-6 border-b border-slate-300 text-center">
            <img src={activeLogo} alt={storeName} className="h-20 w-auto max-w-[260px] object-contain mx-auto mb-2.5" />
            <h1 className="text-xl font-black">كشف حساب عميل رسمي</h1>
            <p className="text-xs text-slate-600 mt-1">
              العميل: <strong>{cust.name}</strong> • رقم الهاتف: <strong>{cust.phone1 || session.identifier}</strong>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              تاريخ استخراج الكشف: {new Date().toLocaleString('ar-IQ')}
            </p>
          </div>

          {/* Transactions Content */}
          {displayedTransactions.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm font-bold">لا توجد حركات مطابقة في هذا التصنيف</p>
            </div>
          ) : (
            <>
              {/* 1. Mobile Cards View (sm:hidden) */}
              <div className="block sm:hidden divide-y divide-slate-100">
                {displayedTransactions.map((tx) => (
                  <div key={tx.id} className="p-4 space-y-2.5 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-xs text-slate-900">{tx.refNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${tx.badgeClass}`}>
                          {tx.badgeLabel}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{tx.dateFormatted}</span>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {tx.title}
                    </p>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 block">الإجمالي</span>
                        <span className="text-xs font-black font-mono text-slate-900">{formatIQD(tx.totalAmt)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-emerald-600 block">المسدد</span>
                        <span className="text-xs font-black font-mono text-emerald-700">{formatIQD(tx.paidAmt)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-rose-600 block">المتبقي</span>
                        <span className={`text-xs font-black font-mono ${tx.remainingAmt > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                          {formatIQD(tx.remainingAmt)}
                        </span>
                      </div>
                    </div>

                    {tx.saleObj && (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => setSelectedInvoice(tx.saleObj)}
                          className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer border border-slate-200 flex items-center justify-center gap-1.5"
                        >
                          <span>📄</span>
                          <span>عرض تفاصيل الفاتورة والوصل</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 2. Desktop & Print Table (hidden sm:block) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs text-right whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">التاريخ</th>
                      <th className="p-3.5">المرجع / الفاتورة</th>
                      <th className="p-3.5">نوع الحركة</th>
                      <th className="p-3.5">البيان / تفاصيل المواد</th>
                      <th className="p-3.5">إجمالي المبلغ</th>
                      <th className="p-3.5">المسدد</th>
                      <th className="p-3.5">المتبقي (الدين)</th>
                      <th className="p-3.5 print:hidden text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-mono text-slate-600">{tx.dateFormatted}</td>
                        <td className="p-3.5 font-bold font-mono text-slate-900">{tx.refNumber}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${tx.badgeClass}`}>
                            {tx.badgeLabel}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-800 max-w-xs truncate" title={tx.title}>
                          {tx.title}
                        </td>
                        <td className="p-3.5 font-black font-mono text-slate-900 text-sm">
                          {formatIQD(tx.totalAmt)} د.ع
                        </td>
                        <td className="p-3.5 font-black font-mono text-emerald-700 text-sm">
                          {formatIQD(tx.paidAmt)} د.ع
                        </td>
                        <td className="p-3.5 font-black font-mono">
                          {tx.remainingAmt > 0 ? (
                            <span className="text-rose-700 text-sm">{formatIQD(tx.remainingAmt)} د.ع</span>
                          ) : (
                            <span className="text-emerald-700">0 د.ع</span>
                          )}
                        </td>
                        <td className="p-3.5 print:hidden text-center">
                          {tx.saleObj && (
                            <button
                              onClick={() => setSelectedInvoice(tx.saleObj)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px] transition-colors cursor-pointer border border-slate-300"
                            >
                              عرض الوصل 📄
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Safe Zone لنظم المراقبة والحماية والأمن الإلكتروني</span>
          <span>خدمة كشف الحساب الإلكتروني المباشر للزبائن</span>
        </div>
      </footer>

      {/* Official Invoice Receipt Modal for Customer */}
      {selectedInvoice && (
        <InvoiceReceipt
          sale={{
            ...selectedInvoice,
            customerName: selectedInvoice.customerName || session?.customer?.name || session?.identifier || 'العميل',
            customerPhone: selectedInvoice.customerPhone || session?.customer?.phone1 || session?.customer?.phone2 || session?.customer?.phone || '',
            customerId: selectedInvoice.customerId || session?.customer?.id || ''
          }}
          isCustomerPortalView={true}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

    </div>
  );
}
