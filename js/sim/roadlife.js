// Manners for the traffic near you. Traffic is a closed-form function of time (gen/traffic.js,
// gen/citytraffic.js); this gives each nearby car a delay, so it runs a little behind its
// schedule: position = where the schedule had it `delay` seconds ago. Waiting at a red light,
// queueing behind the car ahead or braking for someone in the road is the delay growing. Out of
// your sight it catches up. Ambient only: nothing here is saved, and no rule depends on it.
import { TYPES } from '../gen/vehicles.js';

const CATCH_UP = 0.4, BRAKE_RATE = 3.2, GO_RATE = 1.3, GAP = 1.8;
export class RoadLife {
  constructor() { this.cars = new Map(); }           // id → { d (seconds behind), r (0 stopped .. 1 at pace) }
  delayOf = id => this.cars.get(id)?.d || 0;
  rateOf = id => this.cars.get(id)?.r ?? 1;
  // list: the cars near you, each { id, pos, facing, speed, type, stop? (metres to a stop line it
  // must obey) }; people: [[x, y, z]] in the road, the cars will brake for them.
  step(dt, list, people = []) {
    const groups = new Map();
    for (const v of list) { const g = v.id.slice(0, v.id.lastIndexOf(':')); (groups.get(g) || groups.set(g, []).get(g)).push(v); }
    const seen = new Set();
    for (const group of groups.values()) for (const v of group) {
      seen.add(v.id);
      const T = TYPES[v.type] || TYPES.sedan, fx = Math.sin(v.facing), fz = Math.cos(v.facing);
      let D = v.stop ?? Infinity;
      // the car ahead, in this lane and going the same way
      for (const o of group) {
        if (o === v) continue;
        const dx = o.pos[0] - v.pos[0], dz = o.pos[2] - v.pos[2], a = dx * fx + dz * fz;
        if (a <= 0 || a > 60 || Math.abs(dx * fz - dz * fx) > 1.6) continue;
        const gap = a - T.L / 2 - (TYPES[o.type] || TYPES.sedan).L / 2 - GAP; if (gap < D) D = gap;
      }
      for (const p of people) {       // someone in the road
        if (Math.abs(p[1] - v.pos[1]) > 2) continue;
        const dx = p[0] - v.pos[0], dz = p[2] - v.pos[2], a = dx * fx + dz * fz;
        if (a <= 0 || Math.abs(dx * fz - dz * fx) > T.W / 2 + 0.7) continue;
        const gap = a - T.L / 2 - 1.2; if (gap < D) D = gap;
      }
      const want = D === Infinity ? 1 : Math.max(0, Math.min(1, (D - 0.4) / (v.speed * 1.5 + 2))), c = this.cars.get(v.id) || { d: 0, r: 1 };
      c.r += (want - c.r) * Math.min(1, dt * (want < c.r ? BRAKE_RATE : GO_RATE));
      if (want === 0 && D <= 0.5) c.r = Math.min(c.r, 0.02);      // at the line: stopped
      c.d += (1 - c.r) * dt;
      this.cars.set(v.id, c);
    }
    for (const [id, c] of this.cars) if (!seen.has(id)) { c.d -= CATCH_UP * dt; c.r = 1; if (c.d <= 0) this.cars.delete(id); }
  }
}
