// Cosmetics: catalogue (skins + trails), shop logic (atomic buy/equip), shared player drawing, trail emitters, shop preview.
// Purely visual: world/player/powerups/events never read this module, so cosmetics cannot affect physics, hitboxes or balance.
GR.Cosmetics = (function () {
  const S = GR.Storage;
  const SKINS = [
    { id: 'magenta', name: 'GLITCH MAGENTA',  price: 0,   body: '#25093a', line: '#f0f', glow: '#f0f', accent: 'rgba(0,255,255,.65)' },
    { id: 'cyan',    name: 'NEON CYAN',       price: 80,  body: '#06232b', line: '#0ff', glow: '#0ff', accent: 'rgba(255,0,255,.7)' },
    { id: 'lime',    name: 'TOXIC LIME',      price: 150, body: '#12260a', line: '#8f0', glow: '#8f0', accent: 'rgba(255,255,0,.7)' },
    { id: 'sun',     name: 'SOLAR FLARE',     price: 250, body: '#2b1604', line: '#fa0', glow: '#fb3', accent: 'rgba(255,60,60,.8)' },
    { id: 'ghost',   name: 'GHOST PROTOCOL',  price: 400, body: 'rgba(220,240,255,.10)', line: '#e8f6ff', glow: '#bdf', accent: 'rgba(160,200,255,.7)' }
  ].map(function (s) { s.type = 'skin'; return s; });
  const TRAIL_FX = {
    sparks: { c: ['#fa0', '#ff6'], o: { vx: -80, vy: -20, spread: 50, life: 0.35, size: 3, gravity: 120 } },
    pixels: { c: ['#0ff', '#f0f'], o: { vx: -60, vy: 0, spread: 25, life: 0.5, size: 4 } },
    comet:  { c: ['#9cf', '#fff'], o: { vx: -140, vy: 0, spread: 8, life: 0.55, size: 5 } }
  };
  const TRAILS = [
    { id: 'none',   name: 'NO TRAIL',     price: 0,   sw: '#889' },
    { id: 'sparks', name: 'EMBER SPARKS', price: 100, sw: '#fa0' },
    { id: 'pixels', name: 'PIXEL DUST',   price: 180, sw: '#0ff' },
    { id: 'comet',  name: 'ION COMET',    price: 300, sw: '#9cf' }
  ].map(function (t) { t.type = 'trail'; return t; });

  function item(id) {
    for (let i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    for (let j = 0; j < TRAILS.length; j++) if (TRAILS[j].id === id) return TRAILS[j];
    return null;
  }
  const ownedKey = function (type) { return type === 'skin' ? 'ownedSkins' : 'ownedTrails'; };
  function owned(id) { const it = item(id); return !!it && S.get(ownedKey(it.type)).indexOf(id) >= 0; }
  function equipped(type) {   // falls back to the free default if storage names an unknown / unowned item
    const id = S.get(type), it = item(id);
    return (it && it.type === type && owned(id)) ? id : (type === 'skin' ? 'magenta' : 'none');
  }
  // Atomic purchase: validated against the stored balance inside one transaction; never overspends, never double-buys.
  function buy(id) {
    const it = item(id), res = { ok: false, reason: it ? '' : 'unknown', item: it, need: 0 };
    if (!it) return res;
    S.txn(function (d) {
      const k = ownedKey(it.type);
      if (d[k].indexOf(id) >= 0) { res.reason = 'owned'; return false; }
      if (d.coins < it.price) { res.reason = 'funds'; res.need = it.price - d.coins; return false; }
      d.coins -= it.price; d[k].push(id); res.ok = true;
    });
    if (!res.ok && !res.reason) res.reason = 'error';
    return res;
  }
  function equip(id) {
    const it = item(id);
    if (!it) return false;
    return S.txn(function (d) { if (d[ownedKey(it.type)].indexOf(id) < 0) return false; d[it.type] = id; });
  }

  // ---- drawing ----
  function drawPlayer(ctx, x, y, w, h, skinId) {   // identical geometry for every skin; only colours differ
    const k = item(skinId) || SKINS[0];
    ctx.fillStyle = k.body; ctx.fillRect(x, y, w, h);
    ctx.shadowColor = k.glow; ctx.shadowBlur = 14; ctx.strokeStyle = k.line; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.shadowBlur = 0; ctx.fillStyle = k.accent; ctx.fillRect(x + 6, y + 26, w - 12, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 20, y + 8, 8, 6);
  }
  // add(x, y, opts) places one particle; the game feeds FX.burst, the preview feeds its own small list.
  function emit(st, id, p, dt, add) {
    const t = TRAIL_FX[id]; if (!t) return;
    st.acc += dt;
    while (st.acc >= 0.035) {
      st.acc -= 0.035; st.flip ^= 1;
      add(p.x + 4, p.y + p.h * (0.3 + Math.random() * 0.6), Object.assign({ color: t.c[st.flip] }, t.o));
    }
  }
  const gameTrail = { acc: 0, flip: 0 };
  function trail(FX, id, p, dt) { emit(gameTrail, id, p, dt, function (x, y, o) { FX.burst(x, y, 1, o); }); }

  // ---- shop preview (drawn from the game's single animation loop while the shop is open) ----
  const pv = { ctx: null, skin: 'magenta', trail: 'none', parts: [], st: { acc: 0, flip: 0 } };
  function setPreviewCanvas(c) { pv.ctx = c.getContext('2d'); }
  function setPreview(skin, tr) { pv.skin = skin; pv.trail = tr; pv.parts.length = 0; pv.st.acc = 0; }
  function drawPreview(dt) {
    const g = pv.ctx; if (!g) return;
    const W = 240, H = 130, p = { x: 150, y: 108 - 44, w: 32, h: 44 }, rm = !!S.get('reduceMotion');
    g.globalAlpha = 1; g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#0a0a1a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 108); g.lineTo(W, 108); g.stroke();
    const t = TRAIL_FX[pv.trail];
    if (t && rm) { for (let i = 1; i <= 6; i++) { g.globalAlpha = 0.7 - i * 0.1; g.fillStyle = t.c[i & 1]; g.fillRect(p.x - i * 14, p.y + 10 + (i % 3) * 10, 5, 5); } g.globalAlpha = 1; }
    else if (t) {
      emit(pv.st, pv.trail, p, dt, function (x, y, o) {
        if (pv.parts.length < 60) pv.parts.push({ x: x, y: y, vx: o.vx + (Math.random() * 2 - 1) * (o.spread || 0), vy: (o.vy || 0) + (Math.random() * 2 - 1) * (o.spread || 0), life: o.life, max: o.life, size: o.size, c: o.color, g: o.gravity || 0 });
      });
      g.globalCompositeOperation = 'lighter';
      for (let i = pv.parts.length - 1; i >= 0; i--) {
        const q = pv.parts[i]; q.life -= dt;
        if (q.life <= 0) { pv.parts.splice(i, 1); continue; }
        q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        const a = q.life / q.max, s = q.size * (0.4 + 0.6 * a); g.globalAlpha = a; g.fillStyle = q.c; g.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    drawPlayer(g, p.x, p.y, p.w, p.h, pv.skin);
  }
  return { SKINS: SKINS, TRAILS: TRAILS, item: item, owned: owned, equipped: equipped, buy: buy, equip: equip,
           drawPlayer: drawPlayer, trail: trail, setPreviewCanvas: setPreviewCanvas, setPreview: setPreview, drawPreview: drawPreview };
})();
