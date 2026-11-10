// Animals near the player, alive. Where a herd lives is fixed by the world (gen/fauna.js); once you're within a few
// hundred metres its members graze, wander, keep together, shy from you at the distance their kind can bear, panic at
// gunfire, and a big one you hurt may come for you. Away from you they stop existing and start again from home, unless
// you killed them: that's remembered. Pure logic: reads the ground, knows nothing of meshes.
import { herdInTile, HERD_TILE } from '../gen/fauna.js';
import { rawHeight } from '../gen/terrain.js';
import { surfaceAt, surfaceHeight } from '../gen/surface.js';
import { rocksNear } from '../gen/rocks.js';
import { floraNear } from '../gen/flora.js';

const NEAR = 300, DROP = 380, REMEMBER = 3 * 86400;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class FaunaSim {
  constructor(planet, { isDead = () => false, markDead = () => {}, onStruck = () => {}, resolve = null } = {}) {
    this.resolve = resolve;      // (out of whatever's solid: a building, a wall, a parked car, a trunk; main.js gives it the world's collision)
    Object.assign(this, { planet, isDead, markDead, onStruck, herds: new Map(), animals: [], cell: null, test: false, lastCheck: 0, time: 0 });
  }
  clear() { this.herds.clear(); this.animals.length = 0; this.test = true; }
  spawnHerd(H, frozen = false) {
    const list = [];
    for (let i = 0; i < H.n; i++) {
      const id = `${H.id}:${i}`; if (this.isDead(id)) continue;
      const a0 = (H.seed * 0.001 + i * 2.4) % 6.283, r0 = 2 + H.sp.size * 1.3 * Math.sqrt(i + 0.5), x = H.x + Math.cos(a0) * r0, z = H.z + Math.sin(a0) * r0;
      const s = surfaceAt(this.planet, x, z);
      const A = { id, herd: H, sp: H.sp, x, z, y: s.h, facing: a0 * 3, speed: 0, wantSpeed: 0, tx: x, tz: z, state: frozen ? 'pose' : 'graze', t: 2 + (i * 1.7) % 7, hp: H.sp.K.hp, alert: 0, pitch: 0, hx: 0, seed: (H.seed + i * 7919) % 1000, gh: s.h, flown: 0, frozen };
      if (H.sp.K.fear === 0) { A.state = 'fly'; A.y = s.h + 45 + (i * 13) % 30; A.ang = i * 0.7; A.base = s.h; }
      list.push(A); this.animals.push(A);
    }
    this.herds.set(H.id, { H, list, cx: H.x, cz: H.z, tx: H.x, tz: H.z, t: 10, alarm: 0 });
  }
  spawnTest(sp, x, z, n, facing) { const H = { id: 'test' + this.herds.size, sp, x, z, n: n, seed: 7 }; this.spawnHerd(H, true); const A = this.animals[this.animals.length - 1]; A.x = x; A.z = z; A.y = surfaceHeight(this.planet, x, z); A.gh = A.y; if (sp.plan === 'jelly') A.y += 2.5 + sp.size;      /* (a jelly never touches the ground) */ A.facing = facing; return A; }
  // which herds should be awake around (x, z)
  wake(x, z) {
    const ti = Math.floor(x / HERD_TILE), tj = Math.floor(z / HERD_TILE), want = new Set();
    for (let a = ti - 1; a <= ti + 1; a++) for (let b = tj - 1; b <= tj + 1; b++) {
      const H = herdInTile(this.planet, a, b); if (!H || Math.hypot(H.x - x, H.z - z) > NEAR) continue;
      want.add(H.id); if (!this.herds.has(H.id)) this.spawnHerd(H);
    }
    for (const [id, G] of this.herds) if (!want.has(id) && Math.hypot(G.cx - x, G.cz - z) > DROP) { for (const A of G.list) { const i = this.animals.indexOf(A); if (i >= 0) this.animals.splice(i, 1); } this.herds.delete(id); }
  }
  blocked(A, x, z) {
    const r = A.sp.size * 0.3; let hit = null;
    rocksNear(this.planet, x, z, r, q => { if (q.top > 0.5) hit = q; });
    if (!hit && A.sp.size > 1) floraNear(this.planet, x, z, r + 0.5, p => { if (p.solid) hit = p; });
    return hit;
  }
  update(dt, px, pz, py) {
    this.time += dt;
    if (!this.test && (!this.cell || Math.hypot(px - this.cell[0], pz - this.cell[1]) > 40) && !(py - rawHeight(this.planet, px, pz) > 1500)) { this.cell = [px, pz]; this.wake(px, pz); }     // (from high up nothing's woken: they're too small to see, and a ship going over fast would wake every herd under it)
    for (const G of this.herds.values()) {
      G.alarm = Math.max(0, G.alarm - dt);
      G.t -= dt; if (G.t <= 0) { G.t = 18 + Math.random() * 30; const a = Math.random() * 6.283, d = 12 + Math.random() * 34, x = G.H.x + (G.cx - G.H.x) * 0.6 + Math.cos(a) * d, z = G.H.z + (G.cz - G.H.z) * 0.6 + Math.sin(a) * d; G.tx = x; G.tz = z; }
      G.cx += (G.tx - G.cx) * Math.min(1, dt * 0.05); G.cz += (G.tz - G.cz) * Math.min(1, dt * 0.05);
    }
    for (const A of this.animals) this.think(A, dt, px, pz, py);
  }
  think(A, dt, px, pz, py) {
    const S = A.sp, K = S.K, G = this.herds.get(A.herd.id), R = S.size;
    if (A.state === 'down') { A.speed = 0; A.t += dt; return; }
    if (A.frozen) { A.t += dt; return; }
    const dx = px - A.x, dz = pz - A.z, d = Math.hypot(dx, dz);
    if (A.state === 'fly') { this.fly(A, dt, G); return; }
    A.t -= dt; A.alert = Math.max(0, A.alert - dt * 0.35);
    if (d < K.fear * 1.5 && Math.abs((py ?? A.y) - A.y) < 8) A.alert = Math.min(1, A.alert + dt * 2);
    if (A.state === 'charge') {
      A.wantSpeed = S.rig?.speed?.[1] || 3.4; A.tx = px; A.tz = pz;
      if (d < R * 0.55) { this.onStruck(A); A.state = 'walk'; A.t = 8; A.tx = A.x - dx * 3; A.tz = A.z - dz * 3; A.wantSpeed = 1.5; }
      if (A.t <= 0 || d > 60) { A.state = 'graze'; A.t = 5; }
    } else if ((d < K.fear || (G && G.alarm > 0)) && K.fear > 0 && A.state !== 'charge') {   // too close, or the herd's running
      if (A.state !== 'flee') A.state = 'flee';
      if (G && d < K.fear) G.alarm = Math.max(G.alarm, 4);
      A.t = 5;
      const ax = -dx / (d || 1), az = -dz / (d || 1), j = Math.sin(this.time * 0.7 + A.seed) * 0.45;
      A.tx = A.x + (ax * Math.cos(j) - az * Math.sin(j)) * 20; A.tz = A.z + (ax * Math.sin(j) + az * Math.cos(j)) * 20; A.wantSpeed = S.speed1 || this.fast(A);
    } else if (A.state === 'flee') { if (A.t <= 0) { A.state = 'graze'; A.t = 3 + Math.random() * 3; } }
    else if (A.state === 'graze') { A.wantSpeed = 0; if (A.t <= 0) { A.state = 'walk'; A.t = 6 + Math.random() * 10; const a = Math.random() * 6.283, rr = (G ? 4 : 0) + R * (2 + Math.random() * 4); A.tx = (G?.cx ?? A.x) + Math.cos(a) * rr; A.tz = (G?.cz ?? A.z) + Math.sin(a) * rr; } }
    else if (A.state === 'walk') { A.wantSpeed = this.slow(A); if (A.t <= 0 || Math.hypot(A.tx - A.x, A.tz - A.z) < R * 0.6) { A.state = 'graze'; A.t = 3 + Math.random() * 9; } }
    // steer: toward where it wants to go, round what's in the way, apart from its neighbours
    let want = Math.atan2(A.tx - A.x, A.tz - A.z);
    if (G) for (const O of G.list) if (O !== A && O.state !== 'down') { const ox = A.x - O.x, oz = A.z - O.z, od = Math.hypot(ox, oz), keep = R * 0.95; if (od < keep && od > 1e-3) want += angDiff(Math.atan2(ox, oz), want) * (1 - od / keep) * 0.8; }
    if (A.wantSpeed > 0.05) {
      A.probe = (A.probe || 0) - dt;
      if (A.probe <= 0) { A.probe = 0.28; const ahead = R * 0.8 + A.speed * 0.5, fx = A.x + Math.sin(want) * ahead, fz = A.z + Math.cos(want) * ahead, s = surfaceAt(this.planet, fx, fz), rise = (s.h - A.gh) / ahead;
        A.turn = 0; if (s.h < this.planet.seaLevel + 0.8 || s.town > 0.02 || s.wet > 0.5 || Math.abs(rise) > (A.state === 'flee' ? 1.0 : 0.7)) A.turn = 1.3 * ((A.seed % 2) * 2 - 1); else if (this.blocked(A, fx, fz)) A.turn = 0.9 * ((A.seed % 2) * 2 - 1); }
      want += A.turn || 0;
    }
    const turnRate = (A.speed > 2 ? 2.2 : 1.5) * (S.plan === 'trundler' ? 0.6 : 1.2);
    A.facing += Math.max(-turnRate * dt, Math.min(turnRate * dt, angDiff(want, A.facing)));
    const aligned = Math.max(0.15, Math.cos(angDiff(want, A.facing)));
    A.speed += (A.wantSpeed * aligned - A.speed) * Math.min(1, dt * (A.state === 'flee' ? 3 : 1.6));
    A.x += Math.sin(A.facing) * A.speed * dt; A.z += Math.cos(A.facing) * A.speed * dt;
    if (this.resolve && A.speed > 0.01) { const [rx, rz] = this.resolve(A.x, A.z, A.y ?? A.gh ?? 0, Math.max(0.25, A.sp.size * 0.3)); A.x = rx; A.z = rz; }
    A.hgt = (A.hgt || 0) - dt; if (A.hgt <= 0) { A.hgt = A.speed > 3 ? 0.07 : 0.15; const f = R * 0.45, h0 = surfaceHeight(this.planet, A.x, A.z), hf = surfaceHeight(this.planet, A.x + Math.sin(A.facing) * f, A.z + Math.cos(A.facing) * f), hb = surfaceHeight(this.planet, A.x - Math.sin(A.facing) * f, A.z - Math.cos(A.facing) * f); A.gh = h0; A.wantPitch = Math.atan2(hb - hf, 2 * f); }
    A.y += (A.gh - A.y) * Math.min(1, dt * 7); A.pitch += ((A.wantPitch || 0) - A.pitch) * Math.min(1, dt * 4);
  }
  slow(A) { return { trundler: 0.8, rooter: 0.9, stilter: 1.2, strider: 1.4, hopper: 1.3, glider: 8, crawler: 0.7, grazer: 0.8, browser: 1.1, serpent: 0.9, flock: 9, jelly: 1.5, burrower: 0.6, shell: 0.3 }[A.sp.plan] * (A.sp.size > 3 ? 1.2 : 1); }
  fast(A) { return { trundler: 3.3, rooter: 4.5, stilter: 6.5, strider: 9, hopper: 7.5, glider: 14, crawler: 3.2, grazer: 3.6, browser: 6, serpent: 5, flock: 16, jelly: 4, burrower: 4, shell: 1.6 }[A.sp.plan]; }
  fly(A, dt, G) {
    const R = 30 + (A.seed % 40); A.ang += dt * (9 + A.seed % 3) / R; const x = (G?.cx ?? A.x) + Math.cos(A.ang) * R, z = (G?.cz ?? A.z) + Math.sin(A.ang) * R;
    A.hgt = (A.hgt || 0) - dt; if (A.hgt <= 0) { A.hgt = 0.6; A.gh = surfaceHeight(this.planet, A.x, A.z); }
    const want = Math.atan2(x - A.x, z - A.z), v = A.sp.plan === 'jelly' ? 2 + (A.seed % 2) : 10 + (A.seed % 4); A.facing += angDiff(want, A.facing) * Math.min(1, dt * 1.6); A.x += Math.sin(A.facing) * v * dt; A.z += Math.cos(A.facing) * v * dt; A.speed = v; A.bank = angDiff(want, A.facing);
    const floor = this.planet.genome?.noGround ? Math.max(A.base ?? A.gh, A.gh) : Math.max(A.gh, 0), wy = floor + (A.sp.plan === 'jelly' ? 8 + (A.seed % 14) : 45 + (A.seed % 35)) + Math.sin(this.time * 0.2 + A.seed) * 6;
    A.y += (wy - A.y) * Math.min(1, dt * 0.5);      // (a jelly drifts low; on a cloud world everything keeps above its deck, not the abyss)
    if (A.falling !== undefined) { A.falling += dt * 9.8; A.y -= A.falling * dt; if (A.y <= A.gh) { A.y = A.gh; A.state = 'down'; A.t = 0; } }
  }
  // Harm. True if it died of it.
  hurt(A, dmg) {
    if (A.state === 'down') return false;
    A.hp -= dmg; A.alert = 1; const G = this.herds.get(A.herd.id); if (G) G.alarm = 8;
    if (A.hp <= 0) { if (A.state === 'fly') { A.falling = 0; A.state = 'fly'; A.dead = true; } else { A.state = 'down'; A.t = 0; A.speed = 0; } A.dying = true; this.markDead(A.id, REMEMBER); return true; }
    if (A.sp.K.bold) { A.state = 'charge'; A.t = 10; } return false;
  }
  scare(x, z, R = 90) { for (const G of this.herds.values()) if (Math.hypot(G.cx - x, G.cz - z) < R + 40) G.alarm = 9; }
  // Something at reach in front of (x, z), for a strike. -> animal or null
  inReach(x, y, z, facing, reach) { let b = null, bd = 1e9; const fx = Math.sin(facing), fz = Math.cos(facing); for (const A of this.animals) { if (A.state === 'down' || A.state === 'fly') continue; const dx = A.x - x, dz = A.z - z, d = Math.hypot(dx, dz), r = reach + A.sp.size * 0.42; if (d < r && d < bd && Math.abs(A.y - y) < A.sp.size + 1 && (dx * fx + dz * fz) / (d || 1) > 0.35) { bd = d; b = A; } } return b; }
  // A shot along a ray. -> { A, along } or null
  onRay(o, dir, max) { let b = null, bd = max; for (const A of this.animals) { if (A.state === 'down') continue; const cy = A.y + A.sp.size * (A.state === 'fly' ? 0.3 : 0.5), dx = A.x - o[0], dy = cy - o[1], dz = A.z - o[2], t = dx * dir[0] + dy * dir[1] + dz * dir[2]; if (t < 0.5 || t > bd) continue; const off = Math.hypot(dx - dir[0] * t, dy - dir[1] * t, dz - dir[2] * t); if (off < A.sp.size * 0.42) { bd = t; b = A; } } return b && { A: b, along: bd }; }
  // A vehicle running into them.
  struck(x, z, speed, reach = 2.2) { let n = 0; if (speed > 5) for (const A of this.animals) { if (A.state === 'down' || A.state === 'fly') continue; const d = Math.hypot(A.x - x, A.z - z); if (d < reach + A.sp.size * 0.35) { this.hurt(A, speed * 4); n++; } } return n; }
}
