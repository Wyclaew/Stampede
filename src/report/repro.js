// Turn the ghost's recorded steps into a runnable Playwright regression test.

const js = (v) => JSON.stringify(v);

function stepCode(step) {
  const loc = step.locator;
  switch (step.kind) {
    case 'rageClick':
      return [
        `  // ${step.label}`,
        `  for (let i = 0; i < ${step.count}; i++) await ${loc}.click({ force: true, timeout: 3000 }).catch(() => {});`,
      ];
    case 'type': {
      const lines = [`  // ${step.label}`, `  await ${loc}.fill(${js(step.value)});`];
      if (step.enterTwice) lines.push(`  await ${loc}.press('Enter');`, `  await ${loc}.press('Enter').catch(() => {});`);
      return lines;
    }
    case 'select':
      return [`  // ${step.label}`, ...step.indexes.map((i) => `  await ${loc}.selectOption({ index: ${i} });`)];
    case 'navigate':
      return [`  // ${step.label}`, `  await ${loc}.click();`];
    case 'backForward':
      return [
        `  // ${step.label}`,
        ...step.sequence.map((d) => `  await page.${d === 'back' ? 'goBack' : 'goForward'}({ waitUntil: 'commit' }).catch(() => {});`),
      ];
    case 'viewport':
      return [`  // ${step.label}`, ...step.sizes.map((s) => `  await page.setViewportSize({ width: ${s.width}, height: ${s.height} });`)];
    case 'scroll':
      return [`  // ${step.label}`, ...step.deltas.map((d) => `  await page.mouse.wheel(0, ${d});`)];
    case 'keys':
      return [`  // ${step.label}`, ...step.keys.map((k) => `  await page.keyboard.press(${js(k)});`)];
    case 'reload':
      return [`  // ${step.label}`, `  await page.reload();`, `  await page.reload();`];
    case 'offline':
      return [`  // ${step.label}`, `  await page.context().setOffline(true);`, `  await page.waitForTimeout(1300);`, `  await page.context().setOffline(false);`];
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
          `  const mutations = [];`,
          `  page.on('request', (r) => { if (r.method() === ${js(issue.request ? issue.request.method : 'POST')} && r.url().includes(${js(url)})) mutations.push(r.url()); });`,
        ],
        assert: [`  await page.waitForTimeout(2500);`, `  // Aynı işlem tek bir istek üretmeli (idempotent)`, `  expect(mutations.length).toBeLessThanOrEqual(1);`],
      };
    }
    case 'js-exception':
      return {
        setup: [`  const errors = [];`, `  page.on('pageerror', (e) => errors.push(e.message));`],
        assert: [`  await page.waitForTimeout(1000);`, `  expect(errors).toEqual([]);`],
      };
    case 'console-error':
      return {
        setup: [`  const consoleErrors = [];`, `  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });`],
        assert: [`  await page.waitForTimeout(1000);`, `  expect(consoleErrors).toEqual([]);`],
      };
    case 'server-error':
    case 'client-error':
      return {
        setup: [`  const badResponses = [];`, `  page.on('response', (r) => { if (r.status() >= ${issue.type === 'server-error' ? 500 : 400}) badResponses.push(\`\${r.status()} \${r.url()}\`); });`],
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
        assert: [
          `  // Yükleniyor göstergesi makul sürede kaybolmalı`,
          `  await expect(page.locator('[aria-busy="true"], .spinner, .loader, .loading, [class*="spinner"]').first()).toBeHidden({ timeout: 8000 });`,
        ],
      };
    case 'xss':
      return {
        setup: [`  let injected = false;`, `  page.on('console', (m) => { if (m.text().includes('RG_XSS_7731')) injected = true; });`],
        assert: [`  await page.waitForTimeout(800);`, `  expect(injected).toBe(false);`],
      };
    case 'ui-freeze':
      return {
        setup: [],
        assert: [
          `  const t0 = Date.now();`,
          `  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));`,
          `  expect(Date.now() - t0).toBeLessThan(500);`,
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
  const body = [
    ...g.setup,
    `  await page.setViewportSize({ width: ${vp.width}, height: ${vp.height} });`,
    `  await page.goto(${js(startUrl)});`,
    ...steps.flatMap(stepCode),
    ...g.assert,
  ];
  const name = `${issue.id} ${issue.title}`.replace(/'/g, '’');
  return [`test('${name}', async ({ page }) => {`, ...body, `});`].join('\n');
}

export function reproSpec(report) {
  const header = [
    `// RageGhost tarafından üretildi — ${new Date(report.finishedAt).toISOString()}`,
    `// Hedef: ${report.target} · Mod: ${report.mode.label} · Seed: ${report.seed}`,
    `// Çalıştırmak için: npm i -D @playwright/test && npx playwright test rageghost.spec.js`,
    `import { test, expect } from '@playwright/test';`,
    ``,
  ];
  return header.concat(report.issues.map((i) => reproTest(i, report)).join('\n\n')).join('\n') + '\n';
}
