// A building after the beam (sim/planetwar.js): its roof and upper floors gone, the walls broken off ragged at what's left,
// everything charred black, the glass blown out, the lights dead, and what came down lying in heaps inside the shell.
// Done to the building's own geometry as it's built (render/settlement-mesh.js), so a ruin is that building, burnt.
import { hashStr } from '../core/hash.js';
import { ruinKeep } from '../sim/planetwar.js';
import { cellOf } from '../gen/structure.js';

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
  const cut = (x, z) => y0 + Math.max(opt.min ?? 2.4, H * keep + Math.sin(x * 0.83 + ph) * 1.3 + Math.sin(z * 1.21 - ph) * 1.1 + Math.sin((x + z) * 2.7) * 0.45);
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

// Panes of glass taken out one at a time (a round through a window): the triangles of idx[i0..i1) whose middles lie in one of the boxes
// ([x0, z0, x1, z1, y0, y1], building-local) are closed up to nothing. pos: the positions they index, in the space of frame. → how many went
export function breakPanes(idx, pos, i0, i1, frame, boxes) {
  const [o, ex, ez] = frame; let n = 0;
  for (let i = i0; i + 2 < i1; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; if (a === b && b === c) continue;
    const x = (pos[3 * a] + pos[3 * b] + pos[3 * c]) / 3 - o[0], y = (pos[3 * a + 1] + pos[3 * b + 1] + pos[3 * c + 1]) / 3 - o[1], z = (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3 - o[2], lx = x * ex[0] + z * ex[2], lz = x * ez[0] + z * ez[2];
    for (const w of boxes) if (lx > w[0] - 0.05 && lx < w[2] + 0.05 && lz > w[1] - 0.05 && lz < w[3] + 0.05 && y > w[4] - 0.05 && y < w[5] + 0.05) { idx[i + 1] = idx[i + 2] = a; n++; break; } }
  return n;
}

// ---- A building broken (shellfire, a tank through it): the parts of it that are gone (gen/structure.js: the wall panels and the floor and roof
// squares broken out of it, and those left with nothing bearing them) come away from the rest and lie where they fell; the rest stands, with the
// hole in it. Each part is the building's own geometry, cut along the same lines the structure is: a panel with whatever was on it (a window's
// frame, a sill, a length of pipe), keeping its own facing, falling as one stiff piece onto the heap. flat: all of it, pressed to under knee height.
// Done to the building's own geometry in mb (as ruinPass). → with opt.anim, what's needed to play the fall of the parts in opt.fresh (fallStep).
export const piles = new Map();      // b.key → { x0, z0, nx, nz, h } how high the heap lies, per metre square, building-local
// the heap as boxes something walking meets ([x0, z0, x1, z1, y0, y1], building-local, over its base)
export function pileBoxes(key) { const P = piles.get(key), out = []; if (!P) return out;
  for (let j = 0; j + 1 < P.nz; j += 2) for (let i = 0; i + 1 < P.nx; i += 2) { const h = Math.max(P.h[j * P.nx + i], P.h[j * P.nx + i + 1], P.h[(j + 1) * P.nx + i], P.h[(j + 1) * P.nx + i + 1]); if (h > 0.3) out.push([P.x0 + i, P.z0 + j, P.x0 + i + 2, P.z0 + j + 2, 0, h]); }
  return out; }
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qax = (x, y, z, ang) => { const s = Math.sin(ang / 2); return [x * s, y * s, z * s, Math.cos(ang / 2)]; };
const qrot = (q, x, y, z) => { const a = q[0], b = q[1], c = q[2], w = q[3], tx = b * z - c * y + w * x, ty = c * x - a * z + w * y, tz = a * y - b * x + w * z; return [x + 2 * (b * tz - c * ty), y + 2 * (c * tx - a * tz), z + 2 * (a * ty - b * tx)]; };
const fallen = new Map();
function fallOf(mat) { let C = fallen.get(mat); if (!C) { C = mat.clone(); C.side = 2; C.onBeforeCompile = mat.onBeforeCompile; if (mat.customProgramCacheKey) C.customProgramCacheKey = mat.customProgramCacheKey; C.name = (mat.name || '') + ':fallen'; C.userData = { ...mat.userData, fallen: true }; fallen.set(mat, C); } return C; }

// S: gen/structure.js structureOf(b, plan). opt.gone: the numbers of its parts that are down, in the order they fell; opt.fresh: a Set of those only now
// coming down (the rest already lie); opt.flat; opt.glass: the materials that are glass (all of it is out of a building that's been hit); opt.anim
export function collapsePass(mb, snap, frame, b, plan, S, opt = {}) {
  const [o, ex, ez] = frame, flat = !!opt.flat, H = plan.H, Htot = plan.F * plan.H, R = k => rnd(b.key, k), gone = opt.glass || new Set();
  const walls = S.walls, gx = S.gx, gz = S.gz, gy = S.gy, order = new Map((opt.gone || []).map((i, n) => [S.nodes[i].key, n]));
  const G = []; let wallG = null, most = 0;
  for (const [mat, g] of [...mb.groups]) { const s = snap.get(mat) || { v: 0, i: 0 }; if (g.idx.length <= s.i) continue;
    if (gone.has(mat) || mat.transparent) { g.idx.length = s.i; continue; }
    const q = { mat, g, s, own: [] }; G.push(q); const n = g.p.length / 3 - s.v; if (n > most) { most = n; wallG = q; } }
  if (!G.length) return null;
  const lx = (g, v) => (g.p[3 * v] - o[0]) * ex[0] + (g.p[3 * v + 2] - o[2]) * ex[2], lz = (g, v) => (g.p[3 * v] - o[0]) * ez[0] + (g.p[3 * v + 2] - o[2]) * ez[2], ly = (g, v) => g.p[3 * v + 1] - o[1];
  const mix = (g, a, c, f) => { const v = g.p.length / 3; for (let k = 0; k < 3; k++) { g.p.push(g.p[3 * a + k] + (g.p[3 * c + k] - g.p[3 * a + k]) * f); g.n.push(g.n[3 * a + k] + (g.n[3 * c + k] - g.n[3 * a + k]) * f); g.c.push(g.c[3 * a + k] + (g.c[3 * c + k] - g.c[3 * a + k]) * f); }
    for (let k = 0; k < 2; k++) g.uv.push(g.uv[2 * a + k] + (g.uv[2 * c + k] - g.uv[2 * a + k]) * f); g.lit.push(0); return v; };
  // a run of triangles cut where co() crosses each of cuts (so that none of them lies across a break)
  const cut = (g, T, co, cuts) => { const E = 0.02;
    for (const c of cuts) { let hit = false; for (let i = 0; i < T.length && !hit; i += 3) { const sa = co(g, T[i]) - c, sb = co(g, T[i + 1]) - c, sd = co(g, T[i + 2]) - c; hit = !((sa >= -E && sb >= -E && sd >= -E) || (sa <= E && sb <= E && sd <= E)); } if (!hit) continue;
      const out = [];
      for (let i = 0; i < T.length; i += 3) { let a = T[i], e = T[i + 1], d = T[i + 2]; const sa = co(g, a) - c, sb = co(g, e) - c, sd = co(g, d) - c;
        if ((sa >= -E && sb >= -E && sd >= -E) || (sa <= E && sb <= E && sd <= E)) { out.push(a, e, d); continue; }
        const pa = sa > 0, pb = sb > 0, pd = sd > 0; let s0 = sa, s1 = sb, s2 = sd;
        if (pb !== pa && pb !== pd) { [a, e, d] = [e, d, a]; [s0, s1, s2] = [sb, sd, sa]; } else if (pd !== pa && pd !== pb) { [a, e, d] = [d, a, e]; [s0, s1, s2] = [sd, sa, sb]; }
        const ae = mix(g, a, e, s0 / (s0 - s1 || 1e-9)), ad = mix(g, a, d, s0 / (s0 - s2 || 1e-9)); out.push(a, ae, ad, ae, e, d, ae, d, ad); }
      T = out; }
    return T; };
  // every triangle to the part it's of: a panel of the wall it lies on, or a square of floor, roof or whatever else
  const pieces = new Map(), list = [];
  const pieceOf = (key, W) => { let P = pieces.get(key); if (!P) { P = { i: list.length, key, W, tris: [], bb: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9] }; pieces.set(key, P); list.push(P); } return P; };
  G.forEach((q, gi) => { const g = q.g, T0 = g.idx.slice(q.s.i); g.idx.length = q.s.i;
    for (let i = 0; i < T0.length; i += 3) { const a = T0[i], e = T0[i + 1], d = T0[i + 2]; if (a === e || e === d || a === d) continue;
      const cx = (lx(g, a) + lx(g, e) + lx(g, d)) / 3, cy = (ly(g, a) + ly(g, e) + ly(g, d)) / 3, cz = (lz(g, a) + lz(g, e) + lz(g, d)) / 3; let W = null, bd = 1e9;
      for (const w of walls) { if (cy < w.wl.y0 - 0.1 || cy > w.wl.y1 + 0.1) continue; const al = w.alongX ? cx : cz, pp = Math.abs((w.alongX ? cz : cx) - w.cc); if (pp > w.m || al < w.a0 - 0.3 || al > w.a1 + 0.3) continue; if (pp < bd) { bd = pp; W = w; } }
      let T = [a, e, d];
      if (W) { T = cut(g, T, W.alongX ? lx : lz, W.cuts); T = cut(g, T, ly, W.ys); } else { T = cut(g, T, lx, gx); T = cut(g, T, lz, gz); T = cut(g, T, ly, gy); }
      for (let k = 0; k < T.length; k += 3) { const x = (lx(g, T[k]) + lx(g, T[k + 1]) + lx(g, T[k + 2])) / 3, y = (ly(g, T[k]) + ly(g, T[k + 1]) + ly(g, T[k + 2])) / 3, z = (lz(g, T[k]) + lz(g, T[k + 1]) + lz(g, T[k + 2])) / 3;
        const P = W ? pieceOf('w' + W.wi + ':' + cellOf(W.cuts, W.alongX ? x : z) + ':' + Math.max(0, Math.min(1, Math.floor((y - W.wl.y0) / W.Hh))), W) : pieceOf('f' + cellOf(gx, x) + ':' + cellOf(gz, z) + ':' + cellOf(gy, y), null);
        P.tris.push(gi, T[k], T[k + 1], T[k + 2]); } } });
  // each corner belongs to one part only (where two meet at a corner, each gets its own), and how big each part is
  for (const P of list) { const t = P.tris, bb = P.bb;
    for (let k = 0; k < t.length; k += 4) { const q = G[t[k]], g = q.g; for (let j = 1; j <= 3; j++) { let v = t[k + j]; const w = q.own[v]; if (w !== undefined && w !== P.i) { let dup = (q.dup ||= new Map()).get(v + ':' + P.i); if (dup === undefined) { dup = mix(g, v, v, 0); q.dup.set(v + ':' + P.i, dup); } v = t[k + j] = dup; } q.own[v] = P.i;
        const x = lx(g, v), y = ly(g, v), z = lz(g, v); if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z; if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z; }
      g.idx.push(t[k + 1], t[k + 2], t[k + 3]); } }
  // the broken stuff inside a panel or a slab, seen at its edges: a block of it, just under its faces
  { const g = wallG.g, gi = G.indexOf(wallG); mb.setFrame(...frame);
    for (const P of list) { const bb = P.bb, W = P.W, v0 = g.p.length / 3, k = 0.2 + 0.1 * R(300 + P.i), col = [k, k * 0.96, k * 0.92]; let box = null;
      if (W) { const al0 = W.alongX ? bb[0] : bb[2], al1 = W.alongX ? bb[3] : bb[5]; if (al1 - al0 < 0.3 || bb[4] - bb[1] < 0.3) continue;
        if (W.wl.openings.some(op => op.a < al1 - 0.05 && op.b > al0 + 0.05 && W.wl.y0 + op.y0 < bb[4] - 0.05 && W.wl.y0 + op.y1 > bb[1] + 0.05)) continue;
        const t = Math.max(0.02, W.t / 2 - 0.015); box = W.alongX ? [al0, bb[1], W.cc - t, al1, bb[4], W.cc + t] : [W.cc - t, bb[1], al0, W.cc + t, bb[4], al1]; }
      else if (bb[4] - bb[1] < 0.45 && bb[3] - bb[0] > 0.6 && bb[5] - bb[2] > 0.6 && !(plan.roofSlopes && bb[4] > Htot - 0.3)) box = [bb[0], bb[4] - Math.max(bb[4] - bb[1], 0.16) + 0.015, bb[2], bb[3], bb[4] - 0.015, bb[5]];
      if (!box) continue; mb.box(wallG.mat, ...box, col); for (let v = v0; v < g.p.length / 3; v++) wallG.own[v] = P.i; if (!W) bb[1] = Math.min(bb[1], box[1]); } }
  // where each part comes to rest: the lowest first, each laid on its flat on what's already down under it
  const ap = Math.min(5, 1.5 + Htot * 0.25), x0 = Math.floor(-ap - 1), z0 = Math.floor(-ap - 1), nx = Math.ceil(b.w + ap + 1) - x0, nz = Math.ceil(b.d + ap + 1) - z0, hgt = new Float32Array(nx * nz);
  for (const P of list) { const bb = P.bb, W = P.W; P.c = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
    P.n = order.get(P.key); P.fall = bb[4] > 0.3 && (flat ? !P.key.endsWith(':0') || !!W : P.n !== undefined); }
  for (const P of list.filter(P => P.fall).sort((p, q) => (p.n ?? 1e9) - (q.n ?? 1e9) || p.bb[1] - q.bb[1] || p.i - q.i)) { const bb = P.bb, W = P.W, i = P.i, dx = Math.max(0.06, bb[3] - bb[0]), dy = Math.max(0.06, bb[4] - bb[1]), dz = Math.max(0.06, bb[5] - bb[2]);
    const thin = W ? (W.alongX ? 'z' : 'x') : dy <= dx && dy <= dz ? 'y' : dx < dz ? 'x' : 'z', th = thin === 'y' ? dy : thin === 'x' ? dx : dz;
    let sgn = R(420 + i) < 0.5 ? -1 : 1; const outw = W?.wl.exterior && R(440 + i) < 0.45; if (W?.wl.exterior) { const o1 = W.cc < (W.alongX ? b.d : b.w) / 2 ? -1 : 1; sgn = outw ? o1 : -o1; }
    let q = [0, 0, 0, 1], cx = P.c[0] + (R(460 + i) - 0.5) * 1.2, cz = P.c[2] + (R(480 + i) - 0.5) * 1.2; const yb = Math.max(0, bb[1]), throwD = sgn * (dy / 2 + yb * (0.1 + 0.5 * R(500 + i)));
    if (W && thin === 'x') { q = qax(0, 0, 1, -sgn * Math.PI / 2); cx += throwD; } else if (W) { q = qax(1, 0, 0, sgn * Math.PI / 2); cz += throwD; }
    else { const far = yb * 0.25; cx += (R(520 + i) - 0.5) * far; cz += (R(540 + i) - 0.5) * far;
      // (a piece of a roof, a dome, a stair: laid on its flat, whichever way that is — the way most of its surface faces goes up)
      let ax = 0, ay = 0, az = 0; { const t = P.tris; for (let k = 0; k < t.length; k += 4) { const g = G[t[k]].g, a = t[k + 1], e = t[k + 2], d = t[k + 3], ux = lx(g, e) - lx(g, a), uy = ly(g, e) - ly(g, a), uz = lz(g, e) - lz(g, a), vx = lx(g, d) - lx(g, a), vy = ly(g, d) - ly(g, a), vz = lz(g, d) - lz(g, a); let nx2 = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx; if (nx2 * ax + ny2 * ay + nz2 * az < 0) { nx2 = -nx2; ny2 = -ny2; nz2 = -nz2; } ax += nx2; ay += ny2; az += nz2; } }
      const al = Math.hypot(ax, ay, az); if (al > 1e-6) { ax /= al; ay /= al; az /= al; if (ay < 0) { ax = -ax; ay = -ay; az = -az; } const hz = Math.hypot(ax, az); if (hz > 0.25) { q = qax(-az / hz, 0, ax / hz, Math.acos(Math.min(1, ay))); const out = dy / 2 + yb * (0.1 + 0.4 * R(500 + i)); cx -= ax / hz * out * hz; cz -= az / hz * out * hz; } } }
    const lim = outw || !W && bb[1] > Htot - 0.5 ? ap - 0.8 : -0.4; cx = Math.max(-lim, Math.min(b.w + lim, cx)); cz = Math.max(-lim, Math.min(b.d + lim, cz));
    const tilt = (flat ? 0.05 : (0.08 + 0.34 * R(560 + i)) * Math.min(1, 1.4 / Math.max(dx, dy, dz))) * (R(580 + i) < 0.5 ? -1 : 1), ph = R(600 + i) * Math.PI * 2;
    q = qmul(qax(Math.cos(ph), 0, Math.sin(ph), tilt), qmul(qax(0, 1, 0, (R(620 + i) - 0.5) * (flat ? 1.2 : 0.7)), q));
    // (how it lies, turned: its lowest corner is what touches, and how far it reaches round)
    let lowY = 0, reach = 0.3; { const t = P.tris; for (let k = 0; k < t.length; k += 4) { const g = G[t[k]].g; for (let j = 1; j <= 3; j++) { const v = t[k + j], w = qrot(q, lx(g, v) - P.c[0], ly(g, v) - P.c[1], lz(g, v) - P.c[2]); if (w[1] < lowY) lowY = w[1]; const h = Math.hypot(w[0], w[2]); if (h > reach) reach = h; } } }
    const r = Math.min(2.2, reach * 0.6);
    let mx = 0, sum = 0, n = 0; const i0 = Math.max(0, Math.floor(cx - r - x0)), i1 = Math.min(nx - 1, Math.floor(cx + r - x0)), j0 = Math.max(0, Math.floor(cz - r - z0)), j1 = Math.min(nz - 1, Math.floor(cz + r - z0));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const h = hgt[j * nx + ii]; if (h > mx) mx = h; sum += h; n++; }
    const base = n ? 0.55 * mx + 0.45 * sum / n : 0, top = base + Math.min(th, 0.3) * (flat ? 0.2 : 0.6); for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) if (hgt[j * nx + ii] < top) hgt[j * nx + ii] = top;
    let cy = base - lowY + 0.02; if (flat) cy = Math.min(cy, -lowY + 0.25 * R(640 + i));
    P.q = q; P.d = [cx - P.c[0], cy - P.c[1], cz - P.c[2]]; P.dust = 0.58 + 0.27 * R(660 + i);
    const drop = Math.max(0.3, P.c[1] - cy); P.T = Math.min(1.9, Math.max(0.4, Math.sqrt(2 * drop / 9.8) * 1.15)); P.t0 = 0.3 * R(680 + i) + Math.min(0.5, yb * 0.02); }
  if (flat) for (let k = 0; k < hgt.length; k++) hgt[k] = Math.min(hgt[k], 0.5);
  piles.set(b.key, { x0, z0, nx, nz, h: hgt });
  // every corner taken where its part went (a standing one stays, dusted), then all of it onto surfaces seen from both sides (a part lies any way up)
  const anim = opt.anim ? { o, ex, ez, groups: [], pieces: list.map(P => P.fall && (!opt.fresh || opt.fresh.has(S.index.get(P.key))) ? { c: P.c, q: P.q, d: P.d, T: P.T, t0: P.t0 } : null), t: 0, T: 0 } : null;
  for (const q of G) { const g = q.g, s = q.s, n = g.p.length / 3 - s.v, loc = anim && new Float32Array(3 * n), pid = anim && new Int32Array(n).fill(-1);
    for (let v = s.v; v < g.p.length / 3; v++) { const P = list[q.own[v]]; if (!P) continue; if (P.fall) g.lit[v] = 0; const x = lx(g, v), y = ly(g, v), z = lz(g, v);
      if (anim) { loc[3 * (v - s.v)] = x; loc[3 * (v - s.v) + 1] = y; loc[3 * (v - s.v) + 2] = z; }
      if (!P.fall) continue; const k = P.dust; g.c[3 * v] *= k; g.c[3 * v + 1] *= k * 0.98; g.c[3 * v + 2] *= k * 0.95; if (anim && anim.pieces[P.i]) pid[v - s.v] = P.i;
      const [rx, ry, rz] = qrot(P.q, x - P.c[0], y - P.c[1], z - P.c[2]), X = P.c[0] + P.d[0] + rx, Y = P.c[1] + P.d[1] + ry, Z = P.c[2] + P.d[2] + rz;
      g.p[3 * v] = o[0] + ex[0] * X + ez[0] * Z; g.p[3 * v + 1] = o[1] + (flat ? Math.min(Y, 0.4 + 0.12 * P.dust) : Y); g.p[3 * v + 2] = o[2] + ex[2] * X + ez[2] * Z;
      const nlx = g.n[3 * v] * ex[0] + g.n[3 * v + 2] * ex[2], nlz = g.n[3 * v] * ez[0] + g.n[3 * v + 2] * ez[2], [mx2, my2, mz2] = qrot(P.q, nlx, g.n[3 * v + 1], nlz);
      g.n[3 * v] = ex[0] * mx2 + ez[0] * mz2; g.n[3 * v + 1] = my2; g.n[3 * v + 2] = ex[2] * mx2 + ez[2] * mz2; }
    const C = fallOf(q.mat), h = mb.g(C), base = h.p.length / 3 - s.v;
    for (let k = 3 * s.v; k < g.p.length; k++) { h.p.push(g.p[k]); h.n.push(g.n[k]); h.c.push(g.c[k]); } for (let k = 2 * s.v; k < g.uv.length; k++) h.uv.push(g.uv[k]); for (let k = s.v; k < g.lit.length; k++) h.lit.push(g.lit[k]);
    for (let k = s.i; k < g.idx.length; k++) h.idx.push(g.idx[k] + base);
    g.p.length = 3 * s.v; g.n.length = 3 * s.v; g.uv.length = 2 * s.v; g.c.length = 3 * s.v; g.lit.length = s.v; g.idx.length = s.i;
    if (anim) anim.groups.push({ mat: C, v0: base + s.v, n, loc, pid }); }
  if (anim) for (const P of anim.pieces) if (P) anim.T = Math.max(anim.T, P.t0 + P.T);
  return anim;
}
// the fall played: every part from where it stood to where it lies, turning as it drops. pos(mat) → the positions it's drawn from (or null).
// → false once it's all down
export function fallStep(A, dt, pos) {
  A.t += dt; const done = A.t >= A.T, { o, ex, ez } = A;
  for (const Gp of A.groups) { const arr = pos(Gp.mat); if (!arr) continue; const { loc, pid, v0, n } = Gp; let last = -2, P = null, f = 0, q = null, dx = 0, dy = 0, dz = 0;
    for (let v = 0; v < n; v++) { const pi = pid[v]; if (pi < 0) continue;
      if (pi !== last) { last = pi; P = A.pieces[pi]; const e = Math.max(0, Math.min(1, (A.t - P.t0) / P.T)); f = e * e; const w = Math.max(-1, Math.min(1, P.q[3])), ang = 2 * Math.acos(w), sn = Math.sqrt(1 - w * w) || 1; q = qax(P.q[0] / sn, P.q[1] / sn, P.q[2] / sn, ang * f); dx = P.d[0] * e; dy = P.d[1] * f; dz = P.d[2] * e; }
      const [rx, ry, rz] = qrot(q, loc[3 * v] - P.c[0], loc[3 * v + 1] - P.c[1], loc[3 * v + 2] - P.c[2]), X = P.c[0] + dx + rx, Y = P.c[1] + dy + ry, Z = P.c[2] + dz + rz, k = 3 * (v0 + v);
      arr[k] = o[0] + ex[0] * X + ez[0] * Z; arr[k + 1] = o[1] + Y; arr[k + 2] = o[2] + ex[2] * X + ez[2] * Z; } }
  return !done;
}
