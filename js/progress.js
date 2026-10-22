// Progression: run tracking, achievements, daily missions. All writes happen in ONE storage transaction per finished run,
// and finishRun is only called from the game's once-per-run bank(), so rewards cannot be granted twice.
GR.Progress = (function () {
  const S = GR.Storage;
  const api = { now: function () { return new Date(); } };   // tests replace now() to simulate dates
  function todayKey() {   // LOCAL calendar day, e.g. 2026-10-21
    const n = api.now(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // Deterministic by local date: same day -> same missions; new day -> new targets. No server involved.
  function missionsFor(day) {
    const h = hash(day), t = function (n) { return (h >>> (n * 3)) % 3; };
    const a = t(0), b = t(1), c = t(2), single = ((h >>> 9) & 1) === 1;
    const fragT = single ? [12, 18, 25][a] : [30, 45, 60][a], timeT = [40, 60, 90][b], scoreT = [1000, 1800, 2800][c];
    return [
      { id: 'm_frag', name: 'DATA RUN', stat: 'frags', cumulative: !single, target: fragT, reward: [25, 35, 50][a], desc: single ? 'Collect ' + fragT + ' fragments in a single run' : 'Collect ' + fragT + ' fragments today (all runs)' },
      { id: 'm_time', name: 'UPTIME TEST', stat: 'time', cumulative: false, target: timeT, reward: [25, 40, 60][b], desc: 'Survive ' + timeT + ' seconds in a single run' },
      { id: 'm_score', name: 'SCORE ATTACK', stat: 'score', cumulative: false, target: scoreT, reward: [30, 45, 70][c], desc: 'Reach a score of ' + scoreT + ' in a single run' }
    ];
  }
  const ACH = [
    { id: 'first_run',   name: 'BOOT SEQUENCE',  desc: 'Complete your first run',               goal: 1,    val: function (p) { return p.runs; } },
    { id: 'frag_50',     name: 'DATA SCRAPER',   desc: 'Collect 50 fragments in total',          goal: 50,   val: function (p) { return p.fragments; } },
    { id: 'frag_250',    name: 'DATA HOARDER',   desc: 'Collect 250 fragments in total',         goal: 250,  val: function (p) { return p.fragments; } },
    { id: 'score_1000',  name: 'SIGNAL RISING',  desc: 'Reach a score of 1,000',                 goal: 1000, val: function (p, s) { return s.best; } },
    { id: 'score_3000',  name: 'OVERCLOCKED',    desc: 'Reach a score of 3,000',                 goal: 3000, val: function (p, s) { return s.best; } },
    { id: 'time_45',     name: 'UPTIME',         desc: 'Survive 45 seconds in one run',          goal: 45,   val: function (p) { return p.bestTime; } },
    { id: 'time_90',     name: 'LONG UPTIME',    desc: 'Survive 90 seconds in one run',          goal: 90,   val: function (p) { return p.bestTime; } },
    { id: 'all_power',   name: 'FULL SPECTRUM',  desc: 'Use all three power-ups',                goal: 3,    val: function (p) { return p.usedShield + p.usedSlow + p.usedMagnet; } },
    { id: 'shield_save', name: 'IRON WILL',      desc: 'Survive a collision using a shield',     goal: 1,    val: function (p) { return p.shieldSaves; } },
    { id: 'events_5',    name: 'GLITCH WITNESS', desc: 'Experience 5 glitch events',             goal: 5,    val: function (p) { return p.events; } },
    { id: 'events_20',   name: 'SYSTEM ERROR',   desc: 'Experience 20 glitch events',            goal: 20,   val: function (p) { return p.events; } }
  ];
  let cur, pending = [];
  function beginRun() { cur = { events: 0, shield: 0, useShield: 0, useSlow: 0, useMagnet: 0 }; }
  beginRun();
  function noteEvent() { cur.events++; }
  function noteUse(type) { if (type === 'shield') cur.useShield = 1; else if (type === 'slow') cur.useSlow = 1; else if (type === 'magnet') cur.useMagnet = 1; }
  function noteShieldSave() { cur.shield++; }

  function finishRun(sum) {
    const notes = { ach: [], missions: [], coins: 0 }, day = todayKey(), defs = missionsFor(day), run = cur;
    S.txn(function (d) {
      const p = d.prog;
      if (sum.died) p.runs++;
      p.fragments += sum.frags; p.bestTime = Math.max(p.bestTime, Math.floor(sum.time)); p.events += run.events; p.shieldSaves += run.shield;
      if (run.useShield) p.usedShield = 1; if (run.useSlow) p.usedSlow = 1; if (run.useMagnet) p.usedMagnet = 1;
      const m = d.missions;
      if (m.day !== day) { m.day = day; m.progress = {}; m.paid = {}; }   // new local day (or clock moved): fresh missions
      defs.forEach(function (ms) {
        const v = sum[ms.stat] || 0, old = m.progress[ms.id] || 0;
        m.progress[ms.id] = ms.cumulative ? old + v : Math.max(old, v);
        if (m.progress[ms.id] >= ms.target && !m.paid[ms.id]) { m.paid[ms.id] = true; d.coins += ms.reward; notes.coins += ms.reward; notes.missions.push({ name: ms.name, reward: ms.reward }); }
      });
      ACH.forEach(function (a) {
        if (!d.ach[a.id] && a.val(p, { best: Math.max(d.highScore, sum.score) }) >= a.goal) { d.ach[a.id] = true; notes.ach.push(a.name); }
      });
    });
    beginRun();
    if (!sum.died) {   // abandoned / page-close runs: queue the messages for the next menu visit
      notes.missions.forEach(function (x) { pending.push('MISSION COMPLETE: ' + x.name + ' +' + x.reward + ' COINS'); });
      notes.ach.forEach(function (n) { pending.push('ACHIEVEMENT UNLOCKED: ' + n); });
    }
    return notes;
  }
  function takeNotices() { const r = pending; pending = []; return r; }
  function achievements() {
    const p = S.get('prog'), st = { best: S.get('highScore') }, un = S.get('ach');
    return ACH.map(function (a) { const v = a.val(p, st); return { id: a.id, name: a.name, desc: a.desc, goal: a.goal, value: Math.min(v, a.goal), done: !!un[a.id] }; });
  }
  function missionsView() {   // reading never writes: a stale day just shows fresh (empty) progress
    const day = todayKey(), m = S.get('missions'), same = m.day === day;
    return { day: day, missions: missionsFor(day).map(function (ms) {
      const v = same ? (m.progress[ms.id] || 0) : 0;
      return { id: ms.id, name: ms.name, desc: ms.desc, target: ms.target, reward: ms.reward, value: Math.min(v, ms.target), done: v >= ms.target, paid: same && !!m.paid[ms.id] };
    }) };
  }
  Object.assign(api, { todayKey: todayKey, missionsFor: missionsFor, ACH: ACH, beginRun: beginRun, noteEvent: noteEvent, noteUse: noteUse, noteShieldSave: noteShieldSave,
                       finishRun: finishRun, takeNotices: takeNotices, achievements: achievements, missionsView: missionsView });
  return api;
})();
