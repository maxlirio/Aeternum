// Procedural proper names. Syllable grammar, deterministic from an Rng.
const ON = ['k','t','v','s','m','n','r','d','th','br','kr','st','h','l','z','sh','dr','g','p','f','tr','c','j','y'];
const NU = ['a','e','i','o','u','ae','ei','ia','ou','y','ar','or','en','al'];
const CO = ['n','r','s','th','l','x','m','nd','rk','st','sk','v','',''];

function word(rng, minS, maxS) {
  const n = rng.int(minS, maxS); let s = '';
  for (let i = 0; i < n; i++) s += (i === 0 || rng.chance(0.7) ? rng.pick(ON) : '') + rng.pick(NU) + (i === n - 1 || rng.chance(0.3) ? rng.pick(CO) : '');
  return s[0].toUpperCase() + s.slice(1);
}
export const planetName = rng => word(rng, 2, 3) + (rng.chance(0.3) ? ' ' + rng.pick(['Prime', 'II', 'III', 'IV', 'Minor']) : '');
export const placeName = rng => rng.chance(0.3)
  ? `${rng.pick(['New ', 'Port ', 'Fort ', 'Camp ', ''])}${word(rng, 2, 3)}`
  : word(rng, 2, 3) + rng.pick(['', '', ' Landing', ' Station', ' Reach', ' Crossing', ' Hold']);
export const personName = rng => `${word(rng, 1, 2)} ${word(rng, 2, 3)}`;
export const companyName = rng => `${word(rng, 2, 2)} ${rng.pick(['Logistics', 'Fabrication', 'Holdings', 'Provisions', 'Mining Co.', 'Freight', 'Works', 'Supply', 'Systems'])}`;
export const givenName = rng => word(rng, 1, 2);
export const surname = rng => word(rng, 2, 3);
export const streetSuffix = rng => rng.pick(['Street', 'Street', 'Avenue', 'Way', 'Row', 'Lane', 'Road']);
export const streetWord = rng => word(rng, 1, 2);
