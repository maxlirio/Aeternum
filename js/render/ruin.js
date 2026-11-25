// A building after the beam (sim/planetwar.js): its roof and upper floors gone, the walls broken off ragged at what's left,
// everything charred black, the glass blown out, the lights dead, and what came down lying in heaps inside the shell.
// Done to the building's own geometry as it's built (render/settlement-mesh.js), so a ruin is that building, burnt.
import { hashStr } from '../core/hash.js';
import { ruinKeep } from '../sim/planetwar.js';

// where each material's geometry stood before this building went in (so only its own is touched)
export function snapshot(mb) { const m = new Map(); for (const [mat, g] of mb.groups) m.set(mat, { v: g.p.length / 3, i: g.idx.length }); return m; }

const rnd = (key, k) => hashStr(k * 7919 + 13, key) / 4294967296;
// mb: the MeshBuilder the building went into; snap: snapshot(mb) from before; frame: its [origin, ex, ez]; b: the building
// opt.glassOnly: only its glass is gone (shot up, not burnt). opt.k: how much less of it stands than a burnt one (knocked down by shellfire: lower);
// opt.grey: broken, not burnt (dust and bare masonry, not charcoal)
export function ruinPass(mb, snap, frame, b, gone = new Set(), wallH = null, opt = {}) {
  if (opt.glassOnly) { for (const [mat, g] of mb.groups) { if (!(gone.has(mat) || mat.transparent)) continue; const s = snap.get(mat) || { v: 0, i: 0 }; g.idx.length = s.i; } return; }      // wallH: how high its walls go (plan F × H); the roof over them isn't counted      // gone: materials that don't survive a fire at all (glass)
  const y0 = frame[0][1]; let top = y0, wall = null, most = 0;
  for (const [mat, g] of mb.groups) { const s0 = snap.get(mat)?.v ?? 0; for (let v = s0; v < g.p.length / 3; v++) top = Math.max(top, g.p[3 * v + 1]);
    const n = g.p.length / 3 - s0; if (n > most && !mat.transparent) { most = n; wall = mat; } }
  const H = wallH ?? top - y0; if (H < 1) return;
  // the line it's broken off at: lower or higher by building, ragged along every wall
  const keep = ruinKeep(b.key) * (opt.k || 1), ph = rnd(b.key, 2) * 40;
  const cut = (x, z) => y0 + Math.max(2.4, H * keep + Math.sin(x * 0.83 + ph) * 1.3 + Math.sin(z * 1.21 - ph) * 1.1 + Math.sin((x + z) * 2.7) * 0.45);
  for (const [mat, g] of [...mb.groups]) { if (mat.userData.burnt) continue;      // (a copy: burnt surfaces are added as it goes, and they're done)
    const s = snap.get(mat) || { v: 0, i: 0 }, glass = gone.has(mat) || mat.transparent;
    // triangles wholly above the break are gone (the roof, the upper floors, what stood on them); glass is all gone
    const keepIdx = [];
    for (let i = s.i; i < g.idx.length; i += 3) { const a = g.idx[i], c = g.idx[i + 1], d = g.idx[i + 2]; if (glass) continue;
      const above = v => g.p[3 * v + 1] > cut(g.p[3 * v], g.p[3 * v + 2]) + 0.01, na = +above(a) + +above(c) + +above(d); if (na === 3) continue;
      // a roof or a floor that only dips below the break would be squashed flat onto it: a lid. It's gone too (only walls are left standing broken)
      if (na && Math.abs(g.n[3 * a + 1]) > 0.3) continue; keepIdx.push(a, c, d); }
    g.idx.length = s.i; for (const k of keepIdx) g.idx.push(k);
    // what's left: brought down to the break, burnt (blackest where the fire went up the walls), and dark
    for (let v = s.v; v < g.p.length / 3; v++) { const x = g.p[3 * v], z = g.p[3 * v + 2], y = Math.min(g.p[3 * v + 1], cut(x, z)); g.p[3 * v + 1] = y;
      const soot = opt.grey ? 0.34 + 0.3 * (0.5 + 0.5 * Math.sin(x * 3.1 + z * 2.3)) * Math.min(1, (y - y0) / 3 + 0.3) : 0.018 + 0.07 * Math.max(0, 1 - (y - y0) / (H * keep + 1)) * (0.6 + 0.4 * Math.sin(x * 3.1 + z * 2.3)) ** 2;      // (linear: 0.02 is charcoal on screen)
      g.c[3 * v] *= soot; g.c[3 * v + 1] *= soot * 0.95; g.c[3 * v + 2] *= soot * 0.9; g.lit[v] = 0; }
    // a surface that doesn't take a colour per vertex (a world's own facing: brick, earth, timber) goes onto a copy of itself that does
    if (!mat.vertexColors && !glass && g.p.length / 3 > s.v) { const C = charOf(mat), h = mb.g(C), base = h.p.length / 3 - s.v;
      h.p.push(...g.p.slice(3 * s.v)); h.n.push(...g.n.slice(3 * s.v)); h.uv.push(...g.uv.slice(2 * s.v)); h.c.push(...g.c.slice(3 * s.v)); h.lit.push(...g.lit.slice(s.v));
      for (let i = s.i; i < g.idx.length; i++) h.idx.push(g.idx[i] + base);
      g.p.length = 3 * s.v; g.n.length = 3 * s.v; g.uv.length = 2 * s.v; g.c.length = 3 * s.v; g.lit.length = s.v; g.idx.length = s.i; }
  }
  // what came down: broken slabs and blocks heaped along the inside of the walls, none high enough to stop a step
  if (!wall) return;
  mb.setFrame(...frame); const n = opt.grey ? Math.min(150, Math.round(b.w * b.d / 2.5)) : Math.min(46, Math.round(b.w * b.d / 9));      // (knocked down, not burnt away: far more of it is still there, lying all over its own floor)
  for (let k = 0; k < n; k++) { const r1 = rnd(b.key, 10 + k), r2 = rnd(b.key, 70 + k), r3 = rnd(b.key, 130 + k), side = Math.floor(r3 * 4), along = r1, inset = 0.5 + r2 * Math.min(2.6, Math.min(b.w, b.d) * 0.3);
    let x = side === 0 ? inset : side === 1 ? b.w - inset : 0.5 + along * (b.w - 1), z = side === 2 ? inset : side === 3 ? b.d - inset : 0.5 + along * (b.d - 1);
    if (opt.grey && k % 3) { x = 0.8 + r1 * (b.w - 1.6); z = 0.8 + r2 * (b.d - 1.6); }
    const big = opt.grey ? 1 + 1.6 * rnd(b.key, 190 + k) : 1, sx = (0.25 + r2 * 0.9) * big, sz = (0.2 + r1 * 0.7) * big, sy = Math.min(0.45, (0.08 + r3 * 0.24) * big), k2 = opt.grey ? 0.16 + 0.12 * r2 : 0.02 + 0.03 * r2;
    mb.box(wall, x - sx / 2, 0, z - sz / 2, x + sx / 2, sy, z + sz / 2, [k2, k2 * 0.95, k2 * 0.9], NY); }
}
const NY = new Set(['ny']);
const chars = new Map();
function charOf(mat) { let C = chars.get(mat); if (!C) { C = mat.clone(); C.vertexColors = true; C.name = (mat.name || '') + ':burnt'; C.userData = { ...mat.userData, burnt: true }; chars.set(mat, C); } return C; }
