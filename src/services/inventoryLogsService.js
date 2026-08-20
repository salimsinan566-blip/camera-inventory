import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const INVENTORY_LOGS_COLLECTION = 'inventory_logs';

export const LOG_TYPES = {
  MANUAL_EDIT: 'manual_edit',         // تعديل يدوي
  SALE: 'sale',                       // حركة بيع
  SALE_RETURN: 'sale_return',         // حركة إرجاع بيع
  TRANSFER: 'transfer',               // نقل بين المحل والمخزن
  INVENTORY_AUDIT: 'inventory_audit', // جرد المخزون
  EXCEL_IMPORT: 'excel_import',       // استيراد إكسل
  CREATED: 'created',                 // إضافة منتج جديد
  DELETED: 'deleted',                 // حذف منتج
};

export const LOG_TYPE_LABELS_AR = {
  [LOG_TYPES.MANUAL_EDIT]: 'تعديل يدوي',
  [LOG_TYPES.SALE]: 'حركة بيع',
  [LOG_TYPES.SALE_RETURN]: 'إرجاع مبيعات',
  [LOG_TYPES.TRANSFER]: 'نقل داخلي',
  [LOG_TYPES.INVENTORY_AUDIT]: 'تسوية جرد',
  [LOG_TYPES.EXCEL_IMPORT]: 'استيراد إكسل',
  [LOG_TYPES.CREATED]: 'إنشاء منتج',
  [LOG_TYPES.DELETED]: 'حذف منتج',
};

/**
 * تسجيل حركة/تعديل في المخزون
 */
export async function logInventoryChange(logData) {
  try {
    const payload = {
      productId: logData.productId || '',
      productName: logData.productName || '',
      sku: logData.sku || '',
      barcode: logData.barcode || '',
      category: logData.category || '',
      sellMode: logData.sellMode || 'piece',
      metersPerRoll: Number(logData.metersPerRoll) || 305,
      type: logData.type || LOG_TYPES.MANUAL_EDIT,
      location: logData.location || 'store', // 'store' | 'warehouse' | 'both'
      
      // Store Quantities
      previousStoreQty: logData.previousStoreQty !== undefined && logData.previousStoreQty !== null ? Number(logData.previousStoreQty) : null,
      newStoreQty: logData.newStoreQty !== undefined && logData.newStoreQty !== null ? Number(logData.newStoreQty) : null,
      storeQtyDiff: logData.storeQtyDiff !== undefined && logData.storeQtyDiff !== null ? Number(logData.storeQtyDiff) : null,
      
      // Warehouse Quantities
      previousWarehouseQty: logData.previousWarehouseQty !== undefined && logData.previousWarehouseQty !== null ? Number(logData.previousWarehouseQty) : null,
      newWarehouseQty: logData.newWarehouseQty !== undefined && logData.newWarehouseQty !== null ? Number(logData.newWarehouseQty) : null,
      warehouseQtyDiff: logData.warehouseQtyDiff !== undefined && logData.warehouseQtyDiff !== null ? Number(logData.warehouseQtyDiff) : null,
      
      reason: logData.reason || '',
      referenceNumber: logData.referenceNumber || '', // e.g. invoice #
      userEmail: logData.userEmail || 'غير محدد',
      createdAt: serverTimestamp(),
    };

    return await addDoc(collection(db, INVENTORY_LOGS_COLLECTION), payload);
  } catch (err) {
    console.error('Failed to log inventory change:', err);
    return null;
  }
}

/**
 * جلب سجل حركات منتج معين
 */
export async function getProductInventoryLogs(productId, maxCount = 50) {
  if (!productId) return [];
  try {
    const q = query(
      collection(db, INVENTORY_LOGS_COLLECTION),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // If composite index is pending, fallback to sorting in-memory
    console.warn('Fallback querying product inventory logs:', err);
    try {
      const fallbackQ = query(
        collection(db, INVENTORY_LOGS_COLLECTION),
        where('productId', '==', productId)
      );
      const snap = await getDocs(fallbackQ);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return list.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0, maxCount);
    } catch (e) {
      console.error('Fallback query error:', e);
      return [];
    }
  }
}

/**
 * جلب أحدث سجلات حركات المخزون الشاملة
 */
export async function getRecentInventoryLogs(maxCount = 100) {
  try {
    const q = query(
      collection(db, INVENTORY_LOGS_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Failed to fetch recent inventory logs:', err);
    return [];
  }
}
