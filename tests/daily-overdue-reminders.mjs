import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');
const fixedNow = new Date('2026-09-28T02:00:00+07:00');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow.getTime(); }
}

function fixture(dueDate = '27 ก.ย. 26') {
  const records = [];
  const customer = {
    source: 'v1/v3', sheet: 'v3/10-69', queue: '310-2',
    name: 'ลูกค้าทดสอบ', dueDate, fee: '1,000', status: ''
  };
  const bindings = [[null, 'Ucustomer', customer.name, null,
    customer.source, customer.sheet, customer.queue, 'ใช้งาน', null, null, 'TRUE']];
  const notificationSheet = {
    getLastRow: () => records.length + 1,
    getRange(row, col, count) {
      if (row === 2 && col === 1 && count === records.length) {
        return { getValues: () => records };
      }
      return {
        setValue(value) { records[row - 2][col - 1] = value; }
      };
    },
    appendRow(row) { records.push(row); }
  };
  const context = vm.createContext({
    Date: Clock,
    console,
    Utilities: {
      formatDate(date, tz, pattern) {
        assert.equal(tz, 'Asia/Bangkok');
        if (pattern === 'dd/MM/yyyy HH:mm') return '28/09/2026 02:00';
        assert.equal(pattern, 'yyyy-MM-dd');
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date);
      }
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => notificationSheet }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  });
  vm.runInContext(script, context);
  Object.assign(context, {
    getSettingValue_: (_key, fallback) => fallback,
    customerLineSheet_: () => ({ getLastRow: () => 2, getRange: () => ({ getDisplayValues: () => bindings }) }),
    getCustomerAutoReminderSheetKeys_: () => ['v1/v3|v3/10-69'],
    findCustomerIdentity_: () => customer,
    formatThaiDate_: (date) => date.toISOString().slice(0, 10),
    logAction_: () => {},
    paymentCycleKey_: () => 'cycle',
  });
  return { context, customer, records, run: () => context.getCustomerReminderBatchLocked_({}) };
}

test('overdue customer gets one reminder per day, then stops when due date advances after payment', () => {
  const f = fixture();
  assert.equal(f.run().items.length, 1);
  assert.equal(f.records[0][1], 'ลูกค้า-ค้างชำระ');
  assert.match(f.records[0][7], /เลยกำหนด 1 วัน/);
  assert.equal(f.run().items.length, 0);
  f.customer.dueDate = '7 ต.ค. 26';
  assert.equal(f.run().items.length, 0);
});

test('closed accounts and reminders already queued today are not sent again', () => {
  const f = fixture('28 ก.ย. 26');
  f.customer.status = 'ปิด';
  assert.equal(f.run().items.length, 0);
  f.customer.status = '';
  assert.equal(f.run().items.length, 1);
  assert.equal(f.records[0][1], 'ลูกค้า-ครบกำหนด');
  assert.equal(f.run().items.length, 0);
});
