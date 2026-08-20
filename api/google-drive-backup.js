import * as XLSX from 'xlsx';
import crypto from 'crypto';

/**
 * Generate Google OAuth2 Access Token from Service Account JSON using native Node.js crypto
 */
async function getGoogleDriveAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodeBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  sign.end();
  const signature = sign
    .sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${unsignedToken}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google Auth Failed: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

/**
 * Create a folder in Google Drive
 */
async function createDriveFolder(accessToken, folderName, parentId = null) {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };

  const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Drive folder "${folderName}": ${err}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Upload a file to Google Drive (Multipart upload)
 */
async function uploadFileToDrive(accessToken, fileName, mimeType, bufferOrString, parentId = null) {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    ...(parentId ? { parents: [parentId] } : {})
  };

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const filePartHeader = `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;

  const base64Data = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('base64')
    : Buffer.from(bufferOrString, 'utf-8').toString('base64');

  const multipartBody = Buffer.concat([
    Buffer.from(metadataPart, 'utf-8'),
    Buffer.from(filePartHeader, 'utf-8'),
    Buffer.from(base64Data, 'utf-8'),
    Buffer.from(closeDelimiter, 'utf-8')
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartBody.length.toString()
    },
    body: multipartBody
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload file "${fileName}" to Drive: ${err}`);
  }

  return await res.json();
}

/**
 * Main Serverless API Handler
 */
export default async function handler(req, res) {
  try {
    // 1. Check settings and credentials
    let serviceAccount = null;
    let driveFolderId = req.body?.folderId || null;

    if (process.env.GOOGLE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      } catch (e) {
        console.error('Invalid GOOGLE_SERVICE_ACCOUNT JSON env:', e);
      }
    }

    if (!serviceAccount && req.body?.serviceAccount) {
      try {
        serviceAccount = typeof req.body.serviceAccount === 'string' ? JSON.parse(req.body.serviceAccount) : req.body.serviceAccount;
      } catch (e) {
        console.error('Invalid req.body.serviceAccount JSON:', e);
      }
    }

    if (!serviceAccount) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {}
      }
    }

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم العثور على مفتاح Google Service Account صالح أو جلسة تسجيل دخول Google Drive.'
      });
    }

    // 2. Obtain Google Drive OAuth2 Access Token
    const accessToken = await getGoogleDriveAccessToken(serviceAccount);

    // 3. Fetch or use database collections
    let products = req.body?.data?.products || [];
    let sales = req.body?.data?.sales || [];
    let customers = req.body?.data?.customers || [];
    let logs = req.body?.data?.logs || [];
    let settings = req.body?.data?.settings || {};

    if (products.length === 0 && sales.length === 0) {
      const projectId = serviceAccount.project_id || 'safe-zone-inv';
      try {
        const fetchRest = async (coll) => {
          const u = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${coll}?pageSize=1000`;
          const r = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!r.ok) return [];
          const d = await r.json();
          if (!d.documents) return [];
          return d.documents.map(doc => {
            const id = doc.name.split('/').pop();
            const out = { id };
            if (doc.fields) {
              for (const [k, v] of Object.entries(doc.fields)) {
                if (v.stringValue !== undefined) out[k] = v.stringValue;
                else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
                else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
                else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
              }
            }
            return out;
          });
        };

        const [pDocs, sDocs, cDocs] = await Promise.all([
          fetchRest('products'),
          fetchRest('sales'),
          fetchRest('customers')
        ]);
        products = pDocs;
        sales = sDocs;
        customers = cDocs;
      } catch (e) {
        console.warn('REST collection fetch error:', e);
      }
    }

    // 4. Create Root Dated Folder on Google Drive
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const rootFolderName = `SafeZone_Backup_${dateStr}`;
    const rootFolderId = await createDriveFolder(accessToken, rootFolderName, driveFolderId);

    // 5. Generate and Upload Excel Workbook
    const workbook = XLSX.utils.book_new();
    
    const productsRows = products.map(p => ({
      'اسم المنتج': p.name || '',
      'رقم الصنف (SKU)': p.sku || '',
      'القسم': p.cameraType || '',
      'الباركود': p.barcode || '',
      'الكمية بالمحل': p.storeQty || 0,
      'الكمية بالمخزن': p.warehouseQty || 0,
      'سعر التكلفة': p.costPrice || 0,
      'سعر الجملة': p.wholesalePrice || 0,
      'سعر المفرد': p.retailPrice || 0,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRows), 'المخزون والمنتجات');

    const salesRows = sales.map(s => ({
      'رقم الفاتورة': s.invoiceNumber || s.id?.slice(0, 6),
      'التاريخ': s.createdAt ? (s.createdAt.toDate ? s.createdAt.toDate().toISOString() : s.createdAt) : '',
      'اسم العميل': s.customerName || 'زبون عام',
      'طريقة الدفع': s.invoiceType === 'debt' ? 'آجل (دين)' : 'نقدي',
      'الإجمالي': s.total || 0,
      'الخصم': s.discount || 0,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'المبيعات والفواتير');

    const customersRows = customers.map(c => ({
      'اسم العميل': c.name || '',
      'رقم الهاتف 1': c.phone1 || '',
      'إجمالي الديون القائمة': c.totalDebt || 0,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customersRows), 'العملاء والديون');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    await uploadFileToDrive(
      accessToken,
      'Database_Full_Backup.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      excelBuffer,
      rootFolderId
    );

    // 6. Upload Raw JSON Database
    const rawJsonStr = JSON.stringify({ products, sales, customers, logs, settings }, null, 2);
    await uploadFileToDrive(
      accessToken,
      'Database_Raw.json',
      'application/json',
      rawJsonStr,
      rootFolderId
    );

    // 6.1 Upload PDF Reports if sent by client
    if (req.body && req.body.files && typeof req.body.files === 'object') {
      for (const [filename, base64Str] of Object.entries(req.body.files)) {
        if (base64Str) {
          try {
            const pdfBuffer = Buffer.from(base64Str, 'base64');
            await uploadFileToDrive(
              accessToken,
              filename,
              'application/pdf',
              pdfBuffer,
              rootFolderId
            );
          } catch (pdfErr) {
            console.error(`Failed to upload ${filename}:`, pdfErr);
          }
        }
      }
    }

    // 7. Create Customers Invoices Folder on Drive
    const customersFolderId = await createDriveFolder(accessToken, 'فواتير_العملاء', rootFolderId);

    // Group sales by customer
    const salesByCustomer = {};
    sales.forEach(s => {
      const custName = (s.customerName || 'زبون_عام_نقدي').trim().replace(/[/\\?%*:|"<>]/g, '_');
      if (!salesByCustomer[custName]) salesByCustomer[custName] = [];
      salesByCustomer[custName].push(s);
    });

    for (const custName of Object.keys(salesByCustomer)) {
      const custFolderId = await createDriveFolder(accessToken, custName, customersFolderId);
      const custSales = salesByCustomer[custName];
      
      const summaryFileContent = JSON.stringify({
        customer: custName,
        totalInvoices: custSales.length,
        invoices: custSales.map(cs => ({
          invoiceNumber: cs.invoiceNumber,
          date: cs.createdAt,
          total: cs.total,
          type: cs.invoiceType || 'cash',
          items: cs.items || []
        }))
      }, null, 2);

      await uploadFileToDrive(
        accessToken,
        `كشف_فواتير_${custName}.json`,
        'application/json',
        summaryFileContent,
        custFolderId
      );
    }

    // 8. Update stats in Firestore (if db is available)
    try {
      await db.collection('settings').doc('backup_stats').set({
        lastBackupDate: now.toISOString(),
        lastDriveFolderId: rootFolderId,
        productsCount: products.length,
        salesCount: sales.length,
        customersCount: customers.length,
        status: 'success'
      }, { merge: true });
    } catch (dbErr) {
      console.warn('Could not update backup_stats in Firestore:', dbErr.message);
    }

    // 9. Send Telegram Notification if configured
    const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.VITE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    const driveUrl = `https://drive.google.com/drive/folders/${rootFolderId}`;

    if (token && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `☁️ <b>تم اكتمال النسخ الاحتياطي اليومي على Google Drive بنجاح!</b>\n\n📅 التاريخ: <code>${dateStr}</code>\n📦 المنتجات: <b>${products.length}</b> صنف\n🧾 المبيعات: <b>${sales.length}</b> فاتورة\n👤 العملاء: <b>${customers.length}</b> عميل\n\n🔗 <a href="${driveUrl}">فتح مجلد النسخة الاحتياطية على Google Drive</a>`,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {
        console.error('Telegram notification error:', e);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'تم أخذ النسخة الاحتياطية ورفعها إلى Google Drive بنجاح!',
      folderId: rootFolderId,
      driveUrl: driveUrl,
      stats: {
        products: products.length,
        sales: sales.length,
        customers: customers.length
      }
    });

  } catch (error) {
    console.error('Google Drive Backup Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'حدث خطأ أثناء تنفيذ النسخ الاحتياطي'
    });
  }
}
