// ================= CONTINUOUS WORLD =================
// Barracks train squads for each deployment square. Trained troops walk to their
// square and wait. When every assigned square is filled the wave launches and the
// barracks start on the next one. On the enemy side, each enemy barracks trains its
// squad on a shared timer. Destroyed barracks stay destroyed, so the enemy waves shrink.
// The section is cleared when the gate falls.
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
    this.loadSection(o.lvl, o.sec, o.wallHp, o.bunkers, o.barracks);
  }
  r() { return this.rng(); }
  slotList() { const a = []; for (const row of this.slots) for (const s of row) a.push(s); return a; }
  slotPos(s) { return { x: COLS_X[s.c], y: ROWS_Y[s.r] }; }
  // ---------- sections ----------
  loadSection(lvl, sec, gateHp, bunkers, barracks) {
    this.lvl = lvl; this.secIdx = sec; this.level = getLevel(lvl); this.sec = this.level.sections[sec]; this.scale = sectionScale(lvl, sec);
    this.gateMax = Math.round(sectionMaxHp(lvl, sec) * this.scale);
    this.gateHp0 = gateHp != null && gateHp > 0 ? Math.min(gateHp, this.gateMax) : this.gateMax;
    this.bunkerHp = bunkers && bunkers.length === (this.sec.bunkers || 0) ? bunkers.slice() : Array(this.sec.bunkers || 0).fill(ENEMIES.bunker.hp * this.scale);
    this.barracksDef = sectionBarracks(this.sec);
    this.barracksHp = barracks && barracks.length === this.barracksDef.length ? barracks.slice() : this.barracksDef.map(([k]) => barracksMaxHp(k, this.scale));
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
    this.enemyCountdown = this.cycle;
    this.nextEnemy = 3;
    this.enemyWaveNo = 0;
    this.breaching = false; this.breachT = 0;
  }
  spawnStatics() {
    const s = this.sec, sc = this.scale, L = lineLayout(s);
    // the gate is the objective: this.wall points at it so the HUD and wall art follow its HP
    const g = this.mk('e', 'gate', ENEMIES.gate, L.gate.x, L.gate.y, sc, sc);
    g.maxHp = this.gateMax; g.hp = this.gateHp0; g.face = Math.PI / 2;
    this.wall = g;
    this.barracks = [];
    this.barracksDef.forEach(([k], i) => {
      const b = { i, k, x: L.barracks[i].x, y: L.barracks[i].y, unit: null };
      this.barracks.push(b);
      if (!(this.barracksHp[i] > 0)) return;
      const u = this.mk('e', 'ebarracks', ENEMIES.ebarracks, b.x, b.y, sc, sc);
      u.maxHp = barracksMaxHp(k, sc); u.hp = this.barracksHp[i]; u.barracksIdx = i; u.trains = k; u.face = Math.PI / 2;
      b.unit = u;
    });
    L.bunkers.forEach((p, i) => {
      if (!(this.bunkerHp[i] > 0)) return;
      const u = this.mk('e', 'bunker', ENEMIES.bunker, p.x, p.y, sc, sc);
      u.hp = this.bunkerHp[i]; u.maxHp = ENEMIES.bunker.hp * sc; u.bunkerIdx = i; u.face = Math.PI / 2;
    });
    this.posts = [];
    for (const t of L.towers) this.posts.push({ k: 'esniper', x: t.x, y: t.y, tower: true });
    const ng = s.wallGuns || 0;
    for (let i = 0; i < ng; i++) this.posts.push({ k: 'gunman', x: 48 + (i + .5) * ((W - 96) / ng), y: WALL_Y - 5 });
    for (const p of this.posts) this.spawnPost(p);
  }
  // each defender gets its own spot in a block formation in front of its barracks, so idle squads don't jostle
  guardSpot(u, b) {
    const used = new Set();
    for (const o of this.units) if (o.alive && o !== u && o.from === b.i && o.guardIdx != null) used.add(o.guardIdx);
    let i = 0; while (used.has(i)) i++;
    u.guardIdx = i;
    const gap = Math.max(17, u.r * 2.4), perRow = 4, row = Math.floor(i / perRow), col = i % perRow;
    u.homeX = Math.max(12, Math.min(W - 12, b.x + (col - (perRow - 1) / 2) * gap));
    u.homeY = b.y + b.unit.r + GUARD_DEPTH + row * gap;
  }
  enemyPow(k) { return this.scale * (ENEMIES[k].vehicle ? Math.sqrt(ENEMY_POWER) : ENEMY_POWER); }
  // strength multiplier for the troops the enemy barracks send: part fixed per section, part matched to our lineup
  wavePow() {
    let ours = 0;
    for (const s of this.slotList()) if (s.type) { const d = UNITS[s.type]; ours += d.n * unitValue(d, lvMult(this.ulv[s.type] || 1)); }
    let theirs = 0;
    for (const [k, n] of this.barracksDef) theirs += (ENEMIES[k].vehicle ? n : Math.max(1, Math.round(n * ENEMY_MULT))) * unitValue(ENEMIES[k], 1);
    const fixed = this.scale * ENEMY_POWER;
    if (!ours || !theirs) return fixed * (this.lvl === 0 && EASY_START[this.secIdx] || 1);
    const matched = Math.sqrt(MATCH) * ours / theirs;    // hp and damage both scale, so strength scales with its square
    let g = this.secIdx; for (let i = 0; i < this.lvl; i++) g += getLevel(i).sections.length;
    return Math.pow(fixed, 1 - ADAPT) * Math.pow(matched, ADAPT) * (EASY_START[g] || 1);
  }
  spawnPost(p) {
    const u = this.mk('e', p.k, ENEMIES[p.k], p.x, p.y, this.enemyPow(p.k), this.enemyPow(p.k));
    u.static = true; u.cover = true; u.onWall = true; u.rangeBonus = p.tower ? 10 : 25; u.tower = !!p.tower;
    p.unit = u;
  }
  enemyWave() {
    this.enemyWaveNo++;
    for (const p of this.posts) if (!p.unit || !p.unit.alive) this.spawnPost(p);
    let sent = 0;
    this.ePow = this.wavePow();
    for (const b of this.barracks) {
      if (!b.unit || !b.unit.alive) continue;
      const n0 = this.barracksDef[b.i][1];
      const n = ENEMIES[b.k].vehicle ? n0 : Math.max(1, Math.round(n0 * ENEMY_MULT));
      // each barracks keeps at most ENEMY_CAP_WAVES of its squads alive, so unanswered waves don't pile up forever
      const alive = this.units.filter(u => u.alive && u.from === b.i).length;
      const room = Math.min(n, Math.ceil(n * ENEMY_CAP_WAVES) - alive);
      for (let j = 0; j < room; j++) {
        const inRow = Math.min(room, 4), row = Math.floor(j / 4), col = j % 4;
        const x = b.x + (col - (inRow - 1) / 2) * 15 + (this.r() - .5) * 6;
        const y = b.y + b.unit.r + 10 + row * 13 + this.r() * 4;
        const u = this.mk('e', b.k, ENEMIES[b.k], Math.max(10, Math.min(W - 10, x)), y, this.ePow, this.ePow);
        u.ewave = this.enemyWaveNo; u.from = b.i;
        this.guardSpot(u, b);
        sent++;
      }
    }
    if (sent) this.events.push('horn');
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
    this.holdLaunch = false;
    if (req.length && req.every(s => s.status === 'ready')) {
      // one wave at a time: wait until the last wave is mostly spent, so waves don't snowball
      let size = 0; for (const s of req) for (const u of s.units) if (u.alive) size++;
      if (this.fieldCount() <= size * STACK_MAX) this.launch(false); else this.holdLaunch = true;
    }
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
      this.enemyCountdown = this.nextEnemy;
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
  distTo(u, t) { return dist(u, t) - t.r - u.r * .5; }
  inRange(u, t) { return this.distTo(u, t) <= this.range(u); }
  cluster(f, rad) {
    let n = 0;
    for (const o of this.units) if (o.alive && o.team === f.team && o !== f && dist(o, f) < rad) n++;
    return n;
  }
  prio(u, f) {
    const ai = u.def.ai;
    if (u.team === 'p') {
      if (f.def.gate) return { std: 1, at: 8, blast: 6, ap: 0 }[ai] || 1;
      if (f.def.barracks) return { std: 3, at: 16, blast: 10, ap: 1 }[ai] || 3;
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
  pickTarget(u) {
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
    const sight = u.team === 'p' ? (u.phase === 'field' ? Math.max(R + 70, 190) : R) : (u.static ? R : u.engaged ? LEASH : Math.max(R, AGGRO));
    for (const f of foes) {
      const d = this.distTo(u, f);
      if (d > sight) continue;
      if (u.team === 'p' && f.y < WALL_Y - 2 && !f.onWall && !f.def.structure) continue;
      const s = this.prio(u, f) * 10 - d * .06 + (d <= R ? 100 : 0);
      if (s > bs) { bs = s; best = f; }
    }
    // nothing in sight: march on the nearest building (barracks stand in front, so they come first)
    if (!best && u.team === 'p' && u.phase === 'field' && !this.breaching) {
      let bd = 1e9;
      for (const f of foes) if (f.def.structure) { const d = this.distTo(u, f); if (d < bd) { bd = d; best = f; } }
    }
    return best;
  }
  moveTo(u, tx, ty, dt, speed) {
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d < 1) { u.moving = false; return true; }
    const sp = Math.min(d, speed * dt);
    let mx = dx / d, my = dy / d;
    // walk around teammates who are standing still (setting up, firing) instead of shoving through them
    if (!u.static && u.phase !== 'walk') {
      let sx = 0, sy = 0;
      for (const o of this.units) {
        if (o === u || !o.alive || o.team !== u.team || o.moving || o.static || o.phase === 'queue') continue;
        const ox = o.x - u.x, oy = o.y - u.y, od = Math.hypot(ox, oy), reach = (u.r + o.r) * 2.4;
        if (od > reach || od < .01) continue;
        const ahead = (ox * mx + oy * my) / od;
        if (ahead < .2) continue;
        const side = (mx * oy - my * ox) > 0 ? -1 : 1;           // pass on the side away from them
        const w = ahead * (1 - od / reach);
        sx += -my * side * w; sy += mx * side * w;
      }
      if (sx || sy) { mx += sx * 1.6; my += sy * 1.6; const n = Math.hypot(mx, my) || 1; mx /= n; my /= n; }
    }
    u.x += mx * sp; u.y += my * sp;
    u.face = Math.atan2(my, mx);
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
    if (d.structure && !d.dmg) return;   // gate and barracks don't shoot
    if (d.ai === 'medic') return this.medic(u, dt);
    if (u.state === 'run' || u.state === 'plant') return this.breacher(u, dt);
    u.retarget -= dt;
    if (u.retarget <= 0 || !u.target || !u.target.alive || u.target.phase === 'retreat') {
      u.target = this.pickTarget(u); u.retarget = (d.melee ? .2 : .35) + this.r() * .15;
    }
    const t = u.target;
    if (t && this.inRange(u, t)) {
      if (u.wave) u.wave.contact = true;
      u.moving = false; u.idleT = 0;
      u.face = Math.atan2(t.y - u.y, t.x - u.x);
      if (d.setup) { u.setupT += dt; if (u.setupT < d.setup) return; }
      if (u.cdT <= 0) { this.fire(u, t); u.cdT = d.cd * (.85 + this.r() * .3); }
      return;
    }
    if (u.static) return;
    if (d.brace && u.team === 'p' && u.y < FRONT_LINE + 10) {   // push out of the start area before bracing
      for (const f of this.units) if (f.alive && f.team !== u.team && !f.static && f.engaged && dist(f, u) < d.brace) { u.moving = false; u.face = Math.atan2(f.y - u.y, f.x - u.x); u.braced = true; return; }
      u.braced = false;
    }
    if (d.setup && u.setupT >= d.setup && u.idleT < 1.2) { u.idleT += dt; return; }
    let gx, gy;
    if (u.team === 'p') {
      if (t) { gx = t.x; gy = t.y; }
      else { gx = u.x; gy = BARRACKS_Y + 40; }
      gy = Math.max(gy, WALL_FACE + u.r + 2);
    } else {
      if (!t) {
        // nobody close: fall back to the guard post and wait for attackers to come to us
        u.engaged = false;
        const hx = u.homeX != null ? u.homeX : u.x, hy = u.homeY != null ? u.homeY : u.y;
        if (Math.hypot(hx - u.x, hy - u.y) > (u.moving ? 1.5 : 6)) this.moveTo(u, hx, hy, dt, d.speed * .7); else { u.moving = false; u.face = Math.PI / 2; }
        return;
      }
      u.engaged = true;
      gx = t.x; gy = Math.min(t.y, CHASE_LINE);
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
    if (!u.goal || !u.goal.alive) {
      let best = null, bd = 1e9;
      for (const f of this.units) if (f.alive && f.team === 'e' && f.def.structure) { const d = dist(u, f); if (d < bd) { bd = d; best = f; } }
      if (!best) { u.state = 'fight'; return; }
      u.goal = best;
    }
    const g = u.goal;
    const tx = g.x, ty = g.y + g.r + u.r;
    if (u.state === 'run') {
      if (Math.hypot(tx - u.x, ty - u.y) >= 4) { this.moveTo(u, tx, ty, dt, u.def.speed); return; }
      u.state = 'plant'; u.plantT = 1.6; u.moving = false; u.face = -Math.PI / 2;
      return;
    }
    u.plantT -= dt;
    if (u.plantT <= 0) {
      if (g.alive) this.applyDamage(g, u.charge, 'demo', u);
      this.explode(tx, ty - 6, 34, 60, 'blast', u, g);
      this.boomFx(tx, ty - 6, 46, true);
      this.shake = Math.max(this.shake, .6); this.events.push('big');
      u.state = 'fight'; u.target = null;
    }
  }
  // ---------- combat ----------
  fire(u, t) {
    const d = u.def;
    const tx = t.x + (t.def.structure ? (this.r() - .5) * t.r : 0);
    const ty = t.y + (t.def.structure ? (this.r() - .5) * t.r * .6 : 0);
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
        if (p.t && p.t.alive && !p.t.def.structure) { p.tx = p.t.x; p.ty = p.t.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const s = p.speed * dt;
        if (Math.random() < .7) this.fx.push({ type: 'puff', x: p.x, y: p.y, vx: 0, vy: 0, life: .5, max: .5, size: 2.5, c: 'smoke' });
        if (d <= s + 3) {
          p.dead = true;
          const tgt = p.t && p.t.alive ? p.t : null;
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
  }
  applyDamage(t, dmg, dtype, src) {
    if (!t || !t.alive) return;
    if (t.def.structure && this.breaching) return;
    let m = MULT[dtype][t.armor];
    if (t.cover) m *= COVER[dtype];
    const d = dmg * m;
    if (d <= 0) return;
    t.hp -= d;
    if (!(t.hurtCd > 0)) { t.hurt = .07; t.hurtCd = .35; }
    if (src && src.wave) src.wave.contact = true;
    if (t.wave) t.wave.contact = true;
    if (t.team === 'e' && !t.static && !t.engaged && src) this.alert(t);
    if (t.def.barracks) this.barracksHp[t.barracksIdx] = Math.max(0, t.hp);
    if (t.bunkerIdx != null) this.bunkerHp[t.bunkerIdx] = Math.max(0, t.hp);
    if (src && src.team === 'p' && t.def.structure) {
      if (src.wave) src.wave.dmg += d;
      this.cash += d * STRUCT_CASH;
      if (d >= 15) this.texts.push({ x: t.x + (this.r() - .5) * 16, y: t.y - t.r - 4, txt: '-' + Math.round(d), life: 1, max: 1, big: d >= 120 });
    }
    if (t.hp <= 0) this.kill(t, src);
  }
  // a defender under fire wakes up, and so do squad-mates standing near it
  alert(t) {
    t.engaged = true; t.retarget = 0;
    for (const o of this.units) if (o.alive && o.team === 'e' && !o.static && !o.engaged && dist(o, t) < ALERT_R) { o.engaged = true; o.retarget = 0; }
  }
  kill(t, src, silent) {
    if (!t.alive) return;
    t.alive = false; t.hp = 0;
    if (t.team === 'e') {
      const b = (t.def.bounty || 3) * this.scale;
      this.cash += b;
      if (src && src.wave) src.wave.kills++;
      if (t.def.structure && !t.def.gate && !silent) {
        this.boomFx(t.x, t.y, 40, true); this.shake = Math.max(this.shake, .5); this.events.push('big');
        const label = t.def.barracks ? 'BARRACKS DOWN' : 'BUNKER DOWN';
        this.texts.push({ x: t.x, y: t.y - 20, txt: label, life: 1.6, max: 1.6, big: true, cash: true });
        if (t.def.barracks) this.notes.push({ type: 'barracksDown', trains: t.trains, left: this.barracks.filter(b => b.unit && b.unit.alive).length });
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
        let wa = a.static ? 0 : ma, wb = b.static ? 0 : mb;
        // between teammates, whoever is moving gives way to whoever is holding position
        if (a.team === b.team && a.moving !== b.moving) { if (a.moving) wb = 0; else wa = 0; }
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
      const maxY = u.team === 'e' ? CHASE_LINE : H + 40;
      u.y = Math.max(u.phase === 'charge' ? -60 : WALL_FACE + u.r, Math.min(maxY, u.y));
    }
  }
}

