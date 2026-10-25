import { createHmac, randomUUID } from 'node:crypto';

export function bridgeConfigured() {
  return Boolean(process.env.LAKROI_BRIDGE_URL && process.env.LAKROI_BRIDGE_SECRET);
}
export async function callBridge(action, data = {}) {
  const url = new URL(process.env.LAKROI_BRIDGE_URL || 'https://invalid.local');
  if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw new Error('ตั้งค่า LAKROI_BRIDGE_URL ไม่ถูกต้อง');
  }
  const payload = JSON.stringify({ action, data, timestamp: Date.now(), nonce: randomUUID() });
  const signature = createHmac('sha256', process.env.LAKROI_BRIDGE_SECRET || '').update(payload).digest('hex');
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, signature }), cache: 'no-store', signal: AbortSignal.timeout(25000),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('ตัวเชื่อมชีตไม่ตอบกลับเป็นข้อมูล กรุณาตรวจ Deployment'); }
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || 'เชื่อมต่อชีตไม่สำเร็จ');
    error.status = result.code === 'CONFLICT' ? 409 : result.code === 'VALIDATION' ? 400 : 502;
    throw error;
  }
  return result;
}
