import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IssueStore, resilienceScore, scoreGrade, normalizePath, normalizeMessage } from '../../src/engine/issues.js';
import { buildCandidates, chooseAction, collapseDuplicates } from '../../src/engine/strategy.js';
import { MODES } from '../../src/engine/safety.js';
import { createRng } from '../../src/engine/rng.js';
import { pickChaosInput, XSS_PAYLOAD } from '../../src/engine/inputs.js';

test('issue store de-duplicates by fingerprint and escalates severity', () => {
  const store = new IssueStore();
  const a = store.add({ type: 'console-error', severity: 'medium', fingerprint: 'x', detail: 'boom' });
  const b = store.add({ type: 'console-error', severity: 'high', fingerprint: 'x', detail: 'boom' });
  assert.equal(a.isNew, true);
  assert.equal(b.isNew, false);
  assert.equal(b.issue.occurrences, 2);
  assert.equal(b.issue.severity, 'high');
  assert.equal(store.list().length, 1);
  assert.equal(a.issue.id, 'RG-001');
});

test('issue store rejects unknown types and sorts by severity', () => {
  const store = new IssueStore();
  assert.throws(() => store.add({ type: 'nope', severity: 'low', fingerprint: 'n' }), /Unknown issue type/);
  store.add({ type: 'dead-click', severity: 'low', fingerprint: 'l' });
  store.add({ type: 'double-submit', severity: 'critical', fingerprint: 'c' });
  assert.deepEqual(store.list().map((i) => i.severity), ['critical', 'low']);
  assert.deepEqual(store.countsBySeverity(), { critical: 1, high: 0, medium: 0, low: 1 });
});

test('resilience score and grade', () => {
  assert.equal(resilienceScore({ critical: 0, high: 0, medium: 0, low: 0 }), 100);
  assert.equal(resilienceScore({ critical: 1, high: 1, medium: 1, low: 1 }), 56);
  assert.equal(resilienceScore({ critical: 9, high: 0, medium: 0, low: 0 }), 0);
  assert.equal(scoreGrade(95).grade, 'A');
  assert.equal(scoreGrade(10).grade, 'F');
});

test('path and message normalisation make fingerprints stable', () => {
  assert.equal(normalizePath('http://x.com/orders/123?y=1'), '/orders/:id');
  assert.equal(normalizePath('http://x.com/#/'), '/');
  assert.equal(normalizePath('http://x.com/#/product/7'), '/#/product/:id');
  assert.equal(normalizeMessage('HTTP 500 /api/search?q=-1'), normalizeMessage('HTTP 500 /api/search?q=abc'));
});

const mk = (id, over) => ({ id, tag: 'button', type: 'button', text: '', ariaLabel: '', name: '', elId: '', editable: false, inViewport: true, ...over });
const memory = () => ({ hits: new Map(), visited: new Set(), lastKind: null, actionsOnPage: 0, viewportShakenOn: new Set(), navCount: 0 });

test('safe mode never proposes clicking a pay button', () => {
  const elements = [mk('e1', { text: 'Öde ₺240' }), mk('e2', { text: 'Detaylar' })];
  const c = buildCandidates({ elements, mode: MODES.safe, origin: 'http://localhost', memory: memory(), pageKey: 'p' });
  assert.equal(c.some((x) => x.el && x.el.id === 'e1'), false);
  assert.equal(c.some((x) => x.el && x.el.id === 'e2'), true);
  assert.equal(c.some((x) => x.kind === 'viewport'), true);
  assert.equal(c.some((x) => x.kind === 'reload'), false);
});

test('identical buttons collapse into one candidate', () => {
  const rng = createRng(1);
  const elements = Array.from({ length: 12 }, (_, i) => mk(`e${i}`, { text: 'Sepete ekle' }));
  const c = collapseDuplicates(buildCandidates({ elements, mode: MODES.chaos, origin: 'http://localhost', memory: memory(), pageKey: 'p' }), rng);
  assert.equal(c.filter((x) => x.kind === 'rageClick').length, 1);
});

test('fresh page in chaos mode: same seed picks the same opening action', () => {
  const elements = [mk('e1', { text: 'Öde ₺240' }), mk('e2', { text: 'Detaylar' }), mk('e3', { tag: 'input', type: 'text', editable: true })];
  const run = () => chooseAction({ elements, mode: MODES.chaos, origin: 'http://localhost', memory: memory(), pageKey: 'p' }, createRng(42));
  assert.deepEqual(run().kind, run().kind);
  assert.equal(run().el && run().el.id, run().el && run().el.id);
});

test('chaos inputs match field types and include an XSS probe', () => {
  const rng = createRng(3);
  const seen = new Set(Array.from({ length: 200 }, () => pickChaosInput({ type: 'text' }, rng)));
  assert.ok(seen.has(XSS_PAYLOAD));
  for (let i = 0; i < 30; i++) assert.ok(['-1', '0', '99999999999999', '1e309', '3.14159265358979', 'abc', '١٢٣', '--5', ''].includes(pickChaosInput({ type: 'number' }, rng)));
  for (const v of seen) assert.ok(!/\b(undefined|NaN|null)\b/.test(v), `corpus must not contain garbage tokens: ${v}`);
});
