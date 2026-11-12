/* DEAD ZONE — environment.js
 * Day/night cycle (sun, moon, sky, fog, lit windows) and a weather state machine
 * (clear, fog, rain, thunderstorm) with rain particles and lightning. */
(function () {
  const { rand, lerp, clamp } = DZ.util;
  const DAY_LENGTH = 420; // seconds for a full 24h cycle
  const WEATHERS = ['clear', 'fog', 'rain', 'storm'];

  const SKY = {
    night: new THREE.Color(0x070a10), dawn: new THREE.Color(0x4a3a3a),
    day: new THREE.Color(0x7d878c), dusk: new THREE.Color(0x5a3426),
  };

  class Environment {
    constructor(scene, world, preset) {
      this.scene = scene; this.world = world; this.preset = preset;
      this.time = 0.78; // start at dusk
      this.weather = 'clear'; this.weatherTimer = rand(60, 110);
      this.rainLevel = 0; this.fogLevel = 0; this.flash = 0; this.nextThunder = rand(4, 10);

      this.hemi = new THREE.HemisphereLight(0x8a9bb0, 0x1a1712, 0.5); scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xffe2c0, 1.0);
      this.sun.castShadow = preset.shadows;
      if (preset.shadows) {
        this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
        const s = this.sun.shadow.camera; s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 160;
        this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
      }
      scene.add(this.sun); scene.add(this.sun.target);
      this.ambient = new THREE.AmbientLight(0x404858, 0.15); scene.add(this.ambient);

      scene.fog = new THREE.FogExp2(0x0a0d12, 0.02);
      scene.background = new THREE.Color(0x0a0d12);

      // Rain as streak line segments that follow the player.
      const count = Math.floor(3500 * preset.particles);
      const pos = new Float32Array(count * 6);
      for (let i = 0; i < count; i++) {
        const x = rand(-35, 35), y = rand(0, 30), z = rand(-35, 35);
        pos.set([x, y, z, x + 0.05, y + 0.6, z], i * 6);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb2c8, transparent: true, opacity: 0.0, depthWrite: false }));
      this.rain.frustumCulled = false; this.rainCount = count;
      scene.add(this.rain);
    }

    get hour() { return (this.time * 24) % 24; }
    get isNight() { const h = this.hour; return h < 5.5 || h > 19.5; }
    get clock() {
      const h = Math.floor(this.hour), m = Math.floor((this.hour % 1) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    update(dt, player) {
      this.time = (this.time + dt / DAY_LENGTH) % 1;
      const h = this.hour;
      // Sun elevation: -1 at midnight, 1 at noon.
      const sunAng = ((h - 6) / 24) * Math.PI * 2;
      const elev = Math.sin(sunAng);
      const day = clamp(elev * 2.5 + 0.3, 0, 1);

      let sky;
      if (h >= 5 && h < 8) sky = SKY.night.clone().lerp(SKY.dawn, clamp((h - 5) / 1.5, 0, 1)).lerp(SKY.day, clamp((h - 6.5) / 1.5, 0, 1));
      else if (h >= 8 && h < 17.5) sky = SKY.day.clone();
      else if (h >= 17.5 && h < 21) sky = SKY.day.clone().lerp(SKY.dusk, clamp((h - 17.5) / 1.5, 0, 1)).lerp(SKY.night, clamp((h - 19) / 2, 0, 1));
      else sky = SKY.night.clone();

      // Weather transitions.
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0 && DZ.settings.weather) {
        this.weather = DZ.util.pick(WEATHERS.filter((w) => w !== this.weather));
        this.weatherTimer = rand(70, 140);
      }
      if (!DZ.settings.weather) this.weather = 'clear';
      const targetRain = this.weather === 'rain' ? 0.7 : this.weather === 'storm' ? 1 : 0;
      const targetFog = this.weather === 'fog' ? 1 : this.weather === 'storm' ? 0.5 : this.weather === 'rain' ? 0.35 : 0;
      this.rainLevel = DZ.util.damp(this.rainLevel, targetRain, 0.4, dt);
      this.fogLevel = DZ.util.damp(this.fogLevel, targetFog, 0.3, dt);
      DZ.Audio.setRain(this.rainLevel);

      const gray = new THREE.Color(0x3a4048);
      sky.lerp(gray.multiplyScalar(0.3 + day * 0.7), this.rainLevel * 0.6);

      // Lightning.
      if (this.weather === 'storm') {
        this.nextThunder -= dt;
        if (this.nextThunder <= 0) { this.flash = 1; this.nextThunder = rand(6, 16); setTimeout(() => DZ.Audio.thunder(), rand(200, 1400)); }
      }
      this.flash = Math.max(0, this.flash - dt * 3);
      const fl = this.flash > 0.6 || (this.flash > 0.2 && this.flash < 0.35) ? this.flash : 0;

      const bg = sky.clone().lerp(new THREE.Color(0xc8d4ff), fl * 0.7);
      this.scene.background.copy(bg);
      this.scene.fog.color.copy(bg);
      const baseDensity = 1.9 / this.preset.drawDist;
      this.scene.fog.density = baseDensity * (1 + (1 - day) * 0.6) + this.fogLevel * 0.035;

      this.sun.intensity = lerp(0.18, 1.05, day) * (1 - this.rainLevel * 0.45) + fl * 2;
      this.sun.color.setHex(day > 0.5 ? 0xffe9cf : day > 0.05 ? 0xff9a60 : 0x8aa0d0);
      this.hemi.intensity = lerp(0.28, 0.55, day) + fl * 1.5;
      this.ambient.intensity = lerp(0.12, 0.2, day);

      const dir = new THREE.Vector3(Math.cos(sunAng) * 0.8, Math.abs(elev) * 1 + 0.35, 0.45).normalize();
      this.sun.position.copy(player.pos).addScaledVector(dir, 70);
      this.sun.target.position.copy(player.pos);

      const windows = clamp(1 - day * 1.6, 0, 1) * 0.9;
      this.world.windowMats.forEach((m) => { m.emissiveIntensity = windows; });

      // Rain motion.
      this.rain.material.opacity = this.rainLevel * 0.45;
      this.rain.visible = this.rainLevel > 0.02;
      if (this.rain.visible) {
        const arr = this.rain.geometry.attributes.position.array;
        const fall = 28 * dt;
        for (let i = 0; i < this.rainCount; i++) {
          const o = i * 6;
          arr[o + 1] -= fall; arr[o + 4] -= fall;
          if (arr[o + 1] < 0) {
            const x = player.pos.x + rand(-35, 35), z = player.pos.z + rand(-35, 35), y = rand(22, 30);
            arr[o] = x; arr[o + 1] = y; arr[o + 2] = z; arr[o + 3] = x + 0.05; arr[o + 4] = y + 0.6; arr[o + 5] = z;
          }
        }
        this.rain.geometry.attributes.position.needsUpdate = true;
      }
      return { day, night: this.isNight };
    }

    get label() {
      return { clear: 'Clear', fog: 'Heavy Fog', rain: 'Rain', storm: 'Thunderstorm' }[this.weather];
    }
  }

  DZ.Environment = Environment;
})();
