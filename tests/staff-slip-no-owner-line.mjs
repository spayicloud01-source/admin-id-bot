import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../api/line/webhook.js", import.meta.url), "utf8");
const start = code.indexOf("async function broadcastStaffSubmittedSlip(event) {");
const end = code.indexOf("\nasync function handleSlipResendPostback(event) {", start);
assert.ok(start > 0 && end > start, "staff slip broadcast exists");
const fnCode = code.slice(start, end);
assert.match(fnCode, /access.role === "เจ้าของ"/, "owner role excluded");
assert.match(fnCode, /process\.env\.OWNER_LINE_USER_ID/, "owner LINE ID excluded even if role misclassified");

const messages = [];
const audits = [];
const calls = [];
const context = {
  process: { env: { OWNER_LINE_USER_ID: "configured-owner" } },
  console: { warn: (...args) => { throw Error("Unexpected LINE push failure: "+args.join(" ")); } },
  async callSheetsBridge(body) {
    calls.push(body);
    if (body.action === "getStaffSlipRecipients") {
      return { allowed:true, recipients:["owner-by-role","admin","configured-owner","staff","disabled","admin"] };
    }
    if (body.action === "checkAccess") {
      const role = {
        sender:"พนักงาน",
        "owner-by-role":"เจ้าของ",
        admin:"แอดมิน",
        "configured-owner":"แอดมิน",
        staff:"พนักงาน",
        disabled:"แอดมิน",
      }[body.lineUserId];
      return { allowed:body.lineUserId!=="disabled", role, staffName:"ทดสอบ" };
    }
    throw Error("Unexpected bridge action: "+body.action);
  },
  slipImageToken: () => "signed-test-image",
  async pushMessage(to, payload) { messages.push({to,payload}); },
  async safeLogAction(event) { audits.push(event); },
};
const run = vm.runInNewContext(fnCode+"\nbroadcastStaffSubmittedSlip", context);
const event = { source:{type:"user",userId:"sender"}, message:{type:"image",id:"123456789"},timestamp:1794050000000 };
const result = await run(event);
assert.equal(result.handled,true);
assert.equal(result.sent,2,"admin and staff only");
assert.equal(result.failed,0);
assert.deepEqual(messages.map(m=>m.to),["admin","staff"]);
assert.ok(!messages.some(m=>m.to==="owner-by-role"||m.to==="configured-owner"),"never forward slip to owner account");
assert.ok(messages.every(m=>m.payload.some(x=>x.type==="image")),"admins and staff still get the image");
assert.ok(messages.every(m=>m.payload.some(x=>x.type==="flex")),"staff payment action remains available");
assert.equal(audits.length,1,"broadcast audit still recorded");
assert.equal(calls.some(x=>x.action==="queuePayment"||x.action==="resolveReviewQueue"),false,"no financial writes");
console.log("PASS staff slip owner opt-out: owner role and configured owner ID skipped, admin/staff keep messages");
