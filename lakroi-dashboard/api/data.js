import { LAKROI_SEED_BILLS } from "../lib/seed.js";

function storeId(){return String(process.env.BLOB_STORE_ID||"").replace(/^store_/,"")}
function authToken(){return process.env.VERCEL_OIDC_TOKEN||process.env.BLOB_READ_WRITE_TOKEN||""}
function blobUrl(path){const id=storeId();if(!id)throw new Error("BLOB_STORE_ID missing");return `https://${id}.public.blob.vercel-storage.com/${path}`}
async function putBlob(pathname,body,contentType){
  const id=storeId(), token=authToken();
  if(!id||!token) throw new Error("Blob credentials missing");
  const r=await fetch("https://vercel.com/api/blob/?pathname="+encodeURIComponent(pathname),{
    method:"PUT",
    headers:{authorization:"Bearer "+token,"x-api-version":"12","x-vercel-blob-store-id":id,"x-vercel-blob-access":"public","x-allow-overwrite":"1","x-content-type":contentType||"application/octet-stream"},
    body
  });
  const t=await r.text();let j={};try{j=JSON.parse(t)}catch{}
  if(!r.ok)throw new Error((j.error&&j.error.message)||t||("Blob HTTP "+r.status));
  return j;
}
async function seedState(){
  const state={bills:Array.isArray(LAKROI_SEED_BILLS)?LAKROI_SEED_BILLS:[],goal:15000,updatedAt:new Date().toISOString(),seededFrom:"หลักร้อยเฟอร์ฯ - ยอดขายและลงของ / บิลขาย"};
  await putBlob("lakroi/data.json",JSON.stringify(state),"application/json; charset=utf-8");
  return state;
}
async function readState(){
  const r=await fetch(blobUrl("lakroi/data.json")+"?t="+Date.now(),{cache:"no-store"});
  if(r.status===404)return seedState();
  if(!r.ok)throw new Error("Blob read failed "+r.status);
  const j=await r.json();
  if(!Array.isArray(j.bills)||j.bills.length===0)return seedState();
  return {bills:j.bills,goal:Number(j.goal||15000),updatedAt:j.updatedAt||null,seededFrom:j.seededFrom||null};
}
export default async function handler(req,res){
  try{
    res.setHeader("Cache-Control","no-store");
    const expected=String(process.env.LAKROI_DASHBOARD_PIN||"").trim();
    const supplied=String(req.headers["x-lakroi-pin"]||"").trim();
    if(!expected||supplied!==expected)return res.status(401).json({ok:false,error:"Unauthorized"});
    if(req.method==="GET"){const state=await readState();return res.status(200).json({ok:true,...state})}
    if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed"});
    const body=req.body&&typeof req.body==="object"?req.body:JSON.parse(req.body||"{}");
    if(body.action==="uploadImage"){
      const dataUrl=String(body.dataUrl||"");
      const m=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if(!m)return res.status(400).json({ok:false,error:"Invalid image"});
      const buf=Buffer.from(m[2],"base64");
      if(buf.length>1400000)return res.status(413).json({ok:false,error:"Image too large"});
      const ext=m[1]==="image/png"?"png":m[1]==="image/webp"?"webp":"jpg";
      const safe=String(body.billId||Date.now()).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)||String(Date.now());
      const path=`lakroi/bills/${safe}-${Date.now()}.${ext}`;
      const result=await putBlob(path,buf,m[1]);
      return res.status(200).json({ok:true,url:result.url||blobUrl(path)});
    }
    if(body.action==="save"){
      const bills=Array.isArray(body.bills)?body.bills.slice(-2000):[];
      const clean=bills.map(x=>({id:String(x.id||""),createdAt:String(x.createdAt||""),date:String(x.date||""),branch:String(x.branch||""),amount:Number(x.amount||0),method:String(x.method||""),note:String(x.note||"").slice(0,500),photo:String(x.photo||"").slice(0,2000)})).filter(x=>x.id&&x.date&&x.amount>=0);
      const state={bills:clean,goal:Number(body.goal||15000),updatedAt:new Date().toISOString()};
      await putBlob("lakroi/data.json",JSON.stringify(state),"application/json; charset=utf-8");
      return res.status(200).json({ok:true,updatedAt:state.updatedAt,count:clean.length});
    }
    return res.status(400).json({ok:false,error:"Unknown action"});
  }catch(error){return res.status(500).json({ok:false,error:String(error?.message||error)})}
}
