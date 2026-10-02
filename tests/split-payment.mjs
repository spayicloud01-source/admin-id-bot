import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');

function fixture() {
  const cells = new Map([
    ['6:11', 1000],
    ['6:13', new Date(2026, 8, 27)],
    ['6:41', 1000],
  ]);
  const colors = new Map();
  const props = new Map();
  const source = {
    getRange(row, col) {
      const key = `${row}:${col}`;
      return {
        getValue: () => cells.get(key) ?? '',
        setValue: value => cells.set(key, value),
        clearContent: () => cells.delete(key),
        getA1Notation: () => key,
        getRow: () => row,
        getColumn: () => col,
        getFormula: () => '',
        getNumberFormat: () => '#,##0',
        setNumberFormat() {},
        getBackground: () => colors.get(key) ?? '#ffffff',
        setBackground: color => colors.set(key, color),
      };
    }
  };
  const context = vm.createContext({
    Date, console,
    SpreadsheetApp: { flush() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key) || '',
      setProperty: (key, value) => props.set(key, value),
      deleteProperty: key => props.delete(key),
    }) },
  });
  vm.runInContext(script, context);
  Object.assign(context, {
    getSettingValue_: () => true,
    findCustomerIdentity_: () => ({ row: 6, queue: '310-2', name: 'ลูกค้าทดสอบ' }),
    sourceSpreadsheetFor_: () => ({ getSheetByName: () => source, getId: () => 'source-id' }),
    detectHeaders_: () => ({ headerRow: 2, queue: 1, dueDate: 13, fee: 11, note: 14 }),
    paymentCycleKey_: () => 'cycle:310-2:2026-09-27',
    paymentCycleRecord_: () => {
      const raw = props.get('cycle:310-2:2026-09-27') || '';
      let cycle = { total: 0, byDay: {}, reviewRows: [] };
      if (raw) cycle = JSON.parse(raw);
      return { key: 'cycle:310-2:2026-09-27', raw, cycle };
    },
    writePaymentCycleShared_: (_source, _sheet, _queue, _due, cycle) => {
      const normalized = {
        total: Number(cycle?.total || 0),
        byDay: cycle?.byDay || {},
        reviewRows: Array.isArray(cycle?.reviewRows) ? cycle.reviewRows : []
      };
      const raw = normalized.total > 0 || Object.keys(normalized.byDay).length || normalized.reviewRows.length
        ? JSON.stringify(normalized)
        : '';
      if (raw) props.set('cycle:310-2:2026-09-27', raw);
      else props.delete('cycle:310-2:2026-09-27');
      return { key: 'cycle:310-2:2026-09-27', raw, cycle: normalized };
    },
    dateKey_: date => date instanceof Date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      : '',
    findCalendarDateColumn_: (_sheet, _row, _start, date) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return ({ '2026-09-27': 41, '2026-09-28': 42, '2026-10-07': 52 })[key] || 0;
    },
    snapshotCell_: range => ({ a1: range.getA1Notation(), value: range.getValue() }),
    persistPaymentBackupLog_: () => true,
  });
  const pay = (amount, row, day = 28) => context.applyApprovedPaymentToSource_(
    [null, 'บันทึกชำระ', '310-2', 'ลูกค้าทดสอบ', 'v1/v3 / v3/10-69'],
    [new Date(2026, 8, day), null, null, null, null, null, amount], row
  );
  return { pay, cells, props };
}

test('two approved payments on the same day accumulate without moving due date until fee is covered', () => {
  const f = fixture();
  const first = f.pay(300, 12);
  assert.equal(first.ok, true, first.message);
  assert.equal(first.remaining, 700);
  assert.equal(first.cycleComplete, false);
  assert.equal(f.cells.get('6:42'), 300);
  assert.equal(f.cells.get('6:13').getDate(), 27);

  const second = f.pay(700, 13);
  assert.equal(second.ok, true);
  assert.equal(second.cycleComplete, true);
  assert.equal(f.cells.get('6:42'), 1000);
  assert.equal(f.cells.get('6:13').getDate(), 7);
  assert.equal(f.cells.get('6:52'), 1000);
  assert.equal(f.cells.has('6:41'), false);
});

test('rent plus an extra amount records the full receipt and keeps next rent unchanged', () => {
  const f = fixture();
  const result = f.pay(1150, 12);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.amount, 1150);
  assert.equal(result.paidTotal, 1150);
  assert.equal(result.remaining, 0);
  assert.equal(result.cycleComplete, true);
  assert.equal(f.cells.get('6:42'), 1150);
  assert.equal(f.cells.get('6:13').getDate(), 7);
  assert.equal(f.cells.get('6:52'), 1000);
});

test('partial rent followed by rent balance plus an extra amount records both receipts', () => {
  const f = fixture();
  const first = f.pay(300, 12);
  assert.equal(first.ok, true, first.message);
  const excess = f.pay(850, 13);
  assert.equal(excess.ok, true, excess.message);
  assert.equal(excess.paidTotal, 1150);
  assert.equal(excess.cycleComplete, true);
  assert.equal(f.cells.get('6:42'), 1150);
  assert.equal(f.cells.get('6:13').getDate(), 7);
  assert.equal(f.cells.get('6:52'), 1000);
});

test('a partial payment on the due date remains visible when the balance is paid the next day', () => {
  const f = fixture();
  assert.equal(f.pay(300, 12, 27).remaining, 700);
  assert.equal(f.cells.get('6:41'), 300);
  assert.equal(f.pay(700, 13, 28).cycleComplete, true);
  assert.equal(f.cells.get('6:41'), 300);
  assert.equal(f.cells.get('6:42'), 700);
});

test('stale shared payment total is ignored when no matching payment exists in the source sheet', () => {
  const f = fixture();
  f.props.set('cycle:310-2:2026-09-27', JSON.stringify({
    total: 500,
    byDay: { '2026-09-20': 500 },
    reviewRows: [99]
  }));
  const result = f.pay(1000, 12);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.cycleComplete, true);
  assert.equal(result.paidTotal, 1000);
  assert.equal(f.cells.get('6:42'), 1000);
  assert.equal(f.cells.get('6:13').getDate(), 7);
});

