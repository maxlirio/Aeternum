// Seeded 2D simplex noise + fractal helpers. Only + - * / and Math.floor/sqrt, so
// output is identical in Node and every browser (IEEE-754 doubles, no transcendental
// functions whose last bits differ between engines).
import { Rng } from './prng.js';

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1],
              [0.7071,0.7071],[-0.7071,0.7071],[0.7071,-0.7071],[-0.7071,-0.7071]];

export class Simplex2 {
  constructor(seed) {
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.g = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.g[i] = this.perm[i] % 12; }
  }
  // Returns roughly [-1, 1].
  n(x, y) {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255, perm = this.perm, g = this.g;
    let n = 0, tt, gr;
    tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) { gr = GRAD[g[ii + perm[jj]]]; tt *= tt; n += tt * tt * (gr[0] * x0 + gr[1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) { gr = GRAD[g[ii + i1 + perm[jj + j1]]]; tt *= tt; n += tt * tt * (gr[0] * x1 + gr[1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) { gr = GRAD[g[ii + 1 + perm[jj + 1]]]; tt *= tt; n += tt * tt * (gr[0] * x2 + gr[1] * y2); }
    return 70 * n;
  }
  fbm(x, y, oct, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n(x * f + o * 17.31, y * f - o * 9.73); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  // Rounded knolls and hollows: ridged without the crease, for small-scale roughness. (A crease in simplex noise is a straight line: at small scale it shows as triangular facets.)
  soft(x, y, oct, lac = 2.03, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { const n = this.n(x * f + o * 31.7, y * f + o * 11.1); s += a * (1 - Math.sqrt(n * n + 0.09)); norm += a; a *= gain; f *= lac; }
    return s / norm + 0.3;
  }
  // Ridged multifractal in [0,1]: sharp crests, used for mountain chains.
  ridged(x, y, oct, lac = 2.03, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(this.n(x * f + o * 31.7, y * f + o * 11.1));
      v *= v; v *= w; w = v * 1.6; if (w > 1) w = 1;
      s += v * a; norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }
}

// 3D simplex: for patterns over a whole sphere, which have no edges to line up.
const F3 = 1 / 3, G3 = 1 / 6, GRAD3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
export class Simplex3 {
  constructor(seed) {
    const rng = new Rng(seed), p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  n(x, y, z) {
    const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G3, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
    let a, b, c, d, e, f;
    if (x0 >= y0) { if (y0 >= z0) { a = 1; b = 0; c = 0; d = 1; e = 1; f = 0; } else if (x0 >= z0) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 1; } else { a = 0; b = 0; c = 1; d = 1; e = 0; f = 1; } }
    else if (y0 < z0) { a = 0; b = 0; c = 1; d = 0; e = 1; f = 1; } else if (x0 < z0) { a = 0; b = 1; c = 0; d = 0; e = 1; f = 1; } else { a = 0; b = 1; c = 0; d = 1; e = 1; f = 0; }
    const P = this.perm, ii = i & 255, jj = j & 255, kk = k & 255, corner = (dx, dy, dz, gi) => { const q = 0.6 - dx * dx - dy * dy - dz * dz; if (q < 0) return 0; const g = GRAD3[gi % 12]; return q * q * q * q * (g[0] * dx + g[1] * dy + g[2] * dz); };
    return 32 * (corner(x0, y0, z0, P[ii + P[jj + P[kk]]]) + corner(x0 - a + G3, y0 - b + G3, z0 - c + G3, P[ii + a + P[jj + b + P[kk + c]]]) + corner(x0 - d + 2 * G3, y0 - e + 2 * G3, z0 - f + 2 * G3, P[ii + d + P[jj + e + P[kk + f]]]) + corner(x0 - 0.5, y0 - 0.5, z0 - 0.5, P[ii + 1 + P[jj + 1 + P[kk + 1]]]));
  }
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
