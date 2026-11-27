# Stampede

**A swarm of impatient users for your web app.** Stampede opens your site in up to eight browser tabs at once, each played by a different kind of real user (seven personas, 1–3 copies each):

| Agent | Persona | What it does |
| --- | --- | --- |
| A1 | Angry customer | Rage-clicks pay/submit, spams back/forward, reloads mid-request, squeezes the window to 375 px right before clicking, drops the network while paying, opens a second tab and pays twice |
| A2 | Keyboard user | Never touches the mouse: Tab, Enter/Space, Escape. Finds invisible focus rings and controls a keyboard cannot reach |
| A3 | Mobile user | Touch taps on a 390×844 phone, rotates the device, freezes and wakes the tab, flings the page |
| A4 | Curious attacker | Tampers with ids in the URL, hidden form fields and browser storage, types injection payloads |
| | Form abandoner | Starts typing, leaves the page, comes back and checks whether the draft survived |
| | Slow connection | Slow 3G + 4× CPU throttle; presses again a second later because nothing seems to happen |
| | Crawler bot | Opens every same-origin link back to back, collects broken links and 5xx pages |

While they work, Stampede watches the browser and turns every break into a **reproducible report and a ready-to-run Playwright test** (`stampede.spec.ts`).

- **Any URL, no source code.** Each agent discovers the page live, labels its regions (auth, checkout, search, form, navigation) and picks moves with a seeded, weighted strategy you can watch in the decision graph.
- **Local-first.** No API keys, no cloud, works offline against localhost. Fonts are self-hosted.
- **Auth autopilot.** Login and sign-up forms are filled with a test identity (yours or a generated one). Third-party sign-in buttons (Google, Apple, GitHub …) are never pressed.
- **Optional Gemini layer.** With `GEMINI_API_KEY` in `.env`: an attack planner (one call), a visual review of final screenshots and a root-cause summary. Off by default, never required.
- **Headed mode that stays out of your way.** Visible agent windows tile the screen (2×2 up to 4×2), the real mouse is parked on the menu bar, and agent cursors are engine-driven so a human pointer cannot disturb them.
- **Safe on production.** Safe mode blocks every non-GET request at the network layer and never touches pay/delete/logout controls. Mutating modes on a live host need explicit consent.

> Turkish user guide: [KILAVUZ.md](KILAVUZ.md) · Pitch prep: [SUNUM_HAZIRLIK.md](SUNUM_HAZIRLIK.md)

## Quick start

```bash
npm install      # also makes sure Chromium is available
npm start        # dashboard http://localhost:7400 + buggy demo store http://localhost:7500
```

CLI / CI:

```bash
node bin/stampede.js run http://localhost:7500 --mode chaos --personas all --duration 45 --seed 7
node bin/stampede.js run https://example.com --mode safe --personas all --duration 90 --fail-on high
```

## What it detects

Double submits and race conditions (a duplicate is only counted when the server answered differently, so idempotent replays pass) · uncaught exceptions and console errors · 5xx / 4xx / failed / slow requests · stuck spinners · horizontal overflow · controls covered by floating widgets · `NaN` / `undefined` / `[object Object]` on screen · dead buttons · long tasks · layout shift (CLS) · DOM growth leaks · XSS execution · secrets in the console · sensitive fields in API responses · session cookies without HttpOnly/Secure/SameSite · invisible focus · keyboard-unreachable controls · UI that crashes on a corrupted API answer (stress mode).

## Architecture

```
src/engine/
  session.js        runs the swarm, shared issue store, film strips, report
  agent.js          one persona in its own browser context: monitors, screencast, decide → act → probe loop
  strategy.js       candidate moves, weights, zones, seeded choice (the "brain")
  personas.js       the four user types
  actions.js        rage click, chaos typing, back/forward, viewport shake, scroll, keys, F5, offline
  actions-extra.js  keyboard walk, rotate, sleep/wake, URL/hidden/storage tampering, auth autopilot, twin tab, slow 3G
  detectors.js      pure detectors (probe results, DOM growth, secrets, cookies)
  safety.js         modes, element risk + OAuth classification, production guard
src/ai/gemini.js    optional planner / visual review / root-cause summary
src/util/desktop.js headed window tiling and cursor parking (macOS)
  inject/           in-page overlay (agent cursor, reticles, markers) and probe functions
src/server/         HTTP API, Server-Sent Events, MJPEG live view per agent
src/report/         self-contained HTML, Markdown, JSON and Playwright TypeScript spec
public/             dashboard (vanilla JS, canvas decision graph)
demo/               "Fincan" coffee shop with deliberate bugs (+ ?fixed=1 twin)
```

## Tests

```bash
npm test          # 46 unit tests (node:test)
npm run test:e2e  # 6 end-to-end runs against the demo in real Chromium
```

MIT licensed.
