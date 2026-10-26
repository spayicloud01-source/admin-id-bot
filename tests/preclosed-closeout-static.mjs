import assert from "node:assert/strict";
import fs from "node:fs";

const gas = fs.readFileSync(new URL("../apps-script/AdminIdBridge.gs", import.meta.url), "utf8");

assert.match(gas, /VERSION: '2026\.10\.26-143'/);
assert.match(gas, /preMarkedCloseout/);
assert.match(gas, /noteHasCloseout/);
assert.match(gas, /calendarHasCloseout/);
assert.match(gas, /approvedCloseoutExists/);
assert.match(gas, /normalizeGeneral_\(customer\.status\) === normalizeGeneral_\('ปิดยอด'\)/);
assert.match(gas, /index \+ 2 !== reviewRowNo/);
assert.match(gas, /String\(row\[8\] \|\| ''\)\.trim\(\) === 'ผ่าน'/);

console.log("PASS: pre-marked closeout is allowed only without prior closeout evidence");
