import assert from 'node:assert';
import cronHandler from '../../api/cron-debt-reminders.js';

console.log('--- INDEPENDENT AUDIT STRESS TEST ---');

function createMockDb(initialStore = {}) {
  const store = JSON.parse(JSON.stringify(initialStore));
  return {
    collection: (colName) => ({
      get: async () => {
        // Random network delay between 5ms and 30ms to create maximum concurrency interleaving
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 5));
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
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 5));
          const colData = store[colName] || {};
          const exists = docId in colData;
          return {
            id: docId,
            exists,
            data: () => (exists ? { ...colData[docId] } : undefined)
          };
        },
        set: async (data, options = {}) => {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 5));
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

function createMockReqRes() {
  let statusCode = 200;
  let bodyData = null;
  const req = {
    method: 'GET',
    query: { force: 'true', returnOnly: 'true' }
  };
  const res = {
    setHeader: () => res,
    status: (code) => { statusCode = code; return res; },
    json: (data) => { bodyData = data; return res; },
    end: () => res,
    _getStatusCode: () => statusCode,
    _getBody: () => bodyData
  };
  return { req, res };
}

async function runIndependentAudit() {
  const mockDb = createMockDb({
    settings: {
      store_info: {
        whatsappAutoReminders: true,
        whatsappReminderTime: '20:00',
        whatsappDefaultDay: 'thursday',
        storeName: 'المتجر الرئيسي'
      }
    },
    customers: {
      auditor_test_cust_1: {
        name: 'عميل تدقيق الأمان',
        phone1: '07709876543',
        reminderSchedule: 'daily',
        lastDebtReminderSent: null
      }
    },
    sales: {
      sale_audit_1: {
        customerId: 'auditor_test_cust_1',
        customerName: 'عميل تدقيق الأمان',
        invoiceType: 'debt',
        total: 500000,
        paidAmount: 100000,
        remainingDebt: 400000,
        status: 'completed'
      }
    }
  });

  global._testDb = mockDb;

  // Fire 20 parallel requests concurrently!
  const CONCURRENCY_COUNT = 20;
  console.log(`[Independent Audit] Firing ${CONCURRENCY_COUNT} parallel requests simultaneously against real cronHandler...`);

  const promises = Array.from({ length: CONCURRENCY_COUNT }, async (_, idx) => {
    const { req, res } = createMockReqRes();
    await cronHandler(req, res);
    return {
      index: idx + 1,
      status: res._getStatusCode(),
      data: res._getBody()
    };
  });

  const results = await Promise.all(promises);

  let totalDebtorsDispatched = 0;
  let winnerRequests = 0;
  let deduplicatedRequests = 0;

  for (const r of results) {
    const debtors = r.data?.results || [];
    if (debtors.length > 0) {
      winnerRequests++;
      totalDebtorsDispatched += debtors.length;
    } else {
      deduplicatedRequests++;
    }
  }

  console.log(`[Independent Audit] Total Dispatched Debtors: ${totalDebtorsDispatched}`);
  console.log(`[Independent Audit] Winning Request Count: ${winnerRequests}`);
  console.log(`[Independent Audit] Deduplicated Count: ${deduplicatedRequests}`);

  assert.strictEqual(totalDebtorsDispatched, 1, `Expected exactly 1 total debtor dispatched, but got ${totalDebtorsDispatched}`);
  assert.strictEqual(winnerRequests, 1, `Expected exactly 1 winning request, but got ${winnerRequests}`);
  assert.strictEqual(deduplicatedRequests, 19, `Expected 19 requests to be deduplicated, but got ${deduplicatedRequests}`);

  const customerInDb = mockDb._getStore().customers.auditor_test_cust_1;
  assert(customerInDb.lastDebtReminderSent, 'lastDebtReminderSent must be updated');
  assert(customerInDb.lastDebtReminderClaimedAt, 'lastDebtReminderClaimedAt must be updated');

  console.log('>>> INDEPENDENT AUDIT PASSED: ZERO RACE CONDITIONS DETECTED UNDER 20 PARALLEL REQUESTS! <<<');
}

runIndependentAudit().catch(err => {
  console.error('INDEPENDENT AUDIT FAILED:', err);
  process.exit(1);
});
