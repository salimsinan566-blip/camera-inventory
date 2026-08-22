import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function parseDateSafe(val) {
  if (!val) return new Date();
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val?._seconds === 'number') return new Date(val._seconds * 1000);
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

// Fallback ASCII cleaner so pdf-lib Helvetica never throws WinAnsi encode error
function safeText(str, fallback = '---') {
  if (!str) return fallback;
  return String(str).replace(/[^\x00-\x7F]/g, '?');
}

async function generateDocumentPdfBuffer(docObj, storeInfo = {}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const isOffer = Boolean(docObj.isOffer);

  // 1. Header Banner
  page.drawRectangle({
    x: 30,
    y: height - 105,
    width: width - 60,
    height: 75,
    color: isOffer ? rgb(0.78, 0.45, 0.1) : rgb(0.12, 0.23, 0.54),
  });

  const storeName = safeText(storeInfo.storeName || 'SAFE ZONE');
  page.drawText(storeName.toUpperCase(), {
    x: 45,
    y: height - 60,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const titlePrefix = isOffer ? 'PRICE QUOTATION' : 'INVOICE';
  const docNumber = safeText(docObj.invoiceNumber || docObj.offerNumber || docObj.id || '1001');
  page.drawText(`${titlePrefix} #${docNumber}`, {
    x: 45,
    y: height - 85,
    size: 12,
    font: fontRegular,
    color: rgb(0.9, 0.95, 1),
  });

  let dateStr = '---';
  try {
    const rawDate = parseDateSafe(docObj.createdAt);
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

  const paymentTypeLabel = isOffer 
    ? 'QUOTATION / OFFER' 
    : (docObj.invoiceType === 'debt' 
        ? 'DEBT / CREDIT' 
        : (docObj.invoiceType === 'card' ? 'MASTERCARD / CARD' : 'CASH'));

  page.drawText(`Type: ${paymentTypeLabel}`, {
    x: width - 200,
    y: height - 80,
    size: 10,
    font: fontRegular,
    color: rgb(0.9, 0.95, 1),
  });

  // 2. Customer Info Card
  page.drawRectangle({
    x: 30,
    y: height - 165,
    width: width - 60,
    height: 50,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.93),
    borderWidth: 1,
  });

  page.drawText(`Client / Customer: ${safeText(docObj.customerName, 'General Customer')}`, {
    x: 45,
    y: height - 138,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  const custPhone = safeText(docObj.customerPhone || docObj.phone1 || docObj.phone || '');
  if (custPhone) {
    page.drawText(`Phone: ${custPhone}`, {
      x: 45,
      y: height - 154,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45),
    });
  }

  // 3. Table Header
  const tableTop = height - 190;
  page.drawRectangle({
    x: 30,
    y: tableTop - 25,
    width: width - 60,
    height: 25,
    color: rgb(0.9, 0.93, 0.98),
  });

  page.drawText('#', { x: 40, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Item Description', { x: 70, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Qty', { x: 330, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Unit Price (IQD)', { x: 390, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText('Total (IQD)', { x: 490, y: tableTop - 18, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) });

  // 4. Table Items
  let currentY = tableTop - 45;
  const items = docObj.items || [];

  items.slice(0, 22).forEach((item, index) => {
    const lineTotal = Number(item.lineTotal || ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)));
    const itemName = safeText((item.name || item.productName || 'Product Item')).substring(0, 42);

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

  // 5. Summary Box
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

  const subtotal = Number(docObj.subtotal || docObj.total || 0);
  const discount = Number(docObj.discount || 0);
  const total = Number(docObj.total || (subtotal - discount));
  const paid = Number(docObj.paidAmount || (isOffer ? 0 : (docObj.invoiceType === 'debt' ? 0 : total)));
  const remaining = isOffer ? 0 : Math.max(0, total - paid);

  let sY = summaryTop - 20;
  page.drawText('Subtotal:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(`${subtotal.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

  sY -= 20;
  if (discount > 0) {
    page.drawText('Discount:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.8, 0.2, 0.2) });
    page.drawText(`-${discount.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: rgb(0.8, 0.2, 0.2) });
    sY -= 20;
  }

  page.drawText('Total Amount:', { x: boxX + 15, y: sY, size: 10.5, font: fontBold, color: isOffer ? rgb(0.78, 0.45, 0.1) : rgb(0.1, 0.15, 0.4) });
  page.drawText(`${total.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 10.5, font: fontBold, color: isOffer ? rgb(0.78, 0.45, 0.1) : rgb(0.1, 0.15, 0.4) });

  if (!isOffer) {
    sY -= 20;
    page.drawText('Paid Amount:', { x: boxX + 15, y: sY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.5, 0.2) });
    page.drawText(`${paid.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

    sY -= 20;
    page.drawText('Remaining Debt:', { x: boxX + 15, y: sY, size: 9.5, font: fontBold, color: remaining > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.2, 0.6, 0.2) });
    page.drawText(`${remaining.toLocaleString()} IQD`, { x: boxX + 120, y: sY, size: 9.5, font: fontBold, color: remaining > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.2, 0.6, 0.2) });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { chatId, doc: docObj, pdfBase64, filename: customFilename, storeInfo = {} } = req.body || {};

  // Retrieve Bot Token & Target Chat ID from payload or environment
  const token = (storeInfo.telegramBotToken || '').trim() ||
                process.env.VITE_TELEGRAM_BOT_TOKEN ||
                process.env.TELEGRAM_BOT_TOKEN;

  const targetChatId = chatId ||
                       (storeInfo.telegramChatId || '').trim() ||
                       process.env.VITE_TELEGRAM_CHAT_ID ||
                       process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    return res.status(400).json({ error: 'توكن البوت (Bot Token) غير متوفر في الإعدادات' });
  }

  if (!targetChatId) {
    return res.status(400).json({ error: 'معرف المحادثة (Chat ID) غير متوفر. تأكد من فتح التطبيق عبر التليجرام أو تعيينه في الإعدادات.' });
  }

  try {
    let pdfBuffer;
    let filename = customFilename;
    const isOffer = Boolean(docObj?.isOffer);
    const docNumber = docObj?.invoiceNumber || docObj?.offerNumber || docObj?.id || '1001';

    if (pdfBase64) {
      // 1. High Quality Arabic PDF sent from Client
      const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      pdfBuffer = Buffer.from(base64Data, 'base64');
      if (!filename) {
        filename = isOffer ? `Quotation_${docNumber}.pdf` : `Invoice_${docNumber}.pdf`;
      }
    } else if (docObj) {
      // 2. Server-side generated PDF
      pdfBuffer = await generateDocumentPdfBuffer(docObj, storeInfo);
      if (!filename) {
        filename = isOffer ? `Quotation_${docNumber}.pdf` : `Invoice_${docNumber}.pdf`;
      }
    } else {
      return res.status(400).json({ error: 'يرجى تزويد بيانات المستند doc أو ملف pdfBase64' });
    }

    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('chat_id', String(targetChatId));
    formData.append('document', blob, filename);

    const paymentArabic = docObj.invoiceType === 'debt' 
      ? 'آجل / دين 🔴' 
      : (docObj.invoiceType === 'card' ? 'ماستر كارد / دفع إلكتروني 💳' : 'نقداً 💵');

    const caption = docObj ? (isOffer 
      ? `📑 <b>عرض سعر رسمي #${docNumber}</b>\n👤 العميل: <b>${docObj.customerName || 'عام'}</b>\n💰 الإجمالي: <b>${Number(docObj.total || 0).toLocaleString()} د.ع</b>`
      : `🧾 <b>فاتورة بيع رسمية #${docNumber}</b>\n👤 العميل: <b>${docObj.customerName || 'عام'}</b>\n💰 الإجمالي: <b>${Number(docObj.total || 0).toLocaleString()} د.ع</b>\n💳 طريقة الدفع: <b>${paymentArabic}</b>`
    ) : `📄 مستند رسمي من Safe Zone`;

    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const tgData = await tgRes.json().catch(() => ({}));

    if (!tgRes.ok || !tgData.ok) {
      console.error('Telegram API error:', tgData);
      return res.status(500).json({ error: tgData.description || 'فشل إرسال المستند عبر تليجرام' });
    }

    return res.status(200).json({ success: true, messageId: tgData.result?.message_id });
  } catch (error) {
    console.error('Error sending Telegram PDF:', error);
    return res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة الطلب' });
  }
}
