/* DEAD ZONE — zombies.js
 * Six infected archetypes (Walker, Runner, Crawler, Screamer, Tank, Behemoth) in a realistic
 * voxel style: blocky articulated bodies, pixel-art atlas textures (torn clothes, wounds, rot,
 * bone, veins, bandages, boots), random outfits (civilian, police, soldier, doctor, worker),
 * procedural animation, flow-field navigation, separation steering and special abilities.
 * Detail is painted into small shared textures instead of extra meshes to keep draw calls low. */
(function () {
  const { rand, randInt, pick, damp, clamp } = DZ.util;

  const SKINS = [0x7d8a6a, 0x8a8c74, 0x6f7a63, 0x9a947c, 0x6a6e5c, 0x857a6c, 0x5f6a58];
  const SHIRTS = [0x3a3f45, 0x5a2a24, 0x2c3a4a, 0x6b6250, 0x3d4a32, 0x7a7466, 0x262626, 0x4a3a5a, 0x8a7a5a];
  const PANTS = [0x23272e, 0x2f3542, 0x3c3428, 0x1d1d1d, 0x4a4436, 0x2a3a4a];
  const HAIRS = ['#1a1410', '#3a2a1c', '#6a5a3a', '#8a8a86', '#b89a58', null, null];
  const BLOOD = ['#5a0808', '#6a0c0c', '#3a0505', '#7a1010'];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function angleDamp(a, b, k, dt) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }

  /* ---------- Atlas box: every body part shares one geometry whose faces map to a 4x2 atlas ---------- */
  const CELL = { r: [0, 0], l: [1, 0], t: [2, 0], b: [3, 0], f: [0, 1], k: [1, 1] };
  const GEO = (function () {
    const g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv;
    ['r', 'l', 't', 'b', 'f', 'k'].forEach((n, f) => {
      const [cx, cy] = CELL[n];
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i, u0 = uv.getX(idx), v0 = uv.getY(idx);
        uv.setXY(idx, (cx + u0) / 4, 1 - (cy + 1 - v0) / 2);
      }
    });
    uv.needsUpdate = true;
    return g;
  })();
  const CONE = new THREE.ConeGeometry(0.05, 0.28, 5);
  const ORB = new THREE.SphereGeometry(0.05, 8, 6);
  const POOLGEO = new THREE.CircleGeometry(1, 14);

  /* ---------- Static shared materials (not hit-flashed) ---------- */
  const S = {
    bone: new THREE.MeshStandardMaterial({ color: 0xc9bfa5, roughness: 0.6 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.45, metalness: 0.7 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 1.4 }),
    boil: new THREE.MeshStandardMaterial({ color: 0x8a3a1a, emissive: 0x5a1a00, emissiveIntensity: 0.8 }),
    claw: new THREE.MeshStandardMaterial({ color: 0x2a2420 }),
    wound: new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 }),
    helm: new THREE.MeshStandardMaterial({ color: 0x3a4228, roughness: 0.7 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.9 }),
    hard: new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.6 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 }),
    pack: new THREE.MeshStandardMaterial({ color: 0x3a3e2a, roughness: 1 }),
    throat: new THREE.MeshBasicMaterial({ color: 0xff5a2a }),
    pool: new THREE.MeshBasicMaterial({ color: 0x2a0505, transparent: true, opacity: 0.85, depthWrite: false }),
  };
  const EYES = {};
  const eyeMat = (hex) => EYES[hex] || (EYES[hex] = new THREE.MeshBasicMaterial({ color: hex }));

  /* ---------- Pixel-art texture helpers ---------- */
  function shade(hex, k) {
    const r = ((hex >> 16) & 255) * k, g = ((hex >> 8) & 255) * k, b = (hex & 255) * k;
    return `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
  }
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  function grain(g, w, h, n, a = 0.14) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.05, a)})` : `rgba(255,255,255,${rand(0.03, a * 0.6)})`;
      g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
    }
  }
  function blobs(g, w, h, n, cols, max) { for (let i = 0; i < n; i++) R(g, rand(0, w), rand(0, h), rand(1, max), rand(1, max), pick(cols)); }
  function bloodFx(g, w, h, n) {
    for (let i = 0; i < n; i++) {
      const x = rand(0, w), y = rand(0, h * 0.8), s = rand(1, 3.5);
      R(g, x, y, s, s, pick(BLOOD));
      if (Math.random() < 0.5) R(g, x, y + s, 1, rand(1, 4), pick(BLOOD));
    }
  }
  function tear(g, w, h, skinCss) {
    const tw = rand(3, 6), th = rand(2, 5), x = rand(1, Math.max(1, w - tw - 1)), y = rand(1, Math.max(1, h - th - 1));
    R(g, x - 1, y - 1, tw + 2, th + 2, '#2a0606'); R(g, x, y, tw, th, skinCss);
    if (Math.random() < 0.6) R(g, x + 1, y + 1, Math.max(1, tw - 2), Math.max(1, th - 2), '#5a0c0c');
  }
  function camo(g, w, h) { R(g, 0, 0, w, h, '#4a5232'); blobs(g, w, h, (w * h) / 14, ['#2f3a22', '#6a6a40', '#3a3020', '#4a5232'], 5); }
  function crack(g, eg, w, h, n) {
    for (let k = 0; k < n; k++) {
      let x = rand(1, w - 1), y = rand(0, h * 0.3);
      const len = randInt(6, 14);
      for (let i = 0; i < len; i++) {
        R(g, x, y, 1, 1, '#120808'); R(eg, x, y, 1, 1, '#ff6a1a');
        if (Math.random() < 0.2) R(eg, x + 1, y, 1, 1, '#ffb040');
        x += Math.round(rand(-1, 1)); y += 1;
      }
    }
  }
  function tex(c) {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 1;
    return t;
  }
  function makeAtlas(cw, ch, draw) {
    const mk = () => { const c = document.createElement('canvas'); c.width = cw * 4; c.height = ch * 2; return c; };
    const cm = mk(), ce = mk(), g = cm.getContext('2d'), eg = ce.getContext('2d');
    eg.fillStyle = '#000'; eg.fillRect(0, 0, cm.width, cm.height);
    let glow = false;
    for (const n in CELL) {
      const [cx, cy] = CELL[n];
      [g, eg].forEach((c) => { c.save(); c.translate(cx * cw, cy * ch); c.beginPath(); c.rect(0, 0, cw, ch); c.clip(); });
      if (draw(n, g, eg, cw, ch)) glow = true;
      [g, eg].forEach((c) => c.restore());
    }
    return { map: tex(cm), em: glow ? tex(ce) : null };
  }
  const TEXC = {};
  const cached = (key, make) => TEXC[key] || (TEXC[key] = make());

  /* ---------- Texture drawers ---------- */
  function headTex(skinHex, hair, v, scream) {
    return makeAtlas(16, 16, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), dk = shade(skinHex, 0.7);
      R(g, 0, 0, w, h, sk); grain(g, w, h, 45);
      if (v === 2) blobs(g, w, h, 6, ['#4a5a3a', '#3a4a30', '#5a6a40'], 4);
      if (hair) {
        if (n === 't') { R(g, 0, 0, w, h, hair); grain(g, w, h, 50, 0.25); }
        else if (n === 'k') { R(g, 0, 0, w, 11, hair); grain(g, w, 11, 40, 0.25); }
        else if (n === 'r' || n === 'l') { R(g, 0, 0, w, 4, hair); grain(g, w, 4, 15, 0.25); }
        else if (n === 'f') { R(g, 0, 0, w, 3, hair); for (let x = 0; x < w; x += 2) R(g, x, 3, 1, randInt(0, 2), hair); }
      } else if (n === 't') R(g, randInt(3, 8), randInt(2, 10), randInt(4, 7), 1, dk);
      if (n === 'f') {
        R(g, 2, 5, 5, 1, dk); R(g, 9, 5, 5, 1, dk);
        R(g, 2, 6, 4, 3, '#140d0a'); R(g, 10, 6, 4, 3, '#140d0a'); // eye sockets (glowing eyes sit here)
        R(g, 7, 8, 2, 3, dk); R(g, 7, 10, 2, 1, '#2a1410');
        if (scream) {
          R(g, 4, 10, 8, 5, '#2a0606'); R(g, 5, 11, 6, 3, '#7a1a1a'); R(g, 4, 10, 8, 1, '#d8d4c0');
          [5, 7, 9, 10].forEach((x) => R(g, x, 10, 1, 2, '#d8d4c0'));
        } else {
          R(g, 4, 11, 8, 2, '#1a0808');
          for (let x = 4; x < 12; x += 2) { R(g, x, 11, 1, 1, '#cfc9b4'); R(g, x + 1, 12, 1, 1, '#cfc9b4'); }
          R(g, randInt(4, 10), 13, 1, randInt(2, 3), '#5a0808');
        }
        if (v === 1) { bloodFx(g, w, h, 7); R(g, 0, 12, w, 1, '#4a0808'); }
        if (v === 3) { R(g, 9, 0, 6, 5, '#d8d0b8'); R(g, 10, 1, 1, 3, '#8a8070'); R(g, 12, 2, 2, 1, '#8a8070'); R(g, 9, 5, 6, 1, '#5a0808'); }
      }
      if (n === 'r' || n === 'l') { R(g, 7, 6, 3, 4, dk); R(g, 8, 7, 1, 2, shade(skinHex, 0.5)); }
      if (v === 1 && n !== 'f') bloodFx(g, w, h, 3);
      if (v === 4 && n !== 't' && n !== 'b') { R(g, 0, 3, w, 2, '#d8d4c4'); R(g, randInt(1, w - 3), 3, 2, 2, '#7a1010'); }
      for (let i = 0; i < 2; i++) R(g, rand(0, w - 2), rand(6, h - 4), 1, randInt(3, 6), '#3a4a5a');
      return false;
    });
  }

  function torsoTex(outfit, hex, v, skinHex) {
    return makeAtlas(16, 20, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), skd = shade(skinHex, 0.68);
      const bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      let glow = false;
      if (n === 't') { R(g, 0, 0, w, h, bare ? sk : shade(hex, 0.9)); R(g, 4, 4, 8, 12, sk); grain(g, w, h, 40); return false; }
      if (n === 'b') { R(g, 0, 0, w, h, '#1c1c1e'); grain(g, w, h, 40); return false; }
      const face = n === 'f' || n === 'k';
      switch (outfit) {
        case 'police': R(g, 0, 0, w, h, shade(0x26324a, 1)); break;
        case 'soldier': camo(g, w, h); break;
        case 'doc': R(g, 0, 0, w, h, '#c8cac4'); break;
        case 'worker': R(g, 0, 0, w, h, '#5a5a58'); break;
        case 'civ': R(g, 0, 0, w, h, shade(hex, 1)); break;
        default: R(g, 0, 0, w, h, outfit === 'boss' ? shade(0x5c4a42, 1) : sk);
      }
      grain(g, w, h, 70);
      if (bare) {
        const step = outfit === 'scr' ? 3 : 4;
        if (n === 'f') {
          for (let y = 5; y < h - 5; y += step) { R(g, 2, y, 5, 1, skd); R(g, 9, y, 5, 1, skd); }
          R(g, 7, 3, 2, h - 8, skd);
          if (outfit === 'tank') blobs(g, w, h, 8, ['#8a7a5a', '#9a8a62', '#6a5a40'], 3);
          for (let i = 0; i < 4; i++) R(g, 2 + i * 3, 9 + (i % 2), 3, 1, '#2a1a1a');
        }
        if (n === 'k') { R(g, 7, 0, 2, h, skd); R(g, 2, 4, 4, 5, skd); R(g, 10, 4, 4, 5, skd); }
        for (let i = 0; i < 4; i++) R(g, rand(1, w - 2), rand(0, h - 8), 1, randInt(3, 7), '#3a4a5a');
        R(g, rand(2, 10), rand(3, 14), randInt(3, 6), 1, '#6a2a2a');
        if (outfit === 'scr') { R(g, 0, 15, w, 3, '#8a8470'); R(g, 0, 16, w, 1, '#6a6450'); }
        if (outfit === 'tank') R(g, 0, h - 4, w, 4, '#3a2e26');
        if (outfit === 'boss') { crack(g, eg, w, h, 3); glow = true; R(g, 0, h - 4, w, 4, '#2a2420'); }
      } else if (face || n === 'r' || n === 'l') {
        const dk = 'rgba(0,0,0,0.22)';
        if (outfit === 'civ') {
          if (n === 'f') {
            R(g, 6, 0, 4, 2, sk);
            if (v !== 2) for (let y = 3; y < 14; y += 3) R(g, 8, y, 1, 1, 'rgba(255,255,255,0.35)');
            if (v === 0) R(g, 10, 5, 4, 4, dk);
            if (v === 2) R(g, 5, 5, 6, 4, shade(hex, 1.5));
          }
          if (v === 1) for (let x = 0; x < w; x += 3) R(g, x, 0, 1, h, dk);
        } else if (outfit === 'police') {
          if (n === 'f') {
            R(g, 10, 5, 3, 3, '#c8a838'); R(g, 10, 5, 1, 1, '#fff6c8'); R(g, 3, 5, 4, 1, '#cfd2d8');
            R(g, 2, 7, 5, 1, dk); R(g, 9, 7, 5, 1, dk); R(g, 7, 0, 2, 8, '#111'); R(g, 2, 2, 3, 5, '#111');
          }
          if (n === 'r' || n === 'l') R(g, 5, 1, 6, 4, '#c8a838');
        } else if (outfit === 'soldier') {
          if (n === 'f') {
            R(g, 1, 3, 14, 12, '#3a4028');
            [2, 6, 10].forEach((x) => { R(g, x, 8, 4, 5, '#2e341f'); R(g, x, 8, 4, 1, '#1f2415'); });
            R(g, 3, 0, 2, 4, '#2e341f'); R(g, 11, 0, 2, 4, '#2e341f');
          } else if (n === 'k') { R(g, 3, 0, 2, 6, '#2e341f'); R(g, 11, 0, 2, 6, '#2e341f'); }
        } else if (outfit === 'doc') {
          if (n === 'f') {
            R(g, 8, 0, 1, 17, '#a0a29c'); R(g, 6, 0, 4, 3, '#5a8a8a');
            R(g, 3, 7, 4, 4, '#b8bab4'); R(g, 4, 6, 1, 2, '#2a4aa0');
            blobs(g, w, h, 6, BLOOD, 5);
          }
        } else if (outfit === 'worker') {
          if (face) {
            R(g, 0, 0, w, h, '#d8741a'); R(g, 5, 0, 6, 4, '#5a5a58');
            R(g, 0, 8, w, 2, '#c8ccd0'); R(g, 0, 14, w, 2, '#c8ccd0');
            if (n === 'f') R(g, 8, 4, 1, h - 4, '#8a4a10');
            grain(g, w, h, 60, 0.3);
          }
        }
        if (outfit !== 'police' && outfit !== 'doc') R(g, 0, h - 3, w, 3, '#2a2018');
        else if (outfit === 'police') R(g, 0, h - 3, w, 3, '#121212');
        else R(g, 0, h - 2, w, 2, '#a8aaa4');
        if (n === 'f' && outfit === 'civ') R(g, 7, h - 3, 2, 2, '#a08a40');
        for (let i = 0; i < randInt(1, 3); i++) tear(g, w, h - 4, sk);
      }
      bloodFx(g, w, h, outfit === 'doc' ? 3 : randInt(3, 7));
      return glow;
    });
  }

  function sleeveFill(g, w, h, outfit, hex) {
    if (outfit === 'soldier') camo(g, w, h);
    else if (outfit === 'police') R(g, 0, 0, w, h, shade(0x26324a, 1));
    else if (outfit === 'doc') R(g, 0, 0, w, h, '#c8cac4');
    else if (outfit === 'worker') R(g, 0, 0, w, h, '#5a5a58');
    else R(g, 0, 0, w, h, shade(hex, 1));
  }

  function armUTex(outfit, hex, long, skinHex) {
    return makeAtlas(8, 20, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), skd = shade(skinHex, 0.68);
      const bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      let glow = false;
      R(g, 0, 0, w, h, bare && outfit === 'boss' ? shade(0x5c4a42, 1) : sk); grain(g, w, h, 30);
      if (bare) {
        for (let i = 0; i < 3; i++) R(g, rand(0, w - 1), rand(0, h - 6), 1, randInt(3, 7), '#3a4a5a');
        R(g, 0, rand(5, 14), w, 1, skd);
        if (outfit === 'boss') { crack(g, eg, w, h, 1); glow = true; }
      } else {
        const len = long ? h : 11;
        sleeveFill(g, w, len, outfit, hex); grain(g, w, len, 30);
        R(g, 0, len - 1, w, 1, 'rgba(0,0,0,0.3)');
        if (Math.random() < 0.5) tear(g, w, len, sk);
      }
      bloodFx(g, w, h, 2);
      return glow;
    });
  }

  function armFTex(outfit, hex, long, skinHex, v) {
    return makeAtlas(8, 28, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), skd = shade(skinHex, 0.68);
      const bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      let glow = false;
      R(g, 0, 0, w, h, outfit === 'boss' ? shade(0x5c4a42, 1) : sk); grain(g, w, h, 40);
      R(g, 0, 19, w, 1, skd); R(g, 0, 20, w, 1, skd); // wrist + knuckles
      for (let x = 1; x < w; x += 2) R(g, x, 23, 1, 5, skd); // fingers
      for (let x = 0; x < w; x += 2) R(g, x, 27, 1, 1, '#b8b098'); // nails
      if (!bare && long) { sleeveFill(g, w, 4, outfit, hex); R(g, 0, 4, w, 1, 'rgba(0,0,0,0.3)'); }
      if (v === 1) { R(g, 0, 8, w, 5, '#d8d4c4'); R(g, 2, 9, 2, 2, '#7a1010'); } // bandage
      for (let i = 0; i < 2; i++) R(g, rand(0, w - 1), rand(4, 18), 1, randInt(3, 6), '#3a4a5a');
      blobs(g, w, h, 4, ['#4a5a3a', '#3a2a1c'], 3);
      bloodFx(g, w, h, 3);
      if (outfit === 'boss') { crack(g, eg, w, 19, 1); glow = true; }
      if (n === 'b') R(g, 0, 0, w, h, skd);
      return glow;
    });
  }

  function pantsFill(g, w, h, outfit, hex) {
    if (outfit === 'soldier') camo(g, w, h);
    else if (outfit === 'police') R(g, 0, 0, w, h, '#1e2634');
    else if (outfit === 'doc') R(g, 0, 0, w, h, '#5a8a8a');
    else if (outfit === 'worker') R(g, 0, 0, w, h, (hex & 1) ? '#2a3a4a' : '#3a4a5a');
    else R(g, 0, 0, w, h, shade(hex, 1));
  }

  function legUTex(outfit, hex, skinHex, v) {
    return makeAtlas(8, 22, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      let glow = false;
      if (outfit === 'boss') { R(g, 0, 0, w, h, shade(0x5c4a42, 1)); R(g, 0, 0, w, 7, '#2a2420'); crack(g, eg, w, h, 1); glow = true; }
      else if (bare) { R(g, 0, 0, w, h, outfit === 'tank' ? shade(skinHex, 0.95) : sk); R(g, 0, 0, w, 8, outfit === 'tank' ? '#3a2e26' : '#3c3428'); R(g, 0, 8, w, 1, 'rgba(0,0,0,0.4)'); }
      else {
        pantsFill(g, w, h, outfit, hex);
        R(g, 0, 0, 1, h, 'rgba(0,0,0,0.25)');
        if (n === 'f') R(g, 1, 3, 4, 5, 'rgba(0,0,0,0.18)');
        if (v === 1) R(g, 0, 9, w, 1, 'rgba(0,0,0,0.3)');
      }
      grain(g, w, h, 45);
      if (!bare && Math.random() < 0.7) tear(g, w, h, sk);
      bloodFx(g, w, h, randInt(1, 3));
      return glow;
    });
  }

  function legLTex(outfit, hex, skinHex, bootHex) {
    return makeAtlas(8, 22, (n, g, eg, w, h) => {
      const sk = shade(skinHex, 1), bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      let glow = false;
      if (bare) { R(g, 0, 0, w, h, outfit === 'boss' ? shade(0x5c4a42, 1) : sk); grain(g, w, 14, 30); if (outfit === 'boss') { crack(g, eg, w, 14, 1); glow = true; } }
      else { pantsFill(g, w, 16, outfit, hex); grain(g, w, 16, 40); if (Math.random() < 0.5) tear(g, w, 14, sk); }
      // Boots
      R(g, 0, 15, w, h - 15, shade(bootHex, 1)); grain(g, w, h, 30);
      R(g, 0, h - 2, w, 2, '#0a0a0a');
      if (n === 'f') { for (let y = 16; y < 20; y += 2) R(g, 3, y, 2, 1, 'rgba(200,200,190,0.5)'); R(g, 0, 19, w, 1, 'rgba(0,0,0,0.35)'); }
      bloodFx(g, w, 14, 2);
      return glow;
    });
  }

  /* ---------- Zombie ---------- */
  class Zombie {
    constructor(type, pos, game, hpMul = 1) {
      this.type = type; this.def = DZ.ZOMBIES[type]; this.game = game;
      this.maxHp = this.hp = this.def.hp * hpMul;
      this.pos = pos.clone(); this.pos.y = 0;
      this.yaw = rand(0, Math.PI * 2);
      this.phase = rand(0, 10); this.attackT = 0; this.attackCd = rand(0.2, 0.8);
      this.flinch = 0; this.flash = 0; this.dead = false; this.deathT = 0; this.remove = false;
      this.groanT = rand(1, 6); this.buff = 0; this.knock = new THREE.Vector3();
      this.abilityCd = rand(3, 6); this.ability = null; this.abilityT = 0; this.summons = 0;
      this.speedVar = rand(0.88, 1.15);
      this.waypoint = new THREE.Vector3();
      this.pool = null; this.flashOn = false;
      this.build();
    }

    part(parent, w, h, d, mat, x, y, z, name = 'body') {
      const m = new THREE.Mesh(GEO, mat);
      m.scale.set(w, h, d); m.position.set(x, y, z);
      m.userData = { zombie: this, part: name };
      if (this.game.preset.shadows) m.castShadow = true;
      parent.add(m); return m;
    }
    pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }
    spike(parent, mat, x, y, z, rx, rz = 0, s = 1) {
      const c = new THREE.Mesh(CONE, mat);
      c.position.set(x, y, z); c.rotation.set(rx, 0, rz); c.scale.setScalar(s);
      c.userData = { zombie: this, part: 'body' }; parent.add(c); return c;
    }

    pickOutfit(t) {
      if (t === 'screamer') return 'scr';
      if (t === 'tank') return 'tank';
      if (t === 'boss') return 'boss';
      if (t === 'runner') return pick(['civ', 'civ', 'civ', 'worker', 'police']);
      if (t === 'crawler') return pick(['civ', 'civ', 'doc', 'worker']);
      return pick(['civ', 'civ', 'civ', 'civ', 'police', 'soldier', 'doc', 'worker', 'worker']);
    }

    build() {
      const t = this.type;
      const outfit = this.pickOutfit(t);
      const bare = outfit === 'scr' || outfit === 'tank' || outfit === 'boss';
      const skinHex = t === 'screamer' ? 0xb8b6a4 : t === 'tank' ? 0x6e5e58 : t === 'boss' ? 0x5c4a42 : t === 'runner' ? pick([0x9a9a84, 0x8a8c74]) : pick(SKINS);
      const shirtHex = outfit === 'civ' ? pick(SHIRTS) : 0;
      const pantsHex = (outfit === 'civ' || outfit === 'worker') ? pick(PANTS) : 0;
      const hair = bare ? null : pick(HAIRS);
      const long = outfit !== 'civ' || Math.random() < 0.55;
      const hv = randInt(0, 4), tv = randInt(0, 2), av = randInt(0, 1);
      const bootHex = pick([0x1c1a18, 0x2a1c12, 0x3a2a1a]);

      this.mats = []; this.glowMats = [];
      const mkMat = (tx) => {
        const m = new THREE.MeshStandardMaterial({ map: tx.map, roughness: 0.9 });
        if (tx.em) { m.emissiveMap = tx.em; m.emissive.setHex(0xffffff); m.userData.glow = true; this.glowMats.push(m); }
        this.mats.push(m); return m;
      };
      const mHead = mkMat(cached(`h${skinHex}|${hair}|${hv}|${t === 'screamer'}`, () => headTex(skinHex, hair, hv, t === 'screamer')));
      const mTorso = mkMat(cached(`t${outfit}|${shirtHex}|${tv}|${skinHex}`, () => torsoTex(outfit, shirtHex, tv, skinHex)));
      const mArmU = mkMat(cached(`au${outfit}|${shirtHex}|${long}|${skinHex}`, () => armUTex(outfit, shirtHex, long, skinHex)));
      const mArmF = mkMat(cached(`af${outfit}|${shirtHex}|${long}|${skinHex}|${av}`, () => armFTex(outfit, shirtHex, long, skinHex, av)));
      const mLegU = mkMat(cached(`lu${outfit}|${pantsHex}|${skinHex}|${tv}`, () => legUTex(outfit, pantsHex, skinHex, tv)));
      const mLegL = mkMat(cached(`ll${outfit}|${pantsHex}|${skinHex}|${bootHex}`, () => legLTex(outfit, pantsHex, skinHex, bootHex)));
      const mJaw = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.85 }); mJaw.color.multiplyScalar(0.8); this.mats.push(mJaw);
      const eye = eyeMat(this.def.eye);

      const bw = t === 'tank' ? 1.5 : t === 'boss' ? 1.45 : t === 'runner' ? 0.88 : t === 'screamer' ? 0.82 : rand(0.92, 1.15);
      const lt = t === 'tank' ? 1.5 : t === 'boss' ? 1.6 : t === 'runner' ? 0.9 : 1;
      const g = new THREE.Group(); this.group = g;
      const root = this.pivot(g, 0, 0, 0); this.root = root;

      this.part(root, 0.34 * bw, 0.2, 0.21 * bw, mLegU, 0, 0.95, 0);
      const torso = this.torso = this.pivot(root, 0, 1.02, 0);
      this.part(torso, 0.42 * bw, 0.56, 0.25 * bw, mTorso, 0, 0.28, 0);
      if (t === 'tank' || t === 'boss') {
        this.part(torso, 0.5 * bw, 0.25, 0.3 * bw, mArmU, 0, 0.48, -0.02);
        this.part(torso, 0.2, 0.18, 0.2, mArmU, 0.27 * bw, 0.5, 0);
        this.part(torso, 0.22, 0.2, 0.22, mArmU, -0.27 * bw, 0.52, 0);
      }
      if (Math.random() < 0.25 && (outfit === 'soldier' || outfit === 'civ' || outfit === 'worker')) this.part(torso, 0.3 * bw, 0.34, 0.12, S.pack, 0, 0.3, -0.18);

      const neck = this.head = this.pivot(torso, 0, 0.57, t === 'tank' || t === 'boss' ? 0.06 : 0.02);
      const hh = t === 'screamer' ? 0.34 : 0.26;
      this.part(neck, 0.23, hh, 0.24, mHead, 0, hh / 2 + 0.02, 0, 'head');
      this.jaw = this.part(neck, 0.18, 0.06, 0.16, mJaw, 0, 0.02, 0.03, 'head');
      const eyeY = hh * 0.62;
      this.part(neck, 0.05, 0.03, 0.02, eye, -0.055, eyeY, 0.121, 'head');
      this.part(neck, 0.05, 0.03, 0.02, eye, 0.055, eyeY, 0.121, 'head');
      if (t === 'screamer') this.part(neck, 0.08, 0.09, 0.02, S.throat, 0, 0.095, 0.1215, 'head'); // glowing throat

      // Headgear
      if (!bare) {
        if (outfit === 'soldier') this.part(neck, 0.27, 0.1, 0.28, S.helm, 0, hh + 0.045, -0.005, 'head');
        else if (outfit === 'police') { this.part(neck, 0.25, 0.07, 0.26, S.cap, 0, hh + 0.04, -0.005, 'head'); this.part(neck, 0.2, 0.012, 0.08, S.visor, 0, hh + 0.012, 0.15, 'head'); }
        else if (outfit === 'worker' && Math.random() < 0.6) { this.part(neck, 0.26, 0.08, 0.27, S.hard, 0, hh + 0.04, -0.005, 'head'); this.part(neck, 0.28, 0.012, 0.1, S.hard, 0, hh + 0.012, 0.15, 'head'); }
        else if (outfit === 'civ' && Math.random() < 0.15) this.part(neck, 0.24, 0.06, 0.25, S.dark, 0, hh + 0.03, -0.01, 'head');
      }

      if (t === 'boss') {
        for (let i = 0; i < 6; i++) this.spike(torso, S.bone, rand(-0.18, 0.18), 0.15 + i * 0.07, -0.16, -0.9, 0, rand(0.8, 1.2));
        [-1, 1].forEach((s) => { this.spike(torso, S.bone, s * 0.32 * bw, 0.62, 0, 0, -s * 0.8, 1.4); this.spike(neck, S.bone, s * 0.1, hh + 0.04, 0, 0, -s * 0.5, 0.9); });
        for (let i = 0; i < 4; i++) {
          const o = new THREE.Mesh(ORB, S.glow); o.scale.setScalar(rand(0.7, 1.3));
          o.position.set(rand(-0.28, 0.28), rand(0.05, 0.55), pick([0.13, -0.13, 0.1])); o.userData = { zombie: this, part: 'body' };
          torso.add(o);
        }
        this.part(neck, 0.2, 0.08, 0.04, S.bone, 0, 0.0, 0.11, 'head');
      }
      if (t === 'tank') {
        for (let i = 0; i < 4; i++) this.part(torso, rand(0.08, 0.14), rand(0.08, 0.14), 0.06, S.boil, rand(-0.25, 0.25), rand(0.1, 0.5), 0.15);
        const plate = this.part(torso, 0.3, 0.07, 0.32, S.plate, -0.28 * bw, 0.66, 0); plate.rotation.z = 0.3; // scrap-metal shoulder armor
        this.part(torso, 0.34 * bw, 0.1, 0.05, S.plate, 0, 0.35, 0.14);
        for (let i = 0; i < 4; i++) this.spike(torso, S.bone, -0.18 + i * 0.12, 0.45 + (i % 2) * 0.08, -0.15, -0.8, 0, 0.8);
        this.spike(torso, S.bone, 0.3 * bw, 0.64, 0, 0, -0.9, 1);
      }

      const missingArm = (t === 'normal' || t === 'runner') && Math.random() < 0.08 ? pick([-1, 1]) : 0;
      this.arms = [-1, 1].map((side) => {
        const thick = (t === 'tank' && side === 1 ? 1.35 : 1) * lt;
        const sh = this.pivot(torso, side * (0.235 * bw + 0.05 * thick), 0.5, 0);
        this.part(sh, 0.11 * thick, 0.3, 0.11 * thick, mArmU, 0, -0.15, 0);
        const el = this.pivot(sh, 0, -0.3, 0);
        if (missingArm === side) this.part(el, 0.1 * thick, 0.05, 0.1 * thick, S.wound, 0, 0, 0);
        else this.part(el, 0.095 * thick, 0.38, 0.095 * thick, mArmF, 0, -0.19, 0);
        if (t === 'boss') for (let i = -1; i <= 1; i++) this.part(el, 0.02, 0.14, 0.02, S.claw, i * 0.04, -0.43, 0.02);
        return { sh, el, side };
      });

      this.legs = [-1, 1].map((side) => {
        const hip = this.pivot(root, side * 0.1 * bw, 0.92, 0);
        this.part(hip, 0.14 * lt, 0.46, 0.15 * lt, mLegU, 0, -0.22, 0);
        const knee = this.pivot(hip, 0, -0.45, 0);
        const stump = t === 'crawler' && side === 1;
        if (!stump) {
          this.part(knee, 0.12 * lt, 0.44, 0.13 * lt, mLegL, 0, -0.22, 0);
          this.part(knee, 0.12 * lt, 0.08, 0.23 * lt, S.dark, 0, -0.46, 0.04);
        } else this.part(knee, 0.1, 0.06, 0.1, S.wound, 0, 0, 0);
        return { hip, knee, side };
      });

      if (t === 'crawler') {
        root.position.y = -0.67; torso.rotation.x = 1.3;
      }

      const s = this.def.scale * (t === 'boss' || t === 'tank' ? 1 : rand(0.92, 1.08));
      g.scale.setScalar(s);
      this.scale = s;
      g.position.copy(this.pos);
      this.game.scene.add(g);
    }

    takeDamage(amount, point, head, dir) {
      if (this.dead) return false;
      this.hp -= amount;
      this.flinch = Math.min(1, this.flinch + (this.type === 'boss' ? 0.15 : this.type === 'tank' ? 0.3 : 0.8));
      this.flash = 1;
      if (dir && this.type !== 'boss') this.knock.addScaledVector(tmp.copy(dir).setY(0), this.type === 'tank' ? 0.3 : 1.2);
      DZ.Audio.zombieHit(this.pos.x, this.pos.z);
      if (this.hp <= 0) {
        this.die(head, point);
        return true;
      }
      if (this.type === 'boss' && this.summons < 2 && this.hp < this.maxHp * (this.summons === 0 ? 0.66 : 0.33)) {
        this.summons++; this.ability = 'roar'; this.abilityT = 1.6;
        DZ.Audio.roar(this.pos.x, this.pos.z);
        this.game.spawnAround(this.pos, 'runner', 4);
      }
      return false;
    }

    die(head, point) {
      this.dead = true; this.deathT = 0;
      this.fallDir = this.type === 'crawler' ? 0 : pick([-1.5, 1.45]);
      this.fallTilt = rand(-0.5, 0.5);
      if (head && this.type !== 'boss') {
        this.head.visible = false;
        this.game.fx.gore(this.head.getWorldPosition(tmp2));
      } else if (point) this.game.fx.blood(point, 2);
      // Blood pool that spreads under the body.
      const pool = new THREE.Mesh(POOLGEO, S.pool);
      pool.rotation.x = -Math.PI / 2; pool.position.set(this.pos.x, 0.03 + Math.random() * 0.004, this.pos.z);
      pool.scale.setScalar(0.2); this.game.scene.add(pool);
      this.pool = pool; this.poolSize = (this.type === 'boss' ? 2.2 : this.type === 'tank' ? 1.4 : 0.8) * rand(0.8, 1.2);
      this.game.onKill(this, head);
    }

    update(dt) {
      const game = this.game, p = game.player, d = this.def, g = this.group;
      if (this.dead) {
        this.deathT += dt;
        const k = clamp(this.deathT / 0.55, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        g.rotation.x = this.fallDir * e;
        this.arms.forEach((a) => {
          a.sh.rotation.x = damp(a.sh.rotation.x, -0.3, 6, dt);
          a.sh.rotation.z = damp(a.sh.rotation.z, a.side * 0.55, 4, dt);
          a.el.rotation.x = damp(a.el.rotation.x, -0.2, 5, dt);
        });
        this.legs.forEach((l) => {
          l.hip.rotation.x = damp(l.hip.rotation.x, 0.1, 5, dt);
          l.knee.rotation.x = damp(l.knee.rotation.x, 0.15, 5, dt);
        });
        if (this.type !== 'crawler') this.torso.rotation.x = damp(this.torso.rotation.x, 0, 5, dt);
        this.head.rotation.z = damp(this.head.rotation.z, this.fallTilt, 4, dt);
        if (this.pool) this.pool.scale.setScalar(0.2 + clamp(this.deathT / 2.5, 0, 1) * this.poolSize);
        if (this.deathT > 6) g.position.y -= dt * 0.4;
        if (this.deathT > 8) this.remove = true;
        return;
      }

      const toX = p.pos.x - this.pos.x, toZ = p.pos.z - this.pos.z;
      const dist = Math.hypot(toX, toZ);
      this.dist = dist;
      let speed = d.speed * this.speedVar * game.speedMul * (this.buff > 0 ? 1.45 : 1);
      if (this.type === 'tank' && this.hp < this.maxHp * 0.5) speed *= 1.35;
      if (this.type === 'runner' && dist < 6) speed *= 1.25;
      this.buff = Math.max(0, this.buff - dt);
      this.attackCd -= dt; this.abilityCd -= dt;

      // Abilities
      let moving = true, faceX = toX, faceZ = toZ;
      if (this.ability) {
        this.abilityT -= dt;
        if (this.ability === 'scream' || this.ability === 'roar') moving = false;
        if (this.ability === 'slam') {
          moving = false;
          if (!this.slammed && this.abilityT < 0.35) {
            this.slammed = true;
            game.fx.shockwave(this.pos, 9); DZ.Audio.slam(this.pos.x, this.pos.z);
            p.shake = Math.max(p.shake, 0.7);
            if (dist < 8.5 && p.onGround) p.damage(26, this.pos);
          }
        }
        if (this.ability === 'charge') {
          speed *= this.type === 'boss' ? 3.0 : 2.8;
          if (!this.chargeHit && dist < d.range + 0.6) { this.chargeHit = true; p.damage(d.damage * 0.9, this.pos); p.vel.addScaledVector(tmp.set(toX, 0, toZ).normalize(), 9); }
        }
        if (this.abilityT <= 0) this.ability = null;
      } else if (this.type === 'screamer' && dist < 30 && this.abilityCd <= 0) {
        this.ability = 'scream'; this.abilityT = 1.6; this.abilityCd = rand(13, 18);
        DZ.Audio.scream(this.pos.x, this.pos.z); game.onScream(this);
      } else if (this.type === 'boss' && dist < 7 && this.abilityCd <= 0) {
        this.ability = 'slam'; this.abilityT = 1.2; this.abilityCd = rand(4.5, 6.5); this.slammed = false;
      } else if ((this.type === 'boss' || this.type === 'tank') && dist > 9 && dist < 26 && this.abilityCd <= 0) {
        this.ability = 'charge'; this.abilityT = this.type === 'boss' ? 1.8 : 1.4; this.abilityCd = rand(8, 11); this.chargeHit = false;
        DZ.Audio.roar(this.pos.x, this.pos.z);
      }

      const inRange = dist < d.range * this.scale / d.scale;
      if (inRange && this.ability !== 'charge') moving = false;

      if (moving) {
        let tx, tz;
        const wp = dist > 3.5 ? game.world.flowTarget(this.pos.x, this.pos.z, this.waypoint) : null;
        if (wp) { tx = wp.x - this.pos.x; tz = wp.z - this.pos.z; } else { tx = toX; tz = toZ; }
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        // Separation from other zombies.
        let sx = 0, sz = 0;
        for (const o of game.zombies) {
          if (o === this || o.dead) continue;
          const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
          const min = (d.radius + o.def.radius) * 1.05;
          const dd = dx * dx + dz * dz;
          if (dd < min * min && dd > 1e-5) { const k = (min - Math.sqrt(dd)) / min; sx += dx * k * 3; sz += dz * k * 3; }
        }
        this.pos.x += (tx * speed + sx) * dt;
        this.pos.z += (tz * speed + sz) * dt;
        faceX = tx; faceZ = tz;
        this.phase += dt * speed * (this.type === 'runner' ? 2.1 : this.type === 'crawler' ? 3.2 : 2.7) / this.scale;
      } else this.phase += dt * 1.5;

      this.pos.addScaledVector(this.knock, dt * 6);
      this.knock.multiplyScalar(Math.exp(-dt * 6));
      game.world.resolveCircle(this.pos, d.radius);
      // Don't overlap the player.
      const pdx = this.pos.x - p.pos.x, pdz = this.pos.z - p.pos.z, pd = Math.hypot(pdx, pdz), pmin = d.radius + p.radius;
      if (pd < pmin && pd > 1e-4) { this.pos.x = p.pos.x + (pdx / pd) * pmin; this.pos.z = p.pos.z + (pdz / pd) * pmin; }

      // Melee attack.
      if (inRange && !this.ability && this.attackCd <= 0 && this.attackT <= 0) {
        this.attackT = 0.6; this.attackCd = d.attackRate; this.didHit = false;
        DZ.Audio.swing(this.pos.x, this.pos.z);
      }
      if (this.attackT > 0) {
        this.attackT -= dt;
        if (!this.didHit && this.attackT < 0.3) {
          this.didHit = true;
          if (dist < d.range * 1.25 * this.scale / d.scale) p.damage(d.damage * game.damageMul, this.pos);
        }
        faceX = toX; faceZ = toZ;
      }

      this.yaw = angleDamp(this.yaw, Math.atan2(faceX, faceZ), this.type === 'boss' ? 4 : 8, dt);
      g.position.set(this.pos.x, 0, this.pos.z);
      g.rotation.y = this.yaw;

      // Groans.
      this.groanT -= dt;
      if (this.groanT <= 0) {
        this.groanT = rand(3, 8);
        if (dist < 35) DZ.Audio.groan(this.pos.x, this.pos.z, this.type === 'runner' ? 1.4 : this.type === 'screamer' ? 1.7 : 1, this.type === 'boss' ? 2.2 : this.type === 'tank' ? 1.6 : 1);
      }

      this.animate(dt, moving);
    }

    animate(dt, moving) {
      const ph = this.phase, t = this.type;
      this.flinch = Math.max(0, this.flinch - dt * 3.5);
      this.flash = Math.max(0, this.flash - dt * 6);
      const f = this.flash;
      if (f > 0 || this.flashOn) {
        this.mats.forEach((m) => {
          if (m.userData.glow) m.color.setRGB(1 + f * 1.4, 1 - f * 0.5, 1 - f * 0.5);
          else m.emissive.setRGB(f * 0.45, 0, 0);
        });
        this.flashOn = f > 0;
      }
      if (this.glowMats.length) {
        const gk = 0.85 + Math.sin(this.game.time * 3 + this.phase * 0.2) * 0.3;
        this.glowMats.forEach((m) => { m.emissiveIntensity = gk; });
      }
      const sw = Math.sin(ph), cw = Math.cos(ph);
      const atk = this.attackT > 0 ? Math.sin((1 - this.attackT / 0.6) * Math.PI) : 0;
      const [L, R] = this.legs, [AL, AR] = this.arms;

      if (t === 'crawler') {
        this.torso.rotation.x = 1.3 - this.flinch * 0.3;
        AL.sh.rotation.x = -2.2 + sw * 0.45 - atk * 0.6; AR.sh.rotation.x = -2.2 - sw * 0.45 - atk * 0.6;
        AL.el.rotation.x = -0.3 - Math.max(0, cw) * 0.6; AR.el.rotation.x = -0.3 - Math.max(0, -cw) * 0.6;
        L.hip.rotation.x = 1.45 + sw * 0.1; R.hip.rotation.x = 1.45 - sw * 0.1;
        L.knee.rotation.x = 0.2; R.knee.rotation.x = 0;
        this.root.position.x = sw * 0.03;
        this.head.rotation.x = -1.0 + Math.sin(ph * 0.5) * 0.1;
        return;
      }

      const stride = moving ? (t === 'runner' ? 0.85 : t === 'tank' || t === 'boss' ? 0.4 : 0.5) : 0.04;
      L.hip.rotation.x = -sw * stride; R.hip.rotation.x = sw * stride;
      L.knee.rotation.x = Math.max(0, sw) * stride * 1.3; R.knee.rotation.x = Math.max(0, -sw) * stride * 1.3;
      this.root.position.y = moving ? Math.abs(cw) * (t === 'runner' ? 0.06 : 0.03) : 0;

      let lean = t === 'runner' ? 0.38 : t === 'tank' || t === 'boss' ? 0.22 : 0.12;
      if (!moving) lean *= 0.5;
      this.torso.rotation.x = lean - this.flinch * 0.45 + atk * 0.25;
      this.torso.rotation.z = (t === 'tank' || t === 'boss' ? sw * 0.08 : Math.sin(ph * 0.5) * 0.05);
      this.torso.rotation.y = t === 'runner' ? sw * 0.15 : 0;
      this.head.rotation.z = Math.sin(ph * 0.37 + 1) * 0.18;
      this.head.rotation.x = -0.1 + Math.sin(ph * 0.6) * 0.1;
      this.jaw.position.y = 0.02 - Math.abs(Math.sin(ph * 1.3)) * 0.03;

      if (this.ability === 'scream' || this.ability === 'roar') {
        this.head.rotation.x = -0.6; this.jaw.position.y = -0.04;
        AL.sh.rotation.x = -0.4; AR.sh.rotation.x = -0.4; AL.sh.rotation.z = -0.9; AR.sh.rotation.z = 0.9;
        return;
      }
      AL.sh.rotation.z = -0.08; AR.sh.rotation.z = 0.08;
      if (this.ability === 'slam') {
        const k = this.abilityT > 0.35 ? 1 : 0;
        AL.sh.rotation.x = k ? -2.9 : -0.8; AR.sh.rotation.x = k ? -2.9 : -0.8;
        AL.el.rotation.x = AR.el.rotation.x = -0.3;
        this.torso.rotation.x = k ? -0.2 : 0.7;
        return;
      }
      if (t === 'runner') {
        AL.sh.rotation.x = sw * 1.0 - 0.3 - atk * 1.2; AR.sh.rotation.x = -sw * 1.0 - 0.3 - atk * 1.2;
        AL.el.rotation.x = AR.el.rotation.x = -1.2;
      } else {
        const reach = t === 'tank' || t === 'boss' ? -0.6 : -1.35;
        AL.sh.rotation.x = reach + sw * 0.12 - atk * 0.9; AR.sh.rotation.x = reach - sw * 0.12 - atk * 0.9 + (t === 'normal' && this.speedVar > 1.08 ? 1.1 : 0);
        AL.el.rotation.x = -0.25 + atk * 0.4; AR.el.rotation.x = -0.25 + atk * 0.4;
      }
    }

    dispose() {
      this.game.scene.remove(this.group);
      if (this.pool) this.game.scene.remove(this.pool);
      this.mats.forEach((m) => m.dispose());
    }
  }

  DZ.Zombie = Zombie;
})();
