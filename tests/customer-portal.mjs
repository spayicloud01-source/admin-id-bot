import assert from "node:assert/strict";

process.env.CUSTOMER_PORTAL_SECRET = "customer-portal-test-secret";

const {
  customerSessionToken,
  money,
  isPortalCustomerInactive,
  normalizeCustomerName,
  normalizeQueue,
  safeCustomerView,
  verifyCustomerSession,
} = await import("../lib/customerPortal.js");

assert.equal(normalizeQueue(" 310 - 10 "), "310-10");
assert.equal(normalizeCustomerName("นางสาว เกวลิน  เรืองบุญ"), "เกวลินเรืองบุญ");
assert.equal(normalizeCustomerName("ด.ช. สมชาย ใจดี"), "สมชายใจดี");
assert.equal(money("1,234.567 บาท"), 1234.57);
assert.equal(isPortalCustomerInactive({status:"ใช้งาน"}), false);
for (const status of ["ปิดยอดแล้ว","ปิดยอด","ปิดบัญชี","ยกเลิก","ไม่ใช้งาน"]) {
  assert.equal(isPortalCustomerInactive({status}), true, status);
}

const customer = {
  source: "v1/v3",
  sheet: "v3/10-69",
  row: 12,
  queue: "310-10",
  name: "เกวลิน เรืองบุญ",
  principal: "5,000",
  fee: "800",
  closeAmount: "5,900",
};
const now = Date.UTC(2026, 9, 30);
const token = customerSessionToken(customer, now);
assert.equal(verifyCustomerSession(token, now + 1000)?.queue, "310-10");
assert.equal(verifyCustomerSession(token + "x", now + 1000), null);
assert.equal(verifyCustomerSession(token, now + 31 * 86400 * 1000), null);

const view = safeCustomerView(customer);
assert.equal(view.principal, 5000);
assert.equal(view.closeAmount, 5900);
assert.equal(view.paymentTotal, 800);
assert.equal(view.lateFee, 0);
assert.match(view.dueMessage, /ยังไม่มีวันครบกำหนด/);
assert.equal(Object.hasOwn(view, "source"), false);
assert.equal(Object.hasOwn(view, "sheet"), false);

const overdue = safeCustomerView({ ...customer, dueDate: "24/10/2569", closeAmount: "" });
assert.equal(overdue.overdueDays, 6);
assert.equal(overdue.lateFee, 300);
assert.equal(overdue.paymentTotal, 1100);
assert.equal(overdue.closeAmount, 6100);
assert.match(overdue.dueMessage, /เกินกำหนด 6 วัน/);


const bangkokNoon = new Date("2026-10-30T05:00:00.000Z");
const statuses = [
  ["31 ต.ค. 26", 1, 0],
  ["2 พ.ย. 26", 3, 0],
  ["30 ต.ค. 26", 0, 0],
  ["23 ต.ค. 26", 0, 7],
  ["31 ต.ค. 69", 1, 0],
  ["2 พฤศจิกายน 2569", 3, 0],
  ["31/10/2569", 1, 0],
  ["2026-10-31", 1, 0],
  ["๓๑ ต.ค. ๒๖", 1, 0],
];
for (const [date, daysUntil, overdueDays] of statuses) {
  const status = safeCustomerView({ ...customer, dueDate: date }, bangkokNoon);
  assert.equal(status.daysUntil, daysUntil, "daysUntil for "+date);
  assert.equal(status.overdueDays, overdueDays, "overdueDays for "+date);
  assert.match(status.dueMessage, daysUntil > 0 ? new RegExp(String(daysUntil)+" วัน") : overdueDays > 0 ? /เกินกำหนด/ : /วันนี้/);
}
const invalidThaiMonth = safeCustomerView({ ...customer, dueDate: "31 ก.ย. 26" }, bangkokNoon);
assert.match(invalidThaiMonth.dueMessage, /ยังไม่มีวันครบกำหนด/);
const invalidThaiDay = safeCustomerView({ ...customer, dueDate: "32 ต.ค. 26" }, bangkokNoon);
assert.match(invalidThaiDay.dueMessage, /ยังไม่มีวันครบกำหนด/);

console.log("PASS customer portal identity, session, Thai due-date countdown and safe response");
