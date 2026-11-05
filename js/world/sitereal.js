// Country buildings you can walk into. Up close, a designed building in a village (gen/housegen.js)
// becomes a settlement-style record: the collision world, the use system (shops, beds, containers,
// lights) and the HUD treat it like any building in town. The record lives in the home settlement's
// frame, as landed ships and the city's walk-in buildings do. Its rooms come from its design.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { personName, companyName } from '../gen/names.js';
import { designById, itemPlan } from '../gen/housegen.js';

const LABEL = { cottage: 'House', hut: 'Hut', longhouse: 'Longhouse', shop: 'Shop', inn: 'Inn', tenement: 'Tenement', hall: 'Hall', school: 'School', clinic: 'Clinic', temple: 'Temple', smithy: 'Smithy', garage: 'Garage', warehouse: 'Warehouse', stable: 'Stable' };

// the record for item `it` (index i) of a site, cached on the item
export function siteReal(planet, s, site, it, i) {
  if (it.real) return it.real;
  const D = designById(planet, it.k), c = Math.cos(it.rot), sn = Math.sin(it.rot);
  // kit axes: the model's x and z turned by rot, in the world
  const exW = [c, -sn], ezW = [sn, c], toS = (wx, wz) => s.toLocal(wx, wz);
  const vecS = ([a, b]) => [a * s.cos + b * s.sin, -a * s.sin + b * s.cos];
  const [wx, wz] = [it.x - exW[0] * D.w / 2 - ezW[0] * D.d / 2, it.z - exW[1] * D.w / 2 - ezW[1] * D.d / 2];
  const O = toS(wx, wz), ex = vecS(exW), ez = vecS(ezW), corners = [[0, 0], [D.w, 0], [0, D.d], [D.w, D.d]].map(([x, z]) => [O[0] + ex[0] * x + ez[0] * z, O[1] + ex[1] * x + ez[1] * z]);
  const [, ti, tj] = /site:(-?\d+),(-?\d+)/.exec(site.id), rng = new Rng(derive(planet.seed, 'sitereal', [+ti, +tj, i]));
  const commerce = D.access === 'hours';
  const rec = {
    key: `site:${+ti},${+tj}/building:${i}`, n: -1, country: true, type: D.type, O, ex, ez, w: D.w, d: D.d, floors: D.floors, storeyH: D.storey, footing: true, design: D, item: it, site, worldO: [wx, wz],
    rect: [Math.min(...corners.map(q => q[0])), Math.min(...corners.map(q => q[1])), Math.max(...corners.map(q => q[0])), Math.max(...corners.map(q => q[1]))],
    access: D.access || 'open', hours: D.hours, owner: commerce || D.fam === 'warehouse' ? (rng.chance(0.5) ? companyName(rng) : personName(rng)) : D.access ? personName(rng) : site.label, label: LABEL[D.fam] || 'Building', base: it.y, plan: itemPlan(planet, D, it),
  };
  it.real = rec;
  // the flight of steps up to the door is a little structure of its own, a slope for the feet
  if (it.stoop) {
    const q = it.stoop, L = q.n * q.run + 0.5, h = L * q.rise / q.run,   /* (a little longer than the treads, so the feet find the slope before the wall stops them) */
      x0 = D.w / 2 + q.u - q.W / 2, ou = O[0] + ex[0] * x0 - ez[0] * L, ov = O[1] + ex[1] * x0 - ez[1] * L;
    const cs = [[0, 0], [q.W, 0], [0, L], [q.W, L]].map(([x, z]) => [ou + ex[0] * x + ez[0] * z, ov + ex[1] * x + ez[1] * z]);
    rec.stoop = { key: rec.key + '/steps', n: -1, country: true, type: D.type, O: [ou, ov], ex, ez, w: q.W, d: L, floors: 1, storeyH: 3, base: it.y, owner: rec.owner, label: rec.label, access: 'open',
      rect: [Math.min(...cs.map(a => a[0])), Math.min(...cs.map(a => a[1])), Math.max(...cs.map(a => a[0])), Math.max(...cs.map(a => a[1]))],
      plan: { key: rec.key + '/steps', w: q.W, d: L, F: 1, H: 3, walls: [], slabs: [], rooms: [], doors: [], props: [], windows: [], ramps: [{ k: 0, x0: 0, x1: q.W, z0: 0, z1: L, y0: -h, y1: 0 }] } };
  }
  return rec;
}
