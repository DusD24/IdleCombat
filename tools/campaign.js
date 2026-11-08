// Campaign autoplayer: plays the campaign start to finish with a simple greedy player
// (opens squares, picks a sensible lineup, buys upgrades with earned cash) and prints
// how long each section takes. Use it to check pacing after tuning data.js.
// Usage: node tools/campaign.js [seed] [maxLevels]
const fs = require('fs'), vm = require('vm'), path = require('path');
let src = ['data.js', 'world.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
// TUNE='GATE_MULT=2,ENEMY_MULT=1.4' overrides constants for sweeps
for (const kv of (process.env.TUNE || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); src = src.replace(new RegExp('const ' + k + ' = [^;]+;'), 'const ' + k + ' = ' + v + ';'); }
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(src + `
this.G = { World, ENEMIES, UNITS, UNIT_ORDER, mulberry32, ARMY_BASE, START_SLOTS, SLOT_COSTS, isUnlocked, upgradeCost, armyCost, getLevel, LEVELS };`, ctx);
const G = ctx.G;

const seed = +(process.argv[2] || 1), maxLevels = +(process.argv[3] || G.LEVELS.length);
const SECTION_CAP = 20 * 60; // treat >20 min as stuck
// squares open in this order: front row first, then mid, then back
const OPEN_ORDER = [[0, 1], [0, 2], [1, 1], [1, 2], [0, 0], [0, 3], [1, 0], [1, 3], [2, 1], [2, 2], [2, 0], [2, 3]];
const FRONT_PREF = ['jugg', 'shield', 'rifle'];
const BACK_PREF = ['rpg', 'saw', 'gren', 'sniper', 'mortar', 'medic', 'rifle', 'breacher', 'humvee'];

const S = { cash: 0, lvl: 0, sec: 0, ulv: {}, armyLv: 0, open: new Set(G.START_SLOTS.map(([r, c]) => r + ',' + c)) };
const grid = [[null, 'rifle', 'rifle', null], [null, 'rifle', 'rifle', null], [null, null, null, null]];
const w = new G.World({ lvl: 0, sec: 0, grid, ulv: S.ulv, rng: G.mulberry32(seed), armyLimit: G.ARMY_BASE });

function unlocked(k) { return G.isUnlocked(k, S.lvl, S.sec); }
// like a player reading the intel: armor and vehicles call for rockets, cover calls for grenades
function backPref() {
  const sec = w.sec, keys = sec.field.map(f => f[0]);
  const armor = keys.some(k => G.ENEMIES[k].vehicle || G.ENEMIES[k].armor === 'armored') || sec.bunkers;
  const cover = (sec.towers || 0) + (sec.wallGuns || 0) >= 5;
  if (armor) return ['rpg', 'rpg', 'mortar', 'saw', 'sniper', 'rpg', 'gren', 'medic', 'rifle'];
  if (cover) return ['gren', 'saw', 'rpg', 'mortar', 'gren', 'sniper', 'medic', 'rifle'];
  return BACK_PREF;
}
function desiredLineup() {
  const g = [[null, null, null, null], [null, null, null, null], [null, null, null, null]];
  const front = FRONT_PREF.filter(unlocked), back = backPref().filter(unlocked);
  let fi = 0, bi = 0;
  for (const [r, c] of OPEN_ORDER) {
    if (!S.open.has(r + ',' + c)) continue;
    if (r === 0) { g[r][c] = front[Math.min(fi, front.length - 1)]; if (front[fi] === 'jugg') fi++; }
    else { g[r][c] = back[bi % back.length]; bi++; }
  }
  return g;
}
function applyLineup() {
  const g = desiredLineup();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (w.slots[r][c].type !== g[r][c]) w.setSlot(r, c, g[r][c]);
}
function shop() {
  let bought = true;
  while (bought) {
    bought = false;
    const idx = S.open.size - G.START_SLOTS.length;
    const slotCost = idx < G.SLOT_COSTS.length ? G.SLOT_COSTS[idx] : Infinity;
    const used = [...new Set(w.slotList().map(s => s.type).filter(Boolean))];
    const cheapest = used.map(k => [k, G.upgradeCost(k, S.ulv[k] || 1)]).sort((a, b) => a[1] - b[1])[0];
    const army = G.armyCost(S.armyLv);
    if (slotCost <= S.cash && slotCost <= (cheapest ? cheapest[1] * 2 : Infinity)) {
      S.cash -= slotCost; S.open.add(OPEN_ORDER.find(([r, c]) => !S.open.has(r + ',' + c)).join(',')); applyLineup(); bought = true;
    } else if (w.armyFull && army <= S.cash) {
      S.cash -= army; S.armyLv++; w.armyLimit = G.ARMY_BASE + 10 * S.armyLv; bought = true;
    } else if (cheapest && cheapest[1] <= S.cash) {
      S.cash -= cheapest[1]; S.ulv[cheapest[0]] = (S.ulv[cheapest[0]] || 1) + 1; bought = true;
    }
  }
}

applyLineup();
let secStart = 0, shopT = 0, out = [], levelStart = 0;
// rhythm stats per section: how long each side's waves live, building damage per wave, barracks kill times
let M = freshStats();
function freshStats() { return { pw: [], pwLive: new Set(), ew: {}, ewLife: [], dmg: [], bkDown: [] }; }
function trackStep() {
  for (const wv of M.pwLive) if (wv.alive <= 0) { M.pw.push(w.t - wv.t0); M.dmg.push(wv.dmg); M.pwLive.delete(wv); }
  const alive = {};
  for (const u of w.units) if (u.alive && u.team === 'e' && u.ewave) alive[u.ewave] = (alive[u.ewave] || 0) + 1;
  for (const id in alive) if (!M.ew[id]) M.ew[id] = w.t;
  for (const id in M.ew) if (M.ew[id] > 0 && !alive[id]) { M.ewLife.push(w.t - M.ew[id]); M.ew[id] = -1; }
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
while (S.lvl < maxLevels) {
  w.step(1 / 30);
  if (w.cash) { S.cash += w.cash; w.cash = 0; }
  trackStep();
  for (const n of w.notes) {
    if (n.type === 'launch') M.pwLive.add(n.wave);
    if (n.type === 'barracksDown') M.bkDown.push(Math.round(w.t - secStart));
    if (n.type === 'breach') S.cash += 150 * (n.lvl + 1) + (n.last ? 400 * (n.lvl + 1) : 0);
    if (n.type === 'section') {
      const L = G.getLevel(n.old ? S.lvl : 0);
      out.push({ lvl: S.lvl + 1, sec: S.sec + 1, name: n.old.sec, secs: Math.round(w.t - secStart), units: S.open.size, avgLv: avgLv(),
        stats: `waves ${M.pw.length + M.pwLive.size} wiped ${Math.round(100 * M.pw.length / Math.max(1, M.pw.length + M.pwLive.size))}% after ${avg(M.pw).toFixed(0)}s | enemy waves last ${avg(M.ewLife).toFixed(0)}s | barracks down ${JSON.stringify(M.bkDown)}` });
      M = freshStats();
      if (n.levelDone) { out.push({ levelDone: S.lvl + 1, mins: ((w.t - levelStart) / 60).toFixed(1) }); levelStart = w.t; }
      S.lvl = n.lvl; S.sec = n.sec; secStart = w.t; applyLineup();
    }
  }
  w.notes.length = 0;
  if ((shopT -= 1 / 30) <= 0) { shopT = 3; shop(); }
  if (w.t - secStart > SECTION_CAP) { out.push({ stuck: `L${S.lvl + 1} S${S.sec + 1}`, wallPct: Math.round(100 * w.wall.hp / w.wall.maxHp), stats: `ourWaves=${M.pw.length} live ${avg(M.pw).toFixed(0)}s dmg/wave ${avg(M.dmg).toFixed(0)} | enemy live ${avg(M.ewLife).toFixed(0)}s | barracks ${JSON.stringify(w.barracksHp.map(Math.round))} bkDown ${JSON.stringify(M.bkDown)}` }); break; }
}
function avgLv() { const ks = [...new Set(w.slotList().map(s => s.type).filter(Boolean))]; return ks.length ? +(ks.reduce((a, k) => a + (S.ulv[k] || 1), 0) / ks.length).toFixed(1) : 1; }

for (const o of out) {
  if (o.levelDone) console.log(`  == Level ${o.levelDone} done: ${o.mins} min total`);
  else if (o.stuck) console.log(`  !! STUCK at ${o.stuck} (gate ${o.wallPct}%)  ${o.stats}`);
  else console.log(`L${o.lvl} S${o.sec} ${o.name.padEnd(14)} ${String(o.secs).padStart(4)}s  (${(o.secs / 60).toFixed(1)} min)  sq=${o.units} lv=${o.avgLv}  ${o.stats}`);
}
console.log(`total ${(w.t / 60).toFixed(1)} min`);
