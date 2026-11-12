/* DEAD ZONE — config.js
 * Static game data (weapons, zombies, graphics presets) and persisted settings/stats.
 * Every other system reads from the global DZ namespace defined here. */
window.DZ = window.DZ || {};

DZ.util = {
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
};

/* Weapon definitions. damage is per pellet; rpm = rounds per minute. */
DZ.WEAPONS = [
  {
    id: 'glock', name: 'Glock 17', type: 'Pistol', slot: 1,
    damage: 30, pellets: 1, rpm: 420, auto: false, mag: 17, reserve: 102, reload: 1.35,
    spread: 0.012, adsSpread: 0.003, recoil: 0.022, range: 90, pierce: 0, zoom: 1.25,
    unlockCost: 0, sound: 'pistol',
  },
  {
    id: 'm4', name: 'M4A1', type: 'Assault Rifle', slot: 2,
    damage: 34, pellets: 1, rpm: 780, auto: true, mag: 30, reserve: 180, reload: 2.1,
    spread: 0.022, adsSpread: 0.005, recoil: 0.017, range: 140, pierce: 0, zoom: 1.5,
    unlockCost: 0, sound: 'rifle',
  },
  {
    id: 'r870', name: 'Remington 870', type: 'Shotgun', slot: 3,
    damage: 22, pellets: 9, rpm: 72, auto: false, mag: 6, reserve: 42, reload: 2.6,
    spread: 0.085, adsSpread: 0.06, recoil: 0.085, range: 40, pierce: 0, zoom: 1.2,
    unlockCost: 1200, sound: 'shotgun',
  },
  {
    id: 'awm', name: 'AWM', type: 'Sniper Rifle', slot: 4,
    damage: 260, pellets: 1, rpm: 42, auto: false, mag: 5, reserve: 30, reload: 3.1,
    spread: 0.05, adsSpread: 0.0004, recoil: 0.11, range: 250, pierce: 3, zoom: 4.5,
    unlockCost: 2500, sound: 'sniper',
  },
];

/* Zombie archetypes. */
DZ.ZOMBIES = {
  normal:   { name: 'Walker',   hp: 100,  speed: 1.55, damage: 12, range: 1.5, attackRate: 1.2, scale: 1.0,  score: 100,  radius: 0.4, eye: 0xffd36b },
  runner:   { name: 'Runner',   hp: 70,   speed: 4.3,  damage: 9,  range: 1.4, attackRate: 0.8, scale: 1.0,  score: 150,  radius: 0.38, eye: 0xff3b2f },
  crawler:  { name: 'Crawler',  hp: 60,   speed: 2.5,  damage: 8,  range: 1.4, attackRate: 0.9, scale: 1.0,  score: 120,  radius: 0.45, eye: 0x9dff6b },
  screamer: { name: 'Screamer', hp: 110,  speed: 1.9,  damage: 10, range: 1.5, attackRate: 1.1, scale: 1.05, score: 250,  radius: 0.4, eye: 0xe8f4ff },
  tank:     { name: 'Tank',     hp: 750,  speed: 1.15, damage: 32, range: 2.3, attackRate: 1.8, scale: 1.55, score: 600,  radius: 0.8, eye: 0xff8a2a },
  boss:     { name: 'Behemoth', hp: 4200, speed: 1.6,  damage: 42, range: 3.6, attackRate: 2.0, scale: 2.5,  score: 4000, radius: 1.3, eye: 0xff5a00 },
};

DZ.PRESETS = {
  low:    { label: 'Low',    pixelRatio: 0.7, shadows: false, shadowSize: 512,  drawDist: 85,  lamps: 2, particles: 0.4, maxZombies: 18 },
  medium: { label: 'Medium', pixelRatio: 1.0, shadows: true,  shadowSize: 1024, drawDist: 115, lamps: 4, particles: 0.7, maxZombies: 26 },
  high:   { label: 'High',   pixelRatio: 1.5, shadows: true,  shadowSize: 2048, drawDist: 150, lamps: 6, particles: 1.0, maxZombies: 32 },
  ultra:  { label: 'Ultra',  pixelRatio: 2.0, shadows: true,  shadowSize: 4096, drawDist: 190, lamps: 8, particles: 1.0, maxZombies: 40 },
};

DZ.ACTIONS = [
  ['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'],
  ['left', 'Strafe left', 'KeyA'], ['right', 'Strafe right', 'KeyD'],
  ['sprint', 'Sprint', 'ShiftLeft'], ['crouch', 'Crouch', 'KeyC'], ['jump', 'Jump', 'Space'],
  ['reload', 'Reload', 'KeyR'], ['interact', 'Interact / Loot', 'KeyE'],
  ['grenade', 'Throw grenade', 'KeyG'], ['medkit', 'Use medkit', 'KeyH'],
  ['flashlight', 'Flashlight', 'KeyF'], ['inspect', 'Inspect weapon', 'KeyV'],
  ['shop', 'Supply shop (between waves)', 'KeyB'],
];

const DEFAULT_SETTINGS = {
  preset: 'medium', fov: 75, sens: 1.0, volume: 0.7, music: 0.5,
  showFps: true, weather: true, fpsLimit: 0, renderScale: 1.0,
  keys: Object.fromEntries(DZ.ACTIONS.map(([id, , key]) => [id, key])),
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(fallback), ...parsed, keys: { ...fallback.keys, ...(parsed.keys || {}) } };
  } catch (e) {
    return structuredClone(fallback);
  }
}

DZ.settings = loadJSON('dz_settings', DEFAULT_SETTINGS);
DZ.saveSettings = () => { try { localStorage.setItem('dz_settings', JSON.stringify(DZ.settings)); } catch (e) {} };
DZ.resetKeys = () => { DZ.settings.keys = { ...DEFAULT_SETTINGS.keys }; DZ.saveSettings(); };

const DEFAULT_STATS = { bestWave: 0, bestScore: 0, totalKills: 0, headshots: 0, games: 0, bossKills: 0, timePlayed: 0, keys: {} };
DZ.stats = loadJSON('dz_stats', DEFAULT_STATS);
DZ.saveStats = () => { try { localStorage.setItem('dz_stats', JSON.stringify(DZ.stats)); } catch (e) {} };

DZ.MAP = { half: 80, cell: 2 };
