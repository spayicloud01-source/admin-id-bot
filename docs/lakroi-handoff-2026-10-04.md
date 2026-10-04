# Lakroi continuation — 4 October 2026

## Verified current state

- User requires a dedicated Lakroi project, separate from Admin ID.
- Vercel project list still has no dedicated Lakroi project. Earlier creation failed with HTTP 403; this turn did not retry creation or change permissions.
- Production deployment `dpl_2GAvVhcpR1wRfG7YHZQgZN8L2MdP` is READY at commit `775f230a3fcee2fd4b955e48acc02a7313a215bb`.
- Active UI: `/lakroi-dashboard/`; active API: `/api/health?lakroi=1`. The nested `lakroi-dashboard/api/data.js` is not the API called by that UI.
- The active API reads `lib/lakroiSeed.js`, NOT live Google Sheets. Refreshing every ten seconds does not make it live. Its former `updatedAt` was request time, not source sync time.
- Source: spreadsheet `1m8HfLnsrtf3TGFPeJOAfSfSZlBTQyZ6mN4WU_QrIruA`, tab `บิลขาย`, sheetId `68391922`. Columns A/B/C/D/E/F/G/H/K are date/time/branch/product/sales/seller/cash/transfer/Thai program.
- Direct connector read of A2:L160 returned 127 nonblank bills ending at row 131: total 79,600; cash 19,169. Existing snapshot sales total matched, but the UI counted cash as 18,019 because it treated each bill as a single payment method.
- October 4 has nine bills totaling 4,460.

## Patch and verification

- Preserve explicit cash/transfer/Thai-program amounts in the active snapshot. All 127 rows matched date, time and amount before adding payment breakdowns.
- Show actual snapshot verification timestamp and label it a snapshot.
- Make GET side-effect free; never overwrite older cloud-only bills while reading.
- Reject sales additions/deletions/edits in snapshot mode instead of acknowledging writes that will disappear on refresh. Photos and goal updates remain allowed, preserving existing cloud-only records.
- Propagate failed saves, retain the open form, update browser state only after server success; authoritative empty results do not auto-upload old browser records.
- Test: `node tests/lakroi-snapshot-safety.mjs` passed. This is targeted API/inline-script verification, not deployed/browser verification.

## Remaining blockers / next steps

- Apps Script UI was inaccessible in this session: `https://script.google.com/home` redirected to `https://www.google.com/script/start/`, which returned 502 with connection refused, including one reload. No script edits/deployments were made.
- Locate the existing “หลักร้อย Dashboard” Apps Script project when access works. Read its actual code/deployments before adding another project. Deploy a dedicated authenticated bridge to read and write the source tab, with stable row IDs, idempotent writes and a lock. Do not use the unrelated Admin ID source spreadsheet.
- Create the dedicated Vercel project using the authorized account, wire dedicated bridge credentials, and migrate the UI/API. Do not claim a split from merely having a nested folder. Do not copy unrelated LINE/Admin ID secrets.
- Decide a canonical standalone API before migration: the nested API still uses the older Blob-only implementation and must NOT be deployed as-is.
- Reconcile any older cloud-only bills against the sheet before counting, migrating or deleting them. Preserve records until reconciliation.
- Enable sales editing only when writes are actually persisted to the sheet. Verify against live sheet totals and real mobile layout before promotion. Retire the old route only after the new deployment is working.
- This branch is not merged or deployed to production, respecting the user's request to split the project.
