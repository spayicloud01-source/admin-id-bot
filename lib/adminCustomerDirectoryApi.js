import { callSheetsBridge } from "./sheetsBridge.js";
import { validOwnerSession } from "./adminAccountsApi.js";
import { safeCustomerView, normalizeQueue } from "./customerPortal.js";
import { mergeCustomerHistory } from "./customerHistoryMerge.js";

const STATUS_MODES = new Set(["all","deleted","pending_lock","sold","fraud","installment"]);
const ALLOWED_TARGETS = new Set(["v6|v6/10-69","v1/v3|v3/10-69"]);
function isAllowedTarget(item){return ALLOWED_TARGETS.has(String(item.source||"").trim().toLowerCase()+"|"+String(item.sheet||"").trim().toLowerCase());}
const CACHE_MS = 45000;
const cache = new Map();
function clean(value,max=100){return String(value??"").trim().slice(0,max);}
function normalized(value){return clean(value).toLocaleLowerCase("th-TH");}
function noStore(res){res.setHeader("Cache-Control","private, no-store");res.setHeader("X-Content-Type-Options","nosniff");}
function cleanCustomer(item){
 return {source:clean(item.source,75),sheet:clean(item.sheet,75),row:Number(item.row)||0,
  queue:clean(item.queue,45),name:clean(item.name,160),status:clean(item.status,70),
  model:clean(item.model,80),dueDate:clean(item.dueDate,80),principal:clean(item.principal,50),
  fee:clean(item.fee,50),daysDelta:Number.isFinite(Number(item.daysDelta))?Number(item.daysDelta):null};
}
async function listCustomers(owner,mode){
 const hit=cache.get(mode);
 if(hit&&Date.now()-hit.at<CACHE_MS)return hit.items;
 // GAS currently supports the due buckets; "all" is not a supported dueMode.
 // Fetch only active due buckets, preserve other status groups, and show partial-data caveat.
 const modes=mode==="all"?["today","upcoming","overdue"]:[mode];
 const results=await Promise.all(modes.map(m=>callSheetsBridge({action:"listDueCustomers",lineUserId:owner.sub,
   sourceType:"user",groupId:"",dueMode:m})));
 const seen=new Set(),items=[];
 for(const result of results){
   for(const row of Array.isArray(result?.items)?result.items:[]){
     if(!clean(row.name)||!clean(row.queue)||!isAllowedTarget(row))continue;
     const item=cleanCustomer(row),k=[item.source,item.sheet,item.row,item.queue].join("|");
     if(seen.has(k))continue;seen.add(k);items.push(item);
   }
 }
 cache.set(mode,{at:Date.now(),items});
 if(cache.size>10)cache.delete(cache.keys().next().value);
 return items;
}
function sourceIsSame(a,b){return normalized(a)===normalized(b);}
async function detailCustomer(owner,query){
 const source=clean(query.source,75),sheet=clean(query.sheet,75),queue=clean(query.queue,45);
 if(!source||!sheet||!queue||!/^[0-9a-z-]{2,45}$/i.test(queue)||!isAllowedTarget({source,sheet}))return {status:400,error:"อนุญาตเฉพาะ v3/10-69 และ V6/10-69"};
 // Owner auth is verified before this function. Exact source+sheet+queue prevents accidental cross-customer lookup.
 const search=await callSheetsBridge({action:"searchCustomer",query:source+":"+queue,
    lineUserId:owner.sub,sourceType:"user",groupId:""});
 const matches=(Array.isArray(search?.matches)?search.matches:[]).filter(x=>
   sourceIsSame(x.source,source)&&sourceIsSame(x.sheet,sheet)&&normalizeQueue(x.queue)===normalizeQueue(queue));
 if(matches.length!==1)return {status:matches.length?409:404,error:matches.length?"พบเลขคิวซ้ำ กรุณาตรวจชีตต้นทาง":"ไม่พบข้อมูลคิวนี้"};
 const customer=matches[0], publicView=safeCustomerView(customer);
 let history=[],historyWarning="";
 try{
  const r=await callSheetsBridge({action:"getHistory",query:queue,lineUserId:owner.sub,sourceType:"user",groupId:""});
  const approved=(Array.isArray(r?.items)?r.items:[]).filter(x=>
   sourceIsSame(x.source,customer.source)&&sourceIsSame(x.sheet,customer.sheet)
   &&normalizeQueue(x.queue)===normalizeQueue(customer.queue))
   .map(x=>({dateTime:clean(x.dateTime,100),eventType:clean(x.eventType,100),
    amount:Number(String(x.amount||"0").replace(/,/g,""))||0,note:clean(x.note,220)}));
  history=mergeCustomerHistory(approved,customer);
 }catch{historyWarning="ไม่สามารถดึงประวัติการชำระจากระบบส่วนกลางได้";history=mergeCustomerHistory([],customer);}
 return {status:200,data:{ok:true,customer:publicView,history,
    source:clean(customer.source),sheet:clean(customer.sheet),historyWarning,
    historyNote:"ประวัติส่วนกลางอาจยังไม่ครบทุกรายการที่บันทึกตรงชีตต้นทาง"}};
}
export default async function handler(req,res){
 noStore(res);
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"Method Not Allowed"});
 try{
  const owner=await validOwnerSession(req);
  if(!owner)return res.status(401).json({ok:false,error:"เฉพาะบัญชีเจ้าของที่เข้าสู่ระบบ"});
  if(clean(req.query?.queue)){
   const outcome=await detailCustomer(owner,req.query||{});
   return res.status(outcome.status).json(outcome.data||{ok:false,error:outcome.error});
  }
  const mode=clean(req.query?.mode||"all",35);
  if(!STATUS_MODES.has(mode))return res.status(400).json({ok:false,error:"ตัวกรองไม่ถูกต้อง"});
  const items=await listCustomers(owner,mode);
  return res.status(200).json({ok:true,mode,items,total:items.length,asOf:new Date().toISOString(),
   partial:true,partialNote:"อ่านเฉพาะ v3/10-69 และ V6/10-69; รายชื่อยังไม่ครอบคลุมคิวที่ไม่อยู่ในหมวดแจ้งเตือนหรือคิวปิดยอดเก่า จนกว่าจะเพิ่ม API อ่านรายชื่อทุกคิวใน GAS"});
 }catch(error){
  console.warn("Owner customer directory read failed",String(error?.name||"ReadError").slice(0,50));
  return res.status(503).json({ok:false,error:"โหลดรายชื่อลูกค้าไม่ได้ กรุณาลองใหม่"});
 }
}
