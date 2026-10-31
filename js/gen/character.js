// A new character: an ordinary resident of the spawn settlement, generated from the
// universe seed and a serial number (each life in a universe gets the next serial).
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { personName } from './names.js';

export function newCharacter(universeSeed, planet, s, serial, t) {
  const rng = new Rng(derive(universeSeed, 'character', [serial]));
  const homes = s.buildings.filter(b => b.type === 'hab' || b.type === 'house');
  const home = rng.pick(homes);
  return {
    id: 'c' + serial, serial, name: personName(rng), age: rng.int(19, 46),
    birthplace: s.key, birthplaceName: s.name, planetName: planet.name,
    home: home.key, keys: [home.key],
    occupation: null,                 // careers are not simulated yet (see docs/STATUS.md)
    fatigue: 0.15 + rng.next() * 0.2, fitness: 0.2 + rng.next() * 0.3,
    pos: null, facing: 0, activity: null, created: t,
  };
}
