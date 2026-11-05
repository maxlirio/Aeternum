// Handholds: what a climber can actually hold on a wall. Logical data, read by the climber
// (player/climber.js) and drawn by whatever draws walls; the mesh never decides anything.
//
// A Face is one flat side of a building in world space:
//   { key, o:[x, z] (world, at a = 0), t:[x, z] (unit, along the wall), n:[x, z] (unit, outward),
//     w (length), y0, y1 (absolute), rows:[{ y, kind, win? , spans? }], next(), prev() }
// A hold is a point on a row: { p:[x, y, z], n:[x, z], a, kind, face }.
// Rows come from the facade itself: string courses at the window sills and lintels, floor
// bands, the parapet at the top, and where a storey leaves too long a blank stretch, rails. Glass curtain walls
// and round towers have nothing to hold.
import { STYLES, blocksNear, CURB } from './city.js';
import { sitesNear } from './outposts.js';
import { towerOf } from './towers.js';

export { MAX_GAP };
export const STEP_A = 0.45;       // spacing of holds along a row (m)
const MAX_GAP = 0.85;             // no blank stretch of wall taller than this: a body spans about 2 m, hand to foot
const SHOP = 5.2;                 // the ground-floor band of a city facade (matches the shader)

const fill = rows => {            // rails through any stretch too tall to reach across
  rows.sort((p, q) => p.y - q.y);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    const nx = rows[i + 1]; if (!nx) break;
    const gap = nx.y - rows[i].y, n = Math.ceil(gap / MAX_GAP);
    // (between a sill and its lintel these are the window's glazing bars: the shader draws the same ones)
    for (let k = 1; k < n; k++) out.push({ y: rows[i].y + gap * k / n, kind: 'rail' });
  }
  return out.filter((r, i) => i === 0 || r.y - out[i - 1].y > 0.12 || r.kind === 'top');
};

// ---- the city
// The rows of a city facade, in metres above the city ground. The pattern is the shader's:
// a ground-floor band, then storeys of b.floor with a window of winY centred at .55 of it.
function cityRows(b, y0, y1) {
  const st = STYLES[b.style], winX = st[3], winY = st[4], rows = [];
  if (y0 < SHOP) { for (const y of [0.57, 3.8]) if (y > y0 + 0.2 && y < y1 - 0.2) rows.push({ y, kind: 'shop' }); if (SHOP < y1 - 0.2 && SHOP > y0 + 0.2) rows.push({ y: SHOP, kind: 'band' }); }
  for (let k = Math.max(0, Math.floor((y0 - SHOP) / b.floor)); ; k++) {
    const base = SHOP + k * b.floor; if (base > y1) break;
    const sill = base + (0.55 - winY / 2) * b.floor, head = base + (0.55 + winY / 2) * b.floor, band = base + b.floor;
    const win = { bay: b.bay, frac: winX };
    if (winY > 0.05) {
      if (sill > y0 + 0.2 && sill < y1 - 0.2) rows.push({ y: sill, kind: 'sill', win });
      if (head > y0 + 0.2 && head < y1 - 0.2) rows.push({ y: head, kind: 'head', win });
    }
    if (band > y0 + 0.2 && band < y1 - 0.2) rows.push({ y: band, kind: 'band' });
  }
  rows.push({ y: y1, kind: 'top' });
  return fill([{ y: y0, kind: 'ground' }, ...rows]);
}
// Where drainpipes run down a wall: usually one close by a corner, and on a long wall others between the window bays. By the wall's own numbers.
function pipesOf(f, bay) {
  let h = 0; for (const ch of f.key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const out = [], r = k => ((h ^ Math.imul(k + 1, 2654435761)) >>> 0) % 1000 / 1000;
  if (f.w < 4) return out;
  if (r(0) < 0.85) out.push(r(1) < 0.5 ? 0.42 : f.w - 0.42);
  const b = bay > 1 ? bay : 4.5, gap = 6 + r(2) * 2; for (let a = gap; a < f.w - 3; a += gap) { const q = Math.round(a / b) * b;   // (the first always: there's something to leap to from the corner)
      if (q > 2 && q < f.w - 2 && !out.includes(q) && (a === gap || r(3 + out.length) < 0.62)) out.push(q); }
  return out;
}
const SIDES = [   // the four sides of a tier in the order you meet them going round (a increasing)
  (r) => ({ o: [r[2], r[1]], t: [0, 1], n: [1, 0], w: r[3] - r[1] }),
  (r) => ({ o: [r[2], r[3]], t: [-1, 0], n: [0, 1], w: r[2] - r[0] }),
  (r) => ({ o: [r[0], r[3]], t: [0, -1], n: [-1, 0], w: r[3] - r[1] }),
  (r) => ({ o: [r[0], r[1]], t: [1, 0], n: [0, -1], w: r[2] - r[0] }),
];
export const climbableStyle = style => !!STYLES[style]?.[5];
// One object per face, so a hold's face can be compared (and rows aren't rebuilt per query).
function memo(world, key, make) {
  const m = world.faces || (world.faces = new Map());
  let f = m.get(key); if (f) return f;
  if (m.size > 600) m.clear();
  f = make(); m.set(key, f); return f;
}
const cityFace = (world, b, ti, side) => memo(world, `c:${b.id}:${ti}:${side}`, () => makeCityFace(world, b, ti, side));
function makeCityFace(world, b, ti, side) {
  const c = world.city, base = c.h + CURB, t = b.tiers[ti], S = SIDES[side](t.r);
  // a tier flush with the one above it is one wall: keep going up it
  let top = t.y1;
  for (let k = ti + 1; k < b.tiers.length; k++) {
    const q = b.tiers[k], Q = SIDES[side](q.r);
    if (q.shape || Math.abs(Q.o[0] * S.n[0] + Q.o[1] * S.n[1] - (S.o[0] * S.n[0] + S.o[1] * S.n[1])) > 0.01 || Math.abs(q.y0 - top) > 0.01) break;
    top = q.y1;
  }
  const w = (a, e) => [a * c.cos - e * c.sin, a * c.sin + e * c.cos];
  const [ox, oz] = c.toWorld(S.o[0], S.o[1]);
  const f = { key: `c:${b.id}:${ti}:${side}`, o: [ox, oz], t: w(...S.t), n: w(...S.n), w: S.w, y0: base + t.y0, y1: base + top, b,
    rows: cityRows(b, t.y0, top).map(r => ({ ...r, y: base + r.y })), label: b.label };
  f.pipes = pipesOf(f, b.bay);
  f.next = () => cityFace(world, b, ti, (side + 1) % 4);
  f.prev = () => cityFace(world, b, ti, (side + 3) % 4);
  return f;
}
function cityFaces(world, x, y, z, r, fn) {
  const c = world.city;
  if (Math.abs(x - c.cx) > c.R + 300 || Math.abs(z - c.cz) > c.R + 300) return;
  const [u, v] = c.toLocal(x, z), base = c.h + CURB;
  blocksNear(c, u, v, r + 1, B => { for (const b of B.buildings) {
    if (!climbableStyle(b.style)) continue;
    b.tiers.forEach((t, ti) => {
      if (t.shape || y < base + t.y0 - r || y > base + t.y1 + r) return;
      if (u < t.r[0] - r || u > t.r[2] + r || v < t.r[1] - r || v > t.r[3] + r) return;
      for (let s = 0; s < 4; s++) fn(cityFace(world, b, ti, s));
    });
  } });
}

// ---- town buildings: the real windows and storey bands of the plan
const townFace = (world, b, side) => memo(world, `t:${b.key}:${side}`, () => makeTownFace(world, b, side));
function makeTownFace(world, b, side) {
  const s = world.s, plan = world.colliders(b).plan, { w, d, F, H } = plan, base = world.baseOf(b);
  const toW = (lx, lz) => s.toWorld(b.O[0] + b.ex[0] * lx + b.ez[0] * lz, b.O[1] + b.ex[1] * lx + b.ez[1] * lz);
  const dir = (lx, lz) => { const [a, e] = toW(lx, lz), [a0, e0] = toW(0, 0); return [a - a0, e - e0]; };
  const def = [
    { sd: 'right', o: [w, 0], t: [0, 1], n: [1, 0], L: d },
    { sd: 'back', o: [w, d], t: [-1, 0], n: [0, 1], L: w },
    { sd: 'left', o: [0, d], t: [0, -1], n: [-1, 0], L: d },
    { sd: 'front', o: [0, 0], t: [1, 0], n: [0, -1], L: w },
  ][side];
  const rows = [{ y: 0, kind: 'ground' }];
  const lat = def.t[0] !== 0 ? (v) => (def.t[0] > 0 ? v : w - v) : (v) => (def.t[1] > 0 ? v : d - v);   // wall coordinate → a
  for (let k = 0; k < F; k++) {
    if (k) rows.push({ y: k * H, kind: 'band' });
    const spans = new Map();
    for (const wl of plan.walls) if (wl.exterior && wl.side === def.sd && wl.k === k) for (const o of wl.openings) if (o.kind === 'window') {
      for (const [key, y] of [['sill', o.y0], ['head', o.y1]]) (spans.get(key + y) || spans.set(key + y, { y, kind: key, spans: [] }).get(key + y)).spans.push([Math.min(lat(o.a), lat(o.b)), Math.max(lat(o.a), lat(o.b))]);
    }
    rows.push(...spans.values());
  }
  rows.push({ y: F * H + 0.7, kind: 'top' });    // the parapet
  const f = { key: `t:${b.key}:${side}`, o: toW(...def.o), t: dir(...def.t), n: dir(...def.n), w: def.L, y0: base, y1: base + F * H + 0.7, town: b, label: b.owner,
    rows: fill(rows).map(r => ({ ...r, y: base + r.y })) };
  f.next = () => townFace(world, b, (side + 1) % 4);
  f.prev = () => townFace(world, b, (side + 3) % 4);
  return f;
}
function townFaces(world, x, y, z, r, fn) {
  for (const b of world.near(x, z)) {
    if (b.city || b.type === 'ship') continue;
    const [lx, lz] = world.toB(b, x, z);
    if (!world.inside(b, lx, lz, r)) continue;
    const plan = world.colliders(b).plan, base = world.baseOf(b);
    if (y < base - r || y > base + plan.F * plan.H + 0.7 + r) continue;
    for (let s = 0; s < 4; s++) fn(townFace(world, b, s));
  }
}

// ---- steelwork in the country: a face per side of the frame, drawing in as it rises
const towerFace = (world, it, T, side) => memo(world, `m:${it.k}:${it.x}:${it.z}:${side}`, () => {
  const b = T.b, c = Math.cos(it.rot || 0), s = Math.sin(it.rot || 0), w = (x, z) => [x * c + z * s, -x * s + z * c], at = (x, z) => { const [a, e] = w(x, z); return [it.x + a, it.z + e]; };
  const def = [{ o: [b, -b], t: [0, 1], n: [1, 0] }, { o: [b, b], t: [-1, 0], n: [0, 1] }, { o: [-b, b], t: [0, -1], n: [-1, 0] }, { o: [-b, -b], t: [1, 0], n: [0, -1] }][side];
  const rows = [{ y: it.y, kind: 'ground' }]; for (let y = T.step; y < T.h - 0.2; y += T.step) rows.push({ y: it.y + y, kind: 'rail' }); rows.push({ y: it.y + T.h, kind: 'top' });
  const f = { key: `m:${it.k}:${it.x}:${it.z}:${side}`, o: at(...def.o), t: w(...def.t), n: w(...def.n), w: 2 * b, y0: it.y, y1: it.y + T.h, rows, tower: true, taper: (b - T.t) / T.h, label: 'the tower' };
  f.next = () => towerFace(world, it, T, (side + 1) % 4); f.prev = () => towerFace(world, it, T, (side + 3) % 4);
  return f;
});
function towerFaces(world, x, y, z, r, fn) {
  if (world.flora === false || !world.planet) return;
  sitesNear(world.planet, x, z, r + 8, S => { if (Math.abs(S.x - x) > S.clear + 80 || Math.abs(S.z - z) > S.clear + 80) return; for (const it of S.items) {
    if (Math.abs(it.x - x) > r + 5 || Math.abs(it.z - z) > r + 5) continue;
    const T = towerOf(world.planet, it); if (!T || y < it.y - r || y > it.y + T.h + r) continue;
    for (let q = 0; q < 4; q++) fn(towerFace(world, it, T, q));
  } });
}

// ---- reading faces
const insetAt = (f, y) => f.taper && y != null ? f.taper * Math.max(0, y - f.y0) : 0;
export const aOf = (f, x, z) => (x - f.o[0]) * f.t[0] + (z - f.o[1]) * f.t[1];
export const outOf = (f, x, z, y = null) => (x - f.o[0]) * f.n[0] + (z - f.o[1]) * f.n[1] + insetAt(f, y);
export const pointOn = (f, a, y, out = 0) => [f.o[0] + f.t[0] * a + f.n[0] * out, y, f.o[1] + f.t[1] * a + f.n[1] * out];

// The face you'd grab from (x, y, z) looking along (fx, fz): within `reach`, in front of you.
export function faceAhead(world, x, y, z, fx, fz, reach = 1.0) {
  let best = null, bd = Infinity;
  const test = f => {
    const out = outOf(f, x, z), a = aOf(f, x, z);
    if (out < -0.05 || out > reach || a < -0.1 || a > f.w + 0.1) return;
    if (f.n[0] * fx + f.n[1] * fz > -0.35) return;       // you have to be facing it
    if (out < bd) { bd = out; best = f; }
  };
  cityFaces(world, x, y + 1, z, reach, test);
  townFaces(world, x, y + 1, z, reach, test);
  towerFaces(world, x, y + 1, z, reach, test);
  return best;
}
// The wall under the edge you're standing near, on a roof, looking out over it. (Glass and round
// towers have no holds at the top either.)
export function faceBelowEdge(world, x, y, z, fx, fz, reach = 1.4) {
  let best = null, bd = Infinity;
  const test = f => {
    const out = outOf(f, x, z), a = aOf(f, x, z);
    if (out > 0.05 || out < -reach || a < 0.2 || a > f.w - 0.2 || Math.abs(f.y1 - y) > 0.9) return;
    if (f.n[0] * fx + f.n[1] * fz < 0.35) return;
    if (-out < bd) { bd = -out; best = f; }
  };
  cityFaces(world, x, y - 0.5, z, reach, test);
  townFaces(world, x, y - 0.5, z, reach, test);
  return best;
}
// Every climbable wall within r of a point (for what's drawn on them, and for leaping between buildings).
export function facesNear(world, x, y, z, r, fn) { cityFaces(world, x, y, z, r, fn); townFaces(world, x, y, z, r, fn); towerFaces(world, x, y, z, r, fn); }
// Is there a wall here at all, too smooth to climb? (For telling the player why not.)
export function smoothAhead(world, x, y, z, fx, fz) {
  const q = 0.9; return world.solidAt(x + fx * q, y + 1.2, z + fz * q, 0.05);
}

// The holds on a face in a box round (a, y). Each is clear of whatever else stands there. A corner is a hold all the way up:
// a building's arris or a tower's leg is something to wrap your hands round, row or no row.
export const CORNER_STEP = 0.45;
export function holdsNear(world, f, a, y, ra, ry, fn) {
  for (const row of f.rows) {
    if (row.y < y - ry || row.y > y + ry) continue;
    const ins = insetAt(f, row.y), a0 = Math.max(0.12 + ins, a - ra), a1 = Math.min(f.w - 0.12 - ins, a + ra);
    const at = []; for (let k = Math.ceil(a0 / STEP_A); k * STEP_A <= a1; k++) at.push(k * STEP_A);
    if (a0 <= 0.15 + ins) at.unshift(0.15 + ins);                     // ...and right up to the corners, to reach round them
    if (a1 >= f.w - 0.15 - ins) at.push(f.w - 0.15 - ins);
    for (const h of at) {
      const p = pointOn(f, h, row.y, -ins), n = f.n;
      if (!f.tower && row.kind !== 'top' && row.kind !== 'ground') { if (world.solidAt(p[0] + n[0] * 0.32, row.y + 0.15, p[2] + n[1] * 0.32, 0.05)) continue; }   // someone else's wall is in the way
      fn({ p, n, a: h, y: row.y, kind: row.kind, face: f });
    }
  }
  // a drainpipe is a hold all the way up
  for (const a0 of f.pipes || []) { if (Math.abs(a0 - a) > ra) continue;
    const y0 = Math.max(f.y0 + 0.4, y - ry), y1 = Math.min(f.y1 - 0.2, y + ry);
    for (let k = Math.ceil((y0 - f.y0) / CORNER_STEP); f.y0 + k * CORNER_STEP <= y1; k++) { const hy = f.y0 + k * CORNER_STEP, p = pointOn(f, a0, hy, 0.09); if (!f.tower && world.solidAt(p[0] + f.n[0] * 0.25, hy + 0.15, p[2] + f.n[1] * 0.25, 0.05)) continue; fn({ p, n: f.n, a: a0, y: hy, kind: 'pipe', face: f }); } }
  // the corners themselves
  const y0 = Math.max(f.y0 + 0.4, y - ry), y1 = Math.min(f.y1 - 0.15, y + ry);
  for (let k = Math.ceil((y0 - f.y0) / CORNER_STEP); f.y0 + k * CORNER_STEP <= y1; k++) {
    const hy = f.y0 + k * CORNER_STEP, ins = insetAt(f, hy);
    for (const h of [ins + 0.05, f.w - ins - 0.05]) {
      if (Math.abs(h - a) > ra) continue;
      const p = pointOn(f, h, hy, -ins), n = f.n;
      if (!f.tower && world.solidAt(p[0] + n[0] * 0.32, hy + 0.15, p[2] + n[1] * 0.32, 0.05)) continue;
      fn({ p, n, a: h, y: hy, kind: 'corner', face: f });
    }
  }
}
