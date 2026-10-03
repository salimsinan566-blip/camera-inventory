import React, { useMemo, useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useDraftSales } from '../hooks/useDraftSales';
import { deleteProduct } from '../services/productsService';
import { getStockStatus } from '../models/product';
import ProductList from './ProductList';
import ProductForm from './ProductForm';
import ConfirmDialog from './ConfirmDialog';
import ImportExcel from './ImportExcel';
import ProductFilters, { DEFAULT_FILTERS, applyFilters } from './ProductFilters';
import StockAlertBanner from './StockAlertBanner';
import StatsDashboard from './StatsDashboard';
import BarcodeLabel from './BarcodeLabel';
import HomeLauncher from './HomeLauncher';
import TopNav from './TopNav';
import UserAccountCard from './UserAccountCard';
import { NAVIGATION_SECTIONS } from '../config/navigation';
import { useTrashBin } from '../hooks/useTrashBin';
import TransferStock from './TransferStock';
import POSScreen from './POSScreen';
import OffersScreen from './OffersScreen';
import PurchasesScreen from './PurchasesScreen';
import ExpensesScreen from './ExpensesScreen';
import SalariesScreen from './SalariesScreen';
import SalesReports from './SalesReports';
import CustomersScreen from './CustomersScreen';
import HomeDashboard from './HomeDashboard';
import SettingsScreen from './SettingsScreen';
import UserGuideScreen from './UserGuideScreen';
import TrashBinScreen from './TrashBinScreen';
import ProductHistoryModal from './ProductHistoryModal';
import InventoryHistoryView from './InventoryHistoryView';
import { useCustody } from '../hooks/useCustody';
import { generateBarcodeForProduct } from '../services/barcodeService';
import { logout } from '../firebase/auth';
import { getDisplayName } from '../utils/userUtils';
import { useSettings } from '../hooks/useSettings';
import { useAutoDebtScheduler } from '../hooks/useAutoDebtScheduler';
import logo from '../assets/logo.png';
import { useUI } from '../contexts/UIContext';
import { updateStoreSettings } from '../services/settingsService';
import NetworkStatusIndicator from './NetworkStatusIndicator';

export default function Dashboard({ user }) {
  // Automated background WhatsApp debt reminder scheduler
  useAutoDebtScheduler();

  const { products, loading, error } = useProducts();
  const { drafts: draftSales } = useDraftSales();
  const { custodies, technicians } = useCustody();
  const { settings } = useSettings();
  const { toast } = useUI();
  const { count: trashCount } = useTrashBin();

  // Active section tab: null indicates Home Launcher screen
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      return tabParam || null;
    } catch (e) {
      return null;
    }
  });

  // Navigation function with browser history support
  const navigateToTab = (tabId) => {
    try {
      const url = new URL(window.location);
      if (!tabId || tabId === 'launcher') {
        url.searchParams.delete('tab');
        window.history.pushState({ tab: null }, '', url.pathname + (url.search ? url.search : ''));
        setActiveTab(null);
      } else {
        if (tabId === 'pos') setPosMode('sale');
        url.searchParams.set('tab', tabId);
        window.history.pushState({ tab: tabId }, '', url.toString());
        setActiveTab(tabId);
      }
    } catch (e) {
      setActiveTab(tabId || null);
    }
  };

  // Sync with browser back/forward buttons (popstate)
  React.useEffect(() => {
    function handlePopState() {
      try {
        const params = new URLSearchParams(window.location.search);
        setActiveTab(params.get('tab') || null);
      } catch (e) {
        setActiveTab(null);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [inventorySubTab, setInventorySubTab] = useState('products'); // 'products' | 'history'
  const [posMode, setPosMode] = useState('sale'); // 'sale' | 'offer'
  const [draftToOpen, setDraftToOpen] = useState(null);
  const [offerToOpen, setOfferToOpen] = useState(null);
  const [custodyTechToOpen, setCustodyTechToOpen] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null); // null = مغلق، {} = إضافة جديد
  const [historyProduct, setHistoryProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [generatingBarcodeId, setGeneratingBarcodeId] = useState(null);
  const [printingProduct, setPrintingProduct] = useState(null);
  const [transferProduct, setTransferProduct] = useState(null);
  const [barcodeError, setBarcodeError] = useState('');

  // Map product ID to vehicle custody quantities and technician breakdown
  const productCustodyMap = useMemo(() => {
    const map = {};
    Object.entries(custodies || {}).forEach(([techId, custDoc]) => {
      const techName = custDoc.technicianName || 'فني';
      (custDoc.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        if (qty > 0 && item.productId) {
          if (!map[item.productId]) {
            map[item.productId] = { totalQty: 0, breakdown: [] };
          }
          map[item.productId].totalQty += qty;
          map[item.productId].breakdown.push({ techName, qty });
        }
      });
    });
    return map;
  }, [custodies]);

  const filteredProducts = useMemo(
    () => applyFilters(products, filters, getStockStatus, productCustodyMap),
    [products, filters, productCustodyMap]
  );

  const currentSection = useMemo(() => {
    if (!activeTab) return null;
    return (
      NAVIGATION_SECTIONS.find(
        (s) => s.id === activeTab || (s.id === 'dashboard' && activeTab === 'home')
      ) || { id: activeTab, label: activeTab }
    );
  }, [activeTab]);

  React.useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+S: Open POS (Prevent save page dialog)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        navigateToTab('pos');
      }
      
      // Alt+1: Home Launcher
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        navigateToTab(null);
      }
      // Alt+2: POS
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        setPosMode('sale');
        navigateToTab('pos');
      }
      // Alt+3: Inventory
      if (e.altKey && e.key === '3') {
        e.preventDefault();
        navigateToTab('inventory');
      }
      // Alt+4: Reports
      if (e.altKey && e.key === '4') {
        e.preventDefault();
        navigateToTab('reports');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddCategory = async () => {
    const newCategory = window.prompt('أدخل اسم القسم الجديد:');
    if (!newCategory) return;
    const cat = newCategory.trim();
    if (cat) {
      const currentCategories = settings?.categories || [];
      if (!currentCategories.includes(cat)) {
        try {
          await updateStoreSettings({ ...settings, categories: [...currentCategories, cat] });
          toast('تمت إضافة القسم بنجاح!', 'success');
        } catch (err) {
          toast(`خطأ في الإضافة: ${err.message}`, 'error');
        }
      } else {
        toast('القسم موجود مسبقاً!', 'error');
      }
    }
  };

  async function handleGenerateBarcode(product) {
    setBarcodeError('');
    setGeneratingBarcodeId(product.id);
    try {
      await generateBarcodeForProduct(product.id);
    } catch (err) {
      setBarcodeError(`فشل توليد الباركود: ${err.message}`);
    } finally {
      setGeneratingBarcodeId(null);
    }
  }

  function openAddForm() {
    setEditingProduct(null);
    setShowForm(true);
  }

  function openEditForm(product) {
    setEditingProduct(product);
    setShowForm(true);
  }

  function incrementSku(sku) {
    if (!sku) return '';
    // نبحث عن الأرقام في نهاية النص
    const match = sku.match(/(\d+)$/);
    if (match) {
      const numStr = match[1];
      const nextNum = parseInt(numStr, 10) + 1;
      // نحافظ على الأصفار التي في البداية (مثل 001 -> 002)
      const paddedNum = nextNum.toString().padStart(numStr.length, '0');
      return sku.slice(0, -numStr.length) + paddedNum;
    }
    // إذا لم يكن هناك رقم في النهاية، نضيف -1
    return sku + '-1';
  }

  function handleDuplicateProduct(product) {
    const copiedProduct = {
      ...product,
      name: `${product.name} (نسخة)`,
      sku: incrementSku(product.sku),
      barcode: '', // الباركود يجب أن يكون فريداً
    };
    delete copiedProduct.id;
    setEditingProduct(copiedProduct);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProduct(null);
  }

  async function confirmDelete() {
    try {
      await deleteProduct(productToDelete.id);
      setProductToDelete(null);
    } catch (err) {
      setDeleteError(`فشل الحذف: ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col w-full text-slate-800" dir="rtl">
      {!activeTab ? (
        /* الشاشة الرئيسية الجديدة (Launcher) */
        <HomeLauncher
          onSelectTab={navigateToTab}
          settings={settings}
          trashCount={trashCount}
        />
      ) : (
        /* شاشة الأقسام الداخلية بعرض كامل وشريط علوي */
        <div className="flex-1 flex flex-col min-h-screen w-full">
          <TopNav
            activeSection={currentSection}
            onBack={() => navigateToTab(null)}
            storeName={settings?.storeName}
            logoUrl={settings?.logoUrl}
          />

          <main className={`flex-1 overflow-y-auto w-full ${activeTab === 'pos' ? 'p-2 md:p-4 pb-24' : 'p-3 md:p-8 pb-24'}`}>
            <div className="max-w-7xl mx-auto h-full">
              <div className={activeTab === 'dashboard' || activeTab === 'home' ? 'block h-full' : 'hidden'}>
                <HomeDashboard
                  products={products}
                  productsLoading={loading}
                  onGoToInventory={(status) => {
                    setFilters((prev) => ({ ...prev, stockStatus: status }));
                    navigateToTab('inventory');
                  }}
                  onOpenGuide={() => navigateToTab('guide')}
                  onOpenDraft={(draft) => {
                    setDraftToOpen(draft);
                    navigateToTab('pos');
                  }}
                />
              </div>

        <div className={activeTab === 'pos' ? 'block h-full' : 'hidden'}>
          <POSScreen
            mode={posMode}
            products={products}
            cashierEmail={getDisplayName(user)}
            draftToOpen={draftToOpen}
            onDraftOpened={() => setDraftToOpen(null)}
            offerToOpen={offerToOpen}
            onOfferOpened={() => setOfferToOpen(null)}
            custodyTechToOpen={custodyTechToOpen}
            onCustodyTechOpened={() => setCustodyTechToOpen(null)}
            onCloseOfferMode={() => navigateToTab('offers')}
          />
        </div>

        <div className={activeTab === 'offers' ? 'block h-full' : 'hidden'}>
          <OffersScreen 
            onCreateOffer={() => {
              setPosMode('offer');
              navigateToTab('pos');
            }}
            onEditOffer={(offer) => {
              setOfferToOpen(offer);
              setPosMode('offer');
              navigateToTab('pos');
            }}
            onConvertOfferToSale={(offer) => {
              // Load it as a draft in sale mode
              setDraftToOpen(offer);
              setPosMode('sale');
              navigateToTab('pos');
            }}
          />
        </div>

        <div className={activeTab === 'purchases' ? 'block h-full' : 'hidden'}>
          <PurchasesScreen products={products} user={user} />
        </div>

        <div className={activeTab === 'expenses' ? 'block h-full' : 'hidden'}>
          <ExpensesScreen user={user} />
        </div>

        <div className={activeTab === 'salaries' ? 'block h-full' : 'hidden'}>
          <SalariesScreen />
        </div>

        <div className={activeTab === 'reports' ? 'block h-full' : 'hidden'}>
          <SalesReports
            onOpenDraft={(draft) => {
              setDraftToOpen(draft);
              setPosMode('sale');
              navigateToTab('pos');
            }}
          />
        </div>

        <div className={activeTab === 'customers' ? 'block h-full' : 'hidden'}>
          <CustomersScreen />
        </div>

        <div className={activeTab === 'trash' ? 'block h-full' : 'hidden'}>
          <TrashBinScreen currentUser={user} />
        </div>

        <div className={activeTab === 'settings' ? 'block h-full' : 'hidden'}>
          <SettingsScreen />
        </div>

        <div className={activeTab === 'guide' ? 'block h-full' : 'hidden'}>
          <UserGuideScreen
            onNavigate={(tab) => {
              if (tab === 'pos') setPosMode('sale');
              navigateToTab(tab);
            }}
          />
        </div>

        <div className={activeTab === 'inventory' ? 'block h-full' : 'hidden'}>
            <>
              {/* Inventory Header & Actions Toolbar - موحد بالكامل بدون أي فراغ */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 bg-white border border-slate-200 p-2 sm:p-2.5 rounded-xl shadow-2xs">
                {/* 1. التبويبات: قائمة المنتجات / سجل الحركات */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setInventorySubTab('products')}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      inventorySubTab === 'products'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>قائمة المنتجات</span>
                  </button>
                  <button
                    onClick={() => setInventorySubTab('history')}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      inventorySubTab === 'history'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>سجل الحركات</span>
                  </button>
                </div>

                {/* 2. الإجراءات والتنبيهات المدمجة عند اختيار المنتجات */}
                {inventorySubTab === 'products' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {!loading && !error && (
                      <StatsDashboard 
                        products={products} 
                        filteredProducts={filteredProducts} 
                        sortBy={filters.sortBy} 
                        draftSales={draftSales}
                        productCustodyMap={productCustodyMap}
                        custodies={custodies}
                        technicians={technicians}
                        onFilterByStatus={(status) => setFilters((prev) => ({
                          ...prev,
                          stockStatus: prev.stockStatus === status ? 'all' : status
                        }))}
                        activeStockStatus={filters.stockStatus}
                      />
                    )}

                    <div className="h-5 w-px bg-slate-200 mx-0.5 hidden sm:block" />

                    <button 
                      onClick={() => setShowImport(true)} 
                      className="px-2.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 font-bold hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="استيراد وتحديث المنتجات من Excel"
                    >
                      استيراد Excel
                    </button>
                    <button 
                      onClick={handleAddCategory} 
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition-colors border border-slate-200 cursor-pointer"
                    >
                      + إضافة قسم
                    </button>
                    <button 
                      onClick={openAddForm} 
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-lg shadow-2xs cursor-pointer transition-colors active:scale-95 flex items-center gap-1"
                    >
                      <span>+</span>
                      <span>إضافة منتج</span>
                    </button>
                  </div>
                )}
              </div>

              {deleteError && (
                <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded-xl p-3 mb-4">
                  {deleteError}
                </div>
              )}

              {/* Subtab: Products */}
              {inventorySubTab === 'products' && (
                <>
                  {!loading && !error && <ProductFilters filters={filters} onChange={setFilters} products={products} />}

                  {loading && <p className="text-ink-500 text-center py-16">جارٍ تحميل المنتجات...</p>}

                  {error && (
                    <p className="text-danger-700 text-center py-16">فشل تحميل المنتجات: {error}</p>
                  )}

                  {barcodeError && (
                    <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded-xl p-3 mb-4">
                      {barcodeError}
                    </div>
                  )}

                  {!loading && !error && (
                    <>
                      <p className="text-xs text-ink-500 mb-2">
                        عرض {filteredProducts.length} من {products.length} منتج
                      </p>
                      <ProductList
                        products={filteredProducts}
                        draftSales={draftSales}
                        productCustodyMap={productCustodyMap}
                        sortBy={filters.sortBy}
                        onSortChange={(newSort) => setFilters((prev) => ({ ...prev, sortBy: newSort }))}
                        onEdit={openEditForm}
                        onDuplicate={handleDuplicateProduct}
                        onDelete={setProductToDelete}
                        onGenerateBarcode={handleGenerateBarcode}
                        onPrintBarcode={setPrintingProduct}
                        onTransfer={setTransferProduct}
                        onHistory={setHistoryProduct}
                        generatingId={generatingBarcodeId}
                      />
                    </>
                  )}
                </>
              )}

              {/* Subtab: Global Inventory History View */}
              {inventorySubTab === 'history' && (
                <InventoryHistoryView onOpenProductHistory={setHistoryProduct} />
              )}
            </>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* بطاقة الحساب تظهر فقط في الشاشة الرئيسية لتفادي حجب أزرار العمليات في نقطة البيع */}
      {!activeTab && <UserAccountCard user={user} onLogout={logout} />}

      {showForm && <ProductForm product={editingProduct} products={products} onClose={closeForm} />}

      {showImport && <ImportExcel onClose={() => setShowImport(false)} />}

      {printingProduct && (
        <BarcodeLabel product={printingProduct} onClose={() => setPrintingProduct(null)} />
      )}

      {transferProduct && (
        <TransferStock product={transferProduct} onClose={() => setTransferProduct(null)} />
      )}

      {historyProduct && (
        <ProductHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}

      {productToDelete && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف "${productToDelete.name}"؟ لا يمكن التراجع عن هذه العملية.`}
          onConfirm={confirmDelete}
          onCancel={() => setProductToDelete(null)}
        />
      )}
    </div>
  );
}
