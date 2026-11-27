import { chromium } from 'playwright';

/** Launch Chromium with graceful fallbacks so a live demo does not die on a missing download. */
export async function launchBrowser({ headed = false } = {}) {
  const opts = { headless: !headed, args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check', '--disable-features=Translate,TranslateUI', '--hide-crash-restore-bubble', '--no-first-run'] };
  try {
    return await chromium.launch(opts);
  } catch (bundledError) {
    try {
      return await chromium.launch({ ...opts, channel: 'chrome' });
    } catch {
      const first = String(bundledError.message || bundledError).split('\n')[0];
      throw new Error(`Tarayıcı başlatılamadı (${first}). Çözüm: "npx playwright install chromium" çalıştırın veya Google Chrome kurun.`);
    }
  }
}
