export async function callSheetsBridge(payload) {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.SHEETS_BRIDGE_SECRET;

  if (!url) throw new Error("GOOGLE_APPS_SCRIPT_URL is not configured");
  if (!secret) throw new Error("SHEETS_BRIDGE_SECRET is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      ...payload,
      secret,
    }),
    redirect: "follow",
    cache: "no-store",
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid Apps Script response: ${text.slice(0, 200)}`);
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Apps Script error: ${response.status}`);
  }

  return data;
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
