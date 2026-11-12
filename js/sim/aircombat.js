// Air combat. Every combatant is a Flight (player/flight.js) — the same airframe physics
// the player flies, stalls included — flown either by the player or by an AI pilot here.
// Guns fire rounds that travel (and drop); missiles home by proportional navigation and
// burst by proximity. Hulls have hit points by mass; at zero a ship is wrecked: it loses
// power and falls. Plain numbers, no three.js: the whole fight runs in Node for tests.
import { Flight, fromEuler } from '../player/flight.js';
import { shipPlan } from '../gen/ships.js';

const GUN_V = 950, GUN_RANGE = 1300, GUN_DMG = 11, MSL_V = 640, MSL_LIFE = 14, MSL_DMG = 140, MSL_FUSE = 14;
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SIDES = { player: 'you', security: 'Civic Security', raider: 'raiders' };
export const hostile = (a, b) => a !== b && !(a === 'player' && b === 'security') && !(a === 'security' && b === 'player');

// Your instructor, when you fly by the mouse: the stick that brings the nose onto a direction (unit, world) the way a pilot would. It works out
// how far the aim lies to the side of the nose and how far above it, as seen with the wings level; banks into the turn in proportion to the
// side error (a few degrees for a nudge, never past BANK_MAX for a big one; the bank eases toward its target at a limited rate, so it can't snap
// from one wing to the other); and moves the nose with the pull and the rudder together, so a pull in a bank turns rather than climbs. The
// wings come level as the nose arrives (the bank goes with the side error), and within a hair of the aim it does nothing, so hand tremor
// doesn't rock the ship. (The bank itself turns you: player/flight.js, the wings carry the weight.) Up and down it only pitches. Nothing here rolls the ship over: a target behind is a hard banked turn, one way,
// kept until it's in front. `st` is the instructor's memory (its eased bank and which way it committed); a fresh {} starts it.
// (The AI pilots fly their own, harder stick in AirWar.pilot: they roll over and pull, as fighters do.)
const BANK_MAX = 1.13, BANK_RATE = 1.6;                             // ~65°; ~90°/s
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function steerToward(f, want, care = true, st = {}, dt = 1 / 60) {
  const right = f.left.map(x => -x), du = dot(want, f.up), dr = dot(want, right), df = dot(want, f.fwd);
  const off = Math.acos(clamp(df, -1, 1));
  // the error with the bank taken out: side (+ right) and up, in the frame of the wings held level
  const vert = Math.abs(f.pitch) > 1.15;                              // (pointing nearly straight up or down, "level wings" means nothing: just pitch and yaw)
  const phi = vert ? 0 : f.roll, c = Math.cos(phi), s = Math.sin(phi);
  const lat = dr * c + du * s, up = -dr * s + du * c;
  let side = Math.atan2(lat, df);                                     // −π..π, how far round the nose has to come sideways
  const elev = Math.atan2(up, Math.hypot(lat, df));                   // and how far up or down
  // far behind, the side can flip with a hair of movement: commit to one way round and keep it until the aim is ahead again
  if (Math.abs(side) > 1.9 && st.side) side = st.side * Math.abs(side);
  st.side = Math.abs(side) > 1.4 ? (st.side || Math.sign(side) || 1) : 0;
  // none at all within a hair of the nose (hand tremor on the mouse)
  const dz = sstep(0.003, 0.015, off);
  // the bank it wants: proportional to the side error, saturating smoothly at BANK_MAX, eased toward at a limited rate
  const bankWant = vert ? 0 : BANK_MAX * Math.tanh(side * 3 / BANK_MAX) * dz;
  if (st.bank === undefined || !isFinite(st.bank)) st.bank = clamp(phi, -BANK_MAX, BANK_MAX);
  st.bank += clamp(bankWant - st.bank, -BANK_RATE * dt, BANK_RATE * dt);
  // the stick commands a roll rate (2.4·agility rad/s at full): ask for a rate in proportion to the bank error, so it settles without ringing
  const A = f.agility || 1, be = Math.atan2(Math.sin(st.bank - phi), Math.cos(st.bank - phi));
  const roll = vert ? 0 : clamp(be * 2.6 / (2.4 * A), -1, 1);
  // the nose: a turn rate across and up in proportion to the error (~0.4 s across, ~0.2 s up and down, capped), turned into the airframe's pitch and
  // yaw through the bank: level, the rudder slides the nose across; banked, the pull does it; and the pull never lifts the nose off the aim
  const K = 2.6, KU = 4.5, wl = clamp(side * K, -1.4, 1.4) * dz, wu = clamp(elev * KU, -1.4, 1.4) * dz;
  let pitch = clamp((wu * c + wl * s) / (1.1 * A), -1, 1);
  if (care && Math.abs(f.aoa) > 0.24) pitch *= 0.3;
  const yaw = clamp((wl * c - wu * s) / (0.6 * A), -1, 1);
  return { pitch, roll, yaw };
}
export const GUN = { v: GUN_V, range: GUN_RANGE };
export class AirWar {
  constructor(world, planet) {
    this.world = world; this.planet = planet;
    this.craft = []; this.rounds = []; this.missiles = []; this.booms = []; this.events = []; this.t = 0; this.nextId = 1;
  }
  // add a combatant: model, side, where, heading, speed; pilot: 'ai' | 'player'
  spawn(model, side, pos, facing, speed = 0, pilot = 'ai', flight = null) {
    const f = flight || new Flight(this.world, this.planet, { model }, pos, facing); if (!flight) f.ai = true;
    if (!flight) { f.onGround = false; f.vel = [Math.sin(facing) * speed, 0, Math.cos(facing) * speed]; f.throttle = speed > 0 ? 0.85 : 0; }
    const L = shipPlan(model).layout, W = L.weapons || { guns: 0, missiles: 0 };
    const c = { id: this.nextId++, model, side, pilot, f, hp: Math.round(60 + f.mass / 900), maxHp: 0, flares: 8, flareCool: 0, guns: W.guns, missiles: W.missiles, gunCool: 0, mslCool: 0, lock: null, lockT: 0, target: null, alive: true, wreck: 0, name: L.name, r: Math.max(L.W, L.D) * 0.42 };
    c.maxHp = c.hp;
    this.craft.push(c); return c;
  }
  enemiesOf(c) { return this.craft.filter(o => o.alive && o !== c && hostile(c.side, o.side)); }
  // fire this craft's guns along its nose (with a little spread)
  fireGuns(c, dt) {
    if (!c.guns || c.gunCool > 0 || !c.alive) return false;
    c.gunCool = 0.07;
    const F = c.f.fwd, U = c.f.up, L = c.f.left;
    for (let g = 0; g < Math.min(2, c.guns); g++) {
      const jitter = add(add(F, U, (Math.random() - 0.5) * 0.012), L, (Math.random() - 0.5) * 0.012);
      const muzzle = add(add(c.f.pos, F, c.r * 0.9), L, (g - 0.5) * 1.2);
      this.rounds.push({ p: muzzle, v: add(c.f.vel, norm(jitter), GUN_V), life: GUN_RANGE / GUN_V, from: c });
    }
    return true;
  }
  fireMissile(c) {
    if (!c.missiles || c.mslCool > 0 || !c.lock || !c.lock.alive) return false;
    c.missiles--; c.mslCool = 1.2;
    const F = c.f.fwd;
    this.missiles.push({ p: add(add(c.f.pos, c.f.up, -1.2), F, 2), v: add(c.f.vel, F, 40), target: c.lock, life: MSL_LIFE, from: c, trail: [] });
    this.events.push({ type: 'missile', from: c, target: c.lock });
    return true;
  }
  // the enemy nearest the nose within a cone and range: what a seeker would lock
  seekerTarget(c, cone = 0.34, range = 4500) {
    let best = null, bs = Infinity;
    for (const o of this.enemiesOf(c)) {
      const d = sub(o.f.pos, c.f.pos), r = len(d); if (r > range) continue;
      const ang = Math.acos(clamp(dot(norm(d), c.f.fwd), -1, 1)); if (ang > cone) continue;
      if (dot(o.f.fwd, norm(d)) < 0.2) continue;                      // a heat-seeker has to see the engines: rear quarter only
      const sc = ang * 3000 + r; if (sc < bs) { bs = sc; best = o; }
    }
    return best;
  }
  // AI pilot: pick a target, lead it, keep off the ground, don't stall, shoot when it's in the pipper
  pilot(c, dt) {
    const f = c.f;
    if (!c.target || !c.target.alive || Math.random() < dt * 0.05) {
      let best = null, bd = Infinity;
      for (const o of this.enemiesOf(c)) { const d = len(sub(o.f.pos, f.pos)); if (d < bd) { bd = d; best = o; } }
      c.target = best;
    }
    let want;     // where the nose should point (a unit vector)
    const alt = f.altitude(), vs = f.vel[1];
    if (c.target) {
      const tp = c.target.f.pos, tv = c.target.f.vel, d = sub(tp, f.pos), r = len(d);
      const tof = r / (GUN_V + Math.max(0, dot(f.vel, norm(d))));
      want = norm(sub(add(tp, tv, tof), add(f.pos, f.vel, tof * 0.15)));
      if (r < 120 && dot(f.fwd, norm(d)) > 0.5) want = norm(add(want, f.up, 0.8));      // don't ram it: overshoot high
      const ang = Math.acos(clamp(dot(f.fwd, want), -1, 1));
      if (ang < 0.08 * (c.aim ?? 1) && r < GUN_RANGE) this.fireGuns(c, dt);
      // missiles: lock, hold, fire
      const s = this.seekerTarget(c);
      if (s === c.target) { c.lockT += dt; c.lock = s; } else { c.lockT = 0; c.lock = s; }
      if (c.lockT > 1.6 && r > 600) this.fireMissile(c);
    } else if (c.groundTarget) {        // nothing in the air: strafing runs on the town
      const g = c.groundTarget, d = sub([g[0], g[1] + 20, g[2]], f.pos), r = len(d);
      want = r > 2600 ? norm([d[0], (g[1] + 600 - f.pos[1]) * 2, d[2]]) : norm(d);
      if (r < 1200 && dot(f.fwd, norm(d)) > 0.985 && alt > 140) this.fireGuns(c, dt);
      if (r < 250) c.groundTarget = [g[0] + Math.sin(this.t + c.id) * 400, g[1], g[2] + Math.cos(this.t * 0.7 + c.id) * 400];
    } else want = norm([f.fwd[0], 0.05, f.fwd[2]]);
    // the ground is the first enemy: pull up when low or diving at it
    // the ground is the first enemy: look ahead along the flight path; pull up hard if it's coming
    const floor = 220, look = [1, 2, 4, 7, 10].map(k => { const q = add(f.pos, f.vel, k); return q[1] - Math.max(this.world.groundAt(q[0], q[2], q[1]).h, this.planet.seaLevel); });
    const danger = alt < floor || alt + vs * 7 < floor * 0.7 || Math.min(...look) < 170;
    if (danger) want = norm([f.fwd[0] * 0.4, 1.5, f.fwd[2] * 0.4]);
    // towers: something solid along the flight path → turn for whichever side is clear, and climb
    const solidAhead = k => { const q = add(f.pos, f.vel, k); return this.world.solidAt(q[0], q[1], q[2], 8); };
    if (!danger && f.pos[1] < 1300 && (solidAhead(1.5) || solidAhead(3) || solidAhead(5))) {
      const side = s2 => { const d = add(f.fwd, f.left, s2 * 0.9), sp = len(f.vel) || 1; const q = add(f.pos, norm(d), sp * 3); return this.world.solidAt(q[0], q[1], q[2], 8); };
      const s2 = !side(1) ? 1 : !side(-1) ? -1 : 0;
      want = s2 ? norm(add(add(f.fwd, f.left, s2 * 1.6), [0, 0.5, 0])) : norm([f.fwd[0] * 0.3, 1.6, f.fwd[2] * 0.3]);
    }
    // missiles inbound: break hard across their path
    const threat = this.missiles.find(m => m.target === c && len(sub(m.p, f.pos)) < 1500);
    if (threat) { want = norm(add(f.left, [0, 0.3, 0], Math.sin(this.t * 0.7 + c.id) > 0 ? 1 : -1)); if (len(sub(threat.p, f.pos)) < 900) this.dropFlares(c); }
    // stick: roll so the wanted direction is "above" the canopy, then pull toward it
    const right = f.left.map(x => -x), du = dot(want, f.up), dr = dot(want, right), df = dot(want, f.fwd);
    if (danger && f.up[1] < 0.3) want = [0, 1, 0];                 // upside down near the ground: roll upright first
    const rollErr = Math.atan2(dr, Math.max(0.05, du + (df > 0.97 ? 0.4 : 0)));
    let pitch = clamp(Math.atan2(du, Math.max(0.02, df)) * 3.5, -1, 1);
    let roll = clamp(rollErr * 1.8, -1, 1);
    if (df > 0.995) roll = clamp(-f.roll * 1.5 * (du >= 0 ? 1 : 0) + rollErr, -1, 1);
    if (Math.abs(f.aoa) > 0.24 && !danger) pitch *= 0.3;                     // pull right to the edge of the stall, not over it
    f.step(dt, { throttle: 1, pitch, roll, yaw: clamp(dr * 2, -1, 1) * 0.3, boost: !!c.target && len(sub(c.target.f.pos, f.pos)) > 2500 });
  }
  // flares: each missile chasing this craft has a fair chance to go for the flare instead
  dropFlares(c) {
    if (c.flares <= 0 || c.flareCool > 0 || !c.alive) return false;
    c.flares--; c.flareCool = 1.0;
    for (let k = 0; k < 4; k++) this.booms.push({ p: add(c.f.pos, [(Math.random() - 0.5) * 6, -2 - k, (Math.random() - 0.5) * 6]), t: 0, flare: true, v: add(c.f.vel, [(Math.random() - 0.5) * 30, -15, (Math.random() - 0.5) * 30], 0.5) });
    for (const m of this.missiles) if (m.target === c && len(sub(m.p, c.f.pos)) < 1800 && Math.random() < 0.55) { m.target = { alive: true, f: { pos: add(c.f.pos, [0, -20, 0]), vel: [0, -20, 0] }, decoy: true }; }
    this.events.push({ type: 'flares', craft: c });
    return true;
  }
  // at: where it struck (on or by the hull), dir: the way it was going: so whoever draws it can do the damage where it was done
  hit(c, dmg, by, at = null, dir = null) {
    if (!c.alive) return;
    c.hp -= dmg;
    if (at) this.events.push({ type: 'hit', craft: c, by, dmg, at, dir: dir || norm(sub(c.f.pos, at)) });
    if (c.hp <= 0) {
      c.alive = false; c.wreck = 0; c.f.throttle = 0; c.f.assist = false;
      this.booms.push({ p: c.f.pos.slice(), t: 0, big: true });
      this.events.push({ type: 'killed', craft: c, by });
    } else if (Math.random() < 0.15) this.booms.push({ p: c.f.pos.slice(), t: 0, big: false });
  }
  step(dt, playerInput = null) {
    this.t += dt;
    for (const c of this.craft) {
      c.gunCool -= dt; c.mslCool -= dt; c.flareCool -= dt;
      if (!c.alive) {   // a wreck: no power, falls, burns
        c.wreck += dt; c.f.step(dt, { pitch: -0.3, roll: 0.6 });
        if (Math.random() < dt * 6) this.booms.push({ p: c.f.pos.slice(), t: 0, smoke: true });
        if (c.f.onGround && !c.crashed) { c.crashed = true; this.booms.push({ p: c.f.pos.slice(), t: 0, big: true }); }
        continue;
      }
      if (c.pilot === 'ai') this.pilot(c, dt);
      else if (c.pilot === 'player' && playerInput) {   // the player's craft is stepped by the caller; here: its seeker
        const s = this.seekerTarget(c); if (s && s === c.lock) c.lockT += dt; else { c.lock = s; c.lockT = 0; }
      }
      if (c.f.impact > 20) this.hit(c, c.f.impact * 4, null);
    }
    // gun rounds: travel, drop, hit what they pass near
    for (const r of this.rounds) {
      const p0 = r.p; r.v[1] -= 9.81 * dt; r.p = add(r.p, r.v, dt); r.life -= dt;
      for (const c of this.craft) {
        if (!c.alive || c === r.from || !hostile(r.from.side, c.side)) continue;
        const seg = sub(r.p, p0), w = sub(c.f.pos, p0), t = clamp(dot(w, seg) / (dot(seg, seg) || 1), 0, 1), cl = add(p0, seg, t);
        if (len(sub(c.f.pos, cl)) < c.r) { this.hit(c, GUN_DMG, r.from, cl, norm(r.v)); r.life = 0; if (Math.random() < 0.3) this.booms.push({ p: cl, t: 0, spark: true }); break; }
      }
      if (r.p[1] < this.world.groundAt(r.p[0], r.p[2], r.p[1] + 1).h) r.life = 0;
    }
    this.rounds = this.rounds.filter(r => r.life > 0);
    // missiles: proportional navigation, proximity fuse
    for (const m of this.missiles) {
      m.life -= dt;
      const tgt = m.target, sp = Math.min(MSL_V, len(m.v) + 260 * dt);
      if (tgt.alive) {
        const los = sub(tgt.f.pos, m.p), r = len(los), vr = sub(tgt.f.vel, m.v), closing = -dot(vr, norm(los));
        const omega = [ (los[1] * vr[2] - los[2] * vr[1]) / (r * r), (los[2] * vr[0] - los[0] * vr[2]) / (r * r), (los[0] * vr[1] - los[1] * vr[0]) / (r * r) ];
        const acc = [4 * closing * (omega[1] * norm(los)[2] - omega[2] * norm(los)[1]), 4 * closing * (omega[2] * norm(los)[0] - omega[0] * norm(los)[2]), 4 * closing * (omega[0] * norm(los)[1] - omega[1] * norm(los)[0])];
        const al = len(acc), cap = 30 * 9.81; m.v = add(m.v, al > cap ? acc.map(x => x / al * cap) : acc, dt);
        if (tgt.decoy) { tgt.f.pos = add(tgt.f.pos, tgt.f.vel, dt); if (r < MSL_FUSE * 2) { this.booms.push({ p: m.p.slice(), t: 0, big: false }); m.life = 0; } }
        else if (r < MSL_FUSE) { this.hit(tgt, MSL_DMG, m.from, m.p.slice(), norm(m.v)); this.booms.push({ p: m.p.slice(), t: 0, big: true }); m.life = 0; }
      }
      m.v = norm(m.v).map(x => x * sp);
      m.p = add(m.p, m.v, dt);
      m.trail.push(m.p.slice()); if (m.trail.length > 40) m.trail.shift();
      if (m.p[1] < this.world.groundAt(m.p[0], m.p[2], m.p[1] + 1).h) { m.life = 0; this.booms.push({ p: m.p.slice(), t: 0, big: false }); }
    }
    this.missiles = this.missiles.filter(m => m.life > 0);
    for (const b of this.booms) { b.t += dt; if (b.v) { b.v[1] -= 9.81 * dt; b.p = add(b.p, b.v, dt); } }
    this.booms = this.booms.filter(b => b.t < (b.smoke ? 6 : b.flare ? 3 : b.big ? 2.5 : 0.6));
    this.craft = this.craft.filter(c => c.alive || c.wreck < 40);
  }
}

// Raids: every few planet-hours a flight of raiders comes in over the hills; Civic Security
// scrambles its fighters. Pure in time: when the next one comes, how many, from where.
import { hashInts, hashStr } from '../core/hash.js';
export const RAIDERS = ['needle', 'interceptor', 'shade', 'gunship0', 'gunship1', 'racer0', 'racer1'];
export const DEFENDERS = ['interceptor', 'striker', 'warden'];
export function raidAt(planet, s, k) {
  const H = planet.dayLength / 24, h = j => hashInts(planet.universeSeed[0] ^ 0x6a1d, [hashStr(8, s.key), k, j]) / 4294967296;
  return { k, t: (k + h(1) * 0.6) * 6 * H, n: 2 + Math.floor(h(2) * 3), bearing: h(3) * Math.PI * 2, defenders: 1 + Math.floor(h(4) * 3),
    models: [0, 1, 2, 3, 4].map(i => RAIDERS[Math.floor(h(10 + i) * RAIDERS.length)]), defModels: [0, 1, 2, 3].map(i => DEFENDERS[Math.floor(h(20 + i) * DEFENDERS.length)]) };
}
export const raidIndex = (planet, t) => Math.floor(t / (6 * planet.dayLength / 24));
