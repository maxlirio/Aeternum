// Collision against the same data the renderer draws: the graded ground surface plus
// building plans (walls with door gaps, floor slabs, stair ramps, furniture).
// Buildings are axis-aligned in their own frame, so every test is circle-vs-AABB in
// building-local coordinates. No three.js here.
import { surfaceHeight } from '../gen/surface.js';
import { buildingPlan, SLAB_T } from '../gen/building.js';
import { PLINTH } from '../core/units.js';

export const STEP = 0.5;
const GRID = 16;

export class CollisionWorld {
  constructor(planet, s, doorPassable) {
    this.planet = planet; this.s = s; this.doorPassable = doorPassable;
    this.base = s.h + PLINTH;
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
      if (wl.exterior && wl.k === plan.F - 1) { // roof parapet
        const top = plan.F * plan.H;
        walls.push(alongX ? [a0, cc - t, a1, cc + t, top, top + 0.7, -1] : [cc - t, a0, cc + t, a1, top, top + 0.7, -1]);
      }
    }
    const props = plan.props.filter(p => !p.soft).map(p => [p.x0, p.z0, p.x1, p.z1, p.y, p.y + p.h]);
    c = { b, plan, walls, props };
    this.cols.set(b.plan ? b.key : b.n, c);
    return c;
  }

  inside(b, lx, lz, m = 0) { return lx >= -m && lz >= -m && lx <= b.w + m && lz <= b.d + m; }

  // Highest walkable surface at (x, z) no higher than yFeet + STEP.
  groundAt(x, z, yFeet) {
    let best = surfaceHeight(this.planet, x, z), where = null;
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
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
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
