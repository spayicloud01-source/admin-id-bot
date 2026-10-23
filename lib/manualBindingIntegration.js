/**
 * Admin ID LINE webhook integration adapter for Manual Binding V5.
 * The caller MUST verify the LINE HMAC signature against the exact raw request
 * before invoking either exported function. Never use untrusted request text to
 * supply LINE actor IDs. This module has no external side effects by itself.
 */
import {
  parseAdminBindingCommand,
  parseCustomerBindingInput,
  handleAdminManualBinding,
  queueFailedCustomerBinding,
} from './manualBinding.js';

function incomingTextFromVerifiedIndividual(event, signatureVerified) {
  if (signatureVerified !== true || event?.type !== 'message' || event.message?.type !== 'text') return null;
  if (event.source?.type !== 'user') return null;
  const actorLineId = event.source.userId;
  if (!/^U[a-f\d]{32}$/i.test(String(actorLineId || ''))) return null;
  return { actorLineId, text: String(event.message.text || '').trim() };
}

/** Place BEFORE the old staff command parser, AFTER verified LINE signature. */
export async function tryAdminManualBindingEvent({event, signatureVerified, bridge, replyStaff, replyStaffFlex, pushCustomer}) {
  const message = incomingTextFromVerifiedIndividual(event, signatureVerified);
  if (!message || !parseAdminBindingCommand(message.text)) return {handled:false};
  if (typeof bridge !== 'function' || typeof replyStaff !== 'function') throw Error('Admin binding adapters not connected');
  return handleAdminManualBinding({text:message.text,actorLineId:message.actorLineId,bridge,replyStaff,replyStaffFlex,pushCustomer});
}

/** Place ONLY AFTER old auto-binding has truly failed, and before replying. */
export async function tryEnqueueFailedAutoBind({event, signatureVerified, autoAttempted, autoSucceeded, bridge, replyCustomer, notifyStaff}) {
  const message = incomingTextFromVerifiedIndividual(event, signatureVerified);
  if (!message || autoAttempted !== true || autoSucceeded !== false) return {handled:false};
  if (!parseCustomerBindingInput(message.text)) return {handled:false};
  if (typeof bridge !== 'function' || typeof replyCustomer !== 'function') throw Error('Customer binding adapters not connected');
  return queueFailedCustomerBinding({customerLineId:message.actorLineId,text:message.text,bridge,replyCustomer,notifyStaff});
}
