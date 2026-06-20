// The World ties the grid and all colonies together and runs the simulation:
// order execution, enemy AI, combat, and cleanup of the dead.

class World {
  constructor(grid) {
    this.grid = grid;       // underground
    this.surface = null;    // open-air outside grid (set via setupAreas)
    this.colonies = [];
    this.player = null;
    this.foods = [];        // food morsels, all on the surface
    this.foodTimer = 0;     // accumulates toward the next food spawn
    this.hearts = [];        // floating mating hearts {x, y, age}
    this.hive = null;        // beehive location on the surface {x, y}
  }

  // Wire up the outside surface and each colony's entrance state.
  setupAreas(surface) {
    this.surface = surface;
    for (const c of this.colonies) {
      const hx = c.home ? Math.min(Math.max(1, c.home.x), this.grid.cols - 2) : 1;
      c.shaftX = hx;                 // column a builder digs up to the surface
      c.surfaceOpen = false;         // becomes true once the shaft reaches the top
      c.entranceUnder = null;        // underground end of the shaft (top of grid)
      c.entranceOut = { x: hx, y: surface.rows - 1 }; // hole on the surface underside
    }
  }

  gridFor(area) {
    return area === 'outside' ? this.surface : this.grid;
  }

  addColony(colony) {
    this.colonies.push(colony);
    if (colony.isPlayer) this.player = colony;
    return colony;
  }

  // --- Queries -------------------------------------------------------------

  allAnts() {
    const out = [];
    for (const c of this.colonies) for (const a of c.allAnts()) out.push(a);
    return out;
  }

  // Topmost enemy ant whose footprint covers the tile point (tileX, tileY).
  enemyAntAt(tileX, tileY) {
    let hit = null;
    for (const c of this.colonies) {
      if (c.isPlayer) continue;
      for (const a of c.allAnts()) {
        if (
          tileX >= a.x && tileX < a.x + a.size &&
          tileY >= a.y && tileY < a.y + a.size
        ) {
          hit = a; // later (queen drawn last) wins ties, but any is fine
        }
      }
    }
    return hit;
  }

  // An enemy egg sitting on integer tile (tx, ty), if any.
  enemyEggAt(tx, ty) {
    for (const c of this.colonies) {
      if (c.isPlayer) continue;
      for (const e of c.eggs) {
        if (!e.carrier && Math.round(e.x) === tx && Math.round(e.y) === ty) return e;
      }
    }
    return null;
  }

  removeEgg(egg) {
    if (!egg.colony) return;
    const arr = egg.colony.eggs;
    const i = arr.indexOf(egg);
    if (i >= 0) arr.splice(i, 1);
  }

  // Nearest unoccupied tunnel tile to (x, y), for dropping a looted egg.
  freeTileNear(x, y, size) {
    const occupied = new Set();
    for (const c of this.colonies) {
      for (const e of c.eggs) occupied.add(Math.round(e.x) + ',' + Math.round(e.y));
    }
    for (let r = 0; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = x + dx;
          const ty = y + dy;
          if (!this.grid.isTunnel(tx, ty)) continue;
          if (occupied.has(tx + ',' + ty)) continue;
          return { x: tx, y: ty };
        }
      }
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  nearestPlayerAnt(ant) {
    if (!this.player) return null;
    let best = null;
    let bestD = Infinity;
    for (const p of this.player.allAnts()) {
      if (p.area !== ant.area) continue; // only fight within the same area
      const d = Math.hypot(p.cx - ant.cx, p.cy - ant.cy);
      if (d < bestD) { bestD = d; best = p; }
    }
    return { ant: best, dist: bestD };
  }

  // Nearest ant of a DIFFERENT faction in the same area within maxRange, or null.
  nearestEnemyAnt(ant, maxRange) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.colonies) {
      if (c.id === ant.faction) continue;
      for (const e of c.allAnts()) {
        if (e.area !== ant.area) continue;
        const d = Math.hypot(e.cx - ant.cx, e.cy - ant.cy);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    return best && bestD <= maxRange ? best : null;
  }

  // Nearest uncarried food in the ant's area within maxRange, or null.
  nearestFood(ant, maxRange) {
    let best = null;
    let bestD = Infinity;
    for (const f of this.foods) {
      if (f.carrier || f.area !== ant.area) continue;
      const d = Math.hypot(f.x + 0.5 - ant.cx, f.y + 0.5 - ant.cy);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best && bestD <= maxRange ? best : null;
  }

  // Nearest same-colony nursery ant, or null.
  nearestColonyNursery(ant) {
    let best = null;
    let bestD = Infinity;
    for (const a of ant.colony.allAnts()) {
      if (!a.isNursery || a === ant) continue;
      const d = Math.hypot(a.cx - ant.cx, a.cy - ant.cy);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  // Nearest same-colony egg sitting on the ground, or null.
  nearestColonyEgg(ant) {
    let best = null;
    let bestD = Infinity;
    for (const e of ant.colony.eggs) {
      if (e.carrier) continue;
      const d = Math.hypot(e.x + 0.5 - ant.cx, e.y + 0.5 - ant.cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  _dropFood(ant) {
    const f = ant.carriedFood;
    if (!f) return;
    f.carrier = null;
    f.x = Math.round(ant.x);
    f.y = Math.round(ant.y);
    this.foods.push(f);
    ant.carriedFood = null;
  }

  // A random open tile in the surface "ground band" near the bottom (the upper
  // rows are open sky/tree). Food, critters, and bees stay down here.
  _randomSurface() {
    const s = this.surface;
    if (!s) return null;
    const top = Math.max(0, s.rows - CONFIG.SURFACE_GROUND_BAND);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * s.cols);
      const y = top + Math.floor(Math.random() * (s.rows - 1 - top)); // not the bottom hole row
      if (s.isTunnel(x, y) && !this.foods.some((f) => f.x === x && f.y === y)) {
        return { x, y };
      }
    }
    return null;
  }

  // Scatter `n` food morsels on the surface (used at startup).
  seedFood(n) {
    for (let i = 0; i < n; i++) {
      const s = this._randomSurface();
      if (s) this.foods.push(new Food(s.x, s.y, 'outside'));
    }
  }

  // --- Critters (surface wildlife) -----------------------------------------

  spawnCritters(n) {
    if (!this.wild || !this.surface) return;
    const types = [CONFIG.CRITTER_GRASSHOPPER, CONFIG.CRITTER_BEETLE, CONFIG.CRITTER_LADYBUG];
    for (let i = 0; i < n; i++) {
      const s = this._randomSurface();
      if (!s) continue;
      const type = types[Math.floor(Math.random() * types.length)];
      this.wild.addCritter(type, s.x, s.y);
    }
  }

  // Place the beehive on the surface and spawn its guardian bees.
  spawnHive(x, y) {
    this.hive = { x, y };
    for (let i = 0; i < CONFIG.BEE_COUNT; i++) this._spawnBee();
  }

  _spawnBee() {
    if (!this.wild || !this.hive) return;
    const ang = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 2;
    const x = Math.round(this.hive.x + Math.cos(ang) * r);
    const y = Math.round(this.hive.y + Math.sin(ang) * r);
    const tx = this.surface.inBounds(x, y) && this.surface.isTunnel(x, y) ? x : Math.round(this.hive.x);
    const ty = this.surface.inBounds(x, y) && this.surface.isTunnel(x, y) ? y : Math.round(this.hive.y);
    this.wild.addCritter(CONFIG.CRITTER_BEE, tx, ty);
  }

  // Nearest non-wild ant on the surface within HIVE_GUARD_RANGE of the hive.
  _nearestIntruderNearHive() {
    if (!this.hive) return null;
    let best = null;
    let bestD = Infinity;
    for (const c of this.colonies) {
      if (c.isWild) continue;
      for (const a of c.allAnts()) {
        if (a.area !== 'outside') continue;
        const dh = Math.hypot(a.cx - this.hive.x, a.cy - this.hive.y);
        if (dh <= CONFIG.HIVE_GUARD_RANGE && dh < bestD) { bestD = dh; best = a; }
      }
    }
    return best;
  }

  _spawnCritters(dt) {
    if (!this.wild) return;
    this.critterTimer = (this.critterTimer || 0) + dt;
    if (this.critterTimer < CONFIG.CRITTER_SPAWN_INTERVAL) return;
    this.critterTimer -= CONFIG.CRITTER_SPAWN_INTERVAL;
    const wanderers = this.wild.workers.filter((c) => c.hp > 0 && c.critter !== CONFIG.CRITTER_BEE).length;
    if (wanderers < CONFIG.CRITTER_COUNT) this.spawnCritters(1);
    // Keep the hive defended.
    if (this.hive) {
      const bees = this.wild.workers.filter((c) => c.hp > 0 && c.critter === CONFIG.CRITTER_BEE).length;
      if (bees < CONFIG.BEE_COUNT) this._spawnBee();
    }
  }

  // Critter behavior: beetles attack ants, grasshoppers flee, all wander.
  _updateCritters(dt) {
    const wild = this.wild;
    if (!wild) return;
    for (const cr of wild.workers) {
      if (cr.hp <= 0) continue;

      // Bees swarm intruders near the hive, then return to circle it.
      if (cr.critter === CONFIG.CRITTER_BEE) {
        const hive = this.hive;
        if (cr.order && cr.order.type === 'attack') {
          const t = cr.order.target;
          const farFromHive = !t || t.hp <= 0 || !hive ||
            Math.hypot(t.cx - hive.x, t.cy - hive.y) > CONFIG.HIVE_GUARD_RANGE + 2;
          if (farFromHive) cr.order = null;
          else continue; // keep stinging
        }
        const foe = this._nearestIntruderNearHive();
        if (foe) { cr.order = { type: 'attack', target: foe }; continue; }
        // Orbit the hive.
        if (hive && !cr.isMoving()) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 1 + Math.random() * 2.5;
          const tx = Math.round(hive.x + Math.cos(ang) * rad);
          const ty = Math.round(hive.y + Math.sin(ang) * rad);
          if (isPassable(this.surface, tx, ty, 1)) {
            const p = findPath(this.surface, Math.round(cr.x), Math.round(cr.y), tx, ty, 1);
            if (p) { cr.setPath(p); cr.order = { type: 'move' }; }
          }
        }
        continue;
      }

      if (this._hasLiveAttack(cr)) continue; // beetle already on a live target

      if (cr.critter === CONFIG.CRITTER_BEETLE) {
        const foe = this.nearestEnemyAnt(cr, CONFIG.BEETLE_AGGRO);
        if (foe) { cr.order = { type: 'attack', target: foe }; continue; }
      } else if (cr.critter === CONFIG.CRITTER_GRASSHOPPER) {
        const foe = this.nearestEnemyAnt(cr, CONFIG.CRITTER_FLEE_RANGE);
        if (foe && !cr.isMoving()) {
          // Hop directly away from the threat.
          const ang = Math.atan2(cr.cy - foe.cy, cr.cx - foe.cx);
          const tx = Math.round(cr.x + Math.cos(ang) * 4);
          const ty = Math.round(cr.y + Math.sin(ang) * 4);
          if (isPassable(this.surface, tx, ty, 1)) {
            const p = findPath(this.surface, Math.round(cr.x), Math.round(cr.y), tx, ty, 1);
            if (p) { cr.setPath(p); cr.order = { type: 'move' }; }
          }
          continue;
        }
      }

      // Idle wander.
      cr.wanderTimer += dt;
      if (!cr.isMoving() && cr.wanderTimer >= CONFIG.CRITTER_WANDER_INTERVAL) {
        cr.wanderTimer = 0;
        const s = this._randomSurface();
        if (s) {
          const p = findPath(this.surface, Math.round(cr.x), Math.round(cr.y), s.x, s.y, 1);
          if (p) { cr.setPath(p); cr.order = { type: 'move' }; }
        }
      }
    }
  }

  // --- Builder helpers -----------------------------------------------------

  // The next dirt/wall tile in a colony's vertical shaft to dig (going up).
  _nextShaftTile(colony) {
    const x = colony.shaftX;
    const startY = colony.home ? colony.home.y - 1 : this.grid.rows - 1;
    for (let y = startY; y >= 0; y--) {
      if (!this.grid.isTunnel(x, y) && this.grid.isTunnel(x, y + 1)) return { x, y };
    }
    return null; // shaft is clear to the top
  }

  // A nearby diggable dirt tile (has a tunnel neighbor) for mining wall stock.
  _nearestDirt(ant, colony) {
    const home = colony.home;
    if (!home) return null;
    let best = null;
    let bestD = Infinity;
    const R = 6;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = home.x + dx;
        const y = home.y + dy;
        if (!this.grid.inBounds(x, y) || this.grid.get(x, y) !== CONFIG.TILE_DIRT) continue;
        // Must be reachable to dig: at least one orthogonal tunnel neighbor.
        if (!this.grid.isTunnel(x + 1, y) && !this.grid.isTunnel(x - 1, y) &&
            !this.grid.isTunnel(x, y + 1) && !this.grid.isTunnel(x, y - 1)) continue;
        const d = Math.hypot(x - ant.cx, y - ant.cy);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }

  // The next ring tile around the queen that should become a wall (leaving the
  // four cardinal gaps open so the colony isn't sealed in).
  _nextWallSlot(colony) {
    const home = colony.home;
    if (!home) return null;
    const R = CONFIG.WALL_RADIUS;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== R) continue; // ring only
        if (dx === 0 || dy === 0) continue;                       // leave gaps
        const x = home.x + dx;
        const y = home.y + dy;
        if (!this.grid.isTunnel(x, y)) continue; // already wall/dirt
        // Don't wall a tile an ant is standing on.
        if (this.allAnts().some((a) => a.area === 'under' && Math.round(a.x) === x && Math.round(a.y) === y)) continue;
        return { x, y };
      }
    }
    return null; // ring complete
  }

  // --- Simulation ----------------------------------------------------------

  update(dt) {
    this._assignCombat();
    this._assignJobs();
    this._wanderQueens(dt);
    this._updateCritters(dt);
    this._spawnFood(dt);
    this._spawnCritters(dt);

    // Run each ant's current order, then advance its movement.
    for (const a of this.allAnts()) {
      this._runOrder(a, dt);
      if (a.attackTimer > 0) a.attackTimer -= dt;
      // Health regen: heal slowly once out of combat for HEAL_DELAY seconds.
      if (a.regenCooldown > 0) a.regenCooldown -= dt;
      else if (!a.dead && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + CONFIG.HEAL_RATE * dt);
      a.update(dt);
      // Carried things ride along with the ant.
      if (a.carrying) { a.carrying.x = a.x; a.carrying.y = a.y; }
      if (a.carriedFood) { a.carriedFood.x = a.x; a.carriedFood.y = a.y; }
    }

    this._updateEggs(dt);
    this._updateLaying(dt);
    this._updateHearts(dt);
    this._cleanupDead();
  }

  _updateHearts(dt) {
    for (const h of this.hearts) h.age += dt;
    this.hearts = this.hearts.filter((h) => h.age < CONFIG.HEART_DURATION);
  }

  // Idle, non-combat ants pick up jobs:
  //   - nursery: sit with the eggs.
  //   - forager: travel outside, gather food, bring it back to a nursery.
  //   - builder: dig a shaft to the surface, mine dirt, wall the queen.
  //   - worker/warrior/queen: no autonomous job.
  _assignJobs() {
    for (const c of this.colonies) {
      const ants = c.allAnts();
      const hasNursery = ants.some((a) => a.isNursery);
      for (const a of ants) {
        if (a.order || a.isCritter || a.isQueen || a.isWorker) continue;

        if (a.isDrone) {
          if (c.queen && c.queen.hp > 0) a.order = { type: 'mate' };
          continue;
        }

        if (a.isWarrior) {
          // Patrol the surface when the colony's patrol order is set.
          if (a.area === 'outside') {
            if (!c.patrol) {
              a.order = { type: 'comeInside' };
            } else if (!a.isMoving()) {
              const s = this._randomSurface();
              if (s) {
                const p = findPath(this.surface, Math.round(a.x), Math.round(a.y), s.x, s.y, a.size);
                if (p) { a.setPath(p); a.order = { type: 'move' }; }
              }
            }
          } else if (c.patrol && c.surfaceOpen) {
            a.order = { type: 'goOutside' };
          }
          continue;
        }

        if (a.isNursery) {
          const egg = this.nearestColonyEgg(a);
          if (egg) a.order = { type: 'tend', egg };
          continue;
        }

        if (a.isForager) {
          if (a.carriedFood) {
            if (a.area === 'outside') a.order = { type: 'comeInside' };
            else if (hasNursery) a.order = { type: 'deliverFood' };
            else this._dropFood(a);
          } else if (a.area === 'outside') {
            const food = this.nearestFood(a, 9999);
            if (food) a.order = { type: 'forageOutside', food };
            else a.order = { type: 'comeInside' }; // nothing out here; head back
          } else if (c.surfaceOpen && hasNursery) {
            a.order = { type: 'goOutside' };
          }
          continue;
        }

        if (a.isBuilder) {
          const q = c.queen;
          if (!q || q.hp <= 0) continue;
          if (!c.surfaceOpen) {
            const t = this._nextShaftTile(c);
            if (t) { a.order = { type: 'mine', tx: t.x, ty: t.y }; continue; }
            // Shaft reached the top — open the exit.
            c.surfaceOpen = true;
            c.entranceUnder = { x: c.shaftX, y: 0 };
          }
          if (a.dirt >= CONFIG.WALL_COST) {
            const slot = this._nextWallSlot(c);
            if (slot) { a.order = { type: 'buildWall', tx: slot.x, ty: slot.y }; continue; }
          }
          if (a.dirt < CONFIG.BUILDER_MAX_DIRT) {
            const d = this._nearestDirt(a, c);
            if (d) { a.order = { type: 'mine', tx: d.x, ty: d.y }; continue; }
          }
          continue;
        }
      }
    }
  }

  _spawnFood(dt) {
    this.foodTimer += dt;
    if (this.foodTimer < CONFIG.FOOD_SPAWN_INTERVAL) return;
    this.foodTimer -= CONFIG.FOOD_SPAWN_INTERVAL;
    // Respawn: refill quickly toward the target, plus a steady trickle, all
    // capped at FOOD_MAX. This keeps food on the map as workers haul it away.
    let toSpawn = 1;
    if (this.foods.length < CONFIG.FOOD_TARGET) {
      toSpawn = Math.min(5, CONFIG.FOOD_TARGET - this.foods.length);
    }
    for (let i = 0; i < toSpawn && this.foods.length < CONFIG.FOOD_MAX; i++) {
      const s = this._randomSurface();
      if (s) this.foods.push(new Food(s.x, s.y, 'outside'));
    }
  }

  // Queens roam to random spots, but steer clear of other colonies' nests.
  _wanderQueens(dt) {
    for (const c of this.colonies) {
      const q = c.queen;
      if (!q || q.hp <= 0) continue;
      if (q.order && q.order.type === 'attack') { q.wanderTimer = 0; continue; }
      if (q.isMoving()) continue; // let her finish her current walk first
      q.wanderTimer += dt;
      if (q.wanderTimer < CONFIG.QUEEN_WANDER_INTERVAL) continue;
      q.wanderTimer = 0;
      const dest = this._randomTileAwayFromOthers(c);
      if (!dest) continue;
      const p = findPath(this.grid, Math.round(q.x), Math.round(q.y), dest.x, dest.y, q.size);
      if (p) { q.setPath(p); q.order = { type: 'move' }; }
    }
  }

  // A random passable (2x2) tile that isn't within QUEEN_AVOID_DIST of any
  // OTHER colony's nest. Returns null if none found in a few tries.
  _randomTileAwayFromOthers(colony) {
    const others = [];
    for (const o of this.colonies) {
      if (o === colony || !o.home) continue;
      others.push(o.home);
    }
    const home = colony.home;
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * this.grid.cols);
      const y = Math.floor(Math.random() * this.grid.rows);
      if (!isPassable(this.grid, x, y, 2)) continue;
      // Stay close to home...
      if (home && Math.hypot(home.x - x, home.y - y) > CONFIG.QUEEN_WANDER_RADIUS) continue;
      // ...and away from other colonies' nests.
      if (others.some((h) => Math.hypot(h.x - x, h.y - y) < CONFIG.QUEEN_AVOID_DIST)) continue;
      return { x, y };
    }
    return null;
  }

  // Tend, age, and hatch eggs.
  _updateEggs(dt) {
    for (const c of this.colonies) {
      const ants = c.allAnts();
      const hatched = [];
      for (const egg of c.eggs) {
        if (egg.carrier) { egg.tended = false; continue; } // not while carried

        // Warmth from nearby same-colony ants. Each ant within TEND_RANGE adds
        // 0.5 (at the edge) up to 1.5 (right on top), so closer/more ants =
        // faster. With no ants nearby, warmth is 0 and the egg won't progress.
        let warmth = 0;
        let fed = false;
        for (const a of ants) {
          if (a.area !== 'under') continue; // eggs are underground
          const d = Math.hypot(a.cx - (egg.x + 0.5), a.cy - (egg.y + 0.5));
          if (d > CONFIG.TEND_RANGE) continue;
          warmth += 1.5 - d / CONFIG.TEND_RANGE;
          // A nursery ant with food spends it to grow this egg faster.
          if (!fed && a.isNursery && a.food > 0) {
            warmth += CONFIG.FOOD_BOOST;
            a.food = Math.max(0, a.food - CONFIG.FOOD_CONSUME_RATE * dt);
            fed = true;
          }
        }
        egg.tended = warmth > 0;
        egg.fed = fed;

        if (warmth > 0) egg.age += dt * warmth;
        if (egg.age >= CONFIG.EGG_HATCH_TIME) hatched.push(egg);
      }
      // Hatch outside the loop so we don't mutate the list mid-iteration.
      for (const egg of hatched) {
        c.eggs.splice(c.eggs.indexOf(egg), 1);
        const ex = Math.round(egg.x);
        const ey = Math.round(egg.y);
        const spot = isPassable(this.grid, ex, ey, 1)
          ? { x: ex, y: ey }
          : this.freeTileNear(ex, ey, 1);
        c.addAnt(egg.caste, spot.x, spot.y);
      }
    }
  }

  // Queens lay eggs; faster while boosted by a recent mating.
  _updateLaying(dt) {
    for (const c of this.colonies) {
      const q = c.queen;
      if (!q || q.hp <= 0) continue;
      if (q.layBoostTimer > 0) q.layBoostTimer -= dt;
      const interval = q.layBoostTimer > 0
        ? CONFIG.LAY_INTERVAL * CONFIG.LAY_BOOST_FACTOR
        : CONFIG.LAY_INTERVAL;
      q.layTimer += dt;
      if (q.layTimer >= interval) {
        q.layTimer -= interval;
        const spot = this.freeTileNear(Math.round(q.x), Math.round(q.y), 1);
        c.addEgg(spot.x, spot.y);
      }
    }
  }

  // Decide who attacks whom. Enemies hunt the player at long range; everyone
  // (player included) auto-attacks any enemy that wanders close, as long as
  // they aren't busy with a deliberate loot/dig/return order.
  _assignCombat() {
    // 1) Enemy colonies actively hunt the player.
    for (const c of this.colonies) {
      if (c.isPlayer || c.isWild) continue; // wildlife has its own behavior
      for (const a of c.allAnts()) {
        if (a.isNursery || a.isDrone) continue; // nurses & drones never fight
        if (this._hasLiveAttack(a)) continue;
        const range = a.isQueen ? CONFIG.ATTACK_RANGE + 0.5 : CONFIG.AGGRO_RANGE;
        const near = this.nearestPlayerAnt(a);
        if (near && near.ant && near.dist <= range) {
          a.order = { type: 'attack', target: near.ant };
        }
      }
    }

    // 2) Anyone idle (or just walking) bites a nearby enemy. Queens only when
    //    an enemy is right in melee; workers within AUTO_ENGAGE_RANGE.
    const BUSY = {
      loot: 1, dig: 1, returnHome: 1, forage: 1, deliverFood: 1, tend: 1,
      goOutside: 1, forageOutside: 1, comeInside: 1, mine: 1, buildWall: 1, mate: 1,
    };
    for (const a of this.allAnts()) {
      if (a.isNursery || a.isCritter || a.isDrone) continue; // these never fight
      if (this._hasLiveAttack(a)) continue;
      const o = a.order;
      if (o && BUSY[o.type]) continue; // don't interrupt a deliberate job
      // Warriors are aggressive and seek enemies from afar; queens only bite in
      // melee; everyone else engages only what's right next to them.
      const range = a.isQueen
        ? CONFIG.ATTACK_RANGE + 0.5
        : a.isWarrior
        ? CONFIG.AGGRO_RANGE
        : CONFIG.AUTO_ENGAGE_RANGE;
      const foe = this.nearestEnemyAnt(a, range);
      if (foe) a.order = { type: 'attack', target: foe };
    }
  }

  _hasLiveAttack(ant) {
    const o = ant.order;
    return !!(o && o.type === 'attack' && o.target && o.target.hp > 0);
  }

  _runOrder(ant, dt) {
    const o = ant.order;
    if (!o) return;
    const grid = this.gridFor(ant.area);
    const ix = Math.round(ant.x);
    const iy = Math.round(ant.y);

    switch (o.type) {
      case 'move': {
        if (!ant.isMoving()) ant.order = null; // arrived
        break;
      }

      case 'attack': {
        const t = o.target;
        if (!t || t.hp <= 0) { ant.order = null; break; }
        const d = Math.hypot(t.cx - ant.cx, t.cy - ant.cy);
        if (d <= CONFIG.ATTACK_RANGE) {
          ant.stop();
          ant.faceTarget(t);
          if (ant.attackTimer <= 0) {
            t.hp -= ant.damage * (1 - (t.defense || 0));
            t.regenCooldown = CONFIG.HEAL_DELAY; // attacked: pause its healing
            ant.attackTimer = CONFIG.ATTACK_COOLDOWN;
          }
        } else {
          ant.repathTimer -= dt;
          if (!ant.isMoving() || ant.repathTimer <= 0) {
            ant.repathTimer = 0.5;
            const p = findPath(grid, ix, iy, Math.round(t.x), Math.round(t.y), ant.size);
            if (p) ant.setPath(p);
          }
        }
        break;
      }

      case 'dig': {
        if (grid.isTunnel(o.tx, o.ty)) { ant.order = null; break; } // already open
        if (tileAdjacentToAnt(ant, o.tx, o.ty)) {
          ant.stop();
          ant.faceAngle(Math.atan2(o.ty + 0.5 - ant.cy, o.tx + 0.5 - ant.cx));
          ant.digTimer += dt;
          if (ant.digTimer >= CONFIG.DIG_TIME) {
            grid.set(o.tx, o.ty, CONFIG.TILE_TUNNEL);
            ant.digTimer = 0;
            ant.order = null;
          }
        } else {
          ant.digTimer = 0;
          if (!ant.isMoving()) {
            const p = findPathAdjacent(grid, ix, iy, o.tx, o.ty, ant.size);
            if (p) ant.setPath(p);
            else ant.order = null;
          }
        }
        break;
      }

      case 'loot': {
        const egg = o.egg;
        if (!egg || egg.carrier) { ant.order = null; break; }
        const d = Math.hypot(egg.x + 0.5 - ant.cx, egg.y + 0.5 - ant.cy);
        if (d <= 1.2) {
          // Pick it up and head home.
          this.removeEgg(egg);
          egg.carrier = ant;
          ant.carrying = egg;
          ant.order = { type: 'returnHome' };
        } else if (!ant.isMoving()) {
          const p =
            findPath(grid, ix, iy, Math.round(egg.x), Math.round(egg.y), ant.size) ||
            findPathAdjacent(grid, ix, iy, Math.round(egg.x), Math.round(egg.y), ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'returnHome': {
        const home = ant.colony.queen;
        if (!home || home.hp <= 0) { ant.order = null; break; }
        const d = Math.hypot(home.cx - ant.cx, home.cy - ant.cy);
        if (d <= 3) {
          if (ant.carrying) {
            const spot = this.freeTileNear(Math.round(home.x), Math.round(home.y), 1);
            const egg = ant.carrying;
            egg.x = spot.x;
            egg.y = spot.y;
            egg.carrier = null;
            ant.colony.addExistingEgg(egg);
            ant.carrying = null;
          }
          ant.order = null;
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, Math.round(home.x), Math.round(home.y), ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'forage': {
        const food = o.food;
        if (!food || food.carrier || this.foods.indexOf(food) === -1) { ant.order = null; break; }
        const d = Math.hypot(food.x + 0.5 - ant.cx, food.y + 0.5 - ant.cy);
        if (d <= 1.1) {
          this.foods.splice(this.foods.indexOf(food), 1);
          food.carrier = ant;
          ant.carriedFood = food;
          ant.order = { type: 'deliverFood' };
        } else if (!ant.isMoving()) {
          const p =
            findPath(grid, ix, iy, food.x, food.y, ant.size) ||
            findPathAdjacent(grid, ix, iy, food.x, food.y, ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'deliverFood': {
        if (!ant.carriedFood) { ant.order = null; break; }
        const nurse = this.nearestColonyNursery(ant);
        if (!nurse) { this._dropFood(ant); ant.order = null; break; }
        const d = Math.hypot(nurse.cx - ant.cx, nurse.cy - ant.cy);
        if (d <= 1.6) {
          nurse.food += 1;
          ant.carriedFood = null;
          ant.order = null;
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, Math.round(nurse.x), Math.round(nurse.y), ant.size);
          if (p) ant.setPath(p);
          else { this._dropFood(ant); ant.order = null; }
        }
        break;
      }

      case 'tend': {
        const egg = o.egg;
        if (!egg || egg.colony !== ant.colony || ant.colony.eggs.indexOf(egg) === -1) {
          ant.order = null;
          break;
        }
        const d = Math.hypot(egg.x + 0.5 - ant.cx, egg.y + 0.5 - ant.cy);
        if (d <= 1.2) {
          ant.stop(); // sit with the egg; feeding happens in _updateEggs
        } else if (!ant.isMoving()) {
          const p =
            findPath(grid, ix, iy, Math.round(egg.x), Math.round(egg.y), ant.size) ||
            findPathAdjacent(grid, ix, iy, Math.round(egg.x), Math.round(egg.y), ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'mate': {
        const q = ant.colony.queen;
        if (!q || q.hp <= 0) { ant.order = null; break; }
        const d = Math.hypot(q.cx - ant.cx, q.cy - ant.cy);
        if (d <= CONFIG.MATE_RANGE) {
          // Mate: pop a heart, boost the queen's laying, and the drone expires.
          this.hearts.push({ x: q.cx, y: q.cy - 0.5, age: 0 });
          q.layBoostTimer = CONFIG.LAY_BOOST_DURATION;
          ant.hp = 0;
          ant.dead = true; // drones die after mating (don't let regen revive them)
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, Math.round(q.x), Math.round(q.y), ant.size) ||
            findPathAdjacent(grid, ix, iy, Math.round(q.x), Math.round(q.y), ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      // --- Forager travel between areas -----------------------------------

      case 'goOutside': {
        const c = ant.colony;
        if (!c.surfaceOpen || !c.entranceUnder) { ant.order = null; break; }
        const e = c.entranceUnder;
        const d = Math.hypot(e.x + 0.5 - ant.cx, e.y + 0.5 - ant.cy);
        if (d <= 1.2) {
          // Climb up to the surface; next job is assigned by caste.
          ant.area = 'outside';
          ant.x = c.entranceOut.x;
          ant.y = c.entranceOut.y;
          ant.stop();
          ant.order = null;
        } else if (!ant.isMoving()) {
          const p =
            findPath(grid, ix, iy, e.x, e.y, ant.size) ||
            findPathAdjacent(grid, ix, iy, e.x, e.y, ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'forageOutside': {
        const food = o.food;
        if (!food || food.carrier || this.foods.indexOf(food) === -1) { ant.order = null; break; }
        const d = Math.hypot(food.x + 0.5 - ant.cx, food.y + 0.5 - ant.cy);
        if (d <= 1.1) {
          this.foods.splice(this.foods.indexOf(food), 1);
          food.carrier = ant;
          ant.carriedFood = food;
          ant.order = { type: 'comeInside' };
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, food.x, food.y, ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'comeInside': {
        const c = ant.colony;
        const e = c.entranceOut;
        const d = Math.hypot(e.x + 0.5 - ant.cx, e.y + 0.5 - ant.cy);
        if (d <= 1.2) {
          // Descend back into the nest.
          ant.area = 'under';
          const eu = c.entranceUnder || { x: c.shaftX, y: 0 };
          ant.x = eu.x;
          ant.y = eu.y;
          ant.stop();
          ant.order = ant.carriedFood ? { type: 'deliverFood' } : null;
        } else if (!ant.isMoving()) {
          const p =
            findPath(grid, ix, iy, e.x, e.y, ant.size) ||
            findPathAdjacent(grid, ix, iy, e.x, e.y, ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      // --- Builder mining & walling ---------------------------------------

      case 'mine': {
        if (grid.isTunnel(o.tx, o.ty)) { ant.digTimer = 0; ant.order = null; break; }
        if (tileAdjacentToAnt(ant, o.tx, o.ty)) {
          ant.stop();
          ant.faceAngle(Math.atan2(o.ty + 0.5 - ant.cy, o.tx + 0.5 - ant.cx));
          ant.digTimer += dt;
          if (ant.digTimer >= CONFIG.DIG_TIME) {
            grid.set(o.tx, o.ty, CONFIG.TILE_TUNNEL);
            ant.dirt = Math.min(CONFIG.BUILDER_MAX_DIRT, ant.dirt + CONFIG.DIRT_PER_DIG);
            ant.digTimer = 0;
            ant.order = null;
          }
        } else {
          ant.digTimer = 0;
          if (!ant.isMoving()) {
            const p = findPathAdjacent(grid, ix, iy, o.tx, o.ty, ant.size);
            if (p) ant.setPath(p);
            else ant.order = null;
          }
        }
        break;
      }

      case 'buildWall': {
        if (!grid.isTunnel(o.tx, o.ty) || ant.dirt < CONFIG.WALL_COST) { ant.digTimer = 0; ant.order = null; break; }
        if (tileAdjacentToAnt(ant, o.tx, o.ty)) {
          ant.stop();
          ant.faceAngle(Math.atan2(o.ty + 0.5 - ant.cy, o.tx + 0.5 - ant.cx));
          ant.digTimer += dt;
          if (ant.digTimer >= CONFIG.DIG_TIME_BUILD) {
            grid.set(o.tx, o.ty, CONFIG.TILE_WALL);
            ant.dirt -= CONFIG.WALL_COST;
            ant.digTimer = 0;
            ant.order = null;
          }
        } else {
          ant.digTimer = 0;
          if (!ant.isMoving()) {
            const p = findPathAdjacent(grid, ix, iy, o.tx, o.ty, ant.size);
            if (p) ant.setPath(p);
            else ant.order = null;
          }
        }
        break;
      }
    }
  }

  _cleanupDead() {
    for (const c of this.colonies) {
      for (const w of c.workers) {
        if (w.hp > 0 && !w.dead) continue;
        if (w.carrying) this._dropEgg(w);
        if (w.carriedFood) this._dropFood(w);
        // A slain critter leaves food behind on the surface.
        if (w.isCritter) {
          for (let i = 0; i < (w.foodDrop || 1); i++) {
            this.foods.push(new Food(Math.round(w.x), Math.round(w.y), 'outside'));
          }
        }
      }
      c.workers = c.workers.filter((w) => w.hp > 0 && !w.dead);
      if (c.queen && c.queen.hp <= 0) {
        if (c.queen.carrying) this._dropEgg(c.queen);
        c.queen = null;
      }
    }
  }

  _dropEgg(ant) {
    const egg = ant.carrying;
    ant.carrying = null;
    egg.carrier = null;
    egg.x = Math.round(ant.x);
    egg.y = Math.round(ant.y);
    // It stays with whoever was carrying it (already transferred on pickup).
    if (ant.colony) ant.colony.addExistingEgg(egg);
  }
}
