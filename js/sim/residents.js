// Residents across simulation tiers. Everyone's position is the closed-form
// whereAt(person, t) from gen/schedule.js; tiers only decide how often we ask:
//   DORMANT  — not asked at all (offline, far away): their day still "happens"
//   NEAR     — every second: who is close enough to draw, who could witness
//   ACTIVE   — every frame for the drawn set
import { whereAt, dayIndex, dayPlan } from '../gen/schedule.js';

const DRAW_R = 110, MAX_DRAWN = 96;

export class Residents {
  constructor(pop) { this.pop = pop; this.near = []; this.warmFor = null; this.warmI = 0; }

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

  // ACTIVE tier: current state of the drawn set.
  agents(t) {
    return this.near.map(p => { const w = whereAt(this.pop, p, t); return { id: p.id, person: p, ...w, age: p.age }; });
  }

  // Doors a walking resident is passing through right now (they have the key).
  doorsInUse(agents) {
    const keys = new Set();
    for (const a of agents) {
      if (!a.moving) continue;
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
