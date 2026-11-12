/* DEAD ZONE — audio.js
 * Fully synthesized sound design using the Web Audio API (no external files):
 * layered weapon audio (crack + thump + body + reverb tail + slap-back), mechanical foley
 * (mags, bolts, pump, casings), organic formant-based zombie voices, explosions, ambience,
 * rain and a low drone score. Master bus goes through a DynamicsCompressor to avoid clipping. */
DZ.Audio = (function () {
  const { rand, clamp } = DZ.util;
  let ctx = null, master, comp, sfx, musicBus, noiseBuf, reverbIn;
  let rainGain, windGain, droneGain, rainLevel = 0;
  let routeBus = null, wetMul = 1, shotCount = 0;
  const listener = { x: 0, z: 0, yaw: 0 };

  /* ---------- Setup ---------- */
  function makeImpulse(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, env = Math.exp(-t * 3.4);
        const k = 0.55 - 0.45 * Math.min(1, t / sec); // gets darker over time
        lp += ((Math.random() * 2 - 1) - lp) * k;
        d[i] = lp * env;
      }
      // Early reflections: slap-back off the city buildings.
      [[0.045, 0.55], [0.095, 0.45], [0.17, 0.38], [0.29, 0.28], [0.46, 0.18]].forEach(([tt, a]) => {
        const idx = Math.floor((tt + (c ? 0.007 : 0)) * sr);
        for (let j = 0; j < 40 && idx + j < len; j++) d[idx + j] += (Math.random() * 2 - 1) * a * (1 - j / 40);
      });
    }
    return buf;
  }

  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.22;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = DZ.settings.volume; master.connect(comp);
    sfx = ctx.createGain(); sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = DZ.settings.music; musicBus.connect(master);
    // Shared outdoor reverb (procedural impulse response).
    reverbIn = ctx.createGain();
    const conv = ctx.createConvolver(); conv.buffer = makeImpulse(2.4);
    const rOut = ctx.createGain(); rOut.gain.value = 0.55;
    reverbIn.connect(conv); conv.connect(rOut); rOut.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
  }

  function setVolume(v) { if (master) master.gain.value = v; }
  function setMusic(v) { if (musicBus) musicBus.gain.value = v; }

  /* ---------- Primitives ---------- */
  function output(pan = 0, vol = 1, bus, wet = 0) {
    bus = bus || routeBus || sfx;
    const g = ctx.createGain(); g.gain.value = vol;
    let last = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      g.connect(p); p.connect(bus); last = p;
    } else g.connect(bus);
    if (wet > 0 && reverbIn) {
      const s = ctx.createGain(); s.gain.value = wet * wetMul;
      last.connect(s); s.connect(reverbIn);
    }
    return g;
  }

  function noise(dur, type, freq, vol, pan = 0, q = 0.8, delay = 0, freqEnd, wet = 0) {
    if (!ctx) return;
    dur = Math.max(dur, 0.02); vol = Math.max(vol, 0.0002);
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = dur > 1.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd > 0) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(output(pan, 1, undefined, wet));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, vol, pan = 0, freqEnd, delay = 0, wet = 0) {
    if (!ctx) return;
    dur = Math.max(dur, 0.02); vol = Math.max(vol, 0.0002);
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd > 0) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(output(pan, 1, undefined, wet));
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

  /* Distance simulation: routes everything created inside fn() through gain + lowpass + pan,
   * with more reverb the farther the source is. */
  function withDistance(x, z, maxDist, fn) {
    const s = spatial(x, z, maxDist);
    if (s.vol < 0.01) return;
    const dist = Math.hypot(x - listener.x, z - listener.z);
    const far = ctx.createGain(); far.gain.value = s.vol;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(12000 - dist * 110, 700, 12000);
    far.connect(lp);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(s.pan, -1, 1); lp.connect(p); p.connect(sfx); }
    else lp.connect(sfx);
    routeBus = far; wetMul = s.vol * clamp(0.6 + dist / 60, 0.6, 2.2);
    try { fn(); } finally { routeBus = null; wetMul = 1; }
  }

  /* ---------- Mechanical foley ---------- */
  function click(delay, f = 2200, vol = 0.22, pan = 0.15) {
    noise(0.025, 'bandpass', f * rand(0.92, 1.08), vol, pan, 4, delay);
    tone(f * 0.6, 0.012, 'square', vol * 0.18, pan, null, delay);
  }
  function clack(delay, vol = 0.3, pan = 0.15) {
    noise(0.05, 'bandpass', rand(1200, 1700), vol, pan, 3, delay, 700);
    tone(rand(1500, 2100), 0.03, 'triangle', vol * 0.2, pan, 900, delay);
    tone(rand(300, 420), 0.05, 'triangle', vol * 0.25, pan, 180, delay);
  }
  function thunk(delay, vol = 0.35, pan = 0.15) {
    noise(0.09, 'lowpass', 650, vol, pan, 0.8, delay);
    tone(150, 0.1, 'sine', vol * 0.5, pan, 70, delay);
  }
  function slide(delay, dur, vol = 0.12, pan = 0.15) { noise(dur, 'bandpass', 900, vol, pan, 1.5, delay, 1800); }

  /* ---------- Gun profiles (layered: transient + body + thump + tail) ---------- */
  const gun = {
    pistol(pv, vv) {
      noise(0.035, 'highpass', 4200 * pv, 0.6 * vv, 0, 0.7, 0, null, 0.25);
      noise(0.06, 'bandpass', 3000 * pv, 0.7 * vv, 0, 0.9, 0, 1400, 0.3);
      noise(0.16, 'lowpass', 2800 * pv, 0.55 * vv, 0, 0.7, 0, 400, 0.15);
      tone(210 * pv, 0.1, 'sine', 0.38 * vv, 0, 60);
      tone(420 * pv, 0.03, 'square', 0.1 * vv, 0, 150);
      noise(0.5, 'bandpass', 900, 0.06 * vv, 0, 1, 0.04, null, 0.55);
      click(0.06, 2600, 0.08 * vv);
    },
    rifle(pv, vv) {
      noise(0.025, 'highpass', 6500 * pv, 0.55 * vv, 0, 0.7, 0, null, 0.2); // supersonic snap
      noise(0.07, 'bandpass', 2800 * pv, 0.7 * vv, 0, 0.8, 0, 1200, 0.35); // crack
      noise(0.18, 'lowpass', 4200 * pv, 0.55 * vv, 0, 0.7, 0, 500, 0.2);   // body
      tone(150 * pv, 0.11, 'sine', 0.42 * vv, 0, 45);                      // thump
      tone(95 * pv, 0.14, 'triangle', 0.2 * vv, 0, 40);
      if ((shotCount++ & 1) === 0) noise(0.7, 'bandpass', 700, 0.07 * vv, 0, 1, 0.04, null, 0.65); // tail (every other shot, saves nodes)
      click(0.035, 1900, 0.06 * vv); // bolt carrier
    },
    shotgun(pv, vv) {
      noise(0.08, 'bandpass', 2000 * pv, 0.8 * vv, 0, 0.8, 0, 900, 0.4);
      noise(0.5, 'lowpass', 1800 * pv, 1.0 * vv, 0, 0.6, 0, 200, 0.4);
      tone(90 * pv, 0.3, 'sine', 0.7 * vv, 0, 28);
      tone(60 * pv, 0.25, 'triangle', 0.35 * vv, 0, 25);
      noise(1.0, 'bandpass', 500, 0.12 * vv, 0, 1, 0.06, null, 0.7);
      noise(0.4, 'lowpass', 900, 0.12 * vv, 0, 1, 0.16, null, 0.8); // slap-back echo
    },
    sniper(pv, vv) {
      noise(0.12, 'highpass', 3000 * pv, 1.0 * vv, 0, 0.7, 0, null, 0.5);
      noise(0.9, 'lowpass', 2600 * pv, 1.1 * vv, 0, 0.6, 0, 150, 0.5);
      tone(70 * pv, 0.5, 'sine', 0.8 * vv, 0, 22);
      tone(60 * pv, 0.45, 'sawtooth', 0.3 * vv, 0, 25);
      noise(2.2, 'bandpass', 420, 0.16 * vv, 0, 1, 0.12, null, 0.9);
      noise(1.0, 'lowpass', 700, 0.15 * vv, 0, 1, 0.3, null, 1.0); // distant echo
      // Bolt cycle
      click(0.55, 1800, 0.2); slide(0.6, 0.12, 0.12); clack(0.72, 0.28);
      slide(0.9, 0.1, 0.12); clack(1.02, 0.3); click(1.1, 2200, 0.2);
    },
  };

  /* ---------- Organic voice (sawtooth + sub through two formant filters + ragged AM + breath) ---------- */
  function voice(o) {
    const t = ctx.currentTime + (o.delay || 0), dur = o.dur;
    const out = output(o.pan || 0, 1, undefined, o.wet == null ? 0.15 : o.wet);
    const env = ctx.createGain(), atk = Math.min(o.attack || 0.12, dur * 0.3);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(o.vol, 0.0003), t + atk);
    env.gain.exponentialRampToValueAtTime(Math.max(o.vol * 0.55, 0.0002), t + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const rasp = o.rasp || 0;
    const rg = ctx.createGain(); rg.gain.value = 1 - rasp * 0.5;
    const rl = ctx.createOscillator(); rl.type = 'square'; rl.frequency.value = o.raspHz || 30;
    const rlg = ctx.createGain(); rlg.gain.value = rasp * 0.5; rl.connect(rlg); rlg.connect(rg.gain);
    env.connect(rg); rg.connect(out);
    const mix = ctx.createGain();
    [[o.f1, o.q1 || 4, 1.7], [o.f2, o.q2 || 5, 1.2]].forEach(([f, q, gn]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f, t); bp.frequency.linearRampToValueAtTime(f * (o.shift || 0.88), t + dur);
      const fg = ctx.createGain(); fg.gain.value = gn; mix.connect(bp); bp.connect(fg); fg.connect(env);
    });
    const mk = (type, fr, gn) => {
      const os = ctx.createOscillator(); os.type = type;
      os.frequency.setValueAtTime(fr, t); os.frequency.linearRampToValueAtTime(fr * (o.fall || 0.7), t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib || 6;
      const lg = ctx.createGain(); lg.gain.value = fr * (o.vibDepth || 0.1); lfo.connect(lg); lg.connect(os.frequency);
      const g = ctx.createGain(); g.gain.value = gn; os.connect(g); g.connect(mix);
      os.start(t); lfo.start(t); os.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    };
    mk('sawtooth', o.f0, 1); mk('square', o.f0 * 0.5, 0.45);
    if (o.breath) {
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      const ng = ctx.createGain(); ng.gain.value = o.breath; ns.connect(ng); ng.connect(mix);
      ns.start(t, Math.random()); ns.stop(t + dur + 0.1);
    }
    rl.start(t); rl.stop(t + dur + 0.1);
  }

  /* ---------- Ambience ---------- */
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

  /* ---------- Public API (names/signatures unchanged, plus casing()) ---------- */
  return {
    init, setVolume, setMusic, listener, spatial,
    get ready() { return !!ctx; },

    /* gunshot(kind) = player's weapon. gunshot(kind, x, z) = distant shot with lowpass/falloff. */
    gunshot(kind, x, z) {
      if (!ctx) return;
      const fn = gun[kind]; if (!fn) return;
      const pv = rand(0.95, 1.05), vv = rand(0.88, 1);
      if (typeof x === 'number') withDistance(x, z, 150, () => fn(pv, vv));
      else fn(pv, vv);
    },
    dryFire() { click(0, 1800, 0.2, 0); tone(900, 0.04, 'triangle', 0.06, 0, 500); },
    reload(dur) {
      slide(dur * 0.08, 0.05, 0.1); click(dur * 0.12, 2000, 0.25);        // mag release
      slide(dur * 0.2, 0.09, 0.14);                                       // mag slides out
      slide(dur * 0.5, 0.08, 0.14); thunk(dur * 0.58, 0.35);              // mag in
      clack(dur * 0.8, 0.32); slide(dur * 0.86, 0.06, 0.1); clack(dur * 0.9, 0.35); // charging handle / bolt
    },
    pump() {
      slide(0.08, 0.08, 0.12); clack(0.1, 0.38);   // rack back
      slide(0.26, 0.06, 0.1); clack(0.3, 0.42);    // rack forward
    },
    equip() { slide(0, 0.08, 0.15, 0.1); click(0.07, 1500, 0.2, 0.1); clack(0.12, 0.2, 0.1); },
    /* Brass casing bouncing on asphalt: 3 decaying pings with random pitch. */
    casing() {
      if (!ctx) return;
      const base = rand(2800, 4800), pan = rand(-0.4, 0.4);
      let t = 0, v = 0.14;
      for (let i = 0; i < 3; i++) {
        tone(base * (1 + i * 0.04), 0.05, 'triangle', v, pan, base * 0.8, t, 0.15);
        noise(0.02, 'bandpass', base * 0.6, v * 0.6, pan, 3, t);
        t += 0.1 / (i + 1) + rand(0, 0.03); v *= 0.5;
      }
    },
    hitmarker(head) { tone(head ? 1900 : 1300, 0.05, 'triangle', 0.18); },
    kill() { tone(700, 0.08, 'triangle', 0.15, 0, 1400); },
    hurt() { tone(220, 0.25, 'sawtooth', 0.25, 0, 70); tone(160, 0.18, 'triangle', 0.15, 0, 90, 0.02); noise(0.2, 'lowpass', 600, 0.3); },
    heartbeat() { tone(55, 0.15, 'sine', 0.5); tone(50, 0.15, 'sine', 0.4, 0, null, 0.22); },
    footstep(vol = 0.18) {
      noise(0.09, 'lowpass', 380 + Math.random() * 200, vol);
      tone(75 + Math.random() * 25, 0.07, 'sine', vol * 0.6);
      noise(0.03, 'bandpass', 1800 * rand(0.8, 1.2), vol * 0.25, 0, 1.2);
      if (rainLevel > 0.35) noise(0.12, 'highpass', 3500, vol * 0.35 * rainLevel, 0, 0.8, 0.02); // puddle splash
    },
    pickup() { tone(660, 0.08, 'triangle', 0.2); tone(990, 0.12, 'triangle', 0.2, 0, null, 0.08); },
    crate() { noise(0.3, 'lowpass', 700, 0.4); tone(140, 0.2, 'triangle', 0.2, 0, 90); clack(0.05, 0.2, 0); },
    buy() { tone(520, 0.07, 'square', 0.12); tone(780, 0.1, 'square', 0.12, 0, null, 0.07); },
    deny() { tone(160, 0.2, 'square', 0.15, 0, 120); },
    heal() { tone(400, 0.4, 'sine', 0.15, 0, 800); },
    waveStart() { tone(55, 2.2, 'sawtooth', 0.35, 0, 52, 0, 0.4); tone(82, 2.2, 'sawtooth', 0.2, 0, 78, 0, 0.4); noise(2.5, 'lowpass', 300, 0.25, 0, 0.8, 0, null, 0.5); },
    waveClear() { tone(330, 0.3, 'triangle', 0.2); tone(440, 0.3, 'triangle', 0.2, 0, null, 0.18); tone(660, 0.6, 'triangle', 0.2, 0, null, 0.36); },
    thunder() {
      noise(0.4, 'lowpass', 1500, 0.5, 0, 0.8, 0, null, 0.6);
      noise(3.5, 'lowpass', 260, 0.9, 0, 0.5, 0.2, 60, 0.8);
      noise(4, 'lowpass', 120, 0.5, 0, 0.5, 0.6, 40, 0.6);
    },
    explosion(x, z) {
      const s = spatial(x, z, 90);
      noise(1.6, 'lowpass', 900, 1.3 * s.vol + 0.05, s.pan, 0.6, 0, 80, 0.6);
      noise(0.1, 'bandpass', 2500, 0.8 * s.vol + 0.03, s.pan, 0.8, 0, null, 0.4);
      tone(48, 0.9, 'sine', 0.9 * s.vol + 0.05, s.pan, 22);
      noise(1.2, 'highpass', 3000, 0.15 * s.vol + 0.01, s.pan, 0.8, 0.15, null, 0.4);
      noise(2.5, 'lowpass', 200, 0.5 * s.vol + 0.03, s.pan, 0.6, 0.1, null, 0.9);
    },
    groan(x, z, pitch = 1, size = 1) {
      if (!ctx) return;
      const s = spatial(x, z, 40); if (s.vol < 0.02) return;
      const f0 = rand(80, 120) * pitch / size;
      const dur = rand(0.7, 1.4) * size * (pitch > 1.3 ? 0.7 : 1);
      const v = rand(0.9, 1.1); // vowel variation
      let p;
      if (size >= 2) p = { f1: 300, f2: 700, q1: 3, q2: 4, rasp: 0.65, raspHz: 22, wet: 0.45 };            // Behemoth
      else if (size >= 1.5) p = { f1: 450, f2: 900, q1: 3, q2: 4, rasp: 0.45, raspHz: 26, wet: 0.35 };     // Tank
      else if (pitch >= 1.6) p = { f1: 900, f2: 2300, q1: 4, q2: 5, rasp: 0.35, raspHz: 34, wet: 0.2 };    // Screamer
      else if (pitch >= 1.3) p = { f1: 700, f2: 1350, q1: 4, q2: 5, rasp: 0.5, raspHz: 38, wet: 0.15 };    // Runner
      else p = { f1: 650, f2: 1100, q1: 5, q2: 6, rasp: 0.25, raspHz: 30, wet: 0.15 };                      // Walker
      voice({ ...p, f1: p.f1 * v, f2: p.f2 * v, pan: s.pan, vol: 0.4 * s.vol, f0, dur, fall: rand(0.6, 0.8), vib: rand(5, 9), vibDepth: 0.1, breath: 0.3, attack: 0.15 });
    },
    scream(x, z) {
      if (!ctx) return;
      const s = spatial(x, z, 120);
      const t = ctx.currentTime;
      const out = output(s.pan, 1, undefined, 0.3);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.12 * s.vol + 0.02, t + 0.08);
      env.gain.setValueAtTime(0.12 * s.vol + 0.02, t + 1.0);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      const rg = ctx.createGain(); rg.gain.value = 0.7;
      const rl = ctx.createOscillator(); rl.type = 'square'; rl.frequency.value = 38;
      const rlg = ctx.createGain(); rlg.gain.value = 0.3; rl.connect(rlg); rlg.connect(rg.gain);
      env.connect(rg); rg.connect(out);
      const mix = ctx.createGain();
      [[1800, 2, 1.5], [3200, 3, 0.9]].forEach(([f, q, gn]) => {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const fg = ctx.createGain(); fg.gain.value = gn; mix.connect(bp); bp.connect(fg); fg.connect(env);
      });
      [1, 1.5, 2.02].forEach((m) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(600 * m, t); o.frequency.linearRampToValueAtTime(1300 * m, t + 0.4);
        o.frequency.linearRampToValueAtTime(900 * m, t + 1.4);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
        const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
        o.connect(mix); o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
      });
      rl.start(t); rl.stop(t + 1.6);
      noise(1.4, 'highpass', 3000, 0.25 * s.vol + 0.03, s.pan, 0.8, 0, null, 0.3);
    },
    roar(x, z) {
      if (!ctx) return;
      const s = spatial(x, z, 150);
      voice({ f0: 48, dur: 2.2, vol: 0.7 * s.vol + 0.08, pan: s.pan, f1: 300, f2: 750, q1: 3, q2: 4, rasp: 0.7, raspHz: 22, vib: 5, vibDepth: 0.06, fall: 0.65, breath: 0.4, wet: 0.5, attack: 0.25 });
      voice({ f0: 72, dur: 2.0, vol: 0.4 * s.vol + 0.06, pan: s.pan, f1: 420, f2: 900, q1: 3, q2: 4, rasp: 0.6, raspHz: 26, vib: 6, vibDepth: 0.06, fall: 0.6, breath: 0.3, wet: 0.5, attack: 0.25 });
      noise(2.2, 'lowpass', 500, 0.5 * s.vol + 0.08, s.pan, 1, 0, 150, 0.4);
      tone(40, 1.6, 'sine', 0.5 * s.vol + 0.05, s.pan, 26, 0, 0.3);
    },
    slam(x, z) {
      const s = spatial(x, z, 80);
      noise(0.9, 'lowpass', 400, 1.0 * s.vol + 0.1, s.pan, 0.6, 0, 60, 0.6);
      tone(40, 0.6, 'sine', s.vol + 0.1, s.pan, 25, 0, 0.3);
      noise(0.08, 'bandpass', 1500, 0.5 * s.vol + 0.03, s.pan, 1, 0, null, 0.4);
    },
    zombieHit(x, z) {
      const s = spatial(x, z, 60);
      noise(0.08, 'bandpass', 700, 0.3 * s.vol, s.pan, 2);
      tone(130, 0.08, 'sine', 0.2 * s.vol, s.pan, 60);
    },
    swing(x, z) { const s = spatial(x, z, 20); noise(0.15, 'bandpass', 1200, 0.25 * s.vol, s.pan, 1.5, 0, 400); },
    setRain(level) { rainLevel = level; if (rainGain) rainGain.gain.setTargetAtTime(level * 0.22, ctx.currentTime, 1.5); },
    setTension(level) { if (droneGain) droneGain.gain.setTargetAtTime(0.03 + level * 0.12, ctx.currentTime, 2); },
  };
})();
