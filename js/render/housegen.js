// Builds a house from a design (gen/housegen.js) while the game runs. Same materials as the Blender
// kit, in the same part format (geometry, surface, tinted), so the views that draw kit models draw
// these. Front is -z and the ground is y = 0, as in the kit.
import * as THREE from 'three';

class Parts {
  constructor() { this.by = new Map(); }
  into(m) { let b = this.by.get(m); if (!b) this.by.set(m, b = { pos: [], nor: [], uv: [] }); return b; }
  // a flat polygon (convex, outward by winding), planar UVs in metres as the kit does
  face(m, pts) {
    const b = this.into(m), n = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; n.x += (p[1] - q[1]) * (p[2] + q[2]); n.y += (p[2] - q[2]) * (p[0] + q[0]); n.z += (p[0] - q[0]) * (p[1] + q[1]); }   // (Newell: survives a corner that folds to a point)
    n.normalize(); const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : (Math.abs(n.y) > Math.abs(n.z) ? 1 : 2);
    const uv = p => ax === 0 ? [p[2], p[1]] : ax === 2 ? [p[0], p[1]] : [p[0], p[2]];
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) { b.pos.push(...p); b.nor.push(n.x, n.y, n.z); b.uv.push(...uv(p)); }
  }
  // a box, centred on (cx, cz), standing on y0
  box(m, cx, y0, cz, w, h, d) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    this.face(m, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]); this.face(m, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
    this.face(m, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]); this.face(m, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    this.face(m, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]); this.face(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  }
}
// a box on a wall whose normal is along x or z: u runs along the wall
const onWall = (P, m, n, x, y, z, u, h, v) => P.box(m, x, y, z, n === 'z' ? u : v, h, n === 'z' ? v : u);
function windowOn(P, D, x, z, n, y, out) {
  const ax = n === 'z' ? 0 : out * 0.03, az = n === 'z' ? out * 0.03 : 0, w = D.winW, h = D.winH, fr = D.trim;
  onWall(P, 'visor', n, x, y, z, w, h, 0.05);
  for (const dy of [0, h]) onWall(P, fr, n, x + ax, y + dy - 0.03, z + az, w + 0.1, 0.06, 0.06);
  for (const s of [-1, 1]) { const dx = n === 'z' ? s * w / 2 : 0, dz = n === 'z' ? 0 : s * w / 2; onWall(P, fr, n, x + ax + dx, y, z + az + dz, 0.06, h, 0.06); }
  for (let i = 1; i <= D.mullions; i++) { const f = i / (D.mullions + 1) - 0.5, dx = n === 'z' ? f * w : 0, dz = n === 'z' ? 0 : f * w; onWall(P, fr, n, x + ax + dx, y, z + az + dz, 0.035, h, 0.05); }
  onWall(P, D.trim, n, x + ax * 2.5, y - 0.09, z + az * 2.5, w + 0.2, 0.06, 0.15);
  if (D.shutters) for (const s of [-1, 1]) { const off = s * (w / 2 + 0.26), dx = n === 'z' ? off : 0, dz = n === 'z' ? 0 : off; onWall(P, 'tint', n, x + ax + dx, y, z + az + dz, 0.42, h, 0.04); }
}
function roofOf(P, D) {
  const { w, d, h: y, over, pitch, roof, wall, trim } = D, hw = w / 2, hd = d / 2, rise = hd * pitch;
  if (D.shape === 'flat') {
    P.box(roof, 0, y, 0, w + 0.3, 0.2, d + 0.3);
    for (const s of [-1, 1]) { P.box(roof, 0, y + 0.2, s * (hd + 0.07), w + 0.3, 0.35, 0.16); P.box(roof, s * (hw + 0.07), y + 0.2, 0, 0.16, 0.35, d + 0.3); }
    P.box('metal', w * 0.2, y + 0.2, d * 0.1, 0.9, 0.5, 0.7); return y + 0.55;
  }
  if (D.shape === 'hip') {
    const X = hw + over, Z = hd + over, yy = y - over * pitch, top = y + rise, r = Math.max(0, (w - d) / 2);
    P.face(roof, [[-X, yy, -Z], [-r, top, 0], [r, top, 0], [X, yy, -Z]]); P.face(roof, [[X, yy, Z], [r, top, 0], [-r, top, 0], [-X, yy, Z]]);
    P.face(roof, [[X, yy, -Z], [r, top, 0], [X, yy, Z]]); P.face(roof, [[-X, yy, Z], [-r, top, 0], [-X, yy, -Z]]); P.face(roof, [[-X, yy, -Z], [X, yy, -Z], [X, yy, Z], [-X, yy, Z]]);
    return top;
  }
  // gable and vault: a run of slabs across z, the end walls filled in below them
  const n = D.shape === 'vault' ? 6 : 2, X = hw + 0.25, prof = []; const Z = hd + over;
  for (let i = 0; i <= n; i++) { const f = i / n, z = -Z + 2 * Z * f; prof.push([z, D.shape === 'vault' ? y + 4 * rise * f * (1 - f) : y + rise * (1 - Math.abs(z) / hd)]); }
  const t = roof === 'thatch' ? 0.32 : 0.11, lift = t * 0.6;
  for (let i = 0; i < n; i++) { const [z0, a] = prof[i], [z1, b] = prof[i + 1];
    P.face(roof, [[-X, a + lift, z0], [-X, b + lift, z1], [X, b + lift, z1], [X, a + lift, z0]]);                     // the top
    P.face(roof, [[-X, a + lift - t, z0], [X, a + lift - t, z0], [X, b + lift - t, z1], [-X, b + lift - t, z1]]);     // the underside
    for (const sx of [-1, 1]) { const q = sx > 0 ? [[X, a + lift - t, z0], [X, a + lift, z0], [X, b + lift, z1], [X, b + lift - t, z1]] : [[-X, b + lift - t, z1], [-X, b + lift, z1], [-X, a + lift, z0], [-X, a + lift - t, z0]]; P.face(roof, q); }
  }
  for (const s of [-1, 1]) { const x = s * hw, tri = []; for (const [z, yy] of prof) if (Math.abs(z) <= hd + 1e-3) tri.push([x, yy, z]); const ends = [[x, y, -hd], ...tri, [x, y, hd]]; P.face(wall, s > 0 ? ends : ends.slice().reverse()); }
  P.box(trim, 0, y + rise + lift - 0.06, 0, w + 0.5, 0.12, 0.12);
  return y + rise + lift;
}
// → the parts of one design: [{ geometry, material (surface name), tinted }]
export function houseGeometry(D) {
  const P = new Parts(), { w, d, h, floors, storey, bays, sill, wall, base, trim } = D, hw = w / 2, hd = d / 2;
  P.box(base, 0, -3.2, 0, w + 0.2, 3.55, d + 0.2); P.box(wall, 0, 0.3, 0, w, h - 0.3, d);
  const top = roofOf(P, D), doorX = D.door * w;
  // the door
  P.box('tint', doorX, 0.3, -hd - 0.04, 0.95, 2.05, 0.05);
  for (const s of [-1, 1]) P.box(trim, doorX + s * 0.53, 0.3, -hd - 0.04, 0.1, 2.1, 0.1);
  P.box(trim, doorX, 2.35, -hd - 0.04, 1.2, 0.1, 0.12); P.box(base, doorX, 0, -hd - 0.35, 1.45, 0.3, 0.7); P.box('metal', doorX + 0.36, 1.25, -hd - 0.08, 0.05, 0.05, 0.05);
  if (D.porch) { P.box(trim === 'rubber' ? 'metal' : trim, doorX, 2.5, -hd - 0.65, 1.9, 0.09, 1.4); for (const s of [-1, 1]) P.box(trim === 'rubber' ? 'metal' : trim, doorX + s * 0.85, 0, -hd - 1.2, 0.09, 2.5, 0.09); }
  // windows, floor by floor
  for (let k = 0; k < floors; k++) {
    const y = sill + k * storey;
    for (let i = 0; i < bays; i++) { const x = -hw + (i + 0.5) * w / bays;
      if (!(k === 0 && Math.abs(x - doorX) < D.winW / 2 + 0.75)) windowOn(P, D, x, -hd, 'z', y, -1);
      windowOn(P, D, x, hd, 'z', y, 1); }
    for (const s of [-1, 1]) windowOn(P, D, s * hw, 0, 'x', y, s);
    if (k && D.band) P.box(trim, 0, k * storey - 0.05, 0, w + 0.08, 0.1, d + 0.08);
  }
  if (D.corner) for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(trim, sx * hw, 0.3, sz * hd, 0.14, h - 0.3, 0.14);
  if (D.chimney) { const m = wall === 'brick' || wall === 'render' ? 'brick' : wall === 'rock' || wall === 'plank' ? 'rock' : 'metal', x = D.chimneyAt * w; P.box(m, x, h - 0.4, d * 0.12, 0.55, top - h + 1.2, 0.55); P.box('stone', x, top + 0.8, d * 0.12, 0.65, 0.1, 0.65); }
  const out = [];
  for (const [m, b] of P.by) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); out.push({ geometry: g, surface: m, tinted: m === 'tint' ? 'bright' : m === 'paint' ? 'muted' : false }); }
  return out;
}
// the parts for a design as the kit views want them, built once. `surface` (lib.wornSurface) turns a name into its weathered material.
const made = new WeakMap();
export function housePartsOf(designs, k, surface) {
  let m = made.get(designs); if (!m) made.set(designs, m = new Map());
  if (m.has(k)) return m.get(k);
  const D = designs.find(q => q.id === k); if (!D) return null;
  const parts = houseGeometry(D).map(p => ({ geometry: p.geometry, material: surface(p.surface, p.tinted), matrix: new THREE.Matrix4(), tinted: p.tinted, cast: true }));
  m.set(k, parts); return parts;
}
