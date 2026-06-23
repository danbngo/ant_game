// "Inside the Hive" — a self-contained battle scene shown as an overlay over
// the main game. The hive's bees defend Queen Beena in the center while enemy
// beetles invade from the edges, in an endless skirmish. Bees start out NORMAL
// (no armor, no stinger) and only deal a feeble bonk; Queen Beena tosses out
// armor and stinger power-ups that bees collect to gear up — armor soaks damage,
// a stinger lets them really sting. Touches nothing in the main sim.
const HiveScene = (() => {
  let canvas, ctx, raf = null, open = false, last = 0;
  let fighters = [], eggs = [], bullets = [], potions = [], pools = [], pickups = [], queen = null;

  const EGG_LAY_INTERVAL = 2.5; // queen lays a bee egg this often
  const EGG_HATCH_TIME = 4;     // seconds before an egg hatches into a bee
  const BEE_CAP = 18;           // don't let the hive bees grow without bound
  // Queen Beena's arsenal:
  const GLOCK_INTERVAL = 0.5;   // seconds between glock shots
  const BULLET_DMG = 16;        // glock bullet damage
  const ACID_SPLASH = 9;        // acid splash on bullet impact
  const ACID_RADIUS = 0.06;     // splash radius (fraction of scene size)
  const TRAPJAW_INTERVAL = 0.9; // seconds between trapjaw bites
  const TRAPJAW_DMG = 30;       // trapjaw crunches anything that gets close
  const TRAPJAW_RANGE = 0.11;   // bite reach (fraction of scene size)
  // SPLASH POTION OF ACID: Beena lobs a flask that shatters into a burning
  // acid pool, dousing whole clusters of intruders.
  const POTION_INTERVAL = 3.2;  // seconds between potion throws
  const POTION_FLIGHT = 0.7;    // seconds the flask is airborne
  const POTION_SPLASH = 70;     // burst damage when the flask shatters
  const POTION_RADIUS = 0.14;   // splash + acid-pool radius (fraction of scene)
  const POOL_LIFE = 2.5;        // seconds the acid pool lingers
  const POOL_DPS = 50;          // acid pool damage per second to intruders inside

  const DEFENDERS = 10; // hive bees guarding the queen
  const INVADERS = 6;   // enemy beetles attacking
  const ASSASSINS = 4;  // assassin bugs attacking too

  // Bee gear power-ups Beena drops, and the stats they grant:
  const PICKUP_INTERVAL = 1.6;  // seconds between Beena dropping a power-up
  const PICKUP_MAX = 7;         // cap on power-ups lying around the arena
  const PICKUP_RADIUS = 0.03;   // a bee this close (fraction of S) grabs it
  const BEE_NORMAL_HP = 40;     // a plain bee's health
  const BEE_ARMOR_HP = 100;     // health once it picks up armor
  const BEE_ARMOR_DEF = 0.5;    // fraction of incoming damage armor blocks
  const BEE_NORMAL_DMG = 4;     // a stinger-less bee still bonks for a little
  const BEE_STINGER_DMG = 16;   // a bee with a stinger really hurts
  const BEE_NORMAL_CD = 0.5;    // seconds between a normal bee's hits
  const BEE_STINGER_CD = 0.7;   // seconds between a stinger bee's hits

  function init() {
    canvas = document.getElementById('hive-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    const leave = document.getElementById('hive-leave-btn');
    if (leave) leave.addEventListener('click', close);
    window.addEventListener('resize', () => { if (open) resize(); });
  }

  function resize() {
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
  }

  function S() { return Math.min(canvas.width, canvas.height); }

  function spawn(kind) {
    const w = canvas.width, h = canvas.height, s = S();
    const side = kind === 'bee' ? 'defender' : 'invader';
    let x, y;
    if (side === 'defender') {
      // bees muster around the queen
      const a = Math.random() * Math.PI * 2, r = s * (0.13 + Math.random() * 0.12);
      x = w / 2 + Math.cos(a) * r; y = h / 2 + Math.sin(a) * r;
    } else {
      // invaders (beetles, assassins) storm in from a random edge
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { x = Math.random() * w; y = -20; }
      else if (edge === 1) { x = Math.random() * w; y = h + 20; }
      else if (edge === 2) { x = -20; y = Math.random() * h; }
      else { x = w + 20; y = Math.random() * h; }
    }
    // Bees hatch/arrive NORMAL — they have to grab gear to become armored/stinger.
    const hp = kind === 'beetle' ? 60 : kind === 'assassin' ? 30 : BEE_NORMAL_HP;
    return { kind, side, armor: false, stinger: false, x, y, angle: 0, cd: 0, hp };
  }

  function reset() {
    resize();
    const s = S();
    queen = { x: canvas.width / 2, y: canvas.height / 2, r: s * 0.06, t: 0, layTimer: EGG_LAY_INTERVAL, shootTimer: GLOCK_INTERVAL, biteTimer: TRAPJAW_INTERVAL, potionTimer: POTION_INTERVAL, pickupTimer: PICKUP_INTERVAL };
    fighters = [];
    eggs = [];
    bullets = [];
    potions = [];
    pools = [];
    pickups = [];
    for (let i = 0; i < DEFENDERS; i++) fighters.push(spawn('bee'));
    for (let i = 0; i < INVADERS; i++) fighters.push(spawn('beetle'));
    for (let i = 0; i < ASSASSINS; i++) fighters.push(spawn('assassin'));
  }

  function open_() {
    if (!canvas) return;
    open = true;
    document.getElementById('hive-screen').style.display = 'flex';
    reset();
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function close() {
    open = false;
    const scr = document.getElementById('hive-screen');
    if (scr) scr.style.display = 'none';
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  function nearestEnemy(b) {
    let best = null, bestD = Infinity;
    for (const o of fighters) {
      if (o.side === b.side || o.hp <= 0) continue;
      const d = (o.x - b.x) ** 2 + (o.y - b.y) ** 2;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  // Nearest power-up a bee still wants (armor if unarmored, stinger if it has none).
  function nearestWantedPickup(b) {
    let best = null, bestD = Infinity;
    for (const p of pickups) {
      if (p.taken) continue;
      if (p.kind === 'armor' && b.armor) continue;
      if (p.kind === 'stinger' && b.stinger) continue;
      const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function update(dt) {
    const s = S();
    queen.t += dt;
    for (const f of fighters) {
      f.cd -= dt;
      // beetles are slow, assassins fast, bees in between
      const speed = s * (f.kind === 'beetle' ? 0.1 : f.kind === 'assassin' ? 0.22 : 0.18);
      const target = nearestEnemy(f);
      // A defender bee detours to grab gear it still wants — unless an enemy is
      // already right in its face (then it fights instead).
      let pickup = null;
      if (f.side === 'defender' && f.hp > 0) {
        const enemyClose = target && Math.hypot(target.x - f.x, target.y - f.y) <= s * 0.08;
        if (!enemyClose) pickup = nearestWantedPickup(f);
      }

      let tx, ty;
      if (pickup) { tx = pickup.x; ty = pickup.y; }
      else if (target) { tx = target.x; ty = target.y; }
      else { tx = queen.x; ty = queen.y; } // invaders converge on the queen; bees guard her
      const dx = tx - f.x, dy = ty - f.y;
      const dist = Math.hypot(dx, dy) || 1;
      f.angle = Math.atan2(dy, dx);

      if (pickup) {
        // Walk to the power-up and equip it on contact.
        if (dist > s * PICKUP_RADIUS) {
          f.x += (dx / dist) * speed * dt;
          f.y += (dy / dist) * speed * dt;
        } else {
          if (pickup.kind === 'armor') { f.armor = true; f.hp = Math.max(f.hp, BEE_ARMOR_HP); }
          else { f.stinger = true; }
          pickup.taken = true;
        }
      } else {
        const reach = s * 0.05;
        if (dist > reach) {
          f.x += (dx / dist) * speed * dt;
          f.y += (dy / dist) * speed * dt;
        } else if (target && f.cd <= 0) {
          let dmg = f.kind === 'beetle' ? 10 : f.kind === 'assassin' ? 12
            : (f.stinger ? BEE_STINGER_DMG : BEE_NORMAL_DMG); // normal bees still bonk a little
          // Armor on a defender target soaks part of the blow.
          if (target.side === 'defender' && target.armor) dmg *= (1 - BEE_ARMOR_DEF);
          target.hp -= dmg;
          f.cd = f.kind === 'beetle' ? 0.8 : f.kind === 'assassin' ? 0.4
            : (f.stinger ? BEE_STINGER_CD : BEE_NORMAL_CD);
        }
      }
    }
    // Clear any power-ups that were just grabbed.
    pickups = pickups.filter((p) => !p.taken);
    // Respawn the fallen so the siege never ends, keeping all sides full.
    for (const f of fighters) {
      if (f.hp <= 0) Object.assign(f, spawn(f.kind));
    }

    // Queen Beena lays eggs just like the ants do.
    queen.layTimer -= dt;
    if (queen.layTimer <= 0) {
      queen.layTimer = EGG_LAY_INTERVAL;
      const a = Math.random() * Math.PI * 2, r = s * (0.09 + Math.random() * 0.05);
      eggs.push({ x: queen.x + Math.cos(a) * r, y: queen.y + Math.sin(a) * r, age: 0 });
    }
    // Queen Beena tosses out armor + stinger power-ups for her bees to grab.
    queen.pickupTimer -= dt;
    if (queen.pickupTimer <= 0) {
      queen.pickupTimer = PICKUP_INTERVAL;
      if (pickups.length < PICKUP_MAX) {
        const a = Math.random() * Math.PI * 2, r = s * (0.1 + Math.random() * 0.2);
        const kind = Math.random() < 0.5 ? 'armor' : 'stinger';
        pickups.push({ kind, x: queen.x + Math.cos(a) * r, y: queen.y + Math.sin(a) * r, taken: false });
      }
    }
    // Eggs hatch into new defender bees (up to a cap).
    const beeCount = fighters.filter((f) => f.kind === 'bee' && f.hp > 0).length;
    for (const e of eggs) e.age += dt;
    eggs = eggs.filter((e) => {
      if (e.age < EGG_HATCH_TIME) return true;
      if (beeCount < BEE_CAP) {
        const b = spawn('bee'); b.x = e.x; b.y = e.y; fighters.push(b);
      }
      return false; // hatched (or discarded at cap)
    });

    // Queen Beena fights back: glock, trapjaw, and acid.
    const nearestInvader = () => {
      let best = null, bestD = Infinity;
      for (const f of fighters) {
        if (f.side !== 'invader' || f.hp <= 0) continue;
        const d = (f.x - queen.x) ** 2 + (f.y - queen.y) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
      return best;
    };
    // GLOCK: fire a bullet at the nearest invader.
    queen.shootTimer -= dt;
    if (queen.shootTimer <= 0) {
      const tgt = nearestInvader();
      if (tgt) {
        queen.shootTimer = GLOCK_INTERVAL;
        const a = Math.atan2(tgt.y - queen.y, tgt.x - queen.x);
        const spd = s * 1.1;
        bullets.push({ x: queen.x, y: queen.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 2 });
      }
    }
    // TRAPJAW: crunch any invader that gets too close.
    queen.biteTimer -= dt;
    if (queen.biteTimer <= 0) {
      let bit = false;
      for (const f of fighters) {
        if (f.side !== 'invader' || f.hp <= 0) continue;
        if (Math.hypot(f.x - queen.x, f.y - queen.y) <= s * TRAPJAW_RANGE) { f.hp -= TRAPJAW_DMG; bit = true; }
      }
      if (bit) queen.biteTimer = TRAPJAW_INTERVAL;
    }
    // Bullets fly, hit invaders, and splash ACID on impact.
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const f of fighters) {
        if (f.side !== 'invader' || f.hp <= 0) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) <= s * 0.025) {
          f.hp -= BULLET_DMG;
          for (const o of fighters) { // acid splash
            if (o.side === 'invader' && o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= s * ACID_RADIUS) o.hp -= ACID_SPLASH;
          }
          b.life = 0;
          break;
        }
      }
    }
    bullets = bullets.filter((b) => b.life > 0 && b.x > -20 && b.x < canvas.width + 20 && b.y > -20 && b.y < canvas.height + 20);

    // SPLASH POTION: lob a flask at the densest knot of invaders.
    queen.potionTimer -= dt;
    if (queen.potionTimer <= 0) {
      const tgt = nearestInvader(); // aim the throw where invaders are pressing
      if (tgt) {
        queen.potionTimer = POTION_INTERVAL;
        potions.push({ sx: queen.x, sy: queen.y, tx: tgt.x, ty: tgt.y, t: 0 });
      }
    }
    // Flasks arc toward their landing spot; on touchdown they shatter into acid.
    potions = potions.filter((p) => {
      p.t += dt / POTION_FLIGHT;
      if (p.t < 1) return true;
      // Shatter: burst damage to everything caught in the blast...
      for (const f of fighters) {
        if (f.side !== 'invader' || f.hp <= 0) continue;
        if (Math.hypot(f.x - p.tx, f.y - p.ty) <= s * POTION_RADIUS) f.hp -= POTION_SPLASH;
      }
      // ...then leave a corrosive pool behind.
      pools.push({ x: p.tx, y: p.ty, life: POOL_LIFE });
      if (typeof Sfx !== 'undefined') Sfx.play('splash');
      return false;
    });
    // Acid pools eat away at any intruder standing in them.
    for (const pool of pools) {
      pool.life -= dt;
      for (const f of fighters) {
        if (f.side !== 'invader' || f.hp <= 0) continue;
        if (Math.hypot(f.x - pool.x, f.y - pool.y) <= s * POTION_RADIUS) f.hp -= POOL_DPS * dt;
      }
    }
    pools = pools.filter((pool) => pool.life > 0);
  }

  function hexBg() {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#3a2a08';
    ctx.fillRect(0, 0, w, h);
    const R = S() * 0.05;
    ctx.strokeStyle = 'rgba(240, 181, 33, 0.35)';
    ctx.lineWidth = Math.max(1, R * 0.08);
    const dx = R * 1.5, dy = R * Math.sqrt(3);
    for (let col = 0, x = 0; x < w + R; col++, x += dx) {
      for (let y = (col % 2) * dy / 2; y < h + R; y += dy) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  // A gear power-up lying in the arena: a blue shield (armor) or a gem-hilted
  // dagger (stinger), bobbing with a soft glow so bees can spot it.
  function drawPickup(p) {
    const s = S(), r = s * 0.028;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin((queen.t + p.x) * 3) * s * 0.004);
    // glow
    ctx.fillStyle = p.kind === 'armor' ? 'rgba(74,163,232,0.25)' : 'rgba(255,90,90,0.22)';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
    if (p.kind === 'armor') {
      // Shield.
      ctx.fillStyle = '#4aa3e8'; ctx.strokeStyle = '#cfe6fb'; ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, -r, r, -r * 0.4);
      ctx.lineTo(r * 0.85, r * 0.35);
      ctx.quadraticCurveTo(r * 0.5, r * 1.05, 0, r * 1.25);
      ctx.quadraticCurveTo(-r * 0.5, r * 1.05, -r * 0.85, r * 0.35);
      ctx.lineTo(-r, -r * 0.4);
      ctx.quadraticCurveTo(-r, -r, 0, -r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // lighter left half
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * 0.85, r * 0.35); ctx.lineTo(-r, -r * 0.4); ctx.closePath(); ctx.fill();
    } else {
      // Dagger, angled like the icon.
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#c8ccd2'; ctx.strokeStyle = '#8a9099'; ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.22, -r * 0.25); ctx.lineTo(-r * 0.22, -r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
      // golden cross-guard with red gems
      ctx.fillStyle = '#e8b54a'; ctx.fillRect(-r * 0.5, -r * 0.34, r, r * 0.18);
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(-r * 0.5, -r * 0.25, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.25, r * 0.14, 0, Math.PI * 2); ctx.fill();
      // wooden handle
      ctx.fillStyle = '#9c6b35'; ctx.fillRect(-r * 0.16, -r * 0.16, r * 0.32, r * 0.95);
      ctx.fillStyle = '#7c5126'; ctx.fillRect(-r * 0.16, r * 0.55, r * 0.32, r * 0.24);
    }
    ctx.restore();
  }

  function drawBee(b) {
    const s = S(), rx = s * (b.armor ? 0.026 : 0.022), ry = s * (b.armor ? 0.02 : 0.016);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = 'rgba(230,240,255,0.6)';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-rx * 0.2, sgn * ry * 1.1, rx * 0.7, ry * 0.5, sgn * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // A stinger bee gets a long barbed stinger out the back (with a red bead);
    // a normal bee just has a small stub.
    if (b.stinger) {
      ctx.fillStyle = '#1a1410';
      ctx.beginPath();
      ctx.moveTo(-rx, -ry * 0.3); ctx.lineTo(-rx * 2.1, 0); ctx.lineTo(-rx, ry * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath(); ctx.arc(-rx * 1.15, 0, rx * 0.16, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#1a1410';
      ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.lineTo(-rx * 1.5, -ry * 0.22); ctx.lineTo(-rx * 1.5, ry * 0.22); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f2c12e';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(-rx * 0.5, -ry, rx * 0.22, ry * 2);
    ctx.fillRect(rx * 0.1, -ry, rx * 0.22, ry * 2);
    ctx.beginPath(); ctx.arc(rx * 0.95, 0, ry * 0.7, 0, Math.PI * 2); ctx.fill();
    // Armor: a riveted steel plate over the abdomen + a helmet.
    if (b.armor) {
      ctx.fillStyle = '#b9c2cb'; ctx.strokeStyle = '#5c636b'; ctx.lineWidth = Math.max(1, rx * 0.15);
      ctx.beginPath(); ctx.ellipse(-rx * 0.15, 0, rx * 0.7, ry * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa3ad';
      ctx.beginPath(); ctx.arc(rx * 0.95, 0, ry * 0.8, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    }
    ctx.restore();
  }

  function drawBeetle(b) {
    const s = S(), r = s * 0.03;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    // legs
    ctx.strokeStyle = '#1a1008';
    ctx.lineWidth = Math.max(1, r * 0.15);
    for (const i of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.4, -r * 0.5); ctx.lineTo(i * r * 0.5, -r * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * r * 0.4, r * 0.5); ctx.lineTo(i * r * 0.5, r * 0.95); ctx.stroke();
    }
    // pincers up front
    ctx.beginPath(); ctx.moveTo(r * 0.9, -r * 0.2); ctx.lineTo(r * 1.4, -r * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.9, r * 0.2); ctx.lineTo(r * 1.4, r * 0.4); ctx.stroke();
    // dark shell
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1c0c';
    ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();
    // head
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(r * 0.85, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawAssassin(b) {
    const s = S(), r = s * 0.024;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    // spindly legs
    ctx.strokeStyle = '#2a0e0e';
    ctx.lineWidth = Math.max(1, r * 0.18);
    for (const i of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.4, -r * 0.5); ctx.lineTo(i * r * 0.5, -r * 1.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * r * 0.4, r * 0.5); ctx.lineTo(i * r * 0.5, r * 1.3); ctx.stroke();
    }
    // dark crimson body
    ctx.fillStyle = '#7a1f1f';
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8742a'; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.7, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    // head + curved stabbing beak
    ctx.fillStyle = '#3a1212';
    ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a0808'; ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath(); ctx.moveTo(r * 1.0, 0); ctx.quadraticCurveTo(r * 1.5, r * 0.3, r * 1.4, r * 1.0); ctx.stroke();
    ctx.restore();
  }

  function drawQueen() {
    const s = S(), R = queen.r * (1 + Math.sin(queen.t * 2) * 0.04);
    ctx.save();
    ctx.translate(queen.x, queen.y);
    ctx.fillStyle = 'rgba(255, 215, 26, 0.18)';
    ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(230,240,255,0.55)';
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(0, sgn * R * 1.0, R * 1.1, R * 0.55, sgn * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f2c12e';
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.5, R, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1410';
    for (const ox of [-0.7, -0.2, 0.3]) ctx.fillRect(ox * R, -R, R * 0.28, R * 2);
    ctx.beginPath(); ctx.arc(R * 1.5, 0, R * 0.7, 0, Math.PI * 2); ctx.fill();
    // Beena is female: long eyelashes + a rosy cheek.
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.lineCap = 'round';
    for (const a of [-0.5, -0.15, 0.2]) {
      const ex = R * 1.5 + Math.cos(a) * R * 0.7, ey = Math.sin(a) * R * 0.7;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * R * 0.3, ey + Math.sin(a) * R * 0.3); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 120, 140, 0.5)';
    ctx.beginPath(); ctx.arc(R * 1.45, R * 0.42, R * 0.18, 0, Math.PI * 2); ctx.fill();

    // Her royal staff, held to the side.
    const sx = R * 1.9;
    ctx.strokeStyle = '#a86f10';
    ctx.lineWidth = Math.max(2, R * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, R * 1.5); ctx.lineTo(sx, -R * 1.6); ctx.stroke();
    // glowing amber orb on top
    ctx.fillStyle = 'rgba(255, 215, 26, 0.3)';
    ctx.beginPath(); ctx.arc(sx, -R * 1.8, R * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd11a';
    ctx.strokeStyle = '#a86f10'; ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.beginPath(); ctx.arc(sx, -R * 1.8, R * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(sx - R * 0.14, -R * 1.95, R * 0.12, 0, Math.PI * 2); ctx.fill();

    // Her glock, held on the other side.
    const gx = -R * 1.9;
    ctx.fillStyle = '#2a2a2a';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, R * 0.05);
    ctx.fillRect(gx - R * 0.5, -R * 0.2, R * 0.9, R * 0.28); // slide
    ctx.strokeRect(gx - R * 0.5, -R * 0.2, R * 0.9, R * 0.28);
    ctx.fillRect(gx - R * 0.2, R * 0.05, R * 0.26, R * 0.5);  // grip
    ctx.strokeRect(gx - R * 0.2, R * 0.05, R * 0.26, R * 0.5);
    ctx.fillStyle = '#444';
    ctx.fillRect(gx - R * 0.55, -R * 0.12, R * 0.12, R * 0.12); // muzzle

    // crown
    ctx.fillStyle = '#ffd11a'; ctx.strokeStyle = '#a86f10'; ctx.lineWidth = Math.max(1, R * 0.08);
    const cw = R * 1.4, ch = R * 0.9;
    ctx.beginPath();
    ctx.moveTo(-cw / 2, -R * 0.9);
    ctx.lineTo(-cw / 2, -R * 0.9 - ch);
    ctx.lineTo(-cw / 4, -R * 0.9 - ch * 0.4);
    ctx.lineTo(0, -R * 0.9 - ch * 1.2);
    ctx.lineTo(cw / 4, -R * 0.9 - ch * 0.4);
    ctx.lineTo(cw / 2, -R * 0.9 - ch);
    ctx.lineTo(cw / 2, -R * 0.9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff7d6';
    ctx.font = `bold ${Math.max(12, s * 0.03)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Queen Beena', 0, R * 2.4);
    ctx.restore();
  }

  function drawEgg(e) {
    const s = S();
    ctx.save();
    ctx.translate(e.x, e.y);
    const pulse = e.age > EGG_HATCH_TIME - 1 ? 1 + Math.sin(e.age * 18) * 0.12 : 1; // wobble before hatching
    ctx.fillStyle = '#fdf6e3';
    ctx.strokeStyle = '#d8c79a';
    ctx.lineWidth = Math.max(1, s * 0.003);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.012 * pulse, s * 0.016 * pulse, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // A sizzling acid pool on the floor of the hive.
  function drawPool(pool) {
    const s = S(), rad = s * POTION_RADIUS;
    const fade = Math.min(1, pool.life / POOL_LIFE); // dissolve as it expires
    ctx.save();
    ctx.translate(pool.x, pool.y);
    const grad = ctx.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad);
    grad.addColorStop(0, `rgba(170, 255, 90, ${0.55 * fade})`);
    grad.addColorStop(0.6, `rgba(110, 210, 60, ${0.4 * fade})`);
    grad.addColorStop(1, 'rgba(80, 150, 40, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
    // a few bubbling specks
    ctx.fillStyle = `rgba(220, 255, 150, ${0.7 * fade})`;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + pool.life * 3;
      const rr = rad * (0.2 + (i % 3) * 0.25);
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, s * 0.006, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Beena's acid flask, arcing through the air toward its target.
  function drawPotion(p) {
    const s = S(), t = p.t;
    const x = p.sx + (p.tx - p.sx) * t;
    const y = p.sy + (p.ty - p.sy) * t;
    const lift = Math.sin(t * Math.PI) * s * 0.12; // parabolic hop
    const r = s * 0.018;
    ctx.save();
    ctx.translate(x, y - lift);
    // shadow on the ground below the flask
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, lift, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(t * 8); // tumble in flight
    // glass body of bright acid
    ctx.fillStyle = 'rgba(150, 240, 80, 0.85)';
    ctx.strokeStyle = 'rgba(220, 255, 170, 0.9)';
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.arc(0, r * 0.2, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // cork neck
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(-r * 0.28, -r * 0.9, r * 0.56, r * 0.6);
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    hexBg();
    for (const pool of pools) drawPool(pool);
    drawQueen();
    for (const e of eggs) drawEgg(e);
    for (const p of pickups) drawPickup(p); // gear lying on the floor, under the fighters
    // glock bullets with a little acid-green glow
    const s0 = S();
    for (const b of bullets) {
      ctx.fillStyle = 'rgba(120, 220, 90, 0.35)';
      ctx.beginPath(); ctx.arc(b.x, b.y, s0 * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath(); ctx.arc(b.x, b.y, s0 * 0.01, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of fighters) {
      (f.kind === 'beetle' ? drawBeetle : f.kind === 'assassin' ? drawAssassin : drawBee)(f);
    }
    for (const p of potions) drawPotion(p); // flasks fly over the melee
    const s = S();
    ctx.fillStyle = '#e8eef5';
    ctx.font = `bold ${Math.max(12, s * 0.028)}px sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const liveBees = fighters.filter((f) => f.kind === 'bee' && f.hp > 0);
    const bees = liveBees.length;
    const armored = liveBees.filter((f) => f.armor).length;
    const stingered = liveBees.filter((f) => f.stinger).length;
    const beetles = fighters.filter((f) => f.kind === 'beetle' && f.hp > 0).length;
    const assassins = fighters.filter((f) => f.kind === 'assassin' && f.hp > 0).length;
    ctx.fillText(`🐝 Bees: ${bees} (🛡${armored} 🗡${stingered})    🪲 Beetles: ${beetles}    🗡 Assassins: ${assassins}`, 16, 16);
  }

  function loop(ts) {
    if (!open) return;
    const dt = Math.min(0.05, (ts - last) / 1000) || 0;
    last = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  return { init, open: open_, close, isOpen: () => open };
})();
