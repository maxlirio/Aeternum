// The final ground surface: raw terrain graded by settlements (a flat town plateau
// with a natural falloff, and out-of-town roads cut/filled to a grade-limited profile).
// Everything that needs "the ground" — terrain meshes, collision, building pads —
// uses this one function, so they can never disagree.
import { rawHeight } from './terrain.js';
import { settlementNear } from './settlement.js';
import { outRoutes, nearRoute } from './highways.js';
import { linksAt } from './network.js';
import { lerp, smoothstep } from '../core/noise.js';
import { getCity, cityWeight, CURB } from './city.js';
import { carve, riverAt } from './rivers.js';
import { padAt } from './outposts.js';

const NO_LINKS = [];
const roadsAt = (planet, x, z) => { const s = settlementNear(planet, x, z), links = linksAt(planet, x, z); return s ? outRoutes(planet, s).concat(links) : links; };
export function plateauWeight(s, u, v) {
  const r = Math.hypot(u, v);
  return 1 - smoothstep(s.R + 15, s.R + 200, r);
}

// The ground with everything but the graded sites. (What chooses those sites has to read this: it can't read itself.)
export function bareSurfaceAt(planet, x, z, far = false) {
  const raw0 = rawHeight(planet, x, z), K = carve(planet, x, z, raw0), raw = K.h, wet = K.wet;
  const c = getCity(planet), cw = cityWeight(c, x, z);
  if (cw > 0) return { h: lerp(raw, c.h, cw), town: cw, road: 0, city: cw };     // the megacity stands on one graded level
  const s = settlementNear(planet, x, z), links = far ? NO_LINKS : linksAt(planet, x, z);     // (a distant tile's samples are further apart than a road is wide)
  if (!s && !links.length) return { h: raw, town: 0, road: 0, wet };
  let wp = 0; if (s) { const [u, v] = s.toLocal(x, z); wp = plateauWeight(s, u, v); }
  let h = wp > 0 ? lerp(raw, s.h, wp) : raw;
  let road = 0, roadW = 0, deck = 0;
  // two roads running close share the ground between them, so neither leaves a step where the other starts
  let sumW = 0, sumH = 0, sumL = 0, top = 0;
  for (const r of s ? (links.length ? outRoutes(planet, s).concat(links) : outRoutes(planet, s)) : links) {
    const q = nearRoute(r, x, z); if (!q || q.d > r.w / 2 + 16) continue;
    const hw = r.w / 2, endFade = r.link || r.joined ? 1 : 1 - smoothstep(r.pts.length - 12, r.pts.length - 2, q.i + q.f);   // the cut eases out at the far end
    let w = (1 - smoothstep(hw + 1, hw + 16, q.d)) * endFade; if (w <= 0) continue;
    // on a bridge the ground stays where the river left it: the road's up on the deck
    if (r.bridges?.length) { const qi = q.i + q.f; let gap = 0; for (const B of r.bridges) if (qi > B.i0 - 1 && qi < B.i1 + 1) { gap = Math.max(gap, Math.min(1, Math.min(qi - (B.i0 - 1), (B.i1 + 1) - qi))); } if (gap > 0) { w *= 1 - gap; deck = 1; if (gap > 0.6) continue; } }
    const near = 1 / (1e-3 + Math.max(0, q.d - hw) ** 4);
    sumW += near; sumH += near * q.h; top = Math.max(top, w);
    road = Math.max(road, (1 - smoothstep(hw, hw + 1.5, q.d)) * (endFade > 0.5 ? 1 : 0));
  }
  if (sumW > 0) { h = lerp(h, sumH / sumW, top); roadW = top; }      // (the profile already starts flat at the plateau)
  return { h, town: wp, road, wet, roadW, deck };
}

// Returns { h, town } — town ∈ [0,1] is how much the ground is graded/compacted. An airfield or a
// factory yard is levelled, easing back into the land around it; a road keeps its own grade through it.
export function surfaceAt(planet, x, z, far = false) {
  const b = bareSurfaceAt(planet, x, z, far), pad = padAt(planet, x, z);
  if (pad) b.h = lerp(b.h, pad.h, pad.w * (1 - (b.roadW || 0)));
  return b;
}

// The top of a bridge at (x, z), if there is one there: { h } or null. Only ever looked up where there's a river.
export function deckAt(planet, x, z) {
  const K = riverAt(planet, x, z); if (!K) return null;
  for (const r of roadsAt(planet, x, z)) { if (!r.bridges?.length) continue; const q = nearRoute(r, x, z); if (!q || q.d > r.w / 2 + 0.7) continue; const qi = q.i + q.f; if (r.bridges.some(B => qi >= B.i0 - 1 && qi <= B.i1 + 1)) return q.h; }
  return null;
}
// A bridge's parapets hold you in: (x, z) moved back inside them if you've walked into one, else null.
export function railHold(planet, x, z, yFeet, reach) {
  const K = riverAt(planet, x, z); if (!K) return null;
  for (const r of roadsAt(planet, x, z)) { if (!r.bridges?.length) continue; const q = nearRoute(r, x, z); if (!q || q.d > r.w / 2 + 1.5) continue; const qi = q.i + q.f; if (!r.bridges.some(B => qi >= B.i0 - 1 && qi <= B.i1 + 1)) continue; if (yFeet > q.h + 0.6 || yFeet < q.h - 1.5) continue;
    const most = Math.max(0.2, r.w / 2 + 0.7 - 0.28 - reach); if (q.d <= most) return null; const a = r.pts[q.i], b = r.pts[Math.min(q.i + 1, r.pts.length - 1)], cx = a[0] + (b[0] - a[0]) * q.f, cz = a[1] + (b[1] - a[1]) * q.f, k = most / (q.d || 1); return [cx + (x - cx) * k, cz + (z - cz) * k]; }
  return null;
}
export const surfaceHeight = (planet, x, z) => surfaceAt(planet, x, z).h;
