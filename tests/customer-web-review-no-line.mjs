import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/customerPaymentApi.js", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.doesNotMatch(source, /api\\.line\\.me|notifyReviewers|pushLine\\(/);
assert.match(adminPage, /เปิดสลิปเพื่อตรวจสอบ/);
assert.match(adminPage, /getReviewQueueItem/);
assert.match(adminPage, /resolveReviewQueue/);

const calls = [];
const seen = new Map();
globalThis.__putMock = async (path, contents) => {
  calls.push({type:"blob", path, contents:Buffer.from(contents).toString()});
  return {url:"https://test.public.blob.vercel-storage.com/"+path};
};
globalThis.__bridgeMock = async payload => {
  calls.push({type:"bridge", payload});
  assert.equal(payload.action, "queuePayment");
  const already = seen.get(payload.requestId);
  if (already) return {ok:true, duplicate:true, duplicateRowNo:already};
  const rowNo=100+seen.size;
  seen.set(payload.requestId,rowNo);
  return {ok:true, queued:true, rowNo, reviewerLineUserIds:["some-reviewer"]};
};
const customer = {source:"v6",sheet:"V6/10-69",row:7,queue:"610-7",name:"ลูกค้าทดสอบ",status:"ใช้งาน",principal:2000};
globalThis.__portalMock={
  customerExactPayload:()=>({source:customer.source,sheet:customer.sheet,row:customer.row,queue:customer.queue,name:customer.name}),
  money:value=>Number(value),
  revalidatePortalCustomer:async()=>customer,
  sessionFromCustomerRequest:req=>req.headers?.authorized ? {queue:customer.queue} : null,
};
process.env.CUSTOMER_PORTAL_SECRET="test-secret";
process.env.CUSTOMER_PORTAL_SERVICE_LINE_USER_ID="staff-service";
process.env.LINE_CHANNEL_ACCESS_TOKEN="unused-token";
let fetchCalls=0;
globalThis.fetch=async()=>{fetchCalls++;throw Error("Unexpected outbound network call")};
const injected=source
  .replace('import { put } from "@vercel/blob";','const put=globalThis.__putMock;')
  .replace('import { callSheetsBridge } from "./sheetsBridge.js";','const callSheetsBridge=globalThis.__bridgeMock;')
  .replace(/import \\{\\s*customerExactPayload,[\\s\\S]*?\\} from "\\.\\/customerPortal\\.js";/, 'const {customerExactPayload,money,revalidatePortalCustomer,sessionFromCustomerRequest}=globalThis.__portalMock;');
assert.doesNotMatch(injected, /from "\\.\\/customerPortal\\.js"/);
const {default: handler}=await import("data:text/javascript;base64,"+Buffer.from(injected).toString("base64"));
function response(){
  return {code:0,body:null,setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
}
const png=data=>"data:image/png;base64,"+Buffer.from(data).toString("base64");
async function submit(slipData,authorized=true){
  const res=response();
  await handler({method:"POST",headers:{authorized},body:{kind:"payment",amount:900,slipDataUrl:png(slipData)}},res);
  return res;
}
const blocked=await submit("one",false);
assert.equal(blocked.code,401);
assert.equal(calls.length,0);
const first=await submit("one");
assert.equal(first.code,200);
assert.equal(first.body.pending,true);
assert.equal(first.body.notification.channel,"admin_web");
assert.equal(first.body.notification.sent,0);
assert.match(first.body.message,/เว็บแอดมิน/);
const repeated=await submit("one");
assert.equal(repeated.code,200);
assert.equal(repeated.body.duplicate,true);
const second=await submit("two");
assert.equal(second.code,200);
assert.notEqual(first.body.rowNo,second.body.rowNo);
const blobs=calls.filter(x=>x.type==="blob");
assert.equal(blobs.length,3);
assert.equal(blobs[0].path,blobs[1].path);
assert.notEqual(blobs[0].path,blobs[2].path);
assert.equal(fetchCalls,0);
assert.equal(calls.filter(x=>x.type==="bridge").length,3);
console.log("PASS customer website queues slips without LINE, retains duplicates and separate slips; admin web can inspect and approve");
