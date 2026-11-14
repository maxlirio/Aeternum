// The war on foot (sim/front.js has it in the air and from the guns). Where two nations' lands meet, each side holds a line:
// sandbag walls facing the other way, hedgehogs and coils of wire in the ground between. Three objectives stand on the border:
// one each side holds, one in the middle nobody does. You fight on whichever side you enlisted with.
//
// How the men fight is taken from what's known to work (Orkin, "Three States and a Plan: the AI of F.E.A.R.", GDC 2006):
//  · they go from cover to cover toward the objective they want, and stop behind it to fire;
//  · fire coming close pins a man down: he ducks behind his wall, blind-fires over it, and won't move on until it eases;
//  · when one of a squad moves up, the others of it in cover fire harder to cover him;
//  · a man whose target is dug in behind a wall within throwing range flushes him out with a grenade, and men near where
//    one lands get away from it;
//  · they say what they're doing ("Moving!", "Covering!", "Grenade!", "Man down!"): coordination you can't hear may as well
//    not be there.
// And the pacing from Valve's (Booth, "The AI Systems of Left 4 Dead", 2009): your "intensity" rises as you're hurt, shot at
// and see men fall close by, and decays when nothing's on you; their side keeps its full strength coming while it builds, holds
// it 3-5 s past the peak, then falls back to a thin line until you've come down, and stays thin 30-45 s before building again.
// Men you put down drop what they carried (cells that top up shield and health, grenades): you get what you need by pushing
// forward, not by hanging back (id's "push forward combat", DOOM 2016).
// No three.js: render/infantry.js draws it.
const R_OBJ = 16, CAP_T = 12, PER_SIDE = 16, RANGE = 130, SPAN = 220, LINE = 60, RALLY = 150, SQUAD = 4, NADE_R = 6;
export const INF = { LINE, RALLY, RANGE, NADE_R };

const rnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const BARK = {
  contact: ['Contact!', 'Contact front!', 'Eyes on!', 'Targets!'], moving: ['Moving!', 'Moving up!', 'Going!'], covering: ['Covering!', 'Cover him!', 'Suppressing!'],
  pinned: ['Pinned down!', "I can't move!", 'Heads down!'], frag: ['Frag out!', 'Grenade out!'], nade: ['Grenade!', 'Get clear!'], mandown: ['Man down!', "He's down!", 'Lost one!'],
  got: ['Got him!', 'Tango down!', "He's down."], point: ['Taking the point!', 'On the point!'], alone: ['I need support!', 'Anyone left?', 'I need reinforcements!'],
  hit: ["I'm hit!", 'Agh!', 'Hit!'], you: ['Shooter!', 'Watch that one!', 'There, that one!'],
};
export class Infantry {
  // ground(x, z) → height; resolve(x, z, y) → [x, z] out of anything solid; hooks: hitPlayer(dmg, by, from)
  constructor({ ground, resolve = null, hooks = {} }) { this.ground = ground; this.resolve = resolve; this.hooks = hooks; this.F = null; this.men = []; this.obj = []; this.cover = []; this.props = []; this.shots = []; this.nades = []; this.drops = []; this.barks = []; this.events = []; this.t = 0; this.n = 0; this.shotN = 0; this.reinf = 0; this.int = 0; this.phase = 'build'; this.phT = 0; }
  // the line along front F: where everything stands. (a: across the border, + toward the enemy; s: along it)
  setup(F) {
    this.F = F; this.men = []; this.shots = []; this.nades = []; this.drops = []; this.barks = []; this.int = 0; this.phase = 'build'; this.phT = 0;
    const ux = Math.sin(F.dir), uz = Math.cos(F.dir), px = -uz, pz = ux, r = rnd(Math.round(F.x * 7 + F.z * 13));
    const at = (a, s) => { const x = F.x + ux * a + px * s, z = F.z + uz * a + pz * s; return [x, this.ground(x, z), z]; };
    this.at = at; this.dir = F.dir; this.u = [ux, uz]; this.v = [px, pz];
    this.obj = [-120, 0, 120].map((s, i) => { const a = i === 0 ? -22 : i === 2 ? 22 : 0, prog = i === 0 ? 1 : i === 2 ? -1 : 0; return { id: i, name: ['West', 'Centre', 'East'][i], a, s, pos: at(a, s), prog, owner: prog > 0 ? 'ours' : prog < 0 ? 'theirs' : null }; });
    this.cover = [];
    // each side's works: a breastwork of sandbags along its front line, broken where the ground's walked, and walls scattered forward of it toward the objectives
    for (const side of [-1, 1]) {
      for (let s = -SPAN; s < SPAN; s += 12 + r() * 7) if (r() < 0.8) { const a = side * (LINE + Math.sin(s / 60 + side) * 7 + r() * 4), len = 7 + r() * 4;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.2, by: null, line: true }); }
      for (let k = 0; k < 30; k++) { const O = this.obj[k % 3], s = O.s + (r() - 0.5) * 150, a = side * (8 + r() * 42), len = 3 + r() * 3.5;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.7, by: null }); } }
    // between the lines: steel hedgehogs, runs of wire, a few fires
    this.props = [];
    for (let k = 0; k < 22; k++) this.props.push({ kind: 'hedgehog', pos: at((r() - 0.5) * 40, (r() - 0.5) * 2 * SPAN), rot: r() * 6.28 });
    for (let k = 0; k < 7; k++) { const s = -SPAN + r() * 2 * SPAN, a = (r() - 0.5) * 30, L = 10 + r() * 12; this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: L, rot: F.dir + Math.PI / 2 + (r() - 0.5) * 0.4 }); }
    for (const side of [-1, 1]) for (let k = 0; k < 12; k++) { const s = -SPAN + r() * 2 * SPAN, a = side * (LINE + 12 + r() * 3); this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: 14 + r() * 10, rot: F.dir + Math.PI / 2 }); }
    for (let k = 0; k < 6; k++) this.props.push({ kind: 'fire', pos: at((r() - 0.5) * 110, (r() - 0.5) * 2 * SPAN), size: 1 + r() * 2 });
    this.rally = { ours: [-RALLY, 0], theirs: [RALLY, 0] };
    // you come up on a fight already going: each side's men all in, the first at its own sandbags, the rest forward of them
    this.n = 0; for (let k = 0; k < PER_SIDE; k++) for (const side of ['ours', 'theirs']) { const M = this.spawn(side); if (k % 3) { const [, s0] = this.local(M.pos); M.pos = at((side === 'ours' ? -1 : 1) * (14 + Math.random() * 36), s0); } }
    this.reinf = 6;
    this.events.push({ type: 'line', F });
  }
  end() { this.F = null; this.men = []; this.shots = []; this.nades = []; this.drops = []; this.barks = []; }
  spawn(side) {
    // up from the rally point to near one of the objectives (the first of them straight into their own line)
    const [a0] = this.rally[side], O = this.obj[Math.floor(Math.random() * 3)], s = O.s + (Math.random() - 0.5) * 140, first = this.n < PER_SIDE * 2, a = first ? (side === 'ours' ? -1 : 1) * (LINE + 3 + Math.random() * 5) : a0 + (Math.random() - 0.5) * 30, p = this.at(a, s);
    const k = this.n++, M = { id: `inf:${side}:${k}`, side, squad: Math.floor(k / 2) % SQUAD, pos: p, facing: side === 'ours' ? this.dir : this.dir + Math.PI, hp: 100, state: 'move', goal: null, cool: 1 + Math.random() * 2, dwell: 0, moving: false, aim: 0, dead: 0,
      sup: 0, duck: 0, flinch: 0, threat: 0, support: 0, nadeCd: 8 + Math.random() * 20, barkCd: Math.random() * 3, saw: false, fall: 0 };
    this.men.push(M); return M;
  }
  bark(M, kind, force = false) { if (!M || M.hp <= 0 || (!force && M.barkCd > 0)) return; const last = this.lastBark?.[M.side] ?? -9; if (!force && this.t - last < 1.1) return; (this.lastBark ||= {})[M.side] = this.t; M.barkCd = 5 + Math.random() * 4; this.barks.push({ M, text: pick(BARK[kind]), t: 0, kind }); }
  // you, as the sim sees you: { pos, side ('ours' | null), alive }
  step(dt, you) {
    if (!this.F) return; this.t += dt; this.shots = this.shots.filter(q => this.t - q.t < 0.3);
    for (const b of this.barks) b.t += dt; this.barks = this.barks.filter(b => b.t < 2.2 && b.M.hp > 0);
    const alive = this.men.filter(m => m.hp > 0), foeOfYou = you?.side === 'ours' ? 'theirs' : you?.side === 'theirs' ? 'ours' : null; let onYou = 0;
    this.director(dt);
    // reinforcements: each side keeps its strength up (theirs as the director allows), the side holding more of the line a little stronger
    if ((this.reinf -= dt) <= 0) { this.reinf = 7; for (const side of ['ours', 'theirs']) { const held = this.obj.filter(o => o.owner === side).length, cap = side === foeOfYou ? this.cap() : 1, want = Math.round((PER_SIDE + held) * cap), have = alive.filter(m => m.side === side).length; for (let k = have; k < Math.min(want, have + 4); k++) this.spawn(side); } }
    for (const M of this.men) {
      if (M.hp <= 0) { M.dead += dt; continue; }
      M.sup = Math.max(0, M.sup - dt * 0.18); M.flinch = Math.max(0, M.flinch - dt); M.threat = Math.max(0, M.threat - dt); M.support = Math.max(0, M.support - dt); M.nadeCd -= dt; M.barkCd -= dt;
      const foe = M.side === 'ours' ? 'theirs' : 'ours', inCover = M.state === 'hold' && !!M.goal?.C;
      // pinned: behind a wall, under fire, he keeps his head down (and comes back up as it eases)
      const pinned = (inCover || M.prone) && (M.sup > 0.5 || M.duck > 0.5 && M.sup > 0.3); M.duck += ((pinned ? 1 : 0) - M.duck) * Math.min(1, dt * 6);      // (down at 0.5, up again once it's eased below 0.3)
      if (pinned && M.sup > 0.85 && Math.random() < dt * 0.08) this.bark(M, "pinned");
      // what it's going for: the nearest objective its side doesn't hold, else the one most at risk
      const [, sM] = this.local(M.pos), want = this.obj.filter(o => o.owner !== M.side).sort((p, q) => Math.abs(p.s - sM) - Math.abs(q.s - sM))[0] || this.obj.slice().sort((p, q) => (M.side === 'ours' ? p.prog - q.prog : q.prog - p.prog))[0];
      // whom it can see to shoot at: the nearest, but you first if you've been shooting at him
      let tgt = null, td = RANGE;
      for (const E of alive) { if (E.side !== foe) continue; const d = Math.hypot(E.pos[0] - M.pos[0], E.pos[2] - M.pos[2]); if (d < td && this.sees(M.pos, E.pos)) { td = d; tgt = E; } }
      if (you?.alive && you.side === foe) { const d = Math.hypot(you.pos[0] - M.pos[0], you.pos[2] - M.pos[2]); if (d * (M.threat > 0 ? 0.25 : 0.5) < td && d < RANGE && this.sees(M.pos, you.pos)) { td = d; tgt = 'you'; } }
      if (tgt && !M.saw) { M.saw = true; this.bark(M, tgt === 'you' && M.threat > 0 ? 'you' : 'contact'); } if (!tgt) M.saw = false;
      if (tgt === 'you') onYou++;
      // moving: to a wall of its own side on the way to the objective; held there a while if there's someone to fight; then on, then onto the point itself
      // caught in the open under fire: he dives for the nearest wall, or goes flat where he is
      if (M.state === 'move' && M.sup > 0.6 && !M.diving) { M.diving = true; let best = null, bd = 14;
        for (const C of this.cover) { if (C.by && C.by !== M.id) continue; const d = this.near(C.pos, M.pos); if (d < bd) { bd = d; best = C; } }
        if (best) { if (M.goal?.C?.by === M.id) M.goal.C.by = null; best.by = M.id; const back = best.side === 'ours' ? -1 : 1; M.goal = { pos: this.at(best.a + back * (M.side === 'ours' ? 1 : -1) * (best.side === M.side ? 1 : -1), best.s + (Math.random() - 0.5) * best.len * 0.6), C: best }; }
        else { if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = { pos: M.pos.slice(), C: null }; M.prone = true; M.state = 'hold'; M.moving = false; M.dwell = 3 + Math.random() * 3; } }
      if (M.state === 'move') {
        if (!M.goal) M.goal = this.nextCover(M, want);
        const g = M.goal.pos, dx = g[0] - M.pos[0], dz = g[2] - M.pos[2], d = Math.hypot(dx, dz);
        if (d < 1.2) { M.state = 'hold'; M.diving = false; M.dwell = tgt ? 8 + Math.random() * 9 : 1.5 + Math.random() * 2; M.moving = false; if (!M.goal.C && this.near(M.pos, want.pos) < R_OBJ && Math.random() < 0.5) this.bark(M, 'point'); }
        else { const sp = (tgt && td < 60 ? 4.8 : 3.6) * (M.flinch > 0 ? 0.4 : 1) * dt; M.pos = [M.pos[0] + dx / d * Math.min(sp, d), 0, M.pos[2] + dz / d * Math.min(sp, d)]; M.facing = Math.atan2(dx, dz); M.moving = true;
          for (const N of this.men) if (N !== M && N.hp > 0) { const ox = M.pos[0] - N.pos[0], oz = M.pos[2] - N.pos[2], od = Math.hypot(ox, oz); if (od < 0.62 && od > 1e-4) { M.pos[0] += ox / od * (0.62 - od); M.pos[2] += oz / od * (0.62 - od); } }
          if (this.resolve) { const [rx, rz] = this.resolve(M.pos[0], M.pos[2], this.ground(M.pos[0], M.pos[2])); M.pos[0] = rx; M.pos[2] = rz; }
          M.pos[1] = this.ground(M.pos[0], M.pos[2]); }
      } else if (M.state === 'hold') {
        M.dwell -= dt * (pinned ? 0.15 : 1);      // (pinned, he stays put)
        if (M.dwell <= 0 && !(tgt && td < 40) || M.prone && !pinned && M.dwell <= 0) {
          M.prone = false; M.diving = false;
          if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = this.near(M.pos, want.pos) < R_OBJ * 0.6 ? null : this.nextCover(M, want); M.state = M.goal ? 'move' : 'hold'; M.dwell = 4;
          // bounding: he goes, and his squad in cover covers him
          if (M.goal && tgt) { let cov = null; for (const N of alive) if (N !== M && N.side === M.side && N.squad === M.squad && N.state === 'hold' && this.near(N.pos, M.pos) < 30) { N.support = 3; cov = N; } if (cov) { this.bark(M, 'moving'); this.bark(cov, 'covering', true); } }
        }
      }
      // a grenade, at a man dug in behind a wall (or you, when you've been shooting at him) within throwing range
      if (tgt && !M.moving && M.nadeCd <= 0 && td > 10 && td < 40 && !pinned) { const dug = tgt === 'you' ? M.threat > 0 : tgt.state === 'hold' && tgt.goal?.C;
        if (dug && Math.random() < dt * 0.4) { const tp = tgt === 'you' ? you.pos : tgt.pos; this.throwNade(M, [tp[0] + (Math.random() - 0.5) * 3, 0, tp[2] + (Math.random() - 0.5) * 3]); } }
      // firing: turn to it, a shot every second or so; more likely to hit closer and in the open, far less ducked or pinned
      M.aim = tgt ? Math.min(1, M.aim + dt * 3) : Math.max(0, M.aim - dt * 2);
      if (tgt && !M.moving && M.flinch <= 0) {
        const tp = tgt === 'you' ? you.pos : tgt.pos; M.facing = Math.atan2(tp[0] - M.pos[0], tp[2] - M.pos[2]);
        if ((M.cool -= dt * (M.support > 0 ? 1.8 : 1)) <= 0) {
          M.burst = (M.burst || 0) + 1; if (M.burst >= 3 + Math.floor(Math.random() * 2)) { M.burst = 0; M.cool = 1.1 + Math.random() * 1.4; } else M.cool = 0.16 + Math.random() * 0.1;      // (in bursts of three or four)
          const blind = M.duck > 0.5, tDuck = tgt !== 'you' && tgt.duck > 0.5, covered = tgt !== 'you' && tgt.state === 'hold' && tgt.goal?.C;
          let p = (0.32 * (1 - td / RANGE) + 0.06) * (covered ? 0.45 : 1) * (tDuck ? 0.25 : 1) * (blind ? 0.2 : 1) * (M.sup > 0.4 ? 0.6 : 1);
          if (tgt === 'you') { p *= 0.9; if (this.coverBetween([M.pos[0], M.pos[1] + 1.4, M.pos[2]], [tp[0], tp[1] + 0.9, tp[2]])) p *= 0.45; }      // (behind sandbags yourself, they'll hit you far less)
          const hit = Math.random() < p, from = [M.pos[0] + Math.sin(M.facing) * 0.7, M.pos[1] + (blind ? 1.0 : 1.42), M.pos[2] + Math.cos(M.facing) * 0.7];
          const miss = blind ? 6 : 3.2, to = hit ? [tp[0], tp[1] + 1.1, tp[2]] : [tp[0] + (Math.random() - 0.5) * miss, tp[1] + 0.2 + Math.random() * 2.2, tp[2] + (Math.random() - 0.5) * miss];
          this.shots.push({ from, to, side: M.side, t: this.t, hit, n: ++this.shotN, at: tgt === 'you' ? 'you' : null });
          // being shot at is what pins a man: hits and near misses, and more from men covering a move
          if (tgt !== 'you') { tgt.sup = Math.min(1, tgt.sup + (hit ? 0.3 : 0.14) * (M.support > 0 ? 1.6 : 1)); for (const N of alive) if (N !== tgt && N.side === foe && this.near(N.pos, to) < 4) N.sup = Math.min(1, N.sup + 0.07); }
          if (hit) { const dmg = 30 + Math.random() * 22; if (tgt === 'you') { this.int += dmg * 0.5 / 55; this.hooks.hitPlayer?.(Math.round(dmg * 0.5), `a ${this.F.b.name} rifleman`, M.pos); } else if (this.hurt(tgt, dmg, M.side, [tp[0] - M.pos[0], tp[2] - M.pos[2]])) this.bark(M, 'got'); }
        }
      }
    }
    // grenades: flying, then going off
    for (const N of this.nades) { N.age += dt; if (N.age >= N.T && !N.done) { N.done = true; this.explode(N, you); } } this.nades = this.nades.filter(N => !N.done);
    // nothing on you: you come down
    this.onYou = onYou; if (!onYou) this.int = Math.max(0, this.int - dt * 0.09);
    for (const D of this.drops) D.age += dt; this.drops = this.drops.filter(D => D.age < 90);
    this.men = this.men.filter(m => m.hp > 0 || m.dead < 40);
    // the objectives: taken by standing on them unopposed
    for (const O of this.obj) {
      let a = 0, b = 0; for (const m of alive) if (m.hp > 0 && this.near(m.pos, O.pos) < R_OBJ) m.side === 'ours' ? a++ : b++;
      if (you?.alive && you.side === 'ours' && this.near(you.pos, O.pos) < R_OBJ) a += 2;
      const was = O.owner; if (a && !b) O.prog = Math.min(1, O.prog + dt / CAP_T * Math.min(3, a) / 2); else if (b && !a) O.prog = Math.max(-1, O.prog - dt / CAP_T * Math.min(3, b) / 2);
      O.owner = O.prog >= 1 ? 'ours' : O.prog <= -1 ? 'theirs' : (was && Math.sign(O.prog) === (was === 'ours' ? 1 : -1) ? was : null);
      if (O.owner !== was) this.events.push({ type: O.owner === 'ours' ? 'taken' : O.owner === 'theirs' ? 'lost' : 'contested', O, you: you?.alive && this.near(you.pos, O.pos) < R_OBJ });
    }
    this.you = you;
  }
  // the pacing (L4D's director): build up → hold the peak 3-5 s → fade (their line thins) until you've come down → relax 30-45 s → build
  director(dt) {
    this.phT += dt; const I = this.int;
    if (this.phase === 'build' && I > 1) { this.phase = 'peak'; this.phT = 0; this.peakFor = 3 + Math.random() * 2; }
    else if (this.phase === 'peak' && this.phT > this.peakFor) { this.phase = 'fade'; this.phT = 0; }
    else if (this.phase === 'fade' && I < 0.35) { this.phase = 'relax'; this.phT = 0; this.relaxFor = 30 + Math.random() * 15; }
    else if (this.phase === 'relax' && this.phT > this.relaxFor) { this.phase = 'build'; this.phT = 0; }
  }
  cap() { return this.phase === 'fade' ? 0.45 : this.phase === 'relax' ? 0.6 : 1; }
  // you were shot at and it went close / something hit near you: how pressed you are
  felt(k) { this.int = Math.min(3, this.int + k); }
  // those a grenade's coming at see it in the air and get away from where it'll land
  scatter(to, side, share = 1) {
    for (const N of this.men) if (N.hp > 0 && N.side !== side && this.near(N.pos, to) < NADE_R * 1.6 && Math.random() < share) { if (N.goal?.C?.by === N.id) N.goal.C.by = null; const ax = N.pos[0] - to[0], az = N.pos[2] - to[2], l = Math.hypot(ax, az) || 1, run = NADE_R * 1.8;
      const x = to[0] + ax / l * run, z = to[2] + az / l * run; N.goal = { pos: [x, this.ground(x, z), z], C: null }; N.state = 'move'; N.duck = 0; N.sup = 0; this.bark(N, 'nade'); }
  }
  throwNade(M, to) {
    const from = [M.pos[0], M.pos[1] + 1.6, M.pos[2]], d = Math.hypot(to[0] - from[0], to[2] - from[2]); to[1] = this.ground(to[0], to[2]) + 0.12;
    this.nades.push({ from, to, age: 0, T: 0.9 + d / 22, side: M.side, by: M }); M.nadeCd = 22 + Math.random() * 20; this.bark(M, 'frag', true); this.scatter(to, M.side);
  }
  // yours, thrown from `from` to land at `to` (they see it coming, most of them): → the grenade
  throwYours(from, to) { to[1] = this.ground(to[0], to[2]) + 0.12; const d = Math.hypot(to[0] - from[0], to[2] - from[2]), N = { from, to, age: 0, T: 0.9 + d / 22, side: 'ours', by: 'player' }; this.nades.push(N); this.scatter(to, 'ours', 0.55); return N; }
  // where a grenade is now, along its arc
  nadeAt(N) { const f = Math.min(1, N.age / N.T), h = Math.max(2, Math.hypot(N.to[0] - N.from[0], N.to[2] - N.from[2]) * 0.3); return [N.from[0] + (N.to[0] - N.from[0]) * f, N.from[1] + (N.to[1] - N.from[1]) * f + 4 * h * f * (1 - f), N.from[2] + (N.to[2] - N.from[2]) * f]; }
  explode(N, you) {
    const p = N.to, by = N.by === 'player' ? 'player' : N.side; this.events.push({ type: 'nade', p, R: NADE_R, by });
    for (const M of this.men) if (M.hp > 0) { const d = this.near(M.pos, p); if (d < NADE_R) { const shelter = M.duck > 0.5 && M.goal?.C && this.coverBetween([p[0], p[1] + 0.3, p[2]], [M.pos[0], M.pos[1] + 0.6, M.pos[2]]); this.hurt(M, (130 * (1 - d / NADE_R) + 15) * (shelter ? 0.3 : 1), by, [M.pos[0] - p[0], M.pos[2] - p[2]]); } else if (d < NADE_R * 2.5) M.sup = Math.min(1, M.sup + 0.5); }
    if (you?.alive) { const d = this.near(you.pos, p); if (d < NADE_R) { const dmg = Math.round((70 * (1 - d / NADE_R) + 8) * (N.by === 'player' ? 0.6 : 1)); this.int += dmg / 50; this.hooks.hitPlayer?.(dmg, N.by === 'player' ? 'your own grenade' : 'a grenade', p); } else if (d < NADE_R * 3) this.int += 0.25; }
  }
  local(p) { const dx = p[0] - this.F.x, dz = p[2] - this.F.z, ux = Math.sin(this.dir), uz = Math.cos(this.dir); return [dx * ux + dz * uz, dx * -uz + dz * ux]; }
  near(p, q) { return Math.hypot(p[0] - q[0], p[2] - q[2]); }
  // the ground in the way? sampled along the line at chest height
  sees(a, b) { for (let k = 1; k < 6; k++) { const f = k / 6, x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f, y = a[1] + 1.4 + (b[1] - a[1]) * f; if (this.ground(x, z) > y - 0.3) return false; } return true; }
  // a sandbag wall across the ray from o along dir (unit) before `best`: → { along, C }, else null. Each wall runs along the line
  // (the s direction) at its a, 0.8 m high: a ray low enough meets it, one over the top goes on.
  coverOnRay(o, dir, best) {
    if (!this.F) return null; const [ux, uz] = this.u, [vx, vz] = this.v, dn = dir[0] * ux + dir[2] * uz; if (Math.abs(dn) < 1e-3) return null; let hit = null;
    for (const C of this.cover) { const t = ((C.pos[0] - o[0]) * ux + (C.pos[2] - o[2]) * uz) / dn; if (t < 0.4 || t > best) continue;
      const qx = o[0] + dir[0] * t, qz = o[2] + dir[2] * t, w = (qx - C.pos[0]) * vx + (qz - C.pos[2]) * vz; if (Math.abs(w) > C.len / 2) continue;
      const y = o[1] + dir[1] * t; if (y < C.pos[1] + 0.8 && y > C.pos[1] - 0.4) { best = t; hit = { along: t, C }; } }
    return hit;
  }
  coverBetween(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; return !!this.coverOnRay(a, [dx / L, dy / L, dz / L], L - 0.3); }
  // the next wall of its own side toward the objective (behind it, on the side away from the enemy), else the objective itself
  nextCover(M, O) {
    const [a0, s0] = this.local(M.pos), fwd = M.side === 'ours' ? 1 : -1;
    let best = null, bc = Infinity;
    for (const C of this.cover) { if (C.by && C.by !== M.id) continue; const da = (C.a - a0) * fwd, ds = C.s - s0, toO = Math.hypot(C.a - O.a, C.s - O.s), here = Math.hypot(O.a - a0, O.s - s0);
      if (da < 3 || da > 50 || toO > here - 4) continue; const cost = Math.hypot(da, ds) + toO * 0.6 + (C.side !== M.side ? 18 : 0); if (cost < bc) { bc = cost; best = C; } }
    if (!best) { const j = (Math.random() - 0.5) * R_OBJ, k = (Math.random() - 0.5) * R_OBJ; return { pos: this.at(O.a + j * 0.5, O.s + k), C: null }; }
    best.by = M.id; const back = M.side === 'ours' ? -1.0 : 1.0, off = (Math.random() - 0.5) * best.len * 0.7; return { pos: this.at(best.a + back, best.s + off), C: best };
  }
  // dir: [dx, dz] the blow came along (he falls that way)
  hurt(M, dmg, by, dir = null) {
    if (M.hp <= 0) return false; M.hp -= dmg; M.flinch = 0.28; M.sup = Math.min(1, M.sup + 0.35); if (by === 'player') M.threat = 10;
    if (dir) M.fall = Math.atan2(dir[0], dir[1]);
    if (M.hp <= 0) {
      M.hp = 0; M.moving = false; M.dead = 0; if (M.goal?.C?.by === M.id) M.goal.C.by = null; this.events.push({ type: 'down', M, by });
      if (this.you?.alive) { const d = this.near(M.pos, this.you.pos); if (d < 25) this.int += 0.2 * (1 - d / 25); }
      const mate = this.men.find(N => N !== M && N.hp > 0 && N.side === M.side && this.near(N.pos, M.pos) < 18); if (mate) this.bark(mate, 'mandown');
      const squad = this.men.filter(N => N.hp > 0 && N.side === M.side && N.squad === M.squad); if (squad.length === 1) this.bark(squad[0], 'alone');
      if (by === 'player' && Math.random() < 0.55) { const x = M.pos[0] + (Math.random() - 0.5), z = M.pos[2] + (Math.random() - 0.5); this.drops.push({ pos: [x, this.ground(x, z) + 0.15, z], kind: Math.random() < 0.7 ? 'cell' : 'nade', age: 0 }); }
      return true;
    }
    if (Math.random() < 0.35) this.bark(M, 'hit');
    return false;
  }
  // your shot went along this ray: everyone it went close by keeps his head down, and knows where it came from
  heard(o, dir, len) {
    for (const M of this.men) { if (M.hp <= 0) continue; const px = M.pos[0] - o[0], pz = M.pos[2] - o[2], h = Math.hypot(dir[0], dir[2]) || 1, along = (px * dir[0] + pz * dir[2]) / h;
      if (along < 0 || along > len + 2) continue; const off = Math.abs(px * dir[2] - pz * dir[0]) / h; if (off < 3.5) { M.sup = Math.min(1, M.sup + 0.3 * (1 - off / 3.5) + 0.05); M.threat = Math.max(M.threat, 6); } }
  }
  // what's lying where you stand (within r m): → the kinds picked up
  take(p, r = 1.6) { const got = []; this.drops = this.drops.filter(D => { if (this.near(D.pos, p) < r && Math.abs(D.pos[1] - p[1]) < 2) { got.push(D.kind); return false; } return true; }); return got; }
  // a shell landing: everyone in its reach
  blast(p, R) { if (!this.F) return; for (const M of this.men) if (M.hp > 0) { const d = Math.hypot(M.pos[0] - p[0], M.pos[2] - p[2]); if (d < R * 1.3) this.hurt(M, 160 * (1 - d / (R * 1.3)) + 20, 'shell', [M.pos[0] - p[0], M.pos[2] - p[2]]); else if (d < R * 3) M.sup = Math.min(1, M.sup + 0.5); } }
  // your shot along a ray: the first soldier it meets before `best`, → { along, M, head }. A man ducked behind his wall shows only
  // his head and shoulders over it.
  onRay(o, dir, best) {
    let hit = null;
    for (const M of this.men) { const lying = M.hp <= 0, ducked = M.duck > 0.5, pts = lying ? [[0.2, 0.34]] : ducked ? [[0.75, 0.3], [1.05, 0.2]] : [[0.5, 0.34], [1.0, 0.34], [1.5, 0.2]];
      for (const [hy, r] of pts) { const px = M.pos[0] - o[0], py = M.pos[1] + hy - o[1], pz = M.pos[2] - o[2], along = px * dir[0] + py * dir[1] + pz * dir[2];
        if (along < 0.5 || along > best) continue; if (Math.hypot(px - dir[0] * along, py - dir[1] * along, pz - dir[2] * along) < r) { best = along; hit = { along, M, head: !lying && hy > 1.04 }; } } }
    return hit;
  }
  drain() { const e = this.events; this.events = []; return e; }
}
