import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const send = readFileSync("api/web/send.js", "utf8");
const bridge = readFileSync("lib/sheetsBridge.js", "utf8");

assert.match(send, /const RECIPIENT_CACHE_MS = 2 \* 60 \* 1000/);
assert.match(send, /function isExactQueue\(value\)/);
assert.match(send, /requestedAction === "getCustomerInfo"/);
assert.match(send, /action: "getCalculatedSummary"/);
assert.match(send, /source: preferredSource/);
assert.match(send, /sheet: preferredSheet/);
assert.match(send, /read-only preview must never create them/);
assert.doesNotMatch(
  send.slice(
    send.indexOf("async function resolveManualRecipient"),
    send.indexOf("async function getBoundCustomerSummary")
  ),
  /action:\\s*["']buildCustomerNotificationBatch["']/
);
assert.match(bridge, /const recipientLookup = action === "resolveCustomerNotificationRecipient"/);
assert.match(bridge, /recipientLookup \? 10000/);

console.log("web lookup speed safeguards: passed");
