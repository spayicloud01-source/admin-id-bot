import assert from "node:assert/strict";
import { detailCustomer } from "../lib/adminCustomerDirectoryApi.js";

const owner={sub:"Uowner-123"};
const query={source:"v1/v3",sheet:"v3/10-69",queue:"310-13"};
const customer={
  source:query.source,sheet:query.sheet,queue:query.queue,
  name:"ลูกค้าทดสอบ",model:"iPhone 14",status:"ใช้งาน",
  principal:5000,fee:1000,dueDate:"07/11/2569",note:""
};
const history={items:[
 {source:query.source,sheet:query.sheet,queue:query.queue,dateTime:"01/11/2569 10:00",
   eventType:"รับยอด",amount:"1,000",note:"ตรวจสอบแล้ว"},
 {source:"v6",sheet:"V6/10-69",queue:query.queue,dateTime:"01/11/2569",
   eventType:"รายการอื่น",amount:"99,999"}
]};
let pending={};
let called=[];
const bridge=(payload)=>{
  called.push(payload);
  return new Promise((resolve,reject)=>{pending[payload.action]={resolve,reject};});
};
const task=detailCustomer(owner,query,bridge);
assert.deepEqual(called.map(c=>c.action),["searchCustomer","getHistory"],
 "Both independent read-only GAS calls must start before the first settles");
assert.ok(called.every(c=>c.lineUserId===owner.sub&&c.sourceType==="user"));
assert.ok(called.every(c=>!/(write|push|send|approve|payment)/i.test(c.action)));
pending.getHistory.resolve(history);
pending.searchCustomer.resolve({ok:true,matches:[customer]});
const result=await task;
assert.equal(result.status,200);
assert.equal(result.data.customer.queue,query.queue);
assert.equal(result.data.customer.principal,5000);
assert.equal(result.data.history.length,1,"history from other customer/source must be rejected");
assert.equal(result.data.history[0].amount,1000);

let calls=[];
const missing=await detailCustomer(owner,query,async p=>{
 calls.push(p.action);
 return p.action==="searchCustomer"?{ok:true,matches:[]}:history;
});
assert.equal(missing.status,404);
assert.deepEqual(calls,["searchCustomer","getHistory"]);

const ambiguous=await detailCustomer(owner,query,async p=>
 p.action==="searchCustomer"?{ok:true,matches:[customer,customer]}:history
);
assert.equal(ambiguous.status,409);

const fallback=await detailCustomer(owner,query,async p=>{
 if(p.action==="getHistory")throw Error("History service unavailable");
 return {ok:true,matches:[customer]};
});
assert.equal(fallback.status,200,"history failure should not block verified customer detail");
assert.equal(fallback.data.customer.name,customer.name);
assert.ok(fallback.data.historyWarning.includes("ไม่สามารถดึง"));

await assert.rejects(
 detailCustomer(owner,query,async p=>{
   if(p.action==="searchCustomer")throw Error("Customer lookup unavailable");
   return history;
 }),
 /Customer lookup unavailable/
);
const invalidCalls=[];
const invalid=await detailCustomer(owner,{source:"another",sheet:"x",queue:"310-13"},async p=>{
  invalidCalls.push(p);throw Error("Should not call GAS");
});
assert.equal(invalid.status,400);
assert.equal(invalidCalls.length,0);
console.log("PASS customer detail: concurrent read-only GAS calls, exact identity filter, history fallback and invalid-input guards");
