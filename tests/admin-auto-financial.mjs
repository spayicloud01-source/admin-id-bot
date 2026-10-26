import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCommand } from "../lib/commands.js";
import { parseCloseoutCommand } from "../lib/closeoutCommand.js";
import { bridgeRoleForAction } from "../lib/sheetsBridge.js";

const cases = [
  ["รับยอด 610q12 800 24/10/2569", "payment", undefined],
  ["ตัดต้น 610q12 500 24/10/2569", "principal", "principal"],
  ["รับค่าปรับ 610q12 100 24/10/2569", "fine", "fine"],
];

for (const [input, successKind, paymentKind] of cases) {
  const command = parseCommand(input);
  assert.equal(command.action, "queuePayment", input);
  assert.equal(command.autoApprove, true, `${input} must auto-approve`);
  assert.equal(command.successKind, successKind, input);
  assert.equal(command.paymentKind, paymentKind, input);
  assert.equal(command.paidOn, "2026-10-24", input);
}

const close = parseCloseoutCommand("ปิดยอด 610q12 4800 24/10/2569");
assert.equal(close.valid, true);
assert.equal(close.command.action, "queueClose");
assert.equal(close.command.autoApprove, true);
assert.equal(close.command.successKind, "close");
assert.equal(close.command.paidOn, "2026-10-24");

assert.equal(bridgeRoleForAction("setStaffInputMode"), "payment");
assert.equal(bridgeRoleForAction("consumeStaffInputMode"), "payment");

const webhook = fs.readFileSync(new URL("../api/line/webhook.js", import.meta.url), "utf8");
assert.match(webhook, /payment: "รับยอด"/);
assert.match(webhook, /principal: "ตัดต้น"/);
assert.match(webhook, /fine: "รับค่าปรับ"/);
assert.match(webhook, /close: "ปิดยอด"/);
assert.match(webhook, /"รับค่าปรับสำเร็จ"/);

console.log("PASS: all four admin buttons route to automatic financial writes");
