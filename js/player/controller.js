// Third-person character motion: kinematic capsule with gravity, jumping, step-up,
// sticking to stairs/ramps on the way down, and a slope limit on raw terrain.
export const GRAVITY = 9.81;
const WALK = 1.9, RUN = 5.4, JUMP = 4.6, MAX_SLOPE = 1.1; // rise/run ≈ 48°

export class Controller {
  constructor(world, pos) {
    this.world = world;
    this.pos = pos.slice();
    this.vel = [0, 0, 0];
    this.grounded = false;
    this.facing = 0;            // radians, 0 = +z
    this.speed = 0;
  }
  // input: { fwd, right, run, jump, yaw } — yaw is the camera heading
  step(dt, input, speedFactor = 1) {
    const w = this.world;
    let [x, y, z] = this.pos;
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
    if (this.grounded && input.jump) { this.vel[1] = JUMP; this.grounded = false; }
    this.vel[1] -= GRAVITY * dt;

    // horizontal move + wall resolution
    const g0 = w.groundAt(x, z, y);
    let nx = x + this.vel[0] * dt, nz = z + this.vel[2] * dt;
    [nx, nz] = w.resolve(nx, nz, y);
    let g1 = w.groundAt(nx, nz, y);
    const run = Math.hypot(nx - x, nz - z);
    // raw-terrain slope limit (building surfaces are always walkable)
    if (this.grounded && !g1.where && !g0.where && run > 1e-5 && (g1.h - g0.h) / run > MAX_SLOPE) { nx = x; nz = z; g1 = g0; this.vel[0] = this.vel[2] = 0; }
    x = nx; z = nz;

    // vertical
    y += this.vel[1] * dt;
    const ceil = w.ceilingAt(x, z, this.pos[1]);
    if (y + 1.8 > ceil && this.vel[1] > 0) { y = ceil - 1.8; this.vel[1] = 0; }
    const g = w.groundAt(x, z, Math.max(y, this.pos[1]));
    if (y <= g.h) { y = g.h; this.vel[1] = 0; this.grounded = true; }
    else if (this.grounded && this.vel[1] <= 0 && this.pos[1] - g.h < 0.55) { y = g.h; this.vel[1] = 0; } // follow stairs / slopes down
    else this.grounded = false;
    this.speed = Math.hypot(x - this.pos[0], z - this.pos[2]) / Math.max(dt, 1e-6);
    this.pos = [x, y, z];
    this.where = g.where;
  }
}
