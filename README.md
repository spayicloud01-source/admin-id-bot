# Admin ID Bot

LINE Messaging API webhook for the Admin ID back-office bot.

## Current architecture

LINE OA -> Vercel -> Google Apps Script -> Google Sheets

## Endpoints

- `GET /api/health` — production/environment + Apps Script version handshake + post-deploy selftest
- `GET /api/line/webhook`
- `POST /api/line/webhook`
- `GET /api/commands/selftest` — command parser regression test
- `GET /api/rules/selftest` — business-rule regression test
- `POST /api/reminders/run` — secret-protected internal reminder delivery
- `GET /api/sheets/health`
- `GET /api/sheets/diagnostics`

## Required Vercel environment variables

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `SPREADSHEET_ID`
- `GOOGLE_APPS_SCRIPT_URL`
- `SHEETS_BRIDGE_SECRET`

## Staged commands

- Search by name / phone / queue / Apple ID
- `ค่าเช่า <คำค้น>`
- `วันจ่าย <คำค้น>`
- `ยอดค้าง <คำค้น>`
- `สถานะ <คำค้น>`
- `ยอดปิด <คำค้น>`
- `ประวัติ <คำค้น>`
- `ดูโน้ต <คำค้น>`
- `โน้ต <คำค้น> <ข้อความ>`
- `ช่วยเหลือ`

## Apps Script source

The current staged Apps Script bridge is stored at:

`apps-script/AdminIdBridge.gs`

It supports:

- `checkAccess`
- `searchCustomer`
- `getCustomerInfo`
- `getHistory`
- `addNote`
- `logAction`

## One manual deployment step remains

The code side is complete for the safe rollout. Copy the latest `apps-script/AdminIdBridge.gs` into the bound Apps Script project and deploy a **New version** of the existing Web App.

After deployment:
1. Run `เวอร์ชันระบบ`; expected `2026.09.23-100`.
2. Run `เช็กพร้อมใช้`.
3. Run `ตรวจชีตต้นทาง` and `ตรวจเขียนต้นทาง`.
4. Run `ทดสอบแจ้งเตือน`.
5. Keep real financial source writes disabled until live source mapping is reviewed.

## Safety

Customer search is permission-gated by LINE User ID and the `เจ้าหน้าที่` sheet. Write operations should not be enabled until read-only flows have been verified end-to-end.

Deployment trigger after public visibility.


## Current rollout safety

- Financial source writes are OFF by default with `FINANCIAL_SOURCE_WRITES_ENABLED=FALSE`.
- Approved payment/close review items are recorded in append-only `ประวัติลูกค้า` first.
- Source rows are revalidated before review approval.
- Duplicate pending financial review items are blocked.
- Daily reminders are idempotent and internal-only by default.
- Customer-direct reminders remain disabled until a verified customer LINE binding flow exists.
- OK Slip remains optional and disabled until credentials are configured outside Sheets.

## Owner commands

- `เมนู`
- `เช็กพร้อมใช้`
- `สถานะระบบ`
- `เวอร์ชันระบบ`
- `ตรวจชีตต้นทาง`
- `ตรวจเขียนต้นทาง`
- `รายงานวันนี้`
- `กิจกรรมวันนี้`
- `กิจกรรม <ชื่อ>`
- `เจ้าหน้าที่`
- `สิทธิ์เจ้าหน้าที่ <ชื่อ>`
- `ให้สิทธิ์ <ชื่อ> <สิทธิ์>`
- `ถอนสิทธิ์ <ชื่อ> <สิทธิ์>`
- `ระงับ <ชื่อ>`
- `เปิดใช้ <ชื่อ>`
- `คิวตรวจสอบ`
- `ดูคิว <เลข>`
- `จำลองบันทึก <เลข>`
- `ผ่านคิว <เลข>`
- `ไม่ผ่านคิว <เลข>`
- `ยกเลิกคิว <เลข>`
- `ติดตั้งแจ้งเตือน`
- `สถานะแจ้งเตือน`
- `ทดสอบแจ้งเตือน`

## Final rollout

Deploy the latest `apps-script/AdminIdBridge.gs` as a **New version** only after code work is complete. Then verify `เวอร์ชันระบบ` and `เช็กพร้อมใช้` before enabling any financial source write.
