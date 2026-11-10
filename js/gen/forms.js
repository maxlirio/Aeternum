// The shape a world's people give their buildings. Facades and materials (gen/culture.js) make two towns of boxes look
// different; this makes them different THINGS: one world crowns every house with an onion bulb and rings it with turrets,
// another grows them under mushroom caps, another stacks pagoda tiers, steps ziggurats, sets glass orbs on collars,
// sweeps shell roofs over them or raises needle spires. Every building keeps its real rectangular rooms and walls (the
// interiors, doors and collision are the plan's, gen/building.js); the form is what stands on and round them, and from
// the street it's what you see. Pure: from the world's seed and the building's key. Drawn by render/forms.js.
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { cultureOf } from './culture.js';

// every form: what its roof can be made of, whether it closes the roof over (no fire ladder up to it), its oddness
export const FORMS = {
  flat: { roofs: ['concrete'], closed: false, odd: 0 },
  gable: { roofs: ['rooftile', 'slate', 'thatch'], closed: true, odd: 0 },
  onion: { roofs: ['ceramic', 'lacquer', 'rooftile', 'hull'], closed: true, odd: 0.3 },
  dome: { roofs: ['render', 'ceramic', 'hull', 'adobe'], closed: true, odd: 0.2 },
  cap: { roofs: ['chitin', 'render', 'scales', 'leather'], closed: true, odd: 0.8 },
  cone: { roofs: ['thatch', 'slate', 'rooftile', 'scales'], closed: true, odd: 0.15 },
  pagoda: { roofs: ['rooftile', 'lacquer', 'slate', 'ceramic'], closed: true, odd: 0.25 },
  ziggurat: { roofs: ['sandstone', 'adobe', 'limestone', 'rock'], closed: false, odd: 0.2 },
  spire: { roofs: ['slate', 'metal', 'lacquer', 'ceramic'], closed: true, odd: 0.3 },
  orb: { roofs: ['hull', 'ceramic', 'lacquer'], closed: true, odd: 0.9 },
  shell: { roofs: ['ceramic', 'render', 'hull', 'chitin'], closed: true, odd: 0.7 },
  stack: { roofs: ['concrete', 'facade', 'hull'], closed: false, odd: 0.5 },
  twist: { roofs: ['hull', 'metal', 'facade', 'ceramic'], closed: false, odd: 0.75 },
  horn: { roofs: ['chitin', 'scales', 'ceramic', 'rock'], closed: true, odd: 1 },
};
// what each way of building tends to raise (gen/culture.js WAYS)
const BY_WAY = {
  corporate: { flat: 2, stack: 2, orb: 2, twist: 2, shell: 2, dome: 1 },
  masonry: { gable: 6, spire: 2, onion: 1, pagoda: 1 },
  brutalist: { flat: 1, stack: 3, ziggurat: 3, cone: 1 },
  garden: { gable: 2, shell: 3, dome: 3, pagoda: 2 },
  foundry: { flat: 1, gable: 3, stack: 2, cone: 2, twist: 1 },
  adobe: { ziggurat: 5, dome: 4, onion: 3 },
  carved: { ziggurat: 6, dome: 2, spire: 2, horn: 1 },
  stilt: { cone: 5, pagoda: 4, gable: 2, shell: 1 },
  dome: { dome: 7, orb: 3, onion: 1 },
  grown: { cap: 6, shell: 3, horn: 3, orb: 1 },
  spire: { spire: 6, onion: 3, twist: 2 },
  neon: { flat: 1, stack: 2, twist: 4, orb: 2, horn: 1 },
};
const memo = new WeakMap();
// the world's style: its main form and its second (old town, or the other people), the shape numbers they share, what the roofs are made of and their colours
export function formsOf(planet) {
  if (memo.has(planet)) return memo.get(planet);
  const r = new Rng(derive(planet.seed, 'forms')), c = cultureOf(planet), weird = planet.genome?.weird ?? 0.3, ways = planet.genome?.culture.ways || [c.key];
  const pick = (way, not) => { const W = BY_WAY[way] || BY_WAY.corporate, opts = Object.entries(W).filter(([k]) => k !== not).map(([k, w]) => [k, w * (1 + 3 * weird * FORMS[k].odd)]);
    // a strange world reaches past its tradition for something stranger
    if (weird > 0.55) for (const k of ['cap', 'orb', 'horn', 'shell', 'twist']) if (k !== not && !W[k]) opts.push([k, 1.5 * weird]);
    if (weird > 0.6) for (const o of opts) if (o[0] === 'flat' || o[0] === 'gable') o[1] = 0.05;
    return r.weighted(opts); };
  const main = pick(ways[0]), second = pick(ways[1] || ways[0], main);
  const style = k => ({ kind: k, roof: r.pick(FORMS[k].roofs), colour: r.pick(c.paints), fat: r.range(0.8, 1.25), tall: r.range(0.8, 1.35), tiers: r.int(2, 4), lobes: r.int(5, 9), flare: r.range(0.3, 1), twist: r.range(0.4, 1.4) * (r.chance(0.5) ? 1 : -1), turrets: r.chance(0.6), ribs: r.chance(0.6) });
  const out = { main: style(main), second: style(second), share: r.range(0.62, 0.85) };
  memo.set(planet, out); return out;
}
// the form of one building: its world's main style mostly, the second sometimes, each with this building's own variation.
// type: hab, office, store, house, workshop, hangar. null: a plain flat-roofed box (the world builds those too, for sheds and works).
export function formFor(planet, key, type, w, d, floors) {
  const W = formsOf(planet), h = hashStr(91, key) / 4294967296, h2 = hashStr(92, key) / 4294967296;
  if ((type === 'hangar' || type === 'workshop') && h2 < 0.4) return null;
  const S = h < W.share ? W.main : W.second;
  if (S.kind === 'flat') return null;
  const r = new Rng(derive(planet.seed, 'form', [hashStr(93, key)]));
  return { ...S, seed: hashStr(94, key), w, d, floors, closed: FORMS[S.kind].closed, j: r.range(0.88, 1.14), jt: r.range(0.85, 1.2), tone: r.range(0.82, 1.12) };
}
export const formCloses = (planet, key, type, w, d, F) => !!formFor(planet, key, type, w, d, F)?.closed;
