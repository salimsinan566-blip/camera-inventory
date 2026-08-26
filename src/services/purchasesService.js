import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/config';


async function runOfflineSafeTransaction(dbInstance, callback) {
  try {
    return await runTransaction(dbInstance, callback);
  } catch (err) {
    const msg = err.message ? err.message.toLowerCase() : '';
    if (msg.includes('connection') || msg.includes('offline') || msg.includes('network') || err.code === 'unavailable' || msg.includes('failed to get document')) {
       console.warn('Network error in transaction, falling back to offline batch...', err);
       const batch = writeBatch(dbInstance);
       const fakeTransaction = {
         get: async (ref) => await getDoc(ref),
         set: (ref, data, opts) => { batch.set(ref, data, opts); return fakeTransaction; },
         update: (ref, data) => { batch.update(ref, data); return fakeTransaction; },
         delete: (ref) => { batch.delete(ref); return fakeTransaction; }
       };
       const result = await callback(fakeTransaction);
       batch.commit().catch(e => console.error('Offline batch commit sync failed later:', e));
       return result;
    }
    throw err;
  }
}


const PURCHASES_COLLECTION = 'purchases';
const DRAFT_PURCHASES_COLLECTION = 'draft_purchases';
const SUPPLIER_DEBTS_COLLECTION = 'supplier_debts';
const DEBT_PAYMENTS_COLLECTION = 'debt_payments';
const SUPPLIERS_COLLECTION = 'suppliers';

/**
 * حفظ أو تحديث بيانات مورد
 */
export async function saveOrUpdateSupplier(name, phone = '', notes = '') {
  const cleanName = (name || '').trim();
  if (!cleanName) return;
  const docId = cleanName.replace(/[\/\\]/g, '_');
  const ref = doc(db, SUPPLIERS_COLLECTION, docId);
  await setDoc(ref, {
    name: cleanName,
    phone: (phone || '').trim(),
    notes: (notes || '').trim(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export function subscribeToSuppliers(callback) {
  const q = query(collection(db, SUPPLIERS_COLLECTION), orderBy('name', 'asc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error subscribing to suppliers:', err);
  });
}

/**
 * حذف مورد من قائمة الموردين المحفوظين
 */
export async function deleteSavedSupplier(supplierNameOrId) {
  const cleanName = (supplierNameOrId || '').trim();
  if (!cleanName) return;
  const docId = cleanName.replace(/[\/\\]/g, '_');
  await deleteDoc(doc(db, SUPPLIERS_COLLECTION, docId));

  // Also clean up from supplier_debts if 0 remaining debt
  try {
    const dRef = doc(db, SUPPLIER_DEBTS_COLLECTION, docId);
    const snap = await getDoc(dRef);
    if (snap.exists() && Number(snap.data().remainingDebt || 0) <= 0) {
      await deleteDoc(dRef);
    }
  } catch (err) {
    console.warn('Error deleting supplier debts record:', err);
  }
}

/**
 * حفظ أو تحديث مسودة فاتورة شراء
 */
export async function saveDraftPurchase({
  draftId = null,
  supplierName = '',
  supplierPhone = '',
  invoiceNumber = '',
  items = [],
  paymentStatus = 'paid',
  totalAmount = 0,
  paidAmount = 0,
  shippingCost = 0,
  distributeShippingToCost = true,
  invoiceImageUrl = null,
  invoiceFileType = null, // 'image' | 'pdf'
  invoiceFileName = '',
  paidOutOfPocket = false,
  outOfPocketAmount = 0,
  outOfPocketEmployeeName = '',
  paidFromCashDrawerAmount = null,
  notes = '',
  date = new Date().toISOString(),
  createdBy = ''
}) {
  const cleanSupplierName = (supplierName || '').trim();
  const numShipping = Number(shippingCost) || 0;
  const itemsTotal = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.costPrice) || 0),
    0
  );
  const numTotal = Number(totalAmount) || (itemsTotal + numShipping);

  // Auto-detect file type if not explicitly passed
  let detectedFileType = invoiceFileType;
  if (!detectedFileType && invoiceImageUrl) {
    if (invoiceImageUrl.startsWith('data:application/pdf') || invoiceImageUrl.includes('.pdf')) {
      detectedFileType = 'pdf';
    } else {
      detectedFileType = 'image';
    }
  }

  const numOutOfPocket = paidOutOfPocket ? Math.max(0, Number(outOfPocketAmount) || 0) : 0;
  const numPaid = Number(paidAmount) || 0;
  const drawerPaid = paidFromCashDrawerAmount !== null && paidFromCashDrawerAmount !== undefined
    ? Number(paidFromCashDrawerAmount)
    : Math.max(0, numPaid - numOutOfPocket);

  const draftData = {
    supplierName: cleanSupplierName,
    supplierPhone: (supplierPhone || '').trim(),
    invoiceNumber: (invoiceNumber || '').trim(),
    items: items || [],
    paymentStatus: paymentStatus || 'paid',
    itemsTotalAmount: itemsTotal,
    shippingCost: numShipping,
    distributeShippingToCost: Boolean(distributeShippingToCost),
    totalAmount: numTotal,
    paidAmount: numPaid,
    paidOutOfPocket: Boolean(paidOutOfPocket && numOutOfPocket > 0),
    outOfPocketAmount: numOutOfPocket,
    outOfPocketEmployeeName: (outOfPocketEmployeeName || '').trim(),
    paidFromCashDrawerAmount: drawerPaid,
    invoiceImageUrl: invoiceImageUrl || null,
    invoiceFileType: detectedFileType || null,
    invoiceFileName: invoiceFileName || '',
    notes: (notes || '').trim(),
    date: date || new Date().toISOString(),
    status: 'draft',
    updatedAt: new Date().toISOString(),
    createdBy: createdBy || 'المسؤول'
  };

  if (draftId) {
    const draftRef = doc(db, DRAFT_PURCHASES_COLLECTION, draftId);
    await setDoc(draftRef, draftData, { merge: true });
    return draftId;
  } else {
    draftData.createdAt = new Date().toISOString();
    const newDraftRef = await addDoc(collection(db, DRAFT_PURCHASES_COLLECTION), draftData);
    return newDraftRef.id;
  }
}

/**
 * حذف مسودة فاتورة شراء
 */
export async function deleteDraftPurchase(draftId) {
  if (!draftId) return;
  const draftRef = doc(db, DRAFT_PURCHASES_COLLECTION, draftId);
  await deleteDoc(draftRef);
}

/**
 * تسجيل فاتورة شراء جديدة وتوريد المخزون
 */
export async function createPurchaseInvoice({
  supplierName,
  supplierPhone = '',
  invoiceNumber = '',
  items = [], // [ { productId, name, sku, barcode, cameraType, quantity, costPrice, retailPrice, location: 'store'|'warehouse', isNewProduct } ]
  paymentStatus = 'paid', // 'paid' | 'debt' | 'partial'
  shippingCost = 0,
  distributeShippingToCost = true,
  totalAmount = 0,
  paidAmount = 0,
  paidOutOfPocket = false,
  outOfPocketAmount = 0,
  outOfPocketEmployeeName = '',
  paidFromCashDrawerAmount = null,
  invoiceImageUrl = null,
  invoiceFileType = null,
  invoiceFileName = '',
  notes = '',
  date = new Date().toISOString(),
  createdBy = '',
  draftId = null
}) {
  if (!supplierName || !supplierName.trim()) {
    throw new Error('يرجى كتابة اسم المورد أو جهة الشراء');
  }
  if (!items || items.length === 0) {
    throw new Error('يجب إضافة مادة واحدة على الأقل في فاتورة الشراء');
  }

  const numShipping = Math.max(0, Number(shippingCost) || 0);
  const itemsTotal = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.costPrice) || 0),
    0
  );
  const numTotal = Number(totalAmount) || (itemsTotal + numShipping);

  let numPaid = Number(paidAmount);
  if (paymentStatus === 'paid') {
    numPaid = numTotal;
  } else if (paymentStatus === 'debt') {
    numPaid = 0;
  }
  const remainingAmount = Math.max(0, numTotal - numPaid);

  return await runOfflineSafeTransaction(db, async (transaction) => {
    // ----------------------------------------------------
    // PHASE 1: READ ALL EXISTING PRODUCTS AND SUPPLIER DEBT DOC
    // ----------------------------------------------------
    const productReads = {};
    for (const item of items) {
      if (item.productId && !item.isNewProduct) {
        if (!productReads[item.productId]) {
          const pRef = doc(db, 'products', item.productId);
          productReads[item.productId] = {
            ref: pRef,
            snap: await transaction.get(pRef)
          };
        }
      }
    }

    // Read supplier debt record if exists
    const cleanSupplierName = supplierName.trim();
    const supplierDocId = cleanSupplierName.replace(/[\/\\]/g, '_');
    const supplierRef = doc(db, SUPPLIER_DEBTS_COLLECTION, supplierDocId);
    const supplierSnap = await transaction.get(supplierRef);

    // ----------------------------------------------------
    // PHASE 2 & 3: PROCESS ITEMS, UPDATE STOCK & CREATE INVOICE
    // ----------------------------------------------------
    const processedItems = [];
    const logItems = [];

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const baseCost = Number(item.costPrice) || 0;
      const retail = Number(item.retailPrice) || 0;
      const location = item.location === 'warehouse' ? 'warehouse' : 'store';

      // Landed cost calculation: prioritize direct UI allocation (equal split / manual override) or fallback to value ratio
      const itemTotalValue = qty * baseCost;
      const shippingRatio = itemsTotal > 0 ? (itemTotalValue / itemsTotal) : (1 / items.length);
      const itemShippingShare = numShipping > 0 ? (numShipping * shippingRatio) : 0;
      const fallbackUnitShip = qty > 0 ? Math.round(itemShippingShare / qty) : 0;
      
      const unitShippingCost = item.unitShippingCost !== undefined && item.unitShippingCost !== null
        ? Number(item.unitShippingCost)
        : fallbackUnitShip;
        
      const effectiveCostPrice = item.effectiveCostPrice !== undefined && item.effectiveCostPrice !== null
        ? Number(item.effectiveCostPrice)
        : (distributeShippingToCost ? (baseCost + unitShippingCost) : baseCost);

      let targetProductId = item.productId;

      if (item.isNewProduct || !targetProductId) {
        // Create new product doc ref
        const newProductRef = doc(collection(db, 'products'));
        targetProductId = newProductRef.id;

        const newProdData = {
          name: (item.name || '').trim(),
          sku: (item.sku || '').trim() || `SKU-${Date.now().toString().slice(-6)}`,
          barcode: (item.barcode || '').trim() || null,
          cameraType: item.cameraType || 'أخرى',
          model: item.model || '',
          company: item.company || '',
          sellMode: item.sellMode || 'unit',
          metersPerRoll: Number(item.metersPerRoll) || 0,
          storeQty: location === 'store' ? qty : 0,
          warehouseQty: location === 'warehouse' ? qty : 0,
          storeMinThreshold: 5,
          warehouseMinThreshold: 5,
          wholesalePrice: effectiveCostPrice > 0 ? effectiveCostPrice : baseCost,
          retailPrice: retail > 0 ? retail : (effectiveCostPrice > 0 ? effectiveCostPrice : baseCost),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        transaction.set(newProductRef, newProdData);

        processedItems.push({
          productId: targetProductId,
          name: newProdData.name,
          sku: newProdData.sku,
          barcode: newProdData.barcode,
          cameraType: newProdData.cameraType,
          quantity: qty,
          baseCostPrice: baseCost,
          costPrice: baseCost,
          unitShippingCost,
          shippingShare: Math.round(itemShippingShare),
          effectiveCostPrice,
          retailPrice: newProdData.retailPrice,
          location,
          isNewProduct: true
        });
      } else {
        // Existing product update
        const pEntry = productReads[targetProductId];
        if (!pEntry || !pEntry.snap.exists()) {
          throw new Error(`المنتج غير موجود: ${targetProductId}`);
        }
        const existingData = pEntry.snap.data();

        const currentStoreQty = Number(existingData.storeQty) || 0;
        const currentWarehouseQty = Number(existingData.warehouseQty) || 0;

        const updatePayload = {
          updatedAt: new Date().toISOString(),
          wholesalePrice: effectiveCostPrice > 0 ? effectiveCostPrice : (Number(existingData.wholesalePrice) || 0)
        };

        if (retail > 0) {
          updatePayload.retailPrice = retail;
        }

        if (location === 'warehouse') {
          updatePayload.warehouseQty = currentWarehouseQty + qty;
        } else {
          updatePayload.storeQty = currentStoreQty + qty;
        }

        transaction.update(pEntry.ref, updatePayload);

        processedItems.push({
          productId: targetProductId,
          name: existingData.name || item.name,
          sku: existingData.sku || item.sku || '',
          barcode: existingData.barcode || item.barcode || '',
          cameraType: existingData.cameraType || item.cameraType || '',
          quantity: qty,
          baseCostPrice: baseCost,
          costPrice: baseCost,
          unitShippingCost,
          shippingShare: Math.round(itemShippingShare),
          effectiveCostPrice,
          oldCostPrice: Number(existingData.wholesalePrice) || 0,
          retailPrice: retail > 0 ? retail : (Number(existingData.retailPrice) || 0),
          location,
          isNewProduct: false
        });
      }

      logItems.push({
        name: item.name,
        quantity: qty,
        location,
        costPrice: baseCost,
        effectiveCostPrice
      });
    }

    // Create Purchase Document
    const purchaseRef = doc(collection(db, PURCHASES_COLLECTION));
    const generatedInvoiceNumber = invoiceNumber.trim() || `PUR-${Date.now().toString().slice(-6)}`;

    let detectedFileType = invoiceFileType;
    if (!detectedFileType && invoiceImageUrl) {
      if (invoiceImageUrl.startsWith('data:application/pdf') || invoiceImageUrl.includes('.pdf')) {
        detectedFileType = 'pdf';
      } else {
        detectedFileType = 'image';
      }
    }

    const numOutOfPocket = paidOutOfPocket ? Math.max(0, Number(outOfPocketAmount) || 0) : 0;
    const cleanOutOfPocketEmployee = paidOutOfPocket ? (outOfPocketEmployeeName || '').trim() || createdBy || 'الموظف' : '';
    const drawerPaid = paidFromCashDrawerAmount !== null && paidFromCashDrawerAmount !== undefined
      ? Math.max(0, Number(paidFromCashDrawerAmount) || 0)
      : Math.max(0, numPaid - numOutOfPocket);

    transaction.set(purchaseRef, {
      invoiceNumber: generatedInvoiceNumber,
      supplierName: cleanSupplierName,
      supplierPhone: supplierPhone.trim(),
      items: processedItems,
      itemsTotalAmount: itemsTotal,
      shippingCost: numShipping,
      distributeShippingToCost: Boolean(distributeShippingToCost),
      totalAmount: numTotal,
      paidAmount: numPaid,
      remainingAmount,
      paymentStatus, // 'paid' | 'debt' | 'partial'
      paidOutOfPocket: Boolean(paidOutOfPocket && numOutOfPocket > 0),
      outOfPocketAmount: numOutOfPocket,
      outOfPocketEmployeeName: cleanOutOfPocketEmployee,
      paidFromCashDrawerAmount: drawerPaid,
      invoiceImageUrl: invoiceImageUrl || null,
      invoiceFileType: detectedFileType || null,
      invoiceFileName: invoiceFileName || '',
      notes: notes.trim(),
      date: date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'المسؤول'
    });

    // If employee paid out of pocket, automatically register a pending reimbursement record
    if (paidOutOfPocket && numOutOfPocket > 0) {
      const reimbRef = doc(collection(db, 'employee_reimbursements'));
      transaction.set(reimbRef, {
        sourceType: 'purchase',
        sourceId: purchaseRef.id,
        sourceInvoiceNumber: generatedInvoiceNumber,
        employeeName: cleanOutOfPocketEmployee,
        amount: numOutOfPocket,
        status: 'pending', // 'pending' | 'reimbursed'
        reimbursedAmount: 0,
        reimbursementSource: null,
        reimbursedAt: null,
        reimbursedBy: null,
        notes: `سلفة نقدية دفعها الموظف (${cleanOutOfPocketEmployee}) من جيبه الخاص عن فاتورة الشراء (${generatedInvoiceNumber}) للمورد (${cleanSupplierName})`,
        date: date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: createdBy || 'المسؤول'
      });
    }

    // If there was an associated draft, delete it from drafts collection
    if (draftId) {
      const draftRef = doc(db, DRAFT_PURCHASES_COLLECTION, draftId);
      transaction.delete(draftRef);
    }

    // Update / Create Supplier Debt Record if not fully paid
    const prevDebtData = supplierSnap.exists() ? supplierSnap.data() : {
      supplierName: cleanSupplierName,
      supplierPhone: supplierPhone.trim(),
      totalPurchases: 0,
      totalPaid: 0,
      remainingDebt: 0,
      invoicesCount: 0
    };

    const newTotalPurchases = (Number(prevDebtData.totalPurchases) || 0) + numTotal;
    const newTotalPaid = (Number(prevDebtData.totalPaid) || 0) + numPaid;
    const newRemainingDebt = Math.max(0, newTotalPurchases - newTotalPaid);

    transaction.set(supplierRef, {
      supplierName: cleanSupplierName,
      supplierPhone: supplierPhone.trim() || prevDebtData.supplierPhone || '',
      totalPurchases: newTotalPurchases,
      totalPaid: newTotalPaid,
      remainingDebt: newRemainingDebt,
      invoicesCount: (Number(prevDebtData.invoicesCount) || 0) + 1,
      lastPurchaseDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Save/update in suppliers collection for quick dropdown list
    const savedSupplierRef = doc(db, SUPPLIERS_COLLECTION, supplierDocId);
    transaction.set(savedSupplierRef, {
      name: cleanSupplierName,
      phone: supplierPhone.trim() || prevDebtData.supplierPhone || '',
      lastPurchaseDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // If there was an initial partial payment, log it in debt_payments
    if (numPaid > 0 && paymentStatus !== 'paid') {
      const paymentRef = doc(collection(db, DEBT_PAYMENTS_COLLECTION));
      transaction.set(paymentRef, {
        supplierId: supplierDocId,
        supplierName: cleanSupplierName,
        purchaseId: purchaseRef.id,
        invoiceNumber: generatedInvoiceNumber,
        amount: numPaid,
        paymentDate: date || new Date().toISOString(),
        paymentMethod: 'نقدي',
        notes: 'دفعة أولى عند استلام الفاتورة',
        createdAt: new Date().toISOString(),
        createdBy: createdBy || 'المسؤول'
      });
    }

    // Add to Inventory Audit Logs
    const invLogRef = doc(collection(db, 'inventory_logs'));
    transaction.set(invLogRef, {
      action: 'purchase_inward',
      supplierName: cleanSupplierName,
      invoiceNumber: generatedInvoiceNumber,
      itemsCount: processedItems.length,
      totalQuantity: processedItems.reduce((s, i) => s + i.quantity, 0),
      totalCost: numTotal,
      notes: `توريد بضاعة من المورد: ${cleanSupplierName} (فاتورة: ${generatedInvoiceNumber})`,
      performedBy: createdBy || 'المسؤول',
      timestamp: new Date().toISOString()
    });

    return purchaseRef.id;
  });
}

/**
 * تسديد دفعة من ديون مورد
 */
export async function recordSupplierDebtPayment({
  supplierName,
  amount,
  paymentMethod = 'نقدي',
  notes = '',
  purchaseInvoiceId = null,
  createdBy = ''
}) {
  const numAmount = Number(amount);
  if (!supplierName || !supplierName.trim()) throw new Error('اسم المورد مطلوب');
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('يرجى إدخال مبلغ سداد صحيح');

  const cleanSupplierName = supplierName.trim();
  const supplierDocId = cleanSupplierName.replace(/[\/\\]/g, '_');

  return await runOfflineSafeTransaction(db, async (transaction) => {
    const supplierRef = doc(db, SUPPLIER_DEBTS_COLLECTION, supplierDocId);
    const supplierSnap = await transaction.get(supplierRef);

    if (!supplierSnap.exists()) {
      throw new Error('سجل المورد غير موجود');
    }

    const sData = supplierSnap.data();
    const currentRemaining = Number(sData.remainingDebt) || 0;
    if (numAmount > currentRemaining) {
      throw new Error(`مبلغ السداد (${numAmount.toLocaleString()}) أكبر من الدين المتبقي (${currentRemaining.toLocaleString()})`);
    }

    const newTotalPaid = (Number(sData.totalPaid) || 0) + numAmount;
    const newRemainingDebt = Math.max(0, currentRemaining - numAmount);

    transaction.update(supplierRef, {
      totalPaid: newTotalPaid,
      remainingDebt: newRemainingDebt,
      lastPaymentDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Record in debt_payments collection
    const paymentRef = doc(collection(db, DEBT_PAYMENTS_COLLECTION));
    transaction.set(paymentRef, {
      supplierId: supplierDocId,
      supplierName: cleanSupplierName,
      purchaseId: purchaseInvoiceId || null,
      amount: numAmount,
      paymentDate: new Date().toISOString(),
      paymentMethod,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'المسؤول'
    });
  });
}

/**
 * حذف فاتورة شراء مع استرجاع/خصم كميات المخزون التي تم توريدها وتعديل الديون
 */
export async function deletePurchaseInvoice(purchaseId, deletedBy = 'المسؤول') {
  return await runOfflineSafeTransaction(db, async (transaction) => {
    // ----------------------------------------------------
    // PHASE 1: READ PURCHASE DOC, ITEMS PRODUCTS & SUPPLIER DEBT
    // ----------------------------------------------------
    const pRef = doc(db, PURCHASES_COLLECTION, purchaseId);
    const pSnap = await transaction.get(pRef);
    if (!pSnap.exists()) throw new Error('الفاتورة غير موجودة');

    const pData = pSnap.data();
    const items = pData.items || [];
    const supplierDocId = (pData.supplierName || '').trim().replace(/[\/\\]/g, '_');

    // Read all products in items
    const productReads = {};
    for (const item of items) {
      if (item.productId && !productReads[item.productId]) {
        const productRef = doc(db, 'products', item.productId);
        productReads[item.productId] = {
          ref: productRef,
          snap: await transaction.get(productRef)
        };
      }
    }

    // Read supplier debt
    const sRef = doc(db, SUPPLIER_DEBTS_COLLECTION, supplierDocId);
    const sSnap = await transaction.get(sRef);

    // ----------------------------------------------------
    // PHASE 2 & 3: DEDUCT REVERTED QUANTITIES & UPDATE DOCS
    // ----------------------------------------------------
    for (const item of items) {
      if (item.productId && productReads[item.productId]) {
        const pEntry = productReads[item.productId];
        if (pEntry.snap.exists()) {
          const currentProdData = pEntry.snap.data();
          const qtyToDeduct = Number(item.quantity) || 0;
          const location = item.location === 'warehouse' ? 'warehouse' : 'store';

          const updatePayload = {
            updatedAt: new Date().toISOString()
          };

          if (location === 'warehouse') {
            const currentWh = Number(currentProdData.warehouseQty) || 0;
            updatePayload.warehouseQty = Math.max(0, currentWh - qtyToDeduct);
          } else {
            const currentSt = Number(currentProdData.storeQty) || 0;
            updatePayload.storeQty = Math.max(0, currentSt - qtyToDeduct);
          }

          transaction.update(pEntry.ref, updatePayload);
        }
      }
    }

    // Update supplier debt if exists
    if (sSnap.exists()) {
      const sData = sSnap.data();
      const newTotalPurchases = Math.max(0, (Number(sData.totalPurchases) || 0) - (Number(pData.totalAmount) || 0));
      const newTotalPaid = Math.max(0, (Number(sData.totalPaid) || 0) - (Number(pData.paidAmount) || 0));
      const newRemaining = Math.max(0, newTotalPurchases - newTotalPaid);
      const newInvoicesCount = Math.max(0, (Number(sData.invoicesCount) || 1) - 1);

      if (newInvoicesCount === 0 || (newTotalPurchases === 0 && newRemaining === 0)) {
        // إذا حذفت فواتير المورد ولم تعد لديه فواتير، يُحذف السجل بالكامل من الديون
        transaction.delete(sRef);
      } else {
        transaction.update(sRef, {
          totalPurchases: newTotalPurchases,
          totalPaid: newTotalPaid,
          remainingDebt: newRemaining,
          invoicesCount: newInvoicesCount,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // Add reversal entry to Inventory Audit Logs
    const invLogRef = doc(collection(db, 'inventory_logs'));
    transaction.set(invLogRef, {
      action: 'purchase_invoice_deleted',
      invoiceNumber: pData.invoiceNumber || purchaseId,
      supplierName: pData.supplierName || '—',
      itemsCount: items.length,
      totalQuantityDeducted: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
      notes: `تم حذف فاتورة الشراء (${pData.invoiceNumber || purchaseId}) واسترجاع كميات المواد من المخزون`,
      performedBy: deletedBy,
      timestamp: new Date().toISOString()
    });

    // Delete purchase invoice document
    transaction.delete(pRef);
  });
}

/**
 * حذف سجل مورد من جدول الديون يدوياً
 */
export async function deleteSupplierDebtRecord(supplierDocId) {
  await deleteDoc(doc(db, SUPPLIER_DEBTS_COLLECTION, supplierDocId));
}

/**
 * تعديل وتحديث فاتورة شراء مسجلة مسبقاً مع موازنة المخزون والتكاليف والديون
 */
export async function updatePurchaseInvoice(purchaseId, {
  supplierName,
  supplierPhone = '',
  invoiceNumber = '',
  items = [],
  paymentStatus = 'paid',
  shippingCost = 0,
  distributeShippingToCost = true,
  totalAmount = 0,
  paidAmount = 0,
  paidOutOfPocket = false,
  outOfPocketAmount = 0,
  outOfPocketEmployeeName = '',
  paidFromCashDrawerAmount = null,
  invoiceImageUrl = null,
  invoiceFileType = null,
  invoiceFileName = '',
  notes = '',
  date = new Date().toISOString(),
  updatedBy = ''
}) {
  if (!purchaseId) throw new Error('معرف الفاتورة مطلوب');
  if (!supplierName || !supplierName.trim()) throw new Error('اسم المورد مطلوب');
  if (!items || items.length === 0) throw new Error('يجب وجود مادة واحدة على الأقل في الفاتورة');

  const numShipping = Math.max(0, Number(shippingCost) || 0);
  const itemsTotal = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.costPrice) || 0),
    0
  );
  const numTotal = Number(totalAmount) || (itemsTotal + numShipping);

  let numPaid = Number(paidAmount);
  if (paymentStatus === 'paid') {
    numPaid = numTotal;
  } else if (paymentStatus === 'debt') {
    numPaid = 0;
  }
  const remainingAmount = Math.max(0, numTotal - numPaid);

  const cleanSupplierName = supplierName.trim();
  const newSupplierDocId = cleanSupplierName.replace(/[\/\\]/g, '_');

  return await runOfflineSafeTransaction(db, async (transaction) => {
    // 1. Read existing purchase invoice
    const pRef = doc(db, PURCHASES_COLLECTION, purchaseId);
    const pSnap = await transaction.get(pRef);
    if (!pSnap.exists()) throw new Error('فاتورة الشراء غير موجودة');

    const oldPurchaseData = pSnap.data();
    const oldItems = oldPurchaseData.items || [];
    const oldSupplierDocId = (oldPurchaseData.supplierName || '').trim().replace(/[\/\\]/g, '_');

    // 2. Read products for old items and new items
    const productReads = {};
    for (const item of oldItems) {
      if (item.productId && !productReads[item.productId]) {
        const productRef = doc(db, 'products', item.productId);
        productReads[item.productId] = {
          ref: productRef,
          snap: await transaction.get(productRef)
        };
      }
    }
    for (const item of items) {
      if (item.productId && !item.isNewProduct && !productReads[item.productId]) {
        const productRef = doc(db, 'products', item.productId);
        productReads[item.productId] = {
          ref: productRef,
          snap: await transaction.get(productRef)
        };
      }
    }

    // 3. Read supplier debt doc(s)
    const oldSupplierRef = doc(db, SUPPLIER_DEBTS_COLLECTION, oldSupplierDocId);
    const oldSupplierSnap = await transaction.get(oldSupplierRef);

    let newSupplierSnap = oldSupplierSnap;
    let newSupplierRef = oldSupplierRef;
    if (newSupplierDocId !== oldSupplierDocId) {
      newSupplierRef = doc(db, SUPPLIER_DEBTS_COLLECTION, newSupplierDocId);
      newSupplierSnap = await transaction.get(newSupplierRef);
    }

    // 4. Calculate stock quantity delta & landed cost updates for each product
    const stockDeltas = {};
    for (const oldItem of oldItems) {
      if (oldItem.productId) {
        if (!stockDeltas[oldItem.productId]) {
          stockDeltas[oldItem.productId] = { storeDelta: 0, whDelta: 0 };
        }
        const qty = Number(oldItem.quantity) || 0;
        if (oldItem.location === 'warehouse') {
          stockDeltas[oldItem.productId].whDelta -= qty;
        } else {
          stockDeltas[oldItem.productId].storeDelta -= qty;
        }
      }
    }

    // Process new items
    const processedItems = [];
    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const baseCost = Number(item.costPrice) || 0;
      const retail = Number(item.retailPrice) || 0;
      const location = item.location === 'warehouse' ? 'warehouse' : 'store';

      const unitShippingCost = item.unitShippingCost !== undefined && item.unitShippingCost !== null
        ? Number(item.unitShippingCost)
        : 0;
      const effectiveCostPrice = item.effectiveCostPrice !== undefined && item.effectiveCostPrice !== null
        ? Number(item.effectiveCostPrice)
        : (distributeShippingToCost ? (baseCost + unitShippingCost) : baseCost);

      let targetProductId = item.productId;

      if (item.isNewProduct || !targetProductId) {
        const newProductRef = doc(collection(db, 'products'));
        targetProductId = newProductRef.id;

        const newProdData = {
          name: (item.name || '').trim(),
          sku: (item.sku || '').trim() || `SKU-${Date.now().toString().slice(-6)}`,
          barcode: (item.barcode || '').trim() || null,
          cameraType: item.cameraType || 'أخرى',
          model: item.model || '',
          company: item.company || '',
          sellMode: item.sellMode || 'unit',
          metersPerRoll: Number(item.metersPerRoll) || 0,
          storeQty: location === 'store' ? qty : 0,
          warehouseQty: location === 'warehouse' ? qty : 0,
          storeMinThreshold: 5,
          warehouseMinThreshold: 5,
          wholesalePrice: effectiveCostPrice > 0 ? effectiveCostPrice : baseCost,
          retailPrice: retail > 0 ? retail : (effectiveCostPrice > 0 ? effectiveCostPrice : baseCost),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        transaction.set(newProductRef, newProdData);

        processedItems.push({
          productId: targetProductId,
          name: newProdData.name,
          sku: newProdData.sku,
          barcode: newProdData.barcode,
          cameraType: newProdData.cameraType,
          quantity: qty,
          baseCostPrice: baseCost,
          costPrice: baseCost,
          unitShippingCost,
          effectiveCostPrice,
          retailPrice: newProdData.retailPrice,
          location,
          isNewProduct: true
        });
      } else {
        if (!stockDeltas[targetProductId]) {
          stockDeltas[targetProductId] = { storeDelta: 0, whDelta: 0 };
        }
        if (location === 'warehouse') {
          stockDeltas[targetProductId].whDelta += qty;
        } else {
          stockDeltas[targetProductId].storeDelta += qty;
        }
        stockDeltas[targetProductId].newWholesale = effectiveCostPrice > 0 ? effectiveCostPrice : baseCost;
        if (retail > 0) {
          stockDeltas[targetProductId].newRetail = retail;
        }

        const pEntry = productReads[targetProductId];
        const existingData = pEntry && pEntry.snap.exists() ? pEntry.snap.data() : {};

        processedItems.push({
          productId: targetProductId,
          name: existingData.name || item.name,
          sku: existingData.sku || item.sku || '',
          barcode: existingData.barcode || item.barcode || '',
          cameraType: existingData.cameraType || item.cameraType || '',
          quantity: qty,
          baseCostPrice: baseCost,
          costPrice: baseCost,
          unitShippingCost,
          effectiveCostPrice,
          oldCostPrice: Number(existingData.wholesalePrice) || 0,
          retailPrice: retail > 0 ? retail : (Number(existingData.retailPrice) || 0),
          location,
          isNewProduct: false
        });
      }
    }

    // Apply stock deltas to existing product documents
    for (const [prodId, delta] of Object.entries(stockDeltas)) {
      const pEntry = productReads[prodId];
      if (pEntry && pEntry.snap.exists()) {
        const curData = pEntry.snap.data();
        const curStore = Number(curData.storeQty) || 0;
        const curWh = Number(curData.warehouseQty) || 0;

        const updatePayload = {
          storeQty: Math.max(0, curStore + (delta.storeDelta || 0)),
          warehouseQty: Math.max(0, curWh + (delta.whDelta || 0)),
          updatedAt: new Date().toISOString()
        };
        if (delta.newWholesale !== undefined && delta.newWholesale > 0) {
          updatePayload.wholesalePrice = delta.newWholesale;
        }
        if (delta.newRetail !== undefined && delta.newRetail > 0) {
          updatePayload.retailPrice = delta.newRetail;
        }
        transaction.update(pEntry.ref, updatePayload);
      }
    }

    // 5. Update Supplier Debt
    if (newSupplierDocId === oldSupplierDocId) {
      if (oldSupplierSnap.exists()) {
        const sData = oldSupplierSnap.data();
        const oldInvTotal = Number(oldPurchaseData.totalAmount) || 0;
        const oldInvPaid = Number(oldPurchaseData.paidAmount) || 0;

        const baseTotalPurchases = (Number(sData.totalPurchases) || 0) - oldInvTotal;
        const baseTotalPaid = (Number(sData.totalPaid) || 0) - oldInvPaid;

        const newTotalPurchases = baseTotalPurchases + numTotal;
        const newTotalPaid = baseTotalPaid + numPaid;
        const newRemainingDebt = Math.max(0, newTotalPurchases - newTotalPaid);

        transaction.update(oldSupplierRef, {
          supplierName: cleanSupplierName,
          supplierPhone: supplierPhone.trim() || sData.supplierPhone || '',
          totalPurchases: newTotalPurchases,
          totalPaid: newTotalPaid,
          remainingDebt: newRemainingDebt,
          updatedAt: new Date().toISOString()
        });
      }
    } else {
      if (oldSupplierSnap.exists()) {
        const oldSData = oldSupplierSnap.data();
        const oldInvTotal = Number(oldPurchaseData.totalAmount) || 0;
        const oldInvPaid = Number(oldPurchaseData.paidAmount) || 0;
        const revTotalPurchases = Math.max(0, (Number(oldSData.totalPurchases) || 0) - oldInvTotal);
        const revTotalPaid = Math.max(0, (Number(oldSData.totalPaid) || 0) - oldInvPaid);
        transaction.update(oldSupplierRef, {
          totalPurchases: revTotalPurchases,
          totalPaid: revTotalPaid,
          remainingDebt: Math.max(0, revTotalPurchases - revTotalPaid),
          invoicesCount: Math.max(0, (Number(oldSData.invoicesCount) || 1) - 1),
          updatedAt: new Date().toISOString()
        });
      }

      const newSData = newSupplierSnap.exists() ? newSupplierSnap.data() : { totalPurchases: 0, totalPaid: 0, invoicesCount: 0 };
      const newTotalPurchases = (Number(newSData.totalPurchases) || 0) + numTotal;
      const newTotalPaid = (Number(newSData.totalPaid) || 0) + numPaid;
      transaction.set(newSupplierRef, {
        supplierName: cleanSupplierName,
        supplierPhone: supplierPhone.trim() || newSData.supplierPhone || '',
        totalPurchases: newTotalPurchases,
        totalPaid: newTotalPaid,
        remainingDebt: Math.max(0, newTotalPurchases - newTotalPaid),
        invoicesCount: (Number(newSData.invoicesCount) || 0) + 1,
        lastPurchaseDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    // 6. Update Purchase Document
    let detectedFileType = invoiceFileType;
    if (!detectedFileType && invoiceImageUrl) {
      if (invoiceImageUrl.startsWith('data:application/pdf') || invoiceImageUrl.includes('.pdf')) {
        detectedFileType = 'pdf';
      } else {
        detectedFileType = 'image';
      }
    }

    const numOutOfPocket = paidOutOfPocket ? Math.max(0, Number(outOfPocketAmount) || 0) : 0;
    const cleanOutOfPocketEmployee = paidOutOfPocket ? (outOfPocketEmployeeName || '').trim() || updatedBy || 'الموظف' : '';
    const drawerPaid = paidFromCashDrawerAmount !== null && paidFromCashDrawerAmount !== undefined
      ? Math.max(0, Number(paidFromCashDrawerAmount) || 0)
      : Math.max(0, numPaid - numOutOfPocket);

    transaction.update(pRef, {
      supplierName: cleanSupplierName,
      supplierPhone: supplierPhone.trim(),
      invoiceNumber: invoiceNumber.trim() || oldPurchaseData.invoiceNumber,
      items: processedItems,
      itemsTotalAmount: itemsTotal,
      shippingCost: numShipping,
      distributeShippingToCost: Boolean(distributeShippingToCost),
      totalAmount: numTotal,
      paidAmount: numPaid,
      remainingAmount,
      paymentStatus,
      paidOutOfPocket: Boolean(paidOutOfPocket && numOutOfPocket > 0),
      outOfPocketAmount: numOutOfPocket,
      outOfPocketEmployeeName: cleanOutOfPocketEmployee,
      paidFromCashDrawerAmount: drawerPaid,
      invoiceImageUrl: invoiceImageUrl || null,
      invoiceFileType: detectedFileType || null,
      invoiceFileName: invoiceFileName || '',
      notes: notes.trim(),
      date: date || oldPurchaseData.date || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'المسؤول'
    });

    // 7. Audit Log
    const invLogRef = doc(collection(db, 'inventory_logs'));
    transaction.set(invLogRef, {
      action: 'purchase_invoice_edited',
      invoiceNumber: invoiceNumber.trim() || oldPurchaseData.invoiceNumber,
      supplierName: cleanSupplierName,
      itemsCount: processedItems.length,
      totalQuantity: processedItems.reduce((s, i) => s + i.quantity, 0),
      totalCost: numTotal,
      notes: `تم تعديل وتحديث فاتورة الشراء (${invoiceNumber || oldPurchaseData.invoiceNumber}) للمورد: ${cleanSupplierName}`,
      performedBy: updatedBy || 'المسؤول',
      timestamp: new Date().toISOString()
    });

    return purchaseId;
  });
}

// ----------------------------------------------------
// Subscriptions
// ----------------------------------------------------

export function subscribeToPurchases(callback, maxLimit = 100) {
  const q = query(
    collection(db, PURCHASES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxLimit)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error subscribing to purchases:', err);
  });
}

export function subscribeToSupplierDebts(callback) {
  const q = query(collection(db, SUPPLIER_DEBTS_COLLECTION), orderBy('remainingDebt', 'desc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error subscribing to supplier debts:', err);
  });
}

export function subscribeToDebtPayments(callback, maxLimit = 100) {
  const q = query(
    collection(db, DEBT_PAYMENTS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(maxLimit)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error subscribing to debt payments:', err);
  });
}

export function subscribeToDraftPurchases(callback) {
  const q = query(
    collection(db, DRAFT_PURCHASES_COLLECTION),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error subscribing to draft purchases:', err);
  });
}
