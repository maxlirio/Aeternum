// Accumulates boxes/quads into one BufferGeometry per material. A local frame
// (origin + orthonormal x/y/z axes) maps plan coordinates into mesh space; UVs come
// from local coordinates in metres, so adjoining pieces continue the same texture.
import * as THREE from 'three';

export class MeshBuilder {
  constructor() { this.groups = new Map(); this.setFrame([0, 0, 0], [1, 0, 0], [0, 0, 1]); }

  // ex, ez in the horizontal plane; y is always up.
  setFrame(origin, ex, ez) { this.o = origin; this.ex = ex; this.ez = ez; }

  g(mat) {
    let g = this.groups.get(mat);
    if (!g) this.groups.set(mat, g = { p: [], n: [], uv: [], c: [], lit: [], idx: [] });
    return g;
  }
  tp(x, y, z) { const o = this.o, a = this.ex, b = this.ez; return [o[0] + a[0] * x + b[0] * z, o[1] + y, o[2] + a[2] * x + b[2] * z]; }
  tn(x, y, z) { const a = this.ex, b = this.ez; return [a[0] * x + b[0] * z, y, a[2] * x + b[2] * z]; }

  // Quad from 4 local corners (counter-clockwise seen from the normal side).
  quad(mat, corners, normal, uvs, color = [1, 1, 1], lit = 0) {
    const g = this.g(mat), base = g.p.length / 3, n = this.tn(...normal);
    for (let i = 0; i < 4; i++) {
      g.p.push(...this.tp(...corners[i])); g.n.push(...n); g.uv.push(...uvs[i]); g.c.push(...color); g.lit.push(lit);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Raw triangles in local space (render/forms.js): positions, normals, UVs as flat arrays; one colour
  tris(mat, pos, nor, uv, color = [1, 1, 1]) {
    const g = this.g(mat), base = g.p.length / 3, n = pos.length / 3;
    for (let i = 0; i < n; i++) { g.p.push(...this.tp(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])); g.n.push(...this.tn(nor[3 * i], nor[3 * i + 1], nor[3 * i + 2])); g.uv.push(uv[2 * i], uv[2 * i + 1]); g.c.push(...color); g.lit.push(0); }
    for (let i = 0; i < n; i++) g.idx.push(base + i);
  }
  // Axis-aligned box in local space. skip: set of faces to omit ('px','nx','py','ny','pz','nz').
  // mat is a material, or { px, nx, py, ny, pz, nz, default } for per-face materials.
  box(mat, x0, y0, z0, x1, y1, z1, color, skip) {
    const s = skip || NONE;
    if (!mat.isMaterial) { const mm = mat; for (const f of FACES) if (!s.has(f) && (mm[f] || mm.default)) this.box(mm[f] || mm.default, x0, y0, z0, x1, y1, z1, color, ONLY[f]); return; }
    if (!s.has('pz')) this.quad(mat, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], color);
    if (!s.has('nz')) this.quad(mat, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]], color);
    if (!s.has('px')) this.quad(mat, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]], color);
    if (!s.has('nx')) this.quad(mat, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]], color);
    if (!s.has('py')) this.quad(mat, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], color);
    if (!s.has('ny')) this.quad(mat, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], color);
  }

  // Build meshes; returns [THREE.Mesh]. Geometry is in mesh space; caller positions them.
  build(opts = {}) {
    const out = [];
    for (const [mat, g] of this.groups) {
      if (!g.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
      if (mat.userData.lit !== false) geo.setAttribute('aLit', new THREE.Float32BufferAttribute(g.lit, 1));
      geo.setIndex(g.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = opts.castShadow ?? true; mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
  get triangles() { let n = 0; for (const g of this.groups.values()) n += g.idx.length / 3; return n; }
}
const NONE = new Set();
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const ONLY = Object.fromEntries(FACES.map(f => [f, new Set(FACES.filter(g => g !== f))]));

// Compose a sub-frame (origin/axes given in the current frame's local coords).
export function subFrame(mb, lo, lex, lez) {
  return [mb.tp(lo[0], lo[1], lo[2]), mb.tn(lex[0], 0, lex[1]), mb.tn(lez[0], 0, lez[1])];
}
