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
import { safeGetDocs } from './offlineDbHelper';

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
  CUSTODY_LOAD: 'custody_load',       // تحميل لسيارة فني
  CUSTODY_RETURN: 'custody_return',   // إرجاع من سيارة فني
  CUSTODY_SALE: 'custody_sale',       // بيع من سيارة فني
  PURCHASE: 'purchase',               // شراء وتوريد
};

export const LOG_TYPE_LABELS_AR = {
  [LOG_TYPES.MANUAL_EDIT]: 'تعديل يدوي',
  [LOG_TYPES.SALE]: 'حركة بيع (محل/مخزن)',
  [LOG_TYPES.SALE_RETURN]: 'إرجاع مبيعات',
  [LOG_TYPES.TRANSFER]: 'نقل داخلي',
  [LOG_TYPES.INVENTORY_AUDIT]: 'تسوية جرد',
  [LOG_TYPES.EXCEL_IMPORT]: 'استيراد إكسل',
  [LOG_TYPES.CREATED]: 'إنشاء منتج',
  [LOG_TYPES.DELETED]: 'حذف منتج',
  [LOG_TYPES.CUSTODY_LOAD]: 'تحميل سيارة فني',
  [LOG_TYPES.CUSTODY_RETURN]: 'إرجاع من سيارة',
  [LOG_TYPES.CUSTODY_SALE]: 'بيع من سيارة الفني',
  [LOG_TYPES.PURCHASE]: 'شراء وتوريد',
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
      location: logData.location || 'store', // 'store' | 'warehouse' | 'both' | 'custody'
      
      // Quantities
      quantity: logData.quantity !== undefined && logData.quantity !== null ? Number(logData.quantity) : null,
      
      // Store Quantities
      previousStoreQty: logData.previousStoreQty !== undefined && logData.previousStoreQty !== null ? Number(logData.previousStoreQty) : null,
      newStoreQty: logData.newStoreQty !== undefined && logData.newStoreQty !== null ? Number(logData.newStoreQty) : null,
      storeQtyDiff: logData.storeQtyDiff !== undefined && logData.storeQtyDiff !== null ? Number(logData.storeQtyDiff) : null,
      
      // Warehouse Quantities
      previousWarehouseQty: logData.previousWarehouseQty !== undefined && logData.previousWarehouseQty !== null ? Number(logData.previousWarehouseQty) : null,
      newWarehouseQty: logData.newWarehouseQty !== undefined && logData.newWarehouseQty !== null ? Number(logData.newWarehouseQty) : null,
      warehouseQtyDiff: logData.warehouseQtyDiff !== undefined && logData.warehouseQtyDiff !== null ? Number(logData.warehouseQtyDiff) : null,
      
      // Technician / Customer / Reference
      technicianId: logData.technicianId || '',
      technicianName: logData.technicianName || '',
      customerName: logData.customerName || '',
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
    const snap = await safeGetDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // If composite index is pending, fallback to sorting in-memory
    console.warn('Fallback querying product inventory logs:', err);
    try {
      const fallbackQ = query(
        collection(db, INVENTORY_LOGS_COLLECTION),
        where('productId', '==', productId)
      );
      const snap = await safeGetDocs(fallbackQ);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return list.sort((a, b) => parseDateSafe(b.createdAt).getTime() - parseDateSafe(a.createdAt).getTime()).slice(0, maxCount);
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
    const snap = await safeGetDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Failed to fetch recent inventory logs:', err);
    return [];
  }
}


/**
 * دالة مساعدة لتحويل أي صيغة تاريخ بشكل آمن دون أخطاء
 */
function parseDateSafe(val) {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {}
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val?.seconds) {
    const d = new Date(val.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * دالة مطابقة دقيقة ومضبوطة للمنتج عبر المعرف، كود الـ SKU، الباركود، أو الاسم المتطابق تماماً
 */
function isItemMatchingProduct(item, targetProduct) {
  if (!item || !targetProduct) return false;

  const targetId = String(targetProduct.id || '').trim();
  const targetSku = String(targetProduct.sku || '').trim().toLowerCase();
  const targetBarcode = String(targetProduct.barcode || '').trim().toLowerCase();
  const targetName = String(targetProduct.name || '').trim().toLowerCase();

  const itemId = String(item.productId || item.id || '').trim();
  const itemSku = String(item.sku || '').trim().toLowerCase();
  const itemBarcode = String(item.barcode || '').trim().toLowerCase();
  const itemName = String(item.name || item.productName || '').trim().toLowerCase();

  // 1) المطابقة المباشرة بالمعرف ID
  if (targetId && itemId && targetId === itemId) return true;

  // 2) المطابقة الدقيقة بكود الـ SKU
  if (targetSku && itemSku && targetSku === itemSku) return true;

  // 3) المطابقة الدقيقة بالباركود
  if (targetBarcode && itemBarcode && targetBarcode === itemBarcode) return true;

  // 4) المطابقة الدقيقة بالاسم الكامل
  if (targetName && itemName && targetName === itemName) return true;

  return false;
}

/**
 * محرك تجميع سجل حركة وتاريخ القطعة الشامل (Comprehensive Product Lifecycle Ledger)
 * يدمج حركات: فواتير المبيعات، فواتير الشراء، حركات الفنيين والسيارات، والتحويلات والتسويات
 */
export async function getComprehensiveProductHistory(product, maxCount = 200) {
  if (!product) return { logs: [], activeCustodies: [], totalInCustody: 0 };

  const normalizedLogs = [];
  const seenEventKeys = new Set();

  // 1. جلب فواتير المبيعات المؤكدة (Sales Invoices)
  try {
    const salesSnap = await safeGetDocs(collection(db, 'sales'));
    const allSales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const confirmedSales = allSales.filter((s) => s.status !== 'deleted' && s.status !== 'draft');

    confirmedSales.forEach((sale) => {
      const items = Array.isArray(sale.items) ? sale.items : [];
      items.forEach((item, idx) => {
        if (item.isService) return;

        if (isItemMatchingProduct(item, product)) {
          const qty = Number(item.quantity) || 1;
          const isCustody = item.source === 'custody' || (sale.stockSource === 'custody' && !item.source);
          const isWarehouse = item.source === 'warehouse' || (sale.stockSource === 'warehouse' && !item.source);

          const dateObj = parseDateSafe(sale.confirmedAt || sale.createdAt || sale.date);
          const eventKey = `sale_${sale.invoiceNumber || sale.id}_${idx}_${item.productId || ''}`;
          seenEventKeys.add(eventKey);

          normalizedLogs.push({
            id: eventKey,
            timestamp: dateObj.getTime(),
            date: dateObj,
            source: 'sale',
            type: isCustody ? LOG_TYPES.CUSTODY_SALE : LOG_TYPES.SALE,
            typeLabel: isCustody ? 'بيع من سيارة الفني' : (isWarehouse ? 'حركة بيع (المخزن)' : 'حركة بيع (المحل)'),
            quantity: -qty,
            storeQtyDiff: isCustody || isWarehouse ? 0 : -qty,
            warehouseQtyDiff: isWarehouse ? -qty : 0,
            previousStoreQty: null,
            newStoreQty: null,
            previousWarehouseQty: null,
            newWarehouseQty: null,
            technicianName: item.technicianName || sale.technicianName || '',
            customerName: sale.customerName || 'زبون نقدي',
            referenceNumber: sale.invoiceNumber || '',
            reason: `فاتورة مبيعات (${sale.paymentMethod === 'debt' ? 'آجل' : 'نقدي'})`,
            userEmail: sale.cashierEmail || 'الكاشير',
          });
        }
      });
    });
  } catch (err) {
    console.error('Error fetching sales history in ledger:', err);
  }

  // 2. جلب فواتير المشتريات والتوريد (Purchases)
  try {
    const purchasesSnap = await safeGetDocs(collection(db, 'purchases'));
    const allPurchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    allPurchases.forEach((purchase) => {
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      items.forEach((item, idx) => {
        if (isItemMatchingProduct(item, product)) {
          const qty = Number(item.quantity) || 1;
          const dateObj = parseDateSafe(purchase.date || purchase.createdAt);
          const eventKey = `purchase_${purchase.invoiceNumber || purchase.id}_${idx}_${item.productId || ''}`;
          seenEventKeys.add(eventKey);

          normalizedLogs.push({
            id: eventKey,
            timestamp: dateObj.getTime(),
            date: dateObj,
            source: 'purchase',
            type: LOG_TYPES.PURCHASE,
            typeLabel: 'شراء وتوريد',
            quantity: qty,
            storeQtyDiff: item.location === 'store' ? qty : 0,
            warehouseQtyDiff: item.location === 'warehouse' ? qty : 0,
            previousStoreQty: null,
            newStoreQty: null,
            previousWarehouseQty: null,
            newWarehouseQty: null,
            technicianName: '',
            customerName: purchase.supplierName || 'مورد',
            referenceNumber: purchase.invoiceNumber || '',
            reason: `توريد من المورد: ${purchase.supplierName || 'غير محدد'}`,
            userEmail: purchase.createdBy || 'المسؤول',
          });
        }
      });
    });
  } catch (err) {
    console.error('Error fetching purchases history in ledger:', err);
  }

  // 3. جلب سجلات حركة العهدة للفنيين (Custody Logs - Load & Return)
  try {
    const custSnap = await safeGetDocs(collection(db, 'custody_logs'));
    const allCustodyLogs = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    allCustodyLogs.forEach((cLog) => {
      // تخطي حركات الصرف المباشر إذا كانت مسجلة مسبقاً من فواتير المبيعات
      if (cLog.action === 'sale_deduction' || cLog.type === 'sale_deduct') {
        if (cLog.invoiceNumber && Array.from(seenEventKeys).some((k) => k.includes(`sale_${cLog.invoiceNumber}`))) {
          return;
        }
      }

      let qty = 0;
      if (cLog.quantity && isItemMatchingProduct(cLog, product)) {
        qty = Number(cLog.quantity) || 0;
      } else if (Array.isArray(cLog.items)) {
        const matchedItem = cLog.items.find((item) => isItemMatchingProduct(item, product));
        qty = matchedItem ? Number(matchedItem.quantity) || 0 : 0;
      }

      if (qty <= 0 && cLog.action !== 'audit_reconciliation' && cLog.type !== 'audit_reconciliation') return;

      const dateObj = parseDateSafe(cLog.createdAt || cLog.date);
      const isReturn = cLog.action === 'return' || cLog.type === 'return';
      const isSaleDeduct = cLog.action === 'sale_deduction' || cLog.type === 'sale_deduct';
      const isAudit = cLog.action === 'audit_reconciliation' || cLog.type === 'audit_reconciliation';

      let mappedType = LOG_TYPES.CUSTODY_LOAD;
      let mappedLabel = 'تحميل لسيارة الفني';
      let signedQty = -qty;

      if (isReturn) {
        mappedType = LOG_TYPES.CUSTODY_RETURN;
        mappedLabel = 'إرجاع من سيارة الفني';
        signedQty = qty;
      } else if (isSaleDeduct) {
        mappedType = LOG_TYPES.CUSTODY_SALE;
        mappedLabel = 'بيع من سيارة الفني';
        signedQty = -qty;
      } else if (isAudit) {
        mappedType = LOG_TYPES.INVENTORY_AUDIT;
        mappedLabel = 'تسوية جرد عهدة';
        signedQty = 0;
      }

      normalizedLogs.push({
        id: `cust_${cLog.id}`,
        timestamp: dateObj.getTime(),
        date: dateObj,
        source: 'custody',
        type: mappedType,
        typeLabel: mappedLabel,
        quantity: signedQty,
        storeQtyDiff: isReturn ? qty : (isSaleDeduct ? 0 : -qty),
        warehouseQtyDiff: 0,
        previousStoreQty: null,
        newStoreQty: null,
        previousWarehouseQty: null,
        newWarehouseQty: null,
        technicianId: cLog.technicianId || '',
        technicianName: cLog.technicianName || 'فني',
        customerName: cLog.customerName || '',
        referenceNumber: cLog.invoiceNumber || cLog.referenceNumber || '',
        reason: cLog.notes || (isReturn ? 'استرجاع بضاعة من السيارة للمحل' : (isSaleDeduct ? 'صرف مبيعات مباشرة' : 'تحميل بضاعة للسيارة')),
        userEmail: cLog.performedBy || cLog.createdBy || cLog.userEmail || 'المسؤول',
      });
    });
  } catch (err) {
    console.error('Error fetching custody logs in ledger:', err);
  }

  // 4. جلب سجلات المخزون المباشرة (Inventory Logs - Manual Edits, Transfers, Audits)
  try {
    const invSnap = await safeGetDocs(collection(db, INVENTORY_LOGS_COLLECTION));
    const allInvLogs = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    allInvLogs.forEach((log) => {
      if (!isItemMatchingProduct(log, product)) return;

      // تجنب التكرار إذا كان اللوغ عن بيع أو شراء مسجل مسبقاً
      if (log.referenceNumber && (log.type === LOG_TYPES.SALE || log.type === LOG_TYPES.PURCHASE)) {
        if (Array.from(seenEventKeys).some((k) => k.includes(`sale_${log.referenceNumber}`) || k.includes(`purchase_${log.referenceNumber}`))) {
          return;
        }
      }

      const dateObj = parseDateSafe(log.createdAt);
      normalizedLogs.push({
        id: `inv_${log.id}`,
        timestamp: dateObj.getTime(),
        date: dateObj,
        source: 'inventory',
        type: log.type || LOG_TYPES.MANUAL_EDIT,
        typeLabel: LOG_TYPE_LABELS_AR[log.type] || log.type || 'حركة مخزون',
        quantity: log.quantity !== null && log.quantity !== undefined ? log.quantity : (log.storeQtyDiff || log.warehouseQtyDiff || 0),
        storeQtyDiff: log.storeQtyDiff,
        warehouseQtyDiff: log.warehouseQtyDiff,
        previousStoreQty: log.previousStoreQty,
        newStoreQty: log.newStoreQty,
        previousWarehouseQty: log.previousWarehouseQty,
        newWarehouseQty: log.newWarehouseQty,
        technicianName: log.technicianName || '',
        customerName: log.customerName || '',
        referenceNumber: log.referenceNumber || '',
        reason: log.reason || '',
        userEmail: log.userEmail || 'المستخدم',
      });
    });
  } catch (err) {
    console.error('Error fetching inventory logs in ledger:', err);
  }

  // 5. جلب الرصيد المتواجد حالياً في سيارات الفنيين (Active Custodies)
  const activeCustodies = [];
  let totalInCustody = 0;
  try {
    const custSnap = await safeGetDocs(collection(db, 'custody_inventory'));
    custSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const items = data.items || [];
      const matched = items.find((i) => isItemMatchingProduct(i, product));
      if (matched && Number(matched.quantity) > 0) {
        const q = Number(matched.quantity);
        totalInCustody += q;
        activeCustodies.push({
          technicianId: docSnap.id,
          technicianName: data.technicianName || 'فني',
          quantity: q,
          vehicleNumber: data.vehicleNumber || '',
        });
      }
    });
  } catch (err) {
    console.warn('Error fetching active custodies:', err);
  }


  // 6. الترتيب الزمني الدقيق من الأحدث للأقدم
  normalizedLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // 7. محرك الحساب العكسي للأرصدة التراكمية (الرصيد قبل وبعد كل حركة)
  // نبدأ من الرصيد الحالي الفعلي المسجل في قاعدة البيانات
  let runningStore = Number(product.storeQty) || 0;
  let runningWarehouse = Number(product.warehouseQty) || 0;
  let runningTotal = runningStore + runningWarehouse + totalInCustody;

  for (let i = 0; i < normalizedLogs.length; i++) {
    const log = normalizedLogs[i];

    // فحص ما إذا كان السجل يحتوي على لقطة صريحة سابقة (مثل التعديل اليدوي أو الجرد)
    const hasStoreSnapshot = log.previousStoreQty !== null && log.previousStoreQty !== undefined &&
                             log.newStoreQty !== null && log.newStoreQty !== undefined;
    const hasWarehouseSnapshot = log.previousWarehouseQty !== null && log.previousWarehouseQty !== undefined &&
                                 log.newWarehouseQty !== null && log.newWarehouseQty !== undefined;

    if (hasStoreSnapshot || hasWarehouseSnapshot) {
      if (hasStoreSnapshot) {
        log.storeBalanceBefore = Number(log.previousStoreQty);
        log.storeBalanceAfter = Number(log.newStoreQty);
        runningStore = log.storeBalanceBefore;
      } else {
        log.storeBalanceAfter = runningStore;
        log.storeBalanceBefore = runningStore - (Number(log.storeQtyDiff) || 0);
        runningStore = log.storeBalanceBefore;
      }

      if (hasWarehouseSnapshot) {
        log.warehouseBalanceBefore = Number(log.previousWarehouseQty);
        log.warehouseBalanceAfter = Number(log.newWarehouseQty);
        runningWarehouse = log.warehouseBalanceBefore;
      } else {
        log.warehouseBalanceAfter = runningWarehouse;
        log.warehouseBalanceBefore = runningWarehouse - (Number(log.warehouseQtyDiff) || 0);
        runningWarehouse = log.warehouseBalanceBefore;
      }

      log.totalBalanceAfter = runningTotal;
      log.totalBalanceBefore = runningTotal - (Number(log.quantity) || 0);
      runningTotal = log.totalBalanceBefore;

      if (hasStoreSnapshot && !hasWarehouseSnapshot) {
        log.balanceBefore = log.storeBalanceBefore;
        log.balanceAfter = log.storeBalanceAfter;
        log.balanceScope = 'store';
      } else if (hasWarehouseSnapshot && !hasStoreSnapshot) {
        log.balanceBefore = log.warehouseBalanceBefore;
        log.balanceAfter = log.warehouseBalanceAfter;
        log.balanceScope = 'warehouse';
      } else {
        log.balanceBefore = log.storeBalanceBefore;
        log.balanceAfter = log.storeBalanceAfter;
        log.balanceScope = 'store';
      }
      continue;
    }

    const storeDiff = Number(log.storeQtyDiff) || 0;
    const whDiff = Number(log.warehouseQtyDiff) || 0;
    const totalDiff = Number(log.quantity) || 0;

    log.storeBalanceAfter = runningStore;
    log.storeBalanceBefore = runningStore - storeDiff;

    log.warehouseBalanceAfter = runningWarehouse;
    log.warehouseBalanceBefore = runningWarehouse - whDiff;

    log.totalBalanceAfter = runningTotal;
    log.totalBalanceBefore = runningTotal - totalDiff;

    if (whDiff !== 0 && storeDiff === 0) {
      log.balanceBefore = log.warehouseBalanceBefore;
      log.balanceAfter = log.warehouseBalanceAfter;
      log.balanceScope = 'warehouse';
    } else if (storeDiff !== 0) {
      log.balanceBefore = log.storeBalanceBefore;
      log.balanceAfter = log.storeBalanceAfter;
      log.balanceScope = 'store';
    } else {
      // حركة عهدة أو حركة إجمالية
      log.balanceBefore = log.totalBalanceBefore;
      log.balanceAfter = log.totalBalanceAfter;
      log.balanceScope = 'total';
    }

    // الرجوع للوراء خطوة زمنية
    runningStore = log.storeBalanceBefore;
    runningWarehouse = log.warehouseBalanceBefore;
    runningTotal = log.totalBalanceBefore;
  }

  return {
    logs: normalizedLogs.slice(0, maxCount),
    activeCustodies,
    totalInCustody,
  };
}


