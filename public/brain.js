// Decision graph: zones the agent sees -> weighted candidate moves -> outcomes.
// Draws on demand; animates only while a signal is travelling (and never with reduced motion).
const ZONES = ['auth', 'checkout', 'search', 'form', 'nav', 'content', 'page'];
const OUTCOMES = [
  { id: 'react', label: 'Sayfa tepki verdi' },
  { id: 'net', label: 'Ağ isteği gitti' },
  { id: 'issue', label: 'Sorun bulundu' },
  { id: 'dead', label: 'Tepki yok' },
];
const C = {
  text: 'oklch(0.93 0.008 250)',
  muted: 'oklch(0.72 0.02 250)',
  faint: 'oklch(0.5 0.018 250)',
  line: 'oklch(0.33 0.014 250)',
  crit: 'oklch(0.66 0.22 25)',
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBrain(canvas, { zoneLabels, colorOf }) {
  const ctx = canvas.getContext('2d');
  const state = new Map(); // agent -> { decision, outcome, outcomeAt, decidedAt, tally }
  let focus = null;
  let raf = 0;

  const agentState = (id) => {
    if (!state.has(id)) state.set(id, { decision: null, outcome: null, decidedAt: 0, outcomeAt: 0, tally: { react: 0, net: 0, issue: 0, dead: 0 } });
    return state.get(id);
  };

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  const font = (px, weight = 500, mono = false) => `${weight} ${px}px ${mono ? '"JetBrains Mono", ui-monospace, monospace' : '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif'}`;

  function ellipsize(text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  }

  function curve(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
  }

  function pointOn(x1, y1, x2, y2, t) {
    const mx = (x1 + x2) / 2;
    const u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    return [x, y];
  }

  function draw() {
    raf = 0;
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const s = focus ? state.get(focus) : null;
    const color = focus ? colorOf(focus) : C.muted;
    const now = performance.now();

    const top = 26;
    const zoneX = 0;
    const zoneW = Math.min(170, w * 0.22);
    const outW = Math.min(170, w * 0.22);
    const outX = w - outW;
    const candX = zoneW + Math.max(40, w * 0.08);
    const candW = outX - candX - Math.max(40, w * 0.08);

    ctx.textBaseline = 'middle';
    ctx.font = font(11, 600);
    ctx.fillStyle = C.faint;
    ctx.fillText('GÖRDÜĞÜ BÖLGELER', zoneX, 8);
    ctx.fillText('TARTTIĞI HAMLELER', candX, 8);
    ctx.fillText('SONUÇ', outX, 8);

    const zoneRowH = (h - top) / ZONES.length;
    const zoneY = (i) => top + zoneRowH * i + zoneRowH / 2;
    const d = s && s.decision;
    const cands = d ? d.candidates : [];
    const candRowH = (h - top) / Math.max(cands.length, 8);
    const candY = (i) => top + candRowH * i + candRowH / 2;
    const outRowH = (h - top) / OUTCOMES.length;
    const outY = (i) => top + outRowH * i + outRowH / 2;

    // edges zone -> candidate
    if (d) {
      cands.forEach((c, i) => {
        const zi = Math.max(0, ZONES.indexOf(c.zone));
        curve(zoneX + zoneW, zoneY(zi), candX - 6, candY(i));
        ctx.strokeStyle = c.chosen ? color : C.line;
        ctx.globalAlpha = c.chosen ? 1 : Math.min(0.9, 0.25 + c.p * 2.2);
        ctx.lineWidth = c.chosen ? 2.5 : 1 + c.p * 3;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // zones
    ZONES.forEach((z, i) => {
      const mass = d && d.zones ? d.zones[z] || 0 : 0;
      const y = zoneY(i);
      ctx.font = font(13, mass > 0 ? 600 : 400);
      ctx.fillStyle = mass > 0 ? C.text : C.faint;
      ctx.fillText(zoneLabels[z] || z, zoneX, y - 7);
      ctx.fillStyle = C.line;
      ctx.fillRect(zoneX, y + 6, zoneW - 10, 3);
      if (mass > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(zoneX, y + 6, Math.max(3, (zoneW - 10) * Math.min(1, mass)), 3);
      }
    });

    // candidates
    const barMax = Math.max(40, Math.min(150, candW * 0.3));
    cands.forEach((c, i) => {
      const y = candY(i);
      ctx.fillStyle = c.chosen ? color : C.line;
      ctx.fillRect(candX, y - 9, 3, 18);
      ctx.font = font(13, c.chosen ? 700 : 400);
      ctx.fillStyle = c.chosen ? C.text : C.muted;
      ctx.fillText(ellipsize(c.label, candW - barMax - 60), candX + 12, y);
      const bx = candX + candW - barMax - 44;
      ctx.fillStyle = C.line;
      ctx.fillRect(bx, y - 2, barMax, 4);
      ctx.fillStyle = c.chosen ? color : C.muted;
      ctx.fillRect(bx, y - 2, Math.max(2, barMax * Math.min(1, c.p * 2)), 4);
      ctx.font = font(12, 600, true);
      ctx.fillStyle = c.chosen ? C.text : C.faint;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(c.p * 100)}%`, candX + candW, y);
      ctx.textAlign = 'left';
    });

    // outcomes
    const chosenIdx = cands.findIndex((c) => c.chosen);
    const o = s && s.outcome;
    const lit = o ? new Set([o.issues > 0 ? 'issue' : null, o.requests > 0 ? 'net' : null, o.dead ? 'dead' : null, o.ok && !o.dead ? 'react' : null].filter(Boolean)) : new Set();
    const fresh = o && now - s.outcomeAt < 1600;
    OUTCOMES.forEach((oc, i) => {
      const y = outY(i);
      if (fresh && lit.has(oc.id) && chosenIdx >= 0) {
        curve(candX + candW + 6, candY(chosenIdx), outX - 8, y);
        ctx.strokeStyle = oc.id === 'issue' ? C.crit : color;
        ctx.globalAlpha = 1 - (now - s.outcomeAt) / 1600;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const on = fresh && lit.has(oc.id);
      ctx.font = font(13, on ? 700 : 500);
      ctx.fillStyle = on ? (oc.id === 'issue' ? C.crit : C.text) : C.muted;
      ctx.fillText(oc.label, outX, y - 7);
      ctx.font = font(12, 600, true);
      ctx.fillStyle = oc.id === 'issue' && s && s.tally.issue ? C.crit : C.faint;
      ctx.fillText(String(s ? s.tally[oc.id] : 0), outX, y + 10);
    });

    // travelling signal on the chosen edge
    let animating = false;
    if (d && chosenIdx >= 0 && !reduceMotion) {
      const t = (now - s.decidedAt) / 650;
      if (t < 1) {
        const c = cands[chosenIdx];
        const zi = Math.max(0, ZONES.indexOf(c.zone));
        const [px, py] = pointOn(zoneX + zoneW, zoneY(zi), candX - 6, candY(chosenIdx), t);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        animating = true;
      }
      if (fresh) animating = true;
    }
    if (!d) {
      ctx.font = font(14, 400);
      ctx.fillStyle = C.faint;
      ctx.fillText('Sürü başlayınca seçili ajanın her kararı burada görünür.', candX + 12, top + (h - top) / 2);
    }
    if (animating) raf = requestAnimationFrame(draw);
  }

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };

  new ResizeObserver(schedule).observe(canvas);

  return {
    setFocus(id) {
      focus = id;
      schedule();
    },
    decision(id, data) {
      const s = agentState(id);
      s.decision = data;
      s.decidedAt = performance.now();
      if (id === focus) schedule();
    },
    outcome(id, data) {
      const s = agentState(id);
      s.outcome = data;
      s.outcomeAt = performance.now();
      if (data.issues > 0) s.tally.issue += data.issues;
      if (data.requests > 0) s.tally.net += 1;
      if (data.dead) s.tally.dead += 1;
      else if (data.ok) s.tally.react += 1;
      if (id === focus) schedule();
    },
    reset() {
      state.clear();
      schedule();
    },
    current(id) {
      return state.get(id);
    },
  };
}
