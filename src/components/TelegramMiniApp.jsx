import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProducts } from '../hooks/useProducts';
import { useCustomers } from '../hooks/useCustomers';
import { useSettings } from '../hooks/useSettings';
import { useUI } from '../contexts/UIContext';
import { checkoutSale } from '../services/salesService';
import { createOffer } from '../services/offersService';
import { login, logout } from '../firebase/auth';
import { searchProducts } from '../utils/search';
import { generateInvoicePdfBlob } from '../utils/pdfHelper';
import InvoiceReceipt from './InvoiceReceipt';

export default function TelegramMiniApp({ onSwitchToStaffLogin }) {
  const { user, loading: authLoading } = useAuth();
  const { products = [], loading: productsLoading, error: productsError } = useProducts();
  const { customers = [] } = useCustomers();
  const { settings = {} } = useSettings();
  const { toast } = useUI();

  // Exchange Rate (IQD / USD)
  const exchangeRate = useMemo(() => {
    return Number(settings?.usdExchangeRate || settings?.exchangeRate || 1500);
  }, [settings]);

  // Price Resolver
  const getProductPrice = (p) => {
    if (!p) return { iqd: 0, usd: 0 };
    
    let iqd = 0;
    if (p.retailPrice !== undefined && p.retailPrice !== null && p.retailPrice !== '') {
      iqd = Number(p.retailPrice);
    } else if (p.price !== undefined && p.price !== null && p.price !== '') {
      iqd = Number(p.price);
    } else if (p.sellingPrice !== undefined && p.sellingPrice !== null && p.sellingPrice !== '') {
      iqd = Number(p.sellingPrice);
    } else if (p.selling_price !== undefined && p.selling_price !== null && p.selling_price !== '') {
      iqd = Number(p.selling_price);
    } else if (p.wholesalePrice !== undefined && p.wholesalePrice !== null && p.wholesalePrice !== '') {
      iqd = Number(p.wholesalePrice);
    }
    if (isNaN(iqd)) iqd = 0;

    let usd = 0;
    if (p.retailPriceUSD !== undefined && p.retailPriceUSD !== null && p.retailPriceUSD !== '') {
      usd = Number(p.retailPriceUSD);
    } else if (p.priceUSD !== undefined && p.priceUSD !== null && p.priceUSD !== '') {
      usd = Number(p.priceUSD);
    } else if (iqd > 0 && exchangeRate > 0) {
      usd = Number((iqd / exchangeRate).toFixed(2));
    }
    if (isNaN(usd)) usd = 0;

    // If IQD is 0 but USD is available, compute IQD
    if (iqd === 0 && usd > 0 && exchangeRate > 0) {
      iqd = Math.round(usd * exchangeRate);
    }

    return { iqd, usd };
  };

  // Login Form States (If not logged in)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Mode: 'pos' (بيع حقيقي) or 'offer' (عرض سعر)
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'offer'

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock'
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'price_asc' | 'price_desc' | 'name'
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // Cart & Order State
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentType, setPaymentType] = useState('cash'); // 'cash' | 'debt'
  const [paidAmount, setPaidAmount] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedDoc, setCompletedDoc] = useState(null);
  const [showFullReceipt, setShowFullReceipt] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);
  const [chatId, setChatId] = useState(null);

  // Read Telegram WebApp context
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      try {
        tg.enableClosingConfirmation();
      } catch (e) {}
      const tgU = tg.initDataUnsafe?.user;
      if (tgU) {
        setTelegramUser(tgU);
        setChatId(tgU.id);
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'offer') setActiveTab('offer');
    if (params.get('chat_id')) setChatId(params.get('chat_id'));
  }, []);

  // Handle Firebase Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await login(email.trim(), password);
      toast('تم تسجيل الدخول بنجاح! 🚀', 'success');
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err.message || 'بيانات الدخول غير صحيحة');
      toast('فشل تسجيل الدخول: تأكد من البريد وكلمة المرور', 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast('تم تسجيل الخروج', 'info');
    } catch (e) {}
  };

  // Seller Name
  const sellerName = useMemo(() => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    if (telegramUser?.first_name) return `${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim();
    return 'البائع / الكاشير';
  }, [user, telegramUser]);

  // Sync customer phone if selected from list
  const handleSelectCustomer = (cId) => {
    setSelectedCustomerId(cId);
    if (!cId) {
      setCustomerName('');
      setCustomerPhone('');
      return;
    }
    const c = customers.find(x => x.id === cId);
    if (c) {
      setCustomerName(c.name || '');
      setCustomerPhone(c.phone1 || c.phone || '');
    }
  };

  // Categories list extracted dynamically from cameraType / category
  const categories = useMemo(() => {
    const set = new Set();
    (products || []).forEach(p => {
      const cat = (p.cameraType || p.category || p.type || '').trim();
      if (cat) set.add(cat);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered and Sorted Products
  const filteredProducts = useMemo(() => {
    let list = searchProducts(products || [], searchTerm);

    // 1. Category Filter
    if (selectedCategory !== 'all') {
      list = list.filter(p => (p.cameraType || p.category || p.type || '').trim() === selectedCategory);
    }

    // 2. Stock Filter
    if (stockFilter === 'in_stock') {
      list = list.filter(p => (Number(p.storeQty) || 0) > 0 || (Number(p.warehouseQty) || 0) > 0 || (Number(p.quantity) || 0) > 0);
    } else if (stockFilter === 'low_stock') {
      list = list.filter(p => {
        const total = (Number(p.storeQty) || 0) + (Number(p.warehouseQty) || 0) + (Number(p.quantity) || 0);
        return total > 0 && total <= (Number(p.storeMinThreshold || p.minThreshold) || 3);
      });
    }

    // 3. Sorting
    if (sortBy === 'price_asc') {
      list.sort((a, b) => getProductPrice(a).iqd - getProductPrice(b).iqd);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => getProductPrice(b).iqd - getProductPrice(a).iqd);
    } else if (sortBy === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    }

    return list;
  }, [products, searchTerm, selectedCategory, stockFilter, sortBy, exchangeRate]);

  // Cart operations
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      const storeQty = Number(product.storeQty !== undefined ? product.storeQty : product.quantity || 0);
      const totalQty = storeQty + Number(product.warehouseQty || 0);
      const priceObj = getProductPrice(product);
      const unitPrice = priceObj.iqd;

      if (existing) {
        if (activeTab === 'pos' && existing.quantity >= (storeQty > 0 ? storeQty : totalQty)) {
          toast(`الكمية المتاحة في المحل (${storeQty}) فقط`, 'warning');
          return prev;
        }
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      } else {
        if (activeTab === 'pos' && totalQty <= 0) {
          toast('هذا المنتج نافذ من المخزون حالياً', 'warning');
          return prev;
        }
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku || '',
            barcode: product.barcode || '',
            unitPrice,
            quantity: 1,
            lineTotal: unitPrice,
            image: product.imageUrl || product.image || null,
            maxStock: storeQty > 0 ? storeQty : totalQty
          }
        ];
      }
    });
    toast(`تمت إضافة «${product.name.slice(0, 20)}» للسلة 🛒`, 'success');
  };

  const updateQuantity = (productId, newQty) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        if (activeTab === 'pos' && item.maxStock && newQty > item.maxStock) {
          toast(`أقصى كمية متوفرة: ${item.maxStock}`, 'warning');
          return item;
        }
        return {
          ...item,
          quantity: newQty,
          lineTotal: newQty * item.unitPrice
        };
      }
      return item;
    }));
  };

  const updateCartUnitPrice = (productId, newPrice) => {
    const p = Math.max(0, Number(newPrice) || 0);
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        return {
          ...item,
          unitPrice: p,
          lineTotal: item.quantity * p
        };
      }
      return item;
    }));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  // Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  }, [cart]);

  const totalDiscount = Number(discount) || 0;
  const taxableAmount = Math.max(0, cartSubtotal - totalDiscount);
  const taxAmount = (taxableAmount * (Number(taxRate) || 0)) / 100;
  const cartTotal = taxableAmount + taxAmount;
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartTotalUSD = exchangeRate > 0 ? (cartTotal / exchangeRate).toFixed(2) : 0;

  // Submit Order (POS or Quotation)
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) {
      toast('يرجى إضافة منتجات إلى السلة أولاً', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const activeSeller = user?.email || sellerName;

      if (activeTab === 'offer') {
        // إنشاء عرض سعر
        const offerData = await createOffer(
          cart.map(i => ({
            productId: i.productId,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal
          })),
          {
            offerName: offerTitle.trim() || `عرض سعر - ${customerName.trim() || 'عميل'}`,
            customerName: customerName.trim() || 'عميل عام',
            notes: offerNotes.trim(),
            discount: totalDiscount,
            taxRate: Number(taxRate) || 0,
            cashierEmail: activeSeller
          }
        );

        setCompletedDoc({
          ...offerData,
          isOffer: true,
          invoiceNumber: offerData.offerNumber,
          customerPhone: customerPhone.trim(),
          items: cart,
          cashierEmail: activeSeller
        });
        toast('تم إنشاء وحفظ عرض السعر بنجاح! 📑🎉', 'success');
        setCart([]);
        setIsCartOpen(false);
      } else {
        // إتمام عملية بيع حية (POS)
        const finalPaid = paymentType === 'debt' 
          ? (paidAmount !== '' ? Number(paidAmount) : 0)
          : cartTotal;

        const saleResult = await checkoutSale(
          cart.map(i => ({
            productId: i.productId,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice
          })),
          activeSeller,
          {
            customerName: customerName.trim() || 'زبون عام',
            phone1: customerPhone.trim(),
            customerId: selectedCustomerId || null,
            invoiceType: paymentType,
            paidAmount: finalPaid,
            discount: totalDiscount,
            taxRate: Number(taxRate) || 0,
            notes: offerNotes.trim(),
            stockSource: 'store'
          }
        );

        setCompletedDoc({
          ...saleResult,
          isOffer: false,
          customerName: customerName.trim() || 'زبون عام',
          customerPhone: customerPhone.trim(),
          items: cart,
          total: cartTotal,
          subtotal: cartSubtotal,
          discount: totalDiscount,
          paidAmount: finalPaid,
          invoiceType: paymentType,
          cashierEmail: activeSeller
        });
        toast(`تم تسجيل الفاتورة #${saleResult.invoiceNumber} بنجاح! 🛒🎉`, 'success');
        setCart([]);
        setIsCartOpen(false);
      }
    } catch (err) {
      console.error('Submission failed:', err);
      toast(`فشل التنفيذ: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const [sendingTelegram, setSendingTelegram] = useState(false);

  // Send PDF directly to Telegram Chat via backend
  const handleSendToTelegram = async (docObj) => {
    const targetChat = chatId || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || settings?.telegramChatId;
    if (!targetChat) {
      toast('لم يتم التعرف على محادثة التليجرام. تأكد من فتح التطبيق من البوت مباشرة.', 'warning');
      return;
    }

    setSendingTelegram(true);
    toast('جارٍ إنشاء ملف الـ PDF وإرساله لمحادثتك بالتليجرام... ⏳', 'info');

    try {
      let pdfBase64 = null;
      try {
        // High quality Arabic PDF generator
        const pdfBlob = await generateInvoicePdfBlob(docObj, settings);
        if (pdfBlob) {
          pdfBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
          });
        }
      } catch (err) {
        console.warn('Fallback to server PDF generation:', err);
      }

      const res = await fetch('/api/telegram-send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: targetChat,
          doc: docObj,
          pdfBase64,
          storeInfo: settings
        })
      });

      const data = await res.json().catch(() => ({}));
      if (data.success || res.ok) {
        toast('تم إرسال ملف الـ PDF إلى محادثتك بالتليجرام بنجاح! ✈️📄', 'success');
      } else {
        throw new Error(data.error || 'فشل الإرسال عبر البوت');
      }
    } catch (e) {
      console.error('Telegram send error:', e);
      toast(`تعذر الإرسال للبوت: ${e.message}`, 'error');
    } finally {
      setSendingTelegram(false);
    }
  };

  // 1. LOADING AUTH
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-xs text-slate-500 font-bold" dir="rtl">
        جارٍ التحقق من جلسة الدخول...
      </div>
    );
  }

  // 2. CASHIER LOGIN SCREEN (If not logged in to Firebase)
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm shadow-xl text-center space-y-5">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 rounded-2xl mx-auto object-contain p-1 border border-slate-100 shadow-sm" />
          ) : (
            <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center text-2xl font-black mx-auto border border-brand-100">
              SZ
            </div>
          )}

          <div>
            <h2 className="text-lg font-black text-slate-900">
              {settings?.storeName || 'Safe Zone'} — تسجيل الدخول
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              يرجى تسجيل الدخول بحساب الموظف للوصول إلى المنتجات ونقطة البيع
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold text-right">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3 text-right">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                البريد الإلكتروني:
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seller@safezone.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all text-left font-mono"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كلمة المرور:
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all text-left font-mono"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-2"
            >
              <span>{loginLoading ? 'جارٍ التحقق...' : 'تسجيل الدخول وبدء العمل'}</span>
              <span>⬅️</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. MAIN POS & QUOTATION SCREEN (Products are always visible & filterable)
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-28" dir="rtl">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          {/* Logo & Cashier Info */}
          <div className="flex items-center gap-2.5">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-slate-50 p-0.5 border border-slate-200" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm border border-brand-100">
                SZ
              </div>
            )}
            <div>
              <h1 className="text-xs font-black text-slate-900 leading-tight">
                {settings?.storeName || 'Safe Zone'}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 truncate max-w-[120px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {sellerName}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-[10px] text-slate-400 hover:text-rose-500 underline mr-1"
                >
                  (خروج)
                </button>
              </div>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'pos'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🛒</span>
              <span>فاتورة بيع</span>
            </button>
            <button
              onClick={() => setActiveTab('offer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'offer'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📑</span>
              <span>عرض سعر</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="mt-3 space-y-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 ابحث بالاسم، الموديل، الباركود، أو SKU..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all font-medium"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFiltersModal(true)}
              className={`px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                stockFilter !== 'all' || sortBy !== 'default'
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>⚙️</span>
              <span>فلاتر</span>
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat === 'all' ? '📦 كافة الأقسام' : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Product List / Grid */}
      <main className="p-3.5 max-w-2xl mx-auto">
        {productsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p>جارٍ تحميل قائمة المنتجات والأسعار...</p>
          </div>
        ) : productsError ? (
          <div className="text-center py-16 px-6 bg-white rounded-3xl border border-rose-200 text-rose-600 shadow-xs space-y-2">
            <p className="font-bold text-sm">حدث خطأ أثناء جلب المنتجات</p>
            <p className="text-xs text-slate-500">{productsError}</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 px-6 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="text-4xl">📦</div>
            <h3 className="text-sm font-bold text-slate-900">لا توجد منتجات مطابقة للبحث أو القسم</h3>
            <p className="text-xs text-slate-500">جرب تعديل كلمات البحث أو تصفية الأقسام</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setStockFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
            >
              إعادة ضبط البحث
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map(p => {
              const inCart = cart.find(x => x.productId === p.id);
              const storeQty = Number(p.storeQty !== undefined ? p.storeQty : p.quantity || 0);
              const warehouseQty = Number(p.warehouseQty || 0);
              const totalStock = storeQty + warehouseQty;
              const priceObj = getProductPrice(p);
              const isOutOfStock = activeTab === 'pos' && totalStock <= 0;

              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-2xl p-3 flex flex-col justify-between transition-all shadow-xs relative ${
                    inCart ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top SKU & Stock Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-mono truncate max-w-[80px]">
                      {p.sku || p.model || ''}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      storeQty > 0 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : warehouseQty > 0 
                        ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {storeQty > 0 ? `المحل: ${storeQty}` : warehouseQty > 0 ? `المخزن: ${warehouseQty}` : 'نافذ'}
                    </span>
                  </div>

                  {/* Thumbnail */}
                  <div className="h-24 w-full bg-slate-50 rounded-xl mb-2.5 flex items-center justify-center overflow-hidden border border-slate-100">
                    {p.imageUrl || p.image ? (
                      <img src={p.imageUrl || p.image} alt={p.name} className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <span className="text-3xl opacity-30">📷</span>
                    )}
                  </div>

                  {/* Name & Pricing */}
                  <div className="mb-3">
                    <h3 className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight min-h-[32px]">
                      {p.name}
                    </h3>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-black text-brand-600 font-mono">
                        {priceObj.iqd > 0 ? (
                          <>
                            {priceObj.iqd.toLocaleString()}{' '}
                            <span className="text-[10px] font-normal text-slate-500">د.ع</span>
                          </>
                        ) : priceObj.usd > 0 ? (
                          <span className="text-emerald-600">${priceObj.usd}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">غير محدد</span>
                        )}
                      </span>
                      {priceObj.usd > 0 && priceObj.iqd > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono font-medium">
                          ${priceObj.usd}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add / Stepper */}
                  {inCart ? (
                    <div className="flex items-center justify-between bg-slate-50 border border-brand-300 rounded-xl p-1">
                      <button
                        onClick={() => updateQuantity(p.id, inCart.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-black text-sm flex items-center justify-center shadow-xs border border-slate-200"
                      >
                        -
                      </button>
                      <span className="font-bold text-xs text-brand-600 font-mono">
                        {inCart.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(p.id, inCart.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-black text-sm flex items-center justify-center shadow-xs"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={isOutOfStock}
                      onClick={() => addToCart(p)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        isOutOfStock
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : activeTab === 'offer'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                          : 'bg-brand-600 hover:bg-brand-700 text-white shadow-xs'
                      }`}
                    >
                      <span>+</span>
                      <span>إضافة للسلة</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-40 shadow-xl">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-3 cursor-pointer flex-1"
            >
              <div className="relative">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg ${
                  activeTab === 'offer' ? 'bg-amber-600 text-white' : 'bg-brand-600 text-white'
                }`}>
                  {activeTab === 'offer' ? '📑' : '🛒'}
                </div>
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                  {cartItemsCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">
                  {activeTab === 'offer' ? 'إجمالي عرض السعر' : 'إجمالي الفاتورة'}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-black text-slate-900 font-mono">
                    {cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-500">د.ع</span>
                  </span>
                  {cartTotalUSD > 0 && (
                    <span className="text-xs text-brand-600 font-mono font-bold">
                      (${cartTotalUSD})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-sm transition-all flex items-center gap-2 ${
                activeTab === 'offer' 
                  ? 'bg-amber-600 hover:bg-amber-700' 
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              <span>متابعة الطلب</span>
              <span>⬅️</span>
            </button>
          </div>
        </div>
      )}

      {/* Filters Modal */}
      {showFiltersModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900">⚙️ فلاتر وترتيب المنتجات</h3>
              <button onClick={() => setShowFiltersModal(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </div>

            {/* Stock Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">حالة التوفر بالمخزن:</label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                <button
                  onClick={() => setStockFilter('all')}
                  className={`py-2 rounded-xl border transition-all ${stockFilter === 'all' ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setStockFilter('in_stock')}
                  className={`py-2 rounded-xl border transition-all ${stockFilter === 'in_stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                >
                  المتوفر فقط
                </button>
                <button
                  onClick={() => setStockFilter('low_stock')}
                  className={`py-2 rounded-xl border transition-all ${stockFilter === 'low_stock' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                >
                  المنخفض
                </button>
              </div>
            </div>

            {/* Sort Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">ترتيب النتائج:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="default">الترتيب الافتراضي</option>
                <option value="price_desc">السعر (من الأعلى للأقل)</option>
                <option value="price_asc">السعر (من الأقل للأعلى)</option>
                <option value="name">الاسم أبجدياً (أ - ي)</option>
              </select>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setStockFilter('all');
                  setSortBy('default');
                  setShowFiltersModal(false);
                }}
                className="w-1/2 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
              >
                إعادة ضبط
              </button>
              <button
                onClick={() => setShowFiltersModal(false)}
                className="w-1/2 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-bold"
              >
                تطبيق الفلاتر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart & Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white border-t border-slate-200 rounded-t-3xl max-h-[90vh] flex flex-col w-full max-w-lg mx-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeTab === 'offer' ? '📑' : '🛒'}</span>
                <h2 className="font-bold text-sm text-slate-900">
                  {activeTab === 'offer' ? 'تفاصيل عرض السعر' : 'تفاصيل فاتورة البيع'}
                </h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-mono">
                  {cartItemsCount} مواد
                </span>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Cart Items List */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  البنود المحددة (اضغط على السعر لتعديله):
                </label>
                {cart.map(item => (
                  <div 
                    key={item.productId}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-1">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateCartUnitPrice(item.productId, e.target.value)}
                          className="w-20 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-brand-600 font-bold font-mono focus:ring-1 focus:ring-brand-500"
                        />
                        <span>د.ع ×</span>
                        <span className="text-brand-600 font-bold">{item.quantity}</span>
                        <span>=</span>
                        <span className="text-slate-900 font-bold">{item.lineTotal.toLocaleString()} د.ع</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="w-6 h-6 rounded bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center hover:bg-slate-200"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-900 font-mono">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="w-6 h-6 rounded bg-brand-600 text-white text-xs font-bold flex items-center justify-center hover:bg-brand-700"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-rose-500 hover:text-rose-700 p-1 text-sm"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Selection */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <label className="text-xs font-bold text-slate-700 block">
                  👤 معلومات العميل:
                </label>
                
                {customers.length > 0 && (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                  >
                    <option value="">-- اختر من دليل العملاء المسجلين (اختياري) --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone1 ? `(${c.phone1})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="اسم العميل (مثال: علي محمد)"
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="رقم الهاتف (078...)"
                    className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                </div>
              </div>

              {/* Mode Specific Settings */}
              {activeTab === 'offer' ? (
                <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200 space-y-3">
                  <label className="text-xs font-bold text-amber-900 block">
                    📑 إعدادات عرض السعر:
                  </label>
                  <input
                    type="text"
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                    placeholder="عنوان العرض (مثال: عرض توريد كاميرات مراقبة)"
                    className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <textarea
                    value={offerNotes}
                    onChange={(e) => setOfferNotes(e.target.value)}
                    placeholder="شروط وملاحظات العرض (فترة الصلاحية، الضمان، التوصيل...)"
                    rows="2"
                    className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  />
                </div>
              ) : (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">
                    💳 طريقة الدفع:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentType('cash')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        paymentType === 'cash'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      💵 نقداً (مسددة بالكامل)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('debt')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        paymentType === 'debt'
                          ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      🔴 آجل / دين
                    </button>
                  </div>

                  {paymentType === 'debt' && (
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        المبلغ الواصل الآن كاش (د.ع):
                      </label>
                      <input
                        type="number"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="0 د.ع"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Discounts & Tax */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">
                    خصم (د.ع):
                  </label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">
                    ضريبة (%):
                  </label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono font-bold">{cartSubtotal.toLocaleString()} د.ع</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم:</span>
                    <span className="font-mono font-bold">-{totalDiscount.toLocaleString()} د.ع</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>الضريبة ({taxRate}%):</span>
                    <span className="font-mono font-bold">+{taxAmount.toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-black text-sm pt-1 border-t border-slate-200">
                  <span>المجموع النهائي:</span>
                  <span className="font-mono text-brand-600">{cartTotal.toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>

            {/* Footer Submit */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-1/3 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold shadow-xs"
              >
                رجوع
              </button>
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleSubmit}
                className={`w-2/3 py-3 rounded-xl font-black text-xs text-white shadow-sm transition-all flex items-center justify-center gap-2 ${
                  submitting
                    ? 'bg-slate-400 cursor-wait'
                    : activeTab === 'offer'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {submitting ? (
                  <span>جارٍ الحفظ والمعالجة... ⏳</span>
                ) : activeTab === 'offer' ? (
                  <>
                    <span>📑</span>
                    <span>إنشاء وحفظ عرض السعر</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>تأكيد الفاتورة وإصدارها</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {completedDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto border border-emerald-100 shadow-xs">
              {completedDoc.isOffer ? '📑' : '🎉'}
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900">
                {completedDoc.isOffer ? 'تم إنشاء عرض السعر بنجاح!' : 'تم إصدار الفاتورة بنجاح!'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                رقم المستند: <strong className="text-brand-600 font-mono font-bold">#{completedDoc.invoiceNumber || completedDoc.offerNumber}</strong>
              </p>
              <p className="text-xs text-slate-700 font-mono mt-0.5">
                المبلغ: <strong>{Number(completedDoc.total || 0).toLocaleString()} د.ع</strong>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                البائع: <strong>{completedDoc.cashierEmail || sellerName}</strong>
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={sendingTelegram}
                onClick={() => handleSendToTelegram(completedDoc)}
                className="w-full py-3.5 rounded-2xl bg-[#229ED9] hover:bg-[#1E88C7] text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <span>{sendingTelegram ? '⏳' : '✈️'}</span>
                <span>{sendingTelegram ? 'جارٍ إنشاء وإرسال الـ PDF... ⏳' : 'إرسال ملف PDF للمحادثة بالتليجرام ✈️'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFullReceipt(true)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 border border-slate-200"
              >
                <span>📥</span>
                <span>تحميل / معاينة PDF على الهاتف</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedDoc(null);
                  setShowFullReceipt(false);
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                ➕ إجراء عملية جديدة
              </button>
            </div>
          </div>

          {showFullReceipt && (
            <InvoiceReceipt
              sale={completedDoc}
              onClose={() => setShowFullReceipt(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
