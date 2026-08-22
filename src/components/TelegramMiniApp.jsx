import React, { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useCustomers } from '../hooks/useCustomers';
import { useSettings } from '../hooks/useSettings';
import { useUI } from '../contexts/UIContext';
import { checkoutSale } from '../services/salesService';
import { createOffer } from '../services/offersService';
import InvoiceReceipt from './InvoiceReceipt';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/auth';

export default function TelegramMiniApp({ onSwitchToStaffLogin }) {
  const { products = [], loading: productsLoading } = useProducts();
  const { customers = [] } = useCustomers();
  const { settings = {} } = useSettings();
  const { toast } = useUI();

  // Mode: 'pos' (بيع حقيقي) or 'offer' (عرض سعر)
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'offer'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
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

  // Authenticate silently if needed & read Telegram WebApp context
  useEffect(() => {
    try {
      if (auth && !auth.currentUser) {
        signInAnonymously(auth).catch(() => {});
      }
    } catch (e) {}

    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      try {
        tg.enableClosingConfirmation();
      } catch (e) {}
      const user = tg.initDataUnsafe?.user;
      if (user) {
        setTelegramUser(user);
        setChatId(user.id);
      }
    }

    // Check URL params for chat_id or mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'offer') setActiveTab('offer');
    if (params.get('chat_id')) setChatId(params.get('chat_id'));
  }, []);

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

  // Categories list
  const categories = useMemo(() => {
    const set = new Set();
    products.forEach(p => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (selectedCategory !== 'all') {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, selectedCategory, searchTerm]);

  // Cart operations
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      const availableQty = (Number(product.storeQty) || 0) + (Number(product.quantity) || 0);

      if (existing) {
        if (activeTab === 'pos' && existing.quantity >= availableQty) {
          toast(`الكمية المتوفرة بالمخزن (${availableQty}) فقط`, 'warning');
          return prev;
        }
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      } else {
        if (activeTab === 'pos' && availableQty <= 0) {
          toast('هذا المنتج غير متوفر بالمخزن حالياً', 'warning');
          return prev;
        }
        const unitPrice = Number(product.price || product.sellingPrice || 0);
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
            maxStock: availableQty
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

  // Exchange rate calculation
  const exchangeRate = Number(settings?.usdExchangeRate || settings?.exchangeRate || 1500);
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
      const cashier = telegramUser ? `${telegramUser.first_name || ''} (@${telegramUser.username || 'telegram'})` : 'تطبيق تليجرام';

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
            cashierEmail: cashier
          }
        );

        setCompletedDoc({
          ...offerData,
          isOffer: true,
          invoiceNumber: offerData.offerNumber,
          customerPhone: customerPhone.trim(),
          items: cart
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
          cashier,
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
          invoiceType: paymentType
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

  // Send PDF directly to Telegram Chat via backend
  const handleSendToTelegram = async (docObj) => {
    const targetChat = chatId || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id);
    if (!targetChat) {
      toast('لم يتم التعرف على محادثة التليجرام. يرجى استخدام زر "معاينة وتحميل PDF" لتنزيل الملف.', 'warning');
      return;
    }

    toast('جارٍ إرسال ملف الـ PDF لمحادثة التليجرام... ⏳', 'info');
    try {
      const res = await fetch('/api/telegram-send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: targetChat,
          doc: docObj,
          storeInfo: settings
        })
      });

      const data = await res.json().catch(() => ({}));
      if (data.success || res.ok) {
        toast('تم إرسال مستند الـ PDF إلى محادثتك بالتليجرام بنجاح! ✈️📄', 'success');
      } else {
        throw new Error(data.error || 'فشل الإرسال عبر البوت');
      }
    } catch (e) {
      console.error('Telegram send error:', e);
      toast(`تعذر الإرسال للبوت: ${e.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28" dir="rtl">
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-contain bg-slate-800 p-1 border border-slate-700" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/30">
                SZ
              </div>
            )}
            <div>
              <h1 className="text-base font-black text-white leading-tight">
                {settings?.storeName || 'Safe Zone'}
              </h1>
              <p className="text-[11px] text-emerald-400 font-medium">
                {telegramUser ? `مرحباً ${telegramUser.first_name || ''} 👤` : 'نقطة البيع وعروض الأسعار 📱'}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'pos'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🛒</span>
              <span>فاتورة بيع</span>
            </button>
            <button
              onClick={() => setActiveTab('offer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'offer'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📑</span>
              <span>عرض سعر</span>
            </button>
          </div>
        </div>

        {/* 2. Search & Category Pills */}
        <div className="mt-3 space-y-2.5">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 ابحث بالاسم، الباركود، أو الرمز (SKU)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-700 text-white border border-slate-600'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800/80 hover:bg-slate-800'
                }`}
              >
                {cat === 'all' ? '📦 الكل' : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 3. Products Grid */}
      <main className="p-3.5">
        {productsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p>جارٍ تحميل المنتجات والمخزون...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800/60 p-6">
            <div className="text-3xl mb-2">🔍</div>
            <p>لم يتم العثور على أي منتجات مطابقة للبحث</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map(p => {
              const inCart = cart.find(x => x.productId === p.id);
              const availableQty = (Number(p.storeQty) || 0) + (Number(p.quantity) || 0);
              const priceIQD = Number(p.price || p.sellingPrice || 0);
              const priceUSD = exchangeRate > 0 ? (priceIQD / exchangeRate).toFixed(1) : 0;
              const isOutOfStock = activeTab === 'pos' && availableQty <= 0;

              return (
                <div
                  key={p.id}
                  className={`bg-slate-900 border rounded-2xl p-3 flex flex-col justify-between transition-all relative overflow-hidden ${
                    inCart ? 'border-emerald-500/80 ring-1 ring-emerald-500/50 bg-slate-900/90' : 'border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* Stock Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {p.sku || ''}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      availableQty > 5 
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' 
                        : availableQty > 0 
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40' 
                        : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                    }`}>
                      {availableQty > 0 ? `${availableQty} متوفر` : 'نفذت الكمية'}
                    </span>
                  </div>

                  {/* Thumbnail / Image */}
                  <div className="h-24 w-full bg-slate-950 rounded-xl mb-2.5 flex items-center justify-center overflow-hidden border border-slate-800/50">
                    {p.imageUrl || p.image ? (
                      <img src={p.imageUrl || p.image} alt={p.name} className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <span className="text-3xl opacity-40">📷</span>
                    )}
                  </div>

                  {/* Title & Price */}
                  <div className="mb-3">
                    <h3 className="font-bold text-xs text-white line-clamp-2 leading-tight min-h-[32px]">
                      {p.name}
                    </h3>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {priceIQD.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">د.ع</span>
                      </span>
                      {priceUSD > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ${priceUSD}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add / Stepper Button */}
                  {inCart ? (
                    <div className="flex items-center justify-between bg-slate-950 border border-emerald-500/40 rounded-xl p-1">
                      <button
                        onClick={() => updateQuantity(p.id, inCart.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-sm flex items-center justify-center transition-colors"
                      >
                        -
                      </button>
                      <span className="font-bold text-xs text-emerald-400 font-mono">
                        {inCart.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(p.id, inCart.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center transition-colors"
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
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : activeTab === 'offer'
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
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

      {/* 4. Bottom Floating Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3.5 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 z-40 shadow-2xl">
          <div className="max-w-md mx-auto flex items-center justify-between gap-3">
            <div 
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-3 cursor-pointer flex-1"
            >
              <div className="relative">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg ${
                  activeTab === 'offer' ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                  {activeTab === 'offer' ? '📑' : '🛒'}
                </div>
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">
                  {cartItemsCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">
                  {activeTab === 'offer' ? 'إجمالي عرض السعر' : 'إجمالي الفاتورة'}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-black text-white font-mono">
                    {cartTotal.toLocaleString()} <span className="text-xs font-normal text-slate-400">د.ع</span>
                  </span>
                  {cartTotalUSD > 0 && (
                    <span className="text-xs text-emerald-400 font-mono font-bold">
                      (${cartTotalUSD})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className={`px-5 py-3 rounded-xl font-bold text-xs text-white shadow-lg transition-all flex items-center gap-2 ${
                activeTab === 'offer' 
                  ? 'bg-amber-600 hover:bg-amber-500' 
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <span>متابعة الطلب</span>
              <span>⬅️</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Cart & Checkout Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div 
            className="bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[90vh] flex flex-col w-full max-w-lg mx-auto shadow-2xl animate-in slide-in-from-bottom duration-200"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeTab === 'offer' ? '📑' : '🛒'}</span>
                <h2 className="font-bold text-sm text-white">
                  {activeTab === 'offer' ? 'تفاصيل عرض السعر' : 'تفاصيل فاتورة البيع'}
                </h2>
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                  {cartItemsCount} مواد
                </span>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Cart Items List */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  البنود المحددة في السلة:
                </label>
                {cart.map(item => (
                  <div 
                    key={item.productId}
                    className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                        <span>{item.unitPrice.toLocaleString()} د.ع</span>
                        <span>×</span>
                        <span className="text-emerald-400 font-bold">{item.quantity}</span>
                        <span>=</span>
                        <span className="text-white font-bold">{item.lineTotal.toLocaleString()} د.ع</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="w-6 h-6 rounded bg-slate-800 text-white text-xs font-bold flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-bold text-white font-mono">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="w-6 h-6 rounded bg-emerald-600 text-white text-xs font-bold flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-rose-400 hover:text-rose-300 p-1 text-sm"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer Info */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                <label className="text-xs font-bold text-slate-300 block">
                  👤 معلومات العميل:
                </label>
                
                {customers.length > 0 && (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
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
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="رقم الهاتف (078...)"
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Specific Options for POS or Offer */}
              {activeTab === 'offer' ? (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                  <label className="text-xs font-bold text-amber-400 block">
                    📑 إعدادات عرض السعر:
                  </label>
                  <input
                    type="text"
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value)}
                    placeholder="عنوان العرض (مثال: عرض توريد كاميرات مراقبة)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <textarea
                    value={offerNotes}
                    onChange={(e) => setOfferNotes(e.target.value)}
                    placeholder="شروط وملاحظات العرض (فترة الصلاحية، الضمان، التوصيل...)"
                    rows="2"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>
              ) : (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                  <label className="text-xs font-bold text-emerald-400 block">
                    💳 طريقة الدفع للفاتورة:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentType('cash')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        paymentType === 'cash'
                          ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      💵 نقداً (مسددة بالكامل)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('debt')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        paymentType === 'debt'
                          ? 'bg-rose-600/20 text-rose-400 border-rose-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      🔴 آجل / دين
                    </button>
                  </div>

                  {paymentType === 'debt' && (
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">
                        المبلغ الواصل الآن كاش (د.ع):
                      </label>
                      <input
                        type="number"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="0 د.ع"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Discounts & Adjustments */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    خصم (د.ع):
                  </label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    ضريبة (%):
                  </label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Summary Breakdown */}
              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{cartSubtotal.toLocaleString()} د.ع</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>الخصم المطبق:</span>
                    <span className="font-mono">-{totalDiscount.toLocaleString()} د.ع</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>الضريبة ({taxRate}%):</span>
                    <span className="font-mono">+{taxAmount.toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between text-white font-black text-sm pt-1 border-t border-slate-800">
                  <span>المجموع الصافي:</span>
                  <span className="font-mono text-emerald-400">{cartTotal.toLocaleString()} د.ع</span>
                </div>
              </div>
            </div>

            {/* Drawer Footer Buttons */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-1/3 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold"
              >
                رجوع
              </button>
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleSubmit}
                className={`w-2/3 py-3 rounded-xl font-black text-xs text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                  submitting
                    ? 'bg-slate-700 opacity-60 cursor-wait'
                    : activeTab === 'offer'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
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

      {/* 6. Success Receipt View / PDF Exporter */}
      {completedDoc && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto border border-emerald-500/30">
              {completedDoc.isOffer ? '📑' : '🎉'}
            </div>

            <div>
              <h3 className="text-lg font-black text-white">
                {completedDoc.isOffer ? 'تم إنشاء عرض السعر بنجاح!' : 'تم إصدار الفاتورة بنجاح!'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                رقم المستند: <strong className="text-emerald-400 font-mono font-bold">#{completedDoc.invoiceNumber || completedDoc.offerNumber}</strong>
              </p>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                المبلغ: <strong>{Number(completedDoc.total || 0).toLocaleString()} د.ع</strong>
              </p>
            </div>

            <div className="space-y-2 pt-2">
              {/* Telegram Send Button */}
              <button
                onClick={() => handleSendToTelegram(completedDoc)}
                className="w-full py-3 rounded-xl bg-[#229ED9] hover:bg-[#1E88C7] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span>✈️</span>
                <span>إرسال ملف PDF للمحادثة بالتليجرام</span>
              </button>

              {/* View/Print Full InvoiceReceipt Button */}
              <button
                onClick={() => setShowFullReceipt(true)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>🖨️</span>
                <span>معاينة وتحميل PDF رسمي</span>
              </button>

              {/* Start New Action */}
              <button
                onClick={() => {
                  setCompletedDoc(null);
                  setShowFullReceipt(false);
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 font-medium"
              >
                ➕ إجراء عملية جديدة
              </button>
            </div>
          </div>

          {/* Full InvoiceReceipt Modal for native printing */}
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
