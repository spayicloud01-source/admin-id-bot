import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bridge = readFileSync("lib/sheetsBridge.js", "utf8");
const apps = readFileSync("apps-script/AdminIdBridge.gs", "utf8");
const health = readFileSync("api/health.js", "utf8");

assert.match(apps, /VERSION: '2026\.09\.30-128'/);
assert.match(health, /EXPECTED_BRIDGE_VERSION = "2026\.09\.30-128"/);
assert.match(bridge, /"markCustomerReminderSent", "markReminderSent", "buildCustomerNotificationBatch"/);
assert.doesNotMatch(bridge, /customerNotificationBatch \? 2/);

const listStart = apps.indexOf("function listCustomerNotificationSheets_");
const listEnd = apps.indexOf("function notificationFieldLabel_", listStart);
assert.ok(listStart > 0 && listEnd > listStart);
assert.doesNotMatch(apps.slice(listStart, listEnd), /SpreadsheetApp\.openById/);

console.log("system hardening: passed");

const targetHelpersStart = apps.indexOf("function customerTargetForSource_");
assert.ok(targetHelpersStart > 0);
assert.match(apps, /\{ source: 'v6', sheet: 'V6\/10-69' \}/);
assert.match(apps, /\{ source: 'v1\/v3', sheet: 'v3\/10-69' \}/);

for (const fn of ["listDueCustomers_", "searchCustomer_", "auditSourceWriteCapabilities_", "auditSourceSchemas_"]) {
  const start = apps.indexOf("function " + fn);
  assert.ok(start > 0, fn + " missing");
  const end = apps.indexOf("\nfunction ", start + 20);
  const block = apps.slice(start, end > start ? end : apps.length);
  assert.doesNotMatch(block, /getSheets\(\)\.filter/, fn + " must not scan all tabs");
  assert.match(block, /activeCustomerTab_/, fn + " must use exact active tab");
}

console.log("two active customer tabs only: passed");

assert.match(health, /EXPECTED_ACTIVE_SOURCES = 2/);
assert.match(health, /normalizeSelfTestForActiveSources/);
assert.match(bridge, /action === "postDeploySelfTest"\) return 15000/);
assert.match(bridge, /Sheets bridge coalesced/);
assert.doesNotMatch(bridge, /action === "checkAccess"\) return \d+/);
assert.match(bridge, /action === "postDeploySelfTest"\)/);
console.log("bridge read stabilization: passed");

assert.match(bridge, /const auditLog = action === "logAction"/);
assert.match(bridge, /const maxAttempts = auditLog \? 1/);
assert.match(bridge, /const timeoutMs = auditLog \? 5000/);
console.log("audit log latency cap: passed");

assert.match(apps, /function reconcilePaymentCycleWithSource_/);
assert.match(apps, /Only a hard-written payment cell can validate PropertiesService state/);
console.log("stale payment cycle repair: passed");
