// Gangs: a town's crews, each with its colours, its corner of town (a street junction and the blocks round it) and its
// members: young residents, mostly the ones without work, one of them the boss. How many a town has follows its world
// and its government (gen/society.js `gangs`: a syndicate world is thick with them, a junta's town has few). After dark
// they're out on their corner; a stranger walking their turf gets shaken down. Pure: from the town's seed and its people.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { townSociety } from './society.js';

const A = ['Red', 'Black', 'Iron', 'Salt', 'Ash', 'Grey', 'Night', 'Rust', 'Glass', 'Dust', 'Copper', 'Hollow', 'Long', 'Cold'];
const B = ['Hands', 'Dogs', 'Saints', 'Knives', 'Crows', 'Kings', 'Lanterns', 'Wolves', 'Rats', 'Boys', 'Sisters', 'Hooks', 'Ghosts', 'Line'];
const COLOURS = [[0.75, 0.12, 0.1], [0.1, 0.1, 0.12], [0.85, 0.65, 0.1], [0.1, 0.45, 0.7], [0.45, 0.15, 0.6], [0.15, 0.6, 0.3], [0.9, 0.4, 0.1], [0.8, 0.8, 0.82]];
const memo = new WeakMap();
// [{ id, name, colour, turf: { u, v, x, z, r }, members: [personId], boss }] for a town (its population: gen/population.js)
export function gangsOf(planet, s, pop) {
  if (memo.has(pop)) return memo.get(pop);
  const soc = townSociety(planet, s), rng = new Rng(derive(s.seed, 'gangs')), out = [];
  const n = !soc ? 0 : Math.min(3, Math.floor(soc.gangs * 3.4 + rng.next() * 0.6)), used = new Set(), pool = rng.shuffle(pop.people.filter(p => p.age >= 17 && p.age <= 36)).sort((a, b) => (a.job ? 1 : 0) - (b.job ? 1 : 0));
  for (let g = 0; g < n && s.nodes.length; g++) {
    let node = null; for (let k = 0; k < 20 && !node; k++) { const q = rng.pick(s.nodes); if (!out.some(G => Math.hypot(G.turf.u - q.u, G.turf.v - q.v) < 90)) node = q; } if (!node) break;
    const [x, z] = s.toWorld(node.u, node.v), size = rng.int(4, 9), members = [];
    for (const p of pool) { if (members.length >= size) break; if (used.has(p.id)) continue; used.add(p.id); members.push(p.id); }
    if (members.length < 3) break;
    let name; do { name = 'the ' + rng.pick(A) + ' ' + rng.pick(B); } while (out.some(G => G.name === name));
    out.push({ id: `${s.key}/gang${g}`, name, colour: rng.pick(COLOURS), turf: { u: node.u, v: node.v, x, z, r: 55 }, members, boss: members[0] });
  }
  memo.set(pop, out); return out;
}
export const gangOfPerson = (planet, s, pop, id) => gangsOf(planet, s, pop).find(G => G.members.includes(id)) || null;
export const turfAt = (planet, s, pop, x, z) => gangsOf(planet, s, pop).find(G => Math.hypot(x - G.turf.x, z - G.turf.z) < G.turf.r) || null;
