import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFullyLockedCustomerStatus, listLockedCustomers } from "../api/web/summary.js";

// A completed lock only; pending, unlocked and inactive statuses must remain separate.
for (const status of ["ล็อค","ล็อก","ล็อคแล้ว","ล็อกแล้ว","สถานะล็อค","ล็อคเครื่อง","LOCK","locked","ใช้งาน / ล็อค"]) {
  assert.equal(isFullyLockedCustomerStatus(status),true,"must count: "+status);
}
for (const status of ["","ใช้งาน","รอล็อค","รอล็อก","รอ LOCK","ปลดล็อค","ปลดล็อกแล้ว","โกง","ลบ","ปิด","ขาย","ผ่อน","ล็อค/ปิด"]) {
  assert.equal(isFullyLockedCustomerStatus(status),false,"must not count: "+status);
}
const calls = [];
const owner = {sub:"Uowner-only"};
const pages = [
  {ok:true,items:[
    {source:"v1/v3",sheet:"v3/10-69",row:15,queue:"310-13",name:"สมชาย",status:"ล็อค",fee:"1,000",dueDate:"05/11/69",phone:"MUST_NOT_LEAK"},
    {source:"v1/v3",sheet:"v3/10-69",row:16,queue:"310-14",name:"สมหญิง",status:"รอล็อค"},
    {source:"v6",sheet:"V6/10-69",row:7,queue:"610-7",name:"สมใจ",status:"ล็อกแล้ว",fee:"900"},
    {source:"other",sheet:"other",row:10,queue:"bad",name:"not allowed",status:"ล็อค"}
   ],nextPage:1,complete:false,errors:[]},
  {ok:true,items:[
    {source:"v1/v3",sheet:"v3/10-69",row:15,queue:"310-13",name:"สมชาย",status:"ล็อค"},
    {source:"v1/v3",sheet:"v3/10-69",row:17,queue:"310-15",name:"",status:"ล็อค"},
    {source:"v6",sheet:"V6/10-69",row:9,queue:"610-9",name:"สมบัติ",status:"ปลดล็อค"},
   ],nextPage:null,complete:true,errors:[]}
];
const bridge=async (payload)=>{
  assert.equal(payload.action,"listAllCustomers");
  assert.equal(payload.lineUserId,owner.sub);
  assert.equal(payload.sourceType,"user");
  calls.push(payload);
  return pages[payload.page];
};
const result=await listLockedCustomers(owner,bridge);
assert.deepEqual(result.map(x=>x.queue),["310-13","610-7"]);
assert.equal(result[0].status,"ล็อค");
assert.equal(result[1].fee,"900");
assert.equal(result[0].phone,undefined,"do not send unnecessary PII to browser");
assert.deepEqual(calls.map(x=>x.page),[0,1]);
for(const incomplete of [
  {ok:true,items:[],nextPage:null,complete:false,errors:[]},
  {ok:true,items:[],nextPage:null,complete:true,errors:["V6 unavailable"]},
  {ok:false,error:"unauthorized"},
]){
  await assert.rejects(()=>listLockedCustomers(owner,async ()=>incomplete),
    /ไม่สามารถ|อ่านไม่ครบ|ยังไม่ครบ/,"never misrepresent a failed read as a zero count");
}
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script,"owner dashboard has inline script");
new Function(script[1]);
assert.match(html,/id="cardLocked"/);
assert.match(html,/id="lockedCount"/);
assert.match(html,/<div class="label">สถานะล็อค<\/div>/);
for (const id of ["cardDeleted","cardPendingLock","cardFraud","deletedCount","pendingLockCount","fraudCount"]) {
  assert.equal(html.includes(id),false,"unused dashboard card references must be removed: "+id);
}
assert.match(html,/byId\("cardLocked"\)\.onclick=function\(\)\{openDue\("locked"\)/);
assert.match(html,/\{mode:"locked",id:"lockedCount"\}/,
  "owner dashboard refresh must populate locked count");
assert.match(html,/data-dir-source/,"existing locked customer detail remains clickable");
assert.match(html,/counts:\{[^}]*locked:byId\("lockedCount"\)/,
  "cached dashboard counts include locked not deleted");
const route=readFileSync(new URL("../api/web/summary.js",import.meta.url),"utf8");
assert.match(route,/mode === "locked"/);
assert.match(route,/action:"listAllCustomers"/);
assert.match(route,/currentOwnerSessionFromRequest\(req\)/);
assert.match(route,/mode === "locked" && !\(await validOwnerSession\(req\)\)/,
 "only a currently authorized owner may view a cached locked roster");
assert.doesNotMatch(route,/appendRow|setValues|pushMessage|resolveReviewQueue/);
console.log("PASS dashboard locked status: owner-only V3/V6 listing, no pending/closed rows, safe count and UI removal");
