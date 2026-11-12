/* DEAD ZONE — audio.js
 * Fully synthesized sound design using the Web Audio API (no external files):
 * weapons, zombies, footsteps, explosions, ambience, rain and a low drone score. */
DZ.Audio = (function () {
  let ctx = null, master, sfx, musicBus, noiseBuf;
  let rainGain, windGain, droneGain;
  const listener = { x: 0, z: 0, yaw: 0 };

  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = DZ.settings.volume; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = DZ.settings.music; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
  }

  function setVolume(v) { if (master) master.gain.value = v; }
  function setMusic(v) { if (musicBus) musicBus.gain.value = v; }

  function output(pan = 0, vol = 1, bus = sfx) {
    const g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = DZ.util.clamp(pan, -1, 1);
      g.connect(p); p.connect(bus);
    } else g.connect(bus);
    return g;
  }

  function noise(dur, type, freq, vol, pan = 0, q = 0.8, delay = 0, freqEnd) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(output(pan));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, vol, pan = 0, freqEnd, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(output(pan));
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* Returns {pan, vol} for a world position relative to the listener (camera). */
  function spatial(x, z, maxDist = 55) {
    const dx = x - listener.x, dz = z - listener.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    const pan = (dx * rx + dz * rz) / dist;
    const vol = Math.max(0, 1 - dist / maxDist) ** 1.6;
    return { pan: pan * 0.8, vol };
  }

  const gunProfiles = {
    pistol:  () => { noise(0.22, 'lowpass', 3200, 0.75, 0, 0.7, 0, 500); tone(180, 0.09, 'square', 0.25, 0, 50); noise(0.5, 'bandpass', 900, 0.08, 0, 1, 0.05); },
    rifle:   () => { noise(0.16, 'lowpass', 4200, 0.7, 0, 0.7, 0, 600); tone(130, 0.08, 'square', 0.28, 0, 45); noise(0.4, 'bandpass', 700, 0.07, 0, 1, 0.04); },
    shotgun: () => { noise(0.5, 'lowpass', 1800, 1.0, 0, 0.6, 0, 200); tone(85, 0.25, 'sawtooth', 0.45, 0, 30); noise(0.9, 'bandpass', 500, 0.12, 0, 1, 0.08); noise(0.06, 'highpass', 2500, 0.2, 0.2, 1, 0.45); noise(0.06, 'highpass', 2200, 0.2, 0.2, 1, 0.6); },
    sniper:  () => { noise(0.8, 'lowpass', 2600, 1.1, 0, 0.6, 0, 150); tone(60, 0.45, 'sawtooth', 0.55, 0, 25); noise(1.6, 'bandpass', 420, 0.16, 0, 1, 0.12); noise(0.08, 'highpass', 1800, 0.25, 0.3, 1, 0.75); },
  };

  return {
    init, setVolume, setMusic, listener, spatial,
    get ready() { return !!ctx; },
    gunshot(kind) { if (ctx) gunProfiles[kind](); },
    dryFire() { tone(1800, 0.03, 'square', 0.12); },
    reload(dur) {
      noise(0.05, 'highpass', 2000, 0.25, 0.2, 1, 0.15);
      noise(0.06, 'bandpass', 900, 0.3, 0.2, 2, dur * 0.45);
      noise(0.07, 'highpass', 2600, 0.35, 0.2, 1, dur * 0.85);
    },
    pump() { noise(0.08, 'bandpass', 1200, 0.3, 0.2, 2, 0.12); noise(0.08, 'bandpass', 1600, 0.3, 0.2, 2, 0.3); },
    equip() { noise(0.08, 'bandpass', 1500, 0.2, 0.1, 2); },
    hitmarker(head) { tone(head ? 1900 : 1300, 0.05, 'triangle', 0.18); },
    kill() { tone(700, 0.08, 'triangle', 0.15, 0, 1400); },
    hurt() { tone(220, 0.25, 'sawtooth', 0.25, 0, 70); noise(0.2, 'lowpass', 600, 0.3); },
    heartbeat() { tone(55, 0.15, 'sine', 0.5); tone(50, 0.15, 'sine', 0.4, 0, null, 0.22); },
    footstep(vol = 0.18) { noise(0.09, 'lowpass', 380 + Math.random() * 200, vol); },
    pickup() { tone(660, 0.08, 'triangle', 0.2); tone(990, 0.12, 'triangle', 0.2, 0, null, 0.08); },
    crate() { noise(0.3, 'lowpass', 700, 0.4); tone(140, 0.2, 'triangle', 0.2, 0, 90); },
    buy() { tone(520, 0.07, 'square', 0.12); tone(780, 0.1, 'square', 0.12, 0, null, 0.07); },
    deny() { tone(160, 0.2, 'square', 0.15, 0, 120); },
    heal() { tone(400, 0.4, 'sine', 0.15, 0, 800); },
    waveStart() { tone(55, 2.2, 'sawtooth', 0.35, 0, 52); tone(82, 2.2, 'sawtooth', 0.2, 0, 78); noise(2.5, 'lowpass', 300, 0.25); },
    waveClear() { tone(330, 0.3, 'triangle', 0.2); tone(440, 0.3, 'triangle', 0.2, 0, null, 0.18); tone(660, 0.6, 'triangle', 0.2, 0, null, 0.36); },
    thunder() { noise(3.5, 'lowpass', 260, 0.9, 0, 0.5, 0.2, 60); noise(0.4, 'lowpass', 1500, 0.5); },
    explosion(x, z) {
      const s = spatial(x, z, 90);
      noise(1.6, 'lowpass', 900, 1.3 * s.vol + 0.05, s.pan, 0.6, 0, 80);
      tone(48, 0.9, 'sine', 0.9 * s.vol + 0.05, s.pan, 22);
    },
    groan(x, z, pitch = 1, size = 1) {
      if (!ctx) return;
      const s = spatial(x, z, 40); if (s.vol < 0.02) return;
      const t = ctx.currentTime, dur = DZ.util.rand(0.7, 1.4) * size;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const base = DZ.util.rand(80, 120) * pitch / size;
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = DZ.util.rand(5, 9);
      const lfoG = ctx.createGain(); lfoG.gain.value = base * 0.12; lfo.connect(lfoG); lfoG.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 * pitch; f.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * s.vol, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(output(s.pan));
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    },
    scream(x, z) {
      if (!ctx) return;
      const s = spatial(x, z, 120);
      const t = ctx.currentTime;
      [1, 1.5, 2.02].forEach((m) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(600 * m, t); o.frequency.linearRampToValueAtTime(1300 * m, t + 0.4);
        o.frequency.linearRampToValueAtTime(900 * m, t + 1.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * s.vol + 0.03, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.2;
        o.connect(f); f.connect(g); g.connect(output(s.pan));
        o.start(t); o.stop(t + 1.6);
      });
      noise(1.4, 'highpass', 3000, 0.25 * s.vol + 0.03, s.pan);
    },
    roar(x, z) {
      const s = spatial(x, z, 150);
      tone(45, 2.2, 'sawtooth', 0.8 * s.vol + 0.1, s.pan, 30);
      tone(70, 2.0, 'sawtooth', 0.5 * s.vol + 0.1, s.pan, 40);
      noise(2.2, 'lowpass', 500, 0.6 * s.vol + 0.1, s.pan, 1, 0, 150);
    },
    slam(x, z) { const s = spatial(x, z, 80); noise(0.9, 'lowpass', 400, 1.0 * s.vol + 0.1, s.pan, 0.6, 0, 60); tone(40, 0.6, 'sine', s.vol + 0.1, s.pan, 25); },
    zombieHit(x, z) { const s = spatial(x, z, 60); noise(0.08, 'bandpass', 700, 0.3 * s.vol, s.pan, 2); },
    swing(x, z) { const s = spatial(x, z, 20); noise(0.15, 'bandpass', 1200, 0.25 * s.vol, s.pan, 1.5, 0, 400); },
    setRain(level) { if (rainGain) rainGain.gain.setTargetAtTime(level * 0.22, ctx.currentTime, 1.5); },
    setTension(level) { if (droneGain) droneGain.gain.setTargetAtTime(0.03 + level * 0.12, ctx.currentTime, 2); },
  };

  function loopNoise(type, freq, vol, bus = sfx) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(bus); src.start();
    return { g, f };
  }

  function startAmbience() {
    const wind = loopNoise('lowpass', 320, 0.07); windGain = wind.g;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
    rainGain = loopNoise('highpass', 2500, 0).g;
    // Minor drone pad for the score: detuned saws through a slow filter.
    droneGain = ctx.createGain(); droneGain.gain.value = 0.04; droneGain.connect(musicBus);
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 380; df.connect(droneGain);
    [55, 55.4, 65.4, 82.4].forEach((fr) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(df); o.start();
    });
    const dl = ctx.createOscillator(); dl.frequency.value = 0.04;
    const dg = ctx.createGain(); dg.gain.value = 180; dl.connect(dg); dg.connect(df.frequency); dl.start();
  }
})();
