// Building floor plans, generated lazily from a building record (gen/settlement.js).
// Pure: same record + universe → same plan. Everything is in building-local metres:
//   x along the frontage [0, w], z inward from the front wall [0, d], y up from the
//   ground-floor surface. The entrance is on the front wall (z = 0).
//
// A plan is the single source for both rendering and collision:
//   walls   — vertical segments per floor, with door/window openings
//   slabs   — horizontal floor/roof rectangles (holes over stair flights)
//   ramps   — stair flights (walkable inclined rectangles)
//   rooms   — leaf rectangles per floor, with a purpose
//   doors   — every door, with its access rule
//   props   — furniture boxes (also colliders)
import { Rng } from '../core/prng.js';
import { Address } from '../core/address.js';
import { TYPES } from './settlement.js';

export const EXT_T = 0.3, INT_T = 0.15, SLAB_T = 0.25, DOOR_W = 1.0, DOOR_H = 2.2;
const CORE_W = 3.6, LANDING = 1.4, MIN_ROOM = 3.2;

const cache = new Map();

export function buildingPlan(planet, settlement, b) {
  const ck = planet.universeSeed.join(':') + '|' + b.key;
  if (cache.has(ck)) return cache.get(ck);
  const plan = generatePlan(planet, settlement, b);
  cache.set(ck, plan);
  return plan;
}

function generatePlan(planet, s, b) {
  const rng = new Rng(Address.parse(b.key).seed(planet.universeSeed));
  const T = TYPES[b.type];
  const { w, d, floors: F, storeyH: H } = b;
  const plan = { key: b.key, type: b.type, w, d, F, H, walls: [], slabs: [], ramps: [], rooms: [], doors: [], props: [], windows: [] };
  const hasCore = F > 1;
  const xc = w - CORE_W;                       // core partition wall centreline
  const mainX1 = hasCore ? xc - INT_T / 2 : w - EXT_T;
  const zl0 = EXT_T + LANDING, zl1 = d - EXT_T - LANDING;
  const lane = k => (k % 2 === 0 ? [xc + INT_T / 2, xc + INT_T / 2 + 1.5] : [w - EXT_T - 1.5, w - EXT_T]);
  const arrival = k => (k === 0 ? 'front' : (k - 1) % 2 === 0 ? 'back' : 'front'); // landing you stand on at floor k

  const addDoor = (door) => { door.id = plan.doors.length; plan.doors.push(door); return door; };

  // ---- slabs (k = 0 ground .. F roof) and stair flights
  for (let k = 0; k <= F; k++) {
    const y = k * H;
    if (hasCore && k >= 1 && k <= F - 1) {
      const [hx0, hx1] = lane(k - 1);
      plan.slabs.push({ k, y, rects: [[0, 0, hx0, d], [hx1, 0, w, d], [hx0, 0, hx1, zl0], [hx0, zl1, hx1, d]] });
    } else plan.slabs.push({ k, y, rects: [[0, 0, w, d]], roof: k === F });
  }
  if (hasCore) for (let k = 0; k < F - 1; k++) {
    const [x0, x1] = lane(k), up = k % 2 === 0;           // even flights climb front→back
    plan.ramps.push({ k, x0, x1, z0: zl0, z1: zl1, y0: up ? k * H : (k + 1) * H, y1: up ? (k + 1) * H : k * H });
  }

  // ---- per floor: exterior walls, core walls, rooms, interior walls
  const floorRooms = [];
  for (let k = 0; k < F; k++) {
    const y0 = k * H, y1 = (k + 1) * H;
    const ext = [
      { side: 'front', x0: 0, z0: EXT_T / 2, x1: w, z1: EXT_T / 2 },
      { side: 'back', x0: 0, z0: d - EXT_T / 2, x1: w, z1: d - EXT_T / 2 },
      { side: 'left', x0: EXT_T / 2, z0: EXT_T, x1: EXT_T / 2, z1: d - EXT_T },
      { side: 'right', x0: w - EXT_T / 2, z0: EXT_T, x1: w - EXT_T / 2, z1: d - EXT_T },
    ];
    for (const e of ext) plan.walls.push({ ...e, k, y0, y1, t: EXT_T, exterior: true, openings: [] });
    if (hasCore) {
      plan.walls.push({ side: 'core', x0: xc, z0: EXT_T, x1: xc, z1: d - EXT_T, k, y0, y1, t: INT_T, openings: [] });
      plan.walls.push({ side: 'divider', x0: w - EXT_T - 1.5 - 0.1, z0: zl0, x1: w - EXT_T - 1.5 - 0.1, z1: zl1, k, y0, y1, t: 0.12, openings: [] });
    }
    // BSP the main area into rooms
    const leaves = [], splits = [];
    const target = T.roomArea;
    const split = (r, depth) => {
      const rw = r[2] - r[0], rd = r[3] - r[1];
      const area = rw * rd;
      const canX = rw >= 2 * MIN_ROOM + INT_T, canZ = rd >= 2 * MIN_ROOM + INT_T;
      if (area <= target * 1.25 || (!canX && !canZ) || depth > 6) { leaves.push(r); return; }
      const alongX = canX && (!canZ || rw >= rd);
      if (alongX) {
        const c = Math.round(Math.max(r[0] + MIN_ROOM + INT_T / 2, Math.min(r[2] - MIN_ROOM - INT_T / 2, r[0] + rw * rng.range(0.38, 0.62))) * 10) / 10;
        splits.push({ x0: c, z0: r[1], x1: c, z1: r[3] });
        split([r[0], r[1], c - INT_T / 2, r[3]], depth + 1); split([c + INT_T / 2, r[1], r[2], r[3]], depth + 1);
      } else {
        const c = Math.round(Math.max(r[1] + MIN_ROOM + INT_T / 2, Math.min(r[3] - MIN_ROOM - INT_T / 2, r[1] + rd * rng.range(0.38, 0.62))) * 10) / 10;
        splits.push({ x0: r[0], z0: c, x1: r[2], z1: c });
        split([r[0], r[1], r[2], c - INT_T / 2], depth + 1); split([r[0], c + INT_T / 2, r[2], r[3]], depth + 1);
      }
    };
    split([EXT_T, EXT_T, mainX1, d - EXT_T], 0);
    const wallBase = plan.walls.length;
    for (const sp of splits) plan.walls.push({ side: 'int', ...sp, k, y0, y1, t: INT_T, openings: [] });
    const rooms = leaves.map((r, i) => ({ k, i, rect: r, doors: [] }));
    floorRooms.push({ rooms, splits, wallBase });
    plan.rooms.push(...rooms);

    // Doors between adjacent rooms: random spanning tree plus a few loops.
    const adj = [];
    for (let a = 0; a < rooms.length; a++) for (let c = a + 1; c < rooms.length; c++) {
      const A = rooms[a].rect, B = rooms[c].rect;
      let seg = null;
      if (Math.abs(A[2] + INT_T - B[0]) < 0.01 || Math.abs(B[2] + INT_T - A[0]) < 0.01) {
        const x = Math.abs(A[2] + INT_T - B[0]) < 0.01 ? A[2] + INT_T / 2 : B[2] + INT_T / 2;
        const lo = Math.max(A[1], B[1]), hi = Math.min(A[3], B[3]);
        if (hi - lo >= 1.6) seg = { axis: 'z', x, lo, hi };
      } else if (Math.abs(A[3] + INT_T - B[1]) < 0.01 || Math.abs(B[3] + INT_T - A[1]) < 0.01) {
        const z = Math.abs(A[3] + INT_T - B[1]) < 0.01 ? A[3] + INT_T / 2 : B[3] + INT_T / 2;
        const lo = Math.max(A[0], B[0]), hi = Math.min(A[2], B[2]);
        if (hi - lo >= 1.6) seg = { axis: 'x', z, lo, hi };
      }
      if (seg) adj.push({ a, c, seg });
    }
    rng.shuffle(adj);
    const parent = rooms.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const e of adj) {
      const ra = find(e.a), rc = find(e.c);
      const tree = ra !== rc;
      if (!tree && !rng.chance(0.25)) continue;
      if (tree) parent[ra] = rc;
      const mid = (e.seg.lo + e.seg.hi) / 2;
      const door = addDoor({ k, kind: 'interior', rooms: [rooms[e.a].i, rooms[e.c].i], access: 'open',
        x: e.seg.axis === 'z' ? e.seg.x : mid, z: e.seg.axis === 'x' ? e.seg.z : mid, axis: e.seg.axis, width: DOOR_W, height: DOOR_H });
      rooms[e.a].doors.push(door.id); rooms[e.c].doors.push(door.id);
      attachOpening(plan, wallBase, door);
    }

    // Core doorway onto the landing you arrive at on this floor.
    if (hasCore) {
      const zc = arrival(k) === 'front' ? EXT_T + LANDING / 2 : d - EXT_T - LANDING / 2;
      const room = rooms.find(r => Math.abs(r.rect[2] - mainX1) < 0.01 && r.rect[1] <= zc - 0.6 && r.rect[3] >= zc + 0.6);
      const door = addDoor({ k, kind: 'core', rooms: [room ? room.i : -1, 'core'], access: 'open', x: xc, z: zc, axis: 'z', width: DOOR_W, height: DOOR_H });
      if (room) room.doors.push(door.id);
      plan.walls.find(wl => wl.k === k && wl.side === 'core').openings.push(opening(door, xc, EXT_T, 'z'));
    }
  }

  // ---- entrance
  const ground = floorRooms[0].rooms;
  const frontRooms = ground.filter(r => Math.abs(r.rect[1] - EXT_T) < 0.01).sort((a, c) => (c.rect[2] - c.rect[0]) - (a.rect[2] - a.rect[0]));
  const entryRoom = frontRooms[0];
  const big = b.type === 'hangar';
  const ew = big ? Math.min(10, entryRoom.rect[2] - entryRoom.rect[0] - 3) : b.type === 'store' || b.type === 'office' ? 1.8 : DOOR_W;
  const ex = (entryRoom.rect[0] + entryRoom.rect[2]) / 2;
  const entrance = addDoor({ k: 0, kind: big ? 'hangar' : 'exterior', rooms: [entryRoom.i, 'outside'], access: b.access, hours: b.hours,
    x: ex, z: EXT_T / 2, axis: 'x', width: ew, height: big ? 6.5 : b.type === 'store' || b.type === 'office' ? 2.6 : DOOR_H });
  entryRoom.doors.push(entrance.id);
  plan.entrance = entrance.id;
  plan.walls.find(wl => wl.k === 0 && wl.side === 'front').openings.push(opening(entrance, 0, 0, 'x'));
  if (big) { // personnel door beside the hangar door
    const pd = addDoor({ k: 0, kind: 'exterior', rooms: [entryRoom.i, 'outside'], access: 'staff', x: ex - ew / 2 - 1.6, z: EXT_T / 2, axis: 'x', width: DOOR_W, height: DOOR_H });
    entryRoom.doors.push(pd.id);
    plan.walls.find(wl => wl.k === 0 && wl.side === 'front').openings.push(opening(pd, 0, 0, 'x'));
  }

  // ---- room purposes and restricted rooms
  for (const fr of floorRooms) for (const r of fr.rooms) r.purpose = purposeFor(b.type, r, rng, r === entryRoom);
  if (b.type === 'office' || b.type === 'workshop' || b.type === 'store') {
    for (const r of plan.rooms) {
      if (r === entryRoom || r.doors.length !== 1) continue;
      const door = plan.doors[r.doors[0]];
      if (door.kind !== 'interior' || !rng.chance(b.type === 'office' ? 0.5 : 0.6)) continue;
      door.access = 'staff'; r.restricted = true;
      if (b.type !== 'office') r.purpose = 'storage';
    }
  }

  // ---- windows on exterior walls
  for (const wl of plan.walls) {
    if (!wl.exterior) continue;
    placeWindows(plan, b, wl, rng, xc, hasCore);
  }

  // ---- furniture
  for (const r of plan.rooms) furnish(plan, r, rng, H);
  return plan;
}

function opening(door, wx0, wz0, axis) {
  // offset along the wall from its start point
  const c = axis === 'x' ? door.x : door.z;
  return { kind: 'door', door: door.id, a: c - door.width / 2, b: c + door.width / 2, y0: 0, y1: door.height };
}

function attachOpening(plan, wallBase, door) {
  for (let i = wallBase; i < plan.walls.length; i++) {
    const wl = plan.walls[i];
    if (wl.k !== door.k || wl.side !== 'int') continue;
    if (door.axis === 'z' && wl.x0 === wl.x1 && Math.abs(wl.x0 - door.x) < 0.01 && door.z > wl.z0 && door.z < wl.z1) {
      wl.openings.push({ kind: 'door', door: door.id, a: door.z - door.width / 2, b: door.z + door.width / 2, y0: 0, y1: door.height }); return;
    }
    if (door.axis === 'x' && wl.z0 === wl.z1 && Math.abs(wl.z0 - door.z) < 0.01 && door.x > wl.x0 && door.x < wl.x1) {
      wl.openings.push({ kind: 'door', door: door.id, a: door.x - door.width / 2, b: door.x + door.width / 2, y0: 0, y1: door.height }); return;
    }
  }
  throw new Error('door has no wall: ' + plan.key + ' #' + door.id);
}

function purposeFor(type, room, rng, isEntry) {
  const [x0, z0, x1, z1] = room.rect, area = (x1 - x0) * (z1 - z0);
  switch (type) {
    case 'hab': case 'house': return isEntry && type === 'hab' ? 'lobby' : rng.weighted([['living', 3], ['bedroom', 3], ['kitchen', 2]]);
    case 'office': return isEntry ? 'reception' : area > 40 ? 'meeting' : 'office';
    case 'store': return isEntry ? 'shopfloor' : 'storage';
    case 'workshop': return isEntry ? 'shopfloor-workshop' : 'office';
    case 'hangar': return isEntry ? 'hangar' : 'office';
  }
  return 'room';
}

function placeWindows(plan, b, wl, rng, xc, hasCore) {
  const alongX = wl.z0 === wl.z1;
  const a0 = alongX ? wl.x0 : wl.z0, L = alongX ? wl.x1 - wl.x0 : wl.z1 - wl.z0;
  const blockers = [];                       // [a, b] intervals along this wall to keep clear
  for (const o of wl.openings) blockers.push([o.a - 0.5, o.b + 0.5]);
  for (const iw of plan.walls) {             // interior walls butting into this one
    if (iw.k !== wl.k || iw.exterior) continue;
    if (alongX && iw.x0 === iw.x1 && (Math.abs(iw.z0 - wl.z0) < 0.5 || Math.abs(iw.z1 - wl.z0) < 0.5)) blockers.push([iw.x0 - 0.45, iw.x0 + 0.45]);
    if (!alongX && iw.z0 === iw.z1 && (Math.abs(iw.x0 - wl.x0) < 0.5 || Math.abs(iw.x1 - wl.x0) < 0.5)) blockers.push([iw.z0 - 0.45, iw.z0 + 0.45]);
  }
  if (hasCore && alongX) blockers.push([xc - 0.3, b.w]);          // stair core: no windows on front/back
  if (hasCore && !alongX && wl.side === 'right') blockers.push([0, b.d]);
  const shop = (b.type === 'store' || b.type === 'office') && wl.k === 0 && wl.side === 'front';
  const tall = b.type === 'hangar' || b.type === 'workshop';
  const ww = shop ? 2.4 : tall ? 2.2 : rng.range(1.1, 1.5);
  const y0 = shop ? 0.45 : tall ? plan.H - 2.2 : 0.95, y1 = shop ? 2.5 : tall ? plan.H - 0.6 : 2.35;
  const pitch = shop ? 3.0 : tall ? 3.4 : rng.range(2.6, 3.4);
  const n = Math.floor((L - 1.2) / pitch);
  const start = (L - n * pitch) / 2 + pitch / 2;
  for (let i = 0; i < n; i++) {
    const c = a0 + start + i * pitch, a = c - ww / 2, bb = c + ww / 2;
    if (a < a0 + 0.8 || bb > a0 + L - 0.8) continue;
    if (blockers.some(([p, q]) => bb > p && a < q)) continue;
    wl.openings.push({ kind: 'window', a, b: bb, y0, y1 });
  }
}

// ---- furniture
const WALL_PROPS = {
  living: [['sofa', 2.0, 0.9, 0.8], ['cabinet', 1.2, 0.45, 1.8]],
  bedroom: [['bed', 2.1, 1.5, 0.55], ['locker', 0.9, 0.55, 2.0]],
  kitchen: [['counter', 2.6, 0.65, 0.92], ['fridge', 0.8, 0.7, 1.9]],
  lobby: [['bench', 1.8, 0.5, 0.45], ['planter', 0.7, 0.7, 1.1]],
  reception: [['counter', 2.8, 0.7, 1.05], ['bench', 1.8, 0.5, 0.45]],
  office: [['cabinet', 1.0, 0.5, 1.4], ['cabinet', 1.0, 0.5, 1.4]],
  meeting: [['cabinet', 1.6, 0.45, 0.9]],
  shopfloor: [['shelf', 2.4, 0.6, 1.9], ['shelf', 2.4, 0.6, 1.9], ['counter', 2.2, 0.7, 1.0]],
  storage: [['rack', 2.4, 0.8, 2.2], ['crate', 1.2, 1.2, 1.0], ['crate', 1.0, 1.0, 0.8]],
  'shopfloor-workshop': [['bench', 2.6, 0.9, 0.95], ['machine', 1.8, 1.4, 1.7], ['rack', 2.4, 0.8, 2.2]],
  hangar: [['crate', 1.6, 1.6, 1.4], ['crate', 1.2, 1.2, 1.0], ['rack', 3.0, 0.9, 2.6], ['machine', 2.2, 1.6, 2.0]],
};
const CENTRE_PROPS = {
  living: [['table', 1.2, 0.8, 0.45]], kitchen: [['table', 1.4, 0.9, 0.75]],
  office: [['desk', 1.5, 0.75, 0.75]], meeting: [['table', 3.0, 1.2, 0.75]],
  shopfloor: [['shelf', 2.4, 0.9, 1.5]], 'shopfloor-workshop': [['bench', 2.4, 1.0, 0.95]],
  hangar: [['crate', 1.6, 1.6, 1.4]], reception: [['planter', 0.8, 0.8, 1.0]],
};

function furnish(plan, room, rng, H) {
  const [x0, z0, x1, z1] = room.rect;
  const y = room.k * H;
  const clear = [];                               // door swing zones [x, z, r]
  for (const id of room.doors) { const dr = plan.doors[id]; clear.push([dr.x, dr.z, dr.width / 2 + 1.1]); }
  if (plan.F > 1) for (const dr of plan.doors) if (dr.kind === 'core' && dr.k === room.k) clear.push([dr.x, dr.z, 1.6]);
  const placed = [];
  const ok = (bx0, bz0, bx1, bz1) => {
    if (bx0 < x0 + 0.02 || bz0 < z0 + 0.02 || bx1 > x1 - 0.02 || bz1 > z1 - 0.02) return false;
    for (const [cx, cz, r] of clear) {
      const nx = Math.max(bx0, Math.min(cx, bx1)), nz = Math.max(bz0, Math.min(cz, bz1));
      if ((nx - cx) ** 2 + (nz - cz) ** 2 < r * r) return false;
    }
    for (const p of placed) if (bx0 < p[2] + 0.5 && bx1 > p[0] - 0.5 && bz0 < p[3] + 0.5 && bz1 > p[1] - 0.5) return false;
    return true;
  };
  const add = (kind, bx0, bz0, bx1, bz1, h, face) => {
    placed.push([bx0, bz0, bx1, bz1]);
    plan.props.push({ kind, k: room.k, x0: bx0, z0: bz0, x1: bx1, z1: bz1, y, h, face, room: room.i });
  };
  const wallSet = WALL_PROPS[room.purpose] || [];
  const scale = room.purpose === 'hangar' ? 3 : 1;
  for (let rep = 0; rep < scale; rep++) for (const [kind, len, dep, h] of wallSet) {
    for (let tries = 0; tries < 8; tries++) {
      const side = rng.int(0, 3);                 // 0 z0-wall, 1 z1-wall, 2 x0-wall, 3 x1-wall
      if (side < 2) {
        const bx0 = rng.range(x0 + 0.1, x1 - len - 0.1), bz0 = side === 0 ? z0 + 0.05 : z1 - dep - 0.05;
        if (ok(bx0, bz0, bx0 + len, bz0 + dep)) { add(kind, bx0, bz0, bx0 + len, bz0 + dep, h, side === 0 ? 2 : 0); break; }
      } else {
        const bz0 = rng.range(z0 + 0.1, z1 - len - 0.1), bx0 = side === 2 ? x0 + 0.05 : x1 - dep - 0.05;
        if (ok(bx0, bz0, bx0 + dep, bz0 + len)) { add(kind, bx0, bz0, bx0 + dep, bz0 + len, h, side === 2 ? 1 : 3); break; }
      }
    }
  }
  const centre = CENTRE_PROPS[room.purpose] || [];
  for (const [kind, len, dep, h] of centre) {
    const n = room.purpose === 'office' ? 2 : room.purpose === 'shopfloor' || room.purpose === 'hangar' ? 3 : 1;
    for (let i = 0; i < n; i++) for (let tries = 0; tries < 10; tries++) {
      const cx = rng.range(x0 + 1.2, x1 - 1.2), cz = rng.range(z0 + 1.2, z1 - 1.2);
      const rot = rng.chance(0.5);
      const hx = (rot ? dep : len) / 2, hz = (rot ? len : dep) / 2;
      if (ok(cx - hx - 0.6, cz - hz - 0.6, cx + hx + 0.6, cz + hz + 0.6)) {
        add(kind, cx - hx, cz - hz, cx + hx, cz + hz, h, rot ? 1 : 0);
        if (kind === 'desk' || (kind === 'table' && room.purpose !== 'living')) { // chairs ride along, not colliders of note
          plan.props.push({ kind: 'chair', k: room.k, x0: cx - 0.25 + (rot ? hx + 0.35 : 0), z0: cz - 0.25 + (rot ? 0 : hz + 0.35), x1: cx + 0.25 + (rot ? hx + 0.35 : 0), z1: cz + 0.25 + (rot ? 0 : hz + 0.35), y, h: 0.9, face: rot ? 3 : 2, room: room.i, soft: true });
        }
        break;
      }
    }
  }
}

// Reachability graph used by tests and (later) NPC pathing: nodes are rooms ('k:i'),
// 'core', 'outside'; edges are doors.
export function roomGraph(plan) {
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (const dr of plan.doors) {
    const [a, b] = dr.rooms;
    const na = `${dr.k}:${a}`;
    const nb = b === 'core' ? 'core' : b === 'outside' ? 'outside' : `${dr.k}:${b}`;
    link(na, nb);
  }
  for (const r of plan.rooms) if (!adj.has(`${r.k}:${r.i}`)) adj.set(`${r.k}:${r.i}`, []);
  return adj;
}
