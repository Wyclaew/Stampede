// Self-contained, shareable HTML report: one file, fonts and screenshots embedded, no network.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEVERITY_LABEL } from '../engine/issues.js';
import { reproTest } from './repro.js';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_ROOT = join(here, '..', '..', 'node_modules', '@fontsource-variable');

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF';
const LATIN_EXT = 'U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+20A0-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

let fontCss = null;
function embeddedFonts() {
  if (fontCss !== null) return fontCss;
  const face = (family, pkg, file, range, weights) => {
    const p = join(FONT_ROOT, pkg, 'files', file);
    if (!existsSync(p)) return '';
    return `@font-face{font-family:'${family}';font-weight:${weights};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(p).toString('base64')}) format('woff2');unicode-range:${range}}`;
  };
  fontCss = [
    face('Schibsted Grotesk', 'schibsted-grotesk', 'schibsted-grotesk-latin-wght-normal.woff2', LATIN, '400 900'),
    face('Schibsted Grotesk', 'schibsted-grotesk', 'schibsted-grotesk-latin-ext-wght-normal.woff2', LATIN_EXT, '400 900'),
    face('JetBrains Mono', 'jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2', LATIN, '100 800'),
    face('JetBrains Mono', 'jetbrains-mono', 'jetbrains-mono-latin-ext-wght-normal.woff2', LATIN_EXT, '100 800'),
  ].join('');
  return fontCss;
}

const SHAPE = {
  critical: '<path d="M4.5 0 9 4.5 4.5 9 0 4.5z" fill="currentColor"/>',
  high: '<path d="M4.5 .5 9 8.5H0z" fill="currentColor"/>',
  medium: '<circle cx="4.5" cy="4.5" r="4" fill="currentColor"/>',
  low: '<rect x=".75" y=".75" width="7.5" height="7.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};
const sev = (s) => `<span class="sev ${s}"><svg viewBox="0 0 9 9" aria-hidden="true">${SHAPE[s]}</svg>${SEVERITY_LABEL[s]}</span>`;
const fmtTime = (ms) => new Date(ms).toLocaleString('tr-TR');
const scoreColor = (n) => (n >= 75 ? 'var(--ok)' : n >= 45 ? 'var(--warn)' : 'var(--bad)');

function agentChip(report, id) {
  const p = (report.personas || []).find((x) => x.id === id);
  if (!p) return '';
  return `<span class="agent" style="--agent:${esc(p.color)}" title="${esc(p.label)}">${esc(p.code)}</span>`;
}

function film(issue) {
  const frames = issue.film && issue.film.length ? issue.film : issue.screenshot ? [{ label: 'Hata anı', data: issue.screenshot }] : [];
  if (!frames.length) return '';
  return `<figure class="film">${frames
    .map(
      (f) => `<div class="frame"><div class="pic"><img alt="${esc(f.label)}" loading="lazy" src="data:image/jpeg;base64,${f.data}">${
        f.point ? `<span class="tap" style="left:${(f.point.x * 100).toFixed(2)}%;top:${(f.point.y * 100).toFixed(2)}%"></span>` : ''
      }</div><figcaption>${esc(f.label)}</figcaption></div>`,
    )
    .join('')}</figure>`;
}

function issueCard(issue, report) {
  const steps = (issue.steps || []).map((s) => `<li>${esc(s.label)}</li>`).join('') || '<li>Sayfayı açın (sorun yüklenirken oluştu)</li>';
  const evidence = (issue.evidence || []).map(esc).join('\n');
  return `
  <article class="issue" id="${esc(issue.id)}">
    <header>
      ${sev(issue.severity)}
      <h3><span class="id">${esc(issue.id)}</span> ${esc(issue.title)}</h3>
      ${agentChip(report, issue.agent)}
      <span class="times">${issue.occurrences}×</span>
    </header>
    <p class="detail">${esc(issue.detail)}</p>
    ${film(issue)}
    <div class="cols">
      <div>
        <h4>Ne anlama geliyor</h4><p>${esc(issue.meaning)}</p>
        <h4>Nasıl düzeltilir</h4><p>${esc(issue.fix)}</p>
      </div>
      <div>
        <h4>Tekrar üretme adımları${issue.agentLabel ? ` · ${esc(issue.agentLabel)}` : ''}</h4><ol>${steps}</ol>
        <p class="meta">Tetik: ${esc(issue.trigger)}<br><code>${esc(issue.url)}</code>${issue.viewport ? ` · ${issue.viewport.width}×${issue.viewport.height}` : ''}</p>
      </div>
    </div>
    ${evidence ? `<details><summary>Kanıt: ağ, konsol, DOM</summary><pre>${evidence}</pre></details>` : ''}
    <details><summary>Playwright regresyon testi</summary><button class="copy" type="button" data-copy>Kopyala</button><pre class="code">${esc(reproTest(issue, report))}</pre></details>
  </article>`;
}

export function renderHtml(report) {
  const c = report.counts;
  const cats = (report.categories || [])
    .map((k) => `<li><span>${esc(k.label)}</span><span class="track"><span style="width:${Math.max(2, k.score)}%;background:${scoreColor(k.score)}"></span></span><b>${k.score}</b></li>`)
    .join('');
  const personas = (report.personas || [])
    .map((p) => `<tr><td>${agentChip(report, p.id)}</td><td><b>${esc(p.label)}</b><br><small>${esc(p.summary)}</small></td><td class="num">${p.actions}</td><td class="num">${p.issues}</td></tr>`)
    .join('');
  const issues = report.issues.map((i) => issueCard(i, report)).join('\n') || '<p class="clean">Sürü hiçbir sorun bulamadı. Uygulama sabırsız kullanıcılara dayanıklı.</p>';
  const actions = report.actions
    .slice(-250)
    .map((a) => `<tr><td class="num">#${a.seq}</td><td>${agentChip(report, a.agent)}</td><td>${esc(a.label)}</td></tr>`)
    .join('');
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stampede raporu · ${esc(report.origin)}</title>
<style>
${embeddedFonts()}
:root{--paper:oklch(0.985 0.004 85);--card:oklch(1 0 0);--ink:oklch(0.22 0.01 250);--muted:oklch(0.48 0.015 250);--line:oklch(0.9 0.006 250);--soft:oklch(0.955 0.005 250);--ok:oklch(0.58 0.15 155);--warn:oklch(0.7 0.15 75);--bad:oklch(0.56 0.21 25);--crit:oklch(0.53 0.22 25);--high:oklch(0.6 0.17 50);--med:oklch(0.62 0.13 85);--low:oklch(0.5 0.02 250);--sans:'Schibsted Grotesk',ui-sans-serif,system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--paper);color:var(--ink);font:400 16px/1.6 var(--sans)}
.wrap{max-width:1080px;margin:0 auto;padding:48px 24px 80px}
h1{margin:0;font-size:40px;line-height:1.1;letter-spacing:-.025em;font-weight:800;text-wrap:balance}
h2{margin:56px 0 16px;font-size:24px;letter-spacing:-.01em}
h3{margin:0;font-size:19px;line-height:1.3;flex:1;min-width:0}
h4{margin:16px 0 4px;font-size:13px;font-weight:700;color:var(--muted)}
p{margin:0}code,.num,.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.lede{margin-top:12px;color:var(--muted);max-width:70ch}
.lede code{color:var(--ink)}
.summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:32px;margin-top:40px;padding-top:32px;border-top:2px solid var(--ink)}
.score{display:flex;align-items:baseline;gap:14px}.score b{font:700 88px/0.9 var(--mono);letter-spacing:-.04em}
.grade{font-weight:700}.grade small{display:block;color:var(--muted);font-weight:400}
.counts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:20px}
.counts div{padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:8px}
.counts b{display:block;font:700 26px var(--mono)}
.cats{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.cats li{display:grid;grid-template-columns:170px 1fr 40px;gap:12px;align-items:center;font-size:15px}
.cats .track{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}.cats .track span{display:block;height:100%;border-radius:4px}
.cats b{text-align:right;font:700 15px var(--mono)}
.activity{margin-top:14px;color:var(--muted);font-size:14px}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
td small{color:var(--muted);font-size:13px}.num{text-align:right;white-space:nowrap}
.agent{display:inline-grid;place-items:center;min-width:28px;height:20px;padding:0 6px;border-radius:4px;background:var(--agent);color:#0b1015;font:700 12px var(--mono)}
.sev{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;white-space:nowrap}.sev svg{width:10px;height:10px}
.sev.critical{color:var(--crit)}.sev.high{color:var(--high)}.sev.medium{color:var(--med)}.sev.low{color:var(--low)}
.issue{padding:24px 0 28px;border-top:1px solid var(--line)}
.issue header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.issue .id{font:600 15px var(--mono);color:var(--muted)}
.times{font:600 13px var(--mono);color:var(--muted)}
.detail{margin-top:8px;font-weight:600;max-width:75ch}
.film{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:16px 0 4px}
.frame{display:grid;gap:6px}.pic{position:relative;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--soft)}
.pic img{display:block;width:100%;height:auto}
.tap{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid var(--bad);border-radius:50%}
.tap::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--bad)}
figcaption{font:600 12px var(--mono);color:var(--muted)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:32px}
ol{margin:4px 0 0;padding-left:20px}li{margin:2px 0}
.meta{margin-top:10px;color:var(--muted);font-size:13px;word-break:break-all}
details{margin-top:14px}summary{cursor:pointer;font-weight:700;font-size:14px}
pre{margin:8px 0 0;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:auto;font:13px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word}
.copy{float:right;margin-top:6px;padding:5px 12px;border:1px solid var(--ink);border-radius:6px;background:var(--ink);color:var(--paper);font:600 13px var(--sans);cursor:pointer}
.clean{padding:32px;background:var(--card);border:1px solid var(--line);border-radius:8px;font-size:18px}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
@media(max-width:760px){.summary,.cols{grid-template-columns:1fr}.cats li{grid-template-columns:120px 1fr 36px}h1{font-size:30px}.score b{font-size:64px}}
@media print{.copy{display:none}details{display:block}details>summary{list-style:none}}
</style></head><body><div class="wrap">
<h1>Stampede raporu</h1>
<p class="lede"><code>${esc(report.target)}</code> adresine ${(report.personas || []).length} sabırsız kullanıcı aynı anda saldırdı. Mod: <b>${esc(report.mode.label)}</b> · seed <code>${esc(report.seed)}</code> · ${fmtTime(report.startedAt)} · ${(report.durationMs / 1000).toFixed(0)} sn${report.identity ? ` · test kimliği <code>${esc(report.identity.email)}</code>` : ''}</p>

<section class="summary">
  <div>
    <div class="score"><b style="color:${scoreColor(report.score)}">${report.score}</b><span class="grade">${esc(report.grade.grade)}<small>${esc(report.grade.label)}</small></span></div>
    <div class="counts">
      <div>${sev('critical')}<b>${c.critical}</b></div><div>${sev('high')}<b>${c.high}</b></div><div>${sev('medium')}<b>${c.medium}</b></div><div>${sev('low')}<b>${c.low}</b></div>
    </div>
    <p class="activity">${report.stats.actions} hamle · ${report.stats.clicks} tık · ${report.stats.requests} istek · ${report.stats.pagesVisited} sayfa${report.stats.blocked ? ` · ${report.stats.blocked} yazma isteği engellendi` : ''}</p>
  </div>
  <ul class="cats">${cats}</ul>
</section>

${personas ? `<h2>Sürü</h2><table><thead><tr><th></th><th>Ajan</th><th class="num">Hamle</th><th class="num">Sorun</th></tr></thead><tbody>${personas}</tbody></table>` : ''}

<h2>Bulunan sorunlar (${report.issues.length})</h2>
${issues}

<h2>Hamle kaydı</h2>
<details><summary>${report.actions.length} hamlenin tamamını göster</summary><table><tbody>${actions}</tbody></table></details>

<footer>Stampede v${esc(report.version)}. Aynı hamle sırasını tekrar oynatmak için: <code>npx stampede run ${esc(report.target)} --mode ${esc(report.mode.id)} --seed ${esc(report.seed)}${report.personas ? ` --personas ${report.personas.map((p) => esc(p.id)).join(',')}` : ''}</code></footer>
</div>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var pre=b.nextElementSibling;navigator.clipboard.writeText(pre.textContent).then(function(){b.textContent='Kopyalandı';setTimeout(function(){b.textContent='Kopyala'},1500)})})});
</script>
</body></html>`;
}
