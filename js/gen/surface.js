// The final ground surface: raw terrain graded by settlements (a flat town plateau
// with a natural falloff, and out-of-town roads cut/filled to a smooth profile).
// Everything that needs "the ground" — terrain meshes, collision, building pads —
// uses this one function, so they can never disagree.
import { rawHeight } from './terrain.js';
import { settlementNear } from './settlement.js';
import { lerp, smoothstep } from '../core/noise.js';

export function plateauWeight(s, u, v) {
  const r = Math.hypot(u, v);
  return 1 - smoothstep(s.R + 15, s.R + 120, r);
}

function outRoadProfile(planet, s, o, t, len) {
  // smoothed raw terrain along the centreline, eased into the plateau height at t=0
  const [ax, az] = s.toWorld(o.a[0], o.a[1]), [bx, bz] = s.toWorld(o.b[0], o.b[1]);
  let acc = 0;
  for (let k = -2; k <= 2; k++) {
    const tt = Math.min(1.2, Math.max(0, t + k * 30 / len));
    acc += rawHeight(planet, lerp(ax, bx, tt), lerp(az, bz, tt));
  }
  // stays exactly at plateau height wherever the plateau itself is flat
  const cu = lerp(o.a[0], o.b[0], t), cv = o.a[1];
  const flat = plateauWeight(s, cu, cv);
  return lerp(acc / 5, s.h, flat + (1 - flat) * (1 - smoothstep(0.0, 0.5, t)));
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
  for (const o of s.outRoads) {
    const du = o.b[0] - o.a[0], len = Math.abs(du);
    const t = (u - o.a[0]) / du;
    if (t < 0 || t > 1.15) continue;
    const p = Math.abs(v - o.a[1]);
    const hw = o.w / 2;
    const w = (1 - smoothstep(hw + 1, hw + 16, p)) * (1 - smoothstep(1.0, 1.15, t));
    if (w <= 0) continue;
    h = lerp(h, outRoadProfile(planet, s, o, t, len), w);
    road = Math.max(road, (1 - smoothstep(hw, hw + 1.5, p)) * (t <= 1 ? 1 : 0));
  }
  return { h, town: wp, road };
}

export const surfaceHeight = (planet, x, z) => surfaceAt(planet, x, z).h;
