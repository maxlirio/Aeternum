// Using the furniture. Every prop in a floor plan offers verbs by kind and by the room it
// stands in — sleep, sit, open, cook, fabricate, assemble, wash, water, use a terminal,
// buy, sell — read from the logical records (kind, footprint, room), never the mesh.
//
// Containers hold generated contents (gen/items.js) until touched; then the contents are a
// delta `box/<building>/<prop>` = { period, items }. Items you put somewhere stay yours
// (own: 1) wherever they are. Taking what isn't yours from somewhere that isn't yours is
// theft: an incident with witnesses, handled by the same law process as a break-in.
// Cooking, fabricating and washing are timed jobs, so they finish while you're away too.
import { ITEMS, containerOf, generatedContents, restockPeriod, buyPrice, sellPrice, massOf } from '../../gen/items.js';
import { buildingPlan } from '../../gen/building.js';
import { within, solarHour } from '../clock.js';

export const boxKey = (bKey, i) => `box/${bKey}/${i}`;
export const useKey = (bKey, i) => `use/${bKey}/${i}`;
export const lightKey = (bKey, k, room) => `light/${bKey}/${k}:${room}`;
export const MIN = 60;

// Timed work at a prop. min = real minutes (the clock runs 1:1).
export const RECIPES = {
  cook: [
    { out: 'noodlebowl', in: { noodles: 1 }, min: 2 },
    { out: 'omelette', in: { eggs: 1 }, min: 3 },
    { out: 'stirfry', in: { rice: 1, vegetables: 1 }, min: 5 },
    { out: 'stew', in: { protein: 1, vegetables: 1 }, min: 8 },
  ],
  fabricate: [
    { out: 'bracket', in: { scrap: 2 }, min: 4 },
    { out: 'plate', in: { scrap: 4 }, min: 6 },
    { out: 'multitool', in: { bracket: 1, scrap: 1 }, min: 5 },
    { out: 'servo', in: { wiring: 1, bracket: 1, circuit: 1 }, min: 10 },
  ],
  assemble: [
    { out: 'wiring', in: { scrap: 1, tape: 1 }, min: 3 },
    { out: 'torch', in: { cell: 1, bracket: 1 }, min: 4 },
    { out: 'scanner', in: { circuit: 2, wiring: 1, cell: 1 }, min: 12, tool: 'multitool' },
    { out: 'drone', in: { servo: 4, circuit: 2, cell: 1, plate: 2 }, min: 30, tool: 'wrench' },
  ],
};
export const WASH_MIN = 6, WATER_DAYS = 3;

// ---- what each prop is for
const cache = new Map();
export function usablesOf(planet, s, b) {
  const ck = planet.universeSeed.join(':') + '|' + b.key;
  if (cache.has(ck)) return cache.get(ck);
  const plan = b.plan || buildingPlan(planet, s, b), out = [];
  plan.props.forEach((pr, i) => {
    const room = plan.rooms.find(r => r.i === pr.room && r.k === pr.k) || null;
    const box = containerOf(b, room, pr), p = room?.purpose, verbs = [];
    const seats = plan.anchors.filter(a => a.prop === i && (a.pose === 'sit' || a.pose === 'lie'));
    switch (pr.kind) {
      case 'bed': verbs.push('sleep'); break;
      case 'chair': if (p === 'cockpit' && seats.some(a => a.kind === 'pilot')) { verbs.push('fly'); break; } if (seats.length) verbs.push('sit'); break;
      case 'console': verbs.push('terminal'); break;
      case 'sofa': case 'table': if (seats.length) verbs.push('sit'); break;
      case 'bench': if (p === 'shopfloor-workshop') verbs.push('assemble'); else verbs.push('sit'); break;
      case 'counter':
        if (p === 'kitchen' || p === 'studio') verbs.push('cook');
        else if (p === 'shopfloor') verbs.push('sell', 'terminal');
        else verbs.push('terminal');
        break;
      case 'desk': verbs.push('terminal'); break;
      case 'machine': verbs.push(p === 'utility' ? 'wash' : 'fabricate'); break;
      case 'planter': verbs.push('water'); break;
    }
    const machineTray = pr.kind === 'machine' && p !== 'utility';
    const c = box || (machineTray ? { pool: 'none', restock: false, label: 'Output tray' } : null);
    if (c) verbs.push(c.shop ? 'buy' : 'open');
    if (pr.kind === 'bench' && p !== 'shopfloor-workshop' && seats.length === 0) { const k = verbs.indexOf('sit'); if (k >= 0) verbs.splice(k, 1); }
    if (verbs.length) out.push({ i, pr, room, verbs, box: c, seats, b });
  });
  cache.set(ck, out);
  return out;
}

// Whose it is: yours (your home), communal (shared rooms in a habitation block), or
// someone else's.
export function ownership(b, room, player) {
  if (b.type === 'ship') return b.ship.owner === 'you:' + player?.id ? { yours: true } : { owner: b.ship.ownerName };
  if (b.type === 'house') return b.key === player?.home ? { yours: true } : { owner: `the ${b.owner} household` };
  if (b.type === 'hab') {
    if (room?.unit === undefined) return { communal: true, owner: 'the residents' };
    return `${b.key}#u${room.unit}` === player?.homeUnit ? { yours: true } : { owner: `the household in apartment ${room.unit}` };
  }
  return { owner: b.owner };
}
export const shopOpen = (planet, b, t) => b.type === 'store' && (!b.hours || within(b.hours, solarHour(planet, t)));

// ---- containers
// Restocking stock (shops, other people's kitchens) is regenerated each week unless the
// box holds something of yours.
export function contents(store, planet, b, u, t, player = store.player) {
  const d = store.getDelta(boxKey(b.key, u.i));
  const restock = u.box.restock && !ownership(b, u.room, player).yours;
  const period = restock ? restockPeriod(planet, t) : 0;
  if (d && (!restock || d.period === period || d.items.some(it => it.own))) return d.items;
  return u.box.pool === 'none' ? [] : generatedContents(planet, b, u.i, u.box.pool, period);
}
function setContents(store, planet, b, u, t, items) {
  const restock = u.box.restock && !ownership(b, u.room, store.player).yours;
  store.patchDelta(boxKey(b.key, u.i), { period: restock ? restockPeriod(planet, t) : 0, items });
}
const addTo = (list, id, n, own) => {
  const out = list.map(x => ({ ...x }));
  const hit = out.find(x => x.id === id && !!x.own === !!own);
  if (hit) hit.n += n; else out.push(own ? { id, n, own: 1 } : { id, n });
  return out;
};
const removeFrom = (list, idx, n) => list.map((x, j) => j === idx ? { ...x, n: x.n - n } : { ...x }).filter(x => x.n > 0);

export const carryLimit = p => 18 + 14 * (p.fitness ?? 0.5);   // kg
export const inventoryOf = p => (p.inventory ??= []);
export function giveItem(p, id, n = 1) { p.inventory = addTo(inventoryOf(p), id, n).map(({ own, ...x }) => x); }
export function hasItems(p, need) { return Object.entries(need).every(([id, n]) => inventoryOf(p).filter(x => x.id === id).reduce((a, x) => a + x.n, 0) >= n); }
export function takeItems(p, need) {
  for (const [id, n0] of Object.entries(need)) {
    let n = n0;
    p.inventory = inventoryOf(p).map(x => { if (x.id !== id || n === 0) return x; const k = Math.min(n, x.n); n -= k; return { ...x, n: x.n - k }; }).filter(x => x.n > 0);
  }
}

// Take n of the idx-th entry. Returns { ok, why?, stolen?: value }.
export function take(ctx, b, u, idx, n, t) {
  const { store, planet } = ctx, p = store.player;
  const list = contents(store, planet, b, u, t), it = list[idx];
  if (!it) return { ok: false, why: 'It isn\'t there any more' };
  n = Math.min(n, it.n);
  if (massOf(inventoryOf(p)) + ITEMS[it.id].kg * n > carryLimit(p) + 1e-9) return { ok: false, why: 'You can\'t carry any more' };
  setContents(store, planet, b, u, t, removeFrom(list, idx, n));
  giveItem(p, it.id, n); store.touchPlayer();
  const own = ownership(b, u.room, p);
  const stolen = !it.own && !own.yours && !own.communal ? ITEMS[it.id].value * n : 0;
  return { ok: true, id: it.id, n, stolen };
}
// Put n of your idx-th inventory entry into the container. It stays yours.
export function put(ctx, b, u, idx, n, t) {
  const { store, planet } = ctx, p = store.player, it = inventoryOf(p)[idx];
  if (!it) return { ok: false };
  n = Math.min(n, it.n);
  setContents(store, planet, b, u, t, addTo(contents(store, planet, b, u, t), it.id, n, 1));
  p.inventory = removeFrom(p.inventory, idx, n); store.touchPlayer();
  return { ok: true, id: it.id, n };
}

// ---- shops
export function buy(ctx, b, u, idx, n, t) {
  const { store, planet } = ctx, p = store.player;
  if (!shopOpen(planet, b, t)) return { ok: false, why: 'The shop is closed' };
  const list = contents(store, planet, b, u, t), it = list[idx];
  if (!it) return { ok: false, why: 'Sold out' };
  n = Math.min(n, it.n);
  const cost = buyPrice(it.id) * n;
  if ((p.credits ?? 0) < cost) return { ok: false, why: `You need ${cost} cr` };
  if (massOf(inventoryOf(p)) + ITEMS[it.id].kg * n > carryLimit(p) + 1e-9) return { ok: false, why: 'You can\'t carry any more' };
  setContents(store, planet, b, u, t, removeFrom(list, idx, n));
  p.credits -= cost; giveItem(p, it.id, n); store.touchPlayer();
  return { ok: true, id: it.id, n, cost };
}
export function sell(ctx, b, idx, n, t) {
  const { store, planet } = ctx, p = store.player, it = inventoryOf(p)[idx];
  if (!shopOpen(planet, b, t)) return { ok: false, why: 'The shop is closed' };
  if (!it) return { ok: false };
  n = Math.min(n, it.n);
  const pay = sellPrice(it.id) * n;
  p.inventory = removeFrom(p.inventory, idx, n); p.credits = (p.credits ?? 0) + pay; store.touchPlayer();
  return { ok: true, id: it.id, n, pay };
}

// ---- eating and drinking
export function consume(p, idx) {
  const it = inventoryOf(p)[idx], fx = it && ITEMS[it.id].eat;
  if (!fx) return { ok: false };
  p.inventory = removeFrom(p.inventory, idx, 1);
  p.hunger = Math.max(0, Math.min(1, (p.hunger ?? 0.2) + (fx.hunger || 0)));
  p.fatigue = Math.max(0, Math.min(1, p.fatigue + (fx.fatigue || 0)));
  return { ok: true, id: it.id };
}

// ---- timed work: cook, fabricate, assemble, wash. The output lands in the prop's own box.
export function useState(store, b, u, t) {
  const d = store.getDelta(useKey(b.key, u.i));
  return d && d.until > t ? d : null;
}
export function startWork(ctx, b, u, verb, recipe, t) {
  const { store } = ctx, p = store.player;
  if (useState(store, b, u, t)) return { ok: false, why: 'It\'s already running' };
  if (verb === 'wash') {
    const until = t + WASH_MIN * MIN;
    store.patchDelta(useKey(b.key, u.i), { verb, until, by: p.id });
    store.schedule({ at: until, kind: 'use.done', target: useKey(b.key, u.i), data: { b: b.key, i: u.i, verb } });
    return { ok: true, until };
  }
  if (!hasItems(p, recipe.in)) return { ok: false, why: 'You don\'t have ' + Object.entries(recipe.in).map(([id, n]) => `${n} × ${ITEMS[id].name.toLowerCase()}`).join(', ') };
  if (recipe.tool && !hasItems(p, { [recipe.tool]: 1 })) return { ok: false, why: `You need a ${ITEMS[recipe.tool].name.toLowerCase()}` };
  takeItems(p, recipe.in); store.touchPlayer();
  const until = t + recipe.min * MIN;
  store.patchDelta(useKey(b.key, u.i), { verb, out: recipe.out, until, by: p.id });
  store.schedule({ at: until, kind: 'use.done', target: useKey(b.key, u.i), data: { b: b.key, i: u.i, verb, out: recipe.out } });
  return { ok: true, until };
}
export function registerUseJobs(sched) {
  sched.on('use.done', (job, ctx) => {
    const { store, planet, s, pop } = ctx, d = job.data;
    store.patchDelta(useKey(d.b, d.i), { until: undefined, verb: undefined, out: undefined, by: undefined, last: d.verb, lastAt: job.at });
    const b = pop.buildingByKey.get(d.b), u = b && usablesOf(planet, s, b).find(x => x.i === d.i);
    if (d.out && u?.box) setContents(store, planet, b, u, job.at, addTo(contents(store, planet, b, u, job.at), d.out, 1, 1));
    store.log({ t: job.at, type: 'made', verb: d.verb, item: d.out || null, who: store.player?.id, building: d.b, owner: b?.owner });
  });
}

// ---- plants
export function water(store, b, u, t) { store.patchDelta(useKey(b.key, u.i), { watered: t }); }
export function thirst(store, planet, b, u, t) {   // days since watered (unknown = generated: recently)
  const w = store.getDelta(useKey(b.key, u.i))?.watered;
  return w === undefined ? 0 : (t - w) / planet.dayLength;
}

// ---- lights: each room's light can be switched; default is on.
export const lightOn = (store, bKey, k, room) => store.getDelta(lightKey(bKey, k, room))?.on !== false;
export function toggleLight(store, bKey, k, room) {
  const on = !lightOn(store, bKey, k, room);
  store.patchDelta(lightKey(bKey, k, room), { on: on ? undefined : false });
  return on;
}

// ---- theft: one incident per container visit (main.js sums what you took)
export function reportTheft(ctx, b, room, value, items, t, witnesses) {
  const { store, s } = ctx, p = store.player, own = ownership(b, room, p);
  return store.log({ t, type: 'theft', building: b.key, buildingType: b.type, owner: own.owner || b.owner, settlement: s.key, settlementName: s.name,
    by: p.id, byName: p.name, value, items, witnesses, shop: b.type === 'store', status: 'unresolved' });
}
