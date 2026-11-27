// Issue model, de-duplication and the resilience score.

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
export const SEVERITY_LABEL = { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
const SEVERITY_PENALTY = { critical: 25, high: 12, medium: 5, low: 2 };

/** Catalogue of issue types: Turkish title, what it means, how to fix it. */
export const ISSUE_TYPES = Object.freeze({
  'double-submit': {
    title: 'Çift gönderim / yarış durumu',
    meaning: 'Aynı değiştirici istek (POST/PUT/...) kısa sürede birden fazla kez başarıyla işlendi. Sabırsız kullanıcı iki kez tıklarsa iki kez ödeme/sipariş oluşur.',
    fix: 'İstek sürerken butonu disable edin, isteğe Idempotency-Key header ekleyin ve sunucuda aynı anahtarlı istekleri tekilleştirin.',
  },
  'js-exception': {
    title: 'Yakalanmamış JavaScript hatası',
    meaning: 'Sayfada yakalanmamış bir exception veya promise rejection oluştu; arayüz yarım kalmış/bozuk durumda olabilir.',
    fix: 'Hata mesajındaki satırda null/undefined kontrolü ekleyin, async akışları try/catch ile sarın, kullanıcıya hata durumu gösterin.',
  },
  'console-error': {
    title: 'Konsol hatası',
    meaning: 'Uygulama console.error ile hata bildirdi.',
    fix: 'Konsoldaki hatayı kaynağında ele alın; kullanıcıya görünür bir hata/yeniden dene durumu sunun.',
  },
  'server-error': {
    title: 'Sunucu hatası (5xx)',
    meaning: 'Beklenmedik girdi veya hızlı ardışık istekler sunucuyu 5xx hatasına düşürdü.',
    fix: 'Sunucuda girdiyi doğrulayın (400 döndürün), beklenmeyen hataları loglayıp anlamlı yanıt verin.',
  },
  'client-error': {
    title: 'İstemci hatası (4xx) / kırık kaynak',
    meaning: 'Bir API çağrısı veya kaynak 4xx döndü (404, 422 ...).',
    fix: 'Kırık linkleri/kaynakları düzeltin; API doğrulama hatalarını arayüzde gösterin.',
  },
  'request-failed': {
    title: 'Başarısız ağ isteği',
    meaning: 'Bir istek tamamlanamadı (bağlantı reddedildi, DNS, CORS...).',
    fix: 'Endpoint erişilebilirliğini ve CORS ayarlarını kontrol edin; ağ hatalarında yeniden deneme/geri bildirim ekleyin.',
  },
  'slow-request': {
    title: 'Yavaş istek',
    meaning: 'İstek 3 saniyeden uzun sürdü; sabırsız kullanıcı bu sürede tekrar tıklar veya sayfayı terk eder.',
    fix: 'Endpointi hızlandırın/önbelleğe alın; beklerken iskelet/ilerleme gösterin ve tekrarlı tıklamayı engelleyin.',
  },
  'stuck-spinner': {
    title: 'Takılı kalan yükleniyor göstergesi',
    meaning: 'Bir yükleniyor/spinner göstergesi uzun süredir ekranda; muhtemelen hata durumunda kapatılmıyor.',
    fix: 'Spinnerı finally bloğunda kapatın, istek sayaçlarını hata durumunda da azaltın, zaman aşımı ve hata mesajı ekleyin.',
  },
  'layout-overflow': {
    title: 'Yatay taşma (mobil kırılma)',
    meaning: 'Sayfa genişliği ekranı aşıyor; mobilde yatay kaydırma çıkıyor ve içerik kesiliyor.',
    fix: 'Taşan elemandaki sabit width/min-width ve white-space: nowrap değerlerini kaldırın; max-width: 100%, flex-wrap ve media query kullanın.',
  },
  'obscured-element': {
    title: 'Üstü kapalı / tıklanamayan eleman',
    meaning: 'Sabit (fixed/sticky) bir katman etkileşimli bir elemanın üstünü kapatıyor; kullanıcı ona tıklayamıyor.',
    fix: 'Yüzen widget/banner için güvenli boşluk (padding-bottom) bırakın, mobilde küçültün veya z-index/konumunu düzeltin.',
  },
  'garbage-render': {
    title: 'Bozuk veri gösterimi',
    meaning: 'Ekranda NaN, undefined, [object Object] gibi ham programlama değerleri görünüyor.',
    fix: 'Değerleri göstermeden önce doğrulayın/varsayılan verin (?? 0), sayı dönüşümlerini kontrol edin, state senkronizasyonunu düzeltin.',
  },
  'dead-click': {
    title: 'Tepkisiz (ölü) buton',
    meaning: 'Buton tıklandığında hiçbir şey olmadı: DOM değişmedi, istek gitmedi, sayfa değişmedi.',
    fix: 'Butona bir işlev bağlayın veya devre dışıysa disabled/aria-disabled ile görsel olarak belirtin.',
  },
  'ui-freeze': {
    title: 'Arayüz donması (long task)',
    meaning: 'Ana thread uzun süre bloklandı; bu sırada tıklamalar ve yazma tepkisiz kalır.',
    fix: 'Ağır hesaplamayı parçalara bölün (requestIdleCallback / Web Worker), gereksiz senkron döngüleri kaldırın.',
  },
  'blank-screen': {
    title: 'Beyaz ekran',
    meaning: 'Sayfa yüklendikten sonra ekranda hiçbir içerik yok (render çöktü).',
    fix: 'Render hatalarını error boundary ile yakalayın ve geri dönüş arayüzü gösterin.',
  },
  xss: {
    title: 'XSS: girilen kod çalıştı',
    meaning: 'Kullanıcının yazdığı HTML/JS sayfada çalıştırıldı (innerHTML ile render). Saldırgan oturum çalabilir.',
    fix: 'Kullanıcı girdisini innerHTML yerine textContent ile basın veya sanitize edin (DOMPurify), CSP ekleyin.',
  },
  'page-crash': {
    title: 'Sekme çöktü',
    meaning: 'Tarayıcı sekmesi çöktü (bellek taşması veya sonsuz döngü).',
    fix: 'Bellek sızıntılarını ve sonsuz döngüleri profiler ile inceleyin.',
  },
});

export function normalizePath(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/:hash');
    const hash = u.hash === '#/' || u.hash === '#' ? '' : u.hash.replace(/\/\d+(?=\/|$)/g, '/:id');
    return `${path}${hash}`;
  } catch {
    return String(url);
  }
}

export function normalizeMessage(msg) {
  return String(msg)
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\?\S*/g, '?…')
    .replace(/\d+/g, '#')
    .slice(0, 200);
}

export class IssueStore {
  constructor() {
    this.byFingerprint = new Map();
    this.seq = 0;
  }

  /**
   * Add an issue or bump an existing one.
   * @returns {{ issue: object, isNew: boolean }}
   */
  add(partial) {
    if (!ISSUE_TYPES[partial.type]) throw new Error(`Unknown issue type: ${partial.type}`);
    if (!SEVERITY_ORDER.includes(partial.severity)) throw new Error(`Unknown severity: ${partial.severity}`);
    const existing = this.byFingerprint.get(partial.fingerprint);
    if (existing) {
      const bumped = {
        ...existing,
        occurrences: existing.occurrences + 1,
        lastSeenAt: partial.detectedAt || Date.now(),
        severity: worse(existing.severity, partial.severity),
      };
      this.byFingerprint.set(partial.fingerprint, bumped);
      return { issue: bumped, isNew: false };
    }
    const meta = ISSUE_TYPES[partial.type];
    const issue = {
      id: `RG-${String(++this.seq).padStart(3, '0')}`,
      title: meta.title,
      meaning: meta.meaning,
      fix: meta.fix,
      occurrences: 1,
      detectedAt: Date.now(),
      evidence: [],
      steps: [],
      ...partial,
    };
    issue.lastSeenAt = issue.detectedAt;
    this.byFingerprint.set(partial.fingerprint, issue);
    return { issue, isNew: true };
  }

  update(fingerprint, patch) {
    const current = this.byFingerprint.get(fingerprint);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.byFingerprint.set(fingerprint, next);
    return next;
  }

  list() {
    return [...this.byFingerprint.values()].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.detectedAt - b.detectedAt,
    );
  }

  countsBySeverity() {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of this.byFingerprint.values()) counts[i.severity]++;
    return counts;
  }
}

function worse(a, b) {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/** 100 = survived the ghost untouched. Each distinct issue costs points by severity. */
export function resilienceScore(counts) {
  const penalty = Object.entries(counts).reduce((sum, [sev, n]) => sum + (SEVERITY_PENALTY[sev] || 0) * n, 0);
  return Math.max(0, 100 - penalty);
}

export function scoreGrade(score) {
  if (score >= 90) return { grade: 'A', label: 'Sabırsız kullanıcıya dayanıklı' };
  if (score >= 75) return { grade: 'B', label: 'Küçük pürüzler var' };
  if (score >= 55) return { grade: 'C', label: 'Kullanıcılar sinirlenecek' };
  if (score >= 30) return { grade: 'D', label: 'Ciddi kırılmalar var' };
  return { grade: 'F', label: 'Hayalet her şeyi kırdı' };
}
