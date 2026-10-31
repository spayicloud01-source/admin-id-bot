import crypto from "node:crypto";
import {callSheetsBridge} from "./sheetsBridge.js";
import {sessionFromRequest,createWebSession} from "./webAuth.js";
import {hashOwnerPassword,passwordMeetsPolicy,validateUsername,verifyOwnerPassword} from "./adminPasswordAuth.js";
import {getOwnerOverride,updateOwnerOverride,getUser,saveUser,listUsers,MAX_USERS} from "./adminAccountStore.js";

const PERMISSIONS=["customers","history","payment"];
const PASSWORD_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
export const maxDuration=55;
export function allowedPermissionList(values,role){
  const list=Array.isArray(values)?values.filter(x=>typeof x==="string"&&PERMISSIONS.includes(x)):[];
  if(role==="พนักงาน")return ["customers","history"].filter(x=>list.includes(x));
  return PERMISSIONS.filter(x=>list.includes(x));
}
function freshPassword(){
  const chars=Array.from(crypto.randomBytes(24),b=>PASSWORD_ALPHABET[b%PASSWORD_ALPHABET.length]).join("");
  return chars+"Aa9";
}
const cleanUser=r=>({
  username:r.username,displayName:r.displayName,role:r.role,lineUserId:r.lineUserId,
  enabled:r.enabled,permissions:r.permissions,updatedAt:r.updatedAt,
});
export async function validOwnerSession(req){
  const session=sessionFromRequest(req);
  if(!session)return null;
  if(session.auth==="password"){
    const current=await getOwnerOverride();
    if(String(session.pv||"")!==String(current?.record?.version||""))return null;
  }
  // Check current owner privileges; revoked LINE owners cannot manage users.
  const access=await callSheetsBridge({action:"checkAccess",lineUserId:session.sub,
    sourceType:"user",groupId:"",permission:"จัดการเจ้าหน้าที่",allowSystemControl:true});
  if(access?.allowed!==true||access?.role!=="เจ้าของ")return null;
  return session;
}
function noStore(res,message){return res.status(503).json({ok:false,error:message||"ระบบจัดการผู้ใช้ยังไม่พร้อม"});}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","POST"].includes(req.method)){res.setHeader("Allow","GET, POST");return res.status(405).json({ok:false});}
  if(req.method==="POST"){
    const o=String(req.headers?.origin||"");
    if(o){try{const u=new URL(o);if(u.protocol!=="https:"||u.host!==req.headers?.host)return res.status(403).json({ok:false,error:"Invalid origin"});}catch{return res.status(403).json({ok:false,error:"Invalid origin"});}}
    if(!String(req.headers?.["content-type"]||"").startsWith("application/json"))return res.status(415).json({ok:false});
  }
  try{
    const owner=await validOwnerSession(req);
    if(!owner)return res.status(401).json({ok:false,error:"ต้องเข้าสู่ระบบด้วยสิทธิ์เจ้าของ"});
    const body=req.method==="POST"&&req.body&&typeof req.body==="object"?req.body:{};
    if(JSON.stringify(body).length>4096)return res.status(413).json({ok:false});
    const action=req.method==="GET"?"list":String(body.action||"");
    if(action==="list"){
      const users=await listUsers();
      return res.status(200).json({ok:true,users:users.map(cleanUser).sort((a,b)=>a.username.localeCompare(b.username)),
        owner:{username:process.env.ADMIN_WEB_LOGIN_USERNAME||"เจ้าของ",role:"เจ้าของ"}});
    }
    if(action==="changeOwnerPassword"){
      const oldPassword=String(body.currentPassword||""),newPassword=body.newPassword;
      if(!passwordMeetsPolicy(newPassword)||newPassword===oldPassword)
        return res.status(400).json({ok:false,error:"รหัสใหม่ต้องยาว 12–128 ตัวอักษร มีตัวหนังสือและตัวเลข และไม่ซ้ำรหัสเดิม"});
      const prior=await getOwnerOverride();
      const env=prior?.record?.passwordHash?
        {...process.env,ADMIN_WEB_LOGIN_PASSWORD_HASH:prior.record.passwordHash}:process.env;
      const correct=await verifyOwnerPassword(process.env.ADMIN_WEB_LOGIN_USERNAME,oldPassword,env);
      if(!correct)return res.status(401).json({ok:false,error:"รหัสผ่านปัจจุบันไม่ถูกต้อง"});
      const hash=await hashOwnerPassword(newPassword);
      const version=crypto.randomUUID();
      await updateOwnerOverride({passwordHash:hash,version,updatedAt:new Date().toISOString()},prior);
      const next=createWebSession({lineUserId:owner.sub,staffName:owner.name,role:"เจ้าของ",
        authMethod:"password",passwordVersion:version,expiresInSeconds:12*3600});
      return res.status(200).json({ok:true,message:"เปลี่ยนรหัสผ่านเจ้าของแล้ว",token:next});
    }
    const username=validateUsername(body.username)?.toLowerCase();
    if(!username || username===String(process.env.ADMIN_WEB_LOGIN_USERNAME||"").toLowerCase())
      return res.status(400).json({ok:false,error:"ชื่อผู้ใช้ไม่ถูกต้องหรือซ้ำกับบัญชีเจ้าของ"});
    if(action==="create"){
      if((await listUsers()).length>=MAX_USERS)return res.status(409).json({ok:false,error:"จำนวนบัญชีถึงขีดจำกัด"});
      if(await getUser(username))return res.status(409).json({ok:false,error:"ชื่อผู้ใช้นี้มีอยู่แล้ว"});
      const lineId=String(body.lineUserId||"").trim();
      const role=String(body.role||"");
      const displayName=String(body.displayName||"").trim();
      if(!/^U[\w-]{3,120}$/.test(lineId)||!["แอดมิน","พนักงาน"].includes(role)||displayName.length<2||displayName.length>80)
        return res.status(400).json({ok:false,error:"ระบุชื่อ บทบาท และ LINE User ID ที่ถูกต้อง"});
      const access=await callSheetsBridge({action:"checkAccess",lineUserId:lineId,sourceType:"user",
        groupId:"",permission:"ดูข้อมูลลูกค้า"});
      if(access?.allowed!==true || access.role==="เจ้าของ")
        return res.status(403).json({ok:false,error:"LINE นี้ยังไม่ได้รับสิทธิ์เจ้าหน้าที่ดูข้อมูลลูกค้าในระบบเดิม"});
      const existing=await listUsers();
      if(existing.some(r=>r.lineUserId===lineId))return res.status(409).json({ok:false,error:"LINE User ID นี้มีบัญชีเว็บแล้ว"});
      const tempPassword=freshPassword();
      const record={username,displayName,role,lineUserId:lineId,enabled:true,
        permissions:allowedPermissionList(body.permissions,role),
        passwordHash:await hashOwnerPassword(tempPassword),version:crypto.randomUUID(),
        updatedAt:new Date().toISOString()};
      await saveUser(record,null);
      return res.status(200).json({ok:true,user:cleanUser(record),temporaryPassword:tempPassword,
        message:"สร้างบัญชีแล้ว กรุณาส่งรหัสเริ่มต้นให้เจ้าหน้าที่อย่างปลอดภัย"});
    }
    const prior=await getUser(username);
    if(!prior)return res.status(404).json({ok:false,error:"ไม่พบบัญชีผู้ใช้"});
    const record={...prior.record};
    if(action==="toggle"){
      if(typeof body.enabled!=="boolean")return res.status(400).json({ok:false});
      record.enabled=body.enabled;
    }else if(action==="setPermissions"){
      record.permissions=allowedPermissionList(body.permissions,record.role);
    }else if(action==="resetPassword"){
      const next=freshPassword();
      record.passwordHash=await hashOwnerPassword(next);
      record.version=crypto.randomUUID();
      record.updatedAt=new Date().toISOString();
      await saveUser(record,prior);
      return res.status(200).json({ok:true,user:cleanUser(record),temporaryPassword:next});
    }else{
      return res.status(400).json({ok:false,error:"Unknown action"});
    }
    record.version=crypto.randomUUID(); // revoke existing sessions immediately
    record.updatedAt=new Date().toISOString();
    await saveUser(record,prior);
    return res.status(200).json({ok:true,user:cleanUser(record)});
  }catch(e){
    console.warn("Admin user management error",String(e?.name||"Failure").slice(0,80));
    return noStore(res);
  }
}
