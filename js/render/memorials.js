// The stones for the dead of your line, where each one fell (the `fallen/<serial>` deltas, sim/lineage.js). Each is
// built of its parts: a footing slab, the upright stone with its rounded head, a bronze plate set into its face with
// the name cut in it, and the plate's four pins. In world coordinates, under the floating origin (main.js root).
import * as THREE from 'three';

const STONE = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.92, metalness: 0 });
const FOOT = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 0.96, metalness: 0 });
const PIN = new THREE.MeshStandardMaterial({ color: 0x5a4a2c, roughness: 0.45, metalness: 0.9 });

// the parts' sizes (m): what player/collision.js keeps you out of too
export const STONE_R = 0.62, STONE_H = 1.15;

function plateTexture(name, line2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#9a7a44'); grd.addColorStop(1, '#6e5228'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(40,26,8,0.8)'; g.lineWidth = 8; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = 'rgba(30,18,4,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 52px Georgia, serif'; let s = name; while (g.measureText(s).width > 450 && s.length > 4) s = s.slice(0, -2) + '…'; g.fillText(s, 256, 104);
  g.font = '30px Georgia, serif'; let l = line2; while (g.measureText(l).width > 450 && l.length > 4) l = l.slice(0, -2) + '…'; g.fillText(l, 256, 172);
  const T = new THREE.CanvasTexture(c); T.colorSpace = THREE.SRGBColorSpace; T.anisotropy = 4; return T;
}

function stone(name, line2) {
  const G = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.7), FOOT); foot.position.y = 0.08; G.add(foot);
  // the upright: a slab, and a half-round head on it (one stone, cut so)
  const w = 0.78, d = 0.2, hs = 0.82;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, hs, d), STONE); slab.position.y = 0.16 + hs / 2; G.add(slab);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 24, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), STONE); head.position.y = 0.16 + hs; G.add(head);
  // the plate, set into the face, and its pins
  const pm = new THREE.MeshStandardMaterial({ map: plateTexture(name, line2), roughness: 0.4, metalness: 0.75 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.32, 0.012), [PIN, PIN, PIN, PIN, pm, PIN]); plate.position.set(0, 0.16 + hs * 0.62, d / 2 + 0.004); G.add(plate);
  for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 8).rotateX(Math.PI / 2), PIN); p.position.set(px * 0.29, plate.position.y + py * 0.135, d / 2 + 0.012); G.add(p); }
  G.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.name = 'memorial'; } });
  return G;
}

export class MemorialView {
  constructor() { this.group = new THREE.Group(); this.group.name = 'memorials'; this.have = new Map(); this.list = []; }
  // F: [{ key, name, t, cause, pos }], ground(x, z, y) → the height to stand it on; years(t) → 'Day N'
  sync(F, ground, when = () => '') {
    const keep = new Set(F.map(f => f.key));
    for (const [k, G] of this.have) if (!keep.has(k)) { this.group.remove(G); this.have.delete(k); }
    this.list = [];
    for (const f of F) {
      let G = this.have.get(f.key), y = ground(f.pos[0], f.pos[2], f.pos[1]);
      if (!G) { G = stone(f.name, `${when(f.t)} · ${f.cause}`); G.position.set(f.pos[0], y, f.pos[2]); G.rotation.y = f.facing ?? 0; this.group.add(G); this.have.set(f.key, G); }
      this.list.push({ x: f.pos[0], z: f.pos[2], y, r: STONE_R, h: STONE_H });
    }
    return this.list;
  }
}
