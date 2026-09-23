function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeGoogleHtml(text) {
  const s = String(text || "").trim().toLowerCase();
  return s.startsWith("<!doctype html") || s.startsWith("<html") || s.includes("<body");
}

export async function callSheetsBridge(payload) {
  const baseUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.SHEETS_BRIDGE_SECRET;

  if (!baseUrl) throw new Error("GOOGLE_APPS_SCRIPT_URL is not configured");
  if (!secret) throw new Error("SHEETS_BRIDGE_SECRET is not configured");

  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const url = `${baseUrl}${sep}_t=${Date.now()}&attempt=${attempt}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 55000);

      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify({
            ...payload,
            secret,
          }),
          redirect: "follow",
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        if (looksLikeGoogleHtml(text) && attempt < 3) {
          lastError = new Error("Apps Script returned temporary Google HTML");
          await sleep(attempt * 600);
          continue;
        }
        throw new Error(`Invalid Apps Script response: ${text.slice(0, 200)}`);
      }

      if (!response.ok || !data?.ok) {
        const message = data?.error || `Apps Script error: ${response.status}`;
        if (attempt < 3 && (response.status >= 500 || /temporar|try again|service/i.test(message))) {
          lastError = new Error(message);
          await sleep(attempt * 600);
          continue;
        }
        throw new Error(message);
      }

      return data;
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "AbortError" ||
        /temporary google html|invalid apps script response|fetch failed|timeout/i.test(
          String(error?.message || error)
        );

      if (!retryable || attempt >= 3) break;
      await sleep(attempt * 600);
    }
  }

  throw lastError || new Error("Apps Script bridge failed");
}

export function formatCustomerMatches(matches = []) {
  if (!matches.length) return "ไม่พบข้อมูลลูกค้า";

  const rows = matches.slice(0, 5).map((m, i) => {
    const parts = [
      `${i + 1}. ${m.name || "-"}`,
      m.queue ? `คิว ${m.queue}` : null,
      m.phone ? `โทร ${m.phone}` : null,
      m.appleId ? `Apple ID ${m.appleId}` : null,
      m.source ? `แหล่ง ${m.source}` : null,
      m.sheet ? `ชีต ${m.sheet}` : null,
    ].filter(Boolean);

    return parts.join("\n");
  });

  if (matches.length > 5) {
    rows.push(`พบทั้งหมด ${matches.length} รายการ แสดง 5 รายการแรก`);
  }

  return rows.join("\n\n");
}
