import assert from "node:assert/strict";
import { buildPaymentPayload, paymentQrUrl, supportsPaymentQr, verifyPaymentQrRequest } from "../lib/paymentQr.js";

process.env.SHEETS_BRIDGE_SECRET = "test-secret";
process.env.PUBLIC_BASE_URL = "https://admin-id-bot.example";

for (const [source, amount, expected] of [["v6", 15, "15.00"], ["v1/v3", 117.5, "117.50"]]) {
  assert.equal(supportsPaymentQr(source), true);
  const payload = buildPaymentPayload(source, amount);
  assert.match(payload, new RegExp("54" + String(expected.length).padStart(2, "0") + expected));
  assert.match(payload, /^000201010212/);
  assert.match(payload, /6304[0-9A-F]{4}$/);
  const url = new URL(paymentQrUrl(source, amount));
  assert.equal(url.origin, "https://admin-id-bot.example");
  assert.equal(url.pathname, "/api/payment/qr");
  assert.equal(url.searchParams.get("amount"), expected);
  assert.equal(verifyPaymentQrRequest({
    source: url.searchParams.get("source"),
    amount: url.searchParams.get("amount"),
    expires: url.searchParams.get("expires"),
    sig: url.searchParams.get("sig"),
  }), true);
}

assert.equal(supportsPaymentQr("other"), false);
assert.throws(() => buildPaymentPayload("v1/v3", 0));
console.log("payment QR payloads and signed URLs: passed");
