// Rivers: water that comes off the high ground and runs to the sea. Pure: (planet, region) → rivers,
// each a line with a width and a water level that only ever falls. They read the raw land and keep
// clear of towns and the city, and surface.js cuts their channels into the ground, so everything that
// stands on the land (roads, fields, a walker's feet) gets them for free. Nothing is stored.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { REGION as TOWN_REGION } from '../core/units.js';
import { smoothstep, lerp } from '../core/noise.js';
import { rawHeight, moisture } from './terrain.js';
import { settlementNear, getSettlement } from './settlement.js';
import { routeLines } from './highways.js';
import { getCity, cityWeight } from './city.js';

const LONGEST = 30000;
export const REGION = 12000, STEP = 60, MAXLEN = 11500, BANK = 24, WIDE = 90, CELL = 240;
const memo = new WeakMap();
function stateOf(planet) { let S = memo.get(planet); if (!S) memo.set(planet, S = { regions: new Map(), grid: new Map(), last: null, rivers: [] }); return S; }

function trace(planet, x, z, heading, rng, path = null, maxLen = MAXLEN, maxCut = 26, lake = 0) {
  const ending = () => lake && pts.length >= lake ? { pts, toSea: false, lake: true } : null;     // (a river with no way to the sea fills the low ground it stops in)
  const sea = planet.seaLevel, c = getCity(planet), pts = [], blocked = (px, pz) => { const s = settlementNear(planet, px, pz); return !!(s && Math.hypot(...s.toLocal(px, pz)) < s.R + 320) || cityWeight(c, px, pz) > 0; }; let bed = rawHeight(planet, x, z) - 1, a = heading, wander = rng.range(0, 6.28);
  for (let n = 0; n * STEP < maxLen; n++) {
    const raw = rawHeight(planet, x, z);
    if (raw < sea - 0.5) { pts.push({ x, z, y: sea - 0.05 }); return { pts, toSea: true }; }
    if (blocked(x, z)) return ending();     // started on top of a town, or was pinned against one: this one never was
    bed = Math.max(sea, Math.min(bed - 0.03, raw - 1.1));
    if (raw - bed > maxCut) return ending();                                                     // through a mountain: no
    pts.push({ x, z, y: +bed.toFixed(2) });
    // the lowest ground ahead, with a little wander so it isn't ruler straight
    if (path?.length) { const [px, pz] = path.shift(); a = Math.atan2(px - x, pz - z); x = px; z = pz; continue; }     // (the part of a river already laid out)
    let best = Infinity, ba = a; for (let k = -3; k <= 3; k++) { const q = a + k * 0.42, qx = x + Math.sin(q) * STEP, qz = z + Math.cos(q) * STEP; if (blocked(qx, qz)) continue; const h = rawHeight(planet, qx, qz) + Math.abs(k) * 0.35; if (h < best) { best = h; ba = q; } }   // a town in the way: water goes round it, which is why towns have rivers at their edge
    if (best === Infinity) return ending();
    wander += 0.5; a = ba + Math.sin(wander) * 0.3; if (blocked(x + Math.sin(a) * STEP, z + Math.cos(a) * STEP)) a = ba; x += Math.sin(a) * STEP; z += Math.cos(a) * STEP;
  }
  return ending();              // (only what reaches the sea or a lake: a wide river doesn't just stop)
}
function generate(planet, ri, rj) {
  const S = stateOf(planet), key = ri + ',' + rj; if (S.regions.has(key)) return; S.regions.set(key, true);
  for (const [T, w0] of cellRivers(planet, ri, rj)) addRiver(S, T, w0);
}
// A cell's rivers, worked out once and handed over from a background thread, so walking into new land doesn't stop the world while they're found.
export function riverCellDone(planet, ri, rj) { return stateOf(planet).regions.has(ri + ',' + rj); }
export function adoptRiverCell(planet, ri, rj, list) { const S = stateOf(planet), key = ri + ',' + rj; if (S.regions.has(key)) return; S.regions.set(key, true); for (const [T, w0] of list) addRiver(S, T, w0); }
// What this cell's rivers are. Reads the land and the towns, never other rivers, so it comes out the same whatever order the cells are found in.
export function cellRivers(planet, ri, rj) {
  const out = [];
  const rng = new Rng(derive(planet.seed, 'rivers', [ri, rj])), n = rng.int(2, 5);
  for (let r = 0; r < n; r++) {
    // a source: the highest of a few spots, if it's wet enough for water to come off it
    let sx = 0, sz = 0, sh = -1e9; for (let k = 0; k < 5; k++) { const x = (ri + rng.next()) * REGION, z = (rj + rng.next()) * REGION, h = rawHeight(planet, x, z); if (h > sh) { sh = h; sx = x; sz = z; } }
    if (sh < planet.seaLevel + 45 || moisture(planet, sx, sz) < 0.28) continue;
    const T = trace(planet, sx, sz, rng.range(0, 6.28), rng); if (!T || T.pts.length < 25) continue;
    out.push([T, 0]);
  }
  townRivers(planet, out, ri, rj);
  return out;
}
function addRiver(S, T, w0 = 0) {
  const L = T.pts.length, R = { id: S.rivers.length, pts: T.pts, toSea: T.toSea, lake: !!T.lake, w: T.pts.map((_, i) => { const w = 2.6 + 13 * Math.min(1, (i + w0) / 110), e = L - 1 - i; return +(T.lake && e < 9 ? w + (e < 2 ? (e / 2) * 58 : 58 * Math.min(1, (9 - e) / 4)) : w).toFixed(2); }) };
  S.rivers.push(R);
    for (let i = 0; i + 1 < L; i++) { const a = R.pts[i], b = R.pts[i + 1], reach = R.w[i] / 2 + WIDE + 2; for (let p = Math.floor((Math.min(a.x, b.x) - reach) / CELL); p <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); p++) for (let q = Math.floor((Math.min(a.z, b.z) - reach) / CELL); q <= Math.floor((Math.max(a.z, b.z) + reach) / CELL); q++) { const k = p * 200003 + q; let c = S.grid.get(k); if (!c) S.grid.set(k, c = []); c.push([R, i]); } }
  return R;
}
// Towns get built on rivers, and then roads have to cross them. The town you can actually visit gets a river from the higher ground nearby, that
// comes down across one of its roads a few hundred metres out and on to the sea: if the land really will take it there.
function townRivers(planet, out, ri, rj) {
  const a0 = Math.floor(ri * REGION / TOWN_REGION), a1 = Math.floor((ri + 1) * REGION / TOWN_REGION), b0 = Math.floor(rj * REGION / TOWN_REGION), b1 = Math.floor((rj + 1) * REGION / TOWN_REGION);
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const s = getSettlement(planet, a, b); if (s && Math.floor(s.cx / REGION) === ri && Math.floor(s.cz / REGION) === rj && (!planet.onlyHomeRiver || (!a && !b))) townRiver(planet, out, s); }     // (onlyHomeRiver: tests that look at hundreds of home towns and nothing else)
}
function townRiver(planet, out, s) {
  const routes = routeLines(planet, s); if (!routes.length) return;
  const rng = new Rng(derive(planet.seed, 'town-river', [s.rx, s.rz])), far = (x, z) => { const q = settlementNear(planet, x, z); return !(q && Math.hypot(...q.toLocal(x, z)) < q.R + 320); };
  // Any town but the first has fewer goes at it, and its river is no longer than the ones that rise on their own: this runs for every town on the way, and a river that could reach further than the next cell would turn up only once you'd found where it rises.
  const home = !s.rx && !s.rz, tries = home ? 40 : 14, runLen = home ? LONGEST : MAXLEN, lows = new Map(), lowOf = (r, i) => { const k = r.id * 100000 + i; let h = lows.get(k); if (h === undefined) lows.set(k, h = rawHeight(planet, r.pts[i][0], r.pts[i][1])); return h; };
  for (let t = 0; t < tries; t++) {
    const r = routes[t % routes.length], spots = []; for (let i = r.lead + 2; i < r.pts.length - 2; i++) { const d = Math.hypot(r.pts[i][0] - s.cx, r.pts[i][1] - s.cz) - s.R; if (d > 430 && d < 900) spots.push(i); } if (!spots.length) continue;
    spots.sort((p, q) => lowOf(r, p) - lowOf(r, q));     // where the road's lowest: water finds the same places
    const i = spots[Math.min(spots.length - 1, Math.floor(t / 2) * 3)], [cx, cz] = r.pts[i], tx = r.pts[i + 1][0] - r.pts[i - 1][0], tz = r.pts[i + 1][1] - r.pts[i - 1][1], tl = Math.hypot(tx, tz) || 1, nx = tz / tl, nz = -tx / tl;
    // Walk up from the crossing, straight off the road at first and then up the easiest rise (a valley, not a cliff), and the river comes back down that same way, so nothing on its way down is uphill.
    const side = (t % 4 < 2) === (rawHeight(planet, cx + nx * 300, cz + nz * 300) > rawHeight(planet, cx - nx * 300, cz - nz * 300)) ? 1 : -1, up = []; let ux = cx, uz = cz, ua = Math.atan2(nx * side, nz * side), uh = rawHeight(planet, cx, cz);
    for (let n = 0; n * STEP < 1200; n++) { let bq = null, bh = -1e9, bs = -1e9; const fan = n < 8 ? [0] : [-2, -1, 0, 1, 2]; for (const k of fan) { const q = ua + k * 0.42, qx = ux + Math.sin(q) * STEP, qz = uz + Math.cos(q) * STEP, h = rawHeight(planet, qx, qz), score = -Math.abs(h - uh - 2.5); if (far(qx, qz) && score > bs) { bs = score; bh = h; bq = q; } } if (bq === null) break; ua = bq; ux += Math.sin(ua) * STEP; uz += Math.cos(ua) * STEP; uh = Math.max(uh, bh); up.push([ux, uz]); }
    if (up.length < 7) continue;
    const src = up.pop(), path = [...up.reverse(), [cx, cz], [cx - nx * side * STEP, cz - nz * side * STEP], [cx - nx * side * STEP * 2, cz - nz * side * STEP * 2]];
    const need = path.length + 10, T = trace(planet, src[0], src[1], 0, rng, path, runLen, 42, need); if (!T || T.pts.length < 15) continue;
    for (let n = T.pts.length - 2; n >= 0; n--) T.pts[n].y = +Math.min(T.pts[n].y, T.pts[n + 1].y + 5).toFixed(2);     // no chutes: where the land drops away the water has cut back into it, like water does
    // A crossing, not a causeway: short spans over the road, and not down a gorge.
    let spans = 0, longest = 0, high = 0; for (const e of routes) { let run = 0; for (let g = e.lead + 1; g <= e.pts.length; g++) { let wet = false, wy = 0; if (g < e.pts.length) { const [gx, gz] = e.pts[g]; for (let n = 0; n + 1 < T.pts.length && !wet; n++) { const A = T.pts[n], C = T.pts[n + 1], ex = C.x - A.x, ez = C.z - A.z, f = Math.max(0, Math.min(1, ((gx - A.x) * ex + (gz - A.z) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(A.x + ex * f - gx, A.z + ez * f - gz) < 16) { wet = true; wy = A.y; } } if (wet) high = Math.max(high, e.h[g] - wy); } if (wet) run++; else { if (run) { spans++; longest = Math.max(longest, run); } run = 0; } } }
    if (spans > 2 || !spans || longest > 22 || high > 20) continue;
    out.push([T, 28]); return;
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
// Is any river's channel within `reach` of (x, z)? Exact, where sampling the ground can step clean over a narrow one.
export function riverWithin(planet, x, z, reach) {
  const S = ensure(planet, x, z);
  for (let p = Math.floor((x - reach) / CELL); p <= Math.floor((x + reach) / CELL); p++) for (let q = Math.floor((z - reach) / CELL); q <= Math.floor((z + reach) / CELL); q++) { const c = S.grid.get(p * 200003 + q); if (!c) continue;
    for (const [R, i] of c) { const a = R.pts[i], b = R.pts[i + 1], ex = b.x - a.x, ez = b.z - a.z, f = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(a.x + ex * f - x, a.z + ez * f - z) < reach + R.w[i] / 2) return true; } }
  return false;
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
