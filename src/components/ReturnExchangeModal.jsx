import React, { useState, useEffect, useRef } from 'react';
import { editConfirmedSale, findProductByBarcode } from '../services/salesService';
import { 
  calculateOrderSummary, 
  createLaborCartItem, 
  createCustomCartItem, 
  createSitePurchaseCartItem 
} from '../models/sale';
import { useProducts } from '../hooks/useProducts';
import { useLaborCharges } from '../hooks/useLaborCharges';
import ProductGrid from './ProductGrid';
import CustomerSelect from './CustomerSelect';
import { useCustomers } from '../hooks/useCustomers';

export default function ReturnExchangeModal({ sale, cashierEmail, onClose, onSaveSuccess }) {
  const { products } = useProducts();
  const { customers } = useCustomers();
  const { laborCharges } = useLaborCharges();
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(sale.discount || 0);
  const [taxRate, setTaxRate] = useState(sale.taxRate || 0);
  const [customerName, setCustomerName] = useState(sale.customerName || '');
  const [phone1, setPhone1] = useState(sale.phone1 || '');
  const [phone2, setPhone2] = useState(sale.phone2 || '');
  const [invoiceType, setInvoiceType] = useState(sale.invoiceType || 'cash');
  
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanError, setScanError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingPriceItem, setEditingPriceItem] = useState(null);
  const inputRef = useRef(null);

  // Custom Item Modal State
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({
    name: '',
    unitPrice: '',
    quantity: '1',
    wholesalePrice: '',
    notes: ''
  });
  const [customItemError, setCustomItemError] = useState('');

  // Site Purchase Modal State
  const [showSitePurchaseModal, setShowSitePurchaseModal] = useState(false);
  const [sitePurchaseForm, setSitePurchaseForm] = useState({
    name: '',
    purchaseCost: '',
    sellingPrice: '',
    quantity: '1',
    paymentSource: 'cash_drawer',
    notes: ''
  });
  const [sitePurchaseError, setSitePurchaseError] = useState('');

  // Reordering & Drag-and-Drop State
  const [draggedCartIndex, setDraggedCartIndex] = useState(null);
  const [dragOverCartIndex, setDragOverCartIndex] = useState(null);

  const moveCartItem = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= cart.length || fromIndex === toIndex) return;
    setCart(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const moveCartItemUp = (index) => {
    if (index <= 0) return;
    moveCartItem(index, index - 1);
  };

  const moveCartItemDown = (index) => {
    if (index >= cart.length - 1) return;
    moveCartItem(index, index + 1);
  };

  const moveCartItemToTop = (index) => {
    if (index <= 0) return;
    moveCartItem(index, 0);
  };

  const handleCartDragStart = (e, index) => {
    setDraggedCartIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCartDragOver = (e, index) => {
    e.preventDefault();
    if (draggedCartIndex === null || draggedCartIndex === index) return;
    setDragOverCartIndex(index);
  };

  const handleCartDragLeave = (e, index) => {
    if (dragOverCartIndex === index) {
      setDragOverCartIndex(null);
    }
  };

  const handleCartDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedCartIndex === null || draggedCartIndex === targetIndex) {
      setDraggedCartIndex(null);
      setDragOverCartIndex(null);
      return;
    }
    moveCartItem(draggedCartIndex, targetIndex);
    setDraggedCartIndex(null);
    setDragOverCartIndex(null);
  };

  const handleCartDragEnd = () => {
    setDraggedCartIndex(null);
    setDragOverCartIndex(null);
  };

  const handleAddCustomItem = (e) => {
    e.preventDefault();
    const trimmedName = customItemForm.name.trim();
    if (!trimmedName) {
      setCustomItemError('يرجى إدخال اسم البند أو الخدمة');
      return;
    }
    const price = Number(customItemForm.unitPrice);
    if (isNaN(price) || price < 0 || customItemForm.unitPrice === '') {
      setCustomItemError('يرجى إدخال سعر بيع صحيح');
      return;
    }
    const qty = Math.max(1, Number(customItemForm.quantity) || 1);
    const cost = Math.max(0, Number(customItemForm.wholesalePrice) || 0);

    const newItem = createCustomCartItem({
      name: trimmedName,
      unitPrice: price,
      quantity: qty,
      wholesalePrice: cost,
      notes: customItemForm.notes,
    });

    setCart(prev => [...prev, newItem]);
    setShowCustomItemModal(false);
    setCustomItemForm({ name: '', unitPrice: '', quantity: '1', wholesalePrice: '', notes: '' });
    setCustomItemError('');
  };

  const handleAddSitePurchase = (e) => {
    e.preventDefault();
    const trimmedName = sitePurchaseForm.name.trim();
    if (!trimmedName) {
      setSitePurchaseError('يرجى إدخال اسم المادة المشتراة');
      return;
    }
    const cost = Number(sitePurchaseForm.purchaseCost);
    if (isNaN(cost) || cost < 0 || sitePurchaseForm.purchaseCost === '') {
      setSitePurchaseError('يرجى إدخال سعر شراء صحيح');
      return;
    }
    const sellPrice = Number(sitePurchaseForm.sellingPrice !== '' ? sitePurchaseForm.sellingPrice : cost);
    if (isNaN(sellPrice) || sellPrice < 0) {
      setSitePurchaseError('يرجى إدخال سعر بيع صحيح للزبون');
      return;
    }
    const qty = Math.max(1, Number(sitePurchaseForm.quantity) || 1);

    const newItem = createSitePurchaseCartItem({
      name: trimmedName,
      purchaseCost: cost,
      sellingPrice: sellPrice,
      quantity: qty,
      paymentSource: sitePurchaseForm.paymentSource || 'cash_drawer',
      notes: sitePurchaseForm.notes,
    });

    setCart(prev => [...prev, newItem]);
    setShowSitePurchaseModal(false);
    setSitePurchaseForm({
      name: '',
      purchaseCost: '',
      sellingPrice: '',
      quantity: '1',
      paymentSource: 'cash_drawer',
      notes: '',
    });
    setSitePurchaseError('');
  };

  useEffect(() => {
    if (sale.items) {
      setCart(sale.items.map(item => {
        const prod = products.find(p => p.id === item.productId || p.sku === item.sku);
        const ws = (item.wholesalePrice !== undefined && item.wholesalePrice !== null && item.wholesalePrice > 0)
          ? Number(item.wholesalePrice)
          : (prod ? Number(prod.wholesalePrice || 0) : 0);

        return {
          ...item,
          wholesalePrice: ws,
          sellMode: item.sellMode || prod?.sellMode || 'unit',
          metersPerRoll: item.metersPerRoll || prod?.metersPerRoll
        };
      }));
    }
    inputRef.current?.focus();
  }, [sale, products]);

  useEffect(() => {
    if (customerName && !phone1 && customers.length > 0) {
      const c = customers.find(x => x.name.trim() === customerName.trim());
      if (c && c.phone1) {
        setPhone1(c.phone1);
        if (c.phone2 && !phone2) setPhone2(c.phone2);
      }
    }
  }, [customers, customerName, phone1, phone2]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleScanSubmit(e) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeInput('');
    setScanError('');

    try {
      const product = await findProductByBarcode(code);
      if (!product) {
        setScanError(`لم يتم العثور على منتج بهذا الباركود: ${code}`);
        return;
      }
      addToCart(product);
    } catch (err) {
      setScanError(`خطأ أثناء البحث: ${err.message}`);
    } finally {
      inputRef.current?.focus();
    }
  }

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: 1,
        unitPrice: Number(product.retailPrice) || 0,
        originalPrice: Number(product.retailPrice) || 0,
        wholesalePrice: Number(product.wholesalePrice) || 0,
        sellMode: product.sellMode || 'unit',
        metersPerRoll: product.metersPerRoll,
        isService: false,
      }];
    });
  }

  function updateQuantity(productId, quantity) {
    const qty = Math.max(1, Number(quantity) || 1);
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity: qty } : item))
    );
  }

  function updatePrice(productId, price) {
    const newPrice = Math.max(0, Number(price) || 0);
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, unitPrice: newPrice } : item))
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  async function handleSave() {
    if (invoiceType === 'debt') {
      if (!customerName.trim()) {
        setSaveError('يجب تحديد اسم العميل للفاتورة الآجلة (ديون)');
        return;
      }
      if (!phone1.trim()) {
        setSaveError('رقم الهاتف إجباري في حال بيع الدين');
        return;
      }
    }

    const invalidItem = cart.find(item => !item.isService && item.unitPrice > 0 && item.unitPrice < (item.wholesalePrice || 0));
    if (invalidItem) {
      setSaveError(`لا يمكن أن يكون سعر "${invalidItem.name}" أقل من سعر الجملة (${(invalidItem.wholesalePrice || 0).toLocaleString()} د.ع) إلا إذا كان مجاناً/هدية (0 د.ع)`);
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      const updatedSale = await editConfirmedSale(
        sale.id,
        cart,
        { discount, taxRate, customerName, invoiceType, phone1, phone2 },
        cashierEmail
      );
      onSaveSuccess(updatedSale);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const newSummary = calculateOrderSummary(cart, discount, taxRate);
  const diff = newSummary.total - sale.total;

  const renderPriceModal = () => {
    if (!editingPriceItem) return null;
    const { item, tempPrice, error } = editingPriceItem;
    
    const handleSavePrice = () => {
      const numPrice = Number(tempPrice);
      if (!item.isService && numPrice > 0 && numPrice < (item.wholesalePrice || 0)) {
        setEditingPriceItem(prev => ({
          ...prev,
          error: `لا يمكن بيع المادة بسعر أقل من التكلفة إلا إذا كانت هدية (0 د.ع). أقل سعر ممكن هو ${(item.wholesalePrice || 0).toLocaleString()} د.ع`
        }));
        return;
      }
      updatePrice(item.productId, numPrice);
      setEditingPriceItem(null);
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-in zoom-in-95 duration-200">
          <h3 className="font-bold text-ink-900 text-lg mb-3">تعديل سعر المادة</h3>
          <p className="text-sm font-bold text-ink-800 mb-3 bg-ink-50 p-2 rounded-lg truncate" title={item.name}>{item.name}</p>
          
          {!item.isService && (
            <div className="flex justify-between items-center bg-brand-50 border border-brand-100 p-2.5 rounded-lg mb-3 text-xs font-bold text-brand-800">
              <span>سعر التكلفة (الجملة):</span>
              <span className="font-mono">{(item.wholesalePrice || 0).toLocaleString()} د.ع</span>
            </div>
          )}

          {/* زر هدية / مجاني */}
          <button
            type="button"
            onClick={() => {
              setEditingPriceItem(prev => ({ ...prev, tempPrice: '0', error: '' }));
            }}
            className="w-full mb-3 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>🎁</span>
            <span>جعل المادة هدية / مجاناً (0 د.ع)</span>
          </button>

          <div className="mb-4">
            <label className="block text-xs font-bold text-ink-700 mb-1.5">السعر الجديد (د.ع):</label>
            <input
              type="number"
              min="0"
              value={tempPrice}
              onChange={(e) => setEditingPriceItem(prev => ({ ...prev, tempPrice: e.target.value, error: '' }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePrice()}
              className="w-full border border-ink-200 rounded-xl px-4 py-2.5 text-lg font-bold font-mono focus:ring-2 focus:ring-brand-500 text-slate-900"
              autoFocus
            />
            {error && <p className="text-xs text-danger-600 font-bold mt-2">{error}</p>}
          </div>

          <div className="flex gap-2">
            <button onClick={handleSavePrice} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 rounded-lg cursor-pointer">
              تأكيد السعر
            </button>
            <button onClick={() => setEditingPriceItem(null)} className="flex-1 bg-ink-100 hover:bg-ink-200 text-ink-700 font-bold py-2 rounded-lg cursor-pointer">
              إلغاء
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomItemModal = () => {
    if (!showCustomItemModal) return null;

    return (
      <div 
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowCustomItemModal(false);
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-md p-5 animate-in zoom-in-95 duration-150 relative">
          <div className="flex items-center justify-between pb-3 border-b border-ink-100 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <div>
                <h3 className="font-black text-ink-900 text-base">إضافة بند حر / خدمة</h3>
                <p className="text-[11px] text-ink-500 font-medium">أجور صيانة، تركيب، أو مادة خارجية لا تؤثر على المخزن</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomItemModal(false)}
              className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-ink-100 transition-colors cursor-pointer text-base leading-none"
            >
              ✕
            </button>
          </div>

          {customItemError && (
            <div className="mb-3 px-3 py-2 bg-danger-50 border border-danger-200 text-danger-700 text-xs font-bold rounded-xl flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{customItemError}</span>
            </div>
          )}

          <form onSubmit={handleAddCustomItem} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-ink-800 mb-1">
                اسم البند أو الخدمة <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={customItemForm.name}
                onChange={(e) => setCustomItemForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: أجور تركيب كاميرا، تمديد وايرات، صيانة..."
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold text-ink-900 focus:ring-2 focus:ring-brand-500 outline-hidden bg-ink-50/40"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">
                  سعر البيع (د.ع) <span className="text-danger-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={customItemForm.unitPrice}
                  onChange={(e) => setCustomItemForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-ink-900 focus:ring-2 focus:ring-brand-500 outline-hidden bg-ink-50/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">الكمية</label>
                <input
                  type="number"
                  min="1"
                  value={customItemForm.quantity}
                  onChange={(e) => setCustomItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-center text-ink-900 focus:ring-2 focus:ring-brand-500 outline-hidden bg-ink-50/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">
                سعر التكلفة (اختياري - لحساب الأرباح)
              </label>
              <input
                type="number"
                min="0"
                value={customItemForm.wholesalePrice}
                onChange={(e) => setCustomItemForm(prev => ({ ...prev, wholesalePrice: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-ink-900 focus:ring-2 focus:ring-brand-500 outline-hidden bg-ink-50/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={customItemForm.notes}
                onChange={(e) => setCustomItemForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="أي ملاحظات تظهر على الفاتورة..."
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-medium text-ink-900 focus:ring-2 focus:ring-brand-500 outline-hidden bg-ink-50/40"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomItemModal(false)}
                className="flex-1 py-2 px-3 bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>✨</span>
                <span>إضافة للفاتورة</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderSitePurchaseModal = () => {
    if (!showSitePurchaseModal) return null;

    return (
      <div 
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowSitePurchaseModal(false);
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-ink-100 w-full max-w-md p-5 animate-in zoom-in-95 duration-150 relative">
          <div className="flex items-center justify-between pb-3 border-b border-ink-100 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl p-2 bg-amber-50 border border-amber-200 rounded-xl">🛒</span>
              <div>
                <h3 className="font-black text-ink-900 text-base">تسجيل شراء موقعي</h3>
                <p className="text-[11px] text-amber-800 font-bold">لا يؤثر على المخزن • يُخصم ثمنه فوراً من القاصة أو الماستر</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSitePurchaseModal(false)}
              className="text-ink-400 hover:text-ink-700 p-1.5 rounded-lg hover:bg-ink-100 transition-colors cursor-pointer text-base leading-none"
            >
              ✕
            </button>
          </div>

          {sitePurchaseError && (
            <div className="mb-3 px-3 py-2 bg-danger-50 border border-danger-200 text-danger-700 text-xs font-bold rounded-xl flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{sitePurchaseError}</span>
            </div>
          )}

          <form onSubmit={handleAddSitePurchase} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-ink-800 mb-1">
                اسم المادة المشتراة <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={sitePurchaseForm.name}
                onChange={(e) => setSitePurchaseForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: سنادات خاصة، بوري حديد 2 انج، قفل خارجي..."
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold text-ink-900 focus:ring-2 focus:ring-amber-500 outline-hidden bg-ink-50/40"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">
                  سعر الشراء من السوق <span className="text-danger-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={sitePurchaseForm.purchaseCost}
                  onChange={(e) => {
                    const costVal = e.target.value;
                    setSitePurchaseForm(prev => ({ 
                      ...prev, 
                      purchaseCost: costVal,
                      sellingPrice: prev.sellingPrice === '' || prev.sellingPrice === prev.purchaseCost ? costVal : prev.sellingPrice
                    }));
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-ink-900 focus:ring-2 focus:ring-amber-500 outline-hidden bg-ink-50/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1">
                  سعر البيع للزبون <span className="text-danger-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={sitePurchaseForm.sellingPrice}
                  onChange={(e) => setSitePurchaseForm(prev => ({ ...prev, sellingPrice: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-ink-900 focus:ring-2 focus:ring-amber-500 outline-hidden bg-ink-50/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-800 mb-1">الكمية</label>
              <input
                type="number"
                min="1"
                value={sitePurchaseForm.quantity}
                onChange={(e) => setSitePurchaseForm(prev => ({ ...prev, quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-bold font-mono text-center text-ink-900 focus:ring-2 focus:ring-amber-500 outline-hidden bg-ink-50/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-800 mb-1.5">
                مصدر خصم المبلغ (طريقة الدفع):
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSitePurchaseForm(prev => ({ ...prev, paymentSource: 'cash_drawer' }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    sitePurchaseForm.paymentSource === 'cash_drawer'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                  }`}
                >
                  <span>💵</span>
                  <span>القاصة النقدية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSitePurchaseForm(prev => ({ ...prev, paymentSource: 'mastercard' }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    sitePurchaseForm.paymentSource === 'mastercard'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                  }`}
                >
                  <span>💳</span>
                  <span>الماستركارد</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-700 mb-1">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={sitePurchaseForm.notes}
                onChange={(e) => setSitePurchaseForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="اسم المحل أو تفاصيل الشراء..."
                className="w-full px-3 py-2 border border-ink-200 rounded-xl text-xs font-medium text-ink-900 focus:ring-2 focus:ring-amber-500 outline-hidden bg-ink-50/40"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSitePurchaseModal(false)}
                className="flex-1 py-2 px-3 bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🛒</span>
                <span>تسجيل الشراء وإضافته</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm" dir="rtl">
      {renderPriceModal()}
      {renderCustomItemModal()}
      {renderSitePurchaseModal()}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-100 bg-ink-50">
          <div>
            <h2 className="text-xl font-bold text-ink-900">تعديل الفاتورة / استرجاع واستبدال</h2>
            <p className="text-sm text-ink-500 mt-1">فاتورة رقم #{sale.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 text-ink-400 hover:text-ink-700 bg-white rounded-xl shadow-sm border border-ink-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          
          {/* Right side: Products & Search */}
          <div className="lg:w-1/2 p-4 flex flex-col gap-4 border-l border-ink-100 overflow-y-auto">
            <form onSubmit={handleScanSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="input pl-4 pr-12 py-3 w-full shadow-sm"
                placeholder="امسح الباركود للبحث عن منتج بديل..."
              />
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-ink-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </form>
            {scanError && <div className="text-sm text-danger-600 bg-danger-50 p-2 rounded-lg">{scanError}</div>}
            
            {laborCharges?.length > 0 && (
              <div className="px-3 py-2 bg-white rounded-xl border border-ink-100 flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-sm shrink-0">
                <span className="text-[10px] text-ink-400 font-bold flex items-center shrink-0">إضافة خدمات:</span>
                {laborCharges.map(labor => (
                  <button
                    key={labor.id}
                    type="button"
                    onClick={() => {
                      setCart(prev => {
                        const existing = prev.find(i => i.productId === `labor_${labor.id}`);
                        if (existing) {
                          return prev.map(i => i.productId === `labor_${labor.id}` ? { ...i, quantity: i.quantity + 1 } : i);
                        }
                        return [...prev, createLaborCartItem(labor)];
                      });
                    }}
                    className="shrink-0 px-3 py-1 text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-full transition-colors"
                  >
                    + {labor.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 bg-ink-50/30 rounded-xl border border-ink-100 p-2 min-h-0 overflow-y-auto">
              <ProductGrid products={products} onSelect={addToCart} />
            </div>
          </div>

          {/* Left side: Cart & Checkout */}
          <div className="lg:w-1/2 p-4 flex flex-col gap-4 bg-ink-50/50 overflow-y-auto">
            
            <div className="bg-white rounded-xl border border-ink-200 p-3 shadow-sm">
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setInvoiceType('cash')}
                  className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${invoiceType === 'cash' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'text-ink-500 hover:bg-ink-50 border border-transparent'}`}
                >
                  💵 نقدي
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceType('debt')}
                  className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${invoiceType === 'debt' ? 'bg-warn-100 text-warn-800 border border-warn-200' : 'text-ink-500 hover:bg-ink-50 border border-transparent'}`}
                >
                  📝 ديون
                </button>
              </div>
              <CustomerSelect 
                value={customerName} 
                onChange={setCustomerName} 
                onSelect={(c) => {
                  setCustomerName(c.name);
                  setPhone1(c.phone1 || '');
                  setPhone2(c.phone2 || '');
                }}
              />
              
              {invoiceType === 'debt' && (
                <div className="mt-3 flex flex-col gap-2 p-3 bg-warn-50 rounded-lg border border-warn-100">
                  <label className="block text-xs font-bold text-warn-800">بيانات الاتصال (مطلوب للديون):</label>
                  <input
                    type="tel"
                    placeholder="رقم الهاتف الأساسي *"
                    value={phone1}
                    onChange={e => setPhone1(e.target.value)}
                    className="input py-2 text-sm"
                    dir="ltr"
                  />
                  <input
                    type="tel"
                    placeholder="رقم الهاتف البديل (اختياري)"
                    value={phone2}
                    onChange={e => setPhone2(e.target.value)}
                    className="input py-2 text-sm"
                    dir="ltr"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 bg-white rounded-xl border border-ink-200 p-3 shadow-sm overflow-y-auto min-h-[220px]">
              {/* أزرار إضافة بند حر وشراء موقعي */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowCustomItemModal(true)}
                  className="flex-1 py-2 px-2.5 bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs cursor-pointer"
                  title="إضافة بند مخصص أو أجور تركيب أو خدمة خارجية"
                >
                  <span className="text-base">✨</span>
                  <span>إضافة بند حر (خدمة)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSitePurchaseModal(true)}
                  className="flex-1 py-2 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs cursor-pointer"
                  title="تسجيل شراء مادة إضافية من السوق وخصمها من القاصة أو الماستر"
                >
                  <span className="text-base">🛒</span>
                  <span>شراء موقعي (قاصة/ماستر)</span>
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-ink-400">
                  <p className="text-sm font-bold">الفاتورة فارغة حالياً.</p>
                  <p className="text-xs text-ink-400 mt-1">اختر من المنتجات أو أضف بنداً حراً أو شراء موقعي</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item, index) => {
                    const originalItem = sale.items?.find(i => i.productId === item.productId || (i.cartItemId && i.cartItemId === item.cartItemId));
                    const isNew = !originalItem;
                    const isReduced = originalItem && item.quantity < originalItem.quantity;
                    const isIncreased = originalItem && item.quantity > originalItem.quantity;
                    const isFirst = index === 0;
                    const isLast = index === cart.length - 1;
                    const isDragging = draggedCartIndex === index;
                    const isDragOver = dragOverCartIndex === index;
                    const itemKey = item.cartItemId || `${item.productId}_${index}`;
                    
                    return (
                      <div 
                        key={itemKey} 
                        draggable
                        onDragStart={(e) => handleCartDragStart(e, index)}
                        onDragOver={(e) => handleCartDragOver(e, index)}
                        onDragLeave={(e) => handleCartDragLeave(e, index)}
                        onDrop={(e) => handleCartDrop(e, index)}
                        onDragEnd={handleCartDragEnd}
                        className={`flex gap-2 sm:gap-2.5 items-center p-2 rounded-xl border transition-all ${
                          isDragging ? 'opacity-30 border-dashed border-brand-400 bg-brand-50/30' : ''
                        } ${
                          isDragOver ? 'border-brand-500 ring-2 ring-brand-300 bg-brand-50/50 scale-[1.01]' : ''
                        } ${
                          isFirst && cart.length > 1
                            ? 'border-amber-300 bg-amber-50/20'
                            : isNew 
                            ? 'border-brand-300 bg-brand-50/30' 
                            : isReduced 
                            ? 'border-warn-300 bg-warn-50/30' 
                            : 'border-ink-100 bg-white'
                        }`}
                      >
                        {/* رقم ترتيب العنصر فقط (بدون أزرار تزاحم اسم المادة) */}
                        <div className="shrink-0 select-none">
                          <select
                            value={index + 1}
                            onChange={(e) => moveCartItem(index, Number(e.target.value) - 1)}
                            className={`w-6 h-6 text-xs font-mono font-black rounded-md border text-center cursor-pointer appearance-none transition-all flex items-center justify-center p-0 ${
                              isFirst
                                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                : 'bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 border-slate-200 hover:border-brand-300'
                            }`}
                            title={`ترتيب العنصر: ${index + 1} (اضغط لتغيير ترتيبه)`}
                          >
                            {cart.map((_, i) => (
                              <option key={i} value={i + 1}>
                                {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* تفاصيل البند */}
                        <div className="flex-1 min-w-0 pr-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-bold text-ink-900 truncate" title={item.name}>{item.name}</p>
                            {item.isSitePurchase ? (
                              <span className={`inline-flex items-center gap-1 ${item.paymentSource === 'mastercard' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-emerald-100 border-emerald-300 text-emerald-900'} border text-[10px] font-black px-1.5 py-0.5 rounded shrink-0`}>
                                <span>{item.paymentSource === 'mastercard' ? '💳' : '🛒'}</span>
                                <span>{item.paymentSource === 'mastercard' ? 'شراء موقعي (ماستر)' : 'شراء موقعي (قاصة)'}</span>
                              </span>
                            ) : item.isCustom ? (
                              <span className="inline-flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-800 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                <span>✨</span>
                                <span>بند حر / خدمة</span>
                              </span>
                            ) : null}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-ink-500 font-bold">البيع:</span>
                              <button
                                onClick={() => setEditingPriceItem({ item, tempPrice: item.unitPrice, error: '' })}
                                className={`w-20 border rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:ring-2 focus:ring-brand-500 text-left cursor-text hover:bg-brand-50 transition-colors ${
                                  Number(item.unitPrice) === 0
                                    ? 'border-emerald-300 text-emerald-800 bg-emerald-50'
                                    : Number(item.unitPrice) < (item.wholesalePrice || 0) && !item.isService
                                    ? 'border-danger-400 text-danger-700 bg-danger-50'
                                    : 'border-ink-200 text-brand-600 bg-white'
                                }`}
                                title="اضغط لتعديل سعر البيع"
                              >
                                {Number(item.unitPrice || 0).toLocaleString()}
                              </button>
                              <span className="text-[10px] text-ink-400">د.ع</span>
                            </div>

                            {item.isSitePurchase ? (
                              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-900">
                                <span className="text-amber-700">شراء مخصوم من {item.paymentSource === 'mastercard' ? 'الماستر' : 'القاصة'}:</span>
                                <span className="font-mono text-amber-950 font-black">{(item.purchaseCost || item.wholesalePrice || 0).toLocaleString()} د.ع</span>
                                <span className="text-[9px] text-amber-600 font-normal">(إرجاعه يسترد المبلغ فوراً)</span>
                              </div>
                            ) : !item.isService && (
                              <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700">
                                <span className="text-slate-500">الجملة (التكلفة):</span>
                                <span className="font-mono text-slate-900 font-black">{(item.wholesalePrice || 0).toLocaleString()} د.ع</span>
                              </div>
                            )}

                            {Number(item.unitPrice) === 0 ? (
                              <span className="text-[10px] text-emerald-800 bg-emerald-100 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                🎁 هدية / مجاني
                              </span>
                            ) : (
                              Number(item.unitPrice) < (item.wholesalePrice || 0) && !item.isService && (
                                <span className="text-[10px] text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">
                                  ⚠️ دون الجملة ({item.wholesalePrice})
                                </span>
                              )
                            )}
                          </div>
                          {originalItem && (
                            <p className="text-[10px] text-ink-400 mt-1">الكمية السابقة: {originalItem.quantity}</p>
                          )}
                        </div>

                        {/* الكمية والحذف */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.productId, e.target.value)}
                              className="w-16 border border-ink-200 rounded-md px-1 py-1 text-center text-sm font-bold font-mono focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            />
                            {item.sellMode && item.sellMode !== 'unit' && (
                              <span className="absolute -top-2 -right-2 bg-brand-100 text-brand-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                {item.sellMode === 'meter' ? 'متر' : 'لفة'}
                              </span>
                            )}
                          </div>
                          <button onClick={() => removeFromCart(item.productId)} className="p-1.5 text-ink-400 hover:text-danger-500 hover:bg-danger-50 rounded-md transition-colors cursor-pointer" title="حذف من الفاتورة">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-ink-200 p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between text-sm text-ink-600">
                <span>الخصم</span>
                <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value)||0)} className="w-24 input py-1 px-2 text-left" />
              </div>
              <div className="flex justify-between text-sm text-ink-600">
                <span>الإجمالي الأصلي</span>
                <span>{sale.total.toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-ink-900 pt-2 border-t border-ink-100">
                <span>الإجمالي الجديد</span>
                <span>{newSummary.total.toLocaleString()} د.ع</span>
              </div>

              {diff !== 0 && (
                <div className={`p-3 rounded-lg text-sm font-bold flex justify-between ${diff > 0 ? 'bg-danger-50 text-danger-800 border border-danger-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  <span>{diff > 0 ? 'المطلوب إضافته من العميل:' : 'المبلغ المرتجع للعميل:'}</span>
                  <span>{Math.abs(diff).toLocaleString()} د.ع</span>
                </div>
              )}

              {saveError && <div className="text-sm text-danger-600 bg-danger-50 p-2 rounded-lg">{saveError}</div>}
              
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات وتحديث المخزون'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
