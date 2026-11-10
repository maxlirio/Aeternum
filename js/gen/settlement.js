// Settlement generation: site → plateau → street grid → lots → building records.
// Pure: (planet, region cell) → settlement. Buildings here are records (type, frame,
// size, access); their floor plans are generated lazily by gen/building.js.
//
// Geometry is laid out in a settlement-local frame (u, v) in metres, rotated by the
// settlement's grid angle; roads and buildings are axis-aligned in that frame, which
// keeps every overlap test an exact AABB test.
import { getPolity } from './polity.js';
import { Rng } from '../core/prng.js';
import { hash01, derive } from '../core/hash.js';
import { REGION } from '../core/units.js';
import { globeOf, wellInside } from './globe.js';
import { rawHeight } from './terrain.js';
import { bindSky, townAltitude } from './skyisles.js';
import { siteFit } from './society.js';
import { mainLand } from './land.js';
import { getCity } from './city.js';
import { placeName, personName, companyName, streetWord, streetSuffix } from './names.js';

export const TYPES = {
  office:   { label: 'Administration', w: [16, 24], d: [14, 18], floors: [3, 5], storeyH: 3.4, access: 'hours', hours: [8, 18], roomArea: 30 },
  hab:      { label: 'Habitation block', w: [14, 22], d: [10, 14], floors: [2, 4], storeyH: 3.2, access: 'residents', roomArea: 26 },
  store:    { label: 'Store', w: [10, 16], d: [10, 14], floors: [1, 2], storeyH: 3.6, access: 'hours', hours: [7, 21], roomArea: 60 },
  house:    { label: 'Dwelling', w: [8, 11], d: [9, 11], floors: [1, 2], storeyH: 3.0, access: 'residents', roomArea: 18 },
  workshop: { label: 'Workshop', w: [14, 22], d: [12, 18], floors: [1, 1], storeyH: 5.0, access: 'hours', hours: [6, 16], roomArea: 90 },
  hangar:   { label: 'Hangar', w: [24, 30], d: [20, 26], floors: [1, 1], storeyH: 9.0, access: 'staff', roomArea: 400 },
};
const ROAD_W = { arterial: 12, street: 8 };
const PAD = 22;

function zoneWeights(z) {
  if (z < 0.35) return [['office', 3], ['hab', 3], ['store', 3]];
  if (z < 0.7) return [['hab', 4], ['store', 2], ['house', 2], ['workshop', 1]];
  return [['house', 3], ['workshop', 3], ['hangar', 1.5]];
}

// Does region cell (rx, rz) contain a settlement? Region (0,0) always does (spawn).
// Does this world build out over the sea? Its people's way is stilts, or it's a world of water.
export const waterTowns = planet => !!planet.genome && (['ocean', 'archipelago'].includes(planet.genome.arch) || planet.genome.culture.ways.includes('stilt')) && !planet.genome.noGround;
function regionHasSettlement(planet, rx, rz) {
  if (rx === 0 && rz === 0) return true;
  if (hash01(planet.seed, [rx, rz, 77]) >= 0.35) return false;
  const G = globeOf(planet), x = rx * REGION, z = rz * REGION;     // not astride a seam of the unfolded globe
  return wellInside(G, x, z) && wellInside(G, x + REGION, z) && wellInside(G, x, z + REGION) && wellInside(G, x + REGION, z + REGION);
}

const caches = new WeakMap();    // by planet, so a planet's towns go when it does

export function getSettlement(planet, rx, rz) {
  let cache = caches.get(planet); if (!cache) caches.set(planet, cache = new Map());
  const ck = rx + ',' + rz;
  if (cache.has(ck)) return cache.get(ck);
  cache.set(ck, null);       // (while it's being worked out: anything that asks about this region's ground in the meantime sees no town yet)
  const s = regionHasSettlement(planet, rx, rz) ? generate(planet, rx, rz) : null;
  cache.set(ck, s);
  if (s) getPolity(planet, s);            // seats the local authority (names the civic office's owner)
  return s;
}

// The town a building, person, vehicle or ship belongs to: every key carries its settlement's address.
export function townOfKey(planet, key) { const m = /settlement:(-?\d+),(-?\d+)/.exec(key || ''); return m ? getSettlement(planet, +m[1], +m[2]) : null; }

export function regionOf(x, z) { return [Math.floor(x / REGION), Math.floor(z / REGION)]; }

// The settlement whose graded land could affect (x, z). Sites keep a margin from the
// region edge larger than their influence radius, so only the own region matters.
export function settlementNear(planet, x, z) {
  const [rx, rz] = regionOf(x, z);
  return getSettlement(planet, rx, rz);
}

function flatness(planet, x, z, r) {
  let sum = 0, sum2 = 0, n = 0;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const h = rawHeight(planet, x + i * r / 2, z + j * r / 2); sum += h; sum2 += h * h; n++;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}

function generate(planet, rx, rz) {
  const address = planet.address.child('settlement', rx, rz);
  const seed = address.seed(planet.universeSeed);
  const rng = new Rng(seed);
  const R = rx === 0 && rz === 0 ? 260 : rng.range(150, 300);
  const margin = 700;
  // Site: flattest dry candidate in the cell. (On a world with no ground a town is its own floating deck: anywhere in the cell, at its own height.)
  let best = null;
  if (planet.genome?.noGround) best = { x: rx * REGION + REGION / 2 + rng.range(-300, 300), z: rz * REGION + REGION / 2 + rng.range(-300, 300), h: townAltitude(planet, rx, rz), score: 0 };
  for (let k = 0; k < 28 && !planet.genome?.noGround; k++) {
    const x = rx * REGION + margin + rng.next() * (REGION - 2 * margin);
    const z = rz * REGION + margin + rng.next() * (REGION - 2 * margin);
    const f = flatness(planet, x, z, R);
    if (f.mean < planet.seaLevel + 10) continue;
    // towns grow up where their world's work is: a crystal world's round its crystal fields, a fishing world's on the coast (gen/society.js)
    const fit = planet.genome ? siteFit(planet, mainLand(planet, x, z).kind, rawHeight(planet, x + 900, z) < planet.seaLevel || rawHeight(planet, x - 900, z) < planet.seaLevel || rawHeight(planet, x, z + 900) < planet.seaLevel || rawHeight(planet, x, z - 900) < planet.seaLevel) : 0;
    const score = f.sd + Math.max(0, f.mean - 450) * 0.05 - fit * 9;
    if (!best || score < best.score) best = { x, z, h: f.mean, score };
  }
  // all water: on a sea-going world (its people build on stilts) the town goes out over the water on piles, its deck a few metres above the swell
  if (!best && waterTowns(planet)) best = { x: rx * REGION + REGION / 2 + rng.range(-400, 400), z: rz * REGION + REGION / 2 + rng.range(-400, 400), h: planet.seaLevel + 3.6, score: 0, water: true };
  if (!best) return null;                       // all water: no town in this cell
  { const c = getCity(planet); if (Math.hypot(best.x - c.cx, best.z - c.cz) < c.R + 1200 + R) return null; }   // the megacity has swallowed this ground
  const angle = rng.range(0, Math.PI / 2);
  const s = {
    address, seed, key: address.key, rx, rz, R,
    name: placeName(rng),
    cx: best.x, cz: best.z, h: Math.round(best.h * 10) / 10, onWater: !!best.water,
    angle, cos: Math.cos(angle), sin: Math.sin(angle),
    roads: [], nodes: [], buildings: [], pads: [], outRoads: [],
  };
  s.toWorld = (u, v) => [s.cx + u * s.cos - v * s.sin, s.cz + u * s.sin + v * s.cos];
  s.toLocal = (x, z) => { const dx = x - s.cx, dz = z - s.cz; return [dx * s.cos + dz * s.sin, -dx * s.sin + dz * s.cos]; };
  layoutRoads(s, rng);
  placeLots(s, rng);
  return s;
}

function gridLines(rng, R) {
  const out = [0];
  for (let u = 0; ;) { u += rng.range(46, 74); if (u > R) break; out.push(u); }
  for (let u = 0; ;) { u -= rng.range(46, 74); if (u < -R) break; out.unshift(u); }
  return out;
}

function layoutRoads(s, rng) {
  const us = gridLines(rng, s.R), vs = gridLines(rng, s.R);
  const rim = a => s.R * (0.82 + 0.18 * hash01(s.seed, [Math.floor(a * 3), 91]));
  const id = new Map();
  const nodes = [];
  for (let i = 0; i < us.length; i++) for (let j = 0; j < vs.length; j++) {
    const u = us[i], v = vs[j];
    if (Math.hypot(u, v) > rim(Math.atan2(v, u) + Math.PI)) continue;
    id.set(i + ',' + j, nodes.length); nodes.push({ u, v, i, j });
  }
  const i0 = us.indexOf(0), j0 = vs.indexOf(0);
  let edges = [];
  for (const n of nodes) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const m = id.get((n.i + di) + ',' + (n.j + dj));
      if (m === undefined) continue;
      const arterial = (dj === 0 && n.j === j0) || (di === 0 && n.i === i0);
      edges.push({ a: id.get(n.i + ',' + n.j), b: m, arterial });
    }
  }
  // Thin the grid so blocks vary, without ever disconnecting it.
  const connected = es => {
    const adj = nodes.map(() => []);
    for (const e of es) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
    const used = new Set(); for (const e of es) { used.add(e.a); used.add(e.b); }
    if (!used.size) return true;
    const start = used.values().next().value, seen = new Set([start]), st = [start];
    while (st.length) for (const k of adj[st.pop()]) if (!seen.has(k)) { seen.add(k); st.push(k); }
    for (const k of used) if (!seen.has(k)) return false;
    // also: every node that had an edge originally must keep one
    return true;
  };
  for (const e of rng.shuffle(edges.slice())) {
    if (e.arterial || !rng.chance(0.22)) continue;
    const trial = edges.filter(x => x !== e);
    const deg = n => trial.filter(x => x.a === n || x.b === n).length;
    if (deg(e.a) === 0 || deg(e.b) === 0) continue;
    if (connected(trial)) edges = trial;
  }
  s.nodes = nodes;
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b];
    s.roads.push({ a: [A.u, A.v], b: [B.u, B.v], w: e.arterial ? ROAD_W.arterial : ROAD_W.street, arterial: e.arterial, na: e.a, nb: e.b });
  }
  // The arterial runs out of town both ways, onto ungraded land.
  const art = nodes.filter(n => n.j === j0);
  if (art.length) {
    const lo = art.reduce((p, n) => n.u < p.u ? n : p), hi = art.reduce((p, n) => n.u > p.u ? n : p);
    s.outRoads.push({ a: [hi.u, 0], b: [hi.u + 420, 0], w: ROAD_W.arterial, node: id.get(hi.i + ',' + hi.j) });
    s.outRoads.push({ a: [lo.u, 0], b: [lo.u - 420, 0], w: ROAD_W.arterial, node: id.get(lo.i + ',' + lo.j) });
  }
}

// Road footprint rectangle in local frame (segment ± half-width, ends capped).
export function roadRect(r) {
  const hw = r.w / 2;
  return [Math.min(r.a[0], r.b[0]) - hw, Math.min(r.a[1], r.b[1]) - hw, Math.max(r.a[0], r.b[0]) + hw, Math.max(r.a[1], r.b[1]) + hw];
}
export const rectsOverlap = (A, B, m = 0) => A[0] < B[2] + m && A[2] > B[0] - m && A[1] < B[3] + m && A[3] > B[1] - m;

// Building frame: local x along the frontage (ex), local z inward from the road (ez).
export function lotRect(b) {
  const xs = [b.O[0], b.O[0] + b.ex[0] * b.w + b.ez[0] * b.d], zs = [b.O[1], b.O[1] + b.ex[1] * b.w + b.ez[1] * b.d];
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

function placeLots(s, rng) {
  const roadRects = s.roads.map(roadRect);
  const taken = [];          // rects of buildings + pads
  const fits = (rect, margin) => {
    for (const p of [[rect[0], rect[1]], [rect[2], rect[1]], [rect[0], rect[3]], [rect[2], rect[3]]])
      if (Math.hypot(p[0], p[1]) > s.R - 6) return false;
    for (const rr of roadRects) if (rectsOverlap(rect, rr, 1.0)) return false;
    for (const t of taken) if (rectsOverlap(rect, t, margin)) return false;
    return true;
  };
  let nBuilding = 0, padsWanted = 2 + rng.int(0, 2);
  const roadOrder = rng.shuffle(s.roads.map((_, k) => k));
  for (const ri of roadOrder) {
    const r = s.roads[ri];
    const alongU = r.a[1] === r.b[1];
    const t0 = Math.min(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]);
    const t1 = Math.max(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]);
    const c = alongU ? r.a[1] : r.a[0];
    for (const side of [-1, 1]) {
      // ez points away from the road; ex = (ez.v, -ez.u) keeps the frame right-handed.
      const ez = alongU ? [0, side] : [side, 0];
      const ex = [ez[1], -ez[0]];
      let t = t0 + 7;
      while (t < t1 - 7) {
        const [mu, mv] = alongU ? [t, c] : [c, t];
        const zone = Math.hypot(mu, mv) / s.R;
        let type = rng.weighted(zoneWeights(zone));
        const isPad = padsWanted > 0 && zone > 0.55 && rng.chance(0.25);
        const T = TYPES[type];
        const w = isPad ? PAD : Math.round(rng.range(T.w[0], T.w[1]));
        const d = isPad ? PAD : Math.round(rng.range(T.d[0], T.d[1]));
        if (t + w > t1 - 6) { t += 3; continue; }
        const setback = rng.range(2.5, 5);
        const front = c + side * (r.w / 2 + setback);
        // lot spans [t, t+w] along the road; origin is the corner where local x = 0
        const oAlong = (alongU ? ex[0] : ex[1]) > 0 ? t : t + w;
        const O = alongU ? [oAlong, front] : [front, oAlong];
        const rec = { O, ex, ez, w, d, road: ri };
        const rect = lotRect(rec);
        if (!fits(rect, 3)) { t += 3; continue; }
        taken.push(rect);
        if (isPad) {
          padsWanted--;
          s.pads.push({ ...rec, n: s.pads.length, rect });
        } else {
          const n = nBuilding++;
          const floors = rng.int(T.floors[0], T.floors[1]);
          const corp = rng.chance(type === 'house' || type === 'hab' ? 0.15 : 0.8);
          s.buildings.push({
            ...rec, n, type, rect, floors, storeyH: T.storeyH,
            key: s.address.child('building', n).key,
            access: T.access, hours: T.hours || null,
            owner: corp ? companyName(rng) : personName(rng),
          });
        }
        t += w + rng.range(2.5, 7);
      }
    }
  }
}

// Street names and house numbers. Every road segment on the same grid line shares a
// name; numbers run along the line, odd on one side, even on the other. Uses its own
// derived seed so adding it changed nothing else in the town.
export function address(s, b) {
  if (!s.streetNames) {
    s.streetNames = new Map();
    for (const r of s.roads) {
      const alongU = r.a[1] === r.b[1], line = (alongU ? 'u' : 'v') + (alongU ? r.a[1] : r.a[0]).toFixed(1);
      if (!s.streetNames.has(line)) {
        const rng = new Rng(derive(s.seed, 'street', [s.streetNames.size]));
        s.streetNames.set(line, r.arterial ? `${streetWord(rng)} ${rng.pick(['Boulevard', 'Concourse', 'Parade'])}` : `${streetWord(rng)} ${streetSuffix(rng)}`);
      }
    }
  }
  const r = s.roads[b.road], alongU = r.a[1] === r.b[1];
  const line = (alongU ? 'u' : 'v') + (alongU ? r.a[1] : r.a[0]).toFixed(1);
  const along = alongU ? (b.rect[0] + b.rect[2]) / 2 : (b.rect[1] + b.rect[3]) / 2;
  const side = (alongU ? b.O[1] - r.a[1] : b.O[0] - r.a[0]) > 0 ? 1 : 0;
  const n = 2 * Math.max(0, Math.round((along + s.R + 20) / 9)) + side + 1;
  return `${n} ${s.streetNames.get(line)}`;
}
import { getCity as _gc } from './city.js';
bindSky(getSettlement, regionOf, p => _gc(p));
import { bindWaterTowns } from './terrain.js';
bindWaterTowns((p, x, z) => settlementNear(p, x, z));
