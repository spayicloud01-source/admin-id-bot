import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../apps-script/AdminIdBridge.gs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(script, context);

test('distinct payment messages with the same amount may both enter review; retries of one message may not', () => {
  const customer = { source: 'v1/v3', sheet: 'v3/10-69', queue: '310-2' };
  const rows = [
    [null, 'บันทึกชำระ', '310-2', 'ลูกค้าทดสอบ', 'v1/v3 / v3/10-69', null, '300', 'message-one', 'รอตรวจ'],
    [null, 'บันทึกชำระ', '310-2', 'ลูกค้าทดสอบ', 'v1/v3 / v3/10-69', null, '300', 'message-two', 'ผ่าน'],
  ];
  const sheet = {
    getLastRow: () => 3,
    getRange: () => ({ getDisplayValues: () => rows })
  };
  const duplicate = context.hasDuplicatePendingReview_;
  assert.equal(duplicate(sheet, 'บันทึกชำระ', customer, 300, 'message-one'), 2);
  assert.equal(duplicate(sheet, 'บันทึกชำระ', customer, 300, 'message-two'), 3);
  assert.equal(duplicate(sheet, 'บันทึกชำระ', customer, 300, 'message-three'), null);
});
