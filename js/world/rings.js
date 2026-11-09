// A spin ring as the collision world holds it: its flat plan (gen/rings.js) laid out at c, running along `facing`, framed so that across,
// up and along turn the same way as the ring's own axle, inward and onward (render/rings.js bends it by that rule).
import { ringPlan } from '../gen/rings.js';
export function ringStructure(s, g, c, facing) {
  const plan = ringPlan(g), [u0, v0] = s.toLocal(c[0], c[2]), [u1, v1] = s.toLocal(c[0] + Math.sin(facing), c[2] + Math.cos(facing)), ez = [u1 - u0, v1 - v0];
  let ex = [ez[1], -ez[0]]; const [ax, az] = s.toWorld(u0 + ex[0], v0 + ex[1]), fx = [ax - c[0], az - c[2]], fz = [Math.sin(facing), Math.cos(facing)];
  if (fx[0] * fz[1] - fx[1] * fz[0] < 0) ex = [-ex[0], -ex[1]];
  const O = [u0 - ex[0] * plan.w / 2 - ez[0] * plan.d / 2, v0 - ex[1] * plan.w / 2 - ez[1] * plan.d / 2];
  const cs = [[0, 0], [plan.w, 0], [0, plan.d], [plan.w, plan.d]].map(([x, z]) => [O[0] + ex[0] * x + ez[0] * z, O[1] + ex[1] * x + ez[1] * z]);
  return { key: 'ring:' + g.key, n: -1, type: 'ring', owner: 'the Meridian', label: g.name, plan, O, ex, ez, w: plan.w, d: plan.d, base: c[1], doorPassable: () => true, ring: g,
    rect: [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))] };
}
// Where (x, z) is along the ring and across it, and the spin's pull for the controller there.
export function spinOf(world, b) { const g = b.plan.ring; return { w2: g.omega * g.omega, omega: g.omega, R: g.Rf, base: b.base, sdir: world.fromBVec(b, 0, 1) }; }
// Walked off one end: you're at the other (it's the same place).
export function wrapRing(world, b, pos) { const [, lz] = world.toB(b, pos[0], pos[2]), k = lz < 0 ? 1 : lz > b.d ? -1 : 0; if (!k) return pos; const [wx, wz] = world.fromBVec(b, 0, k * b.d); return [pos[0] + wx, pos[1], pos[2] + wz]; }
