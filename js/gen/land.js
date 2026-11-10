// The kinds of land. The planet is cut into irregular regions, each one a kind of country with its
// own landform, ground, rock and plants: badlands stepped into mesas, dune seas, dried lake beds, boulder
// fields, lava and cinder cones, peat moors, marsh, limestone towers, deep forest, open meadow. Which of
// them a planet has, how common each is and what colour its rock is all come from the planet's seed.
// Pure; reads only (planet, x, z). Height, ground paint, plants and animals all read this one thing.
import { hashInts, hashStr } from '../core/hash.js';
import { smoothstep, lerp } from '../core/noise.js';
import { globeOf, toSphere, axisOf } from './globe.js';

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
  // the kinds only some worlds have (gen/genome.js decides which)
  jungle:    { soft: { litter: 0.55, moss: 0.45 }, rock: 'granite', grass: 0.3,  trees: 1.6,  fern: 1.5, shrub: 1,    stones: 0.2,  big: 0.05, spire: 0, bare: 0.01, steep: 0.66 },
  ice:       { soft: { snow: 1 },               rock: 'pale',      grass: 0,    trees: 0.01, fern: 0,   shrub: 0.02, stones: 0.4,  big: 0.3,  spire: 0.1, bare: 0.06, steep: 0.8 },
  canyon:    { soft: { dirt: 0.5, sand: 0.5 },  rock: 'sandstone', grass: 0.05, trees: 0.03, fern: 0,   shrub: 0.25, stones: 0.8,  big: 0.3,  spire: 0.2, bare: 0.25, steep: 0.88 },
  spires:    { soft: { dirt: 0.6, sand: 0.4 },  rock: 'sandstone', grass: 0.2,  trees: 0.12, fern: 0.05, shrub: 0.35, stones: 0.6, big: 0.2,  spire: 0.9, bare: 0.15, steep: 0.86 },
  craters:   { soft: { gravel: 0.5, dirt: 0.3, ash: 0.2 }, rock: 'plain', grass: 0.02, trees: 0.01, fern: 0, shrub: 0.05, stones: 2.5, big: 0.6, spire: 0, bare: 0.3, steep: 0.86 },
  fungal:    { soft: { moss: 0.55, peat: 0.45 }, rock: 'plain',    grass: 0.5,  trees: 0.9,  fern: 1,   shrub: 0.7,  stones: 0.2,  big: 0.05, spire: 0, bare: 0.02, steep: 0.72 },
  crystal:   { soft: { gravel: 0.5, cracked: 0.5 }, rock: 'pale',  grass: 0.04, trees: 0.08, fern: 0,   shrub: 0.1,  stones: 1.5,  big: 0.6,  spire: 0.6, bare: 0.3, steep: 0.86 },
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
  jungle:    { speed: 0.85, sink: 0.04, loose: 0, dust: 0 },
  ice:       { speed: 0.9, sink: 0.03, loose: 0.1, dust: 0.3 },
  canyon:    { speed: 0.95, sink: 0.005, loose: 0.3, dust: 0.45 },
  spires:    { speed: 0.95, sink: 0.01, loose: 0.2, dust: 0.3 },
  craters:   { speed: 0.9, sink: 0.01, loose: 0.35, dust: 0.6 },
  fungal:    { speed: 0.8, sink: 0.08, loose: 0, dust: 0 },
  crystal:   { speed: 0.92, sink: 0, loose: 0.2, dust: 0.15 },
};
export function groundFeel(planet, x, z) {
  const o = { speed: 0, sink: 0, loose: 0, dust: 0, kind: 'meadow' }; let b = 0;
  for (const { c, w } of landAt(planet, x, z)) { const F = FEEL[c.kind]; for (const k of ['speed', 'sink', 'loose', 'dust']) o[k] += F[k] * w; if (w > b) { b = w; o.kind = c.kind; } }
  return o;
}
export const KINDS = Object.keys(LANDS);
// How much running water has cut this kind of land. Sand and salt don't hold a gully; a lava flow is young; everything else has been rained on for a long time.
const RILL = { meadow: 1, forest: 1, rockfield: 0.7, badlands: 0.9, dunes: 0, saltpan: 0, marsh: 0, lava: 0.55, moor: 0.85, karst: 0.6, jungle: 1, ice: 0.15, canyon: 1.1, spires: 0.9, craters: 0.3, fungal: 0.6, crystal: 0.4 };
const ROUGH = { meadow: 0.8, forest: 1, rockfield: 1.5, badlands: 0.9, dunes: 0.08, saltpan: 0.02, marsh: 0.3, lava: 2, moor: 0.8, karst: 0.9, jungle: 0.9, ice: 0.25, canyon: 1.1, spires: 1, craters: 1.2, fungal: 0.6, crystal: 1.4 };
export function landRough(planet, x, z) { let r = 0; for (const { c, w } of landAt(planet, x, z)) r += w * ROUGH[c.kind]; return r; }
export function landRill(planet, x, z) { let r = 0; for (const { c, w } of landAt(planet, x, z)) r += w * RILL[c.kind]; return r; }
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
  const G = planet.genome, seed = G ? hashInts(planet.seed[0] ^ 0x1a2d, [planet.seed[1]]) : hashStr(planet.universeSeed[0] ^ 0x1a2d, planet.address?.key || 'p'), h = k => hashInts(seed, [k]) / 4294967296, base = G ? G.lands : BY_CLIMATE[planet.climate.id] || BY_CLIMATE.temperate;
  const pick = (a, k) => a[Math.floor(h(k) * a.length) % a.length];
  const weights = KINDS.map((k, i) => G ? (base[k] || 0) : (base[k] || 0) * (0.25 + 1.5 * h(i + 1)) * (k !== 'meadow' && k !== 'forest' && h(i + 20) < 0.14 ? 0 : 1)), total = weights.reduce((a, b) => a + b, 0);
  const mean = total / Math.max(1, weights.filter(v => v > 0).length), pull = weights.map(v => v > 0 ? v / mean : 0);     // (a kind the world is rich in wins more of the places that suit it)
  // this world's own climate: how hot and wet it runs overall, within what people can live in
  const C = planet.climate, wd = G ? G.weird : 0, mx = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), canopy = C.canopy || C.grass;
  const tones = { sandstone: pick(TONES.sandstone, 40), sand: pick(TONES.sand, 41), heath: pick(TONES.heath, 42), moss: pick(TONES.moss, 43), litter: pick(TONES.litter, 44) };
  if (G) {          // the ground takes on the world's own colours: its sand, a moss and heath of its own hue, sandstone of its own rock
    if (G.keys.sand !== 'gold') tones.sand = C.sand;
    tones.moss = mx(tones.moss, canopy.map(v => v * 1.15), Math.min(1, 0.35 + wd)); tones.heath = mx(tones.heath, canopy.map(v => v * 1.35), Math.min(0.8, wd)); tones.litter = mx(tones.litter, C.dry.map(v => v * 0.8), Math.min(0.7, wd * 0.8));
    tones.sandstone = { red: tones.sandstone, warm: tones.sandstone, violet: [0.5, 0.36, 0.52], pale: [0.78, 0.72, 0.62], dark: [0.32, 0.24, 0.22], green: [0.42, 0.48, 0.36], grey: [0.6, 0.52, 0.44] }[G.keys.rock] || tones.sandstone;
  }
  L = { seed, weights, pull, total, warm: G ? C.warm : 0.42 + 0.3 * h(50), damp: G ? C.damp : 0.36 + 0.3 * h(51) + planet.climate.moistBias * 0.5, cells: new Map(), tones };
  memo.set(planet, L);
  return L;
}
export const landTones = planet => planetLand(planet).tones;
// The rocks' colours on this world: its own rock, and the others drawn toward it (a violet world's granite has violet in it).
const rk = new WeakMap();
export function rockTones(planet) {
  let R = rk.get(planet); if (R) return R;
  const C = planet.climate, t = planet.genome ? 0.35 + 0.3 * planet.genome.weird : 0, sum = Math.max(0.05, C.rock[0] + C.rock[1] + C.rock[2]), mx = a => a.map((v, i) => v + (C.rock[i] * (a[0] + a[1] + a[2]) / sum - v) * t);
  R = { plain: C.rock, sandstone: landTones(planet).sandstone, basalt: mx([0.13, 0.12, 0.12]), granite: mx([0.29, 0.28, 0.27]), pale: mx([0.6, 0.57, 0.5]) };
  rk.set(planet, R); return R;
}
// The way the wind has blown here for ten thousand years (not today's weather): every dune on the planet lies to it.
export const prevailing = planet => (planetLand(planet).seed % 6283) / 1000;

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// The climate at a place, from what actually sets one. Heat: the sun's height at this latitude, and the cold of altitude. Rain: the bands every
// spinning planet's air sorts itself into (wet at the equator, dry around 30°, wet again near 60°, dry at the poles), wandering with the weather's big swirls.
export function climateAt(planet, L, x, z, h = 0) {
  const G = globeOf(planet), A = axisOf(planet), n = toSphere(G, x, z), sn = n[0] * A[0] + n[1] * A[1] + n[2] * A[2], N = planet.noise;
  const c2 = 1 - 2 * sn * sn, c6 = c2 * (4 * c2 * c2 - 3), cosLat = Math.sqrt(Math.max(0, 1 - sn * sn));   // (cos 2φ and cos 6φ, without the transcendental functions)
  const heat = clamp01(L.warm + 0.72 * (cosLat - 0.72) + 0.12 * N.warp.fbm(x / 61000 + 7.7, z / 61000 - 3.1, 2) - Math.max(0, h) / 2600);
  const rain = clamp01(L.damp + 0.21 * c6 + 0.42 * N.moist.fbm(x / 34000 + 21.3, z / 34000 - 8.8, 3) + 0.2 * N.warp.fbm(x / 9000 - 31.1, z / 9000 + 12.7, 2));
  return { heat, rain };
}
const peak = (v, a, b, c, d) => smoothstep(a, b, v) * (1 - smoothstep(c, d, v));
// What grows and what lies on the surface follows climate and the rock beneath: whole provinces of one kind of country, mixing at their edges.
function kindOf(planet, L, c, x, z, h0, r) {
  const N = planet.noise, { heat, rain } = c, volc = N.mount.fbm(x / 23000 + 41.7, z / 23000 - 17.3, 2), lime = N.hill.fbm(x / 15000 - 13.9, z / 15000 + 29.1, 2), basin = N.hill.fbm(x / 4100 + 3.3, z / 4100 + 61.7, 2), low = 1 - smoothstep(60, 240, h0), up = smoothstep(280, 620, h0);
  const fit = {
    meadow: peak(rain, 0.24, 0.42, 0.62, 0.8) * peak(heat, 0.16, 0.3, 0.86, 1.01) + 0.03,
    forest: smoothstep(0.46, 0.66, rain) * peak(heat, 0.14, 0.28, 2, 3) * (1 - 0.6 * up),
    rockfield: 0.22 * up + 0.5 * (1 - smoothstep(0.14, 0.36, heat)) + 0.1,
    badlands: peak(rain, 0.1, 0.2, 0.36, 0.5) * smoothstep(0.3, 0.5, heat) * 1.15,
    dunes: (1 - smoothstep(0.1, 0.27, rain)) * smoothstep(0.42, 0.6, heat) * smoothstep(-0.1, 0.25, -basin) * (1 - smoothstep(120, 300, h0)) * 1.25,
    saltpan: (1 - smoothstep(0.1, 0.3, rain)) * smoothstep(0.34, 0.56, basin) * low * 1.7,
    marsh: smoothstep(0.62, 0.8, rain) * low * smoothstep(0.05, 0.35, basin) * 1.6,
    lava: smoothstep(0.42, 0.62, volc) * 1.7 + 0.3 * smoothstep(0.0, 0.4, volc + 0.3),
    moor: peak(rain, 0.38, 0.54, 2, 3) * (1 - smoothstep(0.32, 0.52, heat)) * 1.2 + 0.12,
    karst: smoothstep(0.34, 0.56, lime) * smoothstep(0.34, 0.5, rain) * 1.4,
    jungle: smoothstep(0.55, 0.75, rain) * smoothstep(0.45, 0.65, heat) * 1.6,
    ice: (1 - smoothstep(0.18, 0.4, heat)) * 1.6 + 0.15 * up,
    canyon: peak(rain, 0.04, 0.14, 0.42, 0.58) * 1.3 + 0.2,
    spires: (1 - smoothstep(0.35, 0.7, rain)) * 0.9 + 0.35 * smoothstep(0.2, 0.5, lime),
    craters: 0.55 + 0.3 * (1 - smoothstep(0.2, 0.5, rain)),
    fungal: smoothstep(0.3, 0.6, rain) * 1.3 + 0.25,
    crystal: (1 - smoothstep(0.35, 0.65, rain)) * 1.1 + 0.3 * up + 0.2,
  };
  let best = 'meadow', top = -1;
  for (let n = 0; n < KINDS.length; n++) { const k = KINDS[n], q = (L.weights[n] > 0 ? fit[k] * (L.pull ? L.pull[n] : 1) : 0) * (0.72 + 0.56 * r(10 + n)); if (q > top) { top = q; best = k; } }
  return best;
}

function cellOf(planet, L, i, j, base) {
  const k = i * 65536 + j; let c = L.cells.get(k); if (c) return c;
  const r = n => hashInts(L.seed, [i, j, n]) / 4294967296;
  const x = (i + 0.1 + 0.8 * r(1)) * CELL, z = (j + 0.1 + 0.8 * r(2)) * CELL, h0 = base ? Math.max(9, base(planet, x, z)) : 30, cl = climateAt(planet, L, x, z, h0), kind = kindOf(planet, L, cl, x, z, h0, r);
  c = { i, j, x, z, kind, T: LANDS[kind], id: hashInts(L.seed, [i, j, 77]), h0, heat: cl.heat, rain: cl.rain };
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
  forest: (P, x, z, h) => h,
  // rounded rock heaps standing out of a stony plain
  rockfield: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0x70f, x, z, 110, (cx, cz, r) => { if (r(3) > 0.5) return; const R = 16 + 26 * r(4), d = Math.hypot(cx - x, cz - z); if (d < R) { const u = 1 - d / R; top = Math.max(top, (5 + 15 * r(5)) * u * u * (3 - 2 * u)); } });
    return h + top + 5 * P.noise.mount.soft(x / 300, z / 300, 1);
  },
  // the land stepped into shelves and mesas, cut by short cliffs
  badlands: (P, x, z, h, c) => {
    const n = 0.5 + 0.7 * P.noise.hill.fbm(x / 520 + 17, z / 520 - 4, 3), cap = 0.62 + 0.3 * (0.5 + 0.5 * P.noise.warp.fbm(x / 1500, z / 1500, 2)), L = Math.min(Math.max(0, n), cap) * 118, st = 21, k = Math.floor(L / st), f = L / st - k;      // (flat tops: the hard bed on top holds, the softer ones below wear back)
    return lerp(h, c.h0, 0.85) + (k + smoothstep(0.8, 0.98, f) + 0.08 * f) * st - 14 ;
  },
  // Dunes as wind builds them. Every crest lies across the one prevailing wind; the windward side is long and
  // gentle and rises to a sharp crest; the lee is a straight slip face at sand's angle of repose (about 32°).
  // Crests bow into crescents, and fork and die out where there's less sand.
  dunes: (P, x, z, h, c) => {
    const a = prevailing(P), ca = Math.cos(a), sa = Math.sin(a), along = x * ca + z * sa, across = -x * sa + z * ca;
    const W = 150, bow = 42 * Math.abs(Math.sin(across / 190 + 1.4 * P.noise.warp.fbm(along / 900, across / 900, 2))), u = along + bow + 50 * P.noise.warp.fbm(x / 420, z / 420, 2);
    const sand = 0.5 + 0.5 * P.noise.hill.fbm(across / 300 + 9, along / 900, 2), A = 5 + 13 * sand, cell = Math.floor(u / W), f = u / W - cell;
    const lee = Math.min(0.27, (A / 0.62) / W), wind = 1 - lee, rise = f < wind ? (f / wind) ** 1.35 : (1 - f) / lee, toe = rise < 0.08 ? rise * rise / 0.16 + 0.04 : rise;
    return lerp(h, c.h0, 0.86) + A * toe ;
  },
  // dead level, low in its own basin
  saltpan: (P, x, z, h, c) => lerp(h, c.h0 - 3, 0.985),
  marsh: (P, x, z, h, c) => lerp(h, c.h0 - 2, 0.96),
  // blocky flows and cinder cones with craters
  lava: (P, x, z, h, c) => {
    let cone = 0;
    around(c.id ^ 0x1a7a, x, z, 800, (cx, cz, r) => { if (r(3) > 0.55) return; const R = 170 + 200 * r(4), d = Math.hypot(cx - x, cz - z) / R; if (d < 1) { const H = 45 + 85 * r(5); cone = Math.max(cone, d > 0.2 ? H * (1 - d) ** 1.25 : H * 0.8 ** 1.25 - H * 0.22 * (1 - d / 0.2)); } });
    return lerp(h, c.h0, 0.5) + cone + 6 * P.noise.mount.soft(x / 180, z / 180, 1);
  },
  moor: (P, x, z, h) => h,
  // steep-sided limestone towers out of green flats
  karst: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0x4a51, x, z, 210, (cx, cz, r) => { if (r(3) > 0.62) return; const R = 34 + 56 * r(4), wob = 1 + 0.22 * P.noise.detail.fbm(x / 28 + r(6) * 40, z / 28, 2), d = Math.hypot(cx - x, cz - z) * wob; if (d < R) { const u = smoothstep(R, R * 0.5, d); top = Math.max(top, (28 + 62 * r(5)) * u * (0.92 + 0.08 * P.noise.detail.soft(x / 18, z / 18, 2))); } });
    return lerp(h, c.h0, 0.8) + top;
  },
};

Object.assign(SHAPES, {
  // a forest floor heaved into hummocks round old roots
  jungle: (P, x, z, h) => h + 4 * P.noise.hill.soft(x / 90, z / 90, 2),
  // an ice sheet: the land drowned under a smooth dome of ice, swells and pressure ridges on it
  ice: (P, x, z, h, c) => lerp(h, c.h0 + 18 + 30 * P.noise.mount.soft(x / 2600, z / 2600, 2), 0.72) + 1.6 * Math.abs(P.noise.detail.fbm(x / 70, z / 70, 2)),
  // a plateau cut by gorges: winding, steep-walled, the walls stepped in rock beds
  canyon: (P, x, z, h, c) => {
    const N = P.noise, top = lerp(h, c.h0 + 55, 0.78), d = Math.abs(N.warp.fbm(x / 2200 + 3.1, z / 2200 - 7.7, 3)), w = 0.035 + 0.02 * (0.5 + 0.5 * N.hill.fbm(x / 5000, z / 5000, 1));
    const cut = 1 - smoothstep(w * 0.45, w * 1.7, d), depth = 70 + 55 * (0.5 + 0.5 * N.mount.fbm(x / 7000, z / 7000, 1)), g = top - depth * cut;
    const st = 8 + 4 * (0.5 + 0.5 * N.hill.fbm(x / 9000, z / 9000, 1)), k = Math.floor(g / st), f = g / st - k, q = (k + smoothstep(0.7, 0.96, f)) * st, wall = 4 * cut * (1 - cut);
    return lerp(g, q, Math.min(1, wall * 1.4));
  },
  // a field of hoodoos: rock pillars standing out of a dusty floor, each wider at the cap
  spires: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0x5b1e, x, z, 90, (cx, cz, r) => { if (r(3) > 0.62) return; const R = 10 + 13 * r(4), d = Math.hypot(cx - x, cz - z) * (1 + 0.18 * P.noise.detail.fbm(x / 9 + r(6) * 30, z / 9, 2)); if (d < R) { const u = 1 - d / R, H = 22 + 55 * r(5); top = Math.max(top, H * smoothstep(0, 0.22, u) * (0.82 + 0.18 * u)); } });
    return lerp(h, c.h0, 0.7) + top + 3 * P.noise.hill.soft(x / 120, z / 120, 1);
  },
  // old craters, big and small: a bowl, a raised rim, the throw-out sloping away
  craters: (P, x, z, h, c) => {
    let dh = 0;
    const bowl = (size, salt, chance, a, b) => around(c.id ^ salt, x, z, size, (cx, cz, r) => {
      if (r(3) > chance) return; const R = a + (b - a) * r(4), d = Math.hypot(cx - x, cz - z) / R; if (d >= 1.7) return;
      const D = R * 0.2, rim = R * 0.06, v = d < 1 ? -D * (1 - d * d) + rim * d * d * d * d : rim * ((1.7 - d) / 0.7) * ((1.7 - d) / 0.7);
      if (Math.abs(v) > Math.abs(dh)) dh = v;
    });
    bowl(900, 0xc4a7, 0.55, 90, 320); bowl(160, 0xc4a8, 0.5, 12, 50);
    return lerp(h, c.h0, 0.7) + dh;
  },
  // spongy ground in soft swells
  fungal: (P, x, z, h) => h + 5 * P.noise.hill.soft(x / 70, z / 70, 2) + 2 * P.noise.detail.soft(x / 18, z / 18, 1),
  // shards of crystal standing out of the ground, faceted, leaning
  crystal: (P, x, z, h, c) => {
    let top = 0;
    around(c.id ^ 0xc75a, x, z, 110, (cx, cz, r) => { if (r(3) > 0.55) return; const R = 9 + 14 * r(4), lx = (x - cx) + (r(7) - 0.5) * 0.6 * R, lz = z - cz, n = Math.floor(5 + 3 * r(8)), d = Math.max(Math.abs(lx), Math.abs(lz), Math.abs(lx + lz) * 0.72, Math.abs(lx - lz) * 0.72); if (d < R) { const H = 16 + 34 * r(5); top = Math.max(top, H * (1 - d / R)); } });
    return lerp(h, c.h0, 0.6) + top;
  },
});

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
  const tones = landTones(planet), N = planet.noise,patch = 0.5 + 0.5 * N.detail.fbm(x / 21, z / 21, 3), lands = landAt(planet, x, z); let rain = 0, heat = 0; for (const { c, w: lw } of lands) { rain += lw * c.rain; heat += lw * c.heat; }
  const gm = smoothstep(0.22, 0.72, moist * 0.35 + rain * 0.65), T = { grass: [(C.dry[0] + (C.grass[0] - C.dry[0]) * gm) * (0.82 + 0.36 * heat), (C.dry[1] + (C.grass[1] - C.dry[1]) * gm) * (0.92 + 0.14 * heat), (C.dry[2] + (C.grass[2] - C.dry[2]) * gm) * (1.22 - 0.42 * heat)], dirt: C.dry, litter: tones.litter, sand: tones.sand, cracked: [0.86, 0.82, 0.74], moss: tones.moss, peat: [0.2, 0.17, 0.06], ash: [0.2, 0.19, 0.18], heath: tones.heath, gravel: [0.3, 0.29, 0.27], snow: [C.snow, C.snow, C.snow * 1.02] };
  const R = rockTones(planet);
  let rockTot = 0, r0 = 0, g0 = 0, b0 = 0, s0 = 0, g1 = 0, b1 = 0;
  for (const { c, w: lw } of lands) {
    const K = c.T, rocky = Math.max(smoothstep(K.steep, K.steep - 0.2, ny), smoothstep(1 - K.bare, 1 - K.bare * 0.6, patch) * (K.bare > 0 ? 1 : 0));
    rockTot += lw * rocky;
    const rc = R[K.rock]; if (K.rock === 'plain') w[11] += lw * rocky; else w[12 + RK[K.rock]] += lw * rocky;
    r0 += lw * rocky * rc[0]; g1 += lw * rocky * rc[1]; b1 += lw * rocky * rc[2];
    for (const k in K.soft) { const q = lw * (1 - rocky) * K.soft[k], t = T[k]; w[S[k]] += q; s0 += q * t[0]; g0 += q * t[1]; b0 += q * t[2]; }
  }
  col[0] = s0 + r0; col[1] = g0 + g1; col[2] = b0 + b1;
  if (col.length > 3) { const k = rockTot > 0.002 ? 1 / rockTot : 0; col[3] = rockTot > 0.002 ? r0 * k : R.plain[0]; col[4] = rockTot > 0.002 ? g1 * k : R.plain[1]; col[5] = rockTot > 0.002 ? b1 * k : R.plain[2]; }     // (the rock's own colour, for where it stands clear of the soil)
  return rockTot;
}
