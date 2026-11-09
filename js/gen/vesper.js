// The Vesper's city, as a place: the deck inside its bulwarks, the streets and blocks, every tower's footprint and height, which roofs are
// pads you can stand on, and the lifts up to them. The same numbers build the model (tools/assets/capital_kit.py reads them from
// assets/ships/vesper.json, written by tools/gen-rings.mjs) and the collision world walks them (world/vesper.js), so a roof you see is a roof
// you can stand on. Ship frame: x across, y up from the ship's centre, z from stern (−) to bow (+). Pure: + − × ÷, floor, sqrt only.
import { Rng } from '../core/prng.js';

export const DY = 120, RIM = 18, SPIRE_Z = -200;
const HULL = [[-2600, 520], [-2400, 690], [-1800, 760], [-280, 772], [900, 750], [1700, 610], [2250, 360], [2520, 120], [2640, 6]];
// a smooth curve through points that never overshoots them (the same as tools/assets/ship_kit.py _pchip)
function pchip(u, ys, x) {
  const n = u.length; if (x <= u[0]) return ys[0]; if (x >= u[n - 1]) return ys[n - 1];
  let i = 0; while (i < n - 2 && x > u[i + 1]) i++;
  const h = [], d = []; for (let k = 0; k < n - 1; k++) { h.push(Math.max(1e-9, u[k + 1] - u[k])); d.push((ys[k + 1] - ys[k]) / h[k]); }
  const m = [d[0]]; for (let k = 1; k < n - 1; k++) { let v = 0; if (d[k - 1] * d[k] > 0) { const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; v = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]); } m.push(v); } m.push(d[n - 2]);
  const t = (x - u[i]) / h[i], t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
}
export const hullHalf = z => pchip(HULL.map(q => q[0]), HULL.map(q => q[1]), z);
export const deckHalf = z => Math.max(0.4, hullHalf(z) * 0.93 - 12);          // the deck runs out to the foot of the bulwark
export const PARKS = [[-420, 1050, 190], [420, -1450, 170], [-400, -1700, 150]];
const E = { slab: 5, round: 2, stepped: 4, needle: 2.6 }, TP = { slab: 0.9, round: 0.82, stepped: 1, needle: 0.42 };

let cached = null;
export function vesperCity() {
  if (cached) return cached;
  const rng = new Rng([0x7e59e2, 51]), podiums = [], towers = [], bridges = [], lifts = [];
  const zs = []; for (let z = -2400; z < 2350; z += 250) zs.push(z);
  const bands = [[70, 300], [330, 900]];
  for (let b = 0; b + 1 < zs.length; b++) {
    const z0 = zs[b] + 16, z1 = zs[b + 1] - 16;
    for (const [bx0, bx1_] of bands) {
      const edge = Math.min(deckHalf(z0), deckHalf(z1)) - 30, bx1 = Math.min(bx1_, edge); if (bx1 - bx0 < 60) continue;
      for (const sx of [-1, 1]) {
        const [xa, xb] = sx > 0 ? [bx0, bx1] : [-bx1, -bx0], xm = (xa + xb) / 2, zm = (z0 + z1) / 2;
        if (Math.sqrt(xm * xm + (zm - SPIRE_Z) * (zm - SPIRE_Z)) < 470 || PARKS.some(([a, c, R]) => Math.sqrt((xm - a) * (xm - a) + (zm - c) * (zm - c)) < R + 140)) continue;
        const P = { xm, zm, hx: (xb - xa) / 2 - 4, hz: (z1 - z0) / 2 - 4, lit: rng.chance(0.6) }; podiums.push(P);
        const nx = xb - xa < 170 ? 1 : 2, nz = rng.chance(0.4) ? 1 : 2;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const cx = xa + (xb - xa) * (i + 0.5) / nx + rng.range(-8, 8), cz = z0 + (z1 - z0) * (j + 0.5) / nz + rng.range(-8, 8);
          const lw = (xb - xa) / nx * rng.range(0.5, 0.74), ld = (z1 - z0) / nz * rng.range(0.5, 0.74), dx = cx, dz = cz - SPIRE_Z, ds = Math.sqrt(dx * dx + dz * dz) / 950;
          const ends = cz > 1500 ? 0.7 - 0.45 * Math.min(1, (cz - 1500) / 800) : cz < -1950 ? 0.7 - 0.4 * Math.min(1, (-1950 - cz) / 450) : 1;
          const h = (70 + 430 / (1 + ds + ds * ds / 2 + ds * ds * ds / 6)) * rng.range(0.6, 1.25) * (1 - 0.45 * (cx / 800) * (cx / 800)) * ends;
          const kind = h > 120 ? rng.pick(['slab', 'slab', 'round', 'stepped', 'stepped', 'slab', 'needle']) : rng.pick(['slab', 'round']);
          const q = rng.next(), crown = kind === 'needle' || q < 0.1 ? 'cone' : q < 0.6 ? 'pad' : 'cap';
          const T = { id: towers.length, x: cx, z: cz, y0: DY + 14, h, w: Math.min(lw, 140), d: Math.min(ld, 140), kind, e: E[kind], crown, seed: rng.int(0, 1e6) };
          // the roof: how big it is up there, after the taper or the setbacks
          const k = kind === 'stepped' ? 0.5 : TP[kind]; T.rx = T.w / 2 * k; T.rz = T.d / 2 * k; T.top = T.y0 + h + (crown === 'pad' ? 6 : 0);
          towers.push(T);
          if (nz === 2 && j === 0 && h > 160 && rng.chance(0.5)) { const yb = T.y0 + h * rng.range(0.35, 0.6); bridges.push({ x: cx, z0: cz + ld / 2 * 0.8, z1: cz + (z1 - z0) / 2 - ld / 2 * 0.8 + 6, y: yb }); }
          // a pad roof has a lift up to it, its door at the foot of the block on the street
          if (crown === 'pad' && h > 60) lifts.push({ tower: T.id, street: [cx, DY, zm - P.hz - 2.6], roof: [cx, T.top, cz - T.rz * 0.45] });
        }
      }
    }
  }
  // lamps down every street and avenue, a bench by every other one
  const lamps = [], open = (x, z) => Math.sqrt(x * x + (z - SPIRE_Z) * (z - SPIRE_Z)) > 400 && !PARKS.some(([a, c, R]) => Math.sqrt((x - a) * (x - a) + (z - c) * (z - c)) < R + 12) && Math.abs(x) < deckHalf(z) - 8;
  for (const z of zs) for (const dz of [-11, 11]) for (let x = 74; x < 900; x += 40) for (const sx of [-1, 1]) if (open(sx * x, z + dz)) lamps.push([sx * x, z + dz]);
  for (const ax of [315, 62]) for (const dx of [-10, 10]) for (let z = -2380; z < 2330; z += 40) for (const sx of [-1, 1]) { const x = sx * (ax + dx); if (Math.abs(x) > 52 && open(x, z) && !zs.some(q => Math.abs(z - q) < 18)) lamps.push([x, z]); }
  const trees = []; for (let z = -2230; z < 2050; z += 30) { if (Math.abs(z - SPIRE_Z) < 400) continue; for (const sx of [-1, 1]) trees.push([sx * 14, z]); }
  const deck = []; for (let z = -2600; z <= 2640; z += 10) deck.push([z, +deckHalf(z).toFixed(3)]);
  cached = { DY, RIM, SPIRE_Z, deck, podiums, towers, bridges, lifts, trees, lamps, parks: PARKS, plaza: [40, SPIRE_Z + 430] };
  return cached;
}
