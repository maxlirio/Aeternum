// Daily lives. A person's day is a pure function of (person, day number): a list of
// segments, each either AT an anchor (sleeping, working, eating, browsing) or MOVING
// along a route. So where anyone is at any time is a closed-form lookup:
//   whereAt(pop, person, t)  →  position, facing, pose, building, floor
// The same function serves distant people (never rendered), nearby people (rendered
// every frame), offline time and witnesses — no per-person state is ever stored.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { buildingPlan } from './building.js';
import { tripPoints } from './paths.js';
import { buildingToWorld } from './place.js';

const WALK = 1.3;                                 // m/s

export function dayIndex(planet, t) { return Math.floor(t / planet.dayLength + 0.3); }
export function dayStart(planet, D) { return (D - 0.3) * planet.dayLength; }

// ---- places
function anchorPlace(pop, bKey, ai, slot = 0) {
  const b = pop.buildingByKey.get(bKey), plan = buildingPlan(pop.planet, pop.s, b), a = plan.anchors[ai];
  let x = a.x, z = a.z;
  if (slot) { x += Math.cos(a.facing) * 0.38 * slot; z -= Math.sin(a.facing) * 0.38 * slot; } // second sleeper beside the first
  return { b, plan, anchor: a, spot: { k: a.k, room: a.room, x, z }, y: a.y, facing: a.facing, pose: a.pose };
}
const homeAnchors = (pop, p, kinds) => {
  const unit = pop.unitByKey.get(p.home);
  return unit.anchors.filter(({ a }) => kinds.includes(a.kind) || kinds.includes(a.purpose));
};

// ---- day plan
const plans = new Map();
export function dayPlan(pop, p, D) {
  const key = p.id + '|' + D;
  let plan = plans.get(key);
  if (plan) return plan;
  if (plans.size > 4000) plans.clear();
  plan = buildDay(pop, p, D);
  plans.set(key, plan);
  return plan;
}

function buildDay(pop, p, D) {
  const { planet } = pop;
  const rng = new Rng(derive(p.seed, 'day', [D]));
  const T0 = dayStart(planet, D), T1 = dayStart(planet, D + 1), HR = planet.dayLength / 24;
  const at = h => T0 + h * HR;
  const segs = [];
  const bed = anchorPlace(pop, p.homeB, p.bed.anchor, p.bed.slot);
  let here = bed, t = T0;
  const stay = (place, until, activity) => { if (until > t) { segs.push({ type: 'at', t0: t, t1: until, place, activity }); t = until; } };
  const go = (place, activity) => {
    const pts = tripPoints(planet, pop.s, here, place);
    if (!pts || pts.length < 2) return false;
    const route = polyline(pts, place);
    const dur = route.length / (WALK * (0.9 + 0.2 * p.social));
    segs.push({ type: 'move', t0: t, t1: t + dur, route, to: place, activity });
    t += dur; here = place; return true;
  };
  const homeSpot = (kinds) => { const c = homeAnchors(pop, p, kinds); if (!c.length) return null; const { i } = rng.pick(c); return anchorPlace(pop, p.homeB, i); };
  const errand = () => {
    const stores = pop.s.buildings.filter(b => b.type === 'store');
    if (!stores.length) return false;
    const home = pop.buildingByKey.get(p.homeB);
    const near = stores.map(b => [b, Math.hypot(b.O[0] - home.O[0], b.O[1] - home.O[1])]).sort((a, c) => a[1] - c[1]).slice(0, 4);
    const store = rng.pick(near)[0], plan = buildingPlan(planet, pop.s, store);
    const spots = plan.anchors.map((a, i) => ({ a, i })).filter(({ a }) => a.purpose === 'shopfloor' && (a.kind === 'browse' || a.kind === 'stand'));
    if (!spots.length) return false;
    const h = (t - T0) / HR, [o, c] = store.hours;
    if (h < o + 0.2 || h > c - 1.2) return false;
    if (!go(anchorPlace(pop, store.key, rng.pick(spots).i), 'shopping')) return false;
    stay(here, t + rng.range(0.25, 0.7) * HR, 'shopping');
    return true;
  };
  const stroll = () => {
    const home = pop.buildingByKey.get(p.homeB);
    const node = rng.pick(pop.s.nodes.filter(n => Math.hypot(n.u - home.O[0], n.v - home.O[1]) < 260 && Math.hypot(n.u - home.O[0], n.v - home.O[1]) > 40));
    if (!node) return;
    const road = pop.s.roads.findIndex(r => r.na === pop.s.nodes.indexOf(node) || r.nb === pop.s.nodes.indexOf(node));
    const r = pop.s.roads[road], off = r.w / 2 + 1.6;
    const uv = r.a[1] === r.b[1] ? [node.u, node.v + off] : [node.u + off, node.v];
    const [x, z] = pop.s.toWorld(uv[0], uv[1]);
    // walk further afield: a junction within a few blocks
    go({ street: uv, road, y: pop.s.h, pos: [x, pop.s.h + 0.05, z], facing: rng.range(0, 6.28), pose: 'stand' }, 'out for a walk');
    stay(here, t + rng.range(0.08, 0.35) * HR, 'out for a walk');
  };

  const job = p.job ? pop.jobById.get(p.job) : null;
  const working = job && !p.offDays.includes(D % 7);
  const child = p.age < 16, old = p.age >= 67;
  const wake = (child ? 7.2 : old ? 6.8 : working ? Math.max(4.5, job.hours[0] - 1.6) : 7.6) + p.wakeBias * 0.5 + rng.range(-0.3, 0.3);
  const sleep = (child ? 20.5 : old ? 21.6 : 22.6) + p.wakeBias * 0.4 + rng.range(-0.4, 0.5);

  stay(bed, at(wake), 'sleeping');
  const breakfast = homeSpot(['kitchen']) || homeSpot(['sit']);
  if (breakfast && go(breakfast, 'breakfast')) stay(breakfast, t + rng.range(0.3, 0.6) * HR, 'breakfast');
  if (working) {
    const workPlace = anchorPlace(pop, job.b, job.anchor);
    const lounge = homeSpot(['sit', 'living']);
    const leaveBy = at(job.hours[0]) - 0.35 * HR;
    if (lounge && t < leaveBy - 0.3 * HR && go(lounge, 'at home')) stay(lounge, Math.max(t, leaveBy - 0.05 * HR), 'at home');
    if (go(workPlace, 'commuting')) { stay(workPlace, Math.max(t, at(job.hours[1])), 'working'); }
    if (rng.chance(0.35)) errand();
    // free afternoon/evening before dinner
    for (let i = 0; i < 4 && t < at(17.6); i++) {
      if (rng.chance(0.35 + 0.3 * p.social)) stroll();
      const spot = homeSpot(['sit', 'living', 'stand']);
      if (spot && go(spot, 'at home')) stay(spot, Math.min(at(18), t + rng.range(0.5, 1.5) * HR), 'at home');
    }
  } else {
    const n = child ? 0 : rng.int(0, 2);
    for (let i = 0; i < 6 && t < at(17); i++) {
      const spot = homeSpot(['sit', 'stand', 'browse']);
      if (spot && go(spot, 'at home')) stay(spot, t + rng.range(0.6, 2.2) * HR, 'at home');
      if (i < n && rng.chance(0.7)) errand();
      else if (rng.chance((child ? 0.35 : 0.3) + 0.25 * p.social)) stroll();
    }
  }
  if (!child && t < at(19.5) && rng.chance(0.25 + 0.35 * p.social)) stroll();     // evening walk
  const dinner = homeSpot(['kitchen']) || homeSpot(['sit']);
  if (dinner && t < at(18.2 + rng.range(-0.4, 0.8))) { if (go(dinner, 'dinner')) stay(dinner, Math.max(t, at(18.3 + rng.range(-0.3, 0.6))), 'cooking'); }
  if (dinner && t < at(sleep) - 0.8 * HR && go(dinner, 'dinner')) stay(dinner, Math.min(at(sleep) - 0.6 * HR, t + rng.range(0.4, 0.8) * HR), 'dinner');
  const evening = homeSpot(['sit', 'living']);
  if (evening && t < at(sleep) - 0.3 * HR && go(evening, 'at home')) stay(evening, at(sleep) - 0.05 * HR, 'at home');
  if (here !== bed) go(bed, 'going to bed');
  // the day always ends asleep in bed, so it joins the next day seamlessly
  if (t > T1) { // overran (very long commute or errand): compress by ending the last stay early
    for (let i = segs.length - 1; i >= 0 && t > T1; i--) if (segs[i].type === 'at') { const cut = Math.min(segs[i].t1 - segs[i].t0, t - T1); shift(segs, i, -cut); t -= cut; }
  }
  stay(bed, T1, 'sleeping');
  return { D, T0, T1, segs };
}

function shift(segs, i, dt) { segs[i].t1 += dt; for (let j = i + 1; j < segs.length; j++) { segs[j].t0 += dt; segs[j].t1 += dt; } }

function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * 0.6, pts[i][2] - pts[i - 1][2]));
  return { pts, cum, length: cum[cum.length - 1] };
}

function placePos(pop, place) {
  if (place.pos) return place.pos;
  return buildingToWorld(pop.s, place.b, place.spot.x, place.y, place.spot.z);
}
function worldFacing(s, b, a) { // building-local angle → world angle
  const dx = Math.sin(a), dz = Math.cos(a);
  const u = dx * b.ex[0] + dz * b.ez[0], v = dx * b.ex[1] + dz * b.ez[1];
  return Math.atan2(u * s.cos - v * s.sin, u * s.sin + v * s.cos);
}

// Where is person p at time t?
export function whereAt(pop, p, t) {
  const plan = dayPlan(pop, p, dayIndex(pop.planet, t));
  let lo = 0, hi = plan.segs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (plan.segs[m].t0 <= t) lo = m; else hi = m - 1; }
  const seg = plan.segs[lo];
  if (seg.type === 'at') {
    const pl = seg.place, pos = placePos(pop, pl);
    return { pos, facing: pl.b ? worldFacing(pop.s, pl.b, pl.facing) : pl.facing, pose: pl.pose, moving: false, bKey: pl.b?.key || null, k: pl.b ? pl.spot.k : null, activity: seg.activity, seg };
  }
  const { pts, cum, length } = seg.route;
  const d = Math.min(length, Math.max(0, (t - seg.t0) / (seg.t1 - seg.t0) * length));
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i], f = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
  return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], facing: Math.atan2(b[0] - a[0], b[2] - a[2]), pose: 'walk', moving: true,
    bKey: null, k: null, activity: seg.activity, seg, routeIndex: i, nextDoor: b.door || a.door || null };
}
