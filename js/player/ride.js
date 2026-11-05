// Riding a speeder: a repulsor bike that hovers a fixed height over whatever is under it —
// ground, floors, or water. W/S throttle and brake (then reverse), A/D steer, Shift boost.
// Everything it touches comes from the collision world's logical data (terrain height,
// walls, slabs), and its own size from SPEEDER: the model never matters.
import { typeOf } from '../gen/vehicles.js';

const BOOST = 1.4, REVERSE = 5, ACCEL = 7.5, BRAKE = 16, COAST = 0.35;
const TURN = 1.9, CLIMB = 0.75;           // steer rate (rad/s at low speed); steepest rise it will take


export class Ride {
  constructor(world, planet, v) {
    this.world = world; this.planet = planet; this.v = v; this.T = typeOf(v);
    this.pos = v.pos.slice(); this.facing = v.facing;
    this.speed = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.pos[1] = v.fly ? Math.max(this.pos[1], this.ground(this.pos[0], this.pos[2], this.pos[1] + 1)) : this.ground(this.pos[0], this.pos[2], this.pos[1] + 1);
    this.impact = 0;                       // last collision speed (m/s), for the caller to react to
    this.slide = [0, 0]; this.stun = 0; this.pitchV = 0; this.rollV = 0; this.crash = null; this.dead = false;     // what's left of a crash: sliding, spinning, not answering the wheel
  }
  // Struck by, or into, something: n is the way it pushes us (unit, world, x-z), e how much bounces back. Records the crash for the caller.
  collide(nx, nz, e, massRatio = 1, otherV = [0, 0], lever = 0, lat = 0, y = 0.5) {
    const f = this.facing, fx = Math.sin(f), fz = Math.cos(f), vx = fx * this.speed + this.slide[0] - otherV[0], vz = fz * this.speed + this.slide[1] - otherV[1], vn = vx * nx + vz * nz;
    if (vn >= -0.4) return 0;
    const dv = -(1 + e) * vn * massRatio, tang = 0.2 * dv, tx = -nz, tz = nx, vt = vx * tx + vz * tz, ax = vx + nx * dv - tx * Math.sign(vt) * Math.min(Math.abs(vt), tang), az = vz + nz * dv - tz * Math.sign(vt) * Math.min(Math.abs(vt), tang);
    const wx = ax + otherV[0], wz = az + otherV[1];
    this.speed = wx * fx + wz * fz; this.slide = [wx - fx * this.speed, wz - fz * this.speed];
    // it turns about where it was hit: the harder and the further off-centre, the more it spins; a hard front hit dips the nose and lifts the tail
    const torque = (lever * (nx * fz * -1 + nz * fx) + lat * (nx * fx + nz * fz)) * dv;
    this.yawRate += Math.max(-5, Math.min(5, torque * 2.4 / Math.max(1, this.T.L)));
    this.stun = Math.max(this.stun, Math.min(2.6, dv * 0.09));
    const heavy = dv > 12;
    this.pitchV += (lever > 0 ? -1 : 1) * dv * (heavy ? 0.075 : 0.03) * Math.min(1, 3.5 / this.T.L); this.rollV += lat * dv * 0.14 + (heavy ? (Math.random() - 0.5) * (dv - 12) * 0.32 : 0);
    if (heavy && !this.v.fly) this.vy = Math.max(this.vy, Math.min(7, (dv - 12) * 0.32));
    this.pos[1] += heavy ? 0.04 : 0;
    this.impact = Math.max(this.impact, dv);
    const lp = [lever * this.T.L * 0.5, this.T.H * y, lat * this.T.W * 0.5], c = this.crash; if (!c || dv > c.dv) this.crash = { dv, at: lp, dir: [-(nx * fx + nz * fz), 0, -(-nx * fz + nz * fx)], nx, nz };
    return dv;
  }
  // What it floats over at (x, z): the highest surface within reach below `near`, or the sea.
  ground(x, z, near) { return Math.max(this.world.groundAt(x, z, near).h, this.planet.seaLevel); }

  // input: { fwd, right, boost }
  step(dt, input) {
    if (this.dead) input = { fwd: 0, right: 0, boost: false, up: false, down: false };
    else if (this.stun > 0) { this.stun = Math.max(0, this.stun - dt); input = { ...input, right: input.right * 0.15, fwd: input.fwd * 0.2 }; }
    const f = this.facing, fx = Math.sin(f), fz = Math.cos(f), half = this.T.L / 2;
    // throttle, brake, reverse
    const top = this.T.top * (input.boost ? BOOST : 1) * (this.v.fly ? 1.6 : 1);
    if (input.fwd > 0) this.speed += (this.speed < top ? ACCEL * (input.boost ? 1.5 : 1) : -COAST * 4) * dt * input.fwd;
    else if (input.fwd < 0) this.speed += (this.speed > 0.3 ? -BRAKE : this.speed > -REVERSE ? -ACCEL * 0.6 : 0) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (COAST + 0.012 * this.speed * this.speed) * dt);
    // steering: screen-right turns the heading clockwise; tighter when slow
    const want = -input.right * TURN / (1 + Math.abs(this.speed) / 14) * (this.speed < -0.2 ? -1 : 1) * Math.min(1, 0.3 + Math.abs(this.speed) / 3);
    this.yawRate += (want - this.yawRate) * Math.min(1, dt * (this.stun > 0 || this.dead ? 1.1 : 6));      // (spinning from a hit, it takes a while to answer)
    this.facing += this.yawRate * dt;
    // the slope ahead slows it; too steep stops it
    const y = this.pos[1];
    const gF = this.ground(this.pos[0] + fx * half, this.pos[2] + fz * half, y + 1.2), gB = this.ground(this.pos[0] - fx * half, this.pos[2] - fz * half, y + 1.2);
    const grade = (gF - gB) / this.T.L * Math.sign(this.speed || 1);
    if (grade > CLIMB && this.speed > 0) this.speed = Math.max(0, this.speed - 30 * dt);
    else this.speed -= 9.81 * Math.max(-0.3, Math.min(0.6, grade)) * 0.5 * dt * Math.sign(this.speed);
    // move, then push out of walls (front and back circles)
    const scrape = this.dead && !this.v.fly ? 7 : 0;       // no lift: it's dragging on the ground
    if (scrape) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), scrape * dt);
    const sk = Math.exp(-dt * (this.dead ? 2.4 : 1.6)); this.slide[0] *= sk; this.slide[1] *= sk;
    let x = this.pos[0] + (Math.sin(this.facing) * this.speed + this.slide[0]) * dt, z = this.pos[2] + (Math.cos(this.facing) * this.speed + this.slide[1]) * dt;
    const R = Math.max(0.5, this.T.W * 0.55), nfx = Math.sin(this.facing), nfz = Math.cos(this.facing), off = Math.max(0, half - R);
    this.impact = 0;
    for (const s of [1, -1]) {
      const cx = x + nfx * off * s, cz = z + nfz * off * s;
      const [rx, rz] = this.world.resolve(cx, cz, y + 0.25, R, Math.min(this.T.H, 1.6));
      if (rx !== cx || rz !== cz) {
        const px = rx - cx, pz = rz - cz, pl = Math.hypot(px, pz) || 1, nx = px / pl, nz = pz / pl; x += px; z += pz;
        // where on the body: nose, tail or a flank, from the way it was pushed
        const along = nx * nfx + nz * nfz, across = nx * -nfz + nz * nfx;
        this.collide(nx, nz, 0.2, 1, [0, 0], s * Math.min(1, Math.abs(along) + 0.5), -Math.sign(across) * Math.min(1, Math.abs(across) * 1.2));
      }
    }
    if (this.v.fly) {         // a sky car: holds its height; Space and Q take it up and down; the ground only stops it
      const ground = this.ground(x, z, y + 1.2), want = (input.up ? 9 : 0) - (input.down ? 11 : 0);
      if (this.dead) this.vy -= 9.81 * dt;                              // no lift: it falls
      else this.vy += (want - this.vy) * Math.min(1, dt * 3);
      let ny = y + this.vy * dt;
      if (ny < ground) {
        ny = ground; const sink = -this.vy; this.vy = sink > 3 ? sink * 0.2 : Math.max(0, this.vy);
        if (sink > 4) { this.impact = Math.max(this.impact, sink); const c = this.crash; if (!c || sink > c.dv) this.crash = { dv: sink, at: [0, 0, 0], ground: true, nx: 0, nz: 0 }; this.stun = Math.max(this.stun, Math.min(2.6, sink * 0.07)); this.pitchV += (Math.random() - 0.5) * sink * 0.08; this.rollV += (Math.random() - 0.5) * sink * 0.1; }
        if (this.dead) { const hs = Math.exp(-dt * 2.2); this.speed *= hs; }
      }
      this.pos = [x, ny, z]; this.tumble(dt, -this.vy * 0.03, Math.max(-0.5, Math.min(0.5, -this.yawRate * Math.abs(this.speed) * 0.035)), 4, ny <= ground + 0.05);
      return;
    }
    // hover: spring up to the surface below; fall freely off crests
    const g = Math.max(this.ground(x, z, y + 1.2), this.ground(x + nfx * half * 0.8, z + nfz * half * 0.8, y + 1.2) - 0.25, this.ground(x - nfx * half * 0.8, z - nfz * half * 0.8, y + 1.2) - 0.25);
    let ny = y;
    if (ny < g) { ny = g + (ny - g) * Math.exp(-dt * 18); this.vy = Math.max(this.vy, 0); ny = Math.max(ny, g - 0.05); }
    else { this.vy -= 9.81 * dt; ny += this.vy * dt; if (ny <= g) { ny = g; const sink = -this.vy; this.vy = sink > 5 ? sink * 0.18 : 0; if (sink > 8) { this.impact = Math.max(this.impact, sink); const c = this.crash; if (!c || sink > c.dv) this.crash = { dv: sink, at: [0, 0, 0], ground: true, nx: 0, nz: 0 }; this.stun = Math.max(this.stun, Math.min(2.6, sink * 0.07)); } } }
    this.pos = [x, ny, z];
    // how it sits (render only): nose follows the ground, leans into turns
    const tp = Math.atan2(gF - gB, this.T.L), tr = -this.yawRate * Math.abs(this.speed) * 0.035;
    this.tumble(dt, tp, Math.max(-0.5, Math.min(0.5, tr)), 6, ny <= g + 0.2);
  }
  // How it sits: springs to the ground's lie, unless a crash has set it turning over. It may end on its side or its roof.
  tumble(dt, wantP, wantR, stiff, onGround) {
    this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
    const k = Math.exp(-dt * (onGround ? 3.2 : 0.7)); this.pitchV *= k; this.rollV *= k;
    const rest = Math.round(this.roll / (Math.PI / 2)) * (Math.PI / 2), flipped = Math.abs(rest) > 0.1 && Math.abs(this.rollV) < 1.2;
    const wr = flipped ? rest : wantR, sp = this.dead && !onGround ? 0 : Math.min(1, dt * stiff) * (Math.abs(this.pitchV) + Math.abs(this.rollV) > 1.2 ? 0.15 : 1);
    this.pitch += (wantP - this.pitch) * sp; this.roll += (wr - this.roll) * sp;
    this.onSide = flipped;
  }
  // Where the rider gets off: beside the bike (right side, else left), clear of walls.
  dismountSpot() {
    const f = this.facing;
    for (const s of [1, -1]) {
      const x = this.pos[0] - Math.cos(f) * (this.T.W / 2 + 0.6) * s, z = this.pos[2] + Math.sin(f) * (this.T.W / 2 + 0.6) * s;
      const [rx, rz] = this.world.resolve(x, z, this.pos[1]);
      if (Math.hypot(rx - x, rz - z) < 0.05) return [rx, this.world.groundAt(rx, rz, this.pos[1] + 0.6).h, rz];
    }
    return [this.pos[0], this.world.groundAt(this.pos[0], this.pos[2], this.pos[1] + 0.6).h, this.pos[2]];
  }
}
