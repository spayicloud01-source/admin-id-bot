# Admin ID Bot

LINE Messaging API webhook for the Admin ID back-office bot.

## Current architecture

LINE OA -> Vercel -> Google Apps Script -> Google Sheets

## Endpoints

- `GET /api/health`
- `GET /api/line/webhook`
- `POST /api/line/webhook`
- `GET /api/sheets/health`
- `GET /api/sheets/selftest`
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

## Manual steps still required

1. Copy `apps-script/AdminIdBridge.gs` into the bound Google Apps Script project as `รหัส.gs`.
2. Save and deploy a **New version** of the existing Web App deployment.
3. Resolve the Vercel Hobby/private-repository deployment block so the latest GitHub commit can reach Production.
4. After deployment, test `/api/sheets/diagnostics` and then test LINE read-only commands.
5. Only after read-only tests pass, enable write workflows such as payment recording, close-out, and slip confirmation.

## Safety

Customer search is permission-gated by LINE User ID and the `เจ้าหน้าที่` sheet. Write operations should not be enabled until read-only flows have been verified end-to-end.
