// UI wiring: toggles HTML screens on state change, routes button clicks (single delegated listener), settings switches.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const screens = { menu: $('menu'), paused: $('pause'), over: $('over'), settings: $('settings'), shop: $('shop'), achievements: $('achievements'), missions: $('missions') };
  const LABELS = { sfx: 'SOUND EFFECTS', shake: 'SCREEN SHAKE', reduceMotion: 'REDUCED MOTION' };
  const fullscreenBtn = $('fullscreenBtn');
  const wrap = $('wrap');

  function updateFullscreenButton() {
    if (!fullscreenBtn) return;
    const active = document.fullscreenElement === wrap;
    fullscreenBtn.textContent = active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenBtn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenBtn.classList.toggle('hidden', !document.fullscreenEnabled || !wrap.requestFullscreen);
  }

  function renderSettings() {
    document.querySelectorAll('[data-setting]').forEach(function (b) {
      const on = !!GR.Storage.get(b.dataset.setting);
      b.textContent = LABELS[b.dataset.setting] + ': ' + (on ? 'ON' : 'OFF');
      b.setAttribute('aria-pressed', on);
    });
    document.querySelectorAll('[data-audio]').forEach(function (b) {
      const k = b.dataset.audio;
      if (k === 'music') {
        const on = GR.Storage.get('music') !== false;
        b.textContent = 'BACKGROUND MUSIC: ' + (on ? 'ON' : 'OFF');
        b.setAttribute('aria-pressed', on);
      } else if (k === 'musicVol') {
        const v = Math.round((GR.Storage.get('musicVol') !== undefined ? GR.Storage.get('musicVol') : 0.4) * 100);
        b.textContent = 'MUSIC VOL: ' + v + '%';
      } else if (k === 'sfxVol') {
        const v = Math.round((GR.Storage.get('sfxVol') !== undefined ? GR.Storage.get('sfxVol') : 0.8) * 100);
        b.textContent = 'SFX VOL: ' + v + '%';
      }
    });
    document.body.classList.toggle('rm', !!GR.Storage.get('reduceMotion'));
  }
  let overAt = 0;
  function onState(state, i) {
    if (state === 'over') overAt = performance.now();
    for (const k in screens) screens[k].classList.toggle('hidden', k !== state);
    $('pauseBtn').classList.toggle('hidden', state !== 'playing');
    if ($('dropBtn')) $('dropBtn').classList.toggle('hidden', state !== 'playing');
    if (state === 'menu') { $('menuBest').textContent = i.best; $('menuCoins').textContent = i.coins; GR.Screens.menuNotes(); }
    if (state === 'settings') renderSettings();
    if (state === 'shop' || state === 'achievements' || state === 'missions') GR.Screens.render(state);
    if (state === 'over') {
      $('overScore').textContent = i.score; $('overBest').textContent = i.best; $('overFrags').textContent = i.frags;
      $('newBest').classList.toggle('hidden', !i.newBest);
      GR.Screens.overNotes(i);
    }
  }
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action],button[data-setting],button[data-audio],button[data-shop]');
    if (!btn) return;
    btn.blur();   // stops Space re-triggering the focused button
    if (btn.dataset.action === 'fullscreen') {
      if (document.fullscreenElement === wrap) {
        if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
      } else if (document.fullscreenEnabled && wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
      return;
    }
    if (!screens.over.classList.contains('hidden') && performance.now() - overAt < 350) return;
    if (btn.dataset.shop) { GR.Screens.click(btn); return; }
    if (btn.dataset.setting) {
      const k = btn.dataset.setting;
      const next = !GR.Storage.get(k);
      GR.Storage.set(k, next);
      if (k === 'sfx' && GR.Audio && GR.Audio.setSfxEnabled) GR.Audio.setSfxEnabled(next);
      renderSettings();
      return;
    }
    if (btn.dataset.audio) {
      const k = btn.dataset.audio;
      if (k === 'music') {
        const next = !(GR.Storage.get('music') !== false);
        GR.Storage.set('music', next);
        if (GR.Audio && GR.Audio.setMusicEnabled) GR.Audio.setMusicEnabled(next);
      } else if (k === 'musicVol') {
        const cur = GR.Storage.get('musicVol') !== undefined ? GR.Storage.get('musicVol') : 0.4;
        const vols = [0.2, 0.4, 0.6, 0.8, 1.0];
        let idx = -1;
        for (let i = 0; i < vols.length; i++) if (Math.abs(vols[i] - cur) < 0.05) { idx = i; break; }
        if (idx < 0) idx = 1;
        const next = vols[(idx + 1) % vols.length];
        GR.Storage.set('musicVol', next);
        if (GR.Audio && GR.Audio.setMusicVolume) GR.Audio.setMusicVolume(next);
      } else if (k === 'sfxVol') {
        const cur = GR.Storage.get('sfxVol') !== undefined ? GR.Storage.get('sfxVol') : 0.8;
        const vols = [0.2, 0.4, 0.6, 0.8, 1.0];
        let idx = -1;
        for (let i = 0; i < vols.length; i++) if (Math.abs(vols[i] - cur) < 0.05) { idx = i; break; }
        if (idx < 0) idx = 3;
        const next = vols[(idx + 1) % vols.length];
        GR.Storage.set('sfxVol', next);
        if (GR.Audio && GR.Audio.setSfxVolume) GR.Audio.setSfxVolume(next);
      }
      renderSettings();
      return;
    }
    const a = btn.dataset.action;
    if (a === 'start') GR.Game.start();
    else if (a === 'resume') GR.Game.resume();
    else if (a === 'pause') GR.Game.pause();
    else if (a === 'drop') GR.Input.drop();
    else if (a === 'menu') GR.Game.toMenu();
    else if (a === 'settings' || a === 'shop' || a === 'missions' || a === 'achievements') GR.Game.openScreen(a);
  });
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();
  renderSettings();
  const dropBtn = $('dropBtn');
  if (dropBtn) {
    dropBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      GR.Input.drop();
    });
  }
  GR.Game.init($('game'), onState);
})();
