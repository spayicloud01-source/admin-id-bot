const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const logs = [];
const scriptProps = {};
const rows = [[
  'วันที่ขอ', 'LINE User ID', 'ชื่อลูกค้า', 'เบอร์โทร', 'แหล่งข้อมูล', 'ชีต',
  'คิว', 'สถานะ', 'ผู้อนุมัติ', 'วันที่อนุมัติ', 'รับแจ้งเตือน', 'หมายเหตุ', 'ใช้งานล่าสุด'
]];

const sheet = {
  getLastRow: () => rows.length,
  getRange(row, column, count = 1) {
    return {
      getDisplayValues: () => rows.slice(row - 1, row - 1 + count).map((r) => r.map((x) => String(x ?? ''))),
      setValues: (values) => { rows[row - 1] = values[0]; },
      setValue: (value) => { rows[row - 1][column - 1] = value; },
    };
  },
  appendRow: (row) => rows.push(row),
};

const context = vm.createContext({
  Date,
  console,
  Utilities: { formatDate: (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => Object.prototype.hasOwnProperty.call(scriptProps, key) ? scriptProps[key] : null,
      setProperty: (key, value) => { scriptProps[key] = String(value); },
    }),
  },
});
vm.runInContext(fs.readFileSync('apps-script/AdminIdBridge.gs', 'utf8'), context);
vm.runInContext(`
  getSettingValue_ = function() { return true; };
  isTrue_ = function(value) { return value === true || value === 'TRUE'; };
  customerLineSheet_ = function() { return sheet; };
  logCustomerBindingEvent_ = function(id, queue, name, result, status) {
    logs.push({ id: id, queue: queue, name: name, result: result, status: status });
  };
  findExactCustomerForBinding_ = function(queue, name) {
    return queue === '6121' && name === 'ภาณุ' ? [{
      source: 'v6', sheet: 'V6/10-69', queue: '6121', name: 'ภาณุ', phone: '',
      model: 'iPhone 15', principal: '15,000', fee: '1,500', saleDate: '24/09/2569'
    }] : [];
  };
`, vm.createContext(Object.assign(context, { sheet, logs })));

const bind = (id, queue, fullName) => context.requestCustomerBinding_({ lineUserId: id, queue, fullName });
assert.equal(bind('U-first', '6121', 'ผิดชื่อ').bound, false);
const firstBinding = bind('U-first', '6121', 'ภาณุ');
assert.equal(firstBinding.bound, true);
assert.equal(firstBinding.customerOverview.model, 'iPhone 15');
assert.equal(firstBinding.customerOverview.principal, '15,000');
assert.equal(firstBinding.customerOverview.fee, '1,500');
assert.equal(firstBinding.customerOverview.saleDate, '2026-09-24');
assert.equal(rows.length, 2);
assert.equal(rows[1][7], 'ใช้งาน');
assert.equal(rows[1][10], true);
assert.equal(bind('U-first', '6121', 'ภาณุ').alreadyBound, true);
assert.equal(bind('U-first', '9999', 'คนอื่น').rejectedNewIdentity, true);
assert.equal(bind('U-second', '6121', 'ภาณุ').bound, false);
assert.equal(context.cancelCustomerBindings_({ lineUserId: 'U-first' }).changed, false);
rows[1][7] = 'ระงับ';
assert.equal(bind('U-first', '6121', 'ภาณุ').suspended, true);
assert.equal(bind('U-first', '9999', 'คนอื่น').suspended, true);
assert.equal(bind('U-second', '6121', 'ภาณุ').bound, false);
assert.equal(rows.length, 2);
assert.ok(logs.some((x) => x.id === 'U-first' && x.status === 'สำเร็จ'));
assert.ok(logs.some((x) => x.id === 'U-first' && x.status === 'ปฏิเสธ'));
console.log('customer binding safety: passed');

assert.deepEqual(Array.from(context.getCustomerAutoReminderSheetKeys_()), []);
scriptProps.CUSTOMER_AUTO_REMINDER_SHEETS = 'v6|V6/10-69,v1/v3|v3/10-69';
assert.deepEqual(
  Array.from(context.getCustomerAutoReminderSheetKeys_()),
  ['v6|V6/10-69', 'v1/v3|v3/10-69']
);
delete scriptProps.CUSTOMER_AUTO_REMINDER_SHEETS;
console.log('automatic reminder requires explicit sheet selection: passed');

const customerRows = [rows[0],
  [new Date(), 'U-first', 'ภาณุ', '', 'v6', 'V6/10-69', '6121', 'ใช้งาน'],
  [new Date(), 'U-third', 'มานี', '', 'v6', 'V6/10-69', '6122', 'ใช้งาน']
];
const notificationRows = [['เวลา', 'ประเภท', 'คิว', 'ชื่อ', 'LINE', 'วันครบ', 'ยอด', 'ข้อความ', 'สถานะ', 'ส่ง', 'แหล่ง']];
const grid = (data) => ({
  getLastRow: () => data.length,
  getRange: (row, column, count = 1, width = 1) => ({
    getDisplayValues: () => data.slice(row - 1, row - 1 + count).map((r) => r.slice(column - 1, column - 1 + width).map((x) => String(x ?? ''))),
    getValues: () => data.slice(row - 1, row - 1 + count).map((r) => r.slice(column - 1, column - 1 + width)),
  }),
  appendRow: (row) => data.push(row),
});
const notify = grid(notificationRows);
Object.assign(context, {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => notify }) },
  Utilities: { formatDate: (date) => date.toISOString().slice(0, 10) },
});
vm.runInContext(`
  ownerAccessForCustomerNotification_ = function() { return { role: 'เจ้าของ' }; };
  isConfiguredCustomerNotificationSheet_ = function(s, t) { return s === 'v6' && t === 'V6/10-69'; };
  customerLineSheet_ = function() { return customerGrid; };
  findCustomerIdentity_ = function(s, t, q) {
    return { source: s, sheet: t, queue: q, name: q === '6121' ? 'ภาณุ' : 'มานี' };
  };
  calculateCustomerSelfSummary_ = function(c) {
    return { name: c.name, queue: c.queue, dueDate: '1 ต.ค. 26', calculatedClose: 2000 };
  };
  logAction_ = function() {};
`, Object.assign(context, { customerGrid: grid(customerRows) }));
const send = (selection) => context.buildCustomerNotificationBatch_(Object.assign({
  source: 'v6', sheet: 'V6/10-69', field: 'due', lineUserId: 'U-owner'
}, selection));
assert.equal(send({}).items.length, 2);
assert.equal(send({ queues: '6121,6122' }).items.length, 0);
assert.equal(send({ queue: '6121' }).items.length, 0);
assert.equal(notificationRows.length, 3);
assert.equal(context.buildCustomerNotificationBatch_({ source: 'bad', sheet: 'other', field: 'due' }).items.length, 0);
console.log('notification selection and duplicate protection: passed');
