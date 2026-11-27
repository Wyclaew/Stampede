// Decides what the impatient ghost does next, from what it can see on the page.
import { classifyElement, isAllowed } from './safety.js';

const MAX_TYPES_PER_FIELD = 3;

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
    const hitKey = `${pageKey}|${el.id}|${el.text}`;
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
        out.push({ kind: 'navigate', el, cls, hitKey, weight: (unseen ? 5 : 1) / penalty });
        break;
      }
      case 'transactional':
        out.push({ kind: 'rageClick', el, cls, hitKey, weight: 10 / penalty });
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

export function chooseAction(params, rng) {
  const candidates = buildCandidates(params);
  // Opening act: the first action on a fresh page is the CTA a real impatient user goes for.
  if (params.memory.actionsOnPage === 0) {
    const cta = candidates.filter((c) => c.cls && c.cls.isCTA).sort((a, b) => b.weight - a.weight)[0];
    if (cta && rng.chance(0.6)) return cta;
  }
  return rng.weighted(candidates);
}
