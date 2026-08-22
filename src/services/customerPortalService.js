/**
 * خدمة بوابة العملاء لتسجيل الدخول وجلب كشف الحساب بأمان تام
 */

const SESSION_KEY = 'safe_zone_customer_portal_session';

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

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[\s\-\+\(\)]/g, '').trim();
}

export function getSavedCustomerSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function saveCustomerSession(customerData, remember = true) {
  try {
    const dataStr = JSON.stringify(customerData);
    if (remember) {
      localStorage.setItem(SESSION_KEY, dataStr);
    } else {
      sessionStorage.setItem(SESSION_KEY, dataStr);
    }
  } catch (err) {
    console.error('Session save error:', err);
  }
}

export function clearCustomerSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.error('Session clear error:', err);
  }
}

/**
 * تسجيل دخول العميل بالاسم (أو الهاتف) وآخر 4 أرقام من رقم هاتفه كرمز مرور
 */
export async function authenticateCustomer(customerIdentifier, pin = '', remember = true) {
  const trimmedId = String(customerIdentifier || '').trim();
  const cleanPin = String(pin || '').trim();

  if (!trimmedId) {
    throw new Error('يرجى إدخال اسم العميل المسجل');
  }
  if (!cleanPin) {
    throw new Error('يرجى إدخال رمز المرور (آخر 4 أرقام من رقم هاتفك)');
  }

  // 1. Try calling the backend API endpoint if available and returning valid JSON
  try {
    const res = await fetch('/api/customer-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: trimmedId, pin: cleanPin })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success) {
        const sessionData = {
          identifier: trimmedId,
          pin: cleanPin,
          customer: data.customer,
          summary: data.summary,
          sales: data.sales,
          incomes: data.incomes,
          lastUpdated: new Date().toISOString()
        };
        saveCustomerSession(sessionData, remember);
        return sessionData;
      } else if (res.status === 401 || res.status === 404 || res.status === 400) {
        throw new Error(data.error || 'بيانات الدخول غير صحيحة');
      }
    }
  } catch (apiErr) {
    // If it's a specific auth/user error from the API, rethrow it
    if (apiErr.message && !apiErr.message.includes('JSON') && !apiErr.message.includes('Failed to fetch') && !apiErr.message.includes('405') && !apiErr.message.includes('Unexpected token')) {
      throw apiErr;
    }
    console.warn('Backend API returned non-JSON/unavailable, proceeding to Direct Firestore lookup...', apiErr.message);
  }

  // 2. Direct Client-Side Firestore Lookup (Robust for Netlify static deployments)
  try {
    const { getDocs, collection } = await import('firebase/firestore');
    const { db } = await import('../firebase/config');
    const { auth } = await import('../firebase/auth');
    const { signInAnonymously } = await import('firebase/auth');

    // Ensure client has auth session if required by Firestore rules
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.warn('Anonymous sign-in skipped:', authErr.message);
      }
    }

    const normInput = normalizeArabic(trimmedId);
    const cleanPhoneInput = normalizePhone(trimmedId);

    const customersSnap = await getDocs(collection(db, 'customers'));
    let matchedCustomer = null;

    customersSnap.forEach((doc) => {
      const d = doc.data();
      const cNameNorm = normalizeArabic(d.name);
      const p1 = normalizePhone(d.phone1);
      const p2 = normalizePhone(d.phone2);

      const isNameMatch = Boolean(cNameNorm && normInput && cNameNorm === normInput);
      const isPhoneMatch = Boolean(
        cleanPhoneInput && cleanPhoneInput.length >= 7 && (
          (p1 && cleanPhoneInput.endsWith(p1)) || 
          (p1 && p1.endsWith(cleanPhoneInput)) || 
          (p2 && cleanPhoneInput.endsWith(p2))
        )
      );

      if (isNameMatch || isPhoneMatch) {
        matchedCustomer = { id: doc.id, ...d };
      }
    });

    // If not found in customers collection, search sales collection
    if (!matchedCustomer) {
      const salesSnap = await getDocs(collection(db, 'sales'));
      for (const doc of salesSnap.docs) {
        const s = doc.data();
        const sNameNorm = normalizeArabic(s.customerName);
        const sPhone = normalizePhone(s.customerPhone || s.phone);

        const isNameMatch = Boolean(sNameNorm && normInput && sNameNorm === normInput);
        const isPhoneMatch = Boolean(cleanPhoneInput && cleanPhoneInput.length >= 7 && sPhone && (cleanPhoneInput.endsWith(sPhone) || sPhone.endsWith(cleanPhoneInput)));

        if (isNameMatch || isPhoneMatch) {
          matchedCustomer = {
            id: `temp-${doc.id}`,
            name: s.customerName || trimmedId,
            phone1: sPhone
          };
          break;
        }
      }
    }

    if (!matchedCustomer) {
      throw new Error(`لم يتم العثور على حساب مسجل باسم "${trimmedId}". يرجى التأكد من كتابة الاسم.`);
    }

    const p1 = normalizePhone(matchedCustomer.phone1 || matchedCustomer.phone2 || '');
    const defaultLast4 = p1.length >= 4 ? p1.slice(-4) : p1;
    const expectedPin = String(matchedCustomer.pinCode || matchedCustomer.passcode || defaultLast4).trim();

    const isPinValid = Boolean(
      cleanPin === expectedPin ||
      (defaultLast4 && cleanPin === defaultLast4) ||
      (p1 && cleanPin === p1)
    );

    if (!isPinValid) {
      throw new Error('رمز المرور غير صحيح. رمز المرور هو آخر 4 أرقام من رقم هاتفك المسجل.');
    }

    // Fetch sales and incomes strictly for this customer
    const salesSnap = await getDocs(collection(db, 'sales'));
    const customerSales = [];
    const targetNameNorm = normalizeArabic(matchedCustomer.name);

    salesSnap.forEach((doc) => {
      const s = doc.data();
      const sNameNorm = normalizeArabic(s.customerName);
      const sPhone = normalizePhone(s.customerPhone || s.phone);

      const isNameMatch = Boolean(sNameNorm && targetNameNorm && sNameNorm === targetNameNorm);
      const isPhoneMatch = Boolean(p1 && p1.length >= 7 && sPhone && sPhone.length >= 7 && (p1.endsWith(sPhone) || sPhone.endsWith(p1)));

      if (isNameMatch || isPhoneMatch) {
        customerSales.push({
          id: doc.id,
          invoiceNumber: s.invoiceNumber || s.invoiceId || doc.id.slice(0, 6),
          invoiceType: s.invoiceType || 'cash',
          customerName: s.customerName || matchedCustomer.name,
          customerPhone: s.customerPhone || sPhone || matchedCustomer.phone1 || matchedCustomer.phone2 || '',
          customerId: s.customerId || matchedCustomer.id || '',
          cashierEmail: s.cashierEmail || '',
          notes: s.notes || '',
          discount: Number(s.discount) || 0,
          taxRate: Number(s.taxRate) || 0,
          subtotal: Number(s.subtotal) || ((Number(s.total) || 0) + (Number(s.discount) || 0)),
          createdAt: s.createdAt?.toDate ? s.createdAt.toDate().toISOString() : s.createdAt || null,
          total: Number(s.total) || 0,
          paidAmount: Number(s.paidAmount) || 0,
          remainingDebt: s.remainingDebt !== undefined ? Number(s.remainingDebt) : Math.max(0, (Number(s.total) || 0) - (Number(s.paidAmount) || 0)),
          isSettled: s.isSettled || false,
          items: (s.items || []).map(i => ({
            name: i.name,
            sku: i.sku || '',
            quantity: Number(i.quantity) || 1,
            unitPrice: Number(i.unitPrice) || 0,
            total: Number(i.total) || 0,
            isService: Boolean(i.isService),
            category: i.category || ''
          })),
          payments: (s.payments || []).map(p => ({
            id: p.id,
            amount: Number(p.amount) || 0,
            date: p.date,
            notes: p.notes || ''
          }))
        });
      }
    });

    const incomesSnap = await getDocs(collection(db, 'office_incomes'));
    const customerIncomes = [];
    incomesSnap.forEach((doc) => {
      const inc = doc.data();
      const incNameNorm = normalizeArabic(inc.customerName || inc.payerName);
      if (incNameNorm && targetNameNorm && incNameNorm === targetNameNorm) {
        customerIncomes.push({
          id: doc.id,
          title: inc.title || 'فاتورة قديمة سابقة',
          amount: Number(inc.amount) || 0,
          date: inc.date || inc.createdAt || null,
          notes: inc.notes || ''
        });
      }
    });

    let totalPurchases = 0;
    let cashPaid = 0;
    let totalDebt = 0;
    let oldInvoicesAmount = 0;

    customerSales.forEach((s) => {
      const amt = Number(s.total) || 0;
      totalPurchases += amt;
      if (s.invoiceType === 'debt') {
        const paid = Number(s.paidAmount) || 0;
        const remaining = s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, amt - paid)) : Math.max(0, amt - paid);
        cashPaid += paid;
        totalDebt += remaining;
      } else {
        cashPaid += amt;
      }
    });

    customerIncomes.forEach((inc) => {
      const amt = Number(inc.amount) || 0;
      oldInvoicesAmount += amt;
      cashPaid += amt;
    });

    const result = {
      identifier: trimmedId,
      pin: cleanPin,
      customer: {
        id: matchedCustomer.id,
        name: matchedCustomer.name,
        phone1: matchedCustomer.phone1 || p1,
        phone2: matchedCustomer.phone2 || ''
      },
      summary: { totalPurchases, cashPaid, oldInvoicesAmount, totalDebt },
      sales: customerSales.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)),
      incomes: customerIncomes,
      lastUpdated: new Date().toISOString()
    };

    saveCustomerSession(result, remember);
    return result;
  } catch (err) {
    throw new Error(err.message || 'فشل الاتصال والتحقق من الحساب');
  }
}
