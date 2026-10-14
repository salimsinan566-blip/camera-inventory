import fs from 'fs';
import path from 'path';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../src/firebase/config.js';
import { isCableProduct, calculateIncreasedPrice } from '../src/models/product.js';

async function applyPriceIncrease() {
  const backupFile = path.resolve('backups/latest_prices_backup.json');
  if (!fs.existsSync(backupFile)) {
    console.error(`❌ ملف النسخة الاحتياطية غير موجود: ${backupFile}`);
    process.exit(1);
  }

  console.log(`📦 قراءة الأسعار الأصلية قبل الزيادة من النسخة الاحتياطية: ${backupFile}`);
  const baseProducts = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
  console.log(`✅ تم تحميل ${baseProducts.length} منتج بأسعارها الأصلية.`);

  let updatedCount = 0;
  let skippedCablesCount = 0;
  let zeroOrUnchangedCount = 0;
  const updates = [];
  const sampleUpdates = [];

  baseProducts.forEach((prod) => {
    const isCable = prod.isCable || isCableProduct(prod);

    // استثناء الكيبلات تماماً
    if (isCable) {
      skippedCablesCount++;
      return;
    }

    const origRetail = Number(prod.retailPrice) || 0;
    const origWholesale = Number(prod.wholesalePrice) || 0;
    const origClient = Number(prod.clientPrice) || 0;

    let hasChange = false;
    const changedData = {};

    if (origRetail > 0) {
      // تطبيق زيادة 20% والتقريب لأعلى 5,000 (أو 5 للدولار)
      const newRetail = calculateIncreasedPrice(origRetail, false, 20, null);
      if (newRetail !== origRetail) {
        changedData.retailPrice = newRetail;
        hasChange = true;

        if (sampleUpdates.length < 8) {
          sampleUpdates.push({
            sku: prod.sku,
            name: prod.name,
            origPrice: origRetail,
            after20Pct: origRetail * 1.2,
            finalPrice: newRetail,
            diff: newRetail - origRetail,
          });
        }
      }
    }

    // إذا كان هناك سعر عميل أصلي مسجل
    if (origClient > 0) {
      const newClient = calculateIncreasedPrice(origClient, false, 20, null);
      if (newClient !== origClient) {
        changedData.clientPrice = newClient;
        hasChange = true;
      }
    }

    if (hasChange) {
      const wp = origWholesale;
      const targetRetail = changedData.retailPrice !== undefined ? changedData.retailPrice : origRetail;
      if (wp > 0 && targetRetail > 0) {
        changedData.profitMargin = Math.round(((targetRetail - wp) / wp) * 100 * 10) / 10;
      }

      changedData.updatedAt = serverTimestamp();
      updates.push({ id: prod.id, data: changedData });
      updatedCount++;
    } else {
      zeroOrUnchangedCount++;
    }
  });

  console.log(`\n📋 تقرير المعاينة قبل التطبيق:`);
  console.log(`- منتجات سيتم رفعها وتقريبها لأعلى 5,000: ${updatedCount}`);
  console.log(`- منتجات كيبلات مستثناة ومحفوظة بالكامل: ${skippedCablesCount}`);
  console.log(`- منتجات بسعر 0 أو لم تتغير: ${zeroOrUnchangedCount}`);

  console.log(`\n🔍 عينات من الأسعار الجديدة بعد التقريب لأعلى 5 آلاف:`);
  sampleUpdates.forEach((s, idx) => {
    console.log(`  ${idx + 1}. [${s.sku}] ${s.name}:`);
    console.log(`     الأصلي: ${s.origPrice} ➔ بعد 20%: ${s.after20Pct} ➔ المقرب لأعلى 5 آلاف: ${s.finalPrice} (+${s.diff})`);
  });

  // الحفظ على دفعات Firestore Batch
  console.log(`\n💾 جاري إرسال التحديثات إلى قاعدة البيانات...`);
  const BATCH_SIZE = 400;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + BATCH_SIZE);
    chunk.forEach((item) => {
      const ref = doc(db, 'products', item.id);
      batch.update(ref, item.data);
    });
    await batch.commit();
    console.log(`  ✅ تم حفظ دفعة (${chunk.length} منتج) بنجاح.`);
  }

  console.log('\n🎉 اكتمل التحديث بنجاح تام وتم التقريب لأعلى 5 آلاف لجميع المنتجات!');
  process.exit(0);
}

applyPriceIncrease().catch((err) => {
  console.error('❌ خطأ أثناء تطبيق التحديث:', err);
  process.exit(1);
});
