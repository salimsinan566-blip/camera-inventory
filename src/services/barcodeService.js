// توليد رقم باركود تسلسلي فريد لكل منتج.
// نستخدم Firestore Transaction على مستند عداد (counters/barcode) حتى لو
// صارت عمليتا توليد بنفس اللحظة، ما يصير تعارض بالأرقام.

import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const COUNTER_REF_PATH = ['counters', 'barcode'];
const STARTING_NUMBER = 200001; // نبدأ من رقم بادئ حتى يكون الباركود 6 خانات فأكثر

/** يولّد رقم باركود تسلسلي جديد وفريد (كنص) */
export async function generateNextBarcode() {
  const counterRef = doc(db, ...COUNTER_REF_PATH);

  const newNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists() ? counterSnap.data().next : STARTING_NUMBER;
    transaction.set(counterRef, { next: current + 1 }, { merge: true });
    return current;
  });

  return String(newNumber);
}

/** يولّد باركود لمنتج معيّن ويحفظه مباشرة على مستند المنتج بالـ Firestore */
export async function generateBarcodeForProduct(productId) {
  const barcode = await generateNextBarcode();
  await updateDoc(doc(db, 'products', productId), { barcode });
  return barcode;
}
