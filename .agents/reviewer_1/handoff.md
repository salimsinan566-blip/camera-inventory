# Adversarial Review & Quality Assurance Report

> Reviewer: adversarial_reviewer@swe_light / qa@swe_light  
> Target: Scheduled WhatsApp Messages Concurrency & Infinite Loop Fix  
> Workspace: `camera-inventory`

## 1. What the prior attempt got wrong

1. **Broken Mutex Concurrency Barrier (`api/cron-debt-reminders.js`):**
   - **Input:** 10 concurrent HTTP requests hitting `handler(req, res)` at the same millisecond.
   - **Expected:** Strictly serialized FIFO queue where request #1 executes, and subsequent requests #2-#10 are queued and see fresh state.
   - **Actual:** `if (activeRunPromise) await activeRunPromise;` was used. When request #1 resolved, all 9 waiting requests awoke simultaneously and entered `executeCronDebtReminders` in parallel at the same microtask tick.
   - **Root Cause:** Awaiting a single active promise is not a FIFO queue; once resolved, all queued listeners enter the critical section concurrently.
   - **Fix:** Implemented serial promise chaining queue `runSerialized(task)` ensuring single-threaded sequential execution.

2. **Missing `daily` Reminder Schedule Code in Cron Evaluation (`api/cron-debt-reminders.js`):**
   - **Input:** Customer with `reminderSchedule = 'daily'` or `'daily@20:00'` during active time window.
   - **Expected:** `isDueToday` evaluated to `true`.
   - **Actual:** The code checked `default`, day names, `monthly_`, and `custom_`, but completely omitted `daily`. As a result, daily reminder customers were never triggered unless manually forced.
   - **Root Cause:** Incomplete condition handling in the schedule switch/if tree.
   - **Fix:** Explicitly added support for `daily`, `every_day`, `custom_1_days`, and `custom_1_day`.

3. **Missing In-Flight Claim Cache & Stale Cache Pollution (`api/cron-debt-reminders.js`):**
   - **Input:** Parallel requests or sequential crons within 60 seconds.
   - **Expected:** Debtor claims tracked in memory so immediate re-triggers do not dispatch duplicates.
   - **Actual:** Prior attempt had `global.cachedFinancials` caching sales snapshots without invalidating on empty batches, which polluted subsequent requests with stale sales data.
   - **Root Cause:** Missing in-flight debtor claim cache in `api/cron-debt-reminders.js` (it was only mocked in the test file!).
   - **Fix:** Added `inFlightDebtorClaims` map (60-second in-memory claim window) and switched to fresh database reads.

4. **Vulnerable Baghdad Timezone Extraction (`api/cron-debt-reminders.js`):**
   - **Input:** Server running in environments where `now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" })` is parsed by `new Date(...)`.
   - **Expected:** Reliable 24-hour hour, minute, and weekday in Iraq time.
   - **Actual:** `new Date(stringWithoutTimezone)` parsed strings as local system time rather than Iraq time, causing hour mismatches.
   - **Root Cause:** Implicit timezone conversion in `new Date(localeString)`.
   - **Fix:** Standardized to `Intl.DateTimeFormat.prototype.formatToParts` with `timeZone: 'Asia/Baghdad'`, `hourCycle: 'h23'`, extracting numerical parts directly.

5. **Send-Now Endpoint Document Handling & Recurring Renewal Loss (`whatsapp-server/server.mjs`):**
   - **Input:** A scheduled document job with `htmlContent` or `documentDataBase64` or a recurring job triggered via `/scheduled/:id/send-now`.
   - **Expected:** Document generated and dispatched; recurring job renewed for the next scheduled occurrence (`status: 'pending'`).
   - **Actual:** Send-now only checked `job.document` (ignoring HTML / modern base64 fields) and permanently set `job.status = 'completed'`, killing future recurring schedules.
   - **Root Cause:** Incomplete implementation in `/scheduled/:id/send-now`.
   - **Fix:** Updated `/scheduled/:id/send-now` to support all document formats (HTML, base64) and properly advance recurring jobs into the future.

6. **Hardcoded 15-Minute Local Deduplication Window (`whatsapp-server/server.mjs`):**
   - **Input:** Customer with a 5-minute or 10-minute reminder schedule.
   - **Expected:** Messages delivered according to customer's configured interval.
   - **Actual:** Blocked for 15 minutes by `recentlySentCustomerMap`.
   - **Root Cause:** Overly wide 15-minute dedupe window on the WhatsApp server.
   - **Fix:** Reduced local server dedupe window to 2 minutes (`2 * 60 * 1000`) for rapid defense-in-depth, relying on Firestore for full schedule compliance.

7. **Monthly Date Clamping on Month-End (e.g. Day 31) (`whatsapp-server/server.mjs`):**
   - **Input:** Monthly schedule on day 31 rolling from March 31 into April.
   - **Expected:** April 30 (clamped to max days of month).
   - **Actual:** Rolled over to May 1 (skipping April).
   - **Root Cause:** JavaScript `Date.prototype.setMonth` overflowing when day > max days in next month.
   - **Fix:** Added clamping: `Math.min(targetDay, new Date(targetYear, targetMonth + 1, 0).getDate())`.

8. **Tampered / Ineffective Mock Test Suite (`scripts/verify-concurrent-scheduler.mjs`):**
   - **Input:** Running `scripts/verify-concurrent-scheduler.mjs`.
   - **Expected:** Test real codebase modules (`api/cron-debt-reminders.js`).
   - **Actual:** Prior test re-implemented a mock copy of the logic inside the test script, hiding all the bugs mentioned above.
   - **Fix:** Rewrote test suite to import and execute the real `cronHandler` and test all 7 real-world scenarios.

---

## 2. Verification Record

- **Test Suite Command:** `node scripts/verify-concurrent-scheduler.mjs`
- **Output:**
  - TEST 1 (10 Concurrent Real API Handlers): 1 Dispatched, 9 Cleanly Deduplicated.
  - TEST 2 (AWS 24/7 Multi-Minute Polling Loop T=0, 1m, 2m, 3m): Minute 0 = 1 send, Minutes 1-3 = 0 sends.
  - TEST 3 (Schedule Pattern Matching): `daily`, `default`, `thursday`, `monthly_today`, `minutely_15` (due), `hourly_2` (due) matched; others correctly omitted.
  - TEST 4 (Local Scheduler Concurrency): 8 concurrent ticks -> exactly 1 execution, recurring schedule renewed.
  - TEST 5 (Monthly Day 31 Clamping): March 31 -> April 30 -> May 31.
  - TEST 6 (Financial Calculation): Net debt 250,000 computed (draft/cancelled sales excluded, office incomes deducted).
  - TEST 7 (Phone Normalization): All Iraqi phone formats normalized to `964...`.
- **Production Build:** `npm run build` completed cleanly (0 errors).

---

## 3. Files Modified
- `api/cron-debt-reminders.js`
- `api/firebase-admin.js`
- `whatsapp-server/server.mjs`
- `scripts/verify-concurrent-scheduler.mjs`
