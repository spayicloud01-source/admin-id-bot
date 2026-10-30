import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hashOwnerPassword,verifyOwnerPassword,passwordMeetsPolicy,validateUsername} from "../lib/adminPasswordAuth.js";
import {createWebSession,createStaffWebSession,staffSessionFromRequest,sessionFromRequest} from "../lib/webAuth.js";
process.env.SHEETS_BRIDGE_SECRET="test-only-auth-unit-secret";
process.env.ADMIN_WEB_LOGIN_USERNAME="owner-preview";
process.env.ADMIN_WEB_LOGIN_PASSWORD_HASH=await hashOwnerPassword("OwnerOriginal123456");
process.env.OWNER_LINE_USER_ID="U-unique-owner";
const users=new Map();
let override=null,staffActive=true;
const store={
 MAX_USERS:40, getOwnerOverride:async()=>override,
 updateOwnerOverride:async(record,prior)=>{assert.equal(prior,override);override={record,etag:"owner"};return {etag:"owner"};},
 getUser:async username=>users.get(username)||null,
 listUsers:async()=>Array.from(users.values()).map(v=>v.record),
 saveUser:async(record,prior)=>{
   const current=users.get(record.username)||null;
   assert.equal(prior,current);
   users.set(record.username,{record:{...record},etag:String(users.size+1)});
 },
};
const bridge=async payload=>{
 if(payload.action==="checkAccess")return payload.lineUserId==="U-unique-owner"?
   {allowed:true,role:"เจ้าของ",staffName:"owner"}:
   {allowed:staffActive,role:"พนักงาน",staffName:"employee"};
 return {ok:true,items:[{queue:"310-4",name:"สมชาย ทดสอบ"}]};
};
const envExports={hashOwnerPassword,verifyOwnerPassword,passwordMeetsPolicy,validateUsername};
const realAuth={sessionFromRequest,createWebSession,createStaffWebSession,staffSessionFromRequest};
async function compile(filename,replacements){
 let code=readFileSync(new URL("../lib/"+filename,import.meta.url),"utf8");
 for(const [from,to] of replacements){
   assert.ok(code.includes(from),"import expected for "+filename+": "+from);
   code=code.replace(from,to);
 }
 assert.doesNotMatch(code,/^import\s/m,"all imports must be mocked");
 const result=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
 return result.default;
}
globalThis.__authTest={bridge,store,envExports,realAuth};
const api=await compile("adminAccountsApi.js",[
 ['import crypto from "node:crypto";','const crypto=globalThis.__authTest.crypto;'],
 ['import {callSheetsBridge} from "./sheetsBridge.js";','const callSheetsBridge=globalThis.__authTest.bridge;'],
 ['import {sessionFromRequest,createWebSession} from "./webAuth.js";','const {sessionFromRequest,createWebSession}=globalThis.__authTest.realAuth;'],
 ['import {hashOwnerPassword,passwordMeetsPolicy,validateUsername,verifyOwnerPassword} from "./adminPasswordAuth.js";',
  'const {hashOwnerPassword,passwordMeetsPolicy,validateUsername,verifyOwnerPassword}=globalThis.__authTest.envExports;'],
 ['import {getOwnerOverride,updateOwnerOverride,getUser,saveUser,listUsers,MAX_USERS} from "./adminAccountStore.js";',
  'const {getOwnerOverride,updateOwnerOverride,getUser,saveUser,listUsers,MAX_USERS}=globalThis.__authTest.store;'],
]);
const staff=await compile("adminStaffPortalApi.js",[
 ['import {staffSessionFromRequest} from "./webAuth.js";','const {staffSessionFromRequest}=globalThis.__authTest.realAuth;'],
 ['import {getUser} from "./adminAccountStore.js";','const {getUser}=globalThis.__authTest.store;'],
 ['import {callSheetsBridge} from "./sheetsBridge.js";','const callSheetsBridge=globalThis.__authTest.bridge;'],
]);
const crypto=await import("node:crypto");
globalThis.__authTest.crypto=crypto.default;
function response(){return {headers:{},statusCode:null,body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;}};}
const ownerToken=createWebSession({lineUserId:"U-unique-owner",role:"เจ้าของ",staffName:"owner"});
async function call(handler,token,method,body={},headerOrigin="https://admin-id-bot.vercel.app"){
 const req={method,headers:{authorization:"Bearer "+token,host:"admin-id-bot.vercel.app",origin:headerOrigin,"content-type":"application/json"},body};
 const res=response();await handler(req,res);return res;
}
const first=await call(api,ownerToken,"GET");
assert.equal(first.statusCode,200);
assert.deepEqual(first.body.users,[]);
const created=await call(api,ownerToken,"POST",{
 action:"create",username:"staff-lop",displayName:"มานิดา",role:"พนักงาน",
 lineUserId:"Ustaff-4567",permissions:["customers","history","review","payment"],
});
assert.equal(created.statusCode,200);
assert.equal(created.body.user.username,"staff-lop");
assert.deepEqual(created.body.user.permissions,["customers","history"]);
assert.equal(passwordMeetsPolicy(created.body.temporaryPassword),true);
assert.equal(Object.hasOwn(created.body.user,"passwordHash"),false);
const staffToken=createStaffWebSession({username:"staff-lop",lineUserId:"Ustaff-4567",
 role:"พนักงาน",version:users.get("staff-lop").record.version,displayName:"มานิดา"});
assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+staffToken}}),null,
 "owner routes must reject staff token");
const whoami=await call(staff,staffToken,"POST",{action:"whoami"});
assert.equal(whoami.statusCode,200);
assert.equal(whoami.body.profile.role,"พนักงาน");
assert.equal((await call(staff,staffToken,"POST",{action:"getCustomerInfo",query:"310-4"})).statusCode,200);
assert.equal((await call(staff,staffToken,"POST",{action:"resolveReviewQueue",query:"2",decision:"ผ่าน"})).statusCode,403);
assert.equal((await call(staff,staffToken,"POST",{action:"setStaffPermission",query:"2"})).statusCode,403);
const stopped=await call(api,ownerToken,"POST",{action:"toggle",username:"staff-lop",enabled:false});
assert.equal(stopped.statusCode,200);
assert.equal((await call(staff,staffToken,"POST",{action:"whoami"})).statusCode,401,
 "disabled accounts must lose access immediately");
const current=await call(api,ownerToken,"POST",{action:"changeOwnerPassword",
 currentPassword:"OwnerOriginal123456",newPassword:"ChangedOwner123456!"});
assert.equal(current.statusCode,200);
assert.equal(override.record.passwordHash.startsWith("scrypt$"),true);
assert.equal(await verifyOwnerPassword("owner-preview","OwnerOriginal123456",{...process.env,ADMIN_WEB_LOGIN_PASSWORD_HASH:override.record.passwordHash}),false);
assert.equal(await verifyOwnerPassword("owner-preview","ChangedOwner123456!",{...process.env,ADMIN_WEB_LOGIN_PASSWORD_HASH:override.record.passwordHash}),true);
assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+current.body.token}}).auth,"password");
assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+current.body.token}}).pv,override.record.version);
assert.equal((await call(api,"bad","GET")).statusCode,401);
assert.equal((await call(api,staffToken,"GET")).statusCode,401);
console.log("PASS owner password change; create staff; permission reduction; owner route isolation; staff revocation");
