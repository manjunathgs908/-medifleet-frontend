// src/utils/welcomeResult.js
//
// What the "📲 Send WhatsApp" button on a call says after
// POST /api/calls/:id/send-welcome (medifleet-backend
// controllers/callController.js sendWelcome). The backend answers
//   { success, status, message?, reason?, code?, sentAt? }
// with status one of:
//   200 sent | already_sent_today   409 in_progress
//   400 not_mobile                  502 failed (reason + message)
// The customer's number is never in the response, and nothing here shows one.
//
// welcomeResult({ status, data } | { error }) -> { tone, text, done }
//   tone: 'success' | 'muted' | 'warn' | 'error'   (the text colour)
//   done: true once it was sent / already sent today — the button stays off.

const MAX_TEXT = 160;
const short = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1)}…` : t;
};

// Readable fallbacks when a failure comes without a message.
const REASONS = {
  template_not_approved: 'The WhatsApp template is not approved yet.',
  template_rejected    : 'WhatsApp rejected the template (header image).',
  image_url_missing    : 'The banner image is not set up on the server.',
  not_on_whatsapp      : 'This number is not on WhatsApp.',
  marketing_limit      : 'WhatsApp held it back (marketing limit) — try tomorrow.',
  opted_out            : 'The customer has stopped marketing messages.',
  rate_limited         : 'WhatsApp rate limit — try again in a few minutes.',
  auth                 : 'WhatsApp access token expired — tell the admin.',
  server_error         : 'Server error — try again.',
};

export function welcomeResult({ status: http, data, error } = {}) {
  // A thrown axios error: read its response if there was one.
  if (error) {
    if (!error.response) return { tone: 'error', text: 'Could not reach the server — check the connection and try again.', done: false };
    return welcomeResult({ status: error.response.status, data: error.response.data });
  }
  const s = data?.status;
  if (s === 'sent') return { tone: 'success', text: '✓ WhatsApp sent', done: true };
  if (s === 'already_sent_today') return { tone: 'muted', text: 'Already sent today', done: true };
  if (s === 'in_progress' || http === 409) return { tone: 'warn', text: 'Sending… try again shortly', done: false };
  if (s === 'not_mobile') return { tone: 'error', text: 'Not a mobile number', done: false };
  if (s === 'failed' || http >= 400) {
    const text = short(data?.message) || REASONS[data?.reason] || (data?.reason ? `Failed: ${data.reason}` : `Failed (HTTP ${http || '?'})`);
    return { tone: 'error', text, done: false };
  }
  return { tone: 'error', text: 'Unexpected reply from the server.', done: false };
}

export const TONE_COLOR = {
  success: 'var(--accent)', // the CRM's "green" (StatCard / Badge)
  muted  : 'var(--text3)',
  warn   : 'var(--amber)',
  error  : 'var(--red)',
};
