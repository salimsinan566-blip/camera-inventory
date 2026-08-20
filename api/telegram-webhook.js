import { db } from './firebase-admin.js';
import Fuse from 'fuse.js';
import * as XLSX from 'xlsx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Helper to safely parse dates from Firestore Timestamp, ISO string, milliseconds, etc.
function parseDateSafe(val) {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    return val.toDate();
  }
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000);
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'number') {
    return new Date(val);
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Check if a date belongs to today in Iraq timezone (Asia/Baghdad)
function isTodayIraq(dateObj) {
  if (!dateObj) return false;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = formatter.format(new Date());
    const targetStr = formatter.format(dateObj);
    return todayStr === targetStr;
  } catch (e) {
    const now = new Date();
    return (
      dateObj.getFullYear() === now.getFullYear() &&
      dateObj.getMonth() === now.getMonth() &&
      dateObj.getDate() === now.getDate()
    );
  }
}

// Check if a date belongs to current month in Iraq timezone
function isCurrentMonthIraq(dateObj) {
  if (!dateObj) return false;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit' });
    const currentMonthStr = formatter.format(new Date());
    const targetMonthStr = formatter.format(dateObj);
    return currentMonthStr === targetMonthStr;
  } catch (e) {
    const now = new Date();
    return (
      dateObj.getFullYear() === now.getFullYear() &&
      dateObj.getMonth() === now.getMonth()
    );
  }
}

// Helper to normalize phone
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/[\s\-\+\(\)]/g, '').trim();
}

// Helper to normalize Arabic
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0640]/g, ''); // includes tatweel removal
}

function escapeHTML(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeProduct(raw) {
  const p = { ...raw };
  const hasNewFields = p.storeQty !== undefined || p.warehouseQty !== undefined;

  if (!hasNewFields) {
    const oldQty = Number(p.quantity) || 0;
    const oldThreshold = Number(p.minThreshold) || 5;
    if (p.location === 'warehouse') {
      p.storeQty = 0;
      p.warehouseQty = oldQty;
    } else {
      p.storeQty = oldQty;
      p.warehouseQty = 0;
    }
    p.storeMinThreshold = oldThreshold;
    p.warehouseMinThreshold = oldThreshold;
  } else {
    p.storeQty = Number(p.storeQty) || 0;
    p.warehouseQty = Number(p.warehouseQty) || 0;
    p.storeMinThreshold = p.storeMinThreshold !== undefined ? Number(p.storeMinThreshold) : 5;
    p.warehouseMinThreshold = p.warehouseMinThreshold !== undefined ? Number(p.warehouseMinThreshold) : 5;
  }
  return p;
}

/**
 * حساب البيانات المالية التراكمية الدقيقة لكل العملاء من الفواتير وسندات القبض
 */
async function getAllCustomersWithFinancials() {
  const [custSnap, salesSnap, incomesSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('sales').get(),
    db.collection('office_incomes').get()
  ]);

  const customerMap = new Map(); // key (normName) -> customerObj
  const idToCustomerMap = new Map(); // key (doc.id) -> customerObj

  // 1. Load from customers collection
  custSnap.forEach(doc => {
    const data = doc.data();
    const rawName = (data.name || '').trim();
    if (!rawName) return;
    const norm = normalizeArabic(rawName);

    const cObj = {
      id: doc.id,
      name: rawName,
      phone1: data.phone1 || data.phone || '',
      phone2: data.phone2 || '',
      address: data.address || '',
      totalPurchases: 0,
      totalPaid: 0,
      totalDebt: 0,
      invoicesCount: 0,
      sales: []
    };
    customerMap.set(norm, cObj);
    idToCustomerMap.set(doc.id, cObj);
  });

  // 2. Discover from sales collection
  salesSnap.forEach(doc => {
    const s = doc.data();
    if (s.status === 'draft' || s.status === 'suspended' || s.status === 'cancelled') return;
    const rawName = (s.customerName || '').trim();
    if (!rawName) return;
    const norm = normalizeArabic(rawName);

    if (!customerMap.has(norm)) {
      const cObj = {
        id: doc.id,
        name: rawName,
        phone1: s.phone1 || s.customerPhone || s.phone || '',
        phone2: s.phone2 || '',
        address: '',
        totalPurchases: 0,
        totalPaid: 0,
        totalDebt: 0,
        invoicesCount: 0,
        sales: []
      };
      customerMap.set(norm, cObj);
      idToCustomerMap.set(doc.id, cObj);
    }

    const c = customerMap.get(norm);
    const total = Number(s.total || 0);
    c.totalPurchases += total;
    c.invoicesCount += 1;
    c.sales.push({ id: doc.id, ...s });

    if (!c.phone1 && (s.phone1 || s.customerPhone || s.phone)) {
      c.phone1 = s.phone1 || s.customerPhone || s.phone;
    }

    if (s.invoiceType === 'debt') {
      const paid = Number(s.paidAmount || 0);
      const remaining = s.isSettled ? 0 : (s.remainingDebt !== undefined ? Math.min(Number(s.remainingDebt), Math.max(0, total - paid)) : Math.max(0, total - paid));
      c.totalPaid += paid;
      c.totalDebt += remaining;
    } else {
      c.totalPaid += total;
    }
  });

  // 3. Deduct repayments from office_incomes
  incomesSnap.forEach(doc => {
    const inc = doc.data();
    const rawName = (inc.customerName || inc.payerName || '').trim();
    if (!rawName) return;
    const norm = normalizeArabic(rawName);

    if (customerMap.has(norm)) {
      const c = customerMap.get(norm);
      const amt = Number(inc.amount || 0);
      c.totalPaid += amt;
      c.totalDebt = Math.max(0, c.totalDebt - amt);
    }
  });

  return {
    customersList: Array.from(customerMap.values()),
    customerMap,
    idToCustomerMap
  };
}

/**
 * حساب ديون الموردين (الدائنون) بدقة من سجلات supplier_debts وفواتير purchases
 */
async function getSuppliersDebtsList() {
  const debtsSnap = await db.collection('supplier_debts').get();
  const purchasesSnap = await db.collection('purchases').get();

  const map = {};

  // 1. From supplier_debts collection
  debtsSnap.forEach(doc => {
    const d = doc.data();
    const rawName = (d.name || doc.id || '').trim();
    if (!rawName) return;
    const key = normalizeArabic(rawName);
    map[key] = {
      id: doc.id,
      name: rawName,
      phone: d.phone || '',
      totalPurchases: Number(d.totalPurchases || 0),
      totalPaid: Number(d.totalPaid || 0),
      remainingDebt: Number(d.remainingDebt || 0)
    };
  });

  // 2. Merge from purchases collection if not fully reflected
  purchasesSnap.forEach(doc => {
    const p = doc.data();
    const rawName = (p.supplierName || '').trim();
    if (!rawName) return;
    const key = normalizeArabic(rawName);

    const total = Number(p.totalAmount || 0);
    const paid = Number(p.paidAmount || (p.paymentStatus === 'paid' ? total : 0));
    const debt = Math.max(0, total - paid);

    if (!map[key]) {
      map[key] = {
        id: rawName.replace(/[\/\\]/g, '_'),
        name: rawName,
        phone: p.supplierPhone || '',
        totalPurchases: total,
        totalPaid: paid,
        remainingDebt: debt
      };
    } else {
      if (map[key].totalPurchases === 0 && total > 0) {
        map[key].totalPurchases += total;
        map[key].totalPaid += paid;
        map[key].remainingDebt = Math.max(map[key].remainingDebt, debt);
      }
    }
  });

  const creditors = Object.values(map).filter(s => s.remainingDebt > 0);
  creditors.sort((a, b) => b.remainingDebt - a.remainingDebt);

  const totalOwed = creditors.reduce((sum, c) => sum + c.remainingDebt, 0);

  return { creditors, totalOwed };
}

/**
 * توليد ملف PDF رسمي لأي فاتورة مباشرة
 */
async function generateInvoicePdfBuffer(sale, storeInfo = {}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();

  // Header Background
  page.drawRectangle({
    x: 30,
    y: height - 100,
    width: width - 60,
    height: 70,
    color: rgb(0.12, 0.23, 0.54),
  });

  page.drawText(storeInfo.storeName || 'SAFE ZONE INVENTORY', {
    x: 45,
    y: height - 60,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`INVOICE #${sale.invoiceNumber || sale.id}`, {
    x: 45,
    y: height - 85,
    size: 12,
    font: fontRegular,
    color: rgb(0.9, 0.9, 1),
  });

  let dateStr = '---';
  try {
    const rawDate = parseDateSafe(sale.createdAt) || new Date();
    dateStr = rawDate.toLocaleDateString('en-GB');
  } catch (e) {
    dateStr = new Date().toLocaleDateString('en-GB');
  }

  page.drawText(`Date: ${dateStr}`, {
    x: width - 200,
    y: height - 60,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Payment: ${sale.invoiceType === 'debt' ? 'DEBT / CREDIT' : 'CASH'}`, {
    x: width - 200,
    y: height - 80,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.9, 1),
  });

  // Customer Info Box
  page.drawRectangle({
    x: 30,
    y: height - 160,
    width: width - 60,
    height: 48,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.93),
    borderWidth: 1,
  });

  page.drawText(`Customer: ${sale.customerName || 'General Customer'}`, {
    x: 45,
    y: height - 132,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  const custPhone = sale.phone1 || sale.phone || sale.customerPhone || '';
  if (custPhone) {
    page.drawText(`Phone: ${custPhone}`, {
      x: 45,
      y: height - 150,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45),
    });
  }

  // Table Header
  const tableTop = height - 185;
  page.drawRectangle({
    x: 30,
    y: tableTop - 25,
    width: width - 60,
    height: 25,
    color: rgb(0.92, 0.94, 0.98),
  });

  page.drawText('#', { x: 40, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Item Description', { x: 70, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Qty', { x: 330, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Unit Price (IQD)', { x: 390, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Total (IQD)', { x: 490, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });

  // Table Rows
  let currentY = tableTop - 45;
  const items = sale.items || [];

  items.slice(0, 22).forEach((item, index) => {
    const lineTotal = Number(item.lineTotal || ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)));
    const itemName = (item.name || item.productName || 'Product Item').substring(0, 42);

    page.drawText(`${index + 1}`, { x: 40, y: currentY, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(itemName, { x: 70, y: currentY, size: 8.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`${item.quantity || 1}`, { x: 335, y: currentY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`${Number(item.unitPrice || 0).toLocaleString()}`, { x: 395, y: currentY, size: 8.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`${lineTotal.toLocaleString()}`, { x: 495, y: currentY, size: 8.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    page.drawLine({
      start: { x: 30, y: currentY - 6 },
      end: { x: width - 30, y: currentY - 6 },
      thickness: 0.5,
      color: rgb(0.9, 0.92, 0.95),
    });

    currentY -= 20;
  });

  // Summary Box
  const summaryTop = Math.max(currentY - 15, 140);
  const boxWidth = 240;
  const boxX = width - 30 - boxWidth;

  page.drawRectangle({
    x: boxX,
    y: summaryTop - 110,
    width: boxWidth,
    height: 110,
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.85, 0.88, 0.95),
    borderWidth: 1,
  });

  const subtotal = Number(sale.subtotal || sale.total || 0);
  const discount = Number(sale.discount || 0);
  const total = Number(sale.total || (subtotal - discount));
  const paid = Number(sale.paidAmount || (sale.invoiceType === 'debt' ? 0 : total));
  const remaining = Math.max(0, total - paid);

  let sY = summaryTop - 20;
  page.drawText('Subtotal:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(`${subtotal.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

  sY -= 20;
  if (discount > 0) {
    page.drawText('Discount:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.8, 0.2, 0.2) });
    page.drawText(`-${discount.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: rgb(0.8, 0.2, 0.2) });
    sY -= 20;
  }

  page.drawText('Total Net:', { x: boxX + 15, y: sY, size: 10.5, font: fontBold, color: rgb(0.1, 0.15, 0.4) });
  page.drawText(`${total.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 10.5, font: fontBold, color: rgb(0.1, 0.15, 0.4) });

  sY -= 20;
  page.drawText('Paid Amount:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.5, 0.2) });
  page.drawText(`${paid.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

  sY -= 20;
  page.drawText('Remaining Debt:', { x: boxX + 15, y: sY, size: 9.5, font: fontBold, color: remaining > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.2, 0.6, 0.2) });
  page.drawText(`${remaining.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: remaining > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.2, 0.6, 0.2) });

  page.drawText(`Safe Zone POS System — Official Document`, {
    x: 45,
    y: 35,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.55, 0.6),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook active');
  }

  try {
    if (req.body?.callback_query) {
      await handleCallbackQuery(req.body.callback_query);
      return res.status(200).send('OK');
    }

    const message = req.body?.message;
    if (!message || !message.text) {
      return res.status(200).send('OK');
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const cleanText = normalizeArabic(text);

    // 1. أمر البداية والمساعدة
    if (text === '/start' || cleanText === 'مساعده' || cleanText === 'اوامر' || text === '/help') {
      await sendWelcomeMenu(chatId);
      return res.status(200).send('OK');
    }

    // 2. أمر الدائنون (شكد يطلبوني / ديون الموردين)
    if (
      cleanText === 'الدائنون' ||
      cleanText === 'الموردين' ||
      cleanText === 'ديون الموردين' ||
      cleanText === 'شكد يطلبوني' ||
      cleanText === 'علينا ديون' ||
      cleanText === 'شكد يطلبني' ||
      cleanText === 'ديون علينا'
    ) {
      await handleSuppliersDebts(chatId);
      return res.status(200).send('OK');
    }

    // 3. أمر المدينون (شكد اطلب ديون من العملاء)
    if (
      cleanText === 'المدينون' ||
      cleanText === 'الديون' ||
      cleanText === 'ديون العملاء' ||
      cleanText === 'شكد نطلب' ||
      cleanText === 'شكد اطلب' ||
      cleanText === 'قائمة الديون' ||
      cleanText === 'ديون'
    ) {
      await handleCustomerDebtsList(chatId, 0);
      return res.status(200).send('OK');
    }

    // 4. أمر الدخل والصندوق (شكد اكو بالدخل)
    if (
      cleanText === 'الدخل' ||
      cleanText === 'الصندوق' ||
      cleanText === 'شكد بالدخل' ||
      cleanText === 'شكد اكو بالدخل' ||
      cleanText === 'اليوميه' ||
      cleanText === 'الارباح' ||
      cleanText === 'دخل اليوم' ||
      cleanText === 'ارباح اليوم' ||
      cleanText === 'الكاش'
    ) {
      await handleDailyIncome(chatId);
      return res.status(200).send('OK');
    }

    // 5. موعد التقرير اليومي
    const timeMatch = text.match(/(?:تغير موعد|تغيير موعد|وقت التقرير|موعد التقرير|اريد التقرير الساعة|الساعة)\s*(\d{1,2})(?::(\d{1,2}))?/);
    if (timeMatch) {
      await handleScheduleTime(chatId, text, timeMatch);
      return res.status(200).send('OK');
    }

    // 6. أمر النواقص
    if (cleanText === 'النواقص' || text === '/report' || cleanText === 'ازلو') {
      const productsSnapshot = await db.collection('products').get();
      const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));
      await sendShortageReportCategories(chatId, products, 0);
      return res.status(200).send('OK');
    }

    // 7. أمر الأقسام
    if (cleanText === 'اقسام' || text === '/categories') {
      const productsSnapshot = await db.collection('products').get();
      const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));
      await sendAllCategories(chatId, products, 0);
      return res.status(200).send('OK');
    }

    // 8. فحص إذا كان الإدخال بحث عن فاتورة معينة (مثال: #1005 أو فاتورة 1005 أو رقم 1005)
    const invoiceNumberMatch = text.match(/^(?:#|فاتورة\s*#?|رقم\s*#?)?(\d{3,7})$/i);
    if (invoiceNumberMatch) {
      const invoiceNum = invoiceNumberMatch[1];
      const handled = await handleSearchInvoiceByNumber(chatId, invoiceNum);
      if (handled) return res.status(200).send('OK');
    }

    // 9. فحص إذا كان الإدخال بحث صريح عن عميل (مثال: عميل علي، حساب علي، كشف حساب محمد)
    const customerMatch = text.match(/^(?:عميل|حساب|كشف\s*حساب|ديون|شكد\s*اطلب)\s+(.+)$/i);
    if (customerMatch) {
      const targetName = customerMatch[1].trim();
      const handled = await handleCustomerSearch(chatId, targetName, true);
      if (handled) return res.status(200).send('OK');
    }

    // 10. البحث الذكي المزدوج (يفحص المنتجات والعملاء بذكاء وبدون تجاهل أي طرف)
    const productsSnapshot = await db.collection('products').get();
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));

    // 10.1 فحص تطابق تام أو قوي مع اسم عميل أولاً
    const customerFound = await handleCustomerSearch(chatId, text, false);
    if (customerFound) {
      return res.status(200).send('OK');
    }

    // 10.2 البحث في المنتجات
    const searchFound = await performSearch(chatId, products, text, null, 0, false);
    if (searchFound) {
      return res.status(200).send('OK');
    }

    // 10.3 إذا لم يجد شيئاً
    await sendMessage(chatId, `❌ لم أتمكن من العثور على أي منتج أو عميل أو فاتورة تطابق «${escapeHTML(text)}».\n\n💡 أرسل /start لعرض الخدمات والأوامر المتاحة.`);

    return res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).send('Error');
  }
}

async function sendWelcomeMenu(chatId) {
  const msg = 
    `🌟 <b>مرحباً بك في المساعد الذكي لإدارة المخزون والحسابات</b> 🤖\n\n` +
    `يمكنك استخدام البوت لإنجاز ومتابعة كافة العمليات بسهولة:\n\n` +
    `📦 <b>المنتجات والمخزون:</b>\n` +
    `• اكتب اسم أي منتج للبحث عنه مباشرة\n` +
    `• أرسل «<b>النواقص</b>» أو «<b>اقسام</b>»\n\n` +
    `👥 <b>العملاء والديون (شكد اطلب):</b>\n` +
    `• اكتب «<b>عميل [اسم العميل]</b>» أو اسمه فقط لمعرفة ديونه وحسابه\n` +
    `• أرسل كلمة «<b>المدينون</b>» لعرض قائمة ديون كل العملاء\n\n` +
    `🏢 <b>الدائنون (شكد يطلبوني):</b>\n` +
    `• أرسل كلمة «<b>الدائنون</b>» لمعرفة ديون الموردين المطلوب سدادها\n\n` +
    `💰 <b>الدخل والصندوق:</b>\n` +
    `• أرسل كلمة «<b>الدخل</b>» لمعرفة كاش الصندوق ومبيعات ومصاريف اليوم\n\n` +
    `🧾 <b>الفواتير وطباعة PDF:</b>\n` +
    `• اكتب رقم أي فاتورة (مثال: «<b>#1005</b>») وستصلك الفاتورة PDF فوراً!`;

  const buttons = [
    [
      { text: '💰 الدخل والصندوق اليوم', callback_data: 'cmd_income' },
      { text: '🏢 الدائنون (الموردين)', callback_data: 'cmd_creditors' }
    ],
    [
      { text: '👥 ديون العملاء (المدينون)', callback_data: 'cmd_debtors' },
      { text: '📊 تقرير النواقص', callback_data: 'cmd_shortages' }
    ],
    [
      { text: '📁 تصفح الأقسام', callback_data: 'allcat:0' }
    ]
  ];

  await sendInlineKeyboard(chatId, msg, buttons);
}

/**
 * معالجة الدائنون (الموردين وديون المشتريات)
 */
async function handleSuppliersDebts(chatId) {
  const { creditors, totalOwed } = await getSuppliersDebtsList();

  if (creditors.length === 0) {
    await sendMessage(chatId, `🎉 <b>لا توجد أي ديون للموردين حالياً!</b>\nجميع حسابات الشراء مسددة بالكامل.`);
    return;
  }

  let msg = `🏢 <b>تقرير الدائنين (ديون الموردين المطلوبة منا)</b>\n\n` +
            `🔴 <b>إجمالي المبلغ المطلوب سداده:</b>\n` +
            `👉 <b>${totalOwed.toLocaleString()} د.ع</b>\n` +
            `عدد الموردين الدائنين: ${creditors.length}\n` +
            `────────────────────\n\n`;

  creditors.slice(0, 10).forEach((c, idx) => {
    msg += `<b>${idx + 1}. ${escapeHTML(c.name)}</b>\n` +
           `   💰 المتبقي له: <b>${c.remainingDebt.toLocaleString()} د.ع</b>\n` +
           (c.phone ? `   📞 هاتف: <code>${c.phone}</code>\n` : '') +
           `   📦 إجمالي المشتريات: ${c.totalPurchases.toLocaleString()} د.ع\n\n`;
  });

  if (creditors.length > 10) {
    msg += `<i>والمزيد من الموردين (${creditors.length - 10} موردين آخرين)...</i>\n`;
  }

  const buttons = [
    [{ text: '📊 تحميل كشف الدائنين بالكامل (Excel)', callback_data: 'dl_creditors_excel' }]
  ];

  await sendInlineKeyboard(chatId, msg, buttons);
}

/**
 * معالجة ديون العملاء (المدينون - شكد نطلب العملاء) مع دعم كامل للصفحات والأزرار الآمنة
 */
async function handleCustomerDebtsList(chatId, page = 0) {
  const { customersList } = await getAllCustomersWithFinancials();
  const debtors = customersList.filter(c => c.totalDebt > 0);
  debtors.sort((a, b) => b.totalDebt - a.totalDebt);

  const totalCustomerDebt = debtors.reduce((sum, d) => sum + d.totalDebt, 0);

  if (debtors.length === 0) {
    await sendMessage(chatId, `🎉 <b>لا توجد أي ديون متأخرة على العملاء!</b>\nكافة فواتير العملاء مسددة بالكامل.`);
    return;
  }

  const pageSize = 6;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagedDebtors = debtors.slice(start, end);

  let msg = page === 0 
    ? `👥 <b>تقرير ديون العملاء (المدينون)</b>\n\n` +
      `🟢 <b>إجمالي الديون المطلوبة:</b>\n` +
      `👉 <b>${totalCustomerDebt.toLocaleString()} د.ع</b>\n` +
      `عدد العملاء المدينين: ${debtors.length}\n` +
      `────────────────────\n\n`
    : `تابع قائمة المدينين (صفحة ${page + 1} من ${Math.ceil(debtors.length / pageSize)}):\n\n`;

  const buttons = [];

  pagedDebtors.forEach((d, idx) => {
    const globalIdx = start + idx + 1;
    msg += `<b>${globalIdx}. ${escapeHTML(d.name)}</b>\n` +
           `   🔴 مطلوب منه: <b>${d.totalDebt.toLocaleString()} د.ع</b>\n` +
           (d.phone1 ? `   📞 هاتف: <code>${d.phone1}</code>\n` : '') + `\n`;

    buttons.push([{ text: `👤 تفاصيل وفواتير: ${d.name}`, callback_data: `cd:${d.id}` }]);
  });

  if (debtors.length > end) {
    buttons.push([{ text: `⬇️ عرض المزيد من العملاء المدينين`, callback_data: `debtors_page:${page + 1}` }]);
  }

  if (page === 0) {
    buttons.push([{ text: '📊 تحميل كشف ديون العملاء (Excel)', callback_data: 'dl_debtors_excel' }]);
  }

  await sendInlineKeyboard(chatId, msg, buttons);
}

/**
 * معالجة الدخل والصندوق (شكد اكو بالدخل)
 */
async function handleDailyIncome(chatId) {
  const salesSnap = await db.collection('sales').get();
  const incomesSnap = await db.collection('office_incomes').get();
  const expSnap = await db.collection('expenses').get();
  const purchasesSnap = await db.collection('purchases').get();

  // 1. مبيعات اليوم والشهر
  let todayCashSales = 0;
  let todayTotalSales = 0;
  let todayInvoicesCount = 0;
  let monthTotalSales = 0;

  // التراكمي للصندوق
  let allDirectCashSales = 0;
  let allDebtCashPayments = 0;

  salesSnap.forEach(doc => {
    const s = doc.data();
    if (s.status === 'draft' || s.status === 'suspended' || s.status === 'cancelled') return;

    const sDate = parseDateSafe(s.createdAt) || parseDateSafe(s.confirmedAt) || parseDateSafe(s.date);
    const total = Number(s.total || 0);
    const paid = Number(s.paidAmount || (s.invoiceType === 'debt' ? 0 : total));

    if (s.invoiceType === 'debt') {
      allDebtCashPayments += paid;
    } else {
      allDirectCashSales += total;
    }

    if (sDate && isCurrentMonthIraq(sDate)) {
      monthTotalSales += total;
    }

    if (sDate && isTodayIraq(sDate)) {
      todayInvoicesCount++;
      todayTotalSales += total;
      todayCashSales += paid;
    }
  });

  // 2. سندات القبض والدخل الإضافي (office_incomes)
  let todayOfficeIncomes = 0;
  let allOfficeIncomes = 0;

  incomesSnap.forEach(doc => {
    const inc = doc.data();
    const amt = Number(inc.amount || 0);
    allOfficeIncomes += amt;

    const incDate = parseDateSafe(inc.createdAt) || parseDateSafe(inc.date);
    if (incDate && isTodayIraq(incDate)) {
      todayOfficeIncomes += amt;
    }
  });

  // 3. المصاريف (expenses)
  let todayExpenses = 0;
  let allExpenses = 0;

  expSnap.forEach(doc => {
    const exp = doc.data();
    const amt = Number(exp.amount || 0);
    allExpenses += amt;

    const expDate = parseDateSafe(exp.createdAt) || parseDateSafe(exp.date);
    if (expDate && isTodayIraq(expDate)) {
      todayExpenses += amt;
    }
  });

  // 4. مشتريات اليوم النقدية (purchases)
  let todayCashPurchases = 0;
  let allCashPurchases = 0;

  purchasesSnap.forEach(doc => {
    const p = doc.data();
    const paid = Number(p.paidAmount || (p.paymentStatus === 'paid' ? p.totalAmount : 0));
    allCashPurchases += paid;

    const pDate = parseDateSafe(p.createdAt) || parseDateSafe(p.date);
    if (pDate && isTodayIraq(pDate)) {
      todayCashPurchases += paid;
    }
  });

  // فحص آخر تسوية صندوف (إن وجدت)
  let cumulativeDrawerCash = allDirectCashSales + allDebtCashPayments + allOfficeIncomes - allExpenses - allCashPurchases;
  try {
    const reconSnap = await db.collection('cash_reconciliations').orderBy('createdAt', 'desc').limit(1).get();
    if (!reconSnap.empty) {
      const rec = reconSnap.docs[0].data();
      const recDate = parseDateSafe(rec.createdAt) || parseDateSafe(rec.date);
      const baseAmount = Number(rec.actualCashAmount) || 0;

      if (recDate) {
        let inflowSince = 0;
        let outflowSince = 0;

        salesSnap.forEach(doc => {
          const s = doc.data();
          if (s.status === 'draft' || s.status === 'suspended' || s.status === 'cancelled') return;
          const sDate = parseDateSafe(s.createdAt) || parseDateSafe(s.confirmedAt);
          if (sDate && sDate > recDate) {
            inflowSince += Number(s.paidAmount || (s.invoiceType === 'debt' ? 0 : s.total) || 0);
          }
        });

        incomesSnap.forEach(doc => {
          const inc = doc.data();
          const incDate = parseDateSafe(inc.createdAt) || parseDateSafe(inc.date);
          if (incDate && incDate > recDate) inflowSince += Number(inc.amount || 0);
        });

        expSnap.forEach(doc => {
          const exp = doc.data();
          const expDate = parseDateSafe(exp.createdAt) || parseDateSafe(exp.date);
          if (expDate && expDate > recDate) outflowSince += Number(exp.amount || 0);
        });

        purchasesSnap.forEach(doc => {
          const p = doc.data();
          const pDate = parseDateSafe(p.createdAt) || parseDateSafe(p.date);
          if (pDate && pDate > recDate) outflowSince += Number(p.paidAmount || (p.paymentStatus === 'paid' ? p.totalAmount : 0));
        });

        cumulativeDrawerCash = baseAmount + inflowSince - outflowSince;
      }
    }
  } catch (e) {}

  const netTodayCash = todayCashSales + todayOfficeIncomes - todayExpenses - todayCashPurchases;
  const dateFormatted = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const msg = 
    `💰 <b>تقرير حركة الصندوق والدخل اليومي</b> 📊\n` +
    `📅 <i>${dateFormatted}</i>\n` +
    `────────────────────\n\n` +
    `💵 <b>صافي النقد المتوفر في الصندوق / القاصة:</b>\n` +
    `👉 <b>${Math.round(cumulativeDrawerCash).toLocaleString()} د.ع</b>\n\n` +
    `📋 <b>تفاصيل حركة اليوم:</b>\n` +
    `• 🟢 المقبوضات النقدية من المبيعات: <b>${todayCashSales.toLocaleString()} د.ع</b> (${todayInvoicesCount} فواتير)\n` +
    `• 🔵 سندات القبض والدخل الإضافي: <b>${todayOfficeIncomes.toLocaleString()} د.ع</b>\n` +
    `• 🔴 إجمالي مصاريف اليوم: <b>-${todayExpenses.toLocaleString()} د.ع</b>\n` +
    (todayCashPurchases > 0 ? `• 🚚 مدفوعات مشتريات نقدية: <b>-${todayCashPurchases.toLocaleString()} د.ع</b>\n` : '') +
    `• ✨ <b>صافي حركة كاش اليوم:</b> <b>${netTodayCash >= 0 ? `+${netTodayCash.toLocaleString()}` : `${netTodayCash.toLocaleString()}`} د.ع</b>\n\n` +
    `📦 <b>إجمالي قيمة مبيعات اليوم (نقدي + آجل):</b> <b>${todayTotalSales.toLocaleString()} د.ع</b>\n` +
    `📈 <b>إجمالي مبيعات الشهر الجاري:</b> <b>${monthTotalSales.toLocaleString()} د.ع</b>`;

  await sendMessage(chatId, msg);
}

/**
 * البحث عن فاتورة برقمها وطباعتها PDF
 */
async function handleSearchInvoiceByNumber(chatId, invoiceNum) {
  const salesSnap = await db.collection('sales').get();
  let matchedSale = null;

  for (const doc of salesSnap.docs) {
    const s = doc.data();
    const num = String(s.invoiceNumber || '').trim();
    if (num === String(invoiceNum) || num === `#${invoiceNum}` || doc.id === String(invoiceNum)) {
      matchedSale = { id: doc.id, ...s };
      break;
    }
  }

  if (!matchedSale) {
    return false;
  }

  await sendInvoiceSummaryAndPdf(chatId, matchedSale);
  return true;
}

/**
 * إرسال ملخص الفاتورة وملف الـ PDF المباشر لها
 */
async function sendInvoiceSummaryAndPdf(chatId, sale) {
  const total = Number(sale.total || 0);
  const paid = Number(sale.paidAmount || (sale.invoiceType === 'debt' ? 0 : total));
  const remaining = Math.max(0, total - paid);
  const discount = Number(sale.discount || 0);

  let dateStr = '---';
  try {
    const d = parseDateSafe(sale.createdAt) || new Date();
    dateStr = d.toLocaleDateString('ar-IQ');
  } catch (e) {}

  let msg = `🧾 <b>فاتورة رقم #${sale.invoiceNumber || sale.id}</b>\n` +
            `👤 العميل: <b>${escapeHTML(sale.customerName || 'عميل نقدي')}</b>\n` +
            (sale.phone1 || sale.customerPhone ? `📞 هاتف: <code>${sale.phone1 || sale.customerPhone}</code>\n` : '') +
            `📅 التاريخ: ${dateStr}\n` +
            `💳 النوع: ${sale.invoiceType === 'debt' ? '🔴 آجل (ديون)' : '🟢 نقدي'}\n` +
            `────────────────────\n\n` +
            `<b>الأصناف:</b>\n`;

  (sale.items || []).forEach((item, idx) => {
    const lineTotal = Number(item.lineTotal || (item.quantity * item.unitPrice) || 0);
    msg += `${idx + 1}. ${escapeHTML(item.name || item.productName)} (الكمية: ${item.quantity}) = <b>${lineTotal.toLocaleString()} د.ع</b>\n`;
  });

  msg += `\n────────────────────\n` +
         (discount > 0 ? `💰 المجموع قبل الخصم: ${Number(sale.subtotal || total + discount).toLocaleString()} د.ع\n` : '') +
         (discount > 0 ? `🎁 الخصم الممنوح: -${discount.toLocaleString()} د.ع\n` : '') +
         `💵 <b>الإجمالي النهائي: ${total.toLocaleString()} د.ع</b>\n` +
         `✅ الواصل: ${paid.toLocaleString()} د.ع\n` +
         `⚠️ <b>المتبقي: ${remaining.toLocaleString()} د.ع</b>`;

  await sendMessage(chatId, msg);

  // توليد وإرسال ملف PDF فوراً
  try {
    let storeInfo = {};
    try {
      const storeDoc = await db.collection('settings').doc('store_info').get();
      if (storeDoc.exists) storeInfo = storeDoc.data();
    } catch (e) {}

    const pdfBuffer = await generateInvoicePdfBuffer(sale, storeInfo);
    const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

    if (token) {
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', blob, `Invoice_${sale.invoiceNumber || sale.id}.pdf`);
      formData.append('caption', `📄 ملف الفاتورة PDF #${sale.invoiceNumber || sale.id}`);

      await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData
      });
    }
  } catch (err) {
    console.error('Failed to generate or send PDF:', err);
  }
}

/**
 * البحث في العملاء مع دعم البحث المباشر والـ Fuzzy logic
 */
async function handleCustomerSearch(chatId, query, sendNotFound = true) {
  const normInput = normalizeArabic(query);
  const cleanPhone = normalizePhone(query);

  const { customersList } = await getAllCustomersWithFinancials();

  // 1. Direct and substring matches
  let matchedCustomers = customersList.filter(c => {
    const cName = normalizeArabic(c.name);
    const p1 = normalizePhone(c.phone1);
    const p2 = normalizePhone(c.phone2);

    const isNameMatch = cName && normInput && (cName === normInput || cName.includes(normInput) || normInput.includes(cName));
    const isPhoneMatch = cleanPhone && ((p1 && p1.includes(cleanPhone)) || (p2 && p2.includes(cleanPhone)));

    return isNameMatch || isPhoneMatch;
  });

  // 2. If no direct match, use Fuzzy matching
  if (matchedCustomers.length === 0 && query.length >= 2) {
    const fuse = new Fuse(customersList, {
      keys: ['name', 'phone1', 'phone2'],
      threshold: 0.35
    });
    matchedCustomers = fuse.search(query).map(r => r.item);
  }

  if (matchedCustomers.length === 0) {
    if (sendNotFound) {
      await sendMessage(chatId, `❌ لم أتمكن من العثور على أي عميل يطابق «${escapeHTML(query)}».`);
    }
    return false;
  }

  if (matchedCustomers.length === 1) {
    await sendCustomerDetails(chatId, matchedCustomers[0]);
    return true;
  }

  let msg = `👥 وجدت عدة عملاء يطابقون «${escapeHTML(query)}»، يرجى اختيار العميل المطلوب:`;
  const buttons = matchedCustomers.slice(0, 6).map(c => [
    { 
      text: `👤 ${c.name} (${c.totalDebt > 0 ? `مطلوب: ${c.totalDebt.toLocaleString()} د.ع` : 'خالص'})`, 
      callback_data: `cd:${c.id}` 
    }
  ]);

  await sendInlineKeyboard(chatId, msg, buttons);
  return true;
}

/**
 * إرسال تفاصيل حساب عميل وفواتيره
 */
async function sendCustomerDetails(chatId, customer) {
  const debt = Number(customer.totalDebt || 0);
  const purchases = Number(customer.totalPurchases || 0);
  const customerSales = [...(customer.sales || [])];

  // Sort newest first
  customerSales.sort((a, b) => {
    const tA = parseDateSafe(a.createdAt)?.getTime() || 0;
    const tB = parseDateSafe(b.createdAt)?.getTime() || 0;
    return tB - tA;
  });

  let msg = `👤 <b>بيانات وحساب العميل</b>\n\n` +
            `الاسم: <b>${escapeHTML(customer.name)}</b>\n` +
            (customer.phone1 ? `📞 هاتف: <code>${customer.phone1}</code>\n` : '') +
            (customer.address ? `📍 العنوان: ${customer.address}\n` : '') +
            `────────────────────\n` +
            `💰 <b>إجمالي المشتريات:</b> ${purchases.toLocaleString()} د.ع\n` +
            `🔴 <b>المبلغ المتبقي المطلوب منه (الديون):</b>\n` +
            `👉 <b>${debt > 0 ? `${debt.toLocaleString()} د.ع ⚠️` : '0 د.ع (خالص الحساب ✅)'}</b>\n` +
            `عدد الفواتير: ${customerSales.length} فاتورة\n\n`;

  if (customerSales.length > 0) {
    msg += `<b>آخر الفواتير:</b>\n`;
    customerSales.slice(0, 3).forEach((s) => {
      msg += `• #${s.invoiceNumber || s.id} بمبلغ ${Number(s.total || 0).toLocaleString()} د.ع (${s.invoiceType === 'debt' ? 'آجل' : 'نقدي'})\n`;
    });
  }

  const buttons = [];
  if (customerSales.length > 0) {
    const latest = customerSales[0];
    buttons.push([{ text: `📄 طباعة أحدث فاتورة (#${latest.invoiceNumber || latest.id}) PDF`, callback_data: `invpdf:${latest.id}` }]);
    buttons.push([{ text: `🧾 استعراض كافة فواتير العميل (${customerSales.length})`, callback_data: `custinvs:${customer.id}` }]);
  }

  await sendInlineKeyboard(chatId, msg, buttons);
}

/**
 * معالجة استعلامات Callback Queries
 */
async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data; 
  const chatId = callbackQuery.message.chat.id;

  try {
    if (data === 'cmd_income') {
      await handleDailyIncome(chatId);
      return;
    }
    if (data === 'cmd_creditors') {
      await handleSuppliersDebts(chatId);
      return;
    }
    if (data === 'cmd_debtors') {
      await handleCustomerDebtsList(chatId, 0);
      return;
    }
    if (data.startsWith('debtors_page:')) {
      const page = parseInt(data.split(':')[1], 10);
      await handleCustomerDebtsList(chatId, page);
      return;
    }
    if (data === 'cmd_shortages') {
      const productsSnapshot = await db.collection('products').get();
      const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));
      await sendShortageReportCategories(chatId, products, 0);
      return;
    }

    if (data.startsWith('invpdf:')) {
      const saleId = data.split(':')[1];
      const saleDoc = await db.collection('sales').doc(saleId).get();
      if (saleDoc.exists) {
        await sendInvoiceSummaryAndPdf(chatId, { id: saleDoc.id, ...saleDoc.data() });
      } else {
        await sendMessage(chatId, '❌ تعذر العثور على الفاتورة.');
      }
      return;
    }

    // زر تفاصيل العميل الآمن (cd:id)
    if (data.startsWith('cd:')) {
      const custId = data.substring(3);
      const { idToCustomerMap, customersList } = await getAllCustomersWithFinancials();
      const customer = idToCustomerMap.get(custId) || customersList.find(c => c.id === custId);
      if (customer) {
        await sendCustomerDetails(chatId, customer);
      } else {
        await sendMessage(chatId, '❌ تعذر العثور على بيانات العميل.');
      }
      return;
    }

    // زر استعراض فواتير العميل الآمن (custinvs:id)
    if (data.startsWith('custinvs:')) {
      const custId = data.substring('custinvs:'.length);
      const { idToCustomerMap, customersList } = await getAllCustomersWithFinancials();
      const customer = idToCustomerMap.get(custId) || customersList.find(c => c.id === custId);

      if (!customer || !customer.sales || customer.sales.length === 0) {
        await sendMessage(chatId, `لا توجد فواتير مسجلة للعميل.`);
        return;
      }

      const customerSales = [...customer.sales];
      customerSales.sort((a, b) => (parseDateSafe(b.createdAt)?.getTime() || 0) - (parseDateSafe(a.createdAt)?.getTime() || 0));

      let msg = `🧾 <b>فواتير العميل: ${escapeHTML(customer.name)}</b>\nاختر أي فاتورة لتفاصيلها وتحميلها PDF:`;
      const buttons = customerSales.slice(0, 10).map(s => [
        { text: `📄 فاتورة #${s.invoiceNumber || s.id} - ${Number(s.total || 0).toLocaleString()} د.ع`, callback_data: `invpdf:${s.id}` }
      ]);

      await sendInlineKeyboard(chatId, msg, buttons);
      return;
    }

    if (data === 'dl_creditors_excel') {
      await sendCreditorsExcel(chatId);
      return;
    }

    if (data === 'dl_debtors_excel') {
      await sendDebtorsExcel(chatId);
      return;
    }

    // منتجات وأقسام
    const productsSnapshot = await db.collection('products').get();
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));

    if (data.startsWith('cat:')) {
      const parts = data.split(':');
      const catIndex = parseInt(parts[1], 10);
      const query = parts.slice(2).join(':');
      
      const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
      const category = uniqueCategories[catIndex];

      await performSearch(chatId, products, query, category, 0);
    }
    else if (data.startsWith('more:')) {
      const parts = data.split(':');
      const page = parseInt(parts[1], 10);
      const catIndex = parseInt(parts[2], 10);
      const query = parts.slice(3).join(':');
      
      let category = null;
      if (catIndex !== -1) {
        const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
        category = uniqueCategories[catIndex];
      }

      await performSearch(chatId, products, query, category, page);
    }
    else if (data.startsWith('prod:')) {
      const productId = data.split(':')[1];
      const doc = await db.collection('products').doc(productId).get();
      if (doc.exists) {
        await sendProductInfo(chatId, { id: doc.id, ...normalizeProduct(doc.data()) });
      }
    }
    else if (data.startsWith('shortcat:')) {
      const page = parseInt(data.split(':')[1], 10);
      await sendShortageReportCategories(chatId, products, page);
    }
    else if (data.startsWith('shortcatprod:')) {
      const parts = data.split(':');
      const catIndex = parseInt(parts[1], 10);
      const page = parseInt(parts[2], 10);
      await sendShortageProductsInCategory(chatId, products, catIndex, page);
    }
    else if (data === 'shortdl') {
      await sendExcelFile(chatId, products, false);
    }
    else if (data.startsWith('allcat:')) {
      const page = parseInt(data.split(':')[1], 10);
      await sendAllCategories(chatId, products, page);
    }
    else if (data.startsWith('allcatprod:')) {
      const parts = data.split(':');
      const catIndex = parseInt(parts[1], 10);
      const page = parseInt(parts[2], 10);
      await sendCategoryProductsAll(chatId, products, catIndex, page);
    }
    else if (data.startsWith('settime:')) {
      const parts = data.split(':');
      const hour = parseInt(parts[1], 10);
      const minute = parseInt(parts[2], 10);
      const isAm = parts[3] === 'am';
      
      let finalHour = hour;
      if (isAm) {
        finalHour = hour === 12 ? 0 : hour;
      } else {
        finalHour = hour === 12 ? 12 : hour + 12;
      }
      
      await db.collection('settings').doc('bot_config').set({ reportHour: finalHour, reportMinute: minute }, { merge: true });
      const amPmText = isAm ? 'صباحاً ☀️' : 'مساءً 🌙';
      const formattedMin = minute.toString().padStart(2, '0');
      await sendMessage(chatId, `✅ تم بنجاح تعيين موعد التقرير ليكون الساعة ${hour}:${formattedMin} ${amPmText} بتوقيت العراق.`);
    }
  } catch (e) {
    console.error('Callback error:', e);
  }
}

async function sendCreditorsExcel(chatId) {
  const { creditors } = await getSuppliersDebtsList();

  if (creditors.length === 0) {
    await sendMessage(chatId, 'لا توجد ديون موردين لتحميلها.');
    return;
  }

  const data = creditors.map(c => ({
    'اسم المورد': c.name,
    'رقم الهاتف': c.phone || '-',
    'المبلغ المتبقي المطلوب منا (د.ع)': c.remainingDebt,
    'إجمالي المشتريات (د.ع)': c.totalPurchases,
    'المبلغ المسدد (د.ع)': c.totalPaid,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(wb, ws, 'ديون الموردين');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', blob, 'Suppliers_Debts_Report.xlsx');
  formData.append('caption', '📊 تقرير ديون الموردين (الدائنون) مرفق إكسل.');

  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData });
}

async function sendDebtorsExcel(chatId) {
  const { customersList } = await getAllCustomersWithFinancials();
  const debtors = customersList.filter(c => c.totalDebt > 0);
  debtors.sort((a, b) => b.totalDebt - a.totalDebt);

  if (debtors.length === 0) {
    await sendMessage(chatId, 'لا توجد ديون عملاء لتحميلها.');
    return;
  }

  const data = debtors.map(c => ({
    'اسم العميل': c.name,
    'رقم الهاتف': c.phone1 || c.phone || '-',
    'المبلغ المتبقي بذمته (د.ع)': c.totalDebt,
    'إجمالي المشتريات (د.ع)': c.totalPurchases
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(wb, ws, 'ديون العملاء');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', blob, 'Customer_Debts_Report.xlsx');
  formData.append('caption', '📊 تقرير ديون العملاء (المدينون) مرفق إكسل.');

  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData });
}

async function handleScheduleTime(chatId, text, timeMatch) {
  const hourStr = timeMatch[1];
  const minuteStr = timeMatch[2];
  const hour = parseInt(hourStr, 10);
  
  let minute = 0;
  if (minuteStr) {
    minute = parseInt(minuteStr, 10);
  } else if (text.includes('ونص') || text.includes('ونصف')) {
    minute = 30;
  } else if (text.includes('وربع')) {
    minute = 15;
  }

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    await sendMessage(chatId, '❌ يرجى كتابة الساعة بشكل صحيح (مثال: 8 أو 8:30).');
    return;
  }

  const formattedMin = minute.toString().padStart(2, '0');

  if (text.includes('صباح') || text.includes('am')) {
     const finalHour = hour === 12 ? 0 : hour;
     await db.collection('settings').doc('bot_config').set({ reportHour: finalHour, reportMinute: minute }, { merge: true });
     await sendMessage(chatId, `✅ تم تعيين موعد التقرير اليومي ليكون الساعة ${hour}:${formattedMin} صباحاً ☀️ بتوقيت العراق.`);
  } 
  else if (text.includes('مساء') || text.includes('pm')) {
     const finalHour = hour === 12 ? 12 : hour + 12;
     await db.collection('settings').doc('bot_config').set({ reportHour: finalHour, reportMinute: minute }, { merge: true });
     await sendMessage(chatId, `✅ تم تعيين موعد التقرير اليومي ليكون الساعة ${hour}:${formattedMin} مساءً 🌙 بتوقيت العراق.`);
  }
  else {
     const buttons = [
       [{ text: '☀️ صباحاً', callback_data: `settime:${hour}:${minute}:am` }],
       [{ text: '🌙 مساءً', callback_data: `settime:${hour}:${minute}:pm` }]
     ];
     await sendInlineKeyboard(chatId, `هل تقصد الساعة ${hour}:${formattedMin} صباحاً أم مساءً؟`, buttons);
  }
}

async function sendAllCategories(chatId, products, page = 0) {
  const uniqueCategories = [...new Set(products.map(p => p.cameraType || 'أقسام أخرى'))];
  
  const pageSize = 6;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagedCats = uniqueCategories.slice(start, end);

  const globalCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];

  const buttons = pagedCats.map(cat => {
    const count = products.filter(p => (p.cameraType || 'أقسام أخرى') === cat).length;
    let catIndex = globalCategories.indexOf(cat);
    if (cat === 'أقسام أخرى') catIndex = -2;
    return [{ text: `📁 ${cat} (${count} منتج)`, callback_data: `allcatprod:${catIndex}:0` }];
  });

  if (uniqueCategories.length > end) {
    buttons.push([{ text: `⬇️ إظهار المزيد من الأقسام`, callback_data: `allcat:${page + 1}` }]);
  }

  const msg = page === 0 
    ? '📁 <b>جميع الأقسام</b>\nيرجى اختيار القسم لاستعراض منتجاته:'
    : `تابع الأقسام (صفحة ${page + 1}):`;

  await sendInlineKeyboard(chatId, msg, buttons);
}

async function sendCategoryProductsAll(chatId, products, catIndex, page = 0) {
  const globalCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
  const cat = catIndex === -2 ? 'أقسام أخرى' : globalCategories[catIndex];
  
  const categoryProducts = products.filter(p => (p.cameraType || 'أقسام أخرى') === cat);

  const pageSize = 6;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagedProducts = categoryProducts.slice(start, end);

  const buttons = pagedProducts.map(p => {
    const total = p.storeQty + p.warehouseQty;
    const limit = p.storeMinThreshold + p.warehouseMinThreshold;
    let statusIcon = '✅';
    if (total === 0) statusIcon = '❌';
    else if (total <= limit && limit > 0) statusIcon = '⚠️';
    
    return [{ text: `${statusIcon} ${p.name}`, callback_data: `prod:${p.id}` }];
  });

  if (categoryProducts.length > end) {
    buttons.push([{ text: `⬇️ إظهار المزيد من المنتجات`, callback_data: `allcatprod:${catIndex}:${page + 1}` }]);
  }
  buttons.push([{ text: `🔙 عودة للأقسام`, callback_data: `allcat:0` }]);

  const msg = page === 0 
    ? `📁 <b>منتجات قسم (${escapeHTML(cat)})</b>:\nاضغط على المنتج للتفاصيل:`
    : `تابع منتجات قسم (${escapeHTML(cat)}) (صفحة ${page + 1}):`;

  await sendInlineKeyboard(chatId, msg, buttons);
}

async function performSearch(chatId, products, query, categoryFilter, page = 0, sendNotFound = true) {
  let searchPool = products;
  if (categoryFilter) {
    searchPool = products.filter(p => p.cameraType === categoryFilter);
  }

  if (page === 0) {
    const exactMatches = searchPool.filter(p => p.name.toLowerCase() === query.toLowerCase());
    if (exactMatches.length === 1) {
      await sendProductInfo(chatId, exactMatches[0]);
      return true;
    }
  }

  const fuse = new Fuse(searchPool, {
    keys: ['name', 'barcode', 'sku'],
    threshold: 0.35,
  });
  const results = fuse.search(query).map(r => r.item);

  if (results.length === 0) {
    if (sendNotFound) {
      if (page === 0) {
        await sendMessage(chatId, `❌ لم أتمكن من العثور على أي منتج يطابق "${escapeHTML(query)}"${categoryFilter ? ` في قسم ${escapeHTML(categoryFilter)}.` : '.'}`);
      } else {
        await sendMessage(chatId, `❌ لا يوجد المزيد من النتائج.`);
      }
    }
    return false;
  }

  if (results.length === 1 && page === 0) {
    await sendMessage(chatId, `هل تقصد:\n🔹 <b>${escapeHTML(results[0].name)}</b> ؟`);
    await sendProductInfo(chatId, results[0]);
    return true;
  }

  if (!categoryFilter && page === 0) {
    const categoriesInResults = [...new Set(results.map(p => p.cameraType).filter(Boolean))];
    if (categoriesInResults.length > 1) {
      const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
      
      const buttons = categoriesInResults.map(cat => {
        const catIndex = uniqueCategories.indexOf(cat);
        const count = results.filter(p => p.cameraType === cat).length;
        let safeQuery = query.length > 30 ? query.substring(0, 30) : query;
        return [{ text: `📁 ${cat} (${count})`, callback_data: `cat:${catIndex}:${safeQuery}` }];
      });

      await sendInlineKeyboard(chatId, `وجدت نتائج بحث لـ "${escapeHTML(query)}" في عدة أقسام. يرجى تحديد القسم المطلوب:`, buttons);
      return true;
    }
  }

  const pageSize = 6;
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedResults = results.slice(startIndex, endIndex);

  let catIndexForMore = -1;
  if (categoryFilter) {
    const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
    catIndexForMore = uniqueCategories.indexOf(categoryFilter);
  }
  let safeQuery = query.length > 30 ? query.substring(0, 30) : query;

  await sendMultipleOptions(chatId, pagedResults, results.length > endIndex, page, catIndexForMore, safeQuery);
  return true;
}

async function sendShortageReportCategories(chatId, products, page = 0) {
  const shortages = products.filter(p => {
    const total = p.storeQty + p.warehouseQty;
    const limit = p.storeMinThreshold + p.warehouseMinThreshold;
    return total <= limit;
  });
  
  if (shortages.length === 0) {
    await sendMessage(chatId, '✅ المخزون في حالة ممتازة، لا توجد أي نواقص.');
    return;
  }

  const categoriesInShortages = [...new Set(shortages.map(p => p.cameraType || 'أقسام أخرى'))];
  const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];

  const pageSize = 6;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagedCats = categoriesInShortages.slice(start, end);

  const buttons = pagedCats.map(cat => {
    const count = shortages.filter(p => (p.cameraType || 'أقسام أخرى') === cat).length;
    let catIndex = globalCategoriesFind(uniqueCategories, cat);
    return [{ text: `📁 ${cat} (${count} نواقص)`, callback_data: `shortcatprod:${catIndex}:0` }];
  });

  function globalCategoriesFind(list, c) {
    const idx = list.indexOf(c);
    return idx !== -1 ? idx : -2;
  }

  if (categoriesInShortages.length > end) {
    buttons.push([{ text: `⬇️ إظهار المزيد من الأقسام`, callback_data: `shortcat:${page + 1}` }]);
  }
  
  if (page === 0) {
     buttons.unshift([{ text: `📄 تحميل ملف النواقص كاملاً (Excel)`, callback_data: `shortdl` }]);
  }

  const msg = page === 0 
    ? '📊 <b>تقرير النواقص الفوري</b> 📊\nيرجى اختيار القسم لعرض منتجاته:'
    : `تابع أقسام النواقص (صفحة ${page + 1}):`;

  await sendInlineKeyboard(chatId, msg, buttons);
}

async function sendShortageProductsInCategory(chatId, products, catIndex, page = 0) {
  const uniqueCategories = [...new Set(products.map(p => p.cameraType).filter(Boolean))];
  const cat = catIndex === -2 ? 'أقسام أخرى' : uniqueCategories[catIndex];
  
  const categoryShortages = products.filter(p => {
    const total = p.storeQty + p.warehouseQty;
    const limit = p.storeMinThreshold + p.warehouseMinThreshold;
    const isShort = total <= limit;
    const isCat = (p.cameraType || 'أقسام أخرى') === cat;
    return isShort && isCat;
  });

  const pageSize = 6;
  const start = page * pageSize;
  const end = start + pageSize;
  const pagedProducts = categoryShortages.slice(start, end);

  const buttons = pagedProducts.map(p => {
    const total = p.storeQty + p.warehouseQty;
    const statusIcon = total === 0 ? '❌' : '⚠️';
    return [{ text: `${statusIcon} ${p.name}`, callback_data: `prod:${p.id}` }];
  });

  if (categoryShortages.length > end) {
    buttons.push([{ text: `⬇️ إظهار المزيد من المنتجات`, callback_data: `shortcatprod:${catIndex}:${page + 1}` }]);
  }
  buttons.push([{ text: `🔙 عودة لأقسام النواقص`, callback_data: `shortcat:0` }]);

  const msg = page === 0 
    ? `📁 <b>نواقص قسم (${escapeHTML(cat)})</b>:\nاضغط على المنتج للتفاصيل:`
    : `تابع نواقص قسم (${escapeHTML(cat)}) (صفحة ${page + 1}):`;

  await sendInlineKeyboard(chatId, msg, buttons);
}

async function sendProductInfo(chatId, product) {
  const storeQty = product.storeQty;
  const warehouseQty = product.warehouseQty;
  const total = storeQty + warehouseQty;
  const limit = product.storeMinThreshold + product.warehouseMinThreshold;
  const wp = product.wholesalePrice || 0;
  const rp = product.retailPrice || 0;

  let status = '✅ متوفر';
  if (total === 0) status = '❌ نافذ';
  else if (total <= limit && limit > 0) status = '⚠️ منخفض المخزون';

  const msg = `📦 <b>${escapeHTML(product.name)}</b>\n` +
              `رقم الصنف: ${escapeHTML(product.sku) || '-'}\n` +
              `القسم: ${escapeHTML(product.cameraType) || '-'}\n\n` +
              `💰 سعر الجملة: ${Number(wp).toLocaleString()} د.ع\n` +
              `💵 سعر المفرد: ${Number(rp).toLocaleString()} د.ع\n\n` +
              `الحالة: ${status}\n` +
              `القطع في المحل: ${storeQty} (الحد: ${product.storeMinThreshold})\n` +
              `القطع في المخزن: ${warehouseQty} (الحد: ${product.warehouseMinThreshold})\n` +
              `الإجمالي: ${total}`;
              
  await sendMessage(chatId, msg);
}

async function sendMultipleOptions(chatId, products, hasMore, page, catIndex, query) {
  let msg = page === 0 
    ? 'وجدت عدة منتجات مشابهة، اضغط على المنتج المطلوب لمعرفة تفاصيله: 🤔\n' 
    : `صفحة النتائج رقم ${page + 1}: \n`;
    
  const buttons = products.map(p => {
    return [{ text: `📦 ${p.name}`, callback_data: `prod:${p.id}` }];
  });

  if (hasMore) {
    buttons.push([{ text: `⬇️ إظهار المزيد من النتائج`, callback_data: `more:${page + 1}:${catIndex}:${query}` }]);
  }

  await sendInlineKeyboard(chatId, msg, buttons);
}

async function sendExcelFile(chatId, products, isCron = false) {
  const shortages = products.filter(p => {
    const total = p.storeQty + p.warehouseQty;
    const limit = p.storeMinThreshold + p.warehouseMinThreshold;
    return total <= limit;
  });

  if (shortages.length === 0) {
    if (isCron) await sendMessage(chatId, '✅ المخزون في حالة ممتازة اليوم، لا توجد أي نواقص.');
    else await sendMessage(chatId, '✅ المخزون في حالة ممتازة، لا توجد أي نواقص لتحميلها.');
    return;
  }

  const groupedShortages = shortages.reduce((acc, p) => {
    const cat = p.cameraType || 'أقسام أخرى';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const wb = XLSX.utils.book_new();

  for (const [cat, items] of Object.entries(groupedShortages)) {
    const data = items.map(p => {
      const total = p.storeQty + p.warehouseQty;
      return {
        'اسم المنتج': p.name,
        'رقم الصنف (SKU)': p.sku || '-',
        'الحالة': total === 0 ? 'نافذ تماماً' : 'منخفض (تحت الحد)',
        'الكمية الحالية': total,
        'الكمية في المحل': p.storeQty,
        'الكمية في المخزن': p.warehouseQty,
        'الحد الأدنى للمحل': p.storeMinThreshold,
        'الحد الأدنى للمخزن': p.warehouseMinThreshold,
        'سعر الجملة (د.ع)': p.wholesalePrice || 0,
        'سعر المفرد (د.ع)': p.retailPrice || 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!dir'] = 'rtl';

    let safeCatName = cat.replace(/[\[\]\*\?\/\\:]/g, '').substring(0, 31);
    if (!safeCatName) safeCatName = 'Sheet';
    if (wb.SheetNames.includes(safeCatName)) {
      safeCatName = safeCatName.substring(0, 28) + ' ' + Math.floor(Math.random()*10);
    }

    XLSX.utils.book_append_sheet(wb, ws, safeCatName);
  }
  
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', blob, 'Shortages_Report.xlsx');
  
  if (isCron) {
    formData.append('caption', '📊 التقرير اليومي للنواقص مرفق كملف إكسل.');
  } else {
    formData.append('caption', '📄 تفضل ملف النواقص بالكامل.');
  }

  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: formData
  });
}

async function sendMessage(chatId, text) {
  const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const maxLength = 4000;
  for (let i = 0; i < text.length; i += maxLength) {
    const chunk = text.substring(i, i + maxLength);
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML'
      })
    });
  }
}

async function sendInlineKeyboard(chatId, text, inlineKeyboard) {
  const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    })
  });
}
