import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import handler from "../api/web/config.js";

const keys=["SHEETS_BRIDGE_SECRET","ADMIN_ID_PRIVATE_LINK_KEY","ADMIN_ID_PRIVATE_OWNER_LINE_ID",
"GOOGLE_APPS_SCRIPT_CUSTOMER_URL","GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET","WEB_SESSION_NOT_BEFORE"];
const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const oldFetch=global.fetch;
const ownerId="U"+"a".repeat(32),privateKey="mock-private-home-screen-install-key-55-characters-XYZ123";
function res(){return {code:200,headers:{},body:null,status(n){this.code=n;return this},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},
  json(x){this.body=x;return this},send(x){this.body=x;return this}};}
try{
  process.env.SHEETS_BRIDGE_SECRET="test-only-bridge-signature";
  process.env.ADMIN_ID_PRIVATE_LINK_KEY=privateKey;
  process.env.ADMIN_ID_PRIVATE_OWNER_LINE_ID=ownerId;
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL="https://mock-gas.example.test/exec";
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET="offline-test-secret";
  delete process.env.WEB_SESSION_NOT_BEFORE;
  let calls=0;
  global.fetch=async (_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.equal(body.action,"checkAccess");
    assert.equal(body.lineUserId,ownerId);
    return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,allowed:true,role:"เจ้าของ",staffName:"เจ้าของ"})};
  };
  let x=res();
  await handler({method:"GET",query:{pwa_manifest:"1"},headers:{}},x);
  assert.equal(x.code,403,"no public private manifest");

  x=res();
  await handler({method:"POST",body:{access:privateKey},headers:{}},x);
  assert.equal(x.code,200,"private owner link redeem");
  assert.equal(x.body?.ok,true);
  const cookie=x.headers["set-cookie"];
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);

  x=res();
  await handler({method:"GET",query:{pwa_manifest:"1"},headers:{cookie:cookie.split(";")[0]}},x);
  assert.equal(x.code,200,"private manifest available to signed owner only");
  assert.match(x.headers["content-type"],/manifest\+json/);
  assert.match(x.headers["cache-control"],/no-store/);
  const manifest=JSON.parse(x.body);
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.scope,"/");
  assert.equal(manifest.start_url,"/?app=1#access="+encodeURIComponent(privateKey),"installed icon contains one-tap entry URL");
  assert.ok(manifest.icons.some(i=>i.sizes==="192x192"));
  assert.ok(manifest.icons.some(i=>i.sizes==="512x512"));
  for(const size of [192,512]){
    x=res();
    await handler({method:"GET",query:{icon:String(size)},headers:{}},x);
    assert.equal(x.code,200);
    assert.equal(x.headers["content-type"],"image/png");
    const image=x.body;
    assert.equal(image.slice(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(image.readUInt32BE(16),size);
    assert.equal(image.readUInt32BE(20),size);
    const length=image.readUInt32BE(51);
    const raw=inflateSync(image.subarray(59,59+length));
    assert.equal(raw.length,size*(1+Math.ceil(size/8)),"icon PNG inflation validates");
  }
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/adminPwaManifest/);
  assert.match(html,/beforeinstallprompt/);
  assert.match(html,/serviceWorker\.register\("\/sw\.js"\)/);
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.ok(!sw.includes("caches.open"),"service worker does not cache private data");
  assert.equal(calls,1,"manifest and icons do not hit GAS again");
  console.log("pwa-home-screen: 26+ assertions passed (mock GAS, no real messages or customer writes)");
}finally{
  global.fetch=oldFetch;
  for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
}
