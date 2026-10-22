// World: scrolling, random obstacle + fragment + power-up spawning, collisions, difficulty ramp.
(function () {
  const C = GR.CFG;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function makeObstacle(type, x) {
    const o = type === 'spike'
      ? { type: type, w: 30, h: 30, ix: 9, iy: 12 }   // hitbox lies inside the drawn triangle
      : { type: type, w: 34, h: Math.round(rnd(36, 60)), ix: 0, iy: 0 };
    o.x = x; o.y = C.GROUND - o.h;
    o.hit = function () {
      return { x: this.x + this.ix, y: this.y + this.iy, w: this.w - this.ix * 2, h: this.h - this.iy };
    };
    return o;
  }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function World() { this.reset(); }
  World.prototype.reset = function () {
    this.obstacles = []; this.fragments = []; this.powerups = []; this.collected = []; this.distance = 0; this.time = 0;
    this.speed = C.SPEED_START; this.untilSpawn = 700;
    this.surgeMult = 1; this.spawnMult = 1; this.storm = false; this.lastDx = 0;   // set by GR.Events.apply
  };
  World.prototype.update = function (dt) {   // dt is already scaled by slow-motion
    this.speed = Math.min(C.SPEED_MAX, this.speed + C.SPEED_ACCEL * dt);
    const dx = this.speed * this.surgeMult * dt;
    this.lastDx = dx; this.distance += dx; this.time += dt;
    this.obstacles.forEach(function (o) { o.x -= dx; });
    this.fragments.forEach(function (f) { f.x -= dx; });
    this.powerups.forEach(function (p) { p.x -= dx; });
    this.obstacles = this.obstacles.filter(function (o) { return o.x + o.w > -40; });
    this.fragments = this.fragments.filter(function (f) { return f.x > -40; });
    this.powerups = this.powerups.filter(function (p) { return p.x > -40; });
    this.untilSpawn -= dx;
    if (this.untilSpawn <= 0) this.spawn();
  };
  World.prototype.spawn = function () {
    const o = makeObstacle(Math.random() < 0.5 ? 'spike' : 'block', C.W + 40);
    this.obstacles.push(o);
    // Edge-to-edge gap >= 0.85s of travel at the (surge-anticipating) speed; jump airtime is ~0.71s, so every pattern is clearable.
    const gap = this.speed * this.spawnMult * rnd(0.85, 1.6);
    this.untilSpawn = gap + o.w;
    const gx = o.x + o.w;
    if (this.storm) {   // DATA STORM: an arc of 5 fragments across the gap (reachable by a normal jump)
      for (let k = 0; k < 5; k++) this.fragments.push({ x: gx + gap * (0.2 + 0.15 * k), y: C.GROUND - 45 - Math.sin(k / 4 * Math.PI) * 60, r: 12 });
    } else if (Math.random() < 0.5) {   // fragment mid-gap
      this.fragments.push({ x: gx + gap / 2, y: C.GROUND - rnd(30, 120), r: 12 });
    }
    if (Math.random() < (this.storm ? 0.7 : 0.35))  // fragment floating above the obstacle
      this.fragments.push({ x: o.x + o.w / 2, y: o.y - 45, r: 12 });
    if (this.onSpawn) this.onSpawn(this, o, gap);
  };
  World.prototype.hits = function (b) {
    return this.obstacles.some(function (o) { return overlap(b, o.hit()); });
  };
  World.prototype.collect = function (b) {
    let n = 0; const got = this.collected = [];
    this.fragments = this.fragments.filter(function (f) {
      const hit = overlap(b, { x: f.x - f.r, y: f.y - f.r, w: f.r * 2, h: f.r * 2 });
      if (hit) { n++; got.push({ x: f.x, y: f.y }); }
      return !hit;
    });
    return n;
  };
  World.prototype.collectPower = function (b) {
    const got = [];
    this.powerups = this.powerups.filter(function (p) {
      const hit = overlap(b, { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 });
      if (hit) got.push(p.type);
      return !hit;
    });
    return got;
  };
  World.prototype.removeHits = function (b) {   // shield: destroy every hazard overlapping the player, return them
    const gone = [];
    this.obstacles = this.obstacles.filter(function (o) { const h = overlap(b, o.hit()); if (h) gone.push(o); return !h; });
    return gone;
  };
  // Magnet: fragments ahead of the player glide toward it. Per-frame travel is limited so that, together with the scroll,
  // a fragment can never skip over the player's hitbox (24px + 24px) between two collision checks. Collection itself
  // is still World.collect().
  World.prototype.attract = function (px, py, R, dt) {
    const lim = Math.max(0, 44 - this.lastDx);
    this.fragments.forEach(function (f) {
      if (f.x < px - 20) return;
      const dx = px - f.x, dy = py - f.y, d = Math.hypot(dx, dy);
      if (d > R || d < 0.5) return;
      const step = Math.min((140 + 520 * (1 - d / R)) * dt, d, lim);
      f.x += dx / d * step; f.y += dy / d * step;
    });
  };
  GR.World = World;
})();
