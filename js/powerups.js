// NOTE: slow-mo scales the WORLD and the PLAYER PHYSICS by the same factor (relative motion, jump windows and fairness stay
// identical to normal play, even if slow-mo is picked up mid-jump); input buffering and every UI/effect timer stay in real time.
// Power-ups: shield (one hit), slow-mo (timed world slowdown), magnet (timed attraction). Timers tick only inside update(),
// which the game calls only while playing, so pause/menu/game-over never advance them.
GR.Power = (function () {
  const C = GR.CFG, P = C.POWER;
  const DEF = {
    shield: { label: 'SHIELD', color: '#3af', every: P.SHIELD_EVERY },
    slow:   { label: 'SLOW-MO', color: '#b6f', every: P.SLOW_EVERY },
    magnet: { label: 'MAGNET', color: '#fa0', every: P.MAGNET_EVERY }
  };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  let shield, grace, slow, magnet, ts, lastAny, last;
  function reset() {
    shield = false; grace = 0; slow = 0; magnet = 0; ts = 1; lastAny = 3;
    last = { shield: -12, slow: -18, magnet: -14 };   // first power-up becomes eligible at ~12s of world time
  }
  function activate(type) {   // re-collecting refreshes the timer; it never stacks or extends beyond the full duration
    if (type === 'shield') shield = true;
    else if (type === 'slow') slow = P.SLOW_DUR;
    else if (type === 'magnet') magnet = P.MAGNET_DUR;
    else return false;
    return true;
  }
  function update(dt) {
    if (grace > 0) grace = Math.max(0, grace - dt);
    if (slow > 0) {
      slow = Math.max(0, slow - dt);
      if (slow === 0 && GR.Audio) GR.Audio.play('slowEnd');
    }
    if (magnet > 0) magnet = Math.max(0, magnet - dt);
    const target = slow > 0 ? P.SLOW_SCALE : 1;
    ts += (target - ts) * (1 - Math.exp(-6 * dt));
    if (Math.abs(ts - target) < 0.003) ts = target;
  }
  function consumeShield() { if (!shield) return false; shield = false; grace = P.SHIELD_GRACE; return true; }
  // World spawn hook: rate-limited, one power-up on screen at a time, never a type that is already active.
  function onSpawn(world, o, gap) {
    if (!C.DIRECTOR || world.powerups.length || world.time - lastAny < P.MIN_GAP) return;
    const ok = Object.keys(DEF).filter(function (k) {
      const busy = k === 'shield' ? shield : k === 'slow' ? slow > 0 : magnet > 0;
      return !busy && world.time - last[k] >= DEF[k].every;
    });
    if (!ok.length || Math.random() > 0.55) return;
    const type = ok[Math.floor(Math.random() * ok.length)];
    world.powerups.push({ type: type, x: o.x + o.w + gap * 0.3, y: C.GROUND - rnd(35, 100), r: 15 });
    lastAny = last[type] = world.time;
  }
  function list() {
    const out = [];
    if (shield) out.push({ type: 'shield', label: 'SHIELD', color: DEF.shield.color, timed: false, left: 1, dur: 1 });
    if (slow > 0) out.push({ type: 'slow', label: 'SLOW-MO', color: DEF.slow.color, timed: true, left: slow, dur: P.SLOW_DUR });
    if (magnet > 0) out.push({ type: 'magnet', label: 'MAGNET', color: DEF.magnet.color, timed: true, left: magnet, dur: P.MAGNET_DUR });
    return out;
  }
  reset();
  return {
    reset: reset, activate: activate, give: activate, update: update, consumeShield: consumeShield, onSpawn: onSpawn, list: list,
    timeScale: function () { return ts; }, magnetActive: function () { return magnet > 0; }, grace: function () { return grace; },
    def: function (t) { return DEF[t]; },
    get: function () { return { shield: shield, grace: grace, slow: slow, magnet: magnet, ts: ts }; }
  };
})();
