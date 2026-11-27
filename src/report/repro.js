// Turn an agent's recorded steps into a runnable Playwright regression test (TypeScript).

const js = (v) => JSON.stringify(v);

function stepCode(step) {
  const loc = step.locator;
  const c = `  // ${step.label}`;
  switch (step.kind) {
    case 'rageClick': {
      const lines = [c];
      if (step.squeezeTo) lines.push(`  await page.setViewportSize({ width: ${step.squeezeTo[0].width}, height: ${step.squeezeTo[0].height} });`);
      lines.push(`  for (let i = 0; i < ${step.count}; i++) await ${loc}.click({ force: true, timeout: 3000 }).catch(() => {});`);
      return lines;
    }
    case 'keyActivate':
      return [c, `  await ${loc}.focus();`, `  for (let i = 0; i < ${step.count}; i++) await page.keyboard.press(${js(step.key)});`];
    case 'type': {
      const lines = [c, `  await ${loc}.fill(${js(step.value)});`];
      if (step.enterTwice) lines.push(`  await ${loc}.press('Enter');`, `  await ${loc}.press('Enter').catch(() => {});`);
      return lines;
    }
    case 'select':
      return [c, ...step.indexes.map((i) => `  await ${loc}.selectOption({ index: ${i} });`)];
    case 'navigate':
      return [c, `  await ${loc}.click();`];
    case 'backForward':
      return [c, ...step.sequence.map((d) => `  await page.${d === 'back' ? 'goBack' : 'goForward'}({ waitUntil: 'commit' }).catch(() => {});`)];
    case 'viewport':
      return [c, ...step.sizes.map((s) => `  await page.setViewportSize({ width: ${s.width}, height: ${s.height} });`)];
    case 'scroll':
      return [c, ...step.deltas.map((d) => `  await page.mouse.wheel(0, ${d});`)];
    case 'keys':
    case 'escapeSpam':
      return [c, ...step.keys.map((k) => `  await page.keyboard.press(${js(k)});`)];
    case 'tabWalk':
      return [c, `  for (let i = 0; i < ${step.presses}; i++) await page.keyboard.press('Tab');`];
    case 'reload':
      return [c, `  await page.reload();`, `  await page.reload();`];
    case 'offline':
      return [c, `  await page.context().setOffline(true);`, `  await page.waitForTimeout(1300);`, `  await page.context().setOffline(false);`];
    case 'offlineBurst':
      return [
        c,
        `  await ${loc}.click();`,
        `  await page.context().setOffline(true);`,
        `  for (let i = 0; i < 3; i++) await ${loc}.click({ force: true }).catch(() => {});`,
        `  await page.waitForTimeout(1500);`,
        `  await page.context().setOffline(false);`,
        `  await ${loc}.click({ force: true }).catch(() => {});`,
      ];
    case 'sleepWake':
      return [
        c,
        `  const cdp = await page.context().newCDPSession(page);`,
        `  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });`,
        `  await page.waitForTimeout(2500);`,
        `  await cdp.send('Page.setWebLifecycleState', { state: 'active' });`,
      ];
    case 'slowNet':
      return [
        c,
        `  const net = await page.context().newCDPSession(page);`,
        `  await net.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 51200, uploadThroughput: 20480 });`,
        `  await page.reload({ waitUntil: 'commit' });`,
        `  await page.reload({ waitUntil: 'commit' });`,
        `  await page.waitForTimeout(3500);`,
      ];
    case 'idTamper':
      return [c, `  await page.goto(${js(step.to)});`];
    case 'hiddenTamper':
      return [
        c,
        `  await page.evaluate((changes) => {`,
        `    const fields = [...document.querySelectorAll('form input[type=hidden]')] as HTMLInputElement[];`,
        `    changes.forEach((ch: { to: string }, i: number) => { if (fields[i]) fields[i].value = ch.to; });`,
        `    ${step.submitted ? "fields[0]?.form?.requestSubmit();" : '// (güvenli modda gönderilmedi)'}`,
        `  }, ${js(step.changes.map((x) => ({ to: x.to })))});`,
      ];
    case 'storageCorrupt':
      return [
        c,
        `  await page.evaluate(() => { for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) s.setItem(s.key(i)!, '{'); });`,
        `  await page.reload();`,
      ];
    case 'storageFlood':
      return [
        c,
        `  await page.evaluate(() => { try { for (let n = 0; n < 60; n++) localStorage.setItem('flood' + n, 'x'.repeat(262144)); } catch {} });`,
        `  await page.reload();`,
      ];
    case 'login': {
      const lines = [c];
      if (step.idLocator) lines.push(`  await page.locator('input[type=email], input[name*=mail i], input[name*=user i]').first().fill(${js(step.email)});`);
      lines.push(`  await page.locator('input[type=password]').first().fill(process.env.STAMPEDE_PASSWORD ?? 'test-password');`);
      if (step.submitCount) {
        const btn = step.submitText ? `page.getByRole('button', { name: ${js(step.submitText)} }).first()` : `page.locator('[type=submit]').first()`;
        lines.push(`  for (let i = 0; i < ${step.submitCount}; i++) await ${btn}.click({ force: true }).catch(() => {});`);
      }
      return lines;
    }
    case 'abandonForm':
      return [
        c,
        `  await ${loc}.fill(${js(step.value)});`,
        step.linkLocator ? `  await ${step.linkLocator}.click();` : '',
        `  await page.goBack();`,
        `  await expect(${loc}).toHaveValue(${js(step.value)});`,
      ].filter(Boolean);
    case 'crawl':
      return [c, ...(step.urls || []).map((u) => `  await page.goto(${js(u)}, { waitUntil: 'commit' }).catch(() => {});`)];
    case 'twinTab':
      return [
        c,
        `  const tab2 = await page.context().newPage();`,
        `  await tab2.goto(${js(step.urlBefore)});`,
        step.twinLocator ? `  for (let i = 0; i < 2; i++) await ${step.twinLocator.replace(/^page\./, 'tab2.')}.click({ force: true }).catch(() => {});` : '  // (ikinci sekmede buton bulunamadı)',
        `  await tab2.waitForTimeout(1200);`,
        `  await tab2.close();`,
        loc ? `  await ${loc}.click({ force: true }).catch(() => {});` : '',
      ].filter(Boolean);
    default:
      return [`  // ${step.label || step.kind}`];
  }
}

/** Collectors installed before navigation + assertion at the end, per issue type. */
function guards(issue) {
  switch (issue.type) {
    case 'double-submit': {
      const url = issue.request ? new URL(issue.request.url).pathname : '/';
      return {
        setup: [
          `  const mutations: string[] = [];`,
          `  page.on('request', (r) => { if (r.method() === ${js(issue.request ? issue.request.method : 'POST')} && r.url().includes(${js(url)})) mutations.push(r.url()); });`,
        ],
        assert: [`  await page.waitForTimeout(2500);`, `  // Aynı işlem tek bir istek üretmeli (idempotent)`, `  expect(mutations.length).toBeLessThanOrEqual(1);`],
      };
    }
    case 'js-exception':
    case 'fragile-api':
      return {
        setup: [`  const errors: string[] = [];`, `  page.on('pageerror', (e) => errors.push(e.message));`],
        assert: [`  await page.waitForTimeout(1000);`, `  expect(errors).toEqual([]);`],
      };
    case 'console-error':
      return {
        setup: [`  const consoleErrors: string[] = [];`, `  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });`],
        assert: [`  await page.waitForTimeout(1000);`, `  expect(consoleErrors).toEqual([]);`],
      };
    case 'data-leak':
      return {
        setup: [`  const leaks: string[] = [];`, `  page.on('console', (m) => { if (/password|şifre|token|secret/i.test(m.text())) leaks.push(m.text()); });`],
        assert: [`  await page.waitForTimeout(1000);`, `  expect(leaks).toEqual([]);`],
      };
    case 'server-error':
    case 'client-error':
      return {
        setup: [`  const badResponses: string[] = [];`, `  page.on('response', (r) => { if (r.status() >= ${issue.type === 'server-error' ? 500 : 400}) badResponses.push(\`\${r.status()} \${r.url()}\`); });`],
        assert: [`  await page.waitForTimeout(1500);`, `  expect(badResponses).toEqual([]);`],
      };
    case 'layout-overflow':
      return {
        setup: [],
        assert: [`  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);`, `  expect(overflow).toBeLessThanOrEqual(1);`],
      };
    case 'garbage-render':
      return { setup: [], assert: [`  await expect(page.locator('body')).not.toContainText(${js(issue.token || 'NaN')});`] };
    case 'stuck-spinner':
      return {
        setup: [],
        assert: [`  // Yükleniyor göstergesi makul sürede kaybolmalı`, `  await expect(page.locator('[aria-busy="true"], .spinner, .loader, .loading, [class*="spinner"]').first()).toBeHidden({ timeout: 8000 });`],
      };
    case 'xss':
      return {
        setup: [`  let injected = false;`, `  page.on('console', (m) => { if (m.text().includes('RG_XSS_7731')) injected = true; });`],
        assert: [`  await page.waitForTimeout(800);`, `  expect(injected).toBe(false);`],
      };
    case 'ui-freeze':
      return {
        setup: [],
        assert: [`  const t0 = Date.now();`, `  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));`, `  expect(Date.now() - t0).toBeLessThan(500);`],
      };
    case 'focus-invisible':
      return {
        setup: [],
        assert: [
          `  const ring = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (!el) return true; const cs = getComputedStyle(el); return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; });`,
          `  expect(ring).toBe(true);`,
        ],
      };
    default:
      return { setup: [], assert: [`  // TODO: ${issue.title} için beklenen davranışı doğrulayın`] };
  }
}

export function reproTest(issue, report) {
  const steps = issue.steps || [];
  const first = steps[0];
  const startUrl = first ? first.urlBefore : issue.url || report.target;
  const vp = (first && first.viewport) || issue.viewport || { width: 1280, height: 800 };
  const g = guards(issue);
  const body = [...g.setup, `  await page.setViewportSize({ width: ${vp.width}, height: ${vp.height} });`, `  await page.goto(${js(startUrl)});`, ...steps.flatMap(stepCode), ...g.assert];
  const who = issue.agentLabel ? ` [${issue.agentCode} ${issue.agentLabel}]` : '';
  const name = `${issue.id} ${issue.title}${who}`.replace(/'/g, '’');
  return [`test('${name}', async ({ page }) => {`, ...body, `});`].join('\n');
}

export function reproSpec(report) {
  const header = [
    `// Stampede tarafından üretildi — ${new Date(report.finishedAt).toISOString()}`,
    `// Hedef: ${report.target} · Mod: ${report.mode.label} · Seed: ${report.seed}`,
    `// Çalıştırmak için: npm i -D @playwright/test && npx playwright test stampede.spec.ts`,
    `import { test, expect } from '@playwright/test';`,
    ``,
  ];
  return header.concat(report.issues.map((i) => reproTest(i, report)).join('\n\n')).join('\n') + '\n';
}
