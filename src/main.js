// ================= LIVE GAME / UI =================
const SAVE_KEY = 'breach-squad-save-v2';
const OLD_SAVE_KEY = 'breach-squad-save-v1';
const $ = s => document.querySelector(s);
const ROW_NAMES = ['Front', 'Mid', 'Back'];

let S = null, world = null;
let bgCanvas = null, bgKey = '', oldBg = null, fade = 0;
let paused = false, lastFrame = 0, acc = 0, animT = 0;
let selectedIntel = null, pendingBuy = null, hover = null;
let hudT = 0, gridT = 0, histT = 0, saveT = 0;

function defaultState() {
  const open = [[false, false, false, false], [false, false, false, false], [false, false, false, false]];
  START_SLOTS.forEach(([r, c]) => open[r][c] = true);
  return {
    v: 3, cash: 0, lvl: 0, sec: 0, best: 0, playT: 0, campaignDone: false, wallHp: null, bunkers: null, barracks: null,
    grid: [[null, 'rifle', 'rifle', null], [null, 'rifle', 'rifle', null], [null, null, null, null]],
    open, ulv: {}, armyLv: 0, waveNo: 0, hist: [], speed: 1, sound: true, notified: ['rifle', 'shield'], seenHow: false,
  };
}
function save() {
  let out = S;
  if (world) {
    S.waveNo = world.waveNo; S.paused = paused;
    if (world.breaching) {
      // the gate is down and the reward is paid: save the next line, so a reload never revives this gate
      const nx = world.nextLine();
      out = Object.assign({}, S, { lvl: nx.lvl, sec: nx.sec, wallHp: null, bunkers: null, barracks: null });
    } else { S.wallHp = world.wall.hp; S.bunkers = world.bunkerHp.slice(); S.barracks = world.barracksHp.slice(); }
  }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(out)); } catch (e) { /* storage unavailable */ }
}
function load(data) {
  let s = data && data.v >= 2 ? data : null;
  if (!s) { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; } }
  if (!s) {
    // carry progress over from the first version of the game
    try {
      const raw = localStorage.getItem(OLD_SAVE_KEY);
      if (raw) { const o = JSON.parse(raw); s = { cash: o.cash, lvl: o.lvl, sec: o.sec, grid: o.grid, open: o.open, ulv: o.ulv, notified: o.notified, seenHow: false }; }
    } catch (e) { s = null; }
  }
  S = Object.assign(defaultState(), s || {});
  S.best = Math.max(S.best || 0, S.lvl || 0);
  if (S.lvl >= LEVELS.length) S.campaignDone = true;
  // v3 replaced the single wall with barracks + gate: old wall damage doesn't carry over
  if (S.v < 3) { S.wallHp = null; S.bunkers = null; S.barracks = null; }
  S.v = 3;
}
function makeWorld() {
  world = new World({ lvl: S.lvl, sec: S.sec, wallHp: S.wallHp, bunkers: S.bunkers, barracks: S.barracks, grid: S.grid, ulv: S.ulv, waveNo: S.waveNo, armyLimit: ARMY_BASE + 10 * (S.armyLv || 0) });
}
function openCount() { let n = 0; S.open.forEach(r => r.forEach(o => { if (o) n++; })); return n; }
function nextSlotCost() { const i = openCount() - START_SLOTS.length; return i < SLOT_COSTS.length ? SLOT_COSTS[i] : null; }
function unlocked(k) { return isUnlocked(k, S.lvl, S.sec); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

// ---------- sound ----------
const Snd = {
  ctx: null, noise: null, last: {}, master: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.master = this.ctx.createGain(); this.master.gain.value = .45; this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone(f0, f1, dur, vol, type, at) {
    const now = this.ctx.currentTime + (at || 0);
    const o = this.ctx.createOscillator(); o.type = type || 'sine';
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(.001, now + dur);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + dur + .02);
  },
  play(kind) {
    if (!S.sound || !this.ctx || paused) return;
    const now = this.ctx.currentTime;
    const gap = { shot: .045, hmg: .06, snipe: .1, rocket: .08, boom: .07, big: .12, pop: .06, bloop: .07, thump: .1, cannon: .1, go: .5, horn: .8 }[kind] || .08;
    if (this.last[kind] && now - this.last[kind] < gap) return;
    this.last[kind] = now;
    if (kind === 'go') { this.tone(520, 520, .09, .09, 'square'); this.tone(780, 780, .14, .09, 'square', .1); return; }
    if (kind === 'horn') { this.tone(150, 140, .5, .1, 'sawtooth'); return; }
    if (kind === 'bloop' || kind === 'thump') { this.tone(kind === 'thump' ? 140 : 220, 50, .2, .12); return; }
    const P = {
      shot: ['highpass', 1400, .05, .05], hmg: ['bandpass', 700, .08, .07], snipe: ['bandpass', 1000, .14, .22],
      rocket: ['lowpass', 1400, .08, .35], boom: ['lowpass', 420, .28, .55], big: ['lowpass', 260, .45, 1.1], cannon: ['lowpass', 520, .35, .7], pop: ['lowpass', 700, .12, .25],
    }[kind];
    if (!P) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = .8 + Math.random() * .4;
    const f = this.ctx.createBiquadFilter(); f.type = P[0]; f.frequency.value = P[1];
    const g = this.ctx.createGain(); g.gain.setValueAtTime(P[2], now); g.gain.exponentialRampToValueAtTime(.001, now + P[3]);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(now, Math.random() * .5, P[3] + .05);
  },
};
document.addEventListener('pointerdown', () => Snd.init(), { once: false, passive: true });

// ---------- canvas sizing ----------
const cv = $('#cv'), ctx = cv.getContext('2d');
let DPR = 1, SCALE = 1;
// 3D battlefield when WebGL is available (add ?2d to the URL to force the flat renderer)
let scene3d = null;
try { if (R3 && R3.available() && !/[?&]2d\b/.test(location.search)) scene3d = new R3.Scene3D($('#gl')); } catch (e) { scene3d = null; }
if (!scene3d) $('#gl').hidden = true;
else scene3d.attachGestures(cv);   // pinch / scroll to zoom out over the whole base, drag to look along the road
function isWide() { return window.matchMedia('(min-width: 900px)').matches; }
function fit() {
  const stage = $('#stage');
  SCALE = Math.max(.3, Math.min(stage.clientWidth / W, stage.clientHeight / H));
  const fw = Math.floor(W * SCALE), fh = Math.floor(H * SCALE);
  $('#field').style.width = fw + 'px'; $('#field').style.height = fh + 'px';
  DPR = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.floor(fw * DPR); cv.height = Math.floor(fh * DPR);
  cv.style.width = fw + 'px'; cv.style.height = fh + 'px';
  if (scene3d) scene3d.resize(fw, fh, Math.min(DPR, 1.5));
  bgKey = ''; oldBg = null; fade = 0;
  placeLineup();
}
function placeLineup() {
  const target = isWide() ? $('#dockScroll') : $('#lineupBody');
  const el = $('#lineup');
  if (el.parentElement !== target) target.appendChild(el);
  if (isWide() && !$('#lineupSheet').hidden) closeLineup();
}
function ensureBg() {
  const k = world.level.name + ':' + world.sec.name + ':' + SCALE.toFixed(3) + ':' + DPR;
  if (k !== bgKey) { bgCanvas = buildBackground(world.level.theme, world.sec, SCALE * DPR); bgKey = k; }
}

// ---------- main loop ----------
function frame(ts) {
  const dt = Math.min(.1, (ts - (lastFrame || ts)) / 1000);
  lastFrame = ts; animT += dt;
  const frozen = paused || !$('#how').hidden || !$('#bases').hidden;
  if (!frozen) S.playT = (S.playT || 0) + dt;
  if (!frozen) {
    acc += dt * S.speed;
    let n = 0;
    while (acc >= 1 / 30 && n < 10) { world.step(1 / 30); acc -= 1 / 30; n++; }
    if (n >= 10) acc = 0;
  }
  for (const e of world.events) Snd.play(e);
  world.events.length = 0;
  for (const note of world.notes) handleNote(note);
  world.notes.length = 0;
  if (world.cash) { S.cash += world.cash; world.cash = 0; }
  fade = Math.max(0, fade - dt * 1.2);
  draw(dt);
  hudT -= dt; gridT -= dt; histT -= dt; saveT -= dt;
  if (hudT <= 0) { updateHud(); hudT = .1; }
  if (gridT <= 0) { updateGridLive(); refreshSheetLive(); gridT = .15; }
  if (histT <= 0) { renderHist(); histT = .5; }
  if (saveT <= 0) { save(); saveT = 3; }
  requestAnimationFrame(frame);
}
function draw(dt) {
  if (scene3d) {
    scene3d.render(world, animT, { open: S.open, lockCost: nextSlotCost(), hover }, dt || 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scene3d.drawOverlay(ctx, world, animT);
    return;
  }
  ensureBg();
  ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawWorld(ctx, world, bgCanvas, animT, { open: S.open, lockCost: nextSlotCost(), hover, oldBg, fade });
}

// ---------- world notes ----------
function handleNote(n) {
  if (n.type === 'launch') {
    if (n.wave.manual) feed(`<b>Wave ${n.wave.no}</b> sent early · ${n.wave.sent} troops`, 'info', 2200);
  } else if (n.type === 'waveDone') {
    const w = n.wave, R = w.rep, dmg = Math.round(R.dmg);
    const prev = S.hist.length ? S.hist[S.hist.length - 1] : null;
    S.hist.push({ n: w.no, d: dmg, g: Math.round(R.gate || 0), k: R.kills, s: R.sent, l: R.lost, sec: w.sec });
    if (S.hist.length > 40) S.hist.shift();
    let delta = '', cls = '';
    if (prev && prev.sec === w.sec) {
      const dd = dmg - prev.d;
      delta = ` <span class="delta ${dd >= 0 ? 'up' : 'down'}">${dd >= 0 ? '▲' : '▼'} ${fmt(Math.abs(dd))}</span>`;
      cls = dd >= 0 ? 'good' : 'bad';
    }
    let how;
    if (w.captured) how = 'broke through the gate!';
    else if (w.carried) how = 'still out there when the gate fell';
    else if (R.alive > 0) how = `${R.alive} still fighting`;
    else how = `wiped out after ${R.secs}s`;
    let msg = `<b>Wave ${w.no}</b> · ${fmt(dmg)} building damage${delta} · ${how}`;
    if (!w.captured && !w.carried && dmg < 20 && R.alive <= 0) {
      const top = world.sec.field.slice().sort((a, c) => c[1] - a[1])[0];
      if (top) msg += `<br>Didn't reach the buildings. ${ENEMIES[top[0]].name}: ${ENEMIES[top[0]].tip}`;
      cls = 'bad';
    }
    feed(msg, cls, 5200);
    histT = 0;
  } else if (n.type === 'barracksDown') {
    const nm = ENEMIES[n.trains].name;
    feed(!n.left ? '<b>Last barracks down!</b> No more enemy waves. Hit the gate!'
      : n.sameLeft ? `<b>Barracks down!</b> Fewer ${nm} now · ${n.left} barracks left`
      : `<b>Barracks down!</b> No more ${nm} · ${n.left} barracks left`, 'good', 4200);
    renderIntel();
  } else if (n.type === 'breach') {
    const bonus = 150 * (n.lvl + 1) + (n.last ? 400 * (n.lvl + 1) : 0);
    S.cash += bonus;
    showBanner(n.last ? 'Base captured!' : 'Breached!', (n.last ? n.level : n.name) + ' · +$' + fmt(bonus), 2600);
  } else if (n.type === 'section') {
    S.lvl = n.lvl; S.sec = n.sec;
    S.best = Math.max(S.best || 0, n.lvl);
    if (n.levelDone && n.lvl >= LEVELS.length && !S.campaignDone) { S.campaignDone = true; setTimeout(() => openBases(true), 2800); }
    oldBg = bgCanvas; fade = 1;
    const fresh = [];
    for (const k of UNIT_ORDER) if (unlocked(k) && !S.notified.includes(k)) { S.notified.push(k); fresh.push(k); }
    for (const k of fresh) feed(`New squad unlocked: <b>${UNITS[k].name}</b> (${UNITS[k].weapon}). Tap a square to use it.`, 'good', 6500);
    selectedIntel = null;
    feed(`Next up: <b>${world.sec.wall === 'hq' ? 'HQ' : 'Section ' + (n.sec + 1)}</b> · ${world.sec.name}`, 'info', 4000);
    save();
    updateTop(); renderIntel(); renderGrid(); renderHist();
  }
}
function feed(html, cls, ms) {
  const box = $('#feed');
  const el = document.createElement('div');
  el.className = 'fcard ' + (cls || '');
  el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, ms || 4000);
}
let bannerTimer = null;
function showBanner(big, sub, ms) {
  $('#bannerBig').textContent = big; $('#bannerSub').textContent = sub;
  const b = $('#banner'); b.hidden = false;
  const bigEl = $('#bannerBig'); bigEl.style.animation = 'none'; void bigEl.offsetWidth; bigEl.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}

// ---------- HUD ----------
function updateTop() {
  const L = getLevel(S.lvl);
  $('#lvlName').textContent = 'Level ' + (S.lvl + 1) + ' · ' + L.name;
  const pips = $('#pips'); pips.innerHTML = '';
  L.sections.forEach((s, i) => {
    const el = document.createElement('span');
    el.className = 'pip' + (i < S.sec ? ' done' : i === S.sec ? ' cur' : '');
    el.textContent = s.wall === 'hq' ? 'HQ' : String(i + 1);
    el.title = s.name;
    pips.appendChild(el);
  });
  updateCash();
  $('#sndBtn').classList.toggle('off', !S.sound);
  $('#sndBtn').setAttribute('aria-pressed', S.sound ? 'true' : 'false');
  $('#spdBtn').textContent = S.speed + '×';
  $('#spdBtn').setAttribute('aria-label', 'Game speed ' + S.speed + '×');
  $('#pauseBtn').setAttribute('aria-pressed', paused ? 'true' : 'false');
  $('#pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('#pausedTag').hidden = !paused;
}
let shownCash = -1;
function updateCash() {
  const c = Math.floor(S.cash);
  if (c !== shownCash) { $('#cash').textContent = '$' + fmt(c); shownCash = c; }
}
function updateHud() {
  updateCash();
  const w = world.wall;
  $('#wallFill').style.width = (Math.max(0, w.hp) / w.maxHp * 100).toFixed(1) + '%';
  const ob = objectiveText(), og = $('#objective .goal'), oh = $('#objective .hint');
  if (og.textContent !== ob.goal) og.textContent = ob.goal;
  if (oh.textContent !== ob.hint) oh.textContent = ob.hint;
  const bk = world.barracks.filter(b => b.unit && b.unit.alive).length;
  $('#wallName').textContent = bk ? 'Gate · enemy wave in ' + Math.max(0, Math.ceil(world.enemyCountdown)) + 's' : 'Gate · no barracks left!';
  $('#wallHp').textContent = fmt(Math.max(0, w.hp));
  const f = world.formingCount();
  $('#formLbl').textContent = 'Wave ' + (world.waveNo + 1) + ' forming';
  $('#formVal').textContent = f.total ? f.ready + '/' + f.total + ' squads ready' : 'Add squads';
  $('#formFill').style.width = (f.total ? f.ready / f.total * 100 : 0) + '%';
  const army = world.fieldCount();
  $('#armyVal').textContent = army + '/' + world.armyLimit;
  $('#armyBox').classList.toggle('full', world.armyFull);
  $('#armyLbl').textContent = world.armyFull ? 'Army full' : 'Army';
  if (world.armyFull && f.total) $('#formVal').textContent = 'Barracks waiting';
  else if (world.holdLaunch) $('#formVal').textContent = 'Ready · last wave still out';
  const last = S.hist.length ? S.hist[S.hist.length - 1] : null;
  const prev = S.hist.length > 1 ? S.hist[S.hist.length - 2] : null;
  $('#lastDmg').textContent = last ? fmt(last.d) : '–';
  const ld = $('#lastDelta');
  if (last && prev && prev.sec === last.sec && last.sec === world.lineId) { const dd = last.d - prev.d; ld.textContent = (dd >= 0 ? '▲' : '▼') + fmt(Math.abs(dd)); ld.className = 'delta ' + (dd >= 0 ? 'up' : 'down'); }
  else { ld.textContent = ''; }
  const anyReady = world.slotList().some(s => (s.status === 'ready' || s.status === 'walking') && s.units.some(u => u.alive));
  const canUpg = UNIT_ORDER.some(k => unlocked(k) && S.cash >= upgradeCost(k, S.ulv[k] || 1)) || S.cash >= armyCost(S.armyLv || 0);
  $('#squadsBtn').classList.toggle('has', canUpg);
  $('#sendBtn').disabled = !anyReady || paused;
  $('#sendBtn').title = paused ? 'Resume the battle to send squads' : 'Send the squads that are ready now';
}

// ---------- intel ----------
// enemy list, most pressing first: barracks, the squads they still send (biggest first), fixed defenses, then what's gone
function intelList() {
  const s = world.sec, bdef = world.barracksDef, up = [], down = [], fixed = [];
  const byType = {};
  bdef.forEach(([k, n], i) => {
    const e = byType[k] || (byType[k] = { k, n: 0, up: 0, wave: true });
    e.n += ENEMIES[k].vehicle ? n : Math.max(1, Math.round(n * ENEMY_MULT));
    if (world.barracksHp[i] > 0) e.up++;
  });
  for (const k in byType) { const e = byType[k]; if (e.up) up.push(e); else { e.down = true; down.push(e); } }
  up.sort((a, b) => b.n * ENEMIES[b.k].hp - a.n * ENEMIES[a.k].hp);
  if (s.bunkers) fixed.push({ k: 'bunker', n: world.bunkerHp.filter(h => h > 0).length, of: s.bunkers });
  if (s.towers) fixed.push({ k: 'esniper', n: s.towers, label: 'Tower snipers', wall: true });
  if (s.wallGuns) fixed.push({ k: 'gunman', n: s.wallGuns, label: 'Wall gunmen', wall: true });
  const head = bdef.length ? [{ k: 'ebarracks', n: world.barracksHp.filter(h => h > 0).length, of: bdef.length }] : [];
  return head.concat(up, fixed, down);
}
// the persistent objective line on the battlefield: what to do, and the one thing most worth trying next
function objectiveText() {
  const bk = world.barracks.filter(b => b.unit && b.unit.alive).length;
  const goal = world.breaching ? 'Gate down!' : bk ? 'Knock out ' + bk + ' barracks, then break the gate' : 'All barracks down: break the gate!';
  let hint = '';
  const here = S.hist.filter(x => x.sec === world.lineId), last = here[here.length - 1];
  if (world.breaching) hint = 'Moving up to the next line';
  else if (world.armyFull || world.capHeld) hint = 'Army full: squads wait. Raise the limit in Upgrades';
  else if (last && last.d < 20 && last.l >= last.s) {
    const threat = world.barracksDef.filter((b, i) => world.barracksHp[i] > 0).map(b => b[0]).sort((a, b) => ENEMIES[b].hp - ENEMIES[a].hp)[0] || (world.sec.bunkers ? 'bunker' : null);
    const fix = threat && (COUNTERS[threat] || []).filter(unlocked).map(k => UNITS[k].name);
    if (fix && fix.length) hint = "Wave didn't reach the buildings. Try " + fix.slice(0, 2).join(' or ') + ' vs ' + ENEMIES[threat].name;
  }
  if (!hint) {
    const emptyOpen = S.grid.some((row, r) => row.some((k, c) => S.open[r][c] && !k));
    const canUpg = UNIT_ORDER.some(k => unlocked(k) && world.slotList().some(s => s.type === k) && S.cash >= upgradeCost(k, S.ulv[k] || 1));
    const slotCost = nextSlotCost();
    if (emptyOpen) hint = 'Tap an empty square to add a squad';
    else if (slotCost != null && S.cash >= slotCost) hint = 'You can open another square for $' + fmt(slotCost);
    else if (canUpg) hint = 'You can afford an upgrade';
  }
  return { goal, hint };
}
function renderIntel() {
  const box = $('#intel'); box.innerHTML = '';
  const s = world.sec;
  const list = intelList();
  list.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (selectedIntel === i ? ' on' : '');
    b.type = 'button';
    const name = it.label || ENEMIES[it.k].name;
    const count = it.of != null ? it.n + '/' + it.of : it.down ? '✕' : '×' + it.n + (it.up > 1 ? ' · ' + it.up + ' barracks' : '');
    if (it.down) b.style.opacity = '.45';
    b.innerHTML = `<img alt="" src="${unitIcon(it.k, 'e', 34)}"><span class="n">${count}</span><span class="nm">${name}</span>`;
    b.addEventListener('click', () => { selectedIntel = selectedIntel === i ? null : i; renderIntel(); });
    box.appendChild(b);
  });
  const tip = $('#intelTip');
  if (selectedIntel != null && list[selectedIntel]) {
    const it = list[selectedIntel];
    const extra = it.down ? ' Its barracks is destroyed: no more of these.' : it.wave ? ' One barracks trains these for every enemy wave.' : it.wall ? ' Replaced each enemy wave.' : '';
    tip.textContent = (it.label || ENEMIES[it.k].name) + ': ' + (it.k === 'gunman' && it.wall ? WALL_GUN_TIP : ENEMIES[it.k].tip) + extra;
  } else {
    const up = world.barracksDef.filter((b, i) => world.barracksHp[i] > 0);
    const mix = up.map(([k, n]) => (ENEMIES[k].vehicle ? n : Math.max(1, Math.round(n * ENEMY_MULT))) + ' ' + ENEMIES[k].name).join(' + ');
    tip.textContent = up.length
      ? 'Every ' + world.cycle + 's the enemy barracks send ' + mix + '. Destroy a barracks to shrink every wave after. Tap an enemy for how to beat it.'
      : 'All barracks are down: no more enemy waves. Smash the gate!';
  }
  $('#secTitle').textContent = (s.wall === 'hq' ? 'HQ' : 'Section ' + (world.secIdx + 1)) + ' · ' + s.name;
}

// ---------- lineup grid ----------
function renderGrid() {
  const g = $('#grid'); g.innerHTML = '';
  for (let r = 0; r < NROWS; r++) {
    const lab = document.createElement('div'); lab.className = 'rowlab'; lab.textContent = ROW_NAMES[r]; g.appendChild(lab);
    for (let c = 0; c < NCOLS; c++) {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'slot'; el.dataset.r = r; el.dataset.c = c;
      const k = S.grid[r][c];
      if (!S.open[r][c]) {
        const cost = nextSlotCost();
        el.classList.add('locked');
        const ready = pendingBuy && pendingBuy[0] === r && pendingBuy[1] === c;
        el.innerHTML = cost == null ? '<span class="lk">Max</span>' : `<svg viewBox="0 0 16 16" class="lock" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke-width="1.6"/></svg><span class="lk">${ready ? 'Buy?' : ''} $${fmt(cost)}</span>`;
        if (ready) el.classList.add('confirm');
        if (cost != null && S.cash < cost) el.classList.add('poor');
        el.setAttribute('aria-label', 'Locked square, unlock for $' + cost);
      } else if (k) {
        el.classList.add('filled');
        el.innerHTML = `<img alt="" draggable="false" src="${unitIcon(k, 'p', 48)}"><span class="sn">${UNITS[k].name}</span><span class="lv">${S.ulv[k] || 1}</span><span class="st"><i></i></span>`;
        el.setAttribute('aria-label', ROW_NAMES[r] + ' square: ' + UNITS[k].name + '. Drag to move, tap to change');
      } else {
        el.classList.add('empty');
        el.innerHTML = '<span class="plus">+</span>';
        el.setAttribute('aria-label', ROW_NAMES[r] + ' square: empty. Tap to add a squad');
      }
      g.appendChild(el);
    }
  }
  updateGridLive();
}
function updateGridLive() {
  document.querySelectorAll('#grid .slot.filled').forEach(el => {
    const s = world.slots[+el.dataset.r][+el.dataset.c];
    el.classList.toggle('ready', s.status === 'ready');
    el.classList.toggle('walking', s.status === 'walking');
    const bar = el.querySelector('.st i');
    if (bar) bar.style.width = (s.status === 'training' ? s.prog * 100 : 0) + '%';
  });
  // keep locked-square affordability current
  document.querySelectorAll('#grid .slot.locked').forEach(el => { const c = nextSlotCost(); el.classList.toggle('poor', c != null && S.cash < c); });
}
function setSlot(r, c, k) {
  S.grid[r][c] = k || null;
  world.setSlot(r, c, k || null);
  save(); renderGrid();
}
function slotTap(r, c) {
  if (!S.open[r][c]) {
    const cost = nextSlotCost();
    if (cost == null) return;
    if (S.cash < cost) { toast('Need $' + fmt(cost) + ' to open this square'); return; }
    openBuy(r, c, cost);
    return;
  }
  openSheet(r, c);
}
// opening a square: a clear confirm card (row, price, what comes next) that waits for an answer
let buyOpener = null;
function openBuy(r, c, cost) {
  pendingBuy = [r, c]; renderGrid();
  buyOpener = document.activeElement;
  const after = nextSlotCostAfter();
  $('#buyTitle').textContent = 'Open a ' + ROW_NAMES[r].toLowerCase() + ' row square?';
  $('#buyText').innerHTML = 'Costs <b>$' + fmt(cost) + '</b> of your $' + fmt(S.cash) + '. Next you pick which squad goes there.' + (after != null ? ' The square after this one will cost $' + fmt(after) + '.' : '');
  $('#buyOk').textContent = 'Open for $' + fmt(cost);
  const sh = $('#buyCard'); sh.hidden = false;
  requestAnimationFrame(() => { sh.classList.add('show'); focusIn($('#buyOk')); });
}
function closeBuy() {
  pendingBuy = null; renderGrid();
  const sh = $('#buyCard'); sh.classList.remove('show'); setTimeout(() => { sh.hidden = true; }, 180);
  if (buyOpener && document.contains(buyOpener)) focusIn(buyOpener);
  buyOpener = null;
}
function nextSlotCostAfter() { const i = openCount() + 1 - START_SLOTS.length; return i < SLOT_COSTS.length ? SLOT_COSTS[i] : null; }
// ---------- bases: the campaign map, replay, and the victory screen after the last HQ ----------
let basesOpener = null;
function openBases(victory) {
  basesOpener = document.activeElement;
  $('#menu').hidden = true;
  const best = Math.max(S.best || 0, S.lvl), list = $('#basesList');
  $('#basesTitle').textContent = victory ? 'Campaign complete!' : 'Bases';
  $('#basesSub').textContent = victory
    ? 'You captured all ' + LEVELS.length + ' bases. Replay a favorite, or keep going into endless operations.'
    : S.campaignDone ? 'Campaign complete. Replay any base, or continue the endless operations.' : 'Capture each base in order. Captured bases can be replayed any time.';
  const vs = $('#vstats');
  vs.hidden = !victory;
  if (victory) {
    const mins = Math.round((S.playT || 0) / 60);
    vs.innerHTML = '<div><b>' + LEVELS.length + '</b><span>Bases</span></div><div><b>' + fmt(S.waveNo) + '</b><span>Waves</span></div><div><b>' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm') + '</b><span>Played</span></div>';
  }
  list.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const done = i < best || S.campaignDone, here = i === S.lvl, row = document.createElement('div');
    row.className = 'baserow' + (done && !here ? ' done' : '') + (!done && !here ? ' locked' : '');
    row.innerHTML = '<div class="bn"><b>' + (i + 1) + '. ' + L.name + '</b><span>' + (here ? 'Playing now' : done ? 'Captured' : 'Locked') + ' · ' + L.sections.length + ' lines</span></div>' +
      (here ? '' : done ? '<button type="button" data-l="' + i + '">Replay</button>' : '');
    list.appendChild(row);
  });
  if (S.campaignDone || best >= LEVELS.length) {
    const L = getLevel(Math.max(best, LEVELS.length)), here = S.lvl >= LEVELS.length, row = document.createElement('div');
    row.className = 'baserow';
    row.innerHTML = '<div class="bn"><b>Endless: ' + L.name + '</b><span>' + (here ? 'Playing now' : 'Where you left off') + '</span></div>' + (here ? '' : '<button type="button" class="go" data-l="' + Math.max(best, LEVELS.length) + '">Continue</button>');
    list.appendChild(row);
  }
  list.querySelectorAll('button[data-l]').forEach(b => b.onclick = () => playLevel(+b.dataset.l));
  $('#basesClose').textContent = victory ? (S.lvl >= LEVELS.length ? 'Start ' + getLevel(S.lvl).name : 'Back to battle') : 'Back to battle';
  $('#bases').hidden = false;
  focusIn($('#basesClose'));
}
function closeBases() { $('#bases').hidden = true; if (basesOpener && document.contains(basesOpener)) focusIn(basesOpener); basesOpener = null; }
function playLevel(i) {
  S.best = Math.max(S.best || 0, S.lvl);
  S.lvl = i; S.sec = 0; S.wallHp = null; S.bunkers = null; S.barracks = null;
  makeWorld(); save();
  bgKey = ''; $('#feed').innerHTML = ''; selectedIntel = null;
  closeBases(); refreshAll();
  feed('Now playing <b>' + world.level.name + '</b> · ' + world.sec.name, 'info', 4000);
}
$('#basesBtn').onclick = () => openBases(false);
$('#basesClose').onclick = closeBases;
$('#buyCancel').onclick = closeBuy;
$('#buyCard').addEventListener('click', e => { if (e.target.id === 'buyCard') closeBuy(); });
$('#buyOk').onclick = () => {
  if (!pendingBuy) return closeBuy();
  const [r, c] = pendingBuy, cost = nextSlotCost();
  if (cost == null || S.cash < cost) { closeBuy(); toast('Not enough cash yet'); return; }
  S.cash -= cost; S.open[r][c] = true; save();
  buyOpener = null; closeBuy(); updateCash();
  openSheet(r, c);
};
(function setupDrag() {
  const g = $('#grid');
  let start = null, ghost = null, from = null;
  g.addEventListener('pointerdown', e => {
    const el = e.target.closest('.slot'); if (!el) return;
    start = { x: e.clientX, y: e.clientY, el, id: e.pointerId };
    from = [+el.dataset.r, +el.dataset.c];
  });
  window.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!ghost && Math.hypot(dx, dy) > 8 && S.grid[from[0]][from[1]] && S.open[from[0]][from[1]]) {
      ghost = start.el.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost);
      start.el.classList.add('dragging');
    }
    if (ghost) {
      e.preventDefault();
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over'));
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const os = over && over.closest && over.closest('#grid .slot');
      if (os && os !== start.el && S.open[+os.dataset.r][+os.dataset.c]) os.classList.add('over');
    }
  }, { passive: false });
  window.addEventListener('pointerup', e => {
    if (!start || e.pointerId !== start.id) return;
    if (ghost) {
      ghost.remove(); ghost = null;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const os = over && over.closest && over.closest('#grid .slot');
      if (os) {
        const r2 = +os.dataset.r, c2 = +os.dataset.c;
        if (S.open[r2][c2] && !(r2 === from[0] && c2 === from[1])) {
          const tmp = S.grid[r2][c2]; S.grid[r2][c2] = S.grid[from[0]][from[1]]; S.grid[from[0]][from[1]] = tmp;
          world.swapSlots(from, [r2, c2]);
          save();
        }
      }
      renderGrid();
    } else slotTap(from[0], from[1]);
    start = null; from = null;
  });
  window.addEventListener('pointercancel', () => { if (ghost) { ghost.remove(); ghost = null; renderGrid(); } start = null; });
})();
// tap a deployment square right on the battlefield
function slotAt(e) {
  let lx, ly;
  if (scene3d) { const p = scene3d.pick(e.clientX, e.clientY); if (!p) return null; lx = p.x; ly = p.y; }
  else { const rect = cv.getBoundingClientRect(); lx = (e.clientX - rect.left) / SCALE; ly = (e.clientY - rect.top) / SCALE; }
  for (let r = 0; r < NROWS; r++) for (let c = 0; c < NCOLS; c++) if (Math.abs(lx - COLS_X[c]) <= 41 && Math.abs(ly - ROWS_Y[r]) <= 16) return [r, c];
  return null;
}
let cvDown = null;
cv.addEventListener('pointerdown', e => { cvDown = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('pointerup', e => {
  if (!cvDown || Math.hypot(e.clientX - cvDown.x, e.clientY - cvDown.y) > 10) { cvDown = null; return; }
  cvDown = null;
  const s = slotAt(e);
  if (s) slotTap(s[0], s[1]);
});
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { hover = slotAt(e); cv.style.cursor = hover ? 'pointer' : 'default'; } });
cv.addEventListener('pointerleave', () => { hover = null; });

// ---------- squads sheet (place + upgrade) ----------
let sheetSlot = null;
function unitStats(k) {
  const d = UNITS[k], m = lvMult(S.ulv[k] || 1);
  const dps = d.heal ? (d.heal * m / d.cd) : (d.dmg * m / d.cd);
  return { hp: Math.round(d.hp * m), dps: Math.round(dps), range: d.range, n: d.n, train: trainTime(k, S.ulv[k]).toFixed(1) };
}
// keyboard focus: move into a sheet when it opens, keep it there, and give it back to the opener on close
let sheetOpener = null, lineupOpener = null;
function focusIn(el) { if (el) try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
function openSheet(r, c) {
  sheetSlot = r == null ? null : [r, c];
  sheetOpener = document.activeElement;
  renderSheet();
  const sh = $('#sheet'); sh.hidden = false;
  requestAnimationFrame(() => { sh.classList.add('show'); focusIn($('#sheetClose')); });
}
function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('show'); setTimeout(() => { sh.hidden = true; }, 180); sheetSlot = null;
  if (sheetOpener && document.contains(sheetOpener)) focusIn(sheetOpener);
  sheetOpener = null;
}
// while the sheet is open the battle keeps paying out: keep prices, buttons and unlocks current
let sheetSig = '';
function refreshSheetLive() {
  if ($('#sheet').hidden) return;
  const sig = UNIT_ORDER.filter(unlocked).join(',') + '|' + (sheetSlot || '');
  if (sig !== sheetSig) { renderSheet(); return; }
  $('#sheetCash').textContent = '$' + fmt(S.cash);
  const au = $('#armyUpg'); if (au) au.disabled = S.cash < armyCost(S.armyLv || 0);
  $('#sheetList').querySelectorAll('.upg[data-k]').forEach(b => { b.disabled = S.cash < upgradeCost(b.dataset.k, S.ulv[b.dataset.k] || 1); });
}
function renderSheet() {
  const head = $('#sheetHead'), list = $('#sheetList');
  const keepScroll = list.scrollTop, fa = document.activeElement;
  const keepFocus = fa && list.contains(fa) ? (fa.id ? '#' + fa.id : fa.dataset && fa.dataset.k ? `.${fa.className.split(' ')[0]}[data-k="${fa.dataset.k}"]` : null) : null;
  sheetSig = UNIT_ORDER.filter(unlocked).join(',') + '|' + (sheetSlot || '');
  if (sheetSlot) {
    const [r, c] = sheetSlot;
    head.innerHTML = `<h2>Pick a squad · ${ROW_NAMES[r]} row</h2>` + (S.grid[r][c] ? '<button type="button" class="ghostbtn" id="clearSlot">Empty this square</button>' : '');
    const cl = $('#clearSlot'); if (cl) cl.onclick = () => { setSlot(r, c, null); closeSheet(); };
  } else head.innerHTML = '<h2>Squads &amp; upgrades</h2>';
  $('#sheetCash').textContent = '$' + fmt(S.cash);
  list.innerHTML = '';
  if (!sheetSlot) {
    const ac = armyCost(S.armyLv || 0), lim = ARMY_BASE + 10 * (S.armyLv || 0);
    const row = document.createElement('div');
    row.className = 'urow';
    row.innerHTML = `
      <img class="uimg" alt="" src="${unitIcon('rifle', 'p', 52)}">
      <div class="uinfo">
        <div class="uname">Army limit <span class="ulv">${lim}</span></div>
        <div class="urole">How many troops can be out on the battlefield. At the limit, the barracks wait until some are knocked out.</div>
      </div>
      <div class="uact"><button type="button" class="upg" id="armyUpg" ${S.cash < ac ? 'disabled' : ''}>+10 troops<b>$${fmt(ac)}</b></button></div>`;
    list.appendChild(row);
    row.querySelector('#armyUpg').onclick = () => {
      if (S.cash < ac) return;
      S.cash -= ac; S.armyLv = (S.armyLv || 0) + 1; world.armyLimit = ARMY_BASE + 10 * S.armyLv;
      save(); updateCash(); renderSheet(); updateHud(); toast('Army limit is now ' + world.armyLimit);
    };
  }
  for (const k of UNIT_ORDER) {
    const d = UNITS[k], ok = unlocked(k), lv = S.ulv[k] || 1, st = unitStats(k), cost = upgradeCost(k, lv);
    const row = document.createElement('div');
    row.className = 'urow' + (ok ? '' : ' lockedu');
    const cur = sheetSlot && S.grid[sheetSlot[0]][sheetSlot[1]] === k;
    row.innerHTML = `
      <img class="uimg" alt="" src="${unitIcon(k, 'p', 52)}">
      <div class="uinfo">
        <div class="uname">${d.name} <span class="uw">${d.weapon}</span> ${ok ? `<span class="ulv">Lv ${lv}</span>` : ''}</div>
        ${ok ? `<div class="urole">${d.role}</div>
        <div class="uvs"><span class="good">Strong vs</span> ${d.good}</div>
        <div class="uvs"><span class="bad">Weak vs</span> ${d.bad}</div>
        <div class="ustats"><span>${st.n} ${st.n > 1 ? 'troops' : 'troop'}</span><span>HP ${st.hp} each</span><span>${d.heal ? 'Heals ' + st.dps + '/s' : 'DPS ' + st.dps + ' each'}</span>${d.charge ? `<span>C4 ${Math.round(d.charge * lvMult(S.ulv[k] || 1))} vs buildings</span>` : ''}<span>Range ${st.range}</span><span>Trains in ${st.train}s</span>${d.setup ? `<span>Setup ${d.setup}s</span>` : ''}</div>`
        : `<div class="urole">Locked. ${unlockLabel(k)} to recruit.</div>`}
      </div>
      <div class="uact">
        ${ok && sheetSlot ? `<button type="button" class="place${cur ? ' cur' : ''}" data-k="${k}">${cur ? 'Placed' : 'Place'}</button>` : ''}
        ${ok ? `<button type="button" class="upg" data-k="${k}" ${S.cash < cost ? 'disabled' : ''}>Upgrade<b>$${fmt(cost)}</b></button>` : ''}
      </div>`;
    list.appendChild(row);
  }
  list.scrollTop = keepScroll;
  if (keepFocus) focusIn(list.querySelector(keepFocus) || $('#sheetClose'));
  list.querySelectorAll('.place').forEach(b => b.onclick = () => { const [r, c] = sheetSlot; setSlot(r, c, b.dataset.k); closeSheet(); });
  list.querySelectorAll('.upg[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k, lv = S.ulv[k] || 1, cost = upgradeCost(k, lv);
    if (S.cash < cost) return;
    S.cash -= cost; S.ulv[k] = lv + 1; save(); updateCash(); renderSheet(); renderGrid();
    toast(UNITS[k].name + ' upgraded to Lv ' + (lv + 1) + '. New squads get it.');
  });
}
function openLineup() { lineupOpener = document.activeElement; const sh = $('#lineupSheet'); sh.hidden = false; requestAnimationFrame(() => { sh.classList.add('show'); focusIn($('#lineupClose')); }); renderHist(); }
function closeLineup() {
  const sh = $('#lineupSheet'); sh.classList.remove('show'); setTimeout(() => { sh.hidden = true; }, 180);
  if (lineupOpener && document.contains(lineupOpener)) focusIn(lineupOpener);
  lineupOpener = null;
}

// ---------- per-wave chart ----------
function renderHist() {
  const box = $('#hist');
  const h = S.hist.slice(-14);
  const live = world.waves.filter(w => !w.reported && w.sent > 0);
  const max = Math.max(1, ...h.map(x => x.d), ...live.map(w => w.dmg));
  box.innerHTML = '';
  if (!h.length && !live.length) { box.innerHTML = '<span class="histempty">Each wave\'s damage shows up here</span>'; $('#est').textContent = ''; return; }
  h.forEach((x, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar' + (i === h.length - 1 ? ' last' : '') + (i > 0 && h[i - 1].sec !== x.sec ? ' sec' : '');
    bar.style.height = Math.max(3, x.d / max * 100) + '%';
    bar.title = 'Wave ' + x.n + ': ' + fmt(x.d) + ' building damage (' + fmt(x.g || 0) + ' to the gate), lost ' + x.l + '/' + x.s;
    box.appendChild(bar);
  });
  live.forEach(w => {
    const bar = document.createElement('div');
    bar.className = 'bar live';
    bar.style.height = Math.max(3, w.dmg / max * 100) + '%';
    bar.title = 'Wave ' + w.no + ' (fighting): ' + fmt(w.dmg);
    box.appendChild(bar);
  });
  const here = S.hist.filter(x => x.sec === world.lineId), same = here.slice(-3);
  const gateHits = same.filter(x => (x.g || 0) > 0);
  if (world.breaching) $('#est').innerHTML = '<b>Gate down!</b> Moving to the next line.';
  else if (!same.length) $('#est').textContent = 'Finished waves on this line will show here.';
  else if (gateHits.length) {
    const avgG = gateHits.reduce((a, x) => a + x.g, 0) / same.length;
    $('#est').innerHTML = `Best here <b>${fmt(Math.max(...here.map(x => x.d)))}</b> · gate takes about <b>${Math.max(1, Math.ceil(Math.max(0, world.wall.hp) / avgG))}</b> more waves at this pace`;
  } else {
    const bk = world.barracks.filter(b => b.unit && b.unit.alive).length;
    $('#est').innerHTML = same.some(x => x.d > 0)
      ? (bk ? `Hitting buildings but not the gate yet · <b>${bk}</b> barracks still standing` : 'Barracks are down. Next waves can reach the gate.')
      : 'No building damage yet. Try a different lineup.';
  }
}

// ---------- misc ----------
let toastT = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 200); }, 2000);
}
function refreshAll() { updateTop(); renderIntel(); renderGrid(); renderHist(); updateHud(); }

$('#sendBtn').onclick = () => {
  if (paused) { toast('Resume the battle to send squads'); return; }
  if (!world.launch(true)) toast(world.capHeld ? 'Army limit reached. Wait for troops to fall, or raise the limit in Upgrades' : 'No squads are lined up yet');
  updateHud();
};
$('#spdBtn').onclick = () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; save(); updateTop(); };
$('#pauseBtn').onclick = () => { paused = !paused; updateTop(); updateHud(); save(); };
$('#squadsBtn').onclick = () => openSheet(null);
$('#lineupBtn').onclick = openLineup;
$('#lineupClose').onclick = closeLineup;
$('#lineupSheet').addEventListener('click', e => { if (e.target.id === 'lineupSheet') closeLineup(); });
$('#sheetClose').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
$('#sndBtn').onclick = () => { S.sound = !S.sound; Snd.init(); save(); updateTop(); };
$('#menuBtn').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
$('#howBtn').onclick = () => { $('#menu').hidden = true; $('#how').hidden = false; };
$('#howClose').onclick = () => { $('#how').hidden = true; S.seenHow = true; save(); Snd.init(); };
$('#resetBtn').onclick = () => {
  const b = $('#resetBtn');
  if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Tap again to erase progress'; setTimeout(() => { b.classList.remove('arm'); b.textContent = 'Start over'; }, 3000); return; }
  S = defaultState(); S.seenHow = true; makeWorld(); save();
  $('#menu').hidden = true; b.classList.remove('arm'); b.textContent = 'Start over';
  bgKey = ''; $('#feed').innerHTML = ''; refreshAll();
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#bases').hidden) closeBases(); else if (!$('#buyCard').hidden) closeBuy(); else if (!$('#sheet').hidden) closeSheet(); else if (!$('#lineupSheet').hidden) closeLineup(); $('#how').hidden = true; $('#menu').hidden = true; }
  if (e.key === ' ' && e.target === document.body) { paused = !paused; updateTop(); updateHud(); e.preventDefault(); }
  if (e.key === 'Tab') {   // keep Tab inside whichever sheet is open
    const open = !$('#bases').hidden ? $('#bases .card') : !$('#buyCard').hidden ? $('#buyCard .card') : !$('#sheet').hidden ? $('#sheet .card') : !$('#lineupSheet').hidden ? $('#lineupSheet .card') : !$('#how').hidden ? $('#how .card') : null;
    if (!open) return;
    const f = [...open.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { f[0].focus(); e.preventDefault(); }
  }
});
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(() => fit()).observe($('#stage'));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

function start(data) {
  load(data);
  makeWorld();
  paused = !!S.paused;
  fit();
  refreshAll();
  if (!S.seenHow) $('#how').hidden = false;
  else if (S.waveNo > 0) toast('Welcome back! Buildings keep their damage; your squads regroup at the start line.');
  requestAnimationFrame(frame);
}
if (window.claude && window.claude.hot) { try { window.claude.hot.snapshot(() => { save(); return S; }); } catch (e) { /* no hot reload */ } }
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start(window.claude && window.claude.hot ? window.claude.hot.data : null);

