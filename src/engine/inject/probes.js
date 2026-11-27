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
    if (el.closest('[data-stampede]')) continue;
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

  // Login / sign-up form: a visible password field plus an identifier field and a submit control.
  let auth = null;
  const pw = [...document.querySelectorAll('input[type=password]')].find((p) => p.getBoundingClientRect().width > 4 && !p.disabled);
  if (pw) {
    const scope = pw.form || pw.closest('form,[role=dialog],section,main,div') || document.body;
    const idField = scope.querySelector('input[type=email],input[autocomplete=email],input[autocomplete=username],input[name*=mail i],input[name*=user i],input[type=text]');
    const pws = [...scope.querySelectorAll('input[type=password]')];
    const oauthRx = /(google|apple|github|facebook|microsoft|sso|continue with|sign in with|ile giriş|ile devam)/i;
    const scopeText = (scope.innerText || '').toLowerCase();
    const wantsSignup = pws.length > 1 || /(kayıt|kaydol|sign up|register|create account|hesap oluştur)/i.test(scopeText);
    const buttons = [...scope.querySelectorAll('button,input[type=submit],[role=button]')].filter((b) => {
      const t = (b.innerText || b.value || '').trim();
      return b.getBoundingClientRect().width > 4 && !oauthRx.test(t);
    });
    const textOf = (b) => (b.innerText || b.value || '').trim();
    const signupBtn = buttons.find((b) => /(kayıt|kaydol|sign up|register|oluştur|create)/i.test(textOf(b)));
    const loginBtn = buttons.find((b) => /(giriş|login|log in|sign in)/i.test(textOf(b))) || buttons.find((b) => b.type === 'submit');
    const submit = (wantsSignup && signupBtn) || loginBtn || signupBtn || null;
    const tag = (n) => {
      if (!n) return null;
      let id = n.getAttribute('data-rg-id');
      if (!id) {
        id = `e${++seq}`;
        n.setAttribute('data-rg-id', id);
      }
      return id;
    };
    auth = {
      kind: wantsSignup && submit === signupBtn ? 'signup' : 'login',
      idField: tag(idField),
      passwords: pws.map(tag),
      submit: tag(submit),
      loginBtn: tag(loginBtn),
      signupBtn: tag(signupBtn),
      signupText: signupBtn ? (signupBtn.innerText || signupBtn.value || '').trim().slice(0, 40) : '',
      loginText: loginBtn ? (loginBtn.innerText || loginBtn.value || '').trim().slice(0, 40) : '',
      submitText: submit ? (submit.innerText || submit.value || '').trim().slice(0, 40) : '',
      extra: [...scope.querySelectorAll('input[required]:not([type=password]):not([type=email]):not([type=checkbox]):not([type=hidden])')].filter((n) => n !== idField).map(tag).slice(0, 4),
      terms: [...scope.querySelectorAll('input[type=checkbox][required]')].map(tag).slice(0, 2),
    };
    window.__rgSeq = seq;
  }
  let storageKeys = 0;
  try {
    storageKeys = localStorage.length + sessionStorage.length;
  } catch (_) {
    storageKeys = 0;
  }
  return {
    url: location.href,
    title: document.title,
    elements: out,
    historyLength: history.length,
    viewport: { width: innerWidth, height: innerHeight },
    auth,
    hiddenInputs: document.querySelectorAll('form input[type=hidden]').length,
    storageKeys,
  };
}

/** Where keyboard focus is now, and whether it is visible. */
export function focusInfo() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { onBody: true };
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const ring = cs.boxShadow && cs.boxShadow !== 'none';
  const r = el.getBoundingClientRect();
  let id = el.getAttribute('data-rg-id');
  if (!id) {
    id = `f${Date.now() % 100000}`;
    el.setAttribute('data-rg-id', id);
  }
  return {
    id,
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    visibleIndicator: outline || ring,
    rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    inModal: Boolean(el.closest('[role=dialog],dialog,[aria-modal=true]')),
  };
}

/** Clickable-looking things (cursor:pointer) that a keyboard can never reach. */
export function keyboardUnreachable() {
  const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable=true]';
  const found = [];
  for (const el of document.body.querySelectorAll('div,span,li,img,svg,p,td,article,section')) {
    if (found.length >= 5) break;
    if (el.closest('[data-stampede]') || el.closest(FOCUSABLE)) continue;
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer' && !el.parentElement.closest(FOCUSABLE)) continue;
    if (el.querySelector(FOCUSABLE)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) continue;
    let id = el.getAttribute('data-rg-id');
    if (!id) {
      id = `k${found.length}${Date.now() % 10000}`;
      el.setAttribute('data-rg-id', id);
    }
    found.push({ id, desc: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''), text: (el.innerText || '').trim().slice(0, 40), rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } });
  }
  return found;
}

/** Corrupt every storage key (remembering originals) or restore them. */
export function storageChaos(mode) {
  const KEY = '__stampede_backup';
  try {
    if (mode === 'corrupt') {
      const backup = { l: {}, s: {} };
      const junk = ['{', 'null', '[object Object]', '"', '-1', '{"broken":'];
      let i = 0;
      for (const [store, tag] of [[localStorage, 'l'], [sessionStorage, 's']]) {
        for (let k = 0; k < store.length; k++) {
          const key = store.key(k);
          if (key === KEY) continue;
          backup[tag][key] = store.getItem(key);
        }
        for (const key of Object.keys(backup[tag])) store.setItem(key, junk[i++ % junk.length]);
      }
      window.name = JSON.stringify(backup);
      return Object.keys(backup.l).length + Object.keys(backup.s).length;
    }
    if (mode === 'restore') {
      const backup = JSON.parse(window.name || '{}');
      for (const [key, v] of Object.entries(backup.l || {})) localStorage.setItem(key, v);
      for (const [key, v] of Object.entries(backup.s || {})) sessionStorage.setItem(key, v);
      window.name = '';
      return true;
    }
    if (mode === 'flood') {
      const chunk = 'x'.repeat(256 * 1024);
      let n = 0;
      try {
        for (; n < 60; n++) localStorage.setItem(`__stampede_flood_${n}`, chunk);
      } catch (_) {
        /* quota reached: exactly the state we want the app to face */
      }
      return n;
    }
    if (mode === 'unflood') {
      for (let n = 0; n < 60; n++) localStorage.removeItem(`__stampede_flood_${n}`);
      return true;
    }
  } catch (_) {
    return null;
  }
  return null;
}

/** Change hidden form fields to hostile values. */
export function tamperHidden() {
  const values = ['0', '-1', '999999999', 'admin', '<script>', ''];
  const changed = [];
  [...document.querySelectorAll('form input[type=hidden]')].slice(0, 6).forEach((el, i) => {
    changed.push({ name: el.name || el.id || `hidden${i}`, from: el.value.slice(0, 40), to: values[i % values.length] });
    el.value = values[i % values.length];
  });
  return changed;
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
  return window.__stampede ? window.__stampede.counters() : { mutations: 0, url: location.href, scroll: 0 };
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
      if (el.closest('[data-stampede]')) continue;
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
    .filter((el) => !el.closest('[data-stampede]') && visible(el))
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
    // A full-screen overlay is an open modal/backdrop: what is behind it is meant to be unreachable.
    if (cr.width * cr.height >= innerWidth * innerHeight * 0.85) continue;
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
    if (!p || seenParents.has(p) || p.closest('script,style,noscript,textarea,code,pre,[data-stampede],[contenteditable]')) continue;
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
    if (el.closest('[data-stampede]') || !visible(el)) continue;
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

  // 6) Main-thread freezes + layout shift + DOM size (leak trend)
  if (window.__stampede) {
    out.longTasks = window.__stampede.drainLongTasks();
    out.shifts = window.__stampede.drainShifts();
  }
  out.nodeCount = document.getElementsByTagName('*').length;
  return out;
}

export function markElement({ id, rect, severity, title }) {
  if (window.__stampede) window.__stampede.mark(id || rect || null, severity, title);
}

export function ghostSay({ text, kind }) {
  if (window.__stampede) window.__stampede.say(text, kind);
}

export function ghostScan({ targets }) {
  if (window.__stampede) window.__stampede.scan(targets);
}

/** What the page says after an auth attempt (status/alert/error text) and whether the form is still up. */
export function authOutcome() {
  const msgs = [...document.querySelectorAll('[role=status],[role=alert],[aria-live],.error,.alert,[class*="error"],[class*="message"],[class*="msg"]')]
    .filter((n) => !n.closest('[data-stampede]'))
    .map((n) => (n.innerText || '').trim())
    .filter((t) => t && t.length < 160);
  const pw = [...document.querySelectorAll('input[type=password]')].some((p) => p.getBoundingClientRect().width > 4);
  return { message: [...new Set(msgs)].slice(0, 2).join(' · '), passwordVisible: pw, url: location.href };
}
