import assert from "node:assert/strict";
import fs from "node:fs";

const gas = fs.readFileSync(new URL("../apps-script/AdminIdBridge.gs", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../api/line/webhook.js", import.meta.url), "utf8");
const diagnostics = fs.readFileSync(new URL("../api/sheets/diagnostics.js", import.meta.url), "utf8");

assert.match(gas, /VERSION:\s*'2026\.10\.26-143'/);
assert.match(gas, /const paidAt = parseDateFlexible_\(paidOn\)/);
assert.match(gas, /sh\.appendRow\(\[\s*paidAt,/s);
assert.match(webhook, /if \(command\.paidOn\) payload\.paidOn = command\.paidOn/);
assert.match(diagnostics, /payment:\s*"2026\.10\.26-143"/);
assert.match(gas, /function setStaffInputMode_\(body\)/);
assert.match(gas, /function consumeStaffInputMode_\(body\)/);
assert.match(webhook, /handleStaffInputPostback/);
assert.match(webhook, /consumeStaffInputMode/);
assert.match(webhook, /parseCommand\(`รับยอด \$\{text\}`\)/);

console.log("PASS: all financial commands carry the selected receipt date to Payment GAS");
