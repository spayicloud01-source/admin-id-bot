/**
 * Pure, side-effect-free parser for Admin ID LINE binding requests.
 * Must be used in signed incoming LINE events only when deciding whether to
 * auto-bind/enqueue, never as a substitute for verifying actor permissions.
 */
const PENDING = /^(?:รายการรอผูก|รอผูก|ผูกรอ)$/u;
const APPROVE = /^ผูกคิว\s+([a-f0-9-]{8,40})\s+(\S+)\s+(.+)$/iu;
const CUSTOMER_INPUT = /^(?:ผูกบัญชี\s+)?(\S+)\s+(.+)$/u;
const CUSTOMER_NO_SPACE = /^(?:ผูกบัญชี\s*)?(\d{2,5}(?:-\d{1,5})?)([ก-๙].+)$/u;

export function parseCustomerBindingInput(text) {
  const raw = String(text ?? '').trim();
  const withSpace = raw.match(CUSTOMER_INPUT);
  const separatedQueueIsValid = withSpace && /^[\dA-Za-z-]{2,24}$/.test(withSpace[1]);
  const withoutSpace = separatedQueueIsValid ? null : raw.match(CUSTOMER_NO_SPACE);
  const m = separatedQueueIsValid ? withSpace : withoutSpace;
  if (!m) return null;
  const queue = m[1].trim();
  const name = m[2].trim().replace(/\s+/g, ' ');
  if (!/^[\dA-Za-z-]{2,24}$/.test(queue) || name.length < 2 || name.length > 120) return null;
  if (/^(?:รายการรอผูก|ผูกรอ)$/u.test(queue)) return null;
  // Without a separator, only accept a Thai first-and-last name; this avoids
  // interpreting short customer service commands (e.g. 310-8ยอดปิด) as identities.
  if (withoutSpace && !/^[ก-๙]+(?:\s+[ก-๙]+)+$/u.test(name)) return null;
  return { queue, name };
}

export function parseAdminBindingCommand(text) {
  const raw = String(text ?? '').trim();
  if (PENDING.test(raw)) return { kind: 'list' };
  const m = raw.match(APPROVE);
  if (!m) return null;
  const requestId = m[1].toLowerCase();
  const customer = parseCustomerBindingInput(`${m[2]} ${m[3]}`);
  return customer ? { kind: 'approve', requestId, ...customer } : null;
}

