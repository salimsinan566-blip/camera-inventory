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
import Sidebar from './Sidebar';
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
import TrashBinScreen from './TrashBinScreen';
import ProductHistoryModal from './ProductHistoryModal';
import InventoryHistoryView from './InventoryHistoryView';
import CustodyScreen from './CustodyScreen';
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
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'inventory' | 'pos' | 'reports' | 'offers'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  React.useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+S: Open POS (Prevent save page dialog)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setActiveTab('pos');
        setMobileMenuOpen(false);
      }
      
      // Alt+1: Home
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setActiveTab('home');
      }
      // Alt+2: POS
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        setPosMode('sale');
        setActiveTab('pos');
      }
      // Alt+3: Inventory
      if (e.altKey && e.key === '3') {
        e.preventDefault();
        setActiveTab('inventory');
      }
      // Alt+4: Reports
      if (e.altKey && e.key === '4') {
        e.preventDefault();
        setActiveTab('reports');
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
    <div className="min-h-screen bg-ink-50 flex flex-col md:flex-row" dir="rtl">
      {/* شريط الجوال العلوي */}
      <div className="md:hidden bg-slate-900 text-white px-3 py-2.5 flex justify-between items-center z-30 shadow-md shrink-0 safe-top">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center bg-white p-1 rounded-xl shadow-sm h-9 w-20 overflow-hidden">
            <img src={settings?.logoUrl || logo} alt={settings?.storeName || "Safe Zone"} className="h-full w-auto object-contain" />
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-white block truncate max-w-[110px]">{(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الآمنة' : settings.storeName}</span>
            <span className="text-[10px] text-slate-400 block truncate max-w-[100px]">{getDisplayName(user)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NetworkStatusIndicator className="text-[10px] px-2 py-0.5" />
          <button 
            onClick={() => setMobileMenuOpen(true)} 
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 cursor-pointer flex items-center gap-1 text-xs font-bold"
            title="القائمة"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
        </div>
      </div>

      {/* خلفية تظليل للقائمة في الجوال */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 md:hidden" 
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* القائمة الجانبية */}
      <div className={`fixed inset-y-0 right-0 z-50 md:relative transform transition-transform duration-300 md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => {
            if (tab === 'pos') setPosMode('sale');
            setActiveTab(tab);
            setMobileMenuOpen(false);
          }} 
          user={user} 
          onLogout={logout} 
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
      </div>
      
      <div className="flex-1 flex flex-col min-h-0 h-[calc(100dvh-60px)] md:h-screen overflow-hidden">
        <main className={`flex-1 overflow-y-auto ${activeTab === 'pos' ? 'p-2 md:p-4 pb-20 md:pb-4' : 'p-3 md:p-8 pb-24 md:pb-8'}`}>
          <div className="max-w-7xl mx-auto h-full">
        <div className={activeTab === 'home' ? 'block h-full' : 'hidden'}>
          <HomeDashboard
            products={products}
            productsLoading={loading}
            onGoToInventory={(status) => {
              setFilters((prev) => ({ ...prev, stockStatus: status }));
              setActiveTab('inventory');
            }}
            onOpenDraft={(draft) => {
              setDraftToOpen(draft);
              setActiveTab('pos');
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
            onCloseOfferMode={() => setActiveTab('offers')}
          />
        </div>

        <div className={activeTab === 'offers' ? 'block h-full' : 'hidden'}>
          <OffersScreen 
            onCreateOffer={() => {
              setPosMode('offer');
              setActiveTab('pos');
            }}
            onEditOffer={(offer) => {
              setOfferToOpen(offer);
              setPosMode('offer');
              setActiveTab('pos');
            }}
            onConvertOfferToSale={(offer) => {
              // Load it as a draft in sale mode
              setDraftToOpen(offer);
              setPosMode('sale');
              setActiveTab('pos');
            }}
          />
        </div>

        <div className={activeTab === 'custody' ? 'block h-full' : 'hidden'}>
          <CustodyScreen
            products={products}
            user={user}
            onOpenPOSWithCustody={(tech) => {
              setCustodyTechToOpen(tech);
              setPosMode('sale');
              setActiveTab('pos');
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
          <SalesReports />
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

        <div className={activeTab === 'inventory' ? 'block h-full' : 'hidden'}>
            <>
              {/* Inventory Header & Subtabs */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div className="flex bg-white border border-brand-200 p-1 rounded-xl shadow-2xs">
                  <button
                    onClick={() => setInventorySubTab('products')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      inventorySubTab === 'products'
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-brand-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    قائمة المنتجات
                  </button>
                  <button
                    onClick={() => setInventorySubTab('history')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      inventorySubTab === 'history'
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-brand-50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    سجل حركات وتاريخ المخزون
                  </button>
                </div>

                {inventorySubTab === 'products' && (
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => setShowImport(true)} className="text-sm text-ink-700 hover:text-ink-900 underline px-2 cursor-pointer">
                      استيراد من Excel
                    </button>
                    <button onClick={handleAddCategory} className="bg-brand-100 hover:bg-brand-200 text-brand-800 font-bold text-sm px-4 py-2 rounded-xl transition-colors border border-brand-200 cursor-pointer">
                      + إضافة قسم
                    </button>
                    <button onClick={openAddForm} className="bg-brand-500 hover:bg-brand-600 text-ink-900 font-bold text-sm px-4 py-2 rounded-xl shadow-xs cursor-pointer">
                      + إضافة منتج
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
                  {!loading && !error && (
                    <StatsDashboard 
                      products={products} 
                      filteredProducts={filteredProducts} 
                      sortBy={filters.sortBy} 
                      draftSales={draftSales}
                      productCustodyMap={productCustodyMap}
                      custodies={custodies}
                      technicians={technicians}
                    />
                  )}

                  {!loading && !error && (
                    <StockAlertBanner
                      products={products}
                      onFilterByStatus={(status) => setFilters((prev) => ({ ...prev, stockStatus: status }))}
                    />
                  )}

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

        {/* شريط التنقل السفلي للهواتف */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-white safe-bottom shadow-2xl">
          <div className="grid grid-cols-7 items-center h-16 px-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'home' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
              <span className="text-[10px] mt-0.5">الرئيسية</span>
            </button>

            <button
              onClick={() => {
                setPosMode('sale');
                setActiveTab('pos');
              }}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'pos' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span className="text-[10px] mt-0.5">البيع</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'inventory' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              <span className="text-[10px] mt-0.5">المخزون</span>
            </button>

            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'purchases' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
              <span className="text-[10px] mt-0.5">المشتريات</span>
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'expenses' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span className="text-[10px] mt-0.5">المصاريف</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'reports' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <span className="text-[10px] mt-0.5">الفواتير</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center py-1 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              <span className="text-[10px] mt-0.5">المزيد</span>
            </button>
          </div>
        </nav>
      </div>

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
