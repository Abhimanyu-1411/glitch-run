// Synthesized audio engine using the Web Audio API. Zero audio files, zero network requests.
// Supports:
// 1. Synthwave background music loop generated via OfflineAudioContext, seamless looping,
//    dynamic ducking based on game state (playing, paused, over, menu).
// 2. Synthesized sound effects with separate volume and toggle controls.
// 3. Audio starts only after a user gesture (browser autoplay policy) and handles suspended state.
GR.Audio = (function () {
  let ctx = null;
  let musicSource = null;
  let musicGain = null;
  let musicFilter = null;
  let sfxGain = null;
  let musicBuffer = null;
  let isGeneratingMusic = false;
  let currentState = 'menu';
  let unlocked = false;

  const isSfxEnabled = function () {
    return typeof GR.Storage !== 'undefined' ? GR.Storage.get('sfx') !== false : true;
  };

  const isMusicEnabled = function () {
    return typeof GR.Storage !== 'undefined' ? GR.Storage.get('music') !== false : true;
  };

  const getMusicVol = function () {
    if (typeof GR.Storage === 'undefined') return 0.4;
    const v = GR.Storage.get('musicVol');
    return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.4;
  };

  const getSfxVol = function () {
    if (typeof GR.Storage === 'undefined') return 0.8;
    const v = GR.Storage.get('sfxVol');
    return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  };

  function getContext() {
    if (!ctx) {
      const AudioCtx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (AudioCtx) {
        try {
          ctx = new AudioCtx();
          sfxGain = ctx.createGain();
          sfxGain.gain.setValueAtTime(getSfxVol(), ctx.currentTime);
          sfxGain.connect(ctx.destination);

          musicFilter = ctx.createBiquadFilter();
          musicFilter.type = 'lowpass';
          musicFilter.frequency.setValueAtTime(16000, ctx.currentTime);

          musicGain = ctx.createGain();
          musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
          musicFilter.connect(musicGain);
          musicGain.connect(ctx.destination);
        } catch (e) {
          ctx = null;
        }
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  // Generate 8-bar D-minor synthwave music loop (116 BPM, ~16.55s)
  function generateMusicBuffer(cb) {
    if (musicBuffer) { if (cb) cb(musicBuffer); return; }
    if (isGeneratingMusic) return;
    if (typeof window === 'undefined') return;

    const OfflineCtx = window.OfflineAudioContext || window.webkitAudioContext;
    if (!OfflineCtx) return;

    isGeneratingMusic = true;
    try {
      const sampleRate = 44100;
      const bpm = 116;
      const beatSec = 60 / bpm;
      const totalBars = 8;
      const totalBeats = totalBars * 4;
      const totalDur = totalBeats * beatSec;
      const totalSamples = Math.ceil(totalDur * sampleRate);

      const actx = new OfflineCtx(2, totalSamples, sampleRate);
      const master = actx.createGain();
      master.gain.value = 0.75;
      master.connect(actx.destination);

      // Noise buffer for percussion
      const noiseBuf = actx.createBuffer(1, sampleRate, sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < sampleRate; i++) nd[i] = Math.random() * 2 - 1;

      function playNoise(time, dur, type, freq, gainVal) {
        const src = actx.createBufferSource();
        src.buffer = noiseBuf;
        const flt = actx.createBiquadFilter();
        flt.type = type;
        flt.frequency.setValueAtTime(freq, time);
        const g = actx.createGain();
        g.gain.setValueAtTime(gainVal, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        src.connect(flt);
        flt.connect(g);
        g.connect(master);
        src.start(time);
        src.stop(time + dur + 0.01);
      }

      function playTone(time, dur, type, freqStart, freqEnd, gainVal) {
        const osc = actx.createOscillator();
        const g = actx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        if (freqEnd && freqEnd !== freqStart) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), time + dur);
        }
        g.gain.setValueAtTime(gainVal, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(time);
        osc.stop(time + dur + 0.01);
      }

      // Chords across 8 bars: Dm (bars 0-1), Bb (bars 2-3), C (bars 4-5), Am (bars 6-7)
      const chords = [
        { bass: 73.42, pad: [146.8, 220.0, 349.2], arp: [293.66, 349.23, 440.0, 523.25, 587.33, 523.25, 440.0, 349.23, 293.66, 329.63, 349.23, 440.0, 392.0, 349.23, 329.63, 261.63] },
        { bass: 58.27, pad: [116.5, 174.6, 293.7], arp: [293.66, 349.23, 466.16, 587.33, 698.46, 587.33, 466.16, 349.23, 293.66, 349.23, 466.16, 523.25, 587.33, 466.16, 440.0, 349.23] },
        { bass: 65.41, pad: [130.8, 196.0, 329.6], arp: [261.63, 329.63, 392.0, 523.25, 659.25, 523.25, 392.0, 329.63, 261.63, 293.66, 329.63, 392.0, 349.23, 329.63, 293.66, 246.94] },
        { bass: 55.00, pad: [110.0, 164.8, 261.6], arp: [220.0, 261.63, 329.63, 440.0, 523.25, 440.0, 329.63, 261.63, 293.66, 329.63, 349.23, 329.63, 293.66, 261.63, 246.94, 220.0] }
      ];

      const sixteenth = beatSec / 4;
      const eighth = beatSec / 2;

      for (let c = 0; c < 4; c++) {
        const ch = chords[c];
        const chunkStart = c * 2 * 4 * beatSec;

        // Pad chord (2 bars = 8 beats)
        ch.pad.forEach(function (f) {
          const osc = actx.createOscillator();
          const flt = actx.createBiquadFilter();
          const g = actx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, chunkStart);
          flt.type = 'lowpass';
          flt.frequency.setValueAtTime(480, chunkStart);
          g.gain.setValueAtTime(0.001, chunkStart);
          g.gain.linearRampToValueAtTime(0.035, chunkStart + 0.35);
          g.gain.setValueAtTime(0.035, chunkStart + 8 * beatSec - 0.35);
          g.gain.linearRampToValueAtTime(0.001, chunkStart + 8 * beatSec);
          osc.connect(flt);
          flt.connect(g);
          g.connect(master);
          osc.start(chunkStart);
          osc.stop(chunkStart + 8 * beatSec);
        });

        // 32 sixteenth notes for synth bass
        for (let s = 0; s < 32; s++) {
          const t = chunkStart + s * sixteenth;
          const oct = (s % 2 === 0) ? 1 : 2;
          const freq = ch.bass * oct;
          playTone(t, sixteenth * 0.9, 'sawtooth', freq, freq * 0.98, 0.075);
        }

        // 16 eighth notes for melodic arp
        for (let e = 0; e < 16; e++) {
          const t = chunkStart + e * eighth;
          const f = ch.arp[e % ch.arp.length];
          playTone(t, eighth * 0.75, 'triangle', f, f, 0.055);
        }
      }

      // Percussion across all 32 beats
      for (let b = 0; b < totalBeats; b++) {
        const t = b * beatSec;
        // Kick on beats 0 and 2
        if (b % 4 === 0 || b % 4 === 2) {
          playTone(t, 0.11, 'sine', 125, 40, 0.22);
        }
        // Snare on beats 1 and 3
        if (b % 4 === 1 || b % 4 === 3) {
          playNoise(t, 0.08, 'bandpass', 2400, 0.11);
          playTone(t, 0.05, 'triangle', 190, 65, 0.07);
        }
        // Hi-hat on 8th notes
        playNoise(t + eighth, 0.03, 'highpass', 6500, 0.035);
      }

      const p = actx.startRendering();
      if (p && typeof p.then === 'function') {
        p.then(function (buf) {
          musicBuffer = buf;
          isGeneratingMusic = false;
          if (cb) cb(buf);
        }).catch(function () {
          isGeneratingMusic = false;
        });
      } else {
        isGeneratingMusic = false;
      }
    } catch (e) {
      isGeneratingMusic = false;
    }
  }

  // Pre-generate loop in background
  if (typeof window !== 'undefined') {
    setTimeout(function () { generateMusicBuffer(); }, 10);
  }

  function updateMusicState() {
    const c = getContext();
    if (!c || !musicGain || !musicFilter) return;

    const on = isMusicEnabled();
    const userVol = getMusicVol();
    let duck = 0.7;
    let cutoff = 16000;

    if (currentState === 'playing') {
      duck = 1.0;
      cutoff = 20000;
    } else if (currentState === 'paused') {
      duck = 0.22;
      cutoff = 750; // low-pass muffle effect during pause
    } else if (currentState === 'over') {
      duck = 0.35;
      cutoff = 1200;
    } else {
      // menu, settings, shop, achievements, missions
      duck = 0.65;
      cutoff = 16000;
    }

    const targetGain = on ? userVol * duck : 0.0001;
    const now = c.currentTime;
    try {
      musicGain.gain.setTargetAtTime(Math.max(0.0001, targetGain), now, 0.12);
      musicFilter.frequency.setTargetAtTime(cutoff, now, 0.12);
    } catch (e) {}
  }

  function ensureMusicPlaying() {
    const c = getContext();
    if (!c) return;
    if (musicSource) return; // avoid duplicate playback loops

    if (!musicBuffer) {
      generateMusicBuffer(function () {
        if (!musicSource && unlocked) ensureMusicPlaying();
      });
      return;
    }

    try {
      musicSource = c.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true;
      musicSource.connect(musicFilter);
      musicSource.start(0);
      updateMusicState();
    } catch (e) {
      musicSource = null;
    }
  }

  function stopMusic() {
    if (musicSource) {
      try {
        musicSource.stop();
        musicSource.disconnect();
      } catch (e) {}
      musicSource = null;
    }
  }

  // Pre-unlock audio on user interaction
  function unlock() {
    unlocked = true;
    const c = getContext();
    if (c && c.state === 'suspended') {
      c.resume().then(function () {
        if (isMusicEnabled()) ensureMusicPlaying();
      }).catch(function () {});
    } else if (isMusicEnabled()) {
      ensureMusicPlaying();
    }
  }

  if (typeof window !== 'undefined') {
    ['keydown', 'pointerdown', 'touchstart', 'click'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    });
  }

  function tone(freqStart, freqEnd, dur, type, gainMax) {
    const c = getContext();
    if (!c) return;
    const sfxVol = getSfxVol();
    if (sfxVol <= 0.001) return;

    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), now + dur);
    }
    const max = (gainMax || 0.25) * sfxVol;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(max, now + Math.min(0.015, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(g);
    g.connect(sfxGain || c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    setTimeout(function () {
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
    }, Math.ceil((dur + 0.1) * 1000));
  }

  function play(name) {
    if (!isSfxEnabled()) return;
    try {
      const c = getContext();
      if (!c) return;

      if (name === 'jump') {
        tone(220, 540, 0.10, 'triangle', 0.22);
      } else if (name === 'drop') {
        tone(480, 160, 0.09, 'sine', 0.20);
      } else if (name === 'land') {
        tone(150, 45, 0.10, 'triangle', 0.24);
      } else if (name === 'fragment') {
        tone(1050, 1550, 0.06, 'sine', 0.18);
      } else if (name === 'powerup') {
        tone(440, 660, 0.08, 'sine', 0.18);
        setTimeout(function () { if (isSfxEnabled()) tone(660, 880, 0.12, 'sine', 0.22); }, 80);
      } else if (name === 'slowStart') {
        tone(620, 160, 0.26, 'sine', 0.24);
      } else if (name === 'slowEnd') {
        tone(160, 540, 0.22, 'sine', 0.22);
      } else if (name === 'magnetStart') {
        tone(550, 880, 0.12, 'sawtooth', 0.16);
        setTimeout(function () { if (isSfxEnabled()) tone(660, 990, 0.14, 'triangle', 0.18); }, 70);
      } else if (name === 'shieldBreak') {
        tone(880, 220, 0.06, 'sawtooth', 0.24);
        setTimeout(function () { if (isSfxEnabled()) tone(180, 45, 0.18, 'sawtooth', 0.26); }, 40);
      } else if (name === 'die') {
        tone(280, 35, 0.38, 'sawtooth', 0.26);
      } else if (name === 'newBest') {
        tone(392, 523, 0.10, 'sine', 0.20);
        setTimeout(function () { if (isSfxEnabled()) tone(523, 659, 0.10, 'sine', 0.22); }, 90);
        setTimeout(function () { if (isSfxEnabled()) tone(659, 784, 0.12, 'sine', 0.24); }, 180);
        setTimeout(function () { if (isSfxEnabled()) tone(784, 1046, 0.22, 'triangle', 0.26); }, 270);
      } else if (name === 'buy') {
        tone(660, 880, 0.07, 'sine', 0.18);
        setTimeout(function () { if (isSfxEnabled()) tone(880, 1320, 0.14, 'sine', 0.22); }, 75);
      } else if (name === 'unlock') {
        tone(440, 554, 0.09, 'sine', 0.20);
        setTimeout(function () { if (isSfxEnabled()) tone(554, 659, 0.09, 'sine', 0.20); }, 80);
        setTimeout(function () { if (isSfxEnabled()) tone(659, 880, 0.16, 'sine', 0.24); }, 160);
      } else if (name === 'mission') {
        tone(523, 659, 0.08, 'triangle', 0.20);
        setTimeout(function () { if (isSfxEnabled()) tone(659, 1046, 0.15, 'triangle', 0.22); }, 80);
      }
    } catch (e) {}
  }

  function onState(newState) {
    currentState = newState;
    if (unlocked && isMusicEnabled()) {
      ensureMusicPlaying();
    }
    updateMusicState();
  }

  function setMusicEnabled(on) {
    if (on && unlocked) {
      ensureMusicPlaying();
    }
    updateMusicState();
  }

  function setMusicVolume(vol) {
    updateMusicState();
  }

  function setSfxEnabled(on) {
    if (sfxGain && ctx) {
      const now = ctx.currentTime;
      sfxGain.gain.setTargetAtTime(on ? getSfxVol() : 0, now, 0.05);
    }
  }

  function setSfxVolume(vol) {
    if (sfxGain && ctx) {
      const now = ctx.currentTime;
      sfxGain.gain.setTargetAtTime(isSfxEnabled() ? vol : 0, now, 0.05);
    }
  }

  return {
    play: play,
    unlock: unlock,
    onState: onState,
    isSfxEnabled: isSfxEnabled,
    isMusicEnabled: isMusicEnabled,
    setMusicEnabled: setMusicEnabled,
    setMusicVolume: setMusicVolume,
    setSfxEnabled: setSfxEnabled,
    setSfxVolume: setSfxVolume,
    getMusicVol: getMusicVol,
    getSfxVol: getSfxVol,
    isMusicPlaying: function () { return !!musicSource; }
  };
})();
