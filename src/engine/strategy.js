// Decides what the impatient ghost does next, from what it can see on the page.
import { classifyElement, isAllowed } from './safety.js';

const MAX_TYPES_PER_FIELD = 3;
// Money-moving actions are where impatience hurts most: they get priority.
const MONEY = /(pay|checkout|purchase|buy|order|öde|satın|sipariş|kasa|sepet|cart)/i;

export function normalizeVisitKey(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.hash}`;
  } catch {
    return url;
  }
}

/**
 * Build weighted candidate actions.
 * @param {object} p
 * @param {Array} p.elements discovered descriptors
 * @param {object} p.mode safety mode
 * @param {string} p.origin target origin
 * @param {object} p.memory { hits: Map<string,number>, visited: Set<string>, lastKind, actionsOnPage, viewportShakenOn: Set, navCount }
 * @param {string} p.pageKey normalized current url
 */
export function buildCandidates({ elements, mode, origin, memory, pageKey }) {
  const out = [];
  for (const el of elements) {
    if (!el.inViewport && memory.actionsOnPage < 2) continue; // start with what's on screen
    const cls = classifyElement(el, origin);
    if (!isAllowed(cls.category, mode)) continue;
    // Same-labelled controls ("Add to cart" ×12) share one memory slot; fields are tracked individually.
    const hitKey = `${pageKey}|${el.editable || !el.text ? el.id : el.text}`;
    const money = MONEY.test(`${el.text} ${el.ariaLabel}`);
    const hits = memory.hits.get(hitKey) || 0;
    const penalty = 1 + hits * 1.6;
    switch (cls.category) {
      case 'input':
      case 'sensitive-input':
        if (hits >= MAX_TYPES_PER_FIELD) break;
        out.push({ kind: 'type', el, cls, hitKey, weight: 5 / penalty });
        break;
      case 'select':
        if (el.optionCount > 1) out.push({ kind: 'select', el, cls, hitKey, weight: 3 / penalty });
        break;
      case 'toggle':
        out.push({ kind: 'rageClick', el, cls, hitKey, weight: 1.5 / penalty });
        break;
      case 'nav': {
        const href = el.absHref || '';
        if (!href || el.href === '#' || el.target === '_blank') break;
        const unseen = !memory.visited.has(normalizeVisitKey(href));
        out.push({ kind: 'navigate', el, cls, hitKey, weight: ((unseen ? 5 : 1) * (money ? 1.6 : 1)) / penalty });
        break;
      }
      case 'transactional':
        out.push({ kind: 'rageClick', el, cls, hitKey, money, weight: (money ? 14 : 8) / penalty });
        break;
      case 'destructive':
        out.push({ kind: 'rageClick', el, cls, hitKey, weight: 0.8 / penalty });
        break;
      default:
        out.push({ kind: 'rageClick', el, cls, hitKey, weight: 3.5 / penalty });
    }
  }

  const shakenHere = memory.viewportShakenOn.has(pageKey);
  out.push({ kind: 'viewport', weight: shakenHere ? 1.2 : 7 });
  if (memory.navCount > 0) out.push({ kind: 'backForward', weight: memory.lastKind === 'navigate' ? 6 : 2 });
  out.push({ kind: 'scroll', weight: 1.2 });
  out.push({ kind: 'keys', weight: 0.8 });
  if (mode.reload) out.push({ kind: 'reload', weight: 0.5 });
  if (mode.offlineFlap) out.push({ kind: 'offline', weight: 1.2 });

  // Do not repeat the same global action back to back.
  return out.map((c) => (c.kind === memory.lastKind && !c.el ? { ...c, weight: c.weight * 0.3 } : c));
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

export function chooseAction(params, rng) {
  const candidates = collapseDuplicates(buildCandidates(params), rng);
  // Opening act: on a fresh page the ghost goes straight for the money button, like a real impatient user.
  if (params.memory.actionsOnPage === 0) {
    const cta = candidates.filter((c) => c.cls && c.cls.isCTA).sort((a, b) => b.weight - a.weight)[0];
    if (cta && rng.chance(0.7)) return cta;
  }
  return rng.weighted(candidates);
}
