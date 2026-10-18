# Admin ID — LINE OA blocked/unblocked tracking (Preview only)

Created 2026-10-18. Draft PR #15. Preview deployment dpl_BgBCrPZXwU3dSjArb3YxUopsWb2P (READY).
**Never promote this branch or replace live GAS with this repo's older bridge wholesale.**

## What is implemented
- Valid `unfollow` and `follow` events from user sources are processed only after LINE signature verification.
- Event ties `source.userId` to active customer bindings on existing `ลูกค้า LINE` tab.
- The Customer GAS action `recordCustomerLineStatus` adds columns N:P on first valid matched event; stores LINE OA status (บล็อก/ปกติ), timestamp, event ID. Does not touch existing binding column H, financial columns, or customer source sheets.
- The Customer GAS action `listBlockedCustomerLines` is owner-only; the owner can type `ลูกค้าบล็อก` in LINE personal chat to list up to 20 bound customers who blocked the OA.
- Blocks cancel existing `รอส่ง` rows of `คิวแจ้งเตือน`; manual/automatic queue builders exclude blocked customers.
- Redelivery and delayed/older events cannot overwrite newer state; source-group events ignored.
- Optional owner push notice is once per changed status (best effort; may fail if LINE quota is exhausted).
- Deleting a chat or removing from friends without blocking is NOT reliably distinguishable or independently detectable.

## Activation gates (not completed)
1. Obtain *current deployed* Customer and Notify GAS code (could be v133/v137/v138 or later). This repo's `apps-script/AdminIdBridge.gs` still declares `2026.10.03-131`; it must NOT overwrite a newer live deployed script. Cherry-pick/add the functions and switch cases here into the matching currently deployed code.
2. Use **separate GAS Preview/Test projects** and a **copy of the back-office spreadsheet** for dry-run tests. Do not run preview against customer production data.
3. In Vercel **Preview environment only**, point Customer/Notify bridge URLs and secrets to the Test GAS projects and set `LINE_RELATIONSHIP_TRACKING_ENABLED=true`.
4. Leave `LINE_RELATIONSHIP_OWNER_ALERTS_ENABLED=false` until owner opts in and LINE quota is available. Do not use a live LINE channel/webhook URL for preview tests; use a separate LINE test channel and verify HMAC signed requests.
5. Test unknown ID, blocked ID, re-follow, duplicate eventId, older event, pending queue cancellation, no raw financial write, owner-only list, and successful release from blocked.
6. Only after end-to-end approval, propose Production promotion as a separate explicit change.

## Verification
- JS syntax: GAS and webhook pass.
- Pure helper tests 9/9 pass.
- Isolated mocked Apps Script integration tests 11/11 pass; no real Google Sheets write or LINE send.
- Preview READY; Production deployment stayed `dpl_9GhHsKwEPUyTpQJbiXjJVW5iqq2V` (READY).
- Back-office tracking: `งานค้าง Admin ID`, item #16, row 17.

## API
- POST Customer GAS, action `recordCustomerLineStatus`, fields `lineUserId`, `eventType` (`follow`|`unfollow`), `webhookEventId`, `eventTimestamp` (ms), `isUnblocked`.
- POST Customer GAS, action `listBlockedCustomerLines`, fields `lineUserId` (verified owner actor, source type user).
- Both require the pre-existing Sheets bridge secret; webhook requires pre-existing `x-line-signature`.
