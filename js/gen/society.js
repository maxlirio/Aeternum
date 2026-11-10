// Who lives where, what they work at, and who rules them: the society of gen/genome.js laid onto the planet.
// Nations hold territory (each the land nearest its capital, the strong reaching further); a town belongs to the
// nation whose land it stands in, lives by one of its world's industries, and is run by that nation's kind of
// government. Where two nations are at war their border is a front. Pure: from the planet's genome and seed.
import { Rng } from '../core/prng.js';
import { derive, hash01 } from '../core/hash.js';
import { INDUSTRIES, GOVERNMENTS } from './genome.js';

const memo = new WeakMap();
// The nations, with their capitals placed on the land around home (nation 0's capital is home's region).
export function nationsOf(planet) {
  let N = memo.get(planet); if (N) return N;
  const S = planet.genome?.society; if (!S) { memo.set(planet, N = []); return N; }
  const rng = new Rng(derive(planet.seed, 'nations')), n = S.nations.length, a0 = rng.range(0, 6.28);
  N = S.nations.map((nat, i) => {
    const a = a0 + i * 6.2832 / Math.max(1, n - 1) + rng.range(-0.4, 0.4), d = i === 0 ? 0 : rng.range(30000, 90000);
    return { ...nat, cx: i === 0 ? 1500 : Math.cos(a) * d, cz: i === 0 ? 1500 : Math.sin(a) * d, reach: 0.75 + 0.5 * nat.strength };
  });
  memo.set(planet, N); return N;
}
// Whose land is (x, z): the nation with the nearest capital, distance scaled by its reach. Also the runner-up and how far the border is.
export function nationAt(planet, x, z) {
  const N = nationsOf(planet); if (!N.length) return null;
  let best = null, bd = Infinity, second = null, sd = Infinity;
  for (const nat of N) { const d = Math.hypot(x - nat.cx, z - nat.cz) / nat.reach; if (d < bd) { second = best; sd = bd; best = nat; bd = d; } else if (d < sd) { second = nat; sd = d; } }
  return { nation: best, neighbour: second, border: second ? (sd - bd) * best.reach * 0.5 : Infinity };
}
export function relationOf(planet, a, b) {
  if (!a || !b || a === b) return null;
  const R = planet.genome.society.relations; return R.find(r => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id)) || null;
}
// A front: where (x, z) lies within `width` of a border between two nations at war (or in a border war). { a, b, state, d } or null.
export function frontAt(planet, x, z, width = 6000) {
  const W = nationAt(planet, x, z); if (!W || !W.neighbour || W.border > width) return null;
  const rel = relationOf(planet, W.nation, W.neighbour); if (!rel || (rel.state !== 'war' && rel.state !== 'border war')) return null;
  return { a: W.nation, b: W.neighbour, state: rel.state, d: W.border };
}

// A town's place in it all: its nation, its industry (the world's main one most often), its government, how hard its law is, how much it has a gang problem.
export function townSociety(planet, s) {
  if (s.society) return s.society;
  const S = planet.genome?.society; if (!S) return (s.society = null);
  const W = nationAt(planet, s.cx, s.cz), nat = W.nation, u = hash01(s.seed, [7101]);
  const industry = u < 0.55 ? S.primary : u < 0.85 ? S.secondary : nat.econ, G = GOVERNMENTS[nat.gov] || GOVERNMENTS.council;
  const gangs = Math.min(1, S.gangs * G.gangs * (0.5 + hash01(s.seed, [7102])) * (s.R > 220 ? 1.2 : 0.8));
  const front = frontAt(planet, s.cx, s.cz);
  return (s.society = { nation: nat, government: nat.gov, govLabel: G.label, ruler: G.title, law: G.law, industry, industryLabel: INDUSTRIES[industry]?.label || industry, gangs, front });
}

// What a world's industries do to its countryside: which kinds of outpost (gen/outposts.js) are more common.
const OUTPOST_BY = { ore: { mine: 4 }, crystal: { mine: 5 }, rare: { mine: 4 }, stone: { mine: 3 }, ice: { mine: 2 }, grain: { farm: 3, hamlet: 1.5 }, livestock: { farm: 3 }, fruit: { farm: 2.5 },
  spice: { farm: 2 }, medicine: { farm: 1.5 }, spore: { farm: 1.5 }, fibre: { lumber: 2 }, timber: { lumber: 4 }, fur: { lumber: 1.5, camp: 2 }, fish: { fishing: 5, light: 2 }, kelp: { fishing: 4 }, pearl: { fishing: 3 },
  salt: { well: 2 }, solar: { solar: 4 }, water: { well: 4 }, geothermal: { oil: 2 }, sulphur: { oil: 2, mine: 1.5 } };
export function outpostBias(planet) {
  const S = planet.genome?.society; if (!S) return null;
  const out = {}; for (const [ind, w] of [[S.primary, 1], [S.secondary, 0.6]]) for (const [k, m] of Object.entries(OUTPOST_BY[ind] || {})) out[k] = (out[k] || 1) * (1 + (m - 1) * w);
  return out;
}
// How well a town site suits its world's industries: the kind of country they need (gen/genome.js INDUSTRIES[].near), or the coast.
export function siteFit(planet, kind, nearSea) {
  const S = planet.genome?.society; if (!S) return 0;
  let f = 0; for (const [ind, w] of [[S.primary, 1], [S.secondary, 0.5]]) { const near = INDUSTRIES[ind]?.near || []; if (near.includes(kind) || (near.includes('coast') && nearSea)) f = Math.max(f, w); }
  return f;
}
