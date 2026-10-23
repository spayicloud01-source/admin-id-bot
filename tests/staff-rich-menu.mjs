import assert from "node:assert/strict";
import sharp from "sharp";
import { extendMenu, syncStaffPaymentMenu } from "../lib/staffRichMenu.js";
import { STAFF_MENU_IMAGE } from "../lib/staffMenuImage.js";
import { parseCommand } from "../lib/commands.js";

const original = { richMenuId: "old", name: "existing" };
const menu = extendMenu(original);
assert.equal(menu.areas.length, 4);
assert.deepEqual(menu.areas.map((x) => x.action.label), ["รับยอด", "ตัดต้น", "ค่าปรับ", "ปิดยอด"]);
assert.deepEqual(menu.areas.map((x) => x.action.text), ["รับยอด", "ตัดต้น", "รับค่าปรับ", "ปิดยอด"]);
assert.equal(parseCommand(menu.areas[0].action.text).action, "queuePayment");
assert.equal(parseCommand(menu.areas[1].action.text).paymentKind, "principal");
assert.equal(parseCommand(menu.areas[2].action.text).paymentKind, "fine");

const image = Buffer.from(STAFF_MENU_IMAGE, "base64");
const meta = await sharp(image).metadata();
assert.equal(meta.width, 2500);
assert.equal(meta.height, 1686);
assert.ok(image.length < 1000000);

for (let row = 0; row < 2; row++) {
  const cells = menu.areas.slice(row * 2, row * 2 + 2).map((x) => x.bounds);
  assert.deepEqual(cells[0], { x: 0, y: row * 843, width: 1250, height: 843 });
  assert.deepEqual(cells[1], { x: 1250, y: row * 843, width: 1250, height: 843 });
}

let calls = [];
let current = original;
let uploaded;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, ...options });
  let data = {};
  if (url.endsWith("/user/U/richmenu")) {
    if (!current) return { ok: false, status: 404 };
    data = { richMenuId: current.richMenuId };
  } else if (url.endsWith("/user/all/richmenu")) return { ok: false, status: 404 };
  else if (url.endsWith("/richmenu/old") && !options.method) data = original;
  else if (url.endsWith("/richmenu/new") && !options.method) data = { ...menu, richMenuId: "new" };
  else if (url.endsWith("/richmenu/list")) data = { richmenus: [] };
  else if (url.endsWith("/richmenu") && options.method === "POST") data = { richMenuId: "new" };
  else if (url.endsWith("/content") && options.method === "POST") uploaded = options.body;
  return { ok: true, status: 200, json: async () => data };
};

assert.equal(await syncStaffPaymentMenu("U", true), true);
assert.equal(calls.at(-1).url, "https://api.line.me/v2/bot/user/U/richmenu/new");
assert.deepEqual(uploaded, image);

current = { ...menu, richMenuId: "new" };
calls = [];
await syncStaffPaymentMenu("U", false);
assert.equal(calls.at(-1).url, "https://api.line.me/v2/bot/user/U/richmenu/old");

console.log("PASS: four-button staff menu, image, command routing and per-user linking");
