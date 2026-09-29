import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bridgeRoleForAction, getBridgeRoutingStatus } from "../lib/sheetsBridge.js";

assert.equal(bridgeRoleForAction("getCustomerSelf"), "customer");
assert.equal(bridgeRoleForAction("searchCustomer"), "customer");
assert.equal(bridgeRoleForAction("queuePayment"), "payment");
assert.equal(bridgeRoleForAction("resolveReviewQueue"), "payment");
assert.equal(bridgeRoleForAction("buildCustomerNotificationBatch"), "notify");
assert.equal(bridgeRoleForAction("getCustomerReminderBatch"), "notify");

const gas = readFileSync("apps-script/AdminIdBridge.gs", "utf8");
assert.match(gas, /function bridgeRole_\(\)/);
assert.match(gas, /function bridgeRoleAllowsAction_\(role, action\)/);
assert.match(gas, /Action not allowed for this bridge role/);
assert.match(gas, /role: bridgeRole/);

assert.match(gas, /function backendSpreadsheet_\(\)/);
assert.match(gas, /BACKEND_SPREADSHEET_ID/);
assert.match(gas, /PAYMENT_STATE_SHEET: 'สถานะชำระ'/);
assert.match(gas, /function paymentCycleRecord_\(/);
assert.match(gas, /function writePaymentCycleShared_\(/);
assert.match(gas, /function migratePaymentStateToSharedSheet\(/);
assert.doesNotMatch(gas, /getProperty\(\s*paymentCycleKey_/);
assert.doesNotMatch(gas, /setProperty\(\s*cycleKey/);
assert.doesNotMatch(gas, /deleteProperty\(\s*cycleKey/);

const activeSpreadsheetCalls = (gas.match(/SpreadsheetApp\.getActiveSpreadsheet\(\)/g) || []).length;
assert.equal(activeSpreadsheetCalls, 1, "only backendSpreadsheet_ fallback may use getActiveSpreadsheet");

const manualStart = gas.indexOf("function buildCustomerNotificationBatchLocked_");
const manualEnd = gas.indexOf("function notificationFieldLabel_", manualStart);
const manual = gas.slice(manualStart, manualEnd);
assert.match(manual, /rowsToAppend/);
assert.match(manual, /\.setValues\(rowsToAppend\)/);
assert.doesNotMatch(manual, /notifySheet\.appendRow/);

const autoStart = gas.indexOf("function getCustomerReminderBatchLocked_");
const autoEnd = gas.indexOf("function markCustomerReminderSent_", autoStart);
const auto = gas.slice(autoStart, autoEnd);
assert.match(auto, /rowsToAppend/);
assert.match(auto, /\.setValues\(rowsToAppend\)/);
assert.doesNotMatch(auto, /notifySheet\.appendRow/);

const oldEnv = {
  GOOGLE_APPS_SCRIPT_CUSTOMER_URL: process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL,
  GOOGLE_APPS_SCRIPT_PAYMENT_URL: process.env.GOOGLE_APPS_SCRIPT_PAYMENT_URL,
  GOOGLE_APPS_SCRIPT_NOTIFY_URL: process.env.GOOGLE_APPS_SCRIPT_NOTIFY_URL,
  GOOGLE_APPS_SCRIPT_URL: process.env.GOOGLE_APPS_SCRIPT_URL,
  SHEETS_BRIDGE_SECRET: process.env.SHEETS_BRIDGE_SECRET,
};
delete process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL;
delete process.env.GOOGLE_APPS_SCRIPT_PAYMENT_URL;
delete process.env.GOOGLE_APPS_SCRIPT_NOTIFY_URL;
process.env.GOOGLE_APPS_SCRIPT_URL = "https://legacy.example";
process.env.SHEETS_BRIDGE_SECRET = "shared";
let status = getBridgeRoutingStatus();
assert.equal(status.legacyFallback, true);
assert.equal(status.customer, false);
assert.equal(status.sharedSecret, true);

process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL = "https://customer.example";
process.env.GOOGLE_APPS_SCRIPT_PAYMENT_URL = "https://payment.example";
process.env.GOOGLE_APPS_SCRIPT_NOTIFY_URL = "https://notify.example";
status = getBridgeRoutingStatus();
assert.equal(status.customer, true);
assert.equal(status.payment, true);
assert.equal(status.notify, true);

for (const [key, value] of Object.entries(oldEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
console.log("gas 3+ routing: passed");
