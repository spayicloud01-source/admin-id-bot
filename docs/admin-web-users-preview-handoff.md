# Admin ID owner-managed web accounts — Preview handoff (2026-10-31)

## Scope
This work is **Preview only** on branch `feature/admin-password-login-preview-20261031`, PR #19 (Draft). Do not merge to Production without a complete runtime E2E and a secure storage/rate-limiting review.

## Features
- Existing admin `index.html` supports owner username/password alongside legacy owner LINE login.
- Under **เจ้าหน้าที่และสิทธิ์**, the owner may list/create/suspend/reactivate website users, change their permission set, and reset an individual user's temporary password (shown once).
- Owner password-change form requires the current owner password. The changed hash is stored in an encrypted override record, and prior password-authenticated sessions are invalidated by token version.
- Staff/admin sign in on the same main page, then redirect to `/staff.html`. Staff sessions have 12-hour expiry and are NEVER accepted as owner sessions.
- Staff functions are explicitly restricted to permitted customer details/history/slip review/payment queue. Live GAS `checkAccess` is called with that user's approved LINE ID and the required action permission.
- Staff accounts require an existing **approved, active LINE User ID** in the Apps Script staff sheet; creating a website account does NOT grant GAS permissions.
- Stored passwords use scrypt; account records are encrypted via AES-256-GCM with a separate Preview-only key.
- Owner changes, staff revocations, cross-role API isolation, and encrypted records have automated regression tests.

## Configuration
Preview branch-specific variables: `ADMIN_WEB_LOGIN_USERNAME`, `ADMIN_WEB_LOGIN_PASSWORD_HASH`, `ADMIN_AUTH_ENCRYPTION_KEY`; the existing Preview `OWNER_LINE_USER_ID` and `SHEETS_BRIDGE_SECRET` remain required. No plaintext passwords belong in the repo.
- `@vercel/blob@2.8.2` uses the existing connected **public** Blob store for AES-GCM ciphertext only under `admin-id/preview-user-v1/` until a private connection is available; never store plaintext records there. A separate private store `admin-id-preview-credentials-v2` (`store_Q1OXUVyPTz5Zzd7g`) already exists but is not connected because the project has an existing `BLOB_READ_WRITE_TOKEN`. In Vercel Storage → private store → Connect Project choose only Preview and Advanced Options env-var prefix `ADMIN_AUTH`. This creates `ADMIN_AUTH_BLOB_READ_WRITE_TOKEN` without replacing the public uploads token. Code also supports a manually configured `ADMIN_AUTH_BLOB_TOKEN`. Do not connect to Production until the full auth test passes.
- Best-effort IP rate limiting currently uses process memory. **Production must add a distributed limiter and/or WAF protection**.

## Routes
- `/api/web/password-login` -> shared `api/web/send.js?adminAuth=password`
- `/api/web/users` -> owner-only users management handler in shared web function
- `/api/web/staff` -> separate staff-only allowlisted handler in shared web function
- Static `/staff.html` for staff. Existing owner-only API routes continue rejecting staff-role tokens and validate owner password version.

## Tests
- `tests/admin-password-login.mjs`: password verification, session expiry, GAS owner role, best-effort throttling, same-origin.
- `tests/admin-web-login.mjs`: existing LINE browser token compatibility.
- `tests/admin-managed-users.mjs`: owner password update, create staff, role boundaries, revoke.
- `tests/admin-account-storage.mjs`: ciphertext, key isolation and optimistic concurrency.
- GitHub Actions on 2026-10-30 around 17:34Z confirmed the first three of these pass. Overall CI still fails in a **pre-existing daily-overdue-reminders.mjs** suite unrelated to this feature; do not suppress the failing reminder tests.
- A fresh Vercel Preview deployment has **not succeeded** because the Hobby account hit the API deployment quota (100 per 24 hours, response 402 `api-deployments-free-per-day`).

## Remaining gates before enabling on Production
1. Vercel Preview build READY with latest head SHA, exact route rewrites and no serverless function-limit violations (Hobby maximum 12).
2. Live Preview owner sign-in, change password, old-token revocation, creating staff, disabling staff, staff accessing permitted/forbidden routes, verify encrypted records.
3. Connect a private authentication Blob store and validate consistent reads + cross-instance revocation; implement distributed rate limiter before public production password login.
4. Do not send LINE messages or write real customer payment records during auth tests. Only deploy Production with explicit verification of all roles and recovery access.
