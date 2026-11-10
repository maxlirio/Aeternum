// The local authority of a settlement: who makes and enforces the rules, how strict
// they are, and where its security office is. Pure, from the settlement seed.
// Laws are data — later polities (nations, corporations) will supply different tables.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { townSociety } from './society.js';
// the authority and its enforcers, by the form of government (gen/genome.js GOVERNMENTS); the town's name or its nation's in them
const FORMS = {
  charter: (t, n) => [`${n} Company, ${t} Office`, `${n} Company Security`], guild: t => [`Guilds of ${t}`, `${t} Guild Watch`], council: t => [`Council of ${t}`, `${t} Civic Security`],
  house: (t, n) => [`House ${n}, ${t} Seat`, `House ${n} Guard`], junta: (t, n) => [`${n} Military Authority, ${t}`, `${n} Military Police`], temple: t => [`Temple of ${t}`, `${t} Temple Wardens`],
  commune: t => [`${t} Workers' Commune`, `${t} People's Militia`], syndicate: (t, n) => [`The ${n} Syndicate`, `Syndicate enforcers`],
};

const cache = new Map();
export function getPolity(planet, s) {
  const ck = planet.seed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const rng = new Rng(derive(s.address.seed(planet.universeSeed), 'polity'));
  // the administration building nearest the centre houses Civic Security
  const offices = s.buildings.filter(b => b.type === 'office').map(b => [b, Math.hypot((b.rect[0] + b.rect[2]) / 2, (b.rect[1] + b.rect[3]) / 2)]).sort((a, c) => a[1] - c[1]);
  const soc = townSociety(planet, s), strict = rng.range(0.7, 1.5) * (soc ? soc.law : 1);      // (a junta's law is hard, a syndicate's loose)
  const named = soc ? FORMS[soc.government]?.(s.name, soc.nation.name) : null;
  const polity = {
    name: named ? named[0] : rng.pick([`${s.name} Civic Authority`, `Council of ${s.name}`, `${s.name} Municipal Board`]),
    government: soc?.govLabel || 'council', nation: soc?.nation.name || null, industry: soc?.industryLabel || null,
    security: offices[0]?.[0].key || null,
    securityName: named ? named[1] : `${s.name} Civic Security`,
    strictness: strict,
    currency: 'cr',
    // offence → base fine (credits) and whether it goes on your record
    laws: {
      forced_entry_home: { label: 'Breaking into a home', fine: Math.round(900 * strict / 10) * 10, record: true },
      forced_entry_business: { label: 'Breaking into business premises', fine: Math.round(600 * strict / 10) * 10, record: true },
      forced_entry_restricted: { label: 'Forcing a restricted door', fine: Math.round(250 * strict / 10) * 10, record: true },
      theft_home: { label: 'Theft from a home', fine: Math.round(500 * strict / 10) * 10, record: true },
      theft_business: { label: 'Theft from business premises', fine: Math.round(350 * strict / 10) * 10, record: true },
      shoplifting: { label: 'Shoplifting', fine: Math.round(150 * strict / 10) * 10, record: true },
      vehicle_theft: { label: 'Stealing a vehicle', fine: Math.round(900 * strict / 10) * 10, record: true },
      ship_theft: { label: 'Stealing a ship', fine: Math.round(6000 * strict / 10) * 10, record: true },
      assault: { label: 'Assault', fine: Math.round(800 * strict / 10) * 10, record: true },
      murder: { label: 'Murder', fine: Math.round(40000 * strict / 10) * 10, record: true },
    },
    reportRate: rng.range(0.45, 0.8),        // chance a civilian witness reports
    evidenceRate: rng.range(0.08, 0.25),     // chance an unwitnessed case gets solved
  };
  // the civic office belongs to the authority, not to whichever company the generator named
  const hq = s.buildings.find(b => b.key === polity.security);
  if (hq) hq.owner = polity.name;
  cache.set(ck, polity);
  return polity;
}

export function offenceFor(incident) {
  if (incident.type === 'assault') return incident.killed ? 'murder' : 'assault';
  if (incident.type === 'theft' && incident.ship) return 'ship_theft';
  if (incident.type === 'theft' && incident.vehicle) return 'vehicle_theft';
  if (incident.type === 'theft') return incident.shop ? 'shoplifting' : incident.buildingType === 'hab' || incident.buildingType === 'house' ? 'theft_home' : 'theft_business';
  if (incident.buildingType === 'hab' || incident.buildingType === 'house') return 'forced_entry_home';
  return incident.access === 'staff' && incident.doorKind === 'interior' ? 'forced_entry_restricted' : 'forced_entry_business';
}
