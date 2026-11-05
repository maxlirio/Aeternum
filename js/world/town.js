// The town as it is now: the generated population (gen/population.js, the town at the
// universe's epoch) with everything that has happened to its people since laid over it.
// Like doors, nothing generated is stored — only what changed:
//   life/<settlement>  { people: {id: patch | new person}, hh: {id: household}, serial, nextHH }
//   job/<id>           { holder, since, takenAt?, vacatedAt? }   (also used for the player)
// Who lives where comes from households (a household has a unit and an ordered member
// list); beds follow member order like generation; a person's job is whichever job
// names them as holder. livePopulation() returns one object per store that keeps its
// identity — refreshLife() rewrites its fields in place, so everything holding `pop`
// (residents, law, work, the UI) sees the change.
import { getPopulation } from '../gen/population.js';
import { getSettlement } from '../gen/settlement.js';
import { getPolity } from '../gen/polity.js';
import { buildingPlan } from '../gen/building.js';
import { doorstep } from '../gen/place.js';
import { hash01, hashStr } from '../core/hash.js';
import { EPOCH } from '../sim/clock.js';

const lives = new WeakMap();      // store → Map(settlement key → live population)

export function livePopulation(planet, s, store, t) {
  let m = lives.get(store);
  if (!m) lives.set(store, m = new Map());
  let pop = m.get(s.key);
  if (!pop) { pop = { ...getPopulation(planet, s) }; pop.base = getPopulation(planet, s); pop.made = new Map(); m.set(s.key, pop); refreshLife(pop, store, t); }
  return pop;
}

// The same context, in another town: its people and its law. (A job running there; you, visiting.)
export function townContext(ctx, [rx, rz]) {
  const { planet, store } = ctx, s = getSettlement(planet, rx, rz); if (!s || s === ctx.s) return ctx;
  const pop = livePopulation(planet, s, store, store.meta.gameTime);
  return { ...ctx, s, pop, polity: getPolity(planet, s), doorstepOf: bKey => { const b = pop.buildingByKey.get(bKey); return doorstep(s, b, buildingPlan(planet, s, b)).pos; } };
}

export const lifeKey = s => `life/${s.key}`;
export const YEAR = planet => planet.yearLength;
// Generated ages are as at the epoch; birthdays are spread through the year.

// The holder of a job: a delta (player or resident hired, or the post vacated) beats generation.
export const jobKey = j => j.dk || (j.dk = `job/${j.id}`);
export function holderOf(store, j, base = j.holder) {
  const d = store.getDelta(jobKey(j));
  return d && 'holder' in d ? d.holder : base;
}

export function refreshLife(pop, store, t = EPOCH) {
  const base = pop.base, L = store.getDelta(lifeKey(base.s)) || {}, P = L.people || {}, H = L.hh || {};
  const pl = store.player;
  // households: generated ones, replaced wholesale by any stored record, plus new ones
  const hhs = base.households.map(h => H[h.id] || h).concat(Object.keys(H).map(Number).filter(id => id >= base.households.length).sort((a, b) => a - b).map(id => H[id]));
  const live = hhs.filter(h => !h.gone && h.unit);
  pop.households = live;
  pop.householdById = new Map(hhs.map(h => [h.id, h]));
  // units: which household (if any) lives there now; the player's own home counts as lived in
  const unitHH = new Map(live.map(h => [h.unit, h.id]));
  if (!pop.unitByKey || pop.unitByKey === base.unitByKey) { pop.units = base.units.map(u => ({ ...u })); pop.unitByKey = new Map(pop.units.map(u => [u.key, u])); }
  for (const u of pop.units) { u.household = unitHH.get(u.key) ?? null; u.player = !!pl && pl.homeUnit === u.key; }
  // jobs: holders from deltas
  pop.jobs = base.jobs.map(j => { const h = holderOf(store, j); return h === j.holder ? j : { ...j, holder: h }; });
  pop.jobById = new Map(pop.jobs.map(j => [j.id, j]));
  const jobOf = new Map(pop.jobs.filter(j => j.holder).map(j => [j.holder, j.id]));
  // people: generated + new, each placed by their household; anyone gone is kept for lookups.
  // A person's object is only rebuilt when something about them changed, so day plans
  // (cached per person revision, gen/schedule.js) survive a refresh.
  const where = new Map();
  for (const h of live) h.members.forEach((id, i) => where.set(id, { h, i }));
  const byId = new Map(), people = [], Y = YEAR(pop.planet);
  const one = (id, gen, patch) => {
    let m = pop.made.get(id);
    if (!m) pop.made.set(id, m = { born: gen ? EPOCH - (gen.age + hash01(pop.planet.universeSeed, [hashStr(29, id)])) * Y : patch.born });
    const w = where.get(id), job = jobOf.get(id) || null, age = Math.max(0, Math.floor((t - m.born) / Y));
    const unitKey = w?.h.unit, slot = w?.i;     // (household records are updated in place: compare values)
    if (!(m.p && m.patch === patch && m.unit === unitKey && m.slot === slot && m.p.job === job && m.p.age === age)) {
      const src = gen ? { ...gen, age0: gen.age, ...(patch || {}) } : { ...patch };
      const p = { ...src, age, job, born: m.born };
      const unit = w && pop.unitByKey.get(w.h.unit);
      if (unit) { p.household = w.h.id; p.home = unit.key; p.homeB = unit.b.key; p.bed = bedSlots(unit)[w.i] || bedSlots(unit)[0]; }
      else if (!p.gone) p.gone = { t, why: 'moved away' };      // safety: nobody lives nowhere
      p.rev = `${p.home}|${w?.i}|${job}|${age}`;
      Object.assign(m, { p, patch, unit: unitKey, slot });
    }
    byId.set(id, m.p);
    if (!m.p.gone) people.push(m.p);
  };
  for (const g of base.people) one(g.id, g, P[g.id]);
  for (const id of L.added || []) one(id, null, P[id]);
  pop.people = people; pop.byId = byId; pop.at = t;
  return pop;
}

export function bedSlots(unit) {
  const slots = [];
  for (const bed of unit.beds) for (let k = 0; k < bed.a.slots; k++) slots.push({ anchor: bed.i, slot: k });
  return slots;
}
