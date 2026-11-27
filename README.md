# 👻 RageGhost — the Impatient Ghost User

RageGhost attacks any web app like the most impatient human alive: it double- and triple-clicks Pay buttons, spams Back/Forward while pages load, shakes the viewport from phone to desktop, types emoji/RTL/XSS/huge numbers into every field, mashes keys and (in stress mode) pulls the Wi-Fi. While it does that, it watches the browser and turns what breaks into **reproducible bug reports and ready-to-run Playwright regression tests**.

- **Works on any URL, no source code needed.** Discovery, strategy and detection happen live in a real Chromium.
- **Local-first.** No API keys, no cloud. Works offline against localhost.
- **Fun to watch.** An animated ghost cursor with click ripples, speech bubbles and bug highlights, streamed live into a dashboard.
- **Safe on production.** *Safe Exploration* mode blocks every non-GET request at the network layer and never clicks pay/delete/logout controls.

> Turkish user guide: [KILAVUZ.md](KILAVUZ.md) · Pitch prep: [SUNUM_HAZIRLIK.md](SUNUM_HAZIRLIK.md)

## Quick start

```bash
npm install      # also makes sure Chromium is available
npm start        # dashboard http://localhost:7400 + buggy demo store http://localhost:7500
```

Pick **Demo (hatalı)**, mode **Tam Kaos**, press **Hayaleti Salıver**. Then run the same against **Demo (düzeltilmiş)** (`?fixed=1`) and compare.

CLI / CI:

```bash
node bin/rageghost.js run http://localhost:7500 --mode chaos --duration 45 --seed 7
node bin/rageghost.js run https://example.com --mode safe --duration 90 --fail-on high
```

## What it detects

| Detector | How |
| --- | --- |
| Double submit / race condition | Same mutation (method + URL + body) succeeding ≥2× within one burst; `critical` when it moves money |
| Uncaught JS exceptions, console errors | `pageerror`, `console` |
| 5xx / 4xx / failed / slow requests | Network events (ignores telemetry and the ghost's own blocks) |
| Stuck spinners | Loader/`aria-busy`/skeleton elements visible beyond a timeout |
| Mobile overflow | `scrollWidth > clientWidth`, pinpoints the offending element |
| Obscured CTAs | `elementFromPoint` hit-testing against fixed/sticky overlays |
| Garbage rendering | Visible `NaN`, `undefined`, `[object Object]`, `{{template}}` |
| Dead clicks | No DOM mutation, request, URL or scroll change after a click |
| UI freezes | Long tasks ≥ 500 ms |
| XSS | Chaos input payload that executes |
| White screen, tab crash | Probes + `crash` event |

## Architecture

```
public/            dashboard (vanilla JS, SSE)          demo/   "Fincan" coffee shop with 10 deliberate bugs (+ ?fixed=1 twin)
src/server/        HTTP API + Server-Sent Events        bin/    CLI for terminals & CI
src/engine/
  session.js       run loop, monitors, issue capture, CDP screencast
  strategy.js      weighted, seeded action choice (money CTAs first, unseen pages, de-duplicated grids)
  actions.js       rage click, chaos typing, back/forward spam, viewport shake, scroll, keys, F5, offline
  safety.js        modes, element risk classification, production guard
  inject/          in-page ghost overlay + discovery/probe functions
src/report/        HTML / Markdown / JSON report + Playwright spec generator
```

## Tests

```bash
npm test          # unit tests (node:test)
npm run test:e2e  # real Chromium against the demo: buggy, safe and fixed runs + dashboard SSE flow
```

MIT licensed.
