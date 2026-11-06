import { callSheetsBridge } from "./sheetsBridge.js";
import { validOwnerSession } from "./adminAccountsApi.js";
import { safeCustomerView, normalizeQueue } from "./customerPortal.js";
import { mergeCustomerHistory } from "./customerHistoryMerge.js";

const STATUS_MODES = new Set(["all","closed","deleted","pending_lock","sold","fraud","installment"]);
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
function category(status){
 const s=String(status||"").trim().toLowerCase().replace(/[()\[\]{}]/g,"");
 const p=s.split(/[,\/|]+/);
 if(p.some(x=>["ปิด","ปิดยอด","ปิดแล้ว","ปิดบัญชี"].includes(x)))return "closed";
 if(p.some(x=>["ลบ","ลบแล้ว","สถานะลบ"].includes(x)))return "deleted";
 if(p.some(x=>["รอล็อค","รอล็อก","รอlock"].includes(x)))return "pending_lock";
 if(p.some(x=>["ขาย","ขายแล้ว"].includes(x)))return "sold";
 if(p.some(x=>["โกง","ฉ้อโกง"].includes(x)))return "fraud";
 if(p.some(x=>["ผ่อน","ผ่อนอยู่","กำลังผ่อน"].includes(x)))return "installment";
 return "active";
}
async function listCustomerPage(owner,page){
 const key="page:"+page,hit=cache.get(key);
 if(hit&&Date.now()-hit.at<CACHE_MS)return hit.value;
 // This GAS action reads all named customer rows, not only LINE-linked records.
 const result=await callSheetsBridge({
   action:"listAllCustomers",lineUserId:owner.sub,sourceType:"user",groupId:"",page
 });
 if(!result||result.ok!==true||!Array.isArray(result.items))throw new Error("Full roster bridge action unavailable");
 const seen=new Set(),items=[];
 for(const row of result.items){
   if(!clean(row.name)||!clean(row.queue)||!isAllowedTarget(row))continue;
   const view=safeCustomerView({dueDate:row.dueDate,status:row.status,principal:0,fee:0});
   const delta=row.dueDate&&!view.inactive?(view.overdueDays?-view.overdueDays:view.daysUntil):null;
   const item={...cleanCustomer(row),daysDelta:delta,statusClass:category(row.status)};
   const k=[item.source,item.sheet,item.row,item.queue].join("|");
   if(seen.has(k))continue;seen.add(k);items.push(item);
 }
 const value={items,nextPage:Number.isInteger(result.nextPage)?result.nextPage:null,
   complete:result.complete===true,errors:Array.isArray(result.errors)?result.errors.map(x=>clean(x,140)):[]};
 cache.set(key,{at:Date.now(),value});
 if(cache.size>25)cache.delete(cache.keys().next().value);
 return value;
}
function sourceIsSame(a,b){return normalized(a)===normalized(b);}
export async function detailCustomer(owner,query,bridge=callSheetsBridge){
 const source=clean(query.source,75),sheet=clean(query.sheet,75),queue=clean(query.queue,45);
 if(!source||!sheet||!queue||!/^[0-9a-z-]{2,45}$/i.test(queue)||!isAllowedTarget({source,sheet}))return {status:400,error:"อนุญาตเฉพาะ v3/10-69 และ V6/10-69"};
 // The owner session is verified by the HTTP handler before any GAS calls.
 // Run two independent read-only GAS actions concurrently to avoid adding their latency.
 // Both responses are settled before processing, so an unavailable history never causes
 // an unhandled rejection or hides a verified customer's primary account information.
 const [searchOutcome,historyOutcome]=await Promise.allSettled([
   bridge({action:"searchCustomer",query:source+":"+queue,
     lineUserId:owner.sub,sourceType:"user",groupId:""}),
   bridge({action:"getHistory",query:queue,
     lineUserId:owner.sub,sourceType:"user",groupId:""})
 ]);
 if(searchOutcome.status!=="fulfilled")throw searchOutcome.reason;
 const search=searchOutcome.value;
 // Exact source/sheet/queue matching prevents cross-customer data disclosure.
 const matches=(Array.isArray(search?.matches)?search.matches:[]).filter(x=>
   sourceIsSame(x.source,source)&&sourceIsSame(x.sheet,sheet)&&normalizeQueue(x.queue)===normalizeQueue(queue));
 if(matches.length!==1)return {status:matches.length?409:404,error:matches.length?"พบเลขคิวซ้ำ กรุณาตรวจชีตต้นทาง":"ไม่พบข้อมูลคิวนี้"};
 const customer=matches[0], publicView=safeCustomerView(customer);
 let history=[],historyWarning="";
 try{
  if(historyOutcome.status!=="fulfilled")throw historyOutcome.reason;
  const r=historyOutcome.value;
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
  const page=Number(req.query?.page??0);
  if(!Number.isInteger(page)||page<0||page>99)
    return res.status(400).json({ok:false,error:"เลขหน้าไม่ถูกต้อง"});
  const batch=await listCustomerPage(owner,page);
  return res.status(200).json({ok:true,page,items:batch.items,total:batch.items.length,
   nextPage:batch.nextPage,complete:batch.complete,errors:batch.errors,asOf:new Date().toISOString(),
   partial:batch.errors.length>0||batch.nextPage!==null,
   partialNote:batch.errors.length?"มีชีตบางแห่งอ่านไม่สำเร็จ: "+batch.errors.join("; "):batch.nextPage!==null?
      "กำลังโหลดรายชื่อจาก V3/V6 หน้าอื่น":"แสดงลูกค้าทุกคิวที่มีชื่อและเลขคิวจาก V3/V6 แล้ว"});
 }catch(error){
  console.warn("Owner customer directory read failed",String(error?.name||"ReadError").slice(0,50));
  return res.status(503).json({ok:false,error:"โหลดรายชื่อลูกค้าไม่ได้ กรุณาลองใหม่"});
 }
}
