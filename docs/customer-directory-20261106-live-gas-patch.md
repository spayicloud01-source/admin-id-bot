# Minimal patch for existing Customer Apps Script — 2026-11-06

Project **Admin ID - Customer** (script ID `1GMdEIm2RFVpEPoza72Z39VQEyRm-9zLTcM3wu-oz6Z-qGAGu-WK3qXiU`).

## Safety and preflight
- **Update the existing Customer GAS only**. Do not edit the Payment or Notify GAS apps.
- Compare the current installed code before editing; do **not** replace the live script with the GitHub snapshot.
- Existing Web App deployment URL, ID, role and permissions must remain unchanged.
- Keep all financial/customer rows and LINE notification routines unchanged. The new function is owner-only and read-only.
- If `listAllCustomers_` or the switch case already exists, inspect it instead of inserting duplicates.

## Step 1 — add exactly one action to the live `doPost` switch

Locate `case 'listDueCustomers':` and insert **immediately before** it:

```js
case 'listAllCustomers':
  result = listAllCustomers_(body); break;
```

## Step 2 — add the function above `listDueCustomers_`

```js
function listAllCustomers_(body) {
  const access = checkAccess_({
    lineUserId: body.lineUserId, sourceType: body.sourceType, groupId: body.groupId,
    permission: 'ดูรายงาน'
  });
  if (!access.allowed || String(access.role || '').trim() !== 'เจ้าของ') {
    return { ok: false, error: 'เฉพาะเจ้าของเท่านั้น' };
  }

  const pageNumber = Number(body.page);
  if (!Number.isInteger(pageNumber) || pageNumber < 0 || pageNumber > 99) {
    return { ok: false, error: 'เลขหน้าไม่ถูกต้อง' };
  }
  const PAGE_ROWS = 150;
  const targets = [
    { source: 'v1/v3', sheet: 'v3/10-69' },
    { source: 'v6', sheet: 'V6/10-69' }
  ];
  const backend = backendSpreadsheet_();
  const sourceSheet = backend.getSheetByName(CONFIG.SOURCE_SHEET);
  if (!sourceSheet) throw new Error('ไม่พบทะเบียนแหล่งข้อมูล');
  const sources = sourceSheet.getLastRow() >= 2 ?
    sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, 3).getValues() : [];
  const items = [];
  const problems = [];
  let hasMore = false;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const config = sources.find(function(row) {
      return normalizeGeneral_(row[0]) === normalizeGeneral_(target.source) && isTrue_(row[2]);
    });
    if (!config || !config[1]) {
      problems.push(target.sheet + ': ไม่พบแหล่งข้อมูลที่เปิดใช้งาน');
      continue;
    }
    try {
      const spreadsheetId = extractSpreadsheetId_(config[1]);
      if (!spreadsheetId) throw new Error('ลิงก์ชีตไม่ถูกต้อง');
      const book = SpreadsheetApp.openById(spreadsheetId);
      const sh = book.getSheetByName(target.sheet);
      if (!sh || sh.isSheetHidden()) throw new Error('ไม่พบชีตที่ใช้งาน');
      const h = detectHeaders_(sh);
      if (!h || !h.queue || !h.name) throw new Error('ไม่พบหัวตารางคิวหรือชื่อ');
      const totalRows = Math.min(
        Math.max(0, sh.getLastRow() - h.headerRow),
        CONFIG.MAX_ROWS_PER_TAB
      );
      const offset = pageNumber * PAGE_ROWS;
      if (offset >= totalRows) continue;
      const count = Math.min(PAGE_ROWS, totalRows - offset);
      const needed = [h.queue, h.name, h.status, h.dueDate, h.fee]
        .filter(function(n) { return Number(n) > 0; });
      const width = Math.max.apply(null, needed);
      const rows = sh.getRange(h.headerRow + 1 + offset, 1, count, width).getDisplayValues();
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        const queue = getCell_(row, h.queue);
        const name = getCell_(row, h.name);
        if (!queue || !name || /^[-–—]+$/.test(name)) continue;
        items.push({
          source: target.source, sheet: target.sheet, row: h.headerRow + 1 + offset + j,
          queue: queue, name: name, status: getCell_(row, h.status),
          dueDate: getCell_(row, h.dueDate), fee: getCell_(row, h.fee)
        });
      }
      if (offset + count < totalRows) hasMore = true;
    } catch (err) {
      problems.push(target.sheet + ': ' + String(err && err.message || err).slice(0, 90));
    }
  }

  return {
    ok: true, items: items, page: pageNumber,
    nextPage: hasMore ? pageNumber + 1 : null,
    complete: problems.length === 0 && !hasMore,
    errors: problems
  };
}
```

## Step 3 — deploy the same Customer Web App
1. Save and verify no syntax errors or duplicate function/case.
2. Apps Script **Deploy → Manage deployments → Edit existing Web App → Version: New version → Deploy**.
3. Keep the same Web App URL and deployment ID, and verify Customer role `BRIDGE_ROLE=customer`.
4. Use the owner-authenticated Preview route `/api/web/customer-directory?page=0`; continue pages until `complete:true` and `errors:[]`.
5. Verify one unlinked, one closed, and a linked customer from exactly `v3/10-69` and `V6/10-69`, owner-only, read-only.
6. Only then release the Vercel Preview branch `fix/full-customer-directory-rebase-20261106` to Production.

**Important:** The patch is in GitHub. This file does not deploy the Apps Script and does not itself fix Production.
