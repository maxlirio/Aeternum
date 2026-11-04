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
    this.pos[1] = this.ground(this.pos[0], this.pos[2], this.pos[1] + 1);
    this.impact = 0;                       // last collision speed (m/s), for the caller to react to
  }
  // What it floats over at (x, z): the highest surface within reach below `near`, or the sea.
  ground(x, z, near) { return Math.max(this.world.groundAt(x, z, near).h, this.planet.seaLevel); }

  // input: { fwd, right, boost }
  step(dt, input) {
    const f = this.facing, fx = Math.sin(f), fz = Math.cos(f), half = this.T.L / 2;
    // throttle, brake, reverse
    const top = this.T.top * (input.boost ? BOOST : 1);
    if (input.fwd > 0) this.speed += (this.speed < top ? ACCEL * (input.boost ? 1.5 : 1) : -COAST * 4) * dt * input.fwd;
    else if (input.fwd < 0) this.speed += (this.speed > 0.3 ? -BRAKE : this.speed > -REVERSE ? -ACCEL * 0.6 : 0) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (COAST + 0.012 * this.speed * this.speed) * dt);
    // steering: screen-right turns the heading clockwise; tighter when slow
    const want = -input.right * TURN / (1 + Math.abs(this.speed) / 14) * (this.speed < -0.2 ? -1 : 1) * Math.min(1, 0.3 + Math.abs(this.speed) / 3);
    this.yawRate += (want - this.yawRate) * Math.min(1, dt * 6);
    this.facing += this.yawRate * dt;
    // the slope ahead slows it; too steep stops it
    const y = this.pos[1];
    const gF = this.ground(this.pos[0] + fx * half, this.pos[2] + fz * half, y + 1.2), gB = this.ground(this.pos[0] - fx * half, this.pos[2] - fz * half, y + 1.2);
    const grade = (gF - gB) / this.T.L * Math.sign(this.speed || 1);
    if (grade > CLIMB && this.speed > 0) this.speed = Math.max(0, this.speed - 30 * dt);
    else this.speed -= 9.81 * Math.max(-0.3, Math.min(0.6, grade)) * 0.5 * dt * Math.sign(this.speed);
    // move, then push out of walls (front and back circles)
    let x = this.pos[0] + Math.sin(this.facing) * this.speed * dt, z = this.pos[2] + Math.cos(this.facing) * this.speed * dt;
    const R = Math.max(0.5, this.T.W * 0.55), nfx = Math.sin(this.facing), nfz = Math.cos(this.facing), off = Math.max(0, half - R);
    let push = 0;
    for (const s of [1, -1]) {
      const cx = x + nfx * off * s, cz = z + nfz * off * s;
      const [rx, rz] = this.world.resolve(cx, cz, y + 0.25, R, Math.min(this.T.H, 1.6));
      if (rx !== cx || rz !== cz) { x += rx - cx; z += rz - cz; push = Math.max(push, Math.hypot(rx - cx, rz - cz)); }
    }
    this.impact = 0;
    if (push > 0.002 && Math.abs(this.speed) > 1) { this.impact = Math.abs(this.speed); this.speed *= 0.25; }
    // hover: spring up to the surface below; fall freely off crests
    const g = Math.max(this.ground(x, z, y + 1.2), this.ground(x + nfx * half * 0.8, z + nfz * half * 0.8, y + 1.2) - 0.25, this.ground(x - nfx * half * 0.8, z - nfz * half * 0.8, y + 1.2) - 0.25);
    let ny = y;
    if (ny < g) { ny = g + (ny - g) * Math.exp(-dt * 18); this.vy = Math.max(this.vy, 0); ny = Math.max(ny, g - 0.05); }
    else { this.vy -= 9.81 * dt; ny += this.vy * dt; if (ny <= g) { ny = g; this.vy = 0; } }
    this.pos = [x, ny, z];
    // how it sits (render only): nose follows the ground, leans into turns
    const tp = Math.atan2(gF - gB, this.T.L), tr = -this.yawRate * Math.abs(this.speed) * 0.035;
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 6); this.roll += (Math.max(-0.5, Math.min(0.5, tr)) - this.roll) * Math.min(1, dt * 5);
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
