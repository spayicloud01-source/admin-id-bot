import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const panel=html.match(/<section class="source"[^>]*>/)?.[0]||"";
assert.match(panel,/\bhidden\b/,"unused source picker must be visually hidden");
assert.match(panel,/aria-hidden="true"/);
assert.match(html,/\.source\[hidden\]\s*\{display:none!important\}/,"CSS must override .source display grid");
for(const id of ["source","sheet","use","selectAll","clearAll","selectedTargets"]) {
  assert.match(html,new RegExp('id="'+id+'"'),"keep legacy element "+id+" used by existing scripts");
}
assert.match(html,/id="recordPayment"/,"retain payment action");
assert.match(html,/data-view="customerTools"/,"retain customer tools");
assert.match(html,/data-view="activityTools"/,"retain visitor tracking");
assert.match(html,/data-view="reviewTools"/,"retain payment review tools");
console.log("PASS unused source selector hidden without removing existing app elements");
