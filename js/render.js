// All canvas drawing lives here. Everything is drawn procedurally — no images.

class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = CONFIG.TILE;
  }

  clear(w, h) {
    this.ctx.clearRect(0, 0, w, h);
  }

  drawGrid(grid) {
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const tile = grid.get(x, y);
        if (tile === CONFIG.TILE_TUNNEL) this._drawTunnelTile(grid, x, y);
        else if (tile === CONFIG.TILE_WALL) this._drawWallTile(grid, x, y);
        else this._drawDirtTile(grid, x, y);
      }
    }
  }

  // The open-air surface: grass on open tiles, rocks where it's solid.
  drawSurfaceGrid(grid) {
    const t = this.t;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const px = x * t;
        const py = y * t;
        const r = grid.seed[y][x];
        if (grid.isTunnel(x, y)) {
          let base = COLORS.grassBase;
          if (r < 0.33) base = COLORS.grassDark;
          else if (r > 0.66) base = COLORS.grassLight;
          this.ctx.fillStyle = base;
          this.ctx.fillRect(px, py, t, t);
          // a few blades
          this.ctx.fillStyle = COLORS.grassBlade;
          const s = Math.max(1, Math.floor(t * 0.08));
          this.ctx.fillRect(px + Math.floor(r * (t - s)), py + Math.floor(((r * 5.1) % 1) * (t - s)), s, s * 2);
        } else {
          this.ctx.fillStyle = COLORS.rock;
          this.ctx.fillRect(px, py, t, t);
        }
      }
    }
  }

  // A built wall = a packed mound of dirt (not bricks).
  _drawWallTile(grid, x, y) {
    const t = this.t;
    const px = x * t;
    const py = y * t;
    const r = grid.seed[y][x];
    // Packed dirt, a touch lighter/raised than natural dirt.
    this.ctx.fillStyle = COLORS.wallBase;
    this.ctx.fillRect(px, py, t, t);
    // raised highlight on top-left, shadow on bottom-right for a mound look
    this.ctx.fillStyle = COLORS.wallLight;
    this.ctx.fillRect(px, py, t, Math.max(1, t * 0.16));
    this.ctx.fillRect(px, py, Math.max(1, t * 0.16), t);
    this.ctx.fillStyle = COLORS.wallShade;
    this.ctx.fillRect(px, py + t - Math.max(1, t * 0.16), t, Math.max(1, t * 0.16));
    this.ctx.fillRect(px + t - Math.max(1, t * 0.16), py, Math.max(1, t * 0.16), t);
    // a few dirt clods
    this.ctx.fillStyle = COLORS.wallShade;
    const s = Math.max(2, Math.floor(t * 0.14));
    this.ctx.fillRect(px + Math.floor(r * (t - s)), py + Math.floor(((r * 6.3) % 1) * (t - s)), s, s);
    this.ctx.fillRect(px + Math.floor(((r * 2.7) % 1) * (t - s)), py + Math.floor(((r * 9.1) % 1) * (t - s)), s, s);
  }

  _drawDirtTile(grid, x, y) {
    const t = this.t;
    const px = x * t;
    const py = y * t;
    const r = grid.seed[y][x];

    // Base fill, slightly varied per tile so dirt isn't a flat slab.
    let base = COLORS.dirtBase;
    if (r < 0.33) base = COLORS.dirtDark;
    else if (r > 0.66) base = COLORS.dirtLight;
    this.ctx.fillStyle = base;
    this.ctx.fillRect(px, py, t, t);

    // A couple of darker specks (pebbles) placed deterministically.
    this.ctx.fillStyle = COLORS.dirtSpeck;
    const s = Math.max(2, Math.floor(t * 0.12));
    const sx = px + Math.floor(r * (t - s));
    const sy = py + Math.floor(((r * 7.3) % 1) * (t - s));
    this.ctx.fillRect(sx, sy, s, s);
    const sx2 = px + Math.floor(((r * 3.1) % 1) * (t - s));
    const sy2 = py + Math.floor(((r * 11.7) % 1) * (t - s));
    this.ctx.fillRect(sx2, sy2, s, s);
  }

  _drawTunnelTile(grid, x, y) {
    const t = this.t;
    const px = x * t;
    const py = y * t;

    this.ctx.fillStyle = COLORS.tunnelBase;
    this.ctx.fillRect(px, py, t, t);

    // Shade the edges where tunnel meets dirt, to give a dug-out look.
    this.ctx.fillStyle = COLORS.tunnelEdge;
    const e = Math.max(2, Math.floor(t * 0.18));
    if (!grid.isTunnel(x, y - 1)) this.ctx.fillRect(px, py, t, e);
    if (!grid.isTunnel(x, y + 1)) this.ctx.fillRect(px, py + t - e, t, e);
    if (!grid.isTunnel(x - 1, y)) this.ctx.fillRect(px, py, e, t);
    if (!grid.isTunnel(x + 1, y)) this.ctx.fillRect(px + t - e, py, e, t);
  }

  // Highlight ring drawn under a selected ant (world space).
  drawSelectionRing(ant) {
    const t = this.t;
    const cx = (ant.x + ant.size / 2) * t;
    const cy = (ant.y + ant.size / 2) * t;
    const r = ant.size * t * 0.5;
    this.ctx.save();
    this.ctx.strokeStyle = '#8cff5a';
    this.ctx.lineWidth = Math.max(1.5, t * 0.07);
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // The drag-select rectangle, drawn in SCREEN space (call with identity transform).
  drawDragBox(box) {
    const x = Math.min(box.x0, box.x1);
    const y = Math.min(box.y0, box.y1);
    const w = Math.abs(box.x1 - box.x0);
    const h = Math.abs(box.y1 - box.y0);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(140, 255, 90, 0.12)';
    this.ctx.strokeStyle = 'rgba(140, 255, 90, 0.8)';
    this.ctx.lineWidth = 1.5;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  drawEgg(egg) {
    const t = this.t;
    // Locked to the center of its 1x1 tile. Warrior eggs are bigger than
    // worker eggs.
    const cx = (egg.x + 0.5) * t;
    const cy = (egg.y + 0.5) * t;
    const cf = egg.caste === CONFIG.ANT_FORAGER ? 1.45
      : egg.caste === CONFIG.ANT_WARRIOR ? 1.2
      : 0.8;
    const rx = t * 0.18 * cf;
    const ry = t * 0.26 * cf;

    // When a same-color ant is tending the egg, it warms toward the colony's
    // color; otherwise it's a plain cream shell.
    let shell = COLORS.eggShell;
    let shade = COLORS.eggShade;
    if (egg.tended && egg.colony) {
      const tint = TINTS[egg.colony.tint] || TINTS[DEFAULT_TINT];
      shell = tint.light;
      shade = tint.body;
    }

    this.ctx.save();
    this.ctx.translate(cx, cy);

    // A glowing halo while an ant is tending the egg (brighter when a nursery
    // is actively feeding it), so care is easy to spot.
    if (egg.tended) {
      this.ctx.save();
      this.ctx.globalAlpha = egg.fed ? 0.7 : 0.45;
      this.ctx.fillStyle = egg.fed ? '#ffe27a' : '#ffd24a';
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, rx * (egg.fed ? 2.3 : 1.9), ry * (egg.fed ? 1.9 : 1.6), 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    this.ctx.fillStyle = shell;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // Soft shaded underside.
    this.ctx.fillStyle = shade;
    this.ctx.beginPath();
    this.ctx.ellipse(0, ry * 0.35, rx * 0.7, ry * 0.5, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // Owner marker: a small dot in the colony's color (on the belly).
    if (egg.colony) {
      const tint = TINTS[egg.colony.tint] || TINTS[DEFAULT_TINT];
      this.ctx.fillStyle = tint.body;
      this.ctx.beginPath();
      this.ctx.arc(0, ry * 0.12, rx * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // A small pacifier perched on top of the egg (nudged slightly down).
    const c = this.ctx;
    const gy = -ry * 0.45;          // near the top of the egg
    const gw = rx * 0.5;            // guard half-width
    const gh = rx * 0.24;           // guard half-height
    c.fillStyle = '#5fb0e6';
    c.strokeStyle = '#2c6f9e';
    c.lineWidth = Math.max(1, rx * 0.08);
    // guard plate
    c.beginPath();
    c.ellipse(0, gy, gw, gh, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // teat poking down into the egg
    c.fillStyle = '#ffd9a8';
    c.beginPath();
    c.ellipse(0, gy + gh * 0.7, gw * 0.45, gh * 0.7, 0, 0, Math.PI * 2);
    c.fill();
    // ring handle above the guard
    c.strokeStyle = '#5fb0e6';
    c.lineWidth = Math.max(1, rx * 0.1);
    c.beginPath();
    c.arc(0, gy - gh * 1.6, rx * 0.26, 0, Math.PI * 2);
    c.stroke();

    this.ctx.restore();
  }

  // A small health bar above an ant (world space). Queens always show one;
  // workers only when hurt.
  drawHpBar(ant) {
    if (!ant.isQueen && ant.hp >= ant.maxHp) return;
    const t = this.t;
    const w = ant.size * t * 0.8;
    const h = Math.max(2, t * 0.12);
    const x = (ant.x + ant.size / 2) * t - w / 2;
    const y = ant.y * t - h - 2;
    const frac = Math.max(0, ant.hp / ant.maxHp);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.ctx.fillStyle = frac > 0.5 ? '#5ad24a' : frac > 0.25 ? '#e0c23a' : '#d24a3a';
    this.ctx.fillRect(x, y, w * frac, h);
    this.ctx.restore();
  }

  drawAnt(ant) {
    const t = this.t;
    // Center over the ant's footprint (1x1 worker, 2x2 queen), locked to tiles.
    const cx = (ant.x + ant.size / 2) * t;
    const cy = (ant.y + ant.size / 2) * t;

    // Color comes from the ant's tint; the queen is just bigger + crowned.
    // Warriors are biggest; foragers (older workers) are bigger than workers.
    const scale = ant.isQueen ? 2.2
      : ant.isWarrior ? 1.45
      : ant.isForager ? 1.2
      : ant.isBuilder ? 1.05
      : 0.9;
    const tint = TINTS[ant.tint] || TINTS[DEFAULT_TINT];
    const body = tint.body;
    const bodyLight = tint.light;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(ant.angle);
    this.ctx.scale(scale, scale);

    const unit = t * 0.18; // base size unit for the ant body

    // Legs: three pairs angled off the thorax. Thick + long so they read clearly.
    this.ctx.strokeStyle = tint.leg;
    this.ctx.lineWidth = Math.max(1.5, t * 0.085);
    this.ctx.lineCap = 'round';
    const legLen = unit * 2.3;
    for (let i = -1; i <= 1; i++) {
      const lx = i * unit * 0.9;
      // left leg
      this.ctx.beginPath();
      this.ctx.moveTo(lx, -unit * 0.4);
      this.ctx.lineTo(lx + i * unit * 0.3, -unit * 0.4 - legLen);
      this.ctx.stroke();
      // right leg
      this.ctx.beginPath();
      this.ctx.moveTo(lx, unit * 0.4);
      this.ctx.lineTo(lx + i * unit * 0.3, unit * 0.4 + legLen);
      this.ctx.stroke();
    }

    // Antennae (front of head points along +x after rotation).
    this.ctx.beginPath();
    this.ctx.moveTo(unit * 1.8, -unit * 0.2);
    this.ctx.lineTo(unit * 2.8, -unit * 0.6);
    this.ctx.moveTo(unit * 1.8, unit * 0.2);
    this.ctx.lineTo(unit * 2.8, unit * 0.6);
    this.ctx.stroke();

    // Three body segments: abdomen (back), thorax (mid), head (front).
    this._segment(-unit * 1.4, 0, unit * 1.15, body, bodyLight); // abdomen
    this._segment(0, 0, unit * 0.85, body, bodyLight);           // thorax
    this._segment(unit * 1.5, 0, unit * 0.7, body, bodyLight);   // head

    this.ctx.restore();

    // Headgear per caste, drawn upright (after restore) on the ant's head.
    // The head sits unit*1.5 forward along the facing direction.
    const ccx = (ant.x + ant.size / 2) * t;
    const ccy = (ant.y + ant.size / 2) * t;
    const headDist = unit * 1.5 * scale;
    const hx = ccx + Math.cos(ant.angle) * headDist;
    const hy = ccy + Math.sin(ant.angle) * headDist;
    const gear = t * 0.34 * scale;
    if (ant.isQueen) this._drawCrown(hx, hy, t * 0.5);
    else if (ant.isWarrior) this._drawVikingHelmet(hx, hy, gear);
    else if (ant.isNursery) this._drawNurseHat(hx, hy, gear);
    else if (ant.isForager) this._drawForagerHat(hx, hy, gear);
    else if (ant.isBuilder) this._drawHardHat(hx, hy, gear, '#e07b1e'); // orange
    else this._drawHardHat(hx, hy, gear); // worker: yellow hard hat
  }

  // Construction hard hat (worker/forager yellow; builder passes orange).
  _drawHardHat(cx, cy, s, color) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = color || '#f2b01e';
    c.strokeStyle = '#a9760a';
    c.lineWidth = Math.max(1, s * 0.07);
    // brim
    c.beginPath();
    c.ellipse(0, s * 0.04, s * 0.75, s * 0.24, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // dome
    c.beginPath();
    c.arc(0, s * 0.04, s * 0.5, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    c.stroke();
    // center ridge
    c.beginPath();
    c.moveTo(0, -s * 0.42);
    c.lineTo(0, s * 0.02);
    c.stroke();
    c.restore();
  }

  // Forager: a park-ranger campaign hat (flat wide brim, peaked crown).
  _drawForagerHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = '#3f5e2a';
    c.lineWidth = Math.max(1, s * 0.06);
    // flat wide brim
    c.fillStyle = '#6f8a3f';
    c.beginPath();
    c.ellipse(0, s * 0.1, s * 0.85, s * 0.26, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // peaked crown ("Montana peak")
    c.fillStyle = '#5f7a34';
    c.beginPath();
    c.moveTo(-s * 0.34, s * 0.12);
    c.lineTo(-s * 0.16, -s * 0.46);
    c.lineTo(0, s * 0.0);
    c.lineTo(s * 0.16, -s * 0.46);
    c.lineTo(s * 0.34, s * 0.12);
    c.closePath();
    c.fill();
    c.stroke();
    // hat band
    c.fillStyle = '#435226';
    c.fillRect(-s * 0.34, s * 0.04, s * 0.68, s * 0.07);
    c.restore();
  }

  // Nursery: white nurse cap with a red cross.
  _drawNurseHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#cfcfcf';
    c.lineWidth = Math.max(1, s * 0.06);
    c.beginPath();
    c.arc(0, s * 0.05, s * 0.52, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    c.stroke();
    // red cross
    c.fillStyle = '#d52a2a';
    const arm = s * 0.34;
    const th = s * 0.12;
    const cyc = -s * 0.18;
    c.fillRect(-th / 2, cyc - arm / 2, th, arm);
    c.fillRect(-arm / 2, cyc - th / 2, arm, th);
    c.restore();
  }

  // Warrior: gray viking helmet with two horns.
  _drawVikingHelmet(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    // horns
    c.fillStyle = '#efe6cf';
    c.strokeStyle = '#b1a075';
    c.lineWidth = Math.max(1, s * 0.05);
    for (const dir of [-1, 1]) {
      c.beginPath();
      c.moveTo(dir * s * 0.38, -s * 0.02);
      c.quadraticCurveTo(dir * s * 0.85, -s * 0.18, dir * s * 0.72, -s * 0.62);
      c.quadraticCurveTo(dir * s * 0.52, -s * 0.24, dir * s * 0.22, -s * 0.06);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // dome
    c.fillStyle = '#9aa3ad';
    c.strokeStyle = '#5c636b';
    c.lineWidth = Math.max(1, s * 0.07);
    c.beginPath();
    c.arc(0, s * 0.02, s * 0.46, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    c.stroke();
    // metal rim band
    c.fillStyle = '#7c848d';
    c.fillRect(-s * 0.5, -s * 0.04, s * 1.0, s * 0.12);
    c.restore();
  }

  // Surface wildlife, oriented by facing (head toward +x), drawn upright-ish.
  drawCritter(cr) {
    const t = this.t;
    const cx = (cr.x + 0.5) * t;
    const cy = (cr.y + 0.5) * t;
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.rotate(cr.angle);
    if (cr.critter === CONFIG.CRITTER_LADYBUG) this._drawLadybug(t);
    else if (cr.critter === CONFIG.CRITTER_BEETLE) this._drawBeetle(t);
    else this._drawGrasshopper(t);
    c.restore();

    // The grasshopper wears an upright pot of grass on its head.
    if (cr.critter === CONFIG.CRITTER_GRASSHOPPER) {
      const headDist = t * 0.36;
      const hx = cx + Math.cos(cr.angle) * headDist;
      const hy = cy + Math.sin(cr.angle) * headDist;
      this._drawPotHat(hx, hy, t * 0.55);
    }
  }

  // A little terracotta pot with grass sprouting from it (worn upright).
  _drawPotHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    // grass blades sprouting up
    c.strokeStyle = '#4f9a35';
    c.lineWidth = Math.max(1, s * 0.08);
    c.lineCap = 'round';
    const blades = [[-0.2, -0.55], [-0.07, -0.7], [0.07, -0.64], [0.2, -0.5], [0, -0.74]];
    for (const [bx, by] of blades) {
      c.beginPath();
      c.moveTo(0, -s * 0.02);
      c.quadraticCurveTo(bx * s * 0.5, by * s * 0.6, bx * s, by * s);
      c.stroke();
    }
    // pot body (trapezoid)
    c.fillStyle = '#b5642f';
    c.strokeStyle = '#7d3f18';
    c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath();
    c.moveTo(-s * 0.26, 0);
    c.lineTo(s * 0.26, 0);
    c.lineTo(s * 0.2, s * 0.44);
    c.lineTo(-s * 0.2, s * 0.44);
    c.closePath();
    c.fill();
    c.stroke();
    // pot rim
    c.fillStyle = '#c9743a';
    c.beginPath();
    c.rect(-s * 0.32, -s * 0.09, s * 0.64, s * 0.13);
    c.fill();
    c.stroke();
    // soil
    c.fillStyle = '#3a2616';
    c.fillRect(-s * 0.27, -s * 0.04, s * 0.54, s * 0.06);
    c.restore();
  }

  _drawLadybug(t) {
    const c = this.ctx;
    const r = t * 0.34;
    // black head (front)
    c.fillStyle = '#1a1410';
    c.beginPath();
    c.arc(r * 0.7, 0, r * 0.45, 0, Math.PI * 2);
    c.fill();
    // red shell
    c.fillStyle = '#d62828';
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    // wing split line
    c.strokeStyle = '#1a1410';
    c.lineWidth = Math.max(1, t * 0.05);
    c.beginPath();
    c.moveTo(-r * 0.7, 0);
    c.lineTo(r * 0.5, 0);
    c.stroke();
    // spots
    c.fillStyle = '#1a1410';
    for (const [sx, sy] of [[-0.3, -0.4], [-0.3, 0.4], [0.25, -0.45], [0.25, 0.45], [-0.6, 0]]) {
      c.beginPath();
      c.arc(sx * r, sy * r, r * 0.16, 0, Math.PI * 2);
      c.fill();
    }
  }

  _drawBeetle(t) {
    const c = this.ctx;
    const rx = t * 0.5;
    const ry = t * 0.34;
    // legs
    c.strokeStyle = '#16110b';
    c.lineWidth = Math.max(1, t * 0.06);
    for (const i of [-1, 0, 1]) {
      c.beginPath(); c.moveTo(i * rx * 0.4, -ry * 0.6); c.lineTo(i * rx * 0.5, -ry * 1.1); c.stroke();
      c.beginPath(); c.moveTo(i * rx * 0.4, ry * 0.6); c.lineTo(i * rx * 0.5, ry * 1.1); c.stroke();
    }
    // head + pincer
    c.fillStyle = '#241a10';
    c.beginPath(); c.arc(rx * 0.85, 0, ry * 0.5, 0, Math.PI * 2); c.fill();
    // glossy shell
    c.fillStyle = '#3a2a16';
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a4424';
    c.beginPath(); c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2); c.fill();
    // elytra seam
    c.strokeStyle = '#16110b';
    c.lineWidth = Math.max(1, t * 0.05);
    c.beginPath(); c.moveTo(-rx * 0.9, 0); c.lineTo(rx * 0.5, 0); c.stroke();
  }

  _drawGrasshopper(t) {
    const c = this.ctx;
    const rx = t * 0.5;
    const ry = t * 0.18;
    // antennae
    c.strokeStyle = '#2f5320';
    c.lineWidth = Math.max(1, t * 0.045);
    c.beginPath(); c.moveTo(rx * 0.8, -ry * 0.4); c.lineTo(rx * 1.4, -ry * 1.6); c.stroke();
    c.beginPath(); c.moveTo(rx * 0.8, ry * 0.4); c.lineTo(rx * 1.4, ry * 1.6); c.stroke();
    // big bent hind leg
    c.strokeStyle = '#3f6f28';
    c.lineWidth = Math.max(1, t * 0.08);
    c.beginPath();
    c.moveTo(-rx * 0.5, 0); c.lineTo(-rx * 0.1, -ry * 2.4); c.lineTo(rx * 0.4, -ry * 0.6);
    c.stroke();
    c.beginPath();
    c.moveTo(-rx * 0.5, 0); c.lineTo(-rx * 0.1, ry * 2.4); c.lineTo(rx * 0.4, ry * 0.6);
    c.stroke();
    // elongated green body
    c.fillStyle = '#5aa033';
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
    // head
    c.fillStyle = '#6cb33f';
    c.beginPath(); c.arc(rx * 0.85, 0, ry * 1.2, 0, Math.PI * 2); c.fill();
    // eye
    c.fillStyle = '#1a2a10';
    c.beginPath(); c.arc(rx * 1.05, -ry * 0.4, ry * 0.4, 0, Math.PI * 2); c.fill();
  }

  // A nest entrance hole (shaft top underground, or surface opening).
  drawHole(tileX, tileY) {
    const t = this.t;
    const cx = (tileX + 0.5) * t;
    const cy = (tileY + 0.5) * t;
    const c = this.ctx;
    c.save();
    c.fillStyle = '#140f09';
    c.beginPath();
    c.ellipse(cx, cy, t * 0.44, t * 0.34, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = Math.max(1, t * 0.06);
    c.stroke();
    c.restore();
  }

  // A food morsel on the ground (or carried).
  drawFood(food) {
    const t = this.t;
    const cx = (food.x + 0.5) * t;
    const cy = (food.y + 0.5) * t;
    const r = t * 0.16;
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = COLORS.food;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = COLORS.foodDark;
    c.beginPath();
    c.arc(r * 0.3, r * 0.3, r * 0.55, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.beginPath();
    c.arc(-r * 0.3, -r * 0.35, r * 0.28, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  _drawCrown(cx, cy, sizePx) {
    const w = sizePx;
    const h = sizePx * 0.7;
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.beginPath();
    this.ctx.moveTo(-w / 2, h / 2);     // bottom-left
    this.ctx.lineTo(-w / 2, -h / 2);    // left spike
    this.ctx.lineTo(-w / 4, 0);         // valley
    this.ctx.lineTo(0, -h * 0.75);      // tall center spike
    this.ctx.lineTo(w / 4, 0);          // valley
    this.ctx.lineTo(w / 2, -h / 2);     // right spike
    this.ctx.lineTo(w / 2, h / 2);      // bottom-right
    this.ctx.closePath();
    this.ctx.fillStyle = '#ffd11a';
    this.ctx.fill();
    this.ctx.lineWidth = Math.max(1, sizePx * 0.06);
    this.ctx.strokeStyle = '#9c6f06';
    this.ctx.stroke();
    // Little gems on the spike tips.
    this.ctx.fillStyle = '#e0480f';
    for (const gx of [-w / 2, 0, w / 2]) {
      this.ctx.beginPath();
      this.ctx.arc(gx, gx === 0 ? -h * 0.75 : -h / 2, sizePx * 0.09, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  _segment(x, y, radius, fill, light) {
    this.ctx.fillStyle = fill;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    // Highlight for a bit of roundness.
    this.ctx.fillStyle = light;
    this.ctx.beginPath();
    this.ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.45, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
