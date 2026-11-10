// The war on foot (sim/front.js has it in the air and from the guns). Where two nations' lands meet, each side holds a line:
// sandbag walls in arcs facing the other way, hedgehogs and coils of wire in the ground between. Three objectives stand on
// the border: one each side holds, one in the middle nobody does. Squads come up from their rally points, run from cover to
// cover toward the nearest objective that isn't theirs, stop and fire at whatever of the other side they can see, and take a
// point by standing on it with nobody of the other side there. Shells (front.js) kill whoever they land on. You fight on
// whichever side you enlisted with: you count on an objective, they shoot at you, you're paid for what you put down.
// No three.js: render/infantry.js draws it.
const R_OBJ = 26, CAP_T = 14, PER_SIDE = 18, RANGE = 180, SPAN = 460;

const rnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export class Infantry {
  // ground(x, z) → height; hooks: hitPlayer(dmg, by), event(e)
  constructor({ ground, hooks = {} }) { this.ground = ground; this.hooks = hooks; this.F = null; this.men = []; this.obj = []; this.cover = []; this.props = []; this.shots = []; this.events = []; this.t = 0; this.n = 0; this.reinf = 0; }
  // the line along front F: where everything stands. (a: across the border, + toward the enemy; s: along it)
  setup(F) {
    this.F = F; this.men = []; this.shots = []; const ux = Math.sin(F.dir), uz = Math.cos(F.dir), px = -uz, pz = ux, r = rnd(Math.round(F.x * 7 + F.z * 13));
    const at = (a, s) => { const x = F.x + ux * a + px * s, z = F.z + uz * a + pz * s; return [x, this.ground(x, z), z]; };
    this.at = at; this.dir = F.dir;
    this.obj = [-280, 0, 280].map((s, i) => { const a = i === 0 ? -55 : i === 2 ? 55 : 0, prog = i === 0 ? 1 : i === 2 ? -1 : 0; return { id: i, name: ['West', 'Centre', 'East'][i], a, s, pos: at(a, s), prog, owner: prog > 0 ? 'ours' : prog < 0 ? 'theirs' : null }; });
    this.cover = [];
    // each side's works: a long breastwork of sandbags along its front line, broken where the ground's walked, and walls scattered forward of it toward the objectives
    for (const side of [-1, 1]) {
      for (let s = -SPAN; s < SPAN; s += 14 + r() * 8) if (r() < 0.82) { const a = side * (150 + Math.sin(s / 90 + side) * 18 + r() * 6), len = 9 + r() * 5;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.2, by: null, line: true }); }
      for (let k = 0; k < 30; k++) { const O = this.obj[k % 3], s = O.s + (r() - 0.5) * 220, a = side * (25 + r() * 115), len = 3.5 + r() * 4;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.7, by: null }); } }
    // between the lines: steel hedgehogs, runs of wire, a few burnt-out wrecks
    this.props = [];
    for (let k = 0; k < 26; k++) this.props.push({ kind: 'hedgehog', pos: at((r() - 0.5) * 90, (r() - 0.5) * 2 * SPAN), rot: r() * 6.28 });
    for (let k = 0; k < 9; k++) { const s = -SPAN + r() * 2 * SPAN, a = (r() - 0.5) * 70, L = 14 + r() * 16; this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: L, rot: F.dir + Math.PI / 2 + (r() - 0.5) * 0.4 }); }
    for (const side of [-1, 1]) for (let k = 0; k < 14; k++) { const s = -SPAN + r() * 2 * SPAN, a = side * (165 + r() * 4); this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: 18 + r() * 14, rot: F.dir + Math.PI / 2 }); }
    for (let k = 0; k < 7; k++) this.props.push({ kind: 'fire', pos: at((r() - 0.5) * 240, (r() - 0.5) * 2 * SPAN), size: 1 + r() * 2 });      // (what's burning out there: wrecks, stores, a field)
    this.rally = { ours: [-330, 0], theirs: [330, 0] };
    this.events.push({ type: 'line', F });
  }
  end() { this.F = null; this.men = []; this.shots = []; }
  spawn(side) {
    // up from the rally point to near one of the objectives (the first of them straight into their own line)
    const [a0] = this.rally[side], O = this.obj[Math.floor(Math.random() * 3)], s = O.s + (Math.random() - 0.5) * 200, first = this.n < PER_SIDE * 2, a = first ? (side === 'ours' ? -1 : 1) * (155 + Math.random() * 10) : a0 + (Math.random() - 0.5) * 60, p = this.at(a, s);
    const M = { id: `inf:${side}:${this.n++}`, side, pos: p, facing: side === 'ours' ? this.dir : this.dir + Math.PI, hp: 100, state: 'move', goal: null, cool: 1 + Math.random() * 2, dwell: 0, moving: false, aim: 0, dead: 0 };
    this.men.push(M); return M;
  }
  // you, as the sim sees you: { pos, side ('ours' | null), alive }
  step(dt, you) {
    if (!this.F) return; this.t += dt; this.shots = this.shots.filter(q => this.t - q.t < 0.25);
    const alive = this.men.filter(m => m.hp > 0);
    // reinforcements: each side keeps its strength up, the side holding more of the line a little stronger
    if ((this.reinf -= dt) <= 0) { this.reinf = 9; for (const side of ['ours', 'theirs']) { const held = this.obj.filter(o => o.owner === side).length, want = PER_SIDE + held, have = alive.filter(m => m.side === side).length; for (let k = have; k < Math.min(want, have + 4); k++) this.spawn(side); } }
    for (const M of this.men) {
      if (M.hp <= 0) { M.dead += dt; continue; }
      const foe = M.side === 'ours' ? 'theirs' : 'ours';
      // what it's going for: the nearest objective its side doesn't hold, else the one most at risk
      const want = this.obj.filter(o => o.owner !== M.side).sort((p, q) => Math.abs(p.s - this.local(M.pos)[1]) - Math.abs(q.s - this.local(M.pos)[1]))[0] || this.obj.slice().sort((p, q) => (M.side === 'ours' ? p.prog - q.prog : q.prog - p.prog))[0];
      // whom it can see to shoot at
      let tgt = null, td = RANGE;
      for (const E of alive) { if (E.side !== foe || E.hp <= 0) continue; const d = Math.hypot(E.pos[0] - M.pos[0], E.pos[2] - M.pos[2]); if (d < td && this.sees(M.pos, E.pos)) { td = d; tgt = E; } }
      if (you?.alive && you.side === foe) { const d = Math.hypot(you.pos[0] - M.pos[0], you.pos[2] - M.pos[2]); if (d < td && this.sees(M.pos, you.pos)) { td = d; tgt = 'you'; } }
      // moving: to a wall of its own side on the way to the objective; held there a while if there's someone to fight; then on, then onto the point itself
      if (M.state === 'move') {
        if (!M.goal) M.goal = this.nextCover(M, want);
        const g = M.goal.pos, dx = g[0] - M.pos[0], dz = g[2] - M.pos[2], d = Math.hypot(dx, dz);
        if (d < 1.2) { M.state = 'hold'; M.dwell = tgt ? 6 + Math.random() * 10 : 1.5 + Math.random() * 2; M.moving = false; }
        else { const sp = (tgt && td < 60 ? 4.6 : 3.4) * dt; M.pos = [M.pos[0] + dx / d * Math.min(sp, d), 0, M.pos[2] + dz / d * Math.min(sp, d)]; M.pos[1] = this.ground(M.pos[0], M.pos[2]); M.facing = Math.atan2(dx, dz); M.moving = true; }
      } else if (M.state === 'hold') {
        M.dwell -= dt; if (M.dwell <= 0 && !(tgt && td < 50)) { if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = this.near(M.pos, want.pos) < R_OBJ * 0.6 ? null : this.nextCover(M, want); M.state = M.goal ? 'move' : 'hold'; M.dwell = 4; }
      }
      // firing: turn to it, a shot every second or two, more likely to hit closer and in the open
      M.aim = tgt ? Math.min(1, M.aim + dt * 3) : Math.max(0, M.aim - dt * 2);
      if (tgt && !M.moving) {
        const tp = tgt === 'you' ? you.pos : tgt.pos; M.facing = Math.atan2(tp[0] - M.pos[0], tp[2] - M.pos[2]);
        if ((M.cool -= dt) <= 0) {
          M.cool = 0.9 + Math.random() * 1.6; const covered = tgt !== 'you' && tgt.state === 'hold' && tgt.goal?.C, p = (0.5 * (1 - td / RANGE) + 0.1) * (covered ? 0.45 : 1) * (tgt === 'you' ? 0.4 : 1), hit = Math.random() < p;
          const from = [M.pos[0] + Math.sin(M.facing) * 0.7, M.pos[1] + 1.42, M.pos[2] + Math.cos(M.facing) * 0.7], to = hit ? [tp[0], tp[1] + 1.1, tp[2]] : [tp[0] + (Math.random() - 0.5) * 4, tp[1] + Math.random() * 2.2, tp[2] + (Math.random() - 0.5) * 4];
          this.shots.push({ from, to, side: M.side, t: this.t, hit });
          if (hit) { const dmg = 30 + Math.random() * 22; if (tgt === 'you') this.hooks.hitPlayer?.(Math.round(dmg * 0.36), `a ${this.F.b.name} rifleman`); else this.hurt(tgt, dmg, M.side); }
        }
      }
    }
    this.men = this.men.filter(m => m.hp > 0 || m.dead < 40);
    // the objectives: taken by standing on them unopposed
    for (const O of this.obj) {
      let a = 0, b = 0; for (const m of alive) if (m.hp > 0 && this.near(m.pos, O.pos) < R_OBJ) m.side === 'ours' ? a++ : b++;
      if (you?.alive && you.side === 'ours' && this.near(you.pos, O.pos) < R_OBJ) a += 2;
      const was = O.owner; if (a && !b) O.prog = Math.min(1, O.prog + dt / CAP_T * Math.min(3, a) / 2); else if (b && !a) O.prog = Math.max(-1, O.prog - dt / CAP_T * Math.min(3, b) / 2);
      O.owner = O.prog >= 1 ? 'ours' : O.prog <= -1 ? 'theirs' : (was && Math.sign(O.prog) === (was === 'ours' ? 1 : -1) ? was : null);
      if (O.owner !== was) this.events.push({ type: O.owner === 'ours' ? 'taken' : O.owner === 'theirs' ? 'lost' : 'contested', O, you: you?.alive && this.near(you.pos, O.pos) < R_OBJ });
    }
  }
  local(p) { const dx = p[0] - this.F.x, dz = p[2] - this.F.z, ux = Math.sin(this.dir), uz = Math.cos(this.dir); return [dx * ux + dz * uz, dx * -uz + dz * ux]; }
  near(p, q) { return Math.hypot(p[0] - q[0], p[2] - q[2]); }
  // the ground in the way? sampled along the line at chest height
  sees(a, b) { for (let k = 1; k < 6; k++) { const f = k / 6, x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f, y = a[1] + 1.4 + (b[1] - a[1]) * f; if (this.ground(x, z) > y - 0.3) return false; } return true; }
  // the next wall of its own side toward the objective (behind it, on the side away from the enemy), else the objective itself
  nextCover(M, O) {
    const [a0, s0] = this.local(M.pos), fwd = M.side === 'ours' ? 1 : -1;
    let best = null, bc = Infinity;
    for (const C of this.cover) { if (C.by && C.by !== M.id) continue; const da = (C.a - a0) * fwd, ds = C.s - s0, toO = Math.hypot(C.a - O.a, C.s - O.s), here = Math.hypot(O.a - a0, O.s - s0);
      if (da < 4 || da > 110 || toO > here - 6) continue; const cost = Math.hypot(da, ds) + toO * 0.6 + (C.side !== M.side ? 25 : 0); if (cost < bc) { bc = cost; best = C; } }
    if (!best) { const j = (Math.random() - 0.5) * R_OBJ, k = (Math.random() - 0.5) * R_OBJ; return { pos: this.at(O.a + j * 0.5, O.s + k), C: null }; }
    best.by = M.id; const back = M.side === 'ours' ? -1.1 : 1.1, off = (Math.random() - 0.5) * best.len * 0.7; return { pos: this.at(best.a + back, best.s + off), C: best };
  }
  hurt(M, dmg, by) {
    if (M.hp <= 0) return false; M.hp -= dmg;
    if (M.hp <= 0) { M.hp = 0; M.moving = false; if (M.goal?.C?.by === M.id) M.goal.C.by = null; this.events.push({ type: 'down', M, by }); return true; }
    return false;
  }
  // a shell landing: everyone in its reach
  blast(p, R) { if (!this.F) return; for (const M of this.men) if (M.hp > 0) { const d = Math.hypot(M.pos[0] - p[0], M.pos[2] - p[2]); if (d < R * 1.3) this.hurt(M, 160 * (1 - d / (R * 1.3)) + 20, 'shell'); } }
  // your shot along a ray: the first soldier it meets before `best`, → { along, M }
  onRay(o, dir, best) {
    let hit = null;
    for (const M of this.men) { const lying = M.hp <= 0; for (const hy of lying ? [0.2] : [0.5, 1.0, 1.45]) { const px = M.pos[0] - o[0], py = M.pos[1] + hy - o[1], pz = M.pos[2] - o[2], along = px * dir[0] + py * dir[1] + pz * dir[2];
      if (along < 0.5 || along > best) continue; if (Math.hypot(px - dir[0] * along, py - dir[1] * along, pz - dir[2] * along) < 0.34) { best = along; hit = { along, M }; } } }
    return hit;
  }
  drain() { const e = this.events; this.events = []; return e; }
}
