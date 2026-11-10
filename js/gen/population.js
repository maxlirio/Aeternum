// The people of a settlement, generated from its buildings. Pure and cached: the same
// town always has the same households, names, ages, jobs and beds.
//
//   units      — dwellings (a house, or one apartment floor of a habitation block)
//   households — who lives in a unit (some units are vacant)
//   people     — residents with a home unit, a bed slot and maybe a job
//   jobs       — one per work anchor (desk, counter, bench…) in a workplace, with hours
//
// Nothing here is stored. Changes to people (moving out, dying, being hired) will be
// deltas over this, like everything else.
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { buildingPlan } from './building.js';
import { givenName, surname } from './names.js';
import { getPolity } from './polity.js';
import { holdingCell } from './custody.js';
import { townSociety } from './society.js';
import { gangsOf } from './gangs.js';
import { INDUSTRIES } from './genome.js';
// A town's works are its industry's (gen/society.js): a crystal town's workshops cut crystal, a fishing port's are its boat sheds.
function industryJob(type, soc) {
  if (!soc || (type !== 'workshop' && type !== 'hangar')) return null; const I = INDUSTRIES[soc.industry]; if (!I) return null; const J = I.jobs;
  if (type === 'workshop') return { work: { title: J[0], hours: [[6, 15]] }, machine: J[1] !== J[J.length - 1] ? J[1] : null, head: J[J.length - 1] };
  return J.length > 3 ? { work: { title: J[2], hours: [[6, 14], [14, 22]] }, head: 'Hangar chief' } : null;
}

const JOB = {
  office: { work: { title: 'Clerk', hours: [[8, 17]] }, head: 'Office manager' },
  store: { work: { title: 'Shopkeeper', hours: [[7, 14], [14, 21]] }, head: 'Store owner' },
  workshop: { work: { title: 'Fabricator', hours: [[6, 15]] }, machine: 'Machinist', head: 'Workshop foreman' },
  hangar: { work: { title: 'Ground crew', hours: [[6, 14], [14, 22]] }, head: 'Hangar chief' },
};

const cache = new Map();
export function getPopulation(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (!cache.has(ck)) cache.set(ck, generate(planet, s));
  return cache.get(ck);
}

function generate(planet, s) {
  const seed = derive(s.address.seed(planet.universeSeed), 'population');
  const rng = new Rng(seed);
  const pop = { planet, s, units: [], households: [], people: [], jobs: [], byId: new Map(), unitByKey: new Map() };

  // ---- dwellings
  for (const b of s.buildings) {
    if (b.type !== 'hab' && b.type !== 'house') continue;
    const plan = buildingPlan(planet, s, b);
    for (const u of plan.units) {
      const anchors = plan.anchors.map((a, i) => ({ a, i })).filter(({ a }) => a.unit === u.id);
      const beds = anchors.filter(({ a }) => a.kind === 'sleep');
      const unit = { key: `${b.key}#u${u.id}`, b, plan, id: u.id, anchors, beds, capacity: beds.reduce((n, x) => n + x.a.slots, 0), household: null };
      pop.units.push(unit); pop.unitByKey.set(unit.key, unit);
    }
  }

  // ---- households
  for (const unit of pop.units) {
    if (!unit.capacity || rng.chance(0.12)) continue;          // vacant
    const name = surname(rng);
    const kind = rng.weighted([['single', 3], ['couple', 3], ['family', unit.capacity >= 3 ? 4 : 0], ['parent', unit.capacity >= 2 ? 1.5 : 0], ['elders', 1.2]]);
    const hh = { id: pop.households.length, unit: unit.key, surname: name, kind, members: [] };
    unit.household = hh.id;
    const adult = (lo, hi) => ({ age: rng.int(lo, hi), role: 'adult' });
    let members;
    switch (kind) {
      case 'single': members = [adult(19, 78)]; break;
      case 'couple': { const a = adult(21, 70); members = [a, { age: Math.max(19, a.age + rng.int(-6, 6)), role: 'adult' }]; break; }
      case 'elders': { const a = adult(64, 86); members = [a, { age: Math.max(60, a.age + rng.int(-5, 5)), role: 'adult' }]; break; }
      case 'parent': case 'family': {
        const a = adult(26, 52), adults = kind === 'family' ? [a, { age: Math.max(22, a.age + rng.int(-5, 5)), role: 'adult' }] : [a];
        const youngest = Math.min(...adults.map(x => x.age)) - 18;
        const kids = Math.max(1, Math.min(unit.capacity - adults.length, rng.int(1, 3)));
        members = [...adults];
        for (let i = 0; i < kids; i++) members.push({ age: Math.max(0, Math.min(youngest, rng.int(0, 22))), role: 'child' });
      }
    }
    members = members.slice(0, unit.capacity);
    // beds: adults share double beds first, children take the rest
    const slots = [];
    for (const bed of unit.beds) for (let k = 0; k < bed.a.slots; k++) slots.push({ anchor: bed.i, slot: k });
    members.forEach((m, i) => {
      const p = {
        id: `${unit.key}/p${i}`, given: givenName(rng), surname: name, age: m.age, role: m.role,
        household: hh.id, home: unit.key, homeB: unit.b.key, bed: slots[i], job: null,
        seed: [hashStr(seed[0], unit.key + i), hashStr(seed[1], unit.key + i)],
        offDays: [rng.int(0, 6), rng.int(0, 6)], wakeBias: rng.range(-0.6, 0.6), social: rng.next(),
      };
      p.name = `${p.given} ${p.surname}`;
      hh.members.push(p.id); pop.people.push(p); pop.byId.set(p.id, p);
    });
    pop.households.push(hh);
  }

  // ---- jobs (one per work anchor in a workplace; some anchors run two shifts)
  const soc = townSociety(planet, s), polity = getPolity(planet, s), securityHQ = polity.security, cellRoom = holdingCell(planet, s, polity)?.room.i;
  for (const b of s.buildings) {
    const J = industryJob(b.type, soc) || JOB[b.type];
    if (!J) continue;
    const plan = buildingPlan(planet, s, b);
    // (the holding cell in the security office is nobody's office)
    const work = plan.anchors.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'work' && !(b.key === securityHQ && a.room === cellRoom));
    work.forEach(({ a, i }, n) => {
      const prop = plan.props[a.prop];
      if (b.key === securityHQ) { // the security office runs day and evening shifts, mostly on patrol
        for (const hours of [[6, 14], [14, 22]]) pop.jobs.push({ id: `${b.key}/job${pop.jobs.length}`, b: b.key, bType: b.type, employer: polity.securityName, anchor: i, title: n === 0 ? 'Security chief' : 'Security officer', hours, holder: null, security: true, patrol: n !== 0 });
        return;
      }
      const title = n === 0 ? J.head : prop?.kind === 'machine' && J.machine ? J.machine : J.work.title;
      for (const hours of J.work.hours) pop.jobs.push({ id: `${b.key}/job${pop.jobs.length}`, b: b.key, bType: b.type, employer: b.owner, anchor: i, title, hours, holder: null });
    });
  }

  // ---- employment: working-age adults, in a shuffled order, take open jobs
  const candidates = rng.shuffle(pop.people.filter(p => p.age >= 18 && p.age <= 66));
  // taken from the end: security first, then each workplace's head, then everyone else
  const isHead = j => j.title === JOB[j.bType]?.head || j.title === industryJob(j.bType, soc)?.head;
  // a town keeps a security force in proportion to its size (chief + officers); spare posts stay open
  const chief = j => j.title === 'Security chief', sec = pop.jobs.filter(j => j.security);
  const force = sec.filter(j => !chief(j)).slice(0, Math.max(2, Math.round(candidates.length * 0.07)) - 2).concat(sec.filter(chief));
  // ordinary jobs are filled a desk per workplace at a time, so a short-handed town still staffs every place
  const nth = new Map(), spread = rng.shuffle(pop.jobs.filter(j => !j.security && !isHead(j)))
    .map(j => { const r = nth.get(j.b) || 0; nth.set(j.b, r + 1); return [j, r]; }).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const open = spread.concat(rng.shuffle(pop.jobs.filter(j => !j.security && isHead(j))), force);
  for (const p of candidates) {
    if (!open.length) break;
    if (!rng.chance(p.age < 22 ? 0.6 : 0.85)) continue;
    // running a place takes some years: a young candidate takes the next ordinary job instead
    let k = open.length - 1;
    if (p.age < 30) while (k >= 0 && (isHead(open[k]) || open[k].title === 'Security chief')) k--;
    if (k < 0) continue;
    const [j] = open.splice(k, 1); j.holder = p.id; p.job = j.id;
  }
  pop.jobById = new Map(pop.jobs.map(j => [j.id, j]));
  pop.buildingByKey = new Map(s.buildings.map(b => [b.key, b]));
  // the town's crews (gen/gangs.js): who's in one, looked up by the day plans
  { let G = null; pop.gangOf = id => (G ||= gangsOf(planet, s, pop)).find(q => q.members.includes(id)) || null; }
  return pop;
}

export function occupation(pop, p) {
  if (p.job) { const j = pop.jobById.get(p.job); return `${j.title}, ${j.employer}`; }
  if (p.age < 18) return p.age < 6 ? 'Child' : 'Student';
  if (p.age >= 67) return 'Retired';
  return 'Unemployed';
}
