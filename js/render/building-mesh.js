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

export function buildBuilding(mb, plan, b, frame) {
  const M = materials();
  mb.setFrame(...frame);
  const rng = new Rng(seedFromString(b.key));
  const corr = b.type === 'workshop' || b.type === 'hangar';
  const facade = corr ? M.corrugated : M.panels;
  const fcol = rng.pick(PALETTE[b.type]);
  const typeIdx = WINDOW_TYPES.indexOf(b.type);
  const { w, d, F, H } = plan;
  const top = F * H;

  // plinth (the graded ground is 0.2 below the ground floor)
  mb.box(M.concrete, -0.15, -0.8, -0.15, w + 0.15, 0.0, d + 0.15, [0.8, 0.8, 0.78], new Set(['py']));

  // slabs: tiled floors on top, plaster ceilings underneath, concrete edges
  for (const sl of plan.slabs) {
    for (const r of sl.rects) {
      const [x0, z0, x1, z1] = r;
      if (sl.roof) mb.box(M.concrete, x0, sl.y - SLAB_T, z0, x1, sl.y, z1, [0.62, 0.62, 0.6], new Set(['ny']));
      else mb.box({ py: M.tiles, default: M.concrete }, x0, sl.y - (sl.k === 0 ? 0.02 : SLAB_T), z0, x1, sl.y, z1, rng.pick(ROOM_TINT), new Set(['ny']));
      if (sl.k > 0) mb.quad(M.plaster, [[x0, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z0], [x1, sl.y - SLAB_T, z1], [x0, sl.y - SLAB_T, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], WHITE);
    }
  }

  // walls with openings
  const intTint = rng.pick(ROOM_TINT);
  for (const wl of plan.walls) wallGeometry(mb, M, wl, wl.exterior ? { [OUTER[wl.side]]: facade, default: M.plaster } : M.plaster, wl.exterior ? fcol : intTint, typeIdx, rng, plan);

  // storey bands, parapet and roof kit
  for (let k = 1; k <= F; k++) {
    const y = k * H;
    if (k === F) continue;            // the parapet caps the top
    mb.box(M.trim, -0.04, y - 0.1, -0.04, w + 0.04, y + 0.02, 0.0, WHITE);
    mb.box(M.trim, -0.04, y - 0.1, d, w + 0.04, y + 0.02, d + 0.04, WHITE);
    mb.box(M.trim, -0.04, y - 0.1, 0, 0.0, y + 0.02, d, WHITE);
    mb.box(M.trim, w, y - 0.1, 0, w + 0.04, y + 0.02, d, WHITE);
  }
  const par = 0.7;
  mb.box({ default: facade, py: M.trim }, 0, top, 0, w, top + par, EXT_T, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, 0, top, d - EXT_T, w, top + par, d, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, 0, top, EXT_T, EXT_T, top + par, d - EXT_T, fcol, new Set(['ny']));
  mb.box({ default: facade, py: M.trim }, w - EXT_T, top, EXT_T, w, top + par, d - EXT_T, fcol, new Set(['ny']));
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

  // furniture
  const saved = [mb.o, mb.ex, mb.ez];
  for (const pr of plan.props) { buildProp(mb, M, pr, rng); mb.setFrame(...saved); }
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
          mb.quad(M.glass, [[q, yA, c - 0.02], [p, yA, c - 0.02], [p, yB, c - 0.02], [q, yB, c - 0.02]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'front' ? lit : 0);
          mb.quad(M.glass, [[p, yA, c + 0.02], [q, yA, c + 0.02], [q, yB, c + 0.02], [p, yB, c + 0.02]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'back' ? lit : 0);
        } else {
          mb.quad(M.glass, [[c + 0.02, yA, q], [c + 0.02, yA, p], [c + 0.02, yB, p], [c + 0.02, yB, q]], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'right' ? lit : 0);
          mb.quad(M.glass, [[c - 0.02, yA, p], [c - 0.02, yA, q], [c - 0.02, yB, q], [c - 0.02, yB, p]], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, wl.side === 'left' ? lit : 0);
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
