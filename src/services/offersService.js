import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { buildDraftItems } from './salesService'; // Reuse the same logic for converting cart items
import { moveToTrash } from './trashBinService';

const OFFERS_COLLECTION = 'offers';
const OFFERS_COUNTER_PATH = ['counters', 'offers'];
const STARTING_OFFER_NUMBER = 1001;

/**
 * إنشاء عرض سعر جديد
 */
export async function createOffer(cartItems, orderOptions = {}) {
  const { 
    offerName = '', 
    customerName = '', 
    notes = '',
    discount = 0, 
    taxRate = 0, 
    cashierEmail = '' 
  } = orderOptions;

  const result = await runTransaction(db, async (transaction) => {
    // 1. Generate Offer Number
    const counterRef = doc(db, ...OFFERS_COUNTER_PATH);
    const counterSnap = await transaction.get(counterRef);
    let nextOfferNumber = STARTING_OFFER_NUMBER;
    
    if (counterSnap.exists()) {
      nextOfferNumber = (counterSnap.data().lastNumber || STARTING_OFFER_NUMBER - 1) + 1;
      transaction.update(counterRef, { lastNumber: nextOfferNumber });
    } else {
      transaction.set(counterRef, { lastNumber: STARTING_OFFER_NUMBER });
    }

    // 2. Prepare Items
    const items = buildDraftItems(cartItems);
    
    // 3. Calculate Totals
    const subtotal = items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    const totalAfterDiscount = subtotal - (Number(discount) || 0);
    const taxAmount = (totalAfterDiscount * (Number(taxRate) || 0)) / 100;
    const total = totalAfterDiscount + taxAmount;

    // 4. Save Offer
    const newOfferRef = doc(collection(db, OFFERS_COLLECTION));
    const payload = {
      offerNumber: nextOfferNumber,
      offerName: String(offerName || '').trim(),
      customerName: String(customerName || '').trim() || null,
      notes: String(notes || '').trim(),
      items,
      subtotal: Number(subtotal) || 0,
      discount: Number(discount) || 0,
      taxRate: Number(taxRate) || 0,
      total: Number(total) || 0,
      status: 'active', // active, converted
      cashierEmail: String(cashierEmail || '').trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    transaction.set(newOfferRef, payload);
    return { id: newOfferRef.id, ...payload };
  });

  return result;
}

/**
 * تحديث عرض سعر موجود
 */
export async function updateOffer(offerId, cartItems, orderOptions = {}) {
  const { 
    offerName = '', 
    customerName = '', 
    notes = '',
    discount = 0, 
    taxRate = 0,
    cashierEmail = ''
  } = orderOptions;

  const items = buildDraftItems(cartItems);
  const subtotal = items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  const totalAfterDiscount = subtotal - (Number(discount) || 0);
  const taxAmount = (totalAfterDiscount * (Number(taxRate) || 0)) / 100;
  const total = totalAfterDiscount + taxAmount;

  if (!offerId) {
    return await createOffer(cartItems, orderOptions);
  }

  const offerRef = doc(db, OFFERS_COLLECTION, offerId);
  const offerSnap = await getDoc(offerRef);

  if (!offerSnap.exists()) {
    return await createOffer(cartItems, orderOptions);
  }

  const payload = {
    offerName: String(offerName || '').trim(),
    customerName: String(customerName || '').trim() || null,
    notes: String(notes || '').trim(),
    items,
    subtotal: Number(subtotal) || 0,
    discount: Number(discount) || 0,
    taxRate: Number(taxRate) || 0,
    total: Number(total) || 0,
    cashierEmail: String(cashierEmail || '').trim(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(offerRef, payload, { merge: true });
  return {
    id: offerId,
    ...offerSnap.data(),
    ...payload,
    updatedAt: new Date(),
    isOffer: true
  };
}

/**
 * جلب عروض الأسعار
 */
export async function getOffers() {
  const q = query(
    collection(db, OFFERS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  }));
}

/**
 * حذف عرض سعر مع حفظه في سلة المحذوفات
 */
export async function deleteOffer(offerId, userEmail = 'سالم سنان') {
  const offerRef = doc(db, OFFERS_COLLECTION, offerId);
  const offerSnap = await getDoc(offerRef);
  if (offerSnap.exists()) {
    const offerData = offerSnap.data();
    try {
      await moveToTrash({
        itemType: 'offer',
        originalCollection: OFFERS_COLLECTION,
        docId: offerId,
        data: offerData,
        title: `عرض سعر #${offerData.offerNumber || offerId.slice(-4)}`,
        subtitle: `${offerData.customerName || 'عميل'} • ${Number(offerData.total || 0).toLocaleString()} د.ع`,
        userEmail: userEmail || 'سالم سنان'
      });
    } catch (tErr) {
      console.warn('Could not backup offer to trash bin:', tErr);
    }
  }
  await deleteDoc(offerRef);
}

/**
 * تحويل عرض السعر إلى مباع (Status Only)
 */
export async function markOfferAsConverted(offerId) {
  const offerRef = doc(db, OFFERS_COLLECTION, offerId);
  await updateDoc(offerRef, {
    status: 'converted',
    updatedAt: serverTimestamp(),
  });
}
