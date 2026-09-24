import { CUSTOMER_MENU_IMAGE_BASE64 } from "./customerRichMenuImage.js";

const MENU_NAME = "admin-id-customer-v1";
const LABELS = [
  "ยอดปิด", "วันครบกำหนดชำระ", "ยอดค้าง",
  "สถานะ", "สิทธิ์ส่วนลด", "ติดต่อแอดมิน",
];
const X = [0, 833, 1667, 2500];
let cachedMenuId = "";
let pendingMenu;
const linkedUsers = new Set();

async function lineRequest(url, options = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE rich menu failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return response;
}

async function createOrFindMenu() {
  const list = await lineRequest("https://api.line.me/v2/bot/richmenu/list");
  const menus = (await list.json()).richmenus || [];
  let menuId = menus.find((menu) => menu.name === MENU_NAME)?.richMenuId;
  if (!menuId) {
    const areas = LABELS.map((label, index) => {
      const column = index % 3;
      return {
        bounds: {
          x: X[column], y: Math.floor(index / 3) * 843,
          width: X[column + 1] - X[column], height: 843,
        },
        action: { type: "message", label, text: label },
      };
    });
    const created = await lineRequest("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: { width: 2500, height: 1686 },
        selected: true,
        name: MENU_NAME,
        chatBarText: "เมนูลูกค้า",
        areas,
      }),
    });
    menuId = (await created.json()).richMenuId;
  }
  if (!menuId) throw new Error("LINE did not return a rich menu ID");

  // A previous request may have created the menu before failing to upload its image.
  const imageUrl = `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(menuId)}/content`;
  const image = await fetch(imageUrl, {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (image.status === 404) {
    await lineRequest(imageUrl, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: Buffer.from(CUSTOMER_MENU_IMAGE_BASE64, "base64"),
    });
  } else if (!image.ok) {
    throw new Error(`LINE rich menu image check failed: ${image.status}`);
  }
  return menuId;
}

async function menuId() {
  if (cachedMenuId) return cachedMenuId;
  if (!pendingMenu) pendingMenu = createOrFindMenu().then((id) => {
    cachedMenuId = id;
    return id;
  }).finally(() => { pendingMenu = undefined; });
  return pendingMenu;
}

export async function linkVerifiedCustomerMenu(lineUserId) {
  if (!lineUserId || linkedUsers.has(lineUserId)) return;
  const id = await menuId();
  await lineRequest(`https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(id)}`, {
    method: "POST",
  });
  linkedUsers.add(lineUserId);
}
