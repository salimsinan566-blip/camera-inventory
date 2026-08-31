// خدمة سلة المحذوفات المركزية الشاملة (Universal Trash Bin Service)
// Firestore Collection: "trash_bin"

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/config.js';

export const TRASH_COLLECTION = 'trash_bin';

// مدة الاحتفاظ بالمحذوفات: 90 يوماً
export const RETENTION_DAYS = 90;

// فحص وتصحيح أي مسودة كانت قد استرجعت وضبط كمياتها المعلقة
async function healOrphanDrafts() {
  try {
    const snap = await getDocs(collection(db, 'draft_sales'));
    if (!snap.empty) {
      for (const d of snap.docs) {
        const dData = d.data();
        const items = (dData.items || []).filter(i => !i.isService && i.productId);
        
        // تحديث المنتج لزيادة المعلق وخصم المتوفر
        for (const item of items) {
          const pRef = doc(db, 'products', item.productId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const pData = pSnap.data();
            const curStore = Number(pData.storeQty) || 0;
            const curPending = Number(pData.pendingQty) || 0;
            const q = Number(item.quantity) || 1;
            await setDoc(pRef, {
              storeQty: Math.max(0, curStore - q),
              pendingQty: curPending + q,
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }

        await setDoc(doc(db, 'sales', d.id), {
          ...dData,
          status: 'suspended',
          isDraft: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
        await deleteDoc(d.ref);
      }
    }
  } catch (e) {
    console.warn('healOrphanDrafts note:', e);
  }
}
healOrphanDrafts();

/**
 * نقل أي عنصر أو فاتورة إلى سلة المحذوفات
 * @param {Object} params
 * @param {string} params.itemType - 'draft_sale' | 'confirmed_sale' | 'offer' | 'product' | 'customer' | 'expense' | 'income' | 'purchase'
 * @param {string} params.originalCollection - اسم المجموعة الأصلية في Firestore
 * @param {string} params.docId - معرف المستند الأصلي
 * @param {Object} params.data - البيانات الكاملة للمستند المحذوف
 * @param {string} params.title - العنوان الرئيسي للعنصر (رقم الفاتورة، اسم المنتج، اسم العميل، إلخ)
 * @param {string} params.subtitle - تفاصيل إضافية (المبلغ، الصنف، الهاتف، إلخ)
 * @param {string} params.userEmail - إيميل أو اسم المستخدم الذي قام بالحذف
 */
export async function moveToTrash({
  itemType,
  originalCollection,
  docId,
  data,
  title = '',
  subtitle = '',
  userEmail = 'سالم سنان'
}) {
  if (!originalCollection || !data) {
    throw new Error('بيانات الحذف غير مكتملة');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // إزالة أي دوال أو بيانات غير قابلة للتحويل
  const cleanData = JSON.parse(JSON.stringify(data));

  const trashPayload = {
    itemType: itemType || 'generic',
    originalCollection,
    originalDocId: docId || null,
    data: cleanData,
    title: String(title || cleanData.name || cleanData.invoiceNumber || cleanData.offerNumber || cleanData.customerName || 'عنصر محذوف').trim(),
    subtitle: String(subtitle || (cleanData.total ? `${Number(cleanData.total).toLocaleString()} د.ع` : '') || cleanData.phone1 || '').trim(),
    deletedBy: String(userEmail || 'المستخدم').trim(),
    deletedAt: serverTimestamp(),
    deletedAtISO: now.toISOString(),
    expiresAtISO: expiresAt.toISOString()
  };

  const docRef = await addDoc(collection(db, TRASH_COLLECTION), trashPayload);
  return docRef.id;
}

/**
 * استماع حي لجميع العناصر في سلة المحذوفات
 */
export function subscribeToTrashBin(callback) {
  const q = query(collection(db, TRASH_COLLECTION), orderBy('deletedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const nowMs = Date.now();
      const items = snapshot.docs.map((d) => {
        const itemData = d.data();
        const deletedTime = itemData.deletedAt?.toDate?.() || (itemData.deletedAtISO ? new Date(itemData.deletedAtISO) : new Date());
        const ageInDays = Math.max(0, Math.floor((nowMs - deletedTime.getTime()) / (24 * 60 * 60 * 1000)));
        const daysRemaining = Math.max(0, RETENTION_DAYS - ageInDays);

        return {
          id: d.id,
          ...itemData,
          deletedDateFormatted: deletedTime.toLocaleDateString('ar-IQ'),
          deletedTimeFormatted: deletedTime.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
          daysRemaining
        };
      });

      callback(items);
    },
    (err) => {
      console.error('Error subscribing to trash bin:', err);
      callback([]);
    }
  );
}

/**
 * استرجاع عنصر من سلة المحذوفات
 * @param {Object} trashItem - عنصر السلة
 * @param {string} restoreMode - 'original' (إلى مكانه الأصلي) | 'to_draft' (إلى الفواتير المعلقة)
 * @param {string} userEmail - اسم/إيميل المسترجع
 */
export async function restoreFromTrash(trashItem, restoreMode = 'original', userEmail = 'سالم سنان') {
  if (!trashItem || !trashItem.data) {
    throw new Error('بيانات العنصر غير متوفرة للاسترجاع');
  }

  const { originalCollection, originalDocId, data, itemType } = trashItem;
  const rawData = { ...data };

  // إزالة حقول الحذف المؤقتة إن وجدت
  delete rawData.deletedAt;
  delete rawData.deletedBy;
  delete rawData.isDeleted;

  const isSaleRestore = itemType === 'draft_sale' || itemType === 'confirmed_sale';

  if (isSaleRestore) {
    // معالجة استرجاع الفواتير مع ضبط المخزون المحجوز أو المخصوم بدقة
    const items = rawData.items || [];
    const nonServiceItems = items.filter(i => !i.isService && i.productId);

    await runTransaction(db, async (transaction) => {
      // 1. قراءة وثائق المنتجات المتأثرة
      const productRefs = nonServiceItems.map(item => doc(db, 'products', item.productId));
      const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

      // 2. تحديث كميات المنتجات (حجز كمعلقة أو خصم كمبيعات)
      if (restoreMode === 'to_draft' || itemType === 'draft_sale') {
        // حجز الكميات كـ "معلقة" (خصم من المتوفر وزيادة في المعلق)
        for (let i = 0; i < nonServiceItems.length; i++) {
          const item = nonServiceItems[i];
          const snap = productSnaps[i];
          if (snap && snap.exists()) {
            const pData = snap.data();
            const currentStoreQty = Number(pData.storeQty) || 0;
            const currentPendingQty = Number(pData.pendingQty) || 0;
            const qtyToReserve = Number(item.quantity) || 1;

            transaction.update(snap.ref, {
              storeQty: Math.max(0, currentStoreQty - qtyToReserve),
              pendingQty: currentPendingQty + qtyToReserve,
            });
          }
        }

        // حفظ الفاتورة كـ "معلقة ومحجوزة" (status: 'suspended') لتظهر كمعلقة في المخزون ونقطة البيع
        const targetRef = originalDocId ? doc(db, 'sales', originalDocId) : doc(collection(db, 'sales'));
        transaction.set(targetRef, {
          ...rawData,
          isDraft: true,
          status: 'suspended',
          restoredFromTrashAt: serverTimestamp(),
          restoredBy: userEmail,
          updatedAt: serverTimestamp(),
          createdAt: rawData.createdAt || serverTimestamp()
        }, { merge: true });

      } else {
        // استرجاع كـ فاتورة مؤكدة (status: 'confirmed') وخصمها من المحل
        for (let i = 0; i < nonServiceItems.length; i++) {
          const item = nonServiceItems[i];
          const snap = productSnaps[i];
          if (snap && snap.exists()) {
            const pData = snap.data();
            const currentStoreQty = Number(pData.storeQty) || 0;
            const qtyToDeduct = Number(item.quantity) || 1;

            transaction.update(snap.ref, {
              storeQty: Math.max(0, currentStoreQty - qtyToDeduct),
            });
          }
        }

        const targetRef = originalDocId ? doc(db, 'sales', originalDocId) : doc(collection(db, 'sales'));
        transaction.set(targetRef, {
          ...rawData,
          isDraft: false,
          status: 'confirmed',
          restoredFromTrashAt: serverTimestamp(),
          restoredBy: userEmail,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // حذف العنصر من سلة المحذوفات داخل المعاملة
      transaction.delete(doc(db, TRASH_COLLECTION, trashItem.id));
    });

    return true;
  }

  // استرجاع العناصر الأخرى (منتجات، عملاء، عروض أسعار، مصاريف)
  const targetCollection = originalCollection || 'products';
  const restorePayload = {
    ...rawData,
    restoredFromTrashAt: serverTimestamp(),
    restoredBy: userEmail,
    updatedAt: serverTimestamp()
  };

  if (originalDocId) {
    await setDoc(doc(db, targetCollection, originalDocId), restorePayload, { merge: true });
  } else {
    await addDoc(collection(db, targetCollection), restorePayload);
  }

  // حذف العنصر من سلة المحذوفات بعد نجاح الاسترجاع
  await deleteDoc(doc(db, TRASH_COLLECTION, trashItem.id));
  return true;
}

/**
 * حذف عنصر نهائياً من سلة المحذوفات
 */
export async function permanentlyDeleteFromTrash(trashId) {
  if (!trashId) throw new Error('معرف المحذوف غير صالح');
  await deleteDoc(doc(db, TRASH_COLLECTION, trashId));
}

/**
 * تفريغ سلة المحذوفات بالكامل
 */
export async function emptyTrashBin() {
  const snapshot = await getDocs(collection(db, TRASH_COLLECTION));
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => {
    batch.delete(d.ref);
  });
  await batch.commit();
}
