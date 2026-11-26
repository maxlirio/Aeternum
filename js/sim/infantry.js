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
import { TownNav } from './townnav.js';
const GUN_HP = 260, GUN_RANGE = 170;
const R_OBJ = 16, CAP_T = 12, PER_SIDE = 16, RANGE = 130, SPAN = 220, LINE = 60, RALLY = 150, SQUAD = 4, NADE_R = 6;
export const INF = { LINE, RALLY, RANGE, NADE_R };

const rnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const BARK = {
  contact: ['Contact!', 'Contact front!', 'Eyes on!', 'Targets!'], moving: ['Moving!', 'Moving up!', 'Going!'], covering: ['Covering!', 'Cover him!', 'Suppressing!'],
  pinned: ['Pinned down!', "I can't move!", 'Heads down!'], frag: ['Frag out!', 'Grenade out!'], nade: ['Grenade!', 'Get clear!'], mandown: ['Man down!', "He's down!", 'Lost one!'],
  got: ['Got him!', 'Tango down!', "He's down."], point: ['Taking the point!', 'On the point!'], alone: ['I need support!', 'Anyone left?', 'I need reinforcements!'],
  hit: ["I'm hit!", 'Agh!', 'Hit!'], you: ['Shooter!', 'Watch that one!', 'There, that one!'],
  tank: ['Tank!', 'Armour!', 'Enemy armour!'], launcher: ['Launcher!', 'Rocket out!', 'Firing AT!'], dismount: ['Dismount!', 'Out, out, out!', 'Go, go, go!'],
};
const WIRE_SEG = 2;
export class Infantry {
  // ground(x, z) → height; resolve(x, z, y) → [x, z] out of anything solid; hooks: hitPlayer(dmg, by, from)
  constructor({ ground, resolve = null, hooks = {} }) { this.ground = ground; this.resolve = resolve; this.hooks = hooks; this.F = null; this.armor = null; this.LINE = LINE; this.RALLY = RALLY; this.men = []; this.obj = []; this.cover = []; this.props = []; this.shots = []; this.nades = []; this.drops = []; this.barks = []; this.events = []; this.t = 0; this.n = 0; this.shotN = 0; this.reinf = 0; this.stabs = []; this.int = 0; this.phase = 'build'; this.phT = 0; this.press = { men: 1, tanks: 0, aim: 1 }; this.plan = null; this.orders = null; this.posts = []; this.nav = null; this.navV = null; this.postT = 0; }      // (plan, orders: sim/battleplan.js, when somebody's commanding it)      // (press: how hard the war's gone, sim/lineage.js pressOf: their numbers, armour, aim)
  // the line along front F: where everything stands. (a: across the border, + toward the enemy; s: along it)
  setup(F) {
    this.plan = null; this.orders = null; this.F = F; this.men = []; this.shots = []; this.stabs = []; this.nades = []; this.drops = []; this.barks = []; this.int = 0; this.phase = 'build'; this.phT = 0;
    const ux = Math.sin(F.dir), uz = Math.cos(F.dir), px = -uz, pz = ux, r = rnd(Math.round(F.x * 7 + F.z * 13));
    const at = (a, s) => { const x = F.x + ux * a + px * s, z = F.z + uz * a + pz * s; return [x, this.ground(x, z), z]; };
    this.at = at; this.dir = F.dir; this.u = [ux, uz]; this.v = [px, pz];
    // fought in a town (hooks.built(x, z, pad): is that inside something built?): everything of the line is put where there's open ground — a street,
    // a square, a yard — the nearest to where it would have stood; what would stand in a house isn't laid at all
    const built = (a, s, pad = 0.5) => { if (!this.hooks.built) return false; const x = F.x + ux * a + px * s, z = F.z + uz * a + pz * s; return this.hooks.built(x, z, pad); };
    const clear = (a, s, pad = 2.5) => { if (!built(a, s, pad)) return [a, s]; for (let R = 3; R <= 60; R += 3) for (let k = 0; k < 10; k++) { const an = k * 0.628 + R, a2 = a + Math.cos(an) * R, s2 = s + Math.sin(an) * R; if (!built(a2, s2, pad)) return [a2, s2]; } return [a, s]; };
    this.built = built; this.clear = clear; this.town = !!this.hooks.built && !!F.town;
    // in a town: the way through its streets (sim/townnav.js), and the places in its buildings a man can fight from (posts, below)
    this.nav = this.town ? new TownNav(built, RALLY + 70, SPAN + 70, 0.55) : null;
    this.navV = this.town ? new TownNav((a, s, pad) => this.hooks.built(F.x + ux * a + px * s, F.z + uz * a + pz * s, pad, true), RALLY + 70, SPAN + 70, 2.5, 2) : null;      // (and for a hull, which needs a street's width)
    this.posts = []; this.losMemo = new Map(); this.postT = 0;
    this.obj = [-120, 0, 120].map((s0, i) => { const [a, s] = clear(i === 0 ? -22 : i === 2 ? 22 : 0, s0, 5), prog = i === 0 ? 1 : i === 2 ? -1 : 0; return { id: i, name: ['West', 'Centre', 'East'][i], a, s, pos: at(a, s), prog, owner: prog > 0 ? 'ours' : prog < 0 ? 'theirs' : null }; });
    // each objective is a gun position: a heavy gun on its tripod between two parapets of sandbags, crewed by whoever holds the ground.
    // It rakes anyone coming at it from the other side, so the objective is the gun: its crew put down (a grenade, a shell, a round from
    // the flank, an aircraft), and the pit taken. Whoever takes it turns it round. gun: { pos, hp, crew, yaw, cool, burst, by }
    for (const O of this.obj) O.gun = { pos: at(O.a, O.s + 2.4), hp: GUN_HP, crew: null, yaw: F.dir, cool: 1, burst: 0, out: 0, you: false, firedT: -9 };
    this.cover = [];
    for (const O of this.obj) for (const side of [-1, 1]) this.cover.push({ i: 0, side: side < 0 ? 'ours' : 'theirs', a: O.a + side * 3.6, s: O.s + 2.4, pos: at(O.a + side * 3.6, O.s + 2.4), face: side < 0 ? F.dir : F.dir + Math.PI, len: 9, curve: 0.12, by: null, hp: 520, h: 0.85, post: O.id });
    // each side's works: a breastwork of sandbags along its front line, broken where the ground's walked, and walls scattered forward of it toward the objectives
    for (const side of [-1, 1]) {
      for (let s = -SPAN; s < SPAN; s += 12 + r() * 7) if (r() < 0.8) { const a = side * (LINE + Math.sin(s / 60 + side) * 7 + r() * 4), len = 7 + r() * 4;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.2, by: null, line: true, hp: 420, h: 0.85 }); }
      for (let k = 0; k < 30; k++) { const O = this.obj[k % 3], s = O.s + (r() - 0.5) * 150, a = side * (8 + r() * 42), len = 3 + r() * 3.5;
        this.cover.push({ i: this.cover.length, side: side < 0 ? 'ours' : 'theirs', a, s, pos: at(a, s), face: side < 0 ? F.dir : F.dir + Math.PI, len, curve: (r() - 0.5) * 0.7, by: null, hp: 260, h: 0.85 }); } }
    // a wall follows the ground it's laid on, bag by bag; where the ground's too steep or too broken to lay one (a mountainside the
    // border runs over), none is built. Each keeps the ground under it at metre steps along its length (ys) for what stops a bullet or you.
    this.cover = this.cover.filter(C => { const n = Math.max(2, Math.ceil(C.len)), ys = []; for (let k = 0; k <= n; k++) { const w = (k / n - 0.5) * C.len, x = C.pos[0] + px * w, z = C.pos[2] + pz * w; ys.push(this.ground(x, z)); }
      const y0 = ys[0], y1 = ys[n]; let bump = 0, step = 0; for (let k = 0; k <= n; k++) { bump = Math.max(bump, Math.abs(ys[k] - (y0 + (y1 - y0) * k / n))); if (k) step = Math.max(step, Math.abs(ys[k] - ys[k - 1]) / (C.len / n)); }
      const fall = Math.abs(this.ground(C.pos[0] + ux, C.pos[2] + uz) - this.ground(C.pos[0] - ux, C.pos[2] - uz)) / 2;
      if (step > 0.45 || bump > 0.6 || fall > 0.6) return false; if (built(C.a, C.s, 0.8) || built(C.a, C.s - C.len / 2, 0.6) || built(C.a, C.s + C.len / 2, 0.6)) return false; C.ys = ys; return true; });
    this.cover.forEach((C, i) => { C.i = i; });
    // between the lines: steel hedgehogs, runs of wire, a few fires
    this.props = [];
    for (let k = 0; k < 22; k++) this.props.push({ kind: 'hedgehog', pos: at((r() - 0.5) * 40, (r() - 0.5) * 2 * SPAN), rot: r() * 6.28 });
    for (let k = 0; k < 7; k++) { const s = -SPAN + r() * 2 * SPAN, a = (r() - 0.5) * 30, L = 10 + r() * 12; this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: L, rot: F.dir + Math.PI / 2 + (r() - 0.5) * 0.4 }); }
    for (const side of [-1, 1]) for (let k = 0; k < 12; k++) { const s = -SPAN + r() * 2 * SPAN, a = side * (LINE + 12 + r() * 3); this.props.push({ kind: 'wire', pos: at(a, s), a, s, len: 14 + r() * 10, rot: F.dir + Math.PI / 2 }); }
    for (let k = 0; k < 6; k++) this.props.push({ kind: 'fire', pos: at((r() - 0.5) * 110, (r() - 0.5) * 2 * SPAN), size: 1 + r() * 2 });
    if (this.hooks.built) this.props = this.props.filter(W => { const [a, s2] = this.local(W.pos); if (W.kind !== 'wire') return !built(a, s2, 1.2); for (let k = -2; k <= 2; k++) { const w = k / 4 * W.len, sr = Math.sin(W.rot), cr = Math.cos(W.rot), x = W.pos[0] + sr * w, z = W.pos[2] + cr * w; if (this.hooks.built(x, z, 0.6)) return false; } return true; });
    // each run of wire in lengths between pickets: a grenade or a shell cuts one, a tank flattens it, and men go through the gap
    for (const W of this.props) if (W.kind === 'wire') { const n = Math.max(1, Math.round(W.len / WIRE_SEG)); W.segs = []; for (let k = 0; k < n; k++) W.segs.push({ k, s0: (k / n - 0.5) * W.len, s1: ((k + 1) / n - 0.5) * W.len, dead: false }); }
    this.rally = { ours: [-RALLY, 0], theirs: [RALLY, 0] };
    // you come up on a fight already going: each side's men all in, the first at its own sandbags, the rest forward of them
    this.n = 0; for (let k = 0; k < Math.round(PER_SIDE * this.press.men); k++) for (const side of ['ours', 'theirs']) { if (side === 'ours' && k >= PER_SIDE) continue; const M = this.spawn(side); if (k % 3) { const [, s0] = this.local(M.pos); M.pos = at(...clear((side === 'ours' ? -1 : 1) * (14 + Math.random() * 36), s0, 1)); } }
    this.reinf = 6;
    // posts: a window with a room behind it, the edge of a roof a ladder goes up to. { id, pos (where he stands), face, n ([x, z] the way it looks out), k (storey; roofs one more),
    // roof, b (building key), path (world points from outside the door, or the ladder's foot, to it; path.lad: the point the ladder ends at), by }
    if (this.town) try { this.posts = (this.hooks.posts?.(F) || []).map((P, id) => { const [a, s] = this.local(P.pos), [ea, es] = this.local(P.path[0]); return { ...P, id, a, s, ea, es, by: null }; }).filter(P => Math.abs(P.a) < RALLY && Math.abs(P.s) < SPAN + 20 && this.nav.nearOpen(P.ea, P.es, 3)); } catch (e) { console.warn('posts', e); this.posts = []; }
    this.armor?.setup();
    this.events.push({ type: 'line', F });
  }
  end() { this.plan = null; this.orders = null; this.F = null; this.men = []; this.shots = []; this.nades = []; this.drops = []; this.barks = []; this.armor?.end(); }
  spawn(side) {
    // up from the rally point to near one of the objectives (the first of them straight into their own line)
    const [a0] = this.rally[side], O = this.obj[Math.floor(Math.random() * 3)], s = O.s + (Math.random() - 0.5) * 140, first = this.n < PER_SIDE * (1 + this.press.men), a = first ? (side === 'ours' ? -1 : 1) * (LINE + 3 + Math.random() * 5) : a0 + (Math.random() - 0.5) * 30, p = this.at(...(this.clear ? this.clear(a, s, 1) : [a, s]));
    const k = this.n++, M = { id: `inf:${side}:${k}`, side, squad: Math.floor(k / 2) % SQUAD, pos: p, facing: side === 'ours' ? this.dir : this.dir + Math.PI, hp: 100, state: 'move', goal: null, cool: 1 + Math.random() * 2, dwell: 0, moving: false, aim: 0, dead: 0,
      sup: 0, duck: 0, flinch: 0, threat: 0, support: 0, nadeCd: 8 + Math.random() * 20, barkCd: Math.random() * 3, saw: false, fall: 0, at: k % 5 === 2, rk: 2, via: null, routeT: 0, post: null, walk: null, postCd: Math.random() * 12, path: null, pathT: 0 };      // (one man in five carries a launcher)
    this.men.push(M); this.plan?.spent(side); return M;
  }
  // where a man (or a hull) of `side` at s0 along the line is wanted: the objective he's been ordered onto or told to hold; a place to form up
  // short of it, or to run back to; and with nobody commanding, the nearest objective his side doesn't hold, else the one most at risk
  wantFor(side, s0) {
    const o = this.orders?.[side], sg = side === 'ours' ? -1 : 1;
    if (o && (o.mode === 'attack' || o.mode === 'defend') && o.O) return o.O;
    if (o) { const a = o.mode === 'rout' ? sg * (RALLY + 30) : sg * (o.mode === 'shelter' ? 50 : 30), s = o.O ? o.O.s + Math.max(-80, Math.min(80, s0 - o.O.s)) : s0; return { virtual: true, rout: o.mode === 'rout', a, s, pos: this.at(a, s), owner: side, prog: 0, name: '' }; }
    return this.obj.filter(o => o.owner !== side).sort((p, q) => Math.abs(p.s - s0) - Math.abs(q.s - s0))[0] || this.obj.slice().sort((p, q) => (side === 'ours' ? p.prog - q.prog : q.prog - p.prog))[0];
  }
  // the nearest man of `side` to p (within 60 m) says it
  barkNear(p, side, kind) { let best = null, bd = 60; for (const M of this.men) if (M.hp > 0 && M.side === side) { const d = this.near(M.pos, p); if (d < bd) { bd = d; best = M; } } if (best) this.bark(best, kind); }
  bark(M, kind, force = false) { if (!M || M.hp <= 0 || (!force && M.barkCd > 0)) return; const last = this.lastBark?.[M.side] ?? -9; if (!force && this.t - last < 1.1) return; (this.lastBark ||= {})[M.side] = this.t; M.barkCd = 5 + Math.random() * 4; this.barks.push({ M, text: pick(BARK[kind]), t: 0, kind }); }
  // you, as the sim sees you: { pos, side ('ours' | null), alive }
  step(dt, you) {
    if (!this.F) return; this.t += dt; this.shots = this.shots.filter(q => this.t - q.t < 0.3);
    for (const b of this.barks) b.t += dt; this.barks = this.barks.filter(b => b.t < 2.2 && b.M.hp > 0);
    const alive = this.men.filter(m => m.hp > 0), foeOfYou = you?.side === 'ours' ? 'theirs' : you?.side === 'theirs' ? 'ours' : null; let onYou = 0;
    this.director(dt); this.stepGuns(dt, you, alive);
    if (this.posts.length && (this.postT -= dt) <= 0) { this.postT = 1; const held = new Set(); for (const M of alive) { const P = M.post || M.goal?.post || M.walk?.P; if (P) held.add(P.id + M.id); } for (const P of this.posts) if (P.by && !held.has(P.id + P.by)) P.by = null; }
    // bayonet thrusts landing: on whoever's still there in front of the blade
    for (const S of this.stabs) if (this.t >= S.at && S.M.hp > 0) { S.done = true; if (S.E) { if (S.E.hp > 0 && this.near(S.E.pos, S.M.pos) < 2.2) this.hurt(S.E, 85, S.M.side, [S.E.pos[0] - S.M.pos[0], S.E.pos[2] - S.M.pos[2]]); }
      else if (you?.alive && this.near(you.pos, S.M.pos) < 2.1) this.hooks.hitPlayer?.(40, `a ${this.F.b.name} bayonet`, S.M.pos); }
    this.stabs = this.stabs.filter(S => !S.done && S.M.hp > 0);
    // reinforcements: each side keeps its strength up (theirs as the director allows), the side holding more of the line a little stronger
    if (!this.plan && (this.reinf -= dt) <= 0) { this.reinf = 7; for (const side of ['ours', 'theirs']) { const held = this.obj.filter(o => o.owner === side).length, cap = side === foeOfYou ? this.cap() : 1, want = Math.round((PER_SIDE * (side === 'theirs' ? this.press.men : 1) + held) * cap), have = alive.filter(m => m.side === side).length; for (let k = have; k < Math.min(want, have + 4); k++) this.spawn(side); } }
    for (const M of this.men) {
      if (M.hp <= 0) { M.dead += dt; continue; }
      M.sup = Math.max(0, M.sup - dt * 0.18); M.flinch = Math.max(0, M.flinch - dt); M.threat = Math.max(0, M.threat - dt); M.support = Math.max(0, M.support - dt); M.nadeCd -= dt; M.barkCd -= dt; M.stabCd = (M.stabCd || 0) - dt;
      // at arm's length with one of theirs: the bayonet (a lunge and a thrust; it lands a moment after it starts)
      if (M.stabCd <= 0 && !M.prone && !M.walk) { let E = null; for (const N of alive) if (N.side !== M.side && N.hp > 0 && Math.hypot(N.pos[0] - M.pos[0], N.pos[2] - M.pos[2]) < 1.8 && Math.abs(N.pos[1] - M.pos[1]) < 1.2 && N.post?.b === M.post?.b && !N.walk) { E = N; break; }
        const youNear = !E && you?.alive && !you.tank && you.side && you.side !== M.side && Math.hypot(you.pos[0] - M.pos[0], you.pos[2] - M.pos[2]) < 1.7 && Math.abs(you.pos[1] - M.pos[1]) < 1.4;
        if (E || youNear) { M.stab = this.t; M.stabCd = 2.6 + Math.random(); const tp = E ? E.pos : you.pos; M.facing = Math.atan2(tp[0] - M.pos[0], tp[2] - M.pos[2]); this.stabs.push({ M, E, at: this.t + 0.45 }); } }
      if (M.gun) { M.moving = M.gunMoving; M.duck += ((M.sup > 0.8 ? 1 : 0) - M.duck) * Math.min(1, dt * 6); M.aim = 1; continue; }      // (on the gun: stepGuns has him)
      const foe = M.side === 'ours' ? 'theirs' : 'ours', inCover = M.state === 'hold' && (!!M.goal?.C && !M.goal.C.down || !!M.post);
      // pinned: behind a wall, under fire, he keeps his head down (and comes back up as it eases)
      const pinned = (inCover || M.prone) && (M.sup > 0.5 || M.duck > 0.5 && M.sup > 0.3); M.duck += ((pinned ? 1 : 0) - M.duck) * Math.min(1, dt * 6);      // (down at 0.5, up again once it's eased below 0.3)
      if (pinned && M.sup > 0.85 && Math.random() < dt * 0.08) this.bark(M, "pinned");
      // what it's going for: the nearest objective its side doesn't hold, else the one most at risk
      const [aM, sM] = this.local(M.pos), want = this.wantFor(M.side, sM), ord = this.orders?.[M.side];
      if (want.rout && Math.abs(aM) > RALLY + 10) { M.gone = true; continue; }      // (run clean off the field)
      // whom it can see to shoot at: the nearest, but you first if you've been shooting at him
      let tgt = null, td = RANGE;
      for (const E of alive) { if (E.side !== foe) continue; const d = Math.hypot(E.pos[0] - M.pos[0], E.pos[2] - M.pos[2]); if (d < td && !(E.walk && !E.climb) && this.sees(M.pos, E.pos, M, E)) { td = d; tgt = E; } }
      if (you?.alive && you.side === foe && !you.tank) { const d = Math.hypot(you.pos[0] - M.pos[0], you.pos[2] - M.pos[2]); if (d * (M.threat > 0 ? 0.25 : 0.5) < td && d < RANGE && this.sees(M.pos, you.pos, M, null)) { td = d; tgt = 'you'; } }
      if (tgt && !M.saw) { M.saw = true; this.bark(M, tgt === 'you' && M.threat > 0 ? 'you' : 'contact'); } if (!tgt) M.saw = false;
      if (tgt === 'you') onYou++;
      // moving: to a wall of its own side on the way to the objective; held there a while if there's someone to fight; then on, then onto the point itself
      // caught in the open under fire: he dives for the nearest wall, or goes flat where he is
      M.postCd -= dt;
      // going in to a post or coming out from one: along its way (through the door, up the stairs; up the ladder to a roof), nothing else until he's there
      if (M.walk) { const W = M.walk, pts = W.P.path, j = W.i + W.dir; M.moving = true; M.aim = 0; M.duck = 0; M.prone = false;
        if (W.P.dead || j < 0 || j >= pts.length) { if (W.dir > 0 && !W.P.dead) { M.post = W.P; M.state = 'hold'; M.pos = W.P.pos.slice(); M.facing = W.P.face; if (!W.P.roof) this.hooks.glass?.(W.P); M.dwell = 25 + Math.random() * 25; } else { if (W.P.by === M.id) W.P.by = null; M.post = null; M.state = 'move'; M.goal = null; M.postCd = 25 + Math.random() * 20; M.pos[1] = W.P.dead ? M.pos[1] : this.ground(M.pos[0], M.pos[2]); } M.walk = null; M.climb = false; M.moving = false; continue; }
        const g = pts[j], lad = pts.lad != null && Math.max(W.i, j) === pts.lad, dx = g[0] - M.pos[0], dy = g[1] - M.pos[1], dz = g[2] - M.pos[2], d = Math.hypot(dx, dy, dz), sp = (lad ? 1.3 : 3.1) * dt; M.climb = lad;
        if (g.door) this.hooks.door?.(g.door); if (pts[W.i]?.door) this.hooks.door?.(pts[W.i].door);
        if (d <= sp) { M.pos = [g[0], g[1], g[2]]; W.i = j; } else { M.pos = [M.pos[0] + dx / d * sp, M.pos[1] + dy / d * sp, M.pos[2] + dz / d * sp]; }
        M.facing = lad ? pts.ladFace : Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : M.facing; continue; }
      if (M.state === 'move' && M.sup > 0.6 && !M.diving) { M.diving = true; let best = null, bd = 14;
        for (const C of this.cover) { if (C.down || C.by && C.by !== M.id) continue; const d = this.near(C.pos, M.pos); if (d < bd) { bd = d; best = C; } }
        if (best) { if (M.goal?.C?.by === M.id) M.goal.C.by = null; best.by = M.id; M.goal = { pos: this.at(best.a + (M.side === 'ours' ? -1 : 1) * (best.back || 1), best.s + (Math.random() - 0.5) * best.len * 0.6), C: best }; M.via = null; M.routeT = 0; }
        else { if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = { pos: M.pos.slice(), C: null }; M.prone = true; M.state = 'hold'; M.moving = false; M.dwell = 3 + Math.random() * 3; } }
      if (M.state === 'move') {
        if (!M.goal) { M.goal = this.nextCover(M, want); M.via = null; M.routeT = 0; }
        // round whatever's between him and it: the end of a wall, the nearest gap in the wire
        // (in a town, the way there is by its streets: the next corner of it is what he makes for)
        const dest = this.nav ? this.navNext(M, M.goal.pos, dt) : M.goal.pos, last = dest === M.goal.pos;
        if ((M.routeT -= dt) <= 0) { M.routeT = 0.6; M.via = this.route(M.pos, dest); }
        if (M.via && this.near(M.pos, M.via) < 1.0) { M.via = this.route(M.pos, dest); M.routeT = 0.6; if (M.via && this.near(M.pos, M.via) < 1.0) M.via = null; }
        const g = M.via || dest, dx = g[0] - M.pos[0], dz = g[2] - M.pos[2], d = Math.hypot(dx, dz);
        if (d < 1.2 && !M.via && last && M.goal.post) { const P = M.goal.post; M.goal = null; M.path = null; if (P.dead || P.by !== M.id) { M.postCd = 10; } else { M.walk = { P, i: 0, dir: 1 }; } }
        else if (d < 1.2 && !M.via && last) { M.state = 'hold'; M.diving = false; M.dwell = tgt ? 8 + Math.random() * 9 : 1.5 + Math.random() * 2; M.moving = false; if (!M.goal.C && this.near(M.pos, want.pos) < R_OBJ && Math.random() < 0.5) this.bark(M, 'point'); }
        else if (d > 1e-3) { const sp = (tgt && td < 60 ? 4.8 : 3.6) * (M.flinch > 0 ? 0.4 : 1) * dt, x0 = M.pos[0], z0 = M.pos[2]; let wx = dx / d, wz = dz / d;
          // something built in the way (a house, a wall: resolve wouldn't let him through): he goes along it, one way, and if that's shut too, the other
          if (M.slipT > 0) { M.slipT -= dt; const c = Math.cos(1.3 * M.slip), sn = Math.sin(1.3 * M.slip); [wx, wz] = [wx * c + wz * sn, -wx * sn + wz * c]; }
          M.pos = [M.pos[0] + wx * Math.min(sp, d), 0, M.pos[2] + wz * Math.min(sp, d)]; M.facing = Math.atan2(wx, wz); M.moving = true;
          for (const N of this.men) if (N !== M && N.hp > 0) { const ox = M.pos[0] - N.pos[0], oz = M.pos[2] - N.pos[2], od = Math.hypot(ox, oz); if (od < 0.62 && od > 1e-4) { M.pos[0] += ox / od * (0.62 - od); M.pos[2] += oz / od * (0.62 - od); } }
          { const q = this.push(M.pos[0], M.pos[2], this.ground(M.pos[0], M.pos[2]), 1.7, 0.3); if (q) { M.pos[0] = q[0]; M.pos[2] = q[1]; } }
          if (this.resolve) { const [rx, rz] = this.resolve(M.pos[0], M.pos[2], this.ground(M.pos[0], M.pos[2])); M.pos[0] = rx; M.pos[2] = rz; }
          if (this.town && sp > 1e-4 && Math.hypot(M.pos[0] - x0, M.pos[2] - z0) < Math.min(sp, d) * 0.4) { M.slip = M.slipT > 0 ? -(M.slip || 1) : (M.slip || (Math.random() < 0.5 ? 1 : -1)); M.slipT = 1.2 + Math.random() * 1.6; }
          M.pos[1] = this.ground(M.pos[0], M.pos[2]); }
      } else if (M.state === 'hold') {
        M.dwell -= dt * (pinned ? 0.15 : 1);      // (pinned, he stays put)
        // under orders to hold something (or formed up, waiting for the word): behind a wall near it, he stays there
        if (ord && M.dwell <= 0 && (ord.mode === 'defend' && inCover && this.near(M.pos, want.pos) < 36 || want.virtual && !want.rout && this.near(M.pos, want.pos) < 16)) M.dwell = 2;
        if (M.goal?.C?.down) M.dwell = Math.min(M.dwell, 0.3);      // (his wall's gone: he finds another)
        if (M.post) { if (M.post.dead) { M.post = null; } else if (M.dwell <= 0 && !tgt || M.dwell < -25 || want.rout) { M.walk = { P: M.post, i: M.post.path.length - 1, dir: -1 }; M.post = null; M.state = 'move'; M.goal = null; } }      // (nothing left to shoot at from up there, or he's been there long enough: back down the way he came)
        else if (M.dwell <= 0 && !(tgt && td < 40) || M.prone && !pinned && M.dwell <= 0) {
          M.prone = false; M.diving = false;
          if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = this.near(M.pos, want.pos) < R_OBJ * 0.6 ? null : this.nextCover(M, want); M.state = M.goal ? 'move' : 'hold'; M.dwell = 4;
          // bounding: he goes, and his squad in cover covers him
          if (M.goal && tgt) { let cov = null; for (const N of alive) if (N !== M && N.side === M.side && N.squad === M.squad && N.state === 'hold' && this.near(N.pos, M.pos) < 30) { N.support = 3; cov = N; } if (cov) { this.bark(M, 'moving'); this.bark(cov, 'covering', true); } }
        }
      }
      // a launcher, at enemy armour in range: stood still, not pinned, he puts a rocket into it (leading it if it's moving)
      if (M.at && M.rk > 0 && this.armor && !M.moving && M.flinch <= 0 && !pinned && (M.atCd = (M.atCd ?? 2) - dt) <= 0) {
        let V = null, vd = 170; const eye = [M.pos[0], M.pos[1] + 1.5, M.pos[2]];
        for (const E of this.armor.list) { if (E.dead || E.side === M.side) continue; const d = this.near(E.pos, M.pos); if (d > 22 && d < vd && this.armor.sees(eye, [E.pos[0], E.pos[1] + 1.3, E.pos[2]])) { vd = d; V = E; } }
        if (V && Math.random() < dt * 0.5) { const tf = vd / 115, to = [V.pos[0] + Math.sin(V.facing) * V.speed * tf, V.pos[1] + 1.2, V.pos[2] + Math.cos(V.facing) * V.speed * tf]; M.facing = Math.atan2(to[0] - M.pos[0], to[2] - M.pos[2]);
          this.armor.rocket([M.pos[0] + Math.sin(M.facing) * 0.6, M.pos[1] + 1.55, M.pos[2] + Math.cos(M.facing) * 0.6], to, M.side, M, 0.006 + vd * 0.00007); M.rk--; M.atCd = 6 + Math.random() * 4; M.cool = 2; this.bark(M, 'launcher', true); }
        else if (!V) M.atCd = 1; }
      // a grenade, at a man dug in behind a wall (or you, when you've been shooting at him) within throwing range
      if (tgt && !M.moving && M.nadeCd <= 0 && td > 10 && td < 40 && !pinned) { const dug = tgt === 'you' ? M.threat > 0 : tgt.state === 'hold' && tgt.goal?.C;
        if (dug && Math.random() < dt * 0.4) { const tp = tgt === 'you' ? you.pos : tgt.pos; this.throwNade(M, [tp[0] + (Math.random() - 0.5) * 3, 0, tp[2] + (Math.random() - 0.5) * 3]); } }
      // firing: turn to it, a shot every second or so; more likely to hit closer and in the open, far less ducked or pinned
      M.aim = tgt ? Math.min(1, M.aim + dt * 3) : Math.max(0, M.aim - dt * 2);
      if (tgt && !M.moving && M.flinch <= 0) {
        const tp = tgt === 'you' ? you.pos : tgt.pos; M.facing = Math.atan2(tp[0] - M.pos[0], tp[2] - M.pos[2]);
        if ((M.cool -= dt * (M.support > 0 ? 1.8 : 1)) <= 0) {
          M.burst = (M.burst || 0) + 1; if (M.burst >= 3 + Math.floor(Math.random() * 2)) { M.burst = 0; M.cool = 1.1 + Math.random() * 1.4; } else M.cool = 0.16 + Math.random() * 0.1;      // (in bursts of three or four)
          const blind = M.duck > 0.5, tDuck = tgt !== 'you' && tgt.duck > 0.5, covered = tgt !== 'you' && tgt.state === 'hold' && (tgt.post || tgt.goal?.C && !tgt.goal.C.down);
          let p = (0.32 * (1 - td / RANGE) + 0.06) * (covered ? 0.45 : 1) * (tDuck ? 0.25 : 1) * (blind ? 0.2 : 1) * (M.sup > 0.4 ? 0.6 : 1) * (M.side === 'theirs' ? this.press.aim : 1);
          if (tgt === 'you') { const low = you.low || 0; p *= 0.9 * (1 - 0.25 * low); }
          const from = [M.pos[0] + Math.sin(M.facing) * 0.7, M.pos[1] + (blind ? 1.0 : 1.42), M.pos[2] + Math.cos(M.facing) * 0.7];
          // a hit is a round that gets to some part of him: whatever's in the line first (sandbags, a hull, a wall, a tree, a rock, the ground) takes it instead.
          // Behind a wall only what shows over it can be hit; crouched or flat behind one, often nothing does.
          const sink = tgt === 'you' ? Math.max(0.18, 1 - 0.42 * (you.low || 0)) : tgt.duck > 0.5 ? 0.55 : 1, parts = [1.1, 1.5, 0.5].map(h => [tp[0], tp[1] + h * sink, tp[2]]);
          let hit = Math.random() < p, to = null, stop = false;
          if (hit) { to = parts.find(q => this.blockAt(from, q) == null) || null; if (!to) { hit = false; stop = true; const q = parts[0], L = this.blockAt(from, q); to = this.along(from, q, L); } }
          if (!to) { const miss = blind ? 6 : 3.2, q = [tp[0] + (Math.random() - 0.5) * miss, tp[1] + 0.2 + Math.random() * 2.2, tp[2] + (Math.random() - 0.5) * miss], L = this.blockAt(from, q); to = L == null ? q : this.along(from, q, L); stop = L != null; }
          this.shots.push({ from, to, side: M.side, t: this.t, hit, stop, n: ++this.shotN, at: tgt === 'you' ? 'you' : null }); M.firedT = this.t;
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
    this.men = this.men.filter(m => !m.gone && (m.hp > 0 || m.dead < 40));
    // the objectives: taken by standing on them unopposed
    for (const O of this.obj) {
      if (this.plan && this.plan.phase !== 'over' && this.plan.O !== O) continue;      // (commanded, the fight's for one of them at a time: the others stay whose they are)
      let a = 0, b = 0; for (const m of alive) if (m.hp > 0 && this.near(m.pos, O.pos) < R_OBJ) m.side === 'ours' ? a++ : b++;
      if (you?.alive && you.side === 'ours' && this.near(you.pos, O.pos) < R_OBJ) a += 2;
      const was = O.owner, cr = dt / CAP_T * (this.plan ? 0.5 : 1); if (a && !b) O.prog = Math.min(1, O.prog + cr * Math.min(3, a) / 2); else if (b && !a) O.prog = Math.max(-1, O.prog - cr * Math.min(3, b) / 2);      // (in a commanded battle the ground takes twice as long to make sure of)
      O.owner = O.prog >= 1 ? 'ours' : O.prog <= -1 ? 'theirs' : (was && Math.sign(O.prog) === (was === 'ours' ? 1 : -1) ? was : null);
      if (O.owner !== was) this.events.push({ type: O.owner === 'ours' ? 'taken' : O.owner === 'theirs' ? 'lost' : 'contested', O, you: you?.alive && this.near(you.pos, O.pos) < R_OBJ });
    }
    this.you = you;
  }
  // the heavy guns on the objectives: crewed by a man of whoever holds the ground (the nearest, sent to it from wherever he is; or by you), firing bursts at whatever of the other side
  // is in front of it in the open; pinned, the crew keeps down and it's silent; hit hard enough it's knocked out for a minute
  stepGuns(dt, you, alive) {
    for (const O of this.obj) { const G = O.gun, own = O.owner;
      if (G.out > 0) { G.out -= dt; if (G.crew) { G.crew.gun = null; G.crew = null; } if (G.out <= 0) G.hp = GUN_HP; continue; }
      let M = G.crew; if (M && (M.hp <= 0 || M.side !== own || G.you)) { if (M) M.gun = null; M = G.crew = null; }
      if (G.you) { if (!you?.alive || own !== you.side || this.near(you.pos, G.pos) > 3) G.you = false; continue; }
      if (!own) continue;
      if (!M) { let bd = 500; for (const N of alive) if (N.hp > 0 && N.side === own && !N.gun && !N.prone && !N.at && !N.post && !N.walk) { const d = this.near(N.pos, G.pos); if (d < bd) { bd = d; M = N; } } if (!M) continue; if (M.goal?.C?.by === M.id) M.goal.C.by = null; M.goal = null; M.gun = O; G.crew = M; M.state = 'hold'; }
      // to the gun, behind it (on his own side of it)
      const sg = own === 'ours' ? -1 : 1, seat = this.at(O.a + sg * 0.9, O.s + 2.4), d = this.near(M.pos, seat);
      if (d > 0.5) { const to = this.nav ? this.navNext(M, seat, dt) : seat;      // (in a town, by its streets)
        if ((M.routeT -= dt) <= 0 || !M.gunVia) { M.routeT = 0.5; M.gunVia = this.route(M.pos, to) || to; }      // (round the walls and the wire, as any man goes)
        const g = this.near(M.pos, M.gunVia) < 0.8 ? to : M.gunVia, gd = this.near(M.pos, g) || 1, sp = Math.min(gd, 4.4 * dt); M.pos = [M.pos[0] + (g[0] - M.pos[0]) / gd * sp, 0, M.pos[2] + (g[2] - M.pos[2]) / gd * sp];
        { const q = this.push(M.pos[0], M.pos[2], this.ground(M.pos[0], M.pos[2]), 1.7, 0.3); if (q) { M.pos[0] = q[0]; M.pos[2] = q[1]; } }
        M.pos[1] = this.ground(M.pos[0], M.pos[2]); M.facing = Math.atan2(g[0] - M.pos[0], g[2] - M.pos[2]); M.gunMoving = true; continue; }
      M.gunMoving = false; const fwd = own === 'ours' ? this.dir : this.dir + Math.PI; if (M.sup > 0.8) continue;      // (kept down)
      // what's in front of it: the nearest of theirs within the arc that it can see; you, if you're one of them
      const foe = own === 'ours' ? 'theirs' : 'ours', eye = [G.pos[0], G.pos[1] + 1.0, G.pos[2]]; let tgt = null, td = GUN_RANGE;
      const arc = p => { const dx = p[0] - G.pos[0], dz = p[2] - G.pos[2], r = Math.hypot(dx, dz) || 1; return (dx * Math.sin(fwd) + dz * Math.cos(fwd)) / r > 0.25 ? r : Infinity; };
      for (const E of alive) { if (E.side !== foe || E.hp <= 0) continue; const r = arc(E.pos); if (r < td && this.sees(eye, E.pos)) { td = r; tgt = E; } }
      if (you?.alive && you.side === foe && !you.tank) { const r = arc(you.pos); if (r * 0.8 < td && r < GUN_RANGE && this.sees(eye, you.pos)) { td = r; tgt = 'you'; } }
      if (!tgt) { G.burst = 0; continue; }
      const tp = tgt === 'you' ? you.pos : tgt.pos, want = Math.atan2(tp[0] - G.pos[0], tp[2] - G.pos[2]); let dy = want - G.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); G.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, dy)); M.facing = G.yaw;
      if (Math.abs(dy) > 0.12 || (G.cool -= dt) > 0) continue;
      if (++G.burst >= 9) { G.burst = 0; G.cool = 0.9 + Math.random() * 0.8; } else G.cool = 0.1;
      const covered = tgt !== 'you' && tgt.state === 'hold' && tgt.goal?.C && !tgt.goal.C.down, low = tgt === 'you' ? (you.low || 0) : tgt.duck > 0.5 ? 1 : 0;
      const from = [G.pos[0] + Math.sin(G.yaw) * 1.1, G.pos[1] + 0.95, G.pos[2] + Math.cos(G.yaw) * 1.1];
      let hit = Math.random() < (0.11 * (1 - td / GUN_RANGE) + 0.025) * (covered ? 0.4 : 1) * (low ? 0.4 : 1), to = null, stop = false;
      if (hit) { const q = [tp[0], tp[1] + (low ? 0.5 : 1.1), tp[2]], L = this.blockAt(from, q); if (L == null) to = q; else { hit = false; stop = true; to = this.along(from, q, L); } }
      if (!to) { const q = [tp[0] + (Math.random() - 0.5) * 4.5, tp[1] + Math.random() * 1.8, tp[2] + (Math.random() - 0.5) * 4.5], L = this.blockAt(from, q); to = L == null ? q : this.along(from, q, L); stop = L != null; }
      this.shots.push({ from, to, side: own, t: this.t, hit, stop, n: ++this.shotN, at: tgt === 'you' ? 'you' : null, mg: true }); G.firedT = this.t;
      for (const N of alive) if (N.side === foe && this.near(N.pos, to) < 5) N.sup = Math.min(1, N.sup + (N === tgt ? 0.22 : 0.1));      // (it keeps heads down along the whole of where it's falling)
      if (tgt === 'you') { this.int += hit ? 0.3 : 0.06; if (hit) this.hooks.hitPlayer?.(16, `a ${this.F.b.name} heavy gun`, G.pos); }
      else if (hit) this.hurt(tgt, 34 + Math.random() * 20, own, [tp[0] - G.pos[0], tp[2] - G.pos[2]]);
    }
  }
  // something's gone off at p (a grenade, a shell, rounds from the air): a gun within R of it takes it, and its crew with it
  hitGuns(p, R, dmg, by) {
    for (const O of this.obj) { const G = O.gun, d = this.near(G.pos, p); if (G.out > 0 || d > R + 1) continue; G.hp -= dmg * (1 - d / (R + 1));
      if (G.hp <= 0) { G.out = 60; G.you = false; if (G.crew) { const M = G.crew; M.gun = null; G.crew = null; this.hurt(M, 200, by, [M.pos[0] - p[0], M.pos[2] - p[2]], 'blast'); } this.events.push({ type: 'gunout', O, by }); } }
  }
  // you get behind the one on ground your side holds (the man on it gives it up to you): → true if you're on it
  mountGun(you) { for (const O of this.obj) { const G = O.gun; if (G.out > 0 || O.owner !== you.side || this.near(you.pos, G.pos) > 2.6) continue; if (G.crew) { G.crew.gun = null; G.crew = null; } G.you = true; return O; } return null; }
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
    this.nades.push({ from, to, age: 0, T: 0.9 + d / 22, side: M.side, by: M }); M.throwT = this.t; M.nadeCd = 22 + Math.random() * 20; this.bark(M, 'frag', true); this.scatter(to, M.side);
  }
  // yours, thrown from `from` to land at `to` (they see it coming, most of them): → the grenade
  throwYours(from, to) { to[1] = this.ground(to[0], to[2]) + 0.12; const d = Math.hypot(to[0] - from[0], to[2] - from[2]), N = { from, to, age: 0, T: 0.9 + d / 22, side: 'ours', by: 'player' }; this.nades.push(N); this.scatter(to, 'ours', 0.55); return N; }
  // where a grenade is now, along its arc
  nadeAt(N) { const f = Math.min(1, N.age / N.T), h = Math.max(2, Math.hypot(N.to[0] - N.from[0], N.to[2] - N.from[2]) * 0.3); return [N.from[0] + (N.to[0] - N.from[0]) * f, N.from[1] + (N.to[1] - N.from[1]) * f + 4 * h * f * (1 - f), N.from[2] + (N.to[2] - N.from[2]) * f]; }
  explode(N, you) {
    const p = N.to, by = N.by === 'player' ? 'player' : N.side; this.events.push({ type: 'nade', p, R: NADE_R, by });
    this.armor?.splash(p, NADE_R, 120, by); this.damageCover(p, NADE_R, 90); this.cutWire(p, NADE_R * 0.45); this.hitGuns(p, NADE_R * 0.7, 300, by);
    for (const M of this.men) if (M.hp > 0) { const d = this.near(M.pos, p); if (d < NADE_R) { const shelter = M.duck > 0.5 && M.goal?.C && this.coverBetween([p[0], p[1] + 0.3, p[2]], [M.pos[0], M.pos[1] + 0.6, M.pos[2]]); this.hurt(M, (130 * (1 - d / NADE_R) + 15) * (shelter ? 0.3 : 1) * this.walled(p, M), by, [M.pos[0] - p[0], M.pos[2] - p[2]], 'blast'); } else if (d < NADE_R * 2.5) M.sup = Math.min(1, M.sup + 0.5); }
    if (you?.alive && !you.tank) { const d = this.near(you.pos, p); if (d < NADE_R) { const dmg = Math.round((70 * (1 - d / NADE_R) + 8) * (N.by === 'player' ? 0.6 : 1)); this.int += dmg / 50; this.hooks.hitPlayer?.(dmg, N.by === 'player' ? 'your own grenade' : 'a grenade', p); } else if (d < NADE_R * 3) this.int += 0.25; }
  }
  // how much of a blast at p reaches him: a wall of something built between them takes most of it (he feels it; it doesn't throw him)
  walled(p, M) { if (!this.town || !this.hooks.los) return 1; return this.hooks.los([p[0], p[1] + 0.8, p[2]], [M.pos[0], M.pos[1] + 1.1, M.pos[2]]) ? 1 : 0.15; }
  local(p) { const dx = p[0] - this.F.x, dz = p[2] - this.F.z, ux = Math.sin(this.dir), uz = Math.cos(this.dir); return [dx * ux + dz * uz, dx * -uz + dz * ux]; }
  near(p, q) { return Math.hypot(p[0] - q[0], p[2] - q[2]); }
  // the ground in the way? sampled along the line at chest height
  sees(a, b, Ma = null, Mb = null) { for (let k = 1; k < 6; k++) { const f = k / 6, x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f, y = a[1] + 1.4 + (b[1] - a[1]) * f; if (this.ground(x, z) > y - 0.3) return false; }
    if (!this.town || !this.hooks.los) return true;
    // in a town, what's built is in the way too (hooks.los: eye to chest past its buildings, through a window or over a roof); asked once for each pair of places
    const q = Math.round, k = q(a[0]) + ',' + q(a[1] * 0.6) + ',' + q(a[2]) + (Ma?.post ? 'p' + Ma.post.id : '') + '|' + q(b[0]) + ',' + q(b[1] * 0.6) + ',' + q(b[2]) + (Mb?.post ? 'p' + Mb.post.id : ''); let v = this.losMemo.get(k);
    if (v === undefined) { if (this.losMemo.size > 60000) this.losMemo.clear(); v = !!this.hooks.los([a[0], a[1] + 1.4, a[2]], [b[0], b[1] + 1.15, b[2]]); this.losMemo.set(k, v); }
    return v; }
  // the next corner on his way through the streets to g (g itself once it's in plain sight); the way's found again when what he's going for changes, and every few seconds
  navNext(M, g, dt) {
    const [a0, s0] = this.local(M.pos), [a1, s1] = this.local(g); M.pathT -= dt;
    if (!M.path || M.pathT <= 0 || Math.hypot(M.pathG[0] - g[0], M.pathG[2] - g[2]) > 1.5) { M.pathT = 3 + Math.random() * 2; M.pathG = g; M.pi = 0;
      M.path = this.nav.clear(a0, s0, a1, s1) ? [] : (this.nav.path(a0, s0, a1, s1) || []).map(([a, s]) => this.at(a, s)); }
    while (M.pi < M.path.length - 1 && this.near(M.pos, M.path[M.pi]) < 1.3) M.pi++;
    if (M.pi >= M.path.length - 1) return g; return M.path[M.pi]; }
  // a building's come down (main.js damageBuildings): whoever was in it is under it, and its posts are gone
  changed(bkey) { this.losMemo?.clear(); this.navV?.forget(); for (const P of this.posts || []) if (P.b === bkey) P.dead = true; for (const M of this.men) if (M.hp > 0 && (M.post?.b === bkey || M.walk?.P.b === bkey)) { M.post = null; M.walk = null; M.climb = false; this.hurt(M, 400, 'shell', null, 'blast'); } }
  // a sandbag wall across the ray from o along dir (unit) before `best`: → { along, C }, else null. Each wall runs along the line
  // (the s direction) at its a, 0.8 m high: a ray low enough meets it, one over the top goes on.
  coverOnRay(o, dir, best) {
    if (!this.F) return null; const [ux, uz] = this.u, [vx, vz] = this.v, dn = dir[0] * ux + dir[2] * uz; if (Math.abs(dn) < 1e-3) return null; let hit = null;
    for (const C of this.cover) { if (C.down || C.wreck) continue; const t = ((C.pos[0] - o[0]) * ux + (C.pos[2] - o[2]) * uz) / dn; if (t < 0.4 || t > best) continue;
      const qx = o[0] + dir[0] * t, qz = o[2] + dir[2] * t, w = (qx - C.pos[0]) * vx + (qz - C.pos[2]) * vz; if (Math.abs(w) > C.len / 2) continue;
      const y = o[1] + dir[1] * t, g = this.wallY(C, w); if (y < g + (C.h || 0.8) && y > g - 0.4) { best = t; hit = { along: t, C }; } }
    return hit;
  }
  // how far from a toward b the first thing in the way is (sandbags, armour, and whatever the world has that's solid: hooks.hard), or null if it's clear
  blockAt(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, d = [dx / L, dy / L, dz / L]; let best = null;
    const c = this.coverOnRay(a, d, L - 0.3); if (c) best = c.along;
    const h = this.armor?.onRay(a, d, (best ?? L) - 0.4); if (h) best = h.along;
    const w = this.hooks.hard?.(a, d, (best ?? L) - 0.35); if (w != null) best = w;
    return best; }
  along(a, b, t) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; return [a[0] + dx / L * t, a[1] + dy / L * t, a[2] + dz / L * t]; }
  coverBetween(a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1; return !!this.coverOnRay(a, [dx / L, dy / L, dz / L], L - 0.3) || !!this.armor?.blocks(a, b); }
  // the next wall of its own side toward the objective (behind it, on the side away from the enemy), else the objective itself
  nextCover(M, O) {
    const [a0, s0] = this.local(M.pos), fwd = M.side === 'ours' ? 1 : -1;
    let best = null, bc = Infinity;
    for (const C of this.cover) { if (C.down || C.by && C.by !== M.id) continue; const da = (C.a - a0) * fwd, ds = C.s - s0, toO = Math.hypot(C.a - O.a, C.s - O.s), here = Math.hypot(O.a - a0, O.s - s0);
      if (da < 3 || da > 50 || toO > here - 4) continue; const cost = Math.hypot(da, ds) + toO * 0.6 + (C.side !== M.side ? 18 : 0); if (cost < bc) { bc = cost; best = C; } }
    // formed up or fallen back: behind the nearest free wall of his own by the place, if there's one
    // in a town: a window or a roof that looks the enemy's way, by the place, if one's free (he goes in by the door and up; sim: M.walk)
    if (this.posts?.length && !O.rout && !M.at && M.postCd <= 0 && Math.random() < 0.7) { let bp = null, bpc = bc + 14; const here = Math.hypot(O.a - a0, O.s - s0);
      for (const P of this.posts) { if (P.by || P.dead) continue; const look = (P.n[0] * this.u[0] + P.n[1] * this.u[1]) * fwd; if (look < 0.3) continue; const da = (P.a - a0) * fwd, toO = Math.hypot(P.a - O.a, P.s - O.s); if (da < -12 || da > 70 || toO > 75 || toO > here + 20) continue;
        const cost = Math.hypot(P.ea - a0, P.es - s0) + toO * 0.5 - Math.min(P.k, 2) * 4 - look * 6 + (P.roof ? 9 : 0); if (cost < bpc) { bpc = cost; bp = P; } }
      if (bp) { bp.by = M.id; return { pos: bp.path[0].slice(), C: null, post: bp }; } }
    if (!best && O.virtual && !O.rout) { let bd = 26; for (const C of this.cover) { if (C.down || C.side !== M.side || C.by && C.by !== M.id) continue; const d = Math.hypot(C.a - O.a, (C.s - s0) * 0.5); if (d < bd) { bd = d; best = C; } } }
    if (!best) { const j = (Math.random() - 0.5) * R_OBJ, k = (Math.random() - 0.5) * R_OBJ; return { pos: this.at(O.a + j * 0.5, O.s + k), C: null }; }
    best.by = M.id; const back = (M.side === 'ours' ? -1.0 : 1.0) * (best.back || 1), off = (Math.random() - 0.5) * best.len * (best.wreck ? 0.4 : 0.7); return { pos: this.at(best.a + back, best.s + off), C: best };
  }
  // dir: [dx, dz] the blow came along (he falls that way)
  hurt(M, dmg, by, dir = null, how = null) {      // how: 'blast' — a shell or a grenade (he's thrown by it, away from where it went off)
    if (M.hp <= 0) return false; M.hp -= dmg; M.flinch = 0.28; M.sup = Math.min(1, M.sup + 0.35); if (by === 'player') M.threat = 10;
    if (dir) M.fall = Math.atan2(dir[0], dir[1]);
    if (M.hp <= 0) {
      M.hp = 0; M.moving = false; M.dead = 0; if (M.climb) { M.climb = false; M.pos[1] = this.ground(M.pos[0], M.pos[2]); } if (M.gun) { if (M.gun.gun.crew === M) M.gun.gun.crew = null; M.gun = null; } if (how === 'blast') { M.diedBy = 'blast'; if (dir) M.facing = Math.atan2(-dir[0], -dir[1]); } if (M.goal?.C?.by === M.id) M.goal.C.by = null; this.events.push({ type: 'down', M, by });
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
  // rounds from the air striking at p (side: whose aircraft; byPlayer: yours): men within R of it are hit, those near go to ground. → how many went down
  strafe(p, R, side, byPlayer = false) {
    if (!this.F) return 0; let n = 0; const by = byPlayer ? 'player' : side; this.armor?.splash(p, R, 45, by); this.hitGuns(p, R * 0.5, 40, by);
    for (const M of this.men) if (M.hp > 0) { const d = Math.hypot(M.pos[0] - p[0], M.pos[2] - p[2]); if (d < R) { if (this.hurt(M, 60 * (1 - d / R) + 18, by, [M.pos[0] - p[0], M.pos[2] - p[2]])) n++; } else if (d < R * 3.5) M.sup = Math.min(1, M.sup + 0.35); }
    return n;
  }
  blast(p, R) { if (!this.F) return; this.hitGuns(p, R * 0.6, 320, 'shell'); this.damageCover(p, R, 260); this.cutWire(p, R * 0.7); this.armor?.splash(p, R, 220, 'shell'); for (const M of this.men) if (M.hp > 0) { const d = Math.hypot(M.pos[0] - p[0], M.pos[2] - p[2]); if (M.post && M.post.k > 0 && Math.abs(M.pos[1] - p[1]) > R * 0.8 + 2) continue; if (d < R * 1.3) this.hurt(M, (160 * (1 - d / (R * 1.3)) + 20) * this.walled(p, M), 'shell', [M.pos[0] - p[0], M.pos[2] - p[2]], 'blast'); else if (d < R * 3) M.sup = Math.min(1, M.sup + 0.5); } }
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

  // ---- the works as solid things
  segAt(W, S) { const m = (S.s0 + S.s1) / 2; return [W.pos[0] + Math.sin(W.rot) * m, W.pos[2] + Math.cos(W.rot) * m]; }
  // a wall's bags burst and spill: it's low rubble now, no cover and nothing to stop you
  breach(C) { if (C.down || C.wreck) return; C.down = true; C.hp = 0; if (C.by) { const M = this.men.find(m => m.id === C.by); if (M) M.routeT = 0; C.by = null; } this.events.push({ type: 'breach', C }); }
  damageCover(p, R, dmg) { for (const C of this.cover) { if (C.down || C.wreck) continue; const d = this.wallDist(C, p[0], p[2]); if (d < R) { C.hp -= dmg * (1 - d / R); if (C.hp <= 0) this.breach(C); } } }
  cutWire(p, R) { for (const W of this.props) { if (W.kind !== 'wire' || this.near(W.pos, p) > W.len / 2 + R) continue; for (const S of W.segs) if (!S.dead) { const [x, z] = this.segAt(W, S); if (Math.hypot(x - p[0], z - p[2]) < R + WIRE_SEG / 2) { S.dead = 'cut'; this.events.push({ type: 'wire', W }); } } } }
  // the ground under a wall at w along it (from its middle)
  wallY(C, w) { const ys = C.ys; if (!ys) return C.pos[1]; const n = ys.length - 1, t = Math.max(0, Math.min(n, (w / C.len + 0.5) * n)), i = Math.min(n - 1, Math.floor(t)), f = t - i; return ys[i] * (1 - f) + ys[i + 1] * f; }
  wallYAt(C, x, z) { const [vx, vz] = this.v; return this.wallY(C, (x - C.pos[0]) * vx + (z - C.pos[2]) * vz); }
  // distance from (x, z) to the line of a wall
  wallDist(C, x, z) { const [ux, uz] = this.u, [vx, vz] = this.v, dx = x - C.pos[0], dz = z - C.pos[2], w = dx * vx + dz * vz, n = dx * ux + dz * uz; return Math.hypot(Math.max(0, Math.abs(w) - C.len / 2), n); }
  // Push a body (radius r, h tall, feet at yFeet) at (x, z) out of the works and the hulls: sandbag walls (low: you can jump
  // over one), wire (too high to jump, and you don't want to), steel hedgehogs, tanks and carriers and their wrecks.
  // → [x, z] when it moved it, else null. (player/collision.js asks it for you; the men ask it themselves.)
  push(x, z, yFeet, h = 1.75, r = 0.32) {
    if (!this.F) return null; const [a, s] = this.local([x, 0, z]); let moved = false;
    const box = (cx, cz, fx, fz, hl, hw) => {       // an oriented box: fx, fz along its length (hl), hw across
      const dx = x - cx, dz = z - cz, lu = dx * fx + dz * fz, lv = dx * fz - dz * fx, pu = hl + r - Math.abs(lu), pv = hw + r - Math.abs(lv); if (pu <= 0 || pv <= 0) return;
      if (pv < pu) { const q = Math.sign(lv || 1) * pv; x += q * fz; z -= q * fx; } else { const q = Math.sign(lu || 1) * pu; x += q * fx; z += q * fz; } moved = true; };
    if (Math.abs(a) < LINE + 30 && Math.abs(s) < SPAN + 30) {
      const [ux, uz] = this.u, [vx, vz] = this.v;
      for (const O of this.obj) { const G = O.gun; if (G && Math.abs(yFeet - G.pos[1]) < 1.4) box(G.pos[0], G.pos[2], ux, uz, 0.42, 0.42); }      // (the gun on its tripod)
      for (const C of this.cover) { if (C.down || C.wreck || Math.abs(s - C.s) > C.len / 2 + 2 || Math.abs(a - C.a) > 3) continue; const g = this.wallYAt(C, x, z); if (yFeet > g + (C.h || 0.85) - 0.12 || yFeet + h < g) continue;
        const sg = C.side === 'ours' ? 1 : -1, n0 = -0.4 * C.curve * sg, th = 0.42 + Math.abs(C.curve) * 0.4; box(C.pos[0] + ux * n0, C.pos[2] + uz * n0, vx, vz, C.len / 2, th); }
      for (const P of this.props) {
        if (P.kind === 'hedgehog') { const dx = x - P.pos[0], dz = z - P.pos[2], d = Math.hypot(dx, dz), R = r + 0.95; if (d < R && yFeet < P.pos[1] + 1.45) { const k = d > 1e-6 ? R / d : 0; x = P.pos[0] + (d > 1e-6 ? dx * k : R); z = P.pos[2] + (d > 1e-6 ? dz * k : 0); moved = true; } }
        else if (P.kind === 'wire') { if (this.near(P.pos, [x, 0, z]) > P.len / 2 + 2 || yFeet > P.pos[1] + 1.3) continue; const fx = Math.sin(P.rot), fz = Math.cos(P.rot);
          for (const S of P.segs) if (!S.dead) { const [cx, cz] = this.segAt(P, S); box(cx, cz, fx, fz, (S.s1 - S.s0) / 2, 0.55); } } }
    }
    if (this.armor) for (const V of this.armor.list) { if (Math.abs(x - V.pos[0]) > V.T.L || Math.abs(z - V.pos[2]) > V.T.L || yFeet > V.pos[1] + (V.dead && V.kind === 'tank' ? 1.6 : V.T.H) - 0.1) continue; box(V.pos[0], V.pos[2], Math.sin(V.facing), Math.cos(V.facing), V.T.L / 2, V.T.W / 2); }
    return moved ? [x, z] : null;
  }
  // the way from p to g round the first thing across it: → a point just past the near end of that wall (or of that unbroken
  // stretch of wire), else null when the way's clear
  route(p, g) {
    const px = p[0], pz = p[2], ex = g[0] - px, ez = g[2] - pz, L = Math.hypot(ex, ez); if (L < 0.5) return null;
    let bestT = 1, ob = null;
    const cross = (ax, az, bx, bz) => { const fx = bx - ax, fz = bz - az, den = ex * fz - ez * fx; if (Math.abs(den) < 1e-9) return null; const t = ((ax - px) * fz - (az - pz) * fx) / den, u = ((ax - px) * ez - (az - pz) * ex) / den; return t > 0 && t < bestT && u >= 0 && u <= 1 ? { t, u } : null; };
    const [vx, vz] = this.v;
    for (const C of this.cover) { if (C.down || C.wreck) continue; const h = C.len / 2 + 0.3, ax = C.pos[0] - vx * h, az = C.pos[2] - vz * h, bx = C.pos[0] + vx * h, bz = C.pos[2] + vz * h;
      for (const o of [-0.5, 0.5]) { const q = cross(ax + this.u[0] * o, az + this.u[1] * o, bx + this.u[0] * o, bz + this.u[1] * o); if (q) { bestT = q.t; ob = { a: [ax, az], b: [bx, bz], dir: [vx, vz] }; } } }
    for (const W of this.props) { if (W.kind !== 'wire') continue; const fx = Math.sin(W.rot), fz = Math.cos(W.rot), h = W.len / 2, ax = W.pos[0] - fx * h, az = W.pos[2] - fz * h, bx = W.pos[0] + fx * h, bz = W.pos[2] + fz * h;
      const q = cross(ax, az, bx, bz); if (!q) continue; const sAt = (q.u - 0.5) * W.len, k = W.segs.findIndex(S => sAt >= S.s0 && sAt <= S.s1); if (k < 0 || W.segs[k].dead) continue;
      let i = k, j = k; while (i > 0 && !W.segs[i - 1].dead) i--; while (j < W.segs.length - 1 && !W.segs[j + 1].dead) j++;
      bestT = q.t; ob = { a: [W.pos[0] + fx * W.segs[i].s0, W.pos[2] + fz * W.segs[i].s0], b: [W.pos[0] + fx * W.segs[j].s1, W.pos[2] + fz * W.segs[j].s1], dir: [fx, fz] }; }
    if (!ob) return null;
    const via = e => { const l = Math.hypot(e[0] - px, e[1] - pz) + Math.hypot(g[0] - e[0], g[2] - e[1]); return l; };
    const useA = via(ob.a) < via(ob.b), E = useA ? ob.a : ob.b, sg = useA ? -1 : 1, x = E[0] + ob.dir[0] * sg * 1.4, z = E[1] + ob.dir[1] * sg * 1.4;
    return [x, this.ground(x, z), z];
  }
}
