// Builds the small things from their designs (gen/smallgen.js) while the game runs, in the kit's own
// part format. Front is -z, the ground is y = 0, and anything standing on the ground goes a metre into it.
import * as THREE from 'three';
import { Parts, partsOut } from './housegen.js';
import { smallById } from '../gen/smallgen.js';

const ring = (P, m, cx, y0, cz, r0, r1, h, seg = 12) => { const a = i => i / seg * Math.PI * 2; for (let i = 0; i < seg; i++) { const c0 = Math.cos(a(i)), s0 = Math.sin(a(i)), c1 = Math.cos(a(i + 1)), s1 = Math.sin(a(i + 1)); P.face(m, [[cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r1, y0 + h, cz + s0 * r1], [cx + c1 * r1, y0 + h, cz + s1 * r1], [cx + c1 * r0, y0, cz + s1 * r0]]); } };
const cap = (P, m, cx, y, cz, r, seg = 12, up = true) => { const pts = []; for (let i = 0; i < seg; i++) { const a = (up ? -1 : 1) * i / seg * Math.PI * 2; pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); } P.face(m, pts); };
const drum = (P, m, cx, y0, cz, r, h, seg = 12, r1 = r) => { ring(P, m, cx, y0, cz, r, r1, h, seg); cap(P, m, cx, y0 + h, cz, r1, seg); };
const cone = (P, m, cx, y0, cz, r, h, seg = 12) => { for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2; P.face(m, [[cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], [cx, y0 + h, cz], [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r]]); } };
const ball = (P, m, cx, y, cz, r, seg = 10, rows = 6) => { for (let j = 0; j < rows; j++) { const p0 = -Math.PI / 2 + j / rows * Math.PI, p1 = p0 + Math.PI / rows; ring(P, m, cx, y + Math.sin(p0) * r, cz, Math.max(0.001, Math.cos(p0) * r), Math.max(0.001, Math.cos(p1) * r), (Math.sin(p1) - Math.sin(p0)) * r, seg); } };
const steps = (P, m, n, w, top = 0.3) => { let y = -1, W = w; const h = n ? top / n : top; P.box(m, 0, -1, 0, w, 1 + h, w); y = h; for (let i = 1; i < n; i++) { W -= 0.6; P.box(m, 0, y, 0, W, h, W); y += h; } return y; };
const gable = (P, m, tr, w, d, y, rise, over = 0.2) => { const X = w / 2 + over, Z = d / 2 + over; P.face(m, [[-X, y, -Z], [-X, y + rise, 0], [X, y + rise, 0], [X, y, -Z]]); P.face(m, [[X, y, Z], [X, y + rise, 0], [-X, y + rise, 0], [-X, y, Z]]); P.face(tr, [[-X, y, Z], [-X, y + rise, 0], [-X, y, -Z]]); P.face(tr, [[X, y, -Z], [X, y + rise, 0], [X, y, Z]]); P.face(tr, [[-X, y, -Z], [X, y, -Z], [X, y, Z], [-X, y, Z]]); };

const BUILD = {
  villagewell(P, D) { const { r, h, stone, frame, roof, top } = D, m = stone;
    if (D.shape === 'square') { for (const s of [-1, 1]) { P.box(m, 0, -1, s * (r - 0.1), r * 2, h + 1, 0.2); P.box(m, s * (r - 0.1), -1, 0, 0.2, h + 1, r * 2 - 0.4); } } else { ring(P, m, 0, -1, 0, r, r, h + 1, 14); ring(P, m, 0, -1, 0, r - 0.16, r - 0.16, h + 1, 14); ring(P, m, 0, h, 0, r, r - 0.16, 0.001, 14); cap(P, 'visor', 0, 0.15, 0, r - 0.16, 14); }
    if (D.shape === 'square') P.box('visor', 0, 0.15, 0, r * 2 - 0.4, 0.02, r * 2 - 0.4);
    for (const s of [-1, 1]) P.box(frame, s * (r + 0.05), h - 0.1, 0, 0.12, top - h, 0.12);
    P.box(frame, 0, top - 0.5, 0, r * 2 + 0.3, 0.1, 0.1); P.box('metal', 0, top - 1.1, 0, 0.26, 0.28, 0.26);          // the windlass and its bucket
    if (D.shape !== 'round') gable(P, roof, frame, r * 2 + 0.2, r * 1.6, top - 0.1, r * (0.45 + D.a * 0.4));
  },
  fountain(P, D) { const { r, h, top, stone } = D, m = stone; ring(P, m, 0, -1, 0, r, r, h + 1, 20); ring(P, m, 0, -0.2, 0, r - 0.22, r - 0.22, h + 0.2, 20); for (let i = 0; i < 20; i++) { const a = i / 20 * 6.283, b = (i + 1) / 20 * 6.283, q = r - 0.22; P.face(m, [[Math.cos(a) * r, h, Math.sin(a) * r], [Math.cos(a) * q, h, Math.sin(a) * q], [Math.cos(b) * q, h, Math.sin(b) * q], [Math.cos(b) * r, h, Math.sin(b) * r]].reverse()); }
    cap(P, 'visor', 0, h - 0.12, 0, r - 0.22, 20);
    if (D.shape === 'basin') { drum(P, m, 0, 0, 0, 0.3, h + 0.5, 10); return; }
    drum(P, m, 0, 0, 0, 0.26, top, 10, 0.18);
    if (D.shape === 'tiered') { for (const [f, q] of [[0.55, 0.62], [0.9, 0.34]]) { ring(P, m, 0, top * f - 0.14, 0, 0.1, r * q * 0.6, 0.14, 12); cap(P, m, 0, top * f, 0, r * q * 0.6, 12); } }
    ball(P, D.a < 0.5 ? m : 'metal', 0, top + 0.16, 0, 0.2);
  },
  shrine(P, D) { const { w, h, base, stone, frame, roof } = D, y = steps(P, stone, D.steps + 1, base);
    if (D.shape === 'stele') { P.box(stone, 0, y, 0, w * 0.7, h, 0.32); P.box('limestone', 0, y + h * 0.55, -0.18, w * 0.4, h * 0.3, 0.03); return; }
    const d = w * 0.75;
    if (D.shape === 'niche') { P.box(stone, 0, y, d / 2 - 0.1, w, h, 0.2); for (const s of [-1, 1]) P.box(stone, s * (w / 2 - 0.1), y, 0, 0.2, h, d); gable(P, roof, stone, w, d, y + h, w * 0.3); P.box(stone, 0, y, 0.05, w * 0.5, h * 0.3, d * 0.5); }
    else { for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(frame, sx * (w / 2 - 0.08), y, sz * (d / 2 - 0.08), 0.14, h, 0.14); gable(P, roof, frame, w, d, y + h, w * 0.32); P.box(stone, 0, y, 0, w * 0.45, h * 0.32, d * 0.45); }
    ball(P, 'metal', 0, y + h * 0.42, 0.05, 0.12, 8, 4); P.box('tint', 0, y + h * 0.33, -0.1, 0.3, 0.06, 0.2);
  },
  monument(P, D) { const { w, h, base, stone } = D; let y = steps(P, stone, D.steps + 1, base, 0.8);
    if (D.shape === 'obelisk') { const q = w / 2, t = q * 0.55; P.box(stone, 0, y, 0, w * 1.2, 0.8, w * 1.2); y += 0.8; for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) P.face(stone, [[a[0] * q, y, a[1] * q], [a[0] * t, y + h, a[1] * t], [b[0] * t, y + h, b[1] * t], [b[0] * q, y, b[1] * q]]); for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) P.face(stone, [[a[0] * t, y + h, a[1] * t], [0, y + h + q, 0], [b[0] * t, y + h, b[1] * t]]); }
    else if (D.shape === 'column') { drum(P, stone, 0, y, 0, w / 2, h, 14, w * 0.4); drum(P, stone, 0, y + h, 0, w * 0.55, 0.3, 14); if (D.a < 0.5) ball(P, 'metal', 0, y + h + 0.3 + w * 0.5, 0, w * 0.5); else P.box('metal', 0, y + h + 0.3, 0, w * 0.45, w * 1.3, w * 0.45); }
    else if (D.shape === 'arch') { const W = w * 2.2, t = w * 0.55; for (const s of [-1, 1]) P.box(stone, s * W / 2, y, 0, t, h * 0.72, t * 1.2); P.box(stone, 0, y + h * 0.72, 0, W + t, h * 0.22, t * 1.2); }
    else { P.box(stone, 0, y, 0, w * 1.8, h * 0.75, 0.5); P.box('metal', 0, y + h * 0.42, -0.27, w * 1.1, h * 0.2, 0.04); }
  },
  marketcross(P, D) { const { r, h, stone, frame } = D; const y = steps(P, stone, D.steps + 1, r * 2.2, 0.6); drum(P, stone, 0, y, 0, 0.2, h, 8, 0.13); const T = y + h;
    if (D.shape === 'cross') { P.box(stone, 0, T - 0.7, 0, 1, 0.16, 0.16); P.box(stone, 0, T, 0, 0.16, 0.45, 0.16); }
    else if (D.shape === 'lantern') { P.box(frame, 0, T, 0, 0.5, 0.06, 0.5); P.box('lampwarm', 0, T + 0.06, 0, 0.32, 0.42, 0.32); cone(P, frame, 0, T + 0.48, 0, 0.42, 0.4, 4); }
    else { P.box(frame, 0, T, 0, 0.8, 0.8, 0.8); for (const s of [-1, 1]) { P.box('limestone', 0, T + 0.1, s * 0.41, 0.6, 0.6, 0.02); P.box('limestone', s * 0.41, T + 0.1, 0, 0.02, 0.6, 0.6); } cone(P, D.roof, 0, T + 0.8, 0, 0.72, 0.6, 4); }
  },
  noticeboard(P, D) { const { w, h, frame, roof } = D; for (const s of [-1, 1]) P.box(frame, s * (w / 2 + 0.05), -1, 0, 0.1, h + 1, 0.1); P.box(frame, 0, h * 0.42, 0, w + 0.1, h * 0.55, 0.05); P.box('cardboard', 0, h * 0.45, -0.03, w - 0.08, h * 0.49, 0.02);
    const n = 3 + Math.round(D.a * 4); for (let i = 0; i < n; i++) { const x = -w / 2 + 0.2 + (i + 0.5) / n * (w - 0.4), y = h * (0.5 + ((i * 0.37 + D.b) % 1) * 0.32); P.box(i % 2 ? 'limestone' : 'tint', x, y, -0.045, Math.min(0.3, w / n * 0.8), 0.28, 0.006); }
    if (D.shape === 'roofed') gable(P, roof, frame, w + 0.1, 0.35, h, 0.22, 0.12);
  },
  busstop(P, D) { const { w, d, h, frame, roof, stone } = D; for (const sx of [-1, 1]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) P.box(frame, sx * (w / 2 - 0.05), -1, z, 0.08, h + 1, 0.08); P.box(roof, 0, h, 0, w + 0.3, 0.08, d + 0.3);
    if (D.shape !== 'canopy') { P.box(D.shape === 'glazed' ? 'visor' : stone, 0, 0.4, d / 2 - 0.05, w - 0.1, h - 0.5, 0.04); for (const s of [-1, 1]) P.box(D.shape === 'glazed' ? 'visor' : stone, s * (w / 2 - 0.05), 0.4, 0, 0.04, h - 0.5, d - 0.1); }
    P.box('plank', 0, 0.45, d / 2 - 0.35, w * 0.6, 0.05, 0.4); for (const s of [-1, 1]) P.box(frame, s * w * 0.26, -1, d / 2 - 0.35, 0.05, 1.45, 0.3);
    const x = w / 2 + 0.5; P.box('metal', x, -1, -d / 2, 0.07, h + 1.1, 0.07); P.box('tint', x, h - 0.1, -d / 2, 0.55, 0.55, 0.03);
  },
  lamp(P, D) { const { h, reach, frame } = D, m = frame === 'plank' || frame === 'paint' ? 'metal' : frame; drum(P, m, 0, -1, 0, 0.09, h + 1, 8, 0.05); P.box(D.stone, 0, -0.6, 0, 0.36, 0.9, 0.36);
    const head = (x, z) => { P.box(m, x, h - 0.04, z, 0.42, 0.05, 0.3); P.box('lampwarm', x, h - 0.1, z, 0.26, 0.06, 0.18); };
    if (D.shape === 'post') { P.box('lampwarm', 0, h, 0, 0.2, 0.34, 0.2); cone(P, m, 0, h + 0.34, 0, 0.26, 0.2, 6); return; }
    if (D.shape === 'double') { P.box(m, 0, h, 0, reach * 2, 0.05, 0.05); head(reach, 0); head(-reach, 0); return; }
    P.box(m, reach / 2, h, 0, reach, 0.05, 0.05); if (D.shape === 'crook') P.box(m, reach, h - 0.04, 0, 0.05, 0.06, 0.05); head(reach, 0);
  },
  bench(P, D) { const { w, d, h, frame, stone } = D;
    if (D.shape === 'slab') { for (const s of [-1, 1]) P.box(stone, s * w * 0.36, -0.6, 0, 0.18, h + 0.55, d); P.box(stone, 0, h - 0.07, 0, w, 0.09, d + 0.04); return; }
    const leg = frame === 'plank' ? 'metal' : frame; for (const s of [-1, 1]) { P.box(leg, s * w * 0.42, -0.5, 0, 0.06, h + 0.5, d); }
    for (let i = 0; i < 3; i++) P.box('plank', 0, h, -d / 2 + (i + 0.5) * d / 3, w, 0.04, d / 3 - 0.02);
    if (D.shape === 'backed') { for (const s of [-1, 1]) P.box(leg, s * w * 0.42, h, d / 2 - 0.03, 0.05, 0.45, 0.04); for (let i = 0; i < 2; i++) P.box('plank', 0, h + 0.2 + i * 0.16, d / 2 - 0.02, w, 0.1, 0.03); }
  },
  gate(P, D) { const { w, h, t, stone, frame } = D; for (const s of [-1, 1]) { P.box(stone, s * w / 2, -1, 0, t, h * 0.75 + 1, t); P.box(stone, s * w / 2, h * 0.75, 0, t + 0.12, 0.12, t + 0.12); }
    const Y = h * 0.75 + 0.12; if (D.shape === 'pillars') { for (const s of [-1, 1]) ball(P, D.a < 0.5 ? stone : 'metal', s * w / 2, Y + t * 0.32, 0, t * 0.32, 8, 4); return; }
    if (D.shape === 'lintel') { P.box(frame, 0, Y, 0, w + t, 0.28, 0.2); P.box('tint', 0, Y - 0.56, -0.02, w * 0.4, 0.42, 0.04); for (const s of [-1, 1]) P.box('metal', s * w * 0.15, Y - 0.14, -0.02, 0.03, 0.14, 0.03); return; }
    const seg = 8, R = w / 2, flat = 0.32; for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI, x0 = Math.cos(a0) * R, x1 = Math.cos(a1) * R, y0 = Y + Math.sin(a0) * R * flat, y1 = Y + Math.sin(a1) * R * flat, th = 0.22; P.face(stone, [[x0, y0 + th, -t / 3], [x1, y1 + th, -t / 3], [x1, y1 + th, t / 3], [x0, y0 + th, t / 3]]); P.face(stone, [[x0, y0, t / 3], [x1, y1, t / 3], [x1, y1, -t / 3], [x0, y0, -t / 3]]); P.face(stone, [[x0, y0, -t / 3], [x1, y1, -t / 3], [x1, y1 + th, -t / 3], [x0, y0 + th, -t / 3]]); P.face(stone, [[x1, y1, t / 3], [x0, y0, t / 3], [x0, y0 + th, t / 3], [x1, y1 + th, t / 3]]); }
  },
  pavilion(P, D) { const { r, h, rise, floor, stone, frame, roof } = D, seg = D.shape === 'oct' ? 8 : D.shape === 'hex' ? 6 : 4, off = Math.PI / seg, at = (i, q = r) => [Math.cos(i / seg * 6.283 + off) * q, Math.sin(i / seg * 6.283 + off) * q];
    for (let i = 0; i < seg; i++) { const [a, b] = at(i, r), [c, e] = at(i + 1, r); P.face(stone, [[a, -1, b], [a, floor, b], [c, floor, e], [c, -1, e]]); } { const pts = []; for (let i = seg - 1; i >= 0; i--) { const [a, b] = at(i, r); pts.push([a, floor, b]); } P.face(stone, pts); }
    for (let i = 0; i < seg; i++) { const [a, b] = at(i, r - 0.2); P.box(frame, a, floor, b, 0.14, h, 0.14); const [c, e] = at(i + 1, r - 0.2); if (i % 2 === 0 || seg === 4) { const mx = (a + c) / 2, mz = (b + e) / 2, L = Math.hypot(c - a, e - b); P.box(frame, mx, floor + 0.85, mz, Math.abs(c - a) > 0.05 ? Math.abs(c - a) : 0.06, 0.05, Math.abs(e - b) > 0.05 ? Math.abs(e - b) : 0.06); void L; } }
    const Y = floor + h, q = r + 0.45; for (let i = 0; i < seg; i++) { const [a, b] = at(i, q), [c, e] = at(i + 1, q); P.face(roof, [[a, Y, b], [0, Y + rise, 0], [c, Y, e]].reverse()); P.face(frame, [[a, Y - 0.02, b], [c, Y - 0.02, e], [0, Y + 0.1, 0]].reverse()); } ball(P, 'metal', 0, Y + rise + 0.08, 0, 0.1, 6, 3);
  },
  bandstall(P, D) { const { w, d, h, frame } = D; P.box('plank', 0, 0.8, 0, w, 0.06, d); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(frame, sx * (w / 2 - 0.05), -0.5, sz * (d / 2 - 0.05), 0.07, 1.3, 0.07);
    for (let i = 0; i < 3; i++) { const x = -w / 2 + (i + 0.5) * w / 3; P.box('cardboard', x, 0.86, -d * 0.12, w / 3 - 0.08, 0.16, d * 0.6); P.box(i % 2 ? 'leaf' : 'tint', x, 1.02, -d * 0.12, w / 3 - 0.18, 0.08, d * 0.5); }
    if (D.shape === 'table') return; for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(frame, sx * (w / 2 + 0.05), 0.86, sz * (d / 2 + 0.05), 0.05, h - 0.86, 0.05); const X = w / 2 + 0.25, Z = d / 2 + 0.35, rise = D.shape === 'peaked' ? 0.5 : 0.25;
    if (D.shape === 'peaked') { const st = ['tint', 'paint']; for (let i = 0; i < 4; i++) { const x0 = -X + i * X / 2, x1 = x0 + X / 2; P.face(st[i % 2], [[x0, h, -Z], [x0, h + rise, 0], [x1, h + rise, 0], [x1, h, -Z]]); P.face(st[i % 2], [[x1, h, Z], [x1, h + rise, 0], [x0, h + rise, 0], [x0, h, Z]]); } }
    else for (let i = 0; i < 4; i++) { const x0 = -X + i * X / 2, x1 = x0 + X / 2; P.face(i % 2 ? 'paint' : 'tint', [[x0, h - 0.1, -Z], [x0, h + rise, Z], [x1, h + rise, Z], [x1, h - 0.1, -Z]]); }
  },
  poweredge(P, D) { const { h, w, frame } = D, m = frame === 'paint' ? 'plank' : frame === 'hull' ? 'metal' : frame; if (D.shape === 'lattice') { for (const s of [-1, 1]) for (const q of [-1, 1]) P.box('metal', s * 0.16, -1, q * 0.16, 0.05, h + 1, 0.05); for (let y = 0.5; y < h; y += 0.7) P.box('metal', 0, y, 0, 0.38, 0.03, 0.38); } else drum(P, m, 0, -1, 0, 0.13, h + 1, 8, 0.09);
    const bars = D.shape === 'double' ? [h - 0.3, h - 1.1] : [h - 0.3]; for (const y of bars) { P.box(m, 0, y, 0, 0.1, 0.1, w); for (const s of [-1, 0, 1]) { P.box('rubber', 0, y + 0.1, s * w * 0.42, 0.07, 0.16, 0.07); } }
    if (D.a < 0.5) { drum(P, 'metal', 0.28, h - 2.2, 0, 0.2, 0.75, 8); }
  },
  graves(P, D) { const { w, d, stone, frame } = D, nx = Math.max(2, Math.round(w / 2.2)), nz = Math.max(2, Math.round(d / 2.6)); let i = 0; for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { i++; if (Math.sin(i * 12.9 + D.a * 50) > 0.72) continue; const x = -w / 2 + (a + 0.5) * w / nx + Math.sin(i * 7.1) * 0.2, z = -d / 2 + (b + 0.5) * d / nz, tall = 0.55 + Math.abs(Math.sin(i * 3.7)) * 0.5, lean = Math.sin(i * 5.3) * 0.05;
      if (D.shape === 'crosses') { P.box(frame === 'paint' ? 'plank' : frame, x, -0.4, z, 0.08, tall + 0.65, 0.08); P.box(frame === 'paint' ? 'plank' : frame, x, tall * 0.6, z, 0.42, 0.07, 0.07); }
      else if (D.shape === 'slabs') P.box(stone, x, -0.2, z + 0.5, 0.75, 0.32, 1.7);
      else if (D.shape === 'cairns') { for (let k = 0; k < 4; k++) P.box('rock', x + Math.sin(i + k) * 0.2, -0.05 + k * 0.14, z + Math.cos(i * 2 + k) * 0.25, 0.5 - k * 0.09, 0.2, 0.5 - k * 0.09); }
      else { P.box(stone, x + lean, -0.4, z, 0.55, tall + 0.4, 0.13); P.box(stone, x + lean, tall, z, 0.42, 0.08, 0.11); } } },
  picnic(P, D) { const { w, stone } = D; if (D.shape === 'round') { drum(P, stone, 0, -0.4, 0, 0.14, 1.1, 8); drum(P, 'plank', 0, 0.7, 0, 0.75, 0.05, 12); for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; drum(P, stone, Math.cos(a) * 1.25, -0.3, Math.sin(a) * 1.25, 0.2, 0.75, 8); } return; } P.box('plank', 0, 0.72, 0, w, 0.05, 0.75); for (const s of [-1, 1]) { P.box('plank', 0, 0.42, s * 0.65, w, 0.04, 0.28); P.box('plank', s * w * 0.32, -0.3, 0, 0.07, 1.04, 0.07); P.box('plank', s * w * 0.32, 0.36, 0, 0.07, 0.06, 1.55); } },
  swings(P, D) { const { w, h, frame } = D, m = frame === 'plank' ? 'plank' : 'metal'; P.box(m, 0, h, 0, w, 0.08, 0.08); for (const s of [-1, 1]) for (const q of [-1, 1]) { const x = s * w / 2, z0 = q * 0.8; P.face(m, [[x - 0.04, -0.5, z0], [x - 0.04, h, 0.03 * q], [x + 0.04, h, 0.03 * q], [x + 0.04, -0.5, z0]]); P.face(m, [[x + 0.04, -0.5, z0], [x + 0.04, h, 0.03 * q], [x - 0.04, h, 0.03 * q], [x - 0.04, -0.5, z0]]); } const n = w > 3.2 ? 3 : 2; for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; for (const s of [-1, 1]) P.box('metal', x + s * 0.2, 0.55, 0, 0.015, h - 0.55, 0.015); P.box('plank', x, 0.5, 0, 0.5, 0.05, 0.18); } },
  cart(P, D) { const { w, d, frame } = D, m = frame === 'paint' ? 'plank' : frame, wheel = (x, z, r) => { for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, b = (i + 1) / 12 * 6.283, s = Math.sign(x) * 0.06; P.face('rubber', [[x + s, r + Math.sin(a) * r, z + Math.cos(a) * r], [x + s, r + Math.sin(b) * r, z + Math.cos(b) * r], [x + s, r, z]]); P.face('rubber', [[x - s, r + Math.sin(b) * r, z + Math.cos(b) * r], [x - s, r + Math.sin(a) * r, z + Math.cos(a) * r], [x - s, r, z]]); P.face('rubber', [[x + s, r + Math.sin(b) * r, z + Math.cos(b) * r], [x + s, r + Math.sin(a) * r, z + Math.cos(a) * r], [x - s, r + Math.sin(a) * r, z + Math.cos(a) * r], [x - s, r + Math.sin(b) * r, z + Math.cos(b) * r]].reverse()); } P.box('metal', 0, r - 0.02, z, w + 0.1, 0.04, 0.04); };
    const r = D.shape === 'handcart' ? 0.42 : 0.33, y = r * 1.45; wheel(w / 2 + 0.05, D.shape === 'handcart' ? 0 : -d * 0.3, r); wheel(-w / 2 - 0.05, D.shape === 'handcart' ? 0 : -d * 0.3, r); if (D.shape !== 'handcart') { wheel(w / 2 + 0.05, d * 0.3, r); wheel(-w / 2 - 0.05, d * 0.3, r); }
    P.box(m, 0, y, 0, w, 0.06, d); if (D.shape !== 'flatbed') for (const s of [-1, 1]) { P.box(m, s * (w / 2 - 0.02), y + 0.06, 0, 0.04, 0.38, d); P.box(m, 0, y + 0.06, s * (d / 2 - 0.02), w, 0.38, 0.04); } for (const s of [-1, 1]) P.box(m, s * w * 0.3, y - 0.04, d / 2 + 0.75, 0.05, 0.05, 1.5); if (D.a < 0.5) P.box('cardboard', 0, y + 0.06, -d * 0.15, w * 0.6, 0.35, d * 0.4); },
  trough(P, D) { const { w, d, h, stone, frame } = D, m = D.shape === 'stone' ? stone : D.shape === 'plank' ? 'plank' : 'metal', t = D.shape === 'stone' ? 0.1 : 0.04; for (const s of [-1, 1]) { P.box(m, 0, -0.3, s * (d / 2 - t / 2), w, h + 0.3, t); P.box(m, s * (w / 2 - t / 2), -0.3, 0, t, h + 0.3, d); } P.box('visor', 0, h * 0.72, 0, w - t * 2, 0.02, d - t * 2); if (D.shape === 'stone' && D.a < 0.5) { P.box(frame === 'paint' ? 'metal' : frame, w / 2 + 0.1, -0.3, 0, 0.08, h + 1.1, 0.08); P.box('metal', w / 2 - 0.1, h + 0.75, 0, 0.42, 0.04, 0.04); } },
  beehives(P, D) { const { w, frame } = D, n = Math.max(2, Math.round(w / 0.9)); for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n, q = Math.sin(i * 5.1) * 0.25; if (D.shape === 'skeps') { P.box('plank', x, 0.42, q, 0.6, 0.05, 0.6); ring(P, 'thatch', x, 0.47, q, 0.26, 0.2, 0.2, 10); ring(P, 'thatch', x, 0.67, q, 0.2, 0.08, 0.2, 10); cap(P, 'thatch', x, 0.87, q, 0.08, 10); } else { P.box('paint', x, 0.4, q, 0.46, 0.34, 0.42); P.box('tint', x, 0.74, q, 0.46, 0.2, 0.42); P.box(D.frame === 'hull' ? 'metal' : 'plank', x, 0.94, q, 0.54, 0.04, 0.5); P.box('visor', x, 0.45, q - 0.22, 0.25, 0.02, 0.01); } for (const s of [-1, 1]) P.box('plank', x + s * 0.2, -0.3, q, 0.05, 0.72, 0.42); } },
  scarecrow(P, D) { const { h } = D; P.box('plank', 0, -0.5, 0, 0.07, h + 0.5, 0.07); if (D.shape === 'cross') P.box('plank', 0, h * 0.75, 0, 1.3, 0.06, 0.06); P.box('paint', 0, h * 0.42, 0, 0.42, h * 0.38, 0.22); if (D.shape === 'cross') { P.box('paint', 0, h * 0.68, 0, 1, 0.13, 0.14); } ball(P, 'cardboard', 0, h * 0.92, 0, 0.16, 8, 5); cone(P, 'thatch', 0, h + 0.02, 0, 0.28, 0.24, 10); for (const s of [-1, 1]) P.box('thatch', s * 0.08, h * 0.32, 0, 0.08, 0.28, 0.08); },
  windpump(P, D) { const { r, h, stone, frame } = D, m = frame === 'plank' || frame === 'paint' ? 'plank' : 'metal'; if (D.shape === 'post') drum(P, m, 0, -1, 0, 0.18, h + 1, 8, 0.08); else for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * r, z = sz * r, T = sx * 0.12, U = sz * 0.12, t = 0.05; P.face(m, [[x - t, 0, z - t], [T - t, h, U - t], [T + t, h, U - t], [x + t, 0, z - t]]); P.face(m, [[x + t, 0, z + t], [T + t, h, U + t], [T - t, h, U + t], [x - t, 0, z + t]]); P.face(m, [[x + t, 0, z - t], [T + t, h, U - t], [T + t, h, U + t], [x + t, 0, z + t]]); P.face(m, [[x - t, 0, z + t], [T - t, h, U + t], [T - t, h, U - t], [x - t, 0, z - t]]); P.box(stone, x, -0.5, z, 0.42, 0.65, 0.42); }
    if (D.shape !== 'post') for (let y = 1.8; y < h - 0.5; y += 1.8) { const q = r * (1 - y / h) + 0.12; for (const s of [-1, 1]) { P.box(m, 0, y, s * q, q * 2, 0.04, 0.04); P.box(m, s * q, y, 0, 0.04, 0.04, q * 2); } }
    P.box('metal', 0, h, 0.12, 0.14, 0.14, 0.7); const n = 8 + Math.round(D.a * 8), R = 1.2 + D.b * 0.7; for (let i = 0; i < n; i++) { const a = i / n * 6.283, c = Math.cos(a), s = Math.sin(a), wd = 0.18; P.face('metal', [[c * 0.2 - s * 0.05, h + 0.07 + s * 0.2 + c * 0.05, -0.28], [c * R - s * wd, h + 0.07 + s * R + c * wd, -0.28], [c * R + s * wd, h + 0.07 + s * R - c * wd, -0.28], [c * 0.2 + s * 0.05, h + 0.07 + s * 0.2 - c * 0.05, -0.28]]); P.face('metal', [[c * 0.2 + s * 0.05, h + 0.07 + s * 0.2 - c * 0.05, -0.27], [c * R + s * wd, h + 0.07 + s * R - c * wd, -0.27], [c * R - s * wd, h + 0.07 + s * R + c * wd, -0.27], [c * 0.2 - s * 0.05, h + 0.07 + s * 0.2 + c * 0.05, -0.27]]); } P.face('tint', [[-0.01, h + 0.3, 0.35], [-0.01, h + 0.75, 1.2], [-0.01, h - 0.2, 1.2], [-0.01, h - 0.05, 0.35]]); P.face('tint', [[0.01, h - 0.05, 0.35], [0.01, h - 0.2, 1.2], [0.01, h + 0.75, 1.2], [0.01, h + 0.3, 0.35]]); },
  watertower(P, D) { const { r, h, tank, stone, frame, roof } = D, m = frame === 'plank' ? 'plank' : 'metal', L = r * 0.72; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P.box(stone, sx * r * 0.85, -1, sz * r * 0.85, 0.7, 1.4, 0.7); const x = sx * L, z = sz * L, T = sx * L * 0.7, U = sz * L * 0.7, t = 0.09; P.face(m, [[x - t, 0.3, z - t], [T - t, h, U - t], [T + t, h, U - t], [x + t, 0.3, z - t]]); P.face(m, [[x + t, 0.3, z + t], [T + t, h, U + t], [T - t, h, U + t], [x - t, 0.3, z + t]]); P.face(m, [[x + t, 0.3, z - t], [T + t, h, U - t], [T + t, h, U + t], [x + t, 0.3, z + t]]); P.face(m, [[x - t, 0.3, z + t], [T - t, h, U + t], [T - t, h, U - t], [x - t, 0.3, z - t]]); }
    for (let y = h * 0.3; y < h - 0.5; y += h * 0.3) { const q = L * (1 - 0.3 * y / h); for (const s of [-1, 1]) { P.box(m, 0, y, s * q, q * 2, 0.07, 0.07); P.box(m, s * q, y, 0, 0.07, 0.07, q * 2); } }
    drum(P, m, 0, 0.3, 0, 0.14, h, 8); const R = L * 0.95;
    if (D.shape === 'ball') { ball(P, 'tint', 0, h + R * 0.9, 0, R * 1.1, 14, 8); return; }
    if (D.shape === 'cone') { ring(P, 'tint', 0, h, 0, R * 0.25, R * 1.1, tank * 0.45, 14); drum(P, 'tint', 0, h + tank * 0.45, 0, R * 1.1, tank * 0.55, 14); cone(P, roof, 0, h + tank, 0, R * 1.2, R * 0.5, 14); return; }
    drum(P, 'tint', 0, h, 0, R, tank, 14); ring(P, 'metal', 0, h + tank * 0.5, 0, R + 0.03, R + 0.03, 0.08, 14); cone(P, roof, 0, h + tank, 0, R + 0.2, R * 0.45, 14);
  },
};
const made = new WeakMap();
export function smallParts(planet, k, surface) {
  let m = made.get(planet); if (!m) made.set(planet, m = new Map());
  if (m.has(k)) return m.get(k);
  const D = smallById(planet, k); if (!D) return null;
  const P = new Parts(); BUILD[D.fam](P, D);
  const parts = partsOut(P).map(p => ({ geometry: p.geometry, material: surface(p.surface, p.tinted), matrix: new THREE.Matrix4(), tinted: p.tinted, cast: p.surface !== 'lampwarm' && p.surface !== 'visor' }));
  m.set(k, parts); return parts;
}
