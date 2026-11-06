// Assembles a whole settlement's geometry: streets, sidewalks, pads, every building
// (shell + interior + furniture), streetlights and door leaves. Static geometry is
// merged per material per 128 m cell so the town costs tens of draw calls, not
// thousands, while frustum culling still works by cell.
import { share } from './share.js';
import { outRoutes } from '../gen/highways.js';
import { linksOfTown } from '../gen/network.js';
import { ladderOf } from '../gen/climb.js';
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { materials } from './materials.js';
import { buildBuilding, facadeOf } from './building-mesh.js';
import { buildingPlan } from '../gen/building.js';
import { surfaceHeight } from '../gen/surface.js';

import { PLINTH } from '../core/units.js';
export { PLINTH };
const CELL = 128, SIDEWALK = 2.5;

// Building-local → settlement-mesh space (metres, world axes, origin at the town centre).
export function buildingFrame(s, b) {
  const rot = ([u, v]) => [u * s.cos - v * s.sin, 0, u * s.sin + v * s.cos];
  const o = rot(b.O);
  return [[o[0], s.h + PLINTH, o[2]], rot(b.ex), rot(b.ez)];
}

// Streets, pavements, pads and the roads out of town, in the town's own space. Cheap enough to stand for a town seen from far off.
export function buildStreets(planet, s) {
  const M = materials();
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
  // roads out of town: a ribbon along each routed centreline, draped over the graded ground
  linksOfTown(planet, s);     // (settles which of them run on to another town)
  for (const r of outRoutes(planet, s)) {
    const hw = r.w / 2, P = r.pts;
    const edge = i => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      return [-1, 1].map(side => { const x = P[i][0] + nx * side * hw, z = P[i][1] + nz * side * hw, [u, v] = s.toLocal(x, z); return [u, r.bridges.some(B => i >= B.i0 - 1 && i <= B.i1 + 1) ? r.h[i] + 0.03 : surfaceHeight(planet, x, z) + 0.12, v]; });     // (over a bridge it's on the deck, not down in the gorge)
    };
    let prev = edge(0), along = 0;
    for (let i = 1; i < P.length - (r.joined ? 0 : 6); i++) {
      const cur = edge(i), next = along + 4;
      const quad = [prev[0], prev[1], cur[1], cur[0]];
      // wind each quad upward whichever way the road turns
      const [p0, p1, p2] = quad, cross = (p1[0] - p0[0]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[0] - p0[0]);
      const q = cross < 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
      gb.quad(M.asphalt, q, [0, 1, 0], q.map(p => [p[0], -p[2]]), [1, 1, 1]);
      prev = cur; along = next;
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
  return gb.build({ castShadow: false });
}

// Each building as a plain block in its own colours: a town from a long way off, standing in until the real one's built.
export function buildBlocks(planet, s) {
  const M = materials(), mb = new MeshBuilder();
  for (const b of s.buildings) {
    const plan = buildingPlan(planet, s, b), { mat, col } = facadeOf(b, M);
    mb.setFrame(...buildingFrame(s, b));
    mb.box({ default: mat, py: M.concrete }, 0.25, -0.5, 0.25, b.w - 0.25, plan.F * plan.H - 0.1, b.d - 0.25, col, new Set(['ny']));
  }
  return mb.build();
}

// Options: streets (false: only what stands on them), slice (ms: give each frame back after this long, for a town built while you play), into (the group's put in the world as it fills).
export async function buildSettlementMesh(planet, s, onProgress = () => {}, propView = null, { streets = true, slice = 0, into = null } = {}) {
  const M = materials();
  const group = new THREE.Group();
  group.name = 'settlement:' + s.name;
  group.position.set(s.cx, 0, s.cz);
  into?.add(group);
  const cells = new Map();
  const cellFor = (u, v) => { const k = Math.floor(u / CELL) + ',' + Math.floor(v / CELL); if (!cells.has(k)) { const mb = new MeshBuilder(); if (propView) mb.propSink = (pr, fr, len, dep, rng) => propView.add(pr, fr, len, dep, rng); cells.set(k, mb); } return cells.get(k); };
  let lastBreath = performance.now();
  const breathe = () => new Promise(r => { const done = () => { lastBreath = performance.now(); r(); }; requestAnimationFrame(done); setTimeout(done, 200); });
  if (streets) group.add(...buildStreets(planet, s));

  // ---- buildings
  const doors = [];
  const t0 = performance.now();
  for (let i = 0; i < s.buildings.length; i++) {
    const b = s.buildings[i];
    const plan = buildingPlan(planet, s, b);
    const cu = (b.rect[0] + b.rect[2]) / 2, cv = (b.rect[1] + b.rect[3]) / 2;
    const frame = buildingFrame(s, b);
    buildBuilding(cellFor(cu, cv), plan, b, frame);
    const lad = ladderOf(planet, s, b);
    if (lad) ladderMesh(cellFor(cu, cv), lad, frame, M);
    for (const dr of plan.doors) doors.push({ b, plan, door: dr, frame });
    if (slice) { if (performance.now() - lastBreath > slice) await breathe(); }
    else if (performance.now() - t0 > 12 * (i + 1) / 10) { onProgress(i / s.buildings.length); await new Promise(r => setTimeout(r, 0)); }
  }
  for (const mb of cells.values()) { group.add(...mb.build()); if (slice) await breathe(); }     // (a block at a time: each goes up to the graphics card as it's drawn)
  if (propView) group.add(propView.build());

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
  // the street light model from the asset library when it's there: its lens takes the night-lit lamp material
  const model = propView && [...propView.lib.variants.values()].find(v => v.kind === 'streetlamp');
  const lampParts = model ? model.prims.map(pr => { const im = new THREE.InstancedMesh(pr.geometry.clone().translate(-0.3, 0, -0.3), pr.slot === 'glow' ? M.lamp : pr.material, lamps.length); im.castShadow = pr.slot !== 'glow'; return im; }) : [];
  const poleMesh = new THREE.InstancedMesh(mergeSimple([pole, arm]), M.trim, lamps.length);
  const headMesh = new THREE.InstancedMesh(head, M.lamp, lamps.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  lamps.forEach(([u, v, du, dv], i) => {
    const [x, z] = [u * s.cos - v * s.sin, u * s.sin + v * s.cos];
    const dx = du * s.cos - dv * s.sin, dz = du * s.sin + dv * s.cos;
    q.setFromAxisAngle(up, Math.atan2(dx, dz));
    m4.compose(new THREE.Vector3(x, s.h, z), q, new THREE.Vector3(1, 1, 1));
    poleMesh.setMatrixAt(i, m4); headMesh.setMatrixAt(i, m4);
    for (const im of lampParts) im.setMatrixAt(i, m4);
  });
  poleMesh.castShadow = true;
  // pools of lamplight on the street: additive decals, faded in at night (lamp material
  // intensity drives them via poolMaterial.opacity in main.js)
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, 0.08, 1.3), poolMaterial(), lamps.length);
  for (let i = 0; i < lamps.length; i++) { headMesh.getMatrixAt(i, m4); poolMesh.setMatrixAt(i, m4); }
  poolMesh.renderOrder = 1;
  group.add(...(lampParts.length ? lampParts : [poleMesh, headMesh]), poolMesh);

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

// A steel fire ladder: two rails, rungs every 0.3 m, stand-off brackets to the wall, and
// grab-rails that curve over the parapet. Drawn from the logical ladder (gen/climb.js).
function ladderMesh(mb, L, frame, M) {
  mb.setFrame(...frame);
  const x = L.lx, z = L.lz, top = L.y1 + 1.0, hw = 0.24;
  for (const sx of [-hw, hw]) {
    mb.box(M.trim, x + sx - 0.025, 0, z - 0.025, x + sx + 0.025, top, z + 0.025, [0.42, 0.44, 0.46]);
    for (let y = 1.2; y < L.y1; y += 2.4) mb.box(M.trim, x + sx - 0.02, y, z - 0.42, x + sx + 0.02, y + 0.04, z, [0.42, 0.44, 0.46]);   // brackets
    mb.box(M.trim, x + sx - 0.025, top - 0.05, z - 0.75, x + sx + 0.025, top, z, [0.42, 0.44, 0.46]);                                   // over the parapet
  }
  for (let y = 0.3; y < L.y1 + 0.6; y += 0.3) mb.box(M.trim, x - hw, y - 0.016, z - 0.016, x + hw, y + 0.016, z + 0.016, [0.5, 0.52, 0.54]);
}
