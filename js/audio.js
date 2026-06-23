// Tiny Web Audio sound system. No assets — every sound is synthesized on the
// fly, so there's nothing to download and it works fully offline (even from a
// file:// page). The AudioContext starts suspended until the first user gesture
// (browser autoplay policy), so we lazily create + resume it.
const Sfx = (() => {
  let ctx = null, master = null, muted = false;
  const last = {}; // per-sound timestamps, for throttling spammy effects

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Unlock audio on the first interaction so later sound effects can play.
  function unlock() { ac(); }
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // True if `name` hasn't fired within `minGap` seconds (and records the hit).
  // Keeps frequent events (combat, digging) from stacking into a roar.
  function gate(name, minGap) {
    const c = ac();
    if (!c) return false;
    const now = c.currentTime;
    if (last[name] !== undefined && now - last[name] < minGap) return false;
    last[name] = now;
    return true;
  }

  // A single oscillator note with a quick attack + exponential decay. Optional
  // `slideTo` glides the pitch over the note for chirps/zaps.
  function tone(o) {
    const c = ac();
    if (!c || muted) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, now);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, now + o.dur);
    const g = c.createGain();
    const vol = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + (o.attack == null ? 0.005 : o.attack));
    g.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + o.dur + 0.02);
  }

  // A short buffer of white noise we reuse for crunchy, earthy sounds.
  let noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      const len = Math.floor(c.sampleRate * 0.4);
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // A filtered burst of noise — thuds, digs, splashes.
  function noiseHit(o) {
    const c = ac();
    if (!c || muted) return;
    const now = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.value = o.cutoff || 900;
    f.Q.value = o.q || 0.7;
    const g = c.createGain();
    const vol = o.vol == null ? 0.4 : o.vol;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);
    src.connect(f).connect(g).connect(master);
    src.start(now);
    src.stop(now + o.dur + 0.02);
  }

  // A little fanfare/sting: a few notes spread out in time via setTimeout.
  function sting(freqs, type, stepMs, dur, vol) {
    freqs.forEach((f, i) => setTimeout(() => tone({ freq: f, type, dur: dur || 0.3, vol: vol || 0.18 }), i * (stepMs || 110)));
  }

  // --- Named sound effects -------------------------------------------------
  const S = {
    // UI
    click:   () => tone({ freq: 660, type: 'square', dur: 0.07, vol: 0.16 }),
    // Selecting ants: a bright upward chirp.
    select:  () => { if (gate('select', 0.04)) tone({ freq: 880, type: 'triangle', dur: 0.1, vol: 0.2, slideTo: 1320 }); },
    // Issuing a move/dig/loot order.
    command: () => { if (gate('command', 0.04)) tone({ freq: 520, type: 'triangle', dur: 0.09, vol: 0.18, slideTo: 760 }); },
    // Combat: a percussive zap (throttled, since many ants fight at once).
    attack:  () => { if (gate('attack', 0.07)) { noiseHit({ rate: 1.2, cutoff: 1900, dur: 0.08, vol: 0.22 }); tone({ freq: 210, type: 'square', dur: 0.07, vol: 0.1, slideTo: 110 }); } },
    // Digging dirt.
    dig:     () => { if (gate('dig', 0.05)) noiseHit({ rate: 0.9, cutoff: 700, dur: 0.16, vol: 0.4 }); },
    // Placing a wall (kept from the original).
    placeDirt: () => noiseHit({ rate: 0.85 + Math.random() * 0.3, cutoff: 900, dur: 0.18, vol: 0.5 }),
    // Food delivered home: a satisfying two-tone "coin".
    food:    () => { if (gate('food', 0.03)) { tone({ freq: 988, type: 'square', dur: 0.06, vol: 0.15 }); setTimeout(() => tone({ freq: 1480, type: 'square', dur: 0.1, vol: 0.13 }), 55); } },
    // Honey: a rounder, sweeter chime.
    honey:   () => { tone({ freq: 740, type: 'triangle', dur: 0.13, vol: 0.18, slideTo: 1100 }); tone({ freq: 1100, type: 'sine', dur: 0.18, vol: 0.1 }); },
    // Queen lays an egg.
    lay:     () => { if (gate('lay', 0.1)) tone({ freq: 420, type: 'sine', dur: 0.14, vol: 0.14, slideTo: 560 }); },
    // Egg hatches into a new ant.
    hatch:   () => { if (gate('hatch', 0.06)) sting([523, 784, 1046], 'triangle', 70, 0.14, 0.16); },
    // Acid splash potion shattering.
    splash:  () => { noiseHit({ rate: 1.5, cutoff: 2600, dur: 0.22, vol: 0.28, filter: 'bandpass', q: 1.1 }); tone({ freq: 320, type: 'sawtooth', dur: 0.2, vol: 0.1, slideTo: 140 }); },
    // Level cleared / game over jingles.
    win:     () => sting([523, 659, 784, 1046, 1318], 'triangle', 130, 0.32, 0.2),
    lose:    () => sting([440, 349, 277, 196], 'sawtooth', 170, 0.34, 0.18),
  };

  function play(name) { if (S[name]) S[name](); }
  function setMuted(m) { muted = m; }
  function isMuted() { return muted; }

  return Object.assign({ play, setMuted, isMuted }, S);
})();
