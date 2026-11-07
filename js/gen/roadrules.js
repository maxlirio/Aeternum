// The rules of the road, as data: which junctions have lights, what each light shows, the speed limit where you are. Pure in time, like the traffic that obeys them.
import { surfaceAt } from './surface.js';
import { lineAt, lineWidth, lineKind, PITCH, blockExists } from './city.js';

export const CYCLE = 34;
const phase = (seed, t) => { const x = (((t + seed * CYCLE) % CYCLE) + CYCLE) % CYCLE, h = CYCLE / 2; return x < h - 3 ? 0 : x < h ? -1 : x < 2 * h - 3 ? 1 : -1; };   // 0: the road along v goes; 1: the road along u; -1: amber, all held

// The junctions in a town that have lights: anywhere roads cross or meet at a T.
const made = new WeakMap();
export function townSignals(s) {
  let L = made.get(s); if (L) return L;
  const by = new Map(); for (const r of s.roads || []) for (const n of [r.na, r.nb]) (by.get(n) || by.set(n, []).get(n)).push(r);
  L = [];
  for (const [n, rs] of by) {
    const node = s.nodes[n], alongU = rs.filter(r => r.a[1] === r.b[1]), alongV = rs.filter(r => r.a[1] !== r.b[1]);
    if (rs.length < 3 || !alongU.length || !alongV.length) continue;
    const arm = (list, ax, sg) => list.some(r => { const a = ax ? r.a[0] : r.a[1], b = ax ? r.b[0] : r.b[1], c = ax ? node.u : node.v; return sg > 0 ? Math.max(a, b) > c + 1 : Math.min(a, b) < c - 1; });
    const [x, z] = s.toWorld(node.u, node.v);
    L.push({ n, u: node.u, v: node.v, x, z, hu: Math.max(...alongV.map(r => r.w / 2)), hv: Math.max(...alongU.map(r => r.w / 2)), seed: ((n * 2654435761) >>> 0) / 4294967296, arms: { up: arm(alongU, 1, 1), um: arm(alongU, 1, -1), vp: arm(alongV, 0, 1), vm: arm(alongV, 0, -1) } });
  }
  made.set(s, L); return L;
}
export const townLight = (S, t) => phase(S.seed, t);
// World heading → the town's own axes.
const toAxes = (s, fx, fz) => [fx * s.cos + fz * s.sin, -fx * s.sin + fz * s.cos];
// The nearest red light ahead of something at (x, z) heading (fx, fz) in town s: { d: metres to the stop line, S }, or null.
export function townRedAhead(s, x, z, fx, fz, t, reach = 60) {
  const [u, v] = s.toLocal(x, z), [du, dv] = toAxes(s, fx, fz), alongU = Math.abs(du) > Math.abs(dv), sg = alongU ? Math.sign(du) : Math.sign(dv); let best = null;
  for (const S of townSignals(s)) {
    const a = alongU ? (S.u - u) * sg : (S.v - v) * sg, side = alongU ? v - S.v : u - S.u, half = alongU ? S.hu : S.hv, wide = alongU ? S.hv : S.hu, d = a - half - 2.6;
    if (d < -1.5 || d > reach || Math.abs(side) > wide + 0.5 || (best && d >= best.d)) continue;
    const st = phase(S.seed, t); if (st === (alongU ? 1 : 0)) continue;
    best = { d, S, now: (X, Z) => { const [U, V] = s.toLocal(X, Z); return (alongU ? (S.u - U) : (S.v - V)) * sg - half - 2.6; }, red: T => phase(S.seed, T) !== (alongU ? 1 : 0) };
  }
  return best;
}
// Same in the megacity: its lights stand where the busier streets meet (gen/city.js).
export function cityRedAhead(c, signalAt, x, z, fx, fz, t, reach = 60) {
  const [u, v] = c.toLocal(x, z), [ax, az] = c.toLocal(x + fx, z + fz), du = ax - u, dv = az - v, alongU = Math.abs(du) > Math.abs(dv), sg = alongU ? Math.sign(du) : Math.sign(dv), here = Math.round((alongU ? v : u) / PITCH), first = Math.round((alongU ? u : v) / PITCH); let best = null;
  for (const k of [-1, 0, 1]) {
    const cross = first + k, along = alongU ? 0 : 1, pos = lineAt(c, along, cross), w = lineWidth(cross) / 2, d = (pos - (alongU ? u : v)) * sg - w - 2.6;
    if (d < -1.5 || d > reach || (best && d >= best.d)) continue;
    if (lineKind(cross) === 'street' && lineKind(here) === 'street') continue;
    const [i, j] = alongU ? [cross, here] : [here, cross]; if (!blockExists(c, i, j)) continue;
    if (signalAt(c, i, j, t) === (alongU ? 1 : 0)) continue;
    best = { d, i, j, now: (X, Z) => { const [U, V] = c.toLocal(X, Z); return (pos - (alongU ? U : V)) * sg - w - 2.6; }, red: T => signalAt(c, i, j, T) !== (alongU ? 1 : 0) };
  }
  return best;
}
// The limit where you are, in km/h. null: no road, no limit.
export function speedLimit(planet, x, z) { const q = surfaceAt(planet, x, z); if (q.city > 0.3 || q.town > 0.3) return 50; if (q.road > 0.3) return 90; return null; }
// Are you on the wrong side of the street you're on? (They keep right here.)
export function wrongSideTown(s, x, z, fx, fz) {
  const [u, v] = s.toLocal(x, z), [du, dv] = toAxes(s, fx, fz), alongU = Math.abs(du) > Math.abs(dv);
  for (const r of s.roads || []) {
    if ((r.a[1] === r.b[1]) !== alongU) continue;
    const c = alongU ? r.a[1] : r.a[0], lo = Math.min(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]), hi = Math.max(alongU ? r.a[0] : r.a[1], alongU ? r.b[0] : r.b[1]), p = alongU ? u : v, off = (alongU ? v : u) - c;
    if (p < lo + r.w || p > hi - r.w || Math.abs(off) > r.w / 2) continue;
    const right = alongU ? -Math.sign(du) : Math.sign(dv);     // (right of +v is +u; right of +u is -v)
    return off * right < -0.8;
  }
  return false;
}
