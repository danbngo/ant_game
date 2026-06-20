// Grid pathfinding for ants. Ants only walk through tunnel tiles, and an ant
// with footprint `size` needs a `size x size` block of tunnel to occupy a tile.

// Can an ant of footprint `size` stand with its top-left at (x, y)?
function isPassable(grid, x, y, size) {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (!grid.inBounds(x + i, y + j)) return false;
      if (!grid.isTunnel(x + i, y + j)) return false;
    }
  }
  return true;
}

// Is tile (tx, ty) orthogonally adjacent to an ant's footprint?
function tileAdjacentToAnt(ant, tx, ty) {
  const rx = Math.round(ant.x);
  const ry = Math.round(ant.y);
  for (let j = 0; j < ant.size; j++) {
    for (let i = 0; i < ant.size; i++) {
      if (Math.abs(rx + i - tx) + Math.abs(ry + j - ty) === 1) return true;
    }
  }
  return false;
}

// Path to the nearest passable tile orthogonally adjacent to (tx, ty).
// Used to walk up against a dirt tile (to dig) or an egg sitting in a wall.
function findPathAdjacent(grid, sx, sy, tx, ty, size) {
  const neigh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;
  for (const [dx, dy] of neigh) {
    const ax = tx + dx;
    const ay = ty + dy;
    if (!isPassable(grid, ax, ay, size)) continue;
    const p = findPath(grid, sx, sy, ax, ay, size);
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best;
}

// 8-directional BFS from (sx, sy) to (tx, ty). Returns a list of {x, y} tiles
// INCLUDING the start tile, or null if there's no route.
function findPath(grid, sx, sy, tx, ty, size) {
  if (!isPassable(grid, tx, ty, size)) return null;
  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];

  const key = (x, y) => x + ',' + y;
  const came = new Map();
  came.set(key(sx, sy), null);

  const queue = [[sx, sy]];
  let head = 0;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let found = false;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    if (x === tx && y === ty) { found = true; break; }

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      // Don't let diagonal moves cut through a dirt corner.
      if (dx !== 0 && dy !== 0) {
        if (!isPassable(grid, x + dx, y, size)) continue;
        if (!isPassable(grid, x, y + dy, size)) continue;
      }
      if (!isPassable(grid, nx, ny, size)) continue;

      const k = key(nx, ny);
      if (came.has(k)) continue;
      came.set(k, [x, y]);
      queue.push([nx, ny]);
    }
  }

  if (!found && !came.has(key(tx, ty))) return null;

  // Walk the came-from chain back to the start, then reverse.
  const path = [];
  let cur = [tx, ty];
  while (cur) {
    path.push({ x: cur[0], y: cur[1] });
    cur = came.get(key(cur[0], cur[1]));
  }
  path.reverse();
  return path;
}
