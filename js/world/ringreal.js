// The houses of a spin ring's town as real buildings (gen/rings.js: the Commons' terraces). The terrace is taken in plots wide enough to live in
// (a couple of its narrow fronts each), and every plot gets a settlement-style building record, as the Vesper's street buildings do
// (world/vesperreal.js): the town's own plan generator lays out its rooms, stairs, doors and furniture, the collision world walks it, the climber
// climbs it. And the people of the ring live in them: each has a bed in one, sleeps there, is about the house morning and evening, and goes out by
// its door to walk the street in the day (pure in time: where each is at t). In the ring's flat frame (x across, y up, s along), like all of it.
import { Rng } from '../core/prng.js';
import { hashStr } from '../core/hash.js';
import { personName, companyName } from '../gen/names.js';
import { buildingPlan } from '../gen/building.js';
import { fitOut } from '../gen/fitout.js';
import { interiorPoints } from '../gen/paths.js';
import { ringLayout, W } from '../gen/rings.js';

export const STOREY = 3.3, DEPTH = 9.8;
const SHOPS = ['noodle bar', 'shophouse', 'pawnshop', 'cantina', 'workshop', 'shophouse'], HOURS = { cantina: [16, 24], 'noodle bar': [11, 24], pawnshop: [9, 19], workshop: [7, 18], shophouse: [8, 21] };
const plotsOf = new Map();
// → [{ id, side, s0, s1 (the ground it has along the ring), floors, shop, colour, k, a0, a1 (what's built on it: its neighbours lean in toward
// the axle as they rise, so each stands a little clear of the next at the ground), type }]
export function ringPlots(g) {
  if (plotsOf.has(g.key)) return plotsOf.get(g.key);
  const L = ringLayout(g), out = [];
  for (const side of [0, 1]) { let cur = null;
    const shut = () => { if (!cur) return; if (cur.s1 - cur.s0 >= 7.5) out.push(cur); cur = null; };
    for (const h of L.items.filter(it => it.t === 'house' && it.side === side).sort((a, b) => a.s0 - b.s0)) {
      if (cur && (h.s0 - cur.s1 > 0.2 || cur.s1 - cur.s0 >= 9.5)) shut();      // (a plot ends at an alley, or once it's wide enough)
      if (!cur) cur = { side, s0: h.s0, s1: h.s1, floors: h.floors, shop: h.shop, colour: h.colour, k: h.k }; else { cur.s1 = h.s1; cur.floors = Math.max(cur.floors, h.floors); }
    }
    shut(); }
  // (a farm ring's barns: each a workshop standing by the path, its doors to the middle of the ring)
  for (const h of L.items) if (h.t === 'barn') out.push({ side: h.side, s0: h.s0, s1: h.s1, floors: 1, shop: false, colour: 3, k: h.k, barn: true, fx: h.side === 0 ? h.x1 - 0.2 : h.x0 + 0.2, depth: h.x1 - h.x0 - 0.6, storey: 5.2 });
  out.forEach((P, i) => { P.id = i; P.ring = g.key; P.fx ??= P.side === 0 ? 1.2 + DEPTH : W - 1.2 - DEPTH; P.depth ??= DEPTH; P.storey ??= STOREY; const w = P.s1 - P.s0, lean = (P.floors * P.storey + 1.5) * w / g.Rf / 2 + 0.06; P.a0 = P.s0 + lean; P.a1 = P.s1 - lean; P.w = P.a1 - P.a0;
    const r = hashStr(P.k + 17, g.key) / 4294967296; P.shop = P.shop && r < 0.55; P.floors = P.shop ? Math.min(P.floors, 2) : P.floors; P.type = P.barn ? 'workshop' : P.shop ? 'store' : P.floors <= 2 ? 'house' : 'hab'; });
  plotsOf.set(g.key, out); return out;
}
// the plot's building, in the ring's flat frame: where its front left corner is, and which way its front and its depth run ([x, s] each)
export function plotFrame(P) { return P.side === 0 ? { O: [P.fx, P.a0], bx: [0, 1], bz: [-1, 0] } : { O: [P.fx, P.a1], bx: [0, -1], bz: [1, 0] }; }
// building-local (lx, lz) → the ring's (x, s), and back
export const plotToRing = (P, lx, lz) => { const F = plotFrame(P); return [F.O[0] + F.bx[0] * lx + F.bz[0] * lz, F.O[1] + F.bx[1] * lx + F.bz[1] * lz]; };

// the building record of a plot: ringB is the ring's own structure in the collision world (world/rings.js), s the settlement it's framed in
export function plotReal(planet, s, ringB, g, P) {
  if (P.real !== undefined) return P.real;
  P.real = null;
  const F = plotFrame(P), R = ringB, at = ([x, z]) => [R.O[0] + R.ex[0] * x + R.ez[0] * z, R.O[1] + R.ex[1] * x + R.ez[1] * z], vec = ([x, z]) => [R.ex[0] * x + R.ez[0] * z, R.ex[1] * x + R.ez[1] * z];
  const O = at(F.O), ex = vec(F.bx), ez = vec(F.bz), cs = [[0, 0], [P.w, 0], [0, P.depth], [P.w, P.depth]].map(([x, z]) => [O[0] + ex[0] * x + ez[0] * z, O[1] + ex[1] * x + ez[1] * z]);
  const rng = new Rng([P.k >>> 0, 0x51de + P.id]), label = P.barn ? 'barn' : P.shop ? rng.pick(SHOPS) : P.type === 'hab' ? 'flats' : 'house';
  const rec = { key: `${s.key}/building:${90000 + g.seed * 1000 + P.id}`, n: -1, ringHouse: true, plot: P, type: P.type, O, ex, ez, w: P.w, d: P.depth, floors: P.floors, storeyH: P.storey,
    rect: [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))],
    access: 'hours', hours: P.shop ? HOURS[label] : [0, 24], owner: P.shop && rng.chance(0.5) ? companyName(rng) : personName(rng), label, base: R.base };
  try { rec.plan = buildingPlan(planet, s, rec); } catch { return null; }
  if (!rec.plan.rooms.length) return null;
  if (P.shop) try { fitOut(rec, label, rng); } catch { }
  rec.doorPassable = () => true;      // (its doors stand open: the ring keeps no locks)
  P.real = rec; return rec;
}

// ---- the people who live in a plot. → [{ id, age, bed (its anchor), out, back (hours they leave and come home), lane, dir, reach, seat }]
export function plotPeople(planet, s, ringB, g, P) {
  if (P.people) return P.people; P.people = [];
  const rec = plotReal(planet, s, ringB, g, P); if (!rec || P.shop || P.barn) return P.people;
  const plan = rec.plan, rng = new Rng([P.k >>> 0, 0x9e0 + P.id]), lanes = P.side === 0 ? [12.4, 13.2, 19.6, 20.2] : [41.6, 40.8, 34.4, 33.8];
  for (const A of plan.anchors) { if (A.pose !== 'lie') continue; for (let k = 0; k < (A.slots || 1); k++) { if (!rng.chance(0.6)) continue;
      const out = rng.range(6.6, 10.5), back = rng.range(16.5, 21.5), seats = plan.anchors.filter(q => q.pose === 'sit' && q.unit === A.unit);
      let path = null; try { path = interiorPoints(plan, rec.key, { k: A.k, room: A.room, x: A.x, z: A.z }, 'outside'); } catch { }
      if (!path || path.length < 2) continue;
      // the way out by the door, then across to the lane it walks: every point in the ring's frame, with how far along it is
      const pts = path.map(q => { const [x, sv] = plotToRing(P, q[0], q[2]); return [x, q[1], sv]; }), door = pts[pts.length - 1], lane = rng.pick(lanes) + rng.range(-0.25, 0.25); pts.push([lane, 0, door[2]]);
      const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
      P.people.push({ id: `ring:${g.key}:p${P.id}:${P.people.length}`, age: rng.chance(0.14) ? rng.int(7, 15) : rng.int(18, 82), bed: A, k, out, back, lane, dir: rng.chance(0.5) ? 1 : -1, reach: rng.range(60, 150), pts, len, seat: seats.length ? rng.pick(seats) : null, sleep: rng.range(21.6, 23.4), wake: out - rng.range(0.4, 1.2), v: rng.range(1.05, 1.4) }); } }
  return P.people;
}
// where one of them is at hour h (0..24, the ring's own day) → { x, y, s (the ring's frame), facing: [dx, ds] the way they look, pose, moving }
export function personAt(g, P, m, h, C = ringLayout(g).C) {
  const onPath = d => { const L = m.len, T = L[L.length - 1], q = Math.max(0, Math.min(T, d)); let i = 1; while (i < L.length - 1 && L[i] < q) i++; const f = (q - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), a = m.pts[i - 1], b = m.pts[i]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, s: a[2] + (b[2] - a[2]) * f, face: [b[0] - a[0], b[2] - a[2]] }; };
  const total = m.len[m.len.length - 1], walk = total / m.v / 3600, bedAt = () => { const [x, sv] = plotToRing(P, m.bed.x + (m.k ? 0.45 : -0.45) * (m.bed.slots > 1 ? 1 : 0), m.bed.z), F = plotFrame(P), fx = Math.sin(m.bed.facing), fz = Math.cos(m.bed.facing); return { x, y: m.bed.y, s: sv, facing: [F.bx[0] * fx + F.bz[0] * fz, F.bx[1] * fx + F.bz[1] * fz], pose: 'lie', moving: false }; };
  if (h < m.wake || h >= m.sleep) return bedAt();
  if (h >= m.out && h < m.out + walk) { const q = onPath((h - m.out) * 3600 * m.v); return { x: q.x, y: q.y, s: q.s, facing: q.face, pose: 'stand', moving: true }; }      // going out
  if (h >= m.back - walk && h < m.back) { const q = onPath((m.back - h) * 3600 * m.v); return { x: q.x, y: q.y, s: q.s, facing: [-q.face[0], -q.face[1]], pose: 'stand', moving: true }; }      // coming home
  if (h >= m.out + walk && h < m.back - walk) {      // out: up the street and back, and again, home on the hour they turn in
    const D = (m.back - m.out - 2 * walk) * 3600, n = Math.max(1, Math.round(D * m.v / (2 * m.reach))), sp = 2 * m.reach * n / D, d = (h - m.out - walk) * 3600 * sp, u = d % (2 * m.reach), fwd = u < m.reach, off = fwd ? u : 2 * m.reach - u;
    let sv = (m.pts[m.pts.length - 1][2] + m.dir * off) % C; if (sv < 0) sv += C; return { x: m.lane, y: 0, s: sv, facing: [0, m.dir * (fwd ? 1 : -1)], pose: 'stand', moving: true }; }
  // at home, up and about: in a chair of theirs if there is one, else by the bed
  if (m.seat) { const [x, sv] = plotToRing(P, m.seat.x, m.seat.z), F = plotFrame(P), fx = Math.sin(m.seat.facing), fz = Math.cos(m.seat.facing); return { x, y: m.seat.y, s: sv, facing: [F.bx[0] * fx + F.bz[0] * fz, F.bx[1] * fx + F.bz[1] * fz], pose: 'sit', moving: false }; }
  const q = onPath(Math.min(1.6, total * 0.2)); return { x: q.x, y: q.y, s: q.s, facing: q.face, pose: 'stand', moving: false };
}
