// Builds a building from a design (gen/housegen.js) while the game runs. Same materials as the Blender
// kit, in the same part format (geometry, surface, tinted), so the views that draw kit models draw
// these. Front is -z and the ground floor is y = 0. Everything comes off the design's floor plan: from
// far off the walls are solid with the plan's windows drawn on; up close render/sitereal.js has the
// plan's real walls, and shellOf() gives it only what stands outside them, so the swap doesn't show.
import * as THREE from 'three';
import { designById, designPlan } from '../gen/housegen.js';

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
function windowOn(P, D, x, z, n, y, out, w, h) {
  const ax = n === 'z' ? 0 : out * 0.03, az = n === 'z' ? out * 0.03 : 0, fr = D.trim;
  onWall(P, Math.abs(Math.sin(x * 12.9 + z * 37.7 + y * 5.1)) < 0.5 ? 'winlit' : 'visor', n, x, y, z, w, h, 0.05);   // (some rooms have someone in them after dark)
  for (const dy of [0, h]) onWall(P, fr, n, x + ax, y + dy - 0.03, z + az, w + 0.1, 0.06, 0.06);
  for (const s of [-1, 1]) { const dx = n === 'z' ? s * w / 2 : 0, dz = n === 'z' ? 0 : s * w / 2; onWall(P, fr, n, x + ax + dx, y, z + az + dz, 0.06, h, 0.06); }
  for (let i = 1; i <= D.mullions; i++) { const f = i / (D.mullions + 1) - 0.5, dx = n === 'z' ? f * w : 0, dz = n === 'z' ? 0 : f * w; onWall(P, fr, n, x + ax + dx, y, z + az + dz, 0.035, h, 0.05); }
  onWall(P, D.trim, n, x + ax * 2.5, y - 0.09, z + az * 2.5, w + 0.2, 0.06, 0.15);
}
const shutters = (P, D, x, z, n, y, w, h, out) => { if (D.shutters && w < 1.6 && y > 0.4) for (const s of [-1, 1]) { const off = s * (w / 2 + 0.26), ax = n === 'z' ? 0 : out * 0.05, az = n === 'z' ? out * 0.05 : 0; onWall(P, 'tint', n, x + ax + (n === 'z' ? off : 0), y, z + az + (n === 'z' ? 0 : off), 0.42, h, 0.04); } };
// a part drawing with x and z swapped, for a roof whose ridge runs from the front to the back
const swapped = P => ({ face: (m, pts) => P.face(m, pts.map(([x, y, z]) => [z, y, x]).reverse()), box: (m, cx, y0, cz, w, h, d) => P.box(m, cz, y0, cx, d, h, w) });
function roofOf(P0, D) {
  const P = D.ridgeZ ? swapped(P0) : P0, w = D.ridgeZ ? D.d : D.w, d = D.ridgeZ ? D.w : D.d, { h: y, over, pitch, roof, wall, trim } = D, hw = w / 2, hd = d / 2, rise = hd * pitch;
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
  P.box(hard(trim), 0, y + rise + lift - 0.06, 0, w + 0.5, 0.12, 0.12);
  return y + rise + lift;
}
const hard = m => m === 'rubber' ? 'metal' : m;
// what a building has that stands outside its walls, the same near and far
function outside(P, D, plan) {
  const { w, d, h, floors, storey, wall, base, trim } = D, hw = w / 2, hd = d / 2, dr = plan.doors[plan.entrance], doorX = dr.x - hw, dw = dr.width, dh = dr.height, tr = hard(trim);
  P.box(base, 0, -3.4, 0, w + 0.2, 3.38, d + 0.2);       // the footing, its top just under the floor
  const top = roofOf(P, D);
  for (const s of [-1, 1]) P.box(tr, doorX + s * (dw / 2 + 0.05), 0, -hd - 0.04, 0.1, dh + 0.05, 0.1);
  P.box(tr, doorX, dh, -hd - 0.04, dw + 0.25, 0.1, 0.12);
  if (D.porch) { P.box(tr, doorX, Math.min(2.7, storey - 0.1), -hd - 0.65, dw + 1, 0.09, 1.4); for (const s of [-1, 1]) P.box(tr, doorX + s * (dw / 2 + 0.4), -1.5, -hd - 1.2, 0.09, Math.min(2.7, storey - 0.1) + 1.5, 0.09); }
  for (let k = 1; k < floors; k++) if (D.band) { for (const s of [-1, 1]) { P.box(tr, 0, k * storey - 0.05, s * (hd + 0.02), w + 0.08, 0.1, 0.04); P.box(tr, s * (hw + 0.02), k * storey - 0.05, 0, 0.04, 0.1, d + 0.08); } }
  if (D.corner) for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(tr, sx * hw, 0, sz * hd, 0.14, h, 0.14);
  if (D.chimney) { const m = wall === 'brick' || wall === 'render' ? 'brick' : wall === 'rock' || wall === 'plank' ? 'rock' : 'metal', x = D.chimneyAt * w; P.box(m, x, h, d * 0.12, 0.55, top - h + 0.8, 0.55); P.box('limestone', x, top + 0.8, d * 0.12, 0.65, 0.1, 0.65); }
  // what makes it this kind of building
  if (D.awning) { const aw = Math.min(w - 0.6, dw + 5.5); for (let i = 0; i < 6; i++) P.face(i % 2 ? 'paint' : 'tint', [[-aw / 2 + i * aw / 6, 2.55, -hd - 1.25], [-aw / 2 + (i + 1) * aw / 6, 2.55, -hd - 1.25], [-aw / 2 + (i + 1) * aw / 6, 3.05, -hd - 0.02], [-aw / 2 + i * aw / 6, 3.05, -hd - 0.02]].reverse()); }
  if (D.fascia) { const y = Math.min(dh + 0.3, storey - 0.75); P.box('tint', doorX, y, -hd - 0.06, Math.min(w - 1, dw + 3.4), 0.55, 0.1); P.box(tr, doorX, y - 0.05, -hd - 0.07, Math.min(w - 1, dw + 3.4) + 0.1, 0.05, 0.12); }
  if (D.hanging) { const x = doorX + dw / 2 + 0.8; P.box('metal', x + 0.3, 3.15, -hd - 0.45, 0.05, 0.05, 0.95); P.box('plank', x + 0.3, 2.25, -hd - 0.62, 0.06, 0.85, 0.8); P.box('tint', x + 0.3, 2.42, -hd - 0.62, 0.08, 0.5, 0.56); for (const s of [-0.3, 0.3]) P.box('metal', x + 0.3, 3.08, -hd - 0.62 + s, 0.02, 0.08, 0.02); }
  if (D.badge) { const y = Math.min(dh + 0.35, storey - 0.85); P.box('render', doorX, y, -hd - 0.1, 0.9, 0.7, 0.05); P.box('leaf', doorX, y + 0.27, -hd - 0.13, 0.5, 0.16, 0.03); P.box('leaf', doorX, y + 0.1, -hd - 0.13, 0.16, 0.5, 0.03); }
  if (D.portico) { const pw = Math.min(w - 1, dw + 5), py = Math.min(storey - 0.3, 3.9); P.box(tr, doorX, py, -hd - 1.3, pw + 0.5, 0.3, 2.6); for (let i = 0; i < 4; i++) { const x = doorX - pw / 2 + i * pw / 3; P.box('limestone', x, -1.5, -hd - 2.3, 0.34, py + 1.5, 0.34); } }
  if (D.bell) { const x = w * 0.28; P.box(wall, x, top - 0.6, 0, 1, 1.2, 1); P.box(tr, x, top + 0.6, 0, 1.2, 0.08, 1.2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(tr, x + sx * 0.45, top + 0.68, sz * 0.45, 0.09, 0.8, 0.09); P.box('metal', x, top + 0.86, 0, 0.32, 0.4, 0.32); P.box(tr, x, top + 1.48, 0, 1.3, 0.1, 1.3); }
  if (D.spire) { const sw = Math.min(3.4, w * 0.36), sy = top - 0.5, sh = D.storey * 1.1, z = -hd + sw / 2; P.box(wall, 0, D.h, z, sw, sy - D.h + sh, sw); const a = sy + sh, b = a + sw * 1.5, q = sw / 2 + 0.12;
    P.face(D.roof, [[-q, a, z - q], [0, b, z], [q, a, z - q]]); P.face(D.roof, [[q, a, z + q], [0, b, z], [-q, a, z + q]]); P.face(D.roof, [[q, a, z - q], [0, b, z], [q, a, z + q]]); P.face(D.roof, [[-q, a, z + q], [0, b, z], [-q, a, z - q]]); }
  if (D.flue) { P.box('brick', -hw * 0.5, h - 0.2, d * 0.22, 1.2, top - h + 2.6, 1.2); P.box('metal', -hw * 0.5, top + 2.4, d * 0.22, 0.7, 0.9, 0.7); }
  if (D.balconies) for (const wl of plan.walls) if (wl.exterior && wl.side === 'front' && wl.k > 0) for (const o of wl.openings) if (o.kind === 'window') { const x = (o.a + o.b) / 2 - hw, W = o.b - o.a + 0.6, y = wl.y0; P.box('concrete', x, y - 0.12, -hd - 0.6, W, 0.12, 1.2); P.box(tr, x, y + 0.9, -hd - 1.18, W, 0.05, 0.05); for (let i = 0; i <= 3; i++) P.box(tr, x - W / 2 + i * W / 3, y, -hd - 1.18, 0.04, 0.9, 0.04); }
}
function partsOut(P) {
  const out = [];
  for (const [m, b] of P.by) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); out.push({ geometry: g, surface: m, tinted: m === 'tint' ? 'bright' : m === 'paint' ? 'muted' : false }); }
  return out;
}
// → the parts of one design seen from outside: [{ geometry, surface, tinted }]
export function houseGeometry(D, plan) {
  const P = new Parts(), { w, d, h, wall, trim } = D, hw = w / 2, hd = d / 2, dr = plan.doors[plan.entrance];
  P.box(wall, 0, -0.02, 0, w, h + 0.02, d);
  outside(P, D, plan);
  // the door, shut
  if (dr.kind === 'hangar') P.box('metal', dr.x - hw, 0, -hd - 0.03, dr.width, dr.height, 0.04); else P.box('tint', dr.x - hw, 0, -hd - 0.03, dr.width, dr.height, 0.04);
  // the plan's windows
  for (const wl of plan.walls) if (wl.exterior) for (const o of wl.openings) if (o.kind === 'window') {
    const c = (o.a + o.b) / 2, W = o.b - o.a, H = o.y1 - o.y0, y = wl.y0 + o.y0;
    if (wl.side === 'front') { windowOn(P, D, c - hw, -hd, 'z', y, -1, W, H); shutters(P, D, c - hw, -hd, 'z', y, W, H, -1); }
    else if (wl.side === 'back') { windowOn(P, D, c - hw, hd, 'z', y, 1, W, H); shutters(P, D, c - hw, hd, 'z', y, W, H, 1); }
    else if (wl.side === 'left') { windowOn(P, D, -hw, c - hd, 'x', y, -1, W, H); shutters(P, D, -hw, c - hd, 'x', y, W, H, -1); }
    else { windowOn(P, D, hw, c - hd, 'x', y, 1, W, H); shutters(P, D, hw, c - hd, 'x', y, W, H, 1); }
  }
  return partsOut(P);
}
// → only what stands outside the plan's real walls (the real walls come from render/building-mesh.js)
export function shellOf(D, plan) { const P = new Parts(); outside(P, D, plan); return partsOut(P); }
// one step of the flight up to a door: a stone block, its top at y = 0, sunk into the ground below
export function stepGeometry() { const P = new Parts(); P.box('limestone', 0, -2.2, 0, 1, 2.2, 0.34); return partsOut(P); }
// a lit window from outside: dark glass by day, warm after dark (setWindowGlow, once a frame)
const winlit = new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.12, metalness: 0.7, emissive: 0xffc98a, emissiveIntensity: 0 });
export const setWindowGlow = n => { winlit.emissiveIntensity = n * 1.5; };
// the parts for a design as the kit views want them, built once. `surface` (lib.wornSurface) turns a name into its weathered material.
const made = new WeakMap();
export function buildingParts(planet, k, surface) {
  let m = made.get(planet); if (!m) made.set(planet, m = new Map());
  if (m.has(k)) return m.get(k);
  const geo = k === 'gb_step' ? stepGeometry() : (() => { const D = designById(planet, k); return D ? houseGeometry(D, designPlan(planet, D)) : null; })(); if (!geo) return null;
  const parts = geo.map(p => ({ geometry: p.geometry, material: p.surface === 'winlit' ? winlit : surface(p.surface, p.tinted), matrix: new THREE.Matrix4(), tinted: p.tinted, cast: p.surface !== 'winlit' }));
  m.set(k, parts); return parts;
}
