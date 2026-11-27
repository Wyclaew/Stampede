// End-to-end: real Chromium, real demo store, real ghost.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../../demo/server.js';
import { createDashboardServer } from '../../src/server/index.js';
import { GhostSession } from '../../src/engine/session.js';
import { writeReport } from '../../src/report/index.js';
import { listenWithFallback } from '../../src/util/listen.js';

let demo;
let demoUrl;
let outDir;

before(async () => {
  demo = createDemoServer();
  const port = await listenWithFallback(demo.server, 0);
  demoUrl = `http://localhost:${port}`;
  outDir = await mkdtemp(join(tmpdir(), 'rageghost-e2e-'));
});

after(async () => {
  demo.server.close();
  await rm(outDir, { recursive: true, force: true });
});

const resetDemo = () => fetch(`${demoUrl}/api/reset`, { method: 'POST' });
const types = (report) => new Set(report.issues.map((i) => i.type));

test('chaos mode catches the deliberate bugs in the buggy demo', { timeout: 120000 }, async () => {
  await resetDemo();
  const report = await new GhostSession({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 40, seed: 7 }).run();
  const found = types(report);
  const doubleCharge = report.issues.find((i) => i.type === 'double-submit' && i.request.url.endsWith('/api/orders'));
  assert.ok(doubleCharge, `double charge not found; got: ${[...found].join(', ')}`);
  assert.equal(doubleCharge.severity, 'critical');
  assert.ok(doubleCharge.steps.some((s) => s.kind === 'rageClick'), 'repro steps must contain the rage click');
  assert.ok(found.has('layout-overflow'), 'mobile overflow not found');
  assert.ok(found.size >= 6, `expected >= 6 distinct bug types, got ${found.size}: ${[...found].join(', ')}`);
  assert.ok(demo.state.orders.length >= 2, 'demo ledger should show the duplicate charge');
  assert.ok(report.score < 50);

  const written = await writeReport(report, outDir);
  const html = await readFile(written.files.html, 'utf8');
  const spec = await readFile(written.files.spec, 'utf8');
  assert.match(html, /Çift gönderim/);
  assert.match(html, /data:image\/jpeg;base64,/, 'report should embed screenshots');
  assert.match(spec, /expect\(mutations\.length\)\.toBeLessThanOrEqual\(1\)/);
});

test('safe mode never lets a mutation reach the server', { timeout: 90000 }, async () => {
  await resetDemo();
  const before = demo.state.mutationCount;
  const report = await new GhostSession({ url: `${demoUrl}/`, mode: 'safe', durationSec: 20, seed: 3 }).run();
  assert.equal(demo.state.mutationCount, before, 'server received a POST/PUT/DELETE in safe mode');
  assert.equal(demo.state.orders.length, 0);
  assert.ok(report.stats.actions > 5);
  assert.ok(!types(report).has('double-submit'));
  // read-only bugs are still visible
  assert.ok(types(report).has('layout-overflow') || types(report).has('slow-request'));
});

test('fixed build survives the same chaos', { timeout: 120000 }, async () => {
  await resetDemo();
  const report = await new GhostSession({ url: `${demoUrl}/?fixed=1`, mode: 'chaos', durationSec: 30, seed: 7 }).run();
  const serious = report.issues.filter((i) => i.severity === 'critical' || i.severity === 'high');
  assert.deepEqual(serious.map((i) => `${i.type}: ${i.detail}`), []);
  assert.ok(report.score >= 85, `score ${report.score}`);
});

test('dashboard API streams a full run over SSE and serves the report', { timeout: 90000 }, async () => {
  process.env.RAGEGHOST_REPORTS = outDir;
  const { server } = createDashboardServer({ demoUrl });
  const port = await listenWithFallback(server, 0);
  const base = `http://localhost:${port}`;
  try {
    const bad = await fetch(`${base}/api/run`, { method: 'POST', body: JSON.stringify({ url: 'https://biyom.co', mode: 'stress' }) });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /canlı bir site|Sitenin sahibi|sahibi/);

    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.data.demoUrl, demoUrl);

    const ctrl = new AbortController();
    const events = new Set();
    let done = null;
    const stream = fetch(`${base}/api/events`, { signal: ctrl.signal }).then(async (res) => {
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
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 300));
    const run = await fetch(`${base}/api/run`, { method: 'POST', body: JSON.stringify({ url: `${demoUrl}/`, mode: 'chaos', durationSec: 12, seed: 5 }) });
    assert.equal(run.status, 200);
    await stream;
    for (const e of ['hello', 'started', 'frame', 'action', 'stats', 'done']) assert.ok(events.has(e), `missing SSE event ${e}`);
    assert.ok(done && done.reportName);
    const page = await fetch(`${base}/reports/${encodeURIComponent(done.reportName)}/report.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /RageGhost Raporu/);
    const traversal = await fetch(`${base}/reports/..%2F..%2Fpackage.json`);
    assert.notEqual(traversal.status, 200);
  } finally {
    server.close();
  }
});
