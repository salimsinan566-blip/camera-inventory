// معالجة استيراد ملف Excel: قراءة كل الأوراق، تنظيف الأسماء، وتجهيز
// كائنات منتجات جاهزة للمزامنة مع Firestore.
//
// صيغة الأعمدة المتوقعة بكل ورقة (بنفس ترتيب ملف "Categorized_Safe_Zone"):
// A: رقم الصنف (SKU) | B: فئة المنتج (وصف) | C: العلامة التجارية | D: الموديل
// E: المواصفات الأساسية | F: الرقم التسلسلي | G: الكمية المتوفرة
// H: الحد الأدنى للكمية | I: سعر التكلفة | J: سعر البيع | K: المورد
// L: تاريخ الإضافة | M: ملاحظات

import * as XLSX from 'xlsx';
import { CATEGORIES, DEFAULT_MIN_THRESHOLD } from '../models/product';

// نوع المنتج = اسم الورقة حرفياً (مطابق لقائمة CATEGORIES)، وأي ورقة غير معروفة تُصنَّف "أخرى"
function resolveCategory(sheetName) {
  if (CATEGORIES.includes(sheetName)) return sheetName;
  return 'أخرى';
}

/** ينظف نص الوصف من الأقواس والمسافات الزائدة */
function cleanDescription(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[()]/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

/** يبني اسم المنتج النهائي: العلامة التجارية – الوصف المنظّف (الموديل) */
function buildProductName(sku, brand, description, model) {
  const cleanBrand = brand !== null && brand !== undefined ? String(brand).trim() : '';
  const desc = cleanDescription(description);
  const cleanModel = model !== null && model !== undefined ? String(model).trim() : '';

  const parts = [];
  if (cleanBrand) parts.push(cleanBrand);
  if (desc) parts.push(desc);
  let name = parts.length > 0 ? parts.join(' – ') : String(sku);
  if (cleanModel) name += ` (${cleanModel})`;
  return name;
}

function toNumberOrDefault(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * يقرأ ملف Excel (كـ ArrayBuffer) ويرجع:
 * { products: [...], duplicateSkusInFile: [...], rowsSkipped: number }
 *
 * products: مصفوفة كائنات جاهزة (name, sku, cameraType, model, quantity,
 * wholesalePrice, profitMargin, retailPrice, minThreshold, barcode: null)
 * — بدون location و بدون id، تُحدَّد لاحقاً عند المزامنة.
 */
export function parseExcelFile(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const products = [];
  const seenSkus = new Set();
  const duplicateSkusInFile = [];
  let rowsSkipped = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // أول صف هو رأس الأعمدة، نبدأ من الصف الثاني
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const [sku, description, brand, model, , , quantity, minThreshold, costPrice, sellPrice] =
        row;

      if (sku === null || sku === undefined || String(sku).trim() === '') {
        rowsSkipped += 1;
        continue;
      }

      const skuStr = String(sku).trim();

      if (seenSkus.has(skuStr)) {
        duplicateSkusInFile.push(skuStr);
        continue; // نتجاهل التكرار الثاني، نُبقي أول ظهور فقط
      }
      seenSkus.add(skuStr);

      const wholesalePrice = toNumberOrDefault(costPrice, 0);
      const retailPrice = toNumberOrDefault(sellPrice, 0);
      const profitMargin =
        wholesalePrice > 0 ? Math.round(((retailPrice - wholesalePrice) / wholesalePrice) * 1000) / 10 : 0;

      products.push({
        sku: skuStr,
        name: buildProductName(skuStr, brand, description, model),
        cameraType: resolveCategory(sheetName),
        model: model !== null && model !== undefined ? String(model).trim() : '',
        // البضاعة المستوردة من ملف الجملة تُوضع في المخزن افتراضياً، والمحل يبدأ صفر
        storeQty: 0,
        warehouseQty: toNumberOrDefault(quantity, 0),
        storeMinThreshold: toNumberOrDefault(minThreshold, DEFAULT_MIN_THRESHOLD),
        warehouseMinThreshold: toNumberOrDefault(minThreshold, DEFAULT_MIN_THRESHOLD),
        wholesalePrice,
        profitMargin,
        retailPrice,
        barcode: null,
      });
    }
  }

  return { products, duplicateSkusInFile, rowsSkipped };
}
