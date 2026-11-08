// ================= RENDERING =================
const PAL = {
  pUni: '#7a8750', pUniD: '#4f5a30', pHelm: '#5b6838', pRing: '#4b9bff',
  eUni: '#6e5543', eUniD: '#47362a', eWrap: '#c4463a', eRing: '#ff5a4e',
  gun: '#23251f', metal: '#3a3d36', shield: '#b7cde0', hazard: '#f2b632',
};
const THEME_COL = {
  sand:     { g: '#d9c28f', g2: '#cbb07a', road: '#c7a76e', base: '#b39466', speck: '#bfa572', tuft: '#9c9a5a' },
  village:  { g: '#bdb97f', g2: '#aaa86b', road: '#c9ae80', base: '#9c8f66', speck: '#a7a36c', tuft: '#7e8a45' },
  mountain: { g: '#a7ad92', g2: '#959c80', road: '#b4ab8f', base: '#7f8070', speck: '#8d927c', tuft: '#6d7a52' },
  harbor:   { g: '#aeb1ad', g2: '#9ea29d', road: '#c2c0b3', base: '#7d8584', speck: '#959893', tuft: '#7e8a6a' },
  citadel:  { g: '#8e877a', g2: '#7e776b', road: '#a39a88', base: '#5f5a52', speck: '#857e71', tuft: '#6a6b4e' },
};
const WALL_COL = {
  sandbag:  { top: '#cdb683', face: '#b49b67', line: '#8c764b', hole: '#6f5f43' },
  concrete: { top: '#c3c3bb', face: '#a3a39b', line: '#77776f', hole: '#55554f' },
  stone:    { top: '#a59c8c', face: '#8c8373', line: '#625b4e', hole: '#4b463c' },
  steel:    { top: '#7b8389', face: '#5f676d', line: '#3b4247', hole: '#2a2f33' },
  hq:       { top: '#c3c3bb', face: '#a3a39b', line: '#77776f', hole: '#55554f' },
};

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function circ(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }

// ---------- background (cached per section) ----------
function buildBackground(theme, secDef, scale) {
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext('2d'); ctx.scale(scale, scale);
  const T = THEME_COL[theme] || THEME_COL.sand;
  const rnd = mulberry32(theme.length * 131 + secDef.name.length * 17 + (secDef.hp | 0));
  ctx.fillStyle = T.g; ctx.fillRect(0, 0, W, H);
  // big soft patches
  for (let i = 0; i < 18; i++) { ctx.globalAlpha = .35; ell(ctx, rnd() * W, 130 + rnd() * (H - 130), 30 + rnd() * 60, 14 + rnd() * 26, T.g2); }
  ctx.globalAlpha = 1;
  if (theme === 'harbor') { // water + dock edge on the right
    ctx.fillStyle = '#5f8fa3'; ctx.fillRect(W - 26, 0, 26, H);
    ctx.fillStyle = '#4e7b8f'; for (let y = 6; y < H; y += 14) ctx.fillRect(W - 22 + (y % 28 ? 4 : 0), y, 10, 2);
    ctx.fillStyle = '#6d726f'; ctx.fillRect(W - 30, 0, 5, H);
  }
  // road from base to the gate
  ctx.fillStyle = T.road;
  ctx.beginPath(); ctx.moveTo(W / 2 - 34, H); ctx.bezierCurveTo(W / 2 - 60, 400, W / 2 + 10, 260, W / 2 - 20, WALL_FACE);
  ctx.lineTo(W / 2 + 20, WALL_FACE); ctx.bezierCurveTo(W / 2 + 50, 260, W / 2 - 10, 400, W / 2 + 34, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.setLineDash([4, 7]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 14, H); ctx.bezierCurveTo(W / 2 - 40, 400, W / 2 + 28, 260, W / 2 - 6, WALL_FACE + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 14, H); ctx.bezierCurveTo(W / 2 - 10, 400, W / 2 + 48, 260, W / 2 + 8, WALL_FACE + 4); ctx.stroke();
  ctx.setLineDash([]);
  // specks + tufts + rocks
  for (let i = 0; i < 260; i++) { ctx.fillStyle = T.speck; ctx.globalAlpha = .5; ctx.fillRect(rnd() * W, WALL_FACE + rnd() * (H - WALL_FACE), 1.4, 1.4); }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 34; i++) {
    const x = rnd() * W, y = WALL_FACE + 30 + rnd() * (H - WALL_FACE - 40);
    if (Math.abs(x - W / 2) < 40) continue;
    ctx.strokeStyle = T.tuft; ctx.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * 2, y - 4 - rnd() * 3); ctx.stroke(); }
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * W, y = WALL_FACE + 40 + rnd() * (H - WALL_FACE - 80);
    if (Math.abs(x - W / 2) < 50) continue;
    const s = 3 + rnd() * 6;
    ell(ctx, x + 1.5, y + 2, s, s * .55, 'rgba(0,0,0,.12)');
    ell(ctx, x, y, s, s * .6, '#8f8a7a'); ell(ctx, x - s * .25, y - s * .2, s * .5, s * .3, '#a8a392');
  }
  // craters on the approach
  for (let i = 0; i < 6; i++) {
    const x = 30 + rnd() * (W - 60), y = 180 + rnd() * 230;
    ell(ctx, x, y, 11, 6, 'rgba(70,55,35,.22)'); ell(ctx, x, y - 1, 8, 4, 'rgba(60,45,30,.25)');
  }
  // enemy compound behind the wall
  ctx.fillStyle = T.base; ctx.fillRect(0, 0, W, WALL_Y);
  for (let i = 0; i < 80; i++) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(rnd() * W, rnd() * WALL_Y, 2, 2); }
  const isHQ = secDef.wall === 'hq';
  // tents / huts / crates
  const props = isHQ ? 3 : 5;
  for (let i = 0; i < props; i++) {
    const x = 20 + rnd() * (W - 40), y = 14 + rnd() * 52;
    if (isHQ && Math.abs(x - W / 2) < 80) continue;
    if (rnd() < .5) { // tent
      ctx.fillStyle = theme === 'citadel' ? '#4e4a42' : '#7c7a4e';
      ctx.beginPath(); ctx.moveTo(x - 16, y + 10); ctx.lineTo(x, y - 6); ctx.lineTo(x + 16, y + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 16, y + 10); ctx.lineTo(x, y + 10); ctx.closePath(); ctx.fill();
    } else { // crates
      ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x - 6, y - 6, 12, 12); ctx.strokeStyle = '#5d4627'; ctx.lineWidth = 1; ctx.strokeRect(x - 6, y - 6, 12, 12);
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.stroke();
    }
  }
  if (isHQ) {
    // command building
    const bx = W / 2 - 54, by = 14, bw = 108, bh = 60;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(bx + 5, by + 6, bw, bh);
    ctx.fillStyle = theme === 'sand' ? '#8b7a52' : '#7e8078'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = theme === 'sand' ? '#a38f60' : '#94968d'; ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(bx + 4, by + bh / 2 - 1, bw - 8, 2);
    // antenna + red flag
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx + bw - 14, by + 10); ctx.lineTo(bx + bw - 14, by - 10); ctx.stroke();
    ctx.fillStyle = PAL.eRing; ctx.beginPath(); ctx.moveTo(bx + bw - 14, by - 10); ctx.lineTo(bx + bw + 2, by - 6); ctx.lineTo(bx + bw - 14, by - 2); ctx.fill();
    // satellite dish
    circ(ctx, bx + 18, by + 16, 7, '#c9c9c0', '#777', 1);
    ctx.font = '700 9px "Saira Condensed", sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.textAlign = 'center';
    ctx.fillText('HQ', W / 2, by + bh / 2 + 16);
  } else {
    // flag pole
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 + 70, 40); ctx.lineTo(W / 2 + 70, 12); ctx.stroke();
    ctx.fillStyle = PAL.eRing; ctx.beginPath(); ctx.moveTo(W / 2 + 70, 12); ctx.lineTo(W / 2 + 86, 16); ctx.lineTo(W / 2 + 70, 20); ctx.fill();
  }
  // our side: deployment area + base
  ctx.fillStyle = 'rgba(40,50,25,.10)'; ctx.fillRect(0, ROWS_Y[0] - 24, W, BASE_Y - ROWS_Y[0] + 24);
  ctx.fillStyle = theme === 'citadel' || theme === 'harbor' ? '#7b7a6c' : '#a8956a'; ctx.fillRect(0, BASE_Y, W, H - BASE_Y);
  for (let i = 0; i < 120; i++) { ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(rnd() * W, BASE_Y + rnd() * (H - BASE_Y), 2, 2); }
  // sandbag berm along the base edge (gap in the middle for the road)
  for (let x = 4; x < W; x += 11) {
    if (Math.abs(x - W / 2) < 26) continue;
    rr(ctx, x - 5, BASE_Y - 4, 10, 6, 3); ctx.fillStyle = '#c2aa75'; ctx.fill(); ctx.strokeStyle = '#8c764b'; ctx.lineWidth = .6; ctx.stroke();
  }
  // our flag
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 + 34, H - 4); ctx.lineTo(W / 2 + 34, H - 26); ctx.stroke();
  ctx.fillStyle = PAL.pRing; ctx.beginPath(); ctx.moveTo(W / 2 + 34, H - 26); ctx.lineTo(W / 2 + 50, H - 22); ctx.lineTo(W / 2 + 34, H - 18); ctx.fill();
  return c;
}

// ---------- wall ----------
function drawWallBack(ctx, sec, wall, t, broken) {
  const C = WALL_COL[sec.wall] || WALL_COL.concrete;
  const y0 = WALL_Y - WALL_T / 2;
  const lost = 1 - Math.max(0, wall.hp) / wall.maxHp;
  if (broken) {
    // rubble line
    const rnd = mulberry32(99);
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = y0 + rnd() * WALL_T + 4; ell(ctx, x, y, 3 + rnd() * 5, 2 + rnd() * 3, rnd() < .5 ? C.face : C.line); }
    return;
  }
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, y0 + WALL_T, W, 6);
  // walkway (top)
  ctx.fillStyle = C.top; ctx.fillRect(0, y0, W, WALL_T * .55);
  if (sec.wall === 'sandbag') {
    for (let row = 0; row < 2; row++) for (let x = (row ? 6 : 0); x < W + 12; x += 13) {
      rr(ctx, x - 6, y0 + row * 5.5, 12, 6, 3); ctx.fillStyle = row ? C.face : C.top; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = .7; ctx.stroke();
    }
  } else if (sec.wall === 'steel') {
    ctx.fillStyle = C.line; for (let x = 0; x < W; x += 24) ctx.fillRect(x, y0, 1, WALL_T * .55);
  } else {
    ctx.strokeStyle = C.line; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(0, y0 + WALL_T * .55); ctx.lineTo(W, y0 + WALL_T * .55); ctx.stroke();
  }
  // towers
  for (let i = 0; i < (sec.towers || 0); i++) {
    const tx = [24, W - 24, W / 2][i];
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(tx - 11, y0 - 9, 24, 24);
    ctx.fillStyle = sec.wall === 'stone' ? '#7a6f5d' : '#6b5d48'; ctx.fillRect(tx - 12, y0 - 12, 24, 24);
    ctx.strokeStyle = '#3e3427'; ctx.lineWidth = 1; ctx.strokeRect(tx - 12, y0 - 12, 24, 24);
    ctx.beginPath(); ctx.moveTo(tx - 12, y0 - 12); ctx.lineTo(tx + 12, y0 + 12); ctx.moveTo(tx + 12, y0 - 12); ctx.lineTo(tx - 12, y0 + 12); ctx.stroke();
  }
  void lost; void t;
}
function drawWallFront(ctx, sec, wall, t, broken) {
  if (broken) return;
  const C = WALL_COL[sec.wall] || WALL_COL.concrete;
  const y0 = WALL_Y - WALL_T / 2 + WALL_T * .5;
  const h = WALL_T * .5;
  const lost = 1 - Math.max(0, wall.hp) / wall.maxHp;
  ctx.fillStyle = C.face; ctx.fillRect(0, y0, W, h);
  if (sec.wall === 'sandbag') {
    for (let x = 0; x < W + 12; x += 13) { rr(ctx, x - 6, y0 + 1, 12, h - 2, 3); ctx.fillStyle = C.face; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = .7; ctx.stroke(); }
  } else if (sec.wall === 'concrete' || sec.wall === 'hq') {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, y0 + h - 3, W, 3);
  } else if (sec.wall === 'stone') {
    ctx.strokeStyle = C.line; ctx.lineWidth = .8;
    for (let row = 0; row < 2; row++) for (let x = row * 8; x < W; x += 16) ctx.strokeRect(x, y0 + row * h / 2, 16, h / 2);
  } else if (sec.wall === 'steel') {
    ctx.fillStyle = C.line; for (let x = 0; x < W; x += 24) ctx.fillRect(x, y0, 1.2, h);
    ctx.fillStyle = '#9aa2a8'; for (let x = 4; x < W; x += 12) { ctx.fillRect(x, y0 + 2, 1.4, 1.4); ctx.fillRect(x, y0 + h - 3, 1.4, 1.4); }
    // hazard stripe
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0 + h - 3, W, 3); ctx.clip();
    for (let x = -10; x < W; x += 10) { ctx.fillStyle = PAL.hazard; ctx.beginPath(); ctx.moveTo(x, y0 + h); ctx.lineTo(x + 5, y0 + h - 3); ctx.lineTo(x + 10, y0 + h - 3); ctx.lineTo(x + 5, y0 + h); ctx.fill(); }
    ctx.restore();
  }
  // gate
  ctx.fillStyle = '#3d3a33'; ctx.fillRect(W / 2 - 16, y0 - 2, 32, h + 2);
  ctx.strokeStyle = '#1f1d19'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - 16, y0 - 2, 32, h + 2);
  ctx.beginPath(); ctx.moveTo(W / 2, y0 - 2); ctx.lineTo(W / 2, y0 + h); ctx.stroke();
  // damage: holes, cracks, rubble
  const rnd = mulberry32(sec.name.length * 31 + 7);
  const N = 14;
  for (let i = 0; i < N; i++) {
    const th = rnd() * .85 + .05, x = 12 + rnd() * (W - 24), w = 8 + rnd() * 12;
    if (lost < th) continue;
    const deep = Math.min(1, (lost - th) * 4);
    ctx.fillStyle = C.hole;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y0 + h); ctx.lineTo(x - w * .4, y0 + h * (1 - deep) - 2); ctx.lineTo(x - w * .1, y0 - 2 * deep); ctx.lineTo(x + w * .25, y0 + h * (1 - deep * .9)); ctx.lineTo(x + w / 2, y0 + h); ctx.closePath(); ctx.fill();
    for (let k = 0; k < 4; k++) ell(ctx, x - w / 2 + rnd() * w, y0 + h + 2 + rnd() * 4, 1.5 + rnd() * 2, 1 + rnd(), C.face);
    // crack lines
    ctx.strokeStyle = C.line; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(x + w / 2, y0 + h * .4); ctx.lineTo(x + w / 2 + 6, y0 + h * .2); ctx.lineTo(x + w / 2 + 9, y0 + h * .6); ctx.stroke();
  }
  // fires when badly damaged
  if (lost > .55) {
    const n = lost > .8 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const x = 30 + i * (W - 60) / (n - 1 || 1) + Math.sin(i * 9) * 14;
      const f = 1 + Math.sin(t * 14 + i * 3) * .25;
      ell(ctx, x, y0 - 2, 4 * f, 6 * f, 'rgba(255,140,40,.85)');
      ell(ctx, x, y0 - 1, 2 * f, 3.5 * f, 'rgba(255,230,120,.95)');
      ctx.globalAlpha = .25; ell(ctx, x + Math.sin(t * 2 + i) * 4, y0 - 14 - (t * 8 + i * 5) % 14, 6, 6, '#333'); ctx.globalAlpha = 1;
    }
  }
}

// ---------- units ----------
function drawUnit(ctx, u, t, opts) {
  opts = opts || {};
  const P = u.team === 'p';
  const r = u.r, k = u.key, d = u.def;
  ctx.save();
  ctx.translate(u.x, u.y);
  if (!opts.icon) {
    // shadow + team ring
    ell(ctx, 1.2, 2.4, r * (u.vehicle ? 1.15 : .95), r * (u.vehicle ? .9 : .6), 'rgba(0,0,0,.22)');
    if (!d.structure) {
      ctx.beginPath(); ctx.ellipse(0, 1, r * (u.vehicle ? 1.25 : 1.05), r * (u.vehicle ? 1.05 : .72), 0, 0, Math.PI * 2);
      ctx.strokeStyle = P ? PAL.pRing : PAL.eRing; ctx.globalAlpha = .75; ctx.lineWidth = 1.4; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  if (d.structure) { (d.barracks ? drawEBarracks : d.gate ? drawGate : drawBunker)(ctx, u, t); ctx.restore(); return; }
  ctx.rotate(u.face + Math.PI / 2);
  const hurt = u.hurt > 0;
  const uni = hurt ? '#fff' : P ? PAL.pUni : PAL.eUni;
  const uniD = P ? PAL.pUniD : PAL.eUniD;
  const helm = hurt ? '#fff' : P ? PAL.pHelm : PAL.eWrap;
  const step = u.moving ? Math.sin(u.walk) : 0;

  if (u.vehicle) { drawVehicle(ctx, u, t, P, hurt); ctx.restore(); return; }

  // legs
  if (u.moving) {
    ell(ctx, -r * .32, r * .15 + step * r * .35, r * .22, r * .3, uniD);
    ell(ctx, r * .32, r * .15 - step * r * .35, r * .22, r * .3, uniD);
  }
  // weapon (under body/head)
  ctx.fillStyle = PAL.gun;
  const gun = (len, wid, xo) => { ctx.fillRect((xo || r * .32) - wid / 2, -r * .1 - len, wid, len); };
  if (k === 'rifle' || k === 'gunman') { gun(r * 1.45, r * .26); if (k === 'gunman') { ctx.fillStyle = '#5a3a22'; ctx.fillRect(r * .32 - r * .13, -r * .7, r * .26, r * .3); } }
  else if (k === 'saw') {
    gun(r * 1.85, r * .38);
    ctx.fillStyle = '#4c5634'; ctx.fillRect(r * .5, -r * .55, r * .38, r * .35);
    if (u.setupT >= (d.setup || 0)) { ctx.strokeStyle = PAL.gun; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(r * .32, -r * 1.65); ctx.lineTo(r * .02, -r * 1.35); ctx.moveTo(r * .32, -r * 1.65); ctx.lineTo(r * .62, -r * 1.35); ctx.stroke(); }
  }
  else if (k === 'rpg' || k === 'erpg') {
    ctx.fillStyle = P ? '#55613a' : '#5d4b31'; ctx.fillRect(r * .45 - r * .22, -r * 1.7, r * .44, r * 2.3);
    if (u.cdT <= .4 || opts.icon) { ctx.fillStyle = P ? '#3d4628' : '#47392a'; ctx.beginPath(); ctx.moveTo(r * .45 - r * .34, -r * 1.7); ctx.lineTo(r * .45, -r * 2.35); ctx.lineTo(r * .45 + r * .34, -r * 1.7); ctx.fill(); }
  }
  else if (k === 'gren') { gun(r * 1.35, r * .26); ctx.fillStyle = '#4a4f3c'; ctx.fillRect(r * .32 - r * .24, -r * 1.05, r * .48, r * .62); }
  else if (k === 'sniper' || k === 'esniper') { gun(r * 2.4, r * .2); ctx.fillStyle = '#111'; ctx.fillRect(r * .32 - r * .15, -r * .9, r * .3, r * .4); }
  else if (k === 'breacher') { gun(r * .95, r * .26); }
  else if (k === 'jugg') { gun(r * 1.25, r * .34); }
  else if (k === 'heavy') {
    ctx.fillStyle = PAL.metal; for (let i = -1; i <= 1; i++) ctx.fillRect(r * .35 + i * r * .14 - r * .06, -r * 1.55, r * .12, r * 1.5);
    ctx.fillStyle = '#222'; ctx.fillRect(r * .35 - r * .25, -r * .45, r * .5, r * .3);
  }
  else if (k === 'rusher') {
    const sw = u.cdT > (d.cd * .6) ? -.9 : .2;
    ctx.save(); ctx.translate(r * .55, -r * .1); ctx.rotate(sw);
    ctx.fillStyle = '#d8dcdf'; ctx.fillRect(-r * .1, -r * 1.25, r * .22, r * 1.05); ctx.fillStyle = '#4a3020'; ctx.fillRect(-r * .12, -r * .25, r * .26, r * .35);
    ctx.restore();
  }
  else if (k === 'mortar') {
    // base plate + tube
    circ(ctx, 0, -r * .2, r * .55, '#4a4f3c', '#2b2f22', 1);
    ctx.fillStyle = PAL.gun; ctx.fillRect(-r * .16, -r * 1.1, r * .32, r * 1.0);
  }
  // muzzle flash
  if (u.flash > 0 && k !== 'rusher' && k !== 'medic' && k !== 'shield') {
    const len = k === 'saw' ? r * 1.9 : k === 'sniper' || k === 'esniper' ? r * 2.5 : k === 'heavy' ? r * 1.6 : r * 1.5;
    ctx.fillStyle = 'rgba(255,220,90,.95)';
    ctx.beginPath(); ctx.moveTo(r * .32, -len - r * .9); ctx.lineTo(r * .32 - r * .35, -len); ctx.lineTo(r * .32 + r * .35, -len); ctx.fill();
  }
  // body
  if (k === 'mortar') {
    ell(ctx, r * .9, r * .4, r * .62, r * .42, uni); circ(ctx, r * .9, r * .4, r * .34, helm, 'rgba(0,0,0,.35)', .8);
  } else {
    const big = k === 'jugg' || k === 'heavy';
    // pack
    ctx.fillStyle = k === 'breacher' ? '#e07b2a' : k === 'medic' ? '#e9e4d6' : uniD;
    rr(ctx, -r * .45, r * .25, r * .9, r * .45, 2); ctx.fill();
    if (k === 'breacher' && (Math.floor(t * 4) % 2 === 0 || u.state === 'plant')) circ(ctx, r * .25, r * .45, r * .1, '#ff3b30');
    if (k === 'medic') { ctx.fillStyle = '#2f9e57'; ctx.fillRect(-r * .06, r * .3, r * .12, r * .34); ctx.fillRect(-r * .18, r * .42, r * .36, r * .1); }
    if (k === 'sniper' || k === 'esniper') {
      // ghillie fuzz
      const gc = P ? ['#5c6b33', '#6f7c3d', '#4a5728'] : ['#6b5a3c', '#7d6a45', '#584a30'];
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; circ(ctx, Math.cos(a) * r * .7, Math.sin(a) * r * .45, r * .32, gc[i % 3]); }
    }
    ell(ctx, 0, 0, r * (big ? 1 : .9), r * (big ? .66 : .55), uni);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(0, 0, r * (big ? 1 : .9), r * (big ? .66 : .55), 0, 0, Math.PI * 2); ctx.stroke();
    if (big && !hurt) { ctx.fillStyle = k === 'jugg' ? '#3f4a2c' : '#3b3b3b'; rr(ctx, -r * .7, -r * .35, r * 1.4, r * .55, 3); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke(); }
    // head
    const hr = r * (big ? .52 : .5);
    const hc = hurt ? '#fff' : k === 'medic' ? '#e2ddcf' : k === 'jugg' ? '#2f3824' : k === 'heavy' ? '#2e2e2e' : k === 'rusher' ? '#c7553f' : helm;
    circ(ctx, 0, -r * .05, hr, hc, 'rgba(0,0,0,.4)', .8);
    if (!hurt) {
      if (k === 'jugg') { ctx.fillStyle = '#8fd3ff'; ctx.fillRect(-hr * .6, -r * .05 - hr * .85, hr * 1.2, hr * .32); }
      else if (k === 'heavy') { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(-hr * .6, -r * .05 - hr * .85, hr * 1.2, hr * .3); }
      else if (k === 'medic') { ctx.fillStyle = '#2f9e57'; ctx.fillRect(-hr * .12, -r * .05 - hr * .55, hr * .24, hr * .7); ctx.fillRect(-hr * .35, -r * .05 - hr * .32, hr * .7, hr * .24); }
      else { circ(ctx, -hr * .3, -r * .05 - hr * .3, hr * .32, 'rgba(255,255,255,.18)'); }
    }
  }
  // riot shield in front
  if (k === 'shield') {
    const wide = u.braced ? 1.35 : 1.2;
    ctx.fillStyle = hurt ? '#fff' : 'rgba(183,205,224,.92)';
    rr(ctx, -r * wide, -r * 1.35, r * wide * 2, r * .55, 2); ctx.fill();
    ctx.strokeStyle = '#2b3a48'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(30,45,60,.45)'; ctx.fillRect(-r * .45, -r * 1.25, r * .9, r * .16);
  }
  ctx.restore();
  // setup progress ring (not rotated)
  if (d.setup && !opts.icon && u.setupT > 0 && u.setupT < d.setup) {
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.setupT / d.setup));
    ctx.strokeStyle = PAL.hazard; ctx.lineWidth = 1.6; ctx.stroke();
  }
  if (u.state === 'plant' && !opts.icon) {
    ctx.beginPath(); ctx.arc(u.x, u.y - r - 6, 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u.plantT / 1.6));
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 2; ctx.stroke();
  }
}
function drawVehicle(ctx, u, t, P, hurt) {
  const r = u.r, k = u.key;
  if (k === 'humvee') {
    ctx.fillStyle = hurt ? '#fff' : '#77814d'; rr(ctx, -r * .72, -r * 1.05, r * 1.44, r * 2.1, 3); ctx.fill();
    ctx.strokeStyle = '#3e4527'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#2b3136'; ctx.fillRect(-r * .55, -r * .55, r * 1.1, r * .3);
    ctx.fillStyle = '#5e6a3a'; ctx.fillRect(-r * .6, -r * 1.0, r * 1.2, r * .38);
    circ(ctx, 0, r * .25, r * .36, '#4f5933', '#2d331d', 1);
    ctx.fillStyle = PAL.gun; ctx.fillRect(-r * .07, -r * .75, r * .14, r * 1.0);
    if (u.flash > 0) { ctx.fillStyle = 'rgba(255,220,90,.95)'; circ(ctx, 0, -r * .85, r * .18, 'rgba(255,220,90,.95)'); }
  } else if (k === 'technical') {
    ctx.fillStyle = hurt ? '#fff' : '#d8d2c2'; rr(ctx, -r * .66, -r * 1.05, r * 1.32, r * 2.1, 3); ctx.fill();
    ctx.strokeStyle = '#6b6658'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#9c5a33'; ctx.fillRect(-r * .5, r * .55, r * .3, r * .2); // rust
    ctx.fillStyle = '#2c3135'; ctx.fillRect(-r * .55, -r * .55, r * 1.1, r * .3);
    ctx.fillStyle = '#b8b2a2'; ctx.fillRect(-r * .55, -r * .2, r * 1.1, r * 1.1);
    circ(ctx, 0, r * .35, r * .22, '#444');
    ctx.fillStyle = PAL.gun; ctx.fillRect(-r * .07, -r * .5, r * .14, r * .9);
    circ(ctx, r * .2, r * .62, r * .18, PAL.eWrap);
    if (u.flash > 0) circ(ctx, 0, -r * .6, r * .18, 'rgba(255,220,90,.95)');
  } else if (k === 'tank') {
    ctx.fillStyle = '#3a352b'; ctx.fillRect(-r * .8, -r * .95, r * .3, r * 1.9); ctx.fillRect(r * .5, -r * .95, r * .3, r * 1.9);
    ctx.fillStyle = '#26221b'; for (let y = -r * .9; y < r * .9; y += 3) { ctx.fillRect(-r * .8, y + (u.walk % 3), r * .3, 1); ctx.fillRect(r * .5, y + (u.walk % 3), r * .3, 1); }
    ctx.fillStyle = hurt ? '#fff' : '#8b7a52'; rr(ctx, -r * .55, -r * .85, r * 1.1, r * 1.7, 2); ctx.fill();
    ctx.strokeStyle = '#4e4430'; ctx.lineWidth = 1; ctx.stroke();
    circ(ctx, 0, r * .05, r * .42, '#7a6a45', '#4e4430', 1);
    ctx.fillStyle = '#3d3526'; ctx.fillRect(-r * .07, -r * 1.35, r * .14, r * 1.1);
    if (u.flash > 0) circ(ctx, 0, -r * 1.45, r * .3, 'rgba(255,200,80,.95)');
  }
}
function drawBunker(ctx, u, t) {
  const r = u.r;
  const f = Math.max(0, u.hp) / u.maxHp;
  // sandbags around
  for (let i = 0; i < 9; i++) { const a = Math.PI * (.05 + i / 8 * .9); ell(ctx, Math.cos(a) * r * 1.15, Math.sin(a) * r * .55 + 2, 4, 2.6, '#b49b67'); }
  ctx.fillStyle = u.hurt > 0 ? '#fff' : '#8f918a'; rr(ctx, -r, -r * .7, r * 2, r * 1.2, 4); ctx.fill();
  ctx.strokeStyle = '#55574f'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#a7a9a1'; rr(ctx, -r * .8, -r * .6, r * 1.6, r * .7, 3); ctx.fill();
  ctx.fillStyle = '#1d1e1b'; ctx.fillRect(-r * .6, r * .2, r * 1.2, r * .18);
  // gun barrel toward target
  const a = u.face;
  ctx.strokeStyle = PAL.gun; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, r * .28); ctx.lineTo(Math.cos(a) * r * .9, r * .28 + Math.sin(a) * r * .6); ctx.stroke();
  if (u.flash > 0) circ(ctx, Math.cos(a) * r * 1.0, r * .28 + Math.sin(a) * r * .7, 2.6, 'rgba(255,220,90,.95)');
  // damage cracks
  if (f < .7) { ctx.strokeStyle = '#4a4b45'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-r * .5, -r * .6); ctx.lineTo(-r * .2, -r * .2); ctx.lineTo(-r * .4, r * .1); ctx.stroke(); }
  if (f < .4) { ctx.beginPath(); ctx.moveTo(r * .6, -r * .5); ctx.lineTo(r * .3, -r * .1); ctx.lineTo(r * .5, r * .1); ctx.stroke();
    ctx.globalAlpha = .35; circ(ctx, Math.sin(t * 2) * 3, -r - (t * 10) % 10, 4, '#333'); ctx.globalAlpha = 1; }
}
// enemy barracks: trains part of every enemy wave. Vehicle depots get a garage door.
function drawEBarracks(ctx, u, t) {
  const r = u.r, f = Math.max(0, u.hp) / u.maxHp, hurt = u.hurt > 0;
  const depot = u.trains && ENEMIES[u.trains] && ENEMIES[u.trains].vehicle;
  const w = r * 2.2, h = r * 1.5;
  // walls
  ctx.fillStyle = hurt ? '#fff' : depot ? '#7d7f74' : '#9a8558'; rr(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
  // roof: two slopes in enemy red
  ctx.fillStyle = hurt ? '#fff' : '#8e3b30'; ctx.fillRect(-w / 2 - 2, -h / 2 - 3, w + 4, h * .55);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-w / 2 - 2, -h / 2 - 3 + h * .27, w + 4, h * .28);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-w / 2 - 2, -h / 2 - 3, w + 4, 2);
  // door facing our side
  if (depot) {
    ctx.fillStyle = '#3c3d37'; ctx.fillRect(-w * .32, h * .05, w * .64, h * .45);
    ctx.strokeStyle = '#5b5d55'; ctx.lineWidth = .8;
    for (let y = h * .12; y < h * .48; y += 3) { ctx.beginPath(); ctx.moveTo(-w * .32, y); ctx.lineTo(w * .32, y); ctx.stroke(); }
  } else {
    ctx.fillStyle = '#2b2620'; rr(ctx, -r * .32, h * .08, r * .64, h * .42, 2); ctx.fill();
    ctx.fillStyle = '#d9c38a'; ctx.fillRect(-w * .42, h * .12, r * .3, r * .22); ctx.fillRect(w * .42 - r * .3, h * .12, r * .3, r * .22);
  }
  // little red banner so it reads as the enemy's
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 - 3, -h / 2 - 2); ctx.lineTo(w / 2 - 3, -h / 2 - 14); ctx.stroke();
  ctx.fillStyle = PAL.eRing; ctx.beginPath(); ctx.moveTo(w / 2 - 3, -h / 2 - 14); ctx.lineTo(w / 2 + 7, -h / 2 - 11); ctx.lineTo(w / 2 - 3, -h / 2 - 8); ctx.fill();
  // damage
  ctx.strokeStyle = 'rgba(30,25,20,.7)'; ctx.lineWidth = 1;
  if (f < .7) { ctx.beginPath(); ctx.moveTo(-w * .35, -h * .1); ctx.lineTo(-w * .15, h * .15); ctx.lineTo(-w * .25, h * .35); ctx.stroke(); }
  if (f < .4) {
    ctx.beginPath(); ctx.moveTo(w * .3, -h * .3); ctx.lineTo(w * .1, 0); ctx.lineTo(w * .25, h * .2); ctx.stroke();
    ctx.fillStyle = 'rgba(20,18,15,.55)'; ctx.beginPath(); ctx.arc(-w * .18, -h * .25, r * .35, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 2; i++) { ctx.globalAlpha = .35; circ(ctx, Math.sin(t * 2 + i) * 4 - w * .15, -h / 2 - 4 - ((t * 12 + i * 7) % 16), 4 + i, '#3a3530'); }
    ctx.globalAlpha = 1;
  }
}
// the gate in the wall: break it to clear the line
function drawGate(ctx, u, t) {
  const r = u.r, f = Math.max(0, u.hp) / u.maxHp, hurt = u.hurt > 0;
  const w = r * 2.4, h = r * 1.15;
  ctx.fillStyle = '#3d3a33'; ctx.fillRect(-w / 2 - 5, -h / 2 - 4, w + 10, h + 6);       // frame
  ctx.fillStyle = hurt ? '#fff' : '#6b5638'; ctx.fillRect(-w / 2, -h / 2, w, h);           // doors
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-1, -h / 2, 2, h);                         // seam
  ctx.fillStyle = '#4a4740';
  for (const y of [-h * .3, h * .2]) ctx.fillRect(-w / 2, y, w, 3);                        // steel bands
  for (const x of [-w * .38, -w * .12, w * .12, w * .38]) circ(ctx, x, -h * .3 + 1.5, 1.2, '#8a877d');
  if (f < .75) { ctx.strokeStyle = 'rgba(25,20,15,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-w * .3, -h * .5); ctx.lineTo(-w * .2, 0); ctx.lineTo(-w * .32, h * .4); ctx.stroke(); }
  if (f < .5) { ctx.fillStyle = 'rgba(15,12,10,.8)'; ctx.beginPath(); ctx.ellipse(w * .15, h * .05, w * .14, h * .28, .3, 0, Math.PI * 2); ctx.fill(); }
  if (f < .25) {
    ctx.fillStyle = 'rgba(15,12,10,.85)'; ctx.beginPath(); ctx.ellipse(-w * .1, -h * .05, w * .2, h * .35, -.4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .4; circ(ctx, Math.sin(t * 2) * 4, -h / 2 - 6 - (t * 12) % 14, 5, '#3a3530'); ctx.globalAlpha = 1;
  }
}
function drawHpBar(ctx, u) {
  if (u.hp >= u.maxHp - .5 && !u.def.structure) return;
  const w = u.def.gate ? 64 : u.def.barracks ? 40 : u.def.structure ? 30 : Math.max(10, u.r * 2), x = u.x - w / 2, y = u.y - u.r - (u.def.gate ? 4 : u.def.structure ? 12 : 6);
  if (u.def.gate) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 1, y - 1, w + 2, 5); const f = Math.max(0, u.hp / u.maxHp); ctx.fillStyle = '#ff6a4e'; ctx.fillRect(x, y, w * f, 3); return; }
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - .5, y - .5, w + 1, 3);
  const f = Math.max(0, u.hp / u.maxHp);
  ctx.fillStyle = u.team === 'p' ? '#6fd17c' : f > .5 ? '#ffb347' : '#ff5a4e';
  ctx.fillRect(x, y, w * f, 2);
}

function drawDead(ctx, f) {
  const a = Math.min(1, f.life / (f.max * .4));
  ctx.save(); ctx.globalAlpha = a * .8; ctx.translate(f.x, f.y);
  if (f.vehicle) {
    ctx.rotate(f.face + Math.PI / 2);
    ctx.fillStyle = '#2b2925'; rr(ctx, -f.r * .7, -f.r, f.r * 1.4, f.r * 2, 3); ctx.fill();
    ctx.restore();
    if (f.life > 1) { ctx.globalAlpha = .3; circ(ctx, f.x + Math.sin(f.life * 3) * 3, f.y - 8 - (6 - f.life) * 4, 5, '#3b3b3b'); ctx.globalAlpha = 1; }
    return;
  }
  ctx.rotate(f.face + Math.PI / 2 + 1.3);
  ell(ctx, 0, 0, f.r * .9, f.r * .5, f.team === 'p' ? '#5d6640' : '#5a4638');
  circ(ctx, 0, -f.r * .65, f.r * .42, f.team === 'p' ? '#4b5531' : '#9a4a3c');
  ctx.restore();
}
function drawSoul(ctx, f) {
  const k = 1 - f.life / f.max;
  ctx.save(); ctx.globalAlpha = (1 - k) * .9; ctx.translate(f.x, f.y - k * 16);
  circ(ctx, 0, 0, 3.6, '#f4f1e6'); ctx.fillStyle = '#f4f1e6'; ctx.fillRect(-2.2, 1.8, 4.4, 2.6);
  ctx.fillStyle = '#222'; ctx.fillRect(-2, -1, 1.5, 1.6); ctx.fillRect(.5, -1, 1.5, 1.6);
  ctx.restore();
}

// small sprite images for the UI
const ICON_CACHE = {};
function unitIcon(key, team, px) {
  const id = key + team + px;
  if (ICON_CACHE[id]) return ICON_CACHE[id];
  const dpr = 2;
  const c = document.createElement('canvas'); c.width = px * dpr; c.height = px * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const def = team === 'p' ? UNITS[key] : ENEMIES[key];
  const size = def.size || 1;
  const base = def.structure ? px * .2 : def.vehicle ? px * .2 : px * .27 / Math.max(1, size * .75);
  const u = { x: px / 2, y: px / 2 + (def.vehicle ? 0 : px * .06), r: base * size, key, def, team, face: team === 'p' ? -Math.PI / 2 : Math.PI / 2, hp: 1, maxHp: 1, setupT: 99, cdT: 0, walk: 0, vehicle: !!def.vehicle, flash: 0, hurt: 0 };
  if (def.structure) { u.face = Math.PI / 2; u.r = px * .26; }
  drawUnit(ctx, u, 0, { icon: true });
  const url = c.toDataURL();
  ICON_CACHE[id] = url;
  return url;
}

