import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script,"has dashboard inline JavaScript");
new Function(script[1]); // Compile without invoking live APIs or mutating the app.

const menu=["overview","customerDirectory","notify","customerTools",
  "reviewTools","staffTools","activityTools","system"];
const navStart=html.indexOf('<nav class="tabs dashboard-tabs"');
const navEnd=html.indexOf("</nav>",navStart);
const cardStart=html.indexOf('<section class="cards">',navStart);
const overviewStart=html.indexOf('<div id="overview" class="view active">',navStart);
const dueStart=html.indexOf('<section class="dueoverview">',overviewStart);
const panelStart=html.indexOf('<section id="mainContentPanel" class="panel hidden">');
assert.ok(navStart>0 && navStart<navEnd && navEnd<overviewStart && overviewStart<cardStart &&
  cardStart<dueStart && dueStart<panelStart,"navigation is on top; both KPI cards and due names are under overview");
const nav=html.slice(navStart,navEnd);
for(const id of menu){
  assert.equal((nav.match(new RegExp('data-view="'+id+'"','g'))||[]).length,1,
    "each top navigation target appears exactly once: "+id);
  assert.ok(html.includes('id="'+id+'"'),"missing tab view "+id);
}
assert.match(nav,/<button class="tab active" type="button" data-view="overview" aria-current="page">ภาพรวม<\/button>/);
assert.doesNotMatch(nav,/ภาพรวมชีต/,"obsolete sheet summary is not a navigation tab");
assert.match(html,/<div id="customers" hidden aria-hidden="true">/,
  "preserve legacy sheet DOM used by selection logic but never show it");
assert.ok(!html.includes('id="customers" class="view active"'));
assert.match(html,/#mainContentPanel\.hidden\{display:none!important\}/);
assert.match(html,/\.dashboard-tabs\{position:sticky;top:72px;/,
  "top navigation is sticky on desktop");
assert.match(html,/@media\(max-width:760px\)\{\.dashboard-tabs\{top:64px;/,
  "top navigation is sticky on mobile");
for(const x of ["cardCustomers","cardOverdue","cardLocked","todayInlineList","upcomingInlineList","overdueInlineList"]) {
  assert.ok(html.includes('id="'+x+'"'),"existing overview contents preserved: "+x);
}
const navHandler=script[1].slice(script[1].indexOf('var tabs=document.querySelectorAll(".dashboard-tabs .tab")'),script[1].indexOf('byId("cardCustomers").onclick='));
assert.match(navHandler,/byId\("mainContentPanel"\)\.classList\.toggle\("hidden",viewId==="overview"\)/);
assert.match(navHandler,/target\.classList\.add\("active"\)/);
assert.match(navHandler,/if\(viewId==="customerDirectory"&&!DIR_LOADED\)loadDirectory\(\)/);
assert.match(navHandler,/if\(viewId==="activityTools"\)loadCustomerActivity\(\)/);
assert.match(navHandler,/if\(viewId==="reviewTools"\)byId\("refreshReview"\)\.click\(\)/);
assert.doesNotMatch(navHandler,/fetch\(.*?POST|recordPayment\(/,
  "navigation must not perform a payment or notify action");
console.log("PASS dashboard navigation: ภาพรวม shows existing KPIs and due names; all tabs at top, mobile sticky, no data writes");
