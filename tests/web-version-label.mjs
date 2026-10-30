import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const files=["index.html","customer.html"];
for(const file of files){
  const html=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  assert.match(html,/<div class="web-version" aria-label="เวอร์ชันเว็บ">Web v2026\.10\.30\.1<\/div>/);
  assert.match(html,/\.web-version\{position:fixed;right:9px;bottom:calc\(9px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(html,/font-size:10px/);
}
console.log("PASS admin and customer web both show small bottom-right version label");