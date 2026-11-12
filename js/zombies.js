/* DEAD ZONE — zombies.js
 * Six infected archetypes built from articulated, randomized body parts
 * (Walker, Runner, Crawler, Screamer, Tank, Behemoth boss) with procedural
 * animation, flow-field navigation, separation steering and special abilities. */
(function () {
  const { rand, randInt, pick, damp, clamp } = DZ.util;

  const SKINS = [0x7d8a6a, 0x8a8c74, 0x6f7a63, 0x9a947c, 0x6a6e5c, 0x857a6c, 0x5f6a58];
  const SHIRTS = [0x3a3f45, 0x5a2a24, 0x2c3a4a, 0x6b6250, 0x3d4a32, 0x7a7466, 0x262626, 0x4a3a5a, 0x8a7a5a];
  const PANTS = [0x23272e, 0x2f3542, 0x3c3428, 0x1d1d1d, 0x4a4436, 0x2a3a4a];
  const GEO = new THREE.BoxGeometry(1, 1, 1);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function angleDamp(a, b, k, dt) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * (1 - Math.exp(-k * dt));
  }

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

    build() {
      const t = this.type;
      const skinHex = t === 'screamer' ? 0xb8b6a4 : t === 'tank' ? 0x6e5e58 : t === 'boss' ? 0x5c4a42 : t === 'runner' ? pick([0x9a9a84, 0x8a8c74]) : pick(SKINS);
      const skin = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.85 });
      const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRTS), roughness: 1 });
      const pants = new THREE.MeshStandardMaterial({ color: pick(PANTS), roughness: 1 });
      const wound = new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.4 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
      const eye = new THREE.MeshBasicMaterial({ color: this.def.eye });
      this.mats = [skin, shirt, pants];

      const bw = t === 'tank' ? 1.5 : t === 'boss' ? 1.45 : t === 'runner' ? 0.88 : t === 'screamer' ? 0.82 : rand(0.92, 1.15);
      const lt = t === 'tank' ? 1.5 : t === 'boss' ? 1.6 : t === 'runner' ? 0.9 : 1;
      const g = new THREE.Group(); this.group = g;
      const root = this.pivot(g, 0, 0, 0); this.root = root;
      const torsoMat = t === 'boss' || (t === 'tank' && Math.random() < 0.6) ? skin : shirt;

      this.part(root, 0.34 * bw, 0.2, 0.21 * bw, pants, 0, 0.95, 0);
      const torso = this.torso = this.pivot(root, 0, 1.02, 0);
      this.part(torso, 0.42 * bw, 0.56, 0.25 * bw, torsoMat, 0, 0.28, 0);
      if (t === 'tank' || t === 'boss') {
        this.part(torso, 0.5 * bw, 0.25, 0.3 * bw, skin, 0, 0.48, -0.02);
        this.part(torso, 0.2, 0.18, 0.2, skin, 0.27 * bw, 0.5, 0);
        this.part(torso, 0.22, 0.2, 0.22, skin, -0.27 * bw, 0.52, 0);
      }
      if (t === 'screamer') for (let i = 0; i < 4; i++) this.part(torso, 0.3, 0.025, 0.02, skin, 0, 0.12 + i * 0.08, 0.13);

      const neck = this.head = this.pivot(torso, 0, 0.57, t === 'tank' || t === 'boss' ? 0.06 : 0.02);
      const hh = t === 'screamer' ? 0.34 : 0.26;
      this.part(neck, 0.23, hh, 0.24, skin, 0, hh / 2 + 0.02, 0, 'head');
      this.jaw = this.part(neck, 0.18, 0.06, 0.16, skin, 0, 0.02, 0.03, 'head');
      const eyeY = hh * 0.62;
      this.part(neck, 0.05, 0.03, 0.02, eye, -0.055, eyeY, 0.121, 'head');
      this.part(neck, 0.05, 0.03, 0.02, eye, 0.055, eyeY, 0.121, 'head');
      this.part(neck, 0.1, 0.03, 0.02, dark, 0, eyeY - 0.08, 0.121, 'head');
      if (t === 'screamer') {
        const mouth = new THREE.MeshBasicMaterial({ color: 0x6a1010 });
        this.part(neck, 0.11, 0.12, 0.02, mouth, 0, 0.06, 0.122, 'head');
      }
      if (Math.random() < 0.5 && t !== 'boss') this.part(neck, 0.24, 0.06, 0.25, dark, 0, hh + 0.03, -0.01, 'head');
      if (t === 'boss') {
        const bone = new THREE.MeshStandardMaterial({ color: 0xc9bfa5, roughness: 0.6 });
        const glow = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4a00, emissiveIntensity: 1.4 });
        for (let i = 0; i < 6; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, rand(0.2, 0.35), 5), bone);
          c.position.set(rand(-0.18, 0.18), 0.15 + i * 0.07, -0.16); c.rotation.x = -0.9; c.userData = { zombie: this, part: 'body' };
          torso.add(c);
        }
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.035, 0.07), 8, 6), glow);
          s.position.set(rand(-0.28, 0.28), rand(0.05, 0.55), pick([0.13, -0.13, 0.1])); s.userData = { zombie: this, part: 'body' };
          torso.add(s);
        }
        this.part(neck, 0.2, 0.08, 0.04, bone, 0, 0.0, 0.11, 'head');
      }
      if (t === 'tank') {
        const glow = new THREE.MeshStandardMaterial({ color: 0x8a3a1a, emissive: 0x5a1a00, emissiveIntensity: 0.8 });
        for (let i = 0; i < 4; i++) this.part(torso, rand(0.08, 0.14), rand(0.08, 0.14), 0.06, glow, rand(-0.25, 0.25), rand(0.1, 0.5), 0.15);
      }

      this.arms = [-1, 1].map((side) => {
        const thick = (t === 'tank' && side === 1 ? 1.35 : 1) * lt;
        const sh = this.pivot(torso, side * (0.235 * bw + 0.05 * thick), 0.5, 0);
        const sleeveMat = torsoMat === shirt && Math.random() < 0.6 ? shirt : skin;
        this.part(sh, 0.11 * thick, 0.3, 0.11 * thick, sleeveMat, 0, -0.15, 0);
        const el = this.pivot(sh, 0, -0.3, 0);
        this.part(el, 0.095 * thick, 0.28, 0.095 * thick, skin, 0, -0.14, 0);
        this.part(el, 0.09 * thick, 0.1, 0.05 * thick, skin, 0, -0.32, 0);
        if (t === 'boss') {
          const claw = new THREE.MeshStandardMaterial({ color: 0x2a2420 });
          for (let i = -1; i <= 1; i++) this.part(el, 0.02, 0.14, 0.02, claw, i * 0.04, -0.43, 0.02);
        }
        return { sh, el, side };
      });

      this.legs = [-1, 1].map((side) => {
        const hip = this.pivot(root, side * 0.1 * bw, 0.92, 0);
        this.part(hip, 0.14 * lt, 0.46, 0.15 * lt, pants, 0, -0.22, 0);
        const knee = this.pivot(hip, 0, -0.45, 0);
        const stump = t === 'crawler' && side === 1;
        if (!stump) {
          this.part(knee, 0.12 * lt, 0.44, 0.13 * lt, pants, 0, -0.22, 0);
          this.part(knee, 0.12 * lt, 0.08, 0.23 * lt, dark, 0, -0.46, 0.04);
        } else this.part(knee, 0.1, 0.06, 0.1, wound, 0, 0, 0);
        return { hip, knee, side };
      });

      // Wounds and blood patches.
      for (let i = 0; i < randInt(2, 5); i++) {
        this.part(torso, rand(0.06, 0.14), rand(0.05, 0.14), 0.02, wound, rand(-0.15, 0.15) * bw, rand(0.05, 0.5), pick([0.128 * bw, -0.128 * bw]));
      }

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
      if (head && this.type !== 'boss') {
        this.head.visible = false;
        this.game.fx.gore(this.head.getWorldPosition(tmp2));
      } else if (point) this.game.fx.blood(point, 2);
      this.game.onKill(this, head);
    }

    update(dt) {
      const game = this.game, p = game.player, d = this.def, g = this.group;
      if (this.dead) {
        this.deathT += dt;
        const k = clamp(this.deathT / 0.55, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        g.rotation.x = this.fallDir * e;
        this.arms.forEach((a) => { a.sh.rotation.x = damp(a.sh.rotation.x, -0.3, 6, dt); });
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
      this.mats.forEach((m) => { m.emissive.setRGB(this.flash * 0.45, 0, 0); });
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
      this.mats.forEach((m) => m.dispose());
    }
  }

  DZ.Zombie = Zombie;
})();
