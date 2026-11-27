import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderHtml } from './html.js';
import { reproSpec } from './repro.js';
import { SEVERITY_LABEL } from '../engine/issues.js';

export function renderMarkdown(report) {
  const lines = [
    `# Stampede raporu`,
    ``,
    `- **Hedef:** ${report.target}`,
    `- **Mod:** ${report.mode.label} · **Seed:** ${report.seed} · **Süre:** ${(report.durationMs / 1000).toFixed(0)} sn`,
    `- **Dayanıklılık skoru:** ${report.score}/100 (${report.grade.grade} — ${report.grade.label})`,
    `- **Sorunlar:** ${report.counts.critical} kritik, ${report.counts.high} yüksek, ${report.counts.medium} orta, ${report.counts.low} düşük`,
    `- **Aktivite:** ${report.stats.actions} aksiyon, ${report.stats.clicks} tık, ${report.stats.requests} istek, ${report.stats.pagesVisited} sayfa`,
    ``,
  ];
  for (const i of report.issues) {
    lines.push(`## [${SEVERITY_LABEL[i.severity]}] ${i.id} · ${i.title} (${i.occurrences}×)`, '', i.detail, '');
    lines.push(`**Düzeltme önerisi:** ${i.fix}`, '');
    if (i.steps && i.steps.length) {
      lines.push('**Tekrar üretme adımları:**', '');
      i.steps.forEach((s, n) => lines.push(`${n + 1}. ${s.label}`));
      lines.push('');
    }
    if (i.evidence && i.evidence.length) lines.push('```', ...i.evidence, '```', '');
  }
  if (!report.issues.length) lines.push('🎉 Sorun bulunamadı.');
  return lines.join('\n') + '\n';
}

export function reportDirName(report) {
  const host = new URL(report.target).host.replace(/[^a-z0-9.-]/gi, '_');
  const stamp = new Date(report.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${stamp}_${host}_${report.mode.id}`;
}

/** Write report.html, report.json, report.md and stampede.spec.ts. */
export async function writeReport(report, baseDir) {
  const name = reportDirName(report);
  const dir = join(baseDir, name);
  await mkdir(dir, { recursive: true });
  const files = {
    html: join(dir, 'report.html'),
    json: join(dir, 'report.json'),
    md: join(dir, 'report.md'),
    spec: join(dir, 'stampede.spec.ts'),
  };
  await Promise.all([
    writeFile(files.html, renderHtml(report)),
    writeFile(files.json, JSON.stringify(report, null, 2)),
    writeFile(files.md, renderMarkdown(report)),
    writeFile(files.spec, reproSpec(report)),
  ]);
  return { dir, name, files };
}
