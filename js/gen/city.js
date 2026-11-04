// The megacity: a planet-scale city (kilometres across, spires approaching a kilometre)
// generated block by block on demand. Pure: (planet) → city frame + district field, and
// (city, i, j) → one block's buildings and street furniture. Nothing is stored.
//
// Frame: like a settlement, a city-local (u, v) grid rotated by the city's angle; every
// street, block, building tier and prop is axis-aligned in it, so collision is AABB.
// The street grid is a jittered lattice: line i sits near i·PITCH, so the block holding
// any point is found in O(1). Lines carry a hierarchy: boulevards, avenues, streets.
//
// Districts (each block gets one): spire (the core and sub-cores: towers to ~900 m on
// podiums, skybridges), commerce (office towers and slabs), housing (perimeter blocks of
// hab slabs round a courtyard, some point towers), market (covered halls and stall
// streets with shophouses), undercity (the lowlife: a dense warren of small stacked
// buildings and alleys), industry (sheds, tanks, stacks), port (landing pads round a
// terminal), park (plazas and trees).
import { Rng } from '../core/prng.js';
import { hash01, derive } from '../core/hash.js';
import { Simplex2, clamp, smoothstep } from '../core/noise.js';
import { rawHeight } from './terrain.js';
import { placeName } from './names.js';

export const PITCH = 150;                  // street-line spacing (m)
export const FALL = 700;                   // graded falloff beyond the rim (m)
export const CURB = 0.18;                  // sidewalk kerb height
export const DISTRICTS = ['spire', 'commerce', 'housing', 'market', 'undercity', 'industry', 'port', 'park'];
export const DISTRICT_LABEL = { spire: 'Spire core', commerce: 'Commercial district', housing: 'Residential blocks', market: 'Market quarter',
  undercity: 'The Warrens', industry: 'Foundry district', port: 'Skyport', park: 'Gardens' };

// facade styles (the renderer's shader reads the index): [name, floor height, bay width]
export const STYLES = [
  ['glass', 4.2, 1.6], ['ribbon', 3.9, 3.2], ['grid', 3.6, 2.4], ['hab', 3.0, 3.4], ['brick', 3.2, 2.6],
  ['grime', 3.0, 2.2], ['shed', 6.0, 8.0], ['podium', 5.0, 6.0], ['terminal', 6.5, 4.0], ['paving', 1, 1],
  ['bronze', 4.4, 2.0], ['white', 4.0, 2.8], ['garden', 1, 1],
];
export const STYLE = Object.fromEntries(STYLES.map((s, i) => [s[0], i]));

const r1 = v => Math.round(v * 10) / 10;
const cache = new WeakMap();

// The homeworld's megacity: a site 6–10 km from the home town, chosen for the flattest
// broad ground on dry land (the whole city stands on one graded level).
export function getCity(planet) {
  if (cache.has(planet)) return cache.get(planet).city;
  const address = planet.address.child('city', 0, 0), seed = address.seed(planet.universeSeed), rng = new Rng(seed);
  const R = r1(rng.range(3600, 4400));
  let best = null;
  for (let k = 0; k < 40; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(7600, 10500) + R * 0.35;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    let sum = 0, sum2 = 0, n = 0, wet = 0;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const h = rawHeight(planet, x + i * R / 3, z + j * R / 3); sum += h; sum2 += h * h; n++; if (h < planet.seaLevel + 4) wet++;
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const score = sd + wet * 25 + Math.max(0, mean - 400) * 0.1;
    if (!best || score < best.score) best = { x, z, mean, score };
  }
  const angle = rng.range(0, Math.PI / 2);
  const c = {
    address, seed, key: address.key, R, name: placeName(rng) + ' Prime',
    cx: r1(best.x), cz: r1(best.z), h: r1(Math.max(planet.seaLevel + 12, best.mean)),
    angle, cos: Math.cos(angle), sin: Math.sin(angle),
    portAngle: rng.range(0, Math.PI * 2), industryAngle: 0, cores: [],
  };
  c.industryAngle = c.portAngle + rng.range(1.6, 2.6);
  for (let k = 0; k < 4; k++) { const a = c.portAngle + 0.9 + k * 1.45 + rng.range(-0.3, 0.3), d = R * rng.range(0.38, 0.62); c.cores.push([Math.cos(a) * d, Math.sin(a) * d, rng.range(0.55, 0.85)]); }
  c.toWorld = (u, v) => [c.cx + u * c.cos - v * c.sin, c.cz + u * c.sin + v * c.cos];
  c.toLocal = (x, z) => { const dx = x - c.cx, dz = z - c.cz; return [dx * c.cos + dz * c.sin, -dx * c.sin + dz * c.cos]; };
  c.noise = { a: new Simplex2(derive(seed, 'districts-a')), b: new Simplex2(derive(seed, 'districts-b')), rim: new Simplex2(derive(seed, 'rim')) };
  cache.set(planet, { city: c, blocks: new Map() });
  return c;
}
const cacheMap = new WeakMap();
function cacheFor(city) { let m = cacheMap.get(city); if (!m) cacheMap.set(city, m = new Map()); return m; }

// The rim: the city's edge wanders (0.82–1.0 R) so it isn't a circle.
export function rimAt(city, ang) { return city.R * (0.86 + 0.14 * city.noise.rim.fbm(Math.cos(ang) * 1.3 + 4, Math.sin(ang) * 1.3 - 2, 3)); }

// How much (x, z) is graded into the city ground (1 inside, falling to 0 beyond the rim).
export function cityWeight(city, x, z) {
  const dx = x - city.cx, dz = z - city.cz, r = Math.hypot(dx, dz);
  if (r > city.R + FALL) return 0;
  const [u, v] = city.toLocal(x, z), rim = rimAt(city, Math.atan2(v, u));
  return 1 - smoothstep(rim + 40, rim + FALL, r);
}
export function inCity(city, u, v, m = 0) { return Math.hypot(u, v) + m < rimAt(city, Math.atan2(v, u)); }

// ---- the street lattice
const LINE_W = { boulevard: 46, avenue: 28, street: 17 };
export function lineKind(i) { return i % 6 === 0 ? 'boulevard' : i % 2 === 0 ? 'avenue' : 'street'; }
export function lineAt(city, axis, i) { return i * PITCH + (lineKind(i) === 'boulevard' ? 0 : (hash01(city.seed, [axis, i, 5]) - 0.5) * 34); }
export function lineWidth(i) { return LINE_W[lineKind(i)]; }
export function blockIndex(city, u, v) {
  const f = (axis, x) => { let i = Math.floor(x / PITCH); while (lineAt(city, axis, i) > x) i--; while (lineAt(city, axis, i + 1) <= x) i++; return i; };
  return [f(0, u), f(1, v)];
}
// The block between lines i, i+1 (u) and j, j+1 (v): its kerb rect.
export function blockRect(city, i, j) {
  return [lineAt(city, 0, i) + lineWidth(i) / 2, lineAt(city, 1, j) + lineWidth(j) / 2, lineAt(city, 0, i + 1) - lineWidth(i + 1) / 2, lineAt(city, 1, j + 1) - lineWidth(j + 1) / 2];
}
export function blockExists(city, i, j) {
  const r = blockRect(city, i, j), cu = (r[0] + r[2]) / 2, cv = (r[1] + r[3]) / 2;
  return inCity(city, cu, cv, 60);
}

// ---- districts
const angDist = (a, b) => { const d = Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d; };
// How tall the city wants to be at (u, v): 1 at the core, peaks at the sub-cores.
export function heightField(city, u, v) {
  const rn = Math.hypot(u, v) / city.R;
  let f = Math.exp(-((rn / 0.17) ** 2));
  for (const [cu, cv, w] of city.cores) f = Math.max(f, w * Math.exp(-((Math.hypot(u - cu, v - cv) / (city.R * 0.075)) ** 2)));
  return f;
}
export function districtAt(city, u, v, i, j) {
  const rn = Math.hypot(u, v) / city.R, ang = Math.atan2(v, u), hf = heightField(city, u, v);
  const h = hash01(city.seed, [i, j, 11]);
  if (rn > 0.7 && angDist(ang, city.portAngle) < 0.22) return 'port';
  if (hf > 0.42) return h < 0.05 ? 'park' : 'spire';
  if (rn > 0.5 && angDist(ang, city.industryAngle) < 0.42) return h < 0.18 ? 'undercity' : 'industry';
  if (h < 0.035) return 'park';
  const na = city.noise.a.fbm(u / 900, v / 900, 3), nb = city.noise.b.fbm(u / 650 + 7, v / 650 - 3, 3);
  if (na > 0.34 && rn < 0.85) return 'market';
  if (nb > 0.28 || rn > 0.9 && nb > -0.1) return 'undercity';
  if (hf > 0.16 || rn < 0.34) return 'commerce';
  return 'housing';
}

// ---- blocks
// A block: { i, j, rect, district, buildings: [{ id, style, tiers:[{ r:[u0,v0,u1,v1], y0, y1 }], crown?, label }],
//            props: [{ k, u, v, y, rot, s? }], pads: [...], bridges: [{ r, y0, y1 }] }
// Building heights are metres above the city ground (city.h + CURB).
export function cityBlock(city, i, j) {
  const m = cacheFor(city), key = i + ',' + j;
  let b = m.get(key);
  if (b) return b;
  if (m.size > 5000) m.clear();
  b = makeBlock(city, i, j); m.set(key, b);
  return b;
}

function makeBlock(city, i, j) {
  const rect = blockRect(city, i, j), rng = new Rng(derive(city.seed, 'block', [i, j]));
  const cu = (rect[0] + rect[2]) / 2, cv = (rect[1] + rect[3]) / 2;
  const exists = inCity(city, cu, cv, 60);
  const district = exists ? districtAt(city, cu, cv, i, j) : null;
  const B = { i, j, rect, district, buildings: [], props: [], pads: [], bridges: [], ground: district === 'park' ? 'garden' : 'paving' };
  if (!exists) return B;
  const ctx = { city, rng, B, hf: heightField(city, cu, cv), n: 0 };
  const inner = inset(rect, 2.6);                       // the sidewalk ring stays clear for walking
  BUILD[district](ctx, inner);
  dressSidewalk(ctx, rect, inner);
  return B;
}
const inset = (r, m) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];
const W = r => r[2] - r[0], D = r => r[3] - r[1];
function add(ctx, style, tiers, extra = {}) {
  const b = { id: `${ctx.B.i},${ctx.B.j}:${ctx.n++}`, style: STYLE[style], tiers: tiers.map(t => ({ r: t.r.map(r1), y0: r1(t.y0), y1: r1(t.y1) })), ...extra };
  ctx.B.buildings.push(b); return b;
}
const prop = (ctx, k, u, v, y = 0, rot = 0, s = 1) => ctx.B.props.push({ k, u: r1(u), v: r1(v), y: r1(y), rot, s });
// split a rect along its longer side into n parts with gaps
function split(rng, r, n, gap) {
  const alongU = W(r) >= D(r), L = alongU ? W(r) : D(r), cuts = [0];
  for (let k = 1; k < n; k++) cuts.push(k / n + (rng.next() - 0.5) * 0.35 / n);
  cuts.push(1);
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = cuts[k] * L + (k ? gap / 2 : 0), b = cuts[k + 1] * L - (k < n - 1 ? gap / 2 : 0);
    out.push(alongU ? [r[0] + a, r[1], r[0] + b, r[3]] : [r[0], r[1] + a, r[2], r[1] + b]);
  }
  return out;
}
// a tower: tiers stepping in as they rise
function tower(ctx, foot, base, height, style, nTiers) {
  const { rng } = ctx, tiers = [];
  let r = foot.slice(), y = base;
  for (let k = 0; k < nTiers; k++) {
    const last = k === nTiers - 1, th = last ? height - (y - base) : (height - (y - base)) * rng.range(0.3, 0.55);
    if (th < 6) break;
    tiers.push({ r: r.slice(), y0: y, y1: y + th }); y += th;
    const step = Math.min(W(r), D(r)) * rng.range(0.08, 0.18);
    if (Math.min(W(r), D(r)) - 2 * step < 10) break;
    r = rng.chance(0.25) ? [r[0] + step * 2, r[1], r[2], r[3] - step * 2] : inset(r, step);
  }
  return tiers;
}
const CROWNS = ['spire', 'ring', 'pyramid', 'dome', 'antenna', 'pad', 'crown', 'blade'];

const BUILD = {
  spire(ctx, r) {
    const { rng, hf } = ctx;
    const podH = rng.range(16, 40);
    add(ctx, 'podium', [{ r, y0: 0, y1: podH }], { label: 'podium' });
    const n = W(r) > 95 && D(r) > 95 && rng.chance(0.55) ? 2 : 1;
    const feet = n === 1 ? [inset(r, rng.range(10, 22))] : split(rng, inset(r, 8), 2, 16);
    for (const f of feet) {
      const s = Math.min(W(f), D(f));
      const foot = s > 70 ? inset(f, (s - rng.range(44, 70)) / 2) : f;
      const H = clamp(hf * rng.range(560, 920) + rng.range(-60, 60), 140, 960) * (n === 2 ? rng.range(0.55, 0.85) : 1);
      const b = add(ctx, rng.pick(['glass', 'glass', 'bronze', 'white', 'ribbon']), tower(ctx, foot, podH, H, 'glass', rng.int(3, 6)),
        { crown: rng.pick(CROWNS), label: 'spire' });
      b.top = r1(b.tiers.at(-1).y1);
      // landing pads cantilevered off the shaft every couple of hundred metres
      for (let y = podH + 120 + rng.range(0, 80); y < b.top - 60; y += rng.range(140, 260)) {
        const t = b.tiers.find(t => t.y0 <= y && t.y1 >= y + 3); if (!t) continue;
        const side = rng.int(0, 3), [a0, b0, a1, b1] = t.r, L = 22;
        const pr = side === 0 ? [a1, (b0 + b1) / 2 - 11, a1 + L, (b0 + b1) / 2 + 11] : side === 1 ? [a0 - L, (b0 + b1) / 2 - 11, a0, (b0 + b1) / 2 + 11]
          : side === 2 ? [(a0 + a1) / 2 - 11, b1, (a0 + a1) / 2 + 11, b1 + L] : [(a0 + a1) / 2 - 11, b0 - L, (a0 + a1) / 2 + 11, b0];
        ctx.B.pads.push({ r: pr.map(r1), y: r1(y), side, b: b.id });
      }
    }
    roofClutter(ctx, ctx.B.buildings[0], 0.25);
  },
  commerce(ctx, r) {
    const { rng, hf } = ctx;
    const lots = split(rng, r, W(r) * D(r) > 9000 ? rng.int(2, 4) : rng.int(1, 2), rng.range(6, 14));
    for (const lot of lots) {
      const s = Math.min(W(lot), D(lot));
      const H = clamp((hf * 2.2 + 0.25) * rng.range(70, 260), 30, 340);
      const slab = rng.chance(0.4);
      const foot = slab ? lot : s > 50 ? inset(lot, (s - rng.range(30, 48)) / 2) : lot;
      const style = rng.pick(['glass', 'ribbon', 'grid', 'grid', 'bronze', 'white']);
      const tiers = rng.chance(0.4) ? [{ r: lot, y0: 0, y1: rng.range(8, 16) }, ...tower(ctx, inset(foot, 2), 0, H, style, rng.int(1, 3)).map(t => ({ ...t, y0: Math.max(t.y0, 0) }))] : tower(ctx, foot, 0, H, style, rng.int(1, 3));
      const b = add(ctx, style, tiers, { crown: rng.chance(0.4) ? rng.pick(CROWNS) : null, label: 'offices' });
      b.top = r1(Math.max(...b.tiers.map(t => t.y1)));
      roofClutter(ctx, b, 0.6);
      if (rng.chance(0.5)) shopfronts(ctx, lot, 'commerce');
    }
  },
  housing(ctx, r) {
    const { rng } = ctx;
    const dep = rng.range(13, 18), H = rng.range(28, 95);
    const style = rng.pick(['hab', 'hab', 'brick', 'grid', 'white']);
    const ring = [[r[0], r[1], r[2], r[1] + dep], [r[0], r[3] - dep, r[2], r[3]], [r[0], r[1] + dep + 4, r[0] + dep, r[3] - dep - 4], [r[2] - dep, r[1] + dep + 4, r[2], r[3] - dep - 4]];
    ring.forEach((f, k) => {
      if (k >= 2 && rng.chance(0.2)) return;                           // an open side: the courtyard opens to the street
      const h = H * rng.range(0.8, 1.15);
      const b = add(ctx, style, rng.chance(0.3) ? [{ r: f, y0: 0, y1: h * 0.6 }, { r: inset(f, 2), y0: h * 0.6, y1: h }] : [{ r: f, y0: 0, y1: h }], { label: 'hab block', balconies: rng.chance(0.65) });
      b.top = r1(h); roofClutter(ctx, b, 0.9);
    });
    const yard = inset([r[0] + dep, r[1] + dep, r[2] - dep, r[3] - dep], 3);
    if (W(yard) > 30 && D(yard) > 30 && rng.chance(0.3)) {     // a point tower in the yard
      const s = rng.range(20, 26), cu = (yard[0] + yard[2]) / 2, cv = (yard[1] + yard[3]) / 2;
      const b = add(ctx, style, [{ r: [cu - s / 2, cv - s / 2, cu + s / 2, cv + s / 2], y0: 0, y1: rng.range(110, 170) }], { label: 'hab tower', balconies: true });
      b.top = b.tiers[0].y1; roofClutter(ctx, b, 1);
    } else if (W(yard) > 8 && D(yard) > 8) {
      for (let k = 0; k < 6; k++) prop(ctx, rng.pick(['tree', 'tree', 'bench', 'planter', 'play', 'washline']), rng.range(yard[0] + 2, yard[2] - 2), rng.range(yard[1] + 2, yard[3] - 2), 0, rng.int(0, 3) * Math.PI / 2);
    }
  },
  market(ctx, r) {
    const { rng } = ctx;
    if (rng.chance(0.3)) {             // a covered market hall
      const b = add(ctx, 'terminal', [{ r: inset(r, 4), y0: 0, y1: rng.range(12, 18) }], { label: 'market hall', crown: 'vault' });
      b.top = b.tiers[0].y1; b.hall = true;
      shopfronts(ctx, inset(r, 4), 'market');
      return;
    }
    // shophouses round the edge (2–4 storeys), stall streets through the middle
    const dep = rng.range(9, 12);
    for (const f of [[r[0], r[1], r[2], r[1] + dep], [r[0], r[3] - dep, r[2], r[3]]]) {
      for (const lot of split(rng, f, Math.max(2, Math.round(W(f) / rng.range(9, 14))), 0)) {
        const h = rng.int(2, 4) * 3.4;
        const b = add(ctx, rng.pick(['brick', 'grime', 'hab', 'brick']), [{ r: lot, y0: 0, y1: h }], { label: 'shophouse', awning: true });
        b.top = h; roofClutter(ctx, b, 0.7);
      }
      shopfronts(ctx, f, 'market');
    }
    const lane = [r[0] + 3, r[1] + dep + 3, r[2] - 3, r[3] - dep - 3];
    const rows = Math.max(1, Math.floor(D(lane) / 9));
    for (let k = 0; k < rows; k++) {
      const v = lane[1] + (k + 0.5) * D(lane) / rows;
      for (let u = lane[0] + 2; u < lane[2] - 2; u += rng.range(3.6, 5)) {
        prop(ctx, rng.pick(STALLS), u, v - 1.6, 0, 0); prop(ctx, rng.pick(STALLS), u, v + 1.6, 0, Math.PI);
        if (rng.chance(0.35)) prop(ctx, rng.pick(MARKET_BITS), u + 1.2, v - 0.2, 0, rng.range(0, 6.28));
      }
      for (let u = lane[0] + 4; u < lane[2] - 4; u += 7) prop(ctx, 'lanternline', u, v, 4.2, 0);
    }
  },
  undercity(ctx, r) {
    const { rng, hf } = ctx;
    // a warren: recursive splits with alleys, small buildings stacked and overhung
    const cells = []; const cut = (q, depth) => {
      if ((W(q) < 22 && D(q) < 22) || depth > 6) { cells.push(q); return; }
      const alongU = W(q) > D(q), gap = depth < 2 ? rng.range(4, 6) : rng.chance(0.5) ? rng.range(2.4, 3.4) : 0;
      const f = rng.range(0.35, 0.65), L = alongU ? W(q) : D(q), a = L * f;
      if (alongU) { cut([q[0], q[1], q[0] + a - gap / 2, q[3]], depth + 1); cut([q[0] + a + gap / 2, q[1], q[2], q[3]], depth + 1); }
      else { cut([q[0], q[1], q[2], q[1] + a - gap / 2], depth + 1); cut([q[0], q[1] + a + gap / 2, q[2], q[3]], depth + 1); }
    };
    cut(r, 0);
    const tall = 8 + hf * 60, upper = [];
    const ov = (a, b) => a[0] < b[2] - 0.01 && a[2] > b[0] + 0.01 && a[1] < b[3] - 0.01 && a[3] > b[1] + 0.01;
    // an overhang may reach over an alley, never into a neighbour's footprint or another overhang
    const fits = (q, r2, y0, y1) => !cells.some(o => o !== q && ov(o, r2)) && !upper.some(u => ov(u.r, r2) && u.y0 < y1 && y0 < u.y1);
    for (const q of cells) {
      if (W(q) < 4 || D(q) < 4) continue;
      if (rng.chance(0.07)) { yardJunk(ctx, q); continue; }
      const h0 = rng.range(6, 9 + tall * 0.6);
      const tiers = [{ r: q, y0: 0, y1: h0 }];
      if (rng.chance(0.55)) {                                     // stacked on top, often overhanging the alley
        const o = rng.range(-1.6, 1.6), q2 = rng.chance(0.5) ? [q[0] + o, q[1], q[2] + o, q[3] - rng.range(0, 3)] : [q[0], q[1] + o, q[2] - rng.range(0, 3), q[3] + o];
        const y1 = h0 + rng.range(3, 9 + tall * 0.3), r2 = fits(q, q2, h0, y1) ? q2 : [Math.max(q[0], q2[0]), Math.max(q[1], q2[1]), Math.min(q[2], q2[2]), Math.min(q[3], q2[3])];
        tiers.push({ r: r2, y0: h0, y1 }); upper.push(tiers[1]);
        if (rng.chance(0.3) && W(r2) > 5 && D(r2) > 5) tiers.push({ r: inset(r2, rng.range(0.5, 2)), y0: tiers[1].y1, y1: tiers[1].y1 + rng.range(2.6, 6) });
      }
      const b = add(ctx, rng.pick(['grime', 'grime', 'brick', 'hab']), tiers, { label: rng.pick(['tenement', 'flophouse', 'den', 'cantina', 'pawnshop', 'workshop', 'noodle bar', 'chop shop']), neon: rng.chance(0.6) });
      b.top = r1(Math.max(...tiers.map(t => t.y1)));
      roofClutter(ctx, b, 1);
      if (b.neon) { const side = rng.int(0, 3), [a0, b0, a1, b1] = q, y = rng.range(3, Math.min(9, h0 - 1));
        const at = side === 0 ? [a0 - 0.3, (b0 + b1) / 2] : side === 1 ? [a1 + 0.3, (b0 + b1) / 2] : side === 2 ? [(a0 + a1) / 2, b0 - 0.3] : [(a0 + a1) / 2, b1 + 0.3];
        prop(ctx, rng.pick(NEONS), at[0], at[1], y, [-Math.PI / 2, Math.PI / 2, Math.PI, 0][side]); }
      // pipes and cables crossing the alleys
      if (rng.chance(0.4)) prop(ctx, rng.pick(['pipes', 'cables', 'pipes2', 'cables']), (q[0] + q[2]) / 2, q[3] + 1.4, rng.range(4, h0), Math.PI / 2);
    }
  },
  industry(ctx, r) {
    const { rng } = ctx;
    for (const lot of split(rng, r, rng.int(1, 3), rng.range(8, 14))) {
      if (rng.chance(0.3)) {            // a tank farm
        for (let u = lot[0] + 8; u < lot[2] - 8; u += 16) for (let v = lot[1] + 8; v < lot[3] - 8; v += 16) prop(ctx, rng.pick(['tank', 'tank', 'silo', 'sphere']), u, v, 0, 0, rng.range(0.8, 1.2));
        continue;
      }
      const h = rng.range(10, 24);
      const b = add(ctx, 'shed', [{ r: inset(lot, 2), y0: 0, y1: h }], { label: rng.pick(['foundry', 'fabrication works', 'reclamation plant', 'warehouse', 'power station']) });
      b.top = h; roofClutter(ctx, b, 1);
      if (rng.chance(0.6)) prop(ctx, 'stack', lot[0] + 6, lot[1] + 6, h, 0, rng.range(1, 2.4));
      if (rng.chance(0.4)) prop(ctx, 'crane', lot[2] - 8, (lot[1] + lot[3]) / 2, 0, 0, rng.range(0.9, 1.3));
      for (let k = 0; k < 4; k++) prop(ctx, rng.pick(['container', 'container', 'pallet', 'drums', 'forklift']), rng.range(lot[0] + 2, lot[2] - 2), lot[3] + 1.4, 0, Math.PI / 2 * rng.int(0, 1));
    }
  },
  port(ctx, r) {
    const { rng } = ctx;
    const n = Math.max(1, Math.floor(W(r) / 48)), m = Math.max(1, Math.floor(D(r) / 48));
    let term = false;
    for (let a = 0; a < n; a++) for (let c = 0; c < m; c++) {
      const cell = [r[0] + a * W(r) / n + 4, r[1] + c * D(r) / m + 4, r[0] + (a + 1) * W(r) / n - 4, r[1] + (c + 1) * D(r) / m - 4];
      if (!term && rng.chance(0.3)) { term = true; const b = add(ctx, 'terminal', [{ r: cell, y0: 0, y1: 14 }, { r: inset(cell, 8), y0: 14, y1: 22 }], { label: 'terminal' }); b.top = 22;
        if (rng.chance(0.5)) add(ctx, 'glass', [{ r: inset(cell, 14), y0: 22, y1: 64 }], { label: 'control tower', crown: 'ring' }); continue; }
      ctx.B.pads.push({ r: inset(cell, 2).map(r1), y: 1.6, ground: true });
      prop(ctx, 'padlights', (cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2, 1.6);
      prop(ctx, rng.pick(['fuelcart', 'cargoloader', 'container']), cell[2] - 3, cell[3] - 3, 1.6, rng.range(0, 6.28));
    }
  },
  park(ctx, r) {
    const { rng } = ctx;
    ctx.B.ground = 'garden';
    const cu = (r[0] + r[2]) / 2, cv = (r[1] + r[3]) / 2;
    prop(ctx, rng.pick(['fountain', 'monument', 'statue', 'fountain']), cu, cv, 0, 0, rng.range(1, 1.6));
    for (let k = 0; k < 26; k++) {
      const u = rng.range(r[0] + 4, r[2] - 4), v = rng.range(r[1] + 4, r[3] - 4);
      if (Math.abs(u - cu) < 9 && Math.abs(v - cv) < 9) continue;
      prop(ctx, rng.chance(0.7) ? 'tree' : rng.pick(['bench', 'lamp_park', 'planter', 'kiosk']), u, v, 0, rng.int(0, 3) * Math.PI / 2, rng.range(0.8, 1.4));
    }
  },
};
const STALLS = ['stall_canopy', 'stall_umbrella', 'stall_cart', 'stall_tent', 'stall_crate', 'stall_noodle', 'stall_fish', 'stall_cloth', 'stall_tech', 'stall_fruit', 'stall_spice', 'stall_grill'];
const MARKET_BITS = ['sacks', 'baskets', 'crates_fruit', 'barrels', 'pots', 'rugs', 'cage', 'stool', 'scale', 'handcart'];
const NEONS = ['neon_bar', 'neon_noodle', 'neon_eye', 'neon_arrow', 'neon_ring', 'neon_vert', 'neon_cross', 'neon_star', 'neon_fish', 'neon_glyph'];
const ROOF = ['ac', 'ac2', 'tank_roof', 'antenna', 'dish', 'vent', 'solar', 'cooling', 'billboard', 'aerial', 'skylight', 'beacon'];
function roofClutter(ctx, b, p) {
  const { rng } = ctx, top = b.tiers.at(-1);
  if (!top || W(top.r) < 4 || D(top.r) < 4) return;
  const n = Math.round(rng.range(0, 4) * p * Math.min(3, W(top.r) * D(top.r) / 300));
  for (let k = 0; k < n; k++) prop(ctx, rng.pick(ROOF), rng.range(top.r[0] + 1.5, top.r[2] - 1.5), rng.range(top.r[1] + 1.5, top.r[3] - 1.5), top.y1, rng.int(0, 3) * Math.PI / 2, rng.range(0.8, 1.3));
}
function yardJunk(ctx, q) {
  const { rng } = ctx;
  for (let k = 0; k < 5; k++) prop(ctx, rng.pick(['dumpster', 'trashpile', 'shack', 'firebarrel', 'mattress', 'boxes', 'scrapheap', 'leanto', 'hulk']), rng.range(q[0] + 1, q[2] - 1), rng.range(q[1] + 1, q[3] - 1), 0, rng.range(0, 6.28));
}
// signs and awnings along a frontage
function shopfronts(ctx, f, kind) {
  const { rng } = ctx;
  const signs = kind === 'market' ? ['sign_market', 'awning', 'awning2', 'lanterns'] : ['sign_shop', 'holo_ad', 'awning', 'sign_blade'];
  for (let u = f[0] + 3; u < f[2] - 3; u += rng.range(7, 12)) {
    prop(ctx, rng.pick(signs), u, f[1] - 0.4, rng.range(3.4, 5), Math.PI);
    prop(ctx, rng.pick(signs), u, f[3] + 0.4, rng.range(3.4, 5), 0);
  }
}
// street furniture on the sidewalk ring: lamps on a rhythm, then the clutter of the district
const SIDEWALK = {
  spire: ['bench_lux', 'planter_lux', 'holo_post', 'bollard', 'kiosk_lux', 'bin_lux', 'tree_lux'],
  commerce: ['bench', 'bin', 'vending', 'vending2', 'terminal_post', 'planter', 'bollard', 'newsstand', 'shelter', 'kiosk', 'atm', 'bikerack'],
  housing: ['bench', 'bin', 'planter', 'tree', 'mailbox', 'bikerack', 'hydrant', 'shelter', 'bollard'],
  market: ['crates_fruit', 'sacks', 'handcart', 'foodcart', 'foodcart2', 'stool', 'barrels', 'vending', 'lanterns_post'],
  undercity: ['dumpster', 'bin_rusty', 'trashpile', 'boxes', 'firebarrel', 'vending_old', 'junction', 'steamvent', 'barrier', 'hydrant'],
  industry: ['barrier', 'drums', 'pallet', 'junction', 'bollard', 'hydrant', 'container'],
  port: ['barrier', 'bollard', 'terminal_post', 'fuelcart'],
  park: ['bench', 'bin', 'lamp_park'],
};
const LAMPS = { spire: 'lamp_lux', commerce: 'lamp_cobra', housing: 'lamp_double', market: 'lamp_lantern', undercity: 'lamp_neon', industry: 'lamp_flood', port: 'lamp_flood', park: 'lamp_park' };
function dressSidewalk(ctx, rect, inner) {
  const { rng, B } = ctx, d = B.district, kit = SIDEWALK[d], lamp = LAMPS[d];
  const edges = [[rect[0], rect[1] + 0.7, rect[2], rect[1] + 0.7, 0], [rect[0], rect[3] - 0.7, rect[2], rect[3] - 0.7, Math.PI], [rect[0] + 0.7, rect[1], rect[0] + 0.7, rect[3], Math.PI / 2], [rect[2] - 0.7, rect[1], rect[2] - 0.7, rect[3], -Math.PI / 2]];
  for (const [u0, v0, u1, v1, rot] of edges) {
    const L = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / L, dv = (v1 - v0) / L;
    for (let a = 6; a < L - 6; a += 24) prop(ctx, lamp, u0 + du * a, v0 + dv * a, 0, rot);
    for (let a = 10; a < L - 8; a += rng.range(5, 16)) {
      if (Math.abs((a - 6) % 24) < 2) continue;
      const k = rng.pick(kit);
      const off = ['tree', 'tree_lux', 'planter', 'planter_lux', 'bollard', 'hydrant'].includes(k) ? 0 : 0.9;
      prop(ctx, k, u0 + du * a + (dv ? (rot > 0 ? off : -off) : 0) * 0, v0 + dv * a + (du ? (rot === 0 ? off : -off) : 0), 0, rot);
    }
  }
}

// ---- skybridges: enclosed decks from a tower to the next block's tower, across the street.
// A block owns the bridges it sends toward +u and +v; a bridge never passes through any
// other building. → [{ r: [u0, v0, u1, v1], y (deck, above city ground), a, b (building ids), axis }]
const tall = B => B.buildings.filter(b => (b.top || 0) > 70 && !b.hall);
export function bridgesOf(city, B) {
  if (B.bridgesDone) return B.bridges;
  B.bridgesDone = true;
  if (!B.district || !['spire', 'commerce'].includes(B.district)) return B.bridges;
  for (const [di, dj, axis] of [[1, 0, 0], [0, 1, 1]]) {
    const N = cityBlock(city, B.i + di, B.j + dj);
    if (!N.district || !['spire', 'commerce'].includes(N.district)) continue;
    let made = 0;
    for (const A of tall(B)) for (const Z of tall(N)) {
      if (made >= 2) break;
      const h = hash01(city.seed, [B.i, B.j, di, A.tiers.length, Z.tiers.length, 61]);
      if (h > 0.55) continue;
      // candidate heights, from the top of the lower podium up
      for (let k = 0; k < 4 && made < 2; k++) {
        const y = Math.round(40 + (k + h) * 55);
        const ta = A.tiers.find(t => t.y0 <= y - 1 && t.y1 >= y + 5), tz = Z.tiers.find(t => t.y0 <= y - 1 && t.y1 >= y + 5);
        if (!ta || !tz) continue;
        // overlap across the bridge's width
        const lo = Math.max(axis ? ta.r[0] : ta.r[1], axis ? tz.r[0] : tz.r[1]), hi = Math.min(axis ? ta.r[2] : ta.r[3], axis ? tz.r[2] : tz.r[3]);
        if (hi - lo < 10) continue;
        const c = (lo + hi) / 2, w = 3.2;
        const r = axis ? [c - w, ta.r[3], c + w, tz.r[1]] : [ta.r[2], c - w, tz.r[0], c + w];
        if (r[2] - r[0] < 6 || r[3] - r[1] < 6) continue;
        const clash = [...B.buildings, ...N.buildings].some(o => o !== A && o !== Z && o.tiers.some(t => t.r[0] < r[2] && t.r[2] > r[0] && t.r[1] < r[3] && t.r[3] > r[1] && t.y0 < y + 4.5 && t.y1 > y - 1))
          || B.bridges.some(q => Math.abs(q.y - y) < 8 && q.r[0] < r[2] && q.r[2] > r[0] && q.r[1] < r[3] && q.r[3] > r[1]);
        if (clash) continue;
        B.bridges.push({ r: r.map(r1), y, a: A.id, b: Z.id, axis }); made++;
      }
    }
  }
  return B.bridges;
}

// ---- lifts: every tall building has one, stopping at its street door, at each landing pad
// and skybridge on it, and on its roof. Positions in city-local metres; y above city ground.
// → [{ b (building), stops: [{ label, u, v, y, face }] }]
export function liftsOf(city, B) {
  if (B.lifts) return B.lifts;
  B.lifts = [];
  if (!B.district) return B.lifts;
  const near = [B, cityBlock(city, B.i - 1, B.j), cityBlock(city, B.i, B.j - 1)];
  for (const b of B.buildings) {
    if ((b.top || 0) < 40 || b.hall) continue;
    const t0 = b.tiers[0], top = b.tiers.at(-1), cu = (t0.r[0] + t0.r[2]) / 2, cv = (t0.r[1] + t0.r[3]) / 2;
    // the street door: on whatever stands on the ground under the building, facing the nearest street
    const ground = t0.y0 <= 0.1 ? t0 : (B.buildings.find(o => o.tiers[0].y0 <= 0.1 && o.tiers[0].r[0] <= cu && o.tiers[0].r[2] >= cu && o.tiers[0].r[1] <= cv && o.tiers[0].r[3] >= cv)?.tiers[0]);
    if (!ground) continue;
    const g = ground.r, R = B.rect;
    const sides = [[cv - R[1], 0], [R[3] - cv, 1], [cu - R[0], 2], [R[2] - cu, 3]].sort((p, q) => p[0] - q[0]);
    const side = sides[0][1], o = 0.9;
    const door = side === 0 ? [cu, g[1] - o] : side === 1 ? [cu, g[3] + o] : side === 2 ? [g[0] - o, cv] : [g[2] + o, cv];
    const stops = [{ label: 'Street', u: door[0], v: door[1], y: 0, face: side }];
    for (const p of B.pads) if (p.b === b.id) stops.push({ label: `Landing pad — ${Math.round(p.y)} m`, u: (p.r[0] + p.r[2]) / 2, v: (p.r[1] + p.r[3]) / 2, y: p.y });
    for (const N of near) for (const q of bridgesOf(city, N)) {
      if (q.a !== b.id && q.b !== b.id) continue;
      const atA = q.a === b.id, end = q.axis ? [(q.r[0] + q.r[2]) / 2, atA ? q.r[1] + 1.2 : q.r[3] - 1.2] : [atA ? q.r[0] + 1.2 : q.r[2] - 1.2, (q.r[1] + q.r[3]) / 2];
      stops.push({ label: `Skybridge — ${Math.round(q.y)} m`, u: end[0], v: end[1], y: q.y });
    }
    if (top.r[2] - top.r[0] > 8 && top.r[3] - top.r[1] > 8 && !['spire', 'antenna', 'pyramid', 'dome', 'crown', 'blade'].includes(b.crown)) stops.push({ label: `Roof — ${Math.round(top.y1)} m`, u: (top.r[0] + top.r[2]) / 2 + 2.5, v: (top.r[1] + top.r[3]) / 2 + 2.5, y: top.y1 });
    if (stops.length > 1) B.lifts.push({ b, stops: stops.sort((p, q) => p.y - q.y) });
  }
  return B.lifts;
}

// Every block whose kerb rect could touch a disc (u, v, r).
export function blocksNear(city, u, v, r, fn) {
  const [i0, j0] = blockIndex(city, u - r, v - r), [i1, j1] = blockIndex(city, u + r, v + r);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(cityBlock(city, i, j));
}
// The lattice range covering the whole city (for the renderer's sector sweep).
export function cityExtent(city) {
  const n = Math.ceil((city.R + 200) / PITCH) + 1;
  return [-n, -n, n, n];
}
// Which district (and street) is at (x, z) — for the HUD.
export function cityPlace(city, x, z) {
  const [u, v] = city.toLocal(x, z);
  if (!inCity(city, u, v)) return null;
  const [i, j] = blockIndex(city, u, v), B = cityBlock(city, i, j);
  return { district: B.district, label: DISTRICT_LABEL[B.district] || 'Outskirts', block: B };
}
