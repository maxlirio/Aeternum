// Flying a ship in the atmosphere — a real flight model, kept playable.
//   Throttle: set it (W/S) and it stays; Shift is the afterburner.
//   Stick: pitch and roll (mouse, or the arrow keys); rudder on A/D.
//   Wings: lift = ½ρV²·S·CL(α). CL rises with angle of attack up to the critical angle
//   (~15°), then the wing STALLS: lift collapses, drag soars, the nose drops and a wing
//   drops with it. You stall by flying too slowly, or by pulling too hard at any speed.
//   Lift thrusters (VTOL): hover, take off and land vertically. Strong at a standstill,
//   they fade out between ~25 and ~70 m/s as the engines swing aft, so fast flight is
//   wing-borne and the stall is real. (Fighters have weak ones: they want a runway.)
//   Flight assist (X, on by default): levels the wings when you let go, damps the rates,
//   coordinates turns, and in a hover holds your height (Space up, Q down). Off, Space
//   is raw thruster power and nothing catches you.
// Plain numbers throughout; the hull's size comes from its layout, never the model.
import { shipPlan } from '../gen/ships.js';

export const LAND_SPEED = 3, LAND_SINK = 4, LAND_LEVEL = 1.6;   // m/s across and down; worst height difference under the gear (m)
const G = 9.81, RHO = 1.15, CEILING = 12000;
const A_CRIT = 0.27, CL_A = 4.6, CL_MAX = CL_A * A_CRIT;          // stalls past ~15.5°, CLmax ≈ 1.24
const STALL_TAU = 0.3;

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const u = [q[0], q[1], q[2]], t = cross(u, v).map(x => x * 2); return add(add(v, t, q[3]), cross(u, t)); };
const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
const qnorm = q => { const l = Math.hypot(...q); return q.map(x => x / l); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// heading f, pitch p (nose up +), roll r (right wing down +) → quaternion Ry(f)·Rx(−p)·Rz(r), as the renderer draws it
export function fromEuler(f, p, r) { return qmul(qmul(qaxis([0, 1, 0], f), qaxis([1, 0, 0], -p)), qaxis([0, 0, 1], r)); }

export class Flight {
  constructor(world, planet, sh, c, facing) {
    this.world = world; this.planet = planet; this.ship = sh;
    this.L = shipPlan(sh.model).layout;
    const L = this.L, F = L.flight || {};
    const top = F.top ?? 160, acc = F.thrust ?? 16;
    this.mass = Math.round(55 * L.W * L.D * L.H);
    this.vs = F.stall ?? clamp(top * 0.24, 28, 60);                       // clean stall speed (m/s)
    this.S = 2 * this.mass * G / (RHO * this.vs * this.vs * CL_MAX);      // the wing area that gives it
    this.tw = F.tw ?? clamp(acc / 42, 0.22, 0.9);                         // thrust-to-weight: transports ~0.3, fighters ~1.1
    this.thrustMax = this.mass * G * this.tw;
    this.cd0 = 2 * this.thrustMax / (RHO * top * top * this.S);           // full dry thrust holds `top`
    this.k = 0.055;
    this.hoverMax = this.mass * G * (F.vtol ?? 1.45);
    this.agility = clamp(F.yaw ?? 0.9, 0.4, 2.4);
    this.top = top;
    this.pos = c.slice(); this.vel = [0, 0, 0]; this.q = fromEuler(facing, 0, 0); this.w = [0, 0, 0];
    this.throttle = 0; this.hover = 0; this.assist = true; this.stall = 0; this.aoa = 0; this.slip = 0; this.wobble = 0;
    this.onGround = true; this.impact = 0; this.gload = 1;
    this.syncEuler();
  }
  get fwd() { return qrot(this.q, [0, 0, 1]); }
  get up() { return qrot(this.q, [0, 1, 0]); }
  get left() { return qrot(this.q, [1, 0, 0]); }
  syncEuler() {
    const f = this.fwd, X = this.left, Y = this.up;
    this.facing = Math.atan2(f[0], f[2]); this.pitch = Math.asin(clamp(f[1], -1, 1)); this.roll = Math.atan2(X[1], Y[1]);
  }
  feet(x, z, f = this.facing) {
    const fx = Math.sin(f), fz = Math.cos(f), rx = -Math.cos(f), rz = Math.sin(f), a = this.L.D * 0.32, b = this.L.W * 0.3;
    return [[a, b], [a, -b], [-a, b], [-a, -b]].map(([u, v]) => { const px = x + fx * u + rx * v, pz = z + fz * u + rz * v; return Math.max(this.world.groundAt(px, pz, this.pos[1] + 2).h, this.planet.seaLevel); });
  }
  // input: { throttle: −1..1 (rate of change), pitch, roll, yaw: −1..1, up, down, boost, brake, wind: [x, z] }
  step(dt, inp = {}) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    this.impact = 0;
    for (let i = 0; i < n; i++) this.sub(dt / n, inp);
    this.syncEuler();
  }
  sub(dt, inp) {
    const m = this.mass, F = this.fwd, U = this.up, X = this.left;
    const wind = inp.wind ? [inp.wind[0], 0, inp.wind[1]] : [0, 0, 0];
    this.throttle = clamp(this.throttle + (inp.throttle || 0) * dt * 0.45, 0, 1);
    const burner = !!inp.boost && this.throttle > 0.95;
    const va = add(this.vel, wind, -1), V = len(va), vh = V > 0.5 ? norm(va) : F;
    const vf = dot(va, F), vu = dot(va, U), vl = dot(va, X);
    const aoa = V > 2 ? Math.atan2(-vu, Math.max(0.1, vf)) : 0, slip = V > 2 ? Math.asin(clamp(vl / V, -1, 1)) : 0;
    this.aoa = aoa; this.slip = slip;
    const over = Math.abs(aoa) > A_CRIT && vf > this.vs * 0.45 && !this.onGround;   // (only with real airflow over the wing)
    this.stall += ((over ? 1 : 0) - this.stall) * Math.min(1, dt / STALL_TAU);
    const attached = CL_A * clamp(aoa, -A_CRIT, A_CRIT);
    const separated = Math.sign(aoa) * 0.7 * Math.abs(Math.sin(2 * aoa));
    const CL = attached * (1 - this.stall) + separated * this.stall;
    const CD = this.cd0 + this.k * CL * CL + 1.2 * this.stall * Math.sin(aoa) ** 2 + 0.4 * Math.abs(Math.sin(slip));
    const qd = 0.5 * RHO * V * V, aero = Math.min(1, Math.max(0, vf) / this.vs) ** 2;
    let force = [0, -m * G, 0];
    if (V > 0.5) {
      const liftDir = norm(add(U, vh, -dot(U, vh)));
      force = add(force, liftDir, qd * this.S * CL);
      force = add(force, vh, -qd * this.S * CD);
      force = add(force, X, -qd * this.S * 0.9 * Math.sin(slip));
    }
    force = add(force, F, this.thrustMax * this.throttle * (burner ? 1.9 : 1));
    const fade = 1 - clamp((V - 25) / 45, 0, 1);
    let h;
    if (this.assist) {
      const agl = this.pos[1] - Math.max(this.world.groundAt(this.pos[0], this.pos[2], this.pos[1]).h, this.planet.seaLevel);
      const want = inp.up ? 10 : inp.down ? -Math.min(8, 0.6 + agl * 0.35) : 0, uy = Math.max(0.2, U[1]);   // a hover descent flares near the ground
      const need = m * (G + 2.2 * (want - this.vel[1])) - (force[1] + m * G);
      h = this.onGround && !inp.up ? 0 : clamp(need / (this.hoverMax * uy), 0, 1);
    } else h = inp.up ? 1 : 0;
    this.hover += (h * fade - this.hover) * Math.min(1, dt * 5);
    force = add(force, U, this.hoverMax * this.hover);
    if (this.assist && V < this.vs && this.throttle < 0.15 && !this.onGround) {   // assist in a hover: RCS jets kill the drift
      force = add(force, [this.vel[0], 0, this.vel[2]], -m * 0.8 * (1 - aero));
    }
        this.gload = dot(add(force, [0, m * G, 0]), U) / (m * G);
    this.vel = add(this.vel, force, dt / m);
    // rotation: the stick commands a rate; authority from the air, plus a little from RCS jets
    const auth = 0.3 + 0.7 * aero * (1 - 0.6 * this.stall), A = this.agility, resp = 4 * auth;
    let p = dot(this.w, F), qr = -dot(this.w, X), r = -dot(this.w, U);         // roll right, nose up, yaw right
    const sp = inp.pitch || 0, sr = inp.roll || 0, sy = inp.yaw || 0;
    if (sr || this.assist) p += (sr * 2.4 * A + (this.assist && !sr ? -this.roll * 1.6 : 0) - p) * Math.min(1, dt * resp);
    const hoverHold = this.assist && !sp && V < this.vs * 1.1 ? -this.pitch * 1.5 * (1 - aero) : 0;   // assist in a hover: hold the nose level
    if (sp || this.assist) qr += (sp * 1.1 * A + hoverHold - qr) * Math.min(1, dt * resp);
    if (sy || this.assist) r += (sy * 0.6 * A + (this.assist ? -slip * 2 : 0) - r) * Math.min(1, dt * resp);
    qr += -aoa * 3.2 * aero * dt * (1 + 2.5 * this.stall);                    // noses into the airflow
    r += slip * 2.2 * aero * dt;
    if (this.stall > 0.05) { qr -= Math.sign(aoa) * 1.4 * this.stall * dt; this.wobble += dt * 2.3; p += Math.sin(this.wobble) * 3 * this.stall * dt; }   // the nose drops; a wing goes
    if (!this.assist) { p *= 1 - 0.25 * aero * dt; qr *= 1 - 0.9 * aero * dt; r *= 1 - 0.6 * aero * dt; }
    if (this.onGround) { p = -this.roll * 4; qr = Math.max(qr, -this.pitch * 3); if (this.pitch > 0.3) qr = Math.min(qr, 0); r = sy * 0.5 * Math.min(1, 0.4 + this.speed / 6); }
    this.w = add(add(F.map(x => x * p), X, -qr), U, -r);
    const wl = len(this.w);
    if (wl > 1e-6) this.q = qnorm(qmul(qaxis(this.w.map(x => x / wl), wl * dt), this.q));
    // move; the town's walls are in the way
    let [x, y, z] = add(this.pos, this.vel, dt);
    const nf = this.fwd, hl = Math.hypot(nf[0], nf[2]) || 1, hx = nf[0] / hl, hz = nf[2] / hl;
    let push = 0;
    for (const k of [-0.3, 0, 0.3]) {
      const cx = x + hx * this.L.D * k, cz = z + hz * this.L.D * k;
      const [rx, rz] = this.world.resolve(cx, cz, y, this.L.W * 0.45, this.L.H);
      if (rx !== cx || rz !== cz) { x += rx - cx; z += rz - cz; push = Math.max(push, Math.hypot(rx - cx, rz - cz)); }
    }
    if (push > 0.01 && Math.hypot(this.vel[0], this.vel[2]) > 3) { this.impact = Math.max(this.impact, Math.hypot(this.vel[0], this.vel[2])); this.vel[0] *= 0.2; this.vel[2] *= 0.2; }
    // the ground: gear takes a gentle touchdown; hard, steep or banked is a crash
    const g = Math.max(...this.feet(x, z, Math.atan2(hx, hz)));
    if (y <= g) {
      const sink = -this.vel[1], hspd = Math.hypot(this.vel[0], this.vel[2]);
      if (!this.onGround && (sink > LAND_SINK * 2 || Math.abs(this.roll) > 0.45 || this.pitch < -0.25)) this.impact = Math.max(this.impact, sink + hspd * 0.3);
      if (g - y > 0.5 && hspd > 15) this.impact = Math.max(this.impact, hspd);
      y = g; if (this.vel[1] < 0) this.vel[1] = 0;
      const fr = (inp.brake ? 6 : 0.6) + (this.throttle < 0.05 ? 3 : 0), k = Math.max(0, 1 - fr * dt / Math.max(hspd, 0.01));
      this.vel[0] *= k; this.vel[2] *= k;
      // on its gear it rolls the way it points
      const along = this.vel[0] * hx + this.vel[2] * hz; this.vel[0] = hx * along; this.vel[2] = hz * along;
      this.onGround = true;
    } else this.onGround = y - g < 0.05 && this.vel[1] <= 0.5;
    this.pos = [x, Math.min(y, CEILING), z];
  }
  get speed() { return Math.hypot(this.vel[0], this.vel[2]); }
  get airspeed() { return len(this.vel); }
  get stalled() { return this.stall > 0.5; }
  get vs_() { return this.vel[1]; }
  altitude() { return this.pos[1] - Math.max(this.world.groundAt(this.pos[0], this.pos[2], this.pos[1]).h, this.planet.seaLevel); }
  landingProblem() {
    if (!this.onGround) return 'not on the ground';
    if (this.speed > LAND_SPEED) return 'still moving';
    const ft = this.feet(this.pos[0], this.pos[2]);
    if (Math.max(...ft) - Math.min(...ft) > LAND_LEVEL) return 'the ground here isn\'t level enough';
    if (this.pos[1] <= this.planet.seaLevel + 0.01 && ft.every(h => h <= this.planet.seaLevel + 0.01)) return 'that\'s water';
    return null;
  }
}
