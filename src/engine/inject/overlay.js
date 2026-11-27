/* Stampede in-page agent layer. Injected with addInitScript before any page script runs.
 * Draws the agent cursor, click ripples, scan reticles, action chips and bug markers
 * (pointer-events: none, inside a shadow root), and collects low-level signals:
 * DOM mutation count, long tasks, layout shifts. It never changes the page's own behaviour. */
(() => {
  if (window.top !== window) return;
  if (window.__stampede) return;

  const AGENT = window.__STAMPEDE_AGENT || { code: 'A1', tag: 'AGENT', color: '#74aef5' };
  const state = { mutations: 0, longTasks: [], shifts: [], lastResize: 0, lastX: -100, lastY: -100, burst: 0, lastClickAt: 0 };
  let host = null;
  let root = null;
  let cursor = null;
  let burstBadge = null;

  const C = AGENT.color;
  const CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden; font: 600 12px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .cursor { position: absolute; left: 0; top: 0; transform: translate(-100px,-100px); transform-origin: 2px 2px; will-change: transform; }
  .cursor.press svg { animation: press .22s cubic-bezier(.16,1,.3,1); }
  @keyframes press { 40% { transform: scale(.78); } }
  .cursor svg { display: block; width: 22px; height: 26px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
  .cursor .tag { position: absolute; left: 18px; top: 20px; padding: 2px 7px 3px; border-radius: 4px; background: ${C}; color: #0b1015; font: 700 11px/1.2 ui-monospace, Menlo, monospace; letter-spacing: .02em; white-space: nowrap; }
  .ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid ${C}; animation: ripple .5s cubic-bezier(.16,1,.3,1) forwards; }
  @keyframes ripple { from { transform: scale(.5); opacity: 1; } to { transform: scale(3.6); opacity: 0; } }
  .burst { position: absolute; padding: 1px 6px; border-radius: 4px; background: #fc4447; color: #fff; font: 700 11px/1.4 ui-monospace, Menlo, monospace; transform: translate(-30px,-26px); }
  .chip { position: absolute; padding: 4px 8px; border-radius: 4px; background: #0b1015; color: #e4e8ed; border: 1px solid ${C}; font: 600 11px/1.3 ui-monospace, Menlo, monospace; letter-spacing: .03em; white-space: nowrap; animation: chip 1.5s cubic-bezier(.16,1,.3,1) forwards; }
  .chip.bug { border-color: #fc4447; background: #2a0d10; color: #ffd6d6; }
  @keyframes chip { 0% { opacity: 0; transform: translate(16px,-34px); } 10% { opacity: 1; transform: translate(16px,-40px); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(16px,-48px); } }
  .reticle { position: absolute; border: 1px solid ${C}; border-radius: 3px; opacity: 0; animation: reticle 1.1s ease-out forwards; }
  .reticle::after { content: attr(data-p); position: absolute; right: -1px; top: -16px; padding: 0 4px; background: ${C}; color: #0b1015; font: 700 10px/1.5 ui-monospace, Menlo, monospace; border-radius: 2px; }
  .reticle.pick { border-width: 2px; }
  @keyframes reticle { 0% { opacity: 0; transform: scale(1.08); } 15% { opacity: .95; transform: scale(1); } 75% { opacity: .8; } 100% { opacity: 0; } }
  .mark { position: absolute; border: 2px solid #fc4447; border-radius: 4px; background: rgba(252,68,71,.08); }
  .mark.medium { border-color: #e5c95e; background: rgba(229,201,94,.08); }
  .mark.low { border-color: #9ba6b1; background: rgba(155,166,177,.08); }
  .mark .tag { position: absolute; left: -2px; top: -22px; padding: 2px 7px; border-radius: 3px; background: #fc4447; color: #fff; font: 700 11px/1.4 ui-monospace, Menlo, monospace; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
  .mark.medium .tag { background: #e5c95e; color: #0b1015; }
  .mark.low .tag { background: #9ba6b1; color: #0b1015; }
  .trail { position: absolute; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: ${C}; opacity: .5; animation: trail .45s linear forwards; }
  @keyframes trail { to { opacity: 0; transform: scale(.3); } }
  @media (prefers-reduced-motion: reduce) { .trail { display: none; } .cursor.press svg { animation: none; } }
  `;

  const CURSOR_SVG = `<svg viewBox="0 0 22 26" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 21 L7.2 16.4 L10.6 24 L14 22.5 L10.7 15 L18 15 Z" fill="${C}" stroke="#0b1015" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  // Mount only after load (+ a beat) so frameworks that hydrate the whole document (Next.js App Router)
  // never see a foreign node during hydration.
  let ready = false;
  const markReady = () => setTimeout(() => { ready = true; }, 400);
  if (document.readyState === 'complete') markReady();
  else window.addEventListener('load', markReady, { once: true });
  setTimeout(() => { ready = true; }, 6000);

  function mount() {
    if (!ready) return;
    if (host && host.isConnected) return;
    const parent = document.documentElement;
    if (!parent) return;
    host = document.createElement('stampede-layer');
    host.setAttribute('data-stampede', '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><div class="cursor">${CURSOR_SVG}<span class="tag"></span></div></div>`;
    cursor = root.querySelector('.cursor');
    cursor.querySelector('.tag').textContent = `${AGENT.code} ${AGENT.tag}`;
    parent.appendChild(host);
    if (state.lastX > -50) place(state.lastX, state.lastY);
  }

  function layer() {
    mount();
    return root ? root.querySelector('.layer') : null;
  }

  function place(x, y, tilt = 0) {
    state.lastX = x;
    state.lastY = y;
    if (cursor) cursor.style.transform = `translate(${x - 2}px, ${y - 2}px) rotate(${tilt.toFixed(1)}deg)`;
  }

  function spawn(cls, x, y, ttl, text) {
    const l = layer();
    if (!l) return null;
    const n = document.createElement('div');
    n.className = cls;
    n.style.left = `${x}px`;
    n.style.top = `${y}px`;
    if (text) n.textContent = text;
    l.appendChild(n);
    if (ttl) setTimeout(() => n.remove(), ttl);
    return n;
  }

  // The cursor is driven only by the engine (moveTo / press). It deliberately ignores real mouse
  // events, so a human moving their own mouse over a visible window never disturbs the agent.
  let anim = 0;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function moveTo(x, y, ms) {
    mount();
    const fromX = state.lastX < -50 ? x : state.lastX;
    const fromY = state.lastY < -50 ? y : state.lastY;
    const dist = Math.hypot(x - fromX, y - fromY);
    const duration = ms || Math.min(620, 160 + dist * 0.55);
    const t0 = performance.now();
    const tilt = Math.max(-14, Math.min(14, (x - fromX) / 18));
    cancelAnimationFrame(anim);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(x, y);
      return 0;
    }
    let lastTrail = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOut(t);
      const cx = fromX + (x - fromX) * e;
      const cy = fromY + (y - fromY) * e;
      place(cx, cy, tilt * Math.sin(Math.PI * t));
      if (now - lastTrail > 28 && t < 0.95) {
        lastTrail = now;
        spawn('trail', cx, cy, 420);
      }
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
    return duration;
  }

  const onPress = (x, y) => {
    mount();
    if (Math.hypot(x - state.lastX, y - state.lastY) > 2) place(x, y);
    const now = Date.now();
    state.burst = now - state.lastClickAt < 450 ? state.burst + 1 : 1;
    state.lastClickAt = now;
    spawn('ripple', x, y, 520);
    if (cursor) {
      cursor.classList.remove('press');
      void cursor.offsetWidth;
      cursor.classList.add('press');
    }
    if (state.burst > 1) {
      if (!burstBadge || !burstBadge.isConnected) burstBadge = spawn('burst', x, y, 0);
      if (burstBadge) {
        burstBadge.textContent = `×${state.burst}`;
        burstBadge.style.left = `${x}px`;
        burstBadge.style.top = `${y}px`;
        clearTimeout(burstBadge._t);
        burstBadge._t = setTimeout(() => burstBadge && burstBadge.remove(), 650);
      }
    }
  };
  window.addEventListener('resize', () => { state.lastResize = performance.now(); }, { passive: true });

  function say(text, kind) {
    const x = Math.min(Math.max(state.lastX, 10), window.innerWidth - 260);
    const y = Math.min(Math.max(state.lastY, 60), window.innerHeight - 20);
    spawn(kind === 'bug' ? 'chip bug' : 'chip', x, y, 1600, text);
  }

  /** Show the agent's attack map: candidate targets with their probability, the pick highlighted. */
  function scan(targets) {
    const l = layer();
    if (!l) return;
    for (const t of targets.slice(0, 6)) {
      const el = document.querySelector(`[data-rg-id="${t.id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const n = spawn(t.pick ? 'reticle pick' : 'reticle', r.left - 3, r.top - 3, 1150);
      if (!n) continue;
      n.style.width = `${r.width + 6}px`;
      n.style.height = `${r.height + 6}px`;
      n.setAttribute('data-p', `${Math.round(t.p * 100)}%`);
    }
  }

  function mark(target, severity, title) {
    const l = layer();
    if (!l) return;
    const el = typeof target === 'string' ? document.querySelector(`[data-rg-id="${target}"]`) : null;
    const box = document.createElement('div');
    box.className = `mark ${severity === 'critical' || severity === 'high' ? '' : severity}`;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = title;
    box.appendChild(tag);
    l.appendChild(box);
    const started = Date.now();
    const fixed = target && typeof target === 'object' ? target : null;
    if (!el && !fixed) {
      // Page-level finding (e.g. a duplicate request): a label only, never a wash over the page.
      box.style.cssText = 'left:8px;top:30px;width:0;height:0;border:0;background:none';
      setTimeout(() => box.remove(), 3800);
      return;
    }
    const frame = () => {
      const r = el ? el.getBoundingClientRect() : fixed;
      if (r) {
        box.style.left = `${r.left - 3}px`;
        box.style.top = `${r.top - 3}px`;
        box.style.width = `${Math.max(r.width, 12) + 6}px`;
        box.style.height = `${Math.max(r.height, 12) + 6}px`;
      } else {
        box.style.left = '4px';
        box.style.top = '26px';
        box.style.width = `${window.innerWidth - 8}px`;
        box.style.height = `${window.innerHeight - 30}px`;
      }
      if (Date.now() - started < 3800) requestAnimationFrame(frame);
      else box.remove();
    };
    frame();
  }

  try {
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'data-rg-id') continue;
        if (r.target === host) continue;
        if (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => n === host)) continue;
        state.mutations++;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch (_) {
    /* observer unsupported: dead-click detection is simply skipped */
  }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) state.longTasks.push({ d: Math.round(e.duration), t: Math.round(e.startTime) });
    }).observe({ type: 'longtask', buffered: true });
  } catch (_) {
    /* longtask API unavailable */
  }

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // Shifts caused by input or by the agent resizing the window are not the page's fault.
        if (e.hadRecentInput || e.startTime - state.lastResize < 1200) continue;
        state.shifts.push({ v: Number(e.value.toFixed(4)), t: Math.round(e.startTime) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) {
    /* layout-shift API unavailable */
  }

  window.__stampede = {
    say,
    mark,
    scan,
    place,
    moveTo,
    press: onPress,
    counters: () => ({ mutations: state.mutations, url: location.href, scroll: Math.round(window.scrollX + window.scrollY * 3) }),
    drainLongTasks: () => state.longTasks.splice(0, state.longTasks.length),
    drainShifts: () => state.shifts.splice(0, state.shifts.length),
  };

  setInterval(mount, 1000);
})();
