// What the great ships are for, and where each one is. None of them only stands over the city (gen/capital.js gives each its station there):
//   every one is a single ship in the universe, calling at a round of worlds (routeOf): a stay over each one's first town, then a jump to the next.
//     Where it is at any moment is pure in the fleet's own time, the same seen from every world (berthAt), so a ship that jumps out of one sky
//     comes out in another's, and anyone aboard goes with it;
//   over a world it works (shipAt): the tanker and the bulk carrier stand on station taking a town's goods aboard, carry them to another town
//     and put them down there; the liner runs passengers the same way; the warship, the carrier and the bomber go out on patrol; the two that
//     people live on keep their station. Under way, its decks go with it and so does whoever's on them;
//   and what it does shows (tendersAt, patrolsAt): lighters fly up from the town's field into its bay with a tank or a stack of crates slung
//     under them and go back down empty (or the other way, unloading); the carrier's fighters fly their circuits off its deck.
import { hashStr } from '../core/hash.js';
import { starChart } from './stars.js';
import { HULLS } from './capital.js';

// role: what it is; load: what its lighters carry slung under them; n: how many lighters; craft: what they are; local: what it does over a world
export const DUTY = {
  longshore: { role: 'tanker', load: 'tank', n: 5, craft: ['shuttle'], local: 'run', P: 1900, stay: 950 },
  tiller: { role: 'bulk carrier', load: 'crate', n: 5, craft: ['shuttle'], local: 'run', P: 2300, stay: 1150 },
  halcyon: { role: 'liner', load: null, n: 3, craft: ['yacht', 'courier'], local: 'run', P: 2100, stay: 1200 },
  anvil: { role: 'warship', load: 'crate', n: 1, craft: ['shuttle'], local: 'patrol', P: 2600, stay: 1300, R: 14000 },
  bastion: { role: 'carrier', load: 'crate', n: 1, craft: ['shuttle'], local: 'patrol', P: 2700, stay: 1500, R: 11000, wing: ['interceptor', 'striker', 'interceptor', 'warden'], deck: [[-30, 64, -380], [-30, 64, -200]] },
  sable: { role: 'bomber', load: null, n: 0, craft: [], local: 'patrol', P: 2200, stay: 900, R: 19000 },
  meridian: { role: 'habitat', load: 'tank', n: 2, craft: ['shuttle'], local: 'stay', live: true },
  vesper: { role: 'city', load: 'crate', n: 4, craft: ['shuttle', 'courier'], local: 'stay', live: true },
};
export const VOYAGES = DUTY;
export const HOME_PORT = { system: 0, body: 3 };
const GAP = 45;      // seconds in FTL between two worlds: gone from both
const STAYS = { work: [3000, 1500], live: [10800, 3600] };      // how long over the home world, and over another
const ease = f => f * f * (3 - 2 * f), clamp01 = f => Math.max(0, Math.min(1, f));
const turn = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
const samePort = (a, b) => a.system === b.system && a.body === b.body;

// the worlds a ship calls at, in order, round and round: home, another world of the home system, home, a world of another star
const routes = new Map();
export function routeOf(U, model) {
  const key = U.join(':') + '|' + model; if (routes.has(key)) return routes.get(key);
  const chart = starChart(U), h = k => hashStr((U[0] ^ (k * 0x9e3779b1)) >>> 0, 'route:' + model), D = DUTY[model], S = STAYS[D?.live ? 'live' : 'work'];
  const inner = chart[0].bodies.filter(b => b.n !== HOME_PORT.body), a = { system: 0, body: inner[h(1) % inner.length].n };
  const far = chart[1 + h(2) % (chart.length - 1)], b = { system: far.n, body: far.bodies[h(3) % far.bodies.length].n };
  const ports = [{ ...HOME_PORT, stay: S[0] }, { ...a, stay: S[1] }, { ...HOME_PORT, stay: S[0] }, { ...b, stay: S[1] }];
  const R = { ports, T: ports.reduce((n, p) => n + p.stay + GAP, 0), off: h(4) % 100000 };
  routes.set(key, R); return R;
}
// where `model` is at fleet time tau → { port (the world it's over, or bound for), i, n (how many calls it's made), u (seconds into this stay),
// stay, ftl (true: between worlds; then `from` is the world it left and u/stay how far through the jump), next (the world after) }
export function berthAt(U, model, tau) {
  const R = routeOf(U, model), T = tau + R.off, lap = Math.floor(T / R.T); let u = T - lap * R.T;
  for (let i = 0; i < R.ports.length; i++) { const p = R.ports[i], nx = R.ports[(i + 1) % R.ports.length];
    if (u < p.stay) return { port: p, i, n: lap * R.ports.length + i, u, stay: p.stay, ftl: false, next: nx };
    u -= p.stay; if (u < GAP) return { port: nx, from: p, i, n: lap * R.ports.length + i, u, stay: GAP, ftl: true, next: nx };
    u -= GAP; }
  return { port: R.ports[0], i: 0, n: 0, u: 0, stay: R.ports[0].stay, ftl: false, next: R.ports[1] };
}
// is it over the world `here` just now ({ system, body })
export const inPort = (B, here) => !B.ftl && samePort(B.port, here);

// C: the ship (gen/capital.js fleetOf); home: its station over this world { x, y, z, yaw }; dests: towns it runs to [{ x, z, name }]; ground(x, z);
// B: its berth (berthAt), over this world. → { x, y, z, yaw, away (under way: its bay's shut), phase: 'station' | 'out' | 'there' | 'back', dest,
// since, len (seconds into this phase, and how long it is), mode ('load' | 'unload': what its lighters are doing while it stands), jump (0..1 over
// its last seconds here, spooling), drop (1..0 over its first, just out of FTL) }
const SPOOL = 6, DROP = 1.6;
export function shipAt(C, home, dests, ground, B) {
  const D = DUTY[C.model], u = B.u, atHome = samePort(B.port, HOME_PORT), jump = clamp01((u - (B.stay - SPOOL)) / SPOOL), drop = clamp01(1 - u / DROP);
  const stand = (since, len) => ({ away: false, ...home, phase: 'station', since, len, mode: atHome ? 'load' : 'unload', jump, drop });
  if (!D || D.local === 'stay' || (D.local === 'run' && !dests.length)) return stand(u, B.stay);
  const n = Math.max(0, Math.floor((B.stay - 150) / D.P)); if (u >= n * D.P) return stand(u - n * D.P, B.stay - n * D.P);
  const k = Math.floor(u / D.P), q = u - k * D.P; if (q < D.stay) return stand(q, D.stay);
  const leg = (D.P - D.stay) / 3, w = q - D.stay, h = hashStr(12 + k + B.n * 7, C.model);
  let T;
  if (D.local === 'run') T = dests[h % dests.length];
  else { const a = (h % 628) / 100; T = { x: home.x + Math.sin(a) * D.R, z: home.z + Math.cos(a) * D.R, name: 'patrol' }; }
  const head = Math.atan2(T.x - home.x, T.z - home.z), back = head + Math.PI, lift = home.y - Math.max(ground(home.x, home.z), 0);
  // (it stands off to one side of the far town, as it does of its own)
  const tx = T.x + Math.cos(head) * 1300, tz = T.z - Math.sin(head) * 1300, ty = Math.max(ground(T.x, T.z), 0) + lift, dest = { ...T, sx: tx, sy: ty, sz: tz };
  if (w < leg) { const f = w / leg, g = ease(clamp01((f - 0.12) / 0.88)); return { away: true, x: home.x + (tx - home.x) * g, z: home.z + (tz - home.z) * g, y: home.y + (ty - home.y) * g + Math.sin(Math.PI * g) * 400, yaw: turn(home.yaw, head, ease(clamp01(f / 0.12))), phase: 'out', dest, since: w, len: leg, jump: 0, drop: 0 }; }
  if (w < 2 * leg) return { away: false, x: tx, y: ty, z: tz, yaw: head, phase: 'there', dest, since: w - leg, len: leg, mode: atHome ? 'unload' : 'load', jump: 0, drop: 0 };
  const f = (w - 2 * leg) / leg, g = ease(clamp01((f - 0.12) / 0.76));
  return { away: true, x: tx + (home.x - tx) * g, z: tz + (home.z - tz) * g, y: ty + (home.y - ty) * g + Math.sin(Math.PI * g) * 400, yaw: f < 0.5 ? turn(head, back, ease(clamp01(f / 0.12))) : turn(back, home.yaw, ease(clamp01((f - 0.88) / 0.12))), phase: 'back', dest, since: w - 2 * leg, len: leg, jump: 0, drop: 0 };
}

// ---- its lighters, while it stands: each flies up from the field at the edge of town, in at the bay's mouth, hangs over the deck while its load
// is taken off, and goes back down for the next (or brings loads down, unloading). pose: { x, y, z, yaw } of the ship; pad: [x, y, z] the field.
// → [{ id, model, c, facing, pitch, colour, load (what's slung under it just now: 'tank' | 'crate' | null), r (how big it is, to be run into) }]
const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
export function tendersAt(model, pose, pad, since, len, mode) {
  const D = DUTY[model], F = HULLS[model], out = []; if (!D?.n || !pad) return out;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), [mx, my, mz] = F.dock, ox = c, oz = -s;      // (out of the mouth: the ship's +x)
  const mouth = [pose.x + mx * c + mz * s, pose.y + my + 4.6, pose.z - mx * s + mz * c];
  for (let i = 0; i < D.n; i++) {
    const row = (i - (D.n - 1) / 2) * 26, P0 = [pad[0] + oz * row, pad[1] + 4.3, pad[2] - ox * row], P1 = [P0[0], P0[1] + 90, P0[2]];
    // (in down one side of the lane or the other, not over the box in the middle of it where a ship sets down)
    const lat = (i % 2 ? 1 : -1) * 13, lx = s * lat, lz = c * lat, P2 = [mouth[0] + ox * 320, mouth[1] + 14, mouth[2] + oz * 320], P3 = [mouth[0] + ox * 30 + lx, mouth[1], mouth[2] + oz * 30 + lz], deep = 26 + 15 * (i % 3), P4 = [mouth[0] - ox * deep + lx, mouth[1], mouth[2] - oz * deep + lz];
    const cruise = Math.max(20, Math.hypot(P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]) / 75), legs = [[P0, P1, 7], [P1, P2, cruise], [P2, P3, 9], [P3, P4, 6], [P4, P4, 16], [P4, P3, 6], [P3, P2, 9], [P2, P1, cruise], [P1, P0, 7], [P0, P0, 20]];
    const cycle = legs.reduce((n, L) => n + L[2], 0), delay = i * cycle / D.n, j = Math.floor((since - delay) / cycle); if (since < delay || delay + (j + 1) * cycle > len) continue;      // (not flying: on the field, or stowed in the bay)
    let w = since - delay - j * cycle, li = 0; while (li < legs.length - 1 && w >= legs[li][2]) w -= legs[li++][2];
    const [A, B, T] = legs[li], f = li === 1 || li === 7 ? ease(w / T) : w / T, p = mix(A, B, f), up = li < 4, still = A === B;
    // (it keeps the heading it flew in on while it hangs or stands; up and down on the spot, the heading of the way across)
    const dirOf = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]) > 1 ? Math.atan2(b[0] - a[0], b[2] - a[2]) : null, facing = (still ? null : dirOf(A, B)) ?? (li === 4 ? dirOf(P3, P4) : li === 0 ? dirOf(P1, P2) : dirOf(P2, P1));
    const run = Math.hypot(B[0] - A[0], B[2] - A[2]), pitch = still || run < 1 ? 0 : Math.max(-0.35, Math.min(0.35, Math.atan2(B[1] - A[1], run) * 0.6));
    const full = mode === 'load' ? up : !up && li < 9;
    out.push({ id: `tender:${model}:${i}`, model: D.craft[i % D.craft.length], c: p, facing, pitch, roll: 0, colour: (hashStr(i, model) % 6), load: full ? D.load : null, r: 7, rampDown: false, moving: !still, ground: false, pad: P0 });
  }
  return out;
}
// ---- the carrier's wing: its fighters fly a circuit off the deck and back onto it, over and over, wherever it is and whatever it's doing
// (in the ship's own frame, so they hold it while it's under way). → the same records as tendersAt
export function patrolsAt(model, pose, t) {
  const D = DUTY[model], out = []; if (!D?.wing) return out;
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), toW = p => [pose.x + p[0] * c + p[2] * s, pose.y + p[1], pose.z - p[0] * s + p[2] * c];
  D.wing.forEach((craft, i) => {
    const spot = D.deck[i % D.deck.length], wide = 1300 + 500 * (i % 3), long = 2200 + 400 * ((i * 2) % 3), fly = 2 * Math.PI * Math.sqrt((wide * wide + long * long) / 2) / 120, cycle = fly + 40, w = ((t + i * cycle / D.wing.length) % cycle + cycle) % cycle;
    const at = th => [spot[0] - wide * (1 - Math.cos(th)), spot[1] + 1.2 + 320 * Math.sin(th / 2) ** 2, spot[2] + long * Math.sin(th)];
    if (w >= fly) { out.push({ id: `wing:${model}:${i}`, model: craft, c: toW(at(0)), facing: pose.yaw, pitch: 0, roll: 0, colour: 4, load: null, r: 6, rampDown: false, moving: false, ground: true }); return; }
    const th = ease(w / fly) * 2 * Math.PI, a = at(th), b = at(th + 0.02), A = toW(a), B = toW(b), run = Math.hypot(B[0] - A[0], B[2] - A[2]);
    out.push({ id: `wing:${model}:${i}`, model: craft, c: A, facing: Math.atan2(B[0] - A[0], B[2] - A[2]), pitch: Math.atan2(B[1] - A[1], run || 1), roll: -0.55 * Math.sin(th / 2) ** 2, colour: 4, load: null, r: 6, rampDown: false, moving: true, ground: false });
  });
  return out;
}
