// "Fincan" — a polished little coffee shop with DELIBERATE real-world bugs, used as Stampede's demo target.
// Every bug has a fixed twin: open the app with ?fixed=1 (client) which also sends an Idempotency-Key (server).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listenWithFallback } from '../src/util/listen.js';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

export const PRODUCTS = Object.freeze([
  { id: 1, name: 'Etiyopya Yirgacheffe', note: 'Bergamot · yasemin · limon', price: 340, color: '#c084fc', mark: 'ET' },
  { id: 2, name: 'Kolombiya Huila', note: 'Karamel · kırmızı elma', price: 295, color: '#fb923c', mark: 'KH' },
  { id: 3, name: 'Kenya AA', note: 'Frenk üzümü · greyfurt', price: 385, color: '#f472b6', mark: 'KE' },
  { id: 4, name: 'Brezilya Cerrado', note: 'Fındık · bitter çikolata', price: 260, color: '#a3e635', mark: 'BC' },
  { id: 5, name: 'Guatemala Antigua', note: 'Kakao · baharat', price: 310, color: '#38bdf8', mark: 'GA' },
  { id: 6, name: 'Hario V60 Set', note: 'Demleme seti · cam', price: 890, color: '#facc15', mark: 'V60' },
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createDemoState() {
  return { cart: [{ productId: 1, qty: 1 }, { productId: 6, qty: 1 }], orders: [], users: [], idempotency: new Map(), mutationCount: 0, seq: 1000 };
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 32 * 1024) throw new Error('body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const cartSummary = (state) => {
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const total = state.cart.reduce((s, i) => s + i.qty * PRODUCTS.find((p) => p.id === i.productId).price, 0);
  return { items: state.cart, count, total };
};

export function createDemoServer(state = createDemoState()) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') state.mutationCount++;

      if (path === '/api/products' && req.method === 'GET') return json(res, 200, PRODUCTS);

      if (path === '/api/cart' && req.method === 'GET') {
        await sleep(650);
        return json(res, 200, cartSummary(state));
      }

      if (path === '/api/cart/items' && req.method === 'POST') {
        const body = await readBody(req);
        const product = PRODUCTS.find((p) => p.id === Number(body.productId));
        if (!product) return json(res, 400, { error: 'unknown product' });
        await sleep(380);
        const line = state.cart.find((i) => i.productId === product.id);
        if (line) line.qty += 1;
        else state.cart.push({ productId: product.id, qty: 1 });
        return json(res, 201, cartSummary(state));
      }

      if (path === '/api/orders' && req.method === 'POST') {
        const body = await readBody(req);
        const key = req.headers['idempotency-key'];
        if (key && state.idempotency.has(key)) {
          await sleep(200);
          return json(res, 200, state.idempotency.get(key));
        }
        await sleep(1200); // payment provider latency: the window where impatient users click again
        const order = { id: ++state.seq, total: Number(body.total) || cartSummary(state).total, items: state.cart.length, at: Date.now() };
        state.orders.push(order);
        if (key) state.idempotency.set(key, order);
        return json(res, 201, order);
      }

      if (path === '/api/orders' && req.method === 'GET') {
        return json(res, 200, { orders: state.orders, totalCharged: state.orders.reduce((s, o) => s + o.total, 0) });
      }

      if (path === '/api/search' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        await sleep(250);
        // BUG (server): unexpected characters crash the "search engine" instead of returning 400
        if (q.length > 40 || /[^\p{L}\p{N} ]/u.test(q)) return json(res, 500, { error: 'SearchIndexError: tokenizer failed' });
        const needle = q.toLocaleLowerCase('tr-TR');
        return json(res, 200, PRODUCTS.filter((p) => p.name.toLocaleLowerCase('tr-TR').includes(needle)));
      }

      if (path === '/api/recommendations' && req.method === 'GET') {
        // BUG: slow endpoint on the home page (the fixed client asks for the cached variant)
        await sleep(url.searchParams.has('cached') ? 120 : 3400);
        return json(res, 200, PRODUCTS.slice(0, 3));
      }

      if ((path === '/api/login' || path === '/api/signup') && req.method === 'POST') {
        const body = await readBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const fixed = req.headers['x-build'] === 'fixed';
        if (!email.includes('@') || password.length < 6) return json(res, 422, { error: 'E-posta veya şifre geçersiz' });
        await sleep(700);
        let user = state.users.find((u) => u.email === email);
        if (path === '/api/signup') {
          // BUG #13 (server): no uniqueness check, every click creates another account
          if (fixed && user) return json(res, 409, { error: 'Bu e-posta zaten kayıtlı' });
          user = { id: state.users.length + 1, email, passwordHash: `sha1$${Buffer.from(password).toString('base64')}`, createdAt: Date.now() };
          state.users.push(user);
        } else if (!user) {
          return json(res, 401, { error: 'Hesap bulunamadı' });
        }
        const sid = Math.random().toString(36).slice(2);
        // BUG #12 (insecure cookie): session cookie readable from JavaScript, no SameSite
        res.setHeader('set-cookie', fixed ? `session=${sid}; Path=/; HttpOnly; SameSite=Lax` : `session=${sid}; Path=/`);
        // BUG #11b (data leak): the whole user record, password hash included, is sent to the browser
        return json(res, path === '/api/signup' ? 201 : 200, fixed ? { id: user.id, email: user.email } : user);
      }

      if (path === '/api/stats' && req.method === 'GET') {
        return json(res, 200, { orders: state.orders.length, users: state.users.length, totalCharged: state.orders.reduce((s, o) => s + o.total, 0), mutations: state.mutationCount, cartCount: cartSummary(state).count });
      }

      if (path === '/api/reset' && req.method === 'POST') {
        Object.assign(state, createDemoState());
        return json(res, 200, { ok: true });
      }

      if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' });

      const rel = path === '/' ? 'index.html' : path.slice(1);
      const file = normalize(join(PUBLIC_DIR, rel));
      if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
      const body = await readFile(file).catch(() => null);
      if (!body) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(body);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  });
  return { server, state };
}

export const DEFAULT_DEMO_PORT = 7500;

export async function startDemo(preferred = Number(process.env.DEMO_PORT) || DEFAULT_DEMO_PORT) {
  const { server, state } = createDemoServer();
  const port = await listenWithFallback(server, preferred);
  return { server, state, port, url: `http://localhost:${port}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDemo()
    .then(({ url }) => process.stdout.write(`Fincan demo mağazası: ${url}  (düzeltilmiş sürüm: ${url}/?fixed=1)\n`))
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
