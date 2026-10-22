// Simulation glitch events. One gameplay event at a time (storm | gravity | surge); the cosmetic VISUAL CORRUPTION may overlap
// with any of them. Dangerous events get a warning phase. Every event has a duration and a per-event cooldown. Timers tick only
// while the game calls update() (i.e. while playing), so pause is automatically safe.
GR.Events = (function () {
  const C = GR.CFG;
  const rnd = function (a, b) { return a + Math.random() * (b - a); };
  const SURGE = 1.2, HEAVY = 1.25;   // obstacle speed x1.2; gravity x1.25 (shorter jumps, still clears every hazard)
  const DEFS = {
    storm:   { name: 'DATA STORM',        kind: 'play',     warn: 0,   dur: 6, cool: 30, sub: 'EXTRA DATA FRAGMENTS' },
    gravity: { name: 'GRAVITY ERROR',     kind: 'play',     warn: 1.5, dur: 6, cool: 40, sub: 'HEAVY GRAVITY - SHORTER JUMPS' },
    surge:   { name: 'SYSTEM SURGE',      kind: 'play',     warn: 2.2, dur: 5, cool: 40, sub: 'OBSTACLES FASTER' },
    corrupt: { name: 'VISUAL CORRUPTION', kind: 'cosmetic', warn: 0,   dur: 5, cool: 25, sub: 'DISPLAY UNSTABLE' }
  };
  let t, nextAt, play, cos, cd;
  function reset() { t = 0; nextAt = 15; play = null; cos = null; cd = {}; }
  function canStart(id) { const d = DEFS[id]; return !(cd[id] > 0) && (d.kind === 'play' ? !play : !cos); }
  function start(id) {
    const d = DEFS[id];
    const o = { id: id, name: d.name, sub: d.sub, dur: d.dur, danger: d.warn > 0, phase: d.warn > 0 ? 'warn' : 'on', left: d.warn > 0 ? d.warn : d.dur };
    if (d.kind === 'play') play = o; else cos = o;
    if (api.onStart) api.onStart(id);   // progression hook (achievements)
    nextAt = t + d.warn + (d.kind === 'play' ? d.dur : 0) + rnd(6, 10);
  }
  function step(o, dt) {
    if (!o) return null;
    o.left -= dt;
    if (o.left <= 0) {
      if (o.phase === 'warn') { o.phase = 'on'; o.left = DEFS[o.id].dur; }
      else { cd[o.id] = DEFS[o.id].cool; return null; }
    }
    return o;
  }
  function update(dt) {
    t += dt;
    Object.keys(cd).forEach(function (k) { if (cd[k] > 0) cd[k] = Math.max(0, cd[k] - dt); });
    play = step(play, dt); cos = step(cos, dt);
    if (C.DIRECTOR && t >= nextAt) {
      const ids = Object.keys(DEFS).filter(canStart);
      if (ids.length) start(ids[Math.floor(Math.random() * ids.length)]); else nextAt = t + 2;
    }
  }
  function mods() {
    const on = function (o, id) { return !!o && o.id === id && o.phase === 'on'; };
    return { surge: on(play, 'surge'), gravity: on(play, 'gravity'), storm: on(play, 'storm'), corrupt: on(cos, 'corrupt') };
  }
  // Pushes the current event state into world/player (eased surge; spawn gaps anticipate the surge from the warning on,
  // so every obstacle that is on screen when the surge starts was already spaced for the higher speed).
  function apply(world, player, dt) {
    const m = mods(), target = m.surge ? SURGE : 1;
    world.surgeMult += (target - world.surgeMult) * (1 - Math.exp(-5 * dt));
    if (Math.abs(world.surgeMult - target) < 0.003) world.surgeMult = target;
    world.spawnMult = (play && play.id === 'surge') ? SURGE : 1;
    world.storm = m.storm;
    player.gMult = m.gravity ? HEAVY : 1;
  }
  function force(id) { if (DEFS[id].kind === 'play') play = null; else cos = null; start(id); }   // test/debug hook
  function view() { return { play: play && Object.assign({}, play), cos: cos && Object.assign({}, cos) }; }
  reset();
  const api = { onStart: null, reset: reset, update: update, apply: apply, mods: mods, view: view, force: force, canStart: canStart, DEFS: DEFS,
           cooldown: function (id) { return cd[id] || 0; } };
  return api;
})();
