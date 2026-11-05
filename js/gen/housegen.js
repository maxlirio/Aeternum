// Designs for houses, written fresh for each planet instead of picked from a fixed set. A design is
// plain numbers and names: size, floors, roof, what the walls and roof are made of, how the windows
// run. Pure, and it's what the game reads (the footprint); render/housegen.js turns one into a mesh.
// How a people builds narrows the ranges; the seed picks inside them, so no two planets match.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { cultureOf } from './culture.js';

// [walls by weight, roofs by weight, roof shapes by weight, pitch range, storey range, door colour?, trim]
const TASTE = {
  masonry: { wall: { rock: 4, brick: 5, render: 1 }, roof: { slate: 5, rooftile: 3, thatch: 1 }, shape: { gable: 6, hip: 2 }, pitch: [0.55, 0.95], storey: [2.6, 3.0], floors: [1, 1, 2], trim: ['plank', 'stone'] },
  corporate: { wall: { hull: 4, render: 3, concrete: 2 }, roof: { hull: 4, concrete: 3, corrugated: 1 }, shape: { flat: 4, vault: 4, gable: 1 }, pitch: [0.06, 0.2], storey: [2.7, 3.1], floors: [1, 2], trim: ['metal', 'rubber'] },
  brutalist: { wall: { concrete: 7, brick: 2 }, roof: { concrete: 6, corrugated: 2 }, shape: { flat: 8, gable: 1 }, pitch: [0.15, 0.3], storey: [2.7, 3.0], floors: [1, 2, 2], trim: ['metal'] },
  garden: { wall: { render: 6, plank: 3, rock: 1 }, roof: { rooftile: 5, thatch: 3 }, shape: { hip: 4, gable: 4 }, pitch: [0.3, 0.7], storey: [2.7, 3.2], floors: [1, 1, 2], trim: ['paint', 'plank'] },
  foundry: { wall: { corrugated: 5, brick: 4, concrete: 1 }, roof: { corrugated: 6, slate: 2 }, shape: { gable: 7, flat: 1 }, pitch: [0.2, 0.5], storey: [2.6, 2.9], floors: [1, 1, 2], trim: ['metal', 'stone'] },
  neon: { wall: { corrugated: 4, concrete: 4, hull: 2 }, roof: { corrugated: 4, concrete: 3 }, shape: { flat: 5, gable: 3 }, pitch: [0.14, 0.3], storey: [2.5, 2.8], floors: [1, 2, 3], trim: ['metal', 'paint'] },
};
const entries = o => Object.entries(o);
const DESIGNS = 5;                                       // how many kinds of house one planet has
const memo = new WeakMap();
export function houseDesigns(planet) {
  if (memo.has(planet)) return memo.get(planet);
  const key = cultureOf(planet).key, T = TASTE[key] || TASTE.corporate, out = [];
  for (let i = 0; i < DESIGNS; i++) {
    const r = new Rng(derive(planet.seed, 'house', [i]));
    const floors = r.pick(T.floors), storey = r.range(...T.storey), w = r.range(5.8, 10.5), d = r.range(4.4, 6.6), shape = r.weighted(entries(T.shape));
    const bays = Math.max(2, Math.round(w / r.range(1.9, 2.8)));
    out.push({
      id: `house_${i}`, w: +w.toFixed(2), d: +d.toFixed(2), floors, storey: +storey.toFixed(2), h: +(floors * storey).toFixed(2),
      shape, pitch: +r.range(...T.pitch).toFixed(2), over: +r.range(0.15, 0.55).toFixed(2), wall: r.weighted(entries(T.wall)), roof: r.weighted(entries(T.roof)), trim: r.pick(T.trim), base: r.pick(['concrete', 'rock', 'stone']),
      bays, winW: +r.range(0.7, 1.25).toFixed(2), winH: +r.range(0.9, 1.5).toFixed(2), sill: +r.range(0.85, 1.1).toFixed(2), mullions: r.int(0, 2),
      door: +(r.range(-0.3, 0.3)).toFixed(2), porch: r.chance(0.45), chimney: shape !== 'flat' && r.chance(0.7), chimneyAt: +r.range(-0.35, 0.35).toFixed(2), shutters: r.chance(0.3), band: floors > 1 && r.chance(0.6), corner: r.chance(0.3),
    });
  }
  memo.set(planet, out); return out;
}
// the footprint the game walks into, from the design, never the mesh
export const houseFoot = D => [D.w / 2, D.d / 2, D.h];
