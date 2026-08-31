/**
 * ⏰ مشغل المهام المجدولة لسيرفر AWS (AWS 24/7 Standalone Cron Runner)
 * يقوم هذا السكريبت بالعمل بشكل متواصل في خلفية سيرفر AWS دون الحاجة لأي موقع وسيط،
 * ويستدعي مهام تذكير الديون والتقارير اليومية والنسخ الاحتياطي تلقائياً.
 */

process.env.TZ = 'Asia/Baghdad';

const APP_URL = process.env.APP_URL || 'https://camera-inventory-five.vercel.app'; // استبدله برابط موقعك على Vercel
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // الفحص كل 5 دقائق

console.log('====================================================');
console.log('🚀 [AWS Cron Runner] تم بدء تشغيل المنبه والكرون التلقائي');
console.log(`🌐 الهدف (App URL): ${APP_URL}`);
console.log(`⏱️ معدل الفحص: كل ${CHECK_INTERVAL_MS / 60000} دقائق`);
console.log(`📍 المنطقة الزمنية: Asia/Baghdad (${new Date().toLocaleString('ar-IQ')})`);
console.log('====================================================\n');

async function triggerEndpoint(path, name) {
  const url = `${APP_URL.replace(/\/+$/, '')}${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AWS-Standalone-Cron-Worker/1.0',
        'x-cron-source': 'aws-server'
      }
    });
    const text = await res.text();
    console.log(`[${new Date().toLocaleTimeString('ar-IQ')}] ✅ تم تنفيذ [${name}] بنجاح (رمز: ${res.status}): ${text.substring(0, 100)}`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString('ar-IQ')}] ❌ خطأ في تنفيذ [${name}]:`, err.message);
  }
}

async function runCronTick() {
  const now = new Date();
  const iraqTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
  const hour = iraqTime.getHours();
  const minute = iraqTime.getMinutes();

  console.log(`[${iraqTime.toLocaleTimeString('ar-IQ')}] 🔍 فحص مواعيد المهام المجدولة...`);

  // 1. تذكير الديون للعملاء المستحقين (يتم فحص العملاء كل دورة)
  await triggerEndpoint('/api/cron-debt-reminders', 'تذكير الديون التلقائي');

  // 2. التقرير اليومي للنواقص والإغلاق (الساعة 8 مساءً)
  if (hour === 20 && minute < 10) {
    await triggerEndpoint('/api/cron-report', 'التقرير اليومي للنواقص');
  }

  // 3. النسخ الاحتياطي التلقائي إلى Google Drive (الساعة 11 ليلاً)
  if (hour === 23 && minute < 10) {
    await triggerEndpoint('/api/google-drive-backup', 'النسخ الاحتياطي التلقائي');
  }
}

// تشغيل فوري للدورة الأولى ثم تكرار دوري
runCronTick();
setInterval(runCronTick, CHECK_INTERVAL_MS);
