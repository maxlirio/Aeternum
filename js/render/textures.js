// Procedural, tileable surface textures (albedo + normal + roughness), generated once
// at startup on the CPU. No image assets. Every texture tiles because its noise is
// periodic over the texture size.
import * as THREE from 'three';
import { Rng } from '../core/prng.js';
import { seedFromString } from '../core/hash.js';

const N = 512;

// Periodic value noise on an N×N torus with integer period p.
function periodicNoise(rng, p) {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return (x, y) => {                  // x, y in [0, 1)
    const fx = x * p, fy = y * p, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(iy % p) * p + (ix % p)], b = g[(iy % p) * p + ((ix + 1) % p)];
    const c = g[((iy + 1) % p) * p + (ix % p)], d = g[((iy + 1) % p) * p + ((ix + 1) % p)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbmField(rng, base, oct) {
  const ns = []; for (let o = 0; o < oct; o++) ns.push(periodicNoise(rng, base << o));
  return (x, y) => { let s = 0, a = 1, n = 0; for (const f of ns) { s += a * f(x, y); n += a; a *= 0.5; } return s / n; };
}

// Build textures from a per-pixel function returning { h, r, g, b, rough }.
function make(name, fn, { normalStrength = 2, repeat = 1 } = {}) {
  const rng = new Rng(seedFromString('tex:' + name));
  const ctx = fn(rng);
  const H = new Float32Array(N * N), col = new Uint8ClampedArray(N * N * 4), rgh = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = ctx(x / N, y / N), i = y * N + x;
    H[i] = o.h;
    col[i * 4] = o.r * 255; col[i * 4 + 1] = o.g * 255; col[i * 4 + 2] = o.b * 255; col[i * 4 + 3] = 255;
    const r = o.rough * 255; rgh[i * 4] = r; rgh[i * 4 + 1] = r; rgh[i * 4 + 2] = r; rgh[i * 4 + 3] = 255;
  }
  const nrm = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hl = H[y * N + ((x + N - 1) % N)], hr = H[y * N + ((x + 1) % N)];
    const hu = H[((y + N - 1) % N) * N + x], hd = H[((y + 1) % N) * N + x];
    let nx = (hl - hr) * normalStrength, ny = (hd - hu) * normalStrength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  return { map: tex(col, true), normalMap: tex(nrm, false), roughnessMap: tex(rgh, false) };
}

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const out = (c, h, rough) => ({ r: c[0], g: c[1], b: c[2], h, rough });

// Texture recipes. Each covers a fixed physical size (see MATERIAL_SCALE in materials.js).
const RECIPES = {
  concrete: rng => { const f = fbmField(rng, 4, 6), s = fbmField(rng, 32, 3); return (x, y) => {
    const v = f(x, y), sp = s(x, y); const c = 0.55 + 0.12 * (v - 0.5) + 0.05 * (sp - 0.5);
    return out([c, c * 0.98, c * 0.95], v * 0.6 + sp * 0.4, 0.85 + 0.1 * sp); }; },
  // Facade panels: 1.6 m × 1.6 m in a 3.2 m texture → seams every half tile.
  panels: rng => { const f = fbmField(rng, 4, 5), s = fbmField(rng, 64, 2); return (x, y) => {
    const gx = (x * 2) % 1, gy = (y * 2) % 1;
    const seam = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.008 ? 1 : 0;
    const panel = Math.floor(x * 2) + Math.floor(y * 2) * 2;
    const tint = 0.03 * ((panel * 7919) % 5 - 2) / 2;
    const v = f(x, y); const c = 0.74 + tint + 0.06 * (v - 0.5) - seam * 0.22;
    return out([c, c * 0.985, c * 0.96], (1 - seam) * 0.5 + 0.05 * s(x, y), 0.55 + 0.25 * v + seam * 0.3); }; },
  corrugated: rng => { const f = fbmField(rng, 4, 5); return (x, y) => {
    const w = 0.5 + 0.5 * Math.cos(x * Math.PI * 2 * 32);
    const v = f(x, y), rust = Math.max(0, v - 0.62) * 2.5;
    const c = mixc([0.62, 0.64, 0.66], [0.42, 0.28, 0.18], rust);
    return out(mixc(c, [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], 1 - w), w, 0.45 + 0.4 * rust + 0.1 * v); }; },
  asphalt: rng => { const f = fbmField(rng, 8, 6), g = fbmField(rng, 128, 2); return (x, y) => {
    const v = f(x, y), gr = g(x, y); const c = 0.30 + 0.06 * (v - 0.5) + 0.04 * (gr - 0.5);
    return out([c, c, c * 1.03], gr * 0.7 + v * 0.3, 0.88 + 0.08 * gr); }; },
  pavers: rng => { const f = fbmField(rng, 8, 4), s = fbmField(rng, 64, 2); return (x, y) => {
    const gx = (x * 8) % 1, gy = (y * 8 + (Math.floor(x * 8) % 2) * 0.5) % 1;
    const j = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.025;
    const v = f(x, y), c = j ? 0.42 : 0.56 + 0.06 * (v - 0.5) + 0.04 * (s(x, y) - 0.5);
    return out([c, c * 0.97, c * 0.93], j ? 0 : 0.6 + 0.1 * s(x, y), j ? 0.95 : 0.8); }; },
  tiles: rng => { const s = fbmField(rng, 16, 3); return (x, y) => {
    const gx = (x * 8) % 1, gy = (y * 8) % 1, j = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.02;
    const t = Math.floor(x * 8) + Math.floor(y * 8) * 8, tint = ((t * 2654435761) >>> 0) % 7 / 7 * 0.05;
    const c = j ? 0.38 : 0.70 + tint + 0.03 * (s(x, y) - 0.5);
    return out([c, c * 0.99, c * 0.97], j ? 0 : 0.5, j ? 0.9 : 0.35); }; },
  plaster: rng => { const f = fbmField(rng, 8, 6); return (x, y) => {
    const v = f(x, y), c = 0.86 + 0.04 * (v - 0.5); return out([c, c * 0.985, c * 0.965], v, 0.9); }; },
  metal: rng => { const f = fbmField(rng, 4, 5), s = fbmField(rng, 256, 1); return (x, y) => {
    const v = f(x, y), br = s(x, y * 0.05); const c = 0.55 + 0.08 * (v - 0.5) + 0.015 * (br - 0.5);
    return out([c, c * 1.0, c * 1.02], br * 0.2, 0.32 + 0.2 * v); }; },
  fabric: rng => { const s = fbmField(rng, 8, 3); return (x, y) => {
    const w = 0.5 + 0.25 * (Math.cos(x * 6.283 * 128) + Math.cos(y * 6.283 * 128));
    const c = 0.5 + 0.1 * (s(x, y) - 0.5); return out([c, c, c], w, 0.95); }; },
  wood: rng => { const f = fbmField(rng, 4, 4); return (x, y) => {
    const ring = 0.5 + 0.5 * Math.sin((y * 40 + 6 * f(x * 0.2, y)) * 6.283);
    const c = mixc([0.42, 0.28, 0.17], [0.56, 0.39, 0.25], ring);
    return out(c, ring * 0.3, 0.6); }; },
  ground: rng => { const f = fbmField(rng, 8, 7), s = fbmField(rng, 64, 3); return (x, y) => {
    const v = f(x, y), sp = s(x, y), c = 0.5 + 0.35 * (v - 0.5) + 0.2 * (sp - 0.5);
    return out([c, c, c], v * 0.6 + sp * 0.4, 0.95); }; },
};

const cache = new Map();
export function texture(name, opts) {
  if (!cache.has(name)) cache.set(name, make(name, RECIPES[name], opts));
  return cache.get(name);
}
