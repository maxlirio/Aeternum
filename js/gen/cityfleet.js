// The megacity's vehicles: every one has a driver with a home and somewhere to be. Pure in
// time: where a vehicle is at t follows from its driver's day, so nothing is saved and it's the
// same however frames are sliced.
//   driver → (hour) → stop n: home, work, an errand… → a trip from stop n-1 to stop n: a route
//   through the street lattice keeping right, pulling out from one kerb and in at another.
// Between trips the vehicle is parked where it stopped. Nothing loops, nothing teleports: each
// trip starts exactly where the last one ended. Sky cars lift off from the kerb, fly the same
// streets at their axis's altitude (so crossing streams never meet) and come down at the far
// kerb; ships fly between landing pads high over the avenues.
import { hash01 } from '../core/hash.js';
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { lineAt, lineWidth, blockRect, cityBlock, blockExists, PITCH, CURB, DISTRICT_LABEL } from './city.js';
import { solarHour } from '../sim/clock.js';
import { personName } from './names.js';
import { TYPES } from './vehicles.js';

const GROUND = ['sedan', 'sedan', 'compact', 'compact', 'estate', 'coupe', 'taxi', 'taxi', 'van', 'truck', 'speeder', 'pickup', 'minibus', 'hauler', 'wedge', 'limo', 'tanker', 'buggy', 'racer'];
const SKY = ['sedan', 'coupe', 'wedge', 'taxi', 'limo', 'compact', 'estate', 'racer', 'speeder', 'minibus', 'van', 'buggy'];
const SHIPS = ['runabout0', 'runabout1', 'runabout2', 'racer0', 'racer1', 'racer2', 'courier', 'yacht', 'ferry0', 'ferry1', 'dropship0', 'explorer0', 'explorer1', 'shuttle', 'hauler0', 'miner0', 'gunship1', 'patrol'];
export const FLEET_SIZE = { ground: 6000, sky: 6000, ship: 500 };
const WORK_DISTRICTS = ['commerce', 'spire', 'industry', 'market', 'port'], HOME_DISTRICTS = ['housing', 'undercity'], OUT_DISTRICTS = ['market', 'park', 'undercity', 'spire', 'commerce'];
const ALT = { 0: [46, 84, 132], 1: [58, 96, 144] };     // sky lanes, by which way the street runs: crossing streams are never level
const SHIP_ALT = { 0: 190, 1: 214 };

// ---- spots: a kerb on a street, in the direction traffic parks there
// { axis (0: street runs along v, at u = line), line, at (coordinate along it), dir, block label }
function kerbOn(city, B, h) {
  const r = B.rect, side = Math.floor(h * 4), f = (h * 4) % 1;
  const along = side < 2 ? r[0] + 10 + f * (r[2] - r[0] - 20) : r[1] + 10 + f * (r[3] - r[1] - 20);
  return side === 0 ? { axis: 1, line: B.j, at: along, dir: 1, B } : side === 1 ? { axis: 1, line: B.j + 1, at: along, dir: -1, B } : side === 2 ? { axis: 0, line: B.i, at: along, dir: -1, B } : { axis: 0, line: B.i + 1, at: along, dir: 1, B };
}
// A block of one of these districts near (i, j): the driver's idea of "somewhere round here".
function blockNear(city, i, j, kinds, seed, r) {
  for (let k = 0; k < 24; k++) {
    const a = i + Math.round((hash01(city.seed, [seed, k, 1]) - 0.5) * 2 * r), b = j + Math.round((hash01(city.seed, [seed, k, 2]) - 0.5) * 2 * r);
    if (!blockExists(city, a, b)) continue;
    const B = cityBlock(city, a, b); if (kinds.includes(B.district)) return B;
  }
  return null;
}

// ---- the fleet
const cacheF = new WeakMap();
export function cityFleet(planet, city) {
  if (cacheF.has(city)) return cacheF.get(city);
  const n = Math.ceil(city.R / PITCH), blocks = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) if (blockExists(city, i, j)) blocks.push(cityBlock(city, i, j));
  const homes = blocks.filter(B => HOME_DISTRICTS.includes(B.district)), pads = [];
  for (const B of blocks) for (const p of B.pads) pads.push({ pad: [(p.r[0] + p.r[2]) / 2, (p.r[1] + p.r[3]) / 2, p.y], B });
  const cars = [];
  const add = (kind, id, type) => { const h = k => hash01(city.seed, [id, k, 301]); cars.push({ i: cars.length, id: `cf:${id}`, kind, air: kind !== 'ground', type, ship: kind === 'ship' ? type : null, colour: Math.floor(h(1) * 997), seed: id, off: h(2), trade: type === 'taxi' ? 'taxi' : ['van', 'truck', 'tanker', 'hauler', 'pickup', 'minibus'].includes(type) ? 'delivery' : kind === 'ship' ? 'pilot' : 'commuter' }); };
  let id = 0;
  for (let k = 0; k < FLEET_SIZE.ground; k++) add('ground', id++, GROUND[Math.floor(hash01(city.seed, [k, 311]) * GROUND.length)]);
  for (let k = 0; k < FLEET_SIZE.sky; k++) add('sky', id++, SKY[Math.floor(hash01(city.seed, [k, 312]) * SKY.length)]);
  if (pads.length > 8) for (let k = 0; k < FLEET_SIZE.ship; k++) add('ship', id++, SHIPS[Math.floor(hash01(city.seed, [k, 313]) * SHIPS.length)]);
  const F = { planet, city, cars, homes, pads, blocks };
  cacheF.set(city, F);
  return F;
}
// A driver: name, home kerb, work kerb. Made when first asked for.
export function driverOf(F, car) {
  if (car.driver) return car.driver;
  const c = F.city, s = car.seed, rng = new Rng(derive(c.seed, 'driver', [s]));
  const H = F.homes[Math.floor(hash01(c.seed, [s, 321]) * F.homes.length)];
  const W = blockNear(c, H.i, H.j, WORK_DISTRICTS, s * 7 + 1, 12) || H;
  car.driver = { name: personName(rng), trade: car.trade, age: rng.int(19, 68), home: kerbOn(c, H, hash01(c.seed, [s, 322])), work: kerbOn(c, W, hash01(c.seed, [s, 323])), homeB: H, workB: W,
    period: car.kind === 'ship' ? 500 + 400 * hash01(c.seed, [s, 324]) : 520 + 380 * hash01(c.seed, [s, 324]),
    homePad: car.kind === 'ship' ? F.pads[Math.floor(hash01(c.seed, [s, 325]) * F.pads.length)] : null };
  return car.driver;
}
const P_INDEX = (d, car, t) => Math.floor(t / d.period + car.off);
const T_OF = (d, car, n) => (n - car.off) * d.period;
// Where the driver means to be for stop n, and why.
function stopFor(F, car, n) {
  const d = driverOf(F, car), c = F.city, hr = solarHour(F.planet, T_OF(d, car, n)), h = k => hash01(c.seed, [car.seed, n, k, 331]);
  const away = (kinds, why, r = 10, base = d.homeB) => { const B = blockNear(c, base.i, base.j, kinds, car.seed * 13 + n * 3, r); return B ? { ...kerbOn(c, B, h(2)), why: `${why} — ${DISTRICT_LABEL[B.district]}` } : { ...d.home, why: 'home' }; };
  if (car.kind === 'ship') { const p = h(1) < 0.45 ? d.homePad : F.pads[Math.floor(h(3) * F.pads.length)]; return { ...p, why: p === d.homePad ? 'back to base' : `a run to ${DISTRICT_LABEL[p.B.district]}` }; }
  if (car.trade === 'taxi') return hr < 3 || hr > 23.5 ? { ...d.home, why: 'going home after a shift' } : h(1) < 0.2 ? { ...d.work, why: 'waiting at the rank' } : away(OUT_DISTRICTS, 'a fare', 12, n % 2 ? d.workB : d.homeB);
  if (car.trade === 'delivery') return hr < 5 || hr > 21 ? { ...d.home, why: 'home for the night' } : h(1) < 0.25 ? { ...d.work, why: 'loading at the depot' } : away(['market', 'commerce', 'industry', 'port', 'undercity'], 'a delivery', 12, d.workB);
  if (hr < 6 || hr > 23) return { ...d.home, why: 'home, asleep' };
  if (hr < 9.5) return { ...d.work, why: 'going to work' };
  if (hr < 15.5) return h(1) < 0.85 ? { ...d.work, why: 'at work' } : away(['market', 'commerce'], 'a lunchtime errand', 6, d.workB);
  if (hr < 19) return h(1) < 0.6 ? { ...d.home, why: 'going home' } : away(['market'], 'shopping on the way home');
  return h(1) < 0.7 ? { ...d.home, why: 'home for the evening' } : away(OUT_DISTRICTS, 'out for the evening');
}
const same = (a, b) => a.pad ? a.pad === b.pad : a.axis === b.axis && a.line === b.line && a.dir === b.dir && Math.abs(a.at - b.at) < 0.5;

// ---- routes
const laneOff = i => lineWidth(i) / 4, kerbOff = i => lineWidth(i) / 2 - 1.3;
const nextLine = (city, axis, x, dir) => { let k = Math.floor(x / PITCH); while (lineAt(city, axis, k) > x) k--; while (lineAt(city, axis, k + 1) <= x) k++; return dir > 0 ? k + 1 : k; };
// A straight run along a street: heading +v on axis 0 has -u as its right, heading +u on axis 1 has +v.
const laneCoord = (city, axis, line, dir, off) => lineAt(city, axis, line) + (axis ? dir * off : -dir * off);
// → [[u, v]] through the lattice, from one spot to another; also the junctions it crosses.
function latticeRoute(city, A, B, lat = laneOff, kerb = kerbOff) {
  // legs: { axis, line, dir, from, to } (from/to along the street)
  const j1 = nextLine(city, A.axis ? 0 : 1, A.at, A.dir);
  const j2 = nextLine(city, B.axis ? 0 : 1, B.at, -B.dir);
  const J1 = A.axis ? { i: j1, j: A.line } : { i: A.line, j: j1 }, J2 = B.axis ? { i: j2, j: B.line } : { i: B.line, j: j2 };
  const u = i => lineAt(city, 0, i), v = j => lineAt(city, 1, j);
  // J1 → J2 by either corner; pick the one that doesn't double back on the way in or out
  const build = first => {
    const seq = [{ axis: A.axis, line: A.line, dir: A.dir, from: A.at, to: A.axis ? u(J1.i) : v(J1.j) }];
    const leg = (axis, line, a, b) => { if (Math.abs(a - b) > 1) seq.push({ axis, line, dir: Math.sign(b - a), from: a, to: b }); };
    if (first === 'u') { leg(1, J1.j, u(J1.i), u(J2.i)); leg(0, J2.i, v(J1.j), v(J2.j)); } else { leg(0, J1.i, v(J1.j), v(J2.j)); leg(1, J2.j, u(J1.i), u(J2.i)); }
    seq.push({ axis: B.axis, line: B.line, dir: B.dir, from: B.axis ? u(J2.i) : v(J2.j), to: B.at });
    let back = 0; for (let k = 1; k < seq.length; k++) if (seq[k].axis === seq[k - 1].axis && seq[k].dir !== seq[k - 1].dir) back++;
    return { seq, back };
  };
  const a = build('u'), b = build('v'), seq = (a.back <= b.back ? a : b).seq;
  // merge runs on one street going one way
  const legs = []; for (const q of seq) { const L = legs.at(-1); if (L && L.axis === q.axis && L.line === q.line && L.dir === q.dir) L.to = q.to; else legs.push({ ...q }); }
  // the polyline: kerb → lane → corners → lane → kerb
  const pts = [], cross = [];
  const P = (axis, line, dir, off, x) => axis ? [x, laneCoord(city, 1, line, dir, off)] : [laneCoord(city, 0, line, dir, off), x];
  const f = legs[0], l = legs.at(-1), latOf = q => lat(q.line);
  pts.push(P(f.axis, f.line, f.dir, kerb(f.line), f.from)); pts.push(P(f.axis, f.line, f.dir, latOf(f), f.from + f.dir * Math.min(12, Math.abs(f.to - f.from) * 0.4)));
  for (let k = 0; k < legs.length; k++) {
    const q = legs[k], nx = legs[k + 1];
    // the junctions along this leg
    let c = nextLine(city, q.axis ? 0 : 1, q.from + q.dir * 0.01, q.dir);
    for (let g = 0; g < 80; g++) { const y = lineAt(city, q.axis ? 0 : 1, c); if ((y - q.to) * q.dir > 1) break; cross.push({ axis: q.axis, i: q.axis ? c : q.line, j: q.axis ? q.line : c, stop: P(q.axis, q.line, q.dir, latOf(q), y - q.dir * (lineWidth(c) / 2 + 1.6)) }); c += q.dir; }
    if (!nx) break;
    if (nx.axis !== q.axis) { const ql = latOf(q), nl = latOf(nx); pts.push(q.axis ? [laneCoord(city, 0, nx.line, nx.dir, nl), laneCoord(city, 1, q.line, q.dir, ql)] : [laneCoord(city, 0, q.line, q.dir, ql), laneCoord(city, 1, nx.line, nx.dir, nl)]); }
    else { pts.push(P(q.axis, q.line, q.dir, latOf(q), q.to)); pts.push(P(nx.axis, nx.line, nx.dir, latOf(nx), nx.from)); }      // a U-turn at the junction
  }
  pts.push(P(l.axis, l.line, l.dir, latOf(l), l.to - l.dir * Math.min(12, Math.abs(l.to - l.from) * 0.4))); pts.push(P(l.axis, l.line, l.dir, kerb(l.line), l.to));
  return { pts: round(pts), cross };
}
// Round the corners, so nobody turns on a sixpence.
function round(pts) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k], a = pts[k - 1], b = pts[k + 1], la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]); if (la < 0.3 || lb < 0.3) continue;
    const r = Math.min(7, la * 0.45, lb * 0.45), A = [p[0] + (a[0] - p[0]) * r / la, p[1] + (a[1] - p[1]) * r / la], B = [p[0] + (b[0] - p[0]) * r / lb, p[1] + (b[1] - p[1]) * r / lb];
    for (let q = 0; q <= 4; q++) { const f = q / 4, g = 1 - f; out.push([g * g * A[0] + 2 * g * f * p[0] + f * f * B[0], g * g * A[1] + 2 * g * f * p[1] + f * f * B[1]]); }
  }
  out.push(pts.at(-1));
  return out;
}

// ---- trips. A trip: { pts: [[x, y, z]] world, ct: [seconds from departure at each point], t0, dur, cross, why, to, from }
const base = city => city.h + CURB;
function makeTrip(F, car, n) {
  const c = F.city, d = driverOf(F, car), from = stopFor(F, car, n - 1), to = stopFor(F, car, n), t0 = T_OF(d, car, n) + 8 + 30 * hash01(c.seed, [car.seed, n, 341]);
  const speed = car.kind === 'ground' ? Math.min(13 + 3 * hash01(c.seed, [car.seed, 342]), (TYPES[car.type]?.top || 30) * 0.8) : car.kind === 'sky' ? 34 + 14 * hash01(c.seed, [car.seed, 343]) : 62;
  const trip = { t0, why: to.why, from, to };
  const W = (u, v, y) => { const [x, z] = c.toWorld(u, v); return [x, y, z]; };
  if (same(from, to)) { trip.parked = true; return trip; }
  let path;
  if (car.kind === 'ground') {
    const r = latticeRoute(c, from, to); trip.cross = r.cross.map(q => ({ ...q, stop: c.toWorld(q.stop[0], q.stop[1]) }));
    path = r.pts.map(p => W(p[0], p[1], c.h + 0.05));
    addTimes(trip, path, () => speed);
  } else if (car.kind === 'sky') {
    const r = latticeRoute(c, from, to, i => lineWidth(i) * 0.3), alt = hash01(c.seed, [car.seed, 344]), lvl = Math.floor(alt * 3), g = c.h + 0.05, y0 = base(c);
    const yAt = k => { const a = r.pts[Math.max(0, k - 1)], b = r.pts[Math.min(r.pts.length - 1, k + 1)], ax = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 1 : 0; return y0 + ALT[ax][lvl]; };
    path = []; path.push(W(r.pts[0][0], r.pts[0][1], g));
    path.push(W(r.pts[0][0], r.pts[0][1], y0 + 14));         // straight up off the kerb, level off, away
    for (let k = 1; k < r.pts.length - 1; k++) path.push(W(r.pts[k][0], r.pts[k][1], yAt(k)));
    path.push(W(r.pts.at(-1)[0], r.pts.at(-1)[1], y0 + 14)); path.push(W(r.pts.at(-1)[0], r.pts.at(-1)[1], g));
    addTimes(trip, path, (a, b) => { const v = Math.abs(b[1] - a[1]), h = Math.hypot(b[0] - a[0], b[2] - a[2]); return v > h * 1.5 ? 7 : speed; });
  } else {
    const [u0, v0, y0] = from.pad, [u1, v1, y1] = to.pad, b0 = base(c), alt = b0 + SHIP_ALT[hash01(c.seed, [car.seed, 345]) < 0.5 ? 0 : 1];
    const su = u => lineAt(c, 0, Math.round(u / PITCH)), sv = v => lineAt(c, 1, Math.round(v / PITCH));
    path = [W(u0, v0, b0 + y0), W(u0, v0, b0 + y0 + 18), W(su(u0), sv(v0), Math.max(alt, b0 + y0 + 30)), W(su(u1), sv(v0), alt), W(su(u1), sv(v1), alt), W(u1, v1, Math.max(b0 + y1 + 30, alt - 60)), W(u1, v1, b0 + y1 + 18), W(u1, v1, b0 + y1)];
    addTimes(trip, path, (a, b) => { const v = Math.abs(b[1] - a[1]), h = Math.hypot(b[0] - a[0], b[2] - a[2]); return v > h * 1.5 ? 8 : speed; });
  }
  return trip;
}
function addTimes(trip, path, speedOf) {
  const ct = [0]; for (let k = 1; k < path.length; k++) { const a = path[k - 1], b = path[k], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); ct.push(ct[k - 1] + l / speedOf(a, b)); }
  trip.pts = path; trip.ct = ct; trip.dur = ct.at(-1);
}
function tripAt(F, car, n) {
  if (car.tn !== n) { car.trip = makeTrip(F, car, n); car.tn = n; }    // (each vehicle remembers only its current trip)
  return car.trip;
}
// Parked at a stop: where, facing which way.
function parkedAt(F, car, st, out) {
  const c = F.city;
  if (st.pad) { const [x, z] = c.toWorld(st.pad[0], st.pad[1]); out.x = x; out.y = base(c) + st.pad[2]; out.z = z; out.fx = c.cos; out.fz = c.sin; out.moving = false; return out; }
  const u = st.axis ? st.at : laneCoord(c, 0, st.line, st.dir, kerbOff(st.line)), v = st.axis ? laneCoord(c, 1, st.line, st.dir, kerbOff(st.line)) : st.at;
  const [x, z] = c.toWorld(u, v), du = st.axis ? st.dir : 0, dv = st.axis ? 0 : st.dir;
  out.x = x; out.y = c.h + 0.05; out.z = z; out.fx = du * c.cos - dv * c.sin; out.fz = du * c.sin + dv * c.cos; out.moving = false; return out;
}
// Where a vehicle is at t. Fills `out` { x, y, z, fx, fz (heading), moving, trip, seg, until (the
// moment this straight stretch or wait ends), vx, vy, vz }.
export function vehicleAt(F, car, t, out = {}) {
  const d = driverOf(F, car);
  let n = P_INDEX(d, car, t), trip = tripAt(F, car, n);
  if (trip.parked || t < trip.t0) { parkedAt(F, car, trip.parked ? trip.to : trip.from, out); out.trip = trip; out.until = trip.parked ? T_OF(d, car, n + 1) + 1 : trip.t0; out.vx = out.vy = out.vz = 0; return out; }
  const tau = t - trip.t0;
  if (tau >= trip.dur) { parkedAt(F, car, trip.to, out); out.trip = trip; out.until = T_OF(d, car, n + 1) + 1; out.vx = out.vy = out.vz = 0; return out; }
  const ct = trip.ct; let k = 1; { let lo = 1, hi = ct.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (ct[m] < tau) lo = m + 1; else hi = m; } k = lo; }
  const A = trip.pts[k - 1], B = trip.pts[k], span = ct[k] - ct[k - 1] || 1e-6, f = (tau - ct[k - 1]) / span;
  out.vx = (B[0] - A[0]) / span; out.vy = (B[1] - A[1]) / span; out.vz = (B[2] - A[2]) / span;
  out.x = A[0] + (B[0] - A[0]) * f; out.y = A[1] + (B[1] - A[1]) * f; out.z = A[2] + (B[2] - A[2]) * f;
  const h = Math.hypot(B[0] - A[0], B[2] - A[2]);
  if (h > 0.2) { out.fx = (B[0] - A[0]) / h; out.fz = (B[2] - A[2]) / h; } else { const nx = trip.pts[k + 1] || A, pv = trip.pts[k - 2] || nx, hh = Math.hypot(nx[0] - pv[0], nx[2] - pv[2]) || 1; out.fx = (nx[0] - pv[0]) / hh; out.fz = (nx[2] - pv[2]) / hh; }
  out.moving = true; out.trip = trip; out.seg = k; out.until = trip.t0 + ct[k]; out.speed = Math.hypot(out.vx, out.vy, out.vz);
  return out;
}
// One line about what a driver's doing, for talking to them or reading them.
export function purposeOf(F, car, t) { const q = vehicleAt(F, car, t); return q.trip?.why || 'parked'; }

// ---- traffic lights: each junction alternates its two streets, with a moment all red
export const SIGNAL_CYCLE = 34;
export function signalAt(city, i, j, t) { const x = (((t + hash01(city.seed, [i, j, 351]) * SIGNAL_CYCLE) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE, h = SIGNAL_CYCLE / 2; return x < h - 3 ? 0 : x < h ? -1 : x < 2 * h - 3 ? 1 : -1; }   // 0: the street along v goes; 1: the street along u; -1: all red
export const greenFor = (city, axis, i, j, t) => signalAt(city, i, j, t) === axis;
// Metres to the red light a moving ground vehicle must obey next, or Infinity.
export function redAhead(F, q, t) {
  const trip = q.trip; if (!q.moving || !trip?.cross) return Infinity;
  let best = Infinity;
  for (const c of trip.cross) {
    const dx = c.stop[0] - q.x, dz = c.stop[1] - q.z, a = dx * q.fx + dz * q.fz;
    if (a < -0.5 || a > 60 || Math.abs(dx * q.fz - dz * q.fx) > 5 || a >= best) continue;
    if (!greenFor(F.city, c.axis, c.i, c.j, t)) best = a;
  }
  return best;
}
