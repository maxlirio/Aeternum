// Flying a ship in the atmosphere: an arcade VTOL. Thrust along the heading (W/S),
// lift (Space) and descent (C), yaw (A/D), boost (Shift). With no lift input it holds
// its altitude; sideways drift dies away. The ground (terrain, floors, the sea) and the
// town's walls stop it; touching down slowly on level ground lands it.
// State is plain numbers; the hull's size comes from the layout, never the model.
import { shipPlan } from '../gen/ships.js';

const THRUST = 16, BOOST = 2.6, BACK = 8, LIFT = 11, YAW = 0.9;
const TOP = 160, TOP_BOOST = 320, CEILING = 9000;
export const LAND_SPEED = 3, LAND_SINK = 4, LAND_LEVEL = 1.6;   // m/s across and down; worst height difference under the gear (m)

export class Flight {
  constructor(world, planet, sh, c, facing) {
    this.world = world; this.planet = planet; this.ship = sh;
    this.L = shipPlan(sh.model).layout;
    const F = this.L.flight || {};       // each hull handles differently
    this.F = { top: F.top ?? TOP, boost: F.boost ?? TOP_BOOST, thrust: F.thrust ?? THRUST, yaw: F.yaw ?? YAW, lift: F.lift ?? LIFT };
    this.pos = c.slice(); this.facing = facing; this.vel = [0, 0, 0];
    this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.onGround = true; this.impact = 0;
  }
  // the ground under the gear: four feet near the hull's corners
  feet(x, z, f = this.facing) {
    const fx = Math.sin(f), fz = Math.cos(f), rx = -Math.cos(f), rz = Math.sin(f), a = this.L.D * 0.32, b = this.L.W * 0.3;
    return [[a, b], [a, -b], [-a, b], [-a, -b]].map(([u, v]) => { const px = x + fx * u + rx * v, pz = z + fz * u + rz * v; return Math.max(this.world.groundAt(px, pz, this.pos[1] + 2).h, this.planet.seaLevel); });
  }
  step(dt, inp) {
    const input = { fwd: inp.fwd || 0, right: inp.right || 0, up: !!inp.up, down: !!inp.down, boost: !!inp.boost };
    const f = this.facing, fx = Math.sin(f), fz = Math.cos(f);
    // heading-relative velocity
    let fwd = this.vel[0] * fx + this.vel[2] * fz, side = this.vel[0] * -fz + this.vel[2] * fx;
    const top = input.boost ? this.F.boost : this.F.top, TH = this.F.thrust;
    if (input.fwd > 0) fwd += (fwd < top ? TH * (input.boost ? BOOST : 1) : -TH) * dt;
    else if (input.fwd < 0) fwd -= (fwd > -20 ? BACK : 0) * dt;
    fwd *= Math.exp(-dt * (input.fwd ? 0.02 : 0.25));       // coast down when you let go
    side *= Math.exp(-dt * 2.2);
    const want = -input.right * this.F.yaw / (1 + Math.abs(fwd) / 140);
    this.yawRate += (want - this.yawRate) * Math.min(1, dt * 3);
    if (!this.onGround || fwd > 0.5) this.facing += this.yawRate * dt;
    const nf = this.facing, nfx = Math.sin(nf), nfz = Math.cos(nf);
    this.vel[0] = nfx * fwd - nfz * side; this.vel[2] = nfz * fwd + nfx * side;
    // vertical: lift and descent; otherwise hold altitude
    if (input.up) this.vel[1] += this.F.lift * dt;
    else if (input.down) this.vel[1] -= this.F.lift * dt;
    else this.vel[1] *= Math.exp(-dt * 1.6);
    this.vel[1] = Math.max(-40, Math.min(40, this.vel[1]));
    let x = this.pos[0] + this.vel[0] * dt, y = this.pos[1] + this.vel[1] * dt, z = this.pos[2] + this.vel[2] * dt;
    // walls of the town: three circles along the hull
    let push = 0;
    for (const k of [-0.3, 0, 0.3]) {
      const cx = x + nfx * this.L.D * k, cz = z + nfz * this.L.D * k;
      const [rx, rz] = this.world.resolve(cx, cz, y, this.L.W * 0.45, this.L.H);
      if (rx !== cx || rz !== cz) { x += rx - cx; z += rz - cz; push = Math.max(push, Math.hypot(rx - cx, rz - cz)); }
    }
    this.impact = 0;
    if (push > 0.01 && Math.hypot(this.vel[0], this.vel[2]) > 3) { this.impact = Math.hypot(this.vel[0], this.vel[2]); this.vel[0] *= 0.2; this.vel[2] *= 0.2; }
    // the ground
    const g = Math.max(...this.feet(x, z, nf));
    if (y <= g) {
      if (this.vel[1] < -LAND_SINK * 2) this.impact = Math.max(this.impact, -this.vel[1]);
      if (g - y > 0.5 && this.speed > 15) this.impact = Math.max(this.impact, this.speed);   // flew into rising ground
      y = g; if (this.vel[1] < 0) this.vel[1] = 0;
      this.vel[0] *= Math.exp(-dt * 3); this.vel[2] *= Math.exp(-dt * 3);   // skids to a stop on its gear
    }
    y = Math.min(y, CEILING);
    this.onGround = y - g < 0.05;
    this.pos = [x, y, z];
    // how it sits (render only): nose down when thrusting, banks into turns
    const tp = this.onGround ? 0 : -Math.max(-0.25, Math.min(0.25, (input.fwd > 0 ? 0.08 : input.fwd < 0 ? -0.06 : 0) + this.vel[1] * 0.004));
    const tr = this.onGround ? 0 : Math.max(-0.6, Math.min(0.6, -this.yawRate * fwd * 0.012));
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 2); this.roll += (tr - this.roll) * Math.min(1, dt * 2);
  }
  get speed() { return Math.hypot(this.vel[0], this.vel[2]); }
  altitude() { return this.pos[1] - Math.max(this.world.groundAt(this.pos[0], this.pos[2], this.pos[1]).h, this.planet.seaLevel); }
  // Can it set down here, now? → null, or why not
  landingProblem() {
    if (!this.onGround) return 'not on the ground';
    if (this.speed > LAND_SPEED) return 'still moving';
    const ft = this.feet(this.pos[0], this.pos[2]);
    if (Math.max(...ft) - Math.min(...ft) > LAND_LEVEL) return 'the ground here isn\'t level enough';
    if (this.pos[1] <= this.planet.seaLevel + 0.01 && ft.every(h => h <= this.planet.seaLevel + 0.01)) return 'that\'s water';
    return null;
  }
}
