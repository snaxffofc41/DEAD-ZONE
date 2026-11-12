/* DEAD ZONE — effects.js
 * Pooled particles (blood, sparks, dust, embers), bullet tracers, impact decals,
 * explosions and shockwave rings. Everything is pre-allocated to avoid GC spikes. */
(function () {
  const { rand } = DZ.util;
  const MAX = 1400;

  class Effects {
    constructor(scene, preset) {
      this.scene = scene; this.preset = preset;
      this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3);
      this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.grav = new Float32Array(MAX);
      this.next = 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false }));
      this.points.frustumCulled = false; scene.add(this.points);
      for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -999;

      this.tracers = [];
      for (let i = 0; i < 16; i++) {
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        l.frustumCulled = false; scene.add(l); this.tracers.push({ line: l, life: 0 });
      }
      this.tracerIdx = 0;

      this.decals = [];
      const decalMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const decalGeo = new THREE.CircleGeometry(0.06, 6);
      for (let i = 0; i < 80; i++) { const d = new THREE.Mesh(decalGeo, decalMat); d.visible = false; scene.add(d); this.decals.push(d); }
      this.decalIdx = 0;

      const flashTex = DZ.canvasTex(64, 64, (c) => {
        const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.3, 'rgba(255,170,60,0.9)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
        c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
      });
      this.flashTex = flashTex;
      this.blasts = [];
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        s.visible = false; scene.add(s);
        this.blasts.push({ sprite: s, life: 0 });
      }
      this.blastLight = new THREE.PointLight(0xff9a40, 0, 30, 2); scene.add(this.blastLight);

      this.rings = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r); this.rings.push({ mesh: r, life: 0, max: 7 });
      }
    }

    emit(x, y, z, count, color, speed, spread, life, gravity = 9.8, up = 0) {
      count = Math.max(1, Math.round(count * this.preset.particles));
      const c = new THREE.Color(color);
      for (let n = 0; n < count; n++) {
        const i = this.next; this.next = (this.next + 1) % MAX;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        const v = c.clone().multiplyScalar(rand(0.6, 1.1));
        this.col[i * 3] = v.r; this.col[i * 3 + 1] = v.g; this.col[i * 3 + 2] = v.b;
        this.vel[i * 3] = rand(-1, 1) * spread * speed;
        this.vel[i * 3 + 1] = (rand(-0.3, 1) * spread + up) * speed;
        this.vel[i * 3 + 2] = rand(-1, 1) * spread * speed;
        this.life[i] = life * rand(0.6, 1.2); this.grav[i] = gravity;
      }
    }

    blood(p, amount = 1) { this.emit(p.x, p.y, p.z, 14 * amount, 0x6a0808, 3.2, 1, 0.7, 12, 0.4); }
    sparks(p) { this.emit(p.x, p.y, p.z, 8, 0xffc060, 4, 1, 0.25, 6, 0.3); this.emit(p.x, p.y, p.z, 6, 0x6a6560, 1.5, 1, 0.6, 2, 0.6); }
    gore(p) { this.emit(p.x, p.y, p.z, 40, 0x5a0606, 4.5, 1, 1, 12, 0.8); }

    tracer(from, to) {
      const t = this.tracers[this.tracerIdx]; this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
      const a = t.line.geometry.attributes.position.array;
      a[0] = from.x; a[1] = from.y; a[2] = from.z; a[3] = to.x; a[4] = to.y; a[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.life = 0.06; t.line.material.opacity = 0.9;
    }

    decal(point, normal) {
      const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
      d.position.copy(point).addScaledVector(normal, 0.01);
      d.lookAt(point.clone().add(normal));
      d.scale.setScalar(rand(0.7, 1.3)); d.visible = true;
    }

    explosion(p, scale = 1) {
      const b = this.blasts.find((x) => x.life <= 0) || this.blasts[0];
      b.sprite.position.copy(p); b.sprite.visible = true; b.life = 0.45; b.scale = scale;
      this.blastLight.position.copy(p); this.blastLight.intensity = 6 * scale;
      this.emit(p.x, p.y, p.z, 70 * scale, 0xff9a30, 9, 1, 0.6, 5, 0.6);
      this.emit(p.x, p.y, p.z, 60 * scale, 0x3a3632, 3, 1, 1.6, -0.5, 0.6);
    }

    shockwave(p, radius) {
      const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
      r.mesh.position.set(p.x, 0.15, p.z); r.mesh.visible = true; r.life = 0.6; r.max = radius;
      this.emit(p.x, 0.3, p.z, 60, 0x5a4a3a, 6, 1, 0.9, 8, 0.4);
    }

    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        const o = i * 3;
        this.vel[o + 1] -= this.grav[i] * dt;
        this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
        if (this.pos[o + 1] < 0.02) { this.pos[o + 1] = 0.02; this.vel[o] *= 0.5; this.vel[o + 2] *= 0.5; this.vel[o + 1] = 0; }
        if (this.life[i] <= 0) this.pos[o + 1] = -999;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;

      this.tracers.forEach((t) => { if (t.life > 0) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.06) * 0.9; } });
      this.blasts.forEach((b) => {
        if (b.life <= 0) return;
        b.life -= dt;
        const k = 1 - b.life / 0.45;
        b.sprite.scale.setScalar((2 + k * 7) * b.scale);
        b.sprite.material.opacity = 1 - k;
        if (b.life <= 0) b.sprite.visible = false;
      });
      this.blastLight.intensity = Math.max(0, this.blastLight.intensity - dt * 18);
      this.rings.forEach((r) => {
        if (r.life <= 0) return;
        r.life -= dt;
        const k = 1 - r.life / 0.6;
        r.mesh.scale.setScalar(0.5 + k * r.max);
        r.mesh.material.opacity = (1 - k) * 0.8;
        if (r.life <= 0) r.mesh.visible = false;
      });
    }
  }

  DZ.Effects = Effects;
})();
