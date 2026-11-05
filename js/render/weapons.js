// Weapon models, built from a design (gen/weapons.js): side profiles cut out and bevelled, barrels turned, grips wrapped.
// Origin at the palm, +z out along the barrel or blade, +y up, in metres. Returns [{ geometry, material }], plus the
// muzzle and second-hand points as `meta`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armDesign } from '../gen/weapons.js';
import { baked } from './materials.js';

const mats = new Map();
function mat(name, o = {}) {
  const k = name + JSON.stringify(o); if (mats.has(k)) return mats.get(k);
  const b = baked(name), m = b ? new THREE.MeshStandardMaterial({ ...b, roughness: 1, metalness: 1, ...o }) : new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, metalness: 0.5, ...o });
  mats.set(k, m); return m;
}
const glowMat = c => { const k = 'glow' + c; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(...c), emissiveIntensity: 2.4, roughness: 0.3 })); return mats.get(k); };

class Kit {
  constructor() { this.by = new Map(); }
  add(g, m) { g = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); (this.by.get(m) || this.by.set(m, []).get(m)).push(g); }
  // a side-on outline [z, y], cut to thickness w (x), edges bevelled
  plate(pts, w, m, bevel = 0.0015, x = 0) {
    const S = new THREE.Shape(); pts.forEach(([a, b], i) => i ? S.lineTo(a, b) : S.moveTo(a, b)); S.closePath();
    const g = new THREE.ExtrudeGeometry(S, { depth: Math.max(1e-4, w - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1 });
    g.rotateY(-Math.PI / 2); g.translate(w / 2 - bevel + x, 0, 0); this.add(g, m); return this;
  }
  // a turned part along z from z0 to z1 at height y; r1 at the far end if it tapers
  tube(z0, z1, y, r, m, r1 = r, seg = 16, x = 0) { const g = new THREE.CylinderGeometry(r1, r, Math.abs(z1 - z0), seg); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); this.add(g, m); return this; }
  box(z0, z1, y0, y1, w, m, x = 0) { const g = new THREE.BoxGeometry(w, y1 - y0, z1 - z0); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); this.add(g, m); return this; }
  done() { return [...this.by.entries()].map(([material, gs]) => ({ geometry: mergeGeometries(gs), material })); }
}

const FORMS = {
  pistol(K, D, M, A) {
    const L = 0.19 * D.len, h = 0.03 * D.tall, y = 0.055, r = D.rake;
    // grip: raked back from the palm, then the frame and slide
    K.plate([[-0.03, y - 0.005], [0.03, y - 0.005], [0.02 - r * 0.09, -0.06], [-0.035 - r * 0.09, -0.068], [-0.042 - r * 0.05, -0.02]], 0.03, M.grip, 0.003);
    K.plate([[-0.05, y - 0.012], [L * 0.75, y - 0.012], [L * 0.8, y + 0.008], [-0.05, y + 0.008]], 0.028, M.body);
    K.plate([[-0.06, y + 0.006], [L * 0.86, y + 0.006], [L * 0.9, y + 0.012], [L * 0.9, y + h], [L * 0.8, y + h + 0.002], [-0.03, y + h + 0.002], [-0.06, y + h - 0.006]], 0.03 * D.slab, M.finish, 0.0025);
    K.tube(L * 0.88, L * 1.0, y + h * 0.55, 0.0085, M.steel);
    for (let i = 0; i < D.vents; i++) K.box(-0.05 + i * 0.008, -0.046 + i * 0.008, y + h * 0.3, y + h - 0.002, 0.0322 * D.slab, M.dark);     // slide grooves
    K.plate([[0.03, y - 0.012], [0.05, y - 0.012], [0.05, y - 0.022], [0.015, y - 0.034], [0.0, y - 0.03], [0.0, y - 0.022], [0.012, y - 0.024]], 0.006, M.steel, 0.0005);        // trigger guard
    K.box(L * 0.72, L * 0.76, y + h, y + h + 0.007, 0.004, M.steel); K.box(-0.045, -0.035, y + h, y + h + 0.007, 0.012, M.steel);       // sights
    if (A.energy) { K.box(0.02, L * 0.7, y + h * 0.4, y + h * 0.65, 0.0325 * D.slab, M.glow); K.tube(L * 0.98, L * 1.03, y + h * 0.55, 0.012, M.steel, 0.01); }
    return { muzzle: [0, y + h * 0.55, L * 1.02] };
  },
  revolver(K, D, M) {
    const L = 0.2 * D.len, y = 0.05, r = D.rake;
    K.plate([[-0.025, y], [0.028, y], [0.018 - r * 0.1, -0.058], [-0.03 - r * 0.1, -0.064], [-0.04 - r * 0.05, -0.02]], 0.032, M.grip, 0.003);
    K.plate([[-0.045, y - 0.008], [0.055, y - 0.012], [0.07, y + 0.026], [0.07, y + 0.038], [-0.03, y + 0.04], [-0.05, y + 0.03]], 0.024, M.finish, 0.002);
    const cyl = new THREE.CylinderGeometry(0.022, 0.022, 0.044, 6); cyl.rotateX(Math.PI / 2); cyl.translate(0, y + 0.015, 0.03); K.add(cyl, M.steel);
    for (let i = 0; i < 6; i++) { const a = i * 1.047, g = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0445, 8); g.rotateX(Math.PI / 2); g.translate(Math.cos(a) * 0.013, y + 0.015 + Math.sin(a) * 0.013, 0.03); K.add(g, M.dark); }
    K.tube(0.07, L * 1.1, y + 0.026, 0.0105, M.finish); K.box(0.07, L * 1.08, y + 0.034, y + 0.042, 0.008, M.finish); K.tube(0.075, L * 0.82, y + 0.01, 0.006, M.steel);
    K.box(L * 1.04, L * 1.08, y + 0.042, y + 0.05, 0.003, M.steel);
    K.plate([[0.03, y - 0.008], [0.05, y - 0.008], [0.05, y - 0.02], [0.012, y - 0.028], [0.002, y - 0.022], [0.012, y - 0.016]], 0.006, M.steel, 0.0005);
    K.plate([[-0.05, y + 0.03], [-0.07, y + 0.05], [-0.075, y + 0.045], [-0.05, y + 0.015]], 0.008, M.steel, 0.001);    // hammer
    return { muzzle: [0, y + 0.026, L * 1.1] };
  },
  long(K, D, M, A) {
    const L = (A.scope ? 0.72 : A.energy ? 0.42 : 0.56) * D.len, y = 0.065, h = 0.05 * D.tall, r = D.rake;
    K.plate([[-0.025, y - 0.012], [0.03, y - 0.012], [0.015 - r * 0.1, -0.06], [-0.035 - r * 0.1, -0.066], [-0.04 - r * 0.05, -0.02]], 0.03, M.grip, 0.003);
    // receiver
    K.plate([[-0.09, y - 0.018], [L * 0.45, y - 0.018], [L * 0.5, y + 0.002], [L * 0.5, y + h - 0.006], [L * 0.44, y + h], [-0.07, y + h], [-0.09, y + h - 0.012]], 0.036 * D.slab, M.finish, 0.003);
    // stock
    const st = M.stock; K.plate([[-0.08, y + h * 0.8], [-0.34 * D.len, y + h * 0.5], [-0.37 * D.len, y + h * 0.65], [-0.38 * D.len, y - 0.06], [-0.33 * D.len, y - 0.07], [-0.2 * D.len, y - 0.022], [-0.08, y - 0.012]], 0.032, st, 0.004);
    K.box(-0.385 * D.len, -0.37 * D.len, y - 0.064, y + h * 0.62, 0.034, M.rubber);
    // handguard, barrel
    K.plate([[L * 0.44, y - 0.012], [L * 0.86, y - 0.008], [L * 0.86, y + h * 0.75], [L * 0.44, y + h * 0.82]], 0.034, D.stock === 'wood' ? st : M.body, 0.003);
    for (let i = 0; i < D.vents; i++) K.box(L * (0.48 + i * 0.05), L * (0.5 + i * 0.05), y + h * 0.25, y + h * 0.6, 0.0345, M.dark);
    const by = y + h * 0.45; K.tube(L * 0.84, L * 1.18, by, 0.0095, M.steel);
    if (D.brake === 1) { K.tube(L * 1.16, L * 1.26, by, 0.0145, M.finish); for (let i = 0; i < 3; i++) K.box(L * (1.18 + i * 0.024), L * (1.19 + i * 0.024), by + 0.008, by + 0.0155, 0.022, M.dark); }
    else if (D.brake === 2) K.tube(L * 1.15, L * 1.3, by, 0.018, M.dark, 0.016);
    // magazine or cell
    if (A.energy) { K.box(0.03, L * 0.42, y + h * 0.35, y + h * 0.62, 0.0375 * D.slab, M.glow); K.tube(-0.02, 0.1, y - 0.03, 0.021, M.body); }
    else { const cur = D.mag === 0 ? 0.03 : 0; K.plate([[0.06, y - 0.016], [0.115, y - 0.016], [0.115 + cur, y - 0.12], [0.07 + cur, y - 0.125]], 0.024, M.dark, 0.002); }
    K.plate([[0.012, y - 0.016], [0.04, y - 0.016], [0.04, y - 0.03], [0, y - 0.04], [-0.012, y - 0.034], [0, y - 0.024]], 0.006, M.steel, 0.0005);
    if (D.rail) { K.box(-0.05, L * 0.44, y + h, y + h + 0.006, 0.02, M.dark); for (let i = 0; i < 12; i++) K.box(-0.04 + i * L * 0.038, -0.034 + i * L * 0.038, y + h + 0.006, y + h + 0.01, 0.021, M.dark); }
    if (D.scope) { const sy = y + h + 0.042; K.tube(-0.03, L * 0.42, sy, 0.019, M.finish); K.tube(L * 0.34, L * 0.46, sy, 0.019, M.finish, 0.026); K.tube(-0.075, -0.025, sy, 0.024, M.finish, 0.019); K.box(0.02, 0.05, y + h, sy, 0.012, M.dark); K.box(L * 0.28, L * 0.31, y + h, sy, 0.012, M.dark); }
    else { K.box(L * 0.82, L * 0.85, by + 0.01, by + 0.038, 0.005, M.steel); K.box(-0.02, 0.01, y + h, y + h + 0.03, 0.016, M.steel); }
    return { muzzle: [0, by, L * (D.brake === 0 ? 1.18 : 1.3)], off: [0, y - 0.015, L * 0.68] };
  },
  scatter(K, D, M) {
    const L = 0.5 * D.len, y = 0.06, r = D.rake;
    K.plate([[-0.02, y - 0.01], [0.03, y - 0.01], [0.012 - r * 0.1, -0.055], [-0.035 - r * 0.1, -0.06], [-0.04 - r * 0.05, -0.02]], 0.03, M.grip, 0.003);
    K.plate([[-0.08, y - 0.02], [0.17, y - 0.02], [0.17, y + 0.045], [-0.07, y + 0.05], [-0.09, y + 0.03]], 0.04, M.finish, 0.003);
    K.plate([[-0.08, y + 0.035], [-0.32 * D.len, y + 0.01], [-0.34 * D.len, y - 0.07], [-0.27 * D.len, y - 0.08], [-0.08, y - 0.018]], 0.034, M.stock, 0.004); K.box(-0.345 * D.len, -0.33 * D.len, y - 0.074, y + 0.012, 0.036, M.rubber);
    K.tube(0.16, L * 1.14, y + 0.028, 0.0145, M.steel, 0.0145, 18, -0.0005); K.tube(0.16, L * 0.86, y - 0.002, 0.015, M.dark);           // barrel over tube magazine
    K.tube(L * 0.46, L * 0.72, y - 0.002, 0.024, D.stock === 'wood' ? M.stock : M.rubber); for (let i = 0; i < 6; i++) K.tube(L * (0.47 + i * 0.04), L * (0.48 + i * 0.04), y - 0.002, 0.0252, M.dark);     // the slide you pump
    K.box(L * 1.1, L * 1.13, y + 0.042, y + 0.05, 0.005, M.steel); K.plate([[0.012, y - 0.02], [0.04, y - 0.02], [0.04, y - 0.032], [0, y - 0.044], [-0.012, y - 0.036], [0, y - 0.028]], 0.006, M.steel, 0.0005);
    return { muzzle: [0, y + 0.028, L * 1.14], off: [0, y - 0.02, L * 0.6] };
  },
  heavy(K, D, M) {
    const L = 0.7 * D.len, y = 0.09, r = D.rake;
    K.plate([[-0.03, y - 0.03], [0.03, y - 0.03], [0.015 - r * 0.1, -0.06], [-0.035 - r * 0.1, -0.066], [-0.04 - r * 0.05, -0.02]], 0.032, M.grip, 0.003);
    K.plate([[-0.14, y - 0.04], [L * 0.45, y - 0.04], [L * 0.5, y], [L * 0.5, y + 0.07], [-0.1, y + 0.078], [-0.14, y + 0.05]], 0.07, M.finish, 0.004);
    K.plate([[-0.14, y + 0.04], [-0.33, y + 0.03], [-0.35, y - 0.07], [-0.28, y - 0.08], [-0.14, y - 0.03]], 0.04, M.stock, 0.004);
    for (const [xx, yy] of [[-0.016, 0.018], [0.016, 0.018], [0, 0.044]]) K.tube(L * 0.48, L * 1.14, y + yy, 0.0115, M.steel, 0.0115, 12, xx);
    K.tube(L * 0.46, L * 0.82, y + 0.026, 0.038, M.body); for (let i = 0; i < D.vents + 3; i++) K.tube(L * (0.48 + i * 0.03), L * (0.49 + i * 0.03), y + 0.026, 0.04, M.dark);
    K.tube(L * 1.1, L * 1.17, y + 0.026, 0.034, M.finish); K.box(-0.02, 0.2, y - 0.1, y - 0.04, 0.09, M.body); K.box(0.02, 0.18, y - 0.075, y - 0.05, 0.0915, M.glow);
    K.box(L * 0.16, L * 0.2, y + 0.078, y + 0.11, 0.03, M.dark); K.tube(L * 0.1, L * 0.3, y + 0.125, 0.018, M.finish); K.plate([[L * 0.32, y + 0.075], [L * 0.32, y + 0.14], [L * 0.2, y + 0.14], [L * 0.2, y + 0.125], [L * 0.3, y + 0.125], [L * 0.3, y + 0.075]], 0.016, M.dark, 0.002);   // carry handle
    K.tube(L * 0.5, L * 0.56, y - 0.1, 0.018, M.rubber);
    return { muzzle: [0, y + 0.03, L * 1.17], off: [0, y - 0.08, L * 0.53] };
  },
  blade(K, D, M, A) {
    const L = (A.name === 'Combat knife' ? 0.17 : 0.42) * D.len, w = (A.name === 'Combat knife' ? 0.026 : 0.045) * D.tall, y0 = 0;
    K.tube(-0.075, 0.075, 0, 0.014, M.grip, 0.013, 10); for (let i = 0; i < 6; i++) K.tube(-0.07 + i * 0.024, -0.065 + i * 0.024, 0, 0.0148, M.dark, 0.0148, 10);
    K.tube(-0.1, -0.075, 0, 0.018, M.steel, 0.014, 10);
    if (D.guard === 0) K.box(0.075, 0.085, -0.03, 0.03, 0.018, M.steel); else if (D.guard === 1) K.plate([[0.075, -0.018], [0.085, -0.018], [0.09, 0.026], [0.075, 0.03]], 0.014, M.steel, 0.001); else K.tube(0.075, 0.088, 0, 0.024, M.steel);
    const z0 = 0.085, z1 = z0 + L, curve = D.edge === 0 ? 0 : D.edge === 1 ? w * 0.5 : -w * 0.3;
    const pts = [[z0, y0 - w * 0.45], [z0 + L * 0.5, y0 - w * 0.5 + curve], [z0 + L * 0.82, y0 - w * 0.42 + curve * 1.3], [z1, y0 + w * 0.3], [z0 + L * 0.72, y0 + w * 0.5], [z0, y0 + w * 0.5]];
    K.plate(pts, 0.0055, A.glow ? M.dark : M.blade, 0.0012);
    if (A.glow) { K.plate([[z0 + 0.01, y0 - w * 0.62], [z0 + L * 0.5, y0 - w * 0.66 + curve], [z0 + L * 0.82, y0 - w * 0.56 + curve * 1.3], [z1 + 0.006, y0 + w * 0.33], [z0 + L * 0.84, y0 - w * 0.34 + curve * 1.3], [z0 + L * 0.5, y0 - w * 0.4 + curve], [z0 + 0.01, y0 - w * 0.36]], 0.0026, M.glow, 0.0005); }
    else K.plate([[z0 + 0.008, y0 + w * 0.34], [z0 + L * 0.7, y0 + w * 0.34], [z0 + L * 0.7, y0 + w * 0.26], [z0 + 0.008, y0 + w * 0.26]], 0.0062, M.dark, 0.0003);   // fuller
    return { tip: [0, y0, z1] };
  },
  axe(K, D, M) {
    const L = 0.36 * D.len;
    K.tube(-0.12, L, 0, 0.0145, M.stock, 0.0125, 10); K.tube(-0.1, 0.09, 0, 0.0158, M.grip, 0.0158, 10);
    const z = L * 0.88, h = 0.085 * D.tall;
    K.plate([[z - 0.03, 0.022], [z + 0.03, 0.022], [z + 0.06 + 0.02 * D.edge, h], [z - 0.04, h + 0.012], [z - 0.022, 0.05]], 0.011, M.blade, 0.0015); K.box(z - 0.03, z + 0.03, -0.022, 0.024, 0.026, M.finish); K.plate([[z - 0.02, -0.022], [z + 0.02, -0.022], [z + 0.008, -0.058], [z - 0.008, -0.058]], 0.022, M.finish, 0.002);
    K.plate([[z + 0.044, h * 0.5], [z + 0.06 + 0.02 * D.edge, h], [z + 0.036, h + 0.006]], 0.0118, M.steel, 0.0006);
    return { tip: [0, h, z] };
  },
  maul(K, D, M) {
    const L = 0.72 * D.len;
    K.tube(-0.22, L, 0, 0.018, M.stock, 0.016, 10); K.tube(-0.22, -0.02, 0, 0.0195, M.grip, 0.0195, 10); K.tube(L * 0.55, L * 0.72, 0, 0.0195, M.grip, 0.0195, 10);
    const g = new THREE.BoxGeometry(0.08, 0.2 * D.tall, 0.085); g.translate(0, 0.0, L * 0.97); K.add(g, M.finish);
    for (const s of [-1, 1]) K.box(L * 0.97 - 0.05, L * 0.97 + 0.05, s * 0.1 * D.tall - 0.012, s * 0.1 * D.tall + 0.012, 0.09, M.steel);
    return { tip: [0, 0, L * 1.0], off: [0, 0, L * 0.62] };
  },
  baton(K, D, M) {
    const L = 0.42 * D.len;
    K.tube(-0.09, 0.1, 0, 0.0165, M.grip, 0.0165, 12); K.tube(-0.11, -0.09, 0, 0.02, M.steel, 0.0165, 12); K.tube(0.1, 0.13, 0, 0.022, M.finish, 0.0165, 12); K.tube(0.13, L, 0, 0.011, M.finish, 0.009, 12);
    K.tube(L * 0.7, L * 0.96, 0, 0.0118, M.dark, 0.0098, 12); K.tube(L * 0.96, L * 1.02, 0, 0.012, M.glow, 0.008, 12); K.box(0.02, 0.05, 0.015, 0.02, 0.008, M.glow);
    return { tip: [0, 0, L * 1.02] };
  },
  lance(K, D, M) {
    const L = 1.15 * D.len;
    K.tube(-0.5, L, 0, 0.0135, M.finish, 0.012, 10); K.tube(-0.14, 0.14, 0, 0.0152, M.grip, 0.0152, 10); K.tube(L * 0.5, L * 0.66, 0, 0.0152, M.grip, 0.0152, 10); K.tube(-0.53, -0.5, 0, 0.018, M.steel, 0.0135, 10);
    K.plate([[L, -0.024], [L + 0.17, 0], [L, 0.024], [L - 0.03, 0.012], [L - 0.03, -0.012]], 0.006, M.blade, 0.001); for (const s of [-1, 1]) K.box(L - 0.05, L + 0.09, s * 0.033 - 0.0025, s * 0.033 + 0.0025, 0.0036, M.glow); K.tube(L - 0.05, L - 0.02, 0, 0.022, M.dark, 0.016, 10);
    return { tip: [0, 0, L + 0.17], off: [0, 0, L * 0.58] };
  },
};

const built = new Map();
export function armParts(planet, id) {
  const D = armDesign(planet, id), k = (planet.address?.key || '') + planet.universeSeed.join(':') + id; if (built.has(k)) return built.get(k);
  const K = new Kit(), wood = mat('wood'), M = { finish: D.finish === 'metal' ? mat('metal') : D.finish === 'rust' ? mat('rust') : mat('lacquer'), body: mat('lacquer', { color: 0xd8d8d8 }), dark: mat('lacquer', { color: 0x8a8a8a }), steel: mat('metal'), blade: mat('metal', { color: 0xdedede }), rubber: mat('rubber'), grip: D.grip === 'leather' ? mat('leather') : D.grip === 'wood' ? wood : mat('rubber'), stock: D.stock === 'wood' ? wood : D.stock === 'plastic' ? mat('plastic', { color: 0x4a4d50 }) : mat('lacquer'), glow: D.glow ? glowMat(D.glow) : mat('metal') };
  const A = armsOf(id), meta = FORMS[D.form](K, D, M, A), parts = K.done(); parts.meta = { ...meta, two: D.two, off: meta.off || null };
  built.set(k, parts);
  return parts;
}
import { ARMS as armsTable } from '../gen/weapons.js';
const armsOf = id => armsTable[id];

export function armObject(planet, id) { const g = new THREE.Group(), P = armParts(planet, id); for (const p of P) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; g.add(m); } g.userData.meta = P.meta; return g; }
