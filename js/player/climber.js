// Climbing a wall one limb at a time. Pure logic: no three.js, no meshes, runs in Node.
//
// Two hands and two feet each hold a real hold (gen/holds.js). One limb moves at a time; the
// other three stay exactly where they are, and the body hangs between them: its position is
// solved each step from what the planted limbs can reach. Nothing here is a canned animation,
// so the output (pose(), below) is a set of IK targets any skeleton can follow — a primitive
// placeholder or a full rig (player/limbik.js).
//   W/A/S/D climb · Shift faster · Space leap (both hands off, catch a hold further on) · Q let go
// Proportions are the ADVENTURER body's (metres): the planner must plan for the real reach.
import { faceAhead, faceBelowEdge, holdsNear, aOf, outOf, facesNear, CORNER_STEP } from '../gen/holds.js';

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
  // Over the edge of a roof you're standing on, looking out: turn round and lower yourself onto the wall.
  static grabDown(world, x, y, z, fx, fz) {
    const f = faceBelowEdge(world, x, y, z, fx, fz); if (!f) return null;
    const a = aOf(f, x, z), c = new Climber(world, f, [f.o[0] + f.t[0] * a + f.n[0] * 0.35, f.y1 - 1.9, f.o[1] + f.t[1] * a + f.n[1] * 0.35]);
    if (!c.ok) return null;
    c.pelvis = [x, y + BODY.hipHeight, z]; c.mountFrom = c.pelvis.slice(); c.mountDur = 1.3;
    for (const k of LIMBS) { const L = c.limb[k]; L.from = c.restEnd(k, c.pelvis); L.p = L.from.slice(); }
    return c;
  }
  constructor(world, face, from) {
    this.world = world; this.face = face; this.state = 'mount'; this.t = 0; this.done = null;
    this.limb = {}; this.cycle = 0; this.last = null; this.blocked = null; this.slip = 0; this.effort = 0;
    this.normal = [face.n[0], 0, face.n[1]]; this.vel = [0, 0, 0];
    const a0 = aOf(face, from[0], from[2]), pipeA = a0 < 0.3 || a0 > face.w - 0.3 ? undefined : (face.pipes || []).find(q => Math.abs(q - a0) < 0.6), a = pipeA ?? a0, start = [from[0], from[1] + BODY.hipHeight, from[2]];
    // hands on the best pair within a jump of where you stand; feet on what's under you
    const pick = (ideal, want, ra, ry) => { let best = null, bd = Infinity; holdsNear(world, face, ideal, want, ra, ry, h => { if (want > from[1] + 0.8 && h.kind === 'ground') return; const d = Math.hypot(h.a - ideal, h.y - want); if (d < bd) { bd = d; best = h; } }); return best; };
    const R = this.right(), sgn = (face.t[0] * R[0] + face.t[1] * R[2]) > 0 ? 1 : -1;       // +a is your right, or your left
    const reach = from[1] + 1.95;
    const lh = pick(a - sgn * 0.3, reach, 0.6, 0.9), rh = pick(a + sgn * 0.3, reach, 0.6, 0.9);
    if (!face.tower && pipeA == null && (!lh || !rh || lh === rh || lh.a === rh.a)) { this.ok = false; return; }
    const footY = Math.max(from[1], Math.min(lh?.y ?? reach, rh?.y ?? reach) - 1.55);
    const lf = pick(a - sgn * 0.18, footY, 0.5, 0.75), rf = pick(a + sgn * 0.18, footY, 0.5, 0.75);
    const hold = { lh, rh, lf, rf };
    // A drainpipe within reach: both hands round it, feet against the wall either side
    if (pipeA != null) { const onPipe = want => { let b = null, bd = Infinity; holdsNear(world, face, pipeA, want, 0.05, 0.5, h => { if (h.kind === 'pipe' && Math.abs(h.y - want) < bd) { bd = Math.abs(h.y - want); b = h; } }); return b; }; const hi = onPipe(reach), lo = hi && onPipe(hi.y - CORNER_STEP); if (hi && lo) { hold[sgn > 0 ? 'rh' : 'lh'] = hi; hold[sgn > 0 ? 'lh' : 'rh'] = lo; } else if (!lh || !rh || lh === rh || lh.a === rh.a) { this.ok = false; return; } }
    // At a corner, take it the way a climber does: a hand and a foot on each side of the edge, body square to the arris.
    const edge = pipeA != null ? 0 : face.tower ? (a < face.w / 2 ? -1 : 1) : a < 0.8 ? -1 : a > face.w - 0.8 ? 1 : 0;     // (a tower's way up is its legs)
    if (edge) {
      const near = edge * sgn > 0 ? ['rh', 'rf'] : ['lh', 'lf'], far = edge * sgn > 0 ? ['lh', 'lf'] : ['rh', 'rf'], side = edge > 0 ? face.next() : face.prev(), pickEdge = (f, A, want, ry) => { let b = null, bd = Infinity; holdsNear(world, f, A, want, Math.max(0.8, f.w), ry, h => { if (h.kind !== 'corner') return; const d = Math.abs(h.y - want) + 3 * Math.abs(h.a - A); if (d < bd) { bd = d; b = h; } }); return b; };
      const aHere = edge > 0 ? face.w - 0.05 : 0.05, aThere = edge > 0 ? 0.05 : side.w - 0.05;
      const hR = from[1] + 1.85, fR = Math.max(from[1] + 0.45, hR - 1.5), H1 = pickEdge(side, aThere, hR, 0.5), H2 = pickEdge(face, aHere, hR + 0.45, 0.5), F1 = pickEdge(side, aThere, fR + 0.45, 0.5), F2 = pickEdge(face, aHere, fR, 0.5);
      if (H1 && H2 && F1 && F2) { hold[near[0]] = H1; hold[near[1]] = F1; hold[far[0]] = H2; hold[far[1]] = F2; }
      else if (face.tower) { this.ok = false; return; }
    }
    for (const k of LIMBS) {
      const stand = this.restEnd(k, start);
      this.limb[k] = { k, hold: hold[k], p: stand, from: stand, to: hold[k] ? endAt(k, hold[k]) : null, f: 0, dur: 0, free: !hold[k] };
    }
    this.pelvis = start; this.mountFrom = start; this.mountDur = 0.45 + Math.max(0, Math.min(hold.lh.y, hold.rh.y) - (from[1] + 2.0)) * 0.5;
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
    const off = this.face.tower ? 0.1 : WALL; let p = [cx / c + n[0] * off, Math.max(wantY, fn ? fy + 0.28 : -1e9), cz / c + n[2] * off];
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
    const faces = this.leapFaces || new Set(); if (!this.leapFaces) { for (const k of LIMBS) { const h = this.limb[k]?.hold; if (h) faces.add(h.face); } faces.add(this.face); }      // (in the air, only the wall you're going to counts)
    let best = -Infinity, bf = null;
    for (const f of faces) { const o = outOf(f, p[0], p[2], p[1]); if (o > best) { best = o; bf = f; } }
    const lo = this.face.tower ? 0.04 : 0.2, hi = 0.5;     // (on steelwork you hug the leg)
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
    if (f.tower) { for (const q of [f, f.next(), f.prev()]) holdsNear(this.world, q, aOf(q, at[0], at[2]), at[1], ra, ry, fn); return; }   // (it draws in as it rises: a corner isn't where the straight line says)
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
      if (other.hold && other.hold.face === h.face && other.hold.a === h.a && other.hold.y === h.y && (hand || h.kind !== 'pipe')) return;      // (both feet can share a bracket)
      const d = sub(h.p, cur), prog = (d[0] * R[0] + d[2] * R[2]) * right + d[1] * up;
      if (L.hold && prog < 0.12 * ml && (right || up)) return;      // it has to get you somewhere
      // left stays left; hands above feet by a body's span; not spreadeagled
      if (other.hold) {
        const sep = dot(sub(h.p, other.hold.p), R) * (isLeft(k) ? -1 : 1), gapY = Math.abs(h.p[1] - other.hold.p[1]);
        if ((sep < (hand ? 0.1 : 0.04) && h.face === other.hold.face && !(h.kind === 'pipe' && other.hold.kind === 'pipe' && h.a === other.hold.a)) || Math.abs(sep) > (hand ? 1.05 : 1.0) || gapY > 1.2) return;
      }
      const tuck = h.kind === 'pipe' || h.kind === 'corner' ? 0.44 : 0.55;     // (on a pipe you can bunch right up)
      if (hand) { for (const F of feet) if (F.hold && h.p[1] - F.hold.p[1] < tuck) return; }
      else for (const H of hands) if (H.hold && H.hold.p[1] - h.p[1] < tuck) return;
      const over = { [k]: endAt(k, h) }, sol = this.solve(this.ends(over));
      if (sol.slack > -0.005) return;     // (not at the very end of an arm: the body has to be able to settle there)
      // on a corner, stay on it going up: it's the fast way, the legs of a tower most of all
      const s = len(sub(h.p, ideal)) - 0.25 * prog + (h.kind === 'rail' ? 0.08 : 0) - ((h.kind === 'corner' || h.kind === 'pipe') && up > 0 && !right && this.atCorner() ? 0.45 : 0);
      if (s < bs) { bs = s; best = h; }
    });
    return best ? { k, hold: best } : null;
  }
  atCorner() { const { lh, rh } = this.limb; if (lh.hold && rh.hold && lh.hold.face !== rh.hold.face) return true; const h = lh.hold || rh.hold; if (!h) return false; if (h.kind === 'pipe' || h.kind === 'corner') return true; const e = Math.min(h.a, h.face.w - h.a); return e < 0.8 || !!h.face.tower; }
  startMove({ k, hold }, input) {
    const L = this.limb[k], to = endAt(k, hold), dist = len(sub(to, L.p));
    const pace = (input.run ? 1.45 : 1) * (input.tired ? 0.55 : 1);
    L.from = L.p; L.to = to; L.hold = hold; L.f = 0; L.free = false; L.dur = ((isHand(k) ? 0.11 : 0.09) + (isHand(k) ? 0.15 : 0.12) * dist) / pace * (hold.kind === 'corner' || hold.kind === 'pipe' ? 0.62 : 1);
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
        let m = this.plan(dir);
        // straight up blocked (a window's glass, a door): edge round it, up and to one side, keeping to that side until the way is clear again
        if (this.detour && (this.pelvis[1] > this.detourY + 1.0 || input.right || input.fwd <= 0)) this.detour = 0;
        if ((!m || this.detour) && input.fwd > 0 && !input.right) {
          if (!this.detour) { this.detour = this.detourSide(dir.R); this.detourY = this.pelvis[1]; this.detourMiss = 0; }
          const d2 = this.plan({ ...dir, right: this.detour });
          if (d2) { m = d2; this.detourMiss = 0; } else if (!m && ++this.detourMiss > 3) { this.detour = -this.detour; this.detourMiss = 0; }
        }
        if (m) this.startMove(m, input); else this.blocked = input.fwd > 0 ? 'no hold in reach above' : 'no hold in reach';
      }
    }
    if (this.turnTo && this.limb.lh.hold?.face === this.turnTo && this.limb.rh.hold?.face === this.turnTo) { this.face = this.turnTo; this.turnTo = null; }
    this.updateBody(dt);
    if (!this.effort) this.effort = 0.25;      // hanging on is work too
  }
  // which way round: toward the nearest course above that runs on past what's in the way (+1 your right, -1 your left)
  detourSide(R) {
    const { lh, rh } = this.limb, here = lh.hold && rh.hold ? lerp3(lh.hold.p, rh.hold.p, 0.5) : this.pelvis, hy = Math.max(lh.hold?.p[1] ?? here[1], rh.hold?.p[1] ?? here[1]); let best = 0, bd = Infinity;
    this.candidates([here[0], hy + 0.6, here[2]], 4, 0.45, h => { if (h.kind === 'ground' || h.y <= hy + 0.2 || h.kind === 'sill' || h.kind === 'head') return; const side = dot(sub(h.p, here), R), d = Math.abs(side); if (d > 0.3 && d < bd) { bd = d; best = side > 0 ? 1 : -1; } });
    return best || 1;
  }
  normalOfMove(L) { return L.hold ? [L.hold.n[0], 0, L.hold.n[1]] : this.normal; }
  updateBody(dt, stiff = 14) {
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
    if (right && this.atCorner()) { const q = this.leapAcross(R, right); if (q) { this.beginLeap(q.lh, q.rh, q.far); return true; } }
    // Down and jump: push off backward. To the wall behind you if there's one in range; if not, it's a clean drop away from this one.
    if (input.fwd < 0 && !right) { const q = this.leapBack(); if (q) { this.beginLeap(q.lh, q.rh, true, q.face); return true; } if (!this.onGround()) { const n = this.normal; this.done = { kind: 'fall', pos: [this.pelvis[0], this.pelvis[1] - BODY.hipHeight, this.pelvis[2]], vel: [n[0] * 4.5, 2.6, n[2] * 4.5], facing: Math.atan2(n[0], n[2]) }; return true; } }
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
    const leftFirst = dot(sub(best.p, other.p), R) < 0;
    this.beginLeap(leftFirst ? best : other, leftFirst ? other : best);
    return true;
  }
  // From a corner or a pipe, across open wall to the next corner or pipe your way: on this wall, round to the next, or over the gap to another building.
  leapAcross(R, right, MAX = 8) {
    const H = this.limb, here = lerp3(H.lh.hold.p, H.rh.hold.p, 0.5); let best = null, bs = Infinity;
    const faces = new Set(); facesNear(this.world, here[0], here[1], here[2], MAX, f => faces.add(f));
    for (const f of faces) { if (f.n[0] * this.normal[0] + f.n[1] * this.normal[2] < -0.3) continue;
      holdsNear(this.world, f, aOf(f, here[0], here[2]), here[1] + 0.35, MAX + 1, 1.8, h => {
        if (h.kind !== 'corner' && h.kind !== 'pipe') return;
        const d = sub(h.p, here), side = (d[0] * R[0] + d[2] * R[2]) * right, flat = Math.hypot(d[0], d[2]);
        if (side < 1.1 || flat > MAX || flat < 1.1 || Math.abs(d[1]) > 1.8) return;       // ...has to be across a gap, your way
        const s = flat + Math.abs(d[1] - 0.35) * 0.6; if (s < bs) { bs = s; best = h; }
      }); }
    if (!best) return null;
    // the other hand: the same pipe or edge, a little lower
    let other = null; holdsNear(this.world, best.face, best.a, best.y - CORNER_STEP, 0.02, 0.05, h => { if (h.kind === best.kind) other = h; });
    if (!other) holdsNear(this.world, best.face, best.a, best.y + CORNER_STEP, 0.02, 0.05, h => { if (h.kind === best.kind) other = h; });
    if (!other) return null;
    const rFirst = right > 0;     // the leading hand gets there first and higher
    return { lh: rFirst ? other : best, rh: rFirst ? best : other, far: true };
  }
  // The wall at your back: nearest face looking at this one, within a long jump, with something to catch a little below you.
  leapBack(MAX = 7.5) {
    const n = this.normal, P = this.pelvis, hy = Math.max(this.limb.lh.hold?.p[1] ?? P[1], this.limb.rh.hold?.p[1] ?? P[1]); let best = null, bs = Infinity;
    const faces = new Set(), at = [P[0] + n[0] * MAX * 0.5, P[1], P[2] + n[2] * MAX * 0.5]; facesNear(this.world, at[0], at[1], at[2], MAX * 0.6, f => faces.add(f));
    for (const f of faces) { if (f.n[0] * n[0] + f.n[1] * n[2] > -0.8) continue; const gap = outOf(f, P[0], P[2]); if (gap < 1.2 || gap > MAX) continue;
      holdsNear(this.world, f, aOf(f, P[0], P[2]), hy - 0.5, 1.6, 1.6, h => { if (h.kind === 'ground') return; const s = Math.abs(h.y - (hy - 0.5)) + Math.abs(h.a - aOf(f, P[0], P[2])) + gap * 0.2 + (h.kind === 'pipe' || h.kind === 'corner' ? -0.3 : 0); if (s < bs) { bs = s; best = h; } }); }
    if (!best) return null;
    let other = null, od = Infinity; if (best.kind === 'pipe' || best.kind === 'corner') holdsNear(this.world, best.face, best.a, best.y - CORNER_STEP, 0.02, 0.05, h => { if (h.kind === best.kind) other = h; });
    if (!other) holdsNear(this.world, best.face, best.a, best.y, 0.7, 0.01, h => { const d = Math.abs(Math.abs(h.a - best.a) - 0.45); if (h.a !== best.a && d < od) { od = d; other = h; } });
    if (!other) return null;
    // left and right as you'll be facing that wall
    const r = [best.face.n[1], 0, -best.face.n[0]], leftFirst = dot(sub(best.p, other.p), r) < 0;
    return { lh: leftFirst ? best : other, rh: leftFirst ? other : best, face: best.face };
  }
  beginLeap(lh, rh, far = false, turnFace = null) {
    const n0 = this.normal; if (turnFace) this.normal = [turnFace.n[0], 0, turnFace.n[1]];
    this.leapFaces = new Set([lh.face, rh.face]);
    const sol = this.solve({ lh: endAt('lh', lh), rh: endAt('rh', rh), lf: null, rf: null });
    this.turn = turnFace ? { from: n0, to: this.normal } : null; this.normal = n0;
    this.leap = { lh, rh, t: 0, gather: far ? 0.28 : 0.22, air: 0, from: this.pelvis.slice(), to: sol.p, handsFrom: { lh: this.limb.lh.p, rh: this.limb.rh.p }, feetFrom: { lf: this.limb.lf.p, rf: this.limb.rf.p } };
    const dy = sol.p[1] - this.pelvis[1], g = 9.81, dist = Math.hypot(sol.p[0] - this.pelvis[0], sol.p[2] - this.pelvis[2]), apex = Math.max(0.15, dy + 0.18), vUp = Math.sqrt(2 * g * Math.max(0.15, apex));
    let T = dy >= 0 ? vUp / g + Math.sqrt(Math.max(0, 2 * (apex - dy) / g)) : (vUp + Math.sqrt(vUp * vUp - 2 * g * dy)) / g, v = vUp;
    if (dist / T > 6.5) { T = dist / 6.5; v = (dy + 0.5 * g * T * T) / T; }     // a long leap is a real arc, not a dart
    this.leap.air = T; this.leap.vy = v; this.state = 'leap'; this.t = 0; this.lookAt = (far ? rh : lh).p;
  }
  stepLeap(dt, input) {
    const q = this.leap, H = this.limb; q.t += dt; this.effort = 1;
    if (q.t < q.gather) { // sink onto the arms, knees in
      const f = ease(q.t / q.gather); this.pelvis = add(q.from, [0, -1, 0], 0.14 * f); return;
    }
    const f = Math.min(1, (q.t - q.gather) / q.air), T = f * q.air, from = add(q.from, [0, -0.14, 0]);
    if (this.turn) { const e = ease(f), a0 = Math.atan2(this.turn.from[0], this.turn.from[2]), side = 1.2 * Math.sin(e * Math.PI), xx = this.turn.from[0] + (this.turn.to[0] - this.turn.from[0]) * e + this.turn.from[2] * side, zz = this.turn.from[2] + (this.turn.to[2] - this.turn.from[2]) * e - this.turn.from[0] * side, l = Math.hypot(xx, zz) || 1; this.normal = [xx / l, 0, zz / l]; }     // turning in the air to face it
    this.pelvis = [from[0] + (q.to[0] - from[0]) * f, from[1] + q.vy * T - 4.905 * T * T + 0.14 * f, from[2] + (q.to[2] - from[2]) * f];
    if (f > 0.8 && !this.turn) this.pelvis = this.offWall(this.pelvis);
    for (const k of ['lh', 'rh']) { H[k].hold = null; H[k].f = 0; H[k].p = lerp3(q.handsFrom[k], endAt(k, q[k]), ease(clamp(f * 1.5, 0, 1))); }
    for (const k of ['lf', 'rf']) { H[k].hold = null; H[k].free = true; H[k].p = lerp3(H[k].p, this.restEnd(k, this.pelvis), 1 - Math.exp(-dt * 7)); }
    if (f >= 1) {
      if (input.exhausted) { this.leapFaces = null; for (const k of ['lh', 'rh']) H[k].hold = q[k]; this.fall(input, true); return; }
      for (const k of ['lh', 'rh']) { const L = H[k]; L.hold = q[k]; L.to = endAt(k, q[k]); L.p = L.to.slice(); L.from = L.p; L.f = 1; L.dur = 0; L.free = false; }
      this.pelvis = q.to.slice(); this.state = 'hold'; this.leap = null; this.moving = null; this.caught = 1; this.face = q.lh.face; this.turnTo = null; this.leapFaces = null; if (this.turn) { this.normal = this.turn.to; this.turn = null; }
    }
  }

  // ---- top-out: over the parapet onto whatever's up there
  startTop() {
    const { lh, rh } = this.limb;
    if (lh.hold?.kind !== 'top' || rh.hold?.kind !== 'top') return false;
    const n = lh.hold.n, y = lh.hold.y, c = lerp3(lh.hold.p, rh.hold.p, 0.5), W = this.world;
    const stand = [c[0] - n[0] * 0.75, y, c[2] - n[1] * 0.75], g = W.groundAt(stand[0], stand[2], y + 0.2).h;
    if (Math.abs(g - y) > 0.8 || W.ceilingAt(stand[0], stand[2], g) < g + 1.9 || W.solidAt(stand[0], g + 1.2, stand[2], 0.25)) { this.blocked = 'nothing to stand on up there'; return false; }
    const lead = this.limb.rf.p[1] >= this.limb.lf.p[1] ? 'rf' : 'lf', trail = lead === 'rf' ? 'lf' : 'rf', R = this.right(), s = lead === 'lf' ? -1 : 1;
    // where the leading foot lands: just in from the edge, on whatever's there (a parapet's top, or the roof)
    const plantXZ = [c[0] - n[0] * 0.2 + R[0] * s * 0.13, c[2] - n[1] * 0.2 + R[2] * s * 0.13], plantY = Math.max(W.groundAt(plantXZ[0], plantXZ[1], y + 0.2).h, y - 0.1);
    this.topOut = { t: 0, dur: 2.3, from: this.pelvis.slice(), stand: [stand[0], g, stand[2]], edge: c, y, n, lead, trail, plant: [plantXZ[0], plantY + BODY.ankle, plantXZ[1]], feet: { lf: this.limb.lf.p.slice(), rf: this.limb.rf.p.slice() }, hands: { lh: this.limb.lh.p.slice(), rh: this.limb.rh.p.slice() } };
    this.state = 'top'; return true;
  }
  // A mantle, the way a person does it: arms press the hips up to the edge; the leading foot comes
  // out, up and over and lands on the ledge; weight goes onto it, the leg drives the body up and over,
  // the hands let go as the shoulders pass above them; the other leg follows clear of the edge. The
  // hips stay outside the edge until they're above it, so nothing passes through anything.
  stepTop(dt) {
    const q = this.topOut; q.t += dt; this.effort = 1;
    const f = Math.min(1, q.t / q.dur), n = [q.n[0], 0, q.n[1]], R = this.right(), E = q.edge;
    const at = (out, up, side = 0) => [E[0] + n[0] * out + R[0] * side, q.y + up, E[2] + n[2] * out + R[2] * side];
    const start0 = sub(q.from, E), o0 = start0[0] * n[0] + start0[2] * n[2], y0 = q.from[1] - q.y, endUp = q.stand[1] - q.y + BODY.hipHeight;
    // the hips: [f, out from the edge, up from it]
    const K = [[0, o0, y0], [0.3, 0.3, -0.45], [0.5, 0.26, -0.08], [0.62, 0.14, 0.24], [0.76, -0.16, 0.55], [1, -0.75, endUp]];
    let k = 0; while (k < K.length - 2 && f > K[k + 1][0]) k++;
    const A = K[k], B = K[k + 1], u = (f - A[0]) / (B[0] - A[0]), P0 = K[Math.max(0, k - 1)], P3 = K[Math.min(K.length - 1, k + 2)], dF = B[0] - A[0];
    const herm = c => { const m0 = k === 0 ? 0 : (B[c] - P0[c]) / (B[0] - P0[0]) * dF, m1 = k + 2 >= K.length ? 0 : (P3[c] - A[c]) / (P3[0] - A[0]) * dF, u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * A[c] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * B[c] + (u3 - u2) * m1; };
    const side0 = dot(sub(q.from, E), R);
    this.pelvis = at(herm(1), herm(2), side0 * (1 - f));
    // the torso goes over with the weight: well forward as the leg drives, upright again to stand
    q.lean = 1.1 * Math.sin(Math.PI * clamp((f - 0.12) / 0.8, 0, 1)) ** 1.3;
    const bez = (a, c, b, v) => { const w = 1 - v; return [w * w * a[0] + 2 * w * v * c[0] + v * v * b[0], w * w * a[1] + 2 * w * v * c[1] + v * v * b[1], w * w * a[2] + 2 * w * v * c[2] + v * v * b[2]]; };
    const sideOf = k => k === 'lf' ? -1 : 1, onTop = k => add(add(q.stand, R, sideOf(k) * 0.11), [0, BODY.ankle, 0]);
    // the leading foot: off the wall, out round the edge, down on the ledge; there until the body is over it, then a step to where it stands
    { const L = this.limb[q.lead]; L.hold = null;
      const v = ease(clamp((f - 0.22) / 0.28, 0, 1)), over = bez(q.feet[q.lead], at(0.42, 0.34, sideOf(q.lead) * 0.13), q.plant, v), w = ease(clamp((f - 0.8) / 0.18, 0, 1));
      L.p = add(lerp3(over, onTop(q.lead), w), [0, 1, 0], Math.sin(w * Math.PI) * 0.1); }
    // the trailing foot pushes off late, hangs below the hip for a moment, then swings up and over clear of the edge
    { const L = this.limb[q.trail]; L.hold = null;
      const hang = add(this.pelvis, [0, -0.72, 0]), wallFoot = q.feet[q.trail], d = len(sub(wallFoot, this.pelvis)), v = ease(clamp((f - 0.3) / 0.18, 0, 1)), low = d < 0.8 ? lerp3(wallFoot, hang, v * 0.5) : lerp3(wallFoot, hang, Math.max(v, clamp((d - 0.8) / 0.08, 0, 1)));
      if (!q.swing && f >= 0.56) q.swing = low.slice();
      if (q.swing) { const sw = ease(clamp((f - 0.56) / 0.36, 0, 1)); L.p = bez(q.swing, at(0.28, 0.5, sideOf(q.trail) * 0.14), onTop(q.trail), sw); } else L.p = low; }
    // the hands stay pressed on the edge, then come away one after the other as the shoulders rise above them
    for (const [k, t0] of [[q.lead === 'rf' ? 'lh' : 'rh', 0.5], [q.lead === 'rf' ? 'rh' : 'lh', 0.56]]) { const g = ease(clamp((f - t0) / 0.3, 0, 1)), L = this.limb[k]; if (g > 0) L.hold = null; L.p = lerp3(q.hands[k], this.restEnd(k, this.pelvis), g); }
    // nothing reaches further than it can: a limb that would comes in as far as it has to
    const fw = [-n[0], 0, -n[2]], L0 = Math.hypot(q.lean, 1), sh = add(this.pelvis, [fw[0] * q.lean / L0, 1 / L0, fw[2] * q.lean / L0], BODY.shoulderUp);
    const within = (p, c, most) => { const d = sub(p, c), l = len(d); return l > most ? add(c, d, most / l) : p; };
    for (const k of ['lf', 'rf']) this.limb[k].p = within(this.limb[k].p, this.pelvis, (BODY.thigh + BODY.shin) * 0.98);
    for (const k of ['lh', 'rh']) this.limb[k].p = within(this.limb[k].p, add(sh, R, (k === 'lh' ? -1 : 1) * BODY.shoulderOut), (BODY.upperArm + BODY.foreArm + BODY.palm) * 0.98);
    if (f >= 1) this.done = { kind: 'walk', pos: q.stand, facing: Math.atan2(-q.n[0], -q.n[1]) };
  }

  // ---- the output: IK targets for any skeleton. World space, y up.
  // { pelvis, right, up (spine), forward (into the wall), chest, lookAt, limbs: { lh|rh|lf|rf: { p, n?, grip (0–1), moving } } }
  pose() {
    const R = this.right(), f = [-this.normal[0], 0, -this.normal[2]], { lh, rh, lf, rf } = this.limb;
    const hc = lerp3(lh.p, rh.p, 0.5);
    // the spine leans in toward the hands; shoulders tilt with them
    const toHands = sub(hc, this.pelvis), lean = this.state === 'top' ? this.topOut.lean ?? 0 : clamp(dot(toHands, f) / Math.max(0.3, toHands[1]), -0.5, 0.5);
    let up = [f[0] * lean, 1, f[2] * lean]; const ul = len(up); up = [up[0] / ul, up[1] / ul, up[2] / ul];
    const limbs = {};
    for (const k of LIMBS) { const L = this.limb[k]; limbs[k] = { p: L.p.slice(), n: L.hold ? [L.hold.n[0], 0, L.hold.n[1]] : null, grip: L.hold && L.f >= 0.85 ? 1 : L.hold ? (L.f - 0.5) * 2 : 0, moving: this.moving === k, kind: L.hold?.kind || null, hold: L.hold || null }; if (limbs[k].grip < 0) limbs[k].grip = 0; }
    return { state: this.state, pelvis: this.pelvis.slice(), right: R, up, forward: f, tilt: clamp((rh.p[1] - lh.p[1]) * 0.22, -0.3, 0.3), hipTilt: clamp((rf.p[1] - lf.p[1]) * 0.18, -0.25, 0.25), lookAt: this.lookAt || null, limbs };
  }
  get feet() { return [this.pelvis[0], this.pelvis[1] - BODY.hipHeight, this.pelvis[2]]; }
  get facing() { return Math.atan2(-this.normal[0], -this.normal[2]); }
}
