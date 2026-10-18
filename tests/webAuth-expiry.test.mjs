import assert from "node:assert/strict";
import { createWebSession, verifyWebSession, sessionFromRequest } from "../lib/webAuth.js";

const originalDateNow = Date.now;
const originalSecret = process.env.SHEETS_BRIDGE_SECRET;
process.env.SHEETS_BRIDGE_SECRET = "test-only-web-auth-secret";
const issuedAt = 1_792_332_000_000;
const userId = "U" + "a".repeat(32);
try {
  Date.now = () => issuedAt;
  const token = createWebSession({ lineUserId: userId, staffName: "เจ้าของ", role: "เจ้าของ" });
  assert.equal(verifyWebSession(token)?.sub, userId);
  assert.equal(sessionFromRequest({headers:{authorization:"Bearer "+token}})?.sub, userId);

  Date.now = () => issuedAt + 4*60*60*1000 - 1000;
  assert.equal(verifyWebSession(token)?.sub, userId, "valid until final second");

  Date.now = () => issuedAt + 4*60*60*1000;
  assert.equal(verifyWebSession(token), null, "expires at exactly 4 hours");

  Date.now = () => issuedAt + 4*60*60*1000 + 1;
  assert.equal(verifyWebSession(token), null, "expired link never reactivates");

  const forged = token.slice(0,-1) + (token.endsWith("A")?"B":"A");
  assert.equal(verifyWebSession(forged), null, "tampered signature rejected");

  Date.now = () => issuedAt - 122_000;
  assert.equal(verifyWebSession(token), null, "issued >120s in future rejected");

  assert.equal(verifyWebSession(""), null);
  assert.equal(verifyWebSession("a.b"), null);
  assert.throws(() => createWebSession({lineUserId:userId,role:"เจ้าหน้าที่"}), /Owner session required/);

  console.log("webAuth-expiry: 9 checks passed");
} finally {
  Date.now = originalDateNow;
  if (originalSecret === undefined) delete process.env.SHEETS_BRIDGE_SECRET;
  else process.env.SHEETS_BRIDGE_SECRET = originalSecret;
}
