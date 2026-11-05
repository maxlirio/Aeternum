// City buildings you can walk into. The low-rise ones the city generator marks `enter`
// (market shophouses, the Warrens' cantinas, noodle bars, pawnshops, workshops, dens,
// tenements and flophouses) are given a settlement-style building record so the town's
// own plan generator (gen/building.js) lays out their rooms, stairs and furniture, and the
// collision world, the use system (shops, containers, beds, lights) and the HUD all treat
// them like any other building. The record lives in the home settlement's frame, as
// landed ships do (a structure with its own frame and floor height).
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { CURB } from '../gen/city.js';
import { personName, companyName } from '../gen/names.js';
import { buildingPlan } from '../gen/building.js';
import { fitOut } from '../gen/fitout.js';

const STORE_HOURS = { cantina: [16, 28], 'noodle bar': [11, 26], pawnshop: [9, 19], workshop: [7, 18], 'chop shop': [10, 22], den: [18, 30], shophouse: [8, 21] };

// The settlement-style record for city building `cb` in block B (cached on cb), or null.
export function realOf(planet, s, city, B, cb) {
  if (cb.real !== undefined) return cb.real;
  cb.real = null;
  if (!cb.enter) return null;
  const t0 = cb.tiers[0], R = B.rect, [u0, v0, u1, v1] = t0.r, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  // the front faces the nearest street
  const side = [[cv - R[1], 0], [R[3] - cv, 1], [cu - R[0], 2], [R[2] - cu, 3]].sort((p, q) => p[0] - q[0])[0][1];
  const ez = [[0, 1], [0, -1], [1, 0], [-1, 0]][side], ex = [ez[1], -ez[0]];
  const w = side < 2 ? u1 - u0 : v1 - v0, d = side < 2 ? v1 - v0 : u1 - u0;
  const Ou = ex[0] > 0 ? u0 : ex[0] < 0 ? u1 : side === 2 ? u0 : u1, Ov = ex[1] > 0 ? v0 : ex[1] < 0 ? v1 : side === 0 ? v0 : v1;
  const h0 = t0.y1 - t0.y0, F = Math.max(1, Math.min(4, Math.round(h0 / 3.3))), H = h0 / F;
  // city-local → world → settlement-local
  const toS = (u, v) => s.toLocal(...city.toWorld(u, v));
  const vecS = ([a, b]) => { const wx = a * city.cos - b * city.sin, wz = a * city.sin + b * city.cos; return [wx * s.cos + wz * s.sin, -wx * s.sin + wz * s.cos]; };
  const O = toS(Ou, Ov), exS = vecS(ex), ezS = vecS(ez);
  const cs = [[0, 0], [w, 0], [0, d], [w, d]].map(([x, z]) => [O[0] + exS[0] * x + ezS[0] * z, O[1] + exS[1] * x + ezS[1] * z]);
  const rng = new Rng(derive(city.seed, 'real', [B.i, B.j, B.buildings.indexOf(cb)]));
  const shop = cb.enter === 'store', hours = STORE_HOURS[cb.label] || [9, 20];
  const rec = {
    key: city.address.child('building', B.i + 5000, B.j + 5000, B.buildings.indexOf(cb)).key, n: -1, city: true, cityId: cb.id,
    type: cb.enter, O, ex: exS, ez: ezS, w: +w.toFixed(2), d: +d.toFixed(2), floors: F, storeyH: H,
    rect: [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))],
    access: shop ? 'hours' : 'residents', hours: shop ? [hours[0], Math.min(24, hours[1])] : null,
    owner: shop && rng.chance(0.5) ? companyName(rng) : personName(rng), label: cb.label, base: city.h + CURB,
  };
  // the town's plan generator wants its own size range: only buildings it can lay out become real
  try { rec.plan = buildingPlan(planet, s, rec); } catch { return null; }
  if (!rec.plan.rooms.length) return null;
  fitOut(rec, cb.label, rng);
  // doors: the street doors and shop interiors are open; flats keep their own locks
  rec.doorPassable = id => { const dr = rec.plan.doors[id]; return !dr || dr.access !== 'unit'; };
  cb.real = rec;
  return rec;
}
