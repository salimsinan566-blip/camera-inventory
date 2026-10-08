import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { checkoutSale, editConfirmedSale, updateDraftSale, findProductByBarcode } from '../services/salesService';
import { updateProduct } from '../services/productsService';
import { createOffer, updateOffer } from '../services/offersService';
import { createCartItem, cartItemsFromDraft } from '../models/sale';
import { useCustomers } from '../hooks/useCustomers';
import { useUI } from '../contexts/UIContext';

import PosTopToolbar from './pos/PosTopToolbar';
import PosCartTable from './pos/PosCartTable';
import PosBottomBar from './pos/PosBottomBar';
import PosCartsModal from './pos/PosCartsModal';
import PosEditInvoiceModal from './pos/PosEditInvoiceModal';
import PosAddProductModal from './pos/PosAddProductModal';
import PosProductsDrawer from './pos/PosProductsDrawer';
import PosCheckoutModal from './pos/PosCheckoutModal';
import PosLaborModal from './pos/PosLaborModal';
import InvoiceReceipt from './InvoiceReceipt';

const STORAGE_KEY = 'safezone_pos_multi_carts_v3';
const ACTIVE_CART_KEY = 'safezone_pos_active_cart_id_v3';

function createInitialCart(index = 1) {
  return {
    id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: `سلة ${index}`,
    invoiceNumber: null,
    items: [],
    customerType: 'retail', // 'retail' (زبون) | 'client' (عميل) | 'vip' (عميل مميز) | 'offer' (عرض سعر)
    invoiceDate: new Date().toISOString().slice(0, 10),
    customerName: '',
    phone1: '',
    discount: 0,
    taxRate: 0,
    notes: '',
    editingSaleId: null,
  };
}

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
  products = [],
}) {
  const { toast } = useUI();
  const { customers } = useCustomers();

  // Multi-cart state initialized from localStorage
  const [carts, setCarts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((c, i) => ({
            ...createInitialCart(i + 1),
            ...c,
            items: Array.isArray(c.items) ? c.items : [],
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved carts:', e);
    }
    return [createInitialCart(1)];
  });

  const [activeCartId, setActiveCartId] = useState(() => {
    try {
      const savedActive = localStorage.getItem(ACTIVE_CART_KEY);
      if (savedActive) return savedActive;
    } catch (e) {}
    return carts[0]?.id;
  });

  // Modals state
  const [showCartsModal, setShowCartsModal] = useState(false);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showLaborModal, setShowLaborModal] = useState(false);
  const [showProductsDrawer, setShowProductsDrawer] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(carts));
      if (activeCartId) {
        localStorage.setItem(ACTIVE_CART_KEY, activeCartId);
      }
    } catch (e) {}
  }, [carts, activeCartId]);

  // Ensure activeCartId is valid
  useEffect(() => {
    if (!carts.some((c) => c.id === activeCartId)) {
      setActiveCartId(carts[0]?.id || null);
    }
  }, [carts, activeCartId]);

  // The active cart object
  const activeCart = useMemo(() => {
    return carts.find((c) => c.id === activeCartId) || carts[0] || createInitialCart(1);
  }, [carts, activeCartId]);

  // Determine if we are in offer mode (either from Offers section or selected from customerType dropdown)
  const isOfferMode = mode === 'offer' || activeCart.customerType === 'offer';

  // Update active cart properties
  const updateActiveCart = useCallback((updates) => {
    setCarts((prevCarts) =>
      prevCarts.map((c) => (c.id === activeCartId ? { ...c, ...updates } : c))
    );
  }, [activeCartId]);

  // Sanitize initial carts from localStorage: ensure non-offer carts never show "عرض سعر" as their name
  useEffect(() => {
    setCarts((prevCarts) => {
      let changed = false;
      const cleaned = prevCarts.map((c, i) => {
        if (c.customerType !== 'offer' && c.name && c.name.includes('عرض')) {
          changed = true;
          return {
            ...c,
            name: `سلة ${i + 1}`,
          };
        }
        return c;
      });
      return changed ? cleaned : prevCarts;
    });
  }, []);

  // Handle external draft to open
  useEffect(() => {
    if (draftToOpen && mode === 'sale') {
      const isFromOffer = Boolean(draftToOpen.offerNumber || draftToOpen.isOffer);
      const draftItems = cartItemsFromDraft(draftToOpen, products);
      updateActiveCart({
        name: isFromOffer
          ? `عرض #${draftToOpen.offerNumber || ''}`
          : `فاتورة #${draftToOpen.invoiceNumber || 'معدلة'}`,
        invoiceNumber: isFromOffer ? null : (draftToOpen.invoiceNumber || null),
        customerType: (draftToOpen.customerType && draftToOpen.customerType !== 'offer')
          ? draftToOpen.customerType
          : 'retail',
        items: draftItems,
        customerName: draftToOpen.customerName || '',
        phone1: draftToOpen.phone1 || draftToOpen.customerPhone || '',
        discount: Number(draftToOpen.discount) || 0,
        notes: draftToOpen.notes || '',
        editingSaleId: isFromOffer ? null : (draftToOpen.id || null),
      });
      onDraftOpened?.();
    }
  }, [draftToOpen, mode, products, updateActiveCart, onDraftOpened]);

  // Handle external offer to open
  useEffect(() => {
    if (offerToOpen && mode === 'offer') {
      const offerItems = cartItemsFromDraft(offerToOpen, products);
      updateActiveCart({
        name: offerToOpen.offerName || `عرض #${offerToOpen.offerNumber || 'معدل'}`,
        offerName: offerToOpen.offerName || '',
        customerType: 'offer',
        items: offerItems,
        customerName: offerToOpen.customerName || '',
        phone1: offerToOpen.phone1 || offerToOpen.customerPhone || '',
        discount: Number(offerToOpen.discount) || 0,
        notes: offerToOpen.notes || '',
        editingSaleId: offerToOpen.id || null,
        invoiceNumber: offerToOpen.offerNumber || null,
      });
      onOfferOpened?.();
    }
  }, [offerToOpen, mode, products, updateActiveCart, onOfferOpened]);

  // Handle fresh offer initialization when entering in offer mode without offerToOpen
  useEffect(() => {
    if (mode === 'offer' && !offerToOpen) {
      if (activeCart.customerType === 'offer') return;

      const newOfferCartId = `offer_cart_${Date.now()}`;
      const newCart = {
        ...createInitialCart(carts.length + 1),
        id: newOfferCartId,
        name: 'عرض سعر جديد',
        offerName: '',
        customerType: 'offer',
        items: [],
        customerName: '',
        phone1: '',
        discount: 0,
        notes: '',
        editingSaleId: null,
        invoiceNumber: null,
        invoiceDate: new Date().toISOString().slice(0, 10),
      };
      setCarts((prev) => [newCart, ...prev]);
      setActiveCartId(newOfferCartId);
    }
  }, [mode, offerToOpen, activeCart.customerType, carts.length]);

// Helper: Checks if item price was manually edited in cart or is custom/service
function isPriceLockedOrCustom(item) {
  if (!item) return false;
  if (item.isCustom || item.isService || item.isSitePurchase || item.isPriceManuallySet) {
    return true;
  }
  // إذا كان السعر الحالي يختلف عن السعر الأولي الذي أضيفت به المادة للسلة
  if (item.initialUnitPrice !== undefined && Number(item.unitPrice) !== Number(item.initialUnitPrice)) {
    return true;
  }
  return false;
}

  // Switch customer type (زبون / عميل / عميل مميز / عرض سعر) and adjust item prices
  const handleChangeCustomerType = (newType) => {
    if (newType === activeCart.customerType) return;

    const updatedItems = (activeCart.items || []).map((item) => {
      if (isPriceLockedOrCustom(item)) {
        return item;
      }
      let newPrice = item.unitPrice;
      if (newType === 'vip') {
        // سعر العميل المميز (إذا محدد) وإلا سعر العميل وإلا سعر المفرد
        newPrice = Number(item.vipPrice) > 0 
          ? Number(item.vipPrice) 
          : (Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice));
      } else if (newType === 'client') {
        // سعر العميل الخاص (إذا محدد) وإلا نفس سعر المفرد
        newPrice = Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice);
      } else {
        // سعر المفرد / الزبون أو عرض السعر
        newPrice = Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice;
      }
      return {
        ...item,
        unitPrice: newPrice,
      };
    });

    updateActiveCart({
      customerType: newType,
      items: updatedItems,
      ...(newType !== 'offer' ? { offerName: '' } : {}),
    });
  };

  // Exit offer mode: returns to offers screen if in dedicated offer mode, or switches to retail if in normal POS
  const handleExitOfferMode = () => {
    if (mode === 'offer') {
      onCloseOfferMode?.();
    } else {
      handleChangeCustomerType('retail');
    }
  };

  // Handle choosing an existing customer: auto-detects if client or retail and switches prices
  const handleSelectCustomer = useCallback((customer) => {
    if (!customer) return;
    const newType = customer.customerType === 'vip' ? 'vip' : (customer.customerType === 'client' ? 'client' : 'retail');

    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;

        const updatedItems = (c.items || []).map((item) => {
          if (isPriceLockedOrCustom(item)) return item;
          let newPrice = item.unitPrice;
          if (newType === 'vip') {
            newPrice = Number(item.vipPrice) > 0 
              ? Number(item.vipPrice) 
              : (Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice));
          } else if (newType === 'client') {
            newPrice = Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice);
          } else {
            newPrice = Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice;
          }
          return { ...item, unitPrice: newPrice };
        });

        return {
          ...c,
          customerName: customer.name || '',
          phone1: customer.phone1 || customer.phone || '',
          customerId: customer.id || null,
          customerType: newType,
          items: updatedItems,
        };
      })
    );
  }, [activeCartId]);

  // Handle setting a new customer with chosen type ('retail', 'client', or 'vip')
  const handleSetNewCustomer = useCallback((name, type) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;

        const targetType = type || c.customerType || 'retail';

        // إذا كانت الفئة مطابقة لسلة التسوق الحالية، فقط نحدث اسم العميل دون مساس بأي مادة في السلة
        if (targetType === c.customerType) {
          return {
            ...c,
            customerName: trimmedName,
            customerId: null,
          };
        }

        // إذا تم تغيير الفئة، نحدث فقط المواد التي لم يتم تعديل سعرها يدوياً
        const updatedItems = (c.items || []).map((item) => {
          if (isPriceLockedOrCustom(item)) return item;
          let newPrice = item.unitPrice;
          if (targetType === 'vip') {
            newPrice = Number(item.vipPrice) > 0 
              ? Number(item.vipPrice) 
              : (Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice));
          } else if (targetType === 'client') {
            newPrice = Number(item.clientPrice) > 0 ? Number(item.clientPrice) : (Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice);
          } else {
            newPrice = Number(item.retailPrice) || Number(item.originalPrice) || item.unitPrice;
          }
          return { ...item, unitPrice: newPrice };
        });

        return {
          ...c,
          customerName: trimmedName,
          customerId: null,
          customerType: targetType,
          items: updatedItems,
        };
      })
    );
  }, [activeCartId]);

  // Handle clearing customer back to generic
  const handleClearCustomer = useCallback(() => {
    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;
        return {
          ...c,
          customerName: '',
          phone1: '',
          customerId: null,
        };
      })
    );
  }, [activeCartId]);

  // Add a product from products list (drawer or barcode)
  const handleAddProductToCart = useCallback((product, qty = 1) => {
    const isVip = activeCart.customerType === 'vip';
    const isClient = activeCart.customerType === 'client';
    const vipPrice = Number(product.vipPrice) > 0 
      ? Number(product.vipPrice) 
      : (Number(product.clientPrice) > 0 ? Number(product.clientPrice) : (Number(product.retailPrice) || 0));
    const clientPrice = Number(product.clientPrice) > 0 ? Number(product.clientPrice) : (Number(product.retailPrice) || 0);
    const retailPrice = Number(product.retailPrice) || 0;
    const basePrice = isVip ? vipPrice : (isClient ? clientPrice : retailPrice);

    const existingIndex = activeCart.items.findIndex(
      (it) => it.productId === product.id && !it.isCustom && !it.isService && !it.isSitePurchase
    );

    if (existingIndex >= 0) {
      // Increment quantity
      const existing = activeCart.items[existingIndex];
      const newQty = (Number(existing.quantity) || 1) + Number(qty);
      const updated = [...activeCart.items];
      updated[existingIndex] = { ...existing, quantity: newQty };
      updateActiveCart({ items: updated });
    } else {
      // Add new cart item
      const newItem = createCartItem(product, qty);
      newItem.unitPrice = basePrice;
      newItem.originalPrice = retailPrice;
      newItem.retailPrice = retailPrice;
      newItem.clientPrice = Number(product.clientPrice) || 0;
      newItem.vipPrice = Number(product.vipPrice) || 0;
      newItem.wholesalePrice = Number(product.wholesalePrice) || 0;
      newItem.isPriceManuallySet = false;
      newItem.initialUnitPrice = basePrice;
      updateActiveCart({ items: [...(activeCart.items || []), newItem] });
    }
  }, [activeCart, updateActiveCart]);

  // Quick Barcode / SKU / Model scan
  const handleBarcodeScan = useCallback(async (query) => {
    const clean = String(query).trim().toLowerCase();
    if (!clean) return;

    // Search in existing loaded products first
    const matched = products.find(
      (p) =>
        String(p.barcode || '').trim().toLowerCase() === clean ||
        String(p.sku || '').trim().toLowerCase() === clean ||
        String(p.model || '').trim().toLowerCase() === clean ||
        String(p.name || '').trim().toLowerCase().includes(clean)
    );

    if (matched) {
      handleAddProductToCart(matched, 1);
      toast(`تمت إضافة: ${matched.name}`, 'success');
      return;
    }

    // Try barcode search service
    try {
      const found = await findProductByBarcode(clean);
      if (found) {
        handleAddProductToCart(found, 1);
        toast(`تمت إضافة: ${found.name}`, 'success');
      } else {
        toast(`لم يتم العثور على منتج يطابق: "${query}"`, 'error');
      }
    } catch (e) {
      toast(`خطأ أثناء البحث: ${e.message}`, 'error');
    }
  }, [products, handleAddProductToCart, toast]);

  // Handle adding labor charge / service to active cart
  const handleAddLaborItemToCart = useCallback((item) => {
    const existingIndex = (activeCart.items || []).findIndex(
      (it) => it.productId === item.productId || (it.isService && it.name === item.name)
    );

    if (existingIndex >= 0) {
      const existing = activeCart.items[existingIndex];
      const newQty = (Number(existing.quantity) || 1) + (Number(item.quantity) || 1);
      const updated = [...activeCart.items];
      updated[existingIndex] = { ...existing, quantity: newQty };
      updateActiveCart({ items: updated });
    } else {
      updateActiveCart({ items: [...(activeCart.items || []), item] });
    }
    toast(`تمت إضافة: ${item.name}`, 'success');
  }, [activeCart, updateActiveCart, toast]);

  // Update item in cart (price or quantity)
  const handleUpdateItem = useCallback((index, partial) => {
    const updated = [...(activeCart.items || [])];
    if (updated[index]) {
      const item = updated[index];
      const nextPartial = { ...partial };

      if (nextPartial.attemptedUnderCost) {
        toast('⚠️ لا يمكن تقليل السعر لأقل من سعر التكلفة! مسموح فقط إعطاء المادة بسعر (0 هدية).', 'error');
        return;
      }

      if (nextPartial.unitPrice !== undefined) {
        const reqPrice = Math.max(0, Number(nextPartial.unitPrice) || 0);
        const cost = Number(item.wholesalePrice || item.purchaseCost || item.costPrice || 0);

        // قاعدة: السعر يقبل 0 فقط (هدية). لا يقبل أي سعر أكبر من 0 وأقل من التكلفة
        if (reqPrice > 0 && cost > 0 && reqPrice < cost) {
          toast('⚠️ لا يمكن تقليل السعر لأقل من سعر التكلفة! مسموح فقط إعطاء المادة بسعر (0 هدية).', 'error');
          return;
        } else {
          nextPartial.unitPrice = reqPrice;
          nextPartial.isPriceManuallySet = true;
          if (reqPrice === 0 && Number(item.unitPrice) !== 0) {
            toast('🎁 تم تحديد المادة كهدية (سعر 0 د.ع)', 'info');
          }
        }
      }

      updated[index] = { ...updated[index], ...nextPartial };
      updateActiveCart({ items: updated });
    }
  }, [activeCart, updateActiveCart, toast]);

  // Remove item from cart
  const handleRemoveItem = useCallback((index) => {
    const updated = (activeCart.items || []).filter((_, i) => i !== index);
    updateActiveCart({ items: updated });
  }, [activeCart, updateActiveCart]);

  // Reorder items in cart (up/down)
  const handleMoveItem = useCallback((fromIndex, toIndex) => {
    const items = [...(activeCart.items || [])];
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
      return;
    }
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    updateActiveCart({ items });
  }, [activeCart, updateActiveCart]);

  // Add new empty cart
  const handleAddNewCart = () => {
    const newCart = createInitialCart(carts.length + 1);
    if (isOfferMode) {
      newCart.customerType = 'offer';
      newCart.name = 'عرض سعر جديد';
      newCart.offerName = '';
    }
    setCarts((prev) => [...prev, newCart]);
    setActiveCartId(newCart.id);
    toast(isOfferMode ? 'تم فتح عرض سعر جديد' : 'تم فتح سلة جديدة فارغة', 'success');
  };

  // Rename cart
  const handleRenameCart = (cartId, newName) => {
    setCarts((prev) =>
      prev.map((c) => (c.id === cartId ? { ...c, name: newName } : c))
    );
    toast('تم تحديث اسم السلة', 'success');
  };

  // Delete cart
  const handleDeleteCart = (cartId) => {
    if (carts.length <= 1) {
      // If only 1 cart, reset it to empty
      const fresh = createInitialCart(1);
      setCarts([fresh]);
      setActiveCartId(fresh.id);
      return;
    }
    const remaining = carts.filter((c) => c.id !== cartId);
    setCarts(remaining);
    if (activeCartId === cartId) {
      setActiveCartId(remaining[0].id);
    }
    toast('تم حذف السلة', 'info');
  };

  // Close active cart after checkout/payment and advance to next
  const closeActiveCartAfterPayment = () => {
    if (carts.length <= 1) {
      const fresh = createInitialCart(1);
      setCarts([fresh]);
      setActiveCartId(fresh.id);
    } else {
      const remaining = carts.filter((c) => c.id !== activeCartId);
      setCarts(remaining);
      setActiveCartId(remaining[0].id);
    }
  };

  // Load existing invoice into active cart
  const handleLoadInvoiceIntoCart = (invoice) => {
    const loadedItems = (invoice.items || []).map((it) => ({
      ...it,
      cartItemId: it.cartItemId || `loaded_${Date.now()}_${Math.random()}`,
      originalPrice: Number(it.originalPrice || it.unitPrice || 0),
      wholesalePrice: Number(it.wholesalePrice || 0),
    }));

    updateActiveCart({
      name: `فاتورة #${invoice.invoiceNumber || 'معدلة'}`,
      invoiceNumber: invoice.invoiceNumber || null,
      items: loadedItems,
      customerName: invoice.customerName || '',
      phone1: invoice.phone1 || invoice.customerPhone || '',
      discount: Number(invoice.discount) || 0,
      notes: invoice.notes || '',
      editingSaleId: invoice.id,
      isEditingDraft: Boolean(invoice.isDraft),
      customerType: invoice.customerType || 'retail',
      paymentMethod: invoice.paymentMethod || invoice.invoiceType || 'cash',
      invoiceType: invoice.invoiceType || invoice.paymentMethod || 'cash',
      invoiceDate: invoice.createdAt ? new Date(invoice.createdAt.toDate ? invoice.createdAt.toDate() : invoice.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    });

    toast(`تم تحميل الفاتورة #${invoice.invoiceNumber || ''} في السلة الفعّالة للتعديل`, 'success');
  };

  // Cancel invoice editing and reset cart
  const handleCancelEditInvoice = () => {
    if (window.confirm('هل تريد إلغاء تعديل هذه الفاتورة وإعادة السلة فارغة؟')) {
      const fresh = createInitialCart(carts.findIndex((c) => c.id === activeCartId) + 1);
      updateActiveCart({
        ...fresh,
        id: activeCartId,
      });
      toast('تم إلغاء تعديل الفاتورة وإعادة ضبط السلة', 'info');
    }
  };

  // Confirm Checkout / Save Invoice (حفظ الفاتورة / إتمام الحساب والدفع)
  const handleConfirmCheckout = async (paymentDetails) => {
    if ((activeCart.items || []).length === 0) {
      toast('السلة فارغة!', 'error');
      return;
    }

    // فحص أمان نهائي: لا يقبل أي مادة بسعر أقل من التكلفة (مسموح فقط 0 كهدية)
    const invalidItem = (activeCart.items || []).find((it) => {
      if (it.isService || it.isCustom) return false;
      const price = Number(it.unitPrice) || 0;
      const cost = Number(it.wholesalePrice || it.purchaseCost || 0);
      return price > 0 && cost > 0 && price < cost;
    });

    if (invalidItem) {
      toast(`⚠️ المادة "${invalidItem.name}" سعرها أقل من سعر التكلفة! غير مسموح بالبيع تحت التكلفة (مسموح فقط إعطاؤها كهدية بسعر 0).`, 'error');
      return;
    }

    try {
      setProcessingAction(true);
      const orderOptions = {
        discount: Number(activeCart.discount) || 0,
        taxRate: Number(activeCart.taxRate) || 0,
        customerName: paymentDetails.customerName || activeCart.customerName || 'زبون عام',
        phone1: paymentDetails.phone1 || activeCart.phone1 || '',
        invoiceType: paymentDetails.invoiceType || 'cash',
        paymentMethod: paymentDetails.paymentMethod || 'cash',
        customerType: activeCart.customerType || 'retail',
        notes: paymentDetails.notes || activeCart.notes || '',
        stockSource: activeCart.stockSource || 'store',
      };

      // إذا كنا في وضع تعديل فاتورة سابقة (مؤكدة أو مسودة)
      if (activeCart.editingSaleId) {
        let result;
        if (activeCart.isEditingDraft) {
          await updateDraftSale(activeCart.editingSaleId, activeCart.items, orderOptions);
          result = {
            id: activeCart.editingSaleId,
            invoiceNumber: activeCart.invoiceNumber || 'مسودة',
            total: Math.max(0, (activeCart.items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0) - (Number(activeCart.discount) || 0)),
          };
        } else {
          result = await editConfirmedSale(activeCart.editingSaleId, activeCart.items, orderOptions, cashierEmail);
        }

        const completedSale = {
          ...result,
          invoiceNumber: result.invoiceNumber || activeCart.invoiceNumber,
          items: activeCart.items,
          total: result.total,
          customerName: orderOptions.customerName,
          phone1: orderOptions.phone1,
          invoiceType: orderOptions.invoiceType,
          paymentMethod: orderOptions.paymentMethod,
          createdAt: new Date(),
        };

        setLastCompletedSale(completedSale);
        setShowCheckoutModal(false);
        closeActiveCartAfterPayment();
        toast(`✅ تم حفظ الفاتورة #${result.invoiceNumber || activeCart.invoiceNumber} بنجاح!`, 'success');
        return;
      }

      // البيع العادي الجديد
      const result = await checkoutSale(activeCart.items, cashierEmail, orderOptions);

      // Prepare receipt preview
      const completedSale = {
        ...result,
        invoiceNumber: result.invoiceNumber,
        items: activeCart.items,
        total: result.total,
        customerName: orderOptions.customerName,
        phone1: orderOptions.phone1,
        invoiceType: orderOptions.invoiceType,
        paymentMethod: orderOptions.paymentMethod,
        createdAt: new Date(),
      };

      // إذا اختار المستخدم حفظ الأسعار الجديدة للعملاء في المخزون
      if (paymentDetails.saveClientPrices && Array.isArray(paymentDetails.clientPriceUpdates) && paymentDetails.clientPriceUpdates.length > 0) {
        try {
          for (const upd of paymentDetails.clientPriceUpdates) {
            if (upd.productId && Number(upd.newClientPrice) >= 0) {
              await updateProduct(
                upd.productId, 
                { clientPrice: Number(upd.newClientPrice) }, 
                cashierEmail, 
                `تحديث سعر العميل من نقطة البيع للمادة: ${upd.name || ''}`
              );
            }
          }
        } catch (priceErr) {
          console.error('Failed to update client prices in inventory:', priceErr);
        }
      }

      // إذا اختار المستخدم حفظ الأسعار الجديدة للعملاء المميزين (VIP) في المخزون
      if (paymentDetails.saveVipPrices && Array.isArray(paymentDetails.vipPriceUpdates) && paymentDetails.vipPriceUpdates.length > 0) {
        try {
          for (const upd of paymentDetails.vipPriceUpdates) {
            if (upd.productId && Number(upd.newVipPrice) >= 0) {
              await updateProduct(
                upd.productId, 
                { vipPrice: Number(upd.newVipPrice) }, 
                cashierEmail, 
                `تحديث سعر العميل المميز (VIP) من نقطة البيع للمادة: ${upd.name || ''}`
              );
            }
          }
        } catch (vipPriceErr) {
          console.error('Failed to update VIP prices in inventory:', vipPriceErr);
        }
      }

      const savedPricesNote = paymentDetails.saveVipPrices 
        ? ' (تم حفظ أسعار العملاء المميزين في المخزون)' 
        : (paymentDetails.saveClientPrices ? ' (تم حفظ أسعار العملاء في المخزون)' : '');

      setLastCompletedSale(completedSale);
      setShowCheckoutModal(false);
      closeActiveCartAfterPayment();
      toast(`✅ تم إتمام الدفع بنجاح! رقم الفاتورة: #${result.invoiceNumber}${savedPricesNote}`, 'success');
    } catch (err) {
      toast(`فشل العملية: ${err.message}`, 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // Save Quotation / Offer (حفظ العرض أو طباعة العرض)
  const handleSaveOffer = async ({ printAfterSave = false } = {}) => {
    if ((activeCart.items || []).length === 0) {
      toast('السلة فارغة، أضف مواد لحفظ عرض السعر', 'error');
      return;
    }

    const offerTitle = (activeCart.offerName !== undefined ? activeCart.offerName : activeCart.name || '').trim();
    const finalOfferName = offerTitle && !offerTitle.startsWith('سلة')
      ? offerTitle 
      : (activeCart.customerName ? `عرض سعر - ${activeCart.customerName}` : 'عرض سعر جديد');

    try {
      setProcessingAction(true);
      const offerOptions = {
        offerName: finalOfferName,
        customerName: activeCart.customerName || 'زبون عام',
        discount: Number(activeCart.discount) || 0,
        notes: activeCart.notes || '',
        cashierEmail,
      };

      let result;
      if (activeCart.editingSaleId) {
        result = await updateOffer(activeCart.editingSaleId, activeCart.items, offerOptions);
      } else {
        result = await createOffer(activeCart.items, offerOptions);
      }

      const offerNumber = result?.offerNumber || (activeCart.editingSaleId ? activeCart.invoiceNumber : null);

      if (printAfterSave) {
        // Prepare receipt preview for offer
        const completedOffer = {
          ...result,
          id: result?.id || activeCart.editingSaleId,
          isOffer: true,
          offerNumber: offerNumber,
          invoiceNumber: offerNumber,
          offerName: finalOfferName,
          items: activeCart.items,
          total: result?.total !== undefined ? result.total : activeCart.items.reduce((s, it) => s + (Number(it.lineTotal) || (it.quantity * it.unitPrice)), 0) - (Number(activeCart.discount) || 0),
          customerName: offerOptions.customerName,
          phone1: activeCart.phone1 || '',
          customerPhone: activeCart.phone1 || '',
          notes: offerOptions.notes,
          discount: offerOptions.discount,
          cashierEmail,
          createdAt: new Date(),
        };

        setLastCompletedSale(completedOffer);
        closeActiveCartAfterPayment();
        toast(`✅ تم حفظ عرض السعر بنجاح برقم: #${offerNumber || ''}`, 'success');
      } else {
        closeActiveCartAfterPayment();
        toast(`✅ تم حفظ عرض السعر بنجاح برقم: #${offerNumber || ''}`, 'success');
        if (mode === 'offer') {
          onCloseOfferMode?.();
        }
      }
    } catch (err) {
      toast(`فشل حفظ عرض السعر: ${err.message}`, 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // معاينة وطباعة الفاتورة كـ "فاتورة غير مؤكدة" (مسودة) دون خصم من المخزون أو إتمام البيع
  const handlePrintDraftSale = () => {
    if ((activeCart.items || []).length === 0) {
      toast('السلة فارغة! أضف مواد أولاً لطباعة الفاتورة غير المؤكدة', 'warning');
      return;
    }

    const items = activeCart.items || [];
    const subtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
    const discount = Number(activeCart.discount) || 0;
    const grandTotal = Math.max(0, subtotal - discount);

    const draftSale = {
      id: activeCart.editingSaleId || `draft_${Date.now()}`,
      invoiceNumber: activeCart.invoiceNumber ? `${activeCart.invoiceNumber} (مسودة)` : 'مسودة',
      isDraft: true,
      items: items,
      subtotal: subtotal,
      discount: discount,
      total: grandTotal,
      customerName: activeCart.customerName || 'زبون عام',
      phone1: activeCart.phone1 || '',
      customerPhone: activeCart.phone1 || '',
      customerType: activeCart.customerType || 'retail',
      invoiceType: 'cash',
      cashierEmail: cashierEmail || '',
      notes: activeCart.notes || '',
      createdAt: activeCart.invoiceDate ? new Date(activeCart.invoiceDate) : new Date(),
    };

    setLastCompletedSale(draftSale);
    toast('تم فتح الفاتورة غير المؤكدة للمعاينة والطباعة 📄', 'info');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-68px)] w-full bg-slate-50 overflow-hidden text-slate-800" dir="rtl">
      {/* 1. الشريط العلوي (Top Toolbar) */}
      <PosTopToolbar
        activeCart={activeCart}
        onUpdateActiveCart={updateActiveCart}
        onChangeCustomerType={handleChangeCustomerType}
        openCartsCount={carts.length}
        onOpenCartsModal={() => setShowCartsModal(true)}
        onOpenEditInvoiceModal={() => setShowEditInvoiceModal(true)}
        onOpenAddProductModal={() => setShowAddProductModal(true)}
        onOpenLaborModal={() => setShowLaborModal(true)}
        onOpenProductsDrawer={() => setShowProductsDrawer(true)}
        onBarcodeScan={handleBarcodeScan}
        products={products}
        onAddProduct={(prod) => handleAddProductToCart(prod, 1)}
        customers={customers}
        onSelectCustomer={handleSelectCustomer}
        onSetNewCustomer={handleSetNewCustomer}
        onClearCustomer={handleClearCustomer}
        isOfferMode={isOfferMode}
        onCloseOfferMode={handleExitOfferMode}
        onCancelEditInvoice={handleCancelEditInvoice}
      />

      {/* 2. جدول السلة الرئيسي (Cart Table) */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <PosCartTable
          items={activeCart.items || []}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
          onMoveItem={handleMoveItem}
          onOpenProductsDrawer={() => setShowProductsDrawer(true)}
        />
      </main>

      {/* 3. الشريط السفلي (Bottom Summary & Action) */}
      <PosBottomBar
        activeCart={activeCart}
        onUpdateDiscount={(newDiscount) => updateActiveCart({ discount: newDiscount })}
        onCheckout={() => setShowCheckoutModal(true)}
        onSaveOffer={() => handleSaveOffer({ printAfterSave: false })}
        onPrintOffer={() => handleSaveOffer({ printAfterSave: true })}
        onPrintDraft={handlePrintDraftSale}
        processing={processingAction}
        isOfferMode={isOfferMode}
      />

      {/* النوافذ المنبثقة واللوحات الجانبية */}

      {/* إدارة السلات المعلقة */}
      <PosCartsModal
        isOpen={showCartsModal}
        onClose={() => setShowCartsModal(false)}
        carts={carts}
        activeCartId={activeCartId}
        onSelectCart={(id) => setActiveCartId(id)}
        onAddNewCart={handleAddNewCart}
        onRenameCart={handleRenameCart}
        onDeleteCart={handleDeleteCart}
      />

      {/* تعديل فاتورة سابقة */}
      <PosEditInvoiceModal
        isOpen={showEditInvoiceModal}
        onClose={() => setShowEditInvoiceModal(false)}
        onLoadInvoiceIntoCart={handleLoadInvoiceIntoCart}
      />

      {/* إضافة شراء موقعي أو منتج مخصص */}
      <PosAddProductModal
        isOpen={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        onAddItemToCart={(item) => updateActiveCart({ items: [...(activeCart.items || []), item] })}
      />

      {/* نافذة أجور العمل والخدمات */}
      <PosLaborModal
        isOpen={showLaborModal}
        onClose={() => setShowLaborModal(false)}
        activeCartItems={activeCart.items || []}
        onAddLaborItem={handleAddLaborItemToCart}
      />

      {/* لوحة المنتجات الجانبية (Drawer) */}
      <PosProductsDrawer
        isOpen={showProductsDrawer}
        onClose={() => setShowProductsDrawer(false)}
        products={products}
        customerType={activeCart.customerType}
        onAddProduct={(prod) => handleAddProductToCart(prod, 1)}
      />

      {/* نافذة "حاسب" وإتمام الدفع */}
      <PosCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        activeCart={activeCart}
        customers={customers}
        onConfirmCheckout={handleConfirmCheckout}
        processing={processingAction}
      />

      {/* نافذة طباعة الوصل / عرض السعر النهائي */}
      {lastCompletedSale && (
        <InvoiceReceipt
          sale={lastCompletedSale}
          onClose={() => {
            const wasOffer = Boolean(lastCompletedSale.isOffer);
            setLastCompletedSale(null);
            if (wasOffer && mode === 'offer') {
              onCloseOfferMode?.();
            }
          }}
          inlinePrintMode={false}
        />
      )}
    </div>
  );
}
