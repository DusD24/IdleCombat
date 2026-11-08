// Headless pacing probe: runs one section of Breach Squad and prints launch cadence,
// wall-damage timeline and time to breach.
// Usage: node tools/pace.js [lvl] [sec] [lineupPreset] [unitLevel]
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'world.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.World = World; this.UNIT_ORDER = UNIT_ORDER; this.mulberry32 = mulberry32; this.ARMY_BASE = ARMY_BASE;', ctx);

const [lvl = 0, sec = 0, preset = 'start', ulvArg = 1] = process.argv.slice(2);
const PRESETS = {
  start: [[null, 'rifle', 'rifle', null], [null, 'rifle', 'rifle', null], [null, null, null, null]],
  mid: [['shield', 'shield', 'shield', 'shield'], ['rifle', 'saw', 'rpg', 'rifle'], ['gren', 'rpg', 'gren', null]],
  late: [['jugg', 'shield', 'shield', 'jugg'], ['saw', 'rpg', 'rpg', 'sniper'], ['mortar', 'gren', 'medic', 'breacher']],
};
const ulv = {}; for (const k of ctx.UNIT_ORDER) ulv[k] = +ulvArg;
const w = new ctx.World({ lvl: +lvl, sec: +sec, grid: PRESETS[preset], ulv, rng: ctx.mulberry32(42), armyLimit: ctx.ARMY_BASE });
const launches = [], dmgMarks = [];
let enemyWaves = 0, firstContact = null, lastPrint = 0;
const hp0 = w.wall.hp;
const T_MAX = 1200;
while (w.t < T_MAX) {
  const ew = w.enemyWaveNo;
  w.step(1 / 30);
  if (w.enemyWaveNo > ew) enemyWaves++;
  for (const n of w.notes) {
    if (n.type === 'launch') launches.push(+w.t.toFixed(1));
    if (n.type === 'breach') { report(true); process.exit(0); }
  }
  w.notes.length = 0;
  if (firstContact == null && w.wall.hp < hp0) firstContact = +w.t.toFixed(1);
  if (w.t - lastPrint >= 30) { lastPrint = w.t; dmgMarks.push([Math.round(w.t), Math.round(100 * w.wall.hp / hp0)]); }
}
report(false);

function report(breached) {
  const gaps = launches.slice(1).map((t, i) => +(t - launches[i]).toFixed(1));
  const avg = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : '-';
  console.log(`L${+lvl + 1} S${+sec + 1} (${w.sec.name}) lineup=${preset} unitLv=${ulvArg} wallHp=${hp0}`);
  console.log(`  ${breached ? 'BREACHED' : 'NOT breached'} at ${w.t.toFixed(0)}s; first wall damage ${firstContact}s`);
  console.log(`  our launches: ${launches.length}, first at ${launches[0]}s, avg gap ${avg}s, gaps ${JSON.stringify(gaps.slice(0, 12))}`);
  console.log(`  enemy waves: ${enemyWaves} (every ${w.cycle}s)`);
  console.log(`  wall % over time: ${dmgMarks.map(([t, p]) => t + 's:' + p + '%').join(' ')}`);
}
