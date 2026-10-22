// Shared namespace + tunable constants. Logical canvas is 800x450 (CSS scales it).
window.GR = window.GR || {};
GR.CFG = {
  W: 800, H: 450, GROUND: 380,
  GRAVITY: 2200,        // px/s^2
  JUMP_V: 780,          // px/s  (apex ~138px, airtime ~0.71s)
  SPEED_START: 300, SPEED_MAX: 720, SPEED_ACCEL: 5,  // px/s, px/s^2
  JUMP_BUFFER: 0.12,    // s a jump press is remembered
  DROP_V: 1100          // px/s max downward velocity during fast-drop
};
// Session 3: power-ups + glitch events. DIRECTOR=false disables random spawning/scheduling (tests only; force/give hooks still work).
GR.CFG.DIRECTOR = !window.GR_NO_DIRECTOR;
GR.CFG.POWER = {
  SLOW_DUR: 5, SLOW_SCALE: 0.55, MAGNET_DUR: 7, MAGNET_R: 220, SHIELD_GRACE: 0.45,
  MIN_GAP: 9,                                   // s of world time between any two power-ups
  SHIELD_EVERY: 24, SLOW_EVERY: 30, MAGNET_EVERY: 26   // per-type minimum spacing (s)
};
