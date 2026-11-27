// What a great ship's lighters carry (gen/voyages.js tendersAt): the load slung under each one on its way up or down. A tank in its
// cradle, or a pallet of crates, hung from a spreader bar on four cables. Each is made of its parts, every part its own stuff:
// the tank's shell and its domed ends are painted plate, its bands and saddles steel, its valve brass; a crate is boards with steel straps.
import * as THREE from 'three';

const mat = (col, rough, metal) => new THREE.MeshStandardMaterial({ color: new THREE.Color(...col), roughness: rough, metalness: metal });
const HANG = 1.15;      // the spreader bar, this far under the lighter's keel line

function rig(g, steel, cable, w, l, top) {      // the spreader and the four cables down to the load's lifting points (top: their height, under the bar)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, l * 0.9), steel); bar.position.y = -HANG; g.add(bar);
  for (const sz of [-1, 1]) { const cross = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.1, 0.1), steel); cross.position.set(0, -HANG, sz * l * 0.42); g.add(cross);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, HANG, 6), cable); post.position.set(0, -HANG / 2, sz * l * 0.3); g.add(post);
    for (const sx of [-1, 1]) { const a = new THREE.Vector3(sx * w * 0.35, -HANG, sz * l * 0.42), b = new THREE.Vector3(sx * w * 0.5, top, sz * l * 0.36), len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), cable); c.position.copy(a).add(b).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(c); } }
}
function tank(M) {
  const g = new THREE.Group(), R = 1.05, L = 4.6, cy = -HANG - 0.75 - R;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 28, 1, true).rotateX(Math.PI / 2), M.plate); shell.position.y = cy; g.add(shell);
  for (const s of [-1, 1]) { const end = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).rotateX(s * Math.PI / 2), M.plate); end.position.set(0, cy, s * L / 2); g.add(end);
    const man = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12).rotateX(Math.PI / 2), M.steel); man.position.set(0, cy, s * (L / 2 + R * 0.55)); g.add(man); }
  for (const z of [-1.6, 0, 1.6]) { const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.045, 6, 28), M.steel); band.position.set(0, cy, z); g.add(band); }
  for (const z of [-1.5, 1.5]) {      // the saddles it stands on, and their feet
    const sad = new THREE.Mesh(new THREE.BoxGeometry(R * 1.7, 0.5, 0.22), M.steel); sad.position.set(0, cy - R + 0.12, z); g.add(sad);
    for (const x of [-1, 1]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.5), M.steel); foot.position.set(x * R * 0.78, cy - R - 0.14, z); g.add(foot);
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.16), M.steel); lug.position.set(x * R * 0.74, cy + R * 0.7, z * 1.1); g.add(lug); } }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 12), M.steel); neck.position.set(0, cy + R + 0.12, 0); g.add(neck);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 6, 14).rotateX(Math.PI / 2), M.brass); wheel.position.set(0, cy + R + 0.34, 0); g.add(wheel);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), M.brass); stem.position.set(0, cy + R + 0.3, 0); g.add(stem);
  rig(g, M.steel, M.cable, R * 1.5, L, cy + R * 0.7);
  return g;
}
function crates(M) {
  const g = new THREE.Group(), W = 2.5, L = 3.7, top = -HANG - 0.75, H = 1.25, py = top - H - 0.16;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, L), M.wood); deck.position.y = py + 0.09; g.add(deck);
  for (const x of [-1, 0, 1]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, L), M.wood); skid.position.set(x * (W / 2 - 0.1), py - 0.01, 0); g.add(skid); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const cw = W / 2 - 0.12, cl = L / 2 - 0.12, x = sx * W / 4, z = sz * L / 4, y = py + 0.125 + H / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(cw, H, cl), M.board); box.position.set(x, y, z); g.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.05, 0.05, cl + 0.05), M.wood); lid.position.set(x, y + H / 2 + 0.025, z); g.add(lid);
    for (const k of [-1, 1]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.03, H + 0.03, 0.06), M.steel); strap.position.set(x, y, z + k * cl * 0.28); g.add(strap); }
    for (const kx of [-1, 1]) for (const kz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, H, 0.07), M.wood); post.position.set(x + kx * (cw / 2 + 0.01), y, z + kz * (cl / 2 + 0.01)); g.add(post); } }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const eye = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 5, 10), M.steel); eye.position.set(sx * W / 2, py + 0.2, sz * L * 0.36); g.add(eye); }
  rig(g, M.steel, M.cable, W, L, py + 0.2);
  return g;
}

export class TenderLoads {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'tender-loads'; scene.add(this.group); this.pool = { tank: [], crate: [] };
    const steel = mat([0.3, 0.31, 0.33], 0.45, 0.85), cable = mat([0.08, 0.08, 0.09], 0.6, 0.7), brass = mat([0.7, 0.52, 0.2], 0.35, 0.9), wood = mat([0.42, 0.31, 0.19], 0.85, 0), board = mat([0.56, 0.44, 0.28], 0.9, 0);
    this.M = { steel, cable, brass, wood, board }; this.paint = [[0.62, 0.2, 0.12], [0.75, 0.62, 0.18], [0.2, 0.36, 0.5], [0.6, 0.62, 0.6], [0.24, 0.42, 0.26], [0.5, 0.3, 0.14]].map(c => mat(c, 0.5, 0.3));
  }
  // list: gen/voyages.js records (c in world coordinates); only those with a load are drawn
  update(list, toRender) {
    const used = { tank: 0, crate: 0 };
    for (const q of list) { if (!q.load || !this.pool[q.load]) continue; const P = this.pool[q.load]; let g = P[used[q.load]++];
      if (!g) { g = q.load === 'tank' ? tank({ ...this.M, plate: this.paint[P.length % this.paint.length] }) : crates(this.M); g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); P.push(g); this.group.add(g); }
      g.visible = true; g.position.set(...toRender(q.c[0], q.c[1], q.c[2])); g.rotation.set(0, q.facing, 0); }
    for (const k of ['tank', 'crate']) for (let i = used[k]; i < this.pool[k].length; i++) this.pool[k][i].visible = false;
  }
}
// how far under a lighter's keel line its load reaches (it hovers this far over the field to hook on, and over the deck to set down)
export const LOAD_DROP = HANG + 0.75 + 2.1 + 0.2;
