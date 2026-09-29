import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("apps-script/MigratePaymentState.gs", "utf8");
const props = {
  "payment-cycle:key-a": JSON.stringify({
    total: 300,
    byDay: { "2026-09-29": 300 },
    reviewRows: [12]
  }),
  "payment-cycle:key-b": JSON.stringify({
    total: 700,
    byDay: { "2026-09-28": 700 },
    reviewRows: [13]
  }),
  "OTHER": "keep"
};

function rangeFor(data, row, col, count = 1, width = 1) {
  return {
    getDisplayValues() {
      return data.slice(row - 1, row - 1 + count)
        .map(r => r.slice(col - 1, col - 1 + width).map(v => String(v ?? "")));
    },
    setValues(values) {
      values.forEach((srcRow, rOff) => {
        const rr = row - 1 + rOff;
        while (data.length <= rr) data.push([]);
        srcRow.forEach((value, cOff) => {
          data[rr][col - 1 + cOff] = value;
        });
      });
    }
  };
}

const stateRows = [[
  "key", "source", "sheet", "queue", "dueDate",
  "total", "byDayJson", "reviewRowsJson", "updatedAt"
]];

const backups = [
  {
    cycleKey: "payment-cycle:key-a",
    source: "v6",
    sheet: "V6/10-69",
    queue: "310-4",
    oldDue: "2026-09-29T00:00:00.000Z"
  },
  {
    cycleKey: "payment-cycle:key-b",
    source: "v1/v3",
    sheet: "v3/10-69",
    queue: "310-5",
    oldDue: "2026-09-28T00:00:00.000Z"
  }
];

const logRows = [
  ["time", "", "", "", "", "", "", "", "paymentSourceBackupAfter", "", JSON.stringify(backups[0])],
  ["time", "", "", "", "", "", "", "", "paymentSourceBackupAfter", "", JSON.stringify(backups[1])]
];

const stateSheet = {
  getLastRow: () => stateRows.length,
  getRange: (r,c,n=1,w=1) => rangeFor(stateRows,r,c,n,w),
  setFrozenRows() {}
};
const logSheet = {
  getLastRow: () => logRows.length + 1,
  getRange: (r,c,n=1,w=1) => rangeFor([[]].concat(logRows),r,c,n,w)
};
const spreadsheet = {
  getSheetByName(name) {
    if (name === "สถานะชำระ") return stateSheet;
    if (name === "Log ระบบ") return logSheet;
    return null;
  },
  insertSheet() { throw new Error("state sheet should already exist"); }
};

let flushed = false;
const context = vm.createContext({
  Date,
  JSON,
  Object,
  isFinite,
  isNaN,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperties: () => ({ ...props })
    })
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet,
    flush: () => { flushed = true; }
  },
  Utilities: {
    formatDate(date, _tz, pattern) {
      assert.equal(pattern, "yyyy-MM-dd");
      return date.toISOString().slice(0, 10);
    }
  }
});
vm.runInContext(source, context);
const result = context.migrateLegacyPaymentStateToSharedSheet();

assert.equal(result.ok, true);
assert.equal(result.paymentKeys, 2);
assert.equal(result.migrated, 2);
assert.deepEqual(Array.from(result.unmapped), []);
assert.equal(flushed, true);
assert.equal(stateRows.length, 3);
assert.equal(stateRows[1][0], "payment-cycle:key-a");
assert.equal(stateRows[1][1], "v6");
assert.equal(stateRows[1][3], "310-4");
assert.equal(stateRows[1][5], 300);
assert.equal(stateRows[2][0], "payment-cycle:key-b");
assert.equal(stateRows[2][1], "v1/v3");
assert.equal(stateRows[2][5], 700);

console.log("legacy payment state migration helper: passed");
