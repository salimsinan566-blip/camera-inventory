import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const LABOR_CHARGES_COLLECTION = 'labor_charges';

export async function addLaborCharge(data) {
  const colRef = collection(db, LABOR_CHARGES_COLLECTION);
  return await addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp()
  });
}

export async function updateLaborCharge(id, data) {
  const docRef = doc(db, LABOR_CHARGES_COLLECTION, id);
  await updateDoc(docRef, data);
}

export async function deleteLaborCharge(id) {
  const docRef = doc(db, LABOR_CHARGES_COLLECTION, id);
  await deleteDoc(docRef);
}
