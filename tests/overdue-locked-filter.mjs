import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLockedCustomerStatus, visibleDueItems } from "../api/web/summary.js";

// Both Thai spellings, legacy label variants, and mixed statuses must stay off overdue.
for(const status of [
 "ล็อค", "ล็อก", "ล็อคแล้ว", "ล็อกแล้ว", "ล็อคเครื่อง", "ล็อกอยู่",
 "สถานะล็อค", "สถานะล็อก", "รอล็อค", "รอล็อก",
 "LOCK", "locked", "รอ LOCK", "ใช้งาน / ล็อค", "ค้าง,ล็อค"
])assert.equal(isLockedCustomerStatus(status),true, "must exclude "+status);
for(const status of [
 "ปกติ", "ใช้งาน", "ปลดล็อค", "ปลดล็อกแล้ว", "active", "", "ค้างชำระ"
])assert.equal(isLockedCustomerStatus(status),false, "must not hide "+status);
const records=[
 {queue:"310-13",name:"รายแรก",status:"ใช้งาน"},
 {queue:"310-12",name:"รายที่สอง",status:"ล็อค"},
 {queue:"610-3",name:"รายที่สาม",status:"ล็อกแล้ว"},
 {queue:"610-4",name:"รายที่สี่",status:"ใช้งาน"},
 {queue:"310-9",name:"รายที่ห้า",status:"รอล็อค"},
 {queue:"310-10",name:"",status:"ใช้งาน"}
];
const overdue=visibleDueItems("overdue", records);
assert.deepEqual(overdue.map(x=>x.queue),["310-13","610-4"]);
assert.equal(overdue.length,2,"overdue count must match visible rows");
assert.deepEqual(visibleDueItems("today", records).map(x=>x.queue),records.filter(x=>x.name).map(x=>x.queue),
 "only overdue should change, not unrelated summaries");
assert.equal(visibleDueItems("overdue",null).length,0);
const endpoint=readFileSync(new URL("../api/web/summary.js",import.meta.url),"utf8");
assert.match(endpoint,/const items = visibleDueItems\(mode,result\?\.items\)/);
assert.match(endpoint,/totalShown: mode === "overdue" \|\| mode === "locked" \? items.length/,
 "backend overdue total must be recalculated after locked rows are filtered");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.ok((html.match(/ไม่รวม ล็อค \/ รอล็อค/g)||[]).length===2,
 "both overdue card and customer panel explain status exclusions");
assert.match(endpoint,/const session = await currentOwnerSessionFromRequest\(req\)/,
 "owner authentication remains in place");
assert.doesNotMatch(endpoint,/setValues|appendRow|sendMessage|pushMessage|recordPayment/,
 "only read-only summary code may change");
console.log("PASS overdue status filter: locked and awaiting-lock customers excluded, other summaries unaffected");
