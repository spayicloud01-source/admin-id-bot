# GAS 3+ Work handoff

Branch: `refactor/gas-3plus`

## Live progress, 2026-09-30 20:xx (Asia/Bangkok)

- PR #10 is still Draft and unmerged. Branch head before this documentation update: `efc9a738893a5fd4573550276c80bffbf2e141f4`. GitHub CI succeeded and Vercel Preview is READY. Production evolved independently on `main` with the latest fine-receipt changes; do not overwrite it from an older bridge.
- Found and renamed the existing unfinished Notify project, script ID `19bLLYOJFgM7170tNeRE3c93JkSeQ_Jz0W4ZjyZUsSjkQdQgREjzRBR7v`; no duplicate was created.
- Customer, Payment, and Notify now each contain the complete current `apps-script/AdminIdBridge.gs` source, release `2026.09.30-129`. Full editor copies were compared with the branch file before saving. The branch source must be checked again immediately before deploy if new commits arrive.
- All three Script Properties contain the backend spreadsheet ID, their respective `BRIDGE_ROLE`, and the same existing `SHEETS_BRIDGE_SECRET` (value must not be put in GitHub). Customer also has its legacy paused-conversation property. Notify has the legacy reminder target list. All three timezones are Bangkok.
- No new Web App is live yet. Customer deploy was started with owner-only access, then Google presented an unverified-app warning requesting sensitive account access. Automatic approval review rejected clicking the warning's unsafe continuation. Do not bypass it without explicit user action/authorization. Broad Web App access `Anyone` was separately rejected by automatic approval review until explicitly authorized. No `/exec` URLs were collected; no dedicated Vercel URL variables were set; no live split-role tests have passed.
- Vercel owner account `tortor55555568@gmail.com` was authenticated and the project Environment Variables page was opened. Existing `GOOGLE_APPS_SCRIPT_URL` remains configured in Preview and Production. Preserve it as fallback. Do not install a second daily reminder trigger during Preview because the legacy trigger remains active.
- Next: finish Google OAuth and access decisions through the approved flow, deploy all three Web Apps, verify GET release `2026.09.30-129` and correct roles, set three Preview-only URLs, redeploy Preview, then run the full safe test matrix below. Keep PR #10 Draft and unmerged until all pass.

## Live progress, 2026-09-29 (Asia/Bangkok)

- The legacy bound project `Scriptตามยอด` was opened from backend spreadsheet `1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc`. A **new** `MigratePaymentState.gs` file was added; the existing `รหัส.gs` was not replaced or deployed.
- `migrateLegacyPaymentStateToSharedSheet()` ran successfully. A second idempotent run using a temporary logging wrapper showed `{"ok":true,"paymentKeys":0,"migrated":0,"unmapped":[],"sheet":"สถานะชำระ"}`. There were no legacy `payment-cycle:*` properties to migrate at that time.
- `Admin ID - Customer`: script ID `1GMdEIm2RFVpEPoza72Z39VQEyRm-9zLTcM3wu-oz6Z-qGAGu-WK3qXiU`. Full `AdminIdBridge.gs` release `2026.09.29-127` was pasted and saved. `BACKEND_SPREADSHEET_ID` and `BRIDGE_ROLE=customer` were saved.
- `Admin ID - Payment`: script ID `13lz3B4O0Es8dHPFN8wPFJ1v0AttdaZG_FnBxhIQeKwixGg3LhJB8RdWv`. Full `AdminIdBridge.gs` release `2026.09.29-127` was pasted and saved. `BACKEND_SPREADSHEET_ID` and `BRIDGE_ROLE=payment` were saved.
- Creation of `Admin ID - Notify` was initiated, but its project ID and completion were **not** observed. Find it by name before creating another project to avoid a duplicate.
- The bridge secret has **not** been copied to any new project. No new Web App has been deployed, no dedicated URL has been configured in Vercel, and PR #10 has **not** been merged. Production remains on the legacy bridge.
- Work paused when the browser tool's automatic approval review returned a usage-limit error. Do not infer that the pending Notify creation finished.
- After those two projects were prepared, branch commit `2fc7518` fixed two stale `readinessCheck_` expectations (release 127 and exactly two active sources). **Refresh `AdminIdBridge.gs` in Customer and Payment from the current branch before deploying**; both currently contain the earlier release-127 source without this fix. Use that same current file for Notify.

Next: confirm the Notify project state; refresh Customer and Payment source, then finish Notify code and role/backend properties; add the existing bridge secret to all three projects; deploy and verify all three `/exec` endpoints; configure dedicated Preview URLs while keeping the legacy fallback; run the full preview and live LINE tests below. Inspect legacy per-project customer pause and reminder properties before cutover, because those properties do not automatically transfer to new projects. Do not merge until all required tests pass.

Do **not** merge to `main` until all three Apps Script deployments below are live and the preview checks pass.

## What is already implemented

- Vercel bridge routes actions by role: `customer`, `payment`, `notify`.
- If a dedicated role URL is not configured, Vercel continues using the existing `GOOGLE_APPS_SCRIPT_URL`.
- GAS supports `BRIDGE_ROLE` and rejects actions assigned to another role.
- Current GAS version on this branch: `2026.09.30-129` (recheck immediately before deployment).
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
  "version": "2026.09.30-129",
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
4. Check GET on all three GAS URLs: version `2026.09.30-129` (or later current branch version), correct role.
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

