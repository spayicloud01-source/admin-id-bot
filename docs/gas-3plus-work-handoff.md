# GAS 3+ Work handoff

Branch: `refactor/gas-3plus`

Do **not** merge to `main` until all three Apps Script deployments below are live and the preview checks pass.

## What is already implemented

- Vercel bridge routes actions by role: `customer`, `payment`, `notify`.
- If a dedicated role URL is not configured, Vercel continues using the existing `GOOGLE_APPS_SCRIPT_URL`.
- GAS supports `BRIDGE_ROLE` and rejects actions assigned to another role.
- Current GAS version on this branch: `2026.09.29-126`.
- Manual notification queue inserts are batched with `setValues()`.
- Automatic reminder new-row inserts are batched with `setValues()`.
- Existing CacheService behavior is retained for customer/search/settings reads.
- Existing reminder trigger logic is retained.
- Production is untouched; changes are on a feature branch only.

## Create three Google Apps Script projects

Use the exact current file from this branch:

`apps-script/AdminIdBridge.gs`

Initially copy the same full file into all three projects. Do not manually delete functions yet; role gating provides isolation without risking missing dependencies.

### Project 1: Admin ID - Customer

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BRIDGE_ROLE` = `customer`

Deploy as Web App and save the `/exec` URL.

### Project 2: Admin ID - Payment

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BRIDGE_ROLE` = `payment`

Deploy as Web App and save the `/exec` URL.

### Project 3: Admin ID - Notify

Script Properties:

- `SHEETS_BRIDGE_SECRET` = same secret used by the current bridge
- `BRIDGE_ROLE` = `notify`

Deploy as Web App and save the `/exec` URL.

The three projects must be bound to or otherwise operate against the same backend spreadsheet context as the current bridge. Verify this before switching Vercel.

## Verify each GAS deployment before touching production

Open each Web App URL with GET.

Expected response shape:

```json
{
  "ok": true,
  "service": "Admin ID Google Sheets Bridge",
  "version": "2026.09.29-126",
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
4. Check GET on all three GAS URLs: version `126`, correct role.
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
9. Confirm only these active data tabs are used:
   - `v6 -> V6/10-69`
   - `v1/v3 -> v3/10-69`
10. Compare response times before/after.

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
