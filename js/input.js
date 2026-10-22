// Keyboard + pointer/touch input. Jump and fast-drop presses are buffered briefly.
GR.Input = (function () {
  const api = { jumpQueued: 0, dropQueued: 0, onPause: null };
  function jump() { api.jumpQueued = GR.CFG.JUMP_BUFFER; }
  function drop() { api.dropQueued = 0.15; }
  addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'BUTTON' && e.code === 'Space') return;   // keyboard users can press focused menu buttons
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault(); if (!e.repeat) jump();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault(); if (!e.repeat) drop();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat && api.onPause) api.onPause();
    }
  });
  api.bind = function (canvas) {
    let startY = 0;
    canvas.addEventListener('pointerdown', function (e) {
      startY = e.clientY;
      e.preventDefault();
      if (e.pointerType === 'mouse' && e.button !== 0) return;   // primary button only
      jump();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.buttons > 0 && e.clientY - startY > 30) {
        drop();
        startY = e.clientY;
      }
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };
  api.consume = function () { if (api.jumpQueued > 0) { api.jumpQueued = 0; return true; } return false; };
  api.consumeDrop = function () { if (api.dropQueued > 0) { api.dropQueued = 0; return true; } return false; };
  api.tick = function (dt) {
    if (api.jumpQueued > 0) api.jumpQueued = Math.max(0, api.jumpQueued - dt);
    if (api.dropQueued > 0) api.dropQueued = Math.max(0, api.dropQueued - dt);
  };
  api.clear = function () { api.jumpQueued = 0; api.dropQueued = 0; };
  api.drop = drop;
  api.jump = jump;
  return api;
})();
