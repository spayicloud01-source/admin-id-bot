import assert from "node:assert/strict";
import { parseCommand } from "../lib/commands.js";
import { parseCloseoutCommand } from "../lib/closeoutCommand.js";

assert.deepEqual(
  pick(parseCommand("รับยอด 610q11 1,100"), ["action", "query", "amount", "autoApprove", "successKind"]),
  { action: "queuePayment", query: "610q11", amount: 1100, autoApprove: true, successKind: "payment" },
);

assert.deepEqual(
  pick(parseCommand("รับยอด 610-4 900 ปรับ100"), ["action", "query", "amount", "totalAmount", "fineAmount", "autoApprove", "successKind", "invalidCombined"]),
  { action: "queuePayment", query: "610-4", amount: 800, totalAmount: 900, fineAmount: 100, autoApprove: true, successKind: "combinedFine", invalidCombined: false },
);

assert.deepEqual(
  pick(parseCommand("รับยอด 610-4 1,250 ค่าปรับ50"), ["amount", "totalAmount", "fineAmount", "successKind", "invalidCombined"]),
  { amount: 1200, totalAmount: 1250, fineAmount: 50, successKind: "combinedFine", invalidCombined: false },
);

assert.equal(parseCommand("รับยอด 610-4 100 ปรับ100")?.invalidCombined, true);

assert.deepEqual(
  pick(parseCommand("ตัดต้น 310-4 1,100 ปรับ100"), ["action", "query", "amount", "totalAmount", "fineAmount", "paymentKind", "baseKind", "successKind", "invalidCombined"]),
  { action: "queuePayment", query: "310-4", amount: 1000, totalAmount: 1100, fineAmount: 100, paymentKind: "principal", baseKind: "principal", successKind: "combinedFine", invalidCombined: false },
);

assert.deepEqual(
  pick(parseCommand("ตัดต้น 310-4 1,000"), ["action", "query", "amount", "paymentKind", "autoApprove", "successKind"]),
  { action: "queuePayment", query: "310-4", amount: 1000, paymentKind: "principal", autoApprove: true, successKind: "principal" },
);

assert.deepEqual(
  pick(parseCommand("610q9 ชำระยอด 1700 ตัดต้น1000"), ["action", "query", "amount", "totalAmount", "principalAmount", "autoApprove", "successKind", "invalidCombined"]),
  { action: "queuePayment", query: "610q9", amount: 700, totalAmount: 1700, principalAmount: 1000, autoApprove: true, successKind: "combined", invalidCombined: false },
);

assert.deepEqual(
  pick(parseCommand("610q9 ชำระยอด 1800 ตัดต้น1000 ปรับ100"), ["amount", "totalAmount", "principalAmount", "fineAmount", "successKind", "invalidCombined"]),
  { amount: 700, totalAmount: 1800, principalAmount: 1000, fineAmount: 100, successKind: "combined", invalidCombined: false },
);

assert.equal(parseCommand("610q9 ชำระยอด 900 ตัดต้น1000")?.invalidCombined, true);

const close = parseCloseoutCommand("ปิดยอด 310-6 5,550 ปรับ150");
assert.equal(close?.matched, true);
assert.equal(close?.valid, true);
assert.deepEqual(
  pick(close.command, ["action", "query", "amount", "totalAmount", "fineAmount", "autoApprove", "baseKind", "successKind"]),
  { action: "queueClose", query: "310-6", amount: 5400, totalAmount: 5550, fineAmount: 150, autoApprove: true, baseKind: "close", successKind: "combinedFine" },
);

assert.equal(parseCloseoutCommand("ปิดยอด 310-6 500 ปรับ600")?.valid, false);
assert.equal(parseCloseoutCommand("ค้นหา 310-6"), null);

assert.deepEqual(
  pick(parseCommand("ยกเลิกรายการ 123,124"), ["action", "query"]),
  { action: "prepareRollbackReviewQueue", query: "123,124" },
);
assert.deepEqual(
  pick(parseCommand("ยืนยันยกเลิก 123,124"), ["action", "query"]),
  { action: "confirmRollbackReviewQueue", query: "123,124" },
);
assert.deepEqual(
  pick(parseCommand("ยกเลิกล่าสุด"), ["action", "query"]),
  { action: "latestRollbackHelp", query: "" },
);

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value?.[key]]));
}

console.log("financial command self-test passed");
