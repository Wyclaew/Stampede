// Functions evaluated inside the target page via page.evaluate().
// Each function must be fully self-contained: Playwright serializes its source.

/** Discover interactive elements and tag them with a stable data-rg-id. */
export function discoverElements() {
  const SEL =
    'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[contenteditable=""],[contenteditable=true]';
  const NON_TEXT = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden', 'range', 'color'];
  let seq = window.__rgSeq || 0;
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest('[data-rageghost]')) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    let id = el.getAttribute('data-rg-id');
    if (!id) {
      id = `e${++seq}`;
      el.setAttribute('data-rg-id', id);
    }
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : '')).toLowerCase();
    const label = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    const raw =
      (tag === 'input' || tag === 'textarea' || tag === 'select'
        ? el.getAttribute('aria-label') || el.getAttribute('placeholder') || (/[\p{L}\p{N}]/u.test(label) ? label : '') || el.getAttribute('name') || label
        : el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.value) || '';
    const form = el.form || el.closest('form');
    out.push({
      id,
      tag,
      type,
      role: el.getAttribute('role') || '',
      text: String(raw).trim().replace(/\s+/g, ' ').slice(0, 60),
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      name: el.getAttribute('name') || '',
      elId: el.id || '',
      testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
      href: el.getAttribute('href') || '',
      absHref: tag === 'a' ? el.href : '',
      download: el.hasAttribute('download'),
      target: el.getAttribute('target') || '',
      inForm: Boolean(form),
      formMethod: form ? (form.getAttribute('method') || 'get').toLowerCase() : '',
      autocomplete: el.getAttribute('autocomplete') || '',
      inputMode: el.getAttribute('inputmode') || '',
      optionCount: tag === 'select' ? el.options.length : 0,
      editable:
        tag === 'textarea' || (tag === 'input' && !NON_TEXT.includes(type)) || el.isContentEditable === true,
      inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    });
  }
  window.__rgSeq = seq;
  return {
    url: location.href,
    title: document.title,
    elements: out,
    historyLength: history.length,
    viewport: { width: innerWidth, height: innerHeight },
  };
}

/** Scroll element into view and return a point where a real click would actually land on it. */
export function findClickablePoint(id) {
  const el = document.querySelector(`[data-rg-id="${id}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const fr = [
    [0.5, 0.5],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.15, 0.2],
    [0.85, 0.8],
  ];
  for (const [fx, fy] of fr) {
    const x = r.left + r.width * fx;
    const y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit) || (hit.tagName === 'LABEL' && hit.control === el))) {
      return { x: Math.round(x), y: Math.round(y), obscured: fx !== 0.5 || fy !== 0.5 };
    }
  }
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), obscured: true, blocked: true };
}

export function readCounters() {
  return window.__rageghost ? window.__rageghost.counters() : { mutations: 0, url: location.href, scroll: 0 };
}

/**
 * One-shot page health probe. Returns raw findings; Node side turns them into issues.
 * opts: { spinnerTimeoutMs }
 */
export function runProbes(opts) {
  const now = Date.now();
  const st = (window.__rgProbe = window.__rgProbe || { spinners: {}, loadedAt: now, seq: 100000 });
  const tagEl = (el) => {
    let id = el.getAttribute('data-rg-id');
    if (!id) {
      id = `p${++st.seq}`;
      el.setAttribute('data-rg-id', id);
    }
    return id;
  };
  const desc = (el) => {
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) s += `.${cls.join('.')}`;
    return s;
  };
  const textOf = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const out = { url: location.href, viewport: { width: innerWidth, height: innerHeight }, overflow: null, obscured: [], garbage: [], spinners: [], blank: false, longTasks: [] };
  const body = document.body;
  if (!body) return out;

  // 1) Horizontal overflow
  const de = document.documentElement;
  const vw = de.clientWidth;
  const sw = Math.max(de.scrollWidth, body.scrollWidth);
  if (sw > vw + 2) {
    const culprits = [];
    for (const el of body.querySelectorAll('*')) {
      if (el.closest('[data-rageghost]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const right = r.right + scrollX;
      if (right <= vw + 2) continue;
      const p = el.parentElement;
      const pr = p ? p.getBoundingClientRect() : null;
      const parentOverflows = p && p !== body && pr && pr.right + scrollX > vw + 2;
      if (parentOverflows && r.width <= pr.width + 1) continue;
      culprits.push({ id: tagEl(el), desc: desc(el), text: textOf(el), by: Math.round(right - vw), rect: rectOf(el) });
      if (culprits.length > 25) break;
    }
    culprits.sort((a, b) => b.by - a.by);
    out.overflow = { scrollWidth: sw, viewportWidth: vw, culprits: culprits.slice(0, 3) };
  }

  // 2) Interactive elements covered by something else (floating widgets, banners)
  const CTA = /(pay|checkout|buy|order|submit|öde|satın|sipariş|gönder|onayla|sepete|kaydet|devam)/i;
  const items = [...body.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button]')]
    .filter((el) => !el.closest('[data-rageghost]') && visible(el))
    .slice(0, 250);
  const covered = [];
  const byCoverer = new Map();
  let checked = 0;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
    checked++;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
    if (hit.tagName === 'LABEL' && hit.control === el) continue;
    let cov = hit;
    while (cov && cov !== body) {
      const pos = getComputedStyle(cov).position;
      if (pos === 'fixed' || pos === 'sticky') break;
      cov = cov.parentElement;
    }
    if (!cov || cov === body) continue;
    const cr = cov.getBoundingClientRect();
    // Full-width headers / bottom bars: content scrolled under them is still reachable by scrolling.
    const isEdgeBar = cr.width >= innerWidth * 0.9 && (cr.top <= 2 || cr.bottom >= innerHeight - 2) && cr.height < innerHeight * 0.35;
    if (isEdgeBar) continue;
    // Transient notifications (toasts, live regions) are meant to float briefly.
    const role = cov.getAttribute('role') || '';
    const covCls = typeof cov.className === 'string' ? cov.className : '';
    if (/^(status|alert|log|tooltip)$/.test(role) || cov.hasAttribute('aria-live') || /toast|snack|notif|tooltip/i.test(covCls)) continue;
    const key = tagEl(cov);
    byCoverer.set(key, (byCoverer.get(key) || 0) + 1);
    covered.push({ id: tagEl(el), desc: desc(el), text: textOf(el), cta: CTA.test(textOf(el)), coverer: { id: key, desc: desc(cov), text: textOf(cov) }, rect: rectOf(el) });
  }
  out.obscured = covered.filter((c) => {
    const n = byCoverer.get(c.coverer.id);
    return !(n > 4 && n / Math.max(checked, 1) > 0.5); // a modal covering everything is intentional
  }).slice(0, 5);

  // 3) Garbage rendering: NaN, undefined, [object Object], {{template}}
  const GARBAGE = /(^|[^A-Za-z0-9_])(NaN|undefined|\[object Object\]|Infinity)(?![A-Za-z0-9_])|\{\{[^}]{1,40}\}\}/;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const seenParents = new Set();
  let node;
  let scanned = 0;
  while ((node = walker.nextNode()) && scanned < 6000) {
    scanned++;
    const t = node.nodeValue;
    if (!t || t.length > 300) continue;
    const trimmed = t.trim();
    const m = GARBAGE.exec(t) || (trimmed === 'null' ? [trimmed, '', 'null'] : null);
    if (!m) continue;
    const p = node.parentElement;
    if (!p || seenParents.has(p) || p.closest('script,style,noscript,textarea,code,pre,[data-rageghost],[contenteditable]')) continue;
    if (!visible(p)) continue;
    seenParents.add(p);
    out.garbage.push({ id: tagEl(p), desc: desc(p), token: (m[2] || m[0]).trim(), text: trimmed.slice(0, 80), rect: rectOf(p) });
    if (out.garbage.length >= 5) break;
  }

  // 4) Loading indicators that never go away
  const SPIN =
    '[aria-busy="true"],[role=progressbar],.spinner,.loader,.loading,[class*="spinner"],[class*="Spinner"],[class*="loader"],[class*="Loader"],[class*="loading"],[class*="Loading"],[class*="skeleton"]';
  const live = {};
  for (const el of body.querySelectorAll(SPIN)) {
    if (el.closest('[data-rageghost]') || !visible(el)) continue;
    const id = tagEl(el);
    live[id] = st.spinners[id] || now;
  }
  st.spinners = live;
  for (const [id, since] of Object.entries(live)) {
    const age = now - since;
    if (age >= opts.spinnerTimeoutMs) {
      const el = document.querySelector(`[data-rg-id="${id}"]`);
      if (el) out.spinners.push({ id, desc: desc(el), text: textOf(el), ageMs: age, rect: rectOf(el) });
    }
  }

  // 5) White screen
  if (document.readyState === 'complete' && now - st.loadedAt > 2500) {
    const textLen = (body.innerText || '').trim().length;
    const media = body.querySelectorAll('img,svg,canvas,video,iframe').length;
    out.blank = textLen < 3 && media === 0;
  }

  // 6) Main-thread freezes
  if (window.__rageghost) out.longTasks = window.__rageghost.drainLongTasks();
  return out;
}

export function markElement({ id, rect, severity, title }) {
  if (window.__rageghost) window.__rageghost.mark(id || rect || null, severity, title);
}

export function ghostSay({ text, kind }) {
  if (window.__rageghost) window.__rageghost.say(text, kind);
}
