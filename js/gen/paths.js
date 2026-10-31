// Walking routes as polylines in world space — inside buildings through the room/door
// graph and the stair flights, and between buildings along the street graph (keeping
// to the right-hand sidewalk). Pure; built from plan and settlement DATA only.
// A route point is [x, y, z] with an optional .door = 'buildingKey#doorId' when the
// walker passes through that door.
import { buildingPlan, EXT_T } from './building.js';
import { buildingToWorld } from './place.js';

const OUTSIDE = 1.3;               // doorstep distance outside the entrance

function roomCentre(plan, key) {
  const [k, i] = key.split(':').map(Number);
  const r = plan.rooms.find(q => q.k === k && q.i === i);
  return [(r.rect[0] + r.rect[2]) / 2, k * plan.H, (r.rect[1] + r.rect[3]) / 2];
}

// Shortest room-to-room door sequence (BFS). Nodes: 'k:i', 'core', 'outside'.
function roomPath(plan, from, to) {
  if (from === to) return [];
  const adj = new Map();
  const link = (a, b, d) => { (adj.get(a) || adj.set(a, []).get(a)).push([b, d]); };
  for (const d of plan.doors) {
    const a = `${d.k}:${d.rooms[0]}`, b = d.rooms[1] === 'core' ? 'core' : d.rooms[1] === 'outside' ? 'outside' : `${d.k}:${d.rooms[1]}`;
    if (d.kind === 'hangar') continue;                // people use the personnel door
    link(a, b, d); link(b, a, d);
  }
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const n = q.shift();
    if (n === to) break;
    for (const [m, d] of adj.get(n) || []) if (!prev.has(m)) { prev.set(m, [n, d]); q.push(m); }
  }
  if (!prev.has(to)) return null;
  const doors = [];
  for (let n = to; prev.get(n); n = prev.get(n)[0]) doors.unshift(prev.get(n)[1]);
  return doors;
}

// Points (building-local) through the stair core from floor ka to floor kb.
function coreClimb(plan, ka, kb) {
  const pts = [];
  const flights = [];
  if (kb > ka) for (let j = ka; j < kb; j++) flights.push([plan.ramps[j], true]);
  else for (let j = ka - 1; j >= kb; j--) flights.push([plan.ramps[j], false]);
  for (const [r, up] of flights) {
    const cx = (r.x0 + r.x1) / 2;
    const low = r.y0 < r.y1 ? [cx, r.y0, r.z0] : [cx, r.y1, r.z1], high = r.y0 < r.y1 ? [cx, r.y1, r.z1] : [cx, r.y0, r.z0];
    const towardOut = (p, d) => [p[0], p[1], p[2] + (p[2] > (r.z0 + r.z1) / 2 ? d : -d)];
    if (up) pts.push(towardOut(low, 0.6), low, high, towardOut(high, 0.6));
    else pts.push(towardOut(high, 0.6), high, low, towardOut(low, 0.6));
  }
  return pts;
}

// Building-local points from one spot to another inside the same building.
// spot = { k, room, x, z } or 'outside' (the doorstep).
export function interiorPoints(plan, bKey, from, to) {
  const key = sp => sp === 'outside' ? 'outside' : `${sp.k}:${sp.room}`;
  const doors = roomPath(plan, key(from), key(to));
  if (doors === null) return null;
  const pts = [];
  const ent = plan.doors[plan.entrance];
  const doorstep = (d) => [d.x, 0, -OUTSIDE];
  const push = (p, door) => { const q = p.slice(); if (door !== undefined) q.door = `${bKey}#${door}`; pts.push(q); };
  push(from === 'outside' ? doorstep(ent) : [from.x, from.k * plan.H, from.z]);
  let lastCoreK = null;
  for (const d of doors) {
    const y = d.k * plan.H;
    // step through the door perpendicular to its wall
    const n = d.axis === 'x' ? [0, 0, 0.55] : [0.55, 0, 0];
    const here = pts[pts.length - 1];
    const sgn = d.axis === 'x' ? Math.sign(d.z - here[2]) || 1 : Math.sign(d.x - here[0]) || 1;
    if (d.kind === 'core' && lastCoreK !== null) {
      // leaving the core: climb from the floor we entered it on to this door's floor
      for (const p of coreClimb(plan, lastCoreK, d.k)) push(p);
      lastCoreK = null;
      const inner = [d.x + 0.6, y, d.z];
      push(inner);
      push([d.x, y, d.z], d.id); push([d.x - 0.6, y, d.z]);
      continue;
    }
    push([d.x - n[0] * sgn, y, d.z - n[2] * sgn]); push([d.x, y, d.z], d.id); push([d.x + n[0] * sgn, y, d.z + n[2] * sgn]);
    if (d.kind === 'core') lastCoreK = d.k;
  }
  push(to === 'outside' ? doorstep(ent) : [to.x, to.k * plan.H, to.z]);
  return pts;
}

// Street route between two doorsteps, in settlement-local (u, v), keeping right.
export function streetPoints(s, fromUV, fromRoad, toUV, toRoad) {
  const nodes = s.nodes, roads = s.roads;
  const adj = new Map();
  for (const r of roads) {
    const len = Math.hypot(r.a[0] - r.b[0], r.a[1] - r.b[1]);
    (adj.get(r.na) || adj.set(r.na, []).get(r.na)).push([r.nb, len]);
    (adj.get(r.nb) || adj.set(r.nb, []).get(r.nb)).push([r.na, len]);
  }
  const proj = (p, r) => {
    const alongU = r.a[1] === r.b[1];
    return alongU ? [Math.max(Math.min(r.a[0], r.b[0]), Math.min(p[0], Math.max(r.a[0], r.b[0]))), r.a[1]] : [r.a[0], Math.max(Math.min(r.a[1], r.b[1]), Math.min(p[1], Math.max(r.a[1], r.b[1])))];
  };
  const side = (p, r) => { // sidewalk point beside the road on p's side
    const c = proj(p, r), alongU = r.a[1] === r.b[1], o = r.w / 2 + 1.25;
    return alongU ? [c[0], c[1] + Math.sign(p[1] - c[1] || 1) * o] : [c[0] + Math.sign(p[0] - c[0] || 1) * o, c[1]];
  };
  const A = roads[fromRoad], B = roads[toRoad];
  const sa = side(fromUV, A), sb = side(toUV, B);
  if (fromRoad === toRoad) return [fromUV, sa, sb, toUV];
  // Dijkstra from both ends of A to both ends of B
  const dist = new Map(), prev = new Map(), done = new Set();
  const pa = proj(fromUV, A);
  for (const n of [A.na, A.nb]) { dist.set(n, Math.hypot(nodes[n].u - pa[0], nodes[n].v - pa[1])); prev.set(n, null); }
  for (;;) {
    let best = null;
    for (const [n, d] of dist) if (!done.has(n) && (best === null || d < dist.get(best))) best = n;
    if (best === null) break;
    done.add(best);
    for (const [m, l] of adj.get(best) || []) { const nd = dist.get(best) + l; if (!dist.has(m) || nd < dist.get(m)) { dist.set(m, nd); prev.set(m, best); } }
  }
  const pb = proj(toUV, B);
  let end = null, endD = Infinity;
  for (const n of [B.na, B.nb]) { const d = (dist.get(n) ?? Infinity) + Math.hypot(nodes[n].u - pb[0], nodes[n].v - pb[1]); if (d < endD) { endD = d; end = n; } }
  const seq = [];
  for (let n = end; n !== null && n !== undefined; n = prev.get(n)) seq.unshift(n);
  // corners: offset each node to the right of travel (both legs' half-widths)
  const hwAt = (n, m) => (roads.find(r => (r.na === n && r.nb === m) || (r.na === m && r.nb === n))?.w ?? 8) / 2 + 1.25;
  const pts = [fromUV, sa];
  const P = n => [nodes[n].u, nodes[n].v];
  const right = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  const startFrom = pa, endAt = pb;
  for (let i = 0; i < seq.length; i++) {
    const c = P(seq[i]);
    const prevP = i === 0 ? startFrom : P(seq[i - 1]), nextP = i === seq.length - 1 ? endAt : P(seq[i + 1]);
    const r1 = right(prevP, c), r2 = right(c, nextP);
    const o1 = i === 0 ? A.w / 2 + 1.25 : hwAt(seq[i - 1], seq[i]), o2 = i === seq.length - 1 ? B.w / 2 + 1.25 : hwAt(seq[i], seq[i + 1]);
    const straight = Math.abs(r1[0] * r2[0] + r1[1] * r2[1]) > 0.9;
    pts.push(straight ? [c[0] + r1[0] * o1, c[1] + r1[1] * o1] : [c[0] + r1[0] * o1 + r2[0] * o2, c[1] + r1[1] * o1 + r2[1] * o2]);
  }
  pts.push(sb, toUV);
  return pts;
}

// A whole trip between two places, each { b, plan, spot } (spot as in interiorPoints)
// or { street: [u, v] } for a point outdoors. Returns world points.
export function tripPoints(planet, s, from, to) {
  const out = [];
  const add = (pts) => { for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1], l[2] - p[2]) > 0.01 || p.door) out.push(p); } };
  const W = (b, p) => { const w = buildingToWorld(s, b, p[0], p[1], p[2]); if (p[2] < -0.01 && p[1] === 0) w[1] = s.h; if (p.door) w.door = p.door; return w; };
  const doorUV = (place) => { const e = place.plan.doors[place.plan.entrance]; const b = place.b; return [b.O[0] + b.ex[0] * e.x + b.ez[0] * -OUTSIDE, b.O[1] + b.ex[1] * e.x + b.ez[1] * -OUTSIDE]; };
  const UV = ([u, v]) => { const [x, z] = s.toWorld(u, v); return [x, s.h + 0.05, z]; };
  if (from.b && to.b && from.b.key === to.b.key) {
    const pts = interiorPoints(from.plan, from.b.key, from.spot, to.spot);
    if (!pts) return null;
    add(pts.map(p => W(from.b, p)));
    return out;
  }
  let startUV, startRoad;
  if (from.b) {
    const pts = interiorPoints(from.plan, from.b.key, from.spot, 'outside'); if (!pts) return null;
    add(pts.map(p => W(from.b, p))); startUV = doorUV(from); startRoad = from.b.road;
  } else { startUV = from.street; startRoad = from.road; add([UV(startUV)]); }
  const endUV = to.b ? doorUV(to) : to.street, endRoad = to.b ? to.b.road : to.road;
  add(streetPoints(s, startUV, startRoad, endUV, endRoad).slice(1, -1).map(UV));
  if (to.b) {
    const pts = interiorPoints(to.plan, to.b.key, 'outside', to.spot); if (!pts) return null;
    add(pts.map(p => W(to.b, p)));
  } else add([UV(endUV)]);
  return out;
}

export { OUTSIDE, EXT_T };
