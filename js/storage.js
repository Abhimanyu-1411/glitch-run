// localStorage wrapper: scores, coins, settings, cosmetics, achievements, missions.
// Every key has a cleaner, so corrupted / hostile / blocked storage always resolves to valid data.
// txn(fn) = all-or-nothing update on a copy + ONE write (used for purchases and rewards).
GR.Storage = (function () {
  const KEY = 'glitchrun.v1';
  let prefersReduced = false;
  try { prefersReduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  const PROG = ['runs', 'fragments', 'bestTime', 'events', 'shieldSaves', 'usedShield', 'usedSlow', 'usedMagnet'];
  const isId = function (s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(s); };
  const num = function (v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.min(Math.floor(v), 1e9) : 0; };
  const bool = function (d) { return function (v) { return typeof v === 'boolean' ? v : d; }; };
  const id = function (d) { return function (v) { return isId(v) ? v : d; }; };
  const ids = function (d) {   // unique id list; the free default items are always present
    return function (v) {
      const out = [];
      if (Array.isArray(v)) v.slice(0, 64).forEach(function (x) { if (isId(x) && out.indexOf(x) < 0) out.push(x); });
      d.forEach(function (x) { if (out.indexOf(x) < 0) out.unshift(x); });
      return out;
    };
  };
  const flags = function (o) {
    const r = {};
    if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).slice(0, 64).forEach(function (k) { if (isId(k) && o[k] === true) r[k] = true; });
    return r;
  };
  const numMap = function (o) {
    const r = {};
    if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).slice(0, 16).forEach(function (k) { if (isId(k)) r[k] = num(o[k]); });
    return r;
  };
  const vol = function (d) {
    return function (v) { return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : d; };
  };
  const clean = {
    highScore: num, coins: num, sfx: bool(true), shake: bool(true), reduceMotion: bool(prefersReduced),
    music: bool(true), musicVol: vol(0.4), sfxVol: vol(0.8),
    skin: id('magenta'), trail: id('none'), ownedSkins: ids(['magenta']), ownedTrails: ids(['none']),
    ach: flags,
    prog: function (o) { const r = {}; PROG.forEach(function (k) { r[k] = num(o && o[k]); }); return r; },
    missions: function (o) { return { day: (o && typeof o.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.day)) ? o.day : '', progress: numMap(o && o.progress), paid: flags(o && o.paid) }; }
  };
  const keys = Object.keys(clean);
  function normalize(raw) { const out = {}; keys.forEach(function (k) { out[k] = clean[k](raw && typeof raw === 'object' ? raw[k] : undefined); }); return out; }
  let data;
  try { data = normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { data = normalize({}); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  const copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  return {
    get: function (k) { return data[k]; },
    set: function (k, v) { if (clean[k]) { data[k] = clean[k](v); save(); } },
    add: function (k, n) { if (clean[k] === num && typeof n === 'number' && n > 0) { data[k] = num(data[k] + Math.floor(n)); save(); } },
    // fn gets a deep copy; returning false (or throwing) discards it. Otherwise the cleaned copy replaces the data in one write.
    txn: function (fn) {
      try { const draft = copy(data); if (fn(draft) === false) return false; data = normalize(draft); save(); return true; }
      catch (e) { return false; }
    },
    snapshot: function () { return copy(data); }
  };
})();
