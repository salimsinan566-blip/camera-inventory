import { db } from './firebase-admin.js';
import * as XLSX from 'xlsx';

// دالة لتوحيد بيانات المنتج القديمة والجديدة وحساب الكميات بدقة
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

export default async function handler(req, res) {
  try {
    const settingsDoc = await db.collection('settings').doc('bot_config').get();
    let targetHour = 20; // Default to 8 PM (20:00)
    let targetMinute = 0;
    
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      if (data.reportHour !== undefined) targetHour = data.reportHour;
      if (data.reportMinute !== undefined) targetMinute = data.reportMinute;
    }

    const iraqTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Baghdad"});
    const currentHour = new Date(iraqTime).getHours();
    const currentMinute = new Date(iraqTime).getMinutes();
    
    // YYYY-MM-DD
    const [month, day, year] = new Date(iraqTime).toLocaleDateString("en-US").split('/');
    const todayStr = `${year}-${month}-${day}`;
    
    const force = req.query.force === 'true';
    
    if (!force) {
      const isTargetHour = currentHour === targetHour;
      const isWithinWindow = currentMinute >= targetMinute && currentMinute < targetMinute + 10;
      
      if (!isTargetHour || !isWithinWindow) {
        return res.status(200).send(`OK - Skipped. Target: ${targetHour}:${targetMinute}, Current: ${currentHour}:${currentMinute}`);
      }
      
      const lastRunStr = settingsDoc.exists ? settingsDoc.data().lastRunDate : null;
      if (lastRunStr === todayStr) {
        return res.status(200).send('Already ran today');
      }
    }
    
    await db.collection('settings').doc('bot_config').set({ lastRunDate: todayStr }, { merge: true });

    // Check Automated Scheduled Google Drive Backup
    try {
      const driveDoc = await db.collection('settings').doc('google_drive_config').get();
      if (driveDoc.exists) {
        const driveData = driveDoc.data();
        if (driveData.autoDailyBackup) {
          const bHour = driveData.backupHour ?? 23;
          const bMin = driveData.backupMinute ?? 0;
          const isDriveHour = currentHour === bHour;
          const isDriveWin = currentMinute >= bMin && currentMinute < bMin + 10;
          const lastDriveDate = driveData.lastRunDate;
          
          if (force || (isDriveHour && isDriveWin && lastDriveDate !== todayStr)) {
            await db.collection('settings').doc('google_drive_config').set({ lastRunDate: todayStr }, { merge: true });
            const driveHandler = (await import('./google-drive-backup.js')).default;
            const fakeReq = { body: { trigger: 'cron', date: new Date().toISOString() } };
            const fakeRes = { status() { return this; }, json() {}, send() {} };
            await driveHandler(fakeReq, fakeRes);
          }
        }
      }
    } catch (driveErr) {
      console.error('Automated Scheduled Drive Backup Error:', driveErr);
    }

    const productsSnapshot = await db.collection('products').get();
    const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...normalizeProduct(doc.data()) }));

    const shortages = products.filter(p => {
      const total = p.storeQty + p.warehouseQty;
      const limit = p.storeMinThreshold + p.warehouseMinThreshold;
      return total <= limit;
    });

    const token = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.VITE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
      console.error('Missing telegram credentials in env');
      return res.status(500).send('Missing Env');
    }

    if (shortages.length === 0) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ المخزون في حالة ممتازة اليوم، لا توجد أي نواقص.',
          parse_mode: 'HTML'
        })
      });
      return res.status(200).send('OK - No shortages');
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
          'سعر الجملة ($)': p.wholesalePrice || 0,
          'سعر المفرد ($)': p.retailPrice || 0
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!dir'] = 'rtl';
      ws['!cols'] = [
        { wch: 45 }, // اسم المنتج
        { wch: 20 }, // رقم الصنف (SKU)
        { wch: 18 }, // الحالة
        { wch: 15 }, // الكمية الحالية
        { wch: 15 }, // الكمية في المحل
        { wch: 15 }, // الكمية في المخزن
        { wch: 18 }, // الحد الأدنى للمحل
        { wch: 18 }, // الحد الأدنى للمخزن
        { wch: 15 }, // سعر الجملة ($)
        { wch: 15 }  // سعر المفرد ($)
      ];

      let safeCatName = cat.replace(/[\[\]\*\?\/\\:]/g, '').substring(0, 31);
      if (!safeCatName) safeCatName = 'Sheet';
      
      if (wb.SheetNames.includes(safeCatName)) {
        safeCatName = safeCatName.substring(0, 28) + ' ' + Math.floor(Math.random()*10);
      }

      XLSX.utils.book_append_sheet(wb, ws, safeCatName);
    }
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', blob, 'Daily_Shortages_Report.xlsx');
    formData.append('caption', '📊 التقرير اليومي للنواقص مرفق كملف إكسل (Excel).\n\n<i>تم توليد التقرير تلقائياً.</i> 📦');

    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    return res.status(200).send('Report sent');
  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).send('Error running cron');
  }
}
