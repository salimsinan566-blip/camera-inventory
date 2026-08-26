# Original User Request

## Initial Request — 2026-08-26T11:36:13Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Small focused team

This is a single self-contained fix; keep it small and focused.
إصلاح مشكلة تكرار إرسال رسائل الواتساب المجدولة في نفس الوقت، حيث يستمر النظام بإرسال الرسائل حتى يتم إيقافه يدوياً.

Working directory: c:\Users\user\Downloads\camera-inventory-merged-stock\camera-inventory
Integrity mode: demo

## Requirements

### R1. Prevent duplicate scheduled messages
Fix the cron/scheduling logic (likely in `api/cron-debt-reminders.js` or `whatsapp-server/server.mjs`) so that when the scheduled time arrives, the WhatsApp message is sent exactly once. It must not get stuck in a loop or send multiple times concurrently.

### R2. Verification test script
Create a test script that simulates the cron job triggering multiple times concurrently to prove the bug is fixed and race conditions are handled.

## Acceptance Criteria

### Reliability
- [ ] The test script triggers the message sending logic at least 5 times concurrently.
- [ ] Only exactly ONE message is dispatched/processed as a result of the concurrent triggers.
- [ ] The fix relies on a robust mechanism (like a transaction, lock, or atomic state update) rather than just a simple delay.
