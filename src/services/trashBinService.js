// خدمة سلة المحذوفات المركزية الشاملة (Universal Trash Bin Service)
// Firestore Collection: "trash_bin"

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/config.js';

export const TRASH_COLLECTION = 'trash_bin';

// مدة الاحتفاظ بالمحذوفات: 90 يوماً
export const RETENTION_DAYS = 90;

// فحص ونقل أي مسودة كانت قد استرجعت بالخطأ إلى draft_sales
async function healOrphanDrafts() {
  try {
    const snap = await getDocs(collection(db, 'draft_sales'));
    if (!snap.empty) {
      for (const d of snap.docs) {
        const dData = d.data();
        await setDoc(doc(db, 'sales', d.id), {
          ...dData,
          status: 'draft',
          isDraft: true,
          updatedAt: serverTimestamp()
        }, { merge: true });
        await deleteDoc(d.ref);
      }
    }
  } catch (e) {
    // تجاهل إن لم توجد المجموعة
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

  if (restoreMode === 'to_draft' || itemType === 'draft_sale') {
    // 1. الاسترجاع إلى قائمة الفواتير المعلقة داخل مجموعة 'sales' الصحيحة
    const draftPayload = {
      ...rawData,
      isDraft: true,
      status: 'draft',
      restoredFromTrashAt: serverTimestamp(),
      restoredBy: userEmail,
      updatedAt: serverTimestamp(),
      createdAt: rawData.createdAt || serverTimestamp()
    };

    if (originalDocId) {
      await setDoc(doc(db, 'sales', originalDocId), draftPayload, { merge: true });
    } else {
      await addDoc(collection(db, 'sales'), draftPayload);
    }
  } else {
    // 2. الاسترجاع إلى المجموعة الأصلية (products / customers / offers / sales)
    const targetCollection = originalCollection || 'sales';
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
