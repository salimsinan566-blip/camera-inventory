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

// ترجمة أو توضيح أسماء الأقسام بالعربية
const CATEGORY_NAMES_AR = {
  'IP Cameras': 'كاميرات شبكية (IP Cameras)',
  'Analog AHD & AOC Hybrid Cameras': 'كاميرات المراقبة التناظرية (Analog & AOC Cameras)',
  'Car Cameras': 'كاميرات السيارات (Car Cameras)',
  'NVR Devices': 'أجهزة تسجيل شبكية (NVR Devices)',
  'DVR Devices': 'أجهزة تسجيل تناظرية (DVR Devices)',
  'PoE Switches': 'سويتشات الشبكة (PoE Switches)',
  'PoE Extenders': 'مقويات وموزعات (PoE Extenders)',
  'Power Adapters': 'محولات ومغذيات الطاقة (Power Adapters)',
  'UPS & Backup Power': 'أنظمة ومزودات الطاقة (UPS & Backup Power)',
  'Audio Systems': 'الأنظمة الصوتية والنداء (Audio Systems)',
  'Video Intercom': 'أنظمة الاتصال المرئي (Video Intercom)',
  'Networking Equipment': 'معدات وأجهزة الشبكات (Networking Equipment)',
  'Trank & Pipe': 'الترنكات ومجاري الكابلات (Trank & Pipe)',
  'Video Accessories': 'ملحقات ومحولات الفيديو (Video Accessories)',
  'DOOR LOCK': 'أقفال الأبواب الذكية (DOOR LOCK)',
  'HARD DRIVE': 'أقراص التخزين الصلبة (HARD DRIVE)',
  'Support': 'حوامل وقواعد التثبيت (Support & Brackets)',
  'BOX': 'صناديق التجميع والتوزيع (Junction BOX)',
  'RACK': 'كبائن السيرفر والشبكة (RACK)',
  'KIT': 'أنظمة وبكجات متكاملة (KIT)',
  'Walkie Talkie': 'أجهزة الاتصال اللاسلكي (Walkie Talkie)',
  'RAND': 'أصناف متنوعة (RAND)',
  'أخرى': 'أصناف أخرى متنوعة',
  'الكيبلات ومستلزماتها (Cables & Connectors)': 'الكيبلات والملحقات المدمجة (Cables & Connectors)',
};

async function generateCleanCategorizedReport() {
  console.log('🔄 جاري جلب أحدث بيانات المنتجات من Firestore...');

  // 1. قراءة الأسعار الأصلية من النسخة الاحتياطية
  const backupPath = path.resolve('backups/latest_prices_backup.json');
  if (!fs.existsSync(backupPath)) {
    console.error('❌ ملف النسخة الاحتياطية غير موجود!');
    process.exit(1);
  }
  const originalProducts = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  const origMap = new Map();
  originalProducts.forEach((p) => origMap.set(p.id, p));

  // 2. قراءة الأسعار الحالية المباشرة من Firestore
  const snap = await getDocs(collection(db, 'products'));
  const allProducts = [];

  const MERGED_CABLE_CATEGORY = 'الكيبلات ومستلزماتها (Cables & Connectors)';

  snap.forEach((d) => {
    const curr = { id: d.id, ...d.data() };
    const orig = origMap.get(d.id) || {};

    const isCable = isCableProduct(curr) || isCableProduct(orig) ||
      String(curr.cameraType || '').toLowerCase().includes('cable') ||
      String(curr.cameraType || '').toLowerCase().includes('connector') ||
      String(curr.category || '').toLowerCase().includes('cable') ||
      String(curr.category || '').toLowerCase().includes('connector');

    const finalCategory = isCable ? MERGED_CABLE_CATEGORY : (curr.cameraType || curr.category || 'أخرى');

    const oldPrice = Number(orig.retailPrice !== undefined ? orig.retailPrice : curr.retailPrice) || 0;
    const newPrice = Number(curr.retailPrice) || 0;
    const diff = newPrice - oldPrice;

    allProducts.push({
      id: d.id,
      sku: curr.sku || orig.sku || '-',
      name: curr.name || orig.name || 'بدون اسم',
      category: finalCategory,
      isCable,
      oldPrice,
      newPrice,
      diff,
    });
  });

  // تجميع المنتجات حسب القسم
  const categoryGroups = {};
  allProducts.forEach((p) => {
    if (!categoryGroups[p.category]) {
      categoryGroups[p.category] = [];
    }
    categoryGroups[p.category].push(p);
  });

  // ترتيب الأقسام: وضع قسم الكيبلات المدمج أولاً ثم بقية الأقسام أبجدياً
  const sortedCategories = Object.keys(categoryGroups).sort((a, b) => {
    if (a === MERGED_CABLE_CATEGORY) return -1;
    if (b === MERGED_CABLE_CATEGORY) return 1;
    return a.localeCompare(b, 'ar');
  });

  // بناء جداول الأقسام بدون عمود المعيار
  let sectionsHtml = '';

  sortedCategories.forEach((catKey) => {
    const items = categoryGroups[catKey];
    items.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));

    const isCableCat = catKey === MERGED_CABLE_CATEGORY;
    const catTitle = CATEGORY_NAMES_AR[catKey] || catKey;

    const rows = items
      .map((p, itemIdx) => {
        const diffText = p.diff > 0
          ? `<span class="diff-pos">+${formatIQD(p.diff)} د.ع</span>`
          : p.diff < 0
          ? `<span class="diff-neg">${formatIQD(p.diff)} د.ع</span>`
          : `<span class="diff-zero">—</span>`;

        return `
          <tr class="${p.isCable ? 'row-cable' : (itemIdx % 2 === 0 ? 'row-even' : '')}">
            <td class="text-center font-bold text-muted">${itemIdx + 1}</td>
            <td class="sku-cell"><code>${p.sku}</code></td>
            <td class="name-cell">${p.name}</td>
            <td class="price-cell old-price">${formatIQD(p.oldPrice)} <span class="cur">د.ع</span></td>
            <td class="price-cell new-price">${formatIQD(p.newPrice)} <span class="cur">د.ع</span></td>
            <td class="text-center">${diffText}</td>
          </tr>
        `;
      })
      .join('');

    sectionsHtml += `
      <div class="category-block ${isCableCat ? 'cable-special-block' : ''}">
        <div class="category-header ${isCableCat ? 'cable-header' : ''}">
          <div class="cat-title-wrap">
            <span class="cat-icon">${isCableCat ? '🔌' : '📁'}</span>
            <span class="cat-name">${catTitle}</span>
            ${isCableCat ? '<span class="merged-tag">قسم مدمج يشمل الكيبلات والموصلات</span>' : ''}
          </div>
          <div class="cat-count">عدد المواد: <strong>${items.length}</strong></div>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th style="width: 110px;">رمز الصنف (SKU)</th>
              <th>اسم المنتج</th>
              <th style="width: 110px; text-align: center;">السعر القديم</th>
              <th style="width: 115px; text-align: center;">السعر الجديد</th>
              <th style="width: 105px; text-align: center;">الفرق</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  });

  const htmlDoc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>قائمة الأسعار حسب الأقسام</title>
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
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.4;
    }

    /* Category Section */
    .category-block {
      margin-bottom: 20px;
      page-break-inside: auto;
    }
    .category-header {
      background: #0f172a;
      color: #ffffff;
      padding: 7px 12px;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-after: avoid;
    }
    .cat-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cat-name {
      font-size: 12.5px;
      font-weight: 800;
    }
    .cat-count {
      font-size: 10px;
      color: #cbd5e1;
    }
    .cable-header {
      background: #b45309 !important;
    }
    .merged-tag {
      background: #fef3c7;
      color: #92400e;
      font-size: 9px;
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 9999px;
      margin-right: 6px;
    }

    /* Table Styles */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
      font-size: 10px;
      border: 1px solid #cbd5e1;
    }
    .report-table thead {
      display: table-header-group;
    }
    .report-table tr {
      page-break-inside: avoid;
    }
    .report-table th {
      background: #f1f5f9;
      color: #1e293b;
      padding: 6px 8px;
      font-weight: 800;
      border: 1px solid #cbd5e1;
      font-size: 10px;
    }
    .report-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .row-even {
      background-color: #f8fafc;
    }
    .row-cable {
      background-color: #fefce8;
    }
    .sku-cell code {
      font-family: Consolas, monospace;
      font-weight: bold;
      color: #334155;
      font-size: 9.5px;
      background: #e2e8f0;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .name-cell {
      font-weight: 700;
      color: #0f172a;
    }
    .price-cell {
      white-space: nowrap;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: bold;
    }
    .old-price {
      color: #64748b;
      text-decoration: line-through;
    }
    .new-price {
      color: #047857;
      font-size: 11.5px;
    }
    .cur {
      font-size: 8px;
      color: #94a3b8;
      font-weight: normal;
    }
    .diff-pos {
      color: #15803d;
      font-weight: 800;
      font-size: 10.5px;
    }
    .diff-neg {
      color: #b91c1c;
      font-weight: 800;
    }
    .diff-zero {
      color: #94a3b8;
    }
    .text-center { text-align: center; }
    .text-muted { color: #94a3b8; }
    .font-bold { font-weight: bold; }
  </style>
</head>
<body>

  <!-- Categorized Sections Directly -->
  ${sectionsHtml}

</body>
</html>`;

  // 3. حفظ ملف HTML
  const htmlPath = path.resolve('reports/تقرير_الاسعار_حسب_الاقسام.html');
  fs.writeFileSync(htmlPath, htmlDoc, 'utf-8');
  console.log(`📄 تم حفظ ملف HTML النظيف: ${htmlPath}`);

  // 4. تحويل HTML إلى PDF عالي الدقة عبر Google Chrome Headless
  const pdfFileName = 'تقرير_الاسعار_الشامل_مفصل_حسب_الاقسام.pdf';
  const pdfPath = path.resolve(`reports/${pdfFileName}`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  if (fs.existsSync(chromePath)) {
    console.log('🖨️ جاري تصدير ملف PDF عالي الدقة بدون عنوان ولا بطاقات ولا معيار...');
    const cmd = `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log(`✅ تم إنشاء ملف PDF النظيف بنجاح: ${pdfPath}`);
    } catch (e) {
      console.warn('جاري المحاولة عبر Microsoft Edge...');
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

generateCleanCategorizedReport().catch((err) => {
  console.error('❌ خطأ أثناء توليد التقرير:', err);
  process.exit(1);
});
