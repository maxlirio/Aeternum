// The roads between towns. A planet has millions of towns, so its road map is never drawn up all
// at once: it's a rule anyone can work out from any spot, and it gives the same roads whichever way
// you come to them. Two towns are joined if no third town lies closer to both of them (a relative
// neighbourhood graph: every town near others is connected to them, and straight lines between
// them don't cross). The road runs from the end of one town's road out to the end of the other's,
// by least cost over the land, and sea stops it. A road out of town that no neighbour uses goes on
// to the nearest town anyway, so roads go somewhere.
import { rawHeight } from './terrain.js';
import { riverAt } from './rivers.js';
import { getSettlement, regionOf } from './settlement.js';
import { outRoutes, nearRoute, indexRoute, addBridges, simplifyPath, chaikinPath, resamplePath, MAX_GRADE, ROUTE_STEP as STEP } from './highways.js';
import { getCity, cityWeight } from './city.js';
import { REGION } from '../core/units.js';

export const MAX_LINK = 7000;          // towns further apart than this have no road between them
const RINGS = Math.ceil((MAX_LINK + 1400) / REGION), CELL = 48, PAD = 900;
const memo = new WeakMap();
const stateOf = planet => { let S = memo.get(planet); if (!S) memo.set(planet, S = { near: new Map(), plan: new Map(), rough: new Map(), cells: new Map(), links: new Map() }); return S; };

// Towns within reach of a town.
function nearTowns(planet, A) {
  const S = stateOf(planet); if (S.near.has(A.key)) return S.near.get(A.key);
  const out = [];
  for (let a = -RINGS; a <= RINGS; a++) for (let b = -RINGS; b <= RINGS; b++) {
    const q = getSettlement(planet, A.rx + a, A.rz + b); if (!q || q === A) continue;
    const d = Math.hypot(q.cx - A.cx, q.cz - A.cz); if (d <= MAX_LINK) out.push([d, q]);
  }
  out.sort((p, q) => p[0] - q[0]); S.near.set(A.key, out); return out;
}
const tipsOf = (planet, s) => outRoutes(planet, s).map((r, i) => ({ s, i, r, x: r.pts.at(-1)[0], z: r.pts.at(-1)[1], h: r.h.at(-1) }));
const closest = (T, U) => { let best = null, bd = Infinity; for (const a of T) for (const b of U) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = [a, b]; } } return best; };
const idOf = (a, b) => (a.s.key < b.s.key || (a.s.key === b.s.key && a.i < b.i) ? [a, b] : [b, a]);

// What this town's roads are joined to: [[its tip, their tip]]. Only positions: nothing's been routed yet.
function planOf(planet, A) {
  const S = stateOf(planet); if (S.plan.has(A.key)) return S.plan.get(A.key);
  const near = nearTowns(planet, A), mine = tipsOf(planet, A), pairs = [], used = new Set();
  for (const [d, B] of near) {
    if (near.some(([dc, C]) => C !== B && dc < d && Math.hypot(C.cx - B.cx, C.cz - B.cz) < d)) continue;
    const U = tipsOf(planet, B); if (!mine.length || !U.length) continue;
    const p = closest(mine, U); pairs.push(p); used.add(p[0].i);
  }
  const own = pairs.slice();
  for (const t of mine) { if (used.has(t.i)) continue;     // a road out of town nothing else uses: on to the nearest town it isn't already joined to
    let best = null, bd = Infinity; for (const [, B] of near) for (const u of tipsOf(planet, B)) { if (pairs.some(p => p[1].s === B)) continue; const d = Math.hypot(t.x - u.x, t.z - u.z); if (d < bd) { bd = d; best = u; } }
    if (best) own.push([t, best]);
  }
  const P = { own, rng: pairs }; S.plan.set(A.key, P); return P;
}
// Every join a town has, its own and the ones others have made to it, without repeats.
export function joinsOf(planet, A) {
  const seen = new Map(), add = p => { const [a, b] = idOf(p[0], p[1]), id = a.s.key + '#' + a.i + '|' + b.s.key + '#' + b.i; if (!seen.has(id)) seen.set(id, [id, a, b]); };
  for (const p of planOf(planet, A).own) add(p);
  for (const [, B] of nearTowns(planet, A)) for (const p of planOf(planet, B).own) if (p[1].s === A) add(p);
  return [...seen.values()];
}

// Where a road goes and how high, from one tip to another, on its own: or null if the land won't have it.
function roughOf(planet, [id, a, b]) {
  const S = stateOf(planet); if (S.rough.has(id)) return S.rough.get(id);
  const D = routeLink(planet, a, b); if (D) indexRoute(Object.assign(D, { id })); S.rough.set(id, D); return D;
}
function routeLink(planet, a, b) {
  const sea = planet.seaLevel, c = getCity(planet);
  const x0 = Math.min(a.x, b.x) - PAD, z0 = Math.min(a.z, b.z) - PAD, nx = Math.ceil((Math.max(a.x, b.x) + PAD - x0) / CELL) + 1, nz = Math.ceil((Math.max(a.z, b.z) + PAD - z0) / CELL) + 1, N = nx * nz;
  const H = new Float32Array(N).fill(NaN), g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const X = k => x0 + (k % nx) * CELL, Z = k => z0 + Math.floor(k / nx) * CELL, cellOf = (x, z) => Math.round((z - z0) / CELL) * nx + Math.round((x - x0) / CELL);
  const h = k => { if (Number.isNaN(H[k])) H[k] = rawHeight(planet, X(k), Z(k)); return H[k]; };
  const start = cellOf(a.x, a.z), goal = cellOf(b.x, b.z), est = k => Math.hypot(X(k) - b.x, Z(k) - b.z);
  // no running back along either town's own road, and never through a town
  const near = new Set(); for (const t of [a, b]) for (let i = 0; i < t.r.pts.length - 4; i++) { const [x, z] = t.r.pts[i], cx = Math.round((x - x0) / CELL), cz = Math.round((z - z0) / CELL); for (let p = -3; p <= 3; p++) for (let q = -3; q <= 3; q++) if (cx + p >= 0 && cz + q >= 0 && cx + p < nx && cz + q < nz) near.add((cz + q) * nx + cx + p); }
  const towns = new Map(), inTown = k => { const x = X(k), z = Z(k), rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), key = rx * 100003 + rz; let s = towns.get(key); if (s === undefined) towns.set(key, s = getSettlement(planet, rx, rz)); return !!s && Math.hypot(s.cx - x, s.cz - z) < s.R + 60; };
  const heap = [[est(start), start]]; g[start] = 0;
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
  let found = false, steps = 0;
  while (heap.length) {
    const [f, k] = pop(); if (f - est(k) > g[k] + 1e-6) continue;
    if (k === goal) { found = true; break; }
    if (++steps > 40000) break;
    const cx = k % nx, cz = Math.floor(k / nx), hk = h(k);
    for (const [dx, dz] of MOVES) {
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
      const m = z * nx + x, L = Math.hypot(dx, dz) * CELL, hm = h(m);
      if (m !== goal && inTown(m)) continue;
      if (cityWeight(c, X(m), Z(m)) > 0) continue;
      let cost = L * (1 + 4 * Math.pow(Math.abs(hm - hk) / L / 0.07, 4));
      if (hm < sea + 3) cost += L * 40;
      if (near.has(m) && m !== start && m !== goal) cost += L * 30;
      if (g[k] + cost < g[m]) { g[m] = g[k] + cost; from[m] = k; push(g[m] + est(m), m); }
    }
  }
  if (!found) return null;
  let path = []; for (let k = goal; k >= 0; k = from[k]) path.push([X(k), Z(k)]); path.reverse();
  path[0] = [a.x, a.z]; path[path.length - 1] = [b.x, b.z];
  const pts = resamplePath(chaikinPath(simplifyPath(path, 8), 3), STEP);
  if (Math.hypot(pts.at(-1)[0] - b.x, pts.at(-1)[1] - b.z) > 0.01) pts.push([b.x, b.z]);
  const L = (pts.length - 1) * STEP;
  if (Math.abs(a.h - b.h) > 0.11 * L) return null;                       // one's up a mountain: no road that doesn't zigzag for miles
  const raw = pts.map(([x, z]) => rawHeight(planet, x, z));
  if (raw.filter(v => v < sea + 0.5).length * STEP > 160) return null;   // that's a sea in the way, not a river
  const W = Math.round(40 / STEP); let prof = raw.map((_, i) => { let t = 0, n = 0; for (let j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) { t += Math.max(sea + 1.5, raw[j]); n++; } return t / n; });
  const dh = MAX_GRADE * STEP, last = prof.length - 1;
  for (let pass = 0; pass < 6; pass++) {
    prof[0] = a.h; prof[last] = b.h;
    for (let i = 1; i < last; i++) prof[i] = Math.max(prof[i - 1] - dh, Math.min(prof[i - 1] + dh, prof[i]));
    for (let i = last - 1; i > 0; i--) prof[i] = Math.max(prof[i + 1] - dh, Math.min(prof[i + 1] + dh, prof[i]));
  }
  for (let pass = 0; pass < 3; pass++) prof = prof.map((v, i) => i === 0 || i === last ? v : (prof[i - 1] + 2 * v + prof[i + 1]) / 4);
  return { pts, h: prof, w: a.r.w };
}

// Plain data → a road the ground and the traffic can use. (The background thread sends the plain data.)
function finish(planet, id, a, b, D) {
  const r = indexRoute({ id, link: true, w: D.w, pts: D.pts, h: D.h, lead: 0, bridges: D.bridges || [], length: (D.pts.length - 1) * STEP, ends: [a.s.key, b.s.key] });
  r.x0 = Math.min(...D.pts.map(p => p[0])); r.x1 = Math.max(...D.pts.map(p => p[0])); r.z0 = Math.min(...D.pts.map(p => p[1])); r.z1 = Math.max(...D.pts.map(p => p[1]));
  r.from = a.r; r.to = b.r;
  a.r.joined = true; b.r.joined = true;
  return r;
}
// Roads that meet have to meet at one height. Each is first worked out alone, then every place one
// touches another (or a town's own road) is pinned: halfway between the two for two roads, the town
// road's own height for that. Either road comes to the same answer on its own, so it doesn't matter
// which of them is found first.
function settle(planet, id, a, b, D0) {
  const pins = new Map(), others = [];
  const X = D0.pts.map(p => p[0]), Z = D0.pts.map(p => p[1]), bx0 = Math.min(...X) - 40, bx1 = Math.max(...X) + 40, bz0 = Math.min(...Z) - 40, bz1 = Math.max(...Z) + 40;
  const mayTouch = j => Math.max(j[1].x, j[2].x) + PAD >= bx0 && Math.min(j[1].x, j[2].x) - PAD <= bx1 && Math.max(j[1].z, j[2].z) + PAD >= bz0 && Math.min(j[1].z, j[2].z) - PAD <= bz1;
  const add = (O, fixed) => { for (let i = 4; i < D0.pts.length - 4; i++) { const [x, z] = D0.pts[i], q = nearRoute(O, x, z); if (!q || q.d > (D0.w + O.w) / 2) continue; const v = fixed ? q.h : (q.h + D0.h[i]) / 2, e = pins.get(i); pins.set(i, e === undefined ? v : (e + v) / 2); } };
  const rx0 = Math.floor(Math.min(a.x, b.x) / REGION) - RINGS, rx1 = Math.floor(Math.max(a.x, b.x) / REGION) + RINGS, rz0 = Math.floor(Math.min(a.z, b.z) / REGION) - RINGS, rz1 = Math.floor(Math.max(a.z, b.z) / REGION) + RINGS;
  const seen = new Set([id]);
  for (let p = rx0; p <= rx1; p++) for (let q = rz0; q <= rz1; q++) {
    const s = getSettlement(planet, p, q); if (!s) continue;
    if (Math.hypot(s.cx - (a.x + b.x) / 2, s.cz - (a.z + b.z) / 2) > 3 * MAX_LINK) continue;
    for (const r of outRoutes(planet, s)) add(r, true);
    for (const j of joinsOf(planet, s)) { if (seen.has(j[0]) || !mayTouch(j)) continue; seen.add(j[0]); const O = roughOf(planet, j); if (O) add(O, false); }
  }
  const prof = D0.h.slice(), dh = MAX_GRADE * STEP, last = prof.length - 1;
  if (pins.size) for (let pass = 0; pass < 8; pass++) {
    for (const [i, v] of pins) prof[i] = v;
    prof[0] = a.h; prof[last] = b.h;
    for (let i = 1; i < last; i++) if (!pins.has(i)) prof[i] = Math.max(prof[i - 1] - dh, Math.min(prof[i - 1] + dh, prof[i]));
    for (let i = last - 1; i > 0; i--) if (!pins.has(i)) prof[i] = Math.max(prof[i + 1] - dh, Math.min(prof[i + 1] + dh, prof[i]));
  }
  // pins too far apart in height for a road to join at its proper grade: it gets a bit steeper there, and no worse. (A road's ends don't move.)
  if (pins.size) { const most = dh * 1.5; for (let i = 1; i <= last; i++) prof[i] = Math.max(prof[i - 1] - most, Math.min(prof[i - 1] + most, prof[i])); for (let i = last - 1; i >= 0; i--) prof[i] = Math.max(prof[i + 1] - most, Math.min(prof[i + 1] + most, prof[i])); prof[0] = a.h; prof[last] = b.h; }
  return { pts: D0.pts, h: prof, w: D0.w };
}
function linkOf(planet, j) {
  const [id, a, b] = j, S = stateOf(planet); if (S.links.has(id)) return S.links.get(id);
  const D0 = roughOf(planet, j); let r = null;
  if (D0) { const D = settle(planet, id, a, b, D0), R = { pts: D.pts, h: D.h, lead: 0 }; addBridges(planet, R); D.bridges = R.bridges; D.h = R.h; if (!D.bridges.some(B => B.i1 - B.i0 > 40)) r = finish(planet, id, a, b, D); }
  S.links.set(id, r); return r;
}
export const linksOfTown = (planet, A) => joinsOf(planet, A).map(j => linkOf(planet, j)).filter(Boolean);
// Every road linking towns that have been worked out so far (for drawing and traffic).
export const knownLinks = planet => [...stateOf(planet).links.values()].filter(Boolean);

// The roads that could affect (x, z): a coarse cell's worth, worked out once.
export function linksAt(planet, x, z) {
  if (planet.onlyHomeRiver) return NONE;   // (tests over hundreds of home towns: see tools/test.mjs)
  const S = stateOf(planet), rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), k = rx * 100003 + rz; let list = S.cells.get(k);
  if (list) return list;
  list = []; const x0 = rx * REGION - 24, x1 = x0 + REGION + 48, z0 = rz * REGION - 24, z1 = z0 + REGION + 48;
  for (let a = -RINGS; a <= RINGS; a++) for (let b = -RINGS; b <= RINGS; b++) {
    const s = getSettlement(planet, rx + a, rz + b); if (!s) continue;
    for (const j of joinsOf(planet, s)) {     // (only roads whose ends are near enough could come through here)
      if (Math.max(j[1].x, j[2].x) + PAD < x0 || Math.min(j[1].x, j[2].x) - PAD > x1 || Math.max(j[1].z, j[2].z) + PAD < z0 || Math.min(j[1].z, j[2].z) - PAD > z1) continue;
      const r = linkOf(planet, j); if (r && r.x1 >= x0 && r.x0 <= x1 && r.z1 >= z0 && r.z0 <= z1 && !list.includes(r)) list.push(r);
    }
  }
  S.cells.set(k, list); return list;
}
const NONE = [];

// For the background thread: the towns around a region, routed, as plain data; and taking that data in.
export function linksAround(planet, rx, rz, reach = 2) {
  const out = [];
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
    const s = getSettlement(planet, rx + a, rz + b); if (!s) continue;
    for (const j of joinsOf(planet, s)) { const r = linkOf(planet, j); out.push([j[0], r && { w: r.w, pts: r.pts, h: r.h, bridges: r.bridges }]); }
  }
  return out;
}
export function adoptLinks(planet, list, rx, rz, reach = 2) {
  const S = stateOf(planet);
  const known = new Map();
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) { const s = getSettlement(planet, rx + a, rz + b); if (s) for (const j of joinsOf(planet, s)) known.set(j[0], j); }
  for (const [id, D] of list) { if (S.links.has(id)) continue; const j = known.get(id); if (j) S.links.set(id, D ? finish(planet, id, j[1], j[2], D) : null); }
}
export const regionsDone = (planet, rx, rz) => stateOf(planet).cells.has(rx * 100003 + rz);
export const linkReach = RINGS;
export { regionOf };
