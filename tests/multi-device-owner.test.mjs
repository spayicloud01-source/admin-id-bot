import assert from "node:assert/strict";
import { createWebSession, verifyWebSession, sessionFromRequest } from "../lib/webAuth.js";
import handler from "../api/web/config.js";

// Simulates Chrome, an installed home-screen PWA, and another computer.
// Each has independent storage. Signing out one does not revoke the others.
const envKeys=["SHEETS_BRIDGE_SECRET","ADMIN_ID_PRIVATE_LINK_KEY","ADMIN_ID_PRIVATE_OWNER_LINE_ID","GOOGLE_APPS_SCRIPT_CUSTOMER_URL","GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET","GOOGLE_APPS_SCRIPT_NOTIFY_URL"];
const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const oldFetch=global.fetch, oldNow=Date.now;
const owner="U"+"c".repeat(32);
const secret="offline-private-link-secret-54-characters-and-no-live-data-1";
function response(){return{code:200,headers:{},body:null,status(n){this.code=n;return this},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},
  json(x){this.body=x;return this},send(x){this.body=x;return this}};}
try{
  process.env.SHEETS_BRIDGE_SECRET="offline-owner-session-signing-key";
  process.env.ADMIN_ID_PRIVATE_LINK_KEY=secret;
  process.env.ADMIN_ID_PRIVATE_OWNER_LINE_ID=owner;
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL="https://fake-backend.test/exec";
  process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET="mock-secret";
  process.env.GOOGLE_APPS_SCRIPT_NOTIFY_URL="https://fake-backend.test/notify";
  const users=[];
  let backendCalls=0;
  global.fetch=async (_url,opts)=>{
    const body=JSON.parse(opts.body);
    backendCalls++;
    assert.equal(body.lineUserId,owner);
    if(body.action==="checkAccess")return{ok:true,text:async()=>JSON.stringify({ok:true,allowed:true,role:"เจ้าของ"})};
    if(body.action==="listCustomerNotificationSheets")return{ok:true,text:async()=>JSON.stringify({ok:true,allowed:true,items:[]})};
    throw Error("Unexpected bridge action: "+body.action);
  };
  // Device 1: Chrome, device 2: installed PWA, device 3: Desktop Chrome
  for(let i=0;i<3;i++){
    Date.now=()=>1792332000000+i*1000;
    const r=response();
    await handler({method:"POST",body:{access:secret},query:{},headers:{}},r);
    assert.equal(r.code,200);
    assert.equal(verifyWebSession(r.body.token)?.sub,owner);
    users.push({token:r.body.token,loggedIn:true});
  }
  assert.equal(new Set(users.map(x=>x.token)).size,3,"distinct sessions for independent devices");
  const results=await Promise.all(users.map(async u=>{
    const r=response();
    await handler({method:"GET",query:{},headers:{authorization:"Bearer "+u.token}},r);
    return r;
  }));
  results.forEach(r=>assert.equal(r.code,200,"parallel sessions remain valid "+JSON.stringify(r.body)));

  // Browser sign-out is local: removes this device's token only
  users[0].token="";
  users[0].loggedIn=false;
  assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+users[0].token}}),null);
  assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+users[1].token}})?.sub,owner);
  assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+users[2].token}})?.sub,owner);
  Date.now=()=>1792332000000+30*24*3600*1000;
  assert.equal(verifyWebSession(users[1].token)?.sub,owner,"PWA still works after 30 days");
  assert.equal(verifyWebSession(users[2].token)?.sub,owner,"desktop still works after 30 days");
  assert.ok(backendCalls>=3,"all private link access was owner checked");
  console.log("multi-device-owner: Chrome + PWA + Desktop concurrent; 16+ assertions passed (offline mocks)");
}finally{
  global.fetch=oldFetch;Date.now=oldNow;
  for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
}
