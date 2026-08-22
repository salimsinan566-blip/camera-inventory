import { db } from './firebase-admin.js';

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

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, phone, identifier, pin } = req.body || {};
    const inputIdentifier = String(identifier || name || phone || '').trim();
    const cleanPin = String(pin || '').trim();

    if (!inputIdentifier) {
      return res.status(400).json({ error: 'يرجى إدخال اسم العميل أو رقم هاتفه المسجل' });
    }

    const customersCol = db.collection('customers');
    const salesCol = db.collection('sales');
    const incomesCol = db.collection('office_incomes');

    if (!customersCol || !salesCol) {
      return res.status(500).json({ error: 'خدمة قاعدة البيانات غير متاحة حالياً' });
    }

    const normInput = normalizeArabic(inputIdentifier);
    const cleanPhoneInput = normalizePhone(inputIdentifier);

    // 1. Search in Customers Collection
    const custSnapshot = await customersCol.get();
    let matchedCustomer = null;

    custSnapshot.forEach((doc) => {
      const data = doc.data();
      const cNameNorm = normalizeArabic(data.name);
      const p1 = normalizePhone(data.phone1);
      const p2 = normalizePhone(data.phone2);

      const isNameMatch = (
        cNameNorm && normInput && 
        (cNameNorm === normInput || cNameNorm.includes(normInput) || normInput.includes(cNameNorm))
      );

      const isPhoneMatch = (
        cleanPhoneInput && (
          (p1 && cleanPhoneInput.endsWith(p1)) || 
          (p1 && p1.endsWith(cleanPhoneInput)) ||
          (p2 && cleanPhoneInput.endsWith(p2)) || 
          (p2 && p2.endsWith(cleanPhoneInput))
        )
      );

      if (isNameMatch || isPhoneMatch) {
        matchedCustomer = { id: doc.id, ...data };
      }
    });

    // Fallback: If not found in customers collection, check sales collection
    if (!matchedCustomer) {
      const salesSnap = await salesCol.get();
      for (const doc of salesSnap.docs) {
        const s = doc.data();
        const sNameNorm = normalizeArabic(s.customerName);
        const sPhone = normalizePhone(s.customerPhone || s.phone);

        const isNameMatch = (
          sNameNorm && normInput && 
          (sNameNorm === normInput || sNameNorm.includes(normInput) || normInput.includes(sNameNorm))
        );

        const isPhoneMatch = (
          cleanPhoneInput && sPhone && 
          (cleanPhoneInput.endsWith(sPhone) || sPhone.endsWith(cleanPhoneInput))
        );

        if (isNameMatch || isPhoneMatch) {
          matchedCustomer = {
            id: `temp-${doc.id}`,
            name: s.customerName || inputIdentifier,
            phone1: sPhone || ''
          };
          break;
        }
      }
    }

    if (!matchedCustomer) {
      return res.status(404).json({ 
        error: `لم يتم العثور على حساب مسجل باسم "${inputIdentifier}". يرجى التأكد من الاسم أو التواصل مع المحل.` 
      });
    }

    // 2. Validate Password / PIN against the last 4 digits of phone number or custom passcode
    const rawCustPhone = normalizePhone(matchedCustomer.phone1 || matchedCustomer.phone2 || '');
    const defaultLast4 = rawCustPhone.length >= 4 ? rawCustPhone.slice(-4) : rawCustPhone;
    const expectedPin = String(matchedCustomer.pinCode || matchedCustomer.passcode || defaultLast4).trim();

    if (cleanPin) {
      const isValid = (
        cleanPin === expectedPin ||
        (defaultLast4 && cleanPin === defaultLast4) ||
        (rawCustPhone && cleanPin === rawCustPhone)
      );

      if (!isValid) {
        return res.status(401).json({ 
          error: 'رمز المرور غير صحيح. رمز المرور هو آخر 4 أرقام من رقم هاتفك المسجل.' 
        });
      }
    } else {
      return res.status(400).json({ error: 'يرجى إدخال رمز المرور (آخر 4 أرقام من هاتفك)' });
    }

    const customerNameNorm = normalizeArabic(matchedCustomer.name);

    // 3. Fetch Customer Sales strictly (Stripping wholesale/cost prices for security)
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
          total: Number(item.total) || ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)),
          isService: Boolean(item.isService),
          category: item.category || ''
        }));

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
          remainingDebt: s.remainingDebt !== undefined 
            ? Math.min(Number(s.remainingDebt), Math.max(0, (Number(s.total) || 0) - (Number(s.paidAmount) || 0)))
            : Math.max(0, (Number(s.total) || 0) - (Number(s.paidAmount) || 0)),
          isSettled: s.isSettled || false,
          items: sanitizedItems,
          payments: (s.payments || []).map(p => ({
            id: p.id,
            amount: Number(p.amount) || 0,
            date: p.date,
            notes: p.notes || ''
          }))
        });
      }
    });

    customerSales.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    // 4. Fetch Manual Incomes & Old Invoices (Pre-system)
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
            category: inc.category || 'فواتير قديمة سابقة',
            amount: Number(inc.amount) || 0,
            date: inc.date || inc.createdAt || null,
            notes: inc.notes || ''
          });
        }
      });
    }

    // 5. Calculate Financial Summary
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

    return res.status(200).json({
      success: true,
      customer: {
        id: matchedCustomer.id,
        name: matchedCustomer.name,
        phone1: matchedCustomer.phone1 || rawCustPhone,
        phone2: matchedCustomer.phone2 || ''
      },
      summary: {
        totalPurchases,
        cashPaid,
        oldInvoicesAmount,
        totalDebt
      },
      sales: customerSales,
      incomes: customerIncomes
    });

  } catch (error) {
    console.error('Customer Statement API Error:', error);
    return res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة الطلب' });
  }
}
