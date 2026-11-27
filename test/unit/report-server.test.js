import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { reproTest, reproSpec } from '../../src/report/repro.js';
import { renderHtml } from '../../src/report/html.js';
import { renderMarkdown } from '../../src/report/index.js';
import { playwrightLocator, stableName } from '../../src/engine/locator.js';
import { parseRunRequest } from '../../src/server/index.js';
import { listenWithFallback } from '../../src/util/listen.js';
import { parseArgs } from '../../bin/rageghost.js';

const step = (over) => ({ seq: 1, kind: 'rageClick', label: '‘Öde’ butonu 3 kez hızlıca tıkla', urlBefore: 'http://localhost:7500/#/checkout', viewport: { width: 375, height: 667 }, locator: "page.getByRole('button', { name: 'Öde' }).first()", count: 3, ...over });
const issue = (over) => ({
  id: 'RG-001', type: 'double-submit', severity: 'critical', title: 'Çift gönderim', meaning: 'm', fix: 'f', detail: '<script>alert(1)</script>', occurrences: 2,
  trigger: 't', url: 'http://localhost:7500/#/checkout', evidence: ['POST /api/orders → 201'], request: { method: 'POST', url: 'http://localhost:7500/api/orders' },
  steps: [step(), step({ seq: 2, kind: 'type', value: "it's \"quoted\"", label: 'yaz', locator: "page.locator('#coupon')", enterTwice: true }), step({ seq: 3, kind: 'backForward', sequence: ['back', 'forward'] })],
  ...over,
});
const report = (issues) => ({
  tool: 'RageGhost', version: '1.0.0', target: 'http://localhost:7500/', origin: 'http://localhost:7500', mode: { id: 'chaos', label: 'Tam Kaos' }, seed: 42,
  startedAt: Date.now() - 1000, finishedAt: Date.now(), durationMs: 1000, stats: { actions: 3, clicks: 3, requests: 5, pagesVisited: 1 },
  counts: { critical: 1, high: 0, medium: 0, low: 0 }, score: 75, grade: { grade: 'C', label: 'x' }, issues, actions: [], anomalies: [],
});

test('generated Playwright repro is syntactically valid JavaScript', () => {
  const types = ['double-submit', 'js-exception', 'layout-overflow', 'garbage-render', 'stuck-spinner', 'xss', 'server-error', 'ui-freeze', 'dead-click'];
  for (const type of types) {
    const code = reproTest(issue({ type, token: 'NaN' }), report([]));
    assert.doesNotThrow(() => new Function('test', 'expect', code), `${type} repro must compile`);
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
  assert.deepEqual(parseRunRequest({ url: 'http://localhost:7500', mode: 'chaos', durationSec: 30 }), { url: 'http://localhost:7500', mode: 'chaos', durationSec: 30, seed: undefined, headed: false, confirmLive: false });
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
