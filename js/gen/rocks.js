// Rocks: boulders, slabs and pillars lying on the land, as many as the kind of land has. Pure data, as
// plants are: where, how big, which shape, and the solid circle a walker can't pass (gen/land.js says how
// many; render/rocks.js makes the models). Cached per tile; nothing's stored.
import { hashInts } from '../core/hash.js';
import { surfaceAt, cleared } from './surface.js';
import { gridTraits, mainLand } from './land.js';
import { settlementNear } from './settlement.js';
import { sitesNear, tracksNear, onTrack } from './outposts.js';
import { slopeHere } from './terrain.js';
import { landRill } from './land.js';
import { rockForm, outAt, topAt, sideAt, sideBetween } from './rockshape.js';

export const TILE = 96, SHAPES = ['boulder', 'slab', 'pillar'], VARIANTS = 4;
const cache = new Map();
const onSite = (planet, x, z) => { let on = false; sitesNear(planet, x, z, 140, S => { if (Math.hypot(S.x - x, S.z - z) < S.clear) on = true; }); return on; };

// (where a great ship lies, what was there is under it or gone: gen/surface.js cleared)
const kept = new WeakMap();
export function rockTile(planet, ti, tj) { const T = rockTile0(planet, ti, tj), n = planet.beds?.length || 0; if (!n || !T.length) return T; const had = kept.get(T); if (had && had.n === n) return had.T; const out = T.filter(q => !cleared(planet, q.x, q.z)); kept.set(T, { n, T: out.length === T.length ? T : out }); return kept.get(T).T; }
function rockTile0(planet, ti, tj) {
  const ck = planet.seed.join(':') + '|' + ti + ',' + tj; if (cache.has(ck)) return cache.get(ck);
  const out = [], seed = planet.seed[1] ^ 0x70cc5, x0 = ti * TILE, z0 = tj * TILE, LT = gridTraits(planet, x0, z0, TILE, 2), tracks = tracksNear(planet, x0 + TILE / 2, z0 + TILE / 2, TILE);
  const put = (x, z, sp, size, r) => {
    const s = surfaceAt(planet, x, z);
    if (s.town > 0.01 || s.road > 0.01 || s.deck || s.wet > 0.05 || s.h < planet.seaLevel + 1) return;
    if (onSite(planet, x, z) || tracks.some(T => onTrack(T, x, z))) return;
    const e = Math.max(0.8, size * 0.4), hx = surfaceAt(planet, x + e, z).h - s.h, hz = surfaceAt(planet, x, z + e).h - s.h, ny = e / Math.hypot(hx, e, hz);
    if (ny < 0.62) return;          // nothing rests on a cliff
    const c = mainLand(planet, x, z), shape = sp, tall = shape === 'pillar' ? size * (2 + 2.2 * r(9)) : shape === 'slab' ? size * (0.3 + 0.25 * r(9)) : size * (0.65 + 0.5 * r(9));
    const sink = (size > 2.5 ? 0.24 : 0.12) + 0.75 * (1 - ny);     // sat in the ground, not on it
    out.push({ x, z, y: s.h - tall * sink, g: s.h, shape, rock: c.T.rock, moss: c.T.soft.moss || c.T.soft.peat ? 1 : c.kind === 'meadow' || c.kind === 'moor' || c.kind === 'karst' ? 0.3 : 0,
      v: Math.floor(r(10) * VARIANTS), size, tall, rot: r(11) * 6.283, tilt: (r(12) - 0.5) * (shape === 'pillar' ? 0.1 : 0.4), tint: r(13),
      top: 0 });
    // its solid footprint: the drawn stone's own oval (render/rocks.js scales a unit block by size across, size·(0.75 + 0.4·tint) deep), turned with it
    // (its drawn shape is gen/rockshape.js's, measured: rockForm. Here only what bounds it: r round its middle, top its crown's height at most)
    const q = out[out.length - 1]; q.P = planet; q.k = 1; q.ax = size; q.az = size * (0.75 + 0.4 * q.tint); q.r = Math.max(q.ax, q.az) * 1.1;
    q.top = q.y + tall + Math.abs(Math.tan(q.tilt)) * q.r * 0.6 - s.h;
  };
  // small stones and boulders, 8 m apart at most
  for (let b = 0; b < 12; b++) for (let a = 0; a < 12; a++) {
    const i = ti * 12 + a, j = tj * 12 + b, r = k => hashInts(seed, [i, j, k]) / 4294967296, x = (i + r(1)) * 8, z = (j + r(2)) * 8, st = LT(x, z, 'stones');
    const clump = 0.35 + 1.3 * (0.5 + 0.5 * Math.sin(x / 19 + Math.sin(z / 13) * 2.2) * Math.cos(z / 17 + Math.sin(x / 11) * 2));   // boulders lie in spreads
    // what's fallen off the rock above lies on and below every steep slope
    const fallen = (a % 2 === 0 && b % 2 === 0) ? Math.max(0, Math.min(1, (slopeHere(planet, x, z) - 0.3) / 0.5)) * landRill(planet, x, z) * 0.5 : 0;
    if (r(3) > 0.14 * st * clump + fallen) continue;
    put(x, z, r(4) < 0.2 ? 'slab' : 'boulder', 0.28 + 2.1 * r(5) ** 2.6, r);
  }
  // house-sized rocks and pillars, 32 m apart at most
  for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
    const i = ti * 3 + a, j = tj * 3 + b, r = k => hashInts(seed ^ 0x51, [i, j, k]) / 4294967296, x = (i + r(1)) * 32, z = (j + r(2)) * 32;
    if (r(3) < 0.2 * LT(x, z, 'big')) put(x, z, r(4) < 0.25 ? 'slab' : 'boulder', 3 + 7 * r(5) ** 1.7, r);
    else if (r(6) < 0.11 * LT(x, z, 'spire')) put(x, z, 'pillar', 2 + 3.6 * r(5), r);
  }
  cache.set(ck, out);
  if (cache.size > 2500) cache.delete(cache.keys().next().value);
  return out;
}

// A steep hillside isn't a smooth thing with rock painted on it: the rock stands out of it, in courses, along the beds it was laid down in. Slabs lying across the fall of the land, sunk into it, each with its own size. Only for looking at (a slope this steep isn't walked on, and they don't stand far out of it).
const ledges = new Map();
export function ledgeTile(planet, ti, tj) {
  const ck = planet.seed.join(':') + '|' + ti + ',' + tj; if (ledges.has(ck)) return ledges.get(ck);
  const out = [], seed = planet.seed[1] ^ 0x1ed6e, n = 32, G = TILE / n;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const i = ti * n + a, j = tj * n + b, r = k => hashInts(seed, [i, j, k]) / 4294967296, x = (i + r(1)) * G, z = (j + r(2)) * G;
    if (slopeHere(planet, x, z) < 0.46 || landRill(planet, x, z) <= 0.05) continue;
    const s = surfaceAt(planet, x, z); if (s.town > 0.01 || s.road > 0.01 || s.deck || s.wet > 0.05 || s.h < planet.seaLevel + 3) continue;
    const bed = (s.h + 7 * Math.sin(x / 83 + 1.3) * Math.sin(z / 71)) / 3.1, course = bed - Math.floor(bed); if (course > 0.55) continue;    // in courses: a band of them, then soil and scree
    const e = 2.5, gx = (surfaceAt(planet, x + e, z).h - surfaceAt(planet, x - e, z).h) / (2 * e), gz = (surfaceAt(planet, x, z + e).h - surfaceAt(planet, x, z - e).h) / (2 * e), sl = Math.hypot(gx, gz); if (sl < 0.35) continue;
    const size = 0.7 + 2.5 * r(3) ** 2, tall = size * (0.4 + 0.45 * r(4));
    out.push({ x, z, y: s.h - tall * 0.58, g: s.h, top: tall * 0.42, shape: 'boulder', rock: mainLand(planet, x, z).T.rock, v: Math.floor(r(5) * VARIANTS), size, tall, deep: size * (0.55 + 0.3 * r(6)), gx, gz, across: Math.atan2(gx, gz) + (r(7) - 0.5) * 0.5, tint: r(8), moss: 0 });
    { const q = out[out.length - 1]; q.ax = size * 0.95; q.az = q.deep * 0.8 * 0.95; q.rot = q.across; q.r = Math.max(q.ax, q.az); q.k = 0.95; q.base = q.y - tall * 0.38; q.top = tall * 0.02 + 0.9 * sl * q.r; }      // (solid: its own oval, turned across the slope as it's drawn)
  }
  ledges.set(ck, out); if (ledges.size > 1200) ledges.delete(ledges.keys().next().value);
  return out;
}

// Rocks whose solid circle could touch a walker at (x, z) with reach R. (The biggest is 10 m across its middle.)
export function rocksNear(planet, x, z, R, fn) {
  const reach = R + 8, t0 = Math.floor((x - reach) / TILE), t1 = Math.floor((x + reach) / TILE), u0 = Math.floor((z - reach) / TILE), u1 = Math.floor((z + reach) / TILE);
  for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) for (const q of rockTile(planet, ti, tj)) { const d = R + q.r; if ((q.x - x) ** 2 + (q.z - z) ** 2 <= d * d) fn(q); }
}

// The rock standing out of steep hillsides near (x, z), as solid things: g the ground at it, top how far it stands above that.
export function ledgesNear(planet, x, z, R, fn) {
  const reach = R + 3, t0 = Math.floor((x - reach) / TILE), t1 = Math.floor((x + reach) / TILE), u0 = Math.floor((z - reach) / TILE), u1 = Math.floor((z + reach) / TILE);
  for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) for (const q of ledgeTile(planet, ti, tj)) { const d = R + q.r; if ((q.x - x) ** 2 + (q.z - z) ** 2 <= d * d) fn(q); }
}

// The stone's top as it's drawn (render/rocks.js: a sphere cut by joint planes, scaled to a unit block and stood on the land). Measured
// from the made stones: a boulder or a slab is nearly flat across its crown and rounds down to about three quarters of its height at
// the rim; a pillar's cap is flat right out to its overhang. As a fraction of its height, at e (0 its middle, 1 its rim).
export const PROFILE = { boulder: e => 0.98 - 0.25 * e * e, slab: e => 0.98 - 0.3 * e * e, pillar: e => 0.96 - 0.06 * e * e };
// ...and its sides: how far out the drawn stone comes, as a fraction of its rim, at height fraction t (barrel-shaped, narrower at the foot
// where it's sunk, drawn in under its crown)
const SIDE = [[0, 0.62], [0.1, 0.8], [0.2, 0.95], [0.3, 1], [0.7, 1], [0.8, 0.9], [0.9, 0.78], [1, 0.68]];
export function sideOf(t) { if (t <= 0) return SIDE[0][1]; for (let i = 1; i < SIDE.length; i++) if (t <= SIDE[i][0]) { const [a, A] = SIDE[i - 1], [b, B] = SIDE[i]; return A + (B - A) * (t - a) / (b - a); } return SIDE[SIDE.length - 1][1]; }
// in the stone's own frame: (lx, lz) along and across it, and e the drawn oval's radius there (1 at its rim)
export function rockLocal(q, x, z) { const c = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0), dx = x - q.x, dz = z - q.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c, k = q.k || 1, ux = lx / (q.ax / k), uz = lz / (q.az / k); return { dx, dz, lx, lz, ux, uz, e: Math.hypot(ux, uz) }; }
// the measured shape of a stone on the land (not a hillside's ledge: those are drawn bedded in the slope, and go by PROFILE)
export const formOf = q => q.gx !== undefined || !q.P ? null : (q.form || (q.form = rockForm(q.P, q.rock, q.shape, q.v)));
const toWorld = (q, lx, lz) => { const c = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0); return [q.x + lx * c + lz * sn, q.z - lx * sn + lz * c]; };
// The height of the top of stone q at (x, z), or -Infinity off it. rim: as if (x, z) were on its rim, along the same line from its middle.
export function rockSurface(q, x, z, rim = false) {
  let L = rockLocal(q, x, z); const F = formOf(q);
  if (F) {
    if (rim) { if (L.e < 1e-6) return q.g + q.top; const f = outAt(F, L.ux, L.uz) * 0.985 / L.e; L = { dx: L.dx * f, dz: L.dz * f, lx: L.lx * f, lz: L.lz * f, ux: L.ux * f, uz: L.uz * f }; }
    const t = topAt(F, L.ux, L.uz); if (t < 0) return -Infinity;
    return q.y + q.tall * t + L.lx * Math.tan((q.tilt || 0) * 0.6) - L.dz * Math.tan(q.tilt || 0);
  }
  if (rim) { if (L.e < 1e-6) return q.g + q.top; const f = 0.999 / L.e; L = { dx: L.dx * f, dz: L.dz * f, lx: L.lx * f, lz: L.lz * f, e: 0.999 }; }
  if (L.e > 1) return -Infinity;
  if (q.gx !== undefined) return q.base + q.tall * PROFILE.boulder(L.e) + 0.9 * (q.gx * L.dx + q.gz * L.dz);      // (a ledge: leaning back into the slope it stands out of)
  return q.y + q.tall * (PROFILE[q.shape] || PROFILE.boulder)(L.e) + L.lx * Math.tan((q.tilt || 0) * 0.6) - L.dz * Math.tan(q.tilt || 0);      // (tipped as it's drawn: Euler(tilt, rot, tilt·0.6))
}

// Is the point inside the drawn stone? (Its barrel of a side, under its top.)
export function rockSolid(q, x, y, z) {
  const L = rockLocal(q, x, z), F = formOf(q);
  if (F) { const t = (y - q.y) / q.tall; if (t < 0 || t > 1.05 || L.e > F.max) return false; return L.e <= sideAt(F, L.ux, L.uz, t) && y <= rockSurface(q, x, z); }
  if (L.e > 1) return false;
  if (y > rockSurface(q, x, z)) return false;
  if (q.gx !== undefined) return y >= q.base;
  const t = (y - q.y) / q.tall; if (t < 0) return false;
  return q.shape === 'pillar' ? L.e <= 0.9 : L.e <= sideOf(t);
}

// Is (x, z) within `pad` of rock q's oval footprint? → the point pushed out to its edge, or null.
export function outOfRock(q, x, z, pad, y0 = null, y1 = null) {
  const F = formOf(q);
  if (F) {      // out along the line from its middle, to its drawn side (the widest of it between y0 and y1, given them) and pad beyond
    const L = rockLocal(q, x, z), o = y0 === null ? outAt(F, L.ux, L.uz) : sideBetween(F, L.ux, L.uz, (y0 - q.y) / q.tall, (y1 - q.y) / q.tall); if (o <= 0) return null;
    const lp = Math.hypot(L.lx, L.lz); if (lp < 1e-6) return toWorld(q, q.ax * o + pad, 0);
    const lb = lp * o / L.e; if (lp >= lb + pad) return null;
    const f = (lb + pad) / lp; return toWorld(q, L.lx * f, L.lz * f);
  }
  const c = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0), dx = x - q.x, dz = z - q.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c, A = (q.ax ?? q.r) + pad, B = (q.az ?? q.r) + pad, e = Math.hypot(lx / A, lz / B);
  if (e >= 1) return null;
  const k = e > 1e-6 ? 1 / e : 0, ox = e > 1e-6 ? lx * k : A, oz = e > 1e-6 ? lz * k : 0;
  return [q.x + ox * c + oz * sn, q.z - ox * sn + oz * c];
}
