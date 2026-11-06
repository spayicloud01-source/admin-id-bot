import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../customer.html",import.meta.url),"utf8");
const input=html.match(/<input id="slip"[^>]*>/);
assert.ok(input,"customer payment has a file picker");
assert.match(input[0],/type="file"/);
assert.match(input[0],/accept="image\/\*,\.heic,\.heif"/);
assert.doesNotMatch(input[0],/\bcapture\s*=/i,
  "do not force rear camera; let iPhone choose saved screenshot/Photos/Files");
assert.match(html, /เลือกจากรูปภาพ\/ไฟล์ในเครื่องได้/);
const script=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script);
new Function(script[1]); // parse actual customer JavaScript
assert.match(html,/async function fileImage\(file\)/);
assert.match(html,/catch\(_error\)\{\/\* fallback to Image element \*\//,
  "HEIC decoder failure should fall back to HTMLImageElement");
assert.match(html,/if\(file.size>20\*1024\*1024\)/,
  "large original iOS photographs may be compressed rather than rejected at 8MB");
assert.match(html,/if\(slipProcessing\)/,
  "customer cannot submit before selecting/processing file finishes");
assert.match(html,/e\.target\.files/);
assert.match(html,/current!==slipSelection/,
  "an old slow image decode must not replace the newest selected slip");
assert.match(html,/2\.5\*1024\*1024/,
  "compressed image must fit under backend 3MB binary limit");
assert.match(html,/api\('\/api\/customer\/payment'/,
  "keep existing authenticated upload endpoint");
assert.match(html,/data\.message\+' กรุณาอย่าชำระหรือส่งซ้ำ'/,
  "retain queue-for-review success confirmation rather than pretending immediate payment");

const source=script[1];
const from=source.indexOf('async function fileImage(file)');
const to=source.indexOf("    $('slip').onchange=",from);
assert.ok(from>=0&&to>from);
const compression=source.slice(from,to);
const makeCanvas=()=>({
 width:0,height:0,
 getContext(){return {drawImage(){}}},
 toDataURL(){return "data:image/jpeg;base64,"+"a".repeat(128000);}
});
const img={width:4000,height:3000,close(){}};
const env={
 window:{createImageBitmap:async()=>img},URL,Image:function(){},
 document:{createElement(kind){assert.equal(kind,"canvas");return makeCanvas()}},
 Error,Math,Promise
};
vm.runInNewContext(compression+"\nthis.compress=compress;",env);
const png={size:11*1024*1024,type:"image/heic"};
const output=await env.compress(png);
assert.ok(output.startsWith("data:image/jpeg;base64,"));
await assert.rejects(env.compress({size:21*1024*1024}),/20 MB/);

// iOS createImageBitmap can reject HEIC even when the <img> element loads it.
let revocations=0;
const fallback={
 window:{createImageBitmap:async()=>{throw Error("HEIC unsupported by createImageBitmap")}},
 URL:{createObjectURL(){return "blob:stub"},revokeObjectURL(){revocations++}},
 Image:class{
   set src(_value){this.width=1000;this.height=2000;Promise.resolve().then(()=>this.onload())}
 },
 document:{createElement(){return makeCanvas()}},
 Error,Math,Promise
};
vm.runInNewContext(compression+"\nthis.compress=compress;",fallback);
const fallbackOutput=await fallback.compress({size:16000,type:"image/heic"});
assert.ok(fallbackOutput.startsWith("data:image/jpeg;base64,"));
assert.equal(revocations,1,"temporary image object URL is released");

const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));
const security=vercel.headers?.[0]?.headers?.find(h=>h.key==="Content-Security-Policy")?.value||"";
assert.match(security,/img-src 'self' data: blob: https:/,
  "iOS fallback previews with object URLs must be allowed by image CSP");
assert.match(security,/script-src 'self' 'unsafe-inline'/,
  "CSP script policy must remain unchanged");
assert.match(security,/connect-src 'self'/,
  "CSP network policy must remain unchanged");
const server=readFileSync(new URL("../lib/customerPaymentApi.js",import.meta.url),"utf8");
assert.match(server,/action: "queuePayment"/);
assert.match(server,/action: "queueClose"/);
assert.match(server,/await put\(pathname, slip.buffer/);
assert.match(server,/const result = await callSheetsBridge\(payload\)/);
console.log("PASS customer slip picker: saved Photos/Files, HEIC decoder fallback, 11 MB input compression and existing review-only submission");
