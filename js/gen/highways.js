// Roads out of town. Each starts where the arterial leaves the street grid and is
// routed across the raw terrain by a least-cost search that hates steep grades and
// water, so a road winds along valleys and up hillsides in switchbacks instead of
// running straight at a mountain. The route then gets a vertical profile:
// the terrain along it, smoothed, and clamped to a maximum grade (cut and fill).
// Pure and cached: (planet, settlement) → routes. Only logical data — the mesh drapes
// over it, the ground (gen/surface.js) is graded by it.
import { rawHeight } from './terrain.js';
import { REGION } from '../core/units.js';
import { smoothstep, lerp } from '../core/noise.js';

export const MAX_GRADE = 0.09;          // road profile never steeper than 9%
const CELL = 32, STEP = 4, EDGE = 60;   // search grid (coarse enough that hairpins have room to turn), resample spacing, keep-off from region edge

const cache = new Map();
export function outRoutes(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (!cache.has(ck)) { const rs = []; s.outRoads.forEach((o, i) => rs.push(route(planet, s, o, i, rs))); cache.set(ck, rs); }
  return cache.get(ck);
}

function route(planet, s, o, idx, earlier) {
  const dir = Math.sign(o.b[0] - o.a[0]);
  // straight out to just past the town's rim (graded flat there anyway), then search
  const lead = [];
  for (let u = o.a[0]; s.R + 40 - dir * u > 0; u += dir * STEP) lead.push(s.toWorld(u, o.a[1]));
  const [sx, sz] = s.toWorld(dir * (s.R + 40), o.a[1]);
  const out = s.toWorld(dir, 0), ox = out[0] - s.cx, oz = out[1] - s.cz;   // outward unit vector
  // search window: the region, minus a margin so the graded strip never crosses into the next
  const x0 = s.rx * REGION + EDGE, z0 = s.rz * REGION + EDGE, n = Math.floor((REGION - 2 * EDGE) / CELL);
  const H = new Float32Array(n * n).fill(NaN);
  const h = k => { if (Number.isNaN(H[k])) H[k] = rawHeight(planet, x0 + (k % n) * CELL, z0 + Math.floor(k / n) * CELL); return H[k]; };
  const cellOf = (x, z) => Math.max(0, Math.min(n - 1, Math.round((z - z0) / CELL))) * n + Math.max(0, Math.min(n - 1, Math.round((x - x0) / CELL)));
  const pos = k => [x0 + (k % n) * CELL, z0 + Math.floor(k / n) * CELL];
  const goalD = Math.min(s.R + 950, 0.5 * REGION - EDGE - 20);
  const isGoal = k => { const [x, z] = pos(k), dx = x - s.cx, dz = z - s.cz, d = Math.hypot(dx, dz); return d >= goalD - CELL && (dx * ox + dz * oz) / d > 0.3; };
  const dist = k => { const [x, z] = pos(k); return Math.hypot(x - s.cx, z - s.cz); };
  const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
  const sea = planet.seaLevel;
  const g = new Float64Array(n * n).fill(Infinity), from = new Int32Array(n * n).fill(-1);
  // keep clear of roads already laid (their graded strips would fight)
  const taken = new Uint8Array(n * n);
  for (const r of earlier) for (const [x, z] of r.pts) {
    const cx = Math.round((x - x0) / CELL), cz = Math.round((z - z0) / CELL);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (cx + a >= 0 && cz + b >= 0 && cx + a < n && cz + b < n) taken[(cz + b) * n + cx + a] = 1;
  }
  const start = cellOf(sx, sz);
  g[start] = 0;
  const heap = [[Math.max(0, goalD - dist(start)), start]];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let goal = -1;
  while (heap.length) {
    const [f, k] = pop();
    if (f - Math.max(0, goalD - dist(k)) > g[k] + 1e-6) continue;   // stale entry
    if (isGoal(k)) { goal = k; break; }
    const cx = k % n, cz = Math.floor(k / n), hk = h(k);
    for (const [dx, dz] of MOVES) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const m = z * n + x, L = Math.hypot(dx, dz) * CELL;
      // keep out of the town itself
      const [px, pz] = pos(m); if (Math.hypot(px - s.cx, pz - s.cz) < s.R + 40) continue;
      const hm = h(m), gr = Math.abs(hm - hk) / L;
      let c = L * (1 + 4 * Math.pow(gr / 0.07, 4));
      if (hm < sea + 3) c += L * 40;
      if (taken[m]) c += L * 60;                          // running alongside another road                       // bridges/causeways: only when there's no other way
      if (g[k] + c < g[m]) { g[m] = g[k] + c; from[m] = k; push(g[m] + Math.max(0, goalD - dist(m)), m); }
    }
  }
  if (goal < 0) {      // boxed in (other road, region edge): go as far out as the search reached
    let bd = -1; for (let k = 0; k < n * n; k++) if (g[k] < Infinity && dist(k) > bd) { bd = dist(k); goal = k; }
  }
  let path = [];
  for (let k = goal; k >= 0; k = from[k]) path.push(pos(k));
  path.reverse();
  path = [...lead, [sx, sz], ...path.slice(1)];
  path = chaikin(simplify(path, 5), 3);
  const pts = resample(path, STEP);
  // profile: terrain, smoothed over ±32 m, then clamped to the maximum grade from the town outward
  // the ground the road is cut into: raw terrain blended into the town plateau (as gen/surface.js does)
  const ground = (x, z) => { const [u, v] = s.toLocal(x, z), wp = 1 - smoothstep(s.R + 15, s.R + 200, Math.hypot(u, v)); return lerp(rawHeight(planet, x, z), s.h, wp); };
  const raw = pts.map(([x, z]) => Math.max(sea + 1.5, ground(x, z)));
  const W = Math.round(32 / STEP);
  let prof = raw.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) { a += raw[j]; c++; } return a / c; });
  const leadN = lead.length;
  for (let i = 0; i <= leadN && i < prof.length; i++) prof[i] = s.h;     // flat through the town edge
  const dh = MAX_GRADE * STEP;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = leadN + 1; i < prof.length; i++) prof[i] = Math.max(prof[i - 1] - dh, Math.min(prof[i - 1] + dh, prof[i]));
    for (let i = prof.length - 2; i > leadN; i--) prof[i] = Math.max(prof[i + 1] - dh, Math.min(prof[i + 1] + dh, prof[i]));
  }
  // round off the kinks the clamp leaves (vertical curves), then clamp once more
  for (let pass = 0; pass < 3; pass++) prof = prof.map((v, i) => i <= leadN || i >= prof.length - 1 ? v : (prof[i - 1] + 2 * v + prof[i + 1]) / 4);
  for (let i = leadN + 1; i < prof.length; i++) prof[i] = Math.max(prof[i - 1] - dh, Math.min(prof[i - 1] + dh, prof[i]));
  // spatial index of segments, for "nearest road point" from the ground function
  const B = 32, grid = new Map();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    for (let gx = Math.floor((Math.min(ax, bx) - 24) / B); gx <= Math.floor((Math.max(ax, bx) + 24) / B); gx++)
      for (let gz = Math.floor((Math.min(az, bz) - 24) / B); gz <= Math.floor((Math.max(az, bz) + 24) / B); gz++) {
        const key = gx * 100003 + gz; (grid.get(key) || grid.set(key, []).get(key)).push(i);
      }
  }
  return { id: idx, w: o.w, pts, h: prof, lead: leadN, grid, B, length: (pts.length - 1) * STEP };
}

// Nearest point of a route to (x, z) within reach: { d, h, i, f } or null.
export function nearRoute(r, x, z) {
  const segs = r.grid.get(Math.floor(x / r.B) * 100003 + Math.floor(z / r.B));
  if (!segs) return null;
  let best = null;
  for (const i of segs) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const d = Math.hypot(ax + ex * f - x, az + ez * f - z);
    if (!best || d < best.d) best = { d, i, f, h: r.h[i] + (r.h[i + 1] - r.h[i]) * f };
  }
  return best;
}

function simplify(pts, tol) {          // Douglas–Peucker
  if (pts.length < 3) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts.at(-1), ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez) || 1;
  let im = 0, dm = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - ax) * ez - (pts[i][1] - az) * ex) / L; if (d > dm) { dm = d; im = i; } }
  if (dm <= tol) return [pts[0], pts.at(-1)];
  return [...simplify(pts.slice(0, im + 1), tol).slice(0, -1), ...simplify(pts.slice(im), tol)];
}
function chaikin(pts, iters) {
  for (let k = 0; k < iters; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    out.push(pts.at(-1)); pts = out;
  }
  return pts;
}
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= L) { out.push([ax + (bx - ax) * t / L, az + (bz - az) * t / L]); t += step; }
    carry = L - (t - step);
  }
  return out;
}
