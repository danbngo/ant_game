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

  // Strategy-toggle cooldowns: patrol / honey raid / bee hating can each only be
  // flipped once every COOLDOWN_MS. Values are the performance.now() timestamp
  // at which the toggle becomes available again.
  const COOLDOWN_MS = 10000;
  const cooldownUntil = { patrol: 0, honey: 0, bully: 0 };
  function cooldownLeft(name) {
    const ms = cooldownUntil[name] - performance.now();
    return ms > 0 ? ms : 0;
  }
  function startCooldown(name) { cooldownUntil[name] = performance.now() + COOLDOWN_MS; }

  function fitCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  fitCanvas();

  // --- Level construction --------------------------------------------------

  // The team color the player picked on the team-select screen.
  let selectedTint = DEFAULT_TINT;

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

    // Apply the chosen team color: give the player their pick, and if an enemy
    // already used that color, swap colors so every colony stays distinct.
    const tintOf = new Map(def.nests.map((n) => [n, n.tint]));
    if (selectedTint && selectedTint !== player.tint) {
      for (const n of def.nests) {
        if (n !== player && tintOf.get(n) === selectedTint) tintOf.set(n, player.tint);
      }
      tintOf.set(player, selectedTint);
    }

    for (const n of def.nests) {
      grid.carveChamber(n.cx, n.cy, 5);
      if (n !== player) grid.carveTunnel(player.cx, player.cy, n.cx, n.cy);
    }

    for (const n of def.nests) {
      const colony = w.addColony(new Colony(n.id, tintOf.get(n), n === player));
      colony.setQueen(n.cx - 1, n.cy - 1);

      // A dedicated egg room: its own chamber, off to the side of the nest,
      // where all eggs are laid. Placed below the nest (or above if no room).
      const roomY = (n.cy + 9 <= def.rows - 4) ? n.cy + 9 : n.cy - 9;
      grid.carveChamber(n.cx, roomY, 3);
      grid.carveTunnel(n.cx, n.cy, n.cx, roomY);
      colony.eggRoom = { x: n.cx, y: roomY };

      const queenTiles = new Set([
        (n.cx - 1) + ',' + (n.cy - 1), n.cx + ',' + (n.cy - 1),
        (n.cx - 1) + ',' + n.cy, n.cx + ',' + n.cy,
      ]);
      const free = (s) => !queenTiles.has(s.x + ',' + s.y);

      // Starting eggs go in the egg room.
      const eggSpots = ringSpots(grid, colony.eggRoom.x, colony.eggRoom.y, n.eggs, 2);
      for (const s of eggSpots) colony.addEgg(s.x, s.y);

      const workerSpots = ringSpots(grid, n.cx, n.cy, n.workers, 4)
        .filter(free)
        .filter((s) => !eggSpots.some((e) => e.x === s.x && e.y === s.y));
      // Guarantee the key castes, then fill with a random mix.
      const guaranteed = [
        CONFIG.ANT_NURSERY, CONFIG.ANT_BUILDER, CONFIG.ANT_WARRIOR, CONFIG.ANT_FORAGER,
        CONFIG.ANT_CARETAKER, CONFIG.ANT_BEEHATER, CONFIG.ANT_BEEWARRIOR,
        CONFIG.ANT_FOODCOLLECTOR, CONFIG.ANT_RENTER,
      ];
      workerSpots.forEach((s, i) => {
        const caste = i < guaranteed.length ? guaranteed[i] : randomCaste();
        colony.addAnt(caste, s.x, s.y);
      });

      // Three elite guards spawn at the start (never from eggs) to ring the
      // queen. They sit tight on the inner ring so they're right beside her.
      const guardSpots = ringSpots(grid, n.cx, n.cy, 3, 2).filter(free);
      for (const s of guardSpots) colony.addAnt(CONFIG.ANT_GUARD, s.x, s.y);

      // Vincant: exactly one, only on the player's team, never from an egg.
      if (n === player) {
        const vs = ringSpots(grid, n.cx, n.cy, 1, 3).filter(free)[0] || { x: n.cx, y: n.cy };
        colony.addAnt(CONFIG.ANT_VINCANT, vs.x, vs.y);
      }
    }

    // Build the surface and wire up entrances. Only the bottom "ground band" is
    // walkable; the sky rows above stay solid (dirt) so they act as an invisible
    // ceiling — ants can't wander up off the grass into the open air.
    const surface = new Grid(def.cols, CONFIG.SURFACE_ROWS);
    const skyFloor = CONFIG.SURFACE_ROWS - CONFIG.SURFACE_GROUND_BAND;
    for (let y = skyFloor; y < surface.rows; y++) {
      for (let x = 0; x < surface.cols; x++) surface.set(x, y, CONFIG.TILE_TUNNEL);
    }
    // Cut an ocean into the surface with an island + bridge beyond it.
    w.buildOceanAndIsland(surface);
    w.setupAreas(surface);

    // Neutral wildlife that roams the surface.
    const wild = w.addColony(new Colony('wild', 'black', false));
    wild.isWild = true;
    w.wild = wild;
    w.spawnCritters(CONFIG.CRITTER_COUNT);
    // A tree rooted in the ground band, with the hive hanging low where ants roam.
    w.spawnHive(Math.floor(def.cols * 0.3), CONFIG.SURFACE_ROWS - 9);

    w.seedFood(def.food || 25);
    return w;
  }

  // Set up cameras + input for the current `world`, then start playing.
  function enterWorld(initialView) {
    const cols = world.grid.cols;
    const rows = world.grid.rows;
    const sRows = world.surface ? world.surface.rows : CONFIG.SURFACE_ROWS;
    cameraUnder = new Camera(canvas.width, canvas.height, cols * T, rows * T);
    cameraUnder.x = world.player.home.x * T;
    cameraUnder.y = world.player.home.y * T;
    cameraOutside = new Camera(canvas.width, canvas.height, cols * T, sRows * T);
    cameraOutside.x = world.player.home.x * T;
    // Focus on the ground band (where the action is); tall sky sits above.
    cameraOutside.y = (sRows - CONFIG.SURFACE_GROUND_BAND / 2) * T;

    view = initialView || 'under';
    camera = view === 'under' ? cameraUnder : cameraOutside;
    cooldownUntil.patrol = cooldownUntil.honey = cooldownUntil.bully = 0; // fresh level, no cooldowns
    selection.clear();
    const grid = view === 'under' ? world.grid : world.surface;
    if (!input) input = new InputController(canvas, camera, world, selection);
    else { input.rebind(camera, world, selection); input.setView(view, camera, grid); }

    setLevelLabel('Level ' + (levelIndex + 1) + ': ' +
      (LEVELS[levelIndex] ? LEVELS[levelIndex].name : ''));
    updateViewButton();
    updatePatrolButton();
    updateHoneyButton();
    updateBullyButton();
    updateLoadButton();
    hideOverlays();
    document.body.classList.add('playing');
    state = 'playing';
    autoSaveTimer = 0;
    writeSave(); // snapshot the new state immediately
  }

  function startLevel(idx) {
    levelIndex = idx;
    world = buildLevel(LEVELS[idx]);
    enterWorld('under');
  }

  // --- Save / load ---------------------------------------------------------

  const SAVE_KEY = 'antfarm_save_v1';

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function writeSave() {
    if (!world) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(world, levelIndex, view)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function doSave() {
    if (state !== 'playing' || !world) return;
    flashSaveButton(writeSave() ? 'Saved!' : 'Save failed');
  }

  // Auto-save the game in progress so the last session is always loadable.
  let autoSaveTimer = 0;
  function autoSave(dt) {
    if (state !== 'playing' || !world) return;
    autoSaveTimer += dt;
    if (autoSaveTimer >= 10) { autoSaveTimer = 0; writeSave(); }
  }

  function doLoad() {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return false;
    const r = deserializeGame(JSON.parse(raw));
    world = r.world;
    levelIndex = r.levelIndex;
    enterWorld(r.view);
    return true;
  }

  let saveFlashTimer = null;
  function flashSaveButton(text) {
    const btn = document.getElementById('save-btn');
    if (!btn) return;
    btn.textContent = text;
    if (saveFlashTimer) clearTimeout(saveFlashTimer);
    saveFlashTimer = setTimeout(() => { btn.textContent = 'Save'; }, 1200);
  }

  function updateLoadButton() {
    const btn = document.getElementById('continue-btn');
    if (btn) btn.style.display = hasSave() ? 'inline-block' : 'none';
  }

  function toggleView() {
    if (state !== 'playing' || !world) return;
    if (typeof Sfx !== 'undefined') Sfx.play('click');
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

  // Render a cooldown-gated toggle button: shows its on/off label, appends a
  // "(Ns)" countdown and disables the button while it's cooling down.
  function renderToggleBtn(id, name, onLabel, offLabel, on) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const left = cooldownLeft(name);
    const base = on ? onLabel : offLabel;
    btn.textContent = left > 0 ? base + ' (' + Math.ceil(left / 1000) + 's)' : base;
    btn.disabled = left > 0;
    btn.classList.toggle('on', !!on);
    btn.classList.toggle('cooldown', left > 0);
  }

  function togglePatrol() {
    if (state !== 'playing' || !world || !world.player) return;
    if (cooldownLeft('patrol') > 0) return; // still cooling down
    world.player.patrol = !world.player.patrol;
    startCooldown('patrol');
    if (typeof Sfx !== 'undefined') Sfx.play('click');
    updatePatrolButton();
  }

  function updatePatrolButton() {
    const on = world && world.player && world.player.patrol;
    renderToggleBtn('patrol-btn', 'patrol', 'Warriors: Patrol', 'Warriors: Defend', on);
  }

  function toggleHoneyRaid() {
    if (state !== 'playing' || !world || !world.player) return;
    if (cooldownLeft('honey') > 0) return; // still cooling down
    world.player.honeyRaid = !world.player.honeyRaid;
    startCooldown('honey');
    if (typeof Sfx !== 'undefined') Sfx.play('click');
    updateHoneyButton();
  }

  function updateHoneyButton() {
    const on = world && world.player && world.player.honeyRaid;
    renderToggleBtn('honey-btn', 'honey', 'Honey Raid: ON', 'Collect Honey', on);
  }

  function toggleBullyBees() {
    if (state !== 'playing' || !world || !world.player) return;
    if (cooldownLeft('bully') > 0) return; // still cooling down
    world.player.bullyBees = !world.player.bullyBees;
    startCooldown('bully');
    if (typeof Sfx !== 'undefined') Sfx.play('click');
    updateBullyButton();
  }

  function updateBullyButton() {
    const on = world && world.player && world.player.bullyBees;
    renderToggleBtn('bully-btn', 'bully', 'Bee Hating: On', 'Bee Hating: Off', on);
  }

  // Refresh the cooldown countdowns each frame while any are active.
  function tickCooldowns() {
    updatePatrolButton();
    updateHoneyButton();
    updateBullyButton();
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
    const ts = document.getElementById('team-screen');
    if (ts) ts.style.display = 'none';
  }
  function showTitle() {
    state = 'title';
    world = null;
    document.body.classList.remove('playing');
    msgScreen.style.display = 'none';
    const ts = document.getElementById('team-screen');
    if (ts) ts.style.display = 'none';
    titleScreen.style.display = 'flex';
    updateLoadButton();
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

  // Team select: Play opens a screen of colored-ant team buttons; clicking one
  // sets the team you lead, then starts the game.
  const teamScreen = document.getElementById('team-screen');

  function showTeamScreen() {
    if (typeof Music !== 'undefined') Music.start();
    titleScreen.style.display = 'none';
    if (teamScreen) {
      teamScreen.style.display = 'flex';
      teamScreen.querySelectorAll('.team-btn').forEach((btn) => {
        const cv = btn.querySelector('canvas');
        if (cv) drawTeamAnt(cv, btn.dataset.tint);
      });
    }
  }

  // Draw a simple top-down ant (head up) in a team's color onto a small canvas.
  function drawTeamAnt(canvas, tintKey) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const tint = TINTS[tintKey] || TINTS[DEFAULT_TINT];
    const unit = h * 0.12;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2); // point the head upward
    ctx.strokeStyle = tint.leg;
    ctx.lineWidth = Math.max(2, unit * 0.45);
    ctx.lineCap = 'round';
    const legLen = unit * 2.3;
    for (let i = -1; i <= 1; i++) {
      const lx = i * unit * 0.9;
      ctx.beginPath(); ctx.moveTo(lx, -unit * 0.4); ctx.lineTo(lx + i * unit * 0.3, -unit * 0.4 - legLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, unit * 0.4); ctx.lineTo(lx + i * unit * 0.3, unit * 0.4 + legLen); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(unit * 1.8, -unit * 0.2); ctx.lineTo(unit * 2.8, -unit * 0.6);
    ctx.moveTo(unit * 1.8, unit * 0.2); ctx.lineTo(unit * 2.8, unit * 0.6);
    ctx.stroke();
    const seg = (x, r) => {
      ctx.fillStyle = tint.body;
      ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tint.light;
      ctx.beginPath(); ctx.arc(x - r * 0.25, -r * 0.25, r * 0.45, 0, Math.PI * 2); ctx.fill();
    };
    seg(-unit * 1.4, unit * 1.15); // abdomen
    seg(0, unit * 0.85);           // thorax
    seg(unit * 1.5, unit * 0.7);   // head
    ctx.restore();
  }

  document.getElementById('play-btn').addEventListener('click', showTeamScreen);

  if (teamScreen) {
    teamScreen.querySelectorAll('.team-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTint = btn.dataset.tint;
        teamScreen.style.display = 'none';
        startLevel(0);
      });
    });
  }
  msgBtn.addEventListener('click', () => { if (msgAction) msgAction(); });

  // Music on/off toggle.
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn && typeof Music !== 'undefined') {
    musicBtn.addEventListener('click', () => {
      const muted = Music.toggle();
      if (typeof Sfx !== 'undefined') Sfx.setMuted(muted); // one button mutes all audio
      musicBtn.innerHTML = muted ? '♫ Sound: Off' : '♫ Sound: On';
    });
  }

  // --- Win / lose ----------------------------------------------------------

  function checkEnd() {
    if (state !== 'playing') return;
    if (!world.player.queen) {
      if (typeof Sfx !== 'undefined') Sfx.play('lose');
      showMessage('Game Over', 'Your queen has fallen.', 'Retry Level',
        () => startLevel(levelIndex));
      return;
    }
    const enemiesRemain = world.colonies.some((c) => !c.isPlayer && c.queen);
    if (!enemiesRemain) {
      if (typeof Sfx !== 'undefined') Sfx.play('win');
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
    // Pause the whole simulation while the Index overlay is open.
    const idx = document.getElementById('index-screen');
    if (idx && idx.style.display === 'flex') return;

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
    autoSave(dt);
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

    // Mating hearts float over the queen.
    for (const h of world.hearts) renderer.drawHeart(h);

    // Speech bubbles (bee-haters ranting) on top of everything.
    for (const ant of world.allAnts()) {
      if (ant.area === 'under' && ant.speech) renderer.drawSpeech(ant);
    }
  }

  function drawSurface() {
    renderer.drawSurfaceGrid(world.surface);

    // The island's food generator, sitting on the grass beyond the ocean.
    if (world.foodGen) renderer.drawFoodGenerator(world.foodGen);
    // Smoke billowing up from its spout.
    for (const puff of world.smoke) renderer.drawSmoke(puff);

    // Entrance holes on the surface underside.
    for (const c of world.colonies) {
      if (c.entranceOut) renderer.drawHole(c.entranceOut.x, c.entranceOut.y);
    }

    for (const f of world.foods) if (!f.carrier && f.area === 'outside') renderer.drawFood(f);
    for (const ant of selection) if (ant.area === 'outside' && !ant.insideHive) renderer.drawSelectionRing(ant);
    // Draw every surface critter/ant except the bees, which are drawn after the
    // tree so they appear over the hive instead of behind the canopy.
    const isBeeKind = (a) => a.critter === CONFIG.CRITTER_BEE || a.critter === CONFIG.CRITTER_ARMORED_BEE ||
      a.critter === CONFIG.CRITTER_MAJOR_BEE;
    for (const ant of world.allAnts()) {
      if (ant.area !== 'outside') continue;
      if (ant.insideHive) continue; // Vincant tucked inside the hive on a visit
      if (isBeeKind(ant)) continue;
      if (ant.isCritter) renderer.drawCritter(ant);
      else renderer.drawAnt(ant);
    }

    // The tree + beehive, drawn after the bugs so its trunk and canopy
    // occlude any critters passing behind it instead of bugs floating over it.
    if (world.hive) renderer.drawTreeHive(world.hive.x, world.hive.y);

    // Bees last, so they swarm visibly over the hive and canopy.
    for (const ant of world.allAnts()) {
      if (ant.area !== 'outside') continue;
      if (ant.insideHive) continue; // depressed bee is tucked inside the hive
      if (isBeeKind(ant)) renderer.drawCritter(ant);
    }
    for (const ant of world.allAnts()) {
      if (ant.area !== 'outside') continue;
      if (ant.carriedFood) renderer.drawFood(ant.carriedFood);
    }
    // Vincant's glock rounds streaking out from the hive.
    for (const b of world.bullets) renderer.drawBullet(b);
    for (const ant of world.allAnts()) if (ant.area === 'outside' && !ant.insideHive) renderer.drawHpBar(ant);

    // Beena's reply when Vincant visits the hive.
    if (world.hive && world.hiveReply) renderer.drawHiveReply(world.hive, world.hiveReply);

    // Speech bubbles on top of everything.
    for (const ant of world.allAnts()) {
      if (ant.area === 'outside' && ant.speech) renderer.drawSpeech(ant);
    }
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
    if (state === 'playing') tickCooldowns();
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
  const honeyBtn = document.getElementById('honey-btn');
  if (honeyBtn) honeyBtn.addEventListener('click', toggleHoneyRaid);
  const bullyBtn = document.getElementById('bully-btn');
  if (bullyBtn) bullyBtn.addEventListener('click', toggleBullyBees);
  if (typeof HiveScene !== 'undefined') HiveScene.init();
  const hiveBtn = document.getElementById('hive-btn');
  if (hiveBtn) hiveBtn.addEventListener('click', () => {
    if (typeof Sfx !== 'undefined') Sfx.play('click');
    if (typeof HiveScene !== 'undefined') HiveScene.open();
  });
  const indexBtn = document.getElementById('index-btn');
  const indexScreen = document.getElementById('index-screen');
  if (indexBtn && indexScreen) indexBtn.addEventListener('click', () => { indexScreen.style.display = 'flex'; });
  const indexClose = document.getElementById('index-close-btn');
  if (indexClose && indexScreen) indexClose.addEventListener('click', () => { indexScreen.style.display = 'none'; });
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', doSave);
  const continueBtn = document.getElementById('continue-btn');
  if (continueBtn) continueBtn.addEventListener('click', () => {
    if (typeof Music !== 'undefined') Music.start();
    doLoad();
  });
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'v') toggleView();
    else if (k === 'p') togglePatrol();
    else if (k === 'h') toggleHoneyRaid();
    else if (k === 'b') toggleBullyBees();
  });

  window.addEventListener('resize', () => {
    fitCanvas();
    if (cameraUnder) cameraUnder.resize(canvas.width, canvas.height);
    if (cameraOutside) cameraOutside.resize(canvas.width, canvas.height);
  });

  // Persist the last game when leaving the page.
  window.addEventListener('beforeunload', () => { if (state === 'playing') writeSave(); });

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
