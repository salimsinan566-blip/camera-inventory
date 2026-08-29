# Handoff Report: WhatsApp Scheduled Messages Duplicate Loop Fix

## Executive Summary
Fixed the critical issue where scheduled WhatsApp messages and automated debt reminders were continuously being re-sent concurrently and stuck in an infinite sending loop until manually stopped. 

## Root Cause Analysis
1. **Stale In-Memory Cache without Invalidation (`api/cron-debt-reminders.js`):**
   A global cache (`global.cachedFirebaseData`) cached all customer snapshots for 15 minutes. When the AWS WhatsApp 24/7 background interval (which polls every 60 seconds) queried the endpoint, the first run fetched the debtor, dispatched the message, and marked the customer as sent in Firestore. However, subsequent polls at minute 1, minute 2, ..., minute 14 continued reading from the stale in-memory snapshot where `lastDebtReminderSent` was still null/old. This caused the system to repeatedly return the debtor and re-send WhatsApp messages every 60 seconds in an endless loop.

2. **Race Conditions on Concurrent Invocations:**
   When multiple cron triggers or scheduler events fired concurrently, multiple requests queried the database simultaneously before `lastDebtReminderSent` was recorded. Each concurrent thread saw the customer as eligible and dispatched duplicate messages simultaneously.

3. **Local Scheduler Concurrency & Stale Writes (`whatsapp-server/server.mjs`):**
   The scheduler interval (`setInterval` 3000ms) had no mutex locking or in-flight job tracking. If message dispatch or PDF generation took longer than 3 seconds, overlapping ticks could pick up the same pending job multiple times. Furthermore, concurrent file writes to `scheduled_messages.json` risked overwriting status transitions.

## Changes Implemented

1. **`api/cron-debt-reminders.js`:**
   - **Real-Time Customer Reads:** Removed stale multi-minute customer snapshot caching. Customer records and `lastDebtReminderSent` status are now read fresh from Firestore on every check.
   - **Atomic In-Flight Claiming:** When due debtors are identified, their Firestore documents are immediately updated with `lastDebtReminderSent` and `lastDebtReminderClaimedAt` before returning the batch, instantly closing the race condition window for parallel/subsequent triggers.
   - **Runtime Concurrency Mutex (`activeRunPromise`):** Requests arriving concurrently within the same runtime await the active evaluation, ensuring serialized execution with fresh state.
   - **Cache Invalidation:** Invalidation of financial caches upon customer claims and `markSent` updates.
   - **Baghdad Timezone Accuracy:** Standardized Iraq date comparisons (`YYYY-MM-DD`) via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })`.

2. **`whatsapp-server/server.mjs`:**
   - **Scheduler Runner Mutex (`isSchedulerRunning`):** Guards the 3-second scheduler runner against concurrent re-entry.
   - **In-Flight Job Locking (`inFlightJobIds`):** Tracks executing job IDs in memory to strictly prevent duplicate processing across concurrent ticks and `/scheduled/:id/send-now` manual triggers.
   - **AWS 24/7 Cron Mutex (`isAwsCronRunning`) & Local Sent Cache:** Added `recentlySentCustomerMap` (15-minute deduplication window) on the server side as defense-in-depth against remote network glitches.
   - **Atomic Temp File Writes:** `saveScheduledJobs` uses temp-file write + atomic rename to prevent file corruption.
   - **Strict Future Advancement for Recurring Jobs:** Enforced that recurring job renewals advance strictly into the future (`targetTimestamp >= now + 60s`).

3. **`api/firebase-admin.js`:**
   - Added support for `set(data, { merge: true })` in the client DB wrapper to ensure consistent atomic update capabilities across Admin and Client SDK fallbacks.

4. **`scripts/verify-concurrent-scheduler.mjs`:**
   - Automated test suite covering:
     1. 10 parallel concurrent triggers proving exactly 1 message dispatch.
     2. Multi-minute AWS 24/7 cron loop simulation proving zero duplicate sends across consecutive polling intervals.
     3. Local scheduler mutex & in-flight lock concurrency under parallel triggers.
     4. Recurring schedule timestamp advancement into the future.

## Verification Results
- **Test Suite Command:** `node scripts/verify-concurrent-scheduler.mjs`
- **Result:** ALL 4 TESTS PASSED (10 parallel requests -> 1 dispatch, 9 deduplicated; minute 0 -> 1 send, minutes 1-3 -> 0 sends; 8 concurrent ticks -> 1 execution).
- **Production Build:** `npm run build` completed successfully without any compilation errors.
