// The body's own moves over what's in the way, as IK targets (the same pose a wall climb gives, player/climber.js pose(), put on the
// skeleton by player/limbik.js applyClimbPose), so the hands go where the stone or the wall really is and nothing passes through it:
//   mantlePose  — hands on the edge, a press up, the lead foot on, over and stand
//   vaultPose   — at a run: a hand planted on top, the hips swung over it with the legs tucked, down the far side still running
//   RockClimb   — up the side of a boulder too tall to pull yourself onto: hand over hand on the stone, then over its crown
// Pure: no three.js. Proportions are the ADVENTURER body's (climber.js BODY).
import { BODY } from './climber.js';
import { rockLocal, rockSurface, formOf } from '../gen/rocks.js';
import { sideAt, outAt } from '../gen/rockshape.js';

const LEG = BODY.thigh + BODY.shin, ARM = BODY.upperArm + BODY.foreArm;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = f => f * f * (3 - 2 * f);
const seg = (f, a, b) => ease(clamp((f - a) / (b - a), 0, 1));
// keep a limb's end within its length of its joint
const within = (p, j, most) => { const d = sub(p, j), l = len(d); return l > most ? add(j, d, most / l) : p; };
// piecewise path through keys [[f, v], ...] (eased between)
const path = (K, f) => { let i = 0; while (i < K.length - 2 && f > K[i + 1][0]) i++; const [a, A] = K[i], [b, B] = K[i + 1], u = ease(clamp((f - a) / (b - a), 0, 1)); return A + (B - A) * u; };

function limb(p, n = null, grip = 0, hold = null) { return { p, n, grip, moving: false, kind: hold?.kind || null, hold }; }
function frame(n) { const f = [-n[0], 0, -n[2]], R = [n[2], 0, -n[0]]; return { f, R }; }     // (n: out of the face toward you; f: into it; R: your right)
function poseOf(state, pelvis, n, lean, limbs, lookAt) {
  const { f, R } = frame(n), up0 = [f[0] * lean, 1, f[2] * lean], ul = len(up0), up = up0.map(v => v / ul);
  const { lh, rh, lf, rf } = limbs;
  return { state, pelvis, right: R, up, forward: f, tilt: clamp((rh.p[1] - lh.p[1]) * 0.22, -0.3, 0.3), hipTilt: clamp((rf.p[1] - lf.p[1]) * 0.18, -0.25, 0.25), lookAt, limbs };
}
const shoulderOf = (pelvis, up, R, s) => add(add(pelvis, up, BODY.shoulderUp), R, s * BODY.shoulderOut);
const hipOf = (pelvis, R, s) => add(add(pelvis, [0, -BODY.hipDown, 0], 1), R, s * BODY.hipOut);
function holdAt(p, n, key) { return { p, n: [n[0], n[2]], kind: 'top', a: 0, face: { key, t: [n[2], -n[0]], w: 1 } }; }

// A mantle: m = { from (feet), to (feet, on top), E (the edge: on its lip, level with the top), n (out of the face, toward where you
// were), lead ('lf'|'rf') }. f 0..1 through it. → { pose, feet } (feet: where the controller's feet are, under the hips)
export function mantlePose(m, f) {
  const { n, E } = m, { f: F, R } = frame(n), top = E[1], rise = top - m.from[1];
  const out = P => (P[0] - E[0]) * n[0] + (P[2] - E[2]) * n[2], o0 = Math.max(0.3, out(m.from)), o1 = out(m.to);
  const side0 = (m.from[0] - E[0]) * R[0] + (m.from[2] - E[2]) * R[2], side1 = (m.to[0] - E[0]) * R[0] + (m.to[2] - E[2]) * R[2];
  // the hips: in to the face and down a little as the hands go on, pressed up to the edge, over it, and up to stand
  const hy = path([[0, m.from[1] + BODY.hipHeight], [0.22, m.from[1] + BODY.hipHeight - 0.1 * Math.min(1, rise)], [0.55, Math.max(m.from[1] + BODY.hipHeight - 0.1, top + 0.12)], [0.78, top + 0.62], [1, m.to[1] + BODY.hipHeight]], f);
  const ho = path([[0, o0], [0.22, Math.min(o0, 0.36)], [0.55, 0.3], [0.78, -0.12], [1, o1]], f), hs = side0 + (side1 - side0) * seg(f, 0.4, 1);
  const pelvis = [E[0] + n[0] * ho + R[0] * hs, hy, E[2] + n[2] * ho + R[2] * hs];
  const lean = 0.9 * Math.sin(Math.PI * clamp((f - 0.3) / 0.7, 0, 1)) ** 1.2, upv = (() => { const u = [F[0] * lean, 1, F[2] * lean], l = len(u); return u.map(v => v / l); })();
  // the hands: from the sides up onto the lip a shoulder apart, there while the body presses up over them, then away
  const hands = {};
  for (const [k, s, t0] of [['lh', -1, 0.6], ['rh', 1, 0.66]]) {
    const rest = add(add(pelvis, R, s * 0.25), [0, 0.05, 0]), on = add(add(E, R, s * 0.24 + hs * 0.6), n, 0.02), up = [on[0], on[1] + 0.03, on[2]];
    const g = seg(f, 0, 0.2), off = seg(f, t0, Math.min(1, t0 + 0.28));
    let p = off > 0 ? lerp3(up, add(add(pelvis, R, s * 0.22), [0, -0.05, 0]), off) : lerp3(rest, up, g);
    p = within(p, shoulderOf(pelvis, upv, R, s), ARM + BODY.palm);
    hands[k] = limb(p, n, off > 0 ? 1 - off : g, off < 1 && g > 0.6 ? holdAt(on, n, 'm' + m.key) : null);
  }
  // the feet: walking up the face as the hips rise, the lead one onto the top, the other swung over after it
  const feet = {};
  for (const [k, s] of [['lf', -1], ['rf', 1]]) {
    const lead = k === m.lead, stand = add(add(m.to, R, s * 0.11), [0, BODY.ankle, 0]), base = add(add(m.from, R, s * 0.11), [0, BODY.ankle, 0]);
    const plant = [E[0] - n[0] * 0.25 + R[0] * s * 0.12, top + BODY.ankle, E[2] - n[2] * 0.25 + R[2] * s * 0.12];
    const t0 = lead ? 0.42 : 0.6, t1 = lead ? 0.62 : 0.86, u = seg(f, t0, t1);
    // before it goes over: on the face below the hips, smearing up it (out from it a little, never in)
    const onFace = [pelvis[0] + n[0] * Math.max(0.12, ho - 0.15) - n[0] * 0 + R[0] * s * 0.12, Math.max(m.from[1], Math.min(top - 0.25, pelvis[1] - LEG * 0.92)) + BODY.ankle, pelvis[2] + n[2] * Math.max(0.12, ho - 0.15) + R[2] * s * 0.12];
    const pre = lerp3(base, rise > 0.9 ? onFace : base, seg(f, lead ? 0.15 : 0.25, lead ? 0.42 : 0.6));
    const arcTop = [E[0] + n[0] * 0.25 + R[0] * s * 0.13, top + 0.35, E[2] + n[2] * 0.25 + R[2] * s * 0.13];
    const bez = (a, c, b, v) => { const w = 1 - v; return [w * w * a[0] + 2 * w * v * c[0] + v * v * b[0], w * w * a[1] + 2 * w * v * c[1] + v * v * b[1], w * w * a[2] + 2 * w * v * c[2] + v * v * b[2]]; };
    let p = u > 0 ? bez(pre, arcTop, lead ? plant : stand, u) : pre;
    if (lead) p = lerp3(p, stand, seg(f, 0.84, 1));
    feet[k] = limb(within(p, hipOf(pelvis, R, s), LEG * 0.99));
  }
  return { pose: poseOf('top', pelvis, n, lean, { ...hands, ...feet }, E), feet: [pelvis[0], pelvis[1] - BODY.hipHeight, pelvis[2]] };
}

// A vault: v = { from (feet), to (feet, the far side), E (the near edge, on its top), n (out of its near face), top, lead }.
export function vaultPose(v, f) {
  const { n, E, top } = v, { f: F, R } = frame(n), s0 = v.lead === 'lf' ? 1 : -1;      // (the legs go over on the side away from the planted hand)
  const P0 = [v.from[0], v.from[1] + BODY.hipHeight, v.from[2]], P1 = [v.to[0], v.to[1] + BODY.hipHeight, v.to[2]];
  const over = Math.max(top + 0.45, P0[1] - 0.05), y = f < 0.5 ? P0[1] + (over - P0[1]) * Math.sin(f / 0.5 * Math.PI / 2) : over + (P1[1] - over) * (1 - Math.cos((f - 0.5) / 0.5 * Math.PI / 2));
  const pelvis = [P0[0] + (P1[0] - P0[0]) * f, y, P0[2] + (P1[2] - P0[2]) * f];
  const lean = 0.6 * Math.sin(Math.PI * f);
  const upv = (() => { const u = [F[0] * lean, 1, F[2] * lean], l = len(u); return u.map(q => q / l); })();
  const hands = {};
  for (const [k, s] of [['lh', -1], ['rh', 1]]) {
    const planted = (s > 0) === (s0 < 0), on = add(add(E, R, s * 0.2), F, 0.18), rest = add(add(pelvis, R, s * 0.25), [0, 0.05, 0]);
    const g = planted ? seg(f, 0, 0.22) * (1 - seg(f, 0.62, 0.85)) : seg(f, 0.05, 0.25) * (1 - seg(f, 0.4, 0.6));
    const p = within(lerp3(rest, [on[0], top + 0.03, on[2]], g), shoulderOf(pelvis, upv, R, s), ARM + BODY.palm);
    hands[k] = limb(p, [0, 1, 0], g, g > 0.6 ? holdAt([on[0], top, on[2]], n, 'v' + v.key + k) : null);
  }
  const feet = {};
  for (const [k, s] of [['lf', -1], ['rf', 1]]) {
    // tucked up under the hips going over, swung off to the side away from the planted hand; over the top of it, always above it
    // (a lazy vault: the hips turned off to one side over the planted hand, both legs swung out the other way, nearly straight, the near one leading)
    const tuck = Math.sin(Math.PI * clamp((f - 0.08) / 0.8, 0, 1)), lead = (s > 0) === (s0 > 0), p0 = add(add([pelvis[0], pelvis[1] - LEG * (1 - 0.3 * tuck) + (lead ? 0.12 : 0) * tuck, pelvis[2]], R, s * 0.12 * (1 - tuck) + s0 * 0.62 * tuck), F, (lead ? 0.3 : 0.05) * tuck);
    const along = (p0[0] - E[0]) * F[0] + (p0[2] - E[2]) * F[2], ground = along < (v.depth ?? 0.6) / 2 ? v.from[1] : v.to[1];
    const over = along > -0.12 && along < (v.depth ?? 0.6) + 0.12, p = [p0[0], Math.max(ground + BODY.ankle, over ? top + 0.08 : -1e9, p0[1]), p0[2]];
    feet[k] = limb(within(p, hipOf(pelvis, R, s), LEG * 0.99));
  }
  return { pose: poseOf('top', pelvis, n, lean, { ...hands, ...feet }, add(E, F, 1.5)), feet: [pelvis[0], pelvis[1] - BODY.hipHeight, pelvis[2]] };
}

// ---- up a boulder: hand over hand on its side, the feet on it below, one limb at a time; over its crown when the hands are on it
// Same interface as player/climber.js Climber: step(dt, input), pose(), feet, facing, effort, blocked, done.
export class RockClimb {
  // q: the stone; at: where your feet are (on the ground at its foot); the stone's crown has to be more than you can pull yourself onto
  static grab(world, q, at) {
    const c = new RockClimb(world, q, at); return c.ok ? c : null;
  }
  constructor(world, q, at) {
    this.world = world; this.q = q; this.t = 0; this.done = null; this.effort = 1; this.blocked = null; this.state = 'mount';
    const L = rockLocal(q, at[0], at[2]); this.th = Math.atan2(L.lz / (q.az / (q.k || 1)), L.lx / (q.ax / (q.k || 1)));     // (round the stone: where on its rim you are)
    this.base = at[1]; this.y = at[1] + BODY.hipHeight;     // the pelvis height
    this.crown = rockSurface(q, ...this.rimXZ(this.th, 1), true);
    // only a face you can get your feet on: where the stone's undercut (wider at its middle than at its foot: a slab's lip) leaves more than
    // most of a metre of air under you, there's nothing to climb — the lip's for jumping up and catching, if it's in reach
    const [rx, rz] = this.rimXZ(this.th, 1), Rr = Math.hypot(rx - q.x, rz - q.z), tg = (at[1] + 0.4 - q.y) / q.tall;
    this.ok = !!formOf(q) && this.crown - at[1] > 1.6 && Rr * (this.out(this.th) - this.side(this.th, clamp(tg, 0, 1))) < 0.9;
    // the limbs: each on the stone, at a height
    this.limb = { lh: { y: this.y + 0.75 }, rh: { y: this.y + 0.5 }, lf: { y: at[1] + 0.35 }, rf: { y: at[1] + 0.1 } };
    const [r1x, r1z] = this.rimXZ(this.th, 1), R1 = Math.max(0.5, Math.hypot(r1x - q.x, r1z - q.z)); this.R1 = R1;      // (metres round the stone per radian, here)
    for (const k in this.limb) { const Lm = this.limb[k]; Lm.th = this.th + (k[1] === 'h' ? 0.24 : 0.13) / R1 * (k[0] === 'l' ? 1 : -1) * this.dirSign(); Lm.p = this.onStone(Lm.th, Lm.y, k[1] === 'h'); Lm.from = Lm.p; Lm.f = 1; }
    this.order = ['lh', 'rf', 'rh', 'lf']; this.next = 0; this.moving = null; this.mountT = 0;
    this.mountFrom = [at[0], at[1] + BODY.hipHeight, at[2]]; this.settle();
  }
  // which way along the rim is your left, facing the stone (angles go anticlockwise seen from above in the stone's frame)
  dirSign() { const a = this.rimXZ(this.th, 1), b = this.rimXZ(this.th + 0.01, 1), n = this.normal(this.th), R = [n[2], 0, -n[0]], d = [(b[0] - a[0]), 0, (b[1] - a[1])]; return d[0] * R[0] + d[2] * R[2] > 0 ? -1 : 1; }
  // the drawn stone round at th (measured, gen/rockshape.js): how far out it comes at height fraction t; how far out at all
  side(th, t) { return sideAt(formOf(this.q), Math.cos(th), Math.sin(th), t); }
  out(th) { return outAt(formOf(this.q), Math.cos(th), Math.sin(th)); }
  rimXZ(th, k = 1) { const q = this.q, kk = q.k || 1, lx = Math.cos(th) * q.ax / kk * k, lz = Math.sin(th) * q.az / kk * k, c = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0); return [q.x + lx * c + lz * sn, q.z - lx * sn + lz * c]; }
  normal(th) { const q = this.q, kk = q.k || 1, A = q.ax / kk, B = q.az / kk, lx = Math.cos(th) / A, lz = Math.sin(th) / B, c = Math.cos(q.rot || 0), sn = Math.sin(q.rot || 0), x = lx * c + lz * sn, z = -lx * sn + lz * c, l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; }
  // a point on the stone's side at height y, round at th (hand: fingers on the stone, a little proud of it; foot: the ball of it on it)
  onStone(th, y, hand) {
    const q = this.q, lo = Math.min(q.y, q.g), T = dy => clamp((y + dy - q.y) / q.tall, 0, 1), k = Math.max(this.side(th, T(0)), this.side(th, T(0.15)), this.side(th, T(-0.15))), [x, z] = this.rimXZ(th, k);
    const dx = x - q.x, dz = z - q.z, l = Math.hypot(dx, dz) || 1, o = hand ? 0.05 : 0.1;      // (on the stone as it is drawn there, a little proud of it: out from its middle)
    return [x + dx / l * o, Math.max(lo, y), z + dz / l * o];
  }
  get facing() { const n = this.normal(this.th); return Math.atan2(-n[0], -n[2]); }
  get feet() { const P = this.pelvisAt(); return [P[0], P[1] - BODY.hipHeight, P[2]]; }
  // the body hangs off the stone at the hips: out from its side by enough to clear it (more where it bulges out below you)
  pelvisAt(y = this.y, th = this.th) {
    const q = this.q, T = dy => clamp((y + dy - q.y) / q.tall, 0, 1), k = Math.max(this.side(th, T(0)), this.side(th, T(-0.6)), this.side(th, T(0.5))), [x, z] = this.rimXZ(th, k), n = this.normal(th);      // (clear of the widest of the stone from the knees to the chest)
    return [x + n[0] * 0.34, y, z + n[2] * 0.34];
  }
  step(dt, input) {
    this.t += dt; this.blocked = null; this.effort = 0.3;
    if (this.state === 'mount') { this.mountT += dt; this.effort = 1; if (this.mountT > 0.35) this.state = 'hold'; return; }
    if (this.state === 'top') { this.top.t += dt; this.effort = 1; if (this.top.t >= this.top.dur) this.done = { kind: 'walk', pos: this.top.m.to.slice(), facing: this.facing }; return; }
    if (input.drop || input.jump) { const n = this.normal(this.th), P = this.pelvisAt(); this.done = { kind: 'fall', slipped: false, pos: [P[0] + n[0] * 0.2, P[1] - BODY.hipHeight, P[2] + n[2] * 0.2], vel: [n[0] * (input.jump ? 2.5 : 1), input.jump ? 2 : 0.2, n[2] * (input.jump ? 2.5 : 1)], facing: this.facing }; return; }
    if (input.exhausted) { this.slip = (this.slip || 0) + dt; if (this.slip > 4) { const n = this.normal(this.th), P = this.pelvisAt(); this.done = { kind: 'fall', slipped: true, pos: [P[0], P[1] - BODY.hipHeight, P[2]], vel: [n[0], -0.5, n[2]], facing: this.facing }; return; } }
    const pace = (input.run ? 1.4 : 1) * (input.tired ? 0.45 : 1);
    if (this.moving) {
      const L = this.limb[this.moving]; L.f = Math.min(1, L.f + dt / L.dur); this.effort = 1;
      const e = ease(L.f), to = this.onStone(L.th, L.y, this.moving[1] === 'h'), n = this.normal(L.th), arc = Math.sin(L.f * Math.PI) * 0.12;
      L.p = this.clear(add(lerp3(L.from, to, e), n, arc), 0.06);
      if (L.f >= 1) { L.p = to; this.moving = null; }
      this.settle(); return;
    }
    // hands within reach of the crown: up and over it
    const hy = Math.max(this.limb.lh.y, this.limb.rh.y), crown = rockSurface(this.q, ...this.rimXZ(this.th, 1), true);
    if (input.fwd > 0 && hy > crown - 0.15) { if (this.startTop()) return; }
    if (input.fwd < 0 && Math.max(this.limb.lf.y, this.limb.rf.y) < this.base + 0.4) { const n = this.normal(this.th), P = this.pelvisAt(); this.done = { kind: 'walk', pos: [P[0] + n[0] * 0.15, this.base, P[2] + n[2] * 0.15], facing: this.facing }; return; }
    if (!input.fwd && !input.right) return;
    // the next limb in the order, a stride up (or down, or round)
    const k = this.order[this.next % 4]; this.next++;
    const L = this.limb[k], hand = k[1] === 'h', st = hand ? 0.5 : 0.42, dy = input.fwd * st, dth = (input.right ? -input.right * this.dirSign() : 0) * 0.4 / this.R1;
    const other = this.limb[k[0] === 'l' ? 'r' + k[1] : 'l' + k[1]];
    let y = (input.fwd > 0 ? Math.max(L.y, other.y) : input.fwd < 0 ? Math.min(L.y, other.y) : L.y) + dy;
    if (hand) y = Math.min(y, crown - 0.05); else y = Math.min(y, Math.min(this.limb.lh.y, this.limb.rh.y) - 1.0);
    y = Math.max(y, hand ? this.base + 1.2 : this.base);
    if (Math.abs(y - L.y) < 0.05 && !dth) { this.blocked = hand && y >= crown - 0.06 ? null : 'no hold in reach'; return; }
    L.from = L.p; L.y = y; L.th += dth; L.f = 0; L.dur = (hand ? 0.26 : 0.22) / pace; this.moving = k;
  }
  // a point kept outside the drawn stone (out from its middle to its side there, and `m` beyond)
  clear(p, m = 0.04) {
    const q = this.q, F = formOf(q), L = rockLocal(q, p[0], p[2]), t = (p[1] - q.y) / q.tall; if (t < 0 || t > 1 || p[1] > rockSurface(q, p[0], p[2])) return p;
    const k = sideAt(F, L.ux, L.uz, t), lm = Math.hypot(L.lx, L.lz) || 1e-6, want = lm * k / Math.max(1e-6, L.e) + m; if (lm >= want) return p;
    const f = want / lm; return [q.x + (p[0] - q.x) * f, p[1], q.z + (p[2] - q.z) * f];
  }
  // the body hangs where every limb reaches it: hips high enough for the higher hand and over the feet, low enough to hang off the lower
  // hand and to stand on the feet; round the stone between them. Put every step from where the limbs are (they move smoothly, so it does).
  settle() {
    const L = this.limb, A = (ARM + BODY.palm) * 0.93, Lg = LEG * 0.95;
    this.th = (L.lh.th + L.rh.th + L.lf.th + L.rf.th) / 4;
    // (how far up or down a limb reaches from its joint is less the further out it has to go across: so, worked out at where the hips will be, twice)
    const across = (p, y) => { const P = this.pelvisAt(y); return Math.hypot(p[0] - P[0], p[2] - P[2]); };
    let y = this.y;
    for (let it = 0; it < 3; it++) {
      const up = p => Math.sqrt(Math.max(0.05, A * A - across(p, y) ** 2)), dn = p => Math.sqrt(Math.max(0.05, Lg * Lg - across(p, y) ** 2));
      const lo = Math.max(L.lh.p[1] - BODY.shoulderUp - up(L.lh.p), L.rh.p[1] - BODY.shoulderUp - up(L.rh.p), Math.max(L.lf.p[1], L.rf.p[1]) + BODY.hipDown + 0.3);
      const hi = Math.min(Math.min(L.lh.p[1], L.rh.p[1]) - BODY.shoulderUp + 0.1, L.lf.p[1] + BODY.hipDown + dn(L.lf.p), L.rf.p[1] + BODY.hipDown + dn(L.rf.p));
      y = lo <= hi ? lo * 0.35 + hi * 0.65 : lo;      // (can't have both: the hands win, the feet come off)
    }
    this.y = y;
  }
  startTop() {
    const q = this.q, n = this.normal(this.th), o = this.out(this.th), [ex, ez] = this.rimXZ(this.th, o * 0.985), top = rockSurface(q, ex, ez); if (top === -Infinity) return false;
    const [ix, iz] = this.rimXZ(this.th, o * 0.68), stand = rockSurface(q, ix, iz), W = this.world;
    if (stand === -Infinity || Math.abs(W.groundAt(ix, iz, stand + 0.1).h - stand) > 0.3 || W.ceilingAt(ix, iz, stand) < stand + 1.9) { this.blocked = 'nothing to stand on up there'; return false; }
    const P = this.pelvisAt();
    this.top = { t: 0, dur: 1.0, m: { from: [P[0], P[1] - BODY.hipHeight, P[2]], to: [ix, stand, iz], E: [ex, top, ez], n, lead: 'rf', key: 'rock' + q.x.toFixed(1) + q.z.toFixed(1) } };
    this.state = 'top'; return true;
  }
  pose() {
    if (this.state === 'top') return mantlePose(this.top.m, Math.min(1, this.top.t / this.top.dur)).pose;
    const n = this.normal(this.th), P = this.pelvisAt(), { R } = frame(n), mf = this.state === 'mount' ? ease(Math.min(1, this.mountT / 0.35)) : 1;
    const pelvis = lerp3(this.mountFrom, P, mf), lean = 0.18, upv = (() => { const f = [-n[0] * lean, 1, -n[2] * lean], l = len(f); return f.map(v => v / l); })(), limbs = {};
    for (const k of ['lh', 'rh', 'lf', 'rf']) { const L = this.limb[k], hand = k[1] === 'h', s = k[0] === 'l' ? -1 : 1;
      let p = this.clear(within(L.p, hand ? shoulderOf(pelvis, upv, R, s) : hipOf(pelvis, R, s), hand ? ARM + BODY.palm : LEG * 0.99), 0.03);
      if (mf < 1) p = lerp3(add(add(pelvis, R, s * (hand ? 0.25 : 0.12)), [0, hand ? 0.05 : -LEG, 0]), p, mf);
      limbs[k] = limb(p, n, hand && this.moving !== k ? mf : 0, hand && this.moving !== k ? holdAt(this.onStone(L.th, L.y, true), n, 'rc' + k + L.y.toFixed(2)) : null);
      limbs[k].moving = this.moving === k; }
    return poseOf('hold', pelvis, n, lean, limbs, this.moving ? this.limb[this.moving].p : null);
  }
}

// A slide: on your hip along the ground, the lead leg out in front, the other bent under you, a hand trailing on the ground behind,
// leaning back; t: how long it's been going (it drops into it over the first moment). at: your feet, facing: the way you're going.
export function slidePose(at, facing, t) {
  const F = [Math.sin(facing), 0, Math.cos(facing)], R = [-F[2], 0, F[0]], n = [-F[0], 0, -F[2]], k = ease(clamp(t / 0.18, 0, 1));
  const pelvis = [at[0] - F[0] * 0.1 * k, at[1] + BODY.hipHeight - (BODY.hipHeight - 0.4) * k, at[2] - F[2] * 0.1 * k], lean = -0.55 * k;
  const stand = s => add(add(at, R, s * 0.11), [0, BODY.ankle, 0]);
  const lead = lerp3(stand(1), add(add(at, F, 0.8), R, 0.1).map((v, i) => i === 1 ? at[1] + BODY.ankle + 0.04 : v), k);
  const trail = lerp3(stand(-1), add(add(at, F, -0.05), R, -0.3).map((v, i) => i === 1 ? at[1] + BODY.ankle : v), k);
  const upv = (() => { const u = [F[0] * lean, 1, F[2] * lean], l = len(u); return u.map(v => v / l); })();
  const hl = lerp3(add(add(pelvis, R, -0.25), [0, 0.05, 0]), [at[0] - R[0] * 0.42 - F[0] * 0.2, at[1] + 0.06, at[2] - R[2] * 0.42 - F[2] * 0.2], k);
  const hr = add(add(add(pelvis, F, 0.32), upv, 0.42), R, 0.12);
  const limbs = { lh: limb(within(hl, shoulderOf(pelvis, upv, R, -1), ARM + BODY.palm)), rh: limb(within(hr, shoulderOf(pelvis, upv, R, 1), ARM + BODY.palm)),
    lf: limb(within(trail, hipOf(pelvis, R, -1), LEG * 0.99)), rf: limb(within(lead, hipOf(pelvis, R, 1), LEG * 0.99)) };
  return poseOf('slide', pelvis, n, lean, limbs, add(add(pelvis, F, 4), [0, 0.8, 0]));
}
