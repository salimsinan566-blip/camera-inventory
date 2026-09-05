import html2pdf from 'html2pdf.js';
import { getStockStatus, STOCK_STATUS } from '../models/product';

/**
 * Format numbers with comma separators
 */
function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

/**
 * Format timestamp / Date cleanly
 */
function formatDate(dateVal) {
  if (!dateVal) return new Date().toLocaleDateString('ar-IQ');
  if (dateVal.toDate && typeof dateVal.toDate === 'function') {
    return dateVal.toDate().toLocaleDateString('ar-IQ');
  }
  return new Date(dateVal).toLocaleDateString('ar-IQ');
}

/**
 * Render standard unified brand header identical to InvoiceReceipt.jsx
 */
function renderBrandHeader({ storeSettings, documentTitle, subtitle, badgeText }) {
  const storeName = (!storeSettings?.storeName || storeSettings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : storeSettings.storeName;
  const address = storeSettings?.address || 'العراق - بغداد';
  const logoUrl = storeSettings?.logoUrl;

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C89B3C; padding-bottom: 12px; margin-bottom: 20px;">
      <!-- Store Info -->
      <div style="text-align: right;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: 0px;">${storeName}</h1>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px; letter-spacing: 0px;">
          <span style="color: #C89B3C;">📍</span> ${address}
        </p>
      </div>

      <!-- Logo & Document Badge -->
      <div style="text-align: left; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
        ${logoUrl ? `
          <img src="${logoUrl}" alt="Logo" style="height: 55px; max-width: 160px; object-fit: contain;" />
        ` : `
          <div style="font-size: 18px; font-weight: 900; color: #C89B3C; font-family: monospace;">SAFE ZONE</div>
        `}
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: #fdf8ed; color: #92400e; border: 1px solid #fde68a; padding: 3px 12px; border-radius: 9999px; font-size: 11px; font-weight: 900; letter-spacing: 0px;">
            ${documentTitle || 'تقرير رسمي'}
          </span>
          ${badgeText ? `
            <span style="background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; letter-spacing: 0px;">
              ${badgeText}
            </span>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render standard unified brand footer
 */
function renderBrandFooter(storeSettings) {
  const storeName = (!storeSettings?.storeName || storeSettings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : storeSettings.storeName;
  const address = storeSettings?.address || 'العراق - بغداد';
  const qrUrl = storeSettings?.qrCodeUrl;
  const desc = storeSettings?.description;

  return `
    <div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; letter-spacing: 0px;">
      <div style="text-align: right; max-width: 70%;">
        ${desc ? `<div style="font-weight: bold; color: #334155; margin-bottom: 2px;">${desc}</div>` : ''}
        <div>${storeName} | ${address} — تم استخراج هذا التقرير آلياً عبر نظام إدارة المخزون والمبيعات</div>
      </div>
      <div>
        ${qrUrl ? `
          <img src="${qrUrl}" alt="QR" style="width: 45px; height: 45px; border: 1px solid #e2e8f0; padding: 2px; border-radius: 4px;" />
        ` : `
          <div style="font-family: monospace; font-weight: bold; color: #C89B3C; font-size: 11px;">SAFE ZONE</div>
        `}
      </div>
    </div>
  `;
}

async function htmlToPdfBlob(htmlContent, filename = 'document.pdf') {
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
  container.style.borderRadius = '0px';
  container.style.boxSizing = 'border-box';
  container.dir = 'rtl';
  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700;900&display=swap');
      * {
        box-sizing: border-box;
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
      }
      th, td {
        font-feature-settings: "liga" 1, "dlig" 1, "calt" 1 !important;
      }
    </style>
    ${htmlContent}
  `;

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {}
  }
  await new Promise((resolve) => setTimeout(resolve, 400));

  try {
    const opt = {
      margin: 0,
      filename,
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

    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    return pdfBlob;
  } finally {
    document.body.removeChild(overlay);
  }
}

/**
 * Helper for formatQuantity
 */
function formatProductQty(product, qty) {
  if (product.sellMode !== 'meter') return `${Number(qty || 0)} ق`;
  const totalMeters = Number(qty || 0);
  if (totalMeters === 0) return '0 م';
  const mpr = Number(product.metersPerRoll) || 305;
  if (mpr <= 0) return `${totalMeters} م`;
  const rolls = Math.floor(totalMeters / mpr);
  const meters = totalMeters % mpr;
  if (rolls > 0 && meters > 0) return `${rolls} لفة + ${meters} م`;
  if (rolls > 0) return `${rolls} لفة`;
  return `${meters} م`;
}

/**
 * 1. Capital Report PDF (رأس_المال_وجرد_المخزون.pdf) - Styled exactly like Invoice
 */
export async function generateCapitalPDF(products = [], suspendedDrafts = [], storeSettings = {}) {
  const storeCapital = products.reduce((sum, p) => sum + (Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0), 0);
  const warehouseCapital = products.reduce((sum, p) => sum + (Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0), 0);
  const totalCapital = storeCapital + warehouseCapital;

  let storeUnits = 0;
  let warehouseUnits = 0;
  products.forEach((p) => {
    storeUnits += Number(p.storeQty) || 0;
    warehouseUnits += Number(p.warehouseQty) || 0;
  });

  const grouped = {};
  products.forEach((p) => {
    const cat = p.cameraType || 'أقسام أخرى';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  const getPendingCustomerBreakdown = (product) => {
    const customerMap = new Map();
    suspendedDrafts.forEach((draft) => {
      const item = draft.items?.find((i) => 
        (i.productId && (i.productId === product.id || i.productId === product.sku)) ||
        (i.id && (i.id === product.id || i.id === product.sku)) ||
        (product.sku && i.sku === product.sku) ||
        (product.barcode && i.barcode === product.barcode) ||
        (product.name && i.name === product.name)
      );
      if (item && Number(item.quantity) > 0) {
        const name = (draft.customerName || 'عميل نقدي').trim();
        customerMap.set(name, (customerMap.get(name) || 0) + Number(item.quantity));
      }
    });

    if (customerMap.size > 0) {
      const list = [];
      customerMap.forEach((qty, name) => {
        list.push({
          name,
          qty: formatProductQty(product, qty)
        });
      });
      return list;
    }

    if (Number(product.pendingQty) > 0) {
      return [{
        name: 'معلق',
        qty: formatProductQty(product, product.pendingQty)
      }];
    }

    return [];
  };

  let html = `
    <div style="padding: 24px 30px; font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'تقرير رأس المال وجرد المخزون',
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}`,
        badgeText: `${products.length} صنف`
      })}

      <!-- KPI Summary Cards -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; page-break-inside: avoid;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">إجمالي رأس المال</div>
          <div style="color: #0f172a; font-size: 16px; font-weight: 900; font-family: monospace;">${formatIQD(totalCapital)} <span style="font-size: 10px;">د.ع</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">رأس مال المحل</div>
          <div style="color: #15803d; font-size: 15px; font-weight: 900; font-family: monospace;">${formatIQD(storeCapital)} <span style="font-size: 10px;">د.ع</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">رأس مال المخزن</div>
          <div style="color: #0f766e; font-size: 15px; font-weight: 900; font-family: monospace;">${formatIQD(warehouseCapital)} <span style="font-size: 10px;">د.ع</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">مجموع القطع</div>
          <div style="color: #334155; font-size: 14px; font-weight: 900;">محل: ${storeUnits} | مخزن: ${warehouseUnits}</div>
        </div>
      </div>

      <!-- Categories breakdown with seamless page flow -->
      ${Object.keys(grouped)
        .map((cat) => {
          const items = grouped[cat];
          const catStoreCap = items.reduce((s, p) => s + (Number(p.storeQty) || 0) * (Number(p.wholesalePrice) || 0), 0);
          const catWhCap = items.reduce((s, p) => s + (Number(p.warehouseQty) || 0) * (Number(p.wholesalePrice) || 0), 0);

          return `
            <div style="margin-bottom: 22px;">
              <!-- Category Header -->
              <div style="background: #f8fafc; border-right: 4px solid #C89B3C; padding: 8px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; page-break-after: avoid; break-after: avoid;">
                <span style="font-weight: 900; font-size: 13px; color: #0f172a;">قسم: ${cat} (${items.length} منتج)</span>
                <span style="font-size: 11px; font-weight: bold; color: #64748b;">
                  رأس مال المحل: <strong style="color: #15803d; font-family: monospace;">${formatIQD(catStoreCap)}</strong> | 
                  المخزن: <strong style="color: #0f766e; font-family: monospace;">${formatIQD(catWhCap)}</strong>
                </span>
              </div>

              <!-- Category Products Table -->
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
                <thead style="background: #f1f5f9; color: #334155; font-size: 11px;">
                  <tr style="page-break-inside: avoid;">
                    <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 44%;">الوصف / اسم المادة</th>
                    <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 13%;">المحل</th>
                    <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 13%;">المخزن</th>
                    <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 15%;">سعر الجملة</th>
                    <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 15%;">سعر المفرد</th>
                  </tr>
                </thead>
                <tbody>
                  ${items
                    .map((p) => {
                      const pendingBreakdown = getPendingCustomerBreakdown(p);
                      return `
                        <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
                          <td style="padding: 7px 8px; vertical-align: top;">
                            <div style="font-weight: bold; color: #1e293b; font-size: 11.5px; line-height: 1.4;">
                              ${p.name || '-'}
                            </div>
                            <div style="font-size: 9px; color: #94a3b8; font-family: monospace; margin-top: 1px;">
                              ${p.sku || p.barcode || ''}
                            </div>
                            ${pendingBreakdown.length > 0 ? `
                              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                                ${pendingBreakdown.map(cust => `
                                  <span style="display: inline-flex; align-items: center; gap: 3px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 4px; padding: 1px 6px; font-size: 9px; font-weight: bold;">
                                    <span>🏷️</span> ${cust.name}: <strong style="color: #78350f;">${cust.qty}</strong>
                                  </span>
                                `).join('')}
                              </div>
                            ` : ''}
                          </td>
                          <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-weight: bold; color: ${p.storeQty > 0 ? '#0f172a' : '#dc2626'}; font-size: 11.5px;">
                            ${formatProductQty(p, p.storeQty)}
                          </td>
                          <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-weight: bold; color: ${p.warehouseQty > 0 ? '#0f172a' : '#dc2626'}; font-size: 11.5px;">
                            ${formatProductQty(p, p.warehouseQty)}
                          </td>
                          <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-family: monospace; font-size: 11px;">
                            ${formatIQD(p.wholesalePrice)}
                          </td>
                          <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-family: monospace; font-weight: bold; color: #C89B3C; font-size: 11px;">
                            ${formatIQD(p.retailPrice)}
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `;
        })
        .join('')}

      <!-- Total Gold Bar -->
      <div style="background: #C89B3C; color: #ffffff; padding: 10px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
        <span style="font-weight: 900; font-size: 14px; letter-spacing: 0px;">إجمالي رأس المال الإجمالي للمحل والمخزن</span>
        <span style="font-weight: 900; font-size: 18px; font-family: monospace;">${formatIQD(totalCapital)} د.ع</span>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, 'رأس_المال_وجرد_المخزون.pdf');
}

/**
 * 2. Single Invoice PDF (فاتورة_XXXX.pdf) - Identical to InvoiceReceipt.jsx
 */
export async function generateInvoicePDF(sale, storeSettings = {}) {
  const invoiceNum = sale.invoiceNumber || sale.id?.slice(0, 6) || '1001';
  const isDebt = sale.invoiceType === 'debt' || sale.paymentMethod === 'debt';
  const dateStr = formatDate(sale.createdAt);

  let html = `
    <div style="padding: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a; min-height: 900px; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        ${renderBrandHeader({
          storeSettings,
          documentTitle: sale.isOffer ? 'عرض سعر (Quotation)' : isDebt ? 'فاتورة مبيعات (آجل)' : 'فاتورة مبيعات نقدية',
          subtitle: `رقم: #${invoiceNum}`,
          badgeText: isDebt ? '📝 آجل' : '💵 نقدي'
        })}

        <!-- Customer & Invoice Meta Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div>
            <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0px;">فاتورة إلى</div>
            <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 2px;">${sale.customerName || 'زبون عام'}</div>
            ${sale.customerPhone ? `<div style="font-size: 11px; color: #64748b; font-family: monospace;" dir="ltr">${sale.customerPhone}</div>` : ''}
          </div>
          <div style="text-align: left; font-size: 11px; color: #64748b;">
            <div>رقم الفاتورة: <strong style="color: #0f172a; font-family: monospace;">#${invoiceNum}</strong></div>
            <div style="margin-top: 2px;">تاريخ الإصدار: <strong style="color: #0f172a;">${dateStr}</strong></div>
            <div style="margin-top: 2px;">نوع الدفع: <strong style="color: ${isDebt ? '#b45309' : '#15803d'};">${isDebt ? 'آجل (دين)' : 'نقدي'}</strong></div>
          </div>
        </div>

        <!-- Line items table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: right; margin-bottom: 20px;">
          <thead style="background: #f2f2f2; color: #334155; font-size: 12px;">
            <tr>
              <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; width: 50%;">الوصف</th>
              <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 14%;">الكمية</th>
              <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 18%;">السعر</th>
              <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: left; width: 18%;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            ${(sale.items || [])
              .map((item) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 8px 10px; font-weight: bold; color: #0f172a;">
                    ${item.name || '-'}
                    ${item.isService ? `<span style="font-size: 9px; background: #f1f5f9; color: #64748b; padding: 1px 4px; border-radius: 4px; margin-right: 4px;">خدمة</span>` : ''}
                  </td>
                  <td style="padding: 8px 10px; text-align: center; font-weight: bold;">${item.quantity || 1}</td>
                  <td style="padding: 8px 10px; text-align: center; font-family: monospace;">${formatIQD(item.unitPrice)}</td>
                  <td style="padding: 8px 10px; text-align: left; font-family: monospace; font-weight: bold;">${formatIQD((item.quantity || 1) * (item.unitPrice || 0))}</td>
                </tr>
              `)
              .join('')}
          </tbody>
        </table>

        <!-- Totals & Gold Bar -->
        <div style="display: flex; justify-content: flex-end;">
          <div style="width: 280px;">
            <div style="border: 1px solid #e2e8f0; background: #ffffff; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px;">
                <span>المجموع الفرعي:</span>
                <span style="font-family: monospace; font-weight: bold;">${formatIQD(sale.subtotal || sale.total)} د.ع</span>
              </div>
              ${sale.discount > 0 ? `
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #dc2626; font-weight: bold; border-top: 1px dashed #fecdd3; padding-top: 4px; margin-top: 4px;">
                  <span>الخصم الممنوح:</span>
                  <span style="font-family: monospace;">-${formatIQD(sale.discount)} د.ع</span>
                </div>
              ` : ''}
            </div>

            <div style="background: #C89B3C; color: #ffffff; padding: 10px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 900; font-size: 12px; letter-spacing: 0px;">المبلغ المستحق</span>
              <span style="font-weight: 900; font-size: 16px; font-family: monospace;">${formatIQD(sale.total)} د.ع</span>
            </div>
          </div>
        </div>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, `فاتورة_${invoiceNum}.pdf`);
}

/**
 * 3. Products Catalog PDF (تقرير_المخزون_والمنتجات.pdf)
 */
export async function generateProductsCatalogPDF(products = [], suspendedDrafts = [], storeSettings = {}) {
  const getPendingCustomerBreakdown = (product) => {
    const customerMap = new Map();
    suspendedDrafts.forEach((draft) => {
      const item = draft.items?.find((i) => 
        (i.productId && (i.productId === product.id || i.productId === product.sku)) ||
        (i.id && (i.id === product.id || i.id === product.sku)) ||
        (product.sku && i.sku === product.sku) ||
        (product.barcode && i.barcode === product.barcode) ||
        (product.name && i.name === product.name)
      );
      if (item && Number(item.quantity) > 0) {
        const name = (draft.customerName || 'عميل نقدي').trim();
        customerMap.set(name, (customerMap.get(name) || 0) + Number(item.quantity));
      }
    });

    if (customerMap.size > 0) {
      const list = [];
      customerMap.forEach((qty, name) => {
        list.push({
          name,
          qty: formatProductQty(product, qty)
        });
      });
      return list;
    }

    if (Number(product.pendingQty) > 0) {
      return [{
        name: 'معلق',
        qty: formatProductQty(product, product.pendingQty)
      }];
    }

    return [];
  };

  let html = `
    <div style="padding: 24px 30px; font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'تقرير جرد المخزون والمنتجات',
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}`,
        badgeText: `${products.length} صنف`
      })}

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
        <thead style="background: #f1f5f9; color: #334155; font-size: 11px;">
          <tr style="page-break-inside: avoid;">
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 4%;">#</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 40%;">الوصف / اسم المادة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 14%;">القسم</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 11%;">المحل</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 11%;">المخزن</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 10%;">سعر الجملة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 10%;">سعر المفرد</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map((p, i) => {
              const pendingBreakdown = getPendingCustomerBreakdown(p);
              return `
                <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
                  <td style="padding: 7px 8px; color: #94a3b8; text-align: center; vertical-align: top;">${i + 1}</td>
                  <td style="padding: 7px 8px; vertical-align: top;">
                    <div style="font-weight: bold; color: #0f172a; font-size: 11.5px; line-height: 1.4;">
                      ${p.name || '-'}
                    </div>
                    <div style="font-size: 9px; color: #94a3b8; font-family: monospace; margin-top: 1px;">
                      SKU: ${p.sku || '-'} | Barcode: ${p.barcode || '-'}
                    </div>
                    ${pendingBreakdown.length > 0 ? `
                      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        ${pendingBreakdown.map(cust => `
                          <span style="display: inline-flex; align-items: center; gap: 3px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 4px; padding: 1px 6px; font-size: 9px; font-weight: bold;">
                            <span>🏷️</span> ${cust.name}: <strong style="color: #78350f;">${cust.qty}</strong>
                          </span>
                        `).join('')}
                      </div>
                    ` : ''}
                  </td>
                  <td style="padding: 7px 8px; color: #475569; vertical-align: top;">${p.cameraType || '-'}</td>
                  <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-weight: bold; color: ${p.storeQty > 0 ? '#15803d' : '#dc2626'}; font-size: 11.5px;">${formatProductQty(p, p.storeQty)}</td>
                  <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-weight: bold; color: ${p.warehouseQty > 0 ? '#0f766e' : '#dc2626'}; font-size: 11.5px;">${formatProductQty(p, p.warehouseQty)}</td>
                  <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-family: monospace; font-size: 11px;">${formatIQD(p.wholesalePrice)}</td>
                  <td style="padding: 7px 8px; text-align: center; vertical-align: top; font-family: monospace; font-weight: bold; color: #C89B3C; font-size: 11px;">${formatIQD(p.retailPrice)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, 'تقرير_المخزون_والمنتجات.pdf');
}

/**
 * 4. Sales Summary PDF (تقرير_المبيعات_والإيرادات.pdf)
 */
export async function generateSalesSummaryPDF(sales = [], storeSettings = {}) {
  const totalSales = sales.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const totalCash = sales.filter((s) => s.paymentMethod === 'cash' || s.invoiceType === 'cash').reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const totalDebt = sales.filter((s) => s.paymentMethod === 'debt' || s.invoiceType === 'debt').reduce((s, sale) => s + (Number(sale.total) || 0), 0);

  let html = `
    <div style="padding: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'تقرير سجل المبيعات والإيرادات',
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}`,
        badgeText: `${sales.length} فاتورة`
      })}

      <!-- Summary cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">إجمالي المبيعات</div>
          <div style="color: #0f172a; font-size: 16px; font-weight: 900; font-family: monospace;">${formatIQD(totalSales)} د.ع</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #15803d; font-size: 10px; font-weight: bold; margin-bottom: 2px;">المبيعات النقدية</div>
          <div style="color: #15803d; font-size: 15px; font-weight: 900; font-family: monospace;">${formatIQD(totalCash)} د.ع</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #b45309; font-size: 10px; font-weight: bold; margin-bottom: 2px;">مبيعات الديون (الآجل)</div>
          <div style="color: #b45309; font-size: 15px; font-weight: 900; font-family: monospace;">${formatIQD(totalDebt)} د.ع</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
        <thead style="background: #f2f2f2; color: #334155; font-size: 11px;">
          <tr>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 12%;">رقم الفاتورة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 15%;">التاريخ</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 30%;">اسم العميل</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 15%;">طريقة الدفع</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 10%;">الأصناف</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: left; width: 18%;">الإجمالي (د.ع)</th>
          </tr>
        </thead>
        <tbody>
          ${sales
            .map((s) => {
              const isDebt = s.invoiceType === 'debt' || s.paymentMethod === 'debt';
              return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; font-weight: bold; font-family: monospace;">#${s.invoiceNumber || s.id?.slice(0, 6)}</td>
                  <td style="padding: 6px 8px; color: #64748b;">${formatDate(s.createdAt)}</td>
                  <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">${s.customerName || 'زبون عام'}</td>
                  <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: ${isDebt ? '#b45309' : '#15803d'};">
                    ${isDebt ? 'آجل (دين)' : 'نقدي'}
                  </td>
                  <td style="padding: 6px 8px; text-align: center;">${s.items?.length || 0}</td>
                  <td style="padding: 6px 8px; text-align: left; font-family: monospace; font-weight: bold; color: #C89B3C;">
                    ${formatIQD(s.total)}
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      <!-- Gold Total Bar -->
      <div style="background: #C89B3C; color: #ffffff; padding: 10px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
        <span style="font-weight: 900; font-size: 14px; letter-spacing: 0px;">إجمالي المبيعات الكلي</span>
        <span style="font-weight: 900; font-size: 18px; font-family: monospace;">${formatIQD(totalSales)} د.ع</span>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, 'تقرير_المبيعات_والإيرادات.pdf');
}

/**
 * 5. Customer Statement PDF (كشف_حساب_العميل.pdf)
 */
export async function generateCustomerStatementPDF(customer, customerSales = [], storeSettings = {}) {
  const totalPurchases = customerSales.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const remainingDebt = Number(customer.totalDebt) || 0;

  let html = `
    <div style="padding: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'كشف حساب عميل',
        subtitle: `اسم العميل: ${customer.name}`,
        badgeText: `${customerSales.length} فاتورة`
      })}

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">إجمالي المشتريات</div>
          <div style="color: #0f172a; font-size: 16px; font-weight: 900; font-family: monospace;">${formatIQD(totalPurchases)} د.ع</div>
        </div>
        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #9f1239; font-size: 10px; font-weight: bold; margin-bottom: 2px;">الديون الحالية القائمة</div>
          <div style="color: #e11d48; font-size: 16px; font-weight: 900; font-family: monospace;">${formatIQD(remainingDebt)} د.ع</div>
        </div>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="color: #64748b; font-size: 10px; font-weight: bold; margin-bottom: 2px;">عدد الفواتير</div>
          <div style="color: #15803d; font-size: 16px; font-weight: 900;">${customerSales.length}</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
        <thead style="background: #f2f2f2; color: #334155; font-size: 11px;">
          <tr>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 15%;">رقم الفاتورة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 20%;">التاريخ</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 20%;">نوع الدفع</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 20%;">عدد المواد</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: left; width: 25%;">المبلغ (د.ع)</th>
          </tr>
        </thead>
        <tbody>
          ${customerSales
            .map((s) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; font-weight: bold; font-family: monospace;">#${s.invoiceNumber || s.id?.slice(0, 6)}</td>
                <td style="padding: 6px 8px; color: #64748b;">${formatDate(s.createdAt)}</td>
                <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: ${s.invoiceType === 'debt' ? '#b45309' : '#15803d'};">
                  ${s.invoiceType === 'debt' ? 'دين' : 'نقدي'}
                </td>
                <td style="padding: 6px 8px; text-align: center;">${s.items?.length || 0}</td>
                <td style="padding: 6px 8px; text-align: left; font-family: monospace; font-weight: bold; color: #C89B3C;">
                  ${formatIQD(s.total)}
                </td>
              </tr>
            `)
            .join('')}
        </tbody>
      </table>

      <!-- Gold Balance Bar -->
      <div style="background: #C89B3C; color: #ffffff; padding: 10px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
        <span style="font-weight: 900; font-size: 13px;">الرصيد المدين المتبقي بذمة العميل</span>
        <span style="font-weight: 900; font-size: 16px; font-family: monospace;">${formatIQD(remainingDebt)} د.ع</span>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, `كشف_حساب_${customer.name}.pdf`);
}

/**
 * 6. Customers & Debts PDF (كشف_العملاء_والديون_المعلقة.pdf)
 */
export async function generateCustomersDebtsPDF(customers = [], sales = [], storeSettings = {}) {
  const totalDebt = customers.reduce((sum, c) => sum + (Number(c.totalDebt) || 0), 0);

  let html = `
    <div style="padding: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'كشف سجل العملاء والديون المعلقة',
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}`,
        badgeText: `${customers.length} عميل`
      })}

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
        <thead style="background: #f2f2f2; color: #334155; font-size: 11px;">
          <tr>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 5%;">#</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 30%;">اسم العميل</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 20%;">رقم الهاتف 1</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 20%;">رقم الهاتف 2</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: left; width: 25%;">الرصيد المدين (د.ع)</th>
          </tr>
        </thead>
        <tbody>
          ${customers
            .map((c, i) => {
              const debt = Number(c.totalDebt) || 0;
              return `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 6px 8px; text-align: center; color: #94a3b8;">${i + 1}</td>
                  <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">${c.name || '-'}</td>
                  <td style="padding: 6px 8px; font-family: monospace;" dir="ltr">${c.phone1 || '-'}</td>
                  <td style="padding: 6px 8px; font-family: monospace;" dir="ltr">${c.phone2 || '-'}</td>
                  <td style="padding: 6px 8px; text-align: left; font-family: monospace; font-weight: bold; color: ${debt > 0 ? '#dc2626' : '#16a34a'};">
                    ${formatIQD(debt)}
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      <!-- Gold Total Debt Bar -->
      <div style="background: #C89B3C; color: #ffffff; padding: 10px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
        <span style="font-weight: 900; font-size: 14px; letter-spacing: 0px;">إجمالي الديون القائمة بالسوق</span>
        <span style="font-weight: 900; font-size: 18px; font-family: monospace;">${formatIQD(totalDebt)} د.ع</span>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, 'كشف_العملاء_والديون_المعلقة.pdf');
}

/**
 * 7. Inventory Logs PDF (سجل_حركات_وتغييرات_المخزون.pdf)
 */
export async function generateInventoryLogsPDF(logs = [], storeSettings = {}) {
  let html = `
    <div style="padding: 30px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: 'سجل حركات وتغييرات المخزون',
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')}`,
        badgeText: `${logs.length} حركة`
      })}

      <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: right;">
        <thead style="background: #f2f2f2; color: #334155; font-size: 10px;">
          <tr>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; width: 14%;">التاريخ والوقت</th>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; width: 26%;">المنتج</th>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 14%;">نوع الحركة</th>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 18%;">تغيير الكميات</th>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; width: 16%;">السبب / الملاحظة</th>
            <th style="padding: 6px; border-bottom: 2px solid #cbd5e1; width: 12%;">المستخدم</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .slice(0, 500)
            .map((log) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px; color: #64748b;">${formatDate(log.createdAt)}</td>
                <td style="padding: 5px; font-weight: bold; color: #0f172a;">${log.productName || '-'}</td>
                <td style="padding: 5px; text-align: center; font-weight: bold;">${log.type || 'تعديل'}</td>
                <td style="padding: 5px; text-align: center; font-family: monospace;">
                  محل: ${log.previousStoreQty ?? '-'} ➔ ${log.newStoreQty ?? '-'} | مخزن: ${log.previousWarehouseQty ?? '-'} ➔ ${log.newWarehouseQty ?? '-'}
                </td>
                <td style="padding: 5px; color: #475569;">${log.reason || '-'}</td>
                <td style="padding: 5px; color: #64748b;">${log.userEmail?.split('@')[0] || '-'}</td>
              </tr>
            `)
            .join('')}
        </tbody>
      </table>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  return await htmlToPdfBlob(html, 'سجل_حركات_وتغييرات_المخزون.pdf');
}

/**
 * 7. Technician Custody Manifest PDF (كشف_عهدة_فني_وسيارة_صيانة.pdf)
 */
export async function generateCustodyManifestPDF(technician, custodyDoc = {}, storeSettings = {}, actionTitle = 'كشف عهدة فني ومخزون سيارة') {
  const items = custodyDoc.items || [];
  const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalRetail = items.reduce((sum, i) => sum + (Number(i.retailPrice) || 0) * (Number(i.quantity) || 0), 0);

  let html = `
    <div style="padding: 24px 30px; font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: actionTitle,
        subtitle: `التاريخ: ${new Date().toLocaleDateString('ar-IQ')} - ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`,
        badgeText: `${items.length} صنف | ${totalQty} قطعة`
      })}

      <!-- Technician & Vehicle Information Card -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 14px; font-weight: bold; color: #1e293b;">
            👤 الفني المسؤول: <span style="color: #4338ca;">${technician?.name || 'غير محدد'}</span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
            📞 الهاتف: ${technician?.phone || '—'} ${technician?.vehicleNumber ? `| 🚚 رقم السيارة: <strong style="color: #0f172a;">${technician.vehicleNumber}</strong>` : ''}
          </div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 11px; color: #64748b;">إجمالي عدد القطع بالعهدة:</div>
          <div style="font-size: 18px; font-weight: 900; color: #4338ca;">${totalQty} <span style="font-size: 12px;">قطعة</span></div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right; margin-bottom: 20px;">
        <thead style="background: #f1f5f9; color: #334155;">
          <tr style="page-break-inside: avoid;">
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 5%; text-align: center;">#</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 45%;">اسم المادة / الوصف</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 15%;">القسم / SKU</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 15%;">الكمية بعهدة السيارة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; text-align: center; width: 20%;">سعر البيع المفرد</th>
          </tr>
        </thead>
        <tbody>
          ${items.length === 0 ? `
            <tr>
              <td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8;">لا توجد مواد مسجلة بعهدة الفني حالياً</td>
            </tr>
          ` : items.map((item, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
              <td style="padding: 7px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
              <td style="padding: 7px 8px; font-weight: bold; color: #0f172a;">
                <div>${item.name || '—'}</div>
                ${item.barcode ? `<div style="font-size: 9px; color: #94a3b8; font-family: monospace;">Barcode: ${item.barcode}</div>` : ''}
              </td>
              <td style="padding: 7px 8px; color: #475569;">
                <div>${item.cameraType || '—'}</div>
                <div style="font-size: 9px; color: #94a3b8; font-family: monospace;">${item.sku || ''}</div>
              </td>
              <td style="padding: 7px 8px; text-align: center; font-weight: 900; color: #1e1b4b; font-size: 12px;">
                ${formatProductQty(item, item.quantity)}
              </td>
              <td style="padding: 7px 8px; text-align: center; font-weight: bold; color: #334155;">
                ${formatIQD(item.retailPrice)} د.ع
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Totals Summary Box -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 16px; min-width: 250px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
            <span style="color: #64748b;">مجموع الأصناف:</span>
            <strong>${items.length} صنف</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
            <span style="color: #64748b;">إجمالي القطع:</span>
            <strong style="color: #4338ca;">${totalQty} قطعة</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; border-top: 1px dashed #cbd5e1; padding-top: 6px; color: #0f172a;">
            <span>القيمة التقديرية للعهدة:</span>
            <span>${formatIQD(totalRetail)} د.ع</span>
          </div>
        </div>
      </div>

      <!-- Signatures Block -->
      <div style="display: flex; justify-content: space-between; margin-top: 40px; padding: 0 20px; page-break-inside: avoid;">
        <div style="text-align: center; width: 200px;">
          <div style="font-size: 11px; font-weight: bold; color: #334155; margin-bottom: 45px;">
            توقيع المستلم (الفني / السائق)
          </div>
          <div style="border-top: 1px dashed #94a3b8; padding-top: 4px; font-size: 10px; color: #64748b;">
            الاسم: ${technician?.name || '________________'}
          </div>
        </div>

        <div style="text-align: center; width: 200px;">
          <div style="font-size: 11px; font-weight: bold; color: #334155; margin-bottom: 45px;">
            توقيع المسؤول / أمين المخزن
          </div>
          <div style="border-top: 1px dashed #94a3b8; padding-top: 4px; font-size: 10px; color: #64748b;">
            الاسم والختم: ________________
          </div>
        </div>
      </div>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  const fileName = `كشف_عهدة_${(technician?.name || 'فني').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return await htmlToPdfBlob(html, fileName);
}

/**
 * 8. Comprehensive Daily / Period Custody Movements Report PDF (تقرير_حركة_العهد_اليومي.pdf)
 */
export async function generateCustodyMovementReportPDF({
  technician = null, // null for all technicians
  logs = [],
  filterTitle = 'تقرير حركة عهد الفنيين وسيارات الصيانة',
  dateRangeText = '',
  storeSettings = {}
}) {
  const totalLoads = logs.filter(l => l.type === 'load').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
  const totalSales = logs.filter(l => l.type === 'sale_deduct').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
  const totalReturns = logs.filter(l => l.type === 'return').reduce((s, l) => s + (Number(l.totalQuantity) || 0), 0);
  const netChange = totalLoads - totalSales - totalReturns;

  let html = `
    <div style="padding: 24px 30px; font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; text-align: right; background: #ffffff; color: #0f172a;">
      ${renderBrandHeader({
        storeSettings,
        documentTitle: filterTitle,
        subtitle: `الفترة: ${dateRangeText || new Date().toLocaleDateString('ar-IQ')} | تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')} ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`,
        badgeText: `${logs.length} حركة مسجلة`
      })}

      <!-- Filter / Technician info -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 13px; font-weight: bold; color: #1e293b;">
            🚚 نطاق التقرير: <span style="color: #4338ca;">${technician ? technician.name : 'جميع الفنيين وسيارات العمل'}</span>
          </div>
          ${technician ? `
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              📞 الهاتف: ${technician.phone || '—'} ${technician.vehicleNumber ? `| 🚘 رقم السيارة: <strong style="color: #0f172a;">${technician.vehicleNumber}</strong>` : ''}
            </div>
          ` : `
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
              سجل شامل لجميع عمليات التحميل، الصرف الميداني، والاسترجاع.
            </div>
          `}
        </div>
        <div style="text-align: left; font-size: 11px; color: #64748b;">
          عدد العمليات: <strong style="color: #0f172a; font-size: 14px;">${logs.length}</strong>
        </div>
      </div>

      <!-- Quick Summary Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
        <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #4338ca; font-weight: bold;">🚚 إجمالي المحمّل</div>
          <div style="font-size: 16px; font-weight: 900; color: #312e81; margin-top: 2px;">${totalLoads} <span style="font-size: 10px;">قطعة</span></div>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #047857; font-weight: bold;">🧾 إجمالي المباع/المصروف</div>
          <div style="font-size: 16px; font-weight: 900; color: #064e3b; margin-top: 2px;">${totalSales} <span style="font-size: 10px;">قطعة</span></div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #b45309; font-weight: bold;">🔄 إجمالي المسترجع</div>
          <div style="font-size: 16px; font-weight: 900; color: #78350f; margin-top: 2px;">${totalReturns} <span style="font-size: 10px;">قطعة</span></div>
        </div>
        <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center;">
          <div style="font-size: 10px; color: #475569; font-weight: bold;">📊 صافي الحركة</div>
          <div style="font-size: 16px; font-weight: 900; color: ${netChange >= 0 ? '#1e293b' : '#dc2626'}; margin-top: 2px;">${netChange > 0 ? '+' : ''}${netChange} <span style="font-size: 10px;">قطعة</span></div>
        </div>
      </div>

      <!-- Log Entries Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: right; margin-bottom: 25px;">
        <thead style="background: #f1f5f9; color: #334155;">
          <tr style="page-break-inside: avoid;">
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 14%;">التاريخ والوقت</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 14%;">الفني / السيارة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 14%; text-align: center;">نوع الحركة</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 38%;">المواد المنقولة والتفاصيل</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 10%; text-align: center;">الكمية</th>
            <th style="padding: 7px 8px; border-bottom: 2px solid #cbd5e1; width: 10%;">المسؤول</th>
          </tr>
        </thead>
        <tbody>
          ${logs.length === 0 ? `
            <tr>
              <td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8;">لا توجد حركات مسجلة ضمن هذه الفترة</td>
            </tr>
          ` : logs.map((log, idx) => {
            const isLoad = log.type === 'load';
            const isReturn = log.type === 'return';
            const isSale = log.type === 'sale_deduct';
            
            const badgeBg = isLoad ? '#eef2ff' : isReturn ? '#fffbeb' : '#ecfdf5';
            const badgeColor = isLoad ? '#4338ca' : isReturn ? '#b45309' : '#047857';
            const badgeBorder = isLoad ? '#c7d2fe' : isReturn ? '#fde68a' : '#a7f3d0';
            const typeLabel = isLoad ? '🚚 تحميل للسيارة' : isReturn ? '🔄 استرجاع للمحل' : '🧾 صرف بيع مباشر';
            
            let destinationText = '';
            if (isLoad) {
              destinationText = `من: ${log.sourceLocation === 'warehouse' ? 'المخزن الرئيسي' : 'المحل'} ⬅️ إلى سيارة الفني`;
            } else if (isReturn) {
              destinationText = `من السيارة ⬅️ إلى: ${log.targetLocation === 'warehouse' ? 'المخزن الرئيسي' : 'المحل'}`;
            } else if (isSale) {
              destinationText = `صرف للزبون: ${log.customerName || 'زبون نقدي'} ${log.invoiceNumber ? `| فاتورة #${log.invoiceNumber}` : ''}`;
            }

            const itemsStr = (log.items || []).map(i => `${i.name || 'مادة'} (${i.quantity} ${i.sellMode === 'meter' ? 'متر' : 'قطعة'})`).join(' • ');

            return `
              <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
                <td style="padding: 6px 8px; color: #475569; font-family: monospace; font-size: 10px;">
                  <div>${log.createdAt ? new Date(log.createdAt).toLocaleDateString('ar-IQ') : '—'}</div>
                  <div style="color: #94a3b8; font-size: 9px;">${log.createdAt ? new Date(log.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                </td>
                <td style="padding: 6px 8px; font-weight: bold; color: #1e293b;">
                  ${log.technicianName || '—'}
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                  <span style="display: inline-block; padding: 2px 6px; border-radius: 6px; font-size: 9.5px; font-weight: bold; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">
                    ${typeLabel}
                  </span>
                </td>
                <td style="padding: 6px 8px; color: #334155;">
                  <div style="font-weight: bold; font-size: 10.5px; color: #0f172a; margin-bottom: 2px;">
                    ${itemsStr || '—'}
                  </div>
                  <div style="font-size: 9.5px; color: #64748b;">
                    📍 ${destinationText}
                  </div>
                  ${log.notes && log.notes !== destinationText ? `
                    <div style="font-size: 9px; color: #94a3b8; margin-top: 1px;">
                      📝 ${log.notes}
                    </div>
                  ` : ''}
                </td>
                <td style="padding: 6px 8px; text-align: center; font-weight: 900; font-size: 11px; color: #0f172a; font-family: monospace;">
                  ${log.totalQuantity || 0}
                </td>
                <td style="padding: 6px 8px; color: #64748b; font-size: 9.5px;">
                  ${log.performedBy || 'المسؤول'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      ${renderBrandFooter(storeSettings)}
    </div>
  `;

  const safeTechName = (technician?.name || 'جميع_الفنيين').replace(/\s+/g, '_');
  const fileName = `تقرير_حركة_العهد_${safeTechName}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return await htmlToPdfBlob(html, fileName);
}

