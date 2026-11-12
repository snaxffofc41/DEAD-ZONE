/* DEAD ZONE — game.js
 * Survival-mode orchestration: scene setup, wave director (composition, scaling,
 * spawning, bosses), loot crates and drops, supply shop, scoring/XP/achievements,
 * explosions and game-over. One Game instance = one run on one map. */
(function () {
  const { rand, randInt, pick, clamp } = DZ.util;
  const I = DZ.Input;

  const ACHIEVEMENTS = [
    { id: 'first', name: 'First Blood', desc: 'Kill your first infected', test: (g) => g.kills >= 1 },
    { id: 'wave5', name: 'Survivor', desc: 'Reach wave 5', test: (g) => g.wave >= 5 },
    { id: 'wave10', name: 'Last One Standing', desc: 'Reach wave 10', test: (g) => g.wave >= 10 },
    { id: 'head25', name: 'Headhunter', desc: '25 headshot kills in one run', test: (g) => g.headKills >= 25 },
    { id: 'kills100', name: 'Exterminator', desc: '100 kills in one run', test: (g) => g.kills >= 100 },
    { id: 'boss', name: 'Giant Slayer', desc: 'Kill a Behemoth', test: (g) => g.bossKills >= 1 },
    { id: 'tank', name: 'Tank Buster', desc: 'Kill a Tank', test: (g) => g.tankKills >= 1 },
    { id: 'armory', name: 'Armory', desc: 'Unlock every weapon', test: (g) => g.weapons.slots.every((s) => s.unlocked) },
  ];
  DZ.ACHIEVEMENTS = ACHIEVEMENTS;

  const SHOP = [
    { id: 'ammo', name: 'Ammo Resupply', desc: 'Refill reserve ammo for all weapons', cost: 300 },
    { id: 'medkit', name: 'Medical Kit', desc: '+1 medkit (heals 60 HP)', cost: 250 },
    { id: 'armor', name: 'Kevlar Plate', desc: '+50 armor (absorbs 60% damage)', cost: 400 },
    { id: 'grenade', name: 'Frag Grenade', desc: '+1 grenade', cost: 200 },
    { id: 'upgrade', name: 'Upgrade Current Weapon', desc: '+20% damage, +25% mag, -15% recoil', cost: 0 },
    { id: 'unlock_r870', name: 'Unlock Remington 870', desc: '9-pellet pump shotgun', cost: 1200 },
    { id: 'unlock_awm', name: 'Unlock AWM', desc: 'Bolt sniper, pierces 3 targets', cost: 2500 },
  ];
  DZ.SHOP = SHOP;

  class Game {
    constructor(renderer, ui) {
      this.renderer = renderer; this.ui = ui;
      const preset = this.preset = DZ.PRESETS[DZ.settings.preset];
      renderer.shadowMap.enabled = preset.shadows;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(DZ.settings.fov, innerWidth / innerHeight, 0.03, preset.drawDist * 1.6);
      this.camera.rotation.order = 'YXZ';
      this.scene.add(this.camera);
      this.world = new DZ.World(this.scene, preset);
      this.env = new DZ.Environment(this.scene, this.world, preset);
      this.player = new DZ.Player(this.camera, this.world, this.scene);
      this.fx = new DZ.Effects(this.scene, preset);
      this.weapons = new DZ.Weapons(this.camera, this.scene, this.player, this.world, this.fx, this);
      this.weapons.root.visible = false;

      this.zombies = []; this.pickups = []; this.crates = [];
      this.mode = 'menu'; this.paused = false; this.shopOpen = false;
      this.wave = 0; this.phase = 'prep'; this.phaseT = 10; this.toSpawn = []; this.spawnT = 0;
      this.score = 0; this.cash = 500; this.kills = 0; this.headKills = 0; this.bossKills = 0; this.tankKills = 0;
      this.xp = 0; this.level = 1; this.time = 0; this.combo = 0; this.comboT = 0;
      this.speedMul = 1; this.damageMul = 1; this.flowT = 0; this.menuT = 0; this.heartT = 0;
      this.boss = null;
      this.buildCrates();
      this.world.computeFlow(0, 0);
    }

    /* ---------- Lifecycle ---------- */
    begin() {
      this.mode = 'playing';
      this.weapons.root.visible = true;
      this.player.toggleFlashlight(this.env.isNight);
      this.phase = 'prep'; this.phaseT = 10;
      this.ui.banner('DEAD ZONE', 'Abandoned City · Scavenge the checkpoint. First wave incoming.');
      this.ui.toast('Supply crates are marked in blue on the minimap');
    }
    dispose() {
      this.zombies.forEach((z) => z.dispose());
      this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }

    /* ---------- Loot ---------- */
    buildCrates() {
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.85 });
      this.world.lootSpots.forEach((p) => {
        const g = new THREE.Group(); g.position.copy(p); g.rotation.y = rand(0, Math.PI);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), this.world.mats.crate); body.position.y = 0.3;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.74), this.world.mats.crate); lid.position.y = 0.65;
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), beaconMat); beacon.position.set(0, 0.62, 0.37);
        if (this.preset.shadows) { body.castShadow = true; lid.castShadow = true; }
        g.add(body, lid, beacon); this.scene.add(g);
        this.crates.push({ group: g, lid, beacon, pos: p, opened: false });
      });
    }
    restockCrates() {
      this.crates.forEach((c) => {
        if (c.opened && Math.random() < 0.65) {
          c.opened = false; c.lid.position.set(0, 0.65, 0); c.lid.rotation.set(0, 0, 0); c.beacon.visible = true;
        }
      });
    }
    openCrate(c) {
      c.opened = true; c.beacon.visible = false;
      c.lid.position.set(0, 0.45, -0.55); c.lid.rotation.x = -1.2;
      DZ.Audio.crate();
      const roll = Math.random();
      const w = this.weapons, p = this.player;
      let msg;
      if (roll < 0.4) { w.refillAll(0.5); msg = 'Ammunition +50% reserve'; }
      else if (roll < 0.6) { p.medkits++; msg = 'Medical kit'; }
      else if (roll < 0.75) { p.armor = Math.min(p.maxArmor, p.armor + 35); msg = 'Armor plate +35'; }
      else if (roll < 0.88) { w.grenades++; msg = 'Frag grenade'; }
      else { const c2 = randInt(150, 350); this.cash += c2; msg = `Supply cache $${c2}`; }
      this.ui.toast(`Found: ${msg}`);
    }
    dropLoot(pos, type) {
      const r = Math.random();
      const big = type === 'tank' || type === 'boss';
      let kind = null;
      if (big || r < 0.14) kind = 'ammo';
      else if (r < 0.19) kind = 'medkit';
      else if (r < 0.22) kind = 'grenade';
      else if (r < 0.26) kind = 'armor';
      if (!kind) return;
      const colors = { ammo: 0x8a7a2a, medkit: 0xdedede, grenade: 0x3a4228, armor: 0x2a4a6a };
      const g = new THREE.Group();
      const m = new THREE.Mesh(kind === 'grenade' ? new THREE.SphereGeometry(0.12, 10, 8) : new THREE.BoxGeometry(0.36, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: colors[kind], roughness: 0.6, emissive: colors[kind], emissiveIntensity: 0.15 }));
      g.add(m);
      if (kind === 'medkit') {
        const cross = new THREE.MeshBasicMaterial({ color: 0xc81e1e });
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.27), cross); const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.27), cross);
        g.add(a, b);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.28;
      g.add(ring);
      g.position.set(pos.x, 0.35, pos.z); this.scene.add(g);
      this.pickups.push({ group: g, kind, life: 35, t: rand(0, 6), big });
    }
    collect(pk) {
      const p = this.player, w = this.weapons;
      if (pk.kind === 'ammo') { w.refillAll(pk.big ? 0.6 : 0.25); this.ui.toast('Ammo'); }
      if (pk.kind === 'medkit') { p.medkits++; this.ui.toast('Medical kit'); }
      if (pk.kind === 'grenade') { w.grenades++; this.ui.toast('Frag grenade'); }
      if (pk.kind === 'armor') { p.armor = Math.min(p.maxArmor, p.armor + 20); this.ui.toast('Armor +20'); }
      DZ.Audio.pickup();
    }

    /* ---------- Shop ---------- */
    shopCost(item) {
      if (item.id === 'upgrade') { const s = this.weapons.slot; return s.level >= 3 ? Infinity : 700 * s.level; }
      return item.cost;
    }
    shopAvailable(item) {
      if (item.id.startsWith('unlock_')) return !this.weapons.slots.find((s) => s.def.id === item.id.slice(7)).unlocked;
      if (item.id === 'upgrade') return this.weapons.slot.level < 3;
      if (item.id === 'armor') return this.player.armor < this.player.maxArmor;
      return true;
    }
    buy(id) {
      const item = SHOP.find((i) => i.id === id);
      const cost = this.shopCost(item);
      if (!this.shopAvailable(item) || this.cash < cost) { DZ.Audio.deny(); return false; }
      this.cash -= cost;
      const p = this.player, w = this.weapons;
      if (id === 'ammo') w.refillAll(1);
      if (id === 'medkit') p.medkits++;
      if (id === 'armor') p.armor = Math.min(p.maxArmor, p.armor + 50);
      if (id === 'grenade') w.grenades++;
      if (id === 'upgrade') { w.slot.level++; w.slot.mag = w.stat(w.slot, 'mag'); }
      if (id.startsWith('unlock_')) {
        const idx = w.slots.findIndex((s) => s.def.id === id.slice(7));
        w.slots[idx].unlocked = true; w.switchTo(idx);
      }
      DZ.Audio.buy(); this.checkAchievements();
      return true;
    }

    /* ---------- Waves ---------- */
    composition(n) {
      const list = [];
      const bossWave = n % 5 === 0;
      const total = bossWave ? 4 + n * 2 : 6 + n * 4;
      for (let i = 0; i < total; i++) {
        const r = Math.random();
        if (n >= 2 && r < 0.18 + n * 0.012) list.push('runner');
        else if (n >= 3 && r < 0.33 + n * 0.01) list.push('crawler');
        else list.push('normal');
      }
      if (n >= 4) for (let i = 0; i < 1 + Math.floor(n / 4); i++) list.push('screamer');
      if (n >= 6 && !bossWave) for (let i = 0; i < Math.min(4, Math.floor((n - 4) / 2)); i++) list.push('tank');
      if (n === 3 || n === 4) list.push('tank');
      list.sort(() => Math.random() - 0.5);
      if (bossWave) for (let i = 0; i < Math.min(2, n / 5); i++) list.splice(Math.floor(list.length * (0.2 + i * 0.4)), 0, 'boss');
      return list;
    }
    startWave() {
      this.wave++;
      this.phase = 'wave';
      this.toSpawn = this.composition(this.wave);
      this.waveTotal = this.toSpawn.length;
      this.spawnT = 1;
      this.hpMul = 1 + (this.wave - 1) * 0.09;
      this.damageMul = 1 + (this.wave - 1) * 0.04;
      DZ.Audio.waveStart();
      const boss = this.toSpawn.includes('boss');
      this.ui.banner(`WAVE ${this.wave}`, boss ? 'A Behemoth is approaching. Hold the line.' : `${this.waveTotal} infected inbound`);
      if (this.shopOpen) this.ui.closeShop();
      this.checkAchievements();
    }
    endWave() {
      this.phase = 'intermission'; this.phaseT = 25;
      const bonus = 250 + this.wave * 60;
      this.cash += bonus; this.score += bonus;
      this.weapons.refillAll(0.15);
      this.restockCrates();
      DZ.Audio.waveClear();
      this.ui.banner(`WAVE ${this.wave} SURVIVED`, `+$${bonus} survival bonus · Press [${I.keyLabel(DZ.settings.keys.shop)}] for the supply shop`);
    }
    spawn(type, pos) {
      const z = new DZ.Zombie(type, pos, this, this.hpMul || 1);
      this.zombies.push(z);
      if (type === 'boss') { this.boss = z; DZ.Audio.roar(pos.x, pos.z); this.ui.toast('BEHEMOTH DETECTED'); }
      return z;
    }
    spawnAround(center, type, n) {
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 12; tries++) {
          const a = rand(0, Math.PI * 2), d = rand(3, 7);
          const p = new THREE.Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d);
          if (!this.world.isBlockedPoint(p.x, p.z, 0.6) && Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) > 6) { this.spawn(type, p); break; }
        }
      }
    }
    onScream(z) {
      this.zombies.forEach((o) => { if (!o.dead && o.pos.distanceTo(z.pos) < 20) o.buff = 7; });
      this.spawnAround(z.pos, 'normal', 3);
      this.ui.toast('A Screamer is calling the horde!');
    }

    /* ---------- Combat events ---------- */
    onHit(head, kill) { this.ui.hitmarker(head, kill); DZ.Audio.hitmarker(head); }
    onKill(z, head) {
      this.kills++; if (head) this.headKills++;
      if (z.type === 'boss') { this.bossKills++; this.boss = null; DZ.stats.bossKills++; }
      if (z.type === 'tank') this.tankKills++;
      this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 3;
      const mult = 1 + Math.min(this.combo - 1, 10) * 0.1;
      const pts = Math.round(z.def.score * (head ? 1.5 : 1) * mult);
      this.score += pts; this.cash += Math.round(pts * 0.6);
      this.addXP(pts);
      this.ui.killfeed(z.def.name, head, pts, this.combo);
      DZ.Audio.kill();
      this.dropLoot(z.pos, z.type);
      this.checkAchievements();
    }
    addXP(v) {
      this.xp += v;
      const need = () => 1500 + (this.level - 1) * 900;
      while (this.xp >= need()) {
        this.xp -= need(); this.level++;
        this.player.maxHealth += 5; this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
        this.ui.toast(`LEVEL ${this.level} · Max health +5`);
      }
      this.xpNeed = need();
    }
    explode(pos, radius, dmg) {
      this.fx.explosion(pos, 1); DZ.Audio.explosion(pos.x, pos.z);
      this.zombies.forEach((z) => {
        if (z.dead) return;
        const d = z.pos.distanceTo(tmpV.set(pos.x, 0, pos.z));
        if (d < radius) {
          const k = 1 - d / radius;
          z.knock.add(tmpV2.copy(z.pos).sub(pos).setY(0).normalize().multiplyScalar(6 * k));
          if (z.takeDamage(dmg * (0.3 + 0.7 * k), null, false, null)) this.fx.gore(z.pos.clone().setY(1));
        }
      });
      const pd = this.player.pos.distanceTo(tmpV.set(pos.x, 0, pos.z));
      if (pd < radius * 0.7) this.player.damage(45 * (1 - pd / (radius * 0.7)), pos);
      this.player.shake = Math.max(this.player.shake, clamp(1.2 - pd / 25, 0.15, 1));
    }
    checkAchievements() {
      DZ.stats.keys = DZ.stats.keys || {};
      ACHIEVEMENTS.forEach((a) => {
        if (!DZ.stats.keys[a.id] && a.test(this)) {
          DZ.stats.keys[a.id] = true; DZ.saveStats();
          this.ui.achievement(a);
        }
      });
    }

    /* ---------- Frame ---------- */
    updateMenu(dt) {
      this.menuT += dt * 0.04;
      const r = 46;
      this.camera.position.set(Math.cos(this.menuT) * r, 16 + Math.sin(this.menuT * 2) * 2, Math.sin(this.menuT) * r);
      this.camera.lookAt(0, 4, 0);
      this.env.update(dt, { pos: new THREE.Vector3() });
      this.world.update(dt);
      this.fx.update(dt);
    }

    update(dt) {
      const p = this.player, w = this.weapons;
      this.time += dt;
      if (!this.shopOpen) {
        if (I.pressed('flashlight')) p.toggleFlashlight();
        if (I.pressed('medkit')) { if (!p.useMedkit()) this.ui.toast(p.medkits <= 0 ? 'No medkits' : 'Health is full'); }
      }
      if (!this.shopOpen && I.pressed('shop')) {
        if (this.phase !== 'wave') this.ui.toggleShop();
        else this.ui.toast('Supply shop is only available between waves');
      }

      p.update(dt, DZ.settings.sens, w.zoom || 1);
      DZ.Audio.listener.x = p.pos.x; DZ.Audio.listener.z = p.pos.z; DZ.Audio.listener.yaw = p.yaw;
      if (!this.shopOpen) w.update(dt, this.zombies);
      else w.animate(dt);

      const envState = this.env.update(dt, p);
      this.speedMul = (envState.night ? 1.15 : 1) * (1 + Math.min(0.3, (this.wave - 1) * 0.02));

      // Pathfinding refresh.
      this.flowT -= dt;
      if (this.flowT <= 0) { this.world.computeFlow(p.pos.x, p.pos.z); this.flowT = 0.25; }

      // Wave director.
      if (this.phase === 'prep' || this.phase === 'intermission') {
        if (!this.shopOpen) this.phaseT -= dt;
        if (this.phaseT <= 0) this.startWave();
      } else if (this.phase === 'wave') {
        const alive = this.zombies.filter((z) => !z.dead).length;
        this.spawnT -= dt;
        if (this.toSpawn.length && alive < this.preset.maxZombies && this.spawnT <= 0) {
          const type = this.toSpawn.shift();
          this.spawn(type, this.world.randomSpawnPoint(14, 38));
          this.spawnT = Math.max(0.3, 1.5 - this.wave * 0.07) * rand(0.6, 1.3);
        }
        if (!this.toSpawn.length && alive === 0) this.endWave();
        DZ.Audio.setTension(Math.min(1, alive / 15));
      }
      this.remaining = this.toSpawn.length + this.zombies.filter((z) => !z.dead).length;

      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        z.update(dt);
        if (z.remove) { z.dispose(); this.zombies.splice(i, 1); }
      }

      // Pickups & crates.
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.t += dt; pk.life -= dt;
        pk.group.rotation.y += dt * 1.5; pk.group.position.y = 0.35 + Math.sin(pk.t * 3) * 0.06;
        const d = Math.hypot(pk.group.position.x - p.pos.x, pk.group.position.z - p.pos.z);
        if (d < 1.5) { this.collect(pk); this.scene.remove(pk.group); this.pickups.splice(i, 1); }
        else if (pk.life <= 0) { this.scene.remove(pk.group); this.pickups.splice(i, 1); }
      }
      let near = null, nearD = 2.4;
      this.crates.forEach((c) => {
        if (c.opened) return;
        c.beacon.material.opacity = 0.5 + Math.sin(this.time * 4) * 0.35;
        const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
        if (d < nearD) { near = c; nearD = d; }
      });
      this.nearCrate = near;
      if (near && I.pressed('interact')) this.openCrate(near);

      this.comboT = Math.max(0, this.comboT - dt);
      this.world.update(dt);
      this.fx.update(dt);

      if (p.health < 30) {
        this.heartT -= dt;
        if (this.heartT <= 0) { DZ.Audio.heartbeat(); this.heartT = 0.6 + p.health / 60; }
      }
      if (p.dead) this.gameOver();
    }

    gameOver() {
      this.mode = 'over';
      const s = DZ.stats;
      s.games++; s.totalKills += this.kills; s.headshots += this.headKills; s.timePlayed += this.time;
      const newBest = this.score > s.bestScore;
      s.bestWave = Math.max(s.bestWave, this.wave); s.bestScore = Math.max(s.bestScore, this.score);
      DZ.saveStats();
      const w = this.weapons;
      this.ui.gameOver({
        wave: this.wave, score: this.score, kills: this.kills, headshots: this.headKills, level: this.level,
        accuracy: w.shots ? Math.round((w.hits / w.shots) * 100) : 0, time: this.time, newBest, distance: Math.round(this.player.distance),
      });
    }
  }

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  DZ.Game = Game;
})();
