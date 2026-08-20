import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const SETTINGS_COLLECTION = 'settings';
const STORE_INFO_DOC = 'store_info';

export async function getStoreSettings() {
  const docRef = doc(db, SETTINGS_COLLECTION, STORE_INFO_DOC);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return {
    storeName: '',
    address: '',
    description: '',
    logoUrl: null,
    categories: [],
    telegramBotToken: '',
    telegramChatId: '',
  };
}

export async function updateStoreSettings(settingsData) {
  const docRef = doc(db, SETTINGS_COLLECTION, STORE_INFO_DOC);
  await setDoc(docRef, settingsData, { merge: true });
}
