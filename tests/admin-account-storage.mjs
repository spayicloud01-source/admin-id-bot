import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const data=new Map();
let privateOptions;
globalThis.__testEncryptedStore={
 crypto,
 get:async(path,options)=>{
  privateOptions=options;
  const x=data.get(path);if(!x)return null;
  return {blob:{etag:x.etag},stream:new ReadableStream({start(controller){controller.enqueue(x.bytes);controller.close();}})};
 },
 put:async(path,body,options)=>{
  const prev=data.get(path);
  if(prev&&!options.allowOverwrite)throw Error("record already exists");
  if(prev&&options.ifMatch!==prev.etag)throw Error("stale ETag");
  const etag=crypto.randomUUID();data.set(path,{bytes:Uint8Array.from(body),etag});
  return {etag};
 },
 list:async({prefix})=>({blobs:Array.from(data.keys()).filter(x=>x.startsWith(prefix)).map(pathname=>({pathname})),hasMore:false})
};
process.env.ADMIN_AUTH_ENCRYPTION_KEY="ab".repeat(32);
process.env.VERCEL_ENV="preview";
let src=readFileSync(new URL("../lib/adminAccountStore.js",import.meta.url),"utf8")
 .replace('import crypto from "node:crypto";','const crypto=globalThis.__testEncryptedStore.crypto;')
 .replace('import { get, put, list } from "@vercel/blob";',
   'const {get,put,list}=globalThis.__testEncryptedStore;');
assert.doesNotMatch(src,/^import\s/m);
const api=await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"));
const user={username:"staff-test",displayName:"สมชาย",lineUserId:"U-test",role:"พนักงาน",enabled:true,
 permissions:["customers"],passwordHash:"scrypt$HASH",version:"v1",updatedAt:"now"};
assert.equal(await api.getUser("staff-test"),null);
await api.saveUser(user,null);
const ciphertext=Array.from(data.values())[0].bytes;
assert.equal(Buffer.from(ciphertext).includes(Buffer.from("สมชาย")),false,"no plaintext name in Blob");
assert.equal(Buffer.from(ciphertext).includes(Buffer.from("scrypt")),false,"no plaintext password hash in Blob");
assert.equal((await api.getUser("staff-test")).record.displayName,"สมชาย");
assert.equal((await api.listUsers()).length,1);
const prev=await api.getUser("staff-test");
await api.saveUser({...user,enabled:false,version:"v2"},prev);
assert.equal((await api.getUser("staff-test")).record.enabled,false);
await assert.rejects(()=>api.saveUser(user,prev),"stale ETag must not overwrite newer account");
const good=process.env.ADMIN_AUTH_ENCRYPTION_KEY;
process.env.ADMIN_AUTH_ENCRYPTION_KEY="cd".repeat(32);
await assert.rejects(()=>api.getUser("staff-test"),"ciphertext cannot be decrypted without separate key");
process.env.ADMIN_AUTH_ENCRYPTION_KEY=good;
process.env.VERCEL_ENV="production";
await assert.rejects(()=>api.listUsers(),/Private authentication storage required/);
// With a dedicated private token configured, all account operations must target
// private storage and never reuse the default public Blob credentials.
process.env.ADMIN_AUTH_BLOB_READ_WRITE_TOKEN="preview-private-test-token";
assert.equal(await api.getUser("private-user"),null);
assert.equal(privateOptions.access,"private");
assert.equal(privateOptions.token,"preview-private-test-token");
console.log("PASS encrypted account storage, no plaintext credentials, conditional writes, key isolation and production guard");
