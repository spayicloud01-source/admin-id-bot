import assert from "node:assert/strict";
import fs from "node:fs";

const gas = fs.readFileSync(new URL("../apps-script/AdminIdBridge.gs", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../api/line/webhook.js", import.meta.url), "utf8");
const sheetsBridge = fs.readFileSync(new URL("../lib/sheetsBridge.js", import.meta.url), "utf8");

assert.match(gas, /VERSION: '2026\.10\.25-140'/);
assert.match(gas, /'getLatestReversibleReview', 'rollbackReviewGroup'/);
assert.match(gas, /function getLatestReversibleReview_/);
assert.match(gas, /function rollbackReviewGroup_/);
assert.match(gas, /descending = ids\.slice\(\)\.sort/);
assert.match(gas, /ยกเลิกทั้งชุดไม่ครบ/);

assert.match(webhook, /action === "prepareRollbackReviewQueue"/);
assert.match(webhook, /action === "latestRollbackHelp"/);
assert.match(webhook, /action === "confirmRollbackReviewQueue"/);
assert.match(webhook, /รายการ: " \+ rowNos\.map/);
assert.match(webhook, /ตรวจสอบ \/ ยกเลิก/);

assert.match(sheetsBridge, /"getLatestReversibleReview", "rollbackReviewGroup"/);
assert.match(sheetsBridge, /"rollbackReviewQueue", "rollbackReviewGroup"/);

console.log("PASS: rollback preview, confirmation, latest lookup and grouped rollback wiring");
