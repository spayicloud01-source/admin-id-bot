import { callSheetsBridge } from "../../lib/sheetsBridge.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const query = "__ADMIN_ID_NO_MATCH__";
  const tests = [];

  async function run(name, payload, validate) {
    try {
      const result = await callSheetsBridge(payload);
      tests.push({ name, pass: Boolean(validate(result)) });
    } catch (error) {
      tests.push({ name, pass: false, error: error?.message || String(error) });
    }
  }

  await run("searchCustomer", { action: "searchCustomer", query }, (r) => r?.ok && Array.isArray(r.matches));
  await run("getCustomerInfo", { action: "getCustomerInfo", query }, (r) => r?.ok && Array.isArray(r.matches));
  await run("getHistory", { action: "getHistory", query }, (r) => r?.ok && Array.isArray(r.items));
  await run(
    "checkAccess-deny-unknown-user",
    { action: "checkAccess", lineUserId: "__NO_SUCH_USER__", permission: "ดูข้อมูลลูกค้า" },
    (r) => r?.ok && r.allowed === false
  );

  return res.status(tests.every((t) => t.pass) ? 200 : 500).json({
    ok: tests.every((t) => t.pass),
    tests,
  });
}
