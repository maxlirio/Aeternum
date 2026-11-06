// The planet is round. Everything on it is still addressed by two numbers (x, z) in metres, but
// those two numbers are places on a sphere: the sphere is cut into the six faces of a cube and laid
// out flat like a box unfolded into a cross,
//
//              [4 top]
//   [0 home]   [1]   [2]   [3]          (each face L metres square, L = πR/2; home is the middle of face 0)
//   [5 bottom]
//
// Faces next to each other in the cross just carry on. The other seven joins are where the unfolded
// box was cut: go off the edge there and you arrive on the face that edge really touches, turned by
// a quarter or half turn. canon() does that. Measured along the middle of a face, a metre is a metre,
// and going round the row of four is exactly the circumference.
//
// So: generation, collision and people work in (x, z) as ever, a few kilometres of which are as good
// as flat on a planet this size. What's round is what you see (a shader lets the ground fall away
// by distance), where the sun is, and what you find if you keep going.
import { hash01, derive } from '../core/hash.js';
import { Simplex3, smoothstep } from '../core/noise.js';

export const SEAM = 24000;      // how far either side of a cut the land of the two sides is blended
const CORNER_SEA = 90000;       // three faces meet at each corner of the box: those eight places are open ocean
export const HOME_LAND = 400000;       // the continents leave the land round home alone this far out

const FACES = [
  { c: [0, 0, 1], r: [1, 0, 0], d: [0, -1, 0], at: [0, 0] },
  { c: [1, 0, 0], r: [0, 0, -1], d: [0, -1, 0], at: [1, 0] },
  { c: [0, 0, -1], r: [-1, 0, 0], d: [0, -1, 0], at: [2, 0] },
  { c: [-1, 0, 0], r: [0, 0, 1], d: [0, -1, 0], at: [3, 0] },
  { c: [0, 1, 0], r: [1, 0, 0], d: [0, 0, 1], at: [0, -1] },
  { c: [0, -1, 0], r: [1, 0, 0], d: [0, 0, -1], at: [0, 1] },
];
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];    // +x, -x, +z, -z from a face's middle
const memo = new WeakMap();

export function globeOf(planet) {
  let G = memo.get(planet); if (G) return G;
  const seed = planet.seed, R = Math.round(4200 + 3800 * hash01(seed, [0x51ab])) * 1000, L = Math.PI * R / 2;
  G = { R, L, faces: FACES.map((f, i) => ({ ...f, i, x: f.at[0] * L, z: f.at[1] * L })), axis: null, noise: new Simplex3(derive(seed, 'continents')), noise2: new Simplex3(derive(seed, 'continents2')), corners: [] };
  // each side of each face: the face it really meets, and the turn that takes this face's coordinates (carried on past the edge) into that face's
  const key = v => v.map(a => Math.round(a)).join();
  const cornersOf = F => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ a, b, v: [0, 1, 2].map(k => F.c[k] + a * F.r[k] + b * F.d[k]) }));
  for (const F of G.faces) {
    F.sides = SIDES.map(([sx, sz]) => {
      const mine = cornersOf(F).filter(q => (sx ? q.a === sx : q.b === sz));
      for (const H of G.faces) {
        if (H === F) continue;
        const there = mine.map(q => cornersOf(H).find(w => key(w.v) === key(q.v))); if (there.some(w => !w)) continue;
        const pt = (Q, q) => [Q.x + q.a * L / 2, Q.z + q.b * L / 2], A = pt(F, mine[0]), B = pt(F, mine[1]), A2 = pt(H, there[0]), B2 = pt(H, there[1]);
        const e = [B[0] - A[0], B[1] - A[1]], e2 = [B2[0] - A2[0], B2[1] - A2[1]], n = L * L, cos = Math.round((e[0] * e2[0] + e[1] * e2[1]) / n), sin = Math.round((e[0] * e2[1] - e[1] * e2[0]) / n);
        const same = cos === 1 && Math.abs(A[0] - A2[0]) < 1 && Math.abs(A[1] - A2[1]) < 1;
        return { to: H.i, same, cos, sin, ax: A[0], az: A[1], bx: A2[0], bz: A2[1] };
      }
      throw new Error('a face with no neighbour');
    });
    for (const q of cornersOf(F)) G.corners.push([F.x + q.a * L / 2, F.z + q.b * L / 2]);
  }
  memo.set(planet, G); return G;
}

// Which face (x, z) is on, or null if it's off the cross altogether.
export function faceAt(G, x, z) {
  const { L } = G, h = L / 2;
  if (z >= -h && z < h) { const i = Math.floor((x + h) / L); return i >= 0 && i < 4 ? G.faces[i] : null; }
  if (x >= -h && x < h) { if (z < -h && z >= -3 * h) return G.faces[4]; if (z >= h && z < 3 * h) return G.faces[5]; }
  return null;
}
const apply = (S, x, z) => { const dx = x - S.ax, dz = z - S.az; return [S.bx + S.cos * dx - S.sin * dz, S.bz + S.sin * dx + S.cos * dz]; };

// Where (x, z) really is, if it's gone off the cross: [x, z, turn] with turn = [cos, sin] of what was done to directions. On the cross: [x, z, null].
export function canon(G, x, z) {
  if (faceAt(G, x, z)) return [x, z, null];
  let best = null, bd = Infinity, h = G.L / 2;
  for (const F of G.faces) { const dx = Math.max(Math.abs(x - F.x) - h, 0), dz = Math.max(Math.abs(z - F.z) - h, 0), d = dx * dx + dz * dz; if (d < bd) { bd = d; best = F; } }
  const u = x - best.x, v = z - best.z, side = Math.abs(u) >= Math.abs(v) ? (u > 0 ? 0 : 1) : (v > 0 ? 2 : 3), S = best.sides[side];
  if (S.same) return [x, z, null];     // (past a join that isn't a cut: shouldn't be off the cross, but harmless)
  const [p, q] = apply(S, x, z); return [p, q, [S.cos, S.sin]];
}

// How close to a cut, and how that point reads on the far side of it. { x, z, w } with w ∈ (0, ½], or null.
export function seamAt(G, x, z) {
  const F = faceAt(G, x, z); if (!F) return null;
  const h = G.L / 2, u = x - F.x, v = z - F.z, room = h - SEAM; if (Math.abs(u) < room && Math.abs(v) < room) return null;
  let best = null;
  for (let k = 0; k < 4; k++) { const [sx, sz] = SIDES[k], d = h - (sx ? sx * u : sz * v); if (d >= SEAM) continue; const S = F.sides[k]; if (S.same) continue; const w = 0.5 * (1 - d / SEAM); if (!best || w > best.w) { const [p, q] = apply(S, x, z); best = { x: p, z: q, w }; } }
  return best;
}
// Far enough into a face that a town, or a river, doesn't have to think about any of this?
export function wellInside(G, x, z, margin = SEAM * 1.5) {
  const F = faceAt(G, x, z); if (!F) return false;
  const h = G.L / 2, u = x - F.x, v = z - F.z, room = h - margin;
  for (let k = 0; k < 4; k++) { const [sx, sz] = SIDES[k], d = h - (sx ? sx * u : sz * v); if (d < margin && !F.sides[k].same) return false; }
  return Math.abs(u) <= h && Math.abs(v) <= h && room > 0;
}

// (x, z) → the unit vector from the planet's centre. Equal-angle, so distances stay about right to the face's edges.
const QUARTER = Math.PI / 4;
export function toSphere(G, x, z, out = [0, 0, 0]) {
  const [cx, cz] = canon(G, x, z), F = faceAt(G, cx, cz) || G.faces[0], { L } = G, a = Math.tan((cx - F.x) / (L / 2) * QUARTER), b = Math.tan((cz - F.z) / (L / 2) * QUARTER);
  const p = F.c[0] + a * F.r[0] + b * F.d[0], q = F.c[1] + a * F.r[1] + b * F.d[1], r = F.c[2] + a * F.r[2] + b * F.d[2], l = Math.hypot(p, q, r);
  out[0] = p / l; out[1] = q / l; out[2] = r / l; return out;
}
// A unit vector → (x, z) on the cross.
export function fromSphere(G, n) {
  let best = G.faces[0], bd = -Infinity; for (const F of G.faces) { const d = n[0] * F.c[0] + n[1] * F.c[1] + n[2] * F.c[2]; if (d > bd) { bd = d; best = F; } }
  const F = best, { L } = G, a = (n[0] * F.r[0] + n[1] * F.r[1] + n[2] * F.r[2]) / bd, b = (n[0] * F.d[0] + n[1] * F.d[1] + n[2] * F.d[2]) / bd;
  return [F.x + Math.atan(a) / QUARTER * (L / 2), F.z + Math.atan(b) / QUARTER * (L / 2)];
}
// Great-circle distance in metres.
export function surfaceDistance(G, x0, z0, x1, z1) { const a = toSphere(G, x0, z0), b = toSphere(G, x1, z1), d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])); return Math.acos(d) * G.R; }

// The frame at (x, z): up, and the directions +x and +z on the map point, as unit vectors from the planet's centre.
export function frameAt(G, x, z) {
  const e = 2000, up = toSphere(G, x, z).slice(), a = toSphere(G, x + e, z), b = toSphere(G, x - e, z), c = toSphere(G, x, z + e), d = toSphere(G, x, z - e);
  const flat = v => { const k = v[0] * up[0] + v[1] * up[1] + v[2] * up[2], w = [v[0] - up[0] * k, v[1] - up[1] * k, v[2] - up[2] * k], l = Math.hypot(...w) || 1; return [w[0] / l, w[1] / l, w[2] / l]; };
  return { up, ex: flat([a[0] - b[0], a[1] - b[1], a[2] - b[2]]), ez: flat([c[0] - d[0], c[1] - d[1], c[2] - d[2]]) };
}

// Oceans and continents: a slow pattern over the whole sphere, so it has no seams. Round home the land is what it always was.
export function continentDrop(planet, G, x, z) {
  const away = Math.hypot(x, z);
  if (away < HOME_LAND) return 0;
  const n = toSphere(G, x, z), f = 2.6, fromHome = away - 75000 * (1 + G.noise.n(n[0] * 11, n[1] * 11, n[2] * 11));   // (an irregular shore to home's land: from orbit it mustn't show as a shape)
  if (fromHome < HOME_LAND) return 0;
  const m = G.noise.n(n[0] * f, n[1] * f, n[2] * f) + 0.45 * G.noise2.n(n[0] * f * 2.3, n[1] * f * 2.3, n[2] * f * 2.3) + 0.2 * G.noise.n(n[0] * f * 6, n[1] * f * 6, n[2] * f * 6);
  // (out to sea it goes down; well inland it comes up, so a continent is land with lakes in it, not islands in a sea)
  return (smoothstep(0.02, 0.2, -m) * 900 - smoothstep(0.0, 0.24, m + 0.04) * 330) * smoothstep(HOME_LAND, HOME_LAND * 2, fromHome);
}
export function cornerDrop(G, x, z) {
  for (const [a, b] of G.corners) { const d = Math.max(Math.abs(x - a), Math.abs(z - b)); if (d < CORNER_SEA) return 1 - smoothstep(CORNER_SEA * 0.5, CORNER_SEA, d); }
  return 0;
}

// Latitude and the map's turn against north at (x, z). The planet's axis is set so home sits at its old latitude with north along -z, so home's sky is what it always was.
export function axisOf(planet) {
  const G = globeOf(planet); if (G.axis) return G.axis;
  const lat = planet.latitude, home = toSphere(G, 0, 0), F = frameAt(G, 0, 0), north = [-F.ez[0], -F.ez[1], -F.ez[2]];
  return (G.axis = [home[0] * Math.sin(lat) + north[0] * Math.cos(lat), home[1] * Math.sin(lat) + north[1] * Math.cos(lat), home[2] * Math.sin(lat) + north[2] * Math.cos(lat)]);
}
// { lat, lon (radians, 0 at home), turn (from map -z to north) } at (x, z).
export function geoAt(planet, x, z) {
  const G = globeOf(planet), A = axisOf(planet), F = frameAt(G, x, z), sn = F.up[0] * A[0] + F.up[1] * A[1] + F.up[2] * A[2], lat = Math.asin(Math.max(-1, Math.min(1, sn)));
  const toN = [A[0] - F.up[0] * sn, A[1] - F.up[1] * sn, A[2] - F.up[2] * sn], nx = toN[0] * F.ex[0] + toN[1] * F.ex[1] + toN[2] * F.ex[2], nz = toN[0] * F.ez[0] + toN[1] * F.ez[1] + toN[2] * F.ez[2];
  const home = toSphere(G, 0, 0), hk = home[0] * A[0] + home[1] * A[1] + home[2] * A[2], h = [home[0] - A[0] * hk, home[1] - A[1] * hk, home[2] - A[2] * hk], hl = Math.hypot(...h) || 1, e = [A[1] * h[2] - A[2] * h[1], A[2] * h[0] - A[0] * h[2], A[0] * h[1] - A[1] * h[0]];
  const lon = Math.atan2(F.up[0] * e[0] + F.up[1] * e[1] + F.up[2] * e[2], (F.up[0] * h[0] + F.up[1] * h[1] + F.up[2] * h[2]));
  return { lat, lon: lon * (hl ? 1 : 0), turn: Math.atan2(nx, -nz) };
}
