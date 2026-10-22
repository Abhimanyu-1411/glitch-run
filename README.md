# 🕹️ GLITCH RUN

A neon cyberpunk endless runner built with pure HTML5 Canvas, CSS, and Vanilla JavaScript — no frameworks, no build tools, no external assets.

---

## Features

- **Endless runner gameplay** — dodge obstacles, collect data fragments, survive as long as possible
- **Fast-drop mechanic** — press Down/S while airborne to plunge quickly to the ground
- **Power-ups** — Slow-Motion, Shield, and Data Magnet with distinct visual effects
- **Glitch Events** — Data Storm, Speed Surge, Gravity Error, and Corrupt Display keep every run fresh
- **Cosmetic shop** — buy and equip skins (Neon, Phantom, Ghost, Cyber) and trails (Sparks, Comet, Digital)
- **Achievements** — 10 in-game achievements with persistent progress
- **Daily Missions** — three rotating objectives that reward bonus coins
- **Web Audio Engine** — synthesized electronic background music and sound effects (zero external files, zero network requests):
  - **Synthwave Background Music** — 8-bar electronic synthwave loop (116 BPM, D minor) generated in memory with bassline, cyber arpeggio, ambient pad, and percussion
  - **Dynamic Audio State Ducking** — smooth volume transitions between gameplay, menu, game-over, and low-pass muffle effect when paused
  - **Separate Audio Controls** — independent ON/OFF toggles for Sound Effects and Background Music, plus stepped volume controls (20%–100%)
  - **Expanded Sound Effects** — jump, fast-drop dive (`drop`), impact landing (`land`), shard collect (`fragment`), power-ups (`powerup`, `slowStart`, `slowEnd`, `magnetStart`), shield break (`shieldBreak`), game over crash (`die`), high score fanfare (`newBest`), daily mission fanfare (`mission`), achievement unlock (`unlock`), and shop purchase (`buy`)
- **Settings** — Sound Effects toggle & volume, Background Music toggle & volume, Screen Shake, and Reduced Motion
- **Responsive layout** — desktop and mobile (portrait/landscape) with touch controls
- **Persistent progress** — all coins, owned items, achievements, and missions saved in `localStorage`

---

## Controls

| Action | Keyboard | Mobile |
|---|---|---|
| Jump | `Space` / `W` / `↑` | Tap left half of screen |
| Fast-Drop (airborne) | `↓` / `S` | Swipe down / ▼ button |
| Pause / Resume | `P` / `Esc` | — |

---

## Running Locally

### Option 1 — Open directly (simplest)

Double-click **`index.html`** in your file manager.  
Most browsers allow `file://` access for this project (all assets are inline or same-origin).

### Option 2 — Local web server (recommended for full feature fidelity)

```bash
# Python 3
python3 -m http.server 8080
# then open http://localhost:8080

# Node.js (npx)
npx serve .
# then open the printed URL
```

---

## Running Tests

### Prerequisites

```bash
# From the project root (where package.json lives):
npm install
npx playwright install chromium
```

Node.js 18+ and Chromium are required.

### Headless simulation tests (fast — no browser needed)

```bash
node tests/headless-sim.js
```

Runs **76 checks** covering physics, power-ups, glitch events, cosmetics, achievements, missions, and fast-drop. Expected output ends with:

```
SESSION 5 FAST-DROP LOGIC: ALL PASSED
```

### Full browser regression tests (requires Chromium)

```bash
node tests/browser-test.js
```

Runs **118 checks** using Playwright: DOM integrity, screen transitions, gameplay, shop, pause/resume, settings persistence, cosmetics, achievements, missions, and fast-drop.

---

## Deploying to GitHub Pages

1. Push this folder to the **root of a GitHub repository** (e.g. `main` branch, `/` root).
2. Go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch**, select `main`, folder `/` (root).
4. Click **Save**. GitHub will publish the site at `https://<username>.github.io/<repo>/`.
5. Open the URL — no build step required.

---

## Project Structure

```
glitch-run/
├── index.html          # Single HTML entry point — all screens are here
├── css/
│   └── style.css       # Neon cyberpunk styles, shop grid, responsive layout
├── js/
│   ├── config.js       # Tunable game constants (speeds, gravity, power-up durations, etc.)
│   ├── storage.js      # localStorage wrapper with transaction support and corruption recovery
│   ├── audio.js        # Web Audio API synthesizer (zero external files)
│   ├── input.js        # Keyboard + touch input handling, fast-drop state
│   ├── player.js       # Player physics, jump, fast-drop, collision shape
│   ├── world.js        # Obstacle generation, fragment spawning, scrolling
│   ├── powerups.js     # Slow-mo, shield, magnet logic
│   ├── events.js       # Glitch event director (storm, surge, gravity, corrupt)
│   ├── fx.js           # Particle system, screen shake, fast-drop trail
│   ├── cosmetics.js    # Skin and trail catalogue, buy/equip logic
│   ├── progress.js     # Achievements and daily missions engine
│   ├── screens.js      # UI screens (menu, shop, settings, missions, achievements, pause, game-over)
│   ├── game.js         # Main game loop, state machine, score, coin banking
│   └── main.js         # Bootstrap, resize, screen-state dispatch
└── tests/
    ├── headless-sim.js # 76-check Node.js simulation suite
    └── browser-test.js # 118-check Playwright browser suite
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full session-by-session history.

---

## Known Limitations

- No audio on the first page load until the user performs a gesture (browser autoplay policy). Audio unlocks automatically on the first click or keypress.
- The `Corrupt Display` glitch event uses CSS visual distortion. Reduced Motion mode disables distortion but keeps the gameplay effect active.
- Physical device testing was not performed. Responsive behaviour was validated via Playwright viewport emulation at 1280×720, 851×393, and 568×320.
- No save-file export/import. Progress lives in `localStorage` and will be lost if the browser storage is cleared.

---

## Credits

Built with ❤️ using pure HTML5, CSS3, and Vanilla JS — no frameworks, no bundlers, no dependencies at runtime.
