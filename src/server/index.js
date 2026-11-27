// Stampede dashboard server: static UI + JSON API + Server-Sent Events live stream.
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StampedeSession, stripHeavy } from '../engine/session.js';
import { MODES, isLocalUrl, ZONE_LABEL } from '../engine/safety.js';
import { PERSONAS, PERSONA_ORDER, DEFAULT_SWARM, MAX_AGENTS, MAX_PER_PERSONA, buildRoster } from '../engine/personas.js';
import { MOVE_LABEL } from '../engine/moves.js';
import { CATEGORIES } from '../engine/issues.js';
import { writeReport } from '../report/index.js';
import { listenWithFallback } from '../util/listen.js';
import { loadEnv } from '../util/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..');
const PUBLIC_DIR = join(ROOT, 'public');
export const REPORTS_DIR = join(ROOT, 'reports');
const reportsDir = () => process.env.STAMPEDE_REPORTS || REPORTS_DIR;
const FONT_DIRS = {
  'schibsted-grotesk': join(ROOT, 'node_modules', '@fontsource-variable', 'schibsted-grotesk', 'files'),
  'jetbrains-mono': join(ROOT, 'node_modules', '@fontsource-variable', 'jetbrains-mono', 'files'),
};
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Local API hardening:
 *  - Host must be localhost (blocks DNS-rebinding pages from talking to this server),
 *  - writes must be JSON (forces a CORS preflight that we never grant) and come from our own origin.
 * Without this any website open in the same browser could start a swarm against a site of its choice.
 */
export function checkRequestOrigin(req) {
  const host = req.headers.host || '';
  if (!LOCAL_HOSTS.test(host)) return 'Sadece localhost üzerinden erişilebilir.';
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (ct !== 'application/json') return 'İstek application/json olmalı.';
  const origin = req.headers.origin;
  if (origin && origin !== 'null') {
    let o;
    try {
      o = new URL(origin);
    } catch {
      return 'Geçersiz Origin.';
    }
    if (o.host !== host) return 'Başka bir siteden gelen istek reddedildi.';
  }
  return null;
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const MAX_BODY = 64 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ts': 'text/plain; charset=utf-8' };

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
  const personas = body.personas === undefined ? ['rage'] : body.personas;
  if (!Array.isArray(personas) || !personas.length || personas.some((p) => !PERSONA_ORDER.includes(p))) {
    errors.push(`personas şunlardan en az biri olmalı: ${PERSONA_ORDER.join(', ')}`);
  } else {
    try {
      buildRoster(personas);
    } catch (err) {
      errors.push(err.message);
    }
  }
  let credentials;
  if (body.credentials && (body.credentials.email || body.credentials.password)) {
    const { email = '', password = '' } = body.credentials;
    if (typeof email !== 'string' || (email && !EMAIL_RX.test(email))) errors.push('credentials.email geçerli bir e-posta olmalı');
    if (typeof password !== 'string' || password.length > 200) errors.push('credentials.password en fazla 200 karakter olmalı');
    credentials = { email: email || undefined, password: password || undefined };
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { url, mode, durationSec, seed, headed: body.headed === true, confirmLive: body.confirmLive === true, personas, credentials, resetDemo: body.resetDemo !== false, ai: body.ai !== false };
}

export function createDashboardServer({ demoUrl = process.env.DEMO_URL || 'http://localhost:7500' } = {}) {
  const clients = new Set();
  let session = null;
  let runPromise = Promise.resolve();
  let lastReport = null;
  let lastIssues = new Map();
  let lastActions = [];
  const frames = new Map(); // agent -> latest JPEG Buffer
  const streams = new Map(); // agent -> Set<{res, fps, last}>

  const pushFrame = (agent, buf) => {
    frames.set(agent, buf);
    const set = streams.get(agent);
    if (!set) return;
    const now = Date.now();
    for (const c of set) {
      if (now - c.last < 1000 / c.fps || c.res.writableLength > 2_000_000) continue;
      c.last = now;
      c.res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
      c.res.write(buf);
      c.res.write('\r\n');
    }
  };

  const broadcast = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(payload);
  };

  async function startRun(params) {
    if (session) throw new Error('Zaten çalışan bir sürü var. Önce durdurun.');
    const s = new StampedeSession(params);
    // Demo runs start from a clean store: previous orders, accounts and cart contents are wiped.
    if (params.resetDemo && sameOrigin(params.url, demoUrl)) {
      await fetch(`${demoUrl.replace(/\/$/, '')}/api/reset`, { method: 'POST' }).catch(() => null);
    }
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
    s.on('frame', (d) => pushFrame(d.agent, Buffer.from(d.data, 'base64')));
    s.on('decision', (d) => broadcast('decision', d));
    s.on('outcome', (d) => broadcast('outcome', d));
    s.on('aiplan', (d) => broadcast('aiplan', d));
    s.on('stats', (d) => broadcast('stats', d));
    s.on('error', (d) => broadcast('failed', d));
    broadcast('started', { config: s.config, mode: s.mode, personas: s.roster.map((r) => ({ id: r.id, persona: r.persona.id, code: r.code, label: r.label, tag: r.tag, color: r.color, viewport: r.persona.context.viewport })), identity: { email: s.credentials.email, generated: s.credentials.generated } });
    runPromise = s.run()
      .then(async (report) => {
        const written = await writeReport(report, reportsDir());
        lastReport = { ...summary(report), reportName: written.name };
        session = null; // free the slot before telling the UI, so a new target can start right away
        broadcast('done', lastReport);
      })
      .catch((err) => {
        session = null;
        broadcast('failed', { message: err.message });
      })
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
      categories: report.categories,
      personas: report.personas,
      ai: report.ai,
      counts: report.counts,
      stats: report.stats,
      durationMs: report.durationMs,
      issues: report.issues.map((i) => {
        const { steps, ...rest } = i;
        return { ...stripHeavy(rest), stepCount: steps.length };
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
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return fail(res, 400, 'Geçersiz yol');
    }
    const guard = checkRequestOrigin(req);
    if (guard) return fail(res, 403, guard);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (!path.startsWith('/reports/')) res.setHeader('x-frame-options', 'DENY');
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
      if (req.method === 'GET' && path === '/api/config') {
        return ok(res, {
          demoUrl: demoUrl.replace(/\/$/, ''),
          personas: PERSONA_ORDER.map((id) => {
            const p = PERSONAS[id];
            return { id, label: p.label, tag: p.tag, summary: p.summary, viewport: p.context.viewport };
          }),
          defaultSwarm: DEFAULT_SWARM,
          limits: { maxAgents: MAX_AGENTS, maxPerPersona: MAX_PER_PERSONA },
          ai: Boolean(process.env.GEMINI_API_KEY),
          moves: MOVE_LABEL,
          zones: ZONE_LABEL,
          categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
          identityFromEnv: Boolean(process.env.STAMPEDE_EMAIL),
        });
      }
      if (req.method === 'GET' && path.startsWith('/api/stream/')) {
        const agent = path.slice('/api/stream/'.length);
        if (!/^[a-z]+(-[2-9])?$/.test(agent) || !PERSONAS[agent.split('-')[0]]) return fail(res, 404, 'Bilinmeyen ajan');
        const fps = Math.min(Math.max(Number(url.searchParams.get('fps')) || 4, 1), 15);
        res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame', 'cache-control': 'no-store', connection: 'keep-alive' });
        const client = { res, fps, last: 0 };
        if (!streams.has(agent)) streams.set(agent, new Set());
        streams.get(agent).add(client);
        const last = frames.get(agent);
        if (last) pushFrame(agent, last);
        req.on('close', () => streams.get(agent).delete(client));
        return undefined;
      }
      if (req.method === 'POST' && path === '/api/focus') {
        const { agent } = await readJson(req);
        if (session && typeof agent === 'string') session.setFocus(agent);
        return ok(res, { agent });
      }
      if (req.method === 'GET' && path.startsWith('/vendor/fonts/')) {
        const file = path.slice('/vendor/fonts/'.length);
        const m = /^(schibsted-grotesk|jetbrains-mono)-latin(-ext)?-wght-normal\.woff2$/.exec(file);
        if (!m) return fail(res, 404, 'Bulunamadı');
        const body = await readFile(join(FONT_DIRS[m[1]], file));
        res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' });
        return res.end(body);
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
        const names = existsSync(reportsDir()) ? (await readdir(reportsDir())).filter((n) => !n.startsWith('.')).sort().reverse() : [];
        return ok(res, names.slice(0, 30));
      }
      if (req.method === 'GET' && path.startsWith('/reports/')) {
        return serveStatic(res, reportsDir(), path.slice('/reports/'.length));
      }
      if (req.method === 'GET') return serveStatic(res, PUBLIC_DIR, path === '/' ? 'index.html' : path);
      return fail(res, 405, 'Desteklenmeyen istek');
    } catch (err) {
      return fail(res, 400, err.message);
    }
  });

  /** Stop a running swarm and wait for its browser to close (never leave Chrome to be killed). */
  async function shutdown(timeoutMs = 10000) {
    if (session) session.stop();
    await Promise.race([runPromise.catch(() => null), new Promise((r) => setTimeout(r, timeoutMs))]);
    for (const set of streams.values()) for (const c of set) c.res.end();
    for (const c of clients) c.end();
  }

  return { server, stopSession: () => session && session.stop(), shutdown };
}

export const DEFAULT_DASHBOARD_PORT = 7400;

export async function startDashboard({ port: preferred = Number(process.env.PORT) || DEFAULT_DASHBOARD_PORT, demoUrl } = {}) {
  const { server, shutdown } = createDashboardServer({ demoUrl });
  const port = await listenWithFallback(server, preferred);
  return { server, shutdown, port, url: `http://localhost:${port}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  startDashboard()
    .then(({ url }) => process.stdout.write(`Stampede dashboard: ${url}\n`))
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
