// A cloud world, drawn: the floating decks of gen/skyisles.js (their paved tops, rims and railings, the plated keel under
// each one with its girders, lights and the glowing lift rings that hold it up, towers hanging beneath and spires standing on
// them), the bridges between them on their trusses, the gas bags some decks hang from, and the sea of cloud far below:
// banded in the planet's own colours, lit by its sun, drifting, with towering puffs standing up out of it.
// Everything is in world coordinates under the floating origin, like the rest of the land.
import * as THREE from 'three';
import { skyPlan, cityDeck, deckEdge, cloudOf } from '../gen/skyisles.js';
import { getSettlement, regionOf } from '../gen/settlement.js';
import { REGION } from '../core/units.js';
import { getCity } from '../gen/city.js';
import { Rng } from '../core/prng.js';
import { hashStr } from '../core/hash.js';

const NEAR = 14000;          // decks drawn within this (m)
const N = 120;               // segments round a deck's edge

function mergeInto(parts) {
  // parts: [{ pos: [], nor: [], uv: [], idx: [] }] → one BufferGeometry
  const P = [], Nn = [], U = [], I = []; let o = 0;
  for (const q of parts) { P.push(...q.pos); Nn.push(...q.nor); U.push(...q.uv); for (const i of q.idx) I.push(i + o); o += q.pos.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}
class Parts {      // geometry by material, built up then turned into meshes
  constructor() { this.by = new Map(); }
  part(mat) { let p = this.by.get(mat); if (!p) this.by.set(mat, p = { pos: [], nor: [], uv: [], idx: [] }); return p; }
  quad(mat, a, b, c, d, uvs) {     // a b c d counter-clockwise seen from the front
    const p = this.part(mat), o = p.pos.length / 3, n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize();
    for (const v of [a, b, c, d]) { p.pos.push(...v); p.nor.push(n.x, n.y, n.z); }
    p.uv.push(...(uvs || [0, 0, 1, 0, 1, 1, 0, 1])); p.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // a box from a to b (a straight member: beam, rail, post), square section s
  beam(mat, a, b, s) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A), L = d.length(); if (L < 1e-3) return; d.normalize();
    const u = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), x = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(s / 2), y = new THREE.Vector3().crossVectors(x, d).normalize().multiplyScalar(s / 2);
    const c = (sx, sy, e) => (e ? B : A).clone().addScaledVector(x, sx).addScaledVector(y, sy).toArray();
    for (const [p, q] of [[[1, 1], [-1, 1]], [[-1, 1], [-1, -1]], [[-1, -1], [1, -1]], [[1, -1], [1, 1]]]) this.quad(mat, c(...q, 0), c(...p, 0), c(...p, 1), c(...q, 1), [0, 0, s, 0, s, L, 0, L]);
  }
  // a surface of revolution about a vertical axis through (cx, cz): profile [[r, y], ...], top to bottom; outward-facing
  lathe(mat, cx, cz, prof, n = 48, R = null) {
    const p = this.part(mat), o = p.pos.length / 3;
    for (let i = 0; i < prof.length; i++) for (let k = 0; k <= n; k++) {
      const a = k / n * Math.PI * 2, r = prof[i][0] * (R ? R(a) : 1), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const j = Math.min(i + 1, prof.length - 1), h = Math.max(i - 1, 0), dr = prof[j][0] - prof[h][0], dy = prof[j][1] - prof[h][1], L = Math.hypot(dr, dy) || 1;
      p.pos.push(x, prof[i][1], z); p.nor.push(Math.cos(a) * -dy / L, dr / L, Math.sin(a) * -dy / L); p.uv.push(a * Math.max(1, prof[i][0]), prof[i][1]);
    }
    for (let i = 0; i + 1 < prof.length; i++) for (let k = 0; k < n; k++) { const A = o + i * (n + 1) + k, B = A + n + 1; p.idx.push(A, A + 1, B + 1, A, B + 1, B); }
  }
  meshes(mats) {
    const out = [];
    for (const [k, p] of this.by) { if (!p.idx.length) continue; const m = new THREE.Mesh(mergeInto([p]), mats[k]); m.castShadow = k !== 'glow' && k !== 'lamp'; m.receiveShadow = true; m.frustumCulled = false; out.push(m); }
    return out;
  }
}

// One deck: top, rim and rail, keel, ribs, lights, lift ring; and what stands on or hangs from it, by its kind.
function buildDeck(P, D, rng, main) {
  const R = th => deckEdge(D, th) / D.r, h = D.h, r = D.r;
  // the top: a fan of paving out to the edge (towns draw their own streets on it; this is what's between)
  { const p = P.part(D.kind === 'garden' ? 'lawn' : 'deck'), o = p.pos.length / 3; p.pos.push(D.x, h - 0.05, D.z); p.nor.push(0, 1, 0); p.uv.push(D.x, D.z);
    for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, e = deckEdge(D, a), x = D.x + Math.cos(a) * e, z = D.z + Math.sin(a) * e; p.pos.push(x, h - 0.05, z); p.nor.push(0, 1, 0); p.uv.push(x, z); }
    for (let k = 0; k < N; k++) p.idx.push(o, o + 2 + k, o + 1 + k); }
  // the rim: a fascia band, a kerb, a rail on posts with glass between
  const depth = r * (main ? 0.42 : 0.6) + 8;
  P.lathe('trim', D.x, D.z, [[r + 0.25, h + 0.25], [r + 0.25, h - 0.05], [r + 0.6, h - 0.4], [r + 0.6, h - 2.2], [r, h - 2.6]], N, R);
  P.lathe('glass', D.x, D.z, [[r - 0.35, h + 1.15], [r - 0.35, h + 0.25]], N, R);
  P.lathe('metal', D.x, D.z, [[r - 0.3, h + 1.2], [r - 0.42, h + 1.2], [r - 0.42, h + 1.12], [r - 0.3, h + 1.12]], N, R);
  for (let k = 0; k < N; k += 1) { const a = k / N * Math.PI * 2, e = deckEdge(D, a) - 0.36; P.beam('metal', [D.x + Math.cos(a) * e, h, D.z + Math.sin(a) * e], [D.x + Math.cos(a) * e, h + 1.2, D.z + Math.sin(a) * e], 0.06); }
  // the keel: a plated bowl under the deck, girders down it, a ring of lift engines glowing at its foot, lights along the girders
  const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14, rr = r * (1 - t * t * 0.92); prof.push([rr, h - 2.6 - depth * Math.pow(t, 0.75)]); }
  P.lathe('hull', D.x, D.z, prof, N, R);
  const ribs = main ? 24 : 12;
  for (let k = 0; k < ribs; k++) { const a = k / ribs * Math.PI * 2, f = R(a), pt = i => [D.x + Math.cos(a) * prof[i][0] * f * 1.012, prof[i][1], D.z + Math.sin(a) * prof[i][0] * f * 1.012];
    for (let i = 0; i < prof.length - 1; i++) P.beam('rib', pt(i), pt(i + 1), main ? 1.4 : 0.8);
    for (const i of [3, 7, 11]) { const q = pt(i); P.beam('lamp', [q[0], q[1] - 0.2, q[2]], [q[0], q[1] - 0.9, q[2]], main ? 0.9 : 0.6); } }
  const ringR = r * 0.34, ringY = h - 2.6 - depth * 0.82;
  P.lathe('glow', D.x, D.z, [[ringR + 3, ringY], [ringR + 3.6, ringY - 1.2], [ringR, ringY - 2.2], [ringR - 3.6, ringY - 1.2], [ringR - 3, ringY]], 64);
  // what hangs beneath: a tower, its windows lit, ending in a beacon
  if (main || D.kind === 'tower' || D.kind === 'market') {
    const hr = Math.max(6, r * 0.09), L = depth * (main ? 1.3 : 1.6), y0 = h - 2.6 - depth;
    const tp = []; for (let i = 0; i <= 10; i++) { const t = i / 10; tp.push([hr * (1 - 0.7 * t * t) * (1 + 0.15 * (i % 2)), y0 - L * t]); }
    P.lathe('hull', D.x, D.z, tp, 32);
    for (let i = 1; i < 10; i += 2) P.lathe('win', D.x, D.z, [[tp[i][0] * 1.02, tp[i][1] + 0.6], [tp[i][0] * 1.02, tp[i][1] - 1.6]], 32);
    P.lathe('beacon', D.x, D.z, [[2.2, y0 - L - 0.5], [0.1, y0 - L - 3.5]], 16);
  }
  // spires and masts standing on it
  if (D.kind === 'spire' || (main && rng.chance(0.8))) {
    const n = D.kind === 'spire' ? 1 : rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, 6.28), d = D.kind === 'spire' ? 0 : deckEdge(D, a) - 22, x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d, H = D.kind === 'spire' ? rng.range(160, 280) : rng.range(90, 170), b = D.kind === 'spire' ? r * 0.35 : 9;
      const sp = []; for (let i = 0; i <= 16; i++) { const t = i / 16; sp.push([b * (1 - t) ** 1.6 + 0.3, h + H * t]); }
      P.lathe(D.kind === 'spire' ? 'spire' : 'hull', x, z, sp.slice().reverse(), 40);
      for (const t of [0.3, 0.55, 0.78]) { const rr = b * (1 - t) ** 1.6 + 0.3; P.lathe('win', x, z, [[rr + 1.5, h + H * t + 1.2], [rr + 1.5, h + H * t - 1.2]], 40); P.lathe('trim', x, z, [[rr + 2.4, h + H * t - 1.3], [rr + 0.3, h + H * t - 1.9]], 40); }
      P.lathe('beacon', x, z, [[1.2, h + H + 2], [0.05, h + H + 6]], 12);
    }
  }
  // docks: landing marks and floodlights on posts round the edge
  if (D.kind === 'dock') {
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + D.phase, x = D.x + Math.cos(a) * r * 0.5, z = D.z + Math.sin(a) * r * 0.5; for (const s of [-1, 1]) P.beam('hazard', [x + s * 9, h + 0.02, z - 9], [x + s * 9, h + 0.02, z + 9], 0.04); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, e = deckEdge(D, a) - 2, x = D.x + Math.cos(a) * e, z = D.z + Math.sin(a) * e; P.beam('metal', [x, h, z], [x, h + 9, z], 0.3); P.beam('lamp', [x, h + 9, z], [x - Math.cos(a) * 1.4, h + 9.3, z - Math.sin(a) * 1.4], 0.6); }
  }
  // some of the smaller decks hang from a gas bag: an envelope in its net, cables down to the rim
  if (!main && D.kind !== 'spire' && D.kind !== 'dock' && rng.chance(0.55)) {
    const B = r * 0.95, y = h + r * 1.4 + 40, bp = []; for (let i = 0; i <= 20; i++) { const t = i / 20, a = Math.PI * t; bp.push([B * Math.sin(a) * 0.9, y + B * 0.55 * Math.cos(a)]); }
    P.lathe('bag', D.x, D.z, bp, 48);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; P.beam('cable', [D.x + Math.cos(a) * B * 0.8, y - B * 0.3, D.z + Math.sin(a) * B * 0.8], [D.x + Math.cos(a) * (deckEdge(D, a) - 0.5), h + 1.2, D.z + Math.sin(a) * (deckEdge(D, a) - 0.5)], 0.12); }
    for (const t of [0.25, 0.5, 0.75]) P.lathe('cable', D.x, D.z, [[B * Math.sin(Math.PI * t) * 0.91, y + B * 0.55 * Math.cos(Math.PI * t) + 0.15], [B * Math.sin(Math.PI * t) * 0.91, y + B * 0.55 * Math.cos(Math.PI * t) - 0.15]], 48);
  }
}
function buildBridge(P, B) {
  const ax = B.a[0], az = B.a[1], bx = B.b[0], bz = B.b[1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, px = -uz * B.w / 2, pz = ux * B.w / 2, ya = B.a[2], yb = B.b[2];
  P.quad('deck', [ax - px, ya - 0.04, az - pz], [ax + px, ya - 0.04, az + pz], [bx + px, yb - 0.04, bz + pz], [bx - px, yb - 0.04, bz - pz], [0, 0, B.w, 0, B.w, L, 0, L]);
  P.quad('trim', [ax - px, ya - 1.2, az - pz], [bx - px, yb - 1.2, bz - pz], [bx + px, yb - 1.2, bz + pz], [ax + px, ya - 1.2, az + pz]);
  for (const s of [-1, 1]) {
    const sx = px * s * 0.98, sz = pz * s * 0.98;
    P.quad('trim', s > 0 ? [ax + sx, ya - 1.2, az + sz] : [bx + sx, yb - 1.2, bz + sz], s > 0 ? [bx + sx, yb - 1.2, bz + sz] : [ax + sx, ya - 1.2, az + sz], s > 0 ? [bx + sx, yb - 0.04, bz + sz] : [ax + sx, ya - 0.04, az + sz], s > 0 ? [ax + sx, ya - 0.04, az + sz] : [bx + sx, yb - 0.04, bz + sz]);
    P.beam('metal', [ax + sx, ya + 1.15, az + sz], [bx + sx, yb + 1.15, bz + sz], 0.1);
    const n = Math.max(2, Math.floor(L / 3));
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + dx * t + sx, z = az + dz * t + sz, y = ya + (yb - ya) * t; P.beam('metal', [x, y, z], [x, y + 1.15, z], 0.06); }
    // the truss under it: a bottom chord and the diagonals up to the deck
    const drop = Math.min(9, 2 + L * 0.04), m = Math.max(2, Math.floor(L / 7));
    for (let i = 0; i < m; i++) { const t0 = i / m, t1 = (i + 1) / m, P0 = [ax + dx * t0 + sx, ya + (yb - ya) * t0 - 1.2, az + dz * t0 + sz], P1 = [ax + dx * t1 + sx, ya + (yb - ya) * t1 - 1.2, az + dz * t1 + sz], sag = t => drop * 4 * t * (1 - t) + 1.5, Q0 = [P0[0], P0[1] - sag(t0), P0[2]], Q1 = [P1[0], P1[1] - sag(t1), P1[2]];
      P.beam('rib', Q0, Q1, 0.5); P.beam('rib', i % 2 ? P0 : Q0, i % 2 ? Q1 : P1, 0.3); }
  }
  for (let t = 0.1; t < 1; t += 0.2) { const x = ax + dx * t, z = az + dz * t, y = ya + (yb - ya) * t; P.beam('lamp', [x, y - 1.25, z], [x, y - 1.6, z], 0.5); }
}

// The sea of cloud: a sheet far below, banded in the world's colours, lit by its sun, its billows drifting with the wind.
function cloudSea(planet, wisps = false) {
  const C = cloudOf(planet), g = new THREE.PlaneGeometry(260000, 260000, 1, 1); g.rotateX(-Math.PI / 2);
  const u = { uTime: { value: 0 }, uOff: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uA: { value: new THREE.Color(...C.bands[0]) }, uB: { value: new THREE.Color(...C.bands[1]) }, uStorm: { value: C.storm }, uLit: { value: 1 } };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: wisps, depthWrite: !wisps });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vW;\nuniform vec3 uOff;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz + uOff;');
    sh.fragmentShader = `varying vec3 vW; uniform float uTime, uStorm, uLit; uniform vec3 uSun, uA, uB;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.03 + vec2(13.1, 7.7); a *= 0.5; } return s; }
      float clouds(vec2 p) { vec2 q = vec2(fbm(p * 0.6 + uTime * 0.004), fbm(p * 0.6 - uTime * 0.003 + 5.2)); return fbm(p + q * 1.7 + vec2(uTime * 0.01, 0.0)); }
      ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 p = vW.xz / 2600.0; float c = clouds(p), e = 0.08, cx = clouds(p + vec2(e, 0.0)) - c, cz = clouds(p + vec2(0.0, e)) - c;
        vec3 n = normalize(vec3(-cx * 14.0, 1.0, -cz * 14.0)); float lit = 0.32 + 0.95 * max(dot(n, normalize(uSun)), 0.0);
        float band = 0.5 + 0.5 * sin(vW.z / 9000.0 + c * 3.0 + fbm(vW.xz / 40000.0) * 4.0);
        vec3 col = mix(uB, uA, smoothstep(0.25, 0.75, band));
        col = mix(col * 0.38, mix(col, vec3(1.0), 0.35), smoothstep(0.32, 0.78, c));      // the hollows between billows in shadow, their tops sunlit, almost white
        float storm = smoothstep(0.62, 0.8, fbm(vW.xz / 22000.0 + 3.0)) * uStorm; col = mix(col, col * vec3(0.6, 0.62, 0.7), storm);
        diffuseColor.rgb = col * lit * uLit;${wisps ? ' diffuseColor.rgb = mix(col, vec3(1.0), 0.5) * (0.6 + 0.5 * lit) * uLit; diffuseColor.a = smoothstep(0.58, 0.82, clouds(p * 1.7 + 9.0)) * 0.75;' : ''} }`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.position.y = C.deck; mesh.frustumCulled = false; mesh.renderOrder = wisps ? 0.5 : -0.5;
  mesh.userData.u = u; return mesh;
}
// Towers of cloud standing up out of the sea: soft billboards, in a grid that follows you.
function puffTexture() {
  // a cumulus: a heap of rounded billows, sunlit and white on top, shading to a flat grey-blue base; soft at its edges
  const W = 256, c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'), rnd = (a, b) => a + (b - a) * Math.random();
  const blobs = []; for (let k = 0; k < 34; k++) { const t = Math.random(), x = W / 2 + rnd(-0.36, 0.36) * W * (1 - 0.5 * t), y = W * 0.72 - t * W * 0.5 + rnd(-10, 10), r = W * rnd(0.08, 0.16) * (1.2 - 0.5 * t); blobs.push([x, y, r]); }
  blobs.sort((a, b) => b[1] - a[1]);
  for (const [x, y, r] of blobs) { const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(236,240,246,0.95)'); gr.addColorStop(1, 'rgba(170,180,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // the flat, shadowed base
  const base = g.createLinearGradient(0, W * 0.55, 0, W * 0.82); base.addColorStop(0, 'rgba(120,130,150,0)'); base.addColorStop(1, 'rgba(110,120,140,0.55)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = base; g.fillRect(0, 0, W, W);
  g.globalCompositeOperation = 'destination-out'; const cut = g.createLinearGradient(0, W * 0.8, 0, W * 0.86); cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = cut; g.fillRect(0, W * 0.8, W, W * 0.2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SkyIslesView {
  constructor(planet, lib) {
    this.planet = planet; this.lib = lib; this.group = new THREE.Group(); this.group.name = 'skyisles'; this.built = new Map(); this.at = null;
    const C = cloudOf(planet), S = n => lib?.surface?.(n);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mats = {
      deck: S('pavers') || std({ color: 0x9a978f, roughness: 0.85 }), lawn: S('grass') || std({ color: 0x5b6e3a, roughness: 1 }),
      hull: S('hull') || std({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.5 }), trim: S('metal') || std({ color: 0x8a8d90, metalness: 0.7, roughness: 0.4 }),
      metal: std({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 }), rib: std({ color: 0x5a5e63, metalness: 0.7, roughness: 0.45 }), cable: std({ color: 0x3a3c40, metalness: 0.5, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xbcd6e0, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      glow: std({ color: 0x0a1a24, emissive: 0x7fdcff, emissiveIntensity: 2.6 }), lamp: std({ color: 0x302820, emissive: 0xffd6a0, emissiveIntensity: 2 }),
      win: std({ color: 0x1a2028, emissive: 0xffc890, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.4 }), beacon: std({ color: 0x220000, emissive: 0xff3020, emissiveIntensity: 3 }),
      spire: S('hull') || std({ color: 0xd8d6d0, roughness: 0.35, metalness: 0.6 }), hazard: S('hazard') || std({ color: 0xd8b020 }),
      bag: std({ color: new THREE.Color(...C.bands[0]).lerp(new THREE.Color(1, 1, 1), 0.4), roughness: 0.7, side: THREE.DoubleSide }),
    };
    this.sea = cloudSea(planet); this.group.add(this.sea); this.wisps = cloudSea(planet, true); this.group.add(this.wisps);      // (a thin higher layer of wisps over the billows: depth)
    // the puffs
    const n = 700, g = new THREE.PlaneGeometry(1, 1), m = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: true, color: new THREE.Color(...C.bands[0]).lerp(new THREE.Color(1, 1, 1), 0.65) });
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sc = length(instanceMatrix[0].xyz); mvPosition.xy += position.xy * sc; gl_Position = projectionMatrix * mvPosition;`); };
    this.puffs = new THREE.InstancedMesh(g, m, n); this.puffs.frustumCulled = false; this.puffs.renderOrder = 1; this.group.add(this.puffs); this.puffAt = null; this.puffRng = new Rng([hashStr(1, 'puffs'), 7]);
    this.puffN = Math.round(n * C.puffs);
  }
  // decks of the towns near (x, z) and of the megacity
  update(x, y, z, dt, sunDir, origin, day = 1) {
    const C = cloudOf(this.planet), u = this.sea.userData.u; u.uTime.value += dt * C.speed * 0.1; u.uSun.value.copy(sunDir); u.uLit.value = 0.12 + 0.88 * day;
    this.sea.position.set(x, C.deck, z); u.uOff.value.set(origin[0], origin[1], origin[2]);
    { const w = this.wisps.userData.u; w.uTime.value = u.uTime.value * 1.6; w.uSun.value.copy(sunDir); w.uLit.value = u.uLit.value; w.uOff.value.copy(u.uOff.value); this.wisps.position.set(x, C.deck + 90, z); }      // (the root sits at −origin: this puts the billows back in world space, so they don't slide as the origin moves)
    if (!this.puffAt || Math.hypot(x - this.puffAt[0], z - this.puffAt[1]) > 2500) {
      this.puffAt = [x, z]; const M = new THREE.Matrix4(), r = new Rng([Math.floor(x / 2500) * 7 + 3, Math.floor(z / 2500) * 13 + 5]);
      for (let i = 0; i < this.puffs.count; i++) {
        if (i >= this.puffN) { M.makeScale(0, 0, 0); this.puffs.setMatrixAt(i, M); continue; }
        const a = r.range(0, 6.28), d = 1500 + Math.sqrt(r.next()) * 18000, s = r.range(300, 1100);
        M.makeScale(s, s * r.range(0.55, 0.8), s).setPosition(x + Math.cos(a) * d, C.deck + s * 0.3 - 20, z + Math.sin(a) * d);      // (standing on the cloud sea, their bases in it) this.puffs.setMatrixAt(i, M);
      }
      this.puffs.instanceMatrix.needsUpdate = true;
    }
    if (this.at && Math.hypot(x - this.at[0], z - this.at[1]) < 400) return; this.at = [x, z];
    const want = new Set(), [rx, rz] = regionOf(x, z), reach = Math.ceil(NEAR / REGION);
    for (let i = rx - reach; i <= rx + reach; i++) for (let j = rz - reach; j <= rz + reach; j++) { const s = getSettlement(this.planet, i, j); if (s && Math.hypot(s.cx - x, s.cz - z) < NEAR) want.add(s.key); if (s && !this.built.has(s.key) && want.has(s.key)) this.build(s.key, () => { const P = new Parts(), plan = skyPlan(this.planet, s), rng = new Rng(s.seed); plan.decks.forEach((D, k) => buildDeck(P, D, rng, k === 0)); plan.bridges.forEach(B => buildBridge(P, B)); return P; }); }
    const city = getCity(this.planet); if (Math.hypot(city.cx - x, city.cz - z) < NEAR + city.R) { want.add('city'); if (!this.built.has('city')) this.build('city', () => { const P = new Parts(); buildDeck(P, cityDeck(city), new Rng(city.seed), true); return P; }); }
    for (const [k, g] of this.built) if (!want.has(k)) { this.group.remove(g); g.traverse(o => o.geometry?.dispose()); this.built.delete(k); }
  }
  build(key, make) { const g = new THREE.Group(); for (const m of make().meshes(this.mats)) g.add(m); this.group.add(g); this.built.set(key, g); }
}
