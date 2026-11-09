// The Meridian's three spin rings, inside. Each is a tube a kilometre and more round, turning so that its floor presses up under your feet
// as the ground would: down is outward, away from the axle. What you walk is laid out flat — a strip as long as the ring is round, its ends
// meeting — and the collision world walks it as it walks any building (player/collision.js). It's only drawn bent (render/rings.js), and the
// same numbers bend it in tools/assets/ring_kit.py, so the street you walk is the street you see.
//
// Ring frame (flat): x across the ring's floor, 0..W (the axle runs along it); y up from the floor, toward the axle; z (called s) along the
// ring in the direction it turns, 0..C. Pure: only + - * / floor sqrt, like all generation.
import { Rng } from '../core/prng.js';

export const PI = 3.141592653589793, SPIN_G = 9.81;
export const TUBE = { radial: 20, axial: 32, e: 3, floor: 14 };      // the tube's section (a squared ellipse) and how far out from its middle the floor lies
export const W = 54, CEIL = TUBE.floor + TUBE.radial;                  // the floor's width, and the height of the vault over the middle of it
export const RINGS = [
  { key: 'commons', name: 'the Commons', z: 60, R: 240, kind: 'town', seed: 11 },
  { key: 'arboretum', name: 'the Arboretum', z: 260, R: 190, kind: 'garden', seed: 23 },
  { key: 'fields', name: 'the Fields', z: -170, R: 210, kind: 'farm', seed: 37 },
];
for (const g of RINGS) { g.Rf = g.R + TUBE.floor; g.C = 2 * PI * g.Rf; g.omega = Math.sqrt(SPIN_G / g.Rf); }

const cbrt = a => { if (a <= 0) return 0; let x = a > 1 ? a : 1; for (let i = 0; i < 30; i++) x = (2 * x + a / (x * x)) / 3; return x; };
// How high the vault stands over the floor at x (the tube's section, read from its middle).
export function vaultAt(x) { const w = (x - W / 2) / TUBE.axial, q = 1 - Math.abs(w * w * w); return TUBE.floor + TUBE.radial * cbrt(q < 0 ? 0 : q); }
// The ring's turn at time t (seconds): an angle, and the pull it gives at h metres above the floor.
export const ringTurn = (g, t) => { const a = g.omega * t, k = Math.floor(a / (2 * PI)); return a - k * 2 * PI; };
export const pullAt = (g, h) => g.omega * g.omega * (g.Rf - h);

// ---------- what's in each ring
const lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t);
function wander(rng, C, step, amp, mid) {      // a path that wanders across the floor and comes back to meet itself round the ring
  const n = Math.max(3, Math.floor(C / step)), pts = []; for (let i = 0; i < n; i++) pts.push(mid + rng.range(-amp, amp));
  return s => { const u = (s / C) * n, i = Math.floor(u), f = u - i; return lerp(pts[((i % n) + n) % n], pts[(((i + 1) % n) + n) % n], sm(f)); };
}
const STREETS = ['Harbour Row', 'Lantern Street', 'Bellfounders\' Walk', 'Old Quay', 'Long Steps', 'Weavers\' Lane'];
const GLADES = ['the Cedar Glade', 'the Long Meadow', 'the Fern Hollow', 'the Water Garden', 'the High Grove', 'the Orchard Walk'];
const FARMS = ['North Terraces', 'the Mill Fields', 'the Seed Store', 'the Glass Rows', 'Orchard End', 'the Granary'];

const cache = new Map();
export function ringLayout(g) {
  if (cache.has(g.key)) return cache.get(g.key);
  const rng = new Rng([g.seed * 7919, g.seed * 104729 + 1]), C = g.C, L = { key: g.key, kind: g.kind, W, C, Rf: g.Rf, R: g.R, z: g.z, items: [], rooms: [] };
  const put = it => L.items.push(it);
  const stations = [0, 1, 2, 3, 4, 5].map(k => (k + 0.5) * C / 6);
  const nearStation = (s, d) => stations.some(q => Math.abs(s - q) < d);
  stations.forEach((s, k) => put({ t: 'station', s, x: W / 2, n: k }));
  const names = g.kind === 'town' ? STREETS : g.kind === 'garden' ? GLADES : FARMS;
  for (let k = 0; k < 6; k++) L.rooms.push({ i: k, purpose: 'lobby', label: names[k], rect: [0, k * C / 6, W, (k + 1) * C / 6] });
  const bench = (x, s, face) => put({ t: 'bench', x, s, face });
  if (g.kind === 'town') {
    // a terrace of houses down each side with their backs to the hull, shops at the foot of them, a street, a verge of trees and lamps, and a canal down the middle with bridges over it; a square at the foot of each spoke
    for (const side of [0, 1]) {
      let s = 3;
      while (s < C - 14) {
        const w = rng.range(6, 11.5), sq = nearStation(s + w / 2, 30), floors = sq ? rng.int(3, 4) : rng.int(2, 4);
        put({ t: 'house', side, x0: side ? W - 11 : 1, x1: side ? W - 1 : 11, s0: s, s1: s + w, floors, shop: rng.chance(sq ? 0.9 : 0.4), style: rng.int(0, 5), colour: rng.int(0, 7), roof: rng.int(0, 2), k: rng.int(0, 1e6) });
        s += w + (rng.chance(0.08) ? 2.6 : 0.0);
      }
    }
    for (let s = 6; s < C; s += 16) for (const x of [22.5, 31.5]) { if (nearStation(s, 25)) continue; put({ t: 'tree', x: x + rng.range(-0.3, 0.3), s: s + rng.range(-2, 2), h: rng.range(6.5, 9), k: rng.int(0, 1e6) }); }
    for (let s = 14; s < C; s += 16) for (const x of [22.1, 31.9]) { if (nearStation(s, 22)) continue; put({ t: 'lamp', x, s }); if (rng.chance(0.35)) bench(x === 22.1 ? 23.0 : 31.0, s + 4, x === 22.1 ? 1 : 3); }
    // bridges between the squares
    for (let k = 0; k < 6; k++) { const a = stations[k] + 26, b = stations[(k + 1) % 6] + (k === 5 ? C : 0) - 26; for (let j = 1; j <= 2; j++) { const s = (a + (b - a) * j / 3) % C; put({ t: 'bridge', s0: s - 2.2, s1: s + 2.2 }); } }
    // the squares: the canal goes under them, a fountain each side of the lift, market stalls, café tables
    for (const s of stations) {
      put({ t: 'square', s0: s - 24, s1: s + 24 });
      for (const d of [-13, 13]) put({ t: 'fountain', x: W / 2, s: s + d, r: 3.2 });
      for (const d of [-19, -9, 9, 19]) for (const x of [15.7, 38.3]) if (rng.chance(0.8)) put({ t: 'stall', x, s: s + d, colour: rng.int(0, 5) });
      for (const d of [-6, 6]) for (const x of [24.6, 29.4]) { put({ t: 'table', x, s: s + d }); }
    }
  } else if (g.kind === 'garden') {
    // under glass: a path wandering the length of it, a stream on the other side, groves of the planet's own trees, meadows between, ponds at the spokes
    const path0 = wander(rng, C, 60, 7, W / 2 - 6), stream = wander(rng, C, 45, 6, W / 2 + 9);
    const detour = s => { let w = 0; for (const q of stations) { let d = Math.abs(s - q); if (d > C / 2) d = C - d; const k = d < 16 ? 1 : d < 34 ? 1 - sm((d - 16) / 18) : 0; if (k > w) w = k; } return w; };
    const path = s => lerp(path0(s), 13.5, detour(s));          // (round the pond at each spoke's foot, not through it)
    L.path = []; L.stream = []; for (let s = 0; s <= C; s += 4) { L.path.push([path(s), s]); L.stream.push([stream(s), s]); }
    Object.defineProperty(L, 'pathAt', { value: path, enumerable: false });
    const meadow = s => { const u = (s % 160) / 160; return u > 0.62 && u < 0.86; };
    for (let s = 2; s < C; s += 3.2) for (let k = 0; k < 3; k++) {
      const x = rng.range(3, W - 3), ss = s + rng.range(-1.5, 1.5); if (Math.abs(x - path(ss)) < 3.4 || Math.abs(x - stream(ss)) < 2.8 || nearStation(ss, 22) || (meadow(ss) && rng.chance(0.85))) continue;
      const room = vaultAt(x) - 3; if (rng.chance(0.55)) continue;
      put({ t: 'tree', x, s: ss, h: Math.min(room, rng.range(7, 17)), k: rng.int(0, 1e6) });
    }
    for (let s = 1; s < C; s += 2.2) { const x = rng.range(2, W - 2), ss = s + rng.range(-1, 1); if (Math.abs(x - path(ss)) < 2 || Math.abs(x - stream(ss)) < 1.6 || nearStation(ss, 18)) continue; put({ t: rng.chance(0.6) ? 'shrub' : 'fern', x, s: ss, h: rng.range(0.6, 1.8), k: rng.int(0, 1e6) }); }
    for (let s = 20; s < C; s += 40) { if (nearStation(s, 24)) continue; const x = path(s) + (rng.chance(0.5) ? 2.4 : -2.4); bench(x, s, x > path(s) ? 3 : 1); put({ t: 'lamp', x: path(s + 10) + 1.8, s: s + 10 }); }
    for (let s = 0; s < C; s += 160) { const ss = s + 118; if (nearStation(ss, 30)) continue; put({ t: 'beds', s0: ss - 14, s1: ss + 14, x0: 6, x1: W - 6 }); }
    for (let s = 0; s < C; s += 80) { const ss = s + 40; if (nearStation(ss, 30)) continue; put({ t: 'footbridge', x: stream(ss), s: ss }); }
    for (const s of stations) { put({ t: 'pond', x: W / 2, s, r: 13 }); put({ t: 'pavilion', x: 47.5, s: s + 2, r: 4.5 }); bench(11.2, s - 8, 1); bench(11.2, s + 8, 1); }
  } else {
    // farmland: terraces of beds up the curve of the floor, a track down the middle, orchards, barns and silos by the spokes, racks of grow-lights along the hull
    for (let s = 0; s < C; s += 60) {
      if (nearStation(s + 30, 40)) continue;
      const crop = rng.int(0, 3);
      if (crop === 3) { for (let ss = s + 4; ss < s + 58; ss += 8) for (const x of [7, 14, 40, 47]) put({ t: 'tree', x, s: ss, h: rng.range(5, 8), k: rng.int(0, 1e6), orchard: true }); }
      else for (const [a, b] of [[4, 23], [31, 50]]) put({ t: 'crop', x0: a, x1: b, s0: s + 1.5, s1: s + 58.5, crop });
    }
    for (const s of stations) { put({ t: 'barn', side: 0, x0: 4, x1: 18, s0: s - 22, s1: s - 8, k: rng.int(0, 1e6) }); put({ t: 'silo', x: 44, s: s - 14, r: 4.5, h: 18 }); put({ t: 'silo', x: 44, s: s + 12, r: 4.5, h: 16 }); put({ t: 'barn', side: 1, x0: 36, x1: 50, s0: s + 22, s1: s + 34, k: rng.int(0, 1e6) }); }
    for (let s = 4; s < C; s += 9) { if (nearStation(s, 36)) continue; for (const x of [1.4, W - 1.4]) put({ t: 'rack', x, s }); }
    for (let s = 20; s < C; s += 50) { if (nearStation(s, 36)) continue; put({ t: 'lamp', x: 22.6, s }); put({ t: 'lamp', x: 31.4, s: s + 25 }); }
  }
  cache.set(g.key, L); return L;
}

// The ring as the collision world reads it: a building-format plan. A strip W × C, open at both ends (they're the same place).
const plans = new Map();
export function ringPlan(g) {
  if (plans.has(g.key)) return plans.get(g.key);
  const L = ringLayout(g), C = L.C, T = 0.3, walls = [], props = [], anchors = [], solids = [];
  const block = (x0, s0, x1, s1, y1, y0 = 0) => walls.push({ x0: (x0 + x1) / 2, z0: s0, x1: (x0 + x1) / 2, z1: s1, t: x1 - x0, y0, y1, k: 0, exterior: false, side: 'inner', openings: [] });
  const lineX = (x, s0, s1, y1, t = T) => walls.push({ x0: x, z0: s0, x1: x, z1: s1, t, y0: 0, y1, k: 0, exterior: false, side: 'rail', openings: [] });
  const lineS = (s, x0, x1, y1, t = T, y0 = 0) => walls.push({ x0, z0: s, x1, z1: s, t, y0, y1, k: 0, exterior: false, side: 'rail', openings: [] });
  lineX(0, 0, C, CEIL); lineX(W, 0, C, CEIL);
  const slabs = [];
  for (const it of L.items) {
    if (it.t === 'house' || it.t === 'barn') block(it.x0, it.s0, it.x1, it.s1, it.t === 'barn' ? 9 : it.floors * 3.3 + 1.2);
    else if (it.t === 'station') block(it.x - 3, it.s - 3, it.x + 3, it.s + 3, CEIL);
    else if (it.t === 'stall') block(it.x - 1.4, it.s - 1.6, it.x + 1.4, it.s + 1.6, 2.6);
    else if (it.t === 'fountain' || it.t === 'silo') block(it.x - it.r * 0.9, it.s - it.r * 0.9, it.x + it.r * 0.9, it.s + it.r * 0.9, it.t === 'silo' ? it.h : 0.6);
    else if (it.t === 'pavilion') block(it.x - it.r * 0.8, it.s - it.r * 0.8, it.x + it.r * 0.8, it.s + it.r * 0.8, 0.5, 0);
    else if (it.t === 'tree' && !it.under) block(it.x - 0.3, it.s - 0.3, it.x + 0.3, it.s + 0.3, 4);
    else if (it.t === 'lamp') block(it.x - 0.12, it.s - 0.12, it.x + 0.12, it.s + 0.12, 4.2);
    else if (it.t === 'rack') block(it.x - 0.6, it.s - 2.6, it.x + 0.6, it.s + 2.6, 5.5);
    else if (it.t === 'table') props.push({ kind: 'table', k: 0, x0: it.x - 0.5, z0: it.s - 0.5, x1: it.x + 0.5, z1: it.s + 0.5, y: 0, h: 0.75, face: 0, room: roomOf(L, it.s) });
    else if (it.t === 'bench') {
      const along = it.face === 1 || it.face === 3, [x0, z0, x1, z1] = along ? [it.x - 0.25, it.s - 1.0, it.x + 0.25, it.s + 1.0] : [it.x - 1.0, it.s - 0.25, it.x + 1.0, it.s + 0.25];
      props.push({ kind: 'bench', k: 0, x0, z0, x1, z1, y: 0, h: 0.45, face: it.face, room: roomOf(L, it.s), soft: true });
      const f = [[0, -1], [1, 0], [0, 1], [-1, 0]][it.face], facing = Math.atan2(-f[0], -f[1]);
      anchors.push({ kind: 'bench', pose: 'sit', k: 0, x: it.x, y: 0.45, z: it.s, facing, prop: props.length - 1, slots: 1, room: roomOf(L, it.s), purpose: 'lobby' });
    }
    else if (it.t === 'pond') block(it.x - it.r * 0.75, it.s - it.r * 0.75, it.x + it.r * 0.75, it.s + it.r * 0.75, 0.5);
  }
  if (L.kind === 'town') {
    // the canal: its floor down in the water, a low wall each side, open only where a bridge or a square crosses it
    const over = L.items.filter(i => i.t === 'bridge' || i.t === 'square').map(i => [i.s0, i.s1]).sort((a, b) => a[0] - b[0]);
    let s = 0; const runs = []; for (const [a, b] of over) { if (a > s) runs.push([s, a]); s = Math.max(s, b); } if (s < C) runs.push([s, C]);
    for (const [a, b] of runs) { lineX(24, a, b, 0.8, 0.3); lineX(30, a, b, 0.8, 0.3); }
    for (const it of L.items) if (it.t === 'bridge') { lineS(it.s0, 24, 30, 1.05, 0.12); lineS(it.s1, 24, 30, 1.05, 0.12); }
    slabs.push({ k: 0, y: 0, rects: [[0, 0, 24, C], [30, 0, W, C], ...over.map(([a, b]) => [24, a, 30, b])] }, { k: 0, y: -1.6, rects: [[24, 0, 30, C]] });
  } else slabs.push({ k: 0, y: 0, rects: [[0, 0, W, C]] });
  slabs.push({ k: 0, y: CEIL, roof: true, rects: [[0, 0, W, C]] });
  const plan = { key: 'ring:' + g.key, type: 'ring', w: W, d: C, F: 1, H: CEIL + 2, walls, windows: [], units: [], slabs, ramps: [], rooms: L.rooms.map(r => ({ ...r, k: 0, doors: [] })), props, anchors, solids, doors: [], entrance: -1, ring: g, layout: { W, D: C, deck: 0, ceiling: CEIL, hull: [0, 0, W, C], doors: [], rooms: L.rooms, props, seats: [] } };
  plans.set(g.key, plan); return plan;
}
const roomOf = (L, s) => Math.max(0, Math.min(5, Math.floor(s / (L.C / 6))));

// The people of each ring: some out walking its streets and paths, round and round; some sitting on its benches. Pure in t: where each is at t.
const folks = new Map();
export function ringFolk(g) {
  if (folks.has(g.key)) return folks.get(g.key);
  const L = ringLayout(g), rng = new Rng([g.seed * 31337, g.seed + 99]), out = [], n = g.kind === 'town' ? 170 : g.kind === 'garden' ? 70 : 34;
  const lanes = g.kind === 'town' ? [12.4, 13.2, 19.6, 20.2, 33.8, 34.4, 40.8, 41.6] : g.kind === 'farm' ? [23.6, 30.4] : null;
  for (let i = 0; i < n; i++) out.push({ id: `ring:${g.key}:${i}`, lane: lanes ? rng.pick(lanes) + rng.range(-0.25, 0.25) : rng.range(-0.7, 0.7), s0: rng.range(0, L.C), v: (rng.chance(0.5) ? 1 : -1) * rng.range(0.9, 1.5), age: rng.chance(0.12) ? rng.int(7, 15) : rng.int(18, 80), dwell: rng.range(0, 1) });
  for (const it of L.items) if (it.t === 'bench' && rng.chance(0.45)) out.push({ id: `ring:${g.key}:b${Math.round(it.s)}`, bench: it, age: rng.int(16, 85) });
  folks.set(g.key, out); return out;
}
// → { x, s, dir (+1 along the ring, -1 back), moving, sit? facing? }
export function folkAt(g, f, t) {
  const L = ringLayout(g);
  if (f.bench) { const o = [[0, -1], [1, 0], [0, 1], [-1, 0]][f.bench.face]; return { x: f.bench.x, s: f.bench.s, sit: true, face: f.bench.face, moving: false }; }
  // walk for a while, stop and look about for a bit, walk on
  const cyc = 90, ph = (t / cyc + f.dwell) % 1, walking = ph < 0.86, done = Math.floor(t / cyc + f.dwell) * cyc * 0.86 + Math.min(ph, 0.86) * cyc;
  let s = (f.s0 + f.v * done) % L.C; if (s < 0) s += L.C;
  const x = L.pathAt ? L.pathAt(s) + f.lane : f.lane;
  return { x, s, dir: f.v > 0 ? 1 : -1, moving: walking };
}
