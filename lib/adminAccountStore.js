import crypto from "node:crypto";
import { get, put, list } from "@vercel/blob";

// Preview namespace is strictly isolated from customer slips, images and Production.
// The connected default store is public. Every account record is AES-256-GCM
// encrypted, with an independent Preview-only key; no plaintext user data or
// password hashes are written to Blob.
const PREFIX = "admin-id/preview-user-v1/";
const MAX_USERS = 40;
function key(){
  const k=process.env.ADMIN_AUTH_ENCRYPTION_KEY||"";
  if(process.env.VERCEL_ENV==="production") throw new Error("Preview-only account store");
  if(!/^[a-f0-9]{64}$/.test(k))throw new Error("Preview account encryption is not configured");
  return Buffer.from(k,"hex");
}
export function usernameKey(username){
  return crypto.createHash("sha256").update(String(username).trim().toLowerCase()).digest("hex");
}
const accountPath=username=>PREFIX+"u-"+usernameKey(username)+".bin";
const ownerPath=PREFIX+"owner.bin";
function encrypt(json,pathname){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  cipher.setAAD(Buffer.from(pathname));
  const payload=Buffer.concat([cipher.update(JSON.stringify(json),"utf8"),cipher.final()]);
  return Buffer.concat([Buffer.from("AID1"),iv,cipher.getAuthTag(),payload]);
}
function decrypt(bytes,pathname){
  const input=Buffer.from(bytes);
  if(input.length<33 || input.subarray(0,4).toString()!=="AID1")throw new Error("Invalid account record");
  const dec=crypto.createDecipheriv("aes-256-gcm",key(),input.subarray(4,16));
  dec.setAAD(Buffer.from(pathname));
  dec.setAuthTag(input.subarray(16,32));
  return JSON.parse(Buffer.concat([dec.update(input.subarray(32)),dec.final()]).toString("utf8"));
}
async function blobRead(path){
  key();
  // useCache:false reads through to origin immediately after a password change.
  const got=await get(path,{access:"public",useCache:false});
  if(!got)return null;
  const response=got.stream;
  const bytes=Buffer.from(await new Response(response).arrayBuffer());
  if(bytes.length>120000)throw new Error("Oversized account record");
  return {record:decrypt(bytes,path),etag:got.blob.etag};
}
async function blobWrite(path,record,old){
  key();
  const options={access:"public",addRandomSuffix:false,allowOverwrite:!!old,
    contentType:"application/octet-stream",cacheControlMaxAge:60};
  if(old)options.ifMatch=old.etag;
  return put(path,encrypt(record,path),options);
}
export async function getOwnerOverride(){return blobRead(ownerPath);}
export async function updateOwnerOverride(record,previous){return blobWrite(ownerPath,record,previous);}
export async function getUser(username){return blobRead(accountPath(username));}
export async function saveUser(record,old){
  const username=String(record.username||"").toLowerCase();
  if(!/^[a-z0-9._-]{3,64}$/.test(username))throw new Error("Invalid username");
  return blobWrite(accountPath(username),record,old);
}
export async function listUsers(){
  key();
  const records=[];let cursor;
  do{
    const page=await list({prefix:PREFIX+"u-",limit:100,cursor});
    for(const item of page.blobs||[]){
      if(records.length>=MAX_USERS)throw new Error("Too many user records");
      const found=await blobRead(item.pathname);
      if(found?.record)records.push(found.record);
    }
    cursor=page.hasMore?page.cursor:null;
  }while(cursor);
  return records;
}
export {MAX_USERS};
