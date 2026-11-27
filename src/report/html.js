// Self-contained, shareable HTML report (no external assets).
import { SEVERITY_LABEL } from '../engine/issues.js';
import { reproTest } from './repro.js';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtTime = (ms) => new Date(ms).toLocaleString('tr-TR');

function issueCard(issue, report) {
  const shot = issue.screenshot ? `<img class="shot" alt="${esc(issue.id)} ekran görüntüsü" src="data:image/jpeg;base64,${issue.screenshot}">` : '';
  const steps = (issue.steps || []).map((s) => `<li>${esc(s.label)}</li>`).join('') || '<li>Sayfayı açın (sorun yüklenirken oluştu)</li>';
  const evidence = (issue.evidence || []).map(esc).join('\n');
  const code = esc(reproTest(issue, report));
  return `
  <article class="issue sev-${issue.severity}" id="${esc(issue.id)}">
    <header>
      <span class="chip ${issue.severity}">${SEVERITY_LABEL[issue.severity]}</span>
      <h3>${esc(issue.id)} · ${esc(issue.title)}</h3>
      <span class="count">${issue.occurrences}×</span>
    </header>
    <p class="detail">${esc(issue.detail)}</p>
    <div class="grid">
      <div>
        <h4>Ne anlama geliyor?</h4><p>${esc(issue.meaning)}</p>
        <h4>Nasıl düzeltilir?</h4><p class="fix">${esc(issue.fix)}</p>
        <h4>Tekrar üretme adımları</h4><ol>${steps}</ol>
        <p class="meta">Tetik: ${esc(issue.trigger)} · URL: <code>${esc(issue.url)}</code>${issue.viewport ? ` · Ekran: ${issue.viewport.width}×${issue.viewport.height}` : ''}</p>
      </div>
      <div>${shot}</div>
    </div>
    ${evidence ? `<details><summary>Kanıt (ağ / konsol / DOM)</summary><pre>${evidence}</pre></details>` : ''}
    <details><summary>Playwright regresyon testi</summary><button class="copy" data-copy>Kopyala</button><pre class="code">${code}</pre></details>
  </article>`;
}

export function renderHtml(report) {
  const c = report.counts;
  const issues = report.issues.map((i) => issueCard(i, report)).join('\n') || '<p class="empty">🎉 Hayalet hiçbir sorun bulamadı. Uygulamanız sabırsız kullanıcıya dayanıklı!</p>';
  const actions = report.actions
    .slice(-200)
    .map((a) => `<tr><td>#${a.seq}</td><td>${esc(a.kind)}</td><td>${esc(a.label)}</td></tr>`)
    .join('');
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stampede Raporu · ${esc(report.origin)}</title>
<style>
:root{--bg:#0d0a1a;--panel:#161127;--line:#2a2145;--text:#ece9f7;--muted:#a59fc4;--accent:#a78bfa;--crit:#f43f5e;--high:#fb923c;--med:#facc15;--low:#38bdf8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:28px 16px 60px}
h1{margin:0;font-size:28px}h1 span{color:var(--accent)}.sub{color:var(--muted);margin:6px 0 22px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:26px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.card b{display:block;font-size:26px}.card small{color:var(--muted)}
.score b{font-size:40px;color:var(--accent)}
.issue{background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--low);border-radius:14px;padding:16px 18px;margin:0 0 16px}
.issue.sev-critical{border-left-color:var(--crit)}.issue.sev-high{border-left-color:var(--high)}.issue.sev-medium{border-left-color:var(--med)}
.issue header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.issue h3{margin:0;font-size:17px;flex:1}
.chip{padding:2px 10px;border-radius:999px;font-weight:800;font-size:12px;color:#111}.chip.critical{background:var(--crit);color:#fff}.chip.high{background:var(--high)}.chip.medium{background:var(--med)}.chip.low{background:var(--low)}
.count{color:var(--muted);font-weight:700}.detail{font-weight:600}
.grid{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
h4{margin:12px 0 4px;color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:.06em}.fix{color:#bbf7d0}
.shot{width:100%;border-radius:10px;border:1px solid var(--line)}
.meta{color:var(--muted);font-size:13px;word-break:break-all}code{background:#231b3b;padding:1px 5px;border-radius:5px}
details{margin-top:10px}summary{cursor:pointer;color:var(--accent);font-weight:700}
pre{background:#0a0814;border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:12.5px;white-space:pre-wrap;word-break:break-word}
.copy{float:right;margin:6px 0;background:var(--accent);color:#1b1035;border:0;border-radius:8px;padding:5px 12px;font-weight:800;cursor:pointer}
table{width:100%;border-collapse:collapse;font-size:13px}td{border-bottom:1px solid var(--line);padding:5px 6px;vertical-align:top}td:first-child{color:var(--muted);width:56px}
.empty{font-size:18px;padding:30px;text-align:center;background:var(--panel);border-radius:14px}
footer{color:var(--muted);margin-top:30px;font-size:13px}
</style></head><body><div class="wrap">
<h1>👻 Rage<span>Ghost</span> Raporu</h1>
<p class="sub">Hedef <code>${esc(report.target)}</code> · Mod: <b>${esc(report.mode.label)}</b> · Seed: <code>${esc(report.seed)}</code> · ${fmtTime(report.startedAt)} · ${(report.durationMs / 1000).toFixed(0)} sn</p>
<section class="summary">
  <div class="card score"><small>Dayanıklılık skoru</small><b>${report.score}</b><small>${esc(report.grade.grade)} · ${esc(report.grade.label)}</small></div>
  <div class="card"><small>Kritik</small><b style="color:var(--crit)">${c.critical}</b></div>
  <div class="card"><small>Yüksek</small><b style="color:var(--high)">${c.high}</b></div>
  <div class="card"><small>Orta</small><b style="color:var(--med)">${c.medium}</b></div>
  <div class="card"><small>Düşük</small><b style="color:var(--low)">${c.low}</b></div>
  <div class="card"><small>Aksiyon / tık / istek</small><b>${report.stats.actions}</b><small>${report.stats.clicks} tık · ${report.stats.requests} istek · ${report.stats.pagesVisited} sayfa</small></div>
</section>
<h2>Bulunan sorunlar (${report.issues.length})</h2>
${issues}
<details><summary>Hayaletin tüm aksiyonları (${report.actions.length})</summary><table>${actions}</table></details>
<footer>Stampede v${esc(report.version)} · Aynı senaryoyu tekrar oynatmak için seed <code>${esc(report.seed)}</code> kullanın: <code>npx stampede run ${esc(report.target)} --mode ${esc(report.mode.id)} --seed ${esc(report.seed)}</code></footer>
</div>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var pre=b.nextElementSibling;navigator.clipboard.writeText(pre.textContent).then(function(){b.textContent='Kopyalandı ✓';setTimeout(function(){b.textContent='Kopyala'},1500)})})});
</script>
</body></html>`;
}
