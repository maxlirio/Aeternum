// What a fighter carries under its wings: where each missile hangs (in the ship's own frame, as its model is built: tools/assets/build.py jet),
// and the order they go in. The model's missiles are cut out of its hull when it's loaded (splitOrdnance) so each one is its own part: it hangs
// on its pylon until it's fired, drops clear, lights, and is gone from the wing.
import FIGHTERS from '../../assets/ships/fighters.json' with { type: 'json' };

const cache = new Map();
// [{ x, y, z }] in the order they're fired: outermost pair first, left then right
export function pylonsOf(model) {
  if (cache.has(model)) return cache.get(model);
  const L = FIGHTERS[model]; let out = [];
  if (L?.jet && L.weapons?.missiles) {
    const J = L.jet, W = L.W, D = L.D, xc = W / 2, fr = 1.05, fy = L.deck + 0.55, wingY = fy - 0.15, nm = L.weapons.missiles >> 1;
    const y = (J.wing === 'flying' ? fy : J.wing === 'straight' ? wingY + 0.3 : wingY) - 0.45;
    for (let m = nm - 1; m >= 0; m--) for (const s of [-1, 1]) {
      const root = xc + s * fr * 0.8, tip = xc + s * W / 2;
      out.push(J.wing === 'flying' ? { x: xc + s * (1.4 + m * 1.1), y, z: D * 0.45 } : { x: root + (tip - root) * (0.3 + 0.55 * (m + 0.5) / Math.max(1, nm)), y, z: D * (J.wing === 'forward' ? 0.28 : 0.3) });
    }
  }
  cache.set(model, out); return out;
}
// the pylon the next missile leaves from, with `left` still aboard: its offset from the ship's centre point (x across, y up, z ahead), or null
export function nextPylon(model, left) {
  const P = pylonsOf(model), L = FIGHTERS[model]; if (!P.length || left <= 0) return null;
  const p = P[Math.min(P.length - 1, Math.max(0, P.length - left))]; return [p.x - L.W / 2, p.y, p.z - L.D / 2];
}
// is this corner (dx, dy, dz from a missile's middle) part of the missile, and not of the pylon it hangs from or the wing over it?
const inMissile = (dx, dy, dz) => Math.abs(dx) < 0.3 && dy > -0.3 && dy < 0.22 && dz > -1.46 && dz < 1.76;
const inPylon = (dx, dy, dz) => Math.abs(dx) < 0.047 && dy > 0.113 && Math.abs(dz) < 0.41;
// Cut the missiles out of a fighter's hull parts. prims: [{ geometry (three BufferGeometry, in the ship's frame), slot }] → the same list with the
// missiles gone from each geometry, and { pylons, prims: [{ geometry (one missile, about its own middle), slot }] }, or null if it carries none.
export function splitOrdnance(model, prims, THREE) {
  const P = pylonsOf(model); if (!P.length) return null;
  const parts = [];
  for (const pr of prims) {
    if (pr.slot !== 'paint' && pr.slot !== 'metal') continue;      // (what a missile's made of; the hull's own skin stays whole)
    const g = pr.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, keep = [], take = [];
    const which = i => { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); for (let k = 0; k < P.length; k++) { const dx = x - P[k].x, dy = y - P[k].y, dz = z - P[k].z; if (inMissile(dx, dy, dz)) return inPylon(dx, dy, dz) ? -2 - k : k; } return -1; };
    for (let t = 0; t < n; t += 3) { const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2, ka = which(a), kb = which(b), kc = which(c);
      const all = ka >= 0 || kb >= 0 || kc >= 0 ? [ka, kb, kc].every(k => k !== -1) && ![ka, kb, kc].every(k => k < -1) : false;      // (every corner inside one missile's space, and not all of them the pylon's)
      if (all) { const k = [ka, kb, kc].find(k => k >= 0); if (k === 0) take.push(a, b, c); } else keep.push(a, b, c); }
    if (keep.length === n) continue;
    g.setIndex(keep); g.computeBoundingBox(); g.computeBoundingSphere();
    if (take.length) { const m = new THREE.BufferGeometry(), map = new Map(), order = []; for (const i of take) if (!map.has(i)) { map.set(i, order.length); order.push(i); }
      for (const [name, at] of Object.entries(g.attributes)) { const A = new Float32Array(order.length * at.itemSize); order.forEach((i, j) => { for (let c = 0; c < at.itemSize; c++) A[j * at.itemSize + c] = at.getComponent(i, c); }); m.setAttribute(name, new THREE.BufferAttribute(A, at.itemSize)); }
      m.setIndex(take.map(i => map.get(i))); m.translate(-P[0].x, -P[0].y, -P[0].z); m.computeBoundingSphere(); parts.push({ geometry: m, slot: pr.slot }); }
  }
  return parts.length ? { pylons: P, prims: parts } : null;
}
