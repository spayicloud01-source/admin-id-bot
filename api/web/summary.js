import { callSheetsBridge } from "../../lib/sheetsBridge.js";
import { currentOwnerSessionFromRequest } from "../../lib/webAuth.js";

const summaryCache = new Map();
const SUMMARY_CACHE_MS = 90 * 1000;

/** Treat locked/awaiting-lock devices as separate statuses, not overdue debt.
 * This is intentionally status-only: never hide an active customer's overdue
 * entry just because their note or name happens to contain the word "ล็อค".
 */
export function isLockedCustomerStatus(value) {
  const text = String(value ?? "").toLocaleLowerCase("th-TH")
    .replace(/\s+/g,"").replace(/[()\[\]{}]/g,"");
  return text.split(/[,/|;]+/).some(part =>
    /^(?:สถานะ)?(?:รอ)?(?:ล็อค|ล็อก|lock|locked)(?:แล้ว|อยู่|เครื่อง)?$/iu.test(part)
  );
}

export function visibleDueItems(mode, items) {
  const named = (Array.isArray(items) ? items : []).filter(item =>
    String(item?.name || "").trim()
  );
  return mode === "overdue" ? named.filter(item => !isLockedCustomerStatus(item?.status)) : named;
}

// "ล็อค" is a completed lock status. "รอล็อค" is explicitly not included.
export function isFullyLockedCustomerStatus(value) {
  const text = String(value ?? "").toLocaleLowerCase("th-TH")
    .replace(/\s+/g,"").replace(/[()[\]{}]/g,"");
  return text.split(/[,/|;]+/).some(part =>
    /^(?:สถานะ)?(?:ล็อค|ล็อก|lock|locked)(?:แล้ว|อยู่|เครื่อง)?$/iu.test(part)
  ) && !/(?:^|[,/|;])(?:สถานะ)?(?:ปิด|ปิดแล้ว|ปิดยอด|ปิดบัญชี|ลบ|ลบแล้ว|ขาย|ขายแล้ว|โกง|ผ่อน|ผ่อนอยู่)(?:$|[,/|;])/u.test(text);
}

// Reuse the already deployed read-only, owner-only Customer GAS roster action.
// It supports customers who have NOT linked LINE and does not mutate Sheet data.
export async function listLockedCustomers(owner, bridge = callSheetsBridge) {
  const items = [], seen = new Set();
  let page = 0, complete = false;
  for (let i = 0; i < 22; i++) {
    const response = await bridge({
      action:"listAllCustomers", lineUserId:owner.sub,
      sourceType:"user", groupId:"", page
    });
    if (response?.ok !== true || !Array.isArray(response.items))
      throw new Error("ไม่สามารถโหลดทะเบียนสถานะล็อคได้");
    if (Array.isArray(response.errors) && response.errors.length)
      throw new Error("ข้อมูลสถานะล็อคจากชีตยังไม่ครบ");
    for (const row of response.items) {
      const source = String(row?.source ?? "").trim();
      const sheet = String(row?.sheet ?? "").trim();
      if (!new Set(["v1/v3|v3/10-69","v6|v6/10-69"])
        .has((source+"|"+sheet).toLowerCase())) continue;
      const queue = String(row?.queue ?? "").trim().slice(0,45);
      const name = String(row?.name ?? "").trim().slice(0,160);
      if (!queue || !name || !isFullyLockedCustomerStatus(row.status)) continue;
      const key = [source,sheet,row.row,queue].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        source, sheet, queue, name,
        dueDate:String(row.dueDate ?? "").trim().slice(0,80),
        fee:String(row.fee ?? "").trim().slice(0,50),
        status:String(row.status ?? "").trim().slice(0,70),
      });
    }
    if (response.nextPage == null) {
      if (response.complete !== true) throw new Error("ทะเบียนสถานะล็อคยังอ่านไม่ครบ");
      complete = true; break;
    }
    if (!Number.isInteger(response.nextPage) || response.nextPage <= page || response.nextPage > 99)
      throw new Error("เลขหน้าถัดไปของทะเบียนไม่ถูกต้อง");
    page = response.nextPage;
  }
  if (!complete) throw new Error("ข้อมูลสถานะล็อคมีหน้าข้อมูลเกินขีดจำกัด");
  return items;
}

function cachedMode(mode) {
  const hit = summaryCache.get(mode);
  if (!hit || Date.now() - hit.at > SUMMARY_CACHE_MS) return null;
  return hit.value;
}

function storeMode(mode, value) {
  summaryCache.set(mode, { at: Date.now(), value });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  try {
    const session = await currentOwnerSessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: "กรุณาเข้าเว็บผ่าน LINE OA ใหม่" });

    const mode = String(req.query?.mode || "").trim();
    if (["today","upcoming","overdue","deleted","pending_lock","sold","fraud","installment","locked"].includes(mode)) {
      // A locked customer list is restricted to the authenticated owner.
      const cacheKey = mode === "locked" ? mode+":"+session.sub : mode;
      const hit = cachedMode(cacheKey);
      if (hit) {
        res.setHeader("Cache-Control", "private, max-age=30");
        return res.status(200).json({ ...hit, cached: true });
      }

      const result = mode === "locked"
        ? { items: await listLockedCustomers(session), totalShown: 0 }
        : await callSheetsBridge({
            action: "listDueCustomers",
            lineUserId: session.sub,
            dueMode: mode,
          });
      const items = visibleDueItems(mode,result?.items);
      const value = {
        ok: true,
        mode,
        items,
        totalShown: mode === "overdue" || mode === "locked" ? items.length : Number(result?.totalShown || 0),
        message: result?.message || "",
      };
      storeMode(cacheKey, value);
      res.setHeader("Cache-Control", "private, max-age=30");
      return res.status(200).json(value);
    }

    const reminder = await callSheetsBridge({
      action: "getReminderBatch",
      lineUserId: session.sub,
    });

    return res.status(200).json({
      ok: true,
      summary: reminder?.digest ? {
        upcoming: Number(reminder.digest.upcomingCount || 0),
        today: Number(reminder.digest.todayCount || 0),
        overdue: Number(reminder.digest.overdueCount || 0),
        generatedAt: reminder.digest.generatedAt || null,
      } : null,
    });
  } catch (error) {
    if (String(req.query?.mode || "")) {
      return res.status(500).json({ ok: false, error: String(error?.message || error).slice(0, 180) });
    }
    return res.status(200).json({ ok: true, summary: null, warning: String(error?.message || error).slice(0, 180) });
  }
}
