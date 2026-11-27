// The "brain": turns what an agent can see into weighted candidate moves and picks one.
// Everything is local and seeded, so a decision can be replayed and drawn in the dashboard.
import { classifyElement, isAllowed, zoneOf } from './safety.js';

const MAX_TYPES_PER_FIELD = 3;
// Money-moving actions are where impatience hurts most: they get priority.
const MONEY = /(pay|checkout|purchase|buy|order|öde|satın|sipariş|kasa|sepet|cart)/i;
const ELEMENT_KINDS = new Set(['rageClick', 'navigate', 'select', 'type']);

export function normalizeVisitKey(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.hash === '#/' ? '' : u.hash}`;
  } catch {
    return url;
  }
}

const DEFAULT_PERSONA = { id: 'rage', allow: null, kindBias: {}, keyboardOnly: false };

function elementCandidates({ elements, mode, origin, memory, pageKey, persona }) {
  const out = [];
  for (const el of elements) {
    if (!el.inViewport && memory.actionsOnPage < 2 && !persona.keyboardOnly) continue; // start with what's on screen
    const cls = classifyElement(el, origin);
    if (!isAllowed(cls.category, mode)) continue;
    // Same-labelled controls ("Add to cart" ×12) share one memory slot; fields are tracked individually.
    const hitKey = `${pageKey}|${el.editable || !el.text ? el.id : el.text}`;
    const hits = memory.hits.get(hitKey) || 0;
    const penalty = 1 + hits * 1.6;
    const money = MONEY.test(`${el.text} ${el.ariaLabel}`);
    const zone = zoneOf(el, cls);
    const base = { el, cls, hitKey, zone, money };
    switch (cls.category) {
      case 'input':
      case 'sensitive-input':
        if (hits < MAX_TYPES_PER_FIELD) out.push({ ...base, kind: 'type', weight: 5 / penalty });
        break;
      case 'select':
        if (el.optionCount > 1) out.push({ ...base, kind: 'select', weight: 3 / penalty });
        break;
      case 'toggle':
        out.push({ ...base, kind: 'rageClick', weight: 1.5 / penalty });
        break;
      case 'nav': {
        const href = el.absHref || '';
        if (!href || el.href === '#' || el.target === '_blank') break;
        const unseen = !memory.visited.has(normalizeVisitKey(href));
        out.push({ ...base, kind: 'navigate', weight: ((unseen ? 5 : 1) * (money ? 1.6 : 1)) / penalty });
        break;
      }
      case 'transactional':
        out.push({ ...base, kind: 'rageClick', weight: (money ? 14 : 8) / penalty });
        if (money && mode.allowTransactional && !memory.offlineBurstOn.has(pageKey)) {
          out.push({ ...base, kind: 'offlineBurst', zone: 'checkout', hitKey: `${hitKey}|offline`, weight: 2.5 });
        }
        break;
      case 'destructive':
        out.push({ ...base, kind: 'rageClick', weight: 0.8 / penalty });
        break;
      default:
        out.push({ ...base, kind: 'rageClick', weight: 3.5 / penalty });
    }
  }
  return out;
}

function globalCandidates({ mode, memory, pageKey, snapshot }) {
  const out = [];
  const g = (kind, weight, zone = 'page') => out.push({ kind, weight, zone });
  const shakenHere = memory.viewportShakenOn.has(pageKey);
  g('viewport', shakenHere ? 1.2 : 7);
  if (memory.navCount > 0) g('backForward', memory.lastKind === 'navigate' ? 6 : 2);
  g('scroll', 1.2);
  g('keys', 0.8);
  if (mode.reload) g('reload', 0.5);
  if (mode.offlineFlap) g('offline', 1.2);
  if (mode.offlineFlap) g('slowNet', 1);
  g('rotate', memory.rotated ? 0.8 : 4);
  g('sleepWake', 1.2);
  g('tabWalk', memory.actionsOnPage === 0 ? 8 : 3);
  g('escapeSpam', 1.4);
  g('idTamper', /\d/.test(pageKey) ? 4 : 1.5, 'nav');
  if (snapshot.hiddenInputs > 0) g('hiddenTamper', 3, 'form');
  if (snapshot.storageKeys > 0 && !memory.storageCorrupted.has(pageKey)) g('storageCorrupt', 4);
  if (!memory.storageFlooded) g('storageFlood', 1.5);
  if (mode.allowTransactional && !memory.twinOn.has(pageKey)) g('twinTab', 2.2);
  if (snapshot.auth && !memory.loginTried.has(pageKey)) g('login', 12, 'auth');
  return out;
}

/** Keyboard users activate controls with Enter/Space instead of a mouse. */
function adaptToPersona(c, persona) {
  if (persona.keyboardOnly && c.el && c.kind !== 'type') return { ...c, kind: 'keyActivate' };
  return c;
}

/**
 * Build weighted candidate moves for one agent.
 * @returns {Array<{kind:string, weight:number, zone:string, el?:object}>}
 */
export function buildCandidates(params) {
  const persona = params.persona || DEFAULT_PERSONA;
  const snapshot = params.snapshot || { hiddenInputs: 0, storageKeys: 0, auth: null };
  const memory = withMemoryDefaults(params.memory);
  const all = [...elementCandidates({ ...params, memory, persona }), ...globalCandidates({ ...params, memory, snapshot })]
    .map((c) => adaptToPersona(c, persona))
    .filter((c) => !persona.allow || persona.allow.includes(c.kind))
    .map((c) => ({ ...c, weight: c.weight * (persona.kindBias[c.kind] || 1) }));
  // Do not repeat the same global move back to back.
  return all.map((c) => (c.kind === memory.lastKind && !c.el ? { ...c, weight: c.weight * 0.3 } : c));
}

export function withMemoryDefaults(memory) {
  return {
    offlineBurstOn: new Set(),
    storageCorrupted: new Set(),
    twinOn: new Set(),
    loginTried: new Set(),
    storageFlooded: false,
    rotated: false,
    ...memory,
  };
}

/** Collapse candidates that share kind + label into one (picked at random), so a grid of 12
 * identical buttons does not drown out the single "Pay" button. */
export function collapseDuplicates(candidates, rng) {
  const groups = new Map();
  for (const c of candidates) {
    const key = c.el && c.el.text && !c.el.editable ? `${c.kind}|${c.el.text}` : `${c.kind}|${c.el ? c.el.id : ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.values()].map((g) => (g.length === 1 ? g[0] : rng.pick(g)));
}

/** Decide the next move and return the ranked field it was chosen from (for the brain view). */
export function decide(params, rng) {
  const candidates = collapseDuplicates(buildCandidates(params), rng).filter((c) => c.weight > 0);
  const total = candidates.reduce((s, c) => s + c.weight, 0) || 1;
  const ranked = [...candidates].sort((a, b) => b.weight - a.weight).map((c) => ({ ...c, p: c.weight / total }));
  let choice = null;
  const persona = params.persona || DEFAULT_PERSONA;
  // Opening act: on a fresh page the angry customer goes straight for the money button.
  if (params.memory.actionsOnPage === 0 && persona.id === 'rage') {
    const cta = ranked.find((c) => c.cls && c.cls.isCTA && c.kind === 'rageClick');
    if (cta && rng.chance(0.7)) choice = cta;
  }
  if (!choice) choice = rng.weighted(ranked);
  return { choice, ranked };
}

export function chooseAction(params, rng) {
  return decide(params, rng).choice;
}
