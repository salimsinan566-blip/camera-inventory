import React, { useState, useMemo, useRef } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  recordSupplierDebtPayment,
  deletePurchaseInvoice,
  deleteSupplierDebtRecord,
  deleteSavedSupplier,
  saveDraftPurchase,
  deleteDraftPurchase
} from '../services/purchasesService';
import { useUI } from '../contexts/UIContext';
import { CATEGORIES } from '../models/product';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

/** Check if attachment is a PDF */
function isPdfAttachment(url, fileType) {
  if (fileType === 'pdf') return true;
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');
}

/** Convert base64 PDF Data URL to a Blob Object URL for clean iframe/window viewing */
function getPdfBlobUrl(base64OrUrl) {
  if (!base64OrUrl) return '';
  if (base64OrUrl.startsWith('data:application/pdf')) {
    try {
      const base64Data = base64OrUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('Error converting PDF base64 to Blob URL:', e);
      return base64OrUrl;
    }
  }
  return base64OrUrl;
}

/** Compress image to efficient base64 */
function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export default function PurchasesScreen({ products = [], user }) {
  const { purchases, draftPurchases = [], supplierDebts, debtPayments, suppliers = [], stats, loading } = usePurchases();
  const { toast, confirm } = useUI();

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'drafts' | 'debts' | 'archive'

  // Form State: Purchase Invoice / Draft
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid'); // 'paid' | 'debt' | 'partial'
  const [paidAmount, setPaidAmount] = useState('');
  const [paidOutOfPocket, setPaidOutOfPocket] = useState(false);
  const [outOfPocketAmount, setOutOfPocketAmount] = useState('');
  const [outOfPocketEmployeeName, setOutOfPocketEmployeeName] = useState(user?.displayName || user?.email?.split('@')[0] || '');
  const [shippingCost, setShippingCost] = useState('');
  const [distributeShippingToCost, setDistributeShippingToCost] = useState(true);
  const [remainderTargetIndex, setRemainderTargetIndex] = useState(0);
  const [manualShippingMap, setManualShippingMap] = useState({});
  const [invoiceImageUrl, setInvoiceImageUrl] = useState(null);
  const [invoiceFileType, setInvoiceFileType] = useState(null); // 'image' | 'pdf'
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [invoiceImagePreview, setInvoiceImagePreview] = useState(null);
  const [notes, setNotes] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Items in current invoice
  const [invoiceItems, setInvoiceItems] = useState([]);

  // Item Search & Add State
  const [searchProductTerm, setSearchProductTerm] = useState('');
  const [showNewProductModal, setShowNewProductModal] = useState(false);

  // New Product Modal Form State
  const [newProdForm, setNewProdForm] = useState({
    name: '',
    sku: '',
    cameraType: CATEGORIES[0] || 'أخرى',
    quantity: 1,
    costPrice: '',
    retailPrice: '',
    location: 'store'
  });

  // Debt Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Attachment Viewer Modal (Unified for Image and PDF)
  const [viewingAttachment, setViewingAttachment] = useState(null); // { url, type: 'image'|'pdf', title }

  // Archive Filter
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveStatusFilter, setArchiveStatusFilter] = useState('all');

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Saved & Known Suppliers Map
  const knownSuppliers = useMemo(() => {
    const map = new Map();
    (suppliers || []).forEach(s => {
      if (s.name) map.set(s.name.trim().toLowerCase(), { name: s.name.trim(), phone: s.phone || '' });
    });
    (supplierDebts || []).forEach(s => {
      if (s.supplierName) {
        const key = s.supplierName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: s.supplierName.trim(), phone: s.supplierPhone || '' });
        }
      }
    });
    (purchases || []).forEach(p => {
      if (p.supplierName) {
        const key = p.supplierName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: p.supplierName.trim(), phone: p.supplierPhone || '' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [suppliers, supplierDebts, purchases]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierName.trim()) return knownSuppliers;
    const term = supplierName.toLowerCase().trim();
    return knownSuppliers.filter(s =>
      s.name.toLowerCase().includes(term) || (s.phone && s.phone.includes(term))
    );
  }, [knownSuppliers, supplierName]);

  const handleSelectSupplier = (s) => {
    setSupplierName(s.name);
    if (s.phone) setSupplierPhone(s.phone);
    setShowSupplierDropdown(false);
  };

  const handleDeleteSupplier = (s, e) => {
    e?.stopPropagation?.();
    confirm(
      'حذف المورد',
      `هل أنت متأكد من حذف المورد "${s.name}" من قائمة الموردين؟`,
      async () => {
        try {
          await deleteSavedSupplier(s.name);
          toast(`تم حذف المورد "${s.name}" بنجاح`, 'success');
          if (supplierName === s.name) {
            setSupplierName('');
            setSupplierPhone('');
          }
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  // Product Autocomplete Search Results
  const searchResults = useMemo(() => {
    if (!searchProductTerm.trim()) return [];
    const term = searchProductTerm.toLowerCase().trim();
    return products.filter(p => {
      const nameMatch = p.name?.toLowerCase().includes(term);
      const skuMatch = p.sku?.toLowerCase().includes(term);
      const barcodeMatch = p.barcode?.toLowerCase().includes(term);
      const catMatch = p.cameraType?.toLowerCase().includes(term);
      return nameMatch || skuMatch || barcodeMatch || catMatch;
    }).slice(0, 15);
  }, [products, searchProductTerm]);

  // Handle adding an existing product to the invoice
  const handleAddExistingProduct = (prod) => {
    const existing = invoiceItems.find(i => i.productId === prod.id);
    if (existing) {
      toast('المادة مضافة بالفعل في الفاتورة أدناه', 'warn');
      return;
    }

    const currentCost = Number(prod.wholesalePrice || prod.costPrice) || 0;
    const currentRetail = Number(prod.retailPrice) || 0;

    setInvoiceItems(prev => [
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
        oldRetailPrice: currentRetail,
        retailPrice: currentRetail,
        location: 'store',
        isNewProduct: false
      }
    ]);
    setSearchProductTerm('');
  };

  // Handle adding a brand new product to the invoice
  const handleSaveNewProductModal = (e) => {
    e.preventDefault();
    if (!newProdForm.name.trim()) {
      toast('اسم المنتج مطلوب', 'error');
      return;
    }
    const cost = Number(newProdForm.costPrice) || 0;
    const retail = Number(newProdForm.retailPrice) || cost;
    const qty = Number(newProdForm.quantity) || 1;

    setInvoiceItems(prev => [
      ...prev,
      {
        productId: `new_${Date.now()}`,
        name: newProdForm.name.trim(),
        sku: newProdForm.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        cameraType: newProdForm.cameraType,
        quantity: qty,
        costPrice: cost,
        oldCostPrice: 0,
        retailPrice: retail,
        oldRetailPrice: 0,
        location: newProdForm.location || 'store',
        isNewProduct: true
      }
    ]);

    setShowNewProductModal(false);
    setNewProdForm({
      name: '',
      sku: '',
      cameraType: CATEGORIES[0] || 'أخرى',
      quantity: 1,
      costPrice: '',
      retailPrice: '',
      location: 'store'
    });
    toast('تمت إضافة الصنف الجديد إلى قائمة الفاتورة بنجاح!', 'success');
  };

  const handleItemChange = (index, field, value) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveItem = (index) => {
    setInvoiceItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Handle file upload (Supports both Images and PDFs)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      if (file.size > 900 * 1024) {
        toast('تنبيه: حجم ملف الـ PDF كبير (يُفضل أن يكون أقل من 800 كيلوبايت لسرعة التحميل والمزامنة السحابية)', 'warn');
      }
      try {
        toast('جاري قراءة ومعالجة ملف الـ PDF...', 'info');
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const base64Result = reader.result;
          setInvoiceImageUrl(base64Result);
          setInvoiceImagePreview(base64Result);
          setInvoiceFileType('pdf');
          setInvoiceFileName(file.name);
          toast(`تم إرفاق ملف PDF (${file.name}) بنجاح! 📑`, 'success');
        };
        reader.onerror = (err) => {
          toast('فشل قراءة ملف الـ PDF: ' + err.message, 'error');
        };
      } catch (err) {
        console.error(err);
        toast('فشل إرفاق ملف الـ PDF: ' + err.message, 'error');
      }
    } else {
      // Image file
      try {
        toast('جاري ضغط ومعالجة صورة الفاتورة...', 'info');
        const compressedBase64 = await compressImage(file);
        setInvoiceImageUrl(compressedBase64);
        setInvoiceImagePreview(compressedBase64);
        setInvoiceFileType('image');
        setInvoiceFileName(file.name);
        toast('تم إرفاق صورة الفاتورة بنجاح! 📷', 'success');
      } catch (err) {
        console.error(err);
        toast('فشل معالجة الصورة: ' + err.message, 'error');
      }
    }
  };

  // Financial Calculations & Equal Landed Cost Distribution with Remainder Allocation and Manual Override
  const itemsTotal = useMemo(() => {
    return invoiceItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0),
      0
    );
  }, [invoiceItems]);

  const numShipping = Math.max(0, Number(shippingCost) || 0);
  const invoiceTotal = itemsTotal + numShipping;

  const calculatedPaidAmount = paymentStatus === 'paid' ? invoiceTotal : (paymentStatus === 'debt' ? 0 : Number(paidAmount) || 0);
  const calculatedRemainingDebt = Math.max(0, invoiceTotal - calculatedPaidAmount);

  // Equal shipping distribution calculation with remainder target and manual override
  const shippingAllocationData = useMemo(() => {
    const totalPieces = invoiceItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    if (numShipping <= 0 || totalPieces <= 0 || invoiceItems.length === 0) {
      return {
        totalPieces: 0,
        baseEqualPerPiece: 0,
        totalRemainder: 0,
        targetIdx: 0,
        allocations: invoiceItems.map(() => ({ unitShip: 0, effectiveCost: 0, isTarget: false, hasManualOverride: false }))
      };
    }

    // Determine target item for remainder
    let targetIdx = remainderTargetIndex;
    if (targetIdx < 0 || targetIdx >= invoiceItems.length) {
      let maxCost = -1;
      let maxIdx = 0;
      invoiceItems.forEach((it, i) => {
        const cost = Number(it.costPrice) || 0;
        if (cost > maxCost) {
          maxCost = cost;
          maxIdx = i;
        }
      });
      targetIdx = maxIdx;
    }

    // Calculate manual overrides vs unoverridden items
    let manualTotal = 0;
    let unoverriddenPieces = 0;
    invoiceItems.forEach((it, i) => {
      const qty = Number(it.quantity) || 1;
      if (manualShippingMap[i] !== undefined && manualShippingMap[i] !== null && manualShippingMap[i] !== '') {
        manualTotal += (Number(manualShippingMap[i]) || 0) * qty;
      } else {
        unoverriddenPieces += qty;
      }
    });

    let baseEqualPerPiece = 0;
    let totalRemainder = 0;

    if (unoverriddenPieces > 0) {
      const remainingShippingToDistribute = Math.max(0, numShipping - manualTotal);
      const raw = remainingShippingToDistribute / unoverriddenPieces;
      baseEqualPerPiece = Math.floor(raw / 250) * 250;
      const totalBaseAllocated = baseEqualPerPiece * unoverriddenPieces;
      totalRemainder = Math.max(0, remainingShippingToDistribute - totalBaseAllocated);
    }

    const allocations = invoiceItems.map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const baseCost = Number(item.costPrice) || 0;
      const isTarget = idx === targetIdx;
      const hasManualOverride = manualShippingMap[idx] !== undefined && manualShippingMap[idx] !== null && manualShippingMap[idx] !== '';

      let unitShip = 0;
      if (hasManualOverride) {
        unitShip = Number(manualShippingMap[idx]) || 0;
      } else {
        const extra = (isTarget && unoverriddenPieces > 0) ? Math.round(totalRemainder / qty) : 0;
        unitShip = baseEqualPerPiece + extra;
      }

      const effectiveCost = baseCost + (distributeShippingToCost ? unitShip : 0);
      return {
        unitShip,
        effectiveCost,
        isTarget,
        hasManualOverride
      };
    });

    return {
      totalPieces,
      baseEqualPerPiece,
      totalRemainder,
      targetIdx,
      allocations
    };
  }, [invoiceItems, numShipping, distributeShippingToCost, remainderTargetIndex, manualShippingMap]);

  // Clear / Reset Form
  const handleResetForm = () => {
    setCurrentDraftId(null);
    setEditingPurchaseId(null);
    setSupplierName('');
    setSupplierPhone('');
    setInvoiceNumber('');
    setPaymentStatus('paid');
    setPaidAmount('');
    setPaidOutOfPocket(false);
    setOutOfPocketAmount('');
    setOutOfPocketEmployeeName(user?.displayName || user?.email?.split('@')[0] || '');
    setShippingCost('');
    setDistributeShippingToCost(true);
    setRemainderTargetIndex(0);
    setManualShippingMap({});
    setInvoiceImageUrl(null);
    setInvoiceFileType(null);
    setInvoiceFileName('');
    setInvoiceImagePreview(null);
    setNotes('');
    setInvoiceItems([]);
  };

  // Edit Existing Purchase Invoice
  const handleEditPurchaseInvoice = (p) => {
    setEditingPurchaseId(p.id);
    setCurrentDraftId(null);
    setSupplierName(p.supplierName || '');
    setSupplierPhone(p.supplierPhone || '');
    setInvoiceNumber(p.invoiceNumber || '');
    setPaymentStatus(p.paymentStatus || 'paid');
    setPaidAmount(p.paidAmount !== undefined && p.paidAmount !== null ? String(p.paidAmount) : '');
    setPaidOutOfPocket(Boolean(p.paidOutOfPocket));
    setOutOfPocketAmount(p.outOfPocketAmount ? String(p.outOfPocketAmount) : '');
    setOutOfPocketEmployeeName(p.outOfPocketEmployeeName || user?.displayName || user?.email?.split('@')[0] || '');
    setShippingCost(p.shippingCost ? String(p.shippingCost) : '');
    setDistributeShippingToCost(p.distributeShippingToCost !== false);
    setInvoiceImageUrl(p.invoiceImageUrl || null);
    setInvoiceImagePreview(p.invoiceImageUrl || null);
    
    const detectedType = p.invoiceFileType || (isPdfAttachment(p.invoiceImageUrl) ? 'pdf' : (p.invoiceImageUrl ? 'image' : null));
    setInvoiceFileType(detectedType);
    setInvoiceFileName(p.invoiceFileName || (detectedType === 'pdf' ? 'فاتورة_مرفقة.pdf' : ''));
    
    setNotes(p.notes || '');
    setPurchaseDate((p.date || p.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));

    const loadedItems = (p.items || []).map(i => ({
      productId: i.productId || '',
      name: i.name || '',
      sku: i.sku || '',
      barcode: i.barcode || '',
      cameraType: i.cameraType || '',
      quantity: Number(i.quantity) || 1,
      oldCostPrice: Number(i.oldCostPrice || i.baseCostPrice || i.costPrice) || 0,
      costPrice: Number(i.baseCostPrice || i.costPrice) || 0,
      oldRetailPrice: Number(i.oldRetailPrice || i.retailPrice) || 0,
      retailPrice: Number(i.retailPrice) || 0,
      location: i.location || 'store',
      isNewProduct: Boolean(i.isNewProduct)
    }));
    setInvoiceItems(loadedItems);

    const initialManualMap = {};
    (p.items || []).forEach((it, idx) => {
      if (it.unitShippingCost !== undefined && it.unitShippingCost !== null) {
        initialManualMap[idx] = it.unitShippingCost;
      }
    });
    setManualShippingMap(initialManualMap);

    setActiveTab('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`تم فتح فاتورة الشراء (${p.invoiceNumber}) للتعديل وإعادة توزيع أجور النقل ✍️`, 'info');
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!supplierName.trim() && invoiceItems.length === 0 && !invoiceImageUrl) {
      toast('يرجى إدخال اسم المورد أو إضافة مادة أو إرفاق ملف لحفظ المسودة', 'error');
      return;
    }

    const numOOP = paidOutOfPocket ? Math.max(0, Number(outOfPocketAmount) || 0) : 0;
    const drawerPaid = Math.max(0, calculatedPaidAmount - numOOP);

    const preparedItems = invoiceItems.map((item, idx) => {
      const alloc = shippingAllocationData.allocations[idx] || { unitShip: 0, effectiveCost: Number(item.costPrice) || 0 };
      return {
        ...item,
        unitShippingCost: alloc.unitShip,
        effectiveCostPrice: alloc.effectiveCost
      };
    });

    setSavingDraft(true);
    try {
      const savedId = await saveDraftPurchase({
        draftId: currentDraftId,
        supplierName: supplierName.trim(),
        supplierPhone: supplierPhone.trim(),
        invoiceNumber: invoiceNumber.trim(),
        items: preparedItems,
        paymentStatus,
        totalAmount: invoiceTotal,
        paidAmount: calculatedPaidAmount,
        paidOutOfPocket,
        outOfPocketAmount: numOOP,
        outOfPocketEmployeeName: (outOfPocketEmployeeName || '').trim(),
        paidFromCashDrawerAmount: drawerPaid,
        shippingCost: numShipping,
        distributeShippingToCost,
        invoiceImageUrl,
        invoiceFileType,
        invoiceFileName,
        notes: notes.trim(),
        date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      setCurrentDraftId(savedId);
      toast('تم حفظ فاتورة الشراء كمسودة بنجاح! 💾📋', 'success');
    } catch (err) {
      console.error(err);
      toast(`فشل حفظ المسودة: ${err.message}`, 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  // Load Draft into Form
  const handleLoadDraft = (draft) => {
    setCurrentDraftId(draft.id);
    setEditingPurchaseId(null);
    setSupplierName(draft.supplierName || '');
    setSupplierPhone(draft.supplierPhone || '');
    setInvoiceNumber(draft.invoiceNumber || '');
    setPaymentStatus(draft.paymentStatus || 'paid');
    setPaidAmount(draft.paidAmount ? String(draft.paidAmount) : '');
    setPaidOutOfPocket(Boolean(draft.paidOutOfPocket));
    setOutOfPocketAmount(draft.outOfPocketAmount ? String(draft.outOfPocketAmount) : '');
    setOutOfPocketEmployeeName(draft.outOfPocketEmployeeName || user?.displayName || user?.email?.split('@')[0] || '');
    setShippingCost(draft.shippingCost ? String(draft.shippingCost) : '');
    setDistributeShippingToCost(draft.distributeShippingToCost !== false);
    setInvoiceImageUrl(draft.invoiceImageUrl || null);
    setInvoiceImagePreview(draft.invoiceImageUrl || null);
    
    const detectedType = draft.invoiceFileType || (isPdfAttachment(draft.invoiceImageUrl) ? 'pdf' : (draft.invoiceImageUrl ? 'image' : null));
    setInvoiceFileType(detectedType);
    setInvoiceFileName(draft.invoiceFileName || (detectedType === 'pdf' ? 'فاتورة_مرفقة.pdf' : ''));
    
    setNotes(draft.notes || '');
    setPurchaseDate((draft.date || draft.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));

    // Load Items with custom unitShippingCost if present
    const loadedItems = (draft.items || []).map(i => ({
      productId: i.productId || '',
      name: i.name || '',
      sku: i.sku || '',
      barcode: i.barcode || '',
      cameraType: i.cameraType || '',
      quantity: Number(i.quantity) || 1,
      oldCostPrice: Number(i.oldCostPrice || i.baseCostPrice || i.costPrice) || 0,
      costPrice: Number(i.baseCostPrice || i.costPrice) || 0,
      oldRetailPrice: Number(i.oldRetailPrice || i.retailPrice) || 0,
      retailPrice: Number(i.retailPrice) || 0,
      location: i.location || 'store',
      isNewProduct: Boolean(i.isNewProduct)
    }));
    setInvoiceItems(loadedItems);

    const initialManualMap = {};
    (draft.items || []).forEach((it, idx) => {
      if (it.unitShippingCost !== undefined && it.unitShippingCost !== null) {
        initialManualMap[idx] = it.unitShippingCost;
      }
    });
    setManualShippingMap(initialManualMap);

    setActiveTab('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`تم فتح المسودة للمورد "${draft.supplierName || 'بدون اسم'}" بنجاح 📋`, 'info');
  };

  // Delete Draft
  const handleDeleteDraft = (draftId, supplier) => {
    confirm(
      'حذف المسودة',
      `هل أنت متأكد من حذف مسودة الشراء للمورد "${supplier || 'المسودة'}"؟`,
      async () => {
        try {
          await deleteDraftPurchase(draftId);
          if (currentDraftId === draftId) {
            handleResetForm();
          }
          toast('تم حذف مسودة الشراء بنجاح 🗑️', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  // Submit Purchase Invoice (Create or Update)
  const handleSubmitInvoice = async (e) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      toast('يرجى إدخال اسم المورد أو الشركة الموردة', 'error');
      return;
    }
    if (invoiceItems.length === 0) {
      toast('يرجى إضافة مادة واحدة على الأقل في الفاتورة', 'error');
      return;
    }

    const numOOP = paidOutOfPocket ? Math.max(0, Number(outOfPocketAmount) || 0) : 0;
    const drawerPaid = Math.max(0, calculatedPaidAmount - numOOP);

    const preparedItems = invoiceItems.map((item, idx) => {
      const alloc = shippingAllocationData.allocations[idx] || { unitShip: 0, effectiveCost: Number(item.costPrice) || 0 };
      return {
        ...item,
        unitShippingCost: alloc.unitShip,
        effectiveCostPrice: alloc.effectiveCost
      };
    });

    setSavingInvoice(true);
    try {
      if (editingPurchaseId) {
        // Update existing invoice
        await updatePurchaseInvoice(editingPurchaseId, {
          supplierName: supplierName.trim(),
          supplierPhone: supplierPhone.trim(),
          invoiceNumber: invoiceNumber.trim(),
          items: preparedItems,
          paymentStatus,
          paidOutOfPocket,
          outOfPocketAmount: numOOP,
          outOfPocketEmployeeName: (outOfPocketEmployeeName || '').trim() || user?.displayName || user?.email?.split('@')[0] || 'الموظف',
          paidFromCashDrawerAmount: drawerPaid,
          shippingCost: numShipping,
          distributeShippingToCost,
          totalAmount: invoiceTotal,
          paidAmount: calculatedPaidAmount,
          invoiceImageUrl,
          invoiceFileType,
          invoiceFileName,
          notes: notes.trim(),
          date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
          updatedBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
        });

        toast(`تم تحديث وتعديل فاتورة الشراء (${invoiceNumber}) وتصحيح المخزون والتكاليف بنجاح! 💾✨`, 'success');
      } else {
        // Create new purchase invoice
        await createPurchaseInvoice({
          supplierName: supplierName.trim(),
          supplierPhone: supplierPhone.trim(),
          invoiceNumber: invoiceNumber.trim(),
          items: preparedItems,
          paymentStatus,
          paidOutOfPocket,
          outOfPocketAmount: numOOP,
          outOfPocketEmployeeName: (outOfPocketEmployeeName || '').trim() || user?.displayName || user?.email?.split('@')[0] || 'الموظف',
          paidFromCashDrawerAmount: drawerPaid,
          shippingCost: numShipping,
          distributeShippingToCost,
          totalAmount: invoiceTotal,
          paidAmount: calculatedPaidAmount,
          invoiceImageUrl,
          invoiceFileType,
          invoiceFileName,
          notes: notes.trim(),
          date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
          draftId: currentDraftId
        });

        toast(`تم تسجيل فاتورة الشراء وتوريد (${invoiceItems.reduce((s, i) => s + Number(i.quantity), 0)}) قطعة إلى المخزون بنجاح! 📦🎉`, 'success');
      }

      handleResetForm();
      setActiveTab('archive');
    } catch (err) {
      console.error(err);
      toast(`فشل حفظ الفاتورة: ${err.message}`, 'error');
    } finally {
      setSavingInvoice(false);
    }
  };

  // Open Debt Payment Modal
  const handleOpenPayment = (supplier) => {
    setSelectedSupplierForPayment(supplier);
    setPaymentAmount(supplier.remainingDebt || '');
    setPaymentMethod('نقدي');
    setPaymentNotes('');
    setShowPaymentModal(true);
  };

  // Submit Debt Payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      toast('يرجى إدخال مبلغ سداد صحيح', 'error');
      return;
    }

    setSubmittingPayment(true);
    try {
      await recordSupplierDebtPayment({
        supplierName: selectedSupplierForPayment.supplierName,
        amount,
        paymentMethod,
        notes: paymentNotes,
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
      });

      toast(`تم تسجيل سداد دفعة بمبلغ ${formatIQD(amount)} د.ع للمورد (${selectedSupplierForPayment.supplierName}) بنجاح! 💵✨`, 'success');
      setShowPaymentModal(false);
      setSelectedSupplierForPayment(null);
    } catch (err) {
      toast(`فشل السداد: ${err.message}`, 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Filtered Archive List
  const filteredArchive = useMemo(() => {
    return purchases.filter(p => {
      if (archiveStatusFilter !== 'all' && p.paymentStatus !== archiveStatusFilter) return false;
      if (archiveSearch.trim()) {
        const term = archiveSearch.toLowerCase().trim();
        const supMatch = p.supplierName?.toLowerCase().includes(term);
        const invMatch = p.invoiceNumber?.toLowerCase().includes(term);
        const notesMatch = p.notes?.toLowerCase().includes(term);
        return supMatch || invMatch || notesMatch;
      }
      return true;
    });
  }, [purchases, archiveSearch, archiveStatusFilter]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl shadow-inner">
            📦
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              المشتريات وتوريد المخزون والديون
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              تسجيل فواتير الشراء، حفظ المسودات، إرفاق الصور وملفات الـ PDF، واحتساب وتوزيع مصاريف النقل والشحن بدقة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (currentDraftId) handleResetForm();
              setActiveTab('new');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'new' && !currentDraftId
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>➕</span>
            <span>تسجيل فاتورة شراء جديدة</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 rounded-2xl border border-rose-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800">ديون الموردين (المتبقي علينا)</span>
            <span className="p-2 bg-rose-500/10 text-rose-700 rounded-xl text-lg">📑</span>
          </div>
          <p className="text-2xl font-black text-rose-950 mt-2 font-mono">
            {formatIQD(stats.totalRemainingDebt)} <span className="text-xs font-normal text-rose-800">د.ع</span>
          </p>
          <p className="text-[11px] text-rose-700 mt-1">المبالغ المطلوبة من المحل للموردين</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 rounded-2xl border border-emerald-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">إجمالي المسدد للموردين</span>
            <span className="p-2 bg-emerald-500/10 text-emerald-700 rounded-xl text-lg">💵</span>
          </div>
          <p className="text-2xl font-black text-emerald-950 mt-2 font-mono">
            {formatIQD(stats.totalPaidToSuppliers)} <span className="text-xs font-normal text-emerald-800">د.ع</span>
          </p>
          <p className="text-[11px] text-emerald-700 mt-1">مدفوعات الشراء المسددة</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-5 rounded-2xl border border-indigo-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-800">إجمالي المشتريات</span>
            <span className="p-2 bg-indigo-500/10 text-indigo-700 rounded-xl text-lg">🛒</span>
          </div>
          <p className="text-2xl font-black text-indigo-950 mt-2 font-mono">
            {formatIQD(stats.totalPurchasesAmount)} <span className="text-xs font-normal text-indigo-800">د.ع</span>
          </p>
          <p className="text-[11px] text-indigo-700 mt-1">قيمة كل فواتير الشراء المسجلة</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100/80 p-5 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">مسودات المشتريات</span>
            <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl text-lg">📋</span>
          </div>
          <p className="text-2xl font-black text-amber-950 mt-2 font-mono">
            {draftPurchases.length} <span className="text-xs font-normal text-amber-800">مسودة معلقة</span>
          </p>
          <p className="text-[11px] text-amber-700 mt-1">فواتير قيد التجهيز لم تورّد بعد</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeTab === 'new'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>🛒</span>
          <span>
            {editingPurchaseId
              ? 'تعديل فاتورة الشراء ✏️'
              : (currentDraftId ? 'تعديل المسودة الحالية ✍️' : 'تسجيل فاتورة شراء وتوريد')}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('drafts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 ${
            activeTab === 'drafts'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📋</span>
          <span>مسودات المشتريات</span>
          {draftPurchases.length > 0 && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              activeTab === 'drafts' ? 'bg-white text-indigo-700 font-black' : 'bg-amber-100 text-amber-800 font-bold border border-amber-300'
            }`}>
              {draftPurchases.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('debts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeTab === 'debts'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📑</span>
          <span>ديون الموردين والمكتب ({supplierDebts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('archive')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeTab === 'archive'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>📦</span>
          <span>أرشيف فواتير الشراء ({purchases.length})</span>
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: NEW / EDIT PURCHASE INVOICE */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'new' && (
        <form onSubmit={handleSubmitInvoice} className="space-y-6">
          {/* Active Editing Purchase Invoice Banner */}
          {editingPurchaseId && (
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 border-2 border-amber-400 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✏️</span>
                <div>
                  <h4 className="text-xs font-black flex items-center gap-2">
                    <span>أنت الآن في وضع تعديل وتصحيح فاتورة الشراء</span>
                    <span className="bg-white text-amber-900 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
                      {invoiceNumber || 'الحالية'}
                    </span>
                    <span className="bg-amber-700/70 text-white text-[10px] px-2 py-0.5 rounded-md">
                      المورد: {supplierName || '—'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-amber-100 mt-0.5">
                    يمكنك تصحيح أجور النقل وتوزيعها وتعديل المواد والأسعار، وسيتم تحديث رصيد وتكلفة المخزن تلقائياً عند الحفظ.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetForm}
                className="px-3.5 py-1.5 bg-white/25 hover:bg-white/35 text-white border border-white/40 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                إلغاء التعديل ✕
              </button>
            </div>
          )}

          {/* Active Draft Banner */}
          {currentDraftId && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📝</span>
                <div>
                  <h4 className="text-xs font-black text-amber-900 flex items-center gap-2">
                    <span>أنت تقوم حالياً بتعديل واستكمال مسودة شراء</span>
                    <span className="bg-amber-200 text-amber-800 text-[10px] px-2 py-0.5 rounded-md font-mono">
                      {supplierName || 'مسودة غير مسماة'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    يمكنك حفظ التعديلات كمسودة مجدداً، أو الضغط على زر التوريد لاعتمادها كفاتورة شراء رسمية وتوريد البضاعة للمخزن.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetForm}
                className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                إلغاء تحميل المسودة ✕
              </button>
            </div>
          )}

          {/* Supplier & Invoice Header Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
              <span>🏢</span>
              <span>بيانات المورد وحالة السداد والتاريخ</span>
            </h3>

            {/* Quick Supplier Chips */}
            {knownSuppliers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500 ml-1">موردين سابقين:</span>
                {knownSuppliers.slice(0, 6).map((s, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-[11px] font-bold text-slate-700 hover:text-indigo-700 transition-colors overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSupplier(s)}
                      className="px-2 py-1 flex items-center gap-1 cursor-pointer"
                    >
                      <span>🏢</span>
                      <span>{s.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSupplier(s, e)}
                      className="px-1.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="حذف المورد"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">اسم المورد / الشركة *</label>
                  {knownSuppliers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      {showSupplierDropdown ? 'إغلاق القائمة ✕' : `اختيار (${knownSuppliers.length}) ▼`}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  placeholder="مثال: شركة الرواد للتجهيزات، داهوا العراق..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />

                {/* Autocomplete Dropdown */}
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-56 overflow-y-auto z-30 divide-y divide-slate-100">
                    <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-500 flex items-center justify-between">
                      <span>الموردين المسجلين ({filteredSuppliers.length}):</span>
                      <button
                        type="button"
                        onClick={() => setShowSupplierDropdown(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>
                    {filteredSuppliers.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSupplier(s)}
                        className="p-2.5 flex items-center justify-between hover:bg-indigo-50 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span>🏢</span>
                          <span className="text-xs font-bold text-slate-800 truncate">{s.name}</span>
                          {s.phone && (
                            <span className="text-[11px] text-slate-400 font-mono mr-2">
                              📞 {s.phone}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSupplier(s, e)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer shrink-0"
                          title="حذف هذا المورد"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف المورد (اختياري)</label>
                <input
                  type="text"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  placeholder="0770XXXXXXX"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفاتورة الورقية (اختياري)</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="مثال: 98421 أو اتركها للتوليد الآلي"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الفاتورة</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                />
              </div>
            </div>

            {/* Shipping & Transport Costs Section */}
            <div className="pt-3 border-t border-slate-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 p-4 rounded-xl border border-blue-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚚</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      مصاريف النقل والشحن (د.ع)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      تضاف إلى إجمالي الفاتورة وتوزع بالتناسب على سعر تكلفة كل قطعة (Landed Cost).
                    </p>
                  </div>
                </div>

                <div className="w-full sm:w-56">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                      placeholder="0"
                      className="w-full p-2.5 bg-white border border-blue-300 rounded-xl text-xs font-bold font-mono text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">د.ع</span>
                  </div>
                </div>
              </div>

              {numShipping > 0 && (
                <div className="pt-2 border-t border-blue-100/60 text-xs space-y-2.5 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-900">
                      <input
                        type="checkbox"
                        checked={distributeShippingToCost}
                        onChange={(e) => setDistributeShippingToCost(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>تحديث سعر التكلفة في المخزن بالتكلفة الفعلية بعد النقل (Landed Cost) ✨</span>
                    </label>

                    <span className="text-[11px] text-blue-800 font-bold font-mono">
                      إجمالي النقل: + {formatIQD(numShipping)} د.ع
                    </span>
                  </div>

                  {invoiceItems.length > 0 && (
                    <div className="p-3 bg-white/90 rounded-xl border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          <span className="text-[11px] text-blue-800 font-bold">نصيب القطعة بالتساوي:</span>
                          <span className="text-xs font-black font-mono text-blue-950">
                            +{formatIQD(shippingAllocationData.baseEqualPerPiece)} د.ع
                          </span>
                        </div>

                        {shippingAllocationData.totalRemainder > 0 && (
                          <div className="flex items-center gap-2 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                            <span className="text-[11px] text-amber-900 font-bold">فارق الكسور المتبقي:</span>
                            <span className="text-xs font-black font-mono text-amber-950">
                              +{formatIQD(shippingAllocationData.totalRemainder)} د.ع
                            </span>
                            <span className="text-[10px] text-amber-800">مُضاف إلى:</span>
                            <select
                              value={shippingAllocationData.targetIdx}
                              onChange={(e) => setRemainderTargetIndex(Number(e.target.value))}
                              className="bg-white border border-amber-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-amber-500"
                            >
                              {invoiceItems.map((item, idx) => (
                                <option key={idx} value={idx}>
                                  {item.name} ({item.quantity} قطع)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {Object.keys(manualShippingMap).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setManualShippingMap({})}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors cursor-pointer shrink-0"
                          title="إلغاء التعديلات اليدوية وإعادة التقسيم بالتساوي على كافة القطع"
                        >
                          🔄 إعادة التوزيع التلقائي المتساوي
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Status Bar */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-2">حالة سداد الفاتورة:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentStatus('paid')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all cursor-pointer ${
                    paymentStatus === 'paid'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🟢</span>
                  <span>مدفوعة نقداً بالكامل</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentStatus('debt')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all cursor-pointer ${
                    paymentStatus === 'debt'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🔴</span>
                  <span>دين آجل على المكتب (المورد يطلبنا)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentStatus('partial')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all cursor-pointer ${
                    paymentStatus === 'partial'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>🟡</span>
                  <span>دفعة جزئية (دفع جزء والباقي دين)</span>
                </button>
              </div>

              {/* Partial Payment Amount Input */}
              {paymentStatus === 'partial' && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl grid grid-cols-2 gap-3 animate-fade-in">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">المبلغ المسدد نقداً (د.ع) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      max={invoiceTotal}
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="0"
                      className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-xs text-amber-800 font-bold">المتبقي كدين على المكتب:</span>
                    <span className="text-sm font-black text-rose-700 font-mono">
                      {formatIQD(calculatedRemainingDebt)} د.ع
                    </span>
                  </div>
                </div>
              )}

              {/* Out of Pocket / Employee Personal Advance Option */}
              {paymentStatus !== 'debt' && (
                <div className="mt-3 p-3.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-indigo-950">
                      <input
                        type="checkbox"
                        checked={paidOutOfPocket}
                        onChange={(e) => {
                          setPaidOutOfPocket(e.target.checked);
                          if (e.target.checked && !outOfPocketEmployeeName) {
                            setOutOfPocketEmployeeName(user?.displayName || user?.email?.split('@')[0] || 'الموظف');
                          }
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>💳 دفع الموظف جزءاً أو كلاً من جيبه الخاص (سلفة شخصية بانتظار الاسترداد)</span>
                    </label>

                    {paidOutOfPocket && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200 font-mono shadow-2xs">
                        تُسجل في مستحقات الموظفين 👤
                      </span>
                    )}
                  </div>

                  {paidOutOfPocket && (
                    <div className="pt-2 border-t border-indigo-200/60 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in text-xs">
                      <div>
                        <label className="block text-xs font-bold text-indigo-900 mb-1">
                          المبلغ المدفوع من جيب الموظف (د.ع) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={calculatedPaidAmount}
                          value={outOfPocketAmount}
                          onChange={(e) => setOutOfPocketAmount(e.target.value)}
                          placeholder="مثال: 10000"
                          className="w-full p-2 bg-white border border-indigo-300 rounded-lg font-bold font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-indigo-900 mb-1">
                          اسم الموظف الدائن *
                        </label>
                        <input
                          type="text"
                          value={outOfPocketEmployeeName}
                          onChange={(e) => setOutOfPocketEmployeeName(e.target.value)}
                          placeholder="اسم الموظف..."
                          className="w-full p-2 bg-white border border-indigo-300 rounded-lg font-bold text-xs focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="bg-white/90 p-2.5 rounded-lg border border-indigo-100 flex flex-col justify-center">
                        <span className="text-[11px] text-slate-500 font-bold">المسحوب فعلياً من القاصة / الصندوق:</span>
                        <span className="text-sm font-black text-emerald-700 font-mono">
                          {formatIQD(Math.max(0, calculatedPaidAmount - (Number(outOfPocketAmount) || 0)))} د.ع
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes & File Attachment Section (Images & PDF) */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة (اختياري)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: شحنة مستلمة عبر مكتب النورس، الدفع بعد فحص البضاعة..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  مرفق الفاتورة (صورة ورقية أو ملف PDF)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,application/pdf,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>📁</span>
                    <span>{invoiceImagePreview ? 'تغيير الملف / الصورة' : 'رفع ملف (صورة أو PDF)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>📷</span>
                    <span>تصوير بالكاميرا</span>
                  </button>

                  {invoiceImagePreview && (
                    <div className="flex items-center gap-2 mr-auto bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                      {isPdfAttachment(invoiceImageUrl, invoiceFileType) ? (
                        <div
                          onClick={() => setViewingAttachment({
                            url: invoiceImageUrl,
                            type: 'pdf',
                            title: invoiceFileName || 'ملف PDF المرفق'
                          })}
                          className="flex items-center gap-1.5 cursor-pointer text-indigo-600 hover:text-indigo-800"
                        >
                          <span className="text-lg">📑</span>
                          <span className="text-xs font-bold font-mono underline max-w-[130px] truncate">
                            {invoiceFileName || 'ملف PDF'}
                          </span>
                        </div>
                      ) : (
                        <div
                          onClick={() => setViewingAttachment({
                            url: invoiceImageUrl,
                            type: 'image',
                            title: 'معاينة صورة الفاتورة'
                          })}
                          className="w-8 h-8 rounded-lg border border-slate-300 overflow-hidden bg-slate-100 shrink-0 cursor-pointer hover:opacity-80"
                          title="معاينة الصورة"
                        >
                          <img src={invoiceImagePreview} alt="Invoice" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceImageUrl(null);
                          setInvoiceImagePreview(null);
                          setInvoiceFileType(null);
                          setInvoiceFileName('');
                        }}
                        className="text-xs text-red-500 hover:text-red-700 cursor-pointer font-bold p-1 hover:bg-red-50 rounded"
                        title="إلغاء المرفق"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Items Inward Table & Search */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>📦</span>
                  <span>المواد المشتراة والموردة للمخزون ({invoiceItems.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500">ابحث عن المادة لتوريدها أو أضف صنفاً جديداً كلياً.</p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewProductModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <span>➕</span>
                <span>إضافة مادة جديدة كلياً</span>
              </button>
            </div>

            {/* Product Search Box */}
            <div className="relative">
              <input
                type="text"
                value={searchProductTerm}
                onChange={(e) => setSearchProductTerm(e.target.value)}
                placeholder="🔍 ابحث عن مادة لإضافتها للفاتورة (بالاسم، الموديل، SKU، أو امسح الباركود)..."
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />

              {/* Autocomplete Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-20 divide-y divide-slate-100">
                  {searchResults.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleAddExistingProduct(p)}
                      className="p-3 flex items-center justify-between hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0 pl-2">
                        <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {p.sku || p.barcode || '—'} | {p.cameraType || ''}
                        </p>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[11px] text-slate-500 block">
                          التكلفة القديمة: <strong className="font-mono text-slate-800">{formatIQD(p.wholesalePrice || p.costPrice)} د.ع</strong>
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold">
                          المحل: {p.storeQty} | المخزن: {p.warehouseQty}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoice Items Table */}
            {invoiceItems.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-400">
                <span className="text-4xl block mb-2">🛒</span>
                <p className="text-xs font-bold">لم تضف أي مواد في الفاتورة بعد.</p>
                <p className="text-[11px] text-slate-400 mt-1">ابحث عن مادة أعلاه أو انقر على زر "إضافة مادة جديدة كلياً".</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3 min-w-[180px]">المادة</th>
                      <th className="p-3">مكان الإيداع</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3">سعر الشراء الأساسي</th>
                      {numShipping > 0 && (
                        <>
                          <th className="p-3 text-center text-blue-700 bg-blue-50/50 min-w-[140px]">نصيب النقل/القطعة</th>
                          <th className="p-3 text-center text-indigo-800 bg-indigo-50/50 min-w-[130px]">التكلفة بعد النقل (Landed)</th>
                        </>
                      )}
                      <th className="p-3">سعر البيع المفرد</th>
                      <th className="p-3 text-center">الإجمالي</th>
                      <th className="p-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceItems.map((item, idx) => {
                      const qty = Number(item.quantity) || 1;
                      const baseCost = Number(item.costPrice) || 0;
                      const lineTotal = qty * baseCost;
                      const alloc = shippingAllocationData.allocations[idx] || {
                        unitShip: 0,
                        effectiveCost: baseCost,
                        isTarget: false,
                        hasManualOverride: false
                      };

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-400">{idx + 1}</td>
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {item.sku ? `SKU: ${item.sku}` : ''}
                              {item.oldCostPrice > 0 ? ` | التكلفة السابقة: ${formatIQD(item.oldCostPrice)} د.ع` : ''}
                            </p>
                          </td>
                          <td className="p-3">
                            <select
                              value={item.location}
                              onChange={(e) => handleItemChange(idx, 'location', e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg p-1 text-xs font-bold"
                            >
                              <option value="store">🏪 المحل</option>
                              <option value="warehouse">🏢 المخزن</option>
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                              className="w-16 p-1 border border-slate-300 rounded-lg text-center font-bold font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={item.costPrice}
                                onChange={(e) => handleItemChange(idx, 'costPrice', e.target.value)}
                                placeholder="0"
                                className="w-24 p-1 border border-slate-300 rounded-lg text-left font-bold font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-slate-400">د.ع</span>
                            </div>
                          </td>

                          {numShipping > 0 && (
                            <>
                              <td className="p-3 text-center bg-blue-50/30">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-blue-600 font-bold text-xs">+</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={manualShippingMap[idx] !== undefined ? manualShippingMap[idx] : alloc.unitShip}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setManualShippingMap(prev => ({ ...prev, [idx]: val }));
                                      }}
                                      placeholder="0"
                                      className={`w-20 p-1 border rounded-lg text-center font-bold font-mono text-xs focus:ring-1 focus:ring-indigo-500 ${
                                        alloc.hasManualOverride
                                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-black'
                                          : 'bg-white border-blue-200 text-blue-900'
                                      }`}
                                      title="يمكنك تعديل نصيب النقل لهذه القطعة يدوياً إذا كانت شحنتها أعلى"
                                    />
                                    <span className="text-[10px] text-slate-400">د.ع</span>
                                  </div>

                                  {alloc.isTarget && shippingAllocationData.totalRemainder > 0 && !alloc.hasManualOverride && (
                                    <span className="text-[9px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 inline-block truncate max-w-[130px]">
                                      🎯 يشمل فارق (+{formatIQD(shippingAllocationData.totalRemainder)} د.ع)
                                    </span>
                                  )}

                                  {!alloc.isTarget && shippingAllocationData.totalRemainder > 0 && !alloc.hasManualOverride && (
                                    <button
                                      type="button"
                                      onClick={() => setRemainderTargetIndex(idx)}
                                      className="text-[9px] font-bold text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 px-1 py-0.5 rounded transition-colors cursor-pointer"
                                      title="توجيه الفارق المتبقي لهذه المادة"
                                    >
                                      🎯 توجيه الفارق هنا
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center bg-indigo-50/30 font-mono font-black text-indigo-900 text-sm">
                                {formatIQD(alloc.effectiveCost)} د.ع
                              </td>
                            </>
                          )}

                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={item.retailPrice}
                                onChange={(e) => handleItemChange(idx, 'retailPrice', e.target.value)}
                                placeholder="0"
                                className="w-24 p-1 border border-slate-300 rounded-lg text-left font-bold font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-[10px] text-slate-400">د.ع</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-black text-indigo-900 font-mono">
                            {formatIQD(lineTotal)} د.ع
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="حذف"
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
            )}

            {/* Total Summary & Action Buttons */}
            <div className="p-5 bg-slate-900 text-white rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-xl">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                  <span>عدد المواد: <strong className="text-white">{invoiceItems.length}</strong></span>
                  <span>•</span>
                  <span>إجمالي القطع: <strong className="text-emerald-400">{invoiceItems.reduce((s, i) => s + Number(i.quantity), 0)} قطعة</strong></span>
                  {numShipping > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-blue-300">تكلفة النقل: <strong className="text-white">{formatIQD(numShipping)} د.ع</strong></span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  حالة السداد: <strong className={paymentStatus === 'paid' ? 'text-emerald-400' : paymentStatus === 'debt' ? 'text-rose-400' : 'text-amber-400'}>
                    {paymentStatus === 'paid' ? 'مدفوعة نقداً بالكامل' : paymentStatus === 'debt' ? 'دين كامل على المكتب' : `دفعة جزئية (واصل: ${formatIQD(calculatedPaidAmount)} د.ع)`}
                  </strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="text-left bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
                  <span className="text-[11px] text-slate-400 block">الإجمالي النهائي مع النقل:</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    {formatIQD(invoiceTotal)} <span className="text-xs font-normal text-slate-300">د.ع</span>
                  </span>
                </div>

                {/* Save Draft Button */}
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || savingInvoice}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  title="حفظ الفاتورة كمسودة دون التأثير على المخزون أو الديون"
                >
                  <span>💾</span>
                  <span>{savingDraft ? 'جاري حفظ المسودة...' : (currentDraftId ? 'تحديث المسودة' : 'حفظ كمسودة')}</span>
                </button>

                {/* Final Submit and Inward Stock Button */}
                <button
                  type="submit"
                  disabled={savingInvoice || savingDraft || invoiceItems.length === 0}
                  className={`text-white text-xs font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center gap-2 ${
                    invoiceItems.length === 0
                      ? 'bg-slate-700 opacity-60 cursor-not-allowed'
                      : (editingPurchaseId
                          ? 'bg-amber-600 hover:bg-amber-700 hover:shadow-xl cursor-pointer'
                          : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-xl cursor-pointer')
                  }`}
                  title={invoiceItems.length === 0 ? 'يرجى إضافة مادة واحدة على الأقل لتوريدها للمخزون' : (editingPurchaseId ? 'حفظ وتحديث الفاتورة' : 'اعتماد وتوريد المخزون')}
                >
                  {savingInvoice ? (
                    <span>{editingPurchaseId ? 'جاري تحديث الفاتورة والمخزون...' : 'جاري توريد المخزون وتسجيل الفاتورة...'}</span>
                  ) : (
                    <>
                      <span>{editingPurchaseId ? '💾' : '📦'}</span>
                      <span>{editingPurchaseId ? 'حفظ وتحديث فاتورة الشراء والمخزون 💾' : 'اعتماد وتوريد المخزون ✓'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: DRAFT PURCHASES (المسودات المعلقة) */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'drafts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  مسودات فواتير الشراء المعلقة ({draftPurchases.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  فواتير شراء قيد الإعداد لم يتم اعتمادها أو توريدها للمخزن بعد. يمكنك استرجاعها وإكمالها في أي وقت.
                </p>
              </div>
            </div>
          </div>

          {draftPurchases.length === 0 ? (
            <div className="p-16 text-center text-slate-400 space-y-2">
              <span className="text-5xl block mb-2">🏖️</span>
              <p className="text-sm font-bold text-slate-700">لا توجد أي مسودات شراء معلقة حالياً.</p>
              <p className="text-xs text-slate-400">
                عند إعداد فاتورة شراء، يمكنك النقر على "حفظ كمسودة" لتخزينها هنا واستكمالها لاحقاً.
              </p>
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {draftPurchases.map((draft) => {
                const itemsCount = (draft.items || []).length;
                const totalQty = (draft.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
                const hasPdf = isPdfAttachment(draft.invoiceImageUrl, draft.invoiceFileType);

                return (
                  <div
                    key={draft.id}
                    className="p-5 bg-white border-2 border-amber-200/80 hover:border-amber-400 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-indigo-500" />

                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                            <span>🏢</span>
                            <span>{draft.supplierName || 'مورد غير مسمى'}</span>
                          </h4>
                          {draft.supplierPhone && (
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              📞 {draft.supplierPhone}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {draft.invoiceImageUrl && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              hasPdf ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {hasPdf ? '📑 PDF' : '📷 صورة'}
                            </span>
                          )}
                          <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-md font-mono">
                            مسودة
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>المواد المضافة:</span>
                          <strong className="text-slate-900">{itemsCount} أصناف ({totalQty} قطعة)</strong>
                        </div>
                        {Number(draft.shippingCost) > 0 && (
                          <div className="flex items-center justify-between text-blue-700">
                            <span>مصاريف النقل:</span>
                            <strong className="font-mono">+{formatIQD(draft.shippingCost)} د.ع</strong>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-slate-900 pt-1 border-t border-slate-200 font-bold">
                          <span>الإجمالي التقديري:</span>
                          <strong className="text-emerald-700 font-mono text-sm">{formatIQD(draft.totalAmount)} د.ع</strong>
                        </div>
                      </div>

                      {draft.notes && (
                        <p className="text-[11px] text-slate-500 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                          💬 {draft.notes}
                        </p>
                      )}

                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                        <span>آخر تحديث: {draft.updatedAt ? new Date(draft.updatedAt).toLocaleDateString('ar-IQ') : '—'}</span>
                        <span>بواسطة: {draft.createdBy || 'المسؤول'}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>✏️</span>
                        <span>استرجاع وتعديل</span>
                      </button>

                      {draft.invoiceImageUrl && (
                        <button
                          type="button"
                          onClick={() => setViewingAttachment({
                            url: draft.invoiceImageUrl,
                            type: hasPdf ? 'pdf' : 'image',
                            title: `مرفق مسودة ${draft.supplierName || 'الشراء'}`
                          })}
                          className="p-2 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl transition-colors cursor-pointer"
                          title="عرض المرفق"
                        >
                          {hasPdf ? '📑' : '📷'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id, draft.supplierName)}
                        className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                        title="حذف المسودة"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: SUPPLIER DEBTS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'debts' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>📑</span>
                <span>كشف حساب الموردين والجهات الدائنة</span>
              </h3>
              <span className="text-xs text-slate-500 font-bold">
                إجمالي الديون المتبقية: <strong className="text-rose-700 font-mono">{formatIQD(stats.totalRemainingDebt)} د.ع</strong>
              </span>
            </div>

            {supplierDebts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <span className="text-4xl block mb-2">🎉</span>
                <p className="text-xs font-bold">لا توجد أي ديون مستحقة على المحل للموردين.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">المورد / الدائن</th>
                      <th className="p-3">رقم الهاتف</th>
                      <th className="p-3">عدد الفواتير</th>
                      <th className="p-3">إجمالي المشتريات</th>
                      <th className="p-3">المسدد له</th>
                      <th className="p-3">الدين المتبقي عليه</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supplierDebts.map((s) => {
                      const hasDebt = Number(s.remainingDebt) > 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-900 text-sm">
                            {s.supplierName}
                          </td>
                          <td className="p-3 text-slate-500 font-mono">
                            {s.supplierPhone || '—'}
                          </td>
                          <td className="p-3 font-bold text-slate-700">
                            {s.invoicesCount || 1} فواتير
                          </td>
                          <td className="p-3 font-bold text-slate-800 font-mono">
                            {formatIQD(s.totalPurchases)} د.ع
                          </td>
                          <td className="p-3 font-bold text-emerald-700 font-mono">
                            {formatIQD(s.totalPaid)} د.ع
                          </td>
                          <td className="p-3 font-black font-mono text-sm">
                            <span className={hasDebt ? 'text-rose-700' : 'text-emerald-600'}>
                              {formatIQD(s.remainingDebt)} د.ع
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {hasDebt ? (
                                <button
                                  onClick={() => handleOpenPayment(s)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer flex items-center gap-1"
                                >
                                  <span>💵</span>
                                  <span>تسديد دفعة</span>
                                </button>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  خالص بالكامل ✓
                                </span>
                              )}

                              <button
                                onClick={() => {
                                  confirm(
                                    'حذف سجل المورد من الديون',
                                    `هل تريد حذف سجل المورد "${s.supplierName}" من قائمة الديون؟`,
                                    async () => {
                                      try {
                                        await deleteSupplierDebtRecord(s.id);
                                        toast('تم حذف سجل المورد من قائمة الديون بنجاح', 'success');
                                      } catch (err) {
                                        toast(err.message, 'error');
                                      }
                                    }
                                  );
                                }}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="حذف من قائمة الديون"
                              >
                                🗑️
                              </button>
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

          {/* Debt Payments Log */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span>📋</span>
                <span>سجل الدفعات المسددة للموردين مؤخراً ({debtPayments.length})</span>
              </h4>
            </div>

            {debtPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                لا توجد دفعات مسجلة بعد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">تاريخ الدفعة</th>
                      <th className="p-3">المورد</th>
                      <th className="p-3">المبلغ المسدد</th>
                      <th className="p-3">طريقة الدفع</th>
                      <th className="p-3">ملاحظات</th>
                      <th className="p-3">المسؤول</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {debtPayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500 font-mono">
                          {pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString('ar-IQ') : '—'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {pay.supplierName}
                        </td>
                        <td className="p-3 font-black text-emerald-700 font-mono text-sm">
                          {formatIQD(pay.amount)} د.ع
                        </td>
                        <td className="p-3 text-slate-600">
                          {pay.paymentMethod || 'نقدي'}
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">
                          {pay.notes || '—'}
                        </td>
                        <td className="p-3 text-slate-400">
                          {pay.createdBy || 'المسؤول'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 4: PURCHASES ARCHIVE */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'archive' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="بحث باسم المورد، رقم الفاتورة..."
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
            </div>

            <select
              value={archiveStatusFilter}
              onChange={(e) => setArchiveStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">جميع الحالات</option>
              <option value="paid">مدفوعة نقداً 🟢</option>
              <option value="debt">دين على المكتب 🔴</option>
              <option value="partial">دفعة جزئية 🟡</option>
            </select>
          </div>

          {/* Archive Table */}
          {filteredArchive.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <span className="text-4xl block mb-2">📋</span>
              <p className="text-xs font-bold">لا توجد فواتير شراء مطابقة.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">المورد</th>
                    <th className="p-3">المواد الموردة</th>
                    <th className="p-3">إجمالي المواد</th>
                    <th className="p-3">مصاريف النقل</th>
                    <th className="p-3">الإجمالي النهائي</th>
                    <th className="p-3 text-center">حالة السداد</th>
                    <th className="p-3 text-center">مرفق الفاتورة</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredArchive.map((p) => {
                    const isPaid = p.paymentStatus === 'paid';
                    const isDebt = p.paymentStatus === 'debt';
                    const hasPdf = isPdfAttachment(p.invoiceImageUrl, p.invoiceFileType);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-500 font-mono whitespace-nowrap">
                          {p.date ? new Date(p.date).toLocaleDateString('ar-IQ') : '—'}
                        </td>
                        <td className="p-3 font-bold font-mono text-indigo-900">
                          {p.invoiceNumber}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {p.supplierName}
                        </td>
                        <td className="p-3 max-w-xs truncate text-slate-600" title={(p.items || []).map(i => `${i.name} (${i.quantity})`).join(', ')}>
                          {(p.items || []).map(i => `${i.name} (${i.quantity})`).join(', ')}
                        </td>
                        <td className="p-3 font-bold text-slate-700 font-mono">
                          {formatIQD(p.itemsTotalAmount || p.totalAmount)} د.ع
                        </td>
                        <td className="p-3 font-bold text-blue-700 font-mono">
                          {Number(p.shippingCost) > 0 ? `+ ${formatIQD(p.shippingCost)} د.ع` : '—'}
                        </td>
                        <td className="p-3 font-black text-slate-900 font-mono text-sm">
                          {formatIQD(p.totalAmount)} د.ع
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' :
                            isDebt ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {isPaid ? 'مدفوعة نقداً' : isDebt ? 'دين كامل' : `مسدد: ${formatIQD(p.paidAmount)}`}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {p.invoiceImageUrl ? (
                            <button
                              onClick={() => setViewingAttachment({
                                url: p.invoiceImageUrl,
                                type: hasPdf ? 'pdf' : 'image',
                                title: `فاتورة ${p.invoiceNumber} - ${p.supplierName}`
                              })}
                              className={`text-xs font-bold underline flex items-center justify-center gap-1 mx-auto cursor-pointer px-2 py-1 rounded-lg ${
                                hasPdf
                                  ? 'text-red-700 bg-red-50 hover:bg-red-100'
                                  : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                              }`}
                            >
                              <span>{hasPdf ? '📑' : '📷'}</span>
                              <span>{hasPdf ? 'ملف PDF' : 'صورة'}</span>
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditPurchaseInvoice(p)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                              title="تعديل فاتورة الشراء وتصحيح النقل أو المواد"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                confirm(
                                  'حذف فاتورة الشراء واسترجاع المخزون',
                                  `هل أنت متأكد من حذف فاتورة "${p.invoiceNumber}"؟ سيتم خصم الكميات الموردة تلقائياً من رصيد المواد بالمحل/المخزن وإرجاعها كما كانت قبل الشراء.`,
                                  async () => {
                                    try {
                                      await deletePurchaseInvoice(p.id, user?.displayName || user?.email?.split('@')[0] || 'المسؤول');
                                      toast('تم حذف الفاتورة واسترجاع كميات المخزون بنجاح! 🔄', 'success');
                                    } catch (err) {
                                      toast(`فشل حذف الفاتورة: ${err.message}`, 'error');
                                    }
                                  }
                                );
                              }}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                              title="حذف الفاتورة واسترجاع المخزون"
                            >
                              🗑️
                            </button>
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
      )}

      {/* ---------------------------------------------------- */}
      {/* NEW PRODUCT QUICK MODAL */}
      {/* ---------------------------------------------------- */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>➕</span>
                <span>إضافة صنف جديد كلياً إلى الفاتورة والمخزن</span>
              </h3>
              <button onClick={() => setShowNewProductModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewProductModal} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المادة / الكاميرا *</label>
                <input
                  type="text"
                  required
                  value={newProdForm.name}
                  onChange={(e) => setNewProdForm({ ...newProdForm, name: e.target.value })}
                  placeholder="مثال: كاميرا داهوا 5MP خارجية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">القسم / التصنيف</label>
                  <select
                    value={newProdForm.cameraType}
                    onChange={(e) => setNewProdForm({ ...newProdForm, cameraType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مكان الإيداع</label>
                  <select
                    value={newProdForm.location}
                    onChange={(e) => setNewProdForm({ ...newProdForm, location: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="store">🏪 المحل</option>
                    <option value="warehouse">🏢 المخزن</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المشتراة</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newProdForm.quantity}
                    onChange={(e) => setNewProdForm({ ...newProdForm, quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر الشراء (التكلفة)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdForm.costPrice}
                    onChange={(e) => setNewProdForm({ ...newProdForm, costPrice: e.target.value })}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سعر البيع (المفرد)</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdForm.retailPrice}
                    onChange={(e) => setNewProdForm({ ...newProdForm, retailPrice: e.target.value })}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-5 rounded-xl cursor-pointer"
                >
                  إضافة للفاتورة والمخزن ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* DEBT PAYMENT MODAL */}
      {/* ---------------------------------------------------- */}
      {showPaymentModal && selectedSupplierForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-5 bg-emerald-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">تسديد دفعة للمورد</h3>
                <p className="text-xs text-emerald-200 mt-0.5">{selectedSupplierForPayment.supplierName}</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-emerald-200 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-600 font-bold">إجمالي الدين المتبقي:</span>
                <span className="text-base font-black text-rose-700 font-mono">
                  {formatIQD(selectedSupplierForPayment.remainingDebt)} د.ع
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">مبلغ السداد (د.ع) *</label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedSupplierForPayment.remainingDebt)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  >
                    سداد الدين كاملاً
                  </button>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedSupplierForPayment.remainingDebt}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="نقدي">نقدي (كاش)</option>
                  <option value="حوالة / صيرفة">حوالة / صيرفة</option>
                  <option value="زين كاش / مصرفي">زين كاش / مصرفي</option>
                  <option value="صك">صك</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات السداد (اختياري)</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="مثال: دفعة عن فاتورة الأسبوع الماضي..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md cursor-pointer"
                >
                  {submittingPayment ? 'جاري السداد...' : 'تأكيد السداد 💵'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* ATTACHMENT VIEWER MODAL (IMAGES & PDF) */}
      {/* ---------------------------------------------------- */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" dir="rtl">
          <div className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">{viewingAttachment.type === 'pdf' ? '📑' : '📷'}</span>
                <span className="text-xs font-bold truncate">{viewingAttachment.title || 'معاينة المرفق'}</span>
              </div>

              <div className="flex items-center gap-3">
                {viewingAttachment.type === 'pdf' && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobUrl = getPdfBlobUrl(viewingAttachment.url);
                      window.open(blobUrl, '_blank');
                    }}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>↗️</span>
                    <span>فتح في نافذة كاملة</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingAttachment(null)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex items-center justify-center max-h-[85vh] overflow-auto">
              {viewingAttachment.type === 'pdf' ? (
                <iframe
                  src={getPdfBlobUrl(viewingAttachment.url)}
                  title="PDF Attachment Viewer"
                  className="w-full h-[75vh] rounded-xl bg-white border border-slate-700 shadow-inner"
                />
              ) : (
                <img
                  src={viewingAttachment.url}
                  alt="Invoice Attachment"
                  className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
