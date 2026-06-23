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

  // The open-air surface: sky up top, a grassy ground band near the bottom.
  drawSurfaceGrid(grid) {
    const t = this.t;
    const groundTop = grid.rows - CONFIG.SURFACE_GROUND_BAND;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const px = x * t;
        const py = y * t;
        const r = grid.seed[y][x];
        if (y < groundTop) {
          // Sky.
          let sky = COLORS.sky;
          if (r < 0.3) sky = COLORS.skyDark;
          else if (r > 0.7) sky = COLORS.skyLight;
          this.ctx.fillStyle = sky;
          this.ctx.fillRect(px, py, t, t);
        } else if (grid.get(x, y) === CONFIG.TILE_WATER) {
          this._drawWaterTile(grid, x, y, groundTop);
        } else if (grid.bridge && y === grid.bridge.y && x >= grid.bridge.x0 && x <= grid.bridge.x1) {
          this._drawBridgeTile(grid, x, y);
        } else if (grid.isTunnel(x, y)) {
          let base = COLORS.grassBase;
          if (r < 0.33) base = COLORS.grassDark;
          else if (r > 0.66) base = COLORS.grassLight;
          this.ctx.fillStyle = base;
          this.ctx.fillRect(px, py, t, t);
          // grassy top edge on the first ground row
          if (y === groundTop) {
            this.ctx.fillStyle = COLORS.grassLight;
            this.ctx.fillRect(px, py, t, Math.max(1, t * 0.18));
          }
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

  // An ocean tile: layered blue with a foamy crest on the waterline.
  _drawWaterTile(grid, x, y, groundTop) {
    const t = this.t;
    const px = x * t, py = y * t;
    const r = grid.seed[y][x];
    let base = COLORS.water;
    if (r < 0.33) base = COLORS.waterDark;
    else if (r > 0.66) base = COLORS.waterLight;
    this.ctx.fillStyle = base;
    this.ctx.fillRect(px, py, t, t);
    // Foam crest on the top row of the water (the surface of the sea).
    if (y === groundTop) {
      this.ctx.fillStyle = COLORS.waterFoam;
      this.ctx.fillRect(px, py, t, Math.max(1, t * 0.22));
    }
    // A couple of drifting wave glints, placed deterministically per tile.
    this.ctx.fillStyle = COLORS.waterLight;
    const w = Math.max(2, Math.floor(t * 0.3));
    this.ctx.fillRect(px + Math.floor(r * (t - w)), py + Math.floor(((r * 5.7) % 1) * (t - 2)), w, Math.max(1, t * 0.08));
  }

  // A wooden bridge plank with rope rails along the top and bottom edges.
  _drawBridgeTile(grid, x, y) {
    const t = this.t;
    const px = x * t, py = y * t;
    // Water shows beneath the gaps.
    this.ctx.fillStyle = COLORS.waterDark;
    this.ctx.fillRect(px, py, t, t);
    // Planks (slightly inset so the water peeks through between boards).
    this.ctx.fillStyle = COLORS.bridgePlank;
    this.ctx.fillRect(px, py + Math.floor(t * 0.12), t, Math.floor(t * 0.76));
    this.ctx.fillStyle = COLORS.bridgePlankDark;
    for (let i = 0; i < 3; i++) {
      this.ctx.fillRect(px + Math.floor((i + 0.5) * t / 3), py + Math.floor(t * 0.12), Math.max(1, t * 0.07), Math.floor(t * 0.76));
    }
    // Rope rails.
    this.ctx.fillStyle = COLORS.bridgeRope;
    this.ctx.fillRect(px, py + Math.floor(t * 0.06), t, Math.max(1, t * 0.08));
    this.ctx.fillRect(px, py + t - Math.floor(t * 0.14), t, Math.max(1, t * 0.08));
  }

  // The island's food generator: a chunky gray machine with a glowing yellow
  // window of green gauges and an orange goo blob, a red antenna light, a vent
  // spout, and two articulated robot arms. Drawn centered on its tile.
  drawFoodGenerator(gen) {
    const t = this.t;
    const c = this.ctx;
    c.save();
    c.translate((gen.x + 0.5) * t, (gen.y + 0.5) * t);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    const GRAY = '#b8b8b8', GRAY_D = '#9a9a9a', OUT = '#6f6f6f';
    const bw = t * 0.78;   // half-width of the yellow window
    const bh = t * 1.05;   // half-height of the yellow window
    const capH = t * 0.5;  // height of the top cap / bottom base

    // A two-tone limb segment (dark outline under a gray fill).
    const seg = (x0, y0, x1, y1, w) => {
      c.strokeStyle = OUT; c.lineWidth = w + t * 0.06;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = GRAY; c.lineWidth = w;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    };

    // --- Arms (behind the body) -------------------------------------------
    const armW = t * 0.32;
    // Left arm: reaches up-and-out, then bends down to a flat foot.
    seg(-bw * 1.1, -t * 0.5, -t * 1.75, -t * 0.72, armW); // upper
    seg(-t * 1.75, -t * 0.72, -t * 1.98, t * 0.05, armW); // forearm
    c.strokeStyle = '#111'; c.lineWidth = Math.max(2, t * 0.05); // black sole shadow
    c.beginPath(); c.moveTo(-t * 2.3, t * 0.2); c.lineTo(-t * 1.62, t * 0.05); c.stroke();
    c.fillStyle = GRAY; c.strokeStyle = OUT; c.lineWidth = Math.max(1, t * 0.04);
    c.beginPath();
    c.moveTo(-t * 2.28, t * 0.05); c.lineTo(-t * 1.62, -t * 0.1);
    c.lineTo(-t * 1.58, t * 0.08); c.lineTo(-t * 2.22, t * 0.22);
    c.closePath(); c.fill(); c.stroke();

    // Right arm: a segmented robotic leg bending down-right.
    seg(bw * 1.1, t * 0.0, t * 1.45, t * 0.7, armW * 1.15);
    seg(t * 1.45, t * 0.7, t * 1.72, t * 1.85, armW * 1.15);
    c.strokeStyle = GRAY_D; c.lineWidth = Math.max(1, t * 0.05); // segment joints
    const joints = [[t * 1.18, t * 0.34], [t * 1.45, t * 0.7], [t * 1.55, t * 1.18], [t * 1.64, t * 1.5]];
    for (const [jx, jy] of joints) {
      c.beginPath(); c.arc(jx, jy, armW * 0.55, 0, Math.PI * 2); c.stroke();
    }

    // --- Body frame -------------------------------------------------------
    c.fillStyle = GRAY; c.strokeStyle = OUT; c.lineWidth = Math.max(1, t * 0.05);
    // Top cap and bottom base (wider than the window).
    c.fillRect(-t * 1.0, -bh - capH, t * 2.0, capH); c.strokeRect(-t * 1.0, -bh - capH, t * 2.0, capH);
    c.fillRect(-t * 1.0, bh, t * 2.0, capH); c.strokeRect(-t * 1.0, bh, t * 2.0, capH);

    // Glowing yellow window with a lime border.
    c.fillStyle = '#f2e60c';
    c.fillRect(-bw, -bh, bw * 2, bh * 2);
    c.strokeStyle = '#9bd62a'; c.lineWidth = Math.max(2, t * 0.09);
    c.strokeRect(-bw, -bh, bw * 2, bh * 2);

    // Green gauges: a thick medium-green ring around a dark-green core.
    const dial = (x, y, r) => {
      c.strokeStyle = '#3aa83f'; c.lineWidth = r * 0.62;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#1f8a2e';
      c.beginPath(); c.arc(x, y, r * 0.6, 0, Math.PI * 2); c.fill();
    };
    dial(-t * 0.32, -t * 0.55, t * 0.2);
    dial(t * 0.34, -t * 0.05, t * 0.2);
    dial(-t * 0.34, t * 0.38, t * 0.2);

    // A glistening blob of honey pooled in the lower window.
    c.beginPath();
    c.moveTo(t * 0.02, t * 0.32);
    c.bezierCurveTo(t * 0.4, t * 0.28, t * 0.45, t * 0.55, t * 0.3, t * 0.62);
    c.bezierCurveTo(t * 0.42, t * 0.78, t * 0.2, t * 0.86, t * 0.1, t * 0.74);
    c.bezierCurveTo(-t * 0.06, t * 0.86, -t * 0.22, t * 0.72, -t * 0.12, t * 0.58);
    c.bezierCurveTo(-t * 0.26, t * 0.46, -t * 0.12, t * 0.3, t * 0.02, t * 0.32);
    c.closePath();
    c.fillStyle = '#f2b21f'; c.fill();                 // honey amber
    c.strokeStyle = '#c8860c'; c.lineWidth = Math.max(2, t * 0.06); c.stroke();
    // Glossy highlight so it reads as wet honey.
    c.fillStyle = 'rgba(255, 244, 196, 0.75)';
    c.beginPath(); c.ellipse(-t * 0.04, t * 0.46, t * 0.1, t * 0.05, -0.5, 0, Math.PI * 2); c.fill();

    // --- Top fixtures -----------------------------------------------------
    // Red antenna light on the right of the top cap.
    c.strokeStyle = '#111'; c.lineWidth = Math.max(2, t * 0.045);
    c.beginPath(); c.moveTo(t * 0.42, -bh - capH); c.lineTo(t * 0.42, -bh - capH - t * 0.85); c.stroke();
    c.fillStyle = '#ee1c1c';
    c.beginPath(); c.arc(t * 0.42, -bh - capH - t * 0.98, t * 0.17, 0, Math.PI * 2); c.fill();

    // Vent spout on the left of the top cap, flaring up and tilted outward.
    c.save();
    c.translate(-t * 0.45, -bh - capH);
    c.rotate(-0.28);
    c.fillStyle = GRAY; c.strokeStyle = OUT; c.lineWidth = Math.max(1, t * 0.04);
    c.fillRect(-t * 0.13, -t * 0.72, t * 0.26, t * 0.72); c.strokeRect(-t * 0.13, -t * 0.72, t * 0.26, t * 0.72);
    c.beginPath(); // flared lip
    c.moveTo(-t * 0.24, -t * 0.72); c.lineTo(t * 0.24, -t * 0.72);
    c.lineTo(t * 0.13, -t * 0.98); c.lineTo(-t * 0.13, -t * 0.98);
    c.closePath(); c.fill(); c.stroke();
    c.restore();

    c.restore();
  }

  // A puff of smoke rising from the generator's spout. Position is derived from
  // its age (rises + drifts); it grows and fades as it climbs.
  drawSmoke(puff) {
    const t = this.t;
    const frac = puff.age / CONFIG.SMOKE_LIFE;        // 0 (fresh) -> 1 (gone)
    const cx = (puff.x + puff.drift * puff.age) * t;
    const cy = (puff.y - CONFIG.SMOKE_RISE * puff.age) * t;
    const r = t * (0.16 + 0.42 * frac);               // expands as it rises
    const alpha = 0.45 * (1 - frac);                  // fades out
    const c = this.ctx;
    c.save();
    // A few overlapping blobs make each puff look billowy.
    const shade = 150 + Math.floor(puff.seed * 50);   // varied gray
    c.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
    for (const [ox, oy, rr] of [[0, 0, 1], [-0.5, 0.1, 0.7], [0.5, 0.05, 0.7], [0, -0.4, 0.6]]) {
      c.beginPath();
      c.arc(cx + ox * r, cy + oy * r, r * rr, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // One of Vincant's glock rounds in flight — shaped like a snapping trap-jaw:
  // two curved mandibles (bee-yellow) lined with black bee-stinger teeth, flying
  // jaw-first along its travel direction, wrapped in an acid-green glow.
  drawBullet(b) {
    const t = this.t;
    const c = this.ctx;
    c.save();
    c.translate(b.x * t, b.y * t);
    c.rotate(Math.atan2(b.vy, b.vx)); // point the jaws the way it's flying
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // acid-green glow
    c.fillStyle = 'rgba(120, 220, 90, 0.30)';
    c.beginPath(); c.arc(t * 0.12, 0, t * 0.36, 0, Math.PI * 2); c.fill();

    const L = t * 0.55, gap = t * 0.16; // jaw length, half-gap at the hinge
    // hinge "head" at the back
    c.fillStyle = '#1a1410';
    c.beginPath(); c.arc(-t * 0.06, 0, t * 0.13, 0, Math.PI * 2); c.fill();

    // Two mirrored mandibles, each lined with stinger teeth.
    for (const sgn of [-1, 1]) {
      const P0 = { x: 0, y: sgn * gap };
      const P1 = { x: L * 0.62, y: sgn * gap * 1.7 }; // bow outward...
      const P2 = { x: L, y: sgn * gap * 0.15 };       // ...then curl back toward the tip
      c.strokeStyle = '#f2c12e'; c.lineWidth = Math.max(2, t * 0.1);
      c.beginPath();
      c.moveTo(P0.x, P0.y);
      c.quadraticCurveTo(P1.x, P1.y, P2.x, P2.y);
      c.stroke();
      // Bee-stinger teeth jutting inward along the jaw.
      c.fillStyle = '#1a1410';
      for (const u of [0.3, 0.55, 0.8]) {
        const mu = 1 - u;
        const px = mu * mu * P0.x + 2 * mu * u * P1.x + u * u * P2.x;
        const py = mu * mu * P0.y + 2 * mu * u * P1.y + u * u * P2.y;
        // aim the stinger inward (toward the centerline) and a touch forward
        const il = Math.hypot(0.35, 1);
        const dx = 0.35 / il, dy = -sgn / il;
        const tl = t * 0.17, hw = t * 0.035;
        c.beginPath();
        c.moveTo(px - dy * hw, py + dx * hw);
        c.lineTo(px + dy * hw, py - dx * hw);
        c.lineTo(px + dx * tl, py + dy * tl); // barbed tip
        c.closePath(); c.fill();
      }
    }
    c.restore();
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
      : ant.isVincant ? 1.7
      : ant.isWarrior ? 1.45
      : ant.isForager ? 1.2
      : ant.isBuilder ? 1.05
      : ant.isDrone ? 0.85
      : ant.isCaretaker ? 0.95
      : ant.isBeeHater ? 0.95
      : ant.isBeeWarrior ? 1.4
      : ant.isFoodCollector ? 1.15
      : ant.isGuard ? 1.2
      : ant.isRenter ? 1.0
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

    // Drones (and Vincant, the special drone) have translucent wings.
    if (ant.isDrone || ant.isVincant) {
      this.ctx.fillStyle = 'rgba(220, 232, 255, 0.55)';
      this.ctx.strokeStyle = 'rgba(150, 170, 200, 0.7)';
      this.ctx.lineWidth = Math.max(1, unit * 0.12);
      for (const sgn of [-1, 1]) {
        this.ctx.beginPath();
        this.ctx.ellipse(-unit * 0.8, sgn * unit * 1.1, unit * 1.3, unit * 0.5,
          sgn * 0.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

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
    else if (ant.isVincant) this._drawCrown(hx, hy, t * 0.5);
    else if (ant.isWarrior) this._drawVikingHelmet(hx, hy, gear);
    else if (ant.isNursery) this._drawNurseHat(hx, hy, gear);
    else if (ant.isCaretaker) this._drawNurseHat(hx, hy, gear, true);
    else if (ant.isBeeHater) this._drawNoBee(hx, hy, gear);
    else if (ant.isBeeWarrior) this._drawVikingHelmet(hx, hy, gear, true);
    else if (ant.isFoodCollector) this._drawChickenLeg(hx, hy, gear);
    else if (ant.isGuard) this._drawShield(hx, hy, gear);
    else if (ant.isRenter) this._drawMoneyHat(hx, hy, gear);
    else if (ant.isForager) this._drawForagerHat(hx, hy, gear);
    else if (ant.isBuilder) this._drawHardHat(hx, hy, gear, '#e07b1e'); // orange
    else if (ant.isDrone) { /* drones are bare-headed (winged) */ }
    else this._drawHardHat(hx, hy, gear); // worker: yellow hard hat

    // Vincant gets his name floating above him, like the legend he is — and his
    // glasses right on his head.
    if (ant.isVincant) {
      this._drawGlasses(hx, hy, gear);
      this._drawNameTag(ccx, ccy - t * 0.95 * scale, 'Vincant', t);
    }
  }

  // Cool dark sunglasses, drawn upright on an ant's head.
  _drawGlasses(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy + s * 0.08);
    c.fillStyle = '#0d0d0f';
    c.strokeStyle = '#0d0d0f';
    c.lineWidth = Math.max(1.5, s * 0.1);
    const lw = s * 0.34, lh = s * 0.26, off = s * 0.22;
    // dark wraparound lenses
    c.beginPath(); c.ellipse(-off, 0, lw * 0.55, lh, 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(off, 0, lw * 0.55, lh, -0.15, 0, Math.PI * 2); c.fill();
    // bridge
    c.beginPath(); c.moveTo(-off + lw * 0.35, -s * 0.04); c.lineTo(off - lw * 0.35, -s * 0.04); c.stroke();
    // temple arms
    c.beginPath(); c.moveTo(-off - lw * 0.5, -s * 0.02); c.lineTo(-off - lw * 0.5 - s * 0.18, -s * 0.08); c.stroke();
    c.beginPath(); c.moveTo(off + lw * 0.5, -s * 0.02); c.lineTo(off + lw * 0.5 + s * 0.18, -s * 0.08); c.stroke();
    // a little glint on each lens
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath(); c.arc(-off - s * 0.08, -s * 0.06, s * 0.04, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(off - s * 0.08, -s * 0.06, s * 0.04, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // A floating mating heart that rises and fades.
  drawHeart(h) {
    const t = this.t;
    const a = Math.max(0, 1 - h.age / CONFIG.HEART_DURATION);
    const cx = h.x * t;
    const cy = h.y * t - h.age * 22;
    const s = t * 0.55;
    const c = this.ctx;
    c.save();
    c.globalAlpha = a;
    c.translate(cx, cy);
    c.fillStyle = '#ff4d6d';
    c.beginPath();
    c.moveTo(0, s * 0.32);
    c.bezierCurveTo(s * 0.55, -s * 0.05, s * 0.32, -s * 0.5, 0, -s * 0.18);
    c.bezierCurveTo(-s * 0.32, -s * 0.5, -s * 0.55, -s * 0.05, 0, s * 0.32);
    c.fill();
    c.restore();
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

  // Nursery: white nurse cap with a red cross. Caretakers wear the same cap but
  // with a red X instead of a plus (pass `xMark` true).
  _drawNurseHat(cx, cy, s, xMark) {
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
    // red emblem
    c.fillStyle = '#d52a2a';
    const arm = s * 0.34;
    const th = s * 0.12;
    const cyc = -s * 0.18;
    if (xMark) {
      // diagonal X: two rotated bars
      c.save();
      c.translate(0, cyc);
      c.rotate(Math.PI / 4);
      c.fillRect(-th / 2, -arm / 2, th, arm);
      c.fillRect(-arm / 2, -th / 2, arm, th);
      c.restore();
    } else {
      // upright plus
      c.fillRect(-th / 2, cyc - arm / 2, th, arm);
      c.fillRect(-arm / 2, cyc - th / 2, arm, th);
    }
    c.restore();
  }

  // Caretaker: a nanny's straw boater hat (Mary Poppins style) — a flat-topped
  // straw hat with a navy ribbon band and a little flower.
  _drawNannyHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = '#b88a3c';
    c.lineWidth = Math.max(1, s * 0.05);
    // wide flat straw brim
    c.fillStyle = '#e8c878';
    c.beginPath();
    c.ellipse(0, s * 0.16, s * 0.62, s * 0.2, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // short flat crown
    c.fillStyle = '#edd089';
    c.beginPath();
    c.moveTo(-s * 0.34, s * 0.16);
    c.lineTo(-s * 0.28, -s * 0.22);
    c.lineTo(s * 0.28, -s * 0.22);
    c.lineTo(s * 0.34, s * 0.16);
    c.closePath();
    c.fill();
    c.stroke();
    // flat top
    c.beginPath();
    c.ellipse(0, -s * 0.22, s * 0.28, s * 0.08, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // navy ribbon band around the crown
    c.fillStyle = '#28406b';
    c.beginPath();
    c.moveTo(-s * 0.31, s * 0.04);
    c.lineTo(-s * 0.3, -s * 0.06);
    c.lineTo(s * 0.3, -s * 0.06);
    c.lineTo(s * 0.31, s * 0.04);
    c.closePath();
    c.fill();
    // little red flower tucked into the band
    c.fillStyle = '#e0455e';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(s * 0.22 + Math.cos(a) * s * 0.07, -s * 0.02 + Math.sin(a) * s * 0.07, s * 0.05, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#f4d23a';
    c.beginPath();
    c.arc(s * 0.22, -s * 0.02, s * 0.04, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Bee-hater: a grumpy old-timer's flat cap (newsboy/driver cap).
  _drawFlatCap(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = '#3a2f22';
    c.lineWidth = Math.max(1, s * 0.05);
    // short stiff brim poking forward (+x is the ant's facing, but the hat is
    // drawn upright; a small front peak reads fine from above)
    c.fillStyle = '#5a4a36';
    c.beginPath();
    c.ellipse(s * 0.34, s * 0.1, s * 0.3, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // rounded cap body, slightly slouched
    c.fillStyle = '#6b5942';
    c.beginPath();
    c.ellipse(-s * 0.02, s * 0.02, s * 0.46, s * 0.34, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // button on top
    c.fillStyle = '#4a3c2c';
    c.beginPath();
    c.arc(-s * 0.02, -s * 0.18, s * 0.07, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Renter: a fan of cash worn on the head — a stack of green dollar bills.
  _drawMoneyHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    // a few bills fanned out behind the top one
    for (const a of [-0.35, 0, 0.35]) {
      c.save();
      c.rotate(a);
      c.fillStyle = '#3c9a52';
      c.strokeStyle = '#1f5e32';
      c.lineWidth = Math.max(1, s * 0.04);
      c.beginPath();
      c.rect(-s * 0.42, -s * 0.22, s * 0.84, s * 0.4);
      c.fill();
      c.stroke();
      c.restore();
    }
    // the top bill, with detail
    c.fillStyle = '#4caf63';
    c.strokeStyle = '#1f5e32';
    c.lineWidth = Math.max(1, s * 0.05);
    c.beginPath();
    c.rect(-s * 0.42, -s * 0.22, s * 0.84, s * 0.4);
    c.fill();
    c.stroke();
    // center seal with a $
    c.fillStyle = '#dff3e2';
    c.beginPath();
    c.arc(0, -s * 0.02, s * 0.16, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#1f5e32';
    c.lineWidth = Math.max(1, s * 0.03);
    c.stroke();
    c.fillStyle = '#1f5e32';
    c.font = `bold ${Math.max(7, s * 0.22)}px sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('$', 0, -s * 0.01);
    // corner $ marks
    c.font = `bold ${Math.max(5, s * 0.12)}px sans-serif`;
    c.fillText('$', -s * 0.32, -s * 0.12);
    c.fillText('$', s * 0.32, s * 0.08);
    c.restore();
  }

  // Renter: a dapper black top hat with a gold "$" band — the landlord look.
  _drawTopHat(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#1c1c1c';
    c.strokeStyle = '#000';
    c.lineWidth = Math.max(1, s * 0.04);
    // brim
    c.beginPath();
    c.ellipse(0, s * 0.16, s * 0.5, s * 0.12, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();
    // tall crown
    c.fillRect(-s * 0.28, -s * 0.42, s * 0.56, s * 0.6);
    c.strokeRect(-s * 0.28, -s * 0.42, s * 0.56, s * 0.6);
    // gold band
    c.fillStyle = '#f0c537';
    c.fillRect(-s * 0.28, s * 0.02, s * 0.56, s * 0.12);
    // dollar sign
    c.fillStyle = '#1c1c1c';
    c.font = `bold ${Math.max(7, s * 0.2)}px sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('$', 0, s * 0.09);
    c.restore();
  }

  // Guard: a heraldic shield icon worn on the head.
  _drawShield(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    // shield body
    c.fillStyle = '#c0c6cc';
    c.strokeStyle = '#4a5158';
    c.lineWidth = Math.max(1, s * 0.07);
    c.beginPath();
    c.moveTo(-s * 0.4, -s * 0.42);
    c.lineTo(s * 0.4, -s * 0.42);
    c.lineTo(s * 0.4, s * 0.04);
    c.quadraticCurveTo(s * 0.4, s * 0.42, 0, s * 0.52);
    c.quadraticCurveTo(-s * 0.4, s * 0.42, -s * 0.4, s * 0.04);
    c.closePath();
    c.fill();
    c.stroke();
    // red cross emblem
    c.fillStyle = '#d52a2a';
    const arm = s * 0.5, th = s * 0.14;
    c.fillRect(-th / 2, -s * 0.36, th, arm);
    c.fillRect(-arm / 2, -s * 0.16, arm, th);
    c.restore();
  }

  // Food-collector: a roast chicken drumstick worn on the head. (Don't ask.)
  _drawChickenLeg(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.5);
    c.strokeStyle = '#8a5a2b';
    c.lineWidth = Math.max(1, s * 0.04);
    // meaty drumstick end (top)
    c.fillStyle = '#c98a4b';
    c.beginPath();
    c.ellipse(0, -s * 0.18, s * 0.34, s * 0.4, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // a glossy highlight on the meat
    c.fillStyle = '#e0a868';
    c.beginPath();
    c.ellipse(-s * 0.08, -s * 0.26, s * 0.13, s * 0.17, 0, 0, Math.PI * 2);
    c.fill();
    // the bone sticking out (bottom)
    c.fillStyle = '#f3ead6';
    c.strokeStyle = '#cdbf9e';
    c.beginPath();
    c.moveTo(-s * 0.09, s * 0.12);
    c.lineTo(s * 0.09, s * 0.12);
    c.lineTo(s * 0.06, s * 0.42);
    c.lineTo(-s * 0.06, s * 0.42);
    c.closePath();
    c.fill();
    c.stroke();
    // knobby bone tip
    c.beginPath();
    c.arc(-s * 0.06, s * 0.45, s * 0.08, 0, Math.PI * 2);
    c.arc(s * 0.06, s * 0.45, s * 0.08, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }

  // Bee-hater: a "no bees" badge — a little bee inside a red prohibition circle
  // with a slash through it.
  _drawNoBee(cx, cy, s) {
    const c = this.ctx;
    c.save();
    c.translate(cx, cy);
    const r = s * 0.5;
    // the bee underneath the badge
    c.fillStyle = '#f2c12e';
    c.beginPath();
    c.ellipse(0, 0, r * 0.55, r * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    // bee stripes
    c.fillStyle = '#1a1410';
    c.fillRect(-r * 0.18, -r * 0.42, r * 0.12, r * 0.84);
    c.fillRect(r * 0.06, -r * 0.42, r * 0.12, r * 0.84);
    // tiny wings
    c.fillStyle = 'rgba(230,240,255,0.7)';
    c.beginPath();
    c.ellipse(-r * 0.1, -r * 0.4, r * 0.22, r * 0.13, -0.5, 0, Math.PI * 2);
    c.ellipse(r * 0.1, -r * 0.4, r * 0.22, r * 0.13, 0.5, 0, Math.PI * 2);
    c.fill();
    // red prohibition ring + slash
    c.strokeStyle = '#e0202a';
    c.lineWidth = Math.max(1.5, s * 0.12);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-r * 0.71, -r * 0.71);
    c.lineTo(r * 0.71, r * 0.71);
    c.stroke();
    c.restore();
  }

  // A little speech bubble with a single line of text, drawn upright above an
  // ant. Used by bee-haters to rant.
  drawSpeech(ant) {
    if (!ant.speech) return;
    const t = this.t;
    const c = this.ctx;
    const text = ant.speech.text;
    // Fade out over the last bit of its life.
    const left = CONFIG.SPEECH_DURATION - ant.speech.age;
    const alpha = Math.max(0, Math.min(1, left / 0.6));

    const cx = (ant.x + ant.size / 2) * t;
    const cy = (ant.y + ant.size / 2) * t;
    const fontPx = Math.max(9, t * 0.5);

    c.save();
    c.globalAlpha = alpha;
    c.font = `${fontPx}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const padX = fontPx * 0.5;
    const padY = fontPx * 0.4;
    const w = c.measureText(text).width + padX * 2;
    const h = fontPx + padY * 2;
    const bx = cx;
    const by = cy - t * 0.9 - h / 2; // float above the ant's head

    // bubble
    c.fillStyle = 'rgba(255, 255, 255, 0.95)';
    c.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    c.lineWidth = Math.max(1, t * 0.04);
    this._roundRect(bx - w / 2, by - h / 2, w, h, Math.min(h * 0.4, t * 0.3));
    c.fill();
    c.stroke();
    // little tail pointing down at the ant
    c.beginPath();
    c.moveTo(bx - t * 0.14, by + h / 2 - 1);
    c.lineTo(bx, by + h / 2 + t * 0.28);
    c.lineTo(bx + t * 0.14, by + h / 2 - 1);
    c.closePath();
    c.fill();
    c.stroke();
    // text
    c.fillStyle = '#241c12';
    c.fillText(text, bx, by);
    c.restore();
  }

  // Beena's reply bubble, floating over the hive when Vincant comes to chat.
  drawHiveReply(hive, reply) {
    const t = this.t, c = this.ctx;
    const left = CONFIG.SPEECH_DURATION - reply.age;
    const alpha = Math.max(0, Math.min(1, left / 0.6));
    const text = 'Beena: ' + reply.text;
    const cx = (hive.x + 0.5) * t, cy = (hive.y + 0.5) * t;
    const fontPx = Math.max(9, t * 0.5);
    c.save();
    c.globalAlpha = alpha;
    c.font = `${fontPx}px sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const padX = fontPx * 0.5, padY = fontPx * 0.4;
    const w = c.measureText(text).width + padX * 2, h = fontPx + padY * 2;
    const bx = cx, by = cy - t * 1.8 - h / 2;
    c.fillStyle = 'rgba(255, 247, 214, 0.96)';
    c.strokeStyle = 'rgba(120, 90, 20, 0.7)';
    c.lineWidth = Math.max(1, t * 0.04);
    this._roundRect(bx - w / 2, by - h / 2, w, h, Math.min(h * 0.4, t * 0.3));
    c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(bx - t * 0.14, by + h / 2 - 1);
    c.lineTo(bx, by + h / 2 + t * 0.28);
    c.lineTo(bx + t * 0.14, by + h / 2 - 1);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3a2a08'; c.fillText(text, bx, by);
    c.restore();
  }

  // Rounded-rectangle path helper (fill/stroke applied by the caller).
  _roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Warrior: gray viking helmet with two horns. When `bee` is true it's a
  // bee-warrior's helmet: domed in yellow-and-black bee stripes.
  _drawVikingHelmet(cx, cy, s, bee) {
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
    const r = s * 0.46;
    c.fillStyle = bee ? '#f2c12e' : '#9aa3ad';
    c.strokeStyle = bee ? '#3a2e0a' : '#5c636b';
    c.lineWidth = Math.max(1, s * 0.07);
    c.beginPath();
    c.arc(0, s * 0.02, r, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    // bee stripes: clip to the dome and paint black vertical bands.
    if (bee) {
      c.save();
      c.clip();
      c.fillStyle = '#1a1410';
      for (const bx of [-0.52, -0.12, 0.28]) {
        c.fillRect(bx * s, -r + s * 0.02, s * 0.2, r);
      }
      c.restore();
    }
    c.stroke();
    // metal rim band
    c.fillStyle = bee ? '#3a2e0a' : '#7c848d';
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
    else if (cr.critter === CONFIG.CRITTER_BEE) this._drawBee(t);
    else if (cr.critter === CONFIG.CRITTER_ARMORED_BEE) this._drawBee(t, true);
    else if (cr.critter === CONFIG.CRITTER_MAJOR_BEE) this._drawBee(t, false, true);
    else if (cr.critter === CONFIG.CRITTER_STICKBUG) this._drawStickBug(t);
    else if (cr.critter === CONFIG.CRITTER_ASSASSIN) this._drawAssassin(t);
    else this._drawGrasshopper(t);
    c.restore();

    // (The grasshopper used to wear a pot of grass on its head — removed.)
    // (Beena is no longer a surface bee — she's the queen bee inside the hive.)
  }

  // An upright name label drawn above a critter (not affected by facing).
  _drawNameTag(cx, cy, name, t) {
    const c = this.ctx;
    c.save();
    c.font = `${Math.max(8, t * 0.32)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = Math.max(2, t * 0.06);
    c.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    c.fillStyle = '#fff7d6';
    c.strokeText(name, cx, cy);
    c.fillText(name, cx, cy);
    c.restore();
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

  // Stick bug: a long, twig-thin insect with spindly legs (head toward +x).
  _drawStickBug(t) {
    const c = this.ctx;
    const len = t * 0.7;          // very long, thin body
    const th = t * 0.07;
    c.strokeStyle = '#6b8b3a';
    c.lineCap = 'round';
    // spindly legs (three pairs), angled like twigs
    c.lineWidth = Math.max(1, t * 0.04);
    const legX = [-len * 0.3, 0, len * 0.3];
    for (const lx of legX) {
      c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx - t * 0.12, -t * 0.32); c.lineTo(lx + t * 0.05, -t * 0.5); c.stroke();
      c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx - t * 0.12, t * 0.32); c.lineTo(lx + t * 0.05, t * 0.5); c.stroke();
    }
    // long segmented body (a twig)
    c.strokeStyle = '#7d9b46';
    c.lineWidth = th * 2;
    c.beginPath(); c.moveTo(-len, 0); c.lineTo(len * 0.8, 0); c.stroke();
    // a slight knee/kink near the tail for a twiggy look
    c.strokeStyle = '#5f7a34';
    c.lineWidth = Math.max(1, t * 0.03);
    c.beginPath(); c.moveTo(-len, 0); c.lineTo(-len * 1.25, -t * 0.06); c.stroke();
    // small head + tiny antennae at the front
    c.fillStyle = '#8aab50';
    c.beginPath(); c.arc(len * 0.85, 0, th * 1.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6b8b3a';
    c.lineWidth = Math.max(1, t * 0.03);
    c.beginPath(); c.moveTo(len * 0.95, -th); c.lineTo(len * 1.35, -t * 0.18); c.stroke();
    c.beginPath(); c.moveTo(len * 0.95, th); c.lineTo(len * 1.35, t * 0.18); c.stroke();
    // eye
    c.fillStyle = '#22330f';
    c.beginPath(); c.arc(len * 0.92, -th * 0.5, th * 0.6, 0, Math.PI * 2); c.fill();
  }

  // Assassin bug: a sleek dark-crimson hunter with a sharp curved beak.
  _drawAssassin(t) {
    const c = this.ctx;
    const rx = t * 0.34, ry = t * 0.16;
    // long spindly legs
    c.strokeStyle = '#2a0e0e';
    c.lineCap = 'round';
    c.lineWidth = Math.max(1, t * 0.045);
    for (const i of [-1, 0, 1]) {
      const lx = i * rx * 0.4;
      c.beginPath(); c.moveTo(lx, -ry * 0.6); c.lineTo(lx - rx * 0.15, -ry * 2.2); c.stroke();
      c.beginPath(); c.moveTo(lx, ry * 0.6); c.lineTo(lx - rx * 0.15, ry * 2.2); c.stroke();
    }
    // dark crimson body
    c.fillStyle = '#7a1f1f';
    c.beginPath(); c.ellipse(-rx * 0.1, 0, rx * 0.8, ry, 0, 0, Math.PI * 2); c.fill();
    // orange wing-edge markings
    c.strokeStyle = '#d8742a';
    c.lineWidth = Math.max(1, t * 0.04);
    c.beginPath(); c.ellipse(-rx * 0.1, 0, rx * 0.62, ry * 0.7, 0, 0, Math.PI * 2); c.stroke();
    // head
    c.fillStyle = '#3a1212';
    c.beginPath(); c.arc(rx * 0.7, 0, ry * 0.7, 0, Math.PI * 2); c.fill();
    // the signature curved stabbing beak, pointing forward and down
    c.strokeStyle = '#1a0808';
    c.lineWidth = Math.max(1, t * 0.05);
    c.beginPath();
    c.moveTo(rx * 0.9, 0);
    c.quadraticCurveTo(rx * 1.3, ry * 0.3, rx * 1.25, ry * 0.9);
    c.stroke();
    // antennae
    c.lineWidth = Math.max(1, t * 0.03);
    c.beginPath(); c.moveTo(rx * 0.85, -ry * 0.3); c.lineTo(rx * 1.3, -ry * 1.1); c.stroke();
    c.beginPath(); c.moveTo(rx * 0.85, ry * 0.3); c.lineTo(rx * 1.3, ry * 1.1); c.stroke();
  }

  _drawBee(t, armored, major) {
    const c = this.ctx;
    // Major bees are noticeably larger than the rest of the swarm.
    const scale = major ? 1.5 : 1;
    const rx = t * (armored ? 0.3 : 0.26) * scale;
    const ry = t * (armored ? 0.22 : 0.18) * scale;
    // wings
    c.fillStyle = 'rgba(230, 240, 255, 0.6)';
    c.strokeStyle = 'rgba(150, 170, 200, 0.7)';
    c.lineWidth = Math.max(1, t * 0.03);
    for (const sgn of [-1, 1]) {
      c.beginPath();
      c.ellipse(-rx * 0.2, sgn * ry * 1.1, rx * 0.7, ry * 0.5, sgn * 0.5, 0, Math.PI * 2);
      c.fill(); c.stroke();
    }
    // body
    c.fillStyle = COLORS.bee;
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
    // stripes
    c.fillStyle = COLORS.beeStripe;
    c.fillRect(-rx * 0.5, -ry, rx * 0.22, ry * 2);
    c.fillRect(rx * 0.1, -ry, rx * 0.22, ry * 2);
    // head
    c.fillStyle = COLORS.beeStripe;
    c.beginPath(); c.arc(rx * 0.95, 0, ry * 0.7, 0, Math.PI * 2); c.fill();
    // stinger
    c.beginPath();
    c.moveTo(-rx, 0); c.lineTo(-rx * 1.5, -ry * 0.2); c.lineTo(-rx * 1.5, ry * 0.2); c.closePath();
    c.fill();
    // armored bees wear a riveted steel plate over the abdomen + a helmet.
    if (armored) {
      c.fillStyle = '#b9c2cb';
      c.strokeStyle = '#5c636b';
      c.lineWidth = Math.max(1, t * 0.04);
      c.beginPath(); c.ellipse(-rx * 0.15, 0, rx * 0.7, ry * 0.95, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      // rivets
      c.fillStyle = '#5c636b';
      for (const a of [0, 1, 2, 3]) {
        const ang = Math.PI / 2 + a * Math.PI / 2;
        c.beginPath(); c.arc(-rx * 0.15 + Math.cos(ang) * rx * 0.45, Math.sin(ang) * ry * 0.6, t * 0.02, 0, Math.PI * 2); c.fill();
      }
      // helmet over the head
      c.fillStyle = '#9aa3ad';
      c.beginPath(); c.arc(rx * 0.95, 0, ry * 0.75, Math.PI * 1.1, Math.PI * 1.9); c.fill();
    }
    // Major bees: a darker amber sheen, bolder stripes, and a tiny crown that
    // marks them as the swarm's elite.
    if (major) {
      c.strokeStyle = '#b8860b';
      c.lineWidth = Math.max(1, t * 0.05);
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = COLORS.beeStripe;
      c.fillRect(-rx * 0.15, -ry, rx * 0.22, ry * 2); // extra middle stripe
      // little crown above the head
      c.fillStyle = '#ffd11a';
      c.strokeStyle = '#a86f10';
      c.lineWidth = Math.max(1, t * 0.03);
      const hx = rx * 0.95, cw = ry * 0.9, chy = -ry * 0.95;
      c.beginPath();
      c.moveTo(hx - cw / 2, chy);
      c.lineTo(hx - cw / 2, chy - cw * 0.5);
      c.lineTo(hx - cw / 6, chy - cw * 0.18);
      c.lineTo(hx, chy - cw * 0.6);
      c.lineTo(hx + cw / 6, chy - cw * 0.18);
      c.lineTo(hx + cw / 2, chy - cw * 0.5);
      c.lineTo(hx + cw / 2, chy);
      c.closePath(); c.fill(); c.stroke();
    }
  }

  // A big tree with a beehive hanging in it (surface decoration).
  drawTreeHive(tileX, tileY) {
    const t = this.t;
    const cx = (tileX + 0.5) * t;
    const cy = (tileY + 0.5) * t;
    const c = this.ctx;
    // trunk: from the hive down to the bottom of the surface.
    const trunkH = (CONFIG.SURFACE_ROWS - tileY) * t;
    c.fillStyle = COLORS.treeTrunk;
    c.fillRect(cx - t * 0.4, cy, t * 0.8, trunkH);
    c.fillStyle = COLORS.treeTrunkDark;
    c.fillRect(cx + t * 0.12, cy, t * 0.18, trunkH);
    // a couple of branches
    c.strokeStyle = COLORS.treeTrunk;
    c.lineWidth = t * 0.35;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy - t * 0.4); c.lineTo(cx - t * 1.5, cy - t * 1.5); c.stroke();
    c.beginPath(); c.moveTo(cx, cy - t * 0.4); c.lineTo(cx + t * 1.5, cy - t * 1.5); c.stroke();
    // leafy canopy above the hive — kept compact so it doesn't run off-screen.
    c.fillStyle = COLORS.treeLeafDark;
    for (const [ox, oy, r] of [[-1.7, -2.2, 1.9], [1.7, -2.2, 1.9], [0, -3.1, 2.1], [0, -1.7, 1.9]]) {
      c.beginPath(); c.arc(cx + ox * t, cy + oy * t, r * t, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = COLORS.treeLeaf;
    for (const [ox, oy, r] of [[-1.3, -2.5, 1.45], [1.3, -2.5, 1.45], [0, -3.4, 1.6], [0, -2.1, 1.5], [-1.9, -1.8, 1.15], [1.9, -1.8, 1.15]]) {
      c.beginPath(); c.arc(cx + ox * t, cy + oy * t, r * t, 0, Math.PI * 2); c.fill();
    }
    // hive hanging below the branches at (tileX, tileY) — a big honeycomb nest.
    const hy = cy + t * 0.3;            // hangs a touch lower so it clears the branches
    const HW = t * 1.35, HH = t * 1.7;  // bigger than before (~1.6x)
    c.fillStyle = COLORS.hiveBase;
    c.beginPath(); c.ellipse(cx, hy, HW, HH, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = COLORS.hiveStripe;
    c.lineWidth = Math.max(1, t * 0.14);
    for (let i = -2; i <= 3; i++) {
      c.beginPath();
      c.ellipse(cx, hy + i * t * 0.52, HW, t * 0.32, 0, 0, Math.PI);
      c.stroke();
    }
    // entrance hole
    c.fillStyle = '#3a2616';
    c.beginPath(); c.arc(cx, hy + t * 0.7, t * 0.32, 0, Math.PI * 2); c.fill();
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
    if (food.isHoney) { this._drawHoneycomb(t); c.restore(); return; }
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

  // Honey: a golden honeycomb hexagon with cells and a drip — reads as honey,
  // not just a yellow blob. Drawn centered at the current translate.
  _drawHoneycomb(t) {
    const c = this.ctx;
    const R = t * 0.26;
    // amber drip hanging below
    c.fillStyle = '#e69412';
    c.beginPath();
    c.moveTo(-R * 0.18, R * 0.5);
    c.lineTo(R * 0.18, R * 0.5);
    c.lineTo(0, R * 1.15);
    c.closePath();
    c.fill();
    c.beginPath();
    c.arc(0, R * 1.12, R * 0.16, 0, Math.PI * 2);
    c.fill();
    // hexagon body
    const hex = (rad) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    };
    c.fillStyle = '#f3b521';
    c.strokeStyle = '#a9690a';
    c.lineWidth = Math.max(1, t * 0.05);
    hex(R); c.fill(); c.stroke();
    // little honeycomb cells
    c.strokeStyle = '#c47a0c';
    c.lineWidth = Math.max(1, t * 0.03);
    for (const [ox, oy] of [[0, -R * 0.34], [-R * 0.34, R * 0.18], [R * 0.34, R * 0.18]]) {
      c.save(); c.translate(ox, oy); hex(R * 0.3); c.stroke(); c.restore();
    }
    // glossy shine
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.ellipse(-R * 0.32, -R * 0.34, R * 0.18, R * 0.1, -0.6, 0, Math.PI * 2);
    c.fill();
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
