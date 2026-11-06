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
    if (["today","upcoming","overdue","deleted","pending_lock","sold","fraud","installment"].includes(mode)) {
      const hit = cachedMode(mode);
      if (hit) {
        res.setHeader("Cache-Control", "private, max-age=30");
        return res.status(200).json({ ...hit, cached: true });
      }

      const result = await callSheetsBridge({
        action: "listDueCustomers",
        lineUserId: session.sub,
        dueMode: mode,
      });
      const items = visibleDueItems(mode,result?.items);
      const value = {
        ok: true,
        mode,
        items,
        totalShown: mode === "overdue" ? items.length : Number(result?.totalShown || 0),
        message: result?.message || "",
      };
      storeMode(mode, value);
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
