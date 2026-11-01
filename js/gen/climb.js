// Things made for climbing. For now: a fire ladder on the back wall of every building
// with a flat roof you'd want to reach (not houses), up to the roof. A ladder is logical
// data — a line on the outside of a wall, from the ground to the roof edge, and the
// spot on the roof where you step off — so whatever ends up drawing it, climbing reads
// only this. Pure and cached like plans.
import { buildingPlan } from './building.js';
import { buildingToWorld } from './place.js';

const cache = new Map();
const OUT = 0.42;                 // ladder centreline, out from the wall face (m)

export function ladderOf(planet, s, b) {
  const ck = planet.universeSeed.join(':') + '|' + b.key;
  if (cache.has(ck)) return cache.get(ck);
  cache.set(ck, b.type === 'house' ? null : place(planet, s, b));
  return cache.get(ck);
}
export function laddersIn(planet, s) { return s.buildings.map(b => ladderOf(planet, s, b)).filter(Boolean); }

function place(planet, s, b) {
  const plan = buildingPlan(planet, s, b), { w, d, F, H } = plan;
  const backs = plan.walls.filter(wl => wl.exterior && wl.side === 'back');
  const clearAt = x => backs.every(wl => wl.openings.every(o => x + 0.45 <= o.a || x - 0.45 >= o.b));
  // nothing else standing right behind the building (another lot), in settlement-local terms
  const roomBehind = x => {
    const u = b.O[0] + b.ex[0] * x + b.ez[0] * (d + 1.2), v = b.O[1] + b.ex[1] * x + b.ez[1] * (d + 1.2);
    return !s.buildings.some(o => o !== b && u > o.rect[0] - 0.3 && u < o.rect[2] + 0.3 && v > o.rect[1] - 0.3 && v < o.rect[3] + 0.3);
  };
  let best = null;
  for (let x = 0.9; x <= w - 0.9; x += 0.25) {
    if (!clearAt(x) || !roomBehind(x)) continue;
    const score = Math.abs(x - (w - 1.3));       // prefer near a corner
    if (!best || score < best.score) best = { x, score };
  }
  if (!best) return null;
  const lx = best.x, top = F * H;
  return {
    b: b.key, lx, lz: d + OUT, y0: 0, y1: top,
    foot: buildingToWorld(s, b, lx, 0, d + OUT),                // world position at the bottom of the ladder
    head: buildingToWorld(s, b, lx, top, d + OUT),              // …and level with the roof
    roof: buildingToWorld(s, b, lx, top, d - 0.9),              // where you step onto the roof
    behind: buildingToWorld(s, b, lx, 0, d + OUT + 0.8),       // where you end up if you let go at the bottom
    facing: Math.atan2(...(() => { const [ax, , az] = buildingToWorld(s, b, lx, 0, d + OUT), [bx, , bz] = buildingToWorld(s, b, lx, 0, d); return [bx - ax, bz - az]; })()),
  };
}
