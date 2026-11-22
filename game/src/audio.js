// The Meridian Job — sound: every effect is synthesised live with WebAudio,
// so the game ships no audio files and makes no network request. A tiny
// synth (oscillator + gain envelope, plus filtered noise for the coin) covers
// pickups, alarms, hacks, footsteps and the win/lose stings.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const sfx = {
    // A soft blip when a grab finishes.
    grab() {
      tone(660, 0.12, 'sine', 0.25);
      tone(990, 0.18, 'sine', 0.22, 0.07);
    },
    // The Star's chime: a little arpeggio.
    star() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.09));
    },
    // Coin toss: a metallic clink.
    coin() {
      noise(0.09, 0.3, 5200);
      tone(2400, 0.08, 'square', 0.08);
      tone(3100, 0.12, 'sine', 0.12, 0.05);
    },
    // A guard grows suspicious: a short low warning.
    suspicious() {
      tone(220, 0.16, 'sawtooth', 0.10, 0, 180);
    },
    // Alarm trip: two harsh blasts.
    alarm() {
      tone(740, 0.22, 'square', 0.14);
      tone(740, 0.22, 'square', 0.14, 0.28);
      tone(520, 0.4, 'sawtooth', 0.10, 0.05, 380);
    },
    // Hacking the camera panel: rising beeps.
    hackTick() {
      tone(880 + Math.random() * 120, 0.05, 'square', 0.07);
    },
    hackDone() {
      [440, 587, 880].forEach((f, i) => tone(f, 0.14, 'square', 0.10, i * 0.08));
    },
    // Caught: a low thud and a falling tone.
    caught() {
      tone(160, 0.5, 'sawtooth', 0.22, 0, 60);
      noise(0.3, 0.2, 300);
    },
    // Dawn breaks: a slow, sad drone.
    dawn() {
      tone(196, 1.4, 'triangle', 0.18, 0, 98);
      tone(147, 1.4, 'triangle', 0.14, 0.2, 73);
    },
    // Win: a bright little fanfare.
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 'triangle', 0.2, i * 0.11));
    },
    // A quiet footstep tick, throttled by the caller.
    step(sneaking) {
      noise(0.05, sneaking ? 0.05 : 0.11, sneaking ? 500 : 900);
    },
    // UI click.
    click() {
      tone(1200, 0.05, 'sine', 0.12);
    },
  };

  return {
    ensure,
    play(name) {
      if (typeof sfx[name] === 'function') sfx[name]();
    },
    setMuted(m) {
      muted = !!m;
    },
    get muted() {
      return muted;
    },
  };
}
