// ================= CORE CONSTANTS =================
const W = 360, H = 600;
const WALL_Y = 104, WALL_T = 20, WALL_FACE = WALL_Y + WALL_T / 2;
const ROWS_Y = [432, 466, 500];
const COLS_X = [50, 137, 223, 310];
const NROWS = 3, NCOLS = 4;
const BASE_Y = 522;            // top of our base (barracks area)
const FRONT_LINE = 350;        // enemy waves never push past this; the deployment area is safe
const ARMY_BASE = 40;
const REPORT_T = 45;           // each wave's damage is reported over its first 45s so waves compare fairly
const ENEMY_CYCLE = 16;        // default seconds between enemy waves
const ENEMY_MULT = 1.25;          // multiplier on enemy wave sizes
const TRAIN_MULT = 1.2;          // multiplier on our training times
const ENEMY_CAP_WAVES = 1.6;   // the enemy keeps at most this many waves' worth of troops on the field
const TRAIN = { rifle: 7, shield: 8, saw: 10, rpg: 10, gren: 10, jugg: 14, sniper: 10, medic: 8, breacher: 10, mortar: 12, humvee: 14 };
const LINES = 2;               // squads each barracks can train at once
const WALL_MULT = 3;           // walls are tougher because waves overlap
function trainTime(k, lv) { return TRAIN[k] * TRAIN_MULT * Math.max(.55, 1 - .04 * ((lv || 1) - 1)); }

// damage type x armor class
const MULT = {
  bullet: { light: 1,   shield: .35, armored: .35, vehicle: .15, fort: .08, structure: .1 },
  melee:  { light: 1,   shield: .3,  armored: .35, vehicle: .1,  fort: .1,  structure: .12 },
  shred:  { light: 1,   shield: 2.2, armored: .6,  vehicle: .25, fort: .08, structure: .1 },
  hmg:    { light: 1,   shield: .7,  armored: .7,  vehicle: .4,  fort: .2,  structure: .15 },
  ap:     { light: 1,   shield: 1,   armored: 1.3, vehicle: .5,  fort: .15, structure: .1 },
  at:     { light: .6,  shield: 1,   armored: 1.6, vehicle: 2.2, fort: 2.0, structure: 1.0 },
  blast:  { light: 1.2, shield: .8,  armored: .7,  vehicle: .6,  fort: 1.1, structure: .8 },
  demo:   { light: .5,  shield: .5,  armored: .5,  vehicle: 1.2, fort: 1.2, structure: 1.0 },
};
// multiplier when the target is behind cover (on the wall)
const COVER = { bullet: .4, melee: .4, shred: .5, hmg: .55, ap: .75, at: .85, blast: 1, demo: 1 };

// ================= PLAYER SQUADS =================
const UNITS = {
  rifle: {
    name: 'Riflemen', weapon: 'M4 carbines', n: 5, hp: 60, armor: 'light', speed: 40, range: 115, dmg: 8, cd: .6,
    dtype: 'bullet', ai: 'std', tier: 1,
    role: 'All-round infantry. Cheap, steady damage.',
    good: 'Gunmen, Rushers (from behind shields)', bad: 'Heavies, Bunkers, Walls'
  },
  shield: {
    name: 'Riot Shields', weapon: 'Ballistic shields', n: 3, hp: 240, armor: 'shield', speed: 36, range: 18, dmg: 10, cd: .8,
    dtype: 'melee', ai: 'std', taunt: 34, tauntAll: false, brace: 140, tier: 1,
    role: 'Front-line wall. Rushers get stuck on them.',
    good: 'Rushers, Gunmen', bad: 'Heavies (miniguns shred shields)'
  },
  saw: {
    name: 'M249 Gunners', weapon: 'M249 SAW', n: 2, hp: 70, armor: 'light', speed: 34, range: 150, dmg: 6, cd: .11,
    dtype: 'bullet', ai: 'std', setup: 2.5, tier: 2,
    role: 'Needs 2.5s to set up the bipod, then shreds.',
    good: 'Rushers, Gunmen, crowds', bad: 'Snipers, armor, getting rushed while setting up'
  },
  rpg: {
    name: 'RPG Team', weapon: 'RPG-7', n: 2, hp: 60, armor: 'light', speed: 36, range: 170, dmg: 80, cd: 3.4,
    dtype: 'at', ai: 'at', splash: 16, proj: 'rocket', tier: 2,
    role: 'Slow rockets that wreck armor and walls.',
    good: 'Bunkers, Technicals, Tanks, Heavies, Walls', bad: 'Rushers, crowds'
  },
  gren: {
    name: 'Grenadiers', weapon: 'M320 40mm', n: 3, hp: 60, armor: 'light', speed: 36, range: 140, dmg: 26, cd: 2.2,
    dtype: 'blast', ai: 'blast', splash: 28, proj: 'arc', tier: 2,
    role: 'Lobbed grenades. Ignore cover, hit groups.',
    good: 'Wall gunmen, Snipers, clumps', bad: 'Fast rushers (grenades miss)'
  },
  jugg: {
    name: 'Juggernaut', weapon: 'Bomb suit + shotgun', n: 1, hp: 1100, armor: 'armored', speed: 30, range: 34, dmg: 30, cd: 1,
    dtype: 'bullet', ai: 'std', taunt: 85, tauntAll: true, size: 1.5, tier: 3,
    role: 'Huge armored tank. Every enemy nearby has to shoot him.',
    good: 'Heavies, Bunkers (soaks fire)', bad: 'RPG gunmen, Tanks'
  },
  sniper: {
    name: 'Sniper', weapon: 'M110 rifle', n: 1, hp: 50, armor: 'light', speed: 32, range: 300, dmg: 100, cd: 2.6,
    dtype: 'ap', ai: 'ap', tier: 3,
    role: 'Outranges everything. Picks off key targets first.',
    good: 'Enemy snipers, RPG gunmen, Heavies', bad: 'Crowds, Walls'
  },
  medic: {
    name: 'Medics', weapon: 'Trauma kits', n: 2, hp: 60, armor: 'light', speed: 38, range: 60, heal: 16, cd: 1,
    ai: 'medic', tier: 3,
    role: 'Patches up the most hurt teammate nearby.',
    good: 'Keeping Shields and Juggernauts alive', bad: 'Can\'t fight'
  },
  breacher: {
    name: 'Breachers', weapon: 'C4 charges', n: 2, hp: 80, armor: 'light', speed: 56, range: 70, dmg: 6, cd: .35,
    dtype: 'bullet', ai: 'std', charge: 450, tier: 4,
    role: 'Sprint to a bunker or the wall and blow it up.',
    good: 'Walls, Bunkers', bad: 'Anything that shoots them on the run'
  },
  mortar: {
    name: 'Mortar Team', weapon: '60mm mortar', n: 1, hp: 90, armor: 'light', speed: 30, range: 360, dmg: 60, cd: 3.2,
    dtype: 'blast', ai: 'blast', splash: 38, proj: 'shell', setup: 3, size: 1.2, tier: 4,
    role: 'Very long range. Sets up, then shells from safety.',
    good: 'Bunkers, Snipers, wall gunmen, Walls', bad: 'Fast movers, getting rushed'
  },
  humvee: {
    name: 'Humvee', weapon: '.50 cal turret', n: 1, hp: 750, armor: 'vehicle', speed: 48, range: 165, dmg: 15, cd: .16,
    dtype: 'hmg', ai: 'std', size: 2, vehicle: true, tier: 4,
    role: 'Fast armored truck with a heavy machine gun.',
    good: 'Gunmen, Rushers, Technicals', bad: 'RPG gunmen, Tanks'
  },
};
const UNIT_ORDER = ['rifle', 'shield', 'saw', 'rpg', 'gren', 'jugg', 'sniper', 'medic', 'breacher', 'mortar', 'humvee'];

// ================= ENEMIES =================
const ENEMIES = {
  gunman: { name: 'Gunmen', hp: 55, armor: 'light', speed: 28, range: 105, dmg: 7, cd: .75, dtype: 'bullet', bounty: 4,
    tip: 'Basic riflemen. Easy for Riflemen and M249s.' },
  rusher: { name: 'Rushers', hp: 110, armor: 'light', speed: 70, range: 14, dmg: 14, cd: .5, dtype: 'melee', melee: true, bounty: 4,
    tip: 'Fast melee swarm. Put Riot Shields in FRONT and guns behind them.' },
  heavy: { name: 'Heavies', hp: 380, armor: 'armored', speed: 24, range: 75, dmg: 8, cd: .13, dtype: 'shred', size: 1.4, bounty: 15,
    tip: 'Armored minigunners. They shred shields. Use a Juggernaut to soak them, then RPGs or a Sniper.' },
  esniper: { name: 'Snipers', hp: 60, armor: 'light', speed: 0, range: 290, dmg: 80, cd: 3.6, dtype: 'ap', ai: 'snipe', bounty: 10,
    tip: 'On towers, picking off your gunners. Answer with your own Sniper, Grenadiers or a Mortar.' },
  technical: { name: 'Technicals', hp: 520, armor: 'vehicle', speed: 46, range: 150, dmg: 12, cd: .18, dtype: 'hmg', size: 2, vehicle: true, bounty: 20,
    tip: 'Pickup trucks with a .50 cal. Bullets bounce off. Bring RPGs.' },
  tank: { name: 'Tanks', hp: 2000, armor: 'vehicle', speed: 15, range: 190, dmg: 80, cd: 3.8, dtype: 'blast', splash: 30, proj: 'cannon', size: 2.7, vehicle: true, bounty: 60,
    tip: 'Massive armor and a big cannon. Lots of RPGs, C4, or a Juggernaut to distract it.' },
  erpg: { name: 'RPG Gunmen', hp: 55, armor: 'light', speed: 30, range: 165, dmg: 85, cd: 4.2, dtype: 'at', splash: 14, proj: 'rocket', ai: 'at', bounty: 6,
    tip: 'Hunt your vehicles and Juggernauts. A Sniper or Riflemen take them out fast.' },
  bunker: { name: 'MG Bunkers', hp: 1100, armor: 'fort', speed: 0, range: 160, dmg: 7, cd: .12, dtype: 'bullet', structure: true, size: 2.4, bounty: 80,
    tip: 'Concrete machine-gun nests that stay broken between waves. RPGs, Mortars or C4.' },
};
// wall gunmen are gunmen standing on the wall with cover + extra range
const WALL_GUN_TIP = 'Behind cover on the wall: bullets do much less. Grenades and mortars ignore cover.';

// ================= CAMPAIGN =================
// field: list of [enemyKey, count]; wallGuns: count; towers: sniper count; bunkers: count
const LEVELS = [
  { name: 'Dusty Outpost', theme: 'sand', scale: 1, sections: [
    { name: 'Sandbag Line', wall: 'sandbag', hp: 800, wallGuns: 3, field: [['gunman', 4]], reinf: [14, [['gunman', 2]]] },
    { name: 'Rusher Gate', wall: 'sandbag', hp: 1100, wallGuns: 3, field: [['rusher', 14]], reinf: [11, [['rusher', 4]]] },
    { name: 'Command Tent', wall: 'hq', hp: 1500, wallGuns: 4, field: [['rusher', 6], ['gunman', 4]], reinf: [12, [['rusher', 2], ['gunman', 1]]] },
  ]},
  { name: 'Checkpoint Bravo', theme: 'village', scale: 1.15, sections: [
    { name: 'Bunker Row', wall: 'concrete', hp: 2600, bunkers: 2, wallGuns: 4, field: [['gunman', 4]], reinf: [14, [['gunman', 2]]] },
    { name: 'Heavy Gate', wall: 'concrete', hp: 3000, wallGuns: 3, field: [['heavy', 3], ['rusher', 6]], reinf: [15, [['rusher', 3]]] },
    { name: 'Motor Pool', wall: 'concrete', hp: 3400, bunkers: 1, wallGuns: 3, field: [['technical', 2], ['gunman', 4]], reinf: [16, [['technical', 1]]] },
    { name: 'Checkpoint HQ', wall: 'hq', hp: 4200, bunkers: 2, wallGuns: 4, field: [['heavy', 2], ['rusher', 6], ['gunman', 3]], reinf: [14, [['rusher', 3]]] },
  ]},
  { name: 'Ridge Fort', theme: 'mountain', scale: 1.35, sections: [
    { name: 'Sniper Ridge', wall: 'stone', hp: 4500, towers: 3, wallGuns: 5, field: [['gunman', 4]], reinf: [14, [['gunman', 2]]] },
    { name: 'Switchback', wall: 'stone', hp: 5000, wallGuns: 3, field: [['technical', 2], ['rusher', 8], ['gunman', 3]], reinf: [14, [['technical', 1]]] },
    { name: 'Iron Gate', wall: 'stone', hp: 5600, bunkers: 2, towers: 2, wallGuns: 3, field: [['heavy', 3]], reinf: [15, [['heavy', 1]]] },
    { name: 'Fort HQ', wall: 'hq', hp: 7000, bunkers: 1, towers: 2, wallGuns: 4, field: [['heavy', 2], ['technical', 1], ['rusher', 6]], reinf: [14, [['rusher', 3]]] },
  ]},
  { name: 'Harbor Base', theme: 'harbor', scale: 1.6, sections: [
    { name: 'Dockside', wall: 'steel', hp: 7000, bunkers: 1, wallGuns: 4, field: [['erpg', 4], ['gunman', 6]], reinf: [14, [['erpg', 1], ['gunman', 2]]] },
    { name: 'Tank Yard', wall: 'steel', hp: 7600, wallGuns: 4, field: [['tank', 1], ['technical', 2], ['gunman', 4]], reinf: [16, [['technical', 1]]] },
    { name: 'Crane Line', wall: 'steel', hp: 8200, bunkers: 2, towers: 3, wallGuns: 2, field: [['heavy', 3], ['rusher', 8]], reinf: [14, [['rusher', 4]]] },
    { name: 'Harbor HQ', wall: 'hq', hp: 10000, bunkers: 2, wallGuns: 5, field: [['tank', 1], ['heavy', 3], ['erpg', 3]], reinf: [15, [['erpg', 2]]] },
  ]},
  { name: 'Iron Citadel', theme: 'citadel', scale: 1.9, sections: [
    { name: 'Outer Ring', wall: 'steel', hp: 10000, bunkers: 3, towers: 2, wallGuns: 4, field: [['gunman', 6]], reinf: [13, [['gunman', 3]]] },
    { name: 'Kill Zone', wall: 'steel', hp: 11000, wallGuns: 4, field: [['rusher', 14], ['heavy', 4]], reinf: [12, [['rusher', 4]]] },
    { name: 'Armor Gate', wall: 'steel', hp: 12000, wallGuns: 3, field: [['tank', 1], ['erpg', 3], ['technical', 2]], cycle: 20 },
    { name: 'Citadel Keep', wall: 'steel', hp: 13000, bunkers: 2, towers: 3, wallGuns: 3, field: [['heavy', 4], ['rusher', 8], ['erpg', 2]], reinf: [14, [['rusher', 4]]] },
    { name: 'Citadel HQ', wall: 'hq', hp: 15000, bunkers: 2, towers: 2, wallGuns: 4, field: [['tank', 1], ['heavy', 3], ['technical', 2], ['rusher', 8]], reinf: [14, [['rusher', 3], ['erpg', 1]]] },
  ]},
];
const THEMES = ['sand', 'village', 'mountain', 'harbor', 'citadel'];
const OP_NAMES = ['Viper', 'Granite', 'Thunder', 'Nomad', 'Atlas', 'Raven', 'Cobalt', 'Saber', 'Frostbite', 'Longbow', 'Tempest', 'Anvil'];

// pool used to build endless operations after the campaign
const SECTION_POOL = [];
LEVELS.forEach(L => L.sections.forEach(s => { if (s.wall !== 'hq') SECTION_POOL.push(s); }));
const HQ_POOL = LEVELS.map(L => L.sections[L.sections.length - 1]);

function getLevel(idx) {
  if (idx < LEVELS.length) return LEVELS[idx];
  // endless: deterministic per index
  const r = mulberry32(idx * 7919 + 17);
  const n = idx - LEVELS.length;
  const secs = [];
  const count = 4;
  const used = new Set();
  while (secs.length < count - 1) {
    const i = Math.floor(r() * SECTION_POOL.length);
    if (used.has(i)) continue; used.add(i);
    secs.push(Object.assign({}, SECTION_POOL[i], { hp: 9000 + n * 1200 + secs.length * 600 }));
  }
  const hq = HQ_POOL[Math.floor(r() * HQ_POOL.length)];
  secs.push(Object.assign({}, hq, { name: 'Op HQ', hp: 13000 + n * 1600 }));
  return { name: 'Operation ' + OP_NAMES[n % OP_NAMES.length] + (n >= OP_NAMES.length ? ' ' + (Math.floor(n / OP_NAMES.length) + 1) : ''),
    theme: THEMES[Math.floor(r() * THEMES.length)], scale: 1.9 + .25 * (n + 1), sections: secs, endless: true };
}
function sectionMaxHp(levelIdx, secIdx) {
  const L = getLevel(levelIdx);
  return Math.round(L.sections[secIdx].hp * WALL_MULT);
}

// unit unlocks: [unitKey, levelIdx, sectionsClearedInThatLevel] -> unlocked once progress passes it
const UNLOCKS = [
  ['rifle', 0, 0], ['shield', 0, 0],
  ['saw', 0, 1],
  ['rpg', 1, 0], ['gren', 1, 0],
  ['jugg', 1, 1],
  ['sniper', 2, 0], ['medic', 2, 0],
  ['breacher', 2, 2],
  ['mortar', 3, 0], ['humvee', 3, 0],
];
function isUnlocked(key, levelIdx, secIdx) {
  const u = UNLOCKS.find(x => x[0] === key);
  if (!u) return false;
  return levelIdx > u[1] || (levelIdx === u[1] && secIdx >= u[2]);
}
function unlockLabel(key) {
  const u = UNLOCKS.find(x => x[0] === key);
  if (!u) return '';
  return u[2] === 0 ? 'Reach Level ' + (u[1] + 1) : 'Breach section ' + u[2] + ' of Level ' + (u[1] + 1);
}

const SLOT_COSTS = [120, 220, 360, 540, 780, 1100, 1500, 2100];
const START_SLOTS = [[0, 1], [0, 2], [1, 1], [1, 2]];
const TIER_COST = { 1: 50, 2: 80, 3: 110, 4: 140 };
function upgradeCost(key, lv) { return Math.round(TIER_COST[UNITS[key].tier] * Math.pow(1.5, lv - 1)); }
function armyCost(n) { return Math.round(300 * Math.pow(1.6, n)); }
function lvMult(lv) { return 1 + .2 * (lv - 1); }

// ================= UTIL =================
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PAT = {
  1: [[0, 0]],
  2: [[-13, 0], [13, 0]],
  3: [[-20, 0], [0, -5], [20, 0]],
  5: [[-30, 2], [-15, -6], [0, 2], [15, -6], [30, 2]],
};
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }


