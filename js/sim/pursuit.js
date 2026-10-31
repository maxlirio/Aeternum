// An officer coming to arrest the player — the one place an NPC leaves its closed-form
// schedule. It only exists while the player is in the game (ACTIVE tier); while you are
// away a warrant is served abstractly (sim/processes/law.js). The officer's route comes
// from the same logical data residents walk by (room/door graph, street graph); at
// close range in the same space they steer straight at you, held off walls by the
// collision world. When it's over they walk back until they rejoin their schedule.
import { tripPoints } from '../gen/paths.js';
import { whereAt } from '../gen/schedule.js';

const WALK = 1.8, RUN = 4.9;         // m/s; a fit player running (≈5.4+) can outpace a chase
const CATCH = 1.25, COMPLY = 3.0;    // grabbed within CATCH; standing still within COMPLY = going quietly
const LOSE_D = 45, LOSE_T = 15, GIVE_UP = 300;

// Logical place of a world position: a room spot in a building, or a point on a street.
export function placeAt(s, world, pos) {
  const loc = world.locate(pos[0], pos[1], pos[2]);
  if (loc?.b) return loc.room && !loc.roof ? { b: loc.b, plan: loc.plan, spot: { k: loc.k, room: loc.room.i, x: loc.lx, z: loc.lz } } : null;
  const [u, v] = s.toLocal(pos[0], pos[2]);
  let road = -1, bd = Infinity;
  s.roads.forEach((r, i) => {
    const cu = Math.max(Math.min(r.a[0], r.b[0]), Math.min(u, Math.max(r.a[0], r.b[0]))), cv = Math.max(Math.min(r.a[1], r.b[1]), Math.min(v, Math.max(r.a[1], r.b[1])));
    const d = (cu - u) ** 2 + (cv - v) ** 2; if (d < bd) { bd = d; road = i; }
  });
  return { street: [u, v], road };
}
const spaceOf = (world, p) => { const l = world.locate(p[0], p[1], p[2]); return l?.b ? `${l.b.key}:${l.k}` : 'out'; };

export class Pursuit {
  constructor(pop, officer, t, why) {
    const w = whereAt(pop, officer, t);
    Object.assign(this, { pop, person: officer, why, pos: w.pos.slice(), facing: w.facing, state: 'approach', t0: t,
      route: null, ri: 1, replan: 0, lostFor: 0, lastD: null, resisted: false, moving: true, tReturn: 0 });
  }

  // → null, or the transition that just happened: 'chase' | 'caught' | 'lost' | 'done'
  update(t, dt, player, world, s) {
    const d = Math.hypot(player.pos[0] - this.pos[0], player.pos[2] - this.pos[2]), dy = Math.abs(player.pos[1] - this.pos[1]);
    let ev = null;
    if (this.state === 'approach' || this.state === 'chase') {
      if (d < CATCH && dy < 1.2) return this.end('caught', t);
      if (this.state === 'approach' && d < COMPLY && dy < 1.2 && player.speed < 0.3) return this.end('caught', t);
      if (this.state === 'approach' && player.speed > 3.2 && this.lastD !== null && d > this.lastD + 0.02 && d < 30) { this.state = 'chase'; this.resisted = true; ev = 'chase'; }
      this.lostFor = this.state === 'chase' && d > LOSE_D ? this.lostFor + dt : 0;   // on approach they come to where you are
      if (this.lostFor > LOSE_T || t - this.t0 > GIVE_UP) return this.end('lost', t);
      this.lastD = d;
      this.move(dt, player.pos, this.state === 'chase' ? RUN : WALK, world, s, d < 10 && dy < 1.2 && spaceOf(world, this.pos) === spaceOf(world, player.pos));
    } else if (this.state === 'return') {
      const home = whereAt(this.pop, this.person, t).pos;
      const dh = Math.hypot(home[0] - this.pos[0], home[2] - this.pos[2]);
      if (dh < 1.5 || t - this.tReturn > 120) { this.state = 'done'; return 'done'; }
      this.move(dt, home, WALK, world, s, dh < 6 && spaceOf(world, this.pos) === spaceOf(world, home));
    }
    return ev;
  }
  end(how, t) { this.state = 'return'; this.tReturn = t; this.route = null; return how; }

  move(dt, target, speed, world, s, direct) {
    let step = speed * dt;
    if (direct) {
      const dx = target[0] - this.pos[0], dz = target[2] - this.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.05) { this.moving = false; return; }
      const k = Math.min(step, d) / d;
      const [x, z] = world.resolve(this.pos[0] + dx * k, this.pos[2] + dz * k, this.pos[1], 0.3);
      this.pos = [x, world.groundAt(x, z, this.pos[1]).h, z];
      this.facing = Math.atan2(dx, dz); this.moving = true; this.route = null;
      return;
    }
    this.replan -= dt;
    const end = this.route?.at(-1), drift = end ? Math.hypot(end[0] - target[0], end[2] - target[2]) : Infinity;
    if (!this.route || this.ri >= this.route.length || (drift > 4 && this.replan <= 0)) {   // replan only when you've moved off the route's end
      const from = placeAt(s, world, this.pos), to = placeAt(s, world, target);
      const pts = from && to ? tripPoints(this.pop.planet, s, from, to) : null;
      if (pts && pts.length > 1) {
        this.route = pts; this.ri = 1;
        const h = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);       // skip points already behind us
        while (this.ri < pts.length - 1 && h(this.pos, pts[this.ri + 1]) < h(pts[this.ri], pts[this.ri + 1]) && !pts[this.ri].door) this.ri++;
      }
      this.replan = 1.5;
    }
    if (!this.route) return this.move(dt, target, speed, world, s, true);     // nowhere to route from: head straight there
    this.moving = false;
    while (step > 0 && this.ri < this.route.length) {
      const q = this.route[this.ri], dx = q[0] - this.pos[0], dy = q[1] - this.pos[1], dz = q[2] - this.pos[2], d = Math.hypot(dx, dy * 0.6, dz);
      if (d <= step) { this.pos = [q[0], q[1], q[2]]; step -= d; this.ri++; continue; }
      const k = step / d;
      this.pos = [this.pos[0] + dx * k, this.pos[1] + dy * k, this.pos[2] + dz * k];
      if (Math.abs(dx) + Math.abs(dz) > 1e-3) this.facing = Math.atan2(dx, dz);
      this.moving = true; step = 0;
    }
  }

  // Drawn like any resident; route + index let doors open for them (they carry keys).
  agent() {
    const p = this.person;
    return { id: p.id, person: p, age: p.age, pos: this.pos, facing: this.facing, pose: 'stand', moving: this.moving,
      activity: this.state === 'return' ? 'returning to duty' : this.state === 'chase' ? 'chasing you' : 'coming to arrest you',
      seg: { route: { pts: this.route || [] } }, routeIndex: this.ri, bKey: null };
  }
}
