// Mouse + keyboard control for the PLAYER colony:
//   - Left click a player ant: select it (Shift to add/toggle).
//   - Left drag: box-select player ants inside (Shift to add).
//   - Left click empty space: clear selection.
//   - Right click: context order for the selection:
//       on an enemy ant  -> attack
//       on an enemy egg  -> loot (carry it home)
//       on dirt          -> dig it out
//       on open tunnel    -> move there
//   - WASD / arrows: drive the selected ants directly.
//
// `selection` is a Set of Ant objects, shared with the game loop.

class InputController {
  constructor(canvas, camera, world, selection) {
    this.canvas = canvas;
    this.camera = camera;
    this.world = world;
    this.grid = world.grid;
    this.selection = selection;

    this.area = 'under';  // which area the player is currently viewing
    this.keys = new Set();
    this.panButtons = new Set(); // on-screen d-pad directions currently held
    this.dragBox = null; // {x0,y0,x1,y1} in screen px while dragging
    this._dragging = false;
    this._moved = false;
    this._shift = false;

    this._bind();
  }

  // Point this controller at a new level's camera/world/selection without
  // re-adding event listeners.
  rebind(camera, world, selection) {
    this.camera = camera;
    this.world = world;
    this.grid = world.grid;
    this.selection = selection;
    this.area = 'under';
    this.dragBox = null;
    this._dragging = false;
    this.keys.clear();
    this.panButtons.clear();
  }

  // Switch which area (and its camera/grid) the player is controlling.
  setView(area, camera, grid) {
    this.area = area;
    this.camera = camera;
    this.grid = grid;
  }

  // --- Coordinate helpers --------------------------------------------------

  _screenXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  _screenToTile(sx, sy) {
    const w = this.camera.screenToWorld(sx, sy);
    return { x: w.x / CONFIG.TILE, y: w.y / CONFIG.TILE };
  }

  // Topmost player ant (in the current area) covering the tile point.
  _playerAntAt(tileX, tileY) {
    if (!this.world.player) return null;
    const ants = this.world.player.allAnts().reverse();
    for (const ant of ants) {
      if (ant.area !== this.area) continue;
      if (
        tileX >= ant.x && tileX < ant.x + ant.size &&
        tileY >= ant.y && tileY < ant.y + ant.size
      ) {
        return ant;
      }
    }
    return null;
  }

  // --- Selection -----------------------------------------------------------

  _clearSelection() {
    this.selection.clear();
  }

  _selectInBox(box) {
    if (!this.world.player) return;
    const a = this._screenToTile(box.x0, box.y0);
    const b = this._screenToTile(box.x1, box.y1);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    for (const ant of this.world.player.allAnts()) {
      if (ant.area !== this.area) continue;
      if (ant.cx >= minX && ant.cx <= maxX && ant.cy >= minY && ant.cy <= maxY) {
        this.selection.add(ant);
      }
    }
  }

  // --- Commands ------------------------------------------------------------

  _command(tileX, tileY) {
    if (this.selection.size === 0) return;
    const tx = Math.floor(tileX);
    const ty = Math.floor(tileY);

    // On the surface, the only order is "move there".
    if (this.area === 'outside') {
      for (const ant of this.selection) {
        const p = findPath(this.grid, Math.round(ant.x), Math.round(ant.y), tx, ty, ant.size);
        if (p) { ant.setPath(p); ant.order = { type: 'move' }; }
      }
      return;
    }

    const enemyAnt = this.world.enemyAntAt(tileX, tileY);
    const enemyEgg = enemyAnt ? null : this.world.enemyEggAt(tx, ty);
    const isDirt = !this.grid.isTunnel(tx, ty) && this.grid.inBounds(tx, ty);

    for (const ant of this.selection) {
      if (enemyAnt) {
        ant.stop();
        ant.order = { type: 'attack', target: enemyAnt };
      } else if (enemyEgg && !ant.isWarrior) {
        // Workers loot; warriors don't work — they just escort (move).
        ant.stop();
        ant.order = { type: 'loot', egg: enemyEgg };
      } else if (isDirt && !ant.isWarrior) {
        ant.stop();
        ant.order = { type: 'dig', tx, ty };
      } else {
        // Plain move (also the fallback for warriors told to loot/dig).
        const p = findPath(this.grid, Math.round(ant.x), Math.round(ant.y), tx, ty, ant.size);
        if (p) {
          ant.setPath(p);
          ant.order = { type: 'move' };
        }
      }
    }
  }

  // WASD: drive the selected ants (each component -1, 0, or 1).
  getMoveVector() {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w')) dy -= 1;
    if (this.keys.has('s')) dy += 1;
    if (this.keys.has('a')) dx -= 1;
    if (this.keys.has('d')) dx += 1;
    return { dx, dy };
  }

  // Arrow keys + on-screen d-pad: pan the camera (each component -1, 0, or 1).
  getPanVector() {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('arrowup') || this.panButtons.has('up')) dy -= 1;
    if (this.keys.has('arrowdown') || this.panButtons.has('down')) dy += 1;
    if (this.keys.has('arrowleft') || this.panButtons.has('left')) dx -= 1;
    if (this.keys.has('arrowright') || this.panButtons.has('right')) dx += 1;
    return { dx, dy };
  }

  // --- Event wiring --------------------------------------------------------

  _bind() {
    const c = this.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousedown', (e) => {
      const { sx, sy } = this._screenXY(e);
      if (e.button === 0) {
        this._dragging = true;
        this._moved = false;
        this._shift = e.shiftKey;
        this.dragBox = { x0: sx, y0: sy, x1: sx, y1: sy };
      } else if (e.button === 2) {
        e.preventDefault();
        const tile = this._screenToTile(sx, sy);
        this._command(tile.x, tile.y);
      }
    });

    c.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      const { sx, sy } = this._screenXY(e);
      this.dragBox.x1 = sx;
      this.dragBox.y1 = sy;
      const dx = this.dragBox.x1 - this.dragBox.x0;
      const dy = this.dragBox.y1 - this.dragBox.y0;
      if (Math.hypot(dx, dy) > 5) this._moved = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this._dragging) return;
      this._dragging = false;

      if (this._moved) {
        if (!this._shift) this._clearSelection();
        this._selectInBox(this.dragBox);
      } else {
        const tile = this._screenToTile(this.dragBox.x0, this.dragBox.y0);
        const ant = this._playerAntAt(tile.x, tile.y);
        if (ant) {
          if (this._shift) {
            if (this.selection.has(ant)) this.selection.delete(ant);
            else this.selection.add(ant);
          } else {
            this._clearSelection();
            this.selection.add(ant);
          }
        } else if (!this._shift) {
          this._clearSelection();
        }
      }
      this.dragBox = null;
    });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow')) e.preventDefault(); // don't scroll the page
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.panButtons.clear(); });
  }
}
