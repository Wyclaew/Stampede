// The impatient human's repertoire. Each action drives the real mouse/keyboard so the
// injected ghost overlay follows it, then returns a step record used for repro scripts.
import { findClickablePoint, ghostSay, readCounters } from './inject/probes.js';
import { pickChaosInput, describeInput } from './inputs.js';
import { humanName, playwrightLocator } from './locator.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (p) => p.catch(() => null);

const VIEWPORTS = [
  { width: 375, height: 667, name: 'iPhone SE' },
  { width: 1280, height: 800, name: 'Laptop' },
  { width: 320, height: 568, name: 'Küçük telefon' },
  { width: 768, height: 1024, name: 'Tablet' },
  { width: 414, height: 896, name: 'iPhone Plus' },
  { width: 1440, height: 900, name: 'Masaüstü' },
  { width: 360, height: 740, name: 'Android' },
];

async function say(page, text, kind) {
  await quiet(page.evaluate(ghostSay, { text, kind }));
}

async function glideTo(ctx, x, y) {
  await ctx.page.mouse.move(x, y, { steps: ctx.rng.int(6, 12) });
}

async function pointFor(ctx, el) {
  const pt = await quiet(ctx.page.evaluate(findClickablePoint, el.id));
  if (!pt) return null;
  return pt;
}

function baseStep(ctx, kind, el) {
  return {
    kind,
    urlBefore: ctx.page.url(),
    viewport: ctx.page.viewportSize(),
    target: el ? humanName(el) : null,
    locator: el ? playwrightLocator(el) : null,
    elId: el ? el.id : null,
  };
}

export async function rageClick(ctx, cand) {
  const { page, rng, mode } = ctx;
  const el = cand.el;
  const pt = await pointFor(ctx, el);
  if (!pt) return null;
  const count = cand.cls && cand.cls.category === 'toggle' ? 3 : rng.int(mode.burst[0], mode.burst[1]);
  await glideTo(ctx, pt.x, pt.y);
  const label = count === 2 ? 'ÇİFT TIK!' : count === 3 ? 'ÜÇLÜ TIK!' : `ÖFKE TIKI ×${count}`;
  await say(page, `${label} ${el.text ? `“${el.text.slice(0, 24)}”` : ''}`);
  const before = await quiet(page.evaluate(readCounters));
  const reqBefore = ctx.counters.requests;
  for (let i = 0; i < count; i++) {
    await quiet(page.mouse.click(pt.x, pt.y));
    ctx.counters.clicks++;
    await sleep(rng.int(25, 85));
  }
  await sleep(650);
  const after = await quiet(page.evaluate(readCounters));
  const step = { ...baseStep(ctx, 'rageClick', el), count, label: `${humanName(el)} ${count} kez hızlıca tıkla` };
  const reacted =
    !before ||
    !after ||
    after.mutations !== before.mutations ||
    after.url !== before.url ||
    after.scroll !== before.scroll ||
    ctx.counters.requests !== reqBefore;
  const isButtonish = el.tag === 'button' || el.role === 'button' || (el.tag === 'input' && ['button', 'submit'].includes(el.type));
  if (!reacted && isButtonish && !pt.blocked) step.dead = true;
  return step;
}

export async function chaosType(ctx, cand) {
  const { page, rng, mode } = ctx;
  const el = cand.el;
  const pt = await pointFor(ctx, el);
  if (!pt) return null;
  await glideTo(ctx, pt.x, pt.y);
  await quiet(page.mouse.click(pt.x, pt.y));
  const value = pickChaosInput(el, rng);
  await say(page, `⌨ ${describeInput(value).slice(0, 30)}`);
  await quiet(
    page.evaluate((id) => {
      const n = document.querySelector(`[data-rg-id="${id}"]`);
      if (n && typeof n.select === 'function') n.select();
    }, el.id),
  );
  await quiet(page.keyboard.press('Backspace'));
  if (value) await quiet(page.keyboard.type(value, { delay: mode.typeDelayMs }));
  ctx.counters.keystrokes += value.length + 1;
  const step = { ...baseStep(ctx, 'type', el), value, label: `${humanName(el)} içine ${describeInput(value)} yaz` };
  if (mode.allowMutations && rng.chance(0.5)) {
    await quiet(page.keyboard.press('Enter'));
    await sleep(rng.int(30, 90));
    await quiet(page.keyboard.press('Enter'));
    step.enterTwice = true;
    step.label += ' ve iki kez Enter’a bas';
  } else {
    await quiet(page.keyboard.press('Tab'));
  }
  await sleep(400);
  return step;
}

export async function pickOption(ctx, cand) {
  const { page, rng } = ctx;
  const el = cand.el;
  const pt = await pointFor(ctx, el);
  if (!pt) return null;
  await glideTo(ctx, pt.x, pt.y);
  await say(page, '🔀 SEÇENEK KARIŞTIR');
  const indexes = [];
  const loc = page.locator(`[data-rg-id="${el.id}"]`);
  for (let i = 0; i < 3; i++) {
    const index = rng.int(0, Math.max(0, el.optionCount - 1));
    indexes.push(index);
    await quiet(loc.selectOption({ index }, { timeout: 1500 }));
    await sleep(rng.int(40, 120));
  }
  await sleep(400);
  return { ...baseStep(ctx, 'select', el), indexes, label: `${humanName(el)} içinde 3 kez hızlıca seçim değiştir` };
}

export async function navigate(ctx, cand) {
  const { page } = ctx;
  const el = cand.el;
  const pt = await pointFor(ctx, el);
  if (!pt) return null;
  await glideTo(ctx, pt.x, pt.y);
  await say(page, `🔗 ${el.text ? el.text.slice(0, 26) : 'link'}`);
  const step = { ...baseStep(ctx, 'navigate', el), label: `${humanName(el)} tıkla` };
  await quiet(page.mouse.click(pt.x, pt.y));
  ctx.counters.clicks++;
  await quiet(page.waitForLoadState('domcontentloaded', { timeout: 4000 }));
  await sleep(350);
  return step;
}

export async function backForward(ctx) {
  const { page, rng } = ctx;
  const n = rng.int(3, 6);
  const sequence = [];
  await say(page, `⏪⏩ GERİ/İLERİ ×${n}`);
  const step = { ...baseStep(ctx, 'backForward', null) };
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 'back' : 'forward';
    sequence.push(dir);
    const nav = dir === 'back' ? page.goBack({ waitUntil: 'commit', timeout: 1500 }) : page.goForward({ waitUntil: 'commit', timeout: 1500 });
    await quiet(Promise.race([nav, sleep(rng.int(80, 220))]));
  }
  if (rng.chance(0.5)) {
    sequence.push('back');
    await quiet(page.goBack({ waitUntil: 'commit', timeout: 1500 }));
  }
  await quiet(page.waitForLoadState('domcontentloaded', { timeout: 3000 }));
  await sleep(700);
  return { ...step, sequence, label: `Tarayıcıda hızlıca ${sequence.map((d) => (d === 'back' ? 'geri' : 'ileri')).join(', ')} yap` };
}

export async function viewportShake(ctx) {
  const { page, rng } = ctx;
  const step = baseStep(ctx, 'viewport', null);
  const count = rng.int(4, 6);
  const sizes = [];
  await say(page, '📱↔🖥 EKRAN SARSINTISI');
  for (let i = 0; i < count; i++) {
    const vp = i === 0 ? VIEWPORTS[0] : rng.pick(VIEWPORTS);
    sizes.push({ width: vp.width, height: vp.height });
    await quiet(page.setViewportSize({ width: vp.width, height: vp.height }));
    await sleep(rng.int(120, 260));
    if (vp.width <= 480) await ctx.probe(`viewport ${vp.width}x${vp.height}`);
  }
  const settle = rng.chance(0.45) ? VIEWPORTS[0] : VIEWPORTS[1];
  sizes.push({ width: settle.width, height: settle.height });
  await quiet(page.setViewportSize({ width: settle.width, height: settle.height }));
  await sleep(300);
  return { ...step, sizes, label: `Pencere boyutunu hızlıca değiştir: ${sizes.map((s) => `${s.width}×${s.height}`).join(' → ')}` };
}

export async function scrollFrenzy(ctx) {
  const { page, rng } = ctx;
  const deltas = [];
  await say(page, '🌀 SCROLL ÇILGINLIĞI');
  await quiet(page.mouse.move(rng.int(60, 300), rng.int(120, 400), { steps: 4 }));
  for (let i = 0; i < 5; i++) {
    const dy = (rng.chance(0.65) ? 1 : -1) * rng.int(300, 1500);
    deltas.push(dy);
    await quiet(page.mouse.wheel(0, dy));
    await sleep(rng.int(40, 110));
  }
  await sleep(300);
  return { ...baseStep(ctx, 'scroll', null), deltas, label: 'Sayfayı hızlıca aşağı yukarı kaydır' };
}

export async function keyMash(ctx) {
  const { page, rng, mode } = ctx;
  const pool = mode.allowMutations ? ['Tab', 'Tab', 'Enter', 'Escape', 'Space', 'ArrowDown', 'Shift+Tab'] : ['Tab', 'Tab', 'Escape', 'ArrowDown', 'Shift+Tab'];
  const keys = Array.from({ length: rng.int(4, 7) }, () => rng.pick(pool));
  await say(page, '⌨ KLAVYE EZME');
  for (const k of keys) {
    await quiet(page.keyboard.press(k));
    await sleep(rng.int(30, 90));
  }
  ctx.counters.keystrokes += keys.length;
  await sleep(300);
  return { ...baseStep(ctx, 'keys', null), keys, label: `Tuşlara hızlıca bas: ${keys.join(', ')}` };
}

export async function reloadSpam(ctx) {
  const { page } = ctx;
  await say(page, '🔄 F5 F5!');
  const step = baseStep(ctx, 'reload', null);
  await quiet(page.reload({ waitUntil: 'commit', timeout: 3000 }));
  await sleep(120);
  await quiet(page.reload({ waitUntil: 'domcontentloaded', timeout: 6000 }));
  await sleep(500);
  return { ...step, label: 'Sayfayı arka arkaya iki kez yenile (F5)' };
}

export async function offlineFlap(ctx) {
  const { page, context, rng } = ctx;
  await say(page, '📡 WI-FI KOPTU!');
  const step = baseStep(ctx, 'offline', null);
  await quiet(context.setOffline(true));
  const pt = { x: rng.int(80, 400), y: rng.int(120, 500) };
  await quiet(page.mouse.click(pt.x, pt.y));
  await sleep(1300);
  await quiet(context.setOffline(false));
  await sleep(400);
  return { ...step, label: 'İnternet bağlantısını 1.3 saniyeliğine kes (offline) ve tıkla' };
}

export const ACTIONS = {
  rageClick,
  type: chaosType,
  select: pickOption,
  navigate,
  backForward,
  viewport: viewportShake,
  scroll: scrollFrenzy,
  keys: keyMash,
  reload: reloadSpam,
  offline: offlineFlap,
};
