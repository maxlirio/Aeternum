// Residents across simulation tiers. Everyone's position is the closed-form
// whereAt(person, t) from gen/schedule.js; tiers only decide how often we ask:
//   DORMANT  — not asked at all (offline, far away): their day still "happens"
//   NEAR     — every second: who is close enough to draw, who could witness
//   ACTIVE   — every frame for the drawn set
import { whereAt, dayIndex, dayPlan } from '../gen/schedule.js';

const DRAW_R = 110, MAX_DRAWN = 96;

export class Residents {
  constructor(pop) { this.pop = pop; this.near = []; this.warmFor = null; this.warmI = 0; this.lag = new Map(); this.side = new Map(); }

  // NEAR tier: pick the people worth drawing around the player.
  refresh(t, pos, playerBuilding) {
    const out = [];
    for (const p of this.pop.people) {
      const w = whereAt(this.pop, p, t);
      const d = Math.hypot(w.pos[0] - pos[0], w.pos[2] - pos[2]);
      if (d > DRAW_R) continue;
      // people inside other buildings are only drawn when fairly close (seen through windows)
      if (w.bKey && w.bKey !== playerBuilding && d > 45) continue;
      out.push([d, p]);
    }
    out.sort((a, b) => a[0] - b[0]);
    this.near = out.slice(0, MAX_DRAWN).map(x => x[1]);
    // prepare tomorrow's plans a few at a time during the last hours of the day
    const D = dayIndex(this.pop.planet, t), frac = t / this.pop.planet.dayLength + 0.3 - D;
    if (frac > 0.85) {
      if (this.warmFor !== D + 1) { this.warmFor = D + 1; this.warmI = 0; }
      for (let k = 0; k < 25 && this.warmI < this.pop.people.length; k++) dayPlan(this.pop, this.pop.people[this.warmI++], D + 1);
    }
  }

  // ACTIVE tier: current state of the drawn set, with local avoidance.
  // Avoidance is a VIEW-side deviation from the closed-form schedule: a walker may side-
  // step (lateral offset) or pause (time lag) for the player or other people, then
  // catches up by walking a little faster. The schedule itself never changes, so
  // offline time, witnesses and distant people are unaffected.
  agents(t, dt = 0, player = null, world = null) {
    const list = this.near.map(p => {
      const lag = this.lag.get(p.id) || 0;
      return { id: p.id, person: p, ...whereAt(this.pop, p, t - lag), age: p.age };
    });
    if (!dt) return list;
    for (const a of list) {
      if (!a.moving) { this.lag.delete(a.id); this.side.delete(a.id); continue; }
      const fx = Math.sin(a.facing), fz = Math.cos(a.facing), rx = fz, rz = -fx;    // forward, right
      let want = 0, block = false;
      const consider = (ox, oy, oz, r) => {
        if (Math.abs(oy - a.pos[1]) > 1.2) return;
        const dx = ox - a.pos[0], dz = oz - a.pos[2], ahead = dx * fx + dz * fz, lat = dx * rx + dz * rz;
        if (ahead < 0 || ahead > 2.6 || Math.abs(lat) > r + 0.45) return;
        want += (lat > 0 ? -1 : 1) * (r + 0.5 - Math.abs(lat));                  // step away from it
        if (ahead < 0.9 && Math.abs(lat) < r) block = true;
      };
      if (player) consider(player[0], player[1], player[2], 0.45);
      for (const b of list) if (b !== a && (!b.moving || b.facing !== a.facing)) consider(b.pos[0], b.pos[1], b.pos[2], 0.35);
      want = Math.max(-0.9, Math.min(0.9, want * 1.6));
      let side = this.side.get(a.id) || 0;
      side += (want - side) * Math.min(1, dt * 3);
      // never sidestep into a wall
      if (world) while (Math.abs(side) > 0.05 && world.solidAt(a.pos[0] + rx * side, a.pos[1] + 1, a.pos[2] + rz * side, 0.25)) side *= 0.5;
      const lag = this.lag.get(a.id) || 0;
      const blocked = block && Math.abs(side - want) > 0.3 || (block && Math.abs(want) < 0.2);
      this.lag.set(a.id, Math.min(30, blocked ? lag + dt : Math.max(0, lag - dt * 0.3)));
      this.side.set(a.id, side);
      a.pos = [a.pos[0] + rx * side, a.pos[1], a.pos[2] + rz * side];
      if (blocked) { a.moving = false; a.pose = 'stand'; }
    }
    return list;
  }

  // Doors a walking resident is passing through right now (they have the key).
  doorsInUse(agents) {
    const keys = new Set();
    for (const a of agents) {
      if (!a.moving || !a.seg?.route) continue;      // (someone running from gunfire isn't on a route)
      const pts = a.seg.route.pts;
      for (const i of [a.routeIndex - 1, a.routeIndex, a.routeIndex + 1]) {
        const q = pts[i];
        if (q?.door && Math.hypot(q[0] - a.pos[0], q[2] - a.pos[2]) < 1.8 && Math.abs(q[1] - a.pos[1]) < 1.5) keys.add(q.door);
      }
    }
    return keys;
  }

  // Who could have seen something happen at pos, time t? Same space (both outdoors, or
  // same building and floor), awake, within range.
  witnesses(t, pos, bKey, k) {
    const out = [];
    for (const p of this.pop.people) {
      const w = whereAt(this.pop, p, t);
      if (w.activity === 'sleeping') continue;
      const d = Math.hypot(w.pos[0] - pos[0], w.pos[2] - pos[2]);
      const sameSpace = bKey ? w.bKey === bKey && w.k === k : !w.bKey && Math.abs(w.pos[1] - pos[1]) < 3;
      if (sameSpace && d < (bKey ? 14 : 30)) out.push({ id: p.id, name: p.name, dist: Math.round(d) });
    }
    return out;
  }
}
