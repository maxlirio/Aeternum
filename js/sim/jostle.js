// Everyone who walks has a body: nobody goes through a wall, a closed door, a table, a parked car, a tree, a rock, another person or you.
// Where people are is worked out from their day (gen/schedule.js) or the street's life (gen/city.js, gen/outposts.js), and those paths
// don't know what's been left in the way; so each walker carries a small offset from where its path puts it: it leans round what's ahead
// to the side that's open, steps apart from whoever it would walk into, and as a last word is pushed out of anything solid by the same
// collision you are (player/collision.js resolve). The offset eases back to nothing once the way is clear, so their day goes on unchanged.
const R = 0.28, PROBE = 0.22;

export class Jostle {
  constructor() { this.s = new Map(); }
  // list: walkers { id, pos, facing, moving, pose } in world space, changed in place; you: your feet, or null
  step(list, dt, world, you) {
    if (!dt) return;
    const seen = new Set(), live = [];
    for (const a of list) {
      if (!a || a.id === undefined || !a.pos) continue; seen.add(a.id);
      let S = this.s.get(a.id); if (!S) this.s.set(a.id, S = { o: [0, 0], lean: 0, probe: Math.random() * PROBE, last: a.pos.slice() });
      // a jump in its path (a lift, another floor, a door through a wall): start clean from there
      if (Math.hypot(a.pos[0] - S.last[0], a.pos[2] - S.last[2]) > 4 || Math.abs(a.pos[1] - S.last[1]) > 1.5) { S.o = [0, 0]; S.lean = 0; }
      S.last = a.pos.slice();
      const still = !a.moving || a.pose === 'lie' || a.pose === 'sit' || a.pose === 'sleep';
      const k = Math.exp(-dt * (still ? 2.5 : 0.5)); S.o[0] *= k; S.o[1] *= k;
      if (!still) {
        // look ahead now and then: something solid on the way, lean round it to whichever side is open
        const fx = Math.sin(a.facing), fz = Math.cos(a.facing), rx = fz, rz = -fx, y = a.pos[1] + 0.05;
        if ((S.probe -= dt) <= 0) {
          S.probe = PROBE; const bx = a.pos[0] + S.o[0], bz = a.pos[2] + S.o[1];
          const hit = (u, v) => { const px = bx + fx * u + rx * v, pz = bz + fz * u + rz * v, q = world.resolve(px, pz, y, R, 1.7, true); return Math.hypot(q[0] - px, q[1] - pz) > 0.04; };
          if (hit(0.9, 0) || hit(0.5, 0)) { if (!S.dir) S.dir = !hit(0.9, 1.1) ? 1 : !hit(0.9, -1.1) ? -1 : (String(a.id).length % 2 ? 1 : -1); S.lean = S.dir; }
          else { S.lean = 0; S.dir = 0; }
        }
        if (S.lean) { const sp = 1.3 * dt; S.o[0] += rx * sp * S.lean; S.o[1] += rz * sp * S.lean; a.facing = Math.atan2(fx + rx * S.lean * 0.7, fz + rz * S.lean * 0.7); }     // (turned the way it's going)
      }
      live.push([a, S, still]);
    }
    // people apart from people, and from you (you don't give way to them: they step round you)
    for (let i = 0; i < live.length; i++) {
      const [a, A, sa] = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const [b, B, sb] = live[j]; if (Math.abs(a.pos[1] - b.pos[1]) > 1.2) continue;
        const dx = a.pos[0] + A.o[0] - b.pos[0] - B.o[0], dz = a.pos[2] + A.o[1] - b.pos[2] - B.o[1], d = Math.hypot(dx, dz), m = 2 * R + 0.06; if (d >= m) continue;
        const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, p = m - d, wa = sa && !sb ? 0 : sb && !sa ? 1 : 0.5;
        A.o[0] += ux * p * wa; A.o[1] += uz * p * wa; B.o[0] -= ux * p * (1 - wa); B.o[1] -= uz * p * (1 - wa);
      }
      if (you && Math.abs(you[1] - a.pos[1]) < 1.4) { const dx = a.pos[0] + A.o[0] - you[0], dz = a.pos[2] + A.o[1] - you[2], d = Math.hypot(dx, dz), m = R + 0.34; if (d < m) { const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0; A.o[0] += ux * (m - d); A.o[1] += uz * (m - d); } }
    }
    // and nothing solid: pushed out as you would be (their own doors open for them)
    for (const [a, S, still] of live) {
      const px = a.pos[0] + S.o[0], pz = a.pos[2] + S.o[1];
      if (still && Math.hypot(S.o[0], S.o[1]) < 0.02) continue;     // (standing where their day put them: at a counter, in a chair)
      const [x, z] = world.resolve(px, pz, a.pos[1] + 0.05, R, 1.7, true);
      S.o = [x - a.pos[0], z - a.pos[2]];
      const moved = Math.hypot(S.o[0], S.o[1]);
      if (moved > 0.25) { const g = world.groundAt(x, z, a.pos[1] + 0.6).h; if (Math.abs(g - a.pos[1]) < 0.6) a.pos[1] = g; }
      a.pos = [x, a.pos[1], z];
    }
    for (const id of this.s.keys()) if (!seen.has(id)) this.s.delete(id);
  }
}
