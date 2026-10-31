import crypto from "node:crypto";

function secret() {
  const value = process.env.SHEETS_BRIDGE_SECRET;
  if (!value) throw new Error("SHEETS_BRIDGE_SECRET is not configured");
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function createWebSession({ lineUserId, staffName = "", role = "เจ้าของ", authMethod = "line", expiresInSeconds = 0, passwordVersion = "" }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(lineUserId || ""),
    name: String(staffName || ""),
    role: String(role || ""),
    iat: now,
    auth: authMethod === "password" ? "password" : "line",
    ...(authMethod==="password" ? {pv:String(passwordVersion||"")} : {}),
    ...(Number(expiresInSeconds)>0 ? {exp:now+Math.floor(Number(expiresInSeconds))} : {}),
  };
  if (!payload.sub || payload.role !== "เจ้าของ") throw new Error("Owner session required");
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + sig;
}

export function verifyWebSession(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!payload?.sub || payload.role !== "เจ้าของ") return null;
  if (payload.exp !== undefined && (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000))) return null;
  return payload;
}

export function sessionFromRequest(req) {
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyWebSession(token);
}


export function createStaffWebSession({lineUserId,username,role,version,displayName}){
  if(!/^U[\w-]{3,120}$/.test(String(lineUserId||"")) ||
    !/^[a-z0-9._-]{3,64}$/.test(String(username||"")) ||
    !["แอดมิน","พนักงาน"].includes(role) || !String(version||""))throw new Error("Invalid staff identity");
  const now=Math.floor(Date.now()/1000);
  const data={sub:String(lineUserId),user:String(username),role,ver:String(version),name:String(displayName||""),
    auth:"staff",iat:now,exp:now+12*3600};
  const body=b64url(JSON.stringify(data));
  const sig=crypto.createHmac("sha256",secret()).update(body).digest("base64url");
  return body+"."+sig;
}
export function staffSessionFromRequest(req){
  const h=String(req.headers?.authorization||"");
  if(!h.startsWith("Bearer "))return null;
  const [body,sig]=h.slice(7).trim().split(".");
  if(!body||!sig)return null;
  const expected=crypto.createHmac("sha256",secret()).update(body).digest("base64url");
  const actualSignature=Buffer.from(sig), expectedSignature=Buffer.from(expected);
  if(actualSignature.length!==expectedSignature.length||!crypto.timingSafeEqual(expectedSignature,actualSignature))return null;
  let value;
  try{value=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));}catch{return null;}
  if(value?.auth!=="staff"||!["แอดมิน","พนักงาน"].includes(value.role)||
     !/^U[\w-]{3,120}$/.test(String(value.sub||""))||
     !/^[a-z0-9._-]{3,64}$/.test(String(value.user||""))||
     !String(value.ver||"")||!Number.isSafeInteger(value.exp)||value.exp<=Date.now()/1000)return null;
  return value;
}


export async function currentOwnerSessionFromRequest(req){
  const session=sessionFromRequest(req);
  if(!session)return null;
  if(session.auth==="password"){
    const {getOwnerOverride}=await import("./adminAccountStore.js");
    const current=await getOwnerOverride();
    if(String(session.pv||"")!==String(current?.record?.version||""))return null;
  }
  return session;
}
