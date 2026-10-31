// Assembles a whole settlement's geometry: streets, sidewalks, pads, every building
// (shell + interior + furniture), streetlights and door leaves. Static geometry is
// merged per material per 128 m cell so the town costs tens of draw calls, not
// thousands, while frustum culling still works by cell.
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { materials } from './materials.js';
import { buildBuilding } from './building-mesh.js';
import { buildingPlan } from '../gen/building.js';
import { surfaceHeight } from '../gen/surface.js';

export const PLINTH = 0.2;          // ground floor sits this far above the graded ground
const CELL = 128, SIDEWALK = 2.5;

// Building-local → settlement-mesh space (metres, world axes, origin at the town centre).
export function buildingFrame(s, b) {
  const rot = ([u, v]) => [u * s.cos - v * s.sin, 0, u * s.sin + v * s.cos];
  const o = rot(b.O);
  return [[o[0], s.h + PLINTH, o[2]], rot(b.ex), rot(b.ez)];
}

export async function buildSettlementMesh(planet, s, onProgress = () => {}) {
  const M = materials();
  const group = new THREE.Group();
  group.name = 'settlement:' + s.name;
  group.position.set(s.cx, 0, s.cz);
  const cells = new Map();
  const cellFor = (u, v) => { const k = Math.floor(u / CELL) + ',' + Math.floor(v / CELL); if (!cells.has(k)) cells.set(k, new MeshBuilder()); return cells.get(k); };
  const rotFrame = () => [[0, 0, 0], [s.cos, 0, s.sin], [-s.sin, 0, s.cos]];

  // ---- streets (flat plateau: exact heights)
  const gb = new MeshBuilder(); gb.setFrame(...rotFrame());
  const y = s.h;
  const flat = (mat, u0, v0, u1, v1, yy, col = [1, 1, 1]) =>
    gb.quad(mat, [[u0, yy, v1], [u1, yy, v1], [u1, yy, v0], [u0, yy, v0]], [0, 1, 0], [[u0, -v1], [u1, -v1], [u1, -v0], [u0, -v0]], col);
  const nodeRoads = new Map();
  for (const r of s.roads) for (const n of [r.na, r.nb]) (nodeRoads.get(n) || nodeRoads.set(n, []).get(n)).push(r);
  for (const r of s.roads) {
    const hw = r.w / 2, alongU = r.a[1] === r.b[1];
    const lo = Math.min(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]), hi = Math.max(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]);
    const c = alongU ? r.a[1] : r.a[0];
    const yy = y + 0.03 + (r.arterial ? 0.004 : 0);
    if (alongU) flat(M.asphalt, lo - hw, c - hw, hi + hw, c + hw, yy); else flat(M.asphalt, c - hw, lo - hw, c + hw, hi + hw, yy);
    // sidewalks stop at crossing streets
    const perp = n => Math.max(0, ...nodeRoads.get(n).filter(o => (o.a[1] === o.b[1]) !== alongU).map(o => o.w / 2));
    const [nLo, nHi] = (alongU ? r.a[0] : r.a[1]) <= (alongU ? r.b[0] : r.b[1]) ? [r.na, r.nb] : [r.nb, r.na];
    const s0 = lo + perp(nLo), s1 = hi - perp(nHi);
    for (const side of [-1, 1]) {
      const e0 = c + side * hw, e1 = c + side * (hw + SIDEWALK);
      if (alongU) flat(M.pavers, s0, Math.min(e0, e1), s1, Math.max(e0, e1), y + 0.05); else flat(M.pavers, Math.min(e0, e1), s0, Math.max(e0, e1), s1, y + 0.05);
    }
    if (r.arterial) for (let t = lo + 3; t < hi - 3; t += 6) { // centre dashes
      if (alongU) flat(M.marking, t, c - 0.08, t + 3, c + 0.08, yy + 0.003); else flat(M.marking, c - 0.08, t, c + 0.08, t + 3, yy + 0.003);
    }
  }
  // corner squares between sidewalks at junctions
  for (const [n, rs] of nodeRoads) {
    const node = s.nodes[n];
    const hu = Math.max(0, ...rs.filter(r => r.a[1] !== r.b[1]).map(r => r.w / 2));   // roads along v → half-width in u
    const hv = Math.max(0, ...rs.filter(r => r.a[1] === r.b[1]).map(r => r.w / 2));
    if (!hu || !hv) continue;
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const u0 = node.u + su * hu, u1 = node.u + su * (hu + SIDEWALK), v0 = node.v + sv * hv, v1 = node.v + sv * (hv + SIDEWALK);
      flat(M.pavers, Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), y + 0.05);
    }
  }
  // roads out of town drape over the graded profile
  for (const o of s.outRoads) {
    const dir = Math.sign(o.b[0] - o.a[0]), hw = o.w / 2, len = Math.abs(o.b[0] - o.a[0]);
    const pt = (t, side) => { const u = o.a[0] + dir * t, v = side * hw; const [x, z] = s.toWorld(u, v); return [u, surfaceHeight(planet, x, z) + 0.06, v]; };
    for (let t = 0; t < len; t += 4) {
      const a = pt(t, -1), b = pt(t, 1), c2 = pt(t + 4, 1), d2 = pt(t + 4, -1);
      const corners = dir > 0 ? [b, c2, d2, a] : [a, d2, c2, b];
      gb.quad(M.asphalt, corners.map(p => [p[0], p[1], p[2]]), [0, 1, 0], corners.map(p => [p[0], -p[2]]), [1, 1, 1]);
    }
  }
  // building forecourts and landing pads
  for (const b of s.buildings) {
    const r = s.roads[b.road], alongU = r.a[1] === r.b[1];
    const c = alongU ? r.a[1] : r.a[0], edge = c + Math.sign((alongU ? b.O[1] : b.O[0]) - c) * (r.w / 2 + SIDEWALK);
    const [x0, z0, x1, z1] = b.rect, front = alongU ? b.O[1] : b.O[0];
    if (alongU) flat(M.pavers, x0, Math.min(edge, front), x1, Math.max(edge, front), y + 0.045);
    else flat(M.pavers, Math.min(edge, front), z0, Math.max(edge, front), z1, y + 0.045);
  }
  for (const p of s.pads) {
    const [x0, z0, x1, z1] = p.rect;
    gb.box({ py: M.concrete, default: M.concrete }, x0, y - 0.3, z0, x1, y + 0.12, z1, [0.55, 0.56, 0.55], new Set(['ny']));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const [a, b2, c2, d2] of [[x0 + 1, z0 + 1, x1 - 1, z0 + 1.3], [x0 + 1, z1 - 1.3, x1 - 1, z1 - 1], [x0 + 1, z0 + 1, x0 + 1.3, z1 - 1], [x1 - 1.3, z0 + 1, x1 - 1, z1 - 1], [cx - 3, cz - 0.2, cx + 3, cz + 0.2], [cx - 0.2, cz - 3, cx + 0.2, cz + 3]])
      flat(M.marking, a, b2, c2, d2, y + 0.125, [0.95, 0.75, 0.2]);
  }
  group.add(...gb.build({ castShadow: false }));

  // ---- buildings
  const doors = [];
  const t0 = performance.now();
  for (let i = 0; i < s.buildings.length; i++) {
    const b = s.buildings[i];
    const plan = buildingPlan(planet, s, b);
    const cu = (b.rect[0] + b.rect[2]) / 2, cv = (b.rect[1] + b.rect[3]) / 2;
    const frame = buildingFrame(s, b);
    buildBuilding(cellFor(cu, cv), plan, b, frame);
    for (const dr of plan.doors) doors.push({ b, plan, door: dr, frame });
    if (performance.now() - t0 > 12 * (i + 1) / 10) { onProgress(i / s.buildings.length); await new Promise(r => setTimeout(r, 0)); }
  }
  for (const mb of cells.values()) group.add(...mb.build());

  // ---- streetlights (instanced)
  const lamps = [];
  for (const r of s.roads) {
    const alongU = r.a[1] === r.b[1], c = alongU ? r.a[1] : r.a[0];
    const lo = Math.min(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]), hi = Math.max(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]);
    for (let t = lo + 10, side = 1; t < hi - 8; t += 30, side = -side) {
      const off = c + side * (r.w / 2 + 0.6);
      lamps.push(alongU ? [t, off, 0, -side] : [off, t, -side, 0]);
    }
  }
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 6, 8).translate(0, 3, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.4).translate(0, 5.9, 0.7);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.6).translate(0, 5.85, 1.3);
  const poleMesh = new THREE.InstancedMesh(mergeSimple([pole, arm]), M.trim, lamps.length);
  const headMesh = new THREE.InstancedMesh(head, M.lamp, lamps.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  lamps.forEach(([u, v, du, dv], i) => {
    const [x, z] = [u * s.cos - v * s.sin, u * s.sin + v * s.cos];
    const dx = du * s.cos - dv * s.sin, dz = du * s.sin + dv * s.cos;
    q.setFromAxisAngle(up, Math.atan2(dx, dz));
    m4.compose(new THREE.Vector3(x, s.h, z), q, new THREE.Vector3(1, 1, 1));
    poleMesh.setMatrixAt(i, m4); headMesh.setMatrixAt(i, m4);
  });
  poleMesh.castShadow = true;
  // pools of lamplight on the street: additive decals, faded in at night (lamp material
  // intensity drives them via poolMaterial.opacity in main.js)
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, 0.08, 1.3), poolMaterial(), lamps.length);
  for (let i = 0; i < lamps.length; i++) { headMesh.getMatrixAt(i, m4); poolMesh.setMatrixAt(i, m4); }
  poolMesh.renderOrder = 1;
  group.add(poleMesh, headMesh, poolMesh);

  onProgress(1);
  return { group, doors, lamps: lamps.length };
}

let pool = null;
export function poolMaterial() {
  if (pool) return pool;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,214,160,1)'); grd.addColorStop(0.35, 'rgba(255,200,140,0.45)'); grd.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  pool = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
  return pool;
}

function mergeSimple(geos) {
  const pos = [], nrm = [], uv = [], idx = [];
  let base = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0;
    pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
