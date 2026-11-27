// One agent = one persona in its own browser context/tab. It sees, decides, acts and watches.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMutationMethod, isTelemetryUrl } from './safety.js';
import { createRng } from './rng.js';
import { decide, normalizeVisitKey, withMemoryDefaults } from './strategy.js';
import { MOVES, MOVE_LABEL } from './moves.js';
import { discoverElements, ghostSay, ghostScan, runProbes } from './inject/probes.js';
import { normalizeMessage, normalizePath } from './issues.js';
import { findSecretInText, probeToIssues, sensitiveKeys, trackDomGrowth } from './detectors.js';
import { XSS_MARKER } from './inputs.js';

const here = dirname(fileURLToPath(import.meta.url));
const OVERLAY_SOURCE = readFileSync(join(here, 'inject', 'overlay.js'), 'utf8');

const DUPLICATE_WINDOW_MS = 2500;
const SLOW_REQUEST_MS = 3000;
const BACKGROUND_PROBE_MS = 1500;
const ACTION_TIMEOUT_MS = 14000;
const FILM_INTERVAL_MS = 150;
const FILM_FRAMES = 32;
const MAX_BODY_SCANS = 150;
// A form rejecting chaotic input with 400/409/422/429 is correct behaviour, not a bug.
const VALIDATION_STATUS = new Set([400, 409, 422, 429]);
const MONEY = /(pay|order|charge|checkout|payment|purchase|invoice|siparis|sipariş|odeme|ödeme)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => null)]);
const quiet = (p) => p.catch(() => null);

export function shortUrl(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`.slice(0, 90);
  } catch {
    return String(url).slice(0, 90);
  }
}

export class Agent {
  constructor(session, persona, index) {
    this.session = session;
    this.persona = persona;
    this.id = persona.id;
    this.mode = session.mode;
    this.origin = session.origin;
    this.rng = createRng(session.config.seed + index * 7919);
    this.memory = withMemoryDefaults({ hits: new Map(), visited: new Set(), lastKind: null, actionsOnPage: 0, viewportShakenOn: new Set(), navCount: 0, unreachableChecked: new Set() });
    this.counters = { actions: 0, clicks: 0, keystrokes: 0, requests: 0, mutations: 0, blocked: 0, jsErrors: 0, consoleErrors: 0 };
    this.log = [];
    this.film = [];
    this.reqMeta = new WeakMap();
    this.blockedReqs = new WeakSet();
    this.dupGroups = new Map();
    this.domTrend = {};
    this.bodyScans = 0;
    this.currentAction = null;
    this.lastBlockedAt = 0;
    this.offlineUntil = 0;
    this.lastCorrupt = null;
    this.lastPress = null;
    this.probing = false;
  }

  emit(event, data) {
    this.session.emit(event, { agent: this.id, ...data });
  }

  pageKey() {
    return normalizeVisitKey(this.page.url());
  }

  async start(browser) {
    this.context = await browser.newContext({ ...this.persona.context, ignoreHTTPSErrors: true, locale: 'tr-TR' });
    const agentInfo = JSON.stringify({ code: this.persona.code, tag: this.persona.tag, color: this.persona.color });
    await this.context.addInitScript({ content: `window.__STAMPEDE_AGENT=${agentInfo};\n${OVERLAY_SOURCE}` });
    await this.context.route('**/*', (route) => this.guardRoute(route));
    this.page = await this.context.newPage();
    this.attachMonitors(this.page);
    await this.startScreencast();
    const res = await this.page.goto(this.session.config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res) throw new Error('Sayfa yanıt vermedi.');
    await quiet(this.page.waitForLoadState('load', { timeout: 6000 }));
    this.lastGoodUrl = this.page.url();
    this.memory.visited.add(normalizeVisitKey(this.lastGoodUrl));
    await sleep(500); // overlay mounts shortly after load
    const vp = this.page.viewportSize() || { width: 1280, height: 800 };
    if (!this.persona.touch) await quiet(this.page.mouse.move(vp.width / 2, vp.height / 2));
    await quiet(this.page.evaluate(ghostSay, { text: `${this.persona.code} ${this.persona.label.toUpperCase()} BAŞLADI` }));
  }

  /** Network-layer safety net: off-origin navigations are blocked; in Safe mode every mutation is blocked. */
  async guardRoute(route) {
    const req = route.request();
    try {
      if (req.isNavigationRequest() && req.frame() === req.frame().page().mainFrame()) {
        const target = new URL(req.url());
        if (target.origin !== this.origin && target.protocol.startsWith('http')) {
          this.blockedReqs.add(req);
          this.session.pushAnomaly(this.id, 'blocked', `Site dışına çıkış engellendi: ${target.origin}`);
          return await route.abort('blockedbyclient');
        }
      }
      if (!this.mode.allowMutations && isMutationMethod(req.method())) {
        this.blockedReqs.add(req);
        this.counters.blocked++;
        this.lastBlockedAt = Date.now();
        this.session.pushAnomaly(this.id, 'blocked', `Güvenli mod: ${req.method()} ${shortUrl(req.url())} engellendi`);
        return await route.abort('blockedbyclient');
      }
      if (this.mode.id === 'stress' && ['fetch', 'xhr'].includes(req.resourceType()) && req.method() === 'GET' && this.rng.chance(0.12)) {
        return await this.corruptResponse(route);
      }
      return await route.continue();
    } catch {
      return undefined; // page closed or request already handled
    }
  }

  /** Stress mode: tamper with a JSON API answer on its way to the page. */
  async corruptResponse(route) {
    const response = await route.fetch();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return route.fulfill({ response });
    let body = await response.text();
    let how;
    try {
      const json = JSON.parse(body);
      const variant = this.rng.int(0, 3);
      if (variant === 0) {
        body = 'null';
        how = 'yanıt null yapıldı';
      } else if (variant === 1) {
        body = Array.isArray(json) ? '[]' : '{}';
        how = 'yanıt boşaltıldı';
      } else if (variant === 2) {
        body = body.slice(0, Math.max(1, Math.floor(body.length / 2)));
        how = 'JSON yarıda kesildi';
      } else {
        body = JSON.stringify(Array.isArray(json) ? Array.from({ length: 2000 }, (_, i) => json[i % Math.max(json.length, 1)] ?? null) : { ...json, items: null, data: null });
        how = Array.isArray(json) ? '2000 elemanlı dev liste' : 'alanlar null yapıldı';
      }
    } catch {
      return route.fulfill({ response });
    }
    this.lastCorrupt = { at: Date.now(), how, url: route.request().url() };
    this.session.pushAnomaly(this.id, 'chaos', `API yanıtı bozuldu (${how}): ${shortUrl(route.request().url())}`);
    return route.fulfill({ response, body });
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
      const action = this.currentAction;
      this.reqMeta.set(req, {
        ts: Date.now(),
        method: req.method(),
        url: req.url(),
        type: req.resourceType(),
        postData: postData ? this.session.maskSecrets(postData.slice(0, 500)) : null,
        seq: action ? action.seq : this.counters.actions,
        actionLabel: action ? action.label : null,
      });
    });
    // 'response' fires at headers; 'requestfinished' never fires when the app does not read the body.
    page.on('response', (res) => this.onResponse(res));
    page.on('requestfailed', (req) => this.onRequestFailed(req));
    page.on('pageerror', (err) => this.onPageError(err));
    page.on('console', (msg) => this.onConsole(msg));
    page.on('dialog', (dialog) => {
      const message = dialog.message();
      if (message.includes(XSS_MARKER)) this.reportXss(`alert("${message}") açıldı`);
      quiet(dialog.dismiss());
    });
    page.on('crash', () => this.report({ type: 'page-crash', severity: 'critical', fingerprint: 'crash', detail: 'Tarayıcı sekmesi çöktü.' }));
  }

  onResponse(res) {
    const meta = this.reqMeta.get(res.request());
    if (!meta) return;
    const status = res.status();
    const duration = Date.now() - meta.ts;
    const path = normalizePath(meta.url);
    const apiLike = ['fetch', 'xhr', 'document'].includes(meta.type);
    const origin = { triggerSeq: meta.seq, trigger: meta.actionLabel || undefined };

    if (apiLike && duration > SLOW_REQUEST_MS) {
      this.report({
        type: 'slow-request',
        severity: duration > 8000 ? 'medium' : 'low',
        fingerprint: `slow|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} ${(duration / 1000).toFixed(1)} sn sürdü.`,
        evidence: [`${meta.method} ${meta.url} → ${status} (${duration} ms)`],
        request: { method: meta.method, url: meta.url, status },
        ...origin,
      });
    }
    if (status >= 500) {
      this.session.pushAnomaly(this.id, 'network', `${status} ${meta.method} ${shortUrl(meta.url)}`);
      this.report({
        type: 'server-error',
        severity: 'high',
        fingerprint: `5xx|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} isteği ${status} döndürdü.`,
        evidence: [`${meta.method} ${meta.url} → ${status}`, meta.postData ? `body: ${meta.postData}` : null].filter(Boolean),
        request: { method: meta.method, url: meta.url, status },
        ...origin,
      });
    } else if (status >= 400 && status !== 401 && status !== 403 && !(isMutationMethod(meta.method) && VALIDATION_STATUS.has(status))) {
      this.session.pushAnomaly(this.id, 'network', `${status} ${meta.method} ${shortUrl(meta.url)}`);
      const resource = ['image', 'font', 'media'].includes(meta.type);
      this.report({
        type: 'client-error',
        severity: resource ? 'low' : 'medium',
        fingerprint: `4xx|${status}|${meta.method}|${path}`,
        detail: `${meta.method} ${shortUrl(meta.url)} isteği ${status} döndürdü (${meta.type}).`,
        evidence: [`${meta.method} ${meta.url} → ${status}`],
        request: { method: meta.method, url: meta.url, status },
        ...origin,
      });
    }
    if (isMutationMethod(meta.method) && status >= 200 && status < 300 && !isTelemetryUrl(meta.url)) this.checkDuplicate(meta, status, duration);
    if (['fetch', 'xhr'].includes(meta.type) && status < 400 && this.bodyScans < MAX_BODY_SCANS) this.scanBody(res, meta);
  }

  scanBody(res, meta) {
    const ct = res.headers()['content-type'] || '';
    const len = Number(res.headers()['content-length'] || 0);
    if (!ct.includes('json') || len > 300000) return;
    this.bodyScans++;
    quiet(
      res.text().then((text) => {
        let keys = [];
        try {
          keys = sensitiveKeys(JSON.parse(text));
        } catch {
          keys = [];
        }
        if (!keys.length) return;
        this.report({
          type: 'data-leak',
          severity: 'high',
          fingerprint: `leak-api|${normalizePath(meta.url)}|${keys.join(',')}`,
          detail: `${meta.method} ${shortUrl(meta.url)} yanıtı tarayıcıya hassas alan(lar) gönderiyor: ${keys.join(', ')}.`,
          evidence: [`${meta.method} ${meta.url}`, `alanlar: ${keys.join(', ')}`],
          request: { method: meta.method, url: meta.url },
          triggerSeq: meta.seq,
        });
      }),
    );
  }

  checkDuplicate(meta, status, duration) {
    const urlNoQuery = meta.url.split('?')[0];
    const key = `${meta.method} ${urlNoQuery} ${meta.postData || ''}`;
    // Only requests born from the same impatient burst count; two deliberate actions are not a double submit.
    const fresh = (this.dupGroups.get(key) || []).filter((e) => e.seq === meta.seq && meta.ts - e.ts < DUPLICATE_WINDOW_MS);
    const group = [...fresh, { ts: meta.ts, status, duration, seq: meta.seq, actionLabel: meta.actionLabel }];
    this.dupGroups.set(key, group);
    if (group.length < 2) return;
    const money = MONEY.test(urlNoQuery) || MONEY.test(meta.postData || '');
    const first = group[0].ts;
    this.report({
      type: 'double-submit',
      severity: money ? 'critical' : 'high',
      fingerprint: `dup|${meta.method}|${normalizePath(urlNoQuery)}`,
      detail: `${meta.method} ${shortUrl(urlNoQuery)} tek bir sabırsız tık serisinde ${group.length} kez, ${group[group.length - 1].ts - first} ms içinde başarıyla işlendi${money ? '. Müşteriden birden fazla kez ödeme/sipariş alınmış olabilir.' : '.'}`,
      evidence: group.map((g, i) => `#${i + 1} +${g.ts - first} ms  ${meta.method} ${urlNoQuery} → ${g.status} (${g.duration} ms)`).concat(meta.postData ? [`body: ${meta.postData}`] : []),
      request: { method: meta.method, url: urlNoQuery, body: meta.postData, count: group.length },
      triggerSeq: group[0].seq,
      trigger: group[0].actionLabel || undefined,
    });
  }

  onRequestFailed(req) {
    if (this.blockedReqs.has(req)) return;
    const meta = this.reqMeta.get(req) || { method: req.method(), url: req.url(), type: req.resourceType() };
    const errorText = (req.failure() && req.failure().errorText) || 'unknown';
    if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(errorText)) return; // navigation cancels, our own blocks
    if (Date.now() < this.offlineUntil || /INTERNET_DISCONNECTED/.test(errorText)) return;
    if (isTelemetryUrl(meta.url)) return;
    this.session.pushAnomaly(this.id, 'network', `${errorText} ${meta.method} ${shortUrl(meta.url)}`);
    this.report({
      type: 'request-failed',
      severity: ['fetch', 'xhr', 'document', 'script'].includes(meta.type) ? 'medium' : 'low',
      fingerprint: `fail|${errorText}|${normalizePath(meta.url)}`,
      detail: `${meta.method} ${shortUrl(meta.url)} başarısız: ${errorText}`,
      evidence: [`${meta.method} ${meta.url} ✗ ${errorText}`],
    });
  }

  blockedCause() {
    return !this.mode.allowMutations && Date.now() - this.lastBlockedAt < 2500;
  }

  onPageError(err) {
    this.counters.jsErrors++;
    const message = String(err.message || err);
    this.session.pushAnomaly(this.id, 'js', message);
    if (this.lastCorrupt && Date.now() - this.lastCorrupt.at < 2500) {
      this.report({
        type: 'fragile-api',
        severity: 'high',
        fingerprint: `fragile|${normalizeMessage(message)}`,
        detail: `API yanıtı bozulduğunda (${this.lastCorrupt.how}) arayüz çöktü: ${message}`,
        evidence: [`bozulan istek: ${this.lastCorrupt.url}`, ...String(err.stack || message).split('\n').slice(0, 4)],
      });
      return;
    }
    const blocked = this.blockedCause();
    this.report({
      type: 'js-exception',
      severity: blocked ? 'low' : 'high',
      fingerprint: `js|${normalizeMessage(message)}`,
      detail: message + (blocked ? ' (Güvenli modun engellediği bir istekten kaynaklanıyor olabilir.)' : ''),
      evidence: String(err.stack || message).split('\n').slice(0, 6),
    });
  }

  onConsole(msg) {
    const text = msg.text();
    // Only the payload's own call logs exactly the marker; an app echoing the typed text is not execution.
    if (text.trim() === XSS_MARKER) return this.reportXss(`console.log("${XSS_MARKER}") çalıştı`);
    const secret = findSecretInText(text, this.session.credentials);
    if (secret) {
      this.report({
        type: 'data-leak',
        severity: 'high',
        fingerprint: `leak-console|${secret}`,
        detail: `Tarayıcı konsoluna ${secret} yazıldı; konsolu açan herkes (ve hata izleme araçları) görebilir.`,
        evidence: [this.session.maskSecrets(text.slice(0, 300))],
      });
    }
    if (msg.type() !== 'error') return undefined;
    if (/^Failed to load resource|ERR_BLOCKED_BY_CLIENT|ERR_INTERNET_DISCONNECTED/.test(text)) return undefined;
    this.counters.consoleErrors++;
    this.session.pushAnomaly(this.id, 'console', text);
    const blocked = this.blockedCause();
    const loc = msg.location();
    return this.report({
      type: 'console-error',
      severity: blocked ? 'low' : 'medium',
      fingerprint: `console|${normalizeMessage(text)}`,
      detail: this.session.maskSecrets(text.slice(0, 300)),
      evidence: [this.session.maskSecrets(text.slice(0, 600)), loc && loc.url ? `@ ${loc.url}:${loc.lineNumber}` : null].filter(Boolean),
    });
  }

  reportXss(how) {
    const field = this.currentAction && this.currentAction.target ? `“${this.currentAction.target}”` : 'bir alan';
    this.report({
      type: 'xss',
      severity: 'critical',
      fingerprint: `xss|${normalizePath(this.page ? this.page.url() : '')}`,
      detail: `${field} içine yazılan HTML sayfada kod olarak çalıştı: ${how}.`,
      evidence: [how],
    });
  }

  report(partial) {
    return this.session.addIssue(this, partial);
  }

  async startScreencast() {
    try {
      this.cdp = await this.context.newCDPSession(this.page);
      let lastEmit = 0;
      let lastFilm = 0;
      this.cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
        quiet(this.cdp.send('Page.screencastFrameAck', { sessionId }));
        const now = Date.now();
        if (now - lastFilm >= FILM_INTERVAL_MS) {
          lastFilm = now;
          this.film.push({ t: now, data, w: metadata.deviceWidth, h: metadata.deviceHeight });
          if (this.film.length > FILM_FRAMES) this.film.shift();
        }
        const interval = this.session.focusAgent === this.id ? 90 : 320;
        if (now - lastEmit < interval) return;
        lastEmit = now;
        this.emit('frame', { data, width: metadata.deviceWidth, height: metadata.deviceHeight });
      });
      await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 960, maxHeight: 960, everyNthFrame: 1 });
      if (this.mode.cpuThrottle > 1) await this.cdp.send('Emulation.setCPUThrottlingRate', { rate: this.mode.cpuThrottle });
    } catch {
      this.cdp = null; // live view is optional; the run continues without it
    }
  }

  /** Frames around an incident: ~2 s before, the press, and (added later) the moment of detection. */
  filmAround(detectedAt) {
    const nearest = (t) => this.film.reduce((best, f) => (!best || Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), null);
    const before = nearest(detectedAt - 2000);
    const press = this.lastPress && detectedAt - this.lastPress.at < 6000 ? nearest(this.lastPress.at + 120) : null;
    const strip = [];
    if (before) strip.push({ label: `${((detectedAt - before.t) / 1000).toFixed(1)} sn önce`, data: before.data });
    if (press && press !== before) {
      const vp = this.lastPress.viewport || { width: press.w, height: press.h };
      strip.push({ label: 'Tık anı', data: press.data, point: { x: this.lastPress.x / vp.width, y: this.lastPress.y / vp.height } });
    }
    return strip;
  }

  async probe(reason) {
    if (!this.page || this.page.isClosed() || this.probing) return;
    this.probing = true;
    try {
      const r = await withTimeout(quiet(this.page.evaluate(runProbes, { spinnerTimeoutMs: this.mode.spinnerTimeoutMs })), 4000);
      if (!r) return;
      for (const draft of probeToIssues(r, reason, this.page.viewportSize())) this.report(draft);
      const [trend, leak] = trackDomGrowth(this.domTrend, normalizeVisitKey(r.url), r.nodeCount);
      this.domTrend = trend;
      if (leak) this.report(leak);
    } finally {
      this.probing = false;
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
    this.session.pushAnomaly(this.id, 'nav', `Hedef dışına çıkıldı (${shortUrl(url)}), geri dönülüyor`);
    await quiet(this.page.goto(this.lastGoodUrl || this.session.config.url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  }

  async openTwin() {
    const twin = await quiet(this.context.newPage());
    if (twin) this.attachMonitors(twin);
    return twin;
  }

  async loop(deadline) {
    const bg = setInterval(() => quiet(this.probe('arka plan')), BACKGROUND_PROBE_MS);
    let pageKey = this.pageKey();
    try {
      await this.probe('ilk yükleme');
      while (!this.session.stopping && Date.now() < deadline && this.counters.actions < this.session.config.maxActions) {
        if (this.page.isClosed()) break;
        await this.ensureOnTarget();
        const snap = await withTimeout(quiet(this.page.evaluate(discoverElements)), 5000);
        if (!snap) {
          await sleep(400);
          continue;
        }
        const elements = this.memory.visited.size >= this.mode.maxPages ? snap.elements.filter((e) => e.tag !== 'a') : snap.elements;
        const { choice, ranked } = decide({ elements, snapshot: snap, mode: this.mode, origin: this.origin, memory: this.memory, pageKey, persona: this.persona }, this.rng);
        if (!choice) {
          await sleep(300);
          continue;
        }
        await this.showDecision(choice, ranked);
        await this.perform(choice);
        const nowKey = this.pageKey();
        if (nowKey !== pageKey) {
          this.memory.navCount++;
          this.memory.actionsOnPage = 0;
          pageKey = nowKey;
        } else {
          this.memory.actionsOnPage++;
        }
        this.memory.visited.add(nowKey);
        await this.probe(choice.kind);
        await sleep(this.rng.int(this.mode.paceMs[0], this.mode.paceMs[1]));
      }
    } finally {
      clearInterval(bg);
    }
  }

  candidateLabel(c) {
    const text = c.el && c.el.text ? ` “${c.el.text.slice(0, 26)}”` : '';
    return `${MOVE_LABEL[c.kind] || c.kind}${text}`;
  }

  /** Publish the decision (brain view) and draw the attack map on the page. */
  async showDecision(choice, ranked) {
    const top = ranked.slice(0, 8);
    if (!top.includes(choice)) top[top.length - 1] = choice;
    const zones = {};
    for (const c of ranked) zones[c.zone || 'page'] = (zones[c.zone || 'page'] || 0) + c.p;
    this.emit('decision', {
      seq: this.counters.actions + 1,
      zones,
      candidates: top.map((c) => ({ kind: c.kind, label: this.candidateLabel(c), zone: c.zone || 'page', p: Number(c.p.toFixed(3)), chosen: c === choice })),
      considered: ranked.length,
    });
    const targets = top.filter((c) => c.el).slice(0, 6).map((c) => ({ id: c.el.id, p: c.p, pick: c === choice }));
    if (targets.length) await quiet(this.page.evaluate(ghostScan, { targets }));
    await sleep(this.mode.id === 'safe' ? 350 : 220);
  }

  async perform(cand) {
    const seq = this.counters.actions + 1;
    const label = this.candidateLabel(cand);
    this.currentAction = { seq, label, target: cand.el ? cand.el.text : null, startedAt: Date.now() };
    this.emit('action', { seq, kind: cand.kind, label, phase: 'start', at: Date.now() });
    const issuesBefore = this.session.issueCountFor(this.id);
    const reqBefore = this.counters.requests;
    const ctx = {
      page: this.page,
      context: this.context,
      cdp: this.cdp,
      rng: this.rng,
      mode: this.mode,
      persona: this.persona,
      memory: this.memory,
      counters: this.counters,
      credentials: this.session.credentials,
      agentCode: this.persona.code,
      probe: (r) => this.probe(r),
      report: (p) => this.report(p),
      pageKey: () => this.pageKey(),
      openTwin: () => this.openTwin(),
      setOfflineWindow: (ms) => {
        this.offlineUntil = Date.now() + ms;
      },
    };
    // Remember where the last press landed (for the film strip).
    Object.defineProperty(ctx, 'lastPoint', {
      set: (pt) => {
        if (pt) this.lastPress = { ...pt, at: Date.now(), viewport: this.page.viewportSize() };
      },
      get: () => this.lastPress,
    });
    if (cand.kind === 'offline') this.offlineUntil = Date.now() + 2500;
    const jsErrorsBefore = this.counters.jsErrors;
    const step = await withTimeout(quiet(MOVES[cand.kind](ctx, cand)), ACTION_TIMEOUT_MS);
    this.counters.actions = seq;
    this.memory.lastKind = cand.kind;
    const priorHits = cand.hitKey ? this.memory.hits.get(cand.hitKey) || 0 : 0;
    if (cand.hitKey) this.memory.hits.set(cand.hitKey, priorHits + 1);
    if (cand.kind === 'viewport') this.memory.viewportShakenOn.add(this.pageKey());
    if (cand.kind === 'twinTab') this.memory.twinOn.add(this.pageKey());
    // Only a first-ever interaction without a JS error can prove a button dead.
    if (step && step.dead && (priorHits > 0 || this.counters.jsErrors !== jsErrorsBefore)) step.dead = false;
    if (step) {
      const record = { seq, agent: this.id, code: this.persona.code, at: Date.now(), ...step };
      this.log.push(record);
      this.session.recordAction(record);
      this.emit('action', { seq, kind: cand.kind, label: step.label, phase: 'done', at: record.at });
      if (step.dead && cand.el) {
        this.report({
          type: 'dead-click',
          severity: 'low',
          fingerprint: `dead|${normalizePath(step.urlBefore)}|${cand.el.text}`,
          detail: `${step.target} ${step.kind === 'keyActivate' ? 'klavyeyle tetiklendi' : 'tıklandı'} ama hiçbir şey olmadı (DOM, ağ, URL ve kaydırma değişmedi).`,
          evidence: [step.locator],
          elementId: cand.el.id,
        });
      }
    }
    this.emit('outcome', {
      seq,
      kind: cand.kind,
      ok: Boolean(step),
      dead: Boolean(step && step.dead),
      requests: this.counters.requests - reqBefore,
      issues: this.session.issueCountFor(this.id) - issuesBefore,
    });
    this.currentAction = null;
  }

  async close() {
    try {
      if (this.cdp) await quiet(this.cdp.send('Page.stopScreencast'));
      if (this.context) await quiet(this.context.close());
    } catch {
      /* already closed */
    }
  }
}
