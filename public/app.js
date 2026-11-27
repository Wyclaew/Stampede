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
const PHASE_LABEL = { idle: 'Hazır', launching: 'Tarayıcı açılıyor', loading: 'Ajanlar sayfayı açıyor', running: 'Sürü çalışıyor', finishing: 'Rapor yazılıyor', done: 'Bitti', failed: 'Hata' };
const ANOM_LABEL = { js: 'JS', console: 'KONSOL', network: 'AĞ', blocked: 'ENGEL', nav: 'NAV', chaos: 'KAOS' };
const FPS_FOCUS = 10;
const FPS_OTHER = 3;

const state = {
  config: null,
  personas: new Map(),
  running: false,
  focus: null,
  expanded: false,
  active: [],
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
const icon = (id) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
const agentChip = (id) => {
  const p = state.personas.get(id);
  return h('span', { class: 'chip-agent', style: `--agent:${p ? p.color : '#999'}`, title: p ? p.label : id }, p ? p.code : '?');
};
const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- setup form ----------
const urlInput = $('url');
const modeValue = () => document.querySelector('input[name=mode]:checked').value;
const selectedPersonas = () => [...document.querySelectorAll('#personaPicker input:checked')].map((i) => i.value);

function renderPersonaPicker() {
  const box = $('personaPicker');
  box.replaceChildren(
    ...state.config.personas.map((p) =>
      h(
        'label',
        { class: 'persona', style: `--agent:${p.color}` },
        h('input', { type: 'checkbox', value: p.id, checked: true }),
        h('span', { class: 'agent-code' }, p.code),
        h('span', {}, h('b', {}, p.label), h('small', {}, p.summary)),
      ),
    ),
  );
}

async function refreshLiveGuard() {
  let local = true;
  try {
    const res = await fetch(`/api/check-url?url=${encodeURIComponent(urlInput.value.trim())}`);
    local = (await res.json()).data.local;
  } catch {
    local = true;
  }
  $('liveConfirm').hidden = local || modeValue() === 'safe';
}
urlInput.addEventListener('input', refreshLiveGuard);
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', refreshLiveGuard));
document.querySelectorAll('.link-btn').forEach((b) =>
  b.addEventListener('click', () => {
    urlInput.value = b.dataset.url;
    if (b.dataset.mode) document.querySelector(`input[name=mode][value=${b.dataset.mode}]`).checked = true;
    refreshLiveGuard();
  }),
);

$('start').addEventListener('click', async () => {
  $('formError').textContent = '';
  const personas = selectedPersonas();
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
  };
  $('start').disabled = true;
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    $('seed').placeholder = `son seed ${json.data.seed}`;
  } catch (err) {
    $('formError').textContent = err.message;
    $('start').disabled = false;
  }
});
$('stop').addEventListener('click', () => fetch('/api/stop', { method: 'POST' }));

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
}

function setPhase(phase) {
  $('runState').dataset.phase = phase;
  $('stateLabel').textContent = PHASE_LABEL[phase] || phase;
}

// ---------- swarm tiles ----------
const tiles = new Map();

function streamUrl(id) {
  return `/api/stream/${id}?fps=${id === state.focus ? FPS_FOCUS : FPS_OTHER}&t=${Date.now()}`;
}

function buildTiles(ids) {
  const box = $('tiles');
  tiles.clear();
  box.replaceChildren();
  box.dataset.count = String(ids.length);
  for (const id of ids) {
    const p = state.personas.get(id);
    const img = h('img', { alt: `${p.label} ajanının canlı görüntüsü`, decoding: 'async' });
    const now = h('span', { class: 'now' }, 'Hazırlanıyor');
    const meta = h('span', { class: 'meta' });
    const vp = h('span', { class: 'vp' }, `${p.viewport.width}×${p.viewport.height}`);
    const focusBtn = h('button', { class: 'focus-btn', type: 'button', title: 'Büyüt', 'aria-label': `${p.label} görünümünü büyüt` }, icon('i-expand'));
    const tile = h(
      'article',
      { class: 'tile', style: `--agent:${p.color}`, 'data-agent': id },
      h('div', { class: 'tile-head' }, h('span', { class: 'agent-code' }, p.code), h('span', { class: 'name' }, p.label), vp, focusBtn),
      h('div', { class: 'screen' }, img),
      h('div', { class: 'tile-foot' }, now, meta),
    );
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.focus-btn')) {
        state.expanded = !(state.expanded && state.focus === id);
      }
      setFocus(id);
    });
    box.append(tile);
    tiles.set(id, { tile, img, now, meta, vp });
    meta.replaceChildren(h('b', {}, '0'), ' hamle · ', h('b', {}, '0'), ' sorun');
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
  brain.setFocus(id);
  const p = state.personas.get(id);
  $('brainSub').textContent = p ? `${p.code} ${p.label}: gördüğü bölgeler, tarttığı hamleler ve sonuçları.` : '';
  if (state.running) fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: id }) });
}

function startStreams() {
  for (const [id, t] of tiles) t.img.src = streamUrl(id);
}

// ---------- brain ----------
let brain;

// ---------- score & lists ----------
function renderScore(s) {
  $('score').textContent = s.score;
  $('grade').textContent = s.grade && s.grade.grade ? `${s.grade.grade} · ${s.grade.label}` : '—';
  state.history.push(s.score);
  if (state.history.length > 120) state.history.shift();
  const n = state.history.length;
  const pts = state.history.map((v, i) => `${n === 1 ? 0 : (i / (n - 1)) * 160},${38 - (v / 100) * 34}`).join(' ');
  $('historyLine').setAttribute('points', n === 1 ? `0,${38 - (s.score / 100) * 34} 160,${38 - (s.score / 100) * 34}` : pts);
  $('history').style.color = s.score >= 75 ? 'var(--signal)' : s.score >= 45 ? 'var(--med)' : 'var(--crit)';

  const sev = $('sevCounts');
  if (!sev.children.length) {
    sev.replaceChildren(...SEV_ORDER.map((k) => h('li', { 'data-sev': k }, h('b', {}, '0'), h('span', { class: `sev ${k}` }, sevShape(k), SEV_LABEL[k]))));
  }
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
      cats.replaceChildren(...s.categories.map((c) => h('li', { 'data-cat': c.id }, h('span', {}, c.label), h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: 'display:block' })), h('span', { class: 'num' }))));
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
      h('h4', {}, 'Nerede ve ne zaman'),
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

function showReport(r) {
  setRunning(false);
  setPhase('done');
  const base = `/reports/${encodeURIComponent(r.reportName)}`;
  $('reportText').textContent = `${r.issues.length} sorun · ${r.stats.actions} hamle · ${(r.durationMs / 1000).toFixed(0)} sn · seed ${r.seed}`;
  const link = (href, label, ic, cls, download) => h('a', { class: cls, href, target: '_blank', rel: 'noopener', download }, icon(ic), label);
  $('reportLinks').replaceChildren(
    link(`${base}/report.html`, 'HTML rapor', 'i-file', 'main'),
    link(`${base}/stampede.spec.ts`, 'Playwright testleri', 'i-code', null, 'stampede.spec.ts'),
    link(`${base}/report.md`, 'Markdown', 'i-file'),
    link(`${base}/report.json`, 'JSON', 'i-file'),
  );
  $('reportPanel').hidden = false;
  for (const i of r.issues) state.issues.set(i.fingerprint, i);
  queueIssues();
  renderScore(r);
}

function resetBoard() {
  state.issues.clear();
  state.anomCount = 0;
  state.history = [];
  state.open = null;
  $('panel-issues').replaceChildren(h('p', { class: 'empty' }, 'Bulunan sorunlar burada, önem sırasına göre listelenir.'));
  $('panel-feed').replaceChildren();
  $('panel-anoms').replaceChildren();
  $('tIssues').textContent = '0';
  $('tAnoms').textContent = '0';
  $('reportPanel').hidden = true;
  $('formError').textContent = '';
  brain.reset();
}

// ---------- live stream ----------
function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('error', () => {
    if (!state.running) $('stateLabel').textContent = 'Bağlantı yok, yeniden deneniyor';
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
    setRunning(true);
    state.active = d.personas.map((p) => p.id);
    buildTiles(state.active);
    state.expanded = false;
    setFocus(state.active[0]);
    startStreams();
    const who = d.identity.generated ? `otomatik test kimliği ${d.identity.email}` : `test kimliği ${d.identity.email}`;
    $('swarmSub').textContent = `${d.mode.label} · ${state.active.length} ajan · seed ${d.config.seed} · ${who}`;
  });
  es.addEventListener('status', (e) => setPhase(JSON.parse(e.data).phase));
  es.addEventListener('stats', (e) => renderStats(JSON.parse(e.data)));
  es.addEventListener('decision', (e) => {
    const d = JSON.parse(e.data);
    brain.decision(d.agent, d);
    if (d.agent === state.focus) {
      const chosen = d.candidates.find((c) => c.chosen);
      $('brainCaption').textContent = chosen ? `#${d.seq} · ${d.considered} hamle tartıldı · seçilen: ${chosen.label} (%${Math.round(chosen.p * 100)})` : '';
    }
  });
  es.addEventListener('outcome', (e) => {
    const d = JSON.parse(e.data);
    brain.outcome(d.agent, d);
  });
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
  for (const p of state.config.personas) state.personas.set(p.id, p);
  const demo = state.config.demoUrl;
  document.querySelectorAll('.link-btn[data-url*="localhost:7500"]').forEach((b) => {
    b.dataset.url = b.dataset.url.replace('http://localhost:7500', demo);
  });
  if (urlInput.value.startsWith('http://localhost:7500')) urlInput.value = `${demo}/`;
  renderPersonaPicker();
  brain = createBrain($('brain'), { zoneLabels: state.config.zones, colorOf: (id) => (state.personas.get(id) || {}).color || '#9ba6b1' });
  buildTiles(state.config.personas.map((p) => p.id));
  for (const t of tiles.values()) t.tile.querySelector('.screen').replaceChildren(h('p', { class: 'idle-msg' }, 'Başlatınca bu sekmenin canlı görüntüsü burada akar.'));
  setFocus(state.config.personas[0].id);
  renderScore({ score: 100, grade: null, counts: { critical: 0, high: 0, medium: 0, low: 0 }, categories: state.config.categories.map((c) => ({ ...c, score: 100 })) });
  state.history = [];
  connect();
  refreshLiveGuard();
}

boot();
