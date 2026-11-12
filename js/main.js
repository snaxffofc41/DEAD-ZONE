/* DEAD ZONE — main.js
 * Boot: renderer, main loop (with FPS limiter), screen navigation and the
 * Play → Pause → Game Over lifecycle. */
(function () {
  const UI = DZ.UI, I = DZ.Input;
  const container = document.getElementById('scene');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'DEAD ZONE game view');

  function applyResolution() {
    const p = DZ.PRESETS[DZ.settings.preset];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio) * DZ.settings.renderScale);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (game) { game.camera.aspect = window.innerWidth / window.innerHeight; game.camera.updateProjectionMatrix(); }
  }

  let game = null;
  let needsRebuild = false;

  function newGame() {
    if (game) game.dispose();
    game = new DZ.Game(renderer, UI);
    UI.setGame(game);
    needsRebuild = false;
    applyResolution();
  }

  DZ.requestLock = () => { if (!I.state.fallback || !I.state.locked) I.requestLock(renderer.domElement); };

  function play() {
    DZ.Audio.init();
    if (!game || game.mode !== 'menu' || needsRebuild) newGame();
    UI.clearStack(); UI.show(null);
    UI.setHud(true);
    I.state.enabled = true;
    game.begin();
    game.paused = false;
    DZ.requestLock();
  }
  function pause() {
    if (!game || game.mode !== 'playing' || game.paused || game.shopOpen) return;
    game.paused = true; I.state.enabled = false;
    document.getElementById('pause-stats').textContent = `Wave ${game.wave} · ${game.kills} kills · ${game.score.toLocaleString()} pts · ${game.env.clock}`;
    UI.clearStack(); UI.show('screen-pause');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resume() {
    if (!game) return;
    UI.clearStack(); UI.show(null);
    game.paused = false; I.state.enabled = true;
    DZ.requestLock();
  }
  function toMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    I.state.enabled = false;
    UI.setHud(false);
    if (game) game.shopOpen = false;
    document.getElementById('shop').classList.add('hidden');
    newGame(); // fresh city behind the menu
    UI.renderMenuBest();
    UI.clearStack(); UI.show('screen-menu');
  }

  I.onLockChange = (locked) => {
    if (!locked && game && game.mode === 'playing' && !game.paused && !game.shopOpen && !I.state.fallback) pause();
  };
  I.onLockError = () => { UI.toast('Pointer lock unavailable — using fallback mouse look'); };

  renderer.domElement.addEventListener('mousedown', () => {
    if (game && game.mode === 'playing' && !game.paused && !game.shopOpen && !I.state.locked) I.requestLock(renderer.domElement);
  });

  const actions = {
    play, resume,
    settings: () => UI.show('screen-settings'),
    controls: () => { UI.renderBinds(); UI.show('screen-controls'); },
    stats: () => { UI.renderStats(); UI.show('screen-stats'); },
    back: () => UI.back(),
    quit: toMenu,
    menu: toMenu,
    retry: () => { needsRebuild = true; play(); },
    'reset-binds': () => { DZ.resetKeys(); UI.renderBinds(); },
    'close-shop': () => UI.closeShop(),
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    DZ.Audio.init();
    const fn = actions[btn.dataset.action];
    if (fn) { e.preventDefault(); fn(); }
  });

  UI.bindSettings((key) => {
    if (key === 'preset' || key === 'renderScale') { applyResolution(); if (key === 'preset') needsRebuild = true; }
    if (key === 'preset') {
      document.getElementById('preset-note').textContent = game && game.mode === 'playing'
        ? 'Resolution applied now. Shadows, lights and particles apply on your next deploy.'
        : 'Applied.';
      if (game && game.mode === 'menu') newGame();
    }
    if (key === 'fov' && game) { game.camera.fov = DZ.settings.fov; game.camera.updateProjectionMatrix(); }
    if (key === 'volume') DZ.Audio.setVolume(DZ.settings.volume);
    if (key === 'music') DZ.Audio.setMusic(DZ.settings.music);
  });

  window.addEventListener('resize', applyResolution);

  // Keyboard shortcuts outside of the pointer-locked game.
  window.addEventListener('keydown', (e) => {
    if (I.state.rebinding) return;
    if (!game) return;
    if (game.shopOpen && (e.code === 'Escape' || e.code === DZ.settings.keys.shop)) { e.preventDefault(); UI.closeShop(); return; }
    if (game.mode === 'playing' && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (game.paused) { if (UI.stack[UI.stack.length - 1] === 'screen-pause') resume(); else UI.back(); }
      else pause();
    }
  });

  // Main loop.
  let last = performance.now(), acc = 0, frames = 0, fps = 0, fpsT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const limit = DZ.settings.fpsLimit;
    const elapsed = now - last;
    if (limit && elapsed < 1000 / limit - 1) return;
    last = now;
    const dt = Math.min(0.05, elapsed / 1000);
    frames++; fpsT += elapsed;
    if (fpsT >= 500) { fps = Math.round((frames * 1000) / fpsT); frames = 0; fpsT = 0; }
    if (!game) return;
    if (game.mode === 'menu') game.updateMenu(dt);
    else if (game.mode === 'playing' && !game.paused) {
      game.update(dt);
      UI.update(game, dt, fps);
    }
    I.endFrame();
    renderer.render(game.scene, game.camera);
  }

  // Boot.
  try {
    newGame();
    UI.renderMenuBest();
    UI.show('screen-menu');
    document.getElementById('loading').classList.add('done');
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    document.getElementById('loading-text').textContent = 'Failed to start: ' + err.message;
  }
})();
