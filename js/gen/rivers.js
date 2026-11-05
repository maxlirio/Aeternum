// Rivers: water that comes off the high ground and runs to the sea. Pure: (planet, region) → rivers,
// each a line with a width and a water level that only ever falls. They read the raw land and keep
// clear of towns and the city, and surface.js cuts their channels into the ground, so everything that
// stands on the land (roads, fields, a walker's feet) gets them for free. Nothing is stored.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { smoothstep, lerp } from '../core/noise.js';
import { rawHeight, moisture } from './terrain.js';
import { settlementNear } from './settlement.js';
import { getCity, cityWeight } from './city.js';

export const REGION = 12000, STEP = 60, MAXLEN = 11500, BANK = 24, WIDE = 90, CELL = 240;
const memo = new WeakMap();
function stateOf(planet) { let S = memo.get(planet); if (!S) memo.set(planet, S = { regions: new Map(), grid: new Map(), last: null, rivers: [] }); return S; }

function trace(planet, x, z, heading, rng) {
  const sea = planet.seaLevel, c = getCity(planet), pts = []; let bed = rawHeight(planet, x, z) - 1, a = heading, wander = rng.range(0, 6.28);
  for (let n = 0; n * STEP < MAXLEN; n++) {
    const raw = rawHeight(planet, x, z);
    if (raw < sea - 0.5) { pts.push({ x, z, y: sea - 0.05 }); return { pts, toSea: true }; }
    const s = settlementNear(planet, x, z); if ((s && Math.hypot(...s.toLocal(x, z)) < s.R + 320) || cityWeight(c, x, z) > 0) return null;     // it wouldn't get past a town: this one never was
    bed = Math.max(sea, Math.min(bed - 0.03, raw - 1.1));
    if (raw - bed > 26) return null;                                                     // through a mountain: no
    pts.push({ x, z, y: +bed.toFixed(2) });
    // the lowest ground ahead, with a little wander so it isn't ruler straight
    let best = Infinity, ba = a; for (let k = -3; k <= 3; k++) { const q = a + k * 0.42, h = rawHeight(planet, x + Math.sin(q) * STEP, z + Math.cos(q) * STEP) + Math.abs(k) * 0.35; if (h < best) { best = h; ba = q; } }
    wander += 0.5; a = ba + Math.sin(wander) * 0.3; x += Math.sin(a) * STEP; z += Math.cos(a) * STEP;
  }
  return null;              // (only what reaches the sea: a wide river doesn't just stop)
}
function generate(planet, ri, rj) {
  const S = stateOf(planet), key = ri + ',' + rj; if (S.regions.has(key)) return; S.regions.set(key, true);
  const rng = new Rng(derive(planet.seed, 'rivers', [ri, rj])), n = rng.int(2, 5);
  for (let r = 0; r < n; r++) {
    // a source: the highest of a few spots, if it's wet enough for water to come off it
    let sx = 0, sz = 0, sh = -1e9; for (let k = 0; k < 5; k++) { const x = (ri + rng.next()) * REGION, z = (rj + rng.next()) * REGION, h = rawHeight(planet, x, z); if (h > sh) { sh = h; sx = x; sz = z; } }
    if (sh < planet.seaLevel + 45 || moisture(planet, sx, sz) < 0.28) continue;
    const T = trace(planet, sx, sz, rng.range(0, 6.28), rng); if (!T || T.pts.length < 25) continue;
    const L = T.pts.length, R = { id: S.rivers.length, pts: T.pts, toSea: T.toSea, w: T.pts.map((_, i) => +(2.6 + 13 * Math.min(1, i / 110)).toFixed(2)) };
    S.rivers.push(R);
    for (let i = 0; i + 1 < L; i++) { const a = R.pts[i], b = R.pts[i + 1], reach = R.w[i] / 2 + WIDE + 2; for (let p = Math.floor((Math.min(a.x, b.x) - reach) / CELL); p <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); p++) for (let q = Math.floor((Math.min(a.z, b.z) - reach) / CELL); q <= Math.floor((Math.max(a.z, b.z) + reach) / CELL); q++) { const k = p * 200003 + q; let c = S.grid.get(k); if (!c) S.grid.set(k, c = []); c.push([R, i]); } }
  }
}
// Every region a river near here could have started in has been worked out, once
function ensure(planet, x, z) {
  const S = stateOf(planet), ri = Math.floor(x / REGION), rj = Math.floor(z / REGION), k = ri * 100003 + rj; if (S.last === k) return S; S.last = k;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) generate(planet, ri + a, rj + b);
  return S;
}
// The river at (x, z), if you're in its channel or on its banks: { d (from its middle), hw (half its width), y (water level), R, i }
export function riverAt(planet, x, z) {
  const S = ensure(planet, x, z), c = S.grid.get(Math.floor(x / CELL) * 200003 + Math.floor(z / CELL)); if (!c) return null;
  let best = null, bd = Infinity;
  for (const [R, i] of c) { const a = R.pts[i], b = R.pts[i + 1], ex = b.x - a.x, ez = b.z - a.z, f = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1))), d = Math.hypot(a.x + ex * f - x, a.z + ez * f - z), hw = lerp(R.w[i], R.w[i + 1], f) / 2, m = d - hw; if (m < bd && m < WIDE) { bd = m; best = { d, hw, y: lerp(a.y, b.y, f), R, i, f }; } }
  return best;
}
// What the channel does to the land: height with the river cut in, and how wet it is here (1 = in the water)
export function carve(planet, x, z, raw) {
  const r = riverAt(planet, x, z); if (!r) return { h: raw, wet: 0 };
  const span = Math.min(WIDE, Math.max(BANK, (raw - r.y) * 3.2));          // the deeper it cuts, the wider the valley it opens, so a cutting doesn't turn to a canyon
  const t = 1 - smoothstep(r.hw * 0.7, r.hw + span, r.d), bed = r.y - 1.1 - Math.min(0.5, r.hw * 0.05), inner = 1 - smoothstep(r.hw * 0.55, r.hw + 1.2, r.d);
  const bank = Math.min(raw, r.y + 0.35 + Math.max(0, r.d - r.hw) * 0.18);                 // the banks come down to just above the water
  return { h: lerp(lerp(raw, bank, t), bed, inner), wet: 1 - smoothstep(r.hw - 0.5, r.hw + 2.5, r.d), river: r };
}
export const riversNear = (planet, x, z) => { ensure(planet, x, z); return stateOf(planet).rivers; };
