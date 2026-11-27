// The swarm: each persona is a different kind of real user, running in its own browser tab.
// kindBias multiplies strategy weights; kinds absent from `allow` are never chosen by that persona.

export const PERSONAS = Object.freeze({
  rage: Object.freeze({
    id: 'rage',
    label: 'Öfkeli müşteri',
    tag: 'RAGE',
    summary: 'Ödeme ve gönder butonlarına üst üste basar, yüklenirken geri/ileri yapar, sayfayı yeniler, tıklamadan hemen önce ekranı daraltır, öderken internet kopar, ikinci sekmeden de öder.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['rageClick', 'type', 'select', 'navigate', 'backForward', 'viewport', 'scroll', 'reload', 'login', 'offlineBurst', 'twinTab', 'slowNet', 'offline'],
    kindBias: { rageClick: 1.5, backForward: 1.4, reload: 1.6, login: 1.2, offlineBurst: 1, twinTab: 1 },
  }),
  keyboard: Object.freeze({
    id: 'keyboard',
    label: 'Klavye kullanıcısı',
    tag: 'KEYS',
    summary: 'Fareye hiç dokunmaz: Tab ile gezer, Enter/Space ile tetikler, modallarda ESC spamlar. Görünmeyen odağı ve klavyeyle açılamayan kontrolleri yakalar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['tabWalk', 'keyActivate', 'type', 'escapeSpam', 'login', 'backForward'],
    kindBias: { tabWalk: 1.4, keyActivate: 1.3 },
    keyboardOnly: true,
  }),
  mobile: Object.freeze({
    id: 'mobile',
    label: 'Mobil kullanıcı',
    tag: 'TOUCH',
    summary: 'Dokunmatik telefonda (390×844) parmakla basar, ekranı yan çevirir, sekmeyi arka plana atıp uyandırır, hızlı kaydırır.',
    // isMobile stays off: Chromium would zoom out overflowing pages and touch coordinates would miss.
    context: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
    allow: ['rageClick', 'type', 'select', 'navigate', 'scroll', 'rotate', 'sleepWake', 'login', 'backForward'],
    kindBias: { rotate: 1.2, scroll: 1.5 },
    touch: true,
  }),
  snoop: Object.freeze({
    id: 'snoop',
    label: 'Meraklı saldırgan',
    tag: 'SNOOP',
    summary: 'URL’deki kimlik numaralarını değiştirir, gizli form alanlarını ve tarayıcı hafızasını kurcalar, formlara XSS/SQL denemeleri yazar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['type', 'navigate', 'idTamper', 'hiddenTamper', 'storageCorrupt', 'storageFlood', 'login', 'select'],
    kindBias: { type: 1.6, idTamper: 1.2, storageCorrupt: 1 },
    hostileInputs: true,
  }),
  abandoner: Object.freeze({
    id: 'abandoner',
    label: 'Yarıda bırakan',
    tag: 'QUIT',
    summary: 'Formu doldurmaya başlar, başka sayfaya geçer, geri döner. Geri geldiğinde yazdıklarının durup durmadığını kontrol eder; sayfayı yarıda yeniler.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['abandonForm', 'type', 'navigate', 'backForward', 'reload', 'select'],
    kindBias: { abandonForm: 2.2, backForward: 1.3 },
  }),
  slow: Object.freeze({
    id: 'slow',
    label: 'Yavaş bağlantı',
    tag: 'SLOW',
    summary: 'Eski telefon ve zayıf internet: ağ yavaş 3G, işlemci 4 kat yavaş. Bir şey olmadığını sanıp butona bir saniye sonra yine basar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['rageClick', 'type', 'navigate', 'scroll', 'backForward', 'login', 'select'],
    kindBias: { rageClick: 1.4 },
    slowDevice: true,
    hesitantClicks: true,
  }),
  bot: Object.freeze({
    id: 'bot',
    label: 'Hızlı gezgin (bot)',
    tag: 'CRAWL',
    summary: 'Sitedeki bağlantıları beklemeden art arda açar, URL’leri dener. Kırık linkleri, 404/500 dönen ve yavaş açılan sayfaları toplar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['crawl', 'navigate', 'idTamper', 'scroll'],
    kindBias: { crawl: 2.5, navigate: 1.2 },
    fastPace: true,
  }),
});

export const PERSONA_ORDER = ['rage', 'keyboard', 'mobile', 'snoop', 'abandoner', 'slow', 'bot'];
export const DEFAULT_SWARM = ['rage', 'keyboard', 'mobile', 'snoop'];
export const MAX_AGENTS = 8;
export const MAX_PER_PERSONA = 3;

/** Distinct, projector-readable agent colours (index = slot in the swarm). */
export const AGENT_COLORS = Object.freeze(['#74aef5', '#4eccd3', '#ee8dbd', '#c2a7f4', '#d9c38c', '#8fd9a8', '#f29b88', '#a8b8c8']);

/** Personas only (deduplicated) — for callers that just need the definitions. */
export function resolvePersonas(ids) {
  const list = (Array.isArray(ids) && ids.length ? ids : DEFAULT_SWARM).filter((id, i, a) => a.indexOf(id) === i);
  for (const id of list) if (!PERSONAS[id]) throw new Error(`Bilinmeyen persona: "${id}". Geçerli: ${PERSONA_ORDER.join(', ')}`);
  return list.map((id) => PERSONAS[id]);
}

/**
 * Turn a persona list (repeats allowed, e.g. ['rage','rage','snoop']) into agent slots with
 * unique ids (rage, rage-2 ...), codes (A1 ...) and colours.
 */
export function buildRoster(ids) {
  const list = Array.isArray(ids) && ids.length ? ids : DEFAULT_SWARM;
  if (list.length > MAX_AGENTS) throw new Error(`Aynı anda en fazla ${MAX_AGENTS} ajan çalışabilir.`);
  const seen = {};
  return list.map((pid, i) => {
    const persona = PERSONAS[pid];
    if (!persona) throw new Error(`Bilinmeyen persona: "${pid}". Geçerli: ${PERSONA_ORDER.join(', ')}`);
    seen[pid] = (seen[pid] || 0) + 1;
    if (seen[pid] > MAX_PER_PERSONA) throw new Error(`Bir personadan en fazla ${MAX_PER_PERSONA} kopya olabilir (${pid}).`);
    const n = seen[pid];
    return Object.freeze({
      id: n === 1 ? pid : `${pid}-${n}`,
      persona,
      code: `A${i + 1}`,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
      label: n === 1 ? persona.label : `${persona.label} ${n}`,
      tag: persona.tag,
    });
  });
}
