// Small geometric helpers between building-local, settlement-local and world space.
import { PLINTH } from '../core/units.js';

export function buildingToWorld(s, b, lx, ly, lz) {
  const u = b.O[0] + b.ex[0] * lx + b.ez[0] * lz, v = b.O[1] + b.ex[1] * lx + b.ez[1] * lz;
  const [x, z] = s.toWorld(u, v);
  return [x, (b.base ?? s.h + PLINTH) + ly, z];        // (a landed ship brings its own floor height)
}

// Just outside a building's entrance, facing it.
export function doorstep(s, b, plan) {
  const d = plan.doors[plan.entrance];
  const p = buildingToWorld(s, b, d.x, 0, -1.4);
  p[1] = s.h;
  const [fx, fz] = [b.ez[0] * s.cos - b.ez[1] * s.sin, b.ez[0] * s.sin + b.ez[1] * s.cos];
  return { pos: p, facing: Math.atan2(fx, fz) };
}

export function nearestRoadPoint(s, x, z) {
  const [u, v] = s.toLocal(x, z);
  let best = null, bd = Infinity;
  for (const r of s.roads) {
    const cu = Math.max(Math.min(r.a[0], r.b[0]), Math.min(u, Math.max(r.a[0], r.b[0])));
    const cv = Math.max(Math.min(r.a[1], r.b[1]), Math.min(v, Math.max(r.a[1], r.b[1])));
    const d = (cu - u) ** 2 + (cv - v) ** 2;
    if (d < bd) { bd = d; best = [cu, cv]; }
  }
  const [wx, wz] = s.toWorld(best[0], best[1]);
  return [wx, s.h, wz];
}
