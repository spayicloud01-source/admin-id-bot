import assert from "node:assert/strict";
import { createWebSession, verifyWebSession, sessionFromRequest } from "../lib/webAuth.js";

const originalDateNow = Date.now;
const originalSecret = process.env.SHEETS_BRIDGE_SECRET;
const originalNotBefore = process.env.WEB_SESSION_NOT_BEFORE;
process.env.SHEETS_BRIDGE_SECRET = "test-only-web-auth-secret";
delete process.env.WEB_SESSION_NOT_BEFORE;
const issuedAt = 1_792_332_000_000;
const userId = "U" + "a".repeat(32);
try {
  Date.now = () => issuedAt;
  const token = createWebSession({lineUserId:userId, staffName:"เจ้าของ", role:"เจ้าของ"});
  assert.equal(verifyWebSession(token)?.sub,userId, "owner session valid");
  assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+token}})?.sub,userId);

  Date.now = () => issuedAt + 4*60*60*1000;
  assert.equal(verifyWebSession(token)?.sub,userId,"session remains valid after 4h");

  Date.now = () => issuedAt + 7*24*60*60*1000;
  assert.equal(verifyWebSession(token)?.sub,userId,"session remains valid after 7 days");

  Date.now = () => issuedAt + 365*24*60*60*1000;
  assert.equal(verifyWebSession(token)?.sub,userId,"session remains valid after a year");

  const forged = token.slice(0,-1)+(token.endsWith("A")?"B":"A");
  assert.equal(verifyWebSession(forged),null,"tampered signature rejected");

  Date.now = () => issuedAt - 122000;
  assert.equal(verifyWebSession(token),null,"future issued token rejected");

  Date.now = () => issuedAt + 400000;
  process.env.WEB_SESSION_NOT_BEFORE = String(Math.floor(issuedAt/1000)+1);
  assert.equal(verifyWebSession(token),null,"owner can revoke sessions through server cutoff");
  delete process.env.WEB_SESSION_NOT_BEFORE;
  assert.equal(verifyWebSession(token)?.sub,userId,"valid without emergency cutoff");

  assert.equal(verifyWebSession(""),null);
  assert.equal(verifyWebSession("a.b"),null);
  assert.throws(()=>createWebSession({lineUserId:userId,role:"เจ้าหน้าที่"}),/Owner session required/);
  console.log("owner-persistent-session: 12 assertions passed (no LINE sends or Sheets writes)");
} finally {
  Date.now = originalDateNow;
  if(originalSecret === undefined) delete process.env.SHEETS_BRIDGE_SECRET;
  else process.env.SHEETS_BRIDGE_SECRET = originalSecret;
  if(originalNotBefore === undefined) delete process.env.WEB_SESSION_NOT_BEFORE;
  else process.env.WEB_SESSION_NOT_BEFORE = originalNotBefore;
}
