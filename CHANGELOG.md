# Changelog — GLITCH RUN

All notable changes to this project are documented here, grouped by development session.

---

## [Session 7] — Background Music & Audio Polish

### Added
- **Synthesized Synthwave Background Music** (`js/audio.js`):
  - 8-bar electronic synthwave music loop (116 BPM, D minor) generated in memory via `OfflineAudioContext`
  - Zero audio files, zero network requests, zero library dependencies
  - Seamless loop using single `AudioBufferSourceNode` with hardware playback and zero runtime node allocation overhead
  - Multi-layered composition: 16th-note rolling synth bass, melodic cyber arpeggios, atmospheric pads, and synthesized percussion (kick, snare, hi-hat)
- **Dynamic Audio State Ducking**:
  - Gameplay: full configured music volume and open frequencies (20 kHz)
  - Paused: graceful volume reduction to ~22% and low-pass muffle filter (750 Hz)
  - Game Over: smooth volume ducking to ~35% (1200 Hz)
  - Menu / Pages: gentle volume ducking to ~65% (16 kHz)
  - Seamless volume and filter sweeps using `setTargetAtTime` without audio pops or clicks
  - Single loop preservation across restart, pause, and menu transitions without audio duplication
- **Independent Audio Controls & Persistence**:
  - Independent `SOUND EFFECTS: ON/OFF` and `BACKGROUND MUSIC: ON/OFF` toggles
  - `MUSIC VOL: 40%` (cycles 20%, 40%, 60%, 80%, 100%)
  - `SFX VOL: 80%` (cycles 20%, 40%, 60%, 80%, 100%)
  - Persisted in `localStorage` under `glitchrun.v1` (`music`, `musicVol`, `sfxVol`) with backward compatibility, fallbacks, and range sanitization
  - Turning music off does not affect sound effects; turning sound effects off does not affect music
  - Volume and toggle changes take effect immediately
- **Audited & Enhanced Sound Effects**:
  - Fast-drop dive activation: `drop` sound when airborne drop initiates
  - Fast-drop landing: `land` punchy low thud
  - Shield breaking: `shieldBreak` crisp metallic crack and low rumble
  - Slow-motion: `slowStart` time-dilation pitch sweep down, and `slowEnd` speed restore sweep up
  - Data Magnet: `magnetStart` dual-tone electric warble pulse
  - Achievement unlock: `unlock` 4-note ascending fanfare
  - Daily mission completion: `mission` rewarding bright coin chime
  - Shop purchase: `buy` digital credit transfer chime
  - Game over & High Score: `die` 8-bit power-down crash, plus `newBest` celebratory victory fanfare
- **Automated Regression Test Suite**:
  - 7 new Session 7 logic checks added to `tests/headless-sim.js` (U1–U7): 83/83 total pass
  - 8 new Session 7 browser tests added to `tests/browser-test.js` (M1–M8): 126/126 total pass

---

## [Session 6] — Final Polish, QA and Release

### Added
- **Web Audio SFX** (`js/audio.js`) — synthesized sound effects via Web Audio API, zero external files
  - Tones for: jump, fast-drop land, fragment collect, power-up activation, shield break, game over, shop purchase, achievement unlock
  - Respects the Sound Effects toggle in Settings; unlocks on first user gesture (browser autoplay policy)
  - Graceful fallback: no crash if browser does not support Web Audio

### Changed
- `js/game.js` — wired `GR.Audio.play()` calls at every relevant game event
- `js/screens.js` — `GR.Audio.play('buy')` on confirmed shop purchase
- `index.html` — `audio.js` added to script loading order (after `storage.js`, before `input.js`)

### Testing (Session 6)
- All 76 headless-sim checks pass (syntax-verified, full suite run)
- All 118 browser regression checks pass
- Syntax check clean across all 16 JS files

---

## [Session 5] — Fast-Drop / Quick-Land Mechanic

### Added
- **Fast-drop mechanic** — press `↓` / `S` while airborne for a controlled, rapid descent
  - `CFG.DROP_V = 1100` — configurable max downward velocity in `config.js`
  - Visual downward particle trail emitted during fast-drop
  - Mobile: swipe-down gesture and on-screen ▼ button
  - Works correctly during slow-motion and Gravity Error events
  - Deactivates on landing; resets on restart/game-over
  - Cannot bypass collision detection

### Changed
- `js/input.js` — `dropQueued` flag, `ArrowDown`/`KeyS` binding, swipe detection, drop button
- `js/player.js` — `dropping`, `fastDropped` state, velocity clamping, reset logic
- `js/game.js` — fast-drop physics integration per frame, feedback particle emission
- `js/fx.js` — downward trail particle type
- `index.html` — mobile ▼ button element

### Testing (Session 5)
- D1–D11 fast-drop simulation tests (11 checks) — all pass
- L1–L4 browser fast-drop tests — all pass
- All prior headless and browser checks continue to pass

---

## [Session 4 UI Fix] — Shop Preview UI and Layout

### Fixed
- Shop item rows rebuilt with CSS Grid — name/price, Preview button, and Buy/Equip button each get defined space
- Preview button label remains `PREVIEW` in both states; active preview indicated by a neon glow/border
- No horizontal overflow at any tested viewport
- Long skin/trail names wrap without overlapping buttons

### Testing
- Browser screenshot validation at 1280×720, 851×393, and 568×320
- All shop purchase / preview / equip flows re-verified

---

## [Session 4] — Cosmetic Progression, Achievements and Daily Missions

### Added
- **Cosmetic shop** — 4 purchasable skins and 3 trails; coin-based economy
- **Achievements** — 10 achievements (BOOT SEQUENCE, DATA SCRAPER, DATA HOARDER, SPEED DEMON, FULL SPECTRUM, IRON WILL, GLITCH WITNESS, SYSTEM ERROR, COIN COLLECTOR, SURVIVOR)
- **Daily Missions** — 3 rotating objectives per calendar day with coin rewards; single-run and cumulative types
- `js/cosmetics.js` — buy/equip/catalogue logic with full transaction safety
- `js/progress.js` — achievement and mission engine with robust persistence

### Changed
- `js/screens.js` — shop, achievements, missions, and pause screens added/expanded
- `js/storage.js` — transaction API (`txn(fn)`) to ensure atomic multi-key writes

### Testing
- S1–S6 storage tests, C1–C10 cosmetics tests, A1–A10 achievement tests, M1–M10 mission tests — all pass

---

## [Session 3] — Power-ups, Glitch Events and Particle FX

### Added
- **Power-ups** — Slow-Motion, Shield, Data Magnet with spawn director and visual indicators
- **Glitch Events** — Data Storm (fragment surge), Speed Surge, Gravity Error, Corrupt Display
- **Particle system** (`js/fx.js`) — trail, explosion, magnet ring, screen shake; reduced-motion budget
- `js/powerups.js` — power-up state machine, magnet physics, stacking prevention
- `js/events.js` — event director with warning phases, cooldowns, and fair fairness constraints

### Testing
- P1–P6 power-up tests, W1–W2 world tests, M1–M2 magnet tests, E1–E12 event tests, F1–F2 fuzz tests, B1–B3 balance tests — all pass

---

## [Session 2] — Score, Coins, Settings and Persistence

### Added
- Score system (distance-based), best-score tracking
- Coin economy — fragments award coins banked at end of run
- Settings screen — Screen Shake, Sound Effects, Reduced Motion, particle quality toggles
- `localStorage` persistence via `js/storage.js`
- Screen transitions: menu → playing → pause → game-over → retry/menu

### Testing
- Core game loop, settings persistence, and screen-state tests verified

---

## [Session 1] — Core Gameplay

### Added
- HTML5 Canvas endless runner skeleton
- Player physics — jump, gravity, ground collision
- Obstacle generation and scrolling world
- Fragment (data shard) collection
- Neon cyberpunk visual theme (`css/style.css`)
- Game loop with `requestAnimationFrame`
