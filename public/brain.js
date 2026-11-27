// Decision graph. Two views:
//  • "all":   every agent's latest decision on one canvas: zone it targets -> its chosen move -> outcome, in agent colours
//  • agent:   one agent's full reasoning: zones -> weighted candidates -> outcomes
// Signals travel along edges as small particles; the loop only runs while something moves.
const ZONES = ['auth', 'checkout', 'search', 'form', 'nav', 'content', 'page'];
const OUTCOMES = [
  { id: 'react', label: 'Tepki verdi' },
  { id: 'net', label: 'Ağ isteği' },
  { id: 'issue', label: 'Sorun bulundu' },
  { id: 'dead', label: 'Tepki yok' },
];
const C = {
  text: '#e4e8ed',
  muted: '#9ba6b1',
  faint: '#5d6873',
  line: '#2a323b',
  lineSoft: '#1f262e',
  node: '#161c22',
  crit: '#fc4447',
  ai: '#5aea98',
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SANS = '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function createBrain(canvas, { zoneLabels, agentInfo }) {
  const ctx = canvas.getContext('2d');
  const agents = new Map(); // id -> { decision, decidedAt, outcome, outcomeAt, tally }
  let view = 'all';
  let order = [];
  let particles = [];
  let raf = 0;
  const totals = { react: 0, net: 0, issue: 0, dead: 0 };
  const byOutcome = { react: {}, net: {}, issue: {}, dead: {} };

  const st = (id) => {
    if (!agents.has(id)) agents.set(id, { decision: null, decidedAt: 0, outcome: null, outcomeAt: 0, tally: { react: 0, net: 0, issue: 0, dead: 0 } });
    return agents.get(id);
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
  const font = (px, weight = 500, mono = false) => `${weight} ${px}px ${mono ? MONO : SANS}`;
  function ellipsize(text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  }
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  const bez = (a, b) => {
    const mx = (a[0] + b[0]) / 2;
    return [a, [mx, a[1]], [mx, b[1]], b];
  };
  function strokeBez(p, color, width, alpha) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function onBez(p, t) {
    const u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    return [x, y];
  }
  function spawnParticles(path, color, count = 3, delay = 0) {
    if (reduceMotion) return;
    const now = performance.now();
    for (let i = 0; i < count; i++) particles.push({ path, color, t0: now + delay + i * 140, dur: 700 });
  }

  // ---------- layout helpers ----------
  function columns(w) {
    const zoneW = Math.max(150, Math.min(180, w * 0.21));
    const outW = Math.max(120, Math.min(160, w * 0.17));
    const gap = Math.max(36, w * 0.06);
    return { zoneX: 0, zoneW, candX: zoneW + gap, candW: w - zoneW - outW - gap * 2, outX: w - outW, outW };
  }
  function drawHeaders(L, left, mid, right) {
    ctx.font = font(11, 600);
    ctx.fillStyle = C.faint;
    ctx.textBaseline = 'middle';
    ctx.fillText(left, L.zoneX, 9);
    ctx.fillText(mid, L.candX, 9);
    ctx.fillText(right, L.outX, 9);
  }
  function zoneNodes(L, top, h, massOf, colorsOf) {
    const rowH = (h - top) / ZONES.length;
    const pos = {};
    ZONES.forEach((z, i) => {
      const y = top + rowH * i + rowH / 2;
      const mass = massOf(z);
      const x = L.zoneX;
      const w = L.zoneW - 8;
      rounded(x, y - 15, w, 30, 8);
      ctx.fillStyle = C.node;
      ctx.fill();
      ctx.strokeStyle = mass > 0 ? '#3a4652' : C.lineSoft;
      ctx.lineWidth = 1;
      ctx.stroke();
      const cols = colorsOf(z);
      if (cols.length) {
        const segW = (w - 2) / Math.max(cols.length, 1);
        cols.forEach((c, k) => {
          ctx.fillStyle = c;
          ctx.fillRect(x + 1 + k * segW, y + 12, segW - 1, 2);
        });
      }
      ctx.font = font(13, mass > 0 ? 600 : 400);
      ctx.fillStyle = mass > 0 ? C.text : C.faint;
      ctx.fillText(ellipsize(zoneLabels[z] || z, w - 22), x + 10, y - 1);
      pos[z] = [x + w, y];
    });
    return pos;
  }
  function outcomeNodes(L, top, h, now) {
    const rowH = (h - top) / OUTCOMES.length;
    const pos = {};
    OUTCOMES.forEach((o, i) => {
      const y = top + rowH * i + rowH / 2;
      const x = L.outX;
      const w = L.outW;
      rounded(x, y - 20, w, 40, 8);
      ctx.fillStyle = C.node;
      ctx.fill();
      ctx.strokeStyle = o.id === 'issue' && totals.issue ? rgba('#fc4447', 0.55) : C.lineSoft;
      ctx.stroke();
      ctx.font = font(12, 600);
      ctx.fillStyle = o.id === 'issue' && totals.issue ? C.crit : C.muted;
      ctx.fillText(o.label, x + 10, y - 7);
      ctx.font = font(15, 700, true);
      ctx.fillStyle = C.text;
      ctx.textAlign = 'right';
      ctx.fillText(String(view === 'all' ? totals[o.id] : (agents.get(view) || st(view)).tally[o.id]), x + w - 10, y - 6);
      ctx.textAlign = 'left';
      // stacked agent contribution bar
      const contrib = byOutcome[o.id];
      const sum = Object.values(contrib).reduce((s, v) => s + v, 0);
      let bx = x + 10;
      const bw = w - 20;
      if (sum && view === 'all') {
        for (const id of order) {
          const v = contrib[id] || 0;
          if (!v) continue;
          const seg = (bw * v) / sum;
          ctx.fillStyle = agentInfo(id).color;
          ctx.fillRect(bx, y + 9, Math.max(1, seg - 1), 3);
          bx += seg;
        }
      } else {
        ctx.fillStyle = C.line;
        ctx.fillRect(bx, y + 9, bw, 3);
      }
      pos[o.id] = [x, y];
    });
    return pos;
  }
  const outcomeIds = (o) => (o ? [o.issues > 0 ? 'issue' : null, o.requests > 0 ? 'net' : null, o.dead ? 'dead' : null, o.ok && !o.dead ? 'react' : null].filter(Boolean) : []);

  // ---------- views ----------
  function drawAll(w, h, now) {
    const L = columns(w);
    const top = 28;
    drawHeaders(L, 'HEDEF BÖLGE', 'AJANLARIN SON KARARI', 'SONUÇ');
    const live = order.filter((id) => agents.get(id) && agents.get(id).decision);
    const zoneCount = {};
    const zoneColors = {};
    for (const id of live) {
      const c = agents.get(id).decision.candidates.find((x) => x.chosen);
      if (!c) continue;
      zoneCount[c.zone] = (zoneCount[c.zone] || 0) + 1;
      (zoneColors[c.zone] = zoneColors[c.zone] || []).push(agentInfo(id).color);
    }
    const zpos = zoneNodes(L, top, h, (z) => zoneCount[z] || 0, (z) => zoneColors[z] || []);
    const opos = outcomeNodes(L, top, h, now);
    const rows = Math.max(live.length, 4);
    const rowH = Math.min(46, (h - top) / rows);
    const y0 = top + ((h - top) - rowH * live.length) / 2;
    live.forEach((id, i) => {
      const s = agents.get(id);
      const info = agentInfo(id);
      const d = s.decision;
      const chosen = d.candidates.find((x) => x.chosen) || d.candidates[0];
      const y = y0 + rowH * i + rowH / 2;
      const left = [L.candX, y];
      const right = [L.candX + L.candW, y];
      const age = now - s.decidedAt;
      const fresh = Math.max(0, 1 - age / 1400);
      strokeBez(bez(zpos[chosen.zone] || zpos.page, left), info.color, 1.5 + fresh * 1.5, 0.35 + fresh * 0.55);
      // row
      rounded(L.candX, y - rowH / 2 + 4, L.candW, rowH - 8, 7);
      ctx.fillStyle = fresh > 0.05 ? rgba(info.color, 0.07 + fresh * 0.08) : C.node;
      ctx.fill();
      ctx.font = font(11, 700, true);
      const chipW = ctx.measureText(info.code).width + 12;
      rounded(L.candX + 8, y - 9, chipW, 18, 4);
      ctx.fillStyle = info.color;
      ctx.fill();
      ctx.fillStyle = '#0b1015';
      ctx.fillText(info.code, L.candX + 14, y + 0.5);
      const distW = Math.min(90, L.candW * 0.22);
      const labelX = L.candX + 16 + chipW;
      const labelMax = L.candW - chipW - distW - 70;
      ctx.font = font(13, 600);
      ctx.fillStyle = C.text;
      ctx.fillText(ellipsize(chosen.label, labelMax), labelX, y);
      if (chosen.ai) {
        const lw = Math.min(ctx.measureText(chosen.label).width, labelMax);
        ctx.font = font(10, 700, true);
        ctx.fillStyle = C.ai;
        ctx.fillText('AI', labelX + lw + 8, y);
      }
      // probability distribution of the top candidates
      const top5 = d.candidates.slice(0, 6);
      const bx = L.candX + L.candW - distW - 48;
      const bw = distW / top5.length;
      top5.forEach((c, k) => {
        const bh = Math.max(2, (rowH - 22) * Math.min(1, c.p * 2.2));
        ctx.fillStyle = c.chosen ? info.color : '#38424c';
        ctx.fillRect(bx + k * bw, y + (rowH - 22) / 2 - bh + 2, bw - 3, bh);
      });
      ctx.font = font(12, 600, true);
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(chosen.p * 100)}%`, L.candX + L.candW - 8, y);
      ctx.textAlign = 'left';
      // outcome edges
      const ofresh = Math.max(0, 1 - (now - s.outcomeAt) / 1600);
      if (s.outcome && ofresh > 0) {
        for (const oid of outcomeIds(s.outcome)) {
          strokeBez(bez(right, opos[oid]), oid === 'issue' ? C.crit : info.color, 1.5, ofresh * 0.9);
        }
      }
      s.rowAnchors = { left, right, zone: zpos[chosen.zone] || zpos.page };
    });
    if (!live.length) emptyMsg(w, h, 'Sürü başlayınca her ajanın kararı burada kendi renginde akar.');
    return { zpos, opos };
  }

  function drawAgent(id, w, h, now) {
    const L = columns(w);
    const top = 28;
    const info = agentInfo(id);
    drawHeaders(L, 'GÖRDÜĞÜ BÖLGELER', `${info.code} · TARTTIĞI HAMLELER`, 'SONUÇ');
    const s = agents.get(id);
    const d = s && s.decision;
    const zones = d ? d.zones || {} : {};
    const zpos = zoneNodes(L, top, h, (z) => zones[z] || 0, (z) => (zones[z] ? [info.color] : []));
    const opos = outcomeNodes(L, top, h, now);
    if (!d) {
      emptyMsg(w, h, 'Bu ajan henüz karar vermedi.');
      return;
    }
    const cands = d.candidates;
    const rowH = Math.min(36, (h - top) / Math.max(cands.length, 6));
    const y0 = top + ((h - top) - rowH * cands.length) / 2;
    const fresh = Math.max(0, 1 - (now - s.decidedAt) / 1400);
    cands.forEach((c, i) => {
      const y = y0 + rowH * i + rowH / 2;
      const left = [L.candX, y];
      strokeBez(bez(zpos[c.zone] || zpos.page, left), c.chosen ? info.color : '#3a4652', c.chosen ? 2 + fresh * 1.5 : 1 + c.p * 4, c.chosen ? 0.5 + fresh * 0.5 : 0.25 + c.p);
      if (c.chosen) {
        rounded(L.candX, y - rowH / 2 + 3, L.candW, rowH - 6, 6);
        ctx.fillStyle = rgba(info.color, 0.08 + fresh * 0.1);
        ctx.fill();
      }
      ctx.fillStyle = c.chosen ? info.color : '#38424c';
      ctx.fillRect(L.candX, y - 8, 3, 16);
      const barMax = Math.min(150, L.candW * 0.28);
      ctx.font = font(13, c.chosen ? 700 : 400);
      ctx.fillStyle = c.chosen ? C.text : C.muted;
      const lbl = ellipsize(c.label, L.candW - barMax - 80);
      ctx.fillText(lbl, L.candX + 12, y);
      if (c.ai) {
        ctx.font = font(10, 700, true);
        ctx.fillStyle = C.ai;
        ctx.fillText('AI', L.candX + 20 + ctx.measureText(lbl).width * 1.08, y);
      }
      const bx = L.candX + L.candW - barMax - 44;
      ctx.fillStyle = C.lineSoft;
      ctx.fillRect(bx, y - 2, barMax, 4);
      ctx.fillStyle = c.chosen ? info.color : '#5d6873';
      ctx.fillRect(bx, y - 2, Math.max(2, barMax * Math.min(1, c.p * 2)), 4);
      ctx.font = font(12, 600, true);
      ctx.fillStyle = c.chosen ? C.text : C.faint;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(c.p * 100)}%`, L.candX + L.candW - 4, y);
      ctx.textAlign = 'left';
      if (c.chosen) {
        s.rowAnchors = { left, right: [L.candX + L.candW, y], zone: zpos[c.zone] || zpos.page };
        const ofresh = Math.max(0, 1 - (now - s.outcomeAt) / 1600);
        if (s.outcome && ofresh > 0) for (const oid of outcomeIds(s.outcome)) strokeBez(bez([L.candX + L.candW, y], opos[oid]), oid === 'issue' ? C.crit : info.color, 1.8, ofresh);
      }
    });
    ctx.font = font(12, 500, true);
    ctx.fillStyle = C.faint;
  }

  function emptyMsg(w, h, text) {
    ctx.font = font(14, 400);
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, h / 2 + 10);
    ctx.textAlign = 'left';
  }

  function drawParticles(now) {
    particles = particles.filter((p) => now - p.t0 < p.dur);
    for (const p of particles) {
      const t = (now - p.t0) / p.dur;
      if (t < 0) continue;
      for (let k = 0; k < 4; k++) {
        const tt = Math.max(0, t - k * 0.04);
        const [x, y] = onBez(p.path, tt);
        ctx.beginPath();
        ctx.arc(x, y, 3 - k * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(p.color, 1 - k * 0.25);
        ctx.fill();
      }
    }
  }

  function draw() {
    raf = 0;
    const { w, h } = size();
    const now = performance.now();
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    if (view === 'all') drawAll(w, h, now);
    else drawAgent(view, w, h, now);
    drawParticles(now);
    const busy = particles.length > 0 || [...agents.values()].some((s) => now - s.decidedAt < 1500 || now - s.outcomeAt < 1700);
    if (busy && !reduceMotion) raf = requestAnimationFrame(draw);
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  new ResizeObserver(schedule).observe(canvas);

  return {
    setAgents(ids) {
      order = ids.slice();
      schedule();
    },
    setView(v) {
      view = v;
      schedule();
    },
    decision(id, data) {
      const s = st(id);
      s.decision = data;
      s.decidedAt = performance.now();
      if (view === 'all' || view === id) {
        draw();
        if (s.rowAnchors) spawnParticles(bez(s.rowAnchors.zone, s.rowAnchors.left), agentInfo(id).color, 3);
        schedule();
      }
    },
    outcome(id, data) {
      const s = st(id);
      s.outcome = data;
      s.outcomeAt = performance.now();
      for (const oid of outcomeIds(data)) {
        totals[oid] += oid === 'issue' ? data.issues : 1;
        s.tally[oid] += oid === 'issue' ? data.issues : 1;
        byOutcome[oid][id] = (byOutcome[oid][id] || 0) + 1;
      }
      if ((view === 'all' || view === id) && s.rowAnchors) {
        const { w } = size();
        const L = columns(w);
        const rowH = (canvas.clientHeight - 28) / OUTCOMES.length;
        for (const oid of outcomeIds(data)) {
          const i = OUTCOMES.findIndex((o) => o.id === oid);
          spawnParticles(bez(s.rowAnchors.right, [L.outX, 28 + rowH * i + rowH / 2]), oid === 'issue' ? C.crit : agentInfo(id).color, 2);
        }
      }
      schedule();
    },
    reset() {
      agents.clear();
      particles = [];
      for (const k of Object.keys(totals)) totals[k] = 0;
      for (const k of Object.keys(byOutcome)) byOutcome[k] = {};
      schedule();
    },
  };
}
