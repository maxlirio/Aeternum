// The Vesper's street buildings you can walk into (gen/vesper.js units): each gets a settlement-style building record, as the city's walk-in
// buildings do (world/cityreal.js), so the town's own plan generator lays out its rooms, stairs, doors and furniture, the collision world walks
// it, the use system opens its shops and the climber climbs it. In the home settlement's frame, standing on the Vesper's deck.
import { Rng } from '../core/prng.js';
import { personName, companyName } from '../gen/names.js';
import { buildingPlan } from '../gen/building.js';
import { fitOut } from '../gen/fitout.js';

const HOURS = { cantina: [16, 24], 'noodle bar': [11, 24], pawnshop: [9, 19], workshop: [7, 18], shophouse: [8, 21], offices: [8, 18] };
export function unitReal(planet, s, C, V, u) {
  if (u.real !== undefined) return u.real;
  u.real = null;
  const c = Math.cos(C.yaw), sn = Math.sin(C.yaw), toS = (x, z) => s.toLocal(C.x + x * c + z * sn, C.z - x * sn + z * c);
  const O = toS(u.O[0], u.O[1]), a = toS(u.O[0] + u.ex[0], u.O[1] + u.ex[1]), b = toS(u.O[0] + u.ez[0], u.O[1] + u.ez[1]);
  const ex = [a[0] - O[0], a[1] - O[1]], ez = [b[0] - O[0], b[1] - O[1]];
  const cs = [[0, 0], [u.w, 0], [0, u.d], [u.w, u.d]].map(([x, z]) => [O[0] + ex[0] * x + ez[0] * z, O[1] + ex[1] * x + ez[1] * z]);
  const rng = new Rng([u.seed >>> 0, 0x7e5]), shop = u.type === 'store', open = u.type !== 'hab', hours = HOURS[u.label] || [8, 20];
  const rec = {
    key: `${s.key}/building:${80000 + u.id}`, n: -1, city: true, vesper: true, unit: u, type: u.type, O, ex, ez, w: u.w, d: u.d, floors: u.F, storeyH: u.H,
    rect: [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))],
    access: open ? 'hours' : 'residents', hours: open ? hours : null, owner: shop && rng.chance(0.5) || u.type === 'office' ? companyName(rng) : personName(rng),
    label: shop ? u.label : u.type === 'hab' ? 'flats' : 'offices', base: C.y + V.DY,
  };
  try { rec.plan = buildingPlan(planet, s, rec); } catch { return null; }
  if (!rec.plan.rooms.length) return null;
  if (shop) fitOut(rec, u.label, rng);
  rec.doorPassable = id => { const dr = rec.plan.doors[id]; return !dr || dr.access !== 'unit'; };
  u.real = rec;
  return rec;
}
