import { STAFF_MENU_IMAGE } from './staffMenuImage.js';

const API = 'https://api.line.me/v2/bot';
const DATA = 'https://api-data.line.me/v2/bot';
const PREFIX = 'admin-id-staff-v2:';
const LEGACY_PREFIX = 'admin-id-payment-v1:';
async function request(url, options = {}, missing = false) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, ...options.headers },
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Staff menu request failed: ${response.status}`);
  return response;
}

export function extendMenu(original) {
  const buttons = [
    ['รับชำระ', 'รับชำระ'], ['รับค่าปรับ', 'รับค่าปรับ'],
    ['คิวตรวจสอบ', 'คิวตรวจสอบ'], ['ค้นหาลูกค้า', 'ค้นลูกค้า'],
    ['สรุปยอดวันนี้', 'สรุปยอดวันนี้'], ['เปิดระบบ', null],
  ];
  const x = [0, 833, 1667, 2500];
  return { size: { width: 2500, height: 1686 }, selected: true,
    name: PREFIX + (original?.richMenuId || ''), chatBarText: 'เมนูเจ้าหน้าที่',
    areas: buttons.map(([label, text], i) => ({
      bounds: { x: x[i % 3], y: i < 3 ? 0 : 843, width: x[i % 3 + 1] - x[i % 3], height: 843 },
      action: text ? { type: 'message', label, text }
        : { type: 'uri', label, uri: 'https://admin-id-bot.vercel.app' },
    })) };
}

// Only per-user links are changed. Original menus, actions and the default remain intact.
export async function syncStaffPaymentMenu(lineUserId, allowed) {
  const userUrl = `${API}/user/${encodeURIComponent(lineUserId)}/richmenu`;
  const linked = await request(userUrl, {}, true);
  const linkedId = linked ? (await linked.json()).richMenuId : '';
  let originalId = linkedId;
  if (!originalId) {
    const fallback = await request(`${API}/user/all/richmenu`, {}, true);
    originalId = fallback ? (await fallback.json()).richMenuId : '';
  }
  const original = originalId
    ? await (await request(`${API}/richmenu/${encodeURIComponent(originalId)}`)).json()
    : { richMenuId: '' };
  if (original.name?.startsWith(PREFIX)) {
    if (!allowed) {
      const restoreId = original.name.slice(PREFIX.length);
      if (restoreId) await request(`${userUrl}/${encodeURIComponent(restoreId)}`, { method: 'POST' });
      else await request(userUrl, { method: 'DELETE' });
    }
    return allowed;
  }
  if (!allowed) return false;
  if (original.name?.startsWith(LEGACY_PREFIX)) original.richMenuId = original.name.slice(LEGACY_PREFIX.length);
  const definition = extendMenu(original);
  const list = await (await request(`${API}/richmenu/list`)).json();
  let id = list.richmenus?.find(menu => menu.name === definition.name)?.richMenuId;
  if (!id) {
    const image = Buffer.from(STAFF_MENU_IMAGE, 'base64');
    if (image.length > 1000000) throw new Error('Extended menu image exceeds LINE limit');
    id = (await (await request(`${API}/richmenu`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(definition),
    })).json()).richMenuId;
    try {
      await request(`${DATA}/richmenu/${encodeURIComponent(id)}/content`, {
        method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image,
      });
    } catch (error) {
      await request(`${API}/richmenu/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
      throw error;
    }
  }
  // Check image readiness before replacing the current user's link.
  await request(`${DATA}/richmenu/${encodeURIComponent(id)}/content`);
  await request(`${userUrl}/${encodeURIComponent(id)}`, { method: 'POST' });
  return true;
}

