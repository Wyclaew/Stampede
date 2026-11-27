import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster, MAX_AGENTS } from '../../src/engine/personas.js';
import { buildCandidates, applyAiHints } from '../../src/engine/strategy.js';
import { MODES } from '../../src/engine/safety.js';
import { checkRequestOrigin } from '../../src/server/index.js';
import { parseEnv } from '../../src/util/env.js';
import { tileLayout } from '../../src/util/desktop.js';
import { aiEnabled, planAttack, summarizeIssues, reviewScreenshot } from '../../src/ai/gemini.js';
import { PERSONAS } from '../../src/engine/personas.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});

test('roster: copies get unique ids, codes and colours', () => {
  const r = buildRoster(['rage', 'rage', 'snoop']);
  assert.deepEqual(r.map((x) => x.id), ['rage', 'rage-2', 'snoop']);
  assert.deepEqual(r.map((x) => x.code), ['A1', 'A2', 'A3']);
  assert.equal(new Set(r.map((x) => x.color)).size, 3);
  assert.equal(r[1].label, 'Öfkeli müşteri 2');
  assert.throws(() => buildRoster(Array(MAX_AGENTS + 1).fill('bot')), /en fazla/);
});

test('new personas: abandoner gets the abandon move, bot crawls', () => {
  const memory = { hits: new Map(), visited: new Set(), lastKind: null, actionsOnPage: 0, viewportShakenOn: new Set(), navCount: 0 };
  const elements = [
    { id: 'e1', tag: 'input', type: 'text', editable: true, text: 'Ad', name: 'ad', inViewport: true },
    { id: 'e2', tag: 'a', href: '/x', absHref: 'http://localhost/x', text: 'X', inViewport: true },
  ];
  const kinds = (p) => buildCandidates({ elements, mode: MODES.chaos, origin: 'http://localhost', memory, pageKey: 'p', persona: PERSONAS[p] }).map((c) => c.kind);
  assert.ok(kinds('abandoner').includes('abandonForm'));
  assert.ok(kinds('bot').includes('crawl'));
  assert.ok(!kinds('keyboard').includes('crawl'));
});

test('AI hints boost only matching candidates', () => {
  const cands = [
    { kind: 'rageClick', weight: 2, el: { text: 'Öde ₺240' } },
    { kind: 'rageClick', weight: 2, el: { text: 'Favori' } },
    { kind: 'viewport', weight: 1 },
  ];
  const out = applyAiHints(cands, [{ kind: 'rageClick', target: 'öde', index: 4 }]);
  assert.equal(out[0].weight, 10);
  assert.equal(out[0].ai, 4);
  assert.equal(out[1].weight, 2);
  assert.equal(applyAiHints(cands, null), cands);
});

test('local API: blocks foreign hosts, cross-site writes and non-JSON writes', () => {
  const req = (method, headers) => ({ method, headers: { host: 'localhost:7400', ...headers } });
  assert.equal(checkRequestOrigin(req('GET', {})), null);
  assert.match(checkRequestOrigin(req('GET', { host: 'evil.example:7400' })), /localhost/);
  assert.match(checkRequestOrigin(req('POST', { 'content-type': 'text/plain' })), /application\/json/);
  assert.match(checkRequestOrigin(req('POST', { 'content-type': 'application/json', origin: 'https://evil.example' })), /Başka bir site/);
  assert.equal(checkRequestOrigin(req('POST', { 'content-type': 'application/json; charset=utf-8', origin: 'http://localhost:7400' })), null);
  assert.equal(checkRequestOrigin(req('POST', { 'content-type': 'application/json' })), null);
});

test('.env parser handles quotes, comments and export', () => {
  const v = parseEnv('# c\nGEMINI_API_KEY="abc 123"\nexport STAMPEDE_EMAIL=qa@x.test # note\nEMPTY=\nbad line');
  assert.deepEqual(v, { GEMINI_API_KEY: 'abc 123', STAMPEDE_EMAIL: 'qa@x.test', EMPTY: '' });
});

test('window tiling: 2×2 for four, 4×2 for eight', () => {
  const screen = { x: 0, y: 30, width: 1600, height: 900 };
  const four = tileLayout(4, screen);
  assert.deepEqual(four.map((t) => [t.left, t.top]), [[0, 30], [800, 30], [0, 480], [800, 480]]);
  const eight = tileLayout(8, screen);
  assert.equal(eight[3].left, 1200);
  assert.equal(eight[4].top, 480);
});

const geminiReply = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

test('AI is off without a key and errors never contain the key', async () => {
  assert.equal(aiEnabled({}), false);
  process.env.GEMINI_API_KEY = 'SECRET-KEY-123';
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'key SECRET-KEY-123 invalid' } }) });
  await assert.rejects(planAttack({ page: {}, personas: [] }), (err) => {
    assert.ok(!err.message.includes('SECRET-KEY-123'));
    assert.match(err.message, /403/);
    return true;
  });
});

test('planner keeps only steps for known personas and allowed moves; key goes in a header', async () => {
  process.env.GEMINI_API_KEY = 'k';
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), headers: init.headers };
    return geminiReply({ summary: 'Kahve dükkânı', steps: [
      { persona: 'rage', kind: 'rageClick', target: 'Öde', reason: 'çift ödeme' },
      { persona: 'rage', kind: 'deleteAll', target: '', reason: 'izinsiz' },
      { persona: 'ninja', kind: 'rageClick', target: '', reason: 'bilinmeyen' },
    ] });
  };
  const plan = await planAttack({ page: { url: 'http://x' }, personas: [{ id: 'rage', label: 'R', moves: ['rageClick', 'type'] }] });
  assert.deepEqual(plan.steps.map((s) => s.kind), ['rageClick']);
  assert.equal(seen.headers['x-goog-api-key'], 'k');
  assert.ok(!seen.url.includes('key='), 'the key must not be in the URL');
});

test('unknown model falls back to an available flash model', async () => {
  process.env.GEMINI_API_KEY = 'k';
  process.env.GEMINI_MODEL = 'gemini-old';
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('gemini-old')) return { ok: false, status: 404, json: async () => ({}) };
    if (String(url).includes('/models?')) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] }] }) };
    return geminiReply({ headline: 'h', rootCauses: [{ title: 't', detail: 'd' }], fixes: [{ priority: 2, title: 'b', detail: 'x' }, { priority: 1, title: 'a', detail: 'y' }] });
  };
  const s = await summarizeIssues({ target: 'http://x', issues: [{ id: 'RG-001', severity: 'high', type: 'js-exception', title: 't', detail: 'd' }] });
  assert.equal(s.model, 'gemini-9-flash');
  assert.deepEqual(s.fixes.map((f) => f.title), ['a', 'b']);
  assert.ok(calls.some((c) => c.includes('gemini-9-flash')));
});

test('visual review caps severity at medium', async () => {
  process.env.GEMINI_API_KEY = 'k';
  globalThis.fetch = async () => geminiReply({ findings: [{ title: 'Üst üste metin', detail: 'Başlık butonla çakışıyor', severity: 'critical' }] });
  const r = await reviewScreenshot({ jpegBase64: 'AAAA', url: 'http://x', viewport: { width: 375, height: 667 } });
  assert.equal(r.findings[0].severity, 'low');
});
