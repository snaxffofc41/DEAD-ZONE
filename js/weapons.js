/* DEAD ZONE — weapons.js
 * Weapon arsenal: detailed voxel-realistic first-person models (pixel-art textures, gloved hands,
 * optics), hitscan ballistics (spread, pellets, penetration, falloff, headshots), recoil,
 * reload/switch/inspect animations (left hand goes to the mag), brass ejection, ADS with scope,
 * upgrades and throwable grenades. */
(function () {
  const { rand, damp, clamp } = DZ.util;
  const I = DZ.Input;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmpW = new THREE.Vector3();

  /* ---------- Pixel-art textures & materials ---------- */
  const M = {};
  function pix(w, h, draw) {
    const t = DZ.canvasTex(w, h, draw);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.anisotropy = 1;
    return t;
  }
  function speckle(g, w, h, base, n, a) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${rand(0.03, a)})`;
      g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
    }
  }
  function mats() {
    if (M.metal) return M;
    const metalTex = pix(32, 32, (g, w, h) => {
      speckle(g, w, h, '#26282b', 110, 0.22);
      g.fillStyle = 'rgba(200,200,205,0.16)';
      for (let i = 0; i < 7; i++) g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, (4 + Math.random() * 8) | 0, 1);
      g.strokeStyle = 'rgba(160,160,165,0.28)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    });
    const polyTex = pix(32, 32, (g, w, h) => speckle(g, w, h, '#18191b', 170, 0.2));
    const woodTex = pix(32, 32, (g, w, h) => {
      g.fillStyle = '#5a3820'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,15,5' : '150,100,60'},${rand(0.08, 0.3)})`; g.fillRect(0, y, w, 1); }
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,10,4,0.25)'; g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1); }
    });
    const oliveTex = pix(32, 32, (g, w, h) => speckle(g, w, h, '#46502f', 130, 0.16));
    const gloveTex = pix(16, 16, (g, w, h) => {
      g.fillStyle = '#1f2224'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y) % 2) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, y, 1, 1); }
    });
    const sleeveTex = pix(32, 32, (g, w, h) => {
      g.fillStyle = '#2f3626'; g.fillRect(0, 0, w, h);
      const cols = ['#3d472f', '#232a1c', '#4a4f36'];
      for (let i = 0; i < 14; i++) { g.fillStyle = cols[i % 3]; g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 3 + ((Math.random() * 6) | 0), 2 + ((Math.random() * 4) | 0)); }
    });
    M.metal = new THREE.MeshStandardMaterial({ map: metalTex, color: 0xffffff, roughness: 0.4, metalness: 0.75 });
    M.poly = new THREE.MeshStandardMaterial({ map: polyTex, color: 0xffffff, roughness: 0.75, metalness: 0.1 });
    M.wood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.6, metalness: 0.05 });
    M.olive = new THREE.MeshStandardMaterial({ map: oliveTex, color: 0xffffff, roughness: 0.7, metalness: 0.15 });
    M.glove = new THREE.MeshStandardMaterial({ map: gloveTex, color: 0xffffff, roughness: 0.9 });
    M.sleeve = new THREE.MeshStandardMaterial({ map: sleeveTex, color: 0xffffff, roughness: 1 });
    M.skin = new THREE.MeshStandardMaterial({ color: 0xa57c60, roughness: 0.8 });
    M.lens = new THREE.MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.05, metalness: 0.9 });
    M.glass = new THREE.MeshBasicMaterial({ color: 0x77d0ff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    M.dot = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    M.brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.3, metalness: 0.9 });
    M.black = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.9 });
    M.rubber = new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 });
    M.shell = new THREE.MeshStandardMaterial({ color: 0x9a2a1e, roughness: 0.6 });
    M.white = new THREE.MeshBasicMaterial({ color: 0xe8e8e0 });
    return M;
  }

  /* ---------- Builders ---------- */
  function box(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  }
  function cyl(parent, r, len, mat, x, y, z, axis = 'z', seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
    parent.add(m); return m;
  }
  function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  /* Gloved hand (palm, knuckle plate, 4 two-segment fingers, thumb, cuff, strap) + camo sleeve to the elbow.
   * side: 1 = right hand, -1 = left hand. Returns the group so it can be animated. */
  function arm(parent, hx, hy, hz, ex, ey, ez, side = 1) {
    const a = new THREE.Group(); parent.add(a);
    const h = grp(a, hx, hy, hz);
    box(h, 0.058, 0.032, 0.07, M.glove, 0, 0, 0);
    box(h, 0.05, 0.008, 0.026, M.metal, 0, 0.02, -0.012);
    for (let i = 0; i < 4; i++) {
      const fx = -0.0215 + i * 0.0143, fl = 1 - Math.abs(i - 1.5) * 0.06;
      box(h, 0.0125, 0.014, 0.032 * fl, M.glove, fx, -0.004, -0.05, 0.25);
      box(h, 0.0115, 0.028, 0.012, M.glove, fx, -0.022, -0.064 * fl);
    }
    box(h, 0.016, 0.015, 0.04, M.glove, -side * 0.036, 0.004, -0.02, 0, side * 0.5, 0);
    box(h, 0.068, 0.068, 0.03, M.sleeve, 0, 0, 0.05);
    box(h, 0.06, 0.006, 0.016, M.poly, 0, 0.036, 0.05);
    const from = V(hx, hy, hz + 0.06), to = V(ex, ey, ez);
    const len = from.distanceTo(to);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, len), M.sleeve);
    a.add(sleeve);
    sleeve.position.copy(from).add(to).multiplyScalar(0.5);
    sleeve.quaternion.setFromUnitVectors(V(0, 0, 1), to.clone().sub(from).normalize());
    return a;
  }

  function buildModel(def) {
    mats();
    const g = new THREE.Group();
    const r = { group: g, muzzle: new THREE.Object3D(), mag: null, pump: null, bolt: null, lhand: null, lhandTo: V(0, 0, 0), eject: new THREE.Object3D(), flashX: [] };

    if (def.id === 'glock') {
      // Slide with serrations, ejection port, sights
      box(g, 0.034, 0.038, 0.19, M.metal, 0, 0.02, -0.02);
      for (let i = 0; i < 6; i++) [-1, 1].forEach((s) => box(g, 0.002, 0.028, 0.003, M.black, s * 0.0171, 0.02, 0.025 + i * 0.009));
      for (let i = 0; i < 3; i++) [-1, 1].forEach((s) => box(g, 0.002, 0.028, 0.003, M.black, s * 0.0171, 0.02, -0.085 - i * 0.009));
      box(g, 0.0012, 0.012, 0.04, M.black, 0.0172, 0.026, -0.015);
      box(g, 0.007, 0.01, 0.01, M.black, -0.0075, 0.0445, 0.068); box(g, 0.007, 0.01, 0.01, M.black, 0.0075, 0.0445, 0.068);
      box(g, 0.005, 0.01, 0.008, M.black, 0, 0.0445, -0.108); box(g, 0.003, 0.003, 0.002, M.white, 0, 0.047, -0.1125);
      cyl(g, 0.006, 0.01, M.black, 0, 0.02, -0.12, 'z', 8);
      // Frame, rail, trigger guard, trigger
      box(g, 0.032, 0.024, 0.16, M.poly, 0, -0.01, -0.015);
      box(g, 0.02, 0.006, 0.03, M.poly, 0, -0.025, -0.07);
      box(g, 0.006, 0.02, 0.004, M.poly, 0, -0.032, -0.04); box(g, 0.006, 0.004, 0.04, M.poly, 0, -0.042, -0.02);
      box(g, 0.004, 0.014, 0.004, M.metal, 0, -0.03, -0.002);
      box(g, 0.008, 0.02, 0.045, M.poly, 0, -0.035, 0.0);
      // Grip with stipple lines and mag baseplate
      const grip = grp(g, 0, -0.065, 0.045); grip.rotation.x = 0.2;
      box(grip, 0.031, 0.1, 0.048, M.poly, 0, 0, 0);
      for (let i = 0; i < 4; i++) box(grip, 0.033, 0.004, 0.003, M.black, 0, 0.03 - i * 0.02, -0.025);
      r.mag = box(g, 0.026, 0.02, 0.04, M.metal, 0, -0.118, 0.056, 0.2);
      r.muzzle.position.set(0, 0.02, -0.125);
      r.eject.position.set(0.03, 0.026, -0.015);
      arm(g, 0, -0.07, 0.06, 0.06, -0.2, 0.38, 1);
      r.lhand = arm(g, -0.028, -0.06, 0.05, -0.16, -0.2, 0.32, -1);
      r.lhandTo.set(0.03, -0.06, 0.01);
      r.hip = V(0.17, -0.165, -0.36); r.ads = V(0, -0.05, -0.28);

    } else if (def.id === 'm4') {
      // Receivers + magwell
      box(g, 0.044, 0.034, 0.3, M.metal, 0, 0.016, 0);
      box(g, 0.042, 0.04, 0.2, M.poly, 0, -0.022, 0.05);
      box(g, 0.04, 0.036, 0.075, M.metal, 0, -0.046, -0.045);
      // Flat-top Picatinny rail with slots
      box(g, 0.026, 0.012, 0.5, M.metal, 0, 0.039, -0.1);
      for (let z = -0.33; z < 0.14; z += 0.035) box(g, 0.028, 0.004, 0.006, M.black, 0, 0.0455, z);
      // Round ribbed handguard + delta ring + vertical foregrip
      cyl(g, 0.036, 0.012, M.metal, 0, 0.005, -0.138, 'z', 8);
      cyl(g, 0.031, 0.26, M.poly, 0, 0.005, -0.27, 'z', 8);
      for (let i = 0; i < 8; i++) cyl(g, 0.0335, 0.012, M.metal, 0, 0.005, -0.165 - i * 0.03, 'z', 8);
      const fg = grp(g, 0, -0.075, -0.3);
      box(fg, 0.026, 0.09, 0.032, M.poly, 0, 0, 0);
      for (let i = 0; i < 3; i++) box(fg, 0.028, 0.006, 0.034, M.black, 0, -0.02 + i * 0.02, 0);
      // Barrel, gas block, A2 front sight, birdcage flash hider
      cyl(g, 0.009, 0.2, M.metal, 0, 0.005, -0.5, 'z', 8);
      box(g, 0.018, 0.022, 0.03, M.metal, 0, 0.008, -0.425);
      box(g, 0.014, 0.036, 0.016, M.metal, 0, 0.037, -0.425);
      box(g, 0.003, 0.026, 0.014, M.metal, -0.0075, 0.067, -0.425); box(g, 0.003, 0.026, 0.014, M.metal, 0.0075, 0.067, -0.425);
      box(g, 0.003, 0.028, 0.003, M.metal, 0, 0.07, -0.425);
      cyl(g, 0.013, 0.045, M.metal, 0, 0.005, -0.612, 'z', 8);
      box(g, 0.03, 0.005, 0.012, M.black, 0, 0.005, -0.606); box(g, 0.005, 0.03, 0.012, M.black, 0, 0.005, -0.622);
      cyl(g, 0.0095, 0.004, M.black, 0, 0.005, -0.634, 'z', 8);
      // Ejection port, dust cover, charging handle, selector, mag release, folded rear sight
      box(g, 0.003, 0.016, 0.04, M.black, 0.0225, 0.012, 0.0);
      box(g, 0.004, 0.018, 0.045, M.metal, 0.0236, 0.012, 0.0, 0, 0, 0.15);
      box(g, 0.03, 0.012, 0.036, M.poly, 0, 0.03, 0.17); box(g, 0.012, 0.01, 0.01, M.metal, 0, 0.03, 0.195);
      box(g, 0.004, 0.014, 0.01, M.metal, -0.023, -0.002, 0.06);
      box(g, 0.004, 0.012, 0.016, M.metal, 0.022, -0.04, -0.03);
      box(g, 0.02, 0.008, 0.03, M.metal, 0, 0.0495, 0.1);
      // Trigger guard + trigger
      box(g, 0.006, 0.004, 0.04, M.metal, 0, -0.066, 0.03); box(g, 0.006, 0.025, 0.004, M.metal, 0, -0.054, 0.01);
      box(g, 0.004, 0.02, 0.004, M.metal, 0, -0.05, 0.035, 0.2);
      // Pistol grip with finger grooves
      const pg = grp(g, 0, -0.07, 0.1); pg.rotation.x = -0.3;
      box(pg, 0.03, 0.09, 0.04, M.poly, 0, 0, 0);
      for (let i = 0; i < 3; i++) box(pg, 0.032, 0.006, 0.006, M.black, 0, 0.025 - i * 0.025, -0.02);
      // Buffer tube + 6-position collapsible stock + sling loop
      cyl(g, 0.018, 0.16, M.metal, 0, 0.005, 0.22, 'z', 8);
      box(g, 0.04, 0.07, 0.16, M.poly, 0, -0.015, 0.3);
      box(g, 0.034, 0.01, 0.12, M.poly, 0, 0.03, 0.29);
      [-1, 1].forEach((s) => [0.27, 0.3, 0.33].forEach((z) => box(g, 0.002, 0.03, 0.016, M.black, s * 0.0205, -0.015, z)));
      box(g, 0.01, 0.03, 0.01, M.metal, 0, -0.06, 0.34);
      // Compact holographic/red-dot sight with open window (clean ADS view)
      box(g, 0.044, 0.02, 0.07, M.poly, 0, 0.076, -0.1);
      box(g, 0.008, 0.05, 0.07, M.poly, -0.022, 0.1, -0.1); box(g, 0.008, 0.05, 0.07, M.poly, 0.022, 0.1, -0.1);
      box(g, 0.052, 0.012, 0.07, M.poly, 0, 0.12, -0.1);
      box(g, 0.056, 0.006, 0.014, M.metal, 0, 0.128, -0.07);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.028), M.glass); glass.position.set(0, 0.1, -0.1); g.add(glass);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 6, 6), M.dot); dot.position.set(0, 0.1, -0.115); g.add(dot);
      // Magazine (group so it can detach during reload)
      const mag = grp(g, 0, -0.1, -0.05); mag.rotation.x = 0.18;
      box(mag, 0.03, 0.15, 0.065, M.metal, 0, 0, 0);
      for (let i = 0; i < 5; i++) box(mag, 0.032, 0.004, 0.067, M.black, 0, -0.06 + i * 0.03, 0);
      box(mag, 0.034, 0.012, 0.07, M.poly, 0, -0.081, 0);
      r.mag = mag;
      r.bolt = box(g, 0.012, 0.01, 0.03, M.metal, 0.026, 0.02, 0.04);
      r.muzzle.position.set(0, 0.005, -0.64);
      r.eject.position.set(0.03, 0.012, 0.0);
      arm(g, 0, -0.08, 0.12, 0.06, -0.22, 0.42, 1);
      r.lhand = arm(g, -0.01, -0.045, -0.29, -0.17, -0.2, -0.02, -1);
      r.lhandTo.set(0.01, -0.055, 0.24);
      r.hip = V(0.155, -0.17, -0.42); r.ads = V(0, -0.1, -0.2);

    } else if (def.id === 'r870') {
      // Receiver, ejection/loading ports, safety
      box(g, 0.05, 0.07, 0.22, M.metal, 0, 0, 0);
      box(g, 0.002, 0.016, 0.06, M.black, 0.0255, 0.012, -0.02);
      box(g, 0.03, 0.004, 0.05, M.black, 0, -0.036, 0.02);
      cyl(g, 0.006, 0.012, M.metal, 0, -0.04, 0.085, 'x', 8);
      box(g, 0.02, 0.008, 0.01, M.metal, 0, 0.04, 0.0);
      // Barrel with vent rib, bead, tube magazine + end cap + barrel clamp
      cyl(g, 0.012, 0.52, M.metal, 0, 0.016, -0.37, 'z', 8);
      box(g, 0.008, 0.004, 0.5, M.metal, 0, 0.0285, -0.37);
      cyl(g, 0.011, 0.42, M.metal, 0, -0.022, -0.32, 'z', 8);
      cyl(g, 0.0135, 0.02, M.metal, 0, -0.022, -0.54, 'z', 8);
      box(g, 0.026, 0.045, 0.02, M.metal, 0, -0.003, -0.5);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), M.brass); bead.position.set(0, 0.033, -0.62); g.add(bead);
      // Action bars + ribbed wooden pump forend (group, z animated)
      [-1, 1].forEach((s) => box(g, 0.004, 0.004, 0.14, M.metal, s * 0.021, -0.012, -0.17));
      const pump = grp(g, 0, -0.022, -0.3);
      box(pump, 0.058, 0.05, 0.16, M.wood, 0, 0, 0);
      for (let i = 0; i < 5; i++) box(pump, 0.06, 0.052, 0.006, M.black, 0, 0, -0.06 + i * 0.03);
      r.pump = pump;
      // Side-saddle shells
      for (let i = 0; i < 4; i++) {
        cyl(g, 0.007, 0.028, M.shell, -0.04, 0.005, 0.03 - i * 0.018, 'x', 8);
        cyl(g, 0.0072, 0.008, M.brass, -0.052, 0.005, 0.03 - i * 0.018, 'x', 8);
      }
      // Wooden stock, grip, trigger guard + trigger
      box(g, 0.042, 0.085, 0.3, M.wood, 0, -0.035, 0.25, 0.09);
      box(g, 0.035, 0.08, 0.04, M.wood, 0, -0.07, 0.11, -0.3);
      box(g, 0.006, 0.004, 0.05, M.metal, 0, -0.055, 0.0); box(g, 0.006, 0.02, 0.004, M.metal, 0, -0.045, -0.025);
      box(g, 0.004, 0.016, 0.004, M.metal, 0, -0.045, 0.0);
      r.muzzle.position.set(0, 0.016, -0.64);
      r.eject.position.set(0.032, 0.012, -0.02);
      arm(g, 0, -0.07, 0.12, 0.06, -0.22, 0.42, 1);
      r.lhand = arm(g, -0.01, -0.05, -0.3, -0.17, -0.2, -0.04, -1);
      r.lhandTo.set(0.01, 0.015, 0.32);
      r.hip = V(0.165, -0.18, -0.42); r.ads = V(0, -0.04, -0.3);

    } else if (def.id === 'awm') {
      // Chassis + fluted barrel + muzzle brake
      box(g, 0.055, 0.075, 0.42, M.olive, 0, 0, 0);
      cyl(g, 0.012, 0.56, M.metal, 0, 0.01, -0.49, 'z', 8);
      [-1, 1].forEach((s) => box(g, 0.002, 0.006, 0.12, M.black, s * 0.0125, 0.01, -0.5));
      cyl(g, 0.016, 0.07, M.metal, 0, 0.01, -0.8, 'z', 8);
      for (let i = 0; i < 3; i++) box(g, 0.034, 0.004, 0.01, M.black, 0, 0.01, -0.78 - i * 0.018);
      [-1, 1].forEach((s) => box(g, 0.004, 0.012, 0.045, M.black, s * 0.0165, 0.01, -0.8));
      // Folded bipod
      [-1, 1].forEach((s) => box(g, 0.006, 0.005, 0.15, M.metal, s * 0.02, -0.04, -0.15));
      cyl(g, 0.008, 0.05, M.metal, 0, -0.04, -0.08, 'x', 8);
      // Scope: tube, objective bell, ocular, lens discs, rings, turrets, mounts
      cyl(g, 0.022, 0.32, M.metal, 0, 0.075, -0.03, 'z', 10);
      cyl(g, 0.03, 0.06, M.metal, 0, 0.075, -0.2, 'z', 10);
      cyl(g, 0.027, 0.05, M.metal, 0, 0.075, 0.13, 'z', 10);
      cyl(g, 0.0285, 0.003, M.lens, 0, 0.075, -0.231, 'z', 10);
      cyl(g, 0.0255, 0.003, M.lens, 0, 0.075, 0.156, 'z', 10);
      cyl(g, 0.025, 0.02, M.black, 0, 0.075, -0.1, 'z', 10); cyl(g, 0.025, 0.02, M.black, 0, 0.075, 0.05, 'z', 10);
      cyl(g, 0.012, 0.03, M.metal, 0, 0.105, -0.02, 'y', 8);
      cyl(g, 0.01, 0.03, M.metal, 0.03, 0.075, -0.02, 'x', 8);
      box(g, 0.012, 0.04, 0.02, M.metal, 0, 0.05, -0.1); box(g, 0.012, 0.04, 0.02, M.metal, 0, 0.05, 0.05);
      // Bolt group (z animated) with handle + knob, ejection port, magazine
      const bolt = grp(g, 0.045, 0.02, 0.09);
      cyl(bolt, 0.008, 0.07, M.metal, -0.045, 0, 0, 'z', 8);
      cyl(bolt, 0.006, 0.06, M.metal, 0, 0, 0, 'x', 6);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.metal); knob.position.set(0.034, 0, 0); bolt.add(knob);
      r.bolt = bolt;
      box(g, 0.002, 0.016, 0.06, M.black, 0.0278, 0.025, 0.05);
      r.mag = box(g, 0.035, 0.06, 0.08, M.metal, 0, -0.06, -0.02);
      // Thumbhole stock: spine, lower rail, butt block, adjustable cheek riser
      box(g, 0.045, 0.04, 0.28, M.olive, 0, 0.025, 0.34);
      box(g, 0.04, 0.03, 0.25, M.olive, 0, -0.065, 0.32);
      box(g, 0.05, 0.1, 0.1, M.olive, 0, -0.025, 0.43);
      box(g, 0.05, 0.1, 0.012, M.rubber, 0, -0.025, 0.486);
      box(g, 0.04, 0.02, 0.12, M.poly, 0, 0.055, 0.36);
      box(g, 0.008, 0.02, 0.008, M.metal, -0.012, 0.045, 0.32); box(g, 0.008, 0.02, 0.008, M.metal, 0.012, 0.045, 0.32);
      box(g, 0.03, 0.085, 0.04, M.olive, 0, -0.07, 0.14, -0.35);
      box(g, 0.006, 0.004, 0.05, M.metal, 0, -0.045, 0.06);
      r.muzzle.position.set(0, 0.01, -0.83);
      r.eject.position.set(0.032, 0.025, 0.06);
      arm(g, 0, -0.08, 0.15, 0.06, -0.22, 0.45, 1);
      r.lhand = arm(g, -0.01, -0.06, -0.22, -0.17, -0.22, 0.02, -1);
      r.lhandTo.set(0.01, 0, 0.2);
      r.hip = V(0.165, -0.185, -0.44); r.ads = V(0, -0.075, -0.22);
    }
    g.add(r.muzzle); g.add(r.eject);

    if (!DZ.Weapons.flashTex) {
      DZ.Weapons.flashTex = DZ.canvasTex(64, 64, (c) => {
        const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,0.95)'); grd.addColorStop(1, 'rgba(255,100,0,0)');
        c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
        c.strokeStyle = 'rgba(255,220,140,0.8)'; c.lineWidth = 3;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); c.stroke(); }
      });
      DZ.Weapons.starTex = DZ.canvasTex(64, 64, (c) => {
        c.translate(32, 32); c.fillStyle = 'rgba(255,230,160,0.95)';
        for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(-30, 0); c.lineTo(0, -3); c.lineTo(30, 0); c.lineTo(0, 3); c.closePath(); c.fill(); }
        const grd = c.createRadialGradient(0, 0, 0, 0, 0, 12); grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(1, 'rgba(255,160,40,0)');
        c.fillStyle = grd; c.fillRect(-32, -32, 64, 64);
      });
    }
    r.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: DZ.Weapons.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    r.flash.scale.setScalar(def.id === 'r870' || def.id === 'awm' ? 0.32 : 0.2); r.flash.visible = false;
    // Extra star-shaped flash layers (children inherit visibility from the main sprite)
    [[1.9, 0.9], [1.1, 0.7]].forEach(([k, op]) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DZ.Weapons.starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
      s.scale.setScalar(k); r.flash.add(s); r.flashX.push(s);
    });
    r.muzzle.add(r.flash);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return r;
  }

  class Weapons {
    constructor(camera, scene, player, world, effects, game) {
      this.camera = camera; this.scene = scene; this.player = player; this.world = world; this.fx = effects; this.game = game;
      this.slots = DZ.WEAPONS.map((def) => ({ def, unlocked: def.unlockCost === 0, mag: def.mag, reserve: def.reserve, level: 1 }));
      this.root = new THREE.Group(); camera.add(this.root);
      this.models = this.slots.map((s) => { const m = buildModel(s.def); m.group.visible = false; this.root.add(m.group); return m; });
      this.current = 1; this.models[1].group.visible = true;
      this.cooldown = 0; this.reloadT = 0; this.reloadDur = 1; this.switchT = 0; this.pending = -1; this.inspectT = 0;
      this.adsT = 0; this.kick = 0; this.pumpT = 0; this.flashT = 0;
      this.sway = V(0, 0, 0); this.grenades = 2; this.grenadeCd = 0; this.live = [];
      this.shots = 0; this.hits = 0; this.headshots = 0;
      this.ray = new THREE.Raycaster();
      this.muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2); camera.add(this.muzzleLight); this.muzzleLight.position.set(0.1, -0.05, -0.8);
      this.grenadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
      this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4228, roughness: 0.6, metalness: 0.3 });
      this.scoped = false;
    }

    get slot() { return this.slots[this.current]; }
    get model() { return this.models[this.current]; }
    stat(slot, key) {
      const l = slot.level - 1, d = slot.def;
      if (key === 'damage') return d.damage * (1 + 0.2 * l);
      if (key === 'mag') return Math.round(d.mag * (1 + 0.25 * l));
      if (key === 'recoil') return d.recoil * (1 - 0.15 * l);
      if (key === 'reload') return d.reload * (1 - 0.1 * l);
      if (key === 'spread') return d.spread * (1 - 0.12 * l);
      return d[key];
    }

    switchTo(i) {
      if (i < 0 || i >= this.slots.length || !this.slots[i].unlocked || i === this.current || this.pending >= 0) return;
      this.pending = i; this.switchT = 0.45; this.reloadT = 0; this.inspectT = 0;
    }
    cycle(dir) {
      let i = this.current;
      for (let n = 0; n < this.slots.length; n++) {
        i = (i + dir + this.slots.length) % this.slots.length;
        if (this.slots[i].unlocked) { this.switchTo(i); return; }
      }
    }
    reload() {
      const s = this.slot;
      if (this.reloadT > 0 || this.switchT > 0 || s.mag >= this.stat(s, 'mag') || s.reserve <= 0) return;
      this.reloadDur = this.reloadT = this.stat(s, 'reload'); this.inspectT = 0;
      DZ.Audio.reload(this.reloadDur);
    }
    refillAll(fraction = 1) {
      this.slots.forEach((s) => { if (s.unlocked) s.reserve = Math.min(s.def.reserve * 2, s.reserve + Math.ceil(s.def.reserve * fraction)); });
    }

    update(dt, zombies) {
      const p = this.player, s = this.slot, def = s.def;
      if (I.mouse.wheel) this.cycle(I.mouse.wheel > 0 ? 1 : -1);
      for (let n = 1; n <= 4; n++) if (I.pressedCode('Digit' + n)) this.switchTo(n - 1);
      if (I.pressed('reload')) this.reload();
      if (I.pressed('inspect') && this.reloadT <= 0 && this.switchT <= 0) this.inspectT = 2.2;
      if (I.pressed('grenade')) this.throwGrenade();

      this.cooldown -= dt; this.grenadeCd -= dt;
      if (this.switchT > 0) {
        const before = this.switchT; this.switchT -= dt;
        if (before > 0.22 && this.switchT <= 0.22 && this.pending >= 0) {
          this.models[this.current].group.visible = false;
          this.current = this.pending; this.models[this.current].group.visible = true; this.pending = -1;
          DZ.Audio.equip();
        }
      }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          const need = this.stat(s, 'mag') - s.mag, take = Math.min(need, s.reserve);
          s.mag += take; s.reserve -= take;
        }
      }
      const wantAds = I.mouse.right && this.reloadT <= 0 && this.switchT <= 0 && !p.sprinting;
      this.adsT = damp(this.adsT, wantAds ? 1 : 0, 14, dt);
      p.ads = this.adsT > 0.5;
      if (wantAds) this.inspectT = 0;
      const zoom = 1 + (def.zoom - 1) * this.adsT;
      this.zoom = zoom;
      const fov = DZ.settings.fov / zoom;
      if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.scoped = def.id === 'awm' && this.adsT > 0.92;

      const trigger = def.auto ? I.mouse.left : I.mouse.leftPressed;
      if (trigger && this.cooldown <= 0 && this.switchT <= 0 && this.reloadT <= 0) {
        if (s.mag > 0) { this.fire(zombies); p.sprinting = false; }
        else if (I.mouse.leftPressed) { DZ.Audio.dryFire(); this.reload(); this.cooldown = 0.25; }
      }

      this.animate(dt);
      this.updateGrenades(dt);
    }

    ejectBrass(m, delay) {
      const go = () => {
        m.eject.getWorldPosition(tmpW);
        this.fx.emit(tmpW.x, tmpW.y, tmpW.z, 1, 0xc9a040, 1.6, 0.6, 0.8, 14, 1.0);
        if (DZ.Audio.casing) setTimeout(() => DZ.Audio.casing(), 320);
      };
      if (delay) setTimeout(go, delay); else go();
    }

    fire(zombies) {
      const p = this.player, s = this.slot, def = s.def, m = this.model;
      s.mag--; this.cooldown = 60 / def.rpm; this.shots++;
      DZ.Audio.gunshot(def.sound);
      this.kick = 1; this.flashT = 0.05; this.inspectT = 0;
      m.flash.visible = true; m.flash.material.rotation = rand(0, Math.PI);
      m.flashX.forEach((sp) => { sp.material.rotation = rand(0, Math.PI * 2); });
      this.muzzleLight.intensity = 3;
      const rec = this.stat(s, 'recoil') * (p.crouching ? 0.7 : 1) * (this.adsT > 0.5 ? 0.75 : 1);
      p.recoilPitch += rec; p.pitch += rec * 0.35; p.recoilYaw += rand(-rec, rec) * 0.5;
      p.shake = Math.max(p.shake, def.id === 'awm' || def.id === 'r870' ? 0.3 : 0.08);
      if (def.id === 'r870') { this.pumpT = 0.55; setTimeout(() => DZ.Audio.pump(), 120); this.ejectBrass(m, 300); }
      else if (def.id === 'awm') { this.pumpT = 0.9; this.ejectBrass(m, 600); }
      else this.ejectBrass(m, 0);

      let spread = this.adsT > 0.6 ? def.adsSpread : this.stat(s, 'spread');
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (this.adsT < 0.6) spread *= (1 + hs / 6) * (p.crouching ? 0.7 : 1);
      if (!p.onGround) spread *= 2;

      const origin = this.camera.getWorldPosition(V(0, 0, 0));
      const fwd = this.camera.getWorldDirection(V(0, 0, 0));
      const up = V(0, 1, 0).applyQuaternion(this.camera.quaternion), right = V(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const muzzlePos = m.muzzle.getWorldPosition(V(0, 0, 0));
      const targets = [this.world.blockGroup, this.world.ground];
      zombies.forEach((z) => { if (!z.dead) targets.push(z.group); });
      const dmgBase = this.stat(s, 'damage');
      let anyHit = false, anyHead = false, anyKill = false;

      for (let n = 0; n < def.pellets; n++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
        this.ray.set(origin, dir); this.ray.far = def.range * 2;
        const hits = this.ray.intersectObjects(targets, true);
        let pierce = def.pierce, end = origin.clone().addScaledVector(dir, def.range * 2);
        const hitZ = new Set();
        for (const h of hits) {
          const z = h.object.userData.zombie;
          if (z) {
            if (z.dead || hitZ.has(z)) continue;
            hitZ.add(z);
            const head = h.object.userData.part === 'head';
            const fall = h.distance > def.range ? 0.5 : 1;
            const killed = z.takeDamage(dmgBase * fall * (head ? 2.4 : 1), h.point, head, dir);
            anyHit = true; anyHead = anyHead || head; anyKill = anyKill || killed;
            this.fx.blood(h.point, def.pellets > 1 ? 0.5 : 1);
            end = h.point;
            if (pierce-- <= 0) break;
          } else {
            end = h.point;
            if (h.face) {
              const nrm = h.face.normal.clone().transformDirection(h.object.matrixWorld);
              this.fx.decal(h.point, nrm);
            }
            this.fx.sparks(h.point);
            break;
          }
        }
        if (n < 3) this.fx.tracer(muzzlePos, end);
      }
      if (anyHit) { this.hits++; if (anyHead) this.headshots++; this.game.onHit(anyHead, anyKill); }
    }

    animate(dt) {
      const p = this.player, m = this.model;
      this.kick = damp(this.kick, 0, 18, dt);
      this.flashT -= dt;
      if (this.flashT <= 0) m.flash.visible = false;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 60);
      this.sway.x = damp(this.sway.x, clamp(-I.mouse.dx * 0.0006, -0.05, 0.05), 8, dt);
      this.sway.y = damp(this.sway.y, clamp(I.mouse.dy * 0.0006, -0.05, 0.05), 8, dt);
      if (this.inspectT > 0) this.inspectT -= dt;
      if (this.pumpT > 0) this.pumpT -= dt;

      const a = this.adsT;
      const pos = m.hip.clone().lerp(m.ads, a);
      const bobK = (1 - a * 0.85) * p.bobAmount;
      pos.x += Math.cos(p.bob) * 0.012 * bobK + this.sway.x * (1 - a * 0.7);
      pos.y += Math.abs(Math.sin(p.bob)) * 0.014 * bobK + this.sway.y * (1 - a * 0.7) - 0.004 * Math.sin(performance.now() / 900);
      pos.z += this.kick * (a > 0.5 ? 0.03 : 0.06);
      let rx = this.kick * (a > 0.5 ? 0.03 : 0.12), ry = 0, rz = 0;

      const sprint = p.sprinting ? 1 : 0;
      this.sprintK = damp(this.sprintK || 0, sprint, 9, dt);
      pos.x += this.sprintK * 0.04; pos.y -= this.sprintK * 0.04;
      ry += this.sprintK * 0.7; rx -= this.sprintK * 0.25;

      // Left hand: travels to the magazine during reload.
      let handK = 0;
      if (this.reloadT > 0) {
        const t = 1 - this.reloadT / this.reloadDur;
        const dip = Math.sin(Math.min(t, 1) * Math.PI);
        handK = dip;
        pos.y -= dip * 0.09; rx += dip * 0.35; rz += dip * 0.5;
        if (m.mag) {
          const base = m.mag.userData.base || (m.mag.userData.base = m.mag.position.clone());
          const out = t < 0.25 ? t / 0.25 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.25);
          m.mag.position.set(base.x, base.y - out * 0.25, base.z);
          m.mag.visible = !(t > 0.25 && t < 0.4);
        }
      } else if (m.mag && m.mag.userData.base) { m.mag.position.copy(m.mag.userData.base); m.mag.visible = true; }

      if (this.switchT > 0) {
        const t = this.switchT / 0.45;
        const down = t > 0.5 ? (1 - t) * 2 : t * 2;
        pos.y -= down * 0.25; rx -= down * 0.6;
      }
      if (this.inspectT > 0) {
        const t = 1 - this.inspectT / 2.2;
        const k = Math.sin(t * Math.PI);
        ry += k * 0.9; rz += k * 0.45 * Math.sin(t * Math.PI * 2 + 0.6); pos.x -= k * 0.08; pos.z += k * 0.05;
      }
      let pumpOff = 0;
      if (m.pump && this.pumpT > 0) {
        const t = 1 - this.pumpT / 0.55;
        pumpOff = Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.07;
        m.pump.position.z = -0.3 + pumpOff;
      }
      if (this.slot.def.id === 'awm' && m.bolt) {
        const t = this.pumpT > 0 ? Math.sin((1 - this.pumpT / 0.9) * Math.PI) : 0;
        m.bolt.position.z = 0.09 + t * 0.06;
      }
      if (m.lhand) {
        m.lhand.position.set(m.lhandTo.x * handK, m.lhandTo.y * handK, m.lhandTo.z * handK + (m.pump ? pumpOff : 0));
      }
      m.group.position.copy(pos);
      m.group.rotation.set(rx, ry, rz);
      m.group.visible = !this.scoped;
    }

    throwGrenade() {
      if (this.grenades <= 0 || this.grenadeCd > 0) return;
      this.grenades--; this.grenadeCd = 0.8;
      const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
      const fwd = this.camera.getWorldDirection(V(0, 0, 0));
      mesh.position.copy(this.camera.getWorldPosition(V(0, 0, 0))).addScaledVector(fwd, 0.6);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const vel = fwd.multiplyScalar(17).add(V(0, 4, 0)).add(this.player.vel.clone().setY(0));
      this.live.push({ mesh, vel, fuse: 2.2 });
      DZ.Audio.swing(this.player.pos.x, this.player.pos.z);
    }
    updateGrenades(dt) {
      for (let i = this.live.length - 1; i >= 0; i--) {
        const g = this.live[i], p = g.mesh.position;
        g.vel.y -= 20 * dt;
        const prev = p.clone();
        p.addScaledVector(g.vel, dt);
        if (p.y < 0.07) { p.y = 0.07; g.vel.y *= -0.35; g.vel.x *= 0.65; g.vel.z *= 0.65; }
        const test = p.clone(); test.y = Math.min(p.y, 0.5);
        if (this.world.resolveCircle(test, 0.08)) {
          if (Math.abs(test.x - p.x) > 1e-4) g.vel.x *= -0.4;
          if (Math.abs(test.z - p.z) > 1e-4) g.vel.z *= -0.4;
          p.x = test.x; p.z = test.z;
        }
        g.mesh.rotation.x += dt * 8; g.mesh.rotation.z += dt * 5;
        g.fuse -= dt;
        if (g.fuse <= 0) {
          this.scene.remove(g.mesh); this.live.splice(i, 1);
          this.game.explode(p.clone().setY(Math.max(p.y, 0.3)), 7.5, 300);
        }
      }
    }
  }

  DZ.Weapons = Weapons;
})(); 
