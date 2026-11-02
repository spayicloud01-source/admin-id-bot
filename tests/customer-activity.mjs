import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../lib/customerActivityApi.js";

const root=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const routes=JSON.parse(read("vercel.json")).rewrites;
assert.equal(routes.find(x=>x.source==="/api/customer/activity")?.destination,"/api/web/send?customerRoute=activity");
assert.equal(routes.find(x=>x.source==="/api/web/customer-activity")?.destination,"/api/web/send?adminAuth=activity");
const bridge=read("api/web/send.js");
assert.match(bridge,/customerActivityHandler/);
const customer=read("customer.html");
for(const activity of ["login","overview","heartbeat","logout","contact_request","qr","payment_submit"])assert.ok(customer.includes("trackActivity('"+activity+"')"),activity);
assert.match(customer,/trackActivity\(action\)/);
assert.match(customer,/ระบบบันทึกเวลาเข้าใช้/);
const owner=read("index.html");
assert.match(owner,/data-view="activityTools"/);
assert.match(owner,/id="activityQueue"/);
assert.match(owner,/id="activityHistoryList"/);
assert.match(owner,/function loadCustomerActivity\(/);
const backend=read("lib/customerActivityApi.js");
assert.match(backend,/validOwnerSession\(req\)/);
assert.match(backend,/sessionFromCustomerRequest\(req\)/);
assert.match(backend,/aes-256-gcm/);
assert.match(backend,/ADMIN_AUTH_BLOB_READ_WRITE_TOKEN/);
assert.doesNotMatch(backend,/process\.env\.BLOB_READ_WRITE_TOKEN/);
assert.match(backend,/sameOrigin\(req\)/);
assert.match(backend,/ACTIONS\.has\(action\)/);
assert.match(backend,/ONLINE_MS\s*=\s*2 \* 60 \* 1000/);
assert.doesNotMatch(customer,/body:JSON\.stringify\(\{action,sessionId,amount/);
process.env.SHEETS_BRIDGE_SECRET="test-only-mock-session-secret";
function response(){
 const state={statusCode:200,headers:{}};
 return {
   state,
   status(n){state.statusCode=n;return this},
   setHeader(k,v){state.headers[k]=v;return this},
   json(value){state.payload=value;return this},
 };
}
const req={method:"POST",headers:{origin:"https://other.example",host:"admin-id-bot.vercel.app", "content-type":"application/json"},body:{action:"status",sessionId:"b5b8ee6e-8c89-4dd3-aa20-e6ecf0ee5455"}};
let res=response();await handler(req,res);
assert.equal(res.state.statusCode,403);
res=response();await handler({...req,headers:{host:"admin-id-bot.vercel.app"}},res);
assert.equal(res.state.statusCode,401);
res=response();await handler({method:"GET",headers:{},query:{days:"7"}},res);
assert.equal(res.state.statusCode,401);
console.log("PASS customer activity: owner-only routing, authenticated events, privacy and unauthorized guards");
