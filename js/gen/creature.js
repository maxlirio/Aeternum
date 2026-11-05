// A species' skin. All its soft shapes are summed into one field and a surface is drawn through it, so limbs
// grow out of the body with no seams, and each point is weighted to the nearest bones so it bends as flesh does.
// Pure (typed arrays only): the same surface at two levels of detail, built once per species when first needed.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function primDist(P, x, y, z) {   // distance to a round cone (squashed by flat/wide)
  const ax = P.a[0], ay = P.a[1], az = P.a[2], fy = 1 / P.flat, fx = 1 / P.wide;
  const px = (x - ax) * fx, py = (y - ay) * fy, pz = z - az, bx = (P.b[0] - ax) * fx, by = (P.b[1] - ay) * fy, bz = P.b[2] - az, l2 = bx * bx + by * by + bz * bz;
  let t = l2 > 1e-9 ? (px * bx + py * by + pz * bz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, r = P.ra + (P.rb - P.ra) * t;
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - r) * Math.min(P.flat, P.wide, 1);
}

export function skinOf(R, res, coat, pattern, patSeed) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const P of R.prims) { const m = Math.max(P.ra, P.rb) * Math.max(P.wide, 1) + 0.02; for (const q of [P.a, P.b]) { x0 = Math.min(x0, q[0] - m); x1 = Math.max(x1, q[0] + m); y0 = Math.min(y0, q[1] - m); y1 = Math.max(y1, q[1] + m); z0 = Math.min(z0, q[2] - m); z1 = Math.max(z1, q[2] + m); } }
  const pad = 0.03 * Math.max(x1 - x0, y1 - y0, z1 - z0); x0 -= pad; y0 -= pad; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
  const s = Math.max(x1 - x0, y1 - y0, z1 - z0) / res, nx = Math.ceil((x1 - x0) / s) + 1, ny = Math.ceil((y1 - y0) / s) + 1, nz = Math.ceil((z1 - z0) / s) + 1;
  const F = new Float32Array(nx * ny * nz).fill(1e3), I = (a, b, c) => a + nx * (b + ny * c);
  for (const P of R.prims) {
    const m = Math.max(P.ra, P.rb) * Math.max(P.wide, 1) + P.k * 0.5 + s * 2;
    const a0 = Math.max(0, Math.floor((Math.min(P.a[0], P.b[0]) - m - x0) / s)), a1 = Math.min(nx - 1, Math.ceil((Math.max(P.a[0], P.b[0]) + m - x0) / s));
    const b0 = Math.max(0, Math.floor((Math.min(P.a[1], P.b[1]) - m - y0) / s)), b1 = Math.min(ny - 1, Math.ceil((Math.max(P.a[1], P.b[1]) + m - y0) / s));
    const c0 = Math.max(0, Math.floor((Math.min(P.a[2], P.b[2]) - m - z0) / s)), c1 = Math.min(nz - 1, Math.ceil((Math.max(P.a[2], P.b[2]) + m - z0) / s));
    const k = Math.max(s * 0.8, P.k * Math.min(P.ra, P.rb, 1) * 2 + 0.005);
    for (let c = c0; c <= c1; c++) for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const i = I(a, b, c); F[i] = smin(F[i], primDist(P, x0 + a * s, y0 + b * s, z0 + c * s), k); }
  }
  // surface nets: one vertex per cell the surface passes through, quads between neighbours
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [], tri = [];
  const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], EDGE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let c = 0; c < nz - 1; c++) for (let b = 0; b < ny - 1; b++) for (let a = 0; a < nx - 1; a++) {
    let mask = 0; for (let k = 0; k < 8; k++) if (F[I(a + CORN[k][0], b + CORN[k][1], c + CORN[k][2])] < 0) mask |= 1 << k;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of EDGE) { const q0 = (mask >> e0) & 1, q1 = (mask >> e1) & 1; if (q0 === q1) continue;
      const C0 = CORN[e0], C1 = CORN[e1], f0 = F[I(a + C0[0], b + C0[1], c + C0[2])], f1 = F[I(a + C1[0], b + C1[1], c + C1[2])], t = f0 / (f0 - f1);
      sx += C0[0] + (C1[0] - C0[0]) * t; sy += C0[1] + (C1[1] - C0[1]) * t; sz += C0[2] + (C1[2] - C0[2]) * t; n++; }
    vid[I(a, b, c)] = pos.length / 3; pos.push(x0 + (a + sx / n) * s, y0 + (b + sy / n) * s, z0 + (c + sz / n) * s);
  }
  for (let c = 1; c < nz - 1; c++) for (let b = 1; b < ny - 1; b++) for (let a = 1; a < nx - 1; a++) {
    const f = F[I(a, b, c)] < 0;
    const quad = (p, q, u, v) => { if (p < 0 || q < 0 || u < 0 || v < 0) return; if (f) tri.push(p, q, u, u, q, v); else tri.push(p, u, q, q, u, v); };
    if (f !== (F[I(a + 1, b, c)] < 0)) quad(vid[I(a, b - 1, c - 1)], vid[I(a, b, c - 1)], vid[I(a, b - 1, c)], vid[I(a, b, c)]);
    if (f !== (F[I(a, b + 1, c)] < 0)) quad(vid[I(a - 1, b, c - 1)], vid[I(a - 1, b, c)], vid[I(a, b, c - 1)], vid[I(a, b, c)]);
    if (f !== (F[I(a, b, c + 1)] < 0)) quad(vid[I(a - 1, b - 1, c)], vid[I(a, b - 1, c)], vid[I(a - 1, b, c)], vid[I(a, b, c)]);
  }
  const nv = pos.length / 3, nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), ski = new Uint16Array(nv * 4), skw = new Float32Array(nv * 4);
  const fAt = (x, y, z) => { const fa = (x - x0) / s, fb = (y - y0) / s, fc = (z - z0) / s, a = Math.max(0, Math.min(nx - 2, Math.floor(fa))), b = Math.max(0, Math.min(ny - 2, Math.floor(fb))), c = Math.max(0, Math.min(nz - 2, Math.floor(fc))), u = fa - a, v = fb - b, w = fc - c;
    const L = (i, j, k) => F[I(a + i, b + j, c + k)]; return (L(0, 0, 0) * (1 - u) + L(1, 0, 0) * u) * (1 - v) * (1 - w) + (L(0, 1, 0) * (1 - u) + L(1, 1, 0) * u) * v * (1 - w) + (L(0, 0, 1) * (1 - u) + L(1, 0, 1) * u) * (1 - v) * w + (L(0, 1, 1) * (1 - u) + L(1, 1, 1) * u) * v * w; };
  const hsh = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7 + patSeed) * 43758.5453; return v - Math.floor(v); };
  let yMin = 1e9, yMax = -1e9; for (let i = 1; i < pos.length; i += 3) { yMin = Math.min(yMin, pos[i]); yMax = Math.max(yMax, pos[i]); }
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const e = s * 0.9; let gx = fAt(x + e, y, z) - fAt(x - e, y, z), gy = fAt(x, y + e, z) - fAt(x, y - e, z), gz = fAt(x, y, z + e) - fAt(x, y, z - e); const gl = Math.hypot(gx, gy, gz) || 1; nrm[i * 3] = gx / gl; nrm[i * 3 + 1] = gy / gl; nrm[i * 3 + 2] = gz / gl;
    // which shape, which bones
    const near = []; let bestTag = 0, bd = 1e9;
    for (const P of R.prims) { const d = primDist(P, x, y, z); if (d < bd) { bd = d; bestTag = P.tag; } near.push([P.bone, d]); }
    const byB = new Map(); for (const [bn, d] of near) if (!byB.has(bn) || d < byB.get(bn)) byB.set(bn, d);
    const ord = [...byB.entries()].sort((a, b) => a[1] - b[1]).slice(0, 4), span = Math.max(s * 2.5, 0.015 + R.prims[0].ra * 0.25); let tot = 0;
    const w = ord.map(([, d]) => { const v = Math.exp(-(d - ord[0][1]) / span * 2.4); tot += v; return v; });
    ord.forEach(([bn], k) => { ski[i * 4 + k] = bn; skw[i * 4 + k] = w[k] / tot; });
    // colour: dark back, pale belly, markings along the flanks
    const ht = (y - yMin) / Math.max(1e-3, yMax - yMin), up = nrm[i * 3 + 1];
    const belly = Math.max(0, Math.min(1, (-0.42 - up) * 2.6));
    let c = [0, 1, 2].map(k => coat[0][k] + (coat[1][k] - coat[0][k]) * belly);
    let mark = 0;
    if (pattern === 0) { const v = Math.sin(z * 5.2 / R.prims[0].ra * 0.28 + Math.sin(y * 2) * 1.2); mark = v > 0.35 ? Math.min(1, (v - 0.35) * 5) * Math.max(0, up + 0.25) : 0; }                                 // saddle bands
    else if (pattern === 1) { const sc = 3.4 / R.prims[0].ra * 0.3, a = Math.floor(z * sc), b = Math.floor((y + Math.abs(x)) * sc), cx = (a + 0.5 + 0.5 * (hsh(a, b) - 0.5)) / sc, cy = (b + 0.5 + 0.5 * (hsh(b, a) - 0.5)) / sc, dq = Math.hypot(z - cx, y + Math.abs(x) - cy) * sc; mark = hsh(a + 7, b) > 0.45 && dq < 0.35 ? 1 - dq / 0.35 : 0; mark = Math.min(1, mark * 3) * Math.max(0, up + 0.4); }   // dapples
    else if (pattern === 2) { mark = up > 0.72 ? Math.min(1, (up - 0.72) * 6) : 0; }                                                                                                                    // dark dorsal stripe
    c = c.map((v, k) => v + (coat[2][k] - v) * mark);
    if (bestTag === 1) c = c.map((v, k) => v + (coat[1][k] - v) * 0.8);
    if (bestTag === 2) c = c.map((v, k) => v + (coat[2][k] - v) * 0.8);
    if (bestTag === 3) c = coat[3].slice();
    const j = (0.94 + 0.12 * hsh(x * 13, z * 13)) * 0.8; col[i * 3] = c[0] ** 1.5 * j; col[i * 3 + 1] = c[1] ** 1.5 * j; col[i * 3 + 2] = c[2] ** 1.5 * j;     // (coats are written in display colour; the shader wants light)
  }
  // wings: thin sheets on their own bones
  const pos2 = Array.from(pos), nrm2 = Array.from(nrm), col2 = Array.from(col), ski2 = Array.from(ski), skw2 = Array.from(skw), tri2 = tri.slice();
  for (const W of R.fans || []) {
    const base = pos2.length / 3, n = W.pts.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const p = W.pts[i], c2 = j === 0 ? W.cord * 0.3 : -W.cord * (1 - i * 0.28); pos2.push(p[0], p[1], p[2] + c2); nrm2.push(0, 1, 0); const k = j ? 0.75 : 1; col2.push(coat[1][0] * k, coat[1][1] * k, coat[1][2] * k); ski2.push(W.bones[i], 0, 0, 0); skw2.push(1, 0, 0, 0); }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; tri2.push(a, a + 1, a + 2, a + 2, a + 1, a + 3, a, a + 2, a + 1, a + 2, a + 3, a + 1); }
  }
  return { pos: new Float32Array(pos2), nrm: new Float32Array(nrm2), col: new Float32Array(col2), ski: new Uint16Array(ski2), skw: new Float32Array(skw2), idx: new Uint32Array(tri2) };
}
