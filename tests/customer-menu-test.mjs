import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activateCustomerMenuTest, restoreCustomerMenuTest, isAuthorizedCustomerMenuTester, TEST_MENU_PREFIX } from "../lib/customerMenuTest.js";
import { syncStaffPaymentMenu } from "../lib/staffRichMenu.js";

process.env.LINE_CUSTOMER_MENU_TESTER_LINE_ID = "Uallowed";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-only-token";
assert.equal(isAuthorizedCustomerMenuTester("Uallowed"), true);
assert.equal(isAuthorizedCustomerMenuTester("Uother"), false);

const originalId = "richmenu-staff123";
let currentId = originalId;
let created = 0;
let requests = [];
const menus = [{ richMenuId: originalId, name: "admin-id-staff-v8:old" }];
const menuImages = new Set([originalId]);

function response(status = 200, value = {}) {
  return { ok: status >= 200 && status < 300, status,
    json: async () => value, text: async () => JSON.stringify(value) };
}
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const u = String(url);
  requests.push(method + " " + u);
  const userPath = "/user/Uallowed/richmenu";
  if (u.endsWith(userPath) && method === "GET")
    return currentId ? response(200, {richMenuId:currentId}) : response(404);
  if (u.endsWith(userPath) && method === "DELETE") { currentId = ""; return response(); }
  if (u.includes(userPath + "/") && method === "POST") {
    const id = u.split("/").at(-1);
    if (!menus.some(m => m.richMenuId === id)) return response(404);
    currentId = id; return response();
  }
  if (u.endsWith("/richmenu/list") && method === "GET") return response(200, {richmenus:menus});
  if (u.endsWith("/richmenu") && method === "POST") {
    const info = JSON.parse(options.body);
    assert.equal(info.areas.length, 6);
    assert.ok(info.areas.every(a => a.action.type === "uri" && a.action.uri.startsWith("https://admin-id-bot.vercel.app/customer?")));
    const id = "richmenu-test-" + (++created);
    menus.push({richMenuId:id,name:info.name});
    return response(200,{richMenuId:id});
  }
  const imageMatch = u.match(/\/richmenu\/([^/]+)\/content$/);
  if (imageMatch && method === "GET") return response(menuImages.has(imageMatch[1]) ? 200 : 404);
  if (imageMatch && method === "POST") {
    assert.equal(options.headers["Content-Type"], "image/png");
    menuImages.add(imageMatch[1]); return response();
  }
  const menuMatch = u.match(/\/richmenu\/([^/]+)$/);
  if (menuMatch && method === "GET") {
    const found = menus.find(m => m.richMenuId === menuMatch[1]);
    return found ? response(200,found) : response(404);
  }
  throw new Error("Unexpected LINE request: " + method + " " + u);
};

await assert.rejects(() => activateCustomerMenuTest("Uother"), /Not an authorized/);
assert.equal(requests.length, 0, "Unauthorized testers must not call LINE");
const active = await activateCustomerMenuTest("Uallowed");
assert.equal(active.active,true);
assert.notEqual(currentId,originalId);
assert.equal(menus.find(m => m.richMenuId === currentId).name,TEST_MENU_PREFIX + originalId);
const testId = currentId;
assert.equal((await activateCustomerMenuTest("Uallowed")).alreadyActive,true);
await syncStaffPaymentMenu("Uallowed", true);
assert.equal(currentId,testId, "Normal staff-message processing must not overwrite active trial");
const restored = await restoreCustomerMenuTest("Uallowed");
assert.equal(restored.restored,true);
assert.equal(currentId,originalId, "Original staff menu must be restored exactly");
assert.equal((await restoreCustomerMenuTest("Uallowed")).alreadyRestored,true);

const webhook = readFileSync(new URL("../api/line/webhook.js",import.meta.url),"utf8");
assert.match(webhook,/isAuthorizedCustomerMenuTester\(lineUserId\)/);
assert.match(webhook,/action: "checkAccess"/);
assert.match(webhook,/text === "ทดลองเมนูลูกค้า"/);
assert.match(webhook,/text === "กลับเมนูแอดมิน"/);
console.log("Isolated authorized customer-menu test and exact restoration passed.");
