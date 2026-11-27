// Stampede dashboard client. All target-derived text goes through textContent (never innerHTML).
import { createBrain } from './brain.js';

const $ = (id) => document.getElementById(id);
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const SEV_LABEL = { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const SEV_SHAPE = {
  critical: '<path d="M4.5 0 9 4.5 4.5 9 0 4.5z" fill="currentColor"/>',
  high: '<path d="M4.5 .5 9 8.5H0z" fill="currentColor"/>',
  medium: '<circle cx="4.5" cy="4.5" r="4" fill="currentColor"/>',
  low: '<rect x=".75" y=".75" width="7.5" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};
const PHASE_LABEL = { idle: 'Hazır', launching: 'Tarayıcı açılıyor', loading: 'Ajanlar sayfayı açıyor', running: 'Sürü çalışıyor', finishing: 'Bitiriliyor', done: 'Bitti', failed: 'Hata' };
const ANOM_LABEL = { js: 'JS', console: 'KONSOL', network: 'AĞ', blocked: 'ENGEL', nav: 'NAV', chaos: 'KAOS', auth: 'GİRİŞ', ai: 'AI' };
const FPS_FOCUS = 10;
const FPS_OTHER = 3;

const state = {
  config: null,
  counts: {},
  roster: new Map(), // agent id -> { id, code, label, color, viewport }
  order: [],
  running: false,
  focus: null,
  expanded: false,
  brainView: 'all',
  issues: new Map(),
  newIssues: new Set(),
  anomCount: 0,
  history: [],
  open: null,
  renderQueued: false,
};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const svgUse = (id, cls) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) svg.setAttribute('class', cls);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
};
const sevShape = (sev) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 9 9');
  svg.setAttribute('class', 'sev-shape');
  svg.innerHTML = SEV_SHAPE[sev]; // static, author-controlled markup
  return svg;
};
const agentOf = (id) => state.roster.get(id) || { id, code: '?', label: id, color: '#9ba6b1' };
const agentChip = (id) => {
  const a = agentOf(id);
  return h('span', { class: 'chip-agent', style: `--agent:${a.color}`, title: a.label }, a.code);
};
const infoBtn = (text) => h('button', { class: 'info', type: 'button', 'data-tip': text, 'aria-label': 'Bilgi' }, svgUse('i-info'));
const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- tooltips (one floating element for every (i) button) ----------
const tip = $('tip');
let tipOwner = null;
function showTip(btn) {
  tipOwner = btn;
  tip.textContent = btn.dataset.tip;
  tip.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-describedby', 'tip');
  const r = btn.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
  let top = r.bottom + 8;
  if (top + th > window.innerHeight - 8) top = r.top - th - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function hideTip() {
  if (tipOwner) {
    tipOwner.setAttribute('aria-expanded', 'false');
    tipOwner.removeAttribute('aria-describedby');
  }
  tipOwner = null;
  tip.hidden = true;
}
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.info');
  if (b) showTip(b);
  else if (tipOwner && !e.target.closest('.tip')) hideTip();
});
document.addEventListener('focusin', (e) => {
  const b = e.target.closest('.info');
  if (b) showTip(b);
});
document.addEventListener('focusout', (e) => {
  if (e.target.closest('.info')) hideTip();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('.info');
  if (b) {
    e.preventDefault();
    if (tipOwner === b) hideTip();
    else showTip(b);
  }
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && hideTip());
window.addEventListener('scroll', hideTip, { passive: true });

// ---------- setup form ----------
const urlInput = $('url');
const modeValue = () => document.querySelector('input[name=mode]:checked').value;
const totalAgents = () => Object.values(state.counts).reduce((s, n) => s + n, 0);
const rosterList = () => state.config.personas.flatMap((p) => Array.from({ length: state.counts[p.id] || 0 }, () => p.id));

function renderPersonaPicker() {
  const { maxAgents, maxPerPersona } = state.config.limits;
  const total = totalAgents();
  $('swarmCount').textContent = `${total} / ${maxAgents}`;
  $('swarmCount').classList.toggle('full', total >= maxAgents);
  $('personaPicker').replaceChildren(
    ...state.config.personas.map((p) => {
      const n = state.counts[p.id] || 0;
      const set = (delta) => {
        state.counts[p.id] = Math.min(maxPerPersona, Math.max(0, n + delta));
        renderPersonaPicker();
      };
      return h(
        'div',
        { class: `prow${n ? ' on' : ''}` },
        h('span', { class: 'pname' }, p.label),
        infoBtn(`${p.summary}\nEkran: ${p.viewport.width}×${p.viewport.height}`),
        h(
          'span',
          { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': `${p.label} azalt`, disabled: n === 0 || state.running, onclick: () => set(-1) }, '−'),
          h('output', { 'aria-live': 'polite' }, String(n)),
          h('button', { type: 'button', 'aria-label': `${p.label} artır`, disabled: n >= maxPerPersona || total >= maxAgents || state.running, onclick: () => set(1) }, '+'),
        ),
      );
    }),
  );
}

async function refreshTargetUi() {
  let local = true;
  const target = urlInput.value.trim();
  try {
    const res = await fetch(`/api/check-url?url=${encodeURIComponent(target)}`);
    local = (await res.json()).data.local;
  } catch {
    local = true;
  }
  $('liveConfirm').hidden = local || modeValue() === 'safe';
  let isDemo = false;
  try {
    isDemo = new URL(target).origin === new URL(state.config.demoUrl).origin;
  } catch {
    isDemo = false;
  }
  $('resetRow').hidden = !isDemo;
}
urlInput.addEventListener('input', refreshTargetUi);
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', refreshTargetUi));
document.querySelectorAll('.link-btn').forEach((b) =>
  b.addEventListener('click', () => {
    urlInput.value = b.dataset.url;
    if (b.dataset.mode) document.querySelector(`input[name=mode][value=${b.dataset.mode}]`).checked = true;
    refreshTargetUi();
  }),
);

$('start').addEventListener('click', async () => {
  $('formError').textContent = '';
  const personas = rosterList();
  if (!personas.length) {
    $('formError').textContent = 'En az bir ajan seçin.';
    return;
  }
  const email = $('email').value.trim();
  const password = $('password').value;
  const body = {
    url: urlInput.value.trim(),
    mode: modeValue(),
    durationSec: Number($('duration').value),
    seed: $('seed').value ? Number($('seed').value) : undefined,
    headed: $('headed').checked,
    confirmLive: $('confirmLive').checked,
    personas,
    credentials: email || password ? { email, password } : undefined,
    resetDemo: $('resetDemo').checked,
    ai: $('aiToggle').checked,
  };
  $('start').disabled = true;
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    $('seed').placeholder = `son: ${json.data.seed}`;
  } catch (err) {
    $('formError').textContent = err.message;
    $('start').disabled = false;
  }
});
$('stop').addEventListener('click', () => fetch('/api/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    for (const p of ['issues', 'feed', 'anoms']) $(`panel-${p}`).hidden = p !== b.dataset.tab;
  }),
);

function setRunning(running) {
  state.running = running;
  $('start').disabled = running;
  $('stop').disabled = !running;
  document.querySelectorAll('.setup input, .setup select, .link-btn').forEach((el) => {
    el.disabled = running;
  });
  if (!state.config.ai) $('aiToggle').disabled = true;
  renderPersonaPicker();
}
function setPhase(phase, message) {
  $('runState').dataset.phase = phase;
  $('stateLabel').textContent = phase === 'finishing' && message ? message : PHASE_LABEL[phase] || phase;
}

// ---------- swarm tiles ----------
const tiles = new Map();
const streamUrl = (id) => `/api/stream/${encodeURIComponent(id)}?fps=${id === state.focus ? FPS_FOCUS : FPS_OTHER}&t=${Date.now()}`;

function buildTiles(list, idle = false) {
  const box = $('tiles');
  tiles.clear();
  box.replaceChildren();
  box.dataset.count = String(list.length);
  box.classList.remove('focused');
  for (const a of list) {
    const img = h('img', { alt: `${a.label} canlı görüntüsü`, decoding: 'async' });
    const now = h('span', { class: 'now' }, idle ? 'Bekliyor' : 'Hazırlanıyor');
    const meta = h('span', { class: 'meta' });
    const vp = h('span', { class: 'vp' }, `${a.viewport.width}×${a.viewport.height}`);
    const focusBtn = h('button', { class: 'focus-btn', type: 'button', title: 'Büyüt', 'aria-label': `${a.label} görünümünü büyüt` }, svgUse('i-expand'));
    const tile = h(
      'article',
      { class: 'tile', style: `--agent:${a.color}`, 'data-agent': a.id },
      h('div', { class: 'tile-head' }, h('span', { class: 'agent-code' }, a.code), h('span', { class: 'name' }, a.label), vp, focusBtn),
      h('div', { class: 'screen' }, idle ? h('p', { class: 'idle-msg' }, 'Başlatınca bu sekme canlı akar.') : img),
      h('div', { class: 'tile-foot' }, now, meta),
    );
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.focus-btn')) state.expanded = !(state.expanded && state.focus === a.id);
      setFocus(a.id);
    });
    box.append(tile);
    tiles.set(a.id, { tile, img, now, meta, vp });
  }
}

function setFocus(id) {
  const prev = state.focus;
  state.focus = id;
  for (const [tid, t] of tiles) {
    t.tile.classList.toggle('is-focus', tid === id);
    if ((tid === id || tid === prev) && state.running) t.img.src = streamUrl(tid);
  }
  $('tiles').classList.toggle('focused', state.expanded && tiles.size > 1);
  if (state.running) fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: id }) });
}

function buildBrainTabs() {
  const box = $('brainTabs');
  const tab = (id, label, color) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.brainView === id), style: color ? `--agent:${color}` : null, onclick: () => setBrainView(id) }, color ? h('span', { class: 'dot' }) : null, label);
  box.replaceChildren(tab('all', 'Tümü'), ...state.order.map((id) => tab(id, agentOf(id).code, agentOf(id).color)));
}
function setBrainView(v) {
  state.brainView = v;
  brain.setView(v);
  buildBrainTabs();
}

let brain;

// ---------- score & lists ----------
function renderScore(s) {
  $('score').textContent = s.score;
  $('grade').textContent = s.grade && s.grade.grade ? `${s.grade.grade} · ${s.grade.label}` : '—';
  state.history.push(s.score);
  if (state.history.length > 160) state.history.shift();
  const n = state.history.length;
  const y = (v) => 44 - (v / 100) * 40;
  const pts = n === 1 ? `0,${y(s.score)} 160,${y(s.score)}` : state.history.map((v, i) => `${(i / (n - 1)) * 160},${y(v)}`).join(' ');
  $('historyLine').setAttribute('points', pts);
  $('history').style.color = s.score >= 75 ? 'var(--signal)' : s.score >= 45 ? 'var(--med)' : 'var(--crit)';
  const sev = $('sevCounts');
  if (!sev.children.length) sev.replaceChildren(...SEV_ORDER.map((k) => h('li', { 'data-sev': k }, h('b', {}, '0'), h('span', { class: `sev ${k}` }, sevShape(k), SEV_LABEL[k]))));
  for (const li of sev.children) {
    const v = String(s.counts[li.dataset.sev]);
    const b = li.querySelector('b');
    if (b.textContent !== v) {
      b.textContent = v;
      li.classList.remove('bump');
      void li.offsetWidth;
      li.classList.add('bump');
    }
  }
  if (s.categories) {
    const cats = $('cats');
    if (cats.children.length !== s.categories.length) {
      cats.replaceChildren(...s.categories.map((c) => h('li', {}, h('span', {}, c.label), h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: 'display:block' })), h('span', { class: 'num' }))));
    }
    s.categories.forEach((c, i) => {
      const li = cats.children[i];
      li.querySelector('.num').textContent = String(c.score);
      const fill = li.querySelector('.bar-fill');
      fill.style.transform = `scaleX(${Math.max(0.02, c.score / 100)})`;
      fill.style.background = c.score >= 75 ? 'var(--signal)' : c.score >= 45 ? 'var(--med)' : 'var(--crit)';
    });
  }
}

function renderStats(s) {
  renderScore(s);
  const c = s.counters;
  const rows = [
    [c.actions, 'hamle'],
    [c.clicks, 'tık'],
    [c.requests, 'istek'],
    [c.blocked, 'engellenen'],
    [s.pagesVisited, 'sayfa'],
  ];
  const dl = $('stats');
  if (!dl.children.length) dl.replaceChildren(...rows.map(([, l]) => h('div', {}, h('dt', {}, l), h('dd', {}, '0'))));
  rows.forEach(([v], i) => {
    dl.children[i].querySelector('dd').textContent = String(v);
  });
  $('clock').textContent = `${fmtClock(s.elapsedMs)} / ${fmtClock(s.durationMs)}`;
  for (const a of s.agents || []) {
    const t = tiles.get(a.id);
    if (!t) continue;
    if (a.viewport) t.vp.textContent = `${a.viewport.width}×${a.viewport.height}`;
    t.meta.replaceChildren(h('b', {}, String(a.actions)), ' hamle · ', h('b', {}, String(a.issues)), ' sorun');
  }
}

function issueNode(issue) {
  const node = h(
    'article',
    { class: `issue${state.newIssues.has(issue.fingerprint) ? ' new' : ''}${state.open === issue.fingerprint ? ' open' : ''}`, tabindex: '0' },
    h('div', { class: 'row' }, h('span', { class: `sev ${issue.severity}` }, sevShape(issue.severity), SEV_LABEL[issue.severity]), issue.agent ? agentChip(issue.agent) : null, h('span', { class: 'title' }, issue.title), h('span', { class: 'times' }, `${issue.occurrences}×`)),
    h('p', { class: 'detail' }, issue.detail),
    h(
      'div',
      { class: 'more' },
      h('h4', {}, 'Ne anlama geliyor'),
      h('p', {}, issue.meaning),
      h('h4', {}, 'Nasıl düzeltilir'),
      h('p', { class: 'fix' }, issue.fix),
      h('h4', {}, 'Nerede'),
      h('p', {}, `${issue.id} · ${issue.agentLabel || ''} · tetik: ${issue.trigger}`),
      h('pre', {}, [issue.url, ...(issue.evidence || [])].filter(Boolean).join('\n')),
    ),
  );
  const toggle = () => {
    state.open = state.open === issue.fingerprint ? null : issue.fingerprint;
    node.classList.toggle('open', state.open === issue.fingerprint);
  };
  node.addEventListener('click', toggle);
  node.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()));
  return node;
}

function renderIssues() {
  state.renderQueued = false;
  const list = [...state.issues.values()].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.detectedAt - b.detectedAt);
  $('tIssues').textContent = String(list.length);
  if (list.length) $('panel-issues').replaceChildren(...list.map(issueNode));
  state.newIssues.clear();
}
const queueIssues = () => {
  if (!state.renderQueued) {
    state.renderQueued = true;
    requestAnimationFrame(renderIssues);
  }
};

function onIssue({ agent, issue, isNew }) {
  state.issues.set(issue.fingerprint, issue);
  if (isNew) {
    state.newIssues.add(issue.fingerprint);
    const t = tiles.get(agent || issue.agent);
    if (t && (issue.severity === 'critical' || issue.severity === 'high')) {
      t.tile.classList.remove('hit');
      void t.tile.offsetWidth;
      t.tile.classList.add('hit');
    }
  }
  queueIssues();
}

function onAction(a) {
  const t = tiles.get(a.agent);
  if (a.phase === 'start') {
    if (t) t.now.textContent = `#${a.seq}  ${a.label}`;
    return;
  }
  const panel = $('panel-feed');
  panel.prepend(h('div', { class: 'feed-item' }, agentChip(a.agent), h('span', { class: 'seq' }, `#${a.seq}`), h('span', {}, a.label)));
  while (panel.children.length > 150) panel.lastChild.remove();
}

function onAnomaly(a) {
  state.anomCount++;
  $('tAnoms').textContent = String(state.anomCount);
  const panel = $('panel-anoms');
  panel.prepend(h('div', { class: `anom ${a.kind}` }, agentChip(a.agent), h('span', { class: 'k' }, ANOM_LABEL[a.kind] || a.kind), h('span', {}, a.text)));
  while (panel.children.length > 200) panel.lastChild.remove();
}

// ---------- AI ----------
function renderAiPlan(plan) {
  $('aiPanel').hidden = false;
  $('aiModel').textContent = plan.model || '';
  $('aiSummary').textContent = plan.summary || '';
  $('aiSteps').replaceChildren(
    ...plan.steps.map((s) =>
      h('li', { class: s.status }, h('span', { class: 'mono' }, s.by || s.persona), h('span', {}, `${s.kind}${s.target ? ` · “${s.target}”` : ''}`), h('span', { class: 'why' }, s.reason)),
    ),
  );
}
function renderAiReport(ai) {
  if (!ai || !ai.enabled) return;
  $('aiPanel').hidden = false;
  if (ai.plan) renderAiPlan(ai.plan);
  const box = $('aiFixes');
  const parts = [];
  if (ai.summary) {
    $('aiSummary').textContent = ai.summary.headline;
    $('aiModel').textContent = ai.summary.model || $('aiModel').textContent;
    parts.push(...ai.summary.fixes.map((f) => h('p', { class: 'ai-fix' }, h('b', {}, `${f.priority}. ${f.title}`), h('span', {}, f.detail))));
  }
  if (ai.errors && ai.errors.length) parts.push(h('p', { class: 'note' }, `AI uyarısı: ${ai.errors.join(' · ')}`));
  box.replaceChildren(...parts);
}

function showReport(r) {
  setRunning(false);
  setPhase('done');
  const base = `/reports/${encodeURIComponent(r.reportName)}`;
  $('reportText').textContent = `${r.issues.length} sorun · ${r.stats.actions} hamle · seed ${r.seed}`;
  const link = (href, label, ic, cls, download) => h('a', { class: cls, href, target: '_blank', rel: 'noopener', download }, svgUse(ic), label);
  $('reportLinks').replaceChildren(
    link(`${base}/report.html`, 'HTML rapor', 'i-file', 'main'),
    link(`${base}/stampede.spec.ts`, 'Playwright testleri', 'i-code', null, 'stampede.spec.ts'),
    link(`${base}/report.md`, 'MD', 'i-file'),
    link(`${base}/report.json`, 'JSON', 'i-file'),
  );
  $('reportPanel').hidden = false;
  for (const i of r.issues) state.issues.set(i.fingerprint, i);
  queueIssues();
  renderScore(r);
  renderAiReport(r.ai);
}

function resetBoard() {
  state.issues.clear();
  state.anomCount = 0;
  state.history = [];
  state.open = null;
  $('panel-issues').replaceChildren(h('p', { class: 'empty' }, 'Sorunlar önem sırasına göre burada listelenir.'));
  $('panel-feed').replaceChildren();
  $('panel-anoms').replaceChildren();
  $('tIssues').textContent = '0';
  $('tAnoms').textContent = '0';
  $('reportPanel').hidden = true;
  $('aiPanel').hidden = true;
  $('aiSteps').replaceChildren();
  $('aiFixes').replaceChildren();
  $('aiSummary').textContent = '';
  $('formError').textContent = '';
  $('brainCaption').textContent = '';
  brain.reset();
}

// ---------- live stream ----------
function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('error', () => {
    if (!state.running) $('stateLabel').textContent = 'Bağlantı yok';
  });
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    setRunning(d.running);
    setPhase(d.running ? 'running' : 'idle');
    for (const i of d.issues) state.issues.set(i.fingerprint, i);
    queueIssues();
    if (d.snapshot) renderStats(d.snapshot);
    if (!d.running && d.lastReport) showReport(d.lastReport);
  });
  es.addEventListener('started', (e) => {
    const d = JSON.parse(e.data);
    resetBoard();
    state.roster = new Map(d.personas.map((a) => [a.id, a]));
    state.order = d.personas.map((a) => a.id);
    setRunning(true);
    buildTiles(d.personas);
    state.expanded = false;
    setFocus(state.order[0]);
    for (const [id, t] of tiles) t.img.src = streamUrl(id);
    brain.setAgents(state.order);
    setBrainView('all');
  });
  es.addEventListener('status', (e) => {
    const d = JSON.parse(e.data);
    setPhase(d.phase, d.message);
  });
  es.addEventListener('stats', (e) => renderStats(JSON.parse(e.data)));
  es.addEventListener('decision', (e) => {
    const d = JSON.parse(e.data);
    brain.decision(d.agent, d);
    if (state.brainView === 'all' || state.brainView === d.agent) {
      const chosen = d.candidates.find((c) => c.chosen);
      if (chosen) $('brainCaption').textContent = `${agentOf(d.agent).code} #${d.seq} · ${d.considered} aday · seçilen: ${chosen.label} (%${Math.round(chosen.p * 100)})${chosen.ai ? ' · AI planı' : ''}`;
    }
  });
  es.addEventListener('outcome', (e) => {
    const d = JSON.parse(e.data);
    brain.outcome(d.agent, d);
  });
  es.addEventListener('aiplan', (e) => renderAiPlan(JSON.parse(e.data)));
  es.addEventListener('action', (e) => onAction(JSON.parse(e.data)));
  es.addEventListener('issue', (e) => onIssue(JSON.parse(e.data)));
  es.addEventListener('anomaly', (e) => onAnomaly(JSON.parse(e.data)));
  es.addEventListener('done', (e) => showReport(JSON.parse(e.data)));
  es.addEventListener('failed', (e) => {
    setRunning(false);
    setPhase('failed');
    $('formError').textContent = `Çalıştırma hatası: ${JSON.parse(e.data).message}`;
  });
}

async function boot() {
  const res = await fetch('/api/config');
  state.config = (await res.json()).data;
  for (const id of state.config.defaultSwarm) state.counts[id] = (state.counts[id] || 0) + 1;
  const demo = state.config.demoUrl;
  document.querySelectorAll('.link-btn[data-url*="localhost:7500"]').forEach((b) => {
    b.dataset.url = b.dataset.url.replace('http://localhost:7500', demo);
  });
  if (urlInput.value.startsWith('http://localhost:7500')) urlInput.value = `${demo}/`;
  const badge = $('aiBadge');
  badge.hidden = false;
  badge.classList.toggle('off', !state.config.ai);
  $('aiBadgeText').textContent = state.config.ai ? 'AI hazır' : 'AI kapalı';
  if (!state.config.ai) {
    $('aiToggle').checked = false;
    $('aiToggle').disabled = true;
    $('aiRow').classList.add('disabled');
    $('aiTip').dataset.tip = 'AI kapalı: proje klasöründeki .env dosyasına GEMINI_API_KEY=... ekleyip npm start ile yeniden başlatın. AI olmadan her şey lokal çalışır.';
  }
  renderPersonaPicker();
  brain = createBrain($('brain'), { zoneLabels: state.config.zones, agentInfo: (id) => agentOf(id) });
  const preview = state.config.defaultSwarm.map((pid, i) => {
    const p = state.config.personas.find((x) => x.id === pid);
    return { id: `preview-${i}`, code: `A${i + 1}`, label: p.label, color: ['#74aef5', '#4eccd3', '#ee8dbd', '#c2a7f4'][i], viewport: p.viewport };
  });
  for (const a of preview) state.roster.set(a.id, a);
  buildTiles(preview, true);
  renderScore({ score: 100, grade: null, counts: { critical: 0, high: 0, medium: 0, low: 0 }, categories: state.config.categories.map((c) => ({ ...c, score: 100 })) });
  state.history = [];
  connect();
  refreshTargetUi();
}

boot();
