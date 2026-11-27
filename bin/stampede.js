#!/usr/bin/env node
// Stampede CLI — headless runs for terminals and CI.
//   stampede run <url> [--mode safe|chaos|stress] [--duration 60] [--seed N] [--headed] [--yes-live] [--out dir] [--fail-on high]
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StampedeSession } from '../src/engine/session.js';
import { SEVERITY_ORDER, SEVERITY_LABEL } from '../src/engine/issues.js';
import { writeReport } from '../src/report/index.js';
import { REPORTS_DIR } from '../src/server/index.js';
import { DEFAULT_SWARM, PERSONA_ORDER } from '../src/engine/personas.js';
import { loadEnv } from '../src/util/env.js';

const C = { red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[36m', magenta: '\x1b[35m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m', orange: '\x1b[38;5;208m' };
// Page-controlled text must not inject terminal escape sequences.
const safeText = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
const SEV_COLOR = { critical: C.red, high: C.orange, medium: C.yellow, low: C.blue };

const HELP = `
Stampede: sabırsız kullanıcı sürüsü

Kullanım:
  stampede run <url> [seçenekler]

Seçenekler:
  --mode <safe|chaos|stress>  Varsayılan: safe (canlı siteler için güvenli)
  --personas <liste|all|every> Virgülle, tekrar serbest: rage,rage,snoop. Türler: rage, keyboard, mobile,
                              snoop, abandoner, slow, bot (varsayılan: rage). all = ilk dört, every = yedisi
  --email / --password        Giriş/kayıt formları için test kimliği (yoksa otomatik üretilir)
  --no-ai                     .env'de GEMINI_API_KEY olsa bile AI planlayıcı/incelemeyi kapat
  --duration <sn>             Çalışma süresi, varsayılan 60
  --seed <sayı>               Aynı senaryoyu tekrar oynatmak için
  --headed                    Tarayıcı penceresini göster
  --yes-live                  Canlı sitede chaos/stress modunu onayla (sitenin sahibi olmalısınız)
  --out <klasör>              Rapor klasörü (varsayılan ./reports)
  --fail-on <seviye>          Bu seviyede sorun bulunursa çıkış kodu 1 (CI için): critical|high|medium|low

Örnekler:
  stampede run http://localhost:7500 --mode chaos --duration 30
  stampede run https://biyom.co --mode safe --duration 90
`;

export function parseArgs(argv) {
  const [command, url, ...rest] = argv;
  const opts = { command, url, mode: 'safe', durationSec: 60, headed: false, confirmLive: false, out: REPORTS_DIR, failOn: null, seed: undefined };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`${a} bir değer bekliyor`);
      return v;
    };
    if (a === '--mode') opts.mode = next();
    else if (a === '--personas') {
      const v = next();
      opts.personas = v === 'all' ? [...DEFAULT_SWARM] : v === 'every' ? [...PERSONA_ORDER] : v.split(',').map((x) => x.trim()).filter(Boolean);
    } else if (a === '--email') opts.email = next();
    else if (a === '--password') opts.password = next();
    else if (a === '--no-ai') opts.ai = false;
    else if (a === '--duration') opts.durationSec = Number(next());
    else if (a === '--seed') opts.seed = Number(next());
    else if (a === '--headed') opts.headed = true;
    else if (a === '--yes-live') opts.confirmLive = true;
    else if (a === '--out') opts.out = resolve(next());
    else if (a === '--fail-on') opts.failOn = next();
    else throw new Error(`Bilinmeyen seçenek: ${a}`);
  }
  if (opts.failOn && !SEVERITY_ORDER.includes(opts.failOn)) throw new Error(`--fail-on şunlardan biri olmalı: ${SEVERITY_ORDER.join(', ')}`);
  return opts;
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h' || argv[0] !== 'run' || !argv[1]) {
    process.stdout.write(HELP);
    process.exit(argv.length && argv[0] !== '--help' && argv[0] !== '-h' ? 2 : 0);
  }
  const opts = parseArgs(argv);
  const credentials = opts.email || opts.password ? { email: opts.email, password: opts.password } : undefined;
  const session = new StampedeSession({ url: opts.url, mode: opts.mode, durationSec: opts.durationSec, seed: opts.seed, headed: opts.headed, confirmLive: opts.confirmLive, personas: opts.personas, credentials, ai: opts.ai !== false });
  const agents = session.roster.map((r) => `${r.code} ${r.label}`).join(', ');
  process.stdout.write(`\n${C.bold}Stampede${C.reset} → ${opts.url}  ${C.dim}(${session.mode.label}, ${session.config.durationSec} sn, seed ${session.config.seed})${C.reset}\n${C.dim}Ajanlar: ${agents}${C.reset}\n\n`);
  process.on('SIGINT', () => session.stop());
  session.on('issue', ({ issue, isNew }) => {
    if (!isNew) return;
    const col = SEV_COLOR[issue.severity];
    process.stdout.write(`  ${col}■ ${SEVERITY_LABEL[issue.severity].padEnd(6)}${C.reset} ${C.dim}${issue.agentCode || ''}${C.reset} ${C.bold}${issue.title}${C.reset} ${C.dim}— ${safeText(issue.detail).slice(0, 110)}${C.reset}\n`);
  });
  session.on('action', (a) => {
    if (a.phase === 'done' && a.seq % 10 === 0) process.stdout.write(`  ${C.dim}… ${a.seq} aksiyon${C.reset}\n`);
  });
  const report = await session.run();
  const written = await writeReport(report, opts.out);
  const c = report.counts;
  process.stdout.write(
    `\n${C.bold}Skor ${report.score}/100 (${report.grade.grade})${C.reset}  ${C.red}${c.critical} kritik${C.reset} · ${C.orange}${c.high} yüksek${C.reset} · ${C.yellow}${c.medium} orta${C.reset} · ${C.blue}${c.low} düşük${C.reset}\n` +
      `${report.stats.actions} aksiyon, ${report.stats.clicks} tık, ${report.stats.requests} istek\n\n` +
      `Rapor:   ${written.files.html}\nTestler: ${written.files.spec}\n\n`,
  );
  if (opts.failOn) {
    const limit = SEVERITY_ORDER.indexOf(opts.failOn);
    const failing = report.issues.filter((i) => SEVERITY_ORDER.indexOf(i.severity) <= limit);
    if (failing.length) process.exit(1);
  }
  process.exit(0);
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`\nHata: ${err.message}\n`);
    process.exit(2);
  });
}
