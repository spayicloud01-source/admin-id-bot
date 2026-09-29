function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeGoogleHtml(text) {
  const s = String(text || "").trim().toLowerCase();
  return s.startsWith("<!doctype html") || s.startsWith("<html") || s.includes("<body");
}

const PAYMENT_BRIDGE_ACTIONS = new Set([
  "queuePayment", "queueSlipReview", "queueClose",
  "listReviewQueue", "getReviewQueueItem", "cancelReviewQueue",
  "planSourceWrite", "resolveReviewQueue", "rollbackReviewQueue",
  "rememberSlipMessage", "rememberRecentImage", "getRecentIdentityImages",
]);

const NOTIFY_BRIDGE_ACTIONS = new Set([
  "installReminderTrigger", "getReminderTriggerStatus",
  "getReminderBatch", "markReminderSent",
  "getCustomerReminderBatch", "markCustomerReminderSent",
  "listCustomerNotificationSheets", "setCustomerAutoReminderSheet",
  "buildCustomerNotificationBatch", "resolveCustomerNotificationRecipient",
  "getCustomerContactRecipients", "getStaffSlipRecipients",
]);

export function bridgeRoleForAction(action, payload = null) {
  const name = String(action || "").trim();
  if (name === "searchCustomer" && payload?.paymentLookup === true) return "payment";
  if (PAYMENT_BRIDGE_ACTIONS.has(name)) return "payment";
  if (NOTIFY_BRIDGE_ACTIONS.has(name)) return "notify";
  return "customer";
}

function bridgeEndpointForAction(action, payload) {
  const role = bridgeRoleForAction(action, payload);
  const suffix = role.toUpperCase();
  const dedicatedUrl = process.env[`GOOGLE_APPS_SCRIPT_${suffix}_URL`];
  const dedicatedSecret = process.env[`GOOGLE_APPS_SCRIPT_${suffix}_SECRET`];

  return {
    role,
    baseUrl: dedicatedUrl || process.env.GOOGLE_APPS_SCRIPT_URL,
    secret: dedicatedSecret || process.env.SHEETS_BRIDGE_SECRET,
    dedicated: Boolean(dedicatedUrl),
  };
}

export function getBridgeRoutingStatus() {
  return {
    customer: Boolean(process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_URL),
    payment: Boolean(process.env.GOOGLE_APPS_SCRIPT_PAYMENT_URL),
    notify: Boolean(process.env.GOOGLE_APPS_SCRIPT_NOTIFY_URL),
    customerSecret: Boolean(process.env.GOOGLE_APPS_SCRIPT_CUSTOMER_SECRET),
    paymentSecret: Boolean(process.env.GOOGLE_APPS_SCRIPT_PAYMENT_SECRET),
    notifySecret: Boolean(process.env.GOOGLE_APPS_SCRIPT_NOTIFY_SECRET),
    legacyFallback: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL),
    sharedSecret: Boolean(process.env.SHEETS_BRIDGE_SECRET),
  };
}

async function callSheetsBridgeNetwork(payload, allowNotOkResult = false) {
  const action = String(payload?.action || "unknown");
  const endpoint = bridgeEndpointForAction(action, payload);
  const { role, baseUrl, secret, dedicated } = endpoint;

  if (!baseUrl) throw new Error(`Google Apps Script URL is not configured for ${role}`);
  if (!secret) throw new Error(`Sheets bridge secret is not configured for ${role}`);

  let lastError;
  const customerRead = action === "getCustomerSelf";
  const customerBinding = action === "requestCustomerBinding";
  const financialQueue = ["queuePayment", "queueSlipReview", "queueClose"].includes(action);
  const paymentLookup = action === "searchCustomer" && payload?.paymentLookup === true;
  const paymentApproval = action === "resolveReviewQueue";
  const accessCheck = action === "checkAccess";
  const auditLog = action === "logAction";
  const customerReminderRead = action === "getCustomerReminderBatch";
  const reminderRead = action === "getReminderBatch";
  const recipientLookup = action === "resolveCustomerNotificationRecipient";
  const slowAdminRead = [
    "getCalculatedSummary", "getCustomerInfo", "listDueCustomers",
    "dailyOwnerReport", "systemStatus", "auditSourceSchemas",
    "auditSourceWriteCapabilities"
  ].includes(action);
  const reminderWrite = ["markCustomerReminderSent", "markReminderSent"].includes(action);
  const mutation = [
    "addNote", "resolveReviewQueue", "cancelReviewQueue", "rollbackReviewQueue",
    "approveStaff", "rejectStaff", "setStaffEnabled", "setStaffPermission",
    "installReminderTrigger", "setBotSwitch", "setCustomerAutoReminderSheet",
    "resolveCustomerBinding", "cancelCustomerBindings",
    "markCustomerReminderSent", "markReminderSent", "buildCustomerNotificationBatch"
  ].includes(action);

  // Read-only access/payment lookup may retry once when Google temporarily returns HTML/404.
  // Financial writes and approval-sensitive actions stay single-attempt to avoid duplicates.
  const maxAttempts = auditLog ? 1
    : slowAdminRead ? 1
    : customerReminderRead ? 2
    : reminderRead ? 1
    : accessCheck || paymentLookup ? 2
    : customerRead ? 2
    : customerBinding || financialQueue || paymentApproval || mutation ? 1
    : 2;
  const timeoutMs = auditLog ? 5000
    : customerRead ? 25000
    : recipientLookup ? 10000
    : action === "buildCustomerNotificationBatch" ? 50000
    : customerBinding ? 25000
    : financialQueue ? 50000
    : paymentLookup ? 30000
    : paymentApproval ? 45000
    : reminderWrite ? 35000
    : slowAdminRead ? 50000
    : action === "getReminderBatch" ? 50000
    : action === "getCustomerReminderBatch" ? 30000
    : accessCheck ? 30000
    : 20000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const url = `${baseUrl}${sep}_t=${Date.now()}&attempt=${attempt}`;

      const controller = new AbortController();
      const startedAt = Date.now();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      console.info("Sheets bridge timing", {
        action,
        role,
        dedicated,
        attempt,
        status: response.status,
        ms: Date.now() - startedAt,
      });

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        if (looksLikeGoogleHtml(text) && attempt < maxAttempts) {
          lastError = new Error("Apps Script returned temporary Google HTML");
          await sleep(attempt * 600);
          continue;
        }
        throw new Error(`Invalid Apps Script response: ${text.slice(0, 200)}`);
      }

      if (!response.ok || (!data?.ok && !allowNotOkResult)) {
        const message = data?.error || `Apps Script error: ${response.status}`;
        if (attempt < maxAttempts && (response.status >= 500 || /temporar|try again|service/i.test(message))) {
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

      console.warn("Sheets bridge attempt failed", {
        action,
        role,
        dedicated,
        attempt,
        ms: timeoutMs,
        error: String(error?.message || error).slice(0, 120),
      });
      if (!retryable || attempt >= maxAttempts) break;
      await sleep(attempt * 600);
    }
  }

  throw lastError || new Error("Apps Script bridge failed");
}

const BRIDGE_READ_CACHE = new Map();
const BRIDGE_INFLIGHT = new Map();

function bridgeReadTtlMs(action) {
  if (action === "getBridgeVersion") return 30000;
  if (action === "postDeploySelfTest") return 15000;
  return 0;
}

function shouldCoalesceBridgeRead(action) {
  return [
    "checkAccess", "getBridgeVersion", "postDeploySelfTest",
    "getHistory", "listReviewQueue", "getCalculatedSummary",
    "getCustomerInfo", "listDueCustomers"
  ].includes(action);
}

function bridgeReadKey(payload) {
  const entries = Object.keys(payload || {})
    .filter((key) => key !== "secret")
    .sort()
    .map((key) => [key, payload[key]]);
  return JSON.stringify(entries);
}

function getBridgeReadCache(key, ttlMs) {
  if (!ttlMs) return null;
  const hit = BRIDGE_READ_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    BRIDGE_READ_CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function trimBridgeReadCache() {
  while (BRIDGE_READ_CACHE.size > 100) {
    const first = BRIDGE_READ_CACHE.keys().next().value;
    if (!first) break;
    BRIDGE_READ_CACHE.delete(first);
  }
}

export async function callSheetsBridge(payload) {
  const action = String(payload?.action || "unknown");
  const ttlMs = bridgeReadTtlMs(action);
  const coalesce = shouldCoalesceBridgeRead(action);
  if (!coalesce) return callSheetsBridgeNetwork(payload, false);

  const key = bridgeReadKey(payload);
  const cached = getBridgeReadCache(key, ttlMs);
  if (cached) {
    console.info("Sheets bridge cache hit", { action });
    return cached;
  }

  const pending = BRIDGE_INFLIGHT.get(key);
  if (pending) {
    console.info("Sheets bridge coalesced", { action });
    return pending;
  }

  const promise = callSheetsBridgeNetwork(payload, action === "postDeploySelfTest")
    .then((data) => {
      if (ttlMs) {
        BRIDGE_READ_CACHE.set(key, { at: Date.now(), value: data });
        trimBridgeReadCache();
      }
      return data;
    })
    .finally(() => {
      BRIDGE_INFLIGHT.delete(key);
    });

  BRIDGE_INFLIGHT.set(key, promise);
  return promise;
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
      (m.source && m.queue) ? `เลือกตรงนี้: ${m.source}:${m.queue}` : null,
      m.sheet ? `ชีต ${m.sheet}` : null,
    ].filter(Boolean);

    return parts.join("\n");
  });

  if (matches.length > 5) {
    rows.push(`พบทั้งหมด ${matches.length} รายการ แสดง 5 รายการแรก`);
  }

  return rows.join("\n\n");
}
