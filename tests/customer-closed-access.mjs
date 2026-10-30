import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.CUSTOMER_PORTAL_SECRET = "test-closed-customer-secret";
const live = {
  source: "v6", sheet: "V6/10-69", row: 10, queue: "610-1",
  name: "ลูกค้า ทดสอบ", status: "ใช้งาน", principal: 5000,
};
let status = "ใช้งาน";
let bridgeCalls = 0;
globalThis.__closedCustomerBridge = async args => {
  assert.equal(args.action, "searchCustomer");
  bridgeCalls++;
  return { ok: true, matches: [{...live, status}] };
};
const source = readFileSync(new URL("../lib/customerPortal.js", import.meta.url), "utf8");
const patched = source.replace(
  'import { callSheetsBridge } from "./sheetsBridge.js";',
  'const callSheetsBridge=globalThis.__closedCustomerBridge;',
);
assert.notEqual(source, patched);
const portal = await import("data:text/javascript;base64,"+Buffer.from(patched).toString("base64"));
const token = portal.customerSessionToken(live);
const verified = portal.verifyCustomerSession(token);
assert.ok(verified);
assert.equal((await portal.revalidatePortalCustomer(verified)).queue, live.queue);
status = "ปิดยอดแล้ว";
assert.equal(await portal.revalidatePortalCustomer(verified), null, "previous login no longer grants access");
status = "ยกเลิก";
assert.equal(await portal.revalidatePortalCustomer(verified), null);
status = "ไม่ใช้งาน";
assert.equal(await portal.revalidatePortalCustomer(verified), null);
status = "ใช้งาน";
assert.equal((await portal.revalidatePortalCustomer(verified)).status, status);
assert.equal(bridgeCalls, 5);
console.log("PASS closed accounts rejected by central customer validation used by session, QR, slip, contact endpoints");
