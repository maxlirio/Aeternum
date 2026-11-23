// The war over the whole planet: what the nations at war (gen/society.js) do to each other's towns, whether you're watching
// or not. Now and then one of them brings a dreadnought down out of the clouds over an enemy town and burns it: it comes
// down slow and huge, sirens going in the streets; its keel lights; a beam comes down on the middle of the town and winds
// outward in a spiral until every building has been under it; then it climbs away. The town stays burnt (a `razed/<key>`
// delta: render/settlement-mesh.js builds it as ruins). Further off, news comes in of other towns that went the same way.
// Pure: no three.js; everything it needs about the world is passed in (main.js wires it up and draws it).
import { hashStr } from '../core/hash.js';

// the strike's timeline, in seconds from its start (game time runs at real speed: sim/clock.js)
export const ARRIVE = 28, CHARGE = 9, BURN = 26, LEAVE = 45;
export const FIRE = ARRIVE + CHARGE, DONE = FIRE + BURN, GONE = DONE + LEAVE;
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
  const u = (tt - FIRE) / BURN; if (u < 0 || u > 1) return null;
  const m = (TURNS + 1) * u, r = S.R * Math.min(1, m / TURNS), a = S.a0 + 2 * Math.PI * m; return [S.cx + Math.cos(a) * r, S.cz + Math.sin(a) * r];      // (out in TURNS turns, then once round the rim)
}
// when the beam reaches (x, z): the moment on the spiral whose angle is that way and whose radius is nearest it
export function burnAt(S, x, z) {
  const dx = x - S.cx, dz = z - S.cz, d = Math.hypot(dx, dz); if (d > S.R * 1.08) return Infinity;
  const turn = ((Math.atan2(dz, dx) - S.a0) / (2 * Math.PI) % 1 + 1) % 1; let best = 0, bd = Infinity;
  for (let k = 0; k <= TURNS; k++) { const m = k + turn, e = Math.abs(S.R * Math.min(1, m / TURNS) - d); if (e < bd) { bd = e; best = m; } }
  return FIRE + best / (TURNS + 1) * BURN;
}
// the ship, `tt` seconds in: in from far off along its bearing, coming down as it comes, slowing to hang over the town; then away and up
export function shipAt(S, tt) {
  const bx = Math.sin(S.bearing), bz = Math.cos(S.bearing), yaw = S.bearing + Math.PI;
  if (tt < ARRIVE) { const f = ease(tt / ARRIVE), d = 9000 * (1 - f); return { x: S.cx + bx * d, y: S.g + HANG + 7000 * (1 - f) ** 1.6, z: S.cz + bz * d, yaw }; }
  if (tt < DONE) { const w = Math.sin(tt * 0.21) * 12; return { x: S.cx + w, y: S.g + HANG + Math.sin(tt * 0.13) * 6, z: S.cz, yaw }; }
  const f = ease((tt - DONE) / LEAVE), d = 14000 * f; return { x: S.cx - bx * d, y: S.g + HANG + 9000 * f * f, z: S.cz - bz * d, yaw };
}

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
  //   getDelta(k), patchDelta(k, v): the save
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
  drain() { const e = this.events; this.events = []; return e; }
}
