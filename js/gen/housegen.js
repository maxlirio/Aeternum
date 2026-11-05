// Buildings designed for each planet instead of picked from a fixed set: what people live and work
// in. A design is plain numbers and names: size, floors, roof, what the walls and roof are made of,
// how the windows run. Pure, and it's what the game reads (footprint, floor plan); render/housegen.js
// turns one into a mesh. How a people builds narrows the ranges; the seed picks inside them, so no
// two planets match. The floor plan comes from the design too, so the outside you see from far off
// and the rooms you walk into are one building.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { cultureOf } from './culture.js';
import { buildingPlan, refurnished } from './building.js';
import { fitOut } from './fitout.js';

// [walls by weight, roofs by weight, roof shapes by weight, pitch range, storey range, floors, trim]
const TASTE = {
  masonry: { wall: { limestone: 3, rock: 2, brick: 5, render: 1 }, roof: { slate: 5, rooftile: 3, thatch: 1 }, shape: { gable: 6, hip: 2 }, pitch: [0.55, 0.95], storey: [2.6, 3.0], floors: [1, 1, 2], trim: ['plank', 'limestone'] },
  corporate: { wall: { hull: 4, render: 3, concrete: 2 }, roof: { hull: 4, concrete: 3, corrugated: 1 }, shape: { flat: 4, vault: 4, gable: 1 }, pitch: [0.06, 0.2], storey: [2.7, 3.1], floors: [1, 2], trim: ['metal', 'rubber'] },
  brutalist: { wall: { concrete: 7, brick: 2 }, roof: { concrete: 6, corrugated: 2 }, shape: { flat: 8, gable: 1 }, pitch: [0.15, 0.3], storey: [2.7, 3.0], floors: [1, 2, 2], trim: ['metal'] },
  garden: { wall: { render: 4, plank: 3, rock: 1, adobe: 4 }, roof: { rooftile: 5, thatch: 3 }, shape: { hip: 4, gable: 4 }, pitch: [0.3, 0.7], storey: [2.7, 3.2], floors: [1, 1, 2], trim: ['paint', 'plank'] },
  foundry: { wall: { corrugated: 5, brick: 4, concrete: 1, rust: 2 }, roof: { corrugated: 6, slate: 2, rust: 3 }, shape: { gable: 7, flat: 1 }, pitch: [0.2, 0.5], storey: [2.6, 2.9], floors: [1, 1, 2], trim: ['metal', 'limestone'] },
  neon: { wall: { corrugated: 4, concrete: 4, hull: 2 }, roof: { corrugated: 4, concrete: 3 }, shape: { flat: 5, gable: 3 }, pitch: [0.14, 0.3], storey: [2.5, 2.8], floors: [1, 2, 3], trim: ['metal', 'paint'] },
};
const OPEN = null, DAY = [8, 18];
// each kind of building: plan type, width, depth, floors (taste if unset), storey height (taste if unset), rooms (entry first),
// who gets in, hours, and what it has that the others don't. `n` designs per planet.
export const FORMS = {
  cottage: { n: 6, type: 'house', w: [6.8, 11.5], d: [6, 8.8], access: 'residents' },
  hut: { n: 3, type: 'house', w: [5, 7], d: [4.6, 5.8], floors: [1], access: 'residents' },
  longhouse: { n: 3, type: 'workshop', w: [16, 25], d: [7, 9], floors: [1], storey: [3, 3.6], access: 'hours', hours: [7, 19], rooms: ['stalls', 'storage'], roomArea: 70 },
  shop: { n: 4, type: 'store', w: [7.5, 11.5], d: [7.5, 10.5], floors: [1, 1, 2], storey: [3.1, 3.6], access: 'hours', hours: [8, 19], extra: { shopfront: true, awning: true, fascia: true } },
  inn: { n: 3, type: 'hab', w: [11, 15], d: [8.6, 11], floors: [2, 3], storey: [2.9, 3.2], access: OPEN, rooms: ['taproom', 'kitchen'], roomArea: 80, extra: { hanging: true } },
  tenement: { n: 3, type: 'hab', w: [12, 17], d: [8.6, 11], floors: [3, 4], storey: [2.7, 3], access: OPEN, extra: { balconies: true }, noThatch: true },
  hall: { n: 3, type: 'office', w: [13, 19], d: [9, 13], floors: [1], storey: [4.2, 5.4], access: 'hours', hours: DAY, rooms: ['assembly', 'storage'], roomArea: 150, extra: { portico: true, fascia: true }, noThatch: true },
  school: { n: 3, type: 'office', w: [14, 21], d: [8.2, 10.5], floors: [1, 2], storey: [3.2, 3.6], access: 'hours', hours: DAY, rooms: ['classroom', 'classroom', 'office'], roomArea: 38, extra: { bell: true, tallWindows: true }, noThatch: true },
  clinic: { n: 3, type: 'office', w: [10, 15], d: [8, 10.5], floors: [1], storey: [3.1, 3.5], access: 'hours', hours: [7, 21], rooms: ['reception', 'ward', 'ward', 'office'], roomArea: 26, extra: { badge: true, fascia: true }, noThatch: true },
  temple: { n: 3, type: 'office', w: [9, 13], d: [15, 21], floors: [1], storey: [5.4, 7.5], access: OPEN, rooms: ['nave'], roomArea: 500, extra: { ridgeZ: true, spire: true, tallWindows: true }, noThatch: true, pitch: [0.7, 1.1] },
  smithy: { n: 2, type: 'workshop', w: [8.5, 13], d: [8, 11], floors: [1], storey: [3.6, 4.2], access: 'hours', hours: [7, 18], rooms: ['forge', 'storage'], roomArea: 80, bigDoor: [3, 2.8], extra: { flue: true } },
  garage: { n: 3, type: 'workshop', w: [10, 15], d: [9, 13], floors: [1], storey: [4.2, 4.8], access: 'hours', hours: [7, 18], roomArea: 130, bigDoor: [4.2, 3.4], extra: { fascia: true }, noThatch: true },
  warehouse: { n: 3, type: 'workshop', w: [18, 28], d: [14, 20], floors: [1], storey: [6.5, 8], access: 'staff', rooms: ['storage', 'office'], roomArea: 400, bigDoor: [5.5, 4.6], noThatch: true },
  barn: { n: 3, type: 'workshop', w: [14, 22], d: [9, 13], floors: [1], storey: [4.6, 6], access: 'hours', hours: [6, 20], rooms: ['stalls', 'storage'], roomArea: 200, bigDoor: [3.6, 3.4], extra: { pitched: true }, pitch: [0.5, 0.9] },
  shed: { n: 3, type: 'workshop', w: [3.8, 6], d: [3.4, 5], floors: [1], storey: [2.4, 2.8], access: 'residents', rooms: ['storage'], roomArea: 60 },
  shelterhut: { n: 2, type: 'house', w: [5, 6.5], d: [4.6, 5.6], floors: [1], access: null, extra: { pitched: true }, pitch: [0.6, 1] },
  pumphouse: { n: 2, type: 'workshop', w: [4.4, 6.5], d: [4, 5.5], floors: [1], storey: [2.7, 3.2], access: 'staff', rooms: ['forge'], roomArea: 60 },
  sawmill: { n: 2, type: 'workshop', w: [16, 24], d: [9, 13], floors: [1], storey: [4.2, 5.2], access: 'hours', hours: [7, 18], rooms: ['shopfloor-workshop', 'storage'], roomArea: 180, bigDoor: [4, 3.4], extra: { flue: true } },
  markethall: { n: 2, type: 'store', w: [18, 26], d: [12, 16], floors: [1], storey: [4.8, 6], access: null, rooms: ['shopfloor'], roomArea: 600, bigDoor: [3.4, 3.4], extra: { tallWindows: true, fascia: true }, noThatch: true },
  hangar: { n: 2, type: 'workshop', w: [22, 34], d: [18, 26], floors: [1], storey: [7, 9], access: 'staff', rooms: ['hangar'], roomArea: 900, bigDoor: [14, 6.2], extra: { vaulted: true }, pitch: [0.2, 0.34], noThatch: true },
  factory: { n: 3, type: 'workshop', w: [24, 36], d: [16, 24], floors: [1], storey: [6, 8], access: 'hours', hours: [6, 22], rooms: ['shopfloor-workshop', 'storage', 'office'], roomArea: 240, bigDoor: [5, 4.4], extra: { stacks: true, fascia: true }, noThatch: true },
  barracks: { n: 2, type: 'hab', w: [16, 23], d: [8.6, 10.5], floors: [2, 3], storey: [2.8, 3.1], access: 'staff', rooms: ['lobby', 'utility'], extra: { plain: true }, noThatch: true },
  controltower: { n: 2, type: 'office', w: [9.2, 11], d: [8.6, 10], floors: [3, 4, 5], storey: [3, 3.4], access: 'staff', rooms: ['reception', 'office'], roomArea: 30, extra: { cab: true, flat: true }, noThatch: true },
  observatory: { n: 2, type: 'office', w: [10, 14], d: [10, 14], floors: [1], storey: [4, 5], access: 'staff', rooms: ['office', 'meeting'], roomArea: 60, extra: { dome: true, flat: true }, noThatch: true },
  guardhouse: { n: 2, type: 'workshop', w: [4.2, 6], d: [3.8, 5], floors: [1], storey: [2.6, 2.9], access: 'staff', rooms: ['reception'], roomArea: 60, extra: { flat: true }, noThatch: true },
  stable: { n: 2, type: 'workshop', w: [12, 18], d: [7, 9], floors: [1], storey: [3, 3.5], access: 'hours', hours: [6, 20], rooms: ['stalls'], roomArea: 200, bigDoor: [2.6, 2.6] },
};
const FAM_KEYS = Object.keys(FORMS);
const entries = o => Object.entries(o);
const memo = new WeakMap();
export function designsFor(planet, fam) {
  let m = memo.get(planet); if (!m) memo.set(planet, m = new Map());
  if (m.has(fam)) return m.get(fam);
  const F = FORMS[fam], T = TASTE[cultureOf(planet).key] || TASTE.corporate, out = [], fi = FAM_KEYS.indexOf(fam);
  for (let i = 0; i < F.n; i++) {
    const r = new Rng(derive(planet.seed, 'house', [fi, i]));
    const floors = r.pick(F.floors || T.floors), storey = r.range(...(F.storey || T.storey)), w0 = r.range(...F.w), d0 = r.range(...F.d);
    // a stair needs a run of its own: buildings of more than one floor have the width and depth for one
    const w = floors > 1 ? Math.max(w0, 9.2) : w0, d = floors > 1 ? Math.max(d0, 8.2) : d0;
    let roof = r.weighted(entries(T.roof)); const shape = r.weighted(entries(T.shape));
    if (F.noThatch && roof === 'thatch') roof = 'slate';
    const x = F.extra || {}, tall = x.tallWindows;
    out.push({
      id: `gb_${fam}_${i}`, fam, type: F.type, access: F.access, hours: F.hours || null, roomArea: F.roomArea || 0, rooms: F.rooms || null, bigDoor: F.bigDoor || null, ...x,
      w: +w.toFixed(2), d: +d.toFixed(2), floors, storey: +storey.toFixed(2), h: +(floors * storey).toFixed(2),
      shape: x.vaulted ? 'vault' : x.flat ? 'flat' : x.ridgeZ || x.pitched ? 'gable' : shape, pitch: +r.range(...(F.pitch || T.pitch)).toFixed(2), over: +r.range(0.15, 0.55).toFixed(2), wall: r.weighted(entries(T.wall)), roof, trim: r.pick(T.trim), base: r.pick(['concrete', 'rock', 'limestone']),
      winW: +r.range(0.8, tall ? 1.2 : 1.35).toFixed(2), winH: +(tall ? r.range(2, Math.max(2.1, storey - 1.6)) : r.range(1, 1.5)).toFixed(2), sill: +r.range(0.85, 1.1).toFixed(2), winGap: +r.range(2.2, 3.2).toFixed(2), mullions: r.int(0, 2),
      porch: !x.portico && !x.awning && r.chance(0.45), chimney: shape !== 'flat' && r.chance(0.7), chimneyAt: +r.range(-0.35, 0.35).toFixed(2), shutters: r.chance(0.3), band: floors > 1 && r.chance(0.6), corner: r.chance(0.3),
    });
  }
  m.set(fam, out); return out;
}
export const houseDesigns = planet => designsFor(planet, 'cottage');
export function designById(planet, id) { const [, fam, i] = id.split('_'); return designsFor(planet, fam)[+i]; }
// the footprint the game walks into, from the design, never the mesh
export const houseFoot = D => [D.w / 2, D.d / 2, D.h];
// the same plan the walls and windows come from. Every copy of a design shares its layout
export function designPlan(planet, D) {
  if (D.plan_) return D.plan_;
  const key = `design:${planet.seed[0] >>> 0},${planet.seed[1] >>> 0},${FAM_KEYS.indexOf(D.fam)},${+D.id.split('_')[2]}`;
  const pl = buildingPlan(planet, null, { key, n: -1, type: D.type, w: D.w, d: D.d, floors: D.floors, storeyH: D.storey, access: D.access || 'open', hours: D.hours, design: D, roomArea: D.roomArea || undefined, roomKinds: D.rooms, bigDoor: D.bigDoor });
  pl.roofSlopes = roofSlopes(D);
  Object.defineProperty(D, 'plan_', { value: pl, enumerable: false });
  return pl;
}
// the roof as your feet find it: slopes in plan coordinates, across z or (a = 'x') across x
function roofSlopes(D) {
  if (D.shape === 'flat') return [];
  const across = D.ridgeZ ? D.w : D.d, along = D.ridgeZ ? D.d : D.w, rise = across / 2 * D.pitch, n = D.shape === 'vault' ? 6 : 2, out = [];
  for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 1) / n, y = f => D.shape === 'vault' ? D.h + 4 * rise * f * (1 - f) : D.h + rise * (1 - Math.abs(2 * f - 1));
    out.push(D.ridgeZ ? { a: 'x', x0: f0 * across, x1: f1 * across, z0: 0, z1: along, y0: y(f0), y1: y(f1) } : { a: 'z', x0: 0, x1: along, z0: f0 * across, z1: f1 * across, y0: y(f0), y1: y(f1) }); }
  return out;
}
// the design's rooms with this copy's own furniture in them, so two houses of a design aren't lived in alike
export function itemPlan(planet, D, it) {
  if (it.plan_) return it.plan_;
  const pl = refurnished(designPlan(planet, D), derive(planet.seed, 'furnish', [Math.round(it.x * 4), Math.round(it.z * 4)]));
  pl.roofSlopes = designPlan(planet, D).roofSlopes;
  const fit = { plan: pl }; fitOut(fit, D.fam, new Rng(derive(planet.seed, 'fitout', [Math.round(it.x * 4), Math.round(it.z * 4)])));
  const done = fit.plan; done.decor = fit.decor || [];
  Object.defineProperty(it, 'plan_', { value: done, enumerable: false });
  return done;
}
// someone who works there: where they stand, what they're at, and when. Behind the counter if there is one.
const WORKS = { shop: 'keeping shop', inn: 'behind the bar', clinic: 'seeing patients', school: 'teaching', smithy: 'at the forge', garage: 'under a car', temple: 'tending the temple', hall: 'minding the hall', stable: 'seeing to the animals', markethall: 'minding a stall', sawmill: 'at the saw', barn: 'in the barn', factory: 'on the line', hangar: 'on the apron', controltower: 'in the tower', observatory: 'at the telescope', guardhouse: 'on the gate' };
export function keeperOf(planet, D, it) {
  const what = WORKS[D.fam]; if (!what) return null;
  const pl = itemPlan(planet, D, it), dr = pl.doors[pl.entrance], R = pl.rooms.find(r => r.i === dr.rooms[0]) || pl.rooms[0], solid = pl.props.filter(p => p.k === 0 && !p.soft).concat((pl.solids || []).map(q => ({ x0: q[0], z0: q[1], x1: q[2], z1: q[3], kind: 'fit', k: 0 }))), free = (x, z) => x > R.rect[0] + 0.4 && x < R.rect[2] - 0.4 && z > R.rect[1] + 0.4 && z < R.rect[3] - 0.4 && !solid.some(p => x > p.x0 - 0.35 && x < p.x1 + 0.35 && z > p.z0 - 0.35 && z < p.z1 + 0.35);
  const bar = (pl.decor || []).find(q => q.k === 'bar_counter'), bench = bar ? { x0: bar.x - 2.1, x1: bar.x + 2.1, z0: bar.z - 0.35, z1: bar.z + 0.35 } : solid.find(p => /counter|bench/.test(p.kind) && p.room === R.i), tries = [];
  if (bench) { const cx = (bench.x0 + bench.x1) / 2, cz = (bench.z0 + bench.z1) / 2; tries.push([cx, bench.z1 + 0.55], [cx, bench.z0 - 0.55], [bench.x0 - 0.55, cz], [bench.x1 + 0.55, cz]); }
  for (let f = 0.8; f > 0.1; f -= 0.14) for (const g of [0.5, 0.3, 0.7]) tries.push([R.rect[0] + (R.rect[2] - R.rect[0]) * g, R.rect[1] + (R.rect[3] - R.rect[1]) * f]);
  const spot = bar ? [bar.x, bar.z + 0.72] : tries.find(([x, z]) => free(x, z)); if (!spot) return null;     // (a barkeep's place is the gap between the bar and its shelves)
  const c = Math.cos(it.rot), s = Math.sin(it.rot), u = spot[0] - D.w / 2, v = spot[1] - D.d / 2, look = bench ? [(bench.x0 + bench.x1) / 2 - spot[0], (bench.z0 + bench.z1) / 2 - spot[1]] : [dr.x - spot[0], dr.z - spot[1]];
  return { x: it.x + u * c + v * s, y: it.y, z: it.z - u * s + v * c, facing: it.rot + Math.atan2(look[0], look[1]), what, hours: D.hours || [8, 22] };
}
