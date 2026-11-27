import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { reproTest, reproSpec } from '../../src/report/repro.js';
import { renderHtml } from '../../src/report/html.js';
import { renderMarkdown } from '../../src/report/index.js';
import { playwrightLocator, stableName } from '../../src/engine/locator.js';
import { parseRunRequest } from '../../src/server/index.js';
import { listenWithFallback } from '../../src/util/listen.js';
import { parseArgs } from '../../bin/stampede.js';

const step = (over) => ({ seq: 1, kind: 'rageClick', label: '‘Öde’ butonu 3 kez hızlıca tıkla', urlBefore: 'http://localhost:7500/#/checkout', viewport: { width: 375, height: 667 }, locator: "page.getByRole('button', { name: 'Öde' }).first()", count: 3, ...over });
const issue = (over) => ({
  id: 'RG-001', type: 'double-submit', severity: 'critical', title: 'Çift gönderim', meaning: 'm', fix: 'f', detail: '<script>alert(1)</script>', occurrences: 2,
  trigger: 't', url: 'http://localhost:7500/#/checkout', evidence: ['POST /api/orders → 201'], request: { method: 'POST', url: 'http://localhost:7500/api/orders' },
  steps: [step(), step({ seq: 2, kind: 'type', value: "it's \"quoted\"", label: 'yaz', locator: "page.locator('#coupon')", enterTwice: true }), step({ seq: 3, kind: 'backForward', sequence: ['back', 'forward'] })],
  ...over,
});
const report = (issues) => ({
  tool: 'Stampede', version: '1.0.0', target: 'http://localhost:7500/', origin: 'http://localhost:7500', mode: { id: 'chaos', label: 'Tam Kaos' }, seed: 42,
  startedAt: Date.now() - 1000, finishedAt: Date.now(), durationMs: 1000, stats: { actions: 3, clicks: 3, requests: 5, pagesVisited: 1 },
  counts: { critical: 1, high: 0, medium: 0, low: 0 }, score: 75, grade: { grade: 'C', label: 'x' }, issues, actions: [], anomalies: [],
});

const EVERY_STEP = [
  step(),
  step({ seq: 2, kind: 'type', value: "it's \"quoted\"", label: 'yaz', locator: "page.locator('#coupon')", enterTwice: true }),
  step({ seq: 3, kind: 'backForward', sequence: ['back', 'forward'] }),
  step({ seq: 4, kind: 'keyActivate', key: 'Enter', count: 3 }),
  step({ seq: 5, kind: 'tabWalk', presses: 7 }),
  step({ seq: 6, kind: 'offlineBurst' }),
  step({ seq: 7, kind: 'sleepWake' }),
  step({ seq: 8, kind: 'slowNet' }),
  step({ seq: 9, kind: 'idTamper', to: 'http://localhost:7500/orders/0' }),
  step({ seq: 10, kind: 'hiddenTamper', changes: [{ name: 'price', to: '0' }], submitted: true }),
  step({ seq: 11, kind: 'storageCorrupt' }),
  step({ seq: 12, kind: 'storageFlood' }),
  step({ seq: 13, kind: 'login', email: 'a@b.test', idLocator: 'x', submitText: 'Giriş yap', submitCount: 2 }),
  step({ seq: 14, kind: 'twinTab', twinLocator: "page.getByRole('button', { name: 'Öde' }).first()" }),
  step({ seq: 15, kind: 'rageClick', squeezeTo: [{ width: 375, height: 667 }] }),
  step({ seq: 16, kind: 'escapeSpam', keys: ['Escape'] }),
  step({ seq: 17, kind: 'abandonForm', value: 'Yarım', linkLocator: "page.getByRole('link', { name: 'Kasa' }).first()" }),
  step({ seq: 18, kind: 'crawl', urls: ['http://localhost:7500/a', 'http://localhost:7500/b'] }),
];

test('generated Playwright repro is valid TypeScript for every issue type and move', () => {
  const types = ['double-submit', 'js-exception', 'fragile-api', 'data-leak', 'layout-overflow', 'garbage-render', 'stuck-spinner', 'xss', 'server-error', 'ui-freeze', 'focus-invisible', 'dead-click'];
  for (const type of types) {
    const code = reproTest(issue({ type, token: 'NaN', steps: EVERY_STEP }), report([]));
    const js = stripTypeScriptTypes(code);
    assert.doesNotThrow(() => new Function('test', 'expect', 'process', js), `${type} repro must compile`);
  }
  assert.match(reproTest(issue(), report([])), /expect\(mutations\.length\)\.toBeLessThanOrEqual\(1\)/);
});

test('spec file contains one test per issue and an import header', () => {
  const r = report([issue(), issue({ id: 'RG-002', type: 'js-exception' })]);
  const spec = reproSpec(r);
  assert.match(spec, /import \{ test, expect \} from '@playwright\/test'/);
  assert.equal((spec.match(/^test\(/gm) || []).length, 2);
});

test('HTML report escapes target-controlled text', () => {
  const html = renderHtml(report([issue()]));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(renderMarkdown(report([issue()])), /RG-001/);
});

test('locators prefer stable, human-readable selectors', () => {
  assert.equal(stableName('Öde ₺1.230'), 'Öde');
  assert.equal(stableName('Sepet 45'), 'Sepet');
  assert.equal(playwrightLocator({ tag: 'button', text: 'x', testId: 'pay-btn' }), "page.getByTestId('pay-btn')");
  assert.equal(playwrightLocator({ tag: 'button', type: 'submit', text: "Öde ₺240", elId: '' }), "page.getByRole('button', { name: 'Öde' }).first()");
  assert.equal(playwrightLocator({ tag: 'input', type: 'text', placeholder: "Kahve ara…", text: '' }), "page.getByPlaceholder('Kahve ara…').first()");
  assert.equal(playwrightLocator({ tag: 'button', text: '', elId: 'pay' }), "page.locator('#pay')");
});

test('run request validation at the API boundary', () => {
  assert.deepEqual(parseRunRequest({ url: 'http://localhost:7500', mode: 'chaos', durationSec: 30 }), { url: 'http://localhost:7500', mode: 'chaos', durationSec: 30, seed: undefined, headed: false, confirmLive: false, personas: ['rage'], credentials: undefined, resetDemo: true, ai: true });
  assert.throws(() => parseRunRequest({ url: 'http://x', personas: ['rage', 'rage', 'rage', 'rage'] }), /en fazla 3/);
  assert.throws(() => parseRunRequest({ url: 'http://x', personas: ['rage', 'rage', 'keyboard', 'keyboard', 'mobile', 'mobile', 'snoop', 'snoop', 'bot'] }), /en fazla 8/);
  assert.equal(parseRunRequest({ url: 'http://x', ai: false, resetDemo: false }).ai, false);
  assert.deepEqual(parseRunRequest({ url: 'http://x', personas: ['rage', 'snoop'], credentials: { email: 'qa@x.test', password: 'pw123456' } }).credentials, { email: 'qa@x.test', password: 'pw123456' });
  assert.throws(() => parseRunRequest({ url: 'http://x', personas: ['ninja'] }), /personas/);
  assert.throws(() => parseRunRequest({ url: 'http://x', personas: [] }), /personas/);
  assert.throws(() => parseRunRequest({ url: 'http://x', credentials: { email: 'not-an-email' } }), /email/);
  assert.throws(() => parseRunRequest({}), /url zorunlu/);
  assert.throws(() => parseRunRequest({ url: 'http://x', mode: 'evil' }), /mode/);
  assert.throws(() => parseRunRequest({ url: 'http://x', durationSec: 99999 }), /durationSec/);
  assert.throws(() => parseRunRequest({ url: 'http://x', seed: 1.5 }), /seed/);
});

test('CLI argument parsing', () => {
  const o = parseArgs(['run', 'http://localhost:7500', '--mode', 'chaos', '--duration', '20', '--seed', '9', '--fail-on', 'high']);
  assert.equal(o.mode, 'chaos');
  assert.equal(o.durationSec, 20);
  assert.equal(o.seed, 9);
  assert.equal(o.failOn, 'high');
  assert.deepEqual(parseArgs(['run', 'http://x', '--personas', 'all']).personas, ['rage', 'keyboard', 'mobile', 'snoop']);
  assert.equal(parseArgs(['run', 'http://x', '--personas', 'every']).personas.length, 7);
  assert.equal(parseArgs(['run', 'http://x', '--no-ai']).ai, false);
  assert.deepEqual(parseArgs(['run', 'http://x', '--personas', 'rage,snoop', '--email', 'a@b.c']).personas, ['rage', 'snoop']);
  assert.throws(() => parseArgs(['run', 'http://x', '--wat']), /Bilinmeyen/);
  assert.throws(() => parseArgs(['run', 'http://x', '--fail-on', 'meh']), /fail-on/);
});

test('listenWithFallback skips a busy port', async () => {
  const a = http.createServer();
  const first = await listenWithFallback(a, 0);
  const b = http.createServer();
  const second = await listenWithFallback(b, first);
  assert.notEqual(second, first);
  a.close();
  b.close();
});
