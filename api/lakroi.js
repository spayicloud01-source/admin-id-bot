const STORE_ENV = 'BLOB_STORE_ID';
const DATA_PATH = 'lakroi/data.json';

function storeId() {
  return String(process.env[STORE_ENV] || '').replace(/^store_/, '');
}
function authToken() {
  return process.env.VERCEL_OIDC_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
}
function blobUrl(pathname) {
  const id = storeId();
  if (!id) throw new Error('BLOB_STORE_ID missing');
  return `https://${id}.public.blob.vercel-storage.com/${pathname}`;
}
async function putBlob(pathname, body, contentType) {
  const id = storeId();
  const token = authToken();
  if (!id || !token) throw new Error('Blob credentials missing');
  const r = await fetch('https://vercel.com/api/blob/?pathname=' + encodeURIComponent(pathname), {
    method: 'PUT',
    headers: {
      authorization: 'Bearer ' + token,
      'x-api-version': '12',
      'x-vercel-blob-store-id': id,
      'x-vercel-blob-access': 'public',
      'x-allow-overwrite': '1',
      'x-content-type': contentType || 'application/octet-stream',
      'cache-control': 'no-store'
    },
    body
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error((data.error && data.error.message) || text || ('Blob HTTP ' + r.status));
  return data;
}
async function readState() {
  try {
    const r = await fetch(blobUrl(DATA_PATH) + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) return { bills: [], goal: 15000, updatedAt: null };
    if (!r.ok) throw new Error('Blob read failed ' + r.status);
    const j = await r.json();
    return {
      bills: Array.isArray(j.bills) ? j.bills : [],
      goal: Number(j.goal || 15000),
      updatedAt: j.updatedAt || null
    };
  } catch (e) {
    if (String(e && e.message || e).includes('404')) return { bills: [], goal: 15000, updatedAt: null };
    throw e;
  }
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const state = await readState();
      return json(res, 200, { ok: true, ...state });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const action = String(body.action || 'save');
    if (action === 'uploadImage') {
      const dataUrl = String(body.dataUrl || '');
      const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return json(res, 400, { ok: false, error: 'Invalid image' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 1400000) return json(res, 413, { ok: false, error: 'Image too large' });
      const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
      const safe = String(body.billId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || String(Date.now());
      const path = `lakroi/bills/${safe}-${Date.now()}.${ext}`;
      const result = await putBlob(path, buf, m[1]);
      return json(res, 200, { ok: true, url: result.url || blobUrl(path) });
    }
    if (action === 'save') {
      const bills = Array.isArray(body.bills) ? body.bills.slice(-2000) : [];
      const clean = bills.map(x => ({
        id: String(x.id || ''),
        createdAt: String(x.createdAt || ''),
        date: String(x.date || ''),
        branch: String(x.branch || ''),
        amount: Number(x.amount || 0),
        method: String(x.method || ''),
        note: String(x.note || '').slice(0, 500),
        photo: String(x.photo || '').slice(0, 2000)
      })).filter(x => x.id && x.date && x.amount >= 0);
      const state = { bills: clean, goal: Number(body.goal || 15000), updatedAt: new Date().toISOString() };
      await putBlob(DATA_PATH, JSON.stringify(state), 'application/json; charset=utf-8');
      return json(res, 200, { ok: true, updatedAt: state.updatedAt, count: clean.length });
    }
    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err && err.message || err) });
  }
}
