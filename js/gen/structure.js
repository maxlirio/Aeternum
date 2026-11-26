// What holds a building up. Its plan (gen/building.js) taken as parts: every wall in panels (a couple of metres along, half a storey
// high), every floor and the roof in squares, and whatever stands over the roof (a dome, a spire) in the squares above those. Each part
// knows what bears it: the panel under it, the walls of the storey below a floor, the square below a piece of dome; and what it can
// hang from beside it, over a short span (a panel over a hole, held by its neighbours; a floor's edge past its last wall).
// Take parts out (strike) and whatever is left with nothing bearing it comes down too (settle); the rest stands, with the hole in it.
// Pure, and the same parts render/ruin.js cuts the drawn building into and player/collision.js makes solid: the keys are shared.
import { hashStr } from '../core/hash.js';

const rnd = (key, k) => hashStr(k * 7919 + 13, key) / 4294967296;
export const cellOf = (cuts, v) => { let i = 0; while (i < cuts.length && v > cuts[i]) i++; return i; };
const cache = new Map();

export function structureOf(b, plan) {
  let S = cache.get(b.key); if (S && S.plan === plan) return S;
  const R = k => rnd(b.key, k), H = plan.H, F = plan.F, TOP = F + 6;
  const walls = plan.walls.map((wl, wi) => { const alongX = wl.z0 === wl.z1, a0 = Math.min(alongX ? wl.x0 : wl.z0, alongX ? wl.x1 : wl.z1), a1 = Math.max(alongX ? wl.x0 : wl.z0, alongX ? wl.x1 : wl.z1), cuts = [];
    for (let a = a0 + 1.2 + 1.4 * R(900 + wi), n = 0; a < a1 - 0.8; a += 1.7 + 1.6 * R(1000 + wi * 13 + ++n)) cuts.push(a);
    const Hh = Math.max(1, (wl.y1 - wl.y0) / 2), ys = []; for (let j = -4; j <= 12; j++) ys.push(wl.y0 + j * Hh);
    return { wl, wi, alongX, a0, a1, cc: alongX ? wl.z0 : wl.x0, t: wl.t, cuts, Hh, ys, m: wl.t / 2 + (wl.exterior ? 0.4 : 0.12) }; });
  const gx = [], gz = [], gy = []; for (let x = 1.1 + 1.2 * R(701), n = 0; x < b.w + 3; x += 1.9 + 1.3 * R(710 + ++n)) gx.push(x); for (let z = 1.1 + 1.2 * R(702), n = 0; z < b.d + 3; z += 1.9 + 1.3 * R(760 + ++n)) gz.push(z); for (let k = 0; k <= TOP; k++) gy.push((k + 0.5) * H);
  const nodes = [], index = new Map(), add = N => { N.i = nodes.length; N.up = []; N.side = []; nodes.push(N); index.set(N.key, N.i); return N; };
  // the walls' panels
  for (const W of walls) for (let ci = 0; ci <= W.cuts.length; ci++) for (let row = 0; row < 2; row++) { const u0 = ci ? W.cuts[ci - 1] : W.a0, u1 = ci < W.cuts.length ? W.cuts[ci] : W.a1, y0 = W.wl.y0 + row * W.Hh, t = W.t / 2;
    add({ key: 'w' + W.wi + ':' + ci + ':' + row, wall: W, ci, row, k: W.wl.k, box: W.alongX ? [u0, y0, W.cc - t, u1, y0 + W.Hh, W.cc + t] : [W.cc - t, y0, u0, W.cc + t, y0 + W.Hh, u1] }); }
  // the floors' and the roof's squares, and the squares over the roof
  for (let lvl = 1; lvl <= TOP; lvl++) for (let ix = 0; ix <= gx.length; ix++) for (let iz = 0; iz <= gz.length; iz++) { const x0 = ix ? gx[ix - 1] : -3, x1 = ix < gx.length ? gx[ix] : b.w + 3, z0 = iz ? gz[iz - 1] : -3, z1 = iz < gz.length ? gz[iz] : b.d + 3;
    add({ key: 'f' + ix + ':' + iz + ':' + lvl, ix, iz, lvl, box: lvl <= F ? [x0, lvl * H - 0.3, z0, x1, lvl * H + 0.3, z1] : [x0, (lvl - 0.5) * H, z0, x1, (lvl + 0.5) * H, z1] }); }
  const at = key => nodes[index.get(key)], over = (p, q, m) => p[0] < q[3] + m && p[3] > q[0] - m && p[2] < q[5] + m && p[5] > q[2] - m;
  // who bears whom (N.up: the parts N holds up), and who can hang from whom beside it (N.side)
  const top = new Map(); for (const N of nodes) if (N.wall && N.row === 1) (top.get(N.k) || top.set(N.k, []).get(N.k)).push(N);
  for (const N of nodes) {
    if (N.wall) { if (N.row === 1) at('w' + N.wall.wi + ':' + N.ci + ':0').up.push(N.i);
      if (N.row === 0 && N.k > 0) { for (const M of top.get(N.k - 1) || []) if (over(N.box, M.box, 0.25)) M.up.push(N.i); const cx = (N.box[0] + N.box[3]) / 2, cz = (N.box[2] + N.box[5]) / 2, Fl = at('f' + cellOf(gx, cx) + ':' + cellOf(gz, cz) + ':' + N.k); if (Fl) Fl.up.push(N.i); }
      for (const d of [-1, 1]) { const M = at('w' + N.wall.wi + ':' + (N.ci + d) + ':' + N.row); if (M) N.side.push(M.i); } }
    else { if (N.lvl <= F) { for (const M of top.get(N.lvl - 1) || []) if (over(N.box, M.box, 0.3)) M.up.push(N.i); } else at('f' + N.ix + ':' + N.iz + ':' + (N.lvl - 1))?.up.push(N.i);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const M = at('f' + (N.ix + dx) + ':' + (N.iz + dz) + ':' + N.lvl); if (M) N.side.push(M.i); } } }
  S = { plan, key: b.key, H, F, walls, gx, gz, gy, nodes, index, w: b.w, d: b.d };
  // how far each part already hangs out from what bears it, as built (a wide room's floor, an eave): it may hang that far and one more, no further
  // (a partition built on a floor's open span, with no wall under it: that floor carries it anyway, as built)
  { const a = spans(S, null, true, false, true), w = spans(S, null, true, true, true); for (const N of nodes) if (N.wall && a[N.i] >= 99 && w[N.i] >= 99) N.onFloor = true; }
  const span0 = spans(S, null, false, false), spanW = spans(S, null, false, true); for (const N of nodes) { N.real = span0[N.i] < 99 || spanW[N.i] < 99; N.max = Math.max(N.wall ? 1 : 2, (span0[N.i] < 99 ? span0[N.i] : 0) + (N.wall ? 0 : 1)); }
  // (the parts there's certainly something of: the walls, and the floors and roof over the plot; an eave's square or one over the roof may be empty air)
  for (const N of nodes) N.solid = N.real && (!!N.wall || N.lvl <= F && N.box[0] < b.w && N.box[3] > 0 && N.box[2] < b.d && N.box[5] > 0);
  S.count = nodes.filter(N => N.solid).length;
  cache.set(b.key, S); return S;
}
// how far each standing part is from something that bears it (0: borne; 99: by nothing), with the parts in `gone` out. lim: held to how far each may
// hang. weak: counted from the partitions inside only (which hold up what's on them and one part beside, no more); else from the outer walls
function spans(S, gone, lim, weak, anyReach = false) {
  const n = S.nodes.length, sp = new Int16Array(n).fill(99), q = [];
  for (const N of S.nodes) if (N.wall && N.k === 0 && N.row === 0 && !N.wall.wl.exterior === weak && !gone?.has(N.i)) { sp[N.i] = 0; q.push(N.i); }
  for (let h = 0; h < q.length; h++) { const N = S.nodes[q[h]], s = sp[N.i];
    for (const i of N.up) if (!gone?.has(i) && sp[i] > 0 && (s === 0 || N.wall || !S.nodes[i].wall || S.nodes[i].onFloor || !lim)) { sp[i] = 0; q.push(i); }      // (a floor carries a wall only where the floor itself is carried, not out on its overhang)
    for (const i of N.side) if (!gone?.has(i) && sp[i] > s + 1 && (!lim || anyReach || s + 1 <= (weak ? 1 : S.nodes[i].max))) { sp[i] = s + 1; q.push(i); } }
  return sp;
}
// with `gone` (a Set of part numbers) out: the parts still standing that nothing bears any more → their numbers, lowest first
export function settle(S, gone) {
  const sp = spans(S, gone, true, false), spW = spans(S, gone, true, true), out = []; for (let i = 0; i < sp.length; i++) if (spW[i] < sp[i]) sp[i] = spW[i];
  // a storey that's lost most of its outer wall can't carry what's over it, whatever partitions are left inside: all of that comes down
  let fail = 99; for (let k = 0; k < S.F && fail === 99; k++) { let n = 0, up = 0; for (const N of S.nodes) if (N.wall && N.k === k && N.row === 0 && N.wall.wl.exterior) { n++; if (!gone.has(N.i) && sp[N.i] < 99) up++; } if (n && up < n * 0.25) fail = k; }
  for (const N of S.nodes) if (N.real && !gone.has(N.i) && (sp[N.i] >= 99 || (N.wall ? N.k : N.lvl - 1) > fail || !N.wall && N.lvl - 1 === fail)) out.push(N.i);
  return out.sort((a, b) => S.nodes[a].box[1] - S.nodes[b].box[1] || a - b);
}
// something goes off at p ([x, y, z], building-local, y over its base) and breaks what's within r of it: → { hit, fell } part numbers (hit: broken
// by it; fell: what came down for want of them), none of them in `gone` before. gone isn't changed.
export function strike(S, gone, p, r) {
  const hit = [];
  for (const N of S.nodes) { if (!N.real || gone.has(N.i)) continue; const B = N.box, dx = Math.max(B[0] - p[0], 0, p[0] - B[3]), dy = Math.max(B[1] - p[1], 0, p[1] - B[4]), dz = Math.max(B[2] - p[2], 0, p[2] - B[5]); if (dx * dx + dy * dy + dz * dz < r * r) hit.push(N.i); }
  if (!hit.length) return { hit, fell: [] };
  const after = new Set(gone); for (const i of hit) after.add(i);
  return { hit, fell: settle(S, after) };
}
