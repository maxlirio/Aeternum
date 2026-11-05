// Collision against the same data the renderer draws: the graded ground surface plus
// building plans (walls with door gaps, floor slabs, stair ramps, furniture).
// Buildings are axis-aligned in their own frame, so every test is circle-vs-AABB in
// building-local coordinates. No three.js here.
import { surfaceHeight } from '../gen/surface.js';
import { buildingPlan, SLAB_T } from '../gen/building.js';
import { PLINTH } from '../core/units.js';
import { floraNear } from '../gen/flora.js';
import { rocksNear } from '../gen/rocks.js';
import { towerOf } from '../gen/towers.js';
import { sitesNear } from '../gen/outposts.js';
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
const GRID = 16;

export class CollisionWorld {
  constructor(planet, s, doorPassable) {
    this.planet = planet; this.s = s; this.doorPassable = doorPassable;
    this.base = s.h + PLINTH;
    this.flora = true;           // trees and boulders block (tests of town-only collision can turn it off)
    this.city = getCity(planet);
    this.cols = new Map();       // building n (or structure key) -> collider set
    this.grid = new Map();
    for (const b of s.buildings) this.index(b, true);
  }
  index(b, add) {
    const [x0, z0, x1, z1] = b.rect;
    for (let gx = Math.floor((x0 - 1) / GRID); gx <= Math.floor((x1 + 1) / GRID); gx++)
      for (let gz = Math.floor((z0 - 1) / GRID); gz <= Math.floor((z1 + 1) / GRID); gz++) {
        const k = gx + ',' + gz, cell = this.grid.get(k) || this.grid.set(k, []).get(k);
        if (add) cell.push(b); else { const i = cell.indexOf(b); if (i >= 0) cell.splice(i, 1); }
      }
  }
  // Something building-like that isn't part of the town plan — a landed ship. It brings
  // its own frame (O, ex, ez, rect in settlement space), floor height (base), plan and
  // door rule (doorPassable(id)).
  addStructure(b) { this.index(b, true); }
  removeStructure(b) { this.index(b, false); }
  baseOf(b) { return b.base ?? this.base; }
  passable(b, id) { return b.doorPassable ? b.doorPassable(id) : this.doorPassable(b, id); }

  near(x, z) {
    const [u, v] = this.s.toLocal(x, z);
    return this.grid.get(Math.floor(u / GRID) + ',' + Math.floor(v / GRID)) || [];
  }
  toB(b, x, z) {
    const [u, v] = this.s.toLocal(x, z), du = u - b.O[0], dv = v - b.O[1];
    return [du * b.ex[0] + dv * b.ex[1], du * b.ez[0] + dv * b.ez[1]];
  }
  fromBVec(b, lx, lz) {   // building-local vector → world vector
    const u = lx * b.ex[0] + lz * b.ez[0], v = lx * b.ex[1] + lz * b.ez[1];
    return [u * this.s.cos - v * this.s.sin, u * this.s.sin + v * this.s.cos];
  }

  colliders(b) {
    let c = this.cols.get(b.plan ? b.key : b.n);
    if (c) return c;
    const plan = b.plan || buildingPlan(this.planet, this.s, b);
    const walls = [];
    for (const wl of plan.walls) {
      const alongX = wl.z0 === wl.z1, t = wl.t / 2;
      const a0 = alongX ? wl.x0 : wl.z0, a1 = alongX ? wl.x1 : wl.z1, cc = alongX ? wl.z0 : wl.x0;
      const add = (p, q, door) => { if (q - p > 0.001) walls.push(alongX ? [p, cc - t, q, cc + t, wl.y0, wl.y1, door] : [cc - t, p, cc + t, q, wl.y0, wl.y1, door]); };
      let cur = a0;
      for (const o of wl.openings.filter(o => o.kind === 'door').sort((p, q) => p.a - q.a)) {
        add(cur, o.a, -1); add(o.a, o.b, o.door); cur = o.b;
      }
      add(cur, a1, -1);
      if (wl.exterior && wl.k === plan.F - 1 && !b.footing) { // roof parapet
        const top = plan.F * plan.H;
        walls.push(alongX ? [a0, cc - t, a1, cc + t, top, top + 0.7, -1] : [cc - t, a0, cc + t, a1, top, top + 0.7, -1]);
      }
    }
    if (b.footing) for (const q of [[0, 0, b.w, 0.2], [0, b.d - 0.2, b.w, b.d], [0, 0, 0.2, b.d], [b.w - 0.2, 0, b.w, b.d]]) walls.push([...q, -4, 0, -1]);   // (what it stands on, where the ground falls away)
    const props = plan.props.filter(p => !p.soft).map(p => [p.x0, p.z0, p.x1, p.z1, p.y, p.y + p.h]).concat(plan.solids || []);
    c = { b, plan, walls, props };
    this.cols.set(b.plan ? b.key : b.n, c);
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
    let best = surfaceHeight(this.planet, x, z), where = null;
    // the roof of a standing car; the deck of a watchtower
    if (this.carBoxes) for (const V of this.carBoxes) { if (!V.roof || Math.abs(x - V.x) > V.reach || Math.abs(z - V.z) > V.reach) continue; const dx = x - V.x, dz = z - V.z, top = V.y + V.h; if (top <= yFeet + STEP && top > best && Math.abs(dx * V.fx + dz * V.fz) < V.hl && Math.abs(dx * V.fz - dz * V.fx) < V.hw) { best = top; where = { car: true, roof: true, V }; } }
    if (this.flora) sitesNear(this.planet, x, z, 6, S => { if (Math.abs(S.x - x) > S.clear + 60 || Math.abs(S.z - z) > S.clear + 60) return; for (const it of S.items) { if (!/watchtower/.test(it.k) || Math.abs(it.x - x) > 4 || Math.abs(it.z - z) > 4) continue; const T = towerOf(this.planet, it); if (!T?.deck) continue; const top = it.y + T.deck.y, c = Math.cos(it.rot || 0), s = Math.sin(it.rot || 0), dx = x - it.x, dz = z - it.z; if (top <= yFeet + STEP && top > best && Math.abs(dx * c - dz * s) < T.deck.half && Math.abs(dx * s + dz * c) < T.deck.half) { best = top; where = { deck: true, roof: true }; } } });
    this.cityNear(x, z, 0, (box, u, v) => { if (box[5] <= yFeet + STEP && box[5] > best && inBox(box, u, v)) { best = box[5]; where = { city: true, roof: box[5] - box[4] > 2 }; } });
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
    return { h: best, where };
  }

  // Lowest ceiling above the head at (x, z), or Infinity.
  ceilingAt(x, z, yFeet) {
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
  resolve(x, z, yFeet, r = 0.32, h = 1.75) {
    const C = this.city;
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
      for (const b of this.near(x, z)) {
        let [lx, lz] = this.toB(b, x, z);
        if (!this.inside(b, lx, lz, r + 0.5)) continue;
        const c = this.colliders(b), ly = yFeet - this.baseOf(b);
        const test = (box, isDoor) => {
          if (ly + h <= box[4] || ly + 0.3 >= box[5]) return;
          if (isDoor && this.passable(b, box[6])) return;
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
      if (this.flora) floraNear(this.planet, x, z, r + 1.4, p => {
        if (!p.solid || p.felled || yFeet > p.y + p.size || yFeet + h < p.y) return;
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), R = r + p.solid;
        if (d >= R) return;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        x = p.x + ux * R; z = p.z + uz * R; moved = true;
      });
      // rocks: you can get over a low one (a step, a jump); a big one you go round
      if (this.flora) rocksNear(this.planet, x, z, r + 2, q => {
        if (yFeet > q.y + q.top || yFeet + h < q.y) return;
        const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz), R = r + q.r;
        if (d >= R) return;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        x = q.x + ux * R; z = q.z + uz * R; moved = true;
      });
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

  // Is the point inside solid geometry (camera collision)?
  solidAt(x, y, z, pad = 0.15) {
    if (y < surfaceHeight(this.planet, x, z) + 0.15) return true;
    let hit = false;
    this.cityNear(x, z, pad, (box, u, v) => { if (!hit && y > box[4] - pad && y < box[5] + pad && inBox(box, u, v, pad)) hit = true; });
    if (hit) return true;
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz, pad + 0.5)) continue;
      const c = this.colliders(b), ly = y - this.baseOf(b);
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

  // Which building/floor/room is this point in (for HUD, lights, interaction)?
  locate(x, y, z) {
    for (const b of this.near(x, z)) {
      const [lx, lz] = this.toB(b, x, z);
      if (!this.inside(b, lx, lz)) continue;
      const { plan } = this.colliders(b);
      const ly = y - this.baseOf(b) + 0.05;
      if (ly < -0.3 || ly > plan.F * plan.H) return { b, roof: ly >= plan.F * plan.H };
      const k = Math.max(0, Math.min(plan.F - 1, Math.floor(ly / plan.H)));
      const room = plan.rooms.find(r => r.k === k && lx >= r.rect[0] && lx <= r.rect[2] && lz >= r.rect[1] && lz <= r.rect[3]);
      return { b, plan, k, room, lx, lz };
    }
    return null;
  }
}
