// StampedeSession: one run of the swarm against one URL. Agents (personas) run in parallel tabs
// and share one issue store. Emits: status, decision, action, outcome, issue, anomaly, frame, stats, done, error
import { EventEmitter } from 'node:events';
import { launchBrowser } from './browser.js';
import { assertRunAllowed, getMode } from './safety.js';
import { randomSeed } from './rng.js';
import { IssueStore, categoryScores, resilienceScore, scoreGrade } from './issues.js';
import { auditCookies } from './detectors.js';
import { markElement, ghostSay } from './inject/probes.js';
import { buildRoster } from './personas.js';
import { Agent } from './agent.js';
import { getScreen, parkCursor, tileLayout } from '../util/desktop.js';
import { aiEnabled, planAttack, reviewScreenshot, summarizeIssues } from '../ai/gemini.js';
import { classifyElement, zoneOf } from './safety.js';
import { discoverElements } from './inject/probes.js';

const MAX_SCREENSHOTS = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (p) => p.catch(() => null);

export const DEFAULTS = Object.freeze({ mode: 'safe', durationSec: 60, maxActions: 400, headed: false, confirmLive: false, personas: ['rage'] });

/** Test identity used by the auth autopilot. The password never appears in reports. */
export function resolveCredentials(input, seed, env = process.env) {
  const email = (input && input.email) || env.STAMPEDE_EMAIL || `stampede+${seed}@example.test`;
  const password = (input && input.password) || env.STAMPEDE_PASSWORD || `Stp-${seed}-Aa!9`;
  let n = 0;
  return Object.freeze({
    email,
    password,
    generated: !(input && input.email) && !env.STAMPEDE_EMAIL,
    signupEmail(code) {
      const [local, domain] = email.split('@');
      n += 1;
      return `${local}+${String(code).toLowerCase()}-${n}@${domain || 'example.test'}`;
    },
  });
}

export class StampedeSession extends EventEmitter {
  constructor(config) {
    super();
    const merged = { ...DEFAULTS, ...config };
    assertRunAllowed({ url: merged.url, modeId: merged.mode, confirmLive: merged.confirmLive });
    const durationSec = Math.min(Math.max(Number(merged.durationSec) || DEFAULTS.durationSec, 5), 900);
    const seed = Number(merged.seed) || randomSeed();
    this.roster = buildRoster(merged.personas);
    this.config = Object.freeze({ ...merged, durationSec, seed, credentials: undefined, personas: this.roster.map((r) => r.persona.id) });
    this.credentials = resolveCredentials(merged.credentials, seed);
    this.mode = getMode(this.config.mode);
    this.origin = new URL(this.config.url).origin;
    this.issues = new IssueStore();
    this.issueOwners = new Map();
    this.actionLog = [];
    this.anomalies = [];
    this.agents = [];
    this.focusAgent = this.roster[0].id;
    this.stopping = false;
    this.shots = 0;
    this.shotQueue = Promise.resolve();
    this.phase = 'idle';
    this.aiOn = merged.ai !== false && aiEnabled();
    this.ai = { enabled: this.aiOn, plan: null, summary: null, visual: [], errors: [] };
  }

  stop() {
    this.stopping = true;
  }

  setFocus(agentId) {
    if (!this.roster.some((r) => r.id === agentId)) return;
    this.focusAgent = agentId;
    for (const a of this.agents) a.applyStreamQuality(a.id === agentId).catch(() => null);
  }

  /** Replace any occurrence of the test password with a mask. */
  maskSecrets(text) {
    const pw = this.credentials.password;
    return pw ? String(text).split(pw).join('••••••') : String(text);
  }

  get counters() {
    const total = { actions: 0, clicks: 0, keystrokes: 0, requests: 0, mutations: 0, blocked: 0, jsErrors: 0, consoleErrors: 0 };
    for (const a of this.agents) for (const k of Object.keys(total)) total[k] += a.counters[k];
    return total;
  }

  issueCountFor(agentId) {
    let n = 0;
    for (const owner of this.issueOwners.values()) if (owner === agentId) n++;
    return n;
  }

  snapshot() {
    const counts = this.issues.countsBySeverity();
    const score = resilienceScore(counts);
    const visited = new Set();
    for (const a of this.agents) for (const v of a.memory.visited) visited.add(v);
    return {
      phase: this.phase,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
      durationMs: this.config.durationSec * 1000,
      counters: this.counters,
      pagesVisited: visited.size,
      counts,
      score,
      grade: scoreGrade(score),
      categories: categoryScores(this.issues.list()),
      agents: this.agents.map((a) => ({
        id: a.id,
        url: a.page ? a.page.url() : this.config.url,
        viewport: a.page && !a.page.isClosed() ? a.page.viewportSize() : null,
        actions: a.counters.actions,
        issues: this.issueCountFor(a.id),
      })),
    };
  }

  setPhase(phase, message) {
    this.phase = phase;
    this.emit('status', { phase, message });
  }

  async run() {
    this.startedAt = Date.now();
    try {
      this.setPhase('launching', 'Tarayıcı başlatılıyor');
      this.browser = await launchBrowser({ headed: this.config.headed });
      this.agents = this.roster.map((slot, i) => new Agent(this, slot, i));
      this.setPhase('loading', `${this.agents.length} ajan sayfayı açıyor`);
      const screen = this.config.headed ? await getScreen() : null;
      const tiles = screen ? tileLayout(this.agents.length, screen) : [];
      await Promise.all(this.agents.map((a, i) => a.start(this.browser, tiles[i] || null)));
      // Keep the human's pointer off the agent windows: a hovering mouse would interfere with them.
      if (screen) await parkCursor(screen);
      if (this.aiOn) this.planPromise = this.runPlanner();
      this.setPhase('running', 'Sürü saldırıyor');
      const deadline = this.startedAt + this.config.durationSec * 1000;
      const statsTimer = setInterval(() => this.emit('stats', this.snapshot()), 500);
      try {
        await Promise.all(this.agents.map((a) => a.loop(deadline)));
      } finally {
        clearInterval(statsTimer);
      }
      return await this.finish();
    } catch (err) {
      this.emit('error', { message: err.message });
      await this.cleanup();
      throw err;
    }
  }

  pushAnomaly(agent, kind, text) {
    const entry = { agent, kind, text: this.maskSecrets(String(text)).slice(0, 240), at: Date.now() };
    this.anomalies.push(entry);
    if (this.anomalies.length > 300) this.anomalies.shift();
    this.emit('anomaly', entry);
  }

  recordAction(record) {
    this.actionLog.push(record);
  }

  /** Register an issue found by an agent; new ones get highlighted, screenshotted and filmed. */
  addIssue(agent, partial) {
    const page = agent.page;
    const defined = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined));
    const enriched = {
      url: page && !page.isClosed() ? page.url() : this.config.url,
      viewport: page && !page.isClosed() ? page.viewportSize() : null,
      triggerSeq: agent.currentAction ? agent.currentAction.seq : agent.counters.actions,
      trigger: agent.currentAction ? agent.currentAction.label : agent.counters.actions ? 'arka plan kontrolü' : 'sayfa yüklenirken',
      ...defined,
      agent: agent.id,
      agentCode: agent.slot.code,
      agentLabel: agent.slot.label,
      detectedAt: Date.now(),
    };
    const { issue, isNew } = this.issues.add(enriched);
    if (isNew) this.issueOwners.set(issue.fingerprint, agent.id);
    this.emit('issue', { issue: stripHeavy(issue), isNew });
    if (isNew) this.captureIssue(agent, issue);
    return issue;
  }

  captureIssue(agent, issue) {
    if (this.shots >= MAX_SCREENSHOTS) return;
    this.shots++;
    const film = agent.filmAround(issue.detectedAt);
    this.shotQueue = this.shotQueue.then(async () => {
      const page = agent.page;
      if (!page || page.isClosed()) return;
      await quiet(page.evaluate(ghostSay, { text: `${issue.id}  ${issue.title.toUpperCase()}`, kind: 'bug' }));
      await quiet(page.evaluate(markElement, { id: issue.elementId || null, rect: issue.rect || null, severity: issue.severity, title: `${issue.id} · ${issue.title}` }));
      await sleep(200);
      const buf = await quiet(page.screenshot({ type: 'jpeg', quality: 55, timeout: 3000 }));
      if (!buf) return;
      const shot = buf.toString('base64');
      const updated = this.issues.update(issue.fingerprint, { screenshot: shot, film: [...film, { label: 'Hata anı', data: shot }] });
      if (updated) this.emit('issue', { issue: stripHeavy(updated), isNew: false });
    });
  }

  // ---------- optional AI (Gemini) ----------

  aiError(stage, err) {
    const message = `${stage}: ${err && err.message ? err.message : err}`;
    this.ai.errors.push(message);
    this.pushAnomaly(this.roster[0].id, 'ai', `AI ${message}`);
  }

  /** One planner call with a compact view of the first agent's page; agents keep running meanwhile. */
  async runPlanner() {
    try {
      const first = this.agents[0];
      const snap = await first.page.evaluate(discoverElements);
      const page = {
        url: snap.url,
        title: snap.title,
        hasLoginForm: Boolean(snap.auth),
        elements: snap.elements.slice(0, 70).map((e) => {
          const cls = classifyElement(e, this.origin);
          return { text: e.text, tag: e.tag, type: e.type, zone: zoneOf(e, cls), category: cls.category };
        }),
      };
      const kinds = new Map();
      for (const r of this.roster) kinds.set(r.persona.id, { id: r.persona.id, label: r.persona.label, moves: r.persona.allow.filter((k) => k !== 'offline') });
      const plan = await planAttack({ page, personas: [...kinds.values()] });
      this.ai.plan = { ...plan, steps: plan.steps.map((s, index) => ({ ...s, index, status: 'pending', by: null })) };
      this.emit('aiplan', this.ai.plan);
      this.pushAnomaly(this.roster[0].id, 'ai', `AI planı hazır: ${plan.steps.length} adım (${plan.model})`);
    } catch (err) {
      this.aiError('planlayıcı', err);
    }
  }

  aiHintsFor(agent) {
    if (!this.ai.plan) return null;
    return this.ai.plan.steps.filter((s) => s.status === 'pending' && s.persona === agent.persona.id);
  }

  completeAiStep(index, agent, ok) {
    const step = this.ai.plan && this.ai.plan.steps[index];
    if (!step || step.status !== 'pending') return;
    step.status = ok ? 'done' : 'skipped';
    step.by = agent.slot.code;
    this.emit('aiplan', this.ai.plan);
  }

  async runAiReview() {
    this.setPhase('finishing', 'AI görsel inceleme');
    const shots = await Promise.all(
      this.agents.slice(0, 4).map(async (a) => {
        if (!a.page || a.page.isClosed()) return null;
        const buf = await quiet(a.page.screenshot({ type: 'jpeg', quality: 60, timeout: 3000 }));
        return buf ? { agent: a, data: buf.toString('base64'), url: a.page.url(), viewport: a.page.viewportSize() } : null;
      }),
    );
    const results = await Promise.allSettled(shots.filter(Boolean).map((s) => reviewScreenshot({ jpegBase64: s.data, url: s.url, viewport: s.viewport }).then((r) => ({ ...r, shot: s }))));
    for (const r of results) {
      if (r.status === 'rejected') {
        this.aiError('görsel inceleme', r.reason);
        continue;
      }
      const { findings, shot } = r.value;
      this.ai.visual.push({ agent: shot.agent.slot.code, url: shot.url, findings });
      for (const f of findings) {
        this.addIssue(shot.agent, {
          type: 'ai-visual',
          severity: f.severity,
          fingerprint: `ai-visual|${f.title}`,
          detail: `${f.title}: ${f.detail}`,
          evidence: [`Gemini görsel inceleme · ${shot.url} · ${shot.viewport ? `${shot.viewport.width}×${shot.viewport.height}` : ''}`],
          trigger: 'AI görsel inceleme',
        });
      }
    }
    await quiet(this.shotQueue);
    this.setPhase('finishing', 'AI kök neden özeti');
    try {
      const issues = this.issues.list();
      if (issues.length) this.ai.summary = await summarizeIssues({ target: this.config.url, issues });
    } catch (err) {
      this.aiError('özet', err);
    }
  }

  async finish() {
    this.setPhase('finishing', 'Rapor hazırlanıyor');
    await sleep(1200); // let in-flight requests land
    await Promise.all(this.agents.map((a) => a.probe('bitiş')));
    if (this.aiOn) {
      await quiet(Promise.resolve(this.planPromise));
      await this.runAiReview();
    }
    for (const a of this.agents) {
      const cookies = (await quiet(a.context.cookies())) || [];
      for (const draft of auditCookies(cookies, this.config.url)) this.addIssue(a, draft);
    }
    await quiet(this.shotQueue);
    const report = this.buildReport();
    await this.cleanup();
    this.setPhase('done', 'Bitti');
    this.emit('done', report);
    return report;
  }

  buildReport() {
    const snap = this.snapshot();
    const byAgent = Object.fromEntries(this.agents.map((a) => [a.id, a.log]));
    const issues = this.issues.list().map((issue) => ({ ...issue, steps: stepsFor(issue, byAgent[issue.agent] || []) }));
    return {
      tool: 'Stampede',
      version: '2.0.0',
      target: this.config.url,
      origin: this.origin,
      mode: { id: this.mode.id, label: this.mode.label },
      seed: this.config.seed,
      personas: this.roster.map((r) => ({ id: r.id, persona: r.persona.id, code: r.code, label: r.label, color: r.color, summary: r.persona.summary, actions: (byAgent[r.id] || []).length, issues: this.issueCountFor(r.id) })),
      identity: { email: this.credentials.email, password: '••••••', generated: this.credentials.generated },
      startedAt: this.startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - this.startedAt,
      stats: { ...snap.counters, pagesVisited: snap.pagesVisited },
      counts: snap.counts,
      score: snap.score,
      grade: snap.grade,
      categories: categoryScores(issues),
      ai: this.ai,
      issues,
      actions: this.actionLog,
      anomalies: this.anomalies.slice(-150),
    };
  }

  async cleanup() {
    await Promise.all(this.agents.map((a) => a.close()));
    if (this.browser) await quiet(this.browser.close());
    this.browser = null;
  }
}

/** Steps leading to an issue: up to 5 of the finding agent's actions before (and including) the trigger. */
export function stepsFor(issue, actionLog) {
  const upto = issue.triggerSeq || 0;
  return actionLog.filter((a) => a.seq <= upto && a.seq > upto - 5);
}

export function stripHeavy(issue) {
  const { screenshot, film, ...rest } = issue;
  return { ...rest, hasScreenshot: Boolean(screenshot), filmFrames: film ? film.length : 0 };
}
