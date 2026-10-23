// Game: state machine (menu/settings/playing/paused/over), single rAF loop, scoring, banking, FX/shake/veil, rendering.
GR.Game = (function () {
  const C = GR.CFG, S = GR.Storage, FX = GR.FX;
  let ctx, player, world, state = 'menu', last = 0, score = 0, frags = 0, newBest = false, onState = null, runActive = false;
  let dead = false, bestAtStart = 0, visT = 0, shake = 0, shX = 0, shY = 0, veilA = 0, veilRate = 0, veilCol = '5,5,15';
  let stars = [], gBg, gGlow, gVig, notice = null, barsDrawn = 0, runTime = 0, lastNotes = null;
  let canvasResizeObserver = null;
  const FONT = '"Courier New", monospace';
  const reduced = function () { return !!S.get('reduceMotion'); };

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    // Drawing remains in the game's 800x450 logical coordinate space; only the backing buffer changes.
    ctx.setTransform(canvas.width / C.W, 0, 0, canvas.height / C.H, 0, 0);
  }

  function info() { return { score: score, frags: frags, best: S.get('highScore'), coins: S.get('coins'), newBest: newBest, notes: lastNotes }; }
  function setState(s) {
    state = s;
    if (GR.Audio && GR.Audio.onState) GR.Audio.onState(s);
    if (onState) onState(s, info());
  }

  function init(canvas, cb) {
    ctx = canvas.getContext('2d'); onState = cb;
    resizeCanvas(canvas);
    if (window.ResizeObserver) {
      canvasResizeObserver = new ResizeObserver(function () { resizeCanvas(canvas); });
      canvasResizeObserver.observe(canvas);
    } else addEventListener('resize', function () { resizeCanvas(canvas); });
    addEventListener('orientationchange', function () { resizeCanvas(canvas); });
    player = new GR.Player(); world = new GR.World(); world.onSpawn = GR.Power.onSpawn;
    GR.Events.onStart = function (id) { GR.Progress.noteEvent(id); };
    GR.Cosmetics.setPreviewCanvas(document.getElementById('shopPreview'));
    gBg = ctx.createLinearGradient(0, 0, 0, C.GROUND); gBg.addColorStop(0, '#05050f'); gBg.addColorStop(1, '#1a0a33');
    gGlow = ctx.createLinearGradient(0, C.GROUND - 80, 0, C.GROUND); gGlow.addColorStop(0, 'rgba(255,0,255,0)'); gGlow.addColorStop(1, 'rgba(255,0,255,.2)');
    gVig = ctx.createRadialGradient(C.W / 2, C.H / 2, C.H * 0.5, C.W / 2, C.H / 2, C.W * 0.68); gVig.addColorStop(0, 'rgba(0,0,0,0)'); gVig.addColorStop(1, 'rgba(0,0,0,.5)');
    for (let i = 0; i < 70; i++) { const z = [0.3, 0.6, 1][i % 3]; stars.push({ x: Math.random() * C.W, y: Math.random() * (C.GROUND - 30), z: z, size: z > 0.8 ? 2 : 1, p: Math.random() * 6.28 }); }
    GR.Input.bind(canvas);
    GR.Input.onPause = toggle;
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
    addEventListener('blur', pause);
    addEventListener('pagehide', bank);
    setState('menu');
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  // ---- visual state helpers (never touch gameplay) ----
  function addShake(a) { if (S.get('shake') && !reduced()) shake = Math.min(16, shake + a); }
  function veil(a, dur, col) { if (reduced()) return; veilA = a; veilRate = a / dur; veilCol = col; }
  function resetVisuals() { FX.clear(); shake = shX = shY = 0; veilA = 0; dead = false; GR.Power.reset(); GR.Events.reset(); notice = null; }

  function start() {
    bank();   // restarting from pause abandons the old run: keep what it earned
    resetVisuals();
    player.reset(); world.reset(); score = 0; frags = 0; newBest = false; runActive = true; bestAtStart = S.get('highScore');
    runTime = 0; lastNotes = null; GR.Progress.beginRun();
    GR.Input.clear(); setState('playing'); veil(0.85, 0.35, '5,5,15');
  }
  function pause() { if (state === 'playing') setState('paused'); }
  function resume() { if (state === 'paused') { GR.Input.clear(); setState('playing'); veil(0.5, 0.25, '5,5,15'); } }
  function toggle() { if (state === 'playing') pause(); else if (state === 'paused') resume(); else if (isPage(state)) { if (!(state === 'shop' && GR.Screens.back())) toMenu(); } }
  function toMenu() { bank(); resetVisuals(); player.reset(); world.reset(); score = 0; frags = 0; setState('menu'); }
  function isPage(s) { return s === 'settings' || s === 'shop' || s === 'achievements' || s === 'missions'; }
  function openScreen(name) { if (state === 'menu' && isPage(name)) setState(name); }
  function openSettings() { openScreen('settings'); }

  // Banks the current run exactly once (death, restart/menu from pause, or page close).
  function bank(died) {   // died === true only from die(); pagehide passes an Event
    if (!runActive) return;
    runActive = false;
    if (frags > 0) S.add('coins', frags);
    if (score > S.get('highScore')) { S.set('highScore', score); newBest = true; }
    lastNotes = GR.Progress.finishRun({ score: score, frags: frags, time: runTime, died: died === true });   // achievements + missions, once per run
    if (lastNotes && GR.Audio) {
      if (lastNotes.ach && lastNotes.ach.length > 0) GR.Audio.play('unlock');
      if (lastNotes.missions && lastNotes.missions.length > 0) GR.Audio.play('mission');
    }
  }
  function die() {
    bank(true); dead = true; GR.Power.reset(); GR.Events.reset();   // effects never outlive the run
    const cx = player.x + player.w / 2, cy = player.y + player.h / 2;
    FX.burst(cx, cy, 30, { color: '#f0f', speed: 320, life: 0.8, size: 4, gravity: 400 });
    FX.burst(cx, cy, 20, { color: '#ff3d6e', speed: 240, life: 0.7, size: 3, gravity: 300 });
    FX.burst(cx, cy, 10, { color: '#fff', speed: 380, life: 0.4, size: 2 });
    addShake(14); veil(0.55, 0.3, '255,255,255');
    if (GR.Audio) {
      if (newBest) GR.Audio.play('newBest');
      else GR.Audio.play('die');
    }
    setState('over');
  }
  function say(text, color) { notice = { text: text, color: color, t: 1.8 }; }
  function pickup(type) {
    GR.Power.activate(type); GR.Progress.noteUse(type);
    const d = GR.Power.def(type);
    FX.burst(player.x + player.w / 2, player.y + player.h / 2, 14, { color: d.color, speed: 200, life: 0.5, size: 3 });
    say(d.label + ' ACTIVE', d.color);
    if (GR.Audio) {
      if (type === 'slow') GR.Audio.play('slowStart');
      else if (type === 'magnet') GR.Audio.play('magnetStart');
      else GR.Audio.play('powerup');
    }
  }
  // Shield is resolved BEFORE game over. One collision spends at most one shield: every overlapping hazard is destroyed at once
  // and a short grace period prevents a second hit from the same obstacle cluster.
  function hit() {
    if (GR.Power.grace() > 0) return;
    if (GR.Power.consumeShield()) {
      world.removeHits(player.box()).forEach(function (o) { FX.burst(o.x + o.w / 2, o.y + o.h / 2, 14, { color: '#ff3d6e', speed: 260, life: 0.5, size: 3 }); });
      FX.burst(player.x + player.w / 2, player.y + player.h / 2, 22, { color: '#3af', speed: 300, life: 0.6, size: 3 });
      addShake(5); say('SHIELD BROKE', '#3af'); GR.Progress.noteShieldSave();
      if (GR.Audio) GR.Audio.play('shieldBreak');
      return;
    }
    die();
  }
  function update(dt) {
    GR.Input.tick(dt);   // input buffer and all timers run in real time
    runTime += dt;
    GR.Power.update(dt); GR.Events.update(dt); GR.Events.apply(world, player, dt);
    const ts = GR.Power.timeScale();   // slow-mo: world AND player physics share this scale, so jump windows never change
    player.update(dt * ts);
    GR.Cosmetics.trail(FX, GR.Cosmetics.equipped('trail'), player, dt);   // cosmetic particles only
    const fx = player.x + player.w / 2, fy = C.GROUND;
    if (player.jumped) {
      FX.burst(fx, fy, 8, { color: '#0ff', speed: 110, life: 0.35, size: 3, dust: true });
      if (GR.Audio) GR.Audio.play('jump');
    }
    if (player.justDropped) {
      if (GR.Audio) GR.Audio.play('drop');
    }
    if (player.fastDropped) {
      FX.burst(fx, fy, reduced() ? 6 : 14, { color: '#0ff', speed: 180, life: 0.4, size: 3, dust: true });
      addShake(2.5);
      if (GR.Audio) GR.Audio.play('land');
    } else if (player.landVy > 300) {
      FX.burst(fx, fy, 6, { color: '#0ff', speed: 130, life: 0.35, size: 3, dust: true });
    }
    if (player.dropping && !reduced()) {
      FX.burst(player.x + player.w * 0.5, player.y + 4, 1, { color: '#0ff', vy: -180, vx: (Math.random() - 0.5) * 40, life: 0.22, size: 3 });
    }
    world.update(dt * ts);
    if (GR.Power.magnetActive()) world.attract(fx, player.y + player.h / 2, C.POWER.MAGNET_R, dt);   // glide only; collect() still decides pickup
    const n = world.collect(player.box());
    if (n > 0) {
      frags += n;
      const pts = (world.collected && world.collected.length) ? world.collected : [{ x: fx, y: player.y + player.h / 2 }];
      pts.forEach(function (p) { FX.burst(p.x, p.y, 12, { color: '#ff0', speed: 170, life: 0.45, size: 3 }); });
      world.collected = []; addShake(2.2);
      if (GR.Audio) GR.Audio.play('fragment');
    }
    world.collectPower(player.box()).forEach(pickup);
    score = Math.floor(world.distance / 10) + frags * 50;
    if (world.hits(player.box())) hit();
  }
  // Visual-only update; frozen while paused so the pause screen is a still frame.
  function visual(dt) {
    visT += dt; FX.update(dt);
    if (notice) { notice.t -= dt; if (notice.t <= 0) notice = null; }
    if (shake > 0) { shake *= Math.exp(-9 * dt); if (shake < 0.1) shake = 0; }
    if (shake > 0) { shX = (Math.random() * 2 - 1) * shake; shY = (Math.random() * 2 - 1) * shake; } else { shX = shY = 0; }
    if (veilA > 0) veilA = Math.max(0, veilA - veilRate * dt);
    if (!reduced()) {
      const sp = state === 'playing' ? world.speed * world.surgeMult * GR.Power.timeScale() : 40;
      stars.forEach(function (s) { s.x -= sp * s.z * 0.1 * dt; if (s.x < 0) { s.x += C.W; s.y = Math.random() * (C.GROUND - 30); } });
    }
  }
  function frame(t) {
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    if (state === 'playing') update(dt);
    if (state !== 'paused') visual(dt);
    if (state === 'shop') GR.Cosmetics.drawPreview(dt);   // shop preview shares the single loop
    render();
    requestAnimationFrame(frame);
  }

  // ---- rendering ----
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function diamond(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }

  function drawBackground() {
    ctx.fillStyle = gBg; ctx.fillRect(-20, -20, C.W + 40, C.GROUND + 20);
    const rm = reduced();
    stars.forEach(function (s) {   // parallax stars
      ctx.globalAlpha = (rm ? 0.7 : 0.55 + 0.35 * Math.sin(visT * 2 + s.p)) * (0.3 + 0.45 * s.z);
      ctx.fillStyle = s.z > 0.8 ? '#bff' : '#fff'; ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = gGlow; ctx.fillRect(-20, C.GROUND - 80, C.W + 40, 80);
    ctx.strokeStyle = 'rgba(255,0,255,.10)'; ctx.lineWidth = 1; ctx.beginPath();   // slow far grid
    const off = -((world.distance * 0.5) % 50);
    for (let x = off; x < C.W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, C.GROUND); }
    for (let y = 25; y < C.GROUND; y += 50) { ctx.moveTo(0, y); ctx.lineTo(C.W, y); }
    ctx.stroke();
    ctx.fillStyle = '#0a0618'; ctx.fillRect(-20, C.GROUND, C.W + 40, C.H - C.GROUND + 20);   // perspective floor
    ctx.strokeStyle = 'rgba(0,255,255,.2)'; ctx.beginPath();
    const sh = world.distance % 40;
    for (let i = -16; i <= 16; i++) { ctx.moveTo(C.W / 2 + i * 40 - sh, C.GROUND); ctx.lineTo(C.W / 2 + i * 110 - sh * 2.75, C.H + 4); }
    for (let k = 1; k <= 5; k++) { const y = C.GROUND + (C.H - C.GROUND) * (k / 5) * (k / 5); ctx.moveTo(0, y); ctx.lineTo(C.W, y); }
    ctx.stroke();
    drawEffects();
  }
  function drawWorld() {
    const gcol = GR.Events.mods().gravity ? '#fa0' : '#0ff';   // ground turns orange during GRAVITY ERROR
    glow(gcol, 14); ctx.strokeStyle = gcol; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, C.GROUND); ctx.lineTo(C.W + 20, C.GROUND); ctx.stroke();
    // fragments: glowing diamond with white core
    world.fragments.forEach(function (f) {
      const r = f.r * (reduced() ? 1 : 1 + 0.12 * Math.sin(visT * 6 + f.x * 0.05));
      glow('#ff0', 14); ctx.fillStyle = 'rgba(255,255,0,.25)'; ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; diamond(f.x, f.y, r); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; diamond(f.x, f.y, r * 0.4); ctx.fill();
    });
    drawPowerups();
    // hazards: neon red outlines
    ctx.lineJoin = 'round';
    world.obstacles.forEach(function (o) {
      glow('#ff3d6e', 14); ctx.fillStyle = 'rgba(255,40,80,.22)'; ctx.strokeStyle = '#ff3d6e'; ctx.lineWidth = 2.5;
      if (o.type === 'spike') {
        ctx.beginPath(); ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h);
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + o.w, o.y); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.stroke(); ctx.globalAlpha = 1;
      }
    });
    ctx.shadowBlur = 0;
    // player: dark body, neon outline drawn inside the hitbox rectangle
    if (!dead) {
      GR.Cosmetics.drawPlayer(ctx, player.x, player.y, player.w, player.h, GR.Cosmetics.equipped('skin'));
      drawRings();
    }
  }
  // ---- Session 3: power-up glyphs, glitch effects, status HUD ----
  function glyph(type, x, y, r) {   // distinct SHAPES (not just colours): shield / hourglass / horseshoe
    ctx.beginPath(); ctx.lineJoin = 'round';
    if (type === 'shield') { ctx.moveTo(x - r, y - r * 0.8); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x + r, y + r * 0.1); ctx.quadraticCurveTo(x + r, y + r * 0.9, x, y + r); ctx.quadraticCurveTo(x - r, y + r * 0.9, x - r, y + r * 0.1); ctx.closePath(); }
    else if (type === 'slow') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x, y); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.lineTo(x, y); ctx.closePath(); }
    else { ctx.moveTo(x - r, y - r); ctx.lineTo(x - r, y + r * 0.1); ctx.arc(x, y + r * 0.1, r, Math.PI, 0, true); ctx.lineTo(x + r, y - r); }
  }
  function drawEffects() {   // behind hazards/player so hazards stay fully readable
    const m = GR.Events.mods(), ts = GR.Power.timeScale(), rm = reduced();
    barsDrawn = 0;
    if (ts < 0.99) { ctx.fillStyle = 'rgba(150,80,255,' + (0.14 * (1 - ts) / 0.45).toFixed(3) + ')'; ctx.fillRect(-20, -20, C.W + 40, C.H + 40); }
    if (m.corrupt) {   // static magenta tint + scanlines; glitch bars only when motion is allowed
      ctx.fillStyle = 'rgba(255,0,200,.06)'; ctx.fillRect(-20, -20, C.W + 40, C.H + 40);
      ctx.fillStyle = 'rgba(0,255,255,.05)'; for (let y = 0; y < C.H; y += 4) ctx.fillRect(0, y, C.W, 1);
      if (!rm) {
        const k = Math.floor(visT * 8);
        for (let i = 0; i < 5; i++) { const y = Math.floor(Math.abs(Math.sin(k * 12.9898 + i * 78.233)) * C.GROUND); ctx.fillStyle = i % 2 ? 'rgba(255,0,255,.14)' : 'rgba(0,255,255,.14)'; ctx.fillRect(0, y, C.W, 3 + (i * 5) % 9); barsDrawn++; }
      }
    }
    if (m.surge && !rm) {   // speed streaks
      ctx.strokeStyle = 'rgba(255,170,0,.25)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const x = C.W - ((visT * 1400 + i * 173) % (C.W + 200)), y = 40 + (i * 97) % 300; ctx.moveTo(x, y); ctx.lineTo(x + 120, y); }
      ctx.stroke();
    }
  }
  function drawPowerups() {
    world.powerups.forEach(function (p) {
      const c = GR.Power.def(p.type).color, r = p.r * (reduced() ? 1 : 1 + 0.1 * Math.sin(visT * 5));
      glow(c, 16); ctx.strokeStyle = c; ctx.fillStyle = 'rgba(10,10,30,.8)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, 6.283); ctx.fill(); ctx.stroke();
      glyph(p.type, p.x, p.y, r * 0.55); ctx.lineWidth = 2.2; ctx.stroke(); ctx.shadowBlur = 0;
    });
  }
  function drawRings() {
    const cx = player.x + player.w / 2, cy = player.y + player.h / 2, rm = reduced(), pw = GR.Power.get();
    ctx.save();
    if (pw.magnet > 0) {   // faint dashed attraction radius
      ctx.strokeStyle = '#fa0'; ctx.lineWidth = 2; ctx.globalAlpha = rm ? 0.28 : 0.2 + 0.1 * Math.sin(visT * 5);
      if (!rm) ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(cx, cy, C.POWER.MAGNET_R, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    }
    if (pw.shield || pw.grace > 0) {   // solid shield bubble; fades out during the post-block grace period
      ctx.globalAlpha = pw.shield ? 0.65 + (rm ? 0 : 0.2 * Math.sin(visT * 6)) : pw.grace / C.POWER.SHIELD_GRACE;
      glow('#3af', 16); ctx.strokeStyle = '#3af'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(51,170,255,.12)';
      ctx.beginPath(); ctx.arc(cx, cy, 31, 0, 6.283); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  // Status HUD: left column (<=190px) and top-centre banners (<=110px) stay above the player's jump apex (y~198) and every
  // collectible, and are drawn after the shake transform so they never move. Text labels + shapes, not colour alone.
  function drawStatus() {
    const rm = reduced(), ev = GR.Events.view(), list = GR.Power.list();
    ctx.textAlign = 'left';
    list.forEach(function (p, i) {
      const y = 134 + i * 26;
      glow(p.color, 8); ctx.strokeStyle = p.color; ctx.lineWidth = 2.2; glyph(p.type, 26, y, 8); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.font = 'bold 13px ' + FONT; ctx.fillStyle = '#fff';
      ctx.fillText(p.label + (p.timed ? ' ' + p.left.toFixed(1) + 's' : ' READY'), 42, y + 4);
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(42, y + 9, 100, 3);
      ctx.fillStyle = p.color; ctx.fillRect(42, y + 9, 100 * (p.timed ? p.left / p.dur : 1), 3);
    });
    ctx.textAlign = 'center';
    let y = 52;
    [ev.play, ev.cos].forEach(function (e) {
      if (!e) return;
      const warn = e.phase === 'warn', blink = warn && !rm && Math.floor(visT * 5) % 2 === 0;
      ctx.font = 'bold 20px ' + FONT; ctx.fillStyle = warn ? (blink ? '#fff' : '#fa0') : '#f6f'; glow(warn ? '#f80' : '#f0f', 10);
      ctx.fillText((warn ? '! WARNING: ' : '') + e.name + '  ' + e.left.toFixed(1) + 's', C.W / 2, y);
      ctx.shadowBlur = 0; ctx.font = 'bold 11px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillText(warn ? 'INCOMING - ' + e.sub : e.sub, C.W / 2, y + 15);
      y += 40;
    });
    if (notice) {
      ctx.globalAlpha = Math.min(1, notice.t / 0.4); ctx.font = 'bold 18px ' + FONT; ctx.fillStyle = notice.color; glow(notice.color, 10);
      ctx.fillText(notice.text, C.W / 2, 150); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }
  function drawHud() {   // drawn after the shake transform: the HUD never moves
    if (state === 'menu' || isPage(state)) return;
    const rec = bestAtStart > 0 && score > bestAtStart;
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px ' + FONT; ctx.fillStyle = 'rgba(180,240,255,.65)'; ctx.fillText('SCORE', 16, 22);
    ctx.font = 'bold 38px ' + FONT; ctx.fillStyle = rec ? '#f6f' : '#fff'; glow(rec ? '#f0f' : '#0ff', 10); ctx.fillText(String(score), 16, 58);
    ctx.shadowBlur = 0;
    if (rec) { const w = ctx.measureText(String(score)).width; ctx.font = 'bold 12px ' + FONT; ctx.fillStyle = '#f6f'; ctx.fillText('NEW BEST!', 16 + w + 10, 58); }
    glow('#ff0', 8); ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; diamond(24, 80, 7); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = 'bold 20px ' + FONT; ctx.fillStyle = '#ff0'; ctx.fillText('x ' + frags, 38, 87);
    const f = Math.max(0, Math.min(1, (world.speed - C.SPEED_START) / (C.SPEED_MAX - C.SPEED_START)));
    ctx.font = 'bold 10px ' + FONT; ctx.fillStyle = 'rgba(180,240,255,.65)'; ctx.fillText('SPEED', 16, 106);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(60, 99, 110, 6);
    ctx.fillStyle = 'hsl(' + (180 + f * 120) + ',100%,60%)'; ctx.fillRect(60, 99, 110 * f, 6);
    ctx.textAlign = 'center'; ctx.font = 'bold 13px ' + FONT; ctx.fillStyle = 'rgba(180,240,255,.7)';
    ctx.fillText('BEST ' + Math.max(S.get('highScore'), rec ? score : 0), C.W / 2, 22);
    drawStatus();
    ctx.textAlign = 'left';
  }
  function render() {
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05050f'; ctx.fillRect(0, 0, C.W, C.H);
    ctx.save(); ctx.translate(shX, shY);
    drawBackground();
    ctx.fillStyle = gVig; ctx.fillRect(-20, -20, C.W + 40, C.H + 40);   // vignette sits behind the action so hazards stay full-brightness
    drawWorld(); FX.draw(ctx);
    ctx.restore();
    drawHud();
    if (veilA > 0) { ctx.fillStyle = 'rgba(' + veilCol + ',' + veilA + ')'; ctx.fillRect(0, 0, C.W, C.H); }
  }
  // Read-only snapshot used by tests/browser-test.js
  function stats() {
    const pw = GR.Power.get(), ev = GR.Events.view(), e = function (o) { return o ? { id: o.id, phase: o.phase, left: o.left } : null; };
    return { state: state, particles: FX.count(), fxMax: FX.max(), shake: shake, veil: veilA, dead: dead,
             shield: pw.shield, grace: pw.grace, slow: pw.slow, magnet: pw.magnet, ts: pw.ts, event: e(ev.play), cos: e(ev.cos),
             runTime: runTime, speedMult: world.surgeMult, gMult: player.gMult, notice: notice ? notice.text : null, bars: barsDrawn,
             dropping: player ? player.dropping : false, vy: player ? player.vy : 0, y: player ? player.y : 0 };
  }
  return { init: init, start: start, pause: pause, resume: resume, toMenu: toMenu, openSettings: openSettings, openScreen: openScreen, stats: stats };
})();
