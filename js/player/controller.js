// Third-person character motion: kinematic capsule with gravity, jumping, step-up,
// sticking to stairs/ramps on the way down, and climbing:
//   scramble — slopes too steep to walk can still be climbed, slowly, while you're not exhausted
//   mantle   — Space while walking into something 0.55–2.2 m high pulls you up onto it (and in the air, Space held, you catch an edge
//              you've jumped up to: player/moves.js mantlePose)
//   vault    — Space at a run into something low with a far side (sandbags, a wall, a stone): over it and on, still running
//   slide    — down into a crouch at a full run: you go on low along the ground, faster downhill, until it bleeds off
//   rock     — a stone too tall to pull yourself onto: up its side hand over hand (player/moves.js RockClimb), and over its crown
//   ladder   — E at a ladder; W/S to climb, Space to let go; the top steps you onto the roof
//   seat     — sitting or lying at a furniture anchor; any move key gets you up
//   wall     — on a building's facade, hand over hand (player/climber.js)
// Every surface comes from the collision world's logical data, never from meshes.
import { underfoot } from '../gen/underfoot.js';
import { riverAt } from '../gen/rivers.js';
import { Climber } from './climber.js';
import { mantlePose, vaultPose, RockClimb } from './moves.js';
export const GRAVITY = 9.81;
// a jog, a sprint (the speeds the recorded gaits cover: player/adventurer.js GAITS), and a jump that's a person's: about 0.75 m at its height
const WALK = 3.4, RUN = 7.0, JUMP = 3.85, MAX_SLOPE = 1.1; // rise/run ≈ 48°
const COYOTE = 0.13, BUFFER = 0.16;       // off an edge you can still jump for a moment; a jump pressed just before you land is kept for it
const SLIDE_MIN = 5.2, SLIDE_FRICTION = 3.2;
const SWIM_DEPTH = 1.2;         // feet this far under when you're swimming: head and shoulders out
const REPOSE = 0.56;            // loose ground stands no steeper than about 30°
const LADDER = 0.9;                                        // m/s up or down a ladder

export class Controller {
  constructor(world, pos) {
    this.world = world;
    this.pos = pos.slice();
    this.vel = [0, 0, 0];
    this.grounded = false;
    this.facing = 0;            // radians, 0 = +z
    this.speed = 0;
    this.mode = 'walk';         // 'walk' | 'mantle' | 'ladder' | 'seat'
    this.climbing = false;      // exerting: scrambling, mantling or on a ladder (drives fatigue + pose)
  }

  // Grab a ladder (gen/climb.js record). From below or from the roof.
  grabLadder(l) {
    const fromTop = this.pos[1] > l.foot[1] + 1.5;
    this.mode = 'ladder'; this.ladder = l; this.vel = [0, 0, 0]; this.facing = l.facing;
    this.pos = [l.head[0], fromTop ? l.head[1] - 1.2 : Math.max(l.foot[1], this.pos[1]), l.head[2]];
  }
  // Sit or lie at a spot (world position, facing); getting up returns you to `standAt`.
  seatAt(pos, facing, pose, standAt) { this.mode = 'seat'; this.seat = { pose, standAt: standAt.slice() }; this.pos = pos.slice(); this.facing = facing; this.vel = [0, 0, 0]; }
  standUp() { if (this.mode !== 'seat') return; this.mode = 'walk'; this.pos = this.seat.standAt.slice(); this.vel = [0, 0, 0]; this.seat = null; }
  // Hit by something: thrown along (vx, vz), off your feet for a moment.
  // The water's surface here, if it's deep enough to swim. (Looked up every metre or so.)
  waterAt(x, z, ground) {
    const P = this.world.planet; if (!this._wp || Math.abs(x - this._wp[0]) > 1 || Math.abs(z - this._wp[1]) > 1) { const q = riverAt(P, x, z); this._wp = [x, z]; this._ry = q && q.d < q.hw ? q.y : null; }
    const lvl = Math.max(P.seaLevel, this._ry ?? -1e9); return lvl - ground > SWIM_DEPTH + 0.05 ? lvl : null;
  }
  feelAt(x, y, z) {         // (looked up afresh every metre or so, or when you've gone up or down)
    if (this.feel && this._fp && Math.abs(x - this._fp[0]) < 1 && Math.abs(z - this._fp[1]) < 1 && Math.abs(y - this._fp[2]) < 0.25) return this.feel;
    this._fp = [x, z, y]; return this.feel = underfoot(this.world.planet, x, z, y);
  }
  knock(vx, vz, up, stun) { if (this.mode !== 'walk') return; this.vel = [vx, up, vz]; this.grounded = false; this.pos[1] += 0.05; this.stun = stun; }
  // up onto `to` over the edge at E (on its lip, level with its top); n out of the face toward you (worked out if not given)
  mantleTo(to, dur, E = null, n = null) {
    if (!n) { const dx = this.pos[0] - to[0], dz = this.pos[2] - to[2], l = Math.hypot(dx, dz) || 1; n = [dx / l, 0, dz / l]; }
    if (!E) E = this.edgeToward(to, n);
    this.mode = 'mantle'; this.mantle = { from: this.pos.slice(), to, E, n, t: 0, dur, lead: Math.random() < 0.5 ? 'lf' : 'rf', key: (this._mk = (this._mk || 0) + 1) }; this.vel = [0, 0, 0];
  }
  // where the edge is, between here and `to`: the first place going that way where the ground is up near to's height
  edgeToward(to, n) {
    const w = this.world, [x, y, z] = this.pos, d = Math.hypot(to[0] - x, to[2] - z); let e = d;
    for (let s = 0; s <= d; s += 0.05) { const px = x - n[0] * s, pz = z - n[2] * s; if (w.groundAt(px, pz, to[1] + 0.3).h > to[1] - 0.25) { e = s; break; } }
    return [x - n[0] * e, to[1], z - n[2] * e];
  }
  // a vault: over what's ahead (its near edge at E, its top at `top`) to `to` on the far side, keeping your way and most of your speed
  vaultTo(to, E, top, n, speed, depth = 0.6) {
    const dist = Math.hypot(to[0] - this.pos[0], to[2] - this.pos[2]), sp = Math.max(4.2, speed), dur = Math.max(0.42, Math.min(0.75, dist / sp + 0.12 * Math.max(0, top - this.pos[1] - 0.6)));
    this.mode = 'vault'; this.vault = { from: this.pos.slice(), to, E, top, n, depth, t: 0, dur, sp, lead: Math.random() < 0.5 ? 'lf' : 'rf', key: (this._mk = (this._mk || 0) + 1) }; this.vel = [0, 0, 0];
  }
  // the moves the body makes over things, as IK targets (player/moves.js), or null
  get movePose() { return this.mode === 'mantle' ? this._mp : this.mode === 'vault' ? this._vp : null; }

  // input: { fwd, right, run, jump, yaw, tired } — yaw is the camera heading
  // (landed, jumped: what happened over the frame's steps; the game clears them once it's read them, frame())
  frame() { this.landed = 0; this.jumped = false; this.vaulted = false; this.slid = false; }
  step(dt, input, speedFactor = 1) {
    this.climbing = false;
    if (this.stun > 0) { this.stun -= dt; input = { ...input, fwd: 0, right: 0, run: false, jump: false }; }      // knocked over: no say in the matter
    if (this.mode === 'wall') return this.stepWall(dt, input);
    if (this.mode === 'mantle') return this.stepMantle(dt);
    if (this.mode === 'vault') return this.stepVault(dt);
    if (this.mode === 'ladder') return this.stepLadder(dt, input, speedFactor);
    if (this.mode === 'seat') { this.speed = 0; this.grounded = true; if (input.fwd || input.right || input.jump) this.standUp(); return; }
    const w = this.world;
    let [x, y, z] = this.pos;
    // what's underfoot: sand and bog drag at you; firm salt flat doesn't (gen/land.js)
    const F = w.planet && w.flora !== false && this.grounded && !this.where && !this.onRock && !this.swimming ? this.feelAt(x, y, z) : null; if (!F) this.feel = null;
    if (F) speedFactor *= F.speed;
    if (this.swimming) { speedFactor *= 0.42; input = { ...input, jump: false }; }
    // desired horizontal velocity in camera space
    let mx = input.right, mz = input.fwd;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    // a sprint is forward: off to the side or back you run, not sprint
    const sprint = input.run && !input.aim && !input.crouch && mz > 0.3;
    const sp = (sprint ? WALK + (RUN - WALK) * Math.min(1, mz * 1.2) : WALK) * speedFactor * (input.aim ? 0.72 : 1) * (input.crouch ? 0.5 : 1);      // (sighting down the gun you walk, and slower; crouched, slower still)
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    // forward = (sin yaw, cos yaw); screen-right = forward × up = (-cos yaw, sin yaw)
    const tx = (-mx * cy + mz * sy) * sp, tz = (mx * sy + mz * cy) * sp;
    // a body has weight: it takes a moment to get up to a sprint and to stop from one, and once off the ground there's little you can do about where you're going
    this.offT = this.grounded ? 0 : (this.offT || 0) + dt; this.landT = Math.max(0, (this.landT || 0) - dt);
    if (input.jump) this.jumpBuf = BUFFER; else this.jumpBuf = Math.max(0, (this.jumpBuf || 0) - dt);
    const cur = Math.hypot(this.vel[0], this.vel[2]), wantV = Math.hypot(tx, tz);
    const accel = this.slide ? 0 : this.grounded ? (wantV > cur + 0.1 ? 7 + (cur < 2 ? 5 : 0) : 13) * (this.landT > 0 ? 0.35 : 1) : 1.6;
    if (!this.slide) { this.vel[0] += (tx - this.vel[0]) * Math.min(1, accel * dt); this.vel[2] += (tz - this.vel[2]) * Math.min(1, accel * dt); }
    // you turn the way you go; with a gun up, the way you're looking (and you move sideways and back as you need to)
    const want = input.face ?? (ml > 0.01 ? Math.atan2(tx, tz) : null);
    if (want != null) {
      let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, (input.face != null ? 20 : 10) * dt);
    }
    // the slide: down at a full run, on along the ground on your hip, slowing (faster down a slope, slower up one); jump out of it, or stand
    if (input.slide && this.grounded && !this.slide && cur > SLIDE_MIN && !this.swimming) { const k = Math.min(8.6, cur + 1.2) / cur; this.vel[0] *= k; this.vel[2] *= k; this.slide = { t: 0 }; this.slid = true; }
    if (this.slide) {
      const S = this.slide; S.t += dt; const v = Math.hypot(this.vel[0], this.vel[2]) || 1e-6, ux = this.vel[0] / v, uz = this.vel[2] / v;
      const e = 0.6, ahead = w.groundAt(x + ux * e, z + uz * e, y + 0.6).h, down = (y - ahead) / e;      // (going downhill: + )
      let nv = v + (GRAVITY * 0.55 * Math.max(-0.6, Math.min(0.8, down)) - SLIDE_FRICTION - (S.t > 0.9 ? 4 : 0)) * dt;
      // a little say in it: the way you're looking bends it
      if (wantV > 0.1) { const a = Math.atan2(tx, tz) - Math.atan2(ux, uz), d = Math.atan2(Math.sin(a), Math.cos(a)), turn = Math.max(-1, Math.min(1, d)) * 1.2 * dt; const c = Math.cos(turn), sn = Math.sin(turn); const vx = ux * c + uz * sn, vz = -ux * sn + uz * c; this.vel[0] = vx * nv; this.vel[2] = vz * nv; }
      else { this.vel[0] = ux * nv; this.vel[2] = uz * nv; }
      this.facing = Math.atan2(this.vel[0], this.vel[2]);
      if (nv < 2.2 || !this.grounded || !input.crouch || S.t > 2.2) this.slide = null;
    }
    // the jump: pressed on the ground, or just after running off an edge, or just before you land (kept till you're down)
    const canJump = (this.grounded || (this.offT < COYOTE && !this.jumpedOff)) && !this.swimming;
    if (this.grounded) this.jumpedOff = false;
    if (canJump && this.jumpBuf > 0 && (input.jump || this.grounded)) {
      this.jumpBuf = 0;
      // into something low with a far side, at a run: over it
      const fwd = ml > 0.01 && (this.vel[0] * Math.sin(this.facing) + this.vel[2] * Math.cos(this.facing)) > 1.2;
      const V = fwd && cur > 2.4 && w.vaultAhead?.(x, y, z, this.facing);
      if (V) { this.vaultTo(V.to, V.E, V.top, V.n, cur, V.depth); this.vaulted = true; return; }
      // walking into something you could pull yourself onto: climb it instead of jumping
      const ledge = ml > 0.01 && w.ledgeAhead(x, y, z, this.facing);
      if (ledge) { const n = [-Math.sin(this.facing), 0, -Math.cos(this.facing)]; this.mantleTo([ledge.x, ledge.top, ledge.z], (0.34 + 0.26 * (ledge.top - y)) / speedFactor, null, n); return; }
      // a wall too high for that: start climbing it; a stone too tall for it: up its side
      if (ml > 0.01 && this.grabWall()) return;
      if (ml > 0.01 && this.grabRock()) return;
      // and off the ground: a jump carries the way you were going (a sprint's a long one), out of a slide as fast as you were sliding
      this.vel[1] = JUMP * (this.slide ? 0.9 : 1); this.grounded = false; this.jumped = true; this.jumpedOff = true; this.slide = null;
    }
    // in the air, Space held, going at an edge you've jumped up to: catch it and pull yourself up
    if (!this.grounded && !this.swimming && input.jumpHeld && ml > 0.01 && this.vel[1] < 2.2 && this.offT > 0.12) {
      const ledge = w.ledgeAhead(x, y, z, this.facing, 1.9);
      if (ledge && ledge.top - y > 0.3) { const n = [-Math.sin(this.facing), 0, -Math.cos(this.facing)]; this.mantleTo([ledge.x, ledge.top, ledge.z], (0.3 + 0.3 * Math.max(0, ledge.top - y)) / speedFactor, null, n); return; }
    }
    if (this.spin) {
      // in a spin ring (gen/rings.js): what holds you down is the floor turning under you. It pulls less the higher you are (nearer the axle),
      // and moving makes it lean: go with the turn and you're pressed down harder, rise and you drift against it (Coriolis).
      const S = this.spin, g = S.w2 * (S.R - (y - S.base)), vs = this.vel[0] * S.sdir[0] + this.vel[2] * S.sdir[1];
      this.vel[1] -= (g + 2 * S.omega * vs) * dt;
      const as = 2 * S.omega * this.vel[1] * dt; this.vel[0] += S.sdir[0] * as; this.vel[2] += S.sdir[1] * as;
    } else this.vel[1] -= GRAVITY * dt;

    // horizontal move + wall resolution
    const g0 = w.groundAt(x, z, y);
    let nx = x + this.vel[0] * dt, nz = z + this.vel[2] * dt;
    [nx, nz] = w.resolve(nx, nz, y, undefined, this.slide ? 1.0 : undefined, false, true);
    if (this.slide && Math.hypot(nx - x - this.vel[0] * dt, nz - z - this.vel[2] * dt) > Math.hypot(this.vel[0], this.vel[2]) * dt * 0.6 + 0.01) this.slide = null;      // (into something: it stops you)
    let g1 = w.groundAt(nx, nz, y + 1.2);         // (look a little higher: a steep slope rises fast)
    const run = Math.hypot(nx - x, nz - z);
    // raw terrain too steep to walk: scramble up it slowly, or not at all when exhausted
    const slope = run > 1e-5 && !g1.where && !g0.where ? (g1.h - g0.h) / run : 0;
    if (this.grounded && slope > MAX_SLOPE) {
      if (input.tired) { nx = x; nz = z; g1 = g0; this.vel[0] = this.vel[2] = 0; }
      else {
        const f = Math.max(0.08, Math.min(0.5, 0.5 * MAX_SLOPE / slope)) * Math.min(1, 3 / Math.max(3, Math.hypot(this.vel[0], this.vel[2])));      // (hands and feet up a face: no faster for having come at it running)
        nx = x + (nx - x) * f; nz = z + (nz - z) * f;
        g1 = w.groundAt(nx, nz, y + 1.2);
        this.climbing = true;
      }
    } else if (!g1.where && g1.h > y + 0.6 && this.grounded) g1 = w.groundAt(nx, nz, y);
    // a loose face runs under you: above its angle of repose you slide down it, and going up you lose half of every step
    if (F && F.loose > 0.02 && this.grounded && !g1.where && !g0.where && !g1.rock && !g0.rock) {
      const e = 0.7, gx = (w.groundAt(x + e, z, y + 3).h - w.groundAt(x - e, z, y + 3).h) / (2 * e), gz = (w.groundAt(x, z + e, y + 3).h - w.groundAt(x, z - e, y + 3).h) / (2 * e), gr = Math.hypot(gx, gz);
      const over = gr - REPOSE;
      if (over > 0) {
        const going = Math.hypot(nx - x, nz - z), up = going > 1e-5 ? ((nx - x) * gx + (nz - z) * gz) / going / gr : 0, slip = F.loose * Math.min(2.6, 0.7 + over * 7);
        if (up > 0) { const k = 1 - 0.55 * up * F.loose; nx = x + (nx - x) * k; nz = z + (nz - z) * k; }
        [nx, nz] = w.resolve(nx - gx / gr * slip * dt, nz - gz / gr * slip * dt, y, undefined, undefined, false, true);
        g1 = w.groundAt(nx, nz, y + 1.2); this.sliding = slip;
      } else this.sliding = 0;
    } else this.sliding = 0;
    x = nx; z = nz;

    // vertical
    y += this.vel[1] * dt;
    if (this.climbing) { y = Math.max(y, g1.h); this.vel[1] = 0; }
    const ceil = w.ceilingAt(x, z, this.pos[1]), hh = this.slide ? 1.0 : 1.8;
    if (y + hh > ceil && this.vel[1] > 0) { y = ceil - hh; this.vel[1] = 0; }
    const g = w.groundAt(x, z, Math.max(y, this.pos[1]));
    if (!this.grounded && input.jump && this.vel[1] > -16 && this.grabWall(true)) return;      // in the air, at a wall: catch it
    // deep water holds you up: you swim at the surface, and a fall into it is only a splash
    const wy = !g.where && w.planet ? this.waterAt(x, z, g.h) : null;
    if (wy !== null && y <= wy - SWIM_DEPTH + 0.02) { y += (wy - SWIM_DEPTH - y) * Math.min(1, 12 * dt); if (y < wy - SWIM_DEPTH - 1.2) y = wy - SWIM_DEPTH - 1.2; if (this.vel[1] < 0) this.vel[1] *= Math.exp(-dt * 9); if (this.vel[1] > -0.2) this.vel[1] = 0; this.grounded = true; this.swimming = true; }
    else if (y <= g.h) { this.swimming = false; if (!this.grounded && this.vel[1] < 0) { const v = -this.vel[1]; this.landed = Math.max(this.landed, v);
        // down hard, the legs take it: a moment before you're going again, and less of your speed kept the harder it was (a roll at a run keeps it: you go on)
        if (v > 4.5) { const keep = Math.max(0.35, 1 - (v - 4.5) * 0.09); this.vel[0] *= keep; this.vel[2] *= keep; this.landT = Math.min(0.5, (v - 4.5) * 0.06); } }
      y = g.h; this.vel[1] = 0; this.grounded = true; }
    else if (this.grounded && !this.swimming && this.vel[1] <= 0 && this.pos[1] - g.h < 0.55) { y = g.h; this.vel[1] = 0; } // follow stairs / slopes down
    else { if (this.swimming && wy !== null) { y = wy - SWIM_DEPTH; this.vel[1] = 0; this.grounded = true; } else { this.grounded = false; this.swimming = false; } }
    this.speed = Math.hypot(x - this.pos[0], z - this.pos[2]) / Math.max(dt, 1e-6);
    this.pos = [x, y, z];
    this.where = g.where; this.onRock = g.rock || null;
  }
  // up the side of a stone ahead too tall to pull yourself onto
  grabRock() {
    const q = this.world.rockAhead?.(this.pos[0], this.pos[1], this.pos[2], this.facing); if (!q) return false;
    const c = RockClimb.grab(this.world, q, this.pos); if (!c) return false;
    this.mode = 'wall'; this.wall = c; this.vel = [0, 0, 0]; this.slide = null; return true;
  }

  grabWall(moving = false) {
    const c = Climber.grab(this.world, this.pos[0], this.pos[1], this.pos[2], Math.sin(this.facing), Math.cos(this.facing), moving);
    if (!c) return false;
    this.mode = 'wall'; this.wall = c; this.vel = [0, 0, 0]; return true;
  }
  // Standing on a roof at its edge, looking out: lower yourself over it.
  climbDown() {
    const c = Climber.grabDown(this.world, this.pos[0], this.pos[1], this.pos[2], Math.sin(this.facing), Math.cos(this.facing));
    if (!c) return false;
    this.mode = 'wall'; this.wall = c; this.vel = [0, 0, 0]; return true;
  }
  stepWall(dt, input) {
    const w = this.wall; w.step(dt, input);
    this.climbing = w.effort >= 1; this.speed = 0; this.grounded = false; this.where = null;
    if (w.done) {
      this.mode = 'walk'; this.wall = null; this.pos = w.done.pos.slice(); this.facing = w.done.facing;
      if (w.done.kind === 'fall') { this.vel = w.done.vel.slice(); this.grounded = false; this.slipped = w.done.slipped; }
      else { this.vel = [0, 0, 0]; this.grounded = true; }
      return;
    }
    this.pos = w.feet; this.facing = w.facing;
  }
  // Up first, then over: hands on the edge, pull, swing a knee over.
  stepMantle(dt) {
    const m = this.mantle; m.t += dt;
    const f = Math.min(1, m.t / m.dur), P = mantlePose(m, f);
    this._mp = P.pose; this.pos = P.feet; this.facing = Math.atan2(-m.n[0], -m.n[2]);
    this.climbing = true; this.speed = 0; this.grounded = true;
    if (f >= 1) { this.mode = 'walk'; this._mp = null; this.pos = m.to.slice(); this.vel = [0, 0, 0]; const g = this.world.groundAt(m.to[0], m.to[2], m.to[1]); this.where = g.where; this.onRock = g.rock || null; }
  }
  stepVault(dt) {
    const v = this.vault; v.t += dt;
    const f = Math.min(1, v.t / v.dur), P = vaultPose(v, f);
    this._vp = P.pose; this.pos = P.feet; this.climbing = true; this.grounded = false; this.speed = v.sp;
    if (f >= 1) { this.mode = 'walk'; this._vp = null; this.pos = v.to.slice(); const fx = Math.sin(this.facing), fz = Math.cos(this.facing), k = v.sp * 0.88; this.vel = [fx * k, 0, fz * k]; this.grounded = true; const g = this.world.groundAt(v.to[0], v.to[2], v.to[1] + 0.3); this.where = g.where; this.onRock = g.rock || null; }
  }

  stepLadder(dt, input, speedFactor) {
    const l = this.ladder;
    this.climbing = Math.abs(input.fwd) > 0; this.speed = 0; this.grounded = true; this.facing = l.facing;
    if (input.jump) {                          // let go: drop off backwards
      this.mode = 'walk'; this.grounded = false;
      this.vel = [-Math.sin(l.facing) * 1.5, 0.5, -Math.cos(l.facing) * 1.5]; return;
    }
    let y = this.pos[1] + input.fwd * LADDER * speedFactor * dt * (input.tired && input.fwd > 0 ? 0.3 : 1);
    if (y >= l.head[1] - 0.2 && input.fwd > 0) { this.mantleTo(l.roof.slice(), 1.1 / speedFactor); return; }   // over the parapet onto the roof
    if (y <= l.foot[1] && input.fwd < 0) { this.mode = 'walk'; y = l.foot[1]; this.pos = [l.foot[0], y, l.foot[2]]; return; }
    this.pos = [l.head[0], Math.max(l.foot[1], Math.min(l.head[1] - 0.2, y)), l.head[2]];
    this.where = null;
  }
}
