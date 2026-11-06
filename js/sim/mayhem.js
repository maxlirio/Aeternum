// What you can do to the city, and what it does back. No three.js: reads logical data only.
//   · vehicles are things: stand on one, land on one (a moving one carries you), parked ones are solid
//   · any vehicle can be taken: drag the driver out, or fall out, if it's in the air
//   · people can be grabbed and thrown; bodies fly, hit walls, go through windows, and land hard
//   · street furniture and glass break when hit
//   · all of it is a crime if someone saw, and heat brings the city's officers
// Stored as deltas: `cityveh/…`, `cprop/…`, `glass/…`; heat on the player.
import { TYPES } from '../gen/vehicles.js';
import { LAYOUTS } from '../gen/ships.js';
import { vehicleAt, driverOf } from '../gen/cityfleet.js';
import { cityWalkers } from '../gen/citytraffic.js';
import { blocksNear, cityBlock, blockIndex, STYLES, CURB } from '../gen/city.js';
import { faceAhead, aOf } from '../gen/holds.js';

const G = 9.81, HEAT_TAU = 900;                           // heat halves in about 10 minutes unseen
const box = car => { if (car.ship) { const L = LAYOUTS[car.ship]; return { L: L.D, W: L.W, H: L.H }; } return TYPES[car.type] || TYPES.sedan; };

export class Mayhem {
  constructor({ world, store, planet, city, view, say = () => {} }) {
    Object.assign(this, { world, store, planet, city, view, fleet: view.fleet, say });
    this.rider = null; this.bodies = []; this.officers = []; this.out = new Set(); this.carry = null; this.lastY = null;
    for (const i of store.player.cityCars || []) view.taken.add(i);
  }
  // ---- heat
  heat(t) { const h = this.store.player.heat; return h ? h.v * Math.exp(-(t - h.t) / HEAT_TAU) : 0; }
  crime(t, kind, amount, at, seen = null) {
    const P = this.store.player, c = this.city, [u, v] = c.toLocal(at[0], at[2]);
    const n = seen ?? (this.peopleNear ? this.peopleNear(t, at[0], at[2], 30, 40) : cityWalkers(c, t, at[0], at[2], 30, 40)).filter(w => !this.out.has(w.id)).length;
    const add = amount * (n ? 1 : 0.25);       // nobody saw: it only gets out later
    if (n) { this.alarm = { t, at: [at[0], at[2]], kind }; this.onAlarm?.(this.alarm, n); }     // whoever saw it scatters (see peopleNear in main.js)
    P.heat = { v: this.heat(t) + add, t }; this.store.touchPlayer();
    this.store.log({ t, type: 'city_crime', kind, at: [Math.round(u), Math.round(v)], witnesses: n, by: P.id, byName: P.name, city: c.name });
    return n;
  }
  // ---- standing on vehicles. Call after the controller has moved; `prev` is your feet before it.
  afterStep(t, dt, ctrl) {
    if (ctrl.mode !== 'walk') { this.rider = null; this.lastY = null; return null; }
    const R = this.rider; let landed = 0;
    if (R) {
      const q = this.carNow(R.car, t), T = box(R.car), top = q.y + T.H, dx = ctrl.pos[0] - R.x, dz = ctrl.pos[2] - R.z;      // (dx, dz: your own steps, from where the car last put you)
      const off = [R.ox + dx, R.oz + dz], a0 = R.yaw, a1 = Math.atan2(q.fx, q.fz), da = a1 - a0, cs = Math.cos(da), sn = Math.sin(da);
      const ox = off[0] * cs + off[1] * sn, oz = -off[0] * sn + off[1] * cs, along = ox * q.fx + oz * q.fz, side = ox * q.fz - oz * q.fx;
      if (ctrl.vel[1] > 0.5 || Math.abs(along) > T.L / 2 + 0.7 || Math.abs(side) > T.W / 2 + 0.7) {     // jumped, or stepped off: you keep its speed
        ctrl.vel[0] += q.vx * 0.9; ctrl.vel[2] += q.vz * 0.9; ctrl.vel[1] += q.vy * 0.9; ctrl.grounded = false; this.rider = null;
      } else {
        ctrl.pos = [q.x + ox, top, q.z + oz]; ctrl.vel[1] = 0; ctrl.grounded = true; ctrl.landed = 0; ctrl.where = { car: R.car }; ctrl.facing += da;
        Object.assign(R, { x: ctrl.pos[0], z: ctrl.pos[2], ox, oz, yaw: a1 });
      }
    } else if (!ctrl.grounded || ctrl.vel[1] < 0) {       // coming down onto a roof?
      const y0 = this.lastY ?? ctrl.pos[1];
      for (const v of this.view.nearby) {
        const T = box(v.car), q = this.carNow(v.car, t), top = q.y + T.H, dx = ctrl.pos[0] - q.x, dz = ctrl.pos[2] - q.z;
        if (Math.abs(dx * q.fx + dz * q.fz) > T.L / 2 + 0.15 || Math.abs(dx * q.fz - dz * q.fx) > T.W / 2 + 0.15) continue;
        if (y0 < top - 0.15 || ctrl.pos[1] > top + 0.05) continue;
        landed = Math.max(0, -ctrl.vel[1] + (q.vy || 0));
        // you land with whatever speed you had against the car's: hit a fast one and you're rolling
        ctrl.pos[1] = top; ctrl.vel = [0, 0, 0]; ctrl.grounded = true; ctrl.landed = 0;
        this.rider = { car: v.car, x: ctrl.pos[0], z: ctrl.pos[2], ox: dx, oz: dz, yaw: Math.atan2(q.fx, q.fz) };
        break;
      }
    }
    // parked vehicles are solid
    if (!this.rider) for (const v of this.view.nearby) {
      if (!v.parked || !ctrl.grounded) continue;
      const T = box(v.car), fx = Math.sin(v.facing), fz = Math.cos(v.facing), dx = ctrl.pos[0] - v.pos[0], dz = ctrl.pos[2] - v.pos[2];
      if (ctrl.pos[1] >= v.pos[1] + T.H || ctrl.pos[1] + 1.7 < v.pos[1]) continue;
      const a = dx * fx + dz * fz, s = dx * fz - dz * fx, pa = T.L / 2 + 0.32 - Math.abs(a), ps = T.W / 2 + 0.32 - Math.abs(s);
      if (pa <= 0 || ps <= 0) continue;
      if (pa < ps) { const d = Math.sign(a || 1) * pa; ctrl.pos[0] += fx * d; ctrl.pos[2] += fz * d; } else { const d = Math.sign(s || 1) * ps; ctrl.pos[0] += fz * d; ctrl.pos[2] -= fx * d; }
    }
    this.lastY = ctrl.pos[1];
    return landed;
  }
  carNow(car, t) { return vehicleAt(this.fleet, car, t - this.view.life.delayOf(car.id), this.qq ||= {}); }

  // ---- taking a vehicle
  // The one you could take from here: the one under you, or one you're beside that's slow enough to reach.
  takeable(ctrl, t) {
    if (ctrl.mode !== 'walk') return null;
    if (this.rider && !this.rider.car.ship) return { car: this.rider.car, on: true };
    let best = null, bd = 2.6;
    for (const v of this.view.nearby) {
      if (v.car.ship || (v.speed || 0) > 4) continue;
      const d = Math.hypot(v.pos[0] - ctrl.pos[0], v.pos[2] - ctrl.pos[2]) - box(v.car).L / 2 + 0.8;
      if (d < bd && Math.abs(v.pos[1] - ctrl.pos[1]) < 2) { bd = d; best = { car: v.car, on: false, parked: v.parked, d }; }
    }
    return best;
  }
  // → the vehicle record, as the ride code wants it. The driver's out; the crime's yours.
  take(c, t) {
    const car = c.car, q = this.carNow(car, t), d = driverOf(this.fleet, car), P = this.store.player, moving = q.moving;
    this.view.taken.add(car.i); (P.cityCars ||= []).push(car.i); this.rider = null;
    const v = { id: car.id, city: true, type: car.type, colour: car.colour, fly: car.air, pos: [q.x, q.y, q.z], facing: Math.atan2(q.fx, q.fz), owner: 'you:' + P.id, ownerName: 'you', driver: d.name };
    this.store.patchDelta('veh/' + car.id, { pos: v.pos, facing: v.facing, owner: v.owner, type: v.type, colour: v.colour, fly: v.fly });
    const seen = this.crime(t, moving ? 'hijacking' : 'car theft', moving ? 2.2 : 1, v.pos);
    if (moving || !c.parked && q.moving) this.thrown({ id: 'drv:' + car.id, name: d.name, pos: [q.x + q.fz * 1.2, q.y + 0.6, q.z - q.fx * 1.2], vel: [q.vx * 0.6 + q.fz * 2, 2, q.vz * 0.6 - q.fx * 2], age: d.age });
    return { v, seen, name: d.name, moving };
  }

  // ---- bodies in the air
  thrown(b) { this.bodies.push({ pos: b.pos.slice(), vel: b.vel.slice(), facing: 0, flying: true, until: Infinity, ...b }); }
  // Throw someone you're carrying, or knock a passer-by flying.
  stepBodies(dt, t, hooks = {}) {
    const W = this.world;
    for (const b of this.bodies) {
      if (!b.flying) continue;
      b.vel[1] -= G * dt;
      const nx = b.pos[0] + b.vel[0] * dt, ny = b.pos[1] + b.vel[1] * dt, nz = b.pos[2] + b.vel[2] * dt, sp = Math.hypot(b.vel[0], b.vel[1], b.vel[2]);
      b.noclip = Math.max(0, (b.noclip || 0) - dt);
      if (!b.noclip && W.solidAt(nx, ny + 0.9, nz, 0.1) && ny + 0.1 > W.groundAt(nx, nz, b.pos[1] + 0.5).h + 0.2) {       // into a wall
        const win = sp > 3.5 ? hooks.windowAt?.(nx, ny + 1.0, nz, b) : null;
        if (win) { b.noclip = 0.5; hooks.onGlass?.(win, b, t); }
        else { b.vel[0] *= -0.2; b.vel[2] *= -0.2; hooks.onHit?.(b, sp * 0.5, t); continue; }
      }
      b.pos = [nx, ny, nz];
      const g = Math.max(W.groundAt(nx, nz, b.pos[1] + 0.4).h, this.planet.seaLevel);
      if (ny <= g) { b.pos[1] = g; b.flying = false; b.until = t + 240; b.pose = 'lie'; hooks.onLand?.(b, -b.vel[1], t, sp); b.vel = [0, 0, 0]; }
    }
    this.bodies = this.bodies.filter(b => b.until > t);
  }
  // ---- things that break
  brokenProp(B, idx) { return !!this.store.getDelta(`cprop/${B.i},${B.j}/${idx}`); }
  // The street furniture you'd hit at this point, smashed. → its kind, or null.
  smash(at, t, reach = 1.2) {
    const c = this.city, [u, v] = c.toLocal(at[0], at[2]), y = at[1] - c.h - CURB; let hit = null, bd = reach;
    blocksNear(c, u, v, reach + 1, B => B.props.forEach((p, idx) => { if (Math.abs(p.y - y) > 3.2 || p.k.startsWith('lanternline')) return; const d = Math.hypot(p.u - u, p.v - v); if (d < bd && !this.brokenProp(B, idx)) { bd = d; hit = { B, idx, p }; } }));
    if (!hit) return null;
    this.store.patchDelta(`cprop/${hit.B.i},${hit.B.j}/${hit.idx}`, { t });
    this.crime(t, 'criminal damage', 0.25, at);
    return hit.p.k;
  }
  // The city window at this point on a facade: broken if it wasn't. → its logical cell, or null.
  breakGlass(at, fx, fz, t) {
    const f = faceAhead(this.world, at[0] - fx * 0.6, at[1] - 1.2, at[2] - fz * 0.6, fx, fz, 1.2) || null; if (!f || !f.b) return null;
    const b = f.b, st = STYLES[b.style], a = aOf(f, at[0], at[2]), y = at[1] - this.city.h - CURB; if (y < 5.2) return null;
    const col = Math.floor(a / b.bay), row = Math.floor((y - 5.2) / b.floor), fa = a / b.bay - col, fy = (y - 5.2) / b.floor - row;
    if (Math.abs(fa - 0.5) > st[3] / 2 || Math.abs(fy - 0.55) > st[4] / 2) return null;     // it hit the wall, not a window
    const key = `glass/${f.key}/${col},${row}`; if (this.store.getDelta(key)) return null;
    this.store.patchDelta(key, { t }); this.crime(t, 'smashed a window', 0.3, at);
    (this.glass ||= []).push({ face: f, a0: (col + 0.5 - st[3] / 2) * b.bay, w: st[3] * b.bay, y0: this.city.h + CURB + 5.2 + (row + 0.55 - st[4] / 2) * b.floor, h: st[4] * b.floor });
    return key;
  }
  // ---- the law, in the city: officers come for you when you're hot enough. They're just people:
  // they run, they shoot if you've been shooting, and they can be fought or outrun.
  stepOfficers(dt, t, ctrl, hooks) {
    const heat = this.heat(t), c = this.city, inCity = Math.hypot(ctrl.pos[0] - c.cx, ctrl.pos[2] - c.cz) < c.R + 200, local = !inCity && heat >= 1 ? hooks.watchHere?.() : null;   // out in the country it's the village's own watch: fewer, and they don't shoot first
    const want = local ? (heat < 3 ? 1 : 2) : !inCity ? 0 : heat < 1.5 ? 0 : heat < 3 ? 2 : heat < 6 ? 4 : 6;
    if (this.officers.length < want && (this.nextCop ?? 0) < t) {
      this.nextCop = t + 6;
      for (let k = 0; k < 12; k++) {        // from somewhere out of sight, 60–90 m off
        const a = (t * 7.3 + k * 2.4), r = local ? 30 + (k * 11) % 25 : 60 + (k * 11) % 30, x = ctrl.pos[0] + Math.sin(a) * r, z = ctrl.pos[2] + Math.cos(a) * r, y = this.world.groundAt(x, z, local ? ctrl.pos[1] + 2 : c.h + 0.4).h;
        if ((!local && y > c.h + 0.5) || this.world.solidAt(x, y + 1, z, 0.3)) continue;
        this.officers.push({ id: `cop:${Math.floor(t)}:${k}`, pos: [x, y, z], facing: 0, hp: 100, shot: 1.5 }); hooks.onCop?.(this.officers.length, local); break;
      }
    }
    for (const o of this.officers) {
      const dx = ctrl.pos[0] - o.pos[0], dz = ctrl.pos[2] - o.pos[2], d = Math.hypot(dx, dz); o.facing = Math.atan2(dx, dz); o.moving = false;
      const armed = hooks.armed?.();
      if (armed && d < 35 && (!local || heat > 3)) { o.shot -= dt; if (o.shot <= 0) { o.shot = 0.9 + Math.random() * 0.7; hooks.shoot?.(o, d); } }
      if (d > (armed ? 14 : 1.2)) { const sp = 5.8 * dt, nx = o.pos[0] + dx / d * sp, nz = o.pos[2] + dz / d * sp, [rx, rz] = this.world.resolve(nx, nz, o.pos[1]); o.pos = [rx, this.world.groundAt(rx, rz, o.pos[1] + 0.5).h, rz]; o.moving = true; }
      else if (!armed && !this.rider && ctrl.grounded) { hooks.caught?.(o, local); break; }
    }
    if (want === 0 && this.officers.length) this.officers = this.officers.filter(o => Math.hypot(o.pos[0] - ctrl.pos[0], o.pos[2] - ctrl.pos[2]) < 40 && heat > 0.5);
  }
  holds(id) { return this.carry?.id === id || this.bodies.some(b => b.id === id); }
  // In the crowd's terms: { id, pos, facing, moving, pose, age, uniform }
  crowd() {
    const out = [];
    if (this.carry) out.push({ id: this.carry.id, pos: this.carry.pos, facing: 0, moving: false, pose: 'air', age: this.carry.age });
    for (const b of this.bodies) out.push({ id: b.id, pos: b.pos, facing: b.facing, moving: false, pose: b.flying ? 'air' : b.pose || 'lie', age: b.age || 35 });
    for (const o of this.officers) out.push({ id: o.id, pos: o.pos, facing: o.facing, moving: !!o.moving, pose: 'walk', age: 34, uniform: true });
    return out;
  }
}
