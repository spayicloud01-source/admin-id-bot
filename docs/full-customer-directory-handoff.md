# Admin ID — show all customers in exactly V3 + V6 (2026-11-02)

## Current state

- Branch: `feature/full-customer-directory-v3v6-20261102`
- Vercel Preview READY build: `dpl_8hUuvNagFkFUqzLjeJse1MZN1fiS` (commit `f9b67d24ee2d5f384e53d0fdbce767846ad9f43f`)
- **Not yet deployed to Production**. The latest Production website still uses the prior roster listing only LINE-linked customers.
- This branch has a Vercel owner-only endpoint `GET /api/web/customer-directory?page=0` and a new `listAllCustomers` action in `apps-script/AdminIdBridge.gs`. The new GAS action is **NOT yet deployed**.
- Tests passed on Vercel Preview, including `tests/gas-full-customer-directory.mjs`: V3, V6, unlinked customers and closed accounts, access restrictions, pagination and no writes.

## Critical next step: update only Customer GAS (not Payment or Notify)

The existing live project `Admin ID - Customer` (script ID `1GMdEIm2RFVpEPoza72Z39VQEyRm-9zLTcM3wu-oz6Z-qGAGu-WK3qXiU`) must receive a MINIMAL patch. Use authenticated Google Apps Script Editor / ChatGPT Work Cloud Browser. **Do not overwrite the entire live script with an older GitHub snapshot.** Compare installed source with repo first.

Patch from `apps-script/AdminIdBridge.gs` in this branch:
1. In the `doPost` switch, insert `case 'listAllCustomers': result = listAllCustomers_(body); break;` adjacent to `listDueCustomers`.
2. Add function `listAllCustomers_(body)` immediately above `listDueCustomers_(body)`. This function is self-contained and uses the already-installed `checkAccess_`, `backendSpreadsheet_`, `detectHeaders_`, `getCell_`, and `CONFIG` helpers.
3. Save in Customer GAS; check no naming conflicts, role `BRIDGE_ROLE=customer`, and `BACKEND_SPREADSHEET_ID` retained. Keep other Apps Script projects untouched.
4. Deploy > Manage deployments > Edit existing Customer Web App > New version. Keep its existing URL, permissions, and deployment ID. Do not create a new webhook, new trigger, or a second Web App.
5. Test `listAllCustomers` with a valid owner context via the existing Customer bridge; page 0 includes BOTH linked and unlinked customers and closed records. Validate paging and source/sheet scope. Do not use scripts containing a live secret in chat or commits.

## Production publication (after GAS deployed)

1. Deploy current branch `f9b67d24ee2d5f384e53d0fdbce767846ad9f43f` to a staged Production build; check READY and review build tests.
2. Authenticated owner `panu`: GET `/api/web/customer-directory?page=0` returns `ok:true` and items from `v1/v3/v3/10-69` and `v6/V6/10-69`. Follow `nextPage` until null, verify `complete:true` with `errors:[]`.
3. Check a V3 customer who has never bound LINE; check a closed customer; click names to view read-only details. Confirm no other worksheets included, no customer sends or payments.
4. Only then promote staging to `admin-id-bot.vercel.app`. Old Production deployment: `dpl_BoWTUGyaQwBDqSQycux2qPK3xxHC` for rollback.
5. Keep preview/production permission boundaries. No modifications to values, financial records, LINE sends, or staff accounts in this workflow.

## Behavior

UI: "รายชื่อลูกค้า" tab with name/queue search and source/status/due filters. It reads all named queue rows in `v3/10-69` and `V6/10-69`, includes unlinked and closed, pages up to 3000 rows per tab, and only displays a complete status once the final page has been loaded and both sources succeeded. No LINE binding requirement for viewing owner-only details.

Vercel function `lib/adminCustomerDirectoryApi.js` handles owner authorization and read-only GAS requests. Customer names/queues never enter public endpoints. The current GAS action still needs a live deployment; do not claim full roster is live until that step and E2E checks pass.
