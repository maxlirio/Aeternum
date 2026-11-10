// The stars near home: the systems of the home sector, each with its sun and its worlds, for the holo map (ui/holomap.js) and
// FTL travel. Pure: from the universe seed. System 0 is home (its fourth world, body 3, is where you were born). Every world
// here is a real one: the same address makePlanet builds when you arrive.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { Address } from '../core/address.js';
import { makePlanet } from './planet.js';
import { formsOf } from './forms.js';

const N = 11;
const CLASSES = [['M', [1, 0.62, 0.42], 0.6, 5], ['K', [1, 0.8, 0.58], 0.8, 4], ['G', [1, 0.94, 0.8], 1, 3], ['F', [0.96, 0.96, 1], 1.2, 2], ['A', [0.8, 0.88, 1], 1.5, 1], ['B', [0.68, 0.78, 1], 1.9, 0.4]];
const SYL = ['ka', 'ry', 'vel', 'ost', 'ana', 'tor', 'mi', 'sel', 'dro', 'qua', 'zen', 'ul', 'per', 'ix', 'ha', 'lo', 'thar', 'ne', 'vy', 'cor'];
export const addressOf = (system, body) => new Address([['galaxy', 0], ['sector', 0, 0, 0], ['system', system], ['body', body]]);
const memo = new Map();
// → [{ n, name, pos: [x, y] (light years from home), cls, colour, size, bodies: [{ n, orbit, planet preview }] }]
export function starChart(U) {
  const key = U.join(':'); if (memo.has(key)) return memo.get(key);
  const out = [];
  for (let n = 0; n < N; n++) {
    const r = new Rng(derive(U, 'star', [n])), C = r.weighted(CLASSES.map(c => [c, c[3]])), a = r.range(0, 6.283), d = n === 0 ? 0 : 4 + r.range(0, 1) ** 0.7 * 26;
    const name = (r.pick(SYL) + r.pick(SYL) + (r.chance(0.5) ? r.pick(SYL) : '')).replace(/^./, c => c.toUpperCase()) + (r.chance(0.25) ? ' ' + r.pick(['Minor', 'Major', 'Reach', 'Deep']) : '');
    const nb = n === 0 ? Math.max(5, r.int(4, 8)) : r.int(2, 7), bodies = [];
    for (let b = 0; b < nb; b++) bodies.push({ n: b, orbit: 0.4 + b * 0.55 + r.range(0, 0.25), phase: r.range(0, 6.283) });
    out.push({ n, name, home: n === 0, pos: [Math.cos(a) * d, Math.sin(a) * d], cls: C[0], colour: C[1], size: C[2], bodies });
  }
  memo.set(key, out); return out;
}
// what a world is, at a glance, from orbit: built only when the map asks (it's a whole planet's seed and genome)
const look = new Map();
export function worldPreview(U, system, body) {
  const k = U.join(':') + '|' + system + '|' + body; if (look.has(k)) return look.get(k);
  const p = makePlanet(U, addressOf(system, body)), G = p.genome, soc = G.society, F = formsOf(p);
  const v = { name: p.name, arch: G.arch, weird: G.weird, cloud: !!G.noGround, ground: G.climate.grass, sea: G.climate.sea?.shallow || [0.1, 0.25, 0.4], rock: G.climate.rock,
    nations: soc.nations.length, gov: soc.nations[0]?.gov || '', industry: soc.primary || '', war: soc.relations?.some(q => q.state === 'war' || q.state === 'border war'), builds: F.main.kind, dayH: Math.round(p.dayLength / 3600), moons: G.sky?.moons?.length || 0, ring: !!G.sky?.ring };
  look.set(k, v); return v;
}
// how far, in light years, and how long the jump takes (seconds: what you see of it)
export function jumpOf(chart, from, to) { const a = chart[from.system], b = chart[to.system], ly = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]); return { ly, secs: from.system === to.system ? 2.2 : 3 + Math.min(3, ly / 10) }; }
