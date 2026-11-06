import crypto from "node:crypto";
import {get,put,list,del} from "@vercel/blob";
import webpush from "web-push";

// Separate encrypted owner-only store; no LINE quota and no customer-facing API.
const ROOT="admin-id/owner-slip-alerts-v1/";
const EVENTS=ROOT+"events/";
const SUBS=ROOT+"subscriptions/";
const ACKS=ROOT+"seen/";
const DAYS=14;

function storageToken(){
  const t=String(process.env.ADMIN_AUTH_BLOB_READ_WRITE_TOKEN||"");
  if(!t)throw new Error("Owner notification private storage unavailable");
  return t;
}
function cryptKey(){
  const raw=String(process.env.ADMIN_AUTH_ENCRYPTION_KEY||"");
  if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error("Owner notification encryption unavailable");
  return Buffer.from(crypto.hkdfSync("sha256",Buffer.from(raw,"hex"),Buffer.from("admin-id-owner-slip-alerts-v1"),Buffer.from("encrypted-blob-records"),32));
}
function encrypt(data,path){
  const iv=crypto.randomBytes(12),enc=crypto.createCipheriv("aes-256-gcm",cryptKey(),iv);
  enc.setAAD(Buffer.from(path));
  return Buffer.concat([Buffer.from("SA01"),iv,enc.getAuthTag(),enc.update(JSON.stringify(data)),enc.final()]);
}
function decrypt(raw,path){
  const b=Buffer.from(raw);
  if(b.length<33||b.subarray(0,4).toString()!=="SA01")throw new Error("Invalid notification record");
  const dec=crypto.createDecipheriv("aes-256-gcm",cryptKey(),b.subarray(4,16));
  dec.setAAD(Buffer.from(path));dec.setAuthTag(b.subarray(16,32));
  return JSON.parse(Buffer.concat([dec.update(b.subarray(32)),dec.final()]).toString("utf8"));
}
async function read(path){
  const file=await get(path,{access:"private",token:storageToken(),useCache:false});
  if(!file)return null;
  const b=Buffer.from(await new Response(file.stream).arrayBuffer());
  if(b.length>10000)throw new Error("Oversized notification record");
  return decrypt(b,path);
}
async function write(path,record,overwrite=false){
  return put(path,encrypt(record,path),{
    access:"private",token:storageToken(),addRandomSuffix:false,
    allowOverwrite:overwrite,contentType:"application/octet-stream",cacheControlMaxAge:60
  });
}
const hash=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const ackPath=owner=>ACKS+hash(owner.sub)+".bin";
const subPath=endpoint=>SUBS+hash(endpoint)+".bin";
function eventTimestamp(path){
  const name=path.slice(path.lastIndexOf("/")+1);
  const m=name.match(/^(\d{13})-[0-9a-f-]{36}\.bin$/);
  return m?Number(m[1]):0;
}
async function indexed(prefix,limit=600){
  const results=[];let cursor;
  do{
    const r=await list({prefix,token:storageToken(),limit:Math.min(200,limit-results.length),cursor});
    results.push(...(r.blobs||[]).map(x=>x.pathname));
    cursor=r.hasMore?r.cursor:null;
  }while(cursor&&results.length<limit);
  return results;
}
export function isSupportedPushEndpoint(value){
  try{
    const u=new URL(String(value));
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||u.search)return false;
    const host=u.hostname.toLowerCase();
    return host==="fcm.googleapis.com" ||
      host==="updates.push.services.mozilla.com" ||
      host.endsWith(".push.apple.com") ||
      host==="web.push.apple.com" ||
      host.endsWith(".notify.windows.com");
  }catch{return false}
}
export function validSubscription(value){
  return !!value && typeof value==="object" && isSupportedPushEndpoint(value.endpoint) &&
    String(value.endpoint).length<2048 &&
    /^[A-Za-z0-9_-]{80,100}$/.test(String(value.keys?.p256dh||"")) &&
    /^[A-Za-z0-9_-]{18,30}$/.test(String(value.keys?.auth||""));
}
export function publicKey(){
  const pub=String(process.env.OWNER_WEB_PUSH_PUBLIC_KEY||"");
  if(!/^[A-Za-z0-9_-]{87}$/.test(pub))return "";
  return pub;
}
function canPush(){
  return !!publicKey()&&/^[A-Za-z0-9_-]{43}$/.test(String(process.env.OWNER_WEB_PUSH_PRIVATE_KEY||""));
}
export async function saveSubscription(owner,sub){
  if(!validSubscription(sub))throw new Error("ข้อมูลการสมัครแจ้งเตือนไม่ถูกต้อง");
  const path=subPath(sub.endpoint);
  await write(path,{
    owner:hash(owner.sub),
    subscription:{endpoint:sub.endpoint,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}},
    registeredAt:new Date().toISOString()
  },true);
}
export async function removeSubscription(owner,endpoint){
  if(!isSupportedPushEndpoint(endpoint))return;
  const path=subPath(endpoint);
  const record=await read(path);
  if(record&&record.owner===hash(owner.sub))await del(path,{token:storageToken()});
}
export async function markSeen(owner,through){
  const millis=Number(through);
  if(!Number.isSafeInteger(millis)||millis<0||millis>Date.now()+60000)throw new Error("เวลาแจ้งเตือนไม่ถูกต้อง");
  const path=ackPath(owner);
  const previous=await read(path);
  const at=Math.max(millis,Number(previous?.at||0));
  await write(path,{at,updatedAt:Date.now()},true);
}
export async function ownerAlerts(owner){
  const [files,seen]=await Promise.all([indexed(EVENTS),read(ackPath(owner))]);
  const now=Date.now(),cutoff=now-DAYS*86400000;
  const recent=files.map(x=>({path:x,at:eventTimestamp(x)}))
    .filter(x=>x.at>=cutoff&&x.at<=now+60000).sort((a,b)=>b.at-a.at);
  const seenAt=Number(seen?.at||0);
  const unread=recent.filter(x=>x.at>seenAt).length;
  // Only open the ten newest encrypted records, not every historical record.
  const latest=(await Promise.all(recent.slice(0,10).map(async x=>{
    try{
      const entry=await read(x.path);
      if(!entry||!Number.isInteger(entry.rowNo)||entry.rowNo<2)return null;
      return {id:entry.id,rowNo:entry.rowNo,queue:String(entry.queue||"").slice(0,45),
        name:String(entry.name||"").slice(0,120),
        amount:Number(entry.amount||0),kind:String(entry.kind||"").slice(0,30),at:x.at};
    }catch{return null}
  }))).filter(Boolean);
  return {ok:true,unread,latest,seenAt,newestAt:recent[0]?.at||0,
    hasMore:files.length>=600,retentionDays:DAYS};
}
async function loadSubscribers(){
  const files=await indexed(SUBS,30);
  return (await Promise.all(files.slice(0,20).map(async path=>{
    try{
      const record=await read(path);
      return record&&validSubscription(record.subscription)?{path,subscription:record.subscription}:null;
    }catch{return null}
  }))).filter(Boolean);
}
export async function recordSlipSubmission(data){
  const rowNo=Number(data?.rowNo||0);
  if(!Number.isInteger(rowNo)||rowNo<2)throw new Error("Slip queue row is missing");
  const at=Date.now(),id=crypto.randomUUID();
  const path=EVENTS+new Date(at).toISOString().slice(0,10)+"/"+at+"-"+id+".bin";
  await write(path,{
    id,rowNo,at,queue:String(data.queue||"").slice(0,45),
    name:String(data.name||"").slice(0,120),
    amount:Number(data.amount||0),kind:String(data.kind||"").slice(0,30)
  });
  // The queue was already written by the existing GAS flow. Push errors must
  // never cancel, repeat or requeue a real payment.
  if(!canPush())return {stored:true,pushConfigured:false};
  let subscribers=[];
  try{subscribers=await loadSubscribers()}catch{return {stored:true,pushConfigured:true,delivered:0}}
  if(!subscribers.length)return {stored:true,pushConfigured:true,delivered:0};
  webpush.setVapidDetails("https://admin-id-bot.vercel.app",publicKey(),process.env.OWNER_WEB_PUSH_PRIVATE_KEY);
  const body=JSON.stringify({
    title:"Admin ID — มีสลิปใหม่",
    body:"ลูกค้าส่งหลักฐานชำระแล้ว กรุณาเปิดคิวตรวจสอบ",
    url:"/?tab=reviewTools",tag:"admin-id-slip-"+rowNo
  });
  const deliveries=await Promise.allSettled(subscribers.map(async x=>{
    try{
      await webpush.sendNotification(x.subscription,body,{TTL:600,urgency:"high",timeout:3000});
      return true;
    }catch(err){
      if(err?.statusCode===404||err?.statusCode===410){
        try{await del(x.path,{token:storageToken()})}catch{}
      }
      return false;
    }
  }));
  return {stored:true,pushConfigured:true,delivered:deliveries.filter(x=>x.status==="fulfilled"&&x.value).length};
}
