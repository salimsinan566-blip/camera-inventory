import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  generateCapitalPDF,
  generateProductsCatalogPDF,
  generateSalesSummaryPDF,
  generateCustomersDebtsPDF,
  generateInventoryLogsPDF,
  generateInvoicePDF,
  generateCustomerStatementPDF,
} from '../utils/backupPdfGenerator';

/**
 * Fetch all required collections from Firestore
 */
export async function fetchFullDatabase() {
  const [
    productsSnap,
    salesSnap,
    customersSnap,
    logsSnap,
    offersSnap,
    settingsSnap
  ] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'sales')),
    getDocs(collection(db, 'customers')),
    getDocs(collection(db, 'inventory_logs')),
    getDocs(collection(db, 'offers')),
    getDocs(collection(db, 'settings'))
  ]);

  const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const allSales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Separate confirmed sales from draft / suspended sales
  const sales = allSales.filter((s) => s.status === 'confirmed' || (!s.status && !s.isDraft && !s.isSuspended));
  const drafts = allSales.filter((s) => s.status === 'draft' || s.status === 'suspended' || s.isDraft || s.isSuspended);
  const customers = customersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const logs = logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const offers = offersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  const settings = {};
  settingsSnap.docs.forEach(d => {
    settings[d.id] = d.data();
  });

  return { products, sales, customers, logs, drafts, offers, settings };
}

/**
 * Generate Excel Workbook covering all data tables
 */
export function buildExcelWorkbook({ products, sales, customers, logs, drafts, offers }) {
  const workbook = XLSX.utils.book_new();

  // 1. Products Sheet
  const productsRows = products.map((p) => ({
    'رقم الصنف (SKU)': p.sku || '',
    'اسم المنتج': p.name || '',
    'القسم': p.cameraType || '',
    'الباركود': p.barcode || '',
    'الكمية بالمحل': p.storeQty || 0,
    'الكمية بالمخزن': p.warehouseQty || 0,
    'إجمالي الكمية': (Number(p.storeQty) || 0) + (Number(p.warehouseQty) || 0),
    'طريقة البيع': p.sellMode === 'meter' ? 'بالمتر' : 'بالقطعة',
    'طول اللفة': p.metersPerRoll || 0,
    'سعر التكلفة': p.costPrice || 0,
    'سعر الجملة': p.wholesalePrice || 0,
    'سعر المفرد': p.retailPrice || 0,
    'الحد الأدنى محل': p.storeMinThreshold || 5,
    'الحد الأدنى مخزن': p.warehouseMinThreshold || 5,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRows), 'المخزون والمنتجات');

  // 2. Sales Sheet
  const salesRows = sales.map((s) => {
    const dateStr = s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toISOString().slice(0, 10) : new Date(s.createdAt).toISOString().slice(0, 10)) : '';
    return {
      'رقم الفاتورة': s.invoiceNumber || s.id?.slice(0, 6),
      'التاريخ': dateStr,
      'اسم العميل': s.customerName || 'زبون عام',
      'رقم الهاتف': s.customerPhone || '',
      'طريقة الدفع': s.paymentMethod === 'debt' || s.invoiceType === 'debt' ? 'آجل (دين)' : 'نقدي',
      'المجموع الفرعي': s.subtotal || s.total || 0,
      'الخصم': s.discount || 0,
      'الإجمالي النهائي': s.total || 0,
      'البائع': s.cashierEmail || '',
      'عدد المواد': s.items?.length || 0,
    };
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'المبيعات والفواتير');

  // 3. Customers Sheet
  const customersRows = customers.map((c) => ({
    'اسم العميل': c.name || '',
    'رقم الهاتف 1': c.phone1 || '',
    'رقم الهاتف 2': c.phone2 || '',
    'إجمالي الديون القائمة': c.totalDebt || 0,
    'العنوان': c.address || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customersRows), 'العملاء والديون');

  // 4. Inventory Logs Sheet
  const logsRows = logs.map((l) => ({
    'التاريخ': l.createdAt ? (l.createdAt.toDate ? l.createdAt.toDate().toISOString() : new Date(l.createdAt).toISOString()) : '',
    'اسم المنتج': l.productName || '',
    'نوع الحركة': l.type || '',
    'الكمية السابقة بالمحل': l.previousStoreQty ?? '',
    'الكمية الجديدة بالمحل': l.newStoreQty ?? '',
    'الكمية السابقة بالمخزن': l.previousWarehouseQty ?? '',
    'الكمية الجديدة بالمخزن': l.newWarehouseQty ?? '',
    'السبب / الملاحظة': l.reason || '',
    'المستخدم': l.userEmail || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(logsRows), 'سجل حركات المخزون');

  return workbook;
}

/**
 * Execute Full Backup Bundle Generation (PDFs, Customer Folders, Excel, JSON)
 */
export async function generateFullBackupBundle(onProgress = () => {}) {
  onProgress({ step: 'fetch', message: 'جاري جلب كافة قواعد البيانات من الخادم...', percent: 10 });
  const data = await fetchFullDatabase();
  const storeSettings = data.settings?.store_info || {};

  const suspendedDrafts = data.drafts || [];

  const zip = new JSZip();
  const dateStr = new Date().toISOString().slice(0, 10);
  const rootFolderName = `SafeZone_Backup_${dateStr}`;
  const rootFolder = zip.folder(rootFolderName);

  // 1. Generate Main PDF Reports
  onProgress({ step: 'capital_pdf', message: 'توليد تقرير رأس المال وجرد المخزون (PDF)...', percent: 25 });
  const capitalPdfBlob = await generateCapitalPDF(data.products, suspendedDrafts, storeSettings);
  rootFolder.file('رأس_المال_وجرد_المخزون.pdf', capitalPdfBlob);

  onProgress({ step: 'products_pdf', message: 'توليد تقرير المخزون والمنتجات الشامل (PDF)...', percent: 40 });
  const productsPdfBlob = await generateProductsCatalogPDF(data.products, suspendedDrafts, storeSettings);
  rootFolder.file('تقرير_المخزون_والمنتجات.pdf', productsPdfBlob);

  onProgress({ step: 'sales_pdf', message: 'توليد تقرير المبيعات والإيرادات (PDF)...', percent: 50 });
  const salesPdfBlob = await generateSalesSummaryPDF(data.sales, storeSettings);
  rootFolder.file('تقرير_المبيعات_والإيرادات.pdf', salesPdfBlob);

  onProgress({ step: 'customers_pdf', message: 'توليد كشف العملاء والديون المعلقة (PDF)...', percent: 60 });
  const customersPdfBlob = await generateCustomersDebtsPDF(data.customers, data.sales, storeSettings);
  rootFolder.file('كشف_العملاء_والديون_المعلقة.pdf', customersPdfBlob);

  onProgress({ step: 'logs_pdf', message: 'توليد سجل حركات وتغييرات المخزون (PDF)...', percent: 70 });
  const logsPdfBlob = await generateInventoryLogsPDF(data.logs, storeSettings);
  rootFolder.file('سجل_حركات_وتغييرات_المخزون.pdf', logsPdfBlob);

  // 2. Customer Folders with Invoices & Statements
  onProgress({ step: 'invoices_pdf', message: 'تجهيز وتصنيف فواتير العملاء في مجلدات مخصصة (PDF)...', percent: 80 });
  const customersFolder = rootFolder.folder('فواتير_العملاء');

  // Group sales by customer name
  const salesByCustomer = {};
  data.sales.forEach((s) => {
    const custName = (s.customerName || 'زبون_عام_نقدي').trim().replace(/[/\\?%*:|"<>]/g, '_');
    if (!salesByCustomer[custName]) salesByCustomer[custName] = [];
    salesByCustomer[custName].push(s);
  });

  for (const custName of Object.keys(salesByCustomer)) {
    const custSales = salesByCustomer[custName];
    const customerObj = data.customers.find((c) => c.name === custName) || { name: custName, totalDebt: 0 };
    const custFolder = customersFolder.folder(custName);

    // Account statement PDF
    const statementBlob = await generateCustomerStatementPDF(customerObj, custSales, storeSettings);
    custFolder.file(`كشف_حساب_${custName}.pdf`, statementBlob);

    // Individual Invoices PDFs
    for (const sale of custSales) {
      const invNumber = sale.invoiceNumber || sale.id?.slice(0, 6) || '1001';
      const saleDate = sale.createdAt ? (sale.createdAt.toDate ? sale.createdAt.toDate().toISOString().slice(0, 10) : new Date(sale.createdAt).toISOString().slice(0, 10)) : 'date';
      const invBlob = await generateInvoicePDF(sale, storeSettings);
      custFolder.file(`فاتورة_${invNumber}_${saleDate}.pdf`, invBlob);
    }
  }

  // 3. Excel Spreadsheet
  onProgress({ step: 'excel', message: 'توليد ملف جداول الإكسل الشامل (Excel)...', percent: 90 });
  const workbook = buildExcelWorkbook(data);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  rootFolder.file('Database_Full_Backup.xlsx', excelBuffer);

  // 4. Raw JSON Dump
  const rawJsonStr = JSON.stringify(data, null, 2);
  rootFolder.file('Database_Raw.json', rawJsonStr);

  onProgress({ step: 'compress', message: 'ضغط وتجميع الحزمة بالكامل...', percent: 98 });
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // Update backup stats in Firestore
  try {
    await setDoc(doc(db, 'settings', 'backup_stats'), {
      lastBackupDate: new Date().toISOString(),
      productsCount: data.products.length,
      salesCount: data.sales.length,
      customersCount: data.customers.length,
      logsCount: data.logs.length,
      status: 'success'
    }, { merge: true });
  } catch (e) {
    console.error('Failed to update backup stats:', e);
  }

  onProgress({ step: 'complete', message: 'تم إعداد النسخة الاحتياطية بنجاح!', percent: 100 });

  return {
    zipBlob,
    filename: `${rootFolderName}.zip`,
    data,
    files: {
      capitalPdfBlob,
      productsPdfBlob,
      salesPdfBlob,
      customersPdfBlob,
      logsPdfBlob,
      excelBuffer,
      rawJsonStr
    }
  };
}

/**
 * Trigger download of the generated backup ZIP file directly in the browser
 */
export function downloadBackupZip(blob, filename = 'SafeZone_Backup.zip') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert Blob to Base64 String
 */
async function blobToBase64(blob) {
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64String = dataUrl.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Send backup to Serverless Google Drive API Handler
 */
export async function uploadBackupToGoogleDrive(bundle, onProgress = () => {}) {
  onProgress({ step: 'upload', message: 'جاري تحضير ورفع ملفات الـ PDF وقواعد البيانات إلى Google Drive...', percent: 90 });

  const filesPayload = {};
  if (bundle?.files) {
    if (bundle.files.capitalPdfBlob) {
      filesPayload['رأس_المال_وجرد_المخزون.pdf'] = await blobToBase64(bundle.files.capitalPdfBlob);
    }
    if (bundle.files.productsPdfBlob) {
      filesPayload['تقرير_المخزون_والمنتجات.pdf'] = await blobToBase64(bundle.files.productsPdfBlob);
    }
    if (bundle.files.salesPdfBlob) {
      filesPayload['تقرير_المبيعات_والإيرادات.pdf'] = await blobToBase64(bundle.files.salesPdfBlob);
    }
    if (bundle.files.customersPdfBlob) {
      filesPayload['كشف_العملاء_والديون_المعلقة.pdf'] = await blobToBase64(bundle.files.customersPdfBlob);
    }
    if (bundle.files.logsPdfBlob) {
      filesPayload['سجل_حركات_وتغييرات_المخزون.pdf'] = await blobToBase64(bundle.files.logsPdfBlob);
    }
  }

  let driveConfig = bundle.data?.settings?.google_drive_config || null;
  if (!driveConfig || !driveConfig.serviceAccountJson) {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'google_drive_config'));
      if (docSnap.exists()) {
        driveConfig = docSnap.data();
      }
    } catch (e) {
      console.warn('Failed to load google_drive_config doc:', e);
    }
  }

  const serviceAccount = driveConfig?.serviceAccountJson || null;
  const folderId = driveConfig?.folderId || null;

  // 1. Direct OAuth Upload if logged in with Google Drive
  let userToken = sessionStorage.getItem('gdrive_access_token') || localStorage.getItem('gdrive_access_token');
  
  if (!userToken && !serviceAccount) {
    onProgress({ step: 'auth', message: 'يرجى تسجيل الدخول إلى حساب Google Drive للمتابعة...', percent: 20 });
    const { connectUserGoogleDrive } = await import('./googleDriveClientUpload');
    const authResult = await connectUserGoogleDrive();
    userToken = authResult.token;
  }

  if (userToken) {
    onProgress({ step: 'upload', message: 'جاري الرفع المباشر إلى Google Drive بحسابك...', percent: 85 });
    const { createDriveFolderDirect, uploadBlobToDriveDirect } = await import('./googleDriveClientUpload');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const rootFolderName = `SafeZone_Backup_${dateStr}`;
    const rootFolderId = await createDriveFolderDirect(userToken, rootFolderName, folderId);

    // Upload ZIP bundle
    if (bundle.zipBlob) {
      await uploadBlobToDriveDirect(userToken, `${rootFolderName}.zip`, 'application/zip', bundle.zipBlob, rootFolderId);
    }
    // Upload core PDF reports
    if (bundle.files?.capitalPdfBlob) {
      await uploadBlobToDriveDirect(userToken, 'رأس_المال_وجرد_المخزون.pdf', 'application/pdf', bundle.files.capitalPdfBlob, rootFolderId);
    }
    if (bundle.files?.productsPdfBlob) {
      await uploadBlobToDriveDirect(userToken, 'تقرير_المخزون_والمنتجات.pdf', 'application/pdf', bundle.files.productsPdfBlob, rootFolderId);
    }
    if (bundle.files?.salesPdfBlob) {
      await uploadBlobToDriveDirect(userToken, 'تقرير_المبيعات_والإيرادات.pdf', 'application/pdf', bundle.files.salesPdfBlob, rootFolderId);
    }
    if (bundle.files?.customersPdfBlob) {
      await uploadBlobToDriveDirect(userToken, 'كشف_العملاء_والديون_المعلقة.pdf', 'application/pdf', bundle.files.customersPdfBlob, rootFolderId);
    }

    onProgress({ step: 'complete', message: 'تم الرفع إلى Google Drive بنجاح!', percent: 100 });
    return { success: true, folderId: rootFolderId, folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}` };
  }

  // 2. Serverless API fallback
  const response = await fetch('/api/google-drive-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger: 'manual',
      date: new Date().toISOString(),
      serviceAccount,
      folderId,
      files: filesPayload,
      data: {
        products: bundle.data?.products || [],
        sales: bundle.data?.sales || [],
        customers: bundle.data?.customers || [],
        logs: bundle.data?.logs || [],
        settings: bundle.data?.settings || {}
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let errObj;
    try { errObj = JSON.parse(errText); } catch(e) {}
    throw new Error(errObj?.error || `فشل الرفع إلى Google Drive: ${errText}`);
  }

  const result = await response.json();
  return result;
}
