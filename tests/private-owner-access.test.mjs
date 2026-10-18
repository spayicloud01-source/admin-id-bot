import assert from "node:assert/strict";
import { createWebSession, verifyWebSession } from "../lib/webAuth.js";

const previous = {
  SHEETS_BRIDGE_SECRET: process.env.SHEETS_BRIDGE_SECRET,
  ADMIN_ID_PRIVATE_LINK_KEY: process.env.ADMIN_ID_PRIVATE_LINK_KEY,
};
const restore = (key, value) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
try {
  process.env.SHEETS_BRIDGE_SECRET = "signer-only-fixture";
  process.env.ADMIN_ID_PRIVATE_LINK_KEY = "an-offline-52-byte-test-only-key-to-rotate-on-demand-123";
  const lineUserId = "U" + "f".repeat(32);
  const ordinary = createWebSession({lineUserId, role:"เจ้าของ"});
  const privateToken = createWebSession({lineUserId, role:"เจ้าของ", via:"private-link"});
  assert.equal(verifyWebSession(privateToken)?.sub, lineUserId);
  assert.equal(verifyWebSession(privateToken)?.via, "private-link");
  assert.equal(verifyWebSession(ordinary)?.sub, lineUserId);
  process.env.ADMIN_ID_PRIVATE_LINK_KEY = "new-offline-52-byte-test-only-key-to-rotate-on-demand";
  assert.equal(verifyWebSession(privateToken), null, "rotating private key revokes private-link sessions");
  assert.equal(verifyWebSession(ordinary)?.sub, lineUserId, "LINE-issued session still valid");
  assert.throws(() => createWebSession({lineUserId, role:"เจ้าของ", via:"unknown"}), /Unknown web authentication mode/);
  const bad = privateToken.slice(0, -1) + (privateToken.endsWith("A") ? "B":"A");
  assert.equal(verifyWebSession(bad), null);
  delete process.env.ADMIN_ID_PRIVATE_LINK_KEY;
  assert.equal(verifyWebSession(privateToken), null, "disabling private link disables private sessions");
  console.log("private-owner-access: 8 checks passed (no network, LINE or Sheets calls)");
} finally {
  restore("SHEETS_BRIDGE_SECRET", previous.SHEETS_BRIDGE_SECRET);
  restore("ADMIN_ID_PRIVATE_LINK_KEY", previous.ADMIN_ID_PRIVATE_LINK_KEY);
}
