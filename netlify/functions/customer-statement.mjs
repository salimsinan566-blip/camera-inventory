import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'safe-zone-inv';

if (getApps().length === 0) {
  try {
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
    if (rawSa) {
      const sa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
      initializeApp({
        credential: cert(sa),
        projectId: sa.project_id || DEFAULT_PROJECT_ID
      });
    }
  } catch (err) {
    console.warn('Firebase Admin init error in Netlify function:', err.message);
  }
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[\s\-\+\(\)]/g, '').trim();
}

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '');
}

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    if (getApps().length === 0) {
      return { 
        statusCode: 503, 
        headers, 
        body: JSON.stringify({ error: 'Firebase Admin not initialized on Netlify' }) 
      };
    }

    const db = getFirestore();
    const { name, phone, identifier, pin } = JSON.parse(event.body || '{}');
    const inputIdentifier = String(identifier || name || phone || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!inputIdentifier) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'يرجى إدخال اسم العميل المسجل' }) };
    }
    if (!cleanPin) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'يرجى إدخال رمز المرور' }) };
    }

    const normInput = normalizeArabic(inputIdentifier);
    const cleanPhoneInput = normalizePhone(inputIdentifier);

    const customersCol = db.collection('customers');
    const salesCol = db.collection('sales');
    const incomesCol = db.collection('office_incomes');

    const custSnapshot = await customersCol.get();
    let matchedCustomer = null;

    custSnapshot.forEach((doc) => {
      const data = doc.data();
      const cNameNorm = normalizeArabic(data.name);
      const p1 = normalizePhone(data.phone1);
      const p2 = normalizePhone(data.phone2);

      const isNameMatch = Boolean(cNameNorm && normInput && cNameNorm === normInput);
      const isPhoneMatch = Boolean(
        cleanPhoneInput && cleanPhoneInput.length >= 7 && (
          (p1 && cleanPhoneInput.endsWith(p1)) || 
          (p1 && p1.endsWith(cleanPhoneInput)) || 
          (p2 && cleanPhoneInput.endsWith(p2))
        )
      );

      if (isNameMatch || isPhoneMatch) {
        matchedCustomer = { id: doc.id, ...data };
      }
    });

    if (!matchedCustomer) {
      const salesSnap = await salesCol.get();
      for (const doc of salesSnap.docs) {
        const s = doc.data();
        const sNameNorm = normalizeArabic(s.customerName);
        const sPhone = normalizePhone(s.customerPhone || s.phone);

        if (sNameNorm && normInput && sNameNorm === normInput) {
          matchedCustomer = { id: `temp-${doc.id}`, name: s.customerName || inputIdentifier, phone1: sPhone || '' };
          break;
        }
      }
    }

    if (!matchedCustomer) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `لم يتم العثور على حساب مسجل باسم "${inputIdentifier}".` })
      };
    }

    const rawCustPhone = normalizePhone(matchedCustomer.phone1 || matchedCustomer.phone2 || '');
    const defaultLast4 = rawCustPhone.length >= 4 ? rawCustPhone.slice(-4) : rawCustPhone;
    const expectedPin = String(matchedCustomer.pinCode || matchedCustomer.passcode || defaultLast4).trim();

    const isPinValid = Boolean(
      cleanPin === expectedPin ||
      (defaultLast4 && cleanPin === defaultLast4) ||
      (rawCustPhone && cleanPin === rawCustPhone)
    );

    if (!isPinValid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'رمز المرور غير صحيح. رمز المرور هو آخر 4 أرقام من رقم هاتفك المسجل.' })
      };
    }

    const customerNameNorm = normalizeArabic(matchedCustomer.name);
    const allSalesSnap = await salesCol.get();
    const customerSales = [];

    allSalesSnap.forEach((doc) => {
      const s = doc.data();
      const sNameNorm = normalizeArabic(s.customerName);
      const sPhone = normalizePhone(s.customerPhone || s.phone);
      
      const isNameMatch = Boolean(sNameNorm && customerNameNorm && sNameNorm === customerNameNorm);
      const isPhoneMatch = Boolean(rawCustPhone && rawCustPhone.length >= 7 && sPhone && sPhone.length >= 7 && (rawCustPhone.endsWith(sPhone) || sPhone.endsWith(rawCustPhone)));

      if (isNameMatch || isPhoneMatch) {
        const sanitizedItems = (s.items || []).map((item) => ({
          name: item.name || 'مادة',
          sku: item.sku || '',
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.total) || ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0))
        }));

        customerSales.push({
          id: doc.id,
          invoiceNumber: s.invoiceNumber || s.invoiceId || doc.id.slice(0, 6),
          invoiceType: s.invoiceType || 'cash',
          createdAt: s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : s.createdAt || null,
          total: Number(s.total) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          remainingDebt: s.remainingDebt !== undefined 
            ? Math.min(Number(s.remainingDebt), Math.max(0, (Number(s.total) || 0) - (Number(s.paidAmount) || 0)))
            : Math.max(0, (Number(s.total) || 0) - (Number(s.paidAmount) || 0)),
          isSettled: s.isSettled || false,
          items: sanitizedItems
        });
      }
    });

    customerSales.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    const customerIncomes = [];
    if (incomesCol) {
      const incSnap = await incomesCol.get();
      incSnap.forEach((doc) => {
        const inc = doc.data();
        const incNameNorm = normalizeArabic(inc.customerName || inc.payerName);
        if (incNameNorm && customerNameNorm && incNameNorm === customerNameNorm) {
          customerIncomes.push({
            id: doc.id,
            title: inc.title || 'فاتورة قديمة سابقة',
            amount: Number(inc.amount) || 0,
            date: inc.date || inc.createdAt || null,
            notes: inc.notes || ''
          });
        }
      });
    }

    let totalPurchases = 0;
    let cashPaid = 0;
    let totalDebt = 0;
    let oldInvoicesAmount = 0;

    customerSales.forEach((s) => {
      const totalAmt = Number(s.total) || 0;
      totalPurchases += totalAmt;
      if (s.invoiceType === 'debt') {
        const paid = Number(s.paidAmount) || 0;
        const remaining = s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, totalAmt - paid)) : Math.max(0, totalAmt - paid);
        cashPaid += paid;
        totalDebt += remaining;
      } else {
        cashPaid += totalAmt;
      }
    });

    customerIncomes.forEach((inc) => {
      const amt = Number(inc.amount) || 0;
      oldInvoicesAmount += amt;
      cashPaid += amt;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customer: {
          id: matchedCustomer.id,
          name: matchedCustomer.name,
          phone1: matchedCustomer.phone1 || rawCustPhone,
          phone2: matchedCustomer.phone2 || ''
        },
        summary: { totalPurchases, cashPaid, oldInvoicesAmount, totalDebt },
        sales: customerSales,
        incomes: customerIncomes
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'حدث خطأ في معالجة الطلب' })
    };
  }
}
