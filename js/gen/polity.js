// The local authority of a settlement: who makes and enforces the rules, how strict
// they are, and where its security office is. Pure, from the settlement seed.
// Laws are data — later polities (nations, corporations) will supply different tables.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';

const cache = new Map();
export function getPolity(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const rng = new Rng(derive(s.address.seed(planet.universeSeed), 'polity'));
  // the administration building nearest the centre houses Civic Security
  const offices = s.buildings.filter(b => b.type === 'office').map(b => [b, Math.hypot((b.rect[0] + b.rect[2]) / 2, (b.rect[1] + b.rect[3]) / 2)]).sort((a, c) => a[1] - c[1]);
  const strict = rng.range(0.7, 1.5);
  const polity = {
    name: rng.pick([`${s.name} Civic Authority`, `Council of ${s.name}`, `${s.name} Municipal Board`]),
    security: offices[0]?.[0].key || null,
    securityName: `${s.name} Civic Security`,
    strictness: strict,
    currency: 'cr',
    // offence → base fine (credits) and whether it goes on your record
    laws: {
      forced_entry_home: { label: 'Breaking into a home', fine: Math.round(900 * strict / 10) * 10, record: true },
      forced_entry_business: { label: 'Breaking into business premises', fine: Math.round(600 * strict / 10) * 10, record: true },
      forced_entry_restricted: { label: 'Forcing a restricted door', fine: Math.round(250 * strict / 10) * 10, record: true },
    },
    reportRate: rng.range(0.45, 0.8),        // chance a civilian witness reports
    evidenceRate: rng.range(0.08, 0.25),     // chance an unwitnessed case gets solved
  };
  cache.set(ck, polity);
  return polity;
}

export function offenceFor(incident) {
  if (incident.buildingType === 'hab' || incident.buildingType === 'house') return 'forced_entry_home';
  return incident.access === 'staff' && incident.doorKind === 'interior' ? 'forced_entry_restricted' : 'forced_entry_business';
}
