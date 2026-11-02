import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceNoteEntry, mergeCustomerHistory } from "../lib/customerHistoryMerge.js";

// Read-only recreation of queue 310-5, with details verified in source tab row 12.
const customer={
  source:"v1/v3",sheet:"v3/10-69",queue:"310-5",name:"ลูกค้าทดสอบ",
  saleDate:"24 ก.ย. 26",dueDate:"3 พ.ย. 26",
  note:"รับ 1,100 ตัดต้น 500 (23/10)"
};
const approved=[
  {dateTime:"13/10/2026, 21:35:39",eventType:"ชำระค่าเช่า",amount:600},
  {dateTime:"4/10/2026, 13:38:04",eventType:"ชำระค่าเช่า",amount:600}
];
const supplemental=sourceNoteEntry(customer);
assert.equal(supplemental?.amount,1100);
assert.equal(supplemental?.dateTime,"23/10/2026");
assert.match(supplemental.detail,/ค่าเช่า 600 บาท/);
assert.match(supplemental.detail,/ตัดต้น 500 บาท/);
assert.equal(supplemental.sourceNote,true);
const merged=mergeCustomerHistory(approved,customer);
assert.equal(merged.length,3);
assert.equal(merged[0].dateTime,"23/10/2026");
assert.equal(merged[0].amount,1100);
assert.deepEqual(merged.slice(1).map(x=>x.amount),[600,600]);
assert.equal(approved.length,2,"do not mutate or rewrite approved history");
// If a transaction was approved on the same date, never show the source note twice.
const approvedSameDate=[{dateTime:"23/10/2026, 15:01:01",amount:1100,eventType:"รับยอด"},...approved];
assert.equal(mergeCustomerHistory(approvedSameDate,customer).length,3);
assert.ok(mergeCustomerHistory(approvedSameDate,customer).every(x=>!x.sourceNote));
const existingSplit=[{dateTime:"23/10/2026",amount:600},{dateTime:"23/10/2026",amount:500},...approved];
assert.equal(mergeCustomerHistory(existingSplit,customer).length,4);
assert.equal(sourceNoteEntry({...customer,note:"ปิดยอด 4800"}),null);
assert.equal(sourceNoteEntry({...customer,note:"รับ 1,100 ตัดต้น 1,100 (23/10)"}),null);
assert.equal(sourceNoteEntry({...customer,note:"รับ 1,100 ตัดต้น 500 (32/10)"}),null);
assert.equal(sourceNoteEntry({...customer,note:"รับ 1,100 ตัดต้น 500 (23/10)",dueDate:"",saleDate:""}),null);
assert.equal(sourceNoteEntry({...customer,note:"รับ 1,100 ตัดต้น 500 (23/10/2569)"}).dateTime,"23/10/2026");
const portal=readFileSync(new URL("../customer.html",import.meta.url),"utf8");
assert.match(portal,/x\.sourceNote&&x\.detail/);
assert.match(portal,/escapeHtml\(x\.detail\)/);
assert.match(portal,/รายการอนุมัติและบันทึกต้นทาง/);
const session=readFileSync(new URL("../lib/customerSessionApi.js",import.meta.url),"utf8");
assert.match(session,/mergeCustomerHistory\(approved,customer\)/);
assert.doesNotMatch(session,/appendRow|setValue|writePaymentCycle/);
console.log("PASS customer history: supplemental note 310-5, rent/principal split, same-day deduplication, source-only label, no payment writes");
