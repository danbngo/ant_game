// Entry point: title screen + level progression. Builds a fresh world per
// level, runs the sim while playing, and shows win/lose overlays.

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const renderer = new Renderer(ctx);
  const T = CONFIG.TILE;

  // Mutable game state (reassigned each level).
  let world = null;
  let camera = null;        // the active camera (under or outside)
  let cameraUnder = null;
  let cameraOutside = null;
  let view = 'under';       // which area is on screen
  let levelIndex = 0;
  let state = 'title'; // 'title' | 'playing' | 'message'
  const selection = new Set();
  let input = null;

  function fitCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  fitCanvas();

  // --- Level construction --------------------------------------------------

  function ringSpots(grid, cx, cy, count, radius) {
    const spots = [];
    for (let r = 1; r <= radius && spots.length < count; r++) {
      for (let a = 0; a < 8 * r && spots.length < count; a++) {
        const ang = (a / (8 * r)) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(ang) * r);
        const y = Math.round(cy + Math.sin(ang) * r);
        if (grid.isTunnel(x, y) && !spots.some((s) => s.x === x && s.y === y)) {
          spots.push({ x, y });
        }
      }
    }
    return spots;
  }

  function buildLevel(def) {
    const grid = new Grid(def.cols, def.rows);
    const w = new World(grid);
    const player = def.nests[0];

    for (const n of def.nests) {
      grid.carveChamber(n.cx, n.cy, 5);
      if (n !== player) grid.carveTunnel(player.cx, player.cy, n.cx, n.cy);
    }

    for (const n of def.nests) {
      const colony = w.addColony(new Colony(n.id, n.tint, n === player));
      colony.setQueen(n.cx - 1, n.cy - 1);

      const queenTiles = new Set([
        (n.cx - 1) + ',' + (n.cy - 1), n.cx + ',' + (n.cy - 1),
        (n.cx - 1) + ',' + n.cy, n.cx + ',' + n.cy,
      ]);
      const free = (s) => !queenTiles.has(s.x + ',' + s.y);

      const eggSpots = ringSpots(grid, n.cx, n.cy, n.eggs, 3).filter(free);
      for (const s of eggSpots) colony.addEgg(s.x, s.y);

      const workerSpots = ringSpots(grid, n.cx, n.cy, n.workers, 4)
        .filter(free)
        .filter((s) => !eggSpots.some((e) => e.x === s.x && e.y === s.y));
      // Guarantee the key castes, then fill with a random mix.
      const guaranteed = [
        CONFIG.ANT_NURSERY, CONFIG.ANT_BUILDER, CONFIG.ANT_WARRIOR, CONFIG.ANT_FORAGER,
      ];
      workerSpots.forEach((s, i) => {
        const caste = i < guaranteed.length ? guaranteed[i] : randomCaste();
        colony.addAnt(caste, s.x, s.y);
      });
    }

    // Build the open-air surface (all open ground) and wire up entrances.
    const surface = new Grid(def.cols, CONFIG.SURFACE_ROWS);
    for (let y = 0; y < surface.rows; y++) {
      for (let x = 0; x < surface.cols; x++) surface.set(x, y, CONFIG.TILE_TUNNEL);
    }
    w.setupAreas(surface);

    // Neutral wildlife that roams the surface.
    const wild = w.addColony(new Colony('wild', 'black', false));
    wild.isWild = true;
    w.wild = wild;
    w.spawnCritters(CONFIG.CRITTER_COUNT);

    w.seedFood(def.food || 25);
    return w;
  }

  function startLevel(idx) {
    levelIndex = idx;
    const def = LEVELS[idx];
    world = buildLevel(def);

    cameraUnder = new Camera(canvas.width, canvas.height, def.cols * T, def.rows * T);
    cameraUnder.x = world.player.home.x * T;
    cameraUnder.y = world.player.home.y * T;
    cameraOutside = new Camera(canvas.width, canvas.height, def.cols * T, CONFIG.SURFACE_ROWS * T);
    cameraOutside.x = world.player.home.x * T;
    cameraOutside.y = (CONFIG.SURFACE_ROWS - 2) * T;

    view = 'under';
    camera = cameraUnder;
    selection.clear();
    if (!input) input = new InputController(canvas, camera, world, selection);
    else input.rebind(camera, world, selection);

    setLevelLabel('Level ' + (idx + 1) + ': ' + def.name);
    updateViewButton();
    updatePatrolButton();
    hideOverlays();
    document.body.classList.add('playing');
    state = 'playing';
  }

  function toggleView() {
    if (state !== 'playing' || !world) return;
    view = view === 'under' ? 'outside' : 'under';
    camera = view === 'under' ? cameraUnder : cameraOutside;
    const grid = view === 'under' ? world.grid : world.surface;
    input.setView(view, camera, grid);
    selection.clear(); // selection is per-area
    updateViewButton();
  }

  function updateViewButton() {
    const btn = document.getElementById('view-btn');
    if (btn) btn.textContent = view === 'under' ? 'View: Underground' : 'View: Surface';
  }

  function togglePatrol() {
    if (state !== 'playing' || !world || !world.player) return;
    world.player.patrol = !world.player.patrol;
    updatePatrolButton();
  }

  function updatePatrolButton() {
    const btn = document.getElementById('patrol-btn');
    if (!btn) return;
    const on = world && world.player && world.player.patrol;
    btn.textContent = on ? 'Warriors: Patrol' : 'Warriors: Defend';
    btn.classList.toggle('on', !!on);
  }

  // --- Overlays ------------------------------------------------------------

  const titleScreen = document.getElementById('title-screen');
  const msgScreen = document.getElementById('message-screen');
  const msgTitle = document.getElementById('message-title');
  const msgSub = document.getElementById('message-sub');
  const msgBtn = document.getElementById('message-btn');
  const levelLabel = document.getElementById('level-label');
  let msgAction = null;

  function setLevelLabel(text) { if (levelLabel) levelLabel.textContent = text; }
  function hideOverlays() {
    titleScreen.style.display = 'none';
    msgScreen.style.display = 'none';
  }
  function showTitle() {
    state = 'title';
    world = null;
    document.body.classList.remove('playing');
    msgScreen.style.display = 'none';
    titleScreen.style.display = 'flex';
  }
  function showMessage(title, sub, btnLabel, action) {
    state = 'message';
    document.body.classList.remove('playing');
    msgTitle.textContent = title;
    msgSub.textContent = sub;
    msgBtn.textContent = btnLabel;
    msgAction = action;
    msgScreen.style.display = 'flex';
  }

  document.getElementById('play-btn').addEventListener('click', () => startLevel(0));
  msgBtn.addEventListener('click', () => { if (msgAction) msgAction(); });

  // --- Win / lose ----------------------------------------------------------

  function checkEnd() {
    if (state !== 'playing') return;
    if (!world.player.queen) {
      showMessage('Game Over', 'Your queen has fallen.', 'Retry Level',
        () => startLevel(levelIndex));
      return;
    }
    const enemiesRemain = world.colonies.some((c) => !c.isPlayer && c.queen);
    if (!enemiesRemain) {
      if (levelIndex + 1 < LEVELS.length) {
        showMessage('Level Complete!', 'You crushed the rival colonies.', 'Next Level',
          () => startLevel(levelIndex + 1));
      } else {
        showMessage('Victory!', 'You conquered every colony. The hive is yours.', 'Back to Title',
          () => showTitle());
      }
    }
  }

  // --- Loop ----------------------------------------------------------------

  const PAN_SPEED = 850;

  function update(dt) {
    if (state !== 'playing' || !world) return;

    const pan = input.getPanVector();
    if (pan.dx !== 0 || pan.dy !== 0) {
      const len = Math.hypot(pan.dx, pan.dy) || 1;
      camera.x += ((pan.dx / len) * PAN_SPEED * dt) / camera.zoom;
      camera.y += ((pan.dy / len) * PAN_SPEED * dt) / camera.zoom;
      camera.x = clamp(camera.x, 0, camera.worldW);
      camera.y = clamp(camera.y, 0, camera.worldH);
    }

    const { dx, dy } = input.getMoveVector();
    if ((dx !== 0 || dy !== 0) && selection.size) {
      const g = view === 'under' ? world.grid : world.surface;
      for (const ant of selection) {
        ant.order = null;
        ant.stepDir(dx, dy, g);
      }
    }

    world.update(dt);
    for (const ant of [...selection]) if (ant.hp <= 0) selection.delete(ant);
    checkEnd();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!world || !camera) return;
    camera.apply(ctx);

    if (view === 'under') drawUnderground();
    else drawSurface();

    if (input && input.dragBox) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderer.drawDragBox(input.dragBox);
    }
  }

  function drawUnderground() {
    renderer.drawGrid(world.grid);

    // Entrance holes at the top of each opened shaft.
    for (const c of world.colonies) {
      if (c.surfaceOpen && c.entranceUnder) renderer.drawHole(c.entranceUnder.x, c.entranceUnder.y);
    }

    for (const c of world.colonies) {
      for (const egg of c.eggs) if (!egg.carrier) renderer.drawEgg(egg);
    }
    for (const ant of selection) if (ant.area === 'under') renderer.drawSelectionRing(ant);
    for (const c of world.colonies) {
      for (const w of c.workers) if (w.hp > 0 && w.area === 'under') renderer.drawAnt(w);
    }
    for (const c of world.colonies) {
      if (c.queen && c.queen.hp > 0 && c.queen.area === 'under') renderer.drawAnt(c.queen);
    }
    for (const ant of world.allAnts()) {
      if (ant.area !== 'under') continue;
      if (ant.carrying) renderer.drawEgg(ant.carrying);
      if (ant.carriedFood) renderer.drawFood(ant.carriedFood);
    }
    for (const ant of world.allAnts()) if (ant.area === 'under') renderer.drawHpBar(ant);
  }

  function drawSurface() {
    renderer.drawSurfaceGrid(world.surface);

    // Entrance holes on the surface underside.
    for (const c of world.colonies) {
      if (c.entranceOut) renderer.drawHole(c.entranceOut.x, c.entranceOut.y);
    }

    for (const f of world.foods) if (!f.carrier && f.area === 'outside') renderer.drawFood(f);
    for (const ant of selection) if (ant.area === 'outside') renderer.drawSelectionRing(ant);
    for (const ant of world.allAnts()) {
      if (ant.area !== 'outside') continue;
      if (ant.isCritter) renderer.drawCritter(ant);
      else renderer.drawAnt(ant);
    }
    for (const ant of world.allAnts()) {
      if (ant.area !== 'outside') continue;
      if (ant.carriedFood) renderer.drawFood(ant.carriedFood);
    }
    for (const ant of world.allAnts()) if (ant.area === 'outside') renderer.drawHpBar(ant);
  }

  // --- Food HUD ------------------------------------------------------------

  const FOOD_BAR_MAX = 30;
  const foodFill = document.getElementById('food-fill');
  const foodCount = document.getElementById('food-count');

  function updateHud() {
    if (!world || !world.player) return;
    let total = 0;
    for (const a of world.player.allAnts()) {
      total += a.food || 0;
      if (a.carriedFood) total += 1;
    }
    total = Math.round(total);
    if (foodCount) foodCount.textContent = total;
    if (foodFill) foodFill.style.width = Math.min(100, (total / FOOD_BAR_MAX) * 100) + '%';
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- Camera controls -----------------------------------------------------

  const ZOOM_STEP = 1.15;

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!camera) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    },
    { passive: false }
  );

  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  if (btnIn) btnIn.addEventListener('click', () => { if (camera) camera.zoomCenter(ZOOM_STEP); });
  if (btnOut) btnOut.addEventListener('click', () => { if (camera) camera.zoomCenter(1 / ZOOM_STEP); });

  for (const btn of document.querySelectorAll('#pan-controls button')) {
    const dir = btn.dataset.pan;
    const press = (e) => { e.preventDefault(); if (input) input.panButtons.add(dir); };
    const release = (e) => { e.preventDefault(); if (input) input.panButtons.delete(dir); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  }

  // View toggle: button + 'v' key. Patrol toggle: button + 'p' key.
  const viewBtn = document.getElementById('view-btn');
  if (viewBtn) viewBtn.addEventListener('click', toggleView);
  const patrolBtn = document.getElementById('patrol-btn');
  if (patrolBtn) patrolBtn.addEventListener('click', togglePatrol);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'v') toggleView();
    else if (k === 'p') togglePatrol();
  });

  window.addEventListener('resize', () => {
    fitCanvas();
    if (cameraUnder) cameraUnder.resize(canvas.width, canvas.height);
    if (cameraOutside) cameraOutside.resize(canvas.width, canvas.height);
  });

  // Start on the title screen.
  showTitle();

  // Expose for console tinkering.
  window.AntFarm = {
    get world() { return world; },
    get camera() { return camera; },
    selection,
    startLevel,
    LEVELS,
  };
})();
