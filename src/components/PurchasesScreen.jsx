import React, { useState, useMemo } from 'react';
import { usePurchases } from '../hooks/usePurchases';
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  recordSupplierDebtPayment,
  recordSupplierOpeningDebt,
  deletePurchaseInvoice,
  saveDraftPurchase,
  deleteDraftPurchase,
  syncInvoicePricesToInventory,
} from '../services/purchasesService';
import { compressImageToSafeDataUrl } from '../services/storageService';
import { useUI } from '../contexts/UIContext';

// Modular Subcomponents
import SupplierCardsGrid from './purchases/SupplierCardsGrid';
import SupplierDetailsDrawer from './purchases/SupplierDetailsDrawer';
import PurchaseInvoiceDetailsModal from './purchases/PurchaseInvoiceDetailsModal';
import PurchaseRegisterScreen from './purchases/PurchaseRegisterScreen';
import PurchasesDraftsTab from './purchases/PurchasesDraftsTab';
import PurchasesArchiveTab from './purchases/PurchasesArchiveTab';
import DebtPaymentsTab from './purchases/DebtPaymentsTab';
import DebtPaymentModal from './purchases/DebtPaymentModal';
import OpeningDebtModal from './purchases/OpeningDebtModal';

/** Convert base64 PDF Data URL to a Blob Object URL */
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

export default function PurchasesScreen({ products = [], user }) {
  const {
    purchases = [],
    draftPurchases = [],
    supplierDebts = [],
    debtPayments = [],
    suppliers = [],
    stats = {},
    loading,
  } = usePurchases();

  const { toast, confirm } = useUI();

  // Active View: 'suppliers' (default) | 'register' | 'drafts' | 'archive' | 'payments'
  const [activeView, setActiveView] = useState('suppliers');

  // Drawer & Modals State
  const [selectedSupplierForDrawer, setSelectedSupplierForDrawer] = useState(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState('debts'); // 'debts' | 'payments' | 'all'

  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState(null);
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState(null);
  const [showOpeningDebtModal, setShowOpeningDebtModal] = useState(false);

  // Form State for Purchase Register Screen
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [savingOpeningDebt, setSavingOpeningDebt] = useState(false);

  // Attachment Viewer Modal (Unified for Images & PDF)
  const [viewingAttachment, setViewingAttachment] = useState(null); // { url, type: 'image'|'pdf', title }

  // Known Suppliers List
  const knownSuppliers = useMemo(() => {
    const map = new Map();
    (suppliers || []).forEach((s) => {
      if (s.name) map.set(s.name.trim().toLowerCase(), { name: s.name.trim(), phone: s.phone || '' });
    });
    (supplierDebts || []).forEach((s) => {
      if (s.supplierName) {
        const key = s.supplierName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: s.supplierName.trim(), phone: s.supplierPhone || '' });
        }
      }
    });
    (purchases || []).forEach((p) => {
      if (p.supplierName) {
        const key = p.supplierName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: p.supplierName.trim(), phone: p.supplierPhone || '' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [suppliers, supplierDebts, purchases]);

  // Handler: Select Supplier from Cards Grid
  const handleSelectSupplierFromGrid = (supplier, tab = 'debts', openPayment = false) => {
    setSelectedSupplierForDrawer(supplier);
    setDrawerInitialTab(tab);
    if (openPayment) {
      setSelectedSupplierForPayment(supplier);
    }
  };

  // Handler: Start New Purchase Invoice
  const handleOpenRegisterNew = () => {
    setEditingInvoice(null);
    setCurrentDraftId(null);
    setActiveView('register');
  };

  // Handler: Edit Existing Invoice
  const handleEditInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setCurrentDraftId(null);
    setSelectedInvoiceForModal(null);
    setActiveView('register');
  };

  // Handler: Load Draft into Register Screen
  const handleLoadDraft = (draft) => {
    setEditingInvoice(draft);
    setCurrentDraftId(draft.id);
    setActiveView('register');
  };

  // Handler: Delete Draft
  const handleDeleteDraft = (draftId, supplier) => {
    confirm(
      'حذف المسودة',
      `هل أنت متأكد من حذف مسودة الشراء للمورد "${supplier || 'المسودة'}"؟`,
      async () => {
        try {
          await deleteDraftPurchase(draftId);
          if (currentDraftId === draftId) {
            setEditingInvoice(null);
            setCurrentDraftId(null);
          }
          toast('تم حذف مسودة الشراء بنجاح 🗑️', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    );
  };

  // Handler: Delete Purchase Invoice (with inventory reversal)
  const handleDeletePurchaseInvoice = (invoice) => {
    confirm(
      'حذف فاتورة الشراء واسترجاع المخزون',
      `هل أنت متأكد من حذف فاتورة "${invoice.invoiceNumber || ''}" للمورد "${invoice.supplierName}"؟ سيتم خصم الكميات الموردة تلقائياً من رصيد المواد بالمحل/المخزن وإرجاعها كما كانت قبل الشراء.`,
      async () => {
        try {
          await deletePurchaseInvoice(
            invoice.id,
            user?.displayName || user?.email?.split('@')[0] || 'المسؤول'
          );
          setSelectedInvoiceForModal(null);
          toast('تم حذف الفاتورة واسترجاع كميات المخزون بنجاح! 🔄', 'success');
        } catch (err) {
          toast(`فشل حذف الفاتورة: ${err.message}`, 'error');
        }
      }
    );
  };

  // Handler: Save / Submit Purchase Invoice
  const handleSaveInvoice = async (invoiceData) => {
    setSavingInvoice(true);
    try {
      // Ensure attachment data URL is strictly safe for Firestore document size limits
      let safeInvoiceData = { ...invoiceData };
      if (safeInvoiceData.invoiceImageUrl && typeof safeInvoiceData.invoiceImageUrl === 'string') {
        if (safeInvoiceData.invoiceImageUrl.startsWith('data:image/') && safeInvoiceData.invoiceImageUrl.length > 650000) {
          safeInvoiceData.invoiceImageUrl = await compressImageToSafeDataUrl(safeInvoiceData.invoiceImageUrl);
        } else if (safeInvoiceData.invoiceImageUrl.startsWith('data:application/pdf') && safeInvoiceData.invoiceImageUrl.length > 1000000) {
          throw new Error('حجم ملف الـ PDF المرفق يتجاوز الحد الأقصى المسموح به (1 ميجابايت). يرجى إزالة المرفق أو تصوير الفاتورة بالكاميرا كصورة.');
        }
      }

      if (editingInvoice && !currentDraftId && editingInvoice.id) {
        // Compare items between editingInvoice and safeInvoiceData
        const oldItems = editingInvoice.items || [];
        const currentItems = safeInvoiceData.items || [];

        const addedItems = currentItems.filter(
          (ci) =>
            !oldItems.some(
              (oi) =>
                (ci.productId && oi.productId && ci.productId === oi.productId) ||
                (ci.name && oi.name && ci.name.trim().toLowerCase() === oi.name.trim().toLowerCase())
            )
        );

        const increasedItems = currentItems
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

        // Update existing invoice
        await updatePurchaseInvoice(editingInvoice.id, {
          ...safeInvoiceData,
          updatedBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
        });

        if (addedItems.length > 0 || increasedItems.length > 0) {
          const details = [];
          if (addedItems.length > 0) {
            details.push(
              `مواد جديدة: ${addedItems.map((i) => `"${i.name}" (${i.quantity} قطعة)`).join('، ')}`
            );
          }
          if (increasedItems.length > 0) {
            details.push(
              `زيادة كميات: ${increasedItems.map((i) => `"${i.name}" (+${i.diff} قطعة إضافية)`).join('، ')}`
            );
          }
          toast(
            `✅ تم تأكيد التعديل بنجاح! تمت إضافة: ${details.join(' | ')} إلى الفاتورة وتوريدها للمخزون 📦✨`,
            'success'
          );
        } else {
          toast(`✅ تم تأكيد التعديل وتحديث فاتورة الشراء (${safeInvoiceData.invoiceNumber}) بنجاح! 💾✨`, 'success');
        }
      } else {
        // Create new purchase invoice
        await createPurchaseInvoice({
          ...safeInvoiceData,
          createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
          draftId: currentDraftId,
        });
        const pieces = (safeInvoiceData.items || []).reduce((s, i) => s + (Number(i.quantity) || 1), 0);
        toast(`تم تسجيل فاتورة الشراء وتوريد (${pieces}) قطعة إلى المخزون بنجاح! 📦🎉`, 'success');
      }

      setEditingInvoice(null);
      setCurrentDraftId(null);
      setActiveView('suppliers');
    } catch (err) {
      console.error(err);
      toast(`فشل حفظ الفاتورة: ${err.message}`, 'error');
    } finally {
      setSavingInvoice(false);
    }
  };

  // Handler: Save Draft
  const handleSaveDraft = async (draftData) => {
    setSavingDraft(true);
    try {
      let safeDraftData = { ...draftData };
      if (safeDraftData.invoiceImageUrl && typeof safeDraftData.invoiceImageUrl === 'string') {
        if (safeDraftData.invoiceImageUrl.startsWith('data:image/') && safeDraftData.invoiceImageUrl.length > 650000) {
          safeDraftData.invoiceImageUrl = await compressImageToSafeDataUrl(safeDraftData.invoiceImageUrl);
        } else if (safeDraftData.invoiceImageUrl.startsWith('data:application/pdf') && safeDraftData.invoiceImageUrl.length > 1000000) {
          throw new Error('حجم ملف الـ PDF المرفق يتجاوز الحد الأقصى المسموح به (1 ميجابايت).');
        }
      }

      const savedId = await saveDraftPurchase({
        draftId: currentDraftId,
        ...safeDraftData,
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
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

  // Handler: Submit Debt Payment
  const handleSubmitPayment = async (payData) => {
    setSubmittingPayment(true);
    try {
      await recordSupplierDebtPayment({
        ...payData,
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
      });
      toast(`تم تسجيل تسديد الدفعة للمورد (${payData.supplierName}) بنجاح! 💵✨`, 'success');
      setSelectedSupplierForPayment(null);
    } catch (err) {
      toast(`فشل تسديد الدفعة: ${err.message}`, 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handler: Submit Opening Debt
  const handleSubmitOpeningDebt = async (openingData) => {
    setSavingOpeningDebt(true);
    try {
      let safeOpeningData = { ...openingData };
      if (safeOpeningData.imageUrl && typeof safeOpeningData.imageUrl === 'string') {
        if (safeOpeningData.imageUrl.startsWith('data:image/') && safeOpeningData.imageUrl.length > 650000) {
          safeOpeningData.imageUrl = await compressImageToSafeDataUrl(safeOpeningData.imageUrl);
        } else if (safeOpeningData.imageUrl.startsWith('data:application/pdf') && safeOpeningData.imageUrl.length > 1000000) {
          throw new Error('حجم ملف الـ PDF المرفق يتجاوز الحد الأقصى المسموح به (1 ميجابايت).');
        }
      }

      await recordSupplierOpeningDebt({
        ...safeOpeningData,
        invoiceImageUrl: safeOpeningData.imageUrl || safeOpeningData.invoiceImageUrl,
        createdBy: user?.displayName || user?.email?.split('@')[0] || 'المسؤول',
      });
      toast(`تم تسجيل الدين السابق للمورد (${openingData.supplierName}) بنجاح! 📑✨`, 'success');
      setShowOpeningDebtModal(false);
    } catch (err) {
      toast(`فشل تسجيل الدين السابق: ${err.message}`, 'error');
    } finally {
      setSavingOpeningDebt(false);
    }
  };

  // Handler: Sync Invoice Wholesale Prices to Products in Inventory
  const handleSyncPricesToInventory = async (invoice) => {
    try {
      const updatedItems = await syncInvoicePricesToInventory(invoice);
      if (updatedItems.length > 0) {
        toast(`✅ تم تحديث أسعار الجملة في المخزون لـ (${updatedItems.length}) مادة بنجاح! 🏷️✨`, 'success');
      } else {
        toast('لم يتم العثور على مواد لتحديث أسعارها', 'info');
      }
    } catch (err) {
      console.error(err);
      toast(`فشل تحديث أسعار الجملة: ${err.message}`, 'error');
    }
  };

  // If in Register Full Screen mode
  if (activeView === 'register') {
    return (
      <PurchaseRegisterScreen
        user={user}
        products={products}
        knownSuppliers={knownSuppliers}
        draftPurchases={draftPurchases}
        editingInvoice={editingInvoice}
        currentDraftId={currentDraftId}
        onBack={() => {
          setEditingInvoice(null);
          setCurrentDraftId(null);
          setActiveView('suppliers');
        }}
        onSaveInvoice={handleSaveInvoice}
        onSaveDraft={handleSaveDraft}
        onOpenDraftsModal={() => setActiveView('drafts')}
        onViewAttachment={(att) => setViewingAttachment(att)}
        savingInvoice={savingInvoice}
        savingDraft={savingDraft}
      />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Navigation Sub-Tabs bar if not in suppliers view */}
      {activeView !== 'suppliers' && (
        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('suppliers')}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>←</span>
              <span>الموردون</span>
            </button>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-black text-slate-900">
              {activeView === 'drafts'
                ? 'المسودات'
                : activeView === 'archive'
                ? 'أرشيف الفواتير'
                : 'التسديدات'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveView('drafts')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeView === 'drafts'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              المسودات ({draftPurchases.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveView('archive')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeView === 'archive'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              الأرشيف ({purchases.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveView('payments')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeView === 'payments'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              التسديدات ({debtPayments.length})
            </button>
          </div>
        </div>
      )}

      {/* 1. Suppliers Grid (Default Main View) */}
      {activeView === 'suppliers' && (
        <SupplierCardsGrid
          supplierDebts={supplierDebts}
          purchases={purchases}
          debtPayments={debtPayments}
          draftPurchases={draftPurchases}
          stats={stats}
          onSelectSupplier={handleSelectSupplierFromGrid}
          onOpenRegisterScreen={handleOpenRegisterNew}
          onOpenOpeningDebtModal={() => setShowOpeningDebtModal(true)}
          onSwitchTab={(tab) => setActiveView(tab)}
          onSelectInvoice={(inv) => setSelectedInvoiceForModal(inv)}
          onEditInvoice={handleEditInvoice}
          onDeleteInvoice={handleDeletePurchaseInvoice}
        />
      )}

      {/* 2. Drafts Tab */}
      {activeView === 'drafts' && (
        <PurchasesDraftsTab
          draftPurchases={draftPurchases}
          onLoadDraft={handleLoadDraft}
          onDeleteDraft={handleDeleteDraft}
          onNewInvoice={handleOpenRegisterNew}
        />
      )}

      {/* 3. Archive Tab */}
      {activeView === 'archive' && (
        <PurchasesArchiveTab
          purchases={purchases}
          supplierDebts={supplierDebts}
          onSelectInvoice={(inv) => setSelectedInvoiceForModal(inv)}
          onEditInvoice={handleEditInvoice}
          onDeleteInvoice={handleDeletePurchaseInvoice}
          onNewInvoice={handleOpenRegisterNew}
        />
      )}

      {/* 4. Payments Tab */}
      {activeView === 'payments' && (
        <DebtPaymentsTab
          debtPayments={debtPayments}
          onOpenPaymentModal={(supplier) => setSelectedSupplierForPayment(supplier)}
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* MODALS & DRAWERS */}
      {/* ---------------------------------------------------- */}

      {/* Supplier Details Drawer (Debts / Payments / Statement) */}
      <SupplierDetailsDrawer
        isOpen={Boolean(selectedSupplierForDrawer)}
        onClose={() => setSelectedSupplierForDrawer(null)}
        supplier={selectedSupplierForDrawer}
        initialTab={drawerInitialTab}
        purchases={purchases}
        debtPayments={debtPayments}
        onSelectInvoice={(inv) => setSelectedInvoiceForModal(inv)}
        onOpenPayment={(s) => setSelectedSupplierForPayment(s)}
      />

      {/* Purchase Invoice Details Modal */}
      <PurchaseInvoiceDetailsModal
        isOpen={Boolean(selectedInvoiceForModal)}
        onClose={() => setSelectedInvoiceForModal(null)}
        invoice={selectedInvoiceForModal}
        supplierDebts={supplierDebts}
        allPurchases={purchases}
        onEditInvoice={handleEditInvoice}
        onDeleteInvoice={handleDeletePurchaseInvoice}
        onPayDebt={(s) => setSelectedSupplierForPayment(s)}
        onViewAttachment={(att) => setViewingAttachment(att)}
        onSyncPricesToInventory={handleSyncPricesToInventory}
      />

      {/* Debt Payment Modal */}
      <DebtPaymentModal
        isOpen={Boolean(selectedSupplierForPayment)}
        onClose={() => setSelectedSupplierForPayment(null)}
        supplier={selectedSupplierForPayment}
        onSubmitPayment={handleSubmitPayment}
        submitting={submittingPayment}
      />

      {/* Opening Debt Modal */}
      <OpeningDebtModal
        isOpen={showOpeningDebtModal}
        onClose={() => setShowOpeningDebtModal(false)}
        knownSuppliers={knownSuppliers}
        onSubmitOpeningDebt={handleSubmitOpeningDebt}
        submitting={savingOpeningDebt}
        onViewAttachment={(att) => setViewingAttachment(att)}
      />

      {/* Attachment Viewer Modal (Images & PDF) */}
      {viewingAttachment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          dir="rtl"
        >
          <div className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {viewingAttachment.type === 'pdf' ? '📑' : '📷'}
                </span>
                <span className="text-xs font-bold truncate">
                  {viewingAttachment.title || 'معاينة المرفق'}
                </span>
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
