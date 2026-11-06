// Turns a building plan (gen/building.js) into geometry in a MeshBuilder.
// Static parts only: shell, slabs, walls with real openings, glass, stairs, fittings,
// furniture. Door leaves are dynamic and live in render/doors.js.
import { materials, WINDOW_TYPES } from './materials.js';
import { subFrame } from './meshbuilder.js';
import { SLAB_T, EXT_T } from '../gen/building.js';
import { Rng } from '../core/prng.js';
import { seedFromString } from '../core/hash.js';

const PALETTE = {
  hab: [[0.86, 0.80, 0.68], [0.78, 0.76, 0.70], [0.66, 0.60, 0.50], [0.82, 0.70, 0.56], [0.58, 0.64, 0.66], [0.72, 0.56, 0.44]],
  office: [[0.50, 0.54, 0.58], [0.42, 0.45, 0.49], [0.64, 0.64, 0.62], [0.36, 0.40, 0.44]],
  store: [[0.78, 0.66, 0.50], [0.54, 0.66, 0.64], [0.80, 0.78, 0.72], [0.70, 0.52, 0.44], [0.46, 0.52, 0.60]],
  house: [[0.84, 0.74, 0.60], [0.70, 0.68, 0.62], [0.62, 0.56, 0.48], [0.76, 0.62, 0.50]],
  workshop: [[0.62, 0.64, 0.66], [0.50, 0.56, 0.60], [0.58, 0.60, 0.50], [0.70, 0.66, 0.58]],
  hangar: [[0.62, 0.64, 0.66], [0.52, 0.55, 0.58], [0.66, 0.62, 0.55]],
};
const ROOM_TINT = [[1, 1, 1], [0.95, 0.97, 1], [1, 0.97, 0.92], [0.93, 0.96, 0.93], [0.98, 0.94, 0.94]];
const FABRIC = [[0.32, 0.38, 0.46], [0.5, 0.33, 0.28], [0.42, 0.44, 0.40], [0.62, 0.58, 0.50], [0.22, 0.24, 0.27]];
const WHITE = [1, 1, 1];

// Faces of an exterior wall that point outside.
const OUTER = { front: 'nz', back: 'pz', left: 'nx', right: 'px' };

// What a building's outside is made of, and its colour. (The first thing its generator draws, so a distant block matches the real one.)
export function facadeOf(b, M) {
  const rng = new Rng(seedFromString(b.key)), corr = b.type === 'workshop' || b.type === 'hangar';
  return { mat: corr ? M.corrugated : M.panels, col: rng.pick(PALETTE[b.type]) };
}

export function buildBuilding(mb, plan, b, frame) {
  // a designed building (gen/housegen.js) wears its design's materials; what stands outside its walls (roof, porch, footing) comes from render/housegen.js
  const skin = b.skin, M = skin ? { ...materials(), trim: skin.trim, darkTrim: skin.trim, ...(skin.floor ? { tiles: skin.floor } : {}) } : materials();
  mb.setFrame(...frame);
  const rng = new Rng(seedFromString(b.key));
  const corr = b.type === 'workshop' || b.type === 'hangar';
  const facade = skin ? skin.wall : corr ? M.corrugated : M.panels;
  const fcol = skin ? WHITE : rng.pick(PALETTE[b.type]);
  const typeIdx = WINDOW_TYPES.indexOf(b.type);
  const { w, d, F, H } = plan;
  const top = F * H;

  // plinth (the graded ground is 0.2 below the ground floor)
  if (!skin) mb.box(M.concrete, -0.15, -0.8, -0.15, w + 0.15, 0.0, d + 0.15, [0.8, 0.8, 0.78], new Set(['py']));

  // slabs: tiled floors on top, plaster ceilings underneath, concrete edges
  for (const sl of plan.slabs) {
    for (const r of sl.rects) {
      const [x0, z0, x1, z1] = r;
      if (sl.roof && skin) { mb.quad(M.plaster, [[x0, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z1], [x0, sl.y - SLAB_T, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], WHITE); continue; }
      if (sl.roof) mb.box(M.concrete, x0, sl.y - SLAB_T, z0, x1, sl.y, z1, [0.62, 0.62, 0.6], new Set(['ny']));
      else mb.box({ py: M.tiles, default: M.concrete }, x0, sl.y - (sl.k === 0 ? 0.02 : SLAB_T), z0, x1, sl.y, z1, rng.pick(ROOM_TINT), new Set(['ny']));
      if (sl.k > 0) mb.quad(M.plaster, [[x0, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z1], [x0, sl.y - SLAB_T, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], WHITE);
    }
  }

  // walls with openings
  const intTint = rng.pick(ROOM_TINT);
  for (const wl of plan.walls) wallGeometry(mb, M, wl, wl.exterior ? { [OUTER[wl.side]]: facade, default: M.plaster } : M.plaster, wl.exterior ? fcol : intTint, typeIdx, rng, plan);

  // storey bands, parapet and roof kit
  for (let k = 1; k <= F && !skin; k++) {
    const y = k * H;
    if (k === F) continue;            // the parapet caps the top
    mb.box(M.trim, -0.04, y - 0.1, -0.04, w + 0.04, y + 0.02, 0.0, WHITE);
    mb.box(M.trim, -0.04, y - 0.1, d, w + 0.04, y + 0.02, d + 0.04, WHITE);
    mb.box(M.trim, -0.04, y - 0.1, 0, 0.0, y + 0.02, d, WHITE);
    mb.box(M.trim, w, y - 0.1, 0, w + 0.04, y + 0.02, d, WHITE);
  }
  const par = 0.7;
  if (!skin) {
  mb.box({ default: facade, py: M.trim }, 0, top, 0, w, top + par, EXT_T, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, 0, top, d - EXT_T, w, top + par, d, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, 0, top, EXT_T, EXT_T, top + par, d - EXT_T, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, w - EXT_T, top, EXT_T, w, top + par, d - EXT_T, fcol, new Set(['ny']));
  exteriorDetail(mb, M, plan, b, rng, facade, fcol);
  const units = Math.floor(w * d / 120) + 1;
  for (let i = 0; i < units; i++) {
    const ux = rng.range(1.5, w - 3.5), uz = rng.range(1.5, d - 3.5), uw = rng.range(1.2, 2.2), ud = rng.range(1.0, 2.0), uh = rng.range(0.7, 1.4);
    mb.box(M.metal, ux, top, uz, ux + uw, top + uh, uz + ud, [0.7, 0.72, 0.74]);
    mb.box(M.darkTrim, ux + 0.15, top + uh, uz + 0.15, ux + uw - 0.15, top + uh + 0.05, uz + ud - 0.15, WHITE);
  }
  if (b.type === 'office') { // comms mast
    const mx = w * 0.3, mz = d * 0.6;
    mb.box(M.trim, mx - 0.08, top, mz - 0.08, mx + 0.08, top + 7, mz + 0.08, WHITE);
    mb.box(M.trim, mx - 0.6, top + 5.5, mz - 0.03, mx + 0.6, top + 5.56, mz + 0.03, WHITE);
  }
  if (b.type === 'store' || b.type === 'office') { // entrance canopy
    const ent = plan.doors[plan.entrance];
    mb.box({ default: M.darkTrim, py: M.trim }, ent.x - 2.4, 3.0, -1.6, ent.x + 2.4, 3.15, 0, WHITE);
    mb.quad(M.lightPanel, [[ent.x - 0.8, 2.995, -1.0], [ent.x + 0.8, 2.995, -1.0], [ent.x + 0.8, 2.995, -0.6], [ent.x - 0.8, 2.995, -0.6]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE);
  }
  }

  // stairs
  for (const r of plan.ramps) {
    const n = Math.max(8, Math.round(Math.abs(r.y1 - r.y0) / 0.18));
    const run = (r.z1 - r.z0) / n, up = r.y1 > r.y0, base = Math.min(r.y0, r.y1), rise = Math.abs(r.y1 - r.y0) / n;
    for (let i = 0; i < n; i++) {
      const zA = up ? r.z0 + i * run : r.z1 - (i + 1) * run;
      mb.box({ default: M.concrete, py: M.tiles }, r.x0, base + i * rise, zA, r.x1, base + (i + 1) * rise, zA + run, [0.75, 0.75, 0.74]);
    }
    // underside soffit
    const zs = up ? [r.z0, r.z1] : [r.z1, r.z0];
    mb.quad(M.concrete, [[r.x1, base - 0.2, zs[0]], [r.x0, base - 0.2, zs[0]], [r.x0, base + Math.abs(r.y1 - r.y0) - 0.2, zs[1]], [r.x1, base + Math.abs(r.y1 - r.y0) - 0.2, zs[1]]], [0, -0.8, up ? 0.6 : -0.6], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.7, 0.7, 0.7]);
  }

  // ceiling light panel in every room
  for (const room of plan.rooms) {
    const [x0, z0, x1, z1] = room.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = (room.k + 1) * H - SLAB_T - 0.01;
    const hw = Math.min(0.9, (x1 - x0) / 4), hd = Math.min(0.3, (z1 - z0) / 6);
    mb.quad(M.lightPanel, [[cx - hw, y, cz - hd], [cx + hw, y, cz - hd], [cx + hw, y, cz + hd], [cx - hw, y, cz + hd]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE);
  }

  roomDecor(mb, M, plan, b, rng);

  // furniture
  const saved = [mb.o, mb.ex, mb.ez];
  for (const pr of plan.props) { buildProp(mb, M, pr, rng); mb.setFrame(...saved); }
}

// What makes a room look lived in, drawn only (no collision, no gameplay): skirting
// boards, rugs, pictures, floor lamps, kitchen splashbacks, office pin boards.
const ART = [[0.62, 0.35, 0.22], [0.2, 0.36, 0.5], [0.72, 0.62, 0.3], [0.3, 0.45, 0.32], [0.55, 0.25, 0.32], [0.82, 0.8, 0.74]];
function roomDecor(mb, M, plan, b, rng) {
  const home = b.type === 'hab' || b.type === 'house';
  for (const room of plan.rooms) {
    const [x0, z0, x1, z1] = room.rect, y = room.k * plan.H, ins = 0.11;
    const doorsOn = (axis, c) => room.doors.map(id => plan.doors[id]).filter(d => d && d.k === room.k && (axis === 'x' ? Math.abs(d.z - c) < 0.4 && d.axis !== 'z' : Math.abs(d.x - c) < 0.4 && d.axis === 'z'));
    // skirting, broken at doorways
    const run = (axis, c, a0, a1, out) => {
      const gaps = doorsOn(axis, c).map(d => axis === 'x' ? [d.x - d.width / 2, d.x + d.width / 2] : [d.z - d.width / 2, d.z + d.width / 2]).sort((p, q) => p[0] - q[0]);
      let cur = a0;
      for (const [g0, g1] of [...gaps, [a1, a1]]) {
        if (g0 - cur > 0.05) {
          if (axis === 'x') mb.box(M.darkTrim, cur, y, c + out * ins - 0.008, g0, y + 0.08, c + out * ins + 0.008, [0.75, 0.75, 0.75]);
          else mb.box(M.darkTrim, c + out * ins - 0.008, y, cur, c + out * ins + 0.008, y + 0.08, g0, [0.75, 0.75, 0.75]);
        }
        cur = Math.max(cur, g1);
      }
    };
    if (home || b.type === 'office') { run('x', z0, x0 + ins, x1 - ins, 1); run('x', z1, x0 + ins, x1 - ins, -1); run('z', x0, z0 + ins, z1 - ins, 1); run('z', x1, z0 + ins, z1 - ins, -1); }
    const p = room.purpose, w = x1 - x0, d = z1 - z0;
    if (b.type === 'office' && w > 2.2 && d > 2.2) mb.box(M.carpet, x0 + 0.03, y + 0.002, z0 + 0.03, x1 - 0.03, y + 0.01, z1 - 0.03, [0.62, 0.64, 0.7]);     // offices are carpeted
    if (home && (p === 'living' || p === 'bedroom' || p === 'studio') && w > 2.5 && d > 2.5) {
      const rw = Math.min(2.6, w * 0.5), rd = Math.min(1.8, d * 0.45), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      mb.box(M.carpet, cx - rw / 2, y + 0.002, cz - rd / 2, cx + rw / 2, y + 0.014, cz + rd / 2, rng.pick(FABRIC));                       // rug
      mb.box(M.fabric, cx - rw / 2 + 0.08, y + 0.014, cz - rd / 2 + 0.08, cx + rw / 2 - 0.08, y + 0.016, cz + rd / 2 - 0.08, rng.pick(FABRIC));   // its border
    }
    if (home || b.type === 'office') {   // a picture or two, on walls without doors
      const n = home ? rng.int(1, 2) : rng.int(0, 1);
      for (let k = 0; k < n; k++) {
        const side = rng.int(0, 3), fw = rng.range(0.4, 0.9), fh = rng.range(0.35, 0.7), yc = y + rng.range(1.45, 1.7);
        const along = side < 2 ? [x0 + 0.6, x1 - 0.6 - fw] : [z0 + 0.6, z1 - 0.6 - fw]; if (along[1] <= along[0]) continue;
        const a = rng.range(along[0], along[1]), c = side === 0 ? z0 + ins : side === 1 ? z1 - ins : side === 2 ? x0 + ins : x1 - ins, o = side === 0 || side === 2 ? 1 : -1;
        if (doorsOn(side < 2 ? 'x' : 'z', side === 0 ? z0 : side === 1 ? z1 : side === 2 ? x0 : x1).some(dd => { const dc = side < 2 ? dd.x : dd.z; return dc + dd.width / 2 + 0.2 > a && dc - dd.width / 2 - 0.2 < a + fw; })) continue;
        const art = rng.pick(ART), frame = rng.chance(0.5) ? [0.15, 0.13, 0.12] : [0.75, 0.7, 0.62];
        if (side < 2) mb.box(M.wood, a, yc - fh / 2, c + o * 0.0, a + fw, yc + fh / 2, c + o * 0.03, frame);
        else mb.box(M.wood, c, yc - fh / 2, a, c + o * 0.03, yc + fh / 2, a + fw, frame);
        // the painting itself: one cell of the 4 × 4 atlas on a quad facing into the room
        const cell = rng.int(0, 15), u0 = (cell % 4) / 4 + 0.01, u1 = u0 + 0.23, v1 = 1 - Math.floor(cell / 4) / 4 - 0.01, v0 = v1 - 0.23;
        const m0 = a + 0.05, m1 = a + fw - 0.05, q0 = yc - fh / 2 + 0.05, q1 = yc + fh / 2 - 0.05, f = c + o * 0.034, uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        if (!M.art) mb.box(M.plaster, side < 2 ? m0 : f, q0, side < 2 ? f : m0, side < 2 ? m1 : f + o * 0.002, q1, side < 2 ? f + o * 0.002 : m1, art);
        else if (side === 0) mb.quad(M.art, [[m0, q0, f], [m1, q0, f], [m1, q1, f], [m0, q1, f]], [0, 0, 1], uv, WHITE);
        else if (side === 1) mb.quad(M.art, [[m1, q0, f], [m0, q0, f], [m0, q1, f], [m1, q1, f]], [0, 0, -1], uv, WHITE);
        else if (side === 2) mb.quad(M.art, [[f, q0, m1], [f, q0, m0], [f, q1, m0], [f, q1, m1]], [1, 0, 0], uv, WHITE);
        else mb.quad(M.art, [[f, q0, m0], [f, q0, m1], [f, q1, m1], [f, q1, m0]], [-1, 0, 0], uv, WHITE);
      }
    }
    if (home && (p === 'living' || p === 'studio') && rng.chance(0.7)) {   // floor lamp in a corner
      const lx = rng.chance(0.5) ? x0 + 0.35 : x1 - 0.35, lz = rng.chance(0.5) ? z0 + 0.35 : z1 - 0.35;
      mb.box(M.darkTrim, lx - 0.13, y, lz - 0.13, lx + 0.13, y + 0.03, lz + 0.13, WHITE);
      mb.box(M.darkTrim, lx - 0.012, y + 0.03, lz - 0.012, lx + 0.012, y + 1.45, lz + 0.012, WHITE);
      mb.box(M.fabric, lx - 0.17, y + 1.45, lz - 0.17, lx + 0.17, y + 1.72, lz + 0.17, [0.92, 0.88, 0.78]);
    }
    if (p === 'kitchen' || p === 'studio' || p === 'livingkitchen') {   // splashback tiles behind the counters
      for (const pr of plan.props) {
        if (pr.room !== room.i || pr.k !== room.k || pr.kind !== 'counter') continue;
        const yA = y + pr.h + 0.01, yB = yA + 0.55;
        if (pr.face === 2) mb.box(M.tiles, pr.x0, yA, pr.z0 - 0.0, pr.x1, yB, pr.z0 + 0.012, [0.9, 0.92, 0.93]);
        else if (pr.face === 0) mb.box(M.tiles, pr.x0, yA, pr.z1 - 0.012, pr.x1, yB, pr.z1, [0.9, 0.92, 0.93]);
        else if (pr.face === 1) mb.box(M.tiles, pr.x0, yA, pr.z0, pr.x0 + 0.012, yB, pr.z1, [0.9, 0.92, 0.93]);
        else mb.box(M.tiles, pr.x1 - 0.012, yA, pr.z0, pr.x1, yB, pr.z1, [0.9, 0.92, 0.93]);
      }
    }
    if (p === 'office' && rng.chance(0.6) && w > 2) {   // pin board with notes
      const bx = x0 + 0.5, by = y + 1.2;
      mb.box(M.wood, bx, by, z1 - ins - 0.02, bx + 1.2, by + 0.8, z1 - ins, [0.7, 0.55, 0.38]);
      for (let k = 0; k < 6; k++) { const nx = bx + 0.1 + rng.next() * 0.9, ny = by + 0.1 + rng.next() * 0.55; mb.box(M.plaster, nx, ny, z1 - ins - 0.024, nx + 0.15, ny + 0.12, z1 - ins - 0.02, rng.pick([[0.95, 0.9, 0.5], [0.95, 0.95, 0.95], [0.6, 0.8, 0.95]])); }
    }
  }
}

// The things that make a box read as a lived-in building: downpipes at the corners,
// balconies on flats, air-conditioning boxes under windows, kitchen extract vents, a
// stair housing on tall roofs, solar panels on houses. All drawn, none collides.
function exteriorDetail(mb, M, plan, b, rng, facade, fcol) {
  const { w, d, F, H } = plan, top = F * H;
  // a box standing proud of an exterior face: a along the wall, y up, out from the face
  const onFace = (side, a0, a1, y0, y1, o0, o1, m, c = WHITE) => {
    if (side === 'front') mb.box(m, a0, y0, -o1, a1, y1, -o0, c);
    else if (side === 'back') mb.box(m, a0, y0, d + o0, a1, y1, d + o1, c);
    else if (side === 'left') mb.box(m, -o1, y0, a0, -o0, y1, a1, c);
    else mb.box(m, w + o0, y0, a0, w + o1, y1, a1, c);
  };
  const span = side => side === 'front' || side === 'back' ? w : d;
  const pipe = (side, a) => {
    onFace(side, a - 0.06, a + 0.06, 0.15, top + 0.35, 0.05, 0.17, M.darkTrim);
    onFace(side, a - 0.1, a + 0.1, 0.05, 0.2, 0.05, 0.3, M.darkTrim);                         // shoe
    for (let y = 1.6; y < top; y += 2.2) onFace(side, a - 0.09, a + 0.09, y, y + 0.05, 0.0, 0.19, M.trim);   // brackets
  };
  // A wall is built, not one sheet: a plinth broken at the doors, the floors' slab edges showing, pilasters on the bays between openings, a head and a sill to each window, a cornice and a coping.
  const clad = !(b.type === 'workshop' || b.type === 'hangar');
  for (const wl of plan.walls) {
    if (!wl.exterior) continue;
    const S = span(wl.side), ops = wl.openings || [], free = (a, r) => !ops.some(o => a + r > o.a - 0.08 && a - r < o.b + 0.08);
    if (wl.k === 0) { let a0 = -0.03; for (const o of ops.filter(o => o.kind !== 'window').sort((p, q) => p.a - q.a)) { if (o.a - a0 > 0.1) onFace(wl.side, a0, o.a, 0, 0.5, 0, 0.05, M.concrete, [0.62, 0.62, 0.6]); a0 = o.b; } if (S + 0.03 - a0 > 0.1) onFace(wl.side, a0, S + 0.03, 0, 0.5, 0, 0.05, M.concrete, [0.62, 0.62, 0.6]); }
    const nb = Math.max(1, Math.round(S / (clad ? 3.6 : 4.8)));
    for (let i = 1; i < nb; i++) { const a = i * S / nb; if (free(a, clad ? 0.16 : 0.12)) onFace(wl.side, a - (clad ? 0.16 : 0.1), a + (clad ? 0.16 : 0.1), wl.y0 + (wl.k === 0 ? 0.5 : 0), wl.y0 + H, 0, clad ? 0.08 : 0.14, clad ? facade : M.metal, clad ? fcol.map(v => v * 0.9) : [0.5, 0.52, 0.54]); }
    if (wl.k > 0) onFace(wl.side, -0.03, S + 0.03, wl.y0 - 0.16, wl.y0 + 0.08, 0, 0.1, M.concrete, [0.68, 0.68, 0.66]);
    for (const o of ops) if (o.kind === 'window') { const y0 = wl.y0 + o.y0, y1 = wl.y0 + o.y1; onFace(wl.side, o.a - 0.12, o.b + 0.12, y1, y1 + 0.13, 0, 0.06, M.concrete, [0.72, 0.72, 0.7]); onFace(wl.side, o.a - 0.09, o.b + 0.09, y0 - 0.07, y0, 0, 0.11, M.concrete, [0.72, 0.72, 0.7]); }
  }
  for (const side of ['front', 'back', 'left', 'right']) { const S = span(side); onFace(side, -0.12, S + 0.12, top - 0.1, top + 0.06, 0, 0.17, M.trim); if (b.type !== 'house') onFace(side, -0.12, S + 0.12, top + 0.34, top + 0.42, -0.04, 0.12, M.metal, [0.6, 0.62, 0.64]); }
  pipe('front', 0.3); pipe('back', w - 0.3);
  if (w > 14) { pipe('front', w - 0.3); pipe('back', 0.3); }
  const home = b.type === 'hab' || b.type === 'house';
  for (const wl of plan.walls) {
    if (!wl.exterior) continue;
    for (const o of wl.openings) {
      if (o.kind !== 'window') continue;
      const y0 = wl.y0 + o.y0, y1 = wl.y0 + o.y1;
      if (b.type === 'hab' && wl.k >= 1 && wl.side === 'front' && o.b - o.a >= 1.2 && rng.chance(0.55)) {
        const a0 = o.a - 0.35, a1 = o.b + 0.35, fl = wl.y0;
        onFace('front', a0, a1, fl - 0.14, fl + 0.04, 0, 1.25, M.concrete, [0.72, 0.72, 0.7]);    // slab
        onFace('front', a0, a1, fl + 0.04, fl + 0.95, 1.17, 1.25, facade, fcol);                    // parapet panel
        onFace('front', a0, a0 + 0.08, fl + 0.04, fl + 0.95, 0, 1.25, facade, fcol); onFace('front', a1 - 0.08, a1, fl + 0.04, fl + 0.95, 0, 1.25, facade, fcol);
        onFace('front', a0 - 0.02, a1 + 0.02, fl + 0.95, fl + 1.0, 1.15, 1.28, M.trim);              // handrail
        if (rng.chance(0.4)) onFace('front', a0 + 0.3, a0 + 0.75, fl + 0.04, fl + 0.5, 0.4, 0.85, M.plaster, [0.4, 0.5, 0.35]);   // a planter
      } else if (home && wl.side !== 'front' && rng.chance(0.22) && y0 > 0.9) {
        const m = (o.a + o.b) / 2;
        onFace(wl.side, m - 0.42, m + 0.42, y0 - 0.75, y0 - 0.2, 0.02, 0.32, M.metal, [0.82, 0.82, 0.8]);   // AC unit
        onFace(wl.side, m - 0.32, m + 0.12, y0 - 0.68, y0 - 0.27, 0.32, 0.335, M.darkTrim);                  // its fan grille
        onFace(wl.side, m - 0.3, m - 0.26, 0.2, y0 - 0.75, 0.02, 0.06, M.darkTrim);                          // drain line
      }
    }
    if (home && (wl.side === 'left' || wl.side === 'right') && rng.chance(0.5)) {   // kitchen extract on each storey
      const a = rng.range(0.8, Math.max(1, span(wl.side) - 0.8)), y = wl.y0 + H - 0.7;
      onFace(wl.side, a - 0.15, a + 0.15, y - 0.15, y + 0.15, 0, 0.12, M.darkTrim);
      onFace(wl.side, a - 0.17, a + 0.17, y + 0.15, y + 0.19, 0, 0.18, M.trim);
    }
  }
  if (b.type === 'hab' && F > 1) {                       // stair and lift housing on the roof
    const x0 = 1.2, z0 = d - 4.2;
    mb.box({ default: facade, py: M.concrete }, x0, top, z0, x0 + 3, top + 2.7, z0 + 3, fcol);
    mb.box(M.darkTrim, x0 + 1.0, top, z0 - 0.04, x0 + 2.0, top + 2.1, z0, WHITE);
    mb.box(M.trim, x0 - 0.1, top + 2.7, z0 - 0.1, x0 + 3.1, top + 2.82, z0 + 3.1, WHITE);
  }
  if (b.type === 'house') {                              // a row of tilted solar panels
    const n = Math.max(2, Math.floor((w - 2) / 1.2));
    for (let i = 0; i < n; i++) {
      const x0 = 1 + i * 1.15, x1 = x0 + 1.05, z0 = d * 0.35, z1 = z0 + 1.7, y = top + 0.25;
      mb.quad(M.darkTrim, [[x0, y, z1], [x1, y, z1], [x1, y + 0.7, z0], [x0, y + 0.7, z0]], [0, 0.92, -0.38], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.25, 0.3, 0.42]);
      mb.box(M.trim, x0 + 0.45, top, z0 + 0.1, x0 + 0.55, y + 0.7, z0 + 0.2, WHITE);
    }
  }
}

// Wall segment → solid pieces around its openings, glass in windows, trim in reveals.
function wallGeometry(mb, M, wl, mat, col, typeIdx, rng, plan) {
  const alongX = wl.z0 === wl.z1;
  const a0 = alongX ? wl.x0 : wl.z0, a1 = alongX ? wl.x1 : wl.z1, c = alongX ? wl.z0 : wl.x0, t = wl.t;
  const y0 = wl.y0, y1 = wl.y1;
  // In local terms, a piece spans [p, q] along the wall, [ya, yb] vertically.
  const piece = (p, q, ya, yb, m = mat, cc = col, grow = 0) => {
    if (q - p < 0.001 || yb - ya < 0.001) return;
    const h = t / 2 + grow;
    if (alongX) mb.box(m, p, ya, c - h, q, yb, c + h, cc);
    else mb.box(m, c - h, ya, p, c + h, yb, q, cc);
  };
  // Exterior walls start/end flush; interior walls stop at the faces they meet.
  const ops = wl.openings.slice().sort((p, q) => p.a - q.a);
  let cur = a0;
  // the ground storey's walls start at slab level (0); upper storeys sit on the slab below
  const base = y0 + (wl.k === 0 ? 0 : 0);
  for (const o of ops) {
    piece(cur, o.a, base, y1);
    piece(o.a, o.b, base, base + o.y0);           // below (sill)
    piece(o.a, o.b, base + o.y1, y1);             // above (lintel)
    cur = o.b;
    // reveal trim + glass
    const isOuter = wl.exterior;
    if (o.kind === 'window') {
      const gl = (p, q) => {
        const yA = base + o.y0, yB = base + o.y1, lit = isOuter ? typeIdx + rng.next() * 0.999 : 0;
        if (alongX) {
          mb.quad(isOuter && wl.side !== 'front' ? M.pane : M.glass, [[q, yA, c - 0.02], [p, yA, c - 0.02], [p, yB, c - 0.02], [q, yB, c - 0.02]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'front' ? lit : 0);
          mb.quad(isOuter && wl.side !== 'back' ? M.pane : M.glass, [[p, yA, c + 0.02], [q, yA, c + 0.02], [q, yB, c + 0.02], [p, yB, c + 0.02]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'back' ? lit : 0);
        } else {
          mb.quad(isOuter && wl.side !== 'right' ? M.pane : M.glass, [[c + 0.02, yA, q], [c + 0.02, yA, p], [c + 0.02, yB, p], [c + 0.02, yB, q]], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'right' ? lit : 0);
          mb.quad(isOuter && wl.side !== 'left' ? M.pane : M.glass, [[c - 0.02, yA, p], [c - 0.02, yA, q], [c - 0.02, yB, q], [c - 0.02, yB, p]], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'left' ? lit : 0);
        }
      };
      gl(o.a, o.b);
      // frame: sill, head, jambs, and a mullion on wide windows
      const ft = 0.06;
      piece(o.a, o.b, base + o.y0, base + o.y0 + ft, M.trim, WHITE);
      piece(o.a, o.b, base + o.y1 - ft, base + o.y1, M.trim, WHITE);
      piece(o.a, o.a + ft, base + o.y0, base + o.y1, M.trim, WHITE);
      piece(o.b - ft, o.b, base + o.y0, base + o.y1, M.trim, WHITE);
      if (o.b - o.a > 1.9) { const m = (o.a + o.b) / 2; piece(m - ft / 2, m + ft / 2, base + o.y0, base + o.y1, M.trim, WHITE); }
      if (isOuter) { // projecting sill outside
        const out = OUTER[wl.side];
        const s0 = out === 'nz' || out === 'nx' ? c - t / 2 - 0.08 : c + t / 2, s1 = out === 'nz' || out === 'nx' ? c - t / 2 : c + t / 2 + 0.08;
        if (alongX) mb.box(M.trim, o.a - 0.05, base + o.y0 - 0.06, s0, o.b + 0.05, base + o.y0, s1, WHITE);
        else mb.box(M.trim, s0, base + o.y0 - 0.06, o.a - 0.05, s1, base + o.y0, o.b + 0.05, WHITE);
      }
    } else {
      const ft = 0.08; // door frame
      piece(o.a - ft, o.a, base, base + o.y1 + ft, M.darkTrim, WHITE, 0.025);
      piece(o.b, o.b + ft, base, base + o.y1 + ft, M.darkTrim, WHITE, 0.025);
      piece(o.a - ft, o.b + ft, base + o.y1, base + o.y1 + ft, M.darkTrim, WHITE, 0.025);
    }
  }
  piece(cur, a1, base, y1);
}

// ---- furniture: each kind is a few boxes in a prop-local frame where x ∈ [0, len]
// along the item, z ∈ [0, dep] from its front (z = 0) to its back.
function buildProp(mb, M, pr, rng) {
  const F = [[0, -1], [1, 0], [0, 1], [-1, 0]][pr.face];        // front direction (x, z)
  const ez = [-F[0], -F[1]], ex = [ez[1], -ez[0]];
  const corners = [[pr.x0, pr.z0], [pr.x1, pr.z0], [pr.x0, pr.z1], [pr.x1, pr.z1]];
  let o = corners[0], best = Infinity;
  for (const c of corners) { const s = c[0] * ex[0] + c[1] * ex[1] + c[0] * ez[0] + c[1] * ez[1]; if (s < best - 1e-9) { best = s; o = c; } }
  const len = Math.abs((pr.x1 - pr.x0) * ex[0] + (pr.z1 - pr.z0) * ex[1]);
  const dep = Math.abs((pr.x1 - pr.x0) * ez[0] + (pr.z1 - pr.z0) * ez[1]);
  const fr = subFrame(mb, [o[0], pr.y, o[1]], ex, ez);
  if (mb.propSink?.(pr, fr, len, dep, rng)) return;           // drawn from the asset library instead (render/props.js)
  mb.setFrame(...fr);
  const h = pr.h, B = (m, x0, y0, z0, x1, y1, z1, c = WHITE) => mb.box(m, x0, y0, z0, x1, y1, z1, c);
  const fab = rng.pick(FABRIC), legs = (m, top, inset = 0.05, s = 0.05) => {
    for (const [lx, lz] of [[inset, inset], [len - inset - s, inset], [inset, dep - inset - s], [len - inset - s, dep - inset - s]]) B(m, lx, 0, lz, lx + s, top, lz + s, [0.4, 0.4, 0.42]);
  };
  switch (pr.kind) {
    case 'bed':
      B(M.wood, 0, 0.1, 0, len, 0.32, dep, [0.8, 0.8, 0.8]); legs(M.metal, 0.1);
      B(M.fabric, 0.05, 0.32, 0.05, len - 0.05, h, dep - 0.05, [0.85, 0.85, 0.82]);
      B(M.fabric, 0.05, h, 0.05, len * 0.62, h + 0.03, dep - 0.05, fab);              // blanket
      B(M.fabric, len - 0.55, h, 0.15, len - 0.1, h + 0.12, dep - 0.15, [0.92, 0.92, 0.9]); // pillow
      B(M.wood, len - 0.04, 0, 0, len + 0.0, 1.0, dep, [0.7, 0.7, 0.7]);            // headboard at the wall end
      break;
    case 'sofa':
      B(M.fabric, 0, 0, 0.05, len, 0.42, dep, fab);
      B(M.fabric, 0, 0.42, dep - 0.22, len, h, dep, fab);
      B(M.fabric, 0, 0.42, 0.05, 0.18, 0.62, dep - 0.22, fab); B(M.fabric, len - 0.18, 0.42, 0.05, len, 0.62, dep - 0.22, fab);
      break;
    case 'table': case 'desk':
      B(M.wood, 0, h - 0.04, 0, len, h, dep, [0.85, 0.85, 0.85]); legs(M.metal, h - 0.04);
      if (pr.kind === 'desk') { B(M.darkTrim, len * 0.35, h, dep * 0.6, len * 0.65, h + 0.38, dep * 0.6 + 0.03); mb.quad(M.screen, [[len * 0.65 - 0.02, h + 0.04, dep * 0.6 - 0.002], [len * 0.35 + 0.02, h + 0.04, dep * 0.6 - 0.002], [len * 0.35 + 0.02, h + 0.36, dep * 0.6 - 0.002], [len * 0.65 - 0.02, h + 0.36, dep * 0.6 - 0.002]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE); }
      break;
    case 'chair':
      B(M.fabric, 0.03, 0.42, 0.03, len - 0.03, 0.48, dep - 0.03, fab); legs(M.metal, 0.42, 0.06, 0.03);
      B(M.fabric, 0.03, 0.48, dep - 0.07, len - 0.03, h, dep - 0.03, fab);
      break;
    case 'cabinet': case 'locker': case 'fridge': {
      const c = pr.kind === 'fridge' ? [0.9, 0.9, 0.9] : rng.pick([[0.55, 0.58, 0.6], [0.7, 0.7, 0.66], [0.42, 0.5, 0.55]]);
      B(M.metal, 0, 0, 0.02, len, h, dep, c);
      const n = pr.kind === 'locker' ? 2 : Math.max(1, Math.round(len / 0.6));
      for (let i = 1; i < n; i++) B(M.darkTrim, i * len / n - 0.005, 0.05, 0.0, i * len / n + 0.005, h - 0.05, 0.02);
      for (let i = 0; i < n; i++) B(M.trim, (i + 0.5) * len / n + 0.08, h * 0.5, -0.02, (i + 0.5) * len / n + 0.1, h * 0.5 + 0.18, 0.02);
      break; }
    case 'counter':
      B(M.wood, 0, 0, 0.05, len, h - 0.04, dep, [0.75, 0.75, 0.75]);
      B(M.concrete, -0.02, h - 0.04, 0, len + 0.02, h, dep, [0.35, 0.36, 0.38]);
      break;
    case 'shelf': case 'rack': {
      const c = pr.kind === 'rack' ? [0.75, 0.55, 0.25] : [0.7, 0.72, 0.74];
      for (const ux of [0, len - 0.05]) for (const uz of [0, dep - 0.05]) B(M.metal, ux, 0, uz, ux + 0.05, h, uz + 0.05, c);
      const levels = pr.kind === 'rack' ? 3 : 4;
      for (let i = 0; i < levels; i++) {
        const y = 0.12 + i * (h - 0.2) / (levels - 1 || 1);
        B(M.metal, 0, y, 0, len, y + 0.03, dep, [0.62, 0.64, 0.66]);
        if (i < levels - 1) for (let x = 0.08; x < len - 0.3;) { // goods on the shelf
          const gw = rng.range(0.15, 0.45), gh = Math.min(rng.range(0.12, 0.38), (h - 0.2) / (levels - 1) - 0.08), gd = dep * rng.range(0.5, 0.9);
          if (rng.chance(0.8)) B(pr.kind === 'rack' ? M.corrugated : M.fabric, x, y + 0.03, (dep - gd) / 2, x + gw, y + 0.03 + gh, (dep + gd) / 2, rng.pick(FABRIC));
          x += gw + rng.range(0.02, 0.12);
        }
      }
      break; }
    case 'bench':
      B(M.wood, 0, h - 0.06, 0, len, h, dep, [0.8, 0.8, 0.8]); legs(M.metal, h - 0.06, 0.1, 0.06);
      break;
    case 'planter':
      B(M.concrete, 0, 0, 0, len, 0.5, dep, [0.6, 0.6, 0.58]);
      B(M.fabric, 0.08, 0.5, 0.08, len - 0.08, h, dep - 0.08, [0.18, 0.32, 0.16]);
      break;
    case 'crate':
      B(M.corrugated, 0.04, 0, 0.04, len - 0.04, h, dep - 0.04, rng.pick([[0.5, 0.56, 0.46], [0.62, 0.5, 0.36], [0.5, 0.52, 0.58]]));
      for (const y of [0, h - 0.08]) B(M.darkTrim, 0, y, 0, len, y + 0.08, dep);
      break;
    case 'machine':
      B(M.metal, 0, 0, 0, len, h, dep, [0.55, 0.6, 0.55]);
      B(M.darkTrim, len * 0.15, h * 0.55, -0.02, len * 0.55, h * 0.85, 0.0);
      mb.quad(M.screen, [[len * 0.53, h * 0.58, -0.025], [len * 0.17, h * 0.58, -0.025], [len * 0.17, h * 0.82, -0.025], [len * 0.53, h * 0.82, -0.025]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE);
      B(M.trim, len * 0.7, h, dep * 0.3, len * 0.85, h + 0.4, dep * 0.45);
      break;
    default:
      B(M.metal, 0, 0, 0, len, h, dep, [0.6, 0.6, 0.6]);
  }
}
