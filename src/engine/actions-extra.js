// Persona-specific and "bad day" moves: keyboard walking, rotation, sleep/wake, URL tampering,
// storage corruption, auth autopilot, network drops at the worst moment, twin-tab desync.
import { discoverElements, focusInfo, ghostSay, keyboardUnreachable, readCounters, storageChaos, tamperHidden } from './inject/probes.js';
import { baseStep, didReact, focusEl, glideTo, pointFor, press } from './actions.js';
import { humanName, playwrightLocator } from './locator.js';
import { classifyElement, isAllowed } from './safety.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (p) => p.catch(() => null);
const say = (page, text, kind) => quiet(page.evaluate(ghostSay, { text, kind }));
const placeAt = (page, rect) =>
  quiet(page.evaluate((r) => window.__stampede && window.__stampede.place(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2), rect));

export async function keyActivate(ctx, cand) {
  const { page, rng, mode } = ctx;
  const el = cand.el;
  if (!(await focusEl(ctx, el))) return null;
  const info = await quiet(page.evaluate(focusInfo));
  if (info && info.rect) await placeAt(page, info.rect);
  const key = el.type === 'checkbox' || el.role === 'switch' ? 'Space' : 'Enter';
  const count = rng.int(mode.burst[0], mode.burst[1]);
  await say(page, `${key.toUpperCase()} ×${count}${el.text ? `  ${el.text.slice(0, 24)}` : ''}`);
  const before = await quiet(page.evaluate(readCounters));
  const reqBefore = ctx.counters.requests;
  for (let i = 0; i < count; i++) {
    await quiet(page.keyboard.press(key));
    ctx.counters.keystrokes++;
    await sleep(rng.int(30, 90));
  }
  await sleep(600);
  const reacted = await didReact(ctx, before, reqBefore);
  const step = { ...baseStep(ctx, 'keyActivate', el), key, count, label: `${humanName(el)} odaklayıp ${count} kez ${key} bas` };
  const isButtonish = el.tag === 'button' || el.role === 'button';
  if (!reacted && isButtonish) step.dead = true;
  return step;
}

export async function tabWalk(ctx) {
  const { page, rng } = ctx;
  const presses = rng.int(6, 14);
  await say(page, `TAB ×${presses}`);
  const invisible = [];
  let onBody = 0;
  for (let i = 0; i < presses; i++) {
    await quiet(page.keyboard.press('Tab'));
    ctx.counters.keystrokes++;
    const info = await quiet(page.evaluate(focusInfo));
    if (!info || info.onBody) {
      onBody++;
      continue;
    }
    if (info.rect) await placeAt(page, info.rect);
    if (!info.visibleIndicator && !invisible.some((x) => x.id === info.id)) invisible.push(info);
    await sleep(rng.int(60, 140));
  }
  if (invisible.length) {
    const names = invisible.slice(0, 4).map((x) => `“${x.text || x.tag}”`).join(', ');
    ctx.report({
      type: 'focus-invisible',
      severity: 'medium',
      fingerprint: `focus|${new URL(page.url()).pathname}`,
      detail: `Tab ile gezerken ${invisible.length} elemanda odak çerçevesi görünmüyor (${names}); klavye kullanıcısı nerede olduğunu kaybediyor.`,
      evidence: invisible.map((x) => `${x.tag} “${x.text}”: outline ve box-shadow yok`),
      elementId: invisible[0].id,
      rect: invisible[0].rect,
    });
  }
  const pageKey = page.url().split('?')[0];
  if (!ctx.memory.unreachableChecked.has(pageKey)) {
    ctx.memory.unreachableChecked.add(pageKey);
    const found = (await quiet(page.evaluate(keyboardUnreachable))) || [];
    if (found.length) {
      ctx.report({
        type: 'keyboard-unreachable',
        severity: 'medium',
        fingerprint: `kbd|${found[0].desc}`,
        detail: `${found.length} tıklanabilir görünen eleman klavyeyle odaklanamıyor (ör. ${found[0].desc}${found[0].text ? ` “${found[0].text}”` : ''}).`,
        evidence: found.map((f) => `${f.desc}${f.text ? ` “${f.text}”` : ''}: cursor:pointer ama tabindex/rol yok`),
        elementId: found[0].id,
        rect: found[0].rect,
      });
    }
  }
  return { ...baseStep(ctx, 'tabWalk', null), presses, label: `Tab tuşuyla ${presses} adım ilerle${onBody ? ` (${onBody} adımda odak kayboldu)` : ''}` };
}

export async function escapeSpam(ctx) {
  const { page } = ctx;
  await say(page, 'ESC ×3');
  for (let i = 0; i < 3; i++) {
    await quiet(page.keyboard.press('Escape'));
    await sleep(70);
  }
  await sleep(300);
  return { ...baseStep(ctx, 'escapeSpam', null), keys: ['Escape', 'Escape', 'Escape'], label: 'ESC tuşuna 3 kez bas' };
}

export async function rotate(ctx) {
  const { page } = ctx;
  const vp = page.viewportSize() || { width: 390, height: 844 };
  const landscape = { width: Math.max(vp.width, vp.height), height: Math.min(vp.width, vp.height) };
  const portrait = { width: Math.min(vp.width, vp.height), height: Math.max(vp.width, vp.height) };
  await say(page, 'TELEFONU ÇEVİR');
  await quiet(page.setViewportSize(landscape));
  await sleep(600);
  await ctx.probe(`yatay ${landscape.width}×${landscape.height}`);
  await quiet(page.setViewportSize(portrait));
  await sleep(400);
  ctx.memory.rotated = true;
  return { ...baseStep(ctx, 'viewport', null), sizes: [landscape, portrait], label: `Telefonu yatay (${landscape.width}×${landscape.height}) çevirip geri dikey yap` };
}

export async function sleepWake(ctx) {
  const { page } = ctx;
  if (!ctx.cdp) return null;
  await say(page, 'ARKA PLANA AT');
  await quiet(ctx.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }));
  await sleep(2500);
  await quiet(ctx.cdp.send('Page.setWebLifecycleState', { state: 'active' }));
  await say(page, 'UYANDIR');
  await sleep(900);
  return { ...baseStep(ctx, 'sleepWake', null), label: 'Sekmeyi 2.5 sn arka plana atıp (dondurup) geri getir' };
}

const ID_VARIANTS = (n) => [n + 1, n - 1, 0, -1, 99999999, 'abc'];

/** Swap the first number in the URL for a neighbour or a hostile value. */
export function tamperUrl(url, pick) {
  const u = new URL(url);
  const target = `${u.pathname}${u.search}${u.hash}`;
  const m = /(\d+)/.exec(target);
  if (!m) {
    u.searchParams.set('id', '-1');
    return u.toString();
  }
  const next = pick(ID_VARIANTS(Number(m[1])));
  const replaced = target.slice(0, m.index) + String(next) + target.slice(m.index + m[1].length);
  return `${u.origin}${replaced}`;
}

export async function idTamper(ctx) {
  const { page, rng } = ctx;
  const from = page.url();
  const to = tamperUrl(from, (list) => rng.pick(list));
  await say(page, 'URL KİMLİĞİNİ DEĞİŞTİR');
  await quiet(page.goto(to, { waitUntil: 'domcontentloaded', timeout: 8000 }));
  await sleep(900);
  return { ...baseStep(ctx, 'idTamper', null), urlBefore: from, to, label: `Adres çubuğundaki kimliği değiştir: ${to}` };
}

export async function hiddenTamper(ctx) {
  const { page, mode } = ctx;
  const changes = (await quiet(page.evaluate(tamperHidden))) || [];
  if (!changes.length) return null;
  await say(page, `GİZLİ ALAN ×${changes.length}`);
  let submitted = false;
  if (mode.allowTransactional) {
    submitted = Boolean(
      await quiet(
        page.evaluate(() => {
          const f = document.querySelector('form input[type=hidden]')?.form;
          if (f && typeof f.requestSubmit === 'function') {
            f.requestSubmit();
            return true;
          }
          return false;
        }),
      ),
    );
    await sleep(1200);
  }
  return {
    ...baseStep(ctx, 'hiddenTamper', null),
    changes,
    submitted,
    label: `Gizli form alanlarını değiştir (${changes.map((c) => `${c.name}=${c.to || '∅'}`).join(', ')})${submitted ? ' ve formu gönder' : ''}`,
  };
}

export async function storageCorrupt(ctx) {
  const { page } = ctx;
  const n = await quiet(page.evaluate(storageChaos, 'corrupt'));
  if (!n) return null;
  await say(page, `HAFIZA BOZ ×${n}`);
  const step = { ...baseStep(ctx, 'storageCorrupt', null), keys: n, label: `localStorage/sessionStorage içindeki ${n} değeri bozuk veriyle değiştirip sayfayı yenile` };
  await quiet(page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 }));
  await sleep(1500);
  await ctx.probe('bozuk hafıza ile yükleme');
  await quiet(page.evaluate(storageChaos, 'restore'));
  ctx.memory.storageCorrupted.add(ctx.pageKey());
  return step;
}

export async function storageFlood(ctx) {
  const { page } = ctx;
  const n = await quiet(page.evaluate(storageChaos, 'flood'));
  if (n === null || n === undefined) return null;
  await say(page, 'HAFIZA DOLU');
  const step = { ...baseStep(ctx, 'storageFlood', null), label: 'localStorage kotasını tamamen doldurup sayfayı yenile' };
  await quiet(page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 }));
  await sleep(1500);
  await ctx.probe('dolu hafıza ile yükleme');
  await quiet(page.evaluate(storageChaos, 'unflood'));
  ctx.memory.storageFlooded = true;
  return step;
}

async function fillField(ctx, id, value) {
  const { page, persona, mode } = ctx;
  if (!id) return;
  if (persona && !persona.keyboardOnly) {
    const pt = await pointFor(ctx, { id });
    if (pt) {
      await glideTo(ctx, pt.x, pt.y);
      await press(ctx, pt.x, pt.y);
    }
  }
  await focusEl(ctx, { id });
  await quiet(page.keyboard.press('Backspace'));
  await quiet(page.keyboard.type(value, { delay: Math.max(mode.typeDelayMs, 4) }));
  ctx.counters.keystrokes += value.length;
}

/** Auth autopilot: fill a login/sign-up form with the run's test identity and (when allowed) submit it. */
export async function login(ctx) {
  const { page, rng, mode, persona } = ctx;
  const snap = await quiet(page.evaluate(discoverElements));
  const auth = snap && snap.auth;
  ctx.memory.loginTried.add(ctx.pageKey());
  if (!auth || !auth.passwords.length) return null;
  const creds = ctx.credentials;
  const email = auth.kind === 'signup' ? creds.signupEmail(ctx.agentCode) : creds.email;
  await say(page, auth.kind === 'signup' ? 'KAYIT OL  test hesabı' : 'GİRİŞ YAP  test hesabı');
  await fillField(ctx, auth.idField, email);
  for (const id of auth.passwords) await fillField(ctx, id, creds.password);
  for (const id of auth.extra) await fillField(ctx, id, 'Stampede Test');
  for (const id of auth.terms) {
    const pt = await pointFor(ctx, { id });
    if (pt) await press(ctx, pt.x, pt.y);
  }
  const step = {
    ...baseStep(ctx, 'login', null),
    authKind: auth.kind,
    email,
    idLocator: auth.idField ? `page.locator('[data-rg-id="${auth.idField}"]')` : null,
    submitText: auth.submitText,
    label: `${auth.kind === 'signup' ? 'Kayıt' : 'Giriş'} formunu test hesabıyla (${email}) doldur`,
  };
  if (!mode.allowTransactional || !auth.submit) {
    await say(page, 'GÖNDERİLMEDİ  güvenli mod');
    step.label += ' (güvenli mod: gönderilmedi)';
    return step;
  }
  const count = persona && persona.id === 'rage' ? rng.int(2, 3) : 1;
  const before = page.url();
  if (persona && persona.keyboardOnly) {
    for (let i = 0; i < count; i++) await quiet(page.keyboard.press('Enter'));
  } else {
    const pt = await pointFor(ctx, { id: auth.submit });
    if (pt) {
      await glideTo(ctx, pt.x, pt.y);
      for (let i = 0; i < count; i++) {
        await press(ctx, pt.x, pt.y);
        await sleep(rng.int(30, 80));
      }
    }
  }
  await sleep(1600);
  step.submitCount = count;
  step.navigated = page.url() !== before;
  step.label += ` ve “${auth.submitText || 'gönder'}” butonuna ${count} kez bas`;
  return step;
}

export async function offlineBurst(ctx, cand) {
  const { page, context, rng } = ctx;
  const el = cand.el;
  const pt = await pointFor(ctx, el);
  if (!pt) return null;
  await glideTo(ctx, pt.x, pt.y);
  await press(ctx, pt.x, pt.y);
  ctx.setOfflineWindow(5000);
  await quiet(context.setOffline(true));
  await say(page, 'BAĞLANTI KOPTU  panik ×3', 'bug');
  for (let i = 0; i < 3; i++) {
    await sleep(rng.int(100, 200));
    await press(ctx, pt.x, pt.y);
  }
  await sleep(1500);
  await quiet(context.setOffline(false));
  await say(page, 'BAĞLANTI GELDİ');
  await press(ctx, pt.x, pt.y);
  await sleep(1800);
  ctx.memory.offlineBurstOn.add(ctx.pageKey());
  return {
    ...baseStep(ctx, 'offlineBurst', el),
    label: `${humanName(el)} bas, tam o anda internet kopsun, 3 kez daha bas, internet gelince bir kez daha bas`,
  };
}

export async function twinTab(ctx) {
  const { page, rng } = ctx;
  const url = page.url();
  const twin = await ctx.openTwin();
  if (!twin) return null;
  await say(page, 'İKİNCİ SEKME AÇILDI');
  let targetText = null;
  let twinLocator = null;
  try {
    await quiet(twin.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }));
    await sleep(900);
    const snap = await quiet(twin.evaluate(discoverElements));
    // Same safety rules as every other move: only allowed, money/save style buttons, never destructive ones.
    const origin = new URL(url).origin;
    const pick = snap && snap.elements.find((e) => {
      if (!e.inViewport || !(e.tag === 'button' || e.role === 'button')) return false;
      const cls = classifyElement(e, origin);
      return cls.category === 'transactional' && isAllowed(cls.category, ctx.mode) && /(öde|pay|sepet|cart|ekle|add|kaydet|save|onayla|confirm)/i.test(e.text);
    });
    if (pick) {
      targetText = pick.text;
      twinLocator = playwrightLocator(pick);
      const loc = twin.locator(`[data-rg-id="${pick.id}"]`);
      for (let i = 0; i < 2; i++) await quiet(loc.click({ timeout: 2000, force: true }));
      await sleep(1200);
    }
  } finally {
    await quiet(twin.close());
  }
  if (!targetText) return null;
  // Back in the first tab, which still shows the old state.
  const snapA = await quiet(page.evaluate(discoverElements));
  const same = snapA && snapA.elements.find((e) => e.text === targetText);
  if (same) {
    const pt = await pointFor(ctx, same);
    if (pt) {
      await glideTo(ctx, pt.x, pt.y);
      await press(ctx, pt.x, pt.y);
      await sleep(rng.int(800, 1200));
    }
  }
  return {
    ...baseStep(ctx, 'twinTab', same || null),
    urlBefore: url,
    twinLocator,
    targetText,
    label: `Aynı sayfayı ikinci sekmede aç, orada “${targetText}” butonuna 2 kez bas, sonra eski sekmede aynı butona bas`,
  };
}

export async function slowNet(ctx) {
  const { page } = ctx;
  if (!ctx.cdp) return null;
  await say(page, 'YAVAŞ 3G');
  await quiet(ctx.cdp.send('Network.enable'));
  await quiet(ctx.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024 }));
  const step = { ...baseStep(ctx, 'slowNet', null), label: 'Ağı “Yavaş 3G”ye düşür, sayfa yüklenirken sabırsızca iki kez yenile' };
  await quiet(page.reload({ waitUntil: 'commit', timeout: 6000 }));
  await sleep(900);
  await quiet(page.reload({ waitUntil: 'commit', timeout: 6000 }));
  await sleep(3500);
  await quiet(ctx.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }));
  await quiet(page.waitForLoadState('domcontentloaded', { timeout: 6000 }));
  return step;
}
