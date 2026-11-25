// A great ship brought down (sim/planetwar.js): where it lies and what of it is solid. It lies as it fell: nose down, rolled over on
// one side, part of it in the ground, its back broken, the fore part twisted away from the aft at the break. The same pose and the same
// break draw it (render/capital.js) and stop you, a round or a ship (player/collision.js, main.js). Pure.
import { HULLS as FLEET } from './capital.js';

// where each hull breaks (z in its own frame, stern to bow), how wide the tear is, and how the fore part's thrown from the aft
export const BREAK = { anvil: { z: 250, gap: 34, turn: [0.07, -0.06, 0.05], shift: [0, -12, 46] }, harrow: { z: 640, gap: 30, turn: [0.09, -0.07, 0.08], shift: [0, -14, 40] } };
const breakOf = model => BREAK[model] || { z: 0, gap: 30, turn: [0.05, -0.05, 0.04], shift: [0, -8, 30] };

// the turn of (yaw, pitch, roll), the way three.js turns an object whose rotation order is 'YXZ': row-major 3 × 3
export function rot(yaw, pitch, roll) {
  const a = Math.cos(pitch), b = Math.sin(pitch), c = Math.cos(yaw), d = Math.sin(yaw), e = Math.cos(roll), f = Math.sin(roll);
  return [c * e + d * f * b, d * e * b - c * f, a * d, a * f, a * e, -b, c * f * b - d * e, d * f + c * e * b, a * c];
}
const mul = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
const app = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
const appT = (M, p) => [M[0] * p[0] + M[3] * p[1] + M[6] * p[2], M[1] * p[0] + M[4] * p[1] + M[7] * p[2], M[2] * p[0] + M[5] * p[1] + M[8] * p[2]];

// the fore part's place in the aft's frame: { turn: [yaw, pitch, roll], at: [x, y, z] } (a point p of it lies at Rf·p + at)
export function foreOf(model) {
  const B = breakOf(model), Rf = rot(...B.turn), h = [0, 0, B.z], rh = app(Rf, h);
  return { turn: B.turn, Rf, at: [h[0] + B.shift[0] - rh[0], h[1] + B.shift[1] - rh[1], h[2] + B.shift[2] - rh[2]], z: B.z, gap: B.gap };
}
// its two parts, each { M, o, boxes }: a point p of the part (its own frame) is at o + M·p in the world; boxes: [x0, y0, z0, x1, y1, z1] solid
export function hulkParts(H) {
  if (H._parts) return H._parts;
  const R = rot(H.yaw, H.pitch || 0, H.roll || 0), o = [H.x, H.y, H.z], F = foreOf(H.model), solid = FLEET[H.model].solid;
  const aft = [], fore = [];
  for (const b of solid) { if (b[2] < F.z - F.gap / 2) aft.push([b[0], b[1], b[2], b[3], b[4], Math.min(b[5], F.z - F.gap / 2)]); if (b[5] > F.z + F.gap / 2) fore.push([b[0], b[1], Math.max(b[2], F.z + F.gap / 2), b[3], b[4], b[5]]); }
  const ra = app(R, F.at);
  Object.defineProperty(H, '_parts', { value: [{ M: R, o, boxes: aft }, { M: mul(R, F.Rf), o: [o[0] + ra[0], o[1] + ra[1], o[2] + ra[2]], boxes: fore }], enumerable: false });
  return H._parts;
}
const reachOf = H => (FLEET[H.model].length || 2000) * 0.75;
export const hulkNear = (H, x, z, pad = 0) => { const r = reachOf(H) + pad; return Math.abs(x - H.x) < r && Math.abs(z - H.z) < r; };

// a ball of radius r at p inside it: → the way out [dx, dy, dz] (the shortest, through the nearest face), else null
export function hulkPush(H, p, r = 0) {
  if (!hulkNear(H, p[0], p[2], r)) return null;
  for (const P of hulkParts(H)) { const q = appT(P.M, [p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]]);
    for (const b of P.boxes) { const a0 = q[0] - b[0] + r, a1 = b[3] - q[0] + r, h0 = q[1] - b[1] + r, h1 = b[4] - q[1] + r, z0 = q[2] - b[2] + r, z1 = b[5] - q[2] + r;
      if (a0 > 0 && a1 > 0 && h0 > 0 && h1 > 0 && z0 > 0 && z1 > 0) { const m = Math.min(a0, a1, h0, h1, z0, z1);
        return app(P.M, m === a0 ? [-a0, 0, 0] : m === a1 ? [a1, 0, 0] : m === h0 ? [0, -h0, 0] : m === h1 ? [0, h1, 0] : m === z0 ? [0, 0, -z0] : [0, 0, z1]); } } }
  return null;
}
export const hulkSolid = (H, x, y, z) => !!hulkPush(H, [x, y, z], 0);
// the top of it under (x, yMax, z), looking straight down from yMax: → the height, or -Infinity (nothing of it below there; or yMax is inside it)
export function hulkTop(H, x, z, yMax) {
  if (!hulkNear(H, x, z)) return -Infinity; let best = -Infinity;
  for (const P of hulkParts(H)) { const q = appT(P.M, [x - P.o[0], yMax - P.o[1], z - P.o[2]]), d = [-P.M[3], -P.M[4], -P.M[5]];      // (straight down, in its frame)
    for (const b of P.boxes) { let t0 = -Infinity, t1 = Infinity, ok = true;
      for (let k = 0; k < 3 && ok; k++) { if (Math.abs(d[k]) < 1e-9) { if (q[k] < b[k] || q[k] > b[k + 3]) ok = false; continue; } let u = (b[k] - q[k]) / d[k], v = (b[k + 3] - q[k]) / d[k]; if (u > v) [u, v] = [v, u]; if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) ok = false; }
      if (ok && t0 >= 0 && yMax - t0 > best) best = yMax - t0; } }
  return best;
}
// where it comes to rest, from where it's hit the ground: nose down, over on one side, a third of it in the earth
export function restPose(model, x, z, yaw, ground, r01) {
  const F = FLEET[model], half = Math.max(...F.solid.map(b => -b[1]));
  const g = Math.min(ground(x, z), ground(x + Math.sin(yaw) * F.length * 0.3, z + Math.cos(yaw) * F.length * 0.3), ground(x - Math.sin(yaw) * F.length * 0.3, z - Math.cos(yaw) * F.length * 0.3));
  return { model, x, y: g + half * 0.42, z, yaw, pitch: 0.1 + 0.07 * r01, roll: (r01 > 0.5 ? 1 : -1) * (0.2 + 0.14 * r01) };
}
