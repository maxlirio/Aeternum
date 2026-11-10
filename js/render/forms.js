// Draws a building's form (gen/forms.js): what stands on and round its walls and makes it the shape its world builds in.
// The building is x 0..w, z 0..d (front at z = 0), its roof at y = top. Output is triangles per slot (roof, wall, trim,
// dark, glass, metal), smooth-shaded where the shape is curved; render/building-mesh.js (towns) and render/housegen.js
// (country buildings) put them into their own meshes and materials.
import { Rng } from '../core/prng.js';

const TAU = Math.PI * 2;
class Out {
  constructor(lod) { this.by = {}; this.lod = lod; }
  into(s) { return this.by[s] || (this.by[s] = { pos: [], nor: [], uv: [] }); }
  tri(s, a, b, c, na, nb, nc, ua, ub, uc) { const B = this.into(s); B.pos.push(...a, ...b, ...c); B.nor.push(...na, ...nb, ...nc); B.uv.push(...ua, ...ub, ...uc); }
  quad(s, p, n, u) { this.tri(s, p[0], p[1], p[2], n[0], n[1], n[2], u[0], u[1], u[2]); this.tri(s, p[0], p[2], p[3], n[0], n[2], n[3], u[0], u[2], u[3]); }
  // a flat polygon, outward by its winding (counter-clockwise seen from outside), planar UVs in metres
  poly(s, pts) {
    let nx = 0, ny = 0, nz = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const l = Math.hypot(nx, ny, nz) || 1, n = [nx / l, ny / l, nz / l], ax = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
    const uv = p => ax === 0 ? [p[2], p[1]] : ax === 2 ? [p[0], p[1]] : [p[0], p[2]];
    for (let i = 1; i < pts.length - 1; i++) this.tri(s, pts[0], pts[i], pts[i + 1], n, n, n, uv(pts[0]), uv(pts[i]), uv(pts[i + 1]));
  }
  box(s, x0, y0, z0, x1, y1, z1) {
    this.poly(s, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]); this.poly(s, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
    this.poly(s, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]); this.poly(s, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    this.poly(s, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]); this.poly(s, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  }
  // a box turned by `a` about its centre (cx, cz)
  obox(s, cx, cz, w, d, y0, y1, a) {
    const c = Math.cos(a), sn = Math.sin(a), P = (u, v, y) => [cx + u * c + v * sn, y, cz - u * sn + v * c], hw = w / 2, hd = d / 2;
    const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let i = 0; i < 4; i++) { const [u0, v0] = q[i], [u1, v1] = q[(i + 1) % 4]; this.poly(s, [P(u1, v1, y0), P(u0, v0, y0), P(u0, v0, y1), P(u1, v1, y1)]); }
    this.poly(s, q.map(([u, v]) => P(u, v, y1)).reverse()); this.poly(s, q.map(([u, v]) => P(u, v, y0)));
  }
  // a square block tapering from b0 across at y0 to b1 at y1, centred on (cx, cz)
  frustum(s, cx, cz, b0, b1, y0, y1) { const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]], P = (k, b, y) => [cx + q[k][0] * b / 2, y, cz + q[k][1] * b / 2];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.poly(s, [P(j, b0, y0), P(i, b0, y0), P(i, b1, y1), P(j, b1, y1)]); } this.poly(s, [0, 1, 2, 3].map(k => P(k, b1, y1)).reverse()); }
  // a smooth surface f(u, v) → [x, y, z] over u, v in 0..1: nu × nv quads, normals from the surface itself (∂f/∂u × ∂f/∂v, outward), UVs in metres
  param(s, f, nu, nv, flip = false) {
    const q = this.lod < 1 ? Math.max(0.35, this.lod + 0.15) : 1;      // (far off: fewer rows and columns)
    nu = Math.max(1, Math.round(nu * q)); nv = Math.max(4, Math.round(nv * q));
    const P = [], N = [], e = 1e-3;
    for (let i = 0; i <= nu; i++) { P.push([]); N.push([]); for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv; P[i].push(f(u, v));
      const uc = Math.min(1 - e, Math.max(e, u)), vc = Math.min(1 - e, Math.max(e, v)), a = f(uc + e, vc), b = f(uc - e, vc), c = f(uc, vc + e), d = f(uc, vc - e);
      const fu = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], fv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      let n = [fu[1] * fv[2] - fu[2] * fv[1], fu[2] * fv[0] - fu[0] * fv[2], fu[0] * fv[1] - fu[1] * fv[0]], l = Math.hypot(...n);
      if (l < 1e-12) { n = [0, 1, 0]; l = 1; } N[i].push(n.map(x => (flip ? -x : x) / l)); } }
    // UVs: distance along each direction, so the material keeps its scale over the curve
    const U = [[0]], V = []; for (let i = 1; i <= nu; i++) { const m = nv >> 1, a = P[i][m], b = P[i - 1][m]; U.push([U[i - 1][0] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])]); }
    for (let i = 0; i <= nu; i++) { V.push([0]); for (let j = 1; j <= nv; j++) { const a = P[i][j], b = P[i][j - 1]; V[i].push(V[i][j - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); } }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const id = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], o = flip ? [id[0], id[3], id[2], id[1]] : id;
      this.quad(s, o.map(([a, b]) => P[a][b]), o.map(([a, b]) => N[a][b]), o.map(([a, b]) => [V[a][b], U[a][0]]));
    }
  }
  // turned about a vertical axis: prof [[r, y]…] from bottom to top (outward on its right as you walk it), scaled sx/sz across
  lathe(s, cx, cz, prof, seg, sx = 1, sz = 1, wob = null) {
    const n = prof.length - 1;
    this.param(s, (u, v) => { const t = u * n, i = Math.min(n - 1, Math.floor(t)), f = t - i, r = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * f, y = prof[i][1] + (prof[i + 1][1] - prof[i][1]) * f, a = v * TAU, k = wob ? wob(a, u) : 1;
      return [cx + Math.cos(a) * r * sx * k, y, cz + Math.sin(a) * r * sz * k]; }, n, seg);
  }
  // a tube along a path of points, its radius r(t)
  tube(s, path, r, seg = 8) {
    const n = path.length - 1, at = t => { const x = t * n, i = Math.min(n - 1, Math.floor(x)), f = x - i, a = path[i], b = path[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
    const a0 = path[0], a1 = path[n], ch = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]], side0 = cross(ch, [0, 1, 0]), side = Math.hypot(...side0) > 1e-6 ? norm(side0) : [1, 0, 0];
    this.param(s, (u, v) => { const p = at(u), q = at(Math.min(1, u + 0.01)), o = at(Math.max(0, u - 0.01)), T = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]), B = norm(cross(side, T)), A = cross(T, B), a = v * TAU, R = r(u);
      return [p[0] + (A[0] * Math.cos(a) + B[0] * Math.sin(a)) * R, p[1] + (A[1] * Math.cos(a) + B[1] * Math.sin(a)) * R, p[2] + (A[2] * Math.cos(a) + B[2] * Math.sin(a)) * R]; }, Math.max(4, n * 2), seg);
  }
}
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sq = (c, p) => Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1, 2].map(k => u * u * a[k] + 2 * u * t * b[k] + t * t * c[k]); });
// a smooth profile through control points (Catmull-Rom), n rows
function smooth(cp, n) {
  const out = []; for (let i = 0; i <= n; i++) { const t = i / n * (cp.length - 1), k = Math.min(cp.length - 2, Math.floor(t)), f = t - k, p0 = cp[Math.max(0, k - 1)], p1 = cp[k], p2 = cp[k + 1], p3 = cp[Math.min(cp.length - 1, k + 2)];
    out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * f + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * f * f + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * f * f * f))); }
  return out;
}

// a material for a form's slot name: 'form:<surface>:<r>,<g>,<b>' is that surface in that colour (country buildings, render/housegen.js)
const fcache = new Map();
export function formSurface(surface, name, tinted) {
  if (!name.startsWith('form:')) return surface(name, tinted);
  if (!fcache.has(name)) { const [, base, rgb] = name.split(':'), m = surface(base).clone(); m.color.setRGB(...rgb.split(',').map(Number)); fcache.set(name, m); }
  return fcache.get(name);
}
// the form's triangles into a part drawing whose building is centred on x and z (render/housegen.js Parts)
export function formIntoParts(P, F, top, door, slots) {
  const by = drawForm(F, top, door, 1), hw = F.w / 2, hd = F.d / 2;
  for (const [k, B] of Object.entries(by)) { if (!B.pos.length) continue; const T = P.into(slots[k] || slots.wall);
    for (let i = 0; i < B.pos.length; i += 3) T.pos.push(B.pos[i] - hw, B.pos[i + 1], B.pos[i + 2] - hd); T.nor.push(...B.nor); T.uv.push(...B.uv); }
}
// F: gen/forms.js formFor(); top: the roof's height; door: { x, w } on the front wall; lod: 1 near, 0.5 far
export function drawForm(F, top, door, lod = 1) {
  const O = new Out(lod), { w, d } = F, cx = w / 2, cz = d / 2, m = Math.min(w, d) / 2, r = new Rng(F.seed), S = k => Math.max(6, Math.round(k * lod));
  const fat = F.fat * F.j, tall = F.tall * F.jt;
  FORM[F.kind]?.(O, { F, w, d, cx, cz, m, top, r, S, fat, tall, door: door || { x: cx, w: 1.2 } });
  return O.by;
}
// a flat roof, its edge and a coping, for the forms that stand on one
function slab(O, { w, d, top }, inset = 0) { O.box('trim', -0.12 + inset, top - 0.05, -0.12 + inset, w + 0.12 - inset, top + 0.18, d + 0.12 - inset); }
// an onion bulb on a drum, turned at (x, z): base radius R, height H
function onion(O, x, z, y, R, H, seg, fat, finial = true) {
  O.lathe('roof', x, z, smooth([[0.92, 0], [1.16 * fat, 0.1], [1.26 * fat, 0.27], [1.16 * fat, 0.43], [0.86, 0.58], [0.48, 0.73], [0.2, 0.86], [0.07, 0.95], [0.0, 1]], 18).map(([a, b]) => [a * R, y + b * H]), seg);
  if (finial) { O.lathe('metal', x, z, [[0.06, y + H * 0.94], [0.05, y + H + 0.4], [0.16, y + H + 0.55], [0.2, y + H + 0.7], [0.12, y + H + 0.85], [0.03, y + H + 1.5], [0, y + H + 1.9]].map(([a, b]) => [a * Math.max(1, R / 2.2), b]), 10); }
}
const FORM = {
  gable(O, { w, d, top, r, tall, F }) {
    const along = w >= d, L = along ? w : d, A = along ? d : w, ov = 0.45, rise = A / 2 * (0.55 + 0.35 * tall), P = (a, l, y) => along ? [l, y, a] : [a, y, l];
    // two slopes, each a slab with a top, an underside and its edges; the end walls filled in under them
    for (const s of [0, 1]) { const a0 = s ? A + ov : -ov, a1 = A / 2, y0 = top - ov * rise / (A / 2), y1 = top + rise, l0 = -ov, l1 = L + ov, t = 0.22;
      const q = [P(a0, l0, y0), P(a1, l0, y1), P(a1, l1, y1), P(a0, l1, y0)]; O.poly('roof', (s ? q.slice().reverse() : q).map(p => [p[0], p[1] + t, p[2]])); O.poly('dark', s ? q : q.slice().reverse());
      O.poly('roof', s ? [P(a0, l0, y0), P(a0, l1, y0), P(a0, l1, y0 + t), P(a0, l0, y0 + t)] : [P(a0, l1, y0), P(a0, l0, y0), P(a0, l0, y0 + t), P(a0, l1, y0 + t)]); }
    for (const l of [0, L]) { const tri = [P(0, l, top), P(A, l, top), P(A / 2, l, top + rise)]; O.poly('wall', l === 0 ? (along ? tri : tri.slice().reverse()) : (along ? tri.slice().reverse() : tri)); }
    const rp = along ? [[-ov, top + rise + 0.22, d / 2], [w + ov, top + rise + 0.22, d / 2]] : [[w / 2, top + rise + 0.22, -ov], [w / 2, top + rise + 0.22, d + ov]];
    O.tube('trim', rp, () => 0.12, 8);
    if (r.chance(0.7)) { const x = along ? w * r.range(0.25, 0.75) : w * 0.5 + r.range(-0.2, 0.2) * w, z = along ? d * 0.5 + r.range(-0.2, 0.2) * d : d * r.range(0.25, 0.75); O.box('wall', x - 0.35, top, z - 0.35, x + 0.35, top + rise + 1.1, z + 0.35); O.box('trim', x - 0.45, top + rise + 1.1, z - 0.45, x + 0.45, top + rise + 1.22, z + 0.45); }
  },
  onion(O, { F, w, d, cx, cz, m, top, S, fat, tall, r }) {
    slab(O, { w, d, top });
    const R = m * 0.6, dh = 0.9 + 0.5 * tall;
    // a square plinth, the drum with its slit windows and cornice, the bulb
    O.box('wall', cx - R * 1.12, top, cz - R * 1.12, cx + R * 1.12, top + 0.5, cz + R * 1.12);
    O.lathe('wall', cx, cz, [[R, top + 0.5], [R, top + 0.5 + dh]], S(28));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2, c = Math.cos(a), s = Math.sin(a), x = cx + c * (R + 0.02), z = cz + s * (R + 0.02), t = [-s * 0.2, c * 0.2];
      O.poly('glass', [[x + t[0], top + 0.75, z + t[1]], [x - t[0], top + 0.75, z - t[1]], [x - t[0], top + 0.3 + dh, z - t[1]], [x + t[0], top + 0.3 + dh, z + t[1]]].reverse()); }
    O.lathe('trim', cx, cz, [[R, top + 0.5 + dh - 0.05], [R + 0.18, top + 0.55 + dh], [R + 0.18, top + 0.72 + dh], [R * 0.95, top + 0.75 + dh]], S(28));
    onion(O, cx, cz, top + 0.72 + dh, R, R * 2.3 * tall, S(28), fat);
    // turrets at the corners, each with its own small bulb
    if (F.turrets) { const rt = Math.max(0.5, Math.min(1.0, m * 0.18)), ht = top + 1.4 + r.range(0, 1.2);
      for (const [x, z] of [[0, 0], [w, 0], [0, d], [w, d]]) { O.lathe('wall', x, z, [[rt * 1.15, -0.4], [rt * 1.1, 0.4], [rt, 0.5], [rt, ht]], S(16)); O.lathe('trim', x, z, [[rt, ht - 0.05], [rt + 0.12, ht], [rt + 0.12, ht + 0.16], [rt * 0.92, ht + 0.2]], S(16)); onion(O, x, z, ht + 0.2, rt * 0.92, rt * 2.4 * tall, S(16), fat); } }
  },
  dome(O, { F, w, d, cx, cz, m, top, S, tall }) {
    // a dome over the whole building: its foot a squared ring that covers the walls, rounding to a circle as it rises
    const hx = w / 2 + 0.28, hz = d / 2 + 0.28, H = m * (0.85 + 0.4 * tall);
    const f = (u, v) => { const ph = u * Math.PI / 2 * 0.94, p = 4 - 2 * u, a = v * TAU, c = Math.cos(ph); return [cx + hx * c * sq(Math.cos(a), p), top + 0.12 + H * Math.sin(ph), cz + hz * c * sq(Math.sin(a), p)]; };
    O.param('roof', f, S(16), S(40));
    // a cornice round the foot, the lantern on top with its glass, ribs up the shell
    O.param('trim', (u, v) => { const a = v * TAU, k = 1.0 + 0.05 * Math.sin(u * Math.PI); return [cx + hx * k * sq(Math.cos(a), 4), top - 0.2 + u * 0.36, cz + hz * k * sq(Math.sin(a), 4)]; }, 3, S(40));
    const ty = f(1, 0)[1], tr = Math.hypot(f(1, 0)[0] - cx, f(1, 0)[2] - cz) * 0.9 + 0.3;
    O.lathe('glass', cx, cz, [[tr, ty - 0.1], [tr, ty + 0.8]], S(16)); O.lathe('roof', cx, cz, [[tr + 0.12, ty + 0.8], [tr + 0.12, ty + 0.95], [tr * 0.7, ty + 1.2], [0.08, ty + 1.45], [0.04, ty + 2.2], [0, ty + 2.3]], S(16));
    if (F.ribs && O.lod >= 0.5) for (let k = 0; k < 12; k++) { const v = k / 12, pts = []; for (let i = 0; i <= 10; i++) { const p = f(i / 10, v), q = [p[0] - cx, 0, p[2] - cz], l = Math.hypot(q[0], q[2]) || 1; pts.push([p[0] + q[0] / l * 0.06, p[1] + 0.04, p[2] + q[2] / l * 0.06]); } O.tube('trim', pts, () => 0.09, 6); }
  },
  cap(O, { F, w, d, cx, cz, m, top, S, fat, tall, r }) {
    // a mushroom's cap over the building: wide past its walls, lumpy at the rim, gills underneath, spots on it
    slab(O, { w, d, top });
    const sx = w / 2 * 1.62 * fat, sz = d / 2 * 1.62 * fat, H = m * (1.0 + 0.6 * tall), ph = r.range(0, TAU), lobes = F.lobes;
    const prof = smooth([[0.0, 0.05], [0.45, 0.02], [0.9, -0.02], [1.0, -0.14], [1.04, -0.05], [1.0, 0.14], [0.86, 0.46], [0.6, 0.76], [0.3, 0.94], [0.0, 1.0]], 22).map(([a, b]) => [a, top + 0.25 + b * H]);
    const wob = (a, u) => 1 + 0.06 * Math.sin(lobes * a + ph) * Math.min(1, u * 3) + 0.025 * Math.sin(2.3 * lobes * a + ph * 2);
    O.lathe('roof', cx, cz, prof, S(48), sx, sz, wob);
    // the gills: fins round the underside from the stem out to the rim
    const n = Math.round(56 * O.lod); for (let i = 0; i < n; i++) { const a = i / n * TAU, k = wob(a, 0.4), c = Math.cos(a), s = Math.sin(a), P = (f, y) => [cx + c * sx * k * f, y, cz + s * sz * k * f];
      const y0 = top + 0.25 + 0.03 * H, y1 = top + 0.25 - 0.1 * H; O.poly('dark', [P(0.62, y0), P(0.97, y1), P(0.97, y1 + 0.02), P(0.62, y0 + 0.02)]); O.poly('dark', [P(0.62, y0 + 0.02), P(0.97, y1 + 0.02), P(0.97, y1 - 0.25), P(0.62, y0 - 0.12)].reverse()); }
    // spots: low bumps on the cap
    for (let i = 0; i < 14 * O.lod; i++) { const u = r.range(0.25, 0.85), a = r.range(0, TAU), t = u * (prof.length - 1), k = Math.floor(t), f = t - k, rr = prof[k][0] + (prof[k + 1][0] - prof[k][0]) * f, y = prof[k][1] + (prof[k + 1][1] - prof[k][1]) * f, kk = wob(a, u), x = cx + Math.cos(a) * rr * sx * kk, z = cz + Math.sin(a) * rr * sz * kk, R = r.range(0.25, 0.7) * Math.max(1, m / 5);
      O.lathe('trim', x, z, [[R, y - 0.15], [R * 0.9, y + 0.05], [R * 0.6, y + 0.14], [0, y + 0.18]], 10); }
    // the roots: curved buttresses flaring from each corner into the ground
    for (const [x, z, ax, az] of [[0, 0, -1, -1], [w, 0, 1, -1], [0, d, -1, 1], [w, d, 1, 1]]) {
      O.tube('wall', bez([x - ax * 0.1, Math.min(top, 3.2), z - az * 0.1], [x + ax * 0.15, 0.8, z + az * 0.15], [x + ax * 1.1, -0.3, z + az * 1.1], 8), t => 0.42 - 0.18 * t + 0.3 * t * t, 10); }
  },
  cone(O, { F, w, d, cx, cz, m, top, S, tall, r }) {
    // a tall round roof over the whole house, wider than its walls, the rafters' ends bundled out of its top
    slab(O, { w, d, top });
    const sx = w / 2 * 1.6, sz = d / 2 * 1.6, H = Math.max(w, d) * (0.55 + 0.35 * tall), bulge = r.range(-0.04, 0.08);
    const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push([(1 - t) * (1 + bulge * Math.sin(Math.PI * t)), top - 0.4 + t * H]); }
    O.lathe('roof', cx, cz, [[0.62, top + 0.1], [1.02, top - 0.55], [1.0, top - 0.4], ...prof.slice(1)], S(40), sx, sz);
    const ay = top - 0.4 + H; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3; O.tube('trim', [[cx, ay - 1.2, cz], [cx + Math.cos(a) * 0.6, ay + 0.9 + r.range(0, 0.6), cz + Math.sin(a) * 0.6]], t => 0.07 - 0.03 * t, 6); }
    O.lathe('trim', cx, cz, [[0.16, ay - 0.8], [0.22, ay - 0.5], [0.12, ay - 0.2], [0, ay + 0.1]], 10);
    // posts carrying the eave, round the sides and back
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, x = cx + Math.cos(a) * sx * 0.88, z = cz + Math.sin(a) * sz * 0.88; if (z < 0.5) continue; O.tube('trim', [[x, -0.2, z], [x, top - 0.2, z]], () => 0.12, 8); }
  },
  pagoda(O, { F, w, d, cx, cz, top, S, tall, r }) {
    // tiers of flared roofs, each over a smaller storey, the corners swept up, a finial of rings on top
    let hx = w / 2, hz = d / 2, y = top; const tiers = F.tiers, up = 0.5 + F.flare;
    for (let k = 0; k < tiers; k++) {
      const ov = 1.1 + 0.5 * F.flare + (k === 0 ? 0.6 : 0), rise = (hx + hz) * 0.18 * tall + 0.6, ex = hx + ov, ez = hz + ov;
      const f = (lift) => (u, v) => { const a = v * TAU, c = Math.cos(a), s = Math.sin(a), corner = Math.pow(Math.abs(Math.sin(2 * a)), 3), X = sq(c, 10), Z = sq(s, 10);
        return [cx + X * (hx + (ex - hx) * u), y + rise * (1 - u) * (1 - u) * 1.0 - 0.15 + up * corner * u * u * u + lift, cz + Z * (hz + (ez - hz) * u)]; };
      O.param('roof', f(0.22), S(6), S(48), true); O.param('dark', f(0), S(4), S(48));
      O.param('trim', (u, v) => { const p = f(0)(1, v); return [p[0], p[1] + u * 0.22, p[2]]; }, 1, S(48), true);
      const nh = 1.7 + 0.6 * tall; hx *= 0.72; hz *= 0.72; const yb = y + rise - 0.2;
      if (k < tiers - 1) { O.box('wall', cx - hx, yb, cz - hz, cx + hx, yb + nh, cz + hz); for (const s of [-1, 1]) { O.poly('glass', [[cx - hx * 0.6, yb + 0.5, cz + s * (hz + 0.02)], [cx + hx * 0.6, yb + 0.5, cz + s * (hz + 0.02)], [cx + hx * 0.6, yb + nh - 0.35, cz + s * (hz + 0.02)], [cx - hx * 0.6, yb + nh - 0.35, cz + s * (hz + 0.02)]][s > 0 ? 'slice' : 'reverse']()); } y = yb + nh; }
      else { y = yb; }
    }
    const t = y + 0.2; O.lathe('metal', cx, cz, [[0.35, t - 0.2], [0.3, t + 0.4], [0.5, t + 0.5], [0.12, t + 0.65], [0.1, t + 1.0], [0.4, t + 1.05], [0.1, t + 1.15], [0.1, t + 1.5], [0.32, t + 1.55], [0.08, t + 1.65], [0.04, t + 2.6], [0, t + 2.8]], 12);
  },
  ziggurat(O, { F, w, d, cx, cz, top, r, tall }) {
    // steps receding up off the roof, a shrine on the last; beam ends out of the walls under a crenellated parapet; battered piers at the corners
    if (O.lod >= 0.5) for (let x = 0; x < w; x += 1.2) O.box('trim', x - 0.1 + 0.6, top - 0.6, -0.5, x + 0.1 + 0.6, top - 0.4, 0.02), O.box('trim', x - 0.1 + 0.6, top - 0.6, d - 0.02, x + 0.1 + 0.6, top - 0.4, d + 0.5);
    if (O.lod >= 0.5) for (let z = 0.6; z < d; z += 1.2) O.box('trim', -0.5, top - 0.6, z - 0.1, 0.02, top - 0.4, z + 0.1), O.box('trim', w - 0.02, top - 0.6, z - 0.1, w + 0.5, top - 0.4, z + 0.1);
    for (const [x0, z0, x1, z1] of [[-0.05, -0.05, w + 0.05, 0.35], [-0.05, d - 0.35, w + 0.05, d + 0.05], [-0.05, 0.35, 0.35, d - 0.35], [w - 0.35, 0.35, w + 0.05, d - 0.35]]) {
      O.box('wall', x0, top, z0, x1, top + 0.55, z1);
      const L = Math.max(x1 - x0, z1 - z0), n = Math.floor(L / 0.9); for (let i = 0; i < n; i += 2) { const a = i * 0.9 + 0.2; if (x1 - x0 > z1 - z0) O.box('wall', x0 + a, top + 0.55, z0, x0 + a + 0.6, top + 0.95, z1); else O.box('wall', x0, top + 0.55, z0 + a, x1, top + 0.95, z0 + a + 0.6); } }
    let ix = 1.6, iz = 1.6, y = top; const steps = Math.max(1, Math.min(3, F.tiers - (w < 9 ? 1 : 0)));
    for (let k = 0; k < steps && w - 2 * ix > 2.5 && d - 2 * iz > 2.5; k++) { const h = 1.6 + 0.8 * tall; O.box('wall', ix, y, iz, w - ix, y + h, d - iz); O.box('trim', ix - 0.12, y + h, iz - 0.12, w - ix + 0.12, y + h + 0.16, d - iz + 0.12); y += h + 0.16; ix += 1.4; iz += 1.2; }
    // the shrine's dark doorway, facing the street
    O.poly('dark', [[cx - 0.5, y - 1.5, iz - 1.2 - 0.01], [cx + 0.5, y - 1.5, iz - 1.2 - 0.01], [cx + 0.5, y - 0.3, iz - 1.2 - 0.01], [cx - 0.5, y - 0.3, iz - 1.2 - 0.01]].reverse());
    for (const [x, z] of [[0, 0], [w, 0], [0, d], [w, d]]) { O.frustum('wall', x, z, 1.5, 0.75, -0.3, top + 0.5); O.frustum('trim', x, z, 0.95, 0.9, top + 0.5, top + 0.66); O.frustum('wall', x, z, 0.7, 0.45, top + 0.66, top + 1.4); }
  },
  spire(O, { F, w, d, cx, cz, m, top, S, tall, door }) {
    // a needle off the roof, pinnacles at the corners, buttresses stepping down to the ground, a pointed gable over the door
    slab(O, { w, d, top });
    const H = Math.max(w, d) * (0.9 + 0.6 * tall), bx = Math.min(w, d) * 0.36, n = 8, apex = [cx, top + H, cz], base = i => { const a = (i + 0.5) / n * TAU; return [cx + Math.cos(a) * bx / Math.cos(Math.PI / n), top + 0.6, cz + Math.sin(a) * bx / Math.cos(Math.PI / n)]; };
    O.box('wall', cx - bx * 1.05, top, cz - bx * 1.05, cx + bx * 1.05, top + 0.6, cz + bx * 1.05);
    for (let i = 0; i < n; i++) O.poly('roof', [base(i + 1), base(i), apex]);
    for (let i = 0; i < n; i++) O.tube('trim', [base(i).map((v, k) => k === 1 ? v - 0.05 : v), [cx, top + H - 0.3, cz]], t => 0.11 - 0.07 * t, 5);
    O.tube('metal', [[cx, top + H - 0.4, cz], [cx, top + H + 1.6, cz]], t => 0.07 - 0.04 * t, 6); O.lathe('metal', cx, cz, [[0.0, top + H + 0.6], [0.18, top + H + 0.7], [0, top + H + 0.8]], 8);
    for (const [x, z] of [[0, 0], [w, 0], [0, d], [w, d]]) { const ph = 0.6, y0 = top - 0.6, y1 = top + 1.8 + 0.6 * tall; O.box('wall', x - ph / 2, y0, z - ph / 2, x + ph / 2, y1, z + ph / 2); O.lathe('roof', x, z, [[ph * 0.72, y1], [0, y1 + 1.8 * tall + 0.6]], 4, 1, 1);
      // a diagonal buttress in two steps
      const sx = x ? 1 : -1, sz = z ? 1 : -1; O.obox('wall', x + sx * 0.55, z + sz * 0.55, 0.45, 1.3, -0.2, top * 0.55, Math.PI / 4 * (sx * sz)); O.obox('wall', x + sx * 0.4, z + sz * 0.4, 0.45, 0.9, top * 0.55, top * 0.85, Math.PI / 4 * (sx * sz)); }
    // the gable over the door: two steep slopes standing off the front wall
    const gx = door.x, gw = Math.min(w - 1, door.w + 1.0), gy = 2.45, gh = gw * 0.7;
    O.poly('wall', [[gx - gw / 2, gy, -0.03], [gx + gw / 2, gy, -0.03], [gx, gy + gh, -0.03]].reverse());
    for (const s of [-1, 1]) { const q = [[gx, gy + gh + 0.12, 0.3], [gx, gy + gh + 0.12, -0.5], [gx + s * (gw / 2 + 0.25), gy - 0.12, -0.5], [gx + s * (gw / 2 + 0.25), gy - 0.12, 0.3]], u = q.map(p => [p[0], p[1] - 0.14, p[2]]); O.poly('roof', s > 0 ? q.slice().reverse() : q); O.poly('dark', s > 0 ? u : u.slice().reverse()); O.poly('roof', [q[1], q[2], u[2], u[1]][s > 0 ? 'slice' : 'reverse']()); }
  },
  orb(O, { F, w, d, cx, cz, m, top, S, fat, r }) {
    // a great orb on a collar, a glass band round its middle, a ring held off it on struts
    slab(O, { w, d, top });
    const R = m * 0.95 * fat, yc = top + R * 0.82;
    O.lathe('trim', cx, cz, [[R * 1.05, top], [R * 0.9, top + 0.5], [R * 0.6, top + R * 0.3]], S(32));
    const sph = (a, b) => smooth(Array.from({ length: 9 }, (_, i) => { const p = -Math.PI / 2 + Math.PI * (a + (b - a) * i / 8); return [Math.cos(p) * R, yc + Math.sin(p) * R]; }), 10);
    O.lathe('roof', cx, cz, sph(0.08, 0.44), S(40)); O.lathe('glass', cx, cz, sph(0.44, 0.58), S(40)); O.lathe('roof', cx, cz, sph(0.58, 1), S(40));
    const RR = R * 1.42, yr = yc + R * 0.05; O.param('metal', (u, v) => { const a = v * TAU, q = u * TAU; return [cx + Math.cos(a) * (RR + Math.cos(q) * 0.16), yr + Math.sin(q) * 0.16, cz + Math.sin(a) * (RR + Math.cos(q) * 0.16)]; }, 6, S(48), true);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; O.tube('metal', [[cx + Math.cos(a) * R * 0.98, yr, cz + Math.sin(a) * R * 0.98], [cx + Math.cos(a) * RR, yr, cz + Math.sin(a) * RR]], () => 0.07, 6); }
    O.tube('metal', [[cx, yc + R - 0.1, cz], [cx, yc + R + 2.4, cz]], t => 0.06 - 0.03 * t, 6);
  },
  shell(O, { F, w, d, cx, cz, m, top, S, tall, r }) {
    // shells swept up off the roof toward the street, one over another, glass under their front edges
    slab(O, { w, d, top });
    const n = r.chance(0.5) ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const sc = 1 - k * 0.22, W = (w / 2 + 0.6) * sc, x0 = cx + (k ? (k % 2 ? 1 : -1) * w * 0.12 : 0), zb = d + 0.4 - k * d * 0.18, ov = (1.6 + 1.5 * tall) * sc, Hs = (m * 1.1 + 2) * tall * sc, L = zb + ov;
      const f = th => (u, v) => { const t = 2 * v - 1, half = W * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.6) * (1 - 0.15 * u), y = top + 0.3 + Hs * Math.sin(Math.PI * 0.8 * u) * (1 - 0.25 * u) + 1.4 * sc * (1 - t * t) * Math.sin(Math.PI * u) - (1 - t * t) * 0 - th;
        return [x0 + t * half, y, zb - L * u]; };
      O.param('roof', f(0), S(16), S(20), true); O.param('wall', f(0.18), S(16), S(20));
      O.param('trim', (u, v) => { const a = f(0)(u, v > 0.5 ? 1 : 0), b = f(0.18)(u, v > 0.5 ? 1 : 0); return [a[0] + (b[0] - a[0]) * (v > 0.5 ? 2 - 2 * v : 2 * v), a[1] + (b[1] - a[1]) * (v > 0.5 ? 2 - 2 * v : 2 * v), a[2]]; }, S(16), 4);
    }
  },
  stack(O, { F, w, d, cx, cz, top, r, tall }) {
    // storeys stacked on the roof, each turned off the one below and hung out past it, glass in bands round them
    let y = top, a = 0; const n = 1 + Math.round(r.range(0.6, 2.4) * tall);
    for (let k = 0; k < n; k++) { a += (F.twist > 0 ? 1 : -1) * r.range(0.25, 0.7); const bw = w * r.range(0.7, 1.05), bd = d * r.range(0.6, 0.95), h = 3.1, ox = cx + r.range(-0.15, 0.15) * w, oz = cz + r.range(-0.15, 0.15) * d;
      O.obox('wall', ox, oz, bw, bd, y, y + h, a); O.obox('glass', ox, oz, bw + 0.04, bd + 0.04, y + 0.9, y + 2.2, a); O.obox('trim', ox, oz, bw + 0.3, bd + 0.3, y + h, y + h + 0.22, a); y += h + 0.22; }
  },
  twist(O, { F, w, d, cx, cz, m, top, S, tall }) {
    // a tower twisting up off the roof, tapering, banded
    slab(O, { w, d, top });
    const b = m * 0.8, H = (w + d) * 0.45 * tall + 6, tw = F.twist * Math.PI;
    const f = (u, v) => { const a = v * TAU + tw * u, k = b * (1 - 0.55 * u), c = Math.cos(a - tw * u), s = Math.sin(a - tw * u), X = sq(c, 6) * k, Z = sq(s, 6) * k, ca = Math.cos(tw * u), sa = Math.sin(tw * u); return [cx + X * ca - Z * sa, top + u * H, cz + X * sa + Z * ca]; };
    O.param('roof', f, S(24), S(36));
    for (let y = 3; y < H - 1; y += 3.2) { const u = y / H; O.param('glass', (q, v) => { const p = f(u + q * 1.6 / H, v), dx = p[0] - cx, dz = p[2] - cz, l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 0.1, p[1], p[2] + dz / l * 0.1]; }, 1, S(36)); }
    O.lathe('metal', cx, cz, [[b * 0.4, top + H - 0.1], [b * 0.3, top + H + 0.3], [0.06, top + H + 0.4], [0.03, top + H + 4], [0, top + H + 4.1]], 10);
  },
  horn(O, { F, w, d, cx, cz, m, top, S, tall, r }) {
    // horns curving up off the corners and edges toward a crown, ribs arching over the roof front to back, a bulb at the heart
    slab(O, { w, d, top });
    const H = m * 1.6 * tall + 3, n = 4 + (r.chance(0.5) ? 2 : 0), pts = [[0, 0], [w, 0], [w, d], [0, d], [w / 2, -0.2], [w / 2, d + 0.2]].slice(0, n);
    for (const [x, z] of pts) { const tx = cx + (x - cx) * 0.18, tz = cz + (z - cz) * 0.18, ox = x + (x - cx) * 0.25, oz = z + (z - cz) * 0.25;
      O.tube('roof', bez([x, top - 0.8, z], [ox, top + H * 0.75, oz], [tx, top + H, tz], 10), t => (0.08 + 0.85 * Math.pow(1 - t, 1.3)) * Math.max(0.9, m / 5), 12); }
    for (let k = 1; k <= 2; k++) { const x = w * k / 3; O.tube('roof', bez([x, top - 0.2, -0.1], [x, top + H * 0.55, d / 2], [x, top - 0.2, d + 0.1], 12), () => 0.18 * Math.max(1, m / 5), 8); }
    O.lathe('trim', cx, cz, smooth([[m * 0.35, top], [m * 0.5, top + m * 0.3], [m * 0.42, top + m * 0.6], [m * 0.15, top + m * 0.85], [0, top + m * 0.9]], 10), S(20));
  },
};
