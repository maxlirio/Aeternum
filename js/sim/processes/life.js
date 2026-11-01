// Residents' lives over time, as one dormant-tier job per planet day (life.day, at
// midnight, while everyone is in bed). Each day every resident and household rolls
// against yearly rates, from a hash of (who, day, what) — so a day's outcome depends
// only on the town as it stood that midnight, and a month away is the same 30 days
// whether it's caught up in one jump or lived through. Everything lands in deltas
// (world/town.js); the generated town is never rewritten.
//
//   death     Gompertz hazard by age          birth      couples 20–44 with a spare bed
//   retire    at 67                            quit       ~1 in 10 a year
//   job hunt  unemployed adults take a posted opening (the same weekly postings you see)
//   leave home  grown children find a place of their own, or leave town
//   move      households move within town, or away; newcomers move into empty homes
import { Rng } from '../../core/prng.js';
import { derive, hash01, hashStr } from '../../core/hash.js';
import { givenName, surname as surnameOf } from '../../gen/names.js';
import { dayIndex, dayStart } from '../../gen/schedule.js';
import { vacancies, ROLES } from '../../gen/careers.js';
import { refreshLife, lifeKey, bedSlots } from '../../world/town.js';
import { address } from '../../gen/settlement.js';

export const RATE = { quit: 0.1, seek: 4, birth: 0.2, move: 0.05, leave: 0.025, fledge: 0.3, arrive: 0.35 };   // per planet year
export const RETIRE = 67;
export const LOOKING = 0.88;      // share of working-age adults who look for work when they have none
export const mortality = age => 0.00012 * Math.exp(0.088 * age);   // per year: 0.2% at 30, 2.4% at 60, 14% at 80

// The first life.day after t. Days already past when a save began aren't replayed:
// the generated town is how things stood when the universe's clock started.
export function scheduleLife(store, planet, s, t) {
  if (store.jobs.some(j => j.kind === 'life.day' && j.target === lifeKey(s))) return;
  const D = dayIndex(planet, t) + 1;
  store.schedule({ at: dayStart(planet, D), kind: 'life.day', target: lifeKey(s), data: { D } });
}

export function registerLifeJobs(sched) {
  sched.on('life.day', (job, ctx) => {
    const { store, planet, pop } = ctx;
    if (pop?.base) liveDay(ctx, pop, job.at, job.data.D);
    store.schedule({ at: dayStart(planet, job.data.D + 1), kind: 'life.day', target: job.target, data: { D: job.data.D + 1 } });
  });
}

// How someone in town is related to the player, for the report ('' = a stranger).
export function relationTo(pl, p) {
  if (!pl || !p) return '';
  if (pl.family?.parents.includes(p.id)) return 'your parent';
  if (pl.family?.siblings.includes(p.id)) return 'your sibling';
  if (p.home && p.home === pl.homeUnit) return 'who lives with you';
  if (pl.job && p.job && p.jobB === pl.job.b) return 'a coworker';
  if (p.homeB && p.homeB === pl.home) return 'a neighbour';
  return '';
}

const ids = new Map(), whats = new Map();
const idHash = id => { let h = ids.get(id); if (h === undefined) { if (ids.size > 50000) ids.clear(); ids.set(id, h = hashStr(31, String(id))); } return h; };
const whatHash = w => { let h = whats.get(w); if (h === undefined) whats.set(w, h = hashStr(37, w)); return h; };

// A home as people say it: "14 Kor Street", or "Apt 3, 2 Vel Row".
export function homeName(pop, unitKey) {
  const u = pop.unitByKey.get(unitKey); if (!u) return 'somewhere in town';
  return u.b.type === 'house' ? address(pop.s, u.b) : `Apt ${u.id}, ${address(pop.s, u.b)}`;
}
export const LIFE_EVENTS = ['died', 'born', 'resident_hired', 'resident_quit', 'resident_retired', 'left_home', 'moved_away', 'household_moved', 'household_left', 'household_arrived', 'children_left'];

export function liveDay(ctx, pop, t, D) {
  const { store, planet } = ctx, U = planet.universeSeed, pl = store.player;
  refreshLife(pop, store, t);
  const k = planet.dayLength / planet.yearLength;
  const roll = (id, what) => hash01(U, [idHash(id), D, whatHash(what)]);
  const chance = rate => 1 - Math.exp(-rate * k);
  const L = store.getDelta(lifeKey(pop.s)) || {};     // updated in place; patchDelta below marks it dirty
  L.people ??= {}; L.hh ??= {}; L.added ??= []; L.serial ??= 0; L.nextHH ??= pop.base.households.length;
  const H = id => (L.hh[id] ??= JSON.parse(JSON.stringify(pop.householdById.get(id))));
  const P = id => (L.people[id] = { id, ...L.people[id] });   // copied on write: refreshLife spots changes by identity
  const gone = new Set(), claimed = new Set(), filled = new Set();
  const person = id => pop.byId.get(id) || { ...L.people[id], age: 0 };     // (or someone born today)
  const jobB = p => p.job ? pop.jobById.get(p.job).b : null;
  const log = (type, p, extra = {}) => store.log({ t, type, who: p?.id, whoName: p?.name, age: p?.age, rel: relationTo(pl, p && { ...p, jobB: jobB(p) }), ...extra });
  const vacate = (p, why, type) => {
    if (!p.job || filled.has(p.job)) return;
    const j = pop.jobById.get(p.job);
    store.patchDelta(`job/${j.id}`, { holder: null, since: undefined, vacatedAt: t });
    if (type) log(type, p, { title: j.title, employer: j.employer, why });
  };
  const leaveHousehold = p => { const h = H(p.household); h.members = h.members.filter(id => id !== p.id); return h; };
  const emptyHomes = (min = 1) => pop.units.filter(u => u.household === null && !u.player && !claimed.has(u.key) && bedSlots(u).length >= min);
  const pickHome = (id, what, min) => {
    const homes = emptyHomes(min);
    if (!homes.length) return null;
    // smaller households look at smaller homes first
    homes.sort((a, b) => (bedSlots(a).length - bedSlots(b).length) || (a.key < b.key ? -1 : 1));
    const fit = homes.slice(0, Math.max(3, Math.ceil(homes.length / 2)));
    return fit[Math.floor(roll(id, what + ':where') * fit.length)];
  };
  const goes = (p, why) => { P(p.id).gone = { t, why }; gone.add(p.id); };
  const livesWithYou = h => !!pl && h.unit === pl.homeUnit;

  // ---- deaths
  for (const p of pop.people) {
    if (roll(p.id, 'die') >= chance(mortality(p.age))) continue;
    goes(p, 'died'); leaveHousehold(p); vacate(p);
    log('died', p, { b: p.homeB, title: p.job ? pop.jobById.get(p.job).title : null });
  }
  // a household left with nobody, or only children, is no longer a household here
  for (const h of pop.households) {
    if (!L.hh[h.id]) continue;
    const left = L.hh[h.id].members.map(person);
    if (left.length && left.some(m => m.age >= 18)) continue;
    L.hh[h.id].gone = { t, why: left.length ? 'moved in with relatives' : 'died out' };
    for (const m of left) { goes(m, 'moved in with relatives'); vacate(m); }
    if (left.length) log('children_left', left[0], { surname: h.surname, n: left.length });
  }
  const alive = pop.people.filter(p => !gone.has(p.id));

  // ---- work: retirement, quitting, then the unemployed look at this week's postings
  for (const p of alive) {
    if (!p.job) continue;
    if (p.age >= RETIRE) vacate(p, 'retired', 'resident_retired');
    else if (roll(p.id, 'quit') < chance(RATE.quit)) vacate(p, 'moved on', 'resident_quit');
  }
  for (const p of alive) {
    if (p.job || p.age < 18 || p.age >= RETIRE || roll(p.id, 'seek') >= chance(RATE.seek)) continue;
    if (hash01(U, [idHash(p.id), 7]) > LOOKING) continue;          // some adults aren't after a job (caring, studying, getting by)
    const posts = vacancies(pop, store, t, j => !filled.has(j.id) && !(ROLES[j.title]?.senior && p.age < 30)
      && !(j.title === 'Security chief' && p.age < 30));
    if (!posts.length) continue;
    const j = posts[Math.floor(roll(p.id, 'which') * posts.length)];
    filled.add(j.id);
    store.patchDelta(`job/${j.id}`, { holder: p.id, since: t, takenAt: t, vacatedAt: undefined });
    log('resident_hired', p, { title: j.title, employer: j.employer, b: j.b, job: j.id });
  }

  // ---- births
  for (const h of pop.households) {
    if (L.hh[h.id]?.gone) continue;
    const ms = (L.hh[h.id] || h).members.map(person);
    const parents = ms.filter(m => m.age >= 20 && m.age <= 44 && m.role === 'adult');
    if (parents.length < 2 || ms.some(m => m.age < 1)) continue;
    const unit = pop.unitByKey.get(h.unit);
    if (bedSlots(unit).length <= ms.length + (livesWithYou(h) ? 1 : 0)) continue;
    if (roll(h.id, 'birth') >= chance(RATE.birth)) continue;
    const baby = newPerson(U, `${h.unit}/n${L.serial++}`, D, h.surname, t, 'child');
    L.people[baby.id] = baby; L.added.push(baby.id); H(h.id).members.push(baby.id);
    log('born', { ...baby, name: baby.name, age: 0 }, { parents: parents.map(m => m.name), b: unit.b.key, rel: parents.some(m => relationTo(pl, m)) ? 'in your family' : '' });
  }

  // ---- grown children set up on their own
  for (const p of alive) {
    if (p.role !== 'child' || p.age < 19 || roll(p.id, 'fledge') >= chance(RATE.fledge)) continue;
    const from = p.home, home = pickHome(p.id, 'fledge', 1);
    leaveHousehold(p); P(p.id).role = 'adult';
    if (home) {
      claimed.add(home.key);
      const id = L.nextHH++;
      L.hh[id] = { id, unit: home.key, surname: p.surname, kind: 'single', members: [p.id] };
      log('left_home', p, { from, to: home.key, toName: homeName(pop, home.key) });
    } else { goes(p, 'moved away'); vacate(p); log('moved_away', p, { from }); }
  }

  // ---- households move house, or leave town (not one you live in: they'd leave you behind)
  for (const h of pop.households) {
    const cur = L.hh[h.id] || h;
    if (cur.gone || livesWithYou(cur) || !cur.members.length) continue;
    const ms = cur.members.map(person).filter(m => !gone.has(m.id));
    if (roll(h.id, 'leave') < chance(RATE.leave)) {
      H(h.id).gone = { t, why: 'moved away' };
      for (const m of ms) { goes(m, 'moved away'); vacate(m); }
      log('household_left', ms[0], { surname: cur.surname, n: ms.length, from: cur.unit, rel: ms.map(m => relationTo(pl, m)).find(Boolean) || '' });
    } else if (roll(h.id, 'move') < chance(RATE.move)) {
      const home = pickHome(h.id, 'move', ms.length);
      if (!home || home.key === cur.unit) continue;
      claimed.add(home.key);
      const from = cur.unit;
      H(h.id).unit = home.key;
      log('household_moved', ms[0], { surname: cur.surname, n: ms.length, from, to: home.key, toName: homeName(pop, home.key), rel: ms.map(m => relationTo(pl, m)).find(Boolean) || '' });
    }
  }

  // ---- newcomers take empty homes
  for (const u of emptyHomes(1)) {
    if (roll(u.key, 'arrive') >= chance(RATE.arrive)) continue;
    claimed.add(u.key);
    const rng = new Rng(derive(U, 'arrival', [hashStr(41, u.key), D]));
    const sur = surnameOf(rng), cap = bedSlots(u).length;
    const kind = rng.weighted([['single', 4], ['couple', 3], ['family', cap >= 3 ? 3 : 0]]);
    const a = rng.int(20, 58);
    const ages = kind === 'single' ? [a] : kind === 'couple' ? [a, Math.max(19, a + rng.int(-6, 6))]
      : [Math.min(a, 48), Math.max(21, Math.min(a, 48) + rng.int(-5, 5)), ...Array.from({ length: Math.min(cap - 2, rng.int(1, 2)) }, () => rng.int(0, Math.min(a, 48) - 20))];
    const id = L.nextHH++, members = [];
    ages.slice(0, cap).forEach((age, i) => {
      const p = newPerson(U, `${u.key}/n${L.serial++}`, D, sur, t - (age + rng.next()) * planet.yearLength, kind === 'family' && i >= 2 ? 'child' : 'adult');
      L.people[p.id] = p; L.added.push(p.id); members.push(p.id);
    });
    L.hh[id] = { id, unit: u.key, surname: sur, kind, members, arrived: t };
    log('household_arrived', null, { surname: sur, n: members.length, to: u.key, toName: homeName(pop, u.key), kind, rel: pl && u.b.key === pl.home ? 'your new neighbours' : '' });
  }

  store.patchDelta(lifeKey(pop.s), L);
  refreshLife(pop, store, t);
}

// A resident who didn't exist at the epoch (born here, or moved in), with the same fields
// generation gives everyone, from their own seed.
function newPerson(U, id, D, sur, born, role) {
  const seed = derive(U, 'resident', [hashStr(43, id)]), rng = new Rng(seed);
  const given = givenName(rng);
  return { id, given, surname: sur, name: `${given} ${sur}`, born, role, seed,
    offDays: [rng.int(0, 6), rng.int(0, 6)], wakeBias: rng.range(-0.6, 0.6), social: rng.next(), since: D };
}
