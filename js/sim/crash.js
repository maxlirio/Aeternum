// What a crash does. Every vehicle can take damage: how hard you hit decides whether it scuffs, dents, crumples, stops running,
// catches fire, or goes up. Pure logic, runs in Node. A record says what has happened (where it was struck, how deep, whether it
// burns); render/wrecks.js bends the model to match and render/fx.js draws the flames. Speeds here are the change in velocity (m/s).
//   under  3: nothing          3–9: scuffed, a dent
//   9–18: crumpled, hurts      18+: may catch fire (likelier the harder), and fire may reach the fuel
//   38+: can go up on the spot
const SCUFF = 3, FIRE_AT = 18, BLOW_AT = 38, STRENGTH = { bike: 0.7, car: 1, ship: 1.6 };

export class Crashes {
  // hooks: world (for shoving wrecks about), ground(x, z, y), save(id, data), load(id), rnd
  constructor(hooks = {}) { this.h = hooks; this.list = new Map(); this.events = []; this.rnd = hooks.rnd || Math.random; }
  get(id) { return this.list.get(id) || null; }
  has(id) { return this.list.has(id); }
  // A vehicle's damage record. { kind: 'car'|'bike'|'ship', L, W, H, type, colour, pos, facing }
  of(id, v) {
    let D = this.list.get(id); if (D) return D;
    const saved = this.h.load?.(id);
    D = { id, kind: v.kind || 'car', L: v.L, W: v.W, H: v.H, type: v.type, model: v.model, colour: v.colour || 0, pos: v.pos.slice(), facing: v.facing, pitch: v.pitch || 0, roll: v.roll || 0, hp: 100, hits: [], ver: 0,
      fire: 0, fuse: null, burnsOut: 0, burnt: 0, smoke: 0, dead: false, exploded: false, ride: false, vel: [0, 0, 0], spin: 0, pitchV: 0, rollV: 0 };
    if (saved) Object.assign(D, { hp: saved.hp, hits: saved.hits || [], burnt: saved.burnt || 0, dead: !!saved.dead, exploded: !!saved.exploded, smoke: saved.dead ? 0.35 : 0, ver: 1, pos: saved.pos || D.pos, facing: saved.facing ?? D.facing, pitch: saved.pitch ?? D.pitch, roll: saved.roll ?? D.roll });
    this.list.set(id, D);
    return D;
  }
  save(D) { this.h.save?.(D.id, { hp: Math.round(D.hp), hits: D.hits.slice(-10), burnt: D.burnt, dead: D.dead, exploded: D.exploded, pos: D.pos.map(v => +v.toFixed(2)), facing: +D.facing.toFixed(3), pitch: +D.pitch.toFixed(2), roll: +D.roll.toFixed(2), type: D.type, colour: D.colour, kind: D.kind, L: D.L, W: D.W, H: D.H }); }
  // Struck. dv: change in velocity. at, dir: where and which way, in the vehicle's own frame (x forward, y up, z to its left), dir pointing into it.
  hit(D, dv, at, dir) {
    if (dv < SCUFF) return { dv, none: true };
    const S = STRENGTH[D.kind] || 1, soft = dv / S;
    const depth = Math.min(Math.min(D.L * 0.34, 2.2), soft * 0.022 + soft * soft * 0.00125);
    D.hits.push({ p: at.map(v => +v.toFixed(3)), d: dir.map(v => +v.toFixed(3)), depth: +depth.toFixed(3) }); D.ver++;
    if (D.hits.length > 14) D.hits.shift();
    const was = D.dead;
    D.hp = Math.max(0, D.hp - Math.max(0, soft - 2) ** 1.55 * 0.62);
    if (D.hp <= 0) D.dead = true;
    if (D.hp < 45) D.smoke = Math.max(D.smoke, (45 - D.hp) / 45);
    let ignited = false, blew = false;
    if (!D.exploded) {
      if (soft > BLOW_AT && this.rnd() < Math.min(0.85, (soft - BLOW_AT) / 22 + 0.2)) { blew = true; this.explode(D); }
      else if (!D.fire && soft > FIRE_AT && this.rnd() < Math.min(0.95, (soft - FIRE_AT) / 24)) { ignited = true; this.ignite(D); }
      else if (!D.fire && D.dead && !was && this.rnd() < 0.3) { ignited = true; this.ignite(D); }
    }
    this.save(D);
    return { dv, depth, ignited, blew, dead: D.dead, killed: D.dead && !was };
  }
  ignite(D) { if (D.exploded || D.fire) return; D.fire = 0.25; if (this.rnd() < 0.62) D.fuse = 5 + this.rnd() * 17; else D.burnsOut = 28 + this.rnd() * 25; this.events.push({ type: 'fire', D }); }
  explode(D) {
    if (D.exploded) return; D.exploded = true; D.dead = true; D.hp = 0; D.fuse = null; D.fire = 1; D.burnsOut = 35 + this.rnd() * 30; D.burnt = Math.max(D.burnt, 0.6); D.ver++;
    // thrown up and over by its own blast
    const up = 4 + 5 * this.rnd() / Math.sqrt(Math.max(1, D.L / 4));
    D.vel[1] += up; D.rollV += (this.rnd() - 0.5) * 4; D.pitchV += (this.rnd() - 0.5) * 3; D.spin += (this.rnd() - 0.5) * 1.6;
    // and blown out from the inside
    for (let k = 0; k < 4; k++) { const a = this.rnd() * 6.28; D.hits.push({ p: [Math.cos(a) * D.L * 0.3, D.H * (0.25 + 0.5 * this.rnd()), Math.sin(a) * D.W * 0.3], d: [Math.cos(a) * 0.6, 0.5, Math.sin(a) * 0.6], depth: +(0.1 + 0.16 * this.rnd()).toFixed(3), out: true }); }
    this.events.push({ type: 'blast', D, pos: [D.pos[0], D.pos[1] + D.H * 0.5, D.pos[2]], R: 7 + Math.min(16, D.L * 1.2) }); this.save(D);
  }
  // A blast nearby rocks whatever's in range; close enough and it goes too.
  blastAt(pos, R, skip) { for (const D of this.list.values()) { if (D === skip || D.exploded) continue; const d = Math.hypot(D.pos[0] - pos[0], D.pos[2] - pos[2]); if (d > R) continue; const f = 1 - d / R; this.shove(D, (D.pos[0] - pos[0]) / (d || 1) * 9 * f, 4 * f, (D.pos[2] - pos[2]) / (d || 1) * 9 * f); this.hit(D, 24 * f + 6, [0, D.H * 0.5, 0], [0, 0, 1]); if (f > 0.55 && !D.fire) this.ignite(D); } }
  shove(D, vx, vy, vz) { D.vel[0] += vx; D.vel[1] += vy; D.vel[2] += vz; D.spin += (vx * Math.cos(D.facing) - vz * Math.sin(D.facing)) * 0.08; }
  // A bullet. dmg in hit points; a holed tank can catch.
  shot(D, dmg, at, dir) { D.hp = Math.max(0, D.hp - dmg * (D.kind === 'ship' ? 0.1 : 0.32)); D.hits.push({ p: at, d: dir, depth: 0.015 }); D.ver++; if (D.hits.length > 14) D.hits.shift(); if (D.hp < 45) D.smoke = Math.max(D.smoke, (45 - D.hp) / 45); if (D.hp <= 0 && !D.dead) D.dead = true; if (!D.fire && !D.exploded && D.hp < 35 && this.rnd() < 0.35) this.ignite(D); this.save(D); }
  step(dt) {
    for (const D of this.list.values()) {
      if (D.fire > 0) {
        D.fire = Math.min(1, D.fire + dt * 0.18); D.burnt = Math.min(1, D.burnt + dt * 0.022);
        if (D.fuse != null) { D.fuse -= dt; if (D.fuse <= 0) this.explode(D); }
        else if (D.burnsOut > 0) { D.burnsOut -= dt; if (D.burnsOut <= 0) { D.fire = 0; D.smoke = Math.max(D.smoke, 0.3); D.dead = true; D.hp = 0; this.save(D); } }
      }
      if (D.ride) continue;                // (the one you're in moves by its own rules: player/ride.js)
      // shoved, thrown, or falling
      const mv = Math.hypot(D.vel[0], D.vel[1], D.vel[2]);
      if (mv > 0.02 || Math.abs(D.rollV) > 0.02 || Math.abs(D.pitchV) > 0.02) {
        let x = D.pos[0] + D.vel[0] * dt, z = D.pos[2] + D.vel[2] * dt; const ground = this.h.ground ? this.h.ground(x, z, D.pos[1] + 1) : 0;
        D.vel[1] -= 9.81 * dt; let y = D.pos[1] + D.vel[1] * dt, on = false;
        if (y <= ground) { y = ground; if (D.vel[1] < -7) this.hit(D, -D.vel[1], [0, 0, 0], [0, 1, 0]); D.vel[1] = D.vel[1] < -3 ? -D.vel[1] * 0.22 : 0; on = true; }
        D.pos = [x, y, z]; D.facing += D.spin * dt; D.pitch += D.pitchV * dt; D.roll += D.rollV * dt;
        if (on) { const k = Math.exp(-dt * 2.6); D.vel[0] *= k; D.vel[2] *= k; D.spin *= k; D.pitchV *= Math.exp(-dt * 5); D.rollV *= Math.exp(-dt * 5); D.pitch += settle(D.pitch) * Math.min(1, dt * 3); D.roll += settle(D.roll) * Math.min(1, dt * 3); if (Math.hypot(D.vel[0], D.vel[2]) < 0.05) { D.vel[0] = D.vel[2] = 0; D.spin = 0; } }
      } else { D.pitch += settle(D.pitch) * Math.min(1, dt * 3); D.roll += settle(D.roll) * Math.min(1, dt * 3); }
    }
  }
  drain() { const e = this.events; this.events = []; return e; }
  forget(id) { this.list.delete(id); }
}
// It comes to rest on its wheels, or on its roof, or its side: whichever it's nearest.
const settle = a => { const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2); return q - a; };

// The vehicle's own frame for a world point or direction. x forward (sin f, cos f), z to its left (-cos f, sin f).
export const toLocal = (D, wx, wy, wz) => { const f = D.facing, dx = wx - D.pos[0], dz = wz - D.pos[2]; return [dx * Math.sin(f) + dz * Math.cos(f), wy - D.pos[1], -dx * Math.cos(f) + dz * Math.sin(f)]; };
export const dirLocal = (D, wx, wy, wz) => { const f = D.facing; return [wx * Math.sin(f) + wz * Math.cos(f), wy, -wx * Math.cos(f) + wz * Math.sin(f)]; };
