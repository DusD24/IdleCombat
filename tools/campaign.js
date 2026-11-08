// Campaign autoplayer: plays the campaign start to finish with a simple greedy player
// (opens squares, picks a sensible lineup, buys upgrades with earned cash) and prints
// how long each section takes. Use it to check pacing after tuning data.js.
// Usage: node tools/campaign.js [seed] [maxLevels]
const fs = require('fs'), vm = require('vm'), path = require('path');
let src = ['data.js', 'world.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
// TUNE='WALL_MULT=12,ENEMY_MULT=1.4' overrides constants for sweeps
for (const kv of (process.env.TUNE || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); src = src.replace(new RegExp('const ' + k + ' = [^;]+;'), 'const ' + k + ' = ' + v + ';'); }
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(src + `
this.G = { World, UNITS, UNIT_ORDER, mulberry32, ARMY_BASE, START_SLOTS, SLOT_COSTS, isUnlocked, upgradeCost, armyCost, getLevel, LEVELS };`, ctx);
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
function desiredLineup() {
  const g = [[null, null, null, null], [null, null, null, null], [null, null, null, null]];
  const front = FRONT_PREF.filter(unlocked), back = BACK_PREF.filter(unlocked);
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
while (S.lvl < maxLevels) {
  w.step(1 / 30);
  if (w.cash) { S.cash += w.cash; w.cash = 0; }
  for (const n of w.notes) {
    if (n.type === 'breach') S.cash += 150 * (n.lvl + 1) + (n.last ? 400 * (n.lvl + 1) : 0);
    if (n.type === 'section') {
      const L = G.getLevel(n.old ? S.lvl : 0);
      out.push({ lvl: S.lvl + 1, sec: S.sec + 1, name: n.old.sec, secs: Math.round(w.t - secStart), units: S.open.size, avgLv: avgLv() });
      if (n.levelDone) { out.push({ levelDone: S.lvl + 1, mins: ((w.t - levelStart) / 60).toFixed(1) }); levelStart = w.t; }
      S.lvl = n.lvl; S.sec = n.sec; secStart = w.t; applyLineup();
    }
  }
  w.notes.length = 0;
  if ((shopT -= 1 / 30) <= 0) { shopT = 3; shop(); }
  if (w.t - secStart > SECTION_CAP) { out.push({ stuck: `L${S.lvl + 1} S${S.sec + 1}`, wallPct: Math.round(100 * w.wall.hp / w.wall.maxHp) }); break; }
}
function avgLv() { const ks = [...new Set(w.slotList().map(s => s.type).filter(Boolean))]; return ks.length ? +(ks.reduce((a, k) => a + (S.ulv[k] || 1), 0) / ks.length).toFixed(1) : 1; }

for (const o of out) {
  if (o.levelDone) console.log(`  == Level ${o.levelDone} done: ${o.mins} min total`);
  else if (o.stuck) console.log(`  !! STUCK at ${o.stuck} (wall ${o.wallPct}%)`);
  else console.log(`L${o.lvl} S${o.sec} ${o.name.padEnd(14)} ${String(o.secs).padStart(4)}s  (${(o.secs / 60).toFixed(1)} min)  squares=${o.units} avgUnitLv=${o.avgLv}`);
}
console.log(`total ${(w.t / 60).toFixed(1)} min`);
