import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import * as XLSX from 'xlsx';

// اسماء المجموعات في قاعدة البيانات
const COLLECTIONS = ['products', 'sales', 'customers'];

export async function exportAllData(format = 'excel') {
  try {
    const backupData = {};
    const workbook = XLSX.utils.book_new();

    // جلب المنتجات وتقسيمها حسب الفئة في الإكسل
    const productsSnap = await getDocs(collection(db, 'products'));
    const productsData = [];
    const productsByCategory = {};

    productsSnap.forEach((doc) => {
      const data = doc.data();
      const cleanData = { id: doc.id, ...data };
      productsData.push(cleanData);

      // للإكسل
      const category = data.cameraType || 'أخرى';
      if (!productsByCategory[category]) productsByCategory[category] = [];
      
      productsByCategory[category].push({
        'رقم الصنف (SKU)': data.sku || '',
        'اسم المنتج': data.name || '',
        'فئة المنتج': data.type || '',
        'العلامة التجارية': data.brand || '',
        'الموديل': data.model || '',
        'المواصفات الأساسية (دقة/سعة)': data.specs || data.resolution || data.capacity || '',
        'الرقم التسلسلي': data.barcode || '',
        'الكمية المتوفرة (المحل)': data.storeQty || 0,
        'الكمية المتوفرة (المخزن)': data.warehouseQty || 0,
        'الحد الأدنى للكمية': data.minQty || 0,
        'سعر التكلفة': data.costPrice || 0,
        'سعر الجملة': data.wholesalePrice || 0,
        'سعر المفرد': data.retailPrice || 0,
        ...(data.sellMode === 'meter' ? { 'طريقة البيع': 'بالمتر', 'طول اللفة': data.metersPerRoll || 0 } : {})
      });
    });
    backupData['products'] = productsData;

    if (format === 'excel') {
      Object.keys(productsByCategory).forEach(cat => {
        const sheetName = cat.substring(0, 31).replace(/[\\/?*\[\]:]/g, ''); // Excel sheet name limits
        const worksheet = XLSX.utils.json_to_sheet(productsByCategory[cat]);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Products');
      });
    }

    // جلب المبيعات
    const salesSnap = await getDocs(collection(db, 'sales'));
    const salesData = [];
    const salesExcel = [];
    salesSnap.forEach((doc) => {
      const data = doc.data();
      const cleanData = { id: doc.id, ...data };
      if (data.date && typeof data.date.toDate === 'function') {
        cleanData.date = data.date.toDate().toISOString();
      }
      salesData.push(cleanData);

      salesExcel.push({
        'رقم الفاتورة': data.invoiceNumber || '',
        'التاريخ': cleanData.date ? new Date(cleanData.date).toLocaleDateString('en-GB') : '',
        'اسم العميل': data.customerName || '',
        'رقم هاتف العميل': data.customerPhone || '',
        'الإجمالي': data.total || 0,
        'الخصم': data.discount || 0,
        'الصافي': data.finalTotal || 0,
        'الواصل': data.amountPaid || 0,
        'المتبقي (دين)': data.amountRemaining || 0,
        'طريقة الدفع': data.paymentMethod === 'cash' ? 'نقدي' : data.paymentMethod === 'debt' ? 'آجل (دين)' : data.paymentMethod || '',
        'حالة الفاتورة': data.status === 'confirmed' ? 'مؤكدة' : data.status === 'draft' ? 'مسودة' : 'راجعة',
      });
    });
    backupData['sales'] = salesData;
    if (format === 'excel' && salesExcel.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesExcel), 'المبيعات');
    }

    // جلب العملاء
    const customersSnap = await getDocs(collection(db, 'customers'));
    const customersData = [];
    const customersExcel = [];
    customersSnap.forEach((doc) => {
      const data = doc.data();
      const cleanData = { id: doc.id, ...data };
      customersData.push(cleanData);

      customersExcel.push({
        'الاسم': data.name || '',
        'رقم الهاتف 1': data.phone1 || '',
        'رقم الهاتف 2': data.phone2 || '',
        'نوع العميل': data.type === 'retail' ? 'مفرد' : 'جملة',
        'العنوان': data.address || '',
        'إجمالي الديون': data.totalDebt || 0,
      });
    });
    backupData['customers'] = customersData;
    if (format === 'excel' && customersExcel.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customersExcel), 'العملاء');
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-');
    const fileNameDate = `${dateStr}_${timeStr}`;

    const downloadFile = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    if (format === 'json') {
      // 1. تنزيل JSON
      const jsonBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      downloadFile(jsonBlob, `Backup_${fileNameDate}.json`);
    } else if (format === 'excel') {
      // 2. تنزيل Excel
      XLSX.writeFile(workbook, `Backup_${fileNameDate}.xlsx`);
    }

    return true;
  } catch (error) {
    console.error("Backup Failed:", error);
    throw error;
  }
}
