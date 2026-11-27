import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, classifyElement, isAllowed, assertRunAllowed, isLocalUrl, isMutationMethod, isTelemetryUrl } from '../../src/engine/safety.js';

const ORIGIN = 'https://shop.example.com';
const el = (over) => ({ tag: 'button', type: 'submit', text: '', ariaLabel: '', name: '', elId: '', editable: false, inForm: false, formMethod: '', ...over });

test('payment and order buttons are transactional CTAs (TR + EN)', () => {
  for (const text of ['Öde ₺240', 'Siparişi tamamla', 'Pay now', 'Place order', 'Sepete ekle']) {
    const c = classifyElement(el({ text }), ORIGIN);
    assert.equal(c.category, 'transactional', text);
    assert.equal(c.isCTA, true, text);
  }
});

test('destructive actions are detected and blocked outside stress mode', () => {
  for (const text of ['Hesabı sil', 'Delete account', 'Çıkış yap', 'Log out']) {
    const c = classifyElement(el({ text }), ORIGIN);
    assert.equal(c.category, 'destructive', text);
    assert.equal(isAllowed(c.category, MODES.safe), false);
    assert.equal(isAllowed(c.category, MODES.chaos), false);
    assert.equal(isAllowed(c.category, MODES.stress), true);
  }
});

test('safe mode never clicks transactional elements but chaos does', () => {
  assert.equal(isAllowed('transactional', MODES.safe), false);
  assert.equal(isAllowed('transactional', MODES.chaos), true);
  assert.equal(isAllowed('neutral', MODES.safe), true);
});

test('links: external, mailto and same-origin are told apart', () => {
  assert.equal(classifyElement(el({ tag: 'a', href: 'https://evil.com', absHref: 'https://evil.com/' }), ORIGIN).category, 'external');
  assert.equal(classifyElement(el({ tag: 'a', href: 'mailto:a@b.c', absHref: 'mailto:a@b.c' }), ORIGIN).category, 'skip');
  assert.equal(classifyElement(el({ tag: 'a', href: '/about', absHref: `${ORIGIN}/about`, text: 'Hakkımızda' }), ORIGIN).category, 'nav');
});

test('credential and card fields are sensitive', () => {
  assert.equal(classifyElement(el({ tag: 'input', type: 'password', editable: true }), ORIGIN).category, 'sensitive-input');
  assert.equal(classifyElement(el({ tag: 'input', type: 'text', editable: true, autocomplete: 'cc-number' }), ORIGIN).category, 'sensitive-input');
  assert.equal(classifyElement(el({ tag: 'input', type: 'text', editable: true, name: 'q' }), ORIGIN).category, 'input');
});

test('production guard: mutating modes on live hosts need explicit consent', () => {
  assert.throws(() => assertRunAllowed({ url: 'https://biyom.co', modeId: 'chaos', confirmLive: false }), /canlı bir site/);
  assert.throws(() => assertRunAllowed({ url: 'https://biyom.co', modeId: 'stress', confirmLive: false }), /canlı bir site/);
  assert.equal(assertRunAllowed({ url: 'https://biyom.co', modeId: 'safe', confirmLive: false }), true);
  assert.equal(assertRunAllowed({ url: 'https://biyom.co', modeId: 'chaos', confirmLive: true }), true);
  assert.equal(assertRunAllowed({ url: 'http://localhost:7500', modeId: 'stress', confirmLive: false }), true);
});

test('invalid targets are rejected', () => {
  assert.throws(() => assertRunAllowed({ url: 'not a url', modeId: 'safe' }), /Geçersiz URL/);
  assert.throws(() => assertRunAllowed({ url: 'file:///etc/passwd', modeId: 'safe' }), /http/);
  assert.throws(() => assertRunAllowed({ url: 'http://localhost', modeId: 'nope' }), /Bilinmeyen mod/);
});

test('local host detection', () => {
  for (const u of ['http://localhost:3000', 'http://127.0.0.1', 'http://app.test', 'http://192.168.1.20:8080', 'http://api.localhost']) assert.equal(isLocalUrl(u), true, u);
  for (const u of ['https://biyom.co', 'https://example.com']) assert.equal(isLocalUrl(u), false, u);
});

test('mutation and telemetry helpers', () => {
  assert.equal(isMutationMethod('GET'), false);
  assert.equal(isMutationMethod('post'), true);
  assert.equal(isTelemetryUrl('https://www.google-analytics.com/g/collect?v=2'), true);
  assert.equal(isTelemetryUrl('https://shop.example.com/api/orders'), false);
});
