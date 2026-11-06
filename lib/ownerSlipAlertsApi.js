import {validOwnerSession} from "./adminAccountsApi.js";
import {ownerAlerts,publicKey,validSubscription,saveSubscription,removeSubscription,markSeen} from "./ownerSlipPush.js";

function sameOrigin(req){
  const site=String(req.headers?.["sec-fetch-site"]||"");
  if(site&&!["same-origin","none"].includes(site))return false;
  const origin=String(req.headers?.origin||"");
  if(!origin)return true;
  try{
    const u=new URL(origin);
    return u.protocol==="https:"&&u.host===req.headers?.host;
  }catch{return false}
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","POST"].includes(req.method)){
    res.setHeader("Allow","GET, POST");
    return res.status(405).json({ok:false,error:"Method Not Allowed"});
  }
  try{
    // Read authorization is checked on EVERY request, including saved device
    // registrations, and not just when the user signed in previously.
    const owner=await validOwnerSession(req);
    if(!owner)return res.status(401).json({ok:false,error:"สำหรับเจ้าของระบบเท่านั้น"});
    if(req.method==="GET"){
      const alerts=await ownerAlerts(owner);
      return res.status(200).json({...alerts,pushPublicKey:publicKey()});
    }
    if(!sameOrigin(req))return res.status(403).json({ok:false,error:"Origin ไม่ถูกต้อง"});
    if(!String(req.headers?.["content-type"]||"").startsWith("application/json"))
      return res.status(415).json({ok:false,error:"รูปแบบข้อมูลไม่ถูกต้อง"});
    const body=req.body&&typeof req.body==="object"?req.body:{};
    if(JSON.stringify(body).length>3500)return res.status(413).json({ok:false,error:"ข้อมูลใหญ่เกินไป"});
    if(body.action==="subscribe"){
      if(!publicKey())return res.status(503).json({ok:false,error:"ระบบแจ้งเตือนมือถือยังไม่พร้อม"});
      if(!validSubscription(body.subscription))
        return res.status(400).json({ok:false,error:"การสมัครแจ้งเตือนไม่ถูกต้อง"});
      await saveSubscription(owner,body.subscription);
      return res.status(200).json({ok:true,message:"เปิดแจ้งเตือนมือถือแล้ว"});
    }
    if(body.action==="unsubscribe"){
      await removeSubscription(owner,body.endpoint);
      return res.status(200).json({ok:true,message:"ปิดแจ้งเตือนมือถือแล้ว"});
    }
    if(body.action==="seen"){
      await markSeen(owner,body.through);
      return res.status(200).json({ok:true,message:"รับทราบสลิปใหม่แล้ว"});
    }
    return res.status(400).json({ok:false,error:"Unknown action"});
  }catch(err){
    console.warn("Owner slip alert unavailable",String(err?.name||"failure").slice(0,45));
    return res.status(503).json({ok:false,error:"ยังโหลดการแจ้งเตือนไม่ได้ กรุณาลองอีกครั้ง"});
  }
}
