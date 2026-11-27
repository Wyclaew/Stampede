// Pure detectors: raw observations in, issue drafts out. No browser access here, so all of it is unit-testable.
import { normalizePath } from './issues.js';

const CLS_THRESHOLD = 0.1;
const LEAK_MIN_NODES = 1500;
const LEAK_GROWTH = 1.6;
const LEAK_SAMPLES = 6;

/** Turn one in-page probe result into issue drafts. */
export function probeToIssues(r, reason, viewport) {
  const out = [];
  const path = normalizePath(r.url);
  const v = viewport || r.viewport;
  const vp = `${v.width}×${v.height}`;
  if (r.overflow && r.overflow.culprits.length) {
    const c = r.overflow.culprits[0];
    const extra = r.overflow.scrollWidth - r.overflow.viewportWidth;
    out.push({
      type: 'layout-overflow',
      severity: extra > 80 ? 'high' : 'medium',
      fingerprint: `overflow|${c.desc}`,
      detail: `${vp} ekranda sayfa ${extra}px sağa taşıyor; yatay kaydırma çıkıyor. Taşan eleman: ${c.desc}${c.text ? ` (“${c.text.slice(0, 40)}”)` : ''}.`,
      evidence: r.overflow.culprits
        .map((x) => `${x.desc} ekranın ${x.by}px dışına çıkıyor`)
        .concat([`document.scrollWidth=${r.overflow.scrollWidth}, viewport=${r.overflow.viewportWidth}`, reason ? `tetik: ${reason}` : null].filter(Boolean)),
      elementId: c.id,
      rect: c.rect,
    });
  }
  for (const o of r.obscured) {
    out.push({
      type: 'obscured-element',
      severity: o.cta ? 'high' : 'medium',
      fingerprint: `obscured|${o.text || o.desc}|${o.coverer.desc}`,
      detail: `“${o.text || o.desc}” elemanının üstünü ${o.coverer.desc}${o.coverer.text ? ` (“${o.coverer.text.slice(0, 30)}”)` : ''} kapatıyor (${vp}); kullanıcı ona tıklayamıyor.`,
      evidence: [`kapanan: ${o.desc}`, `kapatan: ${o.coverer.desc}`],
      elementId: o.id,
      rect: o.rect,
    });
  }
  const byToken = new Map();
  for (const g of r.garbage) byToken.set(g.token, [...(byToken.get(g.token) || []), g]);
  for (const [token, list] of byToken) {
    const texts = [...new Set(list.map((x) => `“${x.text}”`))].slice(0, 4).join(', ');
    out.push({
      type: 'garbage-render',
      severity: list.some((x) => /[₺$€£]|\d/.test(x.text)) ? 'high' : 'medium',
      fingerprint: `garbage|${token}|${path}`,
      detail: `Ekranda ${list.length} yerde ham “${token}” değeri görünüyor: ${texts}.`,
      evidence: list.map((x) => `${x.desc}: “${x.text}”`),
      elementId: list[0].id,
      rect: list[0].rect,
      token,
    });
  }
  for (const s of r.spinners) {
    out.push({
      type: 'stuck-spinner',
      severity: 'high',
      fingerprint: `spinner|${s.desc}`,
      detail: `${s.desc}${s.text ? ` (“${s.text.slice(0, 30)}”)` : ''} ${(s.ageMs / 1000).toFixed(0)} saniyedir ekranda dönüyor.`,
      evidence: [`${s.desc} görünür süre: ${s.ageMs} ms`],
      elementId: s.id,
      rect: s.rect,
    });
  }
  if (r.blank) {
    out.push({ type: 'blank-screen', severity: 'high', fingerprint: `blank|${path}`, detail: `${path} sayfası boş görünüyor.`, evidence: ['body metni boş, görsel yok'] });
  }
  const worst = (r.longTasks || []).reduce((m, t) => Math.max(m, t.d), 0);
  if (worst >= 500) {
    out.push({
      type: 'ui-freeze',
      severity: worst >= 2000 ? 'high' : 'medium',
      fingerprint: `freeze|${path}`,
      detail: `Ana thread ${worst} ms boyunca kilitlendi; bu sürede sayfa tepkisizdi.`,
      evidence: r.longTasks.filter((t) => t.d >= 200).slice(0, 5).map((t) => `long task ${t.d} ms @${t.t} ms`),
    });
  }
  const cls = (r.shifts || []).reduce((s, x) => s + x.v, 0);
  if (cls >= CLS_THRESHOLD) {
    out.push({
      type: 'layout-shift',
      severity: cls >= 0.25 ? 'high' : 'medium',
      fingerprint: `cls|${path}`,
      detail: `İçerik kullanıcı bir şey yapmadan kaydı (CLS ${cls.toFixed(2)}; iyi değer < 0.1).`,
      evidence: r.shifts.slice(0, 5).map((x) => `layout-shift ${x.v} @${x.t} ms`),
    });
  }
  return out;
}

/** Track DOM size per screen and flag steady growth. Returns [nextTrend, issueDraft|null]. */
export function trackDomGrowth(trend, pageKey, nodeCount) {
  const series = [...((trend && trend[pageKey]) || []), nodeCount].slice(-12);
  const next = { ...(trend || {}), [pageKey]: series };
  if (series.length < LEAK_SAMPLES) return [next, null];
  const window = series.slice(-LEAK_SAMPLES);
  const monotonic = window.every((v, i) => i === 0 || v >= window[i - 1]);
  const first = window[0];
  const last = window[window.length - 1];
  if (!monotonic || last < LEAK_MIN_NODES || last < first * LEAK_GROWTH) return [next, null];
  return [
    next,
    {
      type: 'dom-leak',
      severity: 'medium',
      fingerprint: `leak|${normalizePath(pageKey)}`,
      detail: `Aynı ekranda DOM eleman sayısı ${first} → ${last} oldu ve hiç düşmedi; elemanlar temizlenmiyor.`,
      evidence: [`son ölçümler: ${window.join(' → ')}`],
    },
  ];
}

const SECRET_PATTERNS = [
  ['JWT', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/],
  ['Bearer token', /Bearer\s+[A-Za-z0-9._-]{16,}/],
  ['şifre alanı', /(password|passwd|şifre|parola)["']?\s*[:=]\s*["']?[^\s"',}]{3,}/i],
  ['API anahtarı', /(api[_-]?key|secret|access[_-]?token)["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/i],
  ['kart numarası', /\b(?:\d[ -]?){15,16}\b/],
];

/** Does a console line expose secrets? Also catches the run's own test password. */
export function findSecretInText(text, credentials) {
  const s = String(text);
  if (credentials && credentials.password && s.includes(credentials.password)) return 'test hesabının şifresi';
  for (const [label, rx] of SECRET_PATTERNS) if (rx.test(s)) return label;
  return null;
}

const SENSITIVE_KEY = /^(password|passwd|pass|password_?hash|pwd|secret|client_?secret|ssn|tckn|credit_?card|card_?number|cvv|cvc|private_?key)$/i;

/** Keys in a JSON payload that should never reach the browser. */
export function sensitiveKeys(json, limit = 5) {
  const found = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6 || found.size >= limit) return;
    if (Array.isArray(v)) {
      v.slice(0, 20).forEach((x) => walk(x, depth + 1));
      return;
    }
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEY.test(k) && val !== null && val !== '') found.add(k);
      walk(val, depth + 1);
    }
  };
  walk(json, 0);
  return [...found];
}

const SESSION_COOKIE = /(sess|sid|token|auth|jwt|login|remember)/i;

/** Audit cookies set by the target. */
export function auditCookies(cookies, targetUrl) {
  const u = new URL(targetUrl);
  const https = u.protocol === 'https:';
  const out = [];
  for (const c of cookies) {
    const domain = c.domain.replace(/^\./, '');
    if (!u.hostname.endsWith(domain) && !domain.endsWith(u.hostname)) continue;
    const problems = [];
    if (SESSION_COOKIE.test(c.name) && !c.httpOnly) problems.push('HttpOnly yok (JavaScript okuyabilir)');
    if (https && !c.secure) problems.push('Secure yok (şifresiz bağlantıda gönderilir)');
    if (c.sameSite === 'None' && !c.secure) problems.push('SameSite=None ama Secure yok');
    if (!problems.length) continue;
    out.push({
      type: 'insecure-cookie',
      severity: SESSION_COOKIE.test(c.name) ? 'medium' : 'low',
      fingerprint: `cookie|${c.name}`,
      detail: `“${c.name}” çerezi: ${problems.join(', ')}.`,
      evidence: [`${c.name}; domain=${c.domain}; httpOnly=${c.httpOnly}; secure=${c.secure}; sameSite=${c.sameSite}`],
    });
  }
  return out;
}
