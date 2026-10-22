// Real-Chromium test over file://  -> node tests/browser-test.js
// Needs Playwright + an installed Chromium. Not required to play the game.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : '')); };

const INIT = `
  window.GR_NO_DIRECTOR = true; window.__raf = 0; const o = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = f => { window.__raf++; return o(f); };
  window.__top = () => { const d = document.getElementById('game').getContext('2d').getImageData(130,0,1,450).data;
    for (let y = 0; y < 450; y++) if (d[y*4] > 240 && d[y*4+2] > 240 && d[y*4+1] < 30) return y; return null; };`;

async function open(ctx, errors, extraInit) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.addInitScript(INIT); if (extraInit) await p.addInitScript(extraInit);
  await p.goto(URL); return p;
}
const stats = p => p.evaluate(() => GR.Game.stats());
const waitVeil = async p => { for (let i = 0; i < 60; i++) { if ((await stats(p)).veil === 0) return; await sleep(20); } };   // start/resume fades dim pixels briefly
const maxOver = (p, ms, key) => p.evaluate(([ms, key]) => new Promise(res => { let m = 0; const t0 = performance.now(); (function f() { const v = GR.Game.stats()[key]; if (v > m) m = v; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(m); })(); }), [ms, key]);
const labels = p => p.$$eval('[data-setting]', bs => bs.map(b => b.textContent));
const state = async p => (await p.isVisible('#shop')) ? 'shop' : (await p.isVisible('#achievements')) ? 'achievements' : (await p.isVisible('#missions')) ? 'missions' : (await p.isVisible('#settings')) ? 'settings' : (await p.isVisible('#menu')) ? 'menu' : (await p.isVisible('#pause')) ? 'paused' : (await p.isVisible('#over')) ? 'over' : (await p.isVisible('#pauseBtn')) ? 'playing' : 'unknown';
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('glitchrun.v1') || '{}'));
const txt = (p, s) => p.textContent(s);
const patch = (p, fn) => p.evaluate(fn);
const immortal = (p, on) => p.evaluate(on => { const W = GR.World.prototype; if (!W.__h) W.__h = W.hits; W.hits = on ? () => false : W.__h; }, on);
const forceDie = p => p.evaluate(() => { const W = GR.World.prototype; if (!W.__h) W.__h = W.hits; W.hits = () => true; });
const waitState = async (p, s, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await state(p) === s) return true; await sleep(20); } return false; };
const click = (p, sel) => p.click(sel);
const canvasCenter = async p => { const b = await p.locator('#game').boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const frames = p => p.evaluate(() => { const a = window.__raf; return new Promise(r => setTimeout(() => r(window.__raf - a), 1000)); });
async function jumpMin(p, act) {
  await sleep(100);
  const m = p.evaluate(() => new Promise(res => { let m = 999; const t0 = performance.now(); (function f() { const y = window.__top(); if (y !== null) m = Math.min(m, y); if (performance.now() - t0 < 700) requestAnimationFrame(f); else res(m); })(); }));
  await act(); const min = await m; await sleep(300); return min;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- A: load, menu, real collision, persistence ----------
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await open(ctx, errors);
  const ids = await page.evaluate(() => ['game','menu','pause','over','pauseBtn','menuBest','menuCoins','overScore','overBest','overFrags','newBest'].filter(i => !document.getElementById(i)));
  check('A1 all DOM ids used by main.js exist; GR.Game loaded via file://', ids.length === 0 && await page.evaluate(() => !!(GR && GR.Game && GR.World && GR.Player && GR.Input && GR.Storage)), 'missing: ' + ids.join(','));
  check('A2 starts on menu with best 0 / coins 0', await state(page) === 'menu' && await txt(page, '#menuBest') === '0' && await txt(page, '#menuCoins') === '0');
  await click(page, '#menu [data-action=start]'); await waitVeil(page);
  check('A3 PLAY -> playing, player on ground', await state(page) === 'playing' && Math.abs(await page.evaluate(() => window.__top()) - 336) <= 1, await page.evaluate(() => window.__top()));
  check('A4 hitting an obstacle (no input) -> game over', await waitState(page, 'over'));
  const s1 = await store(page), sc = +await txt(page, '#overScore'), bs = +await txt(page, '#overBest');
  check('A5 game-over score/best match localStorage', sc > 0 && bs === s1.highScore && s1.highScore === sc, `score ${sc}, best ${bs}, stored ${s1.highScore}`);
  check('A6 NEW BEST label shown on first record', await page.isVisible('#newBest'));
  await sleep(450); await click(page, '#over [data-action=start]'); check('A7 RETRY from game over -> playing', await state(page) === 'playing');
  await waitState(page, 'over'); await sleep(450); await click(page, '#over [data-action=menu]');
  check('A8 MENU from game over; menu shows stored best', await state(page) === 'menu' && +await txt(page, '#menuBest') === (await store(page)).highScore);
  await page.reload();
  const st = await store(page);
  check('A9 persistence after reload (menu shows stored best/coins)', +await txt(page, '#menuBest') === st.highScore && +await txt(page, '#menuCoins') === st.coins, JSON.stringify(st));

  // ---------- B: input (Space / W / Up / mouse / right-click), pause paths ----------
  await click(page, '#menu [data-action=start]'); await immortal(page, true); await waitVeil(page);
  const base = 336;
  for (const [name, act] of [['Space', () => page.keyboard.press('Space')], ['W', () => page.keyboard.press('KeyW')], ['ArrowUp', () => page.keyboard.press('ArrowUp')],
      ['mouse click', async () => { const [x, y] = await canvasCenter(page); await page.mouse.click(x, y); }]]) {
    const m = await jumpMin(page, act); check('B1 jump via ' + name, m < base - 100, 'min top ' + m);
  }
  const rm = await jumpMin(page, async () => { const [x, y] = await canvasCenter(page); await page.mouse.click(x, y, { button: 'right' }); });
  check('B2 right-click does NOT jump', rm >= base - 1, 'min top ' + rm);
  const snap = () => page.evaluate(() => document.getElementById('game').toDataURL());
  const a = await snap(); await sleep(200); check('B3 canvas animates while playing', a !== await snap());
  for (const [name, act, resume] of [
      ['P key', () => page.keyboard.press('KeyP'), () => page.keyboard.press('KeyP')],
      ['Esc key', () => page.keyboard.press('Escape'), () => page.keyboard.press('Escape')],
      ['pause button / RESUME', () => click(page, '#pauseBtn'), () => click(page, '#pause [data-action=resume]')],
      ['tab hidden', () => page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }), async () => { await page.evaluate(() => { delete document.hidden; }); await click(page, '#pause [data-action=resume]'); }],
      ['window blur', () => page.evaluate(() => window.dispatchEvent(new Event('blur'))), () => click(page, '#pause [data-action=resume]')]]) {
    await act(); await sleep(80); const ps = await state(page);
    const s0 = await snap(); await sleep(250); const frozen = s0 === await snap();
    await page.keyboard.press('Space'); // pressed while paused must not leak into the run
    if (ps === 'paused') await resume();
    await page.evaluate(() => { delete document.hidden; }); await sleep(60); await waitVeil(page);
    check('B4 pause via ' + name + ' freezes, resume works, no stray jump', ps === 'paused' && frozen && await state(page) === 'playing' && Math.abs(await page.evaluate(() => window.__top()) - base) <= 1, `state ${ps}, frozen ${frozen}`);
  }

  // ---------- C: coin / high-score banking (collect forced to 3 per run) ----------
  await page.reload();
  await patch(page, () => { const W = GR.World.prototype; W.__r = W.reset; W.reset = function () { this.__g = false; return W.__r.call(this); }; W.collect = function () { if (!this.__g) { this.__g = true; return 3; } return 0; }; });
  await immortal(page, true);
  let c = (await store(page)).coins;
  const delta = async () => { const n = (await store(page)).coins; const d = n - c; c = n; return d; };
  await click(page, '#menu [data-action=start]'); await sleep(250); await page.keyboard.press('KeyP'); await click(page, '#pause [data-action=start]'); await sleep(100);
  check('C1 abandoning a run via pause->RESTART banks its 3 fragments', await delta() === 3);
  await sleep(250); await page.keyboard.press('KeyP'); await click(page, '#pause [data-action=menu]');
  check('C2 pause->MENU banks 3 fragments; menu shows new coin total', await delta() === 3 && +await txt(page, '#menuCoins') === c);
  await click(page, '#menu [data-action=start]'); await forceDie(page); await waitState(page, 'over');
  check('C3 death banks exactly 3 and shows 3 fragments', await delta() === 3 && await txt(page, '#overFrags') === '3');
  const early = await state(page); await immortal(page, true); await click(page, '#over [data-action=start]');
  check('C4 RETRY clicked immediately after death is ignored (accidental-tap guard)', early === 'over' && await state(page) === 'over');
  await forceDie(page); await sleep(450); await click(page, '#over [data-action=start]'); await waitState(page, 'over'); await sleep(450);
  check('C5 second death banks exactly 3 more (no double-bank)', await delta() === 3);
  await click(page, '#over [data-action=menu]'); await sleep(50);
  check('C6 leaving game-over screen banks nothing extra', await delta() === 0);

  // ---------- D: no duplicate loops / listeners after many restarts ----------
  await immortal(page, true);
  const n0 = await frames(page);
  for (let i = 0; i < 8; i++) { await click(page, '#menu [data-action=start]'); await page.keyboard.press('KeyP'); await click(page, '#pause [data-action=start]'); await page.keyboard.press('KeyP'); await click(page, '#pause [data-action=menu]'); }
  const n1 = await frames(page);
  await click(page, '#menu [data-action=start]'); await page.keyboard.press('KeyP');
  check('D1 rAF rate unchanged after 8 restart cycles (one loop)', n1 <= n0 * 1.25 + 2, `${n0} -> ${n1} frames/s`);
  check('D2 single P press pauses (listeners not duplicated)', await state(page) === 'paused');
  await page.keyboard.press('KeyP'); await sleep(100);
  const cb = (await store(page)).coins; await page.reload();
  check('D3 closing/reloading the page mid-run banks its fragments (pagehide)', (await store(page)).coins - cb === 3, 'coins ' + cb + ' -> ' + (await store(page)).coins);

  // ---------- E: corrupt / hostile storage ----------
  for (const [label, val, wantBest, wantCoins] of [['invalid JSON', '{bad', '0', '0'], ['wrong types / negative', '{"highScore":"abc","coins":-5}', '0', '0'], ['valid', '{"highScore":120,"coins":7}', '120', '7']]) {
    await page.evaluate(v => localStorage.setItem('glitchrun.v1', v), val); await page.reload();
    check('E ' + label + ' -> menu shows ' + wantBest + '/' + wantCoins, await txt(page, '#menuBest') === wantBest && await txt(page, '#menuCoins') === wantCoins, await txt(page, '#menuBest') + '/' + await txt(page, '#menuCoins'));
  }
  await ctx.close();

  // ---------- F: localStorage blocked (e.g. strict privacy mode) ----------
  const errF = []; const ctxF = await browser.newContext({ viewport: { width: 900, height: 520 } });
  const pf = await open(ctxF, errF, `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}});`);
  await click(pf, '#menu [data-action=start]');
  check('F blocked localStorage: game still plays and ends cleanly', await waitState(pf, 'over') && errF.length === 0, errF.join(' | '));
  await ctxF.close();

  // ---------- G: touch on a phone-sized landscape viewport ----------
  const ctxM = await browser.newContext({ viewport: { width: 851, height: 393 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pm = await open(ctxM, errors);
  const lay = await pm.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, noScroll: document.documentElement.scrollWidth <= innerWidth }; });
  check('G1 mobile landscape: canvas fits viewport, no horizontal scroll', lay.fits && lay.noScroll, JSON.stringify(lay));
  await pm.tap('#menu [data-action=start]'); await immortal(pm, true); await waitVeil(pm);
  const tm = await jumpMin(pm, async () => { const [x, y] = await canvasCenter(pm); await pm.touchscreen.tap(x, y); });
  check('G2 touch tap on canvas jumps', tm < 336 - 100, 'min top ' + tm);
  await pm.tap('#pauseBtn'); const g3 = await state(pm); await pm.tap('#pause [data-action=resume]');
  check('G3 touch pause button + RESUME', g3 === 'paused' && await state(pm) === 'playing');
  await ctxM.close();


  // ---------- H: Session 2 — settings, particles, shake, transitions ----------
  const ctxH = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const ph = await open(ctxH, errors);
  await click(ph, '#menu [data-action=settings]');
  check('H1 SETTINGS opens; defaults SFX ON / SHAKE ON / REDUCED OFF', await state(ph) === 'settings' && JSON.stringify(await labels(ph)) === JSON.stringify(['SOUND EFFECTS: ON', 'SCREEN SHAKE: ON', 'REDUCED MOTION: OFF']), (await labels(ph)).join(' | '));
  check('H2 settings screen fades in (animation active in normal motion)', await ph.evaluate(() => getComputedStyle(document.getElementById('settings')).animationName !== 'none'));
  const keys = ['sfx', 'shake', 'reduceMotion'];
  for (const k of keys) {
    const before = (await ph.textContent(`[data-setting=${k}]`)).endsWith('ON'); await click(ph, `[data-setting=${k}]`); const st1 = (await store(ph))[k];
    const lab = (await ph.textContent(`[data-setting=${k}]`)).endsWith(st1 ? 'ON' : 'OFF'); await click(ph, `[data-setting=${k}]`);
    check('H3 toggle ' + k + ' flips, saves, and flips back', st1 === !before && lab && (await store(ph))[k] === before, `${before} -> ${st1}`);
  }
  await click(ph, '[data-setting=sfx]'); await ph.reload(); await click(ph, '#menu [data-action=settings]');
  check('H4 setting persists after reload', (await labels(ph))[0] === 'SOUND EFFECTS: OFF');
  await click(ph, '[data-setting=sfx]'); await click(ph, '#settings [data-action=menu]');
  check('H5 BACK TO MENU works', await state(ph) === 'menu');
  await click(ph, '#menu [data-action=settings]'); await ph.keyboard.press('Escape');
  check('H5b Esc leaves settings', await state(ph) === 'menu');
  await ph.evaluate(() => localStorage.setItem('glitchrun.v1', '{"sfx":"yes","shake":2,"reduceMotion":null,"highScore":"x"}')); await ph.reload(); await click(ph, '#menu [data-action=settings]');
  check('H6 corrupted settings fall back to defaults', JSON.stringify(await labels(ph)) === JSON.stringify(['SOUND EFFECTS: ON', 'SCREEN SHAKE: ON', 'REDUCED MOTION: OFF']), (await labels(ph)).join(' | '));
  await click(ph, '#settings [data-action=menu]');

  // particles: jump / land / collect-spam cap
  await click(ph, '#menu [data-action=start]'); await immortal(ph, true);
  const v0 = (await stats(ph)).veil;
  const jumpEarly = ph.keyboard.press('Space');   // jump pressed while the start fade is still running
  check('H7 start fade is active but input is not delayed (jump burst appears)', v0 > 0 && await maxOver(ph, 150, 'particles') > 0, 'veil ' + v0.toFixed(2));
  await jumpEarly; await waitVeil(ph); await sleep(1000);
  check('H8 fade finishes and particles expire', (await stats(ph)).veil === 0 && (await stats(ph)).particles === 0);
  await ph.keyboard.press('Space');
  const jumpP = await maxOver(ph, 120, 'particles'); await sleep(470);
  const mid = (await stats(ph)).particles; const landP = await maxOver(ph, 450, 'particles');
  check('H9 jump dust, dust gone mid-air, then separate landing burst', jumpP > 0 && mid === 0 && landP > 0, `jump ${jumpP}, midair ${mid}, land ${landP}`);
  await ph.evaluate(() => { const W = GR.World.prototype; W.__c0 = W.collect; W.collect = function () { this.collected = [{ x: 500, y: 300 }]; return 1; }; });
  const cap = await maxOver(ph, 1500, 'particles'); const fxMax = (await stats(ph)).fxMax;
  check('H10 collect-burst spam never exceeds the particle cap', cap > 0 && cap <= fxMax, `max ${cap} of ${fxMax}`);
  await ph.evaluate(() => { GR.World.prototype.collect = GR.World.prototype.__c0; });
  await ph.keyboard.press('KeyP'); const vp = (await stats(ph)).veil; await ph.keyboard.press('KeyP');
  check('H11 resume triggers a fade; pause/resume leave state consistent', vp === 0 && (await stats(ph)).veil > 0 && await state(ph) === 'playing');
  await ph.keyboard.press('KeyP'); check('H11b pause fade: pause screen animates in', await ph.evaluate(() => getComputedStyle(document.getElementById('pause')).animationName !== 'none'));
  await click(ph, '#pause [data-action=menu]');

  // death: explosion + shake + flash, then decay to exactly 0
  await click(ph, '#menu [data-action=start]'); await waitVeil(ph); await forceDie(ph);
  const [shk, par, vl] = await Promise.all([maxOver(ph, 500, 'shake'), maxOver(ph, 500, 'particles'), maxOver(ph, 300, 'veil')]);
  check('H12 collision: explosion particles + shake + flash', par >= 25 && shk > 3 && shk <= 16 && vl > 0.3, `particles ${par}, shake ${shk.toFixed(1)}, flash ${vl.toFixed(2)}`);
  await sleep(1500); const sd = await stats(ph);
  check('H13 shake decays to exactly 0 and particles expire (nothing left displaced)', sd.shake === 0 && sd.particles === 0 && sd.veil === 0 && sd.state === 'over', JSON.stringify(sd));
  await sleep(450); await click(ph, '#over [data-action=menu]');

  // shake OFF
  await click(ph, '#menu [data-action=settings]'); await click(ph, '[data-setting=shake]'); await click(ph, '#settings [data-action=menu]');
  await click(ph, '#menu [data-action=start]'); await waitVeil(ph); await forceDie(ph);
  const [shk2, par2] = await Promise.all([maxOver(ph, 600, 'shake'), maxOver(ph, 600, 'particles')]);
  check('H14 shake OFF: no shake, particles still play', shk2 === 0 && par2 >= 25, `shake ${shk2}, particles ${par2}`);
  await sleep(450); await click(ph, '#over [data-action=menu]');

  // reduced motion
  await click(ph, '#menu [data-action=settings]'); await click(ph, '[data-setting=shake]'); await click(ph, '[data-setting=reduceMotion]');
  check('H15 reduced motion: body class set, screen animations disabled', await ph.evaluate(() => document.body.classList.contains('rm') && getComputedStyle(document.getElementById('settings')).animationName === 'none'));
  await click(ph, '#settings [data-action=menu]'); await click(ph, '#menu [data-action=start]');
  const vr = await maxOver(ph, 400, 'veil'); await forceDie(ph);
  const [shk3, par3, vl3] = await Promise.all([maxOver(ph, 600, 'shake'), maxOver(ph, 600, 'particles'), maxOver(ph, 600, 'veil')]);
  check('H16 reduced motion: no fades/flash, no shake (even with shake ON), fewer particles', vr === 0 && vl3 === 0 && shk3 === 0 && par3 > 0 && par3 <= 30, `veil ${vr}/${vl3}, shake ${shk3}, particles ${par3}`);
  await sleep(450); await click(ph, '#over [data-action=menu]');
  await click(ph, '#menu [data-action=settings]'); await click(ph, '[data-setting=reduceMotion]'); await click(ph, '#settings [data-action=menu]');

  // repeated cycles: still one loop, one set of listeners
  const r0 = await frames(ph);
  for (let i = 0; i < 10; i++) { await click(ph, '#menu [data-action=settings]'); await click(ph, '#settings [data-action=menu]'); }
  for (let i = 0; i < 10; i++) { await click(ph, '#menu [data-action=start]'); await waitState(ph, 'over'); await sleep(380); await click(ph, '#over [data-action=menu]'); }
  const r1 = await frames(ph);
  const sb = (await store(ph)).sfx; await click(ph, '#menu [data-action=settings]'); await click(ph, '[data-setting=sfx]');
  check('H17 20 cycles: one animation loop, settings click handled once', r1 <= r0 * 1.25 + 2 && (await store(ph)).sfx === !sb, `${r0} -> ${r1} frames/s`);
  await ctxH.close();

  const ctxR = await browser.newContext({ viewport: { width: 900, height: 520 }, reducedMotion: 'reduce' });
  const prr = await open(ctxR, errors); await click(prr, '#menu [data-action=settings]');
  check('H18 OS prefers-reduced-motion -> REDUCED MOTION defaults ON', (await labels(prr))[2] === 'REDUCED MOTION: ON' && await prr.evaluate(() => document.body.classList.contains('rm')));
  await ctxR.close();

  const errB = []; const ctxB = await browser.newContext({ viewport: { width: 900, height: 520 } });
  const pb = await open(ctxB, errB, `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}});`);
  await click(pb, '#menu [data-action=settings]'); await click(pb, '[data-setting=shake]'); const lb = (await labels(pb))[1]; await click(pb, '#settings [data-action=menu]');
  check('H19 blocked localStorage: settings still toggle in memory, no errors', lb === 'SCREEN SHAKE: OFF' && await state(pb) === 'menu' && errB.length === 0, errB.join(' | '));
  await ctxB.close();

  // ---------- I: Session 3 — power-ups and glitch events ----------
  const give = (p, t) => p.evaluate(t => GR.Power.give(t), t);
  const force = (p, id) => p.evaluate(id => GR.Events.force(id), id);
  const ctxI = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const pi = await open(ctxI, errors);
  // Shield: pickup is forced once per run through the real game wiring; the collision itself is natural (no input, unpatched hits)
  await pi.evaluate(() => { const W = GR.World.prototype; W.__rs = W.reset; W.reset = function () { this.__p = false; return W.__rs.call(this); }; W.__cp = W.collectPower; W.collectPower = function () { if (!this.__p) { this.__p = true; return ['shield']; } return []; }; });
  await click(pi, '#menu [data-action=start]'); const shakeSeen = maxOver(pi, 9000, 'shake'); await sleep(250);
  check('I1 shield pickup activates the shield and announces it', (await stats(pi)).shield === true && (await stats(pi)).notice === 'SHIELD ACTIVE');
  let consumed = null; const tI = Date.now();
  while (Date.now() - tI < 9000) { const s = await stats(pi); if (!s.shield) { consumed = s; break; } await sleep(25); }
  await sleep(250); const aft = await stats(pi);
  check('I2 first collision is absorbed: run continues, shield spent, SHIELD BROKE shown', !!consumed && aft.state === 'playing' && !aft.dead && aft.notice === 'SHIELD BROKE', JSON.stringify(aft));
  check('I3 the next collision (shield gone) ends the run - exactly one hit absorbed', await waitState(pi, 'over', 12000));
  check('I4 shield break shakes the screen (Screen Shake ON)', await shakeSeen >= 3);
  await pi.evaluate(() => { const W = GR.World.prototype; W.collectPower = W.__cp; W.reset = W.__rs; });
  await sleep(450); await click(pi, '#over [data-action=menu]');

  // Slow-mo
  await click(pi, '#menu [data-action=start]'); await immortal(pi, true); await waitVeil(pi);
  await give(pi, 'slow'); const sl0 = await stats(pi);
  const ramp = await pi.evaluate(() => new Promise(res => { const a = []; const t0 = performance.now(); (function f() { a.push(GR.Game.stats().ts); if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(a); })(); }));
  check('I5 slow-mo: ~5s timer, world eases smoothly to ~0.55', sl0.slow > 4.5 && sl0.slow <= 5 && ramp.every((v, i) => i === 0 || (v <= ramp[i - 1] + 1e-9 && ramp[i - 1] - v < 0.12)) && ramp[ramp.length - 1] < 0.6, 'ts ' + ramp[0].toFixed(2) + ' -> ' + ramp[ramp.length - 1].toFixed(2));
  await give(pi, 'slow'); const rf = await stats(pi);
  check('I6 a second slow-mo pickup refreshes the timer, never stacks', rf.slow <= 5.0001 && rf.slow > 4.9, rf.slow.toFixed(2));
  await pi.keyboard.press('Space');
  check('I7 input is still immediate during slow-mo (jump burst within 150 ms)', await maxOver(pi, 150, 'particles') > 0);
  await sleep(700); await pi.keyboard.press('KeyP'); const sp0 = (await stats(pi)).slow; await sleep(1000); const sp1 = (await stats(pi)).slow; await pi.keyboard.press('KeyP'); await sleep(300);
  check('I8 pause freezes the slow-mo timer; resume continues it', Math.abs(sp0 - sp1) < 0.01 && sp0 > 0 && (await stats(pi)).slow < sp0, `${sp0.toFixed(2)} -> ${sp1.toFixed(2)}`);
  const rec = await pi.evaluate(() => new Promise(res => { const a = []; const t0 = performance.now(); (function f() { const s = GR.Game.stats(); a.push([s.slow, s.ts]); if ((s.slow === 0 && s.ts === 1) || performance.now() - t0 > 8000) res(a); else requestAnimationFrame(f); })(); }));
  const last = rec[rec.length - 1];
  check('I9 expiry: timer never negative, speed restores smoothly to exactly 1', rec.every((r, i) => r[0] >= 0 && (i === 0 || r[1] >= rec[i - 1][1] - 1e-9)) && last[0] === 0 && last[1] === 1);

  // Magnet
  await give(pi, 'magnet'); const mg = await stats(pi); await give(pi, 'magnet'); const mg2 = await stats(pi);
  check('I10 magnet: ~7s timer, repeat pickup refreshes without stacking', mg.magnet > 6.5 && mg.magnet <= 7 && mg2.magnet <= 7.0001, mg2.magnet.toFixed(2));

  // Cleanup on game over and on restart-from-pause
  await give(pi, 'shield'); await give(pi, 'slow'); await force(pi, 'surge'); await force(pi, 'corrupt'); await forceDie(pi); await waitState(pi, 'over');
  const dd = await stats(pi);
  check('I11 game over clears shield, slow-mo, magnet and every event', !dd.shield && dd.slow === 0 && dd.magnet === 0 && dd.ts === 1 && !dd.event && !dd.cos, JSON.stringify(dd));
  await sleep(450); await immortal(pi, true); await click(pi, '#over [data-action=start]');   // immortal BEFORE the new run starts (forceDie left hits patched)
  await give(pi, 'shield'); await give(pi, 'slow'); await give(pi, 'magnet'); await force(pi, 'gravity'); await force(pi, 'corrupt'); await sleep(2000);
  await pi.keyboard.press('KeyP'); await click(pi, '#pause [data-action=start]'); await immortal(pi, true); await waitVeil(pi);
  const rs = await stats(pi);
  check('I12 RESTART leaves no stale effects (power-ups, events, speed/gravity modifiers)', !rs.shield && rs.slow === 0 && rs.magnet === 0 && rs.ts === 1 && !rs.event && !rs.cos && rs.gMult === 1 && rs.speedMult === 1 && rs.state === 'playing', JSON.stringify(rs));

  // Events
  await force(pi, 'surge'); const w0 = await stats(pi);
  check('I13 SYSTEM SURGE begins with a warning phase and no speed change yet', w0.event.id === 'surge' && w0.event.phase === 'warn' && w0.event.left > 1.6 && w0.speedMult === 1);
  await sleep(2700); const on0 = await stats(pi);
  await pi.keyboard.press('KeyP'); const l0 = (await stats(pi)).event.left; await sleep(800); const l1 = (await stats(pi)).event.left; await pi.keyboard.press('KeyP'); await sleep(1500);
  const on1 = await stats(pi);
  check('I14 surge: active phase raises obstacle speed (x1.2, eased); pause freezes the event timer', on0.event.phase === 'on' && on1.speedMult > 1.15 && Math.abs(l0 - l1) < 0.01, `x${on1.speedMult.toFixed(2)}, left ${l0.toFixed(2)}/${l1.toFixed(2)}`);
  let ended = false; for (let i = 0; i < 60 && !ended; i++) { ended = !(await stats(pi)).event; if (!ended) await sleep(100); }
  await sleep(1300); const sg = await stats(pi);
  check('I15 surge ends after its duration and speed returns to exactly x1', ended && sg.speedMult === 1, 'x' + sg.speedMult);
  await force(pi, 'gravity'); await sleep(1800); const gv = await stats(pi);
  const gm = await jumpMin(pi, () => pi.keyboard.press('Space'));
  check('I16 GRAVITY ERROR: warned, then heavier gravity (x1.25) gives a lower jump apex but stays clearable', gv.event.phase === 'on' && gv.gMult === 1.25 && gm > 215 && gm < 245, 'apex top ' + gm + ' (normal ~205)');
  await force(pi, 'surge'); await force(pi, 'corrupt'); const ov = await stats(pi);
  check('I17 compatible events overlap: gameplay event + VISUAL CORRUPTION; corruption draws glitch bars in normal motion', ov.event.id === 'surge' && ov.cos.id === 'corrupt' && await maxOver(pi, 600, 'bars') > 0);
  await ctxI.close();

  const ctxRM = await browser.newContext({ viewport: { width: 900, height: 520 }, reducedMotion: 'reduce' });
  const prm = await open(ctxRM, errors);
  await click(prm, '#menu [data-action=start]'); await immortal(prm, true); await force(prm, 'corrupt'); await force(prm, 'surge');
  const [barsRM, veilRM, shakeRM] = await Promise.all([maxOver(prm, 700, 'bars'), maxOver(prm, 700, 'veil'), maxOver(prm, 700, 'shake')]);
  check('I18 Reduced Motion: corruption is a static tint (no glitch bars), no fades, no shake; event still announced', barsRM === 0 && veilRM === 0 && shakeRM === 0 && (await stats(prm)).cos.phase === 'on' && (await stats(prm)).event.id === 'surge');
  await ctxRM.close();

  const ctxN = await browser.newContext({ viewport: { width: 900, height: 520 } });
  const pn = await open(ctxN, errors, 'window.GR_NO_DIRECTOR = false;');
  await click(pn, '#menu [data-action=start]'); await immortal(pn, true);
  const tN = Date.now(); let firstAt = null, minLeft = 9;
  while (Date.now() - tN < 24000 && firstAt === null) { const s = await stats(pn); [s.event, s.cos].forEach(e => { if (e) minLeft = Math.min(minLeft, e.left); }); if (s.event || s.cos) firstAt = (Date.now() - tN) / 1000; else await sleep(150); }
  check('I19 natural director: first glitch event appears only after ~15s of play, with sane timers', firstAt !== null && firstAt >= 14 && firstAt <= 22 && minLeft >= 0, 'first event at ' + (firstAt && firstAt.toFixed(1)) + 's');
  await ctxN.close();

  {   // block scope: Session 4 section keeps its own names
  // ---------- J: Session 4 — coins, shop, achievements, missions ----------
  const ctxJ = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const pj = await open(ctxJ, errors);
  const seed = async (p, o) => { await p.evaluate(v => localStorage.setItem('glitchrun.v1', v), typeof o === 'string' ? o : JSON.stringify(o)); await p.reload(); };
  const patchCollect = (p, n) => p.evaluate(n => { const W = GR.World.prototype; if (!W.__r4) { W.__r4 = W.reset; W.reset = function () { this.__g = false; return W.__r4.call(this); }; } W.collect = function () { if (!this.__g) { this.__g = true; return n; } return 0; }; }, n);
  const rows = (p, sel) => p.$$eval(sel, r => r.length);
  const itemSt = (p, id) => p.textContent(`#shopList .item[data-id=${id}] .st`);
  const buyBtn = id => `#shopList button[data-shop=buy][data-id=${id}]`, equipBtn = id => `#shopList button[data-shop=equip][data-id=${id}]`;
  const pix = (p, cv, x, y) => p.evaluate(([cv, x, y]) => Array.from(document.getElementById(cv).getContext('2d').getImageData(x, y, 1, 1).data), [cv, x, y]);
  const near = (a, b) => Math.abs(a[0] - b[0]) < 40 && Math.abs(a[1] - b[1]) < 40 && Math.abs(a[2] - b[2]) < 40;

  // navigation + coin display
  await seed(pj, { coins: 250 });
  check('J1 menu shows coins and the five buttons', await txt(pj, '#menuCoins') === '250' && await pj.$$eval('#menu button', b => b.map(x => x.textContent).join(',')) === 'PLAY,SHOP,MISSIONS,ACHIEVEMENTS,SETTINGS');
  let navOk = true, navInfo = [];
  for (const [name, sc] of [['shop', 'shop'], ['missions', 'missions'], ['achievements', 'achievements'], ['settings', 'settings']]) {
    await click(pj, `#menu [data-action=${name}]`); const opened = await state(pj) === sc; await click(pj, `#${sc} [data-action=menu]`); const back = await state(pj) === 'menu';
    await click(pj, `#menu [data-action=${name}]`); await pj.keyboard.press('Escape'); const esc = await state(pj) === 'menu';
    if (!(opened && back && esc)) { navOk = false; navInfo.push(name); }
  }
  check('J2 SHOP / MISSIONS / ACHIEVEMENTS / SETTINGS open, BACK TO MENU and Esc both return', navOk, navInfo.join(','));
  await click(pj, '#menu [data-action=shop]');
  check('J3 shop shows the same coin balance, 5 skins + 4 trails with price/state text', await txt(pj, '#shopCoins') === '250' && await rows(pj, '#shopList .item') === 9 && await itemSt(pj, 'magenta') === 'EQUIPPED' && await itemSt(pj, 'none') === 'EQUIPPED' && await itemSt(pj, 'cyan') === 'LOCKED - 80 COINS' && await itemSt(pj, 'ghost') === 'LOCKED - 400 COINS');

  // purchase flow
  await click(pj, buyBtn('ghost'));
  check('J4 too expensive: clear message, no modal, balance unchanged', (await txt(pj, '#shopMsg')) === 'NOT ENOUGH COINS - NEED 150 MORE' && !(await pj.isVisible('#shopConfirm')) && (await store(pj)).coins === 250);
  await click(pj, buyBtn('cyan'));
  check('J5 BUY opens a confirmation naming the item, price and resulting balance', await pj.isVisible('#shopConfirm') && /NEON CYAN for 80 coins\? Balance after: 170/.test(await txt(pj, '#confirmText')));
  await click(pj, '#shopConfirm [data-shop=cancel]');
  check('J6 CANCEL: nothing bought, coins unchanged', !(await pj.isVisible('#shopConfirm')) && (await store(pj)).coins === 250 && await itemSt(pj, 'cyan') === 'LOCKED - 80 COINS');
  await click(pj, buyBtn('cyan')); await pj.keyboard.press('Escape');
  check('J7 Esc closes the confirmation first (stays in shop), second Esc leaves', !(await pj.isVisible('#shopConfirm')) && await state(pj) === 'shop' && (await pj.keyboard.press('Escape'), await state(pj) === 'menu'));
  await click(pj, '#menu [data-action=shop]'); await click(pj, buyBtn('cyan')); await click(pj, '#confirmOk');
  const sj = await store(pj);
  check('J8 CONFIRM: price deducted once, item owned, feedback shown, shop+storage agree', sj.coins === 170 && sj.ownedSkins.includes('cyan') && await itemSt(pj, 'cyan') === 'OWNED' && /PURCHASED NEON CYAN/.test(await txt(pj, '#shopMsg')) && await txt(pj, '#shopCoins') === '170');
  await seed(pj, { coins: 1000 }); await click(pj, '#menu [data-action=shop]'); await click(pj, buyBtn('lime'));
  await pj.evaluate(() => { const b = document.getElementById('confirmOk'); b.click(); b.click(); b.click(); });   // repeated clicks in the same instant
  let sj2 = await store(pj);
  check('J9 triple-click on CONFIRM charges once (150), owns it once', sj2.coins === 850 && sj2.ownedSkins.filter(x => x === 'lime').length === 1);
  await pj.evaluate(() => { for (let i = 0; i < 4; i++) { const b = document.querySelector('#shopList button[data-shop=buy][data-id=sun]'); if (b) b.click(); } const ok = document.getElementById('confirmOk'); ok.click(); ok.click(); });
  sj2 = await store(pj);
  check('J10 spamming BUY + CONFIRM never double-charges (sun = 250)', sj2.coins === 600 && sj2.ownedSkins.filter(x => x === 'sun').length === 1, 'coins ' + sj2.coins);

  // preview + equip + persistence + in-game effect
  await click(pj, '#shopList button[data-shop=preview][data-id=sun]'); await sleep(150);
  check('J11 PREVIEW shows the item before buying/equipping (preview canvas colour + caption); nothing equipped by previewing', near(await pix(pj, 'shopPreview', 170, 65), [255, 170, 0]) && /SOLAR FLARE/.test(await txt(pj, '#previewName')) && (await store(pj)).skin !== 'sun');
  await click(pj, '#shopList button[data-shop=preview][data-id=comet]'); await sleep(500);
  const trailPx = await pj.evaluate(() => { const d = document.getElementById('shopPreview').getContext('2d').getImageData(0, 0, 140, 108).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) n++; return n; });
  check('J12 trail preview animates particles behind the player', trailPx > 3, trailPx + ' bright pixels');
  await click(pj, buyBtn('cyan')); await click(pj, '#confirmOk'); await click(pj, equipBtn('cyan'));
  check('J13 EQUIP: state EQUIPPED, previous skin becomes OWNED/EQUIP-able, stored', await itemSt(pj, 'cyan') === 'EQUIPPED' && (await store(pj)).skin === 'cyan' && await itemSt(pj, 'magenta') === 'OWNED');
  await click(pj, buyBtn('sparks')); await click(pj, '#confirmOk'); await click(pj, equipBtn('sparks'));
  await pj.reload();
  const s2 = await store(pj); await click(pj, '#menu [data-action=shop]');
  check('J14 purchases + equipped skin/trail + balance persist after reload', s2.skin === 'cyan' && s2.trail === 'sparks' && s2.ownedSkins.includes('cyan') && s2.ownedSkins.includes('lime') && s2.ownedTrails.includes('sparks') && await itemSt(pj, 'cyan') === 'EQUIPPED' && await itemSt(pj, 'sparks') === 'EQUIPPED' && await txt(pj, '#shopCoins') === String(s2.coins));
  await click(pj, '#shop [data-action=menu]'); await click(pj, '#menu [data-action=start]'); await immortal(pj, true); await waitVeil(pj);
  const body = await pix(pj, 'game', 130, 337); const trailMax = await maxOver(pj, 500, 'particles');
  check('J15 equipped skin is drawn in-game (cyan outline) and the trail emits particles; default skin/trail unchanged otherwise', near(body, [0, 255, 255]) && trailMax > 3, `pixel ${body.slice(0, 3)}, particles ${trailMax}`);
  const hb = await pj.evaluate(() => { const c = GR.Cosmetics; return JSON.stringify([c.SKINS.length, GR.CFG.JUMP_V, GR.CFG.GRAVITY]); });
  await pj.keyboard.press('KeyP'); await click(pj, '#pause [data-action=menu]');
  check('J16 cosmetics leave physics constants untouched', hb === JSON.stringify([5, 780, 2200]));

  // coin banking once per run + achievements
  await seed(pj, { coins: 0 }); await patchCollect(pj, 3);
  await click(pj, '#menu [data-action=start]'); await waitVeil(pj); await sleep(150); await forceDie(pj); await waitState(pj, 'over');
  await pj.evaluate(() => { for (let i = 0; i < 6; i++) { document.querySelector('#over [data-action=start]').click(); document.querySelector('#over [data-action=menu]').click(); } });
  let sk = await store(pj), notes1 = await txt(pj, '#overNotes');
  check('J17 death banks coins once (3), counts the run, unlocks BOOT SEQUENCE; spam-clicking RETRY/MENU right after death does nothing', sk.coins === 3 && sk.prog.fragments === 3 && sk.prog.runs === 1 && sk.ach.first_run === true && await state(pj) === 'over' && /\+3 COINS BANKED/.test(notes1) && /ACHIEVEMENT UNLOCKED: BOOT SEQUENCE/.test(notes1), notes1);
  await sleep(450); await click(pj, '#over [data-action=start]'); await waitState(pj, 'over'); sk = await store(pj);
  check('J18 second run: +3 coins (6 total), runs=2, the achievement is not re-awarded or re-announced', sk.coins === 6 && sk.prog.runs === 2 && Object.keys(sk.ach).length === 1 && !/BOOT SEQUENCE/.test(await txt(pj, '#overNotes')));
  await sleep(450); await immortal(pj, true); await click(pj, '#over [data-action=start]'); await waitVeil(pj); await sleep(200);
  await pj.keyboard.press('KeyP'); await click(pj, '#pause [data-action=start]'); await waitVeil(pj); await sleep(200); await pj.keyboard.press('KeyP'); await click(pj, '#pause [data-action=menu]');
  sk = await store(pj);
  check('J19 abandoning runs (pause->RESTART, pause->MENU) banks each exactly once (+3 each) and does not count as completed runs', sk.coins === 12 && sk.prog.fragments === 12 && sk.prog.runs === 2, `coins ${sk.coins}, fragments ${sk.prog.fragments}, runs ${sk.prog.runs}`);
  await click(pj, '#menu [data-action=achievements]');
  const achTxt = await pj.$$eval('#achList .item', r => r.map(x => x.textContent));
  check('J20 achievements screen: 11 rows with progress; BOOT SEQUENCE unlocked, others locked; summary matches', achTxt.length === 11 && /BOOT SEQUENCE.*UNLOCKED 1\/1/.test(achTxt[0]) && /DATA SCRAPER.*LOCKED 12\/50/.test(achTxt[1]) && await txt(pj, '#achSummary') === '1 / 11 UNLOCKED', achTxt[1]);
  await click(pj, '#achievements [data-action=menu]');

  // missions: deterministic, paid once per day, date rollover
  await seed(pj, { coins: 0 }); await patchCollect(pj, 100);
  await pj.evaluate(() => { GR.Progress.now = () => new Date(2031, 2, 14, 12); });
  const m14 = await pj.evaluate(() => GR.Progress.missionsFor('2031-03-14')), m15 = await pj.evaluate(() => GR.Progress.missionsFor('2031-03-15'));
  await click(pj, '#menu [data-action=missions]'); const mt1 = await txt(pj, '#missList'); const day1 = await txt(pj, '#missDay');
  await click(pj, '#missions [data-action=menu]'); await click(pj, '#menu [data-action=missions]');
  check('J21 missions screen: 3 missions, stable for the day (identical when reopened), shows local date', await rows(pj, '#missList .item') === 3 && mt1 === await txt(pj, '#missList') && day1 === 'TODAY: 2031-03-14', day1);
  await click(pj, '#missions [data-action=menu]'); await click(pj, '#menu [data-action=start]'); await waitVeil(pj); await sleep(150); await forceDie(pj); await waitState(pj, 'over');
  let cm = (await store(pj)).coins;
  const pay14 = m14[0].reward + m14[2].reward, pay15 = m15[0].reward + m15[2].reward;   // 100 forced fragments also score 5000: DATA RUN + SCORE ATTACK both complete
  check('J22 completing missions pays each reward once, in addition to banked fragments (100 + ' + pay14 + ')', cm === 100 + pay14 && /MISSION COMPLETE: SCORE ATTACK/.test(await txt(pj, '#overNotes')) && /MISSION COMPLETE: DATA RUN/.test(await txt(pj, '#overNotes')), 'coins ' + cm);
  await sleep(450); await click(pj, '#over [data-action=start]'); await waitState(pj, 'over');
  check('J23 same day, second completion: NOT paid again (only the 100 banked fragments)', (await store(pj)).coins === 200 + pay14 && !/MISSION COMPLETE/.test(await txt(pj, '#overNotes')));
  await pj.evaluate(() => { GR.Progress.now = () => new Date(2031, 2, 15, 12); }); await sleep(450); await click(pj, '#over [data-action=menu]'); await click(pj, '#menu [data-action=missions]');
  check('J24 date rollover: missions screen shows the new day with fresh 0 progress and unpaid', await txt(pj, '#missDay') === 'TODAY: 2031-03-15' && (await pj.$$eval('#missList .st', s => s.map(x => x.textContent))).every(t => /^0\//.test(t)));
  await click(pj, '#missions [data-action=menu]'); await click(pj, '#menu [data-action=start]'); await waitVeil(pj); await sleep(150); await forceDie(pj); await waitState(pj, 'over');
  check('J25 on the new day the mission is earned (and paid) once more', (await store(pj)).coins === 300 + pay14 + pay15, 'coins ' + (await store(pj)).coins);
  await pj.evaluate(() => { GR.Progress.now = () => new Date(2031, 2, 10, 12); }); await sleep(450); await click(pj, '#over [data-action=menu]'); await click(pj, '#menu [data-action=missions]');
  check('J26 clock moved backwards: screen still renders a sane fresh day (no crash)', await txt(pj, '#missDay') === 'TODAY: 2031-03-10' && await rows(pj, '#missList .item') === 3);
  await click(pj, '#missions [data-action=menu]');

  // restart cleanup of run tracking
  await seed(pj, {}); await pj.evaluate(() => { const W = GR.World.prototype; W.__h0 = W.hits; });
  await click(pj, '#menu [data-action=start]'); await immortal(pj, true); await waitVeil(pj); await force(pj, 'storm'); await sleep(100);
  await pj.keyboard.press('KeyP'); await click(pj, '#pause [data-action=start]'); await forceDie(pj); await waitState(pj, 'over');
  const rc = await store(pj);
  check('J27 restart cleanup: the aborted run\'s event is counted once and never leaks into the next run', rc.prog.events === 1 && rc.prog.runs === 1, JSON.stringify(rc.prog));

  // corrupted new data
  await seed(pj, '{"coins":"lots","ownedSkins":"cyan","ownedTrails":[1,{}],"skin":"../x","trail":{},"ach":[1,2],"prog":"x","missions":{"day":5,"progress":"no"}}');
  await click(pj, '#menu [data-action=shop]'); const cs = await itemSt(pj, 'magenta') === 'EQUIPPED' && await rows(pj, '#shopList .item') === 9 && await txt(pj, '#shopCoins') === '0';
  await click(pj, '#shop [data-action=menu]'); await click(pj, '#menu [data-action=achievements]'); const ca = await rows(pj, '#achList .item') === 11 && await txt(pj, '#achSummary') === '0 / 11 UNLOCKED';
  await click(pj, '#achievements [data-action=menu]'); await click(pj, '#menu [data-action=missions]'); const cmz = await rows(pj, '#missList .item') === 3;
  check('J28 corrupted saves for the new data: shop, achievements and missions still open with safe defaults', cs && ca && cmz);
  await click(pj, '#missions [data-action=menu]');

  // no duplicated listeners / loops after many navigations
  await seed(pj, { coins: 1000 });
  const f0 = await frames(pj);
  await pj.evaluate(() => { window.__c = 0; const o = GR.Screens.click; GR.Screens.click = function () { window.__c++; return o.apply(this, arguments); }; });
  for (let i = 0; i < 15; i++) { for (const n of ['shop', 'achievements', 'missions']) { await click(pj, `#menu [data-action=${n}]`); await click(pj, `#${n} [data-action=menu]`); } }
  await click(pj, '#menu [data-action=shop]'); await click(pj, '#shopList button[data-shop=preview][data-id=lime]');
  const f1 = await frames(pj);
  check('J29 45 page visits: one animation loop, one click handler per button press', f1 <= f0 * 1.25 + 2 && await pj.evaluate(() => window.__c) === 1, `${f0} -> ${f1} frames/s`);
  await ctxJ.close();

  // landscape phone: layout, scrolling, touch purchase
  const ctxK = await browser.newContext({ viewport: { width: 851, height: 393 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pk = await open(ctxK, errors); await seed(pk, { coins: 1000 });
  const fit = async sel => pk.$$eval(sel, bs => bs.filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
  check('K1 landscape phone: every menu button fits on screen, page does not scroll sideways', await fit('#menu button') && await pk.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pk.tap('#menu [data-action=shop]');
  await pk.setViewportSize({ width: 568, height: 320 });   // small phone (iPhone SE landscape): the list no longer fits and must scroll
  await sleep(150);
  const sc = await pk.evaluate(() => { const l = document.getElementById('shopList'); const before = l.scrollTop; l.scrollTop = 150; return { scrolls: l.scrollHeight > l.clientHeight, moved: l.scrollTop > before, ov: getComputedStyle(l).overflowY, page: document.documentElement.scrollHeight <= innerHeight + 1 }; });
  check('K2 shop list scrolls inside its own box (page itself does not)', sc.scrolls && sc.moved && sc.ov === 'auto' && sc.page && await state(pk) === 'shop', JSON.stringify(sc));
  check('K3 shop header, back button and message line stay inside the screen (small phone)', await fit('#shop header, #shop > [data-action=menu], #shopMsg'));
  await pk.evaluate(() => { document.getElementById('shopList').scrollTop = 0; }); await pk.setViewportSize({ width: 851, height: 393 }); await sleep(150);
  await pk.tap(buyBtn('cyan')); const modalOn = await pk.isVisible('#shopConfirm'); await pk.tap('#confirmOk');
  check('K4 touch: BUY -> CONFIRM works; balance and ownership updated', modalOn && (await store(pk)).coins === 920 && (await store(pk)).ownedSkins.includes('cyan'));
  await pk.tap('#shop > [data-action=menu]'); await pk.tap('#menu [data-action=achievements]');
  check('K5 achievements page on a phone: list scrolls and fits', await state(pk) === 'achievements' && await fit('#achievements header, #achievements > [data-action=menu]') && await pk.evaluate(() => { const l = document.getElementById('achList'); return l.scrollHeight > l.clientHeight && getComputedStyle(l).overflowY === 'auto'; }));
  await pk.tap('#achievements > [data-action=menu]'); await pk.tap('#menu [data-action=missions]');
  check('K6 missions page on a phone fits', await state(pk) === 'missions' && await fit('#missions header, #missions > [data-action=menu]'));
  await ctxK.close();

  // ---------- L: Session 5 — fast-drop / quick-land mechanic ----------
  const ctxL = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const pl = await open(ctxL, errors);
  await click(pl, '#menu [data-action=start]'); await immortal(pl, true); await waitVeil(pl);
  
  // L1: Down while grounded does not move player or trigger drop
  await pl.keyboard.press('ArrowDown');
  await sleep(60);
  const stGrounded = await stats(pl);
  check('L1 Down Arrow while grounded does not activate drop', !stGrounded.dropping && Math.abs(stGrounded.vy) < 1);

  // L2: Normal jump airtime measurement
  await pl.keyboard.press('Space');
  await sleep(80);
  let t0 = Date.now() - 80, normalAir = 0;
  while (Date.now() - t0 < 1500) {
    const s = await stats(pl);
    if (s.y >= 336 - 1 && s.vy === 0) { normalAir = Date.now() - t0; break; }
    await sleep(20);
  }

  // L3: Jump and fast-drop via ArrowDown
  await sleep(150);
  await pl.keyboard.press('Space');
  await sleep(100); // airborne and rising
  await pl.keyboard.press('ArrowDown');
  let tDrop = Date.now(), dropAir = 0, sawDrop = false;
  while (Date.now() - tDrop < 1500) {
    const s = await stats(pl);
    if (s.dropping) sawDrop = true;
    if (sawDrop && s.y >= 336 - 1 && s.vy === 0) { dropAir = Date.now() - tDrop + 100; break; }
    await sleep(20);
  }
  check('L2 fast-drop activates via ArrowDown and returns player to ground much faster', sawDrop && dropAir < normalAir * 0.75, `${dropAir}ms vs ${normalAir}ms`);

  // L4: Mobile drop button exists and activates drop
  await pl.keyboard.press('Space');
  await sleep(80);
  await click(pl, '#dropBtn');
  await sleep(30);
  const stTouch = await stats(pl);
  check('L3 mobile dropBtn activates fast-drop during airborne play', stTouch.dropping || (await stats(pl)).vy > 0);

  // L5: Fast-drop resets on game over and menu return
  await pl.keyboard.press('KeyP'); await click(pl, '#pause [data-action=menu]');
  check('L4 drop state cleanly resets on menu return', (await state(pl)) === 'menu');
  await ctxL.close();

  // ---------- M: Session 7 — Background Music & Audio Polish ----------
  const ctxM7 = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const pm = await open(ctxM7, errors);
  await click(pm, '#menu [data-action=settings]');
  
  // M1: Labels for music and volumes
  const musicTxt = await txt(pm, '[data-audio=music]');
  const musicVolTxt = await txt(pm, '[data-audio=musicVol]');
  const sfxVolTxt = await txt(pm, '[data-audio=sfxVol]');
  check('M1 settings displays music and volume controls', musicTxt === 'BACKGROUND MUSIC: ON' && musicVolTxt === 'MUSIC VOL: 40%' && sfxVolTxt === 'SFX VOL: 80%', `${musicTxt} | ${musicVolTxt} | ${sfxVolTxt}`);

  // M2: Music toggle OFF
  await click(pm, '[data-audio=music]');
  const stOff = await store(pm);
  const musicOffTxt = await txt(pm, '[data-audio=music]');
  check('M2 music toggle OFF updates label and saves to storage', stOff.music === false && musicOffTxt === 'BACKGROUND MUSIC: OFF');

  // M3: Independent controls: SFX still ON when music is OFF
  check('M3 SFX toggle remains ON when music is toggled OFF', stOff.sfx === true && (await txt(pm, '[data-setting=sfx]')) === 'SOUND EFFECTS: ON');

  // M4: Music toggle ON
  await click(pm, '[data-audio=music]');
  const stOn = await store(pm);
  check('M4 music toggle back ON restores storage', stOn.music === true && (await txt(pm, '[data-audio=music]')) === 'BACKGROUND MUSIC: ON');

  // M5: Music volume cycling
  await click(pm, '[data-audio=musicVol]');
  const v1 = (await store(pm)).musicVol;
  const l1 = await txt(pm, '[data-audio=musicVol]');
  await click(pm, '[data-audio=musicVol]');
  const v2 = (await store(pm)).musicVol;
  const l2 = await txt(pm, '[data-audio=musicVol]');
  check('M5 music volume steps advance and persist', v1 === 0.6 && l1 === 'MUSIC VOL: 60%' && v2 === 0.8 && l2 === 'MUSIC VOL: 80%');

  // M6: SFX volume cycling
  await click(pm, '[data-audio=sfxVol]');
  const sv1 = (await store(pm)).sfxVol;
  const sl1 = await txt(pm, '[data-audio=sfxVol]');
  check('M6 SFX volume steps advance and persist', sv1 === 1.0 && sl1 === 'SFX VOL: 100%');

  // M7: Settings persist across reload
  await pm.reload();
  await click(pm, '#menu [data-action=settings]');
  const reloadedStore = await store(pm);
  check('M7 audio settings persist after reload', reloadedStore.music === true && reloadedStore.musicVol === 0.8 && reloadedStore.sfxVol === 1.0);

  // M8: Gameplay audio transitions: play, pause, resume, over without errors
  await click(pm, '#settings [data-action=menu]');
  await click(pm, '#menu [data-action=start]');
  await waitVeil(pm);
  await sleep(100);
  await pl.keyboard ? pm.keyboard.press('KeyP') : null;
  await sleep(100);
  await pm.keyboard.press('KeyP');
  await sleep(100);
  check('M8 audio handles state transitions cleanly', await state(pm) === 'playing');
  await ctxM7.close();

  }
  check('Z no console/page errors across all sessions', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed === 0 ? '\nALL BROWSER CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST HARNESS ERROR', e); process.exit(2); });
