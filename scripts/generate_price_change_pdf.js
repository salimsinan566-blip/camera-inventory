import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/firebase/config.js';
import { isCableProduct } from '../src/models/product.js';

function formatIQD(num) {
  if (num === 0) return '0';
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

async function generateReport() {
  console.log('🔄 جاري جلب البيانات لإعداد تقرير فروقات الأسعار...');

  // 1. قراءة الأسعار الأصلية من النسخة الاحتياطية
  const backupPath = path.resolve('backups/latest_prices_backup.json');
  if (!fs.existsSync(backupPath)) {
    console.error('❌ ملف النسخة الاحتياطية غير موجود!');
    process.exit(1);
  }
  const originalProducts = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  const origMap = new Map();
  originalProducts.forEach((p) => origMap.set(p.id, p));

  // 2. قراءة الأسعار الحالية المحدثة من Firestore
  const snap = await getDocs(collection(db, 'products'));
  const currentProducts = [];

  let totalUpdated = 0;
  let totalCables = 0;
  let totalUnchanged = 0;

  snap.forEach((d) => {
    const curr = { id: d.id, ...d.data() };
    const orig = origMap.get(d.id) || {};
    const isCable = isCableProduct(curr) || orig.isCable;

    const oldPrice = Number(orig.retailPrice !== undefined ? orig.retailPrice : curr.retailPrice) || 0;
    const newPrice = Number(curr.retailPrice) || 0;
    const diff = newPrice - oldPrice;
    const pct = oldPrice > 0 && diff > 0 ? Math.round((diff / oldPrice) * 100) : 0;

    if (isCable) {
      totalCables++;
    } else if (diff > 0) {
      totalUpdated++;
    } else {
      totalUnchanged++;
    }

    currentProducts.push({
      id: d.id,
      sku: curr.sku || orig.sku || '-',
      name: curr.name || orig.name || 'بدون اسم',
      category: curr.cameraType || curr.category || 'عام',
      isCable,
      oldPrice,
      newPrice,
      diff,
      pct,
    });
  });

  // ترتيب المنتجات: المنتجات التي تغيرت أولاً، ثم الكيبلات
  currentProducts.sort((a, b) => {
    if (a.isCable !== b.isCable) return a.isCable ? 1 : -1;
    return b.diff - a.diff;
  });

  console.log(`📊 إجمالي المنتجات: ${currentProducts.length}`);
  console.log(`📈 منتجات تم رفعها: ${totalUpdated}`);
  console.log(`🔌 كيبلات مستثناة: ${totalCables}`);

  // 3. بناء صفحة HTML أنيقة ومعدة للطباعة بتقنية Vector PDF
  const rowsHtml = currentProducts
    .map((p, idx) => {
      const isCable = p.isCable;
      const statusBadge = isCable
        ? `<span class="badge badge-cable">كيبل (سعر ثابت)</span>`
        : p.diff > 0
        ? `<span class="badge badge-success">+${p.pct}% (مقرب لأعلى 5 آلاف)</span>`
        : `<span class="badge badge-neutral">بدون تغيير</span>`;

      const diffBadge = p.diff > 0
        ? `<span class="diff-positive">+${formatIQD(p.diff)} د.ع</span>`
        : `<span class="diff-zero">—</span>`;

      return `
        <tr class="${isCable ? 'row-cable' : (idx % 2 === 0 ? 'row-even' : '')}">
          <td class="text-center font-bold text-muted">${idx + 1}</td>
          <td class="sku-cell"><code>${p.sku}</code></td>
          <td class="name-cell">${p.name}</td>
          <td class="cat-cell">${p.category}</td>
          <td class="price-cell old-price">${formatIQD(p.oldPrice)} <span class="currency">د.ع</span></td>
          <td class="price-cell new-price">${formatIQD(p.newPrice)} <span class="currency">د.ع</span></td>
          <td class="text-center">${diffBadge}</td>
          <td class="text-center">${statusBadge}</td>
        </tr>
      `;
    })
    .join('');

  const todayStr = new Date().toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير تحديث وتعديل الأسعار - Safe Zone</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 8mm 12mm 8mm;
      @bottom-center {
        content: "صفحة " counter(page) " من " counter(pages);
      }
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1e293b;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.4;
    }
    .header-container {
      border-bottom: 3px solid #C89B3C;
      padding-bottom: 12px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 900;
      color: #0f172a;
      margin: 0;
    }
    .brand-sub {
      color: #64748b;
      font-size: 11px;
      margin-top: 3px;
      font-weight: bold;
    }
    .report-badge-container {
      text-align: left;
    }
    .report-title-badge {
      background: #fdf8ed;
      color: #92400e;
      border: 1px solid #fde68a;
      padding: 4px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 900;
      display: inline-block;
    }
    .report-date {
      color: #64748b;
      font-size: 10px;
      margin-top: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 15px;
    }
    .stat-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 12px;
      background: #f8fafc;
      text-align: center;
    }
    .stat-card.primary {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .stat-card.warning {
      background: #fefce8;
      border-color: #fef08a;
    }
    .stat-label {
      font-size: 10px;
      color: #64748b;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
    }
    .stat-value.green {
      color: #166534;
    }
    .stat-value.gold {
      color: #854d0e;
    }
    .table-container {
      width: 100%;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
      font-size: 10px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      padding: 7px 8px;
      font-weight: 800;
      border: 1px solid #0f172a;
      font-size: 10px;
    }
    td {
      padding: 5px 7px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .row-even {
      background-color: #f8fafc;
    }
    .row-cable {
      background-color: #f1f5f9;
    }
    .sku-cell code {
      font-family: Consolas, monospace;
      font-weight: bold;
      color: #475569;
      font-size: 9.5px;
      background: #e2e8f0;
      padding: 1px 4px;
      border-radius: 4px;
    }
    .name-cell {
      font-weight: 700;
      color: #1e293b;
      max-width: 200px;
    }
    .cat-cell {
      color: #64748b;
      font-size: 9.5px;
    }
    .price-cell {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      text-align: center;
      font-weight: bold;
    }
    .old-price {
      color: #64748b;
      text-decoration: line-through;
    }
    .new-price {
      color: #047857;
      font-size: 11px;
    }
    .currency {
      font-size: 8px;
      color: #94a3b8;
      font-weight: normal;
    }
    .diff-positive {
      color: #15803d;
      font-weight: 800;
      font-size: 10px;
    }
    .diff-zero {
      color: #94a3b8;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: bold;
      white-space: nowrap;
    }
    .badge-success {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }
    .badge-cable {
      background: #e2e8f0;
      color: #475569;
      border: 1px solid #cbd5e1;
    }
    .badge-neutral {
      background: #f1f5f9;
      color: #64748b;
    }
    .text-center { text-align: center; }
    .text-muted { color: #94a3b8; }
    .font-bold { font-weight: bold; }
    .footer-note {
      margin-top: 15px;
      padding: 8px 12px;
      background: #f8fafc;
      border-right: 3px solid #C89B3C;
      font-size: 9px;
      color: #64748b;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- Brand Header -->
  <div class="header-container">
    <div>
      <h1 class="brand-title">Safe Zone | المنطقة الآمنة</h1>
      <div class="brand-sub">📍 بغداد - العراق | نظام إدارة المخزون ونقاط البيع</div>
    </div>
    <div class="report-badge-container">
      <div class="report-title-badge">تقرير تحديث الأسعار (+20% لأعلى 5,000)</div>
      <div class="report-date">${todayStr}</div>
    </div>
  </div>

  <!-- Summary Statistics -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">إجمالي المنتجات</div>
      <div class="stat-value">${currentProducts.length}</div>
    </div>
    <div class="stat-card primary">
      <div class="stat-label">منتجات تم رفع أسعارها</div>
      <div class="stat-value green">${totalUpdated}</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">كيبلات مستثناة (سعر ثابت)</div>
      <div class="stat-value gold">${totalCables}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">معيار التقريب المطبق</div>
      <div class="stat-value" style="font-size: 14px; color: #1e293b;">أعلى 5,000 د.ع</div>
    </div>
  </div>

  <!-- Price Comparison Table -->
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th style="width: 25px; text-align: center;">#</th>
          <th style="width: 80px;">رمز الصنف (SKU)</th>
          <th>اسم المنتج</th>
          <th style="width: 130px;">الفئة / القسم</th>
          <th style="width: 80px; text-align: center;">السعر القديم</th>
          <th style="width: 80px; text-align: center;">السعر الجديد</th>
          <th style="width: 70px; text-align: center;">الفرق</th>
          <th style="width: 120px; text-align: center;">الحالة / المعيار</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <!-- Footer Note -->
  <div class="footer-note">
    <strong>ملاحظة التقرير:</strong> تم احتساب الزيادة بنسبة 20% على سعر البيع المفرد الأصلي مع التقريب دائماً لأعلى 5,000 دينار عراقي (مثال: السعر 35 ألف بعد الزيادة 42 ألف أصبح 45 ألف، والـ 41 ألف تصبح 45 ألف). تم استثناء جميع منتجات الكيبلات ومستلزماتها بالكامل وبقيت بأسعارها دون أي تغيير.
  </div>

</body>
</html>`;

  // 4. حفظ ملف HTML
  const htmlPath = path.resolve('reports/تقرير_تحديث_الاسعار.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`📄 تم حفظ ملف HTML: ${htmlPath}`);

  // 5. تحويل HTML إلى PDF عبر Google Chrome Headless
  const pdfFileName = 'تقرير_تحديث_الاسعار_الجديدة_والقديمة.pdf';
  const pdfPath = path.resolve(`reports/${pdfFileName}`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  if (fs.existsSync(chromePath)) {
    console.log('🖨️ جاري تصدير ملف PDF عالي الدقة عبر Google Chrome Headless...');
    const cmd = `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ تم إنشاء ملف PDF بنجاح: ${pdfPath}`);
    } catch (e) {
      console.warn('تعذر التحويل المباشر عبر كروم، جاري المحاولة عبر Edge...');
      const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
      if (fs.existsSync(edgePath)) {
        const edgeCmd = `"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
        execSync(edgeCmd, { stdio: 'inherit' });
        console.log(`✅ تم إنشاء ملف PDF بنجاح عبر Edge: ${pdfPath}`);
      }
    }
  }

  process.exit(0);
}

generateReport().catch((err) => {
  console.error('❌ خطأ أثناء توليد التقرير:', err);
  process.exit(1);
});
