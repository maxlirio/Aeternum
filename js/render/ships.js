// Draws ships: each model's hull and boarding ramp from the asset library, placed by the
// ship's logical frame (landed) or its flight state (centre, heading, pitch, roll). Models
// are built in their ship frame, so they need no fitting; a ramp swings about its hinge.
import { share } from './share.js';
import * as THREE from 'three';
import { shipPlan, LAYOUTS } from '../gen/ships.js';
// Liveries: deep paints, because a ship in full sun is bright already. Oxblood, signal orange, navy, ivory, gunmetal, forest, teal.
const LIVERY = [[0.3, 0.045, 0.04], [0.62, 0.22, 0.035], [0.035, 0.09, 0.22], [0.5, 0.48, 0.42], [0.055, 0.06, 0.07], [0.05, 0.16, 0.09], [0.03, 0.2, 0.22]];

const MAX = 10;
// Where each landing leg meets the hull: at each of the four points the ship stands on (player/flight.js feet), look straight up for the lowest
// hull above it; where there's none (the hull curves in), step in toward the keel until there is. { x, z: the foot; ax: where it attaches; top: the
// hull's height there; flat: whether the underside there is flat enough for bay doors }
function gearSpots(M) {
  const L = M.L, pts = [[L.W / 2 + L.W * 0.3, L.D / 2 + L.D * 0.32], [L.W / 2 - L.W * 0.3, L.D / 2 + L.D * 0.32], [L.W / 2 + L.W * 0.3, L.D / 2 - L.D * 0.32], [L.W / 2 - L.W * 0.3, L.D / 2 - L.D * 0.32]];
  const tris = []; for (const pr of M.hullPrims) { if (pr.slot === 'glow' || /glass|visor/.test(pr.slot || '')) continue; const P = pr.geometry.attributes.position, I = pr.geometry.index, n = I ? I.count : P.count; for (let k = 0; k < n; k += 3) { const a = I ? I.getX(k) : k, b = I ? I.getX(k + 1) : k + 1, c = I ? I.getX(k + 2) : k + 2; tris.push([P.getX(a), P.getY(a), P.getZ(a), P.getX(b), P.getY(b), P.getZ(b), P.getX(c), P.getY(c), P.getZ(c)]); } }
  const up = (x, z) => { let best = null; for (const t of tris) { const [ax, ay, az, bx, by, bz, cx, cy, cz] = t; const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue; const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue; const y = l1 * ay + l2 * by + l3 * cy; if (y < 0.15) continue; if (!best || y < best.y) { const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az, nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; best = { y, flat: Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) > 0.9 }; } } return best; };
  return pts.map(([x, z]) => { for (let k = 0; k <= 20; k++) { const ax = x + (L.W / 2 - x) * k / 20, h = up(ax, z); if (h) return { x, z, ax, top: h.y, flat: h.flat }; } return { x, z, ax: x, top: 0 }; });
}
export class ShipView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'ships';
    const find = k => lib ? [...lib.variants.values()].find(v => v.kind === k) : null;
    const mk = prims => prims.map(pr => {
      const im = new THREE.InstancedMesh(share(pr.geometry), pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    this.models = {};
    for (const model of Object.keys(LAYOUTS)) {
      if (model.endsWith('_decks')) continue;      // (the fleet's insides come with the fleet's own model: render/capital.js)
      const L = shipPlan(model).layout, hull = find(model), ramp = find(model + '_ramp');
      const box = (w, h, d, x, y, z) => [{ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material: new THREE.MeshStandardMaterial({ color: 0xaaaaaa }), tinted: true }];
      const [hx0, hz0, hx1, hz1] = L.hull;
      const hinge = new THREE.Vector3((L.ramp.x0 + L.ramp.x1) / 2, L.deck, L.ramp.z1);
      const down = new THREE.Vector3(0, -L.deck, L.ramp.z0 - L.ramp.z1).normalize();
      this.models[model] = {
        L, hinge, raise: new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, 1, 0)),
        hullPrims: hull ? hull.prims : [],
        hull: mk(hull ? hull.prims : box(hx1 - hx0 + 0.6, L.ceiling - L.deck + 1, hz1 - hz0, (hx0 + hx1) / 2, (L.deck + L.ceiling) / 2, (hz0 + hz1) / 2)),
        ramp: mk(ramp ? ramp.prims : box(L.ramp.x1 - L.ramp.x0, 0.1, L.ramp.z1 - L.ramp.z0, hinge.x, L.deck / 2, (L.ramp.z0 + L.ramp.z1) / 2)),
      };
    }
    // landing gear, made of its parts and drawn here so it can move: a leg at each of the four points the ship stands on (player/flight.js
    // feet), its strut down from inside the hull, a polished piston, a torque link, a foot; bay doors that swing open for it
    const gm = (c, r, mt) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const GP = { strut: [new THREE.CylinderGeometry(0.1, 0.12, 1, 12).translate(0, -0.5, 0), gm(0x2a2c30, 0.55, 0.6)], piston: [new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12).translate(0, -0.79, 0), gm(0xd8dade, 0.15, 1)],
      link: [new THREE.BoxGeometry(0.035, 0.36, 0.05).rotateX(0.5).translate(0, -0.72, 0.09), gm(0x55585e, 0.4, 0.8)], foot: [new THREE.CylinderGeometry(0.2, 0.26, 0.09, 18).translate(0, 0.045, 0), gm(0x1c1d20, 0.7, 0.4)],
      door: [new THREE.BoxGeometry(0.34, 0.025, 0.8).translate(0.17, 0, 0), gm(0x3a3c40, 0.5, 0.5)] };
    this.gearParts = Object.fromEntries(Object.entries(GP).map(([k, [g, m]]) => { const im = new THREE.InstancedMesh(g, m, 512); im.count = 0; im.frustumCulled = false; im.castShadow = true; this.group.add(im); return [k, im]; }));
    for (const M of Object.values(this.models)) Object.defineProperty(M, 'gear', { get() { return this._gear ||= gearSpots(this); }, configurable: true });     // (worked out the first time the ship is drawn)
    this.gearAnim = new Map();   // ship id → how far its gear is down, 0..1
    this.anim = new Map();      // ship id → ramp openness 0..1
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  // list: [{ id, model, c (render space ground point under the centre), facing, pitch?, roll?, colour, rampDown }]
  putGear(k, m) { const im = this.gearParts[k], i = this.gearN[im.uuid] = (this.gearN[im.uuid] || 0); if (i >= 512) return; im.setMatrixAt(i, m); this.gearN[im.uuid]++; }
  gearOf(id) { return this.gearAnim.get(id); }
  update(list, dt) {
    const n = {}; this.gearN = {}; this.gearSeen = new Set(); this.cockSeen = false;
    for (const s of list) {
      const M = this.models[s.model || 'shuttle']; if (!M || this.hidden?.(s)) continue;
      if (this.cock?.id === s.id) { this.drawCockpit(M, s); continue; }       // (the ship you're flying, seen from its seat: drawn on its own, cut open ahead of you behind a windscreen) if (this.viewer && Math.hypot(s.c[0] - this.viewer[0], s.c[2] - this.viewer[2]) > 2400) continue;     // (too far to see)
      const i = n[s.model || 'shuttle'] = (n[s.model || 'shuttle'] ?? 0); if (i >= MAX) continue;
      const { W, D } = M.L;
      this._e.set(-(s.pitch || 0), s.facing, s.roll || 0);
      this._m.compose(new THREE.Vector3(...s.c), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-W / 2, 0, -D / 2));
      const col = LIVERY[(((s.colour | 0) % LIVERY.length) + LIVERY.length) % LIVERY.length];     // (whatever a ship's record says, drawing it must not stop the game)
      this._c.setRGB(col[0], col[1], col[2]);
      for (const { im, tinted } of M.hull) { im.setMatrixAt(i, this._m); if (tinted) im.setColorAt(i, this._c); }
      let a = this.anim.get(s.id) ?? (s.rampDown ? 1 : 0);
      a += Math.max(-dt / 2.5, Math.min(dt / 2.5, (s.rampDown ? 1 : 0) - a)); this.anim.set(s.id, a);
      const q = new THREE.Quaternion().slerp(M.raise, 1 - a), h = M.hinge;
      this._r.copy(this._m).multiply(new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));
      for (const { im, tinted } of M.ramp) { im.setMatrixAt(i, this._r); if (tinted) im.setColorAt(i, this._c); }
      n[s.model || 'shuttle']++;
      // the gear: down on the ground, or when it's been asked for; up and stowed in the hull otherwise
      let g = this.gearAnim.get(s.id) ?? (s.gear ?? 1); g += Math.max(-dt / 2.2, Math.min(dt / 2.2, (s.gear ?? 1) - g)); this.gearAnim.set(s.id, g); this.gearSeen.add(s.id);
      const legT = Math.min(1, g * 1.35), doorT = Math.min(1, g * 3, (1 - g) * 6 + (g > 0.98 ? 0.75 : 0));      // (the doors open first, the leg swings down; closed again once it's stowed)
      for (const G of M.gear || []) {
        // the leg hangs from where it meets the hull (found by looking straight up from the foot, or in toward the keel where the hull curves away)
        // down to its foot, angled if it has to; folding, it swings up into the hull toward the middle of the ship
        if (G.top < 0.3) continue; const fold = (1 - legT) * Math.PI / 2, dx = G.x - G.ax, dy = -G.top, L = Math.hypot(dx, dy), splay = Math.atan2(dx, -dy), len = (L + 0.3) * (0.62 + 0.38 * legT);
        if (g > 0.01) {
          const base = this._m.clone().multiply(new THREE.Matrix4().makeTranslation(G.ax, G.top + 0.3, G.z)).multiply(new THREE.Matrix4().makeRotationX(G.z > M.L.D / 2 ? fold : -fold)).multiply(new THREE.Matrix4().makeRotationZ(splay * legT));
          const S = base.clone().multiply(new THREE.Matrix4().makeScale(1, len, 1));
          this.putGear('strut', S); this.putGear('piston', S); this.putGear('link', S); this.putGear('foot', base.clone().multiply(new THREE.Matrix4().makeTranslation(0, -len, 0)).multiply(new THREE.Matrix4().makeRotationZ(-splay * legT)));
        }
        if (G.flat) for (const sx of [-1, 1]) this.putGear('door', this._m.clone().multiply(new THREE.Matrix4().makeTranslation(G.ax + sx * 0.34, G.top - 0.01, G.z)).multiply(new THREE.Matrix4().makeRotationZ(sx > 0 ? Math.PI + doorT * 1.35 : -doorT * 1.35)));
      }
    }
    if (!this.cockSeen) this.endCockpit();
    for (const im of Object.values(this.gearParts)) { im.count = this.gearN[im.uuid] || 0; im.instanceMatrix.needsUpdate = true; }
    for (const id of [...this.gearAnim.keys()]) if (!this.gearSeen.has(id)) this.gearAnim.delete(id);
    for (const [model, M] of Object.entries(this.models)) for (const { im, tinted } of [...M.hull, ...M.ramp]) {
      im.count = n[model] || 0; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  rampOpen(id) { return (this.anim.get(id) ?? 1) > 0.98; }
  // The pilot's view (main.js cockpit view): whatever of the hull stands ahead of your eye is cut away, and a windscreen stands there instead,
  // a bubble of glass in its frame with the console under it, so every ship sees forward. cock: { id, eye: [x, y, z] in the ship's layout frame } or null.
  drawCockpit(M, s) {
    if (!this.cockG) { this.cockG = new THREE.Group(); this.cockG.matrixAutoUpdate = false; this.group.add(this.cockG); this.cockPlane = new THREE.Plane(); this.cockFor = null; }
    const col = LIVERY[(((s.colour | 0) % LIVERY.length) + LIVERY.length) % LIVERY.length]; this._c.setRGB(col[0], col[1], col[2]);
    const key = (s.model || 'shuttle') + '|' + this.cock.eye.join(',') + '|' + (s.colour | 0);
    if (this.cockFor !== key) {
      this.cockG.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); this.cockG.clear(); this.cockFor = key;
      for (const { im, tinted } of [...M.hull, ...M.ramp]) { const m = im.material.clone(); m.clippingPlanes = [this.cockPlane]; m.clipShadows = true; if (tinted) { m.color = m.color.clone().multiply(this._c); } const me = new THREE.Mesh(im.geometry, m); me.frustumCulled = false; me.receiveShadow = true; this.cockG.add(me); }
      for (const me of windscreen(this.cock.eye)) this.cockG.add(me);
    }
    this._e.set(-(s.pitch || 0), s.facing, s.roll || 0);
    this._m.compose(new THREE.Vector3(...s.c), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-M.L.W / 2, 0, -M.L.D / 2));
    this.cockG.matrix.copy(this._m); this.cockG.matrixWorldNeedsUpdate = true;
    // keep what's behind a plane just ahead of the eye: n·p + c >= 0 with n pointing back along the ship
    const E = this.cock.eye, P0 = new THREE.Vector3(E[0], E[1], E[2] + 0.06), W = this.group.matrixWorld.clone().multiply(this._m); P0.applyMatrix4(W);
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(W); this.cockPlane.set(fwd.clone().negate(), fwd.dot(P0));
    this.cockG.visible = true; this.cockSeen = true;
  }
  endCockpit() { if (this.cockG) this.cockG.visible = false; }
}

// the windscreen round the pilot's eye E (layout frame, looking +z): a bubble of glass across the forward view, its frame — sill, header, two
// pillars, a centre post — and the console under it with its screens lit
const glassMat = Object.assign(new THREE.MeshStandardMaterial({ color: 0xb8d6e6, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }), { userData: { lit: false } });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.45, metalness: 0.7 }), dashMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.3 });
const screenMat = new THREE.MeshStandardMaterial({ color: 0x08141a, emissive: 0x3aa6c8, emissiveIntensity: 0.9, roughness: 0.25 });
function windscreen(E) {
  const R = 1.05, at = (th, ph, r = R) => new THREE.Vector3(E[0] + Math.sin(th) * Math.cos(ph) * r, E[1] + Math.sin(ph) * r, E[2] + Math.cos(th) * Math.cos(ph) * r);
  const T0 = -1.45, T1 = 1.45, P0 = -0.42, P1 = 0.95, nu = 40, nv = 20, pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = at(T0 + (T1 - T0) * i / nu, P0 + (P1 - P0) * j / nv); pos.push(p.x, p.y, p.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const out = [Object.assign(new THREE.Mesh(g, glassMat), { renderOrder: 2 })];
  // the frame: a slim sill and header along the bubble, pillars out at the corners
  const bar = (pts, r) => { const c = new THREE.CatmullRomCurve3(pts), tg = new THREE.TubeGeometry(c, Math.max(8, pts.length * 3), r, 8, false); return new THREE.Mesh(tg, frameMat); };
  const along = (f, n = 24) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
  out.push(bar(along(t => at(T0 + (T1 - T0) * t, P0, R + 0.01)), 0.022), bar(along(t => at(T0 + (T1 - T0) * t, P1, R + 0.01)), 0.02));
  for (const th of [T0, -1.08, 1.08, T1]) out.push(bar(along(t => at(th, P0 + (P1 - P0) * t, R + 0.01), 16), 0.018));
  // the console: a shelf round under the glass, its face dropping to the floor, small displays set in it facing you
  const sy = E[1] + Math.sin(P0) * R, r0 = 0.52, r1 = Math.cos(P0) * R + 0.02, sp = [], si = [], N = 40;
  for (let i = 0; i <= N; i++) { const th = T0 + (T1 - T0) * i / N, c = Math.cos(th), sn = Math.sin(th); for (const [r, y] of [[r1, sy], [r0, sy], [r0, sy - 0.75]]) sp.push(E[0] + sn * r, y, E[2] + c * r); }
  for (let i = 0; i < N; i++) { const a = i * 3; for (const k of [0, 1]) si.push(a + k, a + 3 + k, a + 1 + k, a + 1 + k, a + 3 + k, a + 4 + k); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals(); out.push(new THREE.Mesh(sg, Object.assign(dashMat, { side: THREE.DoubleSide })));
  const COLS = [0x3aa6c8, 0x7ad08a, 0xd0a040, 0x3aa6c8, 0xc86a4a, 0x3aa6c8];
  for (let k = 0; k < 6; k++) { const th = -0.75 + k * 0.3, r = (r0 + r1) / 2 + 0.02, p = new THREE.Vector3(E[0] + Math.sin(th) * r, sy + 0.012, E[2] + Math.cos(th) * r);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(k % 2 ? 0.16 : 0.12, 0.08), screenOf(k, COLS[k])); sc.position.copy(p); sc.rotation.order = 'YXZ'; sc.rotation.set(-1.05, th + Math.PI, 0); out.push(sc); }
  for (const m of out) { m.frustumCulled = false; m.userData.own = true; }
  return out;
}
// the column of figures: what the ship is doing now, in the console's amber
let figures = null;
function drawFigures(lines) {
  const F = figures; if (!F || (F.lines && F.lines.join() === lines.join())) return; F.lines = lines; const g = F.g;
  g.globalAlpha = 1; g.fillStyle = '#03070a'; g.fillRect(0, 0, 128, 64); g.fillStyle = F.hex; g.globalAlpha = 0.9; g.font = '9px monospace';
  lines.forEach((l, i) => g.fillText(l, 8, 11 + i * 9.5)); if (F.t) F.t.needsUpdate = true;
}
export function cockpitReadout(lines) { drawFigures(lines); }
// a display's picture: a readout drawn once — a horizon, a radar sweep, a column of figures, a bar graph — in its colour on black
const screens = new Map();
function screenOf(k, col) {
  const key = k % 4 + ':' + col; if (screens.has(key)) return screens.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), hex = '#' + col.toString(16).padStart(6, '0');
  g.fillStyle = '#03070a'; g.fillRect(0, 0, 128, 64); g.strokeStyle = hex; g.fillStyle = hex; g.lineWidth = 1.5; g.globalAlpha = 0.9;
  if (k % 4 === 0) { g.beginPath(); g.moveTo(0, 36); g.lineTo(128, 28); g.stroke(); for (let i = 1; i < 5; i++) { g.globalAlpha = 0.4; g.beginPath(); g.moveTo(44, 32 - i * 7); g.lineTo(84, 32 - i * 7); g.stroke(); } g.globalAlpha = 0.9; g.strokeRect(58, 28, 12, 6); }
  else if (k % 4 === 1) { for (const r of [10, 20, 30]) { g.beginPath(); g.arc(64, 32, r, 0, 6.283); g.globalAlpha = 0.4; g.stroke(); } g.globalAlpha = 0.9; g.beginPath(); g.moveTo(64, 32); g.lineTo(90, 14); g.stroke(); for (const [x, y] of [[50, 20], [80, 40], [70, 18]]) g.fillRect(x, y, 3, 3); }
  else if (k % 4 === 2) figures = { g, hex, t: null, lines: null };      // (the flight's own figures, written in by readout() as they change)
  else for (let i = 0; i < 9; i++) { const h = 8 + ((i * 37) % 40); g.fillRect(8 + i * 13, 58 - h, 8, h); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (k % 4 === 2) { figures.t = t; drawFigures(['ALT ----', 'SPD ----', 'HDG ---', 'THR ---', 'LIFT ---']); }
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.3 }); screens.set(key, m); return m;
}

