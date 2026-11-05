// The final ground surface: raw terrain graded by settlements (a flat town plateau
// with a natural falloff, and out-of-town roads cut/filled to a grade-limited profile).
// Everything that needs "the ground" — terrain meshes, collision, building pads —
// uses this one function, so they can never disagree.
import { rawHeight } from './terrain.js';
import { settlementNear } from './settlement.js';
import { outRoutes, nearRoute } from './highways.js';
import { lerp, smoothstep } from '../core/noise.js';
import { getCity, cityWeight, CURB } from './city.js';
import { carve } from './rivers.js';
import { padAt } from './outposts.js';

export function plateauWeight(s, u, v) {
  const r = Math.hypot(u, v);
  return 1 - smoothstep(s.R + 15, s.R + 200, r);
}

// The ground with everything but the graded sites. (What chooses those sites has to read this: it can't read itself.)
export function bareSurfaceAt(planet, x, z) {
  const raw0 = rawHeight(planet, x, z), K = carve(planet, x, z, raw0), raw = K.h, wet = K.wet;
  const c = getCity(planet), cw = cityWeight(c, x, z);
  if (cw > 0) return { h: lerp(raw, c.h, cw), town: cw, road: 0, city: cw };     // the megacity stands on one graded level
  const s = settlementNear(planet, x, z);
  if (!s) return { h: raw, town: 0, road: 0, wet };
  const [u, v] = s.toLocal(x, z);
  const wp = plateauWeight(s, u, v);
  let h = wp > 0 ? lerp(raw, s.h, wp) : raw;
  let road = 0, roadW = 0;
  // two roads running close share the ground between them, so neither leaves a step where the other starts
  let sumW = 0, sumH = 0, sumL = 0, top = 0;
  for (const r of outRoutes(planet, s)) {
    const q = nearRoute(r, x, z); if (!q || q.d > r.w / 2 + 16) continue;
    const hw = r.w / 2, endFade = 1 - smoothstep(r.pts.length - 12, r.pts.length - 2, q.i + q.f);   // the cut eases out at the far end
    const w = (1 - smoothstep(hw + 1, hw + 16, q.d)) * endFade; if (w <= 0) continue;
    const near = 1 / (1e-3 + Math.max(0, q.d - hw) ** 4);
    sumW += near; sumH += near * q.h; top = Math.max(top, w);
    road = Math.max(road, (1 - smoothstep(hw, hw + 1.5, q.d)) * (endFade > 0.5 ? 1 : 0));
  }
  if (sumW > 0) { h = lerp(h, sumH / sumW, top); roadW = top; }      // (the profile already starts flat at the plateau)
  return { h, town: wp, road, wet, roadW };
}

// Returns { h, town } — town ∈ [0,1] is how much the ground is graded/compacted. An airfield or a
// factory yard is levelled, easing back into the land around it; a road keeps its own grade through it.
export function surfaceAt(planet, x, z) {
  const b = bareSurfaceAt(planet, x, z), pad = padAt(planet, x, z);
  if (pad) b.h = lerp(b.h, pad.h, pad.w * (1 - (b.roadW || 0)));
  return b;
}

export const surfaceHeight = (planet, x, z) => surfaceAt(planet, x, z).h;
