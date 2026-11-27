#!/usr/bin/env node
// One command for the demo: starts the buggy demo store + the Stampede dashboard and opens the browser.
import { spawn } from 'node:child_process';
import { startDemo } from '../demo/server.js';
import { startDashboard } from '../src/server/index.js';

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* no GUI available: the URL is printed anyway */
  }
}

async function main() {
  const demo = await startDemo();
  const dash = await startDashboard({ demoUrl: demo.url });
  const out = [
    '',
    '  Stampede hazır',
    '',
    `  Dashboard      ${dash.url}`,
    `  Demo (hatalı)  ${demo.url}`,
    `  Demo (düzgün)  ${demo.url}/?fixed=1`,
    '',
    '  Durdurmak için Ctrl+C',
    '',
  ];
  process.stdout.write(out.join('\n'));
  if (!process.argv.includes('--no-open')) openBrowser(dash.url);
  const shutdown = () => {
    demo.server.close();
    dash.server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`\nHata: ${err.message}\n`);
  process.exit(1);
});
