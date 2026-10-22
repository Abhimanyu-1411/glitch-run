// Player: gravity, jumping, fast-drop, hitbox. Sets jumped / landVy / fastDropped each update.
GR.Player = function () {
  this.w = 32; this.h = 44; this.jumped = false; this.landVy = 0; this.gMult = 1;
  this.dropping = false; this.fastDropped = false; this.justDropped = false;
  this.reset();
};
GR.Player.prototype.reset = function () {
  this.x = 120; this.y = GR.CFG.GROUND - this.h; this.vy = 0; this.onGround = true; this.gMult = 1;
  this.dropping = false; this.fastDropped = false; this.justDropped = false;
};
GR.Player.prototype.update = function (dt) {
  const C = GR.CFG;
  this.jumped = false; this.landVy = 0; this.fastDropped = false; this.justDropped = false;
  if (this.onGround) {
    this.dropping = false;
    GR.Input.consumeDrop();   // clear drop buffer when on ground so it never triggers upon leaving ground
    if (GR.Input.consume()) { this.vy = -C.JUMP_V; this.onGround = false; this.jumped = true; }
  } else {
    if (GR.Input.consumeDrop()) {
      this.dropping = true;
      this.justDropped = true;
      if (this.vy < 400) this.vy = 400;   // immediately begin downward descent
    }
  }
  const grav = this.dropping ? C.GRAVITY * 2.8 : C.GRAVITY;
  this.vy += grav * this.gMult * dt;
  if (this.dropping && this.vy > C.DROP_V) this.vy = C.DROP_V;
  this.y += this.vy * dt;
  const floor = C.GROUND - this.h;
  if (this.y >= floor) {
    if (!this.onGround) {
      this.landVy = this.vy;
      if (this.dropping) this.fastDropped = true;
    }
    this.y = floor; this.vy = 0; this.onGround = true; this.dropping = false;
  } else {
    this.onGround = false;
  }
};
GR.Player.prototype.box = function () {   // slightly forgiving hitbox
  return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 6 };
};
