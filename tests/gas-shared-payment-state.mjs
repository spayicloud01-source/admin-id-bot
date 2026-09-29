import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("apps-script/AdminIdBridge.gs", "utf8");
const props = { BACKEND_SPREADSHEET_ID: "BACKEND-1" };
let activeCalls = 0;
const sheets = new Map();

function makeSheet(name) {
  const rows = [];
  return {
    name,
    rows,
    getLastRow() { return rows.length; },
    setFrozenRows() {},
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        setValues(values) {
          values.forEach((sourceRow, rOff) => {
            const rr = row - 1 + rOff;
            while (rows.length <= rr) rows.push([]);
            sourceRow.forEach((value, cOff) => {
              rows[rr][col - 1 + cOff] = value;
            });
          });
        },
        getValues() {
          return rows
            .slice(row - 1, row - 1 + numRows)
            .map((r) => r.slice(col - 1, col - 1 + numCols));
        },
        clearContent() {
          for (let rOff = 0; rOff < numRows; rOff++) {
            const rr = row - 1 + rOff;
            if (!rows[rr]) continue;
            for (let cOff = 0; cOff < numCols; cOff++) {
              rows[rr][col - 1 + cOff] = "";
            }
          }
        },
        createTextFinder(value) {
          const needle = String(value);
          return {
            matchEntireCell() { return this; },
            matchCase() { return this; },
            useRegularExpression() { return this; },
            findNext() {
              const start = row - 1;
              const end = Math.min(rows.length, start + numRows);
              for (let i = start; i < end; i++) {
                if (String(rows[i]?.[col - 1] ?? "") === needle) {
                  return { getRow: () => i + 1 };
                }
              }
              return null;
            }
          };
        }
      };
    }
  };
}

const backend = {
  getSheetByName(name) { return sheets.get(name) || null; },
  insertSheet(name) {
    const sh = makeSheet(name);
    sheets.set(name, sh);
    return sh;
  }
};

const context = vm.createContext({
  Date,
  console,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) { return props[key] ?? null; },
        getProperties() { return { ...props }; }
      };
    }
  },
  SpreadsheetApp: {
    openById(id) {
      assert.equal(id, "BACKEND-1");
      return backend;
    },
    getActiveSpreadsheet() {
      activeCalls++;
      throw new Error("active spreadsheet fallback must not be used");
    }
  },
  Utilities: {
    formatDate(date, _tz, pattern) {
      if (pattern === "yyyy-MM-dd") return date.toISOString().slice(0, 10);
      return date.toISOString();
    },
    computeDigest() { return [1, 2, 3]; },
    base64EncodeWebSafe() { return "shared-key"; },
    DigestAlgorithm: { SHA_256: "sha256" }
  }
});

vm.runInContext(source, context);
vm.runInContext(`
  paymentCycleKey_ = function(source, sheet, queue, due) {
    return [source, sheet, queue, dateKey_(due)].join("|");
  };
`, context);

assert.equal(context.backendSpreadsheet_(), backend);
assert.equal(activeCalls, 0);

const due = new Date("2026-09-29T00:00:00.000Z");
const initial = { total: 300, byDay: { "2026-09-29": 300 }, reviewRows: [3] };
const written = context.writePaymentCycleShared_("v6", "V6/10-69", "310-4", due, initial);
assert.equal(written.cycle.total, 300);

let read = context.paymentCycleRecord_("v6", "V6/10-69", "310-4", due);
assert.equal(read.cycle.total, 300);
assert.deepEqual(JSON.parse(JSON.stringify(read.cycle.byDay)), { "2026-09-29": 300 });
assert.deepEqual(Array.from(read.cycle.reviewRows), [3]);

context.writePaymentCycleShared_("v6", "V6/10-69", "310-4", due, {
  total: 650,
  byDay: { "2026-09-29": 650 },
  reviewRows: [3, 4]
});
read = context.paymentCycleRecord_("v6", "V6/10-69", "310-4", due);
assert.equal(read.cycle.total, 650);
assert.deepEqual(Array.from(read.cycle.reviewRows), [3, 4]);

context.writePaymentCycleShared_("v6", "V6/10-69", "310-4", due, {
  total: 0,
  byDay: {},
  reviewRows: []
});
read = context.paymentCycleRecord_("v6", "V6/10-69", "310-4", due);
assert.equal(read.cycle.total, 0);
assert.deepEqual(Object.keys(read.cycle.byDay), []);

console.log("GAS shared payment state: passed");
