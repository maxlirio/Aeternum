// Armour on the line (sim/infantry.js holds the men and the works): each side's tanks and armoured carriers. Pure numbers, no
// three.js: render/armor.js draws them.
//
// What they do is what armour does in a fight on foot:
//  · tanks (the Warden: tracked, a long gun and a machine gun beside it) come up behind their own line, stop short of the
//    objective their side wants and fight from there: the gun against enemy armour, and high explosive into men dug in or
//    bunched up; the machine gun in bursts at men in the open. They stop to fire (a short halt), and the gun's stabilised.
//  · carriers (the Drover: eight wheels, a light cannon in a small turret) run a squad up close, drop the ramp and let them
//    out, then back off and support them; once empty they go back for more.
//  · neither drives through steel hedgehogs (that's what they're for); both flatten wire and burst sandbag walls they drive
//    over, which opens gaps for the men. A tank that's knocked out burns and stays where it died, as cover.
//  · armour is thick at the front, thinner at the sides, thin at the back: you flank a tank. Rifle rounds only spark off it.
//    Launchers (some of the men carry one, and so do you) and the guns of other tanks are what kill it.
// You can climb into one of your own side's tanks and fight it yourself.
const SPEC = {
  tank: { name: 'Warden', climb: 1.0, L: 7.4, W: 3.6, H: 2.45, top: 8.5, accel: 2.2, turn: 0.5, trav: 0.75, elev: 0.45, hp: 1400, arm: { front: 0.3, side: 0.75, rear: 1.35 },
    reload: 6.5, round: { kind: 'shell', vel: 620, dmg: 380, R: 5.2, he: 150 }, mg: true, range: 430, gunY: 1.98, pivot: 0.2, gunL: 6.5, minE: -0.14, maxE: 0.35 },
  apc: { name: 'Drover', climb: 0.6, L: 7.0, W: 2.9, H: 2.35, top: 11, accel: 3.2, turn: 0.65, trav: 1.3, elev: 0.8, hp: 420, arm: { front: 0.55, side: 0.9, rear: 1.2 },
    reload: 0.28, burst: 5, rest: 2.6, round: { kind: 'ac', vel: 900, dmg: 60, R: 1.8, he: 55 }, mg: false, range: 300, gunY: 2.3, pivot: 0.5, gunL: 3.4, minE: -0.15, maxE: 0.6, carry: 6 },
};
export const ARMOR = SPEC;
const ROCKET = { kind: 'rocket', vel: 115, dmg: 520, R: 2.4, he: 95 };
const G = 9.81, WANT = { tank: 2, apc: 1 };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Armor {
  // I: the Infantry it fights beside; hooks: hitPlayer(dmg, by, from), knock(vx, vz)
  constructor(I, hooks = {}) { this.I = I; this.hooks = hooks; this.list = []; this.rounds = []; this.events = []; this.t = 0; this.n = 0; this.respawn = { ours: 0, theirs: 0 }; }
  setup() {
    const I = this.I; this.list = []; this.rounds = []; this.respawn = { ours: 30, theirs: 30 };
    for (const side of ['ours', 'theirs']) { const sg = side === 'ours' ? -1 : 1;
      for (let k = 0; k < WANT.tank + (side === 'theirs' ? I.press?.tanks || 0 : 0); k++) this.spawn('tank', side, sg * (I.LINE + 16 + Math.random() * 8), (k ? 1 : -1) * (40 + Math.random() * 60));
      this.spawn('apc', side, sg * (I.LINE + 26), (Math.random() - 0.5) * 160); }
  }
  end() { this.list = []; this.rounds = []; }
  spawn(kind, side, a, s) {
    const I = this.I, T = SPEC[kind], f = side === 'ours' ? I.dir : I.dir + Math.PI;
    // on ground it can stand on: the flattest of a few places near where it was meant to be
    let best = null, bs = Infinity; for (let k = 0; k < 12; k++) { const a1 = a + (k ? (Math.random() - 0.5) * 30 : 0), s1 = s + (k ? (Math.random() - 0.5) * 80 : 0), q = I.at(a1, s1), sl = this.steep(q[0], q[2]); if (sl < bs) { bs = sl; best = q; } if (sl < 0.25) break; }
    const p = best;
    const V = { id: `veh:${side}:${kind}:${this.n++}`, kind, T, side, pos: p, facing: f, speed: 0, yawRate: 0, hp: T.hp, maxHp: T.hp, turret: f, gun: 0, reload: 2 + Math.random() * 3, burst: 0, mgCool: 1, mgBurst: 0,
      tgt: null, tgtT: 0, goal: null, planT: 0, state: kind === 'apc' ? 'run' : 'advance', holdT: 0, dead: false, deadT: 0, crew: 'ai', carry: kind === 'apc' ? T.carry : 0, dist: 0, recoil: 0, pitch: 0, roll: 0,
      lane: (Math.random() - 0.5) * 50, steer: f, ramp: 0, saw: false, sinceShot: 9, aimPt: null, mgOn: false, hits: 0 };
    this.list.push(V); return V;
  }
  alive() { return this.list.filter(V => !V.dead); }
  // how steep the ground is at (x, z): the biggest rise over 3 m any way
  steep(x, z) { const g = this.I.ground, h = g(x, z); return Math.max(Math.abs(g(x + 3, z) - h), Math.abs(g(x - 3, z) - h), Math.abs(g(x, z + 3) - h), Math.abs(g(x, z - 3) - h)) / 3; }
  drain() { const e = this.events; this.events = []; return e; }

  // ---- geometry: the hull as a box turned with it
  toLocal(V, x, z) { const dx = x - V.pos[0], dz = z - V.pos[2], fx = Math.sin(V.facing), fz = Math.cos(V.facing); return [dx * fz - dz * fx, dx * fx + dz * fz]; }       // → [right, forward]
  inHull(V, x, z, pad = 0) { const [u, w] = this.toLocal(V, x, z); return Math.abs(u) < V.T.W / 2 + pad && Math.abs(w) < V.T.L / 2 + pad; }
  // a ray from o along unit dir, up to `best`: the first hull it meets → { along, V }
  onRay(o, dir, best, skip = null, friends = null) {
    let hit = null;
    for (const V of this.list) { if (V === skip || friends && V.side === friends && !V.dead) continue; const t = this.rayHull(V, o, dir, best); if (t !== null && t < best) { best = t; hit = { along: t, V }; } }
    return hit;
  }
  rayHull(V, o, dir, best) {
    const fx = Math.sin(V.facing), fz = Math.cos(V.facing), rx = fz, rz = -fx, dx = o[0] - V.pos[0], dz = o[2] - V.pos[2];
    const O = [dx * rx + dz * rz, o[1] - V.pos[1], dx * fx + dz * fz], D = [dir[0] * rx + dir[2] * rz, dir[1], dir[0] * fx + dir[2] * fz];
    const lo = [-V.T.W / 2, 0.35, -V.T.L / 2], hi = [V.T.W / 2, V.dead && V.kind === 'tank' ? 1.6 : V.T.H, V.T.L / 2]; let t0 = 0, t1 = best;
    for (let i = 0; i < 3; i++) { if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) return null; continue; }
      let a = (lo[i] - O[i]) / D[i], b = (hi[i] - O[i]) / D[i]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null; }
    return t0 > 0.05 ? t0 : null;
  }
  // between a and b, is there a hull (a wreck or a live one) in the way? (cover for the men)
  blocks(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; return !!this.onRay(a, [dx / L, dy / L, dz / L], L - 0.4); }
  // how much of a blow gets through: thick in front, thinner at the sides, thin behind. dir: the way the round was going
  armour(V, dir) { const h = Math.hypot(dir[0], dir[2]) || 1, c = (dir[0] * Math.sin(V.facing) + dir[2] * Math.cos(V.facing)) / h; return c < -0.55 ? V.T.arm.front : c > 0.55 ? V.T.arm.rear : V.T.arm.side; }
  // a blow to V: → true when that's what knocked it out
  damage(V, dmg, by, dir = null) {
    if (V.dead) return false; const k = dir ? this.armour(V, dir) : 1; V.hp -= dmg * k; V.hits++;
    this.events.push({ type: 'hitV', V, pen: k >= 0.7, by });
    if (V.hp > 0) return false;
    V.hp = 0; V.dead = true; V.deadT = 0; V.speed = 0; V.carry = 0; this.events.push({ type: 'vdown', V, by });
    const I = this.I, [a, s] = I.local(V.pos);
    // what's left stands as cover where it died
    { const fx = Math.sin(V.facing), fz = Math.cos(V.facing), [ux, uz] = I.u, [vx, vz] = I.v, cu = fx * ux + fz * uz, cv = fx * vx + fz * vz;       // (how deep and how wide it is across the line, turned as it lies)
      I.cover.push({ i: I.cover.length, side: V.side, a, s, pos: V.pos.slice(), face: I.dir, len: (Math.abs(V.T.L * cv) + Math.abs(V.T.W * cu)) * 0.8, back: Math.abs(V.T.L / 2 * cu) + Math.abs(V.T.W / 2 * cv) + 0.8, curve: 0, by: null, wreck: V, h: 1.7, hp: 1e9 }); }
    // the crew get out, if they can
    if (V.crew === 'ai') for (let k = Math.random() < 0.5 ? 2 : 0; k > 0; k--) { const M = I.spawn(V.side); M.pos = this.rear(V, 1.5 + Math.random(), (Math.random() - 0.5) * 2); M.state = 'move'; M.goal = null; M.sup = 0.7; }
    this.respawn[V.side] = Math.max(this.respawn[V.side], 50);
    return true;
  }
  rear(V, back, side = 0) { const fx = Math.sin(V.facing), fz = Math.cos(V.facing), x = V.pos[0] - fx * (V.T.L / 2 + back) + fz * side, z = V.pos[2] - fz * (V.T.L / 2 + back) - fx * side; return [x, this.I.ground(x, z), z]; }
  muzzle(V) { const T = V.T, fx = Math.sin(V.turret), fz = Math.cos(V.turret), ce = Math.cos(V.gun), se = Math.sin(V.gun), bx = Math.sin(V.facing) * T.pivot, bz = Math.cos(V.facing) * T.pivot;
    return [V.pos[0] + bx + fx * ce * T.gunL, V.pos[1] + T.gunY + se * T.gunL, V.pos[2] + bz + fz * ce * T.gunL]; }
  gunDir(V) { const ce = Math.cos(V.gun); return [Math.sin(V.turret) * ce, Math.sin(V.gun), Math.cos(V.turret) * ce]; }

  // ---- your tank
  board(V) { if (V.dead || V.side !== 'ours') return false; V.crew = 'player'; V.goal = null; V.tgt = null; return true; }
  leave(V) { V.crew = 'ai'; V.drive = null; V.aimPt = null; V.mgOn = false; V.fire = false; }
  // what you're telling it: fwd/right -1..1, the point you're looking at, the gun and the machine gun
  control(V, { fwd, right, aim, fire, mg }) { V.drive = { fwd, right }; V.aimPt = aim; V.fire = fire; V.mgOn = mg; }

  step(dt, you) {
    const I = this.I; if (!I.F) return; this.t += dt; this.you = you;
    // each side keeps its armour up (theirs only while the director lets it: sim/infantry.js)
    for (const side of ['ours', 'theirs']) { if ((this.respawn[side] -= dt) > 0) continue; const foeOfYou = you?.side === 'ours' ? 'theirs' : 'ours';
      if (side === foeOfYou && I.cap() < 1 && Math.random() < 0.7) { this.respawn[side] = 5; continue; } const sg = side === 'ours' ? -1 : 1;
      for (const kind of ['tank', 'apc']) if (this.list.filter(V => !V.dead && V.side === side && V.kind === kind).length < WANT[kind] + (kind === 'tank' && side === 'theirs' ? I.press?.tanks || 0 : 0)) { this.spawn(kind, side, sg * (I.RALLY + 20), (Math.random() - 0.5) * 300); this.respawn[side] = 35; break; } }
    for (const V of this.list) {
      if (V.dead) { V.deadT += dt; continue; }
      V.reload -= dt; V.mgCool -= dt; V.recoil = Math.max(0, V.recoil - dt * 2.2); V.sinceShot += dt;
      if (V.crew === 'player') this.stepYours(V, dt); else this.think(V, dt, you);
      this.move(V, dt);
    }
    this.contacts(dt, you);
    this.stepRounds(dt, you);
    if (this.list.some(V => V.dead && V.deadT >= 400)) { this.list = this.list.filter(V => !V.dead || V.deadT < 400); I.cover = I.cover.filter(C => !C.wreck || this.list.includes(C.wreck)); }
  }

  // ---- the crew's thinking
  think(V, dt, you) {
    const I = this.I, T = V.T, side = V.side, foe = side === 'ours' ? 'theirs' : 'ours', fwd = side === 'ours' ? 1 : -1;
    // what to shoot at (looked at twice a second): enemy armour first, then you, then men
    if ((V.tgtT -= dt) <= 0) { V.tgtT = 0.5; let best = null, bs = T.range; const eye = [V.pos[0], V.pos[1] + T.gunY, V.pos[2]];
      for (const E of this.list) { if (E.dead || E.side === side) continue; const d = I.near(E.pos, V.pos), sc = d * (V.kind === 'tank' ? 0.45 : 1.3); if (sc < bs && this.sees(eye, [E.pos[0], E.pos[1] + 1.4, E.pos[2]])) { bs = sc; best = { V: E }; } }
      if (you?.alive && you.side === foe && !you.tank) { const d = I.near(you.pos, V.pos); if (d * 0.7 < bs && d < T.range * 0.7 && this.sees(eye, [you.pos[0], you.pos[1] + 1.2, you.pos[2]])) { bs = d * 0.7; best = { you: true }; } }
      for (const M of I.men) { if (M.hp <= 0 || M.side !== foe) continue; const d = I.near(M.pos, V.pos); if (d < bs && d < T.range * 0.75 && this.sees(eye, [M.pos[0], M.pos[1] + (M.duck > 0.5 ? 0.8 : 1.3), M.pos[2]])) { bs = d; best = { M }; } }
      if (best && !V.tgt) I.barkNear(V.pos, foe, 'tank');
      V.tgt = best; }
    // where to be
    if ((V.planT -= dt) <= 0 || !V.goal) { V.planT = 4; this.plan(V, fwd); }
    // the carrier: up to the drop, ramp down, out they go; then back and support; empty, back for more
    if (V.kind === 'apc') {
      if (V.state === 'drop') { V.holdT -= dt; V.ramp = Math.min(1, V.ramp + dt * 1.2);
        if (V.ramp >= 1 && V.carry > 0 && (V.dropT = (V.dropT || 0) - dt) <= 0) { V.dropT = 0.45; V.carry--; const M = I.spawn(side); M.pos = this.rear(V, 0.8, (Math.random() - 0.5) * 1.6); M.goal = null; M.state = 'move'; M.facing = V.facing; if (V.carry === 5) I.bark(M, 'dismount', true); }
        if (V.carry <= 0 && V.holdT <= 0) { V.state = 'back'; V.goal = null; V.planT = 0; } }
      else V.ramp = Math.max(0, V.ramp - dt * 0.8);
      if (V.state === 'home' && V.goal && I.near(V.pos, V.goal) < 6) { V.state = 'load'; V.holdT = 8; }
      if (V.state === 'load' && (V.holdT -= dt) <= 0) { V.carry = I.plan ? Math.min(T.carry, I.plan.left(side)) : Math.round(T.carry * (side === (you?.side === 'ours' ? 'theirs' : 'ours') ? I.cap() : 1)); V.state = 'run'; V.goal = null; V.planT = 0; }
      if (V.state === 'back' && (V.holdT -= dt) < -70) { V.state = 'home'; V.goal = null; V.planT = 0; }
    }
    // the gun
    const tp = this.tgtPoint(V);
    if (tp) {
      this.lay(V, tp, dt);
      const err = Math.abs(wrap(this.wantYaw(V, tp) - V.turret)) + Math.abs(this.wantElev(V, tp) - V.gun);
      // a short halt to fire, unless it's on the move to drop its men
      const halting = V.kind === 'tank' && V.reload < 0.6 && err < 0.08;
      V.halt = halting;
      if (err < 0.025 && V.reload <= 0) {
        const t = V.tgt, d = I.near(tp, V.pos), wantGun = V.kind === 'apc' || t.V || t.you || (t.M && (t.M.duck > 0.5 || t.M.state === 'hold' && t.M.goal?.C || I.men.filter(N => N.hp > 0 && N.side === t.M.side && I.near(N.pos, t.M.pos) < 7).length >= 2));
        if (wantGun && (V.kind === 'apc' || Math.abs(V.speed) < 1.2)) { const s = (0.0018 + d * 0.00001 + (Math.abs(V.speed) > 1 ? 0.004 : 0)) * (V.kind === 'apc' ? 2.5 : 1); this.fireGun(V, s, d); }
      }
      if (T.mg && V.tgt && (V.tgt.M || V.tgt.you) && V.mgCool <= 0) this.coax(V, tp);
    } else { V.halt = false; this.lay(V, null, dt); }
  }
  plan(V, fwd) {
    const I = this.I, [a0, s0] = I.local(V.pos);
    const want = I.wantFor(V.side, s0), ord = I.orders?.[V.side];
    let a, s;
    if (V.kind === 'tank') { a = want.a - fwd * (want.virtual ? 14 : ord?.mode === 'attack' ? 6 : want.owner === V.side ? 10 : 34); s = want.s + V.lane * (ord?.mode === 'attack' ? 0.5 : 1); }      // (ordered in, the tanks go onto the objective ahead of the men; otherwise they stand off and shoot)
    else if (V.state === 'run') { a = want.a - fwd * 22; s = want.s + V.lane * 0.4; }
    else if (V.state === 'back') { a = want.a - fwd * 55; s = want.s + V.lane; }
    else if (V.state === 'home' || V.state === 'load') { a = -fwd * (I.RALLY - 10); s = s0; }
    else { a = a0; s = s0; }
    // never past the far side's own line
    a = fwd > 0 ? Math.min(a, I.LINE - 8) : Math.max(a, -I.LINE + 8);
    V.goal = I.at(a, s);
  }
  // where to point: the target's centre (or where it'll be, if it's moving), with some error at range for the crew
  tgtPoint(V) {
    const t = V.tgt; if (!t) return null;
    if (t.V) { if (t.V.dead) { V.tgt = null; return null; } const E = t.V, f = Math.sin(E.facing) * E.speed, g = Math.cos(E.facing) * E.speed, d = this.I.near(E.pos, V.pos), tf = d / V.T.round.vel; return [E.pos[0] + f * tf, E.pos[1] + 1.2, E.pos[2] + g * tf]; }
    if (t.you) { const y = this.you; if (!y?.alive) { V.tgt = null; return null; } return [y.pos[0], y.pos[1] + 1.0 - 0.45 * (y.low || 0), y.pos[2]]; }
    if (t.M) { if (t.M.hp <= 0) { V.tgt = null; return null; } return [t.M.pos[0], t.M.pos[1] + (t.M.duck > 0.5 ? 0.5 : 0.9), t.M.pos[2]]; }
    return null;
  }
  wantYaw(V, p) { const b = this.pivot(V); return Math.atan2(p[0] - b[0], p[2] - b[2]); }
  // the elevation that drops the round onto p (low flat fire: the drop over the time of flight)
  wantElev(V, p) { const b = this.pivot(V), h = Math.hypot(p[0] - b[0], p[2] - b[2]), tf = h / V.T.round.vel; return Math.max(V.T.minE, Math.min(V.T.maxE, Math.atan2(p[1] - b[1] + 0.5 * G * tf * tf, h))); }
  pivot(V) { return [V.pos[0] + Math.sin(V.facing) * V.T.pivot, V.pos[1] + V.T.gunY, V.pos[2] + Math.cos(V.facing) * V.T.pivot]; }
  // turn the turret and lift the gun toward p at the rates they go (or back to the front with nothing to do)
  lay(V, p, dt) {
    const want = p ? this.wantYaw(V, p) : V.facing, e = p ? this.wantElev(V, p) : 0;
    V.turret += Math.max(-V.T.trav * dt, Math.min(V.T.trav * dt, wrap(want - V.turret))) + V.yawRate * dt * 0;
    V.gun += Math.max(-V.T.elev * dt, Math.min(V.T.elev * dt, e - V.gun));
  }
  fireGun(V, spread, d = 100) {
    const T = V.T, R = T.round, m = this.muzzle(V), g = this.gunDir(V), j = () => (Math.random() - 0.5) * 2 * spread;
    const dir = [g[0] + j(), g[1] + j() * 0.6, g[2] + j()], L = Math.hypot(...dir);
    this.rounds.push({ p: m, v: dir.map(x => x / L * R.vel), side: V.side, by: V.crew === 'player' ? 'player' : V, from: V, ...R, age: 0 });
    V.recoil = 1; V.sinceShot = 0; this.events.push({ type: 'fire', V, p: m, kind: R.kind });
    if (V.kind === 'apc') { V.burst++; if (V.burst >= T.burst) { V.burst = 0; V.reload = T.rest + Math.random(); } else V.reload = T.reload; } else V.reload = T.reload * (0.9 + Math.random() * 0.2);
    // being fired on by a tank pins men down, whether it hits or not
    if (V.tgt?.M) for (const N of this.I.men) if (N.hp > 0 && N.side !== V.side && this.I.near(N.pos, V.tgt.M.pos) < 10) N.sup = Math.min(1, N.sup + 0.3);
  }
  // the machine gun beside the main gun: bursts at men, the way a rifleman's fire works but more of it
  coax(V, tp) {
    const I = this.I, t = V.tgt, d = I.near(tp, V.pos); if (d > 240) return;
    V.mgBurst++; if (V.mgBurst >= 6 + Math.floor(Math.random() * 4)) { V.mgBurst = 0; V.mgCool = 1.3 + Math.random() * 1.2; } else V.mgCool = 0.09;
    const covered = t.M && t.M.state === 'hold' && t.M.goal?.C, ducked = t.M && t.M.duck > 0.5;
    let p = (0.3 * (1 - d / 240) + 0.04) * (covered ? 0.4 : 1) * (ducked ? 0.25 : 1);
    if (t.you && I.coverBetween([V.pos[0], V.pos[1] + 2, V.pos[2]], [tp[0], tp[1], tp[2]])) p *= 0.4;
    const hit = Math.random() < p, from = this.muzzle(V), mx = 3.5, to = hit ? tp.slice() : [tp[0] + (Math.random() - 0.5) * mx, tp[1] - 0.6 + Math.random() * 2, tp[2] + (Math.random() - 0.5) * mx];
    from[1] -= 0.1; I.shots.push({ from, to, side: V.side, t: I.t, hit, n: ++I.shotN, at: t.you ? 'you' : null, mg: true });
    if (t.M) { t.M.sup = Math.min(1, t.M.sup + (hit ? 0.35 : 0.2)); for (const N of I.men) if (N !== t.M && N.hp > 0 && N.side !== V.side && I.near(N.pos, to) < 5) N.sup = Math.min(1, N.sup + 0.1);
      if (hit) I.hurt(t.M, 34 + Math.random() * 14, V.side, [tp[0] - V.pos[0], tp[2] - V.pos[2]]); }
    else if (hit) { I.int += 0.25; this.hooks.hitPlayer?.(Math.round(16 + Math.random() * 8), `a ${I.F.b.name} tank's machine gun`, V.pos); }
  }
  sees(a, b) { const I = this.I; for (let k = 1; k < 8; k++) { const f = k / 8, x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f, y = a[1] + (b[1] - a[1]) * f; if (I.ground(x, z) > y - 0.2) return false; } return true; }

  // ---- your tank: drive as you say, the turret after the point you're looking at, the guns when you fire them
  stepYours(V, dt) {
    const c = V.drive || { fwd: 0, right: 0 }; V.halt = false;
    if (V.aimPt) this.lay(V, V.aimPt, dt);
    if (V.fire && V.reload <= 0) this.fireGun(V, 0.0006);
    if (V.mgOn && V.mgCool <= 0 && V.T.mg) { V.mgCool = 0.085; this.yourCoax(V); }
    // a carrier you're driving: stop, and the squad in the back gets out
    if (V.kind === 'apc') { V.stillT = Math.abs(V.speed) < 0.4 ? (V.stillT || 0) + dt : 0;
      if (V.carry > 0 && V.stillT > 1.2) { V.ramp = Math.min(1, V.ramp + dt * 1.2); if (V.ramp >= 1 && (V.dropT = (V.dropT || 0) - dt) <= 0) { V.dropT = 0.45; V.carry--; const M = this.I.spawn(V.side); M.pos = this.rear(V, 0.8, (Math.random() - 0.5) * 1.6); M.goal = null; M.state = 'move'; M.facing = V.facing; if (V.carry === V.T.carry - 1) this.I.bark(M, 'dismount', true); } }
      else V.ramp = Math.max(0, V.ramp - dt * 0.8); }
  }
  yourCoax(V) {
    const I = this.I, from = this.muzzle(V), g = this.gunDir(V), j = () => (Math.random() - 0.5) * 0.012, dir = [g[0] + j(), g[1] + j(), g[2] + j()], L = Math.hypot(...dir); for (let i = 0; i < 3; i++) dir[i] /= L;
    from[1] -= 0.1; let best = 260; const w = I.coverOnRay(from, dir, best); if (w) best = w.along; const v = this.onRay(from, dir, best, V); if (v) best = v.along;
    for (let d = 2; d < best; d += 2) if (I.ground(from[0] + dir[0] * d, from[2] + dir[2] * d) > from[1] + dir[1] * d) { best = d; break; }
    const m = I.onRay(from, dir, best); let hit = false; if (m) { best = m.along; if (m.M.hp > 0) { hit = true; const kill = I.hurt(m.M, 38, 'player', [dir[0], dir[2]]); this.events.push({ type: 'yourHit', kill }); } }
    if (v && !m) this.damage(v.V, 4, 'player', dir);
    I.heard(from, dir, best);
    const to = [from[0] + dir[0] * best, from[1] + dir[1] * best, from[2] + dir[2] * best]; I.shots.push({ from, to, side: 'ours', t: I.t, hit, n: ++I.shotN, mine: true, mg: true });
  }

  // ---- moving: toward the goal round what's in the way; tracks and wheels over whatever they can crush
  move(V, dt) {
    const I = this.I, T = V.T; let want = 0, turn = 0;
    if (V.crew === 'player') { const c = V.drive || { fwd: 0, right: 0 }; want = c.fwd * T.top * (c.fwd < 0 ? 0.45 : 1); turn = -c.right * T.turn * (V.speed < -0.3 ? -1 : 1); }
    else if (V.goal) {
      const dx = V.goal[0] - V.pos[0], dz = V.goal[2] - V.pos[2], d = Math.hypot(dx, dz);
      const arrive = V.kind === 'apc' && V.state === 'run' ? 3 : 5;
      if (d < arrive) { want = 0; if (V.kind === 'apc' && V.state === 'run') { V.state = 'drop'; V.holdT = 4; } if (V.kind === 'apc' && V.state === 'back' && V.holdT > 0) V.holdT = 0; }
      else {
        // pick the clearest heading near the way to the goal (looked at a few times a second)
        if ((V.steerT = (V.steerT || 0) - dt) <= 0) { V.steerT = 0.25; V.steer = this.clearHeading(V, Math.atan2(dx, dz)); }
        const e = wrap(V.steer - V.facing), back = V.kind === 'apc' && V.state === 'back' && Math.abs(wrap(Math.atan2(dx, dz) - V.facing)) > 2.2 && d < 50;      // (backing off, a carrier keeps its nose to the enemy)
        if (back) { want = -T.top * 0.4; turn = 0; }
        else { turn = Math.max(-T.turn, Math.min(T.turn, e * 2)); want = T.top * Math.max(0.15, Math.cos(Math.min(1.5, Math.abs(e)))) * Math.min(1, d / 18); }
        if (V.halt) want = 0;
        if (V.kind === 'apc' && V.state === 'drop') want = 0;
        // our own drivers look out for you: on foot (or flat on the ground) in the way ahead of the hull, they stop for you
        { const y = this.you; if (V.side === 'ours' && y?.alive && !y.tank && want !== 0) { const [r, f] = this.toLocal(V, y.pos[0], y.pos[2]), ahead = f * Math.sign(want);
          if (Math.abs(r) < T.W / 2 + 1.4 && ahead > -T.L / 2 && ahead < T.L / 2 + 4 + Math.abs(V.speed) * 1.2) want = 0; } }
      }
    }
    // what it drives on: the land and the rocks lying on it (a low one it climbs, a tall one stops it)
    const gnd = this.footing(V);
    // slope: up a rise it slows
    const fx = Math.sin(V.facing), fz = Math.cos(V.facing), hf = gnd(V.pos[0] + fx * T.L * 0.45, V.pos[2] + fz * T.L * 0.45), hb = gnd(V.pos[0] - fx * T.L * 0.45, V.pos[2] - fz * T.L * 0.45);
    const slope = (hf - hb) / (T.L * 0.9) * Math.sign(V.speed || 1); if (slope > 0.2) want *= Math.max(0.3, 1 - (slope - 0.2) * 2);
    // too steep ahead (a tank gives up at about 30°): it won't go on up it
    { const sg = Math.sign(want || V.speed || 1), x2 = V.pos[0] + fx * sg * (T.L / 2 + 2.5), z2 = V.pos[2] + fz * sg * (T.L / 2 + 2.5), rise = (Math.max(...[-0.38, 0, 0.38].map(k => gnd(x2 + fz * k * T.W, z2 - fx * k * T.W, true))) - (sg > 0 ? gnd(V.pos[0] + fx * T.L * 0.45, V.pos[2] + fz * T.L * 0.45, true) : gnd(V.pos[0] - fx * T.L * 0.45, V.pos[2] - fz * T.L * 0.45, true))) / 2.5; if (rise > 0.6) { if (Math.sign(want) === sg) want = 0; if (Math.sign(V.speed) === sg) V.speed *= 0.5; V.steerT = 0; } }
    const acc = Math.abs(want) > Math.abs(V.speed) ? T.accel : T.accel * 2.2; V.speed += Math.max(-acc * dt, Math.min(acc * dt, want - V.speed));
    V.yawRate += (turn - V.yawRate) * Math.min(1, dt * 4); V.facing += V.yawRate * dt;
    let nx = V.pos[0] + Math.sin(V.facing) * V.speed * dt, nz = V.pos[2] + Math.cos(V.facing) * V.speed * dt;
    // hard things: hedgehogs, other hulls
    for (const P of I.props) { if (P.kind !== 'hedgehog') continue; const R = T.W / 2 + 0.9, dx = nx - P.pos[0], dz = nz - P.pos[2], d = Math.hypot(dx, dz); if (d < R + T.L / 2) { const [u, w] = this.toLocalAt(nx, nz, V.facing, P.pos[0], P.pos[2]); if (Math.abs(u) < T.W / 2 + 0.9 && Math.abs(w) < T.L / 2 + 0.9) { const k = (R + T.L / 2 - d) / (d || 1) * 0.15; nx += dx * k; nz += dz * k; V.speed *= 0.6; } } }
    // a rock too tall to climb is as hard as a hull: it stops you and you go round it
    for (const q of V.rk) { if (q.top <= T.climb) continue; const [u, w] = this.toLocalAt(nx, nz, V.facing, q.x, q.z), R = q.r * 0.8, ou = Math.abs(u) - T.W / 2 - R, ow = Math.abs(w) - T.L / 2 - R; if (ou < 0 && ow < 0) { const dx = nx - q.x, dz = nz - q.z, d = Math.hypot(dx, dz) || 1, k = Math.min(-ou, -ow) / d; nx += dx * k; nz += dz * k; V.speed *= 0.4; } }
    // and everything else in the world that's solid: buildings, outposts, cars and wrecks, trees (a small tree it knocks down)
    if (this.hooks.solid && (Math.abs(V.speed) > 0.05 || Math.abs(V.yawRate) > 0.02)) {
      const sf = Math.sin(V.facing), cf = Math.cos(V.facing), r = T.W / 2, sg = Math.sign(V.speed || 1);
      if (Math.abs(V.speed) > 1.2) this.hooks.fell?.(nx + sf * T.L * 0.5 * sg, nz + cf * T.L * 0.5 * sg, T.W / 2 + 0.8, V.facing, V.pos[1]);
      for (const k of [1, 0, -1]) { const ox = sf * k * (T.L / 2 - r), oz = cf * k * (T.L / 2 - r), [rx, rz] = this.hooks.solid(nx + ox, nz + oz, V.pos[1] + T.climb, r, T.H - T.climb);
        const mx = rx - (nx + ox), mz = rz - (nz + oz); if (mx * mx + mz * mz > 1e-6) { nx += mx; nz += mz; V.speed *= 0.5; V.steerT = 0; } } }
    for (const E of this.list) { if (E === V) continue; const dx = nx - E.pos[0], dz = nz - E.pos[2], d = Math.hypot(dx, dz), R = (T.L + E.T.L) * 0.32 + 0.4; if (d < R && d > 1e-3) { const k = (R - d) / d * 0.5; nx += dx * k; nz += dz * k; V.speed *= 0.7; } }
    V.dist += Math.hypot(nx - V.pos[0], nz - V.pos[2]) * Math.sign(V.speed || 1);
    // the hull rests on the highest things under its tracks: nose up a rise or a rock, a lean across a slope
    const cf = Math.cos(V.facing), sf = Math.sin(V.facing), au = T.W * 0.4; let f = -Infinity, bk = -Infinity, l = -Infinity, r = -Infinity; const pts = [];
    for (const w of [-0.48, -0.24, 0, 0.24, 0.48]) for (const u of [-au, au]) { const W = w * T.L, y = gnd(nx + sf * W + cf * u, nz + cf * W - sf * u); pts.push([u, W, y]); if (w > 0.1) f = Math.max(f, y); if (w < -0.1) bk = Math.max(bk, y); if (u < 0) l = Math.max(l, y); else r = Math.max(r, y); }
    const sp = (f - bk) / (T.L * 0.72), sr = (l - r) / (2 * au); let cy = Math.max((f + bk) / 2, (l + r) / 2, gnd(nx, nz) - 0.3);
    for (const [u, W, y] of pts) cy = Math.max(cy, y - (W * sp - u * sr) - 0.2);      // nothing under it pokes up through the belly
    V.pos = [nx, cy, nz];
    V.pitch += (Math.atan(sp) - V.pitch) * Math.min(1, dt * 6); V.roll += (Math.atan(sr) - V.roll) * Math.min(1, dt * 6);
    if (Math.abs(V.speed) > 0.5) this.crush(V);
  }
  // the ground a hull rides on near V: the land, and the rocks on it (looked up again when it has moved on)
  footing(V) {
    const I = this.I;
    if (!V.rk || Math.hypot(V.pos[0] - V.rkAt[0], V.pos[2] - V.rkAt[1]) > 4) { V.rkAt = [V.pos[0], V.pos[2]]; V.rk = [];
      this.hooks.rocks?.(V.pos[0], V.pos[2], V.T.L / 2 + 22, q => { const g = q.g ?? I.ground(q.x, q.z); V.rk.push({ x: q.x, z: q.z, r: q.r, y: g + q.top, top: q.top, flat: q.flat }); }); }
    const rk = V.rk;
    const climb = V.T.climb;
    return (x, z, tall = false) => { let h = I.ground(x, z); for (const q of rk) { if (tall && q.top <= climb) continue; const d2 = ((x - q.x) ** 2 + (z - q.z) ** 2) / (q.r * q.r); if (d2 >= 1) continue; const y = q.flat ? q.y - q.top * Math.max(0, (Math.sqrt(d2) - 0.7) / 0.3) : q.y - q.top * (1 - Math.sqrt(1 - d2)); if (y > h) h = y; } return h; };
  }
  toLocalAt(x0, z0, f, x, z) { const dx = x - x0, dz = z - z0, fx = Math.sin(f), fz = Math.cos(f); return [dx * fz - dz * fx, dx * fx + dz * fz]; }
  // the heading near `want` with the clearest 12 m ahead of it
  clearHeading(V, want) {
    const I = this.I, T = V.T, gnd = this.footing(V); let best = want, bc = Infinity;
    for (const off of [0, 0.2, -0.2, 0.4, -0.4, 0.65, -0.65, 0.95, -0.95, 1.3, -1.3]) { const h = want + off, fx = Math.sin(h), fz = Math.cos(h); let block = 0;
      let hPrev = gnd(V.pos[0] + fx * 1, V.pos[2] + fz * 1, true);
      for (let d = 3; d <= 14; d += 2.75) { const x = V.pos[0] + fx * d, z = V.pos[2] + fz * d, hh = gnd(x, z, true); if ((hh - hPrev) / 2.75 > 0.5) block += 4; hPrev = hh;
        for (const P of I.props) if (P.kind === 'hedgehog' && Math.hypot(P.pos[0] - x, P.pos[2] - z) < T.W / 2 + 1.4) block += 3;
        if (this.hooks.solid) { const [rx, rz] = this.hooks.solid(x, z, hh + T.climb, T.W / 2, T.H - T.climb); if (Math.hypot(rx - x, rz - z) > 0.05) block += 3; }
        for (const E of this.list) if (E !== V && Math.hypot(E.pos[0] - x, E.pos[2] - z) < (T.W + E.T.L) / 2 + 0.6) block += E.dead ? 3 : 1.5;
        for (const C of I.cover) if (!C.down && !C.wreck && C.side === V.side && C.line && this.nearWall(C, x, z) < T.W / 2 + 0.4) block += 1; }
      const cost = block * 10 + Math.abs(off) * 3; if (cost < bc) { bc = cost; best = h; } }
    return best;
  }
  nearWall(C, x, z) { const I = this.I, [vx, vz] = I.v, [ux, uz] = I.u, dx = x - C.pos[0], dz = z - C.pos[2], w = dx * vx + dz * vz, n = dx * ux + dz * uz; return Math.hypot(Math.max(0, Math.abs(w) - C.len / 2), n); }
  // what's under the hull: wire flattened, sandbags burst, men in the way run down
  crush(V) {
    const I = this.I, T = V.T;
    for (const W of I.props) { if (W.kind !== 'wire') continue; if (I.near(W.pos, V.pos) > W.len / 2 + T.L) continue; for (const S of W.segs) if (!S.dead) { const [x, z] = I.segAt(W, S); if (this.inHull(V, x, z, 0.6)) { S.dead = 'crushed'; I.events.push({ type: 'wire', W }); } } }
    for (const C of I.cover) { if (C.down || C.wreck) continue; if (I.near(C.pos, V.pos) > C.len / 2 + T.L) continue; const n = Math.max(2, Math.round(C.len / 1.5));
      for (let k = 0; k <= n; k++) { const s = (k / n - 0.5) * C.len, x = C.pos[0] + I.v[0] * s, z = C.pos[2] + I.v[1] * s; if (this.inHull(V, x, z, 0.2)) { I.breach(C); V.speed *= 0.5; break; } } }
    for (const M of I.men) { if (M.hp <= 0 || !this.inHull(V, M.pos[0], M.pos[2], 0.35)) continue;
      if (Math.abs(V.speed) > 1.6) I.hurt(M, 250, V.crew === 'player' ? 'player' : V.side, [Math.sin(V.facing), Math.cos(V.facing)]);
      else { const [u] = this.toLocal(V, M.pos[0], M.pos[2]), sg = Math.sign(u || 1), k = T.W / 2 + 0.5 - Math.abs(u); M.pos[0] += Math.cos(V.facing) * sg * k; M.pos[2] -= Math.sin(V.facing) * sg * k; } }
    const y = this.you; if (y?.alive && !y.tank && this.inHull(V, y.pos[0], y.pos[2], 0.4) && Math.abs(V.speed) > 1.6 && this.t - (this.ranOver || -9) > 1.2) { this.ranOver = this.t; this.hooks.hitPlayer?.(Math.round(30 + Math.abs(V.speed) * 9), `a ${V.T.name}`, V.pos); this.hooks.knock?.(Math.sin(V.facing) * 6, Math.cos(V.facing) * 6); }
  }
  // the men see it and say so; enemy men near it keep their heads down
  contacts(dt, you) {
    const I = this.I;
    for (const V of this.list) { if (V.dead) continue;
      for (const M of I.men) { if (M.hp <= 0 || M.side === V.side) continue; const d = I.near(M.pos, V.pos); if (d < 35 && !M.at) M.sup = Math.min(1, M.sup + dt * 0.25 * (1 - d / 35)); } }
  }

  // ---- launchers: the men's, and yours
  rocket(from, to, side, by, err = 0) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], L = Math.hypot(dx, dy, dz) || 1, j = () => (Math.random() - 0.5) * 2 * err;
    const dir = [dx / L + j(), dy / L + j() * 0.5, dz / L + j()], l = Math.hypot(...dir);
    this.rounds.push({ p: from.slice(), v: dir.map(x => x / l * ROCKET.vel), side, by, from: null, ...ROCKET, age: 0 });
    this.events.push({ type: 'launch', p: from.slice(), by });
  }
  // a blast near hulls (a grenade, a shell landing): a little through the deck, more the closer
  splash(p, R, dmg, by) { for (const V of this.list) { if (V.dead || by === V.side) continue; const d = I_near(V.pos, p); if (d < R + V.T.L / 2) { const k = Math.max(0, 1 - Math.max(0, d - V.T.L / 3) / R); if (k > 0) this.damage(V, dmg * k * (V.kind === 'tank' ? 0.25 : 0.6), by, null); } } }

  // ---- rounds in flight: gravity on shells, rockets straight; they stop at the first thing they meet
  stepRounds(dt, you) {
    const I = this.I, keep = [];
    for (const R of this.rounds) {
      R.age += dt; if (R.kind !== 'rocket') R.v[1] -= G * dt; else if (R.age > 0.25) R.v[1] -= G * 0.25 * dt;
      const sp = Math.hypot(...R.v), dir = R.v.map(x => x / sp), len = sp * dt, o = R.p; let best = len, hit = null;
      const v = this.onRay(o, dir, best, R.age < 0.2 ? R.from : null, R.by === 'player' ? null : R.side); if (v) { best = v.along; hit = { V: v.V }; }
      const w = I.coverOnRay(o, dir, best); if (w) { best = w.along; hit = { C: w.C }; }
      const m = I.onRay(o, dir, best); if (m && m.M.hp > 0) { best = m.along; hit = { M: m.M }; }
      if (you?.alive && !you.tank && R.side !== you.side) { const px = you.pos[0] - o[0], py = you.pos[1] + 1 - 0.45 * (you.low || 0) - o[1], pz = you.pos[2] - o[2], al = px * dir[0] + py * dir[1] + pz * dir[2]; if (al > 0 && al < best && Math.hypot(px - dir[0] * al, py - dir[1] * al, pz - dir[2] * al) < 0.45) { best = al; hit = { you: true }; } }
      for (let k = 1; k <= 4; k++) { const d = best * k / 4, x = o[0] + dir[0] * d, z = o[2] + dir[2] * d; if (I.ground(x, z) > o[1] + dir[1] * d) { best = d; hit = { ground: true }; break; } }
      const p = [o[0] + dir[0] * best, o[1] + dir[1] * best, o[2] + dir[2] * best];
      if (hit) { this.impact(R, p, dir, hit, you); continue; }
      R.p = p; if (R.age < 4) keep.push(R);
    }
    this.rounds = keep;
  }
  impact(R, p, dir, hit, you) {
    const I = this.I, by = R.by === 'player' ? 'player' : R.side;
    if (hit.V) { const kill = this.damage(hit.V, R.dmg, by, dir); if (R.by === 'player') this.events.push({ type: 'yourHitV', V: hit.V, kill, pen: this.armour(hit.V, dir) >= 0.7 }); }
    if (hit.M && R.by === 'player') this.events.push({ type: 'yourHit', kill: false });
    this.events.push({ type: 'blast', p, R: R.R, kind: R.kind, onHull: !!hit.V });
    // the blast: men, you, the works
    for (const M of I.men) { if (M.hp <= 0) continue; const d = I.near(M.pos, p) + Math.max(0, Math.abs(M.pos[1] + 0.8 - p[1]) - 1); if (d < R.R) { const shelter = M.duck > 0.5 && M.goal?.C && I.coverBetween([p[0], p[1] + 0.3, p[2]], [M.pos[0], M.pos[1] + 0.6, M.pos[2]]); const kill = I.hurt(M, (R.he * (1 - d / R.R) + 12) * (shelter ? 0.35 : 1) * (hit.M === M ? 3 : 1), by, [M.pos[0] - p[0], M.pos[2] - p[2]]); if (R.by === 'player' && kill) this.events.push({ type: 'yourHit', kill: true }); } else if (d < R.R * 3) M.sup = Math.min(1, M.sup + 0.45); }
    if (you?.alive && !you.tank) { const d = I.near(you.pos, p); if (hit.you || d < R.R) { const dmg = Math.round(hit.you ? R.he * 0.9 : (R.he * 0.6) * (1 - d / R.R) + 6); I.int += dmg / 45; this.hooks.hitPlayer?.(dmg, R.by === 'player' ? 'your own round' : R.kind === 'rocket' ? 'a launcher round' : `a ${I.F.b.name} ${R.kind === 'shell' ? 'tank shell' : 'cannon round'}`, p); } else if (d < R.R * 4) I.int += 0.3; }
    I.damageCover(p, R.R, R.he * 2.2); I.cutWire(p, R.R * 0.6);
    if (!hit.V) this.splash(p, R.R, R.he, by);
  }
}
const I_near = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]);
