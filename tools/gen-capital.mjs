// The insides of the fleet's great ships (gen/capital.js), each laid out for that ship alone: a hangar the width of its docking block with
// craft standing in rows either side of a clear lane and the crews who turn them round, the working decks behind it, and over those an upper
// deck reached by stairs from the hangar floor: a gallery along the back of the hangar, the flight control, and the bridge, which looks out
// over the hangar to its mouth. The Meridian's is built round the terminal where the lifts to its rings stand.
//   node tools/gen-capital.mjs
// Layout frame: x across the mouth, z inward from it, y up from the mouth's sill. Same format as the Harrow's (tools/gen-harrow.mjs): spaces
// with their own floors and ceilings, walls from their sides, decks, stairs (they rise along z), furniture; and besides: where craft stand
// (berths), where the crew work (crew: posts and rounds), the lamps the light is worked out from (tools/assets/fleet_kit.py), signs.
import { writeFileSync } from 'node:fs';
const r2 = v => Math.round(v * 100) / 100, deck = 1, UP = 7;      // (the upper deck's floor)
const SOFT = new Set(['bed', 'sofa', 'armchair', 'chair', 'throne']);

function ship(name, W, HD, HH, MW, MH, ID, theme, body) {
  const xc = W / 2, zb = 1 + HD, zE = zb + ID, D = zE + 1;
  const S = { name, W, D, HD, HH, MW, MH, xc, zb, zE, rooms: [], doors: [], walls: [], slabs: [], ramps: [], props: [], lights: [], berths: [], crew: [], gates: [], signs: [], cap: {} };
  const room = (purpose, label, rect, y0, y1, more = {}) => { S.rooms.push({ i: S.rooms.length, purpose, label, rect: rect.map(r2), y0, y1, ...more }); return S.rooms.length - 1; };
  const door = (a, b, x, z, width, height, axis = 'x', kind = 'hatch') => { S.doors.push({ id: S.doors.length, kind, rooms: [a, b], x: r2(x), z: r2(z), width, height, axis, y: Math.max(S.rooms[a].y0, typeof b === 'number' ? S.rooms[b].y0 : 0) }); return S.doors.length - 1; };
  const wall = (x0, z0, x1, z1, y0, y1, rm, more = {}) => S.walls.push({ x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1), y0, y1, room: rm, doors: [], ...more });
  const rail = (x0, z0, x1, z1, y, top = 1.05) => S.walls.push({ x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1), y0: y, y1: y + top, rail: true, doors: [] });
  const slab = (y, rect, roof) => S.slabs.push({ y, rects: [rect.map(r2)], ...(roof ? { roof: true } : {}) });
  // a flight of stairs, with the sides shut under it (you can't walk in beneath) and a balustrade up each side (drawn raked: fleet_kit.py)
  const stair = (x0, x1, z0, z1, y0, y1) => { S.ramps.push({ x0: r2(x0), x1: r2(x1), z0: r2(z0), z1: r2(z1), y0, y1 }); const n = 4, lo = Math.min(y0, y1);
    for (let k = 0; k < n; k++) { const a = z0 + (z1 - z0) * k / n, b = z0 + (z1 - z0) * (k + 1) / n, top = Math.max(y0 + (y1 - y0) * k / n, y0 + (y1 - y0) * (k + 1) / n) + 1.05; for (const x of [x0, x1]) S.walls.push({ x0: r2(x), z0: r2(Math.min(a, b)), x1: r2(x), z1: r2(Math.max(a, b)), y0: lo, y1: top, rail: true, stair: true, doors: [] }); } };
  const clearOf = (rm, x0, z0, x1, z1) => S.doors.every(d => !d.rooms.includes(rm) || x1 < d.x - d.width / 2 - 1.3 || x0 > d.x + d.width / 2 + 1.3 || z1 < d.z - (d.axis === 'x' ? 2.2 : d.width / 2 + 1.3) || z0 > d.z + (d.axis === 'x' ? 2.2 : d.width / 2 + 1.3));
  const put = (kind, rm, x0, z0, x1, z1, h, face = 0, more = {}) => { const R = S.rooms[rm].rect; if (x0 < R[0] + 0.08 || x1 > R[2] - 0.08 || z0 < R[1] + 0.08 || z1 > R[3] - 0.08 || (!more.over && !clearOf(rm, x0, z0, x1, z1))) return false;
    if (!more.over && S.props.some(q => q.room === rm && !(x1 <= q.x0 + 0.02 || x0 >= q.x1 - 0.02 || z1 <= q.z0 + 0.02 || z0 >= q.z1 - 0.02) && Math.abs((q.y) - (more.y ?? S.rooms[rm].y0)) < 2)) return false;
    const cap = S.cap[rm]; if (cap && !more.over) { if (cap.props <= 0) return false; cap.props--; }
    S.props.push({ kind, room: rm, x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1), y: S.rooms[rm].y0, h, face, ...(SOFT.has(kind) ? { soft: true } : {}), ...more }); return true; };
  const lamp = (rm, x, y, z, R, col = theme.lamp, I = 1) => S.lights.push({ room: rm, p: [r2(x), r2(y), r2(z)], R, col, I });
  const lampGrid = (rm, pitch, R, col, I = 1, drop = 0.5) => { const [x0, z0, x1, z1] = S.rooms[rm].rect, nx = Math.max(1, Math.round((x1 - x0) / pitch)), nz = Math.max(1, Math.round((z1 - z0) / pitch)); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) lamp(rm, x0 + (x1 - x0) * (i + 0.5) / nx, S.rooms[rm].y1 - drop, z0 + (z1 - z0) * (j + 0.5) / nz, R, col, I); };
  // someone at work: standing or sitting at (x, z) on the floor of that space, facing f (0 = inward, +z); role says what they wear
  const post = (rm, x, z, f, pose = 'stand', role = 'crew', y = S.rooms[rm].y0) => { const cap = S.cap[rm]; if (cap) { if (cap.crew <= 0) return; cap.crew--; } S.crew.push({ room: rm, x: r2(x), y: r2(y + (pose === 'sit' ? 0.45 : 0)), z: r2(z), f: r2(f), pose, role }); };
  // someone on a round: walks from point to point (straight lines: keep them clear of what stands there), stopping at each
  const round = (rm, pts, role = 'crew', wait = 14) => S.crew.push({ room: rm, pts: pts.map(([x, z, y]) => [r2(x), r2(y ?? S.rooms[rm].y0), r2(z)]), wait, role });
  const sign = (text, x, y, z, face, size = 0.9, col = 'navwhite') => S.signs.push({ text, x: r2(x), y: r2(y), z: r2(z), face, size, col });
  const seat = (rm, x, z, face, role = 'officer') => { const dx = [0, 1, 0, -1][face], dz = [-1, 0, 1, 0][face]; if (put('chair', rm, x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.9, face, { y: yAt(rm, x, z) })) post(rm, x, z, Math.atan2(dx, dz), 'sit', role, yAt(rm, x, z)); };
  // a console with whoever works it sitting at it: face is the way the operator looks
  const station = (rm, x, z, face, role = 'officer', w = 2.4, manned = true, kind = 'console') => { const dx = [0, 1, 0, -1][face], dz = [-1, 0, 1, 0][face], along = dz !== 0, hw = w / 2, y = yAt(rm, x, z);
    const ok = along ? put(kind, rm, x - hw, z + dz * 0.75 - 0.38, x + hw, z + dz * 0.75 + 0.38, 1.05, (face + 2) % 4, { y }) : put(kind, rm, x + dx * 0.75 - 0.38, z - hw, x + dx * 0.75 + 0.38, z + hw, 1.05, (face + 2) % 4, { y });
    if (ok && manned) seat(rm, x - dx * 0.25, z - dz * 0.25, face, role); return ok; };
  const tiers = [];      // raised and sunk parts of a floor: [room, rect, dy]
  const tier = (rm, rect, dy) => { tiers.push([rm, rect, dy]); slab(S.rooms[rm].y0 + dy, rect); };
  const yAt = (rm, x, z) => { let y = S.rooms[rm].y0, a = 1e12; for (const [r, q, dy] of tiers) if (r === rm && x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3] && (q[2] - q[0]) * (q[3] - q[1]) < a) { a = (q[2] - q[0]) * (q[3] - q[1]); y = S.rooms[rm].y0 + dy; } return y; };
  Object.assign(S, { room, door, wall, rail, slab, stair, put, lamp, lampGrid, post, round, sign, seat, station, tier, yAt, theme });

  // ---- the hangar: the whole width of the block, its mouth nearly so
  const BAY = room('hold', theme.bay, [2, 1, W - 2, zb], deck, HH, { open: ['z1'] });
  door(BAY, 'outside', xc, 1, MW, MH, 'x', 'ramp');
  slab(deck, [2, 1, W - 2, zb]); slab(HH + 0.2, [2, 1, W - 2, zb], true);
  { const px = Math.max(1, Math.round((W - 4) / 26)), pz = Math.max(1, Math.round(HD / 24)); for (let i = 0; i < px; i++) for (let j = 0; j < pz; j++) lamp(BAY, 2 + (W - 4) * (i + 0.5) / px, HH - 1.2, 1 + HD * (j + 0.5) / pz, HH * 1.15, theme.bayLamp || theme.lamp, theme.bayI || 1); }
  body(S, BAY);
  // ---- walls: every side of every space (but the sides left open), open where a door is in it
  for (const R of S.rooms) { const [x0, z0, x1, z1] = R.rect, lo = R.y0 <= deck ? 0 : R.y0, open = R.open || [];
    for (const [side, a, b, c, d] of [['z0', x0, z0, x1, z0], ['z1', x0, z1, x1, z1], ['x0', x0, z0, x0, z1], ['x1', x1, z0, x1, z1]]) { if (open.includes(side)) continue; const along = b === d;
      const ds = S.doors.filter(q => q.rooms.includes(R.i) && (along ? q.axis === 'x' && Math.abs(q.z - b) < 0.01 && q.x > a && q.x < c : q.axis === 'z' && Math.abs(q.x - a) < 0.01 && q.z > b && q.z < d)).map(q => q.id);
      S.walls.push({ x0: a, z0: b, x1: c, z1: d, y0: lo, y1: R.y1, room: R.i, doors: ds, ...(R.glass?.includes(side) ? { glass: true } : {}) }); } }
  for (const w of S.walls) if (w.doorsAt) { w.doors = S.doors.filter(q => w.doorsAt.includes(q.id)).map(q => q.id); delete w.doorsAt; }
  const mouth = S.doors[0];
  return { name: name[0].toUpperCase() + name.slice(1), cls: 'decks', custom: true, note: 'Generated by tools/gen-capital.mjs.', W, D, H: HH + 1, deck, ceiling: HH, hull: [2, 1, W - 2, D - 1], hangar: { depth: HD, height: HH, mouthW: MW, mouthH: MH },
    ramp: { x0: r2(xc - MW / 2 + 0.1), x1: r2(xc + MW / 2 - 0.1), z0: 0.8, z1: 1 }, doors: S.doors, rooms: S.rooms, walls: S.walls, slabs: S.slabs, ramps: S.ramps, props: S.props, lights: S.lights, berths: S.berths, crew: S.crew, gates: S.gates, signs: S.signs, theme, seats: [], partitions: [],
    flight: { top: 0, boost: 0, thrust: 0, yaw: 0, lift: 0 }, style: 'decks', decks: true, price: 0, sellers: [] };
}

// ---- what stands in a hangar: craft in rows either side of the clear lane, nose to the mouth, each with its stand's gear and its crew
const SIZE = { fighter: [15, 20], small: [14, 24], big: [17, 32] }, JERSEY = ['director', 'fitter', 'fueller', 'armourer', 'handler'];
function berths(S, BAY, o) {
  const { W, HD, xc } = S, lane = o.lane ?? 46, [bw, bd] = SIZE[o.size || 'small'], zs = [], z0 = o.z0 ?? 12, zEnd = 1 + HD - (o.back ?? 14);
  for (let z = z0 + bd / 2; z + bd / 2 <= zEnd; z += bd + (o.gapZ ?? 6)) zs.push(z);
  let n = 0;
  for (const s of [-1, 1]) { const cols = []; let m = 0; for (let x = lane / 2 + bw / 2 + 2; x + bw / 2 <= W / 2 - (o.edge ?? 9); x += bw + (o.gapX ?? 5)) cols.push(x);
    cols.forEach((off, ci) => zs.forEach((z, zi) => { if (o.max && m >= o.max / 2) return; if (o.skip?.(s, ci, zi)) return; const x = xc + s * off, model = o.craft[(n * 7 + ci + zi * 3) % o.craft.length]; n++; m++;
      S.berths.push({ x: r2(x), z: r2(z), f: 3.1416, model, colour: (n * 5 + ci) % 7 });
      // the stand: its box on the deck (paint: fleet_kit.py), a tool cart and a set of steps or a bowser or a trolley beside it, two of its crew
      const k = (ci * 3 + zi * 5 + (s > 0 ? 1 : 0)) % 4, gx = x + s * (bw / 2 + 0.6), g = o.gear || ['cart', 'bowser', 'steps', 'trolley'];
      const kind = g[k % g.length], dims = { cart: [1.3, 2.2, 1.1], bowser: [2.2, 5.0, 2.0], steps: [1.4, 3.2, 2.4], trolley: [1.6, 3.6, 1.2], tug: [1.8, 3.0, 1.5], loader: [2.6, 4.2, 2.6], pallet: [2.5, 3.7, 1.6], tankstand: [2.4, 5.2, 3.2] }[kind];
      S.put(kind, BAY, gx - dims[0] / 2, z - 4 - dims[1] / 2, gx + dims[0] / 2, z - 4 + dims[1] / 2, dims[2], s > 0 ? 3 : 1);
      S.post(BAY, x - s * (bw / 2 - 1.2), z - bd / 2 - 1.6, s > 0 ? 0.5 : -0.5, 'stand', JERSEY[(n + 1) % 5]);
      if ((n & 1) === 0) S.post(BAY, gx - s * 1.6, z - 4, s * Math.PI / 2, 'stand', JERSEY[(n + 3) % 5]);
    }));
    // a round down the row's foot and back along the lane's edge
    if (cols.length && zs.length) { const xa = xc + s * (lane / 2 + 0.5), xb = xc + s * (cols[cols.length - 1] + bw / 2 + 2.5), za = zs[0] - bd / 2 - 3.2, zl = zs[zs.length - 1] + bd / 2 + 3;
      S.round(BAY, [[xa, za], [xb, za], [xb, zl], [xa, zl]], 'handler', 10); if (zs.length > 1) S.round(BAY, [[xb, (zs[0] + zs[1]) / 2], [xa, (zs[0] + zs[1]) / 2]], 'fitter', 22); }
  }
  // the director who brings craft in, at the head of the lane; the deck officer's desk by the inner door
  S.post(BAY, xc + 9, 1 + HD * 0.5 + 16, Math.PI, 'stand', 'director'); S.post(BAY, xc - 9, 1 + HD - 6, Math.PI, 'stand', 'director');
}

// ---- how a space is fitted out for what's done in it. (x0, z0)-(x1, z1) is its floor; things keep clear of its doors.
function fit(S, rm, kind, o = {}) {
  S.cap[rm] = { props: 64, crew: 8 };
  const [x0, z0, x1, z1] = S.rooms[rm].rect, w = x1 - x0, d = z1 - z0, P = (k, a, b, c, e, h, f = 0) => S.put(k, rm, a, b, c, e, h, f);
  const alongWalls = (list, gap = 0.3) => { let n = 0; for (const [xa, f, dep] of [[x0 + 0.12, 1, 1], [x1 - 0.12, 3, -1]]) { let z = z0 + 0.8; while (z < z1 - 1) { const [k, len, depth, h] = list[n++ % list.length]; if (z + len > z1 - 0.6) break; const a = dep > 0 ? xa : xa - depth; P(k, a, z, a + depth, z + len, h, f); z += len + gap; } } };
  if (kind === 'ready') {      // pilots' ready room: rows of seats before a briefing wall, lockers down the sides
    for (let z = z0 + 5; z + 1 < z1 - 1.5; z += 2.1) for (let x = x0 + 3; x + 2.4 < x1 - 3; x += 3) { if (P('bench', x, z, x + 2.4, z + 0.5, 0.45, 0) && ((x * 7 + z * 3) | 0) % 3 === 0) S.post(rm, x + 0.7, z + 0.25, Math.PI, 'sit', 'pilot'); }
    P('console', (x0 + x1) / 2 - 3, z0 + 0.9, (x0 + x1) / 2 - 0.6, z0 + 1.65, 1.05, 2); P('console', (x0 + x1) / 2 + 0.6, z0 + 0.9, (x0 + x1) / 2 + 3, z0 + 1.65, 1.05, 2); S.post(rm, (x0 + x1) / 2, z0 + 2.6, 0, 'stand', 'officer');
    alongWalls([['locker', 0.9, 0.55, 2]], 0.12);
  } else if (kind === 'bunks') {
    for (let z = z0 + 0.8; z + 1.6 < z1 - 0.6; z += 2.5) { P('bed', x0 + 0.2, z, x0 + 2.3, z + 1.5, 2.0, 1); P('bed', x1 - 2.3, z, x1 - 0.2, z + 1.5, 2.0, 3); if (w > 14) { P('bed', x0 + 5.2, z, x0 + 7.3, z + 1.5, 2.0, 1); P('bed', x1 - 7.3, z, x1 - 5.2, z + 1.5, 2.0, 3); } P('locker', x0 + 2.6, z, x0 + 3.5, z + 0.55, 2, 2); P('locker', x1 - 3.5, z, x1 - 2.6, z + 0.55, 2, 2); }
  } else if (kind === 'mess') {
    for (let z = z0 + 2.2; z + 2 < z1 - 3.4; z += 4.2) for (let x = x0 + 2.2; x + 3 < x1 - 2.2; x += 5) { if (P('table', x, z, x + 3, z + 1.2, 0.75, 0)) { P('bench', x + 0.3, z - 0.62, x + 2.7, z - 0.12, 0.45, 2); P('bench', x + 0.3, z + 1.32, x + 2.7, z + 1.82, 0.45, 0); if (((x + z * 2) | 0) % 2 === 0) S.post(rm, x + 0.9, z - 0.37, 0, 'sit', 'crew'); if (((x * 3 + z) | 0) % 3 === 0) S.post(rm, x + 2.1, z + 1.57, Math.PI, 'sit', 'crew'); } }
    for (let x = x0 + 1.5; x + 2.6 < x1 - 1.5; x += 3.4) P(((x | 0) % 3) ? 'counter' : 'fridge', x, z1 - 0.85, x + (((x | 0) % 3) ? 2.6 : 0.8), z1 - 0.15, ((x | 0) % 3) ? 0.92 : 1.9, 0);
    S.post(rm, (x0 + x1) / 2 + 1.2, z1 - 1.5, 0, 'stand', 'steward');
  } else if (kind === 'workshop') {
    for (let z = z0 + 2.4; z + 1.4 < z1 - 2; z += 4.4) for (let x = x0 + 3.4; x + 1.8 < x1 - 3.4; x += 5.2) { if (P('machine', x, z, x + 1.8, z + 1.4, 1.7, 0) && ((x + z) | 0) % 2 === 0) S.post(rm, x + 0.9, z - 0.7, 0, 'stand', 'fitter'); }
    alongWalls([['bench', 2.4, 1.0, 0.95], ['rack', 2.4, 0.8, 2.2]]);
  } else if (kind === 'store') {
    for (let z = z0 + 2; z + 0.8 < z1 - 1.6; z += 2.8) for (let x = x0 + 2.6; x + 2.4 < x1 - 2.6; x += 3.6) P(((x * 5 + z * 3) | 0) % 5 === 0 ? 'crate' : 'rack', x, z, x + 2.4, z + (((x * 5 + z * 3) | 0) % 5 === 0 ? 2.4 : 0.8), 2.2, 0);
    alongWalls([['locker', 0.9, 0.55, 2]], 0.12); S.post(rm, (x0 + x1) / 2, z0 + 1.2, 0.4, 'stand', 'armourer');
  } else if (kind === 'lounge') {
    for (let z = z0 + 2.4; z + 3 < z1 - 1.6; z += 5.2) for (let x = x0 + 3.4; x + 2 < x1 - 3.4; x += 6.4) { if (P('sofa', x - 1, z, x + 1, z + 0.9, 0.8, 2)) { P('table', x - 0.6, z + 1.3, x + 0.6, z + 2.1, 0.45, 0); P('armchair', x - 2.1, z + 1.2, x - 1.25, z + 2.05, 0.95, 1); P('armchair', x + 1.25, z + 1.2, x + 2.1, z + 2.05, 0.95, 3); P('planter', x + 2.3, z - 0.2, x + 3.1, z + 0.6, 1.1, 0); if (((x + z) | 0) % 2 === 0) S.post(rm, x - 0.4, z + 0.5, 0, 'sit', 'guest'); } }
    S.round(rm, [[x0 + 1.4, z0 + 1.4], [x1 - 1.4, z0 + 1.4], [x1 - 1.4, z1 - 1.2], [x0 + 1.4, z1 - 1.2]], 'steward', 20);
  } else if (kind === 'control') {      // flight control: a line of stations at the glass, a status wall behind
    for (let x = x0 + 2.2; x + 2.6 < x1 - 1.6; x += 3.6) S.station(rm, x + 1.2, z0 + 1.9, 0, 'controller', 2.4, ((x | 0) % 3) !== 1);
    for (let x = x0 + 2.2; x + 2.6 < x1 - 1.6; x += 5.4) P('bank', x, z1 - 0.5, x + 4.2, z1 - 0.12, 3.2, 0);
    P('plot', (x0 + x1) / 2 - 1.6, (z0 + z1) / 2 + 0.6, (x0 + x1) / 2 + 1.6, (z0 + z1) / 2 + 2.6, 0.95, 0); S.post(rm, (x0 + x1) / 2, (z0 + z1) / 2 - 0.1, 0, 'stand', 'officer');
    S.round(rm, [[x0 + 1.6, z0 + 4.2], [x1 - 1.6, z0 + 4.2]], 'officer', 18);
  } else if (kind === 'briefing') {
    for (let z = z0 + 5.5; z + 1 < z1 - 1.2; z += 1.9) for (let x = x0 + 2.5; x + 2.4 < x1 - 2.5; x += 3) P('bench', x, z, x + 2.4, z + 0.5, 0.45, 0);
    P('plot', (x0 + x1) / 2 - 2, z0 + 1.6, (x0 + x1) / 2 + 2, z0 + 3.8, 0.95, 0); P('bank', (x0 + x1) / 2 - 3, z0 + 0.12, (x0 + x1) / 2 + 3, z0 + 0.5, 3.2, 2);
  } else if (kind === 'hall') {      // somewhere people wait: benches back to back in rows, planters, a desk
    for (let z = z0 + 3; z + 1.2 < z1 - 2; z += 4) for (let x = x0 + 3; x + 2.4 < x1 - 3; x += 4.6) { if (P('bench', x, z, x + 2.4, z + 0.5, 0.45, 0)) { P('bench', x, z + 0.6, x + 2.4, z + 1.1, 0.45, 2); if (((x * 3 + z) | 0) % 3 === 0) S.post(rm, x + 1.2, z + 0.25, Math.PI, 'sit', 'guest'); } }
    P('counter', (x0 + x1) / 2 - 2.6, z1 - 1.6, (x0 + x1) / 2 + 2.6, z1 - 0.9, 1.05, 0); S.post(rm, (x0 + x1) / 2, z1 - 0.5, Math.PI, 'stand', 'steward');
    for (const x of [x0 + 0.9, x1 - 0.9]) for (let z = z0 + 2; z < z1 - 1; z += 6) P('planter', x - 0.5, z, x + 0.5, z + 1, 1.1, 0);
  }
}

// ---- the decks behind the hangar, on two levels: below, a way in from the hangar with the working spaces off it; above (stairs up from the
// hangar floor at each end), a gallery along the hangar's back, a space each side, and the bridge between them behind glass
function inboard(S, BAY, o) {
  const { xc, zb, zE, HH, W } = S, IW = o.IW, bx0 = xc - IW / 2, bx1 = xc + IW / 2, way = o.way ?? 10, GD = o.gallery ?? 7, T = S.theme, low = 6.6, top2 = UP + (o.h2 ?? 4.6);
  const BW = o.bridge.w, bh = UP + o.bridge.h, bz0 = o.bridge.atEdge ? zb : zb + GD, zm = (zb + zE) / 2;
  // below
  const WAY = S.room('corridor', o.wayLabel || 'main way', [xc - way / 2, zb, xc + way / 2, zE], deck, low); S.slab(deck, [bx0, zb, bx1, zE]);
  S.door(BAY, WAY, xc, zb, Math.min(8, way - 2), 4.6, 'x', 'open');
  const L1 = []; for (const [s, list] of [[-1, o.L1.L], [1, o.L1.R]]) list.forEach(([purpose, label, kind], k) => { const a = s < 0 ? bx0 : xc + way / 2, b = s < 0 ? xc - way / 2 : bx1, za = k === 0 ? zb : zm, zc = list.length === 1 ? zE : k === 0 ? zm : zE;
    const rm = S.room(purpose, label, [a, za, b, zc], deck, low); S.door(WAY, rm, s < 0 ? xc - way / 2 : xc + way / 2, (za + zc) / 2, 3, 2.6, 'z'); L1.push([rm, kind]); S.lampGrid(rm, 9, 7.5, T.lamp, 0.9, 0.4);
    S.sign(label.toUpperCase(), s < 0 ? xc - way / 2 + 0.12 : xc + way / 2 - 0.12, deck + 3.3, (za + zc) / 2, s < 0 ? 1 : 3, 0.34); });
  for (let z = zb + 5; z < zE; z += 9) S.lamp(WAY, xc, low - 0.4, z, 8, T.lamp, 0.9);
  // the hangar's back wall, this side of it: solid below the upper deck where the working spaces are, the gallery's open front above, plate above that
  S.wall(2, zb, bx0, zb, 0, HH, BAY); S.wall(bx1, zb, W - 2, zb, 0, HH, BAY); S.wall(bx0, zb, bx1, zb, 0, UP - 0.3, BAY, { doorsAt: [1] });
  if (top2 + 0.3 < HH) S.wall(bx0, zb, bx1, zb, top2 + 0.3, HH, BAY, { high: true });
  // above
  S.slab(UP, [bx0, zb, bx1, zE]);
  const sx = [[bx0 + 2, bx0 + 6.4], [bx1 - 6.4, bx1 - 2]], run = o.run ?? 12.5;
  for (const [a, b] of sx) S.stair(a, b, zb - run, zb, deck, UP);
  let GAL, BR;
  if (o.bridge.atEdge) {      // the bridge stands at the hangar's edge: a gallery each side of it
    const g0 = S.room('corridor', 'port gallery', [bx0, zb, xc - BW / 2, zb + GD], UP, top2, { open: ['z0', 'z1'] }), g1 = S.room('corridor', 'starboard gallery', [xc + BW / 2, zb, bx1, zb + GD], UP, top2, { open: ['z0', 'z1'] }); GAL = [g0, g1];
    BR = S.room('office', o.bridge.label, [xc - BW / 2, zb, xc + BW / 2, zE], UP, bh, { glass: ['z0'], bridge: o.bridge.style });
    S.door(g0, BR, xc - BW / 2, zb + GD / 2, 2.4, 2.6, 'z'); S.door(g1, BR, xc + BW / 2, zb + GD / 2, 2.4, 2.6, 'z');
    S.rail(sx[0][1], zb, xc - BW / 2, zb, UP); S.rail(xc + BW / 2, zb, sx[1][0], zb, UP); S.rail(bx0, zb, sx[0][0], zb, UP); S.rail(sx[1][1], zb, bx1, zb, UP);
  } else {
    const g = S.room('corridor', 'gallery', [bx0, zb, bx1, zb + GD], UP, top2, { open: ['z0', 'z1'] }); GAL = [g, g];
    BR = S.room('office', o.bridge.label, [xc - BW / 2, bz0, xc + BW / 2, zE], UP, bh, { glass: ['z0'], bridge: o.bridge.style });
    S.door(g, BR, xc, bz0, 3, 2.8, 'x', 'open');
    S.rail(bx0, zb, sx[0][0], zb, UP); S.rail(sx[0][1], zb, sx[1][0], zb, UP); S.rail(sx[1][1], zb, bx1, zb, UP);
  }
  for (let x = bx0 + 5; x < bx1; x += 10) if (!(o.bridge.atEdge && Math.abs(x - xc) < BW / 2)) S.lamp(GAL[0], x, top2 - 0.4, zb + GD / 2, 7, T.lamp, 0.8);
  S.sign(o.bridge.label.toUpperCase(), xc, UP + 3.5, bz0 - 0.14, 0, 0.5);
  const L2 = []; for (const [s, q] of [[-1, o.L2.L], [1, o.L2.R]]) { if (!q) continue; const [purpose, label, kind, glass] = q, a = s < 0 ? bx0 : xc + BW / 2, b = s < 0 ? xc - BW / 2 : bx1;
    const rm = S.room(purpose, label, [a, zb + GD, b, zE], UP, top2, glass ? { glass: ['z0'] } : {}), dId = S.door(GAL[s < 0 ? 0 : 1], rm, (a + b) / 2, zb + GD, 2.6, 2.6, 'x'); if (!glass) S.wall(a, zb + GD, b, zb + GD, UP, top2, GAL[s < 0 ? 0 : 1], { doorsAt: [dId] }); L2.push([rm, kind]); S.lampGrid(rm, 9, 7.5, T.lamp, 0.9, 0.4); S.sign(label.toUpperCase(), (a + b) / 2, UP + 3.2, zb + GD - 0.14, 0, 0.34); }
  for (const R of S.rooms) if (R.y0 === UP) S.slab(R.y1 + 0.2, R.rect, true);
  for (const [rm, kind] of L1.concat(L2)) fit(S, rm, kind);
  // people on the gallery, looking down into the hangar; someone coming and going along the way below
  for (const x of [bx0 + 12, xc - 6, xc + 9, bx1 - 14]) if (!(o.bridge.atEdge && Math.abs(x - xc) < BW / 2 + 1)) S.post(GAL[x < xc ? 0 : 1], x, zb + 0.7, Math.PI, 'stand', 'crew');
  S.round(WAY, [[xc - 1.5, zb + 3], [xc - 1.5, zE - 3], [xc + 1.5, zE - 3], [xc + 1.5, zb + 3]], 'crew', 6);
  S.sign(S.theme.bay.toUpperCase(), xc, deck + 5.6, zb + 0.14, 2, 0.5);
  return { WAY, BR, GAL, bx0, bx1 };
}

// ---- the bridges: each ship's is its own
const BRIDGE = {
  // the carrier's: an amphitheatre stepping down to the glass, rows of stations on each step, the air boss on the top one behind them all
  bastion(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2;
    S.tier(B, [x0, z0, x1, z0 + 9], -0.45); S.tier(B, [x0, z1 - 10, x1, z1], 0.45);
    for (let x = x0 + 3; x < x1 - 3; x += 3.4) S.station(B, x, z0 + 3.4, 0, 'controller', 2.4, ((x | 0) % 4) !== 2);
    for (let x = x0 + 4.6; x < x1 - 4.6; x += 3.4) S.station(B, x, z0 + 7, 0, 'officer', 2.4, ((x | 0) % 3) !== 1);
    S.put('plot', B, xc - 2.6, z0 + 12, xc + 2.6, z0 + 15.4, 0.95, 0); for (const [dx, f] of [[-3.4, Math.PI / 2], [3.4, -Math.PI / 2]]) S.post(B, xc + dx, z0 + 13.7, f, 'stand', 'officer');
    for (const s of [-1, 1]) for (let z = z0 + 11; z < z1 - 12; z += 3.4) S.station(B, xc + s * ((x1 - x0) / 2 - 2.2), z, s > 0 ? 1 : 3, 'officer', 2.4, true);
    S.put('throne', B, xc - 0.6, z1 - 7.6, xc + 0.6, z1 - 6.4, 1.3, 0, { y: S.rooms[B].y0 + 0.45 }); S.post(B, xc, z1 - 7, Math.PI, 'sit', 'captain', S.rooms[B].y0 + 0.45);
    for (const s of [-1, 1]) S.station(B, xc + s * 4.4, z1 - 6.6, 0, 'officer', 2.4, true);
    S.put('bank', B, xc - 7, z1 - 0.5, xc + 7, z1 - 0.12, 3.4, 0, { y: S.rooms[B].y0 + 0.45 }); S.rail(x0 + 1, z1 - 10, xc - 2, z1 - 10, S.rooms[B].y0 + 0.45); S.rail(xc + 2, z1 - 10, x1 - 1, z1 - 10, S.rooms[B].y0 + 0.45);
    S.round(B, [[xc - 6, z0 + 10], [xc + 6, z0 + 10]], 'officer', 16); S.lampGrid(B, 9, 8, 'cool', 0.9, 0.5); },
  // the liner's: a wheelhouse the width of the glass with the wheel in the middle of it, brass and timber; the chart room behind a screen
  halcyon(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2, y = S.rooms[B].y0;
    S.put('helm', B, xc - 0.9, z0 + 2.4, xc + 0.9, z0 + 3.6, 1.5, 2); S.post(B, xc, z0 + 4.3, Math.PI, 'stand', 'officer');
    for (const s of [-1, 1]) { S.put('telegraph', B, xc + s * 2.6 - 0.35, z0 + 2.6, xc + s * 2.6 + 0.35, z0 + 3.3, 1.35, 2); for (let x = 6; x < (x1 - x0) / 2 - 2; x += 3.6) S.station(B, xc + s * x, z0 + 2.1, 0, 'officer', 2.6, (x | 0) % 2 === 0); }
    for (const s of [-1, 1]) { S.put('throne', B, xc + s * 3.4 - 0.6, z0 + 7, xc + s * 3.4 + 0.6, z0 + 8.2, 1.3, 0); if (s < 0) S.post(B, xc + s * 3.4, z0 + 7.6, Math.PI, 'sit', 'captain'); }
    const zs = z0 + 12; S.wall(x0, zs, xc - 2.4, zs, y, y + 2.4, B, { screen: true }); S.wall(xc + 2.4, zs, x1, zs, y, y + 2.4, B, { screen: true });
    S.put('table', B, xc - 2.4, zs + 3, xc + 2.4, zs + 5.4, 0.95, 0); for (const [dx, f] of [[-3.2, Math.PI / 2], [0, Math.PI]]) S.post(B, xc + dx, dx ? zs + 4.2 : zs + 6.2, f, 'stand', 'officer');
    for (const s of [-1, 1]) for (let z = zs + 1.2; z + 1 < z1 - 1; z += 1.5) S.put('cabinet', B, s < 0 ? x0 + 0.12 : x1 - 0.62, z, s < 0 ? x0 + 0.62 : x1 - 0.12, z + 1, 1.4, s < 0 ? 1 : 3);
    for (let x = x0 + 3; x + 2 < x1 - 3; x += 6) if (Math.abs(x + 1 - xc) > 4) { S.put('sofa', B, x, z1 - 1.2, x + 2, z1 - 0.3, 0.8, 0); }
    S.round(B, [[x0 + 3, z0 + 5.6], [x1 - 3, z0 + 5.6]], 'officer', 20); S.lampGrid(B, 8, 7.5, 'gold', 1.0, 0.4); },
  // the habitat's: the three rings turning in miniature in the middle of a round floor, the people who keep them at desks about it
  meridian(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    S.tier(B, [xc - 5, zc - 5, xc + 5, zc + 5], 0.4); S.put('orrery', B, xc - 2.6, zc - 2.6, xc + 2.6, zc + 2.6, 4.2, 0, { y: S.rooms[B].y0 + 0.4 });
    for (const [dx, dz, f] of [[0, -8.6, 2], [0, 8.6, 0], [-8.6, 0, 1], [8.6, 0, 3], [-6.4, -6.4, 2], [6.4, -6.4, 2], [-6.4, 6.4, 0], [6.4, 6.4, 0]]) S.station(B, xc + dx, zc + dz, f, 'keeper', 2.4, (dx + dz) % 5 !== 0 || dx === 0);
    for (const s of [-1, 1]) { for (let z = z0 + 2; z < z1 - 2; z += 7) S.put('planter', B, s < 0 ? x0 + 0.5 : x1 - 1.5, z, s < 0 ? x0 + 1.5 : x1 - 0.5, z + 1, 1.1, 0); }
    S.put('bank', B, xc - 6, z1 - 0.5, xc + 6, z1 - 0.12, 3.2, 0); { const yd = S.rooms[B].y0 + 0.4; S.round(B, [[xc - 3.9, zc - 3.9, yd], [xc + 3.9, zc - 3.9, yd], [xc + 3.9, zc + 3.9, yd], [xc - 3.9, zc + 3.9, yd]], 'keeper', 24); }
    S.post(B, xc - 3.4, zc - 5.6, 0.5, 'stand', 'keeper'); S.lampGrid(B, 8, 8, 'warm', 1.1, 0.4); },
  // the tanker's: a working wheelhouse, the cargo boards down both walls with their valve wheels, one seat at the glass, the kettle in the corner
  longshore(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2;
    for (const [dx, on] of [[-7.6, true], [-4.4, false], [4.4, true], [7.6, true]]) S.station(B, xc + dx, z0 + 2, 0, 'officer', 2.6, on);
    for (const s of [-1, 1]) for (let z = z0 + 5; z + 3.6 < z1 - 4; z += 4.4) { S.put('mimic', B, s < 0 ? x0 + 0.12 : x1 - 0.6, z, s < 0 ? x0 + 0.6 : x1 - 0.12, z + 3.6, 2.6, s < 0 ? 1 : 3); if ((z < z0 + 6) === (s < 0)) S.post(B, s < 0 ? x0 + 1.5 : x1 - 1.5, z + 1.8, s < 0 ? -Math.PI / 2 : Math.PI / 2, 'stand', 'fueller'); }
    S.put('table', B, xc - 1.5, z1 - 5.4, xc + 1.5, z1 - 4.2, 0.75, 0); S.put('bench', B, xc - 1.2, z1 - 6.1, xc + 1.2, z1 - 5.6, 0.45, 2); S.put('bench', B, xc - 1.2, z1 - 4, xc + 1.2, z1 - 3.5, 0.45, 0); S.post(B, xc - 0.5, z1 - 5.85, 0, 'sit', 'crew');
    S.put('counter', B, x0 + 0.8, z1 - 0.85, x0 + 3.4, z1 - 0.15, 0.92, 0); S.put('fridge', B, x0 + 3.6, z1 - 0.85, x0 + 4.4, z1 - 0.15, 1.9, 0); S.put('locker', B, x1 - 2, z1 - 0.7, x1 - 1.1, z1 - 0.15, 2, 0);
    S.put('plot', B, xc - 1.4, z0 + 6.4, xc + 1.4, z0 + 8.4, 0.95, 0); S.post(B, xc, z0 + 9.1, Math.PI, 'stand', 'officer'); S.post(B, xc + 2.1, z0 + 7.4, -Math.PI / 2, 'stand', 'fueller'); S.lampGrid(B, 7, 6.5, 'amber', 1.0, 0.35); },
  // the warship's: a pit two steps deep with the plot standing in it, stations round its rim looking in, the flag's walk behind and above; no glass but a slit
  anvil(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2 - 2, y = S.rooms[B].y0;
    S.tier(B, [xc - 13, zc - 10, xc + 13, zc + 10], -0.45); S.tier(B, [xc - 8, zc - 6, xc + 8, zc + 6], -0.9); S.tier(B, [x0, z1 - 8, x1, z1], 0.45);
    S.put('plot', B, xc - 3.6, zc - 2.4, xc + 3.6, zc + 2.4, 0.95, 0, { y: y - 0.9 }); S.put('holo', B, xc - 1.6, zc - 1.6, xc + 1.6, zc + 1.6, 3.4, 0, { y: y + 0.05, over: true });
    for (const [dx, dz, f] of [[-4.8, 0, Math.PI / 2], [4.8, 0, -Math.PI / 2], [0, -3.6, 0], [-2.4, 3.6, Math.PI], [2.4, 3.6, Math.PI]]) S.post(B, xc + dx, zc + dz, f, 'stand', 'officer', y - 0.9);
    for (let x = xc - 10.5; x <= xc + 10.6; x += 3.5) { S.station(B, x, zc - 8.2, 2, 'officer', 2.4, ((x | 0) % 3) !== 0); S.station(B, x, zc + 8.2, 0, 'officer', 2.4, ((x | 0) % 4) !== 1); }
    for (const s of [-1, 1]) for (let z = zc - 5.2; z <= zc + 5.3; z += 3.5) S.station(B, xc + s * 11.2, z, s > 0 ? 3 : 1, 'officer', 2.4, true);
    for (const s of [-1, 1]) for (let z = z0 + 3; z < z1 - 10; z += 3.6) S.station(B, s < 0 ? x0 + 1.6 : x1 - 1.6, z, s < 0 ? 3 : 1, 'controller', 2.4, ((z | 0) % 2) === 0);
    S.put('throne', B, xc - 0.7, z1 - 6, xc + 0.7, z1 - 4.6, 1.4, 0, { y: y + 0.45 }); S.post(B, xc, z1 - 5.3, Math.PI, 'sit', 'captain', y + 0.45);
    S.rail(x0 + 1, z1 - 8, xc - 2.5, z1 - 8, y + 0.45); S.rail(xc + 2.5, z1 - 8, x1 - 1, z1 - 8, y + 0.45); S.put('bank', B, xc - 9, z1 - 0.5, xc + 9, z1 - 0.12, 3.6, 0, { y: y + 0.45 });
    S.round(B, [[xc - 12, z1 - 9.2], [xc + 12, z1 - 9.2]], 'officer', 14); S.round(B, [[xc - 12, zc - 11.6], [xc + 12, zc - 11.6]], 'officer', 20); S.lampGrid(B, 10, 8.5, 'red', 0.85, 0.5); },
  // the city's: harbour control under a glass roof, the city itself in model in the middle, controllers in rings about it
  vesper(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, y = S.rooms[B].y0;
    S.tier(B, [xc - 7, zc - 7, xc + 7, zc + 7], 0.45); S.put('citymodel', B, xc - 4, zc - 5.5, xc + 4, zc + 5.5, 2.2, 0, { y: y + 0.45 });
    for (const [dx, f] of [[-5.4, Math.PI / 2], [5.4, -Math.PI / 2]]) S.post(B, xc + dx, zc, f, 'stand', 'controller', y + 0.45);
    for (let x = xc - 12; x <= xc + 12.1; x += 4) { S.station(B, x, zc - 10.4, 2, 'controller', 2.6, ((x | 0) % 3) !== 0); S.station(B, x, zc + 10.4, 0, 'controller', 2.6, ((x | 0) % 3) !== 1); }
    for (const s of [-1, 1]) for (let z = zc - 6; z <= zc + 6.1; z += 4) S.station(B, xc + s * 12.4, z, s > 0 ? 3 : 1, 'controller', 2.6, true);
    for (let x = x0 + 3; x < x1 - 3; x += 3.6) S.station(B, x, z0 + 2, 0, 'controller', 2.4, ((x | 0) % 2) === 0);
    for (const s of [-1, 1]) for (const z of [z0 + 6, z1 - 3]) S.put('planter', B, xc + s * ((x1 - x0) / 2 - 1.4) - 0.5, z - 0.5, xc + s * ((x1 - x0) / 2 - 1.4) + 0.5, z + 0.5, 1.1, 0);
    S.round(B, [[xc - 9.4, zc - 8.6], [xc + 9.4, zc - 8.6], [xc + 9.4, zc + 8.6], [xc - 9.4, zc + 8.6]], 'officer', 18); S.lampGrid(B, 9, 9, 'day', 1.1, 0.5); S.rooms[B].sky = true; },
  // the ore carrier's: the tow master's cab hung at the bay's edge, lever desks along the glass, the winch boards behind
  tiller(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2;
    for (let x = x0 + 2.4; x < x1 - 2.4; x += 3.2) { const ok = S.put('levers', B, x - 1.2, z0 + 1.0, x + 1.2, z0 + 1.9, 1.15, 2); if (ok && ((x | 0) % 3) !== 1) S.post(B, x, z0 + 2.6, Math.PI, 'stand', 'handler'); }
    for (const s of [-1, 1]) for (let z = z0 + 6; z + 3.6 < z1 - 2; z += 4.6) S.put('mimic', B, s < 0 ? x0 + 0.12 : x1 - 0.6, z, s < 0 ? x0 + 0.6 : x1 - 0.12, z + 3.6, 2.6, s < 0 ? 1 : 3);
    S.put('plot', B, xc - 2, z0 + 7, xc + 2, z0 + 9.6, 0.95, 0); S.post(B, xc, z0 + 10.4, Math.PI, 'stand', 'officer'); S.post(B, xc - 2.8, z0 + 8.3, Math.PI / 2, 'stand', 'handler');
    S.station(B, xc - 5, z1 - 4, 0, 'officer', 2.4, true); S.station(B, xc + 5, z1 - 4, 0, 'officer', 2.4, false);
    for (let x = x0 + 2; x + 2.4 < x1 - 2; x += 5.5) S.put('machine', B, x, z1 - 1.7, x + 1.8, z1 - 0.3, 1.7, 0);
    S.round(B, [[x0 + 2, z0 + 4.6], [x1 - 2, z0 + 4.6]], 'officer', 12); S.lampGrid(B, 8, 7.5, 'amber', 1.0, 0.4); },
  // the bomber's: long and dark and narrow, a walk down the middle between stations that face the walls, the bomb aimer's pit at the glass
  sable(S, B) { const [x0, z0, x1, z1] = S.rooms[B].rect, xc = (x0 + x1) / 2, y = S.rooms[B].y0;
    S.tier(B, [xc - 4, z0, xc + 4, z0 + 6], -0.45); S.station(B, xc - 1.8, z0 + 2, 0, 'officer', 2.4, true); S.station(B, xc + 1.8, z0 + 2, 0, 'officer', 2.4, true);
    for (const s of [-1, 1]) for (let z = z0 + 8.5; z < z1 - 9; z += 3.3) S.station(B, xc + s * ((x1 - x0) / 2 - 1.5), z, s > 0 ? 1 : 3, 'officer', 2.4, ((z | 0) % 4) !== 0);
    S.tier(B, [xc - 3, z1 - 8, xc + 3, z1 - 3], 0.45); S.put('throne', B, xc - 0.6, z1 - 6.2, xc + 0.6, z1 - 5, 1.3, 0, { y: y + 0.45 }); S.post(B, xc, z1 - 5.6, Math.PI, 'sit', 'captain', y + 0.45);
    S.put('plot', B, xc - 1.2, (z0 + z1) / 2 - 1.8, xc + 1.2, (z0 + z1) / 2 + 1.8, 0.95, 0); S.post(B, xc - 2, (z0 + z1) / 2, Math.PI / 2, 'stand', 'officer');
    S.put('bank', B, xc - 5, z1 - 0.5, xc + 5, z1 - 0.12, 3, 0); S.lampGrid(B, 8, 6, 'cyan', 0.8, 0.4); },
};

const T = (bay, lamp, more) => ({ bay, lamp, ...more });
const out = {};
out.bastion_decks = ship('bastion', 164, 72, 22, 140, 16, 46, T('hangar deck', 'cool', { look: 'navy', roof: 'vault', bayLamp: 'cool' }), (S, BAY) => {
  berths(S, BAY, { size: 'fighter', craft: ['interceptor', 'striker', 'needle', 'warden', 'interceptor'], lane: 44, gapX: 3, edge: 6, gear: ['trolley', 'cart', 'bowser', 'steps'] });
  const I = inboard(S, BAY, { IW: 120, L1: { L: [['bedroom', 'pilots\' ready room', 'ready'], ['storage', 'armoury', 'store']], R: [['shopfloor-workshop', 'engine shop', 'workshop'], ['kitchen', 'mess deck', 'mess']] },
    L2: { L: ['office', 'flight control', 'control', true], R: ['bedroom', 'briefing room', 'briefing'] }, bridge: { w: 44, h: 7, label: 'combat bridge', style: 'bastion' } });
  BRIDGE.bastion(S, I.BR);
});
out.halcyon_decks = ship('halcyon', 124, 76, 18, 100, 13, 44, T('tender bay', 'gold', { look: 'liner', roof: 'sleek', bayLamp: 'warm' }), (S, BAY) => {
  berths(S, BAY, { size: 'small', craft: ['yacht', 'courier', 'runabout1', 'racer0', 'yacht'], lane: 38, gapX: 4, edge: 6, z0: 10, gapZ: 4, gear: ['steps', 'cart', 'steps', 'bowser'] });
  const I = inboard(S, BAY, { IW: 116, wayLabel: 'grand way', way: 12, L1: { L: [['lobby', 'embarkation hall', 'hall']], R: [['living', 'saloon', 'lounge'], ['kitchen', 'dining room', 'mess']] },
    L2: { L: ['living', 'observation lounge', 'lounge', true], R: ['bedroom', 'staterooms', 'bunks'] }, bridge: { w: 40, h: 4.8, label: 'bridge', style: 'halcyon' } });
  BRIDGE.halcyon(S, I.BR);
});
out.longshore_decks = ship('longshore', 124, 64, 22, 100, 17, 30, T('lighter bay', 'amber', { look: 'works', roof: 'truss', bayLamp: 'warm' }), (S, BAY) => {
  berths(S, BAY, { size: 'small', craft: ['shuttle', 'shuttle', 'hauler0'], lane: 46, gear: ['tankstand', 'bowser', 'tankstand', 'cart'], max: 6, skip: (s, ci) => ci > 0 && s < 0 });
  // the tank farm down the port wall: the cargo, in its cradles, waiting for the pumps
  for (let z = 12; z + 5.2 < 50; z += 6.4) for (const x of [6, 9.4, 12.8]) S.put('tankstand', BAY, x, z, x + 2.4, z + 5.2, 3.2, 1);
  S.round(BAY, [[17.5, 11], [17.5, 50]], 'fueller', 12); S.post(BAY, 16.6, 30, -Math.PI / 2, 'stand', 'fueller');
  const I = inboard(S, BAY, { IW: 96, L1: { L: [['shopfloor-workshop', 'pump room', 'workshop']], R: [['kitchen', 'galley', 'mess'], ['bedroom', 'bunks', 'bunks']] },
    L2: { L: ['office', 'cargo office', 'control', true], R: ['storage', 'stores', 'store'] }, bridge: { w: 22, h: 3.8, label: 'wheelhouse', style: 'longshore' } });
  BRIDGE.longshore(S, I.BR);
});
out.anvil_decks = ship('anvil', 304, 120, 36, 260, 28, 60, T('flight deck', 'red', { look: 'navy', roof: 'vault', bayLamp: 'cool', bayI: 1.1 }), (S, BAY) => {
  berths(S, BAY, { size: 'small', craft: ['gunship0', 'dropship1', 'gunship2', 'striker', 'dropship0', 'warden', 'gunship1'], lane: 64, gear: ['trolley', 'bowser', 'cart', 'trolley'], gapX: 9, gapZ: 9, max: 16, skip: (s, ci, zi) => (ci + zi) % 2 === 1 && ci > 2 });
  const I = inboard(S, BAY, { IW: 130, way: 12, L1: { L: [['storage', 'ordnance magazine', 'store'], ['bedroom', 'marine barracks', 'bunks']], R: [['shopfloor-workshop', 'drone shop', 'workshop'], ['kitchen', 'wardroom', 'mess']] },
    L2: { L: ['office', 'air operations', 'control', true], R: ['bedroom', 'pilots\' ready room', 'ready'] }, bridge: { w: 48, h: 8, label: 'flag bridge', style: 'anvil', slit: true } });
  S.rooms[I.BR].slit = true; BRIDGE.anvil(S, I.BR);
});
out.vesper_decks = ship('vesper', 324, 130, 40, 280, 30, 60, T('skyport', 'day', { look: 'civic', roof: 'sky', bayLamp: 'day', bayI: 1.15 }), (S, BAY) => {
  berths(S, BAY, { size: 'big', craft: ['ferry0', 'explorer1', 'runabout0', 'hauler1', 'ferry2', 'racer2', 'yacht', 'explorer0'], lane: 70, gear: ['steps', 'cart', 'loader', 'bowser'], gapX: 9, gapZ: 10, max: 16, skip: (s, ci, zi) => (ci * 2 + zi) % 3 === 2 && ci > 1 });
  // gates along the lane: benches for whoever's waiting on a ferry
  for (const s of [-1, 1]) for (const z of [47, 50, 92, 98, 104]) { const x = S.xc + s * 40; S.put('bench', BAY, x - 0.25, z, x + 0.25, z + 2.4, 0.45, s > 0 ? 3 : 1); if (z % 2) S.post(BAY, x, z + 1.2, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'sit', 'guest'); if (z === 50 || z === 104) S.put('planter', BAY, x - 0.5, z + 3, x + 0.5, z + 4, 1.1, 0); }
  const I = inboard(S, BAY, { IW: 130, way: 14, wayLabel: 'concourse', L1: { L: [['lobby', 'arrivals', 'hall'], ['kitchen', 'food hall', 'mess']], R: [['living', 'transit lounge', 'lounge'], ['storage', 'freight office', 'store']] },
    L2: { L: ['office', 'approach control', 'control', true], R: ['living', 'sky lounge', 'lounge', true] }, bridge: { w: 40, h: 9, label: 'harbour control', style: 'vesper' } });
  BRIDGE.vesper(S, I.BR);
});
out.tiller_decks = ship('tiller', 244, 110, 40, 200, 32, 50, T('ore bay', 'amber', { look: 'works', roof: 'gantry', bayLamp: 'amber', bayI: 1.1 }), (S, BAY) => {
  berths(S, BAY, { size: 'big', craft: ['miner0', 'hauler0', 'miner2', 'hauler2', 'miner1'], lane: 60, gear: ['pallet', 'loader', 'pallet', 'tug'], gapX: 10, gapZ: 10, max: 12, skip: (s, ci) => s > 0 && ci > 1 });
  // the cargo: crates on their pallets, stacked in blocks down the starboard wall
  for (let z = 14; z + 3.7 < 96; z += 4.6) for (const x of [S.W - 9, S.W - 12.4, S.W - 15.8, S.W - 19.2]) { if (((z * 3 + x) | 0) % 7 === 0) continue; S.put('pallet', BAY, x, z, x + 2.5, z + 3.7, ((z + x) | 0) % 3 ? 3.2 : 1.6, 3); }
  S.round(BAY, [[S.W - 22, 12], [S.W - 22, 96]], 'handler', 12);
  const I = inboard(S, BAY, { IW: 120, L1: { L: [['shopfloor-workshop', 'smelter floor', 'workshop'], ['storage', 'parts store', 'store']], R: [['kitchen', 'canteen', 'mess'], ['bedroom', 'bunkhouse', 'bunks']] },
    L2: { L: ['office', 'assay office', 'control', true], R: ['bedroom', 'shift room', 'ready'] }, bridge: { w: 34, h: 5.4, label: 'tow control', style: 'tiller', atEdge: true } });
  BRIDGE.tiller(S, I.BR);
});
out.sable_decks = ship('sable', 164, 70, 20, 130, 14, 44, T('shadow bay', 'cyan', { look: 'black', roof: 'sleek', bayLamp: 'cyan', bayI: 0.9 }), (S, BAY) => {
  berths(S, BAY, { size: 'fighter', craft: ['shade', 'wraith0', 'manta1', 'wraith2', 'shade'], lane: 50, back: 12, gear: ['trolley', 'trolley', 'cart', 'bowser'] });
  const I = inboard(S, BAY, { IW: 110, L1: { L: [['storage', 'weapons locker', 'store']], R: [['bedroom', 'sleep pods', 'bunks'], ['kitchen', 'galley', 'mess']] },
    L2: { L: ['office', 'ops room', 'briefing'], R: ['office', 'signals', 'control', true] }, bridge: { w: 16, h: 4.2, label: 'command deck', style: 'sable' } });
  BRIDGE.sable(S, I.BR);
});
// ---- the Meridian: you come in at the arrivals bay and the way to the rings is straight ahead of you, through a portal the height of two
// decks: the terminal, where the three lifts stand at the far end, each in its glass shaft, each named for its ring. Stairs up either side
// to the terminal's balcony, and off that the ring control (its bridge) one side and the observation lounge the other.
out.meridian_decks = ship('meridian', 124, 76, 18, 100, 13, 50, T('arrivals bay', 'warm', { look: 'civic', roof: 'sleek', bayLamp: 'warm', bayI: 1.1 }), (S, BAY) => {
  const { xc, zb, zE, HH, W } = S, tx0 = xc - 22, tx1 = xc + 22, tz1 = zb + 42, TH = 16;
  berths(S, BAY, { size: 'small', craft: ['shuttle', 'ferry1', 'runabout2', 'ferry0'], lane: 38, gapX: 4, edge: 6, z0: 10, gapZ: 4, gear: ['steps', 'cart', 'loader', 'bowser'] });
  const TERM = S.room('lobby', 'ring terminal', [tx0, zb, tx1, tz1], deck, TH); S.slab(deck, [tx0, zb, tx1, tz1]); S.slab(TH + 0.2, [tx0, zb, tx1, tz1], true);
  S.door(BAY, TERM, xc, zb, 16, 6.4, 'x', 'open');
  S.wall(2, zb, tx0, zb, 0, UP - 0.3, BAY); S.wall(tx1, zb, W - 2, zb, 0, UP - 0.3, BAY); S.wall(tx0, zb, tx1, zb, 0, HH, BAY, { doorsAt: [1] });
  S.sign('RINGS', xc, deck + 8.4, zb - 0.16, 0, 1.6); S.sign('ARRIVALS BAY', xc, deck + 7.6, zb + 0.16, 2, 0.6);
  // the lifts: three cars at the far end, a glass shaft over each going up through the roof to the spine
  const names = ['COMMONS', 'ARBORETUM', 'FIELDS'];
  [-14, 0, 14].forEach((dx, i) => { const lx = xc + dx, L = S.room('lift', names[i].toLowerCase() + ' lift', [lx - 3.5, tz1, lx + 3.5, tz1 + 6], deck, 4.6); S.slab(deck, [lx - 3.5, tz1, lx + 3.5, tz1 + 6]); S.door(TERM, L, lx, tz1, 5, 3.6, 'x', 'open');
    S.gates.push({ x: r2(lx), y: deck, z: r2(tz1 + 3), ring: i, f: 3.1416 }); S.sign(names[i], lx, deck + 4.9, tz1 - 0.16, 0, 0.8); S.lamp(L, lx, 4.2, tz1 + 3, 5, 'warm', 1.2);
    S.put('liftshaft', TERM, lx - 3.5, tz1 - 0.6, lx + 3.5, tz1 - 0.1, TH - 5.4, 0, { y: deck + 4.6, over: true }); });
  // the balcony: down both sides and across over the lifts; a flight of stairs up to each side from just inside the portal
  for (const r of [[tx0, zb + 13, tx0 + 6, tz1], [tx1 - 6, zb + 13, tx1, tz1], [tx0 + 6, tz1 - 6, tx1 - 6, tz1]]) S.slab(UP, r);
  S.stair(tx0 + 0.6, tx0 + 5, zb + 0.6, zb + 13, deck, UP); S.stair(tx1 - 5, tx1 - 0.6, zb + 0.6, zb + 13, deck, UP);
  S.rail(tx0 + 6, zb + 13, tx0 + 6, tz1 - 6, UP); S.rail(tx1 - 6, zb + 13, tx1 - 6, tz1 - 6, UP); S.rail(tx0 + 6, tz1 - 6, tx1 - 6, tz1 - 6, UP); S.rail(tx0 + 5, zb + 13, tx0 + 6, zb + 13, UP); S.rail(tx1 - 6, zb + 13, tx1 - 5, zb + 13, UP);
  for (const s of [-1, 1]) for (let z = zb + 16; z < tz1 - 8; z += 8) S.put('pillar', TERM, xc + s * 16 - 0.3, z - 0.3, xc + s * 16 + 0.3, z + 0.3, UP - deck - 0.3, 0);
  // the floor of it: planters and benches either side of the way to the lifts, a desk where the way starts
  for (const s of [-1, 1]) for (let z = zb + 8; z < tz1 - 10; z += 7) { const x = xc + s * 9; S.put('planter', TERM, x - 0.6, z, x + 0.6, z + 1.2, 1.2, 0); S.put('bench', TERM, x - 1.2, z + 1.8, x + 1.2, z + 2.3, 0.45, s > 0 ? 3 : 1) && (((z | 0) % 2) === 0) && S.post(TERM, x, z + 2.05, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'sit', 'guest'); }
  S.put('counter', TERM, xc - 15, zb + 5, xc - 11, zb + 5.8, 1.05, 2); S.post(TERM, xc - 13, zb + 4.4, 0, 'stand', 'steward');
  S.round(TERM, [[xc - 3, zb + 3], [xc - 3, tz1 - 3], [xc + 3, tz1 - 3], [xc + 3, zb + 3]], 'guest', 8); S.round(TERM, [[xc + 5, tz1 - 2.5], [xc - 12, tz1 - 2.5]], 'guest', 12); S.round(TERM, [[tx0 + 3, zb + 16, UP], [tx0 + 3, tz1 - 3, UP], [tx1 - 3, tz1 - 3, UP], [tx1 - 3, zb + 16, UP]], 'keeper', 12);
  for (let z = zb + 6; z < tz1; z += 12) for (const dx of [-12, 0, 12]) S.lamp(TERM, xc + dx, TH - 1, z, 13, 'warm', 1.1);
  // off the terminal, below: where you wait and where your bags go; above, off the balcony: the ring control and the lounge, both looking out over the bay
  const below = [['lobby', 'arrivals lounge', 'hall', 2, tx0, 1], ['storage', 'baggage hall', 'store', tx1, W - 2, 3]], above = [['office', 'ring control', null, 2, tx0, 1], ['living', 'observation lounge', 'lounge', tx1, W - 2, 3]];
  for (const [purpose, label, kind, a, b, face] of below) { const rm = S.room(purpose, label, [a, zb, b, tz1], deck, 6.6); S.slab(deck, [a, zb, b, tz1]); S.door(TERM, rm, face === 1 ? tx0 : tx1, zb + 26, 4, 2.8, 'z'); S.lampGrid(rm, 9, 7.5, 'warm', 0.9, 0.4); S.sign(label.toUpperCase(), face === 1 ? tx0 + 0.14 : tx1 - 0.14, deck + 3.5, zb + 26, face, 0.36); fit(S, rm, kind); }
  let BR = 0;
  for (const [purpose, label, kind, a, b, face] of above) { const rm = S.room(purpose, label, [a, zb, b, tz1], UP, UP + 5, { glass: ['z0'], ...(kind ? {} : { bridge: 'meridian' }) }); S.slab(UP, [a, zb, b, tz1]); S.slab(UP + 5.2, [a, zb, b, tz1], true); S.door(TERM, rm, face === 1 ? tx0 : tx1, zb + 30, 3, 2.8, 'z'); S.sign(label.toUpperCase(), face === 1 ? tx0 + 0.14 : tx1 - 0.14, UP + 3.4, zb + 30, face, 0.36);
    if (kind) { S.lampGrid(rm, 9, 7.5, 'warm', 0.9, 0.4); fit(S, rm, kind); } else BR = rm; }
  S.wall(2, zb, tx0, zb, UP + 5.3, HH, BAY, { high: true }); S.wall(tx1, zb, W - 2, zb, UP + 5.3, HH, BAY, { high: true });
  BRIDGE.meridian(S, BR);
});

writeFileSync(new URL('../assets/ships/capital.json', import.meta.url), JSON.stringify(out));
console.log(Object.entries(out).map(([k, d]) => `${k} ${d.W}x${d.D}x${d.ceiling}: ${d.rooms.length} spaces, ${d.walls.length} walls, ${d.props.length} props, ${d.berths.length} berths, ${d.crew.length} crew, ${d.lights.length} lamps`).join('\n'));
