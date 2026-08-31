import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { LOCATIONS } from '../models/product';
import { logInventoryChange, LOG_TYPES } from './inventoryLogsService';
import { moveToTrash } from './trashBinService';

const PRODUCTS_COLLECTION = 'products';

/** يتحقق ما إذا كان SKU مستخدم من قبل منتج آخر (لمنع التكرار) */
export async function isSkuTaken(sku, excludeId = null) {
  const q = query(collection(db, PRODUCTS_COLLECTION), where('sku', '==', sku));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return false;
  if (!excludeId) return true;
  // في حالة التعديل: تجاهل نفس المنتج
  return snapshot.docs.some((d) => d.id !== excludeId);
}

/** يحوّل حقول المنتج للأرقام الصحيحة قبل الحفظ */
function normalizePayload(productData) {
  return {
    ...productData,
    company: productData.company || '',
    storeQty: Number(productData.storeQty) || 0,
    warehouseQty: Number(productData.warehouseQty) || 0,
    storeMinThreshold: Number(productData.storeMinThreshold) || 0,
    warehouseMinThreshold: Number(productData.warehouseMinThreshold) || 0,
    wholesalePrice: Number(productData.wholesalePrice) || 0,
    profitMargin: Number(productData.profitMargin) || 0,
    retailPrice: Number(productData.retailPrice) || 0,
  };
}

/** إضافة منتج جديد */
export async function createProduct(productData, userEmail = '') {
  const payload = {
    ...normalizePayload(productData),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  delete payload.quantity;
  delete payload.location;
  delete payload.minThreshold;
  delete payload.id;
  
  const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), payload);

  // Log creation
  logInventoryChange({
    productId: docRef.id,
    productName: payload.name,
    sku: payload.sku,
    barcode: payload.barcode,
    category: payload.cameraType,
    sellMode: payload.sellMode,
    metersPerRoll: payload.metersPerRoll,
    type: LOG_TYPES.CREATED,
    location: 'both',
    previousStoreQty: 0,
    newStoreQty: payload.storeQty,
    storeQtyDiff: payload.storeQty,
    previousWarehouseQty: 0,
    newWarehouseQty: payload.warehouseQty,
    warehouseQtyDiff: payload.warehouseQty,
    reason: 'إنشاء منتج جديد',
    userEmail: userEmail || 'مدير النظام',
  });

  return docRef;
}

/** تعديل منتج موجود مع توثيق تغييرات المخزون */
export async function updateProduct(id, productData, userEmail = '', reason = '') {
  const ref = doc(db, PRODUCTS_COLLECTION, id);
  const prevSnap = await getDoc(ref);
  const prevData = prevSnap.exists() ? prevSnap.data() : {};

  const payload = {
    ...normalizePayload(productData),
    updatedAt: serverTimestamp(),
  };
  delete payload.quantity;
  delete payload.location;
  delete payload.minThreshold;
  delete payload.id;

  const result = await updateDoc(ref, payload);

  // Check if store or warehouse quantities changed to log
  const prevStore = Number(prevData.storeQty) || 0;
  const newStore = Number(payload.storeQty) || 0;
  const storeDiff = newStore - prevStore;

  const prevWarehouse = Number(prevData.warehouseQty) || 0;
  const newWarehouse = Number(payload.warehouseQty) || 0;
  const warehouseDiff = newWarehouse - prevWarehouse;

  if (storeDiff !== 0 || warehouseDiff !== 0) {
    let loc = 'both';
    if (storeDiff !== 0 && warehouseDiff === 0) loc = 'store';
    else if (storeDiff === 0 && warehouseDiff !== 0) loc = 'warehouse';

    logInventoryChange({
      productId: id,
      productName: payload.name || prevData.name,
      sku: payload.sku || prevData.sku,
      barcode: payload.barcode || prevData.barcode,
      category: payload.cameraType || prevData.cameraType,
      sellMode: payload.sellMode || prevData.sellMode,
      metersPerRoll: payload.metersPerRoll || prevData.metersPerRoll,
      type: LOG_TYPES.MANUAL_EDIT,
      location: loc,
      previousStoreQty: prevStore,
      newStoreQty: newStore,
      storeQtyDiff: storeDiff,
      previousWarehouseQty: prevWarehouse,
      newWarehouseQty: newWarehouse,
      warehouseQtyDiff: warehouseDiff,
      reason: reason || 'تعديل يدوي لبيانات المنتج',
      userEmail: userEmail || 'غير محدد',
    });
  }

  return result;
}

/** حذف منتج مع حفظه في سلة المحذوفات */
export async function deleteProduct(id, userEmail = 'سالم سنان') {
  const ref = doc(db, PRODUCTS_COLLECTION, id);
  const snap = await getDoc(ref);
  const prevData = snap.exists() ? snap.data() : {};

  if (snap.exists()) {
    try {
      await moveToTrash({
        itemType: 'product',
        originalCollection: PRODUCTS_COLLECTION,
        docId: id,
        data: prevData,
        title: prevData.name || 'منتج محذوف',
        subtitle: `SKU: ${prevData.sku || '-'} • مخزون: ${(Number(prevData.storeQty) || 0) + (Number(prevData.warehouseQty) || 0)} قطعة`,
        userEmail: userEmail || 'سالم سنان'
      });
    } catch (tErr) {
      console.warn('Could not backup product to trash bin:', tErr);
    }
  }

  const result = await deleteDoc(ref);

  logInventoryChange({
    productId: id,
    productName: prevData.name || 'منتج محذوف',
    sku: prevData.sku || '',
    barcode: prevData.barcode || '',
    category: prevData.cameraType || '',
    type: LOG_TYPES.DELETED,
    location: 'both',
    previousStoreQty: Number(prevData.storeQty) || 0,
    newStoreQty: 0,
    storeQtyDiff: -(Number(prevData.storeQty) || 0),
    previousWarehouseQty: Number(prevData.warehouseQty) || 0,
    newWarehouseQty: 0,
    warehouseQtyDiff: -(Number(prevData.warehouseQty) || 0),
    reason: 'حذف المنتج من النظام',
    userEmail: userEmail || 'مدير النظام',
  });

  return result;
}

/**
 * نقل كمية بين موقعين لنفس المنتج (مثلاً من المخزن للمحل).
 */
export async function transferStock(productId, from, to, amount, userEmail = '', reason = '') {
  const qty = Number(amount) || 0;
  if (qty <= 0) throw new Error('الكمية المنقولة يجب أن تكون أكبر من صفر');
  if (from === to) throw new Error('لا يمكن النقل لنفس الموقع');

  const fromField = from === LOCATIONS.STORE ? 'storeQty' : 'warehouseQty';
  const toField = to === LOCATIONS.STORE ? 'storeQty' : 'warehouseQty';
  const ref = doc(db, PRODUCTS_COLLECTION, productId);

  let productDetails = null;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('المنتج لم يعد موجوداً');
    const data = snap.data();
    productDetails = data;
    const fromQty = Number(data[fromField]) || 0;
    if (fromQty < qty) {
      throw new Error(`الكمية المتوفرة في المصدر هي ${fromQty} فقط`);
    }
    const toQty = Number(data[toField]) || 0;
    transaction.update(ref, {
      [fromField]: fromQty - qty,
      [toField]: toQty + qty,
      updatedAt: serverTimestamp(),
    });
  });

  if (productDetails) {
    const fromLabel = from === LOCATIONS.STORE ? 'المحل' : 'المخزن';
    const toLabel = to === LOCATIONS.STORE ? 'المحل' : 'المخزن';

    logInventoryChange({
      productId: productId,
      productName: productDetails.name,
      sku: productDetails.sku,
      barcode: productDetails.barcode,
      category: productDetails.cameraType,
      sellMode: productDetails.sellMode,
      metersPerRoll: productDetails.metersPerRoll,
      type: LOG_TYPES.TRANSFER,
      location: 'both',
      previousStoreQty: Number(productDetails.storeQty) || 0,
      newStoreQty: from === LOCATIONS.STORE ? (Number(productDetails.storeQty) || 0) - qty : (Number(productDetails.storeQty) || 0) + qty,
      storeQtyDiff: from === LOCATIONS.STORE ? -qty : qty,
      previousWarehouseQty: Number(productDetails.warehouseQty) || 0,
      newWarehouseQty: from === LOCATIONS.WAREHOUSE ? (Number(productDetails.warehouseQty) || 0) - qty : (Number(productDetails.warehouseQty) || 0) + qty,
      warehouseQtyDiff: from === LOCATIONS.WAREHOUSE ? -qty : qty,
      reason: reason || `نقل داخلي من ${fromLabel} إلى ${toLabel}`,
      userEmail: userEmail || 'غير محدد',
    });
  }
}

/**
 * تحديث جرد مجموعة من المنتجات دفعة واحدة (Batch Update)
 */
export async function bulkUpdateInventory(updates, userEmail = '', reason = 'تسوية جرد دوري') {
  if (!updates || updates.length === 0) return;
  
  const batch = writeBatch(db);
  
  updates.forEach(update => {
    const ref = doc(db, PRODUCTS_COLLECTION, update.id);
    const payload = { updatedAt: serverTimestamp() };
    
    if (update.storeQty !== undefined) {
      payload.storeQty = Number(update.storeQty);
    }
    if (update.warehouseQty !== undefined) {
      payload.warehouseQty = Number(update.warehouseQty);
    }
    
    batch.update(ref, payload);

    logInventoryChange({
      productId: update.id,
      productName: update.name || 'منتج',
      sku: update.sku || '',
      type: LOG_TYPES.INVENTORY_AUDIT,
      location: update.storeQty !== undefined && update.warehouseQty !== undefined ? 'both' : (update.storeQty !== undefined ? 'store' : 'warehouse'),
      previousStoreQty: update.originalStoreQty !== undefined ? Number(update.originalStoreQty) : null,
      newStoreQty: update.storeQty !== undefined ? Number(update.storeQty) : null,
      storeQtyDiff: (update.storeQty !== undefined && update.originalStoreQty !== undefined) ? Number(update.storeQty) - Number(update.originalStoreQty) : null,
      previousWarehouseQty: update.originalWarehouseQty !== undefined ? Number(update.originalWarehouseQty) : null,
      newWarehouseQty: update.warehouseQty !== undefined ? Number(update.warehouseQty) : null,
      warehouseQtyDiff: (update.warehouseQty !== undefined && update.originalWarehouseQty !== undefined) ? Number(update.warehouseQty) - Number(update.originalWarehouseQty) : null,
      reason: reason,
      userEmail: userEmail || 'لجنة الجرد',
    });
  });
  
  await batch.commit();
}

/**
 * تبديل أو تحديث الترتيب المخصص لمنتجين في المخزون
 */
export async function swapProductsOrder(productA, productB, allSortedProducts = []) {
  if (!productA || !productB) return;
  const batch = writeBatch(db);

  // If products don't have customOrder, assign indices from allSortedProducts
  const orderA = productA.customOrder !== undefined ? productA.customOrder : allSortedProducts.findIndex(p => p.id === productA.id) + 1;
  const orderB = productB.customOrder !== undefined ? productB.customOrder : allSortedProducts.findIndex(p => p.id === productB.id) + 1;

  const targetOrderForA = orderB !== orderA ? orderB : orderA + 1;
  const targetOrderForB = orderA;

  batch.update(doc(db, PRODUCTS_COLLECTION, productA.id), { customOrder: targetOrderForA });
  batch.update(doc(db, PRODUCTS_COLLECTION, productB.id), { customOrder: targetOrderForB });
  await batch.commit();
}

/**
 * نقل منتج لموضع جديد في القائمة
 */
export async function moveProductPosition(productId, targetIndex, currentProducts = []) {
  if (!productId || targetIndex < 0 || targetIndex >= currentProducts.length) return;
  
  const cloned = [...currentProducts];
  const fromIndex = cloned.findIndex(p => p.id === productId);
  if (fromIndex === -1 || fromIndex === targetIndex) return;

  const [movedItem] = cloned.splice(fromIndex, 1);
  cloned.splice(targetIndex, 0, movedItem);

  const batch = writeBatch(db);
  cloned.forEach((p, idx) => {
    batch.update(doc(db, PRODUCTS_COLLECTION, p.id), { customOrder: idx + 1 });
  });
  await batch.commit();
}

/**
 * تحديث اسم القسم في جميع المنتجات المرتبطة به
 */
export async function renameCategoryInProducts(oldCategoryName, newCategoryName) {
  if (!oldCategoryName || !newCategoryName || oldCategoryName === newCategoryName) return 0;
  
  const q1 = query(collection(db, PRODUCTS_COLLECTION), where('cameraType', '==', oldCategoryName));
  const snap1 = await getDocs(q1);
  
  const q2 = query(collection(db, PRODUCTS_COLLECTION), where('category', '==', oldCategoryName));
  const snap2 = await getDocs(q2);

  const docMap = new Map();
  snap1.docs.forEach(d => docMap.set(d.id, d.ref));
  snap2.docs.forEach(d => docMap.set(d.id, d.ref));

  if (docMap.size === 0) return 0;

  const batch = writeBatch(db);
  docMap.forEach((ref) => {
    batch.update(ref, {
      cameraType: newCategoryName,
      category: newCategoryName,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  return docMap.size;
}
