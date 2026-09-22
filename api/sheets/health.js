export default async function handler(req, res) {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;

  if (!url) {
    return res.status(500).json({
      ok: false,
      error: "GOOGLE_APPS_SCRIPT_URL is not configured",
    });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      bridge: data,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: "Google Apps Script bridge request failed",
      detail: error.message,
    });
  }
}
