// Background music. Two engines behind one interface:
//   1. YouTube — the intended track, embedded via the IFrame Player API.
//   2. Synth   — a gentle, fully-offline Web Audio loop used as a fallback when
//                YouTube can't play (offline, a file:// page, or a blocked embed).
// Whichever is available wins; the synth guarantees there's always music. All
// playback is kicked off from a user gesture (the Play button) via start().
const Music = (() => {
  const VIDEO_ID = 'i-ZdUvk9xXw';
  let player = null;
  let ready = false;
  let wantPlay = false;  // user asked for music before an engine was ready
  let muted = false;
  let engine = null;     // 'yt' | 'synth' — which engine is currently sounding
  let fallbackTimer = null;

  // --- Offline synth fallback ----------------------------------------------
  // A slow arpeggio over a four-chord loop with a soft bass on each downbeat.
  // Low volume so it sits politely under the sound effects.
  const Synth = (() => {
    let c = null, out = null, timer = null, step = 0, playing = false;
    const baseHz = 220; // A3
    const prog = [
      [0, 4, 7, 11],    // Amaj7-ish
      [-3, 0, 4, 9],
      [-5, -1, 2, 7],
      [-7, -3, 0, 4],
    ];
    const semi = (n) => baseHz * Math.pow(2, n / 12);

    function actx() {
      if (!c) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        c = new AC();
        out = c.createGain();
        out.gain.value = 0.0001;
        out.connect(c.destination);
      }
      if (c.state === 'suspended') c.resume();
      return c;
    }

    function note(freq, t, dur, vol, type) {
      const o = c.createOscillator();
      o.type = type || 'triangle';
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function tick() {
      if (!playing || !c) return;
      const t = c.currentTime + 0.06;
      const chord = prog[Math.floor(step / 4) % prog.length];
      note(semi(chord[step % 4] + 12), t, 0.5, 0.14, 'triangle'); // arp lead
      if (step % 4 === 0) note(semi(chord[0] - 12), t, 0.9, 0.16, 'sine'); // bass
      step++;
    }

    function start() {
      if (!actx()) return;
      playing = true;
      out.gain.cancelScheduledValues(c.currentTime);
      out.gain.setTargetAtTime(0.5, c.currentTime, 0.6); // fade in
      if (!timer) timer = setInterval(tick, 250); // ~one arp note per 250ms
    }
    function stop() {
      playing = false;
      if (c && out) out.gain.setTargetAtTime(0.0001, c.currentTime, 0.3); // fade out
      if (timer) { clearInterval(timer); timer = null; }
    }
    return { start, stop };
  })();

  function startSynth() {
    if (muted) return;
    engine = 'synth';
    Synth.start();
  }

  // --- YouTube engine ------------------------------------------------------
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('yt-music', {
      width: '0',
      height: '0',
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        loop: 1,
        playlist: VIDEO_ID,   // required for loop=1 to repeat a single video
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          ready = true;
          // The real track is preferred: if the synth fallback already kicked
          // in, hand off to YouTube now that it's available.
          if (wantPlay && !muted) { Synth.stop(); engine = 'yt'; player.playVideo(); }
        },
        // Some browsers end the loop; force a replay.
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED && !muted) player.playVideo();
        },
        // Embed blocked / unplayable here → fall back to the offline synth.
        onError: () => { if (wantPlay && !muted && engine !== 'synth') startSynth(); },
      },
    });
  };

  // Inject the IFrame API script (harmless if it never loads — synth covers us).
  (function loadApi() {
    if (window.YT && window.YT.Player) { window.onYouTubeIframeAPIReady(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => { if (wantPlay && !muted && engine !== 'yt') startSynth(); };
    document.head.appendChild(tag);
  })();

  // --- Public interface ----------------------------------------------------

  // Begin playback. Call from a user gesture so the browser allows audio.
  function start() {
    wantPlay = true;
    if (muted) return;
    if (ready && player) { Synth.stop(); engine = 'yt'; player.playVideo(); return; }
    // Give YouTube a moment to come up; if it doesn't, play the synth so there's
    // always music (this is what happens offline or on a file:// page).
    if (!fallbackTimer) {
      fallbackTimer = setTimeout(() => {
        if (wantPlay && !muted && engine !== 'yt') startSynth();
      }, 3000);
    }
  }

  function setMuted(m) {
    muted = m;
    if (muted) {
      Synth.stop();
      if (ready && player) player.pauseVideo();
      return;
    }
    if (!wantPlay) return;
    if (ready && player) { engine = 'yt'; player.playVideo(); }
    else startSynth();
  }

  function toggle() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }

  return { start, setMuted, toggle, isMuted };
})();
