// A colony is a faction: a queen, her workers, and her eggs, all sharing a tint.

class Colony {
  constructor(id, tint, isPlayer) {
    this.id = id;
    this.tint = tint;      // a key into TINTS; all this colony's ants use it
    this.isPlayer = !!isPlayer;
    this.queen = null;
    this.workers = [];
    this.eggs = [];
    this.patrol = false; // when true, idle warriors patrol the surface
  }

  _claimAnt(ant) {
    ant.colony = this;
    ant.faction = this.id;
    ant.tint = this.tint;
    return ant;
  }

  setQueen(tileX, tileY) {
    this.queen = this._claimAnt(new Ant(CONFIG.ANT_QUEEN, tileX, tileY));
    // Remember the nest center (queen is 2x2) for wander-avoidance.
    this.home = { x: tileX + 1, y: tileY + 1 };
    return this.queen;
  }

  // Add a non-queen ant of the given caste (worker or warrior).
  addAnt(caste, tileX, tileY) {
    const a = this._claimAnt(new Ant(caste, tileX, tileY));
    this.workers.push(a);
    return a;
  }

  addWorker(tileX, tileY) {
    return this.addAnt(CONFIG.ANT_WORKER, tileX, tileY);
  }

  addWarrior(tileX, tileY) {
    return this.addAnt(CONFIG.ANT_WARRIOR, tileX, tileY);
  }

  addNursery(tileX, tileY) {
    return this.addAnt(CONFIG.ANT_NURSERY, tileX, tileY);
  }

  // A neutral wildlife critter (lives in the 'wild' colony).
  addCritter(critterType, tileX, tileY) {
    const cr = this._claimAnt(new Critter(critterType, tileX, tileY));
    this.workers.push(cr);
    return cr;
  }

  // Lay an egg. Caste is random (worker/warrior/nursery) unless one is given.
  addEgg(tileX, tileY, caste) {
    if (!caste) caste = randomCaste();
    const e = new Egg(tileX, tileY, caste);
    e.colony = this;
    e.faction = this.id;
    this.eggs.push(e);
    return e;
  }

  // Take ownership of an existing egg (e.g. one looted from another colony).
  addExistingEgg(egg) {
    egg.colony = this;
    egg.faction = this.id;
    if (this.eggs.indexOf(egg) < 0) this.eggs.push(egg);
    return egg;
  }

  // All living ants (queen first).
  allAnts() {
    const list = this.queen && this.queen.hp > 0 ? [this.queen] : [];
    for (const w of this.workers) if (w.hp > 0) list.push(w);
    return list;
  }

  isDefeated() {
    return (!this.queen || this.queen.hp <= 0) && this.workers.every((w) => w.hp <= 0);
  }
}
