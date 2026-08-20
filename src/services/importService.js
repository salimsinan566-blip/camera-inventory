// خدمة مزامنة نتائج استيراد Excel مع Firestore.
//
// قرار مهم للاستقرار: عند إعادة الاستيراد لمنتج موجود (نفس SKU)، نحدّث
// فقط بيانات الكتالوج (الاسم، الفئة، الموديل، الأسعار، الحد الأدنى) —
// ولا نلمس "الكمية" ولا "الموقع" لأنهما بيانات تشغيلية حقيقية يديرها
// المستخدم يدوياً (أو نقطة البيع لاحقاً)، ومعظم خلايا الكمية بالملف
// فاضية أصلاً. لو حدّثنا الكمية من الملف بكل استيراد، رح تنصفر كميات
// حقيقية بالغلط.
//
// المنتجات الجديدة (SKU غير موجود) تُنشأ بالكمية والموقع المحددين.

import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const PRODUCTS_COLLECTION = 'products';
const BATCH_LIMIT = 450; // هامش أمان تحت حد 500 عملية لكل batch بـ Firestore

/** يجلب كل المنتجات الحالية ويرجعها كخريطة sku -> { id, ...data } */
async function fetchExistingProductsBySku() {
  const snapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
  const map = new Map();
  snapshot.docs.forEach((d) => {
    const data = d.data();
    if (data.sku) map.set(data.sku, { id: d.id, ...data });
  });
  return map;
}

/**
 * يزامن قائمة منتجات مستوردة من Excel مع Firestore.
 * @param {Array} parsedProducts - نتيجة parseExcelFile().products
 * @param {Array} parsedProducts - نتيجة parseExcelFile().products
 * @returns {Promise<{created: number, updated: number}>}
 */
export async function syncImportedProducts(parsedProducts) {
  const existingBySku = await fetchExistingProductsBySku();

  let created = 0;
  let updated = 0;
  let batch = writeBatch(db);
  let opsInBatch = 0;

  async function commitIfNeeded() {
    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }

  for (const product of parsedProducts) {
    const existing = existingBySku.get(product.sku);

    if (existing) {
      // تحديث بيانات الكتالوج فقط — بدون لمس كميات المحل/المخزن
      const ref = doc(db, PRODUCTS_COLLECTION, existing.id);
      batch.update(ref, {
        name: product.name,
        cameraType: product.cameraType,
        model: product.model,
        wholesalePrice: product.wholesalePrice,
        profitMargin: product.profitMargin,
        retailPrice: product.retailPrice,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
    } else {
      // منتج جديد بالكامل — الكمية المستوردة تدخل المخزن (كما حُدِّد في excelImport)
      const ref = doc(collection(db, PRODUCTS_COLLECTION));
      batch.set(ref, {
        ...product,
        imageUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created += 1;
    }

    opsInBatch += 1;
    await commitIfNeeded();
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return { created, updated };
}
