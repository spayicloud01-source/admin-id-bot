import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let lookups=[];
const customer={source:"v1/v3",sheet:"v3/10-69",row:9,queue:"310-4",name:"สมชาย ใจดี",status:"ใช้งาน"};
let activeCustomer=customer;
let result={ok:true,summary:{
  customer:{...customer},discountEligible:true,discountPercent:50,
  discountAmount:400,accumulatedFee:800,feeApplied:400,
  calculatedClose:4400,paidForCycle:100,
  discountStartDate:"25/10/2569",calculatedAt:"30/10/2569 20:00",
}};
globalThis.__discountBridge=async payload=>{lookups.push(payload);return result;};
globalThis.__discountPortal={
  sessionFromCustomerRequest: req=>req.headers?.cookie ? {queue:customer.queue} : null,
  revalidatePortalCustomer:async()=>activeCustomer,
  clearCustomerSessionCookie: res=>res.setHeader("Set-Cookie","admin_id_customer=; Max-Age=0"),
  normalizeQueue: s=>String(s||"").trim().toLowerCase(),
  normalizeCustomerName: s=>String(s||"").normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase(),
};
let source=readFileSync(new URL("../lib/customerDiscountApi.js",import.meta.url),"utf8");
source=source.replace('import { callSheetsBridge } from "./sheetsBridge.js";',
  'const callSheetsBridge=globalThis.__discountBridge;');
source=source.replace(/import \{\s*clearCustomerSessionCookie,[\s\S]*?\} from "\.\/customerPortal\.js";/,
  'const {clearCustomerSessionCookie,normalizeCustomerName,normalizeQueue,revalidatePortalCustomer,sessionFromCustomerRequest}=globalThis.__discountPortal;');
assert.doesNotMatch(source,/ from "\.\//);
const {default:handler}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
function mockRes(){
  return {code:0,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(v){this.code=v;return this;},
    json(v){this.body=v;return this;},
  };
}
async function check(method="GET",cookie="token"){const res=mockRes();await handler({method,headers:{cookie}},res);return res;}
const denied=await check("GET","");
assert.equal(denied.code,401);
assert.equal(lookups.length,0);
const good=await check();
assert.equal(good.code,200);
assert.equal(good.body.eligible,true);
assert.equal(good.body.discountPercent,50);
assert.equal(good.body.discountAmount,400);
assert.equal(good.body.calculatedClose,4300);
assert.equal(good.body.discountStartDate,"25/10/2569");
assert.equal(Object.hasOwn(good.body,"customer"),false,"never leak full source customer data");
assert.deepEqual(lookups,[{action:"getCalculatedSummary",query:"v1/v3:310-4"}]);
result={ok:true,summary:{...result.summary,discountEligible:false,discountPercent:0,
  discountAmount:0,feeApplied:800,calculatedClose:4800,
  crossCycleOutstanding:true}};
const noDiscount=await check();
assert.equal(noDiscount.code,200);
assert.equal(noDiscount.body.eligible,false);
assert.equal(noDiscount.body.calculatedClose,4700);
assert.equal(noDiscount.body.crossCycleOutstanding,true);
result={ok:true,summary:{...result.summary,customer:{...customer,queue:"310-5"}}};
const wrongQueue=await check();assert.equal(wrongQueue.code,409);
result={ok:true,summary:{...result.summary,customer:{...customer,row:8}}};
const wrongRow=await check();assert.equal(wrongRow.code,409);
result={ok:true,summary:{...result.summary,customer:{...customer,source:"v6"}}};
const wrongSource=await check();assert.equal(wrongSource.code,409);
result={ok:true,needsSelection:true,summary:null};
const duplicate=await check();assert.equal(duplicate.code,409);
activeCustomer=null;
const closed=await check();assert.equal(closed.code,401);
assert.match(closed.headers["Set-Cookie"],/Max-Age=0/);
const forbidden=await check("POST");assert.equal(forbidden.code,405);
console.log("PASS customer discount matches exact source/sheet/row/queue/name; existing GAS eligibility and paid-cycle amounts shown safely");
