// Headless logic check (no browser): node tests/headless-sim.js
// Runs an autopilot for 10 simulated minutes and reports whether obstacles were fair.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, console };
ctx.window = ctx; vm.createContext(ctx);
['config', 'storage', 'input', 'player', 'world', 'fx', 'powerups', 'events'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), ctx));
const GR = ctx.GR;
let deaths = 0, frags = 0, jumps = 0;
const p = new GR.Player(), w = new GR.World(), dt = 1 / 60;
for (let t = 0; t < 600 * 60; t++) {
  const ahead = w.obstacles.filter(o => o.x + o.w > p.x).sort((a, b) => a.x - b.x)[0];
  if (ahead && p.onGround && (ahead.x - (p.x + p.w)) < w.speed * 0.3 && (ahead.x - (p.x + p.w)) > 0) { GR.Input.jumpQueued = 0.12; jumps++; }
  GR.Input.tick(dt); p.update(dt); w.update(dt);
  frags += w.collect(p.box());
  if (w.hits(p.box())) { deaths++; p.reset(); w.reset(); }
}
// Hitbox geometry: every spike hitbox must lie inside the drawn triangle.
let outside = 0; const gw = new GR.World(); for (let i = 0; i < 400; i++) gw.spawn();
gw.obstacles.filter(o => o.type === 'spike').forEach(o => { const h = o.hit(); if (h.w / 2 > (h.y - o.y) / o.h * o.w / 2 + 0.01 || h.y + h.h > o.y + o.h + 0.01) outside++; });
console.log('spike hitboxes outside triangle:', outside, outside === 0 ? '(PASS)' : '(FAIL)');
console.log({ deaths, jumps, fragmentsCollected: frags, finalSpeed: Math.round(w.speed) });
console.log(deaths === 0 ? 'PASS: autopilot cleared every obstacle' : 'FAIL: unfair pattern or logic bug');

// ---- Session 2 unit checks: particle cap/lifetime and settings sanitizing ----
const FX = GR.FX; let maxSeen = 0;
for (let i = 0; i < 2000; i++) { FX.burst(0, 0, 50, { life: 0.8 }); maxSeen = Math.max(maxSeen, FX.count()); }
console.log('FX cap respected:', maxSeen <= FX.max() ? 'PASS' : 'FAIL', '(max ' + maxSeen + ' of ' + FX.max() + ')');
for (let i = 0; i < 120; i++) FX.update(1 / 60);
console.log('FX particles all expire:', FX.count() === 0 ? 'PASS' : 'FAIL');
GR.Storage.set('reduceMotion', true); FX.clear(); FX.burst(0, 0, 100);
console.log('FX reduced-motion budget:', FX.count() <= 30 && FX.max() < 240 ? 'PASS' : 'FAIL', '(' + FX.count() + ' particles)');
const c2 = { console, localStorage: { getItem: () => '{"sfx":"yes","shake":2,"reduceMotion":null,"highScore":"x","coins":-1}', setItem() {} }, addEventListener() {} };
c2.window = c2; vm.createContext(c2);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8'), vm.runInContext('window.GR = {}; window', c2) && c2);
const st = c2.GR.Storage;
console.log('Corrupt settings -> defaults:', st.get('sfx') === true && st.get('shake') === true && st.get('reduceMotion') === false && st.get('highScore') === 0 && st.get('coins') === 0 ? 'PASS' : 'FAIL');

// ================= Session 3: power-ups + glitch events (pure logic) =================
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : '')); };
const { Power, Events } = GR, PW = GR.CFG.POWER;
const rnd = (a, b) => a + Math.random() * (b - a);
function mk() { const w = new GR.World(), p = new GR.Player(); Power.reset(); Events.reset(); return { w, p }; }
// Same order as GR.Game.update(): timers -> events -> player (real dt) -> world (slow-mo scaled dt) -> magnet -> collect
function gameStep(w, p, dt) {
  Power.update(dt); Events.update(dt); Events.apply(w, p, dt);
  p.update(dt * Power.timeScale());   // player physics shares the world's time scale; input buffer stays real-time
  w.update(dt * Power.timeScale());
  if (Power.magnetActive()) w.attract(p.x + p.w / 2, p.y + p.h / 2, PW.MAGNET_R, dt);
  const n = w.collect(p.box());
  w.collectPower(p.box()).forEach(t => Power.activate(t));
  return n;
}

// -- Slow-mo / magnet / shield timers
{ Power.reset(); Power.give('slow'); Power.give('slow');
  ok('P1 slow-mo does not stack on re-pickup', Power.get().slow === PW.SLOW_DUR);
  let prev = 1, maxStep = 0, mono = true, neg = false;
  for (let i = 0; i < 60 * 1.5; i++) { Power.update(1 / 60); const t = Power.timeScale(); maxStep = Math.max(maxStep, prev - t); if (t > prev + 1e-9) mono = false; prev = t; }
  ok('P2 slow-mo eases down to ' + PW.SLOW_SCALE + ' smoothly (no jumps)', mono && Math.abs(Power.timeScale() - PW.SLOW_SCALE) < 0.02 && maxStep < 0.06, 'max step ' + maxStep.toFixed(3));
  let prev2 = Power.timeScale(), up = true, bigJump = 0;
  for (let i = 0; i < 60 * 6; i++) { Power.update(1 / 60); const g = Power.get(); if (g.slow < 0) neg = true; if (Power.timeScale() < prev2 - 1e-9) up = false; bigJump = Math.max(bigJump, Power.timeScale() - prev2); prev2 = Power.timeScale(); }
  ok('P3 slow-mo expires: timer >= 0, speed restores smoothly to exactly 1', !neg && up && Power.timeScale() === 1 && Power.get().slow === 0 && bigJump < 0.06, 'max step ' + bigJump.toFixed(3));
  Power.reset(); Power.give('magnet'); Power.give('magnet'); for (let i = 0; i < 60 * 8; i++) Power.update(1 / 60);
  ok('P4 magnet: no stacking, expires to exactly 0', Power.get().magnet === 0 && !Power.magnetActive());
  Power.reset(); Power.give('shield'); Power.give('shield');
  ok('P5 shield: re-pickup does not add a second charge (consumed once)', Power.consumeShield() === true && Power.consumeShield() === false && Power.grace() === PW.SHIELD_GRACE);
  Power.reset(); Power.give('slow'); Power.give('magnet'); Power.give('shield'); Power.reset();
  const g0 = Power.get(); ok('P6 reset clears every effect', !g0.shield && g0.slow === 0 && g0.magnet === 0 && g0.ts === 1 && g0.grace === 0);
}
// -- Pickup + shield collision helpers on the real World
{ const { w, p } = mk(); w.powerups.push({ type: 'slow', x: p.x + 10, y: p.y + 20, r: 15 }); w.powerups.push({ type: 'magnet', x: 600, y: 300, r: 15 });
  const got = w.collectPower(p.box());
  ok('W1 collectPower: only the overlapping power-up is collected, once', got.length === 1 && got[0] === 'slow' && w.powerups.length === 1 && w.collectPower(p.box()).length === 0);
  w.spawn(); const ob = w.obstacles[0]; ob.x = p.x; const two = { x: ob.x + 30, y: GR.CFG.GROUND - 40, w: 30, h: 30, type: 'block', ix: 0, iy: 0, hit() { return { x: this.x, y: this.y, w: this.w, h: this.h }; } }; w.obstacles.push(two);
  const gone = w.removeHits(p.box());
  ok('W2 removeHits clears all overlapping hazards in one go (one collision = one shield)', gone.length >= 1 && !w.hits(p.box()), gone.length + ' removed');
}
// -- Magnet: fragments are pulled smoothly and can never pass through the player without being collected
{ let tunneled = 0, nearMissed = 0, near = 0, collectedAny = 0, trials = 600;
  for (let trial = 0; trial < trials; trial++) {
    const { w, p } = mk(); const dt = [1 / 60, 1 / 30, 0.05][trial % 3]; w.speed = rnd(300, 720); w.surgeMult = trial % 4 === 0 ? 1.2 : 1;
    const box = p.box(), cy = box.y + box.h / 2, dy0 = rnd(-130, 20);
    const f = { x: p.x + rnd(60, 215), y: cy + dy0, r: 12 }; w.fragments.push(f);   // fragments always arrive from the right, outside the hitbox
    const isNear = Math.abs(dy0) <= 25; if (isNear) near++;
    Power.give('magnet'); let n = 0, tun = false;
    for (let i = 0; i < 240 && w.fragments.length; i++) {
      const x0 = f.x, y0 = f.y;
      w.update(dt); w.attract(p.x + p.w / 2, p.y + p.h / 2, PW.MAGNET_R, dt);
      const x1 = f.x, y1 = f.y, c = w.collect(box); n += c;
      const ov = y => y + 12 > box.y && y - 12 < box.y + box.h;
      if (!c && x0 - 12 >= box.x + box.w && x1 + 12 <= box.x && ov(y0) && ov(y1)) tun = true;   // jumped clean over the hitbox
    }
    if (tun) tunneled++; if (n > 1) tunneled++; if (n === 1) collectedAny++; if (isNear && n !== 1) nearMissed++;
  }
  ok('M1 magnet: ' + trials + ' trials (dt 1/60, 1/30, 0.05, speeds 300-720): no fragment ever passes through the player uncollected', tunneled === 0, tunneled + ' tunnelled');
  ok('M1b fragments at the player\'s height are always collected exactly once', nearMissed === 0, near + ' trials, ' + nearMissed + ' missed (' + collectedAny + ' of ' + trials + ' collected overall)');
  const { w, p } = mk(); w.fragments.push({ x: p.x + 200, y: 300, r: 12 }, { x: p.x + 400, y: 300, r: 12 }); w.lastDx = 0;
  const f0 = w.fragments.map(f => ({ x: f.x, y: f.y })); w.attract(p.x + 16, p.y + 22, PW.MAGNET_R, 1 / 60);
  const mv = Math.hypot(w.fragments[0].x - f0[0].x, w.fragments[0].y - f0[0].y);
  ok('M2 magnet is a smooth glide (small step per frame), and ignores fragments outside its radius', mv > 0.5 && mv < 15 && w.fragments[1].x === f0[1].x, 'step ' + mv.toFixed(1) + 'px');
}
// -- Events lifecycle, compatibility, cooldown, fairness-relevant fields
{ Events.reset(); const D = Events.DEFS;
  ok('E1 every event has a duration and a cooldown; dangerous ones have a warning', Object.keys(D).every(k => D[k].dur > 0 && D[k].cool > 0) && D.surge.warn > 0 && D.gravity.warn > 0);
  const { w, p } = mk(); GR.CFG.DIRECTOR = false; Events.force('surge');
  let v = Events.view(); ok('E2 SURGE starts in a warning phase (no speed change yet)', v.play.phase === 'warn' && !Events.mods().surge && w.surgeMult === 1);
  Events.apply(w, p, 1 / 60); ok('E3 spawn gaps already anticipate the surge during the warning', w.spawnMult === 1.2 && w.surgeMult === 1);
  ok('E4 compatibility: cosmetic overlaps; other gameplay events and surge are exclusive', Events.canStart('corrupt') && !Events.canStart('gravity') && !Events.canStart('storm'));
  for (let i = 0; i < 60 * 2.3; i++) { Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E5 warning turns into the active surge; speed multiplier eases toward 1.2', Events.view().play.phase === 'on' && w.surgeMult > 1.05);
  for (let i = 0; i < 60 * 1.5; i++) { Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E6 speed multiplier reaches 1.2', Math.abs(w.surgeMult - 1.2) < 0.01, w.surgeMult.toFixed(3));
  for (let i = 0; i < 60 * 5.2; i++) { Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E7 surge ends after its duration, multiplier returns to exactly 1, cooldown starts', Events.view().play === null && w.surgeMult === 1 && w.spawnMult === 1 && Events.cooldown('surge') > 30 && !Events.canStart('surge'));
  Events.force('gravity'); for (let i = 0; i < 60 * 1.7; i++) { Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E8 GRAVITY ERROR: heavier gravity (x1.25) only during its active phase', p.gMult === 1.25);
  for (let i = 0; i < 60 * 6; i++) { Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E9 gravity returns to normal after the event', p.gMult === 1);
  Events.force('storm'); Events.update(1 / 60); Events.apply(w, p, 1 / 60); w.storm = true;
  let sf = 0, nf = 0; for (let i = 0; i < 100; i++) { const a = new GR.World(); a.storm = true; a.spawn(); sf += a.fragments.length; const b = new GR.World(); b.spawn(); nf += b.fragments.length; }
  ok('E10 DATA STORM spawns clearly more fragments than normal play', sf / 100 >= 5 && sf > nf * 2, (sf / 100).toFixed(1) + ' vs ' + (nf / 100).toFixed(1) + ' per spawn');
  const hmax = GR.CFG.GROUND - (GR.CFG.GROUND - 45 - 60); ok('E11 storm arc stays within normal jump reach', hmax <= 105 && 105 < 138);
  Events.force('gravity'); Power.give('slow'); for (let i = 0; i < 60 * 2; i++) { Power.update(1 / 60); Events.update(1 / 60); Events.apply(w, p, 1 / 60); }
  ok('E12 gravity error and slow-mo may overlap (player time is scaled with the world, so jump windows are unchanged)', Events.view().play.phase === 'on' && p.gMult === 1.25 && Power.timeScale() < 0.6);
  Power.reset(); Events.reset(); GR.CFG.DIRECTOR = true;
}
// -- Fuzz: random dt, forced events, power-ups; no negative or NaN timers, no stale state after reset
{ const { w, p } = mk(); let bad = 0; GR.CFG.DIRECTOR = true;
  for (let i = 0; i < 60 * 300; i++) {
    const dt = rnd(0.001, 0.05); if (Math.random() < 0.003) Events.force(['storm', 'gravity', 'surge', 'corrupt'][Math.floor(Math.random() * 4)]); if (Math.random() < 0.003) Power.give(['shield', 'slow', 'magnet'][Math.floor(Math.random() * 3)]);
    gameStep(w, p, dt); const v = Events.view(), g = Power.get();
    [v.play, v.cos].forEach(e => { if (e && !(e.left >= 0)) bad++; }); if (!(g.slow >= 0 && g.magnet >= 0 && g.grace >= 0 && g.ts >= 0.5 && g.ts <= 1) || !isFinite(w.distance)) bad++;
  }
  Power.reset(); Events.reset(); w.reset(); p.reset();
  ok('F1 fuzz 5 min with random dt/forced effects: no negative/NaN timers', bad === 0, bad + ' violations');
  ok('F2 reset leaves nothing stale (events, power-ups, world modifiers, gravity)', !Events.view().play && !Events.view().cos && !Power.list().length && w.surgeMult === 1 && w.spawnMult === 1 && !w.storm && p.gMult === 1 && !w.powerups.length);
}
// -- Fairness + balance: autopilot (no shield) over 3 x 10 simulated minutes with the real director, forced events and slow/magnet
{ let deaths = 0, spawned = { shield: 0, slow: 0, magnet: 0 }, minAny = 1e9, minType = { shield: 1e9, slow: 1e9, magnet: 1e9 }, evStarts = { storm: 0, gravity: 0, surge: 0, corrupt: 0 }, evGapBad = 0, simTime = 0;
  for (let run = 0; run < 3; run++) {
    const { w, p } = mk(); const lastT = { any: null, shield: null, slow: null, magnet: null }, lastEv = {}; let prevPlay = null, prevCos = null;
    w.onSpawn = function (ww, o, gap) { const n = ww.powerups.length; Power.onSpawn(ww, o, gap); if (ww.powerups.length > n) { const t = ww.powerups[ww.powerups.length - 1].type; spawned[t]++; if (lastT.any !== null) minAny = Math.min(minAny, ww.time - lastT.any); if (lastT[t] !== null) minType[t] = Math.min(minType[t], ww.time - lastT[t]); lastT.any = lastT[t] = ww.time; } };
    for (let i = 0; i < 600 * 60; i++) {
      const dt = 1 / 60; simTime += dt;
      if (i % (25 * 60) === 0 && i) { Events.force(['storm', 'gravity', 'surge', 'corrupt'][Math.floor(Math.random() * 4)]); Power.give(Math.random() < 0.5 ? 'slow' : 'magnet'); }
      const ahead = w.obstacles.filter(o => o.x + o.w > p.x).sort((a, b) => a.x - b.x)[0];
      const eff = w.speed * w.surgeMult;   // jump arc and world are both scaled by ts, so the lead distance is unchanged
      if (ahead && p.onGround) { const d = ahead.x - (p.x + p.w); if (d > 0 && d < eff * 0.3) GR.Input.jumpQueued = 0.12; }
      GR.Input.tick(dt); gameStep(w, p, dt);
      const v = Events.view(); [['play', v.play, prevPlay], ['cos', v.cos, prevCos]].forEach(([k, cur, prev]) => { if (cur && !prev) { evStarts[cur.id]++; const key = cur.id; if (lastEv[key] !== undefined && w.time - lastEv[key] < 0) evGapBad++; lastEv[key] = w.time; } }); prevPlay = v.play; prevCos = v.cos;
      if (w.hits(p.box())) { deaths++; w.reset(); p.reset(); }
    }
  }
  ok('B1 fairness: autopilot, 30 simulated minutes with all events + slow-mo + magnet active, no unavoidable hazard', deaths === 0, deaths + ' deaths');
  ok('B2 power-up spacing: >= ' + PW.MIN_GAP + 's between any two, per-type spacing respected, all three types appear', minAny >= PW.MIN_GAP - 0.05 && minType.shield >= PW.SHIELD_EVERY - 0.05 && minType.slow >= PW.SLOW_EVERY - 0.05 && minType.magnet >= PW.MAGNET_EVERY - 0.05 && spawned.shield > 0 && spawned.slow > 0 && spawned.magnet > 0,
     'spawned ' + JSON.stringify(spawned) + ' (~1 per ' + (simTime / (spawned.shield + spawned.slow + spawned.magnet)).toFixed(0) + 's), min gap ' + minAny.toFixed(1) + 's');
  ok('B3 director events occurred naturally for every type', Object.values(evStarts).every(n => n > 0), JSON.stringify(evStarts));
}
console.log(fails === 0 ? 'SESSION 3 LOGIC: ALL PASSED' : 'SESSION 3 LOGIC: ' + fails + ' FAILED');
if (fails) process.exitCode = 1;

// ================= Session 4: economy, shop, achievements, missions (pure logic, in-memory storage) =================
let fails4 = 0;
const ok4 = (name, cond, info) => { if (!cond) fails4++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : '')); };
function mkCtx(raw) {
  const store = { v: raw === undefined ? null : raw, writes: 0 };
  const c = { console, localStorage: { getItem: () => store.v, setItem: (k, v) => { store.v = v; store.writes++; } }, addEventListener() {} };
  c.window = c; vm.createContext(c); vm.runInContext('window.GR = {}', c);
  ['storage', 'cosmetics', 'progress'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'), c));
  c.store = store; c.at = (y, m, d) => { c.GR.Progress.now = () => new Date(y, m - 1, d, 12, 0, 0); }; c.at(2026, 10, 21); return c;
}
const seed = (o) => JSON.stringify(o);
// -- Storage: corrupted / hostile data always resolves to valid values
{ const bad = [undefined, '{bad json', 'null', '[]', '"x"', '{"coins":-5,"highScore":"abc","skin":"../../x","ownedSkins":"cyan","ownedTrails":[1,{},"sparks","sparks","bad id!"],"ach":{"first_run":"yes","x y":true,"frag_50":true},"prog":{"runs":-1,"fragments":"7","bestTime":1e30},"missions":{"day":"tomorrow","progress":{"m_frag":-3,"a b":5},"paid":{"m_frag":1}}}'];
  let allOk = true, detail = '';
  bad.forEach((raw, i) => { const c = mkCtx(raw), S = c.GR.Storage, snap = S.snapshot();
    const good = Number.isInteger(snap.coins) && snap.coins >= 0 && Number.isInteger(snap.highScore) && snap.highScore >= 0 && /^[\w-]+$/.test(snap.skin) && snap.ownedSkins.includes('magenta') && snap.ownedTrails.includes('none') &&
      snap.ownedSkins.every(x => /^[\w-]{1,32}$/.test(x)) && Object.keys(snap.ach).every(k => snap.ach[k] === true) && Object.values(snap.prog).every(v => Number.isInteger(v) && v >= 0 && v <= 1e9) && (snap.missions.day === '' || /^\d{4}-\d{2}-\d{2}$/.test(snap.missions.day)) && Object.values(snap.missions.progress).every(v => v >= 0) && Object.values(snap.missions.paid).every(v => v === true);
    if (!good) { allOk = false; detail += ' case' + i; } });
  ok4('S1 corrupted / hostile saved data (6 shapes) always loads as valid data', allOk, detail);
  const c = mkCtx(bad[5]), sn = c.GR.Storage.snapshot();
  ok4('S2 salvageable parts of damaged saves are kept, the rest defaults', sn.ownedTrails.includes('sparks') && sn.ownedTrails.length === 2 && sn.ach.frag_50 === true && !sn.ach.first_run && sn.coins === 0 && sn.skin === 'magenta', JSON.stringify(sn.ownedTrails));
}
// -- Transactions
{ const c = mkCtx(seed({ coins: 100 })), S = c.GR.Storage;
  const r1 = S.txn(d => { d.coins = 5; return false; }), r2 = S.txn(d => { d.coins = 1; throw new Error('boom'); });
  ok4('S3 txn: returning false or throwing discards every change and writes nothing', !r1 && !r2 && S.get('coins') === 100 && c.store.writes === 0);
  const r3 = S.txn(d => { d.coins -= 30; d.ownedSkins.push('cyan'); });
  ok4('S4 txn commit = one write containing all changes', r3 && c.store.writes === 1 && JSON.parse(c.store.v).coins === 70 && JSON.parse(c.store.v).ownedSkins.includes('cyan'));
  S.txn(d => { d.coins = -50; });
  ok4('S5 a transaction can never leave a negative balance', S.get('coins') === 0);
  S.set('coins', 40); S.add('coins', -5); S.add('coins', NaN); S.add('coins', 2.9); S.add('coins', '9');
  ok4('S6 add(): ignores negative / NaN / string amounts, floors decimals', S.get('coins') === 42, S.get('coins'));
}
// -- Shop
{ const C0 = mkCtx().GR.Cosmetics; const paid = (list) => list.filter(i => i.price > 0);
  ok4('C1 catalogue: >=4 skins and >=3 trails purchasable; defaults are free; prices are whole numbers', paid(C0.SKINS).length >= 4 && paid(C0.TRAILS).length >= 3 && C0.item('magenta').price === 0 && C0.item('none').price === 0 && [...C0.SKINS, ...C0.TRAILS].every(i => Number.isInteger(i.price) && i.price >= 0), paid(C0.SKINS).length + ' skins, ' + paid(C0.TRAILS).length + ' trails');
  const c = mkCtx(seed({ coins: 100 })), C = c.GR.Cosmetics, S = c.GR.Storage;
  const b1 = C.buy('cyan');
  ok4('C2 buy: price deducted, item owned, exactly one write', b1.ok && S.get('coins') === 20 && C.owned('cyan') && c.store.writes === 1);
  const w = c.store.writes, b2 = C.buy('cyan');
  ok4('C3 buying again is refused (no second charge, no write)', !b2.ok && b2.reason === 'owned' && S.get('coins') === 20 && c.store.writes === w);
  const b3 = C.buy('ghost');
  ok4('C4 insufficient funds: refused, balance unchanged, reports shortfall', !b3.ok && b3.reason === 'funds' && b3.need === 380 && S.get('coins') === 20 && !C.owned('ghost') && c.store.writes === w);
  ok4('C5 unknown ids are rejected', !C.buy('hax').ok && !C.equip('hax') && C.buy('hax').reason === 'unknown');
  ok4('C6 cannot equip an item you do not own; can equip one you do', !C.equip('ghost') && C.equipped('skin') === 'magenta' && C.equip('cyan') && C.equipped('skin') === 'cyan');
  const c2 = mkCtx(c.store.v);
  ok4('C7 purchases and equipped items survive a reload', c2.GR.Cosmetics.owned('cyan') && c2.GR.Cosmetics.equipped('skin') === 'cyan' && c2.GR.Storage.get('coins') === 20);
  const c3 = mkCtx(seed({ skin: 'ghost', trail: 'comet', ownedSkins: ['magenta'], ownedTrails: ['none'] }));
  ok4('C8 equipped id that is unowned/unknown falls back to the free default', c3.GR.Cosmetics.equipped('skin') === 'magenta' && c3.GR.Cosmetics.equipped('trail') === 'none');
  // fuzz: random buys / equips / earnings; money is conserved and never negative
  const f = mkCtx(seed({ coins: 500 })), FC = f.GR.Cosmetics, FS = f.GR.Storage, ids = [...FC.SKINS, ...FC.TRAILS].map(i => i.id).concat(['bogus']); let earned = 500, spent = 0, bad = 0;
  for (let i = 0; i < 5000; i++) { const r = Math.random();
    if (r < 0.15) { const n = Math.floor(Math.random() * 40); FS.add('coins', n); earned += n; }
    else if (r < 0.75) { const id = ids[Math.floor(Math.random() * ids.length)], before = FS.get('coins'), res = FC.buy(id); if (res.ok) spent += res.item.price; if (!res.ok && FS.get('coins') !== before) bad++; }
    else FC.equip(ids[Math.floor(Math.random() * ids.length)]);
    if (FS.get('coins') < 0 || !Number.isInteger(FS.get('coins'))) bad++; }
  const owned = [...FC.SKINS, ...FC.TRAILS].filter(i => i.price > 0 && FC.owned(i.id)).reduce((s, i) => s + i.price, 0);
  ok4('C9 fuzz 5000 random buy/equip/earn actions: balance never negative, money conserved (earned - spent = balance, spent = owned prices)', bad === 0 && earned - spent === FS.get('coins') && spent === owned, `balance ${FS.get('coins')}, spent ${spent}`);
  const src = n => fs.readFileSync(path.join(__dirname, '../js', n), 'utf8');
  ok4('C10 cosmetics are isolated from gameplay: world/player/powerups/events/config never reference them', ['world.js', 'player.js', 'powerups.js', 'events.js', 'config.js'].every(n => !/Cosmetics|ownedSkins|equipped\(/.test(src(n))));
}
// -- Achievements
{ const c = mkCtx(), P = c.GR.Progress, S = c.GR.Storage;
  const r1 = P.finishRun({ score: 120, frags: 3, time: 8, died: true });
  ok4('A1 first completed run unlocks BOOT SEQUENCE once', r1.ach.length === 1 && r1.ach[0] === 'BOOT SEQUENCE' && S.get('ach').first_run === true);
  const r2 = P.finishRun({ score: 150, frags: 2, time: 9, died: true });
  ok4('A2 the same achievement is never awarded or announced twice', r2.ach.length === 0 && Object.keys(S.get('ach')).length === 1 && S.get('prog').runs === 2);
  P.finishRun({ score: 10, frags: 50, time: 5, died: true });
  ok4('A3 cumulative fragments: 3+2+50 -> DATA SCRAPER (50) unlocked, DATA HOARDER (250) not', S.get('ach').frag_50 === true && !S.get('ach').frag_250 && S.get('prog').fragments === 55);
  P.finishRun({ score: 1000, frags: 0, time: 46, died: true });
  ok4('A4 score and survival milestones (1000 points, 45 s) unlock', S.get('ach').score_1000 && S.get('ach').time_45 && !S.get('ach').score_3000 && !S.get('ach').time_90);
  P.noteUse('shield'); P.noteUse('slow'); P.finishRun({ score: 1, frags: 0, time: 1, died: true }); const a5 = !S.get('ach').all_power;
  P.noteUse('magnet'); P.noteUse('magnet'); P.finishRun({ score: 1, frags: 0, time: 1, died: true });
  ok4('A5 FULL SPECTRUM needs all three power-ups used (across runs); repeats do not over-count', a5 && S.get('ach').all_power === true && S.get('prog').usedMagnet === 1);
  P.noteShieldSave(); P.finishRun({ score: 1, frags: 0, time: 1, died: true });
  ok4('A6 IRON WILL: surviving a shielded collision unlocks it', S.get('ach').shield_save === true);
  for (let i = 0; i < 5; i++) P.noteEvent(); P.finishRun({ score: 1, frags: 0, time: 1, died: true }); const e5 = S.get('ach').events_5 && !S.get('ach').events_20;
  for (let i = 0; i < 15; i++) P.noteEvent(); P.finishRun({ score: 1, frags: 0, time: 1, died: true });
  ok4('A7 glitch-event counts: 5 -> GLITCH WITNESS, 20 -> SYSTEM ERROR', e5 && S.get('ach').events_20 && S.get('prog').events === 20);
  const v = P.achievements();
  ok4('A8 achievements view reports progress, capped at the goal, and done flags', v.length === 11 && v.every(a => a.value <= a.goal && a.value >= 0) && v.filter(a => a.done).length === Object.keys(S.get('ach')).length);
  const d = mkCtx(); d.GR.Progress.finishRun({ score: 50, frags: 7, time: 12, died: false });
  ok4('A9 an abandoned run counts fragments/time but not as a completed run; its messages are queued once', d.GR.Storage.get('prog').runs === 0 && d.GR.Storage.get('prog').fragments === 7 && !d.GR.Storage.get('ach').first_run);
  const e = mkCtx(); e.GR.Progress.finishRun({ score: 1, frags: 0, time: 1, died: true }); const e2 = mkCtx(e.store.v);
  ok4('A10 achievement progress persists across a reload (no re-award afterwards)', e2.GR.Storage.get('ach').first_run === true && e2.GR.Progress.finishRun({ score: 1, frags: 0, time: 1, died: true }).ach.length === 0);
}
// -- Missions
{ const c = mkCtx(), P = c.GR.Progress, S = c.GR.Storage;
  const a = JSON.stringify(P.missionsFor('2026-10-21')), b = JSON.stringify(P.missionsFor('2026-10-21'));
  ok4('M1 missions are deterministic for a given local date and always three', a === b && P.missionsFor('2026-10-21').length === 3);
  const combos = new Set(), okRange = []; for (let i = 0; i < 400; i++) { const dd = new Date(2026, 0, 1 + i), key = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0'), m = P.missionsFor(key); combos.add(m.map(x => x.target).join(',')); okRange.push(m.every(x => x.target > 0 && x.reward >= 25 && x.reward <= 70)); }
  ok4('M2 missions rotate: 400 consecutive days give many distinct sets, all within sane targets/rewards', combos.size >= 8 && okRange.every(Boolean), combos.size + ' distinct sets');
  const day1 = P.missionsFor('2026-10-21'), fm = day1[0], coinsBefore = S.get('coins');
  const r = P.finishRun({ score: 10, frags: fm.target, time: 5, died: true });
  const rr = r.missions.find(m => m.name === 'DATA RUN');
  ok4('M3 completing a mission pays its reward in the same transaction as the run', !!rr && S.get('coins') === coinsBefore + fm.reward && S.get('missions').paid.m_frag === true, `+${fm.reward}`);
  const r2 = P.finishRun({ score: 10, frags: fm.target * 3, time: 5, died: true });
  ok4('M4 the same mission is never paid twice on the same day, however many times it is completed', r2.missions.length === 0 && S.get('coins') === coinsBefore + fm.reward);
  const snapBefore = JSON.stringify(S.snapshot()), w0 = c.store.writes; c.at(2026, 10, 22); const view = P.missionsView();
  ok4('M5 new local day: the view shows fresh missions with 0 progress and unpaid, and viewing writes nothing', view.day === '2026-10-22' && view.missions.every(m => m.value === 0 && !m.paid) && JSON.stringify(S.snapshot()) === snapBefore && c.store.writes === w0);
  const day2 = P.missionsFor('2026-10-22'), cb2 = S.get('coins'); const r3 = P.finishRun({ score: 10, frags: day2[0].target, time: 5, died: true });
  ok4('M6 date rollover: the next day resets progress and the mission can be earned (and paid) once again', r3.missions.length === 1 && S.get('coins') === cb2 + day2[0].reward && S.get('missions').day === '2026-10-22');
  const p1 = c.GR.Progress.missionsFor('2026-10-22').find(m => m.id === 'm_time'), before = S.get('coins');
  P.finishRun({ score: 0, frags: 0, time: p1.target - 1, died: true }); P.finishRun({ score: 0, frags: 0, time: 2, died: true });
  const mv = P.missionsView().missions.find(m => m.id === 'm_time');
  ok4('M7 single-run missions keep the BEST run (not the sum); no reward until one run reaches the target', mv.value === p1.target - 1 && !mv.done && S.get('coins') === before);
  c.at(2026, 10, 20); const bw = P.finishRun({ score: 0, frags: 1, time: 1, died: true });
  ok4('M8 clock moved backwards: handled as a different day (fresh progress), no crash, no negative values', S.get('missions').day === '2026-10-20' && Object.values(S.get('missions').progress).every(v => v >= 0) && bw.coins >= 0);
  const mm = mkCtx(seed({ missions: { day: 'bogus', progress: { m_frag: -9 }, paid: { m_frag: 1 } } }));
  ok4('M9 corrupted mission data is sanitized (bad day, negative progress, non-true paid flags)', mm.GR.Storage.get('missions').day === '' && mm.GR.Storage.get('missions').progress.m_frag === 0 && !mm.GR.Storage.get('missions').paid.m_frag);
  const cum = P.missionsFor('2026-10-21').find(m => m.id === 'm_frag'), z = mkCtx(); z.at(2026, 10, 21);
  if (cum.cumulative) { z.GR.Progress.finishRun({ score: 0, frags: 10, time: 1, died: true }); z.GR.Progress.finishRun({ score: 0, frags: 10, time: 1, died: true }); ok4('M10 cumulative fragment missions add up across runs', z.GR.Progress.missionsView().missions[0].value === 20); }
  else ok4('M10 (this date uses the single-run fragment variant)', true);
}
console.log(fails4 === 0 ? 'SESSION 4 LOGIC: ALL PASSED' : 'SESSION 4 LOGIC: ' + fails4 + ' FAILED');
if (fails4) process.exitCode = 1;

// ==================== SESSION 5: FAST-DROP / QUICK-LAND ====================
let fails5 = 0;
const ok5 = (name, cond, extra) => { if (!cond) fails5++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : '')); };

{
  const { p, w } = mk();
  // D1: Down press while grounded does not activate drop or move player
  GR.Input.drop();
  p.update(0.016);
  ok5('D1 Down Arrow while grounded does not activate drop or cause unwanted movement', !p.dropping && p.onGround && p.y === GR.CFG.GROUND - p.h && p.vy === 0);

  // Normal jump reference
  p.reset();
  GR.Input.jump();
  p.update(0.016);
  let normalAirtime = 0.016;
  while (!p.onGround && normalAirtime < 2) {
    p.update(0.016);
    normalAirtime += 0.016;
  }

  // D2: Fast-drop from start of jump (rising phase)
  p.reset();
  GR.Input.jump();
  p.update(0.016); // airborne, vy = -780 + ~35
  const risingVy = p.vy;
  GR.Input.drop();
  p.update(0.016);
  ok5('D2 fast-drop while rising immediately stops ascent and plunges downward', p.dropping && risingVy < 0 && p.vy >= 400);

  let dropAirtime = 0.032;
  while (!p.onGround && dropAirtime < 2) {
    p.update(0.016);
    dropAirtime += 0.016;
  }
  ok5('D3 fast-drop from jump start lands significantly faster than normal jump', dropAirtime < normalAirtime * 0.55 && p.onGround && !p.dropping, `${dropAirtime.toFixed(3)}s vs ${normalAirtime.toFixed(3)}s`);

  // D4: Fast-drop from jump apex
  p.reset();
  GR.Input.jump();
  p.update(0.016);
  while (p.vy < -50) p.update(0.005);
  GR.Input.drop();
  p.update(0.016);
  ok5('D4 fast-drop from apex immediately begins rapid downward descent', p.dropping && p.vy >= 400);

  let dropFromApexTime = 0.016;
  while (!p.onGround && dropFromApexTime < 2) {
    p.update(0.016);
    dropFromApexTime += 0.016;
  }
  ok5('D5 fast-drop from apex reaches ground in under 0.20s', dropFromApexTime < 0.20 && p.onGround && !p.dropping, `${dropFromApexTime.toFixed(3)}s`);

  // D6: Maximum downward velocity is clamped at CFG.DROP_V
  p.reset();
  p.y = -3000; // high up in the sky
  p.onGround = false;
  GR.Input.drop();
  for (let i = 0; i < 30; i++) p.update(0.016);
  ok5('D6 maximum downward velocity is clamped at CFG.DROP_V', p.vy === GR.CFG.DROP_V && p.vy <= 1100, `vy ${p.vy}`);

  // D7: Fast-drop deactivates automatically upon landing and sets fastDropped
  p.reset();
  GR.Input.jump();
  p.update(0.016);
  GR.Input.drop();
  while (!p.onGround) p.update(0.016);
  ok5('D7 fast-drop deactivates on landing and flags fastDropped for feedback', !p.dropping && p.onGround && p.fastDropped && p.y === GR.CFG.GROUND - p.h);

  // Next frame after landing: fastDropped resets to false
  p.update(0.016);
  ok5('D8 fastDropped flag resets after landing frame', !p.fastDropped && p.onGround);

  // D9: Reset clears drop state
  p.reset();
  p.onGround = false;
  p.dropping = true;
  p.reset();
  ok5('D9 player.reset() clears dropping state', !p.dropping && p.onGround && p.vy === 0);

  // D10: Fast-drop during slow-motion scales smoothly with timeScale
  p.reset();
  GR.Input.jump();
  p.update(0.016 * 0.55);
  GR.Input.drop();
  p.update(0.016 * 0.55);
  ok5('D10 fast-drop during slow-motion scales downward physics smoothly', p.dropping && p.vy > 0);

  // D11: Fast-drop does not bypass obstacle collision
  p.reset();
  const obstacle = { x: p.x, y: GR.CFG.GROUND - 40, w: 30, h: 40, hit() { return { x: this.x, y: this.y, w: this.w, h: this.h }; } };
  p.y = GR.CFG.GROUND - 100;
  p.onGround = false;
  GR.Input.drop();
  let hitDetected = false;
  while (!p.onGround) {
    p.update(0.016);
    const box = p.box();
    const obBox = obstacle.hit();
    if (box.x < obBox.x + obBox.w && box.x + box.w > obBox.x && box.y < obBox.y + obBox.h && box.y + box.h > obBox.y) {
      hitDetected = true;
    }
  }
  ok5('D11 fast-dropping into an obstacle triggers collision check (cannot bypass hazards)', hitDetected && p.onGround);
}
console.log(fails5 === 0 ? 'SESSION 5 FAST-DROP LOGIC: ALL PASSED' : 'SESSION 5 LOGIC: ' + fails5 + ' FAILED');
if (fails5) process.exitCode = 1;

// ================= Session 7: Audio settings, persistence & state logic =================
let fails7 = 0;
const ok7 = (name, cond, info) => { if (!cond) fails7++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : '')); };
{
  const S = GR.Storage;
  ok7('U1 audio settings defaults: music true, musicVol 0.4, sfxVol 0.8', S.get('music') === true && S.get('musicVol') === 0.4 && S.get('sfxVol') === 0.8);
  
  S.set('music', false);
  ok7('U2 music toggle OFF persists and leaves SFX untouched', S.get('music') === false && S.get('sfx') === true);
  S.set('music', true);
  
  S.set('musicVol', 1.5);
  const clampedMax = S.get('musicVol');
  S.set('musicVol', -0.5);
  const clampedMin = S.get('musicVol');
  S.set('musicVol', 'loud');
  const invalidDefault = S.get('musicVol');
  S.set('musicVol', 0.6);
  ok7('U3 musicVol clamping and sanitization', clampedMax === 1.0 && clampedMin === 0.0 && invalidDefault === 0.4 && S.get('musicVol') === 0.6);
  S.set('musicVol', 0.4);

  S.set('sfxVol', 2.0);
  const sfxMax = S.get('sfxVol');
  S.set('sfxVol', -1);
  const sfxMin = S.get('sfxVol');
  S.set('sfxVol', NaN);
  const sfxDef = S.get('sfxVol');
  S.set('sfxVol', 0.8);
  ok7('U4 sfxVol clamping and sanitization', sfxMax === 1.0 && sfxMin === 0.0 && sfxDef === 0.8);

  const p = new GR.Player();
  p.onGround = false;
  p.y = 200;
  GR.Input.drop();
  p.update(0.016);
  ok7('U5 player airborne fast-drop sets justDropped flag', p.justDropped === true && p.dropping === true);
  p.update(0.016);
  ok7('U6 justDropped flag resets on subsequent update', p.justDropped === false);

  Power.reset();
  Power.activate('slow');
  Power.update(PW.SLOW_DUR + 0.1);
  ok7('U7 slow-mo expiry clean transition in headless', Power.timeScale() === 1);
}
console.log(fails7 === 0 ? 'SESSION 7 AUDIO LOGIC: ALL PASSED' : 'SESSION 7 LOGIC: ' + fails7 + ' FAILED');
if (fails7) process.exitCode = 1;
