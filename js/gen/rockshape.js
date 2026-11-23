// The shape of a stone, as it's drawn: one function makes it (render/rocks.js builds the meshes from it), and the same function measured
// gives what stops you and what you stand on (gen/rocks.js). A sphere is cut by random planes (the way real rock breaks along joints), then
// roughened at a few scales: boulders keep their fracture faces; slabs are bedded; pillars rise out of a skirt of their own rubble. Pure.
import { hashInts, hashStr } from '../core/hash.js';
import { Simplex2 } from '../core/noise.js';

// the seed of each of a world's stone models (its kind of rock, its shape, which of VARIANTS)
export const rockSeed = planet => hashStr(planet.seed[1] ^ 0x60ccc, planet.address?.key || 'p');
export const variantSeed = (planet, rock, shape, v) => hashInts(rockSeed(planet), [hashStr(5, rock + shape), v]);

// → (x, y, z) a unit direction ↦ [x, y, z] the stone's surface that way (before it's fitted to a unit block: fitBox)
export function rockShaper(seed, shape, rock, detail) {
  const r = k => hashInts(seed, [k]) / 4294967296, N = new Simplex2([seed, seed ^ 0x77]);
  const planes = [], n = shape === 'pillar' ? 7 : 9 + Math.floor(r(1) * 8);
  for (let i = 0; i < n; i++) { const a = r(10 + i) * 6.283, y = shape === 'pillar' ? (r(30 + i) - 0.5) * 0.3 : r(30 + i) * 1.7 - 0.85, c = Math.sqrt(Math.max(0, 1 - y * y)); planes.push([Math.cos(a) * c, y, Math.sin(a) * c, 0.58 + 0.4 * r(50 + i)]); }
  const beds = rock === 'sandstone' ? 9 : rock === 'pale' ? 6 : rock === 'basalt' ? 0 : 3;
  return (vx, vy, vz) => {
    // the joints cut it, but no break in stone is a knife edge: where two faces meet the edge is worn round (a soft minimum, not a hard one)
    let R = 1.15; const kk = 0.075; for (const [a, b, c, d] of planes) { const q = a * vx + b * vy + c * vz; if (q > 0.02) { const r2 = d / q, h = Math.max(kk - Math.abs(R - r2), 0) / kk; R = Math.min(R, r2) - h * h * kk * 0.25; } }
    const u = vx * 1.9 + vy * 0.7, w = vz * 1.9 - vy * 0.7;
    // then roughened at every scale the mesh can carry: the lumps of the block, the chips off its faces, the grain of the stone
    R *= 1 + 0.11 * N.fbm(u * 1.4 + 3, w * 1.4, 3) + 0.035 * N.ridged(u * 6, w * 6, 2) + (detail >= 5 ? 0.014 * N.fbm(u * 17 + 7, w * 17 - 3, 2) + 0.006 * N.n(u * 41, w * 41) : 0);
    let x = vx * R, y = vy * R, z = vz * R;
    if (shape === 'slab') y = y * 0.62;
    if (beds) { const k = beds * 0.5, t = (y + 2) * k, f = t - Math.floor(t), step = (Math.floor(t) + (f > 0.7 ? (f - 0.7) / 0.3 : 0)) / k - 2, sh = 1 + 0.05 * Math.sin(Math.floor(t) * 12.9 + seed); y = y * 0.35 + step * 0.65; x *= sh; z *= sh; }
    if (shape === 'pillar') {               // tall, waisted under a harder cap, flaring into its rubble at the foot
      const t = y * 0.5 + 0.5, waist = 0.62 + 0.3 * Math.abs(t - 0.45) * 2 + 0.55 * Math.max(0, 0.16 - t) * 4 + 0.18 * N.fbm(t * 5, seed % 7, 2), cap = t > 0.86 ? 1.32 - (t - 0.86) * 1.1 : 1;
      x *= waist * cap * 0.9; z *= waist * cap * 0.9;
    }
    return [x, y, z];
  };
}
// fitted to a unit block, as it's drawn: x and z within ±1 (by the further side), y from 0 to 1. pts: flat [x, y, z, ...]; changed in place.
export function fitBox(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const sx = Math.max(-x0, x1), sz = Math.max(-z0, z1), hy = y1 - y0;
  for (let i = 0; i < pts.length; i += 3) { pts[i] /= sx; pts[i + 1] = (pts[i + 1] - y0) / hy; pts[i + 2] /= sz; }
  return pts;
}

// ---- measured: the drawn stone as tables, in its unit block. side[a][h]: how far out it comes at azimuth a, height band h; top[i][j]: the
// height of its top over a grid across it (-1 off it); out[a]: how far out it comes at all at azimuth a.
export const NA = 32, NH = 12, NG = 28, GR = 1.3;
const forms = new Map();
export function rockForm(planet, rock, shape, v) {
  const key = planet.seed.join(':') + '|' + (planet.address?.key || '') + '|' + rock + shape + v; let F = forms.get(key); if (F) return F;
  const f = rockShaper(variantSeed(planet, rock, shape, v), shape, rock, 6), M = 3000, pts = new Float64Array(M * 3), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < M; i++) { const y = 1 - 2 * (i + 0.5) / M, r = Math.sqrt(1 - y * y), th = ga * i, p = f(Math.cos(th) * r, y, Math.sin(th) * r); pts[i * 3] = p[0]; pts[i * 3 + 1] = p[1]; pts[i * 3 + 2] = p[2]; }
  fitBox(pts);
  const side = new Float32Array(NA * NH), top = new Float32Array(NG * NG).fill(-1), out = new Float32Array(NA);
  const ab = (x, z) => ((Math.floor((Math.atan2(z, x) / (2 * Math.PI) + 1) * NA) % NA) + NA) % NA;
  for (let i = 0; i < M; i++) { const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2], rho = Math.hypot(x, z), a = ab(x, z), h = Math.min(NH - 1, Math.floor(y * NH));
    if (rho > side[a * NH + h]) side[a * NH + h] = rho; if (rho > out[a]) out[a] = rho;
    const gi = Math.floor((x + GR) / (2 * GR) * NG), gj = Math.floor((z + GR) / (2 * GR) * NG); if (gi >= 0 && gj >= 0 && gi < NG && gj < NG && y > top[gi * NG + gj]) top[gi * NG + gj] = y; }
  // a sample of points leaves gaps: a side band with none takes the larger of the bands either side; a grid cell inside the outline with none, its neighbours'
  for (let a = 0; a < NA; a++) for (let h = 0; h < NH; h++) if (!side[a * NH + h]) { const lo = h > 0 ? side[a * NH + h - 1] : 0, hi = h < NH - 1 ? side[a * NH + h + 1] : 0, l = side[((a + NA - 1) % NA) * NH + h], r = side[((a + 1) % NA) * NH + h]; side[a * NH + h] = Math.max(Math.min(lo || hi, hi || lo), Math.min(l || r, r || l)); }
  for (let a = 0; a < NA; a++) if (!out[a]) out[a] = Math.max(out[(a + NA - 1) % NA], out[(a + 1) % NA]);
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < NG; i++) for (let j = 0; j < NG; j++) { if (top[i * NG + j] >= 0) continue; const x = (i + 0.5) / NG * 2 * GR - GR, z = (j + 0.5) / NG * 2 * GR - GR; if (Math.hypot(x, z) > outAt({ out }, x, z)) continue;
    let s = 0, n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const I = i + di, J = j + dj; if (I < 0 || J < 0 || I >= NG || J >= NG) continue; const t = top[I * NG + J]; if (t >= 0) { s += t; n++; } } if (n) top[i * NG + j] = s / n; }
  F = { side, top, out, max: Math.max(...out) };
  forms.set(key, F); if (forms.size > 400) forms.delete(forms.keys().next().value);
  return F;
}
// how far out the stone comes at all, the way (x, z) is from its middle (unit block); interpolated between azimuth bins
export function outAt(F, x, z) { const t = (Math.atan2(z, x) / (2 * Math.PI) + 1) * NA - 0.5, i = Math.floor(t), f = t - i, a = ((i % NA) + NA) % NA, b = (a + 1) % NA; return F.out[a] * (1 - f) + F.out[b] * f; }
// how far out at height fraction t, the way (x, z) is (azimuth interpolated, the band as is)
export function sideAt(F, x, z, t) { const h = Math.max(0, Math.min(NH - 1, Math.floor(t * NH))), u = (Math.atan2(z, x) / (2 * Math.PI) + 1) * NA - 0.5, i = Math.floor(u), f = u - i, a = ((i % NA) + NA) % NA, b = (a + 1) % NA; return F.side[a * NH + h] * (1 - f) + F.side[b * NH + h] * f; }
// the widest it comes between height fractions t0 and t1, the way (x, z) is
export function sideBetween(F, x, z, t0, t1) { let m = 0; const h0 = Math.max(0, Math.floor(t0 * NH)), h1 = Math.min(NH - 1, Math.floor(t1 * NH)); for (let h = h0; h <= h1; h++) m = Math.max(m, sideAt(F, x, z, (h + 0.5) / NH)); return m; }
// the height of its top at (x, z) in the unit block (bilinear over the grid), or -1 off it
export function topAt(F, x, z) {
  if (Math.hypot(x, z) > outAt(F, x, z)) return -1;
  const u = (x + GR) / (2 * GR) * NG - 0.5, w = (z + GR) / (2 * GR) * NG - 0.5, i = Math.max(0, Math.min(NG - 2, Math.floor(u))), j = Math.max(0, Math.min(NG - 2, Math.floor(w))), fu = Math.max(0, Math.min(1, u - i)), fw = Math.max(0, Math.min(1, w - j));
  let s = 0, n = 0; for (const [di, dj, k] of [[0, 0, (1 - fu) * (1 - fw)], [1, 0, fu * (1 - fw)], [0, 1, (1 - fu) * fw], [1, 1, fu * fw]]) { const t = F.top[(i + di) * NG + j + dj]; if (t >= 0) { s += t * k; n += k; } }
  return n > 1e-6 ? s / n : -1;
}
