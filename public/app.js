// RageGhost dashboard client. All target-derived text goes through textContent (never innerHTML).
const $ = (id) => document.getElementById(id);
const SEV_LABEL = { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const ANOM_LABEL = { js: 'JS', console: 'KONSOL', network: 'AĞ', blocked: 'ENGEL', nav: 'NAV' };
const GAUGE_LEN = 314.16;

const state = { running: false, issues: new Map(), anomCount: 0, openIssue: null, lastVp: '' };

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

// ---------- controls ----------
const urlInput = $('url');
const modeValue = () => document.querySelector('input[name=mode]:checked').value;

async function refreshLiveGuard() {
  const mode = modeValue();
  let local = true;
  try {
    const res = await fetch(`/api/check-url?url=${encodeURIComponent(urlInput.value.trim())}`);
    local = (await res.json()).data.local;
  } catch {
    local = true;
  }
  $('liveConfirm').hidden = local || mode === 'safe';
}

urlInput.addEventListener('input', refreshLiveGuard);
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', refreshLiveGuard));
document.querySelectorAll('.chip-btn').forEach((b) =>
  b.addEventListener('click', () => {
    urlInput.value = b.dataset.url;
    if (b.dataset.mode) document.querySelector(`input[name=mode][value=${b.dataset.mode}]`).checked = true;
    refreshLiveGuard();
  }),
);

$('start').addEventListener('click', async () => {
  $('formError').textContent = '';
  const body = {
    url: urlInput.value.trim(),
    mode: modeValue(),
    durationSec: Number($('duration').value),
    seed: $('seed').value ? Number($('seed').value) : undefined,
    headed: $('headed').checked,
    confirmLive: $('confirmLive').checked,
  };
  $('start').disabled = true;
  try {
    const res = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    $('seed').placeholder = `seed ${json.data.seed}`;
  } catch (err) {
    $('formError').textContent = err.message;
    $('start').disabled = false;
  }
});

$('stop').addEventListener('click', () => fetch('/api/stop', { method: 'POST' }));

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    for (const p of ['issues', 'feed', 'anoms']) $(`panel-${p}`).hidden = p !== b.dataset.tab;
  }),
);

// ---------- rendering ----------
function setRunning(running) {
  state.running = running;
  $('start').disabled = running;
  $('stop').disabled = !running;
  document.querySelectorAll('.controls input, .controls select, .chip-btn').forEach((el) => (el.disabled = running));
}

function resetBoard() {
  state.issues.clear();
  state.anomCount = 0;
  $('panel-issues').replaceChildren(h('p', { class: 'placeholder' }, 'Henüz sorun yok. Hayalet sabırsızlanıyor…'));
  $('panel-feed').replaceChildren();
  $('panel-anoms').replaceChildren();
  $('tIssues').textContent = '0';
  $('tAnoms').textContent = '0';
  $('done').hidden = true;
  renderScore({ score: 100, grade: { label: 'Dayanıklılık' }, counts: { critical: 0, high: 0, medium: 0, low: 0 } });
}

function renderScore(s) {
  $('score').textContent = s.score;
  $('grade').textContent = s.grade.grade ? `${s.grade.grade} · ${s.grade.label}` : s.grade.label;
  const arc = $('gaugeArc');
  arc.style.strokeDashoffset = String(GAUGE_LEN * (1 - s.score / 100));
  arc.style.stroke = s.score >= 75 ? 'var(--ok)' : s.score >= 45 ? 'var(--med)' : 'var(--crit)';
  const ids = { critical: 'cCritical', high: 'cHigh', medium: 'cMedium', low: 'cLow' };
  for (const sev of SEV_ORDER) {
    const el = $(ids[sev]);
    const next = String(s.counts[sev]);
    if (el.textContent !== next) {
      el.textContent = next;
      const box = el.parentElement;
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
    }
  }
}

function renderStats(s) {
  renderScore(s);
  $('sActions').textContent = s.counters.actions;
  $('sClicks').textContent = s.counters.clicks;
  $('sRequests').textContent = s.counters.requests;
  $('sBlocked').textContent = s.counters.blocked;
  $('sPages').textContent = s.pagesVisited;
  $('addr').textContent = s.url || '—';
  if (s.viewport) {
    const vp = `${s.viewport.width}×${s.viewport.height}`;
    if (vp !== state.lastVp) {
      state.lastVp = vp;
      $('vp').textContent = vp;
      $('vp').classList.add('bump');
      setTimeout(() => $('vp').classList.remove('bump'), 220);
    }
  }
  $('progress').style.width = `${Math.min(100, (s.elapsedMs / s.durationMs) * 100)}%`;
}

function issueNode(issue) {
  const more = h(
    'div',
    { class: 'more' },
    h('h5', {}, 'Ne anlama geliyor?'),
    h('p', {}, issue.meaning),
    h('h5', {}, 'Nasıl düzeltilir?'),
    h('p', { class: 'fix' }, issue.fix),
    issue.evidence && issue.evidence.length ? [h('h5', {}, 'Kanıt'), h('pre', {}, issue.evidence.join('\n'))] : null,
    h('p', { class: 'shot-badge' }, `${issue.url || ''}${issue.viewport ? ` · ${issue.viewport.width}×${issue.viewport.height}` : ''}${issue.hasScreenshot ? ' · 📸 ekran görüntüsü raporda' : ''}`),
  );
  const node = h(
    'article',
    { class: `issue ${issue.severity}`, 'data-fp': issue.fingerprint, tabindex: '0' },
    h('div', { class: 'head' }, h('span', { class: `chip ${issue.severity}` }, SEV_LABEL[issue.severity]), h('span', { class: 'title' }, `${issue.id} · ${issue.title}`), h('span', { class: 'n' }, `${issue.occurrences}×`)),
    h('p', { class: 'detail' }, issue.detail),
    h('div', { class: 'trig' }, `Tetik: ${issue.trigger}`),
    more,
  );
  if (state.openIssue === issue.fingerprint) node.classList.add('open');
  const toggle = () => {
    node.classList.toggle('open');
    state.openIssue = node.classList.contains('open') ? issue.fingerprint : null;
  };
  node.addEventListener('click', toggle);
  node.addEventListener('keydown', (e) => e.key === 'Enter' && toggle());
  return node;
}

function renderIssues() {
  const list = [...state.issues.values()].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.detectedAt - b.detectedAt);
  $('tIssues').textContent = String(list.length);
  if (!list.length) return;
  $('panel-issues').replaceChildren(...list.map(issueNode));
}

function addIssue({ issue, isNew }) {
  state.issues.set(issue.fingerprint, issue);
  renderIssues();
  if (isNew && (issue.severity === 'critical' || issue.severity === 'high')) {
    const v = document.querySelector('.viewer');
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
  }
}

function addFeed(a) {
  if (a.phase === 'start') {
    $('ticker').textContent = `#${a.seq} ▸ ${a.label}`;
    return;
  }
  const panel = $('panel-feed');
  panel.prepend(h('div', { class: 'feed-item' }, h('span', { class: 'seq' }, `#${a.seq}`), h('span', {}, a.label)));
  while (panel.children.length > 150) panel.lastChild.remove();
}

function addAnomaly(a) {
  state.anomCount++;
  $('tAnoms').textContent = String(state.anomCount);
  const panel = $('panel-anoms');
  panel.prepend(h('div', { class: `anom ${a.kind}` }, h('span', { class: 'k' }, ANOM_LABEL[a.kind] || a.kind), h('span', {}, a.text)));
  while (panel.children.length > 200) panel.lastChild.remove();
}

function showDone(r) {
  setRunning(false);
  $('ticker').textContent = `✔ Bitti · ${r.issues.length} sorun · skor ${r.score} (${r.grade.grade})`;
  $('progress').style.width = '100%';
  const base = `/reports/${encodeURIComponent(r.reportName)}`;
  $('doneText').textContent = ` ${r.stats.actions} aksiyon · ${(r.durationMs / 1000).toFixed(0)} sn · seed ${r.seed}`;
  $('doneLinks').replaceChildren(
    h('a', { class: 'main', href: `${base}/report.html`, target: '_blank', rel: 'noopener' }, '📄 HTML rapor'),
    h('a', { href: `${base}/rageghost.spec.js`, target: '_blank', rel: 'noopener', download: 'rageghost.spec.js' }, '🧪 Playwright testleri'),
    h('a', { href: `${base}/report.md`, target: '_blank', rel: 'noopener' }, 'MD'),
    h('a', { href: `${base}/report.json`, target: '_blank', rel: 'noopener' }, 'JSON'),
  );
  $('done').hidden = false;
  for (const i of r.issues) state.issues.set(i.fingerprint, i);
  renderIssues();
  renderScore(r);
}

// ---------- live stream ----------
function connect() {
  const es = new EventSource('/api/events');
  const conn = $('conn');
  es.addEventListener('open', () => {
    conn.classList.add('on');
    $('connText').textContent = 'Canlı';
  });
  es.addEventListener('error', () => {
    conn.classList.remove('on');
    $('connText').textContent = 'Bağlantı koptu, yeniden deneniyor…';
  });
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    setRunning(d.running);
    for (const i of d.issues) state.issues.set(i.fingerprint, i);
    renderIssues();
    if (d.snapshot) renderStats(d.snapshot);
    if (!d.running && d.lastReport) showDone(d.lastReport);
  });
  es.addEventListener('started', (e) => {
    const d = JSON.parse(e.data);
    resetBoard();
    setRunning(true);
    $('idle').hidden = true;
    $('ticker').textContent = `${d.mode.label} başlıyor · seed ${d.config.seed}`;
  });
  es.addEventListener('status', (e) => {
    const d = JSON.parse(e.data);
    if (d.message && d.phase !== 'running') $('ticker').textContent = d.message;
  });
  es.addEventListener('frame', (e) => {
    const d = JSON.parse(e.data);
    const img = $('frame');
    img.src = `data:image/jpeg;base64,${d.data}`;
    img.hidden = false;
    $('idle').hidden = true;
  });
  es.addEventListener('stats', (e) => renderStats(JSON.parse(e.data)));
  es.addEventListener('action', (e) => addFeed(JSON.parse(e.data)));
  es.addEventListener('issue', (e) => addIssue(JSON.parse(e.data)));
  es.addEventListener('anomaly', (e) => addAnomaly(JSON.parse(e.data)));
  es.addEventListener('done', (e) => showDone(JSON.parse(e.data)));
  es.addEventListener('failed', (e) => {
    const d = JSON.parse(e.data);
    setRunning(false);
    $('formError').textContent = `Çalıştırma hatası: ${d.message}`;
  });
}

connect();
refreshLiveGuard();
