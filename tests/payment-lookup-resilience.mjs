import assert from "node:assert/strict";
import { callSheetsBridge } from "../lib/sheetsBridge.js";

process.env.GOOGLE_APPS_SCRIPT_URL = "https://bridge.test";
process.env.SHEETS_BRIDGE_SECRET = "secret";

let attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  if (attempts < 3) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: false,
        error: "Exception: Too many simultaneous invocations",
      }),
    };
  }
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: true,
      matches: [{ source: "v6", sheet: "V6/10-69", queue: "310-3" }],
    }),
  };
};

const lookup = await callSheetsBridge({
  action: "searchCustomer",
  query: "v6:310-3",
  paymentLookup: true,
});

assert.equal(attempts, 3);
assert.equal(lookup.ok, true);
assert.equal(lookup.matches[0].queue, "310-3");

attempts = 0;
globalThis.fetch = async () => {
  attempts += 1;
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: false,
      error: "Exception: Too many simultaneous invocations",
    }),
  };
};

await assert.rejects(
  () => callSheetsBridge({
    action: "queuePayment",
    query: "v6:test@example.com",
    amount: 100,
  }),
  /simultaneous invocations/
);
assert.equal(attempts, 1, "financial writes must not be retried");

console.log("Payment lookup resilience tests passed");
