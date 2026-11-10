import { getSettlement } from './settlement.js';
// The town's traffic: drivers going somewhere, keeping to the right. Pure in time — where each one
// is at t follows from a hash and the street graph — so it needs no saving.
// Nobody in it is a resident; it doesn't stop for you, and being hit by it hurts (struckBy).
import { hashInts, hashStr } from '../core/hash.js';
import { outRoutes } from './highways.js';
import { knownLinks } from './network.js';
import { VEHICLE_COLOURS, TYPES } from './vehicles.js';
const MIX = Object.values(TYPES).map(T => [T.id, T.w * (T.kind === 'truck' || T.kind === 'van' ? 1.6 : 1)]);
const pickBy = x => { const tot = MIX.reduce((a, m) => a + m[1], 0); let q = x * tot; for (const [id, w] of MIX) { q -= w; if (q < 0) return id; } return MIX[0][0]; };

const cache = new Map();
const LAT = 1.9, KERB = 3.0, PACE = 11, OPEN_PACE = 15;
// The town's drivers: each has a home on a street and goes about: to another street in town, or off
// down a road out of town and back later, parking where they stop. A trip is a route through the
// street graph, keeping right; each starts exactly where the last one ended. Pure in time.
function roads(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const adj = new Map(), link = (a, b, r) => (adj.get(a) || adj.set(a, []).get(a)).push({ to: b, r });
  s.roads.forEach((r, i) => { link(r.na, r.nb, i); link(r.nb, r.na, i); });
  const nodeW = n => s.toWorld(s.nodes[n].u, s.nodes[n].v);
  const outs = outRoutes(planet, s).map(r => { const near = (p) => s.nodes.map((_, k) => k).filter(k => adj.has(k)).sort((a, b) => Math.hypot(nodeW(a)[0] - p[0], nodeW(a)[1] - p[1]) - Math.hypot(nodeW(b)[0] - p[0], nodeW(b)[1] - p[1]))[0], d0 = near(r.pts[0]), d1 = near(r.pts.at(-1)), fromStart = Math.hypot(nodeW(d0)[0] - r.pts[0][0], nodeW(d0)[1] - r.pts[0][1]) <= Math.hypot(nodeW(d1)[0] - r.pts.at(-1)[0], nodeW(d1)[1] - r.pts.at(-1)[1]); return { node: fromStart ? d0 : d1, pts: fromStart ? r.pts : r.pts.slice().reverse(), h: fromStart ? r.h : r.h.slice().reverse() }; });
  const n = Math.max(14, Math.round(s.roads.length * 0.9)), cars = [];
  for (let k = 0; k < n; k++) { const h = j => hashInts(planet.universeSeed[1] ^ 0x77a1, [hashStr(6, s.key), k, j]) / 4294967296; cars.push({ k, id: `tr:${s.key}:${k}`, type: pickBy(h(1)), colour: Math.floor(h(2) * VEHICLE_COLOURS), period: 300 + 340 * h(3), off: h(4), home: Math.floor(h(5) * s.roads.length) }); }
  const G = { adj, outs, cars, nodeW };
  cache.set(ck, G);
  return G;
}
const stopOf = (planet, s, G, car, n) => {
  const h = j => hashInts(planet.universeSeed[1] ^ 0x51c3, [car.k, n, j]) / 4294967296;
  if (G.outs.length && h(1) < 0.3) return { out: Math.floor(h(2) * G.outs.length) };
  const road = h(3) < 0.4 ? car.home : Math.floor(h(4) * s.roads.length);
  return { road, f: 0.2 + 0.6 * h(5), dir: h(6) < 0.5 ? 1 : -1 };          // dir +1: heading from na to nb
};
function bfs(G, a, b) {
  if (a === b) return [a];
  const prev = new Map([[a, null]]), q = [a];
  while (q.length) { const n = q.shift(); for (const e of G.adj.get(n) || []) if (!prev.has(e.to)) { prev.set(e.to, n); if (e.to === b) { const out = [b]; for (let c = n; c !== null; c = prev.get(c)) out.unshift(c); return out; } q.push(e.to); } }
  return null;
}
const stopPoint = (s, G, st) => {       // where you are when stopped there: { p: [x, y, z], from/to nodes }
  if (st.out !== undefined) { const r = G.outs[st.out]; return { p: [r.pts.at(-1)[0], r.h.at(-1), r.pts.at(-1)[1]] }; }
  const r = s.roads[st.road], A = G.nodeW(r.na), B = G.nodeW(r.nb), x = A[0] + (B[0] - A[0]) * st.f, z = A[1] + (B[1] - A[1]) * st.f, ux = (B[0] - A[0]), uz = (B[1] - A[1]), l = Math.hypot(ux, uz) || 1, d = st.dir, rx = -uz / l * d, rz = ux / l * d, off = Math.min(KERB, r.w / 2 - 0.9);
  return { p: [x + rx * off, s.h, z + rz * off], fx: ux / l * d, fz: uz / l * d, ahead: d > 0 ? r.nb : r.na, behind: d > 0 ? r.na : r.nb };
};
// The centre line from stop A to stop B, as [x, y, z]; then offset to the right of travel.
function routeBetween(s, G, A, B) {
  const a = stopPoint(s, G, A), b = stopPoint(s, G, B), centre = [], y = s.h;
  const startN = A.out !== undefined ? G.outs[A.out].node : a.ahead, endN = B.out !== undefined ? G.outs[B.out].node : b.behind;
  if (A.out !== undefined) { const r = G.outs[A.out]; for (let i = r.pts.length - 1; i >= 0; i--) centre.push([r.pts[i][0], r.h[i], r.pts[i][1]]); }
  const nodes = bfs(G, startN, endN); if (!nodes) return null;
  for (const n of nodes) { const w = G.nodeW(n); centre.push([w[0], y, w[1]]); }
  if (B.out !== undefined) { const r = G.outs[B.out]; for (let i = 0; i < r.pts.length; i++) centre.push([r.pts[i][0], r.h[i], r.pts[i][1]]); }
  const off = centre.map((p, i) => { const q = centre[Math.min(centre.length - 1, i + 1)], o = centre[Math.max(0, i - 1)]; let ux = q[0] - o[0], uz = q[2] - o[2]; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; return [p[0] - uz * LAT, p[1], p[2] + ux * LAT]; });
  const pts = [a.p, ...off, b.p], clean = [pts[0]]; for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - clean.at(-1)[0], pts[i][2] - clean.at(-1)[2]) > 0.5) clean.push(pts[i]);
  // round the corners
  const out = [clean[0]];
  for (let k = 1; k < clean.length - 1; k++) { const p = clean[k], A0 = clean[k - 1], B0 = clean[k + 1], la = Math.hypot(p[0] - A0[0], p[2] - A0[2]), lb = Math.hypot(B0[0] - p[0], B0[2] - p[2]), r = Math.min(5, la * 0.45, lb * 0.45), ca = [p[0] + (A0[0] - p[0]) * r / la, p[1] + (A0[1] - p[1]) * r / la, p[2] + (A0[2] - p[2]) * r / la], cb = [p[0] + (B0[0] - p[0]) * r / lb, p[1] + (B0[1] - p[1]) * r / lb, p[2] + (B0[2] - p[2]) * r / lb]; for (let q = 0; q <= 3; q++) { const f = q / 3, g = 1 - f; out.push([g * g * ca[0] + 2 * g * f * p[0] + f * f * cb[0], g * g * ca[1] + 2 * g * f * p[1] + f * f * cb[1], g * g * ca[2] + 2 * g * f * p[2] + f * f * cb[2]]); } }
  out.push(clean.at(-1));
  return out;
}
function tripOf(planet, s, G, car, n) {
  if (car.tn === n) return car.trip;
  const A = stopOf(planet, s, G, car, n - 1), B = stopOf(planet, s, G, car, n), same = A.out !== undefined ? A.out === B.out : A.road === B.road && A.f === B.f && A.dir === B.dir, t0 = (n - car.off) * car.period + 6;
  const pts = same ? null : routeBetween(s, G, A, B); let cum = null;
  if (pts) { cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2])); }
  const speed = pts && cum.at(-1) / PACE > car.period * 0.85 ? cum.at(-1) / (car.period * 0.85) : A.out !== undefined || B.out !== undefined ? OPEN_PACE : PACE;
  car.tn = n; car.trip = { t0, pts, cum, speed, A: stopPoint(s, G, A), B: stopPoint(s, G, B), wasOut: A.out !== undefined || (pts === null && B.out !== undefined) };
  return car.trip;
}
// Vehicles within R of (x, z) at time t: [{ id, type, pos, facing, colour, speed, parked }]. delayOf
// (id → seconds) lets the ones near you run behind schedule, for good reason (sim/roadlife.js).
export function trafficNear(planet, s, t, x, z, R = 500, delayOf = null) {
  const G = roads(planet, s), res = [];
  for (const car of G.cars) {
    const T = t - (delayOf ? delayOf(car.id) : 0), n = Math.floor(T / car.period + car.off), tr = tripOf(planet, s, G, car, n), tau = T - tr.t0;
    let px, py, pz, fx, fz, speed = 0;
    if (!tr.pts || tau < 0 || tau * tr.speed >= tr.cum.at(-1)) {         // parked at the kerb (or gone, off down the road)
      const St = !tr.pts ? tr.B : tau < 0 ? tr.A : tr.B; [px, py, pz] = St.p; fx = St.fx ?? 1; fz = St.fz ?? 0;
    } else {
      const d = tau * tr.speed; let i = 1; while (i < tr.cum.length - 1 && tr.cum[i] < d) i++;
      const A = tr.pts[i - 1], B = tr.pts[i], f = (d - tr.cum[i - 1]) / (tr.cum[i] - tr.cum[i - 1] || 1), l = Math.hypot(B[0] - A[0], B[2] - A[2]) || 1;
      px = A[0] + (B[0] - A[0]) * f; py = A[1] + (B[1] - A[1]) * f; pz = A[2] + (B[2] - A[2]) * f; fx = (B[0] - A[0]) / l; fz = (B[2] - A[2]) / l; speed = tr.speed;
    }
    if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
    res.push({ id: car.id, type: car.type, pos: [px, py + 0.05, pz], facing: Math.atan2(fx, fz), colour: car.colour, speed, parked: speed === 0, trip: tr });
  }
  return linkCars(planet, t, x, z, R, delayOf, res);
}
// The road between two towns has its own drivers, on the whole way from one town's edge to the other's, on the right. A pure function of time like the rest.
const LINK_GAP = 900, LINK_PACE = 21;
function wholeRoad(r) {
  if (r.way) return r.way;
  const a = r.from, b = r.to;
  const line = []; const put = (x, y, z) => { const L = line.at(-1); if (!L || Math.hypot(L[0] - x, L[2] - z) > 0.5) line.push([x, y, z]); };
  // from the town along its road out (it starts in town), then this road, then in along theirs: whichever end of this road is whose
  const fromFirst = Math.hypot(a.pts.at(-1)[0] - r.pts[0][0], a.pts.at(-1)[1] - r.pts[0][1]) < 1;
  const [A, B] = fromFirst ? [a, b] : [b, a];
  for (let i = A.lead; i < A.pts.length; i++) put(A.pts[i][0], A.h[i], A.pts[i][1]);
  for (let i = 0; i < r.pts.length; i++) put(r.pts[i][0], r.h[i], r.pts[i][1]);
  for (let i = B.pts.length - 1; i >= B.lead; i--) put(B.pts[i][0], B.h[i], B.pts[i][1]);
  return (r.way = line);
}
function linkCars(planet, t, x, z, R, delayOf, res) {
  for (const r of knownLinks(planet)) {
    if (x < r.x0 - R - 1000 || x > r.x1 + R + 1000 || z < r.z0 - R - 1000 || z > r.z1 + R + 1000) continue;
    const W = wholeRoad(r), L = (W.length - 1) * 4, n = Math.max(2, Math.floor(L / LINK_GAP)), sd = hashStr(9, r.id);
    for (let k = 0; k < n; k++) {
      const h = j => hashInts(sd, [k, j]) / 4294967296, dir = k % 2 ? 1 : -1, id = `tr:${r.id}:${dir}:${k}`, T = t - (delayOf ? delayOf(id) : 0), pace = LINK_PACE * (0.85 + 0.3 * h(1));
      const trip = (T * pace / L + h(2));
      const u = ((trip % 1) + 1) % 1; let f = u * (W.length - 1); if (dir < 0) f = W.length - 1 - f;
      const i = Math.min(W.length - 2, Math.floor(f)), g = f - i, A = W[i], B = W[i + 1];
      let px = A[0] + (B[0] - A[0]) * g, pz = A[2] + (B[2] - A[2]) * g, ux = (B[0] - A[0]) * dir, uz = (B[2] - A[2]) * dir; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
      px += uz * LAT; pz -= ux * LAT;       // on the right
      if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
      const lap = Math.floor(trip);
      res.push({ id, type: pickBy(hashInts(sd, [k, 7, lap]) / 4294967296), pos: [px, A[1] + (B[1] - A[1]) * g + 0.05, pz], facing: Math.atan2(ux, uz), colour: hashInts(sd, [k, 8, lap]) % VEHICLE_COLOURS, speed: pace, parked: false });
    }
  }
  return res;
}

// Is someone standing at (x, y, z) inside this vehicle's box? (Its box is logical: type L, W, H.)
export function struckBy(v, x, y, z, r = 0.32) {
  const T = TYPES[v.type] || TYPES.speeder, dx = x - v.pos[0], dz = z - v.pos[2], fx = Math.sin(v.facing), fz = Math.cos(v.facing);
  if (y + 1.7 < v.pos[1] || y > v.pos[1] + T.H) return false;
  return Math.abs(dx * fx + dz * fz) <= T.L / 2 + r && Math.abs(dx * fz - dz * fx) <= T.W / 2 + r;
}

// Air traffic: ships crossing the sky over a town on straight lanes at a few altitudes,
// in both directions, every design in the catalogue. Pure in time, like the road traffic.
import { LAYOUTS } from './ships.js';
const AIR = Object.keys(LAYOUTS).filter(k => k !== 'patrol');
export function airTraffic(planet, s, t, x, z, R = 4000) {
  const out = [], seed = planet.universeSeed[1] ^ 0x41a7;
  for (let k = 0; k < 14; k++) {
    const h = j => hashInts(seed, [hashStr(6, s.key), k, j]) / 4294967296;
    const ang = h(1) * Math.PI, off = (h(2) - 0.5) * 2400, alt = s.h + 160 + 520 * h(3), speed = 70 + 110 * h(4), span = 9000;
    const model = AIR[Math.floor(h(5) * AIR.length)], dir = h(6) < 0.5 ? 1 : -1;
    const along = ((t * speed / span + h(7)) % 1) * span - span / 2;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    const px = s.cx + ux * along * dir - uz * off, pz = s.cz + uz * along * dir + ux * off;
    if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
    out.push({ id: `air:${k}`, model, c: [px, alt, pz], facing: Math.atan2(ux * dir, uz * dir), colour: Math.floor(h(8) * 7), pitch: 0, roll: 0, rampDown: false });
  }
  // cargo runs: a freighter to each town nearby and back, carrying what this town makes (gen/trade.js): up out of town, across, down at the other end, a while unloading, home
  for (const run of cargoRuns(planet, s)) { const p = runAt(run, t); if (p && (p.c[0] - x) ** 2 + (p.c[2] - z) ** 2 < R * R) out.push(p); }
  return out;
}
export function cargoRuns(planet, s) {
  const runs = [], seed = planet.seed[0] ^ 0x7a3d;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    if (!a && !b) continue; const o = getSettlement(planet, s.rx + a, s.rz + b); if (!o) continue;
    const h = j => hashInts(seed, [hashStr(6, s.key), hashStr(7, o.key), j]) / 4294967296; if (h(0) > 0.6) continue;
    const d = Math.hypot(o.cx - s.cx, o.cz - s.cz), speed = 120, fly = d / speed, dwell = 300 + 400 * h(1);
    runs.push({ id: `cargo:${s.key}>${o.key}`, from: s, to: o, d, fly, dwell, period: 2 * (fly + dwell), phase: h(2), colour: Math.floor(h(3) * 7) });
  }
  return runs;
}
// Where a cargo run's freighter is at t: in the air between the towns, or null while it's on the ground at either end (parked ships handle that).
export function runAt(run, t) {
  const u = ((t / run.period + run.phase) % 1) * run.period, { from, to, fly, dwell } = run;
  let f, A, B; if (u < fly) { f = u / fly; A = from; B = to; } else if (u < fly + dwell) return null; else if (u < 2 * fly + dwell) { f = (u - fly - dwell) / fly; A = to; B = from; } else return null;
  const climb = Math.min(1, f * 6, (1 - f) * 6), alt = Math.max(A.h, B.h) + 40 + 560 * climb * climb * (3 - 2 * climb);
  const x = A.cx + (B.cx - A.cx) * f, z = A.cz + (B.cz - A.cz) * f, y = A.h + (B.h - A.h) * f + (alt - Math.max(A.h, B.h));
  return { id: run.id, model: 'freighter', c: [x, y, z], facing: Math.atan2(B.cx - A.cx, B.cz - A.cz), colour: run.colour, pitch: 0, roll: 0, rampDown: false, cargo: true };
}
