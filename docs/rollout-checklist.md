# Admin ID rollout checklist

1. Copy the latest `apps-script/AdminIdBridge.gs` into the bound Apps Script project.
2. Deploy -> Manage deployments -> Edit -> New version -> Deploy.
3. In owner LINE, run `เวอร์ชันระบบ`; expected bridge version: `2026.09.23-90`.
4. Run `เช็กพร้อมใช้`.
5. Run `ตรวจชีตต้นทาง`.
6. Run `ตรวจเขียนต้นทาง`.
7. Run `ทดสอบแจ้งเตือน`.
8. Install the daily reminder trigger only after the reminder preview looks correct.
9. Test staff registration/approve/reject with a non-owner account.
10. Test customer search using name, phone, Apple ID, queue, and source-qualified queue such as `v6:101`.
11. Test one slip review queue and one payment review queue using test/non-financial data.
12. Keep `FINANCIAL_SOURCE_WRITES_ENABLED=FALSE` until every live source mapping is explicitly validated.
13. Keep `REMINDER_INTERNAL_ONLY=TRUE` until customer LINE binding is implemented and verified.
14. OK Slip can be enabled only after its API credential is stored outside Sheets.
