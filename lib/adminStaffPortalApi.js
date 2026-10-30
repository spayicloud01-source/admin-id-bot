import {staffSessionFromRequest} from "./webAuth.js";
import {getUser} from "./adminAccountStore.js";
import {callSheetsBridge} from "./sheetsBridge.js";

// Do not reuse the owner's privileged /api/web/send route for staff.
// Each allowed action is checked against BOTH the web account and live GAS rights.
const ACTIONS={
  searchCustomer:{right:"customers",permission:"ดูข้อมูลลูกค้า"},
  getCustomerInfo:{right:"customers",permission:"ดูข้อมูลลูกค้า"},
  getHistory:{right:"history",permission:"ดูประวัติ"},
  listReviewQueue:{right:"review",permission:"ยืนยันสลิป"},
  getReviewQueueItem:{right:"review",permission:"ยืนยันสลิป"},
  resolveReviewQueue:{right:"review",permission:"ยืนยันสลิป"},
  queuePayment:{right:"payment",permission:"บันทึกชำระ"},
};
export const maxDuration=55;
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false});}
  const origin=String(req.headers?.origin||"");
  if(origin){
    try{const url=new URL(origin);if(url.protocol!=="https:"||url.host!==req.headers.host)return res.status(403).json({ok:false});}
    catch{return res.status(403).json({ok:false});}
  }
  const session=staffSessionFromRequest(req);
  if(!session)return res.status(401).json({ok:false,error:"กรุณาเข้าสู่ระบบเจ้าหน้าที่อีกครั้ง"});
  try{
    const stored=await getUser(session.user);
    const account=stored?.record;
    if(!account||account.enabled!==true||account.version!==session.ver||
      account.lineUserId!==session.sub||account.role!==session.role)
      return res.status(401).json({ok:false,error:"บัญชีนี้ถูกระงับหรือเซสชันหมดอายุ"});
    const body=req.body&&typeof req.body==="object"?req.body:{};
    if(JSON.stringify(body).length>4096)return res.status(413).json({ok:false});
    const action=String(body.action||"");
    if(action==="whoami")return res.status(200).json({ok:true,
      profile:{username:account.username,name:account.displayName,role:account.role,permissions:account.permissions}});
    const info=ACTIONS[action];
    if(!info)return res.status(403).json({ok:false,error:"คำสั่งนี้ใช้ได้เฉพาะบัญชีเจ้าของ"});
    if(!Array.isArray(account.permissions)||!account.permissions.includes(info.right))
      return res.status(403).json({ok:false,error:"บัญชีเว็บไม่มีสิทธิ์ทำรายการนี้"});
    const allowed=await callSheetsBridge({action:"checkAccess",lineUserId:session.sub,
      sourceType:"user",groupId:"",permission:info.permission});
    if(allowed?.allowed!==true||allowed.role==="เจ้าของ")
      return res.status(403).json({ok:false,error:"LINE เจ้าหน้าที่ไม่มีสิทธิ์ทำรายการนี้"});
    const query=String(body.query||"").trim().slice(0,160);
    if(action!=="listReviewQueue"&&!query)return res.status(400).json({ok:false,error:"กรุณาระบุคิวหรือรายการ"});
    if(action==="resolveReviewQueue" && !["approved","rejected"].includes(body.decision))
      return res.status(400).json({ok:false,error:"การอนุมัติไม่ถูกต้อง"});
    if(action==="queuePayment" && (!Number.isFinite(Number(body.amount))||Number(body.amount)<=0||Number(body.amount)>10000000))
      return res.status(400).json({ok:false,error:"ยอดชำระไม่ถูกต้อง"});
    const payload={action,lineUserId:session.sub,query,sourceType:"user",
      ...(action==="resolveReviewQueue"?{decision:body.decision}:{}) ,
      ...(action==="queuePayment"?{amount:Number(body.amount)}:{})};
    const response=await callSheetsBridge(payload);
    return res.status(200).json(response||{ok:true});
  }catch(error){
    console.warn("Staff web route unavailable",String(error?.name||"Error").slice(0,60));
    return res.status(503).json({ok:false,error:"ระบบเจ้าหน้าที่ไม่พร้อม กรุณาลองใหม่"});
  }
}
