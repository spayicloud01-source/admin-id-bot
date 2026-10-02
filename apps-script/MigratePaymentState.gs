/**
 * One-time migration helper for the CURRENT/LEGACY bound Admin ID Apps Script.
 *
 * Safety:
 * - Add this as a NEW .gs file to the legacy project.
 * - Do not replace AdminIdBridge.gs.
 * - Run migrateLegacyPaymentStateToSharedSheet() once.
 * - Confirm ok:true and unmapped:[].
 * - This does not deploy or change the active Web App version.
 */
function migrateLegacyPaymentStateToSharedSheet() {
  var BACKEND_ID = '1uUmRtl7YD0IryKz8MFwhw2r3l6aW3uxTMic7KpN5sKc';
  var STATE_SHEET = 'สถานะชำระ';
  var LOG_SHEET = 'Log ระบบ';
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var paymentKeys = Object.keys(all).filter(function(key) {
    return String(key || '').indexOf('payment-cycle:') === 0;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ต้องรันจาก Apps Script เดิมที่ผูกกับชีตหลังบ้าน');
  if (ss.getId() !== BACKEND_ID) {
    throw new Error('Apps Script นี้ไม่ได้ผูกกับชีตหลังบ้านที่กำหนด');
  }

  var state = ss.getSheetByName(STATE_SHEET);
  if (!state) throw new Error('ไม่พบชีตสถานะชำระที่เตรียมไว้ หยุดก่อนย้ายข้อมูล');
  var expectedHeader = [
    'key', 'source', 'sheet', 'queue', 'dueDate',
    'total', 'byDayJson', 'reviewRowsJson', 'updatedAt'
  ];
  var actualHeader = state.getRange(1, 1, 1, 9).getDisplayValues()[0];
  if (expectedHeader.some(function(name, i) {
    return String(actualHeader[i] || '').trim() !== name;
  })) throw new Error('หัวตารางสถานะชำระไม่ตรงกับรูปแบบที่ต้องการ');

  var metadata = {};
  var log = ss.getSheetByName(LOG_SHEET);
  if (log && log.getLastRow() >= 2) {
    var rows = log.getRange(2, 1, log.getLastRow() - 1, 11).getDisplayValues();
    rows.forEach(function(row) {
      if (String(row[8] || '').trim() !== 'paymentSourceBackupAfter') return;
      var raw = String(row[10] || '').trim();
      if (!raw) return;
      try {
        var backup = JSON.parse(raw);
        if (!backup || !backup.cycleKey || !backup.source ||
            !backup.sheet || !backup.queue || !backup.oldDue) return;
        metadata[String(backup.cycleKey)] = backup;
      } catch (err) {}
    });
  }

  var existingRows = {};
  if (state.getLastRow() >= 2) {
    var existing = state.getRange(2, 1, state.getLastRow() - 1, 1).getDisplayValues();
    existing.forEach(function(row, i) {
      var key = String(row[0] || '').trim();
      if (key) existingRows[key] = i + 2;
    });
  }

  var mapped = [];
  var unmapped = [];
  var now = new Date();

  paymentKeys.forEach(function(key) {
    var backup = metadata[key];
    if (!backup) {
      unmapped.push(key);
      return;
    }

    var cycle;
    try {
      cycle = JSON.parse(all[key]);
    } catch (err) {
      unmapped.push(key);
      return;
    }

    var due = new Date(backup.oldDue);
    if (isNaN(due.getTime())) {
      unmapped.push(key);
      return;
    }

    var total = Number(cycle && cycle.total || 0);
    if (!isFinite(total)) total = 0;
    var byDay = cycle && cycle.byDay && typeof cycle.byDay === 'object'
      ? cycle.byDay : {};
    var reviewRows = cycle && Array.isArray(cycle.reviewRows)
      ? cycle.reviewRows : [];

    mapped.push({ key: key, values: [[
      key,
      String(backup.source || '').trim(),
      String(backup.sheet || '').trim(),
      String(backup.queue || '').trim(),
      Utilities.formatDate(due, 'Asia/Bangkok', 'yyyy-MM-dd'),
      Math.round(total * 100) / 100,
      JSON.stringify(byDay),
      JSON.stringify(reviewRows),
      now
    ]] });
  });

  // Validate the entire set before writing any rows. An unmapped cycle must
  // never leave a partially migrated shared state behind.
  if (unmapped.length) {
    var failed = {
      ok: false,
      paymentKeys: paymentKeys.length,
      migrated: 0,
      unmapped: unmapped,
      sheet: STATE_SHEET
    };
    console.log(JSON.stringify(failed));
    return failed;
  }

  mapped.forEach(function(item) {
    var key = item.key;
    var rowNo = existingRows[key] || 0;
    if (rowNo) {
      state.getRange(rowNo, 1, 1, 9).setValues(item.values);
    } else {
      rowNo = Math.max(2, state.getLastRow() + 1);
      state.getRange(rowNo, 1, 1, 9).setValues(item.values);
      existingRows[key] = rowNo;
    }
  });

  SpreadsheetApp.flush();

  var result = {
    ok: unmapped.length === 0,
    paymentKeys: paymentKeys.length,
    migrated: mapped.length,
    unmapped: unmapped,
    sheet: STATE_SHEET
  };
  console.log(JSON.stringify(result));
  return result;
}

