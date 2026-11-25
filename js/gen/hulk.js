// A great ship brought down (sim/planetwar.js): where it lies and what of it is solid. It lies as it fell: nose down, rolled over on
// one side, part of it in the ground, its back broken, the fore part twisted away from the aft at the break. The same pose and the same
// break draw it (render/capital.js) and stop you, a round or a ship (player/collision.js, main.js). Pure.
import { HULLS as FLEET } from './capital.js';

// where each hull breaks (z in its own frame, stern to bow), how wide the tear is, and how the fore part's thrown from the aft
export const BREAK = { bastion: { z: 60, gap: 30, turn: [0.05, -0.05, 0.04], shift: [0, -8, 30] }, anvil: { z: 250, gap: 34, turn: [0.07, -0.06, 0.05], shift: [0, -12, 46] }, harrow: { z: 640, gap: 30, turn: [0.09, -0.07, 0.08], shift: [0, -14, 40] } };
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
  const parts = hulkParts(H), Dk = H._decks;
  for (let k = 0; k < parts.length; k++) { const P = parts[k], q = appT(P.M, [p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]]); if (Dk && Dk.part === k && Dk.inShip(q, -r)) return null;      // (in among its decks: they're what's solid there)
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
// where it comes to rest, from where it's hit the ground: nose down, over on the side its dock is in, that side dug into the earth so far that the
// mouth of the dock lies at the ground: the way in. (dug: this rule; a wreck from before it is laid again by it when it's next loaded.)
export function restPose(model, x, z, yaw, ground, r01) {
  const F = FLEET[model], m = F.dock, pitch = 0.05 + 0.05 * r01, roll = -(0.17 + 0.08 * r01), R = rot(yaw, pitch, roll), w = app(R, m);
  return { model, x, y: ground(x + w[0], z + w[2]) - w[1] - 1.6, z, yaw, pitch, roll, dug: 1 };
}

// ---- The decks inside it. They're laid out as they were (gen/ships.js: the same plan the living ship has), lying now at whatever angle their part
// of the hull lies. You walk them in a level copy of them kept far up out of the way (LEVEL_Y: the collision world knows nothing of slopes indoors):
// each step is taken there and put back through the hull's own turn, so in the world you're on a tilted deck. → { at (the level copy's place, as a
// ship's: { c, facing }), part (0 aft, 1 fore), place ([x, y, z] of the plan's corner in the hull's frame; it's turned −90° about y), toLevel(p),
// fromLevel(q), vecTo(v), vecFrom(v), inside(q, pad) (q in the level copy), W, D }
export const LEVEL_Y = 14000;
export function hulkDecks(H, layout) {
  if (H._decks !== undefined) return H._decks; let out = null;
  const F = FLEET[H.model];
  if (F?.dock && layout) {
    const [mx, my, mz] = F.dock, W = layout.W, D = layout.D, Hh = layout.H, Fo = foreOf(H.model), part = mz < Fo.z ? 0 : 1, P = hulkParts(H)[part], c = Math.cos(H.yaw), s = Math.sin(H.yaw), f = Math.atan2(-c, s);
    const lvl = q => [H.x + c * q[0] + s * q[2], LEVEL_Y + q[1], H.z - s * q[0] + c * q[2]], unl = p => { const dx = p[0] - H.x, dz = p[2] - H.z; return [c * dx - s * dz, p[1] - LEVEL_Y, s * dx + c * dz]; };
    const wx = H.x + mx * c + mz * s, wz = H.z - mx * s + mz * c;
    out = { W, D, part, place: [mx, my, mz - W / 2], at: { c: [wx + Math.sin(f) * D / 2, LEVEL_Y + my, wz + Math.cos(f) * D / 2], facing: f },
      ship: p => appT(P.M, [p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]]),
      toLevel: p => lvl(appT(P.M, [p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]])), fromLevel: q => { const w = app(P.M, unl(q)); return [P.o[0] + w[0], P.o[1] + w[1], P.o[2] + w[2]]; },
      vecTo: v => { const q = appT(P.M, v); return [c * q[0] + s * q[2], q[1], -s * q[0] + c * q[2]]; }, vecFrom: v => app(P.M, [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]]),
      // (in the hull's frame the decks run in from the mouth at x = mx toward −x, W wide about z = mz)
      inShip: (q, pad = 0) => q[0] < mx + 0.4 + pad && q[0] > mx - D - 1 - pad && Math.abs(q[2] - mz) < W / 2 + 1 + pad && q[1] > my - 3 - pad && q[1] < my + Hh + 3 + pad };
    out.inside = (q, pad = 0) => out.inShip(unl(q), pad);
  }
  Object.defineProperty(H, '_decks', { value: out, enumerable: false, writable: true }); return out;
}

// the ground it has taken: level with the dock's floor out in front of the mouth (a metre over the sill: every deck plan's `deck`), and gone from
// under its decks (they run in D metres from the mouth; the lowest of them hangs 10 m under the dock's floor) → what gen/surface.js lays over the land
export function bedsOf(H, D = 100, W = 34) {
  const F = FLEET[H.model], R = rot(H.yaw, H.pitch || 0, H.roll || 0), m = F.dock, w = app(R, m), at = dx => { const o = app(R, [m[0] + dx, m[1], m[2]]); return [H.x + o[0], H.z + o[2]]; };
  const [ax, az] = at(46), [p0x, p0z] = at(-(W / 2 + 5) / Math.cos(H.roll || 0) - 2.5), [p1x, p1z] = at(-D + W / 2)      /* (its hold on the ground ends a metre and a half inside the mouth) */, floor = H.y + w[1] + 1.0;
  return [{ x: ax, z: az, r: 46, e: 60, h: floor }, { x: p0x, z: p0z, x2: p1x, z2: p1z, r: W / 2 + 2, e: 3, h: floor - 14, low: 1 }];
}
