// Collision against the same data the renderer draws: the graded ground surface plus
// building plans (walls with door gaps, floor slabs, stair ramps, furniture).
// Buildings are axis-aligned in their own frame, so every test is circle-vs-AABB in
// building-local coordinates. No three.js here.
import { cellOf } from '../gen/structure.js';
import { surfaceHeight } from '../gen/surface.js';
import { rawHeight } from '../gen/terrain.js';
import { buildingPlan, SLAB_T } from '../gen/building.js';
import { settlementNear } from '../gen/settlement.js';
import { PLINTH } from '../core/units.js';
import { floraNear } from '../gen/flora.js';
import { rocksNear, ledgesNear, outOfRock, rockSurface, rockSolid } from '../gen/rocks.js';
import { towerOf } from '../gen/towers.js';
import { deckAt, railHold } from '../gen/surface.js';
import { sitesNear } from '../gen/outposts.js';
import { hulkPush, hulkTop, hulkSolid } from '../gen/hulk.js';
import { getCity, blocksNear, CURB, bridgesOf, cityBlock as cityBlockOf } from '../gen/city.js';

const inBox = (b, u, v, m = 0) => b[6] ? Math.hypot(u - (b[0] + b[2]) / 2, v - (b[1] + b[3]) / 2) <= (b[2] - b[0]) / 2 + m : u >= b[0] - m && u <= b[2] + m && v >= b[1] - m && v <= b[3] + m;
// The megacity's solids as city-local boxes [u0, v0, u1, v1, y0, y1] (absolute heights):
// every building tier, each block's kerb slab, the landing pads. Cached on the block.
function cityBoxes(c, B) {
  if (B.col) return B.col;
  const base = c.h + CURB, out = [];
  if (B.district) out.push([...B.rect, c.h - 1, base]);
  for (const b of B.buildings) for (const t of b.tiers) {
    if (b.enter && t === b.tiers[0] && b.real !== null) continue;      // walk-in buildings are structures of their own (world/cityreal.js)
    out.push([...t.r, base + t.y0, base + t.y1, t.shape ? 1 : 0]);    // [6] = 1: round (the circle in the rect)
  }
  for (const p of B.pads) out.push([...p.r, base + p.y - 1.2, base + p.y]);
  // skybridges (owned by this block or sent across from the blocks before it): deck, glass sides, roof
  for (const N of [B, cityBlockOf(c, B.i - 1, B.j), cityBlockOf(c, B.i, B.j - 1)]) for (const q of bridgesOf(c, N)) {
    const [u0, v0, u1, v1] = q.r, y = base + q.y;
    out.push([u0, v0, u1, v1, y - 0.8, y], [u0, v0, u1, v1, y + 3.4, y + 3.8]);
    if (q.axis) out.push([u0, v0, u0 + 0.15, v1, y, y + 3.4], [u1 - 0.15, v0, u1, v1, y, y + 3.4]);
    else out.push([u0, v0, u1, v0 + 0.15, y, y + 3.4], [u0, v1 - 0.15, u1, v1, y, y + 3.4]);
  }
  return (B.col = out);
}

export const STEP = 0.5;
const SPACE = 20000;    // above this, nothing on the ground is worth asking about: you go by too fast
const GRID = 16;

export class CollisionWorld {
  constructor(planet, s, doorPassable) {
    this.planet = planet; this.s = s; this.doorPassable = doorPassable;
    this.base = s.h + PLINTH;
    this.flora = true;           // trees and boulders block (tests of town-only collision can turn it off)
    this.city = getCity(planet);
    this.cols = new Map();       // building n (or structure key) -> collider set
    this.grid = new Map();
    this.owner = new WeakMap();  // building -> the town whose frame it's in (not there: this.s)
    this.towns = new Map();      // other town -> its own grid, made when first needed
    this.loose = [];             // another town's ship, which can be anywhere: [{ b, x, z, r }]
    for (const b of s.buildings) this.index(b, true);
  }
  townOf(b) { return this.owner.get(b) || this.s; }
  gridAt(x, z) {                 // the other town whose ground this is, if any
    const q = settlementNear(this.planet, x, z); if (!q || q === this.s) return null;
    let T = this.towns.get(q);
    if (!T) { this.towns.set(q, T = { s: q, grid: new Map() }); for (const b of q.buildings) { this.owner.set(b, q); this.index(b, true, T.grid); } }
    return T;
  }
  index(b, add, grid = this.grid) {
    const [x0, z0, x1, z1] = b.rect;
    for (let gx = Math.floor((x0 - 1) / GRID); gx <= Math.floor((x1 + 1) / GRID); gx++)
      for (let gz = Math.floor((z0 - 1) / GRID); gz <= Math.floor((z1 + 1) / GRID); gz++) {
        const k = gx + ',' + gz, cell = grid.get(k) || grid.set(k, []).get(k);
        if (add) cell.push(b); else { const i = cell.indexOf(b); if (i >= 0) cell.splice(i, 1); }
      }
  }
  // Something building-like that isn't part of the town plan — a landed ship. It brings
  // its own frame (O, ex, ez, rect in settlement space), floor height (base), plan and
  // door rule (doorPassable(id)).
  addStructure(b, town = null) {
    if (!town || town === this.s) return this.index(b, true);
    this.owner.set(b, town); const [x, z] = town.toWorld((b.rect[0] + b.rect[2]) / 2, (b.rect[1] + b.rect[3]) / 2);
    this.loose.push({ b, x, z, r: Math.hypot(b.rect[2] - b.rect[0], b.rect[3] - b.rect[1]) / 2 + 4 });
  }
  removeStructure(b) { const i = this.loose.findIndex(q => q.b === b); if (i >= 0) this.loose.splice(i, 1); else this.index(b, false); }
  baseOf(b) { return b.base ?? (this.owner.has(b) ? this.owner.get(b).h + PLINTH : this.base); }
  passable(b, id) { return b.doorPassable ? b.doorPassable(id) : this.doorPassable(b, id); }

  near(x, z) {
    const [u, v] = this.s.toLocal(x, z);
    let out = this.grid.get(Math.floor(u / GRID) + ',' + Math.floor(v / GRID)) || [];
    const T = this.gridAt(x, z);
    if (T) { const [p, q] = T.s.toLocal(x, z), c = T.grid.get(Math.floor(p / GRID) + ',' + Math.floor(q / GRID)); if (c?.length) out = out.length ? out.concat(c) : c; }
    for (const L of this.loose) if (Math.abs(L.x - x) < L.r && Math.abs(L.z - z) < L.r) out = out.concat(L.b);
    return out;
  }
  toB(b, x, z) {
    const [u, v] = this.townOf(b).toLocal(x, z), du = u - b.O[0], dv = v - b.O[1];
    return [du * b.ex[0] + dv * b.ex[1], du * b.ez[0] + dv * b.ez[1]];
  }
  fromBVec(b, lx, lz) {   // building-local vector → world vector
    const u = lx * b.ex[0] + lz * b.ez[0], v = lx * b.ex[1] + lz * b.ez[1];
    const s = this.townOf(b); return [u * s.cos - v * s.sin, u * s.sin + v * s.cos];
  }

  // a town's buildings rebuilt from their plans (it's been burnt since: sim/planetwar.js)
  forget(s) { for (const b of s.buildings || []) this.cols.delete(b.key); }
  colliders(b) {
    let c = this.cols.get(b.key);
    if (c) return c;
    let plan = b.plan || buildingPlan(this.planet, this.townOf(b), b);
    // burnt (this.ruined(b): how high its walls still stand, else null): the walls only up to there, no floors over it, its doors and its things gone
    const low = this.ruined?.(b, plan.F * plan.H) ?? null;
    if (low != null) plan = { ...plan, walls: plan.walls.filter(w => w.y0 < low).map(w => ({ ...w, y1: Math.min(w.y1, low), openings: w.openings.map(o => o.kind === 'door' ? { ...o, door: -2 } : o) })), slabs: plan.slabs.filter(sl => sl.y < low - 0.3), props: [], solids: this.pile?.(b) || [] };      // (and what came down lies in a heap: render/ruin.js)
    // hit (this.holes(b): { S, gone, flat } — gen/structure.js, the parts of it that are down): no wall where a panel's gone, no floor where a square has,
    // nothing standing where its floor's fallen, and the heap of what came down lying in it (render/ruin.js)
    const HL = low == null ? this.holes?.(b) || null : null, S = HL?.S, out = k => HL.flat || HL.gone.has(S.index.get(k)), cutUp = (cuts, p, q) => { const o = [p]; for (const c of cuts) if (c > p + 0.01 && c < q - 0.01) o.push(c); o.push(q); return o; };
    if (HL) plan = { ...plan, solids: (plan.solids || []).concat(HL.flat ? [] : this.pile?.(b) || []),      // (pressed flat, it's low enough to walk over)
      slabs: plan.slabs.map(sl => sl.k < 1 ? sl : { ...sl, rects: sl.rects.flatMap(r => { const X = cutUp(S.gx, r[0], r[2]), Z = cutUp(S.gz, r[1], r[3]), o = []; for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Z.length; j++) if (!out('f' + cellOf(S.gx, (X[i] + X[i + 1]) / 2) + ':' + cellOf(S.gz, (Z[j] + Z[j + 1]) / 2) + ':' + sl.k)) o.push([X[i], Z[j], X[i + 1], Z[j + 1]]); return o; }) }),
      props: plan.props.filter(p => { const lvl = Math.round(p.y / plan.H); return !HL.flat && (lvl < 1 || !out('f' + cellOf(S.gx, (p.x0 + p.x1) / 2) + ':' + cellOf(S.gz, (p.z0 + p.z1) / 2) + ':' + lvl)); }) };
    const walls = [];
    for (let wi = 0; wi < plan.walls.length; wi++) { const wl = plan.walls[wi];
      const alongX = wl.z0 === wl.z1, t = wl.t / 2;
      const a0 = alongX ? wl.x0 : wl.z0, a1 = alongX ? wl.x1 : wl.z1, cc = alongX ? wl.z0 : wl.x0;
      const put = (p, q, y0, y1, door) => { if (q - p > 0.001) walls.push(alongX ? [p, cc - t, q, cc + t, y0, y1, door] : [cc - t, p, cc + t, q, y0, y1, door]); };
      const add = !HL ? (p, q, door) => put(p, q, wl.y0, wl.y1, door) : (p, q, door) => { const W = S.walls[wi], U = cutUp(W.cuts, p, q), ym = wl.y0 + W.Hh;
        for (let i = 0; i + 1 < U.length; i++) { const ci = cellOf(W.cuts, (U[i] + U[i + 1]) / 2), lo = !out('w' + wi + ':' + ci + ':0'), hi = !out('w' + wi + ':' + ci + ':1'); if (lo && hi) put(U[i], U[i + 1], wl.y0, wl.y1, door); else if (lo) put(U[i], U[i + 1], wl.y0, ym, -1); else if (hi) put(U[i], U[i + 1], ym, wl.y1, -1); } };
      let cur = a0;
      for (const o of wl.openings.filter(o => o.kind === 'door').sort((p, q) => p.a - q.a)) {
        add(cur, o.a, -1); if (o.door !== -2) add(o.a, o.b, o.door); cur = o.b;
      }
      add(cur, a1, -1);
      if (wl.exterior && wl.k === plan.F - 1 && !b.footing && low == null && !HL) { // roof parapet
        const top = plan.F * plan.H;
        walls.push(alongX ? [a0, cc - t, a1, cc + t, top, top + 0.7, -1] : [cc - t, a0, cc + t, a1, top, top + 0.7, -1]);
      }
    }
    if (b.footing) for (const q of [[0, 0, b.w, 0.2], [0, b.d - 0.2, b.w, b.d], [0, 0, 0.2, b.d], [b.w - 0.2, 0, b.w, b.d]]) walls.push([...q, -4, 0, -1]);   // (what it stands on, where the ground falls away)
    const props = plan.props.filter(p => !p.soft).map(p => [p.x0, p.z0, p.x1, p.z1, p.y, p.y + p.h + (p.kind === 'tvstand' ? 0.85 : 0)]).concat(plan.solids || []);      // (a stand's solid up to the top of the screen on it)
    // the chairs and the small things on tables and shelves: solid to you (people walking to a chair to sit in it go into it)
    const soft = plan.props.filter(p => p.soft && p.h > 0.05 && p.x1 > p.x0 && p.z1 > p.z0).map(p => [p.x0, p.z0, p.x1, p.z1, p.y, p.y + p.h]);
    // window openings (a round goes through one where a wall would stop it): [x0, z0, x1, z1, y0, y1], building-local, with the wall and the opening they are
    const wins = [];
    for (let wi = 0; wi < plan.walls.length; wi++) { const wl = plan.walls[wi], alongX = wl.z0 === wl.z1, t = wl.t / 2 + 0.06, cc = alongX ? wl.z0 : wl.x0; for (const o of wl.openings) if (o.kind === 'window' && wl.y0 + o.y1 <= (low ?? 1e9) && !(HL && (out('w' + wi + ':' + cellOf(S.walls[wi].cuts, (o.a + o.b) / 2) + ':0') || out('w' + wi + ':' + cellOf(S.walls[wi].cuts, (o.a + o.b) / 2) + ':1')))) wins.push(alongX ? [o.a, cc - t, o.b, cc + t, wl.y0 + o.y0, wl.y0 + o.y1, wl, o] : [cc - t, o.a, cc + t, o.b, wl.y0 + o.y0, wl.y0 + o.y1, wl, o]); }
    c = { b, plan, walls, props, soft, wins };
    this.cols.set(b.key, c);
    return c;
  }

  // City boxes near (x, z) within reach r, in city-local coordinates: calls fn(box, u, v).
  cityNear(x, z, r, fn) {
    const c = this.city;
    if (Math.abs(x - c.cx) > c.R + 400 || Math.abs(z - c.cz) > c.R + 400) return;
    const [u, v] = c.toLocal(x, z);
    blocksNear(c, u, v, r, B => { for (const box of cityBoxes(c, B)) if (u > box[0] - r && u < box[2] + r && v > box[1] - r && v < box[3] + r) fn(box, u, v); });
  }
  inside(b, lx, lz, m = 0) { return lx >= -m && lz >= -m && lx <= b.w + m && lz <= b.d + m; }

  // Highest walkable surface at (x, z) no higher than yFeet + STEP.
  groundAt(x, z, yFeet) {
    if (yFeet > SPACE) return { h: this.planet.seaLevel, where: null };
    // well clear of anything built (the megacity's towers and anything standing up there aside), the land's own shape answers: asking for the towns, rivers and roads under
    // a ship going over at thousands of metres a second would have every one of them worked out as it passes
    { const c = this.city; if (!(c && Math.abs(x - c.cx) < c.R + 1500 && Math.abs(z - c.cz) < c.R + 1500)) { const raw = rawHeight(this.planet, x, z); if (yFeet - raw > 2500 && !this.near(x, z).length) return { h: raw, where: null }; } }     // (a ring's floor, a great ship's deck: those are asked about as usual)
    let best = surfaceHeight(this.planet, x, z), where = null;
    { const d = deckAt(this.planet, x, z); if (d !== null && d <= yFeet + STEP && d > best) { best = d; where = { bridge: true }; } }
    // the roof of a standing car; the deck of a watchtower
    if (this.carBoxes) for (const V of this.carBoxes) { if (!V.roof || Math.abs(x - V.x) > V.reach || Math.abs(z - V.z) > V.reach) continue; const dx = x - V.x, dz = z - V.z, top = V.y + V.h; if (top <= yFeet + STEP && top > best && Math.abs(dx * V.fx + dz * V.fz) < V.hl && Math.abs(dx * V.fz - dz * V.fx) < V.hw) { best = top; where = { car: true, roof: true, V }; } }
    if (this.flora) sitesNear(this.planet, x, z, 6, S => { if (Math.abs(S.x - x) > S.clear + 60 || Math.abs(S.z - z) > S.clear + 60) return; for (const it of S.items) { if (!/watchtower/.test(it.k) || Math.abs(it.x - x) > 4 || Math.abs(it.z - z) > 4) continue; const T = towerOf(this.planet, it); if (!T?.deck) continue; const top = it.y + T.deck.y, c = Math.cos(it.rot || 0), s = Math.sin(it.rot || 0), dx = x - it.x, dz = z - it.z; if (top <= yFeet + STEP && top > best && Math.abs(dx * c - dz * s) < T.deck.half && Math.abs(dx * s + dz * c) < T.deck.half) { best = top; where = { deck: true, roof: true }; } } });
    this.cityNear(x, z, 0, (box, u, v) => { if (box[5] <= yFeet + STEP && box[5] > best && inBox(box, u, v)) { best = box[5]; where = { city: true, roof: box[5] - box[4] > 2 }; } });
    // the tops of the stones: stood on as the land is (no where: steep is steep, on stone as on a hillside)
    let rock = null;
    if (this.flora) { const on = q => { if (q.g + q.top <= best) return; const h = rockSurface(q, x, z); if (h > best && h <= yFeet + STEP) { best = h; rock = q; } }; rocksNear(this.planet, x, z, 0, on); ledgesNear(this.planet, x, z, 0, on); }
    if (this.hulks) for (const H of this.hulks) { const h = hulkTop(H, x, z, yFeet + STEP); if (h > best) { best = h; where = { hulk: true }; rock = null; } }      // (stood on, as it lies)
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz, 0.05)) continue;
      const { plan } = this.colliders(b);
      const ly = yFeet - this.baseOf(b);
      for (const sl of plan.slabs) {
        if (sl.y > ly + STEP) continue;
        for (const r of sl.rects) if (lx >= r[0] - 0.05 && lx <= r[2] + 0.05 && lz >= r[1] && lz <= r[3]) {
          const h = this.baseOf(b) + sl.y;
          if (h > best) { best = h; where = { b, k: Math.min(sl.k, plan.F - 1), roof: sl.roof }; }
        }
      }
      // furniture you can stand on (tables, crates, counters) — tops of solid props
      for (const pr of this.colliders(b).props) {
        const top = this.baseOf(b) + pr[5];
        if (top > yFeet + STEP || top <= best) continue;
        if (lx >= pr[0] && lx <= pr[2] && lz >= pr[1] && lz <= pr[3]) { best = top; where = { b, k: Math.max(0, Math.min(plan.F - 1, Math.floor(pr[4] / plan.H))), prop: true }; }
      }
      if (plan.roofSlopes) for (const r of plan.roofSlopes) {     // a pitched roof, as your feet find it
        if (lx < r.x0 || lx > r.x1 || lz < r.z0 || lz > r.z1) continue;
        const h = this.baseOf(b) + (r.a === 'x' ? r.y0 + (r.y1 - r.y0) * (lx - r.x0) / (r.x1 - r.x0) : r.y0 + (r.y1 - r.y0) * (lz - r.z0) / (r.z1 - r.z0));
        if (h <= yFeet + STEP && h > best) { best = h; where = { b, k: plan.F - 1, roof: true }; }
      }
      for (const r of plan.ramps) {
        if (lx < r.x0 || lx > r.x1 || lz < r.z0 || lz > r.z1) continue;
        const h = this.baseOf(b) + r.y0 + (r.y1 - r.y0) * (lz - r.z0) / (r.z1 - r.z0);
        if (h <= yFeet + STEP && h > best) { best = h; where = { b, k: r.k, stairs: true }; }
      }
    }
    if (where) rock = null;
    return { h: best, where, rock };
  }

  // Lowest ceiling above the head at (x, z), or Infinity.
  ceilingAt(x, z, yFeet) {
    if (yFeet > SPACE) return Infinity;
    let c = Infinity;
    this.cityNear(x, z, 0, (box, u, v) => { if (box[4] >= yFeet + 0.3 && inBox(box, u, v)) c = Math.min(c, box[4]); });
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz)) continue;
      const { plan } = this.colliders(b);
      const ly = yFeet - this.baseOf(b);
      for (const sl of plan.slabs) {
        const bottom = sl.y - SLAB_T;
        if (bottom < ly + 0.3) continue;
        for (const r of sl.rects) if (lx >= r[0] && lx <= r[2] && lz >= r[1] && lz <= r[3]) c = Math.min(c, this.baseOf(b) + bottom);
      }
    }
    return c;
  }

  // Push a vertical capsule (radius r, height h) out of walls and furniture.
  resolve(x, z, yFeet, r = 0.32, h = 1.75, ownDoors = false, you = false, natural = true) {     // (ownDoors: someone with the keys, whose doors open for them, sim/jostle.js; you: the player, who's also kept out of the people about, this.bodies; natural false: only what's built, not trees and rocks: a ship at speed breaks the one and skids on the other, player/flight.js)
    if (yFeet > SPACE) return [x, z];
    const C = this.city;
    { const held = railHold(this.planet, x, z, yFeet, r); if (held) { x = held[0]; z = held[1]; } }
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.cityNear(x, z, r + 0.2, (box, u, v) => {
        if (yFeet + h <= box[4] || yFeet + 0.3 >= box[5]) return;
        const [lu, lv] = C.toLocal(x, z);
        if (box[6]) {      // a round tower: push out of its circle
          const cu = (box[0] + box[2]) / 2, cv = (box[1] + box[3]) / 2, R = (box[2] - box[0]) / 2 + r, du = lu - cu, dv = lv - cv, d = Math.hypot(du, dv);
          if (d >= R) return;
          const k = d > 1e-6 ? (R - d) / d : 0, pu = d > 1e-6 ? du * k : R, pv = d > 1e-6 ? dv * k : 0;
          x += pu * C.cos - pv * C.sin; z += pu * C.sin + pv * C.cos; moved = true; return;
        }
        const nu = Math.max(box[0], Math.min(lu, box[2])), nv = Math.max(box[1], Math.min(lv, box[3]));
        let du = lu - nu, dv = lv - nv, d2 = du * du + dv * dv, pu, pv;
        if (d2 >= r * r) return;
        if (d2 < 1e-10) { const pen = [lu - box[0], box[2] - lu, lv - box[1], box[3] - lv], m = Math.min(...pen), i = pen.indexOf(m);
          pu = (i === 0 ? -1 : i === 1 ? 1 : 0) * (m + r); pv = (i === 2 ? -1 : i === 3 ? 1 : 0) * (m + r); }
        else { const d = Math.sqrt(d2); pu = du / d * (r - d); pv = dv / d * (r - d); }
        x += pu * C.cos - pv * C.sin; z += pu * C.sin + pv * C.cos; moved = true;
      });
      // vehicles standing or passing: their own boxes, turned with them (set each frame by main.js; empty while you're driving one)
      if (this.carBoxes) for (const V of this.carBoxes) {
        const dx = x - V.x, dz = z - V.z; if (Math.abs(dx) > V.reach + r || Math.abs(dz) > V.reach + r || yFeet > V.y + V.h - 0.12 || yFeet + h < V.y) continue;
        const fx = V.fx, fz = V.fz, lu = dx * fx + dz * fz, lv = dx * fz - dz * fx, pu = V.hl + r - Math.abs(lu), pv = V.hw + r - Math.abs(lv); if (pu <= 0 || pv <= 0) continue;
        if (pv < pu) { const q = Math.sign(lv || 1) * pv; x += q * fz; z -= q * fx; } else { const q = Math.sign(lu || 1) * pu; x += q * fx; z += q * fz; } moved = true;
      }
      // the stones for the dead of your line (render/memorials.js): solid to everyone
      if (this.stones) for (const S of this.stones) { if (yFeet > S.y + S.h - 0.05 || yFeet + h < S.y) continue; const dx = x - S.x, dz = z - S.z, d = Math.hypot(dx, dz), Rr = r + S.r; if (d >= Rr) continue;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0; x = S.x + ux * Rr; z = S.z + uz * Rr; moved = true; }
      // the works of a fighting line, and its armour (sim/infantry.js): sandbags you can jump, wire you can't, hedgehogs, hulls
      if (this.field) { const q = this.field.push(x, z, yFeet, h, r); if (q) { x = q[0]; z = q[1]; moved = true; } }
      // the hull of a great ship brought down (gen/hulk.js; this.hulks set by main.js): out of it sideways, at knee and at chest height
      if (this.hulks) for (const H of this.hulks) for (const up of [STEP + 0.15, h - 0.2]) { const q = hulkPush(H, [x, yFeet + up, z], r); if (!q) continue; const l = Math.hypot(q[0], q[2]);
        if (l > 1e-4) { const k = Math.hypot(q[0], q[1], q[2]) / l; x += q[0] * Math.min(k, 3); z += q[2] * Math.min(k, 3); moved = true; } }
      // people (and soldiers) standing or walking: you can't go through them any more than through a wall (set each frame by main.js)
      if (you && this.bodies) for (const P of this.bodies) {
        if (yFeet + h < P[1] || yFeet > P[1] + 1.6) continue; const dx = x - P[0], dz = z - P[2], d = Math.hypot(dx, dz), Rr = r + 0.26; if (d >= Rr) continue;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0; x = P[0] + ux * Rr; z = P[2] + uz * Rr; moved = true;
      }
      for (const b of this.near(x, z)) {
        let [lx, lz] = this.toB(b, x, z);
        if (!this.inside(b, lx, lz, r + 0.5)) continue;
        const c = this.colliders(b), ly = yFeet - this.baseOf(b);
        const test = (box, isDoor) => {
          if (ly + h <= box[4] || ly + 0.3 >= box[5]) return;
          if (isDoor && (ownDoors || this.passable(b, box[6]))) return;
          const nx = Math.max(box[0], Math.min(lx, box[2])), nz = Math.max(box[1], Math.min(lz, box[3]));
          let dx = lx - nx, dz = lz - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) return;
          if (d2 < 1e-10) { // centre inside the box: push out along the shallowest axis
            const pen = [lx - box[0], box[2] - lx, lz - box[1], box[3] - lz], m = Math.min(...pen), i = pen.indexOf(m);
            dx = i === 0 ? -1 : i === 1 ? 1 : 0; dz = i === 2 ? -1 : i === 3 ? 1 : 0;
            const push = m + r; lx += dx * push; lz += dz * push;
            const [wx, wz] = this.fromBVec(b, dx * push, dz * push); x += wx; z += wz; moved = true; return;
          }
          const d = Math.sqrt(d2), push = r - d;
          lx += dx / d * push; lz += dz / d * push;
          const [wx, wz] = this.fromBVec(b, dx / d * push, dz / d * push); x += wx; z += wz; moved = true;
        };
        for (const wbox of c.walls) test(wbox, wbox[6] >= 0);
        for (const pbox of c.props) test(pbox, false);
        if (you) for (const pbox of c.soft) test(pbox, false);
      }
      // tree trunks and boulders out in the open (gen/flora.js): circles
      if (this.flora) sitesNear(this.planet, x, z, 14, S => { if (Math.abs(S.x - x) > S.clear + 60 || Math.abs(S.z - z) > S.clear + 60) return; for (const it of S.items) {     // the country's barns and masts (gen/outposts.js)
        if (it.live) continue;                                      // (you're close enough that it's a real building: see render/sitereal.js)
        if (it.box) {                                               // a building: its own walls, turned with it
          if (yFeet > it.y + (it.top ?? it.box[2] + 2.5) || yFeet + h < it.y - 1) continue;     // (a fence you can get over)
          const c = Math.cos(it.rot), s = Math.sin(it.rot), dx = x - it.x, dz = z - it.z, lx = dx * c - dz * s, lz = dx * s + dz * c, px = it.box[0] + r - Math.abs(lx), pz = it.box[1] + r - Math.abs(lz);
          if (px <= 0 || pz <= 0) continue;
          const ox = px < pz ? Math.sign(lx || 1) * px : 0, oz = px < pz ? 0 : Math.sign(lz || 1) * pz; x += ox * c + oz * s; z += -ox * s + oz * c; moved = true; continue;
        }
        if (!it.r || yFeet > it.y + 12 || yFeet + h < it.y) continue;
        const dx = x - it.x, dz = z - it.z, d = Math.hypot(dx, dz), R = r + it.r; if (d >= R) continue;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0; x = it.x + ux * R; z = it.z + uz * R; moved = true;
      } });
      if (this.flora && natural) floraNear(this.planet, x, z, r + 1.4, p => {
        if (!p.solid || p.felled || yFeet > p.y + p.size || yFeet + h < p.y) return;
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), R = r + p.solid;
        if (d >= R) return;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        x = p.x + ux * R; z = p.z + uz * R; moved = true;
      });
      // rocks: a low one you step up on, and once you're up on one you walk about on it (CollisionWorld.groundAt); its side, where that's
      // more than a step, stops you as a wall does (you climb it: player/controller.js)
      const rock = q => {
        if (yFeet > q.g + q.top - 0.05 || yFeet + h < q.y) return;
        if (rockSurface(q, x, z, true) <= yFeet + STEP + 0.02) return;
        const o = outOfRock(q, x, z, r, Math.max(q.y, yFeet + STEP), yFeet + h); if (o) { x = o[0]; z = o[1]; moved = true; }      // (its side where it'd meet you: above your step, below your head)
      };
      if (this.flora && natural) { rocksNear(this.planet, x, z, r + 2, rock); ledgesNear(this.planet, x, z, r + 2, rock); }      // (and the rock standing out of a steep hillside)
      if (!moved) break;
    }
    return [x, z];
  }

  // Something to climb onto just ahead: a surface 0.55–2.2 m above the feet (furniture
  // top, a terrain step, a low roof) with room to crouch on it. Reads only collision
  // data (plans, ground), never meshes. → { top, x, z } or null
  ledgeAhead(x, y, z, facing, reach = 2.2) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    if (this.solidAt(x, y + 1.95, z, 0.05)) return null;             // no room to reach up
    for (const d of [0.5, 0.75, 1.0]) {
      const px = x + fx * d, pz = z + fz * d;
      const top = this.groundAt(px, pz, y + reach - STEP).h, rise = top - y;
      if (rise < 0.55 || rise > reach) continue;
      if (this.ceilingAt(px, pz, top) < top + 1.2) continue;
      let clear = true;
      for (const hy of [0.2, 0.7, 1.1]) if (this.solidAt(px, top + hy, pz, 0.05)) clear = false;
      if (clear && this.resolve(px, pz, top + 0.02).every((v, i) => Math.abs(v - [px, pz][i]) < 0.15)) return { top, x: px, z: pz };
    }
    return null;
  }

  // Something low ahead with a far side to come down on, to vault at a run: a sandbag wall, a fence, a car's bonnet, a low stone,
  // a wall at waist height. What's there is found the way a body would find it: where the land or a top rises in front, or where
  // something stops a foot put out at that height (resolve). → { to (feet, the far side), E (near edge, on top), top, n } or null
  vaultAhead(x, y, z, facing, most = 1.3) {
    const fx = Math.sin(facing), fz = Math.cos(facing), n = [-fx, 0, -fz];
    const blockedAt = (px, pz, yy) => { const q = this.resolve(px, pz, yy, 0.1, 0.1, false, false); return Math.abs(q[0] - px) + Math.abs(q[1] - pz) > 0.02; };
    // how high what's at (px, pz) stands above your feet: a top you could stand on, or how high a foot has to be to clear it
    const height = (px, pz) => { let H = this.groundAt(px, pz, y + most + 0.4 - STEP).h - y; if (H > most + 0.3) return H;
      for (let hy = 0.15; hy <= most + 0.3; hy += 0.15) { if (!blockedAt(px, pz, y + hy)) { if (hy > 0.2) H = Math.max(H, hy + 0.1); return H; } } return most + 1; };
    let near = -1, top = 0, far = -1;
    for (let d = 0.25; d <= 1.3; d += 0.1) { const H = height(x + fx * d, z + fz * d); if (H >= 0.45) { near = d; break; } }
    if (near < 0) return null;
    for (let d = near; d <= near + 1.7; d += 0.1) { const H = height(x + fx * d, z + fz * d); if (H > most) return null; if (H < 0.4) { far = d; break; } top = Math.max(top, H); }
    if (far < 0 || top < 0.45) return null;
    const lx = x + fx * (far + 0.45), lz = z + fz * (far + 0.45), g = this.groundAt(lx, lz, y + 0.5).h;
    if (g < y - 1.6 || g > y + 0.45) return null;
    const cl = this.resolve(lx, lz, g, 0.32, 1.75, false, false); if (Math.hypot(cl[0] - lx, cl[1] - lz) > 0.06) return null;
    for (const d of [near, (near + far) / 2, far]) if (this.hardAt(x + fx * d, y + top + 1.1, z + fz * d) || this.hardAt(x + fx * d, y + top + 0.6, z + fz * d)) return null;      // (room to go over)
    return { to: [lx, g, lz], E: [x + fx * near, y + top, z + fz * near], top: y + top, n, depth: far - near };
  }
  // A stone just ahead too tall to pull yourself onto (its side, where you'd meet it, more than 2 m up): to climb it. → the stone, or null
  rockAhead(x, y, z, facing) {
    if (!this.flora) return null; const fx = Math.sin(facing), fz = Math.cos(facing); let best = null, bd = Infinity;
    rocksNear(this.planet, x + fx * 0.7, z + fz * 0.7, 0.9, q => { if (q.shape === undefined || q.gx !== undefined) return;
      const rim = rockSurface(q, x, z, true); if (rim < y + 2.0 || q.y > y + 0.5) return;
      if (!outOfRock(q, x + fx * 0.6, z + fz * 0.6, 0.35)) return;
      const d = Math.hypot(q.x - x, q.z - z) - q.r; if (d < bd) { bd = d; best = q; } });
    return best;
  }

  // Is the point inside solid geometry (camera collision)?
  solidAt(x, y, z, pad = 0.15, ground = true) {      // (ground false: only what's built, not the land)
    if (y > SPACE) return false;
    if (ground && y < surfaceHeight(this.planet, x, z) + 0.15) return true;
    let hit = false;
    this.cityNear(x, z, pad, (box, u, v) => { if (!hit && y > box[4] - pad && y < box[5] + pad && inBox(box, u, v, pad)) hit = true; });
    if (hit) return true;
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz, pad + 0.5)) continue;
      const c = this.colliders(b), ly = y - this.baseOf(b);
      if (pad < 0.05 && c.wins.some(w => ly > w[4] && ly < w[5] && lx > w[0] && lx < w[2] && lz > w[1] && lz < w[3])) continue;      // (a point in a window opening: a round's way through)
      for (const w of c.walls) {
        if (ly < w[4] - pad || ly > w[5] + pad) continue;
        if (w[6] >= 0 && this.passable(b, w[6]) && ly < c.plan.doors[w[6]].height + c.plan.doors[w[6]].k * c.plan.H) continue;
        if (lx > w[0] - pad && lx < w[2] + pad && lz > w[1] - pad && lz < w[3] + pad) return true;
      }
      if (this.inside(b, lx, lz)) for (const sl of c.plan.slabs) {
        if (ly < sl.y - SLAB_T - pad || ly > sl.y + pad) continue;
        for (const r of sl.rects) if (lx >= r[0] && lx <= r[2] && lz >= r[1] && lz <= r[3]) return true;
      }
    }
    return false;
  }

  // Is this point inside anything a round would stop in: the land, a wall or floor, a standing car, a memorial stone, a tree's
  // trunk, a rock? (What resolve() keeps bodies out of, as points.)
  hardAt(x, y, z) {
    if (y > SPACE) return false;
    if (y < surfaceHeight(this.planet, x, z)) return true;
    if (this.solidAt(x, y, z, 0.02, false)) return true;
    if (this.carBoxes) for (const V of this.carBoxes) { const dx = x - V.x, dz = z - V.z; if (Math.abs(dx) > V.reach || Math.abs(dz) > V.reach || y > V.y + V.h || y < V.y) continue; if (Math.abs(dx * V.fx + dz * V.fz) < V.hl && Math.abs(dx * V.fz - dz * V.fx) < V.hw) return true; }
    if (this.stones) for (const S of this.stones) if (y >= S.y && y <= S.y + S.h && Math.hypot(x - S.x, z - S.z) < S.r) return true;
    if (this.hulks) for (const H of this.hulks) if (hulkSolid(H, x, y, z)) return true;
    if (!this.flora) return false;
    let hit = false;
    floraNear(this.planet, x, z, 1.4, p => { if (!hit && p.solid && !p.felled && y >= p.y && y <= p.y + Math.max(2.5, p.size) && Math.hypot(x - p.x, z - p.z) < p.solid) hit = true; });
    if (hit) return true;
    const rock = q => { if (!hit && rockSolid(q, x, y, z)) hit = true; };
    rocksNear(this.planet, x, z, 2, rock); if (!hit) ledgesNear(this.planet, x, z, 2, rock);
    return hit;
  }
  // The first thing a round from o (a point) along dir (unit) meets within `far`: how far along, or null. Sampled every `step`.
  rayHard(o, dir, far, step = 0.2, from = 0.3) {
    for (let d = from; d < far; d += step) if (this.hardAt(o[0] + dir[0] * d, o[1] + dir[1] * d, o[2] + dir[2] * d)) return d;
    return null;
  }

  // The window openings a round from a to b (world points) goes through: [{ b, w (the colliders' window box), p (world point in it) }]
  windowsOn(a, b) {
    const out = [], seen = new Set(), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); if (!(L > 0.2) || a[1] > SPACE) return out;
    for (let d = 0; d <= L + 3; d += 3) { const f = Math.min(1, d / L), x = a[0] + (b[0] - a[0]) * f, z = a[2] + (b[2] - a[2]) * f;
      for (const B of this.near(x, z)) { if (seen.has(B) || B.type === 'ship') continue; seen.add(B); const c = this.colliders(B); if (!c.wins.length) continue;
        const [ax, az] = this.toB(B, a[0], a[2]), [bx, bz] = this.toB(B, b[0], b[2]), base = this.baseOf(B), ay = a[1] - base, by = b[1] - base;
        for (const w of c.wins) { const alongX = w[6].z0 === w[6].z1, c0 = alongX ? (w[1] + w[3]) / 2 : (w[0] + w[2]) / 2, p0 = alongX ? az : ax, p1 = alongX ? bz : bx; if ((p0 - c0) * (p1 - c0) > 0 || p0 === p1) continue;
          const t = (c0 - p0) / (p1 - p0), lx = ax + (bx - ax) * t, lz = az + (bz - az) * t, ly = ay + (by - ay) * t; if (ly < w[4] || ly > w[5] || (alongX ? lx < w[0] || lx > w[2] : lz < w[1] || lz > w[3])) continue;
          out.push({ b: B, w, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }); } } }
    return out;
  }

  // Which building/floor/room is this point in (for HUD, lights, interaction)?
  locate(x, y, z) {
    if (y > SPACE) return null;
    let outside = null;      // (over or under one structure, maybe inside another stacked with it: the one you're in wins)
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz)) continue;
      const { plan } = this.colliders(b);
      const ly = y - this.baseOf(b) + 0.05;
      if (ly < -0.3 || ly > plan.F * plan.H) { outside ||= { b, roof: ly >= plan.F * plan.H }; continue; }
      const k = Math.max(0, Math.min(plan.F - 1, Math.floor(ly / plan.H)));
      const room = plan.rooms.find(r => r.k === k && lx >= r.rect[0] && lx <= r.rect[2] && lz >= r.rect[1] && lz <= r.rect[3]);
      return { b, plan, k, room, lx, lz };
    }
    return outside;
  }
}
