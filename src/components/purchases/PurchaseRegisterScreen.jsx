import React, { useState, useEffect, useRef, useMemo } from 'react';
import PurchaseShippingModal from './PurchaseShippingModal';
import PurchaseCheckoutModal from './PurchaseCheckoutModal';
import PurchaseProductsDrawer from './PurchaseProductsDrawer';
import NewProductQuickModal from './NewProductQuickModal';
import { compressImageToSafeDataUrl } from '../../services/storageService';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

/** Check if attachment is a PDF */
function isPdfAttachment(url, fileType) {
  if (fileType === 'pdf') return true;
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');
}

export default function PurchaseRegisterScreen({
  user,
  products = [],
  knownSuppliers = [],
  draftPurchases = [],
  editingInvoice = null,
  currentDraftId = null,
  onBack,
  onSaveInvoice,
  onSaveDraft,
  onOpenDraftsModal,
  onViewAttachment,
  savingInvoice = false,
  savingDraft = false,
}) {
  // Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Cart Items
  const [cartItems, setCartItems] = useState([]);

  // Shipping
  const [shippingCost, setShippingCost] = useState(0);
  const [distributeShippingToCost, setDistributeShippingToCost] = useState(true);
  const [remainderTargetIndex, setRemainderTargetIndex] = useState(0);
  const [manualShippingMap, setManualShippingMap] = useState({});

  // Attachments
  const [invoiceImageUrl, setInvoiceImageUrl] = useState(null);
  const [invoiceFileType, setInvoiceFileType] = useState(null); // 'image' | 'pdf'
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [compressingFile, setCompressingFile] = useState(false);

  // Modals visibility
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showProductsDrawer, setShowProductsDrawer] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);

  // Search input & ref
  const [searchBarcodeOrName, setSearchBarcodeOrName] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Populate if editing or drafting
  useEffect(() => {
    if (editingInvoice) {
      setSupplierName(editingInvoice.supplierName || '');
      setSupplierPhone(editingInvoice.supplierPhone || '');
      setInvoiceNumber(editingInvoice.invoiceNumber || '');
      setPurchaseDate(
        (editingInvoice.date || editingInvoice.createdAt || '').slice(0, 10) ||
          new Date().toISOString().slice(0, 10)
      );
      setNotes(editingInvoice.notes || '');
      setShippingCost(Number(editingInvoice.shippingCost) || 0);
      setDistributeShippingToCost(editingInvoice.distributeShippingToCost !== false);
      setInvoiceImageUrl(editingInvoice.invoiceImageUrl || null);
      setInvoiceFileType(editingInvoice.invoiceFileType || null);
      setInvoiceFileName(editingInvoice.invoiceFileName || '');

      const loadedItems = (editingInvoice.items || []).map((i) => ({
        productId: i.productId || '',
        name: i.name || '',
        sku: i.sku || '',
        barcode: i.barcode || '',
        cameraType: i.cameraType || '',
        quantity: Number(i.quantity) || 1,
        costPrice: Number(i.baseCostPrice || i.costPrice) || 0,
        oldCostPrice: Number(i.oldCostPrice || i.baseCostPrice || i.costPrice) || 0,
        retailPrice: Number(i.retailPrice) || 0,
        location: i.location || 'store',
        unitShippingCost: Number(i.unitShippingCost) || 0,
        effectiveCostPrice: Number(i.effectiveCostPrice) || 0,
        isNewProduct: Boolean(i.isNewProduct),
      }));
      setCartItems(loadedItems);

      const map = {};
      (editingInvoice.items || []).forEach((it, idx) => {
        if (it.unitShippingCost !== undefined && it.unitShippingCost !== null) {
          map[idx] = it.unitShippingCost;
        }
      });
      setManualShippingMap(map);
    }
  }, [editingInvoice]);

  // Track newly added products compared to original invoice before editing
  const newlyAddedItems = useMemo(() => {
    if (!editingInvoice || !editingInvoice.items) return [];
    const oldItems = editingInvoice.items || [];
    return cartItems.filter(
      (ci) =>
        !oldItems.some(
          (oi) =>
            (ci.productId && oi.productId && ci.productId === oi.productId) ||
            (ci.name && oi.name && ci.name.trim().toLowerCase() === oi.name.trim().toLowerCase())
        )
    );
  }, [editingInvoice, cartItems]);

  // Track items where quantity increased
  const quantityIncreasedItems = useMemo(() => {
    if (!editingInvoice || !editingInvoice.items) return [];
    const oldItems = editingInvoice.items || [];
    return cartItems
      .map((ci) => {
        const match = oldItems.find(
          (oi) =>
            (ci.productId && oi.productId && ci.productId === oi.productId) ||
            (ci.name && oi.name && ci.name.trim().toLowerCase() === oi.name.trim().toLowerCase())
        );
        if (match && Number(ci.quantity) > Number(match.quantity)) {
          return {
            name: ci.name,
            diff: Number(ci.quantity) - Number(match.quantity),
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [editingInvoice, cartItems]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Global Keyboard Shortcuts (F2, F3, F4)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (cartItems.length > 0 && supplierName.trim()) {
          setShowCheckoutModal(true);
        }
      } else if (e.key === 'F3') {
        e.preventDefault();
        triggerSaveDraft();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setShowNewProductModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems, supplierName, shippingCost, distributeShippingToCost, manualShippingMap, notes, purchaseDate, invoiceNumber]);

  // Filtered Suppliers for dropdown
  const filteredSuppliers = useMemo(() => {
    if (!supplierName.trim()) return knownSuppliers;
    const term = supplierName.toLowerCase().trim();
    return knownSuppliers.filter(
      (s) => s.name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term))
    );
  }, [knownSuppliers, supplierName]);

  // Filtered Products for inline search
  const filteredSearchProducts = useMemo(() => {
    if (!searchBarcodeOrName.trim()) return [];
    const q = searchBarcodeOrName.toLowerCase().trim();
    return products
      .filter((p) => {
        const nameMatch = p.name?.toLowerCase().includes(q);
        const skuMatch = p.sku?.toLowerCase().includes(q);
        const barcodeMatch = p.barcode?.toLowerCase().includes(q);
        return nameMatch || skuMatch || barcodeMatch;
      })
      .slice(0, 10);
  }, [products, searchBarcodeOrName]);

  // Add existing product to cart
  const handleAddProduct = (prod) => {
    const existingIndex = cartItems.findIndex((it) => it.productId === prod.id);
    if (existingIndex >= 0) {
      // Increment quantity
      setCartItems((prev) => {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Number(updated[existingIndex].quantity || 1) + 1,
        };
        return updated;
      });
    } else {
      const currentCost = Number(prod.wholesalePrice || prod.costPrice) || 0;
      const currentRetail = Number(prod.retailPrice) || 0;

      setCartItems((prev) => [
        ...prev,
        {
          productId: prod.id,
          name: prod.name,
          sku: prod.sku || '',
          barcode: prod.barcode || '',
          cameraType: prod.cameraType || '',
          quantity: 1,
          oldCostPrice: currentCost,
          costPrice: currentCost,
          retailPrice: currentRetail,
          location: 'store',
          unitShippingCost: 0,
          effectiveCostPrice: currentCost,
          isNewProduct: false,
        },
      ]);
    }
    setSearchBarcodeOrName('');
    setShowSearchDropdown(false);
    searchInputRef.current?.focus();
  };

  // Add brand new product to cart
  const handleAddNewProductItem = (newProd) => {
    const cleanName = (newProd.name || '').trim().toLowerCase();
    const cleanBarcode = (newProd.barcode || '').trim().toLowerCase();
    const cleanSku = (newProd.sku || '').trim().toLowerCase();

    // Check if a product already exists with matching barcode, SKU or exact name
    const existing = products.find(
      (p) =>
        (cleanBarcode && p.barcode && p.barcode.trim().toLowerCase() === cleanBarcode) ||
        (cleanSku && p.sku && p.sku.trim().toLowerCase() === cleanSku) ||
        (cleanName && p.name && p.name.trim().toLowerCase() === cleanName)
    );

    if (existing) {
      const currentCost = Number(existing.wholesalePrice || existing.costPrice) || 0;
      const currentRetail = Number(existing.retailPrice) || 0;
      const enteredCost = Number(newProd.costPrice) > 0 ? Number(newProd.costPrice) : currentCost;
      const enteredRetail = Number(newProd.retailPrice) > 0 ? Number(newProd.retailPrice) : currentRetail;

      const existingInCartIndex = cartItems.findIndex((it) => it.productId === existing.id);
      if (existingInCartIndex >= 0) {
        setCartItems((prev) => {
          const updated = [...prev];
          updated[existingInCartIndex] = {
            ...updated[existingInCartIndex],
            quantity: Number(updated[existingInCartIndex].quantity || 0) + Number(newProd.quantity || 1),
            costPrice: enteredCost,
            effectiveCostPrice: distributeShippingToCost ? (enteredCost + (Number(updated[existingInCartIndex].unitShippingCost) || 0)) : enteredCost,
            retailPrice: enteredRetail,
          };
          return updated;
        });
      } else {
        setCartItems((prev) => [
          ...prev,
          {
            ...newProd,
            productId: existing.id,
            isNewProduct: false,
            oldCostPrice: currentCost,
            costPrice: enteredCost,
            retailPrice: enteredRetail,
            effectiveCostPrice: enteredCost,
          },
        ]);
      }
      searchInputRef.current?.focus();
      return;
    }

    setCartItems((prev) => [...prev, newProd]);
    searchInputRef.current?.focus();
  };

  // Handle Barcode enter
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchBarcodeOrName.trim().toLowerCase();
      if (!query) return;

      // Exact barcode match first
      const exactMatch = products.find(
        (p) => (p.barcode && p.barcode.toLowerCase() === query) || (p.sku && p.sku.toLowerCase() === query)
      );

      if (exactMatch) {
        handleAddProduct(exactMatch);
        return;
      }

      // If only one filtered item, add it
      if (filteredSearchProducts.length === 1) {
        handleAddProduct(filteredSearchProducts[0]);
        return;
      }

      // Otherwise if multiple, keep dropdown open
      setShowSearchDropdown(true);
    }
  };

  // Cart item modifications
  const updateItem = (index, field, value) => {
    setCartItems((prev) => {
      const updated = [...prev];
      const cur = updated[index];
      const next = { ...cur, [field]: value };

      // Keep effectiveCostPrice aligned with purchase costPrice + unit shipping
      if (field === 'costPrice') {
        const c = Number(value) || 0;
        const s = Number(cur.unitShippingCost) || 0;
        next.effectiveCostPrice = distributeShippingToCost ? (c + s) : c;
      } else if (field === 'unitShippingCost') {
        const c = Number(cur.costPrice) || 0;
        const s = Number(value) || 0;
        next.effectiveCostPrice = distributeShippingToCost ? (c + s) : c;
      }

      updated[index] = next;
      return updated;
    });
  };

  const removeItem = (index) => {
    setCartItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Cart Totals Calculations
  const itemsTotal = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 1) * (Number(item.costPrice) || 0),
      0
    );
  }, [cartItems]);

  const totalPieces = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }, [cartItems]);

  const numShipping = Math.max(0, Number(shippingCost) || 0);
  const grandTotal = itemsTotal + numShipping;

  // File upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      if (file.size > 700 * 1024) {
        alert('⚠️ حجم ملف الـ PDF كبير جداً (أكثر من 700 كيلوبايت) ويتجاوز حد التخزين المسموح به في قاعدة البيانات (1 ميجابايت).\n\nيرجى تصوير الفاتورة بالكاميرا كصورة، أو استخدام ملف PDF أصغر حجماً.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setInvoiceImageUrl(reader.result);
        setInvoiceFileType('pdf');
        setInvoiceFileName(file.name);
      };
    } else {
      try {
        setCompressingFile(true);
        const compressed = await compressImageToSafeDataUrl(file);
        setInvoiceImageUrl(compressed);
        setInvoiceFileType('image');
        setInvoiceFileName(file.name);
      } catch (err) {
        console.error(err);
        alert('فشل ضغط الصورة: ' + (err?.message || 'حدث خطأ أثناء معالجة الصورة'));
      } finally {
        setCompressingFile(false);
      }
    }
  };

  // Shipping Modal Apply
  const handleApplyShipping = (data) => {
    setShippingCost(data.shippingCost);
    setDistributeShippingToCost(data.distributeShippingToCost);
    setRemainderTargetIndex(data.remainderTargetIndex);
    setManualShippingMap(data.manualShippingMap);

    // Apply allocated unit shipping to items
    if (data.allocations && data.allocations.length === cartItems.length) {
      setCartItems((prev) =>
        prev.map((it, idx) => ({
          ...it,
          unitShippingCost: data.allocations[idx].unitShip,
          effectiveCostPrice: data.allocations[idx].effectiveCost,
        }))
      );
    }
  };

  // Helper to ensure attachment is safe before submitting
  const getSafeInvoiceAttachment = async () => {
    let safeUrl = invoiceImageUrl;
    if (safeUrl && typeof safeUrl === 'string') {
      if (safeUrl.startsWith('data:image/') && safeUrl.length > 650000) {
        safeUrl = await compressImageToSafeDataUrl(safeUrl);
      } else if (safeUrl.startsWith('data:application/pdf') && safeUrl.length > 1000000) {
        alert('⚠️ ملف الـ PDF المرفق بالفاتورة كبير جداً ويتجاوز سعة التخزين (1 ميجابايت). يرجى حذفه أو استبداله بصورة مصورة للفاتورة.');
        return null;
      }
    }
    return safeUrl;
  };

  // Save Draft
  const triggerSaveDraft = async () => {
    const safeUrl = await getSafeInvoiceAttachment();
    if (invoiceImageUrl && safeUrl === null) return;

    onSaveDraft({
      supplierName: supplierName.trim(),
      supplierPhone: supplierPhone.trim(),
      invoiceNumber: invoiceNumber.trim(),
      items: cartItems,
      shippingCost: numShipping,
      distributeShippingToCost,
      remainderTargetIndex,
      manualShippingMap,
      totalAmount: grandTotal,
      notes: notes.trim(),
      date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
      invoiceImageUrl: safeUrl,
      invoiceFileType,
      invoiceFileName,
    });
  };

  // Complete and Confirm Purchase
  const handleCheckoutConfirm = async (checkoutData) => {
    const safeUrl = await getSafeInvoiceAttachment();
    if (invoiceImageUrl && safeUrl === null) return;

    setShowCheckoutModal(false);
    onSaveInvoice({
      supplierName: supplierName.trim(),
      supplierPhone: supplierPhone.trim(),
      invoiceNumber: invoiceNumber.trim(),
      items: cartItems,
      shippingCost: numShipping,
      distributeShippingToCost,
      remainderTargetIndex,
      manualShippingMap,
      totalAmount: grandTotal,
      notes: notes.trim() ? `${notes.trim()}${checkoutData.notes ? ` - ${checkoutData.notes}` : ''}` : checkoutData.notes,
      date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
      invoiceImageUrl: safeUrl,
      invoiceFileType,
      invoiceFileName,
      ...checkoutData,
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-100 animate-fade-in -m-2 md:-m-6 select-none" dir="rtl">
      {/* ---------------------------------------------------- */}
      {/* 1. TOP TOOLBAR (شريط الأدوات العلوي) */}
      {/* ---------------------------------------------------- */}
      {/* ---------------------------------------------------- */}
      {/* 1. TOP TOOLBAR (شريط الأدوات العلوي - صفّان واسعان ومنظمان) */}
      {/* ---------------------------------------------------- */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 shadow-2xs z-20 shrink-0 space-y-2.5">
        {/* الصف الأول: بيانات الفاتورة والمورد الأساسية */}
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
          {/* Back button & Title */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
              title="رجوع لكروت الموردين"
            >
              <span>←</span>
              <span>رجوع</span>
            </button>

            <div>
              <h1 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
                {editingInvoice ? 'تعديل فاتورة شراء' : 'تسجيل فاتورة شراء وتوريد'}
              </h1>
              <span className="text-[10px] text-slate-400">
                {currentDraftId ? 'مسودة قيد التعديل' : 'توريد مباشر للمخزن'}
              </span>
            </div>
          </div>

          {/* Supplier Selector (بارز وكبير جداً ومضمون العرض) */}
          <div className="relative flex-1 min-w-[280px] sm:min-w-[340px] max-w-xl">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  required
                  value={supplierName}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  placeholder="اختر أو اكتب اسم المورد *..."
                  className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white placeholder:text-slate-400"
                />
                <span className="absolute right-2.5 top-2 text-slate-500 text-xs font-bold">🏢</span>
              </div>

              {/* Phone input */}
              <input
                type="text"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="الهاتف"
                className="w-28 p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                dir="ltr"
              />
            </div>

            {/* Supplier dropdown */}
            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto z-40 divide-y divide-slate-100">
                {filteredSuppliers.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSupplierName(s.name);
                      if (s.phone) setSupplierPhone(s.phone);
                      setShowSupplierDropdown(false);
                    }}
                    className="p-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span>🏢</span>
                      <span className="text-xs font-bold text-slate-800">{s.name}</span>
                      {s.phone && (
                        <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                          ({s.phone})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                      اختيار
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoice Number, Date & Quick Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="رقم الفاتورة #"
              className="w-24 sm:w-28 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
              title="رقم فاتورة المورد"
            />
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
            />

            {/* Shipping Modal Button */}
            <button
              type="button"
              onClick={() => setShowShippingModal(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 active:scale-95 ${
                numShipping > 0
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="إضافة وتوزيع مصاريف النقل والشحن على المواد"
            >
              <span>🚚</span>
              <span>{numShipping > 0 ? `شحن: ${formatIQD(numShipping)}` : 'شحن'}</span>
            </button>

            {/* Attachments Upload Button */}
            <div className="relative">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressingFile}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 active:scale-95 ${
                  compressingFile
                    ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                    : invoiceImageUrl
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="إرفاق صورة أو ملف PDF للفاتورة"
              >
                <span>{compressingFile ? '⏳' : '📎'}</span>
                <span>{compressingFile ? 'جاري الضغط...' : invoiceImageUrl ? 'مرفق ✓' : 'مرفق'}</span>
              </button>
            </div>

            {/* Open Drafts */}
            {onOpenDraftsModal && (
              <button
                type="button"
                onClick={onOpenDraftsModal}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="عرض مسودات فواتير الشراء المعلقة"
              >
                <span>📋</span>
                <span>المسودات</span>
                {draftPurchases.length > 0 && (
                  <span className="bg-slate-100 text-slate-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-slate-200">
                    {draftPurchases.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* الصف الثاني: شريط البحث السريع بالباركود وإضافة المواد (Product Search & Action Bar) */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
          {/* Barcode / Search Box */}
          <div className="relative flex-1 max-w-2xl">
            <input
              ref={searchInputRef}
              type="text"
              value={searchBarcodeOrName}
              onChange={(e) => {
                setSearchBarcodeOrName(e.target.value);
                setShowSearchDropdown(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="بحث باسم المادة أو الباركود (Enter للإضافة المباشرة إلى السلة)..."
              className="w-full pr-8 pl-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
            <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
            {searchBarcodeOrName && (
              <button
                type="button"
                onClick={() => setSearchBarcodeOrName('')}
                className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}

            {/* Inline Search Dropdown */}
            {showSearchDropdown && filteredSearchProducts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-56 overflow-y-auto z-40 divide-y divide-slate-100">
                {filteredSearchProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleAddProduct(p)}
                    className="p-2 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="min-w-0 pr-1">
                      <span className="text-xs font-bold text-slate-800 block truncate">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatIQD(p.wholesalePrice || p.costPrice)} د.ع
                      </span>
                    </div>
                    <span className="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded font-bold shrink-0">
                      + إضافة
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buttons: Browse Catalog and Add New Item */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowProductsDrawer(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
              title="تصفح جميع مواد المخزن لاختيار المنتجات"
            >
              <span>📦</span>
              <span>تصفح قائمة المواد</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewProductModal(true)}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="إضافة صنف جديد كلياً غير مسجل مسبقاً (F4)"
            >
              <span>➕</span>
              <span>صنف جديد (F4)</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. CENTER CART TABLE (جدول السلة بالوسط) */}
      {/* ---------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4">
        {cartItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
            <span className="text-5xl mb-3">🛒</span>
            <h3 className="text-base font-bold text-slate-700 mb-1">
              سلة المشتريات فارغة
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              يمكنك استخدام شريط البحث بالباركود أعلاه أو زر "تصفح المواد" أو اختصار (F4) لإضافة مادة جديدة.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowProductsDrawer(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                📦 تصفح قائمة المنتجات
              </button>
              <button
                type="button"
                onClick={() => setShowNewProductModal(true)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                ➕ إضافة صنف جديد (F4)
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3">المادة / الصنف</th>
                    <th className="p-3">مكان التخزين</th>
                    <th className="p-3 w-32">سعر الشراء (د.ع)</th>
                    <th className="p-3 w-36 text-center">الكمية</th>
                    {numShipping > 0 && <th className="p-3 w-28 text-center">حصة الشحن</th>}
                    {numShipping > 0 && <th className="p-3 w-28 text-center">التكلفة الفعلية</th>}
                    <th className="p-3 w-32 text-left">الإجمالي</th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cartItems.map((item, idx) => {
                    const qty = Number(item.quantity) || 1;
                    const cost = Number(item.costPrice) || 0;
                    const lineTotal = qty * cost;
                    const unitShip = Number(item.unitShippingCost) || 0;
                    const effective = Number(item.effectiveCostPrice) || (cost + unitShip);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        {/* Index */}
                        <td className="p-3 text-center text-slate-400 font-mono font-bold">
                          {idx + 1}
                        </td>

                        {/* Name and details */}
                        <td className="p-3">
                          <span className="font-extrabold text-slate-900 block text-xs md:text-sm">
                            {item.name}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            {item.cameraType && <span>{item.cameraType}</span>}
                            {item.barcode && <span className="font-mono">#{item.barcode}</span>}
                            {item.isNewProduct && (
                              <span className="bg-amber-100 text-amber-800 px-1 rounded font-bold">
                                صنف جديد
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Storage location */}
                        <td className="p-3">
                          <select
                            value={item.location || 'store'}
                            onChange={(e) => updateItem(idx, 'location', e.target.value)}
                            className="p-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700"
                          >
                            <option value="store">المحل (المعرض)</option>
                            <option value="warehouse">المخزن الرئيسي</option>
                          </select>
                        </td>

                        {/* Cost Price (Inline Editable) */}
                        <td className="p-3">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={item.costPrice}
                              onChange={(e) => updateItem(idx, 'costPrice', e.target.value)}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-black font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                            />
                            <span className="absolute left-2 top-1.5 text-[10px] text-slate-400">
                              د.ع
                            </span>
                          </div>
                          {Number(item.oldCostPrice) > 0 && Number(item.oldCostPrice) !== Number(item.costPrice) && (
                            <div className="text-[10px] text-indigo-600 font-bold mt-0.5 truncate" title={`سعر الجملة السابق: ${formatIQD(item.oldCostPrice)} د.ع`}>
                              السابق: {formatIQD(item.oldCostPrice)}
                            </div>
                          )}
                        </td>

                        {/* Quantity (+ / - / direct input) */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItem(idx, 'quantity', Math.max(1, Number(item.quantity || 1) - 1))
                              }
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                            >
                              −
                            </button>

                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(idx, 'quantity', Math.max(1, Number(e.target.value) || 1))
                              }
                              className="w-14 p-1 bg-white border border-slate-300 rounded-lg text-xs font-black font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                updateItem(idx, 'quantity', Number(item.quantity || 1) + 1)
                              }
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Unit Shipping share */}
                        {numShipping > 0 && (
                          <td className="p-3 text-center font-bold font-mono text-blue-700">
                            +{formatIQD(unitShip)} د.ع
                          </td>
                        )}

                        {/* Landed effective cost */}
                        {numShipping > 0 && (
                          <td className="p-3 text-center font-black font-mono text-indigo-900">
                            {formatIQD(effective)} د.ع
                          </td>
                        )}

                        {/* Line total */}
                        <td className="p-3 text-left font-black font-mono text-slate-900 text-xs md:text-sm">
                          {formatIQD(lineTotal)} د.ع
                        </td>

                        {/* Remove item */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="w-7 h-7 rounded-lg text-red-500 hover:bg-red-50 font-bold flex items-center justify-center cursor-pointer transition-colors"
                            title="حذف هذا الصنف من الفاتورة"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Notes row inside cart */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 shrink-0">ملاحظة الفاتورة:</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أدخل أي ملاحظات خاصة بهذه الفاتورة..."
                className="flex-1 p-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </main>

      {/* ---------------------------------------------------- */}
      {/* 3. BOTTOM SUMMARY & ACTION BAR (الشريط السفلي) */}
      {/* ---------------------------------------------------- */}
      <footer className="bg-white border-t border-slate-200 p-3 sm:p-4 shadow-lg shrink-0 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Stats Badges */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold">المواد:</span>
              <span className="font-black font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                {cartItems.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold">مجموع القطع:</span>
              <span className="font-black font-mono bg-slate-100 px-2 py-0.5 rounded-md text-indigo-700">
                {totalPieces} قطعة
              </span>
            </div>

            {numShipping > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-blue-700">
                <span className="font-bold">الشحن:</span>
                <span className="font-black font-mono bg-blue-50 px-2 py-0.5 rounded-md">
                  +{formatIQD(numShipping)} د.ع
                </span>
              </div>
            )}

            {invoiceImageUrl && (
              <div
                onClick={() =>
                  onViewAttachment?.({
                    url: invoiceImageUrl,
                    type: invoiceFileType,
                    title: invoiceFileName || 'مرفق الفاتورة',
                  })
                }
                className="flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 cursor-pointer hover:bg-emerald-100"
              >
                <span>📎</span>
                <span className="truncate max-w-[120px]">{invoiceFileName || 'مرفق مرفوع'}</span>
              </div>
            )}
          </div>

          {/* Grand Total & Action Buttons */}
          <div className="flex items-center gap-3 justify-between sm:justify-end">
            <div className="text-left sm:text-right">
              <span className="text-[10px] text-slate-500 font-bold block">الإجمالي الكلي:</span>
              <span className="text-lg sm:text-2xl font-black font-mono text-indigo-950">
                {formatIQD(grandTotal)} <span className="text-xs font-normal">د.ع</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Save Draft F3 */}
              <button
                type="button"
                onClick={triggerSaveDraft}
                disabled={savingDraft || (cartItems.length === 0 && !supplierName.trim())}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                title="حفظ الفاتورة كمسودة للمتابعة لاحقاً دون توريد المخزون (F3)"
              >
                <span>💾</span>
                <span>{savingDraft ? 'جاري الحفظ...' : 'مسودة (F3)'}</span>
              </button>

              {/* Complete & Checkout F2 */}
              <button
                type="button"
                onClick={() => {
                  if (!supplierName.trim()) {
                    alert('يرجى تحديد أو كتابة اسم المورد أولاً');
                    return;
                  }
                  if (cartItems.length === 0) {
                    alert('يرجى إضافة مادة واحدة على الأقل في الفاتورة');
                    return;
                  }
                  setShowCheckoutModal(true);
                }}
                disabled={savingInvoice || cartItems.length === 0}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
                title={editingInvoice ? "تأكيد وحفظ تعديلات الفاتورة وتحديث المخزون (F2)" : "إتمام الفاتورة وتوريد المواد وتسوية الحساب (F2)"}
              >
                <span>{editingInvoice ? '💾' : '📦'}</span>
                <span>
                  {savingInvoice 
                    ? (editingInvoice ? 'جاري تأكيد التعديل...' : 'جاري التوريد...') 
                    : (editingInvoice ? 'تأكيد التعديل (F2) ✓' : 'إتمام وتوريد (F2) ✓')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ---------------------------------------------------- */}
      {/* 4. MODALS & DRAWERS */}
      {/* ---------------------------------------------------- */}

      {/* Shipping Modal */}
      <PurchaseShippingModal
        isOpen={showShippingModal}
        onClose={() => setShowShippingModal(false)}
        items={cartItems}
        currentShippingCost={shippingCost}
        currentDistribute={distributeShippingToCost}
        currentRemainderTargetIndex={remainderTargetIndex}
        currentManualMap={manualShippingMap}
        onApplyShipping={handleApplyShipping}
      />

      {/* Checkout Modal */}
      <PurchaseCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        totalAmount={grandTotal}
        itemsCount={cartItems.length}
        totalPieces={totalPieces}
        shippingCost={numShipping}
        supplierName={supplierName}
        invoiceNumber={invoiceNumber}
        user={user}
        initialPaymentStatus={editingInvoice?.paymentStatus || 'paid'}
        initialPaidAmount={editingInvoice?.paidAmount || ''}
        initialOutOfPocket={editingInvoice?.paidOutOfPocket || false}
        initialOutOfPocketAmount={editingInvoice?.outOfPocketAmount || ''}
        initialOutOfPocketEmployee={editingInvoice?.outOfPocketEmployeeName || ''}
        initialNotes={editingInvoice?.notes || ''}
        onConfirmCheckout={handleCheckoutConfirm}
        submitting={savingInvoice}
        isEditing={Boolean(editingInvoice)}
        newlyAddedItems={newlyAddedItems}
        quantityIncreasedItems={quantityIncreasedItems}
      />

      {/* Product Catalog Drawer */}
      <PurchaseProductsDrawer
        isOpen={showProductsDrawer}
        onClose={() => setShowProductsDrawer(false)}
        products={products}
        onSelectProduct={handleAddProduct}
        onOpenNewProductModal={() => setShowNewProductModal(true)}
      />

      {/* New Product Quick Modal */}
      <NewProductQuickModal
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        onAddProduct={handleAddNewProductItem}
      />
    </div>
  );
}
