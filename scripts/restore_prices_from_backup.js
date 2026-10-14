import fs from 'fs';
import path from 'path';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../src/firebase/config.js';

async function restoreBackup() {
  const backupFile = process.argv[2] || path.resolve('backups/latest_prices_backup.json');

  if (!fs.existsSync(backupFile)) {
    console.error(`❌ ملف النسخة الاحتياطية غير موجود: ${backupFile}`);
    process.exit(1);
  }

  console.log(`🔄 جاري قراءة النسخة الاحتياطية من: ${backupFile}`);
  const items = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
  console.log(`📦 عدد المنتجات المراد استعادتها: ${items.length}`);

  const BATCH_SIZE = 400;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    chunk.forEach((item) => {
      const ref = doc(db, 'products', item.id);
      batch.update(ref, {
        retailPrice: item.retailPrice,
        wholesalePrice: item.wholesalePrice,
        clientPrice: item.clientPrice,
        vipPrice: item.vipPrice,
      });
    });

    await batch.commit();
    console.log(`✅ تم استرجاع دفعة (${chunk.length} منتج) بنجاح.`);
  }

  console.log('🎉 اكتمل استرجاع جميع الأسعار السابقة بنجاح!');
  process.exit(0);
}

restoreBackup().catch((err) => {
  console.error('❌ خطأ أثناء الاسترجاع:', err);
  process.exit(1);
});
