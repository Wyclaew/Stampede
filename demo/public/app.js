/* Fincan demo store. Contains DELIBERATE bugs (marked "BUG #n") for RageGhost to find.
 * Open with ?fixed=1 to get the corrected implementation of every bug. */
(function () {
  'use strict';
  var FIXED = new URLSearchParams(location.search).has('fixed');
  document.documentElement.classList.toggle('fixed', FIXED);

  var view = document.getElementById('view');
  var badge = document.getElementById('cartBadge');
  var loader = document.getElementById('globalLoader');
  var products = [];
  var cache = { count: undefined, total: 0, items: [] };
  var inflight = 0;
  var discountRate = 0;

  document.getElementById('buildTag').textContent = FIXED ? '✅ FIXED BUILD' : '🐞 BUGGY BUILD';

  var tl = function (n) { return '₺' + Number(n).toLocaleString('tr-TR'); };

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---- network helper with a global loading indicator ----
  function api(path, opts) {
    inflight++;
    loader.hidden = false;
    return fetch(path, opts).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
      return res.json();
    }).then(function (data) {
      done();
      return data;
    }, function (err) {
      // BUG #6 (stuck spinner): on failure the in-flight counter is never decremented, so the
      // global loader keeps spinning forever. Fixed build decrements in both paths.
      if (FIXED) done();
      throw err;
    });
  }
  function done() {
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) loader.hidden = true;
  }

  function setBadge(n) { badge.textContent = String(n); }

  function refreshCart() {
    return api('/api/cart').then(function (c) {
      cache = c;
      setBadge(c.count);
      return c;
    });
  }

  // ---- router (pushState) ----
  function go(route) {
    // BUG #2 (part 1): the badge value is cached in history.state; impatient users navigate before
    // /api/cart answered, so cartCount is undefined for those entries.
    history.pushState({ route: route, cartCount: cache.count }, '', route);
    render();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-link]');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', function (e) {
    if (FIXED) {
      setBadge(cache.count === undefined ? '…' : cache.count);
      render();
      return;
    }
    // BUG #2 (part 2): assumes every history entry has state. The first entry has state === null
    // (TypeError, view never re-renders) and early entries render "NaN" in the cart badge.
    setBadge(e.state.cartCount + 0);
    render();
  });

  function currentRoute() { return location.hash || '#/'; }

  function render() {
    var route = currentRoute();
    var tpl = route.indexOf('#/checkout') === 0 ? 'tpl-checkout' : route.indexOf('#/orders') === 0 ? 'tpl-orders' : 'tpl-shop';
    view.replaceChildren(document.getElementById(tpl).content.cloneNode(true));
    document.querySelectorAll('.site-head nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === route); });
    if (tpl === 'tpl-shop') mountShop();
    else if (tpl === 'tpl-checkout') mountCheckout();
    else mountOrders();
    window.scrollTo(0, 0);
  }

  // ---- shop ----
  function card(p) {
    var el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = '<div class="art" style="--c:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="body"><h3></h3><p class="note"></p><div class="row"><b class="price"></b>' +
      '<button type="button" class="fav" aria-label="Favorilere ekle">♡</button>' +
      '<button type="button" class="add">Sepete ekle</button></div></div>';
    el.querySelector('h3').textContent = p.name;
    el.querySelector('.note').textContent = p.note;
    el.querySelector('.price').textContent = tl(p.price);
    var add = el.querySelector('.add');
    add.addEventListener('click', function () {
      // BUG #1b (double add): no in-flight guard, every rapid click POSTs again.
      if (FIXED && add.disabled) return;
      if (FIXED) add.disabled = true;
      add.textContent = 'Ekleniyor…';
      api('/api/cart/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: p.id }) })
        .then(function (c) { cache = c; setBadge(c.count); toast(p.name + ' sepete eklendi'); })
        .catch(function () { toast('Eklenemedi'); })
        .then(function () { add.textContent = 'Sepete ekle'; add.disabled = false; });
    });
    // BUG #9 (dead button): the favourite button has no handler at all in the buggy build.
    if (FIXED) el.querySelector('.fav').addEventListener('click', function (e) { e.currentTarget.textContent = '♥'; toast('Favorilere eklendi'); });
    return el;
  }

  function paintGrid(list) {
    var grid = document.getElementById('grid');
    if (grid) grid.replaceChildren.apply(grid, list.map(card));
  }

  function mountShop() {
    paintGrid(products);
    var search = document.getElementById('search');
    var status = document.getElementById('searchStatus');
    var reqId = 0;
    search.addEventListener('input', function () {
      var q = search.value;
      if (FIXED) {
        q = q.replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 40);
        status.textContent = q ? '“' + q + '” aranıyor…' : '';
      } else {
        // BUG #8 (XSS): user input rendered with innerHTML.
        status.innerHTML = q ? '“' + q + '” aranıyor…' : '';
      }
      if (!q.trim()) { paintGrid(products); return; }
      var id = ++reqId;
      api('/api/search?q=' + encodeURIComponent(q)).then(function (list) {
        if (id !== reqId) return;
        status.textContent = list.length + ' sonuç';
        paintGrid(list);
      }).catch(function (err) {
        console.error('Arama başarısız:', err.message);
        status.textContent = FIXED ? 'Arama şu an yapılamıyor, tekrar deneyin.' : '';
      });
    });
    document.getElementById('sort').addEventListener('change', function (e) {
      var v = e.target.value;
      var list = products.slice();
      if (v === 'asc') {
        // BUG #10 (UI freeze): a "precise" sort that blocks the main thread for ~1s.
        if (!FIXED) { var until = Date.now() + 1100; while (Date.now() < until) { /* busy */ } }
        list.sort(function (a, b) { return a.price - b.price; });
      } else if (v === 'desc') list.sort(function (a, b) { return b.price - a.price; });
      paintGrid(list);
    });
    api(FIXED ? '/api/recommendations?cached=1' : '/api/recommendations').then(function (recs) {
      var row = document.getElementById('recs');
      if (!row) return;
      row.replaceChildren.apply(row, recs.map(function (p) {
        var d = document.createElement('div');
        d.className = 'rec';
        d.textContent = p.emoji + ' ' + p.name;
        return d;
      }));
    }).catch(function () {});
  }

  // ---- checkout ----
  function priceOf(id) { var p = products.find(function (x) { return x.id === id; }); return p ? p.price : 0; }

  function computeTotals() {
    var subtotal = 0;
    document.querySelectorAll('.line').forEach(function (row) {
      var qtyInput = row.querySelector('input');
      // BUG #4 (NaN): the quantity is parsed without validation; "", "abc", "1e309" leak into totals.
      var qty = FIXED ? Math.min(99, Math.max(1, parseInt(qtyInput.value, 10) || 1)) : parseFloat(qtyInput.value);
      var lineTotal = qty * priceOf(Number(row.dataset.id));
      row.querySelector('.lt').textContent = tl(lineTotal);
      subtotal += lineTotal;
    });
    var discount = Math.round(subtotal * discountRate);
    document.getElementById('subtotal').textContent = tl(subtotal);
    document.getElementById('discount').textContent = '-' + tl(discount);
    document.getElementById('total').textContent = tl(subtotal - discount);
    document.getElementById('pay').textContent = 'Öde ' + tl(subtotal - discount);
    return subtotal - discount;
  }

  function mountCheckout() {
    var lines = document.getElementById('lines');
    lines.innerHTML = '<p class="muted">Sepet yükleniyor…</p>';
    refreshCart().then(function (c) {
      if (!document.getElementById('lines')) return;
      lines.replaceChildren.apply(lines, c.items.map(function (i) {
        var p = products.find(function (x) { return x.id === i.productId; }) || { name: '?', emoji: '☕' };
        var row = document.createElement('div');
        row.className = 'line';
        row.dataset.id = i.productId;
        row.innerHTML = '<span class="e"></span><span class="n"></span><input type="number" min="1" aria-label="Adet"><b class="lt"></b>';
        row.querySelector('.e').textContent = p.emoji;
        row.querySelector('.n').textContent = p.name;
        row.querySelector('input').value = i.qty;
        row.querySelector('input').addEventListener('input', computeTotals);
        return row;
      }));
      computeTotals();
    }).catch(function () { lines.textContent = 'Sepet yüklenemedi.'; });

    document.getElementById('applyCoupon').addEventListener('click', function () {
      var value = document.getElementById('coupon').value.trim().toUpperCase();
      var msg = document.getElementById('couponMsg');
      if (FIXED) {
        var ok = /^([A-Z]{4})(\d{2})$/.exec(value);
        if (!ok) { msg.textContent = 'Geçersiz kupon kodu.'; return; }
        discountRate = Number(ok[2]) / 100;
      } else {
        // BUG #7 (crash): destructuring the regex result; any non-matching code throws a TypeError.
        var parts = value.match(/^([A-Z]{4})(\d{2})$/);
        var percent = parts[2];
        discountRate = Number(percent) / 100;
      }
      msg.textContent = 'Kupon uygulandı: %' + Math.round(discountRate * 100);
      computeTotals();
    });

    var pay = document.getElementById('pay');
    var idemKey = 'ord-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    pay.addEventListener('click', function () {
      // BUG #1 (double charge): the button is NOT disabled while the payment request is in flight
      // and no Idempotency-Key is sent, so every impatient click charges the customer again.
      if (FIXED && pay.disabled) return;
      if (FIXED) pay.disabled = true;
      var total = computeTotals();
      pay.classList.add('busy');
      pay.textContent = 'İşleniyor…';
      var headers = { 'content-type': 'application/json' };
      if (FIXED) headers['idempotency-key'] = idemKey;
      api('/api/orders', { method: 'POST', headers: headers, body: JSON.stringify({ total: total }) })
        .then(function (o) { toast('Ödeme alındı · Sipariş #' + o.id + ' · ' + tl(o.total)); })
        .catch(function () { toast('Ödeme başarısız'); })
        .then(function () { pay.classList.remove('busy'); if (document.getElementById('pay')) computeTotals(); });
    });
  }

  // ---- orders ledger ----
  function mountOrders() {
    api('/api/orders').then(function (d) {
      var ledger = document.getElementById('ledger');
      if (!ledger) return;
      document.getElementById('charged').textContent = tl(d.totalCharged);
      if (!d.orders.length) { ledger.innerHTML = '<li class="muted">Henüz tahsilat yok.</li>'; return; }
      ledger.replaceChildren.apply(ledger, d.orders.slice().reverse().map(function (o) {
        var li = document.createElement('li');
        li.textContent = '#' + o.id + ' · ' + new Date(o.at).toLocaleTimeString('tr-TR') + ' · ' + tl(o.total);
        return li;
      }));
    }).catch(function () {});
    document.getElementById('wipe').addEventListener('click', function () {
      api('/api/reset', { method: 'POST' }).then(function () { refreshCart(); render(); });
    });
  }

  document.getElementById('chat').addEventListener('click', function () { toast('Destek ekibimiz şu an çevrimdışı ☕'); });

  // ---- boot ----
  api('/api/products').then(function (list) {
    products = list;
    render();
    refreshCart().catch(function () {});
  });
})();
