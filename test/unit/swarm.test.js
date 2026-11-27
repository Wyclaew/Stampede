import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeToIssues, trackDomGrowth, findSecretInText, sensitiveKeys, auditCookies } from '../../src/engine/detectors.js';
import { classifyElement, isAllowed, zoneOf, MODES } from '../../src/engine/safety.js';
import { resolvePersonas, PERSONAS } from '../../src/engine/personas.js';
import { buildCandidates, decide } from '../../src/engine/strategy.js';
import { tamperUrl } from '../../src/engine/actions-extra.js';
import { resolveCredentials } from '../../src/engine/session.js';
import { categoryScores } from '../../src/engine/issues.js';
import { createRng } from '../../src/engine/rng.js';

const el = (over) => ({ id: 'e1', tag: 'button', type: 'button', text: '', ariaLabel: '', name: '', elId: '', editable: false, inViewport: true, ...over });
const memory = () => ({ hits: new Map(), visited: new Set(), lastKind: null, actionsOnPage: 0, viewportShakenOn: new Set(), navCount: 0 });

test('third-party sign-in buttons are never allowed, in any mode', () => {
  for (const text of ['Google ile devam et', 'Continue with Google', 'Sign in with Apple', 'GitHub ile giriş']) {
    const c = classifyElement(el({ text }), 'http://localhost');
    assert.equal(c.category, 'oauth', text);
    for (const mode of Object.values(MODES)) assert.equal(isAllowed(c.category, mode), false);
  }
  const link = classifyElement(el({ tag: 'a', href: 'https://accounts.google.com/o/oauth2', absHref: 'https://accounts.google.com/o/oauth2', text: 'Devam' }), 'http://localhost');
  assert.equal(link.category, 'oauth');
});

test('zones: the attack map labels page regions', () => {
  assert.equal(zoneOf(el({ tag: 'input', type: 'password', editable: true })), 'auth');
  assert.equal(zoneOf(el({ text: 'Öde ₺240' })), 'checkout');
  assert.equal(zoneOf(el({ tag: 'input', type: 'search', editable: true })), 'search');
  assert.equal(zoneOf(el({ tag: 'a', text: 'Hakkımızda', href: '/a' })), 'nav');
});

test('personas: keyboard agent never uses the mouse, mobile agent rotates', () => {
  const elements = [el({ text: 'Öde ₺240', type: 'submit' }), el({ id: 'e2', tag: 'a', text: 'Ürünler', href: '/u', absHref: 'http://localhost/u' })];
  const params = (persona) => ({ elements, mode: MODES.chaos, origin: 'http://localhost', memory: memory(), pageKey: 'p', persona });
  const kb = buildCandidates(params(PERSONAS.keyboard));
  assert.ok(kb.length > 0);
  assert.ok(kb.every((c) => PERSONAS.keyboard.allow.includes(c.kind)), kb.map((c) => c.kind).join(','));
  assert.ok(!kb.some((c) => c.kind === 'rageClick' || c.kind === 'navigate'));
  assert.ok(buildCandidates(params(PERSONAS.mobile)).some((c) => c.kind === 'rotate'));
  assert.throws(() => resolvePersonas(['ninja']), /Bilinmeyen persona/);
  assert.deepEqual(resolvePersonas().map((p) => p.id), ['rage', 'keyboard', 'mobile', 'snoop']);
});

test('auth autopilot is proposed when a login form is on screen', () => {
  const { ranked } = decide(
    { elements: [], snapshot: { auth: { kind: 'login', passwords: ['p1'] }, hiddenInputs: 0, storageKeys: 0 }, mode: MODES.chaos, origin: 'http://localhost', memory: memory(), pageKey: 'p', persona: PERSONAS.rage },
    createRng(1),
  );
  assert.equal(ranked[0].kind, 'login');
  assert.ok(Math.abs(ranked.reduce((s, c) => s + c.p, 0) - 1) < 1e-9, 'probabilities sum to 1');
});

test('safe mode: snoop never gets a transactional move', () => {
  const c = buildCandidates({ elements: [el({ text: 'Siparişi tamamla' })], mode: MODES.safe, origin: 'http://localhost', memory: memory(), pageKey: 'p', persona: PERSONAS.rage });
  assert.ok(!c.some((x) => x.kind === 'twinTab' || x.kind === 'offlineBurst' || (x.el && x.el.text === 'Siparişi tamamla')));
});

test('URL tampering swaps the first number for a hostile neighbour', () => {
  const first = (list) => list[0];
  assert.equal(tamperUrl('http://x.test/orders/104', first), 'http://x.test/orders/105');
  assert.equal(tamperUrl('http://x.test/#/product/7?tab=2', (l) => l[3]), 'http://x.test/#/product/-1?tab=2');
  assert.equal(tamperUrl('http://x.test/about', first), 'http://x.test/about?id=-1');
});

test('probe results become grouped, readable issues', () => {
  const r = {
    url: 'http://x.test/#/checkout',
    viewport: { width: 857, height: 1853 },
    overflow: { scrollWidth: 820, viewportWidth: 375, culprits: [{ id: 'p1', desc: 'div.promo', text: 'Kargo bedava', by: 445, rect: {} }] },
    obscured: [],
    garbage: [{ id: 'g1', desc: 'dd#total', token: 'NaN', text: '₺NaN', rect: {} }, { id: 'g2', desc: 'button#pay', token: 'NaN', text: 'Öde ₺NaN', rect: {} }],
    spinners: [],
    blank: false,
    longTasks: [{ d: 1100, t: 10 }],
    shifts: [{ v: 0.08, t: 1 }, { v: 0.07, t: 2 }],
  };
  const issues = probeToIssues(r, 'test', { width: 375, height: 667 });
  const types = issues.map((i) => i.type).sort();
  assert.deepEqual(types, ['garbage-render', 'layout-overflow', 'layout-shift', 'ui-freeze']);
  assert.match(issues.find((i) => i.type === 'layout-overflow').detail, /375×667/);
  assert.equal(issues.filter((i) => i.type === 'garbage-render').length, 1, 'same token on one screen is one issue');
});

test('DOM growth is flagged only when it keeps climbing', () => {
  let trend = {};
  let leak = null;
  for (const n of [900, 1200, 1500, 1800, 2100, 2400]) [trend, leak] = trackDomGrowth(trend, 'p', n);
  assert.equal(leak && leak.type, 'dom-leak');
  trend = {};
  for (const n of [2000, 2100, 1900, 2000, 2100, 2000]) [trend, leak] = trackDomGrowth(trend, 'p', n);
  assert.equal(leak, null);
});

test('secrets in console text and sensitive keys in API payloads', () => {
  const creds = { password: 'Stp-1-Aa!9' };
  assert.equal(findSecretInText('auth attempt {"password":"Stp-1-Aa!9"}', creds), 'test hesabının şifresi');
  assert.equal(findSecretInText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefgh', null), 'JWT');
  assert.equal(findSecretInText('Sepete eklendi', creds), null);
  assert.deepEqual(sensitiveKeys({ id: 1, email: 'a@b', passwordHash: 'x', profile: { cvv: '123' } }).sort(), ['cvv', 'passwordHash']);
  assert.deepEqual(sensitiveKeys([{ name: 'ok' }]), []);
});

test('cookie audit flags readable session cookies', () => {
  const issues = auditCookies(
    [
      { name: 'session', domain: 'localhost', httpOnly: false, secure: false, sameSite: 'Lax' },
      { name: 'theme', domain: 'localhost', httpOnly: false, secure: false, sameSite: 'Lax' },
      { name: 'sid', domain: 'other.com', httpOnly: false, secure: false, sameSite: 'Lax' },
    ],
    'http://localhost:7500/',
  );
  assert.deepEqual(issues.map((i) => i.fingerprint), ['cookie|session']);
  assert.equal(auditCookies([{ name: 'pref', domain: 'shop.com', httpOnly: true, secure: false, sameSite: 'None' }], 'https://shop.com/').length, 1);
});

test('test identity: generated when not given, password never reused in sign-up emails', () => {
  const gen = resolveCredentials(undefined, 42, {});
  assert.equal(gen.email, 'stampede+42@example.test');
  assert.equal(gen.generated, true);
  assert.equal(gen.signupEmail('A1'), 'stampede+42+a1-1@example.test');
  const given = resolveCredentials({ email: 'qa@shop.test', password: 'x' }, 1, {});
  assert.equal(given.generated, false);
  assert.equal(resolveCredentials(undefined, 1, { STAMPEDE_EMAIL: 'env@x.test', STAMPEDE_PASSWORD: 'envpw' }).password, 'envpw');
});

test('category scores penalise only their own issue types', () => {
  const cats = categoryScores([{ type: 'double-submit', severity: 'critical' }, { type: 'focus-invisible', severity: 'medium' }]);
  const by = Object.fromEntries(cats.map((c) => [c.id, c.score]));
  assert.equal(by.race, 60);
  assert.equal(by.access, 92);
  assert.equal(by.security, 100);
});
