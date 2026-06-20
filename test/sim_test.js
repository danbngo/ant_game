// Headless sanity test for the pure simulation files (no DOM needed).
// Run: node test/sim_test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const sandbox = { Math, console };
sandbox.global = sandbox;
vm.createContext(sandbox);

// Concatenate so all top-level class/const declarations share one lexical
// scope, then export the symbols we need onto the sandbox.
let src = '';
for (const f of ['config', 'levels', 'grid', 'pathfind', 'entities', 'colony', 'world', 'save']) {
  src += fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8') + '\n';
}
src += 'Object.assign(global, { Grid, World, Colony, Food, CONFIG, LEVELS, findPath, serializeGame, deserializeGame });\n';
vm.runInContext(src, sandbox, { filename: 'bundle.js' });

const { Grid, World, Colony, Food, CONFIG, LEVELS, serializeGame, deserializeGame } = sandbox;
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  - ' + name); }
  else { fail++; console.log('  FAIL- ' + name); }
}

function makeWorld() {
  const grid = new Grid(30, 20);
  grid.carveChamber(8, 10, 5);   // player nest
  grid.carveChamber(22, 10, 5);  // enemy nest
  grid.carveTunnel(8, 10, 22, 10);
  const world = new World(grid);
  const player = world.addColony(new Colony('player', 'darkRed', true));
  const enemy = world.addColony(new Colony('enemy', 'black', false));
  player.setQueen(7, 9);   // 2x2 home for the player
  enemy.setQueen(21, 9);
  // Open-air surface (all open ground).
  const surface = new Grid(30, CONFIG.SURFACE_ROWS);
  for (let y = 0; y < surface.rows; y++) {
    for (let x = 0; x < surface.cols; x++) surface.set(x, y, CONFIG.TILE_TUNNEL);
  }
  world.setupAreas(surface);
  const wild = world.addColony(new Colony('wild', 'black', false));
  wild.isWild = true;
  world.wild = wild;
  world.run = (seconds, dt = 1 / 60) => {
    for (let i = 0; i < seconds / dt; i++) world.update(dt);
  };
  return { grid, surface, world, player, enemy, wild };
}

// Carve a colony's vertical shaft clear and mark its surface exit open.
function openShaft(grid, colony) {
  const x = colony.shaftX;
  for (let y = 0; y <= colony.home.y; y++) grid.set(x, y, CONFIG.TILE_TUNNEL);
  colony.surfaceOpen = true;
  colony.entranceUnder = { x, y: 0 };
}

function countWalls(grid) {
  let n = 0;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) if (grid.get(x, y) === CONFIG.TILE_WALL) n++;
  }
  return n;
}

// --- Pathfinding -----------------------------------------------------------
{
  const { grid } = makeWorld();
  const p = sandbox.findPath(grid, 8, 10, 22, 10, 1);
  check('path exists between nests', Array.isArray(p) && p.length > 1);
}

// --- Diagonal tunnels are wide enough to traverse --------------------------
{
  const grid = new Grid(30, 30);
  grid.carveChamber(4, 4, 3);
  grid.carveChamber(24, 24, 3);
  grid.carveTunnel(4, 4, 24, 24); // a long diagonal corridor
  const wPath = sandbox.findPath(grid, 4, 4, 24, 24, 1);
  check('worker can path through a diagonal tunnel', Array.isArray(wPath) && wPath.length > 1);
  const qPath = sandbox.findPath(grid, 4, 4, 23, 23, 2);
  check('2x2 queen can path through a diagonal tunnel', Array.isArray(qPath) && qPath.length > 1);
}

// --- Looting (no enemy guards, so hero survives the round trip) -------------
{
  const { world, player, enemy } = makeWorld();
  const hero = player.addWorker(8, 10);
  const egg = enemy.addEgg(22, 10);
  hero.order = { type: 'loot', egg };
  world.run(18); // enough to grab it and carry it home, before it can hatch
  check('egg removed from enemy colony', enemy.eggs.indexOf(egg) === -1);
  check('egg now owned by player', egg.faction === 'player' && egg.colony === player);
  check('egg is in player eggs list', player.eggs.indexOf(egg) !== -1);
  check('hero delivered & no longer carrying', hero.carrying === null);
}

// --- Digging ---------------------------------------------------------------
{
  const { grid, world, player } = makeWorld();
  const hero = player.addWorker(8, 10);
  const dirt = { x: 8, y: 4 }; // outside the radius-5 chamber = dirt
  check('target starts as dirt', !grid.isTunnel(dirt.x, dirt.y));
  hero.order = { type: 'dig', tx: dirt.x, ty: dirt.y };
  world.run(6);
  check('dirt tile became tunnel', grid.isTunnel(dirt.x, dirt.y));
}

// --- Combat ----------------------------------------------------------------
{
  const { world, player, enemy } = makeWorld();
  const hero = player.addWorker(14, 10);   // out in the neutral tunnel
  const foe = enemy.addWorker(15, 10);
  const beforeHp = foe.hp;
  hero.order = { type: 'attack', target: foe };
  world.run(1.5);
  check('enemy worker took damage', foe.hp < beforeHp);
  world.run(30);
  check('enemy worker eventually died & was removed', enemy.workers.indexOf(foe) === -1);
}

// --- Egg hatching (only when tended) ---------------------------------------
{
  const { world, player } = makeWorld();
  player.addWorker(6, 10);          // a nurse right next to the egg
  const before = player.workers.length;
  const egg = player.addEgg(6, 11, CONFIG.ANT_WORKER);
  world.run(CONFIG.EGG_HATCH_TIME + 5);
  check('tended egg hatched (removed from eggs)', player.eggs.indexOf(egg) === -1);
  check('hatching produced a new worker', player.workers.length > before);
}

// --- Warrior caste: stats, egg, and hatch ----------------------------------
{
  const { player } = makeWorld();
  const w = player.addWorker(5, 10);
  const k = player.addWarrior(6, 10);
  check('warrior has more HP than a worker', k.maxHp > w.maxHp);
  check('warrior deals more damage', k.damage > w.damage);
  check('warrior reduces incoming damage', k.defense > 0 && w.defense === 0);
}
{
  const { world, player } = makeWorld();
  player.addWorker(6, 10); // nurse
  const egg = player.addEgg(6, 11, CONFIG.ANT_WARRIOR);
  check('warrior egg is bigger conceptually', egg.caste === CONFIG.ANT_WARRIOR);
  world.run(CONFIG.EGG_HATCH_TIME + 5);
  const hatchedWarrior = player.workers.some((a) => a.isWarrior);
  check('warrior egg hatched a warrior', player.eggs.indexOf(egg) === -1 && hatchedWarrior);
}

// --- An egg with no ant nearby will NOT hatch ------------------------------
{
  const { world, player } = makeWorld();
  const egg = player.addEgg(15, 10); // out in the tunnel, far from any ant
  world.run(CONFIG.EGG_HATCH_TIME + 10);
  check('lonely egg did not hatch', player.eggs.indexOf(egg) !== -1);
  check('lonely egg made no progress', egg.age === 0);
}

// --- Egg tending changes state --------------------------------------------
{
  const { world, player } = makeWorld();
  // Place an egg far from the queen so nobody tends it...
  const lonely = player.addEgg(13, 10);
  world.update(1 / 60);
  check('untended egg is not tended', lonely.tended === false);
  // ...and one right next to a worker.
  player.addWorker(11, 10);
  const cozy = player.addEgg(11, 11);
  world.update(1 / 60);
  check('egg near a same-color ant is tended', cozy.tended === true);
}

// --- Food: spawns over time ------------------------------------------------
{
  const { world } = makeWorld();
  const before = world.foods.length;
  world.run(CONFIG.FOOD_SPAWN_INTERVAL * 3 + 1);
  check('food spawns over time', world.foods.length > before);
}

// --- Food respawns / replenishes -------------------------------------------
{
  const { world } = makeWorld();
  world.foods.length = 0; // drain it
  world.run(CONFIG.FOOD_SPAWN_INTERVAL * 5 + 1);
  check('food respawns to replenish the map', world.foods.length >= 5);
}

// --- Queen wanders ----------------------------------------------------------
{
  const { world, player } = makeWorld();
  const q = player.queen;
  const sx = q.x;
  const sy = q.y;
  let moved = false;
  const steps = (CONFIG.QUEEN_WANDER_INTERVAL * 6 + 10) * 60;
  for (let i = 0; i < steps; i++) {
    world.update(1 / 60);
    if (Math.abs(q.x - sx) > 0.5 || Math.abs(q.y - sy) > 0.5) { moved = true; break; }
  }
  check('queen wandered from her start', moved);
}

// --- Queen wander targets avoid other colonies -----------------------------
{
  const { world, player, enemy } = makeWorld();
  let ok = true;
  for (let i = 0; i < 25; i++) {
    const d = world._randomTileAwayFromOthers(player);
    if (d) {
      const dist = Math.hypot(d.x - enemy.home.x, d.y - enemy.home.y);
      if (dist < CONFIG.QUEEN_AVOID_DIST) ok = false;
    }
  }
  check('queen never targets near another colony', ok);
}

// --- Builder digs a shaft up to the surface --------------------------------
{
  const { grid, world, player } = makeWorld();
  player.surfaceOpen = false;
  player.entranceUnder = null;
  player.addAnt(CONFIG.ANT_BUILDER, 8, 12);
  world.run(80);
  check('builder opened the surface shaft', player.surfaceOpen === true);
  check('shaft reaches the top', grid.isTunnel(player.shaftX, 0));
}

// --- Builder walls the queen using stored dirt -----------------------------
{
  const { grid, world, player } = makeWorld();
  openShaft(grid, player); // already outside-connected, so builder goes to walls
  const b = player.addAnt(CONFIG.ANT_BUILDER, 8, 13);
  b.dirt = 6;
  const before = countWalls(grid);
  world.run(25);
  check('builder built walls around the queen', countWalls(grid) > before);
}

// --- Forager picks up surface food -----------------------------------------
{
  const { grid, surface, world, player } = makeWorld();
  world.wild = null;
  openShaft(grid, player);
  player.addNursery(7, 11);
  const f = player.addAnt(CONFIG.ANT_FORAGER, 8, 12);
  f.area = 'outside';
  f.x = player.shaftX;
  f.y = surface.rows - 4;
  const food = new Food(player.shaftX, surface.rows - 3, 'outside');
  world.foods.push(food);
  world.run(0.5); // just long enough to grab it (not deliver)
  check('forager picked up surface food', world.foods.indexOf(food) === -1);
}

// --- Forager delivers carried food to a nursery ----------------------------
{
  const { grid, world, player } = makeWorld();
  world.wild = null;
  openShaft(grid, player);
  const nurse = player.addNursery(8, 12);
  const f = player.addAnt(CONFIG.ANT_FORAGER, 8, 13);
  const food = new Food(8, 13, 'under');
  food.carrier = f;
  f.carriedFood = food;
  f.order = { type: 'deliverFood' };
  world.run(10);
  check('forager delivered carried food to a nursery', nurse.food >= 1);
}

// --- Food: a fed nursery grows an egg faster than plain tending ------------
{
  const a = makeWorld();
  const eggA = a.player.addEgg(8, 11, CONFIG.ANT_WORKER);
  const na = a.player.addNursery(8, 10);
  na.food = 50;
  a.world.run(5);

  const b = makeWorld();
  const eggB = b.player.addEgg(8, 11, CONFIG.ANT_WORKER);
  b.player.addWorker(8, 10); // tends (warmth) but brings no food
  b.world.run(5);

  check('fed egg grew faster than unfed egg', eggA.age > eggB.age);
}

// --- A nursery near an egg marks it tended (color change) ------------------
{
  const { world, player } = makeWorld();
  const egg = player.addEgg(8, 11, CONFIG.ANT_WORKER);
  player.addNursery(8, 10);
  world.update(1 / 60);
  check('nursery near an egg makes it tended', egg.tended === true);
}

// --- Nursery ants don't fight ----------------------------------------------
{
  const { world, player, enemy } = makeWorld();
  const nurse = player.addNursery(15, 10);
  enemy.addWorker(16, 10); // right next to the nurse
  world.run(1);
  check('nursery ant never takes an attack order', !(nurse.order && nurse.order.type === 'attack'));
}

// --- Queen lays eggs over time --------------------------------------------
{
  const { world, player } = makeWorld();
  const before = player.eggs.length;
  world.run(CONFIG.LAY_INTERVAL + 1);
  check('queen laid at least one egg', player.eggs.length > before);
}

// --- Ants heal over time when out of combat --------------------------------
{
  const { world, player } = makeWorld();
  const ant = player.addWorker(8, 10);
  ant.hp = 5; // wounded
  ant.regenCooldown = 0;
  world.run(6);
  check('a wounded ant heals over time', ant.hp > 5);
  check('healing does not exceed max hp', ant.hp <= ant.maxHp);
}

// --- Healing pauses right after taking damage ------------------------------
{
  const { world, player } = makeWorld();
  const ant = player.addWorker(8, 10);
  ant.hp = 10;
  ant.regenCooldown = CONFIG.HEAL_DELAY; // just got hit
  world.run(1); // less than HEAL_DELAY
  check('no healing during the post-damage delay', ant.hp === 10);
}

// --- Critters: spawn and stats ---------------------------------------------
{
  const { world, wild } = makeWorld();
  world.spawnCritters(6);
  check('critters spawned into the wild colony', wild.workers.length === 6);
  check('all spawned are critters on the surface',
    wild.workers.every((c) => c.isCritter && c.area === 'outside'));
}
{
  const { wild } = makeWorld();
  const g = wild.addCritter(CONFIG.CRITTER_GRASSHOPPER, 5, 5);
  const b = wild.addCritter(CONFIG.CRITTER_BEETLE, 6, 5);
  const l = wild.addCritter(CONFIG.CRITTER_LADYBUG, 7, 5);
  check('grasshopper and ladybug are harmless', g.damage === 0 && l.damage === 0);
  check('beetle is dangerous and tanky', b.damage > 0 && b.maxHp > g.maxHp);
}

// --- Beetle attacks a nearby ant -------------------------------------------
{
  const { world, player, wild } = makeWorld();
  const forager = player.addAnt(CONFIG.ANT_FORAGER, 5, 5);
  forager.area = 'outside';
  forager.x = 5; forager.y = 5;
  wild.addCritter(CONFIG.CRITTER_BEETLE, 6, 5);
  world.run(3);
  check('beetle damaged the nearby ant', forager.hp < forager.maxHp);
}

// --- Bees swarm an ant that gets too close to the hive ---------------------
{
  const { world, player, wild } = makeWorld();
  world.spawnHive(10, 4);
  check('hive spawned guardian bees',
    wild.workers.filter((c) => c.critter === CONFIG.CRITTER_BEE).length === CONFIG.BEE_COUNT);

  // An ant strays right next to the hive on the surface.
  const intruder = player.addAnt(CONFIG.ANT_FORAGER, 10, 4);
  intruder.area = 'outside';
  intruder.x = 10; intruder.y = 4;
  world.run(3);
  check('bees stung the nearby intruder', intruder.hp < intruder.maxHp);
}

// --- A slain critter drops food --------------------------------------------
{
  const { world, wild } = makeWorld();
  const bug = wild.addCritter(CONFIG.CRITTER_LADYBUG, 4, 4);
  const before = world.foods.length;
  bug.hp = 0;
  world.update(1 / 60);
  check('killed critter dropped food', world.foods.length > before);
  check('dead critter removed from wild', wild.workers.indexOf(bug) === -1);
}

// --- Drone mates with the queen, boosting egg-laying -----------------------
{
  const { world, player } = makeWorld();
  world.wild = null;
  const drone = player.addAnt(CONFIG.ANT_DRONE, 9, 11);
  check('drone is harmless', drone.damage === 0);
  // Step until the moment of mating (queen gains a boost), then check.
  let mated = false;
  for (let i = 0; i < 1200 && !mated; i++) {
    world.update(1 / 60);
    if (player.queen.layBoostTimer > 0) mated = true;
  }
  check('drone mated (queen got a lay-speed boost)', mated);
  check('mating spawned a heart', world.hearts.length > 0);
  check('drone expired after mating', player.workers.indexOf(drone) === -1);
}

// --- Boosted queen lays faster than normal ---------------------------------
{
  const { world, player } = makeWorld();
  world.wild = null;
  const q = player.queen;
  q.layBoostTimer = 999;
  q.layTimer = 0;
  const before = player.eggs.length;
  world.run(CONFIG.LAY_INTERVAL * CONFIG.LAY_BOOST_FACTOR + 0.5);
  check('boosted queen lays within the shortened interval', player.eggs.length > before);
}

// --- Warrior surface patrol toggle -----------------------------------------
{
  const { grid, world, player } = makeWorld();
  world.wild = null; // isolate: no critters to fight on the surface
  openShaft(grid, player);
  const w = player.addAnt(CONFIG.ANT_WARRIOR, 8, 12);
  player.patrol = true;
  world.run(30);
  check('patrolling warrior goes to the surface', w.area === 'outside');

  // Turn patrol off — it should head back inside.
  player.patrol = false;
  world.run(60);
  check('recalled warrior returns underground', w.area === 'under');
}

// --- Save / load round-trip ------------------------------------------------
{
  const { grid, world, player, enemy } = makeWorld();
  openShaft(grid, player);
  player.addAnt(CONFIG.ANT_WARRIOR, 9, 11);
  player.addNursery(7, 11);
  player.addEgg(6, 11, CONFIG.ANT_FORAGER);
  world.foods.push(new Food(5, 3, 'outside'));
  world.spawnCritters(3);
  player.patrol = true;

  const json = JSON.stringify(serializeGame(world, 1, 'outside'));
  const r = deserializeGame(JSON.parse(json));

  check('loaded level index preserved', r.levelIndex === 1);
  check('loaded view preserved', r.view === 'outside');
  check('loaded player colony has its queen', !!r.world.player.queen);
  check('loaded player patrol flag preserved', r.world.player.patrol === true);
  check('loaded ant counts match',
    r.world.player.workers.length === world.player.workers.length);
  check('loaded eggs preserved', r.world.player.eggs.length === player.eggs.length);
  check('loaded food preserved', r.world.foods.length === world.foods.length);
  check('loaded surface shaft state preserved', r.world.player.surfaceOpen === true);
  check('loaded world keeps simulating', (() => {
    r.world.run = (sec, dt = 1 / 60) => { for (let i = 0; i < sec / dt; i++) r.world.update(dt); };
    const before = r.world.player.workers.length;
    r.world.run(1);
    return r.world.player.workers.length >= before; // didn't crash / lose everyone
  })());
}

// --- Levels are well-formed ------------------------------------------------
{
  check('there are multiple levels', LEVELS.length >= 2);
  let ok = true;
  for (const lv of LEVELS) {
    const players = lv.nests.filter((n) => n.player);
    if (players.length !== 1) ok = false;
    if (!lv.nests.some((n) => !n.player)) ok = false; // at least one enemy
    // Every nest must fit on the grid.
    for (const n of lv.nests) {
      if (n.cx < 2 || n.cy < 2 || n.cx >= lv.cols - 2 || n.cy >= lv.rows - 2) ok = false;
    }
  }
  check('each level has one player nest, an enemy, and in-bounds nests', ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
