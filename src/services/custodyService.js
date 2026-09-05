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
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  runOfflineSafeTransaction, 
  saveLocalBackup, 
  loadLocalBackup, 
  BACKUP_KEYS,
  safeGetDoc,
  safeGetDocs
} from './offlineDbHelper';

// ----------------------------------------------------
// 1. إدارة الفنيين (Technicians CRUD)
// ----------------------------------------------------

export async function fetchTechnicians() {
  const q = query(collection(db, 'technicians'), orderBy('name', 'asc'));
  const snap = await safeGetDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToTechnicians(callback) {
  // Pre-load from local cache
  const initial = loadLocalBackup(BACKUP_KEYS.TECHNICIANS, []);
  if (Array.isArray(initial) && initial.length > 0) {
    callback(initial);
  }

  const q = query(collection(db, 'technicians'), orderBy('name', 'asc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveLocalBackup(BACKUP_KEYS.TECHNICIANS, list);
    callback(list);
  }, (err) => {
    console.warn('Error subscribing to technicians (fallback to cache):', err?.message);
    const cached = loadLocalBackup(BACKUP_KEYS.TECHNICIANS, []);
    if (Array.isArray(cached) && cached.length > 0) {
      callback(cached);
    }
  });
}

export async function addTechnician({ name, phone = '', vehicleNumber = '', notes = '' }) {
  if (!name || !name.trim()) throw new Error('اسم الفني مطلوب');
  const docRef = await addDoc(collection(db, 'technicians'), {
    name: name.trim(),
    phone: phone.trim(),
    vehicleNumber: vehicleNumber.trim(),
    notes: notes.trim(),
    active: true,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

export async function updateTechnician(id, data) {
  const ref = doc(db, 'technicians', id);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString()
  });
}

export async function deleteTechnician(id) {
  // Check if technician has active custody
  const custodyDoc = await safeGetDoc(doc(db, 'custody_inventory', id));
  if (custodyDoc.exists()) {
    const items = custodyDoc.data().items || [];
    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    if (totalQty > 0) {
      throw new Error(`لا يمكن حذف الفني لوجود (${totalQty}) قطعة في عهدته حالياً. يرجى استرجاع العهدة أولاً.`);
    }
  }
  await deleteDoc(doc(db, 'technicians', id));
  await deleteDoc(doc(db, 'custody_inventory', id)).catch(() => {});
}

// ----------------------------------------------------
// 2. متابعة رصيد العهد الحالية (Custody Inventory Real-Time)
// ----------------------------------------------------

export function subscribeToAllCustodies(callback) {
  // Pre-load from local cache
  const initial = loadLocalBackup(BACKUP_KEYS.CUSTODIES, {});
  if (initial && typeof initial === 'object' && Object.keys(initial).length > 0) {
    callback(initial);
  }

  return onSnapshot(collection(db, 'custody_inventory'), (snap) => {
    const map = {};
    snap.docs.forEach(d => {
      map[d.id] = { id: d.id, ...d.data() };
    });
    saveLocalBackup(BACKUP_KEYS.CUSTODIES, map);
    callback(map);
  }, (err) => {
    console.warn('Error subscribing to custodies (fallback to cache):', err?.message);
    const cached = loadLocalBackup(BACKUP_KEYS.CUSTODIES, {});
    if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
      callback(cached);
    }
  });
}


export async function getTechnicianCustody(technicianId) {
  const ref = doc(db, 'custody_inventory', technicianId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { technicianId, items: [], totalCost: 0, totalRetail: 0 };
  }
  return snap.data();
}

// ----------------------------------------------------
// 3. تحميل بضاعة للسيارة (Load Items into Van Custody)
// ----------------------------------------------------

export async function loadItemsToCustody({
  technicianId,
  technicianName,
  sourceLocation = 'store', // 'store' | 'warehouse'
  items = [], // [ { productId, quantity } ]
  notes = '',
  performedBy = ''
}) {
  if (!technicianId) throw new Error('يرجى تحديد الفني');
  if (!items || items.length === 0) throw new Error('يرجى إضافة مادة واحدة على الأقل');

  return await runOfflineSafeTransaction(db, async (transaction) => {
    // ----------------------------------------------------
    // PHASE 1: READ ALL DOCUMENTS FIRST (No writes before reads!)
    // ----------------------------------------------------
    const custodyRef = doc(db, 'custody_inventory', technicianId);
    const custodySnap = await transaction.get(custodyRef);

    const productMap = {};
    for (const item of items) {
      if (!productMap[item.productId]) {
        const pRef = doc(db, 'products', item.productId);
        const pSnap = await transaction.get(pRef);
        productMap[item.productId] = { ref: pRef, snap: pSnap };
      }
    }

    // ----------------------------------------------------
    // PHASE 2: VALIDATION AND IN-MEMORY UPDATES
    // ----------------------------------------------------
    const currentCustody = custodySnap.exists() ? custodySnap.data() : { technicianId, technicianName, items: [] };
    const custodyItems = [...(currentCustody.items || [])];
    const logItems = [];
    const productUpdates = [];

    for (const item of items) {
      const qtyToLoad = Number(item.quantity);
      if (qtyToLoad <= 0) continue;

      const pEntry = productMap[item.productId];
      if (!pEntry || !pEntry.snap.exists()) {
        throw new Error(`المنتج غير موجود: ${item.productId}`);
      }

      const prod = pEntry.snap.data();
      const availQty = sourceLocation === 'warehouse' ? (Number(prod.warehouseQty) || 0) : (Number(prod.storeQty) || 0);
      if (availQty < qtyToLoad) {
        const locName = sourceLocation === 'warehouse' ? 'المخزن' : 'المحل';
        throw new Error(`الكمية المتوفرة في ${locName} للمادة "${prod.name}" هي (${availQty}) فقط، لا تكفي لتحميل (${qtyToLoad}).`);
      }

      // Record product update
      const newQty = availQty - qtyToLoad;
      productUpdates.push({
        ref: pEntry.ref,
        field: sourceLocation === 'warehouse' ? 'warehouseQty' : 'storeQty',
        value: newQty
      });

      // Add/update custody items list
      const existingIdx = custodyItems.findIndex(ci => ci.productId === item.productId);
      if (existingIdx >= 0) {
        custodyItems[existingIdx] = {
          ...custodyItems[existingIdx],
          quantity: (Number(custodyItems[existingIdx].quantity) || 0) + qtyToLoad,
          lastUpdated: new Date().toISOString()
        };
      } else {
        custodyItems.push({
          productId: item.productId,
          name: prod.name || '',
          sku: prod.sku || '',
          barcode: prod.barcode || '',
          cameraType: prod.cameraType || '',
          sellMode: prod.sellMode || 'unit',
          metersPerRoll: prod.metersPerRoll || 0,
          costPrice: Number(prod.wholesalePrice || prod.costPrice) || 0,
          wholesalePrice: Number(prod.wholesalePrice || prod.costPrice) || 0,
          retailPrice: Number(prod.retailPrice) || 0,
          quantity: qtyToLoad,
          loadedAt: new Date().toISOString()
        });
      }

      logItems.push({
        productId: item.productId,
        name: prod.name,
        sku: prod.sku || '',
        quantity: qtyToLoad,
        costPrice: Number(prod.wholesalePrice || prod.costPrice) || 0,
        retailPrice: Number(prod.retailPrice) || 0
      });
    }

    const cleanedCustodyItems = custodyItems.filter(i => Number(i.quantity) > 0);
    const totalCost = cleanedCustodyItems.reduce((s, i) => s + (Number(i.costPrice || i.wholesalePrice) || 0) * (Number(i.quantity) || 0), 0);
    const totalRetail = cleanedCustodyItems.reduce((s, i) => s + (Number(i.retailPrice) || 0) * (Number(i.quantity) || 0), 0);

    // ----------------------------------------------------
    // PHASE 3: WRITE ALL UPDATES
    // ----------------------------------------------------
    for (const update of productUpdates) {
      transaction.update(update.ref, { [update.field]: update.value });
    }

    transaction.set(custodyRef, {
      technicianId,
      technicianName,
      items: cleanedCustodyItems,
      totalCost,
      totalRetail,
      totalItemsCount: cleanedCustodyItems.reduce((s, i) => s + Number(i.quantity), 0),
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Custody Log
    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const logRef = doc(collection(db, 'custody_logs'));
    transaction.set(logRef, {
      type: 'load',
      technicianId,
      technicianName,
      sourceLocation,
      items: logItems,
      totalQuantity: logItems.reduce((s, i) => s + i.quantity, 0),
      notes: notes.trim(),
      performedBy: performedBy || 'المسؤول',
      date: dateStr,
      createdAt: nowIso
    });

    // Inventory Log
    const invLogRef = doc(collection(db, 'inventory_logs'));
    transaction.set(invLogRef, {
      action: 'custody_load',
      technicianId,
      technicianName,
      source: sourceLocation,
      itemsCount: logItems.length,
      totalQuantity: logItems.reduce((s, i) => s + i.quantity, 0),
      notes: `تحميل عهدة سيارة للفني: ${technicianName} (${notes.trim()})`,
      performedBy: performedBy || 'المسؤول',
      timestamp: new Date().toISOString()
    });
  });
}

// ----------------------------------------------------
// 4. استرجاع مواد من السيارة إلى المحل / المخزن (Return Items)
// ----------------------------------------------------

export async function returnItemsFromCustody({
  technicianId,
  technicianName,
  targetLocation = 'store', // 'store' | 'warehouse'
  items = [], // [ { productId, quantity } ]
  notes = '',
  performedBy = ''
}) {
  if (!technicianId) throw new Error('يرجى تحديد الفني');
  if (!items || items.length === 0) throw new Error('يرجى تحديد المواد المراد استرجاعها');

  return await runOfflineSafeTransaction(db, async (transaction) => {
    // ----------------------------------------------------
    // PHASE 1: READ ALL DOCUMENTS FIRST
    // ----------------------------------------------------
    const custodyRef = doc(db, 'custody_inventory', technicianId);
    const custodySnap = await transaction.get(custodyRef);
    if (!custodySnap.exists()) {
      throw new Error('لا توجد عهدة مسجلة لهذا الفني');
    }

    const productMap = {};
    for (const item of items) {
      if (!productMap[item.productId]) {
        const pRef = doc(db, 'products', item.productId);
        const pSnap = await transaction.get(pRef);
        productMap[item.productId] = { ref: pRef, snap: pSnap };
      }
    }

    // ----------------------------------------------------
    // PHASE 2: VALIDATION AND IN-MEMORY CALCULATIONS
    // ----------------------------------------------------
    const currentCustody = custodySnap.data();
    const custodyItems = [...(currentCustody.items || [])];
    const logItems = [];
    const productUpdates = [];

    for (const item of items) {
      const qtyToReturn = Number(item.quantity);
      if (qtyToReturn <= 0) continue;

      const cIdx = custodyItems.findIndex(ci => ci.productId === item.productId);
      if (cIdx < 0) {
        throw new Error(`المادة غير موجودة في عهدة الفني`);
      }

      const inCustodyQty = Number(custodyItems[cIdx].quantity) || 0;
      if (inCustodyQty < qtyToReturn) {
        throw new Error(`الكمية الموجودة بعهدة الفني للمادة "${custodyItems[cIdx].name}" هي (${inCustodyQty}) فقط، لا يمكن استرجاع (${qtyToReturn}).`);
      }

      // Deduct from custody
      custodyItems[cIdx].quantity = inCustodyQty - qtyToReturn;

      // Add back to shop or warehouse
      const pEntry = productMap[item.productId];
      if (pEntry && pEntry.snap.exists()) {
        const prod = pEntry.snap.data();
        const currentLocQty = targetLocation === 'warehouse' ? (Number(prod.warehouseQty) || 0) : (Number(prod.storeQty) || 0);
        productUpdates.push({
          ref: pEntry.ref,
          field: targetLocation === 'warehouse' ? 'warehouseQty' : 'storeQty',
          value: currentLocQty + qtyToReturn
        });
      }

      logItems.push({
        productId: item.productId,
        name: custodyItems[cIdx].name,
        sku: custodyItems[cIdx].sku || '',
        quantity: qtyToReturn,
        costPrice: Number(custodyItems[cIdx].costPrice || custodyItems[cIdx].wholesalePrice) || 0,
        retailPrice: Number(custodyItems[cIdx].retailPrice) || 0
      });
    }

    const cleanedCustodyItems = custodyItems.filter(i => Number(i.quantity) > 0);
    const totalCost = cleanedCustodyItems.reduce((s, i) => s + (Number(i.costPrice || i.wholesalePrice) || 0) * (Number(i.quantity) || 0), 0);
    const totalRetail = cleanedCustodyItems.reduce((s, i) => s + (Number(i.retailPrice) || 0) * (Number(i.quantity) || 0), 0);

    // ----------------------------------------------------
    // PHASE 3: WRITE ALL UPDATES
    // ----------------------------------------------------
    for (const update of productUpdates) {
      transaction.update(update.ref, { [update.field]: update.value });
    }

    transaction.set(custodyRef, {
      technicianId,
      technicianName,
      items: cleanedCustodyItems,
      totalCost,
      totalRetail,
      totalItemsCount: cleanedCustodyItems.reduce((s, i) => s + Number(i.quantity), 0),
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Custody Log
    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const logRef = doc(collection(db, 'custody_logs'));
    transaction.set(logRef, {
      type: 'return',
      technicianId,
      technicianName,
      targetLocation,
      items: logItems,
      totalQuantity: logItems.reduce((s, i) => s + i.quantity, 0),
      notes: notes.trim(),
      performedBy: performedBy || 'المسؤول',
      date: dateStr,
      createdAt: nowIso
    });

    // Inventory Log
    const invLogRef = doc(collection(db, 'inventory_logs'));
    transaction.set(invLogRef, {
      action: 'custody_return',
      technicianId,
      technicianName,
      target: targetLocation,
      itemsCount: logItems.length,
      totalQuantity: logItems.reduce((s, i) => s + i.quantity, 0),
      notes: `استرجاع عهدة من الفني: ${technicianName} إلى ${targetLocation === 'warehouse' ? 'المخزن' : 'المحل'} (${notes.trim()})`,
      performedBy: performedBy || 'المسؤول',
      timestamp: new Date().toISOString()
    });
  });
}

// ----------------------------------------------------
// 5. خصم مواد عند البيع المباشر من سيارة الفني (Sale from Custody)
// ----------------------------------------------------

export async function deductItemsFromCustodyForSale({
  technicianId,
  items = [], // [ { productId, quantity } ]
  invoiceNumber = '',
  customerName = '',
  performedBy = ''
}) {
  if (!technicianId || !items.length) return;

  return await runOfflineSafeTransaction(db, async (transaction) => {
    const custodyRef = doc(db, 'custody_inventory', technicianId);
    const custodySnap = await transaction.get(custodyRef);
    if (!custodySnap.exists()) {
      throw new Error('لا توجد عهدة مسجلة للفني المحدد');
    }

    const currentCustody = custodySnap.data();
    const custodyItems = [...(currentCustody.items || [])];

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const cIdx = custodyItems.findIndex(ci => ci.productId === (item.productId || item.id));
      if (cIdx >= 0) {
        const inStock = Number(custodyItems[cIdx].quantity) || 0;
        custodyItems[cIdx].quantity = Math.max(0, inStock - qty);
      }
    }

    const cleanedCustodyItems = custodyItems.filter(i => Number(i.quantity) > 0);
    const totalCost = cleanedCustodyItems.reduce((s, i) => s + (Number(i.costPrice || i.wholesalePrice) || 0) * (Number(i.quantity) || 0), 0);
    const totalRetail = cleanedCustodyItems.reduce((s, i) => s + (Number(i.retailPrice) || 0) * (Number(i.quantity) || 0), 0);

    transaction.set(custodyRef, {
      items: cleanedCustodyItems,
      totalCost,
      totalRetail,
      totalItemsCount: cleanedCustodyItems.reduce((s, i) => s + Number(i.quantity), 0),
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // Log custody deduction
    const nowIso = new Date().toISOString();
    const dateStr = nowIso.slice(0, 10);
    const logRef = doc(collection(db, 'custody_logs'));
    transaction.set(logRef, {
      type: 'sale_deduct',
      technicianId,
      technicianName: currentCustody.technicianName || '',
      invoiceNumber,
      customerName,
      items: items.map(i => ({
        productId: i.productId || i.id,
        name: i.name,
        quantity: Number(i.quantity) || 0,
        sku: i.sku || '',
        price: Number(i.price) || 0
      })),
      totalQuantity: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
      notes: `صرف بيع مباشر - فاتورة رقم: ${invoiceNumber} للعميل: ${customerName}`,
      performedBy: performedBy || 'البائع',
      date: dateStr,
      createdAt: nowIso
    });
  });
}

// ----------------------------------------------------
// 6. سجل حركات العهد (Custody Logs Query)
// ----------------------------------------------------

export function subscribeToCustodyLogs(callback, maxLimit = 500) {
  const q = query(
    collection(db, 'custody_logs'),
    orderBy('createdAt', 'desc'),
    limit(maxLimit)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.warn('Error subscribing to custody logs (offline fallback):', err?.message);
  });
}

