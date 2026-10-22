// Lightweight particle system: pooled objects, hard cap, lifetime fade. Runs inside the existing game loop.
GR.FX = (function () {
  const MAX = 240, MAX_REDUCED = 70;
  const live = [], pool = [];
  const reduced = function () { return !!GR.Storage.get('reduceMotion'); };
  // o: {speed, life, size, gravity, color, dust}
  function burst(x, y, n, o) {
    o = o || {};
    n = Math.round(n * (reduced() ? 0.3 : 1));
    const cap = reduced() ? MAX_REDUCED : MAX;
    for (let i = 0; i < n && live.length < cap; i++) {
      const p = pool.pop() || {};
      const a = Math.random() * Math.PI * 2, s = (o.speed || 150) * (0.35 + 0.65 * Math.random());
      if (o.vx !== undefined) { const sp = o.spread || 0; p.vx = o.vx + (Math.random() * 2 - 1) * sp; p.vy = (o.vy || 0) + (Math.random() * 2 - 1) * sp; }
      else if (o.dust) { p.vx = (Math.random() * 2 - 1) * s; p.vy = -Math.random() * s * 0.4; }
      else { p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; }
      p.x = x; p.y = y; p.g = o.gravity || 0; p.c = o.color || '#fff'; p.size = o.size || 3;
      p.max = p.life = (o.life || 0.5) * (0.7 + 0.6 * Math.random());
      live.push(p);
    }
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { pool.push(p); live[i] = live[live.length - 1]; live.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  function draw(ctx) {
    if (!live.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < live.length; i++) {
      const p = live[i], a = p.life / p.max, s = p.size * (0.4 + 0.6 * a);
      ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }
  function clear() { while (live.length) pool.push(live.pop()); }
  return { burst: burst, update: update, draw: draw, clear: clear,
           count: function () { return live.length; }, max: function () { return reduced() ? MAX_REDUCED : MAX; } };
})();
