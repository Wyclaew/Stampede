// GhostSession: one run of the impatient ghost against one URL.
// Emits: status, action, issue, anomaly, frame, stats, done, error
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { launchBrowser } from './browser.js';
import { assertRunAllowed, getMode, isMutationMethod, isTelemetryUrl } from './safety.js';
import { createRng, randomSeed } from './rng.js';
import { chooseAction, normalizeVisitKey } from './strategy.js';
import { ACTIONS } from './actions.js';
import { discoverElements, markElement, runProbes, ghostSay } from './inject/probes.js';
import { IssueStore, normalizeMessage, normalizePath, resilienceScore, scoreGrade } from './issues.js';
import { XSS_MARKER } from './inputs.js';

const here = dirname(fileURLToPath(import.meta.url));
const OVERLAY_SOURCE = readFileSync(join(here, 'inject', 'overlay.js'), 'utf8');

const DUPLICATE_WINDOW_MS = 2500;
const SLOW_REQUEST_MS = 3000;
const MAX_SCREENSHOTS = 30;
const FRAME_INTERVAL_MS = 80;
const BACKGROUND_PROBE_MS = 1500;
const ACTION_TIMEOUT_MS = 12000;
const MONEY = /(pay|order|charge|checkout|payment|purchase|invoice|siparis|sipariş|odeme|ödeme)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);
const quiet = (p) => p.catch(() => null);

export const DEFAULTS = Object.freeze({ mode: 'safe', durationSec: 60, maxActions: 400, headed: false, confirmLive: false });

export class GhostSession extends EventEmitter {
  constructor(config) {
    super();
    const merged = { ...DEFAULTS, ...config };
    assertRunAllowed({ url: merged.url, modeId: merged.mode, confirmLive: merged.confirmLive });
    const durationSec = Math.min(Math.max(Number(merged.durationSec) || DEFAULTS.durationSec, 5), 900);
    this.config = Object.freeze({ ...merged, durationSec, seed: Number(merged.seed) || randomSeed() });
    this.mode = getMode(this.config.mode);
    this.origin = new URL(this.config.url).origin;
    this.rng = createRng(this.config.seed);
    this.issues = new IssueStore();
    this.counters = { actions: 0, clicks: 0, keystrokes: 0, requests: 0, mutations: 0, blocked: 0, jsErrors: 0, consoleErrors: 0 };
    this.actionLog = [];
    this.anomalies = [];
    this.memory = { hits: new Map(), visited: new Set(), lastKind: null, actionsOnPage: 0, viewportShakenOn: new Set(), navCount: 0 };
    this.currentAction = null;
    this.stopping = false;
    this.lastBlockedAt = 0;
    this.offlineUntil = 0;
    this.shots = 0;
    this.shotQueue = Promise.resolve();
    this.reqMeta = new WeakMap();
    this.blockedReqs = new WeakSet();
    this.dupGroups = new Map();
    this.phase = 'idle';
  }

  stop() {
    this.stopping = true;
  }

  snapshot() {
    const counts = this.issues.countsBySeverity();
    const score = resilienceScore(counts);
    return {
      phase: this.phase,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
      durationMs: this.config.durationSec * 1000,
      counters: { ...this.counters },
      pagesVisited: this.memory.visited.size,
      counts,
      score,
      grade: scoreGrade(score),
      url: this.page ? this.page.url() : this.config.url,
      viewport: this.page ? this.page.viewportSize() : null,
    };
  }

  setPhase(phase, message) {
    this.phase = phase;
    this.emit('status', { phase, message });
  }

  async run() {
    this.startedAt = Date.now();
    try {
      await this.launch();
      await this.loop();
      return await this.finish();
    } catch (err) {
      this.emit('error', { message: err.message });
      await this.cleanup();
      throw err;
    }
  }

  async launch() {
    this.setPhase('launching', 'Tarayıcı başlatılıyor…');
    this.browser = await launchBrowser({ headed: this.config.headed });
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, locale: 'tr-TR' });
    await this.context.addInitScript({ content: OVERLAY_SOURCE });
    await this.context.route('**/*', (route) => this.guardRoute(route));
    this.page = await this.context.newPage();
    this.attachMonitors(this.page);
    await this.startScreencast();
    this.setPhase('loading', `${this.config.url} açılıyor…`);
    const res = await this.page.goto(this.config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res) throw new Error('Sayfa yanıt vermedi.');
    await quiet(this.page.waitForLoadState('load', { timeout: 6000 }));
    this.lastGoodUrl = this.page.url();
    this.memory.visited.add(normalizeVisitKey(this.lastGoodUrl));
    await quiet(this.page.mouse.move(640, 400));
    await quiet(this.page.evaluate(ghostSay, { text: 'Bööö! Sabırsız hayalet geldi 👻' }));
  }

  /** Network-layer safety net: off-origin navigations are blocked; in Safe mode every mutation is blocked. */
  async guardRoute(route) {
    const req = route.request();
    try {
      if (req.isNavigationRequest() && req.frame() === this.page?.mainFrame()) {
        const target = new URL(req.url());
        if (target.origin !== this.origin && target.protocol.startsWith('http')) {
          this.blockedReqs.add(req);
          this.pushAnomaly('blocked', `Site dışına çıkış engellendi: ${target.origin}`);
          return await route.abort('blockedbyclient');
        }
      }
      if (!this.mode.allowMutations && isMutationMethod(req.method())) {
        this.blockedReqs.add(req);
        this.counters.blocked++;
        this.lastBlockedAt = Date.now();
        this.pushAnomaly('blocked', `Güvenli mod: ${req.method()} ${shortUrl(req.url())} engellendi`);
        return await route.abort('blockedbyclient');
      }
      return await route.continue();
    } catch {
      return undefined; // page closed or request already handled
    }
  }

  attachMonitors(page) {
    page.on('request', (req) => {
      this.counters.requests++;
      if (isMutationMethod(req.method())) this.counters.mutations++;
      let postData = null;
      try {
        postData = req.postData();
      } catch {
        postData = null;
      }
      this.reqMeta.set(req, { ts: Date.now(), method: req.method(), url: req.url(), type: req.resourceType(), postData: postData ? postData.slice(0, 500) : null });
    });
    page.on('requestfinished', (req) => quiet(this.onRequestFinished(req)));
    page.on('requestfailed', (req) => this.onRequestFailed(req));
    page.on('pageerror', (err) => this.onPageError(err));
    page.on('console', (msg) => this.onConsole(msg));
    page.on('dialog', (dialog) => {
      const message = dialog.message();
      if (message.includes(XSS_MARKER) || /^1$/.test(message)) this.reportXss(`alert("${message}") açıldı`);
      quiet(dialog.dismiss());
    });
    page.on('crash', () => {
      this.addIssue({ type: 'page-crash', severity: 'critical', fingerprint: 'crash', detail: 'Tarayıcı sekmesi çöktü.' });
    });
  }

  async onRequestFinished(req) {
    const meta = this.reqMeta.get(req);
    if (!meta) return;
    const res = await req.response();
    if (!res) return;
    const status = res.status();
    const duration = Date.now() - meta.ts;
    const path = normalizePath(meta.url);
    const apiLike = ['fetch', 'xhr', 'document'].includes(meta.type);

    if (apiLike && duration > SLOW_REQUEST_MS) {
      this.addIssue({
        type: 'slow-request',
        severity: duration > 8000 ? 'medium' : 'low',
        fingerprint: `slow|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} ${(duration / 1000).toFixed(1)} sn sürdü.`,
        evidence: [`${meta.method} ${meta.url} → ${status} (${duration} ms)`],
        request: { method: meta.method, url: meta.url },
      });
    }

    if (status >= 500) {
      this.pushAnomaly('network', `${status} ${meta.method} ${shortUrl(meta.url)}`);
      this.addIssue({
        type: 'server-error',
        severity: 'high',
        fingerprint: `5xx|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} isteği ${status} döndürdü.`,
        evidence: [`${meta.method} ${meta.url} → ${status}`, meta.postData ? `body: ${meta.postData}` : null].filter(Boolean),
        request: { method: meta.method, url: meta.url, status },
      });
    } else if (status >= 400 && status !== 401 && status !== 403) {
      this.pushAnomaly('network', `${status} ${meta.method} ${shortUrl(meta.url)}`);
      const resource = ['image', 'font', 'media'].includes(meta.type);
      this.addIssue({
        type: 'client-error',
        severity: resource ? 'low' : 'medium',
        fingerprint: `4xx|${status}|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} isteği ${status} döndürdü (${meta.type}).`,
        evidence: [`${meta.method} ${meta.url} → ${status}`],
        request: { method: meta.method, url: meta.url, status },
      });
    }

    if (isMutationMethod(meta.method) && status >= 200 && status < 300 && !isTelemetryUrl(meta.url)) {
      this.checkDuplicate(meta, status, duration);
    }
  }

  checkDuplicate(meta, status, duration) {
    const urlNoQuery = meta.url.split('?')[0];
    const key = `${meta.method} ${urlNoQuery} ${meta.postData || ''}`;
    const fresh = (this.dupGroups.get(key) || []).filter((e) => meta.ts - e.ts < DUPLICATE_WINDOW_MS);
    const group = [...fresh, { ts: meta.ts, status, duration }];
    this.dupGroups.set(key, group);
    if (group.length < 2) return;
    const money = MONEY.test(urlNoQuery) || MONEY.test(meta.postData || '');
    const first = group[0].ts;
    this.addIssue({
      type: 'double-submit',
      severity: money ? 'critical' : 'high',
      fingerprint: `dup|${meta.method}|${normalizePath(urlNoQuery)}`,
      detail: `${meta.method} ${shortUrl(urlNoQuery)} ${group.length} kez, ${group[group.length - 1].ts - first} ms içinde başarıyla işlendi${money ? ' — kullanıcıdan birden fazla ödeme/sipariş alınmış olabilir!' : '.'}`,
      evidence: group.map((g, i) => `#${i + 1} +${g.ts - first} ms  ${meta.method} ${urlNoQuery} → ${g.status} (${g.duration} ms)`).concat(meta.postData ? [`body: ${meta.postData}`] : []),
      request: { method: meta.method, url: urlNoQuery, body: meta.postData, count: group.length },
    });
  }

  onRequestFailed(req) {
    if (this.blockedReqs.has(req)) return;
    const meta = this.reqMeta.get(req) || { method: req.method(), url: req.url(), type: req.resourceType() };
    const errorText = (req.failure() && req.failure().errorText) || 'unknown';
    if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(errorText)) return; // navigation cancels, our own blocks
    if (Date.now() < this.offlineUntil || /INTERNET_DISCONNECTED/.test(errorText)) return;
    if (isTelemetryUrl(meta.url)) return;
    this.pushAnomaly('network', `${errorText} ${meta.method} ${shortUrl(meta.url)}`);
    this.addIssue({
      type: 'request-failed',
      severity: ['fetch', 'xhr', 'document', 'script'].includes(meta.type) ? 'medium' : 'low',
      fingerprint: `fail|${errorText}|${normalizePath(meta.url)}`,
      detail: `${meta.method} ${shortUrl(meta.url)} başarısız: ${errorText}`,
      evidence: [`${meta.method} ${meta.url} ✗ ${errorText}`],
    });
  }

  safeModeNote() {
    return !this.mode.allowMutations && Date.now() - this.lastBlockedAt < 2500;
  }

  onPageError(err) {
    this.counters.jsErrors++;
    const message = String(err.message || err);
    this.pushAnomaly('js', message);
    const blockedCause = this.safeModeNote();
    this.addIssue({
      type: 'js-exception',
      severity: blockedCause ? 'low' : 'high',
      fingerprint: `js|${normalizeMessage(message)}`,
      detail: message + (blockedCause ? ' (Güvenli modun engellediği bir istekten kaynaklanıyor olabilir.)' : ''),
      evidence: String(err.stack || message).split('\n').slice(0, 6),
    });
  }

  onConsole(msg) {
    const text = msg.text();
    if (text.includes(XSS_MARKER)) return this.reportXss(`console.log("${XSS_MARKER}") çalıştı`);
    if (msg.type() !== 'error') return undefined;
    if (/^Failed to load resource|ERR_BLOCKED_BY_CLIENT|ERR_INTERNET_DISCONNECTED/.test(text)) return undefined;
    this.counters.consoleErrors++;
    this.pushAnomaly('console', text);
    const blockedCause = this.safeModeNote();
    const loc = msg.location();
    return this.addIssue({
      type: 'console-error',
      severity: blockedCause ? 'low' : 'medium',
      fingerprint: `console|${normalizeMessage(text)}`,
      detail: text.slice(0, 300),
      evidence: [text.slice(0, 600), loc && loc.url ? `@ ${loc.url}:${loc.lineNumber}` : null].filter(Boolean),
    });
  }

  reportXss(how) {
    const field = this.currentAction && this.currentAction.target ? this.currentAction.target : 'bir alan';
    this.addIssue({
      type: 'xss',
      severity: 'critical',
      fingerprint: `xss|${normalizePath(this.page ? this.page.url() : '')}`,
      detail: `${field} içine yazılan HTML enjeksiyonu sayfada çalıştırıldı: ${how}.`,
      evidence: [how],
    });
  }

  pushAnomaly(kind, text) {
    const entry = { kind, text: String(text).slice(0, 240), at: Date.now() };
    this.anomalies.push(entry);
    if (this.anomalies.length > 300) this.anomalies.shift();
    this.emit('anomaly', entry);
  }

  /** Register an issue; new ones get highlighted on the page and screenshotted. */
  addIssue(partial) {
    const page = this.page;
    const enriched = {
      ...partial,
      url: page ? page.url() : this.config.url,
      viewport: page ? page.viewportSize() : null,
      triggerSeq: this.currentAction ? this.currentAction.seq : this.counters.actions,
      trigger: this.currentAction ? this.currentAction.label : 'sayfa yüklenirken',
      detectedAt: Date.now(),
    };
    const { issue, isNew } = this.issues.add(enriched);
    this.emit('issue', { issue: stripHeavy(issue), isNew });
    if (isNew) this.captureIssue(issue);
    return issue;
  }

  captureIssue(issue) {
    if (!this.page || this.shots >= MAX_SCREENSHOTS) return;
    this.shots++;
    this.shotQueue = this.shotQueue.then(async () => {
      const page = this.page;
      if (!page || page.isClosed()) return;
      await quiet(page.evaluate(ghostSay, { text: `🐞 ${issue.title}`, kind: 'bug' }));
      await quiet(page.evaluate(markElement, { id: issue.elementId || null, rect: issue.rect || null, severity: issue.severity, title: `${issue.id} · ${issue.title}` }));
      await sleep(220);
      const buf = await quiet(page.screenshot({ type: 'jpeg', quality: 55, timeout: 3000 }));
      if (buf) {
        const updated = this.issues.update(issue.fingerprint, { screenshot: buf.toString('base64') });
        if (updated) this.emit('issue', { issue: stripHeavy(updated), isNew: false, hasScreenshot: true });
      }
    });
  }

  async startScreencast() {
    try {
      this.cdp = await this.context.newCDPSession(this.page);
      let lastEmit = 0;
      this.cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
        quiet(this.cdp.send('Page.screencastFrameAck', { sessionId }));
        const now = Date.now();
        if (now - lastEmit < FRAME_INTERVAL_MS) return;
        lastEmit = now;
        this.emit('frame', { data, width: metadata.deviceWidth, height: metadata.deviceHeight });
      });
      await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 1280, maxHeight: 1100, everyNthFrame: 1 });
      if (this.mode.cpuThrottle > 1) await this.cdp.send('Emulation.setCPUThrottlingRate', { rate: this.mode.cpuThrottle });
    } catch {
      this.cdp = null; // live view is optional; the run continues without it
    }
  }

  /** Run in-page probes and convert findings into issues. */
  async probe(reason) {
    if (!this.page || this.page.isClosed() || this.probing) return;
    this.probing = true;
    try {
      const r = await withTimeout(quiet(this.page.evaluate(runProbes, { spinnerTimeoutMs: this.mode.spinnerTimeoutMs })), 4000);
      if (r) this.handleProbe(r, reason);
    } finally {
      this.probing = false;
    }
  }

  handleProbe(r, reason) {
    const path = normalizePath(r.url);
    const vp = `${r.viewport.width}×${r.viewport.height}`;
    if (r.overflow && r.overflow.culprits.length) {
      const c = r.overflow.culprits[0];
      const extra = r.overflow.scrollWidth - r.overflow.viewportWidth;
      this.addIssue({
        type: 'layout-overflow',
        severity: extra > 80 ? 'high' : 'medium',
        fingerprint: `overflow|${path}|${c.desc}`,
        detail: `${vp} ekranda sayfa ${extra}px taşıyor. Taşan eleman: ${c.desc}${c.text ? ` (“${c.text.slice(0, 40)}”)` : ''}.`,
        evidence: r.overflow.culprits.map((x) => `${x.desc} → ekranın ${x.by}px dışına çıkıyor`).concat([`document.scrollWidth=${r.overflow.scrollWidth}, viewport=${r.overflow.viewportWidth}`, reason ? `tetik: ${reason}` : null].filter(Boolean)),
        elementId: c.id,
        rect: c.rect,
        selectorHint: c.desc,
      });
    }
    for (const o of r.obscured) {
      this.addIssue({
        type: 'obscured-element',
        severity: o.cta ? 'high' : 'medium',
        fingerprint: `obscured|${o.text || o.desc}|${o.coverer.desc}`,
        detail: `“${o.text || o.desc}” elemanının üstünü ${o.coverer.desc}${o.coverer.text ? ` (“${o.coverer.text.slice(0, 30)}”)` : ''} kapatıyor (${vp}).`,
        evidence: [`kapanan: ${o.desc}`, `kapatan: ${o.coverer.desc}`],
        elementId: o.id,
        rect: o.rect,
        selectorHint: o.desc,
      });
    }
    for (const g of r.garbage) {
      this.addIssue({
        type: 'garbage-render',
        severity: /[₺$€£]|\d/.test(g.text) ? 'high' : 'medium',
        fingerprint: `garbage|${g.token}|${g.desc}`,
        detail: `Ekranda “${g.text}” görünüyor (${g.token}).`,
        evidence: [`${g.desc}: “${g.text}”`],
        elementId: g.id,
        rect: g.rect,
        token: g.token,
      });
    }
    for (const s of r.spinners) {
      this.addIssue({
        type: 'stuck-spinner',
        severity: 'high',
        fingerprint: `spinner|${s.desc}`,
        detail: `${s.desc}${s.text ? ` (“${s.text.slice(0, 30)}”)` : ''} ${(s.ageMs / 1000).toFixed(0)} saniyedir ekranda dönüyor.`,
        evidence: [`${s.desc} görünür süre: ${s.ageMs} ms`],
        elementId: s.id,
        rect: s.rect,
        selectorHint: s.desc,
      });
    }
    if (r.blank) {
      this.addIssue({ type: 'blank-screen', severity: 'high', fingerprint: `blank|${path}`, detail: `${path} sayfası boş görünüyor.`, evidence: ['body metni boş, görsel yok'] });
    }
    const worst = r.longTasks.reduce((m, t) => Math.max(m, t.d), 0);
    if (worst >= 500) {
      this.addIssue({
        type: 'ui-freeze',
        severity: worst >= 2000 ? 'high' : 'medium',
        fingerprint: `freeze|${path}`,
        detail: `Ana thread ${worst} ms boyunca kilitlendi; bu sürede sayfa tepkisizdi.`,
        evidence: r.longTasks.filter((t) => t.d >= 200).slice(0, 5).map((t) => `long task ${t.d} ms @${t.t} ms`),
      });
    }
  }

  async ensureOnTarget() {
    const url = this.page.url();
    let ok = false;
    try {
      ok = new URL(url).origin === this.origin;
    } catch {
      ok = false;
    }
    if (ok) {
      this.lastGoodUrl = url;
      return;
    }
    this.pushAnomaly('nav', `Hedef dışına çıkıldı (${shortUrl(url)}), geri dönülüyor`);
    await quiet(this.page.goto(this.lastGoodUrl || this.config.url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  }

  async loop() {
    this.setPhase('running', 'Hayalet saldırıyor…');
    const deadline = this.startedAt + this.config.durationSec * 1000;
    const bg = setInterval(() => quiet(this.probe('arka plan')), BACKGROUND_PROBE_MS);
    const statsTimer = setInterval(() => this.emit('stats', this.snapshot()), 500);
    let pageKey = normalizeVisitKey(this.page.url());
    try {
      await this.probe('ilk yükleme');
      while (!this.stopping && Date.now() < deadline && this.counters.actions < this.config.maxActions) {
        if (this.page.isClosed()) break;
        await this.ensureOnTarget();
        const snap = await withTimeout(quiet(this.page.evaluate(discoverElements)), 5000);
        if (!snap) {
          await sleep(400);
          continue;
        }
        const elements = this.memory.visited.size >= this.mode.maxPages ? snap.elements.filter((e) => e.tag !== 'a') : snap.elements;
        const cand = chooseAction({ elements, mode: this.mode, origin: this.origin, memory: this.memory, pageKey }, this.rng);
        if (!cand) {
          await sleep(300);
          continue;
        }
        await this.perform(cand);
        const nowKey = normalizeVisitKey(this.page.url());
        if (nowKey !== pageKey) {
          this.memory.navCount++;
          this.memory.actionsOnPage = 0;
          pageKey = nowKey;
        } else {
          this.memory.actionsOnPage++;
        }
        this.memory.visited.add(nowKey);
        await this.probe(cand.kind);
        await sleep(this.rng.int(this.mode.paceMs[0], this.mode.paceMs[1]));
      }
    } finally {
      clearInterval(bg);
      clearInterval(statsTimer);
    }
  }

  async perform(cand) {
    const seq = this.counters.actions + 1;
    const preview = describeCandidate(cand);
    this.currentAction = { seq, label: preview, target: cand.el ? cand.el.text : null };
    this.emit('action', { seq, kind: cand.kind, label: preview, phase: 'start', at: Date.now() });
    const ctx = { page: this.page, context: this.context, rng: this.rng, mode: this.mode, counters: this.counters, probe: (r) => this.probe(r) };
    if (cand.kind === 'offline') this.offlineUntil = Date.now() + 2500;
    const step = await withTimeout(quiet(ACTIONS[cand.kind](ctx, cand)), ACTION_TIMEOUT_MS);
    this.counters.actions = seq;
    this.memory.lastKind = cand.kind;
    if (cand.hitKey) this.memory.hits.set(cand.hitKey, (this.memory.hits.get(cand.hitKey) || 0) + 1);
    if (cand.kind === 'viewport') this.memory.viewportShakenOn.add(normalizeVisitKey(this.page.url()));
    if (step) {
      const record = { seq, at: Date.now(), ...step };
      this.actionLog.push(record);
      this.emit('action', { seq, kind: cand.kind, label: step.label, phase: 'done', at: record.at });
      if (step.dead && cand.el) {
        this.addIssue({
          type: 'dead-click',
          severity: 'low',
          fingerprint: `dead|${normalizePath(step.urlBefore)}|${cand.el.text}`,
          detail: `${step.target} tıklandı ama hiçbir şey olmadı (DOM, ağ ve URL değişmedi).`,
          evidence: [step.locator],
          elementId: cand.el.id,
        });
      }
    }
    this.currentAction = null;
  }

  async finish() {
    this.setPhase('finishing', 'Rapor hazırlanıyor…');
    await sleep(1200); // let in-flight requests land
    await this.probe('bitiş');
    await quiet(this.shotQueue);
    const report = this.buildReport();
    await this.cleanup();
    this.setPhase('done', 'Bitti');
    this.emit('done', report);
    return report;
  }

  buildReport() {
    const snap = this.snapshot();
    const issues = this.issues.list().map((issue) => ({ ...issue, steps: stepsFor(issue, this.actionLog) }));
    return {
      tool: 'RageGhost',
      version: '1.0.0',
      target: this.config.url,
      origin: this.origin,
      mode: { id: this.mode.id, label: this.mode.label },
      seed: this.config.seed,
      startedAt: this.startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - this.startedAt,
      stats: { ...snap.counters, pagesVisited: snap.pagesVisited },
      counts: snap.counts,
      score: snap.score,
      grade: snap.grade,
      issues,
      actions: this.actionLog,
      anomalies: this.anomalies.slice(-150),
    };
  }

  async cleanup() {
    try {
      if (this.cdp) await quiet(this.cdp.send('Page.stopScreencast'));
      if (this.browser) await this.browser.close();
    } catch {
      /* already closed */
    }
    this.browser = null;
  }
}

/** Steps leading to an issue: up to 5 actions before (and including) the trigger. */
export function stepsFor(issue, actionLog) {
  const upto = issue.triggerSeq || 0;
  return actionLog.filter((a) => a.seq <= upto && a.seq > upto - 5);
}

function describeCandidate(c) {
  const t = c.el && c.el.text ? `“${c.el.text.slice(0, 30)}”` : '';
  const names = {
    rageClick: `Öfke tıkı ${t}`,
    type: `Kaotik yazı ${t}`,
    select: `Seçim karıştır ${t}`,
    navigate: `Link ${t}`,
    backForward: 'Geri/ileri spam',
    viewport: 'Ekran sarsıntısı',
    scroll: 'Scroll çılgınlığı',
    keys: 'Klavye ezme',
    reload: 'F5 spam',
    offline: 'Wi-Fi koptu',
  };
  return names[c.kind] || c.kind;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`.slice(0, 90);
  } catch {
    return String(url).slice(0, 90);
  }
}

export function stripHeavy(issue) {
  const { screenshot, ...rest } = issue;
  return { ...rest, hasScreenshot: Boolean(screenshot) };
}
