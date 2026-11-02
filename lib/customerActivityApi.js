import crypto from "node:crypto";
import { get, put, list, del } from "@vercel/blob";
import { sessionFromCustomerRequest } from "./customerPortal.js";
import { validOwnerSession } from "./adminAccountsApi.js";

// Activity is isolated from payment records and owner credentials by pathname and HKDF key.
const BASE = "admin-id/customer-activity-v1/";
const EVENTS = BASE + "events/";
const PRESENCE = BASE + "presence/";
const ACTIONS = new Set(["login","overview","payment","close","fine","status","info","discount","admin","qr","contact_request","payment_submit","logout"]);
const ONLINE_MS = 2 * 60 * 1000;
const RETENTION_DAYS = 30;
const throttle = new Map();

function token() {
  const value = String(process.env.ADMIN_AUTH_BLOB_READ_WRITE_TOKEN || "");
  if (!value) throw new Error("Private activity store is not configured");
  return value;
}
function key() {
  const root = String(process.env.ADMIN_AUTH_ENCRYPTION_KEY || "");
  if (!/^[a-f0-9]{64}$/.test(root)) throw new Error("Activity encryption is not configured");
  return Buffer.from(crypto.hkdfSync("sha256",Buffer.from(root,"hex"),Buffer.from("admin-id-activity-v1"),Buffer.from("encrypted-events"),32));
}
function encrypt(record, pathname) {
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  cipher.setAAD(Buffer.from(pathname));
  const data=Buffer.concat([cipher.update(JSON.stringify(record),"utf8"),cipher.final()]);
  return Buffer.concat([Buffer.from("CA01"),iv,cipher.getAuthTag(),data]);
}
function decrypt(bytes,pathname) {
  const b=Buffer.from(bytes);
  if(b.length<33 || b.subarray(0,4).toString()!=="CA01") throw new Error("Bad activity record");
  const dec=crypto.createDecipheriv("aes-256-gcm",key(),b.subarray(4,16));
  dec.setAAD(Buffer.from(pathname));dec.setAuthTag(b.subarray(16,32));
  return JSON.parse(Buffer.concat([dec.update(b.subarray(32)),dec.final()]).toString("utf8"));
}
const day=(time)=>new Date(time).toISOString().slice(0,10);
function sameOrigin(req) {
  const origin=String(req.headers?.origin||"");
  const site=String(req.headers?.["sec-fetch-site"]||"");
  if(site&&!["same-origin","none"].includes(site))return false;
  if(!origin)return true;
  try {const u=new URL(origin);return u.protocol==="https:"&&u.host===req.headers.host;}catch{return false;}
}
async function read(pathname){
  const result=await get(pathname,{access:"private",token:token(),useCache:false});
  if(!result)return null;
  const b=Buffer.from(await new Response(result.stream).arrayBuffer());
  if(b.length>8192)throw new Error("Activity record too large");
  return decrypt(b,pathname);
}
async function write(pathname,data,overwrite=false) {
  return put(pathname,encrypt(data,pathname),{
    access:"private",token:token(),addRandomSuffix:false,allowOverwrite:overwrite,
    contentType:"application/octet-stream",cacheControlMaxAge:60
  });
}
async function paths(prefix,limit=180){
  const out=[];let cursor;
  do {
    const page=await list({prefix,token:token(),limit:Math.min(limit-out.length,200),cursor});
    out.push(...(page.blobs||[]).map(x=>x.pathname));
    cursor=page.hasMore?page.cursor:null;
  }while(cursor&&out.length<limit);
  return out;
}
function recordFromSession(session,action,sessionId,now) {
  return {source:String(session.source).slice(0,80),sheet:String(session.sheet).slice(0,80),
    queue:String(session.queue).slice(0,40),name:String(session.name).slice(0,120),
    action,sessionId,at:new Date(now).toISOString()};
}
async function postActivity(req,res) {
  if(!sameOrigin(req))return res.status(403).json({ok:false,error:"Origin ไม่ถูกต้อง"});
  const session=sessionFromCustomerRequest(req);
  if(!session)return res.status(401).json({ok:false,error:"กรุณาเข้าสู่ระบบก่อน"});
  const body=typeof req.body==="object"&&req.body?req.body:{};
  if(JSON.stringify(body).length>320)return res.status(413).json({ok:false,error:"คำขอใหญ่เกินไป"});
  const action=String(body.action||"");
  const sessionId=String(body.sessionId||"");
  if(!ACTIONS.has(action)&&action!=="heartbeat")return res.status(400).json({ok:false,error:"กิจกรรมไม่ถูกต้อง"});
  if(!/^[a-f0-9-]{36}$/.test(sessionId))return res.status(400).json({ok:false,error:"รหัสเซสชันไม่ถูกต้อง"});
  const now=Date.now();
  const rateKey=sessionId;
  const last=throttle.get(rateKey)||{since:now,count:0};
  const current=now-last.since>60000?{since:now,count:1}:{since:last.since,count:last.count+1};
  throttle.set(rateKey,current);
  if(throttle.size>1500)throttle.delete(throttle.keys().next().value);
  if(current.count>35)return res.status(429).json({ok:false,error:"ส่งกิจกรรมถี่เกินไป"});
  const record=recordFromSession(session,action,sessionId,now);
  const presencePath=PRESENCE+day(now)+"/"+sessionId+".bin";
  await write(presencePath,{...record,active:action!=="logout"},true);
  if(action!=="heartbeat")await write(EVENTS+day(now)+"/"+crypto.randomUUID()+".bin",record);
  return res.status(200).json({ok:true});
}
async function readMany(items){
  const output=[];
  for(let i=0;i<items.length;i+=12){
    const rows=await Promise.all(items.slice(i,i+12).map(async p=>{try{return await read(p)}catch{return null}}));
    output.push(...rows.filter(Boolean));
  }
  return output;
}
async function getOwnerActivity(req,res){
  const owner=await validOwnerSession(req);
  if(!owner)return res.status(401).json({ok:false,error:"ต้องเข้าสู่ระบบเจ้าของ"});
  const days=[1,7,30].includes(Number(req.query?.days))?Number(req.query.days):7;
  const now=Date.now(), cut=now-days*86400000, pathsToRead=[];
  for(let i=0;i<days;i++){
    const prefix=EVENTS+day(now-i*86400000)+"/";
    pathsToRead.push(...await paths(prefix,days===30?50:100));
    if(pathsToRead.length>=500)break;
  }
  const events=(await readMany(pathsToRead.slice(0,500))).filter(x=>Date.parse(x.at)>=cut)
    .sort((a,b)=>b.at.localeCompare(a.at)).slice(0,500);
  const onlinePaths=[
    ...await paths(PRESENCE+day(now)+"/",250),
    ...await paths(PRESENCE+day(now-86400000)+"/",120)
  ];
  const presence=(await readMany(onlinePaths)).filter(x=>x.active&&now-Date.parse(x.at)<=ONLINE_MS);
  const activeMap=new Map();
  for(const item of presence){
    const id=[item.source,item.sheet,item.queue].join("|");
    if(!activeMap.has(id)||activeMap.get(id).at<item.at)activeMap.set(id,item);
  }
  const query=String(req.query?.queue||"").trim().toLowerCase().slice(0,40);
  const filtered=events.filter(x=>!query||x.queue.toLowerCase().includes(query));
  const active=[...activeMap.values()].filter(x=>!query||x.queue.toLowerCase().includes(query)).sort((a,b)=>b.at.localeCompare(a.at));
  return res.status(200).json({ok:true,days,onlineCount:active.length,online:active,events:filtered,
    note:"ออนไลน์หมายถึงมีการใช้งานใน 2 นาทีล่าสุด บันทึกเฉพาะเมนูและเวลา ไม่เก็บเนื้อหาหรือยอดเงิน"});
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false});
  try{
    if(req.method==="GET")return await getOwnerActivity(req,res);
    return await postActivity(req,res);
  }catch(error){
    console.warn("Customer activity unavailable",String(error?.name||"storage").slice(0,45));
    return res.status(503).json({ok:false,error:"ระบบติดตามการใช้งานยังไม่พร้อม"});
  }
}
