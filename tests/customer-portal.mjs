import assert from "node:assert/strict";

process.env.CUSTOMER_PORTAL_SECRET = "customer-portal-test-secret";

const {
  customerSessionToken,
  money,
  normalizeCustomerName,
  normalizeQueue,
  safeCustomerView,
  verifyCustomerSession,
} = await import("../lib/customerPortal.js");

assert.equal(normalizeQueue(" 310 - 10 "), "310-10");
assert.equal(normalizeCustomerName("นางสาว เกวลิน  เรืองบุญ"), "เกวลินเรืองบุญ");
assert.equal(normalizeCustomerName("ด.ช. สมชาย ใจดี"), "สมชายใจดี");
assert.equal(money("1,234.567 บาท"), 1234.57);

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
assert.equal(Object.hasOwn(view, "source"), false);
assert.equal(Object.hasOwn(view, "sheet"), false);

console.log("PASS customer portal identity, session, and safe response");
