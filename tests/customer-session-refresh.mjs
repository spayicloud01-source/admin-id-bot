import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.CUSTOMER_PORTAL_SECRET = "local-session-refresh-test-secret";
const portal = await import("../lib/customerPortal.js");
const customer = {
  source: "v6", sheet: "V6/10-69", row: 3, queue: "610-1",
  name: "ลูกค้าทดสอบ", status: "ใช้งาน", fee: 500, principal: 2000,
};
let currentCustomer = customer;
let historyCount = 0;
globalThis.__sessionBridgeMock = async request => {
  if (request.action === "getHistory") historyCount += 1;
  return { ok: true, items: [] };
};
globalThis.__sessionPortalMock = {
  ...portal,
  revalidatePortalCustomer: async () => portal.isPortalCustomerInactive(currentCustomer) ? null : currentCustomer,
  findPortalCustomer: async () => ({customer:currentCustomer,reason:""}),
};
const code = readFileSync(new URL("../lib/customerSessionApi.js", import.meta.url), "utf8")
  .replace('import { callSheetsBridge } from "./sheetsBridge.js";',
    'const callSheetsBridge=globalThis.__sessionBridgeMock;')
  .replace(/import \{\s*clearCustomerSessionCookie,[\s\S]*?\} from "\.\/customerPortal\.js";/,
    "const {clearCustomerSessionCookie,clientIp,customerSessionToken,isPortalCustomerInactive,findPortalCustomer,normalizeCustomerName,normalizeQueue,revalidatePortalCustomer,safeCustomerView,sessionFromCustomerRequest,setCustomerSessionCookie}=globalThis.__sessionPortalMock;");
assert.doesNotMatch(code,/from "\.\/customerPortal\.js"/);
const {default: handler} = await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const original = portal.customerSessionToken(customer, Date.now()-10*86400000);
const cookie = "admin_id_customer="+encodeURIComponent(original);
const req = {method:"GET",headers:{cookie}};
function mockRes(){
  return {
    code: null, response:null, headers:{},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;},
    status(code){this.code=code;return this;},
    json(value){this.response=value;return this;},
  };
}
const active=mockRes();
await handler(req,active);
assert.equal(active.code,200);
assert.equal(active.response.customer.inactive,false);
const rotated=decodeURIComponent(active.headers["set-cookie"].match(/^admin_id_customer=([^;]+);/)[1]);
const oldExpiry=portal.verifyCustomerSession(original).exp;
const newExpiry=portal.verifyCustomerSession(rotated).exp;
assert.ok(newExpiry>oldExpiry,"active valid GET extends session expiry by another 30 days");
assert.equal(historyCount,1);
currentCustomer={...customer,status:"ปิดยอดแล้ว"};
const closed=mockRes();
await handler(req,closed);
assert.equal(closed.code,401,"old valid cookie is rejected as soon as account is closed");
assert.match(closed.headers["set-cookie"],/Max-Age=0/,"closed account cookie cleared");
assert.equal(closed.response.customer,undefined,"no account data disclosed");
assert.equal(historyCount,1,"closed account history never returned");

const login=mockRes();
await handler({
  method:"POST",
  headers:{"x-forwarded-for":"203.0.113.22"},
  body:{queue:"610-1",firstName:"ลูกค้า",lastName:"ทดสอบ"},
},login);
assert.equal(login.code,403,"fresh login cannot access a closed account");
assert.match(login.response.error,/ไม่สามารถเข้าสู่ระบบได้/);
assert.match(login.headers["set-cookie"],/Max-Age=0/);
const invalid=mockRes();
await handler({method:"GET",headers:{cookie:"admin_id_customer=invalid"}},invalid);
assert.equal(invalid.code,401);
assert.equal(invalid.headers["set-cookie"],undefined);
const logout=mockRes();
await handler({method:"DELETE",headers:{cookie}},logout);
assert.equal(logout.code,200);
assert.match(logout.headers["set-cookie"],/Max-Age=0/);
console.log("PASS active sessions renew 30 days; closed sessions revoked and fresh login blocked");
