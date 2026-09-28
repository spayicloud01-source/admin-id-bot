import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bridge = readFileSync("lib/sheetsBridge.js", "utf8");
const apps = readFileSync("apps-script/AdminIdBridge.gs", "utf8");
const health = readFileSync("api/health.js", "utf8");

assert.match(apps, /VERSION: '2026\.09\.28-123'/);
assert.match(health, /EXPECTED_BRIDGE_VERSION = "2026\.09\.28-123"/);
assert.match(bridge, /"markCustomerReminderSent", "markReminderSent", "buildCustomerNotificationBatch"/);
assert.doesNotMatch(bridge, /customerNotificationBatch \? 2/);

const listStart = apps.indexOf("function listCustomerNotificationSheets_");
const listEnd = apps.indexOf("function notificationFieldLabel_", listStart);
assert.ok(listStart > 0 && listEnd > listStart);
assert.doesNotMatch(apps.slice(listStart, listEnd), /SpreadsheetApp\.openById/);

console.log("system hardening: passed");
