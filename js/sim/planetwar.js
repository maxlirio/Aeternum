// The war over the whole planet: what the nations at war (gen/society.js) do to each other's towns, whether you're watching
// or not. Now and then one of them brings a dreadnought down out of the clouds over an enemy town and burns it: it comes
// down slow and huge, sirens going in the streets; its keel lights; a beam comes down on the middle of the town and winds
// outward in a spiral until every building has been under it; then it climbs away. The town stays burnt (a `razed/<key>`
// delta: render/settlement-mesh.js builds it as ruins). Further off, news comes in of other towns that went the same way.
// Pure: no three.js; everything it needs about the world is passed in (main.js wires it up and draws it).
import { hashStr } from '../core/hash.js';
import { rot, restPose } from '../gen/hulk.js';

// the strike's timeline, in seconds from its start (game time runs at real speed: sim/clock.js)
export const ARRIVE = 28, CHARGE = 9, BURN = 26, LINGER = 300, LEAVE = 45;      // (it can't climb away until the lance has cooled: five minutes hanging there with its vents open and its bay open for its fighters)
export const FIRE = ARRIVE + CHARGE, DONE = FIRE + BURN, AWAY = DONE + LINGER, GONE = AWAY + LEAVE;
// how it can be killed: the heat vents along its flanks, open the whole time it's down in the air. Each is a target (sim/aircombat.js
// spawnFixed); with all of them shot out its reactor has nowhere to dump heat: the beam dies, it breaks up, and FALL seconds later it's
// in the ground, where it stays (gen/hulk.js). Its guns: where its point defence fires from. All in its own frame (x across, y up, z stern to bow).
// The ship is the Harrow (gen/capital.js HULLS, tools/assets/harrow_kit.py): two hulls, the lance in its drum between them, muzzle down.
export const MODEL = 'harrow', LANCE = [0, -308, 200];
export const VENTS = [[-520, -40, -400], [520, -40, -400], [-520, -40, 800], [520, -40, 800]], VENT_HP = 420, VENT_R = 30;
export const GUNS = [[-400, 150, -790], [400, 150, -790], [-400, 135, 1180], [400, 135, 1180], [-330, -210, 500], [330, -210, 500], [0, 250, -1065]];
export const FALL = 26;
export const TURNS = 6;           // times the beam goes round on its way out from the middle
export const HANG = 1500;         // how high over the town it hangs to burn it (m)
export const BEAM_R = 26;         // what's under the beam burns (m)
// how much of a burnt building still stands, as a share of its height (render/ruin.js breaks it off there, ragged; player/collision.js keeps
// its walls to the lowest of that)
export const ruinKeep = key => 0.28 + 0.4 * hashStr(7932, key) / 4294967296;
export const ruinFloor = (key, H) => Math.max(2.4, H * ruinKeep(key) - 2.85);

const ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
// where the beam is, `tt` seconds in: → [x, z] on the ground, or null when it isn't firing
export function beamAt(S, tt) {
  const u = (tt - FIRE) / BURN; if (u < 0 || u > 1 || (S.down != null && tt >= S.down)) return null;
  const m = (TURNS + 1) * u, r = S.R * Math.min(1, m / TURNS), a = S.a0 + 2 * Math.PI * m; return [S.cx + Math.cos(a) * r, S.cz + Math.sin(a) * r];      // (out in TURNS turns, then once round the rim)
}
// when the beam reaches (x, z): the moment on the spiral whose angle is that way and whose radius is nearest it
export function burnAt(S, x, z) {
  const dx = x - S.cx, dz = z - S.cz, d = Math.hypot(dx, dz); if (d > S.R * 1.08) return Infinity;
  const turn = ((Math.atan2(dz, dx) - S.a0) / (2 * Math.PI) % 1 + 1) % 1; let best = 0, bd = Infinity;
  for (let k = 0; k <= TURNS; k++) { const m = k + turn, e = Math.abs(S.R * Math.min(1, m / TURNS) - d); if (e < bd) { bd = e; best = m; } }
  return FIRE + best / (TURNS + 1) * BURN;
}
// the ship, `tt` seconds in: in from far off along its bearing, coming down as it comes, slowing to hang over the town; then away and up.
// Brought down (S.down: when, on the same clock; S.p0: where it was then; S.rest: where it ends up): it falls from there, rolling.
export function shipAt(S, tt) {
  if (S.down != null) { const u = Math.min(1, Math.max(0, (tt - S.down) / FALL)), A = S.p0, B = S.rest, k = u * u, h = ease(u), wob = Math.sin(u * 9) * 0.05 * (1 - u);
    return { x: A.x + (B.x - A.x) * h, y: A.y + (B.y - A.y) * k, z: A.z + (B.z - A.z) * h, yaw: A.yaw + (B.yaw - A.yaw) * h, pitch: B.pitch * ease(u * 1.3) + wob, roll: B.roll * ease(u * 1.15) + wob * 1.7 }; }
  const bx = Math.sin(S.bearing), bz = Math.cos(S.bearing), yaw = S.bearing + Math.PI;
  if (tt < ARRIVE) { const f = ease(tt / ARRIVE), d = 9000 * (1 - f); return { x: S.cx + bx * d, y: S.g + HANG + 7000 * (1 - f) ** 1.6, z: S.cz + bz * d, yaw }; }
  if (tt < AWAY) return { x: S.cx, y: S.g + HANG, z: S.cz, yaw };      // (dead still: three kilometres of ship holding station for its lance; and so its decks are a place you can stand)
  const f = ease((tt - AWAY) / LEAVE), d = 14000 * f; return { x: S.cx - bx * d, y: S.g + HANG + 9000 * f * f, z: S.cz - bz * d, yaw };
}
// a point of the ship (its own frame) in the world, the ship being at P ({ x, y, z, yaw, pitch?, roll? })
export function shipPoint(P, p) { const M = rot(P.yaw, P.pitch || 0, P.roll || 0); return [P.x + M[0] * p[0] + M[1] * p[1] + M[2] * p[2], P.y + M[3] * p[0] + M[4] * p[1] + M[5] * p[2], P.z + M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }

// the enemy a nation is at war with (full war, not a border war: those are fought on the line, sim/front.js), or null
export function enemyOf(nations, relationOf, nat) {
  if (!nat) return null; let best = null;
  for (const o of nations) { if (o === nat) continue; const r = relationOf(nat, o); if (r?.state === 'war' && (!best || o.strength > best.strength)) best = o; }
  return best;
}

export class PlanetWar {
  // hooks:
  //   townsNear(x, z, r) → settlements ({ key, name, cx, cz, R, h }) within r; farTown(pos) → some town tens of km off, or null
  //   nationOf(s) → its nation; enemyOf(nation) → who'd burn it, or null
  //   isHome(s); ground(x, z)
  //   getDelta(k), patchDelta(k, v), clearDelta(k): the save
  constructor(hooks, { firstIn = 240 + Math.random() * 180, every = [480, 900], newsEvery = [300, 600], newsIn = 120 + Math.random() * 240 } = {}) {
    this.h = hooks; this.cur = null; this.events = []; this.every = every; this.newsEvery = newsEvery;
    this.next = firstIn; this.news = newsIn;
  }
  razed(s) { return this.h.getDelta('razed/' + s.key) || null; }
  // fully burnt by now (its buildings are ruins)
  ruined(s, now) { const D = this.razed(s); return !!D && now - D.t0 >= DONE; }
  // a strike on s from now: → the strike, also kept in the save so it carries on (and the town stays burnt) whatever you do
  begin(s, now, by) {
    const r = hashStr(0x5791, 'strike:' + s.key) / 4294967296;
    const S = { key: s.key, name: s.name, cx: s.cx, cz: s.cz, R: Math.max(120, (s.R || 300) * 1.05), g: s.h ?? this.h.ground(s.cx, s.cz), bearing: r * 2 * Math.PI, a0: r * 17 % (2 * Math.PI), t0: now, by: by?.name || 'the enemy', byId: by?.id ?? null };
    this.h.patchDelta('razed/' + s.key, S); this.cur = S; this.events.push({ type: 'warn', S }); return S;
  }
  // `pos`: you; `ok`: whether anything should start now (not in space, not in a menu)
  step(dt, now, pos, ok = true) {
    // one going on: through its phases (by the clock, so a save loaded halfway carries on from there)
    if (this.cur?.down != null) { const S = this.cur, tt = now - S.t0;      // brought down: it falls, hits, and that's the end of it
      if (!S.crashed && tt >= S.down + FALL) { S.crashed = true; this.events.push({ type: 'crash', S }); }
      if (tt >= S.down + FALL + 2) this.cur = null;
      return; }
    if (this.cur) { const S = this.cur, tt = now - S.t0;
      if (!S.firing && tt >= FIRE) { S.firing = true; this.events.push({ type: 'fire', S }); }
      if (!S.burnt && tt >= DONE) { S.burnt = true; this.events.push({ type: 'burnt', S }); }
      if (tt >= GONE) { this.cur = null; this.events.push({ type: 'gone', S }); }
      return; }
    // a save loaded while one was going on: pick it up where the clock has it
    if ((this.look = (this.look || 0) - dt) <= 0) { this.look = 5;
      for (const s of this.h.townsNear(pos[0], pos[2], 7000)) { const D = this.razed(s); if (D && !D.far && now - D.t0 < GONE) { this.cur = { ...D, firing: now - D.t0 >= FIRE, burnt: now - D.t0 >= DONE }; return; } } }
    if (!ok) return;
    // news from further off: a town you can't see went the same way
    if ((this.news -= dt) <= 0) { this.news = this.newsEvery[0] + Math.random() * (this.newsEvery[1] - this.newsEvery[0]);
      const s = this.h.farTown(pos), by = s && !this.h.isHome(s) && !this.razed(s) && this.h.enemyOf(this.h.nationOf(s));
      if (by) { const S = { key: s.key, name: s.name, cx: s.cx, cz: s.cz, R: Math.max(120, (s.R || 300) * 1.05), g: s.h ?? 0, bearing: 0, a0: 0, t0: now - GONE, by: by.name, byId: by.id, far: true };
        this.h.patchDelta('razed/' + s.key, S); this.events.push({ type: 'news', S, d: Math.hypot(s.cx - pos[0], s.cz - pos[2]), dir: Math.atan2(s.cx - pos[0], s.cz - pos[2]) }); } }
    // one near enough to see: a town within a few kilometres of you, of a nation at war
    if ((this.next -= dt) > 0) return;
    const near = this.h.townsNear(pos[0], pos[2], 7000).filter(s => !this.h.isHome(s) && !this.razed(s) && this.h.enemyOf(this.h.nationOf(s)));
    if (!near.length) { this.next = 60; return; }
    const d = s => Math.hypot(s.cx - pos[0], s.cz - pos[2]), inIt = near.filter(s => d(s) < (s.R || 300)), view = near.filter(s => d(s) >= (s.R || 300) + 600 && d(s) < 7000);
    // mostly one you can watch from where you are; now and then the one you're standing in
    const pool = inIt.length && Math.random() < 0.3 ? inIt : view.length ? view : near, s = pool.sort((a, b) => d(a) - d(b))[Math.floor(Math.random() * Math.min(2, pool.length))];
    this.next = this.every[0] + Math.random() * (this.every[1] - this.every[0]);
    this.begin(s, now, this.h.enemyOf(this.h.nationOf(s)));
  }
  // its last vent's gone: it comes down. Before it had fired (or as it began to), the town's saved; later, what's burnt is burnt.
  // The wreck's in the save from this moment (hulk/<town>: where it'll lie), so it's there whatever you do while it falls.
  cripple(now) {
    const S = this.cur; if (!S || S.down != null) return null; const tt = now - S.t0, P = shipAt(S, tt), r = hashStr(0x77aa, 'fall:' + S.key + ':' + Math.round(S.t0)) / 4294967296;
    const a = S.bearing + Math.PI + (r - 0.5) * 1.6, d = 1500 + 1300 * r, x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;      // (it slides off the way it was heading, clear of the town)
    S.p0 = { x: P.x, y: P.y, z: P.z, yaw: P.yaw }; S.rest = restPose(MODEL, x, z, P.yaw + (r - 0.5) * 0.9, this.h.ground, r); S.down = tt; S.saved = tt < FIRE + 3;
    const H = { ...S.rest, t: now + FALL, by: S.by, town: S.name };
    this.h.patchDelta('hulk/' + S.key + ':' + Math.round(S.t0), H);
    if (S.saved) this.h.clearDelta('razed/' + S.key);
    else { this.h.patchDelta('razed/' + S.key, { t0: Math.min(S.t0, now - DONE), far: true }); if (!S.burnt) { S.burnt = true; this.events.push({ type: 'burnt', S }); } }      // (far: nothing more to play out there)
    this.events.push({ type: 'down', S, H }); return H;
  }
  // somebody's loose aboard it (main.js): it doesn't get under way with a fight on its decks. Its clock stops short of its leaving.
  hold(dt, now) { const S = this.cur; if (S && S.down == null && now - S.t0 > AWAY - 20) S.t0 += dt; }
  drain() { const e = this.events; this.events = []; return e; }
}
