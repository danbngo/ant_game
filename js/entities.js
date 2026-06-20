// Entities that live in the colony: ants and eggs.
// Positions are stored in WHOLE tile coordinates (locked to the grid).
// (x, y) is the top-left tile the entity occupies; `size` is its footprint in tiles.

// The 8 allowed facing directions (cardinals + diagonals), as angles in radians.
// Index 0 = East, going clockwise in screen space.
const DIRECTIONS = [];
for (let i = 0; i < 8; i++) DIRECTIONS.push((i * Math.PI) / 4);

// Snap an arbitrary angle to the nearest of the 8 primary directions.
function snapTo8(angle) {
  const step = Math.PI / 4;
  const i = ((Math.round(angle / step) % 8) + 8) % 8;
  return DIRECTIONS[i];
}

// Pick a caste for a new egg/ant using the configured weights.
function randomCaste() {
  const w = CONFIG.CASTE_WEIGHTS;
  let r = Math.random();
  if ((r -= w.warrior) < 0) return CONFIG.ANT_WARRIOR;
  if ((r -= w.nursery) < 0) return CONFIG.ANT_NURSERY;
  if ((r -= w.forager) < 0) return CONFIG.ANT_FORAGER;
  if ((r -= w.builder) < 0) return CONFIG.ANT_BUILDER;
  if ((r -= w.drone) < 0) return CONFIG.ANT_DRONE;
  return CONFIG.ANT_WORKER;
}

class Ant {
  constructor(type, tileX, tileY, tint) {
    this.type = type; // queen | worker | warrior | nursery
    this.isQueen = type === CONFIG.ANT_QUEEN;
    this.isWarrior = type === CONFIG.ANT_WARRIOR;
    this.isNursery = type === CONFIG.ANT_NURSERY;
    this.isForager = type === CONFIG.ANT_FORAGER;
    this.isBuilder = type === CONFIG.ANT_BUILDER;
    this.isDrone = type === CONFIG.ANT_DRONE;
    this.isWorker = type === CONFIG.ANT_WORKER;
    // Color variant; defaults to dark red. See TINTS in config.js.
    this.tint = tint || DEFAULT_TINT;
    // Footprint: queen is 2x2 tiles, others 1x1. Always whole tiles.
    this.size = this.isQueen ? 2 : 1;
    this.x = Math.round(tileX);
    this.y = Math.round(tileY);
    // Facing is locked to one of the 8 primary directions.
    this.dir = Math.floor(Math.random() * 8);
    this.angle = DIRECTIONS[this.dir];

    // Per-caste stats: speed, hp, damage, and damage-reduction (defense).
    let speed, hp, dmg, def;
    if (this.isQueen) {
      speed = CONFIG.QUEEN_SPEED; hp = CONFIG.QUEEN_HP; dmg = CONFIG.QUEEN_DAMAGE; def = CONFIG.QUEEN_DEFENSE;
    } else if (this.isWarrior) {
      speed = CONFIG.WARRIOR_SPEED; hp = CONFIG.WARRIOR_HP; dmg = CONFIG.WARRIOR_DAMAGE; def = CONFIG.WARRIOR_DEFENSE;
    } else if (this.isNursery) {
      speed = CONFIG.NURSERY_SPEED; hp = CONFIG.NURSERY_HP; dmg = CONFIG.NURSERY_DAMAGE; def = CONFIG.NURSERY_DEFENSE;
    } else if (this.isForager) {
      speed = CONFIG.FORAGER_SPEED; hp = CONFIG.FORAGER_HP; dmg = CONFIG.FORAGER_DAMAGE; def = CONFIG.FORAGER_DEFENSE;
    } else if (this.isBuilder) {
      speed = CONFIG.BUILDER_SPEED; hp = CONFIG.BUILDER_HP; dmg = CONFIG.BUILDER_DAMAGE; def = CONFIG.BUILDER_DEFENSE;
    } else if (this.isDrone) {
      speed = CONFIG.DRONE_SPEED; hp = CONFIG.DRONE_HP; dmg = CONFIG.DRONE_DAMAGE; def = CONFIG.DRONE_DEFENSE;
    } else {
      speed = CONFIG.WORKER_SPEED; hp = CONFIG.WORKER_HP; dmg = CONFIG.WORKER_DAMAGE; def = CONFIG.WORKER_DEFENSE;
    }

    // Movement state. Position (x, y) may be fractional while walking, but
    // always settles exactly on integer tiles.
    this.speed = speed;
    this.path = null;   // remaining {x, y} tiles to walk (excludes current)
    this.target = null; // the specific tile currently being walked toward

    // Faction: set by the colony that owns this ant.
    this.colony = null;
    this.faction = null;

    // Combat.
    this.maxHp = hp;
    this.hp = this.maxHp;
    this.damage = dmg;
    this.defense = def;       // fraction of incoming damage ignored
    this.attackTimer = 0;     // cooldown remaining
    this.regenCooldown = 0;   // time until health regen resumes after a hit

    // Orders / tasks (see world.js for how these are executed).
    this.order = null;       // {type, ...}
    this.carrying = null;    // an Egg being carried home
    this.carriedFood = null; // a Food unit being hauled to a nursery
    this.food = 0;           // a nursery ant's stored food
    this.dirt = 0;           // a builder's stored dirt (for walls)
    this.area = 'under';     // 'under' (nest) or 'outside' (surface)
    this.digTimer = 0;     // progress digging the current tile
    this.repathTimer = 0;  // throttles chase re-pathing
    this.layTimer = 0;       // queens only: time accumulated toward laying an egg
    this.wanderTimer = 0;    // queens only: time accumulated toward wandering
    this.layBoostTimer = 0;  // queens only: time left of post-mating lay speedup
  }

  // World-pixel center of the footprint, in TILE units.
  get cx() { return this.x + this.size / 2; }
  get cy() { return this.y + this.size / 2; }

  faceTarget(e) {
    const ex = e.x + (e.size || 1) / 2;
    const ey = e.y + (e.size || 1) / 2;
    this.faceAngle(Math.atan2(ey - this.cy, ex - this.cx));
  }

  stop() {
    this.path = null;
    this.target = null;
  }

  isMoving() {
    return this.target !== null || (this.path !== null && this.path.length > 0);
  }

  // Give the ant a route (list of tiles incl. its current tile, from findPath).
  setPath(path) {
    if (!path || path.length <= 1) {
      this.path = null;
      this.target = null;
      return;
    }
    // Drop the first entry (the tile it's already on).
    this.path = path.slice(1);
    this.target = null;
  }

  // Try to step one tile in (dx, dy); ignored if mid-step or blocked.
  stepDir(dx, dy, grid) {
    if (this.isMoving()) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    // No diagonal corner-cutting through dirt.
    if (dx !== 0 && dy !== 0) {
      if (!isPassable(grid, x + dx, y, this.size)) return;
      if (!isPassable(grid, x, y + dy, this.size)) return;
    }
    const nx = x + dx;
    const ny = y + dy;
    if (!isPassable(grid, nx, ny, this.size)) return;
    this.path = null;
    this.target = { x: nx, y: ny };
  }

  // Advance along the path by dt seconds.
  update(dt) {
    if (!this.target) {
      if (this.path && this.path.length) this.target = this.path.shift();
      else return;
    }
    let budget = this.speed * dt;
    while (this.target && budget > 0) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 1e-6) {
        this.x = this.target.x;
        this.y = this.target.y;
        this.target = this.path && this.path.length ? this.path.shift() : null;
        continue;
      }
      this.faceAngle(Math.atan2(dy, dx));
      if (budget >= dist) {
        this.x = this.target.x;
        this.y = this.target.y;
        budget -= dist;
        this.target = this.path && this.path.length ? this.path.shift() : null;
      } else {
        this.x += (dx / dist) * budget;
        this.y += (dy / dist) * budget;
        budget = 0;
      }
    }
  }

  // Set facing by direction index (0-7) or by snapping a raw angle.
  setDir(index) {
    this.dir = ((index % 8) + 8) % 8;
    this.angle = DIRECTIONS[this.dir];
  }

  faceAngle(angle) {
    this.angle = snapTo8(angle);
    this.dir = DIRECTIONS.indexOf(this.angle);
  }
}

class Egg {
  constructor(tileX, tileY, caste) {
    this.type = CONFIG.EGG;
    this.size = 1; // 1x1 tile, locked to the grid
    this.x = Math.round(tileX);
    this.y = Math.round(tileY);
    // Which caste hatches from this egg (worker or warrior).
    this.caste = caste || CONFIG.ANT_WORKER;
    // Ownership: set by the colony that holds it.
    this.colony = null;
    this.faction = null;
    this.carrier = null; // the Ant currently carrying it, if any

    // Breeding.
    this.age = 0;        // seconds since laid; hatches at EGG_HATCH_TIME
    this.tended = false; // is a same-color ant nearby right now?
    this.fed = false;    // is a nursery actively feeding it food right now?
  }
}

// Neutral surface wildlife. Reuses the Ant movement/combat machinery, but with
// its own stats and behavior (driven by World._updateCritters).
class Critter extends Ant {
  constructor(critterType, tileX, tileY) {
    super(critterType, tileX, tileY);
    this.isCritter = true;
    this.critter = critterType;
    this.area = 'outside';
    const s = CONFIG.CRITTER_STATS[critterType];
    this.maxHp = s.hp;
    this.hp = s.hp;
    this.damage = s.dmg;
    this.defense = s.def;
    this.speed = s.speed;
    this.foodDrop = s.food;
  }
}

// A morsel of food, to be foraged. Food grows on the surface (outside).
class Food {
  constructor(tileX, tileY, area) {
    this.type = CONFIG.FOOD;
    this.size = 1;
    this.x = Math.round(tileX);
    this.y = Math.round(tileY);
    this.area = area || 'outside';
    this.carrier = null; // the ant hauling it, if any
  }
}
