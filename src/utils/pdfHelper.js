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

  try {
    const opt = {
      margin: 10,
      filename: `تقرير_النواقص_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    const formData = new FormData();
    formData.append('document', pdfBlob, `تقرير_النواقص_${new Date().toISOString().split('T')[0]}.pdf`);
    formData.append('caption', `📦 تقرير النواقص بتاريخ ${new Date().toLocaleDateString('ar-IQ')}`);

    const response = await fetch('/api/send-pdf', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      toast('تم إرسال تقرير النواقص كملف PDF إلى تليجرام بنجاح! 🚀', 'success');
    } else {
      throw new Error(result.error || 'فشل الإرسال');
    }
  } catch (error) {
    console.error('Error generating/sending shortages PDF:', error);
    toast(`حدث خطأ أثناء الإرسال: ${error.message}`, 'error');
  } finally {
    document.body.removeChild(overlay);
  }
}

function formatInvoiceDate(dateVal) {
  if (!dateVal) return new Date().toLocaleDateString('ar-IQ');
  if (typeof dateVal?.toDate === 'function') {
    return dateVal.toDate().toLocaleDateString('ar-IQ');
  }
  return new Date(dateVal).toLocaleDateString('ar-IQ');
}

/**
 * Generate 100% Identical Official System Invoice / Quotation PDF Blob
 * Matches src/components/InvoiceReceipt.jsx pixel-perfect
 */
export async function generateInvoicePdfBlob(sale, settings) {
  const storeName = (!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName;
  const address = settings?.address || 'العراق - بغداد';
  const logoUrl = settings?.logoUrl;
  const qrCodeUrl = settings?.qrCodeUrl;
  const invoiceNumber = sale.invoiceNumber || sale.offerNumber || sale.id || '1001';
  const customerName = sale.customerName || 'زبون عام';
  const dateLabel = formatInvoiceDate(sale.createdAt || new Date());
  const isOffer = Boolean(sale.isOffer);
  const isDebt = sale.invoiceType === 'debt';
  const isCard = sale.invoiceType === 'card';
  const cashier = sale.cashierEmail || sale.cashier || 'المدير';
  const cashierDisplayName = cashier.split('@')[0];

  const totalAmount = Number(sale.total || 0);
  const discountAmount = Number(sale.discount || 0);
  const subtotalAmount = Number(sale.subtotal || (totalAmount + discountAmount));
  const paidAmount = Number(sale.paidAmount || (isDebt ? 0 : totalAmount));
  const remainingDebt = sale.remainingDebt !== undefined
    ? Math.min(Number(sale.remainingDebt), Math.max(0, totalAmount - paidAmount))
    : Math.max(0, totalAmount - paidAmount);

  const paymentLabel = isOffer 
    ? 'عرض سعر' 
    : (isDebt ? 'آجل (دين)' : (isCard ? 'ماستر كارد / إلكتروني' : 'نقداً'));

  const items = sale.items || [];

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '794px';
  overlay.style.height = 'auto';
  overlay.style.opacity = '0.005';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '-99999';
  overlay.style.overflow = 'hidden';
  overlay.dir = 'rtl';

  const container = document.createElement('div');
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.padding = '35px 30px';
  container.style.boxSizing = 'border-box';
  container.style.position = 'relative';
  container.dir = 'rtl';

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap');
      * {
        box-sizing: border-box !important;
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

    <!-- Watermark Logo in Background -->
    ${logoUrl ? `
      <img 
        src="${logoUrl}" 
        alt="" 
        style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 75%; max-width: 550px; opacity: 0.18; filter: grayscale(100%); pointer-events: none; z-index: 0;" 
        crossOrigin="anonymous" 
      />
    ` : ''}

    <div style="position: relative; z-index: 1; min-height: 1000px; display: flex; flex-direction: column; justify-content: space-between;">
      
      <!-- Top Section -->
      <div>
        <!-- Official Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C89B3C; padding-bottom: 12px; margin-bottom: 16px;">
          <!-- Store Info (Right) -->
          <div style="text-align: right;">
            <h1 style="font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 4px;">
              ${(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}
            </h1>
            ${address ? `
              <p style="font-size: 13px; color: #64748b; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span style="color: #C89B3C;">📍</span> ${address}
              </p>
            ` : ''}
          </div>

          <!-- Logo & Badge (Left) -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
            ${logoUrl ? `
              <img src="${logoUrl}" alt="الشعار" style="height: 85px; max-width: 260px; object-fit: contain;" crossOrigin="anonymous" />
            ` : `
              <div style="height: 60px; width: 140px; border: 2px dashed #cbd5e1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: #C89B3C; font-family: monospace;">SAFE ZONE</div>
            `}
            ${isOffer ? `
              <span style="font-size: 13px; font-weight: 900; color: #78350f; background: #fef3c7; border: 1px solid #fde68a; padding: 4px 18px; border-radius: 9999px; text-transform: uppercase;">
                عرض سعر (Quotation)
              </span>
            ` : isDraft ? `
              <span style="font-size: 11px; font-weight: 900; color: #a16207; background: #fefce8; border: 1px solid #fef08a; padding: 3px 12px; border-radius: 9999px;">
                فاتورة غير مؤكدة
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Customer & Invoice Info Grid -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px;">
          <!-- Customer (Right) -->
          <div style="text-align: right;">
            <span style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 2px;">فاتورة إلى</span>
            <h2 style="font-size: 20px; font-weight: 900; color: #1e293b;">${customerName}</h2>
          </div>

          <!-- Invoice Details Table (Left) -->
          <div style="text-align: right;">
            <table style="font-size: 12px; width: auto;">
              <tbody>
                <tr>
                  <td style="padding: 2px 10px; color: #64748b; font-weight: bold;">${isOffer ? 'رقم العرض:' : 'رقم الفاتورة:'}</td>
                  <td style="padding: 2px 4px; font-weight: 900; color: #0f172a; font-family: monospace;">#${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 10px; color: #64748b; font-weight: bold;">تاريخ الإصدار:</td>
                  <td style="padding: 2px 4px; font-weight: bold; color: #0f172a;">${dateLabel}</td>
                </tr>
                ${isDebt && !isOffer ? `
                  <tr>
                    <td style="padding: 2px 10px; color: #64748b; font-weight: bold;">نوع الدفع:</td>
                    <td style="padding: 2px 4px; font-weight: 900; color: #dc2626;">آجل (دين)</td>
                  </tr>
                ` : ''}
                <tr>
                  <td style="padding: 2px 10px; color: #64748b; font-weight: bold;">البائع:</td>
                  <td style="padding: 2px 4px; font-weight: bold; color: #0f172a;">${cashierDisplayName}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f2f2f2; color: #334155; font-size: 13px; font-weight: 900; text-transform: uppercase;">
              <th style="padding: 10px 12px; text-align: right; width: 50%;">الوصف</th>
              <th style="padding: 10px 12px; text-align: center; width: 14%;">الكمية</th>
              <th style="padding: 10px 12px; text-align: right; width: 18%;">السعر</th>
              <th style="padding: 10px 12px; text-align: left; width: 18%;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => {
              const lineTotal = Number(item.lineTotal || ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0)));
              return `
                <tr style="border-bottom: 2px solid #e2e8f0; font-size: 13px;">
                  <td style="padding: 10px 12px; font-weight: bold; color: #1e293b; text-align: right;">
                    ${item.isService ? '<span style="font-size: 10px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: normal;">أجور/خدمة</span>' : ''}
                    ${item.name || 'منتج'}
                  </td>
                  <td style="padding: 10px 12px; text-align: center; font-weight: 900; color: #1e293b; font-family: monospace;">
                    ${item.quantity || 1}
                    ${!item.isService && item.sellMode && item.sellMode !== 'unit' ? `
                      <span style="font-size: 10px; color: #64748b; margin-right: 4px; font-weight: normal;">
                        (${item.sellMode === 'meter' ? 'متر' : 'لفة'})
                      </span>
                    ` : ''}
                  </td>
                  <td style="padding: 10px 12px; text-align: right; color: #1e293b; font-family: monospace; font-weight: bold;">
                    ${item.originalPrice && item.originalPrice > item.unitPrice ? `
                      <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span style="font-size: 10px; color: #94a3b8; text-decoration: line-through; line-height: 1;">${Number(item.originalPrice).toLocaleString()}</span>
                        <span style="color: #dc2626; font-weight: bold; line-height: 1; margin-top: 2px;">${Number(item.unitPrice || 0).toLocaleString()}</span>
                      </div>
                    ` : Number(item.unitPrice || 0).toLocaleString()}
                  </td>
                  <td style="padding: 10px 12px; text-align: left; font-weight: 900; color: #1e293b; font-family: monospace;">
                    ${lineTotal.toLocaleString()}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Section: Totals & Footer -->
      <div style="margin-top: auto; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; padding-top: 8px;">
          <!-- QR Code (Right) -->
          <div style="width: 100px; height: 100px; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: #ffffff; padding: 4px;">
            ${qrCodeUrl ? `
              <img src="${qrCodeUrl}" alt="QR" style="width: 100%; height: 100%; object-fit: contain;" crossOrigin="anonymous" />
            ` : `
              <span style="font-size: 11px; color: #94a3b8; font-weight: bold;">QR CODE</span>
            `}
          </div>

          <!-- Totals Box (Left) -->
          <div style="width: 55%; background: #ffffff;">
            <div style="border: 1px solid #e2e8f0; padding: 8px 12px; margin-bottom: 6px;">
              <table style="width: 100%; font-size: 13px; font-weight: bold; color: #475569;">
                <tbody>
                  ${discountAmount > 0 ? `
                    <tr>
                      <td style="text-align: right; padding: 2px 4px;">المجموع الفرعي:</td>
                      <td style="text-align: left; padding: 2px 4px; font-family: monospace;">${subtotalAmount.toLocaleString()}</td>
                    </tr>
                    <tr style="color: #ef4444;">
                      <td style="text-align: right; padding: 2px 4px;">الخصم:</td>
                      <td style="text-align: left; padding: 2px 4px; font-family: monospace;">-${discountAmount.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style="text-align: right; padding: 2px 4px;">الإجمالي بعد الخصم:</td>
                      <td style="text-align: left; padding: 2px 4px; font-family: monospace;">${totalAmount.toLocaleString()}</td>
                    </tr>
                  ` : `
                    <tr>
                      <td style="text-align: right; padding: 2px 4px;">المجموع:</td>
                      <td style="text-align: left; padding: 2px 4px; font-family: monospace;">${totalAmount.toLocaleString()}</td>
                    </tr>
                  `}

                  ${isDebt ? `
                    <tr style="color: #16a34a; border-top: 1px solid #e2e8f0;">
                      <td style="text-align: right; padding: 4px 4px 2px 4px;">المدفوع:</td>
                      <td style="text-align: left; padding: 4px 4px 2px 4px; font-family: monospace;">${paidAmount.toLocaleString()} د.ع</td>
                    </tr>
                    <tr style="color: #dc2626; font-weight: 900;">
                      <td style="text-align: right; padding: 2px 4px;">المتبقي (الدين):</td>
                      <td style="text-align: left; padding: 2px 4px; font-family: monospace;">${remainingDebt.toLocaleString()} د.ع</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>

            <!-- Gold Total Ribbon -->
            <table style="width: 100%; background: #C89B3C; color: #ffffff; padding: 8px 12px;">
              <tbody>
                <tr>
                  <td style="text-align: right; padding: 8px 12px; font-weight: 900; font-size: 14px;">
                    ${isDebt ? 'إجمالي الفاتورة' : 'المبلغ المستحق'}
                  </td>
                  <td style="text-align: left; padding: 8px 12px; font-weight: 900; font-size: 18px; font-family: monospace;">
                    ${totalAmount.toLocaleString()} د.ع
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer Notes & Info -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 10px;">
          ${settings?.description ? `
            <div style="font-size: 10px; color: #64748b; margin-bottom: 8px; font-weight: 500;">
              <strong style="color: #334155; display: block; margin-bottom: 2px;">ملاحظات هامة:</strong>
              ${settings.description}
            </div>
          ` : ''}

          <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 10px; color: #64748b; font-weight: bold;">
            <span>${(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}</span>
            ${address ? `<span>${address}</span>` : ''}
          </div>
        </div>

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
        windowWidth: 794,
        letterRendering: false,
        allowTaint: true
      },
      jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    return pdfBlob;
  } finally {
    document.body.removeChild(overlay);
  }
}
