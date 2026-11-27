/* RageGhost in-page agent. Injected with addInitScript before any page script runs.
 * - draws the ghost cursor, click ripples, speech labels and bug highlights (pointer-events: none)
 * - collects low-level signals: DOM mutation count, long tasks
 * It never changes the page's own behaviour. */
(() => {
  if (window.top !== window) return;
  if (window.__rageghost) return;

  const state = { mutations: 0, longTasks: [], lastX: -100, lastY: -100, clickBurst: 0, lastClickAt: 0 };
  let host = null;
  let root = null;
  let ghost = null;
  let burstBadge = null;

  const CSS = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; overflow: hidden; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .ghost { position: absolute; left: 0; top: 0; width: 46px; height: 52px; transform: translate(-100px,-100px); transition: transform 70ms linear; will-change: transform; filter: drop-shadow(0 6px 14px rgba(124,58,237,.55)); }
  .ghost svg { width: 46px; height: 52px; animation: bob 1.1s ease-in-out infinite; transform-origin: 50% 60%; }
  .ghost.rage svg { animation: shake .09s linear infinite; }
  .ghost .tip { position: absolute; left: -3px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #f472b6; box-shadow: 0 0 0 3px rgba(244,114,182,.35); }
  @keyframes bob { 0%,100% { transform: translateY(0) rotate(-3deg);} 50% { transform: translateY(-4px) rotate(3deg);} }
  @keyframes shake { 0% { transform: translate(1px,0) rotate(-8deg);} 50% { transform: translate(-1px,1px) rotate(8deg);} 100% { transform: translate(1px,-1px) rotate(-8deg);} }
  .ripple { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid #a78bfa; animation: ripple .55s ease-out forwards; }
  .ripple.hot { border-color: #fb7185; }
  @keyframes ripple { from { transform: scale(.4); opacity: 1; } to { transform: scale(4.2); opacity: 0; } }
  .burst { position: absolute; padding: 2px 7px; border-radius: 999px; background: #fb7185; color: #fff; font: 800 13px/1.4 ui-sans-serif, system-ui; transform: translate(26px,-30px); box-shadow: 0 4px 14px rgba(251,113,133,.5); transition: opacity .3s; }
  .say { position: absolute; padding: 6px 12px; border-radius: 12px 12px 12px 3px; background: rgba(17,12,34,.92); color: #f5f3ff; border: 1px solid rgba(167,139,250,.6); font: 700 13px/1.3 ui-sans-serif, system-ui; letter-spacing: .02em; white-space: nowrap; animation: say 1.6s ease-out forwards; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
  .say.bug { background: #be123c; border-color: #fecdd3; color: #fff; }
  @keyframes say { 0% { opacity: 0; transform: translate(34px,-8px) scale(.8);} 12% { opacity: 1; transform: translate(34px,-18px) scale(1);} 80% { opacity: 1;} 100% { opacity: 0; transform: translate(34px,-46px);} }
  .mark { position: absolute; border: 3px solid #f43f5e; border-radius: 8px; box-shadow: 0 0 0 4px rgba(244,63,94,.25), 0 0 28px rgba(244,63,94,.55); animation: pulse .8s ease-in-out infinite alternate; }
  .mark.medium { border-color: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.25), 0 0 24px rgba(245,158,11,.5); }
  .mark.low { border-color: #38bdf8; box-shadow: 0 0 0 4px rgba(56,189,248,.25); }
  .mark .tag { position: absolute; left: -3px; top: -26px; padding: 3px 8px; border-radius: 6px 6px 6px 0; background: #f43f5e; color: #fff; font: 800 11px/1.4 ui-sans-serif, system-ui; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
  .mark.medium .tag { background: #d97706; }
  .mark.low .tag { background: #0284c7; }
  @keyframes pulse { from { opacity: .65; } to { opacity: 1; } }
  .trail { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(196,181,253,.7); animation: trail .5s ease-out forwards; }
  @keyframes trail { to { opacity: 0; transform: scale(.2); } }
  `;

  const GHOST_SVG = `<svg viewBox="0 0 46 52" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="rgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ddd6fe"/></linearGradient></defs>
    <path d="M23 2C11.4 2 4 10.6 4 22v26l6-4.5 6.5 4.5 6.5-4.5 6.5 4.5 6.5-4.5 6 4.5V22C42 10.6 34.6 2 23 2z" fill="url(#rgG)" stroke="#7c3aed" stroke-width="2.4"/>
    <path d="M12.5 17.5l8 3.2M33.5 17.5l-8 3.2" stroke="#4c1d95" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="17" cy="25" rx="3.4" ry="4.2" fill="#1e1b4b"/><ellipse cx="29" cy="25" rx="3.4" ry="4.2" fill="#1e1b4b"/>
    <circle cx="18" cy="23.6" r="1.2" fill="#fff"/><circle cx="30" cy="23.6" r="1.2" fill="#fff"/>
    <path d="M18 35c2.8-2.4 7.2-2.4 10 0" stroke="#4c1d95" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="11" cy="31" rx="2.6" ry="1.6" fill="#f9a8d4" opacity=".8"/><ellipse cx="35" cy="31" rx="2.6" ry="1.6" fill="#f9a8d4" opacity=".8"/>
  </svg>`;

  function mount() {
    if (host && host.isConnected) return;
    const parent = document.documentElement;
    if (!parent) return;
    host = document.createElement('rageghost-layer');
    host.setAttribute('data-rageghost', '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><div class="ghost"><span class="tip"></span>${GHOST_SVG}</div></div>`;
    ghost = root.querySelector('.ghost');
    parent.appendChild(host);
    if (state.lastX > -50) place(state.lastX, state.lastY);
  }

  function layer() {
    mount();
    return root ? root.querySelector('.layer') : null;
  }

  function place(x, y) {
    state.lastX = x;
    state.lastY = y;
    if (ghost) ghost.style.transform = `translate(${x}px, ${y}px)`;
  }

  function spawn(cls, x, y, ttl, html) {
    const l = layer();
    if (!l) return null;
    const n = document.createElement('div');
    n.className = cls;
    n.style.left = `${x}px`;
    n.style.top = `${y}px`;
    if (html) n.textContent = html;
    l.appendChild(n);
    if (ttl) setTimeout(() => n.remove(), ttl);
    return n;
  }

  let trailTick = 0;
  window.addEventListener(
    'mousemove',
    (e) => {
      mount();
      place(e.clientX, e.clientY);
      if (++trailTick % 2 === 0) spawn('trail', e.clientX, e.clientY, 500);
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    'mousedown',
    (e) => {
      mount();
      const now = Date.now();
      state.clickBurst = now - state.lastClickAt < 450 ? state.clickBurst + 1 : 1;
      state.lastClickAt = now;
      spawn(state.clickBurst > 1 ? 'ripple hot' : 'ripple', e.clientX, e.clientY, 600);
      if (state.clickBurst > 1) {
        if (!burstBadge || !burstBadge.isConnected) burstBadge = spawn('burst', 0, 0, 0);
        if (burstBadge) {
          burstBadge.textContent = `×${state.clickBurst}`;
          burstBadge.style.left = `${e.clientX}px`;
          burstBadge.style.top = `${e.clientY}px`;
          burstBadge.style.opacity = '1';
          clearTimeout(burstBadge._t);
          burstBadge._t = setTimeout(() => burstBadge && burstBadge.remove(), 700);
        }
        if (ghost) {
          ghost.classList.add('rage');
          clearTimeout(ghost._t);
          ghost._t = setTimeout(() => ghost && ghost.classList.remove('rage'), 500);
        }
      }
    },
    { capture: true, passive: true },
  );

  function say(text, kind) {
    const x = Math.min(Math.max(state.lastX, 10), window.innerWidth - 240);
    const y = Math.min(Math.max(state.lastY, 40), window.innerHeight - 20);
    spawn(kind === 'bug' ? 'say bug' : 'say', x, y, 1700, text);
  }

  function mark(target, severity, title) {
    const l = layer();
    if (!l) return;
    const el = typeof target === 'string' ? document.querySelector(`[data-rg-id="${target}"]`) : null;
    const box = document.createElement('div');
    const sev = severity === 'critical' || severity === 'high' ? '' : severity;
    box.className = `mark ${sev}`;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = title;
    box.appendChild(tag);
    l.appendChild(box);
    const started = Date.now();
    const fixed = target && typeof target === 'object' ? target : null;
    const frame = () => {
      const r = el ? el.getBoundingClientRect() : fixed;
      if (r) {
        box.style.left = `${r.left - 4}px`;
        box.style.top = `${r.top - 4}px`;
        box.style.width = `${Math.max(r.width, 12) + 8}px`;
        box.style.height = `${Math.max(r.height, 12) + 8}px`;
      } else {
        box.style.left = '6px';
        box.style.top = '30px';
        box.style.width = `${window.innerWidth - 12}px`;
        box.style.height = `${window.innerHeight - 36}px`;
      }
      if (Date.now() - started < 4200) requestAnimationFrame(frame);
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

  window.__rageghost = {
    say,
    mark,
    place,
    counters: () => ({ mutations: state.mutations, url: location.href }),
    drainLongTasks: () => state.longTasks.splice(0, state.longTasks.length),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  setInterval(mount, 1000);
})();
