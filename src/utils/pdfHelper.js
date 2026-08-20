import html2pdf from 'html2pdf.js';
import { getStockStatus, STOCK_STATUS } from '../models/product';

export async function generateAndSendShortagesPDF(products, toast) {
  const shortages = products.filter(
    (p) => getStockStatus(p) === STOCK_STATUS.LOW_STOCK || getStockStatus(p) === STOCK_STATUS.OUT_OF_STOCK
  );

  if (shortages.length === 0) {
    toast('لا توجد نواقص لإرسالها.', 'success');
    return;
  }

  // Group by category
  const categories = {};
  shortages.forEach(p => {
    const cat = p.cameraType || 'أقسام أخرى';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });

  // Create an offscreen overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.left = '-99999px';
  overlay.style.top = '0';
  overlay.style.width = '800px';
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '-9999';
  overlay.style.overflow = 'hidden';
  overlay.dir = 'rtl';

  // Add a nice loading message
  const loadingMsg = document.createElement('div');
  loadingMsg.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <svg class="animate-spin" style="width: 40px; height: 40px; color: #4f46e5; margin: 0 auto 10px auto;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <h2 style="color: #4f46e5; font-size: 24px; font-weight: bold; font-family: sans-serif;">جاري تجهيز تقرير النواقص...</h2>
      <p style="color: #6366f1; font-family: sans-serif;">يرجى الانتظار، سيتم الإرسال للتليجرام قريباً.</p>
    </div>
  `;
  overlay.appendChild(loadingMsg);

  // Create the actual PDF container
  const container = document.createElement('div');
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
  container.dir = 'rtl';

  let htmlContent = '';
  const catKeys = Object.keys(categories);

  catKeys.forEach((cat, index) => {
    const catProducts = categories[cat];
    const pageBreak = index > 0 ? '<div class="html2pdf__page-break"></div>' : '';

    htmlContent += `
      ${pageBreak}
      <div style="padding: 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background-color: #ffffff; min-height: 1000px;">
        
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1e1b4b; margin: 0; font-size: 28px;">تقرير النواقص</h1>
          <p style="color: #6b7280; margin-top: 5px; font-size: 16px;">التاريخ: ${new Date().toLocaleDateString('ar-IQ')} | الوقت: ${new Date().toLocaleTimeString('ar-IQ')}</p>
        </div>

        <div style="background-color: #4f46e5; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; font-size: 20px; font-weight: bold;">
          قسم: ${cat}
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 12px; border: 1px solid #e5e7eb; color: #334155; font-weight: bold; font-size: 16px; width: 60%;">اسم المنتج</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb; color: #334155; font-weight: bold; font-size: 16px; text-align: center; width: 20%;">بالمحل</th>
              <th style="padding: 12px; border: 1px solid #e5e7eb; color: #334155; font-weight: bold; font-size: 16px; text-align: center; width: 20%;">بالمخزن</th>
            </tr>
          </thead>
          <tbody>
            ${catProducts.map((p, i) => `
              <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                <td style="padding: 12px; border: 1px solid #e5e7eb; color: #0f172a; font-weight: 500; font-size: 15px;">${p.name || '-'}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${p.storeQty <= 0 ? '#ef4444' : '#10b981'}; font-size: 16px;">${p.storeQty}</td>
                <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${p.warehouseQty <= 0 ? '#ef4444' : '#10b981'}; font-size: 16px;">${p.warehouseQty}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
          تم توليد هذا التقرير تلقائياً بواسطة نظام إدارة المخزون الذكي - Safe Zone
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlContent;
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Scroll overlay to top to ensure html2canvas starts from the top
  overlay.scrollTop = 0;

  // Wait a short moment to ensure browser paints the DOM
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    const opt = {
      margin:       0,
      filename:     'shortages.pdf',
      image:        { type: 'jpeg', quality: 0.7 }, // تقليل الجودة لتقليل الحجم
      html2canvas:  { scale: 1.5, useCORS: true, logging: true, scrollY: 0, windowWidth: 800 }, // تقليل الدقة قليلاً
      jsPDF:        { unit: 'px', format: [800, 1131], orientation: 'portrait' }, // Match 800px width with A4 ratio
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    
    const reader = new FileReader();
    reader.readAsDataURL(pdfBlob);
    
    await new Promise((resolve, reject) => {
      reader.onloadend = async () => {
        try {
          const base64data = reader.result;
          
          loadingMsg.innerHTML = '<h2 style="color: #10b981; font-size: 24px; font-weight: bold; font-family: sans-serif; text-align: center;">جاري الإرسال للتليجرام...</h2>';

          const response = await fetch('/api/send-pdf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pdfBase64: base64data,
              filename: 'تقرير_النواقص.pdf'
            })
          });

          if (!response.ok) throw new Error('فشل في إرسال الملف إلى التليجرام');
          
          toast('تم إرسال ملف الـ PDF إلى التليجرام بنجاح! 🚀', 'success');
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
    });

  } catch (error) {
    console.error('PDF Generation Error:', error);
    toast('حدث خطأ أثناء توليد أو إرسال الـ PDF', 'error');
  } finally {
    document.body.removeChild(overlay);
  }
}

/**
 * Format timestamp / Date cleanly for invoice
 */
function formatInvoiceDate(dateVal) {
  if (!dateVal) return new Date().toLocaleDateString('ar-IQ');
  if (dateVal.toDate && typeof dateVal.toDate === 'function') {
    return dateVal.toDate().toLocaleDateString('ar-IQ');
  }
  return new Date(dateVal).toLocaleDateString('ar-IQ');
}

/**
 * Generate Ultra High-Quality Arabic Invoice PDF Blob
 */
export async function generateInvoicePdfBlob(sale, settings) {
  const storeName = (!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName;
  const address = settings?.address || 'العراق - بغداد';
  const logoUrl = settings?.logoUrl;
  const invoiceNumber = sale.invoiceNumber || sale.offerNumber || sale.id;
  const customerName = sale.customerName || 'زبون عام';
  const dateLabel = formatInvoiceDate(sale.createdAt || new Date());
  const isOffer = Boolean(sale.isOffer);
  const isDebt = sale.invoiceType === 'debt';
  const totalAmount = Number(sale.total || 0);
  const paidAmount = Number(sale.paidAmount || (isDebt ? 0 : totalAmount));
  const remainingDebt = sale.remainingDebt !== undefined
    ? Math.min(Number(sale.remainingDebt), Math.max(0, totalAmount - paidAmount))
    : Math.max(0, totalAmount - paidAmount);

  const items = sale.items || [];

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '800px';
  overlay.style.height = 'auto';
  overlay.style.opacity = '0.005';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '-99999';
  overlay.style.overflow = 'hidden';
  overlay.dir = 'rtl';

  const container = document.createElement('div');
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.padding = '35px 30px';
  container.style.boxSizing = 'border-box';
  container.dir = 'rtl';

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700;900&display=swap');
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        letter-spacing: 0px !important;
        word-spacing: normal !important;
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
        text-rendering: optimizeLegibility !important;
      }
      body, div, p, span, h1, h2, h3, h4, table, th, td, strong, em {
        font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif !important;
        letter-spacing: 0px !important;
      }
      table {
        border-collapse: collapse !important;
        width: 100%;
      }
      th, td {
        font-feature-settings: "liga" 1, "dlig" 1, "calt" 1 !important;
      }
    </style>

    <!-- Header Section -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #C89B3C; padding-bottom: 15px; margin-bottom: 20px;">
      <div style="text-align: right;">
        <h1 style="font-size: 26px; font-weight: 900; color: #0f172a; margin-bottom: 4px;">${storeName}</h1>
        ${address ? `<p style="font-size: 13px; color: #64748b; font-weight: bold;">📍 ${address}</p>` : ''}
      </div>

      <div style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
        ${logoUrl ? `
          <img src="${logoUrl}" alt="Logo" style="height: 60px; max-width: 180px; object-fit: contain;" crossOrigin="anonymous" />
        ` : `
          <div style="font-size: 20px; font-weight: 900; color: #C89B3C; font-family: monospace;">SAFE ZONE</div>
        `}
        <span style="background: #fdf8ed; color: #92400e; border: 1px solid #fde68a; padding: 4px 14px; border-radius: 9999px; font-size: 12px; font-weight: 900;">
          ${isOffer ? 'عرض سعر (Quotation)' : 'فاتورة مبيعات رسمية'}
        </span>
      </div>
    </div>

    <!-- Customer & Invoice Info Grid -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 18px; margin-bottom: 20px;">
      <div style="text-align: right;">
        <span style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">فاتورة إلى:</span>
        <h2 style="font-size: 18px; font-weight: 900; color: #0f172a;">${customerName}</h2>
      </div>

      <div style="text-align: left;">
        <table style="font-size: 12px; text-align: right; width: auto;">
          <tbody>
            <tr>
              <td style="padding: 2px 8px; color: #64748b; font-weight: bold;">${isOffer ? 'رقم العرض:' : 'رقم الفاتورة:'}</td>
              <td style="padding: 2px 8px; font-weight: 900; color: #0f172a; font-family: monospace;">${invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 2px 8px; color: #64748b; font-weight: bold;">تاريخ الإصدار:</td>
              <td style="padding: 2px 8px; font-weight: bold; color: #0f172a;">${dateLabel}</td>
            </tr>
            ${isDebt && !isOffer ? `
            <tr>
              <td style="padding: 2px 8px; color: #64748b; font-weight: bold;">نوع الدفع:</td>
              <td style="padding: 2px 8px; font-weight: 900; color: #d97706;">آجل (دين)</td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Items Table -->
    <table style="border: 1px solid #e2e8f0; margin-bottom: 20px; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #f1f5f9; color: #334155; font-size: 13px; font-weight: 900; text-align: right; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 10px 12px; width: 48%;">الوصف / المنتج</th>
          <th style="padding: 10px 12px; text-align: center; width: 14%;">الكمية</th>
          <th style="padding: 10px 12px; text-align: right; width: 18%;">السعر المفرد</th>
          <th style="padding: 10px 12px; text-align: left; width: 20%;">المجموع</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, idx) => `
          <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
            <td style="padding: 10px 12px; font-weight: bold; color: #1e293b;">
              ${item.isService ? '<span style="font-size: 10px; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">خدمة</span>' : ''}
              ${item.name || 'منتج'}
            </td>
            <td style="padding: 10px 12px; text-align: center; font-weight: 900; color: #0f172a; font-family: monospace;">
              ${item.quantity || 1}
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #334155; font-family: monospace;">
              ${Number(item.unitPrice || 0).toLocaleString()}
            </td>
            <td style="padding: 10px 12px; text-align: left; font-weight: 900; color: #0f172a; font-family: monospace;">
              ${(Number(item.lineTotal) || (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toLocaleString()} د.ع
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Totals Summary & Debt Box -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 25px;">
      <div style="width: 320px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="padding: 12px 16px; font-size: 13px;">
          ${sale.discount > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #64748b; font-weight: bold;">
              <span>المجموع قبل الخصم:</span>
              <span style="font-family: monospace;">${Number((sale.subtotal || totalAmount + Number(sale.discount))).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #ef4444; font-weight: 900;">
              <span>الخصم:</span>
              <span style="font-family: monospace;">-${Number(sale.discount).toLocaleString()}</span>
            </div>
          ` : ''}

          ${isDebt ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #15803d; font-weight: 900;">
              <span>المبلغ المدفوع:</span>
              <span style="font-family: monospace;">${paidAmount.toLocaleString()} د.ع</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #b91c1c; font-weight: 900;">
              <span>المتبقي (الدين):</span>
              <span style="font-family: monospace;">${remainingDebt.toLocaleString()} د.ع</span>
            </div>
          ` : ''}
        </div>

        <div style="background: #C89B3C; color: #ffffff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 14px; font-weight: 900;">${isDebt ? 'إجمالي الفاتورة' : 'المبلغ المستحق'}</span>
          <span style="font-size: 18px; font-weight: 900; font-family: monospace;">${totalAmount.toLocaleString()} د.ع</span>
        </div>
      </div>
    </div>

    <!-- Notes & Terms -->
    ${settings?.description ? `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #64748b; margin-bottom: 20px;">
        <strong style="color: #334155; display: block; margin-bottom: 2px;">ملاحظات هامة:</strong>
        ${settings.description}
      </div>
    ` : ''}

    <!-- Footer -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8;">
      <div style="text-align: right;">
        <span style="font-weight: bold; color: #64748b;">${storeName}</span> | تم استخراج الفاتورة إلكترونياً
      </div>
      <div>
        ${settings?.qrCodeUrl ? `
          <img src="${settings.qrCodeUrl}" alt="QR" style="width: 40px; height: 40px; border: 1px solid #e2e8f0; border-radius: 4px;" crossOrigin="anonymous" />
        ` : `
          <span style="font-family: monospace; font-weight: bold; color: #C89B3C;">SAFE ZONE</span>
        `}
      </div>
    </div>
  `;

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {}
  }
  await new Promise((resolve) => setTimeout(resolve, 350));

  try {
    const opt = {
      margin: 0,
      filename: `فاتورة_${invoiceNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2.8, 
        useCORS: true, 
        logging: false, 
        scrollY: 0, 
        windowWidth: 800,
        letterRendering: false,
        allowTaint: true
      },
      jsPDF: { unit: 'px', format: [800, 1131], orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    return pdfBlob;
  } finally {
    document.body.removeChild(overlay);
  }
}
