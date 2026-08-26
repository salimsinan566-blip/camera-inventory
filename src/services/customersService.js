// خدمة العملاء — إدارة وتعديل بيانات وحسابات العملاء
// Firestore collection: "customers" — { name, phone1, phone2, pinCode, notes, customerType, reminderSchedule, createdAt, updatedAt }

import { 
  collection, 
  addDoc, 
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

const CUSTOMERS_COLLECTION = 'customers';

/**
 * الاشتراك الحي بقائمة العملاء
 */
export function subscribeToCustomers(callback) {
  return onSnapshot(collection(db, CUSTOMERS_COLLECTION), (snapshot) => {
    const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    callback(list);
  }, (err) => {
    console.error('Subscribe to customers error:', err);
    callback([]);
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
 * حذف عميل
 */
export async function deleteCustomer(customerId) {
  if (!customerId) throw new Error('معرف العميل غير صالح');
  await deleteDoc(doc(db, CUSTOMERS_COLLECTION, customerId));
}

/**
 * يبحث عن عميل بنفس الاسم أو ينشئ عميل جديد
 */
export async function findOrCreateCustomer(name, phone1 = '', phone2 = '', customerType = 'client') {
  const trimmedName = (name || '').trim();
  if (!trimmedName) return null;

  try {
    const q = query(collection(db, CUSTOMERS_COLLECTION), where('name', '==', trimmedName));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const existing = snapshot.docs[0];
      const data = existing.data();
      const updates = {};
      if (phone1 && phone1 !== data.phone1) updates.phone1 = phone1;
      if (phone2 && phone2 !== data.phone2) updates.phone2 = phone2;
      if (!data.customerType && customerType) updates.customerType = customerType;
      
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, CUSTOMERS_COLLECTION, existing.id), updates);
      }
      return existing.id;
    }
  } catch (err) {
    console.warn('Customer lookup query fallback:', err?.message);
  }

  const newDoc = await addDoc(collection(db, CUSTOMERS_COLLECTION), {
    name: trimmedName,
    phone1: phone1 || '',
    phone2: phone2 || '',
    customerType: customerType || 'client',
    reminderSchedule: 'default',
    createdAt: serverTimestamp(),
  });
  return newDoc.id;
}
