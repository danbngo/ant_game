// Save / load: serialize the world to a plain object (JSON-able) and rebuild it.
// Transient state (orders, paths, attack targets) is dropped on load — ants
// simply pick their jobs back up via the normal AI once restored.

function _serGrid(g) {
  return { cols: g.cols, rows: g.rows, tiles: g.tiles.map((row) => row.slice()) };
}

function _deserGrid(d) {
  const g = new Grid(d.cols, d.rows);
  for (let y = 0; y < d.rows; y++) {
    for (let x = 0; x < d.cols; x++) g.tiles[y][x] = d.tiles[y][x];
  }
  return g;
}

function _serAnt(a) {
  return {
    type: a.type,
    critter: a.critter || null,
    x: a.x, y: a.y,
    hp: a.hp,
    area: a.area,
    dir: a.dir,
    dirt: a.dirt || 0,
    food: a.food || 0,
    layTimer: a.layTimer || 0,
    layBoostTimer: a.layBoostTimer || 0,
    wanderTimer: a.wanderTimer || 0,
  };
}

function _applyAnt(ant, d) {
  ant.hp = d.hp;
  ant.area = d.area;
  if (typeof d.dir === 'number') ant.setDir(d.dir);
  ant.dirt = d.dirt || 0;
  ant.food = d.food || 0;
  ant.layTimer = d.layTimer || 0;
  ant.layBoostTimer = d.layBoostTimer || 0;
  ant.wanderTimer = d.wanderTimer || 0;
  ant.x = d.x;
  ant.y = d.y;
}

function _serColony(c) {
  return {
    id: c.id, tint: c.tint, isPlayer: c.isPlayer, isWild: !!c.isWild,
    patrol: !!c.patrol,
    home: c.home, shaftX: c.shaftX, surfaceOpen: !!c.surfaceOpen,
    entranceUnder: c.entranceUnder || null, entranceOut: c.entranceOut || null,
    queen: c.queen ? _serAnt(c.queen) : null,
    workers: c.workers.map(_serAnt),
    // Carried eggs are saved as if dropped at the carrier's position.
    eggs: c.eggs.map((e) => ({
      x: Math.round(e.x), y: Math.round(e.y), caste: e.caste, age: e.age,
    })),
  };
}

function serializeGame(world, levelIndex, view) {
  return {
    v: 1,
    levelIndex,
    view: view || 'under',
    grid: _serGrid(world.grid),
    surface: world.surface ? _serGrid(world.surface) : null,
    hive: world.hive || null,
    foods: world.foods.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), area: f.area })),
    colonies: world.colonies.map(_serColony),
  };
}

function deserializeGame(data) {
  const grid = _deserGrid(data.grid);
  const world = new World(grid);
  if (data.surface) world.surface = _deserGrid(data.surface);
  if (data.hive) world.hive = data.hive;

  for (const cd of data.colonies) {
    const col = new Colony(cd.id, cd.tint, cd.isPlayer);
    col.isWild = cd.isWild;
    col.patrol = cd.patrol;
    col.shaftX = cd.shaftX;
    col.surfaceOpen = cd.surfaceOpen;
    col.entranceUnder = cd.entranceUnder;
    col.entranceOut = cd.entranceOut;
    world.addColony(col);
    if (cd.isWild) world.wild = col;

    if (cd.queen) {
      const q = col.setQueen(cd.queen.x, cd.queen.y);
      _applyAnt(q, cd.queen);
    }
    col.home = cd.home; // restore the original nest center (setQueen overwrote it)

    for (const wd of cd.workers) {
      const a = wd.critter ? col.addCritter(wd.critter, wd.x, wd.y) : col.addAnt(wd.type, wd.x, wd.y);
      _applyAnt(a, wd);
    }
    for (const ed of cd.eggs) {
      const e = col.addEgg(ed.x, ed.y, ed.caste);
      e.age = ed.age || 0;
    }
  }

  for (const f of data.foods) world.foods.push(new Food(f.x, f.y, f.area));

  return { world, levelIndex: data.levelIndex || 0, view: data.view || 'under' };
}
