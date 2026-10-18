import assert from "node:assert/strict";
import { lineRelationshipEvent, formatLineRelationshipAlert, formatBlockedCustomerLines } from "../lib/lineStatusTracking.js";

const id = "U" + "a".repeat(32);
assert.equal(lineRelationshipEvent({type:"unfollow",source:{type:"group",userId:id}}), null);
assert.equal(lineRelationshipEvent({type:"message",source:{type:"user",userId:id}}), null);
assert.equal(lineRelationshipEvent({type:"unfollow",source:{type:"user",userId:"Ufake"}}), null);
const blocked = lineRelationshipEvent({type:"unfollow",source:{type:"user",userId:id},timestamp:1792332000000,webhookEventId:"evt-1"});
assert.equal(blocked.eventType,"unfollow");
assert.equal(blocked.lineUserId,id);
assert.equal(blocked.action,"recordCustomerLineStatus");
assert.equal(blocked.webhookEventId,"evt-1");
const unblocked = lineRelationshipEvent({type:"follow",source:{type:"user",userId:id},follow:{isUnblocked:true}});
assert.equal(unblocked.isUnblocked,true);
assert.equal(formatLineRelationshipAlert({changed:false,items:[{queue:"310-4"}]},"unfollow"),"");
assert.match(formatLineRelationshipAlert({changed:true,items:[{queue:"310-4",name:"ลูกค้า"}]},"unfollow"),/310-4/);
assert.match(formatBlockedCustomerLines([{queue:"310-4",name:"ลูกค้า"}]),/310-4/);
assert.match(formatBlockedCustomerLines([]),/ยังไม่พบ/);
console.log("line-status-tracking: 9 checks passed (no LINE or sheet writes)");
