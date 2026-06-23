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
    this.bridge = null;      // bridge across the ocean {y, x0, x1}
    this.foodGen = null;     // island food generator {x, y}
    this.genFoodTimer = 0;   // accumulates toward the next plain-food drop
    this.genHoneyTimer = 0;  // accumulates toward the next honey drop
    this.smoke = [];         // rising smoke puffs from the generator's spout
    this.smokeTimer = 0;     // accumulates toward the next puff
    this.bullets = [];       // Vincant's glock rounds flying across the surface
  }

  // Carve an ocean into the surface ground, leaving a grassy island beyond it
  // that's only reachable by a single bridge. Drops a food generator on the
  // island so foragers have a reason to cross. Call after the surface is filled
  // with open ground.
  buildOceanAndIsland(surface) {
    const groundTop = surface.rows - CONFIG.SURFACE_GROUND_BAND;
    const islandX0 = surface.cols - CONFIG.ISLAND_WIDTH;
    const oceanX0 = islandX0 - CONFIG.OCEAN_WIDTH;
    // Flood the ocean columns through the whole ground band with water.
    for (let x = oceanX0; x < islandX0; x++) {
      for (let y = groundTop; y < surface.rows; y++) surface.set(x, y, CONFIG.TILE_WATER);
    }
    // Lay a one-tile-wide bridge of walkable ground across the water, near the
    // top of the band, linking the mainland to the island.
    const bridgeY = groundTop + 2;
    for (let x = oceanX0; x < islandX0; x++) surface.set(x, bridgeY, CONFIG.TILE_TUNNEL);
    this.bridge = { y: bridgeY, x0: oceanX0, x1: islandX0 - 1 };
    surface.bridge = this.bridge; // hand the renderer the plank locations
    // Plant the food generator in the middle of the island, just below the bridge.
    const gx = islandX0 + Math.floor(CONFIG.ISLAND_WIDTH / 2);
    const gy = Math.min(surface.rows - 2, bridgeY + 2);
    this.foodGen = { x: gx, y: gy };
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
        if (e.isBeena) continue; // immortal: no point trying to kill her
        const d = Math.hypot(e.cx - ant.cx, e.cy - ant.cy);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    return best && bestD <= maxRange ? best : null;
  }

  // Nearest enemy ant within `range` tiles of a point, in the given area.
  // Used by guards to spot threats closing on the queen.
  nearestEnemyNearPoint(px, py, range, faction, area) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.colonies) {
      if (c.id === faction) continue;
      for (const e of c.allAnts()) {
        if (e.area !== area || e.isBeena) continue;
        const d = Math.hypot(e.cx - px, e.cy - py);
        if (d <= range && d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  // Nearest wild bee in the ant's area within maxRange (skips immortal Beena).
  // Bee-warriors use this to single out bees and nothing else.
  nearestBee(ant, maxRange) {
    if (!this.wild) return null;
    let best = null;
    let bestD = Infinity;
    for (const e of this.wild.workers) {
      if (!this._isHiveGuard(e.critter) || e.hp <= 0 || e.isBeena || e.insideHive) continue;
      if (e.area !== ant.area) continue;
      const d = Math.hypot(e.cx - ant.cx, e.cy - ant.cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best && bestD <= maxRange ? best : null;
  }

  // Nearest wild bug Vincant will hunt: any critter except assassin bugs and
  // the hive's bees (he's friends with the hive).
  nearestHuntableBug(ant) {
    if (!this.wild) return null;
    let best = null, bestD = Infinity;
    for (const e of this.wild.workers) {
      if (e.hp <= 0 || e.insideHive) continue;
      if (e.critter === CONFIG.CRITTER_ASSASSIN || this._isHiveGuard(e.critter)) continue;
      if (e.area !== ant.area) continue;
      const d = Math.hypot(e.cx - ant.cx, e.cy - ant.cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
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

  // Like nearestColonyEgg, but caretakers prefer eggs that have gone cold
  // (untended) so every egg keeps its color, only falling back to the nearest.
  nearestUntendedEgg(ant) {
    let best = null;
    let bestD = Infinity;
    for (const e of ant.colony.eggs) {
      if (e.carrier || e.tended) continue;
      const d = Math.hypot(e.x + 0.5 - ant.cx, e.y + 0.5 - ant.cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best || this.nearestColonyEgg(ant);
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
    const types = [CONFIG.CRITTER_GRASSHOPPER, CONFIG.CRITTER_BEETLE, CONFIG.CRITTER_LADYBUG, CONFIG.CRITTER_STICKBUG];
    for (let i = 0; i < n; i++) {
      const s = this._randomSurface();
      if (!s) continue;
      const type = types[Math.floor(Math.random() * types.length)];
      this.wild.addCritter(type, s.x, s.y);
    }
  }

  // Is this critter type one of the hive's guardians (orbits + defends it)?
  _isHiveGuard(critter) {
    return critter === CONFIG.CRITTER_BEE || critter === CONFIG.CRITTER_ARMORED_BEE ||
      critter === CONFIG.CRITTER_MAJOR_BEE;
  }

  // Place the beehive on the surface and spawn its guardian bees.
  spawnHive(x, y) {
    this.hive = { x, y };
    for (let i = 0; i < CONFIG.BEE_COUNT; i++) this._spawnBee();
    for (let i = 0; i < CONFIG.ARMORED_BEE_COUNT; i++) this._spawnBee(CONFIG.CRITTER_ARMORED_BEE);
    for (let i = 0; i < CONFIG.MAJOR_BEE_COUNT; i++) this._spawnBee(CONFIG.CRITTER_MAJOR_BEE);
  }

  _spawnBee(kind) {
    if (!this.wild || !this.hive) return;
    const ang = Math.random() * Math.PI * 2;
    const r = 1 + Math.random() * 2;
    const x = Math.round(this.hive.x + Math.cos(ang) * r);
    const y = Math.round(this.hive.y + Math.sin(ang) * r);
    const tx = this.surface.inBounds(x, y) && this.surface.isTunnel(x, y) ? x : Math.round(this.hive.x);
    const ty = this.surface.inBounds(x, y) && this.surface.isTunnel(x, y) ? y : Math.round(this.hive.y);
    this.wild.addCritter(kind || CONFIG.CRITTER_BEE, tx, ty);
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
    const wanderers = this.wild.workers.filter((c) => c.hp > 0 &&
      !this._isHiveGuard(c.critter) && c.critter !== CONFIG.CRITTER_ASSASSIN).length;
    if (wanderers < CONFIG.CRITTER_COUNT) this.spawnCritters(1);
    // Keep the hive defended with regular, armored, and major bees.
    if (this.hive) {
      const bees = this.wild.workers.filter((c) => c.hp > 0 && c.critter === CONFIG.CRITTER_BEE).length;
      const armored = this.wild.workers.filter((c) => c.hp > 0 && c.critter === CONFIG.CRITTER_ARMORED_BEE).length;
      const major = this.wild.workers.filter((c) => c.hp > 0 && c.critter === CONFIG.CRITTER_MAJOR_BEE).length;
      if (bees < CONFIG.BEE_COUNT) this._spawnBee();
      else if (armored < CONFIG.ARMORED_BEE_COUNT) this._spawnBee(CONFIG.CRITTER_ARMORED_BEE);
      else if (major < CONFIG.MAJOR_BEE_COUNT) this._spawnBee(CONFIG.CRITTER_MAJOR_BEE);
    }
  }

  // Assassin bugs spawn on a timer (which renting ants can speed up) and hunt
  // the hive's bees. Only relevant once there's a hive with bees to hunt.
  _spawnAssassins(dt) {
    if (!this.wild || !this.hive) return;
    this.assassinTimer = (this.assassinTimer || 0) + dt;
    if (this.assassinTimer < CONFIG.ASSASSIN_SPAWN_INTERVAL) return;
    this.assassinTimer -= CONFIG.ASSASSIN_SPAWN_INTERVAL;
    // Hold the line at the cap — only spawn to replace fallen assassins.
    const alive = this.wild.workers.filter((c) => c.hp > 0 && c.critter === CONFIG.CRITTER_ASSASSIN).length;
    if (alive >= CONFIG.ASSASSIN_MAX) return;
    const s = this._randomSurface();
    if (s) this.wild.addCritter(CONFIG.CRITTER_ASSASSIN, s.x, s.y);
  }

  // Renting ants spend colony food to rent assassins, bringing the next one
  // sooner (advancing the assassin spawn timer).
  _updateRenters(dt) {
    for (const c of this.colonies) {
      if (c.isWild) continue;
      for (const a of c.allAnts()) {
        if (!a.isRenter || a.hp <= 0) continue;
        a.rentTimer = (a.rentTimer || 0) - dt;
        if (a.rentTimer > 0) continue;
        a.rentTimer = CONFIG.RENT_INTERVAL;
        // Pay from any nursery holding enough food.
        const nurse = c.allAnts().find((n) => n.isNursery && n.food >= CONFIG.RENT_COST);
        if (nurse) {
          nurse.food -= CONFIG.RENT_COST;
          this.assassinTimer = (this.assassinTimer || 0) + CONFIG.RENT_SPEEDUP;
          a.speech = { text: 'Rented an assassin!', age: 0 };
        }
      }
    }
  }

  // Vincant: the immortal special drone, one against all. He hunts bugs and
  // patrols the surface, dips underground to feed the eggs, climbs up to the
  // hive to chat with Beena, and trash-talks the whole time. When the colony's
  // Bee Hating is on, he sets all that aside to join the mob jeering at the hive.
  _updateVincant(dt) {
    // Age out Beena's chat reply bubble at the hive.
    if (this.hiveReply) {
      this.hiveReply.age += dt;
      if (this.hiveReply.age > CONFIG.SPEECH_DURATION) this.hiveReply = null;
    }
    for (const c of this.colonies) {
      if (c.isWild) continue;
      for (const v of c.allAnts()) {
        if (!v.isVincant || v.hp <= 0) continue;

        // Trash-talk on a timer — bee-hate jeers while bullying, else his usual.
        v.talkTimer -= dt;
        if (v.talkTimer <= 0) {
          const t = (c.bullyBees && this.hive) ? CONFIG.BEE_HATE_PHRASES : CONFIG.VINCANT_TAUNTS;
          v.speech = { text: t[Math.floor(Math.random() * t.length)], age: 0 };
          v.talkTimer = CONFIG.VINCANT_TALK_MIN +
            Math.random() * (CONFIG.VINCANT_TALK_MAX - CONFIG.VINCANT_TALK_MIN);
        }
        v.chatTimer = (v.chatTimer == null ? CONFIG.VINCANT_CHAT_FIRST : v.chatTimer) - dt;
        v.feedTimer = (v.feedTimer == null ? CONFIG.VINCANT_FEED_INTERVAL : v.feedTimer) - dt;

        // If he's currently tucked INSIDE the hive, hold there until the visit
        // ends, then step back out just below the entrance.
        if (v.insideHive) {
          v.visitTimer -= dt;
          this._fireVincantGlock(v, dt); // pop off rounds at nearby enemies while chatting
          if (v.visitTimer <= 0 && this.hive) {
            v.insideHive = false;
            v.x = Math.round(this.hive.x);
            v.y = Math.round(this.hive.y) + 2;
            v.stop();
            v.chatTimer = CONFIG.VINCANT_CHAT_INTERVAL;
          }
          continue;
        }

        if (this._hasLiveAttack(v)) continue; // finish smashing the current bug

        const ix = Math.round(v.x), iy = Math.round(v.y);

        // 0) Bee-hating: when the colony unleashes it, Vincant drops everything
        // and storms the hive with the mob (non-lethal — he just jeers; Beena and
        // her bees live). Takes priority over visiting/feeding/hunting.
        if (c.bullyBees && this.hive) {
          if (v.area === 'under') { if (c.surfaceOpen) v.order = { type: 'goOutside' }; continue; }
          if (!(v.order && v.order.type === 'bullyHive')) v.order = { type: 'bullyHive' };
          continue;
        }

        // 1) Climb up to the hive and duck INSIDE to chat with Beena.
        if (v.chatTimer <= 0 && this.hive) {
          if (v.area === 'under') { if (c.surfaceOpen) v.order = { type: 'goOutside' }; continue; }
          const dh = Math.hypot(this.hive.x + 0.5 - v.cx, this.hive.y + 0.5 - v.cy);
          if (dh <= 1.6) {
            // Slip inside: hide him within the hive and start the exchange.
            v.stop();
            v.insideHive = true;
            v.visitTimer = CONFIG.VINCANT_VISIT_DURATION;
            v.x = Math.round(this.hive.x);
            v.y = Math.round(this.hive.y);
            v.talkTimer = CONFIG.VINCANT_VISIT_DURATION + 1; // don't let an ambient taunt step on the chat
            const chat = CONFIG.VINCANT_CHAT, rep = CONFIG.BEENA_REPLIES;
            v.speech = { text: chat[Math.floor(Math.random() * chat.length)], age: 0 };
            this.hiveReply = { text: rep[Math.floor(Math.random() * rep.length)], age: 0 };
          } else if (!v.isMoving()) {
            const hx = Math.round(this.hive.x), hy = Math.round(this.hive.y);
            const p = findPath(this.surface, ix, iy, hx, hy, v.size) ||
              findPathAdjacent(this.surface, ix, iy, hx, hy, v.size);
            if (p) v.setPath(p);
          }
          continue;
        }

        // 2) Dip underground to feed the eggs.
        if (v.feedTimer <= 0) {
          if (v.area === 'outside') { v.order = { type: 'comeInside' }; continue; }
          const egg = this.nearestUntendedEgg(v) || this.nearestColonyEgg(v);
          if (egg) {
            const de = Math.hypot(egg.x + 0.5 - v.cx, egg.y + 0.5 - v.cy);
            if (de <= 1.3) { v.stop(); v.feedTimer = CONFIG.VINCANT_FEED_INTERVAL; }
            else v.order = { type: 'tend', egg };
          } else { v.feedTimer = CONFIG.VINCANT_FEED_INTERVAL; }
          continue;
        }

        // 3) Hunt bugs / patrol the surface.
        if (v.area === 'under') { if (c.surfaceOpen) v.order = { type: 'goOutside' }; continue; }
        const prey = this.nearestHuntableBug(v);
        if (prey) { v.order = { type: 'attack', target: prey }; continue; }
        if (!v.isMoving()) {
          const s = this._randomSurface();
          if (s) { const p = findPath(this.surface, ix, iy, s.x, s.y, v.size); if (p) { v.setPath(p); v.order = { type: 'move' }; } }
        }
      }
    }
  }

  // Critter behavior: beetles attack ants, grasshoppers flee, all wander.
  _updateCritters(dt) {
    const wild = this.wild;
    if (!wild) return;
    for (const cr of wild.workers) {
      if (cr.hp <= 0) continue;
      if (cr.insideHive) continue; // a depressed bee sulking inside the hive

      // Bees (and armored bees) swarm intruders near the hive, then circle it.
      if (this._isHiveGuard(cr.critter)) {
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

      // Assassin bugs stalk and kill the hive's bees.
      if (cr.critter === CONFIG.CRITTER_ASSASSIN && !this._hasLiveAttack(cr)) {
        const bee = this.nearestBee(cr, Infinity);
        if (bee) cr.order = { type: 'attack', target: bee };
      }

      if (this._hasLiveAttack(cr)) continue; // already on a live target

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
    this._updateBeeHaters(dt);
    this._updateBeeBullying(dt);
    this._updateRenters(dt);
    this._updateVincant(dt);
    this._spawnFood(dt);
    this._spawnFoodGen(dt);
    this._updateSmoke(dt);
    this._spawnCritters(dt);
    this._spawnAssassins(dt);

    // Run each ant's current order, then advance its movement.
    for (const a of this.allAnts()) {
      this._runOrder(a, dt);
      if (a.attackTimer > 0) a.attackTimer -= dt;
      // Health regen: heal slowly once out of combat for HEAL_DELAY seconds.
      if (a.regenCooldown > 0) a.regenCooldown -= dt;
      else if (!a.dead && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + CONFIG.HEAL_RATE * dt);
      // Age out any speech bubble.
      if (a.speech) { a.speech.age += dt; if (a.speech.age > CONFIG.SPEECH_DURATION) a.speech = null; }
      a.update(dt);
      // Carried things ride along with the ant.
      if (a.carrying) { a.carrying.x = a.x; a.carrying.y = a.y; }
      if (a.carriedFood) { a.carriedFood.x = a.x; a.carriedFood.y = a.y; }
    }

    this._updateEggs(dt);
    this._updateLaying(dt);
    this._updateHearts(dt);
    this._updateBullets(dt);
    this._cleanupDead();
  }

  _updateHearts(dt) {
    for (const h of this.hearts) h.age += dt;
    this.hearts = this.hearts.filter((h) => h.age < CONFIG.HEART_DURATION);
  }

  // Chatter: ants that talk. Bee-haters loiter underground and rant; bee-warriors
  // trash-talk bees while out on patrol.
  _updateBeeHaters(dt) {
    const talkInterval = () => CONFIG.BEEHATER_TALK_MIN + Math.random() *
      (CONFIG.BEEHATER_TALK_MAX - CONFIG.BEEHATER_TALK_MIN);
    for (const c of this.colonies) {
      if (c.isWild) continue;
      for (const a of c.allAnts()) {
        if (a.hp <= 0) continue;

        if (a.isBeeHater) {
          // Rant on a timer.
          a.talkTimer -= dt;
          if (a.talkTimer <= 0) {
            const phrases = CONFIG.BEE_HATE_PHRASES;
            a.speech = { text: phrases[Math.floor(Math.random() * phrases.length)], age: 0 };
            a.talkTimer = talkInterval();
          }
          // Mostly loiter; occasionally shuffle a couple tiles to grumble elsewhere.
          if (!a.order && !a.isMoving() && a.area === 'under') {
            a.wanderTimer += dt;
            if (a.wanderTimer >= CONFIG.CRITTER_WANDER_INTERVAL && Math.random() < 0.5) {
              a.wanderTimer = 0;
              const tx = Math.round(a.x) + (Math.floor(Math.random() * 3) - 1) * 2;
              const ty = Math.round(a.y) + (Math.floor(Math.random() * 3) - 1) * 2;
              if (isPassable(this.grid, tx, ty, 1)) {
                const p = findPath(this.grid, Math.round(a.x), Math.round(a.y), tx, ty, 1);
                if (p) { a.setPath(p); a.order = { type: 'move' }; }
              }
            }
          }
        } else if (a.isBeeWarrior && a.area === 'outside') {
          // Trash-talk bees while patrolling the surface.
          a.talkTimer -= dt;
          if (a.talkTimer <= 0) {
            const phrases = CONFIG.BEE_WARRIOR_TAUNTS;
            a.speech = { text: phrases[Math.floor(Math.random() * phrases.length)], age: 0 };
            a.talkTimer = talkInterval();
          }
        }
      }
    }
  }

  // Bee-bullying: when the player unleashes the bee-haters, they mob the hive.
  // Once they're gathered and trash-talking, a single bee gets depressed,
  // retreats inside to stress-make honey, then returns neutral after a while.
  _updateBeeBullying(dt) {
    if (!this.wild) return;

    // Advance any currently-depressed bee.
    for (const b of this.wild.workers) {
      if (b.critter !== CONFIG.CRITTER_BEE || !b.depressed) continue;
      b.depressTimer -= dt;
      b.honeyTimer -= dt;
      if (b.honeyTimer <= 0) {
        b.honeyTimer = CONFIG.DEPRESSED_HONEY_INTERVAL;
        this._spawnHoneyNearHive(); // stress-baking extra honey
      }
      if (b.depressTimer <= 0) {
        // Comes back out, feeling neutral again.
        b.depressed = false;
        b.insideHive = false;
        if (this.hive) { b.x = Math.round(this.hive.x); b.y = Math.round(this.hive.y); }
        b.stop();
      }
    }

    const p = this.player;
    if (!p || !p.bullyBees || !this.hive) return;

    // Are bee-haters (or Vincant, who joins the jeering) gathered at the hive?
    const mob = p.allAnts().some((a) => (a.isBeeHater || a.isVincant) && a.hp > 0 && a.area === 'outside' &&
      Math.hypot(a.cx - (this.hive.x + 0.5), a.cy - (this.hive.y + 0.5)) <= CONFIG.HIVE_GUARD_RANGE + 3);
    if (!mob) return;

    // Only ever one sad bee at a time.
    const alreadySad = this.wild.workers.some((b) =>
      b.critter === CONFIG.CRITTER_BEE && b.depressed);
    if (alreadySad) return;

    // Pick a victim (never immortal Beena) and send her inside to sulk.
    const victim = this.wild.workers.find((b) =>
      b.critter === CONFIG.CRITTER_BEE && b.hp > 0 && !b.isBeena && !b.insideHive);
    if (victim) {
      victim.depressed = true;
      victim.insideHive = true;
      victim.depressTimer = CONFIG.DEPRESSED_DURATION;
      victim.honeyTimer = CONFIG.DEPRESSED_HONEY_INTERVAL;
      victim.order = null;
      victim.stop();
      victim.x = Math.round(this.hive.x);
      victim.y = Math.round(this.hive.y);
    }
  }

  // Drop a glob of honey on a passable surface tile near the hive.
  _spawnHoneyNearHive() {
    if (!this.hive) return;
    const hx = Math.round(this.hive.x), hy = Math.round(this.hive.y);
    for (let i = 0; i < 12; i++) {
      const tx = hx + Math.floor(Math.random() * 5) - 2;
      const ty = hy + 1 + Math.floor(Math.random() * 3);
      if (!isPassable(this.surface, tx, ty, 1)) continue;
      if (this.foods.some((f) => f.x === tx && f.y === ty)) continue;
      const honey = new Food(tx, ty, 'outside');
      honey.isHoney = true;
      honey.value = CONFIG.HONEY_MIN_VALUE +
        Math.floor(Math.random() * (CONFIG.HONEY_MAX_VALUE - CONFIG.HONEY_MIN_VALUE + 1));
      this.foods.push(honey);
      return;
    }
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
        if (a.order || a.isCritter || a.isQueen || a.isWorker || a.isVincant) continue;

        if (a.isDrone) {
          if (c.queen && c.queen.hp > 0) a.order = { type: 'mate' };
          continue;
        }

        if (a.isWarrior) {
          // Off patrol, warriors are bloodthirsty: they seek out the nearest
          // reachable enemy within hunting range (further than passive aggro,
          // but not a suicidal map-wide rush at the enemy queen). On patrol,
          // the surface patrol takes priority.
          if (!c.patrol) {
            const prey = this.nearestEnemyAnt(a, CONFIG.WARRIOR_HUNT_RANGE);
            if (prey) {
              const g = this.gridFor(a.area);
              const sx = Math.round(a.x), sy = Math.round(a.y);
              const px = Math.round(prey.x), py = Math.round(prey.y);
              const p = findPath(g, sx, sy, px, py, a.size) ||
                findPathAdjacent(g, sx, sy, px, py, a.size);
              if (p) { a.order = { type: 'attack', target: prey }; continue; }
            }
          }
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

        // Bee-warriors only ever hunt bees, and only as part of the surface
        // Bee-warriors deploy on either the warrior patrol or the "Bee Hating"
        // toggle. Neither on → stay home; otherwise out to the hive to pick off
        // bees one by one.
        if (a.isBeeWarrior) {
          const deployed = c.patrol || c.bullyBees;
          if (a.area === 'outside') {
            if (!deployed) {
              a.order = { type: 'comeInside' };
            } else {
              const bee = this.nearestBee(a, Infinity);
              if (bee) {
                const sx = Math.round(a.x), sy = Math.round(a.y);
                const bx = Math.round(bee.x), by = Math.round(bee.y);
                const p = findPath(this.surface, sx, sy, bx, by, a.size) ||
                  findPathAdjacent(this.surface, sx, sy, bx, by, a.size);
                if (p) { a.order = { type: 'attack', target: bee }; continue; }
              }
              // No reachable bee: prowl toward the hive looking for one.
              if (!a.isMoving() && this.hive) {
                const hx = Math.round(this.hive.x) + Math.floor(Math.random() * 5) - 2;
                const hy = Math.round(this.hive.y) + Math.floor(Math.random() * 5) - 2;
                if (isPassable(this.surface, hx, hy, a.size)) {
                  const p = findPath(this.surface, Math.round(a.x), Math.round(a.y), hx, hy, a.size);
                  if (p) { a.setPath(p); a.order = { type: 'move' }; }
                }
              }
            }
          } else if (deployed && c.surfaceOpen) {
            a.order = { type: 'goOutside' };
          }
          continue;
        }

        // Guards: glued to the queen. They attack only enemies that threaten
        // her, then fall back to her side — never roaming off to hunt.
        if (a.isGuard) {
          const q = c.queen;
          if (!q || q.hp <= 0) continue;
          const foe = this.nearestEnemyNearPoint(q.cx, q.cy, CONFIG.GUARD_DEFEND_RANGE, a.faction, a.area);
          if (foe) {
            const g = this.gridFor(a.area);
            const sx = Math.round(a.x), sy = Math.round(a.y);
            const fx = Math.round(foe.x), fy = Math.round(foe.y);
            const p = findPath(g, sx, sy, fx, fy, a.size) || findPathAdjacent(g, sx, sy, fx, fy, a.size);
            if (p) { a.order = { type: 'attack', target: foe }; continue; }
          }
          // No threat: hover right next to the queen.
          const dq = Math.hypot(q.cx - a.cx, q.cy - a.cy);
          if (dq > CONFIG.GUARD_GUARD_DIST + 1 && !a.isMoving()) {
            const spot = this.freeTileNear(Math.round(q.x), Math.round(q.y), 1);
            if (spot) {
              const p = findPath(this.grid, Math.round(a.x), Math.round(a.y), spot.x, spot.y, a.size);
              if (p) { a.setPath(p); a.order = { type: 'move' }; }
            }
          }
          continue;
        }

        // Bee-haters: when the colony unleashes them, they storm out to mob the
        // hive and trash-talk. Otherwise their loitering is handled elsewhere.
        if (a.isBeeHater) {
          if (c.bullyBees && this.hive) {
            if (a.area === 'under' && c.surfaceOpen) { a.order = { type: 'goOutside' }; continue; }
            if (a.area === 'outside') { a.order = { type: 'bullyHive' }; continue; }
          } else if (a.area === 'outside') {
            a.order = { type: 'comeInside' }; // called off — go home
          }
          continue;
        }

        if (a.isNursery) {
          const egg = this.nearestColonyEgg(a);
          if (egg) a.order = { type: 'tend', egg };
          continue;
        }

        // Caretakers stay beside eggs so they keep their color (stay tended),
        // gravitating toward whichever egg has gone untended.
        if (a.isCaretaker) {
          const egg = this.nearestUntendedEgg(a);
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

        // Food-collectors: dedicated gatherers. Normally they collect surface
        // food; when the colony's honey-raid is on, every one of them makes a
        // beeline for the hive to steal honey (worth 2+ food each).
        if (a.isFoodCollector) {
          if (a.carriedFood) {
            if (a.area === 'outside') a.order = { type: 'comeInside' };
            else if (hasNursery) a.order = { type: 'deliverFood' };
            else this._dropFood(a);
          } else if (a.area === 'outside') {
            if (c.honeyRaid && this.hive) {
              a.order = { type: 'stealHoney' };
            } else {
              const food = this.nearestFood(a, 9999);
              if (food) a.order = { type: 'forageOutside', food };
              else if (this.hive) a.order = { type: 'stealHoney' }; // nothing else — raid honey
              else a.order = { type: 'comeInside' };
            }
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

  // Puff smoke out of the generator's vent spout: spawn new puffs on a timer and
  // age the existing ones (they rise/fade; position is derived from age in the
  // renderer). Origin is the spout mouth, up and to the left of the machine.
  _updateSmoke(dt) {
    for (const p of this.smoke) p.age += dt;
    this.smoke = this.smoke.filter((p) => p.age < CONFIG.SMOKE_LIFE);
    if (!this.foodGen) return;
    this.smokeTimer += dt;
    if (this.smokeTimer < CONFIG.SMOKE_INTERVAL) return;
    this.smokeTimer -= CONFIG.SMOKE_INTERVAL;
    // Spout mouth, in tile units (matches the spout drawn in drawFoodGenerator).
    const ox = this.foodGen.x - 0.2 + (Math.random() - 0.5) * 0.2;
    const oy = this.foodGen.y - 1.9;
    this.smoke.push({ x: ox, y: oy, age: 0, drift: (Math.random() - 0.5) * 0.5, seed: Math.random() });
  }

  // Nearest thing Vincant's glock will shoot at, within `range` of (px, py):
  // any rival-colony ant on the surface, or a hostile wild bug (beetle/assassin).
  // Never the hive's bees or immortal Beena.
  _nearestGlockTarget(px, py, range, faction) {
    let best = null, bestD = Infinity;
    for (const c of this.colonies) {
      if (c.id === faction || c.isWild) continue; // skip his own colony + wildlife
      for (const e of c.allAnts()) {
        if (e.area !== 'outside' || e.hp <= 0 || e.isBeena) continue;
        const d = Math.hypot(e.cx - px, e.cy - py);
        if (d <= range && d < bestD) { bestD = d; best = e; }
      }
    }
    if (this.wild) {
      for (const e of this.wild.workers) {
        if (e.hp <= 0 || e.area !== 'outside' || e.insideHive) continue;
        if (e.critter !== CONFIG.CRITTER_BEETLE && e.critter !== CONFIG.CRITTER_ASSASSIN) continue;
        const d = Math.hypot(e.cx - px, e.cy - py);
        if (d <= range && d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  // Vincant fires his glock from inside the hive at the nearest enemy.
  _fireVincantGlock(v, dt) {
    if (!this.hive) return;
    v.glockTimer = (v.glockTimer == null ? 0 : v.glockTimer) - dt;
    if (v.glockTimer > 0) return;
    const sx = this.hive.x + 0.5, sy = this.hive.y + 0.5;
    const tgt = this._nearestGlockTarget(sx, sy, CONFIG.VINCANT_GLOCK_RANGE, v.faction);
    if (!tgt) return; // hold fire when nothing hostile is near
    v.glockTimer = CONFIG.VINCANT_GLOCK_INTERVAL;
    const ang = Math.atan2(tgt.cy - sy, tgt.cx - sx);
    const spd = CONFIG.VINCANT_BULLET_SPEED;
    this.bullets.push({
      x: sx, y: sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      life: CONFIG.VINCANT_BULLET_LIFE, dmg: CONFIG.VINCANT_GLOCK_DMG, faction: v.faction,
    });
    if (typeof Sfx !== 'undefined') Sfx.play('attack'); // glock pop
  }

  // Fly Vincant's glock rounds across the surface; on contact with a valid enemy
  // they deal damage and vanish. Spent/expired/off-map rounds are dropped.
  _updateBullets(dt) {
    if (!this.bullets.length) return;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      const hit = this._nearestGlockTarget(b.x, b.y, 0.6, b.faction);
      if (hit) {
        hit.hp -= b.dmg * (1 - (hit.defense || 0));
        hit.regenCooldown = CONFIG.HEAL_DELAY;
        b.life = 0;
      }
    }
    const s = this.surface;
    this.bullets = this.bullets.filter((b) => b.life > 0 &&
      (!s || (b.x > -1 && b.y > -1 && b.x < s.cols + 1 && b.y < s.rows + 1)));
  }

  // The island's food generator: plain food on one timer, honey on another.
  _spawnFoodGen(dt) {
    if (!this.foodGen || !this.surface) return;
    this.genFoodTimer += dt;
    this.genHoneyTimer += dt;
    if (this.genFoodTimer >= CONFIG.FOODGEN_FOOD_INTERVAL) {
      this.genFoodTimer -= CONFIG.FOODGEN_FOOD_INTERVAL;
      this._dropGenItem(false);
    }
    if (this.genHoneyTimer >= CONFIG.FOODGEN_HONEY_INTERVAL) {
      this.genHoneyTimer -= CONFIG.FOODGEN_HONEY_INTERVAL;
      this._dropGenItem(true);
    }
  }

  // Drop one morsel (or honey glob) on a free island tile near the generator,
  // unless the island is already heaped with the generator's bounty.
  _dropGenItem(isHoney) {
    const g = this.foodGen;
    const R = CONFIG.FOODGEN_RADIUS;
    const near = this.foods.filter((f) => f.area === 'outside' &&
      Math.hypot(f.x - g.x, f.y - g.y) <= R + 0.5).length;
    if (near >= CONFIG.FOODGEN_MAX) return;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * R;
      const tx = Math.round(g.x + Math.cos(a) * r);
      const ty = Math.round(g.y + Math.sin(a) * r);
      if (!this.surface.inBounds(tx, ty) || !this.surface.isTunnel(tx, ty)) continue;
      if (this.foods.some((f) => f.x === tx && f.y === ty)) continue;
      const item = new Food(tx, ty, 'outside');
      if (isHoney) {
        item.isHoney = true;
        item.value = CONFIG.HONEY_MIN_VALUE +
          Math.floor(Math.random() * (CONFIG.HONEY_MAX_VALUE - CONFIG.HONEY_MIN_VALUE + 1));
      }
      this.foods.push(item);
      return;
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
          // A nursery ant with food spends it to grow this egg faster; Vincant
          // feeds eggs for free (he's that good).
          if (!fed && a.isNursery && a.food > 0) {
            warmth += CONFIG.FOOD_BOOST;
            a.food = Math.max(0, a.food - CONFIG.FOOD_CONSUME_RATE * dt);
            fed = true;
          } else if (!fed && a.isVincant) {
            warmth += CONFIG.FOOD_BOOST;
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
        if (typeof Sfx !== 'undefined' && c.isPlayer) Sfx.play('hatch');
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
        // Eggs are laid in the colony's dedicated egg room (fallback: by the queen).
        const at = c.eggRoom || { x: Math.round(q.x), y: Math.round(q.y) };
        const spot = this.freeTileNear(at.x, at.y, 1);
        c.addEgg(spot.x, spot.y);
        if (typeof Sfx !== 'undefined' && c.isPlayer) Sfx.play('lay');
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
        if (a.isBeeWarrior) continue; // bee-warriors only ever fight bees
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
      stealHoney: 1, bullyHive: 1,
    };
    for (const a of this.allAnts()) {
      if (a.isNursery || a.isCritter || a.isDrone) continue; // these never fight
      if (a.isBeeWarrior) continue; // bee-warriors only ever fight bees (below)
      if (a.isGuard) continue; // guards only defend the queen (handled in jobs)
      if (a.isVincant) continue; // Vincant runs his own one-against-all behavior
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
        // Drop the target if it's dead or has slipped into another area (e.g.
        // an ant ducking underground) — otherwise the attacker would chase its
        // stale surface coordinates up into the sky.
        if (!t || t.hp <= 0 || t.area !== ant.area) { ant.order = null; break; }
        const d = Math.hypot(t.cx - ant.cx, t.cy - ant.cy);
        if (d <= CONFIG.ATTACK_RANGE) {
          ant.stop();
          ant.faceTarget(t);
          if (ant.attackTimer <= 0) {
            // Beena is immortal — attacks land (cooldown still ticks) but never
            // chip her health.
            // Invincible while bee-hating: deployed bee-haters and bee-warriors
            // can't be killed as long as their colony's Bee Hating is on.
            const beeHating = (t.isBeeHater || t.isBeeWarrior) && t.colony && t.colony.bullyBees;
            if (!t.isBeena && !t.isVincant && !beeHating) {
              const wasAlive = t.hp > 0;
              t.hp -= ant.damage * (1 - (t.defense || 0));
              t.regenCooldown = CONFIG.HEAL_DELAY; // attacked: pause its healing
              // Warriors get toxic the instant they land a killing blow;
              // bee-warriors gloat with their own anti-bee venom.
              if (wasAlive && t.hp <= 0 && (ant.isWarrior || ant.isBeeWarrior)) {
                const taunts = ant.isBeeWarrior ? CONFIG.BEE_WARRIOR_TAUNTS : CONFIG.WARRIOR_TAUNTS;
                ant.speech = { text: taunts[Math.floor(Math.random() * taunts.length)], age: 0 };
              }
            }
            // Vincant's acid splinter: a corrosive splash that hits every nearby
            // bug (but not the hive's bees or sneaky assassins).
            if (ant.isVincant && this.wild) {
              for (const o of this.wild.workers) {
                if (o === t || o.hp <= 0) continue;
                if (o.critter === CONFIG.CRITTER_ASSASSIN || this._isHiveGuard(o.critter)) continue;
                if (Math.hypot(o.cx - t.cx, o.cy - t.cy) <= CONFIG.VINCANT_SPLINTER_RANGE) {
                  o.hp -= CONFIG.VINCANT_ACID_DAMAGE;
                }
              }
            }
            ant.attackTimer = CONFIG.ATTACK_COOLDOWN;
            if (typeof Sfx !== 'undefined') Sfx.play('attack');
          }
        } else {
          ant.repathTimer -= dt;
          if (!ant.isMoving() || ant.repathTimer <= 0) {
            ant.repathTimer = 0.5;
            const p = findPath(grid, ix, iy, Math.round(t.x), Math.round(t.y), ant.size);
            if (p) ant.setPath(p);
            else ant.order = null; // can't reach them — give up and re-decide
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
            if (typeof Sfx !== 'undefined') Sfx.play('dig');
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
        const queen = ant.colony.queen;
        if (!queen || queen.hp <= 0) { ant.order = null; break; }
        // Carry looted eggs to the egg room (fallback: the queen).
        const dest = ant.colony.eggRoom || { x: Math.round(queen.x), y: Math.round(queen.y) };
        const d = Math.hypot(dest.x + 0.5 - ant.cx, dest.y + 0.5 - ant.cy);
        if (d <= 3) {
          if (ant.carrying) {
            const spot = this.freeTileNear(dest.x, dest.y, 1);
            const egg = ant.carrying;
            egg.x = spot.x;
            egg.y = spot.y;
            egg.carrier = null;
            ant.colony.addExistingEgg(egg);
            ant.carrying = null;
          }
          ant.order = null;
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, dest.x, dest.y, ant.size) ||
            findPathAdjacent(grid, ix, iy, dest.x, dest.y, ant.size);
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
          nurse.food += (ant.carriedFood.value || 1);
          if (typeof Sfx !== 'undefined' && ant.colony.isPlayer) Sfx.play(ant.carriedFood.isHoney ? 'honey' : 'food');
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

      case 'stealHoney': {
        const hive = this.hive;
        if (!hive) { ant.order = ant.carriedFood ? { type: 'comeInside' } : null; break; }
        if (ant.carriedFood) { ant.order = { type: 'comeInside' }; break; }
        const d = Math.hypot(hive.x + 0.5 - ant.cx, hive.y + 0.5 - ant.cy);
        if (d <= 1.6) {
          // Grab a glob of honey — worth more than ordinary food.
          const honey = new Food(Math.round(ant.x), Math.round(ant.y), 'outside');
          honey.isHoney = true;
          honey.value = CONFIG.HONEY_MIN_VALUE +
            Math.floor(Math.random() * (CONFIG.HONEY_MAX_VALUE - CONFIG.HONEY_MIN_VALUE + 1));
          honey.carrier = ant;
          ant.carriedFood = honey;
          ant.order = { type: 'comeInside' };
        } else if (!ant.isMoving()) {
          const p = findPath(grid, ix, iy, Math.round(hive.x), Math.round(hive.y), ant.size) ||
            findPathAdjacent(grid, ix, iy, Math.round(hive.x), Math.round(hive.y), ant.size);
          if (p) ant.setPath(p);
          else ant.order = null;
        }
        break;
      }

      case 'bullyHive': {
        if (!this.hive || !ant.colony.bullyBees) { ant.order = null; break; }
        const hx = this.hive.x, hy = this.hive.y;
        // Gather a few tiles "in front of" (just below) the hive.
        const d = Math.hypot(hx + 0.5 - ant.cx, hy + 2.5 - ant.cy);
        if (d <= 2.2) {
          ant.stop();
          ant.faceAngle(Math.atan2(hy + 0.5 - ant.cy, hx + 0.5 - ant.cx)); // face the hive
        } else if (!ant.isMoving()) {
          const tx = Math.round(hx) + Math.floor(Math.random() * 5) - 2;
          const ty = Math.round(hy) + 2 + Math.floor(Math.random() * 2);
          const gx = isPassable(this.surface, tx, ty, ant.size) ? tx : Math.round(hx);
          const gy = isPassable(this.surface, tx, ty, ant.size) ? ty : Math.round(hy) + 2;
          const p = findPath(this.surface, ix, iy, gx, gy, ant.size) ||
            findPathAdjacent(this.surface, ix, iy, gx, gy, ant.size);
          if (p) ant.setPath(p);
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
            if (typeof Sfx !== 'undefined') Sfx.placeDirt();
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
