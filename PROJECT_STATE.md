# GLITCH RUN — PROJECT_STATE

## Architecture
Classic `<script>` tags + one global namespace `GR` (no ES modules, so `index.html` works by double-click on file://).
Logical canvas 800x450, scaled by CSS. One `requestAnimationFrame` loop: `update(dt)` (gameplay, power-up/event timers, only while playing) -> `visual(dt)` (particles, shake, fades, stars; frozen while paused) -> shop preview (only in the shop) -> `render()`.
States: `menu <-> settings | shop | achievements | missions`, `menu -> playing <-> paused -> over -> (playing | menu)`.
Banking rule: a run's fragments/score are saved exactly once — on death, RESTART/MENU from pause, or page close (`runActive` guard). Session 4 adds achievements + missions to that same once-per-run step.

## File responsibilities
- index.html — canvas, overlay screens (menu, pause, over, settings, shop, achievements, missions), script order
- css/style.css — layout, neon UI, fades, settings toggles, menu grid, shop/achievement/mission pages, scrollable lists, modal
- js/config.js — constants, `CFG.POWER`, `CFG.DIRECTOR` (tests set `window.GR_NO_DIRECTOR`)
- js/storage.js — localStorage wrapper. Per-key cleaners for every field (scores, coins, settings, equipped/owned cosmetics, achievements, progress counters, missions); `txn(fn)` = all-or-nothing change on a copy + one write; `add()` rejects negative/NaN/string amounts
- js/input.js — keyboard/tap/primary mouse, jump buffer; Space on a focused button now activates the button (keyboard menu use)
- js/player.js, js/world.js, js/powerups.js, js/events.js, js/fx.js — gameplay, power-ups, glitch events, particles (Session 3 behaviour unchanged; fx.js gained directional particles for trails, events.js an `onStart` hook)
- js/cosmetics.js — NEW skin/trail catalogue, atomic `buy`/`equip`, shared `drawPlayer`, trail emitters, shop preview renderer. Not referenced by any gameplay file (checked by a test)
- js/progress.js — NEW run tracking, 11 achievements, deterministic daily missions, one-transaction `finishRun`
- js/screens.js — NEW DOM rendering + click handling for Shop / Achievements / Missions, game-over and menu notices
- js/game.js — state machine, loop, scoring, banking (+ progression hook), rendering; skin drawn via Cosmetics; trails emitted from `update`
- js/main.js — screen toggling, ONE delegated click listener, settings switches, post-death click guard
- tests/headless-sim.js — Node logic + fairness tests (Sessions 1-4)
- tests/browser-test.js — real-Chromium tests (needs `npm i playwright` + `npx playwright install chromium`)

## Session 4 — features
**Coin economy.** Coins = fragments banked once per run (unchanged) + mission rewards. Shown on the menu, shop and missions screens. Purchases and rewards go through `Storage.txn`, which validates against the stored balance inside the transaction: no overspend, no negative balance, no double purchase, no double reward. Corrupted saves are sanitized per key (wrong types, negatives, huge numbers, bad ids, non-arrays) and salvageable parts are kept.
**Shop.** 5 skins (Glitch Magenta default, Neon Cyan 80, Toxic Lime 150, Solar Flare 250, Ghost Protocol 400) and 4 trails (No Trail default, Ember Sparks 100, Pixel Dust 180, Ion Comet 300). Each row shows price/LOCKED, OWNED or EQUIPPED text (not colour alone). PREVIEW shows the item on a live canvas before buying (animated trail; static dots under Reduced Motion). BUY opens a confirmation dialog (item, price, balance after) with CONFIRM / CANCEL (Esc closes it first); feedback line announces results (`aria-live`). Not enough coins shows how many more are needed. Purchases and equipped items persist. Cosmetics only change colours/extra particles: hitboxes, physics and balance are untouched. Trails are fewer/absent under Reduced Motion (particle budget).
**Achievements (11).** First run, 50/250 total fragments, score 1,000/3,000, survive 45/90 s, use all three power-ups, survive a collision with a shield, 5/20 glitch events. Progress bars, LOCKED/UNLOCKED text, summary count; unlock messages appear once on the game-over screen (or on the next menu visit if the run was abandoned). Stored in one flag map, so repeats are impossible. "Completed run" = a run that ended in a collision; abandoned runs still count fragments/time/score.
**Daily missions.** Three per local calendar day (DATA RUN fragments, UPTIME TEST survive, SCORE ATTACK score), chosen deterministically from the local date (hash) — same missions all day, different targets/rewards on other days (54+ distinct sets over 400 days), rewards 25-70 coins. Progress and paid flags live with the day; a new day resets them; viewing never writes. No server, no global sync.
**UI.** Menu has PLAY + 2x2 grid (Shop, Missions, Achievements, Settings). Every page has BACK TO MENU and Esc. Lists scroll inside their own box (page never scrolls), touch scrolling enabled, focus rings, ARIA roles/labels/live regions. Gameplay HUD code is unchanged (verified by diff: the only change is the "no HUD on menu-type screens" guard).

## Files changed in Session 4
New: js/cosmetics.js, js/progress.js, js/screens.js. Modified: js/storage.js (rewritten, same get/set/add API + txn), js/game.js, js/main.js, js/input.js, js/fx.js, js/events.js, index.html, css/style.css, tests/headless-sim.js, tests/browser-test.js, PROJECT_STATE.md. Unchanged: config.js, player.js, world.js, powerups.js. The Session 3 ZIP was not modified.

## Checks actually performed (final run)
- `node --check` on all JS files: pass.
- `node tests/headless-sim.js` (65 checks): all Session 1-3 checks plus 36 new Session 4 logic checks. Corrupted-save handling (6 hostile shapes), transaction rollback/commit/one write, negative-balance guard, buy/double-buy/insufficient funds/unknown ids/equip rules/reload persistence, 5,000-action fuzz (money conserved, never negative), cosmetics isolation from gameplay files, every achievement threshold and no re-award, abandoned-run accounting, mission determinism and rotation over 400 days, reward-paid-once, date rollover, view-does-not-write, backwards clock, corrupted mission data.
- `node tests/browser-test.js`: real headless Chromium 141 over `file://`; 114 checks; all Session 1-3 checks pass unchanged (random director off for determinism) plus J1-J29 and K1-K6 for Session 4: navigation/Esc, coin display, price/state text, insufficient funds, confirm/cancel, triple-click and spam protection, preview colour and animated trail, equip + persistence after reload, in-game skin pixel and trail particles, banking once per run with spam-clicking, abandoned runs, achievement screen, mission pay-once, date rollover and backwards clock (via a test-only `GR.Progress.now` override), restart cleanup, corrupted saves, 45 page visits with a single loop/handler, landscape-phone layout, scrolling on a small phone, touch purchase.
- Screenshots of the shop (desktop and landscape phone) were inspected; a stretched preview canvas found there was fixed (CSS) and the suite rerun.

## Bugs found and fixed during Session 4
1. Shop preview canvas was stretched (global `canvas{height:100%}` overrode its aspect ratio) -> fixed.
2. Test-side only: wrong expectations about mission rewards (100 forced fragments also complete SCORE ATTACK), a mis-indexed corruption case, a missing purchase step, variable-name clashes.
3. Shop Preview UI & Layout overlap:
   - Root causes: `.item .nm` had `min-width: 0; flex: 1`, collapsing to 0px and overflowing text onto `.item .st`; button label grew to `PREVIEWING` expanding button width into adjacent elements; `.previewbox` unconstrained width squeezed the list.
   - Fixed by converting `#shopList .item` to a 4-column 2-row CSS Grid (`auto 1fr minmax(5.6em, auto) minmax(5.6em, auto)`), placing Status/Price on row 2 below Name (row 1), keeping the Preview button label as `PREVIEW` with neon-yellow border/glow/pressed state (`.pv-active`), constraining the preview box, and widening the desktop shop layout to 920px.
   - All 65 headless tests and 114 Chromium browser tests pass cleanly. Verified across desktop (1280x720), tablet (1000x600), and mobile landscape (851x393 and 568x320).

## Session 4 UI Fix — Summary of Changes
- `css/style.css`: Structured CSS Grid for `#shopList .item`, stable button dimensions, `.pv-active` neon yellow indicator, balanced `.previewbox` and `#shop header` width, responsive stacking query.
- `js/screens.js`: Fixed preview button to retain `PREVIEW` label in both states while toggling `.pv-active` class and `aria-pressed`.
- Regression testing: `node tests/headless-sim.js` (65/65 pass), `node tests/browser-test.js` (114/114 pass).

## Known limitations / not verified
- Not tested on Safari, Firefox or physical phones (Chromium + emulated touch only). Screen-reader behaviour was not tested; ARIA attributes and focus handling are present but unverified with real assistive tech.
- Local-only by design: players can edit localStorage or change the device clock to gain coins or re-earn missions (a clock set backwards starts a fresh mission day). There is no anti-cheat and no sync between devices.
- If a mobile OS kills the tab without `pagehide`, an in-progress run (fragments, achievements) can be lost.
- Mission/achievement messages for runs abandoned mid-session appear on the next menu visit, not instantly.
- Trails are mostly suppressed under Reduced Motion (particle budget).
- Prices and mission rewards are untested for fun/balance with real players (about one coin per fragment).
- No coin rewards for achievements; no unlock-by-achievement cosmetics (not requested).
- Test-only hooks: `GR.Progress.now`, `GR.Power.give`, `GR.Events.force`, `GR.Game.stats()`, `window.GR_NO_DIRECTOR`.

## Launch
Unzip, open `glitch-run/index.html` in Chrome/Edge/Firefox, or `cd glitch-run && python3 -m http.server` and visit http://localhost:8000.

## Manual test checklist
1. Menu: coins shown; SHOP / MISSIONS / ACHIEVEMENTS / SETTINGS each open and return (button + Esc).
2. Play 2-3 runs and die: game-over screen lists "+N COINS BANKED"; first death shows "ACHIEVEMENT UNLOCKED: BOOT SEQUENCE" once.
3. Shop: PREVIEW a skin and a trail (live canvas); BUY something too expensive (message with shortfall); BUY an affordable item -> confirmation -> CONFIRM; try CANCEL and Esc; double-click CONFIRM and confirm you are charged once.
4. EQUIP a skin and a trail, reload the page: purchases, equipped items and coins persist. Start a run: new colours and trail particles appear; jumping/hitboxes feel identical.
5. Missions: three missions with progress and rewards; complete one and verify the coin reward appears once; replay and confirm it is not paid again the same day.
6. Date rollover (optional): change the system date to tomorrow, reload: new missions with 0 progress.
7. Achievements: progress bars, locked/unlocked text, counts.
8. Phone (landscape): shop/missions/achievements lists scroll, back button reachable, touch buy works; keyboard users can Tab to a button and press Space/Enter.
9. Settings: Reduced motion ON -> trails reduced, preview static.

## Session 5 — Fast-Drop / Quick-Land Mechanic
- **Objective:** Quick downward descent while airborne allowing the player to return to ground level rapidly to snatch power-ups and data fragments, and navigate tight obstacle corridors.
- **Controls:**
  - Keyboard: `ArrowDown` or `KeyS` while airborne activates fast-drop.
  - Ground guard: Pressing Down while grounded is safely cleared and causes no movement or control interference.
  - Mobile touch: Dedicated `#dropBtn` (`v`) in bottom-right corner during play, plus downward swipe gesture on the game canvas.
- **Physics & Kinematics:**
  - Configurable terminal downward velocity: `CFG.DROP_V = 1100` px/s.
  - Snappy downward impulse: If rising (`vy < 400`), velocity immediately snaps to at least 400 px/s downward, and accelerates at `2.8 * GRAVITY * gMult` towards `DROP_V`.
  - Normal landing: Floor collision automatically deactivates fast-drop (`dropping = false`, `onGround = true`) and sets `fastDropped = true` for feedback.
  - Collision fairness: Cannot bypass obstacles or ground (no tunneling, no invulnerability).
  - Compatibility: Integrates seamlessly with slow-motion (`timeScale` scaling) and `GRAVITY ERROR` (`gMult = 1.25`).
- **Visual Feedback:**
  - Subtle upward-drifting wind/energy particle trail behind the player while fast-dropping.
  - Satisfying landing dust burst and mild screen shake (`addShake(2.5)`), fully respecting Reduced Motion and Screen Shake settings.
- **Checks Performed:**
  - `node tests/headless-sim.js`: 76 checks passed (including D1-D11 fast-drop suite).
  - `node tests/browser-test.js`: 118 checks passed (including L1-L4 browser fast-drop suite).
  - Validated fast-drop from jump start, mid-ascent, and apex.
  - Verified touch `#dropBtn` and keyboard `ArrowDown` activation.

## Session 6 — Final Polish, QA and Release

### Audio (Phase 3)
- **`js/audio.js` created** — Web Audio API synthesizer, zero external files.
  - Sounds: `jump`, `drop` (fast-drop start), `land` (fast-drop land), `fragment`, `powerup`, `shieldBreak`, `die`, `buy`, `unlock`.
  - Respects `GR.Storage.get('sfx')` at play-time; unlocks ctx on first user gesture.
  - Graceful fallback: `try/catch` wraps all synthesis; `null` ctx in Node/headless is safe.
- `index.html` — `js/audio.js` loaded after `storage.js`, before `input.js`.
- `js/game.js` — `GR.Audio.play()` wired at: jump, fast-drop activation, landing, fragment collect, power-up pickup, shield break, death, achievement unlock.
- `js/screens.js` — `GR.Audio.play('buy')` on confirmed shop purchase.

### Documentation (Phase 6)
- `README.md` created — controls, features, local launch, test instructions, GitHub Pages deployment, project structure.
- `CHANGELOG.md` created — full session-by-session history (Sessions 1–6).

### Checks actually performed (Session 6 final run)
- `node --check` on all 16 JS files: all pass (0 syntax errors).
- `node tests/headless-sim.js`: **76/76 checks pass** — all Sessions 1–5 suites including D1–D11 fast-drop.
- `node tests/browser-test.js`: **118/118 checks pass** — A1–A9, B1–B4, C1–C6, D1–D3, E, F, G1–G3, H1–H19, I1–I19, J1–J29, K1–K6, L1–L4, Z (no console errors).

### Final release
- `glitch-run-final.zip` — complete runnable project (index.html, css/, js/, tests/, README.md, CHANGELOG.md, PROJECT_STATE.md). No node_modules.
- Session 5 backup (`d:\Downloads\glitch-run-session5.zip`) is untouched.

## Session 7 — Background Music & Audio Polish

### Background Music & Audio Engine (`js/audio.js`)
- **Synthwave Music Loop**: 8-bar electronic synthwave track (116 BPM, D minor) rendered in memory with `OfflineAudioContext`.
  - Zero external files, zero network calls, zero runtime libraries.
  - Features rolling 16th-note synth bass, melodic arpeggios, atmospheric pads, and synthesized drums (kick, snare, hi-hat).
  - Single `AudioBufferSourceNode` with `loop = true` for sample-accurate, gapless playback.
  - Zero CPU overhead or node leaks during gameplay.
- **Dynamic Game-State Ducking**:
  - `playing`: 100% volume, open filter (20 kHz).
  - `paused`: gracefully ducks to 22% volume with a 750 Hz low-pass muffle filter.
  - `over`: ducks to 35% volume (1200 Hz).
  - `menu`, `settings`, `shop`, `achievements`, `missions`: 65% volume (16 kHz).
  - Pop-free exponential transitions using `setTargetAtTime`.
  - Restarts, unpause, and menu transitions never duplicate music playback.
- **Independent Audio Controls & Storage**:
  - `SOUND EFFECTS: ON/OFF` and `BACKGROUND MUSIC: ON/OFF` toggles.
  - `MUSIC VOL: 40%` and `SFX VOL: 80%` stepped volume cycles (20% to 100%).
  - Persisted in `localStorage` under `glitchrun.v1` (`music`, `musicVol`, `sfxVol`) with backward compatibility, fallbacks, and range clamping.
  - Changing volume or toggles takes effect immediately; turning off music does not mute SFX, and vice versa.
  - Autoplay compliance: context unlocks on first user gesture; handles suspended contexts.
- **Audio Wiring & SFX Polish**:
  - Fast-drop dive: `drop` sound when airborne drop activates (`player.justDropped`).
  - Fast-drop landing: `land` sound on landing (`player.fastDropped`).
  - Shield break: `shieldBreak` sound on collision absorption.
  - Slow-motion: `slowStart` time-dilation pitch drop on pickup, `slowEnd` restore sweep on expiry.
  - Data Magnet: `magnetStart` dual-pulse electric warble.
  - Achievement unlock: `unlock` 4-note ascending fanfare.
  - Daily mission completion: `mission` rewarding bright coin chime.
  - Shop purchase: `buy` digital credit transfer chime.
  - Game over & High Score: `die` crash powerdown sound, plus `newBest` celebratory victory fanfare on record score.

### Checks Actually Performed (Session 7)
- `node --check` on all 16 JS files: all pass (0 syntax errors).
- `node tests/headless-sim.js`: **83/83 checks pass** (includes U1–U7 audio logic, clamping, sanitization, and state checks).
- `node tests/browser-test.js`: **126/126 checks pass** (includes M1–M8 audio controls, persistence, volume cycling, and state transition checks).

### Known Limitations
- Audio requires a user gesture (click/key/tap) before starting as mandated by browser autoplay policies.
- Tested in Playwright Chromium across desktop and mobile viewports; physical device audio was not tested.
- Direct `file://` execution verified and fully functional.
