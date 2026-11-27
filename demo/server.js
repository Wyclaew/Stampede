// "Fincan" — a polished little coffee shop with DELIBERATE real-world bugs, used as RageGhost's demo target.
// Every bug has a fixed twin: open the app with ?fixed=1 (client) which also sends an Idempotency-Key (server).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

export const PRODUCTS = Object.freeze([
  { id: 1, name: 'Etiyopya Yirgacheffe', note: 'Bergamot · yasemin · limon', price: 340, color: '#c084fc', emoji: '☕' },
  { id: 2, name: 'Kolombiya Huila', note: 'Karamel · kırmızı elma', price: 295, color: '#fb923c', emoji: '🫘' },
  { id: 3, name: 'Kenya AA', note: 'Frenk üzümü · greyfurt', price: 385, color: '#f472b6', emoji: '🍒' },
  { id: 4, name: 'Brezilya Cerrado', note: 'Fındık · bitter çikolata', price: 260, color: '#a3e635', emoji: '🌰' },
  { id: 5, name: 'Guatemala Antigua', note: 'Kakao · baharat', price: 310, color: '#38bdf8', emoji: '🌋' },
  { id: 6, name: 'Hario V60 Set', note: 'Demleme seti · cam', price: 890, color: '#facc15', emoji: '🧪' },
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createDemoState() {
  return { cart: [{ productId: 1, qty: 1 }, { productId: 6, qty: 1 }], orders: [], idempotency: new Map(), mutationCount: 0, seq: 1000 };
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
        await sleep(3400); // BUG: slow endpoint on the home page
        return json(res, 200, PRODUCTS.slice(0, 3));
      }

      if (path === '/api/stats' && req.method === 'GET') {
        return json(res, 200, { orders: state.orders.length, totalCharged: state.orders.reduce((s, o) => s + o.total, 0), mutations: state.mutationCount, cartCount: cartSummary(state).count });
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

export function startDemo(port = Number(process.env.DEMO_PORT) || 4500) {
  const { server, state } = createDemoServer();
  return new Promise((resolve, reject) => {
    server.once('error', (err) => reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} kullanımda. Başka port: DEMO_PORT=4501`) : err));
    server.listen(port, '127.0.0.1', () => resolve({ server, state, port, url: `http://localhost:${port}` }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDemo()
    .then(({ url }) => process.stdout.write(`☕ Fincan demo mağazası: ${url}  (düzeltilmiş sürüm: ${url}/?fixed=1)\n`))
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
