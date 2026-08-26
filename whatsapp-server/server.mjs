process.env.TZ = 'Asia/Baghdad';
import express from 'express';
import cors from 'cors';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'SafeZone2026';
const AUTH_DIR = path.join(__dirname, 'auth_session');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Server State
let sock = null;
let currentQR = null;
let qrDataUrl = null;
let isConnected = false;
let connectedPhone = '';
let connectedName = '';
let connectionStatus = 'initializing'; // 'initializing' | 'qr_ready' | 'connected' | 'disconnected'
let reconnectAttempts = 0;

// Logger
const logger = pino({ level: 'silent' });

// Cache for sent messages to resolve WhatsApp E2E encryption retry requests
const sentMessagesStore = new Map();

// Helper: store every sent message so WhatsApp can retry E2E encryption
function storeOutgoingMessage(result, content) {
  try {
    const msgId = result?.key?.id;
    if (msgId && content) {
      sentMessagesStore.set(msgId, content);
      // Auto-cleanup: keep max 500 messages, remove oldest if exceeded
      if (sentMessagesStore.size > 500) {
        const firstKey = sentMessagesStore.keys().next().value;
        sentMessagesStore.delete(firstKey);
      }
    }
  } catch (e) { /* ignore */ }
}

async function initWhatsApp() {
  connectionStatus = 'connecting';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    generateHighQualityLinkPreview: false,
    browser: ['SafeZone POS', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    getMessage: async (key) => {
      if (key?.id && sentMessagesStore.has(key.id)) {
        return sentMessagesStore.get(key.id);
      }
      return undefined;
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      connectionStatus = 'qr_ready';
      try {
        qrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 7 });
        const qrTerminal = await qrcode.toString(qr, { type: 'terminal', small: true });
        console.log('\n======================================================');
        console.log('⚡ [WhatsApp] امسح رمز الـ QR Code التالي من هاتفك:');
        console.log('======================================================\n');
        console.log(qrTerminal);
        console.log('======================================================\n');
      } catch (err) {
        console.error('Failed to generate QR data URL:', err);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      connectionStatus = 'connected';
      currentQR = null;
      qrDataUrl = null;
      reconnectAttempts = 0;

      const user = sock.user;
      connectedPhone = user?.id ? user.id.split(':')[0] : '';
      connectedName = user?.name || 'Safe Zone Store';
      console.log(`✅ [WhatsApp] تم الاتصال بنجاح بالرقم: +${connectedPhone} (${connectedName})`);
    }

    if (connection === 'close') {
      isConnected = false;
      connectedPhone = '';
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      console.log(`⚠️ [WhatsApp] انقطع الاتصال (السبب: ${statusCode || 'unknown'}). إعادة الاتصال: ${shouldReconnect}`);

      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(reconnectAttempts * 2000, 10000);
        connectionStatus = 'reconnecting';
        setTimeout(() => {
          initWhatsApp();
        }, delay);
      } else {
        connectionStatus = 'disconnected';
        console.log('🔴 تم تسجيل الخروج من الواتساب. يرجى مسح الـ QR Code مجدداً.');
        // Clean session
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {}
        initWhatsApp();
      }
    }
  });
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// 1. Status API
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    status: connectionStatus,
    phone: connectedPhone,
    name: connectedName,
    qrAvailable: Boolean(currentQR),
    timestamp: new Date().toISOString(),
  });
});

// 2. Send Chat Message API (Compatible with UltraMsg / Generic REST)
app.post('/messages/chat', async (req, res) => {
  const token = req.body?.token || req.query?.token || req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const to = req.body?.to || req.body?.phone;
  const body = req.body?.body || req.body?.message || req.body?.text;

  // Verify Token if configured
  if (AUTH_TOKEN && token && token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'رمز الأمان (Token) غير صحيح' });
  }

  if (!isConnected || !sock) {
    return res.status(503).json({
      error: 'خادم الواتساب غير متصل حالياً بالهاتف. يرجى مسح رمز الـ QR Code من لوحة التحكم.',
      status: connectionStatus,
    });
  }

  if (!to || !body) {
    return res.status(400).json({ error: 'يرجى إرسال رقم الهاتف (to) ونص الرسالة (body)' });
  }

  let cleanPhone = String(to).replace(/[^\d]/g, '').trim();
  if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
    cleanPhone = '964' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
    cleanPhone = '964' + cleanPhone;
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  const delayMinutes = req.body?.delayMinutes !== undefined ? Number(req.body.delayMinutes) : 0;
  const delaySeconds = req.body?.delaySeconds !== undefined ? Number(req.body.delaySeconds) : 0;
  const sendAt = req.body?.sendAt;

  // Calculate target scheduling time
  let targetTimestamp = null;
  if (sendAt) {
    targetTimestamp = new Date(sendAt).getTime();
  } else if (delayMinutes > 0) {
    targetTimestamp = Date.now() + delayMinutes * 60 * 1000;
  } else if (delaySeconds > 0) {
    targetTimestamp = Date.now() + delaySeconds * 1000;
  }

  // Handle scheduled dispatch
  if (targetTimestamp && targetTimestamp > Date.now() + 3000) {
    const jobId = `job_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newJob = {
      id: jobId,
      type: 'chat',
      cleanPhone,
      jid,
      body: String(body),
      scheduledAt: new Date(targetTimestamp).toISOString(),
      targetTimestamp,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const jobs = loadScheduledJobs();
    jobs.push(newJob);
    saveScheduledJobs(jobs);

    const diffMins = Math.max(1, Math.round((targetTimestamp - Date.now()) / 60000));
    console.log(`⏳ [Scheduler] تمت جدولة رسالة نصية إلى +${cleanPhone} في: ${newJob.scheduledAt} (بعد ${diffMins} دقيقة)`);

    return res.json({
      sent: 'scheduled',
      scheduled: true,
      jobId,
      scheduledAt: newJob.scheduledAt,
      targetTimestamp,
      to: cleanPhone,
      message: `تم جدولة إرسال الرسالة بنجاح في ${new Date(targetTimestamp).toLocaleTimeString('ar-IQ')} (بعد ${diffMins} دقيقة)`
    });
  }

  try {
    const result = await sock.sendMessage(jid, { text: String(body) });
    storeOutgoingMessage(result, { text: String(body) });
    console.log(`📤 [WhatsApp] تم إرسال رسالة بنجاح إلى: +${cleanPhone}`);
    return res.json({
      sent: 'true',
      message: 'تم إرسال الرسالة بنجاح',
      id: result?.key?.id,
      to: cleanPhone,
    });
  } catch (err) {
    console.error(`❌ [WhatsApp] فشل الإرسال إلى ${cleanPhone}:`, err);
    return res.status(500).json({
      error: err.message || 'فشل إرسال الرسالة عبر الواتساب',
      sent: 'false',
    });
  }
});

const SCHEDULED_FILE = path.join(__dirname, 'scheduled_messages.json');

// In-flight locks to prevent concurrent executions of the same job or interval
const inFlightJobIds = new Set();
let isSchedulerRunning = false;
let isAwsCronRunning = false;
const recentlySentCustomerMap = new Map(); // customerId/phone -> timestamp

function loadScheduledJobs() {
  try {
    if (fs.existsSync(SCHEDULED_FILE)) {
      const data = fs.readFileSync(SCHEDULED_FILE, 'utf8');
      const raw = data ? JSON.parse(data) : [];
      // تنظيف واستبعاد أي مهام ديون — تدار حصرياً عبر المحرك السحابي
      return raw.filter(j => !j.isDebtReminder && !j.id?.startsWith('debt_sched_') && !j.id?.startsWith('job_debt_') && !j.id?.startsWith('debtor_'));
    }
  } catch (e) {
    console.warn('Failed to read scheduled jobs:', e.message);
  }
  return [];
}

function saveScheduledJobs(jobs) {
  try {
    const tmpFile = `${SCHEDULED_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(jobs || [], null, 2), 'utf8');
    fs.renameSync(tmpFile, SCHEDULED_FILE);
  } catch (e) {
    try {
      fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs || [], null, 2), 'utf8');
    } catch (writeErr) {
      console.error('Failed to save scheduled jobs:', writeErr.message);
    }
  }
}

async function generateNativePdfFromHtml(htmlContent) {
  const browserPath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
        ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        : null);

  if (!browserPath) {
    throw new Error('لم يتم العثور على متصفح Chrome أو Edge لتوليد الـ PDF');
  }

  const tempId = `inv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const tempHtmlPath = path.join(__dirname, `${tempId}.html`);
  const tempPdfPath = path.join(__dirname, `${tempId}.pdf`);

  let distCss = '';
  try {
    const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');
    if (fs.existsSync(distAssetsDir)) {
      const files = fs.readdirSync(distAssetsDir);
      const cssFile = files.find(f => f.endsWith('.css'));
      if (cssFile) {
        distCss = fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf8');
      }
    }
  } catch (e) {
    console.warn('Could not read dist CSS:', e);
  }

  let fullHtml = htmlContent;
  fullHtml = fullHtml.replace(/body\s*>\s*:not\(#print-portal\)\s*\{[^}]*\}/gi, '');
  fullHtml = fullHtml.replace(/@media print\s*\{[^}]*\}/gi, '');

  if (distCss && !fullHtml.includes(distCss.substring(0, 50))) {
    fullHtml = fullHtml.replace('</head>', `<style>\n${distCss}\n</style>\n</head>`);
  }

  fs.writeFileSync(tempHtmlPath, fullHtml, 'utf8');

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${tempPdfPath}`,
    `file:///${tempHtmlPath.replace(/\\/g, '/')}`
  ];

  await new Promise((resolve, reject) => {
    execFile(browserPath, args, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  if (fs.existsSync(tempPdfPath)) {
    const buffer = fs.readFileSync(tempPdfPath);
    try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
    try { fs.unlinkSync(tempPdfPath); } catch (e) {}
    return buffer;
  }
  throw new Error('تعذر إنشاء ملف الـ PDF عبر محرك المتصفح');
}

// Cleanup old debt reminders from queue (delegated to Engine 2)
(function cleanupOldDebtReminders() {
  try {
    const jobs = loadScheduledJobs();
    const filtered = jobs.filter(j => !j.isDebtReminder && !j.id?.startsWith('debt_sched_') && !j.id?.startsWith('job_debt_') && !j.id?.startsWith('debtor_'));
    saveScheduledJobs(filtered);
    if (filtered.length !== jobs.length) {
      console.log(`🧹 [Cleanup] تم تنظيف ${jobs.length - filtered.length} مهام ديون قديمة من الطابور المحلي نهائياً.`);
    }
  } catch (e) {}
})();

// Background scheduler interval runner (Single-instance mutex with in-flight lock)
setInterval(async () => {
  if (isSchedulerRunning || !isConnected || !sock) return;
  isSchedulerRunning = true;

  try {
    const jobs = loadScheduledJobs();
    const now = Date.now();
    let changed = false;

    for (const job of jobs) {
      // تخطي مهام تذكيرات الديون — يتولاها المحرك السحابي (AWS Cron → Vercel) حصرياً لمنع التكرار
      if (job.isDebtReminder || job.id?.startsWith('job_debt_') || job.id?.startsWith('debt_sched_')) {
        continue;
      }
      if (job.status === 'pending' && job.targetTimestamp <= now && !inFlightJobIds.has(job.id)) {
        inFlightJobIds.add(job.id);
        job.status = 'processing';
        changed = true;
        saveScheduledJobs(jobs);

        try {
          let docBuffer = null;
          if (job.htmlContent) {
            docBuffer = await generateNativePdfFromHtml(job.htmlContent);
          }
          if (!docBuffer && (job.documentDataBase64 || job.document || job.file || job.pdf)) {
            const rawData = job.documentDataBase64 || job.document || job.file || job.pdf;
            const base64 = typeof rawData === 'string' && rawData.includes(',') ? rawData.split(',')[1] : rawData;
            docBuffer = Buffer.from(base64, 'base64');
          }

          if (job.type === 'document') {
            if (!docBuffer) {
              throw new Error('تعذر توليد أو استخراج ملف الـ PDF للمهمة المجدولة');
            }
            const docContent = { document: docBuffer, mimetype: job.mimetype || 'application/pdf', fileName: job.filename || 'invoice.pdf', caption: job.caption || undefined };
            const docResult = await sock.sendMessage(job.jid, docContent);
            storeOutgoingMessage(docResult, docContent);
            console.log(`⏰ [Scheduler] تم إرسال المستند المجدول بنجاح إلى: +${job.cleanPhone} (${job.filename})`);
          } else if (job.type === 'chat' && job.body) {
            const chatResult = await sock.sendMessage(job.jid, { text: job.body });
            storeOutgoingMessage(chatResult, { text: job.body });
            console.log(`⏰ [Scheduler] تم إرسال الرسالة المجدولة بنجاح إلى: +${job.cleanPhone}`);
          }

          if (job.isRecurring && job.schedule) {
            const nextTarget = calculateNextScheduledTimestamp(job.schedule, job.timeStr || '20:00', new Date(), true);
            const safeNextTarget = Math.max(nextTarget, Date.now() + 60 * 1000);
            job.targetTimestamp = safeNextTarget;
            job.targetTimeFormatted = new Date(safeNextTarget).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
            job.status = 'pending';
            job.lastSentAt = new Date().toISOString();
            console.log(`🔁 [Scheduler] تم تجديد التذكير الدوري تلقائياً للموعد القادم: ${job.targetTimeFormatted}`);
          } else {
            job.status = 'completed';
            job.sentAt = new Date().toISOString();
          }
        } catch (err) {
          console.error(`❌ [Scheduler] فشل إرسال المهمة المجدولة (${job.id}):`, err);
          job.status = 'failed';
          job.error = err.message;
        } finally {
          inFlightJobIds.delete(job.id);
          changed = true;
        }
      }
    }

    // Merge and cleanup old records (keep pending & recurring jobs indefinitely)
    if (changed) {
      const freshJobs = loadScheduledJobs();
      const updatedMap = new Map(jobs.map(j => [j.id, j]));
      const merged = freshJobs.map(j => updatedMap.get(j.id) || j);
      const filtered = merged.filter(j => j.status === 'pending' || j.isRecurring || (Date.now() - new Date(j.createdAt || Date.now()).getTime()) < 3600 * 1000);
      saveScheduledJobs(filtered);
    }
  } catch (loopErr) {
    console.error('Error in scheduler loop:', loopErr);
  } finally {
    isSchedulerRunning = false;
  }
}, 3000);

// Synchronize all active debtor schedules directly to AWS Gateway queue (24/7 autonomous background engine)
app.post('/scheduled/sync-debtors', (req, res) => {
  // تم تعطيل هذه الدالة محلياً والاعتماد كلياً على المحرك السحابي في Vercel (Engine 2)
  res.json({ success: true, count: 0, syncedDebtors: 0, message: 'Delegated to Vercel Engine' });
});

// Automated 24/7 Debt Reminder Cron Trigger on AWS Server (Runs every 5 minutes with strict mutex and deduplication)
setInterval(async () => {
  if (isAwsCronRunning || !isConnected || !sock) return;
  isAwsCronRunning = true;

  try {
    const baseUrl = process.env.CRON_DEBT_URL || 'https://camera-inventory-1qfh.vercel.app/api/cron-debt-reminders';
    const cronUrl = `${baseUrl}?returnOnly=true`;
    
    const res = await fetch(cronUrl);
    const data = await res.json().catch(() => ({}));
    
    if (data?.results && data.results.length > 0) {
      console.log(`⏰ [AWS 24/7 Cron] جلب ${data.results.length} تذكيرات مستحقة للإرسال...`);
      const sentIds = [];
      const nowTs = Date.now();
      
      for (const item of data.results) {
        if (!item.phone || !item.message) continue;
        
        // حماية مزدوجة: بالمعرف + برقم الهاتف لمنع إرسال أكثر من رسالة لنفس الشخص
        const dedupeKey = item.id || item.phone;
        const phoneKey = `phone_${String(item.phone).replace(/[^\d]/g, '')}`;
        
        const lastSentById = recentlySentCustomerMap.get(dedupeKey);
        const lastSentByPhone = recentlySentCustomerMap.get(phoneKey);
        const lastSentLocal = lastSentById || lastSentByPhone;
        
        // منع تكرار الإرسال لنفس العميل أو نفس الرقم خلال 55 دقيقة
        if (lastSentLocal && (nowTs - lastSentLocal < 55 * 60 * 1000)) {
          console.log(`⏭️ [AWS 24/7 Cron] تخطي التذكير للعميل «${item.name}» لأنه أُرسل مؤخراً (${Math.round((nowTs - lastSentLocal) / 1000)} ثانية مضت)`);
          continue;
        }

        const jid = `${item.phone}@s.whatsapp.net`;
        try {
          const debtResult = await sock.sendMessage(jid, { text: item.message });
          storeOutgoingMessage(debtResult, { text: item.message });
          // تسجيل الإرسال بالمعرف وبالهاتف معاً
          recentlySentCustomerMap.set(dedupeKey, Date.now());
          recentlySentCustomerMap.set(phoneKey, Date.now());
          console.log(`🚀 [AWS 24/7 Cron] تم إرسال التذكير بنجاح للعميل «${item.name}»`);
          if (item.id) sentIds.push(item.id);
        } catch (err) {
          console.error(`❌ [AWS 24/7 Cron] فشل إرسال التذكير للعميل «${item.name}»:`, err.message);
        }
        await new Promise(r => setTimeout(r, 1200));
      }
      
      // Mark as sent in Firebase to confirm and prevent duplicates
      if (sentIds.length > 0) {
        try {
          await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markSent: sentIds })
          });
        } catch (markErr) {
          console.error('Failed to mark sent in Firebase:', markErr);
        }
      }
    } else if (data?.status === 'success' || data?.sentCount > 0) {
      console.log(`⏰ [AWS 24/7 Cron] حالة التذكيرات:`, data);
    }

    // تنظيف الكاش المحلي للتذكيرات الأقدم من ساعة
    for (const [key, timestamp] of recentlySentCustomerMap.entries()) {
      if (Date.now() - timestamp > 60 * 60 * 1000) {
        recentlySentCustomerMap.delete(key);
      }
    }
  } catch (e) {
    // Ignore network timeouts
  } finally {
    isAwsCronRunning = false;
  }
}, 5 * 60 * 1000);

// Get scheduled queue
app.get('/scheduled', (req, res) => {
  const jobs = loadScheduledJobs();
  res.json({
    count: jobs.length,
    pending: jobs.filter(j => j.status === 'pending'),
    jobs
  });
});

// Clear all scheduled jobs from queue
app.all('/scheduled/clear-all', (req, res) => {
  saveScheduledJobs([]);
  console.log('🗑️ [Scheduler] تم إفراغ طابور الرسائل المجدولة بالكامل');
  res.json({ success: true, message: 'تم إفراغ طابور الرسائل المجدولة بالكامل' });
});

// Cancel scheduled job
app.delete('/scheduled/:id', (req, res) => {
  const { id } = req.params;
  const jobs = loadScheduledJobs();
  const nextJobs = jobs.filter(j => 
    j.id !== id && 
    j.customerId !== id && 
    j.id !== `job_debt_${id}` && 
    j.id !== `debtor_${id}` &&
    j.id !== `debt_sched_${id}`
  );
  saveScheduledJobs(nextJobs);
  console.log(`🗑️ [Scheduler] تم حذف وإلغاء المهمة (${id}) من طابور السيرفر بنجاح`);
  res.json({ success: true, message: 'تم إلغاء الرسالة المجدولة بنجاح' });
});

// Force immediate dispatch of scheduled job
app.post('/scheduled/:id/send-now', async (req, res) => {
  const { id } = req.params;
  const jobs = loadScheduledJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'المهمة غير موجودة في الطابور' });

  if (inFlightJobIds.has(id) || job.status === 'processing') {
    return res.status(409).json({ error: 'المهمة قيد الإرسال بالفعل حالياً' });
  }

  if (job.status === 'completed') {
    return res.status(400).json({ error: 'تم إرسال المهمة مسبقاً' });
  }

  if (!isConnected || !sock) {
    return res.status(503).json({ error: 'خادم الواتساب غير متصل حالياً بالهاتف' });
  }

  inFlightJobIds.add(id);
  job.status = 'processing';
  saveScheduledJobs(jobs);

  try {
    let docBuffer = null;
    if (job.htmlContent) {
      docBuffer = await generateNativePdfFromHtml(job.htmlContent);
    }
    if (!docBuffer && (job.documentDataBase64 || job.document || job.file || job.pdf)) {
      const rawData = job.documentDataBase64 || job.document || job.file || job.pdf;
      const base64 = typeof rawData === 'string' && rawData.includes(',') ? rawData.split(',')[1] : rawData;
      docBuffer = Buffer.from(base64, 'base64');
    }

    if (job.type === 'document') {
      if (!docBuffer) {
        throw new Error('تعذر توليد أو استخراج ملف الـ PDF للمهمة المجدولة');
      }
      const docContent = { document: docBuffer, mimetype: job.mimetype || 'application/pdf', fileName: job.filename || 'invoice.pdf', caption: job.caption || '' };
      const docResult = await sock.sendMessage(job.jid, docContent);
      storeOutgoingMessage(docResult, docContent);
    } else if (job.type === 'chat' && job.body) {
      const chatResult = await sock.sendMessage(job.jid, { text: job.body });
      storeOutgoingMessage(chatResult, { text: job.body });
    }

    if (job.isRecurring && job.schedule) {
      const nextTarget = calculateNextScheduledTimestamp(job.schedule, job.timeStr || '20:00', new Date(), true);
      const safeNextTarget = Math.max(nextTarget, Date.now() + 60 * 1000);
      job.targetTimestamp = safeNextTarget;
      job.targetTimeFormatted = new Date(safeNextTarget).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
      job.status = 'pending';
      job.lastSentAt = new Date().toISOString();
      console.log(`⚡🔁 [Scheduler] تم إرسال المهمة المجدولة فوراً وتجديد موعدها الدوري القادم: ${job.targetTimeFormatted}`);
    } else {
      job.status = 'completed';
      job.sentAt = new Date().toISOString();
    }
    saveScheduledJobs(jobs);

    console.log(`⚡ [Scheduler] تم إرسال المهمة المجدولة فوراً بطلب يدوي (${job.id}) إلى: +${job.cleanPhone}`);
    return res.json({ success: true, message: 'تم إرسال الرسالة فوراً بنجاح 🚀' });
  } catch (err) {
    console.error(`❌ [Scheduler] فشل إرسال المهمة يدوياً:`, err.message);
    job.status = 'failed';
    job.error = err.message;
    saveScheduledJobs(jobs);
    return res.status(500).json({ error: err.message || 'فشل إرسال الرسالة' });
  } finally {
    inFlightJobIds.delete(id);
  }
});

// Calculate next scheduled occurrence
function calculateNextScheduledTimestamp(schedCode, timeStr = '20:00', now = new Date(), isRenewal = false) {
  // 0. Minute Schedules (e.g. minutely_15, minutely_30)
  if (schedCode.startsWith('minutely_') || (schedCode.startsWith('custom_') && (schedCode.includes('_mins') || schedCode.includes('_min')))) {
    const intervalMinutes = parseInt(schedCode.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
    return now.getTime() + intervalMinutes * 60 * 1000;
  }

  // 0.1 Hourly Schedules (e.g. hourly_1, hourly_2)
  if (schedCode.startsWith('hourly_') || (schedCode.startsWith('custom_') && schedCode.includes('_hours'))) {
    const intervalHours = parseInt(schedCode.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2;
    return now.getTime() + intervalHours * 60 * 60 * 1000;
  }

  const [hStr, mStr] = String(timeStr).split(':');
  const targetH = parseInt(hStr || '20', 10);
  const targetM = parseInt(mStr || '0', 10);

  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH, targetM, 0, 0);
  const diffFromCandidate = now.getTime() - candidate.getTime();

  // If NOT a renewal, and inside active window (current minute up to 10 minutes past), fire right now!
  if (!isRenewal && diffFromCandidate >= 0 && diffFromCandidate <= 10 * 60 * 1000) {
    return now.getTime();
  }

  // 1. Daily / Custom 1 Days
  if (schedCode === 'custom_1_days' || schedCode === 'daily' || schedCode.startsWith('custom_1_')) {
    if (!isRenewal && candidate.getTime() > now.getTime()) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + 1);
    return candidate.getTime();
  }

  // 2. Day of week
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  if (DAYS.includes(schedCode) || schedCode === 'default') {
    const targetDayIndex = DAYS.indexOf(schedCode === 'default' ? 'thursday' : schedCode);
    let daysAhead = (targetDayIndex - now.getDay() + 7) % 7;
    if (daysAhead === 0 && (isRenewal || candidate.getTime() <= now.getTime())) {
      daysAhead = 7;
    }
    candidate.setDate(now.getDate() + daysAhead);
    return candidate.getTime();
  }

  // 3. Monthly (e.g. monthly_8)
  if (schedCode.startsWith('monthly_')) {
    const targetDay = parseInt(schedCode.replace('monthly_', ''), 10) || 1;
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();
    
    if (isRenewal || (now.getDate() > targetDay) || (now.getDate() === targetDay && (now.getHours() > targetH || (now.getHours() === targetH && now.getMinutes() >= targetM)))) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }
    
    // Clamp to valid max days in target month
    const maxDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const safeDay = Math.min(targetDay, maxDaysInMonth);
    const monthlyCandidate = new Date(targetYear, targetMonth, safeDay, targetH, targetM, 0, 0);
    return monthlyCandidate.getTime();
  }

  // 4. Custom N days
  if (schedCode.startsWith('custom_')) {
    const n = parseInt(schedCode.replace('custom_', '').replace('_days', ''), 10) || 7;
    if (!isRenewal && candidate.getTime() > now.getTime()) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + n);
    return candidate.getTime();
  }

  // 5. Fallback for unrecognized schedules
  if (isRenewal || candidate.getTime() <= now.getTime()) {
    // Default to at least tomorrow to prevent infinite 1-minute retry loops
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

// Sync and schedule automated customer debt reminders
app.post('/reminders/sync', async (req, res) => {
  // تم تعطيل الإضافة للطابور المحلي والاعتماد كلياً على المحرك السحابي في Vercel
  return res.json({
    success: true,
    dispatchedImmediateCount: 0,
    dispatchedImmediate: [],
    registeredScheduledCount: 0,
    registeredScheduled: [],
    message: 'Delegated to Vercel Engine'
  });
});

// 3. Send Document / PDF File API
app.post('/messages/document', async (req, res) => {
  const token = req.body?.token || req.query?.token || req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const to = req.body?.to || req.body?.phone;
  const documentData = req.body?.document || req.body?.file || req.body?.pdf;
  const htmlContent = req.body?.html;
  const filename = req.body?.filename || req.body?.fileName || 'invoice.pdf';
  const mimetype = req.body?.mimetype || 'application/pdf';
  const caption = req.body?.caption || req.body?.body || req.body?.message || '';
  
  const delayMinutes = req.body?.delayMinutes !== undefined ? Number(req.body.delayMinutes) : 0;
  const delaySeconds = req.body?.delaySeconds !== undefined ? Number(req.body.delaySeconds) : 0;
  const sendAt = req.body?.sendAt;

  // Verify Token
  if (AUTH_TOKEN && token && token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'رمز الأمان (Token) غير صحيح' });
  }

  if (!isConnected || !sock) {
    return res.status(503).json({
      error: 'خادم الواتساب غير متصل حالياً بالهاتف.',
      status: connectionStatus,
    });
  }

  if (!to || (!documentData && !htmlContent)) {
    return res.status(400).json({ error: 'يرجى تزويد رقم الهاتف (to) وملف المستند (document أو html)' });
  }

  let cleanPhone = String(to).replace(/[^\d]/g, '').trim();
  if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
    cleanPhone = '964' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
    cleanPhone = '964' + cleanPhone;
  }

  const jid = `${cleanPhone}@s.whatsapp.net`;

  // Calculate target scheduling time
  let targetTimestamp = null;
  if (sendAt) {
    targetTimestamp = new Date(sendAt).getTime();
  } else if (delayMinutes > 0) {
    targetTimestamp = Date.now() + delayMinutes * 60 * 1000;
  } else if (delaySeconds > 0) {
    targetTimestamp = Date.now() + delaySeconds * 1000;
  }

  // Handle scheduled dispatch
  if (targetTimestamp && targetTimestamp > Date.now() + 3000) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const newJob = {
      id: jobId,
      type: 'document',
      cleanPhone,
      jid,
      filename,
      mimetype,
      caption,
      htmlContent,
      documentDataBase64: typeof documentData === 'string' ? documentData : null,
      scheduledAt: new Date(targetTimestamp).toISOString(),
      targetTimestamp,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const jobs = loadScheduledJobs();
    jobs.push(newJob);
    saveScheduledJobs(jobs);

    const diffMins = Math.max(1, Math.round((targetTimestamp - Date.now()) / 60000));
    console.log(`⏳ [Scheduler] تمت جدولة إرسال ملف (${filename}) إلى +${cleanPhone} في: ${newJob.scheduledAt} (بعد ${diffMins} دقيقة)`);

    return res.json({
      sent: 'scheduled',
      scheduled: true,
      jobId,
      scheduledAt: newJob.scheduledAt,
      targetTimestamp,
      to: cleanPhone,
      message: `تم جدولة إرسال الفاتورة بنجاح في ${new Date(targetTimestamp).toLocaleTimeString('ar-IQ')} (بعد ${diffMins} دقيقة)`
    });
  }

  try {
    let buffer;

    // A) If HTML is sent, generate 100% pixel-perfect native PDF via Chrome / Edge print engine
    if (htmlContent) {
      buffer = await generateNativePdfFromHtml(htmlContent);
    }

    // B) If buffer not generated from HTML, parse base64 / url / binary
    if (!buffer && documentData) {
      if (typeof documentData === 'string' && documentData.startsWith('data:')) {
        const base64Part = documentData.split(',')[1];
        buffer = Buffer.from(base64Part, 'base64');
      } else if (typeof documentData === 'string' && /^https?:\/\//i.test(documentData)) {
        const response = await fetch(documentData);
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else if (typeof documentData === 'string') {
        buffer = Buffer.from(documentData, 'base64');
      } else {
        buffer = Buffer.from(documentData);
      }
    }

    if (!buffer) {
      throw new Error('فشل توليد أو استخراج ملف الـ PDF');
    }

    const docContent = { document: buffer, mimetype: mimetype, fileName: filename, caption: caption || undefined };
    const result = await sock.sendMessage(jid, docContent);
    storeOutgoingMessage(result, docContent);

    console.log(`📤 [WhatsApp] تم إرسال مستند PDF بنجاح إلى: +${cleanPhone} (${filename})`);
    return res.json({
      sent: 'true',
      message: 'تم إرسال ملف الـ PDF بنجاح عبر الواتساب',
      id: result?.key?.id,
      to: cleanPhone,
    });
  } catch (err) {
    console.error(`❌ [WhatsApp] فشل إرسال المستند إلى ${cleanPhone}:`, err);
    return res.status(500).json({
      error: err.message || 'فشل إرسال ملف الـ PDF عبر الواتساب',
      sent: 'false',
    });
  }
});

// 3. Logout / Reset Session API
app.post('/logout', async (req, res) => {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
    }
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    isConnected = false;
    currentQR = null;
    qrDataUrl = null;
    initWhatsApp();
    res.json({ message: 'تم تسجيل الخروج وإعادة تشغيل جلسة الواتساب' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Web Dashboard UI
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>خادم واتساب المنطقة الآمنة 📱</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
    body { background: #0B1120; color: #F8FAFC; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1E293B; border: 1px solid #334155; border-radius: 28px; width: 100%; max-width: 520px; padding: 36px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
    .badge-connected { background: rgba(16,185,129,0.15); color: #34D399; border: 1px solid rgba(16,185,129,0.3); }
    .badge-waiting { background: rgba(245,158,11,0.15); color: #FBBF24; border: 1px solid rgba(245,158,11,0.3); }
    .badge-disconnected { background: rgba(239,68,68,0.15); color: #F87171; border: 1px solid rgba(239,68,68,0.3); }
    .qr-box { background: #FFFFFF; padding: 18px; border-radius: 20px; display: inline-block; margin: 20px 0; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .qr-box img { width: 240px; height: 240px; display: block; }
    h1 { font-size: 22px; font-weight: 900; margin-bottom: 8px; }
    p { font-size: 13px; color: #94A3B8; line-height: 1.6; }
    .info-box { background: #0F172A; border: 1px solid #334155; border-radius: 16px; padding: 16px; margin-top: 24px; text-align: right; font-size: 12px; }
    .info-box code { font-family: 'JetBrains Mono', monospace; color: #38BDF8; direction: ltr; display: inline-block; font-weight: bold; }
    .btn { display: inline-block; padding: 10px 24px; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; transition: all 0.2s; text-decoration: none; margin-top: 16px; }
    .btn-logout { background: #EF4444; color: white; }
    .btn-logout:hover { background: #DC2626; }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px; margin-bottom: 12px;">📱</div>
    <h1>خادم وبوابة واتساب — Safe Zone</h1>
    <p>بوابة محلية ورسمية لإرسال الفواتير وتذكيرات الديون تلقائياً</p>

    ${
      isConnected
        ? `
        <div style="margin-top: 24px;">
          <div class="badge badge-connected">
            <span class="pulse"></span>
            <span>متصل بنجاح وجاهز للإرسال ✅</span>
          </div>
          <div style="background: #0F172A; padding: 20px; border-radius: 18px; border: 1px solid #334155; margin: 15px 0;">
            <div style="font-size: 12px; color: #94A3B8; margin-bottom: 4px;">الرقم المتصل:</div>
            <div style="font-size: 20px; font-weight: 900; font-family: 'JetBrains Mono', monospace; color: #34D399; direction: ltr;">+${connectedPhone}</div>
            <div style="font-size: 12px; color: #64748B; margin-top: 4px;">${connectedName}</div>
          </div>
          <p style="color: #34D399; font-weight: bold;">النظام يعمل الآن ويرسل كافة الفواتير والتذكيرات مباشرة من هذا الرقم مجاناً 🚀</p>
          
          <form action="/logout" method="POST" onsubmit="return confirm('هل أنت متأكد من تسجيل الخروج وفصل الواتساب؟');">
            <button type="submit" class="btn btn-logout">فصل وتسجيل الخروج</button>
          </form>
        </div>
      `
        : qrDataUrl
        ? `
        <div style="margin-top: 20px;">
          <div class="badge badge-waiting">
            <span class="pulse"></span>
            <span>بانتظار مسح رمز الـ QR Code 📷</span>
          </div>
          <div class="qr-box">
            <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
          </div>
          <p style="font-size: 13px; color: #E2E8F0; font-weight: bold;">
            افتح الواتساب في هاتفك ⬅️ الأجهزة المرتبطة ⬅️ امسح الرمز أعلاه
          </p>
          <script>
            setTimeout(() => { location.reload(); }, 6000);
          </script>
        </div>
      `
        : `
        <div style="margin-top: 24px;">
          <div class="badge badge-disconnected">
            <span class="pulse"></span>
            <span>جارٍ تجهيز الاتصال وتوليد الرمز... ⏳</span>
          </div>
          <script>
            setTimeout(() => { location.reload(); }, 2500);
          </script>
        </div>
      `
    }

    <div class="info-box">
      <div style="margin-bottom: 6px;">🔗 <strong>رابط الـ API للنظام:</strong> <code>http://localhost:${PORT}/messages/chat</code></div>
      <div>🔑 <strong>رمز الأمان (Token):</strong> <code>${AUTH_TOKEN}</code></div>
    </div>
  </div>
</body>
</html>
  `;
  res.send(html);
});

// Start Server & WhatsApp Socket
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 [SafeZone WhatsApp Server] يعمل بنجاح على المنفذ: ${PORT}`);
  console.log(`🌐 افتح المتصفح على: http://localhost:${PORT}`);
  console.log(`🔑 رمز الأمان (Token): ${AUTH_TOKEN}`);
  console.log(`======================================================\n`);
  initWhatsApp();
});
