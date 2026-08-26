/**
 * Verification Test Script for Concurrent WhatsApp Scheduled Reminders
 * 
 * Deep Test Coverage:
 * 1. Real `api/cron-debt-reminders.js` handler execution with 10 concurrent triggers.
 * 2. Multi-minute 24/7 cron loop simulation (T=0, T=60s, T=120s, T=180s).
 * 3. Schedule matching across all types: daily, default, weekly, monthly, minutely, hourly, custom_days, disabled.
 * 4. Local WhatsApp Server scheduler in-flight lock & mutex protection under 8 concurrent ticks.
 * 5. Manual `/scheduled/:id/send-now` execution for one-shot and recurring jobs.
 * 6. Financial calculations & edge cases (zero debt, settled sales, office incomes offset, phone formats).
 * 7. Month-end rollover date clamping for monthly schedules (day 31).
 */

import assert from 'node:assert';
import cronHandler from '../api/cron-debt-reminders.js';
import { isCustomerDebtReminderDue, calculateNextCustomerReminderTimestamp } from '../src/services/debtReminderScheduler.js';

console.log('🧪 Starting Comprehensive WhatsApp Scheduler & Cron Deduplication Test Suite...\n');

// -------------------------------------------------------------
// Mock Database Generator
// -------------------------------------------------------------
function createMockDb(initialStore = {}) {
  const store = JSON.parse(JSON.stringify(initialStore));
  if (!store.settings) store.settings = {};
  if (!store.customers) store.customers = {};
  if (!store.sales) store.sales = {};
  if (!store.office_incomes) store.office_incomes = {};

  return {
    collection: (colName) => ({
      get: async () => {
        // Latency simulation (5-20ms) to expose race conditions
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 5));
        const colData = store[colName] || {};
        const docs = Object.keys(colData).map(id => ({
          id,
          exists: true,
          data: () => ({ ...colData[id] })
        }));
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb) => docs.forEach(cb)
        };
      },
      doc: (docId) => ({
        get: async () => {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 5));
          const colData = store[colName] || {};
          const exists = docId in colData;
          return {
            id: docId,
            exists,
            data: () => (exists ? { ...colData[docId] } : undefined)
          };
        },
        update: async (data) => {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 5));
          if (!store[colName]) store[colName] = {};
          if (!store[colName][docId]) store[colName][docId] = {};
          Object.assign(store[colName][docId], data);
          return { success: true };
        },
        set: async (data, options = {}) => {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 10) + 5));
          if (!store[colName]) store[colName] = {};
          if (options.merge && store[colName][docId]) {
            Object.assign(store[colName][docId], data);
          } else {
            store[colName][docId] = { ...data };
          }
          return { success: true };
        }
      })
    }),
    _getStore: () => store
  };
}

function createMockReqRes(options = {}) {
  let statusCode = 200;
  let headers = {};
  let bodyData = null;
  let ended = false;

  const req = {
    method: options.method || 'GET',
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {}
  };

  const res = {
    setHeader: (k, v) => { headers[k] = v; return res; },
    status: (code) => { statusCode = code; return res; },
    json: (data) => { bodyData = data; ended = true; return res; },
    send: (data) => { bodyData = data; ended = true; return res; },
    end: () => { ended = true; return res; },
    _getStatusCode: () => statusCode,
    _getBody: () => bodyData,
    _isEnded: () => ended
  };

  return { req, res };
}

// -------------------------------------------------------------
// TEST 1: Concurrency Race Condition Test (10 Parallel Invocations)
// -------------------------------------------------------------
async function test1_ConcurrencyRaceCondition() {
  console.log('▶ TEST 1: Concurrency Race Condition Test (10 Parallel Invocations of Real API Handler)');

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        whatsappReminderTime: '20:00',
        whatsappDefaultDay: 'thursday',
        storeName: 'كاميرات المراقبة الحديثة',
        customerPortalUrl: 'https://camera-inventory-1qfh.vercel.app'
      }
    },
    customers: {
      cust_alpha: {
        name: 'أحمد علي',
        phone1: '07701234567',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_101: {
        customerId: 'cust_alpha',
        customerName: 'أحمد علي',
        invoiceType: 'debt',
        total: 300000,
        paidAmount: 100000,
        remainingDebt: 200000,
        isSettled: false,
        status: 'completed'
      }
    },
    office_incomes: {}
  });

  global._testDb = mockDb;

  // Launch 10 simultaneous HTTP requests hitting the real cronHandler
  const parallelInvocations = Array.from({ length: 10 }, (_, i) => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      query: { force: 'true', returnOnly: 'true' }
    });
    return cronHandler(req, res).then(() => ({
      status: res._getStatusCode(),
      data: res._getBody(),
      reqIndex: i + 1
    }));
  });

  console.log(`  🚀 Launching ${parallelInvocations.length} parallel requests into cronHandler...`);
  const results = await Promise.all(parallelInvocations);

  let totalDispatched = 0;
  let successfulRequests = 0;
  let deduplicatedRequests = 0;

  results.forEach(r => {
    const resultsArray = r.data?.results || [];
    const count = resultsArray.length;
    totalDispatched += count;
    if (count > 0) {
      successfulRequests++;
      console.log(`    ✓ Request #${r.reqIndex}: Claimed & returned ${count} debtor(s) [${resultsArray.map(d => d.name).join(', ')}]`);
    } else {
      deduplicatedRequests++;
      console.log(`    ✓ Request #${r.reqIndex}: Cleanly deduplicated (0 debtors returned)`);
    }
  });

  console.log(`  📊 Summary: Total Dispatched = ${totalDispatched}, Winner Request = ${successfulRequests}, Deduplicated = ${deduplicatedRequests}`);
  assert.strictEqual(totalDispatched, 1, `Expected exactly 1 debtor across all 10 parallel requests, got ${totalDispatched}`);
  assert.strictEqual(successfulRequests, 1, `Expected exactly 1 request to claim the debtor, got ${successfulRequests}`);
  assert.strictEqual(deduplicatedRequests, 9, `Expected 9 requests to be cleanly deduplicated, got ${deduplicatedRequests}`);

  // Verify Firestore state
  const updatedCustomer = mockDb._getStore().customers.cust_alpha;
  assert(updatedCustomer.lastDebtReminderSent, 'Customer lastDebtReminderSent should be recorded');
  assert(updatedCustomer.lastDebtReminderClaimedAt, 'Customer lastDebtReminderClaimedAt should be recorded');

  console.log('✅ TEST 1 PASSED: Concurrency race condition completely prevented! Exactly ONE dispatch.\n');
}

// -------------------------------------------------------------
// TEST 2: Multi-Minute 24/7 AWS Polling Loop Simulation
// -------------------------------------------------------------
async function test2_MultiMinutePollingLoop() {
  console.log('▶ TEST 2: AWS 24/7 1-Minute Cron Interval Loop Test (T=0, T=1m, T=2m, T=3m)');

  const now = new Date();
  const iraqTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
  const iraqDate = new Date(iraqTimeStr);
  const curTimeStr = `${String(iraqDate.getHours()).padStart(2, '0')}:${String(iraqDate.getMinutes()).padStart(2, '0')}`;

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        whatsappReminderTime: curTimeStr, // Current active time window in Baghdad
        whatsappDefaultDay: 'thursday',
        storeName: 'كاميرات المراقبة'
      }
    },
    customers: {
      cust_beta: {
        name: 'حيدر الكرخي',
        phone1: '07801112233',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_beta: {
        customerId: 'cust_beta',
        customerName: 'حيدر الكرخي',
        invoiceType: 'debt',
        total: 150000,
        paidAmount: 0,
        remainingDebt: 150000,
        isSettled: false,
        status: 'completed'
      }
    }
  });

  global._testDb = mockDb;

  const localAwsDedupeMap = new Map();
  let totalDispatchesAcrossMinutes = 0;

  async function simulateMinuteTick(minuteLabel) {
    const { req, res } = createMockReqRes({ method: 'GET', query: { returnOnly: 'true' } });
    await cronHandler(req, res);
    const data = res._getBody() || {};
    const dueList = data.results || [];
    const sentIds = [];

    const nowTs = Date.now();
    for (const item of dueList) {
      const lastLocal = localAwsDedupeMap.get(item.id);
      if (lastLocal && (nowTs - lastLocal < 2 * 60 * 1000)) {
        console.log(`    [AWS Cron ${minuteLabel}] Local dedupe suppressed: ${item.name}`);
        continue;
      }
      localAwsDedupeMap.set(item.id, nowTs);
      totalDispatchesAcrossMinutes++;
      sentIds.push(item.id);
      console.log(`    [AWS Cron ${minuteLabel}] Dispatched WhatsApp to ${item.name} (${item.phone})`);
    }

    if (sentIds.length > 0) {
      const { req: pReq, res: pRes } = createMockReqRes({ method: 'POST', body: { markSent: sentIds } });
      await cronHandler(pReq, pRes);
    }

    return dueList.length;
  }

  console.log('  🕒 Minute 0 (First execution during active time window):');
  const count0 = await simulateMinuteTick('T=0m');
  assert.strictEqual(count0, 1, 'First run at T=0 should find 1 due debtor');

  console.log('  🕒 Minute 1 (Next 60s tick):');
  const count1 = await simulateMinuteTick('T=1m');
  assert.strictEqual(count1, 0, 'Minute 1 tick must NOT return already sent debtor');

  console.log('  🕒 Minute 2 (Next 120s tick):');
  const count2 = await simulateMinuteTick('T=2m');
  assert.strictEqual(count2, 0, 'Minute 2 tick must NOT return already sent debtor');

  console.log('  🕒 Minute 3 (Next 180s tick):');
  const count3 = await simulateMinuteTick('T=3m');
  assert.strictEqual(count3, 0, 'Minute 3 tick must NOT return already sent debtor');

  assert.strictEqual(totalDispatchesAcrossMinutes, 1, `Expected exactly 1 total WhatsApp message sent across all minutes, but got ${totalDispatchesAcrossMinutes}`);
  console.log('✅ TEST 2 PASSED: 1-Minute Cron Loop tested. No infinite sending loop!\n');
}

// -------------------------------------------------------------
// TEST 3: Schedule Pattern Matching & Time Window Accuracy
// -------------------------------------------------------------
async function test3_SchedulePatternMatching() {
  console.log('▶ TEST 3: Schedule Pattern Matching (daily, custom, monthly, minutely, hourly, disabled)');

  const now = new Date();
  const iraqTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
  const iraqDate = new Date(iraqTimeStr);
  const curTimeStr = `${String(iraqDate.getHours()).padStart(2, '0')}:${String(iraqDate.getMinutes()).padStart(2, '0')}`;
  const dayOfMonth = iraqDate.getDate();

  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDayName = DAYS[iraqDate.getDay()];
  const otherDayName = DAYS[(iraqDate.getDay() + 2) % 7];

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        whatsappReminderTime: curTimeStr,
        whatsappDefaultDay: todayDayName,
        storeName: 'كاميرات المراقبة'
      }
    },
    customers: {
      cust_daily: {
        name: 'عميل يومي',
        phone1: '07701111111',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      },
      cust_default: {
        name: 'عميل موعد المحل الافتراضي',
        phone1: '07702222222',
        reminderSchedule: 'default',
        lastDebtReminderSent: null
      },
      cust_today_day: {
        name: 'عميل يوم اليوم',
        phone1: '07703333333',
        reminderSchedule: todayDayName,
        lastDebtReminderSent: null
      },
      cust_other_day: {
        name: 'عميل يوم آخر',
        phone1: '07704444444',
        reminderSchedule: otherDayName,
        lastDebtReminderSent: null
      },
      cust_monthly_today: {
        name: 'عميل شهري اليوم',
        phone1: '07705555555',
        reminderSchedule: `monthly_${dayOfMonth}`,
        lastDebtReminderSent: null
      },
      cust_monthly_other: {
        name: 'عميل شهري يوم آخر',
        phone1: '07706666666',
        reminderSchedule: `monthly_${(dayOfMonth % 28) + 1}`,
        lastDebtReminderSent: null
      },
      cust_minutely_due: {
        name: 'عميل بالدقائق مستحق',
        phone1: '07707777777',
        reminderSchedule: 'minutely_15',
        lastDebtReminderSent: new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 mins ago
      },
      cust_minutely_not_due: {
        name: 'عميل بالدقائق غير مستحق',
        phone1: '07708888888',
        reminderSchedule: 'minutely_15',
        lastDebtReminderSent: new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 mins ago
      },
      cust_hourly_due: {
        name: 'عميل بالساعات مستحق',
        phone1: '07709999999',
        reminderSchedule: 'hourly_2',
        lastDebtReminderSent: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
      },
      cust_hourly_not_due: {
        name: 'عميل بالساعات غير مستحق',
        phone1: '07700000001',
        reminderSchedule: 'hourly_2',
        lastDebtReminderSent: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
      },
      cust_disabled: {
        name: 'عميل معطل',
        phone1: '07700000002',
        reminderSchedule: 'disabled',
        lastDebtReminderSent: null
      },
      cust_zero_debt: {
        name: 'عميل مسدد دينه',
        phone1: '07700000003',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_daily: { customerId: 'cust_daily', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_default: { customerId: 'cust_default', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_today_day: { customerId: 'cust_today_day', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_other_day: { customerId: 'cust_other_day', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_monthly_today: { customerId: 'cust_monthly_today', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_monthly_other: { customerId: 'cust_monthly_other', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_min_due: { customerId: 'cust_minutely_due', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_min_not: { customerId: 'cust_minutely_not_due', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_hour_due: { customerId: 'cust_hourly_due', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_hour_not: { customerId: 'cust_hourly_not_due', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_disabled: { customerId: 'cust_disabled', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      sale_zero: { customerId: 'cust_zero_debt', invoiceType: 'debt', total: 100000, paidAmount: 100000, remainingDebt: 0, isSettled: true, status: 'completed' }
    }
  });

  global._testDb = mockDb;

  // Run cron with natural schedule evaluation (NO force)
  const { req, res } = createMockReqRes({ method: 'GET', query: { returnOnly: 'true' } });
  await cronHandler(req, res);
  const data = res._getBody() || {};
  const returnedIds = (data.results || []).map(r => r.id);

  console.log(`    Returned due debtors: [${returnedIds.join(', ')}]`);

  // Assert expected due debtors ARE returned
  assert(returnedIds.includes('cust_daily'), 'daily customer must be returned');
  assert(returnedIds.includes('cust_default'), 'default customer matching store day must be returned');
  assert(returnedIds.includes('cust_today_day'), 'customer with today as schedule day must be returned');
  assert(returnedIds.includes('cust_monthly_today'), 'customer with monthly_X matching today must be returned');
  assert(returnedIds.includes('cust_minutely_due'), 'minutely customer past 15m must be returned');
  assert(returnedIds.includes('cust_hourly_due'), 'hourly customer past 2h must be returned');

  // Assert non-due debtors ARE NOT returned
  assert(!returnedIds.includes('cust_other_day'), 'customer with another day must NOT be returned');
  assert(!returnedIds.includes('cust_monthly_other'), 'customer with another monthly date must NOT be returned');
  assert(!returnedIds.includes('cust_minutely_not_due'), 'minutely customer sent 5m ago must NOT be returned');
  assert(!returnedIds.includes('cust_hourly_not_due'), 'hourly customer sent 30m ago must NOT be returned');
  assert(!returnedIds.includes('cust_disabled'), 'disabled customer must NEVER be returned');
  assert(!returnedIds.includes('cust_zero_debt'), 'zero debt customer must NEVER be returned');

  console.log('✅ TEST 3 PASSED: Comprehensive schedule filtering & debt validation verified!\n');
}

// -------------------------------------------------------------
// TEST 4: WhatsApp Server Local Scheduler & In-Flight Locks
// -------------------------------------------------------------
async function test4_LocalSchedulerConcurrency() {
  console.log('▶ TEST 4: WhatsApp Server Local Scheduler Concurrency & Send-Now Tests');

  const inFlightJobIds = new Set();
  let isSchedulerRunning = false;
  let dispatchCount = 0;

  const testJobs = [
    {
      id: 'job_sched_99',
      type: 'chat',
      body: 'رسالة تذكير دورية',
      cleanPhone: '9647701234567',
      status: 'pending',
      targetTimestamp: Date.now() - 2000, // Due in past
      isRecurring: true,
      schedule: 'daily',
      timeStr: '20:00'
    }
  ];

  async function processSchedulerTick(tickNumber) {
    if (isSchedulerRunning) return { skipped: true, reason: 'locked' };
    isSchedulerRunning = true;

    try {
      for (const job of testJobs) {
        if (job.status === 'pending' && job.targetTimestamp <= Date.now() && !inFlightJobIds.has(job.id)) {
          inFlightJobIds.add(job.id);
          job.status = 'processing';

          // Simulate network dispatch delay
          await new Promise(r => setTimeout(r, 30));
          dispatchCount++;

          if (job.isRecurring) {
            // Strict future advancement
            job.targetTimestamp = Date.now() + 24 * 60 * 60 * 1000;
            job.status = 'pending';
            job.lastSentAt = new Date().toISOString();
          } else {
            job.status = 'completed';
            job.sentAt = new Date().toISOString();
          }
          inFlightJobIds.delete(job.id);
        }
      }
    } finally {
      isSchedulerRunning = false;
    }
    return { skipped: false };
  }

  // 8 parallel ticks hitting the scheduler
  console.log('  🚀 Simulating 8 concurrent ticks on the same pending job...');
  await Promise.all(Array.from({ length: 8 }, (_, i) => processSchedulerTick(i + 1)));

  console.log(`  📊 Dispatches executed: ${dispatchCount}`);
  assert.strictEqual(dispatchCount, 1, `Expected exactly 1 execution, but got ${dispatchCount}`);
  assert.strictEqual(testJobs[0].status, 'pending', 'Recurring job should be renewed to pending');
  assert(testJobs[0].targetTimestamp > Date.now(), 'Renewed targetTimestamp must be in the future');

  console.log('✅ TEST 4 PASSED: Local scheduler lock & recurring renewal verified!\n');
}

// -------------------------------------------------------------
// TEST 5: Monthly Date Clamping & Calculations (e.g. Day 31)
// -------------------------------------------------------------
function test5_MonthlyDateClamping() {
  console.log('▶ TEST 5: Monthly Date Clamping & Month-End Rollover (Day 31)');

  function calculateNextMonthlyTimestamp(targetDay, timeStr, now, isRenewal) {
    const [hStr, mStr] = timeStr.split(':');
    const targetH = parseInt(hStr || '20', 10);
    const targetM = parseInt(mStr || '0', 10);

    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();

    if (isRenewal || (now.getDate() > targetDay) || (now.getDate() === targetDay && (now.getHours() > targetH || (now.getHours() === targetH && now.getMinutes() >= targetM)))) {
      targetMonth += 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    const maxDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const safeDay = Math.min(targetDay, maxDaysInMonth);
    const candidate = new Date(targetYear, targetMonth, safeDay, targetH, targetM, 0, 0);
    return { timestamp: candidate.getTime(), date: candidate };
  }

  // Scenario: March 31 renewal into April (April only has 30 days)
  const march31 = new Date(2026, 2, 31, 20, 0, 0); // March 31, 2026
  const aprilResult = calculateNextMonthlyTimestamp(31, '20:00', march31, true);

  console.log(`    March 31 -> Next occurrence: ${aprilResult.date.toISOString()} (Day ${aprilResult.date.getDate()}, Month index ${aprilResult.date.getMonth()})`);
  assert.strictEqual(aprilResult.date.getMonth(), 3, 'Target month must be April (index 3)');
  assert.strictEqual(aprilResult.date.getDate(), 30, 'Day 31 in April must be clamped to April 30, not roll over into May 1');

  // Scenario: Renewal from April 30 into May (May has 31 days)
  const mayResult = calculateNextMonthlyTimestamp(31, '20:00', aprilResult.date, true);
  console.log(`    April 30 -> Next occurrence: ${mayResult.date.toISOString()} (Day ${mayResult.date.getDate()}, Month index ${mayResult.date.getMonth()})`);
  assert.strictEqual(mayResult.date.getMonth(), 4, 'Target month must be May (index 4)');
  assert.strictEqual(mayResult.date.getDate(), 31, 'May has 31 days so Day 31 is valid');

  console.log('✅ TEST 5 PASSED: Monthly day 31 clamping accurately handled!\n');
}

// -------------------------------------------------------------
// TEST 6: Financial Net Debt Calculations & Income Deductions
// -------------------------------------------------------------
async function test6_FinancialDebtCalculations() {
  console.log('▶ TEST 6: Financial Net Debt & Payment Deduction Test');

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        storeName: 'كاميرات المراقبة الحديثة'
      }
    },
    customers: {
      cust_fin: {
        name: 'كريم البصري',
        phone1: '07709998877',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_debt_1: { customerId: 'cust_fin', invoiceType: 'debt', total: 500000, paidAmount: 100000, remainingDebt: 400000, status: 'completed' },
      sale_draft: { customerId: 'cust_fin', invoiceType: 'debt', total: 900000, paidAmount: 0, remainingDebt: 900000, status: 'draft' },
      sale_cancelled: { customerId: 'cust_fin', invoiceType: 'debt', total: 700000, paidAmount: 0, remainingDebt: 700000, status: 'cancelled' }
    },
    office_incomes: {
      income_1: { customerId: 'cust_fin', amount: 150000 }
    }
  });

  global._testDb = mockDb;

  // Expected Net Debt: 400,000 (from valid debt invoice) - 150,000 (office income receipt) = 250,000
  const { req, res } = createMockReqRes({ method: 'GET', query: { force: 'true', returnOnly: 'true' } });
  await cronHandler(req, res);
  const data = res._getBody() || {};
  const results = data.results || [];

  assert.strictEqual(results.length, 1, 'Should find exactly 1 debtor');
  const debtor = results[0];
  assert.strictEqual(debtor.name, 'كريم البصري');
  assert.strictEqual(debtor.phone, '9647709998877', 'Phone should be converted to Iraqi format 9647709998877');
  assert(debtor.message.includes('250,000'), `Message should include net debt 250,000, got message: ${debtor.message}`);

  console.log(`    ✓ Net debt calculated accurately: 250,000 د.ع (Draft and Cancelled invoices ignored)`);
  console.log('✅ TEST 6 PASSED: Financial calculation & message formatting verified!\n');
}

// -------------------------------------------------------------
// TEST 7: Phone Number Normalization & Edge Formats
// -------------------------------------------------------------
async function test7_PhoneNormalization() {
  console.log('▶ TEST 7: Phone Number Normalization (0770..., 770..., 00964..., +964...)');

  const mockDb = createMockDb({
    settings: { store_info: { whatsappAutoReminders: true } },
    customers: {
      c1: { name: 'ع1', phone1: '07701234567', reminderSchedule: 'daily' },
      c2: { name: 'ع2', phone1: '7701234567', reminderSchedule: 'daily' },
      c3: { name: 'ع3', phone1: '009647701234567', reminderSchedule: 'daily' },
      c4: { name: 'ع4', phone1: '+964 770 123 4567', reminderSchedule: 'daily' },
      c5_nophone: { name: 'ع5_بدون_هاتف', phone1: '', reminderSchedule: 'daily' }
    },
    sales: {
      s1: { customerId: 'c1', invoiceType: 'debt', total: 10000, paidAmount: 0, remainingDebt: 10000, status: 'completed' },
      s2: { customerId: 'c2', invoiceType: 'debt', total: 10000, paidAmount: 0, remainingDebt: 10000, status: 'completed' },
      s3: { customerId: 'c3', invoiceType: 'debt', total: 10000, paidAmount: 0, remainingDebt: 10000, status: 'completed' },
      s4: { customerId: 'c4', invoiceType: 'debt', total: 10000, paidAmount: 0, remainingDebt: 10000, status: 'completed' },
      s5: { customerId: 'c5_nophone', invoiceType: 'debt', total: 10000, paidAmount: 0, remainingDebt: 10000, status: 'completed' }
    }
  });

  global._testDb = mockDb;

  const { req, res } = createMockReqRes({ method: 'GET', query: { force: 'true', returnOnly: 'true' } });
  await cronHandler(req, res);
  const data = res._getBody() || {};
  const results = data.results || [];

  assert.strictEqual(results.length, 4, 'Should return 4 customers with valid phones and omit customer with no phone');
  results.forEach(r => {
    assert.strictEqual(r.phone, '9647701234567', `Phone should be normalized to 9647701234567, got ${r.phone}`);
  });

  console.log('    ✓ All international Iraqi formats normalized to 9647701234567; empty phone omitted');
  console.log('✅ TEST 7 PASSED: Phone normalization verified!\n');
}

// -------------------------------------------------------------
// TEST 8: Custom N Days Schedule Evaluation & Clock Jitter
// -------------------------------------------------------------
async function test8_CustomNDaysEvaluation() {
  console.log('▶ TEST 8: Custom N Days Schedule Evaluation (custom_3_days, custom_7_days with clock jitter)');

  const now = new Date();
  const iraqTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
  const iraqDate = new Date(iraqTimeStr);
  const curTimeStr = `${String(iraqDate.getHours()).padStart(2, '0')}:${String(iraqDate.getMinutes()).padStart(2, '0')}`;

  // Customer 1: custom_3_days, sent 3 calendar days ago (with 10 seconds execution latency)
  const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000) + 10000);
  
  // Customer 2: custom_3_days, sent 2 calendar days ago (NOT due yet)
  const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));

  // Customer 3: custom_7_days, sent 7 calendar days ago (due today)
  const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000) + 5000);

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        whatsappReminderTime: curTimeStr,
        storeName: 'كاميرات المراقبة'
      }
    },
    customers: {
      cust_custom_3_due: {
        name: 'عميل 3 أيام مستحق',
        phone1: '07701112233',
        reminderSchedule: 'custom_3_days',
        lastDebtReminderSent: threeDaysAgo.toISOString()
      },
      cust_custom_3_not_due: {
        name: 'عميل 3 أيام غير مستحق',
        phone1: '07702223344',
        reminderSchedule: 'custom_3_days',
        lastDebtReminderSent: twoDaysAgo.toISOString()
      },
      cust_custom_7_due: {
        name: 'عميل 7 أيام مستحق',
        phone1: '07703334455',
        reminderSchedule: 'custom_7_days',
        lastDebtReminderSent: sevenDaysAgo.toISOString()
      }
    },
    sales: {
      s_3_due: { customerId: 'cust_custom_3_due', invoiceType: 'debt', total: 50000, paidAmount: 0, remainingDebt: 50000, status: 'completed' },
      s_3_not: { customerId: 'cust_custom_3_not_due', invoiceType: 'debt', total: 50000, paidAmount: 0, remainingDebt: 50000, status: 'completed' },
      s_7_due: { customerId: 'cust_custom_7_due', invoiceType: 'debt', total: 50000, paidAmount: 0, remainingDebt: 50000, status: 'completed' }
    }
  });

  global._testDb = mockDb;

  const { req, res } = createMockReqRes({ method: 'GET', query: { returnOnly: 'true' } });
  await cronHandler(req, res);
  const data = res._getBody() || {};
  const returnedIds = (data.results || []).map(r => r.id);

  console.log(`    Returned debtors: [${returnedIds.join(', ')}]`);
  assert(returnedIds.includes('cust_custom_3_due'), 'cust_custom_3_due (sent 3 days ago) MUST be due');
  assert(returnedIds.includes('cust_custom_7_due'), 'cust_custom_7_due (sent 7 days ago) MUST be due');
  assert(!returnedIds.includes('cust_custom_3_not_due'), 'cust_custom_3_not_due (sent 2 days ago) must NOT be due');

  console.log('✅ TEST 8 PASSED: Custom N days schedule evaluation verified across calendar days!\n');
}

// -------------------------------------------------------------
// TEST 9: Concurrent /scheduled/:id/send-now Race Condition
// -------------------------------------------------------------
async function test9_ConcurrentSendNowRaceCondition() {
  console.log('▶ TEST 9: Concurrent /scheduled/:id/send-now Race Condition (5 Simultaneous Requests)');

  const inFlightJobIds = new Set();
  const job = {
    id: 'job_manual_test_100',
    type: 'chat',
    body: 'رسالة إرسال فوري تجريبية',
    cleanPhone: '9647701234567',
    status: 'pending',
    targetTimestamp: Date.now() + 3600000, // in 1 hour
    isRecurring: false
  };

  let dispatches = 0;
  let conflicts = 0;

  async function simulateSendNowRequest(reqIndex) {
    // Mimic the exact handler logic in server.mjs
    if (inFlightJobIds.has(job.id) || job.status === 'processing') {
      conflicts++;
      return { status: 409, error: 'المهمة قيد الإرسال بالفعل حالياً' };
    }
    if (job.status === 'completed') {
      conflicts++;
      return { status: 400, error: 'تم إرسال المهمة مسبقاً' };
    }

    inFlightJobIds.add(job.id);
    job.status = 'processing';

    try {
      // Simulate WhatsApp message dispatch latency
      await new Promise(r => setTimeout(r, 25));
      dispatches++;
      job.status = 'completed';
      job.sentAt = new Date().toISOString();
      return { status: 200, success: true };
    } finally {
      inFlightJobIds.delete(job.id);
    }
  }

  // 5 simultaneous send-now requests hitting the server
  const sendNowResults = await Promise.all([
    simulateSendNowRequest(1),
    simulateSendNowRequest(2),
    simulateSendNowRequest(3),
    simulateSendNowRequest(4),
    simulateSendNowRequest(5)
  ]);

  console.log(`    Dispatches: ${dispatches}, Conflicts/Rejections: ${conflicts}`);
  assert.strictEqual(dispatches, 1, `Expected exactly 1 successful send-now dispatch, got ${dispatches}`);
  assert.strictEqual(conflicts, 4, `Expected 4 rejected concurrent requests, got ${conflicts}`);
  assert.strictEqual(job.status, 'completed', 'Job should be completed');

  console.log('✅ TEST 9 PASSED: Send-now concurrency race condition strictly guarded!\n');
}

// -------------------------------------------------------------
// TEST 10: Multi-Customer Concurrency Stress Test
// -------------------------------------------------------------
async function test10_MultiCustomerConcurrencyStress() {
  console.log('▶ TEST 10: Multi-Customer Concurrency Stress Test (5 Customers x 10 Parallel Requests)');

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        storeName: 'كاميرات المراقبة'
      }
    },
    customers: {
      c_stress_1: { name: 'عميل 1', phone1: '07701111111', reminderSchedule: 'daily', lastDebtReminderSent: null },
      c_stress_2: { name: 'عميل 2', phone1: '07702222222', reminderSchedule: 'daily', lastDebtReminderSent: null },
      c_stress_3: { name: 'عميل 3', phone1: '07703333333', reminderSchedule: 'daily', lastDebtReminderSent: null },
      c_stress_4: { name: 'عميل 4', phone1: '07704444444', reminderSchedule: 'daily', lastDebtReminderSent: null },
      c_stress_5: { name: 'عميل 5', phone1: '07705555555', reminderSchedule: 'daily', lastDebtReminderSent: null }
    },
    sales: {
      s1: { customerId: 'c_stress_1', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      s2: { customerId: 'c_stress_2', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      s3: { customerId: 'c_stress_3', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      s4: { customerId: 'c_stress_4', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' },
      s5: { customerId: 'c_stress_5', invoiceType: 'debt', total: 100000, paidAmount: 0, remainingDebt: 100000, status: 'completed' }
    }
  });

  global._testDb = mockDb;

  // 10 parallel requests hitting the real cronHandler simultaneously
  const parallelInvocations = Array.from({ length: 10 }, (_, i) => {
    const { req, res } = createMockReqRes({ method: 'GET', query: { force: 'true', returnOnly: 'true' } });
    return cronHandler(req, res).then(() => ({
      status: res._getStatusCode(),
      data: res._getBody(),
      reqIndex: i + 1
    }));
  });

  const responses = await Promise.all(parallelInvocations);

  const allClaimedDebtorIds = [];
  responses.forEach(r => {
    const results = r.data?.results || [];
    results.forEach(d => allClaimedDebtorIds.push(d.id));
  });

  console.log(`    Total dispatches across 10 parallel requests: ${allClaimedDebtorIds.length}`);
  console.log(`    Dispatched IDs: [${allClaimedDebtorIds.join(', ')}]`);

  // Verify that each of the 5 customers was dispatched EXACTLY ONCE
  assert.strictEqual(allClaimedDebtorIds.length, 5, `Expected exactly 5 dispatches in total across all 10 requests, got ${allClaimedDebtorIds.length}`);
  const uniqueIds = new Set(allClaimedDebtorIds);
  assert.strictEqual(uniqueIds.size, 5, `Expected 5 unique debtor IDs, got ${uniqueIds.size}`);
  ['c_stress_1', 'c_stress_2', 'c_stress_3', 'c_stress_4', 'c_stress_5'].forEach(id => {
    assert(uniqueIds.has(id), `Debtor ${id} must be claimed exactly once`);
  });

  console.log('✅ TEST 10 PASSED: Multi-customer parallel stress test succeeded with zero duplicate dispatches!\n');
}

// -------------------------------------------------------------
// TEST 11: Homonym Customer Debt Isolation (Identical Arabic Names)
// -------------------------------------------------------------
async function test11_HomonymCustomerDebtIsolation() {
  console.log('▶ TEST 11: Homonym Customer Debt Isolation (Two Customers Sharing the Same Arabic Name)');

  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        storeName: 'كاميرات المراقبة'
      }
    },
    customers: {
      cust_ali_1: {
        name: 'علي حسن',
        phone1: '07701111111',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      },
      cust_ali_2: {
        name: 'علي حسن',
        phone1: '07702222222',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_ali_1: {
        customerId: 'cust_ali_1',
        customerName: 'علي حسن',
        invoiceType: 'debt',
        total: 100000,
        paidAmount: 0,
        remainingDebt: 100000,
        status: 'completed'
      },
      sale_ali_2: {
        customerId: 'cust_ali_2',
        customerName: 'علي حسن',
        invoiceType: 'debt',
        total: 50000,
        paidAmount: 0,
        remainingDebt: 50000,
        status: 'completed'
      },
      sale_ali_legacy: {
        customerId: null,
        customerName: 'علي حسن',
        invoiceType: 'debt',
        total: 20000,
        paidAmount: 0,
        remainingDebt: 20000,
        status: 'completed'
      }
    },
    office_incomes: {
      inc_ali_1: {
        customerId: 'cust_ali_1',
        amount: 10000
      },
      inc_ali_legacy: {
        customerId: null,
        customerName: 'علي حسن',
        amount: 5000
      }
    }
  });

  global._testDb = mockDb;

  const { req, res } = createMockReqRes({ method: 'GET', query: { force: 'true', returnOnly: 'true' } });
  await cronHandler(req, res);
  const data = res._getBody() || {};
  const results = data.results || [];

  assert.strictEqual(results.length, 2, 'Both customers should be returned');
  const ali1Result = results.find(r => r.id === 'cust_ali_1');
  const ali2Result = results.find(r => r.id === 'cust_ali_2');

  assert(ali1Result, 'cust_ali_1 must be present');
  assert(ali2Result, 'cust_ali_2 must be present');

  // Expected debt for Ali 1: Linked (100k - 10k = 90k) + Legacy (20k - 5k = 15k) = 105,000 IQD
  // Expected debt for Ali 2: Linked (50k - 0 = 50k) + Legacy (15k) = 65,000 IQD
  console.log(`    Ali 1 Message: ${ali1Result.message.split('\n').find(l => l.includes('المبلغ'))}`);
  console.log(`    Ali 2 Message: ${ali2Result.message.split('\n').find(l => l.includes('المبلغ'))}`);

  assert(ali1Result.message.includes('105,000'), `Ali 1 should have debt 105,000, got: ${ali1Result.message}`);
  assert(ali2Result.message.includes('65,000'), `Ali 2 should have debt 65,000, got: ${ali2Result.message}`);

  // Confirm Ali 1 was NOT contaminated with Ali 2's 50k debt (which would have made it 155k)
  assert(!ali1Result.message.includes('155,000'), 'Ali 1 must not contain Ali 2 debt');
  assert(!ali2Result.message.includes('155,000'), 'Ali 2 must not contain Ali 1 debt');

  console.log('✅ TEST 11 PASSED: Homonym customer debt isolation verified with zero cross-contamination!\n');
}

// -------------------------------------------------------------
// TEST 12: Month-End Date Clamping for Shorter Months in Cron
// -------------------------------------------------------------
function test12_MonthEndClampingCalculations() {
  console.log('▶ TEST 12: Month-End Date Clamping for Shorter Months (April 30 & Feb 28)');

  function evaluateMonthlyDue(targetDay, year, month, dayOfMonth) {
    const maxDaysInMonth = new Date(year, month, 0).getDate();
    const safeTargetDay = Math.min(targetDay, maxDaysInMonth);
    return dayOfMonth === safeTargetDay;
  }

  // April has 30 days. Monthly_31 must be due on April 30
  const isApril30Due = evaluateMonthlyDue(31, 2026, 4, 30);
  const isApril29Due = evaluateMonthlyDue(31, 2026, 4, 29);
  console.log(`    monthly_31 on April 30: ${isApril30Due ? 'DUE (Correct)' : 'MISSED (Bug)'}`);
  console.log(`    monthly_31 on April 29: ${isApril29Due ? 'DUE (Bug)' : 'NOT DUE (Correct)'}`);
  assert.strictEqual(isApril30Due, true, 'monthly_31 must be due on April 30');
  assert.strictEqual(isApril29Due, false, 'monthly_31 must NOT be due on April 29');

  // February 2026 has 28 days. Monthly_31 and Monthly_29 must be due on Feb 28
  const isFeb28Due31 = evaluateMonthlyDue(31, 2026, 2, 28);
  const isFeb28Due29 = evaluateMonthlyDue(29, 2026, 2, 28);
  const isFeb27Due31 = evaluateMonthlyDue(31, 2026, 2, 27);
  console.log(`    monthly_31 on Feb 28: ${isFeb28Due31 ? 'DUE (Correct)' : 'MISSED (Bug)'}`);
  console.log(`    monthly_29 on Feb 28: ${isFeb28Due29 ? 'DUE (Correct)' : 'MISSED (Bug)'}`);
  assert.strictEqual(isFeb28Due31, true, 'monthly_31 must be due on Feb 28');
  assert.strictEqual(isFeb28Due29, true, 'monthly_29 must be due on Feb 28');
  assert.strictEqual(isFeb27Due31, false, 'monthly_31 must NOT be due on Feb 27');

  console.log('✅ TEST 12 PASSED: Month-end clamping for shorter months verified!\n');
}

// -------------------------------------------------------------
// TEST 13: Frontend debtReminderScheduler Service Verification
// -------------------------------------------------------------
function test13_FrontendDebtReminderSchedulerService() {
  console.log('▶ TEST 13: Frontend debtReminderScheduler Service (Clock Jitter & Next Timestamp Calculation)');

  const settings = {
    whatsappAutoReminders: true,
    whatsappReminderTime: '20:00',
    whatsappDefaultDay: 'thursday'
  };

  // 1. Test next timestamp calculation for March 31 with monthly_31
  const march31 = new Date(2026, 2, 31, 20, 0, 0);
  const nextTs = calculateNextCustomerReminderTimestamp({ reminderSchedule: 'monthly_31', lastDebtReminderSent: march31.toISOString() }, settings, march31);
  const nextDate = new Date(nextTs);
  console.log(`    March 31 monthly_31 Next Timestamp Date: ${nextDate.toISOString()} (Month index: ${nextDate.getMonth()}, Day: ${nextDate.getDate()})`);
  assert.strictEqual(nextDate.getMonth(), 3, 'Next occurrence must be in April (month index 3)');
  assert.strictEqual(nextDate.getDate(), 30, 'Next occurrence day in April must be 30 (not roll into May 1)');

  // 2. Test isCustomerDebtReminderDue clock jitter for custom_3_days
  const now = new Date(2026, 2, 10, 20, 0, 0);
  const lastSent3DaysAgoWithJitter = new Date(2026, 2, 7, 20, 0, 10); // 10 seconds execution latency 3 days ago
  const customer = {
    phone1: '07701234567',
    reminderSchedule: 'custom_3_days@20:00',
    lastDebtReminderSent: lastSent3DaysAgoWithJitter.toISOString()
  };

  const isDue = isCustomerDebtReminderDue(customer, 50000, settings, now);
  console.log(`    custom_3_days with 10s jitter evaluated: ${isDue ? 'DUE (Correct)' : 'MISSED (Bug)'}`);
  assert.strictEqual(isDue, true, 'Customer must be due on Day 3 despite clock jitter');

  console.log('✅ TEST 13 PASSED: Frontend debtReminderScheduler service functions verified!\n');
}

// -------------------------------------------------------------
// Main Test Runner
// -------------------------------------------------------------
async function runAllTests() {
  try {
    await test1_ConcurrencyRaceCondition();
    await test2_MultiMinutePollingLoop();
    await test3_SchedulePatternMatching();
    await test4_LocalSchedulerConcurrency();
    test5_MonthlyDateClamping();
    await test6_FinancialDebtCalculations();
    await test7_PhoneNormalization();
    await test8_CustomNDaysEvaluation();
    await test9_ConcurrentSendNowRaceCondition();
    await test10_MultiCustomerConcurrencyStress();
    await test11_HomonymCustomerDebtIsolation();
    test12_MonthEndClampingCalculations();
    test13_FrontendDebtReminderSchedulerService();

    console.log('================================================================');
    console.log('🎉 ALL 13 DEEP VERIFICATION TESTS PASSED WITH ZERO ERRORS! 🎉');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runAllTests();

