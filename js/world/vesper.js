// The Vesper's city deck in the collision world: you can land on it, walk its streets, ride a lift up a tower and stand on the roof.
// Built from gen/vesper.js in the ship's own frame and set where the ship is (it doesn't move). Walls run along the plan's axes, so the
// curve of the bulwark is stepped in 20 m pieces.
import { vesperCity, deckHalf, DY, RIM, SPIRE_Z } from '../gen/vesper.js';
const HX = 800, HZ = 2700;      // the plan's origin, in the ship's frame
let plan = null;
export function vesperPlan() {
  if (plan) return plan;
  const V = vesperCity(), walls = [], slabs = [];
  const block = (x0, z0, x1, z1, y0, y1) => walls.push({ x0: (x0 + x1) / 2 + HX, z0: z0 + HZ, x1: (x0 + x1) / 2 + HX, z1: z1 + HZ, t: x1 - x0, y0, y1, k: 0, exterior: false, side: 'inner', openings: [] });
  const alongZ = (x, z0, z1, y0, y1, t = 0.6) => walls.push({ x0: x + HX, z0: z0 + HZ, x1: x + HX, z1: z1 + HZ, t, y0, y1, k: 0, exterior: false, side: 'rail', openings: [] });
  const alongX = (z, x0, x1, y0, y1, t = 0.6) => walls.push({ x0: x0 + HX, z0: z + HZ, x1: x1 + HX, z1: z + HZ, t, y0, y1, k: 0, exterior: false, side: 'rail', openings: [] });
  // the deck and its bulwarks, band by band
  const deckRects = []; let prev = null;
  for (let z = -2590; z < 2630; z += 20) {
    const lo = Math.min(deckHalf(z), deckHalf(z + 20)), hi = Math.max(deckHalf(z), deckHalf(z + 20)); if (hi < 3) continue;
    deckRects.push([HX - hi, z + HZ, HX + hi, z + 20 + HZ]);
    for (const s of [-1, 1]) { alongZ(s * lo, z, z + 20, DY - 2, DY + RIM + 1.6); if (prev !== null && Math.abs(prev - lo) > 0.05) alongX(z, s > 0 ? Math.min(prev, lo) : -Math.max(prev, lo), s > 0 ? Math.max(prev, lo) : -Math.min(prev, lo), DY - 2, DY + RIM + 1.6); }
    prev = lo;
  }
  alongX(-2590, -deckHalf(-2590), deckHalf(-2590), DY - 2, DY + RIM + 1.6); alongX(2630, -deckHalf(2630) - 1, deckHalf(2630) + 1, DY - 2, DY + RIM + 1.6);
  slabs.push({ k: 0, y: DY, rects: deckRects });
  // blocks: podiums (their roofs walkable), towers on them, roofs where they're pads, a rail round those
  const pods = [];
  for (const P of V.podiums) { block(P.xm - P.hx, P.zm - P.hz, P.xm + P.hx, P.zm + P.hz, DY - 1, DY + 14); pods.push([HX + P.xm - P.hx, HZ + P.zm - P.hz, HX + P.xm + P.hx, HZ + P.zm + P.hz]); }
  slabs.push({ k: 0, y: DY + 14, rects: pods });
  const roofs = [];
  for (const T of V.towers) {
    const q = T.e >= 4 ? 0.96 : 0.84; block(T.x - T.w / 2 * q, T.z - T.d / 2 * q, T.x + T.w / 2 * q, T.z + T.d / 2 * q, T.y0 - 1, T.y0 + T.h);
    if (T.crown !== 'pad') continue;
    const rq = T.e >= 4 ? 0.94 : 0.78, rx = T.rx * rq, rz = T.rz * rq; roofs.push([HX + T.x - rx, HZ + T.z - rz, HX + T.x + rx, HZ + T.z + rz]);
    block(T.x - rx, T.z - rz, T.x + rx, T.z + rz, T.y0 + T.h - 1, T.top);         // (the band under the roof, so you stand on top of it)
    alongX(T.z - rz, T.x - rx, T.x + rx, T.top, T.top + 1.1, 0.2); alongX(T.z + rz, T.x - rx, T.x + rx, T.top, T.top + 1.1, 0.2); alongZ(T.x - rx, T.z - rz, T.z + rz, T.top, T.top + 1.1, 0.2); alongZ(T.x + rx, T.z - rz, T.z + rz, T.top, T.top + 1.1, 0.2);
  }
  // roofs as slabs, one per height so each is found at its own level
  for (const T of V.towers) if (T.crown === 'pad') { const r = roofs.shift(); slabs.push({ k: 0, y: T.top, roof: true, rects: [r] }); }
  // the spire and the feet of its buttresses, the park domes, the boulevard's trees
  block(-184, SPIRE_Z - 184, 184, SPIRE_Z + 184, DY - 1, DY + 1050);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.26, x = Math.cos(a) * 352, z = SPIRE_Z + Math.sin(a) * 352; block(x - 14, z - 14, x + 14, z + 14, DY - 1, DY + 60); }
  for (const [x, z, R] of V.parks) block(x - R * 0.72, z - R * 0.72, x + R * 0.72, z + R * 0.72, DY - 1, DY + R * 0.7);
  for (const [x, z] of V.trees) block(x - 0.6, z - 0.6, x + 0.6, z + 0.6, DY, DY + 6);
  for (const [x, z] of V.lamps) block(x - 0.15, z - 0.15, x + 0.15, z + 0.15, DY, DY + 5);
  plan = { key: 'ship:vesper-city', type: 'city-deck', w: 2 * HX, d: 2 * HZ, F: 1, H: DY + 1300, walls, windows: [], units: [], slabs, ramps: [], rooms: [], props: [], anchors: [], solids: [], doors: [], entrance: -1, layout: { W: 2 * HX, D: 2 * HZ, deck: DY, ceiling: DY + 1300, hull: [0, 0, 2 * HX, 2 * HZ], doors: [], rooms: [], props: [], seats: [] } };
  return plan;
}
// The structure, framed by the ship (C: its fleet entry), in settlement s's coordinates.
export function vesperStructure(s, C) {
  const p = vesperPlan(), c = Math.cos(C.yaw), sn = Math.sin(C.yaw), W = (x, z) => [C.x + x * c + z * sn, C.z - x * sn + z * c];
  const L = (x, z) => s.toLocal(...W(x, z)), o = L(-HX, -HZ), ax = L(-HX + 1, -HZ), az = L(-HX, -HZ + 1);
  const ex = [ax[0] - o[0], ax[1] - o[1]], ez = [az[0] - o[0], az[1] - o[1]];
  const cs = [[0, 0], [p.w, 0], [0, p.d], [p.w, p.d]].map(([x, z]) => [o[0] + ex[0] * x + ez[0] * z, o[1] + ex[1] * x + ez[1] * z]);
  return { key: 'vesper-city', n: -1, type: 'city-deck', owner: 'the Vesper', label: 'the Vesper', plan: p, O: o, ex, ez, w: p.w, d: p.d, base: C.y, doorPassable: () => true,
    rect: [Math.min(...cs.map(q => q[0])), Math.min(...cs.map(q => q[1])), Math.max(...cs.map(q => q[0])), Math.max(...cs.map(q => q[1]))], toWorld: (x, y, z) => { const [wx, wz] = W(x, z); return [wx, C.y + y, wz]; } };
}
