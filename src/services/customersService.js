import { 
  collection, 
  addDoc, 
  getDoc,
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { moveToTrash } from './trashBinService';
import { 
  BACKUP_KEYS, 
  saveLocalBackup, 
  loadLocalBackup, 
  safeGetDocs,
  safeGetDoc
} from './offlineDbHelper';

const CUSTOMERS_COLLECTION = 'customers';

/**
 * الاشتراك الحي بقائمة العملاء مع حماية الذاكرة المؤقتة أوفلاين
 */
export function subscribeToCustomers(callback) {
  // Pre-load from local storage mirror immediately
  const initialCached = loadLocalBackup(BACKUP_KEYS.CUSTOMERS, []);
  if (Array.isArray(initialCached) && initialCached.length > 0) {
    callback(initialCached);
  }

  return onSnapshot(collection(db, CUSTOMERS_COLLECTION), (snapshot) => {
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    saveLocalBackup(BACKUP_KEYS.CUSTOMERS, list);
    callback(list);
  }, (err) => {
    console.warn('Subscribe to customers snapshot fallback to local cache:', err?.message);
    const cached = loadLocalBackup(BACKUP_KEYS.CUSTOMERS, []);
    if (Array.isArray(cached) && cached.length > 0) {
      callback(cached);
    }
  });
}

/**
 * إضافة عميل جديد
 */
export async function addCustomer({ 
  name, 
  phone1 = '', 
  phone2 = '', 
  pinCode = '', 
  notes = '',
  customerType = 'client', // 'client' (عميل دائم/جملة) | 'customer' (زبون مفرد/نقدي)
  reminderSchedule = 'default' // 'default' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'monthly_1' | 'monthly_25' | 'disabled'
}) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('يرجى إدخال اسم العميل');

  const docRef = await addDoc(collection(db, CUSTOMERS_COLLECTION), {
    name: trimmedName,
    phone1: (phone1 || '').trim(),
    phone2: (phone2 || '').trim(),
    pinCode: (pinCode || '').trim(),
    notes: (notes || '').trim(),
    customerType: customerType || 'client',
    reminderSchedule: reminderSchedule || 'default',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * تعديل بيانات عميل موجود
 */
export async function updateCustomer(customerId, updates = {}) {
  if (!customerId) throw new Error('معرف العميل غير صالح');

  const updatePayload = {
    updatedAt: serverTimestamp(),
  };

  if (updates.name !== undefined) {
    const trimmedName = String(updates.name || '').trim();
    if (!trimmedName) throw new Error('اسم العميل لا يمكن أن يكون فارغاً');
    updatePayload.name = trimmedName;
  }

  if (updates.phone1 !== undefined) updatePayload.phone1 = String(updates.phone1 || '').trim();
  if (updates.phone2 !== undefined) updatePayload.phone2 = String(updates.phone2 || '').trim();
  if (updates.pinCode !== undefined) updatePayload.pinCode = String(updates.pinCode || '').trim();
  if (updates.notes !== undefined) updatePayload.notes = String(updates.notes || '').trim();
  if (updates.customerType !== undefined) updatePayload.customerType = updates.customerType;
  if (updates.reminderSchedule !== undefined) updatePayload.reminderSchedule = updates.reminderSchedule;
  if (updates.lastDebtReminderSent !== undefined) updatePayload.lastDebtReminderSent = updates.lastDebtReminderSent;

  const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
  await updateDoc(customerRef, updatePayload);
}

/**
 * حذف عميل مع حفظه في سلة المحذوفات
 */
export async function deleteCustomer(customerId, userEmail = 'سالم سنان') {
  if (!customerId) throw new Error('معرف العميل غير صالح');
  const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
  const customerSnap = await safeGetDoc(customerRef);
  if (customerSnap.exists()) {
    const customerData = customerSnap.data();
    try {
      await moveToTrash({
        itemType: 'customer',
        originalCollection: CUSTOMERS_COLLECTION,
        docId: customerId,
        data: customerData,
        title: customerData.name || 'عميل محذوف',
        subtitle: `هاتف: ${customerData.phone1 || '-'} • دين: ${Number(customerData.totalDebt || 0).toLocaleString()} د.ع`,
        userEmail: userEmail || 'سالم سنان'
      });
    } catch (tErr) {
      console.warn('Could not backup customer to trash bin:', tErr);
    }
  }
  await deleteDoc(customerRef);
}

/**
 * يبحث عن عميل بنفس الاسم أو ينشئ عميل جديد مع أمان تام بدون إنترنت
 */
export async function findOrCreateCustomer(name, phone1 = '', phone2 = '', customerType = 'client') {
  const trimmedName = (name || '').trim();
  if (!trimmedName) return null;

  // Search local cache first if available
  const localList = loadLocalBackup(BACKUP_KEYS.CUSTOMERS, []);
  if (Array.isArray(localList)) {
    const matched = localList.find(c => (c.name || '').trim().toLowerCase() === trimmedName.toLowerCase());
    if (matched && matched.id) {
      return matched.id;
    }
  }

  try {
    const q = query(collection(db, CUSTOMERS_COLLECTION), where('name', '==', trimmedName));
    const snapshot = await safeGetDocs(q);
    
    if (!snapshot.empty) {
      const existing = snapshot.docs[0];
      const data = existing.data();
      const updates = {};
      if (phone1 && phone1 !== data.phone1) updates.phone1 = phone1;
      if (phone2 && phone2 !== data.phone2) updates.phone2 = phone2;
      if (!data.customerType && customerType) updates.customerType = customerType;
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, CUSTOMERS_COLLECTION, existing.id), updates).catch(e => console.warn('Offline customer update sync note:', e));
      }
      return existing.id;
    }
  } catch (err) {
    console.warn('Customer lookup query fallback:', err?.message);
  }

  try {
    const newDoc = await addDoc(collection(db, CUSTOMERS_COLLECTION), {
      name: trimmedName,
      phone1: phone1 || '',
      phone2: phone2 || '',
      customerType: customerType || 'client',
      reminderSchedule: 'default',
      createdAt: serverTimestamp(),
    });
    return newDoc.id;
  } catch (addErr) {
    console.warn('Customer addDoc fallback in offline mode:', addErr?.message);
    return `local_cust_${Date.now()}`;
  }
}

