// The underground grid: a 2D field of dirt that we carve tunnels/chambers into.

class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    // Start fully packed with dirt.
    this.tiles = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        row.push(CONFIG.TILE_DIRT);
      }
      this.tiles.push(row);
    }

    // Per-tile pseudo-random seed so dirt specks/shading stay stable
    // across frames (no flickering) without storing extra arrays.
    this.seed = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        row.push(this._hash(x, y));
      }
      this.seed.push(row);
    }
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return CONFIG.TILE_DIRT;
    return this.tiles[y][x];
  }

  set(x, y, type) {
    if (this.inBounds(x, y)) this.tiles[y][x] = type;
  }

  isTunnel(x, y) {
    return this.get(x, y) === CONFIG.TILE_TUNNEL;
  }

  // Carve a filled circular chamber centered on (cx, cy).
  carveChamber(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          this.set(x, y, CONFIG.TILE_TUNNEL);
        }
      }
    }
  }

  // Carve a straight-ish tunnel between two points (simple L / diagonal walk).
  // Carve a wide corridor between two points. `radius` is the brush half-width:
  // radius 1 -> 3 tiles wide. A wide brush means diagonal stretches never pinch
  // down to a single tile, so ants can always squeeze through.
  carveTunnel(x0, y0, x1, y1, radius = 1) {
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
      this._brush(x, y, radius);
      if (x < x1) x++;
      else if (x > x1) x--;
      if (y < y1) y++;
      else if (y > y1) y--;
    }
    this._brush(x1, y1, radius);
  }

  // Carve a filled square of tunnel centered on (cx, cy).
  _brush(cx, cy, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        this.set(x, y, CONFIG.TILE_TUNNEL);
      }
    }
  }

  // Deterministic hash -> 0..1, used for dirt texture variation.
  _hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 0x5f3759df;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return ((h >>> 0) % 1000) / 1000;
  }
}
