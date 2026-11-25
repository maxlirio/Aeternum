// The fight inside a great ship you've boarded (the Harrow: tools/gen-harrow.mjs lays out its decks, its guard's posts and the ways they walk).
// Its marines stand their posts whether you come or not; the first of them to see you, or to hear a shot, raises the ship: the men at the
// posts fight from behind what's there, the watch below in the mess turns out and comes for you along the ship's own ways, and the hands
// at work take up their arms. Rounds are stopped by what stands between (the same walls, plant and shields that stop you). A charge set on
// the lance's coolant junction goes off when its fuse runs out.
// Pure: all of it in the deck plan's own frame; `frame` puts that in the world ({ c: [x, y, z] under the middle of the plan, facing }).
export const FUSE = 100, GUARD_HP = 100, SEE = 60, HEAR = 75;

const seg = (a, b, B) => {      // does the line a → b pass through the box B [x0, y0, z0, x1, y1, z1]?
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) { const d = b[k] - a[k]; if (Math.abs(d) < 1e-9) { if (a[k] < B[k] || a[k] > B[k + 3]) return false; continue; }
    let u = (B[k] - a[k]) / d, v = (B[k + 3] - a[k]) / d; if (u > v) [u, v] = [v, u]; if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) return false; }
  return true;
};
// what's solid in a deck plan, as boxes: its things, its walls (open at their doors), its decks; a rail is seen and shot through
export function solidsOf(L) {
  const out = [];
  for (const p of L.props) out.push([p.x0, p.y ?? L.deck, p.z0, p.x1, (p.y ?? L.deck) + p.h, p.z1]);
  for (const w of L.walls) {
    const along = w.z0 === w.z1, a0 = along ? w.x0 : w.z0, a1 = along ? w.x1 : w.z1, c = along ? w.z0 : w.x0, T = 0.12;
    const box = (u0, u1, y0, y1) => { if (u1 - u0 > 0.01 && y1 > y0) out.push(along ? [u0, y0, c - T, u1, y1, c + T] : [c - T, y0, u0, c + T, y1, u1]); };
    if (w.rail) { if (w.y1 - w.y0 > 2) box(a0, a1, w.y0, w.y1 - 1.05); continue; }
    let u = a0; const ds = (w.doors || []).map(id => L.doors[id]).sort((p, q) => (along ? p.x - q.x : p.z - q.z));
    for (const d of ds) { const m = along ? d.x : d.z; box(u, m - d.width / 2, w.y0, w.y1); box(m - d.width / 2, m + d.width / 2, L.deck + d.height, w.y1); u = m + d.width / 2; }
    box(u, a1, w.y0, w.y1);
  }
  for (const s of L.slabs) for (const r of s.rects) out.push([r[0], s.y - 0.3, r[1], r[2], s.y - 0.02, r[3]]);
  return out;
}

export class Boarding {
  constructor(L, frame, { rnd = Math.random } = {}) {
    this.L = L; this.rnd = rnd; this.solids = solidsOf(L); this.t = 0; this.alarm = false; this.shots = []; this.events = []; this.n = 0; this.fuse = null; this.blown = false;
    const f = frame.facing, ez = [Math.sin(f), Math.cos(f)], ex = [ez[1], -ez[0]]; this.f = f; this.ex = ex; this.ez = ez;
    this.O = [frame.c[0] - ex[0] * L.W / 2 - ez[0] * L.D / 2, frame.c[1], frame.c[2] - ex[1] * L.W / 2 - ez[1] * L.D / 2];
    // the ways: who's linked to whom
    this.nodes = L.nav.nodes; this.adj = this.nodes.map(() => []); for (const [a, b] of L.nav.links) { this.adj[a].push(b); this.adj[b].push(a); }
    this.men = L.posts.map((P, i) => ({ id: 'hx' + i + 'm'.repeat(i % 7), side: 'theirs', kind: P.kind, l: P.p.slice(), post: P.p.slice(), face: P.face, pos: this.toWorld(...P.p), facing: P.face + f, hp: GUARD_HP, dead: 0, fall: null, aim: 0, duck: 0, flinch: 0,
      moving: false, firedT: null, cool: 0.5 + rnd() * 1.5, burst: 0, up: 1 + rnd() * 2, awake: P.kind === 'crew' ? -1 : 0, path: null, replan: 0, seen: 0 }));
  }
  toWorld(x, y, z) { return [this.O[0] + this.ex[0] * x + this.ez[0] * z, this.O[1] + y, this.O[2] + this.ex[1] * x + this.ez[1] * z]; }
  toLocal(p) { const dx = p[0] - this.O[0], dz = p[2] - this.O[2]; return [dx * this.ex[0] + dz * this.ex[1], p[1] - this.O[1], dx * this.ez[0] + dz * this.ez[1]]; }
  inside(p) { const l = this.toLocal(p); return l[0] > 0 && l[0] < this.L.W && l[2] > 0.5 && l[2] < this.L.D && l[1] > -12 && l[1] < 50; }
  blocked(a, b) { for (const B of this.solids) if (seg(a, b, B)) return true; return false; }
  // how far along a ray (plan frame) the first solid thing is, up to `best`
  wallAlong(o, d, best) { const b = [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best]; let lo = 0, hi = 1; if (!this.blocked(o, b)) return best;
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (this.blocked(o, [o[0] + d[0] * best * m, o[1] + d[1] * best * m, o[2] + d[2] * best * m])) hi = m; else lo = m; } return best * hi; }
  nearest(l) { let bi = 0, bd = Infinity; this.nodes.forEach((n, i) => { const d = Math.hypot(n[0] - l[0], n[2] - l[2]) + Math.abs(n[1] - l[1]) * 3; if (d < bd) { bd = d; bi = i; } }); return bi; }
  route(a, b) { const prev = new Map([[a, -1]]), q = [a]; while (q.length) { const n = q.shift(); if (n === b) break; for (const m of this.adj[n]) if (!prev.has(m)) { prev.set(m, n); q.push(m); } } if (!prev.has(b)) return []; const out = []; for (let n = b; n !== -1; n = prev.get(n)) out.unshift(n); return out; }
  raise(why) { if (this.alarm) return; this.alarm = true; this.events.push({ type: 'alarm', why }); for (const M of this.men) if (M.awake < 0) M.awake = this.t + 2 + this.rnd() * 3; }
  // a shot was fired at o (the world): they hear it
  heard(o) { const l = this.toLocal(o); for (const M of this.men) if (M.hp > 0 && Math.hypot(M.l[0] - l[0], M.l[2] - l[2]) < HEAR) { this.raise('shot'); return; } }
  hurt(M, dmg, dir = null) {
    if (M.hp <= 0) return false; M.hp -= dmg; M.flinch = 0.28; M.duck = Math.max(M.duck, 0.6); M.up = 0.5 + this.rnd(); this.raise('hit');
    if (M.hp <= 0) { M.dead = 0; M.fall = dir ? Math.atan2(-dir[0], -dir[1]) : M.facing + Math.PI; M.moving = false; this.events.push({ type: 'down', M }); return true; }
    return false;
  }
  // the player's round along o + dir·t (the world): → { M, along, head } for the first of them it finds within `best`
  onRay(o, dir, best) {
    let hit = null; const lo = this.toLocal(o);
    for (const M of this.men) { if (M.hp <= 0) continue; const low = M.duck > 0.5;
      for (const [hy, r, head] of low ? [[0.35, 0.3, false], [0.75, 0.28, false], [1.02, 0.17, true]] : [[0.5, 0.3, false], [1.05, 0.3, false], [1.55, 0.17, true]]) {
        const px = M.pos[0] - o[0], py = M.pos[1] + hy - o[1], pz = M.pos[2] - o[2], along = px * dir[0] + py * dir[1] + pz * dir[2]; if (along < 0.4 || along > best) continue;
        if (Math.hypot(px - dir[0] * along, py - dir[1] * along, pz - dir[2] * along) > r) continue;
        if (this.blocked(lo, [M.l[0], M.l[1] + hy, M.l[2]])) continue;
        best = along; hit = { M, along, head }; } }
    return hit;
  }
  plant(you) { if (this.fuse != null || this.blown) return false; const l = this.toLocal(you.pos), c = this.L.charge; if (Math.hypot(l[0] - c[0], l[2] - c[2]) > 3.2 || Math.abs(l[1] - c[1]) > 2) return false; this.fuse = FUSE; this.raise('charge'); this.events.push({ type: 'planted' }); return true; }
  canPlant(you) { if (this.fuse != null || this.blown) return false; const l = this.toLocal(you.pos), c = this.L.charge; return Math.hypot(l[0] - c[0], l[2] - c[2]) <= 3.2 && Math.abs(l[1] - c[1]) <= 2; }
  step(dt, you) {
    this.t += dt; const t = this.t; this.shots = this.shots.filter(S => t - S.t < 0.3);
    if (this.fuse != null && !this.blown) { const was = this.fuse; this.fuse -= dt; for (const m of [60, 30, 10]) if (was > m && this.fuse <= m) this.events.push({ type: 'fuse', left: m }); if (this.fuse <= 0) { this.blown = true; this.events.push({ type: 'blow' }); } }
    const yl = you?.alive ? this.toLocal(you.pos) : null, here = yl && yl[0] > 0 && yl[0] < this.L.W && yl[2] > 0.5 && yl[2] < this.L.D, eye = yl && [yl[0], yl[1] + (you.low > 0.5 ? 0.9 : 1.5), yl[2]], yn = here ? this.nearest(yl) : -1;
    for (const M of this.men) {
      if (M.hp <= 0) { M.dead += dt; M.moving = false; continue; }
      M.flinch = Math.max(0, M.flinch - dt); M.cool -= dt; M.moving = false;
      const d = here ? Math.hypot(yl[0] - M.l[0], yl[1] - M.l[1], yl[2] - M.l[2]) : Infinity;
      const head = [M.l[0], M.l[1] + 1.5, M.l[2]], sees = here && d < (this.alarm ? SEE * 1.5 : SEE) && !this.blocked(head, eye);
      if (sees) { M.seen += dt; if (M.seen > (this.alarm ? 0 : M.awake < 0 ? 1.6 : 0.6)) this.raise('seen'); } else M.seen = Math.max(0, M.seen - dt);      // (a hand at work takes longer to believe it, but he shouts all the same)
      const fit = this.alarm && M.awake >= 0 && t >= M.awake;      // (a hand at work has to get to his arms first)
      if (!fit) { M.aim = Math.max(0, M.aim - dt); M.duck = Math.max(0, M.duck - dt * 2); M.facing = M.face + this.f; continue; }
      if (sees) {
        // he fights: up from behind what he's got to fire a burst, down again between; faces you
        const a = Math.atan2(yl[0] - M.l[0], yl[2] - M.l[2]); M.facing = a + this.f; M.up -= dt;
        if (M.up <= 0) { M.low = !M.low; M.up = M.low ? 0.7 + this.rnd() * 1.1 : 1.6 + this.rnd() * 1.4; }
        M.duck += ((M.low && M.kind !== 'react' ? 1 : 0) - M.duck) * Math.min(1, dt * 6); M.aim = Math.min(1, M.aim + dt * (M.duck > 0.5 ? -3 : 1.8));
        if (M.duck < 0.3 && M.aim > 0.8 && M.cool <= 0) {
          M.cool = M.burst > 0 ? 0.13 : 0.9 + this.rnd() * 0.9; M.burst = M.burst > 0 ? M.burst - 1 : 2 + Math.floor(this.rnd() * 3); M.firedT = t;
          const p = Math.max(0.05, Math.min(0.3, 0.36 - d / 170)) * (you.low > 0.5 ? 0.6 : 1) * (you.moving ? 0.75 : 1), hit = this.rnd() < p;
          const to = hit ? [yl[0], yl[1] + 1.1, yl[2]] : [yl[0] + (this.rnd() - 0.5) * 2.4, yl[1] + 0.4 + this.rnd() * 1.8, yl[2] + (this.rnd() - 0.5) * 2.4], from = [M.l[0] + Math.sin(a) * 0.6, M.l[1] + 1.45, M.l[2] + Math.cos(a) * 0.6];
          const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], len = Math.hypot(...dir) || 1, far = hit ? len : this.wallAlong(from, dir.map(q => q / len), len + 30);
          this.shots.push({ from: this.toWorld(...from), to: this.toWorld(from[0] + dir[0] / len * far, from[1] + dir[1] / len * far, from[2] + dir[2] / len * far), t, side: 'theirs', n: ++this.n, hit });
          if (hit) this.events.push({ type: 'hit', dmg: 6 + Math.floor(this.rnd() * 4), from: M.pos.slice() });
        }
        if (M.kind !== 'react' || d < 16) continue;      // (the watch below keeps coming until it's close)
      } else { M.aim = Math.max(0.3, M.aim - dt); M.duck = Math.max(0, M.duck - dt * 2); }
      // the watch below: along the ship's ways to where you are
      if (M.kind === 'react' && here) {
        if ((M.replan -= dt) <= 0 || !M.path) { M.replan = 2; const from = this.nearest(M.l); M.path = this.route(from, yn); if (M.path.length > 1 && Math.hypot(this.nodes[M.path[0]][0] - M.l[0], this.nodes[M.path[0]][2] - M.l[2]) < 2) M.path.shift(); }
        const tg = M.path.length ? this.nodes[M.path[0]] : yl, dx = tg[0] - M.l[0], dz = tg[2] - M.l[2], D = Math.hypot(dx, dz);
        if (D < 1.2 && M.path.length) { M.path.shift(); continue; }
        if (!M.path.length && D < 10) continue;
        const sp = 3.8, nx = M.l[0] + dx / D * sp * dt, nz = M.l[2] + dz / D * sp * dt;
        M.l[0] = nx; M.l[2] = nz; M.l[1] += (tg[1] - M.l[1]) * Math.min(1, dt * 3); M.moving = true; if (!sees) M.facing = Math.atan2(dx, dz) + this.f;
      }
    }
    // keep them out of each other
    for (let i = 0; i < this.men.length; i++) { const A = this.men[i]; if (A.hp <= 0) continue; for (let j = i + 1; j < this.men.length; j++) { const B = this.men[j]; if (B.hp <= 0) continue; const dx = B.l[0] - A.l[0], dz = B.l[2] - A.l[2], d = Math.hypot(dx, dz); if (d < 0.8 && d > 1e-3) { const k = (0.8 - d) / 2 / d; A.l[0] -= dx * k; A.l[2] -= dz * k; B.l[0] += dx * k; B.l[2] += dz * k; } } }
    for (const M of this.men) M.pos = this.toWorld(...M.l);
  }
  left() { return this.men.filter(M => M.hp > 0).length; }
  drain() { const e = this.events; this.events = []; return e; }
}
