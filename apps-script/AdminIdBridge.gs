const CONFIG = {
  SOURCE_SHEET: 'ลิ้งชีต',
  STAFF_SHEET: 'เจ้าหน้าที่',
  HISTORY_SHEET: 'ประวัติลูกค้า',
  LOG_SHEET: 'Log ระบบ',
  MAX_RESULTS: 20,
  MAX_ROWS_PER_TAB: 3000,
  HEADER_SCAN_ROWS: 20,
  HEADER_SCAN_COLS: 40,
  SEARCH_CACHE_SECONDS: 300,
  EXCLUDED_TAB_PATTERNS: [
    /^LINE แจ้งค่าเช่า$/i,
    /สรุป/i,
    /^Mail/i,
    /รายงาน/i,
    /Dashboard/i
  ]
};

function doGet() {
  return json_({ ok: true, service: 'Admin ID Google Sheets Bridge' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const savedSecret = PropertiesService.getScriptProperties().getProperty('SHEETS_BRIDGE_SECRET');

    if (!savedSecret || body.secret !== savedSecret) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    let result;
    switch (body.action) {
      case 'checkAccess':
        result = checkAccess_(body); break;
      case 'registerStaff':
        result = registerStaff_(body); break;
      case 'approveStaff':
        result = approveStaff_(body); break;
      case 'listPendingStaff':
        result = listPendingStaff_(body); break;
      case 'searchCustomer':
        result = { ok: true, matches: searchCustomer_(String(body.query || '').trim()) }; break;
      case 'getCustomerInfo':
        result = getCustomerInfo_(body); break;
      case 'getHistory':
        result = getHistory_(body); break;
      case 'addNote':
        result = addNote_(body); break;
      case 'logAction':
        result = logAction_(body); break;
      default:
        result = { ok: false, error: 'Unknown action' };
    }
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function checkAccess_(body) {
  const lineUserId = String(body.lineUserId || '').trim();
  if (!lineUserId) return { ok: true, allowed: false, message: 'ไม่พบ LINE User ID' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.STAFF_SHEET);
  if (!sheet) return { ok: true, allowed: false, message: 'ไม่พบชีตเจ้าหน้าที่' };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, allowed: false, message: 'ยังไม่มีเจ้าหน้าที่ที่ได้รับอนุมัติ' };

  const values = sheet.getRange(2, 1, lastRow - 1, 20).getValues();
  const permCol = {
    'ดูข้อมูลลูกค้า': 9,
    'ตอบลูกค้า': 10,
    'ยืนยันสลิป': 11,
    'บันทึกชำระ': 12,
    'ปิดยอด': 13,
    'แก้ข้อมูลลูกค้า': 14,
    'ดูรายงาน': 15,
    'จัดการเจ้าหน้าที่': 16,
    'ดูประวัติ': 17,
    'บันทึกโน้ต': 18
  };

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[1] || '').trim() !== lineUserId) continue;
    if (String(row[2] || '').trim() !== 'เจ้าหน้าที่') {
      return { ok: true, allowed: false, message: 'บัญชีนี้ยังไม่ได้รับอนุมัติเป็นเจ้าหน้าที่' };
    }
    if (row[19] !== true) {
      return { ok: true, allowed: false, message: 'บัญชีนี้ถูกปิดการใช้งานบอต' };
    }
    const p = String(body.permission || '').trim();
    if (p && permCol[p] != null && row[permCol[p]] !== true) {
      return { ok: true, allowed: false, message: 'บัญชีนี้ไม่มีสิทธิ์ ' + p };
    }
    return {
      ok: true,
      allowed: true,
      staffName: String(row[0] || ''),
      role: String(row[8] || '')
    };
  }

  return { ok: true, allowed: false, message: 'บัญชี LINE นี้ยังไม่มีสิทธิ์ใช้งาน Admin ID' };
}

function registerStaff_(body) {
  const lineUserId = String(body.lineUserId || '').trim();
  const staffName = String(body.staffName || '').trim();
  if (!lineUserId || !staffName) {
    return { ok: true, registered: false, message: 'กรุณาพิมพ์ชื่อเจ้าหน้าที่ให้ตรงกับที่ลงทะเบียนไว้' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.STAFF_SHEET);
  if (!sh) return { ok: false, error: 'ไม่พบชีตเจ้าหน้าที่' };

  const lastRow = Math.max(sh.getLastRow(), 2);
  const values = sh.getRange(2, 1, lastRow - 1, 20).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const name = String(row[0] || '').trim();
    const existingId = String(row[1] || '').trim();
    if (existingId === lineUserId) {
      const status = String(row[2] || '').trim();
      const ownerLineUserIds = values
        .filter(function(r) {
          return String(r[8] || '').trim() === 'เจ้าของ' &&
            String(r[2] || '').trim() === 'เจ้าหน้าที่' &&
            r[19] === true &&
            String(r[1] || '').trim();
        })
        .map(function(r) { return String(r[1] || '').trim(); });

      return {
        ok: true,
        registered: false,
        alreadyRegistered: true,
        pendingApproval: status !== 'เจ้าหน้าที่',
        staffName: name || staffName,
        ownerLineUserIds: ownerLineUserIds,
        message: status === 'เจ้าหน้าที่'
          ? 'LINE นี้ลงทะเบียนเป็นเจ้าหน้าที่แล้ว'
          : 'รออนุมัติ'
      };
    }
    if (name !== staffName) continue;
    if (existingId && existingId !== lineUserId) {
      return { ok: true, registered: false, message: 'ชื่อนี้ถูกผูกกับ LINE อื่นแล้ว' };
    }

    const rowNo = i + 2;
    sh.getRange(rowNo, 2).setValue(lineUserId);
    sh.getRange(rowNo, 3).setValue('รอยืนยัน');
    sh.getRange(rowNo, 5).setValue(new Date());
    sh.getRange(rowNo, 9).setValue(sh.getRange(rowNo, 9).getValue() || 'พนักงาน');
    sh.getRange(rowNo, 20).setValue(false);

    const ownerLineUserIds = values
      .filter(function(r) {
        return String(r[8] || '').trim() === 'เจ้าของ' &&
          String(r[2] || '').trim() === 'เจ้าหน้าที่' &&
          r[19] === true &&
          String(r[1] || '').trim();
      })
      .map(function(r) { return String(r[1] || '').trim(); });

    return {
      ok: true,
      registered: true,
      staffName: staffName,
      ownerLineUserIds: ownerLineUserIds,
      message: 'รออนุมัติ'
    };
  }

  return {
    ok: true,
    registered: false,
    message: 'ไม่พบชื่อเจ้าหน้าที่นี้ในรายการที่เจ้าของเตรียมไว้'
  };
}

function listPendingStaff_(body) {
  const requester = checkAccess_({
    lineUserId: body.lineUserId,
    permission: 'จัดการเจ้าหน้าที่'
  });
  if (!requester.allowed) {
    return { ok: true, allowed: false, message: requester.message || 'ไม่มีสิทธิ์จัดการเจ้าหน้าที่' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.STAFF_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, items: [] };

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getDisplayValues();
  const items = values
    .filter(function(row) { return String(row[2] || '').trim() === 'รอยืนยัน'; })
    .map(function(row) {
      return {
        staffName: String(row[0] || '').trim(),
        registeredAt: String(row[4] || '').trim()
      };
    });

  return { ok: true, items: items };
}

function approveStaff_(body) {
  const requester = checkAccess_({
    lineUserId: body.lineUserId,
    permission: 'จัดการเจ้าหน้าที่'
  });
  if (!requester.allowed) {
    return { ok: true, approved: false, message: requester.message || 'ไม่มีสิทธิ์อนุมัติเจ้าหน้าที่' };
  }

  const staffName = String(body.query || '').trim();
  if (!staffName) return { ok: true, approved: false, message: 'รูปแบบ: อนุมัติ <ชื่อเจ้าหน้าที่>' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.STAFF_SHEET);
  if (!sh) return { ok: false, error: 'ไม่พบชีตเจ้าหน้าที่' };

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, approved: false, message: 'ไม่พบเจ้าหน้าที่รออนุมัติ' };

  const values = sh.getRange(2, 1, lastRow - 1, 20).getValues();
  const matches = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (String(row[0] || '').trim() === staffName) matches.push({ rowNo: i + 2, row: row });
  }

  if (!matches.length) return { ok: true, approved: false, message: 'ไม่พบชื่อเจ้าหน้าที่: ' + staffName };
  if (matches.length > 1) return { ok: true, approved: false, message: 'พบชื่อซ้ำ กรุณาแก้ชื่อในชีตเจ้าหน้าที่ให้ไม่ซ้ำก่อน' };

  const target = matches[0];
  const row = target.row;
  if (!String(row[1] || '').trim()) {
    return { ok: true, approved: false, message: 'เจ้าหน้าที่คนนี้ยังไม่ได้ผูก LINE' };
  }
  if (String(row[2] || '').trim() === 'เจ้าหน้าที่' && row[19] === true) {
    return { ok: true, approved: false, alreadyApproved: true, message: staffName + ' ได้รับอนุมัติแล้ว' };
  }
  if (String(row[2] || '').trim() !== 'รอยืนยัน') {
    return { ok: true, approved: false, message: 'สถานะปัจจุบันไม่ใช่รอยืนยัน' };
  }

  sh.getRange(target.rowNo, 3).setValue('เจ้าหน้าที่');
  sh.getRange(target.rowNo, 6).setValue(requester.staffName || 'เจ้าของ');
  sh.getRange(target.rowNo, 7).setValue(new Date());
  sh.getRange(target.rowNo, 9).setValue('พนักงาน');

  sh.getRange(target.rowNo, 10).setValue(true);
  sh.getRange(target.rowNo, 18).setValue(true);
  sh.getRange(target.rowNo, 20).setValue(true);

  sh.getRange(target.rowNo, 11, 1, 7).setValues([[false, false, false, false, false, false, false]]);
  sh.getRange(target.rowNo, 19).setValue(false);

  return {
    ok: true,
    approved: true,
    staffName: staffName,
    staffLineUserId: String(row[1] || '').trim(),
    message: 'อนุมัติ ' + staffName + ' แล้ว\nสิทธิ์: ดูข้อมูลลูกค้า + ดูประวัติ\nยังไม่เปิดสิทธิ์การเงิน'
  };
}

function getCustomerInfo_(body) {
  const query = String(body.query || '').trim();
  if (!query) return { ok: false, error: 'กรุณาระบุคำค้น' };
  const matches = searchCustomer_(query, true);
  if (!matches.length) return { ok: true, matches: [], info: null };
  if (matches.length > 1) return { ok: true, matches: matches.slice(0, 10), needsSelection: true };
  return { ok: true, matches: matches, info: matches[0] };
}

function searchCustomer_(query, includeDetails) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'customer-search:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizeGeneral_(query))
  );
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {}
  }

  const backend = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = backend.getSheetByName(CONFIG.SOURCE_SHEET);
  if (!sourceSheet) throw new Error('ไม่พบชีต "' + CONFIG.SOURCE_SHEET + '"');

  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return [];

  const sources = sourceSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const results = [];

  for (let i = 0; i < sources.length && results.length < CONFIG.MAX_RESULTS; i++) {
    const sourceName = String(sources[i][0] || '').trim();
    const url = String(sources[i][1] || '').trim();
    const enabled = isTrue_(sources[i][2]);
    const searchAllTabs = isTrue_(sources[i][3]);
    if (!enabled || !url) continue;

    try {
      const id = extractSpreadsheetId_(url);
      if (!id) continue;
      const ss = SpreadsheetApp.openById(id);
      let tabs = ss.getSheets().filter(function(sh) {
        if (sh.isSheetHidden()) return false;
        return !CONFIG.EXCLUDED_TAB_PATTERNS.some(function(rx) { return rx.test(sh.getName()); });
      });
      if (!searchAllTabs) tabs = tabs.slice(0, 1);

      for (let t = 0; t < tabs.length && results.length < CONFIG.MAX_RESULTS; t++) {
        searchTab_(tabs[t], sourceName, query, results, true);
      }
    } catch (err) {
      console.log('ค้นไม่ได้: ' + sourceName + ' / ' + err.message);
    }
  }
  try {
    cache.put(cacheKey, JSON.stringify(results), CONFIG.SEARCH_CACHE_SECONDS);
  } catch (err) {
    console.log('cache put failed: ' + err.message);
  }
  return results;
}

function searchTab_(sheet, sourceName, query, results, includeDetails) {
  const lastRow = sheet.getLastRow();
  if (!lastRow || !sheet.getLastColumn()) return;

  const h = detectHeaders_(sheet);
  if (!h) return;

  const startRow = h.headerRow + 1;
  if (startRow > lastRow) return;

  const rowCount = Math.min(lastRow - h.headerRow, CONFIG.MAX_ROWS_PER_TAB);
  const needed = Object.keys(h).filter(k => k !== 'headerRow').map(k => h[k]).filter(v => v > 0);
  if (!needed.length) return;

  const maxCol = Math.max.apply(null, needed);
  const values = sheet.getRange(startRow, 1, rowCount, maxCol).getDisplayValues();

  const qGeneral = normalizeGeneral_(query);
  const qPhone = normalizePhone_(query);
  const qApple = normalizeApple_(query);

  for (let r = 0; r < values.length && results.length < CONFIG.MAX_RESULTS; r++) {
    const row = values[r];
    const queue = getCell_(row, h.queue);
    const name = getCell_(row, h.name);
    const phone = getCell_(row, h.phone);
    const appleId = getCell_(row, h.appleId);

    const match =
      matchesQueue_(queue, qGeneral) ||
      matchesGeneral_(name, qGeneral) ||
      matchesPhone_(phone, qPhone) ||
      matchesApple_(appleId, qApple);

    if (!match) continue;

    const item = {
      source: sourceName,
      sheet: sheet.getName(),
      row: startRow + r,
      queue: queue,
      name: name,
      phone: phone,
      appleId: appleId,
      model: getCell_(row, h.model)
    };

    if (includeDetails) {
      item.status = getCell_(row, h.status);
      item.principal = getCell_(row, h.principal);
      item.fee = getCell_(row, h.fee);
      item.saleDate = getCell_(row, h.saleDate);
      item.dueDate = getCell_(row, h.dueDate);
      item.outstanding = getCell_(row, h.outstanding);
      item.closeAmount = getCell_(row, h.closeAmount);
      item.note = getCell_(row, h.note);
    }
    results.push(item);
  }
}

function detectHeaders_(sheet) {
  const rows = Math.min(sheet.getLastRow(), CONFIG.HEADER_SCAN_ROWS);
  const cols = Math.min(sheet.getLastColumn(), CONFIG.HEADER_SCAN_COLS);
  if (!rows || !cols) return null;

  const data = sheet.getRange(1, 1, rows, cols).getDisplayValues();

  for (let r = 0; r < data.length; r++) {
    const headers = data[r].map(normalizeHeader_);
    const info = {
      headerRow: r + 1,
      queue: findHeader_(headers, ['คิว','queue']),
      name: findHeader_(headers, ['ชื่อ','ชื่อลูกค้า','customername']),
      phone: findHeader_(headers, ['เบอร์โทร','เบอร์','โทร','phone','tel']),
      appleId: findHeader_(headers, ['appleid','apple id','appleidลูกค้า','apple id ลูกค้า','icloud','ชื่อicloud']),
      model: findHeader_(headers, ['รุ่น','model']),
      status: findHeader_(headers, ['สถานะ','status']),
      principal: findHeader_(headers, ['ยอด','ยอดขายฝาก','ยอดฝาก','เงินต้น','principal']),
      fee: findHeader_(headers, ['ค่าเช่า','ค่่าเช่า','ดอก','เช่า','fee','rent']),
      saleDate: findHeader_(headers, ['วันขายฝาก','วันฝาก','วันรับ','วันที่ขาย','saledate']),
      dueDate: findHeader_(headers, ['กำหนดวันจ่ายถัดไปจ่าย','กำหนดจ่าย','วันจ่าย','due','วันส่ง']),
      outstanding: findHeader_(headers, ['ยอดค้าง','ยอดที่ต้องจ่าย','ค้างชำระ','outstanding']),
      closeAmount: findHeader_(headers, ['ยอดปิด','ปิดยอด','closeamount']),
      note: findHeader_(headers, ['โน๊ต','โน็ต','หมายเหตุ','note'])
    };

    const count = [info.queue, info.name, info.phone, info.appleId].filter(v => v > 0).length;
    if (count >= 2) return info;
  }
  return null;
}

function getHistory_(body) {
  const query = String(body.query || '').trim();
  if (!query) return { ok: false, error: 'กรุณาระบุคำค้น' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, items: [] };

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getDisplayValues();
  const q = normalizeGeneral_(query);
  const items = [];

  for (let i = values.length - 1; i >= 0 && items.length < 50; i--) {
    const row = values[i];
    const hay = [row[3], row[4], row[5], row[6]].map(normalizeGeneral_);
    if (!hay.some(v => v && v.indexOf(q) !== -1)) continue;
    if (body.eventType && String(row[8] || '') !== body.eventType) continue;
    items.push({
      dateTime: row[0],
      source: row[1],
      sheet: row[2],
      queue: row[3],
      name: row[4],
      phone: row[5],
      appleId: row[6],
      model: row[7],
      eventType: row[8],
      amount: row[13],
      staff: row[14],
      note: row[15]
    });
  }
  return { ok: true, items: items };
}

function addNote_(body) {
  const query = String(body.query || '').trim();
  const note = String(body.note || '').trim();
  if (!query || !note) return { ok: false, error: 'รูปแบบ: โน้ต <คำค้น> <ข้อความ>' };

  const matches = searchCustomer_(query, true);
  if (!matches.length) return { ok: true, added: false, matches: [] };
  if (matches.length > 1) return { ok: true, added: false, needsSelection: true, matches: matches.slice(0, 10) };

  const m = matches[0];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  if (!sh) throw new Error('ไม่พบชีตประวัติลูกค้า');

  sh.appendRow([
    new Date(), m.source, m.sheet, m.queue, m.name, m.phone, m.appleId, m.model,
    'โน้ตลูกค้า', '', '', '', '', '', String(body.staffName || ''), note
  ]);

  return { ok: true, added: true, customer: m };
}

function logAction_(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!sh) return { ok: true, logged: false };
  sh.appendRow([
    new Date(),
    body.lineUserId || '',
    body.staffName || '',
    body.role || '',
    body.command || '',
    body.query || '',
    body.source || '',
    body.result || '',
    body.actionName || '',
    body.status || '',
    body.note || ''
  ]);
  return { ok: true, logged: true };
}

function findHeader_(headers, aliases) {
  const a = aliases.map(normalizeHeader_);
  for (let i = 0; i < headers.length; i++) {
    for (let j = 0; j < a.length; j++) if (headers[i] === a[j]) return i + 1;
  }
  return 0;
}
function normalizeHeader_(v) { return String(v || '').toLowerCase().replace(/\s+/g,'').replace(/[._\-\/]/g,'').trim(); }
function normalizeGeneral_(v) { return String(v || '').toLowerCase().replace(/\s+/g,'').trim(); }
function normalizePhone_(v) { return String(v || '').replace(/\D/g,''); }
function normalizeApple_(v) { return String(v || '').toLowerCase().replace(/\s+/g,'').trim(); }
function matchesQueue_(v,q) { return !!v && !!q && normalizeGeneral_(v) === q; }
function matchesGeneral_(v,q) { if (!v || !q) return false; const x=normalizeGeneral_(v); return x === q || x.indexOf(q) !== -1; }
function matchesPhone_(v,q) { if (!v || !q) return false; const x=normalizePhone_(v); return x === q || x.indexOf(q) !== -1; }
function matchesApple_(v,q) { if (!v || !q) return false; const x=normalizeApple_(v); return x === q || x.indexOf(q) !== -1; }
function getCell_(row,col) { return (!col || col < 1) ? '' : String(row[col - 1] || '').trim(); }
function extractSpreadsheetId_(url) {
  const text=String(url||'');
  const m=text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)||text.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  return m ? m[1] : '';
}
function isTrue_(v) { return v===true || String(v).toLowerCase()==='true' || String(v).trim()==='1'; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
