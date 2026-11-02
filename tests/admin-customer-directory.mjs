import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../lib/adminCustomerDirectoryApi.js";

const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const match=index.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,"owner dashboard inline script");
new Function(match[1]); // does not execute the browser code
for(const literal of [
 'data-view="customerDirectory"','id="customerDirectory"','id="dirDetailModal"',
 'id="dirSource"','id="dirMode"','id="dirDue"','id="dirSearch"',
 'id="dirAllCount"','id="dirMatchCount"','id="dirRows"'
])assert.ok(index.includes(literal),literal);
assert.match(index,/function openCustomerDetail\(/);
assert.match(index,/function loadDirectory\(/);
assert.match(index,/data-dir-source=/,"inline due rows clickable");
assert.match(index,/document\.createElement\("button"\)/,"directory button rendered safely");
assert.match(index,/escapeHtml\(customer\.name/,"customer detail values are escaped");
const routing=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
assert.equal(routing.rewrites.find(x=>x.source==="/api/web/customer-directory")?.destination,"/api/web/send?adminAuth=customer-directory");
const router=readFileSync(new URL("../api/web/send.js",import.meta.url),"utf8");
assert.match(router,/adminCustomerDirectoryHandler/);
const api=readFileSync(new URL("../lib/adminCustomerDirectoryApi.js",import.meta.url),"utf8");
assert.match(api,/validOwnerSession\(req\)/);
assert.match(api,/safeCustomerView\(customer\)/);
assert.match(api,/mergeCustomerHistory\(approved,customer\)/);
assert.match(api,/action:"listAllCustomers"/,"must not depend on LINE binding roster");
assert.match(api,/partial:batch\.errors\.length>0/,"must flag incomplete roster pages");
assert.match(index,/var seen=new Set\(\),warnings=\[\],page=0/,"must iterate every roster page");
assert.match(index,/x\.statusClass!==byId\("dirMode"\)\.value/,"status filter client-side");
assert.doesNotMatch(api,/appendRow|setValue|sendNotification|pushMessages|resolveReviewQueue|writePaymentCycle/);
function res(){const result={headers:{},status:200};return {result,setHeader(k,v){result.headers[k]=v;return this;},status(v){result.status=v;return this;},json(v){result.payload=v;return this;}}}
let r=res();await handler({method:"POST",headers:{}},r);assert.equal(r.result.status,405);
r=res();await handler({method:"GET",headers:{},query:{mode:"all"}},r);assert.equal(r.result.status,401);
assert.equal(r.result.headers["Cache-Control"],"private, no-store");
console.log("PASS owner customer roster: filters, safe detail, same-owner authorization and no payment writes");
