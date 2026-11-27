#!/usr/bin/env node
// postinstall: make sure a Chromium is available. Never fails the install.
import { spawnSync } from 'node:child_process';

async function main() {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    await browser.close();
    process.stdout.write('Stampede: Chromium hazır\n');
  } catch {
    process.stdout.write('Stampede: Chromium indiriliyor (tek seferlik)…\n');
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
    if (r.status !== 0) process.stdout.write('Stampede: Chromium indirilemedi. Sonra deneyin: npx playwright install chromium (veya Google Chrome kurun)\n');
  }
}

main();
