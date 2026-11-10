// The great ships in a fight (gen/capital.js FLEET): what each one is for, and doing it.
//   Anvil, the dreadnought: laser batteries along its spine that cut a raider in two, and missile cells down both
//     flanks: a missile slides out of its cell on rails, lights, and either runs down a raider or flashes down at the
//     ground. What it hits, it wrecks: craters, blast, fire (main.js turns `blast` events into damage).
//   Bastion, the carrier: when raiders come, it launches its fighters off the deck; it has missile cells too.
//   Sable, the flying wing: a bomber. It goes out along the raiders' line of approach, sweeps the ground with its
//     scanners, then lays a carpet of bombs down that line, and comes home.
// Pure numbers, no three.js (render/fleetwar.js draws it). Works in world coordinates.
const V = { add: (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len: a => Math.hypot(a[0], a[1], a[2]) };
const norm = a => { const l = V.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Where each ship's weapons are, in its own frame (x across, y up, z stern to bow); from the hull shapes in capital_kit.py.
export const ROLES = {
  anvil: { role: 'warship', turrets: [[-180, 362, -1150], [180, 362, -1150], [-180, 362, -500], [180, 362, -500], [0, 560, -600], [-180, 362, 300], [180, 362, 300]],
    cells: side => Array.from({ length: 16 }, (_, i) => [side * 442, -40 + (i % 2) * 70, -1400 + Math.floor(i / 2) * 260]), range: 15000, laserCd: 3.2, salvo: 8, salvoCd: 9 },
  bastion: { role: 'carrier', turrets: [[-60, 70, 300], [60, 70, -300]], cells: side => Array.from({ length: 8 }, (_, i) => [side * 94, 40, -380 + i * 95]), range: 9000, laserCd: 5, salvo: 4, salvoCd: 12,
    deck: [[-30, 62, -380], [30, 62, -380], [-30, 62, -200], [30, 62, -200]], fighters: ['interceptor', 'striker', 'interceptor', 'warden'] },
  sable: { role: 'bomber', range: 0 },
};
const toWorld = (C, p) => { const c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [C.x + p[0] * c + p[2] * s, C.y + p[1], C.z - p[0] * s + p[2] * c]; };
const dirWorld = (C, d) => { const c = Math.cos(C.yaw), s = Math.sin(C.yaw); return [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c]; };

export class FleetWar {
  // war: sim/aircombat.js AirWar; ground(x, z): height there; hooks.blast({ p, R, by }): an explosion on or near the ground
  constructor({ war, fleet, ground, hooks = {} }) {
    this.war = war; this.fleet = fleet; this.ground = ground; this.hooks = hooks;
    this.beams = []; this.missiles = []; this.bombs = []; this.scans = []; this.events = []; this.state = new Map(); this.t = 0;
    for (const C of fleet) this.state.set(C.model, { home: { x: C.x, y: C.y, z: C.z, yaw: C.yaw }, laser: 0, salvo: 0, launched: new Set(), sortie: null });
  }
  hostiles(C, range) { return this.war.craft.filter(c => c.alive && c.side === 'raider' && Math.hypot(c.f.pos[0] - C.x, c.f.pos[1] - C.y, c.f.pos[2] - C.z) < range); }
  step(dt, raid = null) {
    this.t += dt;
    for (const C of this.fleet) {
      const R = ROLES[C.model]; if (!R) continue; const S = this.state.get(C.model);
      if (R.role === 'bomber') { this.bomber(C, S, dt, raid); continue; }
      const H = this.hostiles(C, R.range);
      // lasers: a turret with a raider in reach burns it for a moment, then it comes apart
      S.laser -= dt;
      if (H.length && S.laser <= 0) {
        const tgt = H.find(c => !this.beams.some(b => b.target === c)); if (tgt) {
          const from = R.turrets.map(p => toWorld(C, p)).sort((a, b) => V.len(V.sub(a, tgt.f.pos)) - V.len(V.sub(b, tgt.f.pos)))[0];
          this.beams.push({ from, target: tgt, t: 0, life: 0.9, C: C.model }); S.laser = R.laserCd; this.events.push({ type: 'laser', from, target: tgt });
        }
      }
      // missiles: a salvo out of the flank cells facing the trouble
      S.salvo -= dt;
      if (H.length && S.salvo <= 0) {
        S.salvo = R.salvoCd; const side = Math.sign((H[0].f.pos[0] - C.x) * Math.cos(C.yaw) - (H[0].f.pos[2] - C.z) * Math.sin(C.yaw)) || 1, cells = R.cells(side);
        for (let k = 0; k < R.salvo; k++) {
          const p = toWorld(C, cells[(k * 3 + Math.floor(this.t)) % cells.length]), out = norm(dirWorld(C, [side, 0, 0])), tgt = H[k % H.length];
          this.missiles.push({ p, out, v: [0, 0, 0], phase: 'slide', t: -k * 0.35, target: tgt, aim: null, trail: [], from: C.model });
        }
        this.events.push({ type: 'salvo', C: C.model, n: R.salvo });
      }
      // the carrier puts its fighters up when raiders come in
      if (R.role === 'carrier' && raid && !S.launched.has(raid.k) && H.length) {
        S.launched.add(raid.k);
        R.deck.forEach((p, i) => { const at = toWorld(C, p), c = this.war.spawn(R.fighters[i % R.fighters.length], 'security', [at[0], at[1] + 4, at[2]], C.yaw, 160); c.fromCarrier = C.model; raid.defenders?.push(c); });
        this.events.push({ type: 'launch', C: C.model, n: R.deck.length });
      }
    }
    this.stepBeams(dt); this.stepMissiles(dt); this.stepBombs(dt);
  }
  stepBeams(dt) {
    for (const b of this.beams) {
      b.t += dt; const C = this.fleet.find(c => c.model === b.C);
      if (b.target.alive && b.t >= b.life) {
        // cut through: the plane of the cut runs across the craft, square to the beam
        const n = norm(V.sub(b.target.f.pos, b.from)); b.target.sliced = { n, t: this.t }; this.war.hit(b.target, 1e5, null); this.events.push({ type: 'sliced', craft: b.target, n, by: b.C });
      }
    }
    this.beams = this.beams.filter(b => b.t < b.life + 0.15);
  }
  stepMissiles(dt) {
    for (const m of this.missiles) {
      m.t += dt; if (m.t < 0) continue;
      if (m.phase === 'slide') {          // out of the cell along its rails, slowly, then it lights
        m.p = V.add(m.p, m.out, 9 * dt); if (m.t > 1.4) { m.phase = 'burn'; m.v = V.add(V.add([0, 0, 0], m.out, 40), [0, -6, 0]); this.events.push({ type: 'ignite', p: m.p.slice() }); }
        continue;
      }
      // guidance: pure pursuit on a live raider; with nothing to chase, it dives on the ground under where it last aimed
      const tgt = m.target?.alive ? m.target.f.pos : (m.aim ||= [m.p[0] + m.v[0] * 4, this.ground(m.p[0] + m.v[0] * 4, m.p[2] + m.v[2] * 4), m.p[2] + m.v[2] * 4]);
      const want = norm(V.sub(tgt, m.p)), sp = Math.min(520, V.len(m.v) + 260 * dt), cur = norm(m.v), turn = Math.min(1, dt * 3.2), d = norm(V.add(cur, V.sub(want, cur), turn));
      m.v = V.add([0, 0, 0], d, sp); m.p = V.add(m.p, m.v, dt); m.trail.push(m.p.slice()); if (m.trail.length > 40) m.trail.shift();
      if (m.target?.alive && V.len(V.sub(m.target.f.pos, m.p)) < 22) { this.war.hit(m.target, 400, null); this.war.booms.push({ p: m.p.slice(), t: 0, big: true }); m.dead = true; this.events.push({ type: 'kill', craft: m.target, by: m.from }); continue; }
      const g = this.ground(m.p[0], m.p[2]);
      if (m.p[1] <= g + 1 || m.t > 30) { m.dead = true; const p = [m.p[0], Math.max(g, m.p[1]), m.p[2]]; this.war.booms.push({ p, t: 0, big: true }); this.hooks.blast?.({ p, R: 26, by: m.from }); }
    }
    this.missiles = this.missiles.filter(m => !m.dead);
  }
  // the bomber's sortie: out along the raiders' line, scan, carpet, home
  bomber(C, S, dt, raid) {
    const H = S.home;
    if (!S.sortie && raid && !S.done?.has(raid.k) && raid.bearing !== undefined) {
      (S.done ||= new Set()).add(raid.k);
      const bx = Math.sin(raid.bearing), bz = Math.cos(raid.bearing), at = raid.target || [H.x, 0, H.z];
      S.sortie = { phase: 'out', a: [at[0] + bx * 2500, at[2] + bz * 2500], b: [at[0] + bx * 9000, at[2] + bz * 9000], t: 0, k: raid.k };
      this.events.push({ type: 'sortie', C: C.model });
    }
    const Q = S.sortie; if (!Q) return;
    Q.t += dt; const speed = 140, alt = 900;
    const goTo = (x, z, y, yawTo = true) => { const dx = x - C.x, dz = z - C.z, d = Math.hypot(dx, dz), step = Math.min(d, speed * dt); if (d > 1) { C.x += dx / d * step; C.z += dz / d * step; if (yawTo) { const want = Math.atan2(dx, dz), dy = Math.atan2(Math.sin(want - C.yaw), Math.cos(want - C.yaw)); C.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 0.12); } } C.y += (y - C.y) * Math.min(1, dt * 0.3); return d; };
    const gy = x => this.ground(C.x, C.z) + alt;
    if (Q.phase === 'out') { if (goTo(Q.a[0], Q.a[1], gy()) < 60) { Q.phase = 'scan'; Q.t = 0; this.events.push({ type: 'scan', C: C.model }); } }
    else if (Q.phase === 'scan' || Q.phase === 'bomb') {
      const d = goTo(Q.b[0], Q.b[1], gy());
      if (Q.phase === 'scan') { this.scans.push({ p: [C.x, C.y, C.z], t: 0, yaw: C.yaw }); if (Q.t > 7) { Q.phase = 'bomb'; Q.t = 0; Q.drop = 0; this.events.push({ type: 'bombs', C: C.model }); } }
      else { Q.drop -= dt; if (Q.drop <= 0 && Q.t < 9) { Q.drop = 0.22; for (const s of [-1, 1]) { const off = [Math.cos(C.yaw) * s * 380, 0, -Math.sin(C.yaw) * s * 380]; this.bombs.push({ p: V.add([C.x, C.y - 30, C.z], off), v: [0, -5, 0] }); } } }
      if (d < 60 || Q.t > 20) { Q.phase = 'home'; Q.t = 0; }
    } else if (Q.phase === 'home') { if (goTo(H.x, H.z, H.y) < 30) { C.x = H.x; C.z = H.z; C.y = H.y; const dy = Math.atan2(Math.sin(H.yaw - C.yaw), Math.cos(H.yaw - C.yaw)); C.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 0.1); if (Math.abs(dy) < 0.01) { C.yaw = H.yaw; S.sortie = null; this.events.push({ type: 'home', C: C.model }); } } }
    for (const s of this.scans) s.t += dt; this.scans = this.scans.filter(s => s.t < 1.2);
  }
  stepBombs(dt) {
    for (const b of this.bombs) {
      b.v[1] -= 9.8 * dt; b.p = V.add(b.p, b.v, dt); const g = this.ground(b.p[0], b.p[2]);
      if (b.p[1] <= g) { b.dead = true; const p = [b.p[0], g, b.p[2]]; this.war.booms.push({ p, t: 0, big: true }); this.hooks.blast?.({ p, R: 30, by: 'sable' }); }
    }
    this.bombs = this.bombs.filter(b => !b.dead);
  }
  away(model) { return !!this.state.get(model)?.sortie; }
  drain() { const e = this.events; this.events = []; return e; }
}
