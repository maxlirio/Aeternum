// A new character: an ordinary resident of the spawn settlement. Their family are
// real residents of the town (gen/population.js); the character is added to the world
// as part of the save, not by changing generation.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { givenName } from './names.js';

export function newCharacter(universeSeed, planet, s, pop, serial, t) {
  const rng = new Rng(derive(universeSeed, 'character', [serial]));
  // parents: a household with at least one adult old enough to be a parent of a 19+ year old
  const candidates = pop.households.filter(h => h.members.some(id => pop.byId.get(id).age >= 39));
  const hh = rng.pick(candidates);
  const members = hh.members.map(id => pop.byId.get(id));
  const eldest = Math.max(...members.map(m => m.age));
  const age = rng.int(19, Math.max(19, Math.min(46, eldest - 18)));
  const parents = members.filter(m => m.age >= age + 18 && m.role === 'adult');
  const siblings = members.filter(m => m.role === 'child' || (m.role === 'adult' && m.age < age + 14 && !parents.includes(m)));
  const parentsUnit = pop.unitByKey.get(hh.unit);
  // where you live: young adults often still live with their parents
  const vacant = pop.units.filter(u => u.household === null && u.capacity > 0);
  const spare = parentsUnit.capacity > members.length;
  let unit = parentsUnit, withParents = true;
  if (!(age < 25 && spare && rng.chance(0.65)) && vacant.length) { unit = rng.pick(vacant); withParents = false; }
  const given = givenName(rng);
  return {
    id: 'c' + serial, serial, given, surname: hh.surname, name: `${given} ${hh.surname}`, age,
    birthplace: s.key, birthplaceName: s.name, planetName: planet.name,
    home: unit.b.key, homeUnit: unit.key, withParents,
    keys: [unit.b.key, unit.key, parentsUnit.b.key, parentsUnit.key].filter((k, i, a) => a.indexOf(k) === i),
    family: { household: hh.id, parents: parents.map(m => m.id), siblings: siblings.map(m => m.id) },
    job: null, applications: [], career: [],
    skills: startingSkills(universeSeed, serial, age),
    credits: Math.round(rng.range(250, 2200) / 10) * 10, record: [], fines: [], warrant: null, custody: null,
    fatigue: 0.15 + rng.next() * 0.2, fitness: 0.2 + rng.next() * 0.3,
    pos: null, facing: 0, activity: null, created: t,
  };
}

// What schooling and odd jobs left you with: one thing you're decent at, the rest a little.
export function startingSkills(universeSeed, serial, age) {
  const rng = new Rng(derive(universeSeed, 'skills', [serial]));
  const keys = ['admin', 'trade', 'tech'], best = rng.pick(keys), years = Math.min(1, (age - 18) / 20);
  const out = {};
  for (const k of keys) out[k] = Math.round((k === best ? rng.range(0.28, 0.5) : rng.range(0.03, 0.22)) * (0.8 + 0.4 * years) * 100) / 100;
  return out;
}
