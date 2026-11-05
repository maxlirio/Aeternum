// The people of the country's villages, hamlets, farms and landings. Everyone has a house and
// something to do: they get up, go to the field or the stall or the well, stop there a while, and
// come home at dusk. Pure in time, like everything else out here: where someone is at t follows
// from who they are and what day it is. Nothing is stored; at night they're indoors and not drawn.
import { Rng } from '../core/prng.js';
import { derive, hash01 } from '../core/hash.js';
import { personName } from './names.js';
import { sitesNear } from './outposts.js';
import { surfaceAt } from './surface.js';
import { designById, designPlan, keeperOf, itemPlan } from './housegen.js';
import { solarHour, within } from '../sim/clock.js';

const SPEED = 1.25, HOME = /^gb_(cottage|hut|longhouse|tenement|inn)_/, SHOP = /^(gb_(shop|garage|smithy|markethall|sawmill)|fam_bandstall)_/;
const GATHER = [[/^fam_(fountain|villagewell)_/, 'at the well', 2.2], [/^fam_bench_/, 'taking the air', 1], [/^fam_pavilion_/, 'under the pavilion', 3], [/^fam_(shrine|monument)_/, 'paying their respects', 4.5], [/^fam_(marketcross|noticeboard)_/, 'reading the notices', 1.6], [/^fam_hall_/, 'at the hall', 2.5], [/^fam_temple_/, 'at the temple', 2.5], [/^fam_inn_/, 'outside the inn', 2], [/^fam_clinic_/, 'waiting at the clinic', 2], [/^fam_school_/, 'at the school', 3]];
const JOBS = { field: ['farmer', 'hand on the land', 'grower'], shop: ['shopkeeper', 'stallholder'], jetty: ['fisher', 'boat hand'], yard: ['carter', 'smith', 'mender', 'beekeeper', 'mason'] };

// a turned footprint, grown a little: is (x, z) in it? and does a straight walk cross it?
function inBox(b, x, z, m) { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z; return Math.abs(dx * c - dz * s) < b.box[0] + m && Math.abs(dx * s + dz * c) < b.box[1] + m; }
function crosses(boxes, a, c, m = 0.55) {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.ceil(L / 0.6);
  for (const b of boxes) { if (Math.hypot(b.x - a[0], b.z - a[1]) > L + b.box[0] + b.box[1] + 2) continue; for (let i = 0; i <= n; i++) { const f = i / n; if (inBox(b, a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, m)) return b; } }
  return null;
}
// a straight line, stepped round whatever's in the way (corner to corner of what it hits)
function around(boxes, a, c, depth = 0) {
  const b = depth < 5 && crosses(boxes, a, c); if (!b) return [c];
  const co = Math.cos(b.rot), s = Math.sin(b.rot), m = 1.5, corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const u = i * (b.box[0] + m), v = j * (b.box[1] + m); return [b.x + u * co + v * s, b.z - u * s + v * co]; });
  const free = corners.filter(q => !boxes.some(o => inBox(o, q[0], q[1], 0.6))).sort((p, q) => (Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(p[0] - c[0], p[1] - c[1])) - (Math.hypot(q[0] - a[0], q[1] - a[1]) + Math.hypot(q[0] - c[0], q[1] - c[1])));
  for (const w of free) { if (crosses(boxes.filter(o => o !== b), a, w) || crosses([b], a, w, 0.45)) continue; return [w, ...around(boxes, w, c, depth + 1)]; }
  return [c];     // boxed in: they squeeze by (rare, and tested)
}

// The people of a site, once. → { people, boxes, spots }
export function villageOf(planet, S) {
  if (S.folk) return S.folk;
  const rng = new Rng(derive(planet.seed, 'folk', [Math.round(S.x), Math.round(S.z)])), boxes = S.items.filter(i => i.box && !i.top), spots = { gather: [], shop: [], field: [], jetty: [] };
  const front = i => {       // the foot of its steps, in front of its door
    let u = 0, f = i.box ? i.box[1] + 1.1 : 1.4;
    if (/^gb_/.test(i.k)) { const D = designById(planet, i.k), pl = designPlan(planet, D); u = pl.doors[pl.entrance].x - D.w / 2; f = D.d / 2 + (i.stoop ? i.stoop.n * i.stoop.run : 0) + 0.8; }
    return [i.x + u * Math.cos(i.rot) - Math.sin(i.rot) * f, i.z - u * Math.sin(i.rot) - Math.cos(i.rot) * f]; };
  for (const i of S.items) {
    for (const [re, what, r] of GATHER) if (re.test(i.k)) { const a = rng.range(0, 6.28), rr = (i.box ? Math.max(i.box[0], i.box[1]) : 0) + r * 0.5 + 0.7; spots.gather.push({ at: [i.x + Math.cos(a) * rr, i.z + Math.sin(a) * rr], what, look: [i.x, i.z] }); }
    if (SHOP.test(i.k)) spots.shop.push({ at: front(i), what: /markethall|bandstall/.test(i.k) ? 'minding the stall' : 'at work', look: [i.x, i.z] });
    if (/^fam_(jetty|boat)_/.test(i.k)) spots.jetty.push({ at: null, what: 'seeing to the boats', look: [i.x, i.z] });
  }
  for (const f of S.fields) for (let n = 0; n < 3; n++) { const u = rng.range(-f.box[0], f.box[0]) * 0.8, v = rng.range(-f.box[1], f.box[1]) * 0.8, c = Math.cos(f.rot), s = Math.sin(f.rot); spots.field.push({ at: [f.x + u * c + v * s, f.z - u * s + v * c], what: 'working the rows', look: [f.x, f.z] }); }
  const people = [];
  S.items.filter(i => HOME.test(i.k)).forEach((h, hi) => {
    const size = /tenement/.test(h.k) ? rng.int(6, 14) : /longhouse|inn/.test(h.k) ? rng.int(3, 6) : rng.int(1, 4), door = front(h);
    for (let n = 0; n < size; n++) {
      const age = n === 0 ? rng.int(26, 70) : rng.chance(0.45) ? rng.int(6, 17) : rng.int(19, 80);
      const trade = age < 16 ? null : spots.shop.length && rng.chance(0.14) ? 'shop' : spots.field.length && rng.chance(0.6) ? 'field' : 'yard';
      people.push({ id: `sw:${S.id}:${hi}:${n}`, name: personName(rng), age, home: door, trade, job: trade ? rng.pick(JOBS[trade]) : 'child', k: people.length, stay: rng.chance(0.14), homeItem: h, slot: n });
    }
  });
  // and whoever minds the place, indoors, in working hours
  const keepers = [];
  S.items.forEach((i, n) => { if (!/^gb_(?!step)/.test(i.k)) return; const q = keeperOf(planet, designById(planet, i.k), i); if (q) keepers.push({ ...q, item: i, id: `sk:${S.id}:${n}`, name: personName(rng), age: rng.int(24, 66), job: q.what, k: people.length + keepers.length, trade: 'keeper' }); });
  return S.folk = { people, boxes, spots, site: S, lane: S.lanes[0] || null, keepers };
}

// the lane's centre at distance u along it (it wanders as render/outposts.js draws it)
function lanePt(L, u) { const len = Math.hypot(L[2] - L[0], L[3] - L[1]), ux = (L[2] - L[0]) / len, uz = (L[3] - L[1]) / len, w = Math.sin(u * 0.09) * 1.1 + Math.sin(u * 0.031 + 2) * 1.6; return [L[0] + ux * u - uz * w, L[1] + uz * u + ux * w]; }
function route(V, a, c) {
  const L = V.lane; let pts = [a];
  if (L) {                                                     // by the lane, if that's the way people would go
    const len = Math.hypot(L[2] - L[0], L[3] - L[1]), ux = (L[2] - L[0]) / len, uz = (L[3] - L[1]) / len, proj = p => Math.max(4, Math.min(len - 4, (p[0] - L[0]) * ux + (p[1] - L[1]) * uz)), ua = proj(a), uc = proj(c);
    if (Math.abs(ua - uc) > 14) { const dir = Math.sign(uc - ua); pts.push(...around(V.boxes, a, lanePt(L, ua))); for (let u = ua + dir * 10; (uc - u) * dir > 3; u += dir * 10) pts.push(lanePt(L, u)); pts.push(lanePt(L, uc)); }
  }
  pts.push(...around(V.boxes, pts[pts.length - 1], c));
  return pts;
}
// The day's comings and goings for one person: walks and stops, in hours of the day.
const days = new Map();
function dayOf(planet, V, P, day) {
  const ck = P.id + '|' + day; let D = days.get(ck); if (D) return D; if (days.size > 900) days.clear();
  const r = (q, lo, hi) => lo + (hi - lo) * hash01(planet.seed, [P.k, day, q, Math.round(V.site.x)]), hs = planet.dayLength / 24;
  const pick = (list, q) => list[Math.floor(hash01(planet.seed, [P.k, day, q, 73]) * list.length)];
  const goals = [], g = V.spots.gather, work = P.trade && V.spots[P.trade]?.filter(q => q.at);
  if (P.stay) { /* some days nobody sees them */ if (hash01(planet.seed, [P.k, day, 5]) < 0.6) return (days.set(ck, []), []); }
  if (work?.length) goals.push([pick(work, 1), r(2, 2.5, 4.5)]);
  if (g.length) goals.push([pick(g, 3), r(4, 0.3, 1.1)]);
  if (work?.length) goals.push([pick(work, 6), r(7, 1.5, 3.5)]);
  else if (g.length) goals.push([pick(g, 8), r(9, 0.5, 2)]);
  if (!goals.length) return (days.set(ck, []), []);
  let h = r(10, 6.6, 9.6), at = P.home; const legs = [];
  for (const [G, dur] of [...goals, [{ at: P.home, what: 'going home', home: true }, 0]]) {
    const pts = route(V, at, G.at), lens = []; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(d); L += d; }
    const walk = L / SPEED / hs; legs.push({ h0: h, h1: h + walk, pts, lens, L, to: G }); h += walk;
    if (!G.home) { legs.push({ h0: h, h1: h + dur, stop: G }); h += dur; at = G.at; }
  }
  days.set(ck, legs); return legs;
}
// where someone is at this moment: { x, z, facing, moving, doing } or null (indoors)
export function villagerAt(planet, V, P, t) {
  const f = t / planet.dayLength + 0.3, day = Math.floor(f), h = (f - day) * 24;
  for (const leg of dayOf(planet, V, P, day)) {
    if (h < leg.h0 || h >= leg.h1) continue;
    if (leg.stop) { const G = leg.stop; return { x: G.at[0], z: G.at[1], facing: Math.atan2(G.look[0] - G.at[0], G.look[1] - G.at[1]), moving: false, doing: G.what }; }
    let s = (h - leg.h0) / (leg.h1 - leg.h0) * leg.L;
    for (let i = 0; i < leg.lens.length; i++) { const d = leg.lens[i]; if (s <= d || i === leg.lens.length - 1) { const a = leg.pts[i], b = leg.pts[i + 1], q = Math.min(1, s / (d || 1)); return { x: a[0] + (b[0] - a[0]) * q, z: a[1] + (b[1] - a[1]) * q, facing: Math.atan2(b[0] - a[0], b[1] - a[1]), moving: true, doing: leg.to.home ? 'on the way home' : `on the way to ${/field|rows/.test(leg.to.what) ? 'the field' : /stall/.test(leg.to.what) ? 'the stall' : 'the middle of the place'}` }; } s -= d; }
  }
  return null;
}
// someone at home: in bed at night, otherwise in a seat or on their feet, somewhere of their own in the house. Or null, if there's no room for them
function atHome(planet, H, P, hour) {
  const night = hour >= 22 || hour < 6.5, key = night ? 'bed' : 'day', cached = P.spot?.[key]; if (cached !== undefined) return cached;
  const D = designById(planet, H.k), A = itemPlan(planet, D, H).anchors || [], beds = A.filter(a => a.kind === 'sleep'), seats = A.filter(a => a.kind === 'sit' || a.kind === 'stand'), list = night ? beds : seats, a = list[P.slot % (list.length || 1)];
  const c = Math.cos(H.rot), s = Math.sin(H.rot), out = a && !(night && P.slot >= beds.reduce((n, b) => n + (b.slots || 1), 0)) ? (() => { const u = a.x - D.w / 2, v = a.z - D.d / 2; return { pos: [H.x + u * c + v * s, H.y + a.y, H.z - u * s + v * c], facing: H.rot + a.facing, pose: a.pose }; })() : null;
  (P.spot || (P.spot = {}))[key] = out; return out;
}
// the people out and about near (x, z), nearest first
export function siteWalkers(planet, t, x, z, r, max = 40) {
  const out = [];
  sitesNear(planet, x, z, r + 100, S => {
    if (Math.hypot(S.x - x, S.z - z) > r + S.clear + 40 || !S.items.some(i => HOME.test(i.k))) return;
    const V = villageOf(planet, S), hour = solarHour(planet, t);
    for (const K of V.keepers) { const d = Math.hypot(K.x - x, K.z - z); if (d > r || !within(K.hours, hour)) continue; out.push({ id: K.id, pos: [K.x, K.y, K.z], facing: K.facing, moving: false, pose: 'stand', age: K.age, d, villager: K, doing: K.what, site: S.label, indoors: K.item }); }
    for (const P of V.people) { const q = villagerAt(planet, V, P, t);
      if (!q) { const H = P.homeItem, dh = Math.hypot(H.x - x, H.z - z); if (dh < Math.min(r, 45)) { const a = atHome(planet, H, P, hour); if (a) out.push({ id: P.id, pos: a.pos, facing: a.facing, moving: false, pose: a.pose, age: P.age, d: Math.hypot(a.pos[0] - x, a.pos[2] - z), villager: P, doing: a.pose === 'lie' ? 'asleep' : 'at home', site: S.label, indoors: H }); } continue; }
      const d = Math.hypot(q.x - x, q.z - z); if (d > r) continue;
      out.push({ id: P.id, pos: [q.x, surfaceAt(planet, q.x, q.z).h, q.z], facing: q.facing, moving: q.moving, pose: q.moving ? 'walk' : 'stand', age: P.age, d, villager: P, doing: q.doing, site: S.label }); }
  });
  return out.sort((a, b) => a.d - b.d).slice(0, max);
}
// a word with them. n counts how many times you've asked.
export function villagerSays(w, n) {
  const P = w.villager, intro = P.age < 14 ? `I'm ${P.name.split(' ')[0]}. I live just there.` : `${P.name}. I'm a ${P.job} here.`;
  const lines = [intro, `This is ${w.site}. There's not much to it, but it's ours.`, `I'm ${w.doing}.`, P.trade === 'field' ? `The crop's doing all right, if the weather holds.` : P.trade === 'shop' ? `Whatever's on the stall came out of the ground round here.` : `Plenty needs mending. It always does.`, `You're not from here, are you?`];
  return lines[n % lines.length];
}
