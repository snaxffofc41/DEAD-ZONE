/* DEAD ZONE — ui.js
 * Menus (main, settings, controls, statistics, pause, game over), supply shop,
 * and the in-game HUD: vitals, ammo, weapon slots, wave info, minimap, boss bar,
 * crosshair spread, hitmarkers, kill feed, toasts, banners and damage feedback. */
DZ.UI = (function () {
  const $ = (id) => document.getElementById(id);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let stack = [];
  let hudT = 0, mapT = 0;
  let mapBase = null;
  let game = null;

  function show(id, push = true) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (id) {
      $(id).classList.add('active');
      if (push && stack[stack.length - 1] !== id) stack.push(id);
      const first = $(id).querySelector('button, input, select');
      first && first.focus({ preventScroll: true });
    }
  }
  function back() {
    stack.pop();
    const prev = stack[stack.length - 1];
    show(prev || null, false);
  }
  function clearStack() { stack = []; }

  function setHud(visible) { $('hud').classList.toggle('hidden', !visible); }

  function banner(title, sub) {
    const b = $('banner');
    $('banner-title').textContent = title; $('banner-sub').textContent = sub || '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  function toast(text, kind = '') {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text;
    $('toasts').prepend(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
    while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
  }
  function achievement(a) { toast(`Achievement unlocked — ${a.name}`, 'ach'); DZ.Audio.waveClear(); }
  function killfeed(name, head, pts, combo) {
    const row = document.createElement('div'); row.className = 'kf-row';
    row.innerHTML = `<span class="kf-name"></span>${head ? '<span class="kf-head">HEADSHOT</span>' : ''}<span class="kf-pts">+${pts}</span>${combo > 1 ? `<span class="kf-combo">x${combo}</span>` : ''}`;
    row.querySelector('.kf-name').textContent = name;
    $('killfeed').prepend(row);
    setTimeout(() => row.classList.add('out'), 2500);
    setTimeout(() => row.remove(), 3000);
    while ($('killfeed').children.length > 5) $('killfeed').lastChild.remove();
  }
  function hitmarker(head, kill) {
    const h = $('hitmarker');
    h.className = ''; void h.offsetWidth;
    h.className = `show ${head ? 'head' : ''} ${kill ? 'kill' : ''}`;
  }

  /* ---------- Shop ---------- */
  function renderShop() {
    const list = $('shop-list'); list.innerHTML = '';
    $('shop-cash').textContent = `$${game.cash}`;
    DZ.SHOP.forEach((item) => {
      const avail = game.shopAvailable(item), cost = game.shopCost(item);
      const row = document.createElement('button');
      row.className = 'shop-item'; row.type = 'button';
      row.disabled = !avail || game.cash < cost;
      let name = item.name;
      if (item.id === 'upgrade') name = `Upgrade ${game.weapons.slot.def.name} (Lv ${game.weapons.slot.level}${avail ? ' → ' + (game.weapons.slot.level + 1) : ' MAX'})`;
      row.innerHTML = `<span class="si-main"><span class="si-name"></span><span class="si-desc"></span></span><span class="si-cost">${avail ? '$' + cost : (item.id.startsWith('unlock') ? 'OWNED' : 'MAX')}</span>`;
      row.querySelector('.si-name').textContent = name;
      row.querySelector('.si-desc').textContent = item.desc;
      row.addEventListener('click', () => { if (game.buy(item.id)) renderShop(); });
      list.appendChild(row);
    });
  }
  function openShop() {
    game.shopOpen = true; $('shop').classList.remove('hidden'); renderShop();
    DZ.Input.state.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('shop').querySelector('button:not([disabled])')?.focus();
  }
  function closeShop() {
    if (!game || !game.shopOpen) return;
    game.shopOpen = false; $('shop').classList.add('hidden');
    DZ.Input.state.enabled = true;
    DZ.requestLock && DZ.requestLock();
  }
  function toggleShop() { game.shopOpen ? closeShop() : openShop(); }

  /* ---------- Game over ---------- */
  function gameOver(r) {
    setHud(false);
    DZ.Input.state.enabled = false;
    if (game) { game.shopOpen = false; $('shop').classList.add('hidden'); }
    if (document.pointerLockElement) document.exitPointerLock();
    $('over-grid').innerHTML = [
      ['Wave reached', r.wave], ['Score', r.score.toLocaleString()], ['Kills', r.kills], ['Headshots', r.headshots],
      ['Accuracy', r.accuracy + '%'], ['Survivor level', r.level], ['Time survived', fmtTime(r.time)], ['Distance', r.distance + ' m'],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join('');
    $('over-best').textContent = r.newBest ? 'New personal best score' : `Best score: ${DZ.stats.bestScore.toLocaleString()}`;
    clearStack(); show('screen-over');
  }

  /* ---------- Statistics ---------- */
  function renderStats() {
    const s = DZ.stats;
    $('stats-grid').innerHTML = [
      ['Best wave', s.bestWave], ['Best score', s.bestScore.toLocaleString()], ['Total kills', s.totalKills],
      ['Headshot kills', s.headshots], ['Behemoths slain', s.bossKills], ['Runs played', s.games], ['Time played', fmtTime(s.timePlayed)],
    ].map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join('');
    $('ach-list').innerHTML = DZ.ACHIEVEMENTS.map((a) => {
      const got = s.keys && s.keys[a.id];
      return `<li class="${got ? 'got' : ''}"><strong>${a.name}</strong><span>${a.desc}</span><em>${got ? 'Unlocked' : 'Locked'}</em></li>`;
    }).join('');
  }
  function renderMenuBest() {
    $('menu-best').textContent = DZ.stats.games ? `Best: Wave ${DZ.stats.bestWave} · ${DZ.stats.bestScore.toLocaleString()} pts` : 'No runs recorded yet';
  }

  /* ---------- Controls ---------- */
  function renderBinds() {
    const list = $('bind-list'); list.innerHTML = '';
    DZ.ACTIONS.forEach(([id, label]) => {
      const row = document.createElement('div'); row.className = 'bind-row';
      const l = document.createElement('span'); l.textContent = label;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'key';
      b.textContent = DZ.Input.keyLabel(DZ.settings.keys[id]);
      b.setAttribute('aria-label', `Rebind ${label}, currently ${b.textContent}`);
      b.addEventListener('click', () => {
        b.textContent = 'Press a key…'; b.classList.add('listening');
        DZ.Input.state.rebinding = id;
        DZ.Input.state.onRebind = renderBinds;
      });
      row.append(l, b); list.appendChild(row);
    });
    [['Look', 'Mouse'], ['Fire', 'Left mouse'], ['Aim down sights', 'Right mouse'], ['Switch weapon', '1–4 / Wheel'], ['Pause', 'Esc / P']].forEach(([a, k]) => {
      const row = document.createElement('div'); row.className = 'bind-row fixed';
      row.innerHTML = `<span>${a}</span><span class="key static">${k}</span>`;
      list.appendChild(row);
    });
  }

  /* ---------- Settings ---------- */
  function bindSettings(onChange) {
    const st = DZ.settings;
    const ranges = [['set-scale', 'renderScale', (v) => Math.round(v * 100) + '%'], ['set-fov', 'fov', (v) => v + '°'], ['set-sens', 'sens', (v) => (+v).toFixed(2)], ['set-vol', 'volume', (v) => Math.round(v * 100) + '%'], ['set-music', 'music', (v) => Math.round(v * 100) + '%']];
    ranges.forEach(([id, key, fmt]) => {
      const el = $(id), out = document.querySelector(`output[for="${id}"]`);
      el.value = st[key]; out.textContent = fmt(st[key]);
      el.addEventListener('input', () => { st[key] = parseFloat(el.value); out.textContent = fmt(st[key]); DZ.saveSettings(); onChange(key); });
    });
    document.querySelectorAll('#set-preset button').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.preset === st.preset);
      b.addEventListener('click', () => {
        st.preset = b.dataset.preset; DZ.saveSettings();
        document.querySelectorAll('#set-preset button').forEach((x) => x.setAttribute('aria-pressed', x === b));
        onChange('preset');
      });
    });
    const fl = $('set-fpslimit'); fl.value = String(st.fpsLimit);
    fl.addEventListener('change', () => { st.fpsLimit = parseInt(fl.value, 10); DZ.saveSettings(); });
    [['set-weather', 'weather'], ['set-fps', 'showFps']].forEach(([id, key]) => {
      const el = $(id); el.checked = st[key];
      el.addEventListener('change', () => { st[key] = el.checked; DZ.saveSettings(); onChange(key); });
    });
  }

  /* ---------- HUD ---------- */
  function drawMinimapBase(world) {
    const c = document.createElement('canvas'); c.width = c.height = 320;
    const g = c.getContext('2d'); const H = DZ.MAP.half, k = 320 / (H * 2);
    g.fillStyle = 'rgba(8,12,18,0.9)'; g.fillRect(0, 0, 320, 320);
    g.fillStyle = 'rgba(70,80,92,0.35)';
    [-64, -32, 0, 32, 64].forEach((r) => { g.fillRect((r - 5 + H) * k, 0, 10 * k, 320); g.fillRect(0, (r - 5 + H) * k, 320, 10 * k); });
    world.buildingRects.forEach((b) => {
      g.fillStyle = `rgba(${110 + b.h},${120 + b.h},${135 + b.h},0.55)`;
      g.fillRect((b.x - b.w / 2 + H) * k, (b.z - b.d / 2 + H) * k, b.w * k, b.d * k);
    });
    g.strokeStyle = 'rgba(90,160,255,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 318, 318);
    mapBase = c;
  }
  function drawMinimap(gm) {
    const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width;
    const H = DZ.MAP.half, k = W / (H * 2);
    if (!mapBase) drawMinimapBase(gm.world);
    g.drawImage(mapBase, 0, 0, W, W);
    gm.crates.forEach((c) => { if (!c.opened) { g.fillStyle = '#4aa3ff'; g.fillRect((c.pos.x + H) * k - 3, (c.pos.z + H) * k - 3, 6, 6); } });
    gm.pickups.forEach((p) => { g.fillStyle = '#9fd0ff'; g.fillRect((p.group.position.x + H) * k - 1.5, (p.group.position.z + H) * k - 1.5, 3, 3); });
    gm.zombies.forEach((z) => {
      if (z.dead) return;
      const big = z.type === 'boss' ? 6 : z.type === 'tank' ? 4 : 2.4;
      g.fillStyle = z.type === 'boss' ? '#ff7a2a' : z.type === 'screamer' ? '#f0f0ff' : '#e5484d';
      g.beginPath(); g.arc((z.pos.x + H) * k, (z.pos.z + H) * k, big, 0, 7); g.fill();
    });
    const px = (gm.player.pos.x + H) * k, pz = (gm.player.pos.z + H) * k, yaw = gm.player.yaw;
    g.save(); g.translate(px, pz); g.rotate(-yaw);
    g.fillStyle = 'rgba(74,163,255,0.18)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }

  function update(gm, dt, fps) {
    const p = gm.player, w = gm.weapons, s = w.slot;
    // Every-frame elements.
    const spreadPx = 6 + (w.adsT > 0.6 ? 0 : (w.stat(s, 'spread') * 420) * (1 + Math.hypot(p.vel.x, p.vel.z) / 6) * (p.onGround ? 1 : 2)) + w.kick * 10;
    const ch = $('crosshair');
    ch.style.setProperty('--gap', spreadPx.toFixed(1) + 'px');
    ch.style.opacity = w.adsT > 0.6 || p.sprinting ? (s.def.id === 'awm' ? 0 : 0.25) : 1;
    $('scope').classList.toggle('on', w.scoped);
    $('hurt').style.opacity = (p.hurtFlash * 0.7).toFixed(2);
    $('vignette').style.opacity = (p.health < 40 ? (1 - p.health / 40) * 0.85 : 0).toFixed(2);
    const hd = $('hitdir');
    if (p.hitDirTime > 0) {
      const rel = p.lastHitDir - (p.yaw + Math.PI);
      hd.style.opacity = Math.min(1, p.hitDirTime).toFixed(2);
      hd.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
    } else hd.style.opacity = 0;
    const rw = $('reload-wrap');
    if (w.reloadT > 0) { rw.classList.add('on'); $('reload-fill').style.width = ((1 - w.reloadT / w.reloadDur) * 100).toFixed(1) + '%'; }
    else rw.classList.remove('on');

    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.08;

    $('hp-fill').style.width = (p.health / p.maxHealth * 100) + '%';
    $('hp-fill').classList.toggle('low', p.health < 35);
    $('hp-text').textContent = Math.ceil(p.health);
    $('ar-fill').style.width = (p.armor / p.maxArmor * 100) + '%';
    $('ar-text').textContent = Math.ceil(p.armor);
    $('st-fill').style.width = p.stamina + '%';
    $('st-fill').classList.toggle('locked', p.staminaLock > 0);
    $('inv-med').textContent = p.medkits;
    $('inv-gren').textContent = w.grenades;
    $('inv-light').textContent = p.flashlightOn ? 'ON' : 'OFF';

    $('w-name').textContent = s.def.name;
    $('w-type').textContent = `${s.def.type} · ${s.def.auto ? 'AUTO' : s.def.pellets > 1 ? 'PUMP' : s.def.id === 'awm' ? 'BOLT' : 'SEMI'}`;
    $('w-level').textContent = 'Lv ' + s.level;
    $('w-mag').textContent = s.mag;
    $('w-mag').classList.toggle('low', s.mag <= Math.ceil(w.stat(s, 'mag') * 0.25));
    $('w-res').textContent = s.reserve;
    $('w-slots').innerHTML = w.slots.map((sl, i) => `<span class="slot ${i === w.current ? 'cur' : ''} ${sl.unlocked ? '' : 'locked'}"><b>${i + 1}</b>${sl.unlocked ? sl.def.name : 'LOCKED'}</span>`).join('');

    $('h-score').textContent = gm.score.toLocaleString();
    $('h-cash').textContent = '$' + gm.cash.toLocaleString();
    $('h-level').textContent = 'LV ' + gm.level;
    $('h-xp-fill').style.width = ((gm.xp / (gm.xpNeed || 1500)) * 100) + '%';
    if (gm.phase === 'wave') {
      $('h-wave').textContent = `WAVE ${gm.wave}`;
      $('h-sub').textContent = `${gm.remaining} infected remaining`;
      $('h-obj').textContent = gm.boss ? 'Kill the Behemoth' : 'Survive the horde';
    } else {
      $('h-wave').textContent = gm.wave === 0 ? 'PREPARE' : 'INTERMISSION';
      $('h-sub').textContent = `Next wave in ${Math.ceil(gm.phaseT)}s`;
      $('h-obj').textContent = `Scavenge crates · [${DZ.Input.keyLabel(DZ.settings.keys.shop)}] Supply shop`;
    }
    $('h-env').textContent = `${gm.env.clock} · ${gm.env.label}${gm.env.isNight ? ' · Infected more aggressive' : ''}`;

    const boss = gm.boss && !gm.boss.dead ? gm.boss : null;
    $('boss').classList.toggle('hidden', !boss);
    if (boss) $('boss-fill').style.width = (Math.max(0, boss.hp) / boss.maxHp * 100) + '%';

    const prompt = $('prompt');
    if (gm.nearCrate) { prompt.textContent = `[${DZ.Input.keyLabel(DZ.settings.keys.interact)}] Search supply crate`; prompt.classList.add('on'); }
    else if (s.mag === 0 && s.reserve === 0) { prompt.textContent = 'Out of ammo — switch weapons or find supplies'; prompt.classList.add('on'); }
    else if (s.mag === 0) { prompt.textContent = `[${DZ.Input.keyLabel(DZ.settings.keys.reload)}] Reload`; prompt.classList.add('on'); }
    else prompt.classList.remove('on');

    $('perf').classList.toggle('hidden', !DZ.settings.showFps);
    if (DZ.settings.showFps) {
      const info = gm.renderer.info.render;
      $('perf').textContent = `${fps} FPS · ${info.calls} draws · ${gm.zombies.length} infected · ${DZ.PRESETS[DZ.settings.preset].label}`;
    }
    $('look-hint').classList.toggle('hidden', !DZ.Input.state.fallback);

    mapT -= 0.08;
    if (mapT <= 0) { drawMinimap(gm); mapT = 0.12; }
    if (gm.shopOpen) $('shop-cash').textContent = `$${gm.cash}`;
  }

  return {
    show, back, clearStack, setHud, banner, toast, achievement, killfeed, hitmarker,
    openShop, closeShop, toggleShop, gameOver, renderStats, renderBinds, renderMenuBest, bindSettings, update,
    setGame(g) { game = g; mapBase = null; },
    get stack() { return stack; },
  };
})();
