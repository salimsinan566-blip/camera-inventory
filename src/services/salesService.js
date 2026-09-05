import { 
  writeBatch, 
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { calculateOrderSummary } from '../models/sale';
import { findOrCreateCustomer } from './customersService';
import { moveToTrash } from './trashBinService';
import { 
  runOfflineSafeTransaction, 
  recordLastKnownInvoiceNumber, 
  getNextOfflineInvoiceNumber,
  safeGetDoc,
  safeGetDocs,
  loadLocalBackup,
  BACKUP_KEYS
} from './offlineDbHelper';

const PRODUCTS_COLLECTION = 'products';
const SALES_COLLECTION = 'sales';
const SALES_COUNTER_PATH = ['counters', 'sales'];
const STARTING_INVOICE_NUMBER = 1001;

/** يبحث عن منتج بالباركود الممسوح مع دعم العمل دون اتصال */
export async function findProductByBarcode(barcode) {
  if (!barcode) return null;
  const cleanBarcode = String(barcode).trim();

  // Search in local backup first for instant zero-latency response
  const localList = loadLocalBackup(BACKUP_KEYS.PRODUCTS, []);
  if (Array.isArray(localList) && localList.length > 0) {
    const found = localList.find(p => String(p.barcode || '').trim() === cleanBarcode);
    if (found) return found;
  }

  try {
    const q = query(collection(db, PRODUCTS_COLLECTION), where('barcode', '==', cleanBarcode));
    const snapshot = await safeGetDocs(q);
    if (snapshot.empty) return null;
    const d = snapshot.docs[0];
    return { id: d.id, ...d.data() };
  } catch (err) {
    console.warn('findProductByBarcode query fallback:', err?.message);
    return null;
  }
}


/**
 * يُتمّ عملية بيع: يتحقق من توفر الكمية، ينقصها، وينشئ فاتورة برقم تسلسلي.
 * @param {Array} cartItems - [{ productId, sku, name, quantity, unitPrice }]
 * @param {string} cashierEmail
 * @param {{discount?: number, taxRate?: number, customerName?: string}} orderOptions
 * @returns {Promise<{ invoiceNumber: number, total: number }>}
 * يرمي خطأ واضح لو أي منتج بالسلة كميته الحالية أقل من المطلوب — بدون أي تعديل جزئي.
 */
export async function checkoutSale(cartItems, cashierEmail, orderOptions = {}) {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('السلة فاضية');
  }
  const {
    discount = 0,
    taxRate = 0,
    customerName = '',
    invoiceType = 'cash',
    phone1 = '',
    phone2 = '',
    stockSource = 'store', // 'store' | 'warehouse' | 'custody'
    technicianId = null,
    technicianName = ''
  } = orderOptions;

  // إيجاد/إنشاء العميل للعملاء المسجلين والديون فقط (تجاوز الزبائن النقديين لتسريع العملية فوراً)
  const isGeneric = !customerName || customerName.trim() === 'زبون عام' || customerName.trim() === 'زبون نقدي';
  const customerId = !isGeneric ? await findOrCreateCustomer(customerName, phone1, phone2) : null;

  const counterRef = doc(db, ...SALES_COUNTER_PATH);
  const salesRef = doc(collection(db, SALES_COLLECTION));

  const result = await runOfflineSafeTransaction(db, async (transaction) => {
    // 1) قراءة كل منتجات السلة ومستندات العهد والعداد بالتوازي المتزامن الفوري (Zero-latency parallel read)
    const productRefsMap = {};
    for (const item of cartItems) {
      if (!item.isService && item.productId && !productRefsMap[item.productId]) {
        productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
      }
    }
    
    // جمع كل الفنيين المشاركين في بنود العهدة بالسلة
    const custodyTechIds = [...new Set(
      cartItems
        .filter(item => !item.isService && (item.source === 'custody' || (stockSource === 'custody' && !item.source)))
        .map(item => item.technicianId || technicianId)
        .filter(Boolean)
    )];

    const custodyRefsMap = {};
    for (const tId of custodyTechIds) {
      custodyRefsMap[tId] = doc(db, 'custody_inventory', tId);
    }

    const productEntries = Object.entries(productRefsMap);
    const custodyEntries = Object.entries(custodyRefsMap);

    // جلب كل المستندات بطلب شبكة متزامن واحد
    const [counterSnap, ...allSnaps] = await Promise.all([
      transaction.get(counterRef),
      ...custodyEntries.map(([_, ref]) => transaction.get(ref)),
      ...productEntries.map(([_, ref]) => transaction.get(ref))
    ]);

    const custodySnapsMap = {};
    custodyEntries.forEach(([tId], index) => {
      custodySnapsMap[tId] = allSnaps[index];
    });

    const productSnapsMap = {};
    const custodyCount = custodyEntries.length;
    productEntries.forEach(([pId], index) => {
      productSnapsMap[pId] = allSnaps[custodyCount + index];
    });

    // تجهيز مساحات العمل لعهد الفنيين
    const custodyWorkingMap = {};
    for (const [tId, snap] of Object.entries(custodySnapsMap)) {
      if (!snap || !snap.exists()) {
        throw new Error(`لا توجد عهدة مسجلة للفني: ${tId}`);
      }
      const cData = snap.data();
      custodyWorkingMap[tId] = {
        ref: custodyRefsMap[tId],
        technicianName: cData.technicianName || technicianName || '',
        items: [...(cData.items || [])],
        deductedItems: []
      };
    }

    // 2) التحقق من توفر الكميات وتجهيز الخصومات لكل بند بحسب مصدره الخاص
    const storeDeductions = {};
    const warehouseDeductions = {};
    const items = [];

    for (const cartItem of cartItems) {
      if (cartItem.isService) {
        items.push({
          productId: cartItem.productId,
          sku: cartItem.sku || '-',
          name: cartItem.name,
          quantity: cartItem.quantity,
          unitPrice: cartItem.unitPrice,
          originalPrice: cartItem.originalPrice || cartItem.unitPrice,
          wholesalePrice: cartItem.wholesalePrice || 0,
          sellMode: cartItem.sellMode || 'unit',
          lineTotal: cartItem.quantity * cartItem.unitPrice,
          isService: true,
          source: 'service',
        });
        continue;
      }

      const snap = productSnapsMap[cartItem.productId];
      if (!snap || !snap.exists()) {
        throw new Error(`المنتج "${cartItem.name}" لم يعد موجوداً`);
      }
      const pData = snap.data();

      // تحديد مصدر الصنف (من السطر نفسه أو من المصدر العام للطلب)
      const itemSource = cartItem.source || (cartItem.isCustody ? 'custody' : stockSource);
      const itemTechId = cartItem.technicianId || technicianId;
      const itemTechName = cartItem.technicianName || technicianName || (itemTechId && custodyWorkingMap[itemTechId]?.technicianName) || '';

      if (itemSource === 'custody') {
        if (!itemTechId || !custodyWorkingMap[itemTechId]) {
          throw new Error(`يرجى تحديد الفني لخصم المادة "${cartItem.name}" من عهدته`);
        }
        const techEntry = custodyWorkingMap[itemTechId];
        const cIdx = techEntry.items.findIndex(ci => ci.productId === cartItem.productId);
        const inCustodyQty = cIdx >= 0 ? (Number(techEntry.items[cIdx].quantity) || 0) : 0;
        if (inCustodyQty < cartItem.quantity) {
          throw new Error(
            `الكمية المتوفرة في سيارة الفني (${techEntry.technicianName || itemTechName}) من "${cartItem.name}" هي ${inCustodyQty} فقط (مطلوب ${cartItem.quantity})`
          );
        }
        techEntry.items[cIdx].quantity = inCustodyQty - cartItem.quantity;
        techEntry.deductedItems.push({
          productId: cartItem.productId,
          name: cartItem.name,
          quantity: cartItem.quantity,
          sku: cartItem.sku || '',
          price: cartItem.unitPrice || 0,
          cameraType: cartItem.cameraType || ''
        });
      } else if (itemSource === 'warehouse') {
        const availableWarehouseQty = Number(pData.warehouseQty) || 0;
        const currentDeducted = warehouseDeductions[cartItem.productId] || 0;
        if (availableWarehouseQty < currentDeducted + cartItem.quantity) {
          throw new Error(
            `الكمية المتوفرة في المخزن من "${cartItem.name}" هي ${availableWarehouseQty} فقط (مطلوب ${currentDeducted + cartItem.quantity})`
          );
        }
        warehouseDeductions[cartItem.productId] = currentDeducted + cartItem.quantity;
      } else {
        // Store
        const availableStoreQty = Number(pData.storeQty) || 0;
        const currentDeducted = storeDeductions[cartItem.productId] || 0;
        if (availableStoreQty < currentDeducted + cartItem.quantity) {
          throw new Error(
            `الكمية المتوفرة في المحل من "${cartItem.name}" هي ${availableStoreQty} فقط (مطلوب ${currentDeducted + cartItem.quantity})`
          );
        }
        storeDeductions[cartItem.productId] = currentDeducted + cartItem.quantity;
      }

      items.push({
        productId: cartItem.productId,
        sku: cartItem.sku || '',
        name: cartItem.name,
        cameraType: cartItem.cameraType || '',
        quantity: cartItem.quantity,
        unitPrice: cartItem.unitPrice,
        wholesalePrice: cartItem.wholesalePrice || 0,
        sellMode: cartItem.sellMode || 'unit',
        lineTotal: cartItem.quantity * cartItem.unitPrice,
        isService: false,
        source: itemSource,
        technicianId: itemSource === 'custody' ? itemTechId : null,
        technicianName: itemSource === 'custody' ? (itemTechName || techEntry?.technicianName || '') : '',
      });
    }

    const summary = calculateOrderSummary(cartItems, discount, taxRate);

    // 3) توليد رقم الفاتورة التسلسلي مع حماية أوفلاين
    const nextInvoiceNumber = (counterSnap && counterSnap.exists() && counterSnap.data()?.next)
      ? Number(counterSnap.data().next)
      : getNextOfflineInvoiceNumber();
    recordLastKnownInvoiceNumber(nextInvoiceNumber);

    // 4) تنفيذ كل الكتابات: إنقاص كميات العهد + المحل + المخزن + إنشاء السجلات
    const saleNowIso = new Date().toISOString();
    const saleDateStr = saleNowIso.slice(0, 10);

    // تحديث عهد الفنيين
    for (const [tId, techEntry] of Object.entries(custodyWorkingMap)) {
      if (techEntry.deductedItems.length === 0) continue;

      const cleanedCustody = techEntry.items.filter(i => Number(i.quantity) > 0);
      const totalCost = cleanedCustody.reduce((s, i) => s + (Number(i.costPrice || i.wholesalePrice) || 0) * Number(i.quantity), 0);
      const totalRetail = cleanedCustody.reduce((s, i) => s + (Number(i.retailPrice) || 0) * Number(i.quantity), 0);

      transaction.set(techEntry.ref, {
        items: cleanedCustody,
        totalCost,
        totalRetail,
        totalItemsCount: cleanedCustody.reduce((s, i) => s + Number(i.quantity), 0),
        lastUpdated: saleNowIso
      }, { merge: true });

      // تسجيل حركة الصرف في سجل العهد
      const cLogRef = doc(collection(db, 'custody_logs'));
      transaction.set(cLogRef, {
        type: 'sale_deduct',
        technicianId: tId,
        technicianName: techEntry.technicianName,
        invoiceNumber: nextInvoiceNumber,
        customerName: customerName || 'زبون نقدي',
        items: techEntry.deductedItems,
        totalQuantity: techEntry.deductedItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        notes: `صرف بيع مباشر - فاتورة رقم: ${nextInvoiceNumber} (${customerName || 'زبون نقدي'})`,
        performedBy: cashierEmail,
        date: saleDateStr,
        createdAt: saleNowIso
      });
    }

    // تحديث منتجات المحل
    for (const [pId, qty] of Object.entries(storeDeductions)) {
      const snap = productSnapsMap[pId];
      const ref = productRefsMap[pId];
      const currentQty = Number(snap.data().storeQty) || 0;
      transaction.update(ref, { storeQty: currentQty - qty });
    }

    // تحديث منتجات المخزن
    for (const [pId, qty] of Object.entries(warehouseDeductions)) {
      const snap = productSnapsMap[pId];
      const ref = productRefsMap[pId];
      const currentQty = Number(snap.data().warehouseQty) || 0;
      transaction.update(ref, { warehouseQty: currentQty - qty });
    }

    // تحديد وصف مصدر المخزون للفاتورة
    const distinctSources = [...new Set(items.filter(i => !i.isService).map(i => i.source))];
    const overallStockSource = distinctSources.length === 1 ? distinctSources[0] : (distinctSources.length > 1 ? 'mixed' : stockSource);

    transaction.set(counterRef, { next: nextInvoiceNumber + 1 }, { merge: true });
    transaction.set(salesRef, {
      invoiceNumber: nextInvoiceNumber,
      status: 'confirmed',
      items,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      customerId,
      customerName: customerName || null,
      phone1: phone1 || '',
      phone2: phone2 || '',
      invoiceType,
      paymentMethod: orderOptions?.paymentMethod || (invoiceType === 'mastercard' ? 'mastercard' : (invoiceType === 'debt' ? 'debt' : 'cash')),
      stockSource: overallStockSource,
      stockSourcesList: distinctSources,
      technicianId: custodyTechIds[0] || null,
      technicianName: custodyWorkingMap[custodyTechIds[0]]?.technicianName || technicianName || null,
      cashierEmail,
      createdAt: serverTimestamp(),
      confirmedAt: serverTimestamp(),
    });

    // تسجيل حركة المبيعات في سجل حركات المخزون لكل مادة
    for (const item of items) {
      if (item.isService || !item.productId) continue;
      const invLogRef = doc(collection(db, 'inventory_logs'));
      const isCustody = item.source === 'custody';
      const isWarehouse = item.source === 'warehouse';

      transaction.set(invLogRef, {
        productId: item.productId,
        productName: item.name || '',
        sku: item.sku || '',
        type: isCustody ? 'custody_sale' : 'sale',
        location: isCustody ? 'custody' : (isWarehouse ? 'warehouse' : 'store'),
        quantity: item.quantity,
        storeQtyDiff: isCustody || isWarehouse ? 0 : -item.quantity,
        warehouseQtyDiff: isWarehouse ? -item.quantity : 0,
        technicianName: item.technicianName || '',
        customerName: customerName || 'زبون نقدي',
        referenceNumber: nextInvoiceNumber,
        reason: `فاتورة بيع رقم: ${nextInvoiceNumber}`,
        userEmail: cashierEmail || 'الكاشير',
        createdAt: new Date().toISOString()
      });
    }

    return {
      invoiceNumber: nextInvoiceNumber,
      status: 'confirmed',
      items,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      customerName: customerName || null,
      phone1: phone1 || '',
      phone2: phone2 || '',
      invoiceType,
      stockSource: overallStockSource,
      stockSourcesList: distinctSources,
      technicianId: custodyTechIds[0] || null,
      technicianName: custodyWorkingMap[custodyTechIds[0]]?.technicianName || technicianName || null,
      cashierEmail,
      createdAt: new Date(),
    };
  });

  return result;
}

/**
 * ==========================================================
 * الفواتير المؤقتة (Draft) — حفظ، تعديل، حذف، وتأكيد لاحقاً
 * ==========================================================
 * الفاتورة المؤقتة لا تُنقص أي كمية من المخزون ولا تأخذ رقم فاتورة
 * رسمي — هذا يصير فقط عند "التأكيد". فتقدر تسوي، تعدّل، أو تحذف
 * فواتير مؤقتة براحتك بدون أي أثر على المخزون الفعلي.
 */

export function buildDraftItems(cartItems) {
  return cartItems.map((item) => ({
    cartItemId: item.cartItemId || `${item.productId}_${item.source || 'store'}_${item.technicianId || ''}`,
    productId: item.productId,
    sku: item.sku || '',
    name: item.name || '',
    cameraType: item.cameraType || '',
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice) || 0,
    originalPrice: item.originalPrice || item.unitPrice,
    wholesalePrice: Number(item.wholesalePrice) || 0,
    sellMode: item.sellMode || 'unit',
    lineTotal: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
    isService: item.isService || false,
    source: item.source || 'store',
    technicianId: item.technicianId || null,
    technicianName: item.technicianName || '',
    isCustody: item.source === 'custody'
  }));
}

/** ينشئ فاتورة معلقة جديدة ويحجز المخزون فوراً */
export async function createDraftSale(cartItems, cashierEmail, orderOptions = {}) {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('السلة فاضية');
  }
  const { discount = 0, taxRate = 0, customerName = '', invoiceType = 'cash', phone1 = '', phone2 = '' } = orderOptions;
  const items = buildDraftItems(cartItems);
  const summary = calculateOrderSummary(cartItems, discount, taxRate);

  const draftRef = doc(collection(db, SALES_COLLECTION));

  await runOfflineSafeTransaction(db, async (transaction) => {
    const productRefsMap = {};
    for (const item of items) {
      if (!item.isService) productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
    }
    
    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }

    // التحقق من الكمية قبل الحجز
    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      if (!snap || !snap.exists()) throw new Error(`المنتج "${item.name}" غير موجود`);
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      if (currentStoreQty < item.quantity) {
        throw new Error(`الكمية المتوفرة من "${item.name}" هي ${currentStoreQty} فقط (مطلوب ${item.quantity})`);
      }
    }

    // الخصم من المتوفر والإضافة للمعلق
    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      const currentPendingQty = Number(snap.data().pendingQty) || 0;
      transaction.update(productRefsMap[item.productId], {
        storeQty: currentStoreQty - item.quantity,
        pendingQty: currentPendingQty + item.quantity,
      });
    }

    const payload = {
      status: 'suspended',
      items,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      customerName: customerName || null,
      phone1,
      phone2,
      invoiceType,
      cashierEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(draftRef, payload);
  });

  return draftRef.id;
}

/** يحدّث فاتورة معلقة (يُرجع الكميات القديمة ويحجز الكميات الجديدة) */
export async function updateDraftSale(draftId, cartItems, orderOptions = {}) {
  const { discount = 0, taxRate = 0, customerName = '', invoiceType = 'cash', phone1 = '', phone2 = '' } = orderOptions;
  const newItems = buildDraftItems(cartItems);
  const summary = calculateOrderSummary(cartItems, discount, taxRate);
  const draftRef = doc(db, SALES_COLLECTION, draftId);

  await runOfflineSafeTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) throw new Error('الفاتورة غير موجودة');
    const oldData = draftSnap.data();
    const oldItems = oldData.items || [];

    // جمع كافة المنتجات (القديمة والجديدة) لقرائتها
    const allProductIds = new Set([
      ...oldItems.map(i => i.productId),
      ...newItems.map(i => i.productId)
    ]);

    const productRefsMap = {};
    for (const id of allProductIds) {
      if (id) productRefsMap[id] = doc(db, PRODUCTS_COLLECTION, id);
    }

    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }

    // 1) إرجاع الكميات القديمة مؤقتاً لحساب الميزانية
    const tempStoreQty = {};
    const tempPendingQty = {};

    for (const [id, snap] of Object.entries(productSnapsMap)) {
      if (snap && snap.exists()) {
        tempStoreQty[id] = Number(snap.data().storeQty) || 0;
        tempPendingQty[id] = Number(snap.data().pendingQty) || 0;
      }
    }

    // إذا كانت الفاتورة السابقة معلقة، نعيد كمياتها للمتغيرات المؤقتة
    if (oldData.status === 'suspended') {
      for (const item of oldItems) {
        if (item.isService || tempStoreQty[item.productId] === undefined) continue;
        tempStoreQty[item.productId] += item.quantity;
        tempPendingQty[item.productId] = Math.max(0, tempPendingQty[item.productId] - item.quantity);
      }
    }

    // 2) التحقق من توفر الكميات الجديدة بعد الإرجاع
    for (const item of newItems) {
      if (item.isService) continue;
      const available = tempStoreQty[item.productId] || 0;
      if (available < item.quantity) {
        throw new Error(`الكمية المتوفرة من "${item.name}" هي ${available} فقط (مطلوب ${item.quantity})`);
      }
    }

    // 3) تطبيق الكميات الجديدة
    for (const item of newItems) {
      if (item.isService) continue;
      tempStoreQty[item.productId] -= item.quantity;
      tempPendingQty[item.productId] += item.quantity;
    }

    // 4) حفظ التعديلات في قاعدة البيانات
    for (const id of allProductIds) {
      if (!productRefsMap[id] || !productSnapsMap[id]?.exists()) continue;
      transaction.update(productRefsMap[id], {
        storeQty: tempStoreQty[id],
        pendingQty: tempPendingQty[id]
      });
    }

    transaction.update(draftRef, {
      status: 'suspended',
      items: newItems,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      customerName: customerName || null,
      phone1,
      phone2,
      invoiceType,
      updatedAt: serverTimestamp(),
    });
  });
}

/** يحذف فاتورة (مؤقتة أو معلقة). إذا كانت معلقة، يُرجع المخزون المحجوز، وينقلها لسلة المحذوفات. */
export async function deleteDraftSale(draftId, userEmail = 'سالم سنان') {
  const draftRef = doc(db, SALES_COLLECTION, draftId);
  const draftSnap = await getDoc(draftRef);
  if (!draftSnap.exists()) return;
  const draftData = draftSnap.data();

  // حفظ الفاتورة المعلقة في سلة المحذوفات تلقائياً
  try {
    await moveToTrash({
      itemType: 'draft_sale',
      originalCollection: SALES_COLLECTION,
      docId: draftId,
      data: draftData,
      title: `فاتورة معلقة #${draftData.invoiceNumber || draftId.slice(-4)}`,
      subtitle: `${draftData.customerName || 'زبون عام'} • ${Number(draftData.total || 0).toLocaleString()} د.ع`,
      userEmail: userEmail || 'سالم سنان'
    });
  } catch (tErr) {
    console.warn('Could not backup draft to trash bin:', tErr);
  }

  if (draftData.status === 'suspended') {
    // إرجاع الكميات المحجوزة
    await runOfflineSafeTransaction(db, async (transaction) => {
      const items = draftData.items || [];
      const productRefsMap = {};
      for (const item of items) {
        if (!item.isService) productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
      }
      
      const productSnapsMap = {};
      for (const [id, ref] of Object.entries(productRefsMap)) {
        productSnapsMap[id] = await transaction.get(ref);
      }

      for (const item of items) {
        if (item.isService) continue;
        const snap = productSnapsMap[item.productId];
        if (snap && snap.exists()) {
          const currentStoreQty = Number(snap.data().storeQty) || 0;
          const currentPendingQty = Number(snap.data().pendingQty) || 0;
          transaction.update(productRefsMap[item.productId], {
            storeQty: currentStoreQty + item.quantity,
            pendingQty: Math.max(0, currentPendingQty - item.quantity),
          });
        }
      }
      transaction.delete(draftRef);
    });
  } else {
    // فاتورة مؤقتة عادية لم تحجز أي مخزون
    await deleteDoc(draftRef);
  }
}

/** يحوّل الفاتورة المؤقتة إلى معلقة (ويحجز المخزون) */
export async function suspendSale(draftId) {
  const draftRef = doc(db, SALES_COLLECTION, draftId);
  await runOfflineSafeTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) throw new Error('الفاتورة غير موجودة');
    const draftData = draftSnap.data();
    
    if (draftData.status === 'suspended') return; // معلقة مسبقاً
    
    const items = draftData.items || [];
    const productRefsMap = {};
    for (const item of items) {
      if (!item.isService) productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
    }
    
    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }

    // التحقق من الكميات قبل الخصم
    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      if (!snap || !snap.exists()) throw new Error(`المنتج "${item.name}" غير موجود`);
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      if (currentStoreQty < item.quantity) {
        throw new Error(`الكمية المتوفرة من "${item.name}" هي ${currentStoreQty} فقط (مطلوب ${item.quantity})`);
      }
    }

    // التنفيذ الفعلي: خصم من المتوفر وزيادة في المعلق
    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      const currentPendingQty = Number(snap.data().pendingQty) || 0;
      transaction.update(productRefsMap[item.productId], {
        storeQty: currentStoreQty - item.quantity,
        pendingQty: currentPendingQty + item.quantity,
      });
    }
    
    transaction.update(draftRef, { status: 'suspended', updatedAt: serverTimestamp() });
  });
}

/** يُلغي تعليق الفاتورة ويعيدها كمؤقتة (يحرر المخزون المحجوز) */
export async function unsuspendSale(draftId) {
  const draftRef = doc(db, SALES_COLLECTION, draftId);
  await runOfflineSafeTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) throw new Error('الفاتورة غير موجودة');
    const draftData = draftSnap.data();
    
    if (draftData.status !== 'suspended') return; // ليست معلقة
    
    const items = draftData.items || [];
    const productRefsMap = {};
    for (const item of items) {
      if (!item.isService) productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
    }
    
    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }

    // التنفيذ الفعلي: إرجاع للمتوفر وخصم من المعلق
    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      if (snap && snap.exists()) {
        const currentStoreQty = Number(snap.data().storeQty) || 0;
        const currentPendingQty = Number(snap.data().pendingQty) || 0;
        transaction.update(productRefsMap[item.productId], {
          storeQty: currentStoreQty + item.quantity,
          pendingQty: Math.max(0, currentPendingQty - item.quantity),
        });
      }
    }
    
    transaction.update(draftRef, { status: 'draft', updatedAt: serverTimestamp() });
  });
}

/**
 * يؤكّد فاتورة مؤقتة: نفس منطق الاستقرار بـ checkoutSale — يتحقق من
 * توفر الكمية لكل صنف، ينقصها، يولّد رقم فاتورة تسلسلي، ويحوّل حالة
 * نفس المستند من "draft" إلى "confirmed" (بدون إنشاء مستند جديد).
 */
export async function confirmDraftSale(draftId, cashierEmail, invoiceType = null) {
  const counterRef = doc(db, ...SALES_COUNTER_PATH);
  const draftRef = doc(db, SALES_COLLECTION, draftId);

  // نقرأ بيانات المسودة أولاً (خارج الـ Transaction) لمعرفة اسم العميل المطلوب حلّه
  const draftPreviewSnap = await getDoc(draftRef);
  const previewData = draftPreviewSnap.data();
  const customerId = previewData?.customerName
    ? await findOrCreateCustomer(previewData.customerName, previewData.phone1 || '', previewData.phone2 || '')
    : null;

  const result = await runOfflineSafeTransaction(db, async (transaction) => {
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists()) {
      throw new Error('الفاتورة المؤقتة لم تعد موجودة');
    }
    const draftData = draftSnap.data();
    const items = draftData.items || [];
    if (items.length === 0) {
      throw new Error('الفاتورة فاضية');
    }

    const productRefsMap = {};
    for (const item of items) {
      if (!item.isService) {
        productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
      }
    }
    
    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }
    const counterSnap = await transaction.get(counterRef);

    for (const item of items) {
      if (item.isService) continue;
      
      const snap = productSnapsMap[item.productId];
      if (!snap || !snap.exists()) {
        throw new Error(`المنتج "${item.name}" لم يعد موجوداً`);
      }
      
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      
      if (draftData.status === 'suspended') {
        // الفاتورة معلقة (تم خصم المتوفر مسبقاً)، لا حاجة للتحقق من المتوفر هنا
      } else {
        // الفاتورة مؤقتة، يجب التحقق من المتوفر
        if (currentStoreQty < item.quantity) {
          throw new Error(
            `الكمية المتوفرة في المحل من "${item.name}" هي ${currentStoreQty} فقط (مطلوب ${item.quantity})`
          );
        }
      }
    }

    const existingInvoiceNumber = draftData.invoiceNumber;
    let nextInvoiceNumber = existingInvoiceNumber;

    if (!existingInvoiceNumber) {
      nextInvoiceNumber = (counterSnap && counterSnap.exists() && counterSnap.data()?.next)
        ? Number(counterSnap.data().next)
        : getNextOfflineInvoiceNumber();
      recordLastKnownInvoiceNumber(nextInvoiceNumber);
      transaction.set(counterRef, { next: nextInvoiceNumber + 1 }, { merge: true });
    }


    for (const item of items) {
      if (item.isService) continue;
      const ref = productRefsMap[item.productId];
      const snap = productSnapsMap[item.productId];
      const currentStoreQty = Number(snap.data().storeQty) || 0;
      const currentPendingQty = Number(snap.data().pendingQty) || 0;
      
      if (draftData.status === 'suspended') {
        // خصم من المعلق فقط
        transaction.update(ref, { 
          pendingQty: Math.max(0, currentPendingQty - item.quantity) 
        });
      } else {
        // خصم من المتوفر
        transaction.update(ref, { 
          storeQty: currentStoreQty - item.quantity 
        });
      }
    }
    
    transaction.update(draftRef, {
      status: 'confirmed',
      invoiceNumber: nextInvoiceNumber,
      customerId,
      ...(invoiceType ? { invoiceType } : {}),
      cashierEmail,
      confirmedAt: serverTimestamp(),
    });

    return {
      invoiceNumber: nextInvoiceNumber,
      items,
      subtotal: draftData.subtotal,
      discount: draftData.discount || 0,
      taxRate: draftData.taxRate || 0,
      total: draftData.total,
      customerName: draftData.customerName || null,
      phone1: draftData.phone1 || '',
      phone2: draftData.phone2 || '',
      invoiceType: invoiceType || draftData.invoiceType || 'cash',
      cashierEmail,
      createdAt: new Date(),
    };
  });

  return result;
}

/** 
 * إرجاع فاتورة مؤكدة إلى فاتورة معلقة. 
 * لا يرجع المتوفر، فقط يزيد الكمية المعلقة ويغير حالة الفاتورة.
 */
export async function revertSaleToSuspended(saleId) {
  const saleRef = doc(db, SALES_COLLECTION, saleId);

  await runOfflineSafeTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }
    const saleData = saleSnap.data();
    
    if (saleData.status !== 'confirmed') {
      throw new Error('يمكن إرجاع الفواتير المؤكدة فقط');
    }

    const items = saleData.items || [];
    const productRefsMap = {};
    for (const item of items) {
      if (!item.isService) {
        productRefsMap[item.productId] = doc(db, PRODUCTS_COLLECTION, item.productId);
      }
    }
    
    const productSnapsMap = {};
    for (const [id, ref] of Object.entries(productRefsMap)) {
      productSnapsMap[id] = await transaction.get(ref);
    }

    for (const item of items) {
      if (item.isService) continue;
      const snap = productSnapsMap[item.productId];
      if (!snap || !snap.exists()) continue; // إذا انحذف المنتج لا نسوي شي
      const currentPendingQty = Number(snap.data().pendingQty) || 0;
      
      transaction.update(productRefsMap[item.productId], {
        pendingQty: currentPendingQty + item.quantity
      });
    }

    transaction.update(saleRef, {
      status: 'suspended',
      updatedAt: serverTimestamp()
    });
  });
}

/**
 * ==========================================================
 * التعديل والمرتجعات (Returns & Exchanges)
 * ==========================================================
 * يسمح بتعديل فاتورة مؤكدة. يقارن العناصر القديمة بالجديدة، 
 * ويعيد المخزون للقطع المحذوفة أو يقلله للقطع المضافة حديثاً.
 * يسجل التغييرات في مصفوفة historyLogs داخل المستند.
 */
export async function editConfirmedSale(saleId, newCartItems = [], orderOptions, cashierEmail) {

  const { discount = 0, taxRate = 0, customerName = '', invoiceType = 'cash', phone1 = '', phone2 = '' } = orderOptions;
  const customerId = customerName ? await findOrCreateCustomer(customerName, phone1, phone2) : null;
  const saleRef = doc(db, SALES_COLLECTION, saleId);

  const result = await runOfflineSafeTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }
    const saleData = saleSnap.data();
    if (saleData.status !== 'confirmed') {
      throw new Error('هذه الفاتورة ليست مؤكدة ولا يمكن تعديلها من هنا');
    }

    const oldItems = saleData.items || [];
    
    const productIdsSet = new Set([
      ...oldItems.filter(i => !i.isService).map(i => i.productId),
      ...newCartItems.filter(i => !i.isService).map(i => i.productId)
    ]);
    const productIds = Array.from(productIdsSet);
    const productRefs = productIds.map(id => doc(db, PRODUCTS_COLLECTION, id));
    const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    
    const productsMap = {};
    productSnaps.forEach(snap => {
      if (snap.exists()) {
        productsMap[snap.id] = snap.data();
      }
    });

    const deltas = {}; 
    oldItems.forEach(item => {
      deltas[item.productId] = -(item.quantity || 0); 
    });

    newCartItems.forEach(item => {
      deltas[item.productId] = (deltas[item.productId] || 0) + (item.quantity || 0); 
    });

    const logs = [];
    const updatedItems = [];

    for (const item of newCartItems) {
      const pid = item.productId;
      const delta = deltas[pid] || 0;
      const oldItem = oldItems.find(o => o.productId === item.productId);
      
      if (delta > 0) {
        if (!item.isService) {
          const pData = productsMap[pid];
          if (!pData) throw new Error(`المنتج "${item.name}" غير موجود في قاعدة البيانات`);
          const currentQty = Number(pData.storeQty) || 0;
          if (currentQty < delta) {
            throw new Error(`الكمية المتوفرة في المحل من "${item.name}" هي ${currentQty} (مطلوب إضافة ${delta} إضافية)`);
          }
        }
        logs.push(`إضافة ${delta}x ${item.name}`);
      } else if (delta < 0) {
        logs.push(`إرجاع ${Math.abs(delta)}x ${item.name}`);
      }

      // Check if price changed for this item
      if (oldItem && Number(oldItem.unitPrice || 0) !== Number(item.unitPrice || 0)) {
        logs.push(`تعديل سعر "${item.name}" من ${oldItem.unitPrice || 0} إلى ${item.unitPrice || 0} د.ع`);
      }

      updatedItems.push({
        productId: item.productId,
        sku: item.sku || oldItem?.sku || '',
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice) || 0,
        originalPrice: item.originalPrice || oldItem?.originalPrice || item.unitPrice,
        wholesalePrice: item.wholesalePrice ?? oldItem?.wholesalePrice ?? 0,
        sellMode: item.sellMode || oldItem?.sellMode || 'unit',
        lineTotal: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
        isService: item.isService || false
      });
    }

    oldItems.forEach(oldItem => {
      if (!newCartItems.find(n => n.productId === oldItem.productId)) {
        logs.push(`إرجاع ${oldItem.quantity}x ${oldItem.name} (حذف)`);
      }
    });

    if (logs.length === 0 && 
        saleData.discount === discount && 
        saleData.taxRate === taxRate && 
        saleData.invoiceType === invoiceType &&
        saleData.customerName === customerName) {
      throw new Error('لم تقم بإجراء أي تغييرات.');
    }

    for (const pid of productIds) {
      const delta = deltas[pid] || 0;
      if (delta !== 0) {
        const pData = productsMap[pid];
        if (pData) {
          const currentQty = Number(pData.storeQty) || 0;
          transaction.update(doc(db, PRODUCTS_COLLECTION, pid), { storeQty: currentQty - delta });
        }
      }
    }

    const summary = calculateOrderSummary(updatedItems, discount, taxRate);
    const paidAmount = Number(saleData.paidAmount) || 0;
    const remainingDebt = invoiceType === 'debt' ? Math.max(0, summary.total - paidAmount) : 0;
    const isSettled = invoiceType === 'debt' ? remainingDebt <= 0 : true;

    const historyLogs = saleData.historyLogs || [];
    const logEntry = {
      date: new Date(),
      cashierEmail,
      action: logs.length > 0 ? logs.join('، ') : 'تعديل بيانات الفاتورة'
    };
    
    transaction.update(saleRef, {
      items: updatedItems,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      paidAmount,
      remainingDebt,
      isSettled,
      invoiceType,
      customerId,
      customerName: customerName || null,
      phone1: phone1 || '',
      phone2: phone2 || '',
      updatedAt: serverTimestamp(),
      historyLogs: [...historyLogs, logEntry]
    });

    return {
      id: saleId,
      ...saleData,
      items: updatedItems,
      subtotal: summary.subtotal,
      discount: summary.discount,
      taxRate: summary.taxRate,
      total: summary.total,
      invoiceType,
      customerName: customerName || null,
      phone1: phone1 || '',
      phone2: phone2 || '',
      historyLogs: [...historyLogs, logEntry]
    };
  });
  return result;
}

/**
 * حذف فاتورة مؤكدة وإرجاع المنتجات إلى المحل ونقلها لسلة المحذوفات.
 */
export async function deleteConfirmedSale(saleId, userEmail = 'سالم سنان') {
  const saleRef = doc(db, SALES_COLLECTION, saleId);
  const saleSnap = await getDoc(saleRef);
  if (saleSnap.exists()) {
    const saleData = saleSnap.data();
    try {
      await moveToTrash({
        itemType: 'confirmed_sale',
        originalCollection: SALES_COLLECTION,
        docId: saleId,
        data: saleData,
        title: `فاتورة مبيعات #${saleData.invoiceNumber || saleId}`,
        subtitle: `${saleData.customerName || 'زبون عام'} • ${Number(saleData.total || 0).toLocaleString()} د.ع`,
        userEmail: userEmail || 'سالم سنان'
      });
    } catch (tErr) {
      console.warn('Could not backup confirmed sale to trash bin:', tErr);
    }
  }

  await runOfflineSafeTransaction(db, async (transaction) => {
    const sSnap = await transaction.get(saleRef);
    if (!sSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }

    const saleData = sSnap.data();
    if (saleData.status !== 'confirmed') {
      throw new Error('هذه الفاتورة ليست فاتورة مؤكدة');
    }

    // 1. جميع عمليات القراءة (Reads) أولاً
    const items = saleData.items || [];
    const productRefs = items.map((item) => doc(db, PRODUCTS_COLLECTION, item.productId));
    const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));

    // 2. جميع عمليات الكتابة (Writes) ثانياً
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const snap = productSnaps[i];
      if (snap.exists()) {
        const currentQty = Number(snap.data().storeQty) || 0;
        transaction.update(productRefs[i], { storeQty: currentQty + item.quantity });
      }
    }

    // 3. حذف الفاتورة
    transaction.delete(saleRef);
  });
}

/**
 * تسجيل دفعة تسديد دين لفاتورة بيع معينة
 * @param {string} saleId - معرف الفاتورة
 * @param {number} amount - المبلغ المسدد
 * @param {{ paymentMethod?: string, notes?: string, receivedBy?: string, date?: string }} paymentDetails
 */
export async function recordCustomerDebtPayment(saleId, amount, paymentDetails = {}) {
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('يرجى إدخال مبلغ تسديد صالح أكبر من الصفر');
  }

  const saleRef = doc(db, SALES_COLLECTION, saleId);
  return await runOfflineSafeTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }
    const saleData = saleSnap.data();
    const total = Number(saleData.total) || 0;
    const currentPaid = Number(saleData.paidAmount) || 0;
    const currentRemaining = Number(saleData.remainingDebt !== undefined ? saleData.remainingDebt : (total - currentPaid));

    if (numAmount > currentRemaining) {
      throw new Error(`مبلغ التسديد (${numAmount.toLocaleString()} د.ع) أكبر من الدين المتبقي (${currentRemaining.toLocaleString()} د.ع)`);
    }

    const newPaid = currentPaid + numAmount;
    const newRemaining = Math.max(0, total - newPaid);
    const newPaymentRecord = {
      id: `PAY-${Date.now()}`,
      amount: numAmount,
      date: paymentDetails.date || new Date().toISOString(),
      paymentMethod: paymentDetails.paymentMethod || 'نقدي',
      notes: (paymentDetails.notes || '').trim(),
      receivedBy: paymentDetails.receivedBy || 'المسؤول',
      createdAt: new Date().toISOString()
    };

    const existingPayments = Array.isArray(saleData.payments) ? saleData.payments : [];

    transaction.update(saleRef, {
      paidAmount: newPaid,
      remainingDebt: newRemaining,
      isSettled: newRemaining === 0,
      paymentStatus: newRemaining === 0 ? 'paid' : 'partial',
      payments: [...existingPayments, newPaymentRecord],
      updatedAt: serverTimestamp()
    });

    return { newPaid, newRemaining };
  });
}

/**
 * حذف دفعة تسديد دين معينة من فاتورة وإعادة احتساب المتبقي بدقة
 * @param {string} saleId - معرف الفاتورة
 * @param {string} paymentId - معرف الدفعة المراد حذفها
 */
export async function deleteCustomerDebtPayment(saleId, paymentId) {
  const saleRef = doc(db, SALES_COLLECTION, saleId);
  return await runOfflineSafeTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }
    const saleData = saleSnap.data();
    const existingPayments = Array.isArray(saleData.payments) ? saleData.payments : [];
    
    const paymentToDelete = existingPayments.find(p => p.id === paymentId);
    if (!paymentToDelete) {
      throw new Error('دفعة التسديد غير موجودة أو تم حذفها مسبقاً');
    }

    const updatedPayments = existingPayments.filter(p => p.id !== paymentId);
    const total = Number(saleData.total) || 0;
    const newPaid = updatedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const newRemaining = Math.max(0, total - newPaid);

    transaction.update(saleRef, {
      paidAmount: newPaid,
      remainingDebt: newRemaining,
      isSettled: newRemaining === 0,
      paymentStatus: newPaid === 0 ? 'unpaid' : (newRemaining === 0 ? 'paid' : 'partial'),
      payments: updatedPayments,
      updatedAt: serverTimestamp()
    });

    return { newPaid, newRemaining };
  });
}

/**
 * تصفير كافة دفعات التسديد لفاتورة وإرجاعها لحالة "لم يدفع شيئاً" (0 د.ع)
 * @param {string} saleId - معرف الفاتورة
 */
export async function resetCustomerDebtPayments(saleId) {
  const saleRef = doc(db, SALES_COLLECTION, saleId);
  return await runOfflineSafeTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('الفاتورة غير موجودة');
    }
    const saleData = saleSnap.data();
    const total = Number(saleData.total) || 0;

    transaction.update(saleRef, {
      paidAmount: 0,
      remainingDebt: total,
      isSettled: false,
      paymentStatus: 'unpaid',
      payments: [],
      updatedAt: serverTimestamp()
    });

    return { newPaid: 0, newRemaining: total };
  });
}

