import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script,"owner dashboard has an inline script");
new Function(script[1]); // ensure browser JavaScript parses without executing network or DOM
for(const id of ["todayInlineList","upcomingInlineList","overdueInlineList",
                  "todayInlineCount","upcomingInlineCount","overdueInlineCount"]){
  assert.ok(html.includes('id="'+id+'"'),"dashboard has "+id);
}
assert.match(html,/<h3>ค้างชำระ<\/h3>/,"overdue is a dedicated dashboard panel");
assert.match(html,/\.dueoverviewbox\.overdue-inline\{grid-column:1\/-1\}/,
  "late-list spans full desktop width rather than shrinking the due rows");
assert.match(html,/\.overdue-inline \.duetable\{max-height:430px;overflow-y:auto;/,
  "overdue records remain scrollable on mobile and desktop");
const overview=script[1].slice(script[1].indexOf("function renderInlineDue("),script[1].indexOf("function recordPayment("));
assert.match(overview,/overdue:\["overdueInlineList","overdueInlineCount"\]/,
  "overdue is wired to its own list and count");
assert.match(overview,/mode==="overdue"\?items\.length:Math\.min\(items\.length,8\)/,
  "all overdue records returned by the backend appear, no silent 8-record truncation");
assert.match(overview,/item\.daysDelta/,"late days are shown");
assert.match(overview,/data-dir-source/);
assert.match(overview,/data-dir-sheet/);
assert.match(overview,/data-dir-queue/);
assert.match(overview,/\{mode:"overdue",id:"overdueCount"\}/,
  "the page loads overdue asynchronously after existing today/upcoming requests");
assert.match(overview,/setTimeout\(function\(\)\{next\(i\+1\);\},500\)/,
  "requests remain sequential instead of spiking multiple GAS calls");
assert.match(overview,/โหลดรายชื่อค้างชำระไม่สำเร็จ/,"errors are visible, not left in infinite spinner");
assert.match(html,/\["dueList","todayInlineList","upcomingInlineList","overdueInlineList"\]/,
  "overdue customer buttons open the existing owner-only detail modal");
const readActions=["listDueCustomers"];
const api=readFileSync(new URL("../api/web/summary.js",import.meta.url),"utf8");
for(const a of readActions) assert.ok(api.includes('action: "'+a+'"'));
assert.match(api,/\["today","upcoming","overdue"/,"existing summary route allows overdue");
assert.doesNotMatch(overview,/resolveReviewQueue|markReminderSent|recordPayment\(/,
  "inline due rendering never performs a write");
console.log("PASS overdue dashboard: full visible names, due dates, days late, click-through and read-only sequential summary");
