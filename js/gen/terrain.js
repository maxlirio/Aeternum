// Raw planetary terrain: a pure function height(x, z) in metres on the surface patch.
// "Raw" means before settlements grade the land (see gen/surface.js).
import { clamp, smoothstep } from '../core/noise.js';
import { shapeLand, setLandBase, landRill, landRough } from './land.js';
import { globeOf, canon, seamAt, continentDrop, cornerDrop, HOME_LAND } from './globe.js';

// The bare continental shape: sea, ranges and rolling hills, before the kinds of land work on it.
export function baseHeight(planet, x, z) {
  const N = planet.noise;
  // Domain warp gives the continents and ranges non-grid, flowing shapes.
  const wx = x + 900 * N.warp.fbm(x / 6000, z / 6000, 3);
  const wz = z + 900 * N.warp.fbm(x / 6000 + 5.2, z / 6000 - 1.3, 3);
  const cont = N.cont.fbm(wx / 14000, wz / 14000, 4);                  // [-1,1]
  // Keep the origin (where milestone 1 spawns) on dry land.
  const r = Math.sqrt(x * x + z * z);
  const landBias = 0.45 * (1 - smoothstep(4000, 14000, r));
  const c = cont + landBias;
  let h = 260 * c + 40;                                                  // lowlands & seas
  const mountMask = smoothstep(0.05, 0.55, c + 0.35 * N.mount.fbm(wx / 9000, wz / 9000, 2));
  h += 820 * mountMask * N.mount.ridged(wx / 3200, wz / 3200, 4);       // ranges (their finer shape is what water cut: see weathering)
  h += 55 * N.hill.fbm(x / 800, z / 800, 5);                            // rolling hills
  // (the ground's small roughness isn't here: it depends on how closely it's being looked at. See weathering.)
  return h;
}
setLandBase(baseHeight);

const plain = (planet, x, z) => shapeLand(planet, x, z, baseHeight(planet, x, z));
// The land at (x, z) on the planet. Near home the pattern simply runs on; further out, oceans lie over it, and along a seam
// of the unfolded globe (gen/globe.js) the two sides are blended so a walk across doesn't meet a cliff.
export function rawHeight(planet, x, z) {
  if (x * x + z * z < HOME_LAND * HOME_LAND) return plain(planet, x, z);
  const G = globeOf(planet), [a, b] = canon(G, x, z), S = seamAt(G, a, b);
  let h = plain(planet, a, b); if (S) h += (plain(planet, S.x, S.z) - h) * S.w;
  h -= continentDrop(planet, G, a, b);
  const c = cornerDrop(G, a, b); if (c) h += (-140 - h) * c;
  return h;
}

// ---- The ground as weather has cut it. ----
// rawHeight is what towns, rivers and roads are planned on. On top of that, water has run down every slope for a long time: each slope
// is fluted with gullies running straight down it, and each finer set of gullies follows the ones it runs into, so they branch like
// real drainage. Stripes aligned to the local fall line, in overlapping patches (Phacelle noise). Only + - * / and sqrt, as all generation.
const LAT = 64;
const lattice = new WeakMap();
function latH(planet, i, j) {
  let M = lattice.get(planet); if (!M) lattice.set(planet, M = new Map());
  const k = i * 67108864 + j; let h = M.get(k); if (h !== undefined) return h;
  h = rawHeight(planet, i * LAT, j * LAT); if (M.size > 250000) M.clear(); M.set(k, h); return h;
}
const hashCell = (i, j, salt) => { let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ salt; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return (h ^ (h >>> 13)) >>> 0; };
let GX = 0, GZ = 0;
function fallAt(planet, x, z) {
  const u = x / LAT, v = z / LAT, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j; GX = 0; GZ = 0;
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { const w = (a ? fu : 1 - fu) * (b ? fv : 1 - fv), p = i + a, q = j + b; GX += w * (latH(planet, p + 1, q) - latH(planet, p - 1, q)); GZ += w * (latH(planet, p, q + 1) - latH(planet, p, q - 1)); }
  GX /= 2 * LAT; GZ /= 2 * LAT;
}
const ROUGH = [[150, 1.1], [70, 1], [33, 0.55], [15, 0.26], [7, 0.12]];
const OCT = [[540, 52], [270, 26], [135, 11], [68, 5], [34, 1.6], [17, 0.5]];
const patches = new WeakMap();
// One patch of gullies. Straight within itself: it takes one direction, read at its centre. Its direction is the fall of the land there plus the sides of the
// larger gullies it lies on, so finer ones run into coarser ones and the whole thing branches like drainage.
function patch(planet, o, i, j) {
  let M = patches.get(planet); if (!M) patches.set(planet, M = new Map());
  const key = (i + 2097152) * 2 ** 25 + (j + 2097152) * 8 + o; let P = M.get(key); if (P) return P;
  const W = OCT[o][0], cell = W * 2.6, h = hashCell(i, j, 0x51ed + o * 977), cx = (i + ((h & 255) / 255 - 0.5) * 0.7) * cell, cz = (j + (((h >>> 8) & 255) / 255 - 0.5) * 0.7) * cell;
  fallAt(planet, cx, cz); let gx = GX, gz = GZ;
  if (o > 0) { stripes(planet, cx, cz, o - 1); gx += OCT[o - 1][1] * SW.dx * 0.55; gz += OCT[o - 1][1] * SW.dz * 0.55; }
  const len = Math.sqrt(gx * gx + gz * gz) || 1;
  P = { px: -gz / len, pz: gx / len, cx, cz, ph: ((h >>> 16) & 255) / 255 };
  if (M.size > 150000) M.clear(); M.set(key, P); return P;
}
const SW = { v: 0, dx: 0, dz: 0 };
function stripes(planet, x, z, o) {
  const W = OCT[o][0], cell = W * 2.6, u = x / cell, v = z / cell, i = Math.floor(u + 0.5) - 1, j = Math.floor(v + 0.5) - 1, fu = u + 0.5 - (i + 1), fv = v + 0.5 - (j + 1), su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  let C = 0, S = 0, tx = 0, tz = 0;
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
    const P = patch(planet, o, i + a, j + b), w = (a ? su : 1 - su) * (b ? sv : 1 - sv);
    const t = ((x - P.cx) * P.px + (z - P.cz) * P.pz) / W + P.ph, f = t - Math.floor(t), g = Math.abs(2 * f - 1), t2 = t + 0.25, f2 = t2 - Math.floor(t2), g2 = Math.abs(2 * f2 - 1);
    const c = 2 * g * g * (3 - 2 * g) - 1, sn = 2 * g2 * g2 * (3 - 2 * g2) - 1;
    C += w * c; S += w * sn; tx += w * sn * P.px; tz += w * sn * P.pz;
  }
  const m = Math.sqrt(C * C + S * S) || 1e-9, c = C / m, sn = S / m, k = m >= 0.5 ? 1 : (m / 0.5) * (m / 0.5) * (3 - 2 * m / 0.5);   // (where the patches cancel out the phase has no meaning: the stripes die away there, or the ground would tear)
  // crests sharper than a sine: a knife ridge above a V, as cut rock has
  SW.v = k * (c > 0 ? 1 - 1.15 * sn * sn + 0.15 * sn * sn * sn * sn : c);
  const d = -k * 6.283 / W / m; SW.dx = d * tx; SW.dz = d * tz;
  return SW;
}
// How far the ground here stands above or below its planned height. step: how far apart the caller's samples are (0: as finely as it can be asked).
export function weathering(planet, x, z, h, step = 0) {
  const sea = planet.seaLevel; if (h < sea - 3) return 0;
  // the small roughness of the ground, only at sizes the sampling can hold. Finer than that it aliases into flakes.
  const rough = landRough(planet, x, z), D = planet.noise.detail; let bumps = 0;
  if (rough > 0) for (let o = 0; o < ROUGH.length; o++) { const W = ROUGH[o][0], keep = step > 0 ? smoothstep(3.5 * step, 9 * step, W) : 1; if (keep <= 0) break; bumps += rough * ROUGH[o][1] * keep * D.n(x / W + o * 17.31, z / W - o * 9.73); }
  bumps *= smoothstep(sea, sea + 4, h);
  if (h < sea + 2) return bumps;
  const fall = landRill(planet, x, z); if (fall <= 0) return bumps;
  fallAt(planet, x, z);
  const slope = Math.sqrt(GX * GX + GZ * GZ), e = smoothstep(0.11, 0.48, slope) * fall * smoothstep(sea + 2, sea + 32, h); if (e <= 0) return bumps;
  // No gully runs ruler-straight: everything wanders, by an amount in proportion to its size.
  const N = planet.noise.warp, m1 = N.n(x / 210, z / 210), m2 = N.n(x / 210 + 9.1, z / 210 - 5.3), m3 = N.n(x / 53 - 3.7, z / 53 + 7.9), m4 = N.n(x / 53 + 2.2, z / 53 + 1.4);
  let out = 0;
  for (let o = 0; o < OCT.length; o++) {
    const W = OCT[o][0], keep = step > 0 ? smoothstep(3.5 * step, 9 * step, W) : 1; if (keep <= 0) break;
    out += OCT[o][1] * e * stripes(planet, x + W * (0.3 * m1 + 0.14 * m3), z + W * (0.3 * m2 + 0.14 * m4), o).v * keep;
  }
  return out + bumps;
}

const wet = (planet, x, z) => clamp(0.5 + 0.5 * planet.noise.moist.fbm(x / 5000, z / 5000, 4) + planet.climate.moistBias, 0, 1);
export function moisture(planet, x, z) {
  if (x < HOME_LAND && x > -HOME_LAND && z < HOME_LAND && z > -HOME_LAND) return wet(planet, x, z);
  const G = globeOf(planet), [a, b] = canon(G, x, z), S = seamAt(G, a, b), m = wet(planet, a, b);
  return S ? m + (wet(planet, S.x, S.z) - m) * S.w : m;
}
