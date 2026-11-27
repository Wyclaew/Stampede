// Safety modes and element risk classification.
// The ghost never needs the target's source code: every decision here is made
// from what a real user would see (text, roles, hrefs, form semantics).

export const MODES = Object.freeze({
  safe: Object.freeze({
    id: 'safe',
    label: 'Güvenli Keşif',
    allowMutations: false, // non-GET requests are aborted at the network layer
    allowTransactional: false, // pay / submit / order buttons are never clicked
    allowDestructive: false,
    allowSensitiveInputs: false,
    burst: [2, 2],
    paceMs: [450, 800],
    typeDelayMs: 18,
    spinnerTimeoutMs: 9000,
    reload: false,
    offlineFlap: false,
    cpuThrottle: 1,
    maxPages: 25,
  }),
  chaos: Object.freeze({
    id: 'chaos',
    label: 'Tam Kaos',
    allowMutations: true,
    allowTransactional: true,
    allowDestructive: false,
    allowSensitiveInputs: false,
    burst: [2, 4],
    paceMs: [150, 350],
    typeDelayMs: 6,
    spinnerTimeoutMs: 6000,
    reload: true,
    offlineFlap: false,
    cpuThrottle: 1,
    maxPages: 60,
  }),
  stress: Object.freeze({
    id: 'stress',
    label: 'Stres / Yıkım',
    allowMutations: true,
    allowTransactional: true,
    allowDestructive: true,
    allowSensitiveInputs: true,
    burst: [4, 8],
    paceMs: [60, 160],
    typeDelayMs: 2,
    spinnerTimeoutMs: 6000,
    reload: true,
    offlineFlap: true,
    cpuThrottle: 4,
    maxPages: 100,
  }),
});

export function getMode(id) {
  const mode = MODES[id];
  if (!mode) throw new Error(`Bilinmeyen mod: "${id}". Geçerli modlar: ${Object.keys(MODES).join(', ')}`);
  return mode;
}

// Keyword lists are matched on lower-cased (tr-TR) text, so Turkish and English both work.
const DESTRUCTIVE = [
  'delete', 'remove', 'destroy', 'erase', 'deactivate', 'terminate', 'close account', 'unsubscribe',
  'log out', 'logout', 'sign out', 'signout', 'cancel subscription', 'reset password',
  'sil', 'kaldır', 'hesabı kapat', 'hesabımı kapat', 'çıkış', 'oturumu kapat', 'aboneliği iptal', 'iptal et',
];
const TRANSACTIONAL = [
  'pay', 'checkout', 'check out', 'purchase', 'buy', 'order', 'submit', 'send', 'confirm', 'subscribe',
  'register', 'sign up', 'signup', 'book', 'donate', 'place order', 'save', 'apply', 'add to cart', 'post', 'publish',
  'öde', 'ödeme', 'satın', 'sipariş', 'gönder', 'onayla', 'kaydol', 'abone', 'kayıt ol', 'rezervasyon',
  'tamamla', 'kaydet', 'sepete', 'uygula', 'yayınla', 'paylaş', 'başvur',
];
const AUTH = ['login', 'log in', 'sign in', 'signin', 'giriş', 'oturum aç'];

const SENSITIVE_AUTOCOMPLETE = /^(cc-|current-password|new-password|one-time-code)/;
const SENSITIVE_NAME = /(pass|parola|şifre|sifre|card|kart|cvv|cvc|iban|otp|ssn|tckn|tc_?kimlik)/i;

function includesAny(text, words) {
  return words.some((w) => text.includes(w));
}

function sameOrigin(href, origin) {
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Classify a discovered element descriptor.
 * @returns {{category: string, isCTA: boolean, reason: string}}
 */
export function classifyElement(el, origin) {
  const text = `${el.text || ''} ${el.ariaLabel || ''} ${el.name || ''} ${el.elId || ''}`.toLocaleLowerCase('tr-TR');
  const tag = el.tag;
  const type = el.type || '';

  if (tag === 'input' && type === 'file') return { category: 'skip', isCTA: false, reason: 'file input' };

  if (el.editable || tag === 'select') {
    const sensitive =
      type === 'password' || SENSITIVE_AUTOCOMPLETE.test(el.autocomplete || '') || SENSITIVE_NAME.test(`${el.name} ${el.elId}`);
    if (sensitive) return { category: 'sensitive-input', isCTA: false, reason: 'credential/payment field' };
    return { category: tag === 'select' ? 'select' : 'input', isCTA: false, reason: 'editable' };
  }

  if (tag === 'a' && el.href) {
    const href = el.href.trim().toLowerCase();
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return { category: 'skip', isCTA: false, reason: 'non-http link' };
    }
    if (el.download) return { category: 'skip', isCTA: false, reason: 'download link' };
    if (el.absHref && !sameOrigin(el.absHref, origin)) return { category: 'external', isCTA: false, reason: 'other origin' };
    if (includesAny(text, DESTRUCTIVE)) return { category: 'destructive', isCTA: false, reason: 'destructive keyword' };
    return { category: 'nav', isCTA: false, reason: 'same-origin link' };
  }

  if (includesAny(text, DESTRUCTIVE)) return { category: 'destructive', isCTA: false, reason: 'destructive keyword' };
  if (includesAny(text, AUTH)) return { category: 'transactional', isCTA: true, reason: 'auth action' };
  if (includesAny(text, TRANSACTIONAL)) return { category: 'transactional', isCTA: true, reason: 'transactional keyword' };
  if (type === 'submit' || (el.inForm && el.formMethod === 'post' && tag === 'button' && type !== 'button')) {
    return { category: 'transactional', isCTA: true, reason: 'form submit' };
  }
  if (type === 'checkbox' || type === 'radio' || el.role === 'checkbox' || el.role === 'switch') {
    return { category: 'toggle', isCTA: false, reason: 'toggle' };
  }
  return { category: 'neutral', isCTA: false, reason: 'plain control' };
}

export function isAllowed(category, mode) {
  switch (category) {
    case 'skip':
    case 'external':
      return false;
    case 'destructive':
      return mode.allowDestructive;
    case 'transactional':
      return mode.allowTransactional;
    case 'sensitive-input':
      return mode.allowSensitiveInputs;
    default:
      return true;
  }
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1|.*\.localhost|.*\.local|.*\.test|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export function isLocalUrl(url) {
  try {
    return LOCAL_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Production guard: mutating modes on a non-local host need an explicit opt-in.
 * Throws a user-facing (Turkish) error when the guard blocks the run.
 */
export function assertRunAllowed({ url, modeId, confirmLive }) {
  getMode(modeId);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Geçersiz URL: "${url}". Örnek: http://localhost:4500 veya https://biyom.co`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Sadece http:// ve https:// adresleri desteklenir.');
  }
  if (modeId !== 'safe' && !isLocalUrl(url) && !confirmLive) {
    throw new Error(
      `"${parsed.hostname}" canlı bir site gibi görünüyor. "${MODES[modeId].label}" modu gerçek istekler (sipariş, form, ödeme) gönderebilir. ` +
        'Güvenli Keşif modunu seçin ya da sitenin sahibi olduğunuzu onaylayın (dashboard onay kutusu / CLI --yes-live).',
    );
  }
  return true;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function isMutationMethod(method) {
  return !SAFE_METHODS.has(String(method).toUpperCase());
}

// Analytics / telemetry calls legitimately repeat; never flag them as double submits.
const TELEMETRY = /(google-analytics|googletagmanager|analytics|collect|beacon|telemetry|sentry|segment|mixpanel|hotjar|clarity|amplitude|posthog|doubleclick|facebook\.com\/tr|\/track|\/log(ging)?\b|\/rum|vitals)/i;
export function isTelemetryUrl(url) {
  return TELEMETRY.test(url);
}
