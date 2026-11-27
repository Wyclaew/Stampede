// Optional Gemini layer. Everything works without it; with GEMINI_API_KEY set it adds:
//  1) an attack planner (one call per run), 2) a root-cause summary, 3) a visual review of screenshots.
// The key is read from the environment only and never logged or written to reports.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TIMEOUT_MS = 25000;
// configured model name -> model actually used (after a 404 fallback)
const resolvedModels = new Map();

export function aiEnabled(env = process.env) {
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim());
}

const key = () => (process.env.GEMINI_API_KEY || '').trim();

async function request(path, init = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key(), ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

/** If the configured model is unknown, pick the newest available "flash" model that can generate content. */
async function discoverModel() {
  const res = await request('/models?pageSize=200', { method: 'GET' }, 10000);
  if (!res.ok) return null;
  const data = await res.json();
  const usable = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/.test(m.name) && !/(image|tts|audio|live|embedding|thinking-exp)/.test(m.name));
  usable.sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
  return usable.length ? usable[0].name.replace(/^models\//, '') : null;
}

function extractJson(text) {
  const clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(clean);
}

/** One generateContent call that must return JSON. Throws a key-free error message on failure. */
export async function generateJson(parts, { schema, temperature = 0.4, maxOutputTokens = 2048 } = {}) {
  if (!aiEnabled()) throw new Error('GEMINI_API_KEY tanımlı değil');
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}), temperature, maxOutputTokens },
  });
  const configured = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let model = resolvedModels.get(configured) || configured;
  let res = await request(`/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body });
  if (res.status === 404) {
    const found = await discoverModel();
    if (found && found !== model) {
      model = found;
      res = await request(`/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body });
    }
  }
  if (!res.ok) {
    let reason = '';
    try {
      reason = ((await res.json()).error || {}).status || '';
    } catch {
      reason = '';
    }
    throw new Error(`Gemini isteği başarısız (HTTP ${res.status}${reason ? ` ${reason}` : ''})`);
  }
  resolvedModels.set(configured, model);
  const data = await res.json();
  const text = ((data.candidates || [])[0] || {}).content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini boş yanıt döndü');
  return { model, json: extractJson(text) };
}

const S = { type: 'STRING' };
const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: S,
    steps: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { persona: S, kind: S, target: S, reason: S }, required: ['persona', 'kind', 'reason'] },
    },
  },
  required: ['summary', 'steps'],
};

/**
 * Attack planner: one call with a compact description of the first page.
 * @returns {Promise<{summary:string, steps:Array<{persona,kind,target,reason}>, model:string}>}
 */
export async function planAttack({ page, personas }) {
  const prompt = [
    'Sen bir web uygulaması kaos test planlayıcısısın. Aşağıda bir sayfanın sadeleştirilmiş yapısı ve test eden ajan tipleri var.',
    'Gerçek kullanıcıların sabırsızlığıyla en çok hata çıkaracak 6-10 adımlık bir saldırı planı üret.',
    'Kurallar: sadece verilen persona kimliklerini ve o personanın izinli hamlelerini (kind) kullan. target, sayfadaki bir elemanın görünen metninden kısa bir parça olsun (boş bırakılabilir).',
    'Silme, çıkış, üçüncü taraf girişi (Google vb.) asla hedefleme. Gerekçeleri Türkçe ve tek cümle yaz. summary: sayfanın ne olduğu ve neden bu sıranın riskli olduğu, en fazla 2 cümle.',
    '',
    `PERSONALAR: ${JSON.stringify(personas)}`,
    `SAYFA: ${JSON.stringify(page)}`,
  ].join('\n');
  const { model, json } = await generateJson([{ text: prompt }], { schema: PLAN_SCHEMA, temperature: 0.5 });
  const allowed = Object.fromEntries(personas.map((p) => [p.id, new Set(p.moves)]));
  const steps = (Array.isArray(json.steps) ? json.steps : [])
    .filter((s) => s && allowed[s.persona] && allowed[s.persona].has(s.kind))
    .slice(0, 12)
    .map((s) => ({ persona: s.persona, kind: s.kind, target: String(s.target || '').slice(0, 60), reason: String(s.reason || '').slice(0, 200) }));
  return { model, summary: String(json.summary || '').slice(0, 400), steps };
}

const SUMMARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: S,
    rootCauses: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: S, detail: S, issues: { type: 'ARRAY', items: S } }, required: ['title', 'detail'] } },
    fixes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { priority: { type: 'INTEGER' }, title: S, detail: S }, required: ['priority', 'title', 'detail'] } },
  },
  required: ['headline', 'rootCauses', 'fixes'],
};

/** Root-cause summary across all findings. */
export async function summarizeIssues({ target, issues }) {
  const compact = issues.slice(0, 40).map((i) => ({ id: i.id, sev: i.severity, type: i.type, title: i.title, detail: String(i.detail).slice(0, 220), evidence: (i.evidence || []).slice(0, 3).map((e) => String(e).slice(0, 160)) }));
  const prompt = [
    `Sen kıdemli bir web geliştiricisisin. ${target} adresinde otomatik bir "sabırsız kullanıcı" testi şu bulguları üretti.`,
    'Görevin: bulguları ortak kök nedenlere grupla (en fazla 5), ve geliştiricinin bu hafta yapması gereken öncelikli düzeltme listesini çıkar (en fazla 6, priority 1 en acil).',
    'Türkçe, somut ve kısa yaz; dosya/kod uydurma, bulgularda olmayan şeyi iddia etme. headline: tek cümlelik genel durum.',
    '',
    `BULGULAR: ${JSON.stringify(compact)}`,
  ].join('\n');
  const { model, json } = await generateJson([{ text: prompt }], { schema: SUMMARY_SCHEMA, temperature: 0.3 });
  return {
    model,
    headline: String(json.headline || '').slice(0, 300),
    rootCauses: (json.rootCauses || []).slice(0, 5).map((r) => ({ title: String(r.title).slice(0, 120), detail: String(r.detail).slice(0, 500), issues: (r.issues || []).slice(0, 10).map(String) })),
    fixes: (json.fixes || []).slice(0, 6).map((f) => ({ priority: Number(f.priority) || 9, title: String(f.title).slice(0, 120), detail: String(f.detail).slice(0, 500) })).sort((a, b) => a.priority - b.priority),
  };
}

const VISUAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    findings: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: S, detail: S, severity: S }, required: ['title', 'detail', 'severity'] } },
  },
  required: ['findings'],
};

/** Visual review of one screenshot: overlapping text, clipped buttons, unreadable contrast, broken layout. */
export async function reviewScreenshot({ jpegBase64, url, viewport }) {
  const prompt = [
    `Bu, ${url} sayfasının ${viewport ? `${viewport.width}×${viewport.height}` : ''} ekran görüntüsü. Bir UI kalite uzmanı gibi bak.`,
    'Sadece gözle görülen, gerçek kullanıcıyı etkileyen görsel kusurları listele: üst üste binen metin, kesilmiş buton/metin, okunmayan kontrast, ekrandan taşan eleman, bozuk hizalama, boş/kırık görsel.',
    'Test aracının çizdiği renkli çerçeveleri, imleçleri ve etiketleri (A1, ×3, yüzde etiketleri gibi) YOK SAY; onlar sayfanın parçası değil.',
    'Emin olmadığın şeyi yazma. Kusur yoksa boş liste döndür. En fazla 3 bulgu. severity: low veya medium. Türkçe yaz.',
  ].join('\n');
  const { model, json } = await generateJson([{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }], { schema: VISUAL_SCHEMA, temperature: 0.2, maxOutputTokens: 1024 });
  const findings = (json.findings || []).slice(0, 3).map((f) => ({
    title: String(f.title || '').slice(0, 100),
    detail: String(f.detail || '').slice(0, 300),
    severity: f.severity === 'medium' ? 'medium' : 'low',
  }));
  return { model, findings: findings.filter((f) => f.title && f.detail) };
}
