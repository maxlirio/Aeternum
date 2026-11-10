// Third-person character motion: kinematic capsule with gravity, jumping, step-up,
// sticking to stairs/ramps on the way down, and climbing:
//   scramble — slopes too steep to walk can still be climbed, slowly, while you're not exhausted
//   mantle   — Space while walking into something 0.55–2.2 m high pulls you up onto it
//   ladder   — E at a ladder; W/S to climb, Space to let go; the top steps you onto the roof
//   seat     — sitting or lying at a furniture anchor; any move key gets you up
//   wall     — on a building's facade, hand over hand (player/climber.js)
// Every surface comes from the collision world's logical data, never from meshes.
import { underfoot } from '../gen/underfoot.js';
import { riverAt } from '../gen/rivers.js';
import { Climber } from './climber.js';
export const GRAVITY = 9.81;
const WALK = 3.0, RUN = 6.5, JUMP = 4.6, MAX_SLOPE = 1.1; // rise/run ≈ 48°
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
  mantleTo(to, dur) { this.mode = 'mantle'; this.mantle = { from: this.pos.slice(), to, t: 0, dur }; this.vel = [0, 0, 0]; }

  // input: { fwd, right, run, jump, yaw, tired } — yaw is the camera heading
  step(dt, input, speedFactor = 1) {
    this.climbing = false;
    if (this.stun > 0) { this.stun -= dt; input = { ...input, fwd: 0, right: 0, run: false, jump: false }; }      // knocked over: no say in the matter
    this.landed = 0;
    if (this.mode === 'wall') return this.stepWall(dt, input);
    if (this.mode === 'mantle') return this.stepMantle(dt);
    if (this.mode === 'ladder') return this.stepLadder(dt, input, speedFactor);
    if (this.mode === 'seat') { this.speed = 0; this.grounded = true; if (input.fwd || input.right || input.jump) this.standUp(); return; }
    const w = this.world;
    let [x, y, z] = this.pos;
    // what's underfoot: sand and bog drag at you; firm salt flat doesn't (gen/land.js)
    const F = w.planet && w.flora !== false && this.grounded && !this.where && !this.swimming ? this.feelAt(x, y, z) : null; if (!F) this.feel = null;
    if (F) speedFactor *= F.speed;
    if (this.swimming) { speedFactor *= 0.42; input = { ...input, jump: false }; }
    // desired horizontal velocity in camera space
    let mx = input.right, mz = input.fwd;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const sp = (input.run ? RUN : WALK) * speedFactor;
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    // forward = (sin yaw, cos yaw); screen-right = forward × up = (-cos yaw, sin yaw)
    const tx = (-mx * cy + mz * sy) * sp, tz = (mx * sy + mz * cy) * sp;
    const accel = this.grounded ? 12 : 2.5;
    this.vel[0] += (tx - this.vel[0]) * Math.min(1, accel * dt);
    this.vel[2] += (tz - this.vel[2]) * Math.min(1, accel * dt);
    if (ml > 0.01) {
      const want = Math.atan2(tx, tz);
      let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, 10 * dt);
    }
    if (this.grounded && input.jump) {
      // walking into something you could pull yourself onto: climb it instead of jumping
      const ledge = ml > 0.01 && w.ledgeAhead(x, y, z, this.facing);
      if (ledge) { this.mantleTo([ledge.x, ledge.top, ledge.z], (0.45 + 0.4 * (ledge.top - y)) / speedFactor); return; }
      // a wall too high for that: start climbing it
      if (ml > 0.01 && this.grabWall()) return;
      this.vel[1] = JUMP; this.grounded = false;
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
    [nx, nz] = w.resolve(nx, nz, y, undefined, undefined, false, true);
    let g1 = w.groundAt(nx, nz, y + 1.2);         // (look a little higher: a steep slope rises fast)
    const run = Math.hypot(nx - x, nz - z);
    // raw terrain too steep to walk: scramble up it slowly, or not at all when exhausted
    const slope = run > 1e-5 && !g1.where && !g0.where ? (g1.h - g0.h) / run : 0;
    if (this.grounded && slope > MAX_SLOPE) {
      if (input.tired) { nx = x; nz = z; g1 = g0; this.vel[0] = this.vel[2] = 0; }
      else {
        const f = Math.max(0.08, Math.min(0.5, 0.5 * MAX_SLOPE / slope));
        nx = x + (nx - x) * f; nz = z + (nz - z) * f;
        g1 = w.groundAt(nx, nz, y + 1.2);
        this.climbing = true;
      }
    } else if (!g1.where && g1.h > y + 0.6 && this.grounded) g1 = w.groundAt(nx, nz, y);
    // a loose face runs under you: above its angle of repose you slide down it, and going up you lose half of every step
    if (F && F.loose > 0.02 && this.grounded && !g1.where && !g0.where) {
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
    const ceil = w.ceilingAt(x, z, this.pos[1]);
    if (y + 1.8 > ceil && this.vel[1] > 0) { y = ceil - 1.8; this.vel[1] = 0; }
    const g = w.groundAt(x, z, Math.max(y, this.pos[1]));
    if (!this.grounded && input.jump && this.vel[1] > -16 && this.grabWall(true)) return;      // in the air, at a wall: catch it
    // deep water holds you up: you swim at the surface, and a fall into it is only a splash
    const wy = !g.where && w.planet ? this.waterAt(x, z, g.h) : null;
    if (wy !== null && y <= wy - SWIM_DEPTH + 0.02) { y += (wy - SWIM_DEPTH - y) * Math.min(1, 12 * dt); if (y < wy - SWIM_DEPTH - 1.2) y = wy - SWIM_DEPTH - 1.2; if (this.vel[1] < 0) this.vel[1] *= Math.exp(-dt * 9); if (this.vel[1] > -0.2) this.vel[1] = 0; this.grounded = true; this.swimming = true; }
    else if (y <= g.h) { this.swimming = false; if (!this.grounded && this.vel[1] < 0) this.landed = -this.vel[1]; y = g.h; this.vel[1] = 0; this.grounded = true; }
    else if (this.grounded && !this.swimming && this.vel[1] <= 0 && this.pos[1] - g.h < 0.55) { y = g.h; this.vel[1] = 0; } // follow stairs / slopes down
    else { if (this.swimming && wy !== null) { y = wy - SWIM_DEPTH; this.vel[1] = 0; this.grounded = true; } else { this.grounded = false; this.swimming = false; } }
    this.speed = Math.hypot(x - this.pos[0], z - this.pos[2]) / Math.max(dt, 1e-6);
    this.pos = [x, y, z];
    this.where = g.where;
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
    const f = Math.min(1, m.t / m.dur), up = Math.min(1, f / 0.65), over = Math.max(0, (f - 0.45) / 0.55);
    const e = v => v * v * (3 - 2 * v);
    this.pos = [m.from[0] + (m.to[0] - m.from[0]) * e(over), m.from[1] + (m.to[1] - m.from[1]) * e(up), m.from[2] + (m.to[2] - m.from[2]) * e(over)];
    this.climbing = true; this.speed = 0; this.grounded = true;
    if (f >= 1) { this.mode = 'walk'; this.pos = m.to.slice(); this.vel = [0, 0, 0]; this.where = this.world.groundAt(...[m.to[0], m.to[2]], m.to[1]).where; }
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
