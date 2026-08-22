import React, { useEffect, useRef, useState, useCallback, useMemo, startTransition } from 'react';
import {
  findProductByBarcode,
  checkoutSale,
  createDraftSale,
  updateDraftSale,
  deleteDraftSale,
  confirmDraftSale,
  suspendSale,
  unsuspendSale,
} from '../services/salesService';
import { createOffer, updateOffer } from '../services/offersService';
import {
  createCartItem,
  cartItemsFromDraft,
  calculateOrderSummary,
  createLaborCartItem,
} from '../models/sale';
import { useDraftSales } from '../hooks/useDraftSales';
import { useLaborCharges } from '../hooks/useLaborCharges';
import { useCustomers } from '../hooks/useCustomers';
import { useCustody } from '../hooks/useCustody';
import ProductGrid from './ProductGrid';
import CustomerSelect from './CustomerSelect';
import InvoiceReceipt from './InvoiceReceipt';
import { useUI } from '../contexts/UIContext';

export default function POSScreen({ 
  mode = 'sale', 
  cashierEmail, 
  draftToOpen, 
  onDraftOpened,
  offerToOpen,
  onOfferOpened,
  custodyTechToOpen,
  onCustodyTechOpened,
  onCloseOfferMode,
  products 
}) {
  const { toast } = useUI();
  const { drafts } = useDraftSales();
  const { laborCharges } = useLaborCharges();
  const { customers } = useCustomers();
  const { technicians, custodies } = useCustody();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [invoiceType, setInvoiceType] = useState('cash');
  const [stockSource, setStockSource] = useState('store'); // 'store' | 'warehouse' | 'custody'
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [showPrintOptionsModal, setShowPrintOptionsModal] = useState(false);
  
  // Offer mode state
  const [offerName, setOfferName] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [scanError, setScanError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmingDraftId, setConfirmingDraftId] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showLaborMenu, setShowLaborMenu] = useState(false);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isCartMaximized, setIsCartMaximized] = useState(false);
  const [editingPriceItem, setEditingPriceItem] = useState(null); // { item, tempPrice, error }
  const [suspendingDraftId, setSuspendingDraftId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (draftToOpen && mode === 'sale') {
      handleLoadDraft(draftToOpen);
      onDraftOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToOpen, mode]);

  useEffect(() => {
    if (offerToOpen && mode === 'offer') {
      handleLoadOffer(offerToOpen);
      onOfferOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerToOpen, mode]);

  useEffect(() => {
    if (custodyTechToOpen) {
      setStockSource('custody');
      setSelectedTechnicianId(custodyTechToOpen.id);
      onCustodyTechOpened?.();
    }
  }, [custodyTechToOpen]);

  useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+Enter: Checkout
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (cart.length > 0 && !checkingOut) {
          e.preventDefault();
          handleCheckout();
        }
      }
      // Ctrl+Shift+P: Print directly without confirmation
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        if (cart.length > 0) {
          e.preventDefault();
          handlePrintCurrentCart();
        }
      }
      
      // Escape: Close internal modals
      if (e.key === 'Escape') {
        if (showDraftsModal) {
          e.preventDefault();
          setShowDraftsModal(false);
        } else if (editingPriceItem) {
          e.preventDefault();
          setEditingPriceItem(null);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, checkingOut, showReceipt, showDraftsModal, editingPriceItem, invoiceType, customerName, phone1, phone2, discount, taxRate]);

  useEffect(() => {
    if (customerName && !phone1 && customers.length > 0) {
      const c = customers.find(x => x.name.trim() === customerName.trim());
      if (c && c.phone1) {
        setPhone1(c.phone1);
        if (c.phone2 && !phone2) setPhone2(c.phone2);
      }
    }
  }, [customerName, customers, phone1, phone2]);

  // Compute products shown in the grid based on the selected stock source
  const displayProducts = useMemo(() => {
    if (stockSource === 'custody') {
      if (!selectedTechnicianId) return [];
      const custody = custodies[selectedTechnicianId];
      const custodyItems = custody?.items || [];
      if (custodyItems.length === 0) return [];

      return custodyItems
        .filter((ci) => Number(ci.quantity) > 0)
        .map((ci) => {
          const fullProd = products.find((p) => p.id === ci.productId) || {};
          return {
            ...fullProd,
            id: ci.productId,
            name: ci.name || fullProd.name || '',
            sku: ci.sku || fullProd.sku || '',
            barcode: ci.barcode || fullProd.barcode || '',
            cameraType: ci.cameraType || fullProd.cameraType || '',
            sellMode: ci.sellMode || fullProd.sellMode || 'unit',
            retailPrice: Number(ci.retailPrice) || Number(fullProd.retailPrice) || 0,
            wholesalePrice: Number(ci.costPrice || ci.wholesalePrice) || Number(fullProd.wholesalePrice) || 0,
            storeQty: Number(ci.quantity) || 0,
            warehouseQty: 0,
            isCustodyItem: true,
            custodyQty: Number(ci.quantity) || 0,
          };
        });
    }

    if (stockSource === 'warehouse') {
      return products.map((p) => ({
        ...p,
        storeQty: Number(p.warehouseQty) || 0,
        isWarehouseStock: true,
      }));
    }

    return products;
  }, [products, stockSource, selectedTechnicianId, custodies]);

  async function handleScanSubmit(e) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeInput('');
    setScanError('');
    setLastInvoice(null);

    try {
      if (stockSource === 'custody') {
        if (!selectedTechnicianId) {
          setScanError('⚠️ يرجى تحديد الفني أولاً لصرف المواد من عهدته');
          return;
        }
        const matchedCustodyProduct = displayProducts.find(
          (p) => (p.barcode && p.barcode === code) || (p.sku && p.sku.toLowerCase() === code.toLowerCase())
        );
        if (!matchedCustodyProduct) {
          const inMaster = products.find((p) => (p.barcode && p.barcode === code) || (p.sku && p.sku.toLowerCase() === code.toLowerCase()));
          if (inMaster) {
            setScanError(`⚠️ المادة "${inMaster.name}" غير محملة في عهدة سيارة هذا الفني!`);
          } else {
            setScanError(`لم يتم العثور على منتج بهذا الباركود: ${code}`);
          }
          return;
        }
        addToCart(matchedCustodyProduct);
        return;
      }

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

  const addToCart = useCallback((product) => {
    startTransition(() => {
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === product.id);
        if (existing) {
          return prev.map((item) =>
            item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [...prev, createCartItem(product, 1)];
      });
    });
  }, []);

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
    startTransition(() => {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
    });
  }

  function resetOrderState() {
    setCart([]);
    setEditingDraftId(null);
    setEditingOfferId(null);
    setDiscount(0);
    setTaxRate(0);
    setCustomerName('');
    setPhone1('');
    setPhone2('');
    setInvoiceType('cash');
    setStockSource('store');
    setSelectedTechnicianId('');
    setOfferName('');
    setOfferNotes('');
    setShowMobileCart(false);
  }

  const selectedTech = technicians.find(t => t.id === selectedTechnicianId);
  const orderOptions = {
    discount,
    taxRate,
    customerName,
    invoiceType,
    paymentMethod: invoiceType === 'mastercard' ? 'mastercard' : (invoiceType === 'debt' ? 'debt' : 'cash'),
    phone1,
    phone2,
    offerName,
    notes: offerNotes,
    stockSource,
    technicianId: stockSource === 'custody' ? selectedTechnicianId : null,
    technicianName: stockSource === 'custody' ? selectedTech?.name : null,
    cashierEmail: cashierEmail || user?.email || ''
  };

  async function handleCheckout() {
    if (stockSource === 'custody' && !selectedTechnicianId) {
      setCheckoutError('⚠️ يرجى اختيار الفني أو السيارة لصرف المواد من عهدته');
      return;
    }
    if (mode === 'offer') {
      if (!offerName.trim()) {
        setCheckoutError('⚠️ يجب إدخال اسم العرض أولاً');
        return;
      }
      setCheckoutError('');
      setCheckingOut(true);
      try {
        let result;
        if (editingOfferId) {
          result = await updateOffer(editingOfferId, cart, orderOptions);
        } else {
          result = await createOffer(cart, orderOptions);
        }
        if (result) result.isOffer = true;
        setLastInvoice(result);
        setShowReceipt(false);
        resetOrderState();
      } catch (err) {
        setCheckoutError(err.message);
      } finally {
        setCheckingOut(false);
        inputRef.current?.focus();
      }
      return;
    }

    if (invoiceType === 'debt') {
      if (!customerName.trim()) {
        setCheckoutError('⚠️ يجب إدخال اسم العميل لتسجيل فاتورة ديون');
        return;
      }
      if (!phone1.trim()) {
        setCheckoutError('⚠️ رقم الهاتف إجباري في حال بيع الدين');
        return;
      }
    }
    setCheckoutError('');
    setCheckingOut(true);
    try {
      const result = await checkoutSale(cart, cashierEmail, orderOptions);
      if (editingDraftId) {
        try {
          await deleteDraftSale(editingDraftId);
        } catch (delErr) {
          console.error("فشل مسح المسودة بعد الدفع:", delErr);
        }
      }
      setLastInvoice(result);
      setShowReceipt(false);
      resetOrderState();
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setCheckingOut(false);
      inputRef.current?.focus();
    }
  }

  async function handleSaveDraft() {
    if (invoiceType === 'debt') {
      if (!customerName.trim()) {
        setDraftError('⚠️ يجب إدخال اسم العميل لحفظ فاتورة ديون مؤقتة');
        return;
      }
      if (!phone1.trim()) {
        setDraftError('⚠️ رقم الهاتف إجباري في حال بيع الدين ولو كانت مسودة');
        return;
      }
    }
    setDraftError('');
    setSavingDraft(true);
    try {
      if (editingDraftId) {
        await updateDraftSale(editingDraftId, cart, orderOptions);
      } else {
        await createDraftSale(cart, cashierEmail, orderOptions);
      }
      resetOrderState();
    } catch (err) {
      setDraftError(`فشل حفظ الفاتورة المؤقتة: ${err.message}`);
    } finally {
      setSavingDraft(false);
      inputRef.current?.focus();
    }
  }

  function handleLoadDraft(draft) {
    setDraftError('');
    
    // إثراء عناصر السلة ببيانات المنتج الحالية (سعر الجملة والكمية المتوفرة)
    const enrichedItems = cartItemsFromDraft(draft.items).map(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        return {
          ...item,
          name: product.name,
          unitPrice: Number(product.price) || item.unitPrice,
          originalPrice: Number(product.price) || item.originalPrice,
          wholesalePrice: item.wholesalePrice || Number(product.wholesalePrice) || 0,
          availableQuantity: Number(product.storeQty) || 0
        };
      }
      return item;
    });

    setCart(enrichedItems);
    setDiscount(draft.discount || 0);
    setTaxRate(draft.taxRate || 0);
    setCustomerName(draft.customerName || '');
    setPhone1(draft.phone1 || '');
    setPhone2(draft.phone2 || '');
    setInvoiceType(draft.invoiceType || 'cash');
    setEditingDraftId(draft.id);
  }

  function handleLoadOffer(offer) {
    setDraftError('');
    
    const enrichedItems = cartItemsFromDraft(offer.items).map(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        return {
          ...item,
          wholesalePrice: item.wholesalePrice || Number(product.wholesalePrice) || 0,
          availableQuantity: Number(product.storeQty) || 0
        };
      }
      return item;
    });

    setCart(enrichedItems);
    setDiscount(offer.discount || 0);
    setTaxRate(offer.taxRate || 0);
    setCustomerName(offer.customerName || '');
    setOfferName(offer.offerName || '');
    setOfferNotes(offer.notes || '');
    setEditingOfferId(offer.id);
  }

  const handlePrintCurrentCart = () => {
    const summary = calculateOrderSummary(cart, discount, taxRate);
    const itemsWithLineTotal = cart.map(item => ({
      ...item,
      lineTotal: item.quantity * item.unitPrice
    }));
    const unconfirmedInvoice = {
      invoiceNumber: 'غير مؤكدة',
      isDraft: true,
      items: itemsWithLineTotal,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      cashierEmail,
      createdAt: new Date(),
      customerName,
      phone1,
      phone2,
    };
    setLastInvoice(unconfirmedInvoice);
    setShowReceipt(true);
  };

  const handleSaveAsOfferFromPrint = async () => {
    if (cart.length === 0) return;
    setShowPrintOptionsModal(false);
    setCheckingOut(true);
    try {
      const generatedOfferName = offerName.trim() || `عرض سعر - ${customerName.trim() || 'عميل عام'}`;
      const offerOptions = {
        offerName: generatedOfferName,
        customerName: customerName.trim() || '',
        notes: offerNotes || '',
        discount,
        taxRate,
        cashierEmail: cashierEmail || '',
      };
      const result = await createOffer(cart, offerOptions);
      if (result) result.isOffer = true;
      toast(`تم حفظ عرض السعر بنجاح في قسم عروض الأسعار (#${result.offerNumber}) 📑✨`, 'success');
      setLastInvoice(result);
      setShowReceipt(true);
    } catch (err) {
      toast(`فشل حفظ عرض السعر: ${err.message}`, 'error');
    } finally {
      setCheckingOut(false);
    }
  };

  async function handleDeleteDraft(draftId) {
    setDraftError('');
    try {
      await deleteDraftSale(draftId);
      if (editingDraftId === draftId) resetOrderState();
    } catch (err) {
      setDraftError(`فشل حذف الفاتورة المؤقتة: ${err.message}`);
    }
  }

  async function handleConfirmDraft(draftId) {
    setDraftError('');
    setConfirmingDraftId(draftId);
    try {
      const draft = drafts.find(d => d.id === draftId);
      if (draft && (draft.invoiceType === 'debt' || invoiceType === 'debt') && !draft.customerName) {
        setDraftError('يجب إدخال اسم العميل قبل تأكيد فاتورة الآجل');
        return;
      }
      const result = await confirmDraftSale(draftId, cashierEmail, draft?.invoiceType);
      setLastInvoice(result);
      if (editingDraftId === draftId) resetOrderState();
    } catch (err) {
      setDraftError(`فشل تأكيد الفاتورة: ${err.message}`);
    } finally {
      setConfirmingDraftId(null);
    }
  }

  const summary = calculateOrderSummary(cart, discount, taxRate);

  function formatDraftDate(timestamp) {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('ar-IQ', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch {
      return '';
    }
  }

  const renderDraftsModal = () => {
    if (!showDraftsModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-ink-100 flex items-center justify-between bg-ink-50/50">
            <h3 className="font-bold text-ink-900 text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              الفواتير المعلقة {drafts.length > 0 && <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-sm">{drafts.length}</span>}
            </h3>
            <button onClick={() => setShowDraftsModal(false)} className="p-2 text-ink-400 hover:text-danger-500 hover:bg-danger-50 rounded-full transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-4 bg-ink-50/30">
            {drafts.length === 0 ? (
              <div className="text-center text-ink-400 py-12 flex flex-col items-center gap-3">
                <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="text-lg">لا توجد فواتير معلقة حالياً</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-ink-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-ink-50 text-ink-600 font-bold border-b border-ink-200">
                    <tr>
                      <th className="p-3">الزبون</th>
                      <th className="p-3">الوقت</th>
                      <th className="p-3 text-center">الأصناف</th>
                      <th className="p-3">المجموع</th>
                      <th className="p-3 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {drafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-ink-50 transition-colors">
                        <td className="p-3 font-bold text-ink-900">
                          {draft.customerName || 'بدون اسم'}
                          {draft.invoiceType === 'debt' && (
                            <span className="mr-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-warn-100 text-warn-800">
                              ديون
                            </span>
                          )}
                          {draft.status === 'suspended' && (
                            <span className="mr-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              محجوزة
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-ink-500 font-medium">{formatDraftDate(draft.createdAt)}</td>
                        <td className="p-3 text-center font-medium">{draft.items?.length || 0}</td>
                        <td className="p-3 text-brand-600 font-bold">{Number(draft.total || 0).toLocaleString()} د.ع</td>
                        <td className="p-3 text-left">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setLastInvoice({ 
                                  ...draft, 
                                  cashierEmail: cashierEmail || draft.cashierEmail, 
                                  invoiceNumber: 'مسودة', 
                                  isDraft: true 
                                });
                                setShowReceipt(true);
                              }}
                              title="طباعة المسودة"
                              className="p-1.5 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded-lg"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                            </button>
                            <button
                              onClick={() => {
                                handleLoadDraft(draft);
                                setShowDraftsModal(false);
                              }}
                              className="px-3 py-1.5 text-sm font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                            >
                              متابعة
                            </button>
                            <button
                              onClick={() => handleSuspendDraft(draft)}
                              disabled={suspendingDraftId === draft.id}
                              className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 ${
                                draft.status === 'suspended' 
                                  ? 'text-orange-700 bg-orange-50 hover:bg-orange-100'
                                  : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                              }`}
                            >
                              {suspendingDraftId === draft.id ? '...' : draft.status === 'suspended' ? 'إلغاء التعليق' : 'تعليق الفاتورة'}
                            </button>
                            <button
                              onClick={() => handleConfirmDraft(draft.id)}
                              disabled={confirmingDraftId === draft.id}
                              className="px-3 py-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                              دفع
                            </button>
                            <button
                              onClick={() => handleDeleteDraft(draft.id)}
                              className="px-3 py-1.5 text-sm font-bold text-danger-700 bg-danger-50 hover:bg-danger-100 rounded-lg transition-colors"
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPriceModal = () => {
    if (!editingPriceItem) return null;
    const { item, tempPrice, error } = editingPriceItem;
    
    const handleSavePrice = () => {
      const numPrice = Number(tempPrice);
      if (!item.isService && numPrice > 0 && numPrice < item.wholesalePrice) {
        setEditingPriceItem(prev => ({
          ...prev,
          error: `لا يمكن بيع المادة بسعر أقل من التكلفة إلا إذا كانت هدية (0 د.ع). أقل سعر ممكن هو ${item.wholesalePrice.toLocaleString()} د.ع`
        }));
        return;
      }
      updatePrice(item.productId, numPrice);
      setEditingPriceItem(null);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 animate-in zoom-in-95 duration-200">
          <h3 className="font-bold text-ink-900 text-lg mb-3">تعديل سعر البيع</h3>
          <p className="text-sm font-bold text-ink-800 mb-3 bg-ink-50 p-2 rounded-lg truncate" title={item.name}>{item.name}</p>
          
          {!item.isService && (
            <div className="flex justify-between items-center bg-brand-50 border border-brand-100 p-2.5 rounded-lg mb-3 text-xs font-bold text-brand-800">
              <span>سعر التكلفة (الجملة):</span>
              <span className="font-mono">{item.wholesalePrice.toLocaleString()} د.ع</span>
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

  const renderPrintOptionsModal = () => {
    if (!showPrintOptionsModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
        <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span className="p-1.5 bg-brand-50 text-brand-600 rounded-xl text-lg">🖨️</span>
              <span>خيارات الطباعة والحفظ</span>
            </h3>
            <button 
              type="button"
              onClick={() => setShowPrintOptionsModal(false)} 
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors font-bold text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            حدد نوع العملية المطلوبة لهذه المواد الموجودة في السلة:
          </p>

          <div className="space-y-3">
            {/* خيار 1: طباعة فاتورة مؤقتة */}
            <button
              type="button"
              onClick={() => {
                setShowPrintOptionsModal(false);
                handlePrintCurrentCart();
              }}
              className="w-full p-3.5 rounded-2xl border-2 border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 text-right transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 text-slate-700 group-hover:text-brand-600 flex items-center justify-center text-xl transition-colors shrink-0">
                  🖨️
                </div>
                <div>
                  <span className="text-sm font-black text-slate-900 block">طباعة فاتورة مؤقتة (غير مؤكدة)</span>
                  <span className="text-[11px] text-slate-500 block">معاينة وطباعة الفاتورة دون توثيقها كعرض سعر</span>
                </div>
              </div>
              <span className="text-brand-600 font-bold text-base group-hover:-translate-x-1 transition-transform">←</span>
            </button>

            {/* خيار 2: حفظ كعرض سعر رسمي */}
            <button
              type="button"
              onClick={handleSaveAsOfferFromPrint}
              className="w-full p-3.5 rounded-2xl border-2 border-indigo-200 hover:border-indigo-600 hover:bg-indigo-50/60 text-right transition-all flex items-center justify-between group cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl transition-colors shrink-0">
                  📑
                </div>
                <div>
                  <span className="text-sm font-black text-indigo-950 block">حفظ كعرض سعر في «عروض الأسعار»</span>
                  <span className="text-[11px] text-slate-600 block">توثيق وحفظ العرض رسمياً مع فتح نافذة الطباعة والمشاركة</span>
                </div>
              </div>
              <span className="text-indigo-600 font-bold text-base group-hover:-translate-x-1 transition-transform">←</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden relative" dir="rtl">
      {renderDraftsModal()}
      {renderPriceModal()}
      {renderPrintOptionsModal()}

      {/* Mobile Cart Toggle Button */}
      <div className="lg:hidden shrink-0 mt-2">
        <button
          onClick={() => setShowMobileCart(true)}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-xl shadow-md flex justify-between items-center transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            <span>عرض السلة ({cart.length})</span>
          </div>
          <span>{Number(summary.total || 0).toLocaleString()} د.ع</span>
        </button>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 flex-1 min-h-0 min-w-0 w-full">
        {/* القسم الأيمن: المنتجات */}
        <div className={`${isCartMaximized ? 'hidden' : 'lg:w-[55%] flex flex-col gap-4 h-full min-h-0 min-w-0'}`}>
        <form onSubmit={handleScanSubmit} className="relative shrink-0">
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-ink-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            className="input pl-4 pr-12 py-3 text-base shadow-sm border-ink-200 w-full rounded-xl"
            placeholder="امسح الباركود أو ابحث عن منتج..."
            autoFocus
          />
        </form>

        {scanError && (
          <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded-lg p-3">
            {scanError}
          </div>
        )}

        <div className="flex-1 min-h-0 bg-ink-50/30 rounded-xl border border-ink-200 p-4 shadow-sm flex flex-col">
          {stockSource === 'custody' && (
            <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs font-bold text-indigo-900 shadow-2xs">
              <span className="flex items-center gap-1.5">
                <span className="text-sm">🚚</span>
                <span>المواد في عهدة: <strong className="text-indigo-700">{selectedTech?.name || 'الفني المحدد'}</strong></span>
              </span>
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[11px] font-mono">
                {displayProducts.length} صنف متاح
              </span>
            </div>
          )}

          {stockSource === 'warehouse' && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-bold text-amber-900 shadow-2xs">
              <span className="flex items-center gap-1.5">
                <span className="text-sm">🏢</span>
                <span>عرض مخزون المخزن الرئيسي</span>
              </span>
              <span className="bg-amber-600 text-white px-2.5 py-0.5 rounded-full text-[11px] font-mono">
                المخزن الرئيسي
              </span>
            </div>
          )}

          <ProductGrid
            products={displayProducts}
            onSelect={addToCart}
            allowOutOfStock={mode === 'offer'}
            emptyMessage={
              stockSource === 'custody'
                ? !selectedTechnicianId
                  ? 'يرجى اختيار الفني من القائمة لعرض عهدة سيارته'
                  : `لا توجد مواد محملة في سيارة الفني (${selectedTech?.name || ''}) حالياً`
                : 'لا توجد مواد مطابقة'
            }
          />
        </div>
      </div>

      {/* القسم الأيسر: الفاتورة */}
        <div className={`
          ${showMobileCart ? 'fixed inset-0 z-50 bg-slate-50 p-3 sm:p-4 flex overflow-y-auto safe-bottom' : 'hidden lg:flex'} 
          ${isCartMaximized ? 'w-full !max-w-none' : 'lg:w-[45%]'} 
          lg:static lg:p-0 lg:bg-transparent lg:z-auto
          flex-col gap-4 h-full min-h-0 min-w-0 relative w-full
        `}>
          {/* Mobile Header for Cart Overlay */}
          {showMobileCart && (
            <div className="flex items-center justify-between lg:hidden shrink-0 mb-1 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛒</span>
                <h2 className="font-bold text-base text-slate-900">سلة المبيعات ({cart.length})</h2>
              </div>
              <button 
                onClick={() => setShowMobileCart(false)} 
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>متابعة التسوق</span>
                <span>✕</span>
              </button>
            </div>
          )}

          {showReceipt && lastInvoice && (
            <InvoiceReceipt sale={lastInvoice} onClose={() => setShowReceipt(false)} />
          )}

          <div className="card flex-1 flex flex-col shadow-xl shadow-ink-200/40 border-ink-200 min-h-0 min-w-0 overflow-hidden rounded-2xl w-full">
            {/* Header: Title + Type Switch + Drafts + Services Dropdown */}
            <div className="p-3 border-b border-ink-100 bg-white">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-ink-900 text-sm shrink-0">تفاصيل الفاتورة</h3>

                  {/* شارة تعديل فاتورة مؤقتة - مدمجة دون التأثير على الحجم */}
                  {editingDraftId && (
                    <div className="bg-warn-50 border border-warn-300 text-warn-900 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1.5 shadow-2xs animate-in fade-in duration-150">
                      <span className="text-xs">✏️</span>
                      <span className="font-bold text-[11px]">تعديل مؤقتة</span>
                      <button 
                        type="button"
                        onClick={resetOrderState} 
                        className="text-danger-600 hover:text-danger-800 underline text-[10px] font-black mr-0.5 cursor-pointer"
                        title="إلغاء التعديل والعودة لسلة جديدة"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}

                  {/* شارة تم البيع - مدمجة دون التأثير على الحجم */}
                  {lastInvoice && !editingDraftId && (
                    <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs px-2 py-0.5 rounded-lg flex items-center gap-1.5 shadow-2xs animate-in fade-in duration-150">
                      <span className="text-xs text-emerald-600">✓</span>
                      <span className="font-bold text-[11px]">تم البيع (#{lastInvoice.invoiceNumber})</span>
                      <button
                        type="button"
                        onClick={() => setShowReceipt(true)}
                        className="text-emerald-700 hover:text-emerald-950 font-black text-[10px] underline mr-0.5 cursor-pointer"
                        title="عرض / طباعة الفاتورة"
                      >
                        عرض
                      </button>
                      <button
                        type="button"
                        onClick={() => setLastInvoice(null)}
                        className="text-ink-400 hover:text-ink-700 text-[10px] mr-1 cursor-pointer"
                        title="إخفاء الإشعار"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsCartMaximized(!isCartMaximized)}
                    className="hidden lg:flex items-center justify-center p-1 text-ink-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors cursor-pointer"
                    title={isCartMaximized ? 'تصغير السلة' : 'تكبير السلة'}
                  >
                    {isCartMaximized ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9V4m0 5H4m5 0l-5-5m11 5V4m0 5h5m-5 0l5-5M9 15v5m0-5H4m5 0l-5 5m11-5v5m0-5h5m-5 0l5 5"></path></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                    )}
                  </button>
                </div>

                {mode === 'sale' && (
                  <div className="flex items-center gap-2">
                    {/* Labor Services Dropdown */}
                    {laborCharges?.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowLaborMenu(!showLaborMenu)}
                          className="px-2.5 py-1 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>+ أجور وخدمات</span>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {showLaborMenu && (
                          <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-brand-200 rounded-xl shadow-xl z-30 p-1.5 animate-in fade-in zoom-in-95 duration-100">
                            <p className="text-[10px] font-bold text-ink-400 px-2 py-1 border-b border-ink-100 mb-1">اختر خدمة لإضافتها:</p>
                            {laborCharges.map((labor) => (
                              <button
                                key={labor.id}
                                onClick={() => {
                                  setCart((prev) => {
                                    const existing = prev.find((i) => i.productId === `labor_${labor.id}`);
                                    if (existing) {
                                      return prev.map((i) =>
                                        i.productId === `labor_${labor.id}`
                                          ? { ...i, quantity: i.quantity + 1 }
                                          : i
                                      );
                                    }
                                    return [...prev, createLaborCartItem(labor)];
                                  });
                                  setShowLaborMenu(false);
                                }}
                                className="w-full text-right px-2.5 py-1.5 text-xs font-bold text-ink-800 hover:bg-brand-50 hover:text-brand-700 rounded-lg flex justify-between items-center transition-colors cursor-pointer"
                              >
                                <span>{labor.name}</span>
                                <span className="font-mono text-[11px] text-brand-600">+{Number(labor.price || 0).toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cash / Mastercard / Debt Toggle */}
                    <div className="flex gap-1 bg-ink-50 p-0.5 rounded-lg border border-ink-200">
                      <button
                        type="button"
                        onClick={() => setInvoiceType('cash')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                          invoiceType === 'cash'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-ink-500 hover:text-ink-900'
                        }`}
                      >
                        <span>💵</span>
                        <span>نقد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvoiceType('mastercard')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                          invoiceType === 'mastercard'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'text-ink-500 hover:text-ink-900'
                        }`}
                      >
                        <span>💳</span>
                        <span>ماستركارد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvoiceType('debt')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                          invoiceType === 'debt'
                            ? 'bg-warn-500 text-white shadow-2xs'
                            : 'text-ink-500 hover:text-ink-900'
                        }`}
                      >
                        <span>⏳</span>
                        <span>ديون</span>
                      </button>
                    </div>

                    {/* Drafts Button */}
                    <button
                      type="button"
                      onClick={() => setShowDraftsModal(true)}
                      className="px-2.5 py-1 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="عرض الفواتير المعلقة"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      <span>المعلقة</span>
                      {drafts.length > 0 && (
                        <span className="bg-brand-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                          {drafts.length}
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Customer / Offer Name Inputs */}
              {mode === 'offer' ? (
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-ink-700 mb-1">اسم العرض / المشروع *</label>
                    <input
                      type="text"
                      value={offerName}
                      onChange={(e) => setOfferName(e.target.value)}
                      placeholder="مثال: عرض كاميرات لشركة النور..."
                      className="input py-1.5 text-xs w-full font-bold border-brand-300 focus:border-brand-500"
                    />
                  </div>
                  <CustomerSelect 
                    value={customerName} 
                    onChange={setCustomerName} 
                    label="العميل الموجه له العرض (اختياري)"
                    placeholder="اختر عميل أو اكتب اسماً جديداً..."
                    onSelect={(c) => {
                      setCustomerName(c.name);
                      setPhone1(c.phone1 || '');
                      setPhone2(c.phone2 || '');
                    }}
                  />
                  <div>
                    <label className="block text-[11px] font-bold text-ink-700 mb-1">ملاحظات العرض (شروط، فترة الضمان...)</label>
                    <textarea
                      value={offerNotes}
                      onChange={(e) => setOfferNotes(e.target.value)}
                      placeholder="مثال: الأسعار شاملة التركيب، العرض نافذ لمدة 7 أيام..."
                      rows={2}
                      className="input py-1.5 text-xs w-full resize-none"
                    />
                  </div>
                </div>
              ) : invoiceType === 'debt' ? (
                <div className="grid grid-cols-2 gap-2">
                  <CustomerSelect 
                    value={customerName} 
                    onChange={setCustomerName} 
                    label="اسم العميل (مطلوب) *"
                    placeholder="اسم العميل..."
                    onSelect={(c) => {
                      setCustomerName(c.name);
                      setPhone1(c.phone1 || '');
                      setPhone2(c.phone2 || '');
                    }}
                  />
                  <div className="relative">
                    <label className="block text-xs text-ink-500 mb-1">رقم الهاتف (مطلوب) *</label>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXXX"
                      value={phone1}
                      onChange={(e) => setPhone1(e.target.value)}
                      className="input"
                      dir="ltr"
                    />
                  </div>
                </div>
              ) : (
                <CustomerSelect 
                  value={customerName} 
                  onChange={setCustomerName} 
                  label="العميل (اختياري)"
                  placeholder="اسم العميل..."
                  onSelect={(c) => {
                    setCustomerName(c.name);
                    setPhone1(c.phone1 || '');
                    setPhone2(c.phone2 || '');
                  }}
                />
              )}

              {/* Stock Source Selector */}
              {mode === 'sale' && (
                <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-slate-600 shrink-0">
                      📦 مصدر الصرف:
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <select
                        value={stockSource}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStockSource(val);
                          if (val === 'custody') {
                            if (technicians.length > 0 && !selectedTechnicianId) {
                              setSelectedTechnicianId(technicians[0].id);
                            }
                          } else {
                            setSelectedTechnicianId('');
                          }
                        }}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="store">🏪 المحل (افتراضي)</option>
                        <option value="warehouse">🏢 المخزن الرئيسي</option>
                        <option value="custody">🚚 عهدة سيارة فني</option>
                      </select>

                      {stockSource === 'custody' && (
                        <select
                          value={selectedTechnicianId}
                          onChange={(e) => setSelectedTechnicianId(e.target.value)}
                          className="bg-indigo-50 border border-indigo-300 text-indigo-900 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer animate-fade-in"
                        >
                          {technicians.length === 0 ? (
                            <option value="">لا يوجد فنيين مسجلين</option>
                          ) : (
                            technicians.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.vehicleNumber ? `(${t.vehicleNumber})` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {checkoutError && (
                <div className="mt-2 bg-danger-50 border border-danger-500 text-danger-700 text-xs font-medium rounded-lg p-2">
                  {checkoutError}
                </div>
              )}
              {draftError && (
                <div className="mt-2 bg-orange-50 border border-orange-500 text-orange-700 text-xs font-medium rounded-lg p-2">
                  {draftError}
                </div>
              )}
            </div>

            {/* Cart Items List - Ultra Robust & Responsive */}
            <div className="flex-1 overflow-y-auto p-2.5 min-h-0 min-w-0 bg-ink-50/30">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-400 min-h-[150px]">
                  <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                  <p className="text-sm font-bold text-ink-600">السلة فارغة</p>
                  <p className="text-xs text-ink-400 mt-0.5">امسح باركود أو اختر من الشبكة</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div 
                      key={item.productId} 
                      className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-ink-200/80 shadow-2xs hover:border-brand-300 transition-colors gap-2 min-w-0"
                    >
                      {/* Name & Price */}
                      <div className="flex-1 min-w-0 pr-0.5">
                        <p 
                          className="font-bold text-ink-900 text-xs leading-snug line-clamp-2 break-words" 
                          title={item.name}
                        >
                          {item.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-ink-400 font-medium">السعر:</span>
                          <button
                            type="button"
                            onClick={() => setEditingPriceItem({ item, tempPrice: item.unitPrice, error: '' })}
                            className={`text-xs font-mono font-bold hover:underline cursor-pointer ${item.unitPrice < item.wholesalePrice && !item.isService ? 'text-danger-600' : 'text-brand-700'}`}
                            title="اضغط لتعديل السعر"
                          >
                            {Number(item.unitPrice || 0).toLocaleString()} د.ع
                          </button>
                          {item.unitPrice < item.wholesalePrice && !item.isService && (
                            <span className="text-[9px] text-danger-700 bg-danger-50 px-1 py-0.2 rounded border border-danger-200 shrink-0 font-bold">
                              ⚠️ دون التكلفة
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Controls: Quantity + Total + Delete */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Quantity Input */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.productId, e.target.value)}
                            className="w-12 border border-ink-200 rounded-lg py-1 px-1 text-center text-xs font-black font-mono focus:ring-2 focus:ring-brand-500 bg-ink-50/50"
                          />
                        </div>

                        {/* Line Total */}
                        <div className="text-left min-w-[65px] shrink-0">
                          <span className="text-xs font-black text-ink-900 font-mono block">
                            {Number((item.quantity || 1) * (item.unitPrice || 0)).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-ink-400 font-mono block leading-none">د.ع</span>
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId)}
                          className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                          title="حذف من السلة"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer: Summary & Checkout Actions */}
            <div className="p-3 bg-white border-t border-ink-100">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className={`flex items-center justify-between px-2.5 py-1 rounded-lg border transition-colors ${discount > 0 ? 'bg-danger-50/60 border-danger-200 text-danger-900' : 'bg-ink-50/60 border-ink-100'}`}>
                  <label className="text-[11px] font-bold">الخصم (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={discount || ''}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    className={`w-20 py-0.5 px-1.5 text-xs text-left font-mono font-bold rounded border ${discount > 0 ? 'bg-white border-danger-300 text-danger-700' : 'bg-white border-ink-200'}`}
                    placeholder="0"
                  />
                </div>
                <div className="flex items-center justify-between bg-ink-50/60 px-2.5 py-1 rounded-lg border border-ink-100">
                  <label className="text-[11px] font-bold text-ink-600">الضريبة %:</label>
                  <input
                    type="number"
                    min="0"
                    value={taxRate || ''}
                    onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                    className="w-16 py-0.5 px-1.5 text-xs text-left font-mono font-bold bg-white border border-ink-200 rounded"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-1 mb-2 pt-1 border-t border-ink-100">
                <div className="flex justify-between items-center text-xs text-ink-500 font-medium">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono font-bold text-ink-700">{Number(summary.subtotal || 0).toLocaleString()} د.ع</span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-danger-700 bg-danger-50 px-2 py-1 rounded-lg border border-danger-200 animate-in fade-in duration-150">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-danger-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                      الخصم:
                    </span>
                    <span className="font-mono text-sm font-black">-{Number(summary.discount || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                {summary.taxRate > 0 && (
                  <div className="flex justify-between items-center text-xs text-ink-600 font-medium">
                    <span>الضريبة ({summary.taxRate}%):</span>
                    <span className="font-mono font-bold">+{Number(summary.taxAmount || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1 border-t border-ink-100">
                  <span className="text-xs text-ink-600 font-bold">المبلغ الإجمالي:</span>
                  <div className="text-left">
                    <span className="text-xl font-black text-brand-700 font-mono">{Number(summary.total || 0).toLocaleString()}</span>
                    <span className="text-xs text-brand-700 font-bold mr-1">د.ع</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut || cart.length === 0}
                  className="flex-[2] bg-brand-600 hover:bg-brand-700 text-white font-black text-sm py-2.5 px-3 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {checkingOut ? (
                    'جارٍ الحفظ...'
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      <span>{mode === 'offer' ? (editingOfferId ? 'تحديث العرض' : 'حفظ العرض') : 'إتمام الدفع'}</span>
                    </>
                  )}
                </button>
                {mode === 'sale' && (
                  <div className="flex-[1] flex gap-1.5">
                    {editingDraftId && cart.length === 0 ? (
                      <button
                        onClick={() => handleDeleteDraft(editingDraftId)}
                        className="flex-1 py-2 text-xs font-bold text-white bg-danger-600 hover:bg-danger-700 rounded-xl transition-colors shadow-2xs cursor-pointer"
                      >
                        حذف
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveDraft}
                        disabled={savingDraft || cart.length === 0}
                        className="flex-1 py-2 text-xs font-bold text-ink-700 hover:text-ink-900 bg-ink-50 hover:bg-ink-100 border border-ink-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                        title={editingDraftId ? 'تحديث الفاتورة المعلقة' : 'تعليق الفاتورة'}
                      >
                        {savingDraft ? '...' : 'تعليق'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowPrintOptionsModal(true)}
                      disabled={cart.length === 0}
                      className="p-2 text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer"
                      title="خيارات الطباعة وحفظ عرض السعر"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
