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

async function initWhatsApp() {
  connectionStatus = 'connecting';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    generateHighQualityLinkPreview: true,
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

function loadScheduledJobs() {
  try {
    if (fs.existsSync(SCHEDULED_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULED_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveScheduledJobs(jobs) {
  try {
    fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  } catch (e) {}
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

// Background scheduler interval runner
setInterval(async () => {
  if (!isConnected || !sock) return;

  const jobs = loadScheduledJobs();
  const now = Date.now();
  let changed = false;

  for (const job of jobs) {
    if (job.status === 'pending' && job.targetTimestamp <= now) {
      job.status = 'processing';
      changed = true;
      saveScheduledJobs(jobs);

      try {
        let docBuffer = null;
        if (job.htmlContent) {
          docBuffer = await generateNativePdfFromHtml(job.htmlContent);
        }
        if (!docBuffer && job.documentDataBase64) {
          const base64 = job.documentDataBase64.includes(',') ? job.documentDataBase64.split(',')[1] : job.documentDataBase64;
          docBuffer = Buffer.from(base64, 'base64');
        }

        if (job.type === 'document' && docBuffer) {
          await sock.sendMessage(job.jid, {
            document: docBuffer,
            mimetype: job.mimetype || 'application/pdf',
            fileName: job.filename || 'invoice.pdf',
            caption: job.caption || undefined,
          });
          console.log(`⏰ [Scheduler] تم إرسال المستند المجدول بنجاح إلى: +${job.cleanPhone} (${job.filename})`);
        } else if (job.type === 'chat' && job.body) {
          await sock.sendMessage(job.jid, { text: job.body });
          console.log(`⏰ [Scheduler] تم إرسال الرسالة المجدولة بنجاح إلى: +${job.cleanPhone}`);
        }

        if (job.isRecurring && job.schedule) {
          const nextTarget = calculateNextScheduledTimestamp(job.schedule, job.timeStr || '20:00', new Date(), true);
          job.targetTimestamp = nextTarget;
          job.targetTimeFormatted = new Date(nextTarget).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
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
      }
    }
  }

  // Cleanup old records (keep pending & recurring jobs indefinitely)
  const filtered = jobs.filter(j => j.status === 'pending' || j.isRecurring || (Date.now() - new Date(j.createdAt).getTime()) < 3600 * 1000);
  if (filtered.length !== jobs.length || changed) {
    saveScheduledJobs(filtered);
  }
}, 3000);

// Synchronize all active debtor schedules directly to AWS Gateway queue (24/7 autonomous background engine)
app.post('/scheduled/sync-debtors', (req, res) => {
  const { debtors = [] } = req.body;
  const jobs = loadScheduledJobs();
  let updatedCount = 0;

  debtors.forEach(debtor => {
    if (!debtor.phone || !debtor.schedule || debtor.schedule === 'disabled') return;
    const cleanPhone = formatInternationalPhone(debtor.phone);
    if (!cleanPhone) return;
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const jobId = `debtor_${debtor.customerId || debtor.id || cleanPhone}`;

    const existingIndex = jobs.findIndex(j => j.id === jobId || (j.jid === jid && j.isDebtReminder));
    const targetTimestamp = debtor.targetTimestamp || calculateNextScheduledTimestamp(debtor.schedule, debtor.timeStr || '20:00', new Date());

    const newJob = {
      id: jobId,
      type: 'chat',
      isDebtReminder: true,
      isRecurring: true,
      customerId: debtor.customerId || debtor.id,
      customerName: debtor.customerName || debtor.name,
      schedule: debtor.schedule,
      timeStr: debtor.timeStr || '20:00',
      jid,
      cleanPhone,
      body: debtor.message,
      targetTimestamp,
      targetTimeFormatted: new Date(targetTimestamp).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }),
      status: 'pending',
      createdAt: new Date().toISOString(),
      token: req.body.token || 'SafeZone2026'
    };

    if (existingIndex >= 0) {
      if (jobs[existingIndex].status === 'pending') {
        jobs[existingIndex] = { ...jobs[existingIndex], ...newJob };
      }
    } else {
      jobs.push(newJob);
    }
    updatedCount++;
  });

  saveScheduledJobs(jobs);
  console.log(`📋 [Scheduler] تم مزامنة ${updatedCount} تذكير عميل في طابور السيرفر السحابي 24/7 بنجاح!`);
  res.json({ success: true, count: jobs.length, syncedDebtors: updatedCount });
});

// Automated 24/7 Debt Reminder Cron Trigger on AWS Server (Runs every 1 minute)
setInterval(async () => {
  try {
    if (!isConnected || !sock) return;
    const cronUrl = process.env.CRON_DEBT_URL || 'https://camera-inventory-1qfh.vercel.app/api/cron-debt-reminders';
    const res = await fetch(cronUrl);
    const data = await res.json().catch(() => ({}));
    if (data?.status === 'success' || data?.sentCount > 0) {
      console.log(`⏰ [AWS 24/7 Cron] تم إرسال التذكيرات المستحقة في الخلفية بنجاح:`, data);
    }
  } catch (e) {
    // Ignore network timeouts
  }
}, 60 * 1000);

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

  if (!isConnected || !sock) {
    return res.status(503).json({ error: 'خادم الواتساب غير متصل حالياً بالهاتف' });
  }

  try {
    if (job.type === 'document' && job.document) {
      const buffer = Buffer.from(job.document, 'base64');
      await sock.sendMessage(job.jid, {
        document: buffer,
        mimetype: job.mimetype || 'application/pdf',
        fileName: job.filename || 'invoice.pdf',
        caption: job.caption || '',
      });
    } else if (job.type === 'chat' && job.body) {
      await sock.sendMessage(job.jid, { text: job.body });
    }

    job.status = 'completed';
    job.sentAt = new Date().toISOString();
    saveScheduledJobs(jobs);

    console.log(`⚡ [Scheduler] تم إرسال المهمة المجدولة فوراً بطلب يدوي (${job.id}) إلى: +${job.cleanPhone}`);
    return res.json({ success: true, message: 'تم إرسال الرسالة فوراً بنجاح 🚀' });
  } catch (err) {
    console.error(`❌ [Scheduler] فشل إرسال المهمة يدوياً:`, err.message);
    return res.status(500).json({ error: err.message || 'فشل إرسال الرسالة' });
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
    candidate.setDate(targetDay);
    if (isRenewal || candidate.getTime() <= now.getTime()) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return candidate.getTime();
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

  return candidate.getTime();
}

// Sync and schedule automated customer debt reminders
app.post('/reminders/sync', async (req, res) => {
  const { customers = [], settings = {}, forceCheck = false } = req.body;
  if (!isConnected || !sock) {
    return res.status(503).json({ error: 'خادم الواتساب غير متصل', connected: false });
  }

  const now = new Date();
  let jobs = loadScheduledJobs();

  // 1. Purge disabled or settled debtors from server queue
  const activeCustomerIds = new Set(
    customers
      .filter(c => c && (c.phone1 || c.phone) && c.reminderSchedule !== 'disabled' && Number(c.totalDebt || 0) > 0)
      .map(c => String(c.id))
  );

  jobs = jobs.filter(j => {
    if (!j.isDebtReminder) return true;
    const cId = String(j.customerId || (j.id?.startsWith('job_debt_') ? j.id.replace('job_debt_', '') : '') || (j.id?.startsWith('debtor_') ? j.id.replace('debtor_', '') : ''));
    if (!cId) return true;
    return activeCustomerIds.has(cId);
  });

  const dispatchedImmediate = [];
  const registeredScheduled = [];

  for (const cust of customers) {
    if (!cust?.phone1 || cust.reminderSchedule === 'disabled') continue;
    const totalDebt = Number(cust.totalDebt || 0);
    if (totalDebt <= 0) continue;

    let schedCode = cust.reminderSchedule || 'default';
    let timeStr = settings.whatsappReminderTime || '20:00';

    if (schedCode.includes('@')) {
      const parts = schedCode.split('@');
      schedCode = parts[0];
      if (parts[1] && parts[1].includes(':')) timeStr = parts[1];
    }

    let cleanPhone = String(cust.phone1).replace(/[^\d]/g, '').trim();
    if (cleanPhone.startsWith('07') && cleanPhone.length === 11) {
      cleanPhone = '964' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('7') && cleanPhone.length === 10) {
      cleanPhone = '964' + cleanPhone;
    }
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const targetTimestamp = calculateNextScheduledTimestamp(schedCode, timeStr, now);
    const isDueNow = forceCheck || (targetTimestamp <= now.getTime() + 10000);

    const msgBody = cust.renderedMessage || `تذكير بمبلغ الدين المستحق: ${totalDebt.toLocaleString('en-US')} د.ع على حسابكم لدى المحل.`;

    if (isDueNow) {
      // Check last sent slot to prevent double sending in same slot
      const [hStr, mStr] = String(timeStr).split(':');
      const targetSlot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hStr || '20', 10), parseInt(mStr || '0', 10), 0);
      const lastSent = cust.lastDebtReminderSent ? new Date(cust.lastDebtReminderSent) : null;

      if (!forceCheck && lastSent && lastSent.getTime() >= targetSlot.getTime() - 60000) {
        continue; // Already sent for this slot today
      }

      try {
        await sock.sendMessage(jid, { text: msgBody });
        console.log(`🚀 [AutoDebtReminder] تم إرسال تذكير الديون بنجاح للعميل «${cust.name}» (+${cleanPhone})`);
        dispatchedImmediate.push({ id: cust.id, name: cust.name, phone: cleanPhone });
      } catch (err) {
        console.error(`❌ [AutoDebtReminder] فشل الإرسال إلى ${cleanPhone}:`, err.message);
      }
    } else {
      // Check if this customer already has an active pending countdown job
      const existingJob = jobs.find(j => 
        (j.id === jobId || j.customerId === cust.id || (!j.isDebtReminder && (j.jid === jid || j.cleanPhone === cleanPhone))) &&
        j.status === 'pending' &&
        j.targetTimestamp &&
        j.targetTimestamp > now.getTime()
      );

      // Preserve existing countdown target time if available, otherwise calculate next slot
      const finalTargetTimestamp = existingJob 
        ? existingJob.targetTimestamp 
        : targetTimestamp;

      // Remove any existing pending job for this customer
      jobs = jobs.filter(j => 
        j.id !== jobId && 
        j.customerId !== cust.id && 
        j.id !== `debtor_${cust.id}` && 
        j.id !== `debt_sched_${cust.id}` &&
        (!j.isDebtReminder || (j.jid !== jid && j.cleanPhone !== cleanPhone))
      );

      const newJob = {
        id: jobId,
        type: 'chat',
        isDebtReminder: true,
        isRecurring: true,
        schedule: schedCode,
        timeStr,
        customerId: cust.id,
        customerName: cust.name,
        cleanPhone,
        totalDebt,
        jid,
        body: msgBody,
        scheduledAt: new Date(finalTargetTimestamp).toISOString(),
        targetTimestamp: finalTargetTimestamp,
        createdAt: existingJob?.createdAt || new Date().toISOString(),
        status: 'pending'
      };
      jobs.push(newJob);
      registeredScheduled.push(newJob);
    }
  }

  saveScheduledJobs(jobs);

  return res.json({
    success: true,
    dispatchedImmediateCount: dispatchedImmediate.length,
    dispatchedImmediate,
    registeredScheduledCount: registeredScheduled.length,
    registeredScheduled: registeredScheduled.map(j => ({ id: j.id, customerName: j.customerName, scheduledAt: j.scheduledAt }))
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

    const result = await sock.sendMessage(jid, {
      document: buffer,
      mimetype: mimetype,
      fileName: filename,
      caption: caption || undefined,
    });

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
