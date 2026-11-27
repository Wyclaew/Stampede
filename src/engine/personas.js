// The swarm: each persona is a different kind of real user, running in its own browser tab.
// kindBias multiplies strategy weights; kinds absent from `allow` are never chosen by that persona.

export const PERSONAS = Object.freeze({
  rage: Object.freeze({
    id: 'rage',
    code: 'A1',
    label: 'Öfkeli müşteri',
    tag: 'RAGE',
    color: '#74aef5',
    summary: 'Ödeme ve gönder butonlarına üst üste basar, yüklenirken geri/ileri yapar, sayfayı yeniler, tıklamadan hemen önce ekranı daraltır.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['rageClick', 'type', 'select', 'navigate', 'backForward', 'viewport', 'scroll', 'reload', 'login', 'offlineBurst', 'twinTab', 'slowNet', 'offline'],
    kindBias: { rageClick: 1.5, backForward: 1.4, reload: 1.6, login: 1.2, offlineBurst: 1, twinTab: 1 },
  }),
  keyboard: Object.freeze({
    id: 'keyboard',
    code: 'A2',
    label: 'Klavye kullanıcısı',
    tag: 'KEYS',
    color: '#4eccd3',
    summary: 'Fareye hiç dokunmaz: Tab ile gezer, Enter/Space ile tetikler, modallarda ESC spamlar. Odak göstergesini ve klavyeyle ulaşılamayan kontrolleri yakalar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['tabWalk', 'keyActivate', 'type', 'escapeSpam', 'login', 'backForward'],
    kindBias: { tabWalk: 1.4, keyActivate: 1.3 },
    keyboardOnly: true,
  }),
  mobile: Object.freeze({
    id: 'mobile',
    code: 'A3',
    label: 'Mobil kullanıcı',
    tag: 'TOUCH',
    color: '#ee8dbd',
    summary: 'Dokunmatik telefonda (390×844) parmakla basar, ekranı yan çevirir, sekmeyi arka plana atıp geri uyandırır, hızlı kaydırır.',
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
    code: 'A4',
    label: 'Meraklı saldırgan',
    tag: 'SNOOP',
    color: '#c2a7f4',
    summary: 'URL’deki kimlik numaralarını değiştirir, gizli form alanlarını kurcalar, tarayıcı hafızasını bozar, formlara enjeksiyon denemeleri yazar.',
    context: { viewport: { width: 1280, height: 800 } },
    allow: ['type', 'navigate', 'idTamper', 'hiddenTamper', 'storageCorrupt', 'storageFlood', 'login', 'select'],
    kindBias: { type: 1.6, idTamper: 1.2, storageCorrupt: 1 },
    hostileInputs: true,
  }),
});

export const PERSONA_ORDER = ['rage', 'keyboard', 'mobile', 'snoop'];

export function resolvePersonas(ids) {
  const list = (Array.isArray(ids) && ids.length ? ids : PERSONA_ORDER).filter((id, i, a) => a.indexOf(id) === i);
  for (const id of list) if (!PERSONAS[id]) throw new Error(`Bilinmeyen persona: "${id}". Geçerli: ${PERSONA_ORDER.join(', ')}`);
  return list.map((id) => PERSONAS[id]);
}
