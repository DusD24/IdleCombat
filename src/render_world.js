// ---------- deployment squares ----------
function fakeUnit(k, x, y, r) {
  const def = UNITS[k];
  return { x, y, r: r * (def.size || 1), key: k, def, team: 'p', face: -Math.PI / 2, hp: 1, maxHp: 1, setupT: 99, cdT: 0, walk: 0, vehicle: !!def.vehicle, flash: 0, hurt: 0 };
}
function drawDeploy(ctx, w, open, lockCost, t, hover) {
  for (const s of w.slotList()) {
    const x = COLS_X[s.c], y = ROWS_Y[s.r];
    const isOpen = open[s.r][s.c];
    rr(ctx, x - 40, y - 15, 80, 30, 6);
    if (!isOpen) {
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fill();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      // padlock + price
      ctx.fillStyle = 'rgba(40,36,25,.45)'; ctx.fillRect(x - 4, y - 4, 8, 6);
      ctx.strokeStyle = 'rgba(40,36,25,.45)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x, y - 4, 2.6, Math.PI, 0); ctx.stroke();
      if (lockCost != null) { ctx.font = '700 8px "Saira Condensed", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(40,36,25,.6)'; ctx.fillText('$' + lockCost, x, y + 11); }
      continue;
    }
    const isHover = hover && hover[0] === s.r && hover[1] === s.c;
    if (!s.type) {
      ctx.fillStyle = isHover ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; ctx.fill();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      continue;
    }
    const ready = s.status === 'ready';
    ctx.fillStyle = ready ? 'rgba(127,216,139,.16)' : isHover ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(127,216,139,.95)' : 'rgba(255,255,255,.5)';
    ctx.setLineDash(ready ? [] : [4, 3]); ctx.lineWidth = ready ? 1.6 : 1.1; ctx.stroke(); ctx.setLineDash([]);
    if (s.status === 'need' || s.status === 'training') {
      ctx.save(); ctx.globalAlpha = .38;
      const pat = PAT[UNITS[s.type].n];
      const shown = pat.length > 3 ? [pat[0], pat[2], pat[4]] : pat;
      for (const [ox, oy] of shown) drawUnit(ctx, fakeUnit(s.type, x + ox * .8, y + oy - 2, 5.5), t, { icon: true });
      ctx.restore();
      const p = s.status === 'training' ? s.prog : 0;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 34, y + 9, 68, 3);
      ctx.fillStyle = PAL.hazard; ctx.fillRect(x - 34, y + 9, 68 * p, 3);
    }
  }
}
// ---------- barracks ----------
function drawBarracks(ctx, w, t) {
  for (const k of w.bldTypes()) {
    const p = w.bldPos(k), b = w.bld[k] || { jobs: [] };
    const busy = b.jobs.length > 0;
    ell(ctx, p.x + 2, p.y + 9, 21, 6, 'rgba(0,0,0,.22)');
    // tent body
    rr(ctx, p.x - 19, p.y - 10, 38, 20, 3); ctx.fillStyle = '#6c7646'; ctx.fill();
    ctx.strokeStyle = '#3f4628'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#7f8a54'; ctx.beginPath(); ctx.moveTo(p.x - 19, p.y - 10); ctx.lineTo(p.x, p.y - 2); ctx.lineTo(p.x + 19, p.y - 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 2); ctx.lineTo(p.x, p.y + 10); ctx.stroke();
    // door
    ctx.fillStyle = busy ? '#ffcf5a' : '#2c3020'; ctx.fillRect(p.x - 4, p.y + 3, 8, 7);
    // emblem: the troop this barracks trains
    drawUnit(ctx, fakeUnit(k, p.x - 10, p.y - 1, 5), t, { icon: true });
    // production bars, one per line
    for (let i = 0; i < LINES; i++) {
      const j = b.jobs[i];
      const bx = p.x + 3, by = p.y - 6 + i * 5;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(bx, by, 14, 3);
      if (j) { ctx.fillStyle = PAL.hazard; ctx.fillRect(bx, by, 14 * Math.min(1, j.t / j.dur), 3); }
    }
  }
}
function drawBaseGuns(ctx, w) {
  if (!w.guns) return;
  for (const g of w.guns) {
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1 + i / 6); ell(ctx, g.x + Math.cos(a) * 11, g.y + Math.sin(a) * 7 + 2, 4, 2.6, '#c2aa75'); }
    circ(ctx, g.x, g.y, 6, '#5d6a3b', '#3b4425', 1);
    ctx.strokeStyle = PAL.gun; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + Math.cos(g.face) * 12, g.y + Math.sin(g.face) * 12); ctx.stroke();
    if (g.flash > 0) circ(ctx, g.x + Math.cos(g.face) * 14, g.y + Math.sin(g.face) * 14, 2.6, 'rgba(255,220,90,.95)');
  }
}

function drawWorld(ctx, w, bg, t, view) {
  ctx.save();
  if (w.shake > 0) ctx.translate((Math.random() - .5) * w.shake * 7, (Math.random() - .5) * w.shake * 7);
  ctx.drawImage(bg, 0, 0, W, H);
  if (view.fade > 0 && view.oldBg) { ctx.globalAlpha = view.fade; ctx.drawImage(view.oldBg, 0, 0, W, H); ctx.globalAlpha = 1; }
  drawDeploy(ctx, w, view.open, view.lockCost, t, view.hover);
  drawBarracks(ctx, w, t);
  const broken = w.breaching;
  for (const f of w.fx) if (f.type === 'dead') drawDead(ctx, f);
  drawWallBack(ctx, w.sec, w.wall, t, broken);
  const us = w.units.slice().sort((a, c) => a.y - c.y);
  for (const u of us) if (u.onWall) drawUnit(ctx, u, t);
  drawWallFront(ctx, w.sec, w.wall, t, broken);
  for (const u of us) {
    if (u.onWall) continue;
    if (u.phase === 'retreat') { ctx.globalAlpha = .55; drawUnit(ctx, u, t); ctx.globalAlpha = 1; }
    else drawUnit(ctx, u, t);
  }
  for (const u of us) drawHpBar(ctx, u);
  for (const p of w.proj) {
    if (p.type === 'rocket' || p.type === 'cannon') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.a || 0) + Math.PI / 2);
      if (p.type === 'cannon') { ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-1.5, -4, 3, 8); }
      else { ctx.fillStyle = '#3a3a2f'; ctx.fillRect(-1.3, -4, 2.6, 8); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-1.6, 4); ctx.lineTo(0, 8 + Math.random() * 3); ctx.lineTo(1.6, 4); ctx.fill(); }
      ctx.restore();
    } else {
      ell(ctx, p.x, p.y, 2.2, 1.2, 'rgba(0,0,0,.25)');
      circ(ctx, p.x, p.y - p.z, p.type === 'shell' ? 2.6 : 2, '#2d2f28', '#11120f', .6);
    }
  }
  for (const f of w.fx) {
    const k = f.life / f.max;
    if (f.type === 'tracer') {
      ctx.strokeStyle = f.team === 'p' ? `rgba(255,236,150,${k})` : `rgba(255,150,110,${k})`;
      ctx.lineWidth = f.heavy ? 1.5 : .9; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.type === 'boom') {
      const r2 = f.r * (1.15 - k * .6);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r2);
      g.addColorStop(0, `rgba(255,245,200,${k})`); g.addColorStop(.4, `rgba(255,160,50,${k * .9})`); g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${k * .5})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - k * .9), 0, Math.PI * 2); ctx.stroke();
    } else if (f.type === 'puff') {
      ctx.globalAlpha = k * (f.c === 'dark' ? .5 : .35);
      circ(ctx, f.x, f.y, f.size * (1.6 - k * .6), f.c === 'dark' ? '#3a332a' : '#d8d3c6');
      ctx.globalAlpha = 1;
    } else if (f.type === 'slash') {
      ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(f.x, f.y, 6, -2.4, -.7); ctx.stroke();
    } else if (f.type === 'heal') {
      ctx.globalAlpha = k; ctx.fillStyle = '#58e08a';
      ctx.fillRect(f.x - 1, f.y - 4 - (1 - k) * 8, 2, 7); ctx.fillRect(f.x - 3.5, f.y - 1.5 - (1 - k) * 8, 7, 2); ctx.globalAlpha = 1;
    } else if (f.type === 'beam') {
      ctx.strokeStyle = `rgba(88,224,138,${k * .5})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.type === 'soul') drawSoul(ctx, f);
  }
  ctx.textAlign = 'center';
  for (const tx of w.texts) {
    ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
    ctx.font = `800 ${tx.big ? 13 : 10}px "Saira Condensed", system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,22,15,.85)'; ctx.strokeText(tx.txt, tx.x, tx.y);
    ctx.fillStyle = tx.cash ? '#9ff0a8' : PAL.hazard; ctx.fillText(tx.txt, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

