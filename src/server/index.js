// RageGhost dashboard server: static UI + JSON API + Server-Sent Events live stream.
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GhostSession, stripHeavy } from '../engine/session.js';
import { MODES, isLocalUrl } from '../engine/safety.js';
import { writeReport } from '../report/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..');
const PUBLIC_DIR = join(ROOT, 'public');
export const REPORTS_DIR = process.env.RAGEGHOST_REPORTS || join(ROOT, 'reports');
const MAX_BODY = 64 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
const ok = (res, data, meta) => send(res, 200, { success: true, data, error: null, meta: meta || null });
const fail = (res, status, error) => send(res, status, { success: false, data: null, error });

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('İstek gövdesi çok büyük.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Geçersiz JSON.');
  }
}

/** Validate the run request at the system boundary. */
export function parseRunRequest(body) {
  const errors = [];
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) errors.push('url zorunlu');
  const mode = typeof body.mode === 'string' ? body.mode : 'safe';
  if (!MODES[mode]) errors.push(`mode şunlardan biri olmalı: ${Object.keys(MODES).join(', ')}`);
  const durationSec = body.durationSec === undefined ? 60 : Number(body.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 5 || durationSec > 900) errors.push('durationSec 5-900 arası olmalı');
  const seed = body.seed === undefined || body.seed === '' || body.seed === null ? undefined : Number(body.seed);
  if (seed !== undefined && !Number.isInteger(seed)) errors.push('seed tam sayı olmalı');
  if (errors.length) throw new Error(errors.join('; '));
  return { url, mode, durationSec, seed, headed: body.headed === true, confirmLive: body.confirmLive === true };
}

export function createDashboardServer() {
  const clients = new Set();
  let session = null;
  let lastReport = null;
  let lastIssues = new Map();
  let lastActions = [];

  const broadcast = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(payload);
  };

  async function startRun(params) {
    if (session) throw new Error('Zaten çalışan bir hayalet var. Önce durdurun.');
    const s = new GhostSession(params);
    session = s;
    lastReport = null;
    lastIssues = new Map();
    lastActions = [];
    s.on('status', (d) => broadcast('status', d));
    s.on('action', (d) => {
      if (d.phase === 'done') {
        lastActions.push(d);
        if (lastActions.length > 200) lastActions.shift();
      }
      broadcast('action', d);
    });
    s.on('issue', (d) => {
      lastIssues.set(d.issue.fingerprint, d.issue);
      broadcast('issue', d);
    });
    s.on('anomaly', (d) => broadcast('anomaly', d));
    s.on('frame', (d) => broadcast('frame', d));
    s.on('stats', (d) => broadcast('stats', d));
    s.on('error', (d) => broadcast('failed', d));
    broadcast('started', { config: s.config, mode: s.mode });
    s.run()
      .then(async (report) => {
        const written = await writeReport(report, REPORTS_DIR);
        lastReport = { ...summary(report), reportName: written.name };
        broadcast('done', lastReport);
      })
      .catch((err) => broadcast('failed', { message: err.message }))
      .finally(() => {
        session = null;
      });
    return s.config;
  }

  function summary(report) {
    return {
      target: report.target,
      mode: report.mode,
      seed: report.seed,
      score: report.score,
      grade: report.grade,
      counts: report.counts,
      stats: report.stats,
      durationMs: report.durationMs,
      issues: report.issues.map((i) => {
        const { screenshot, steps, ...rest } = i;
        return { ...stripHeavy({ ...rest, screenshot }), stepCount: steps.length };
      }),
    };
  }

  async function serveStatic(res, baseDir, relPath) {
    const target = normalize(join(baseDir, relPath));
    if (!target.startsWith(baseDir)) return fail(res, 403, 'Yasak yol');
    try {
      const info = await stat(target);
      const file = info.isDirectory() ? join(target, 'index.html') : target;
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(body);
    } catch {
      return fail(res, 404, 'Bulunamadı');
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: hello\ndata: ${JSON.stringify({ running: Boolean(session), snapshot: session ? session.snapshot() : null, issues: [...lastIssues.values()], actions: lastActions.slice(-40), lastReport })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return undefined;
      }
      if (req.method === 'GET' && path === '/api/modes') {
        return ok(res, Object.values(MODES).map((m) => ({ id: m.id, label: m.label })));
      }
      if (req.method === 'GET' && path === '/api/check-url') {
        const target = url.searchParams.get('url') || '';
        return ok(res, { local: isLocalUrl(target) });
      }
      if (req.method === 'POST' && path === '/api/run') {
        const params = parseRunRequest(await readJson(req));
        const config = await startRun(params);
        return ok(res, { seed: config.seed, mode: config.mode, url: config.url });
      }
      if (req.method === 'POST' && path === '/api/stop') {
        if (session) session.stop();
        return ok(res, { stopping: Boolean(session) });
      }
      if (req.method === 'GET' && path === '/api/reports') {
        const names = existsSync(REPORTS_DIR) ? (await readdir(REPORTS_DIR)).filter((n) => !n.startsWith('.')).sort().reverse() : [];
        return ok(res, names.slice(0, 30));
      }
      if (req.method === 'GET' && path.startsWith('/reports/')) {
        return serveStatic(res, REPORTS_DIR, path.slice('/reports/'.length));
      }
      if (req.method === 'GET') return serveStatic(res, PUBLIC_DIR, path === '/' ? 'index.html' : path);
      return fail(res, 405, 'Desteklenmeyen istek');
    } catch (err) {
      return fail(res, 400, err.message);
    }
  });

  return { server, stopSession: () => session && session.stop() };
}

export function startDashboard(port = Number(process.env.PORT) || 4400) {
  const { server } = createDashboardServer();
  return new Promise((resolveStart, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Port ${port} kullanımda. Başka port: PORT=4401 npm start`));
      else reject(err);
    });
    server.listen(port, '127.0.0.1', () => resolveStart({ server, port, url: `http://localhost:${port}` }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDashboard()
    .then(({ url }) => process.stdout.write(`👻 RageGhost dashboard: ${url}\n`))
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
