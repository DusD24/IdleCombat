// ================= 3D RENDERER (three.js) =================
// A low-poly 3D view of the same World the 2D renderer draws. Nothing here changes the simulation.
// Simulation coords: x 0..W left to right, y 0..H from the enemy wall (top) to our base (bottom).
// 3D coords: X = x - W/2, Z = y - H/2 + OFF, Y is up. Every defense line of the level is laid out along one
// road, LINE_GAP apart; OFF shifts the current line into place (cleared lines lie behind us as rubble,
// lines still to come stand intact ahead). Pinch or scroll to zoom out over the whole base.
// Units are instanced meshes (a few draw calls total) so it runs on Fire-class tablets.
// Health bars, damage numbers and other small marks go on the 2D canvas laid over the top.
const R3 = (() => {
  if (typeof THREE === 'undefined') return null;
  const T = THREE;
  const LINE_GAP = H + 70;
  let OFF = 0;                                   // z offset of the defense line being drawn
  const X = x => x - W / 2, Z = y => y - H / 2 + OFF;
  const lineOff = i => -i * LINE_GAP;
  const WALL_H = 24, TOWER_H = 46;
  const MAN = 1.45, CAR = 1.2;   // soldiers and vehicles drawn larger than their hit circles so they read at this distance
  const DEPLOY_Y0 = ROWS_Y[0] - 22, DEPLOY_Y1 = ROWS_Y[NROWS - 1] + 22;
  const ZOOM_MAX = 5.5;
  const col = h => new T.Color(h);
  const C = {
    pUni: col(PAL.pUni), pUniD: col(PAL.pUniD), pRing: col('#3f7fd6'),
    eUni: col(PAL.eUni), eUniD: col(PAL.eUniD), eWrap: col(PAL.eWrap), eRing: col('#d84a3e'),
    skin: col('#d8b08a'), gun: col('#2a2c26'), shield: col('#9fb6c9'), white: col('#ffffff'), red: col('#d8352a'),
    heavy: col('#4d4f4a'), rusher: col('#7a4a35'), ghillie: col('#6f7a45'), orange: col('#e2742a'), olive: col('#6b7a3a'),
    pVeh: col('#5d6a3b'), eVeh: col('#6b6250'), tech: col('#d9cfb4'), wheel: col('#22231f'), track: col('#3a3a34'), glass: col('#9cc3d6'),
    dead: col('#3a3630'), boom: col('#ffb347'), smoke: col('#cfc9bb'), dark: col('#3a332a'), bullet: col('#ffe9a0'),
  };
  const HELM = {}; for (const k in TYPE_HELM) HELM[k] = col(TYPE_HELM[k]);
  // ---------- shared geometry ----------
  const box = new T.BoxGeometry(1, 1, 1);
  const ball = new T.SphereGeometry(.5, 10, 7);
  const lowBall = new T.SphereGeometry(.5, 7, 5);
  const cyl = new T.CylinderGeometry(.5, .5, 1, 10);
  const disc = new T.CylinderGeometry(.5, .5, 1, 16);
  const prism = (() => { const g = new T.CylinderGeometry(.5, .5, 1, 3); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); return g; })();  // roof ridge along X
  const SHARED = [box, ball, lowBall, cyl, disc, prism];
  const lambert = (c, extra) => new T.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
  const M = new T.Matrix4(), MB = new T.Matrix4(), MP = new T.Matrix4();
  const Q = new T.Quaternion(), QP = new T.Quaternion(), V = new T.Vector3(), S = new T.Vector3(), E = new T.Euler(), YAX = new T.Vector3(0, 1, 0);
  const TMP = new T.Color(), TMP2 = new T.Color();

  // one InstancedMesh per body part; refilled every frame
  class Inst {
    constructor(scene, geo, cap, mat, shadow) {
      this.m = new T.InstancedMesh(geo, mat || lambert(0xffffff), cap);
      this.m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.m.setColorAt(0, C.white);
      this.m.frustumCulled = false;
      this.m.castShadow = !!shadow;
      this.cap = cap; this.n = 0;
      scene.add(this.m);
    }
    begin() { this.n = 0; }
    add(mat, color) { if (this.n >= this.cap) return; this.m.setMatrixAt(this.n, mat); this.m.setColorAt(this.n, color); this.n++; }
    end() { this.m.count = this.n; this.m.visible = this.n > 0; this.m.instanceMatrix.needsUpdate = true; if (this.m.instanceColor) this.m.instanceColor.needsUpdate = true; }
  }
  // base transform for a unit (ground position, facing, size); parts are placed relative to it
  function setBase(x, h, z, yaw, k) { Q.setFromAxisAngle(YAX, yaw); V.set(x, h, z); S.set(k, k, k); MB.compose(V, Q, S); }
  function part(ox, oy, oz, sx, sy, sz, rx, ry, rz) {
    V.set(ox, oy, oz); S.set(sx, sy, sz);
    if (rx || ry || rz) { E.set(rx || 0, ry || 0, rz || 0); QP.setFromEuler(E); } else QP.identity();
    MP.compose(V, QP, S);
    return M.multiplyMatrices(MB, MP);
  }

  class Scene3D {
    constructor(canvas) {
      this.canvas = canvas;
      const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      r.setClearColor(0x171a12, 1);
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFShadowMap;
      const s = this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(34, .6, 20, 14000);
      s.add(new T.HemisphereLight(0xfff4dc, 0x5a4c36, .52));
      const sun = this.sun = new T.DirectionalLight(0xfff2dc, .62);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -330, right: 330, top: 460, bottom: -460, near: 50, far: 1300 });
      sun.shadow.bias = -.0015;
      s.add(sun); s.add(sun.target);
      const ringMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, depthWrite: false });
      this.P = {
        ring: new Inst(s, disc, 500, ringMat),
        legs: new Inst(s, box, 500, null, true),
        body: new Inst(s, box, 500, null, true),
        head: new Inst(s, ball, 500, null, true),
        helm: new Inst(s, ball, 600),
        kit: new Inst(s, box, 1200),            // guns, packs, crosses, visors
        shield: new Inst(s, box, 120, null, true),
        tube: new Inst(s, cyl, 500),            // RPG tubes, mortar tubes, wheels, barrels
        hull: new Inst(s, box, 300, null, true),
        corpse: new Inst(s, box, 400),
        proj: new Inst(s, box, 200, lambert(0xffffff, { emissive: 0x332200 })),
        shell: new Inst(s, lowBall, 200),
        boom: new Inst(s, lowBall, 260, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false })),
        smoke: new Inst(s, lowBall, 700, lambert(0xffffff, { transparent: true, opacity: .5, depthWrite: false })),
      };
      const tg = new T.BufferGeometry();
      this.tracerMax = 400;
      tg.setAttribute('position', new T.BufferAttribute(new Float32Array(this.tracerMax * 6), 3).setUsage(T.DynamicDrawUsage));
      tg.setAttribute('color', new T.BufferAttribute(new Float32Array(this.tracerMax * 6), 3).setUsage(T.DynamicDrawUsage));
      this.tracers = new T.LineSegments(tg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      this.tracers.frustumCulled = false;
      s.add(this.tracers);
      this.ray = new T.Raycaster(); this.ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
      this.levelKey = ''; this.lineKey = ''; this.baseKey = '';
      this.lines = null; this.base = null;
      this.groundTex = {};          // cached painted ground per line of the current level
      this.structs = new Map();     // live structure unit id -> group
      this.curOff = 0; this.camOff = 0; this.follow = 0;
      this.zoom = 1; this.panZ = 0; this.idleT = 99;
      this.ownFx = [];
      this.deployT = 0;
      this.cssW = 1; this.cssH = 1;
    }
    resize(cssW, cssH, dpr) {
      this.cssW = cssW; this.cssH = cssH;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(cssW, cssH, false);
      this.camera.aspect = cssW / cssH;
      this.fitCamera();
    }
    // frame the current line at a fixed tilt: squares, base, wall tops and the yard behind must all show
    fitCamera() {
      const cam = this.camera, pitch = 50 * Math.PI / 180, keep = OFF;
      OFF = 0;
      const pts = [[0, 0, DEPLOY_Y1], [W, 0, DEPLOY_Y1], [W / 2 - 60, 0, H - 8], [W / 2 + 60, 0, H - 8], [0, WALL_H, WALL_Y], [W, WALL_H, WALL_Y], [W / 2, 20, 12]]
        .map(([x, h, y]) => new T.Vector3(X(x), h, Z(y)));
      OFF = keep;
      let d = 900, zc = 30;
      cam.updateProjectionMatrix();
      const aim = () => { cam.position.set(0, d * Math.sin(pitch), zc + d * Math.cos(pitch)); cam.lookAt(0, 0, zc); cam.updateMatrixWorld(); };
      for (let i = 0; i < 40; i++) {
        aim();
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { V.copy(p).project(cam); x0 = Math.min(x0, V.x); x1 = Math.max(x1, V.x); y0 = Math.min(y0, V.y); y1 = Math.max(y1, V.y); }
        d *= .3 + .7 * Math.max((x1 - x0) / 2, (y1 - y0) / 2) / .985;
        zc -= (y0 + y1) / 2 * 140;
      }
      // portrait screens have spare height: sit our base on the bottom edge and let the road ahead fill the top
      for (let i = 0; i < 30; i++) {
        aim();
        let y0 = 1e9; for (const p of pts) { V.copy(p).project(cam); y0 = Math.min(y0, V.y); }
        zc -= (y0 + .97) * 120;
      }
      this.camD = d; this.camZ = zc; this.pitch = pitch;
    }
    placeCamera(world, dt) {
      const cam = this.camera;
      // drift toward the fighting; glide along the road to a new line; pinch-zoom eases back after a few seconds
      let front = H;
      for (const u of world.units) if (u.alive && u.team === 'p' && u.phase === 'field' && u.y < front) front = u.y;
      const want = front < H ? Math.max(-26, Math.min(18, (front - 420) * .12)) : 0;
      this.follow += (want - this.follow) * .02;
      this.camOff += (this.curOff - this.camOff) * Math.min(1, dt * 1.6);
      if (Math.abs(this.curOff - this.camOff) < .5) this.camOff = this.curOff;
      this.idleT += dt;
      if (this.idleT > 6) { this.zoom += (1 - this.zoom) * Math.min(1, dt * 1.5); this.panZ *= 1 - Math.min(1, dt * 1.5); }
      const d = this.camD * this.zoom;
      if (this.scene.fog) { this.scene.fog.near = d * 1.25; this.scene.fog.far = d * 3.6; }
      const zc = this.camZ + this.camOff + this.follow + this.panZ - (this.zoom - 1) * 120;
      const sh = world.shake > 0 ? world.shake * 3 : 0;
      cam.position.set((Math.random() - .5) * sh, d * Math.sin(this.pitch) + (Math.random() - .5) * sh, zc + d * Math.cos(this.pitch));
      cam.lookAt(0, 0, zc);
      cam.updateMatrixWorld();
      // keep the sun's shadow box on whatever we are looking at
      this.sun.target.position.set(0, 0, zc - 60); this.sun.position.set(-170, 340, zc + 100);
      this.sun.target.updateMatrixWorld();
    }
    // ---------- gestures: pinch / scroll to zoom out over the whole base, drag to look along the road ----------
    attachGestures(el) {
      const pts = new Map();
      let pinch = 0, dragY = null;
      const clampPan = () => {
        const n = this.nLines || 1;
        const back = this.curOff - lineOff(0), ahead = this.curOff - lineOff(n - 1);
        this.panZ = Math.max(-ahead - 200, Math.min(back + 200, this.panZ));
      };
      el.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragY = pts.size === 1 ? e.clientY : null; pinch = 0; this.idleT = 0; });
      el.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.idleT = 0;
        if (pts.size >= 2) {
          const [a, b] = [...pts.values()], dd = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch && dd > 0) this.zoom = Math.max(1, Math.min(ZOOM_MAX, this.zoom * pinch / dd));
          pinch = dd; dragY = null;
        } else if (dragY != null) {
          const dy = e.clientY - dragY; dragY = e.clientY;
          const perPx = this.camD * this.zoom / this.cssH * 1.3;          // ground units per screen pixel, roughly
          this.panZ -= dy * perPx; clampPan();
        }
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) dragY = null; };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('wheel', e => { e.preventDefault(); this.idleT = 0; this.zoom = Math.max(1, Math.min(ZOOM_MAX, this.zoom * Math.exp(e.deltaY * .0015))); }, { passive: false });
    }

    // ---------- scenery: every line of the level along one road ----------
    buildLevel(world) {
      const lvl = world.lvl, level = world.level, key = lvl + ':' + level.name;
      if (key !== this.levelKey) { for (const k in this.groundTex) this.groundTex[k].dispose(); this.groundTex = {}; this.levelKey = key; }
      if (this.lines) { this.scene.remove(this.lines); disposeTree(this.lines); }
      for (const g of this.structs.values()) { this.scene.remove(g); disposeTree(g); }
      this.structs.clear();
      const g = this.lines = new T.Group();
      const cur = world.secIdx, n = this.nLines = level.sections.length;
      const theme = level.theme, TC = THEME_COL[theme] || THEME_COL.sand;
      // wide apron under everything, with woods along both sides of the whole road
      const len = n * LINE_GAP + 9000;
      OFF = 0;
      const apron = new T.Mesh(new T.PlaneGeometry(W + 6000, len), lambert(col(TC.g2)));
      apron.rotation.x = -Math.PI / 2; apron.position.set(0, -.4, lineOff(n - 1) / 2); apron.receiveShadow = true; g.add(apron);
      // distance fades into a haze of the terrain colour instead of ending in a void
      this.scene.fog = new T.Fog(col(TC.g2).lerp(col('#e8e2cc'), .35), 1500, 4200);
      this.renderer.setClearColor(this.scene.fog.color, 1);
      if (theme === 'harbor') {
        const water = new T.Mesh(new T.PlaneGeometry(1400, len), new T.MeshLambertMaterial({ color: 0x4f7f93 }));
        water.rotation.x = -Math.PI / 2; water.position.set(W / 2 + 700, -.2, lineOff(n - 1) / 2); g.add(water);
      }
      const rnd = mulberry32(theme.length * 977 + lvl * 31);
      const treeMat = lambert(col(theme === 'citadel' ? '#4f5a3a' : theme === 'sand' ? '#8a8a4a' : '#5e7a3e')), trunkMat = lambert(col('#6b5236')), rockMat = lambert(col('#b8a37a'));
      const z0 = H / 2 + 260, z1 = lineOff(n - 1) - H / 2 - 700;
      for (let i = 0; i < 70 + n * 34; i++) {
        const side = i % 2 ? 1 : -1, x = side * (W / 2 + 26 + rnd() * 330), z = z1 + rnd() * (z0 - z1);
        if (theme === 'harbor' && side > 0) continue;
        if (theme === 'sand' && rnd() < .6) { const rock = new T.Mesh(lowBall, rockMat); rock.scale.set(14 + rnd() * 26, 8 + rnd() * 14, 14 + rnd() * 26); rock.position.set(x, 2, z); rock.castShadow = true; g.add(rock); continue; }
        const h = 18 + rnd() * 18;
        const cone = new T.Mesh(new T.ConeGeometry(7 + rnd() * 4, h, 6), treeMat); cone.position.set(x, h / 2 + 4, z); cone.castShadow = true; g.add(cone);
        const tr = new T.Mesh(cyl, trunkMat); tr.scale.set(2.4, 6, 2.4); tr.position.set(x, 3, z); g.add(tr);
      }
      // each line: its ground, wall, gate and buildings. Cleared lines are rubble; lines ahead stand intact.
      for (let i = 0; i < n; i++) {
        OFF = lineOff(i);
        const sec = level.sections[i], state = i < cur ? 'past' : i === cur ? 'current' : 'ahead';
        if (!this.groundTex[i]) {
          const t = this.groundTex[i] = new T.CanvasTexture(buildBackground(theme, sec, 1.6, true));
          t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        }
        const ground = new T.Mesh(new T.PlaneGeometry(W, H), lambert(0xffffff, { map: this.groundTex[i] }));
        ground.rotation.x = -Math.PI / 2; ground.position.z = OFF; ground.receiveShadow = true; g.add(ground);
        buildLine(g, sec, theme, state, mulberry32(theme.length * 977 + sec.name.length * 31 + i));
        if (state !== 'current') {
          const L = lineLayout(sec);
          const fake = (key, p, extra) => Object.assign({ x: p.x, y: p.y, r: 7 * (ENEMIES[key].size || 1), def: ENEMIES[key], hp: 1, maxHp: 1 }, extra || {});
          const parts = [fake('gate', L.gate), ...L.barracks.map(b => fake('ebarracks', b, { trains: b.k })), ...L.bunkers.map(b => fake('bunker', b))];
          for (const u of parts) {
            const m = makeStructure(u);
            if (state === 'past') rubble(m);
            g.add(m);
          }
        }
      }
      // our side of the current line: deploy squares decal, sandbag berm, our flag
      OFF = lineOff(cur);
      const bagMat = lambert(col('#c2aa75'));
      for (let x = 4; x < W; x += 11) {
        if (Math.abs(x - W / 2) < 26) continue;
        const b = new T.Mesh(lowBall, bagMat); b.scale.set(11, 6, 8); b.position.set(X(x), 3, Z(BASE_Y)); b.castShadow = true; g.add(b);
      }
      addFlag(g, X(W / 2 + 34), Z(H - 6), 30, C.pRing);
      const dc = document.createElement('canvas'); dc.width = W * 2; dc.height = (DEPLOY_Y1 - DEPLOY_Y0) * 2;
      this.deployCtx = dc.getContext('2d');
      if (this.deployTex) this.deployTex.dispose();
      this.deployTex = new T.CanvasTexture(dc);
      const decal = new T.Mesh(new T.PlaneGeometry(W, DEPLOY_Y1 - DEPLOY_Y0), new T.MeshBasicMaterial({ map: this.deployTex, transparent: true, depthWrite: false }));
      decal.rotation.x = -Math.PI / 2; decal.position.set(0, .35, Z((DEPLOY_Y0 + DEPLOY_Y1) / 2)); decal.renderOrder = 1; g.add(decal);
      this.scene.add(g);
      this.curOff = lineOff(cur);
      this.deployT = 0; this.baseKey = '';
    }
    // our training tents along the bottom (rebuilt when the set of squad types changes), each with a squad-colour pennant
    buildBase(world) {
      const types = world.bldTypes(), key = types.join(',') + '@' + this.curOff;
      if (key === this.baseKey) return;
      this.baseKey = key;
      if (this.base) { this.scene.remove(this.base); disposeTree(this.base); }
      const g = this.base = new T.Group();
      const tentMat = lambert(col('#6c7646')), roofMat = lambert(col('#7f8a54')), doorMat = lambert(col('#2c3020'));
      for (const k of types) {
        const p = world.bldPos(k);
        const body = new T.Mesh(box, tentMat); body.scale.set(36, 12, 20); body.position.set(X(p.x), 6, Z(p.y)); body.castShadow = true; g.add(body);
        const roof = new T.Mesh(prism, roofMat); roof.scale.set(38, 9, 22); roof.position.set(X(p.x), 16.5, Z(p.y)); roof.castShadow = true; g.add(roof);
        const door = new T.Mesh(box, doorMat); door.scale.set(8, 8, 1); door.position.set(X(p.x), 4, Z(p.y) - 10.5); g.add(door);
        const pole = new T.Mesh(cyl, doorMat); pole.scale.set(.9, 14, .9); pole.position.set(X(p.x) + 8, 22, Z(p.y)); g.add(pole);
        const flag = new T.Mesh(box, lambert(HELM[k] || C.olive)); flag.scale.set(10, 6, .6); flag.position.set(X(p.x) + 13, 26, Z(p.y)); g.add(flag);
      }
      this.scene.add(g);
    }
    // the current line's gate, barracks and bunkers follow the live units: darken with damage, rubble when destroyed
    syncStructures(world) {
      const seen = new Set();
      for (const u of world.units) {
        if (!u.alive || !u.def.structure) continue;
        seen.add(u.id);
        let g = this.structs.get(u.id);
        if (!g) { g = makeStructure(u); this.structs.set(u.id, g); this.scene.add(g); }
        const f = Math.max(0, u.hp) / u.maxHp;
        if (g.userData.f !== f || (u.hurt > 0) !== g.userData.hurt) {
          g.userData.f = f; g.userData.hurt = u.hurt > 0;
          g.traverse(o => { if (o.isMesh && o.userData.c0) { o.material.color.copy(o.userData.c0).lerp(C.dead, (1 - f) * .55); if (u.hurt > 0) o.material.color.lerp(C.white, .5); } });
          if (u.def.gate) for (const d of g.userData.doors) d.rotation.y = d.userData.side * (1 - f) * .5;
        }
        if (g.userData.gun) g.userData.gun.rotation.y = -u.face;
        if (f < .5 && Math.random() < (1 - f) * .25) this.ownFx.push({ x: X(u.x + (Math.random() - .5) * u.r), z: Z(u.y), h: u.r * 1.2, life: 2.2, max: 2.2, size: 4 + Math.random() * 4 });
      }
      for (const [id, g] of this.structs) {
        if (seen.has(id)) continue;
        rubble(g);
        this.structs.delete(id);
        this.scene.remove(g);
        (this.lines || this.scene).add(g);
      }
    }

    // ---------- every frame ----------
    render(world, t, view, dt) {
      const key = world.lvl + ':' + world.secIdx + ':' + world.sec.name;
      if (key !== this.lineKey) {
        const sameLevel = !!this.lines && this.levelKey === world.lvl + ':' + world.level.name;
        this.lineKey = key;
        this.buildLevel(world);
        if (!sameLevel) this.camOff = this.curOff;   // a new level starts in place; a new line glides along the road
      }
      OFF = this.curOff;
      this.buildBase(world);
      this.syncStructures(world);
      this.deployT -= dt;
      if (this.deployT <= 0) { this.paintDeploy(world, view, t); this.deployT = .12; }
      this.placeCamera(world, dt);
      this.fillUnits(world, t);
      this.fillFx(world, t, dt);
      this.renderer.render(this.scene, this.camera);
      this.fpsN = (this.fpsN || 0) + 1; this.fpsT = (this.fpsT || 0) + dt;
      if (this.fpsT >= 5) { if (/[?&]fps\b/.test(location.search) || window.BS_FPS) console.info('[fps] ' + (this.fpsN / this.fpsT).toFixed(1) + ' units=' + world.units.length + ' fx=' + world.fx.length + ' zoom=' + this.zoom.toFixed(2)); this.fpsN = 0; this.fpsT = 0; }
    }
    paintDeploy(world, view, t) {
      const c = this.deployCtx;
      c.setTransform(2, 0, 0, 2, 0, -DEPLOY_Y0 * 2);
      c.clearRect(0, DEPLOY_Y0, W, DEPLOY_Y1 - DEPLOY_Y0);
      drawDeploy(c, world, view.open, view.lockCost, t, view.hover);
      this.deployTex.needsUpdate = true;
    }
    fillUnits(world, t) {
      const P = this.P;
      for (const k in P) P[k].begin();
      const sandbag = world.sec.wall === 'sandbag';
      for (const u of world.units) {
        if (!u.alive || u.def.structure) continue;
        if (u.phase === 'retreat' && u.y > H) continue;
        const lift = u.onWall ? (u.tower ? TOWER_H + 1 : sandbag ? 16 : WALL_H + 3) : 0;
        if (u.vehicle) this.vehicle(u, lift);
        else this.soldier(u, lift, t);
      }
      for (const f of world.fx) {   // fallen soldiers lie down and sink into the ground
        if (f.type !== 'dead' || f.vehicle) continue;
        const k = f.life / f.max, s = f.r / 7 * MAN;
        setBase(X(f.x), -1.5 * (1 - k), Z(f.y), -f.face, s);
        TMP.copy(f.team === 'p' ? C.pUniD : C.eUniD).lerp(C.dead, 1 - k);
        P.corpse.add(part(0, 1.4, 0, 10, 2.4, 5), TMP);
      }
      for (const k of ['ring', 'legs', 'body', 'head', 'helm', 'kit', 'shield', 'tube', 'hull', 'corpse']) P[k].end();
    }
    // soldiers face +X. Each squad has its own helmet colour and a distinct kit so they read at a glance.
    soldier(u, lift, t) {
      const P = this.P, team = u.team === 'p', k = u.r / 7 * MAN, key = u.key, hurt = u.hurt > 0;
      const bob = u.moving ? Math.abs(Math.sin(u.walk)) * 1.2 : 0;
      setBase(X(u.x), lift + bob, Z(u.y), -u.face, k);
      if (!u.onWall) P.ring.add(part(0, -bob / k + .2, 0, 13, .4, 13), team ? C.pRing : C.eRing);
      let uni = team ? C.pUni : C.eUni, uniD = team ? C.pUniD : C.eUniD, helm = team ? (HELM[key] || C.olive) : C.eWrap;
      if (!team) { if (key === 'heavy') uni = uniD = helm = C.heavy; else if (key === 'rusher') { uni = C.rusher; helm = C.red; } else if (key === 'esniper') uni = helm = C.ghillie; }
      if (team && key === 'jugg') { uni = C.heavy; uniD = C.heavy; }
      if (hurt) uni = uniD = helm = C.white;
      if (u.phase === 'retreat') { TMP2.copy(uni).lerp(C.white, .4); uni = TMP2; }
      const kneel = key === 'mortar' || ((key === 'sniper' || key === 'esniper') && !u.moving && !u.onWall);
      const dy = kneel ? -2.2 : 0;
      P.legs.add(part(0, 2.6 + dy / 2, 0, 3, 5.2 + dy, 4.4), uniD);
      P.body.add(part(0, 7.6 + dy, 0, 3.8, 6, 5.6), uni);
      P.head.add(part(.3, 12 + dy, 0, 3.7, 3.7, 3.7), hurt ? C.white : C.skin);
      const fire = u.flash > 0, g = C.gun;
      switch (key) {
        case 'shield':   // big riot shield held in front
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.shield.add(part(4.2, 7.5, 0, 1.2, 13, 10), hurt ? C.white : C.shield);
          P.kit.add(part(4.9, 11, 0, .4, 1.4, 6), g);
          break;
        case 'saw':      // heavy belt-fed gun with an ammo box
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.kit.add(part(5.5, 7, 1.8, 11, 2.2, 2.2), g);
          P.kit.add(part(3, 5.6, 2.8, 3, 3, 2), C.olive);
          break;
        case 'rpg': case 'erpg':   // launcher tube over the shoulder with a fat warhead
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.tube.add(part(1, 12.2, 2.8, 2, 13, 2, 0, 0, Math.PI / 2), g);
          P.helm.add(part(8.2, 12.2, 2.8, 3.6, 3, 3), key === 'rpg' ? C.olive : C.eUniD);
          break;
        case 'gren':     // stubby wide launcher, bandolier across the chest
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.tube.add(part(4.5, 7.6, 1.8, 3, 5.5, 3, 0, 0, Math.PI / 2), g);
          P.kit.add(part(1.95, 8, 0, .3, 1.4, 5.7, .7), helm);
          break;
        case 'sniper': case 'esniper':   // very long rifle, ghillie hood
          P.helm.add(part(-.4, 12.6 + dy, 0, 5.6, 4.4, 5.6), team ? helm : C.ghillie);
          P.kit.add(part(6.5, 8.3 + dy, 1.6, 15, 1, 1), g);
          P.kit.add(part(4, 9.4 + dy, 1.6, 3, 1.2, 1.2), g);
          break;
        case 'medic':    // white helmet with a red cross, white backpack
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.kit.add(part(0, 14.5, 0, 3.6, .6, 1.1), C.red); P.kit.add(part(0, 14.5, 0, 1.1, .6, 3.6), C.red);
          P.kit.add(part(-2.8, 8, 0, 2.4, 5, 4.6), C.white); P.kit.add(part(-4.05, 8.4, 0, .2, 1.4, 3), C.red);
          break;
        case 'breacher': // orange demolition pack, short gun
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.kit.add(part(-3, 8.5, 0, 3, 6.5, 5), C.orange);
          P.kit.add(part(3.8, 7, 1.8, 5, 1.1, 1.1), g);
          break;
        case 'mortar':   // kneeling beside a tube on a base plate
          P.helm.add(part(0, 13.3 + dy, 0, 4.8, 2.8, 4.8), helm);
          P.tube.add(part(6.5, 4, 0, 2.6, 10, 2.6, 0, 0, -.65), g);
          P.kit.add(part(8.5, .6, 0, 6, 1, 6), g);
          break;
        case 'jugg':     // bulky bomb suit: shoulder plates and an orange visor
          P.helm.add(part(0, 13.6, 0, 5.4, 4.2, 5.4), helm);
          P.kit.add(part(1.4, 13.4, 0, 3, 1.1, 4), C.orange);
          P.kit.add(part(0, 10.2, 3.3, 3.4, 2.4, 2), uni); P.kit.add(part(0, 10.2, -3.3, 3.4, 2.4, 2), uni);
          P.kit.add(part(5, 7, 2, 7, 1.8, 1.8), g);
          break;
        case 'heavy':    // armoured minigunner: big barrel bundle
          P.helm.add(part(0, 13.6, 0, 5.2, 3.6, 5.2), helm);
          P.tube.add(part(6, 7, 2, 3, 11, 3, 0, 0, Math.PI / 2), g);
          P.kit.add(part(0, 10.2, 3.3, 3.4, 2.4, 2), uni); P.kit.add(part(0, 10.2, -3.3, 3.4, 2.4, 2), uni);
          break;
        case 'rusher':   // red bandana, no helmet, machete
          P.kit.add(part(0, 13, 0, 4, 1.4, 4.2), helm);
          P.kit.add(part(4.5, 8, 2.4, 6, .6, 1.2, 0, 0, fire ? -.8 : .5), C.shield);
          break;
        default:         // riflemen / gunmen
          P.helm.add(part(0, 13.3, 0, 4.8, 2.8, 4.8), helm);
          P.kit.add(part(4.6, 7.4, 1.8, 7.5, 1.2, 1.2), g);
      }
      if (fire && key !== 'medic' && key !== 'rusher' && key !== 'shield') P.boom.add(part(key === 'sniper' || key === 'esniper' ? 14.5 : 11, 7.5 + dy, 1.8, 3, 3, 3), C.boom);
    }
    // vehicles face +X: tanks on treads, pickup technicals with a gun on a post in the bed, Humvees with a roof gun
    vehicle(u, lift) {
      const P = this.P, team = u.team === 'p', k = u.r / 14 * CAR, hurt = u.hurt > 0;
      setBase(X(u.x), lift, Z(u.y), -u.face, k);
      const body = hurt ? C.white : team ? C.pVeh : u.key === 'technical' ? C.tech : C.eVeh;
      P.ring.add(part(0, .2, 0, 36, .4, 30), team ? C.pRing : C.eRing);
      const wheels = (xs, zs, r) => { for (const x of xs) for (const z of zs) P.tube.add(part(x, r, z, r * 2, 2.6, r * 2, Math.PI / 2), C.wheel); };
      if (u.key === 'tank') {
        for (const z of [-8, 8]) P.hull.add(part(0, 3.2, z, 32, 6.4, 5.5), C.track);
        P.hull.add(part(0, 8, 0, 28, 5.5, 15), body);
        P.hull.add(part(-1.5, 13, 0, 15, 5.5, 12), body);
        P.tube.add(part(14, 13.3, 0, 2.4, 20, 2.4, 0, 0, Math.PI / 2), C.gun);
        if (u.flash > 0) P.boom.add(part(25, 13.3, 0, 7, 7, 7), C.boom);
      } else if (u.key === 'technical') {
        wheels([-8, 8], [-7, 7], 3.4);
        P.hull.add(part(0, 6.4, 0, 28, 3.2, 13), body);                 // chassis
        P.hull.add(part(11, 9, 0, 7, 3, 12.4), body);                   // hood
        P.hull.add(part(5, 11.5, 0, 6.5, 7.5, 12.4), body);             // cab
        P.kit.add(part(8.4, 12.5, 0, .6, 4, 10), C.glass);              // windscreen
        for (const z of [-6, 6]) P.hull.add(part(-6, 9.4, z, 13, 2.8, 1), body);   // bed sides
        P.tube.add(part(-4, 13, 0, 1.3, 7, 1.3), C.gun);                // gun post
        P.kit.add(part(1, 16.5, 0, 12, 1.8, 1.8), C.gun);               // .50 cal pointing forward over the cab
        P.kit.add(part(-4, 16, 0, 3, 3, 3), C.gun);
        if (u.flash > 0) P.boom.add(part(8, 16.5, 0, 4.5, 4.5, 4.5), C.boom);
      } else {
        wheels([-8, 8], [-8, 8], 3.8);
        P.hull.add(part(0, 8.2, 0, 27, 7, 17), body);
        P.hull.add(part(-2, 13.5, 0, 14, 4, 15), body);
        P.kit.add(part(5.3, 13.5, 0, .6, 3.4, 13), C.glass);
        P.tube.add(part(-2, 16, 0, 6, 2, 6), C.gun);
        P.kit.add(part(4, 17.4, 0, 11, 1.6, 1.6), C.gun);
        if (u.flash > 0) P.boom.add(part(10, 17.4, 0, 4.5, 4.5, 4.5), C.boom);
      }
    }
    fillFx(world, t, dt) {
      const P = this.P;
      for (const p of world.proj) {
        if (p.type === 'rocket' || p.type === 'cannon') {
          setBase(X(p.x), 8, Z(p.y), -(p.a || 0), 1);
          P.proj.add(part(0, 0, 0, p.type === 'cannon' ? 5 : 7, 1.6, 1.6), p.type === 'cannon' ? C.bullet : C.gun);
          if (p.type === 'rocket') P.boom.add(part(-4.5, 0, 0, 2.6, 2.6, 2.6), C.boom);
        } else {
          const sz = p.type === 'shell' ? 4 : 3;
          setBase(X(p.x), 3 + (p.z || 0), Z(p.y), 0, 1);
          P.shell.add(part(0, 0, 0, sz, sz, sz), C.gun);
        }
      }
      for (const f of world.fx) {
        const k = f.life / f.max;
        if (f.type === 'boom') {
          const r = f.r * (1.15 - k * .6) * 1.6;
          setBase(X(f.x), r * .35, Z(f.y), 0, 1);
          TMP.copy(C.boom).multiplyScalar(k * 1.4);
          P.boom.add(part(0, 0, 0, r, r * .8, r), TMP);
        } else if (f.type === 'puff') {
          const s = f.size * (1.6 - k * .6) * 1.5 * Math.sqrt(k);
          setBase(X(f.x), 3 + (1 - k) * 16, Z(f.y), 0, 1);
          P.smoke.add(part(0, 0, 0, s, s, s), f.c === 'dark' ? C.dark : C.smoke);
        }
      }
      for (const f of this.ownFx) {
        f.life -= dt; const k = Math.max(0, f.life / f.max), s = f.size * (1.8 - k);
        setBase(f.x + Math.sin(t + f.size) * 3, f.h + (1 - k) * 34, f.z, 0, 1);
        P.smoke.add(part(0, 0, 0, s, s, s), C.dark);
      }
      this.ownFx = this.ownFx.filter(f => f.life > 0);
      if (this.ownFx.length > 160) this.ownFx.splice(0, this.ownFx.length - 160);
      P.proj.end(); P.shell.end(); P.boom.end(); P.smoke.end();
      const pos = this.tracers.geometry.attributes.position, colr = this.tracers.geometry.attributes.color;
      let n = 0;
      for (const f of world.fx) {
        if (f.type !== 'tracer' || n >= this.tracerMax) continue;
        const k = f.life / f.max, i = n * 6;
        pos.array[i] = X(f.x1); pos.array[i + 1] = 8; pos.array[i + 2] = Z(f.y1);
        pos.array[i + 3] = X(f.x2); pos.array[i + 4] = 7; pos.array[i + 5] = Z(f.y2);
        const c = f.team === 'p' ? [1, .92, .55] : [1, .55, .4];
        for (let j = 0; j < 2; j++) { colr.array[i + j * 3] = c[0] * k; colr.array[i + j * 3 + 1] = c[1] * k; colr.array[i + j * 3 + 2] = c[2] * k; }
        n++;
      }
      this.tracers.geometry.setDrawRange(0, n * 2); this.tracers.visible = n > 0;
      pos.needsUpdate = true; colr.needsUpdate = true;
    }

    // ---------- 2D overlay: health bars, numbers, small effects ----------
    project(x, y, h) {
      V.set(X(x), h, Z(y)).project(this.camera);
      return { x: (V.x + 1) / 2 * this.cssW, y: (1 - V.y) / 2 * this.cssH, z: V.z };
    }
    ppu(x, y, h) { const a = this.project(x, y, h), b = this.project(x + 10, y, h); return Math.hypot(b.x - a.x, b.y - a.y) / 10; }
    drawOverlay(ctx, world, t) {
      OFF = this.curOff;
      ctx.clearRect(0, 0, this.cssW, this.cssH);
      const far = this.zoom > 2.2;   // zoomed way out: skip the small marks
      for (const u of world.units) {
        if (!u.alive) continue;
        const structure = u.def.structure;
        if (u.hp >= u.maxHp - .5 && !structure) continue;
        if (far && !structure) continue;
        const h = structure ? (u.def.gate ? WALL_H + 14 : u.r * 1.9 + 8) : u.vehicle ? u.r * 1.4 * CAR : (u.onWall ? (u.tower ? TOWER_H : WALL_H) : 0) + 19 * u.r / 7 * MAN;
        const p = this.project(u.x, u.y, h), s = this.ppu(u.x, u.y, h);
        if (p.z > 1) continue;
        const w = (u.def.gate ? 64 : u.def.barracks ? 40 : structure ? 30 : Math.max(12, u.r * 2.2)) * s;
        const bh = Math.max(2.5, (structure ? 3.2 : 2.2) * s);
        const f = Math.max(0, u.hp / u.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, bh + 2);
        ctx.fillStyle = u.team === 'p' ? '#6fd17c' : u.def.gate ? '#ff6a4e' : f > .5 ? '#ffb347' : '#ff5a4e';
        ctx.fillRect(p.x - w / 2, p.y, w * f, bh);
      }
      if (!far) for (const k of world.bldTypes()) {   // our training tents: one progress bar per production line
        const bp = world.bldPos(k), b = world.bld[k] || { jobs: [] };
        const p = this.project(bp.x, bp.y, 24), s = this.ppu(bp.x, bp.y, 24);
        for (let i = 0; i < LINES; i++) {
          const j = b.jobs[i], w = 22 * s, y = p.y - (LINES - i) * 4.5 * s;
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(p.x - w / 2, y, w, 3 * s);
          if (j) { ctx.fillStyle = PAL.hazard; ctx.fillRect(p.x - w / 2, y, w * Math.min(1, j.t / j.dur), 3 * s); }
        }
      }
      if (!far) for (const f of world.fx) {
        const k = f.life / f.max;
        if (f.type === 'slash') {
          const p = this.project(f.x, f.y, 8), s = this.ppu(f.x, f.y, 8);
          ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6 * s, -2.4, -.7); ctx.stroke();
        } else if (f.type === 'heal') {
          const p = this.project(f.x, f.y, 14 + (1 - k) * 10), s = this.ppu(f.x, f.y, 14);
          ctx.globalAlpha = k; ctx.fillStyle = '#58e08a';
          ctx.fillRect(p.x - 1 * s, p.y - 4 * s, 2 * s, 7 * s); ctx.fillRect(p.x - 3.5 * s, p.y - 1.5 * s, 7 * s, 2 * s); ctx.globalAlpha = 1;
        } else if (f.type === 'beam') {
          const a = this.project(f.x1, f.y1, 8), b = this.project(f.x2, f.y2, 8);
          ctx.strokeStyle = `rgba(88,224,138,${k * .6})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        } else if (f.type === 'soul') {
          const p = this.project(f.x, f.y, 12 + (1 - k) * 22), s = this.ppu(f.x, f.y, 12);
          ctx.globalAlpha = k * .7; circ(ctx, p.x, p.y, 2.6 * s, f.team === 'p' ? '#cfe3ff' : '#ffd2c8'); ctx.globalAlpha = 1;
        }
      }
      ctx.textAlign = 'center';
      for (const tx of world.texts) {
        if (far && !tx.big) continue;
        const p = this.project(tx.x, tx.y, 26), s = Math.max(.8, this.ppu(tx.x, tx.y, 26));
        ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
        ctx.font = `800 ${Math.round((tx.big ? 13 : 10) * s * 1.1)}px "Saira Condensed", system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,22,15,.85)'; ctx.strokeText(tx.txt, p.x, p.y);
        ctx.fillStyle = tx.cash ? '#9ff0a8' : PAL.hazard; ctx.fillText(tx.txt, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
    // screen point -> battlefield (x, y) on the current line, for tapping deployment squares
    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width * 2 - 1, ny = -((clientY - rect.top) / rect.height * 2 - 1);
      this.ray.setFromCamera({ x: nx, y: ny }, this.camera);
      const hit = this.ray.ray.intersectPlane(this.ground, V);
      return hit ? { x: hit.x + W / 2, y: hit.z - this.curOff + H / 2 } : null;
    }
  }

  // ---------- one defense line's fixed scenery (wall, gate posts, towers, yard), at the current OFF ----------
  function buildLine(g, sec, theme, state, rnd) {
    const WC = WALL_COL[sec.wall] || WALL_COL.concrete;
    const wallMat = lambert(col(WC.face)), topMat = lambert(col(WC.top));
    const gapHalf = 30, zW = Z(WALL_Y), sandbag = sec.wall === 'sandbag';
    const seg = (x0, x1) => {
      if (x1 - x0 < 1) return;
      const h = sandbag ? 16 : WALL_H;
      const m = new T.Mesh(box, wallMat); m.scale.set(x1 - x0, h, WALL_T); m.position.set(X((x0 + x1) / 2), h / 2, zW);
      m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (sandbag) {
        for (let x = x0 + 5; x < x1 - 3; x += 10) for (let row = 0; row < 3; row++) {
          const b = new T.Mesh(lowBall, row % 2 ? wallMat : topMat); b.scale.set(10, 5.5, WALL_T * .9); b.position.set(X(x + (row % 2) * 5), 3 + row * 5, zW); g.add(b);
        }
      } else {
        const cap = new T.Mesh(box, topMat); cap.scale.set(x1 - x0, 3, WALL_T + 2); cap.position.set(X((x0 + x1) / 2), h + 1.5, zW); g.add(cap);
        for (let x = x0 + 6; x < x1 - 4; x += 16) { const mm = new T.Mesh(box, topMat); mm.scale.set(7, 6, 6); mm.position.set(X(x), h + 5, zW + WALL_T / 2 - 3); mm.castShadow = true; g.add(mm); }
      }
    };
    seg(0, W / 2 - gapHalf); seg(W / 2 + gapHalf, W);
    for (const sx of [-1, 1]) {
      const post = new T.Mesh(box, lambert(col('#4a463e'))); post.scale.set(10, WALL_H + 10, WALL_T + 6);
      post.position.set(X(W / 2) + sx * (gapHalf + 1), (WALL_H + 10) / 2, zW); post.castShadow = true; g.add(post);
    }
    const L = lineLayout(sec);
    for (const tw of L.towers) {
      const tm = lambert(col(state === 'past' ? '#4a4540' : '#6d6253'));
      for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const leg = new T.Mesh(box, tm); leg.scale.set(2.4, TOWER_H, 2.4); leg.position.set(X(tw.x) + dx, TOWER_H / 2, Z(tw.y) + dz); leg.castShadow = true; g.add(leg); }
      if (state === 'past') continue;
      const deck = new T.Mesh(box, lambert(col('#8a7a5f'))); deck.scale.set(18, 3, 18); deck.position.set(X(tw.x), TOWER_H - 1, Z(tw.y)); deck.castShadow = true; g.add(deck);
      const roof = new T.Mesh(prism, lambert(col('#8e3b30'))); roof.scale.set(20, 8, 20); roof.position.set(X(tw.x), TOWER_H + 16, Z(tw.y)); g.add(roof);
    }
    // the yard behind the wall: tents and crates, and the HQ building on HQ lines
    const isHQ = sec.wall === 'hq';
    if (isHQ) {
      const hq = new T.Mesh(box, lambert(col(theme === 'sand' ? '#a38f60' : '#94968d'))); hq.scale.set(110, 34, 50); hq.position.set(0, 17, Z(46)); hq.castShadow = true; g.add(hq);
      const hr = new T.Mesh(box, lambert(col('#6d6f68'))); hr.scale.set(116, 4, 56); hr.position.set(0, 36, Z(46)); g.add(hr);
      const dish = new T.Mesh(lowBall, lambert(col('#d8d8d0'))); dish.scale.set(14, 6, 14); dish.position.set(-36, 42, Z(40)); g.add(dish);
      if (state !== 'past') addFlag(g, X(W / 2 + 46), Z(30), 64, C.eRing);
    } else if (state !== 'past') addFlag(g, X(W / 2 + 70), Z(30), 40, C.eRing);
    for (let i = 0; i < 6; i++) {
      const x = 24 + rnd() * (W - 48), y = 16 + rnd() * 54;
      if (isHQ && Math.abs(x - W / 2) < 70) continue;
      if (rnd() < .55) { const tent = new T.Mesh(prism, lambert(col(theme === 'citadel' ? '#4e4a42' : '#7c7a4e'))); tent.scale.set(26, 13, 20); tent.position.set(X(x), 6.5, Z(y)); tent.castShadow = true; g.add(tent); }
      else { const cr = new T.Mesh(box, lambert(col('#8a6a3e'))); cr.scale.set(10, 10, 10); cr.position.set(X(x), 5, Z(y)); cr.rotation.y = rnd(); cr.castShadow = true; g.add(cr); }
    }
  }
  function addFlag(g, x, z, h, color) {
    const pole = new T.Mesh(cyl, lambert(col('#333333'))); pole.scale.set(1.2, h, 1.2); pole.position.set(x, h / 2, z); g.add(pole);
    const flag = new T.Mesh(box, lambert(color)); flag.scale.set(14, 8, .6); flag.position.set(x + 7, h - 5, z); flag.castShadow = true; g.add(flag);
  }
  // building meshes (materials are per building so damage tinting stays separate)
  function tinted(geo, hex) { const m = new T.Mesh(geo, lambert(col(hex))); m.userData.c0 = col(hex); m.castShadow = true; m.receiveShadow = true; return m; }
  function makeStructure(u) {
    const g = new T.Group(), r = u.r;
    g.position.set(X(u.x), 0, Z(u.y));
    g.userData = { f: 1, doors: [] };
    if (u.def.gate) {
      for (const side of [-1, 1]) {
        const pivot = new T.Group(); pivot.position.set(side * 28, 0, 0); pivot.userData.side = side;
        const door = tinted(box, '#6b5638'); door.scale.set(27, WALL_H + 2, 5); door.position.set(-side * 13.5, (WALL_H + 2) / 2, 0); pivot.add(door);
        for (const y of [6, WALL_H - 4]) { const band = tinted(box, '#4a4740'); band.scale.set(27, 2.2, 5.6); band.position.set(-side * 13.5, y, 0); pivot.add(band); }
        g.add(pivot); g.userData.doors.push(pivot);
      }
      g.position.z = Z(WALL_Y);
    } else if (u.def.barracks) {
      const depot = ENEMIES[u.trains] && ENEMIES[u.trains].vehicle;
      const w = r * 2.2, d = r * 1.5, h = depot ? 15 : 13;
      const body = tinted(box, depot ? '#7d7f74' : '#9a8558'); body.scale.set(w, h, d); body.position.y = h / 2; g.add(body);
      const roof = tinted(prism, '#8e3b30'); roof.scale.set(w + 4, 9, d + 4); roof.position.y = h + 4.5; g.add(roof);
      const door = tinted(box, depot ? '#3c3d37' : '#2b2620'); door.scale.set(depot ? w * .6 : 8, depot ? 11 : 9, 1); door.position.set(0, depot ? 5.5 : 4.5, d / 2 + .5); g.add(door);
      addFlag(g, w / 2 - 2, -d / 2 + 2, h + 18, C.eRing);
    } else {
      const body = tinted(box, '#8f918a'); body.scale.set(r * 2, 11, r * 1.4); body.position.y = 5.5; g.add(body);
      const top = tinted(box, '#a7a9a1'); top.scale.set(r * 2.1, 3, r * 1.5); top.position.y = 12.5; g.add(top);
      const slit = tinted(box, '#1d1e1b'); slit.scale.set(r * 1.3, 2, 1); slit.position.set(0, 8, r * .7 + .3); g.add(slit);
      const gun = new T.Group(); gun.position.set(0, 8, 0);
      const barrel = tinted(cyl, '#23251f'); barrel.scale.set(1.4, r * 1.1, 1.4); barrel.rotation.z = Math.PI / 2; barrel.position.x = r * .55; gun.add(barrel);
      g.add(gun); g.userData.gun = gun;
      for (let i = 0; i < 7; i++) { const a = Math.PI * (.08 + i / 6 * .84); const b = tinted(lowBall, '#b49b67'); b.scale.set(8, 5, 6); b.position.set(Math.cos(a) * r * 1.25, 2.5, Math.sin(a) * r * .95); g.add(b); }
    }
    return g;
  }
  // destroyed: flatten into a dark rubble pile (gate doors simply gone)
  function rubble(g) {
    if (g.userData.doors && g.userData.doors.length) { for (const d of g.userData.doors) d.visible = false; return; }
    g.traverse(o => { if (o.isMesh) { if (o.userData.c0) o.material.color.copy(C.dead); else o.visible = false; } });
    g.scale.y = .25; g.userData.gun = null;
  }
  function disposeTree(g) {
    g.traverse(o => {
      if (!o.isMesh) return;
      if (o.material) o.material.dispose();      // ground textures are cached per level and disposed with it
      if (o.geometry && !SHARED.includes(o.geometry)) o.geometry.dispose();
    });
  }
  function available() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }
  return { Scene3D, available };
})();
