// End-to-end: real Chromium, real demo store, real swarm.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../../demo/server.js';
import { createDashboardServer } from '../../src/server/index.js';
import { StampedeSession } from '../../src/engine/session.js';
import { writeReport } from '../../src/report/index.js';
import { listenWithFallback } from '../../src/util/listen.js';

const ALL = ['rage', 'keyboard', 'mobile', 'snoop'];
let demo;
let demoUrl;
let outDir;

before(async () => {
  demo = createDemoServer();
  const port = await listenWithFallback(demo.server, 0);
  demoUrl = `http://localhost:${port}`;
  outDir = await mkdtemp(join(tmpdir(), 'stampede-e2e-'));
});

after(async () => {
  demo.server.close();
  await rm(outDir, { recursive: true, force: true });
});

const resetDemo = () => fetch(`${demoUrl}/api/reset`, { method: 'POST' });
const JSON_HEADERS = { 'content-type': 'application/json' };
const types = (report) => new Set(report.issues.map((i) => i.type));

test('the angry customer alone catches the double charge with a full repro', { timeout: 120000 }, async () => {
  await resetDemo();
  const report = await new StampedeSession({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 40, seed: 7 }).run();
  const found = types(report);
  const doubleCharge = report.issues.find((i) => i.type === 'double-submit' && i.request.url.endsWith('/api/orders'));
  assert.ok(doubleCharge, `double charge not found; got: ${[...found].join(', ')}`);
  assert.equal(doubleCharge.severity, 'critical');
  assert.ok(doubleCharge.steps.length > 0, 'repro steps must exist');
  assert.ok(found.has('layout-overflow') || found.has('garbage-render'), 'expected a rendering bug as well');
  assert.ok(found.size >= 5, `expected >= 5 distinct bug types, got ${found.size}: ${[...found].join(', ')}`);
  assert.ok(demo.state.orders.length >= 2, 'demo ledger should show the duplicate charge');
});

test('the full swarm finds security, keyboard and mobile bugs and films them', { timeout: 150000 }, async () => {
  await resetDemo();
  const session = new StampedeSession({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 40, seed: 11, personas: ALL });
  const auth = [];
  session.on('anomaly', (a) => a.kind === 'auth' && auth.push(a.text));
  const report = await session.run();
  const found = types(report);
  assert.ok(demo.state.users.length >= 1, 'the auth autopilot should have created the test account');
  assert.ok(auth.some((t) => /Hoş geldin/.test(t)), `login should succeed with the generated identity: ${auth.join(' | ')}`);
  for (const t of ['double-submit', 'data-leak']) assert.ok(found.has(t), `missing ${t}; got ${[...found].join(', ')}`);
  assert.ok(found.has('focus-invisible') || found.has('keyboard-unreachable'), `keyboard agent found nothing; got ${[...found].join(', ')}`);
  assert.ok(found.has('insecure-cookie') || demo.state.users.length === 0, 'a logged-in session cookie must be audited');
  assert.equal(new Set(report.issues.map((i) => i.agent)).size >= 3, true, 'at least three agents should report something');
  assert.ok(report.issues.some((i) => i.film && i.film.length >= 2), 'issues should carry a film strip');
  assert.equal(report.categories.length, 6);
  assert.ok(!report.actions.some((a) => /google/i.test(a.label || '')), 'OAuth buttons must never be pressed');
  const json = JSON.stringify(report);
  assert.ok(!json.includes(`Stp-${report.seed}-Aa!9`), 'the test password must never appear in the report');

  const written = await writeReport(report, outDir);
  const html = await readFile(written.files.html, 'utf8');
  const spec = await readFile(written.files.spec, 'utf8');
  assert.match(written.files.spec, /stampede\.spec\.ts$/);
  assert.match(html, /Stampede raporu/);
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, /class="tap"/, 'film strip should mark the press');
  assert.match(spec, /import \{ test, expect \} from '@playwright\/test'/);
});

test('safe mode: four agents, zero writes reach the server, no account is created', { timeout: 90000 }, async () => {
  await resetDemo();
  const before = demo.state.mutationCount;
  const report = await new StampedeSession({ url: `${demoUrl}/#/account`, mode: 'safe', durationSec: 22, seed: 3, personas: ALL }).run();
  assert.equal(demo.state.mutationCount, before, 'server received a POST/PUT/DELETE in safe mode');
  assert.equal(demo.state.orders.length, 0);
  assert.equal(demo.state.users.length, 0);
  assert.ok(report.stats.actions > 10);
  assert.ok(!types(report).has('double-submit'));
});

test('the fixed build survives the whole swarm', { timeout: 120000 }, async () => {
  await resetDemo();
  const report = await new StampedeSession({ url: `${demoUrl}/?fixed=1`, mode: 'chaos', durationSec: 35, seed: 7, personas: ALL }).run();
  const serious = report.issues.filter((i) => i.severity === 'critical' || i.severity === 'high');
  assert.deepEqual(serious.map((i) => `${i.agentCode} ${i.type}: ${i.detail}`), []);
  assert.ok(report.score >= 75, `score ${report.score}`);
});

test('dashboard: SSE decisions, MJPEG live view and report serving', { timeout: 90000 }, async () => {
  process.env.STAMPEDE_REPORTS = outDir;
  const { server } = createDashboardServer({ demoUrl });
  const port = await listenWithFallback(server, 0);
  const base = `http://localhost:${port}`;
  try {
    const bad = await fetch(`${base}/api/run`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url: 'https://biyom.co', mode: 'stress' }) });
    assert.equal(bad.status, 400);
    // CSRF / DNS-rebinding guards
    const plain = await fetch(`${base}/api/run`, { method: 'POST', body: JSON.stringify({ url: `${demoUrl}/` }) });
    assert.equal(plain.status, 403, 'a text/plain POST (what a foreign page can send without preflight) must be refused');
    const foreign = await fetch(`${base}/api/run`, { method: 'POST', headers: { ...JSON_HEADERS, origin: 'https://evil.example' }, body: JSON.stringify({ url: `${demoUrl}/` }) });
    assert.equal(foreign.status, 403);
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.data.demoUrl, demoUrl);
    assert.equal(cfg.data.personas.length, 7);
    const font = await fetch(`${base}/vendor/fonts/schibsted-grotesk-latin-wght-normal.woff2`);
    assert.equal(font.headers.get('content-type'), 'font/woff2');

    const ctrl = new AbortController();
    const events = new Set();
    let done = null;
    const stream = fetch(`${base}/api/events`, { signal: ctrl.signal })
      .then(async (res) => {
        const decoder = new TextDecoder();
        let buf = '';
        for await (const chunk of res.body) {
          buf += decoder.decode(chunk, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const ev = /^event: (.+)$/m.exec(block);
            if (!ev) continue;
            events.add(ev[1]);
            if (ev[1] === 'done') {
              done = JSON.parse(/^data: (.+)$/m.exec(block)[1]);
              ctrl.abort();
            }
          }
        }
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 300));
    const run = await fetch(`${base}/api/run`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 12, seed: 5, personas: ['rage', 'mobile'] }) });
    assert.equal(run.status, 200);

    // MJPEG: the live view is a multipart stream of JPEG frames.
    await new Promise((r) => setTimeout(r, 4000));
    const mj = new AbortController();
    const mres = await fetch(`${base}/api/stream/rage?fps=5`, { signal: mj.signal });
    assert.match(mres.headers.get('content-type'), /multipart\/x-mixed-replace/);
    const reader = mres.body.getReader();
    const { value } = await reader.read();
    assert.match(Buffer.from(value).toString('latin1'), /--frame|Content-Type: image\/jpeg|\xff\xd8/);
    mj.abort();

    await stream;
    for (const e of ['hello', 'started', 'decision', 'outcome', 'action', 'stats', 'done']) assert.ok(events.has(e), `missing SSE event ${e}`);
    assert.ok(done && done.reportName && done.categories);
    const page = await fetch(`${base}/reports/${encodeURIComponent(done.reportName)}/report.html`);
    assert.equal(page.status, 200);
    const spec = await fetch(`${base}/reports/${encodeURIComponent(done.reportName)}/stampede.spec.ts`);
    assert.equal(spec.status, 200);
    const traversal = await fetch(`${base}/reports/..%2F..%2Fpackage.json`);
    assert.notEqual(traversal.status, 200);
  } finally {
    server.close();
  }
});

test('eight agents including the new personas run together without errors', { timeout: 120000 }, async () => {
  await resetDemo();
  const session = new StampedeSession({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 30, seed: 9, personas: ['rage', 'rage', 'keyboard', 'mobile', 'snoop', 'abandoner', 'slow', 'bot'] });
  const kinds = new Set();
  const errors = [];
  session.on('action', (a) => a.phase === 'done' && kinds.add(a.kind));
  session.on('error', (e) => errors.push(e.message));
  const report = await session.run();
  assert.deepEqual(errors, []);
  assert.equal(report.personas.length, 8);
  assert.deepEqual(report.personas.map((p) => p.id).slice(0, 2), ['rage', 'rage-2']);
  for (const k of ['crawl', 'abandonForm']) assert.ok(kinds.has(k), `move ${k} never ran; got ${[...kinds].join(', ')}`);
  assert.ok(report.issues.length >= 8);
});
