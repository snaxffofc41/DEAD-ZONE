/* DEAD ZONE — world.js
 * Map 01: Abandoned City. Procedurally builds streets, ruined buildings, wrecked cars,
 * a military checkpoint, lamps, fires and loot spots. Owns collision (AABBs) and the
 * flow-field pathfinding grid that every zombie follows toward the player. */
(function () {
  const { rand, randInt, pick } = DZ.util;

  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function grain(g, w, h, amount, alpha) {
    for (let i = 0; i < amount; i++) {
      const v = randInt(0, 255);
      g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
    }
  }

  const TEX = {};
  function buildTextures() {
    TEX.asphalt = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#2a2c2f'; g.fillRect(0, 0, w, h); grain(g, w, h, 9000, 0.08);
      g.strokeStyle = 'rgba(10,10,12,0.8)'; g.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += rand(-30, 30); y += rand(-30, 30); g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(15,15,15,0.35)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(20, 60), rand(10, 40), rand(0, 3), 0, 7); g.fill(); }
    });
    TEX.asphalt.repeat.set(36, 36);
    TEX.concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5b5d5e'; g.fillRect(0, 0, w, h); grain(g, w, h, 4000, 0.12);
      g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    });
    TEX.roadLine = canvasTex(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(200,170,60,0.75)'; g.fillRect(16, 0, 32, 150); grain(g, w, h, 300, 0.3);
    });
    TEX.crate = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#3f4a33'; g.fillRect(0, 0, w, h); grain(g, w, h, 1500, 0.1);
      g.strokeStyle = '#2a3222'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#c9c6b0'; g.font = 'bold 22px monospace'; g.fillText('SUPPLY', 22, 72);
    });
    TEX.rust = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#4a3324'; g.fillRect(0, 0, w, h); grain(g, w, h, 2500, 0.18);
    });
    TEX.facades = [0, 1, 2, 3].map((v) => makeFacade(v));
  }

  function makeFacade(variant) {
    const bases = ['#6b6660', '#57534d', '#7a6f62', '#4f5557'];
    const emissive = document.createElement('canvas'); emissive.width = 256; emissive.height = 256;
    const eg = emissive.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, 256, 256);
    const map = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = bases[variant]; g.fillRect(0, 0, w, h); grain(g, w, h, 5000, 0.1);
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, fy * 64 + 60, w, 4);
        for (let fx = 0; fx < 4; fx++) {
          const x = fx * 64 + 14, y = fy * 64 + 14, ww = 36, hh = 36;
          const r = Math.random();
          if (r < 0.08) { g.fillStyle = '#d9a75a'; g.fillRect(x, y, ww, hh); eg.fillStyle = '#ffcf87'; eg.fillRect(x, y, ww, hh); }
          else if (r < 0.3) {
            g.fillStyle = '#050607'; g.fillRect(x, y, ww, hh);
            g.fillStyle = 'rgba(120,140,150,0.35)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ww * rand(0.3, 0.8), y); g.lineTo(x, y + hh * rand(0.3, 0.9)); g.fill();
          } else if (r < 0.42) {
            g.fillStyle = '#5a4430'; g.fillRect(x, y, ww, hh);
            g.fillStyle = '#3d2d1f'; for (let p = 0; p < 4; p++) g.fillRect(x - 2, y + p * 9 + 2, ww + 4, 6);
          } else {
            const grd = g.createLinearGradient(x, y, x + ww, y + hh); grd.addColorStop(0, '#1b232a'); grd.addColorStop(1, '#0b0f13');
            g.fillStyle = grd; g.fillRect(x, y, ww, hh);
          }
          g.strokeStyle = 'rgba(25,25,25,0.8)'; g.lineWidth = 3; g.strokeRect(x, y, ww, hh);
        }
      }
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(15,12,10,0.18)'; g.fillRect(Math.random() * w, Math.random() * h * 0.5, rand(2, 8), rand(40, 140)); }
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(10,10,10,0.45)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(10, 30), rand(10, 25), 0, 0, 7); g.fill(); }
    });
    const em = new THREE.CanvasTexture(emissive); em.wrapS = em.wrapT = THREE.RepeatWrapping; em.encoding = THREE.sRGBEncoding;
    return { map, em };
  }

  class World {
    constructor(scene, preset) {
      this.scene = scene;
      this.preset = preset;
      this.colliders = [];
      this.blockGroup = new THREE.Group(); scene.add(this.blockGroup);
      this.decor = new THREE.Group(); scene.add(this.decor);
      this.windowMats = [];
      this.lamps = [];
      this.fires = [];
      this.lootSpots = [];
      this.buildingRects = [];
      if (!TEX.asphalt) buildTextures();
      this.mats = {
        concrete: new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.95 }),
        darkMetal: new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.6, metalness: 0.5 }),
        rust: new THREE.MeshStandardMaterial({ map: TEX.rust, roughness: 0.9, metalness: 0.3 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.15, metalness: 0.8 }),
        rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
        sand: new THREE.MeshStandardMaterial({ color: 0x6d6248, roughness: 1 }),
        bark: new THREE.MeshStandardMaterial({ color: 0x2b241e, roughness: 1 }),
        blood: new THREE.MeshBasicMaterial({ color: 0x2a0505, transparent: true, opacity: 0.8, depthWrite: false }),
        crate: new THREE.MeshStandardMaterial({ map: TEX.crate, roughness: 0.8 }),
      };
      this.build();
      this.buildGrid();
    }

    addCollider(minX, maxX, minZ, maxZ, h = 10) { this.colliders.push({ minX, maxX, minZ, maxZ, h }); }
    colliderFromObject(obj, pad = 0) {
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      this.addCollider(b.min.x - pad, b.max.x + pad, b.min.z - pad, b.max.z + pad, b.max.y);
    }
    mesh(geo, mat, x, y, z, parent = this.blockGroup, shadow = true) {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (this.preset.shadows && shadow) { m.castShadow = true; m.receiveShadow = true; }
      parent.add(m); return m;
    }

    build() {
      const H = DZ.MAP.half;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2.6, H * 2.6), new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.92 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = this.preset.shadows; this.scene.add(ground);
      this.ground = ground;

      const roads = [-64, -32, 0, 32, 64];
      const lineMat = new THREE.MeshBasicMaterial({ map: TEX.roadLine, transparent: true, depthWrite: false, color: 0x888888 });
      roads.forEach((r) => {
        [0, 1].forEach((axis) => {
          const tex = TEX.roadLine.clone(); tex.needsUpdate = true; tex.repeat.set(1, 40);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, H * 2), lineMat.clone()); m.material.map = tex;
          m.rotation.x = -Math.PI / 2; if (axis) m.rotation.z = Math.PI / 2;
          m.position.set(axis ? 0 : r, 0.02, axis ? r : 0); this.decor.add(m);
        });
      });

      const centers = [-48, -16, 16, 48];
      const layouts = ['tower', 'split', 'quad', 'ruin', 'split', 'quad', 'park', 'lot'];
      centers.forEach((cx) => centers.forEach((cz) => {
        const curb = this.mesh(new THREE.BoxGeometry(22, 0.18, 22), this.mats.concrete, cx, 0.09, cz, this.decor, false);
        curb.receiveShadow = this.preset.shadows;
        this.buildBlock(cx, cz, pick(layouts));
      }));

      // Perimeter: concrete walls with containers, so the playable area is sealed.
      const wallH = 4.5;
      [[0, -H, H * 2, 1], [0, H, H * 2, 1], [-H, 0, 1, H * 2], [H, 0, 1, H * 2]].forEach(([x, z, w, d]) => {
        this.mesh(new THREE.BoxGeometry(w, wallH, d), this.mats.concrete, x, wallH / 2, z);
        this.addCollider(x - w / 2 - 0.5, x + w / 2 + 0.5, z - d / 2 - 0.5, z + d / 2 + 0.5, wallH);
      });
      for (let i = 0; i < 14; i++) {
        const side = randInt(0, 3), t = rand(-70, 70);
        const along = (side < 2);
        const x = along ? t : (side === 2 ? -74 : 74), z = along ? (side === 0 ? -74 : 74) : t;
        if (Math.abs(t) % 32 < 7 || Math.abs(t) % 32 > 25) continue;
        this.container(x, z, along ? 0 : Math.PI / 2);
      }

      // Wrecked vehicles along the streets.
      roads.forEach((r) => {
        for (let i = 0; i < 6; i++) {
          const along = rand(-74, 74);
          if (roads.some((rr) => Math.abs(along - rr) < 8)) continue;
          const lane = pick([-2.6, 2.6]) + rand(-0.6, 0.6);
          const vertical = Math.random() < 0.5;
          const x = vertical ? r + lane : along, z = vertical ? along : r + lane;
          if (Math.hypot(x, z) < 12) continue;
          this.car(x, z, (vertical ? 0 : Math.PI / 2) + rand(-0.35, 0.35) + (Math.random() < 0.5 ? Math.PI : 0), Math.random() < 0.25);
        }
      });

      this.checkpoint();

      // Street lamps at intersections; only a few cast real light (preset-based).
      let lit = 0;
      const lampSpots = [];
      roads.forEach((x) => roads.forEach((z) => lampSpots.push([x + 5.6, z + 5.6])));
      lampSpots.sort(() => Math.random() - 0.5).slice(0, 14).forEach(([x, z]) => {
        this.lamp(x, z, lit < this.preset.lamps); lit++;
      });

      // Burning barrels.
      for (let i = 0; i < 6; i++) {
        const r = pick(roads), t = rand(-60, 60);
        const v = Math.random() < 0.5;
        this.fireBarrel(v ? r + pick([-4.2, 4.2]) : t, v ? t : r + pick([-4.2, 4.2]), i < Math.max(2, this.preset.lamps - 1));
      }

      // Blood pools and debris for environmental storytelling.
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(rand(0.4, 1.6), 12), this.mats.blood);
        m.rotation.x = -Math.PI / 2; m.scale.y = rand(0.5, 1); m.position.set(rand(-75, 75), 0.03, rand(-75, 75));
        this.decor.add(m);
      }
      const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
      for (let i = 0; i < 90; i++) {
        const m = this.mesh(debrisGeo, Math.random() < 0.5 ? this.mats.concrete : this.mats.rubber, rand(-76, 76), 0.08, rand(-76, 76), this.decor, false);
        m.scale.set(rand(0.2, 0.8), rand(0.08, 0.3), rand(0.2, 0.7)); m.rotation.y = rand(0, 3);
      }

      // Loot spots: on sidewalks next to roads.
      for (let i = 0; i < 40 && this.lootSpots.length < 14; i++) {
        const r = pick(roads), t = rand(-70, 70);
        const v = Math.random() < 0.5;
        const x = v ? r + pick([-5.8, 5.8]) : t, z = v ? t : r + pick([-5.8, 5.8]);
        if (this.isBlockedPoint(x, z, 1.2) || Math.hypot(x, z) < 8) continue;
        if (this.lootSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 14)) continue;
        this.lootSpots.push(new THREE.Vector3(x, 0, z));
      }
    }

    buildBlock(cx, cz, layout) {
      const S = 18;
      if (layout === 'tower') this.building(cx, cz, rand(14, 16), rand(14, 16), rand(22, 42));
      else if (layout === 'split') {
        const horiz = Math.random() < 0.5;
        [-1, 1].forEach((s) => {
          const w = horiz ? S - 2 : 7.5, d = horiz ? 7.5 : S - 2;
          this.building(cx + (horiz ? 0 : s * 4.6), cz + (horiz ? s * 4.6 : 0), w, d, rand(9, 26));
        });
      } else if (layout === 'quad') {
        [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
          if (Math.random() < 0.2) return;
          this.building(cx + sx * 4.6, cz + sz * 4.6, rand(6, 7.5), rand(6, 7.5), rand(6, 18));
        }));
      } else if (layout === 'ruin') {
        this.building(cx - 3, cz, 10, 14, rand(5, 9), true);
        for (let i = 0; i < 10; i++) {
          const m = this.mesh(new THREE.BoxGeometry(rand(1, 3), rand(0.4, 1.6), rand(1, 3)), this.mats.concrete, cx + rand(2, 8), 0.4, cz + rand(-7, 7));
          m.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
          this.colliderFromObject(m);
        }
        const slab = this.mesh(new THREE.BoxGeometry(8, 0.5, 5), this.mats.concrete, cx + 4, 1.8, cz - 3);
        slab.rotation.z = 0.45; this.colliderFromObject(slab);
      } else if (layout === 'park') {
        for (let i = 0; i < 7; i++) this.deadTree(cx + rand(-8, 8), cz + rand(-8, 8));
        for (let i = 0; i < 3; i++) {
          const b = this.mesh(new THREE.BoxGeometry(2, 0.5, 0.6), this.mats.rust, cx + rand(-7, 7), 0.45, cz + rand(-7, 7));
          b.rotation.y = rand(0, 3);
        }
      } else if (layout === 'lot') {
        for (let i = 0; i < 4; i++) this.car(cx + rand(-6, 6), cz + (i - 1.5) * 4.2, Math.PI / 2 + rand(-0.2, 0.2), Math.random() < 0.3);
        this.building(cx - 6.5, cz, 4, 10, 4);
      }
    }

    building(x, z, w, d, h, ruined = false) {
      const f = pick(TEX.facades);
      const map = f.map.clone(); map.needsUpdate = true;
      const em = f.em.clone(); em.needsUpdate = true;
      const ox = Math.random(), oy = Math.random() < 0.5 ? 0 : 0.5;
      [map, em].forEach((t) => { t.repeat.set(Math.max(1, Math.round(w / 8 * 4)) / 4, h / 12); t.offset.set(ox, oy); });
      const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.92 });
      this.windowMats.push(mat);
      const roof = new THREE.MeshStandardMaterial({ color: 0x2c2d2e, roughness: 1 });
      const m = this.mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roof, roof, mat, mat], x, h / 2, z);
      this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
      this.buildingRects.push({ x, z, w, d, h });
      // Roof clutter: AC units / water tanks for a believable silhouette.
      if (!ruined && Math.random() < 0.7) {
        for (let i = 0; i < randInt(1, 3); i++) this.mesh(new THREE.BoxGeometry(rand(1, 2.4), rand(0.8, 1.6), rand(1, 2.4)), this.mats.darkMetal, x + rand(-w / 3, w / 3), h + 0.5, z + rand(-d / 3, d / 3), this.decor);
      }
      if (ruined) {
        for (let i = 0; i < 4; i++) {
          const p = this.mesh(new THREE.BoxGeometry(rand(1, 3), rand(1, 4), 0.4), this.mats.concrete, x + rand(-w / 2, w / 2), h + rand(0.5, 2), z + pick([-d / 2, d / 2]), this.decor);
          p.rotation.z = rand(-0.4, 0.4);
        }
      }
      // Ground-floor details: awning or boarded door.
      if (Math.random() < 0.5) {
        const side = pick([-1, 1]);
        const aw = this.mesh(new THREE.BoxGeometry(Math.min(w * 0.6, 6), 0.12, 1.4), new THREE.MeshStandardMaterial({ color: pick([0x4a2222, 0x22384a, 0x2f3a24]), roughness: 0.9 }), x, 3.2, z + side * (d / 2 + 0.7), this.decor);
        aw.rotation.x = side * 0.2;
      }
      return m;
    }

    car(x, z, rot, burnt) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
      const color = burnt ? 0x1a1715 : pick([0x5b2323, 0x2d3d4f, 0x6b6a62, 0x3a4a32, 0x7a6a4a, 0x262626]);
      const body = new THREE.MeshStandardMaterial({ color, roughness: burnt ? 1 : 0.45, metalness: burnt ? 0.1 : 0.6, map: burnt ? TEX.rust : null });
      const isVan = Math.random() < 0.2;
      const L = isVan ? 5 : 4.3, W = 1.85;
      this.mesh(new THREE.BoxGeometry(W, 0.75, L), body, 0, 0.7, 0, g);
      this.mesh(new THREE.BoxGeometry(W * 0.92, isVan ? 1.2 : 0.65, isVan ? L * 0.75 : L * 0.5), body, 0, isVan ? 1.65 : 1.38, isVan ? 0.3 : 0.1, g);
      this.mesh(new THREE.BoxGeometry(W * 0.94, isVan ? 0.5 : 0.45, isVan ? L * 0.6 : L * 0.46), this.mats.glass, 0, isVan ? 1.75 : 1.4, isVan ? 0.3 : 0.1, g, false);
      const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        if (burnt && Math.random() < 0.4) return;
        const w = this.mesh(wheelGeo, this.mats.rubber, sx * W / 2, 0.36, sz * L * 0.32, g, false); w.rotation.z = Math.PI / 2;
      });
      const lights = new THREE.MeshBasicMaterial({ color: burnt ? 0x111111 : 0x777766 });
      [-0.6, 0.6].forEach((sx) => this.mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), lights, sx, 0.8, -L / 2, g, false));
      if (Math.random() < 0.3 && !burnt) { const door = this.mesh(new THREE.BoxGeometry(0.08, 0.7, 1.1), body, W / 2 + 0.4, 0.8, -0.1, g); door.rotation.y = 0.8; }
      this.blockGroup.add(g);
      this.colliderFromObject(g, 0.05);
      if (burnt && Math.random() < 0.5) this.fireAt(g.position.clone().setY(1.6), false, 0.8);
    }

    container(x, z, rot) {
      const mat = new THREE.MeshStandardMaterial({ color: pick([0x5a2a1f, 0x24405a, 0x3d4a2a, 0x6a5a2a]), roughness: 0.7, metalness: 0.4, map: TEX.rust });
      const m = this.mesh(new THREE.BoxGeometry(6, 2.6, 2.4), mat, x, 1.3, z); m.rotation.y = rot;
      this.colliderFromObject(m);
    }

    checkpoint() {
      // Military checkpoint around the spawn — the survivor's last stand.
      const sandbag = (x, z, len, rot) => {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
        for (let row = 0; row < 3; row++) for (let i = 0; i < Math.floor(len / 0.6); i++) {
          const b = this.mesh(new THREE.BoxGeometry(0.6, 0.3, 0.45), this.mats.sand, -len / 2 + i * 0.6 + (row % 2) * 0.3, 0.15 + row * 0.28, 0, g, row === 2);
          b.rotation.y = rand(-0.08, 0.08);
        }
        this.blockGroup.add(g); this.colliderFromObject(g);
      };
      sandbag(-9, -9, 4, Math.PI / 4); sandbag(9, 9, 4, Math.PI / 4); sandbag(9, -9, 4, -Math.PI / 4); sandbag(-9, 9, 4, -Math.PI / 4);
      const barrier = (x, z, rot) => {
        const m = this.mesh(new THREE.BoxGeometry(3, 0.9, 0.55), this.mats.concrete, x, 0.45, z); m.rotation.y = rot; this.colliderFromObject(m);
      };
      barrier(0, -13, 0); barrier(0, 13, 0); barrier(13, 0, Math.PI / 2); barrier(-13, 0, Math.PI / 2);
      // Military truck
      const g = new THREE.Group(); g.position.set(-14, 0, 3.5); g.rotation.y = 0.1;
      const olive = new THREE.MeshStandardMaterial({ color: 0x3b4128, roughness: 0.8, metalness: 0.2 });
      this.mesh(new THREE.BoxGeometry(2.4, 1.2, 6.5), olive, 0, 1.2, 0, g);
      this.mesh(new THREE.BoxGeometry(2.3, 1.1, 1.8), olive, 0, 2.2, -2.2, g);
      this.mesh(new THREE.BoxGeometry(2.4, 1.6, 4.2), new THREE.MeshStandardMaterial({ color: 0x4a4a32, roughness: 1 }), 0, 2.5, 1.0, g);
      const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12);
      [[-1, -2.2], [1, -2.2], [-1, 1.6], [1, 1.6], [-1, 2.6], [1, 2.6]].forEach(([sx, sz]) => { const w = this.mesh(wg, this.mats.rubber, sx * 1.15, 0.55, sz, g, false); w.rotation.z = Math.PI / 2; });
      this.blockGroup.add(g); this.colliderFromObject(g);
      // Field tent
      const tent = this.mesh(new THREE.ConeGeometry(2.6, 2.6, 4), new THREE.MeshStandardMaterial({ color: 0x4a4d34, roughness: 1, side: THREE.DoubleSide }), 14, 1.3, -4, this.blockGroup);
      tent.rotation.y = Math.PI / 4; this.addCollider(12.2, 15.8, -5.8, -2.2, 2.6);
    }

    lamp(x, z, withLight) {
      const pole = this.mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), this.mats.darkMetal, x, 3, z);
      this.addCollider(x - 0.15, x + 0.15, z - 0.15, z + 0.15, 6);
      const arm = this.mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), this.mats.darkMetal, x - 0.6, 5.95, z, this.decor, false);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
      const bulb = this.mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), bulbMat, x - 1.2, 5.85, z, this.decor, false);
      const lamp = { bulb, bulbMat, light: null, flicker: Math.random() < 0.35, t: rand(0, 10) };
      if (withLight) {
        const l = new THREE.PointLight(0xffc98a, 1.3, 22, 1.6); l.position.set(x - 1.2, 5.5, z); this.scene.add(l); lamp.light = l;
      }
      this.lamps.push(lamp);
    }

    fireBarrel(x, z, withLight) {
      const b = this.mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 12), this.mats.rust, x, 0.5, z);
      this.addCollider(x - 0.45, x + 0.45, z - 0.45, z + 0.45, 1);
      this.fireAt(new THREE.Vector3(x, 1.2, z), withLight, 0.6);
    }

    fireAt(pos, withLight, size) {
      if (!World.fireTex) {
        World.fireTex = canvasTex(64, 64, (g) => {
          const grd = g.createRadialGradient(32, 40, 2, 32, 36, 30);
          grd.addColorStop(0, 'rgba(255,240,180,1)'); grd.addColorStop(0.35, 'rgba(255,140,40,0.85)'); grd.addColorStop(1, 'rgba(120,20,0,0)');
          g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
        });
      }
      const sprites = [];
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: World.fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        s.position.copy(pos); s.scale.setScalar(size); this.decor.add(s); sprites.push(s);
      }
      let light = null;
      if (withLight) { light = new THREE.PointLight(0xff7a2a, 1.6, 14, 1.8); light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0)); this.scene.add(light); }
      this.fires.push({ pos, sprites, light, size, t: rand(0, 10) });
    }

    deadTree(x, z) {
      const h = rand(4, 7);
      this.mesh(new THREE.CylinderGeometry(0.12, 0.25, h, 6), this.mats.bark, x, h / 2, z);
      this.addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h);
      for (let i = 0; i < 5; i++) {
        const l = rand(1, 2.5);
        const br = this.mesh(new THREE.CylinderGeometry(0.03, 0.08, l, 5), this.mats.bark, x, h * rand(0.5, 0.95), z, this.decor);
        br.rotation.set(rand(-1.2, 1.2), rand(0, 6), rand(-1.2, 1.2));
        br.translateY(l / 2);
      }
    }

    update(dt, time) {
      this.fires.forEach((f) => {
        f.t += dt;
        f.sprites.forEach((s, i) => {
          const k = Math.sin(f.t * (7 + i * 3) + i) * 0.15 + Math.sin(f.t * 13 + i) * 0.08;
          s.scale.set(f.size * (1 + k), f.size * (1.4 + k * 1.5), 1);
          s.position.y = f.pos.y + i * 0.18 * f.size + k * 0.1;
          s.material.rotation = Math.sin(f.t * 2 + i) * 0.2;
        });
        if (f.light) f.light.intensity = 1.4 + Math.sin(f.t * 17) * 0.3 + Math.sin(f.t * 7.3) * 0.25;
      });
      this.lamps.forEach((l) => {
        if (!l.flicker) return;
        l.t += dt;
        const on = Math.sin(l.t * 23) + Math.sin(l.t * 7.7) > -0.6;
        l.bulbMat.color.setHex(on ? 0xffd9a0 : 0x221a10);
        if (l.light) l.light.intensity = on ? 1.3 : 0.05;
      });
    }

    /* ---------- Collision ---------- */
    resolveCircle(pos, r, maxY = 1.5) {
      let hit = false;
      for (const c of this.colliders) {
        if (c.h < 0.35 && pos.y > 0.2) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (pos.y > c.h - 0.05) continue; // standing above low obstacles
          hit = true;
          if (d2 > 1e-6) { const d = Math.sqrt(d2); pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
          else {
            const pushes = [pos.x - c.minX + r, c.maxX - pos.x + r, pos.z - c.minZ + r, c.maxZ - pos.z + r];
            const m = Math.min(...pushes), i = pushes.indexOf(m);
            if (i === 0) pos.x -= m; else if (i === 1) pos.x += m; else if (i === 2) pos.z -= m; else pos.z += m;
          }
        }
      }
      const lim = DZ.MAP.half - 1.2;
      pos.x = Math.max(-lim, Math.min(lim, pos.x)); pos.z = Math.max(-lim, Math.min(lim, pos.z));
      return hit;
    }
    isBlockedPoint(x, z, pad = 0) {
      for (const c of this.colliders) if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
      return false;
    }

    /* ---------- Flow-field pathfinding ---------- */
    buildGrid() {
      const H = DZ.MAP.half, C = DZ.MAP.cell;
      this.N = Math.round((H * 2) / C);
      this.blocked = new Uint8Array(this.N * this.N);
      this.dist = new Int32Array(this.N * this.N).fill(-1);
      this.queue = new Int32Array(this.N * this.N);
      for (let i = 0; i < this.N; i++) for (let j = 0; j < this.N; j++) {
        const x = -H + (i + 0.5) * C, z = -H + (j + 0.5) * C;
        this.blocked[i + j * this.N] = this.isBlockedPoint(x, z, 0.55) ? 1 : 0;
      }
    }
    cellOf(x, z) {
      const H = DZ.MAP.half, C = DZ.MAP.cell;
      const i = DZ.util.clamp(Math.floor((x + H) / C), 0, this.N - 1), j = DZ.util.clamp(Math.floor((z + H) / C), 0, this.N - 1);
      return i + j * this.N;
    }
    cellCenter(idx, out) {
      const H = DZ.MAP.half, C = DZ.MAP.cell;
      out.set(-H + ((idx % this.N) + 0.5) * C, 0, -H + (Math.floor(idx / this.N) + 0.5) * C);
      return out;
    }
    computeFlow(px, pz) {
      const N = this.N, dist = this.dist, q = this.queue, blocked = this.blocked;
      dist.fill(-1);
      let start = this.cellOf(px, pz);
      if (blocked[start]) {
        for (const o of [1, -1, N, -N, N + 1, N - 1, -N + 1, -N - 1]) if (!blocked[start + o]) { start += o; break; }
      }
      let head = 0, tail = 0;
      dist[start] = 0; q[tail++] = start;
      while (head < tail) {
        const c = q[head++], ci = c % N, cj = (c - ci) / N, d = dist[c] + 1;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const n = ni + nj * N;
          if (blocked[n] || dist[n] !== -1) continue;
          if (di && dj && (blocked[ci + di + cj * N] || blocked[ci + (cj + dj) * N])) continue;
          dist[n] = d; q[tail++] = n;
        }
      }
    }
    /* Next waypoint toward the player, or null when close enough to seek directly. */
    flowTarget(x, z, out) {
      const N = this.N, dist = this.dist;
      const c = this.cellOf(x, z);
      if (dist[c] >= 0 && dist[c] <= 1) return null;
      const ci = c % N, cj = (c - ci) / N;
      let best = -1, bestD = dist[c] >= 0 ? dist[c] : 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = ni + nj * N;
        if (dist[n] >= 0 && dist[n] < bestD) {
          if (di && dj && (this.blocked[ci + di + cj * N] || this.blocked[ci + (cj + dj) * N])) continue;
          bestD = dist[n]; best = n;
        }
      }
      if (best < 0) return null;
      return this.cellCenter(best, out);
    }
    randomSpawnPoint(minCells, maxCells) {
      const out = new THREE.Vector3();
      for (let tries = 0; tries < 300; tries++) {
        const idx = randInt(0, this.N * this.N - 1);
        const d = this.dist[idx];
        if (d >= minCells && d <= maxCells && !this.blocked[idx]) return this.cellCenter(idx, out);
      }
      for (let tries = 0; tries < 300; tries++) {
        const idx = randInt(0, this.N * this.N - 1);
        if (this.dist[idx] > 6 && !this.blocked[idx]) return this.cellCenter(idx, out);
      }
      return out.set(60, 0, 60);
    }
  }

  DZ.World = World;
  DZ.canvasTex = canvasTex;
})();
