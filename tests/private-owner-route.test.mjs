import assert from "node:assert/strict";
import { verifyWebSession } from "../lib/webAuth.js";
import handler from "../api/web/config.js";

const keys = ["SHEETS_BRIDGE_SECRET","ADMIN_ID_PRIVATE_LINK_KEY","ADMIN_ID_PRIVATE_OWNER_LINE_ID","GOOGLE_APPS_SCRIPT_CUSTOMER_URL","GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET","WEB_SESSION_NOT_BEFORE"];
const before = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const realFetch = global.fetch;
const privateKey = "mock-50-character-private-access-key-nobody-else-knows-4567";
const ownerId = "U" + "a".repeat(32);
const reply = () => ({
  headers:{}, statusCode:200, value:null,
  setHeader(k,v){this.headers[k]=v;return this;},
  status(v){this.statusCode=v;return this;},
  json(v){this.value=v;return this;}
});
try {
  process.env.SHEETS_BRIDGE_SECRET = "mock-signed-session-secret";
  process.env.ADMIN_ID_PRIVATE_LINK_KEY = privateKey;
  process.env.ADMIN_ID_PRIVATE_OWNER_LINE_ID = ownerId;
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL = "https://fake-gas.example.com/exec";
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET = "mock-bridge-secret";
  delete process.env.WEB_SESSION_NOT_BEFORE;
  let bridgeCalls = 0;
  global.fetch = async (_url,opts) => {
    bridgeCalls++;
    const payload=JSON.parse(opts.body);
    assert.equal(payload.action,"checkAccess");
    assert.equal(payload.lineUserId,ownerId);
    return { ok:true, status:200, text:async()=>JSON.stringify({ok:true,allowed:true,role:"เจ้าของ",staffName:"เจ้าของ"}) };
  };

  let r=reply();
  await handler({method:"POST",body:{access:privateKey}},r);
  assert.equal(r.statusCode,200,"valid private link accepted");
  assert.equal(r.value?.ok,true);
  assert.equal(verifyWebSession(r.value.token)?.sub,ownerId,"minted owner token");
  assert.equal(verifyWebSession(r.value.token)?.via,"private-link","revocable token");
  assert.equal(bridgeCalls,1,"checks owner role once");

  r=reply();
  await handler({method:"POST",body:{access:"invalid-private-key"}},r);
  assert.equal(r.statusCode,401,"bad links rejected");
  assert.equal(bridgeCalls,1,"bad links don't call bridge");

  r=reply();
  await handler({method:"DELETE",body:{}},r);
  assert.equal(r.statusCode,405,"unsupported method");

  delete process.env.ADMIN_ID_PRIVATE_LINK_KEY;
  r=reply();
  await handler({method:"POST",body:{access:privateKey}},r);
  assert.equal(r.statusCode,503,"disabled link fails closed");

  console.log("private-owner-route: 10 assertions passed (mock bridge, no external traffic)");
} finally {
  global.fetch = realFetch;
  for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
}
