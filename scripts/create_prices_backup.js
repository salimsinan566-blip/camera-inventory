import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/firebase/config.js';
import { isCableProduct, calculateIncreasedPrice } from '../src/models/product.js';

async function runBackup() {
  console.log('🔄 جاري الاتصال بقاعدة البيانات وسحب جميع المنتجات...');
  
  const snap = await getDocs(collection(db, 'products'));
  console.log(`✅ تم جلب ${snap.size} منتج بنجاح.`);

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const jsonFilePath = path.join(backupDir, `prices_backup_${dateStr}.json`);
  const excelFilePath = path.join(backupDir, `prices_backup_${dateStr}.xlsx`);
  const latestJsonPath = path.join(backupDir, 'latest_prices_backup.json');
  const latestExcelPath = path.join(backupDir, 'latest_prices_backup.xlsx');

  const rawProducts = [];
  const excelRows = [];

  let cableCount = 0;
  let nonCableCount = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    const id = doc.id;
    const isCable = isCableProduct(data);

    if (isCable) {
      cableCount++;
    } else {
      nonCableCount++;
    }

    const currentRetail = Number(data.retailPrice) || 0;
    const currentWholesale = Number(data.wholesalePrice) || 0;
    const currentClient = Number(data.clientPrice) || 0;
    const currentVip = Number(data.vipPrice) || 0;

    // السعر المتوقع بعد تطبيق معادلة 20% والتقريب لأعلى 5 (مع استثناء الكيبلات)
    const proposedRetail = calculateIncreasedPrice(currentRetail, isCable, 20, 5);

    rawProducts.push({
      id,
      sku: data.sku || '',
      name: data.name || '',
      category: data.cameraType || data.category || 'أخرى',
      company: data.company || '',
      model: data.model || '',
      sellMode: data.sellMode || 'unit',
      isCable,
      wholesalePrice: currentWholesale,
      retailPrice: currentRetail,
      clientPrice: currentClient,
      vipPrice: currentVip,
      profitMargin: Number(data.profitMargin) || 0,
      storeQty: Number(data.storeQty) || 0,
      warehouseQty: Number(data.warehouseQty) || 0,
      proposedRetailPriceAfter20Percent: proposedRetail,
      priceDiff: proposedRetail - currentRetail,
    });

    excelRows.push({
      'معرف المنتج (ID)': id,
      'رقم الصنف (SKU)': data.sku || '',
      'اسم المنتج': data.name || '',
      'الفئة / القسم': data.cameraType || data.category || 'أخرى',
      'الشركة / الماركة': data.company || '',
      'الموديل': data.model || '',
      'نوع البيع': data.sellMode === 'meter' ? 'متر' : data.sellMode === 'roll' ? 'لفة' : 'قطعة',
      'هل هو كيبل؟': isCable ? 'نعم (مستثنى)' : 'لا',
      'سعر المفرد الحالي (قبل التعديل)': currentRetail,
      'سعر المفرد المقترح (+20% لأعلى 5)': proposedRetail,
      'فرق الزيادة': proposedRetail - currentRetail,
      'سعر الجملة (التكلفة)': currentWholesale,
      'سعر العميل': currentClient,
      'سعر VIP': currentVip,
      'كمية المحل': Number(data.storeQty) || 0,
      'كمية المخزن': Number(data.warehouseQty) || 0,
    });
  });

  // 1. حفظ كملف JSON
  fs.writeFileSync(jsonFilePath, JSON.stringify(rawProducts, null, 2), 'utf-8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(rawProducts, null, 2), 'utf-8');
  console.log(`💾 تم حفظ النسخة الاحتياطية (JSON): ${jsonFilePath}`);

  // 2. حفظ كملف Excel
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الأسعار قبل التعديل');
  XLSX.writeFile(workbook, excelFilePath);
  XLSX.writeFile(workbook, latestExcelPath);
  console.log(`📊 تم حفظ النسخة الاحتياطية (Excel): ${excelFilePath}`);

  console.log('\n--- ملخص النسخة الاحتياطية ---');
  console.log(`إجمالي المنتجات: ${rawProducts.length}`);
  console.log(`منتجات الكيبلات (المستثناة): ${cableCount}`);
  console.log(`المنتجات الأخرى (المشمولة بالمعادلة): ${nonCableCount}`);
  console.log('-------------------------------\n');

  process.exit(0);
}

runBackup().catch((err) => {
  console.error('❌ خطأ أثناء إنشاء النسخة الاحتياطية:', err);
  process.exit(1);
});
