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
    v: 2, cash: 0, lvl: 0, sec: 0, wallHp: null, bunkers: null,
    grid: [[null, 'rifle', 'rifle', null], [null, 'rifle', 'rifle', null], [null, null, null, null]],
    open, ulv: {}, armyLv: 0, waveNo: 0, hist: [], speed: 1, sound: true, notified: ['rifle', 'shield'], seenHow: false,
  };
}
function save() {
  if (world) { S.wallHp = world.breaching ? 0 : world.wall.hp; S.bunkers = world.bunkerHp.slice(); S.waveNo = world.waveNo; }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function load(data) {
  let s = data && data.v === 2 ? data : null;
  if (!s) { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; } }
  if (!s) {
    // carry progress over from the first version of the game
    try {
      const raw = localStorage.getItem(OLD_SAVE_KEY);
      if (raw) { const o = JSON.parse(raw); s = { cash: o.cash, lvl: o.lvl, sec: o.sec, grid: o.grid, open: o.open, ulv: o.ulv, notified: o.notified, seenHow: false }; }
    } catch (e) { s = null; }
  }
  S = Object.assign(defaultState(), s || {});
  S.v = 2;
}
function makeWorld() {
  world = new World({ lvl: S.lvl, sec: S.sec, wallHp: S.wallHp, bunkers: S.bunkers, grid: S.grid, ulv: S.ulv, waveNo: S.waveNo, armyLimit: ARMY_BASE + 10 * (S.armyLv || 0) });
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
function isWide() { return window.matchMedia('(min-width: 900px)').matches; }
function fit() {
  const stage = $('#stage');
  SCALE = Math.max(.3, Math.min(stage.clientWidth / W, stage.clientHeight / H));
  const fw = Math.floor(W * SCALE), fh = Math.floor(H * SCALE);
  $('#field').style.width = fw + 'px'; $('#field').style.height = fh + 'px';
  DPR = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.floor(fw * DPR); cv.height = Math.floor(fh * DPR);
  cv.style.width = fw + 'px'; cv.style.height = fh + 'px';
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
  const frozen = paused || !$('#how').hidden;
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
  draw();
  hudT -= dt; gridT -= dt; histT -= dt; saveT -= dt;
  if (hudT <= 0) { updateHud(); hudT = .1; }
  if (gridT <= 0) { updateGridLive(); gridT = .15; }
  if (histT <= 0) { renderHist(); histT = .5; }
  if (saveT <= 0) { save(); saveT = 3; }
  requestAnimationFrame(frame);
}
function draw() {
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
    S.hist.push({ n: w.no, d: dmg, k: R.kills, s: R.sent, l: R.lost, sec: w.sec });
    if (S.hist.length > 40) S.hist.shift();
    let delta = '', cls = '';
    if (prev && prev.sec === w.sec) {
      const dd = dmg - prev.d;
      delta = ` <span class="delta ${dd >= 0 ? 'up' : 'down'}">${dd >= 0 ? '▲' : '▼'} ${fmt(Math.abs(dd))}</span>`;
      cls = dd >= 0 ? 'good' : 'bad';
    }
    let how;
    if (w.captured) how = 'broke through the wall';
    else if (R.alive > 0) how = `${R.alive} still fighting`;
    else how = `wiped out after ${R.secs}s`;
    let msg = `<b>Wave ${w.no}</b> · ${fmt(dmg)} siege damage${delta} · ${how}`;
    if (!w.captured && dmg < 20 && R.alive <= 0) {
      const top = world.sec.field.slice().sort((a, c) => c[1] - a[1])[0];
      if (top) msg += `<br>Nothing got through. ${ENEMIES[top[0]].name}: ${ENEMIES[top[0]].tip}`;
      cls = 'bad';
    }
    feed(msg, cls, 5200);
    histT = 0;
  } else if (n.type === 'breach') {
    const bonus = 150 * (n.lvl + 1) + (n.last ? 400 * (n.lvl + 1) : 0);
    S.cash += bonus;
    showBanner(n.last ? 'Base captured!' : 'Breached!', (n.last ? n.level : n.name) + ' · +$' + fmt(bonus), 2600);
  } else if (n.type === 'section') {
    S.lvl = n.lvl; S.sec = n.sec;
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
  $('#wallName').textContent = world.sec.name;
  $('#wallHp').textContent = fmt(Math.max(0, w.hp)) + ' / ' + fmt(w.maxHp);
  const f = world.formingCount();
  $('#formLbl').textContent = 'Wave ' + (world.waveNo + 1) + ' forming';
  $('#formVal').textContent = f.total ? f.ready + '/' + f.total + ' squads ready' : 'Add squads';
  $('#formFill').style.width = (f.total ? f.ready / f.total * 100 : 0) + '%';
  const army = world.fieldCount();
  $('#armyVal').textContent = army + '/' + world.armyLimit;
  $('#armyBox').classList.toggle('full', world.armyFull);
  $('#armyLbl').textContent = world.armyFull ? 'Army full' : 'Army';
  if (world.armyFull && f.total) $('#formVal').textContent = 'Barracks waiting';
  const last = S.hist.length ? S.hist[S.hist.length - 1] : null;
  const prev = S.hist.length > 1 ? S.hist[S.hist.length - 2] : null;
  $('#lastDmg').textContent = last ? fmt(last.d) : '–';
  const ld = $('#lastDelta');
  if (last && prev && prev.sec === last.sec) { const dd = last.d - prev.d; ld.textContent = (dd >= 0 ? '▲' : '▼') + fmt(Math.abs(dd)); ld.className = 'delta ' + (dd >= 0 ? 'up' : 'down'); }
  else { ld.textContent = ''; }
  const anyReady = world.slotList().some(s => (s.status === 'ready' || s.status === 'walking') && s.units.some(u => u.alive));
  const canUpg = UNIT_ORDER.some(k => unlocked(k) && S.cash >= upgradeCost(k, S.ulv[k] || 1)) || S.cash >= armyCost(S.armyLv || 0);
  $('#squadsBtn').classList.toggle('has', canUpg);
  $('#sendBtn').disabled = !anyReady;
}

// ---------- intel ----------
function intelList() {
  const s = world.sec, list = [];
  if (s.bunkers) list.push({ k: 'bunker', n: world.bunkerHp.filter(h => h > 0).length, of: s.bunkers });
  if (s.towers) list.push({ k: 'esniper', n: s.towers, label: 'Tower snipers', wall: true });
  if (s.wallGuns) list.push({ k: 'gunman', n: s.wallGuns, label: 'Wall gunmen', wall: true });
  for (const [k, n] of s.field) list.push({ k, n, wave: true });
  return list;
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
    const count = it.k === 'bunker' ? it.n + '/' + it.of : '×' + it.n;
    b.innerHTML = `<img alt="" src="${unitIcon(it.k, 'e', 34)}"><span class="n">${count}</span><span class="nm">${name}</span>`;
    b.addEventListener('click', () => { selectedIntel = selectedIntel === i ? null : i; renderIntel(); });
    box.appendChild(b);
  });
  const tip = $('#intelTip');
  if (selectedIntel != null && list[selectedIntel]) {
    const it = list[selectedIntel];
    const extra = it.wave ? ' They come out in every enemy wave.' : it.wall ? ' Replaced each enemy wave.' : '';
    tip.textContent = (it.label || ENEMIES[it.k].name) + ': ' + (it.k === 'gunman' && it.wall ? WALL_GUN_TIP : ENEMIES[it.k].tip) + extra;
  } else {
    const mix = s.field.map(([k, n]) => n + ' ' + ENEMIES[k].name).join(' + ');
    tip.textContent = 'Enemy waves every ' + (s.cycle || 20) + 's: ' + mix + '. Tap an enemy for how to beat it.';
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
    if (pendingBuy && pendingBuy[0] === r && pendingBuy[1] === c) {
      S.cash -= cost; S.open[r][c] = true; pendingBuy = null; save(); renderGrid(); openSheet(r, c); return;
    }
    pendingBuy = [r, c]; renderGrid();
    toast('Tap again to open this square for $' + fmt(cost));
    setTimeout(() => { if (pendingBuy && pendingBuy[0] === r && pendingBuy[1] === c) { pendingBuy = null; renderGrid(); } }, 2600);
    return;
  }
  openSheet(r, c);
}
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
  const rect = cv.getBoundingClientRect();
  const lx = (e.clientX - rect.left) / SCALE, ly = (e.clientY - rect.top) / SCALE;
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
function openSheet(r, c) {
  sheetSlot = r == null ? null : [r, c];
  renderSheet();
  const sh = $('#sheet'); sh.hidden = false;
  requestAnimationFrame(() => sh.classList.add('show'));
}
function closeSheet() { const sh = $('#sheet'); sh.classList.remove('show'); setTimeout(() => { sh.hidden = true; }, 180); sheetSlot = null; }
function renderSheet() {
  const head = $('#sheetHead'), list = $('#sheetList');
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
      save(); updateCash(); renderSheet(); toast('Army limit is now ' + world.armyLimit);
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
        <div class="ustats"><span>${st.n} ${st.n > 1 ? 'troops' : 'troop'}</span><span>HP ${st.hp}</span><span>${d.heal ? 'Heal' : 'DPS'} ${st.dps}</span><span>Range ${st.range}</span><span>Trains in ${st.train}s</span>${d.setup ? `<span>Setup ${d.setup}s</span>` : ''}</div>`
        : `<div class="urole">Locked. ${unlockLabel(k)} to recruit.</div>`}
      </div>
      <div class="uact">
        ${ok && sheetSlot ? `<button type="button" class="place${cur ? ' cur' : ''}" data-k="${k}">${cur ? 'Placed' : 'Place'}</button>` : ''}
        ${ok ? `<button type="button" class="upg" data-k="${k}" ${S.cash < cost ? 'disabled' : ''}>Upgrade<b>$${fmt(cost)}</b></button>` : ''}
      </div>`;
    list.appendChild(row);
  }
  list.querySelectorAll('.place').forEach(b => b.onclick = () => { const [r, c] = sheetSlot; setSlot(r, c, b.dataset.k); closeSheet(); });
  list.querySelectorAll('.upg').forEach(b => b.onclick = () => {
    const k = b.dataset.k, lv = S.ulv[k] || 1, cost = upgradeCost(k, lv);
    if (S.cash < cost) return;
    S.cash -= cost; S.ulv[k] = lv + 1; save(); updateCash(); renderSheet(); renderGrid();
    toast(UNITS[k].name + ' upgraded to Lv ' + (lv + 1) + '. New squads get it.');
  });
}
function openLineup() { const sh = $('#lineupSheet'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('show')); renderHist(); }
function closeLineup() { const sh = $('#lineupSheet'); sh.classList.remove('show'); setTimeout(() => { sh.hidden = true; }, 180); }

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
    bar.title = 'Wave ' + x.n + ': ' + fmt(x.d) + ' damage, lost ' + x.l + '/' + x.s;
    box.appendChild(bar);
  });
  live.forEach(w => {
    const bar = document.createElement('div');
    bar.className = 'bar live';
    bar.style.height = Math.max(3, w.dmg / max * 100) + '%';
    bar.title = 'Wave ' + w.no + ' (fighting): ' + fmt(w.dmg);
    box.appendChild(bar);
  });
  const same = S.hist.filter(x => x.sec === world.sec.name).slice(-3);
  if (same.length) {
    const avg = same.reduce((a, x) => a + x.d, 0) / same.length;
    const best = Math.max(...S.hist.filter(x => x.sec === world.sec.name).map(x => x.d));
    $('#est').innerHTML = avg > 0
      ? `Best here <b>${fmt(best)}</b> · about <b>${Math.max(1, Math.ceil(Math.max(0, world.wall.hp) / avg))}</b> more waves at this pace`
      : 'No damage yet on this wall. Try a different lineup.';
  } else $('#est').textContent = 'Finished waves on this wall will show here.';
}

// ---------- misc ----------
let toastT = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 200); }, 2000);
}
function refreshAll() { updateTop(); renderIntel(); renderGrid(); renderHist(); updateHud(); }

$('#sendBtn').onclick = () => { if (!world.launch(true)) toast('No squads are lined up yet'); };
$('#spdBtn').onclick = () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; save(); updateTop(); };
$('#pauseBtn').onclick = () => { paused = !paused; updateTop(); };
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
  if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else if (!$('#lineupSheet').hidden) closeLineup(); $('#how').hidden = true; $('#menu').hidden = true; }
  if (e.key === ' ' && e.target === document.body) { paused = !paused; updateTop(); e.preventDefault(); }
});
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(() => fit()).observe($('#stage'));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

function start(data) {
  load(data);
  makeWorld();
  fit();
  refreshAll();
  if (!S.seenHow) $('#how').hidden = false;
  requestAnimationFrame(frame);
}
if (window.claude && window.claude.hot) { try { window.claude.hot.snapshot(() => { save(); return S; }); } catch (e) { /* no hot reload */ } }
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start(window.claude && window.claude.hot ? window.claude.hot.data : null);

