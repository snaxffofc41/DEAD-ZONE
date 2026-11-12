/* DEAD ZONE — player.js
 * First-person survivor controller: walk/sprint/crouch/jump, stamina, health & armor,
 * medkits, flashlight, head-bob, camera shake and recoil recovery. */
(function () {
  const { clamp, damp } = DZ.util;
  const I = DZ.Input;

  class Player {
    constructor(camera, world, scene) {
      this.camera = camera; this.world = world;
      this.pos = new THREE.Vector3(0, 0, 3);
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = 0;
      this.recoilPitch = 0; this.recoilYaw = 0;
      this.eye = 1.68; this.radius = 0.4;
      this.health = 100; this.maxHealth = 100;
      this.armor = 0; this.maxArmor = 100;
      this.stamina = 100; this.staminaLock = 0;
      this.medkits = 1; this.healing = 0;
      this.onGround = true; this.crouching = false; this.sprinting = false; this.moving = false;
      this.bob = 0; this.bobAmount = 0; this.stepTimer = 0;
      this.shake = 0; this.dead = false; this.ads = false;
      this.lastHitDir = 0; this.hurtFlash = 0; this.slowTimer = 0;
      this.distance = 0;

      this.flashlight = new THREE.SpotLight(0xe8efff, 0, 38, 0.42, 0.45, 1.4);
      this.flashlight.position.set(0.15, -0.1, 0);
      this.flashlight.target.position.set(0, -0.05, -5);
      camera.add(this.flashlight); camera.add(this.flashlight.target);
      this.flashlightOn = false;
      this.fill = new THREE.PointLight(0x9fb0c8, 0.25, 3); camera.add(this.fill); // keeps viewmodel readable
    }

    toggleFlashlight(on = !this.flashlightOn) {
      this.flashlightOn = on;
      this.flashlight.intensity = on ? 1.6 : 0;
      DZ.Audio.dryFire();
    }

    useMedkit() {
      if (this.medkits <= 0 || this.health >= this.maxHealth || this.healing > 0) return false;
      this.medkits--; this.healing = 2.0; DZ.Audio.heal();
      return true;
    }

    damage(amount, fromPos) {
      if (this.dead) return;
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      this.health -= amount - absorbed;
      this.hurtFlash = 1; this.shake = Math.max(this.shake, 0.35);
      this.slowTimer = 0.35;
      if (fromPos) {
        const a = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
        this.lastHitDir = a; this.hitDirTime = 1.2;
      }
      DZ.Audio.hurt();
      if (this.health <= 0) { this.health = 0; this.dead = true; }
    }

    update(dt, sens, zoom) {
      const look = 0.0021 * sens / zoom;
      this.yaw -= I.mouse.dx * look;
      this.pitch -= I.mouse.dy * look;
      if (I.state.fallback && I.mouse.inside) {
        const ex = I.mouse.x;
        if (ex < 0.08) this.yaw += (0.08 - ex) * 22 * dt;
        if (ex > 0.92) this.yaw -= (ex - 0.92) * 22 * dt;
      }
      if (I.keys.ArrowLeft) this.yaw += 2.4 * dt;
      if (I.keys.ArrowRight) this.yaw -= 2.4 * dt;
      if (I.keys.ArrowUp) this.pitch += 1.6 * dt;
      if (I.keys.ArrowDown) this.pitch -= 1.6 * dt;
      this.pitch = clamp(this.pitch, -1.45, 1.45);

      const f = (I.action('forward') ? 1 : 0) - (I.action('back') ? 1 : 0);
      const s = (I.action('right') ? 1 : 0) - (I.action('left') ? 1 : 0);
      this.crouching = I.action('crouch');
      this.moving = f !== 0 || s !== 0;

      const wantSprint = I.action('sprint') && f > 0 && !this.crouching && !this.ads;
      if (this.stamina <= 0) this.staminaLock = 1.2;
      this.staminaLock = Math.max(0, this.staminaLock - dt);
      this.sprinting = wantSprint && this.staminaLock <= 0 && this.stamina > 0;
      if (this.sprinting) this.stamina = Math.max(0, this.stamina - 22 * dt);
      else this.stamina = Math.min(100, this.stamina + (this.moving ? 12 : 20) * dt);

      let speed = this.crouching ? 2.1 : this.sprinting ? 7.4 : 4.5;
      if (this.ads) speed *= 0.6;
      if (this.slowTimer > 0) { speed *= 0.65; this.slowTimer -= dt; }

      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      let wx = -sinY * f + cosY * s, wz = -cosY * f - sinY * s;
      const len = Math.hypot(wx, wz); if (len > 0) { wx /= len; wz /= len; }
      const accel = this.onGround ? 11 : 2.5;
      this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wz * speed, accel, dt);

      if (I.pressed('jump') && this.onGround && this.stamina > 8 && !this.crouching) {
        this.vel.y = 6.8; this.onGround = false; this.stamina -= 8;
      }
      this.vel.y -= 21 * dt;
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= 0) {
        if (!this.onGround && this.vel.y < -6) { DZ.Audio.footstep(0.35); this.shake = Math.max(this.shake, 0.12); }
        this.pos.y = 0; this.vel.y = 0; this.onGround = true;
      }
      this.world.resolveCircle(this.pos, this.radius);
      this.distance += Math.hypot(this.pos.x - ox, this.pos.z - oz);

      // Healing over time.
      if (this.healing > 0) {
        this.healing -= dt;
        this.health = Math.min(this.maxHealth, this.health + 30 * dt);
      }

      // Head bob + footsteps.
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.bobAmount = damp(this.bobAmount, this.onGround ? Math.min(hs / 7, 1) : 0, 8, dt);
      this.bob += dt * (this.sprinting ? 13 : this.crouching ? 6 : 9.5) * (hs > 0.5 ? 1 : 0);
      this.stepTimer -= dt * hs;
      if (this.onGround && hs > 0.8 && this.stepTimer <= 0) {
        this.stepTimer = 2.1; DZ.Audio.footstep(this.crouching ? 0.06 : this.sprinting ? 0.24 : 0.15);
      }

      this.eye = damp(this.eye, this.crouching ? 1.05 : 1.68, 12, dt);
      this.recoilPitch = damp(this.recoilPitch, 0, 7, dt);
      this.recoilYaw = damp(this.recoilYaw, 0, 7, dt);
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
      if (this.hitDirTime) this.hitDirTime = Math.max(0, this.hitDirTime - dt);

      const bobY = Math.sin(this.bob * 2) * 0.045 * this.bobAmount * (this.ads ? 0.3 : 1);
      const bobX = Math.cos(this.bob) * 0.03 * this.bobAmount * (this.ads ? 0.3 : 1);
      const sh = this.shake * this.shake;
      this.camera.position.set(
        this.pos.x + bobX * cosY + (Math.random() - 0.5) * sh * 0.3,
        this.pos.y + this.eye + bobY + (Math.random() - 0.5) * sh * 0.3,
        this.pos.z - bobX * sinY
      );
      this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, (Math.random() - 0.5) * sh * 0.05 - bobX * 0.15);
    }
  }

  DZ.Player = Player;
})();
