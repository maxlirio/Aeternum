// Weapons. What each does (the numbers the fight rules read) and what each looks like on this planet: every world's
// gunsmiths and bladesmiths work to their own habit, so a pistol here isn't the pistol on the next world. A design is pure
// numbers; render/weapons.js builds the model. All models share one convention, so any hand can hold them:
//   the origin is the centre of the palm, +z points out along the barrel or blade, +y is up. `off` is where a second hand goes.
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { cultureOf } from './culture.js';

export const ARMS = {
  knife:      { name: 'Combat knife', dmg: 34, reach: 1.6, every: 0.5, kg: 0.3, value: 45, form: 'blade' },
  machete:    { name: 'Bush blade', dmg: 42, reach: 1.9, every: 0.62, kg: 0.7, value: 70, form: 'blade' },
  hatchet:    { name: 'Hatchet', dmg: 48, reach: 1.7, every: 0.8, kg: 1.0, value: 60, form: 'axe' },
  arcblade:   { name: 'Arc blade', dmg: 66, reach: 2.0, every: 0.55, kg: 1.1, value: 1400, form: 'blade', glow: true },
  maul:       { name: 'Breaching maul', dmg: 80, reach: 2.1, every: 1.35, kg: 4.2, value: 220, form: 'maul', two: true },
  baton:      { name: 'Shock baton', dmg: 24, reach: 1.9, every: 0.7, kg: 0.8, value: 90, form: 'baton', stun: 8 },
  spear:      { name: 'Shock lance', dmg: 40, reach: 2.8, every: 0.85, kg: 2.0, value: 480, form: 'lance', two: true, stun: 5 },
  pistol:     { name: 'Slug pistol', dmg: 46, reach: 60, every: 0.35, kg: 1.1, value: 650, form: 'pistol', ranged: true, spread: 0.012 },
  revolver:   { name: 'Heavy revolver', dmg: 72, reach: 70, every: 0.7, kg: 1.5, value: 820, form: 'revolver', ranged: true, spread: 0.009 },
  pulsepistol: { name: 'Pulse pistol', dmg: 38, reach: 85, every: 0.22, kg: 0.9, value: 1250, form: 'pistol', ranged: true, spread: 0.01, energy: true },
  carbine:    { name: 'Pulse carbine', dmg: 62, reach: 140, every: 0.12, kg: 3.4, value: 1900, form: 'long', ranged: true, spread: 0.02, two: true, energy: true },
  rifle:      { name: 'Slug rifle', dmg: 88, reach: 220, every: 0.6, kg: 4.0, value: 1600, form: 'long', ranged: true, spread: 0.005, two: true, stock: 'wood' },
  marksman:   { name: 'Long rifle', dmg: 150, reach: 420, every: 1.5, kg: 6.2, value: 3600, form: 'long', ranged: true, spread: 0.0016, two: true, scope: true },
  shotgun:    { name: 'Scatter gun', dmg: 90, reach: 34, every: 0.9, kg: 3.6, value: 780, form: 'scatter', ranged: true, spread: 0.02, wide: 2.6, two: true },
  repeater:   { name: 'Field repeater', dmg: 44, reach: 170, every: 0.07, kg: 9, value: 5200, form: 'heavy', ranged: true, spread: 0.032, two: true, energy: true },
};

// How this planet's makers build things, from its culture and its seed.
const HABITS = { masonry: { stock: 'wood', grip: 'wood', finish: 'metal' }, corporate: { stock: 'plastic', grip: 'rubber', finish: 'lacquer' }, brutalist: { stock: 'metal', grip: 'rubber', finish: 'lacquer' }, garden: { stock: 'wood', grip: 'leather', finish: 'metal' }, foundry: { stock: 'metal', grip: 'leather', finish: 'rust' } };
const memo = new Map();
export function armDesign(planet, id) {
  const k = planet.universeSeed.join(':') + '|' + (planet.address?.key || '') + '|' + id; if (memo.has(k)) return memo.get(k);
  const A = ARMS[id], rng = new Rng(derive(planet.seed, 'arms', [hashStr(9, id)])), H = HABITS[cultureOf(planet).key] || HABITS.corporate, r = (a, b) => rng.range(a, b);
  const D = { id, form: A.form, glow: A.glow || A.energy || A.stun ? [[0.35, 0.8, 1], [1, 0.45, 0.15], [0.5, 1, 0.55], [0.85, 0.4, 1]][rng.int(0, 3)] : null, stock: A.stock || H.stock, grip: H.grip, finish: H.finish,
    len: r(0.85, 1.2), tall: r(0.85, 1.15), slab: r(0.85, 1.2), rake: r(0.12, 0.42), brake: rng.int(0, 2), mag: rng.int(0, 2), rail: rng.next() < 0.6, vents: rng.int(2, 7), edge: rng.int(0, 2), guard: rng.int(0, 2), two: !!A.two, scope: !!A.scope || (A.form === 'long' && rng.next() < 0.3) };
  memo.set(k, D);
  return D;
}
