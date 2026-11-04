// Climbing a wall one limb at a time. Pure logic: no three.js, no meshes, runs in Node.
//
// Two hands and two feet each hold a real hold (gen/holds.js). One limb moves at a time; the
// other three stay exactly where they are, and the body hangs between them: its position is
// solved each step from what the planted limbs can reach. Nothing here is a canned animation,
// so the output (pose(), below) is a set of IK targets any skeleton can follow — a primitive
// placeholder or a full rig (player/limbik.js).
//   W/A/S/D climb · Shift faster · Space leap (both hands off, catch a hold further on) · Q let go
// Proportions are the ADVENTURER body's (metres): the planner must plan for the real reach.
import { faceAhead, holdsNear, aOf, outOf } from '../gen/holds.js';

export const BODY = { upperArm: 0.294, foreArm: 0.263, palm: 0.09, thigh: 0.45, shin: 0.415, ankle: 0.085,
  shoulderUp: 0.47, shoulderOut: 0.19, hipDown: 0.05, hipOut: 0.10, hipHeight: 0.95 };
const ARM = BODY.upperArm + BODY.foreArm, LEG = BODY.thigh + BODY.shin;
const LIMBS = ['lh', 'rh', 'lf', 'rf'], isHand = k => k === 'lh' || k === 'rh', isLeft = k => k === 'lh' || k === 'lf';
const STRIDE = { hand: 0.62, foot: 0.5 };
const WALL = 0.3;                                   // pelvis stands this far off the wall
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.sqrt(dot(a, a));
const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const ease = f => f * f * (3 - 2 * f);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// where the wrist or ankle goes for a hold: fingers over the ledge, the ball of the foot on it
const endAt = (k, h) => isHand(k) ? [h.p[0] + h.n[0] * 0.06, h.p[1] + 0.05, h.p[2] + h.n[1] * 0.06]
  : [h.p[0] + h.n[0] * (h.kind === 'ground' ? 0.3 : 0.14), h.p[1] + BODY.ankle, h.p[2] + h.n[1] * (h.kind === 'ground' ? 0.3 : 0.14)];

export class Climber {
  // face: the wall; from: [x, y, z] your feet now. Returns null from Climber.grab if nothing's in reach.
  static grab(world, x, y, z, fx, fz, moving = false) {
    const f = faceAhead(world, x, y, z, fx, fz, moving ? 1.6 : 1.0); if (!f) return null;
    const c = new Climber(world, f, [x, y, z]);
    return c.ok ? c : null;
  }
  constructor(world, face, from) {
    this.world = world; this.face = face; this.state = 'mount'; this.t = 0; this.done = null;
    this.limb = {}; this.cycle = 0; this.last = null; this.blocked = null; this.slip = 0; this.effort = 0;
    this.normal = [face.n[0], 0, face.n[1]]; this.vel = [0, 0, 0];
    const a = aOf(face, from[0], from[2]), start = [from[0], from[1] + BODY.hipHeight, from[2]];
    // hands on the best pair within a jump of where you stand; feet on what's under you
    const pick = (ideal, want, ra, ry) => { let best = null, bd = Infinity; holdsNear(world, face, ideal, want, ra, ry, h => { if (want > from[1] + 0.8 && h.kind === 'ground') return; const d = Math.hypot(h.a - ideal, h.y - want); if (d < bd) { bd = d; best = h; } }); return best; };
    const R = this.right(), sgn = (face.t[0] * R[0] + face.t[1] * R[2]) > 0 ? 1 : -1;       // +a is your right, or your left
    const reach = from[1] + 1.95;
    const lh = pick(a - sgn * 0.3, reach, 0.6, 0.9), rh = pick(a + sgn * 0.3, reach, 0.6, 0.9);
    if (!lh || !rh || lh === rh || lh.a === rh.a) { this.ok = false; return; }
    const footY = Math.max(from[1], Math.min(lh.y, rh.y) - 1.55);
    const lf = pick(a - sgn * 0.18, footY, 0.5, 0.75), rf = pick(a + sgn * 0.18, footY, 0.5, 0.75);
    const hold = { lh, rh, lf, rf };
    for (const k of LIMBS) {
      const stand = this.restEnd(k, start);
      this.limb[k] = { k, hold: hold[k], p: stand, from: stand, to: hold[k] ? endAt(k, hold[k]) : null, f: 0, dur: 0, free: !hold[k] };
    }
    this.pelvis = start; this.mountFrom = start; this.mountDur = 0.45 + Math.max(0, Math.min(lh.y, rh.y) - (from[1] + 2.0)) * 0.5;
    this.ok = true;
  }
  right() { const n = this.normal; return [n[2], 0, -n[0]]; }       // your right, facing the wall (forward = -n)
  restEnd(k, pelvis) { const s = isLeft(k) ? -1 : 1, R = this.right(); return isHand(k) ? add(add(pelvis, R, s * 0.25), [0, 0.1, 0]) : add(add(pelvis, R, s * 0.12), [0, -LEG, 0]); }
  jointOf(k, pelvis, R = this.right()) { const s = isLeft(k) ? -1 : 1; return isHand(k) ? add(add(pelvis, [0, BODY.shoulderUp, 0]), R, s * BODY.shoulderOut) : add(add(pelvis, [0, -BODY.hipDown, 0]), R, s * BODY.hipOut); }

  // Where the body goes for these limb ends: as comfortable as it can be, with each limb within
  // its length. → { p, slack } slack = how far the worst limb is short of its hold (0 = feasible).
  solve(ends) {
    const R = this.right(), n = this.normal; let hy = 0, hn = 0, fy = 0, fn = 0, cx = 0, cz = 0, c = 0;
    for (const k of LIMBS) { const e = ends[k]; if (!e) continue; if (isHand(k)) { hy += e[1]; hn++; } else { fy += e[1]; fn++; } cx += e[0]; cz += e[2]; c++; }
    hy /= hn || 1; fy /= fn || 1;
    const wantY = fn ? Math.min(hy - BODY.shoulderUp - ARM * 0.72, fy + BODY.hipDown + LEG * 0.82 + BODY.ankle * 0) : hy - BODY.shoulderUp - ARM * 0.97;
    let p = [cx / c + n[0] * WALL, Math.max(wantY, fn ? fy + 0.28 : -1e9), cz / c + n[2] * WALL];
    for (let it = 0; it < 10; it++) {
      for (const k of LIMBS) { const e = ends[k]; if (!e) continue;
        const v = sub(e, this.jointOf(k, p, R)), d = len(v), L = (isHand(k) ? ARM : LEG) * 0.985, min = isHand(k) ? 0.2 : 0.3;
        if (d > L) p = add(p, v, (1 - L / d) * 0.7); else if (d < min && d > 1e-4) p = add(p, v, (1 - min / d) * 0.5);
      }
      p = this.offWall(p);
    }
    let slack = -Infinity;
    for (const k of LIMBS) { const e = ends[k]; if (!e) continue; slack = Math.max(slack, len(sub(e, this.jointOf(k, p, R))) - (isHand(k) ? ARM : LEG)); }
    return { p, slack };
  }
  // The pelvis stays outside every wall a limb is on (at a corner: outside either one is enough).
  offWall(p) {
    const faces = new Set(); for (const k of LIMBS) { const h = this.limb[k]?.hold; if (h) faces.add(h.face); } faces.add(this.face);
    let best = -Infinity, bf = null;
    for (const f of faces) { const o = outOf(f, p[0], p[2]); if (o > best) { best = o; bf = f; } }
    const lo = 0.2, hi = 0.5;
    if (best < lo) return [p[0] + bf.n[0] * (lo - best), p[1], p[2] + bf.n[1] * (lo - best)];
    if (faces.size === 1 && best > hi) return [p[0] - bf.n[0] * (best - hi), p[1], p[2] - bf.n[1] * (best - hi)];
    return p;
  }
  ends(over = null) { const o = {}; for (const k of LIMBS) { const L = this.limb[k]; o[k] = over?.[k] || (L.free ? null : L.to || L.p); } return o; }
  planted() { return LIMBS.filter(k => { const L = this.limb[k]; return !L.free && L.f >= 1 && L.dur >= 0; }).length; }

  // ---- choosing the next move
  dirOf(input) {
    // A/D are screen-left and right — and stay that way while held, even as a corner turns you
    const R = this.right(), cr = [-Math.cos(input.yaw), 0, Math.sin(input.yaw)];
    if (!input.right) this.sideSign = 0; else if (!this.sideSign) this.sideSign = dot(cr, R) >= -0.2 ? 1 : -1;
    return { R, right: input.right * (this.sideSign || 1), up: input.fwd };
  }
  // Holds near the point, on the faces in play: this wall, and round the corner when near one.
  candidates(at, ra, ry, fn) {
    const f = this.face, a = aOf(f, at[0], at[2]);
    holdsNear(this.world, f, a, at[1], ra, ry, fn);
    if (a > f.w - ra) holdsNear(this.world, f.next(), a - f.w, at[1], ra, ry, fn);
    if (a < ra) { const p = f.prev(); holdsNear(this.world, p, p.w + a, at[1], ra, ry, fn); }
  }
  // How far along your right a point is, measured round a corner rather than through it.
  along(p, R, face = this.face) { return dot(p, R); }
  plan(dir) {
    const { R, right, up } = dir, L = this.limb;
    const order = up > 0 && !right ? ['lh', 'rf', 'rh', 'lf'] : up < 0 && !right ? ['lf', 'rh', 'rf', 'lh'] : right > 0 ? ['rh', 'rf', 'lh', 'lf'] : ['lh', 'lf', 'rh', 'rf'];
    for (const k of LIMBS) if (L[k].free && !isHand(k)) { const m = this.moveFor(k, { R, right: 0, up: 0 }); if (m) return m; }   // feet swinging: find them a hold first
    for (let n = 0; n < 4; n++) {
      const k = order[(this.cycle + n) % 4], m = this.moveFor(k, dir);
      if (m) { this.cycle = (this.cycle + n + 1) % 4; return m; }
    }
    // stretched out on a traverse with one hand far above the other: bring the high one down level
    if (right && !up) {
      const [hi, lo] = (L.lh.hold?.p[1] ?? 0) > (L.rh.hold?.p[1] ?? 0) ? ['lh', 'rh'] : ['rh', 'lh'], gap = L[hi].hold.p[1] - L[lo].hold.p[1];
      if (gap > 0.3) { const m = this.moveFor(hi, { R, right: 0, up: -1 }); if (m) return m; }
    }
    return null;
  }
  moveFor(k, dir) {
    const { R, right, up } = dir, L = this.limb[k], hand = isHand(k), other = this.limb[{ lh: 'rh', rh: 'lh', lf: 'rf', rf: 'lf' }[k]];
    const ml = Math.hypot(right, up) || 1, st = hand ? STRIDE.hand : STRIDE.foot;
    const cur = L.hold ? L.hold.p : sub(this.pelvis, [0, LEG, 0]);
    // aim from the partner limb's height, so limbs leapfrog instead of creeping
    const baseY = up > 0 ? Math.max(cur[1], other.hold?.p[1] ?? cur[1]) : up < 0 ? Math.min(cur[1], other.hold?.p[1] ?? cur[1]) : cur[1];
    const ideal = add([cur[0], baseY, cur[2]], [R[0] * right / ml * st, up / ml * st, R[2] * right / ml * st]);
    let best = null, bs = Infinity;
    const hands = [this.limb.lh, this.limb.rh], feet = [this.limb.lf, this.limb.rf];
    this.candidates(ideal, 0.8, 0.8, h => {
      if (h === L.hold || (L.hold && h.a === L.hold.a && h.y === L.hold.y && h.face === L.hold.face)) return;
      if (hand && h.kind === 'ground') return;
      if (other.hold && other.hold.face === h.face && other.hold.a === h.a && other.hold.y === h.y) return;
      const d = sub(h.p, cur), prog = (d[0] * R[0] + d[2] * R[2]) * right + d[1] * up;
      if (L.hold && prog < 0.12 * ml && (right || up)) return;      // it has to get you somewhere
      // left stays left; hands above feet by a body's span; not spreadeagled
      if (other.hold) {
        const sep = dot(sub(h.p, other.hold.p), R) * (isLeft(k) ? -1 : 1), gapY = Math.abs(h.p[1] - other.hold.p[1]);
        if (sep < (hand ? 0.1 : 0.04) && h.face === other.hold.face || Math.abs(sep) > (hand ? 1.05 : 1.0) || gapY > 1.2) return;
      }
      if (hand) { for (const F of feet) if (F.hold && h.p[1] - F.hold.p[1] < 0.55) return; }
      else for (const H of hands) if (H.hold && H.hold.p[1] - h.p[1] < 0.55) return;
      const over = { [k]: endAt(k, h) }, sol = this.solve(this.ends(over));
      if (sol.slack > -0.005) return;     // (not at the very end of an arm: the body has to be able to settle there)
      const s = len(sub(h.p, ideal)) - 0.25 * prog + (h.kind === 'rail' ? 0.08 : 0);
      if (s < bs) { bs = s; best = h; }
    });
    return best ? { k, hold: best } : null;
  }
  startMove({ k, hold }, input) {
    const L = this.limb[k], to = endAt(k, hold), dist = len(sub(to, L.p));
    const pace = (input.run ? 1.45 : 1) * (input.tired ? 0.55 : 1);
    L.from = L.p; L.to = to; L.hold = hold; L.f = 0; L.free = false; L.dur = ((isHand(k) ? 0.2 : 0.17) + (isHand(k) ? 0.24 : 0.2) * dist) / pace;
    this.moving = k; this.last = k; this.lookAt = hold.p;
    if (hold.face !== this.face && isHand(k)) this.turnTo = hold.face;   // a hand round the corner leads the body round
  }

  // ---- each step. input: { fwd, right, run, jump, drop, yaw, tired, exhausted }
  step(dt, input) {
    this.t += dt; this.effort = 0; this.blocked = null;
    if (this.state === 'mount') return this.stepMount(dt);
    if (this.state === 'leap') return this.stepLeap(dt, input);
    if (this.state === 'top') return this.stepTop(dt);
    if (input.drop) { this.fall(input); return; }
    if (input.exhausted) { this.slip += dt; if (this.slip > 5) { this.fall(input, true); return; } } else this.slip = Math.max(0, this.slip - dt);
    // the moving limb
    if (this.moving) {
      const L = this.limb[this.moving], M = isHand(L.k) ? ARM : LEG;
      // the limb can't arrive before the body has brought its shoulder or hip within reach
      const inReach = len(sub(L.to, this.jointOf(L.k, this.pelvis))) <= M * 1.005;
      L.wait = inReach ? 0 : (L.wait || 0) + dt;
      L.f = Math.min(inReach || L.wait > 0.5 ? 1 : 0.86, L.f + dt / L.dur);
      const f = ease(L.f), arc = Math.sin(L.f * Math.PI), n = this.normalOfMove(L), reach = len(sub(L.to, L.from));
      L.p = add(add(lerp3(L.from, L.to, f), [n[0], 0, n[2]], arc * (0.07 + 0.1 * reach)), [0, 1, 0], isHand(L.k) ? 0 : arc * 0.05);
      this.effort = 1;
      if (L.f >= 1) { L.p = L.to.slice(); this.moving = null; }
    } else {
      const moved = input.fwd || input.right;
      if (input.jump) { if (this.startLeap(input)) return; }
      if (moved) {
        const dir = this.dirOf(input);
        if (input.fwd > 0 && this.startTop()) return;
        if (input.fwd < 0 && !input.right && this.onGround()) { this.getOff(); return; }
        const m = this.plan(dir);
        if (m) this.startMove(m, input); else this.blocked = input.fwd > 0 ? 'no hold in reach above' : 'no hold in reach';
      }
    }
    if (this.turnTo && this.limb.lh.hold?.face === this.turnTo && this.limb.rh.hold?.face === this.turnTo) { this.face = this.turnTo; this.turnTo = null; }
    this.updateBody(dt);
    if (!this.effort) this.effort = 0.25;      // hanging on is work too
  }
  normalOfMove(L) { return L.hold ? [L.hold.n[0], 0, L.hold.n[1]] : this.normal; }
  updateBody(dt, stiff = 9) {
    // the body's facing follows the hands
    const a = this.limb.lh.hold, b = this.limb.rh.hold;
    if (a && b) { let nx = a.n[0] + b.n[0], nz = a.n[1] + b.n[1], l = Math.hypot(nx, nz) || 1; const k = 1 - Math.exp(-dt * 5); this.normal = (() => { let x = this.normal[0] + (nx / l - this.normal[0]) * k, z = this.normal[2] + (nz / l - this.normal[2]) * k, m = Math.hypot(x, z) || 1; return [x / m, 0, z / m]; })(); }
    // the body glides to where the finished move needs it. (Reach limits are spheres, so the
    // straight path between two reachable poses stays within reach of every planted limb.)
    const ends = this.ends();
    for (const k of LIMBS) if (this.limb[k].free && !isHand(k)) ends[k] = null;
    const sol = this.solve(ends);
    if (this.moving) {       // ...leaning its weight away from the limb that's off, early in the move
      const L = this.limb[this.moving], R = this.right(), s = (isLeft(L.k) ? 1 : -1) * Math.sin(Math.min(1, L.f * 1.4) * Math.PI) * 0.05;
      sol.p = add(sol.p, R, s);
    }
    const k = 1 - Math.exp(-dt * stiff);
    this.pelvis = this.offWall(lerp3(this.pelvis, sol.p, k));
    // planted limbs are law: if the smoothing lags, pull the body back into reach of them
    for (let it = 0; it < 3; it++) for (const q of LIMBS) { const L = this.limb[q]; if (L.free || q === this.moving) continue;
      const v = sub(L.p, this.jointOf(q, this.pelvis)), d = len(v), M = isHand(q) ? ARM : LEG; if (d > M) this.pelvis = add(this.pelvis, v, 1 - M / d); }
    for (const q of LIMBS) { const L = this.limb[q]; if (L.free && !isHand(q)) L.p = lerp3(L.p, this.restEnd(q, this.pelvis), 1 - Math.exp(-dt * 6)); }
    if (this.moving) {       // the limb in the air stays on the end of its arm or leg
      const L = this.limb[this.moving], J = this.jointOf(L.k, this.pelvis), v = sub(L.p, J), d = len(v), M = isHand(L.k) ? ARM : LEG;
      if (d > M) L.p = add(J, v, M / d);
    }
  }
  stepMount(dt) {
    const f = Math.min(1, this.t / this.mountDur), e = ease(f); this.effort = 1;
    for (const k of LIMBS) { const L = this.limb[k]; if (!L.to) continue; const ff = ease(clamp((f - (isHand(k) ? 0 : 0.35)) / (isHand(k) ? 0.65 : 0.65), 0, 1)); L.p = add(lerp3(L.from, L.to, ff), [L.hold.n[0], 0, L.hold.n[1]], Math.sin(ff * Math.PI) * 0.08); }
    const sol = this.solve(this.ends());
    this.pelvis = lerp3(this.mountFrom, sol.p, e);
    if (f >= 1) { for (const k of LIMBS) { const L = this.limb[k]; L.f = 1; L.dur = 0; if (L.to) L.p = L.to.slice(); } this.state = 'hold'; }
  }
  onGround() { const { lf, rf } = this.limb; return lf.hold?.kind === 'ground' && rf.hold?.kind === 'ground'; }
  getOff() { const n = this.normal, y = Math.min(this.limb.lf.hold.p[1], this.limb.rf.hold.p[1]); this.done = { kind: 'walk', pos: [this.pelvis[0] + n[0] * 0.25, y, this.pelvis[2] + n[2] * 0.25], facing: Math.atan2(-n[0], -n[2]) }; }
  fall(input, slipped = false) { const n = this.normal; this.done = { kind: 'fall', slipped, pos: [this.pelvis[0], this.pelvis[1] - BODY.hipHeight, this.pelvis[2]], vel: [n[0] * 1.1, slipped ? -0.5 : 0.2, n[2] * 1.1], facing: Math.atan2(-n[0], -n[2]) }; }

  // ---- leap: gather, let go with everything, fly, catch with both hands; the feet find holds after
  startLeap(input) {
    const dir = this.dirOf(input), { R, right } = dir, up = input.fwd || (right ? 0 : 1), H = this.limb;
    if (input.tired) { this.blocked = 'too tired to leap'; return false; }
    const hy = Math.max(H.lh.hold.p[1], H.rh.hold.p[1]), cx = lerp3(H.lh.hold.p, H.rh.hold.p, 0.5);
    let best = null, bs = Infinity;
    const want = add(add(cx, [0, 1, 0], up > 0 ? 1.5 : up < 0 ? -1.4 : 0.2), R, right * 1.5);
    this.candidates(want, 1.3, 1.3, h => {
      if (h.kind === 'ground' || h.face !== this.face) return;
      const dy = h.y - hy, s = len(sub(h.p, want));
      if (Math.hypot(dot(sub(h.p, cx), R), dy) < 0.9 || dy > 2.2 || dy < -2.2) return;
      if (s < bs) { bs = s; best = h; }
    });
    if (!best) return false;
    // the partner hold on the same row, a shoulder's width away
    let other = null, od = Infinity;
    holdsNear(this.world, best.face, best.a, best.y, 0.7, 0.01, h => { const d = Math.abs(Math.abs(h.a - best.a) - 0.45); if (h.a !== best.a && d < od) { od = d; other = h; } });
    if (!other) return false;
    const leftFirst = dot(sub(best.p, other.p), R) < 0, lh = leftFirst ? best : other, rh = leftFirst ? other : best;
    const sol = this.solve({ lh: endAt('lh', lh), rh: endAt('rh', rh), lf: null, rf: null });
    this.leap = { lh, rh, t: 0, gather: 0.22, air: 0, from: this.pelvis.slice(), to: sol.p, handsFrom: { lh: this.limb.lh.p, rh: this.limb.rh.p }, feetFrom: { lf: this.limb.lf.p, rf: this.limb.rf.p } };
    const dy = sol.p[1] - this.pelvis[1], g = 9.81, apex = Math.max(0.15, dy + 0.18), vUp = Math.sqrt(2 * g * Math.max(0.15, apex));
    this.leap.air = dy >= 0 ? vUp / g + Math.sqrt(Math.max(0, 2 * (apex - dy) / g)) : (vUp + Math.sqrt(vUp * vUp - 2 * g * dy)) / g;
    this.leap.vy = vUp; this.state = 'leap'; this.t = 0; this.lookAt = best.p;
    return true;
  }
  stepLeap(dt, input) {
    const q = this.leap, H = this.limb; q.t += dt; this.effort = 1;
    if (q.t < q.gather) { // sink onto the arms, knees in
      const f = ease(q.t / q.gather); this.pelvis = add(q.from, [0, -1, 0], 0.14 * f); return;
    }
    const f = Math.min(1, (q.t - q.gather) / q.air), T = f * q.air, from = add(q.from, [0, -0.14, 0]);
    this.pelvis = [from[0] + (q.to[0] - from[0]) * f, from[1] + q.vy * T - 4.905 * T * T + 0.14 * f, from[2] + (q.to[2] - from[2]) * f];
    this.pelvis = this.offWall(this.pelvis);
    for (const k of ['lh', 'rh']) { H[k].hold = null; H[k].f = 0; H[k].p = lerp3(q.handsFrom[k], endAt(k, q[k]), ease(clamp(f * 1.5, 0, 1))); }
    for (const k of ['lf', 'rf']) { H[k].hold = null; H[k].free = true; H[k].p = lerp3(H[k].p, this.restEnd(k, this.pelvis), 1 - Math.exp(-dt * 7)); }
    if (f >= 1) {
      if (input.exhausted) { for (const k of ['lh', 'rh']) H[k].hold = q[k]; this.fall(input, true); return; }
      for (const k of ['lh', 'rh']) { const L = H[k]; L.hold = q[k]; L.to = endAt(k, q[k]); L.p = L.to.slice(); L.from = L.p; L.f = 1; L.dur = 0; L.free = false; }
      this.pelvis = q.to.slice(); this.state = 'hold'; this.leap = null; this.moving = null; this.caught = 1;
    }
  }

  // ---- top-out: over the parapet onto whatever's up there
  startTop() {
    const { lh, rh } = this.limb;
    if (lh.hold?.kind !== 'top' || rh.hold?.kind !== 'top') return false;
    const n = lh.hold.n, y = lh.hold.y, c = lerp3(lh.hold.p, rh.hold.p, 0.5), W = this.world;
    const stand = [c[0] - n[0] * 0.75, y, c[2] - n[1] * 0.75], g = W.groundAt(stand[0], stand[2], y + 0.2).h;
    if (Math.abs(g - y) > 0.8 || W.ceilingAt(stand[0], stand[2], g) < g + 1.9 || W.solidAt(stand[0], g + 1.2, stand[2], 0.25)) { this.blocked = 'nothing to stand on up there'; return false; }
    this.topOut = { t: 0, dur: 1.5, from: this.pelvis.slice(), stand: [stand[0], g, stand[2]], edge: c, n, feet: { lf: this.limb.lf.p, rf: this.limb.rf.p } };
    this.state = 'top'; return true;
  }
  stepTop(dt) {
    const q = this.topOut; q.t += dt; this.effort = 1;
    const f = Math.min(1, q.t / q.dur), n = [q.n[0], 0, q.n[1]], R = this.right();
    const hipOver = [q.edge[0] + n[0] * 0.05, q.edge[1] + 0.62, q.edge[2] + n[2] * 0.05], end = add(q.stand, [0, BODY.hipHeight, 0]);
    // press up until the hips clear the edge, then knee over, then stand
    const a = ease(clamp(f / 0.5, 0, 1)), b = ease(clamp((f - 0.45) / 0.55, 0, 1));
    this.pelvis = lerp3(lerp3(q.from, hipOver, a), end, b);
    for (const k of ['lf', 'rf']) { const s = k === 'lf' ? -1 : 1, g = ease(clamp((f - (k === 'rf' ? 0.35 : 0.55)) / 0.3, 0, 1)), L = this.limb[k]; L.hold = null;
      const onTop = add(add(q.stand, R, s * 0.11), [0, BODY.ankle, 0]), base = this.footTrail(q, k); L.p = add(lerp3(base, onTop, g), [0, 1, 0], Math.sin(g * Math.PI) * 0.35); }
    if (f > 0.72) for (const k of ['lh', 'rh']) { const g = ease((f - 0.72) / 0.28), L = this.limb[k]; L.hold = null; L.p = lerp3(L.to, this.restEnd(k, this.pelvis), g); }
    if (f >= 1) this.done = { kind: 'walk', pos: q.stand, facing: Math.atan2(-q.n[0], -q.n[1]) };
  }
  footTrail(q, k) { return q.feet[k]; }

  // ---- the output: IK targets for any skeleton. World space, y up.
  // { pelvis, right, up (spine), forward (into the wall), chest, lookAt, limbs: { lh|rh|lf|rf: { p, n?, grip (0–1), moving } } }
  pose() {
    const R = this.right(), f = [-this.normal[0], 0, -this.normal[2]], { lh, rh, lf, rf } = this.limb;
    const hc = lerp3(lh.p, rh.p, 0.5);
    // the spine leans in toward the hands; shoulders tilt with them
    const toHands = sub(hc, this.pelvis), lean = clamp(dot(toHands, f) / Math.max(0.3, toHands[1]), -0.5, 0.5);
    let up = [f[0] * lean, 1, f[2] * lean]; const ul = len(up); up = [up[0] / ul, up[1] / ul, up[2] / ul];
    const limbs = {};
    for (const k of LIMBS) { const L = this.limb[k]; limbs[k] = { p: L.p.slice(), n: L.hold ? [L.hold.n[0], 0, L.hold.n[1]] : null, grip: L.hold && L.f >= 0.85 ? 1 : L.hold ? (L.f - 0.5) * 2 : 0, moving: this.moving === k, kind: L.hold?.kind || null }; if (limbs[k].grip < 0) limbs[k].grip = 0; }
    return { state: this.state, pelvis: this.pelvis.slice(), right: R, up, forward: f, tilt: clamp((rh.p[1] - lh.p[1]) * 0.22, -0.3, 0.3), hipTilt: clamp((rf.p[1] - lf.p[1]) * 0.18, -0.25, 0.25), lookAt: this.lookAt || null, limbs };
  }
  get feet() { return [this.pelvis[0], this.pelvis[1] - BODY.hipHeight, this.pelvis[2]]; }
  get facing() { return Math.atan2(-this.normal[0], -this.normal[2]); }
}
