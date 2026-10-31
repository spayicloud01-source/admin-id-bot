import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const src=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(src,"admin inline script exists");
new Function(src);
const a=src.indexOf("  var OWNER_TOKEN_KEY=");
const b=src.indexOf("  function authHeaders()",a);
assert.ok(a>0&&b>a);
const helper=src.slice(a,b);
let session=new Map(),local=new Map(),visits=[];
const storage=data=>({
  getItem:k=>data.get(k)||null,
  setItem:(k,v)=>data.set(k,String(v)),
  removeItem:k=>data.delete(k),
});
const ctx=vm.createContext({
  TOKEN:"",PASSWORD_LOGIN:false,
  sessionStorage:storage(session),localStorage:storage(local),
  location:{href:"https://admin-id-bot.vercel.app/?token=signed-owner-token&view=review"},
  history:{replaceState:(...args)=>visits.push(args)},
  Date,URL,JSON,Number,
});
vm.runInContext(helper,ctx);
ctx.TOKEN="signed-owner-token";
ctx.rememberVerifiedOwner();
assert.equal(session.get("adminIdWebToken"),"signed-owner-token");
assert.equal(JSON.parse(local.get("adminIdVerifiedOwner")).token,"signed-owner-token");
assert.equal(visits.at(-1)[2],"/?view=review","token removed after verified");
session.clear();
assert.equal(ctx.restoreOwnerToken(),"signed-owner-token","new tab restores prior valid owner token");
// Password sessions remain session-only; never write a bearer token to localStorage.
ctx.PASSWORD_LOGIN=true;
ctx.TOKEN="password-session-token";
ctx.rememberVerifiedOwner();
assert.equal(session.get("adminIdWebToken"),"password-session-token");
assert.equal(local.has("adminIdVerifiedOwner"),false);
assert.equal(session.get("adminIdWebPasswordMode"),"yes");
ctx.forgetOwnerToken();
assert.equal(local.has("adminIdVerifiedOwner"),false);
assert.equal(session.has("adminIdWebToken"),false);
assert.equal(ctx.TOKEN,"");
local.set("adminIdVerifiedOwner",JSON.stringify({token:"stale",savedAt:Date.now()-31*86400000}));
assert.equal(ctx.restoreOwnerToken(),"","old saved auth expires after 30 days");
assert.equal(local.has("adminIdVerifiedOwner"),false);
const badStorage=vm.createContext({
 TOKEN:"",PASSWORD_LOGIN:false,sessionStorage:{getItem(){throw Error("blocked")},setItem(){throw Error("blocked")},removeItem(){}},
 localStorage:{getItem(){throw Error("blocked")},setItem(){throw Error("blocked")},removeItem(){}},
 location:{href:"https://admin-id-bot.vercel.app/?token=signed"},history:{replaceState(){}},Date,URL,JSON,Number,
});
vm.runInContext(helper,badStorage);
const start=src.indexOf("  try{\n    var qs=new URLSearchParams(location.search)");
const end=src.indexOf("\n  byId(\"passwordLoginForm\").addEventListener",start);
assert.ok(start>=0&&end>start,"startup token bootstrap found");
badStorage.URLSearchParams=URLSearchParams;
badStorage.location.search="?token=signed";
vm.runInContext(src.slice(start,end),badStorage);
assert.equal(badStorage.TOKEN,"signed","LINE link works even when browser storage is disabled");
assert.match(src,/rememberVerifiedOwner\(\);\s*ITEMS=x\.j\.sheets/,"persist only after verified config");
assert.match(src,/if\(x\.r\.status===401\|\|x\.r\.status===403\)\{\s*forgetOwnerToken\(\)/,"revoked login clears persistent storage");
console.log("PASS admin owner login survives new tabs, supports disabled storage, clears expired/invalid credentials and strips signed URL token");
