import { CUSTOMER_MENU_IMAGE_BASE64 } from "./customerRichMenuImage.js";
import { customerMenuDefinition } from "./customerRichMenu.js";

// Per-user preview menu. The previous rich-menu ID is embedded in its name so
// serverless restarts cannot lose the restore target; no Sheets writes required.
export const TEST_MENU_PREFIX = "admin-id-customer-test-v1:";
const API = "https://api.line.me/v2/bot";
const DATA = "https://api-data.line.me/v2/bot";

export function isAuthorizedCustomerMenuTester(lineUserId) {
  const expected = String(process.env.LINE_CUSTOMER_MENU_TESTER_LINE_ID || "").trim();
  return Boolean(expected && lineUserId && String(lineUserId) === expected);
}

async function request(url, options = {}, allowMissing = false) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE access token is not configured");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`LINE menu operation failed (${response.status})`);
  return response;
}
async function linkedMenuId(lineUserId) {
  const response = await request(`${API}/user/${encodeURIComponent(lineUserId)}/richmenu`, {}, true);
  return response ? String((await response.json()).richMenuId || "") : "";
}
async function getMenu(menuId) {
  if (!menuId) return null;
  const response = await request(`${API}/richmenu/${encodeURIComponent(menuId)}`);
  return response.json();
}
function requireTester(lineUserId) {
  if (!isAuthorizedCustomerMenuTester(lineUserId)) throw new Error("Not an authorized LINE menu tester");
}
async function findOrCreateTestMenu(originalId) {
  const name = TEST_MENU_PREFIX + (originalId || "none");
  const list = await (await request(`${API}/richmenu/list`)).json();
  let id = (list.richmenus || []).find(menu => menu.name === name)?.richMenuId;
  let created = false;
  if (!id) {
    const definition = { ...customerMenuDefinition(), name, chatBarText: "ทดสอบเมนูลูกค้า" };
    id = String((await (await request(`${API}/richmenu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(definition),
    })).json()).richMenuId || "");
    if (!id) throw new Error("LINE did not return a test-menu ID");
    created = true;
  }
  try {
    const contentUrl = `${DATA}/richmenu/${encodeURIComponent(id)}/content`;
    const imageResponse = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (imageResponse.status === 404) {
      const image = Buffer.from(CUSTOMER_MENU_IMAGE_BASE64, "base64");
      if (image.length > 1000000) throw new Error("LINE rich-menu image exceeds 1 MB");
      await request(contentUrl, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: image,
      });
    } else if (!imageResponse.ok) {
      throw new Error(`LINE test-menu image read failed (${imageResponse.status})`);
    }
  } catch (error) {
    if (created) {
      await request(`${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
    throw error;
  }
  return id;
}
export async function activateCustomerMenuTest(lineUserId) {
  requireTester(lineUserId);
  const currentId = await linkedMenuId(lineUserId);
  const current = await getMenu(currentId);
  if (current?.name?.startsWith(TEST_MENU_PREFIX)) {
    return { active: true, alreadyActive: true };
  }
  const testId = await findOrCreateTestMenu(currentId);
  await request(`${API}/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(testId)}`, { method: "POST" });
  if (await linkedMenuId(lineUserId) !== testId) throw new Error("Cannot confirm test-menu link");
  return { active: true, alreadyActive: false };
}
export async function restoreCustomerMenuTest(lineUserId) {
  requireTester(lineUserId);
  const currentId = await linkedMenuId(lineUserId);
  const current = await getMenu(currentId);
  if (!current?.name?.startsWith(TEST_MENU_PREFIX)) {
    return { restored: true, alreadyRestored: true };
  }
  const previousId = current.name.slice(TEST_MENU_PREFIX.length);
  const userUrl = `${API}/user/${encodeURIComponent(lineUserId)}/richmenu`;
  if (previousId && previousId !== "none") {
    await request(`${userUrl}/${encodeURIComponent(previousId)}`, { method: "POST" });
    if (await linkedMenuId(lineUserId) !== previousId) throw new Error("Cannot confirm previous LINE menu");
  } else {
    await request(userUrl, { method: "DELETE" });
    if (await linkedMenuId(lineUserId)) throw new Error("Cannot confirm LINE menu unlink");
  }
  return { restored: true, alreadyRestored: false };
}
