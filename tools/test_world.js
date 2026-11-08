// Simulation regression tests (no browser needed): node tools/test_world.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = ['data.js', 'world.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.G = { World, mulberry32, ARMY_BASE, NROWS, NCOLS, UNITS };', ctx);
const G = ctx.G;
const full = k => Array.from({ length: G.NROWS }, () => Array(G.NCOLS).fill(k));
const mk = (grid, o) => new G.World(Object.assign({ lvl: 0, sec: 0, grid, ulv: {}, rng: G.mulberry32(7), armyLimit: G.ARMY_BASE }, o || {}));
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };

test('army limit is a hard cap on troops in the field (BUG-02)', () => {
  const w = mk(full('rifle'), { ulv: { rifle: 10 } });   // 12 squads x 5 riflemen = 60 > 40
  let max = 0;
  for (let i = 0; i < 30 * 240; i++) { w.step(1 / 30); w.notes.length = 0; max = Math.max(max, w.fieldCount()); }
  assert(max <= w.armyLimit, `field reached ${max}/${w.armyLimit}`);
  assert(w.waveNo > 0, 'no wave launched');
});

test('only the wave that lands the final gate hit gets the breach (BUG-04)', () => {
  const w = mk(full('rifle'));
  const a = { no: 1, t0: 0, dmg: 0, gateDmg: 0, alive: 1, sent: 1, lost: 0, kills: 0 }, b = { no: 2, t0: 0, dmg: 0, gateDmg: 0, alive: 1, sent: 1, lost: 0, kills: 0 };
  w.waves.push(a, b);
  w.applyDamage(w.wall, w.wall.hp + 5000, 'demo', { team: 'p', wave: b, x: 0, y: 0 });
  assert.strictEqual(w.wall.hp, 0);
  assert(b.dmg <= w.wall.maxHp + 1, 'overkill credited');
  for (let i = 0; i < 30 * 3; i++) w.step(1 / 30);
  const done = w.notes.filter(n => n.type === 'waveDone').map(n => n.wave);
  const A = done.find(x => x.no === 1), B = done.find(x => x.no === 2);
  assert(B && B.captured && !B.carried, 'breaching wave not credited');
  assert(A && !A.captured && A.carried, 'other wave wrongly credited');
});

test('gate damage is tracked apart from other building damage (BUG-05)', () => {
  const w = mk(full('rifle'));
  const wave = { no: 1, dmg: 0, gateDmg: 0 };
  const bk = w.units.find(u => u.def.barracks);
  w.applyDamage(bk, 100, 'at', { team: 'p', wave });
  assert(wave.dmg > 0 && wave.gateDmg === 0);
  w.applyDamage(w.wall, 100, 'at', { team: 'p', wave });
  assert(wave.gateDmg > 0 && wave.dmg > wave.gateDmg);
});

test('no damage or cash credit for overkill on buildings (CHECK-03)', () => {
  const w = mk(full('rifle'));
  const bk = w.units.find(u => u.def.barracks); bk.hp = 10;
  const wave = { no: 1, dmg: 0, gateDmg: 0 };
  const cash0 = w.cash;
  w.applyDamage(bk, 5000, 'demo', { team: 'p', wave });
  assert(wave.dmg <= 10.001, 'overkill counted: ' + wave.dmg);
  assert(w.cash - cash0 < 10 * .1 + 200, 'overkill paid');
});

test('losing one of two same-type barracks says so (CHECK-01)', () => {
  const w = mk(full('rifle'));   // Sandbag Line: two gunman barracks
  const [b1] = w.units.filter(u => u.def.barracks);
  w.applyDamage(b1, 1e6, 'demo', { team: 'p', wave: { dmg: 0, gateDmg: 0 } });
  const n = w.notes.find(x => x.type === 'barracksDown');
  assert(n && n.left === 1 && n.sameLeft === 1);
});

test('lines are identified by position, not name (CHECK-02)', () => {
  const w = mk(full('rifle'), { lvl: 5, sec: 0 });
  assert.strictEqual(w.lineId, '5:0');
});

test('nextLine points past the current line (BUG-10 save support)', () => {
  const w = mk(full('rifle'), { lvl: 0, sec: 2 });
  const n = w.nextLine();
  assert.deepStrictEqual([n.lvl, n.sec], [1, 0]);
});

console.log(`\n${pass} passed`);
