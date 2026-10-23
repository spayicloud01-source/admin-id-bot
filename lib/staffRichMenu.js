import { STAFF_MENU_IMAGE } from "./staffMenuImage.js";

const API = "https://api.line.me/v2/bot";
const DATA = "https://api-data.line.me/v2/bot";
const PREFIX = "admin-id-staff-v7:";
const LEGACY_PREFIXES = [
  "admin-id-staff-v6:", "admin-id-staff-v5:", "admin-id-staff-v4:",
  "admin-id-staff-v3:", "admin-id-staff-v2:", "admin-id-payment-v1:",
];

async function request(url, options = {}, missing = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      ...options.headers,
    },
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Staff menu request failed: ${response.status}`);
  return response;
}

export function extendMenu(original) {
  const buttons = [
    ["รับยอด", "รับยอด"],
    ["ตัดต้น", "ตัดต้น"],
    ["ค่าปรับ", "รับค่าปรับ"],
    ["ปิดยอด", "ปิดยอด"],
  ];
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: PREFIX + (original?.richMenuId || ""),
    chatBarText: "เมนูรับยอด",
    areas: buttons.map(([label, text], index) => ({
      bounds: {
        x: (index % 2) * 1250,
        y: index < 2 ? 0 : 843,
        width: 1250,
        height: 843,
      },
      action: { type: "message", label, text },
    })),
  };
}

function originalMenuId(menu) {
  const prefix = LEGACY_PREFIXES.find((candidate) => menu?.name?.startsWith(candidate));
  return prefix ? menu.name.slice(prefix.length) : (menu?.richMenuId || "");
}

// Only the authenticated staff member's menu is changed. Customer menus and
// the default menu are never modified.
export async function syncStaffPaymentMenu(lineUserId, allowed) {
  const userUrl = `${API}/user/${encodeURIComponent(lineUserId)}/richmenu`;
  const linked = await request(userUrl, {}, true);
  const linkedId = linked ? (await linked.json()).richMenuId : "";
  let originalId = linkedId;
  if (!originalId) {
    const fallback = await request(`${API}/user/all/richmenu`, {}, true);
    originalId = fallback ? (await fallback.json()).richMenuId : "";
  }
  const original = originalId
    ? await (await request(`${API}/richmenu/${encodeURIComponent(originalId)}`)).json()
    : { richMenuId: "" };

  if (original.name?.startsWith(PREFIX)) {
    if (!allowed) {
      const restoreId = original.name.slice(PREFIX.length);
      if (restoreId) await request(`${userUrl}/${encodeURIComponent(restoreId)}`, { method: "POST" });
      else await request(userUrl, { method: "DELETE" });
    }
    return allowed;
  }
  if (!allowed) return false;

  const restoreId = originalMenuId(original);
  const definition = extendMenu({ ...original, richMenuId: restoreId });
  const list = await (await request(`${API}/richmenu/list`)).json();
  let id = list.richmenus?.find((menu) => menu.name === definition.name)?.richMenuId;
  if (!id) {
    const image = Buffer.from(STAFF_MENU_IMAGE, "base64");
    if (image.length > 1000000) throw new Error("Staff menu image exceeds LINE limit");
    id = (await (await request(`${API}/richmenu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(definition),
    })).json()).richMenuId;
    try {
      await request(`${DATA}/richmenu/${encodeURIComponent(id)}/content`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: image,
      });
    } catch (error) {
      await request(`${API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      throw error;
    }
  }
  await request(`${DATA}/richmenu/${encodeURIComponent(id)}/content`);
  await request(`${userUrl}/${encodeURIComponent(id)}`, { method: "POST" });
  return true;
}
