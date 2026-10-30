import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hashOwnerPassword,verifyOwnerPassword,configuredOwnerCredentials} from "../lib/adminPasswordAuth.js";
import {createWebSession,verifyWebSession} from "../lib/webAuth.js";

process.env.SHEETS_BRIDGE_SECRET="password-only-test-session-key";
process.env.ADMIN_WEB_LOGIN_USERNAME="owner-preview";
process.env.ADMIN_WEB_LOGIN_PASSWORD_HASH=await hashOwnerPassword("SecureTestPreview123456",Buffer.from("1234567890abcdef1234567890abcdef","hex"));
process.env.OWNER_LINE_USER_ID="U-test-owner";
assert.equal(configuredOwnerCredentials(),true);
assert.equal(await verifyOwnerPassword("owner-preview","SecureTestPreview123456"),true);
assert.equal(await verifyOwnerPassword("owner-preview","SecureTestPreview123457"),false);
assert.equal(await verifyOwnerPassword("another-user","SecureTestPreview123456"),false);
assert.equal(await verifyOwnerPassword("owner-preview",""),false);
assert.equal(configuredOwnerCredentials({...process.env,ADMIN_WEB_LOGIN_PASSWORD_HASH:"plaintext"}),false);

let staffResult={allowed:true,role:"เจ้าของ",staffName:"Test Owner"};
let checked=[];
globalThis.__mockAdminBridge=async payload=>{checked.push(payload);return staffResult;};
globalThis.__mockAdminCreateSession=createWebSession;
globalThis.__mockAdminCredentials={configuredOwnerCredentials,verifyOwnerPassword};
let code=readFileSync(new URL("../api/web/password-login.js",import.meta.url),"utf8")
  .replace('import { callSheetsBridge } from "../../lib/sheetsBridge.js";',
    'const callSheetsBridge=globalThis.__mockAdminBridge;')
  .replace('import { createWebSession } from "../../lib/webAuth.js";',
    'const createWebSession=globalThis.__mockAdminCreateSession;')
  .replace('import { configuredOwnerCredentials, verifyOwnerPassword } from "../../lib/adminPasswordAuth.js";',
    'const {configuredOwnerCredentials,verifyOwnerPassword}=globalThis.__mockAdminCredentials;');
const {default:handler}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
function makeRes(){
 return {code:0,headers:{},body:null,
  setHeader(k,v){this.headers[k]=v;},
  status(c){this.code=c;return this;},
  json(v){this.body=v;return this;},
 };
}
let serial=1;
async function hit({username="owner-preview",password="SecureTestPreview123456",method="POST",ip="",origin="https://admin-id-bot.vercel.app",site="same-origin",contentType="application/json"}={}){
 const req={method,headers:{
  host:"admin-id-bot.vercel.app",origin,"sec-fetch-site":site,
  "content-type":contentType,"x-vercel-forwarded-for":ip||"203.0.113."+serial++,
 },body:{username,password}};
 const res=makeRes(); await handler(req,res);return res;
}
const ok=await hit();
assert.equal(ok.code,200);
assert.equal(ok.body.ok,true);
assert.equal(typeof ok.body.token,"string");
assert.equal(ok.body.expiresInSeconds,43200);
const verified=verifyWebSession(ok.body.token);
assert.equal(verified.sub,"U-test-owner");
assert.equal(verified.role,"เจ้าของ");
assert.equal(verified.auth,"password");
assert.ok(verified.exp>verified.iat);
const originalNow=Date.now;
Date.now=()=>1000*(verified.exp+1);
assert.equal(verifyWebSession(ok.body.token),null,"password token expires after 12h");
Date.now=originalNow;
assert.equal(checked.at(-1).action,"checkAccess");
assert.equal(checked.at(-1).lineUserId,"U-test-owner");
assert.equal(checked.at(-1).permission,"จัดการเจ้าหน้าที่");
assert.equal(checked.at(-1).allowSystemControl,true);
const invalid=await hit({password:"IncorrectTestPassword123"});
assert.equal(invalid.code,401);
assert.equal(Object.hasOwn(invalid.body,"token"),false);
const another=await hit({username:"random-user"});
assert.equal(another.code,401);
assert.equal(another.body.error,invalid.body.error,"no username enumeration");
assert.equal((await hit({origin:"https://evil.example",password:"SecureTestPreview123456"})).code,403);
assert.equal((await hit({site:"cross-site"})).code,403);
assert.equal((await hit({method:"GET"})).code,405);
assert.equal((await hit({contentType:"text/plain"})).code,415);
staffResult={allowed:true,role:"พนักงาน",staffName:"Someone Else"};
const notOwner=await hit();assert.equal(notOwner.code,403);
staffResult={allowed:true,role:"เจ้าของ"};
let previous=checked.length;
for(let i=0;i<6;i++)assert.equal((await hit({ip:"192.0.2.200",password:"IncorrectTestPassword123"})).code,401);
assert.equal((await hit({ip:"192.0.2.200"})).code,429);
assert.equal(checked.length,previous,"failed password and rate-limited attempts never query owner GAS");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(html,/id="passwordLoginForm"/);
assert.match(html,/autocomplete="username"/);
assert.match(html,/autocomplete="current-password"/);
assert.match(html,/fetch\("\/api\/web\/password-login"/);
assert.match(html,/if\(PASSWORD_LOGIN\)/);
assert.match(html,/sessionStorage\.setItem\("adminIdWebPasswordMode","yes"\)/);
console.log("PASS password login: scrypt hash, 12h expiry, role authorization, generic failures, rate-limit, origin/CORS checks and login form");
