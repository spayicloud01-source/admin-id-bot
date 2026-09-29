# GAS 3+ Work handoff

Branch: `refactor/gas-3plus`

## Live progress, 2026-09-29 (Asia/Bangkok)

- The legacy bound project `Scriptตามยอด` was opened from backend spreadsheet `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`. A **new** `MigratePaymentState.gs` file was added; the existing `รหัส.gs` was not replaced or deployed.
- `migrateLegacyPaymentStateToSharedSheet()` ran successfully. A second idempotent run using a temporary logging wrapper showed `{"ok":true,"paymentKeys":0,"migrated":0,"unmapped":[],"sheet":"สถานะชำระ"}`. There were no legacy `payment-cycle:*` properties to migrate at that time.
- `Admin ID - Customer`: script ID `1GMdEIm2RFVpEPoza72Z39VQEyRm-9zLTcM3wu-oz6Z-qGAGu-WK3qXiU`. Full `AdminIdBridge.gs` release `2026.09.29-127` was pasted and saved. `BACKEND_SPREADSHEET_ID` and `BRIDGE_ROLE=customer` were saved.
- `Admin ID - Payment`: script ID `13lz3B4O0Es8dHPFN8wPFJ1v0AttdaZG_FnBxhIQeKwixGg3LhJB8RdWv`. Full `AdminIdBridge.gs` release `2026.09.29-127` was pasted and saved. `BACKEND_SPREADSHEET_ID` and `BRIDGE_ROLE=payment` were saved.
- Creation of `Admin ID - Notify` was initiated, but its project ID and completion were **not** observed. Find it by name before creating another project to avoid a duplicate.
- The bridge secret has **not** been copied to any new project. No new Web App has been deployed, no dedicated URL has been configured in Vercel, and PR #10 has **not** been merged. Production remains on the legacy bridge.
- Work paused when the browser tool's automatic approval review returned a usage-limit error. Do not infer that the pending Notify creation finished.

Next: confirm the Notify project state; finish its code and role/backend properties; add the existing bridge secret to all three projects; deploy and verify all three `/exec` endpoints; configure dedicated Preview URLs while keeping the legacy fallback; run the full preview and live LINE tests below. Do not merge until all required tests pass.

Do **not** merge to `main` until all three Apps Script deployments below are live and the preview checks pass.

## What is already implemented

- Vercel bridge routes actions by role: `customer`, `payment`, `notify`.
- If a dedicated role URL is not configured, Vercel continues using the existing `GOOGLE_APPS_SCRIPT_URL`.
- GAS supports `BRIDGE_ROLE` and rejects actions assigned to another role.
- Current GAS version on this branch: `2026.09.29-127`.
- Manual notification queue inserts are batched with `setValues()`.
- Automatic reminder new-row inserts are batched with `setValues()`.
- Existing CacheService behavior is retained for customer/search/settings reads.
- Existing reminder trigger logic is retained.
- Production is untouched; changes are on a feature branch only.

## Before creating the three projects: migrate shared payment state

Backend spreadsheet already confirmed:

- Title: `หลังบ้านขาย/ฝาก`
- Spreadsheet ID: `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`
- The shared backend tab `สถานะชำระ` has already been created with the required 9-column header. Do not create a duplicate tab.


The old bound Apps Script currently stores partial-payment cycle state in Script Properties. Script Properties are isolated per Apps Script project, so this state must be copied to the shared backend spreadsheet before switching to three projects.

1. Open the **current/legacy bound Apps Script** editor.
2. Add a new temporary script file and paste only `apps-script/MigratePaymentState.gs` from this branch. **Do not replace or edit the existing AdminIdBridge.gs.**
3. Run `migrateLegacyPaymentStateToSharedSheet()` manually once.
4. The helper writes the legacy `payment-cycle:*` Script Properties into the already-created shared sheet `สถานะชำระ`.
5. The result must show `ok: true` and `unmapped: []`.
6. If `unmapped` is not empty, stop rollout and investigate those payment-cycle keys before switching traffic.
7. After a successful migration, the temporary migration file may be deleted from the legacy editor.

This avoids replacing the legacy source code. The current production Web App deployment and existing trigger logic remain unchanged during migration.

## Create three Google Apps Script projects

Use the exact current file from this branch:

`apps-script/AdminIdBridge.gs`

Initially copy the same full file into all three projects. Do not manually delete functions yet; role gating provides isolation without risking missing dependencies.

### Project 1: Admin ID - Customer

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BACKEND_SPREADSHEET_ID` = `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`
- `BRIDGE_ROLE` = `customer`

Deploy as Web App and save the `/exec` URL.

### Project 2: Admin ID - Payment

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BACKEND_SPREADSHEET_ID` = `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`
- `BRIDGE_ROLE` = `payment`

Deploy as Web App and save the `/exec` URL.

### Project 3: Admin ID - Notify

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BACKEND_SPREADSHEET_ID` = `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`
- `BRIDGE_ROLE` = `notify`

Deploy as Web App and save the `/exec` URL.

The three new projects may be standalone. They must all use the same `BACKEND_SPREADSHEET_ID`. The bridge helper opens that spreadsheet explicitly, so they do not depend on `getActiveSpreadsheet()`.

Shared partial-payment cycle state is stored in the backend sheet `สถานะชำระ`; it is no longer read from per-project Script Properties.

## Verify each GAS deployment before touching production

Open each Web App URL with GET.

Expected response shape:

```json
{
  "ok": true,
  "service": "Admin ID Google Sheets Bridge",
  "version": "2026.09.29-127",
  "role": "customer"
}
```

The role must match the project.

Repeat for `payment` and `notify`.

## Vercel environment variables

Add the three URLs:

- `GOOGLE_APPS_SCRIPT_CUSTOMER_URL`
- `GOOGLE_APPS_SCRIPT_PAYMENT_URL`
- `GOOGLE_APPS_SCRIPT_NOTIFY_URL`

Keep these existing variables during rollout:

- `GOOGLE_APPS_SCRIPT_URL`
- `SHEETS_BRIDGE_SECRET`

Do not remove the legacy URL yet. It is the rollback path.

Optional: separate secrets are supported later with:

- `GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET`
- `GOOGLE_APPS_SCRIPT_PAYMENT_SECRET`
- `GOOGLE_APPS_SCRIPT_NOTIFY_SECRET`

If they are absent, all roles use `SHEETS_BRIDGE_SECRET`.

## Vercel routing

Customer/default examples:

- `getCustomerSelf`
- `requestCustomerBinding`
- `searchCustomer`
- `getCustomerInfo`
- staff/access/admin reads

Payment examples:

- `queuePayment`
- `queueSlipReview`
- `queueClose`
- `listReviewQueue`
- `resolveReviewQueue`
- `rollbackReviewQueue`

Notify examples:

- `buildCustomerNotificationBatch`
- `getCustomerReminderBatch`
- `markCustomerReminderSent`
- `getReminderBatch`
- `markReminderSent`
- notification recipient lookups

## Required preview tests

1. Preview deployment must be READY.
2. Check `/api/health`.
3. Check `/api/sheets/diagnostics`.
4. Check GET on all three GAS URLs: version `2026.09.29-127`, correct role.
5. Customer:
   - customer lookup
   - bound customer "ข้อมูล"
   - LINE customer buttons
6. Payment:
   - search/payment lookup
   - `queue amount`
   - approve
   - confirm source sheet write
   - cancel/rollback test with a safe test row
7. Notify:
   - send one customer
   - custom message
   - payment notice
   - close notice
   - automatic reminder batch
8. Confirm notification queue row numbers/statuses are correct after batch insert.
9. Confirm `สถานะชำระ` reflects partial payments and rollback correctly.
10. Confirm a partial payment approved in Payment is immediately visible from Customer and Notify reads.
11. Confirm only these active data tabs are used:
   - `v6 -> V6/10-69`
   - `v1/v3 -> v3/10-69`
12. Compare response times before/after.

## Rollback

If one role has a problem, remove only that role's dedicated URL from Vercel and redeploy.

Example: if Notify fails, remove `GOOGLE_APPS_SCRIPT_NOTIFY_URL`.

Vercel will automatically route Notify actions back through the existing `GOOGLE_APPS_SCRIPT_URL`.

Do not remove the legacy bridge until the split system has been stable in production.

## Final rollout

Only after all tests pass:

1. Merge `refactor/gas-3plus` into `main`.
2. Verify production deployment READY.
3. Run deep health and live LINE smoke tests.
4. Keep legacy GAS URL configured for rollback during the stabilization period.
