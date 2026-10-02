import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');
const rows = [
  ['A-1', 'ลูกค้าปกติ', '0800000001', '', '100', '27/09/2026'],
  ['A-2', 'ลูกค้าปิด', '0800000002', 'ปิดยอด', '100', '27/09/2026'],
  ['A-3', 'ลูกค้าลบ', '0800000003', 'ลบ', '100', '27/09/2026'],
  ['A-4', 'ลูกค้ารอล็อค', '0800000004', 'รอล็อค', '100', '27/09/2026'],
];
const headers = [['คิว', 'ชื่อ', 'เบอร์', 'สถานะ', 'ค่าเช่า', 'วันจ่าย']];

function makeContext() {
  const tab = {
    isSheetHidden: () => false,
    getName: () => 'V6/10-69',
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers[0].length,
    getRange(row) {
      return { getDisplayValues: () => row === 1 ? headers : rows };
    },
  };
  const sourceSheet = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [['v6', 'sheet-url', true, true, '', '', '']] }),
  };
  const context = vm.createContext({
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-09-28T12:00:00Z'])); }
      static now() { return new Date('2026-09-28T12:00:00Z').getTime(); }
    },
    console,
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sourceSheet }),
      openById: () => ({ getSheets: () => [tab], getSheetByName: (name) => name === 'V6/10-69' ? tab : null }),
    },
  });
  vm.runInContext(script, context);
  Object.assign(context, {
    checkAccess_: () => ({ allowed: true, role: 'เจ้าของ' }),
    getSettingValue_: (_key, fallback) => fallback,
    extractSpreadsheetId_: () => 'source-id',
  });
  return context;
}

test('closed and deleted rows are excluded from overdue while status buckets stay separate', () => {
  const context = makeContext();
  const base = { lineUserId: 'Uowner', sourceType: 'user' };
  const overdue = context.listDueCustomers_({ ...base, dueMode: 'overdue' });
  assert.deepEqual(Array.from(overdue.items, (x) => x.queue), ['A-1', 'A-4']);

  const deleted = context.listDueCustomers_({ ...base, dueMode: 'deleted' });
  assert.deepEqual(Array.from(deleted.items, (x) => x.queue), ['A-3']);

  const pendingLock = context.listDueCustomers_({ ...base, dueMode: 'pending_lock' });
  assert.deepEqual(Array.from(pendingLock.items, (x) => x.queue), ['A-4']);
});

