// ================= CONTINUOUS WORLD =================
// Barracks train squads for each deployment square. Trained troops walk to their
// square and wait. When every assigned square is filled the wave launches and the
// barracks start on the next one. The enemy sends its own set mixture on a timer.
let UID = 0;
class World {
  constructor(o) {
    this.rng = o.rng || Math.random;
    this.ulv = o.ulv || {};
    this.t = 0;
    this.units = []; this.proj = []; this.fx = []; this.texts = []; this.events = []; this.notes = [];
    this.shake = 0; this.cash = 0; this.waveNo = o.waveNo || 0; this.waves = [];
    this.slots = [];
    for (let r = 0; r < NROWS; r++) {
      this.slots.push([]);
      for (let c = 0; c < NCOLS; c++) {
        const k = o.grid[r][c];
        this.slots[r].push({ r, c, type: k || null, status: k ? 'need' : 'off', units: [], prog: 0 });
      }
    }
    this.bld = {};
    this.armyLimit = o.armyLimit || ARMY_BASE;
    this.armyFull = false;
    this.loadSection(o.lvl, o.sec, o.wallHp, o.bunkers);
  }
  r() { return this.rng(); }
  slotList() { const a = []; for (const row of this.slots) for (const s of row) a.push(s); return a; }
  slotPos(s) { return { x: COLS_X[s.c], y: ROWS_Y[s.r] }; }
  // ---------- sections ----------
  loadSection(lvl, sec, wallHp, bunkers) {
    this.lvl = lvl; this.secIdx = sec; this.level = getLevel(lvl); this.sec = this.level.sections[sec]; this.scale = this.level.scale;
    const max = Math.round(sectionMaxHp(lvl, sec) * this.scale);
    this.wall = { kind: 'wall', team: 'e', armor: 'structure', hp: wallHp != null ? Math.min(wallHp, max) : max, maxHp: max, alive: true, x: W / 2, y: WALL_Y, r: 0, def: {}, hurt: 0 };
    this.bunkerHp = bunkers && bunkers.length === (this.sec.bunkers || 0) ? bunkers.slice() : Array(this.sec.bunkers || 0).fill(ENEMIES.bunker.hp * this.scale);
    for (const u of this.units) {
      if (u.team === 'e') { u.alive = false; this.fx.push({ type: 'puff', x: u.x, y: u.y, vx: 0, vy: -8, life: .8, max: .8, size: 4, c: 'smoke' }); }
      else if (u.phase === 'field' || u.phase === 'charge' || u.phase === 'retreat') u.alive = false;  // they took the old section
    }
    this.units = this.units.filter(u => u.alive);
    this.proj = [];
    // waves still out there are finished: they broke through
    for (const w of this.waves || []) if (!w.reported) this.report(w, true);
    if (this.waves) this.waves = [];
    for (const u of this.units) u.target = null;
    this.spawnStatics();
    this.cycle = this.sec.cycle || ENEMY_CYCLE;
    this.nextEnemy = 3;
    this.enemyWaveNo = 0;
    this.breaching = false; this.breachT = 0;
  }
  spawnStatics() {
    const s = this.sec, sc = this.scale;
    const nb = s.bunkers || 0;
    for (let i = 0; i < nb; i++) {
      if (!(this.bunkerHp[i] > 0)) continue;
      const x = nb === 1 ? W / 2 : 70 + i * (220 / (nb - 1));
      const u = this.mk('e', 'bunker', ENEMIES.bunker, x, WALL_Y + 8, sc, sc);
      u.hp = this.bunkerHp[i]; u.maxHp = ENEMIES.bunker.hp * sc; u.bunkerIdx = i; u.face = Math.PI / 2;
    }
    this.posts = [];
    const towersX = [24, W - 24, W / 2];
    for (let i = 0; i < (s.towers || 0); i++) this.posts.push({ k: 'esniper', x: towersX[i], y: WALL_Y - 8, tower: true });
    const ng = s.wallGuns || 0;
    for (let i = 0; i < ng; i++) this.posts.push({ k: 'gunman', x: 48 + (i + .5) * ((W - 96) / ng), y: WALL_Y - 5 });
    for (const p of this.posts) this.spawnPost(p);
  }
  spawnPost(p) {
    const u = this.mk('e', p.k, ENEMIES[p.k], p.x, p.y, this.scale, this.scale);
    u.static = true; u.cover = true; u.onWall = true; u.rangeBonus = p.tower ? 10 : 25; u.tower = !!p.tower;
    p.unit = u;
  }
  enemyWave() {
    this.enemyWaveNo++;
    for (const p of this.posts) if (!p.unit || !p.unit.alive) this.spawnPost(p);
    // the enemy has an army limit too, so unanswered waves don't pile up forever
    const roaming = this.units.filter(u => u.team === 'e' && !u.static).length;
    const size = (k, n) => ENEMIES[k].vehicle ? n : Math.max(1, Math.round(n * ENEMY_MULT));
    const total = this.sec.field.reduce((a, [k, n]) => a + size(k, n), 0);
    const cap = Math.ceil(total * ENEMY_CAP_WAVES);
    const room = Math.min(total, cap - roaming);
    if (room <= 0) return;
    const f = room / total;
    let row = 0;
    for (const [k, n0] of this.sec.field) {
      const n = Math.round(size(k, n0) * f);
      if (n <= 0) continue;
      let left = n;
      while (left > 0) {
        const inRow = Math.min(left, 7);
        for (let i = 0; i < inRow; i++) {
          const x = W / 2 + (i - (inRow - 1) / 2) * 34 + (this.r() - .5) * 8;
          const y = WALL_FACE + 12 + row * 18 + this.r() * 4;
          const u = this.mk('e', k, ENEMIES[k], x, y, this.scale, this.scale);
          u.ewave = this.enemyWaveNo;
        }
        left -= inRow; row++;
      }
    }
    this.events.push('horn');
  }
  // ---------- lineup edits (live) ----------
  setSlot(r, c, type) {
    const s = this.slots[r][c];
    if (s.type === type) return;
    this.sendHome(s);
    s.type = type || null; s.status = type ? 'need' : 'off'; s.prog = 0;
  }
  sendHome(s) {
    for (const u of s.units) if (u.alive) { u.phase = 'retreat'; u.slot = null; }
    s.units = [];
  }
  swapSlots(a, b) {
    const A = this.slots[a[0]][a[1]], B = this.slots[b[0]][b[1]];
    this.slots[a[0]][a[1]] = B; this.slots[b[0]][b[1]] = A;
    B.r = a[0]; B.c = a[1]; A.r = b[0]; A.c = b[1];
    for (const s of [A, B]) {
      const p = this.slotPos(s), pat = s.type ? PAT[UNITS[s.type].n] : [];
      s.units.forEach((u, i) => { if (!u.alive) return; const o = pat[i] || [0, 0]; u.tx = p.x + o[0]; u.ty = p.y + o[1]; u.phase = 'walk'; u.arrived = false; });
      if (s.status === 'ready' && s.units.some(u => u.alive)) s.status = 'walking';
    }
  }
  // ---------- production ----------
  bldTypes() { return UNIT_ORDER.filter(k => this.slotList().some(s => s.type === k)); }
  bldPos(k) {
    const types = this.bldTypes(), i = types.indexOf(k), n = types.length;
    const perRow = Math.min(6, n <= 6 ? n : Math.ceil(n / 2));
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = row === 0 ? Math.min(perRow, n) : n - perRow;
    const span = W - 40;
    return { x: 20 + span * (col + .5) / inRow, y: BASE_Y + 26 + row * 34 };
  }
  fieldCount() { let n = 0; for (const u of this.units) if (u.team === 'p' && u.alive && u.phase === 'field') n++; return n; }
  production(dt) {
    const list = this.slotList();
    // barracks wait while the army on the battlefield is at its limit
    this.armyFull = this.fieldCount() >= this.armyLimit;
    for (const k of UNIT_ORDER) {
      const b = this.bld[k] || (this.bld[k] = { jobs: [] });
      b.jobs = b.jobs.filter(j => j.slot.type === k && j.slot.status === 'training');
      while (b.jobs.length < LINES && !this.armyFull) {
        const s = list.find(x => x.type === k && x.status === 'need');
        if (!s) break;
        s.status = 'training'; s.prog = 0;
        b.jobs.push({ slot: s, t: 0, dur: trainTime(k, this.ulv[k]) });
      }
      for (const j of b.jobs) {
        j.t += dt; j.slot.prog = Math.min(1, j.t / j.dur);
        if (j.t >= j.dur) { this.deliver(j.slot, k); j.done = true; }
      }
      b.jobs = b.jobs.filter(j => !j.done);
    }
    for (const s of list) {
      if ((s.status === 'walking' || s.status === 'ready') && !s.units.some(u => u.alive)) { s.units = []; s.status = s.type ? 'need' : 'off'; continue; }
      if (s.status === 'walking' && s.units.every(u => !u.alive || u.arrived)) s.status = 'ready';
    }
    const req = list.filter(s => s.type);
    if (req.length && req.every(s => s.status === 'ready')) this.launch(false);
  }
  deliver(s, k) {
    const def = UNITS[k], m = lvMult(this.ulv[k] || 1), bp = this.bldPos(k), p = this.slotPos(s);
    s.units = [];
    for (const [ox, oy] of PAT[def.n]) {
      const u = this.mk('p', k, def, bp.x + (this.r() - .5) * 10, bp.y - 6, m, m);
      u.phase = 'walk'; u.slot = s; u.tx = p.x + ox; u.ty = p.y + oy; u.arrived = false; u.face = -Math.PI / 2;
      s.units.push(u);
    }
    s.status = 'walking'; s.prog = 0;
  }
  launch(manual) {
    const wave = { no: this.waveNo + 1, t0: this.t, dmg: 0, kills: 0, sent: 0, lost: 0, alive: 0, contact: false, march: 99, done: false, manual, sec: this.sec.name };
    for (const s of this.slotList()) {
      if (s.status !== 'ready' && s.status !== 'walking') continue;
      for (const u of s.units) {
        if (!u.alive) continue;
        u.phase = 'field'; u.wave = wave; u.slot = null; u.target = null; u.setupT = u.setupT || 0;
        if (u.def.charge) u.state = 'run';
        wave.sent++; wave.alive++; wave.march = Math.min(wave.march, u.def.speed);
      }
      s.units = []; s.status = s.type ? 'need' : 'off';
    }
    if (!wave.sent) return false;
    this.waveNo++;
    this.waves.push(wave);
    this.notes.push({ type: 'launch', wave });
    this.events.push('go');
    return true;
  }
  formingCount() {
    const req = this.slotList().filter(s => s.type);
    return { ready: req.filter(s => s.status === 'ready').length, total: req.length };
  }
  // ---------- unit factory ----------
  mk(team, key, def, x, y, hpM, dmgM) {
    const size = def.size || 1;
    const u = {
      id: ++UID, team, key, def, x, y, hp: def.hp * hpM, maxHp: def.hp * hpM, dmg: (def.dmg || 0) * dmgM,
      heal: (def.heal || 0) * dmgM, charge: (def.charge || 0) * dmgM,
      armor: def.armor, r: 7 * size, cdT: this.r() * (def.cd || 1), setupT: 0, idleT: 0,
      target: null, retarget: this.r() * .3, face: team === 'p' ? -Math.PI / 2 : Math.PI / 2,
      moving: false, cover: false, static: !!def.structure, rangeBonus: 0, alive: true, flash: 0, hurt: 0,
      state: '', walk: this.r() * 10, vehicle: !!def.vehicle, phase: team === 'p' ? 'walk' : '',
    };
    this.units.push(u);
    return u;
  }
  // ---------- main step ----------
  step(dt) {
    this.t += dt;
    if (!this.breaching) {
      this.nextEnemy -= dt;
      if (this.nextEnemy <= 0) { this.enemyWave(); this.nextEnemy += this.cycle; }
    }
    this.production(dt);
    for (const u of this.units) if (u.alive) this.think(u, dt);
    this.separate();
    this.projStep(dt);
    this.fxStep(dt);
    this.units = this.units.filter(u => u.alive);
    // wave bookkeeping
    for (const w of this.waves) {
      if (!w.reported && (w.alive <= 0 || this.t - w.t0 >= REPORT_T)) this.report(w, false);
      if (w.alive <= 0) w.done = true;
    }
    this.waves = this.waves.filter(w => !w.done);
    // breach
    if (!this.breaching && this.wall.hp <= 0) this.startBreach();
    if (this.breaching) {
      this.breachT -= dt;
      if (this.breachT <= 0) {
        let nl = this.lvl, ns = this.secIdx + 1, levelDone = false;
        if (ns >= this.level.sections.length) { nl++; ns = 0; levelDone = true; }
        const old = { level: this.level.name, sec: this.sec.name };
        this.loadSection(nl, ns, null, null);
        this.notes.push({ type: 'section', lvl: nl, sec: ns, levelDone, old });
      }
    }
  }
  report(w, captured) {
    w.reported = true; w.captured = captured; w.t1 = this.t;
    w.rep = { dmg: w.dmg, lost: w.lost, kills: w.kills, sent: w.sent, alive: w.alive, secs: Math.round(this.t - w.t0) };
    this.notes.push({ type: 'waveDone', wave: w });
  }
  startBreach() {
    this.breaching = true; this.breachT = 2.2; this.wall.hp = 0;
    this.shake = 1.2; this.events.push('big');
    for (let i = 0; i < 26; i++) this.boomFx(15 + this.r() * (W - 30), WALL_Y + (this.r() - .5) * 20, 24 + this.r() * 18, true);
    for (const u of this.units) {
      if (u.team === 'e' && (u.onWall || u.def.structure)) this.kill(u, null, true);
      else if (u.team === 'e') { u.alive = false; this.fx.push({ type: 'puff', x: u.x, y: u.y, vx: 0, vy: -10, life: .9, max: .9, size: 5, c: 'smoke' }); }
      else if (u.phase === 'field') { u.phase = 'charge'; u.target = null; u.state = ''; }
    }
    this.proj = this.proj.filter(p => p.src && p.src.team === 'p');
    this.notes.push({ type: 'breach', lvl: this.lvl, sec: this.secIdx, name: this.sec.name, level: this.level.name, last: this.secIdx + 1 >= this.level.sections.length });
  }
  // ---------- targeting ----------
  foes(u) {
    if (u.team === 'e') return this.units.filter(f => f.alive && f.team === 'p' && f.phase === 'field');
    return this.units.filter(f => f.alive && f.team === 'e');
  }
  range(u) { return u.def.range + u.rangeBonus; }
  distTo(u, t) {
    if (t.kind === 'wall') return u.y - WALL_FACE - u.r;
    return dist(u, t) - t.r - u.r * .5;
  }
  inRange(u, t) { return this.distTo(u, t) <= this.range(u); }
  cluster(f, rad) {
    let n = 0;
    for (const o of this.units) if (o.alive && o.team === f.team && o !== f && dist(o, f) < rad) n++;
    return n;
  }
  prio(u, f) {
    const ai = u.def.ai;
    if (u.team === 'p') {
      if (f.kind === 'wall') return { std: 1, at: 8, blast: 6, ap: 0 }[ai] || 1;
      if (f.def.structure) return { std: 2, at: 15, blast: 9, ap: 1 }[ai] || 2;
      if (ai === 'at') return f.vehicle ? 20 : f.armor === 'armored' ? 12 : 4;
      if (ai === 'blast') return (f.cover ? 13 : 8) + Math.min(5, this.cluster(f, u.def.splash)) * 1.5 - (f.def.melee ? 4 : 0);
      if (ai === 'ap') return f.key === 'esniper' ? 20 : f.key === 'erpg' ? 17 : f.key === 'heavy' ? 15 : 8;
      return 10;
    }
    if (u.def.ai === 'snipe') return ({ saw: 20, mortar: 20, sniper: 19, rpg: 16, medic: 14, gren: 12 })[f.key] || 6;
    if (u.def.ai === 'at') return f.vehicle ? 20 : f.armor === 'armored' ? 15 : 5;
    // enemies prefer troops already out on the field over ones still lining up
    return f.phase === 'field' ? 10 : 8;
  }
  pickTarget(u, noWall) {
    const foes = this.foes(u);
    if (u.team === 'e') {
      let tb = null, td = 1e9;
      for (const p of foes) {
        if (!p.def.taunt || p.phase !== 'field') continue;
        if (!p.def.tauntAll && !u.def.melee) continue;
        const d = dist(u, p);
        if (d < p.def.taunt + u.r && d < td) { tb = p; td = d; }
      }
      if (tb && (!u.static || this.inRange(u, tb))) return tb;
    }
    let best = null, bs = -1e9;
    const R = this.range(u);
    const sight = u.team === 'p' ? (u.phase === 'field' ? Math.max(R + 70, 190) : R) : (u.static ? R : 1e9);
    for (const f of foes) {
      const d = this.distTo(u, f);
      if (d > sight) continue;
      if (u.team === 'p' && f.y < WALL_Y - 2 && !f.onWall && !f.def.structure) continue;
      const s = this.prio(u, f) * 10 - d * .06 + (d <= R ? 100 : 0);
      if (s > bs) { bs = s; best = f; }
    }
    if (u.team === 'p' && !noWall && u.def.ai !== 'medic' && !this.breaching) {
      const d = this.distTo(u, this.wall);
      const s = this.prio(u, this.wall) * 10 - d * .06 + (d <= R ? 100 : 0);
      if (s > bs || !best) best = this.wall;
    }
    return best;
  }
  moveTo(u, tx, ty, dt, speed) {
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d < 1) { u.moving = false; return true; }
    const sp = Math.min(d, speed * dt);
    u.x += dx / d * sp; u.y += dy / d * sp;
    u.face = Math.atan2(dy, dx);
    u.moving = true; u.walk += sp * .35;
    return false;
  }
  speedOf(u) {
    let s = u.def.speed;
    if (u.team === 'p' && u.wave && !u.wave.contact && u.state !== 'run') s = Math.min(s, u.wave.march);
    return s;
  }
  // ---------- AI ----------
  think(u, dt) {
    const d = u.def;
    u.cdT -= dt; u.flash = Math.max(0, u.flash - dt); u.hurt = Math.max(0, u.hurt - dt); u.hurtCd = (u.hurtCd || 0) - dt;
    if (u.team === 'p') {
      if (u.phase === 'retreat') {
        this.moveTo(u, u.x, H + 30, dt, d.speed * 1.2);
        if (u.y > H + 8) { u.alive = false; if (u.wave) u.wave.alive--; }
        return;
      }
      if (u.phase === 'walk' || u.phase === 'queue') return this.holdThink(u, dt);
      if (u.phase === 'charge') {
        this.moveTo(u, u.x + (W / 2 - u.x) * .02, WALL_Y - 40, dt, d.speed * 1.5);
        if (u.y < WALL_Y - 4) { u.alive = false; }
        return;
      }
    }
    if (d.ai === 'medic') return this.medic(u, dt);
    if (u.state === 'run' || u.state === 'plant') return this.breacher(u, dt);
    u.retarget -= dt;
    if (u.retarget <= 0 || !u.target || (u.target !== this.wall && (!u.target.alive || u.target.phase === 'retreat')) || (u.target === this.wall && this.breaching)) {
      u.target = this.pickTarget(u); u.retarget = (d.melee ? .2 : .35) + this.r() * .15;
    }
    const t = u.target;
    if (t && this.inRange(u, t)) {
      if (u.wave) u.wave.contact = true;
      u.moving = false; u.idleT = 0;
      const ax = t === this.wall ? u.x : t.x, ay = t === this.wall ? WALL_FACE : t.y;
      u.face = Math.atan2(ay - u.y, ax - u.x);
      if (d.setup) { u.setupT += dt; if (u.setupT < d.setup) return; }
      if (u.cdT <= 0) { this.fire(u, t); u.cdT = d.cd * (.85 + this.r() * .3); }
      return;
    }
    if (u.static) return;
    if (d.brace && u.team === 'p') {
      for (const f of this.units) if (f.alive && f.team !== u.team && !f.static && dist(f, u) < d.brace) { u.moving = false; u.face = Math.atan2(f.y - u.y, f.x - u.x); u.braced = true; return; }
      u.braced = false;
    }
    if (d.setup && u.setupT >= d.setup && u.idleT < 1.2) { u.idleT += dt; return; }
    let gx, gy;
    if (u.team === 'p') {
      if (t && t !== this.wall) { gx = t.x; gy = t.y; }
      else { gx = u.x; gy = WALL_FACE - 40; }
      gy = Math.max(gy, WALL_FACE + u.r + 2);
    } else {
      if (!t) {
        // no attackers on the field: hold the front line and wait
        if (u.y < FRONT_LINE - 8) { this.moveTo(u, u.x, FRONT_LINE - 4 - (u.id % 5) * 7, dt, d.speed * .6); } else u.moving = false;
        return;
      }
      gx = t.x; gy = Math.min(t.y, FRONT_LINE);
    }
    this.moveTo(u, gx, gy, dt, this.speedOf(u));
    if (d.setup) u.setupT = 0;
  }
  // troops walking to / waiting on their square: they hold position but shoot back
  holdThink(u, dt) {
    const d = u.def;
    if (u.phase === 'walk') {
      if (this.moveTo(u, u.tx, u.ty, dt, d.speed * 1.4) || dist(u, { x: u.tx, y: u.ty }) < 1.5) { u.phase = 'queue'; u.arrived = true; u.face = -Math.PI / 2; u.moving = false; }
      return;
    }
    u.moving = false;
  }
  medic(u, dt) {
    let best = null, bv = 1;
    for (const a of this.units) {
      if (!a.alive || a.team !== u.team || a === u || a.vehicle || a.phase !== 'field') continue;
      const f = a.hp / a.maxHp;
      if (f < .97 && dist(a, u) < 170 && f < bv) { bv = f; best = a; }
    }
    if (best) {
      if (dist(u, best) > u.def.range * .7) { this.moveTo(u, best.x, best.y + 10, dt, this.speedOf(u)); return; }
      u.moving = false;
      u.face = Math.atan2(best.y - u.y, best.x - u.x);
      if (u.cdT <= 0) {
        best.hp = Math.min(best.maxHp, best.hp + u.heal);
        u.cdT = u.def.cd;
        this.fx.push({ type: 'heal', x: best.x, y: best.y - 8, life: .6, max: .6 });
        this.fx.push({ type: 'beam', x1: u.x, y1: u.y, x2: best.x, y2: best.y, life: .25, max: .25 });
      }
      return;
    }
    let front = null;
    for (const a of this.units) if (a.alive && a.team === u.team && a !== u && a.wave === u.wave && a.def.ai !== 'medic' && a.phase === 'field' && (!front || a.y < front.y)) front = a;
    if (front) {
      const gy = Math.max(front.y + 46, WALL_FACE + 60);
      if (Math.abs(u.y - gy) > 8 || Math.abs(u.x - front.x) > 50) this.moveTo(u, u.x + (front.x - u.x) * .3, gy, dt, this.speedOf(u));
      else u.moving = false;
    } else this.moveTo(u, u.x, WALL_FACE + 120, dt, this.speedOf(u));
  }
  breacher(u, dt) {
    if (this.breaching) { u.state = 'fight'; return; }
    if (!u.goal || (u.goal !== this.wall && !u.goal.alive)) {
      let best = null, bd = 1e9;
      for (const f of this.units) if (f.alive && f.team === 'e' && f.def.structure) { const d = dist(u, f); if (d < bd) { bd = d; best = f; } }
      u.goal = best && Math.abs(best.x - u.x) < 140 ? best : this.wall;
      if (u.goal === this.wall) u.gx = Math.max(20, Math.min(W - 20, u.x));
    }
    const g = u.goal;
    const tx = g === this.wall ? u.gx : g.x, ty = g === this.wall ? WALL_FACE + u.r : g.y + g.r + u.r;
    if (u.state === 'run') {
      if (Math.hypot(tx - u.x, ty - u.y) >= 4) { this.moveTo(u, tx, ty, dt, u.def.speed); return; }
      u.state = 'plant'; u.plantT = 1.6; u.moving = false; u.face = -Math.PI / 2;
      return;
    }
    u.plantT -= dt;
    if (u.plantT <= 0) {
      const target = g === this.wall || !g.alive ? this.wall : g;
      this.applyDamage(target, u.charge, 'demo', u);
      this.explode(tx, ty - 6, 34, 60, 'blast', u, target);
      this.boomFx(tx, ty - 6, 46, true);
      this.shake = Math.max(this.shake, .6); this.events.push('big');
      u.state = 'fight'; u.target = null;
    }
  }
  // ---------- combat ----------
  fire(u, t) {
    const d = u.def;
    const tx = t === this.wall ? u.x + (this.r() - .5) * 10 : t.x;
    const ty = t === this.wall ? WALL_FACE - 3 - this.r() * 6 : t.y;
    u.flash = .06;
    const mx = u.x + Math.cos(u.face) * u.r * 1.4, my = u.y + Math.sin(u.face) * u.r * 1.4;
    if (d.proj === 'rocket' || d.proj === 'cannon') {
      this.proj.push({ type: d.proj, x: mx, y: my, t, tx, ty, speed: d.proj === 'cannon' ? 520 : 300, dmg: u.dmg, dtype: d.dtype, splash: d.splash, src: u });
      this.events.push(d.proj === 'cannon' ? 'cannon' : 'rocket');
    } else if (d.proj === 'arc' || d.proj === 'shell') {
      const sc = d.proj === 'shell' ? 14 : 10;
      const ax = tx + (this.r() - .5) * sc, ay = ty + (this.r() - .5) * sc;
      const dd = Math.hypot(ax - mx, ay - my);
      const T = d.proj === 'shell' ? 1.3 + dd / 500 : .35 + dd / 260;
      this.proj.push({ type: d.proj, x0: mx, y0: my, x: mx, y: my, tx: ax, ty: ay, t: 0, T, h: d.proj === 'shell' ? 90 + dd * .2 : 18 + dd * .18, dmg: u.dmg, dtype: d.dtype, splash: d.splash, src: u });
      this.events.push(d.proj === 'shell' ? 'thump' : 'bloop');
    } else {
      this.applyDamage(t, u.dmg, d.dtype, u);
      if (d.dtype === 'melee') this.fx.push({ type: 'slash', x: tx, y: ty, life: .15, max: .15 });
      else {
        this.fx.push({ type: 'tracer', x1: mx, y1: my, x2: tx + (this.r() - .5) * 4, y2: ty + (this.r() - .5) * 4, life: .07, max: .07, team: u.team, heavy: d.dtype === 'hmg' || d.dtype === 'ap' });
        this.events.push(d.dtype === 'hmg' ? 'hmg' : d.dtype === 'ap' ? 'snipe' : 'shot');
      }
    }
  }
  projStep(dt) {
    for (const p of this.proj) {
      if (p.type === 'rocket' || p.type === 'cannon') {
        if (p.t !== this.wall && p.t && p.t.alive) { p.tx = p.t.x; p.ty = p.t.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const s = p.speed * dt;
        if (Math.random() < .7) this.fx.push({ type: 'puff', x: p.x, y: p.y, vx: 0, vy: 0, life: .5, max: .5, size: 2.5, c: 'smoke' });
        if (d <= s + 3) {
          p.dead = true;
          const tgt = p.t === this.wall ? this.wall : (p.t && p.t.alive ? p.t : null);
          if (tgt) this.applyDamage(tgt, p.dmg, p.dtype, p.src);
          this.explode(p.tx, p.ty, p.splash || 12, p.dmg * .4, p.dtype, p.src, tgt);
          this.boomFx(p.tx, p.ty, (p.splash || 12) * 1.2, false);
          this.events.push('boom');
        } else { p.x += dx / d * s; p.y += dy / d * s; p.a = Math.atan2(dy, dx); }
      } else {
        p.t += dt;
        const k = Math.min(1, p.t / p.T);
        p.x = p.x0 + (p.tx - p.x0) * k; p.y = p.y0 + (p.ty - p.y0) * k; p.z = Math.sin(Math.PI * k) * p.h;
        if (k >= 1) {
          p.dead = true;
          this.explode(p.tx, p.ty, p.splash, p.dmg, p.dtype, p.src, null);
          this.boomFx(p.tx, p.ty, p.splash, p.type === 'shell');
          this.events.push(p.type === 'shell' ? 'boom' : 'pop');
          if (p.type === 'shell') this.shake = Math.max(this.shake, .25);
        }
      }
    }
    this.proj = this.proj.filter(p => !p.dead);
  }
  explode(x, y, rad, dmg, dtype, src, skip) {
    if (!src) return;
    const team = src.team;
    for (const f of this.units) {
      if (!f.alive || f.team === team || f === skip) continue;
      const d = Math.hypot(f.x - x, f.y - y) - f.r;
      if (d > rad) continue;
      this.applyDamage(f, dmg * (1 - .5 * Math.max(0, d) / rad), dtype, src);
    }
    if (team === 'p' && skip !== this.wall && Math.abs(y - WALL_Y) < rad + WALL_T / 2) {
      const fall = 1 - .5 * Math.max(0, Math.abs(y - WALL_Y) - WALL_T / 2) / rad;
      this.applyDamage(this.wall, dmg * fall, dtype, src);
    }
  }
  applyDamage(t, dmg, dtype, src) {
    if (!t || (t !== this.wall && !t.alive)) return;
    if (t === this.wall && this.breaching) return;
    let m = MULT[dtype][t.armor];
    if (t.cover) m *= COVER[dtype];
    const d = dmg * m;
    if (d <= 0) return;
    t.hp -= d;
    if (!(t.hurtCd > 0)) { t.hurt = .07; t.hurtCd = .35; }
    if (src && src.wave) src.wave.contact = true;
    if (t.wave) t.wave.contact = true;
    if (src && src.team === 'p' && (t === this.wall || t.def.structure)) {
      if (src.wave) src.wave.dmg += d;
      this.cash += d * SIEGE_CASH / WALL_MULT;
      if (d >= 15) this.texts.push({ x: (t === this.wall ? src.x : t.x) + (this.r() - .5) * 16, y: (t === this.wall ? WALL_Y : t.y) - 6, txt: '-' + Math.round(d), life: 1, max: 1, big: d >= 120 });
    }
    if (t !== this.wall && t.hp <= 0) this.kill(t, src);
  }
  kill(t, src, silent) {
    if (!t.alive) return;
    t.alive = false; t.hp = 0;
    if (t.team === 'e') {
      const b = (t.def.bounty || 3) * this.scale;
      this.cash += b;
      if (src && src.wave) src.wave.kills++;
      if (t.def.structure) {
        this.bunkerHp[t.bunkerIdx] = 0;
        this.boomFx(t.x, t.y, 40, true); this.shake = Math.max(this.shake, .5); this.events.push('big');
        this.texts.push({ x: t.x, y: t.y - 20, txt: 'BUNKER DOWN', life: 1.6, max: 1.6, big: true, cash: true });
      }
    } else if (t.wave) { t.wave.lost++; t.wave.alive--; }
    if (!t.def.structure) {
      this.fx.push({ type: 'dead', x: t.x, y: t.y, team: t.team, key: t.key, face: t.face, r: t.r, vehicle: t.vehicle, life: t.vehicle ? 6 : 3, max: t.vehicle ? 6 : 3 });
      if (t.vehicle) { this.boomFx(t.x, t.y, 30, true); this.events.push('big'); }
      else if (!silent) this.fx.push({ type: 'soul', x: t.x, y: t.y - 6, life: 1.1, max: 1.1, team: t.team });
    }
  }
  boomFx(x, y, r, big) {
    this.fx.push({ type: 'boom', x, y, r, life: big ? .55 : .35, max: big ? .55 : .35 });
    const n = big ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2, s = 10 + this.r() * 30;
      this.fx.push({ type: 'puff', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, life: .8 + this.r() * .8, max: 1.6, size: r * .25 + this.r() * 4, c: this.r() < .3 ? 'dark' : 'smoke' });
    }
  }
  fxStep(dt) {
    for (const f of this.fx) { f.life -= dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .96; f.vy *= .96; } }
    this.fx = this.fx.filter(f => f.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 16 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 2);
    if (this.fx.length > 900) this.fx.splice(0, this.fx.length - 900);
    if (this.texts.length > 60) this.texts.splice(0, this.texts.length - 60);
  }
  separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive || a.onWall) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]; if (!b.alive || b.onWall) continue;
        // troops lining up on their squares only bump into each other lightly
        const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * .92;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy) || .01;
        if (d >= rr) continue;
        const pin = u => u.static || u.phase === 'queue' || u.phase === 'walk';
        const ma = pin(a) && !(pin(b)) ? 0 : 1 / ((a.def.size || 1) * (a.vehicle ? 3 : 1) * (a.def.taunt ? 2 : 1));
        const mb = pin(b) && !(pin(a)) ? 0 : 1 / ((b.def.size || 1) * (b.vehicle ? 3 : 1) * (b.def.taunt ? 2 : 1));
        if (a.static) { if (b.static) continue; }
        const wa = a.static ? 0 : ma, wb = b.static ? 0 : mb;
        if (wa + wb === 0) continue;
        if ((a.phase === 'walk' || b.phase === 'walk') && a.team === b.team) continue;
        const push = (rr - d) / (wa + wb);
        a.x -= dx / d * push * wa; a.y -= dy / d * push * wa;
        b.x += dx / d * push * wb; b.y += dy / d * push * wb;
      }
    }
    for (const u of us) {
      if (u.onWall || u.def.structure) continue;
      u.x = Math.max(u.r, Math.min(W - u.r, u.x));
      const maxY = u.team === 'e' ? FRONT_LINE : H + 40;
      u.y = Math.max(u.phase === 'charge' ? -60 : WALL_FACE + u.r, Math.min(maxY, u.y));
    }
  }
}

