import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase/auth';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Connect user's Google Account with Drive permissions
 */
export async function connectUserGoogleDrive() {
  const provider = new GoogleAuthProvider();
  provider.addScope(GDRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'consent' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;

  if (!token) {
    throw new Error('لم يتم استلام رمز الوصول من Google. يرجى المحاولة مرة أخرى.');
  }

  // Save token in sessionStorage & localStorage & Firestore
  sessionStorage.setItem('gdrive_access_token', token);
  localStorage.setItem('gdrive_access_token', token);
  localStorage.setItem('gdrive_user_email', result.user.email);
  try {
    await setDoc(doc(db, 'settings', 'google_drive_config'), {
      connectedEmail: result.user.email,
      lastConnectedAt: new Date().toISOString(),
      authType: 'oauth'
    }, { merge: true });
  } catch (e) {
    console.warn('Could not save gdrive status to Firestore:', e);
  }

  return { token, email: result.user.email };
}

/**
 * Get active Google Drive OAuth token
 */
export function getSavedDriveToken() {
  return sessionStorage.getItem('gdrive_access_token') || localStorage.getItem('gdrive_access_token');
}

/**
 * Create a folder in user's Google Drive via REST API
 */
export async function createDriveFolderDirect(token, folderName, parentId = null) {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!res.ok) {
    const errText = await res.text();
    let errJson;
    try { errJson = JSON.parse(errText); } catch (e) {}
    
    if (errText.includes('Google Drive API has not been used') || errText.includes('accessNotConfigured') || errJson?.error?.status === 'PERMISSION_DENIED') {
      throw new Error('خدمة Google Drive API غير مفعّلة في مشروعك. يرجى الضغط على زر (تفعيل Google Drive API) لمرة واحدة.');
    }
    
    throw new Error(`فشل إنشاء المجلد "${folderName}": ${errJson?.error?.message || errText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Upload a Blob file directly to Google Drive via multipart REST API
 */
export async function uploadBlobToDriveDirect(token, fileName, mimeType, blob, parentId = null) {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
    ...(parentId ? { parents: [parentId] } : {})
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' })
  );
  form.append('file', blob, fileName);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`فشل رفع الملف "${fileName}": ${err}`);
  }

  return await res.json();
}
