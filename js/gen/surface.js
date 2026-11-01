// The final ground surface: raw terrain graded by settlements (a flat town plateau
// with a natural falloff, and out-of-town roads cut/filled to a grade-limited profile).
// Everything that needs "the ground" — terrain meshes, collision, building pads —
// uses this one function, so they can never disagree.
import { rawHeight } from './terrain.js';
import { settlementNear } from './settlement.js';
import { outRoutes, nearRoute } from './highways.js';
import { lerp, smoothstep } from '../core/noise.js';

export function plateauWeight(s, u, v) {
  const r = Math.hypot(u, v);
  return 1 - smoothstep(s.R + 15, s.R + 200, r);
}

// Returns { h, town } — town ∈ [0,1] is how much the ground is graded/compacted.
export function surfaceAt(planet, x, z) {
  const raw = rawHeight(planet, x, z);
  const s = settlementNear(planet, x, z);
  if (!s) return { h: raw, town: 0, road: 0 };
  const [u, v] = s.toLocal(x, z);
  const wp = plateauWeight(s, u, v);
  let h = wp > 0 ? lerp(raw, s.h, wp) : raw;
  let road = 0;
  // the nearest road wins where two come close (they cross at most at a single point)
  let q = null, r = null;
  for (const rr of outRoutes(planet, s)) { const qq = nearRoute(rr, x, z); if (qq && (!q || qq.d < q.d)) { q = qq; r = rr; } }
  if (q && q.d <= r.w / 2 + 16) {
    const hw = r.w / 2;
    const endFade = 1 - smoothstep(r.pts.length - 12, r.pts.length - 2, q.i + q.f);   // the cut eases out at the far end
    const w = (1 - smoothstep(hw + 1, hw + 16, q.d)) * endFade;
    h = lerp(h, q.h, w);           // (the profile already starts flat at the plateau)
    road = (1 - smoothstep(hw, hw + 1.5, q.d)) * (endFade > 0.5 ? 1 : 0);
  }
  return { h, town: wp, road };
}

export const surfaceHeight = (planet, x, z) => surfaceAt(planet, x, z).h;
