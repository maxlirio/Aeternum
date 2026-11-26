// The people of a building that stands somewhere other than a town (a ship's deck, a spin ring): whoever sleeps in its beds, and whoever keeps
// its shop. Pure in time, from the building's own plan (gen/building.js) and nothing else: each has a bed, is in it at night, is about the house
// morning and evening, and goes out by the door in the day to walk the pavement in front of the terrace and come home again; a shop's keeper is
// at the counter in its hours. Everything building-local (x along the front, y up, z in from the front): whoever draws them puts them in the world.
import { Rng } from '../core/prng.js';
import { hashStr } from '../core/hash.js';
import { interiorPoints } from '../gen/paths.js';

const cache = new WeakMap();
// → [{ id, age, kind: 'home' | 'keeper', … }]
export function homeFolk(rec) {
  if (cache.has(rec)) return cache.get(rec);
  const out = [], plan = rec.plan, rng = new Rng([hashStr(31, rec.key) >>> 0, 0x40e]); cache.set(rec, out); if (!plan) return out;
  if (rec.type === 'store' || rec.type === 'workshop' || rec.type === 'office') { const A = plan.anchors.find(a => a.kind === 'work'), hrs = rec.hours || [8, 20];
    if (A) out.push({ id: rec.key + ':keeper', kind: 'keeper', age: rng.int(19, 68), at: A, from: hrs[0], to: Math.min(hrs[1], 23.9) }); }
  if (rec.type !== 'hab' && rec.type !== 'house') return out;
  for (const A of plan.anchors) { if (A.pose !== 'lie') continue; for (let k = 0; k < (A.slots || 1); k++) { if (!rng.chance(0.55)) continue;
      let path = null; try { path = interiorPoints(plan, rec.key, { k: A.k, room: A.room, x: A.x, z: A.z }, 'outside'); } catch { }
      if (!path || path.length < 2) continue;
      const pts = path.map(q => [q[0], q[1], q[2]]), door = pts[pts.length - 1], z = -2.2 - rng.range(0, 1.2); pts.push([door[0], door[1], z]);
      const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
      const outH = rng.range(6.6, 10.5), seats = plan.anchors.filter(q => q.pose === 'sit' && q.unit === A.unit);
      out.push({ id: `${rec.key}:r${out.length}`, kind: 'home', age: rng.chance(0.14) ? rng.int(7, 15) : rng.int(18, 82), bed: A, k, out: outH, back: rng.range(16.5, 21.5), wake: outH - rng.range(0.4, 1.2), sleep: rng.range(21.6, 23.4), z, dir: rng.chance(0.5) ? 1 : -1, reach: rng.range(14, 34), v: rng.range(1.05, 1.4), pts, len, seat: seats.length ? rng.pick(seats) : null }); } }
  return out;
}
// where one of them is at hour h (0..24) → { p: [x, y, z], face: [dx, dz] the way they look, pose, moving }, or null when they're not there (a keeper out of hours)
export function folkAt(m, h) {
  const dirOf = a => [Math.sin(a), Math.cos(a)];
  if (m.kind === 'keeper') return h >= m.from && h < m.to ? { p: [m.at.x, m.at.y, m.at.z], face: dirOf(m.at.facing), pose: 'stand', moving: false } : null;
  const onPath = d => { const L = m.len, T = L[L.length - 1], q = Math.max(0, Math.min(T, d)); let i = 1; while (i < L.length - 1 && L[i] < q) i++; const f = (q - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), a = m.pts[i - 1], b = m.pts[i]; return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], face: [b[0] - a[0], b[2] - a[2]] }; };
  const total = m.len[m.len.length - 1], walk = total / m.v / 3600;
  if (h < m.wake || h >= m.sleep) return { p: [m.bed.x + (m.bed.slots > 1 ? (m.k ? 0.45 : -0.45) : 0), m.bed.y, m.bed.z], face: dirOf(m.bed.facing), pose: 'lie', moving: false };
  if (h >= m.out && h < m.out + walk) { const q = onPath((h - m.out) * 3600 * m.v); return { p: q.p, face: q.face, pose: 'stand', moving: true }; }
  if (h >= m.back - walk && h < m.back) { const q = onPath((m.back - h) * 3600 * m.v); return { p: q.p, face: [-q.face[0], -q.face[1]], pose: 'stand', moving: true }; }
  if (h >= m.out + walk && h < m.back - walk) { const D = (m.back - m.out - 2 * walk) * 3600, n = Math.max(1, Math.round(D * m.v / (2 * m.reach))), sp = 2 * m.reach * n / D, d = (h - m.out - walk) * 3600 * sp, u = d % (2 * m.reach), fwd = u < m.reach, off = fwd ? u : 2 * m.reach - u, door = m.pts[m.pts.length - 1];
    return { p: [door[0] + m.dir * off, door[1], m.z], face: [m.dir * (fwd ? 1 : -1), 0], pose: 'stand', moving: true }; }
  if (m.seat) return { p: [m.seat.x, m.seat.y, m.seat.z], face: dirOf(m.seat.facing), pose: 'sit', moving: false };
  const q = onPath(Math.min(1.6, total * 0.2)); return { p: q.p, face: q.face, pose: 'stand', moving: false };
}
