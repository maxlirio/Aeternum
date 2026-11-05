// The kinds of land. The planet is cut into irregular regions, each one a kind of country with its
// own landform, ground, rock and plants: badlands stepped into mesas, dune seas, dried lake beds, boulder
// fields, lava and cinder cones, peat moors, marsh, limestone towers, deep forest, open meadow. Which of
// them a planet has, how common each is and what colour its rock is all come from the planet's seed.
// Pure; reads only (planet, x, z). Height, ground paint, plants and animals all read this one thing.
import { hashInts, hashStr } from '../core/hash.js';
import { smoothstep, lerp } from '../core/noise.js';

export const CELL = 1500, BLEND = 300;
export const SOFT = ['grass', 'dirt', 'litter', 'sand', 'cracked', 'moss', 'peat', 'ash', 'heath', 'gravel', 'snow'];   // what lies on flat ground
export const ROCK = ['sandstone', 'basalt', 'granite', 'pale'];                                                        // what shows on steep ground (+ plain 'rock')
export const S = Object.fromEntries(SOFT.map((k, i) => [k, i]));
export const RK = Object.fromEntries(ROCK.map((k, i) => [k, i]));

// grass, trees, fern, shrub: how much of each grows (0..1). stones: boulders per area. big: how many house-sized rocks. spire: rock pillars.
// bare: how much rock shows through flat ground. steep: the slope (normal y) where rock takes over.
export const LANDS = {
  meadow:    { soft: { grass: 1 },              rock: 'plain',     grass: 1,    trees: 0.2,  fern: 0.1, shrub: 0.5,  stones: 0.25, big: 0.03, spire: 0, bare: 0.02, steep: 0.78 },
  forest:    { soft: { litter: 0.8, moss: 0.2 }, rock: 'granite',   grass: 0.05, trees: 1,    fern: 1,   shrub: 0.6,  stones: 0.5,  big: 0.1,  spire: 0, bare: 0.03, steep: 0.72 },
  rockfield: { soft: { gravel: 0.75, dirt: 0.25 }, rock: 'granite', grass: 0.14, trees: 0.03, fern: 0,   shrub: 0.25, stones: 7,    big: 2.2,   spire: 0, bare: 0.32, steep: 0.86 },
  badlands:  { soft: { dirt: 0.55, sand: 0.45 }, rock: 'sandstone', grass: 0.02, trees: 0.01, fern: 0,   shrub: 0.22, stones: 1.1,  big: 0.45, spire: 0.7, bare: 0.2, steep: 0.9 },
  dunes:     { soft: { sand: 1 },               rock: 'sandstone', grass: 0.005, trees: 0.004, fern: 0,  shrub: 0.01, stones: 0.02, big: 0.02, spire: 0, bare: 0, steep: 0.62 },
  saltpan:   { soft: { cracked: 1 },            rock: 'pale',      grass: 0,    trees: 0,    fern: 0,   shrub: 0.01, stones: 0.03, big: 0.01, spire: 0, bare: 0, steep: 0.75 },
  marsh:     { soft: { peat: 0.4, moss: 0.6 }, rock: 'plain',    grass: 0.75, trees: 0.09, fern: 0.6, shrub: 0.35, stones: 0.05, big: 0,    spire: 0, bare: 0, steep: 0.7 },
  lava:      { soft: { ash: 1 },                rock: 'basalt',    grass: 0.008, trees: 0,   fern: 0,   shrub: 0.03, stones: 2.2,  big: 0.7,  spire: 0.5, bare: 0.4, steep: 0.93 },
  moor:      { soft: { heath: 0.85, peat: 0.15 }, rock: 'granite', grass: 0.3,  trees: 0.025, fern: 0.1, shrub: 0.6, stones: 0.8,  big: 0.25, spire: 0, bare: 0.1, steep: 0.82 },
  karst:     { soft: { grass: 0.7, gravel: 0.3 }, rock: 'pale',    grass: 0.75, trees: 0.28, fern: 0.3, shrub: 0.5,  stones: 0.9,  big: 0.4,  spire: 0.35, bare: 0.22, steep: 0.84 },
};
// How each land takes your weight (gen/underfoot.js decides whether you're on it). speed: of a walk (1 = firm). sink: how far your feet go in (m).
// loose: it runs under you on a steep face, as dry sand does. dust: what a footfall kicks up.
export const FEEL = {
  meadow:    { speed: 1, sink: 0.01, loose: 0, dust: 0 },
  forest:    { speed: 0.95, sink: 0.02, loose: 0, dust: 0 },
  rockfield: { speed: 0.88, sink: 0, loose: 0.25, dust: 0.1 },
  badlands:  { speed: 0.96, sink: 0.005, loose: 0.3, dust: 0.45 },
  dunes:     { speed: 0.76, sink: 0.07, loose: 1, dust: 0.8 },
  saltpan:   { speed: 1.04, sink: 0, loose: 0, dust: 0.2 },
  marsh:     { speed: 0.6, sink: 0.14, loose: 0, dust: 0 },
  lava:      { speed: 0.84, sink: 0.015, loose: 0.55, dust: 0.9 },
  moor:      { speed: 0.84, sink: 0.05, loose: 0, dust: 0 },
  karst:     { speed: 0.97, sink: 0.01, loose: 0, dust: 0.1 },
};
export function groundFeel(planet, x, z) {
  const o = { speed: 0, sink: 0, loose: 0, dust: 0, kind: 'meadow' }; let b = 0;
  for (const { c, w } of landAt(planet, x, z)) { const F = FEEL[c.kind]; for (const k of ['speed', 'sink', 'loose', 'dust']) o[k] += F[k] * w; if (w > b) { b = w; o.kind = c.kind; } }
  return o;
}
export const KINDS = Object.keys(LANDS);
const BY_CLIMATE = {    // how common each kind is, before the planet's seed has its say
  temperate: { meadow: 3, forest: 4, rockfield: 1, badlands: 1, dunes: 0.5, saltpan: 0.4, marsh: 1.4, lava: 0.5, moor: 1.2, karst: 1 },
  steppe:    { meadow: 2, forest: 2, rockfield: 1.3, badlands: 3, dunes: 2.5, saltpan: 1.2, marsh: 0.4, lava: 0.7, moor: 0.7, karst: 0.7 },
  highland:  { meadow: 2, forest: 3, rockfield: 2.4, badlands: 1, dunes: 0.3, saltpan: 0.4, marsh: 0.8, lava: 1.1, moor: 2.6, karst: 1.3 },
};
// Rock and ground colours each planet can have. Real strange places, not paint: rust, cream, slate, ochre.
const TONES = {
  sandstone: [[0.62, 0.3, 0.16], [0.72, 0.44, 0.24], [0.68, 0.36, 0.3], [0.74, 0.58, 0.36], [0.56, 0.32, 0.34], [0.8, 0.66, 0.5]],
  sand:      [[0.8, 0.66, 0.44], [0.82, 0.56, 0.32], [0.88, 0.8, 0.66], [0.72, 0.46, 0.3], [0.78, 0.7, 0.58]],
  heath:     [[0.42, 0.3, 0.32], [0.46, 0.3, 0.2], [0.34, 0.32, 0.26], [0.38, 0.28, 0.38], [0.5, 0.36, 0.22]],
  moss:      [[0.26, 0.34, 0.11], [0.22, 0.31, 0.1], [0.36, 0.34, 0.12], [0.26, 0.3, 0.09]],
  litter:    [[0.44, 0.28, 0.08], [0.5, 0.28, 0.06], [0.38, 0.3, 0.09], [0.46, 0.26, 0.05]],
};

const memo = new WeakMap();
function planetLand(planet) {
  let L = memo.get(planet); if (L) return L;
  const seed = hashStr(planet.universeSeed[0] ^ 0x1a2d, planet.address?.key || 'p'), h = k => hashInts(seed, [k]) / 4294967296, base = BY_CLIMATE[planet.climate.id] || BY_CLIMATE.temperate;
  const pick = (a, k) => a[Math.floor(h(k) * a.length) % a.length];
  const weights = KINDS.map((k, i) => (base[k] || 1) * (0.25 + 1.5 * h(i + 1)) * (k !== 'meadow' && k !== 'forest' && h(i + 20) < 0.14 ? 0 : 1)), total = weights.reduce((a, b) => a + b, 0);
  L = { seed, weights, total, cells: new Map(), tones: { sandstone: pick(TONES.sandstone, 40), sand: pick(TONES.sand, 41), heath: pick(TONES.heath, 42), moss: pick(TONES.moss, 43), litter: pick(TONES.litter, 44) } };
  memo.set(planet, L);
  return L;
}
export const landTones = planet => planetLand(planet).tones;
// The way the wind has blown here for ten thousand years (not today's weather): every dune on the planet lies to it.
export const prevailing = planet => (planetLand(planet).seed % 6283) / 1000;

function cellOf(planet, L, i, j, base) {
  const k = i * 65536 + j; let c = L.cells.get(k); if (c) return c;
  const r = n => hashInts(L.seed, [i, j, n]) / 4294967296;
  const x = (i + 0.1 + 0.8 * r(1)) * CELL, z = (j + 0.1 + 0.8 * r(2)) * CELL;
  let q = r(3) * L.total, kind = 'meadow'; for (let n = 0; n < KINDS.length; n++) { q -= L.weights[n]; if (q < 0) { kind = KINDS[n]; break; } }
  c = { i, j, x, z, kind, T: LANDS[kind], id: hashInts(L.seed, [i, j, 77]), h0: base ? Math.max(9, base(planet, x, z)) : 30 };
  if (L.cells.size > 4000) L.cells.delete(L.cells.keys().next().value);
  L.cells.set(k, c);
  return c;
}

// The regions that touch (x, z): [{ c, w }] with weights adding to 1. `base` (terrain.js) gives a region its own ground level.
let baseFn = null;
export const setLandBase = f => { baseFn = f; };
export function landAt(planet, x, z) {
  const L = planetLand(planet), N = planet.noise, wx = x + 340 * N.warp.fbm(x / 900 + 11.3, z / 900 - 7.1, 3), wz = z + 340 * N.warp.fbm(x / 900 - 3.9, z / 900 + 8.7, 3);
  const ci = Math.floor(wx / CELL), cj = Math.floor(wz / CELL); let dmin = Infinity; const near = [];
  for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) { const c = cellOf(planet, L, a, b, baseFn), d = Math.hypot(c.x - wx, c.z - wz); near.push(c, d); if (d < dmin) dmin = d; }
  const out = []; let tot = 0;
  for (let n = 0; n < near.length; n += 2) { const e = 1 - (near[n + 1] - dmin) / BLEND; if (e > 0) { const w = e * e * (3 - 2 * e); out.push({ c: near[n], w }); tot += w; } }
  for (const o of out) o.w /= tot;
  return out;
}
export function mainLand(planet, x, z) { const l = landAt(planet, x, z); let b = l[0]; for (const o of l) if (o.w > b.w) b = o; return b.c; }

// The blended traits at a spot.
// (A coarse grid of these, for things sampled many times close together: see gridTraits.)
export function gridTraits(planet, x0, z0, size, n = 4) {
  const G = []; for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) G.push(landTraits(planet, x0 + a * size / n, z0 + b * size / n));
  return (x, z, k) => { const u = Math.min(n - 1e-6, Math.max(0, (x - x0) / size * n)), v = Math.min(n - 1e-6, Math.max(0, (z - z0) / size * n)), a = Math.floor(u), b = Math.floor(v), du = u - a, dv = v - b, m = n + 1, g = (p, q) => G[q * m + p][k];
    return g(a, b) * (1 - du) * (1 - dv) + g(a + 1, b) * du * (1 - dv) + g(a, b + 1) * (1 - du) * dv + g(a + 1, b + 1) * du * dv; };
}
export function landTraits(planet, x, z) {
  const t = { grass: 0, trees: 0, fern: 0, shrub: 0, stones: 0, big: 0, spire: 0, bare: 0, steep: 0 };
  for (const { c, w } of landAt(planet, x, z)) for (const k in t) t[k] += c.T[k] * w;
  return t;
}

// A scatter of features on its own grid: fn(cx, cz, r(n)) for each cell around the spot.
function around(seed, x, z, size, fn) {
  const i = Math.floor(x / size), j = Math.floor(z / size);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
    const r = n => hashInts(seed, [a, b, n]) / 4294967296;
    fn((a + 0.15 + 0.7 * r(1)) * size, (b + 0.15 + 0.7 * r(2)) * size, r);
  }
}

const SHAPES = {
  meadow: (P, x, z, h) => h,
  forest: (P, x, z, h) => h + 2.5 * P.noise.detail.fbm(x / 130, z / 130, 2),
  // rounded rock heaps standing out of a stony plain
  rockfield: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0x70f, x, z, 110, (cx, cz, r) => { if (r(3) > 0.5) return; const R = 16 + 26 * r(4), d = Math.hypot(cx - x, cz - z); if (d < R) { const u = 1 - d / R; top = Math.max(top, (5 + 15 * r(5)) * u * u * (3 - 2 * u)); } });
    return h + top + 5 * P.noise.mount.ridged(x / 150, z / 150, 3) + 1.1 * P.noise.detail.fbm(x / 13, z / 13, 2);
  },
  // the land stepped into shelves and mesas, cut by short cliffs
  badlands: (P, x, z, h, c) => {
    const n = 0.5 + 0.7 * P.noise.hill.fbm(x / 520 + 17, z / 520 - 4, 3), cap = 0.62 + 0.3 * (0.5 + 0.5 * P.noise.warp.fbm(x / 1500, z / 1500, 2)), L = Math.min(Math.max(0, n), cap) * 118, st = 21, k = Math.floor(L / st), f = L / st - k;      // (flat tops: the hard bed on top holds, the softer ones below wear back)
    return lerp(h, c.h0, 0.85) + (k + smoothstep(0.8, 0.98, f) + 0.08 * f) * st - 14 + 1.6 * P.noise.mount.ridged(x / 46, z / 46, 3);
  },
  // Dunes as wind builds them. Every crest lies across the one prevailing wind; the windward side is long and
  // gentle and rises to a sharp crest; the lee is a straight slip face at sand's angle of repose (about 32°).
  // Crests bow into crescents, and fork and die out where there's less sand.
  dunes: (P, x, z, h, c) => {
    const a = prevailing(P), ca = Math.cos(a), sa = Math.sin(a), along = x * ca + z * sa, across = -x * sa + z * ca;
    const W = 150, bow = 42 * Math.abs(Math.sin(across / 190 + 1.4 * P.noise.warp.fbm(along / 900, across / 900, 2))), u = along + bow + 50 * P.noise.warp.fbm(x / 420, z / 420, 2);
    const sand = 0.5 + 0.5 * P.noise.hill.fbm(across / 300 + 9, along / 900, 2), A = 5 + 13 * sand, cell = Math.floor(u / W), f = u / W - cell;
    const lee = Math.min(0.27, (A / 0.62) / W), wind = 1 - lee, rise = f < wind ? (f / wind) ** 1.35 : (1 - f) / lee, toe = rise < 0.08 ? rise * rise / 0.16 + 0.04 : rise;
    return lerp(h, c.h0, 0.86) + A * toe + 0.45 * P.noise.hill.fbm(x / 70, z / 70, 2);
  },
  // dead level, low in its own basin
  saltpan: (P, x, z, h, c) => lerp(h, c.h0 - 3, 0.985) + 0.05 * P.noise.detail.fbm(x / 20, z / 20, 2),
  marsh: (P, x, z, h, c) => lerp(h, c.h0 - 2, 0.96) + 0.5 * P.noise.detail.fbm(x / 22, z / 22, 2),
  // blocky flows and cinder cones with craters
  lava: (P, x, z, h, c) => {
    let cone = 0;
    around(c.id ^ 0x1a7a, x, z, 800, (cx, cz, r) => { if (r(3) > 0.55) return; const R = 170 + 200 * r(4), d = Math.hypot(cx - x, cz - z) / R; if (d < 1) { const H = 45 + 85 * r(5); cone = Math.max(cone, d > 0.2 ? H * (1 - d) ** 1.25 : H * 0.8 ** 1.25 - H * 0.22 * (1 - d / 0.2)); } });
    return lerp(h, c.h0, 0.5) + cone + 6 * P.noise.mount.ridged(x / 75, z / 75, 3) + 1.6 * P.noise.detail.ridged(x / 12, z / 12, 2);
  },
  moor: (P, x, z, h) => h + 1.8 * P.noise.detail.fbm(x / 30, z / 30, 3),
  // steep-sided limestone towers out of green flats
  karst: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0x4a51, x, z, 210, (cx, cz, r) => { if (r(3) > 0.62) return; const R = 34 + 56 * r(4), wob = 1 + 0.22 * P.noise.detail.fbm(x / 28 + r(6) * 40, z / 28, 2), d = Math.hypot(cx - x, cz - z) * wob; if (d < R) { const u = smoothstep(R, R * 0.5, d); top = Math.max(top, (28 + 62 * r(5)) * u * (0.92 + 0.08 * P.noise.detail.ridged(x / 18, z / 18, 2))); } });
    return lerp(h, c.h0, 0.8) + top;
  },
};

// The shaped ground, given the bare continental height. Mountains and coasts keep their own shape.
export function shapeLand(planet, x, z, h) {
  const dry = smoothstep(1.5, 26, h); if (dry <= 0) return h;
  const high = 1 - smoothstep(420, 820, h);
  let out = 0;
  for (const { c, w } of landAt(planet, x, z)) out += w * SHAPES[c.kind](planet, x, z, h, c);
  return lerp(h, Math.max(out, 0.5), dry * high);
}

// What the ground is painted with. `w` gets the 12 + 4 weights (11 soft, plain rock; 4 rocks), adding to 1; `col` gets the colour.
// ny: 1 = flat. Worked or graded ground, shores and snow are the caller's to lay over this.
export function groundAt(planet, x, z, ny, moist, w, col, C = planet.climate) {
  w.fill(0);
  const tones = landTones(planet), N = planet.noise, patch = 0.5 + 0.5 * N.detail.fbm(x / 21, z / 21, 3), gm = smoothstep(0.25, 0.75, moist), T = { grass: [C.dry[0] + (C.grass[0] - C.dry[0]) * gm, C.dry[1] + (C.grass[1] - C.dry[1]) * gm, C.dry[2] + (C.grass[2] - C.dry[2]) * gm], dirt: C.dry, litter: tones.litter, sand: tones.sand, cracked: [0.86, 0.82, 0.74], moss: tones.moss, peat: [0.2, 0.17, 0.06], ash: [0.2, 0.19, 0.18], heath: tones.heath, gravel: [0.3, 0.29, 0.27], snow: [C.snow, C.snow, C.snow * 1.02] };
  const R = { plain: C.rock, sandstone: tones.sandstone, basalt: [0.13, 0.12, 0.12], granite: [0.29, 0.28, 0.27], pale: [0.6, 0.57, 0.5] };
  let rockTot = 0, r0 = 0, g0 = 0, b0 = 0, s0 = 0, g1 = 0, b1 = 0;
  const lands = landAt(planet, x, z);
  for (const { c, w: lw } of lands) {
    const K = c.T, rocky = Math.max(smoothstep(K.steep, K.steep - 0.2, ny), smoothstep(1 - K.bare, 1 - K.bare * 0.6, patch) * (K.bare > 0 ? 1 : 0));
    rockTot += lw * rocky;
    const rc = R[K.rock]; if (K.rock === 'plain') w[11] += lw * rocky; else w[12 + RK[K.rock]] += lw * rocky;
    r0 += lw * rocky * rc[0]; g1 += lw * rocky * rc[1]; b1 += lw * rocky * rc[2];
    for (const k in K.soft) { const q = lw * (1 - rocky) * K.soft[k], t = T[k]; w[S[k]] += q; s0 += q * t[0]; g0 += q * t[1]; b0 += q * t[2]; }
  }
  col[0] = s0 + r0; col[1] = g0 + g1; col[2] = b0 + b1;
  return rockTot;
}
